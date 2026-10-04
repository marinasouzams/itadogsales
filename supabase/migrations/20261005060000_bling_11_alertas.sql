-- ═══════════════════════════════════════════════════════════
-- Integração Bling — alertas ao admin e limpeza automática
-- - Erro na integração → notificação no sino do admin (no máx. 1 por assunto por hora)
-- - Conexão com problema → notificação
-- - Limpeza diária do histórico antigo
-- Desfazer: supabase/rollback/20261005060000_bling_11_alertas_down.sql
-- ═══════════════════════════════════════════════════════════

create or replace function public.bling_notify_error()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := case new.entity
    when 'clientes'   then 'Clientes'
    when 'pedidos'    then 'Pedidos'
    when 'produtos'   then 'Produtos'
    when 'financeiro' then 'Notas e boletos'
    when 'conexao'    then 'Conexão'
    else initcap(new.entity) end;
begin
  if new.level <> 'error' then
    return new;
  end if;
  -- Evita enxurrada: um aviso por assunto a cada hora
  if exists (
    select 1 from public.notifications
     where type = 'bling_error' and entity = 'Bling ' || v_label
       and created_at > now() - interval '1 hour'
  ) then
    return new;
  end if;
  insert into public.notifications (type, title, description, entity, entity_id)
  values ('bling_error', 'Erro na integração com o Bling · ' || v_label,
          left(coalesce(new.message, 'Veja os detalhes na tela Sync Bling.'), 240),
          'Bling ' || v_label, new.local_id);
  return new;
end;
$$;

create trigger bling_sync_log_notify
  after insert on public.bling_sync_log
  for each row execute function public.bling_notify_error();

-- Conexão passou a "com problema" → aviso imediato
create or replace function public.bling_notify_connection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'error' and old.status is distinct from 'error' then
    insert into public.notifications (type, title, description, entity)
    values ('bling_error', 'Conexão com o Bling precisa de atenção',
            left(coalesce(new.last_error, 'Abra Sync Bling e clique em Reconectar.'), 240), 'Bling Conexão');
  end if;
  return new;
end;
$$;

create trigger bling_connection_notify
  after update of status on public.bling_connection
  for each row execute function public.bling_notify_connection();

-- Limpeza diária (03:30): histórico informativo > 90 dias, erros > 180 dias,
-- fila concluída > 30 dias e estados de OAuth vencidos
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
revoke all on function public.bling_cleanup() from public, anon, authenticated;

select cron.schedule('bling-cleanup', '30 3 * * *', $$select public.bling_cleanup()$$);
