-- ═══════════════════════════════════════════════════════════
-- Integração Bling — Etapa 1: conexão OAuth
-- Só acrescenta objetos novos; não altera tabelas existentes.
-- Desfazer: supabase/rollback/20261004160000_bling_01_conexao_down.sql
-- ═══════════════════════════════════════════════════════════

-- ── Situação da conexão (sem segredos) ─────────────────────
create table public.bling_connection (
  id                 int primary key default 1 check (id = 1),
  status             text not null default 'disconnected'
                     check (status in ('disconnected', 'connected', 'error')),
  company_id         text,
  company_name       text,
  company_cnpj       text,
  connected_at       timestamptz,
  connected_by       uuid references public.profiles(id),
  access_expires_at  timestamptz,
  refresh_expires_at timestamptz,
  last_refresh_at    timestamptz,
  last_check_at      timestamptz,
  last_error         text,
  refresh_lock_until timestamptz,
  updated_at         timestamptz not null default now()
);

insert into public.bling_connection (id) values (1);

create trigger bling_connection_updated_at
  before update on public.bling_connection
  for each row execute function public.set_updated_at();

alter table public.bling_connection enable row level security;
create policy bling_connection_admin_select on public.bling_connection
  for select using (public.is_admin());
-- Sem políticas de escrita: só o servidor (service_role) altera.

-- ── Estados do OAuth (proteção contra CSRF) ────────────────
create table public.bling_oauth_states (
  state      text primary key,
  created_by uuid not null references public.profiles(id),
  return_to  text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);

alter table public.bling_oauth_states enable row level security;
-- Sem políticas: acesso apenas pelo servidor.

-- ── Registro de atividades da integração ───────────────────
create table public.bling_sync_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  level       text not null default 'info' check (level in ('info', 'warn', 'error')),
  entity      text not null,
  action      text not null,
  message     text,
  http_status int,
  local_id    text,
  bling_id    text,
  details     jsonb
);

create index bling_sync_log_created_at_idx on public.bling_sync_log (created_at desc);

alter table public.bling_sync_log enable row level security;
create policy bling_sync_log_admin_select on public.bling_sync_log
  for select using (public.is_admin());

-- ── Tokens no Vault (lidos/gravados só pelo servidor) ──────
create or replace function public.bling_get_tokens()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'bling_tokens';
  return v_secret::jsonb;
end;
$$;

create or replace function public.bling_save_tokens(p_tokens jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'bling_tokens';
  if v_id is null then
    perform vault.create_secret(p_tokens::text, 'bling_tokens', 'Tokens OAuth do Bling (Itadog Sales)');
  else
    perform vault.update_secret(v_id, p_tokens::text);
  end if;
end;
$$;

create or replace function public.bling_clear_tokens()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where name = 'bling_tokens';
end;
$$;

-- Trava de renovação: só um processo renova o token por vez
-- (o Bling invalida o refresh token antigo e bloqueia o IP após 20 chamadas/min).
create or replace function public.bling_try_refresh_lock(p_seconds int default 30)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  update public.bling_connection
     set refresh_lock_until = now() + make_interval(secs => p_seconds)
   where id = 1
     and (refresh_lock_until is null or refresh_lock_until < now())
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

create or replace function public.bling_release_refresh_lock()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.bling_connection set refresh_lock_until = null where id = 1;
$$;

revoke all on function public.bling_get_tokens()              from public, anon, authenticated;
revoke all on function public.bling_save_tokens(jsonb)         from public, anon, authenticated;
revoke all on function public.bling_clear_tokens()             from public, anon, authenticated;
revoke all on function public.bling_try_refresh_lock(int)      from public, anon, authenticated;
revoke all on function public.bling_release_refresh_lock()     from public, anon, authenticated;
grant execute on function public.bling_get_tokens()            to service_role;
grant execute on function public.bling_save_tokens(jsonb)      to service_role;
grant execute on function public.bling_clear_tokens()          to service_role;
grant execute on function public.bling_try_refresh_lock(int)   to service_role;
grant execute on function public.bling_release_refresh_lock()  to service_role;
