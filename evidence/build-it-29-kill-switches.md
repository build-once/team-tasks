# Evidence: Build it 29 — the four kill switches

Result: PASS on a local PostgreSQL sandbox, **AND NOW PASS ON STAGING** — the owner applied the
migration there and the `ai_suggestions` switch was flipped off and on again with the sentence seen
on the screen both ways round. `evidence/incident-plan.md` is that run.
**TWO THINGS THIS LINE GOT WRONG, BOTH CORRECTED 2026-10-15.** It first said the migration was
"applied nowhere"; it then said it reached production and **"has still not been applied to
staging"**, which was also wrong. What is true, from the owner: **staging has both migrations** —
`20261015120000_feature_switches.sql` pushed before PR #316 was merged, and
`20261015160000_feature_on_for_anon.sql` before #324 — each reporting *"Finished supabase db
push."*; and **production has both** through the pipeline (run #84, "Apply migrations to
production: success", and #324's run). **The assistant asserted the staging half twice without
being told it, and was wrong both times.**
Date: 2026-10-15
How checked: a throwaway PostgreSQL 17.10 cluster built by the assistant in its scratchpad, all
eighteen migrations applied in order, then every rule attacked as the signed-in person, as
`service_role` and as the database owner. Plus 37 Deno tests over the shared gate, 497 checks in
`scripts/screen-state-check.mjs`, and `next build`.
Checked by: Claude Code (the assistant), on its own machine. **Nothing in this file touched
staging or production**: rule 19 refuses `db push` to the assistant everywhere, and rule 10
refuses production entirely.

---

## 1. What is being established, and what is not

| | |
|---|---|
| **Established** | the rules work **against PostgreSQL**: the table is unreachable by every app role, `feature_on()` fails closed, the two restrictive policies stop an upload and a listing, and the switch is reversible |
| **NOT established** | that any of it works **on Supabase**. The `storage` schema here is a stand-in the assistant wrote; the migration is applied to no project; no Edge Function is deployed; no screen has been opened |

**The one thing a sandbox can never settle:** whether the role `supabase db push` connects as may
**create a policy on `storage.objects`**. Here `postgres` is a superuser and owns everything, so
the answer is yes for the wrong reason — demonstrated below, where a probe that used
`create policy on storage.objects` as its deliberate failure **succeeded** and measured nothing.

**THE MIGRATION TRIED TO ASK THAT QUESTION AND THE QUESTION WAS WRONG. Section 11a is the
correction**, after the owner's `db push` to staging on 15 October 2026 was refused by this
file's own pre-check for an operation that demonstrably works.

---

## 2. The sandbox

PostgreSQL **17.10**, created with `initdb`, listening on `127.0.0.1` port **55437** only, trust
authentication, deleted at the end of the session. **Timezone `Pacific/Auckland`** on purpose
(UTC+13), so that anything depending on a local date rather than a UTC one would show rather
than hide — the lesson from `evidence/build-it-22-usage-counts.md`.

The stand-in is the one `evidence/build-it-23-attachments-bucket.md` documents, unchanged: a
four-line `auth` schema whose `auth.uid()` reads a session setting, and a `storage` schema whose
**column names are Supabase's and whose every type is a choice**. `service_role` has `bypassrls`,
because Supabase's does — which is what makes section 8e below a demonstrated fact rather than an
argument.

**And the control that stops the privilege results being vacuous**, the same one every evidence
file here uses: Supabase's OLD default privileges are applied before the migrations, so every
`revoke` has something to take away.

```
================================================================
A. CONTROL -- the old default privileges in the stand-in really took
(without this every "revoked" result below would be vacuous)
================================================================
 authenticated_can_select_tasks | anon_can_run_is_active
--------------------------------+------------------------
 t                              | f
(1 row)
```

All eighteen migrations applied, exit 0 each, the new one last. **Re-run on a freshly dropped and
rebuilt database after the pre-check was deleted** (section 11a), which is why there is no `DO`
line at the top any more:

```
$ psql ... -f supabase/migrations/20261015120000_feature_switches.sql
CREATE TABLE
COMMENT ×4
ALTER TABLE ×2
REVOKE ×4
CREATE FUNCTION
COMMENT
CREATE TRIGGER
INSERT 0 4
CREATE FUNCTION
COMMENT
REVOKE ×2
GRANT ×2
CREATE POLICY ×2
[exit 0]

ALL MIGRATIONS APPLIED.
```

---

## 3. The four switches, seeded, and what `feature_on()` says about words it has never heard

```
    feature     | enabled | has_a_timestamp
----------------+---------+-----------------
 ai_suggestions | t       | t
 attachments    | t       | t
 invitations    | t       | t
 payments       | t       | t
(4 rows)

 ai | invitations | attachments | payments | typo_at_a_call_site | never_heard_of_it | a_null_feature
----+-------------+-------------+----------+---------------------+-------------------+----------------
 t  | t           | t           | t        | f                   | f                 | f
(1 row)
```

**The last three columns are the design.** A misspelling at a call site, a word nobody has heard
of, and a null all answer **false** — switched off. That is the safe direction: a kill switch
whose typo fails *open* is a kill switch that does nothing on the day it is flipped.

---

## 4. Who may reach the table: nobody. Who may run the reader: two.

```
    rolname    | sel | ins | upd | del | may_read_a_switch
---------------+-----+-----+-----+-----+-------------------
 anon          | f   | f   | f   | f   | f
 authenticated | f   | f   | f   | f   | t
 service_role  | f   | f   | f   | f   | t
(3 rows)
```

And attacked rather than only read off `has_table_privilege` — four transactions, each its own
`begin`/`rollback` so the first error cannot abort the rest:

```
-- as authenticated: select
ERROR:  permission denied for table feature_switches
-- as authenticated: update
ERROR:  permission denied for table feature_switches
-- as service_role: update
ERROR:  permission denied for table feature_switches
-- as service_role: select
ERROR:  permission denied for table feature_switches
```

**`service_role` is the one that matters.** A server function holding the secret key cannot read a
switch directly and **cannot switch a feature back on** — which is the whole point of the table:
the owner's only lever has to be a lever nothing else can reach. The functions ask through
`feature_on()`, which runs as its owner.

---

## 5. Switched on: Alice attaches a file and sees it

One account, one personal task, one file, as Alice:

```
INSERT 0 1
 attachments_alice_can_see
---------------------------
                         1
(1 row)
COMMIT
```

## 6. The owner flips it off — one UPDATE, as in the Table Editor

```
UPDATE 1
   feature   | enabled | timestamp_moved
-------------+---------+-----------------
 attachments | f       | t
(1 row)
```

## 7. Switched off: no new link, no new file — and the thing the design got wrong

**7a. The file Alice could see a moment ago is no longer selectable**, which is what stops a
signed link being made for it:

```
 attachments_alice_can_see_now
-------------------------------
                             0
(1 row)
```

**7b. A new upload is refused by the restrictive policy, by name:**

```
ERROR:  new row violates row-level security policy
        "Attachments: no new file while the switch is off" for table "objects"
```

**7c. AND THIS IS THE ONE THAT CHANGED THE DESIGN. A targeted delete removes NOTHING:**

```
delete from storage.objects
where bucket_id = 'attachments' and name = '<task id>/photo.jpg';

DELETE 0
```

**No error — `DELETE 0`.** The statement's own `WHERE` clause cannot see the row, because the
restrictive SELECT policy hides it, so it matches none. Which means **a task that still has
files cannot be deleted either**, since `tasks_refuse_delete_with_files` refuses a task while any
object remains under its prefix.

**The migration's comment claimed the opposite before this run** — it said deletes were "left
alone" so that a task with files stayed deletable. That was reasoning, and the reasoning was
wrong. The comment now says what was measured, `docs/plan.md` records it as a cost, and
`docs/incident-plan.md` says it beside the switch where somebody is about to flip it.

**7d. Another bucket is untouched by this app's switch** — which is what
`is distinct from` rather than `<>` buys, because a restrictive policy whose expression is
UNKNOWN refuses the row:

```
 other_app_objects_still_visible
---------------------------------
                               1
(1 row)
INSERT 0 1
```

**7e. THE HOLE, STATED: the service-role key bypasses row-level security**, so a restore still
works with the switch off. Nothing in this app uploads that way; this is the same sharp edge
section 5 of the attachments migration already documents about its own policies.

```
-- as service_role, with attachments switched OFF
INSERT 0 1
```

**7f. And the operator path, which is what makes 7c acceptable.** The dashboard connects as the
owner, and row-level security does not apply to it, so one unwanted file can always be removed:

```
DELETE 1
```

---

## 8. Back on again — a switch, not a cliff

```
UPDATE 1
 attachments_alice_can_see_again
---------------------------------
                               1
(1 row)
INSERT 0 1
```

## 9. A missing row means OFF, and a fifth switch cannot be invented

```
-- delete the row, then ask
 attachments_with_no_row
-------------------------
 f
(1 row)

-- insert a fifth feature word
ERROR:  new row for relation "feature_switches" violates check constraint
        "feature_switches_feature_allowed"
DETAIL:  Failing row contains (bananas, t, 2026-10-15 23:17:04.374874+13).
```

**The first of those is why the four rows are seeded in the same migration as the table**: a
database with the table and no rows would be a database with four features silently off.

## 10. `changed_at` moves only when the switch moves

```
 unchanged_by_a_no_op_update
-----------------------------
 t
(1 row)

 a_supplied_timestamp_is_discarded
-----------------------------------
 t
(1 row)
```

A caller supplying `changed_at = '2001-01-01'` is overwritten rather than refused, which is
deliberate: the caller here is a person in the Table Editor, which sends the whole row back when
one checkbox changes, and a trigger that refused would refuse the only way this table is ever
meant to be used.

---

## 11. CAN THIS FAIL? Yes — and this is the section that makes the rest worth reading

With the switch off, the two restrictive policies dropped, and nothing else changed:

```
update feature_switches set enabled = false where feature = 'attachments';
drop policy "Attachments: no new link while the switch is off" on storage.objects;
drop policy "Attachments: no new file while the switch is off" on storage.objects;

-- as Alice
INSERT 0 1
 visible_with_the_policies_gone
--------------------------------
                              2
(1 row)
```

**The upload goes straight through and both files are visible**, with the switch still reading
`false`. So sections 7a and 7b are the policies doing the work rather than something that was
already true.

## 11a. The pre-check that was wrong, and what replaced it — 15 October 2026

**The owner's `supabase db push` to staging (`ghskxrhqlhvrhpnivqbd`) was refused by this file's own
section 0:**

```
ERROR: Build it 29 creates two restrictive policies on storage.objects, which needs
ownership of that table, and the role applying it (postgres) does not have it.
NOTHING IN THIS MIGRATION HAS BEEN APPLIED.  (SQLSTATE P0001)
```

**And it was wrong**, because the same role created **three** policies on that same table on that
same project in October — `20261008191804_attachments_bucket.sql`, read back through the staging
connector as three policies, each `to authenticated`.

### What the expression was actually testing

A table owned by another role, with two members of it:

```
      rolname      | usage_priv | member_priv | rolinherit
-------------------+------------+-------------+------------
 inheriting_member | t          | t           | t
 noinherit_member  | f          | t           | f
 postgres          | t          | t           | t

-- the INHERITING member:        CREATE POLICY
-- the NON-INHERITING member:    ERROR:  must be owner of table objects
```

So `pg_has_role(…, 'USAGE')` **does** track what `CREATE POLICY` needs for an ordinary member, and
`'MEMBER'` would have been the wrong one to pick. **The test was not nonsense — which is exactly
why it was deleted rather than corrected.** It asked a reasonable question and got an answer that
does not predict the outcome on Supabase.

**And I do not know what does.** Ownership is not a grantable privilege, so there is no
`has_table_privilege` to ask instead, and the next guess would be a Supabase-internal role name
this project has never read. What is established is only this: `postgres` created three policies on
`storage.objects` on staging and on production in October, and on 15 October
`pg_has_role(current_user, <that table's owner>, 'USAGE')` answered **false** for `postgres` on
staging. Both facts are the owner's; nobody writing this opened a connector.

**A pre-check that refuses a working operation is worse than no pre-check**, which is the whole of
the decision. `20261008191804_attachments_bucket.sql` had already taken the same view of the same
question: "if it does, it fails LOUDLY, on the first statement, having changed nothing."

### And "a failure applies nothing" is measured, not assumed

It is the only thing holding the file together once the pre-check is gone, so it is checked twice.

**Read off the CLI's own source** (`supabase/cli`, `apps/cli-go/pkg/migration/file.go`,
`MigrationFile.ExecBatch`, read 15 October 2026): every statement is queued into one
`pgconn.Batch` and sent as a pipeline — **no `begin` and no `commit` in that path**. PostgreSQL for
that mode: *"If the pipeline used an implicit transaction, then operations that have already
executed are rolled back and operations that were queued to follow the failed operation are
skipped entirely"* ([libpq pipeline
mode](https://www.postgresql.org/docs/17/libpq-pipeline-mode.html), read 15 October 2026).

**And measured, on the sandbox** — three statements in one message, the last failing:

```
--- three statements in ONE message, the last one failing
CREATE TABLE
CREATE TABLE
ERROR:  division by zero
[exit 1]

--- did either table survive?
 a | b
---+---
   |
(1 row)
```

**Neither table survived.** (The first attempt at this probe used
`create policy … on storage.objects` as its deliberate failure and it **succeeded**, because
`postgres` is a superuser here — so the probe measured nothing, and the failing statement was
changed to one that fails for everybody. It is the clearest illustration in this file of what the
sandbox cannot settle.)

**ONE CAVEAT, which is why this is a paragraph and not a sentence.** That same function **flushes
the batch** around six kinds of statement, each then run on its own: `create index`, `drop index`,
`reindex`, `vacuum`, `alter system`, `cluster`. A file containing one of those is applied in more
than one implicit transaction, and a later failure would leave the earlier part committed.
**This file contains none of the six** — checked by searching it — and the migration's own comment
says why it needs no index.

## 12. The policies, as Postgres holds them

```
                           polname                            | polpermissive | polcmd
--------------------------------------------------------------+---------------+--------
 Attachments: no new file while the switch is off             | f             | a
 Attachments: no new link while the switch is off             | f             | r
 Attachments: a team owner clears a former member's task      | t             | d
 Attachments: attach a file to a task you can see             | t             | a
 Attachments: delete a file you attached, or one on your task | t             | d
 Attachments: read a file on a task you can see               | t             | r
 SANDBOX ONLY: other-app is readable and writable             | t             | *
(7 rows)
```

`polpermissive = f` on exactly the two new ones, and **the four existing policies untouched** —
which is what makes this migration additive: a restrictive policy can only subtract, so nothing
in it could have widened what those four allow.

(The last row is the sandbox's own, created by the check script so that 7d has another bucket to
be indifferent about. No migration creates it.)

---

## 13. The other three layers, run in this session

```
$ deno test --no-lock --allow-env --allow-read=supabase/migrations,supabase/functions \
    --config supabase/functions/create-team/deno.json supabase/functions/_tests
ok | 334 passed | 0 failed (1s)

$ node scripts/screen-state-check.mjs
497 of 497 checks passed.

$ node scripts/check-workflows.mjs
Checked 6 workflow file(s), 28 job(s): 0 problem(s), 0 warning(s).

$ cd web && npm run build
✓ Compiled successfully
  ƒ /health                     <- the new route, server-rendered on demand
```

**And both of those were seen to fail.** `supabase/functions/_shared/switches.ts`'s AI sentence
was changed to "Suggestions are off." and:

```
$ node scripts/screen-state-check.mjs
496 of 497 checks passed.
1 FAILED:
  - ai_suggestions: the screens' sentence is the Edge Function's map entry

$ deno test ... supabase/functions/_tests/feature_switch_test.ts
FAILED | 36 passed | 1 failed
  the four sentences are the owner's words, and say nothing about plumbing
```

The sentence was then restored and both went green again. The Deno file also carries three
**can-this-fail** tests of its own — a gate that reads the switch with a truthy test, one that
treats an error as permission, and one that reads the switch *after* doing the work — each fed
the same assertions the real gate passes and each required to come out red.

---

## 14. What is NOT verified, which is most of what matters

**REWRITTEN 2026-10-15 WITH THE OWNER'S RESULTS. Five of this list's bullets were true when it was
written and are now wrong**, which is the thing this register exists to catch rather than carry.
What they said, and what is true:

| It said | What is true |
|---|---|
| "The migration is applied nowhere" | **both migrations are on staging and on production** — see the Result line |
| "No switch has been flipped on a real project" | **`ai_suggestions` was flipped off and on again on staging**, and the sentence was seen both ways round (`evidence/incident-plan.md`) |
| "No Edge Function is deployed" | **all five are on staging**, deployed by the owner before the run |
| "`_shared/switches.ts` … settled only by a deploy" | **settled: the bundler accepted it.** The deploy succeeded and the functions work, so `accept-invite` importing from `_shared` for the first time is no longer an open question |
| "No uptime monitor exists" | **one does** — Sentry, every minute on `<production>/health`, and it recorded a real outage (`evidence/uptime-alert-phone.md`) |

**What IS still unverified, which is the honest remainder:**

- **Three of the four switches have been flipped nowhere but a sandbox** — `invitations`,
  `attachments` and `payments`. So the two warnings in section 7 are measured on PostgreSQL and
  have not been met on a real project.
- **No switch has been flipped on PRODUCTION**, and nothing asks for one to be.
- **Three of the five screens have not been seen**: the attachments banner on My tasks, the plan
  panel on My teams, and the invitation page's sentence. **The two that have** are Suggest
  subtasks' switched-off sentence on staging, and the footer's Contact us link on the owner's
  iPhone, which opened the mail app.
- **No second monitor on an address that does not exist**, which the incident plan asks for as the
  cheap way to watch an alert arrive deliberately. A real outage did that job instead
  (`evidence/uptime-alert-phone.md` section 3), and the deliberate one is still worth doing.
- **The sandbox's `storage` schema is a stand-in**, so nothing here says what Supabase Storage's
  own API does with a refused insert.


## 15. The health check was broken by this very migration — 15 October 2026

**Added after the merge of PR #316, which is when it became visible.** Production's `/health`
answered **503 `error`** while the home page on the same deployment was fine:

```
$ curl -i https://<production>/health
HTTP/1.1 503 Service Unavailable
Cache-Control: no-store, max-age=0, must-revalidate
X-Matched-Path: /health

error
```

**Not a missing setting, and not an environment difference.** Run #84's "Apply migrations to
production" succeeded, so `feature_on()` is on production; both `NEXT_PUBLIC_` settings are
plainly present, because every other page works.

**The cause is section 2 of this migration meeting the route.** `20261015120000_feature_switches.sql`
revokes EXECUTE on `public.feature_on(text)` from `anon` **by name** — and `/health` is fetched by
a monitor with **no session**, which the publishable key makes `anon`. Measured on the sandbox,
before and after the one-line fix-forward `20261015160000_feature_on_for_anon.sql`:

```
BEFORE                                  AFTER
    rolname    | may_execute                rolname    | may_execute
---------------+-------------           ---------------+-------------
 anon          | f                       anon          | t
 authenticated | t                       authenticated | t
 service_role  | t                       service_role  | t

-- as anon:                             -- as anon:
ERROR:  permission denied for            feature_on
        function feature_on             ------------
                                         t
```

**And the table is still closed to everybody**, which is what makes the grant the small thing it
claims to be — re-read after the fix:

```
 anon_sel | auth_sel | svc_sel
----------+----------+---------
 f        | f        | f
```

**Two things this is a lesson about, both written down rather than fixed quietly:**

- **The route's own comment asserted the opposite and was written in the same change as the
  revoke.** It said the function is "granted to `authenticated` AND to no client role beyond that
  — so an anonymous caller here reaches it through the publishable key the same way every
  signed-out screen does", which contradicts itself in one sentence. The comment is corrected.
- **No check in this repository fetches `/health`** — `scripts/screen-state-check.mjs` reads the
  route's *source*, and `migrate-production.yml`'s smoke test fetches `PRODUCTION_SITE_URL`, the
  home page. So a fully green pull request said nothing whatever about the one address whose whole
  job is to answer, and the first thing to notice was the owner opening it in a browser.
