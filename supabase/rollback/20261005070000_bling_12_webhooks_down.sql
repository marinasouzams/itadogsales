-- Desfaz os webhooks da integração Bling (20261005070000_bling_12_webhooks.sql).
-- Lembre de remover também a configuração de webhooks no app do Bling.
select cron.unschedule('bling-webhook-dispatch') where exists (select 1 from cron.job where jobname = 'bling-webhook-dispatch');
drop function if exists public.bling_webhook_run_due();
drop function if exists public.bling_webhook_dispatch(text);
drop table if exists public.bling_webhook_pending;
drop table if exists public.bling_inbox;
-- bling_cleanup volta a não limpar bling_inbox (tabela removida): reaplicar a versão de bling_11
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
$$;
