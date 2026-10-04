-- Desfaz alertas e limpeza da integração Bling (20261005060000_bling_11_alertas.sql).
select cron.unschedule('bling-cleanup') where exists (select 1 from cron.job where jobname = 'bling-cleanup');
drop function if exists public.bling_cleanup();
drop trigger if exists bling_connection_notify on public.bling_connection;
drop function if exists public.bling_notify_connection();
drop trigger if exists bling_sync_log_notify on public.bling_sync_log;
drop function if exists public.bling_notify_error();
