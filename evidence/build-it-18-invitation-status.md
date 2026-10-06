# Evidence: Build it 18 part 2a — invitation status (migration only)

Issue #164. Migration: `supabase/migrations/20261006095847_invitation_status.sql`.

**Result: PASS on a local sandbox. Applied to staging by the owner on 6 October 2026 — see section 9,
where the unchanged `invite-member` is also shown creating a `queued` row in the migrated table
(section 9e). NOT applied to production.** Rule 19: the assistant does not run `db push` anywhere, and
the guard refuses every `db push` except `--local`.

**Sections 1 to 8 were written before the staging apply and are left exactly as they were**: they are
the record of the local sandbox run, and every "not applied to staging" and "unverified — staging" in
them was true when written. **Section 9 is the staging record**, and where it settles something
sections 7 and 8 left open, it says so. Nothing in sections 1 to 8 is a staging observation; nothing
anywhere in this file is a production observation.

Read from `main` at commit `c9f52a6` ("Merge pull request #160 from build-once/feat/build-it-18-sentry"),
fetched and fast-forwarded at the start of the session.

`docs/plan.md` already carries the "Invitation status" section and its appendix row, merged before
this issue was written, so rule 9 needed no plan change here.

**No connector and no browser was used for any of this**, as issue #164 asks: the repository was
read from disk, the sandbox was driven with `psql`, and the pull request is opened with `gh`.

**Redaction (rule 18): nothing was captured from production, so the list of replaced values is
empty.** Every address below ends in the reserved `.invalid` suffix and belongs to nobody, every
uuid beginning `1111`/`2222`/`3333`/`aaaa`/`cccc`/`dddd` was hand-written for this sandbox, and the
two full-length uuids that are not hand-written came from `gen_random_uuid()` in a throwaway
database that has since been deleted. The `token_hash` values are 64 `a`s, `b`s, `c`s, `e`s and
`f`s — the shape the constraint demands, hashes of nothing. No real token exists in this sandbox.

---

## 1. The two answers issue #164 asks for under "Read first"

### 1a. In what order does invite-member send the email and write the row, and can a row exist whose email was never sent?

**The order: the row is written first, then the email is sent.** In
`supabase/functions/invite-member/index.ts`:

| line | what happens |
|---|---|
| 620 | `decideDelivery(...)` — may this environment send at all? If not, **nothing is written**. |
| 657 | delete this address's dead (expired, unaccepted) invitations to this team |
| 688 | **insert the invitation row** |
| 744 | **send the email** |
| 752–777 | if the send failed: **delete the row just created** |

So the normal failure path leaves nothing behind, and the function is deliberately built that way —
its own comment at line 228 says "an invitation that exists but whose email was never sent is worse
than no invitation, because it occupies one of the team's 20 pending slots and the person it names
never heard about it."

**But yes, a row can exist whose email was never sent.** Two paths:

1. **The send failed AND the cleanup delete also failed.** Lines 756–771. The function detects this
   itself and logs `invite-member: email send failed AND the invitation could not be removed.
   Invitation id <id> is orphaned and occupies a pending slot.`
2. **The function stopped between the insert at 688 and the cleanup at 756** — a crash, a request
   timeout, a shut-down isolate. Nothing runs the delete at all, and nothing else ever will: no
   sweeper, no job, no constraint removes it.

**Neither leaves a mark in the data.** There is no column, and no combination of columns, that tells
such a row from one whose email went. This is what made the backfill a question for the owner rather
than a line to write — see section 4.

### 1b. Every role that can update a row in `invitations` today, and through which policy or grant

Measured on the sandbox at `main`'s schema, before this migration (section 2 gives the method):

```text
    grantee    |                          table_level
---------------+---------------------------------------------------------------
 anon          | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
 authenticated | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
 postgres      | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
 service_role  | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
(4 rows)
```

There are **two layers**, and the answer is different at each:

**The grant layer — four roles hold UPDATE.** `anon`, `authenticated`, `postgres` and `service_role`.
No migration in this repository grants any of them: it is the Supabase project default, described in
its changelog of 28 April 2026, *"Breaking Change: Tables not exposed to Data and GraphQL API
automatically"* — "select, insert, update, and delete are granted to every table in the `public`
schema to the `anon`, `authenticated` and `service_role` roles."

**The policy layer — exactly one role can actually update a row: `service_role`.**

- `invitations` has **no update policy at all**. `20260930193813_create_invitations.sql` creates one
  policy, `"Team owners can read their team's invitations"`, `for select`, and says so in its header:
  "No insert, update or delete policy, on purpose." `20261004114313_suspend_accounts.sql` adds a
  second, `"Suspended accounts are refused everything"`, which is **restrictive** — a restrictive
  policy can only ever take away, never grant. So with row-level security on, an update by `anon` or
  `authenticated` matches no permissive policy and is refused.
- **`service_role` updates freely, and not through a policy.** It holds `BYPASSRLS`; the Supabase
  roles page says of it, "This role is used by the API (PostgREST) to bypass Row Level Security."
  This is the one update the app actually performs: `accept-invite` setting `accepted_at`
  (`supabase/functions/accept-invite/index.ts`:413–418), through `ctx.supabaseAdmin`.
- **`postgres`** owns the tables, so row-level security does not apply to it either. It is the
  migration role and the dashboard's role, not a caller the app ever uses.

**So: today, `service_role` and `postgres` can change a row; `anon` and `authenticated` hold the
privilege but are stopped by the absence of a policy.** That second group is exactly why this
migration bothers with grants at all — see section 5.

---

## 2. The sandbox

PostgreSQL **17.10**, a cluster created with `initdb` in the session scratchpad, listening on
`127.0.0.1` port 55432 only, trust authentication, deleted at the end of the session. It is not the
version staging runs: the owner reported staging on **17.6** in
`evidence/build-it-16-suspend-accounts.md` section 7. Production's version is still unverified.

```text
PostgreSQL 17.10 on x86_64-windows, compiled by msvc-19.44.35226, 64-bit
```

The Supabase stand-in, the seed and the attack are the same shape as
`evidence/build-it-16-suspend-accounts.md` section 1, which is how the five suspension rules were
proved on a plain cluster. The stand-in creates the three roles (`service_role` with `bypassrls`),
an `auth` schema with a `users` table and an `auth.uid()` that reads a session setting, and — the
two lines that make any of this mean anything:

```sql
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
```

Without these, a plain cluster grants `anon` and `authenticated` nothing on a new table, and "the
app's roles cannot write status" would pass by having nothing to revoke — which rule 8 calls an
unverified check, not a pass. `grant all` is deliberately **wider** than Supabase's default, so the
revoke has strictly more to remove here than it would in the real project.

**Two databases**, both with `ON_ERROR_STOP=1` on the applies:

- **`sandbox_before`** — the stand-in, the seven migrations on `main`, then the seed.
- **`sandbox_after`** — `create database sandbox_after template sandbox_before`, then this migration.

Cloning rather than re-seeding is the point: the three invitation rows exist **before** the migration
runs, so the backfill in section 4 acts on real rows and `UPDATE 3` is a count and not a hope.

### The seed

Three invented people. Alice owns "Alice team" and its two invitations; Carol is a member of Alice
team and owns "Carol team" with one invitation; Bob is in neither of Alice's. Every id is
hand-written and every name invented.

---

## 3. Applying the migration

Eleven statements, no notices, no warnings, exit 0:

```text
ALTER TABLE
ALTER TABLE
COMMENT
COMMENT
UPDATE 3
ALTER TABLE
ALTER TABLE
REVOKE
GRANT
GRANT
GRANT
```

`UPDATE 3` is the backfill, on the three rows the seed created before the migration ran.

The two check constraints are added **after** the backfill on purpose: a constraint added to a
populated table is validated against every existing row, so applying this migration also proves the
backfill it just ran satisfies them. A bad backfill would stop the apply here rather than reach
staging.

---

## 4. The backfill, and the question the owner answered

Issue #164 says: "sets existing rows according to what you found above. If today a row exists only
after a successful send, existing rows are sent. **If that is not true, stop and ask the owner.**"

**It is not true** — section 1a. So the owner was asked, on 2026-10-06, and chose **all existing rows
→ `sent`**, with the alternatives on the table being "accepted rows sent, the rest queued" and
"leave the backfill out of the migration".

The reasoning recorded with that choice: with exactly three values allowed, `sent` is the least wrong
for the whole set, because every row except a rare and untraceable orphan did have its email go.
Calling the unaccepted ones `queued` would be wrong in a worse direction — nothing will ever send
them, so the next issue's screen would show long-dead invitations as "about to go" forever.

**The known limitation, stated plainly:** a row left behind by either path in section 1a is now
labelled `sent` and its email never went. No query could have separated it, and nothing downstream
can tell. This is a property of the backfill, not a bug to be fixed later.

---

## 5. Supabase's exposure of the new columns: what they get by default, and what was set

**By default, the two new columns arrive insertable and updatable by the app's own two roles.**
Supabase's table-level grants to `anon`, `authenticated` and `service_role` (quoted in section 1b)
are *table-level*, and **a table-level grant covers every column the table ever grows**. Nothing
about adding a column narrows them.

Row-level security refuses those writes today anyway, because `invitations` has no insert or update
policy. That is a second lock, not a reason to leave the first one open: **privileges are checked
before row-level security**, and the day somebody adds an insert or update policy to this table for a
feature that has nothing to do with status, these two columns must not come with it.

### Why the obvious fix does not work, measured

A table-level privilege **cannot have a column carved out of it**. `revoke update (email) ...` does
not fail, does not warn, and does not do anything — run against `sandbox_before` on a column that
already exists:

```text
--- I1. authenticated holds table-level UPDATE today ---
    grantee    | privilege_type
---------------+----------------
 authenticated | UPDATE
(1 row)

--- I2. try the obvious thing: revoke UPDATE on one column ---
REVOKE
--- I3. did it do anything? Expect authenticated to STILL hold table-level UPDATE ---
    grantee    | privilege_type
---------------+----------------
 authenticated | UPDATE
(1 row)

--- I4. and to still reach the column, which is the point ---
    grantee    | column_name | privilege_type
---------------+-------------+----------------
 authenticated | email       | UPDATE
(1 row)
```

**`REVOKE` with no warning, and the privilege is still there.** A migration written that way would
have looked exactly like a passing one. The only way to express "every column except these two" is to
take the table-level privilege away and give back a column list, which is what the migration does.

### What was set

```sql
revoke insert, update on table public.invitations from anon, authenticated;

grant insert (id, team_id, email, token_hash, invited_by, created_at, expires_at, accepted_at)
  on table public.invitations to anon, authenticated;
grant update (id, team_id, email, token_hash, invited_by, created_at, expires_at, accepted_at)
  on table public.invitations to anon, authenticated;

grant insert (status, failure_code), update (status, failure_code)
  on table public.invitations to service_role;
```

- **The re-grant lists the eight columns that existed before this migration**, so the reach of `anon`
  and `authenticated` is exactly what it was, minus the two new ones. Nothing else was narrowed.
- **`select` and `delete` are untouched.** `select` because the team's owner must read the two
  columns through the policy already there, and a table-level `select` covers them. `anon` and
  `authenticated` keep table-level `select` exactly as they do today for `email` and `token_hash`,
  and read nothing, because the one policy matches only the team's owner.
- **The `service_role` line grants nothing it cannot already do** — it holds table-level `insert` and
  `update` by the project default. It is written down because issue #164 asks that only the server
  function's role may set these two, and a permission resting entirely on a default nobody wrote is a
  permission nobody can see.
- **A column added by a later migration will not be in these lists** and will be closed to both roles
  until a migration opens it. That is the safer direction to fail in, and the migration says so where
  the next person to add a column will read it.

### One thing this migration deliberately does not answer, and why it is not a new exposure

Everything else `service_role` does on this table — the insert in `invite-member`, the `accepted_at`
update in `accept-invite`, both deletes — still rests on the Supabase project default. Supabase
applies "tables in public are not exposed by default" to all existing projects on **30 October
2026**, and **issue #130 already holds that whole question** — no new issue was filed, because
filing one would have been a duplicate.

**It is also not a risk this migration introduces.** #130's own sandbox output settles it: the
change is to *default* privileges, so "the old table keeps its grants, the new one has none".
`public.invitations` already exists, and this migration creates no table. The date is a question
about tables created after it.

---

## 6. The attack

Four callers — the team owner, a member, an outsider and signed out — try to read, set and change the
two columns, against `sandbox_after`. Each statement is its own transaction (no `BEGIN`,
`ON_ERROR_STOP=0`), the way PostgREST sends them. `postgres` is never the caller: every section
`set role`s first, so row-level security is actually in force.

Sections F and G run as `service_role` on purpose. F proves the two functions' existing statements
still work unchanged; G attacks the constraints **as the role that is allowed to write them**, so
every refusal there is the constraint and never a privilege getting in the way first.

**Everything below was produced by one run of one script, pasted whole and unedited.**

```text
================ A. WHAT THE CATALOGUE SAYS AFTER THE MIGRATION ================
--- A1. Table-level privileges on invitations ---
    grantee    |                          table_level                          
---------------+---------------------------------------------------------------
 anon          | DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE
 authenticated | DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE
 postgres      | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
 service_role  | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
(4 rows)

--- A2. Column-level privileges on invitations (status and failure_code only) ---
    grantee    | column_name  | privilege_type 
---------------+--------------+----------------
 anon          | failure_code | REFERENCES
 anon          | failure_code | SELECT
 anon          | status       | REFERENCES
 anon          | status       | SELECT
 authenticated | failure_code | REFERENCES
 authenticated | failure_code | SELECT
 authenticated | status       | REFERENCES
 authenticated | status       | SELECT
 postgres      | failure_code | INSERT
 postgres      | failure_code | REFERENCES
 postgres      | failure_code | SELECT
 postgres      | failure_code | UPDATE
 postgres      | status       | INSERT
 postgres      | status       | REFERENCES
 postgres      | status       | SELECT
 postgres      | status       | UPDATE
 service_role  | failure_code | INSERT
 service_role  | failure_code | REFERENCES
 service_role  | failure_code | SELECT
 service_role  | failure_code | UPDATE
 service_role  | status       | INSERT
 service_role  | status       | REFERENCES
 service_role  | status       | SELECT
 service_role  | status       | UPDATE
(24 rows)

--- A3. INSERT and UPDATE reach, column by column, for anon and authenticated ---
 column_name  |     can_insert      |     can_update      
--------------+---------------------+---------------------
 accepted_at  | anon, authenticated | anon, authenticated
 created_at   | anon, authenticated | anon, authenticated
 email        | anon, authenticated | anon, authenticated
 expires_at   | anon, authenticated | anon, authenticated
 failure_code |                     | 
 id           | anon, authenticated | anon, authenticated
 invited_by   | anon, authenticated | anon, authenticated
 status       |                     | 
 team_id      | anon, authenticated | anon, authenticated
 token_hash   | anon, authenticated | anon, authenticated
(10 rows)

--- A4. The backfill: every row that existed is sent, with an empty code ---
                  id                  | status | failure_code | code_is_empty 
--------------------------------------+--------+--------------+---------------
 dddddddd-0000-4000-8000-000000000001 | sent   |              | t
 dddddddd-0000-4000-8000-000000000002 | sent   |              | t
 dddddddd-0000-4000-8000-000000000003 | sent   |              | t
(3 rows)

--- A5. The two new constraints ---
             conname              |                                                                                                  pg_get_constraintdef                                                                                                   
----------------------------------+-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 invitations_failure_code_allowed | CHECK ((((status = 'failed'::text) AND (failure_code = ANY (ARRAY['not_configured'::text, 'unreachable'::text, 'refused'::text, 'unconfirmed'::text]))) OR ((status <> 'failed'::text) AND (failure_code = ''::text))))
 invitations_status_allowed       | CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text])))
(2 rows)

--- A6. The policies on invitations are unchanged: one permissive select, one restrictive ---
                  policyname                   | permissive  |  cmd   |      roles      
-----------------------------------------------+-------------+--------+-----------------
 Suspended accounts are refused everything     | RESTRICTIVE | ALL    | {authenticated}
 Team owners can read their team's invitations | PERMISSIVE  | SELECT | {authenticated}
(2 rows)


================ B. SIGNED OUT (anon) ================
SET
 set_config 
------------
 
(1 row)

--- B1. read the two columns -- expect 0 rows ---
 id | status | failure_code 
----+--------+--------------
(0 rows)

--- B2. set status on insert -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:62: ERROR:  permission denied for table invitations
--- B3. change status -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:65: ERROR:  permission denied for table invitations
--- B4. change failure_code -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:68: ERROR:  permission denied for table invitations
RESET

================ C. BOB -- an outsider, signed in ================
SET
              set_config              
--------------------------------------
 22222222-2222-2222-2222-222222222222
(1 row)

--- C1. read the two columns -- expect 0 rows ---
 id | status | failure_code 
----+--------+--------------
(0 rows)

--- C2. set status on insert -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:84: ERROR:  permission denied for table invitations
--- C3. change status -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:87: ERROR:  permission denied for table invitations
--- C4. change failure_code -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:90: ERROR:  permission denied for table invitations
RESET

================ D. CAROL -- a member of Alice team, signed in ================
SET
              set_config              
--------------------------------------
 33333333-3333-3333-3333-333333333333
(1 row)

--- D1. read the two columns on the team she belongs to -- expect 0 rows ---
 id | status | failure_code 
----+--------+--------------
(0 rows)

--- D2. read her OWN team's invitation, which she owns -- expect 1 row, proving the read works at all ---
                  id                  | status | failure_code 
--------------------------------------+--------+--------------
 dddddddd-0000-4000-8000-000000000003 | sent   | 
(1 row)

--- D3. set status on insert into the team she belongs to -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:111: ERROR:  permission denied for table invitations
--- D4. change status on Alice's invitation -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:114: ERROR:  permission denied for table invitations
--- D5. change status on HER OWN team's invitation, which she can read -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:117: ERROR:  permission denied for table invitations
--- D6. change failure_code on her own team's invitation -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:120: ERROR:  permission denied for table invitations
RESET

================ E. ALICE -- the team owner, signed in ================
SET
              set_config              
--------------------------------------
 11111111-1111-1111-1111-111111111111
(1 row)

--- E1. read the two columns on her own team -- expect 2 rows (the owner-only read must still work) ---
                  id                  |        email         | status | failure_code 
--------------------------------------+----------------------+--------+--------------
 dddddddd-0000-4000-8000-000000000001 | dave@example.invalid | sent   | 
 dddddddd-0000-4000-8000-000000000002 | erin@example.invalid | sent   | 
(2 rows)

--- E2. read somebody else's team's invitation -- expect 0 rows ---
 id | status | failure_code 
----+--------+--------------
(0 rows)

--- E3. set status on insert -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:141: ERROR:  permission denied for table invitations
--- E4. set failure_code on insert -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:146: ERROR:  permission denied for table invitations
--- E5. change status on an invitation she OWNS and can read -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:149: ERROR:  permission denied for table invitations
--- E6. change failure_code on an invitation she OWNS -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:153: ERROR:  permission denied for table invitations
--- E7. change both at once -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:157: ERROR:  permission denied for table invitations
--- E8. CONTRAST: change a column she DOES still have the privilege for (email).
        Expect UPDATE 0 -- refused by the policy, not by a privilege, which is
        exactly what it was before this migration. Nothing was narrowed here. ---
UPDATE 0
--- E9. a plain insert with no status named, the shape the app could try -- expect refused by the policy as before ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:168: ERROR:  new row violates row-level security policy for table "invitations"
RESET

================ F. service_role -- the server functions ================
SET
--- F1. the insert invite-member makes today, UNCHANGED: four columns, no status ---
                  id                  |         email         | status | failure_code 
--------------------------------------+-----------------------+--------+--------------
 030c3096-0541-40fe-ad64-093109becdf7 | grace@example.invalid | queued | 
(1 row)

INSERT 0 1
--- F2. the accepted_at update accept-invite makes today, UNCHANGED ---
                  id                  | status | failure_code 
--------------------------------------+--------+--------------
 dddddddd-0000-4000-8000-000000000002 | sent   | 
(1 row)

UPDATE 1
--- F3. the delete invite-member makes on a failed send, UNCHANGED ---
                  id                  
--------------------------------------
 030c3096-0541-40fe-ad64-093109becdf7
(1 row)

DELETE 1
--- F4. set status to sent -- expect allowed ---
                  id                  | status | failure_code 
--------------------------------------+--------+--------------
 dddddddd-0000-4000-8000-000000000001 | sent   | 
(1 row)

UPDATE 1
--- F5. set status to failed with a code -- expect allowed ---
                  id                  | status | failure_code 
--------------------------------------+--------+--------------
 dddddddd-0000-4000-8000-000000000001 | failed | refused
(1 row)

UPDATE 1
--- F6. insert naming status -- expect allowed ---
                  id                  | status | failure_code 
--------------------------------------+--------+--------------
 26cf0b06-0cf6-4695-9494-aa6d145cc067 | queued | 
(1 row)

INSERT 0 1
RESET

================ G. THE CONSTRAINTS, attacked as service_role ================
          (the role that CAN write them -- so a refusal here is the constraint
           and never a privilege)
SET
--- G0. first put the row back to sent with an empty code, so G1 below tests the
        STATUS constraint and not the code one. F5 left it failed/refused, and
        from there any status change trips invitations_failure_code_allowed first,
        which would have proved a refusal but not the one G1 claims. ---
                  id                  | status | failure_code 
--------------------------------------+--------+--------------
 dddddddd-0000-4000-8000-000000000001 | sent   | 
(1 row)

UPDATE 1
--- G1. a status outside the three -- expect refused by invitations_status_allowed ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:223: ERROR:  new row for relation "invitations" violates check constraint "invitations_status_allowed"
DETAIL:  Failing row contains (dddddddd-0000-4000-8000-000000000001, aaaaaaaa-0000-4000-8000-000000000001, dave@example.invalid, aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, 11111111-1111-1111-1111-111111111111, 2026-10-06 11:07:23.597859+01, 2026-10-13 11:07:23.597859+01, null, delivered, ).
--- G2. status failed with an empty code -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:227: ERROR:  new row for relation "invitations" violates check constraint "invitations_failure_code_allowed"
DETAIL:  Failing row contains (dddddddd-0000-4000-8000-000000000001, aaaaaaaa-0000-4000-8000-000000000001, dave@example.invalid, aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, 11111111-1111-1111-1111-111111111111, 2026-10-06 11:07:23.597859+01, 2026-10-13 11:07:23.597859+01, null, failed, ).
--- G3. status failed with a code that is not on the list -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:231: ERROR:  new row for relation "invitations" violates check constraint "invitations_failure_code_allowed"
DETAIL:  Failing row contains (dddddddd-0000-4000-8000-000000000001, aaaaaaaa-0000-4000-8000-000000000001, dave@example.invalid, aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, 11111111-1111-1111-1111-111111111111, 2026-10-06 11:07:23.597859+01, 2026-10-13 11:07:23.597859+01, null, failed, mailbox_full).
--- G4. FREE TEXT as the code, which docs/plan.md forbids -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:236: ERROR:  new row for relation "invitations" violates check constraint "invitations_failure_code_allowed"
DETAIL:  Failing row contains (dddddddd-0000-4000-8000-000000000001, aaaaaaaa-0000-4000-8000-000000000001, dave@example.invalid, aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, 11111111-1111-1111-1111-111111111111, 2026-10-06 11:07:23.597859+01, 2026-10-13 11:07:23.597859+01, null, failed, Resend said 422: dave@example.invalid is not a valid address).
--- G5. a code while the status is sent -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:240: ERROR:  new row for relation "invitations" violates check constraint "invitations_failure_code_allowed"
DETAIL:  Failing row contains (dddddddd-0000-4000-8000-000000000002, aaaaaaaa-0000-4000-8000-000000000001, erin@example.invalid, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, 11111111-1111-1111-1111-111111111111, 2026-10-06 11:07:23.597859+01, 2026-10-13 11:07:23.597859+01, 2026-10-06 11:12:15.134128+01, sent, refused).
--- G6. a code while the status is queued -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:244: ERROR:  new row for relation "invitations" violates check constraint "invitations_failure_code_allowed"
DETAIL:  Failing row contains (dddddddd-0000-4000-8000-000000000002, aaaaaaaa-0000-4000-8000-000000000001, erin@example.invalid, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, 11111111-1111-1111-1111-111111111111, 2026-10-06 11:07:23.597859+01, 2026-10-13 11:07:23.597859+01, 2026-10-06 11:12:15.134128+01, queued, refused).
--- G7. null in either column -- expect refused ---
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:247: ERROR:  null value in column "status" of relation "invitations" violates not-null constraint
DETAIL:  Failing row contains (dddddddd-0000-4000-8000-000000000002, aaaaaaaa-0000-4000-8000-000000000001, erin@example.invalid, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, 11111111-1111-1111-1111-111111111111, 2026-10-06 11:07:23.597859+01, 2026-10-13 11:07:23.597859+01, 2026-10-06 11:12:15.134128+01, null, ).
psql:C:/Users/rajdh/AppData/Local/Temp/claude/C--Users-rajdh/5d686947-f157-47a9-9c71-cd0d336fbb0d/scratchpad/02_attack.sql:248: ERROR:  null value in column "failure_code" of relation "invitations" violates not-null constraint
DETAIL:  Failing row contains (dddddddd-0000-4000-8000-000000000002, aaaaaaaa-0000-4000-8000-000000000001, erin@example.invalid, bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, 11111111-1111-1111-1111-111111111111, 2026-10-06 11:07:23.597859+01, 2026-10-13 11:07:23.597859+01, 2026-10-06 11:12:15.134128+01, sent, null).
--- G8. each of the four codes in turn -- expect all four allowed ---
  failure_code  
----------------
 not_configured
(1 row)

UPDATE 1
 failure_code 
--------------
 unreachable
(1 row)

UPDATE 1
 failure_code 
--------------
 refused
(1 row)

UPDATE 1
 failure_code 
--------------
 unconfirmed
(1 row)

UPDATE 1
--- G9. back to sent clears the code -- expect allowed ---
                  id                  | status | failure_code 
--------------------------------------+--------+--------------
 dddddddd-0000-4000-8000-000000000002 | sent   | 
(1 row)

UPDATE 1
RESET

================ H. THE OWNER-ONLY READ STILL SHOWS THE TRUTH ================
SET
              set_config              
--------------------------------------
 11111111-1111-1111-1111-111111111111
(1 row)

--- H1. Alice reads the status the server function just wrote ---
                  id                  | status | failure_code 
--------------------------------------+--------+--------------
 26cf0b06-0cf6-4695-9494-aa6d145cc067 | queued | 
 dddddddd-0000-4000-8000-000000000001 | sent   | 
 dddddddd-0000-4000-8000-000000000002 | sent   | 
(3 rows)

--- H1b. and the EXACT query the My teams page sends today
         (web/src/app/teams/page.tsx: the four columns it names, and its two
          filters) still returns its rows unchanged ---
                  id                  |               team_id                |         email         |          expires_at           
--------------------------------------+--------------------------------------+-----------------------+-------------------------------
 dddddddd-0000-4000-8000-000000000001 | aaaaaaaa-0000-4000-8000-000000000001 | dave@example.invalid  | 2026-10-13 11:07:23.597859+01
 26cf0b06-0cf6-4695-9494-aa6d145cc067 | aaaaaaaa-0000-4000-8000-000000000001 | heidi@example.invalid | 2026-10-13 11:12:15.137205+01
(2 rows)

RESET

--- H2. and Carol, a member of that same team, still reads none of it ---
SET
              set_config              
--------------------------------------
 33333333-3333-3333-3333-333333333333
(1 row)

 rows_carol_sees 
-----------------
               0
(1 row)

RESET
```

### Reading the attack

| section | caller | read the two columns | set on insert | change |
|---|---|---|---|---|
| B | signed out (`anon`) | 0 rows | refused — `permission denied for table invitations` | refused — same |
| C | Bob, an outsider | 0 rows | refused — same | refused — same |
| D | Carol, a member of the team | 0 rows (D1) | refused — same | refused — same, **including on her own team's invitation, which she can read** (D5, D6) |
| E | Alice, the team's owner | **2 rows, as required** (E1) | refused — same (E3, E4) | refused — same (E5, E6, E7) |
| F | `service_role` | yes | **allowed** (F6) | **allowed** (F4, F5) |

Four things in that table are worth saying out loud:

- **D2 is the control.** Carol reads 1 row from the team she *owns*, which proves D1's "0 rows" is a
  refusal and not a broken query. Every "cannot" in this file has a matching "can" that found data.
- **D5 and D6 are the sharp case.** Carol can *read* her own team's invitation and still cannot
  change its status. Read and write are decided separately, and that is the point.
- **E8 is the contrast that shows nothing was over-narrowed.** Alice updating `email` — a column she
  still holds the privilege for — returns `UPDATE 0`: refused by the *policy*, exactly as it was
  before this migration. The two new columns are refused earlier, by the *privilege*. Both are
  refusals; they come from different layers, and E8 proves this migration did not move the old one.
- **E9 shows the old refusal is still the old refusal.** A plain insert naming no status still fails
  with `new row violates row-level security policy for table "invitations"` — the message the app
  would have got yesterday.

### The constraints (section G)

| case | attempted | result |
|---|---|---|
| G1 | `status = 'delivered'` | refused — `invitations_status_allowed` |
| G2 | `failed` with an empty code | refused — `invitations_failure_code_allowed` |
| G3 | `failed` with `mailbox_full`, a code not on the list | refused — same |
| G4 | **free text** as the code (`Resend said 422: …`) | refused — same |
| G5 | a code while the status is `sent` | refused — same |
| G6 | a code while the status is `queued` | refused — same |
| G7 | `null` in either column | refused — not-null |
| G8 | each of the four codes in turn | **all four allowed** |
| G9 | back to `sent`, clearing the code | allowed |

G4 is the one `docs/plan.md` asks for by name: "never the email service's full reply, which can quote
the address, the subject and the message". The database refuses it, so no later code change can let
one through by accident.

G0 exists because of a mistake worth recording. The first run had no G0, and G1 reported
`invitations_failure_code_allowed` rather than `invitations_status_allowed` — F5 had left the row
`failed`/`refused`, and from there *any* status change trips the code constraint first. The test
showed a refusal, but not the one it claimed. G0 puts the row back to `sent` with an empty code so G1
tests what it says it tests. The test was made stricter, not looser.

---

## 7. Do `invite-member` and `accept-invite` still work against the migrated schema?

**Their existing tests cannot reach this, and here is which is which.**

- **`supabase/functions/_tests/suspension_test.ts` runs, and passes, and does not touch a database.**
  Run exactly as `.github/workflows/ci.yml` runs it:

  ```
  deno test --no-lock --allow-env \
    --config supabase/functions/create-team/deno.json \
    supabase/functions/_tests/suspension_test.ts
  ```
  ```text
  ok | 40 passed | 0 failed (48ms)
  ```

  40 is the floor CI expects (`EXPECTED_FUNCTION_TESTS: "40"`). But these tests cover
  `checkSuspension` and the refusal bodies with a hand-supplied read — **no schema, no connection**.
  They prove this migration broke nothing in that code; they prove nothing about the schema.

- **`web/tests/access-rules.test.mjs` is the one that would settle it, and it could not be run —
  unverified, and for two reasons.** It runs against **staging** (`web/tests/staging.mjs` requires
  `STAGING_SUPABASE_URL` and four other settings, and refuses to start without them), and this
  migration **is not applied to staging** — rule 19 says the owner applies migrations, not the
  assistant. Running it now would test the unmigrated schema and prove nothing either way.

  **How to settle it properly:** after the owner applies this migration to staging, run
  `npm test` in `web/` with the five staging settings present. That exercises the real
  `invite-member` against the real migrated schema.

  **That happened — see section 9d.** The suite ran against migrated staging and passed 25, but the
  invite answer was not in its output, so it did not by itself settle the one thing this bullet wanted
  settled.

  **And then that was settled too — section 9e.** The owner sent a real invitation through the app to
  a fresh address on staging, and the coach read the row: `queued`, empty code. The real
  `invite-member`, against the real migrated schema. **This bullet is answered.**

**So the proof here is sections F1–F3 of the attack**, which run the exact statements both functions
issue, as the role they connect with, against the migrated schema:

| from | the statement | result against the migrated schema |
|---|---|---|
| `invite-member`:688 | `insert into invitations (team_id, email, token_hash, invited_by)` — four columns, no status | **works**, and the new row comes back `queued` with an empty code |
| `accept-invite`:413 | `update invitations set accepted_at = now() where id = … and accepted_at is null` | **works**, `UPDATE 1` |
| `invite-member`:756 | `delete from invitations where id = …` | **works**, `DELETE 1` |

F1's result is the one that matters most for "the current function must keep working unchanged": the
function names four columns and never mentions `status`, and the row it creates is `queued` because
of the column default. **No change to the function is needed for this migration to be safe**, which
is what "migration only" has to mean.

Two further reads, from the same run:

- **H1b runs the exact query the My teams screen sends today** — the four columns
  `web/src/app/teams/page.tsx`:153 names, with its `accepted_at is null` and `expires_at > now()`
  filters — and it returns its rows unchanged. The screen selects explicit columns and never `select
  *`, so the two new columns do not appear on it and no screen code needs touching.
- **H2** confirms Carol, a member of that team, still reads none of it after all of the above.

---

## 8. What this does not prove

Rule 8, in full:

- **Unverified — staging.** Nothing here was run against staging. The owner has not applied this
  migration, and the assistant did not ask them to during this session.
- **Unverified — production.** Likewise, and production's PostgreSQL version remains unread.
- **Unverified — the real project's grants.** The sandbox's `alter default privileges ... grant all`
  is *wider* than Supabase's documented default, chosen so the revoke has more to remove, not less.
  What the staging and production projects actually grant on `public.invitations` has not been read
  back from either. The owner-runs-query pattern would settle it:
  `select grantee, privilege_type from information_schema.table_privileges where table_schema='public' and table_name='invitations';`
- **Unverified — PostgREST's behaviour.** Everything above is Postgres answering `psql`. How
  PostgREST reports a column-privilege refusal to a browser — the status code and the body — was not
  observed, because no PostgREST was running. It matters to the *next* issue, which draws a screen,
  not to this one.
- **17.10, not 17.6.** The sandbox is a different patch release from staging. Nothing used here is
  version-specific, but it was not run on 17.6.

Four of these five are answered for staging in section 9, which was added afterwards. Read them
together; this list is not revised, because it was accurate when written.

---

## 9. Staging, 6 October 2026 — as reported

**Who saw what.** Everything in this section is the **owner's** and the **coach's** report, recorded
by the assistant in a later session. **The assistant ran none of these commands, saw none of their
raw output, and used no MCP connector and no browser tool for any of it** — the staging reads below
are the coach's, through the coach's staging read-only connector, which is not a tool the assistant
has or used. Rule 8 and rule 15 apply: what follows is a faithful record of a report, not an
observation of the assistant's own, and the numbers are the ones reported, not ones counted here.

### 9a. The apply — the owner, on staging

- The owner **checked `supabase/.temp/project-ref`** before pushing, so the push went to the project
  they had confirmed was linked. The report does not quote the value, and this file does not name a
  project reference nobody here read.
- **`supabase db push --dry-run`** listed **one** migration:
  `20261006095847_invitation_status.sql`. Nothing else was pending, which is what the dry run is for:
  it proves the push applies this and only this.
- **`supabase db push`** against **staging**, Supabase CLI **2.75.0**, reported output:

  ```text
  Finished supabase db push.
  ```

That is the whole of the reported output for the push. Rule 19 unchanged: `db push` is the owner's
command, not the assistant's, and the guard refuses every `db push` except `--local`.

### 9b. The read-back — the coach, staging read-only connector, after the push

| what was read | reported result |
|---|---|
| migrations recorded | **8**, newest **`20261006095847`** |
| `status` | default **`'queued'`** |
| `failure_code` | default **`''`** |
| the two check constraints | **both present** |
| existing invitations | **all 5** are `status` **`sent`** with an **empty** code |
| `anon`, `authenticated` — the two new columns | **no `INSERT` and no `UPDATE`** on `status` or `failure_code` |
| `anon`, `authenticated` — table level | **no table-level `INSERT` and no table-level `UPDATE`** |
| `anon`, `authenticated` — reading | **still have `SELECT`** |
| `service_role` | **all** |
| policies in `public` | **16** |

Three of those lines are the ones worth naming, because they are the ones the sandbox could only
argue for:

- **The grants landed on the real project, not just on a stand-in.** Section 8 listed "unverified —
  the real project's grants" precisely because the sandbox's `alter default privileges ... grant all`
  is wider than Supabase's default; the sandbox could not say what staging actually held. The coach's
  read says staging's `anon` and `authenticated` now hold **no table-level `INSERT` or `UPDATE`** and
  **nothing on either new column**, while **`SELECT` is untouched** — which is the shape section 5
  intended, read off the real project. **This answers the staging half of that unverified item. The
  production half is still unverified**, and section 9f says so.
- **8 migrations, newest `20261006095847`** — the migration is recorded on staging, and it is the
  newest, so nothing was applied after it.
- **5 rows, not 3.** The sandbox had three invitations; staging has five. Different databases with
  different data, not a disagreement. The backfill's known limitation applies to those five exactly as
  the pull request states it: a row whose email never went is now labelled `sent`, and no query could
  have separated it.

**16 policies in `public` is recorded as reported and is not interpreted here**: this migration adds
and drops no policy, and the assistant has not counted `public`'s policies in this session against any
earlier figure, so it has nothing to compare 16 with. Taking it as "unchanged" would be a guess.

### 9c. A second sandbox — the coach, PostgreSQL 16

The coach applied the migration in their **own** sandbox, on **PostgreSQL 16**, after the seven
earlier migrations, and attacked it as **owner, member, outsider, `anon` and `service_role`.**
**The results are in the coach's comment on pull request #165**, and are not copied here, because a
table retyped from somebody else's output is a table nobody can check against the original.

Why it is worth a line of its own: section 6's run was PostgreSQL **17.10**, and section 8 records
that staging is **17.6** and that nothing was run on it. The coach's run is a **different major
version — 16 —** reaching the same verdict with an independently written seed and attack. Two
different major versions and two different sandboxes is a stronger statement than one, and neither of
them is staging's 17.6.

### 9d. The web suite against migrated staging — the owner, on this branch

`npm --prefix web test`, run locally by the owner against **migrated staging**, on the **pull request
branch**:

- **25 passed, 0 failed, 0 skipped.**
- **Three sign-outs returned HTTP 204 with `scope=local`.**

This is the check sections 7 and 8 said could not be run and named as the way to settle it: that suite
needs the five staging settings and the migrated schema, and now had both. **It ran, and it passed.**

**And here is what it still does not show, which matters more than the 25.** Section 7's whole point
was F1 — that `invite-member`'s existing four-column insert still works against the migrated table and
leaves the new row `queued`. **This run does not demonstrate that.** **Alice's invite answer was not in
the pasted output**, and with her `+ci-invite` invitation **still pending**, the expected answer is
**409** — the function refusing a duplicate before it ever reaches an insert. So:

> ~~**Unverified — the current `invite-member` creating a row in the migrated table.** No run has
> shown it. Section 7's F1 is the only evidence for it, and F1 is `psql` issuing the function's
> statement in a sandbox, not the function itself against staging.~~
>
> **SETTLED ON STAGING on 6 October 2026 — see section 9e.** The owner sent a real invitation through
> the app, and the coach read the row it created. It is the deployed function, against the migrated
> table, and the row reads `queued` with an empty code.

**How it was settled** — not the route this paragraph predicted, and the difference is worth keeping.
It suggested clearing Alice's pending `+ci-invite` invitation and re-running the suite. Instead the
owner invited a **different** address, which needed nothing cleared: a fresh address is not a duplicate,
so the function reaches its insert without the 409 ever arising. Section 9e is that run.

### 9e. A real invitation through the app, on staging — the owner, then the coach

**This is the section that settles F1 on staging.** Same attribution as the rest of section 9: the
owner's and the coach's report, recorded by the assistant, who ran none of it, saw no screen and used
no connector and no browser.

**The owner, in the app.** Local app on `localhost:3000` pointed at **staging**, signed in as
**Alice**. She invited the **`+statuscheck`** address of the **test mailbox** to her team. The screen
reported:

> Invitation created.

and the list then showed **3 of 20 invitations waiting**, the new one **expiring 13 October 2026** —
seven days, which is `docs/plan.md`'s rule and the existing column default, untouched by this
migration.

**The coach, through the staging read-only connector, afterwards:**

| what was read | reported result |
|---|---|
| invitations on staging | **6** |
| the new `+statuscheck` row | created **2026-10-06 12:57:32 UTC**, `status` **`queued`**, `failure_code` **empty**, **not accepted** |
| the five earlier rows | `status` **`sent`** |

**What this settles, precisely.** F1's claim was that `invite-member`'s **unchanged** four-column
insert still works against the migrated table and leaves the new row `queued` with an empty code. This
is that claim, performed by **the deployed function** rather than by `psql` imitating it, against **the
real migrated table** rather than a sandbox clone, and read back from the catalogue rather than
asserted. The row exists, and it is `queued` with an empty code. **"Migration only" holds: no function
and no screen needed changing for this migration to be safe.**

Four smaller things the same run shows:

- **6 rows, and the earlier 5 unchanged.** Section 9b read 5, all `sent`. One invitation was added and
  the other five still read `sent`, so the insert added a row and disturbed nothing.
- **The column default did the work, not any code.** Nothing in the app mentions `status`; the row is
  `queued` because the migration says so.
- **The screen is untouched by the new columns**, as section 7's H1b argued: it drew the new invitation
  in its pending list, with its count and its expiry, and nobody changed a line of it.
- **`queued` is the correct and final state for now, not a stuck job.** The row stays `queued` because
  **the deployed function does not yet write `status`** — writing `sent` or `failed` is the next issue,
  which this pull request deliberately does not contain. It **expires on 13 October 2026**, so it does
  not sit there for ever.

**Not checked — whether the email arrived in the test inbox.** Nobody looked, so nothing here says it
did. This does not weaken what the section settles: the question was whether the function creates a row
in the migrated table, and the row is the answer. It does mean the one thing a `queued` status cannot
tell you is still untold — and that is exactly the gap the **next** issue closes, by making the function
record `sent` or `failed` after the send. **To check it:** open the test mailbox's `+statuscheck`
inbox, or read the Resend delivery log for that address.

### 9f. Not yet done — production

**Production is untouched and unread.** The migration reaches production **through the pipeline, after
this pull request is merged** — rule 19 forbids the assistant running a migration, a `db push` or a
deploy against production under any circumstances, and the merge is the owner's.

So the staging half of section 8's grants item is answered and **the production half is not**:
production's grants on `public.invitations`, and production's PostgreSQL version, remain unread. The
owner-runs-query in section 8 is still the way to read them, after the merge has carried the migration
there.
