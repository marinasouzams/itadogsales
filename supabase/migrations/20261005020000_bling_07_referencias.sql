-- ═══════════════════════════════════════════════════════════
-- Integração Bling — Etapa 4: listas de referência do Bling
-- (formas de pagamento, naturezas de operação, vendedores, situações, depósitos, canais)
-- Só acrescenta objetos novos.
-- Desfazer: drop table public.bling_reference;
-- ═══════════════════════════════════════════════════════════

create table public.bling_reference (
  kind       text   not null,          -- forma_pagamento | natureza_operacao | vendedor | situacao_venda | deposito | canal_venda
  bling_id   bigint not null,
  descricao  text,
  raw        jsonb,
  fetched_at timestamptz not null default now(),
  primary key (kind, bling_id)
);

alter table public.bling_reference enable row level security;
create policy bling_reference_admin_select on public.bling_reference
  for select using (public.is_admin());
