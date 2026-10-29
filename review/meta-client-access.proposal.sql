-- REVIEW ONLY. Additive; existing admin OAuth policies remain unchanged.
-- No ciphertext grants to browser roles. Reuses existing Solo/Responsable rule.
create or replace function public.can_connect_meta(cid uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and private.can_write_shared_daily(cid);
$$;
revoke all on function public.can_connect_meta(uuid) from public,anon;
grant execute on function public.can_connect_meta(uuid) to authenticated;

-- Server-only atomic confirmation; actor is verified by auth.getUser() in API.
create or replace function public.confirm_client_meta(p_actor uuid,p_pending_id uuid,p_account_id text,p_account_name text,p_ciphertext text,p_expires_at timestamptz,p_expected_revision integer)
returns void language plpgsql security invoker set search_path='' as $$
declare p public.oauth_pending; old_revision integer;
begin
 if current_user <> 'service_role' then raise exception 'Server only'; end if;
 select * into p from public.oauth_pending where id=p_pending_id and created_by=p_actor and provider='meta' and expires_at>now() for update;
 if not found then raise exception 'Authorization expired'; end if;
 if not exists(select 1 from public.client_memberships m join public.clients c on c.id=m.client_id where m.client_id=p.client_id and m.user_id=p_actor and (c.work_mode='Solo' or exists(select 1 from public.team_members t where t.client_id=c.id and t.user_id=p_actor and t.team_role='Responsable'))) then raise exception 'Dossier unauthorized'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p.client_id::text||'meta'));
 select revision into old_revision from public.oauth_connections where client_id=p.client_id and provider='meta' for update;
 if coalesce(old_revision,0)<>p_expected_revision or p_expires_at<=now() then raise exception 'Connection changed or expired'; end if;
 insert into public.oauth_connections(client_id,provider,account_id,account_name,ciphertext,expires_at) values(p.client_id,'meta',p_account_id,p_account_name,p_ciphertext,p_expires_at)
 on conflict(client_id,provider) do update set account_id=excluded.account_id,account_name=excluded.account_name,ciphertext=excluded.ciphertext,expires_at=excluded.expires_at,revision=public.oauth_connections.revision+1,updated_at=now(),lease=null,lease_until=null;
 update public.clients set meta_ad_account_id=p_account_id where id=p.client_id;
 delete from public.oauth_pending where id=p.id;
end; $$;
revoke all on function public.confirm_client_meta(uuid,uuid,text,text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.confirm_client_meta(uuid,uuid,text,text,text,timestamptz,integer) to service_role;
create table public.meta_oauth_states(key text primary key,user_id uuid not null,client_id uuid not null,expires_at timestamptz not null);
alter table public.meta_oauth_states enable row level security;
revoke all on public.meta_oauth_states from public,anon,authenticated;
grant select,insert,delete on public.meta_oauth_states to service_role;
create function public.consume_client_meta_state(p_key text,p_user uuid,p_client uuid) returns boolean language sql security invoker set search_path='' as $$
 with used as(delete from public.meta_oauth_states where key=p_key and user_id=p_user and client_id=p_client and expires_at>now() returning key)select exists(select 1 from used);
$$;
revoke all on function public.consume_client_meta_state(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.consume_client_meta_state(text,uuid,uuid) to service_role;
