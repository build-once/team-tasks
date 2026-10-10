# Evidence: Build it 24 part 1 — the nightly encrypted copy, and the restore runbook

Issue [#258](https://github.com/build-once/team-tasks/issues/258). New workflow:
`.github/workflows/backup-production.yml`. New scripts: `scripts/backup/`. New runbook:
`docs/restore-runbook.md`.

**Result: PASS, end to end, on a throwaway PostgreSQL and a stand-in for both object stores, with
made-up data. NO COPY OF PRODUCTION HAS EVER BEEN MADE.** That second sentence is the one to quote. The
workflow runs on a schedule from `main`, so it cannot have run; three of the nine settings it needs do
not exist yet; and no restore drill has been done.

**What was NOT done, stated before anything is claimed.** No MCP connector and no browser tool were
used in this session. **Nothing touched production or staging** — no deploy, no secret, no query, no
dashboard, no `supabase` command of any kind — so there is no `evidence/production-log.md` entry to
make. No migration, Edge Function or screen was changed. No package was installed (rule 17 never came
up: the encryption is Node's own crypto and the S3 calls are `fetch`). **No backup file, no part of one,
and no passphrase was received by the assistant**, because none exists. Level 2 was not used on this
issue or its pull request.

**Read from `origin/main` at commit `cb58926d3a29c10e59871e5295f8df7c6edeecc4`** — "Merge pull request
#251 from build-once/docs/production-pro-transfer-10-oct", committed 2026-10-10T09:18:07+01:00
(`git fetch origin --prune` then `git log origin/main -1 --format='%H %ci %s'`, run in this session).

**And the branch is NOT based on that commit, which is the first thing a reviewer should know.** #258
says "docs/plan.md and docs/backups.md are merged with the owner's decisions (PR #257)". **PR #257 is
open, not merged** (`gh pr view 257 --json state` → `"OPEN"`), and `docs/backups.md` exists only on its
branch. So this work is stacked on `docs/build-it-24-backup-map-252` rather than on `main`: building to
a design document that is not in your own branch would mean a runbook citing a file it cannot see. The
pull request says so at the top.

---

## 1. What was built

| File | What it is |
|---|---|
| `.github/workflows/backup-production.yml` | the nightly job (`schedule` + `workflow_dispatch`, environment `supabase-production`, `ubuntu-24.04`, 30-minute timeout, every action pinned to a full SHA, `permissions: {}` at the top and `contents: read` on the job), and a **separate job holding no backup secret** that opens or comments the "Backup did not run" issue on failure |
| `scripts/backup/make-backup.mjs` | the copy: `pg_dump` the whole database, list and read every object in `attachments`, pack, **check**, encrypt, upload, verify by HEAD and by reading the bytes back |
| `scripts/backup/restore-backup.mjs` | the restore: download, decrypt, unpack, check, `psql` the dump into a new project, put the files back, compare every row count and every file's checksum against the manifest, and report the wall clock |
| `scripts/backup/lib.mjs` | the format (OpenSSL `enc` outer layer, gzip-per-entry container), the manifest, `checkCopy`, the log scanner, SigV4, and `pgEnvFromUrl` |
| `scripts/backup/s3.mjs` | ListObjectsV2, GetObject, HeadObject, PutObject over `fetch`. Both stores, one file |
| `scripts/backup/standin-store.mjs` | the stand-in for both object stores, which **recomputes the signature** and refuses a bad one |
| `scripts/backup/proof.mjs` | 114 checks, 25 of them "seen to fail" |
| `docs/restore-runbook.md` | what a person does with a copy |
| `.github/workflows/ci.yml` | one new job, `backup-proof`, in `required`'s `needs` and `EXPECTED_JOBS` 14 → 15 |
| `package.json` | `backup:test` (the pure half) added to `npm test`, so Windows and macOS runners cover the format and the scanner too |

## 2. The whole sequence, with no real data

```
$ BACKUP_PROOF_SHOW_LOG=1 BACKUP_PROOF_DB_URL="postgresql://postgres@127.0.0.1:55433/postgres" \
  BACKUP_PSQL=".../PostgreSQL/17/bin/psql" BACKUP_PG_DUMP=".../PostgreSQL/17/bin/pg_dump" \
  node scripts/backup/proof.mjs
```

**114 PASS, 0 FAIL, exit 0.** The whole output is long; the headline lines are below, grouped as the
script prints them. Nothing in it is real: every account, task, team name, nickname, suspension reason,
invitation address, file and setting is a made-up value invented in `scripts/backup/proof.mjs`, and
every endpoint is `127.0.0.1`.

```
node v24.13.1 -- scripts/backup/proof.mjs
--- A throwaway database with made-up data in it
PASS  created three throwaway databases on 127.0.0.1: one to copy, one with no accounts, one to restore into.
PASS  it holds 3 made-up accounts with made-up password hashes in `auth.users`, which is the half a copy taken the obvious way would miss.
--- back up
PASS  make-backup.mjs exited 0.
PASS  exactly one object was written to the backup bucket (0 before, 1 after).
PASS  the object in the bucket is encrypted.
PASS  and it holds neither the container's header nor any made-up task text in the clear.
PASS  it is named by the UTC date and time it was taken.
PASS  the run read the object back with HEAD and checked its size.
PASS  and downloaded it again and compared the checksum of the bytes actually stored.
PASS  the job deleted nothing: retention is the bucket's own lifecycle rule.
PASS  no plaintext dump is left behind: the directory it worked in is empty again, before the runner is even destroyed.
--- what the log says, and what it must never say
PASS  the whole log is clean: no secret, no row, no address, no file name, no connection string.
PASS  it names no table, so it cannot carry a real table's row count.
PASS  SEEN TO FAIL: A SECRET IN THE LOG: the same scan over the same log with one secret added finds it.
PASS  SEEN TO FAIL: A ROW IN THE LOG: and with one row added, finds that.
--- what is inside the copy
PASS  the manifest says which half was taken first, as docs/architecture.md asks.
PASS  ALL THREE files are in the copy, although the bucket handed them over two at a time.
PASS  file 1 of 3 is in the copy byte for byte.
PASS  file 2 of 3 is in the copy byte for byte.
PASS  file 3 of 3 is in the copy byte for byte.
PASS  the manifest records 3 rows in auth.users -- the accounts are counted, inside the ciphertext where a row count belongs.
PASS  the dump covers `auth` and `storage` as well as `public`.
PASS  and all seven of this project's own tables are counted.
PASS  the dump really carries the password hashes: a copy without them restores data nobody can sign in to reach.
PASS  and the rest of the auth schema with them.
--- and it opens with openssl and gzip alone, which is the whole reason for the format
PASS  OpenSSL 3.5.4 30 Sep 2025 (Library: OpenSSL 3.5.4 30 Sep 2025) opened the copy this run made: exit 0.
PASS  and what it produced is the container byte for byte -- so the outer layer really is OpenSSL's own `enc` format and not merely shaped like it.
PASS  its header lists all 5 entries, so the entry table is readable with nothing but a JSON reader.
PASS  and the dump sliced out of it at that offset is a gzip file that gunzips to the dump.
--- restore into an empty database, and compare
PASS  restore-backup.mjs --latest exited 0.
PASS  every table came back with the row count the copy recorded.
PASS  THE ACCOUNTS CAME BACK: auth.users has its 3 rows.
PASS  and all three files came back byte for byte.
PASS  the run reports its own wall-clock time, which is the only answer to 'how long are we down'.
PASS  the restored database really holds the three made-up tasks, read back with a query of its own.
PASS  and a made-up password hash came back exactly as it went in.
PASS  the restored bucket holds three objects.
...
114 PASS, 0 FAIL.
```

## 3. Seen to fail — the five things #258 names, and two more

Every line here is a case that is **given a world where the thing is broken and required to come out
negative.** Three of the seven drive the real scripts as child processes; the rest drive the function
that decides.

```
--- the five things this must be seen to fail on
PASS  SEEN TO FAIL: THE ACCOUNTS LEFT OUT: a database with no `auth` schema -- which is exactly what `supabase db dump` would produce -- is refused (exit 1).
PASS  SEEN TO FAIL: and the run says so in those words, rather than failing obscurely.
PASS  SEEN TO FAIL: and NOTHING was uploaded: the check happens before the upload, not after it.
PASS  SEEN TO FAIL: A FILE MISSING: a copy whose manifest lists a file it does not hold is refused on restore (exit 1).
PASS  SEEN TO FAIL: and the words name what is wrong without naming the file.
PASS  SEEN TO FAIL: UPLOADED UNENCRYPTED: a copy sitting in the bucket in the clear is refused (exit 1).
PASS  SEEN TO FAIL: and the words tell the reader to go and talk to the owner before doing anything else.
PASS  SEEN TO FAIL: THE WRONG PASSPHRASE: the copy does not open (exit 1).
PASS  SEEN TO FAIL: and the message says the passphrase may be wrong, which is the thing to go and check.
PASS  SEEN TO FAIL: a wrong storage secret fails the run (exit 1): the stand-in recomputes the signature and refuses it, so every request really was signed correctly in the passing run above.
PASS  SEEN TO FAIL: and nothing was written when it did.
PASS  SEEN TO FAIL: a passphrase of spaces is treated as missing, matching every other settings check in this repository.
PASS  SEEN TO FAIL: and the run names the setting that is missing and no value.
```

**How each of the five is made to happen**, because "seen to fail" is only worth anything if the
mechanism is honest:

| #258's requirement | How the proof produces it |
|---|---|
| **the accounts are left out** | A **second throwaway database with no `auth` schema at all** — which is byte for byte what a copy built on `supabase db dump` would look like, since that command "ignores" `auth` and `storage` by name. `make-backup.mjs` is run against it unchanged, and refuses before uploading |
| **a file is missing** | A good copy is **repacked with one object entry removed** and its manifest left alone, encrypted, and seeded into the backup bucket. `restore-backup.mjs --check-only` is run against that key |
| **the copy is uploaded unencrypted** | The **plaintext container** is seeded into the backup bucket under its own key, and the restore refuses it with "THE COPY IS NOT ENCRYPTED" |
| **the passphrase is wrong** | The restore is run against the good copy with a different `BACKUP_PASSPHRASE` |
| **a secret or a row appears in the log** | The real run's log is scanned clean, and then **the same scan over the same log with one secret appended, and again with one row appended**, must find it. The scanner knows nine made-up values by name and five shapes nobody named in advance — an address, a connection string, a `COPY` line, an OpenSSL header, a signature header |

## 4. What the job actually prints, in full

This is the whole log of a real `make-backup.mjs` run — every line, nothing elided. It is safe to
reproduce here because of the three checks in section 2, and it is the answer to "the log prints counts
and sizes only. Never a row, a file name, an address, a key or a secret."

```
Working under a temporary directory outside the checkout. Nothing unencrypted is written anywhere else.
The database reports server version 17.10.
C:/Program Files/PostgreSQL/17/bin/pg_dump reports "pg_dump (PostgreSQL) 17.10".
The dump is 11838 bytes and covers 3 schema(s).
Counted the rows in 11 table(s). The numbers are in the manifest inside the copy and are not printed here.
The attachments bucket holds 3 object(s). No path is printed.
Read 3 file(s), 117 bytes in total.
The copy checks out: 5 entries, and the accounts and the file metadata are both in the dump.
Encrypted: 4964 bytes in, 4992 bytes out. SHA-256 967a4d545f06e35ada06ad1ea024bdb43ea3ae2355372f6c7e32964e14534c78.
Uploaded to team-tasks-backups as team-tasks/2026-10-10/production-20261010T101939Z.ttbk1.enc.
Verified by HEAD: 4992 bytes, and the ETag matches the copy's MD5.
Read the object back: 4992 bytes, SHA-256 matches, and it is encrypted.
Nothing was deleted. Retention is the bucket's 14-day lifecycle rule, not this job's business.
Done in 1s: 1 copy, 11 table(s), 3 file(s), 4992 bytes stored.
```

Fourteen lines. Eleven tables, three files, and **not one table named**, which is deliberate:
`docs/backups.md`'s control table says the log carries "no row counts of real tables". The per-table
counts are in the manifest **inside the ciphertext**, which is where a restore needs them and where
nobody else can read them.

## 5. What the restore prints

The same run's restore, in full:

```
The bucket holds 1 copy(ies); taking the newest, team-tasks/2026-10-10/production-20261010T102023Z.ttbk1.enc.
Downloaded team-tasks/2026-10-10/production-20261010T102023Z.ttbk1.enc: 4992 bytes.
PASS  the copy is encrypted: it begins with OpenSSL's Salted__ header and holds no readable container.
PASS  the copy decrypted: 4963 bytes.
PASS  the copy is complete: taken 2026-10-10T10:20:23.808Z, 11 table(s), 3 file(s), the database half taken first.
What it says it holds: 19 row(s) across 11 table(s), and 117 byte(s) of files.
What has to be re-created by hand, from the copy's own manifest:
  - cluster roles and their passwords -- a new Supabase project creates its own, and a copy of a credential is another credential
  - the server functions' secrets (service-role key, EMAIL_API_KEY, AI_API_KEY) -- see docs/secrets.md for what to set again
  - anything set in a dashboard rather than in this repository: Auth redirect URLs, email templates, the Spend Cap
  - the outside services' own records (Resend, Sentry, Anthropic)
psql exited 0 with 0 ERROR line(s). Its output is deliberately not printed; it is kept in the temporary directory ONLY if this run fails, and the path is named at the end if so.
Put 3 file(s) back.
PASS  every one of 11 table(s) came back with the row count the copy recorded.
PASS  the accounts came back: auth.users has 3 row(s), as the copy recorded.
PASS  every one of 3 file(s) came back byte for byte, checked by SHA-256 against the copy's own manifest.
Wall clock, download to compared: 1s. THAT NUMBER IS THE ANSWER to "how long are we down" -- write it in evidence/restore-tested.md.
Every check passed.
```

**"0 ERROR line(s)" is a fact about this sandbox and not a promise about Supabase.** The target database
here is an empty one in the same cluster, so the dump's roles and `GRANT`s all land. A real restore into
a new Supabase project will produce errors for things the project already has, which is why
`ON_ERROR_STOP` is off, why the count is reported rather than the text, and why the **comparison** is
what decides.

## 6. A copy opens with `openssl` and nothing else, checked by hand first

Before the case in section 2 existed, the interop was done by hand, because the claim is load-bearing:
if it were false, the data would be hostage to this repository's own code.

```
$ openssl version
OpenSSL 3.5.4 30 Sep 2025 (Library: OpenSSL 3.5.4 30 Sep 2025)

$ node <scratch>/openssl-interop.mjs <scratch>        # wrote plain.bin, pass.txt and copy.enc with lib.mjs' encrypt()
wrote 2700 plaintext bytes and the encrypted copy

$ openssl enc -d -aes-256-cbc -md sha256 -pbkdf2 -iter 600000 -pass fd:3 -in copy.enc -out opened.bin 3< pass.txt
Invalid password argument, starting with "fd:"
Error getting password
                                                      # exit 1 -- fd: is not available on Windows

$ openssl enc -d -aes-256-cbc -md sha256 -pbkdf2 -iter 600000 -pass file:pass.txt -in copy.enc -out opened.bin
                                                      # no output, exit 0

$ cmp plain.bin opened.bin
                                                      # no output: cmp for "identical"
```

**That first failure changed the code and the runbook**, which is why it is kept here: the command was
written with `-pass fd:3`, that source does not exist on Windows, and a runbook step the owner cannot run
on their own PC is not a runbook step. `opensslDecryptCommand()` in `lib.mjs` now builds `-pass file:`,
`docs/restore-runbook.md` quotes it, and a check in section 2 compares the two so they cannot drift.

## 7. The rest of CI, run in this session

```
$ node scripts/check-workflows.mjs
Checked 5 workflow file(s), 23 job(s): 0 problem(s), 0 warning(s).

$ npm test
... (every existing self-test, unchanged) ...
> build-once@0.1.0 backup:test
> node scripts/backup/proof.mjs --pure-only
...
64 PASS, 0 FAIL.
...
AI team self-test: 258 passed, 0 failed.
Checked 6 workflow file(s), 14 job(s): 0 problem(s), 0 warning(s).
```

`npm test` exited 0. The 64 is the pure half — the format, the manifest check, the log scanner, the
signer and the connection-string parser — which is what Windows and macOS runners now cover through the
`other-os` job. The end-to-end half refuses to be skipped silently: without `BACKUP_PROOF_DB_URL` and
without `--pure-only` it prints `UNVERIFIED` and fails, because a check that could not run is not a pass
(rule 8).

## 8. The sandbox, and exactly what it is not

The throwaway cluster, built in this session on the owner's machine:

```
$ initdb -D <scratch>/pgdata -U postgres --auth=trust --encoding=UTF8    # PostgreSQL 17.10
$ printf "port = 55433\nlisten_addresses = '127.0.0.1'\n" >> <scratch>/pgdata/postgresql.conf
$ pg_ctl -D <scratch>/pgdata -l <scratch>/pg.log -w start
waiting for server to start.... done
server started
$ psql "postgresql://postgres@127.0.0.1:55433/postgres" -t -A -c "select version()"
PostgreSQL 17.10 on x86_64-windows, compiled by msvc-19.44.35226, 64-bit
```

**What this proves: that OUR CODE is right.** It signs requests a server that recomputes the signature
accepts; it follows a paged listing to the end (the stand-in hands over **two objects at a time** with
three to fetch, on purpose); it refuses an incomplete copy *before* uploading; it writes a format
`openssl` itself opens; and it restores to equal row counts and equal bytes.

**What it proves nothing about, and this is the important half:**

- **Supabase Storage's S3 gateway.** Not that the region value is accepted, not that `ListObjectsV2`
  pages the way the stand-in does, not that an S3 access key reads the `attachments` bucket at all.
- **Cloudflare R2.** Not that the endpoint works, not that the ETag of a single `PUT` is the body's MD5
  (the job checks and says so rather than assuming), not that a copy of our likely size is accepted in
  one `PUT`, and nothing whatever about the lifecycle rule or the proposed bucket lock, neither of which
  exists.
- **Production's Postgres version.** The sandbox is 17.10 and the runner image carries `pg_dump` 16.15.
  `pg_dump` refuses a server **newer** than itself, so if production is on 17 the first run fails. It
  fails legibly — the job asks the database its version first and stops with one sentence naming both
  numbers and the fix — but nobody has read which version production is on.
- **Anything at all about production's data.** Eleven tables and three files here are made up. Production
  has seven tables, an empty bucket, and no accounts, because nobody has signed up.

## 9. What #258 asked for, line by line

| Asked | Done |
|---|---|
| Nightly on a schedule **and by hand** | `schedule: "23 1 * * *"` and `workflow_dispatch`. **This departs from `docs/plan.md`**, which said no `workflow_dispatch`; the pull request flags it at the top and all three documents are corrected |
| Environment `supabase-production`, read-only permissions, 30-minute timeout, actions pinned to a full SHA, runner image pinned by version | `environment: supabase-production`, `permissions: {}` then `contents: read`, `timeout-minutes: 30`, both actions at full SHAs, `runs-on: ubuntu-24.04` |
| Those six secrets and that one variable, by those exact names; a missing one stops the run before anything is read, naming it | One step, all nine settings, names only printed. **And three more than #258 lists**: `PRODUCTION_SUPABASE_PROJECT_REF` (already existed) and the variable `PRODUCTION_SUPABASE_S3_REGION`, which Supabase's own page says must be read off its S3 configuration page — see the pull request, which lists it as a thing to set |
| The database half must include the accounts and the storage records; say which schemas and roles are copied, and what is left out | One `pg_dump` with **no `-n`, no `-N`, no `--schema-only`, no `--data-only`** — every schema, all data. **Roles: none, deliberately**, with the reason. The manifest lists the four kinds of thing left out, inside the copy. `docs/architecture.md` has the table |
| The files half: every object in the bucket | `ListObjectsV2` to the end, every object read, each checked against the size the listing gave |
| Encrypted on the runner before anything is sent; only encrypted files uploaded; nothing unencrypted outside the runner's temporary space; the passphrase never on a command line or in a log | All four, and all four checked in section 2 |
| Uploaded under a dated name; after upload the run checks the object is there and its size and checksum match | `team-tasks/<date>/production-<stamp>.ttbk1.enc`; HEAD for size and ETag, then the bytes read back and SHA-256 compared |
| A manifest inside the encrypted copy: row count per table, number of files, checksums. The log prints counts and sizes only | Section 4 is the log. The manifest also carries which half was taken first, the server version, the schemas covered, and what must be re-created by hand |
| The job never deletes anything | There is no delete in the code. Section 4's log says so in its own words |
| On failure an issue is opened, as drift-check does, by a step that holds no backup secret | A **separate job**, `report-failure`, `if: failure()`, naming **no environment** — so it cannot read one of the nine. Exact-title match on "Backup did not run", comment rather than duplicate, body from a file (rule 12) |
| The runbook, with the deliberate test | `docs/restore-runbook.md`, step 2 |
| A CI job running the same scripts end to end, counted, in the required checks | `backup-proof`, floor 114, in `required`'s `needs`, `EXPECTED_JOBS` 15 |
| `docs/environments.md` lists every setting production needs (closes #255) | It lists the whole environment; `docs/secrets.md` → "Every setting production needs" is the one list with where each comes from again, which is what #255's first condition asked for |

## 10. Unverified, and how to settle it

- **No copy of production exists.** Nothing here says otherwise. The first run is the owner's, and it
  should be started **by hand** and watched, which is what the `workflow_dispatch` is for.
- **Four settings do not exist**: `PRODUCTION_SUPABASE_S3_ACCESS_KEY_ID`,
  `PRODUCTION_SUPABASE_S3_SECRET_ACCESS_KEY`, the variable `PRODUCTION_SUPABASE_S3_REGION` and the
  variable `BACKUP_STORAGE_ENDPOINT`. The job stops at its first step and names them.
- **No lifecycle rule exists**, so until one is set nothing deletes an old copy and the "14 days"
  in every document is a plan rather than a behaviour. The job deliberately cannot do it.
- **No restore drill has been done**, and `evidence/restore-tested.md` does not exist
  ([#249](https://github.com/build-once/team-tasks/issues/249)).
- **The SigV4 signer is checked against itself**, in the stand-in's verifier, and not against AWS's
  published test vector. A systematic error would pass here and fail on the first real call.
- **`pg_dump` 16.15 against production's unread Postgres version** — see section 8.
- **The whole copy is held in memory** at three points (the dump, the gzipped container, the
  ciphertext), and the upload is a single `PUT` with no multipart. At the plan's six people and 100 MB
  each that is well inside a runner, and nobody has measured where it stops being.
- **Nothing notices if the job silently stops running.** GitHub disables scheduled workflows in a public
  repository after 60 days of no activity, and a job that never starts has no failure to report.
  `drift-check.yml` names the same trap about itself.

Every one of those is covered by an issue — six filed with this work, plus
[#249](https://github.com/build-once/team-tasks/issues/249) for the drill. They are listed with their
links at the end of the pull request.
