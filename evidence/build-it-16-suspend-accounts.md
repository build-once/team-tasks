# Evidence: Build it 16 step 5, part A — suspend accounts (migration only)

Issue #128, part A of two. Migration:
`supabase/migrations/20261004114313_suspend_accounts.sql`.

**Result: PASS on a local sandbox. The migration has NOT been applied anywhere** — not staging,
not production, not the owner's own project. Rule 19: the assistant does not run `db push`
anywhere, and the guard refuses every `db push` except `--local`.

**Everything below was produced by the assistant on a throwaway PostgreSQL cluster on the owner's
machine.** It is not staging evidence and is not a substitute for it. Sections 7 and 8 are where
staging evidence goes and are **empty until the owner fills them in**.

The plan was updated first (rule 9): `docs/plan.md` gained a "Suspending an account" section and
two appendix rows in PR #129, merged as `62811ac`, before this migration was written.

---

## 1. The sandbox

PostgreSQL **17.10**, a cluster created by the assistant with `initdb` in its scratchpad, listening
on `127.0.0.1` port 55432 only, trust authentication, deleted at the end of the session. It is not
the version staging runs — **unverified: no version has been read back from staging or
production**, which `20261002122203_team_rules.sql` already notes about `security_invoker`.

Supabase's `auth` schema does not exist in a plain cluster, so a stand-in was written. This is the
whole of it:

```sql
create role anon nologin;
create role authenticated nologin;
-- bypassrls, because that is what Supabase's service_role has. The roles page says of
-- service_role: "This role is used by the API (PostgREST) to bypass Row Level Security."
create role service_role nologin bypassrls;

create schema auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Supabase's auth.uid() reads the request JWT. Here it reads a session setting, so a test
-- can say "now I am Carol" without a real token.
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('sandbox.uid', true), '')::uuid $$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
```

### The two lines that make this proof mean anything

```sql
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
```

Without these, a plain cluster grants `anon` and `authenticated` nothing on a new table, and
"privileges revoked from anon and authenticated" would pass by having nothing to revoke — which
rule 8 calls an unverified check, not a pass.

They are not invented. No migration in this repository grants a table privilege, yet the app
reaches `public.tasks` as `authenticated` on staging (`evidence/build-it-15-part-1.md`, 26 PASS),
so the project grants it. Supabase's changelog of 28 April 2026, *"Breaking Change: Tables not
exposed to Data and GraphQL API automatically"*, says of an existing project: "select, insert,
update, and delete are granted to every table in the `public` schema to the `anon`,
`authenticated` and `service_role` roles." `grant all` is deliberately **wider** than that, so the
revoke has strictly more to remove here than it would in the real project.

Confirmed in the sandbox — a new table arrives already reachable:

```
 relname  |                                                       relacl
----------+--------------------------------------------------------------------------------------------------------------------
 profiles | {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
 tasks    | {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
```

The **functions** line matters for a separate reason: Supabase grants `EXECUTE` to `anon` **by
name**, which is a different grant from the one `PUBLIC` holds, and `revoke ... from public` does
not remove it. That is why issue #128 asks for both revoke lines, and why without this line
"`anon` cannot execute `is_active()`" would have passed for the wrong reason.

### The seed

Three invented people, two teams, and at least one row in every table the rules cover. Run as
`postgres`, which owns the tables, so row-level security does not apply and the seed is not itself
a test.

```sql
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.invalid'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.invalid'),
  ('33333333-3333-3333-3333-333333333333', 'carol@example.invalid');

insert into public.teams (id, name, owner_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Alice team', '1111...'),
  ('cccccccc-0000-4000-8000-000000000001', 'Carol team', '3333...');

insert into public.team_members (team_id, user_id) values
  ('aaaaaaaa-...-0001', '3333...'),   -- Carol is a member of Alice team
  ('cccccccc-...-0001', '2222...');   -- Bob is a member of Carol team

insert into public.profiles (user_id, display_name) values
  ('1111...', 'Alice'),
  ('2222...', 'Bob');                 -- deliberately NOT Carol: see below

insert into public.invitations (team_id, email, token_hash, invited_by) values
  ('aaaaaaaa-...-0001', 'dave@example.invalid', repeat('a', 64), '1111...'),
  ('cccccccc-...-0001', 'erin@example.invalid', repeat('b', 64), '3333...');

insert into public.tasks (id, owner_id, title, team_id) values
  ('11111111-0000-4000-8000-000000000001', '1111...', 'Alice personal',  null),
  ('11111111-0000-4000-8000-000000000002', '1111...', 'Alice team task', 'aaaaaaaa-...-0001'),
  ('33333333-0000-4000-8000-000000000001', '3333...', 'Carol personal',  null),
  ('33333333-0000-4000-8000-000000000002', '3333...', 'Carol team task', 'cccccccc-...-0001');
```

**Carol is the person suspended**, because one person then exercises all five tables: she owns
Carol team, is a member of Alice team, has tasks of both kinds, and owns a team with a pending
invitation and a member she could remove.

**Carol deliberately has no profile row.** "A suspended person cannot create their own profile"
needs somebody who has none yet, or the refusal could be the primary key rather than the rule.

Every id is hand-written and every name invented. The two `token_hash` values are 64 `a`s and 64
`b`s — the shape the constraint demands, hashes of nothing, and no real token exists in this
sandbox. The addresses use the reserved `.invalid` suffix and belong to nobody.

### Two databases

- **`sandbox_before`** — the stand-in, the six migrations on `main`, then the seed.
- **`sandbox_after`** — the same, plus `20261004114313_suspend_accounts.sql`.

Both applied with `ON_ERROR_STOP=1`. `sandbox_before` first, to confirm the policy counts issue
#128 quotes:

```
  tablename   | policies
--------------+----------
 invitations  |        1
 profiles     |        3
 tasks        |        4
 team_members |        2
 teams        |        1
(5 rows)
```

Eleven, exactly as the issue says.

---

## 2. Applying the migration

Fifteen statements, no notices, no warnings:

```
CREATE TABLE
COMMENT
ALTER TABLE
REVOKE
GRANT
CREATE FUNCTION
COMMENT
REVOKE
REVOKE
GRANT
CREATE POLICY
CREATE POLICY
CREATE POLICY
CREATE POLICY
CREATE POLICY
exit: 0
```

---

## 3. What it created, read back from the catalogue

Not from the migration file — from `pg_policies`, `pg_class`, `pg_proc` and
`information_schema.role_table_grants`.

**The five rules.** One per table, `RESTRICTIVE`, `ALL` commands, `{authenticated}`:

```
  tablename   |                policyname                 | permissive  | cmd |      roles
--------------+-------------------------------------------+-------------+-----+-----------------
 invitations  | Suspended accounts are refused everything | RESTRICTIVE | ALL | {authenticated}
 profiles     | Suspended accounts are refused everything | RESTRICTIVE | ALL | {authenticated}
 tasks        | Suspended accounts are refused everything | RESTRICTIVE | ALL | {authenticated}
 team_members | Suspended accounts are refused everything | RESTRICTIVE | ALL | {authenticated}
 teams        | Suspended accounts are refused everything | RESTRICTIVE | ALL | {authenticated}
(5 rows)
```

**Nothing was replaced.** The 11 permissive policies are all still there, one restrictive added to
each table:

```
  tablename   | total | permissive | restrictive
--------------+-------+------------+-------------
 invitations  |     2 |          1 |           1
 profiles     |     4 |          3 |           1
 tasks        |     5 |          4 |           1
 team_members |     3 |          2 |           1
 teams        |     2 |          1 |           1
(5 rows)
```

**`account_status`: row-level security on, and no policy at all.**

```
    relname     | rls_enabled | rls_forced | policies
----------------+-------------+------------+----------
 account_status | t           | f          |        0
(1 row)
```

**Its privileges.** `anon` and `authenticated` are gone entirely; `service_role` keeps `SELECT`
and nothing else:

```
   grantee    |                          privileges
--------------+---------------------------------------------------------------
 postgres     | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
 service_role | SELECT
(2 rows)
```

**`is_active()`.** `security definer`, empty `search_path`:

```
  proname  | security_definer |       settings       |                                  acl
-----------+------------------+----------------------+------------------------------------------------------------------------
 is_active | t                | {"search_path=\"\""} | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
(1 row)
```

**`anon` is gone from that list, which is the thing #128 asked for. `service_role` is not**, and
that is worth stating because the three lines read as though only `authenticated` ends up with
`EXECUTE`. Supabase grants `EXECUTE` to `service_role` by name and the migration revokes only
`public` and `anon`, so that grant survives — exactly as it does for `is_team_member`:

```
          proname           |                                          acl
----------------------------+----------------------------------------------------------------------------------------
 is_active                  | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
 is_team_member             | {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
 tasks_enforce_column_rules | {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
```

Identical, which is what #128 asked for ("as `is_team_member` does"). It is harmless —
`service_role` already has `SELECT` on `account_status` and bypasses row-level security. But
`20261002122203_team_rules.sql`'s comment claims "`service_role` is deliberately NOT granted",
and that is untrue of both functions. **Filed as #131.** This migration's own comment states the
true behaviour rather than repeating the claim.

---

## 4. An active person: every existing behaviour unchanged

One script, 37 labelled steps — 35 behaviour checks plus 2 confirming the seeded state was put
back — run against **both** databases and the two outputs compared. It names neither
`account_status` nor `is_active`, because neither exists in `sandbox_before` and naming them would
make the outputs differ for a reason that has nothing to do with behaviour.

Each statement is its own transaction (no `BEGIN`, `ON_ERROR_STOP` off), the way PostgREST sends
them, so an expected refusal does not abandon the rest.

What it asks:

```
A1-A15  Carol (member of Alice team, owner of Carol team): read tasks; add one; rename her own;
        tick Alice's team task; cannot see Alice's personal task; cannot delete Alice's team
        task; delete her own; read teams; read invitations; create her profile; read profiles;
        rename her profile; cannot rename Alice's; cannot delete her profile; read team_roster
B1-B7   Bob (outsider to Alice team): sees only Carol team's task; sees nothing of Alice's team
        task; cannot tick it; cannot file a task into Alice team; reads 1 team; reads 0
        invitations; cannot remove Carol from Alice team
C1-C4   Alice (owner): reads her 2 tasks; reads her team's invitation; cannot move her task into
        a team she is not in; renames her own task
D1-D6   Signed out (role anon): tasks, teams, team_members, invitations, profiles, team_roster
E1-E3   Carol again: reads the members lists; removes Bob from the team she owns; cannot remove
        herself from Alice team
F1-F2   the seeded state is back
```

**The two outputs are byte-identical.** SHA-256 of each:

```
738643C8A4A4357DDCAF67535328CB3DB317888A8C9B797CA1C40D0C22A9DA7D  out-before.txt
738643C8A4A4357DDCAF67535328CB3DB317888A8C9B797CA1C40D0C22A9DA7D  out-after.txt
exit: 0  (both runs)
```

Identical results **and** identical error messages, including the two the trigger raises:

```
-- B4 Bob cannot file a task into Alice team (expect the trigger to refuse)
ERROR:  A task can only be added to a team its creator belongs to.
CONTEXT:  PL/pgSQL function public.tasks_enforce_column_rules() line 22 at RAISE
-- C3 Alice cannot move her task into a team she is not in (expect the trigger to refuse)
ERROR:  A task can only be moved into a team its creator belongs to.
CONTEXT:  PL/pgSQL function public.tasks_enforce_column_rules() line 88 at RAISE
```

That is issue #128's "for an active person every existing behaviour is unchanged", and it is a
hash comparison rather than a reading of two outputs side by side.

---

## 5. A suspended person

59 labelled steps on `sandbox_after`. The owner suspends Carol with one insert —

```sql
insert into public.account_status (user_id, reason)
  values ('3333...', 'Sandbox test. Invented, about nobody.');
```

### Before she is suspended, `account_status` is already closed to her

| | Result |
|---|---|
| H1 `is_active()` | `t` |
| H2 read `account_status` | **`ERROR: permission denied for table account_status`** |
| H3 insert | **permission denied** |
| H4 update | **permission denied** |
| H5 delete | **permission denied** |

### Signed out

| | Result |
|---|---|
| I1 execute `is_active()` | **`ERROR: permission denied for function is_active`** |
| I2 read `account_status` | **permission denied** |

### Suspended: all five tables, all four commands

| | Expected | Result |
|---|---|---|
| J1 `is_active()` | f | `f` |
| J2 tasks select | 0, was 3 | **0** |
| J3 tasks insert | refused | **`ERROR: new row violates row-level security policy "Suspended accounts are refused everything" for table "tasks"`** |
| J4 tasks update her own | 0 | **`UPDATE 0`** |
| J5 tasks update a team task she is a member of | 0 | **`UPDATE 0`** |
| J6 tasks delete her own | 0 | **`DELETE 0`** |
| J7 teams select | 0, was 2 | **0** |
| J8 teams insert | refused | **`ERROR: new row violates row-level security policy for table "teams"`** |
| J9 team_members select | 0, was 2 | **0** |
| J10 team_members delete Bob from her own team | 0 | **`DELETE 0`** |
| J11 invitations select | 0, was 1 | **0** |
| J12 profiles insert her own | refused | **`ERROR: new row violates row-level security policy "Suspended accounts are refused everything" for table "profiles"`** |
| J13 profiles select | 0, was 2 | **0** |
| J14 `team_roster` (the view) | 0, was 4 | **0** |
| J15-J18 `account_status` select / delete her own row / update / insert | permission denied | **permission denied, all four** |
| K1 profiles update, with a row to update | 0 | **`UPDATE 0`** |
| K2 profiles select, her row now exists | 0 | **0** |

Three of the four commands are silent and one raises, which is why #128 asks for "return nothing
or are refused": `select` and `delete` match no rows, `update` matches no rows, and only `insert`
has a `with check` to violate.

**J16 is the one that matters most**: a suspended person cannot delete their own
`account_status` row to free themselves.

**J14** is the `security_invoker` view. A view cannot have a policy and does not need one — it
reads `teams`, `team_members` and `profiles` as the person asking.

### Her team mates are not affected

| | Expected | Result |
|---|---|---|
| L1 Alice reads her tasks | 2 | **2** |
| L2 Alice reads her team's invitation | 1 | **1** |
| L3 Alice reads the suspended person's nickname | 1 | **1** |
| L4 Alice's `team_roster` | same as H6 | **2 rows, 1 of them Carol's — identical to H6** |
| L5 Alice `is_active()` | t | **t** |

Suspension is about what the suspended person may do. It does not hide them from their team, and
`docs/plan.md` does not ask for that.

### Removing the row restores access at once

In the same session, immediately after `delete from public.account_status`:

| | Expected | Result |
|---|---|---|
| N1 `is_active()` | t | **t** |
| N2 tasks | 3 again | **3** |
| N3 teams | 2 again | **2** |
| N4 team_members | 2 again | **2** |
| N5 invitations | 1 again | **1** |
| N6 profiles | 3 | **3** |
| N7 `team_roster` | 4 again | **4** |
| N8 rename her own task | `UPDATE 1` | **`UPDATE 1`** |
| N9 add a task | `INSERT 0 1` | **`INSERT 0 1`** |
| N10 delete it | `DELETE 1` | **`DELETE 1`** |

No cache to clear and no session to end: the function is read per query.

### `service_role` bypasses all of it — this is why part B exists

| | Result |
|---|---|
| M1 reads every task, suspended caller or not | **4** |
| M2 reads every team | **2** |
| M3 **creates a team for the suspended person** | **`INSERT 0 1`** |
| M4 reads `account_status` by id | **1** |
| M5 writes `account_status` | **permission denied** |
| M6 executes `is_active()` | **`f`** — it can call it |
| M7 `is_active()` on a connection with **no session** | **`f`** |
| M8 reads `account_status` by id, no session needed | **Carol 1, Alice 0** |

**M3 is the gap part B closes**, demonstrated rather than argued. **M7 is the trap**: on an admin
connection `auth.uid()` is null, so `is_active()` answers `false` for everybody — a server
function that called it would refuse every caller, with no error. Part B reads `account_status` by
user id, which M8 shows works. **M5** confirms nothing in the app can suspend or un-suspend
anybody, even by mistake.

`exit: 0`. The seeded state was restored and counted: 4 tasks, 2 teams, 2 members, 2 invitations,
2 profiles, 0 suspended; nothing left ticked or renamed.

---

## 6. Each check fails when its rule is removed

Issue #128: "The proof shows each check failing when the restrictive rule for that table is
removed." Carol stays suspended throughout; one rule is dropped at a time and put back.

**The first version of this script got three of its own expectations wrong, and the reason is
worth more than the script.** The five rules **interlock**. Three of the eleven permissive
policies read another of the five tables *directly* in a subquery, and a subquery inside a policy
is an ordinary read that obeys that table's rules. Policies that go through
`public.is_team_member()` are not doubly protected, because that function is `security definer`
and reads its tables as `postgres`.

| Table | Its own rule dropped | Also dropping what it leans on |
|---|---|---|
| **tasks** | **all four checks fail**: select 0→**3**, insert refused→**`INSERT 0 1`**, update 0→**`UPDATE 1`**, delete 0→**`DELETE 1`** | — isolated |
| **teams** | **check fails**: select 0→**2** | — isolated |
| **team_members** | select 0→**2** (fails). delete **still `DELETE 0`** | + teams' rule → **`DELETE 1`**, Bob is gone |
| **invitations** | select **still 0** | + teams' rule → **1** |
| **profiles** | select 0→**1**, update 0→**`UPDATE 1`** (both fail) | + team_members' and teams' rules → **3** |

Why each: the `team_members` delete policy and the `invitations` select policy both read
`public.teams` directly; two of the three branches of the `profiles` select policy read
`public.team_members` and `public.teams` directly. The `profiles` "own row" branch is
`auth.uid() = user_id` and needs nothing else, which is why one row comes back rather than three.

**Honest consequence: `invitations` is the one table whose own restrictive rule changes no answer
today.** `teams`' rule already refuses a suspended owner the subquery read. The rule is defence in
depth — it is what keeps the table closed if `invitations` ever gains a policy that does not route
through `teams`. It is kept, and this is the record of why it is not currently load-bearing.

**And `is_active()` is the single point all five rest on.** With all five rules back in place,
deleting Carol's row and changing nothing else:

```
 active
--------
 t

 tasks | teams | members | invitations | profiles
-------+-------+---------+-------------+----------
     3 |     2 |       2 |           1 |        3
```

Every rule put back, counted at the end: **11 permissive, 5 restrictive**, and the seeded row
counts restored. `exit: 0`.

---

## 7. Staging apply

**Not done, and not attempted.** Rule 19: the assistant does not run `db push` anywhere; staging
migrations go through the owner or the CI job in #55.

**Unverified — nothing in this file has been observed on staging.** To fill this in: apply the
migration, then read back `pg_policies` for the five restrictive rules,
`information_schema.role_table_grants` for `account_status`, and `pg_proc.proacl` for `is_active`.

## 8. The checks re-run on staging

**Not done.** The behaviour script in section 4 is sandbox SQL, not a staging script; there is no
`scripts/staging/` script for suspension yet, and part A adds none because nothing in the app
exercises this path.

---

## 9. Notes

- **Data captured from production: none.** Nothing was captured, read or copied, so **nothing has
  been redacted** (rule 18). Every id, name, address and `reason` string in this file is invented.
  The two `token_hash` values are 64 `a`s and 64 `b`s. The three addresses use the reserved
  `.invalid` suffix.
- **No package was installed** for any of this.
- `psql` prefixes each error with the script's path and line number. Those paths are in the
  assistant's scratchpad and have been removed from the quoted output above; nothing else in any
  quoted line is altered.
- The error messages are quoted from a PostgreSQL 17.10 cluster. Staging's version has not been
  read back, so the exact wording there is **unverified**.
- Issues filed alongside this work: **#130** (migrations grant no table privileges, and Supabase
  removes the default on 30 October 2026) and **#131** (`is_team_member`'s comment about
  `service_role` is untrue).
- `finding #133`, referenced by issue #128 for the `is_active` grant lines, **could not be
  located**: `gh issue view 133` returns "Could not resolve to an issue or pull request", and
  `#133` appears nowhere in the repository. The grant lines were written to match
  `public.is_team_member`'s, which is what the issue describes.
