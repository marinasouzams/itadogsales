-- ═══════════════════════════════════════════════════════════
-- Integração Bling — pedido que deu erro no envio é reenviado sozinho
-- quando for corrigido no Itadog (ex.: forma de pagamento preenchida).
-- Desfazer: reaplicar a função orders_bling_enqueue de 20261005030000_bling_08_pedidos.sql
-- ═══════════════════════════════════════════════════════════

create or replace function public.orders_bling_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auto boolean;
  v_changed boolean;
begin
  -- Exclusão/cancelamento de pedido já enviado → cancela no Bling
  if new.bling_order_id is not null
     and (coalesce(new.is_deleted, false) and not coalesce(old.is_deleted, false)
          or (new.status = 'cancelado' and old.status is distinct from 'cancelado')) then
    perform public.bling_enqueue('pedido', new.id, 'cancel');
    return new;
  end if;

  if coalesce(new.is_deleted, false) then
    return new;
  end if;

  v_changed := new.items          is distinct from old.items
            or new.total          is distinct from old.total
            or new.discount       is distinct from old.discount
            or new.notes          is distinct from old.notes
            or new.payment_terms  is distinct from old.payment_terms
            or new.payment_method is distinct from old.payment_method
            or new.checks         is distinct from old.checks
            or new.client_id      is distinct from old.client_id
            or new.rep_id         is distinct from old.rep_id
            or new.delivery_date  is distinct from old.delivery_date
            or new.sale_date      is distinct from old.sale_date;

  -- Já no Bling e alterado no Itadog → reenvia (o Bling recusa se já tiver nota)
  if new.bling_order_id is not null and v_changed then
    perform public.bling_enqueue('pedido', new.id, 'push', 30);
    return new;
  end if;

  -- Deu erro no envio e foi corrigido no Itadog → tenta de novo
  if new.bling_order_id is null and new.bling_error is not null and v_changed then
    perform public.bling_enqueue('pedido', new.id, 'push', 30);
    return new;
  end if;

  -- Enviado para separação → vai para o Bling (se o envio automático estiver ligado)
  if new.bling_order_id is null
     and new.status = 'pending_separation' and old.status is distinct from new.status then
    select orders_auto_enabled into v_auto from public.bling_settings where id = 1;
    if coalesce(v_auto, false) then
      perform public.bling_enqueue('pedido', new.id, 'push', 60);
    end if;
  end if;
  return new;
end;
$$;
