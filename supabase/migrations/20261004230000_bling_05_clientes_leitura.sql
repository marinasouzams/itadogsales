-- ═══════════════════════════════════════════════════════════
-- Integração Bling — Etapa 3, Parte A: leitura de contatos do Bling
-- Só acrescenta objetos novos; não altera dados de clientes.
-- Desfazer: supabase/rollback/20261004230000_bling_05_clientes_leitura_down.sql
-- ═══════════════════════════════════════════════════════════

-- Cópia dos contatos do Bling (consulta / comparação por CPF/CNPJ)
create table public.bling_contacts (
  bling_id         bigint primary key,
  nome             text,
  codigo           text,
  situacao         text,                 -- A ativo · I inativo · E excluído · S sem movimentação
  numero_documento text,
  documento        text generated always as (nullif(regexp_replace(coalesce(numero_documento, ''), '\D', '', 'g'), '')) stored,
  telefone         text,
  celular          text,
  raw              jsonb,
  fetched_at       timestamptz not null default now()
);

create index bling_contacts_documento_idx on public.bling_contacts (documento);

alter table public.bling_contacts enable row level security;
create policy bling_contacts_admin_select on public.bling_contacts
  for select using (public.is_admin());

-- Vínculo do cliente com o contato do Bling (preenchido na Parte B)
alter table public.clients add column bling_contact_id bigint;
alter table public.clients add column bling_synced_at timestamptz;
create unique index clients_bling_contact_uidx on public.clients (bling_contact_id) where bling_contact_id is not null;
