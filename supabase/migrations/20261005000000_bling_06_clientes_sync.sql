-- ═══════════════════════════════════════════════════════════
-- Integração Bling — Etapa 3, Parte B: clientes Itadog ⇄ Bling
-- - Fila de envio (bling_queue) alimentada por gatilho em clients
-- - Base comum da última sincronização (clients.bling_fiscal) para mesclar
--   só o que mudou de cada lado (sem um lado apagar a correção do outro)
-- - CPF/CNPJ obrigatório para enviar pedido à separação
-- Nada é enviado ao Bling por esta migration; o envio inicial é feito à parte.
-- Desfazer: supabase/rollback/20261005000000_bling_06_clientes_sync_down.sql
-- ═══════════════════════════════════════════════════════════

alter table public.clients  add column bling_fiscal jsonb;   -- dados fiscais na última sincronização
alter table public.clients  add column bling_error  text;    -- último erro de envio ao Bling
alter table public.profiles add column bling_vendedor_id bigint;

-- ── Fila de envio ao Bling ─────────────────────────────────
create table public.bling_queue (
  id              bigint generated always as identity primary key,
  entity          text not null,                 -- 'cliente' (depois: 'pedido')
  entity_id       text not null,
  op              text not null default 'push',
  status          text not null default 'pending'
                  check (status in ('pending', 'processing', 'done', 'error', 'skipped')),
  attempts        int  not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Um único job aberto por registro (evita duplicidade)
create unique index bling_queue_open_uidx on public.bling_queue (entity, entity_id, op)
  where status in ('pending', 'processing');
create index bling_queue_next_idx on public.bling_queue (status, next_attempt_at);

create trigger bling_queue_updated_at
  before update on public.bling_queue
  for each row execute function public.set_updated_at();

alter table public.bling_queue enable row level security;
create policy bling_queue_admin_select on public.bling_queue for select using (public.is_admin());

-- Trava genérica (um processador por vez)
create table public.bling_locks (
  name         text primary key,
  locked_until timestamptz
);
alter table public.bling_locks enable row level security;

create or replace function public.bling_try_lock(p_name text, p_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  insert into public.bling_locks (name, locked_until) values (p_name, null) on conflict do nothing;
  update public.bling_locks
     set locked_until = now() + make_interval(secs => p_seconds)
   where name = p_name and (locked_until is null or locked_until < now())
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.bling_release_lock(p_name text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.bling_locks set locked_until = null where name = p_name;
$$;

-- Pega até p_limit jobs prontos e marca como "processing"
create or replace function public.bling_claim_jobs(p_limit int default 20)
returns setof public.bling_queue
language sql
security definer
set search_path = ''
as $$
  update public.bling_queue q
     set status = 'processing', attempts = q.attempts + 1
   where q.id in (
     select id from public.bling_queue
      where status = 'pending' and next_attempt_at <= now()
      order by id
      limit p_limit
      for update skip locked
   )
  returning q.*;
$$;

-- Enfileira e acorda o processador (assíncrono, não trava quem salvou)
create or replace function public.bling_enqueue(p_entity text, p_entity_id text, p_op text default 'push')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.bling_queue (entity, entity_id, op)
  values (p_entity, p_entity_id, p_op)
  on conflict (entity, entity_id, op) where status in ('pending', 'processing') do nothing;

  if exists (select 1 from public.bling_connection where id = 1 and status = 'connected') then
    perform public.bling_run_job('queue');
  end if;
end;
$$;

revoke all on function public.bling_try_lock(text, int)          from public, anon, authenticated;
revoke all on function public.bling_release_lock(text)           from public, anon, authenticated;
revoke all on function public.bling_claim_jobs(int)              from public, anon, authenticated;
revoke all on function public.bling_enqueue(text, text, text)    from public, anon, authenticated;
grant execute on function public.bling_try_lock(text, int)       to service_role;
grant execute on function public.bling_release_lock(text)        to service_role;
grant execute on function public.bling_claim_jobs(int)           to service_role;
grant execute on function public.bling_enqueue(text, text, text) to service_role;

-- ── Gatilho: cliente com CPF/CNPJ criado ou com dado fiscal alterado → fila ─
create or replace function public.clients_bling_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(regexp_replace(coalesce(new.cnpj, new.cpf, ''), '\D', '', 'g'), '') is null then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.name               is distinct from old.name
     or new.trade_name         is distinct from old.trade_name
     or new.cnpj               is distinct from old.cnpj
     or new.cpf                is distinct from old.cpf
     or new.state_registration is distinct from old.state_registration
     or new.email              is distinct from old.email
     or new.phone              is distinct from old.phone
     or new.address            is distinct from old.address
     or new.rep_id             is distinct from old.rep_id then
    perform public.bling_enqueue('cliente', new.id, 'push');
  end if;
  return new;
end;
$$;

create trigger clients_bling_sync
  after insert or update on public.clients
  for each row execute function public.clients_bling_enqueue();

-- ── CPF/CNPJ obrigatório para enviar pedido à separação ────
create or replace function public.orders_require_client_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending_separation' and old.status is distinct from new.status
     and not exists (
       select 1 from public.clients c
        where c.id = new.client_id
          and nullif(regexp_replace(coalesce(c.cnpj, c.cpf, ''), '\D', '', 'g'), '') is not null
     ) then
    raise exception 'Cliente sem CPF/CNPJ: complete o cadastro do cliente antes de enviar o pedido para separação.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger orders_require_client_document
  before update of status on public.orders
  for each row execute function public.orders_require_client_document();

-- ── Botão "Enviar pendentes" (admin): reenfileira clientes com documento
--    que ainda não estão no Bling ou que deram erro ────────────────────────
create or replace function public.bling_retry_clients()
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
    select id from public.clients
     where nullif(regexp_replace(coalesce(cnpj, cpf, ''), '\D', '', 'g'), '') is not null
       and (bling_contact_id is null or bling_error is not null)
  loop
    insert into public.bling_queue (entity, entity_id, op)
    values ('cliente', r.id, 'push')
    on conflict (entity, entity_id, op) where status in ('pending', 'processing') do nothing;
    v_count := v_count + 1;
  end loop;
  if v_count > 0 then
    perform public.bling_run_job('queue');
  end if;
  return v_count;
end;
$$;

revoke all on function public.bling_retry_clients() from public, anon;
grant execute on function public.bling_retry_clients() to authenticated;

-- ── Painel e agendamentos ──────────────────────────────────
insert into public.bling_syncs (id, entity, status, total, synced, errors)
values ('clientes', 'clientes', 'pendente', 0, 0, 0)
on conflict (id) do nothing;

-- Processa a fila a cada 5 min (o gatilho já acorda na hora; isto é a rede de segurança)
select cron.schedule('bling-queue', '*/5 * * * *', $$select public.bling_run_job('queue')$$);
-- Traz correções fiscais feitas no Bling a cada 30 min
select cron.schedule('bling-clients-pull', '10,40 * * * *', $$select public.bling_run_job('clients_pull')$$);
