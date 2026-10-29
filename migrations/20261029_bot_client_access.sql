-- Accès serveur des bots : journal d’audit et mise à jour bornée d’un dossier.
-- Déjà appliquée en production (migration Supabase bot_client_access, version 20261029183307).
-- Ce fichier conserve le SQL dans le dépôt. Ne pas le réexécuter sur la production.
-- Le schéma private et la table public.clients existent déjà. private.is_admin() aussi.

create table public.bot_audit_log (
 id bigint generated always as identity primary key,
 at timestamptz not null default now(),
 actor text not null,
 action text not null check (action in ('list','get','update','denied')),
 client_id uuid references public.clients(id) on delete set null,
 changes jsonb,
 reason text,
 request_id text
);

alter table public.bot_audit_log enable row level security;
revoke all on public.bot_audit_log from public, anon, authenticated;
grant select on public.bot_audit_log to authenticated;
grant all on public.bot_audit_log to service_role;
grant usage, select on sequence public.bot_audit_log_id_seq to service_role;

create policy bot_audit_admin_read on public.bot_audit_log for select to authenticated
 using ((select private.is_admin()));

create or replace function private.bot_update_client(p_client uuid, p_patch jsonb, p_actor text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
 allowed text[] := array['status','main_constraint','sector','launch_date','support_start','support_end','work_mode','crm_url'];
 bad text;
 before public.clients;
 after public.clients;
begin
 if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then raise exception 'empty patch'; end if;
 select k into bad from jsonb_object_keys(p_patch) k where k <> all(allowed) limit 1;
 if bad is not null then raise exception 'field not allowed: %', bad; end if;
 select * into before from public.clients where id = p_client for update;
 if not found then raise exception 'client not found'; end if;
 update public.clients set
  status = case when p_patch ? 'status' then p_patch->>'status' else status end,
  main_constraint = case when p_patch ? 'main_constraint' then left(p_patch->>'main_constraint',1000) else main_constraint end,
  sector = case when p_patch ? 'sector' then left(p_patch->>'sector',120) else sector end,
  launch_date = case when p_patch ? 'launch_date' then (p_patch->>'launch_date')::date else launch_date end,
  support_start = case when p_patch ? 'support_start' then (p_patch->>'support_start')::date else support_start end,
  support_end = case when p_patch ? 'support_end' then (p_patch->>'support_end')::date else support_end end,
  work_mode = case when p_patch ? 'work_mode' then p_patch->>'work_mode' else work_mode end,
  crm_url = case when p_patch ? 'crm_url' then coalesce(p_patch->>'crm_url','') else crm_url end
 where id = p_client returning * into after;
 insert into public.bot_audit_log(actor, action, client_id, changes, reason)
 values (p_actor, 'update', p_client,
  jsonb_build_object('before', (select jsonb_object_agg(k, to_jsonb(before)->k) from unnest(allowed) k where p_patch ? k),
                     'after',  (select jsonb_object_agg(k, to_jsonb(after)->k)  from unnest(allowed) k where p_patch ? k)),
  left(p_reason, 500));
 return to_jsonb(after);
end
$$;

revoke all on function private.bot_update_client(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function private.bot_update_client(uuid, jsonb, text, text) to service_role;
grant usage on schema private to service_role;

create or replace function public.bot_update_client(p_client uuid, p_patch jsonb, p_actor text, p_reason text)
returns jsonb
language sql
set search_path = ''
as $$ select private.bot_update_client(p_client, p_patch, p_actor, p_reason) $$;

revoke all on function public.bot_update_client(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.bot_update_client(uuid, jsonb, text, text) to service_role;
