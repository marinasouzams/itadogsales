-- Desfaz a Etapa 1 da integração Bling (20261004160000_bling_01_conexao.sql).
-- Remove apenas os objetos criados por ela; nenhum dado existente é afetado.

delete from vault.secrets where name = 'bling_tokens';

drop function if exists public.bling_release_refresh_lock();
drop function if exists public.bling_try_refresh_lock(int);
drop function if exists public.bling_clear_tokens();
drop function if exists public.bling_save_tokens(jsonb);
drop function if exists public.bling_get_tokens();

drop table if exists public.bling_sync_log;
drop table if exists public.bling_oauth_states;
drop table if exists public.bling_connection;
