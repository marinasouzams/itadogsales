-- ═══════════════════════════════════════════════════════════
-- Integração Bling — Etapa 2, Parte B: liga produtos do Itadog aos do Bling
-- - Casamento pelo código sem "O"/"0" à esquerda (O78 ↔ 78, O15 ↔ 015)
-- - Ignora produtos excluídos no Bling (situacao 'E')
-- - Itadog passa a usar exatamente o código do Bling
-- Preços, estoque, nomes e categorias NÃO mudam.
-- Desfazer: supabase/rollback/20261004210000_bling_03_produtos_vinculo_down.sql
-- ═══════════════════════════════════════════════════════════

-- Cópia de segurança: valores anteriores e novos de cada produto ligado
create table public.bling_product_link_backup (
  product_id   text primary key references public.products(id),
  old_code     text,
  old_bling_id text,
  new_code     text not null,
  new_bling_id text not null,
  created_at   timestamptz not null default now()
);

alter table public.bling_product_link_backup enable row level security;
-- Sem políticas: acesso apenas pelo servidor.

create unique index products_bling_id_uidx on public.products (bling_id) where bling_id is not null;

insert into public.bling_product_link_backup (product_id, old_code, old_bling_id, new_code, new_bling_id)
with i as (
  select id, code, bling_id, nullif(regexp_replace(upper(trim(code)), '^[O0]+', ''), '') as k
  from public.products
), b as (
  select bling_id, codigo, nullif(regexp_replace(upper(trim(codigo)), '^[O0]+', ''), '') as k
  from public.bling_products
  where situacao <> 'E' and parent_bling_id is null
)
select i.id, i.code, i.bling_id, b.codigo, b.bling_id::text
from i join b on i.k = b.k;

update public.products p
   set bling_id = b.new_bling_id,
       code     = b.new_code
  from public.bling_product_link_backup b
 where b.product_id = p.id;

insert into public.bling_sync_log (entity, action, message, details)
select 'produtos', 'link',
       format('Produtos ligados ao Bling: %s (códigos atualizados: %s)',
              count(*), count(*) filter (where old_code is distinct from new_code)),
       jsonb_build_object('ligados', count(*), 'codigos_atualizados', count(*) filter (where old_code is distinct from new_code))
from public.bling_product_link_backup;
