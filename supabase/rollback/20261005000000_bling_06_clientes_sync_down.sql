-- Desfaz a Etapa 3, Parte B (20261005000000_bling_06_clientes_sync.sql).
-- Contatos já criados no Bling continuam lá (remova no Bling se quiser).

select cron.unschedule(jobname) from cron.job where jobname in ('bling-queue', 'bling-clients-pull');

drop trigger if exists orders_require_client_document on public.orders;
drop function if exists public.orders_require_client_document();
drop trigger if exists clients_bling_sync on public.clients;
drop function if exists public.clients_bling_enqueue();

drop function if exists public.bling_retry_clients();
drop function if exists public.bling_enqueue(text, text, text);
drop function if exists public.bling_claim_jobs(int);
drop function if exists public.bling_release_lock(text);
drop function if exists public.bling_try_lock(text, int);
drop table if exists public.bling_locks;
drop table if exists public.bling_queue;

delete from public.bling_syncs where id = 'clientes';

alter table public.profiles drop column if exists bling_vendedor_id;
alter table public.clients  drop column if exists bling_error;
alter table public.clients  drop column if exists bling_fiscal;
