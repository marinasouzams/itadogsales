-- ═══════════════════════════════════════════════════════════
-- Integração Bling — webhooks (atualização quase em tempo real)
-- - bling_inbox: eventos recebidos (o mesmo evento nunca é processado duas vezes)
-- - Avisos agrupados: cada tipo roda no máximo ~1x por minuto, 20 s após o último aviso
-- Desfazer: supabase/rollback/20261005070000_bling_12_webhooks_down.sql
-- ═══════════════════════════════════════════════════════════

create table public.bling_inbox (
  event_id    text primary key,
  event       text not null,           -- ex.: invoice.updated, order.updated, product.updated
  company_id  text,
  payload     jsonb,
  received_at timestamptz not null default now()
);
create index bling_inbox_received_idx on public.bling_inbox (received_at desc);

alter table public.bling_inbox enable row level security;
create policy bling_inbox_admin_select on public.bling_inbox for select using (public.is_admin());

-- Atualizações pendentes disparadas por webhook (uma linha por tipo)
create table public.bling_webhook_pending (
  kind   text primary key,             -- 'produtos' | 'pedidos'
  due_at timestamptz not null
);
alter table public.bling_webhook_pending enable row level security;

-- Chamado pela função bling-webhook: agenda a atualização (agrupa avisos em sequência)
create or replace function public.bling_webhook_dispatch(p_kind text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.bling_webhook_pending (kind, due_at)
  values (p_kind, now() + interval '20 seconds')
  on conflict (kind) do update set due_at = now() + interval '20 seconds';
$$;
revoke all on function public.bling_webhook_dispatch(text) from public, anon, authenticated;
grant execute on function public.bling_webhook_dispatch(text) to service_role;

-- Roda as atualizações vencidas (pg_cron a cada minuto)
create or replace function public.bling_webhook_run_due()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in delete from public.bling_webhook_pending where due_at <= now() returning kind loop
    if r.kind = 'produtos' then
      perform public.bling_run_job('products_sync');
    elsif r.kind = 'pedidos' then
      perform public.bling_run_function('bling-nfe');
    end if;
  end loop;
end;
$$;
revoke all on function public.bling_webhook_run_due() from public, anon, authenticated;

select cron.schedule('bling-webhook-dispatch', '* * * * *', $$select public.bling_webhook_run_due()$$);

-- Eventos antigos saem na limpeza diária
create or replace function public.bling_cleanup()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.bling_sync_log where level <> 'error' and created_at < now() - interval '90 days';
  delete from public.bling_sync_log where level = 'error' and created_at < now() - interval '180 days';
  delete from public.bling_queue where status in ('done', 'skipped') and updated_at < now() - interval '30 days';
  delete from public.bling_oauth_states where expires_at < now();
  delete from public.bling_inbox where received_at < now() - interval '30 days';
$$;
