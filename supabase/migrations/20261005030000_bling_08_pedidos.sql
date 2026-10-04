-- ═══════════════════════════════════════════════════════════
-- Integração Bling — Etapa 4: pedidos Itadog → Bling
-- - Envio ao mandar para separação (só quando o envio automático estiver LIGADO)
-- - Edição reenviada enquanto não houver nota; exclusão no Itadog cancela no Bling
-- - Envio manual pelo admin (teste) e "enviar pedidos em aberto"
-- Desfazer: supabase/rollback/20261005030000_bling_08_pedidos_down.sql
-- ═══════════════════════════════════════════════════════════

alter table public.orders add column bling_order_number text;
alter table public.orders add column bling_sent_at      timestamptz;
alter table public.orders add column bling_error        text;
alter table public.orders add column bling_situacao     text;

alter table public.bling_settings add column orders_auto_enabled boolean not null default false;
alter table public.bling_settings add column payment_methods jsonb not null default
  '{"Boleto": 11154982, "Cheque": 9999406, "Dinheiro": 9999404, "PIX": 9999410, "Transferência": 11154983}'::jsonb;
alter table public.bling_settings add column troca_natureza text not null default 'Troca';

-- Enfileirar com atraso opcional (dá tempo do app gerar o financeiro antes do envio)
drop function if exists public.bling_enqueue(text, text, text);
create or replace function public.bling_enqueue(
  p_entity text, p_entity_id text, p_op text default 'push', p_delay_seconds int default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.bling_queue (entity, entity_id, op, next_attempt_at)
  values (p_entity, p_entity_id, p_op, now() + make_interval(secs => p_delay_seconds))
  on conflict (entity, entity_id, op) where status in ('pending', 'processing') do nothing;

  if p_delay_seconds = 0 and exists (select 1 from public.bling_connection where id = 1 and status = 'connected') then
    perform public.bling_run_job('queue');
  end if;
end;
$$;
revoke all on function public.bling_enqueue(text, text, text, int) from public, anon, authenticated;
grant execute on function public.bling_enqueue(text, text, text, int) to service_role;

-- Fila passa a rodar a cada minuto (atrasos curtos são respeitados)
select cron.unschedule('bling-queue');
select cron.schedule('bling-queue', '* * * * *', $$select public.bling_run_job('queue')
  where exists (select 1 from public.bling_queue where status = 'pending' and next_attempt_at <= now())$$);

-- ── Gatilho em pedidos ─────────────────────────────────────
create or replace function public.orders_bling_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auto boolean;
begin
  -- Exclusão/cancelamento de pedido já enviado → cancela no Bling
  if new.bling_order_id is not null
     and (coalesce(new.is_deleted, false) and not coalesce(old.is_deleted, false)
          or (new.status = 'cancelado' and old.status is distinct from 'cancelado')) then
    perform public.bling_enqueue('pedido', new.id, 'cancel');
    return new;
  end if;

  if coalesce(new.is_deleted, false) then
    return new;
  end if;

  -- Pedido já no Bling e alterado no Itadog → reenvia (o Bling recusa se já tiver nota)
  if new.bling_order_id is not null and (
       new.items          is distinct from old.items
    or new.total          is distinct from old.total
    or new.discount       is distinct from old.discount
    or new.notes          is distinct from old.notes
    or new.payment_terms  is distinct from old.payment_terms
    or new.payment_method is distinct from old.payment_method
    or new.checks         is distinct from old.checks
    or new.client_id      is distinct from old.client_id
    or new.rep_id         is distinct from old.rep_id
    or new.delivery_date  is distinct from old.delivery_date
    or new.sale_date      is distinct from old.sale_date
  ) then
    perform public.bling_enqueue('pedido', new.id, 'push', 30);
    return new;
  end if;

  -- Enviado para separação → vai para o Bling (se o envio automático estiver ligado)
  if new.bling_order_id is null
     and new.status = 'pending_separation' and old.status is distinct from new.status then
    select orders_auto_enabled into v_auto from public.bling_settings where id = 1;
    if coalesce(v_auto, false) then
      perform public.bling_enqueue('pedido', new.id, 'push', 60);
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_bling_sync
  after update on public.orders
  for each row execute function public.orders_bling_enqueue();

-- ── Ações do admin ─────────────────────────────────────────
create or replace function public.bling_send_order(p_order_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;
  update public.orders set bling_error = null where id = p_order_id;
  perform public.bling_enqueue('pedido', p_order_id, 'push');
end;
$$;

-- Envia os pedidos em aberto (separação em diante, ainda não entregues) que não estão no Bling
create or replace function public.bling_send_open_orders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int := 0;
  r record;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores.' using errcode = '42501';
  end if;
  for r in
    select id from public.orders
     where not coalesce(is_deleted, false)
       and bling_order_id is null
       and status in ('pending_separation', 'separation', 'invoiced_ready_to_ship')
  loop
    insert into public.bling_queue (entity, entity_id, op)
    values ('pedido', r.id, 'push')
    on conflict (entity, entity_id, op) where status in ('pending', 'processing') do nothing;
    v_count := v_count + 1;
  end loop;
  if v_count > 0 then
    perform public.bling_run_job('queue');
  end if;
  return v_count;
end;
$$;

revoke all on function public.bling_send_order(text)     from public, anon;
revoke all on function public.bling_send_open_orders()   from public, anon;
grant execute on function public.bling_send_order(text)   to authenticated;
grant execute on function public.bling_send_open_orders() to authenticated;

-- Admin liga/desliga o envio automático e ajusta formas de pagamento (já coberto pela política de update)

insert into public.bling_syncs (id, entity, status, total, synced, errors)
values ('pedidos', 'pedidos', 'pendente', 0, 0, 0)
on conflict (id) do nothing;
