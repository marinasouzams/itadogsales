-- ═══════════════════════════════════════════════════════════
-- Integração Bling — Etapa 2, Parte C: atualização automática de produtos
-- Bling → Itadog: nome, situação (ativo/inativo), estoque e — quando ligado — preço.
-- Categorias, atributos e dados de kit continuam só no Itadog.
-- Desfazer: supabase/rollback/20261004220000_bling_04_produtos_sync_down.sql
-- ═══════════════════════════════════════════════════════════

-- Kit (ex.: R$ 149,99 ÷ 10 pagos = 14,999) precisa de 3 casas para não perder centavo
alter table public.products alter column price type numeric(12, 3);
alter table public.products add column bling_synced_at timestamptz;

-- ── Configurações da integração ────────────────────────────
create table public.bling_settings (
  id                 int primary key default 1 check (id = 1),
  price_sync_enabled boolean not null default false,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles(id)
);

insert into public.bling_settings (id) values (1);

create trigger bling_settings_updated_at
  before update on public.bling_settings
  for each row execute function public.set_updated_at();

alter table public.bling_settings enable row level security;
create policy bling_settings_admin_select on public.bling_settings for select using (public.is_admin());
create policy bling_settings_admin_update on public.bling_settings for update using (public.is_admin()) with check (public.is_admin());

-- ── Comparação Itadog × Bling (tela de Sincronização) ──────
create view public.bling_products_compare
with (security_invoker = true) as
select
  p.id                as product_id,
  p.code,
  p.name,
  p.active,
  p.product_type,
  p.bling_id,
  -- preço comparável ao do Bling: kit = preço unitário × unidades pagas
  round(p.price * case when p.product_type = 'kit_promocional' then p.kit_paid_qty else 1 end, 2) as itadog_price,
  b.preco             as bling_price,
  b.nome              as bling_name,
  b.situacao          as bling_situacao,
  b.estoque_virtual   as bling_stock
from public.products p
left join public.bling_products b on b.bling_id::text = p.bling_id;

-- ── Aplica a cópia do Bling (bling_products) nos produtos do Itadog ─
create or replace function public.bling_apply_products()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price_enabled boolean;
  v_linked        int := 0;
  v_updated       int := 0;
  v_created       int := 0;
  v_deactivated   int := 0;
  v_price_changes jsonb;
  v_name_changes  jsonb;
begin
  select price_sync_enabled into v_price_enabled from public.bling_settings where id = 1;

  -- 1) Liga produtos novos pelo código (sem O/0 à esquerda) e adota o código do Bling
  with b as (
    select bling_id, codigo, nullif(regexp_replace(upper(trim(codigo)), '^[O0]+', ''), '') as k
    from public.bling_products
    where situacao <> 'E' and parent_bling_id is null
      and not exists (select 1 from public.products x where x.bling_id = bling_products.bling_id::text)
  ), m as (
    select p.id, b.bling_id, b.codigo
    from public.products p
    join b on b.k = nullif(regexp_replace(upper(trim(p.code)), '^[O0]+', ''), '')
    where p.bling_id is null
  )
  update public.products p
     set bling_id = m.bling_id::text, code = m.codigo
    from m
   where m.id = p.id;
  get diagnostics v_linked = row_count;

  -- 2) Registra mudanças de preço (antes de aplicar)
  select coalesce(jsonb_agg(jsonb_build_object('codigo', p.code, 'produto', p.name, 'de', p.price, 'para', np.new_price)), '[]'::jsonb)
    into v_price_changes
    from public.products p
    join public.bling_products b on b.bling_id::text = p.bling_id
    cross join lateral (
      select round(b.preco / case when p.product_type = 'kit_promocional' then greatest(p.kit_paid_qty, 1) else 1 end, 3) as new_price
    ) np
   where v_price_enabled and b.preco is not null and p.price <> np.new_price;

  select coalesce(jsonb_agg(jsonb_build_object('codigo', p.code, 'de', p.name, 'para', b.nome)), '[]'::jsonb)
    into v_name_changes
    from public.products p
    join public.bling_products b on b.bling_id::text = p.bling_id
   where p.name is distinct from b.nome;

  -- 3) Atualiza produtos ligados: nome, ativo, estoque e (se ligado) preço
  update public.products p
     set name   = b.nome,
         active = (b.situacao = 'A'),
         stock  = greatest(floor(coalesce(b.estoque_virtual, 0)), 0)::int,
         price  = case
                    when v_price_enabled and b.preco is not null
                      then round(b.preco / case when p.product_type = 'kit_promocional' then greatest(p.kit_paid_qty, 1) else 1 end, 3)
                    else p.price
                  end,
         bling_synced_at = now()
    from public.bling_products b
   where b.bling_id::text = p.bling_id
     and (
          p.name is distinct from b.nome
       or p.active is distinct from (b.situacao = 'A')
       or p.stock is distinct from greatest(floor(coalesce(b.estoque_virtual, 0)), 0)::int
       or (v_price_enabled and b.preco is not null and p.price is distinct from
             round(b.preco / case when p.product_type = 'kit_promocional' then greatest(p.kit_paid_qty, 1) else 1 end, 3))
     );
  get diagnostics v_updated = row_count;

  -- 4) Produto ligado que sumiu do Bling → inativo no Itadog
  --    Trava: só desativa se a cópia do Bling parecer completa (≥ 90% dos ligados encontrados)
  if (select count(*) from public.products p
       where p.bling_id is not null
         and exists (select 1 from public.bling_products b where b.bling_id::text = p.bling_id))
     >= 0.9 * (select count(*) from public.products where bling_id is not null) then
    update public.products p
       set active = false, bling_synced_at = now()
     where p.bling_id is not null and p.active
       and not exists (select 1 from public.bling_products b where b.bling_id::text = p.bling_id);
    get diagnostics v_deactivated = row_count;
  end if;

  -- 5) Produto ativo no Bling que não existe no Itadog → cria INATIVO para revisão
  insert into public.products (code, name, price, unit, stock, bling_id, active, bling_synced_at)
  select b.codigo, b.nome, coalesce(b.preco, 0), coalesce(lower(b.unidade), 'un'),
         greatest(floor(coalesce(b.estoque_virtual, 0)), 0)::int, b.bling_id::text, false, now()
    from public.bling_products b
   where b.situacao = 'A' and b.parent_bling_id is null and b.codigo is not null
     and not exists (select 1 from public.products p where p.bling_id = b.bling_id::text)
     and not exists (select 1 from public.products p where p.code = b.codigo);
  get diagnostics v_created = row_count;

  return jsonb_build_object(
    'ligados', v_linked,
    'atualizados', v_updated,
    'criados_inativos', v_created,
    'desativados', v_deactivated,
    'precos_ativos', v_price_enabled,
    'mudancas_preco', v_price_changes,
    'mudancas_nome', v_name_changes
  );
end;
$$;

revoke all on function public.bling_apply_products() from public, anon, authenticated;
grant execute on function public.bling_apply_products() to service_role;

-- ── Painel de sincronização (tabela já existente bling_syncs) ─
insert into public.bling_syncs (id, entity, status, total, synced, errors)
values ('produtos', 'produtos', 'pendente', 0, 0, 0)
on conflict (id) do nothing;

-- ── Agendamento: a cada 30 minutos ─────────────────────────
select cron.schedule('bling-products-sync', '*/30 * * * *', $$select public.bling_run_job('products_sync')$$);
