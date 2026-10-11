# What is backed up, what is not, and what we are going to do about it

A map of every place Team Tasks' data lives, what would be lost if that place failed, what backs it
up **today**, and the gap. Then the two targets, and the nightly copy that Build it 24 adds to close
the gap.

Written 2026-10-10 for Build it 24 part 0 ([#252](https://github.com/build-once/team-tasks/issues/252)),
against commit `cb58926`.

**A RESTORE HAS NOW FINISHED, AND IT TOOK 219 SECONDS — 10 to 11 October 2026.** This paragraph has
said three different things in four days and the third is the one to quote. It said "Documents only.
Nothing in this file is built"; then that the one sentence anybody should quote was "**no restore has
ever finished**". That stopped being true when the owner restored the 15:07 copy of 10 October into a
new project in the Pro organisation, compared it, signed in as a real account, opened the attachment,
and deleted the project. `evidence/restore-tested.md` is the record.

| | |
|---|---|
| **Built** | `.github/workflows/backup-production.yml`, `.github/workflows/backup-freshness.yml`, `scripts/backup/` (the copy, the restore, the freshness check, the format, the proof), and `docs/restore-runbook.md`. Exercised end to end on every pull request against a throwaway PostgreSQL and a stand-in for both object stores — `evidence/build-it-24-nightly-copy.md` |
| **Done, and it is new** | **A finished restore**, measured at **219 seconds** wall clock: 47 tables, 269 rows, one file byte for byte, the owner signed in with his own account and opened the attachment. **A 14-day lifecycle rule on the bucket**, so copies now expire. **Three copies of production**, one of them made by the schedule on a night nobody was watching |
| **Not done** | **No second drill**, so 219 seconds is one measurement and not a range. **No bucket lock** — still the proposal of 10 October, still awaiting the owner. And **`evidence/backups-on.md` does not exist**, so half of [#249](https://github.com/build-once/team-tasks/issues/249) is still TODO: what Supabase's own Backups page says about retention has been read by the owner and is not in the file the launch check reads |

**TWO COPIES OF PRODUCTION NOW EXIST — 10 October 2026.** The owner ran the job by hand five times that
day: three refusals, then two successes. **So the sentence at the top of this page has changed for the
first time since it was written**: there is a copy, and the gap [#248](https://github.com/build-once/team-tasks/issues/248)
names is closed for the database *and the one attached file* as of today.

| Run | What happened |
|---|---|
| 12:04 | read everything, `PUT answered HTTP 403` — no code, no copy |
| 12:42, 12:45 | **`403, code AccessDenied`** — the code arrived with the fix and named the fault in one word: the credential was real and not allowed to write |
| **12:56** | **a copy.** 47 tables, 0 files, **138,272 bytes** stored, read back and verified |
| **15:07** | **a copy with the first attached file in it.** 47 tables, **1 file of 1,178,671 bytes**, 1,309,392 bytes stored |

**AND THE SCHEDULE RAN ITSELF FOR THE FIRST TIME — 11 October 2026**, which is the only version of this
job that copies anything on a night nobody is watching.
[38121029695](https://github.com/build-once/team-tasks/actions/runs/38121029695), event `schedule`,
**success in 38 seconds**: `Done in 15s: 1 copy, 47 table(s), 1 file(s), 1309424 bytes stored.` The
`report-failure` job was `skipped`, as `if: failure()` must be on a good night. **Three copies now
exist.** It also printed production's PostgreSQL version — **17.6**, against a `pg_dump` 17.11 on the
runner — which is the number [#262](https://github.com/build-once/team-tasks/issues/262) was open for.

**IT STARTED 5h 57m 24s LATE**, and that is this page's business rather than a curiosity, because it is
the number the data-loss target is made of. The cron line asks for **01:23 UTC** and the run was created
at **07:20:24Z**. "The two targets" below is reworded for it, and "One more, which is about the schedule
and not the data" carries GitHub's own sentences — including one this repository had never quoted, that a
queued job may be **dropped** rather than merely delayed.
`evidence/build-it-24-nightly-copy.md` section 14 is the whole record.

**One thing the success hid, AND BOTH HALVES OF IT ARE NOW DEALT WITH.** This paragraph said
[#268](https://github.com/build-once/team-tasks/issues/268) "Backup did not run" — opened by the 12:42
failure above — **was still open**, three successful copies later, because the job only ever opened or
commented and nothing closed it. Two things changed:

- **The owner closed #268 by hand on 11 October 2026.** So the public record no longer says this is
  broken while it works.
- **And the job now closes it itself.** A third job in `backup-production.yml`, `close-alarm`, closes
  every open issue with that exact title when a copy succeeds — with the same separation as the failure
  job: no environment, no secret, only `issues: write`. That is
  [#272](https://github.com/build-once/team-tasks/issues/272)'s first condition; its third asks for a
  failure, a success and a second failure to be seen in sequence against the real thing, which has not
  happened, so **#272 stays open**.

**And its mirror is built too**: [#264](https://github.com/build-once/team-tasks/issues/264) — nothing
noticing when the copies STOP — is `.github/workflows/backup-freshness.yml`, at the 36-hour threshold
the owner decided on 11 October. "Should anything notice when no copy has been made" at the end of this
page is the design; it is no longer a proposal.

**AND THE FIRST RESTORE DRILL FOUND A FAULT, the same day, which is what a drill is for.** The owner
restored the 15:07 copy into a new project with this repository's 11 migrations applied. The three
completeness checks passed, the database went in, and then:

```
psql exited 0 with 573 ERROR line(s)
the restored bucket: PUT answered HTTP 415, code InvalidMimeType
```

**The comparison never ran**, which is the only part of a drill that proves anything. The `attachments`
bucket allows six named types and nothing else, and the restore was sending the file with no type the
bucket accepts. `evidence/build-it-24-nightly-copy.md` section 13 is the whole record; what changed:

- **Every file now goes back with the content type it had**, from the manifest (copies made from today
  onward record it), else the storage record in the dump, else the file's extension — which is how the
  app assigned the type in the first place, so **today's two copies restore without making a third**.
  A file with no type the bucket accepts stops the restore **before anything is uploaded**.
- **psql's error COUNT was never a check, and the kinds now are.** 573 is what one drill saw and is
  asserted nowhere; every ERROR line is classified and **an unexpected kind fails the run**, with none of
  the text printed. Writing that check found a kind nobody had predicted — replaying a primary key says
  "multiple primary keys … are not allowed", one line per table, so a 47-table restore has 47 of them.
- **A restore that stops part-way is safe to run again**, and `docs/restore-runbook.md` step 4 says
  exactly what a second run does to rows already restored and to a file already uploaded — including the
  one thing it does *not* do, which is repair a half-filled table.
- **The CI stand-in now holds the bucket's six types**, so this fault fails there first. It could not
  have before: nothing in CI cared what a PUT declared.

**AND THEN THE DRILL WAS FINISHED, 10 to 11 October 2026, AND IT FOUND TWO MORE THINGS.** The owner
restored the same copy into the same project after the 415 was fixed. `evidence/restore-tested.md` is
the whole record; what it changed in this repository:

| What the finished drill found | What was done about it |
|---|---|
| **Three of psql's 574 ERROR lines were syntax errors at character 1** — "trailing junk after numeric literal", and twice "syntax error at or near" a number. Those are not schema errors. **They are rows of a table being executed as SQL**, after a `COPY` was refused | The dump is no longer replayed with its data inline. Every `COPY … FROM stdin;` block is lifted into a file of its own and replayed with psql's `\copy`, in a second pass. **A row is no longer anywhere in the script psql runs**, so a refused COPY has nothing behind it to execute. "What a restore promises" below has the mechanism and the two things writing it discovered |
| **Five more of its error kinds were being called "unexpected"** — 52 `permission denied to change default privileges`, 32 `grant options cannot be granted back to your own grantor`, 97 `permission denied for schema` across five schemas, 6 non-superuser event triggers, and two foreign keys on sign-in session rows | Each is now its own **named expected kind**, so the report says which refusal happened instead of lumping them under "not the owner". **The three syntax errors stay unexpected on purpose**: a kind for them would have hidden the bug behind a classification |
| **`auth.refresh_tokens` came back 0 of 2 and `auth.mfa_amr_claims` 0 of 1**, because the sessions they point at were not restored | The owner's decision of 11 October: **sign-in sessions are not restored, and after a recovery everybody signs in again.** So the restore now promises a **named set** and reports everything else as "not restored, by design" with a count. "What a restore promises" below is that set |

**The earlier record is kept below**, because the first failure is the reason the error code exists.

**IT WAS RUN AGAINST PRODUCTION AND FAILED FIRST — 10 October 2026.** The owner started
it by hand on `main`. It read production correctly and **stopped at the upload**:

| | |
|---|---|
| What worked | server **17.6**, `pg_dump` **17.11**, a dump of **654,776 bytes over 10 schemas**, **47 tables** counted, the `attachments` bucket listed (**0 objects**, because nobody has signed up), the copy checked, encrypted to **138,272 bytes** |
| What failed | `the backup bucket: PUT answered HTTP 403` |
| What is in the bucket | **nothing** |

**Two things that run settled on its way to failing**, and they are worth as much as the failure: the
Supabase **S3 access key works** — the listing of the `attachments` bucket is a signed S3 request to a
real service, and it was accepted — and **the PostgreSQL 17 client works against production's 17.6**.
So of the four things nobody had verified, two are now verified, and the third is where it stopped.

**Why the message was nearly useless, and what changed because of it.** Three completely different
faults answer 403 — a signing fault, a permission fault, and a key id the service does not know — and
they need three different fixes. The run named none of them. So:

- **The S3 error code is now printed**, taken from the response's `<Code>` element and checked against a
  fixed list; anything else prints as `unrecognised`. Never the message, the RequestId or a header — an
  object store's error body can quote the key it was asked for, and this repository's run logs are
  public.
- **The signing is now checked against AWS's own published test vectors**, not only against the
  stand-in that recomputes it with the same code ([#261](https://github.com/build-once/team-tasks/issues/261)).
  **One of those vectors found a real bug**: a header value's internal runs of whitespace must be
  collapsed, not merely trimmed.
- **`content-length` is no longer signed or sent.** The Fetch standard makes it a forbidden
  request-header, so it is not ours to set — and signing a header you do not control is a way to be
  refused with no explanation.
- **The job now asks the backup bucket whether it may write BEFORE it reads anything from production**:
  one listing limited to a single key. The failed run dumped production's whole database in order to
  throw it away, and for those minutes production's data sat in plaintext on a runner for nothing.

**THE CAUSE IS NOW ESTABLISHED, AND IT WAS NONE OF THOSE FOUR.** This paragraph said "None of those
four is established as the cause. The first is the one that will say." The first one did say: once the
error code was printed, the answer was `AccessDenied` — and the owner's report of 10 October is that
**the R2 token had been created with Object Read ONLY, and changing it to Object Read & Write is what
ended the 403s.** A real credential, not allowed to write. So the fix was a permission and not a
signing fault, and the one-word error code is what pointed at it; the other three changes stand on
their own merits. `#266` was closed by the owner.

**The owner settled seven decisions later the same day**, and they are recorded where each belongs rather
than in a list at the top: the two targets below; the retention window and the restore drill's
organisation; the credential the job reads the bucket with; what happens when a run fails; that the R2
token stays as it is; and that the storage endpoint goes in a GitHub environment variable rather than in
this repository. **One proposal came back out of that** — a 13-day R2 Bucket Lock, which the owner asked
for and has not yet accepted (`docs/plan.md`). And the decisions produced a list of things somebody has to
go and set by hand, which is "What the owner must set by hand" below. **None of those settings has been
made or seen by anybody writing this page.**

**Where the facts in it come from, because the three kinds are not equally good.**

- **Vendor documentation**, read on 2026-10-10 with WebFetch — no connector and no browser — and cited
  inline with the sentence it rests on. That is how the vendor describes the service, not what these
  accounts are set to.
- **The owner's report**, given in chat on 2026-10-10 and marked as such. Nobody writing this opened a
  dashboard.
- **This repository**, where a file or a line is named so you can go and look.

Anything that is none of those three says **not confirmed** and names what would settle it.

Related: `docs/plan.md` → "A nightly copy of production, held by another company" is the decision and
what it means for people's data; `docs/architecture.md` → "The nightly copy" is the shape of the job;
`docs/costs.md` → "Backups: what the nightly copy and a restore drill cost" is the money.

## The two targets — CONFIRMED by the owner, 2026-10-10

These are the numbers everything below is measured against. They were written as proposals and **the owner
confirmed both on 10 October 2026: at most one day of data lost, and at most a few hours down.** They are
first on the page because a backup with no target is a backup nobody can call adequate or inadequate.

| Target | Confirmed | What it means in practice |
|---|---|---|
| **How much data we are willing to lose** | **at most one day** | If production is destroyed at 23:00, we accept losing what changed since the last nightly copy. For six volunteers ticking off jobs, that is at worst a day's ticks and a day's new tasks — re-typable. A file attached that day is **not** re-typable, which is the one place this target is uncomfortable |
| **How long we are willing to be down** | **at most a few hours** | From "production is gone" to "the six can sign in and see their tasks again". Not minutes: there is one owner, no on-call, and the app is a to-do list for a volunteer group |

**AND THE FIRST TARGET IS NOT WHAT THIS DESIGN DELIVERS — MEASURED 2026-10-11, NOT REASONED.** The
target above is the owner's and stands as the **intention**. What follows is what the mechanism actually
gives, and the two are not the same number. This paragraph is here rather than in a footnote because
"at most one day" was the sentence anybody would have quoted.

**The measurement.** The first scheduled run asked for **01:23 UTC** and was created at **07:20:24Z** —
**5h 57m 24s late** ([38121029695](https://github.com/build-once/team-tasks/actions/runs/38121029695)).
The job itself takes 38 seconds, so none of that is the job: it is the queue. GitHub's own page, read
**2026-10-11**:

> "The `schedule` event can be delayed during periods of high loads of GitHub Actions workflow runs."
> "High load times include the start of every hour."
> **"If the load is sufficiently high enough, some queued jobs may be dropped."**

— [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

**The third sentence is the one that changes the number, and this repository had never quoted it.** A
late copy stretches the window; a **dropped** copy doubles it, and nothing in this design notices either.

**So the window, stated as the four cases rather than as one word** — arithmetic done in this session
from the one delay actually observed:

| Between two scheduled copies | The window |
|---|---|
| both on time | **24h 00m 00s** |
| one on time, the next as late as the one delay we have measured | **29h 57m 24s** |
| a night dropped, the next on time | **48h 00m 00s** |
| a night dropped, the next that late | **53h 57m 24s** |

**Reworded, and this is the sentence to quote instead of the one above: we lose at most about a day and
a quarter on a normal night, and about two and a half days if GitHub drops a run — and we would not know
which had happened.** The first figure is measured once; the second is GitHub's own published behaviour
and has not been observed here.

**What it does not change.** Nothing about the *database*, which Supabase backs up daily on its own
clock ([#262](https://github.com/build-once/team-tasks/issues/262)'s run shows production at PostgreSQL
17.6) — the delay only widens the window for the **attached files**, which this job is the only copy of.
So the target is met for the database and missed, by hours, for the one thing nobody can retype. That is
the same asymmetry the map below is built around, with a number on it for the first time.

**Three things could narrow it, none of them built, and the owner decides whether any is worth it:**

| | |
|---|---|
| **Run it more than once a night** | Two crons, twelve hours apart, make a dropped or delayed run cost half as much. It costs a second copy's storage and operations — on the free tier's published allowances, nothing at this size (`docs/costs.md`) |
| **Notice when a copy is overdue** | **BUILT, 11 Oct 2026** — `.github/workflows/backup-freshness.yml`, at 36 hours. It does not narrow the window; it means somebody *knows*. [#264](https://github.com/build-once/team-tasks/issues/264), and the section at the end of this page |
| **Accept it and write it down** | Entirely defensible for six volunteers, and it is what this page now does. The point of the rewording is that "about a day" was being read as a guarantee |

**What today's answers actually are, against those two.** This is the whole point of the map below,
so it is stated before it:

| | Today, for the database | Today, for the attached files |
|---|---|---|
| **Data lost** | **about a day at worst** — Supabase takes a daily backup, so the target is met for the database | **about a day and a quarter, and about two and a half days if GitHub drops a run — measured 2026-10-11.** This said "everything, permanently. Nothing backs the files up at all", and the 15:07 copy is what changed it: the one file in production is in a copy at Cloudflare. Then the first scheduled run started **5h 57m 24s** late, which is where the two figures come from — see the rewording above |
| **Time down** | **219 SECONDS, MEASURED — 11 October 2026.** This cell said "STILL NOT KNOWN" until the drill finished. That is the restore script's own wall clock, download to compared, for a 47-table, 269-row copy with one file in it; it is **not** the whole outage, which also needs making the project, applying the migrations and setting what is not in the copy. `evidence/restore-tested.md` has every step's own timing. **One measurement, not a range** — and on a near-empty production | the same drill, and the file came back byte for byte in the same 219 seconds |

**So of the four cells: two are passes, one MISSES THE TARGET BY A MEASURED AMOUNT, and one has a
number for the first time.** The middle cell is the change of 11 October — it has been "everything,
permanently", then "about a day", and it is now a figure with arithmetic behind it that does not meet
the target above. The last cell changed the same day and in the better direction: **"at most a few
hours" is now supported by a measurement rather than being an aspiration**, with the caveat that 219
seconds is one run against a production holding 269 rows, and the number that matters is the one a
busier production would give.

## What a restore promises, by name — DECIDED 2026-10-11

**A restore does not bring everything back, and until 11 October 2026 it pretended to.** It compared
every table in the copy against the restored database and called any difference a failure — so the
first finished drill ended with "every table matched except three", which is not a verdict anybody can
act on. Two of those three were sign-in sessions.

**The owner's decision, 11 October 2026: sign-in sessions are not restored. After a recovery, everybody
signs in again.** From that follows everything below.

### What is promised

**A mismatch in any of these FAILS the restore. There is no "mostly".**

| | What it is |
|---|---|
| **Every table in `public`** | All of this app's own data: every task, every team, who is in which team, every pending invitation, everybody's nickname and AI-suggestions setting, any suspension and its reason, the daily usage counts — and anything added to `public` later, with no list to keep up to date |
| **The accounts** | `auth.users` — the account and its hashed password; `auth.identities` — the identity that ties an email address to that account, which is what a password sign-in matches; `auth.mfa_factors` — a second factor somebody enrolled, because without it their sign-in is not the one they set up |
| **The storage records** | `storage.objects`, which is what Storage keeps about each file — its path, its size, who uploaded it and when — and `storage.buckets`, because a file has nowhere to be without its bucket row |
| **The files** | Every attached file, byte for byte, checked by SHA-256 against the copy's own manifest, and put back with the content type it had |

### What is not restored, and why that is not a failure

**Reported with a count, every time, and never as a failure.** The restore prints the number of tables
and the number of rows it did not put back, so "not restored" is a thing you are told rather than a
thing you discover.

| | Why not |
|---|---|
| **Sign-in state**: `auth.sessions`, `auth.refresh_tokens`, `auth.mfa_amr_claims`, `auth.mfa_challenges`, `auth.flow_state`, `auth.one_time_tokens` | The owner's decision. Nobody loses anything they typed — they sign in again. And `auth.one_time_tokens` is a reason in its own right: every row in it is a confirmation or reset link with a clock on it, and restoring one would restart the clock |
| **The sign-in log**: `auth.audit_log_entries` | It is a log, with IP addresses in it. `docs/plan.md`'s appendix says never to build anything on it, and a restore is not the place to start |
| **Supabase Auth's own bookkeeping**: `auth.instances`, `auth.schema_migrations`, and the four single-sign-on tables this app does not use | A new project brings its own and refuses ours |
| **Every other schema**: the storage internals, `realtime`, `vault`, the extensions' tables, the migration records | The same. A new project has its own, and `docs/restore-runbook.md` step 3 has you apply this repository's migrations to it before you start |

**AND A TABLE NAMED IN NEITHER LIST IS PRINTED BY NAME**, which is the honest part. The account list was
written from this project's knowledge of Supabase Auth and from the constraint names in the drill's own
error messages — **not by reading a dump**, because the assistant never receives one. So if a Supabase
release adds an `auth` table, the restore says so in a line of its own rather than quietly leaving it
out. It is still not a failure; it is a thing for a person to read and decide about.
[#276](https://github.com/build-once/team-tasks/issues/276) holds that, and the next drill's printed
output is what settles the names.

### And no row of data is ever executed as SQL again

**This is the fault the finished drill found**, and it is worth its own words because the fix changed how
a restore runs. Three of the drill's 574 ERROR lines were **syntax errors at character 1**. Reproduced
against a real psql on 2026-10-11, the whole mechanism in three lines:

```
psql:oldway.sql:1: ERROR:  relation "public.nope" does not exist
psql:oldway.sql:4: error: invalid command \.
psql:oldway.sql:5: ERROR:  syntax error at or near "1" at character 1
```

A plain `pg_dump` writes a table's data **inline**, after the `COPY … FROM stdin;` line. When the server
refuses that COPY, the rows are still in the script. psql buffers them, because "input lines are sent to
the server when a command-terminating semicolon is reached. An end of line does not terminate a
command"; the `\.` marker is read as a meta-command, because "Anything you enter in psql that begins
with an unquoted backslash is a psql meta-command"; and **the next real statement's semicolon flushes
the rows and that statement together as one**, which fails at character 1 quoting the first row's first
column. (Both quotations:
[psql](https://www.postgresql.org/docs/17/app-psql.html), read 2026-10-11.) The drill's own words were
"at character 1" and "at or near" a **number** — a row's first column.

**So the data no longer travels in the script.** Every COPY block is lifted into a file of its own, and
replayed with psql's `\copy`, which "runs an SQL COPY command, but instead of the server reading or
writing the specified file, psql reads or writes the file and routes the data between the server and
the local file system". A refused COPY is then an error with nothing behind it.

**AND NOT EVERY psql DOES IT, which CI found rather than anybody reasoning it out.** The same three-line
script, the same server, three clients, measured 2026-10-11:

| Client | ERROR lines |
|---|---|
| **psql 17.10**, EDB build on Windows — the owner's own machine | **3** — the refused COPY, `invalid command \.`, and the syntax error at character 1 |
| **psql 17.11**, pgdg build on the Ubuntu runner | **1** — just the refused COPY |
| **psql 16.15**, same runner | **1** — the same |

**Why they differ is not established**, and the obvious guess is wrong: 16.15 is older than 17.10 and
behaves like 17.11, so it is not "newer clients are fixed".
[#280](https://github.com/build-once/team-tasks/issues/280) holds it.

**It changes nothing about the fault or the fix**, and it is worth being exact about why: the client that
reproduces it is **the one the owner actually restores with**, and a restore that is safe only on
somebody else's psql is not safe. What it does change is what this page is entitled to claim — the
mechanism is explained by psql's own documented sentences, and *whether psql discards the pending data
first* is behaviour seen on one build out of three.

**Two things writing that discovered, neither of them read anywhere first:**

- **PostgreSQL's own `\restrict` hardening.** A current `pg_dump` wraps its whole output in `\restrict
  <token>` … `\unrestrict <token>`, and inside that region psql answers *"backslash commands are
  restricted; only \unrestrict is allowed"*. So the `\copy` cannot live in the same file as the dump.
  **The replay is therefore two psql passes**: the dump with its hardening untouched, then a script of
  nothing but our own `\copy` lines. Switching that protection off to save a process was considered and
  refused.
- **`pg_dump` orders its data section alphabetically**, measured the same day: `auth.identities` is
  dumped before `auth.users`. A plain dump gets away with that because its own foreign keys are added
  afterwards — but a restore into a project that already has the schema, which is what the runbook tells
  you to do, has those keys in place while the data loads, so the child is refused before its parent
  exists. **The restore now counts the rows and sends the short tables again**, while that number is
  going down. It is the runbook's "run it again" advice, done by the script.

## The map

Every place data lives. The second column is what would be lost **if that place alone failed**, which
is the question a backup answers; the third is what covers it **today**; the fourth is the gap.

| Where the data lives | What would be lost | What backs it up today | The gap |
|---|---|---|---|
| **The seven database tables** — `tasks`, `teams`, `team_members`, `invitations`, `profiles`, `account_status`, `usage_counts`. Counted in this session by reading `supabase/migrations/` | Every task, every team, who is in which team, every pending invitation and its hashed token, everybody's nickname and AI-suggestions setting, any suspension and its reason, and the daily usage counts. In short: the whole app's content | **Supabase's own daily backups.** The owner read production's Database → Backups page on 10 Oct 2026 and saw **seven daily physical backups, 3 to 9 October, each around 12:20 UTC**. Supabase: "Pro Plan projects can access the last 7 days of daily backups" ([Database Backups](https://supabase.com/docs/guides/platform/backups), read 2026-10-10) | **Up to a day of writes**, by Supabase's own words: "Even with daily backups, you could still lose a day's worth of data." PITR would close it — "Pro, Team and Enterprise Plan projects can enable PITR as an add-on" — and it is an add-on nobody has priced. **And no SUPABASE backup has been restored**, so "backed up" in this row still means "a file exists that we believe is a backup". A copy of **ours** has been restored, in 219 seconds, which is a different file and a different mechanism |
| **The user accounts** — Supabase Auth: `auth.users` with each person's **hashed password**, plus sessions, refresh tokens and the sign-in audit log | Everybody's ability to sign in. The tasks would come back owned by user IDs that no longer exist, which is worse than losing them: a restore of the tables alone gives you data nobody can reach | **The same daily backups**, because `auth` is a schema in the same database. **Not separately confirmed**: no page read on 2026-10-10 says in as many words that the `auth` schema is included, and the page's only exclusion sentence is about Storage. It is read off "backups contain database data" plus `auth` being in the database | **A trap for the thing we build ourselves, rather than a gap in Supabase's cover.** `supabase db dump` is the obvious tool for a copy of our own and it **excludes exactly this**: it "Runs `pg_dump` in a container with additional flags to exclude Supabase managed schemas. The ignored schemas include auth, storage, and those created by extensions" ([`supabase db dump`](https://supabase.com/docs/reference/cli/supabase-db-dump), read 2026-10-10). A nightly copy built on that command would quietly contain no accounts at all |
| **The attached files** — the bytes, in the private `attachments` bucket in the production project | **The files themselves, irrecoverably.** A photograph of a job that has since been done cannot be taken again. `docs/plan.md`'s appendix already calls this the most sensitive row it holds and the one thing in the app nobody read before it was stored | **NOTHING.** Supabase: "Database backups do not include objects you store via the Storage API, as the database only includes metadata about these objects" ([Database Backups](https://supabase.com/docs/guides/platform/backups), read 2026-10-10) — and the owner read the same statement on the dashboard page itself on 10 Oct 2026 | **Total, and it is the reason this build exists.** [#248](https://github.com/build-once/team-tasks/issues/248) is this gap. A restore today would bring back `tasks` rows and `storage.objects` rows that both say a file is there, pointing at bytes that are gone — so the app would show files it cannot open. **The bucket is empty right now**, because nobody has signed up and the files panel is deployed nowhere, which is why closing it costs nothing today and gets more expensive every day after the first volunteer attaches something |
| **What Storage records about each file** — the `storage.objects` rows: the path, the size, `owner_id`, the timestamps | Which file belonged to which task, who attached it and when. Without it, recovered bytes are a pile of files with no owner and no task | **The daily backups**, since `storage` is a schema in the same database — by the same reading as `auth` above, and with the same `supabase db dump` trap: `storage` is on that command's excluded list by name | **The same trap**, plus a sharper one: the metadata and the bytes are backed up by **different mechanisms on different clocks**, so a restore can easily produce rows without files or files without rows. Whatever is built has to take both at as near the same moment as it can, and say which one it took first |
| **The server functions' settings and secrets** — the production Edge Functions secrets: the service-role key, `EMAIL_API_KEY`, and `AI_API_KEY` (production has none) | The ability to send an invitation email or create a team until each value is set again | **Nothing, and that is correct.** `docs/architecture.md`: these live "*only* in the function's own settings on Supabase … **Never in a file.**" A backup of a secret is another copy of a secret | **Not a gap — a thing to be able to re-create.** Each value is re-issuable from the service that owns it (Supabase's own key page, Resend, Anthropic), and rotating is the response to losing one anyway (`docs/secrets.md`). **What is missing is not a copy but a list**: nothing in this repository enumerates which secrets production needs, so "set them again" rests on somebody remembering. That belongs in `docs/secrets.md` rather than in a backup, and it is [#255](https://github.com/build-once/team-tasks/issues/255) — which also covers the three new secrets, named in no document today |
| **The deploy credentials** — the GitHub environment `supabase-production`: `PRODUCTION_SUPABASE_DB_URL`, `PRODUCTION_SUPABASE_ACCESS_TOKEN`, `PRODUCTION_SUPABASE_PROJECT_REF`, the variable `PRODUCTION_SITE_URL`, and now the three the owner added on 10 Oct 2026 | The pipeline's ability to apply a migration or deploy a function | **Nothing, deliberately, and one of them cannot be backed up even in principle.** A GitHub secret cannot be read back once set — it can only be overwritten — so the only readable copy of a value put there is wherever the owner kept it | **The passphrase is the one that matters**, and it has its own section below. For the rest: re-issuable, same as above |
| **The project's own configuration** — what is *not* in `supabase/config.toml`: the Auth redirect URLs, the email templates, the Storage settings, the Spend Cap, the organisation | A working project that nobody can sign in to, or one that bills without a cap | **Partly this repository.** `supabase/config.toml` is in git and the migrations are the schema. Everything set in a dashboard is **not** in git | **Not confirmed how much is dashboard-only**, because nobody has gone through production's settings pages and written down which are not expressed in this repository. It is the quiet half of "how long are we down": a restored database in a project with the wrong redirect URL is a project nobody can sign in to |
| **The code, the migrations and the history** | The app | **GitHub**, plus every clone on a laptop. This is the best-covered thing in the project and the only one with many independent copies | None worth writing down. The repository is public, so it is also the one place where "many copies" is not a hope |
| **Resend** — the sent-invitation logs | Proof an invitation went out | Resend's own, outside this project. `docs/plan.md`'s appendix: "30 days on the free plan" | **No gap worth closing.** It is a log about our own sending, not the app's content, and it expires by design |
| **Sentry** — error reports | Error reports | Sentry's own. **Nothing is installed, so nothing has ever been sent** | None. And **not confirmed** how long Sentry keeps a report on the free plan — `docs/costs.md` and `docs/plan.md` both carry that gap already |
| **Anthropic** — one task title per press of Suggest subtasks | Nothing of ours. The suggestions are not stored here unless somebody adds one, and then they are an ordinary `tasks` row | Anthropic's own retention, cited in `docs/plan.md`. **Nothing is installed on production, which has no `AI_API_KEY`** | None. This row is in the map so that "every place data lives" is actually every place — not because it needs a backup |

### Two things that table says that are easy to read past

**The files are the only total gap, and they are also the only thing in this app nobody can retype.**
Everything else in the map is either covered, re-issuable, or re-creatable by a person who remembers.
That is not a coincidence — it is why #248 is the issue this build answers.

**"Backed up" and "restorable" are different claims, and NOW BOTH HAVE EVIDENCE — ONE OF THEM IN THE
WRONG FILE.** This paragraph said "Nobody has ever restored one". Where it stands:

| `checklist/launch.json` item | Evidence file | On disk? |
|---|---|---|
| `restore-tested` | `evidence/restore-tested.md` | **YES**, as of this change: the finished drill of 10–11 October 2026, 219 seconds, 47 tables, 269 rows, one file |
| `backups-on` | `evidence/backups-on.md` | **NO.** The owner read production's Backups page on 10 October and saw seven daily physical backups; that observation is in `evidence/production-log.md`, which is not the file the launch check reads |

So [#249](https://github.com/build-once/team-tasks/issues/249) is **half closed and stays open**, and
the half that keeps it open is a file nobody has written rather than a thing nobody has done. Its own
first condition asks for the **retention** read off the page rather than inferred from how many backups
happen to be listed, which is the part still missing.

**Note what the restored copy was, because it bounds the claim**: production holds 269 rows and one
file. A restore of that is not a measurement of restoring a used production, and nothing here pretends
it is.

## What Supabase's own backups do and do not include

Gathered in one place, cited, because three claims in this repository rest on it and one of them is
in doubt.

| Claim | The quote, from [Database Backups](https://supabase.com/docs/guides/platform/backups), read 2026-10-10 |
|---|---|
| Storage is **out** | "Database backups do not include objects you store via the Storage API, as the database only includes metadata about these objects." |
| Pro keeps **7 days** of dailies | "Pro Plan projects can access the last 7 days of daily backups." (Team 14, Enterprise up to 30) |
| A daily backup can lose **a day** | "Even with daily backups, you could still lose a day's worth of data. With PITR, you can back up to the point of disaster." |
| Finer granularity is a **paid add-on** | "Point-in-Time Recovery (PITR) allows you to back up a project at shorter intervals, giving you the option to restore to any chosen point with up to seconds of granularity." … "Pro, Team and Enterprise Plan projects can enable PITR as an add-on." |
| Physical, on current Postgres | "All projects on Postgres `15.8.1.079` and newer use the newer physical backup process." — which matches the owner's reading of "physical" on the dashboard |
| The Free plan is told to **export its own** | "We recommend that free tier plan projects regularly export their data using the [Supabase CLI `db dump` command]" |

**And the claim in doubt.** `docs/stack.md` says "Automatic daily backups come with **Pro only**.
Production has them; free staging has none." Production's seven backups are dated **3 to 9 October**,
every one of them **before** the Pro transfer on the 10th — so dailies were being taken while
production was still in a free organisation. The quote above is the nearest thing read here to
Supabase's own position and it recommends free projects export for themselves, which points the same
way as `docs/stack.md`; it does not explain the dates. **Which of the two is wrong is still not
established** ([#247](https://github.com/build-once/team-tasks/issues/247)), and nothing on this page
resolves it. What it does mean for staging is unchanged and worth repeating: **keep nothing on staging
you would mind losing.**

## Where the data is held, which is a question this page can now answer

Added 2026-10-10, from the owner. Until this section there was no one place that said where any of it
physically is — and a copy of everything, going to a company in a different part of the world from the
database it came from, is the point at which that stops being a detail.

| What | Where | How it is known |
|---|---|---|
| **Production's database** — and with it the accounts, and the `attachments` bucket, which lives in the same project | **West US (Oregon), `us-west-2`** | The **owner's screenshot** of the project's settings, 10 Oct 2026. Nobody writing this opened a dashboard |
| **Supabase's own daily backups** of that database | **Not established.** The pages read on 2026-10-10 do not say, and nobody has asked | — |
| **The nightly copy**, in `team-tasks-backups` | **Western Europe, `WEUR`** | The owner's report of 10 Oct 2026; the coach saw that settings page |
| **Sentry**, if it is ever installed | **United States** — the owner's choice of 5 Oct 2026 | `docs/plan.md`, "Error reports to an outside service". Nothing is installed, so nothing has been sent |
| **Anthropic**, one task title per press of Suggest subtasks | **Not established, and not asked.** `docs/plan.md` cites what Anthropic keeps and for how long, and nothing about where | — |
| **Vercel**, the app itself | **Not established** | — |

**So the nightly copy crosses an ocean, and that is worth saying out loud.** Production's data sits in
Oregon; the copy of it sits in Western Europe. Three things follow, and none of them is a problem to
solve today:

- **It is ciphertext the whole way.** The encryption happens on GitHub's runner before anything leaves
  it, so what crosses is a file Cloudflare cannot open. That is the same sentence as everywhere else on
  this page; it is simply more load-bearing now.
- **The runner is a third place.** For the few minutes the job runs, production's whole database is in
  plaintext on a GitHub-hosted machine in whatever region GitHub chose — which nobody has established
  either. This page already states that cost; the geography is new and does not change it.
- **Nobody chose this pairing on purpose.** The bucket's region was picked when the bucket was made, the
  project's region when the project was made, and the two were not compared until today. Were it being
  chosen now the question would be whether a copy should live in the **same** region as its source
  (fewer moving parts, no ocean) or a **different** one (survives a regional failure). It happens to be
  the second, which is the more useful of the two for a backup — **so nothing is being changed on the
  strength of an accident, and nothing needs to be.** If it ever is: an R2 bucket's region cannot be
  changed after it is made, so it would mean a new bucket and a new lifecycle rule.

**And a related thing the owner has settled, which belongs on this page because the copy is the biggest
consumer of what it governs: the Supabase Spend Cap on the `DHTA Ltd` organisation is ENABLED** — the
owner, 10 Oct 2026. That is the control `docs/costs.md` calls "the strongest of any service here", and
it had not been set when production moved to Pro that morning. It answers part of
[#250](https://github.com/build-once/team-tasks/issues/250); what that issue still holds is the figures
and the stale sentences on the costs page, and the fact that **compute is excluded from the Cap**, so
about $25 a month bills whatever the Cap says.

**And it is a thing people must be told, not only a thing this page knows.** The owner's instruction of
10 Oct 2026: **Build it 26's privacy page must say where data is held.**
[#204](https://github.com/build-once/team-tasks/issues/204) is the page, and `docs/plan.md` carries the
requirement beside the rest of what that page has to say.

**One practical use for the first row, today.** `PRODUCTION_SUPABASE_S3_REGION` is the variable the
nightly job stops without, and a Supabase project's Storage is in the project's own region — so the value
is **expected to be `us-west-2`**. That is an inference from the screenshot, not a reading of the page
that matters: Supabase says to use "the region value displayed on the S3 configuration page", and **that
page is the authority**. Set it from there.

## What Build it 24 adds, and why it is shaped that way

`docs/plan.md` is the decision; this is the one-paragraph version. **A nightly copy of production's
whole database and of every file in the `attachments` bucket, encrypted on GitHub's runner before it
goes anywhere, written to a private Cloudflare R2 bucket named `team-tasks-backups`.** Cloudflare is a
new company holding this app's data, and it holds it **only in encrypted form**.

**What it reads production with, decided by the owner on 2026-10-10.** This paragraph said the design was
not buildable because nothing in production's GitHub environment can read a file's bytes —
`PRODUCTION_SUPABASE_DB_URL` reaches the database, which holds the file *metadata* and not the files, and
`PRODUCTION_SUPABASE_ACCESS_TOKEN` is scoped to Edge Functions. **The answer is a Supabase S3 access key
for the production project**, as two GitHub environment secrets, **accepted with its stated cost** —
Supabase's own words, that such keys "provide full access to all S3 operations across all buckets and
bypass RLS policies" — **and never the service-role key, because that one can write to `tasks`.** That
closes [#254](https://github.com/build-once/team-tasks/issues/254).
`docs/architecture.md` → "The nightly copy" has the two secret names and what the key reaches.

**Three things it is not.** It is not a replacement for Supabase's own daily backups — those stay, and
they are the faster route back for the database alone. It is not PITR; the window is still about a day.
And it is not a restore: a copy nobody has restored is a belief, which is why the drill below is part of
this build rather than a later nicety.

### What makes it answer #248 rather than merely mention it

[#248](https://github.com/build-once/team-tasks/issues/248) is "production's backups do not include
Storage, so attachments are not backed up and the plan does not say so". **This nightly copy is exactly
what that gap needs**, and it is worth being precise about which of #248's four conditions it meets,
because it does not meet all of them:

| #248 asks for | This build |
|---|---|
| 1. `docs/plan.md`'s "Files attached to a task" section says whether attachments are backed up and what losing them would mean, and the appendix row agrees | **Done here.** The plan's attachments section now points at the new backup section, and the appendix gains a row for the nightly copy |
| 2. `docs/stack.md`'s Backups bullet says what the cover is and is not | **NOT done.** `docs/stack.md` is not one of the files [#252](https://github.com/build-once/team-tasks/issues/252) permits changing, so that bullet still reads "Production has them", which is true of the database and not of the bucket. #248 stays open for it |
| 3. The owner has **decided** what to do about it, written down and dated | **This is the decision**, once the owner confirms the open points at the top of the pull request. Not "accept it": do something about it |
| 4. If the answer were "accept it", the app says so where it tells somebody what happens to their files | **Not applicable if the copy is built** — but see the deletion consequence below, which the app *does* have to say, in Build it 26 |

So #248 is **answered in substance and not closed**, and the half that keeps it open is one bullet in a
file this pull request may not touch.

## What the owner must set by hand, and the exact names the workflow will expect

**The owner's decisions of 10 October 2026 turned into a list of things somebody has to go and do.** None
of it can be done from this repository, and none of it can be done by the coding assistant (rules 1, 10
and 19). It is written down because a decision that lives only in a pull request is a decision nobody
can act on later.

**EVERY ITEM ON IT IS NOW DONE BUT ONE, and the one is a proposal rather than a task.** This paragraph
said "**not one item below has been set or seen by anybody writing this page**". The settings the job
needs are done because **three copies of production exist and a run that reads production and writes to
R2 cannot succeed without them** — that is the strongest thing this repository can say about a value it
must never see, and it is stronger than the owner's word. **Nobody writing this page has still seen any
of them.** What is left is the **13-day bucket lock**, which the owner asked to have proposed and has
not accepted.

**Read the names as fixed.** A workflow reads a secret by its exact name, and a GitHub secret that was
deleted, renamed or never created **expands to an empty string rather than raising an error** —
`migrate-production.yml` has a whole step and a long comment about exactly that. A typo here is a backup
job that runs and encrypts nothing.

### GitHub → Settings → Environments → `supabase-production`

| Name | Kind | Status | What it is |
|---|---|---|---|
| `BACKUP_STORAGE_KEY` | secret | **set 10 Oct 2026**, owner-reported | the R2 token's access key id |
| `BACKUP_STORAGE_SECRET` | secret | **set 10 Oct 2026**, owner-reported | the R2 token's secret |
| `BACKUP_PASSPHRASE` | secret | **set 10 Oct 2026**, owner-reported | what the copy is encrypted with. **The password manager holds the only readable copy** — see the section below |
| `PRODUCTION_SUPABASE_S3_ACCESS_KEY_ID` | secret | **set — proved by a green run**, not by anybody's word | the Supabase S3 access key's id, for reading the bucket |
| `PRODUCTION_SUPABASE_S3_SECRET_ACCESS_KEY` | secret | **set — the same** | its secret half |
| `BACKUP_STORAGE_ENDPOINT` | **variable, not a secret** | **set — the same** | the R2 S3 endpoint, `https://<cloudflare account id>.r2.cloudflarestorage.com`. **A variable because an endpoint is not a credential, and not in this repository because the value embeds the account id and this repository is public** |
| `PRODUCTION_SUPABASE_S3_REGION` | **variable, not a secret** | **set — the same** | the production project's own region, which S3 request signing needs. **It was found by writing the code**, not by designing it: Supabase's page says to use "the region value displayed on the S3 configuration page" ([S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication), read 2026-10-10), so there is nothing to derive it from. The job **refuses and names this variable** rather than signing with a region somebody guessed |

**"Proved by a green run" is the strongest thing this repository can say about those four**, and it is
worth being precise about what it does and does not establish. The scheduled run of 11 October read
production's database with `pg_dump`, listed the `attachments` bucket with a signed S3 request, and
wrote 1,309,424 bytes to R2 — none of which is possible with a missing or wrong value, because the
workflow's first step refuses an empty one by name and the S3 gateway refuses a wrong one. So **the
four exist and work**. What it does not say is **what they are**, and nobody writing this page has seen
one.

**And the freshness watcher needs no new setting**, which is deliberate:
`.github/workflows/backup-freshness.yml` reads `BACKUP_STORAGE_ENDPOINT`, `BACKUP_STORAGE_KEY` and
`BACKUP_STORAGE_SECRET` — three of the nine above and **not `BACKUP_PASSPHRASE`**, so the thing that
watches the bucket cannot open what is in it.

**The two `PRODUCTION_SUPABASE_S3_*` names are a naming choice rather than something the owner specified**,
and the reasoning is in `docs/architecture.md`: this repository prefixes a credential by **which project it
reaches**, because `docs/environments.md`'s rule is "Separate projects, separate keys. Never reuse a key
between them." Change them if you would rather, in both places, before part 1 is written.

**Nothing else in GitHub needs changing, and one thing specifically does not.** A scheduled workflow runs
on the default branch, and `.github/workflows/drift-check.yml` **already** runs on a schedule in this same
environment and reaches its secrets — its run [37936434092](https://github.com/build-once/team-tasks/actions/runs/37936434092)
succeeded on a schedule on 9 October 2026. So the environment's deployment-branch rule already permits
this shape, read off a run rather than assumed. The `issues: write` permission the failure notification
needs lives in the **workflow file**, which is Build it 24 part 1 and not a setting.

### Cloudflare → R2 → `team-tasks-backups`

| What | Status | The exact thing |
|---|---|---|
| The bucket | **done 10 Oct 2026**, owner-reported | private, region **Western Europe (WEUR)**, public development URL **disabled**, no custom domain. The coach saw that settings page |
| The API token | **done 10 Oct 2026**, owner-reported, **and it had to be changed** | `team-tasks-backup-job`, limited to that bucket. **It was created as Object Read ONLY, and the owner changed it to Object Read & Write — which is what ended the 403s.** That is the cause of the three failed runs above, established rather than guessed: `AccessDenied` meant exactly what it said, a real credential that was not allowed to write. **Left as it is otherwise**, by the owner's decision of 10 Oct |
| **An object lifecycle rule** | **DONE 10 Oct 2026**, owner-reported | Named **`delete-after-14-days`**, whole bucket, **delete after 14 days**, shown as **Enabled**. This is what enforces retention — `docs/plan.md`'s decision of 10 Oct is that **the job never deletes anything** — and until it existed, "14 days" was a promise in five documents with nothing making it true ([#259](https://github.com/build-once/team-tasks/issues/259)). **Nobody writing this page has seen it**, and nothing in this repository can read an R2 rule; what can be checked is the consequence, in about a fortnight, when the copy of 10 October either goes or does not |
| **A bucket lock rule** | **STILL PROPOSED, awaiting the owner** | Age condition, **`maxAgeSeconds` 1123200** — 13 days — whole bucket. `docs/plan.md` has what it buys and the one thing that keeps it a proposal. **If it is taken, set a one-day Age first and watch a delete be refused**, because nothing read says a lock can be removed or shortened. [#277](https://github.com/build-once/team-tasks/issues/277) holds it |
| The endpoint | **DONE** | copied into `BACKUP_STORAGE_ENDPOINT` above. Not into this repository |

**Both rules need a token or a dashboard session that can edit bucket configuration**, which the backup
job's token is not: the lock page asks for "An API token with permissions to edit R2 bucket
configuration", and the scope described as allowing "edit bucket configuration" is **Admin Read & Write**
([R2 API tokens](https://developers.cloudflare.com/r2/api/tokens/), read 2026-10-10). **That is the
point rather than an inconvenience** — the job can write a copy and cannot change the rules that protect
it.

### Supabase → the production project

| What | Status | The exact thing |
|---|---|---|
| **An S3 access key** | **DONE — proved by a green run**: the job listed the `attachments` bucket with a signed S3 request on 10 Oct and has done three times since | generated from the project's S3 configuration page ([S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication), read 2026-10-10), then its two halves into the two GitHub secrets above. **Know what it reaches**: "full access to all S3 operations across all buckets", with row-level security bypassed. That cost was accepted on 10 Oct and is unchanged |
| **The Spend Cap** | **ENABLED 10 Oct 2026**, owner-reported, and it is not strictly a backup setting | Production went on Pro on 10 Oct, so the organisation can bill. The Cap is on; **it excludes compute**, so about $25 a month bills whatever it says ([#250](https://github.com/build-once/team-tasks/issues/250) still holds the figures and the stale sentences on the costs page). It is on this list because **the nightly copy is the biggest new consumer of the egress that Cap governs** — `docs/costs.md` puts the worst case at 18.6 GB a month |

### And one thing to check rather than set

**That `BACKUP_PASSPHRASE` really is in the password manager.** It is the one value on this page that
cannot be re-issued, a GitHub secret cannot be read back, and **a passphrase that was generated, pasted
into GitHub, and not saved anywhere else is already lost** — it just has not been noticed yet. The section
below is the whole argument.

## The one thing that cannot be recovered: the passphrase

**A copy can be opened only by somebody holding both halves**: the **storage key**, which gets the file
out of R2, and the **passphrase**, which decrypts it. Neither alone is enough.

**Where the passphrase is, and nowhere else.** Two places, by the owner's report of 10 Oct 2026:

1. the **owner's password manager**, where it was put after being generated on the owner's own PC;
2. a **GitHub environment secret**, `BACKUP_PASSPHRASE`, in the `supabase-production` environment.

**And only one of those two can be read.** A GitHub Actions secret cannot be read back after it is set
— it can be overwritten, and a workflow can use it, but nobody can display it. So the password manager
is **the only readable copy in existence**, and the GitHub secret is a second copy only in the sense
that the job can still run.

**If the passphrase is lost, no copy can be opened.** Not by the owner, not by Cloudflare, not by
Anthropic, not by anybody. Every file in the bucket becomes bytes. That is the price of encrypting
before the data leaves the runner, and it is the right price — the alternative is a copy of
production's entire database, accounts included, sitting at a company with a key somebody else holds —
but it means the passphrase is now **the single most valuable string in this project**, ahead of the
service-role key, because a leaked service-role key can be rotated and a lost passphrase cannot be
recovered.

It therefore belongs in the same sentence as the two rules it is governed by: it is **never** written
into a file in this repository, printed, or pasted into a chat (rule 7), and **the coding assistant and
the coach never receive it or any file encrypted with it.**

## What the encryption is, and the one thing it does not do

Added 2026-10-10 at the coach's request, in the review of
[PR #265](https://github.com/build-once/team-tasks/pull/265). A property this important should be
written where somebody looking for it would look, not left to be read off `scripts/backup/lib.mjs`.

**What it is.** **AES-256-CBC**, with the key derived from the passphrase by **PBKDF2-HMAC-SHA256 with
600,000 iterations**, written in **OpenSSL's own `enc` file format** — the literal `Salted__`, an 8-byte
salt, then the ciphertext. So a copy can be opened with stock `openssl` and **does not depend on this
repository's code**, which is the whole reason that format was chosen over anything of ours.
`docs/restore-runbook.md`'s last section is the two-command route, and the CI proof hands a real copy to
the real `openssl` binary and requires the container back byte for byte.

**AND IT IS NOT AUTHENTICATED ENCRYPTION.** CBC has no authentication tag, so **decryption alone cannot
tell you whether a copy has been damaged or altered.** A wrong passphrase shows up as padding that does
not decode, which is a hint and not a proof; bytes changed by somebody who knew what they were doing
would not announce themselves at that layer at all.

**What detects it instead, and why that is enough here.** The **checksums inside the copy** do the job
the cipher does not:

| | |
|---|---|
| **Every entry** carries the SHA-256 of its stored bytes **and** of its contents, in the container's header | so a flipped bit anywhere is caught when the entry is read — `scripts/backup/proof.mjs` flips one and requires the read to fail |
| **The manifest** carries the dump's checksum and every file's, inside the ciphertext | so a copy that decrypts and does not match what it says it holds is refused, on the way in **and** on the way back out, by the same function |
| **The stored object** is checked after upload by size, by ETag and by **reading the bytes back and comparing a SHA-256** | so a copy damaged in transit is caught the night it is made rather than the day it is needed |

So the integrity guarantee is real and it lives **one layer in**, after decryption, rather than in the
cipher. **Accepted as written by the coach on 2026-10-10.** What would change it is a format with a tag
— AES-256-GCM, or a detached HMAC — and the cost would be the thing the current choice buys: stock
`openssl` could no longer open a copy, so the data would depend on this repository's code surviving. For
a backup, that trade is the wrong way round.

**The honest limit, stated plainly:** anybody who can write to the bucket can replace a copy with
rubbish, and nothing in the file itself will say so until somebody tries to restore it — at which point
it will say so clearly. The things that make that unlikely are the token being limited to one bucket, and
the **13-day Bucket Lock** proposed in `docs/plan.md`, which would stop an overwrite outright. That is
one more argument for the lock than it had before.

## The restore drill

A backup that has not been restored is a belief about a backup. The drill is what turns the "time down"
target from an aspiration into a measurement, and it is the only thing that can settle
[#249](https://github.com/build-once/team-tasks/issues/249)'s `restore-tested`.

**IT HAS NOW BEEN DONE, 10 to 11 October 2026, AND IT SETTLED `restore-tested`.** The owner restored
the 15:07 copy of 10 October into a new project in the Pro organisation, with this repository's 11
migrations applied first; compared it; pointed a local copy of the app at it and signed in with his own
real account; opened the attachment; and **deleted the project on 11 October**, along with the local
files holding its secrets and the passphrase. `evidence/restore-tested.md` is the record — counts,
timings and verdicts, which is all this repository is allowed to hold.

**All six of the things a drill has to establish, below, were established.** What it also did is what a
drill is for: **it found three faults**, two of them in this repository's own code, and they are at the
top of this page. The one worth repeating here is that the first attempt **stopped at the files** with
`415 InvalidMimeType` — so the half of the drill the whole build exists for came within one bug of never
being exercised at all.

**What is still not done: a second drill.** 219 seconds is one measurement, of a production holding 269
rows and one file. Nothing here knows what a used production costs to restore.

**`docs/restore-runbook.md` is now the step-by-step**, written with the code in Build it 24 part 1:
which copy, how to open it, how to put it back into a new temporary project, how to check it came back,
what has to be set again by hand, how to prove a copy is unreadable without the passphrase, and
deleting the project as the last step rather than as tidying up. This section stays because it is the
*policy* — where a restore may happen and what never leaves — and the runbook is the procedure.

**Where it happens: a new temporary project, and nowhere else.**

- **Never into production.** Obvious, and rules 1 and 10 forbid it anyway.
- **Never into staging.** Less obvious and more important: staging holds fake data and the Alice / Bob /
  Carol accounts, and `docs/environments.md` says "Production data is never copied to local or staging."
  A restore drill into staging would break that rule with real volunteers' task text, and it would do it
  into the one project the coding assistant has keys for.
- **Into a project created for the drill and deleted the same day.** Not kept "in case it is useful
  later": a second copy of production's data in a live project is a second thing to protect, and nobody
  is watching it.

**What the assistant and the coach never get.** No backup file, no part of one, no decrypted dump, no
passphrase, and no row out of a restored project. The drill is the owner's, start to finish. What this
repository can hold is the **procedure** and the **evidence of a run** — counts, timings and pass or
fail — which is what `evidence/restore-tested.md` is for and why that file does not exist yet.

**What a drill has to establish**, so that a run either passes or fails rather than being reassuring:

1. The encrypted file downloads from R2 and **decrypts with the passphrase from the password manager** —
   not from the GitHub secret, because the password manager is the copy a person will actually reach for
   at 2 a.m.
2. The database loads into an empty project, **accounts included**, and somebody can sign in as a test
   account that existed in the copy.
3. The **files** come back, and a signed link opens one and its bytes match.
4. The counts agree: rows per table, and objects in the bucket, against what the copy said it held.
5. **How long all of that took**, wall-clock, written down — because that number is the answer to the
   second target and nothing else is.
6. The temporary project is **deleted**, and that is recorded too.

**Which organisation the temporary project goes in: the Pro one — the owner's decision of 2026-10-10.**
Not the free organisation staging lives in, which would have cost nothing and allows a second project, and
which would have put production's real data in the organisation the coding assistant holds keys for. The
Pro organisation bills by the hour, so a drill is **5 to 33 cents** and a project somebody forgets to
delete is about **$10 a month** — which is why step 6 above is part of the drill rather than tidying up
afterwards. `docs/costs.md` → "A restore drill" has the three options as they were put and the arithmetic.

## What the job may read, and what stops it keeping or printing any of it

**The job reads all of production's data.** There is no narrower version of it: a backup of everything
is a read of everything. So this is the most powerful thing that will ever run in this repository's CI,
and the controls on it are worth listing one by one rather than summarising.

| What could go wrong | What stops it |
|---|---|
| **The data is printed into a public run log.** This repository is public, so its Actions logs are | Nothing is ever echoed but **names, byte counts and statuses** — the same rule `migrate-production.yml`'s smoke-test job already follows and documents. No `cat`, no `head`, no sample row, no `set -x`, and **no row counts of real tables** in the log |
| **The plaintext dump is uploaded as an artifact.** This is the easy mistake and the worst one: an artifact is a downloadable copy of production's whole database, and on a public repository it is downloadable by anybody who can read the repository | **`actions/upload-artifact` is not used, at all.** The only thing that leaves the runner is the encrypted file, and it goes to R2 |
| **The plaintext dump outlives the job** | It is written to the runner's own temporary directory, never to the checkout, and the runner is destroyed when the job ends. Nothing is written into the repository, so nothing can be committed by accident |
| **A secret is printed, or ends up in a process list** | Every secret arrives through `env:` and is **never interpolated into a command line** — the pattern the three existing production jobs use, with the reasoning written beside them. The passphrase is passed to the encryption tool on **standard input or a file descriptor**, never as an argument |
| **A pull request runs it** | It has **no `pull_request` trigger**, and it uses the `supabase-production` **environment**, so the secrets are reachable only by the workflow the owner means to run. `permissions: {}` at the top, `contents: read` on the job, exactly as the production workflow does. **This row said "and no `workflow_dispatch`" until 2026-10-11, and the job has had one since Build it 24 part 1** ([#258](https://github.com/build-once/team-tasks/issues/258) asked for "nightly on a schedule and by hand"). What protects this is the **environment**, not the absence of a trigger: a manual run from any branch but `main` is handed no secrets and stops at the first settings check. The workflow's own header says so at length. **`docs/architecture.md` and `docs/secrets.md` still carry the old sentence** — [#274](https://github.com/build-once/team-tasks/issues/274) |
| **It fails quietly and nobody notices for a month** | **A silent backup job is worse than none**, because it manufactures confidence. No `continue-on-error`, and the run must go red on any failure — **and then it OPENS A GITHUB ISSUE, as `drift-check.yml` already does, as well as GitHub's own failure email** (the owner's decision of 2026-10-10). Both, because the email reaches a person on the day and the issue is still there next week. The body names what failed and when and carries **no row, no path, no file name and no part of a secret** — an issue on a public repository is as public as the log. `docs/architecture.md` has the pattern it copies, down to the exact-title match that stops thirty issues in a month. **What neither catches** is the workflow not running at all, which GitHub does to a quiet public repository after 60 days |
| **It encrypts to nothing** — a missing or empty passphrase, so the file lands readable or the upload lands empty | Each of the three secrets gets its **own** "is it set and non-empty" step before anything runs, printing **only the name** — exactly the shape `migrate-production.yml` uses and explains, for exactly the reason it gives: a deleted or renamed GitHub secret expands to an empty string rather than raising an error |

**And the honest cost, stated rather than left to be noticed.** For the few minutes the job runs,
**production's entire database — every task, every address, every password hash — is in plaintext on a
machine this project does not own**, a GitHub-hosted runner. That is unavoidable for any copy made this
way, it is the reason the encryption happens on the runner rather than after the upload, and it is the
reason the job does as little as possible between the dump and the encryption.

**One more, which is about the schedule and not the data.** GitHub's own words: "The `schedule` event can
be delayed during periods of high loads of GitHub Actions workflow runs. High load times include the
start of every hour", **"If the load is sufficiently high enough, some queued jobs may be dropped"**, and
"In a public repository, scheduled workflows are automatically disabled when no repository activity has
occurred in 60 days"
([Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows),
read 2026-10-10 for the first and third, and **2026-10-11** for the second). So **a nightly copy is
nightly-ish**, a night's copy can **not happen at all**, and in a quiet repository the whole thing
**stops happening** without anybody being told. All three belong in the gap column of this page rather
than in a footnote: the first means the window is "about a day" and not "exactly a day", the second means
it can be two, and the third means "nothing has run for two months" is a state this design can reach.

**AND THE FIRST ONE IS NO LONGER A CAUTION — IT IS MEASURED. 2026-10-11:** the first scheduled run
started **5h 57m 24s** after its cron time. "The two targets" at the top of this page is reworded for it
and carries the arithmetic. The off-the-hour minute GitHub recommends was already being used — the cron
is `23 1 * * *` — and it bought nothing on the one night there is data for, which is worth knowing before
anybody proposes moving the minute again as a fix.

**The middle one has never been observed here and is the one with no answer at all.** A dropped run and
a run that was never scheduled look identical from inside this repository: no run, no failure, no email,
no issue. That is [#264](https://github.com/build-once/team-tasks/issues/264), and the proposal at the
end of this page is the only thing on this page that would tell the difference.

## Not confirmed, and how to settle it

Gaps in this page, not findings. **Six of them are gathered in
[#256](https://github.com/build-once/team-tasks/issues/256)**, with what to read or try for each and how
somebody else can tell it is settled — the same way
[#231](https://github.com/build-once/team-tasks/issues/231) gathers the Storage ones.

**And six more arrived with the code, each with its own issue** — Build it 24 part 1, 2026-10-10:
[#259](https://github.com/build-once/team-tasks/issues/259) the settings and the lifecycle rule that do
not exist; [#260](https://github.com/build-once/team-tasks/issues/260) nothing verified against the real
services; [#261](https://github.com/build-once/team-tasks/issues/261) the signer checked only against
itself; [#262](https://github.com/build-once/team-tasks/issues/262) `pg_dump` 16 against production's
unread version; [#263](https://github.com/build-once/team-tasks/issues/263) the size ceiling nobody has
measured; [#264](https://github.com/build-once/team-tasks/issues/264) nothing noticing if the copy stops
happening. **Two of those six
decide what gets built** rather than merely what may be claimed: whether a Supabase backup includes the
`auth` schema at all, and whether a Storage read made with an S3 access key is metered as egress.

- **Not confirmed — whether Supabase's backups include the `auth` schema**, which is where the accounts
  and their password hashes are. The pages read on 2026-10-10 say backups contain database data and name
  **Storage** as the exclusion; none says "auth is included". Settle it with a Supabase page that lists
  what a backup contains, or by restoring one and looking.
- **Not tried — restoring any SUPABASE backup**, which is a different thing from the drill and stays
  open. The dashboard's "Restore to new project" is marked **Beta**, by the owner's reading of 10 Oct
  2026, and nobody has pressed it. **A copy of OURS has now been restored** — 219 seconds, the drill of
  10–11 Oct — so the "how long are we down" target has a measurement behind it; the faster route back
  for the database alone is still a belief.
  [#249](https://github.com/build-once/team-tasks/issues/249).
- **Not measured twice — the 219 seconds.** One run, against a production holding 269 rows and one file
  of 1,178,671 bytes. It is the only number this repository has for "how long are we down", and it is a
  floor rather than an estimate: it does not include making the project, applying the migrations, or
  setting what the copy deliberately leaves out. `evidence/restore-tested.md` has each step's timing.
- **Not established — whether `docs/stack.md` or production's own dashboard is right about dailies being
  Pro-only.** [#247](https://github.com/build-once/team-tasks/issues/247).
- **Not priced — PITR.** It is named above as the thing that would close the one-day window, quoted from
  Supabase's page. No price for it was read on 2026-10-10 and none is written anywhere in this
  repository.
- **Not confirmed — which of production's settings exist only in a dashboard.** Nobody has walked the
  project's settings pages against this repository, so the "how long are we down" target rests partly on
  something nobody has inventoried.
- **Answered 2026-10-10 by building it: neither `gpg` nor an S3 client is needed, and the two tools that
  ARE needed are documented on the image.** This entry said "Not confirmed — that `gpg` and an
  S3-capable client are present on `ubuntu-latest`", and the answer was to need neither: the encryption
  is Node's own crypto writing **OpenSSL's `enc` file format**, and the four S3 operations are `fetch`
  with a signature computed in forty lines. **No new dependency, so rule 17 never came up.** What the
  job does depend on is `pg_dump` and `psql`, and the image's own README — read 2026-10-10 — says
  "PostgreSQL 16.15 / User: postgres / PostgreSQL service is disabled by default", which is why the
  workflow pins `ubuntu-24.04` rather than `ubuntu-latest` and **checks for both programs by name
  before it reads anything**. `openssl` is on the image too ("OpenSSL 3.0.13-0ubuntu3.16"), and the CI
  proof uses it to show a copy opens with standard tools alone — but the backup itself does not.
- **ANSWERED AND FIXED, 2026-10-10 — production is PostgreSQL 17.6, and the runner now installs a 17
  client.** This entry said "the likeliest first-night failure: `pg_dump` 16 against production's
  Postgres … production is on 15.8 or newer and **nobody has read which**". The coach read it through the
  production read-only connector that day: **`server_version` = 17.6**
  (`evidence/production-log.md`, 10 Oct). So the answer was the bad one — the runner's 16.15 client would
  have been refused by its own version check **every night**, copying nothing.

  **The owner approved installing a client (rule 17) and `scripts/backup/install-pg17.sh` is it**, run by
  both workflows. What it does and why that way is in its own header; the short version is the
  PostgreSQL project's own apt repository, with the signing key verified against a **pinned SHA-256 and a
  pinned fingerprint** before it is trusted, the major version pinned in the package name, and
  `pg_dump --version` checked to be 17 before anything is read. **The patch version is deliberately not
  pinned**, because a pinned version that leaves the pool would stop the nightly backup — a worse failure
  than a client moving from 17.6 to 17.7.

  **It is still not verified against production**, only against a version 17 server in CI: the proof job
  installs the same client **and** a 17 server with the same script, so the two cannot drift
  ([#260](https://github.com/build-once/team-tasks/issues/260) is the first real run).
  [#262](https://github.com/build-once/team-tasks/issues/262) is closed by this.
- **Not confirmed — anything about the R2 bucket, the token or the three secrets.** All of it is the
  owner's report of 10 Oct 2026: a private bucket `team-tasks-backups` in **Western Europe (WEUR)**,
  public development URL **disabled**, **no custom domain** — the coach saw that settings page — an R2 API
  token named `team-tasks-backup-job` limited to that bucket with **Object Read & Write**, and
  `BACKUP_STORAGE_KEY`, `BACKUP_STORAGE_SECRET` and `BACKUP_PASSPHRASE` in the `supabase-production`
  GitHub environment. **Nobody writing this opened the Cloudflare or GitHub dashboard**, and nothing in
  this repository can show what either is set to.
- **Not confirmed, and now the thing standing between a proposal and a decision — whether an R2 bucket
  lock rule can be removed or shortened once set.** The page read on 2026-10-10 says what a lock prevents,
  for how long, over which objects, and that it beats a lifecycle rule. It carries **no statement that a
  rule can be undone, and no warning that it cannot.** A lock that anybody could shorten would be a weak
  promise, so expecting it to be hard is reasonable and is not evidence. **Settle it the cheap way**: set a
  one-day Age, try a delete, watch it refuse, and see whether the rule can then be taken off.
- **Read off two pages rather than stated by either — that the backup job's token cannot change a lock or
  a lifecycle rule.** The lock page asks for "An API token with permissions to edit R2 bucket
  configuration"; the tokens page gives **Admin Read & Write** as the scope allowing "edit bucket
  configuration", and **Object Read & Write** — the job's scope — as only "the ability to read, write, and
  list objects in specific buckets". **Neither page says in one sentence that an Object-scoped token is
  refused.** Same care as `docs/plan.md` takes about `owner_id`.
- **A CORRECTION, 2026-10-10 — whether the R2 token can delete an object is NOT established.** This list
  said earlier the same day that "Object Read & Write … on the reading here **includes delete**". Nobody
  established that: the tokens page describes the scope as "read, write, and list objects" and **does not
  say whether "write" includes deleting one.** The owner's decision to leave the token alone and look at a
  lock instead is what makes it not matter — a lock stops a delete **and an overwrite** whatever the token
  can do.
- **Decided, so no longer open — the S3 endpoint goes in a GitHub environment variable.** This list
  carried it as a judgement for the owner to overrule, and the owner's decision of 2026-10-10 is that it
  stays out of the repository. The variable is `BACKUP_STORAGE_ENDPOINT`; the reason is the one
  `evidence/production-log.md`'s header gives for the production project reference, and this repository is
  public.
- **Still owner-reported and UNSEEN: every setting on the by-hand list above.** **Nobody writing this
  opened the Cloudflare, GitHub or Supabase dashboard**, and nothing in this repository can read a
  GitHub secret, an R2 lifecycle rule or a Supabase key. What changed on 11 October is the *kind* of
  evidence for four of them, not the fact that they are unseen: a run that reads production and writes
  to R2 cannot succeed with a missing or wrong value, and three have. **That is proof they work and no
  evidence at all of what they are.** The lifecycle rule has no equivalent — nothing checks it, and the
  first thing that will is the copy of 10 October either disappearing in about a fortnight or not.
- **The code has now touched production three times, A RESTORE HAS FINISHED, AND COPIES NOW EXPIRE.
  Rewritten 2026-10-11, for the third time.** This entry said "Nothing in this file has been built or
  run"; then that the one-line test was "**no copy of production has ever been made, and no restore has
  ever been tried**"; then that it was "**nothing has ever been restored end to end**". All three are
  gone. Where it stands now:

  | | |
  |---|---|
  | A workflow and scripts | **yes**, and exercised in CI on every pull request against a throwaway PostgreSQL and a stand-in for both object stores |
  | A copy of production | **THREE.** Two by hand on 10 Oct, and one **by the schedule** on 11 Oct ([38121029695](https://github.com/build-once/team-tasks/actions/runs/38121029695)) |
  | A finished restore | **YES — 219 seconds**, 47 tables, 269 rows, one file byte for byte, signed into with a real account, project deleted. `evidence/restore-tested.md` |
  | Anything expiring | **YES.** A 14-day lifecycle rule named `delete-after-14-days`, on the whole bucket, owner-reported for 10 Oct ([#259](https://github.com/build-once/team-tasks/issues/259)) |
  | Anything noticing if the copies stop | **YES, and it has never run.** `.github/workflows/backup-freshness.yml`, 36 hours ([#264](https://github.com/build-once/team-tasks/issues/264)) |

  **So the one-line test for this page is now the last row: the watcher is built and has never run
  against the real bucket, and a second drill has never been done.** The arithmetic in `docs/costs.md`
  is still arithmetic on a design, because three copies of a near-empty production do not measure what a
  used one costs — and neither does a 219-second restore of 269 rows.
- **PARTLY ANSWERED BY THE RUNS OF 10 AND 11 OCT, and this is the honest scoreboard.** The entry below
  listed four things nobody had checked against the real services. **Three are now checked and two
  remain**, and the fifth row is one the entry below names in its last sentence without putting it in the
  table:

  | | |
  |---|---|
  | The **region** is accepted by Supabase's S3 gateway | **YES.** `PRODUCTION_SUPABASE_S3_REGION` was set to the project's own region and the signed listing was accepted |
  | **`ListObjectsV2` paging** | **STILL NOT CHECKED.** The bucket held 0 objects, then 1. One page was all there was every time. It needs a bucket with more objects than a page |
  | The **upload** | **YES, since 10 Oct 12:56** — the 403 was `AccessDenied`, a permission fault, and the owner fixed the credential. Three copies have been written since |
  | R2's **ETag** being the body's MD5 | **YES.** The scheduled run of 11 Oct printed `Verified by HEAD: 1309424 bytes, and the ETag matches the copy's MD5.` The job checks rather than assuming, so this is the check passing and not an assumption holding |
  | A **5 GB single `PUT`** being allowed | **STILL NOT CHECKED, and cannot be from here.** The largest copy so far is 1,309,424 bytes — about a 4,000th of it ([#263](https://github.com/build-once/team-tasks/issues/263)) |

- **Not verified — anything about how the job behaves against the real services.** Everything the proof
  establishes, it establishes about **our code**: that it signs correctly for a server that recomputes
  the signature, reads a paged listing to the end, refuses an incomplete copy before uploading, encrypts
  in a format `openssl` itself opens, and restores to equal counts and equal bytes. **It establishes
  nothing about Supabase Storage's S3 gateway or Cloudflare R2** — not that the region is accepted, not
  that `ListObjectsV2` pages as the stand-in does, not that R2's ETag is the body's MD5 (the job checks,
  and says so rather than assuming), and not that a 5 GB single `PUT` is allowed. The first real run is
  what settles those, which is why it should be started **by hand** and watched.

## Something DOES notice when no copy has been made for 36 hours — DECIDED AND BUILT 2026-10-11

**The owner's answer was 36 hours, and it is built.** This section was written the same morning as a
proposal, with three defensible answers in it; the recommendation was taken.
`.github/workflows/backup-freshness.yml` and `scripts/backup/check-fresh.mjs` are it, and
[#264](https://github.com/build-once/team-tasks/issues/264) is what it answers.

**What it does, in one line: four times a day it lists `team-tasks-backups`, reads the newest object's
date out of its NAME, and goes red if that is more than 36 hours ago — or if there is no copy at all.**

| | |
|---|---|
| **What it holds** | the endpoint, the storage key and the storage secret. **Not `BACKUP_PASSPHRASE`**, which appears nowhere in that workflow — so the thing that watches the bucket cannot open what is in it. It makes a LISTING and never a GET, so the only bytes it sees are keys and sizes |
| **What it says** | the number of objects, which is the newest, how old it is against the limit, and how many objects it could not date. It prints a key, which carries a date and nothing else |
| **When it fires** | it opens or comments **one** issue with the fixed title "No recent copy of production", the way the backup job does. **And a good check CLOSES it**, which the backup job's own alarm did not do until #272 — so the record is trustworthy in both directions and the next overdue copy opens a fresh issue instead of commenting on one everybody has stopped reading |
| **How soon** | **between 36 and 42 hours** after the last good copy, because the threshold is 36 and the check runs every six hours. Said as a range rather than as "36", which read alone sounds like a promise |
| **Seen to fail** | four cases in `scripts/backup/proof.mjs`, run end to end against the stand-in R2 with no passphrase in the environment: a fresh bucket passes, a three-day-old copy goes red, an **EMPTY** bucket goes red, and a bucket it cannot read goes red rather than reporting "no copy" — because a watcher that could not look has not seen one (rule 8) |
| **What it cannot catch** | **its own silence.** It is a scheduled workflow in the same public repository, so the 60-day rule switches it off too and a bad enough GitHub day drops it as well. #264's fourth condition asks for that to be said rather than discovered, and the workflow's own header says it. The honest end of this chain is an alert from outside GitHub, and this is not one |

**It has never run against the real bucket**, which is the one thing to hold against it. What has run is
the judgement, and the script, against a stand-in.

**The reasoning that chose 36 is kept below**, in the shape it was argued in, because that is how every
other decision on this page is recorded.

**The question, as it was put: should something go red when the newest object in `team-tasks-backups` is
older than it ought to be — and if so, after how many hours?**

### Why it is being asked now rather than left in the issue

Every control in this design watches a run that **fails**. The run goes red, GitHub emails, and a
separate job opens or comments "Backup did not run". **A run that never starts trips none of them**,
because there is no run — and 11 October gave that a second cause rather than one. Until then the only
known way to get no run was the 60-day rule for a quiet public repository. Now there are two:

| How you get no copy | Noticed today? |
|---|---|
| The run fails | **yes** — red, an email, and an issue |
| GitHub **drops** the queued job: "If the load is sufficiently high enough, some queued jobs may be dropped" ([Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows), read 2026-10-11) | **no** |
| A quiet public repository: "scheduled workflows are automatically disabled when no repository activity has occurred in 60 days" (same page) | **no** |
| The cron edited, the file renamed, the environment's branch policy changed, the repository archived | **no** |

The second row is new on 11 October and it is the one that makes this more than hygiene: a drop needs
**no mistake by anybody** and leaves an Actions tab with no failures in it, which looks exactly like a
backup that is working.

### What the delay decides: the threshold cannot be 24 hours

This is the part the measurement settles, and it would have been got wrong without it. The interval
between two copies is not 24 hours — **one on time and the next as late as 11 October's gives 29h 57m
24s**, arithmetic on this page. So:

| Threshold | Against the one delay already measured |
|---|---|
| **24h** | **WOULD HAVE FIRED FALSELY.** A perfectly good copy, 5h 57m late |
| **30h** | Quiet, with **2m 36s** of margin. One worse night and it cries wolf |
| **36h** | Quiet, 6h 02m of margin. Still inside one skipped night, so it would catch a drop |
| **48h** | Quiet, 18h 02m of margin. **What #264 already proposes**, and it tolerates one dropped night without a word |

**The recommendation, and the reason it is a recommendation rather than a decision: 36 hours.** It is the
shortest threshold that is not within one bad night of a false alarm, and it still fires on the **first**
dropped copy rather than the second — which is the failure this is for. 48 hours is the safer number and
the cost is that a dropped night is only reported after the following night also passes. **A watcher that
cries wolf gets ignored, and a watcher nobody reads is worse than none**, so if the owner would rather
never see a false one, 48 is right and the paragraph above says what it costs.

### What it is — five things asked for, and what was built against each

| #264 asked for | Built |
|---|---|
| A scheduled job that lists the bucket and judges the newest object's date, which `objectName()` already makes sortable on purpose | **`.github/workflows/backup-freshness.yml`** and `scripts/backup/check-fresh.mjs`. `dateFromObjectName()` in `lib.mjs` is the other direction of `objectName()`, and anything in the bucket that is not one of this job's own names is **not dated at all** — so a stray object cannot make the bucket look fresh |
| It holds the two `BACKUP_STORAGE_*` settings and the endpoint, and **not the passphrase** | **Three values, and `BACKUP_PASSPHRASE` appears nowhere in that workflow.** The proof runs the script with no passphrase in its environment at all, which is how that is a fact rather than a promise |
| It opens or comments one issue with its own fixed title | **"No recent copy of production"**, matched by exact title the way the backup job and `drift-check.yml` do — `gh issue list --search` matches WORDS, so "No recent copy of production again" must not be mistaken for it. **And a good check closes it**, which is more than was asked for and is the lesson of #272 |
| It is seen to fail first: a three-day-old copy, and an **empty bucket** | Both, plus two more — a bucket it **cannot read** (which must not report "no copy": a watcher that could not look has not seen one), and a threshold somebody typed in words, which must not be read as zero and alarm every day |
| It must say what it does not cover, in its own header | The workflow's header and the script's both do, at length. **It cannot catch its own silence**, and the honest end of the chain is an alert from outside GitHub, which this is not |

### Three answers that were all defensible, and the one that was taken

| | |
|---|---|
| **Yes, at 36h** | **TAKEN, 11 October 2026.** Catches a drop on the first night, no false alarm on the evidence we have |
| Yes, at 48h | #264's own number. Never cries wolf; reports a dropped night a day later |
| No — check it by hand | Entirely reasonable for six volunteers **if** it is written down as a habit with a date, rather than left as an intention. The owner looking at the bucket once a week is a real control; the owner meaning to is not |

**And one thing that was not an answer: doing nothing and leaving this page saying the window is about a
day.** That is the combination the rewording at the top of this page exists to prevent.

### A smaller, separate thing the same morning found — AND IT IS FIXED

**[#268](https://github.com/build-once/team-tasks/issues/268) was still open** — opened by the 12:42
failure on 10 October, three successful copies later — because the job only ever opened or commented and
**nothing closed it when a copy succeeded**. Both halves are now done: **the owner closed #268 by hand on
11 October**, and `backup-production.yml` gained a `close-alarm` job that closes every open issue with
that exact title when a copy succeeds. It holds no environment and no secret, only `issues: write`,
which keeps the separation the failure job already had.

**[#272](https://github.com/build-once/team-tasks/issues/272) stays open anyway**, for its own third
condition: a failure, then a success, then a second failure, seen in sequence against the real thing.
Nothing in CI can reach `gh`, so only a real run settles that — and the second failure is the one that
matters, because it is what proves the next alarm is a fresh issue rather than a comment on a closed one.

**So the public record of this job can now be trusted in both directions, and neither direction has been
watched happen.**
