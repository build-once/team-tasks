# What is backed up, what is not, and what we are going to do about it

A map of every place Team Tasks' data lives, what would be lost if that place failed, what backs it
up **today**, and the gap. Then the two targets, and the nightly copy that Build it 24 adds to close
the gap.

Written 2026-10-10 for Build it 24 part 0 ([#252](https://github.com/build-once/team-tasks/issues/252)),
against commit `cb58926`.

**IT IS NOW BUILT, and NO COPY OF PRODUCTION HAS EVER BEEN MADE.** This paragraph said "Documents only.
Nothing in this file is built: there is no backup workflow, no copy has ever been made, and no restore
has ever been tried." Build it 24 part 1
([#258](https://github.com/build-once/team-tasks/issues/258)) is the first half of that; the second half
is unchanged and is the only sentence on this page anybody should quote:

| | |
|---|---|
| **Built** | `.github/workflows/backup-production.yml`, `scripts/backup/` (the copy, the restore, the format, the proof), and `docs/restore-runbook.md`. Exercised end to end on every pull request against a throwaway PostgreSQL and a stand-in for both object stores — `evidence/build-it-24-nightly-copy.md` |
| **Not done** | **No copy of production exists.** The workflow has never run: it runs on a schedule from `main`, so it cannot until this merges, and **three of the settings it needs have not been created** (below). No restore has ever been tried, and `evidence/restore-tested.md` does not exist |

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

**What today's answers actually are, against those two.** This is the whole point of the map below,
so it is stated before it:

| | Today, for the database | Today, for the attached files |
|---|---|---|
| **Data lost** | **about a day at worst** — Supabase takes a daily backup, so the target is met for the database | **everything, permanently.** Nothing backs the files up at all |
| **Time down** | **not known.** No restore has ever been tried, and the dashboard's "Restore to new project" is marked Beta ([#249](https://github.com/build-once/team-tasks/issues/249)) | not applicable — there is nothing to restore from |

So one of the four cells is a pass, one is a total gap, and two are unknown. A target nobody has
timed a restore against is an aspiration.

## The map

Every place data lives. The second column is what would be lost **if that place alone failed**, which
is the question a backup answers; the third is what covers it **today**; the fourth is the gap.

| Where the data lives | What would be lost | What backs it up today | The gap |
|---|---|---|---|
| **The seven database tables** — `tasks`, `teams`, `team_members`, `invitations`, `profiles`, `account_status`, `usage_counts`. Counted in this session by reading `supabase/migrations/` | Every task, every team, who is in which team, every pending invitation and its hashed token, everybody's nickname and AI-suggestions setting, any suspension and its reason, and the daily usage counts. In short: the whole app's content | **Supabase's own daily backups.** The owner read production's Database → Backups page on 10 Oct 2026 and saw **seven daily physical backups, 3 to 9 October, each around 12:20 UTC**. Supabase: "Pro Plan projects can access the last 7 days of daily backups" ([Database Backups](https://supabase.com/docs/guides/platform/backups), read 2026-10-10) | **Up to a day of writes**, by Supabase's own words: "Even with daily backups, you could still lose a day's worth of data." PITR would close it — "Pro, Team and Enterprise Plan projects can enable PITR as an add-on" — and it is an add-on nobody has priced. **And no restore has been tried**, so "backed up" here means "a file exists that we believe is a backup" |
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

**"Backed up" and "restorable" are different claims, and only one of them has evidence.** Seven dated
backups exist, by the owner's reading of the dashboard. Nobody has ever restored one. `checklist/launch.json`
has carried those as two separate items the whole time — `backups-on` and `restore-tested` — and
`scripts/launch-check.mjs` reports **both as TODO**, because neither `evidence/backups-on.md` nor
`evidence/restore-tested.md` exists ([#249](https://github.com/build-once/team-tasks/issues/249)).

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
of it can be done from this repository, none of it can be done by the coding assistant (rules 1, 10 and
19), and **not one item below has been set or seen by anybody writing this page.** It is written down
because a decision that lives only in a pull request is a decision nobody can act on later.

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
| `PRODUCTION_SUPABASE_S3_ACCESS_KEY_ID` | secret | **TO SET** | the Supabase S3 access key's id, for reading the bucket |
| `PRODUCTION_SUPABASE_S3_SECRET_ACCESS_KEY` | secret | **TO SET** | its secret half |
| `BACKUP_STORAGE_ENDPOINT` | **variable, not a secret** | **TO SET** | the R2 S3 endpoint, `https://<cloudflare account id>.r2.cloudflarestorage.com`. **A variable because an endpoint is not a credential, and not in this repository because the value embeds the account id and this repository is public** |
| `PRODUCTION_SUPABASE_S3_REGION` | **variable, not a secret** | **TO SET — and this row was not here on 10 October** | the production project's own region, which S3 request signing needs. **It was found by writing the code**, not by designing it: Supabase's page says to use "the region value displayed on the S3 configuration page" ([S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication), read 2026-10-10), so there is nothing to derive it from. The job **refuses and names this variable** rather than signing with a region somebody guessed, which is the fail-closed direction and also the one that produces a readable error on the first night |

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
| The API token | **done 10 Oct 2026**, owner-reported | `team-tasks-backup-job`, **Object Read & Write**, limited to that bucket. **Left as it is**, by the owner's decision of 10 Oct |
| **An object lifecycle rule** | **TO SET** | **delete objects at 14 days**, whole bucket, no prefix. This is what enforces retention — `docs/plan.md`'s decision of 10 Oct is that **the job never deletes anything** |
| **A bucket lock rule** | **PROPOSED, awaiting the owner** | Age condition, **`maxAgeSeconds` 1123200** — 13 days — whole bucket. `docs/plan.md` has what it buys and the one thing that keeps it a proposal. **If it is taken, set a one-day Age first and watch a delete be refused**, because nothing read says a lock can be removed or shortened |
| The endpoint | **TO COPY** | into `BACKUP_STORAGE_ENDPOINT` above. Not into this repository |

**Both rules need a token or a dashboard session that can edit bucket configuration**, which the backup
job's token is not: the lock page asks for "An API token with permissions to edit R2 bucket
configuration", and the scope described as allowing "edit bucket configuration" is **Admin Read & Write**
([R2 API tokens](https://developers.cloudflare.com/r2/api/tokens/), read 2026-10-10). **That is the
point rather than an inconvenience** — the job can write a copy and cannot change the rules that protect
it.

### Supabase → the production project

| What | Status | The exact thing |
|---|---|---|
| **An S3 access key** | **TO CREATE** | generated from the project's S3 configuration page ([S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication), read 2026-10-10), then its two halves into the two GitHub secrets above. **Know what it reaches before creating it**: "full access to all S3 operations across all buckets", with row-level security bypassed |
| **The Spend Cap** | **TO SET**, and it is not strictly a backup setting | Production went on Pro on 10 Oct, so the organisation can bill and nobody has set or seen the Cap ([#250](https://github.com/build-once/team-tasks/issues/250)). It belongs on this list because **the nightly copy is the biggest new consumer of the egress that Cap governs** — `docs/costs.md` puts the worst case at 18.6 GB a month |

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

## The restore drill

A backup that has not been restored is a belief about a backup. The drill is what turns the "time down"
target from an aspiration into a measurement, and it is the only thing that can settle
[#249](https://github.com/build-once/team-tasks/issues/249)'s `restore-tested`.

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
| **A pull request runs it** | It is on a `schedule` trigger with **no `pull_request` and no `workflow_dispatch`**, and it uses the `supabase-production` **environment**, so the secrets are reachable only by the workflow the owner means to run. `permissions: {}` at the top, `contents: read` on the job, exactly as the production workflow does |
| **It fails quietly and nobody notices for a month** | **A silent backup job is worse than none**, because it manufactures confidence. No `continue-on-error`, and the run must go red on any failure — **and then it OPENS A GITHUB ISSUE, as `drift-check.yml` already does, as well as GitHub's own failure email** (the owner's decision of 2026-10-10). Both, because the email reaches a person on the day and the issue is still there next week. The body names what failed and when and carries **no row, no path, no file name and no part of a secret** — an issue on a public repository is as public as the log. `docs/architecture.md` has the pattern it copies, down to the exact-title match that stops thirty issues in a month. **What neither catches** is the workflow not running at all, which GitHub does to a quiet public repository after 60 days |
| **It encrypts to nothing** — a missing or empty passphrase, so the file lands readable or the upload lands empty | Each of the three secrets gets its **own** "is it set and non-empty" step before anything runs, printing **only the name** — exactly the shape `migrate-production.yml` uses and explains, for exactly the reason it gives: a deleted or renamed GitHub secret expands to an empty string rather than raising an error |

**And the honest cost, stated rather than left to be noticed.** For the few minutes the job runs,
**production's entire database — every task, every address, every password hash — is in plaintext on a
machine this project does not own**, a GitHub-hosted runner. That is unavoidable for any copy made this
way, it is the reason the encryption happens on the runner rather than after the upload, and it is the
reason the job does as little as possible between the dump and the encryption.

**One more, which is about the schedule and not the data.** GitHub's own words: "The `schedule` event can
be delayed during periods of high loads of GitHub Actions workflow runs. High load times include the
start of every hour", and "In a public repository, scheduled workflows are automatically disabled when no
repository activity has occurred in 60 days"
([Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows),
read 2026-10-10). So **a nightly copy is nightly-ish**, and in a quiet repository it **stops happening
altogether** without anybody being told. Both belong in the gap column of this page rather than in a
footnote: the first means the window is "about a day" and not "exactly a day", and the second means
"nothing has run for two months" is a state this design can reach.

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
- **Not tried — restoring any Supabase backup.** The dashboard's "Restore to new project" is marked
  **Beta**, by the owner's reading of 10 Oct 2026, and nobody has pressed it.
  [#249](https://github.com/build-once/team-tasks/issues/249).
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
- **AND THE ONE THAT REPLACED IT, which is the likeliest first-night failure: `pg_dump` 16 against
  production's Postgres.** `pg_dump` refuses to dump a server NEWER than itself. The image carries 16.15;
  production is on 15.8 or newer and **nobody has read which** — "All projects on Postgres `15.8.1.079`
  and newer use the newer physical backup process" is the nearest thing this page has, and it does not
  give a version. If production is on 17, the first run fails. It fails **loudly and legibly**: the job
  asks the database its version first and stops with one sentence naming both numbers and the fix, which
  is a client of at least the server's major version on the runner — a tool to install, and therefore the
  owner's decision (rule 17). Settle it the cheap way: read the Postgres version on production's
  dashboard, or watch the first run.
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
- **Still owner-reported and unseen: every setting on the by-hand list above**, including the three
  secrets already set. **Nobody writing this opened the Cloudflare, GitHub or Supabase dashboard**, and
  nothing in this repository can show what any of them is set to. The three marked "set 10 Oct" are the
  owner's word; the five marked **TO SET** or **TO CREATE** have not been done as far as anybody writing
  this knows.
- **The code exists and has never touched production.** This entry said "Nothing in this file has been
  built or run. No workflow, no copy, no restore, no evidence file." Three of those four have changed:
  there is a workflow, there are scripts, and `evidence/build-it-24-nightly-copy.md` records them being
  run end to end **against made-up data on a throwaway PostgreSQL and a stand-in for both object
  stores**. What has not changed is the one-line test for this whole page: **no copy of production has
  ever been made, and no restore has ever been tried.** The arithmetic in `docs/costs.md` is still
  arithmetic on a design.
- **Not verified — anything about how the job behaves against the real services.** Everything the proof
  establishes, it establishes about **our code**: that it signs correctly for a server that recomputes
  the signature, reads a paged listing to the end, refuses an incomplete copy before uploading, encrypts
  in a format `openssl` itself opens, and restores to equal counts and equal bytes. **It establishes
  nothing about Supabase Storage's S3 gateway or Cloudflare R2** — not that the region is accepted, not
  that `ListObjectsV2` pages as the stand-in does, not that R2's ETag is the body's MD5 (the job checks,
  and says so rather than assuming), and not that a 5 GB single `PUT` is allowed. The first real run is
  what settles those, which is why it should be started **by hand** and watched.
