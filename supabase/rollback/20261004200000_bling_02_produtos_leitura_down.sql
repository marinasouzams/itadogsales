-- Desfaz a Etapa 2, Parte A da integração Bling (20261004200000_bling_02_produtos_leitura.sql).
-- As extensões pg_cron e pg_net são mantidas (podem ser usadas por outros recursos).

select cron.unschedule('bling-token-keepalive')
where exists (select 1 from cron.job where jobname = 'bling-token-keepalive');

drop function if exists public.bling_run_job(text);
drop function if exists public.bling_cron_secret();
delete from vault.secrets where name = 'bling_cron_secret';

drop table if exists public.bling_products;
