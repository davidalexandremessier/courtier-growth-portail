-- Pilote « Démarrer ici ». Fichier de migration seulement.
-- Ne pas l’appliquer depuis l’agent : la base est partagée avec la production.
-- anon et authenticated n’ont aucun droit. Le service_role contourne le RLS.
-- L’API ne lit cette table qu’après la liste blanche du pilote, ou après private.is_admin().

create table public.demarrer_ici_progress (
  location_id text primary key check (location_id ~ '^[A-Za-z0-9]{10,40}$'),
  broker jsonb not null default '{}'::jsonb check (jsonb_typeof(broker) = 'object'),
  steps jsonb not null check (jsonb_typeof(steps) = 'object'),
  help jsonb check (help is null or jsonb_typeof(help) = 'object'),
  last_check_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.demarrer_ici_progress enable row level security;

revoke all on public.demarrer_ici_progress from public, anon, authenticated;
grant all on public.demarrer_ici_progress to service_role;
