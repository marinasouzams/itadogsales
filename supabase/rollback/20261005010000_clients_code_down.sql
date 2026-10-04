-- Desfaz o código legível de cliente (20261005010000_clients_code.sql).
-- O campo "Código" dos contatos no Bling não é limpo automaticamente.

-- Volta o gatilho de envio à versão sem o código (bling_06)
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

drop trigger if exists clients_set_code on public.clients;
drop function if exists public.clients_set_code();
drop index if exists public.clients_code_key;
alter table public.clients drop column if exists code;
drop sequence if exists public.clients_code_seq;
