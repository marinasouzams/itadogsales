-- ═══════════════════════════════════════════════════════════
-- Pago Parcial: como a entrada foi paga e como será pago o restante
-- (o Bling precisa da forma de pagamento de cada parcela).
-- Pedido já no Bling é reenviado quando a entrada ou essas formas mudam.
-- Desfazer: supabase/rollback/20261005080000_pago_parcial_formas_down.sql
-- ═══════════════════════════════════════════════════════════

alter table public.orders
  add column if not exists partial_payment_method text,   -- entrada: PIX | Dinheiro | Transferência | Cheque
  add column if not exists balance_payment_method text;   -- restante: Boleto | PIX | Dinheiro | Transferência | Cheque

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
            or new.sale_date      is distinct from old.sale_date
            or new.partial_payment_amount is distinct from old.partial_payment_amount
            or new.partial_payment_date   is distinct from old.partial_payment_date
            or new.partial_payment_method is distinct from old.partial_payment_method
            or new.balance_payment_method is distinct from old.balance_payment_method;

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
