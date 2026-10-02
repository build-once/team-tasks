# Evidence: Build it 15 part 3 (contract — drop the superseded task rules)

Issue #90, part 3 of four. Migration:
`supabase/migrations/20261002170244_tasks_drop_owner_only_rules.sql`.

**What this file contains so far is a LOCAL check only.** It was produced by the assistant on a
throwaway PostgreSQL cluster on the owner's own machine — not staging, not production, and not the
coach's sandbox. Sections 4 and 5 are the staging evidence and are **empty until the owner fills
them in**; nothing here is a substitute for them.

- **Staging apply: not done.** Rule 19 — the assistant does not run `db push` anywhere.
- **`scripts/staging/build-it-15-checks.mjs`: not run by the assistant**, on staging or anywhere.
  The script is unchanged by this pull request.

## 1. The local cluster

PostgreSQL 17.10, started by the assistant in its scratchpad on port 55432, with trust
authentication and no network listener beyond `127.0.0.1`. Deleted at the end of the session. It is
not the staging Postgres version — **unverified: no version has been read back from staging or
production**, which `20261002122203_team_rules.sql` already notes for `security_invoker`.

Supabase's `auth` schema does not exist in a plain cluster, so a stand-in was written for it. This
is the whole of it:

```sql
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Supabase's auth.uid() reads the request JWT. Here it reads a session setting,
-- so a test can say "now I am Carol" without a real token.
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('sandbox.uid', true), '')::uuid $$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
```

Then the three people, two teams and the grants Supabase makes by default:

```sql
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.invalid'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.invalid'),
  ('33333333-3333-3333-3333-333333333333', 'carol@example.invalid');

insert into public.teams (id, name, owner_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Alice team',
   '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-4000-8000-000000000001', 'Carol team',
   '33333333-3333-3333-3333-333333333333');

insert into public.team_members (team_id, user_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001',
   '33333333-3333-3333-3333-333333333333');

grant select, insert, update, delete on public.tasks to anon, authenticated;
grant select on public.teams, public.team_members, public.team_roster to anon, authenticated;
grant select, insert, update on public.profiles to anon, authenticated;
grant delete on public.team_members to authenticated;
```

Every name above is invented. No production data was captured, read or copied, so **there was
nothing to redact and nothing has been redacted** (AGENTS.md rule 18). The three email addresses use
the reserved `.invalid` suffix and belong to nobody.

Two databases were then built from the same seeded template:

- **`sandbox_before`** — the five migrations already on `main`, and nothing else.
- **`sandbox_after`** — the same, plus `20261002170244_tasks_drop_owner_only_rules.sql`.

Applying the contract migration printed exactly three lines and exited 0:

```
DROP POLICY
DROP POLICY
DROP POLICY
exit: 0
```

## 2. Every policy on `public.tasks`, before and after

Read from `pg_policies`, not from the migration files.

**Before** — seven policies:

| cmd | policyname | using | with check |
|---|---|---|---|
| DELETE | Owners can remove their own tasks | `(select auth.uid()) = owner_id` | — |
| INSERT | Owners can add tasks for themselves | — | `(select auth.uid()) = owner_id` |
| INSERT | You can add a task for yourself, or for a team you belong to | — | `((select auth.uid()) = owner_id) and ((team_id is null) or is_team_member(team_id))` |
| SELECT | Creators and team members can read a task | `((select auth.uid()) = owner_id) or ((team_id is not null) and is_team_member(team_id))` | — |
| SELECT | Owners can read their own tasks | `(select auth.uid()) = owner_id` | — |
| UPDATE | Creators and team members can change a task | `((select auth.uid()) = owner_id) or ((team_id is not null) and is_team_member(team_id))` | `((team_id is null) and ((select auth.uid()) = owner_id)) or ((team_id is not null) and is_team_member(team_id))` |
| UPDATE | Owners can change their own tasks | `(select auth.uid()) = owner_id` | `(select auth.uid()) = owner_id` |

**After** — four policies, one per command, every one `PERMISSIVE` and limited to `{authenticated}`:

```
  cmd   |                          policyname                          | permissive |      roles
--------+--------------------------------------------------------------+------------+-----------------
 DELETE | Owners can remove their own tasks                            | PERMISSIVE | {authenticated}
 INSERT | You can add a task for yourself, or for a team you belong to  | PERMISSIVE | {authenticated}
 SELECT | Creators and team members can read a task                    | PERMISSIVE | {authenticated}
 UPDATE | Creators and team members can change a task                  | PERMISSIVE | {authenticated}
(4 rows)
```

Row-level security is still on, and the trigger is still there and enabled:

```
 rls_enabled | rls_forced
-------------+------------
 t           | f
(1 row)

           tgname           | tgenabled
----------------------------+-----------
 tasks_enforce_column_rules | O
(1 row)
```

`tgenabled = 'O'` is PostgreSQL's code for "enabled, fires in origin and local sessions" — the
default.

## 3. The same questions asked of both databases

One script, run against `sandbox_before` and `sandbox_after`, and the two outputs diffed. Each
statement is its own transaction (`ON_ERROR_STOP` off, no explicit `BEGIN`), so an expected refusal
does not abandon the rest — the same way PostgREST sends them.

Sections A to F are the questions
`scripts/staging/build-it-15-checks.mjs` asks, in its order. Section G is the stranded task, which
that script does not cover.

```sql
-- A. Alice creates a team task and a personal task
-- B. Carol, a member of the Alice team:
--    B1 can see it / B2 can tick it / B3 can rename it / B4 CANNOT delete it /
--    B5 it survived / B6 CANNOT take it over / B7 CANNOT move it to her own team /
--    B8 CANNOT make it personal / B9 sees nothing of Alice's personal task
-- C. Bob, in neither team:
--    C1 sees nothing / C2 CANNOT tick / C3 sees nothing of the personal task /
--    C4 CANNOT create a task for the Alice team
-- D. Alice, the creator:
--    D1 CANNOT give it away / D2 CANNOT move it into a team she is not in /
--    D3 CAN move her own task back to personal / D4 Carol then stops seeing it
-- E. Signed out (role anon): sees nothing
-- F. Alice deletes her own two rows
-- G. The stranded task:
--    G0 Carol files a task into the Alice team while she is still a member
--    G1 Alice, the team owner, removes Carol from the team
--    G2 Carol can still SEE it / G3 can she still rename it? /
--    G4 can she pull it back to personal? / G5 rename it once personal? /
--    G6 delete it?
-- H. Nothing left behind
```

### The diff: one line, out of 177

```diff
@@ -160,7 +160,7 @@
 (1 row)

 -- G3 can Carol still rename it? THIS IS THE ONE DIFFERENCE
-UPDATE 1
+ERROR:  new row violates row-level security policy for table "tasks"
 -- G4 Carol can still pull it back to personal (expect UPDATE 1)
 UPDATE 1
```

(The `+` line is shown without `psql`'s file-and-line prefix, which is a path in the assistant's
scratchpad. Nothing else is altered.)

**Sections A to F are byte-identical between the two databases** — the same results *and the same
error messages*. That is the claim the issue asks for: contracting changes nothing anyone can do, so
re-running the 26 staging checks should produce the same 26 results.

### Why the messages do not change, which is the surprising part

`tasks_enforce_column_rules` is a `BEFORE ROW` trigger, and a `BEFORE ROW` trigger runs **before** a
policy's `with check` is evaluated. Wherever the trigger and a `with check` would both refuse, the
trigger gets there first and its sentence is what the caller sees. So the two places where the
dropped policies were wider than the surviving ones were already being refused one step earlier:

- **"Bob CANNOT create a task for Alice's team"** — still `ERROR: A task can only be added to a team
  its creator belongs to.`, from the trigger, both before and after.
- **"Alice CANNOT move her task into a team she is not in"** — still `ERROR: A task can only be
  moved into a team its creator belongs to.`, from the trigger, both before and after.

### The one answer that does change: the stranded task

A **stranded task** is one whose `team_id` names a team its creator is no longer in. The only way to
make one in this database is for a team's owner to delete a `team_members` row —
`"Team owners can remove a member from their team"`, from `20261002122203_team_rules.sql`. **No
screen does that**: searched across `web/src` on 2026-10-02, the only two mentions of `team_members`
are comments, in `web/src/lib/teams.ts:87` and `web/src/app/teams/page.tsx:166`. Deleting the *team*
strands nothing — `team_id` is `on delete set null`, so those tasks come back as personal.

What Carol can do with her stranded task, after the contract migration (from `sandbox_after`):

| | Result |
|---|---|
| G2 see it | 1 row |
| G3 rename it | **refused** — `new row violates row-level security policy for table "tasks"` |
| G4 move it back to personal | `UPDATE 1` |
| G5 rename it, now that it is personal | `UPDATE 1` |
| G6 delete it | `DELETE 1` |

G3 is the only thing she loses, and G4 is her way out of it. Nothing is locked away. The migration's
section 3 argues this is `docs/plan.md`'s rule rather than a regression: someone removed from a team
is not a member, and feature 4 gives ticking and renaming to members.

Filed as issue #91: nothing in the app offers Carol the G4 route.

## 4. Staging apply

Recorded from the owner's and the coach's reports in the pull request thread; the agent that wrote
this section did not run any of these commands and did not see their raw output.

- **Date:** 2 October 2026.
- **Target:** staging, project reference `ghskxrhqlhvrhpnivqbd`.
- **`supabase db push --dry-run`**, run by the owner: listed only
  `20261002170244_tasks_drop_owner_only_rules.sql`.
- **`supabase db push`**, run by the owner against staging.
- **Read back by the coach through the staging read-only connector:**
  - (a) staging's migration list now ends with `20261002170244 tasks_drop_owner_only_rules`.
  - (b) `pg_policies` on `public.tasks` shows exactly four policies:
    - DELETE "Owners can remove their own tasks"
    - INSERT "You can add a task for yourself, or for a team you belong to"
    - SELECT "Creators and team members can read a task"
    - UPDATE "Creators and team members can change a task"
- **Unverified — whether `supabase/.temp/project-ref` was checked before the push:** the report does
  not say. The project reference above is the one reported as the target.

## 5. The 26 checks, re-run on staging

As reported by the owner, who ran `node scripts/staging/build-it-15-checks.mjs`, unchanged, after the
apply in section 4, with the same `ALICE_TEAM_ID` and `CAROL_TEAM_ID` as part 1.

**Result: 26 PASS, 0 FAIL, 0 UNVERIFIED.**

Every check name, verdict and error message is identical to the part 1 run in
`evidence/build-it-15-part-1.md` section 2, as predicted: the BEFORE trigger refuses before any
`with check` is evaluated. The script's cleanup deleted its 2 rows and confirmed them gone.

The raw script output is not pasted here; the totals above are the owner's report.

Independent check: the coach's sandbox (two databases, before and after) gave byte-identical attack
output, and reproduced the single intended change (a stranded task cannot be renamed in place but can
be moved to Personal). See the coach's review comment on this pull request.

## 6. Notes

- The three `drop policy` statements have no `if exists`, on purpose: if a policy is already gone,
  the migration should stop loudly rather than report success for a database that is not in the
  state this file assumes. `20261002122203_team_rules.sql` drops its two policies the same way.
- Data captured from production: **none**. Nothing was redacted; see section 1.
- No package was installed for any of this.
