-- Desfaz a Etapa 2, Parte C (20261004220000_bling_04_produtos_sync.sql).
-- Observação: preços/nomes/estoque já atualizados pelo Bling NÃO voltam automaticamente;
-- os valores anteriores ficam registrados em bling_sync_log (action = 'apply').

select cron.unschedule('bling-products-sync')
where exists (select 1 from cron.job where jobname = 'bling-products-sync');

delete from public.bling_syncs where id = 'produtos';
drop function if exists public.bling_apply_products();
drop view if exists public.bling_products_compare;
drop table if exists public.bling_settings;
alter table public.products drop column if exists bling_synced_at;
-- O preço com 3 casas decimais é mantido (voltar para 2 casas arredondaria o kit).
