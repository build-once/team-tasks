-- 20261013140000_account_deletion.sql -- what deleting an account needs from the
-- database, and nothing else.
--
-- Build it 26. docs/deletion.md section 6.1 is the design and names exactly five
-- changes; this file is those five and no others. APPLIED NOWHERE when it was
-- written: not local, not staging, not production.
--
-- ---------------------------------------------------------------------------
-- WHY ANY OF THIS IS NEEDED, which is not obvious from "delete the account"
-- ---------------------------------------------------------------------------
--
-- Six foreign keys reference auth.users (id) and all six are `on delete
-- cascade`, so deleting the login row already removes almost everything. The
-- owner's decision 1 of 2026-10-12 is that ONE of those cascades must stop:
-- a task somebody created in SOMEBODY ELSE'S team STAYS, shown as "Former
-- member". Without that, Alice closing her account silently removes work from a
-- team she was only a member of -- which is the same argument
-- 20261002133637_tasks_join_teams.sql already made about `team_id`:
--
--   "Carol losing her own task because Alice closed her account is a stranger
--    deleting Carol's work, and this database has no point-in-time restore on
--    the free plan to undo it with."
--
-- A null owner_id therefore means "the person who created this has gone".
-- "Former member" is a word on a screen, not a column.
--
-- ---------------------------------------------------------------------------
-- THE FIVE CHANGES, AND THE SECOND IS THE ONE THAT WOULD OTHERWISE BREAK IT
-- ---------------------------------------------------------------------------
--
--   1. tasks.owner_id becomes nullable, and its foreign key becomes
--      `on delete set null`.
--   2. tasks_enforce_column_rules() gains a branch. That trigger raises 42501 on
--      ANY change to owner_id -- and a `set null` foreign-key action is performed
--      as an ordinary UPDATE to the row, which fires it. So without this branch
--      the whole deletion is refused and the account cannot be deleted at all.
--   3. a delete policy for a former member's task, because "Owners can remove
--      their own tasks" is `auth.uid() = owner_id`, which is false for a null
--      owner -- so nobody could delete one.
--   4. nothing is needed for READING one: "Creators and team members can read a
--      task" already returns it through its team branch.
--   5. a branch on the storage delete policy, WITHOUT WHICH 3 IS USELESS. The
--      existing policy admits the uploader or the task's creator, and a former
--      member's task has no creator left -- so the team owner that 3 has just
--      given the right to delete the task cannot clear its files, and
--      tasks_refuse_delete_with_files refuses the task while they are there.
--      The deadlock the owner's decision of 8 October removed comes straight
--      back, in the one case nobody looked at.
--
-- 4 is why there are four statements below rather than five.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT ADD
-- ---------------------------------------------------------------------------
--
-- THE TOMBSTONE TABLE. docs/deletion.md section 9.2 and the owner's decision 6
-- settle it -- two columns, no privilege for any role, removed after 30 days --
-- and the owner's instruction of 2026-10-13 is that it is NOT part of this
-- change. It is filed as an issue instead. Nothing here depends on it, and
-- nothing in this change claims a restore cannot bring a deleted person back.
--
-- NO PRIVILEGED DELETE PATH, either. docs/deletion.md section 6.1 rejects one by
-- name: a count or a delete done with the service-role key "needs no policy at
-- all", and the whole virtue of the 8 October decision is that "no part of this
-- app deletes anything with more authority than the person asking". So the
-- server function deletes files as the CALLER, through the policies below, and
-- uses the secret key for exactly one thing: removing the auth.users row, which
-- no policy can express.

-- ---------------------------------------------------------------------------
-- 1. tasks.owner_id: nullable, and the cascade becomes set null
-- ---------------------------------------------------------------------------

alter table public.tasks alter column owner_id drop not null;

-- THE CONSTRAINT IS FOUND BY WHAT IT IS, NOT BY ITS NAME, and that is deliberate.
-- 20260927182443_create_tasks.sql declared the reference INLINE and gave it no
-- name, so its name is whatever PostgreSQL chose. `tasks_owner_id_fkey` is the
-- documented pattern and writing it here would be a guess about this database --
-- so the name is read out of the catalogue, and a push that cannot find exactly
-- one such constraint stops here with nothing applied rather than carrying on.
do $$
declare
  c_name text;
  c_count int;
begin
  select count(*), min(con.conname)
    into c_count, c_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where ns.nspname = 'public'
    and rel.relname = 'tasks'
    and con.contype = 'f'
    and con.conkey = array[
      (select att.attnum
       from pg_attribute att
       where att.attrelid = rel.oid and att.attname = 'owner_id')
    ]::smallint[];

  if c_count <> 1 then
    raise exception
      'Expected exactly one foreign key on public.tasks (owner_id) and found %. Nothing has been applied.',
      c_count;
  end if;

  execute format('alter table public.tasks drop constraint %I', c_name);
end $$;

-- NAMED THIS TIME, so a later migration can find it without a catalogue lookup.
alter table public.tasks
  add constraint tasks_owner_id_fkey
  foreign key (owner_id) references auth.users (id) on delete set null;

comment on column public.tasks.owner_id is
  'Who created this task, or NULL when that person has deleted their account. A null owner means "Former member" on a screen; it is never set by the app, only by this column''s foreign key when the auth.users row goes.';

-- ---------------------------------------------------------------------------
-- 2. The trigger branch, without which the deletion is refused outright
-- ---------------------------------------------------------------------------
--
-- THE WHOLE FUNCTION IS REPLACED because `create or replace` is the only way to
-- change a plpgsql body, and every other line of it is character for character
-- 20261002133637_tasks_join_teams.sql's. The one change is marked, and it is in
-- the owner_id branch.
--
-- WHY IT DOES NOT `return new` LIKE THE DELETED-TEAM BRANCH BELOW IT. That one
-- sits at the END of the update path, after the id and created_at guards have
-- already run. The owner_id guard is FIRST, so returning here would skip them --
-- and a cascade's update must not become a way to change an id. So this branch
-- declines to RAISE and lets the rest of the function run.
--
-- AND THE TWO CASES TELL THEMSELVES APART WITH NO FLAG, exactly as the
-- deleted-team branch does: a foreign key's `set null` action runs AFTER the
-- parent row is gone, so inside this statement there is no auth.users row with
-- the old id. Nobody can use this branch to orphan a task while its creator
-- still has an account, because while they do the exists() below is true.
create or replace function public.tasks_enforce_column_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.team_id is not null
       and not exists (
         select 1
         from public.teams t
         where t.id = new.team_id
           and t.owner_id = new.owner_id
       )
       and not exists (
         select 1
         from public.team_members m
         where m.team_id = new.team_id
           and m.user_id = new.owner_id
       )
    then
      raise exception 'A task can only be added to a team its creator belongs to.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  -- From here on this is an update, so old is populated.

  if new.owner_id is distinct from old.owner_id then
    -- THE DELETED-ACCOUNT CASE, ADDED 2026-10-13. tasks.owner_id is now
    -- "on delete set null", and that action is performed as an ordinary update
    -- to this row, which fires this trigger: new.owner_id null, old.owner_id
    -- the person who has just gone. Without this, deleting an account would be
    -- refused by a guard about who may REASSIGN a task.
    if not (
      new.owner_id is null
      and old.owner_id is not null
      and not exists (
        select 1 from auth.users u where u.id = old.owner_id
      )
    ) then
      raise exception 'owner_id cannot change: a task stays with the person who created it.'
        using errcode = '42501';
    end if;
  end if;

  if new.id is distinct from old.id then
    raise exception 'id cannot change.'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'created_at cannot change.'
      using errcode = '42501';
  end if;

  if new.team_id is distinct from old.team_id then
    -- THE DELETED-TEAM CASE COMES THROUGH HERE TOO, and it is not somebody
    -- moving a task. team_id on this table is "on delete set null", and that
    -- action is performed as an ordinary update to this row, which fires this
    -- trigger: new.team_id null, old.team_id the team that has just gone. The
    -- person deleting the team is not the creator of every task in it, so
    -- without this branch deleting a team would be refused by this trigger --
    -- a guard about who may move a task quietly becoming a rule that teams can
    -- never be deleted.
    if new.team_id is null
       and old.team_id is not null
       and not exists (
         select 1 from public.teams t where t.id = old.team_id
       )
    then
      return new;
    end if;

    if auth.uid() is distinct from old.owner_id then
      raise exception 'Only the person who created a task can move it between teams.'
        using errcode = '42501';
    end if;

    if new.team_id is not null
       and not exists (
         select 1
         from public.teams t
         where t.id = new.team_id
           and t.owner_id = old.owner_id
       )
       and not exists (
         select 1
         from public.team_members m
         where m.team_id = new.team_id
           and m.user_id = old.owner_id
       )
    then
      raise exception 'A task can only be moved into a team its creator belongs to.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.tasks_enforce_column_rules() is
  'Trigger on public.tasks. Enforces what no policy can: id and created_at never change; owner_id never changes EXCEPT to null when its auth.users row has just been deleted; team_id changes only by the task''s creator and only to null or a team they belong to; and a new task''s team_id must name a team its creator belongs to.';

-- `create or replace` keeps the existing grants, so the revoke from PUBLIC that
-- 20261002133637 made still stands. Repeated here rather than assumed, because a
-- privilege that rests on a previous migration not having been undone is a
-- privilege nobody can see.
revoke execute on function public.tasks_enforce_column_rules() from public;

-- ---------------------------------------------------------------------------
-- 3. Who may delete a former member's task
-- ---------------------------------------------------------------------------
--
-- THE TEAM'S OWNER, and nobody else. Written the way
-- 20261002122203_team_rules.sql writes "Team owners can remove a member from
-- their team": reading teams.owner_id DIRECTLY rather than through
-- is_team_member(), because members must not gain this.
--
-- NO is_active() HERE, and that is not an omission: public.tasks already carries
-- the RESTRICTIVE policy "Suspended accounts are refused everything", `for all`,
-- from 20261004114313_suspend_accounts.sql. A restrictive policy ANDs with every
-- permissive one, so a suspended team owner is refused this without the clause.
-- The storage policy in section 4 DOES need it, because storage.objects has no
-- restrictive policy of its own.
--
-- A SEPARATE POLICY RATHER THAN A WIDER EXISTING ONE. Permissive policies OR
-- together, so this adds a case without touching a rule that works -- and
-- "Owners can remove their own tasks" stays exactly as narrow as it was.
--
-- WHAT IT COSTS, stated rather than slipped in: a team's owner can delete a task
-- a departed member wrote in their team. That is the finer version of a power
-- they already have -- deleting the team takes it anyway -- and it is the only
-- way such a row can ever be removed, because its creator has no account.
create policy "Team owners can remove a former member's task"
  on public.tasks
  for delete
  to authenticated
  using (
    owner_id is null
    and team_id is not null
    and exists (
      select 1
      from public.teams t
      where t.id = tasks.team_id
        and t.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 4. And the files on one, without which section 3 is unusable
-- ---------------------------------------------------------------------------
--
-- tasks_refuse_delete_with_files() refuses to delete a task while any object
-- remains under `attachments/<task id>/`, whatever asked -- so the right granted
-- in section 3 is worth nothing unless the same person can clear the files.
--
-- The existing policy, "Attachments: delete a file you attached, or one on your
-- task", admits the uploader or the task's CREATOR. A former member's task has
-- no creator: `creator.owner_id = auth.uid()` can never hold for a null owner,
-- and `objects.owner_id` is the departed person's dangling id, which no live
-- account matches. So without this, nobody at all can clear them.
--
-- AGAIN A SEPARATE POLICY, for the reason section 3 gives, and because the
-- existing one is proved against the real service on staging
-- (evidence/build-it-23-attachments-bucket.md) -- rewriting it would put that
-- evidence back in question for a case it says nothing about.
--
-- is_active() IS HERE, because storage.objects has no restrictive policy: the
-- three policies in 20261008191804 each ask it for themselves, and a fourth that
-- forgot would be a new way round a control docs/plan.md says is total.
--
-- WHAT IT WIDENS, stated: a team's owner can delete a file a THIRD member
-- uploaded to a former member's task. That is the same custodianship the
-- 8 October decision gives a task's creator over everything hanging off their
-- task, handed to the team's owner when the creator is gone -- and only then.
create policy "Attachments: a team owner clears a former member's task"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and (select public.is_active())
    and public.attachments_task_id(objects.name) is not null
    and exists (
      select 1
      from public.tasks t
      join public.teams tm on tm.id = t.team_id
      where t.id = public.attachments_task_id(objects.name)
        and t.owner_id is null
        and tm.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- What nothing here does, so the next reader does not look for it
-- ---------------------------------------------------------------------------
--
-- NOTHING HERE DELETES ANYTHING. There is no routine, no scheduled job and no
-- cascade added by this file. The deletion is nine steps in
-- supabase/functions/delete-account, in the order docs/deletion.md section 3
-- sets out, and the ONLY reason that order is forced is in this file: files
-- before tasks, because a SQL delete cannot remove a file; and tasks before the
-- login, because the right to delete a file on a task comes FROM the task.
--
-- AND ONE ORPHAN REMAINS POSSIBLE, which the owner accepted on 2026-10-12. When
-- a team is deleted BY HAND in the dashboard, a former member's task in it gets
-- team_id null beside an owner_id that is already null -- and then no policy
-- returns it to anybody, not even the one above. `delete-account` removes those
-- rows explicitly (its step 4b), so the only way to reach that state is the
-- dashboard. The sweep is `select count(*) from public.tasks where owner_id is
-- null and team_id is null` -- A COUNT, NOT A LISTING, because those rows hold
-- task text and this repository is public.
