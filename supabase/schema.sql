-- ============================================================
-- ITA Dog Sales — Schema Supabase
-- Execute no SQL Editor do Supabase (em ordem)
-- ============================================================

-- ── EXTENSÕES ────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── TIPOS ENUM ───────────────────────────────────────────────
create type user_role          as enum ('admin', 'rep');
create type client_type        as enum ('fazenda','cooperativa','agropecuaria','distribuidor','revendedor');
create type client_status      as enum ('ativo','inativo','prospecto');
create type priority_level     as enum ('alta','media','baixa');
create type order_status       as enum ('rascunho','enviado','aprovado','faturado','pronto_entrega','cancelado');
create type sync_status        as enum ('pendente','sincronizando','sincronizado','erro');
create type visit_status       as enum ('agendada','em_andamento','concluida','cancelada');
create type visit_result       as enum ('positivo','negativo','neutro','reagendado');
create type prospect_status    as enum ('disponivel','assumido','convertido','descartado');
create type commission_status  as enum ('prevista','aprovada','paga','cancelada');
create type audit_action       as enum (
  'login','logout','create_order','update_order','cancel_order',
  'create_visit','checkin','checkout','update_client',
  'assume_prospect','convert_prospect','sync_bling','transfer_client'
);
create type bling_entity_type  as enum ('produtos','clientes','pedidos','estoque','tabelas');
create type bling_status       as enum ('pendente','sincronizando','sincronizado','erro');
create type interaction_type   as enum (
  'visita','checkin','checkout','pedido','orcamento',
  'rota','ligacao','whatsapp','anotacao'
);

-- ── PERFIS (espelha auth.users) ──────────────────────────────
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text        not null,
  email         text        not null,
  role          user_role   not null default 'rep',
  phone         text,
  region        text,
  territory     text[]      default '{}',
  active        boolean     not null default true,
  meta          numeric(12,2),
  meta_ating    numeric(12,2),
  avatar_url    text,
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Admins veem tudo; reps veem apenas o próprio perfil
create policy "profiles_select" on public.profiles
  for select using (
    auth.uid() = id
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_insert_admin" on public.profiles
  for insert with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- ── CLIENTES ─────────────────────────────────────────────────
create table public.clients (
  id              text        primary key default 'cli-' || substr(replace(gen_random_uuid()::text,'-',''),1,8),
  name            text        not null,
  trade_name      text,
  cnpj            text,
  cpf             text,
  type            client_type not null default 'agropecuaria',
  rep_id          uuid        not null references public.profiles(id),
  address         jsonb       not null default '{}',
  phone           text        not null,
  email           text,
  status          client_status not null default 'ativo',
  segment         text        not null default '',
  last_visit      date,
  last_order      date,
  total_orders    integer     not null default 0,
  total_revenue   numeric(14,2) not null default 0,
  priority        priority_level not null default 'media',
  notes           text,
  created_at      timestamptz not null default now()
);
alter table public.clients enable row level security;

create policy "clients_select" on public.clients
  for select using (
    rep_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "clients_insert" on public.clients
  for insert with check (
    rep_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "clients_update" on public.clients
  for update using (
    rep_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── PRODUTOS ─────────────────────────────────────────────────
create table public.products (
  id          text        primary key default 'prod-' || substr(replace(gen_random_uuid()::text,'-',''),1,8),
  code        text        not null unique,
  name        text        not null,
  category    text        not null default '',
  price       numeric(10,2) not null default 0,
  unit        text        not null default 'un',
  stock       integer     not null default 0,
  bling_id    text,
  image_url   text,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);
alter table public.products enable row level security;

create policy "products_select_all" on public.products
  for select using (auth.role() = 'authenticated');
create policy "products_admin_write" on public.products
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── PEDIDOS ──────────────────────────────────────────────────
create table public.orders (
  id              text        primary key default 'ord-' || substr(replace(gen_random_uuid()::text,'-',''),1,8),
  number          text        not null unique,
  client_id       text        not null references public.clients(id),
  client_name     text        not null,
  client_city     text,
  rep_id          uuid        not null references public.profiles(id),
  rep_name        text        not null,
  status          order_status not null default 'rascunho',
  sync_status     sync_status not null default 'pendente',
  items           jsonb       not null default '[]',
  subtotal        numeric(14,2) not null default 0,
  discount        numeric(14,2) not null default 0,
  total           numeric(14,2) not null default 0,
  payment_terms   text,
  delivery_date   date,
  notes           text,
  bling_order_id  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.orders enable row level security;

create policy "orders_select" on public.orders
  for select using (
    rep_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "orders_insert" on public.orders
  for insert with check (rep_id = auth.uid());
create policy "orders_update" on public.orders
  for update using (
    rep_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Trigger para updated_at automático
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger orders_updated_at before update on public.orders
  for each row execute function set_updated_at();

-- ── VISITAS ──────────────────────────────────────────────────
create table public.visits (
  id            text        primary key default 'vis-' || substr(replace(gen_random_uuid()::text,'-',''),1,8),
  client_id     text        not null references public.clients(id),
  client_name   text        not null,
  client_city   text,
  rep_id        uuid        not null references public.profiles(id),
  rep_name      text        not null,
  status        visit_status not null default 'agendada',
  check_in      jsonb,
  check_out     jsonb,
  result        visit_result,
  notes         text,
  rating        smallint    check (rating between 1 and 5),
  next_visit    date,
  duration      integer,
  order_id      text        references public.orders(id),
  created_at    timestamptz not null default now()
);
alter table public.visits enable row level security;

create policy "visits_select" on public.visits
  for select using (
    rep_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "visits_insert" on public.visits
  for insert with check (rep_id = auth.uid());
create policy "visits_update" on public.visits
  for update using (
    rep_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── PROSPECTS ────────────────────────────────────────────────
create table public.prospects (
  id                text            primary key default 'pro-' || substr(replace(gen_random_uuid()::text,'-',''),1,8),
  name              text            not null,
  contact           text            not null,
  phone             text            not null,
  email             text,
  city              text            not null,
  state             char(2)         not null,
  region            text,
  segment           text            not null default '',
  status            prospect_status not null default 'disponivel',
  rep_id            uuid            references public.profiles(id),
  rep_name          text,
  notes             text,
  source            text,
  estimated_revenue numeric(12,2),
  attempts          integer         not null default 0,
  created_at        timestamptz     not null default now()
);
alter table public.prospects enable row level security;

create policy "prospects_select_all" on public.prospects
  for select using (auth.role() = 'authenticated');
create policy "prospects_insert_admin" on public.prospects
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "prospects_update" on public.prospects
  for update using (auth.role() = 'authenticated');

-- ── COMISSÕES ────────────────────────────────────────────────
create table public.commissions (
  id              text              primary key default 'com-' || substr(replace(gen_random_uuid()::text,'-',''),1,8),
  rep_id          uuid              not null references public.profiles(id),
  rep_name        text              not null,
  order_id        text              not null references public.orders(id),
  order_number    text              not null,
  client_name     text              not null,
  client_id       text              references public.clients(id),
  order_total     numeric(14,2)     not null,
  rate            numeric(5,2)      not null,
  amount          numeric(12,2)     not null,
  status          commission_status not null default 'prevista',
  reference_month char(7)           not null,
  paid_at         timestamptz,
  created_at      timestamptz       not null default now()
);
alter table public.commissions enable row level security;

create policy "commissions_select" on public.commissions
  for select using (
    rep_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "commissions_admin_write" on public.commissions
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── AUDIT LOGS ───────────────────────────────────────────────
create table public.audit_logs (
  id          text          primary key default 'log-' || substr(replace(gen_random_uuid()::text,'-',''),1,8),
  user_id     uuid          not null references public.profiles(id),
  user_name   text          not null,
  user_role   user_role     not null,
  action      audit_action  not null,
  entity      text          not null,
  entity_id   text          not null,
  description text          not null,
  old_value   text,
  new_value   text,
  ip          text,
  timestamp   timestamptz   not null default now()
);
alter table public.audit_logs enable row level security;

create policy "audit_logs_admin_only" on public.audit_logs
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "audit_logs_insert_auth" on public.audit_logs
  for insert with check (auth.role() = 'authenticated');

-- ── BLING SYNC ────────────────────────────────────────────────
create table public.bling_syncs (
  id            text          primary key default 'sync-' || substr(replace(gen_random_uuid()::text,'-',''),1,8),
  entity        bling_entity_type not null,
  status        bling_status  not null default 'pendente',
  total         integer       not null default 0,
  synced        integer       not null default 0,
  errors        integer       not null default 0,
  last_sync     timestamptz,
  next_sync     timestamptz,
  error_message text,
  updated_at    timestamptz   not null default now(),
  unique(entity)
);
alter table public.bling_syncs enable row level security;

create policy "bling_syncs_admin" on public.bling_syncs
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── INTERAÇÕES ────────────────────────────────────────────────
create table public.interactions (
  id          text             primary key default 'int-' || substr(replace(gen_random_uuid()::text,'-',''),1,8),
  client_id   text             not null references public.clients(id),
  client_name text             not null,
  rep_id      uuid             not null references public.profiles(id),
  rep_name    text             not null,
  type        interaction_type not null,
  title       text             not null,
  description text,
  rating      smallint         check (rating between 1 and 5),
  related_id  text,
  timestamp   timestamptz      not null default now()
);
alter table public.interactions enable row level security;

create policy "interactions_select" on public.interactions
  for select using (
    rep_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "interactions_insert" on public.interactions
  for insert with check (rep_id = auth.uid());

-- ── SESSÕES DE ROTA ──────────────────────────────────────────
create table public.route_sessions (
  id              text        primary key default 'route-' || substr(replace(gen_random_uuid()::text,'-',''),1,8),
  rep_id          uuid        not null references public.profiles(id),
  rep_name        text        not null,
  date            date        not null,
  city            text        not null,
  client_ids      text[]      not null default '{}',
  checked_in_ids  text[]      not null default '{}',
  status          text        not null default 'ativa',
  created_at      timestamptz not null default now()
);
alter table public.route_sessions enable row level security;

create policy "route_sessions_select" on public.route_sessions
  for select using (
    rep_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "route_sessions_insert" on public.route_sessions
  for insert with check (rep_id = auth.uid());
create policy "route_sessions_update" on public.route_sessions
  for update using (rep_id = auth.uid());

-- ── ÍNDICES ───────────────────────────────────────────────────
create index idx_clients_rep_id      on public.clients(rep_id);
create index idx_clients_status      on public.clients(status);
create index idx_orders_rep_id       on public.orders(rep_id);
create index idx_orders_client_id    on public.orders(client_id);
create index idx_orders_status       on public.orders(status);
create index idx_orders_created_at   on public.orders(created_at desc);
create index idx_visits_rep_id       on public.visits(rep_id);
create index idx_visits_client_id    on public.visits(client_id);
create index idx_visits_created_at   on public.visits(created_at desc);
create index idx_commissions_rep_id  on public.commissions(rep_id);
create index idx_audit_user_id       on public.audit_logs(user_id);
create index idx_audit_timestamp     on public.audit_logs(timestamp desc);
create index idx_interactions_client on public.interactions(client_id);
create index idx_interactions_rep    on public.interactions(rep_id);
create index idx_interactions_ts     on public.interactions(timestamp desc);

-- ── FUNÇÃO: trigger perfil automático ao criar usuário ───────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'rep')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
