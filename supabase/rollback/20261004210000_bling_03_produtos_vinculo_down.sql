-- Desfaz a Etapa 2, Parte B (20261004210000_bling_03_produtos_vinculo.sql):
-- devolve códigos e bling_id anteriores a partir da cópia de segurança.

drop index if exists public.products_bling_id_uidx;

update public.products p
   set code     = b.old_code,
       bling_id = b.old_bling_id
  from public.bling_product_link_backup b
 where b.product_id = p.id;

drop table if exists public.bling_product_link_backup;
