-- Painel bling_syncs: nova categoria "financeiro" (notas, boletos e pagamentos).
-- Precisa de migration própria: o valor novo do enum só pode ser usado depois do commit.
alter type public.bling_entity_type add value if not exists 'financeiro';
