# Evidence: Build it 21 part 2a — the AI suggestions consent setting (migration only)

Issue [#206](https://github.com/build-once/team-tasks/issues/206). Migration:
`supabase/migrations/20261007204900_ai_suggestions_consent.sql`.

**Result: PASS on a local sandbox. NOT applied to staging. NOT applied to production.** Rule 19:
the assistant does not run `db push` anywhere, and the guard refuses every `db push` except
`--local`. The owner has not applied this migration to staging, and was not asked to during this
session.

Read from `origin/main` at commit `abea24143dc5266decf06860133678c211b39420` — "Merge pull request
#205 from build-once/fix/honest-claims-196-202", 2026-10-07 20:36:35 +0100 (`git log -1`, run in
this session after `git fetch origin`). The branch is `feat/ai-consent-migration-206`, created from
that commit.

**What was NOT done, stated before anything else is claimed.** No MCP connector was used. No
browser was used. Nothing touched staging or production — no deploy, no secret, no query, no
dashboard — so there is no `evidence/production-log.md` entry to make. No app code, no Edge
Function, no screen and no workflow was changed. Nothing was sent to Anthropic from this session.

**Everything below section 2 was produced by the assistant on a throwaway PostgreSQL cluster on the
owner's machine.** That is not staging evidence and is not a substitute for it. Section 8 says
exactly what it therefore does not settle.

---

## 1. The decision this migration rests on, and who made it

Issue #206 asks who, other than the person, can read the setting **under the rules as they already
stand**, and says to **stop and ask** if anybody can. Somebody can — section 3 is the output that
establishes it — so the question was put to the owner before a line of the migration was written.

**The owner's decision, 7 October 2026:** hide the two new columns from the app's two client roles
at the **privilege** layer, and give the person a function that returns their own value.

Two alternatives were offered and not chosen. They are recorded here, and in the migration's own
header, so the question does not get re-argued from scratch:

| Option | Why not |
|---|---|
| Accept the team-mate read | Simplest and plainly expand-only, but `docs/plan.md`'s appendix says "Who can see it: the person whose setting it is; owner", so it would need the plan changed first (rule 9) |
| A separate one-row-per-person table | An own-row-only select policy would answer the question directly at the row layer, but it goes past both issue #206 ("one new migration on `profiles`") and the plan, which says `profiles` *(proposed column)* |

**Why row-level security could not do this job.** A policy chooses rows, not columns. The one select
policy on `public.profiles` is the same policy that makes a team's members list show nicknames
(`public.team_roster` left-joins `profiles`), so narrowing it would break the members list — which
"expand only" forbids. Column privileges can choose columns, so that is the layer used.

---

## 2. The sandbox

PostgreSQL **17.10**, a cluster created by the assistant with `initdb` in its scratchpad, listening
on `127.0.0.1` port **55433** only, trust authentication, deleted at the end of the session. It is
**not** the version either project runs: `evidence/build-it-16-suspend-accounts.md` records the
owner reporting staging on PostgreSQL **17.6**, and **production's version is still unverified** —
nothing has been read back from it.

Supabase's `auth` schema does not exist in a plain cluster, so a stand-in was written. This is the
whole of it, and it is the same shape as `evidence/build-it-16-suspend-accounts.md` section 1 and
`evidence/build-it-18-invitation-status.md` section 3:

```sql
-- The Supabase stand-in. Same shape as evidence/build-it-16-suspend-accounts.md
-- section 1 and evidence/build-it-18-invitation-status.md section 3.

-- Roles are cluster-wide, not per-database, and this file is applied to two
-- databases in the same cluster -- sandbox_before and sandbox_after -- so the
-- three creations are written to be safe the second time. Everything below them
-- is per-database and runs twice on purpose.
do $
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  -- bypassrls, because that is what Supabase's service_role has.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$;

create schema auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Supabase's auth.uid() reads the request JWT. Here it reads a session setting,
-- so a test can say "now I am Carol" without a real token.
create function auth.uid() returns uuid
language sql stable
as $ select nullif(current_setting('sandbox.uid', true), '')::uuid $;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- The two lines that make this proof mean anything. Without them a plain
-- cluster grants anon and authenticated nothing on a new table, and every
-- "revoked from authenticated" check would pass by having nothing to revoke.
-- grant all is deliberately WIDER than Supabase's documented default.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
```

**The two `alter default privileges` lines are what make this proof mean anything.** Without them a
plain cluster grants `anon` and `authenticated` nothing on a new table, so every "revoked from
`authenticated`" check below would pass by having nothing to revoke — which rule 8 calls unverified,
not a pass. They are not invented: no migration in this repository grants a table privilege, yet the
app reaches `public.tasks` as `authenticated` on staging (`evidence/build-it-15-part-1.md`), so the
project grants it. Supabase's changelog of 28 April 2026, *"Breaking Change: Tables not exposed to
Data and GraphQL API automatically"*, says of an existing project: "select, insert, update, and
delete are granted to every table in the `public` schema to the `anon`, `authenticated` and
`service_role` roles." `grant all` is deliberately **wider** than that, so every revoke below has
strictly more to remove here than it would in the real project.

`service_role` is created with **`bypassrls`**, which is what Supabase gives it — the roles page says
of it, "This role is used by the API (PostgREST) to bypass Row Level Security." Without that, section
7's attack on `service_role` would have been stopped by a policy and would have proved nothing about
the privilege.

### The seed

Run as `postgres`, which owns the tables, so row-level security does not apply and the seed is not
itself a test.

```sql
-- The seed. Run as postgres, which owns the tables, so row-level security does
-- not apply and the seed is not itself a test.
--
-- Five invented people. CAROL IS "THE PERSON" every attack below is about: she
-- has a profile row and she BELONGS TO A TEAM SHE DOES NOT OWN, which is what
-- makes "can her team's owner read her setting?" a real question rather than a
-- hypothetical.
--
--   Alice  owns "Alice team"                     -- the team owner of a team the person belongs to
--   Carol  member of Alice team, has a profile   -- THE PERSON
--   Bob    no team at all, has a profile         -- another signed-in person, shares nothing with Carol
--   Dave   NO PROFILE ROW AT ALL                 -- the account that has never set a nickname
--   Erin   member of Alice team, has a profile,
--          and has an account_status row         -- the suspended person, who also shares a team with Carol

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.invalid'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.invalid'),
  ('33333333-3333-3333-3333-333333333333', 'carol@example.invalid'),
  ('44444444-4444-4444-4444-444444444444', 'dave@example.invalid'),
  ('55555555-5555-5555-5555-555555555555', 'erin@example.invalid');

insert into public.teams (id, name, owner_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Alice team', '11111111-1111-1111-1111-111111111111');

insert into public.team_members (team_id, user_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '33333333-3333-3333-3333-333333333333'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '55555555-5555-5555-5555-555555555555');

-- Dave is deliberately absent: docs/plan.md's appendix says the display name has
-- "no way in the app yet" to be deleted, and web/src/app/teams/page.tsx:256-257
-- says "nobody has a profile row until they set a name".
insert into public.profiles (user_id, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'Alice'),
  ('22222222-2222-2222-2222-222222222222', 'Bob'),
  ('33333333-3333-3333-3333-333333333333', 'Carol'),
  ('55555555-5555-5555-5555-555555555555', 'Erin');

insert into public.account_status (user_id, reason) values
  ('55555555-5555-5555-5555-555555555555', 'Sandbox suspension, invented for this test.');
```

**Carol is "the person"** every attack is about, and she is a member of a team she does **not** own —
which is what makes "can her team's owner read her setting?" a real question rather than a
hypothetical.

### Two databases, built from the same files

`sandbox_before` is the eight migrations already on `main`. `sandbox_after` is the same eight plus
the new one. They differ by exactly one file and nothing else.

```text
=== dropdb --if-exists sandbox_before ===
exit=0
=== createdb sandbox_before ===
exit=0
=== psql -f 00-standin.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20260927182443_create_tasks.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20260930101343_create_teams.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20260930193813_create_invitations.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20261002122203_team_rules.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20261002133637_tasks_join_teams.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20261002170244_tasks_drop_owner_only_rules.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20261004114313_suspend_accounts.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20261006095847_invitation_status.sql ===
exit=0
=== psql -f 90-seed.sql ===
exit=0
=== sandbox_before built ===

node exit=0
```

```text
=== dropdb --if-exists sandbox_after ===
exit=0
=== createdb sandbox_after ===
exit=0
=== psql -f 00-standin.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20260927182443_create_tasks.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20260930101343_create_teams.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20260930193813_create_invitations.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20261002122203_team_rules.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20261002133637_tasks_join_teams.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20261002170244_tasks_drop_owner_only_rules.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20261004114313_suspend_accounts.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20261006095847_invitation_status.sql ===
exit=0
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20261007204900_ai_suggestions_consent.sql ===
exit=0
=== psql -f 90-seed.sql ===
exit=0
=== sandbox_after built ===

node exit=0
```

**Nine migrations, nine `exit=0`.** That is also the only check that the new file is valid SQL at
all — issue #77 is open precisely because nothing parses a migration before it reaches a real
database, and this cluster is that database.

---

## 3. "Read first" — the two answers issue #206 asks for in the PR

### 3.1 How a profile row comes to exist, and whether an account can exist without one

**One thing creates a profile row: the signed-in person saving a nickname.**
`web/src/app/teams/actions.ts:246-248` inserts `user_id` and `display_name`, under the
`You can create your own profile` policy whose `with check` pins `user_id` to the caller. There is
no other writer: `grep -rn profiles supabase/functions` returns **nothing**, so none of the three
server functions has ever read or written this table.

**Nothing creates one automatically.** R8 below lists every non-internal trigger in the database and
there is exactly one, `tasks_enforce_column_rules` on `public.tasks`. There is no trigger on
`auth.users`, and `display_name` is `not null` with no default, so an empty profile is not a state
this table can hold.

**So yes — an account can exist with no profile row, and it is the ordinary state of a new
account.** R7 shows seeded "Dave" with none, and `web/src/app/teams/page.tsx:256-257` already says
so in as many words: "nobody has a profile row until they set a name." That is why
`my_ai_suggestions()` had to be written to return a row rather than to find one — section 7, H2 and
H3.

### 3.2 Every role that can read or update `profiles` today, through which policy and which grant

**Through a grant.** `anon`, `authenticated` and `service_role` each hold the project-default
**TABLE-level** `SELECT`, `INSERT`, `UPDATE` and `DELETE` (R2), and `has_column_privilege` is `t`
for every existing column for all of them (R3). **No migration in this repository has ever granted
a table privilege on `profiles`**, so all of that comes from the default. R5 is the consequence
spelled out: a column added to this table arrives readable and writable without being named by
anybody.

**Through a policy.** Four, all `to authenticated` (R1):

| Policy | Command | Who it lets in |
|---|---|---|
| `You can create your own profile` | INSERT | the person, own row (`with check` pins `user_id`) |
| `You can read your own profile and your team mates' profiles` | SELECT | the person, **and anybody who shares a team with them** |
| `You can change your own profile` | UPDATE | the person, own row only |
| `Suspended accounts are refused everything` | ALL, **restrictive** | takes access away from a suspended person; grants nothing |

`anon` matches **no** policy on this table, so a signed-out caller reads and writes nothing today
despite holding the privileges. `service_role` bypasses row-level security entirely, so none of the
four is ever evaluated for it.

**The answer to "and if anyone other than the person can, stop and ask": they can.** R6b is the
output — Alice, the owner of a team Carol belongs to, reads Carol's row. R6c, R6d and R6e are the
controls that stop that being a vacuous result: a **suspended** team mate gets nothing, a person who
**shares no team** gets nothing, and **signed out** gets nothing. R6f shows the read is a read only
— Alice cannot change the row.

So the full answer, before this migration: **the person; every non-suspended person who shares a
team with them; `service_role`; and the operator.**

### 3.3 The output

```text
Pager usage is off.
Timing is off.
================ R1. The policies on public.profiles today ================
                         policyname                          | permissive  |      roles      |  cmd   |                                                using_expr                                                |             with_check_expr             
-------------------------------------------------------------+-------------+-----------------+--------+----------------------------------------------------------------------------------------------------------+-----------------------------------------
 Suspended accounts are refused everything                   | RESTRICTIVE | {authenticated} | ALL    | ( SELECT is_active() AS is_active)                                                                       | ( SELECT is_active() AS is_active)
 You can create your own profile                             | PERMISSIVE  | {authenticated} | INSERT | (none)                                                                                                   | (( SELECT auth.uid() AS uid) = user_id)
 You can read your own profile and your team mates' profiles | PERMISSIVE  | {authenticated} | SELECT | ((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1                                          +| (none)
                                                             |             |                 |        |    FROM team_members theirs                                                                             +| 
                                                             |             |                 |        |   WHERE ((theirs.user_id = profiles.user_id) AND is_team_member(theirs.team_id)))) OR (EXISTS ( SELECT 1+| 
                                                             |             |                 |        |    FROM teams owned                                                                                     +| 
                                                             |             |                 |        |   WHERE ((owned.owner_id = profiles.user_id) AND is_team_member(owned.id)))))                            | 
 You can change your own profile                             | PERMISSIVE  | {authenticated} | UPDATE | (( SELECT auth.uid() AS uid) = user_id)                                                                  | (( SELECT auth.uid() AS uid) = user_id)
(4 rows)


================ R2. TABLE-level rights on public.profiles, by has_table_privilege ================
     role      | sel | ins | upd | del 
---------------+-----+-----+-----+-----
 anon          | t   | t   | t   | t
 authenticated | t   | t   | t   | t
 postgres      | t   | t   | t   | t
 service_role  | t   | t   | t   | t
(4 rows)


================ R3. COLUMN-level rights on public.profiles, by has_column_privilege ================
     role      | column_name  | sel | ins | upd 
---------------+--------------+-----+-----+-----
 anon          | user_id      | t   | t   | t
 anon          | display_name | t   | t   | t
 anon          | created_at   | t   | t   | t
 authenticated | user_id      | t   | t   | t
 authenticated | display_name | t   | t   | t
 authenticated | created_at   | t   | t   | t
 postgres      | user_id      | t   | t   | t
 postgres      | display_name | t   | t   | t
 postgres      | created_at   | t   | t   | t
 service_role  | user_id      | t   | t   | t
 service_role  | display_name | t   | t   | t
 service_role  | created_at   | t   | t   | t
(12 rows)


================ R4. CONTROL: the two functions disagree where they should ================
-- public.invitations already has table-level INSERT/UPDATE revoked from authenticated
-- and column lists granted back (20261006095847_invitation_status.sql). So this is the
-- shape the issue is about, read with both functions on a table that already has it.
-- The finding itself is recorded in evidence/build-it-18-invitation-status.md section 5.
     tbl     | table_ins | col_email_ins | col_status_ins | any_col_ins 
-------------+-----------+---------------+----------------+-------------
 invitations | f         | t             | f              | t
(1 row)


================ R5. Does a table-level SELECT grant already cover a column? ================
-- profiles has had no grant written by any migration, so authenticated holds the
-- project-default TABLE-level grant. If the answer below is t for every column, a
-- column added by this migration arrives readable and writable without being named.
 table_sel | col_sel | table_upd | col_upd 
-----------+---------+-----------+---------
 t         | t       | t         | t
(1 row)


================ R6. LIVE: who actually reads the profile row belonging to Carol ================
-- Carol (33333333) is a member of Alice team. Alice (11111111) owns it.
--- R6a. Carol reads her own profile row ---
SET
SET
               user_id                | display_name 
--------------------------------------+--------------
 33333333-3333-3333-3333-333333333333 | Carol
(1 row)

RESET
--- R6b. ALICE, the owner of a team Carol belongs to, reads the row ---
SET
SET
               user_id                | display_name 
--------------------------------------+--------------
 33333333-3333-3333-3333-333333333333 | Carol
(1 row)

RESET
--- R6c. ERIN, a suspended team mate of Carol, reads the row ---
SET
SET
 user_id | display_name 
---------+--------------
(0 rows)

RESET
--- R6d. BOB, who shares no team with Carol, reads the row ---
SET
SET
 user_id | display_name 
---------+--------------
(0 rows)

RESET
--- R6e. Signed out (anon) reads the row ---
SET
SET
 user_id | display_name 
---------+--------------
(0 rows)

RESET
--- R6f. ALICE tries to UPDATE the row (expect UPDATE 0) ---
SET
SET
UPDATE 0
RESET

================ R7. Does an account exist with no profile row? ================
                  id                  |         email         | has_profile_row 
--------------------------------------+-----------------------+-----------------
 11111111-1111-1111-1111-111111111111 | alice@example.invalid | t
 22222222-2222-2222-2222-222222222222 | bob@example.invalid   | t
 33333333-3333-3333-3333-333333333333 | carol@example.invalid | t
 44444444-4444-4444-4444-444444444444 | dave@example.invalid  | f
 55555555-5555-5555-5555-555555555555 | erin@example.invalid  | t
(5 rows)


================ R8. Anything that creates a profile row automatically? ================
-- Every trigger in the database, and every trigger on auth.users:
 schema | table_name |        trigger_name        
--------+------------+----------------------------
 public | tasks      | tasks_enforce_column_rules
(1 row)


-- Column defaults on public.profiles, i.e. what a row gets without being told:
 column_name  |           type           | not_null | default_expr 
--------------+--------------------------+----------+--------------
 user_id      | uuid                     | t        | (no default)
 display_name | text                     | t        | (no default)
 created_at   | timestamp with time zone | t        | now()
(3 rows)
```

**R4 is the control for the whole privilege half of this work**, and it is the reason the migration
is shaped as it is. `public.invitations` already has table-level `INSERT` revoked from
`authenticated` with a column list granted back (`20261006095847_invitation_status.sql`), so it
already has the shape this migration needs — and read with the two functions the issue asks for:

```
table_ins = f      has_table_privilege ('authenticated', 'public.invitations', 'INSERT')
col_email_ins = t  has_column_privilege('authenticated', 'public.invitations', 'email',  'INSERT')
col_status_ins = f has_column_privilege('authenticated', 'public.invitations', 'status', 'INSERT')
any_col_ins = t    has_any_column_privilege('authenticated', 'public.invitations', 'INSERT')
```

The two functions disagree, and they are **supposed** to: `has_table_privilege` reports the
table-level grant alone, `has_column_privilege` reports the reach. A `revoke` written at the column
level while the table-level grant stands removes a grant that is not there, succeeds without a
warning, and changes nothing — the finding recorded in
`evidence/build-it-18-invitation-status.md` section 5, "REVOKE with no warning, and the privilege is
still there". That is why this migration takes the **table-level** privilege away and grants a
column list back, for both the client roles and `service_role`.

**One citation in #206 could not be resolved, and is reported rather than guessed.** The issue says
"findings log #191". There is **no findings log in this repository** — `docs/` holds no such file and
nothing matches "findings log" anywhere on this commit — and GitHub issue
[#191](https://github.com/build-once/team-tasks/issues/191) is about staging scripts scrubbing a
response before parsing it, which is a different subject. The *substance* is unambiguous and is
proved above, so the migration cites
`evidence/build-it-18-invitation-status.md` section 5 instead, which records the finding with the
output that establishes it.

---

## 4. What the migration does

| Part | What it is |
|---|---|
| `ai_suggestions_enabled` | `boolean not null default false`. Off for every existing row and every new one, with **no backfill statement**: adding a column with a default does not rewrite the table on PostgreSQL 11 and later, so every existing row reads `false` without one being written |
| `ai_suggestions_changed_at` | `timestamptz`, **nullable**. Null means nobody has ever changed it |
| `profiles_ai_suggestions_on_is_dated` | `check (ai_suggestions_enabled = false or ai_suggestions_changed_at is not null)`. Makes "on, with no record of when" unrepresentable. Added to a populated table, so applying the migration also validates it against every existing row |
| `profiles_stamp_ai_suggestions` | BEFORE INSERT OR UPDATE trigger. Stamps `now()` when the setting changes; **raises 42501** if any caller — the operator and `service_role` included — supplies a value for the timestamp |
| `my_ai_suggestions()` | `security definer`, no arguments, **always exactly one row**. The person's own value, `false` when there is no profile row, when they are suspended, and when nobody is signed in |
| the grants | Table-level `select, insert, update` revoked from `anon` and `authenticated`, and `insert, update` from `service_role`; the three pre-existing columns granted straight back, column by column, to all three; **one new right in the whole file** — `update (ai_suggestions_enabled)` to `authenticated` |

**Why the timestamp is nullable, which was a decision and not an omission.** `not null default now()`
would record that **every account in the database changed their AI-suggestions setting at the moment
this migration ran** — the exact opposite of the plan's "a person who never touches it has never sent
anything". `20261006095847_invitation_status.sql` argued for "no third state to reason about" and was
right about a status; here the third state is real, and stating a falsehood to avoid it is the worse
trade.

**Why `my_ai_suggestions()` returns a row rather than a boolean, and why `is_active()` is inside
it.** `docs/plan.md`: "If the setting cannot be read, it is off. A failed read is not a yes." Three
different nothings all have to come back as off — no profile row, suspended, signed out — and a
function that returned *no rows* would hand that decision to whatever called it. And because the
function is `security definer` it **bypasses row-level security**, so without the `is_active()` call
a suspended person would get their setting back through it while being refused everything else: a
fourth door quietly ignoring a rule the other three keep. Section 7 F1 is that call working.

**Why `service_role` loses `insert` and `update` on the two new columns.** Issue #206: "Nobody else
can change it: not another signed-in person, not a team owner, not a signed-out caller. The app's
operator can through the database." `service_role` is **not** the operator — it is the role the three
server functions connect as — and `docs/plan.md` is explicit: "Not their team's owner, not another
member, **not the owner of the app on their behalf**." With the project default left alone,
`service_role` could switch anybody's setting on with no policy in the way, because it bypasses
row-level security. Section 7 I3 is that door shut. **Nothing breaks**, and that is checkable rather
than hopeful: `grep -rn profiles supabase/functions` returns nothing on this commit, so no server
function touches this table at all. Its `select` is left alone, because `suggest-subtasks` has to
read the setting — section 7 I1.

### Expand only

| What | Still works? | Where |
|---|---|---|
| `insert into profiles (user_id, display_name)` — the app's one insert | yes | K1 |
| `update profiles set display_name = … returning display_name` — the app's one update | yes, and it does **not** stamp the timestamp | K2, K3 |
| The My teams page reading its own nickname | yes | K4 |
| `team_roster`, the members list with nicknames | yes, unchanged | K5, K6 |
| The team-mate read of a nickname | yes, unchanged | D3 |
| A signed-out read of `profiles` | **empty, not 42501** — which is why `anon` is re-granted | G4 |
| `teams` reads | unchanged | K7 |

**All three of the app's statements name their columns** — `select("display_name")` at
`web/src/app/teams/page.tsx:262`, and `.select("display_name")` after both the update
(`actions.ts:228`) and the insert (`actions.ts:248`). **None does a wildcard select**, which matters
because a bare `select *` on this table is now refused for every client role (D2). Checked by reading
all three on this commit.

**`web/tests/access-rules.test.mjs` is unaffected.** Its only touch of this table is the signed-out
read at line 543, which selects `user_id` — a column `anon` still holds `select` on, so it still
answers HTTP 200 with 0 rows. The test accepts either that or a 42501, so it passes whichever way.
`scripts/staging/build-it-14-checks.mjs:460` likewise reads `profiles` selecting `user_id` only, and
takes display names from `team_roster`.

### The 30 October 2026 change

Supabase applies "new public tables are not exposed by default" to existing projects on 30 October
2026 (changelog 45329), and issue
[#130](https://github.com/build-once/team-tasks/issues/130) holds that question.

**This migration is unaffected, for two reasons.** First, **it adds columns, not a table**. #130's own
sandbox settled what the change is — it alters *default* privileges, so "the old table keeps its
grants, the new one has none" — and `public.profiles` already exists. Second, and the better reason:
**every right this migration relies on is now written out by name**, so none of them is a default
that a change to defaults could withdraw. The one exception is named rather than hidden:
`service_role`'s **table-level** `select` still rests on the project default, which is exactly why
the column-level `select (ai_suggestions_enabled, ai_suggestions_changed_at)` is written out as
well — if that default goes, `suggest-subtasks` keeps the one read it needs.

---

## 5. The attack: what it asks, and as whom

Six callers, against `sandbox_after`. Each statement is its own transaction — no `BEGIN`,
`ON_ERROR_STOP=0` — the way PostgREST sends them. **`postgres` is never the caller except where a
section says so**: every attack section `set role`s first, so column privileges and row-level
security are actually in force.

| Section | Caller | What is asked |
|---|---|---|
| A, B | — | the rights and the schema after the migration, by `has_table_privilege`, `has_column_privilege`, `has_any_column_privilege` and `has_function_privilege` |
| C | **Carol, the person** | read own, read the column directly, switch on, switch off, forge the timestamp, forge it while switching on, switch somebody else on |
| D | **Alice, the owner of a team Carol belongs to** | read Carol's setting, `select *`, switch Carol on, switch Carol on with no `where` at all, forge Carol's timestamp |
| E | **Bob, another signed-in person** | the same, sharing no team with Carol |
| F | **Erin, suspended** | read her own, switch her own on, read the column, switch Carol on |
| G | **signed out** | call the function, read the column, switch anybody on, read a nickname |
| H | **Dave, no profile row** | read the setting, switch it on, create a row already on, create an ordinary row |
| I | **`service_role`**, which bypasses row-level security | read the setting, call the function, switch Carol on, forge the timestamp, write a nickname |
| J | **the operator** | forge the timestamp on update and on insert, insert a row already on, and — with the trigger disabled — break the check constraint |
| K | — | expand only: every statement the app and the staging scripts actually make |

Three of those sections exist to stop the others passing for the wrong reason. **C12** switches the
setting on *while renaming*, so C10's refusal is known to be about the forged column and not merely
about two columns in one statement. **D6** updates with no `where` clause, so "UPDATE 0" in D5 is
known to be the policy choosing rows rather than the statement matching nothing. **J4** disables the
trigger, so the check constraint is shown to be a real second lock rather than something the trigger
simply never tests.

### What came back

Every expectation was met. The whole run, pasted unedited:

```text
Pager usage is off.
Timing is off.
################ A. THE RIGHTS AFTER THE MIGRATION ################

--- A1. TABLE-level rights on public.profiles (has_table_privilege) ---
    expect: SELECT, INSERT, UPDATE all f for anon and authenticated;
            service_role SELECT t, INSERT f, UPDATE f; DELETE untouched (t) for all three
     role      | sel | ins | upd | del 
---------------+-----+-----+-----+-----
 anon          | f   | f   | f   | t
 authenticated | f   | f   | f   | t
 postgres      | t   | t   | t   | t
 service_role  | t   | f   | f   | t
(4 rows)


--- A2. COLUMN-level rights on public.profiles (has_column_privilege) ---
    expect: the three old columns t/t/t for anon, authenticated and service_role;
            ai_suggestions_enabled    f/f/t for authenticated, f/f/f for anon,
                                      t/f/f for service_role (read, never write);
            ai_suggestions_changed_at f/f/f for anon and authenticated,
                                      t/f/f for service_role.
     role      |        column_name        | sel | ins | upd 
---------------+---------------------------+-----+-----+-----
 anon          | user_id                   | t   | t   | t
 anon          | display_name              | t   | t   | t
 anon          | created_at                | t   | t   | t
 anon          | ai_suggestions_enabled    | f   | f   | f
 anon          | ai_suggestions_changed_at | f   | f   | f
 authenticated | user_id                   | t   | t   | t
 authenticated | display_name              | t   | t   | t
 authenticated | created_at                | t   | t   | t
 authenticated | ai_suggestions_enabled    | f   | f   | t
 authenticated | ai_suggestions_changed_at | f   | f   | f
 postgres      | user_id                   | t   | t   | t
 postgres      | display_name              | t   | t   | t
 postgres      | created_at                | t   | t   | t
 postgres      | ai_suggestions_enabled    | t   | t   | t
 postgres      | ai_suggestions_changed_at | t   | t   | t
 service_role  | user_id                   | t   | t   | t
 service_role  | display_name              | t   | t   | t
 service_role  | created_at                | t   | t   | t
 service_role  | ai_suggestions_enabled    | t   | f   | f
 service_role  | ai_suggestions_changed_at | t   | f   | f
(20 rows)


--- A3. has_any_column_privilege, so the gap between the two is not guesswork ---
    expect: authenticated has SELECT on SOME column but not on the whole table
     role      | table_sel | any_col_sel | table_upd | any_col_upd 
---------------+-----------+-------------+-----------+-------------
 anon          | f         | t           | f         | t
 authenticated | f         | t           | f         | t
 postgres      | t         | t           | t         | t
 service_role  | t         | t           | f         | t
(4 rows)


--- A4. EXECUTE on the two new functions ---
    expect: my_ai_suggestions  authenticated t, anon f, service_role f
            the trigger function  f for all three
     role      | my_ai_suggestions | stamp_trigger 
---------------+-------------------+---------------
 anon          | f                 | f
 authenticated | t                 | f
 postgres      | t                 | t
 service_role  | f                 | f
(4 rows)


################ B. THE SCHEMA AFTER THE MIGRATION ################

--- B1. The columns, their defaults and their nullability ---
        column_name        |           type           | not_null | default_expr 
---------------------------+--------------------------+----------+--------------
 user_id                   | uuid                     | t        | (no default)
 display_name              | text                     | t        | (no default)
 created_at                | timestamp with time zone | t        | now()
 ai_suggestions_enabled    | boolean                  | t        | false
 ai_suggestions_changed_at | timestamp with time zone | f        | (no default)
(5 rows)


--- B2. The check constraints on public.profiles ---
               conname               |                                      definition                                       
-------------------------------------+---------------------------------------------------------------------------------------
 profiles_ai_suggestions_on_is_dated | CHECK (((ai_suggestions_enabled = false) OR (ai_suggestions_changed_at IS NOT NULL)))
 profiles_display_name_length        | CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 40)))
 profiles_display_name_not_blank     | CHECK ((btrim(display_name) <> ''::text))
(3 rows)


--- B3. The triggers on public.profiles ---
            tgname             |                                                                      definition                                                                       
-------------------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------
 profiles_stamp_ai_suggestions | CREATE TRIGGER profiles_stamp_ai_suggestions BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION profiles_stamp_ai_suggestions()
(1 row)


--- B4. The policies on public.profiles -- expect the same four as before ---
                         policyname                          | permissive  |      roles      |  cmd   
-------------------------------------------------------------+-------------+-----------------+--------
 Suspended accounts are refused everything                   | RESTRICTIVE | {authenticated} | ALL
 You can create your own profile                             | PERMISSIVE  | {authenticated} | INSERT
 You can read your own profile and your team mates' profiles | PERMISSIVE  | {authenticated} | SELECT
 You can change your own profile                             | PERMISSIVE  | {authenticated} | UPDATE
(4 rows)


--- B5. Every existing row reads as OFF. Read as postgres, which sees them all ---
    expect: ai_suggestions_enabled f and ai_suggestions_changed_at null for all four
               user_id                | display_name | ai_suggestions_enabled | ai_suggestions_changed_at 
--------------------------------------+--------------+------------------------+---------------------------
 11111111-1111-1111-1111-111111111111 | Alice        | f                      | 
 22222222-2222-2222-2222-222222222222 | Bob          | f                      | 
 33333333-3333-3333-3333-333333333333 | Carol        | f                      | 
 55555555-5555-5555-5555-555555555555 | Erin         | f                      | 
(4 rows)


################ C. CAROL, THE PERSON ################

--- C1. Carol reads her own setting through the function -- expect one row, f, null ---
SET
SET
 enabled | changed_at 
---------+------------
 f       | 
(1 row)

--- C2. Carol reads the column directly -- expect 42501, no privilege ---
psql:20-attack.sql:116: ERROR:  permission denied for table profiles
--- C3. Carol reads the timestamp directly -- expect 42501 ---
psql:20-attack.sql:119: ERROR:  permission denied for table profiles
--- C4. Carol still reads her nickname, and her team mates -- expect 2 rows, unchanged ---
               user_id                | display_name 
--------------------------------------+--------------
 11111111-1111-1111-1111-111111111111 | Alice
 33333333-3333-3333-3333-333333333333 | Carol
(2 rows)

--- C5. Carol SWITCHES IT ON -- expect UPDATE 1 ---
UPDATE 1
--- C6. Carol reads it back -- expect one row, t, and a stamped time ---
 enabled | changed_at_was_stamped 
---------+------------------------
 t       | t
(1 row)

--- C7. Carol SWITCHES IT OFF -- expect UPDATE 1 ---
UPDATE 1
--- C8. Carol reads it back -- expect f, and the time still there (it did change) ---
 enabled | changed_at_was_stamped 
---------+------------------------
 f       | t
(1 row)

--- C9. Carol FORGES the timestamp on its own -- expect 42501, no privilege ---
psql:20-attack.sql:144: ERROR:  permission denied for table profiles
--- C10. Carol switches ON while forging the timestamp in the same statement ---
     expect 42501, and the whole statement refused, so the setting does NOT move
psql:20-attack.sql:151: ERROR:  permission denied for table profiles
--- C11. Did C10 switch it on anyway? -- expect f ---
 enabled 
---------
 f
(1 row)

--- C12. Carol switches it on while renaming herself -- both columns she IS allowed ---
     expect UPDATE 1: this is allowed, and is here so C10 is known to fail on the
     forged column and not on the mere fact of two columns in one statement
UPDATE 1
--- C13. And put it back off, so the sections below start from off ---
UPDATE 1
 enabled 
---------
 f
(1 row)

--- C14. Carol tries to switch ERIN on -- expect UPDATE 0, no row matches ---
UPDATE 0
RESET

################ D. ALICE, THE OWNER OF A TEAM CAROL BELONGS TO ################

SET
SET
--- D1. Alice reads the setting column on Carol -- expect 42501 ---
psql:20-attack.sql:180: ERROR:  permission denied for table profiles
--- D2. Alice reads the whole row with select * -- expect 42501 ---
psql:20-attack.sql:183: ERROR:  permission denied for table profiles
--- D3. Alice still reads the nickname on that row (the team-mate read) ---
     expect 1 row: the team-mate read is UNCHANGED, which is what expand-only means
               user_id                | display_name 
--------------------------------------+--------------
 33333333-3333-3333-3333-333333333333 | Carol
(1 row)

--- D4. Alice reads the setting through the function -- expect HER OWN row, f, null ---
 enabled | changed_at 
---------+------------
 f       | 
(1 row)

--- D5. Alice switches Carol ON -- expect UPDATE 0 ---
UPDATE 0
--- D6. Alice switches Carol ON by naming no row at all -- expect UPDATE 1 (HER OWN only) ---
UPDATE 1
--- D7. Whose row moved? Read as postgres -- expect ONLY Alice is on ---
RESET
 display_name | ai_suggestions_enabled 
--------------+------------------------
 Alice        | t
 Bob          | f
 Carol        | f
 Erin         | f
(4 rows)

--- D8. Put Alice back off ---
UPDATE 1
--- D9. Alice forges the timestamp on Carol -- expect 42501 ---
SET
SET
psql:20-attack.sql:210: ERROR:  permission denied for table profiles
RESET

################ E. BOB, ANOTHER SIGNED-IN PERSON WHO SHARES NOTHING ################

SET
SET
--- E1. Bob reads the setting column on Carol -- expect 42501 ---
psql:20-attack.sql:220: ERROR:  permission denied for table profiles
--- E2. Bob reads the nickname on that row -- expect 0 rows, unchanged from before ---
 user_id | display_name 
---------+--------------
(0 rows)

--- E3. Bob switches Carol ON -- expect UPDATE 0 ---
UPDATE 0
--- E4. Bob reads his own through the function -- expect f, null ---
 enabled | changed_at 
---------+------------
 f       | 
(1 row)

RESET

################ F. ERIN, SUSPENDED ################

SET
SET
--- F1. Erin reads her OWN setting through the function -- expect f ---
     the function bypasses row-level security, so this is the is_active() call working
 enabled | changed_at 
---------+------------
 f       | 
(1 row)

--- F2. Erin switches her OWN setting on -- expect UPDATE 0 ---
UPDATE 0
--- F3. Did it move? Read as postgres -- expect f for Erin ---
RESET
 display_name | ai_suggestions_enabled | ai_suggestions_changed_at 
--------------+------------------------+---------------------------
 Erin         | f                      | 
(1 row)

--- F4. Erin reads the column directly -- expect 42501 ---
SET
SET
psql:20-attack.sql:255: ERROR:  permission denied for table profiles
--- F5. Erin switches CAROL on -- expect UPDATE 0 ---
UPDATE 0
RESET

################ G. SIGNED OUT ################

SET
SET
--- G1. anon calls the function -- expect 42501, no EXECUTE ---
psql:20-attack.sql:269: ERROR:  permission denied for function my_ai_suggestions
--- G2. anon reads the setting column -- expect 42501 ---
psql:20-attack.sql:272: ERROR:  permission denied for table profiles
--- G3. anon switches anybody on -- expect 42501, no UPDATE on that column ---
psql:20-attack.sql:276: ERROR:  permission denied for table profiles
--- G4. anon reads the nickname columns -- expect 0 rows and NO error ---
     this is the behaviour the re-grant to anon preserves: empty, not 42501
 user_id | display_name 
---------+--------------
(0 rows)

RESET

################ H. DAVE, AN ACCOUNT WITH NO PROFILE ROW ################

SET
SET
--- H1. Dave has no row at all -- confirm through the nickname read: expect 0 rows ---
 user_id | display_name 
---------+--------------
(0 rows)

--- H2. Dave reads his setting through the function -- expect EXACTLY ONE ROW, f, null ---
     this is the "no profile row reads as off" case issue #206 asks for
 enabled | changed_at 
---------+------------
 f       | 
(1 row)

--- H3. Count the rows the function returns, so "exactly one" is not eyeballed ---
 rows_returned 
---------------
             1
(1 row)

--- H4. Dave switches it on -- expect UPDATE 0: there is no row to update ---
UPDATE 0
--- H5. Dave creates a profile row already switched ON -- expect 42501, no INSERT on that column ---
psql:20-attack.sql:305: ERROR:  permission denied for table profiles
--- H6. Dave creates an ordinary profile row -- expect INSERT 0 1 ---
INSERT 0 1
--- H7. What did it arrive as? -- expect f, null ---
 enabled | changed_at 
---------+------------
 f       | 
(1 row)

RESET

################ I. SERVICE_ROLE, WHICH BYPASSES ROW-LEVEL SECURITY ################

SET
SET
--- I1. service_role reads the setting for one user id -- expect 1 row, f ---
     this is the read suggest-subtasks will make, and what the explicit grant is for
               user_id                | ai_suggestions_enabled 
--------------------------------------+------------------------
 33333333-3333-3333-3333-333333333333 | f
(1 row)

--- I2. service_role calls my_ai_suggestions() -- expect 42501 ---
     revoked on purpose: an admin connection has no auth.uid(), so it would
     answer false for every caller without an error
psql:20-attack.sql:329: ERROR:  permission denied for function my_ai_suggestions
--- I3. service_role SWITCHES CAROL ON, on her behalf -- expect 42501 ---
     section 4b. It bypasses row-level security, so no policy would have stopped
     this: the column grant is the only thing that does
psql:20-attack.sql:335: ERROR:  permission denied for table profiles
--- I4. service_role FORGES the timestamp -- expect 42501 ---
psql:20-attack.sql:339: ERROR:  permission denied for table profiles
--- I5. service_role switches Carol on AND forges the time -- expect 42501 ---
psql:20-attack.sql:344: ERROR:  permission denied for table profiles
--- I6. Did any of I3-I5 move anything? -- expect f, and NOT the forged 2020 date ---
     Carol already has a stamped time from section C, so the test is that it is
     still hers and not 2020-01-01
               user_id                | ai_suggestions_enabled |   ai_suggestions_changed_at   | not_the_forged_date 
--------------------------------------+------------------------+-------------------------------+---------------------
 33333333-3333-3333-3333-333333333333 | f                      | 2026-10-07 21:18:42.715521+01 | t
(1 row)

--- I7. service_role can still write a nickname -- expect UPDATE 1 ---
     nothing in supabase/functions reads or writes this table today, but the
     re-grant means service_role lost nothing except the two new columns
UPDATE 1
RESET

################ J. THE OPERATOR, AND THE CONSTRAINT ################

--- J1. postgres forges the timestamp -- expect 42501 from the trigger ---
psql:20-attack.sql:364: ERROR:  ai_suggestions_changed_at is set by the database, never by a caller.
CONTEXT:  PL/pgSQL function public.profiles_stamp_ai_suggestions() line 32 at RAISE
--- J2. postgres inserts a row with a supplied timestamp -- expect 42501 from the trigger ---
INSERT 0 1
psql:20-attack.sql:369: ERROR:  ai_suggestions_changed_at is set by the database, never by a caller.
CONTEXT:  PL/pgSQL function public.profiles_stamp_ai_suggestions() line 8 at RAISE
--- J3. postgres inserts a row already ON -- expect INSERT 0 1 and a STAMPED time ---
INSERT 0 1
 display_name | ai_suggestions_enabled | stamped 
--------------+------------------------+---------
 Frank        | t                      | t
(1 row)

--- J4. The constraint, with the trigger out of the way -- expect a check violation ---
     only the operator can do this. It shows profiles_ai_suggestions_on_is_dated is
     a real second lock and not something the trigger merely never tests
ALTER TABLE
psql:20-attack.sql:382: ERROR:  new row for relation "profiles" violates check constraint "profiles_ai_suggestions_on_is_dated"
DETAIL:  Failing row contains (33333333-3333-3333-3333-333333333333, Carol, 2026-10-07 21:18:41.339488+01, t, null).
ALTER TABLE
--- J5. Confirm the trigger is back on, and Carol is still off ---
            tgname             | tgenabled 
-------------------------------+-----------
 profiles_stamp_ai_suggestions | O
(1 row)

 display_name | ai_suggestions_enabled 
--------------+------------------------
 Carol        | f
(1 row)

--- J6. Tidy Frank away, so section K starts from the seeded cast ---
DELETE 1
DELETE 1
DELETE 1

################ K. EXPAND ONLY: EVERYTHING THAT WORKED STILL WORKS ################

--- K1. The one insert the app makes ---
     web/src/app/teams/actions.ts:246-248 inserts user_id and display_name only.
     Dave has no row again after J6, so this is that exact statement. Expect INSERT 0 1
SET
SET
INSERT 0 1
--- K2. The one update the app makes ---
     web/src/app/teams/actions.ts:224-228 updates display_name and selects it back.
     Expect UPDATE 1 and the new name -- the trigger must let this through
 display_name 
--------------
 Dave D
(1 row)

UPDATE 1
--- K3. Did K2 stamp the timestamp? -- expect null: the setting did not change ---
 changed_at_still_null 
-----------------------
 t
(1 row)

--- K4. The My teams page reads its own nickname (page.tsx:260-264) -- expect 1 row ---
 display_name 
--------------
 Dave D
(1 row)

RESET
--- K5. team_roster, as Alice -- expect Alice, Carol and Erin with their nicknames ---
SET
SET
 team_name  | display_name |  role  
------------+--------------+--------
 Alice team | Alice        | owner
 Alice team | Carol        | member
 Alice team | Erin         | member
(3 rows)

--- K6. team_roster, as Bob, who is in no team -- expect 0 rows ---
SET
 team_name | display_name | role 
-----------+--------------+------
(0 rows)

--- K7. The teams read, which is the other half of the My teams page ---
     expect 0 for Bob and 1 for Alice: untouched by this migration
 teams_bob_sees 
----------------
              0
(1 row)

SET
 teams_alice_sees 
------------------
                1
(1 row)

RESET

--- K8. Final state of public.profiles, as postgres ---
 display_name | ai_suggestions_enabled |   ai_suggestions_changed_at   
--------------+------------------------+-------------------------------
 Alice        | f                      | 2026-10-07 21:18:42.729329+01
 Bob          | f                      | 
 Carol        | f                      | 2026-10-07 21:18:42.715521+01
 Dave D       | f                      | 
 Erin         | f                      | 
(5 rows)
```

---

## 6. What the attack settles, line by line

| Issue #206 asks | Settled by |
|---|---|
| off for every existing row | B5 — four seeded rows, all `f`, all with a null timestamp |
| off for every new row | H6, H7 — the app's own insert arrives `f`; H5 — a client role may not even name the column on insert |
| last-changed set by the database, never by the caller | C6 — stamped on a real change; C9, C10, D9 — 42501 at the privilege layer; I4, I5, J1, J2 — 42501 from the trigger, for the two callers that *do* hold the privilege |
| only the person can switch it, only their own row | C5, C7 — she can; C14, D5, D6, E3, F5 — nobody else moves a row that is not theirs, and D7 proves only Alice's own row moved |
| not another signed-in person | E3 — UPDATE 0 |
| not a team owner | D5, D6, D7 |
| not a signed-out caller | G3 — 42501 |
| not a server function | I3 — 42501, and I6 shows nothing moved |
| the operator can, through the database | D8, I7, J3 — and J1/J2 show even the operator cannot forge the timestamp |
| the person can read their own setting | C1, C6, C8 |
| nobody else can read it | C2, C3, D1, D2, E1, F4, G2 — 42501 for every client role on both columns, including the person's own direct read; A2 is the privilege behind it |
| a suspended person | F1 — reads `f` through the function; F2, F3 — cannot switch it on; F4 — cannot read the column; F5 — cannot touch Carol's |
| rights at the right level, by the two functions | A1, A2, A3 |
| switching on while writing a column they may not write | C10, C11 — refused entire, and the setting does **not** move; C12 is the control |
| an account with no profile row reads as off | H2, H3 — exactly one row, `enabled = f` |
| expand only | K1–K8, D3, G4 |

---

## 7. Also in this pull request: `docs/claims.md`

The account-level password minimum is **settled**, and the four places in `docs/claims.md` that
called it "not verified" now say so. The two facts, both the owner's, 7 October 2026:

- Supabase's **"Minimum password length" changed from 6 to 8** on staging and on production.
- On **staging**, a direct `POST` to `/auth/v1/signup` with the publishable key and a **7-character**
  password answered **HTTP 422**, `error_code` `weak_password`, "Password should be at least 8
  characters."

**Production's setting is owner-reported and was not tested**, and every edited row says that rather
than rounding it up. What changed:

| Where | What it said | What it says now |
|---|---|---|
| The header note, §0 | "#197 is enforced in the app, and the account-level floor is still unverified" | settled: the account-level floor is 8, tested on staging, owner-reported on production |
| §1c, `A password needs at least 8 characters.` | "ACCOUNT-LEVEL DEPENDS ON THE SUPABASE SETTING, NOT VERIFIED" | the round-the-app path now has a figure and a test, with production named as the untested half |
| §1c, `At least 8 characters. A password manager can make one for you.` | same | same |
| §2, the `8` characters row | "Supabase's project minimum is separate and **not verified**" | the two now agree at 8, and the app's floor is no longer the only one |
| §4 item 3's DONE note | "it is **not verified** — §6 carries it" | the limit is still real and still described; what has changed is that the number is known |
| §6 | "**Not verified** — Supabase's own minimum password length" | **SETTLED**, with both facts and what is still only owner-reported |

**Nobody writing this opened a dashboard or sent that request** (rule 15). Every line above is the
owner's report, recorded as such.

---

## 8. What this does NOT settle

- **Unverified — staging.** Nothing here was run against staging. The owner has **not** applied this
  migration, and was not asked to during this session.
- **Unverified — production.** Likewise. Production's PostgreSQL version remains unread, which also
  leaves `security_invoker` on `team_roster` where `20261002122203_team_rules.sql` left it.
- **Unverified — the real projects' grants on `public.profiles`.** The sandbox's
  `alter default privileges … grant all` is **wider** than Supabase's documented default, chosen so
  every revoke has more to remove, not less. What staging and production actually grant has not been
  read back from either. **This matters more here than it did for
  `20261006095847_invitation_status.sql`**, because this migration re-grants `select` to `anon`: if
  the real project grants `anon` *less* than the sandbox does, that line would **widen** `anon`'s
  reach rather than preserve it. `anon` matches no policy on this table, so it would still read
  nothing — but "would read nothing" is a second lock, not the first one. The owner-runs-query
  pattern (Book 2 A24) would settle it, before applying:

  ```sql
  -- read-only; run on staging, paste back the four rows
  select r.rolname as role,
         has_table_privilege(r.rolname, 'public.profiles', 'SELECT') as sel,
         has_table_privilege(r.rolname, 'public.profiles', 'INSERT') as ins,
         has_table_privilege(r.rolname, 'public.profiles', 'UPDATE') as upd,
         has_table_privilege(r.rolname, 'public.profiles', 'DELETE') as del
  from (values ('anon'),('authenticated'),('service_role')) as r(rolname)
  order by r.rolname;
  ```

- **Unverified — PostgreSQL 17.10 is not 17.6.** Nothing in this proof depends on a version-specific
  behaviour as far as anybody writing it can tell, but it was not run on the version staging runs.
- **Unverified — no screen exists.** There is no screen for this setting, so "a person can switch it"
  has been shown as a SQL statement and never as somebody pressing something. That is the next
  issue's job.
- **Unverified — `suggest-subtasks` does not read the setting.** The function is untouched by this
  change. The plan's "checked in the function" is not true yet, and this migration only makes it
  expressible. Also the next issue's job.
- **Not run — `web` `npm test`.** It is `node --test tests/access-rules.test.mjs`, which signs in to
  **staging**, so it is CI's and the owner's to run, not this session's. Its one touch of `profiles`
  is read and reasoned about in section 4, not executed.
- **Unverified — `drift-check` will report this migration as drift** every morning until the owner
  applies it to production. That is the correct behaviour of an unapplied migration, not a fault.

### What WAS run here

| Command | Result |
|---|---|
| `node build.mjs sandbox_before …` + `sandbox_after …` | nine migrations, every step `exit=0`, both databases built — section 2 |
| `node ask.mjs sandbox_before 10-readfirst.sql` | `exit=0` — section 3 |
| `node ask.mjs sandbox_after 20-attack.sql` | `exit=0`, every expectation met — section 5 |
| `npm test` (repository root) | `exit=0`. 537 guard rule examples + 32 fail-closed checks, 12 skills, 171 launch-check assertions, 7+4 workflow checks, 34 vet-tool, 57 handoff, 20 drift-check, 258 ai-team — all PASS |

---

## 9. Issues filed with this change

| Issue | What it is |
|---|---|
| [#207](https://github.com/build-once/team-tasks/issues/207) | A person with no profile row cannot switch AI suggestions on, and the screen cannot read the column with an ordinary select — two consequences of this migration's grants that the screen half has to handle |
| [#208](https://github.com/build-once/team-tasks/issues/208) | `docs/plan.md` says "there is no column", which stops being true the moment the owner applies this migration, and nothing updates it |
| [#209](https://github.com/build-once/team-tasks/issues/209) | Issue #206 cites "findings log #191" and there is no findings log in this repository — the substance is right, the citation resolves to nothing |

---

## Appendix A. The two question files, in full

`psql -f` does not echo the statements it runs, so the output above shows every `\echo` and every
result and none of the SQL. Both files are therefore reproduced whole, so that each "UPDATE 0", each
42501 and each row count can be read against the statement that produced it rather than against a
description of it.

They were run with `ON_ERROR_STOP=0`, no `BEGIN`, and `stdout` and `stderr` on the **same** file
descriptor, so a refusal appears exactly where it happened rather than in a block at the end.

### A.1 `10-readfirst.sql` — run against `sandbox_before`

```sql
\pset pager off
\timing off

\echo '================ R1. The policies on public.profiles today ================'
select policyname, permissive, roles::text, cmd,
       coalesce(qual, '(none)')       as using_expr,
       coalesce(with_check, '(none)') as with_check_expr
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd, policyname;

\echo ''
\echo '================ R2. TABLE-level rights on public.profiles, by has_table_privilege ================'
select r.rolname as role,
       has_table_privilege(r.rolname, 'public.profiles', 'SELECT') as sel,
       has_table_privilege(r.rolname, 'public.profiles', 'INSERT') as ins,
       has_table_privilege(r.rolname, 'public.profiles', 'UPDATE') as upd,
       has_table_privilege(r.rolname, 'public.profiles', 'DELETE') as del
from (values ('anon'),('authenticated'),('service_role'),('postgres')) as r(rolname)
order by r.rolname;

\echo ''
\echo '================ R3. COLUMN-level rights on public.profiles, by has_column_privilege ================'
select r.rolname as role, a.attname as column_name,
       has_column_privilege(r.rolname, 'public.profiles', a.attname, 'SELECT') as sel,
       has_column_privilege(r.rolname, 'public.profiles', a.attname, 'INSERT') as ins,
       has_column_privilege(r.rolname, 'public.profiles', a.attname, 'UPDATE') as upd
from (values ('anon'),('authenticated'),('service_role'),('postgres')) as r(rolname)
cross join pg_attribute a
where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
order by r.rolname, a.attnum;

\echo ''
\echo '================ R4. CONTROL: the two functions disagree where they should ================'
\echo '-- public.invitations already has table-level INSERT/UPDATE revoked from authenticated'
\echo '-- and column lists granted back (20261006095847_invitation_status.sql). So this is the'
\echo '-- shape the issue is about, read with both functions on a table that already has it.'
\echo '-- The finding itself is recorded in evidence/build-it-18-invitation-status.md section 5.'
select 'invitations' as tbl,
       has_table_privilege('authenticated', 'public.invitations', 'INSERT')              as table_ins,
       has_column_privilege('authenticated', 'public.invitations', 'email', 'INSERT')    as col_email_ins,
       has_column_privilege('authenticated', 'public.invitations', 'status', 'INSERT')   as col_status_ins,
       has_any_column_privilege('authenticated', 'public.invitations', 'INSERT')         as any_col_ins;

\echo ''
\echo '================ R5. Does a table-level SELECT grant already cover a column? ================'
\echo '-- profiles has had no grant written by any migration, so authenticated holds the'
\echo '-- project-default TABLE-level grant. If the answer below is t for every column, a'
\echo '-- column added by this migration arrives readable and writable without being named.'
select has_table_privilege('authenticated', 'public.profiles', 'SELECT')               as table_sel,
       has_column_privilege('authenticated', 'public.profiles', 'display_name', 'SELECT') as col_sel,
       has_table_privilege('authenticated', 'public.profiles', 'UPDATE')               as table_upd,
       has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE') as col_upd;

\echo ''
\echo '================ R6. LIVE: who actually reads the profile row belonging to Carol ================'
\echo '-- Carol (33333333) is a member of Alice team. Alice (11111111) owns it.'

\echo '--- R6a. Carol reads her own profile row ---'
set role authenticated;
set sandbox.uid = '33333333-3333-3333-3333-333333333333';
select user_id, display_name from public.profiles where user_id = '33333333-3333-3333-3333-333333333333';
reset role;

\echo '--- R6b. ALICE, the owner of a team Carol belongs to, reads the row ---'
set role authenticated;
set sandbox.uid = '11111111-1111-1111-1111-111111111111';
select user_id, display_name from public.profiles where user_id = '33333333-3333-3333-3333-333333333333';
reset role;

\echo '--- R6c. ERIN, a suspended team mate of Carol, reads the row ---'
set role authenticated;
set sandbox.uid = '55555555-5555-5555-5555-555555555555';
select user_id, display_name from public.profiles where user_id = '33333333-3333-3333-3333-333333333333';
reset role;

\echo '--- R6d. BOB, who shares no team with Carol, reads the row ---'
set role authenticated;
set sandbox.uid = '22222222-2222-2222-2222-222222222222';
select user_id, display_name from public.profiles where user_id = '33333333-3333-3333-3333-333333333333';
reset role;

\echo '--- R6e. Signed out (anon) reads the row ---'
set role anon;
set sandbox.uid = '';
select user_id, display_name from public.profiles where user_id = '33333333-3333-3333-3333-333333333333';
reset role;

\echo '--- R6f. ALICE tries to UPDATE the row (expect UPDATE 0) ---'
set role authenticated;
set sandbox.uid = '11111111-1111-1111-1111-111111111111';
update public.profiles set display_name = 'Alice renamed Carol' where user_id = '33333333-3333-3333-3333-333333333333';
reset role;

\echo ''
\echo '================ R7. Does an account exist with no profile row? ================'
select u.id, u.email, (p.user_id is not null) as has_profile_row
from auth.users u
left join public.profiles p on p.user_id = u.id
order by u.email;

\echo ''
\echo '================ R8. Anything that creates a profile row automatically? ================'
\echo '-- Every trigger in the database, and every trigger on auth.users:'
select n.nspname as schema, c.relname as table_name, t.tgname as trigger_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
order by n.nspname, c.relname, t.tgname;

\echo ''
\echo '-- Column defaults on public.profiles, i.e. what a row gets without being told:'
select a.attname as column_name,
       format_type(a.atttypid, a.atttypmod) as type,
       a.attnotnull as not_null,
       coalesce(pg_get_expr(d.adbin, d.adrelid), '(no default)') as default_expr
from pg_attribute a
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
order by a.attnum;
```

### A.2 `20-attack.sql` — run against `sandbox_after`

```sql
\pset pager off
\timing off

-- Every statement is its own transaction -- no BEGIN, ON_ERROR_STOP=0 -- the way
-- PostgREST sends them. postgres is never the caller except where a section says
-- so: every attack section `set role`s first, so row-level security and column
-- privileges are actually in force.
--
-- The cast (90-seed.sql):
--   Alice 11111111  owns "Alice team"                        the team owner
--   Bob   22222222  no team at all                           another signed-in person
--   Carol 33333333  member of Alice team -- THE PERSON
--   Dave  44444444  NO PROFILE ROW
--   Erin  55555555  member of Alice team, SUSPENDED

\echo '################ A. THE RIGHTS AFTER THE MIGRATION ################'
\echo ''
\echo '--- A1. TABLE-level rights on public.profiles (has_table_privilege) ---'
\echo '    expect: SELECT, INSERT, UPDATE all f for anon and authenticated;'
\echo '            service_role SELECT t, INSERT f, UPDATE f; DELETE untouched (t) for all three'
select r.rolname as role,
       has_table_privilege(r.rolname, 'public.profiles', 'SELECT') as sel,
       has_table_privilege(r.rolname, 'public.profiles', 'INSERT') as ins,
       has_table_privilege(r.rolname, 'public.profiles', 'UPDATE') as upd,
       has_table_privilege(r.rolname, 'public.profiles', 'DELETE') as del
from (values ('anon'),('authenticated'),('service_role'),('postgres')) as r(rolname)
order by r.rolname;

\echo ''
\echo '--- A2. COLUMN-level rights on public.profiles (has_column_privilege) ---'
\echo '    expect: the three old columns t/t/t for anon, authenticated and service_role;'
\echo '            ai_suggestions_enabled    f/f/t for authenticated, f/f/f for anon,'
\echo '                                      t/f/f for service_role (read, never write);'
\echo '            ai_suggestions_changed_at f/f/f for anon and authenticated,'
\echo '                                      t/f/f for service_role.'
select r.rolname as role, a.attname as column_name,
       has_column_privilege(r.rolname, 'public.profiles', a.attname, 'SELECT') as sel,
       has_column_privilege(r.rolname, 'public.profiles', a.attname, 'INSERT') as ins,
       has_column_privilege(r.rolname, 'public.profiles', a.attname, 'UPDATE') as upd
from (values ('anon'),('authenticated'),('service_role'),('postgres')) as r(rolname)
cross join pg_attribute a
where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
order by r.rolname, a.attnum;

\echo ''
\echo '--- A3. has_any_column_privilege, so the gap between the two is not guesswork ---'
\echo '    expect: authenticated has SELECT on SOME column but not on the whole table'
select r.rolname as role,
       has_table_privilege(r.rolname, 'public.profiles', 'SELECT')      as table_sel,
       has_any_column_privilege(r.rolname, 'public.profiles', 'SELECT') as any_col_sel,
       has_table_privilege(r.rolname, 'public.profiles', 'UPDATE')      as table_upd,
       has_any_column_privilege(r.rolname, 'public.profiles', 'UPDATE') as any_col_upd
from (values ('anon'),('authenticated'),('service_role'),('postgres')) as r(rolname)
order by r.rolname;

\echo ''
\echo '--- A4. EXECUTE on the two new functions ---'
\echo '    expect: my_ai_suggestions  authenticated t, anon f, service_role f'
\echo '            the trigger function  f for all three'
select r.rolname as role,
       has_function_privilege(r.rolname, 'public.my_ai_suggestions()', 'EXECUTE')                as my_ai_suggestions,
       has_function_privilege(r.rolname, 'public.profiles_stamp_ai_suggestions()', 'EXECUTE')    as stamp_trigger
from (values ('anon'),('authenticated'),('service_role'),('postgres')) as r(rolname)
order by r.rolname;

\echo ''
\echo '################ B. THE SCHEMA AFTER THE MIGRATION ################'
\echo ''
\echo '--- B1. The columns, their defaults and their nullability ---'
select a.attname as column_name,
       format_type(a.atttypid, a.atttypmod) as type,
       a.attnotnull as not_null,
       coalesce(pg_get_expr(d.adbin, d.adrelid), '(no default)') as default_expr
from pg_attribute a
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
order by a.attnum;

\echo ''
\echo '--- B2. The check constraints on public.profiles ---'
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.profiles'::regclass and contype = 'c'
order by conname;

\echo ''
\echo '--- B3. The triggers on public.profiles ---'
select t.tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal
order by t.tgname;

\echo ''
\echo '--- B4. The policies on public.profiles -- expect the same four as before ---'
select policyname, permissive, roles::text, cmd
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd, policyname;

\echo ''
\echo '--- B5. Every existing row reads as OFF. Read as postgres, which sees them all ---'
\echo '    expect: ai_suggestions_enabled f and ai_suggestions_changed_at null for all four'
select user_id, display_name, ai_suggestions_enabled, ai_suggestions_changed_at
from public.profiles
order by display_name;

\echo ''
\echo '################ C. CAROL, THE PERSON ################'
\echo ''
\echo '--- C1. Carol reads her own setting through the function -- expect one row, f, null ---'
set role authenticated;
set sandbox.uid = '33333333-3333-3333-3333-333333333333';
select * from public.my_ai_suggestions();

\echo '--- C2. Carol reads the column directly -- expect 42501, no privilege ---'
select user_id, ai_suggestions_enabled from public.profiles where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- C3. Carol reads the timestamp directly -- expect 42501 ---'
select user_id, ai_suggestions_changed_at from public.profiles where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- C4. Carol still reads her nickname, and her team mates -- expect 2 rows, unchanged ---'
select user_id, display_name from public.profiles where user_id in
  ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111')
order by display_name;

\echo '--- C5. Carol SWITCHES IT ON -- expect UPDATE 1 ---'
update public.profiles set ai_suggestions_enabled = true
where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- C6. Carol reads it back -- expect one row, t, and a stamped time ---'
select enabled, (changed_at is not null) as changed_at_was_stamped
from public.my_ai_suggestions();

\echo '--- C7. Carol SWITCHES IT OFF -- expect UPDATE 1 ---'
update public.profiles set ai_suggestions_enabled = false
where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- C8. Carol reads it back -- expect f, and the time still there (it did change) ---'
select enabled, (changed_at is not null) as changed_at_was_stamped
from public.my_ai_suggestions();

\echo '--- C9. Carol FORGES the timestamp on its own -- expect 42501, no privilege ---'
update public.profiles set ai_suggestions_changed_at = '2020-01-01 00:00:00+00'
where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- C10. Carol switches ON while forging the timestamp in the same statement ---'
\echo '     expect 42501, and the whole statement refused, so the setting does NOT move'
update public.profiles
   set ai_suggestions_enabled = true,
       ai_suggestions_changed_at = '2020-01-01 00:00:00+00'
where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- C11. Did C10 switch it on anyway? -- expect f ---'
select enabled from public.my_ai_suggestions();

\echo '--- C12. Carol switches it on while renaming herself -- both columns she IS allowed ---'
\echo '     expect UPDATE 1: this is allowed, and is here so C10 is known to fail on the'
\echo '     forged column and not on the mere fact of two columns in one statement'
update public.profiles
   set ai_suggestions_enabled = true, display_name = 'Carol C'
where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- C13. And put it back off, so the sections below start from off ---'
update public.profiles set ai_suggestions_enabled = false, display_name = 'Carol'
where user_id = '33333333-3333-3333-3333-333333333333';
select enabled from public.my_ai_suggestions();

\echo '--- C14. Carol tries to switch ERIN on -- expect UPDATE 0, no row matches ---'
update public.profiles set ai_suggestions_enabled = true
where user_id = '55555555-5555-5555-5555-555555555555';
reset role;

\echo ''
\echo '################ D. ALICE, THE OWNER OF A TEAM CAROL BELONGS TO ################'
\echo ''
set role authenticated;
set sandbox.uid = '11111111-1111-1111-1111-111111111111';

\echo '--- D1. Alice reads the setting column on Carol -- expect 42501 ---'
select user_id, ai_suggestions_enabled from public.profiles where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- D2. Alice reads the whole row with select * -- expect 42501 ---'
select * from public.profiles where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- D3. Alice still reads the nickname on that row (the team-mate read) ---'
\echo '     expect 1 row: the team-mate read is UNCHANGED, which is what expand-only means'
select user_id, display_name from public.profiles where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- D4. Alice reads the setting through the function -- expect HER OWN row, f, null ---'
select * from public.my_ai_suggestions();

\echo '--- D5. Alice switches Carol ON -- expect UPDATE 0 ---'
update public.profiles set ai_suggestions_enabled = true
where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- D6. Alice switches Carol ON by naming no row at all -- expect UPDATE 1 (HER OWN only) ---'
update public.profiles set ai_suggestions_enabled = true;

\echo '--- D7. Whose row moved? Read as postgres -- expect ONLY Alice is on ---'
reset role;
select display_name, ai_suggestions_enabled from public.profiles order by display_name;

\echo '--- D8. Put Alice back off ---'
update public.profiles set ai_suggestions_enabled = false where display_name = 'Alice';

\echo '--- D9. Alice forges the timestamp on Carol -- expect 42501 ---'
set role authenticated;
set sandbox.uid = '11111111-1111-1111-1111-111111111111';
update public.profiles set ai_suggestions_changed_at = '2020-01-01 00:00:00+00'
where user_id = '33333333-3333-3333-3333-333333333333';
reset role;

\echo ''
\echo '################ E. BOB, ANOTHER SIGNED-IN PERSON WHO SHARES NOTHING ################'
\echo ''
set role authenticated;
set sandbox.uid = '22222222-2222-2222-2222-222222222222';

\echo '--- E1. Bob reads the setting column on Carol -- expect 42501 ---'
select user_id, ai_suggestions_enabled from public.profiles where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- E2. Bob reads the nickname on that row -- expect 0 rows, unchanged from before ---'
select user_id, display_name from public.profiles where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- E3. Bob switches Carol ON -- expect UPDATE 0 ---'
update public.profiles set ai_suggestions_enabled = true
where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- E4. Bob reads his own through the function -- expect f, null ---'
select * from public.my_ai_suggestions();
reset role;

\echo ''
\echo '################ F. ERIN, SUSPENDED ################'
\echo ''
set role authenticated;
set sandbox.uid = '55555555-5555-5555-5555-555555555555';

\echo '--- F1. Erin reads her OWN setting through the function -- expect f ---'
\echo '     the function bypasses row-level security, so this is the is_active() call working'
select * from public.my_ai_suggestions();

\echo '--- F2. Erin switches her OWN setting on -- expect UPDATE 0 ---'
update public.profiles set ai_suggestions_enabled = true
where user_id = '55555555-5555-5555-5555-555555555555';

\echo '--- F3. Did it move? Read as postgres -- expect f for Erin ---'
reset role;
select display_name, ai_suggestions_enabled, ai_suggestions_changed_at
from public.profiles where display_name = 'Erin';

\echo '--- F4. Erin reads the column directly -- expect 42501 ---'
set role authenticated;
set sandbox.uid = '55555555-5555-5555-5555-555555555555';
select user_id, ai_suggestions_enabled from public.profiles where user_id = '55555555-5555-5555-5555-555555555555';

\echo '--- F5. Erin switches CAROL on -- expect UPDATE 0 ---'
update public.profiles set ai_suggestions_enabled = true
where user_id = '33333333-3333-3333-3333-333333333333';
reset role;

\echo ''
\echo '################ G. SIGNED OUT ################'
\echo ''
set role anon;
set sandbox.uid = '';

\echo '--- G1. anon calls the function -- expect 42501, no EXECUTE ---'
select * from public.my_ai_suggestions();

\echo '--- G2. anon reads the setting column -- expect 42501 ---'
select user_id, ai_suggestions_enabled from public.profiles;

\echo '--- G3. anon switches anybody on -- expect 42501, no UPDATE on that column ---'
update public.profiles set ai_suggestions_enabled = true
where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- G4. anon reads the nickname columns -- expect 0 rows and NO error ---'
\echo '     this is the behaviour the re-grant to anon preserves: empty, not 42501'
select user_id, display_name from public.profiles;
reset role;

\echo ''
\echo '################ H. DAVE, AN ACCOUNT WITH NO PROFILE ROW ################'
\echo ''
set role authenticated;
set sandbox.uid = '44444444-4444-4444-4444-444444444444';

\echo '--- H1. Dave has no row at all -- confirm through the nickname read: expect 0 rows ---'
select user_id, display_name from public.profiles where user_id = '44444444-4444-4444-4444-444444444444';

\echo '--- H2. Dave reads his setting through the function -- expect EXACTLY ONE ROW, f, null ---'
\echo '     this is the "no profile row reads as off" case issue #206 asks for'
select * from public.my_ai_suggestions();

\echo '--- H3. Count the rows the function returns, so "exactly one" is not eyeballed ---'
select count(*) as rows_returned from public.my_ai_suggestions();

\echo '--- H4. Dave switches it on -- expect UPDATE 0: there is no row to update ---'
update public.profiles set ai_suggestions_enabled = true
where user_id = '44444444-4444-4444-4444-444444444444';

\echo '--- H5. Dave creates a profile row already switched ON -- expect 42501, no INSERT on that column ---'
insert into public.profiles (user_id, display_name, ai_suggestions_enabled)
values ('44444444-4444-4444-4444-444444444444', 'Dave', true);

\echo '--- H6. Dave creates an ordinary profile row -- expect INSERT 0 1 ---'
insert into public.profiles (user_id, display_name)
values ('44444444-4444-4444-4444-444444444444', 'Dave');

\echo '--- H7. What did it arrive as? -- expect f, null ---'
select * from public.my_ai_suggestions();
reset role;

\echo ''
\echo '################ I. SERVICE_ROLE, WHICH BYPASSES ROW-LEVEL SECURITY ################'
\echo ''
set role service_role;
set sandbox.uid = '';

\echo '--- I1. service_role reads the setting for one user id -- expect 1 row, f ---'
\echo '     this is the read suggest-subtasks will make, and what the explicit grant is for'
select user_id, ai_suggestions_enabled from public.profiles
where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- I2. service_role calls my_ai_suggestions() -- expect 42501 ---'
\echo '     revoked on purpose: an admin connection has no auth.uid(), so it would'
\echo '     answer false for every caller without an error'
select * from public.my_ai_suggestions();

\echo '--- I3. service_role SWITCHES CAROL ON, on her behalf -- expect 42501 ---'
\echo '     section 4b. It bypasses row-level security, so no policy would have stopped'
\echo '     this: the column grant is the only thing that does'
update public.profiles set ai_suggestions_enabled = true
where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- I4. service_role FORGES the timestamp -- expect 42501 ---'
update public.profiles set ai_suggestions_changed_at = '2020-01-01 00:00:00+00'
where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- I5. service_role switches Carol on AND forges the time -- expect 42501 ---'
update public.profiles
   set ai_suggestions_enabled = true, ai_suggestions_changed_at = '2020-01-01 00:00:00+00'
where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- I6. Did any of I3-I5 move anything? -- expect f, and NOT the forged 2020 date ---'
\echo '     Carol already has a stamped time from section C, so the test is that it is'
\echo '     still hers and not 2020-01-01'
select user_id, ai_suggestions_enabled, ai_suggestions_changed_at,
       (ai_suggestions_changed_at > '2026-01-01'::timestamptz) as not_the_forged_date
from public.profiles where user_id = '33333333-3333-3333-3333-333333333333';

\echo '--- I7. service_role can still write a nickname -- expect UPDATE 1 ---'
\echo '     nothing in supabase/functions reads or writes this table today, but the'
\echo '     re-grant means service_role lost nothing except the two new columns'
update public.profiles set display_name = 'Carol' where user_id = '33333333-3333-3333-3333-333333333333';
reset role;

\echo ''
\echo '################ J. THE OPERATOR, AND THE CONSTRAINT ################'
\echo ''
\echo '--- J1. postgres forges the timestamp -- expect 42501 from the trigger ---'
update public.profiles set ai_suggestions_changed_at = '2020-01-01 00:00:00+00'
where display_name = 'Carol';

\echo '--- J2. postgres inserts a row with a supplied timestamp -- expect 42501 from the trigger ---'
insert into auth.users (id, email) values ('66666666-6666-6666-6666-666666666666', 'frank@example.invalid');
insert into public.profiles (user_id, display_name, ai_suggestions_changed_at)
values ('66666666-6666-6666-6666-666666666666', 'Frank', '2020-01-01 00:00:00+00');

\echo '--- J3. postgres inserts a row already ON -- expect INSERT 0 1 and a STAMPED time ---'
insert into public.profiles (user_id, display_name, ai_suggestions_enabled)
values ('66666666-6666-6666-6666-666666666666', 'Frank', true);
select display_name, ai_suggestions_enabled, (ai_suggestions_changed_at is not null) as stamped
from public.profiles where display_name = 'Frank';

\echo '--- J4. The constraint, with the trigger out of the way -- expect a check violation ---'
\echo '     only the operator can do this. It shows profiles_ai_suggestions_on_is_dated is'
\echo '     a real second lock and not something the trigger merely never tests'
alter table public.profiles disable trigger profiles_stamp_ai_suggestions;
update public.profiles set ai_suggestions_enabled = true, ai_suggestions_changed_at = null
where display_name = 'Carol';
alter table public.profiles enable trigger profiles_stamp_ai_suggestions;

\echo '--- J5. Confirm the trigger is back on, and Carol is still off ---'
select t.tgname, t.tgenabled from pg_trigger t
where t.tgrelid = 'public.profiles'::regclass and not t.tgisinternal;
select display_name, ai_suggestions_enabled from public.profiles where display_name = 'Carol';

\echo '--- J6. Tidy Frank away, so section K starts from the seeded cast ---'
delete from public.profiles where display_name = 'Frank';
delete from auth.users where id = '66666666-6666-6666-6666-666666666666';
delete from public.profiles where user_id = '44444444-4444-4444-4444-444444444444';

\echo ''
\echo '################ K. EXPAND ONLY: EVERYTHING THAT WORKED STILL WORKS ################'
\echo ''
\echo '--- K1. The one insert the app makes ---'
\echo '     web/src/app/teams/actions.ts:246-248 inserts user_id and display_name only.'
\echo '     Dave has no row again after J6, so this is that exact statement. Expect INSERT 0 1'
set role authenticated;
set sandbox.uid = '44444444-4444-4444-4444-444444444444';
insert into public.profiles (user_id, display_name)
values ('44444444-4444-4444-4444-444444444444', 'Dave');

\echo '--- K2. The one update the app makes ---'
\echo '     web/src/app/teams/actions.ts:224-228 updates display_name and selects it back.'
\echo '     Expect UPDATE 1 and the new name -- the trigger must let this through'
update public.profiles set display_name = 'Dave D'
where user_id = '44444444-4444-4444-4444-444444444444'
returning display_name;

\echo '--- K3. Did K2 stamp the timestamp? -- expect null: the setting did not change ---'
select (changed_at is null) as changed_at_still_null from public.my_ai_suggestions();

\echo '--- K4. The My teams page reads its own nickname (page.tsx:260-264) -- expect 1 row ---'
select display_name from public.profiles where user_id = '44444444-4444-4444-4444-444444444444';
reset role;

\echo '--- K5. team_roster, as Alice -- expect Alice, Carol and Erin with their nicknames ---'
set role authenticated;
set sandbox.uid = '11111111-1111-1111-1111-111111111111';
select team_name, display_name, role from public.team_roster order by role desc, display_name;

\echo '--- K6. team_roster, as Bob, who is in no team -- expect 0 rows ---'
set sandbox.uid = '22222222-2222-2222-2222-222222222222';
select team_name, display_name, role from public.team_roster;

\echo '--- K7. The teams read, which is the other half of the My teams page ---'
\echo '     expect 0 for Bob and 1 for Alice: untouched by this migration'
select count(*) as teams_bob_sees from public.teams;
set sandbox.uid = '11111111-1111-1111-1111-111111111111';
select count(*) as teams_alice_sees from public.teams;
reset role;

\echo ''
\echo '--- K8. Final state of public.profiles, as postgres ---'
select display_name, ai_suggestions_enabled, ai_suggestions_changed_at
from public.profiles order by display_name;
```

### A.3 How to rebuild the whole thing

The cluster, both databases and both runs, in the order they were done:

```
initdb -D <scratchpad>\pgdata -U postgres --auth=trust --encoding=UTF8
# then append  port = 55433  and  listen_addresses = '127.0.0.1'  to postgresql.conf
pg_ctl -D <scratchpad>\pgdata -l <scratchpad>\pg.log -w start

node build.mjs sandbox_before 00-standin.sql <the eight migrations on main> 90-seed.sql
node build.mjs sandbox_after  00-standin.sql <the same eight> 20261007204900_ai_suggestions_consent.sql 90-seed.sql
node ask.mjs   sandbox_before 10-readfirst.sql out-readfirst.txt
node ask.mjs   sandbox_after  20-attack.sql    out-attack.txt
```

`build.mjs` runs `dropdb --if-exists`, `createdb`, then `psql -f` per file with `ON_ERROR_STOP=1`,
printing each exit code and stopping on the first non-zero one — which is what makes the
`exit=0` lines in section 2 a check and not decoration. `ask.mjs` is the `spawnSync` wrapper
described above. The port is **55433**, deliberately not 5432: a `postgresql-x64-17` service already
runs there on the owner's machine and was not touched.

The guard's `db-remote-write` rule excludes `localhost` and `127.0.0.1`, which is why none of this
was blocked and why none of it is a remote write.

