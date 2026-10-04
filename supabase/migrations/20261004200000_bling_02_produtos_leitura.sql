-- ═══════════════════════════════════════════════════════════
-- Integração Bling — Etapa 2, Parte A: leitura de produtos + agendamentos
-- Só acrescenta objetos novos; não altera produtos do Itadog.
-- Desfazer: supabase/rollback/20261004200000_bling_02_produtos_leitura_down.sql
-- ═══════════════════════════════════════════════════════════

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ── Cópia dos produtos do Bling (consulta / comparação) ────
create table public.bling_products (
  bling_id        bigint primary key,
  parent_bling_id bigint,                -- preenchido nas variações (cores)
  codigo          text,
  nome            text not null,
  formato         text,                  -- S simples · V com variações · E composição
  tipo            text,                  -- P produto · S serviço
  situacao        text,                  -- A ativo · I inativo
  preco           numeric(12, 2),
  unidade         text,
  variacao_nome   text,                  -- ex.: "Cor:Azul" (só variações)
  estoque_virtual numeric(12, 3),
  raw             jsonb,
  fetched_at      timestamptz not null default now()
);

create index bling_products_parent_idx on public.bling_products (parent_bling_id);
create index bling_products_codigo_idx on public.bling_products (upper(codigo));

alter table public.bling_products enable row level security;
create policy bling_products_admin_select on public.bling_products
  for select using (public.is_admin());

-- ── Segredo das chamadas agendadas (pg_cron → Edge Function) ─
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'bling_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'bling_cron_secret',
                                'Autoriza chamadas agendadas à função bling-sync');
  end if;
end;
$$;

create or replace function public.bling_cron_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'bling_cron_secret';
$$;

revoke all on function public.bling_cron_secret() from public, anon, authenticated;
grant execute on function public.bling_cron_secret() to service_role;

-- Dispara um job na função bling-sync (usado pelo pg_cron)
create or replace function public.bling_run_job(p_job text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url     := 'https://hkmkqrwrtnmukludiavv.supabase.co/functions/v1/bling-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-bling-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bling_cron_secret')
    ),
    body    := jsonb_build_object('job', p_job),
    timeout_milliseconds := 150000
  );
$$;

revoke all on function public.bling_run_job(text) from public, anon, authenticated;

-- Renovação diária do acesso (mantém a autorização viva além dos 30 dias)
select cron.schedule('bling-token-keepalive', '15 6 * * *', $$select public.bling_run_job('token_keepalive')$$);
