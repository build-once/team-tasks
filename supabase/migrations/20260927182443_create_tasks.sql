-- Tasks: one row per job, owned by the person who created it.
--
-- docs/plan.md, feature 4 ("add tasks and tick them off") and feature 5 ("see
-- only the tasks of teams you belong to"). The rules below are the per-person
-- half of feature 5: a signed-in person reaches their own rows and nothing
-- else. Team-scoped access arrives with the teams and team_members tables and
-- is deliberately not in this migration.
--
-- NOT APPLIED ANYWHERE. This file has never been run against any database.
-- It reaches staging through the change flow in docs/environments.md.

create table public.tasks (
  id uuid primary key default gen_random_uuid(),

  -- Set by the database, not by the app: the default is the signed-in person's
  -- id. The app never sends owner_id, so a request cannot claim to be someone
  -- else. Deleting the account takes their tasks with it.
  owner_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,

  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),

  constraint tasks_title_not_blank check (btrim(title) <> ''),

  -- docs/plan.md: task text is length-limited on purpose, and the input box
  -- carries the "no personal details" request.
  constraint tasks_title_length check (char_length(title) <= 200)
);

comment on table public.tasks is
  'One job on somebody''s list. owner_id is filled in by the database from the signed-in user.';

-- Every row-level security check reads owner_id, so it is worth an index.
create index tasks_owner_id_idx on public.tasks (owner_id);

-- Without this line the rules below do nothing at all.
alter table public.tasks enable row level security;

-- Four rules, one per kind of access. Each is limited to the authenticated
-- role, so a signed-out caller matches none of them and sees nothing.
-- (select auth.uid()) is wrapped in a select on purpose: Postgres then works it
-- out once per query instead of once per row.

create policy "Owners can read their own tasks"
  on public.tasks
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can add tasks for themselves"
  on public.tasks
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

-- using decides which rows may be changed; with check decides what they may be
-- changed into. Both are needed, or a row could be handed to somebody else.
create policy "Owners can change their own tasks"
  on public.tasks
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Owners can remove their own tasks"
  on public.tasks
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
