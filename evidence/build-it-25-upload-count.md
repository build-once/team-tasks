# Evidence: Build it 25 part 2b — the daily upload count

> ## THE FIRST MIGRATION WAS APPLIED TO STAGING AND DID NOTHING — 12 October 2026
>
> **The thirty-first upload still answered HTTP 200**, and `usage_counts` held **zero** rows with
> feature `uploads` after thirty-one accepted uploads. The trigger was there, enabled, and taking its
> own no-uploader branch on every insert.
>
> **The cause: the insert that commits has no session.** The Storage API performs **three** inserts per
> upload, and only the last one is kept — and it runs on a superuser connection where `auth.uid()` is
> null. **Section 9 is the source that says so, read rather than inferred**, and section 10 is the
> second migration that fixes it forward.
>
> **The local sandbox could never have shown this**, and that is the lesson rather than the bug:
> it inserted into `storage.objects` directly, as the signed-in role. Nothing in this app ever does
> that. **A model faithful to the schema was not faithful to the client**, and the first thing the
> fix did was build one that is — section 10.2.

> ## AND THE SECOND MIGRATION WORKS ON STAGING — later the same day
>
> **30 of 30 accepted, the thirty-first refused, and `usage_counts` holds one `uploads` row with
> `used = 30`.** Section 11 is the record.
>
> **The sentence does not survive the Storage API and the SQLSTATE does**: the browser gets
> `HTTP 500, {"statusCode":"500","error":"DatabaseError","message":"database error, code: 54000",…}`.
> So the daily limit and a real outage both answer 500, which is
> [#297](https://github.com/build-once/team-tasks/issues/297).
>
> **And the script was wrong twice while the migration was right**: a judgement that accepted *any*
> refusal as the per-task one, and a `myTasks` query with no `ORDER BY` under a comment claiming an
> order. Both are fixed, the checks are **reordered** so the cheap ones run before the limit, and
> section 12 is the arithmetic worked out in advance.

Result: **The second migration works, on staging, and the first one's counting did not.** Both are
proved against a faithful reproduction of the Storage API's own insert sequence; the second is applied
to staging and to nothing else. `CREATE TRIGGER` needs the **TRIGGER privilege and not ownership** —
proved both ways, and the staging push got past the pre-check. **STILL UNVERIFIED**: nothing about
production, and the screen's sentences, which [#297](https://github.com/build-once/team-tasks/issues/297)
holds.

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

> **AND THE CHAIN WAS WRONG — see section 9.2.** The coach read staging on 12 October: `storage.objects`
> is owned by **`supabase_storage_admin`**, not by the role that applies migrations. **The conclusion
> happened to be right** — `postgres` does hold TRIGGER on both projects, and the push got past section
> 0 — but it was right for a reason nobody here established. This paragraph is left as written, because
> a wrong argument that produced a right answer is the kind of thing worth being able to find again.

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
| ~~**Whether `db push` may create the trigger on a real project**~~ **ANSWERED: yes.** The owner's push of 12 Oct got past section 0 and the trigger exists on staging. `postgres` holds TRIGGER on both projects | — | **done** |
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

---

## 9. WHAT STAGING SHOWED, AND THE SOURCE THAT EXPLAINS IT — 12 October 2026

### 9.1 The run, and the read-back

**The owner's runs**, reported; nobody writing this ran them.

| | Before the migration | After it |
|---|---|---|
| Totals | **10 PASS, 1 FAIL, 1 UNVERIFIED** | **identical** |
| The 31st upload | HTTP 200 | **HTTP 200** |

**The coach's read of staging afterwards**, through the read-only connector, reported:

- migration `20261012120000` is recorded;
- the trigger `attachments_count_upload` exists on `storage.objects` and is **enabled** (`tgenabled` `O`);
- the function exists;
- `usage_counts_feature_allowed` lists **three** words;
- **`usage_counts` holds ZERO rows with feature `uploads`** after thirty-one accepted uploads;
- `storage.objects` is owned by **`supabase_storage_admin`**, and **`postgres` holds TRIGGER on it on
  both projects.**

**So the migration did everything it said and the trigger did nothing.** The only branch that can
produce that is `if l_uploader is null then return new`, which means **`auth.uid()` is null on the
insert that commits.**

### 9.2 AND ONE OF MY OWN CLAIMS WAS WRONG, which this file has to say rather than pass over

The pull request argued that the `db push` role **owns** `storage.objects`, because `CREATE POLICY` on
it needs ownership and the attachments migration created three policies there. **The owner is
`supabase_storage_admin`, not that role.** So the chain was wrong — `postgres` is presumably a member
of that role, or holds the privileges another way, and nobody here established which.

**The conclusion drawn from it happened to be right**: `postgres` does hold TRIGGER on both projects,
and the push got past section 0. **A correct answer from a wrong argument is still a wrong argument**,
and the thing that made it harmless was the pre-check, which asks the database instead of reasoning
about it.

### 9.3 And the prediction of the "before" totals was wrong — 1/2/4 against 10/1/1

The pull request predicted **1 PASS, 2 FAIL, 4 UNVERIFIED** for the run before the migration. The
actual was **10 PASS, 1 FAIL, 1 UNVERIFIED**. The script was right and the prediction was careless;
three separate errors, each worth naming because they are different mistakes:

| Predicted | Actually | Why the prediction was wrong |
|---|---|---|
| `AND THE UPLOAD AFTER IT IS STILL ALLOWED` would **FAIL** | **PASS** | The prediction said the follow-up upload "is the 33rd file on an 11-task set and the per-task 3 refuses it". It is not: the script **deletes `f1.png` from that task first**, so the task holds two files and the upload fits. I reasoned about the script instead of reading the twelve lines that do it |
| the footprint, leak and cleanup judgements counted as **UNVERIFIED** | **4 PASS** | They are plain passes when nothing is wrong. I counted every judgement that is "not about the limit" as unverified, which is not what any of them returns |
| the setup and first-thirty judgements not counted at all | **2 PASS** | Simple omission |

**What this costs, stated plainly: nothing about the code, and something about the reports.** The
prediction was decoration — the script computes its own totals and the owner read them — but a number
offered confidently and wrong is exactly what rule 15 is about, and it was offered in the same message
as numbers that had been counted. **The ones that were counted were right; this one was not counted at
all.**

### 9.4 THE SOURCE: three inserts per upload, and only the last one commits

Read on **2026-10-12** from `github.com/supabase/storage`, branch `master`, through the GitHub API —
the files were fetched and read, not searched for a summary.

| Where | What it does |
|---|---|
| `src/storage/uploader.ts:83-101` | `authorizeUpload` calls `db.testPermission(...)`, which **inserts the row** to see whether the caller's policies allow it |
| `src/storage/database/pg.ts:408-423` | `testPermission` runs that inside `withTransaction` and then throws a private sentinel so the transaction **rolls back**: `if (e === testPermissionRollbackError) return result` |
| `src/storage/uploader.ts:239` | the real write opens **one outer superuser transaction**: `this.db.asSuperUser().withTransaction(...)` |
| `src/storage/uploader.ts:274` | **inside it, a second probe as the caller**: `this.authorizeUpload(db.asCaller(), {...})` |
| `src/storage/uploader.ts:236-238` | and its own comment: *"Keep one outer superuser transaction. The final caller-policy probe shares its locks and **rolls back only its savepoint**"* |
| `src/storage/uploader.ts:287` | then `db.upsertObject(...)` **on the superuser connection** — the insert that commits, carrying no session |

**And the uploader is in the row**, `src/storage/database/pg.ts:1561-1573`:

```js
owner:    isUuid(data.owner || '') ? data.owner : undefined,
owner_id: data.owner,
```

so `owner_id` takes the value raw and the legacy `owner` column only when it is a uuid — **which is why
the cast in the fix must not assume one.**

**And `data.owner` is the verified token's subject**, `src/http/plugins/jwt.ts:57`:
`request.owner = payload.sub`, set by the server after it verifies the token. The request body is never
consulted for it.

**The coach's hypothesis was right, and this is more precise than it in one way that matters**: the
second probe is not a separate connection, it is a **savepoint inside the same superuser transaction**
as the real insert. A design that relied on "the probe is a different transaction" would have been
relying on something that is not true.

### 9.5 THE DIAGNOSTIC, if the source is ever in doubt

Two booleans and nothing else. **No id, no path, no name, no address** — there is no column in the
select list for one to travel in. Run it with at least one file in the bucket:

```sql
select
  bool_and(o.owner_id is not null)                                    as every_object_has_an_owner,
  bool_and(o.owner_id::text in (select u.id::text from auth.users u)) as every_owner_is_a_real_user
from storage.objects o
where o.bucket_id = 'attachments';
```

`t, t` says the row carries a real user id, which is the whole of what the fix depends on. **It was not
needed in the end** — the source settled it — and it is written down because a reading of somebody
else's `master` branch is not a reading of what staging runs.

---

## 10. THE FIX, AND THE PROOF AGAINST A FAITHFUL CLIENT

`20261012150000_upload_count_from_owner_id.sql`. **The first migration is not edited**: it is applied to
staging, and editing an applied migration leaves this repository and that database silently
disagreeing. This replaces the function body with `create or replace` and adds one reader; **the trigger
is not touched**, which is also why this migration needs no TRIGGER privilege and carries no pre-check.

**The rule, in one sentence: the uploader is `coalesce(auth.uid(), new.owner_id)`, and the count is
written only on the insert that has no session — the one that commits.** An insert that has a session
is one of the Storage API's probes: it is **checked** against the limit, so the refusal still happens
before the bytes are sent, and it **never writes**.

**Why checked-but-not-counted rather than counted-and-rolled-back**, which is the simpler version and
would also have given the right total: that version is right **only because somebody else's code rolls
its probes back**. This one is right whatever a later version of the Storage API does with them. The
owner asked for one real upload not to be counted twice; this makes it structurally impossible rather
than conditionally true.

### 10.1 The sandbox, rebuilt to be faithful to the CLIENT

Fifteen files applied in order — the stand-in, the thirteen earlier migrations, and both of this
build's — **15 of 15 with exit 0**. Then a stored procedure performs **one upload exactly as
`uploader.ts` does**: probe, rolled back; probe, rolled back to a savepoint inside a superuser
transaction; then the real insert with no session and `owner_id` set.

### 10.2 What it shows

| What | Result |
|---|---|
| **one upload, the Storage API way** | **counted ONCE** — not zero, not three |
| a second | **2** |
| up to thirty | **30**, and 30 objects |
| **the thirty-first** | **refused. `sqlstate=[54000]`, `message=[You've reached today's limit. It resets tomorrow.]`** |
| and after it | **the count is still 30 and there are still 30 objects** — so the refusal came from the FIRST probe, before any byte would have been sent, and spent nothing |
| **the service-role restore: 40 files, one committed statement** | **all 40 land, ZERO usage rows** |
| a **non-uuid** `owner_id` | **accepted, the cast did not raise**, and not counted |
| a **uuid `owner_id` that is not a user** | **refused `23503`** — fail closed, by `usage_counts`' foreign key |
| a different bucket | not counted |
| a **bare direct insert as the signed-in role** | **0 usage rows** — checked and not counted |
| `authenticated` → `uploads_used_today`, `count_daily_use`, `usage_counts` | **false, false, false**; and `service_role` → `uploads_used_today` **false** |

**The last-but-one row is the one thing this makes weaker than the first version**, and it is in the
migration's own section 4: a signed-in person inserting into `storage.objects` **directly** would be
checked and not counted. It is **believed unreachable** — the `storage` schema is not exposed by the
Data API — and believed is the right word, because nobody confirmed it.

### 10.3 Where the refusal lands, which is better than it was going to be

The first probe runs in `prepareUpload`, **before the bytes are sent**, and a raise from the trigger
propagates because `testPermission` re-throws anything that is not its own sentinel
(`pg.ts:415-419`). So somebody at their limit is refused **before uploading anything** — which costs
them nothing and costs this project no ingress.

**What that looks like as an HTTP answer is still unknown**, and is still
`scripts/staging/build-it-25-upload-count-checks.mjs` section 3's job to print.

### 10.4 The three questions the owner asked, answered

**Can `owner_id` be forged by a signed-in caller?** Not through the normal upload path:
`request.owner = payload.sub`, server-side from the verified token, and the body is never consulted.
And the bucket's `INSERT` policy already refuses a row whose `owner_id` is neither null nor the caller.
**Not confirmed**: the S3-compatible and TUS protocols were not read.

**Do signed upload URLs bypass or double-count?** Neither, and they behave differently:
`src/http/routes/object/uploadSignedObject.ts:88-99` takes the owner out of the signed token and runs
the whole upload `asSuperUser()` — so there is **no caller probe at all**. The committing insert carries
the owner, so it is **counted once, against whoever asked for the URL**, and a person at their limit is
refused on that insert rather than early. **This app does not use them** (`AttachFile.tsx` uploads
directly), so it is recorded rather than designed for.

**Does upsert bypass or double-count?** It would be **counted** — `upsertObject` is
`INSERT ... ON CONFLICT DO UPDATE` (`pg.ts:1728-1740`) and a BEFORE INSERT trigger fires on the insert
attempt — which is defensible, because replacing a file spends the traffic. **Not reachable here**: the
bucket has no UPDATE policy and the app sends `upsert: false` (`AttachFile.tsx:157`). **Not confirmed**:
what the trigger does on the UPDATE half of such a statement, because nothing here can make one.

### 10.5 And the closing notice now reports what was seen

The script's last line said Bob's allowance was spent **whatever happened** — and on 12 October it said
that after a run in which **nothing was counted**. It now reports the one thing it can observe from
outside: whether the limit refused anything. If it refused, the allowance is spent and the line says
that is **observed**; if thirty-one uploads were all accepted, it says that is **a finding rather than
good news** and points here.

**A closing line that reports a side effect it has not checked is a line that teaches the reader to
distrust the whole report**, which is the same fault as section 9.3's prediction, in the code rather
than in a message.

---

## 11. THE FIX WORKS ON STAGING — and the script was wrong twice. 12 October 2026

**The owner's run**, with `20261012150000` applied: **9 PASS, 1 FAIL, 4 UNVERIFIED.**

**The migration is right.** The thirty of thirty were allowed, and **the thirty-first was refused**:

```
HTTP 500
{"statusCode":"500","error":"DatabaseError","message":"database error, code: 54000","code":"DatabaseError"}
```

**The coach's read-only check afterwards**, reported: `usage_counts` holds **one `uploads` row with
`used = 30`**; no `bi25` tasks left; no attachments objects created in the last three hours remain.

**So: thirty uploads, thirty counted, the thirty-first refused, nothing left behind.** That is the
whole of what this migration was for, and it is done.

### 11.1 The sentence does not survive, and the SQLSTATE does

`You've reached today's limit. It resets tomorrow.` reaches the browser as **`database error, code:
54000`**. So the screen cannot use the words the database chose — and **the daily limit and a real
outage both answer HTTP 500**, which is worse than vague.

The migration's section 6 predicted this and proposed the answer: **ask `attachments_may_add()` after a
refusal** rather than infer from the status. [#297](https://github.com/build-once/team-tasks/issues/297)
is that, filed with the real body as its evidence, and it carries one operational note as well —
**every refused upload is logged by Storage as a 500**, so normal by-design refusals will look like
outages to anything that ever counts 5xx.

### 11.2 The FAIL was mine, and the coach's reading of it is correct

The coach's reading: *"sections 4 and 5 ran after Bob reached 30, so every refusal there was the daily
limit (500), not the per-task limit (400 on 12 Oct's first run)."* **Checked against the script, and it
is right in all three parts:**

| What the script did | Why |
|---|---|
| section 4's fourth file on a full task was refused **500** | the trigger is **BEFORE INSERT**, so it runs before the policy's `with check`. At 30, the daily limit refuses before `attachments_may_add` is ever consulted |
| that judgement **PASSED** | it only asked `status >= 400`. **Any refusal satisfied it** |
| the upload after it **FAILED** | the task had room, so the per-task limit was fine — and the daily limit refused it, correctly. The judgement named the wrong cause |
| section 5 said "no file to delete" | `myTasks` was queried with **no `order=`** while its own comment claimed "newest first", so `tasks[length - 1]` was arbitrary and landed on the one task with no files |

**TWO SEPARATE FAULTS, AND THE FIRST IS #174 COMMITTED INSIDE A CHECK.** A judgement that accepts any
refusal as "the per-task limit refused it" is one status standing for more than one meaning — the exact
pattern this repository files issues about, written into the thing that was supposed to catch it. **The
second is a comment that described an ordering nothing asked for**: a sentence in a comment is not an
`ORDER BY`.

### 11.3 And "29 file(s)" was correct, which nobody could see

The cleanup reported **29** after **30** accepted uploads and a section 5 that deleted nothing.
**Nothing was lost.** Section 4 deleted one itself — `removeFile(made[0], "f1.png")`, to free a place
on a full task — so 30 uploaded minus 1 deleted is 29 remaining. The coach's check confirms staging
holds no leftover.

**The number was right and the report could not show it**, which left the owner to work out whether a
file had gone missing. That is the fault worth fixing, and it is the same shape as the closing notice
of section 10.5: **a report that cannot show its own arithmetic is a report somebody has to audit by
hand.**

---

## 12. THE REORDERED SCRIPT, and the arithmetic worked out in advance

### 12.1 The order, and why it is the fix

**The cheap checks run FIRST, while the person is nowhere near the limit.** Run after it, every refusal
in them is the daily limit and they report the wrong thing twice over.

| Section | What, and at what count |
|---|---|
| **1** | 11 tasks |
| **2** | task 1: three uploads, then a **fourth refused by the per-task limit** — at a count of 3, so it cannot be the daily one |
| **3** | delete one, upload into the gap; delete another, upload again — **deleting makes room**, still far from the limit |
| **4** | top up to **exactly 30 accepted** |
| **5** | **the 31st**, to task 11, **which is empty** — so the per-task limit cannot be the cause |
| **6-8** | the restore case, cleanup, footprint. **Nothing after section 5 needs an upload** |

### 12.2 The arithmetic, which is now the proof rather than a pairwise check

```
section 2   3 accepted, 1 refused (per-task), task 1 holds 3
section 3   -1 deleted, +1 accepted, -1 deleted, +1 accepted
            -> 5 accepted, 2 deleted, task 1 holds 3 again
section 4   +25 accepted over tasks 2..10 at 3 each (task 10 gets 1)
            -> 30 ACCEPTED
section 5   the 31st, to task 11 (empty) -> REFUSED
```

**THE COUNTER SHOULD READ EXACTLY 30 AT THE END.** Thirty accepted uploads counted once each, and
nothing else counted — not the per-task refusal, not the two deletes, not the thirty-first.

**AND THAT IS WHAT PROVES A REFUSAL COSTS NO SLOT**, which the old pairwise check could not. If the
per-task refusal or either delete had spent a slot, the run would have been refused **before** reaching
30 — and `judgeAcceptedExactly` fails on exactly that. The arithmetic is the control; the pairwise
comparison was a guess dressed as one.

**28 FILES SHOULD REMAIN** — 30 uploaded minus the 2 this run deleted — and the cleanup judgement now
reconciles that rather than printing a bare number. A mismatch is a finding in either direction: fewer
means something is left on staging, more means it removed something it did not make.

### 12.3 And the per-task judgement now asserts WHICH refusal

By **the absence of the SQLSTATE in the body**, not by the status. A status is a weaker thing to depend
on than the code the trigger actually raises, and if Storage ever changes what it returns for a policy
refusal this still reads correctly. **The body is printed either way**, because what a policy refusal
looks like from outside is still not written down.

### 12.4 Seen to fail

`judgePerTaskRefusal`'s discriminator (`if (mentions(answer, sqlstate))`) replaced with `if (false)`:

```
WRONG  THE WORLD OF 12 OCTOBER: it was the DAILY limit wearing a refusal's clothes
WRONG  and the same for a body that carries only the SQLSTATE
45 cases, 2 wrong.
```

Restored: `45 cases, 0 wrong.` **37 → 45**, and six of the eight new cases exist because of the fault in
11.2 — including one carrying **the body staging actually returned**, which the per-task judgement must
refuse to accept.

### 12.5 Whose day it spends: `--as`, and it is required

Hard-coded to Bob until today, which was fine until the day Bob's allowance was already spent by the
run that found the no-session bug. **A hard-coded account is an account you cannot move off when it
runs out.**

`--as alice | bob | carol`, **no default** — naming it is how the person says they meant to spend that
day. **No password is ever an argument**: both values are read from the environment, so
`source ~/.config/team-tasks/staging.env` puts all three in place and nothing secret reaches a shell
history or `ps`.
