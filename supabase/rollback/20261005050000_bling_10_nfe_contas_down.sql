-- Desfaz a Etapa 5 (20261005050000_bling_10_nfe_contas.sql).
-- Baixas já registradas nas parcelas NÃO são desfeitas.

select cron.unschedule('bling-orders-pull') where exists (select 1 from cron.job where jobname = 'bling-orders-pull');
delete from public.bling_syncs where id = 'financeiro';
drop function if exists public.bling_run_function(text, jsonb);

drop index if exists public.financial_receivables_bling_conta_uidx;
alter table public.financial_receivables drop column if exists bling_synced_at;
alter table public.financial_receivables drop column if exists pix_url;
alter table public.financial_receivables drop column if exists boleto_url;
alter table public.financial_receivables drop column if exists bling_situacao;
alter table public.financial_receivables drop column if exists bling_conta_id;

alter table public.orders drop column if exists nfe_danfe_url;
alter table public.orders drop column if exists nfe_pdf_url;
alter table public.orders drop column if exists nfe_issued_at;
alter table public.orders drop column if exists nfe_status;
alter table public.orders drop column if exists nfe_key;
alter table public.orders drop column if exists nfe_series;
alter table public.orders drop column if exists nfe_number;
alter table public.orders drop column if exists bling_nfe_id;
