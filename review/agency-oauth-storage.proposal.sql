-- REVIEW ONLY: server-only additive store; no client table/policy changes.
create table public.agency_oauth_states(key text primary key,admin_id uuid not null,provider text not null check(provider in ('zoom','wispr')),expires_at timestamptz not null);
create table public.agency_oauth_credentials(admin_id uuid not null,provider text not null check(provider in ('zoom','wispr')),ciphertext text not null,identity jsonb not null,expires_at timestamptz not null,confirmed boolean not null default false,revision integer not null default 1,lease text,lease_until timestamptz,primary key(admin_id,provider));
alter table public.agency_oauth_states enable row level security;
alter table public.agency_oauth_credentials enable row level security;
revoke all on public.agency_oauth_states,public.agency_oauth_credentials from public,anon,authenticated;
grant select,insert,update,delete on public.agency_oauth_states,public.agency_oauth_credentials to service_role;
create function public.consume_agency_oauth_state(p_key text,p_admin uuid,p_provider text) returns boolean language sql security invoker set search_path='' as $$
 with used as (delete from public.agency_oauth_states where key=p_key and admin_id=p_admin and provider=p_provider and expires_at>now() returning key) select exists(select 1 from used);
$$;
create function public.lease_agency_oauth(p_admin uuid,p_provider text,p_revision integer,p_lease text) returns boolean language sql security invoker set search_path='' as $$
 with locked as(update public.agency_oauth_credentials set lease=p_lease,lease_until=now()+interval '60 seconds' where admin_id=p_admin and provider=p_provider and revision=p_revision and confirmed and (lease_until is null or lease_until<now()) returning admin_id)select exists(select 1 from locked);
$$;
create function public.finish_agency_oauth_refresh(p_admin uuid,p_provider text,p_lease text,p_ciphertext text,p_expires timestamptz) returns boolean language sql security invoker set search_path='' as $$
 with changed as(update public.agency_oauth_credentials set ciphertext=p_ciphertext,expires_at=p_expires,revision=revision+1,lease=null,lease_until=null where admin_id=p_admin and provider=p_provider and lease=p_lease and lease_until>now() and confirmed returning admin_id)select exists(select 1 from changed);
$$;
revoke all on function public.consume_agency_oauth_state(text,uuid,text),public.lease_agency_oauth(uuid,text,integer,text),public.finish_agency_oauth_refresh(uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.consume_agency_oauth_state(text,uuid,text),public.lease_agency_oauth(uuid,text,integer,text),public.finish_agency_oauth_refresh(uuid,text,text,text,timestamptz) to service_role;

create function public.stage_agency_oauth(p_admin uuid,p_provider text,p_ciphertext text,p_identity jsonb,p_expires timestamptz) returns void language sql security invoker set search_path='' as $$
 insert into public.agency_oauth_credentials(admin_id,provider,ciphertext,identity,expires_at) values(p_admin,p_provider,p_ciphertext,p_identity,p_expires)
 on conflict(admin_id,provider) do update set ciphertext=excluded.ciphertext,identity=excluded.identity,expires_at=excluded.expires_at,confirmed=false,revision=public.agency_oauth_credentials.revision+1,lease=null,lease_until=null;
$$;
revoke all on function public.stage_agency_oauth(uuid,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.stage_agency_oauth(uuid,text,text,jsonb,timestamptz) to service_role;
create function public.disconnect_agency_oauth(p_admin uuid,p_provider text) returns void language sql security invoker set search_path='' as $$
 update public.agency_oauth_credentials set confirmed=false,revision=revision+1,lease=null,lease_until=null where admin_id=p_admin and provider=p_provider;
$$;
revoke all on function public.disconnect_agency_oauth(uuid,text) from public,anon,authenticated;
grant execute on function public.disconnect_agency_oauth(uuid,text) to service_role;
