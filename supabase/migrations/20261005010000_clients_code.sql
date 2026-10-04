-- ═══════════════════════════════════════════════════════════
-- Código legível de cliente: CLI-0001, CLI-0002… (ordem de cadastro)
-- Mesmo código no Itadog e no campo "Código" do contato no Bling.
-- Desfazer: supabase/rollback/20261005010000_clients_code_down.sql
-- ═══════════════════════════════════════════════════════════

alter table public.clients add column code text;

create sequence public.clients_code_seq;

-- Numera os clientes existentes por data de cadastro, sem disparar envio ao Bling agora
alter table public.clients disable trigger clients_bling_sync;

with numbered as (
  select id, row_number() over (order by created_at, id) as n
  from public.clients
)
update public.clients c
   set code = 'CLI-' || lpad(numbered.n::text, 4, '0')
  from numbered
 where numbered.id = c.id;

alter table public.clients enable trigger clients_bling_sync;

select setval('public.clients_code_seq', greatest((select count(*) from public.clients), 1));

alter table public.clients alter column code set not null;
create unique index clients_code_key on public.clients (code);

-- Cliente novo recebe o próximo código automaticamente
create or replace function public.clients_set_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.code is null or new.code = '' then
    new.code := 'CLI-' || lpad(nextval('public.clients_code_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger clients_set_code
  before insert on public.clients
  for each row execute function public.clients_set_code();

-- Mudança de código também vai para o Bling
create or replace function public.clients_bling_enqueue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(regexp_replace(coalesce(new.cnpj, new.cpf, ''), '\D', '', 'g'), '') is null then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.code               is distinct from old.code
     or new.name               is distinct from old.name
     or new.trade_name         is distinct from old.trade_name
     or new.cnpj               is distinct from old.cnpj
     or new.cpf                is distinct from old.cpf
     or new.state_registration is distinct from old.state_registration
     or new.email              is distinct from old.email
     or new.phone              is distinct from old.phone
     or new.address            is distinct from old.address
     or new.rep_id             is distinct from old.rep_id then
    perform public.bling_enqueue('cliente', new.id, 'push');
  end if;
  return new;
end;
$$;
