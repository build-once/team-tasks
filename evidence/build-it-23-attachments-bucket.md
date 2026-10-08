# Evidence: Build it 23 part 1 — the `attachments` bucket and its rules (migration only)

Issue [#237](https://github.com/build-once/team-tasks/issues/237). Migration:
`supabase/migrations/20261008191804_attachments_bucket.sql`.

**Result: PASS on a local sandbox. NOT applied to staging. NOT applied to production.** Rule 19: the
assistant does not run `db push` anywhere, and the guard refuses every `db push` except `--local`. The
owner has not applied this migration, and was not asked to during this session.

Read from `origin/main` at commit **`944b2a4478bc9d8f0808f1fa57951129e590b166`** — "Merge pull request
#233 from build-once/docs/build-it-23-attachments-plan-229", committed 2026-10-08T19:05:08+01:00
(`git fetch origin` then `git log -1 --format=%H%n%s%n%cI`, run in this session). The branch is
`feat/build-it-23-attachments-bucket-237`, created from that commit.

**What was NOT done, stated before anything is claimed.** No MCP connector was used. No browser tool was
used. Nothing touched staging or production — no deploy, no secret, no query, no dashboard — so there is
no `evidence/production-log.md` entry to make. No screen, Edge Function, test or workflow was changed.
No file was uploaded to any Supabase project, and no bucket exists anywhere but in four throwaway local
databases. Level 2 was not used on this issue or its pull request.

**Everything in sections 3 to 9 was produced by the assistant on a throwaway PostgreSQL cluster on the
owner's machine.** That is not staging evidence and is not a substitute for it. Section 10 says exactly
what it therefore does not settle, and section 2's last paragraph says which parts of the sandbox are the
assistant's model of Supabase rather than Supabase.

---

## 1. What the migration is, in one table

| Piece | What it is |
|---|---|
| the bucket | one row in `storage.buckets`: `attachments`, **not public**, `file_size_limit` 5242880, `allowed_mime_types` `{image/*,application/pdf}` |
| `public.attachments_task_id(text)` | immutable. The task id read off the first segment of an object's name, or **NULL** — which is the one answer for a file at the bucket's top level, a file nested deeper, and a first segment that is not a uuid |
| `public.attachments_file_bytes(text)` | immutable. A stored object's size from `metadata ->> 'size'`, with **an unknown size counting as the bucket's 5 MB ceiling** rather than as zero |
| `public.attachments_lock_key(text, uuid)` | immutable. A bigint for an advisory lock. **No role may execute it** |
| `public.attachments_may_add(text, text)` | `security definer`. The two counted limits — **3 files per task, 100 MB per uploader** — with two transaction advisory locks so simultaneous uploads take turns |
| three policies on `storage.objects` | SELECT, INSERT, DELETE, each `to authenticated`, each scoped `bucket_id = 'attachments'`. **No UPDATE policy**: that absence is the "nobody may replace or rename" rule |
| `public.tasks_refuse_delete_with_files()` + its trigger | `before delete on public.tasks for each row`. Refuses to delete a task while any object remains under `attachments/<task id>/` — **whatever asked**, a cascade included |
| `grant select on table public.tasks to authenticated` | the one grant written on an existing object. It grants nothing today and is written because the three policies rest on it |

### The three rules, in plain English

The issue asks for a sentence per storage rule. These are the sentences, and they are in the migration's
own comments too:

- **SELECT** — *You can see, list and get a link for a file if you can see the task it is on, and you are
  not suspended.*
- **INSERT** — *You can attach a file to a task you can see, if you are not suspended, the row does not
  name somebody else as its uploader, the task has fewer than three files, and your own files come to
  under 100 MB.*
- **DELETE** — *You can delete a file if you can still see its task, you are not suspended, and either you
  uploaded it or you created the task.*
- **UPDATE** — *Nobody. There is no policy, so nothing can be replaced or renamed.*

### The correction to the issue, which this migration is built to

The issue says of DELETE: *"only the person who uploaded it, and only while they can still see the
task."* **The owner settled [#234](https://github.com/build-once/team-tasks/issues/234) on 2026-10-08
with a third answer** that both `docs/plan.md` and `docs/architecture.md` now carry: **a file may be
deleted by its uploader, or by the person who created its task — in both cases only while they can still
see the task.** Section 6 is that rule attacked, and 6.2 is the case the issue's wording would have
refused.

---

## 2. The sandbox

PostgreSQL **17.10**, a cluster created by the assistant with `initdb` in its scratchpad, listening on
`127.0.0.1` port **55435** only, trust authentication, deleted at the end of the session. It is **not**
the version either project runs: `evidence/build-it-16-suspend-accounts.md` records the owner reporting
staging on PostgreSQL **17.6**, and production's version is still unverified.

```
> & "C:\Program Files\PostgreSQL\17\bin\psql.exe" "postgresql://postgres@127.0.0.1:55435/postgres" -c "select version(), current_setting('TimeZone') as tz, current_setting('max_connections') as maxconn"

                                 version                                  |      tz       | maxconn
--------------------------------------------------------------------------+---------------+---------
 PostgreSQL 17.10 on x86_64-windows, compiled by msvc-19.44.35226, 64-bit | Europe/London | 200
(1 row)
```

### Four databases, each differing in one thing

| Database | What it models |
|---|---|
| `sandbox_pre` | a project **before** 30 October 2026: `alter default privileges in schema public grant all on tables / grant execute on functions to anon, authenticated, service_role` is applied before the migrations. The main run |
| `sandbox_post` | a project **after** it (changelog 45329): those two lines absent, nothing else different |
| `sandbox_owneruuid` | identical to `sandbox_pre` except that `storage.objects.owner_id` is **uuid** rather than text. No Supabase page read states that column's type, so both are built |
| `sandbox_nolock` | identical to `sandbox_pre`, then the shipped INSERT policy is dropped and recreated naming a copy of the limit function **with the two advisory-lock lines removed**. This is the version that must fail |

### The stand-in, and the honest part

Supabase's `auth` and `storage` schemas do not exist in a plain cluster. The `auth` half is the same
four-line stand-in `evidence/build-it-16-suspend-accounts.md`, `evidence/build-it-18-invitation-status.md`
and `evidence/build-it-22-usage-counts.md` use: a `users` table and an `auth.uid()` that reads a session
setting instead of a JWT.

The `storage` half is new, and this is the whole of it:

```sql
create schema storage;

create table storage.buckets (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb,
  path_tokens text[],
  version text,
  owner_id text,
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
```

**THE COLUMN LISTS ARE SUPABASE'S; EVERY TYPE IS THE ASSISTANT'S.**
[The Storage Schema](https://supabase.com/docs/guides/storage/schema/design) (read 2026-10-08) gives the
column names and not one type, so each type above is chosen from how the migration and the documentation
use the column. `owner_id` is text here because Supabase's own policy example compares it with
`(select auth.uid()::text)`; `sandbox_owneruuid` makes it uuid, and section 9.2 is the two runs compared.

**The table privileges are granted WIDE on purpose.** The migration deliberately writes no grant on
`storage.objects` — it is a Supabase-managed table — so those grants are part of the model, and they are
`select, insert, update, delete` for all three roles so that anything the policies let through must be the
policies doing it and not a missing privilege hiding a hole.

**`service_role` has `bypassrls`, because Supabase's does.** That matters more here than in any earlier
evidence file, because section 8.3 turns on it: it is what makes "a policy would not have stopped this"
a demonstrated fact rather than an argument.

### And the one thing without which the proof would be vacuous

`01-old-defaults.sql`, applied to `sandbox_pre`, `sandbox_owneruuid` and `sandbox_nolock` only:

```sql
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
```

Without it a plain cluster grants `anon` and `authenticated` nothing on a new table or function, so every
"revoked" result below would be a pass with nothing to revoke — which AGENTS.md rule 8 calls
**unverified**, not a pass. Section 3's block A is the control that shows it took.

### The seed

Five accounts with fixed ids, so the output reads without a lookup table. Fake addresses on
`example.com`; **no real person's data is used** (rule 6).

| | Who |
|---|---|
| alice `1111…` | owns team "Tuesday crew" and five of the eight tasks |
| bob `2222…` | the outsider: in no team of Alice's, one personal task with one file |
| carol `3333…` | a member of the team |
| dave `4444…` | a member of the team, and **suspended** (a row in `account_status`) |
| erin `5555…` | one personal task holding **100,857,600** bytes, so **4,000,000** of her 104,857,600 are left |

Thirteen objects in `attachments` and one in a second bucket called `other`, all written by `postgres` —
the operator — because nothing in the app can upload and because that is the only way to choose
`owner_id`. Four of them are **deliberately malformed**, and all four are owned by Alice so that the
refusals below cannot be explained by whose they are: one at the bucket's top level
(`top-level.png`), one nested a folder deeper, one under a task id that does not exist, and one whose
first segment is not a uuid. The object in `other` sits at a path Alice **can** see in `attachments`, so
if it ever appears in her results the `bucket_id` condition is not working.

---

## 3. The migration applies cleanly, and the shape it leaves

Every file in order with `ON_ERROR_STOP=1`, so a warning-free run means every statement succeeded. The
last migration in the list is the new one.

```
> node build.mjs sandbox_pre 00-standin.sql 01-old-defaults.sql <the eleven existing migrations> 20261008191804_attachments_bucket.sql 90-seed.sql

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
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20261008191804_attachments_bucket.sql ===
exit=0
=== psql -f 90-seed.sql ===
exit=0
BUILT sandbox_pre from 14 files
```

### THE FIRST RUN FAILED, AND IT IS THE REASON THIS SECTION EXISTS

The very first build of this migration printed one thing the final one does not:

```
=== psql -f C:\Users\rajdh\team-tasks\supabase\migrations\20261008191804_attachments_bucket.sql ===
psql:...:762: NOTICE:  identifier "Attachments: delete a file you attached, or one on a task you created" will be truncated to "Attachments: delete a file you attached, or one on a task you c"
exit=0
```

A policy name is a PostgreSQL identifier and is cut at **63 bytes**. The DELETE policy's first name was
69, so the database would have held a name this repository does not contain, and any later
`drop policy` by the written name would have failed. **`exit=0` — it is a NOTICE, not an error**, and a
migration applied with `-q` would not have shown it at all. The policy is now named
`Attachments: delete a file you attached, or one on your task` (60 characters), the whole sentence lives
in the comment above it where nothing can cut it, and `10-shape.sql` block C now counts the names that
are too long, so the next person cannot reintroduce it quietly.

### The bucket, as built

```
┌─────────────┬─────────────┬────────┬─────────────────┬───────────────────────────┐
│     id      │    name     │ public │ file_size_limit │    allowed_mime_types     │
├─────────────┼─────────────┼────────┼─────────────────┼───────────────────────────┤
│ attachments │ attachments │ f      │         5242880 │ {image/*,application/pdf} │
│ other       │ other       │ f      │          (null) │ (null)                    │
└─────────────┴─────────────┴────────┴─────────────────┴───────────────────────────┘
(2 rows)

┌─────────┬────────────┐
│ five_mb │ hundred_mb │
├─────────┼────────────┤
│ 5242880 │  104857600 │
└─────────┴────────────┘
(1 row)
```

`public` is **f**. The two numbers are MiB, and section 1 of the migration says why: `docs/plan.md`'s own
"100 MB is 20 single 5 MB files" only adds up if both use one unit.

### The sandbox is honest

```
┌─────────────┬────────────────────┬────────────────────┬───────────────────┬──────────────────────┬───────────────┐
│  database   │ authd_select_tasks │ authd_delete_tasks │ anon_select_tasks │ authd_insert_objects │ svc_bypassrls │
├─────────────┼────────────────────┼────────────────────┼───────────────────┼──────────────────────┼───────────────┤
│ sandbox_pre │ t                  │ t                  │ t                 │ t                    │ t             │
└─────────────┴────────────────────┴────────────────────┴───────────────────┴──────────────────────┴───────────────┘
(1 row)
```

`public.tasks` is the control: **no migration in this repository granted a privilege on it before this
one**, so `authenticated` holding `delete` there, and `anon` holding `select`, is the project default at
work. Section 9.1 is the same row from `sandbox_post`, where both are `f`.

### The three policies, and the absent fourth

```
┌──────────────────────────────────────────────────────────────┬─────────────┬─────────┬────────────┬─────────────────┐
│                           polname                            │ name_length │ command │ permissive │      roles      │
├──────────────────────────────────────────────────────────────┼─────────────┼─────────┼────────────┼─────────────────┤
│ Attachments: attach a file to a task you can see             │          48 │ INSERT  │ t          │ {authenticated} │
│ Attachments: delete a file you attached, or one on your task │          60 │ DELETE  │ t          │ {authenticated} │
│ Attachments: read a file on a task you can see               │          46 │ SELECT  │ t          │ {authenticated} │
└──────────────────────────────────────────────────────────────┴─────────────┴─────────┴────────────┴─────────────────┘
(3 rows)

┌────────────────────────┐
│ policies_over_63_chars │
├────────────────────────┤
│                      0 │
└────────────────────────┘
(1 row)

┌─────────┬─────────────┬────────────┐
│ relname │ rls_enabled │ rls_forced │
├─────────┼─────────────┼────────────┤
│ buckets │ t           │ f          │
│ objects │ t           │ f          │
└─────────┴─────────────┴────────────┘
(2 rows)
```

Three policies, **no UPDATE row**, every one of them `{authenticated}` and none naming `anon`.

### The five functions, and who may run them

```
┌────────────────────────────────┬──────────────────────────┬──────────────────┬────────────┬──────────────────────┐
│            proname             │        arguments         │ security_definer │ volatility │       settings       │
├────────────────────────────────┼──────────────────────────┼──────────────────┼────────────┼──────────────────────┤
│ attachments_file_bytes         │ p_size text              │ f                │ i          │ {"search_path=\"\""} │
│ attachments_lock_key           │ p_kind text, p_id uuid   │ f                │ i          │ {"search_path=\"\""} │
│ attachments_may_add            │ p_name text, p_size text │ t                │ v          │ {"search_path=\"\""} │
│ attachments_task_id            │ p_name text              │ f                │ i          │ {"search_path=\"\""} │
│ tasks_refuse_delete_with_files │                          │ t                │ v          │ {"search_path=\"\""} │
└────────────────────────────────┴──────────────────────────┴──────────────────┴────────────┴──────────────────────┘
(5 rows)

┌─────────────────────────────────────────┬───────────────┬─────────┐
│                  name                   │     role      │ execute │
├─────────────────────────────────────────┼───────────────┼─────────┤
│ public.attachments_file_bytes(text)     │ anon          │ f       │
│ public.attachments_file_bytes(text)     │ authenticated │ t       │
│ public.attachments_file_bytes(text)     │ service_role  │ t       │
│ public.attachments_lock_key(text, uuid) │ anon          │ f       │
│ public.attachments_lock_key(text, uuid) │ authenticated │ f       │
│ public.attachments_lock_key(text, uuid) │ service_role  │ f       │
│ public.attachments_may_add(text, text)  │ anon          │ f       │
│ public.attachments_may_add(text, text)  │ authenticated │ t       │
│ public.attachments_may_add(text, text)  │ service_role  │ t       │
│ public.attachments_task_id(text)        │ anon          │ f       │
│ public.attachments_task_id(text)        │ authenticated │ t       │
│ public.attachments_task_id(text)        │ service_role  │ t       │
│ public.tasks_refuse_delete_with_files() │ anon          │ f       │
│ public.tasks_refuse_delete_with_files() │ authenticated │ f       │
│ public.tasks_refuse_delete_with_files() │ service_role  │ f       │
└─────────────────────────────────────────┴───────────────┴─────────┘
(15 rows)

┌────────────────────────────────┬────────────────────────────────────────────────────────────────────────┐
│            proname             │                            function_grants                             │
├────────────────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ attachments_file_bytes         │ {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} │
│ attachments_lock_key           │ {postgres=X/postgres}                                                  │
│ attachments_may_add            │ {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} │
│ attachments_task_id            │ {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} │
│ tasks_refuse_delete_with_files │ {postgres=X/postgres}                                                  │
└────────────────────────────────┴────────────────────────────────────────────────────────────────────────┘
(5 rows)
```

**No `=X/postgres` entry anywhere**, so PUBLIC holds EXECUTE on none of the five. `anon` is `f` on all
five. `attachments_lock_key` is `postgres` alone, which is what it should be — it exists only to be
called from inside a `security definer` function, so the app needs no grant at all.

**And this is the second thing a run caught.** The first version of this migration revoked EXECUTE on the
trigger function from `public` alone, copying `20261002133637_tasks_join_teams.sql`. The read-back showed
what that leaves behind:

```
│ tasks_refuse_delete_with_files │ {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres} │
```

`anon`, `authenticated` and `service_role` still holding it, because Supabase grants EXECUTE on new
functions to those three **by name** and a revoke from PUBLIC does not touch a grant made by name. It is
harmless — a trigger function cannot be called directly — but a grant nobody can use is still a grant
somebody has to work out is harmless, so all four revokes are now written. **Section 8.8 is the check
that the trigger still fires with every one of them gone**, which is the question that had to be answered
before taking them away.

### The trigger, beside the one that was already there

```
┌────────────────────────────────┬────────┬───────┬───────────────┬───────────┐
│             tgname             │ timing │ level │    events     │ tgenabled │
├────────────────────────────────┼────────┼───────┼───────────────┼───────────┤
│ tasks_enforce_column_rules     │ BEFORE │ ROW   │ insert update │ O         │
│ tasks_refuse_delete_with_files │ BEFORE │ ROW   │ delete        │ O         │
└────────────────────────────────┴────────┴───────┴───────────────┴───────────┘
(2 rows)
```

`insert update` and `delete`: the two never fire on the same statement, so there is no order between them
to get right.

### Expand only, checked rather than asserted

```
┌──────────────┬──────────┐
│  table_name  │ policies │
├──────────────┼──────────┤
│ invitations  │        2 │
│ profiles     │        4 │
│ tasks        │        5 │
│ team_members │        3 │
│ teams        │        2 │
└──────────────┴──────────┘
(5 rows)

┌──────────────────────────────────────────────────────────────┬─────────┬────────────┐
│                           polname                            │ command │ permissive │
├──────────────────────────────────────────────────────────────┼─────────┼────────────┤
│ Creators and team members can change a task                  │ UPDATE  │ t          │
│ Creators and team members can read a task                    │ SELECT  │ t          │
│ Owners can remove their own tasks                            │ DELETE  │ t          │
│ Suspended accounts are refused everything                    │ ALL     │ f          │
│ You can add a task for yourself, or for a team you belong to │ INSERT  │ t          │
└──────────────────────────────────────────────────────────────┴─────────┴────────────┘
(5 rows)
```

Sixteen policies in `public`, which is the number the coach read back off staging on 8 October 2026
(`evidence/build-it-22-usage-counts.md` appendix B: "16 policies in `public`, unchanged"). This migration
adds **none** of them and drops none: its three policies are on `storage.objects`. `public.tasks` keeps
its five, unaltered.

### The three small functions, value by value

`attachments_task_id`, which is the whole of "nothing at the bucket's top level" and "nothing nested":

```
┌──────────────────────────────────────────────────────┬──────────────────────────────────────┬──────────────────────────┐
│                         name                         │               task_id                │           why            │
├──────────────────────────────────────────────────────┼──────────────────────────────────────┼──────────────────────────┤
│ aaaa0000-0000-4000-8000-000000000002/carol-photo.jpg │ aaaa0000-0000-4000-8000-000000000002 │ well formed              │
│ AAAA0000-0000-4000-8000-000000000002/capitals.jpg    │ aaaa0000-0000-4000-8000-000000000002 │ well formed, capitals    │
│ top-level.png                                        │ (null)                               │ at the bucket top level  │
│ aaaa0000-0000-4000-8000-000000000002/sub/deep.png    │ (null)                               │ nested deeper            │
│ aaaa0000-0000-4000-8000-000000000002//double.png     │ (null)                               │ empty middle segment     │
│ aaaa0000-0000-4000-8000-000000000002/                │ (null)                               │ no file name             │
│ aaaa0000-0000-4000-8000-000000000002/                │ (null)                               │ blank file name          │
│ not-a-uuid/x.png                                     │ (null)                               │ first part is not a uuid │
│ 99999999-9999-4999-8999-999999999999/ghost.png       │ 99999999-9999-4999-8999-999999999999 │ a uuid, but no such task │
│ /leading-slash.png                                   │ (null)                               │ leading slash            │
│                                                      │ (null)                               │ empty name               │
│ (null)                                               │ (null)                               │ null name                │
└──────────────────────────────────────────────────────┴──────────────────────────────────────┴──────────────────────────┘
(12 rows)
```

**Nothing raised.** `not-a-uuid` and the empty string come back NULL rather than throwing, which is the
point: a cast would have raised, and an error inside a policy aborts the statement and tells whoever is
probing that their path was malformed rather than unknown. The made-up uuid comes back as a uuid — it is
well formed, and it is the `exists` on `public.tasks` that refuses it, which is how a made-up task id is
refused *exactly like a task that does not exist*.

`attachments_file_bytes`, where an unknown size is never a zero:

```
┌──────────────────────┬────────────┐
│      size_text       │ counted_as │
├──────────────────────┼────────────┤
│ 1000                 │       1000 │
│ 0                    │          0 │
│ 5242880              │    5242880 │
│                      │    5242880 │
│                      │    5242880 │
│ 1e6                  │    5242880 │
│ -5                   │    5242880 │
│ 12.5                 │    5242880 │
│ 99999999999999999999 │    5242880 │
│ drop table tasks     │    5242880 │
│ (null)               │    5242880 │
└──────────────────────┴────────────┘
(11 rows)
```

`attachments_lock_key`, which is the one expression in this migration **confirmed by a run rather than by
a documentation page** — PostgreSQL documents the `B'1010'` and `X'1FF'` literal forms for bit strings,
not a cast of ordinary text beginning `x`:

```
┌──────────────────────┬──────────────────────┬────────┬────────────┐
│       task_key       │     uploader_key     │ stable │ namespaced │
├──────────────────────┼──────────────────────┼────────┼────────────┤
│ -9218668596223294593 │ -8302107674728619860 │ t      │ t          │
└──────────────────────┴──────────────────────┴────────┴────────────┘
(1 row)
```

Negative is fine — an advisory lock key is a number. `stable` is the same input twice; `namespaced` is
the same uuid under the two different kinds.

---

## 4. The delegation: `tasks`' own rules filter the subquery

Everything in sections 5 to 7 follows from this, because the storage rules **ask** "may this person see
this task" rather than answering it a second time.

```
############################################################
# 1. THE DELEGATION: tasks RLS filters the subquery
############################################################

│ alice │             6 │
│ bob   │             1 │
│ carol │             4 │
│ dave (suspended) │  0 │
│ erin  │             1 │
│ anon  │             0 │
```

*(Six one-row tables, collapsed into one block here; the `who`/`tasks_visible` headers are as printed.)*

Alice sees six of the eight tasks: her own five, and Carol's team task. Bob sees one — his own. Carol
sees four: the three of Alice's that are in the team, and her own. **Dave sees none, although he is in
the team**, because he is suspended. `anon` sees none.

---

## 5. SELECT — what each caller sees, in every bucket

No bucket filter in these queries on purpose. The `other` bucket holds an object at
`aaaa0000-…-000000000002/elsewhere.png` — a path Alice **can** see in `attachments` — so if it ever
appears below, the `bucket_id` condition in the policies is not doing its job.

```
-- 2.1 the operator (postgres), for reference: everything there is
┌─────────────┬──────────────────────────────────────────────────────┬──────────────────────────────────────┐
│  bucket_id  │                         name                         │               owner_id               │
├─────────────┼──────────────────────────────────────────────────────┼──────────────────────────────────────┤
│ attachments │ 99999999-9999-4999-8999-999999999999/ghost.png       │ 11111111-1111-1111-1111-111111111111 │
│ attachments │ aaaa0000-0000-4000-8000-000000000001/alice-note.pdf  │ 11111111-1111-1111-1111-111111111111 │
│ attachments │ aaaa0000-0000-4000-8000-000000000002/carol-photo.jpg │ 33333333-3333-3333-3333-333333333333 │
│ attachments │ aaaa0000-0000-4000-8000-000000000002/dave-photo.jpg  │ 44444444-4444-4444-4444-444444444444 │
│ attachments │ aaaa0000-0000-4000-8000-000000000002/sub/deep.png    │ 11111111-1111-1111-1111-111111111111 │
│ attachments │ aaaa0000-0000-4000-8000-000000000004/one.png         │ 11111111-1111-1111-1111-111111111111 │
│ attachments │ aaaa0000-0000-4000-8000-000000000004/three.png       │ 11111111-1111-1111-1111-111111111111 │
│ attachments │ aaaa0000-0000-4000-8000-000000000004/two.png         │ 11111111-1111-1111-1111-111111111111 │
│ attachments │ bbbb0000-0000-4000-8000-000000000001/bob-photo.jpg   │ 22222222-2222-2222-2222-222222222222 │
│ attachments │ cccc0000-0000-4000-8000-000000000001/carol-own.jpg   │ 33333333-3333-3333-3333-333333333333 │
│ attachments │ eeee0000-0000-4000-8000-000000000001/big.pdf         │ 55555555-5555-5555-5555-555555555555 │
│ attachments │ not-a-uuid/x.png                                     │ 11111111-1111-1111-1111-111111111111 │
│ attachments │ top-level.png                                        │ 11111111-1111-1111-1111-111111111111 │
│ other       │ aaaa0000-0000-4000-8000-000000000002/elsewhere.png   │ 11111111-1111-1111-1111-111111111111 │
└─────────────┴──────────────────────────────────────────────────────┴──────────────────────────────────────┘
(14 rows)

-- 2.2 as ALICE
┌─────────────┬──────────────────────────────────────────────────────┐
│  bucket_id  │                         name                         │
├─────────────┼──────────────────────────────────────────────────────┤
│ attachments │ aaaa0000-0000-4000-8000-000000000001/alice-note.pdf  │
│ attachments │ aaaa0000-0000-4000-8000-000000000002/carol-photo.jpg │
│ attachments │ aaaa0000-0000-4000-8000-000000000002/dave-photo.jpg  │
│ attachments │ aaaa0000-0000-4000-8000-000000000004/one.png         │
│ attachments │ aaaa0000-0000-4000-8000-000000000004/three.png       │
│ attachments │ aaaa0000-0000-4000-8000-000000000004/two.png         │
│ attachments │ cccc0000-0000-4000-8000-000000000001/carol-own.jpg   │
└─────────────┴──────────────────────────────────────────────────────┘
(7 rows)

-- 2.3 as BOB, the outsider
┌─────────────┬────────────────────────────────────────────────────┐
│  bucket_id  │                        name                        │
├─────────────┼────────────────────────────────────────────────────┤
│ attachments │ bbbb0000-0000-4000-8000-000000000001/bob-photo.jpg │
└─────────────┴────────────────────────────────────────────────────┘
(1 row)

-- 2.4 as CAROL, a team member
┌─────────────┬──────────────────────────────────────────────────────┐
│  bucket_id  │                         name                         │
├─────────────┼──────────────────────────────────────────────────────┤
│ attachments │ aaaa0000-0000-4000-8000-000000000002/carol-photo.jpg │
│ attachments │ aaaa0000-0000-4000-8000-000000000002/dave-photo.jpg  │
│ attachments │ aaaa0000-0000-4000-8000-000000000004/one.png         │
│ attachments │ aaaa0000-0000-4000-8000-000000000004/three.png       │
│ attachments │ aaaa0000-0000-4000-8000-000000000004/two.png         │
│ attachments │ cccc0000-0000-4000-8000-000000000001/carol-own.jpg   │
└─────────────┴──────────────────────────────────────────────────────┘
(6 rows)

-- 2.5 as DAVE, a team member who is SUSPENDED
(0 rows)

-- 2.6 as ANON, signed out
(0 rows)
```

**Alice's list is seven of the fourteen, and what is missing from it is the whole proof.** She owns all
four malformed objects and sees **none** of them. She cannot see Bob's or Erin's. She cannot see the
object in `other`, at a path she can see in `attachments`. Carol sees six — not Alice's personal task's
file. Dave sees nothing although one of the files is one he uploaded himself.

And the signed-link case, which is one object asked for by name:

```
-- 2.7 Bob asks for a real file of Alice's, then for a made-up task id
┌───────────────────────┐        ┌────────────────────────────┐
│ a_real_task_of_alices │        │ a_task_that_does_not_exist │
├───────────────────────┤        ├────────────────────────────┤
│                     0 │        │                          0 │
└───────────────────────┘        └────────────────────────────┘
```

**Both zero, and zero in the same way** — no error distinguishes them. That is the issue's "a path whose
first part is not the ID of a task the caller can see is refused exactly like a task that does not
exist", and creating a signed URL is a read, so this is what refuses the link.

---

## 6. INSERT, UPDATE and DELETE, attacked as six callers

The run's own labels are kept. `BEGIN`/`SET`/`ROLLBACK` lines are removed where they say nothing;
every `INSERT 0 1`, `UPDATE 0`, `DELETE 0`, `DELETE 1` and `ERROR` is as printed.

### 6.1 INSERT

```
-- 3.1 ALICE onto her own EMPTY team task: allowed
INSERT 0 1

-- 3.2 BOB onto ALICE'S team task: refused
ERROR:  new row violates row-level security policy for table "objects"

-- 3.3 BOB onto his own personal task: allowed
INSERT 0 1

-- 3.4 CAROL onto ALICE'S team task: allowed, she is in the team
INSERT 0 1

-- 3.5 CAROL onto ALICE'S PERSONAL task: refused
ERROR:  new row violates row-level security policy for table "objects"

-- 3.6 DAVE, suspended, onto the team task he can otherwise see: refused
ERROR:  new row violates row-level security policy for table "objects"

-- 3.7 ANON, signed out: refused
ERROR:  new row violates row-level security policy for table "objects"

-- 3.8 ALICE, naming CAROL as the uploader of her own file: refused
ERROR:  new row violates row-level security policy for table "objects"

-- 3.9 ALICE, with no uploader at all: ALLOWED, and this is the deliberate hole
INSERT 0 1

-- 3.10a at the bucket top level
ERROR:  new row violates row-level security policy for table "objects"
-- 3.10b one folder deeper
ERROR:  new row violates row-level security policy for table "objects"
-- 3.10c a made-up task id
ERROR:  new row violates row-level security policy for table "objects"
-- 3.10d a first part that is not a uuid at all
ERROR:  new row violates row-level security policy for table "objects"

-- 3.11 ALICE into the OTHER bucket, at a path she can see in attachments: refused
ERROR:  new row violates row-level security policy for table "objects"
```

**3.8 and 3.9 are the pair worth reading together.** A row may not name somebody else as its uploader —
that would hand them a deletion right and spend their 100 MB — but a row with **no** uploader is
accepted, because it is NOT CONFIRMED whether Supabase has filled `owner_id` in by the time a policy's
`with check` runs, and a strict pin would refuse every upload if it has not. The cost of the hole is
stated in section 10.

**3.10 needed four separate transactions**, which is itself a thing a run taught: the first refusal
aborts the transaction, so running all four in one produced `current transaction is aborted, commands
ignored` for the other three and proved nothing about them.

### 6.2 UPDATE — replace or rename: nobody

```
-- 4.1 Alice renames her own file (which would MOVE it to another task)
UPDATE 0
-- 4.2 Alice replaces the bytes under her own file
UPDATE 0
-- 4.3 Alice makes herself the uploader of Dave's file
UPDATE 0
-- 4.4 Carol replaces her own file
UPDATE 0
```

Four `UPDATE 0` and no error, which is what row-level security does with an update no policy permits.
**4.1 is the one that matters most**: `name` is where the task id lives, so a permitted rename would be a
permitted move of a file from one task to another, past every rule in this migration.

### 6.3 DELETE — the owner's correction, attacked

```
-- 5.1 CAROL deletes the file SHE uploaded onto Alice's team task: allowed, she is the uploader
DELETE 1

-- 5.2 ALICE deletes the file CAROL uploaded onto Alice's team task: allowed, she created the task
DELETE 1

-- 5.3 CAROL deletes DAVE'S file on Alice's team task: REFUSED
DELETE 0

-- 5.4 ALICE deletes a file on her OWN task that Dave uploaded: allowed
DELETE 1

-- 5.5 ALICE deletes BOB'S file on BOB'S personal task: refused
DELETE 0

-- 5.6 BOB deletes ALICE'S file: refused
DELETE 0

-- 5.7 DAVE, suspended, deletes the file HE uploaded: refused
DELETE 0

-- 5.8 ANON deletes anything (no WHERE on the name at all): refused
DELETE 0

-- 5.9 "ONLY WHILE THEY CAN STILL SEE THE TASK"
UPDATE 1      <- Alice moves her team task to personal, which she may
DELETE 0      <- Carol, who uploaded a file on it, no longer can
DELETE 1      <- Alice, its creator, still can

-- 5.10 the four malformed paths, as the Alice who owns every one of them
DELETE 0
DELETE 0
DELETE 0
DELETE 0
DELETE 0      <- and the other bucket
```

**5.2 is the owner's correction and the issue as written would have refused it.** **5.3 is the
protection that survives it**: Carol is in the team, can see the task and can open Dave's file, and
cannot delete it — "anyone who can see the task" would have let her. **5.7 is `docs/plan.md` in as many
words**: "A suspended person cannot delete their own attachments either." **5.9 is the owner's "only
while they can still see the task", and it bites on the uploader rather than the creator**, because a
task's creator can always see their own task.

**5.10 is a consequence worth naming rather than discovering**: an object whose path the rules cannot
place is an object **only the operator can remove**. Nothing in the app can create one, and the operator
in the dashboard is the answer if one ever appears.

---

## 7. The two counted limits

### 7.1 Three files per task

```
-- 6.1 the task with two files: Carol adds a third, then a fourth in the same transaction
INSERT 0 1
ERROR:  new row violates row-level security policy for table "objects"

-- 6.2 the task that already has three: its own creator, who uploaded all three, is refused
ERROR:  new row violates row-level security policy for table "objects"

-- 6.3 the limit is PER TASK: Alice may still add to a different task of hers
INSERT 0 1

-- 6.4 and a person nowhere near their own 100 MB is still refused on a full task
ERROR:  new row violates row-level security policy for table "objects"
```

6.1's second insert is in the **same transaction** as the first, which is how it shows that the count
sees a file the caller has just added and not yet committed.

### 7.2 One hundred megabytes per uploader

```
┌─────────────────┬─────────────────┐
│ erin_bytes_used │ erin_bytes_left │
├─────────────────┼─────────────────┤
│       100857600 │         4000000 │
└─────────────────┴─────────────────┘

-- 7.1 a file with NO size recorded: refused, an unknown size counts as 5,242,880
ERROR:  new row violates row-level security policy for table "objects"

-- 7.2 a 5,000,000 byte file: refused
ERROR:  new row violates row-level security policy for table "objects"

-- 7.3 exactly 4,000,000: allowed, it fits to the byte
INSERT 0 1
-- and 4,000,001:
ERROR:  new row violates row-level security policy for table "objects"

-- 7.4 the total is PER UPLOADER: Alice, with room, may add 5,242,880
INSERT 0 1

-- 7.5 and it cannot be asked about anybody else
┌──────┬─────────┐      ┌───────┬─────────┐
│ who  │ may_add │      │  who  │ may_add │
├──────┼─────────┤      ├───────┼─────────┤
│ erin │ f       │      │ alice │ t       │
└──────┴─────────┘      └───────┴─────────┘
```

**7.3 is the limit to the byte**: 4,000,000 in and 4,000,001 out. **7.5 is the same call with the same
arguments, answered about whoever is asking** — `attachments_may_add` takes no user id, so a signed-in
person cannot ask it about somebody else's total, which is the shape `is_active()` and
`my_ai_suggestions()` already use in this schema.

### 7.3 Two uploads at the same moment

The issue: *"Two uploads at the same moment must not both pass a limit with room for one; say how, or say
what the limit cannot guarantee."* **This is the how.**

A count inside a `with check` is a read followed by a write, and there is no single-statement trick
available — unlike `usage_counts`, the two uploads are inserting **different rows** and so have no key to
conflict on. So `attachments_may_add` takes two transaction advisory locks, task before uploader, and the
second upload waits for the first to commit before counting.

**How "at the same moment" is arranged.** Twenty `psql` processes started one after another take tens of
milliseconds each to connect while the statement takes well under one, so without a barrier they queue up
and even a broken limit looks correct. A coordinator session holds advisory lock 999 in **exclusive** mode
for three seconds; every worker asks for the same lock in **shared** mode and blocks; when the
coordinator's session ends they are woken together. Each worker prints `clock_timestamp()` the moment it
is through, and the spread between first and last is reported — that number is what says whether a round
was a race or a queue. Lock 999 is session-scoped and is a different key from the hashed,
transaction-scoped ones the function takes, so the barrier cannot stand in for the thing being tested.

Workers `set role authenticated` and set Alice's uid, so the insert goes through the shipped policy.

```
> node race.mjs sandbox_pre 20 10

race: db=sandbox_pre workers=20 rounds=10 limit=3 (the migration's own number)
insert policy: Attachments: attach a file to a task you can see

round  1: allowed=3 refused=17 other=0 files_on_task=3 barrier_spread_ms=12.074  ok
round  2: allowed=3 refused=17 other=0 files_on_task=3 barrier_spread_ms=9.353  ok
round  3: allowed=3 refused=17 other=0 files_on_task=3 barrier_spread_ms=5.480  ok
round  4: allowed=3 refused=17 other=0 files_on_task=3 barrier_spread_ms=11.964  ok
round  5: allowed=3 refused=17 other=0 files_on_task=3 barrier_spread_ms=11.284  ok
round  6: allowed=3 refused=17 other=0 files_on_task=3 barrier_spread_ms=5.398  ok
round  7: allowed=3 refused=17 other=0 files_on_task=3 barrier_spread_ms=12.632  ok
round  8: allowed=3 refused=17 other=0 files_on_task=3 barrier_spread_ms=3.587  ok
round  9: allowed=3 refused=17 other=0 files_on_task=3 barrier_spread_ms=4.979  ok
round 10: allowed=3 refused=17 other=0 files_on_task=3 barrier_spread_ms=4.059  ok

worst round left 3 files on a task whose limit is 3.
VERDICT: the limit held in every round.
```

And forty callers, on the final build of the migration:

```
> node race.mjs sandbox_pre 40 5

round  1: allowed=3 refused=37 other=0 files_on_task=3 barrier_spread_ms=36.543  ok
round  2: allowed=3 refused=37 other=0 files_on_task=3 barrier_spread_ms=34.447  ok
round  3: allowed=3 refused=37 other=0 files_on_task=3 barrier_spread_ms=34.362  ok
round  4: allowed=3 refused=37 other=0 files_on_task=3 barrier_spread_ms=24.889  ok
round  5: allowed=3 refused=37 other=0 files_on_task=3 barrier_spread_ms=31.353  ok

worst round left 3 files on a task whose limit is 3.
VERDICT: the limit held in every round.
```

**Exactly three in every round, and `other=0` every round — no deadlock and no serialization failure**,
which is the thing two locks taken by many callers could have produced. `files_on_task` is read back by
the harness as `postgres` after the round, so it is the table's own count and not a sum of what the
workers reported.

### 7.4 THE SAME TEST, SEEN TO FAIL

`sandbox_nolock` is built from the same stand-in and the same twelve migrations, and then one thing is
changed: the shipped INSERT policy is dropped and recreated naming a copy of the limit function with the
**two `pg_advisory_xact_lock` lines removed**. Everything else about that copy is identical — `security
definer`, `set search_path`, the same two counts, the same `name <> p_name` exclusion, the same numbers,
the same fail-closed answers.

```
> node race.mjs sandbox_nolock 20 10

race: db=sandbox_nolock workers=20 rounds=10 limit=3 (the migration's own number)
insert policy: Attachments: attach a file to a task you can see

round  1: allowed=5 refused=15 other=0 files_on_task=5 barrier_spread_ms=8.369  OVER THE LIMIT
round  2: allowed=20 refused=0 other=0 files_on_task=20 barrier_spread_ms=7.963  OVER THE LIMIT
round  3: allowed=14 refused=6 other=0 files_on_task=14 barrier_spread_ms=11.973  OVER THE LIMIT
round  4: allowed=20 refused=0 other=0 files_on_task=20 barrier_spread_ms=5.521  OVER THE LIMIT
round  5: allowed=16 refused=4 other=0 files_on_task=16 barrier_spread_ms=17.851  OVER THE LIMIT
round  6: allowed=11 refused=9 other=0 files_on_task=11 barrier_spread_ms=8.489  OVER THE LIMIT
round  7: allowed=19 refused=1 other=0 files_on_task=19 barrier_spread_ms=12.640  OVER THE LIMIT
round  8: allowed=8 refused=12 other=0 files_on_task=8 barrier_spread_ms=4.421  OVER THE LIMIT
round  9: allowed=18 refused=2 other=0 files_on_task=18 barrier_spread_ms=6.992  OVER THE LIMIT
round 10: allowed=7 refused=13 other=0 files_on_task=7 barrier_spread_ms=12.641  OVER THE LIMIT

worst round left 20 files on a task whose limit is 3.
VERDICT: the limit DID NOT hold.
```

**5 to 20 files through a limit of 3, and never wrong the same way twice.** That is what a real race looks
like: a limit like that passes a casual test on a quiet afternoon and leaks on a busy one. The two
advisory-lock lines are the whole of the difference between these two runs.

---

## 8. A task that still has files cannot be deleted

```
-- 8.1 ALICE deletes her team task with NO files: allowed
DELETE 1

-- 8.2 ALICE deletes her personal task WITH a file: refused
ERROR:  This task still has files. Remove its files first, then delete the task.
CONTEXT:  PL/pgSQL function public.tasks_refuse_delete_with_files() line 9 at RAISE

-- 8.3 AS service_role, which bypasses row-level security entirely
ERROR:  This task still has files. Remove its files first, then delete the task.
CONTEXT:  PL/pgSQL function public.tasks_refuse_delete_with_files() line 9 at RAISE

-- 8.4 AS postgres, the operator in the SQL editor, who owns the table
ERROR:  This task still has files. Remove its files first, then delete the task.
CONTEXT:  PL/pgSQL function public.tasks_refuse_delete_with_files() line 9 at RAISE

-- 8.5 AND ON A CASCADE: deleting Alice's account
ERROR:  This task still has files. Remove its files first, then delete the task.
CONTEXT:  PL/pgSQL function public.tasks_refuse_delete_with_files() line 9 at RAISE
SQL statement "DELETE FROM ONLY "public"."tasks" WHERE $1 OPERATOR(pg_catalog.=) "owner_id""

-- 8.6 the same account deletion, with that person's files cleared first
DELETE 1      <- Bob's one file
DELETE 1      <- Bob's account. It goes.
```

**8.3 and 8.4 are why this is a trigger and not a policy.** A policy is not evaluated for `service_role`
(which has `bypassrls` here exactly as on Supabase) or for the table's owner, so a policy would have
stopped neither. **"By anyone, through any path" is a sentence only a trigger can keep.**

### 8.5 answers a question `docs/plan.md` marks NOT CONFIRMED

Both `docs/plan.md` and `docs/architecture.md` say: *"whether a refusal fires on a cascade the way it
fires on a direct delete is a question about Postgres that this plan has not answered by reading or by
trying."*

**It is answered here by trying, and the answer is yes.** Note the extra `SQL statement` line, which is
not in 8.2 to 8.4: the refusal came from inside the foreign key's own `DELETE FROM ONLY "public"."tasks"
WHERE $1 = "owner_id"`, which is the cascade. So **deleting an account is refused while any of that
person's tasks still has a file**, and the Build it 26 requirement
([#235](https://github.com/build-once/team-tasks/issues/235)) is something nobody can get past rather
than something somebody has to remember. 8.6 is the other half: with the files cleared, the account
deletion goes through, so the refusal is about the files and not about the account.

**This is PostgreSQL 17.10 on Windows, not Supabase**, and the `auth.users` table is a two-column
stand-in. What is established is that a `before delete` row trigger fires on a foreign key's cascading
delete — which is a property of PostgreSQL rather than of Supabase — and section 10 keeps the caveat.

### Deleting a team: nothing happens, and that is the answer the issue asks for

The issue: *"Say what that means for a team being deleted, if that can happen today."*

**It cannot happen through the app.** `public.teams` has no delete policy
(`20260930101343_create_teams.sql`), the restrictive suspension rule grants nothing, and no server
function deletes a team. So the only paths are the owner's hand in the dashboard and an account deletion
cascading through `teams.owner_id` — and the second is refused by this trigger first, through that
person's own tasks, before it ever reaches their teams.

**And when the owner does delete one by hand, this trigger never fires**, because
`tasks.team_id` is `references public.teams (id) on delete set null`
(`20261002133637_tasks_join_teams.sql`): the tasks are **updated**, not deleted.

```
-- 8.7 DELETING A TEAM
DELETE 1
┌──────────────────────────────────────┬──────────────────────────────────────┬─────────┐
│                  id                  │               owner_id               │ team_id │
├──────────────────────────────────────┼──────────────────────────────────────┼─────────┤
│ aaaa0000-0000-4000-8000-000000000002 │ 11111111-1111-1111-1111-111111111111 │ (null)  │
│ cccc0000-0000-4000-8000-000000000001 │ 33333333-3333-3333-3333-333333333333 │ (null)  │
└──────────────────────────────────────┴──────────────────────────────────────┴─────────┘
┌────────────────────────────┐
│ files_still_on_those_tasks │
├────────────────────────────┤
│                          3 │
└────────────────────────────┘
-- and who can now see Carol's file on the task Carol created:
┌───────┬─────────┐      ┌───────┬─────────┐
│  who  │ can_see │      │  who  │ can_see │
├───────┼─────────┤      ├───────┼─────────┤
│ alice │       0 │      │ carol │       1 │
└───────┴─────────┘      └───────┴─────────┘
```

So: **each task returns to the person who created it with its files still on it, and the files' audience
narrows with the task's.** Alice, who owned the team, can no longer see Carol's file — the storage rule
asks the task question and the task is now personal to Carol. Nothing is orphaned and nothing is widened.
This mirrors the case `docs/plan.md` already names about moving a task between personal and a team: "the
rule simply starts answering differently".

### And the trigger still fires with EXECUTE revoked from every client role

```
┌───────────────┬─────────────┐
│ authd_execute │ svc_execute │
├───────────────┼─────────────┤
│ f             │ f           │
└───────────────┴─────────────┘
```

This had to be checked before the three extra revokes could be written: if PostgreSQL checked EXECUTE
when the trigger fired, 8.2 to 8.5 would have been a permission error — or, worse, no error at all. They
are refusals, and the privilege is gone.

### Nothing in sections 4 to 8 changed anything

Every destructive sub-test is wrapped in `begin`/`rollback`. The last query of the run:

```
┌─────────┬───────┬───────┬───────┬─────────┐
│ objects │ tasks │ teams │ users │ buckets │
├─────────┼───────┼───────┼───────┼─────────┤
│      14 │     8 │     1 │     5 │       2 │
└─────────┴───────┴───────┴───────┴─────────┘
```

The seed's own numbers, unchanged.

---

## 9. The two variant databases, compared mechanically rather than by eye

### 9.1 Before and after 30 October 2026

`sandbox_pre` and `sandbox_post` differ in one thing: whether Supabase's current default privileges on the
public schema are in force. The whole 586-line attack run was captured against each and compared with
`Compare-Object`:

```
total differing lines: 26
only in post: 9
only in pre: 17
```

**All nine lines that appear only in `sandbox_post` are `permission denied for table tasks`**, and every
one of them is a statement the attack makes against `public.tasks` that this migration does not grant —
`anon` selecting from it, and `authenticated` updating or deleting a row. **Not one storage-rule outcome
differs**: every refusal, every `INSERT 0 1`, every `DELETE 0`/`DELETE 1` and every row of every listing
is the same on both sides. (The other eight "only in pre" lines are the knock-on: a `current transaction
is aborted` instead of the next statement's result, and the rows those statements would have printed.)

**That difference is #130's, not this migration's**, and it is worth being precise: in `sandbox_post`,
`public.tasks` is itself created under the new defaults, which is a world where the app that already
exists cannot write its own tasks. Neither real project is in that world — the 30 October change alters
**default** privileges, so an existing table keeps its grants, which #130's own sandbox settled. What
`sandbox_post` is useful for is the one row that shows the grant in this migration is load-bearing rather
than decorative:

```
# sandbox_post
│ database     │ authd_select_tasks │ authd_delete_tasks │ anon_select_tasks │ authd_insert_objects │ svc_bypassrls │
│ sandbox_post │ t                  │ f                  │ f                 │ t                    │ t             │

│ tasks_grants                                          │
│ {postgres=arwdDxtm/postgres,authenticated=r/postgres} │
```

`authenticated=r` — read, and nothing else — **is the line this migration writes**, and it is the only
privilege `authenticated` holds on `public.tasks` in that database. `anon` holds none. On a project with
today's defaults the same line grants nothing new (`sandbox_pre` shows `arwdDxtm` for all three roles),
which is exactly what "an explicit grant is not a default and is not withdrawn by a change to defaults"
is for.

The only other difference in the privilege read-back is `service_role` losing EXECUTE on the three
functions it was never granted by name. It does not need them: it bypasses row-level security, so no
policy that calls them is ever evaluated for it.

### 9.2 Whether `storage.objects.owner_id` is text or uuid

No Supabase page read on 2026-10-08 states that column's type. Supabase's ownership page compares it with
`(select auth.uid()::text)`, which reads as text; the migration casts **both sides** to text so the
comparison is right either way. `sandbox_owneruuid` is `sandbox_pre` with the column declared `uuid`
instead, and the same attack run against each:

```
> Compare-Object (Get-Content out-attack-pre.txt) (Get-Content out-attack-owneruuid.txt)
> ... | Measure-Object | Select-Object -ExpandProperty Count
0
```

**Zero differing lines across 586.** Not one result in the file depends on which type it is.

### 9.3 And the final build is the file being committed

The migration was edited after the first attack run (one comment block added about SQL deletes orphaning
objects). `sandbox_pre` was dropped, rebuilt from the final file, and the attack run again:

```
> Compare-Object (Get-Content out-attack-pre.txt) (Get-Content out-attack-final.txt) | Measure-Object ...
0
```

Every number in this file corresponds to the file in this pull request.

---

## 10. What this does NOT settle

- **Nothing has been applied to staging or production.** The migration exists in this repository and in
  four throwaway sandbox databases. `docs/environments.md` records it as not applied, in both columns.
- **THE MOST LIKELY WAY IT FAILS ON STAGING IS NOT TESTED HERE, and it is a privilege question.** Three
  things this file rests on cannot be modelled by a sandbox where `postgres` is a superuser and owns
  everything: whether the role `supabase db push` connects as may **insert into `storage.buckets`**,
  whether it may **create a policy on `storage.objects`** (a table owned by `supabase_storage_admin` on a
  real project), and whether the owner of `tasks_refuse_delete_with_files` holds **SELECT on
  `storage.objects`**. Supabase documents both of the first two shapes — `insert into storage.buckets
  (id, name, public) values (…)` on the creating-buckets page, and "RLS policies on `storage.objects`,
  `storage.buckets`" as customizations to "manage … through versioned migrations" on the
  declarative-schemas page — and **neither page names a role.** All three fail loudly if they fail: the
  first two on the first statement, having changed nothing; the third on every task deletion.
  [#239](https://github.com/build-once/team-tasks/issues/239) holds them, with the exact queries.
- **`storage.objects` and `storage.buckets` here are the assistant's model.** The column *names* are
  Supabase's, cited; every *type* is a choice, and section 2 says so. `storage.foldername()`,
  `storage.filename()` and `storage.extension()` do not exist in this sandbox at all — which is one of
  the three reasons the migration parses the path with `string_to_array` instead, so that the proof is
  about the expression that ships rather than about a stand-in for somebody else's function.
- **NEITHER LIMIT ON THE BUCKET ITSELF IS TESTED, AND NEITHER CAN BE HERE.** 5 MB and
  `{image/*,application/pdf}` are enforced by the Storage API, not by the database: nothing in
  PostgreSQL reads `storage.buckets.file_size_limit` or `allowed_mime_types`. Every object in this
  sandbox was inserted straight into the table, so these runs say nothing about either. **And whether the
  column accepts the `image/*` wildcard at all is an inference** — Supabase's documented JavaScript form
  is `allowedMimeTypes: ['image/*']` and the column is `allowed_mime_types`; no page read says they take
  the same spelling. One upload of each kind to staging settles both.
- **THE 100 MB IS NOT A CONTROL ON AN UPLOAD MADE WITH THE SERVICE-ROLE KEY, and neither is the three.**
  "Service keys entirely bypass RLS policies, granting unrestricted access"
  ([Storage access control](https://supabase.com/docs/guides/storage/security/access-control), read
  2026-10-08), so if the bytes travel through an Edge Function holding the key, **no policy in this
  migration is evaluated** and nothing here counts anything. `docs/architecture.md` offers that as one of
  two upload shapes. The server-side count the owner asked for on 2026-10-08 is still required, and this
  migration does not discharge it. [#240](https://github.com/build-once/team-tasks/issues/240) holds it.
- **An upload with the service-role key also has no uploader**: "When using the `service_key` to create a
  resource, the owner will not be set and the resource will be owned by anyone"
  ([Ownership](https://supabase.com/docs/guides/storage/security/ownership), read 2026-10-08). Such a file
  counts against **nobody's** 100 MB and **nobody can delete it** except the creator of its task. That is
  the second reason #240 argues for uploading as the signed-in person.
- **Whether `metadata` holds the size at the moment a `with check` runs is NOT CONFIRMED**, so the
  100 MB may bite early. If it does not hold it, the effective rule is "existing bytes + 5 MB ≤ 100 MB",
  which refuses a small file to somebody already past about 95 MB. The direction is deliberate — the
  ceiling cannot be stepped over — and the cost is up to 5 MB of a 100 MB allowance.
- **A row with no `owner_id` is accepted by the INSERT policy** (6.1, test 3.9), which is the hole the
  previous two bullets describe, left open because a strict pin would refuse every upload if Storage
  fills the column later. Neither case is reachable through the Storage API — a browser cannot choose an
  owner — and the API is the only way into a private bucket.
- **Whether `list()` goes through the SELECT policy, and how much of it, is not established.** The
  access-control page distinguishes "listing objects versus reading authenticated objects" and offers no
  more; nobody has tried it. The runs above list rows with `select`, which is the privilege, not the API.
- **DELETING A ROW IS NOT DELETING A FILE, which is the part of section 6.3 a sandbox cannot show at
  all.** "Deleting objects via a SQL query will not remove the object from the bucket and will result in
  the object being orphaned"
  ([Deleting objects](https://supabase.com/docs/guides/storage/management/delete-objects), read
  2026-10-08). Every `DELETE 1` above removed a row and there were never any bytes. So the DELETE policy
  is what **permits** a deletion; whatever Build it 23 writes to perform one must call the Storage API's
  `remove`.
- **The concurrency proof is 20 and 40 local connections, not two Deno isolates on Supabase's edge.** It
  establishes that the *statement* serialises, which is what a database decides; it does not measure what
  Supabase's connection pooling does under real load. It also does not prove the lock can never fail — it
  shows the obvious alternative failing in the same harness, which is what the issue asked for.
- **`('x' || substr(md5(…),1,16))::bit(64)::bigint` is confirmed by a run, not by a page.** PostgreSQL
  documents `B'…'` and `X'…'` bit-string literals, not this cast of ordinary text. Section 3 shows it
  evaluating on PostgreSQL 17.10.
- **The suspension check is `is_active()`, which this migration calls and does not test the inside of.**
  Dave's refusals above are the whole chain working; `evidence/build-it-16-suspend-accounts.md` is where
  that function itself was proved.
- **Nothing here tested a screen, a function, a signed link or a real file.** There is no upload path, no
  download path, and no link has ever been made.

### What WAS run here

Every command in this file was run by the assistant in this session, on the local sandbox, with its output
and exit code as printed. No command touched a network, a key, a `.env` file or any Supabase project.

---

## 11. The checks that ran on this change

Locally, before the commit — the three that read files this change touches:

| Command | Result |
|---|---|
| `node scripts/friendly-words-check.mjs` | `45 of 45 checks passed`, exit 0. It reads `supabase/migrations`, so it is the local check this change could most easily have broken |
| `node scripts/approved-model-check.mjs` | `6 PASS, 0 FAIL`, exit 0. 266 text files read; no file names an unapproved model |
| `node scripts/screen-state-check.mjs` | `182 of 182 checks passed`, exit 0. It reads `docs/` and `web/src/lib`, and this change edits three documents |

(`node scripts/drift-check.mjs` was run and refused with exit 2 and its usage line — it takes
`--migration-list` and `--function-list` files that a CI step produces, so it is not a check that can be
run by hand here. **Unverified — reason: it needs arguments this session has no way to produce.** The
pull request's own run of it is what covers it.)

And on the pull request: see the pull request body, which carries the run.

**None of CI's checks tests this migration**, and that is worth saying rather than letting a green run
imply otherwise: nothing in CI applies a migration or starts a database. What a green run establishes is
that this change broke nothing that was already checked — including `friendly-words-check`, which reads
two other migration files, and the Deno tests over the four Edge Functions, none of which has heard of
this bucket. The proof of the migration itself is sections 3 to 9 of this file and lives nowhere else.

---

## Appendix A. How to rebuild the whole thing

```
initdb -D <scratchpad>\pg23\pgdata -U postgres --auth=trust --encoding=UTF8
# then append to postgresql.conf:
#   port = 55435
#   listen_addresses = '127.0.0.1'
#   log_min_messages = warning
#   max_connections = 200
pg_ctl -D <scratchpad>\pg23\pgdata -l <scratchpad>\pg23\pg.log -w start

node build.mjs sandbox_pre       00-standin.sql            01-old-defaults.sql <the eleven existing migrations> 20261008191804_attachments_bucket.sql 90-seed.sql
node build.mjs sandbox_post      00-standin.sql                                <the eleven existing migrations> 20261008191804_attachments_bucket.sql 90-seed.sql
node build.mjs sandbox_owneruuid 00-standin-owner-uuid.sql 01-old-defaults.sql <the eleven existing migrations> 20261008191804_attachments_bucket.sql 90-seed.sql
node build.mjs sandbox_nolock    00-standin.sql            01-old-defaults.sql <the eleven existing migrations> 20261008191804_attachments_bucket.sql 90-seed.sql 30-wrong.sql

node ask.mjs  sandbox_pre       10-shape.sql  out-shape-pre.txt
node ask.mjs  sandbox_post      10-shape.sql  out-shape-post.txt
node ask.mjs  sandbox_pre       20-attack.sql out-attack-pre.txt
node ask.mjs  sandbox_post      20-attack.sql out-attack-post.txt
node ask.mjs  sandbox_owneruuid 20-attack.sql out-attack-owneruuid.txt

node race.mjs sandbox_pre    20 10
node race.mjs sandbox_pre    40 5
node race.mjs sandbox_nolock 20 10
```

The three helper scripts (`build.mjs`, `ask.mjs`, `race.mjs`) and the five SQL files (`00-standin.sql`,
`00-standin-owner-uuid.sql`, `01-old-defaults.sql`, `10-shape.sql`, `20-attack.sql`, `30-wrong.sql`)
lived in the session's scratchpad and were **not** committed: they are a sandbox harness, not part of the
app, and the repository's precedent (`evidence/build-it-22-usage-counts.md` appendix A) is to record them
in the evidence file rather than ship them. `ask.mjs` runs **without** `-q`, which matters: `-q`
suppresses the `DELETE 0` and `INSERT 0 1` tags that are the result of half of `20-attack.sql`, and the
first run of this evidence was redone for exactly that reason. The stand-ins and the wrong counter are
quoted in sections 2 and 7.4.

**The cluster was deleted at the end of the session.** Rebuilding it from the commands above and the
migrations in this repository is the way to check any line of this file.

---

## Appendix B. Record of the staging apply

**Empty. Nothing has been applied to staging.** When the owner applies it, the apply and the read-back
belong here, as `evidence/build-it-22-usage-counts.md` appendix B records its own. The read-back that
matters most is the one section 10's second bullet names: that the bucket row and the three policies are
really there, and that `authenticated` holds SELECT, INSERT and DELETE on `storage.objects` while `anon`
holds nothing it can use. [#239](https://github.com/build-once/team-tasks/issues/239) carries the
queries.
