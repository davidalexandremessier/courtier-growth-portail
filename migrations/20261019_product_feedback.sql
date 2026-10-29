-- App-wide product feedback. Kept separate from client-visible requests and client notes.
create table public.product_feedback (
 id uuid primary key default gen_random_uuid(),
 created_by uuid not null,
 client_id uuid references public.clients(id),
 kind text not null check (kind in ('like','blocker','improvement','idea')),
 body text not null check (length(trim(body)) between 1 and 3000),
 route text not null check (length(route) between 1 and 160),
 screen text not null check (length(screen) between 1 and 160),
 screenshot_data text check (screenshot_data is null or (length(screenshot_data) <= 250000 and screenshot_data like 'data:image/jpeg;base64,%')),
 status text not null default 'new' check (status in ('new','todo','working','delivered')),
 decision text not null default 'pending' check (decision in ('pending','approved','refused')),
 history jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index product_feedback_updated_idx on public.product_feedback (updated_at desc);
alter table public.product_feedback enable row level security;
revoke all on public.product_feedback from anon, authenticated;
grant select, insert on public.product_feedback to authenticated;
grant update (status, decision, history, updated_at) on public.product_feedback to authenticated;

create policy product_feedback_admin_read on public.product_feedback for select to authenticated
 using ((select private.is_admin()));
create policy product_feedback_admin_insert on public.product_feedback for insert to authenticated
 with check ((select private.is_admin()) and created_by = (select auth.uid()));
create policy product_feedback_admin_update on public.product_feedback for update to authenticated
 using ((select private.is_admin())) with check ((select private.is_admin()));
