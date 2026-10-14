-- 20261013170000_my_attachment_names.sql -- which attachment objects did I
-- upload? One read, and it exists because a deletion got it wrong.
--
-- Build it 26, after the owner's Dave test on staging, 13 October 2026.
-- APPLIED NOWHERE when it was written.
--
-- ---------------------------------------------------------------------------
-- WHAT WENT WRONG, AND WHY ONLY A REAL RUN COULD FIND IT
-- ---------------------------------------------------------------------------
--
-- `delete-account` has to remove every file the departing person UPLOADED,
-- wherever it is -- including on a task that SURVIVES them, because
-- `storage.objects` has no foreign key to `auth.users` and nothing else would
-- ever remove those rows. Its first version did that by attempting each file
-- one at a time and TRUSTING THE DELETE POLICY TO REFUSE the ones that were not
-- the caller's.
--
-- That reasoning is sound for a task somebody ELSE created, and wrong for a task
-- the CALLER created. The policy
-- "Attachments: delete a file you attached, or one on your task" admits the
-- uploader OR THE TASK'S CREATOR -- so on Dave's own surviving task nothing was
-- refused, and the file another member had attached to it was deleted with his.
--
-- THE OWNER'S DAVE TEST OF 13 OCTOBER 2026 IS WHAT FOUND IT. The task survived
-- with `owner_id` null, as it should, and with ZERO files: one uploaded by Dave
-- at 14:37:33Z and one by another member at 14:38:35Z, both gone. **The unit test
-- could not have seen it**: it stubbed the policy, so "the policy refuses what is
-- not yours" was an assumption the test shared with the bug.
--
-- ---------------------------------------------------------------------------
-- SO THE FUNCTION STOPS INFERRING AND ASKS
-- ---------------------------------------------------------------------------
--
-- `public.my_attachment_names()` returns the names of the attachment objects
-- whose `owner_id` is the caller's, and nothing else. `delete-account` deletes
-- exactly those on a surviving task, rather than attempting everything and
-- reading a refusal as "not mine".
--
-- WHY IT HAS TO BE `security definer`. No client role may read
-- `storage.objects` at all through PostgREST -- the `storage` schema is not
-- exposed by the Data API -- and the SELECT policy on that table is about
-- OPENING a file rather than about listing who uploaded one. More to the point,
-- a storage LISTING cannot answer this: the installed client marks `owner` as
-- "NOT returned by list() or remove() operations. This field should not be
-- relied upon."
--
-- WHICH MEANS THE GUARDS IN THE BODY ARE THE WHOLE OF THE SAFETY, and they are
-- the three 20261007204900_ai_suggestions_consent.sql's `my_ai_suggestions()`
-- uses, for the same reasons:
--
--   set search_path = ''   so no schema is searched implicitly. A function
--                          running with more rights than its caller must not
--                          resolve a name through a path somebody else can
--                          change.
--   schema-qualified       the consequence: storage.objects, public.is_active()
--                          and auth.uid() are each written in full.
--   stable                 it reads and changes nothing.
--
-- AND IT TAKES NO ARGUMENTS, which is the property worth noticing: who is asking
-- comes from `auth.uid()` inside the body, so there is no parameter a caller
-- could point at somebody else. The same shape, and the same reason, as
-- `my_ai_suggestions()` and `is_active()`.
--
-- IT ASKS is_active() ITSELF, because `security definer` means the restrictive
-- policies are never evaluated on this path -- so a suspended person would
-- otherwise read something while being refused everything else. That is the
-- hole 20261007204900 describes about its own function, in those words: "the
-- quiet kind of hole, where a fourth door ignores a rule the other three keep."
--
-- ---------------------------------------------------------------------------
-- WHAT IT RETURNS, AND WHAT THAT IS
-- ---------------------------------------------------------------------------
--
-- A set of `storage.objects.name` values, each of which is a PATH --
-- `<task id>/<file name>` -- so each carries a task's id and a FILE NAME
-- SOMEBODY'S PHONE CHOSE. docs/plan.md marks a file name as free text about a
-- person, and forbids one reaching an error report.
--
-- So: it returns ONLY THE CALLER'S OWN rows, which are names they chose
-- themselves; the two callers are `delete-account`, which deletes them, and the
-- export, which lists the caller their own file names and already did. Nothing
-- here lets anybody read a name they did not write.
--
-- ONLY THE `attachments` BUCKET. There is one bucket in this project and this
-- function is about that one; a later bucket must not arrive inside this answer
-- by default.
--
-- ---------------------------------------------------------------------------
-- WHY NOT THE SERVICE-ROLE KEY INSTEAD
-- ---------------------------------------------------------------------------
--
-- Because `delete-account` would then be reading a table with no rule in front
-- of it, and docs/deletion.md §6.1 rejects a privileged path by name: the virtue
-- of the owner's decision of 8 October is that "no part of this app deletes
-- anything with more authority than the person asking". A `security definer`
-- function that returns the caller's own rows and nothing else keeps that true,
-- and it is readable by anybody reviewing this file -- which a key is not.

create function public.my_attachment_names()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'attachments'
    and public.is_active()
    -- `owner_id` IS TEXT, not uuid, and both sides are cast for the reason
    -- 20261008191804_attachments_bucket.sql gives about the same comparison in
    -- its own policies: Supabase's own example casts auth.uid() to text, and a
    -- text column can hold something that is not a uuid at all.
    and o.owner_id::text = (select auth.uid())::text
    -- A name that is not `<task id>/<file name>` belongs to no task, so it is
    -- not something this app put there and not something it will delete.
    and public.attachments_task_id(o.name) is not null
  order by o.name;
$$;

comment on function public.my_attachment_names() is
  'The names (paths) of the attachment objects the signed-in person uploaded, and nothing else. Takes no arguments: who is asking comes from auth.uid() inside the body, so it can never be asked about somebody else. Empty for a suspended caller and for a signed-out one. security definer because no client role can read storage.objects at all, and because a storage listing does not say who uploaded a file -- the client marks `owner` as not returned by list(). Used by delete-account, to remove exactly the caller''s own uploads from tasks that survive them, and by the export, to list the caller their own files.';

-- WHO MAY CALL IT: authenticated, and nobody else. The same three lines
-- 20261002122203_team_rules.sql, 20261004114313_suspend_accounts.sql and
-- 20261007204900_ai_suggestions_consent.sql each use, for the same reason that
-- last one gives: EXECUTE on a function in `public` is granted to PUBLIC by
-- default, and the way to secure a `security definer` function is to grant the
-- narrowest thing that works.
--
-- `anon` IS REVOKED EXPLICITLY as well as PUBLIC, because a grant to PUBLIC is
-- not the same object as a grant to a role and revoking one does not remove the
-- other. A signed-out caller would get nothing anyway -- auth.uid() is null and
-- is_active() is false -- but a function about somebody's files should not be
-- callable by somebody who is not somebody.
revoke execute on function public.my_attachment_names() from public;
revoke execute on function public.my_attachment_names() from anon;
grant execute on function public.my_attachment_names() to authenticated;

-- AND NOT TO service_role, deliberately. No server function needs it: the one
-- that uses it, delete-account, calls it as the CALLER -- which is the whole
-- point, because the answer is "what did the person asking upload". A grant to
-- service_role would be a way to ask about anybody, since auth.uid() is null on
-- an admin connection and the answer would simply be empty -- useless, and a
-- privilege nobody needs is a privilege to remove later.

-- ---------------------------------------------------------------------------
-- What this migration does NOT do
-- ---------------------------------------------------------------------------
--
-- It adds no table, no column, no policy and no trigger, and it changes nothing
-- that exists. `20261013140000_account_deletion.sql` is already applied to
-- staging, so this is a SECOND migration rather than an edit to that one --
-- which is the only honest shape once something is applied anywhere.
--
-- AND IT MAKES NO NEW DATA. The rows it reads are the ones Storage already
-- writes for every upload, and the appendix's "What Storage records about each
-- file" row already covers them. This change lets the person who uploaded a
-- file read back its name, which the export already showed them.
