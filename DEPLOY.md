# 🚀 Tutorial de Deploy — ITA Dog Sales

> Deploy completo no Vercel (frontend) + Supabase (banco de dados).  
> Tempo estimado: **20–30 minutos**. Nenhum conhecimento avançado necessário.

---

## PARTE 1 — Deploy no Vercel (Frontend)

O Vercel vai hospedar seu app e gerar um link público (ex: `itadogsales.vercel.app`).

### Passo 1 — Crie uma conta no Vercel
1. Acesse **https://vercel.com**
2. Clique em **"Start Deploying"** ou **"Sign Up"**
3. Escolha **"Continue with GitHub"** *(recomendado — vai facilitar muito)*
4. Autorize o acesso do Vercel ao GitHub

---

### Passo 2 — Coloque o projeto no GitHub
Dentro da pasta do projeto no terminal:

```bash
git init
git add .
git commit -m "feat: initial commit - ITA Dog Sales"
git branch -M main
```

Depois, crie um repositório novo em **https://github.com/new**:
- Nome: `itadogsales`
- Visibilidade: **Privado** (recomendado)
- **NÃO** marque as opções de README/gitignore

Copie o link do repositório e rode:

```bash
git remote add origin https://github.com/SEU_USUARIO/itadogsales.git
git push -u origin main
```

---

### Passo 3 — Importe o projeto no Vercel
1. No Vercel, clique em **"Add New… → Project"**
2. Na lista de repositórios do GitHub, clique em **"Import"** ao lado de `itadogsales`
3. O Vercel vai detectar automaticamente que é um projeto **Vite**
4. As configurações já estarão corretas:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. Clique em **"Deploy"** e aguarde (1–2 minutos)

Pronto! Você vai receber um link como `https://itadogsales.vercel.app` ✅

---

### Passo 4 — Configurar domínio personalizado (opcional)
1. No painel do projeto no Vercel, vá em **"Settings → Domains"**
2. Digite seu domínio (ex: `app.itadogsales.com.br`)
3. Siga as instruções para apontar o DNS no seu provedor de domínio

---

## PARTE 2 — Configurar o Supabase (Banco de Dados)

O Supabase vai guardar seus dados reais (clientes, pedidos, visitas, etc.) em vez dos dados mock.

### Passo 1 — Crie uma conta no Supabase
1. Acesse **https://supabase.com**
2. Clique em **"Start your project"**
3. Faça login com **GitHub** (mais fácil)
4. Clique em **"New project"**
5. Preencha:
   - **Name:** `itadogsales`
   - **Database Password:** crie uma senha forte e anote ela
   - **Region:** `South America (São Paulo)` ← escolha essa para menor latência
6. Clique em **"Create new project"** e aguarde ≈2 minutos

---

### Passo 2 — Pegue as credenciais do Supabase
1. No painel do seu projeto, clique em **"Project Settings"** (ícone de engrenagem)
2. Depois em **"API"**
3. Você vai ver:
   - **Project URL** → ex: `https://xyzabcdef.supabase.co`
   - **anon public key** → uma chave longa começando com `eyJ...`
4. Copie ambos — vai usar no próximo passo

---

### Passo 3 — Criar as tabelas do banco

No painel do Supabase, clique em **"SQL Editor"** (ícone de terminal) e cole o SQL abaixo. Depois clique **"Run"**:

```sql
-- Tabela de usuários/representantes
create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  role text not null check (role in ('admin', 'rep')),
  phone text,
  region text,
  territory text[],
  active boolean default true,
  meta numeric,
  meta_ating numeric,
  created_at timestamp with time zone default now()
);

-- Tabela de clientes
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trade_name text,
  cnpj text,
  type text not null,
  rep_id uuid references users(id),
  street text,
  city text not null,
  state text not null,
  zip_code text,
  lat numeric,
  lng numeric,
  phone text,
  email text,
  status text default 'ativo',
  segment text,
  last_visit date,
  last_order date,
  total_orders integer default 0,
  total_revenue numeric default 0,
  priority text default 'media',
  notes text,
  created_at timestamp with time zone default now()
);

-- Tabela de produtos
create table products (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  category text,
  price numeric not null,
  unit text,
  stock integer default 0,
  bling_id text,
  created_at timestamp with time zone default now()
);

-- Tabela de pedidos
create table orders (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  client_id uuid references clients(id),
  client_name text,
  rep_id uuid references users(id),
  rep_name text,
  status text default 'rascunho',
  sync_status text default 'pendente',
  subtotal numeric,
  discount numeric default 0,
  total numeric,
  payment_terms text,
  delivery_date date,
  notes text,
  bling_order_id text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Itens do pedido
create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  product_id uuid,
  product_name text,
  quantity numeric,
  price numeric,
  discount numeric default 0,
  total numeric
);

-- Tabela de visitas
create table visits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  client_name text,
  rep_id uuid references users(id),
  rep_name text,
  status text default 'agendada',
  checkin_lat numeric,
  checkin_lng numeric,
  checkin_time timestamp with time zone,
  checkout_lat numeric,
  checkout_lng numeric,
  checkout_time timestamp with time zone,
  result text,
  notes text,
  next_visit date,
  duration integer,
  order_id uuid references orders(id),
  created_at timestamp with time zone default now()
);

-- Tabela de leads/prospects
create table prospects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  phone text,
  email text,
  city text,
  state text,
  segment text,
  status text default 'disponivel',
  rep_id uuid references users(id),
  notes text,
  source text,
  estimated_revenue numeric,
  created_at timestamp with time zone default now()
);

-- Tabela de comissões
create table commissions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid references users(id),
  order_id uuid references orders(id),
  order_number text,
  client_name text,
  order_total numeric,
  rate numeric,
  amount numeric,
  status text default 'prevista',
  reference_month text,
  paid_at timestamp with time zone,
  created_at timestamp with time zone default now()
);

-- Habilitar Row Level Security (segurança por usuário)
alter table users enable row level security;
alter table clients enable row level security;
alter table orders enable row level security;
alter table visits enable row level security;
alter table prospects enable row level security;
alter table commissions enable row level security;

-- Política: admin vê tudo, rep só vê o que é seu
create policy "Admin sees all users" on users
  for all using (auth.jwt() ->> 'role' = 'admin');

create policy "Rep sees own data" on users
  for select using (auth.uid()::text = id::text);
```

---

### Passo 4 — Conectar o app ao Supabase

Crie um arquivo chamado `.env.local` na **raiz** do projeto (mesma pasta que o `package.json`):

```env
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJSUAKEYAQUI...
```

Substitua pelos valores que você copiou no Passo 2.

> ⚠️ **IMPORTANTE:** Nunca suba o `.env.local` para o GitHub! O arquivo `.gitignore` já está configurado para ignorá-lo.

---

### Passo 5 — Adicionar as variáveis no Vercel

Como o `.env.local` não vai pro GitHub, você precisa configurar as variáveis no Vercel:

1. No painel do seu projeto no Vercel, vá em **"Settings → Environment Variables"**
2. Adicione as duas variáveis:
   - `VITE_SUPABASE_URL` = `https://SEU_PROJETO.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `eyJSUAKEYAQUI...`
3. Clique em **"Save"**
4. Vá em **"Deployments"** e clique em **"Redeploy"** no deploy mais recente

---

## PARTE 3 — Configurar Autenticação Real (opcional)

O app já funciona com login mock. Para autenticação real:

1. No Supabase, vá em **"Authentication → Providers"**
2. O **Email** já vem habilitado por padrão
3. Para adicionar Google/GitHub, clique no provider e siga o guia

Para criar o primeiro usuário admin:
1. Vá em **"Authentication → Users"**
2. Clique em **"Invite user"** e informe o email
3. O usuário vai receber um link para definir a senha

---

## PARTE 4 — Integração com Bling ERP

Para conectar ao Bling de verdade:

1. Acesse **https://www.bling.com.br/Api/v3** e crie as credenciais OAuth
2. Configure as variáveis no Vercel:
   - `VITE_BLING_CLIENT_ID=...`
   - `VITE_BLING_CLIENT_SECRET=...`
3. O código em `src/lib/supabase.ts` já tem a estrutura para expandir

---

## Resumo Rápido (Checklist)

| Passo | O que fazer |
|-------|-------------|
| ✅ 1 | Criar conta no GitHub e subir o código |
| ✅ 2 | Criar conta no Vercel e importar o repositório |
| ✅ 3 | Criar conta no Supabase e criar o projeto |
| ✅ 4 | Rodar o SQL para criar as tabelas |
| ✅ 5 | Copiar as credenciais do Supabase para o `.env.local` |
| ✅ 6 | Adicionar as variáveis no painel do Vercel |
| ✅ 7 | Fazer redeploy no Vercel |
| 🎉 | App funcionando em produção! |

---

## Precisa de ajuda?

- **Vercel:** https://vercel.com/docs
- **Supabase:** https://supabase.com/docs
- **Problemas com build:** verifique o log em Vercel → Deployments → clique no deploy com erro

---

*ITA Dog Sales v1.0 · Sistema de Força de Vendas Agropecuária*
