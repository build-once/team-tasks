-- The upload count, fixed forward: identify the uploader from the ROW rather
-- than from the session, because the insert that commits has no session.
--
-- Build it 25 part 2b, second migration.
-- 20261012120000_upload_daily_count.sql is APPLIED TO STAGING and is NOT edited
-- by this file -- a migration is applied once, and editing an applied one leaves
-- this repository and that database silently disagreeing. This replaces the
-- function's body and adds one reader; the TRIGGER ITSELF IS NOT TOUCHED.
--
-- ---------------------------------------------------------------------------
-- WHAT WENT WRONG, OBSERVED ON STAGING ON 2026-10-12
-- ---------------------------------------------------------------------------
--
-- The owner applied the first migration and ran
-- scripts/staging/build-it-25-upload-count-checks.mjs. The result was IDENTICAL
-- to the run before it: the thirty-first upload answered HTTP 200.
--
-- The coach then read staging through the read-only connector: the migration is
-- recorded, the trigger `attachments_count_upload` exists on storage.objects and
-- is enabled, the function exists, `usage_counts_feature_allowed` lists the three
-- words -- and `usage_counts` held ZERO rows with feature 'uploads' after
-- THIRTY-ONE ACCEPTED UPLOADS.
--
-- So the trigger fires and takes its own early return. The only early return that
-- could do that is `if l_uploader is null then return new; end if`, which means
-- `auth.uid()` IS NULL ON THE INSERT THAT COMMITS.
--
-- And the local sandbox could never have shown it: it inserted into
-- storage.objects directly, as the signed-in role. The Storage API does not.
--
-- ---------------------------------------------------------------------------
-- WHY, READ OUT OF THE STORAGE API'S OWN SOURCE
-- ---------------------------------------------------------------------------
--
-- github.com/supabase/storage, `master`, read 2026-10-12 with the GitHub API.
-- THREE INSERTS HAPPEN PER UPLOAD AND ONLY THE LAST ONE COMMITS.
--
--   src/storage/uploader.ts:83-101   `authorizeUpload` calls `db.testPermission`,
--                                    which inserts the row to see whether the
--                                    caller's policies allow it.
--   src/storage/database/pg.ts:408-423  `testPermission` runs that inside
--                                    `withTransaction` and then throws a private
--                                    sentinel so the transaction ROLLS BACK.
--                                    "if (e === testPermissionRollbackError)
--                                    return result" -- the probe's writes are
--                                    discarded and the caller is told nothing
--                                    failed.
--   src/storage/uploader.ts:239      the real write opens ONE OUTER SUPERUSER
--                                    TRANSACTION: `this.db.asSuperUser()
--                                    .withTransaction(...)`.
--   src/storage/uploader.ts:274      INSIDE it, a SECOND probe as the caller:
--                                    `this.authorizeUpload(db.asCaller(), {...})`.
--                                    Its own comment, at :236-238: "Keep one outer
--                                    superuser transaction. The final caller-policy
--                                    probe shares its locks and ROLLS BACK ONLY ITS
--                                    SAVEPOINT".
--   src/storage/uploader.ts:287      then `db.upsertObject(...)` on the SUPERUSER
--                                    connection. This is the insert that commits,
--                                    and it carries no session -- so auth.uid() is
--                                    null.
--
-- AND THE UPLOADER IS IN THE ROW. src/storage/database/pg.ts:1561-1573,
-- `createObject`:
--
--     owner:    isUuid(data.owner || '') ? data.owner : undefined,
--     owner_id: data.owner,
--
-- so `owner_id` carries it raw and the legacy `owner` column only when it is a
-- uuid -- which is why the cast below must not assume one.
--
-- AND `data.owner` IS THE VERIFIED TOKEN'S SUBJECT, NOT ANYTHING FROM THE BODY:
-- src/http/plugins/jwt.ts:57, `request.owner = payload.sub`, set by the server
-- after it verifies the token. Section 4 is what that does and does not rule out.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS CHANGES, IN ONE SENTENCE
-- ---------------------------------------------------------------------------
--
-- The uploader is read from `coalesce(auth.uid(), new.owner_id)`, and the COUNT
-- is written only on the insert that has no session -- the one that commits.
-- A probe is still CHECKED, so the refusal still happens before the bytes are
-- sent, but a probe never writes a count. One upload, one count, and no reliance
-- on somebody else's rollback being correct.

-- ---------------------------------------------------------------------------
-- 1. A reader for the count, callable by nothing
-- ---------------------------------------------------------------------------
--
-- WHY A SECOND FUNCTION EXISTS AT ALL. public.count_daily_use() always
-- increments: it is one statement on purpose, so that the comparison and the
-- increment cannot be separated (20261008115900_usage_counts.sql). That is right
-- for the insert that commits and wrong for a probe, which must be able to ASK
-- without spending anything.
--
-- WHO MAY CALL IT: NOBODY. Every grant is revoked, including from service_role,
-- exactly as public.attachments_lock_key(text, uuid) is -- and for the same
-- reason: it is called only from inside a `security definer` function, which runs
-- as this function's owner and therefore needs no grant.
--
-- SO THIS ADDS NO WAY FOR ANY APP USER TO READ A COUNT, which is what
-- docs/plan.md requires: "Who can see it: no app user, not even the person whose
-- count it is." A function nobody holds EXECUTE on is not a read anybody has.
-- The only new reader is the trigger, which already had to be trusted with the
-- counting.
--
-- It can read the table because it runs as the table's OWNER. The first
-- usage_counts migration revoked every privilege from PUBLIC, anon, authenticated
-- and service_role; an owner's own privileges are not among those, so the role
-- that applied these migrations still holds them.
--
-- stable, not volatile: it reads and does not write. That also means PostgreSQL
-- may call it once per statement rather than once per row, which is harmless
-- here -- it is a courtesy check, and section 2 says why the authority is
-- elsewhere.
create function public.uploads_used_today(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select uc.used
      from public.usage_counts uc
      where uc.user_id = p_user_id
        and uc.feature = 'uploads'
        and uc.day = (now() at time zone 'utc')::date
    ),
    0
  );
$$;

comment on function public.uploads_used_today(uuid) is
  'How many uploads this person has already been counted for on today''s UTC day, or 0. Read-only, and EXECUTE is revoked from every role including service_role -- it is called only from inside public.attachments_count_upload(), which is security definer and runs as this function''s owner. It adds no way for any app user to read a count. The UTC day is worked out here and is never an argument, the same way public.count_daily_use() does it.';

revoke execute on function public.uploads_used_today(uuid) from public;
revoke execute on function public.uploads_used_today(uuid) from anon;
revoke execute on function public.uploads_used_today(uuid) from authenticated;
revoke execute on function public.uploads_used_today(uuid) from service_role;

-- ---------------------------------------------------------------------------
-- 2. The trigger function, replaced
-- ---------------------------------------------------------------------------
--
-- `create or replace`, so the trigger created by 20261012120000 keeps pointing at
-- it and nothing about the trigger changes. THAT IS ALSO WHY THIS MIGRATION NEEDS
-- NO TRIGGER PRIVILEGE ON storage.objects and carries no pre-check: it creates no
-- trigger. The first migration's section 0 did that job once, and the owner's push
-- of 12 October got past it, which is now a fact rather than an expectation.
--
-- EVERY PROPERTY AGREED FOR THE FIRST VERSION IS KEPT, and each is marked below:
--
--   (a) the attachments bucket and nothing else
--   (b) a row with no owner is neither counted nor refused -- the service-role
--       restore
--   (c) a refused or rolled-back upload spends no slot, THE STORAGE API'S OWN
--       PROBES INCLUDED
--   (d) no client role can call the counter
--   (e) the message carries no path, no file name and no number
create or replace function public.attachments_count_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The day's limit, and still the only place in this project it is written.
  -- docs/plan.md's "three numbers, one place" was changed by the owner on
  -- 2026-10-12 for the reason supabase/functions/_shared/limits.ts now carries:
  -- a trigger cannot read a TypeScript file.
  c_uploads_per_day constant integer := 30;

  -- WHO IS ASKING, from the session. NULL on the insert that commits, which is
  -- the whole of what this migration is about.
  l_caller uuid := auth.uid();

  -- WHO THE ROW SAYS UPLOADED IT. Null when nothing usable is there.
  l_owner uuid;

  l_uploader uuid;
begin
  -- (a) NOT OUR BUCKET: nothing to count and nothing to refuse.
  --
  -- `is distinct from`, so a null bucket_id takes this branch instead of making
  -- the comparison unknown and falling through.
  if new.bucket_id is distinct from 'attachments' then
    return new;
  end if;

  -- -----------------------------------------------------------------
  -- THE ROW'S OWNER, CAST SO THAT NOTHING CAN RAISE
  -- -----------------------------------------------------------------
  --
  -- `::text::uuid` AND NOT `::uuid`, which is the same trick
  -- 20261008191804_attachments_bucket.sql uses on this column and for the same
  -- reason: NO SUPABASE PAGE STATES ITS TYPE. Through text works whether the
  -- column is text or uuid.
  --
  -- AND IT IS WRAPPED, because the Storage API's own source shows the value need
  -- not be a uuid at all: `owner: isUuid(data.owner || '') ? data.owner :
  -- undefined, owner_id: data.owner` (src/storage/database/pg.ts:1567-1568). The
  -- legacy column is guarded and this one is not, so a non-uuid can reach here --
  -- and an unhandled cast error would abort every upload rather than refuse one.
  --
  -- A BLOCK WITH AN EXCEPTION HANDLER IS A SUBTRANSACTION, which costs a little
  -- on every upload. It is taken over a regular-expression test on purpose: a
  -- pattern this file invents would reject uuid spellings PostgreSQL accepts, and
  -- the failure would be SILENT -- a null uploader is "not counted", so a too-strict
  -- pattern would quietly stop counting rather than break.
  begin
    l_owner := new.owner_id::text::uuid;
  exception when others then
    l_owner := null;
  end;

  -- The session first, the row second. On a direct insert there is a session and
  -- no owner yet; on the insert that commits there is an owner and no session.
  l_uploader := coalesce(l_caller, l_owner);

  -- (b) NOBODY TO COUNT AGAINST: NOT COUNTED, AND NOT REFUSED.
  --
  -- This is the branch scripts/backup/restore-backup.mjs depends on, and it is
  -- UNCHANGED by this migration. Supabase's own ownership page: "When using the
  -- `service_key` to create a resource, the owner will not be set and the resource
  -- will be owned by anyone." So a restore arrives with no session AND no owner,
  -- and a recovery of more than thirty files must not refuse itself on the worst
  -- day this project will ever have.
  if l_uploader is null then
    return new;
  end if;

  -- -----------------------------------------------------------------
  -- A PROBE IS CHECKED AND NEVER COUNTED
  -- -----------------------------------------------------------------
  --
  -- A session means this is one of the Storage API's two caller-role probes --
  -- src/storage/uploader.ts:83-101 and :274 -- or somebody inserting into
  -- storage.objects directly. Either way it is NOT the insert that commits.
  --
  -- (c) SO IT WRITES NOTHING. The first version counted here and the count was
  -- rolled back with the probe, which gave the right total by accident: it
  -- depended on somebody else's code rolling back correctly, and on the two
  -- probes being in transactions that end. Checking without writing needs neither
  -- to be true, so ONE REAL UPLOAD CANNOT BE COUNTED TWICE whatever the Storage
  -- API does with its probes in a later version.
  --
  -- WHY CHECK AT ALL RATHER THAN RETURN: because this is where a refusal belongs.
  -- The first probe happens in `prepareUpload`, BEFORE THE BYTES ARE SENT, and a
  -- raise from here propagates -- `testPermission` re-throws anything that is not
  -- its own sentinel (src/storage/database/pg.ts:415-419). So somebody at their
  -- limit is refused before they have uploaded anything, which is the cheapest
  -- possible place for both of us.
  --
  -- AND IT IS A COURTESY, NOT THE CONTROL, which is the same thing
  -- issue #186 records about the per-isolate lock. Two uploads at 29 both read 29
  -- here and both pass; the two committing inserts then call count_daily_use,
  -- which compares and increments in ONE statement, so one is allowed and the
  -- other refused. The count is the control because every caller reads the same
  -- row. What this check buys is that the ordinary case fails early and cheaply.
  if l_caller is not null then
    if public.uploads_used_today(l_uploader) >= c_uploads_per_day then
      raise exception 'You''ve reached today''s limit. It resets tomorrow.'
        using errcode = '54000';
    end if;

    return new;
  end if;

  -- -----------------------------------------------------------------
  -- NO SESSION AND AN OWNER: THIS IS THE INSERT THAT COMMITS. COUNT IT.
  -- -----------------------------------------------------------------
  --
  -- (d) count_daily_use's EXECUTE is granted to service_role and revoked from
  -- PUBLIC, anon and authenticated. This runs as its owner, so no grant is added
  -- and no client role gains anything.
  --
  -- AN ERROR FROM IT IS A REFUSAL rather than a pass, and it is free here: this is
  -- plpgsql with no handler around this call, so a raise from inside it -- an
  -- unknown feature word, a user id with no account -- aborts the insert.
  --
  -- WHICH MEANS A UUID IN owner_id THAT IS NOT A USER WILL REFUSE THE UPLOAD,
  -- by way of usage_counts' foreign key, rather than being counted against
  -- nobody. That is the fail-closed direction and it is reachable only by
  -- something already holding the service-role key, which has larger options.
  if not public.count_daily_use(l_uploader, 'uploads', c_uploads_per_day) then
    -- (e) The same sentence as supabase/functions/_shared/limits.ts, character for
    -- character, and scripts/screen-state-check.mjs compares the two. No path, no
    -- file name, no count, no limit: docs/plan.md forbids a file name in an error,
    -- and there is nothing here for one to travel in.
    --
    -- REACHING THIS IS THE RARE CASE, not the ordinary one: the probe above
    -- refuses somebody at their limit before the bytes are sent. This fires when
    -- the probe passed and the limit was reached between the two -- the race in
    -- the comment above -- or when there was no probe at all, which is the signed
    -- upload URL path (section 4).
    raise exception 'You''ve reached today''s limit. It resets tomorrow.'
      using errcode = '54000';
  end if;

  return new;
end;
$$;

comment on function public.attachments_count_upload() is
  'Trigger on storage.objects. Counts one upload per person per UTC day against a limit of 30. The uploader is coalesce(auth.uid(), new.owner_id) -- the row, not only the session, because the Storage API''s committing insert runs on a superuser connection with no session (supabase/storage src/storage/uploader.ts:239,287). An insert that HAS a session is one of that API''s caller-role probes: it is checked against the limit and never counted, so one upload cannot be counted twice whatever happens to a probe. A row with neither a session nor an owner is neither counted nor refused, which is the service-role restore path. The count is written in the same transaction as the row, so a refused or rolled-back upload spends no slot. security definer; no client role holds EXECUTE on either counter. The message carries no path, no file name and no number. See docs/plan.md, "Files attached to a task".';

-- ---------------------------------------------------------------------------
-- 3. The trigger is NOT touched
-- ---------------------------------------------------------------------------
--
-- It already exists, enabled, BEFORE INSERT FOR EACH ROW, created by
-- 20261012120000 and read back on staging by the coach on 2026-10-12. There is
-- nothing to add, and `create trigger` again would fail on the name.
--
-- FOR EACH ROW still matters for the reason it did: a multi-row insert is counted
-- per row. What changed is which rows count.

-- ---------------------------------------------------------------------------
-- 4. The questions this change had to answer, and what is NOT settled
-- ---------------------------------------------------------------------------
--
-- WHAT HAPPENS AT THIRTY, WHICH IS WHERE THE REFUSAL SURFACES. The first probe
-- in `prepareUpload` runs before any byte is sent, so somebody with 30 counted is
-- refused there -- by the check above, which writes nothing. The bytes are never
-- uploaded, the count stays at 30, and the Storage API turns the raise into a
-- refusal because `testPermission` re-throws anything that is not its own
-- sentinel. WHAT THAT LOOKS LIKE AS AN HTTP ANSWER IS STILL UNKNOWN and is still
-- scripts/staging/build-it-25-upload-count-checks.mjs section 3's job to print.
--
-- CAN ONE REAL UPLOAD BE COUNTED TWICE? No, and not by luck: the only branch that
-- writes is the one with NO session, and the Storage API's committing insert is
-- the only insert of the three that has no session. The two probes are checked and
-- never counted, so it does not matter whether they are rolled back, nor whether a
-- later version of that API keeps rolling them back.
--
-- CAN A SIGNED-IN CALLER FORGE owner_id? Not through the normal upload path:
-- `request.owner = payload.sub` is set by the server from the verified token
-- (src/http/plugins/jwt.ts:57) and the body is never consulted for it. And a
-- forged value would cost the forger rather than anybody else in the only
-- direction that works -- counting somebody ELSE's day down requires their id,
-- and the insert policy on this bucket already refuses a row whose owner_id is
-- neither null nor the caller
-- (20261008191804_attachments_bucket.sql, "Attachments: attach a file to a task
-- you can see"). NOT CONFIRMED: every other Storage endpoint. Four were read --
-- createObject, uploadSignedObject, the JWT plugin and the uploader -- and the
-- S3-compatible and TUS protocols were not.
--
-- A SIGNED UPLOAD URL IS COUNTED, AND AGAINST THE RIGHT PERSON, BUT WITHOUT AN
-- EARLY REFUSAL. src/http/routes/object/uploadSignedObject.ts:88-99 takes the
-- owner out of the signed token and then runs the whole upload `asSuperUser()` --
-- so there is NO caller probe at all. The committing insert carries the owner, so
-- it is counted against whoever asked for the URL; somebody at their limit is
-- refused on that insert, after the bytes. THIS APP DOES NOT USE THEM
-- (`web/src/app/tasks/AttachFile.tsx` uploads directly), so this is written down
-- rather than designed for.
--
-- UPSERT WOULD BE COUNTED, AND IS NOT REACHABLE HERE. `upsertObject` is
-- `INSERT ... ON CONFLICT DO UPDATE` (src/storage/database/pg.ts:1728-1740), and a
-- BEFORE INSERT trigger fires on the insert attempt whether or not the conflict
-- then turns it into an update -- so replacing a file would spend a slot, which is
-- defensible, since replacing one spends the traffic. It is not reachable in this
-- app: the bucket has NO update policy, and the app sends `upsert: false`
-- (`web/src/app/tasks/AttachFile.tsx:157`). NOT CONFIRMED: what the trigger does
-- on the UPDATE half of such a statement, because nothing here can make one.
--
-- AND A DIRECT INSERT AS A SIGNED-IN PERSON IS NOW CHECKED AND NOT COUNTED, which
-- is the one thing this change makes weaker than the first version. It is
-- believed unreachable -- the `storage` schema is not exposed by the Data API, so
-- a browser has no way to insert a row into storage.objects except through the
-- Storage API -- and that is BELIEVED rather than confirmed. If it ever becomes
-- reachable, that path would not be counted.
--
-- ---------------------------------------------------------------------------
-- 5. The read-backs, for after it is applied
-- ---------------------------------------------------------------------------
--
--   select p.proname, p.prosecdef, p.provolatile,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated_may,
--          has_function_privilege('service_role',  p.oid, 'execute') as service_role_may
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('attachments_count_upload', 'uploads_used_today');
--
--   -- both must be security definer, and BOTH must be false for both roles
--
--   select pg_get_functiondef(p.oid) ~ 'owner_id' as reads_the_row
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'attachments_count_upload';
--
-- And the one that actually matters, after one upload through the app:
--
--   select count(*) > 0 as the_upload_was_counted
--   from public.usage_counts where feature = 'uploads';
--
-- None of them reads a row of anybody's data.
