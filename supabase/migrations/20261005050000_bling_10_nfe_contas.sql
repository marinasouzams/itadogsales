-- ═══════════════════════════════════════════════════════════
-- Integração Bling — Etapa 5: nota fiscal e contas a receber Bling → Itadog
-- - Dados da NF-e no pedido (número, chave, PDF); NF autorizada → pedido faturado
-- - Parcelas ligadas às contas a receber do Bling (link do boleto/PIX)
-- - Baixa automática quando o Bling registra o pagamento
-- Desfazer: supabase/rollback/20261005050000_bling_10_nfe_contas_down.sql
-- ═══════════════════════════════════════════════════════════

alter table public.orders add column bling_nfe_id   bigint;
alter table public.orders add column nfe_number     text;
alter table public.orders add column nfe_series     text;
alter table public.orders add column nfe_key        text;
alter table public.orders add column nfe_status     text;
alter table public.orders add column nfe_issued_at  timestamptz;
alter table public.orders add column nfe_pdf_url    text;
alter table public.orders add column nfe_danfe_url  text;

alter table public.financial_receivables add column bling_conta_id  bigint;
alter table public.financial_receivables add column bling_situacao  text;
alter table public.financial_receivables add column boleto_url      text;
alter table public.financial_receivables add column pix_url         text;
alter table public.financial_receivables add column bling_synced_at timestamptz;
create unique index financial_receivables_bling_conta_uidx
  on public.financial_receivables (bling_conta_id) where bling_conta_id is not null;

insert into public.bling_syncs (id, entity, status, total, synced, errors)
values ('financeiro', 'financeiro', 'pendente', 0, 0, 0)
on conflict (id) do nothing;

-- Chama uma Edge Function da integração (usado pelo pg_cron)
create or replace function public.bling_run_function(p_function text, p_body jsonb default '{}'::jsonb)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url     := 'https://hkmkqrwrtnmukludiavv.supabase.co/functions/v1/' || p_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-bling-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bling_cron_secret')
    ),
    body    := p_body,
    timeout_milliseconds := 150000
  );
$$;
revoke all on function public.bling_run_function(text, jsonb) from public, anon, authenticated;

-- Busca notas, boletos e pagamentos a cada 10 minutos (função bling-nfe)
select cron.schedule('bling-orders-pull', '*/10 * * * *', $$select public.bling_run_function('bling-nfe')$$);
