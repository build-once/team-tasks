# Evidence: Build it 25 part 2a — the 500-task cap and four input limits

Result: **PASS for everything a local PostgreSQL sandbox can decide, which this time is most of it.**
The migration applies on top of all eleven earlier ones, the cap refuses a single 600-row INSERT
entirely, and the four constraints bite and name themselves. **UNVERIFIED for everything that needs a
project**: it is applied nowhere, and the staging script has never been run.

Date: 2026-10-12
Issue: Build it 25 part 2a, from `docs/plan.md` → "A ceiling on how many tasks one person can hold"
(decision **C**, the owner's of 2026-10-11) and `docs/rate-limits.md` section 2 → "The proposals".
Branch read from: `main` at `8c6673e` ("Merge pull request #293"), printed with `git log` in this
session.
Checked by: the coding assistant.

**NOTHING WAS RUN AGAINST STAGING OR PRODUCTION. No MCP connector and no browser tool was used.** No
dashboard was opened, no project was deployed to, and `supabase db push` was not run — rule 19 refuses
it everywhere except `--local`, and there is no local Supabase here. Every command below ran on a
throwaway PostgreSQL cluster on the owner's own machine, created and destroyed in this session.

**WHAT IS NOT IN THIS CHANGE: decision B, the daily count of attachment uploads.** It is a trigger on
`storage.objects`, and whether the role that applies migrations may create one there cannot be
established locally. Section 6 is what the probe did establish about it; part 2b is where it is built.

---

## 1. The sandbox, and what it does and does not model

Two throwaway clusters, both **PostgreSQL 17.10**, both `UTF8`, both with `timezone =
'Pacific/Auckland'` so a UTC-day bug would be visible rather than indistinguishable. Ports 55432 and
55433, so neither touches the `postgresql-x64-17` service on 5432.

```
$ initdb -D <scratch>/pgdata2 -U postgres --auth=trust --encoding=UTF8
$ # port = 55433, listen_addresses = '127.0.0.1', timezone = 'Pacific/Auckland' appended to postgresql.conf
$ pg_ctl -D <scratch>/pgdata2 -l <scratch>/pg2.log start
2026-10-12 10:20:30.689 BST LOG:  starting PostgreSQL 17.10 on x86_64-windows, compiled by msvc-19.44.35226, 64-bit
2026-10-12 10:20:30.690 BST LOG:  listening on IPv4 address "127.0.0.1", port 55433
2026-10-12 10:20:30.799 BST LOG:  database system is ready to accept connections
```

**What the stand-in models, and every one of these matters or a result passes for the wrong reason:**

| | Why it is there |
|---|---|
| `anon`, `authenticated`, `service_role`, the last with **`bypassrls`** | What Supabase gives them. Without `bypassrls` nothing could show that the service-role key is not subject to the cap |
| `alter default privileges … grant all on tables` **and on functions** | Supabase grants these by default, so without them every `revoke` in the real migrations is a no-op and a privilege test proves nothing |
| `auth.users`, `auth.uid()` reading `request.jwt.claim.sub` | `auth.uid()` is **null** for a connection carrying no claim, which is exactly how an admin connection and the service-role key look |
| `storage.buckets`, `storage.objects` with Supabase's **column names** | The attachments migration needs them. The names are cited on Supabase's schema page; **every type is a choice** |

**The stand-in and the attack script are NOT committed**, which is this repository's existing practice
for a migration proof — `evidence/build-it-22-usage-counts.md` and
`evidence/build-it-23-attachments-bucket.md` both record runs against throwaway databases whose SQL went
with them. Both clusters were destroyed in the same session. **What makes this reproducible instead is
the recipe**: a stand-in holding the four things in the table above, then every file in
`supabase/migrations/` in name order, then the statements this file quotes. **Said plainly because the
alternative would read better: nobody can re-run exactly what produced the output below.** If that
becomes a problem rather than a preference, a committed stand-in is the fix, and
`scripts/backup/standin-store.mjs` is the shape this repository already uses for one.

**What it cannot model, and these are the limits of everything below:**

- **Whether the role that applies migrations may create a trigger on `storage.objects`.** Here
  `postgres` is a superuser and owns everything. This is decision B's one real risk.
- **The real column types of `storage.*`.** No Supabase page states one.
- **The Storage API's own limits** — the bucket's 5 MB and its six named types are enforced above
  PostgreSQL, so nothing inserted straight into the table exercises them.
- **PostgREST.** Everything here is `psql`. What an HTTP client sees of a refusal is the staging
  script's question, not this one's.

---

## 2. The migration applies, on top of all eleven

The stand-in, then every file in `supabase/migrations/` in name order, then nothing else. One
`psql -v ON_ERROR_STOP=1 -f` per file, exit code printed per file:

```
--- exit code per file ---
  0  10-standin-full.sql
  0  20260927182443_create_tasks.sql
  0  20260930101343_create_teams.sql
  0  20260930193813_create_invitations.sql
  0  20261002122203_team_rules.sql
  0  20261002133637_tasks_join_teams.sql
  0  20261002170244_tasks_drop_owner_only_rules.sql
  0  20261004114313_suspend_accounts.sql
  0  20261006095847_invitation_status.sql
  0  20261007204900_ai_suggestions_consent.sql
  0  20261008115900_usage_counts.sql
  0  20261008191804_attachments_bucket.sql
  0  20261012094500_task_cap_and_input_limits.sql

13 file(s) run; 13 with exit 0.
```

**Three things that run proves and a reading of the file could not:**

- **`ALTER POLICY` found the policy by its real name.** The name is 60 bytes — counted — and a policy
  name is cut at 63 with only a `NOTICE`, which `-q` hides. The attachments migration records a policy
  name being truncated exactly that way. **No `NOTICE` or `WARNING` appeared in the whole run.**
- **The four guards ran** and raised nothing, because the tables were empty — so the `do $$ … $$` blocks
  parse and execute rather than merely looking right.
- **The four `ALTER TABLE`s validated** against the existing rows there were.

---

## 3. The cap, and the one word that would make it decorative

**Review point (a), the owner's, 2026-10-12: "One multi-row insert must not get past the cap … Prove in
the probe that a single INSERT of 600 rows by one person, starting from 0, is refused or stops at 500,
and say which."**

**It is REFUSED. The whole statement fails and nothing is written.** Not "stops at 500".

Run as `authenticated` with Alice's claim set, against the real `public.tasks` and the real altered
policy:

| What | Result |
|---|---|
| CONTROL: one personal task and one team task | both land; Alice holds **2** |
| **600 rows in ONE `INSERT … select … generate_series(1, 600)`** | **`ERROR: new row violates row-level security policy for table "tasks"`**, and Alice still holds **2** |
| pre-filled to 499, then the 500th | **lands**; Alice holds **500** |
| the 501st | **refused, `sqlstate 42501`** |
| Bob inserts while Alice is at the cap | **allowed** — the cap is per person |

And a reduced table in the first cluster narrowed where the refusal comes from, because "refused" could
also have meant the policy refuses everything:

| Case | Result |
|---|---|
| 3 rows from 0 | 3 land |
| 400 in one INSERT from 0 | 400 land |
| 500 in one INSERT from 0 | 500 land |
| **501 in one INSERT from 0** | **REFUSED, nothing written** |
| **5 rows in one INSERT from 499** | **REFUSED — and 499 left behind, nothing partial** |

So the `with check` is evaluated **per row**, and a **volatile** function in it **does** see rows
inserted earlier in the same statement.

### 3.1 SEEN TO FAIL — the `stable` version, built on purpose

The owner's review point says: "If it is marked stable or the count is taken once per statement, the cap
is decorative." It is, and here it is:

| Case, with `tasks_may_add_stable()` in the policy | Result |
|---|---|
| 5 rows in one INSERT from 499 | **ALL FIVE LAND — 504** |
| 600 rows in one INSERT from 499 | **ALL 600 LAND — 1099** |

`volatile` is the default and is left unwritten, which is how plpgsql functions in this schema are
written — and the migration's comment now carries those two numbers, so the word is load-bearing on the
record rather than by accident.

### 3.2 At the cap, the rest of the app still works

Measured, because the cap's own sentence promises the second half of it:

```
UPDATE 1        at 500, Alice ticks a task
 ticked | 1
DELETE 1        at 500, Alice deletes one   -> she holds 499
INSERT 0 1      and one insert succeeds     -> she holds 500
```

So "deleting a task makes room" is something observed rather than assumed, and a person told that can
act on it.

And **Carol, a team member, is untouched**: she ticks the shared task, renames it, and her delete
removes no row — exactly as before this migration.

### 3.3 The screen's mechanism, which is decision 3 of the owner's five

```
 alice_at_500_may_add
----------------------
 f
 bob_at_0_may_add
------------------
 t
```

`public.tasks_may_add()` answers **false** for somebody at the cap and **true** for somebody with room.
That is what lets the next pull request **ask** rather than infer the cap from a bare `42501` — the
owner's instruction, and the reason #174's "one status standing for more than one meaning" does not
happen again here.

### 3.4 And the service-role key is NOT capped

```
NOTICE:  13: the service key inserted past 500 -- EXPECTED, and worth writing down
 alice_holds | 501
```

Row-level security is not applied to `service_role`, so the policy is never evaluated for it. **This is
expected and is written down rather than discovered**: it is the same shape as
`20261008191804_attachments_bucket.sql`'s own note that `attachments_may_add` "is not evaluated at all
for a caller using the service-role key". Nothing in this app inserts a task with that key, and the
restore in `scripts/backup/` is the one thing that puts `tasks` rows back — which **must** be able to
exceed the cap, or a restore of somebody's 500-task list would refuse itself.

---

## 4. The four constraints

Every one refuses, with `sqlstate 23514`, and **names itself** — which is what the screen PR and
anybody reading a log needs:

| Attempted | Result |
|---|---|
| a tab in a task title | refused, `tasks_title_no_control_chars` |
| a line feed in a task title | refused, `tasks_title_no_control_chars` |
| a tab in a nickname | refused, `profiles_display_name_no_control_chars` |
| an invited address of 321 characters | refused, `invitations_email_length` |
| an invited address of exactly 320 | **allowed** |
| a suspension reason of 501 characters | refused, `account_status_reason_length` |
| a reason of exactly 500 | **allowed** |
| **a NULL reason** | **allowed** — so the `reason is null or …` branch works and the check does not go *unknown* |
| a title of exactly 200 characters | **allowed** — `tasks_title_length` still bites at 201, `23514` |

That last row is the one worth having: a migration that added a constraint and quietly broke an existing
one would be worse than a migration that added nothing.

### 4.1 What `[[:cntrl:]]` actually refuses — review point (c)

Measured on this database, with every sample built by `chr()` so the probe file contains no control
character and the output prints only a codepoint and two booleans:

| Codepoint | What | `[[:cntrl:]]` | `[\x00-\x1F\x7F]` |
|---|---|---|---|
| U+0009 | tab | **refused** | refused |
| U+000A | line feed | **refused** | refused |
| U+000D | carriage return | **refused** | refused |
| U+001B | escape (C0) | **refused** | refused |
| U+001F | unit separator (C0 last) | **refused** | refused |
| U+007F | delete | **refused** | refused |
| **U+0080** | **C1 range, first** | **refused** | **allowed** |
| **U+0085** | **next line (C1)** | **refused** | **allowed** |
| **U+009F** | **C1 range, last** | **refused** | **allowed** |
| U+00A0 | no-break space | allowed | allowed |
| **U+200B** | **zero-width space** | **allowed** | allowed |
| **U+200E** | left-to-right mark | **allowed** | allowed |
| **U+202E** | **right-to-left override** | **allowed** | allowed |
| **U+2028** | **line separator** | **allowed** | allowed |
| **U+FEFF** | zero-width no-break space | **allowed** | allowed |
| U+1F600 | emoji | allowed | allowed |
| — | `hello world` | allowed | allowed |

**So the spelling changed because of a measurement.** `docs/rate-limits.md` proposed
`'[\x00-\x1F\x7F]'`; both compile and both work, and **the hex range misses the C1 range.** The two
differ by exactly U+0080–U+009F, so `[[:cntrl:]]` is strictly wider and is what the migration uses.

**And U+0000 is in neither list, because it cannot be in a `text` value at all:**

```
$ select chr(0);
ERROR:  null character not permitted
```

A comment claiming the constraint "refuses NUL" would have been a claim about something unreachable.

**What it does not catch is a known gap with its own issue**, not an oversight: U+200B, U+202E, U+2028
and U+FEFF all get through, and **U+2028 is a real line break a screen will render as one.** Widening to
them means naming codepoints rather than using a class, and refusing text somebody may legitimately have
pasted.

---

## 5. The read-backs the owner runs after applying

Three queries. **None of them can print a row of anybody's data** — they read the catalogue.

```sql
-- the altered policy's expression
select pg_get_expr(polwithcheck, polrelid)
from pg_policy where polrelid = 'public.tasks'::regclass and polcmd = 'a';
```
```
 ((( SELECT auth.uid() AS uid) = owner_id) AND ((team_id IS NULL) OR is_team_member(team_id)) AND tasks_may_add())
```

```sql
-- the function: security definer, VOLATILE, and reachable by the right role only
select p.proname, p.prosecdef, p.provolatile,
       has_function_privilege('authenticated', p.oid, 'execute'),
       has_function_privilege('anon',          p.oid, 'execute')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'tasks_may_add';
```
```
 tasks_may_add | t | v | t | f
```

`provolatile = v` is the one to read twice: `s` there would be the decorative cap of section 3.1.

```sql
select conname, conrelid::regclass from pg_constraint
where conname in ('invitations_email_length', 'account_status_reason_length',
                  'tasks_title_no_control_chars', 'profiles_display_name_no_control_chars');
```
```
 account_status_reason_length           | account_status
 invitations_email_length               | invitations
 profiles_display_name_no_control_chars | profiles
 tasks_title_no_control_chars           | tasks
```

---

## 6. What the probe established about PART 2B, which is not in this change

The owner's decisions of 2026-10-12: a **BEFORE INSERT trigger on `storage.objects`**, counting through
the existing `count_daily_use` with a third feature word **`uploads`**, at **30 a day**.

The probe built exactly that, against the **real** `20261008115900_usage_counts.sql` applied unmodified:

| | Result |
|---|---|
| Alice signed in, 30 uploads | **30 allowed, 0 refused**; `usage_counts` → `uploads` = 30 |
| the 31st | **refused, `sqlstate 54000`**, with the plan's own sentence; objects stay 30 and the count stays 30 |
| **the service-role path: 40 files in ONE committed transaction** | **all 40 land; the counts are UNCHANGED; still one `usage_counts` row.** This is the restore case, and it works |
| a different bucket | not counted |
| a duplicate path → unique violation **after** the trigger | **rolled back; the count is back where it was** |
| an error later in the same transaction | **rolled back; same** |
| `authenticated` calling `count_daily_use` | refused `42501` |
| `authenticated` calling the trigger function | refused `42501` |
| `authenticated` reading `usage_counts` | refused `42501` |
| a typo'd feature word | raises `23514` |

**Three findings worth carrying into part 2b:**

1. **No new grant is needed.** A `security definer` trigger function owned by `postgres` calls
   `count_daily_use` even though `EXECUTE` is revoked from `authenticated` —
   `has_function_privilege('authenticated', …)` is **false** while all thirty uploads counted. So the
   counter stays closed to every client role, which is what made this shape better than a counting call
   inside the policy.
2. **A refused or failed upload does not spend a slot**, proved by two different failure modes. One of
   those failures was itself `permission denied for table usage_counts` for `authenticated` — a
   mis-designed step in the probe whose error is an independent confirmation of the real migration's
   revoke.
3. **Service-role writes are neither counted nor refused**, because `auth.uid()` is null for them and the
   trigger returns early. A 40-file restore in one transaction committed with no count written.

**AND THE ONE THING THIS CANNOT SETTLE, which is part 2b's real risk: whether the role that applies
migrations may create a trigger on `storage.objects`.** It needs **ownership** of that table; here
`postgres` is a superuser. `create policy` on it did succeed on both projects, which normally also needs
ownership, so it will probably work — and `20261008191804_attachments_bucket.sql`'s own comment already
carries the weaker version of this question ("UNVERIFIED whether the role that applies migrations holds
SELECT on storage.objects"). **Only the owner's staging `db push` shows it.** The fallback is decided.

**Also untested**: a **signed-in** multi-row insert into `storage.objects`. Not reachable through the
Storage API, which uploads one object per request. It belongs in part 2b's probe rather than in an
argument.

---

## 7. What is UNVERIFIED, in full (rule 8)

| What | Why it could not be settled here | What settles it |
|---|---|---|
| **That the migration applies to a real Supabase project** | `supabase db push` is refused to the assistant everywhere by rule 19, and there is no local Supabase | the owner, from this branch, against staging |
| **That the cap refuses over the Data API** rather than in `psql` | everything here is a direct connection; PostgREST is a different client | `scripts/staging/build-it-25-limits-checks.mjs`, before and after |
| **What HTTP status and body a refusal carries** | same | the same script, which reports both |
| **`invitations_email_length` and `account_status_reason_length` from a client** | neither table has an insert or update policy for any client role, and `invite-member` refuses over 320 before any query. **They are backstops behind code and behind the dashboard** | nothing, from outside. The sandbox above is the only place they can be exercised, and section 4 is that |
| **That nothing in the app now draws a worse message** | no screen was opened and no action was changed by this file | the screen pull request, which is next |
| **Anything about production** | nothing here touches it | the merge, then a connector read of section 5's three queries |
| **Whether a trigger can be created on `storage.objects`** | a local `postgres` owns everything | the owner's staging apply, in part 2b |

---

## 8. Redaction (rule 18)

**Nothing was captured from production.** The pre-check counts in `evidence/production-log.md` are four
integers and two aggregates, read by the coach; **the assistant was given numbers and never a row.**

**The sandbox used made-up data throughout**: three uuids of repeated digits, and addresses at
`example.invalid`, which is reserved and cannot resolve. No real address, task title, team name or
nickname appears anywhere in this file or in the probe's SQL.

**So the list of replaced values is empty, and that is a complete answer.**
