# Evidence: backups-on

Result: PASS — production's daily backups are on and the latest is 15 Oct 2026 at 12:17:51 UTC
(Physical), with **7 days** of retention quoted from Supabase's own page; and there is a nightly
encrypted copy of the database *and* the files to Cloudflare R2, of which **one has been restored
end to end in 219 seconds**.
Date: 2026-10-15 (the latest-backup reading: 15 October 2026; the seven-day listing: 10 October 2026; the restore: 10–11 October 2026)
How checked: the owner read production's Database → Backups page **on 15 Oct 2026** for the latest
backup, and **on 10 Oct 2026** for the seven-day listing; the retention figure is quoted from
Supabase's published page rather than inferred from how many backups were listed; the nightly copy
and the restore are `docs/backups.md` and `evidence/restore-tested.md`.
Checked by: the owner, for the dashboard reading and the restore drill. **The assistant opened no
dashboard** — rule 10 forbids it — and nothing here was re-tested.

---

## 1. Supabase's own backups

| | |
|---|---|
| **The latest backup, read today** — production's Database → Backups page, **15 Oct 2026** | **15 Oct 2026 at 12:17:51 UTC, Physical.** So dailies are still being taken, which is the half this row is actually about |
| **What the owner saw on the same page, 10 Oct 2026** | **seven daily physical backups, 3 to 9 October, each around 12:20 UTC** |
| **Retention, quoted rather than counted** | *"Pro Plan projects can access the last 7 days of daily backups."* — [Database Backups](https://supabase.com/docs/guides/platform/backups), read 2026-10-10 |
| **What a daily backup can lose** | *"Even with daily backups, you could still lose a day's worth of data."* — same page |
| **Finer granularity** | PITR is *"an add-on"* for Pro and above. **Not enabled, and nobody has priced it** |

**The retention figure is the quote and not the count**, which is
[#249](https://github.com/build-once/team-tasks/issues/249)'s first condition in as many words: a
page that says seven happen to be listed is not a page that says seven are kept.

**AND ONE THING IN DOUBT, carried rather than smoothed over.** `docs/stack.md` says daily backups
are *"Pro only"* and that free staging has none — but production's seven backups are dated **3 to 9
October, every one before the Pro transfer on the 10th**. So dailies were being taken while
production was still in a free organisation. **Which of the two is wrong is not established**, and
`docs/backups.md` holds the question.

**The 15 October reading does NOT resolve it**, and it is worth saying so rather than letting a
fresh date look like an answer: a backup taken on the 15th is *after* the transfer, so it is exactly
what the Pro plan predicts and tells us nothing about why the pre-transfer ones existed. What it does
settle is narrower and is this row's actual job — **the dailies are live now**.

**Staging:** no backup of its own is claimed here. It holds only the Alice/Bob/Carol test accounts.

## 2. The nightly copy, which covers the one thing Supabase's backups do not

Supabase, same page: *"Database backups do not include objects you store via the Storage API, as the
database only includes metadata about these objects."* So the one thing in this app nobody can
retype — an attached photograph — is the one thing Supabase's backups miss.
[#248](https://github.com/build-once/team-tasks/issues/248) is that gap and
`.github/workflows/backup-production.yml` is the answer.

| | |
|---|---|
| What it copies | the **whole database** (with the `auth` accounts and their password hashes) **and every file** in the `attachments` bucket |
| Where | a private Cloudflare R2 bucket, **Western Europe**, **encrypted on the runner before it leaves** |
| Retention | **14 days**, by an R2 lifecycle rule named `delete-after-14-days` (owner-reported, 10 Oct) — plus up to a day, by Cloudflare's own wording |
| Proven to run by itself | the schedule started it unaided on **11 Oct**, run [38121029695](https://github.com/build-once/team-tasks/actions/runs/38121029695), success in 38 seconds, `1 copy, 47 table(s), 1 file(s), 1309424 bytes stored.` |
| **"Every night" is nightly-ish** | that first scheduled run began **5h 57m 24s** after its cron time, so the window between copies is about a day and a quarter — `docs/backups.md` → "The two targets" |

## 3. A copy has been put back

**`evidence/restore-tested.md`**, 10–11 October 2026: restored into a new temporary project in
**219 seconds** — 47 tables, 269 rows, one file byte for byte, signed in with a real account, the
attachment opened, then the project deleted. That is the `restore-tested` launch row, already PASS,
and it is cited here because *"backed up"* without it means "a file exists that we believe is a
backup".

## 4. What this does NOT establish

- **No Supabase backup has ever been restored.** The dashboard's "Restore to new project" is marked
  Beta and has never been pressed, so the faster route back for the database alone is a belief. What
  has been restored is **a copy of ours**, which is a different file and a different mechanism.
- **219 seconds is one measurement**, against a production holding 269 rows and one file. There has
  been **no second drill**.
- **No bucket lock**, still the proposal of 10 October.
- **Whether the `auth` schema is inside Supabase's backups is not separately confirmed** — no page
  read says so in as many words; it is read off "backups contain database data" plus `auth` being in
  the database. **Unchecked.**
- **The lifecycle rule is owner-reported and unseen by anybody writing this**; nothing in this
  repository can read an R2 rule. The first thing to check it will be the copy of 10 October
  disappearing in about a fortnight, or not.
- **Nothing was captured from production** — no row, no file, no project reference; the list of
  redacted values is empty.
