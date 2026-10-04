-- Desfaz a Etapa 3, Parte A (20261004230000_bling_05_clientes_leitura.sql).

drop index if exists public.clients_bling_contact_uidx;
alter table public.clients drop column if exists bling_synced_at;
alter table public.clients drop column if exists bling_contact_id;
drop table if exists public.bling_contacts;
