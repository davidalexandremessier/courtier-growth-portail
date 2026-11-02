-- Portail Sprint 97 $ : ressources (order bumps), suite après bilan, liste d'attente Expansion, tickets de support.
-- À APPLIQUER MANUELLEMENT sur le projet Supabase ddhtwrzgltwwkwykexuo.
-- Ce fichier n'est pas exécuté par le déploiement Vercel. Ne pas lancer ce script sur la production
-- tant que la revue n'est pas faite. L'aperçu fonctionne sans ces tables : les cartes restent masquées
-- et aucune question n'est envoyée (pas de courriel, pas de texto).
-- Dépend de public.clients, public.client_memberships, auth.uid() et private.is_admin(), déjà en production.
-- Les clients lisent leurs lignes. Les admins lisent et mettent à jour toutes les lignes.
-- Aucun secret et aucune clé service_role ici.

create table public.portal_links (
 key text primary key check (key in ('cg97_lien_template_pub','cg97_lien_template_prospection','lien_app_accelerator')),
 url text check (url is null or (length(url) between 12 and 500 and url ~ '^https://')),
 updated_at timestamptz not null default now()
);

insert into public.portal_links (key, url) values
 ('cg97_lien_template_pub', null),
 ('cg97_lien_template_prospection', null),
 ('lien_app_accelerator', 'https://api.leadconnectorhq.com/widget/survey/SGO67W4D6vqxQozBBVsw');

create table public.sprint97_client_state (
 client_id uuid primary key references public.clients(id) on delete cascade,
 tags text[] not null default '{}',
 updated_at timestamptz not null default now(),
 constraint sprint97_tags_known check (tags <@ array['CG97-bump-template-pub','CG97-bump-template-prospection','CG97-bilan-livré']::text[])
);

create table public.expansion_waitlist (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 requested_at timestamptz not null default now(),
 status text not null default 'en_attente' check (status in ('en_attente','place_offerte','retiree','acceptee')),
 updated_at timestamptz not null default now()
);

create unique index expansion_waitlist_one_open on public.expansion_waitlist (client_id) where status in ('en_attente','place_offerte');
create index expansion_waitlist_client_idx on public.expansion_waitlist (client_id, requested_at desc);

create table public.portal_support_tickets (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 created_by uuid not null,
 question text not null check (length(trim(question)) between 2 and 2000),
 status text not null default 'ouvert' check (status in ('ouvert','en_cours','repondu','ferme')),
 reply text check (reply is null or length(trim(reply)) between 1 and 4000),
 created_at timestamptz not null default now(),
 replied_at timestamptz
);

create index portal_support_tickets_client_idx on public.portal_support_tickets (client_id, created_at desc);

create or replace function private.portal_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
 select exists (
  select 1 from public.client_memberships m
  where m.client_id = cid and m.user_id = (select auth.uid())
 )
$$;

revoke all on function private.portal_member(uuid) from public, anon, authenticated;
grant execute on function private.portal_member(uuid) to authenticated;

alter table public.portal_links enable row level security;
alter table public.sprint97_client_state enable row level security;
alter table public.expansion_waitlist enable row level security;
alter table public.portal_support_tickets enable row level security;

revoke all on public.portal_links, public.sprint97_client_state, public.expansion_waitlist, public.portal_support_tickets from anon, authenticated;
grant select on public.portal_links to authenticated;
grant update (url, updated_at) on public.portal_links to authenticated;
grant select on public.sprint97_client_state to authenticated;
grant insert, update (tags, updated_at) on public.sprint97_client_state to authenticated;
grant select, insert on public.expansion_waitlist to authenticated;
grant update (status, updated_at) on public.expansion_waitlist to authenticated;
grant select, insert on public.portal_support_tickets to authenticated;
grant update (status, reply, replied_at) on public.portal_support_tickets to authenticated;

create policy portal_links_read on public.portal_links for select to authenticated
 using (true);
create policy portal_links_admin_update on public.portal_links for update to authenticated
 using ((select private.is_admin())) with check ((select private.is_admin()));

create policy sprint97_state_read on public.sprint97_client_state for select to authenticated
 using ((select private.is_admin()) or (select private.portal_member(client_id)));
create policy sprint97_state_admin_write on public.sprint97_client_state for insert to authenticated
 with check ((select private.is_admin()));
create policy sprint97_state_admin_update on public.sprint97_client_state for update to authenticated
 using ((select private.is_admin())) with check ((select private.is_admin()));

create policy expansion_waitlist_read on public.expansion_waitlist for select to authenticated
 using ((select private.is_admin()) or (select private.portal_member(client_id)));
create policy expansion_waitlist_insert on public.expansion_waitlist for insert to authenticated
 with check (status = 'en_attente' and (select private.portal_member(client_id)));
create policy expansion_waitlist_admin_update on public.expansion_waitlist for update to authenticated
 using ((select private.is_admin())) with check ((select private.is_admin()));

create policy portal_support_read on public.portal_support_tickets for select to authenticated
 using ((select private.is_admin()) or (select private.portal_member(client_id)));
create policy portal_support_insert on public.portal_support_tickets for insert to authenticated
 with check (
  status = 'ouvert'
  and reply is null
  and created_by = (select auth.uid())
  and (select private.portal_member(client_id))
 );
create policy portal_support_admin_update on public.portal_support_tickets for update to authenticated
 using ((select private.is_admin())) with check ((select private.is_admin()));
