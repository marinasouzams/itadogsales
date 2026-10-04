-- Desfaz 20261005080000_pago_parcial_formas.sql
-- 1) Reaplicar a função orders_bling_enqueue de 20261005040000_bling_09_pedidos_reenvio.sql
-- 2) Remover as colunas (apaga a forma da entrada/restante gravada nos pedidos)
alter table public.orders
  drop column if exists partial_payment_method,
  drop column if exists balance_payment_method;
