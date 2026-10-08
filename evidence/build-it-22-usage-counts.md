# Evidence: Build it 22 part 1 — `usage_counts` and the atomic counter (migration only)

Issue [#220](https://github.com/build-once/team-tasks/issues/220). Migration:
`supabase/migrations/20261008115900_usage_counts.sql`.

**Result: PASS on a local sandbox. NOT applied to staging. NOT applied to production.** Rule 19: the
assistant does not run `db push` anywhere, and the guard refuses every `db push` except `--local`. The
owner has not applied this migration to staging, and was not asked to during this session.

Read from `origin/main` at commit **`49f9b5c5c453998843729abd9ad3d27bda9644c8`** — "Merge pull request
#218 from build-once/docs/build-it-22-daily-limits-plan-215" (`git fetch origin main` then
`git log --oneline -5 origin/main`, run in this session). The branch is
`feat/build-it-22-usage-counts-220`, created from that commit.

**What was NOT done, stated before anything is claimed.** No MCP connector was used. No browser was
used. Nothing touched staging or production — no deploy, no secret, no query, no dashboard — so there is
no `evidence/production-log.md` entry to make. No Edge Function, no screen and no workflow was changed.
Nothing was sent to Anthropic or to the email service from this session. Level 2 was not used.

**Everything below section 2 was produced by the assistant on a throwaway PostgreSQL cluster on the
owner's machine.** That is not staging evidence and is not a substitute for it. Section 11 says exactly
what it therefore does not settle.

---

## 1. What this migration is, and the correction it carries

One table and one function, and nothing calls the function yet.

| Piece | What it is |
|---|---|
| `public.usage_counts` | `user_id`, `feature`, `day`, `used`. Primary key on the first three. RLS on, **no policies**, and **no table privilege for any role** |
| `public.count_daily_use(uuid, text, integer)` | `security definer`. In **one statement** it adds one to today's count only if the count is below the limit, and returns whether the use is allowed. Then it removes that person's rows seven or more days old |

**The correction the owner made on 8 October 2026, carried in this pull request.** `docs/plan.md` and
`docs/architecture.md` were written earlier the same day, before any code, and `docs/architecture.md`
said:

> `service_role` needs **select, insert, update and delete** — it is what the two functions connect as,
> and **delete is needed because of the 7-day decision**

With a single counting function, **it needs none of those**. It gets `EXECUTE` on the function and no
privilege at all on the table. The 7-day removal does need a deleter — and the deleter is the
**function**, which runs as its owner, not the role that calls it. `docs/plan.md`'s "Who can see it"
paragraph said the server functions could see the table; it cannot see it either. Both lines are changed
in this pull request, and section 6.4 below is the output that makes the new shape a fact rather than an
intention.

What the narrower shape buys, which is the reason to prefer it: a server function holding the
service-role key **cannot add to a count, cannot reset one to start somebody's day again, cannot delete
the window early, and cannot read which days a person used this app**. The one thing it can do is ask for
one use and be told yes or no.

---

## 2. The sandbox

PostgreSQL **17.10**, a cluster created by the assistant with `initdb` in its scratchpad, listening on
`127.0.0.1` port **55434** only, trust authentication, deleted at the end of the session. It is **not**
the version either project runs: `evidence/build-it-16-suspend-accounts.md` records the owner reporting
staging on PostgreSQL **17.6**, and **production's version is still unverified** — nothing has been read
back from it.

```
> & "C:\Program Files\PostgreSQL\17\bin\psql.exe" "postgresql://postgres@127.0.0.1:55434/postgres" -c "select version(), current_setting('TimeZone') as tz, current_date as server_date, (now() at time zone 'utc')::date as utc_date, now()"

                                 version                                  |        tz        | server_date |  utc_date  |              now
--------------------------------------------------------------------------+------------------+-------------+------------+-------------------------------
 PostgreSQL 17.10 on x86_64-windows, compiled by msvc-19.44.35226, 64-bit | Pacific/Auckland | 2026-10-09  | 2026-10-08 | 2026-10-09 01:05:06.015355+13
(1 row)
```

**The time zone is deliberately wrong, and it is the most useful thing about this sandbox.**
`timezone = 'Pacific/Auckland'` (UTC+13) was set in `postgresql.conf` before the cluster was started, so
at the moment every run below happened **the server's local date and the UTC date were different dates**:
`server_date` 2026-10-09, `utc_date` 2026-10-08. A counter written with `current_date` would therefore
land its row on the wrong day, visibly, instead of being indistinguishable from a correct one — which is
what would have happened on a cluster left at UTC. Supabase runs UTC, so this is harder than production,
not easier.

### Two databases, differing in one thing

Issue #220: *"Supabase applies 'new public tables are not exposed by default' to existing projects on
30 October 2026 (changelog 45329) ... this table must behave the same before and after that date."*

So there are two databases in this cluster, built from the same stand-in and the same ten migrations:

| Database | What it models |
|---|---|
| `sandbox_pre` | A project **before** 30 October 2026: `alter default privileges in schema public grant all on tables / grant execute on functions to anon, authenticated, service_role` is applied before the migrations |
| `sandbox_post` | A project **after** it: those two lines are absent, and nothing else differs |

`sandbox_pre2` and `sandbox_post2` are a second, identical pair, built later and used for the mechanical
comparison in section 10.

### The stand-in

Supabase's `auth` schema does not exist in a plain cluster. This is the whole of the stand-in, the same
shape as `evidence/build-it-16-suspend-accounts.md` section 1,
`evidence/build-it-18-invitation-status.md` section 3 and
`evidence/build-it-21-ai-consent-migration.md` section 2:

```sql
-- Roles are cluster-wide, not per-database, and this file is applied to two
-- databases in the same cluster, so the three creations are written to be safe
-- the second time. Everything below them is per-database and runs twice.
do $do$
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
$do$;

create schema auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);

-- Supabase's auth.uid() reads the request JWT. Here it reads a session setting.
create function auth.uid() returns uuid
language sql stable
as $fn$ select nullif(current_setting('sandbox.uid', true), '')::uuid $fn$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
```

**`service_role` has `bypassrls`, because Supabase's does**, and that matters here more than in any
previous evidence file: it means row-level security is *not* what keeps the server functions' role out of
this table, and the proof cannot accidentally credit the "no policies" line for work the revokes are
doing.

### And the one thing without which the whole proof would be vacuous

`01-old-defaults.sql`, applied to `sandbox_pre` and `sandbox_pre2` only:

```sql
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
```

Without it, a plain cluster grants `anon` and `authenticated` nothing on a new table, so every "revoked"
result below would be a pass with nothing to revoke — which AGENTS.md rule 8 calls **unverified**, not a
pass. The control that proves it took is in section 4: `public.tasks`, which **no migration in this
repository grants a privilege on**, comes back `t` for `authenticated` in `sandbox_pre` and `f` in
`sandbox_post`. `grant all` is deliberately **wider** than Supabase's documented default, so a revoke
that left anything behind would show up here rather than on staging.

### The seed

Three accounts with fixed ids, so the output reads without a lookup table. Fake addresses on
`example.com`; **no real person's data is used** (rule 6).

```sql
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'carol@example.com');
```

Nothing else is seeded — no profile, no team, no task. `usage_counts` has no relationship to any other
table, which is itself one of the things its shape was chosen for.

---

## 3. The migration applies cleanly, to both databases

Every file, in order, with `ON_ERROR_STOP=1` so a single warning-free run means every statement
succeeded. The last migration in each list is the new one.

```
> node build.mjs sandbox_pre 00-standin.sql 01-old-defaults.sql <the nine existing migrations> 20261008115900_usage_counts.sql 90-seed.sql

=== psql -c "create database sandbox_pre" ===
CREATE DATABASE
exit=0
=== psql -f 00-standin.sql ===
exit=0
=== psql -f 01-old-defaults.sql ===
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
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20261008115900_usage_counts.sql ===
exit=0
=== psql -f 90-seed.sql ===
exit=0
BUILT sandbox_pre from 13 files
0
```

The same for `sandbox_post`, without `01-old-defaults.sql`:

```
BUILT sandbox_post from 12 files
0
```

(The trailing `0` on each is the process exit code, printed by PowerShell's `.ExitCode` — rule 3, and
rule 4 forbids `;` so it cannot be `echo $?`.)

**Expand only, and this is where it is checked rather than asserted.** The nine existing migrations ran
unchanged and in order ahead of the new one; nothing in the new file alters, drops or re-creates anything
they made. The new file adds one table and one function and touches no existing object.

---

## 4. The rights, read with `has_table_privilege` and `has_function_privilege`

Issue #220 asks for exactly this. `sandbox_pre` first — the harder of the two, because here the roles
really did hold the privileges a moment before the revokes ran.

```
> node ask.mjs sandbox_pre 10-privileges.sql

############################################################
# A. WHICH DATABASE IS THIS, AND IS THE SANDBOX HONEST?
############################################################

-- public.tasks is the control: NO migration in this repository grants a
-- privilege on it, so whatever authenticated holds there came from the
-- project default.
+-------------+-----------------------+-----------------------+------------------------------+
|  database   | authd_select_on_tasks | authd_delete_on_tasks | authd_execute_is_team_member |
+-------------+-----------------------+-----------------------+------------------------------+
| sandbox_pre | t                     | t                     | t                            |
+-------------+-----------------------+-----------------------+------------------------------+
(1 row)

############################################################
# B. THE TABLE AS BUILT
############################################################

+---------+---------+----------+---------+
| column  |  type   | not_null | default |
+---------+---------+----------+---------+
| user_id | uuid    | t        |         |
| feature | text    | t        |         |
| day     | date    | t        |         |
| used    | integer | t        |         |
+---------+---------+----------+---------+
(4 rows)

+------------------------------+---------+------------------------------------------------------------------------------+
|           conname            | contype |                                  definition                                  |
+------------------------------+---------+------------------------------------------------------------------------------+
| usage_counts_feature_allowed | c       | CHECK ((feature = ANY (ARRAY['ai_suggestions'::text, 'invitations'::text]))) |
| usage_counts_pkey            | p       | PRIMARY KEY (user_id, feature, day)                                          |
| usage_counts_used_is_a_use   | c       | CHECK ((used >= 1))                                                          |
| usage_counts_user_id_fkey    | f       | FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE            |
+------------------------------+---------+------------------------------------------------------------------------------+
(4 rows)

+--------------+-------------+------------+----------+------------------------------+
|   relname    | rls_enabled | rls_forced | policies |         table_grants         |
+--------------+-------------+------------+----------+------------------------------+
| usage_counts | t           | f          |        0 | {postgres=arwdDxtm/postgres} |
+--------------+-------------+------------+----------+------------------------------+
(1 row)

+-------------------+--------------------------------------------------------------------------------------------------+
|     indexname     |                                             indexdef                                             |
+-------------------+--------------------------------------------------------------------------------------------------+
| usage_counts_pkey | CREATE UNIQUE INDEX usage_counts_pkey ON public.usage_counts USING btree (user_id, feature, day) |
+-------------------+--------------------------------------------------------------------------------------------------+
(1 row)

############################################################
# C. has_table_privilege ON usage_counts -- EVERY ROLE, EVERY COMMAND
############################################################

+---------------+--------+--------+--------+--------+----------+------------+
|     role      | select | insert | update | delete | truncate | references |
+---------------+--------+--------+--------+--------+----------+------------+
| anon          | f      | f      | f      | f      | f        | f          |
| authenticated | f      | f      | f      | f      | f        | f          |
| service_role  | f      | f      | f      | f      | f        | f          |
+---------------+--------+--------+--------+--------+----------+------------+
(3 rows)

-- And column by column, because a table-level revoke can leave a
-- column-level grant behind (evidence/build-it-18-invitation-status.md
-- section 5). Every cell must be f.
+---------------+---------+--------+--------+--------+
|     role      | column  | select | insert | update |
+---------------+---------+--------+--------+--------+
| anon          | day     | f      | f      | f      |
| anon          | feature | f      | f      | f      |
| anon          | used    | f      | f      | f      |
| anon          | user_id | f      | f      | f      |
| authenticated | day     | f      | f      | f      |
| authenticated | feature | f      | f      | f      |
| authenticated | used    | f      | f      | f      |
| authenticated | user_id | f      | f      | f      |
| service_role  | day     | f      | f      | f      |
| service_role  | feature | f      | f      | f      |
| service_role  | used    | f      | f      | f      |
| service_role  | user_id | f      | f      | f      |
+---------------+---------+--------+--------+--------+
(12 rows)

############################################################
# D. has_function_privilege ON count_daily_use
############################################################

+---------------+---------+
|     role      | execute |
+---------------+---------+
| anon          | f       |
| authenticated | f       |
| service_role  | t       |
+---------------+---------+
(3 rows)

-- The access control list itself, which is the only place PUBLIC shows.
-- An entry beginning "=" with no role name before it would be PUBLIC
-- holding EXECUTE. There must not be one.
+-----------------+------------------+------------+----------------------+-----------------------------------------------+
|     proname     | security_definer | volatility |       settings       |                function_grants                |
+-----------------+------------------+------------+----------------------+-----------------------------------------------+
| count_daily_use | t                | v          | {"search_path=\"\""} | {postgres=X/postgres,service_role=X/postgres} |
+-----------------+------------------+------------+----------------------+-----------------------------------------------+
(1 row)

+----------+----------+
|  object  |  owner   |
+----------+----------+
| table    | postgres |
| function | postgres |
+----------+----------+
(2 rows)

exit=0
0
```

**What each block settles.**

| Block | What it says |
|---|---|
| A | The sandbox is honest. `authenticated` holds `select` **and `delete`** on `public.tasks`, which no migration granted — so the default privileges really are in force, and every `f` below is a revoke working rather than an absence |
| B | Four columns and no more: no `created_at`, no `updated_at`, no task id, no address. `day` is a `date`, so the row **cannot** record a time of day. RLS **on** with **0 policies**, and `table_grants` holding `postgres` alone |
| C | **Every role, every command, false** — including `truncate` and `references`, and including every column one at a time, because a table-level revoke can leave a column-level grant standing |
| D | `service_role` has `EXECUTE` and the other two do not. `function_grants` lists `postgres` and `service_role` only: **no `=X/postgres` entry**, so PUBLIC holds nothing. `security_definer` is `t` and `search_path` is `""` |
| D (owner) | Table and function are owned by the same role, which is what lets a `security definer` function write a table on which nobody holds a privilege |

`sandbox_post` gives the same C and D. Section 10 compares the two files mechanically rather than by eye.

---

## 5. Twenty calls at the same moment — and the same test failing on the obvious wrong version

This is the requirement the function exists for: *"Two calls at the same moment must not both pass a
limit that has room for one."*

### How "at the same moment" is arranged

Twenty `psql` processes started one after another take tens of milliseconds each to connect, and the
statement under test takes well under one, so **without a barrier they queue up and even a broken counter
looks correct**. So:

* a coordinator session takes advisory lock 1 in **exclusive** mode and holds it for three seconds;
* every worker asks for the same lock in **shared** mode, which blocks while the exclusive one is held;
* when the coordinator releases, every waiting worker is woken and they proceed together;
* each worker prints `clock_timestamp()` the moment it is through the barrier, and the harness reports
  the **spread between the first and the last**. That number is what says whether a round was a race or a
  queue.

Workers connect and `set role service_role` — the role the two Edge Functions will connect as — so the
run exercises the same privileges the real caller will have.

### The migration's counter: limit 2, twenty callers, ten rounds

```
> node race.mjs sandbox_pre count_daily_use 2 20 10

race: db=sandbox_pre function=count_daily_use limit=2 workers=20 rounds=10 plant-old-row=false
the UTC day in this database: 2026-10-08

round  1: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=0.758  ok
round  2: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=1.605  ok
round  3: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=1.009  ok
round  4: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=0.876  ok
round  5: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=1.109  ok
round  6: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=1.164  ok
round  7: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=0.964  ok
round  8: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=1.036  ok
round  9: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=1.492  ok
round 10: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=1.328  ok

worst round let 2 through a limit of 2.
VERDICT: the limit held in every round.
0
```

**Exactly 2 allowed in every round, the count ends at 2 in every round, and all twenty workers cleared
the barrier inside 1–2 ms.** `used=2` is read back by the harness as `postgres` after the round, so it is
the table's own number and not a sum of what the workers reported.

### Again, with an old row present, so every worker also deletes

The counting function deletes too, and twenty concurrent deletes of the same row is where a deadlock
would live. A 9-day-old row is planted before each round:

```
> node race.mjs sandbox_pre count_daily_use 2 20 10 plant-old-row

race: db=sandbox_pre function=count_daily_use limit=2 workers=20 rounds=10 plant-old-row=true
the UTC day in this database: 2026-10-08

round  1: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=0.983  ok
round  2: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=1.038  ok
round  3: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=0.955  ok
round  4: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=1.223  ok
round  5: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=1.946  ok
round  6: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=1.302  ok
round  7: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=1.008  ok
round  8: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=1.024  ok
round  9: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=1.273  ok
round 10: allowed=2 refused=18 failed=0 used=2 rows=1 barrier_spread_ms=1.110  ok

worst round let 2 through a limit of 2.
VERDICT: the limit held in every round.
0
```

`failed=0` every round — **no deadlock and no serialization error** — and `rows=1` every round, which is
the planted old row being removed under contention rather than surviving it.

### And at the real limit: 20, with forty callers, on the post-30-October database

```
> node race.mjs sandbox_post count_daily_use 20 40 5

race: db=sandbox_post function=count_daily_use limit=20 workers=40 rounds=5 plant-old-row=false
the UTC day in this database: 2026-10-08

round  1: allowed=20 refused=20 failed=0 used=20 rows=1 barrier_spread_ms=2.800  ok
round  2: allowed=20 refused=20 failed=0 used=20 rows=1 barrier_spread_ms=3.163  ok
round  3: allowed=20 refused=20 failed=0 used=20 rows=1 barrier_spread_ms=2.829  ok
round  4: allowed=20 refused=20 failed=0 used=20 rows=1 barrier_spread_ms=2.638  ok
round  5: allowed=20 refused=20 failed=0 used=20 rows=1 barrier_spread_ms=3.125  ok

worst round let 20 through a limit of 20.
VERDICT: the limit held in every round.
0
```

### THE SAME TEST, SEEN TO FAIL

Issue #220: *"Show a version of the counter written the obvious wrong way (read, then write) letting more
than 2 through, so the test is seen to fail."*

Two stand-in functions were created **in the sandbox only** — they are not in the migration and must
never be. Everything about them is identical to `count_daily_use` (`security definer`, `set search_path`,
the UTC day, the 7-day delete, the return shape) **except** that they read, compare, and then write:

```sql
  -- STEP ONE: read.
  select uc.used into l_used
  from public.usage_counts uc
  where uc.user_id = p_user_id and uc.feature = p_feature and uc.day = l_today;

  l_used := coalesce(l_used, 0);

  if l_used >= p_limit then
    return false;
  end if;

  -- THE GAP. Everything that is wrong with this function is here.
  perform pg_sleep(0.05);          -- absent from the _nosleep version

  -- STEP TWO: write.
  insert into public.usage_counts as uc (user_id, feature, day, used)
  values (p_user_id, p_feature, l_today, 1)
  on conflict (user_id, feature, day) do update
    set used = uc.used + 1;
```

With the gap made visible — the sleep does not change what the code *does*, it widens the window that is
already there so the failure is deterministic instead of occasional:

```
> node race.mjs sandbox_pre wrong_count_daily_use 2 20 10

race: db=sandbox_pre function=wrong_count_daily_use limit=2 workers=20 rounds=10 plant-old-row=false
the UTC day in this database: 2026-10-08

round  1: allowed=20 refused=0 failed=0 used=20 rows=1 barrier_spread_ms=1.085  WRONG
round  2: allowed=20 refused=0 failed=0 used=20 rows=1 barrier_spread_ms=0.839  WRONG
round  3: allowed=20 refused=0 failed=0 used=20 rows=1 barrier_spread_ms=1.387  WRONG
round  4: allowed=20 refused=0 failed=0 used=20 rows=1 barrier_spread_ms=0.833  WRONG
round  5: allowed=20 refused=0 failed=0 used=20 rows=1 barrier_spread_ms=1.212  WRONG
round  6: allowed=20 refused=0 failed=0 used=20 rows=1 barrier_spread_ms=1.473  WRONG
round  7: allowed=20 refused=0 failed=0 used=20 rows=1 barrier_spread_ms=1.729  WRONG
round  8: allowed=20 refused=0 failed=0 used=20 rows=1 barrier_spread_ms=0.931  WRONG
round  9: allowed=20 refused=0 failed=0 used=20 rows=1 barrier_spread_ms=1.751  WRONG
round 10: allowed=20 refused=0 failed=0 used=20 rows=1 barrier_spread_ms=1.578  WRONG

worst round let 20 through a limit of 2.
VERDICT: the limit DID NOT hold.
0
```

**20 of 20 through a limit of 2, ten times out of ten.** And with no sleep at all, so that nobody can say
the sleep was the fault:

```
> node race.mjs sandbox_pre wrong_count_daily_use_nosleep 2 20 10

race: db=sandbox_pre function=wrong_count_daily_use_nosleep limit=2 workers=20 rounds=10 plant-old-row=false
the UTC day in this database: 2026-10-08

round  1: allowed=6 refused=14 failed=0 used=6 rows=1 barrier_spread_ms=1.377  WRONG
round  2: allowed=3 refused=17 failed=0 used=3 rows=1 barrier_spread_ms=1.460  WRONG
round  3: allowed=20 refused=0 failed=0 used=20 rows=1 barrier_spread_ms=1.235  WRONG
round  4: allowed=20 refused=0 failed=0 used=20 rows=1 barrier_spread_ms=1.385  WRONG
round  5: allowed=4 refused=16 failed=0 used=4 rows=1 barrier_spread_ms=1.227  WRONG
round  6: allowed=6 refused=14 failed=0 used=6 rows=1 barrier_spread_ms=21.177  WRONG
round  7: allowed=20 refused=0 failed=0 used=20 rows=1 barrier_spread_ms=1.221  WRONG
round  8: allowed=5 refused=15 failed=0 used=5 rows=1 barrier_spread_ms=1.189  WRONG
round  9: allowed=20 refused=0 failed=0 used=20 rows=1 barrier_spread_ms=1.144  WRONG
round 10: allowed=20 refused=0 failed=0 used=20 rows=1 barrier_spread_ms=1.388  WRONG
```

**3 to 20 through a limit of 2, varying round to round** — which is the more instructive of the two
failures, because it is what a real race looks like: never right, and never wrong in the same way twice.
A limit like that would pass a casual test on a quiet afternoon and leak on a busy one. The run with the
sleep is the same code with the window widened; this one is the window as it actually is.

---

## 6. The attack: every role, every command

Run against `sandbox_pre`, where all three roles held `select`, `insert`, `update` and `delete` on every
public table until this migration's revokes ran. `ERROR: permission denied` is the **expected** result in
sections 6.2 to 6.4 and is what makes them a pass.

*The blocks below are the run's output with the `\echo` prose lines from `20-attack.sql` removed where
this file says the same thing in its own words beside them. Every `SET`, `RESET`, `ERROR`, table and row
count is as printed; nothing that is a result has been shortened.*

### 6.1 The day is the UTC day, worked out by the database

```
############################################################
# 1. THE DAY IS THE UTC DAY, WORKED OUT BY THE DATABASE
############################################################

+------------------+-------------+------------+-------------------------------+
|     timezone     | server_date |  utc_date  |              now              |
+------------------+-------------+------------+-------------------------------+
| Pacific/Auckland | 2026-10-09  | 2026-10-08 | 2026-10-09 01:12:47.690717+13 |
+------------------+-------------+------------+-------------------------------+
(1 row)

SET
+---------+
| allowed |
+---------+
| t       |
+---------+
(1 row)

RESET
+--------------------------------------+----------------+------------+------+----------------+-------------------+
|               user_id                |    feature     |    day     | used | is_the_utc_day | is_the_server_day |
+--------------------------------------+----------------+------------+------+----------------+-------------------+
| 11111111-1111-1111-1111-111111111111 | ai_suggestions | 2026-10-08 |    1 | t              | f                 |
+--------------------------------------+----------------+------------+------+----------------+-------------------+
(1 row)

DELETE 1
```

`is_the_utc_day = t` and `is_the_server_day = f`, on a cluster where the two are different dates. Nothing
in the call said what day it was.

### 6.2 As `anon` — the signed-out caller

```
############################################################
# 2. ATTACK AS anon -- the signed-out caller
############################################################

SET
-- 2.1 read
psql:20-attack.sql:45: ERROR:  permission denied for table usage_counts
-- 2.2 read, even just whether a row exists
psql:20-attack.sql:47: ERROR:  permission denied for table usage_counts
-- 2.3 insert
psql:20-attack.sql:50: ERROR:  permission denied for table usage_counts
-- 2.4 update
psql:20-attack.sql:52: ERROR:  permission denied for table usage_counts
-- 2.5 delete
psql:20-attack.sql:54: ERROR:  permission denied for table usage_counts
-- 2.6 run the function
psql:20-attack.sql:56: ERROR:  permission denied for function count_daily_use
-- 2.7 run the function with a limit of its own choosing
psql:20-attack.sql:58: ERROR:  permission denied for function count_daily_use
RESET
```

### 6.3 As `authenticated` — a signed-in person, with Alice signed in

```
############################################################
# 3. ATTACK AS authenticated -- a signed-in person
############################################################

SET
SET
-- 3.1 read
psql:20-attack.sql:76: ERROR:  permission denied for table usage_counts
-- 3.2 read, even just whether a row exists
psql:20-attack.sql:78: ERROR:  permission denied for table usage_counts
-- 3.3 insert
psql:20-attack.sql:81: ERROR:  permission denied for table usage_counts
-- 3.4 update: reset my own count and start the day again
psql:20-attack.sql:83: ERROR:  permission denied for table usage_counts
-- 3.5 delete: throw away my own count
psql:20-attack.sql:85: ERROR:  permission denied for table usage_counts
-- 3.6 run the function
psql:20-attack.sql:87: ERROR:  permission denied for function count_daily_use
-- 3.7 run the function with a limit of its own choosing
psql:20-attack.sql:89: ERROR:  permission denied for function count_daily_use
-- 3.8 read my own row only
psql:20-attack.sql:91: ERROR:  permission denied for table usage_counts
RESET
RESET
```

**3.4 and 3.5 are the two that make the limit a limit**, and 3.8 is the one `docs/plan.md` asks for in as
many words: *"no app user, not even the person whose count it is"*. A select restricted to
`user_id = auth.uid()` is refused like every other.

**3.7 is why no client role may call the function at all.** The limit has to be an argument — the numbers
live in `supabase/functions/_shared/limits.ts`, not in the database — so a caller who can run the
function chooses its limit. `999999` is refused here because the `EXECUTE` is, not because the function
checked anything.

### 6.4 As `service_role` — the server functions' own role, and the correction in section 1

```
############################################################
# 4. AS service_role -- the server functions own role
############################################################

SET
-- 4.1 read
psql:20-attack.sql:109: ERROR:  permission denied for table usage_counts
-- 4.2 insert
psql:20-attack.sql:112: ERROR:  permission denied for table usage_counts
-- 4.3 update
psql:20-attack.sql:114: ERROR:  permission denied for table usage_counts
-- 4.4 delete
psql:20-attack.sql:116: ERROR:  permission denied for table usage_counts
-- 4.5 truncate
psql:20-attack.sql:118: ERROR:  permission denied for table usage_counts
-- 4.6 run the function -- the ONE thing it may do
+---------+
| allowed |
+---------+
| t       |
+---------+
(1 row)

RESET
-- And the row it wrote, read back as postgres (the operator):
+--------------------------------------+----------------+------------+------+
|               user_id                |    feature     |    day     | used |
+--------------------------------------+----------------+------------+------+
| 11111111-1111-1111-1111-111111111111 | ai_suggestions | 2026-10-08 |    1 |
+--------------------------------------+----------------+------------+------+
(1 row)

DELETE 1
```

**This is the output that settles the correction.** `service_role` has `bypassrls` in this sandbox exactly
as it does on Supabase, so row-level security was never in its way; the five refusals are the revokes.
And the sixth line works, which is the other half: the role can still do its job through the function,
and the row it wrote is there.

---

## 7. What the function answers when it is not counting

### The limit, one call at a time

```
############################################################
# 5. THE LIMIT, ONE CALL AT A TIME
############################################################

-- Limit 2. Five calls, each its own statement: t, t, f, f, f. Then the
-- count, which must be 2 and not 5 -- a refused call must not count.
SET
-- 5.1
+---------+
| allowed |
+---------+
| t       |
+---------+
(1 row)

-- 5.2
+---------+
| allowed |
+---------+
| t       |
+---------+
(1 row)

-- 5.3
+---------+
| allowed |
+---------+
| f       |
+---------+
(1 row)

-- 5.4
+---------+
| allowed |
+---------+
| f       |
+---------+
(1 row)

-- 5.5
+---------+
| allowed |
+---------+
| f       |
+---------+
(1 row)

RESET
+----------------+------------+------+
|    feature     |    day     | used |
+----------------+------------+------+
| ai_suggestions | 2026-10-08 |    2 |
+----------------+------------+------+
(1 row)
```

Five calls, `used = 2`: a refused call does not count.

### Features are independent

```
############################################################
# 6. FEATURES ARE INDEPENDENT
############################################################

-- Alice is full on ai_suggestions: section 5 left it at 2 with a limit
-- of 2. Her invitations must be untouched.
SET
-- 6.1 ai_suggestions again, limit 2 -- must be f
+---------+
| allowed |
+---------+
| f       |
+---------+
(1 row)

-- 6.2 invitations, limit 2 -- must be t
+---------+
| allowed |
+---------+
| t       |
+---------+
(1 row)

-- 6.3 invitations again -- must be t
+---------+
| allowed |
+---------+
| t       |
+---------+
(1 row)

-- 6.4 invitations a third time -- now full, must be f
+---------+
| allowed |
+---------+
| f       |
+---------+
(1 row)

RESET
+----------------+------+
|    feature     | used |
+----------------+------+
| ai_suggestions |    2 |
| invitations    |    2 |
+----------------+------+
(2 rows)
```

### People are independent

```
############################################################
# 7. PEOPLE ARE INDEPENDENT
############################################################

-- Alice is at her limit on both features. Bob and Carol must not be.
SET
-- 7.1 Alice, ai_suggestions, limit 2 -- must be f
+---------+
| allowed |
+---------+
| f       |
+---------+
(1 row)

-- 7.2 Bob, ai_suggestions, limit 2 -- must be t
+---------+
| allowed |
+---------+
| t       |
+---------+
(1 row)

-- 7.3 Carol, ai_suggestions, limit 2 -- must be t
+---------+
| allowed |
+---------+
| t       |
+---------+
(1 row)

RESET
+--------------------------------------+----------------+------+
|               user_id                |    feature     | used |
+--------------------------------------+----------------+------+
| 11111111-1111-1111-1111-111111111111 | ai_suggestions |    2 |
| 11111111-1111-1111-1111-111111111111 | invitations    |    2 |
| 22222222-2222-2222-2222-222222222222 | ai_suggestions |    1 |
| 33333333-3333-3333-3333-333333333333 | ai_suggestions |    1 |
+--------------------------------------+----------------+------+
(4 rows)
```

Alice at her limit on both features; Bob and Carol unaffected, each at 1. This is the plan's "per person,
not per team" and its separate buckets per feature, in one table.

### The answers that are not a count

```
############################################################
# 8. THE ANSWERS THAT ARE NOT A COUNT
############################################################

DELETE 4
SET
-- 8.1 limit 0, for a person with no row at all
+---------+
| allowed |
+---------+
| f       |
+---------+
(1 row)

-- 8.2 limit -1
+---------+
| allowed |
+---------+
| f       |
+---------+
(1 row)

-- 8.3 null user, null feature, null limit
+-----------+--------------+------------+
| null_user | null_feature | null_limit |
+-----------+--------------+------------+
| f         | f            | f          |
+-----------+--------------+------------+
(1 row)

-- 8.4 a feature outside the fixed list
psql:20-attack.sql:215: ERROR:  new row for relation "usage_counts" violates check constraint "usage_counts_feature_allowed"
DETAIL:  Failing row contains (33333333-3333-3333-3333-333333333333, ai_suggestion, 2026-10-08, 1).
CONTEXT:  SQL statement "insert into public.usage_counts as uc (user_id, feature, day, used)
  select p_user_id, p_feature, l_today, 1
  where p_limit > 0
  on conflict (user_id, feature, day) do update
    set used = uc.used + 1
    where uc.used < p_limit
  returning true"
PL/pgSQL function public.count_daily_use(uuid,text,integer) line 69 at SQL statement
-- 8.5 a user id that is not an account
psql:20-attack.sql:217: ERROR:  insert or update on table "usage_counts" violates foreign key constraint "usage_counts_user_id_fkey"
DETAIL:  Key (user_id)=(44444444-4444-4444-4444-444444444444) is not present in table "users".
CONTEXT:  SQL statement "insert into public.usage_counts as uc (user_id, feature, day, used)
  select p_user_id, p_feature, l_today, 1
  where p_limit > 0
  on conflict (user_id, feature, day) do update
    set used = uc.used + 1
    where uc.used < p_limit
  returning true"
PL/pgSQL function public.count_daily_use(uuid,text,integer) line 69 at SQL statement
RESET
-- Nothing above may have written a row. Expect 0.
+--------------+
| rows_written |
+--------------+
|            0 |
+--------------+
(1 row)
```

| Case | Answer | Why it is the right one |
|---|---|---|
| limit `0`, **no row yet** | `f` | The one the `where p_limit > 0` on the insert exists for. Without it the first call of the day would insert `used = 1` and be allowed — a limit of zero that permits one |
| limit `-1` | `f` | Same path |
| null user / feature / limit | `f`, `f`, `f` — **never null** | A caller with a bug gets "no", which is the answer that cannot cost money |
| `'ai_suggestion'`, a typo | **raises** | The fixed list is in the database, so a mistyped feature cannot be quietly counted in a fourth bucket that no limit watches. The caller must treat the error as a refusal, which is what stops the paid call |
| a user id that is not an account | **raises** | The foreign key. Same handling |
| after all five | **0 rows written** | None of them counted anything |

---

## 8. The 7-day window, row by row

Six rows are planted for Alice as the operator, dated by age in days from the UTC day, plus one for Carol
that must be left alone. Then **one** count is made.

```
############################################################
# 9. THE 7-DAY WINDOW, ROW BY ROW
############################################################

DELETE 0
INSERT 0 6
INSERT 0 1
-- Before the count:
+--------------------------------------+------------+-------------+------+
|               user_id                |    day     | age_in_days | used |
+--------------------------------------+------------+-------------+------+
| 11111111-1111-1111-1111-111111111111 | 2026-09-08 |          30 |   31 |
| 11111111-1111-1111-1111-111111111111 | 2026-09-30 |           8 |    9 |
| 11111111-1111-1111-1111-111111111111 | 2026-10-01 |           7 |    8 |
| 11111111-1111-1111-1111-111111111111 | 2026-10-02 |           6 |    7 |
| 11111111-1111-1111-1111-111111111111 | 2026-10-03 |           5 |    6 |
| 11111111-1111-1111-1111-111111111111 | 2026-10-07 |           1 |    2 |
| 33333333-3333-3333-3333-333333333333 | 2026-09-08 |          30 |   99 |
+--------------------------------------+------------+-------------+------+
(7 rows)

SET
+---------+
| allowed |
+---------+
| t       |
+---------+
(1 row)

RESET
-- After it. Alice keeps ages 0 to 6 -- the age-0 row is the one this
-- call created -- and ages 7, 8 and 30 are gone. The age-30 row
-- belonging to Carol is still here.
+--------------------------------------+------------+-------------+------+
|               user_id                |    day     | age_in_days | used |
+--------------------------------------+------------+-------------+------+
| 11111111-1111-1111-1111-111111111111 | 2026-10-02 |           6 |    7 |
| 11111111-1111-1111-1111-111111111111 | 2026-10-03 |           5 |    6 |
| 11111111-1111-1111-1111-111111111111 | 2026-10-07 |           1 |    2 |
| 11111111-1111-1111-1111-111111111111 | 2026-10-08 |           0 |    1 |
| 33333333-3333-3333-3333-333333333333 | 2026-09-08 |          30 |   99 |
+--------------------------------------+------------+-------------+------+
(5 rows)
```

**The boundary, and the reading of "7 days" it rests on.** Issue #220 asks that "a row exactly 7 days old
is handled as the plan says", and the plan says *"How long it is kept: 7 days"* without naming a boundary.
The migration deletes `day <= today - 7`, so:

| Age in days | Kept? |
|---|---|
| 0 (today), 1, 5, 6 | **kept** |
| **7 — exactly seven days old** | **removed** |
| 8, 30 | removed |

What survives is **today and the six days before it: seven dates, never eight.** The other reading —
"older than 7 days", which keeps a row aged exactly 7 — would hold eight dates under a heading that says
seven, and the plan's whole bias is to collect less. **This is a stated assumption, not an owner
decision**: it is one character to change (`<=` to `<`) if the owner wants the other reading, and the
pull request says so.

**Carol's 30-day-old row is untouched**, because the delete is `where user_id = p_user_id`. A statement
sweeping the whole table would make every count a write against other people's rows, and twenty callers
at once would be deleting each other's rows while holding each other's locks.

**And the removal runs when the answer is no**, because a person at their limit is still a person whose
old rows should go:

```
-- AND IT RUNS WHEN THE ANSWER IS NO. Alice is planted at her limit with
-- an old row beside it; the refused call must still take the old row.
DELETE 5
INSERT 0 2
SET
+---------+
| allowed |
+---------+
| f       |
+---------+
(1 row)

RESET
+------------+-------------+------+
|    day     | age_in_days | used |
+------------+-------------+------+
| 2026-10-08 |           0 |    2 |
+------------+-------------+------+
(1 row)
```

Refused — and the 9-day-old row is gone anyway. The `used` stayed at 2, so the refusal did not count.

**One limitation of this design, stated rather than discovered.** Because each caller only tidies up
after itself, **a person who stops using the app keeps the rows they had until they come back**, since
nothing else ever runs. At one row per person per feature per day, with two features and about six
people, that is a handful of rows holding a number each — and the alternative is the scheduler the plan
declined ("a retention period that depends on somebody doing it is not a retention period"). The operator
can delete them by hand if it ever matters. This is in the migration's own comments too.

---

## 9. Deleting the account removes its rows

```
############################################################
# 10. DELETING THE ACCOUNT REMOVES ITS ROWS
############################################################

DELETE 1
SET
+---------+
| allowed |
+---------+
| t       |
+---------+
(1 row)

+---------+
| allowed |
+---------+
| t       |
+---------+
(1 row)

+---------+
| allowed |
+---------+
| t       |
+---------+
(1 row)

RESET
-- Before: Bob has two rows, Carol one.
+--------------------------------------+----------------+------+
|               user_id                |    feature     | used |
+--------------------------------------+----------------+------+
| 22222222-2222-2222-2222-222222222222 | ai_suggestions |    1 |
| 22222222-2222-2222-2222-222222222222 | invitations    |    1 |
| 33333333-3333-3333-3333-333333333333 | invitations    |    1 |
+--------------------------------------+----------------+------+
(3 rows)

DELETE 1
-- After deleting the account of Bob: his rows are gone, the row
-- belonging to Carol is not.
+--------------------------------------+-------------+------+
|               user_id                |   feature   | used |
+--------------------------------------+-------------+------+
| 33333333-3333-3333-3333-333333333333 | invitations |    1 |
+--------------------------------------+-------------+------+
(1 row)
```

One `delete from auth.users`, and both of Bob's rows went with it. `on delete cascade` is what makes
`docs/plan.md`'s "Deleted with the account" a property of the database rather than an intention — and the
plan's own caveat still stands: **there is still no way to delete an account in this app.**

---

## 10. The two databases compared mechanically, not by eye

Issue #220: *"this table must behave the same before and after that date."* A second, identical pair of
databases was built — `sandbox_pre2` with the old default privileges, `sandbox_post2` without — and both
files were run against each with the output captured to disk, then compared with `Compare-Object`.

### The whole attack-and-behaviour run: **410 lines each, one line different**

```
> node capture.mjs sandbox_pre2  20-attack.sql out-attack-pre.txt
> node capture.mjs sandbox_post2 20-attack.sql out-attack-post.txt
> Compare-Object (Get-Content out-attack-pre.txt) (Get-Content out-attack-post.txt) | ForEach-Object { "{0} {1}" -f $_.SideIndicator, $_.InputObject }

=> | Pacific/Auckland | 2026-10-09  | 2026-10-08 | 2026-10-09 01:29:17.175965+13 |
<= | Pacific/Auckland | 2026-10-09  | 2026-10-08 | 2026-10-09 01:29:06.535661+13 |
```

The **only** difference between the two runs is the clock: the two files are 410 lines each, and the one
differing line is `now()` printed eleven seconds apart. Every refusal, every `allowed`, every count and
every surviving row is identical.

### The privilege read-back: **117 lines each, differing only in the control row**

```
> Compare-Object (Get-Content out-priv-pre.txt) (Get-Content out-priv-post.txt) | ForEach-Object { "{0} {1}" -f $_.SideIndicator, $_.InputObject }

=> +---------------+-----------------------+-----------------------+------------------------------+
=> |   database    | authd_select_on_tasks | authd_delete_on_tasks | authd_execute_is_team_member |
=> +---------------+-----------------------+-----------------------+------------------------------+
=> | sandbox_post2 | f                     | f                     | t                            |
=> +---------------+-----------------------+-----------------------+------------------------------+
<= +--------------+-----------------------+-----------------------+------------------------------+
<= |   database   | authd_select_on_tasks | authd_delete_on_tasks | authd_execute_is_team_member |
<= +--------------+-----------------------+-----------------------+------------------------------+
<= | sandbox_pre2 | t                     | t                     | t                            |
<= +--------------+-----------------------+-----------------------+------------------------------+
```

*(The ten lines above are the complete diff as printed; the table-border lines differ only because one
database name is two characters longer.)*

**The only lines that differ are section A — the control.** `authd_select_on_tasks` and
`authd_delete_on_tasks` are `t` before the date and `f` after it, which is the 30 October change itself
showing up on a table no migration grants anything on. **Every line of sections B, C and D is identical**:
the four columns, the four constraints, RLS on with 0 policies, every `f` for every role and every
command and every column, and `service_role` holding `EXECUTE` and nothing else.

`authd_execute_is_team_member` is `t` on **both** sides, which is worth noticing: that grant survives
because `20261002122203_team_rules.sql` writes it out by name. It is the same reason this migration writes
out its `grant execute ... to service_role` — an explicit grant is not a default, and is not withdrawn by
a change to defaults.

---

## 11. What this does NOT settle

- **Nothing has been applied to staging or production.** The migration exists in this repository and in
  two throwaway sandbox databases. `docs/environments.md` records it as not applied, in both columns.
- **It is PostgreSQL 17.10 on Windows, not Supabase.** Staging is reported as 17.6; production's version
  is unverified. The `auth` schema here is a four-line stand-in, not Supabase Auth, and `auth.uid()` reads
  a session setting rather than a JWT.
- **The default privileges are modelled, not observed.** `alter default privileges ... grant all` is the
  assistant's model of what Supabase grants, taken from the changelog quoted in the migration and from
  `evidence/build-it-15-part-1.md`. **Nobody writing this read either project's actual grants.** What
  happens on staging when the owner applies this is therefore **unverified — nothing has been read back
  from a Supabase project**, and the thing that would settle it is a read of
  `has_table_privilege`/`has_function_privilege` on the real project after the apply.
- **Nothing is limited.** There is no `supabase/functions/_shared/limits.ts`, `suggest-subtasks` and
  `invite-member` are untouched, and **no number has ever been counted outside this sandbox**. The
  refusal sentence "You've reached today's limit. It resets tomorrow." exists in `docs/plan.md` and in no
  code.
- **The concurrency proof is 20 and 40 connections on one machine**, not two Deno isolates on Supabase's
  edge. It establishes that the *statement* is atomic, which is the part a database decides; it does not
  measure what Supabase's connection pooling does under real load.
- **PostgreSQL's own guarantee is relied on, not re-derived.** The run shows `insert ... on conflict do
  update ... where` holding a limit under 20 simultaneous callers, ten rounds over, twice. It does not
  prove it can never fail; it shows the obvious alternative failing in the same harness, which is what
  issue #220 asked for.
- **The 7-day boundary is the assistant's reading of the plan**, not an owner decision. See section 8.
- **`timezone = 'Pacific/Auckland'` is harder than production, not softer** — but a UTC-day bug that only
  appears at some other offset would not have been caught either. What is established is that the date
  comes from `now() at time zone 'utc'` and not from the server's setting.

### What WAS run here

Every command in this file was run by the assistant in this session, on the local sandbox, with its
output and exit code as printed. No command touched a network, a key, a `.env` file or any Supabase
project.

---

## 11a. The checks that ran on this change

Locally, before the commit — the two that read files this change touches:

| Command | Result |
|---|---|
| `node scripts/friendly-words-check.mjs` | `45 of 45 checks passed`, exit 0. It reads `supabase/migrations`, so it is the local check this change could have broken |
| `node scripts/approved-model-check.mjs` | `6 PASS, 0 FAIL`, exit 0. 260 text files read; no file names an unapproved model |

And on the pull request, [run
37778656947](https://github.com/build-once/team-tasks/actions/runs/37778656947), read with
`gh pr checks 224 --watch`: **all 16 checks pass, `required` included** — Guard self-test, Skills lint,
Launch check self-test, Workflow lint, Vet-tool self-test, Handoff self-test, Drift-check self-test,
Pure-function checks, Staging script self-tests, Edge function tests (Deno), `npm test` on
windows-latest and macos-latest, Secret scan (gitleaks), App build, App tests (access rules on staging),
and `required` in 3s.

**None of those checks tests this migration**, and that is worth saying rather than letting a green row
imply otherwise. Nothing in CI applies a migration or starts a database; what the green run establishes
is that **this change broke nothing that was already checked** — including `friendly-words-check`, which
reads two other migration files, and the Deno tests over the four Edge Functions, none of which has heard
of `usage_counts`. The proof of the migration itself is sections 3 to 10 of this file and lives nowhere
else.

---

## 12. Issues filed with this change

Three, all filed in this session, each saying what is wrong, where it is, why it matters and how we will
know it is fixed (rule 16):

| Issue | What it holds |
|---|---|
| [#221](https://github.com/build-once/team-tasks/issues/221) | **Build it 22, part 2**: `_shared/limits.ts`, the count at both call sites, and the refusal sentence. The control exists and is unused, which is why this one matters most |
| [#222](https://github.com/build-once/team-tasks/issues/222) | **Nothing in this repository can show the applied privileges.** The read-back to do on staging and on production after the apply, with the exact queries, and why a green workflow run is not it |
| [#223](https://github.com/build-once/team-tasks/issues/223) | **The 7-day window only sweeps people who come back.** The rows of somebody who stops using the app sit past the window, because the delete is scoped to the caller — stated in the migration's own comments and in section 8 |

And one comment, rather than a fourth issue, because an open issue already covers it:
[#217](https://github.com/build-once/team-tasks/issues/217#issuecomment-6060046876) — that file's two
table lists are now one further out of date, because this migration makes **seven** tables in
`supabase/migrations` (counted in this session with `grep -rn "^create table" supabase/migrations`:
`tasks`, `teams`, `invitations`, `team_members`, `profiles`, `account_status`, `usage_counts`).
`usage_counts` was deliberately **not** added to either list here, for the reason the comment gives:
#217 is what fixes both, and adding one row to one of them would have made them disagree in a new way.

---

## Appendix A. How to rebuild the whole thing

```
initdb -D <scratchpad>\pg22\pgdata -U postgres --auth=trust --encoding=UTF8
# then append to postgresql.conf:
#   port = 55434
#   listen_addresses = '127.0.0.1'
#   timezone = 'Pacific/Auckland'
#   log_min_messages = warning
pg_ctl -D <scratchpad>\pg22\pgdata -l <scratchpad>\pg22\pg.log -w start

node build.mjs sandbox_pre  00-standin.sql 01-old-defaults.sql <the nine existing migrations> 20261008115900_usage_counts.sql 90-seed.sql
node build.mjs sandbox_post 00-standin.sql                     <the nine existing migrations> 20261008115900_usage_counts.sql 90-seed.sql

node ask.mjs  sandbox_pre  10-privileges.sql
node ask.mjs  sandbox_post 10-privileges.sql
node ask.mjs  sandbox_pre  20-attack.sql
node ask.mjs  sandbox_post 20-attack.sql

node race.mjs sandbox_pre  count_daily_use 2  20 10
node race.mjs sandbox_pre  count_daily_use 2  20 10 plant-old-row
node race.mjs sandbox_post count_daily_use 20 40 5

node ask.mjs  sandbox_pre  30-wrong.sql
node race.mjs sandbox_pre  wrong_count_daily_use         2 20 10
node race.mjs sandbox_pre  wrong_count_daily_use_nosleep 2 20 10
```

The four helper scripts (`build.mjs`, `ask.mjs`, `capture.mjs`, `race.mjs`) and the five SQL files
(`00-standin.sql`, `01-old-defaults.sql`, `10-privileges.sql`, `20-attack.sql`, `30-wrong.sql`) lived in
the session's scratchpad and were **not** committed: they are a sandbox harness, not part of the app, and
the repository's precedent (`evidence/build-it-21-ai-consent-migration.md` appendix A) is to record them
in the evidence file rather than ship them. The two wrong counters in `30-wrong.sql` are quoted in
section 5; the rest are quoted in section 2 and in the commands above.

**The cluster was deleted at the end of the session.** Rebuilding it from the commands above and the
migrations in this repository is the way to check any line of this file.

---

## Appendix B. Record of the staging apply

**Filled in on 2026-10-08**, which is what this appendix was left empty for. The sentence it replaces
said "Empty. Nothing has been applied to staging." and stopped being true the same day.

**It is copied, not written.** What follows is the coach's comment on
[PR #224](https://github.com/build-once/team-tasks/pull/224), posted 2026-10-08 at 12:53:57Z, reproduced
in full. Its own first line asks for this: *"To be copied into the evidence file by the next pull
request."* This is that pull request
([#221](https://github.com/build-once/team-tasks/issues/221)'s), and the copy was made with
`gh pr view 224 --json comments`.

**NONE OF IT WAS DONE OR SEEN BY THE ASSISTANT.** The `db push` is the owner's, from their own terminal
(rule 19: `db push` is refused by the guard for the assistant, everywhere but `--local`). The read-back is
the coach's, through the staging read-only connector. Nobody writing this file opened a dashboard or a
terminal on staging, and the only thing the assistant did was read the comment off the pull request and
paste it here.

**Nothing in it is redacted, and that is a statement rather than an omission (rule 18).** It names a
project by role ("staging"), a CLI version, a migration file name, three Postgres role names and a count
of policies. No project reference, no key, no token, no address, no user id and no person's name appear in
it. There was nothing to replace, so the list of replacements is empty.

> **Record of the staging apply (coach, comment only), 8 Oct 2026.** To be copied into the evidence file
> by the next pull request. This also answers #222 for staging.
>
> - Owner agreed to the 7-day boundary as built (a row exactly seven days old is removed) by applying the
>   migration, 8 Oct.
> - Owner: `supabase db push` on staging from this branch, CLI 2.75.0. It listed one migration,
>   `20261008115900_usage_counts.sql`, and printed "Finished supabase db push."
> - Coach, staging read-only connector, afterwards: 10 migrations recorded, newest `20261008115900`;
>   `usage_counts` has row-level security on and 0 policies; `count_daily_use(uuid, text, integer)` is
>   security definer with an empty search path; 16 policies in `public`, unchanged.
> - Rights, by `has_table_privilege` and `has_function_privilege`:
>   - `anon`: no SELECT, INSERT, UPDATE or DELETE on the table; cannot run the function.
>   - `authenticated`: the same.
>   - `service_role`: no SELECT, INSERT, UPDATE or DELETE on the table; can run the function.
> - Not done on staging: any call to the function. Nothing uses it until part 2.
>
> Production: not applied; it follows through the pipeline after merge.

**What that record settles, and what it does not.** It settles the thing a green `db push` cannot: the
**privileges**, which are the half this feature's privacy rests on — `service_role` holding EXECUTE on
the function and **no** privilege on the table, so a server function can ask for one use and can neither
read which days somebody used this app nor reset a count. It does not settle any behaviour of the
counting on staging, because its own last bullet says so: **no call to the function has been made there.**

**And production.** The record's closing line was true when it was written and stopped being true minutes
later: PR #224 merged at 12:54:48Z and `.github/workflows/migrate-production.yml` applies migrations on a
merge to `main`. So production has the table too, by the pipeline rather than by anybody's hand. **What
nobody has read back off production is the privileges**, which on staging needed a connector read to
establish — so for production that half is **unverified**, and the way to settle it is the production
read-only connector, which is the coach's or the owner's and not the assistant's.
