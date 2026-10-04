-- Desfaz a Etapa 4 (20261005030000_bling_08_pedidos.sql).
-- Pedidos já criados no Bling continuam lá.

drop trigger if exists orders_bling_sync on public.orders;
drop function if exists public.orders_bling_enqueue();
drop function if exists public.bling_send_order(text);
drop function if exists public.bling_send_open_orders();
delete from public.bling_syncs where id = 'pedidos';

-- Volta a fila para a cada 5 min e o enqueue de 3 parâmetros
select cron.unschedule('bling-queue');
select cron.schedule('bling-queue', '*/5 * * * *', $$select public.bling_run_job('queue')$$);

drop function if exists public.bling_enqueue(text, text, text, int);
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
revoke all on function public.bling_enqueue(text, text, text) from public, anon, authenticated;
grant execute on function public.bling_enqueue(text, text, text) to service_role;

alter table public.bling_settings drop column if exists troca_natureza;
alter table public.bling_settings drop column if exists payment_methods;
alter table public.bling_settings drop column if exists orders_auto_enabled;
alter table public.orders drop column if exists bling_situacao;
alter table public.orders drop column if exists bling_error;
alter table public.orders drop column if exists bling_sent_at;
alter table public.orders drop column if exists bling_order_number;
