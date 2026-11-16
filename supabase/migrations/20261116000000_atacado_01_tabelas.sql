-- ═══════════════════════════════════════════════════════════
-- Atacado — pedidos feitos direto no Bling, lidos pelo Itadog (somente leitura)
-- - clients.channel: varejo | atacado | ambos
-- - wholesale_orders / wholesale_order_items: espelho dos pedidos de atacado do Bling
-- - Meta mensal do atacado em company_settings.wholesale_goal
-- - Cliente de atacado não volta para o Bling pela fila de clientes
-- (aplicado em produção como atacado_00_enum_entidade + atacado_01_tabelas)
-- ═══════════════════════════════════════════════════════════
alter type public.bling_entity_type add value if not exists 'atacado';

alter table public.clients add column if not exists channel text not null default 'varejo'
  check (channel in ('varejo', 'atacado', 'ambos'));
create index if not exists clients_channel_idx on public.clients (channel);

alter table public.company_settings add column if not exists wholesale_goal numeric not null default 10000;

create table public.wholesale_orders (
  bling_id          bigint primary key,
  number            text not null,
  client_id         text references public.clients(id) on delete set null,
  client_name       text,
  client_cnpj       text,
  client_city       text,
  sale_date         date not null,
  total             numeric not null default 0,
  products_total    numeric not null default 0,
  discount          numeric not null default 0,
  freight           numeric not null default 0,
  status            text not null default 'ativo' check (status in ('ativo', 'cancelado', 'rascunho')),
  bling_situacao_id integer,
  bling_situacao    text,
  nfe_id            bigint,
  nfe_number        text,
  nfe_status        text,
  nfe_issued_at     timestamptz,
  nfe_pdf_url       text,
  nfe_danfe_url     text,
  installments      jsonb not null default '[]'::jsonb,
  notes             text,
  items_count       integer not null default 0,
  ignored           boolean not null default false,
  ignore_reason     text,
  synced_at         timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create index wholesale_orders_date_idx   on public.wholesale_orders (sale_date desc);
create index wholesale_orders_client_idx on public.wholesale_orders (client_id);

create table public.wholesale_order_items (
  id               bigint generated always as identity primary key,
  order_bling_id   bigint not null references public.wholesale_orders(bling_id) on delete cascade,
  line             integer not null,
  product_bling_id bigint,
  product_id       text references public.products(id) on delete set null,
  code             text,
  description      text not null,
  unit             text,
  quantity         numeric not null default 0,
  unit_price       numeric not null default 0,
  discount         numeric not null default 0,
  total            numeric not null default 0
);
create index wholesale_items_order_idx   on public.wholesale_order_items (order_bling_id);
create index wholesale_items_product_idx on public.wholesale_order_items (product_bling_id);

alter table public.wholesale_orders      enable row level security;
alter table public.wholesale_order_items enable row level security;
create policy wholesale_orders_admin_select on public.wholesale_orders      for select using (public.is_admin());
create policy wholesale_items_admin_select  on public.wholesale_order_items for select using (public.is_admin());

-- clients_bling_enqueue(): ignora cliente com channel = 'atacado' (ver função em produção)

insert into public.bling_syncs (id, entity, status, total, synced, errors)
values ('atacado', 'atacado', 'pendente', 0, 0, 0)
on conflict (id) do nothing;
