# Evidence: Build it 25 part 2b — the daily upload count

Result: **PASS for everything a local PostgreSQL sandbox can decide, and that turned out to include the
one thing nobody expected it to: a refused push leaves nothing behind.** `CREATE TRIGGER` needs the
**TRIGGER privilege and not ownership**, so the migration asks before it creates anything — proved both
ways. **UNVERIFIED for the one question that decides whether the screen can say anything useful**:
what the Storage API makes of a trigger's exception. That is a property of a service and no database
can answer it.

Date: 2026-10-12
Issue: Build it 25 part 2b, from `docs/plan.md` → "Files attached to a task" → "AN UPLOAD IS NOW COUNTED
TOO — 30 A DAY PER PERSON" (decision **B**, the owner's of 2026-10-11), with the mechanism decided
2026-10-12.
Branch read from: `main` at `33ba33a` ("Merge pull request #294"), printed with `git log` in this
session.
Checked by: the coding assistant.

**NOTHING WAS RUN AGAINST STAGING OR PRODUCTION. No MCP connector and no browser tool was used.** No
dashboard was opened, and `supabase db push` was not run — rule 19 refuses it everywhere except
`--local`. Every command below ran on throwaway PostgreSQL 17.10 clusters on the owner's own machine,
created and destroyed in this session.

---

## 1. Why a trigger, and the reason that is not in the plan

`docs/plan.md` named the hard part in advance: an upload has no Edge Function in its path, so the count
"would have to be **written from inside a policy's `with check`** — and nobody has established that a
check expression may perform a write".

**That question is now moot and was never answered**, because designing it turned up a second problem
the plan did not know about.

**`public.attachments_may_add()` is EXECUTE-able by `authenticated`** — it must be, because the `INSERT`
policy names it and a policy's expression runs with the caller's privileges — **and a function in
`public` with that grant is published by PostgREST as an RPC.** So a count inside it would have been
**spendable without uploading**: thirty direct calls, each committing, because there is no outer INSERT
to roll one back.

The realistic harm is not somebody attacking themselves. **It is a future screen** that greyed out the
upload box by asking "can I add a file?" — which would have spent a slot on every page load and quietly
halved everybody's allowance.

**A trigger has neither problem**: it fires only on a real INSERT, it cannot be called directly, and it
can raise a message rather than only answering false. The owner chose it on 2026-10-12.

---

## 2. CREATE TRIGGER needs the TRIGGER PRIVILEGE, not ownership

**This is the fact the clean-failure design rests on, and it was measured rather than remembered.** A
table owned by `postgres`, and a separate non-superuser role:

```
=== 1. what has_table_privilege says, BEFORE any grant ==================
 may_trigger | may_select |  owner
-------------+------------+----------
 f           | t          | postgres

=== 2. and can it create one? MUST FAIL =================================
ERROR:  permission denied for table objects

=== 3. grant TRIGGER -- NOT ownership -- and ask again ==================
 may_trigger | still_owned_by
-------------+----------------
 t           | postgres

=== 4. NOW can it create one? ===========================================
 tgname  | table_still_owned_by
---------+----------------------
 probe_t | postgres
```

So a non-owner created a trigger on a table **still owned by somebody else**, and
`has_table_privilege(role, table, 'TRIGGER')` answered correctly either side of the grant.

**AND A SECOND FINDING CAME OUT OF THE SAME SANDBOX, which is why the expectation for staging is
"probably yes" rather than "nobody knows".** `CREATE POLICY` on that table needs **ownership**:

```
ERROR:  must be owner of table objects
```

`20261008191804_attachments_bucket.sql` created **three policies** on `storage.objects` on staging (the
owner's `db push`, 9 Oct) and on production (the pipeline, the same day), and the coach read all three
back. **If that role owns the table, it holds every privilege on it, TRIGGER included** — and ownership
implying TRIGGER was checked too, not assumed: with the owner changed, `may_trigger` came back `t`.

**That is a chain of two measurements and one observed fact, not a reading of a page**, so it is written
as an expectation. The migration's section 0 is what makes a wrong answer harmless.

---

## 3. A REFUSED PUSH LEAVES NOTHING — proved both ways

The owner asked for this in these words: *"make the migration fail cleanly and completely if it may
not, so a refused staging push leaves nothing half-applied."*

**The sandbox for it is different from every other one in this repository**, and it has to be: the
public objects were created **by a non-superuser role** (`migrator`) which owns them, modelling what
`supabase db push` does — while `storage.objects` was owned by `postgres` and then transferred, so the
TRIGGER privilege could be granted and revoked independently. **As `postgres` the question cannot be
asked at all**, because a superuser holds everything.

### 3.1 With the privilege revoked

```
$ psql -c 'set role migrator;' -f 20261012120000_upload_daily_count.sql
ERROR:  Build it 25 part 2b needs the TRIGGER privilege on storage.objects, and the role applying
        it (migrator) does not hold it. NOTHING IN THIS MIGRATION HAS BEEN APPLIED.
HINT:   CREATE TRIGGER needs the TRIGGER privilege on the table and not ownership of it, so this is
        a grant rather than a change of owner. If it cannot be granted, the fallback is
        docs/plan.md's other option: count inside public.attachments_may_add() and accept that a
        signed-in caller can spend their own allowance by calling it directly. That is a different
        migration, not a change to this one.
exit=3
```

**And the state afterwards — identical to before the attempt:**

```
 feature_list
------------------------------------------------------------------------------
 CHECK ((feature = ANY (ARRAY['ai_suggestions'::text, 'invitations'::text])))

 the_function | 0
 the_trigger  | 0
```

**Two words, no function, no trigger.** Nothing half-applied.

### 3.2 With the privilege granted

```
$ psql -c 'grant trigger on table storage.objects to migrator;'
$ psql -c 'set role migrator;' -f 20261012120000_upload_daily_count.sql
NOTICE:  TRIGGER privilege on storage.objects: held by migrator. Proceeding.
exit=0
```

```
 feature_list
-----------------------------------------------------------------------------------------------
 CHECK ((feature = ANY (ARRAY['ai_suggestions'::text, 'invitations'::text, 'uploads'::text])))

 the_function | 1
 the_trigger  | 1
```

### 3.3 And one thing this test taught by accident, which is why the pre-check matters at all

While building it, the attachments migration was run by a role that could not create a policy. **It
failed half-way and left the bucket row behind** — so `psql -f` **does not roll back on error**, and a
later retry failed on `duplicate key value violates unique constraint "buckets_pkey"`.

Whether `supabase db push` wraps each migration in a transaction was not established here. **The
pessimistic case is the one that was measured, and in it the pre-check is the only thing standing
between a refusal and a half-applied migration.** If the CLI does wrap, the pre-check costs one query.

### 3.4 And the ordering, for the failure the pre-check cannot catch

If `create trigger` failed for some other reason, what is left behind is **inert**: a widened check
constraint accepts a word nothing writes, and a trigger function is called by nothing. **The dangerous
order is the opposite one** — the trigger live before the constraint allows `'uploads'` — which would
refuse every upload with a check violation. That is why the constraint goes first even though it reads
like the smaller change.

---

## 4. It applies on top of all thirteen

The stand-in, then every file in `supabase/migrations/` in name order:

```
--- exit code per file ---
  0  10-standin-full.sql
  0  20260927182443_create_tasks.sql
  … (the eleven between)
  0  20261012094500_task_cap_and_input_limits.sql
  0  20261012120000_upload_daily_count.sql

14 file(s) run; 14 with exit 0.
```

With `NOTICE: TRIGGER privilege on storage.objects: held by postgres. Proceeding.` and no `WARNING`
anywhere.

---

## 5. What it does, against the real fourteen migrations

Every object carries `metadata {"size": 10}`. **That is not decoration**:
`attachments_file_bytes()` treats an unparseable size as 5 MB, and the 100 MB per person would then cap
a run at 20 files and the daily limit would never be reached. Eleven tasks, because the bucket allows
3 files per task — `docs/plan.md`'s own arithmetic.

| What | Result |
|---|---|
| **Bob signed in, 30 uploads, 3 per task** | **30 allowed, 0 refused**; `usage_counts` → `uploads` = 30 |
| **the 31st** | **refused. `sqlstate=[54000]`, `message=[You've reached today's limit. It resets tomorrow.]`**; objects stay 30, the count stays 30 |
| Carol uploads 3, then a **fourth on the same task** | refused `42501` by `attachments_may_add` — **and Carol stays at 3, not 4** |
| **deleting a file** | Carol stays at **3**. The trigger is on INSERT and nothing else |
| **a signed-in 40-row INSERT from 0** | **REFUSED at the 31st** — `You've reached today's limit.` — and **nothing landed, nothing counted** |
| a signed-in 30-row INSERT from 0 | **all 30 land**, exactly at the limit |
| **the service-role restore: 40 files in ONE committed statement** | **all 40 land; 0 rows in `usage_counts`** |
| an upload to a different bucket | not counted |
| `authenticated` calling `count_daily_use` | refused `42501` |
| `authenticated` calling the trigger function | refused `42501`, "permission denied for function attachments_count_upload" |

Read-backs:

```
          tgname          | enabled | for_each_row | before | on_insert
--------------------------+---------+--------------+--------+-----------
 attachments_count_upload | O       | t            | t      | t

 security_definer | volatile_v | authenticated_may | service_role_may
------------------+------------+-------------------+------------------
 t                | v          | f                 | f
```

**Three results worth pulling out:**

1. **A refused or failed upload spends no slot**, proved by two different failure modes — a per-task
   refusal after the trigger had counted, and a transaction that failed later. This is the thing
   `docs/plan.md` wanted and could not get from a policy: "a count kept on a refused upload is the
   wrong way round".
2. **The restore works.** 40 files in one committed service-role statement, nothing counted. The
   trigger fires for `service_role` — a trigger is not a policy — and returns early because
   `auth.uid()` is null.
3. **No new grant was needed.** `has_function_privilege('authenticated', 'attachments_count_upload')`
   is **false** and `count_daily_use` is still service-role-only, while all thirty uploads counted —
   because the trigger function is `security definer` and runs as its owner.

### 5.1 The signed-in multi-row insert, which the owner asked for

Not reachable through the Storage API, which uploads one object per request. Checked because *"not
reachable today"* is not a property of the database:

```
--- 5a: 40 rows in ONE insert, from a count of 0 ---
ERROR:  You've reached today's limit. It resets tomorrow.
CONTEXT:  PL/pgSQL function public.attachments_count_upload() line 89 at RAISE
 objects_now | 0
 usage_rows  | 0
```

Counted per row, refused at the 31st, **the whole statement failed and nothing was counted** — the same
shape part 2a's task cap has.

---

## 6. THE ONE THING THIS CANNOT ANSWER, and it is the one the screen needs

**The browser never sees that exception.** It talks to the Storage API, which talks to PostgreSQL, and
**what Storage makes of a trigger raising 54000 is not known** — the HTTP status, whether the message
comes through, whether the code appears anywhere. No page read says, and no database can answer it: it
is a property of a service.

**So `scripts/staging/build-it-25-upload-count-checks.mjs` section 3 prints the exact status and the
exact body**, whatever they are, and three of its selftest cases feed that judgement a refusal carrying
both the sentence and the SQLSTATE, one carrying only the sentence, and one carrying neither — because
the screen pull request has to be written against whichever one staging turns out to be.

**If neither survives**, the migration's own section 6 proposes the answer that needs nothing from
Storage: after a refused upload, **ask `attachments_may_add()`**. It answers whether the task and the
100 MB still have room, so a yes means the refusal was neither of those — which leaves the daily limit.
That is the same "ask rather than infer" shape the owner chose for the task cap on 2026-10-12, and it
needs no new function and no new grant.

**The option not proposed, and why**: a reader over `usage_counts` granted to `authenticated` would
answer directly, and it needs `docs/plan.md` changed first — that plan says nobody can see this count
through the app, "not even the person whose count it is".

---

## 7. What is UNVERIFIED, in full (rule 8)

| What | Why it could not be settled here | What settles it |
|---|---|---|
| **What the Storage API returns for the 31st upload** | it is a service, not a database | the staging script's section 3, which prints it |
| **Whether `db push` may create the trigger on a real project** | a local `postgres` owns everything. The expectation is yes, from the policy-ownership chain in section 2 | the owner's `db push`. **A no is harmless**: section 0 refuses with nothing applied |
| **That the count refuses over the Storage API** rather than in `psql` | everything here is a direct connection | the staging script, before and after |
| **That a service-role restore is uncounted on a real project** | a staging script holds no service-role key and must not | section 5 established it on PostgreSQL; the owner can repeat it in the dashboard's SQL editor |
| **Whether `supabase db push` wraps a migration in a transaction** | not established. The pessimistic case was measured — raw `psql -f` does **not** roll back | reading the CLI's behaviour, or one deliberately-failing migration |
| **Anything about production** | nothing here touches it | the merge, then the migration's section 5 read-backs |
| **That the 7-day window removes an upload count** | `count_daily_use`'s own window was proved in `evidence/build-it-22-usage-counts.md`; nothing about it changes for a third feature word | nothing new |

---

## 8. Redaction (rule 18)

**Nothing was captured from production.** The sandbox used made-up data throughout: uuids of repeated
digits and addresses at `example.invalid`, which is reserved and cannot resolve. No real address, task
title, team name or file name appears in this file.

**And one thing about the staging script that belongs here rather than in its own header.** It is the
**only check in this repository that prints a whole response body on purpose** — section 3's job is to
record what nobody knows. So every live value is registered with its scrubber **before** any body can
be printed, and a judgement at the end asserts that none of them reached the output. One selftest case
feeds that judgement a printed body carrying a live token and requires **FAIL**.

**The list of replaced values is empty, and that is a complete answer.**
