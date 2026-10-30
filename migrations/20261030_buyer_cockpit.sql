-- Cockpit acheteur : événements entrants GoHighLevel et liens d’accès par contact.
-- Fichier de migration seulement. Ne pas l’appliquer depuis l’agent :
-- la base est partagée avec la production.
-- public.clients.ghl_location_id, private.is_admin() et private.can_access_client(uuid)
-- existent déjà. Le service_role Supabase contourne le RLS.

-- Un sous-compte GHL correspond à un seul dossier. Plusieurs NULL restent permis.
-- Échoue s’il existe déjà deux dossiers avec le même ghl_location_id : à corriger avant application.
create unique index clients_ghl_location_id_uidx
  on public.clients (ghl_location_id)
  where ghl_location_id is not null and btrim(ghl_location_id) <> '';

create table public.buyer_cockpit_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ghl_location_id text not null check (length(btrim(ghl_location_id)) between 1 and 80),
  contact_id text not null check (length(btrim(contact_id)) between 1 and 120),
  contact_email text check (contact_email is null or length(contact_email) <= 200),
  contact_name text check (contact_name is null or length(contact_name) <= 200),
  event text not null check (event in ('coup_de_coeur', 'portal_link')),
  property jsonb check (property is null or jsonb_typeof(property) = 'object'),
  note text check (note is null or length(note) <= 2000),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Identité du bien : centris_id s’il est présent, sinon url. Même instant = même événement.
create unique index buyer_cockpit_events_idem_idx
  on public.buyer_cockpit_events (
    ghl_location_id,
    contact_id,
    event,
    (coalesce(nullif(btrim(property->>'centris_id'), ''), nullif(btrim(property->>'url'), ''), '')),
    occurred_at
  );

create index buyer_cockpit_events_client_idx
  on public.buyer_cockpit_events (client_id, occurred_at desc);

create table public.buyer_portal_access (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  contact_id text not null check (length(btrim(contact_id)) between 1 and 120),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, contact_id),
  unique (token_hash)
);

alter table public.buyer_cockpit_events enable row level security;
alter table public.buyer_portal_access enable row level security;

revoke all on public.buyer_cockpit_events from public, anon, authenticated;
revoke all on public.buyer_portal_access from public, anon, authenticated;

grant select on public.buyer_cockpit_events to authenticated;
grant select on public.buyer_portal_access to authenticated;
grant update (revoked_at) on public.buyer_portal_access to authenticated;
grant all on public.buyer_cockpit_events to service_role;
grant all on public.buyer_portal_access to service_role;

create policy buyer_cockpit_events_select on public.buyer_cockpit_events
  for select to authenticated
  using ((select private.is_admin()) or (select private.can_access_client(client_id)));

create policy buyer_portal_access_admin_select on public.buyer_portal_access
  for select to authenticated
  using ((select private.is_admin()));

create policy buyer_portal_access_admin_update on public.buyer_portal_access
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
