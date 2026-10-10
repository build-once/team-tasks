# The restore runbook: opening a copy, and putting production back

What to do with a nightly copy — on the day something has gone wrong, and on the day nothing has,
which is the drill. Written 2026-10-10 for Build it 24 part 1
([#258](https://github.com/build-once/team-tasks/issues/258)).

**NOTHING IN THIS FILE HAS EVER BEEN DONE. No copy of production has ever been made, no copy has ever
been downloaded, and no restore has ever been tried.** Every step below is written from the code in
`scripts/backup/` and from the vendor pages cited beside it. The one thing that has been done is the
same sequence against made-up data: `scripts/backup/proof.mjs` backs up a throwaway PostgreSQL and two
stand-in object stores, encrypts, uploads, verifies, downloads, decrypts, restores and compares, and
`evidence/build-it-24-nightly-copy.md` has that run's output. A drill against the real thing is what
turns this page from a plan into a procedure, and it is the only thing that can settle
`restore-tested` in `checklist/launch.json` ([#249](https://github.com/build-once/team-tasks/issues/249)).

**THE DRILL IS THE OWNER'S, START TO FINISH.** `docs/backups.md` says it and it is repeated here
because this is the page somebody will have open: **the coach and the coding assistant never receive a
backup file, any part of one, a decrypted dump, the passphrase, or a row out of a restored project.**
What this repository holds is this procedure and the evidence of a run — counts, timings, pass or fail.

**Where a restore may go, and where it may never.**

| | |
|---|---|
| **A new temporary project, in the Pro organisation** | The only right answer. Created for the drill, deleted the same day. The owner's decision of 2026-10-10; `docs/costs.md` has the arithmetic — **5 to 33 cents** for a drill, about **$10 a month** for a project somebody forgets |
| **Production** | Never. Rules 1 and 10 |
| **Staging** | Never, and this is the one that needs saying because it is the convenient answer. `docs/environments.md`: "Production data is never copied to local or staging" — and staging is the one project the coding assistant holds keys for |
| **A laptop** | Only for `--check-only`, which decrypts in memory and restores nothing. Anything more leaves production's database in a file on a machine nobody is watching |

---

## What you need before you start

| | Where it is | If it is missing |
|---|---|---|
| **The passphrase** | The **owner's password manager**. Not the GitHub secret: a GitHub Actions secret cannot be read back once set, so the password manager holds **the only readable copy in existence** | **Then no copy can ever be opened.** Not by the owner, not by Cloudflare, not by anybody. There is no reset. See `docs/backups.md` → "The one thing that cannot be recovered" |
| **The R2 storage key and secret** | Cloudflare → R2 → API tokens. The job's own token is `team-tasks-backup-job` | Make another. A storage key can be re-issued; the passphrase cannot |
| **This repository, checked out** | Anywhere | The "no scripts at all" section at the bottom opens a copy with `openssl` and `gzip` and nothing else |
| **Node, and the Postgres client programs** | `node --version`, `psql --version` | `--check-only` needs only Node. Restoring needs `psql` |

Set these in the shell you are working in. **Never on a command line, never in a file in this
repository, never in a chat** (rule 7) — the same way `docs/environments.md` says the staging test
accounts' passwords are loaded, from a file outside the repository that you read into the shell for one
run.

```sh
# the backup bucket
export BACKUP_STORAGE_ENDPOINT='https://<cloudflare account id>.r2.cloudflarestorage.com'
export BACKUP_STORAGE_KEY='...'
export BACKUP_STORAGE_SECRET='...'
export BACKUP_PASSPHRASE='...'        # from the PASSWORD MANAGER
```

---

## 1. Take a copy out of the bucket, and look at it before anything else

```sh
node scripts/backup/restore-backup.mjs --latest --check-only
```

This downloads the newest copy, checks it is encrypted, decrypts it, unpacks it, and runs **the same
completeness check the nightly job runs before it uploads** — that the accounts are in the dump, that
the file metadata is, that every file the manifest lists is really packed, and that every checksum
matches. It restores nothing.

What a good run says, in this order:

```
PASS  the copy is encrypted: it begins with OpenSSL's Salted__ header and holds no readable container.
PASS  the copy decrypted: <n> bytes.
PASS  the copy is complete: taken <date>, <n> table(s), <n> file(s), the database half taken first.
```

**If the first line is a FAIL** saying the copy is not encrypted: stop, and tell the owner. Something
has put a readable copy of production's database in somebody else's bucket.

**If the second line is a FAIL**: the passphrase is wrong, or the file is damaged. Check the passphrase
came from the password manager and try it again; then try the copy from the night before
(`--key <object key>`, taking a name from the listing).

**If the third is a FAIL**: the message says which of the four things is wrong. It will not name a file
or a row — on purpose, because this output can end up in an evidence file.

## 2. The deliberate test: try to open it without the passphrase

Do this once, on the drill, and write down what you saw. It is the only thing that demonstrates the
thing the whole design rests on: **what Cloudflare holds is unreadable.**

```sh
# with the passphrase deliberately wrong
BACKUP_PASSPHRASE='definitely-not-the-passphrase' \
  node scripts/backup/restore-backup.mjs --latest --check-only
```

Expect **exit 1** and:

```
FAIL  the copy did not decrypt: the passphrase is wrong, or the file is damaged.
```

And the cruder version, which is worth doing too because it is the one a person believes — look at the
raw bytes:

```sh
head -c 64 <the downloaded copy> | od -c | head
```

Expect `S a l t e d _ _` and then noise. No SQL, no address, no task text. (`scripts/backup/proof.mjs`
asserts the same thing mechanically against a made-up copy: that the ciphertext contains neither the
container's header nor any of the made-up task text.)

## 3. Make the new temporary project

In the **Pro organisation** — not the free one staging lives in. Give it a name that says what it is and
when, so a forgotten project is obvious: `teamtasks-restore-drill-2026-10-10`.

Then collect four things from it, which are what the restore writes to:

```sh
export RESTORE_DB_URL='postgresql://...'          # its Session pooler connection string
export RESTORE_S3_ENDPOINT='https://<its project ref>.storage.supabase.co/storage/v1/s3'
export RESTORE_S3_REGION='...'                    # shown on the project's S3 settings page
export RESTORE_S3_ACCESS_KEY_ID='...'             # an S3 access key made in the NEW project
export RESTORE_S3_SECRET_ACCESS_KEY='...'
export RESTORE_BUCKET='attachments'
```

**Create the `attachments` bucket in the new project first.** The restore writes objects into it; it
does not create it. The quickest honest way is to apply this repository's migrations to the new project
— `supabase/migrations/20261008191804_attachments_bucket.sql` is what makes the bucket, its six types
and its 5 MB limit — and that also gives you the policies, which is what you need for step 6.

## 4. Restore

```sh
node scripts/backup/restore-backup.mjs --latest
```

It puts the database back with `psql`, then puts every file back into the bucket, then **compares what
came back with what the copy said it held**.

**Expect errors from `psql`, and expect the run to pass anyway.** A dump of a Supabase database replayed
into another Supabase project tries to create things the new project already has — roles, extensions,
schemas — and each of those is an error that does not matter. What decides whether the restore worked is
the comparison, not the noise.

### What `psql`'s error count means, and which errors now fail the run

**The first drill saw `psql exited 0 with 573 ERROR line(s)`** restoring into a fresh project with this
repository's 11 migrations already applied. **That figure is not a constant and is not asserted
anywhere**: it moves with every migration added and with whatever Supabase ships in a new project. A
count cannot tell a harmless error from a fatal one, which is why the first drill carried on past it.

**What is stable is the KINDS.** Every ERROR line is now classified, the counts per kind are printed, and
**an unexpected kind fails the run**. The expected kinds, from `EXPECTED_PSQL_ERROR_KINDS` in
`scripts/backup/lib.mjs`:

| Kind | What it is |
|---|---|
| `already exists` | the schema is already there — a table, type, function, policy, trigger, extension |
| `a primary key the table already has` | the same thing said differently. **One line per table**, so a 47-table restore has 47 — and it does *not* say "already exists", which is why it is its own kind |
| `not the owner` | Supabase owns its managed schemas; a dump tries to set owners and privileges on them and is refused. Not yours to fix |
| `row already restored` | a unique-key violation, which is what a **second run** over already-restored tables produces |
| `not supported here` | something a dump cannot create in a managed project |

**Nothing of the text is printed** — not the statement, not the detail, not the message. psql's DETAIL
for a unique violation quotes the row's key. What you get is a kind, a count, and nothing else; the run
is also given `VERBOSITY=terse`, which drops DETAIL and CONTEXT altogether.

**If it reports unexpected errors, the run fails and the working directory is kept**, with its path named
at the end. **That is where to read them: your own machine, not a log.** Delete it when you are done — it
holds the database in plaintext.

### What a second run does, if the first one stopped part-way

**It is safe, and it is not a repair.** You will want this, because the first drill stopped at the
upload.

| | |
|---|---|
| **The files** | A `PUT` to the same key **replaces** the object — same bytes, same type. Never two of anything, and a half-written file is simply written again. Every file's SHA-256 is checked on every run |
| **The rows** | The dump's `COPY` into a table whose rows are already there is **refused by the primary key, so nothing is duplicated**. What it does **not** do is finish a table that was half-filled when the first run stopped: that table's `COPY` fails as a whole and it keeps the rows it has |
| **The errors** | More than the first run — every already-restored table adds a `row already restored`. Those are an expected kind, so they do not fail it |
| **So** | **If the comparison names a table whose count does not match, do not keep re-running.** Delete the temporary project and restore into a fresh one. It costs pennies (`docs/costs.md`) and it is the honest fix |

### Every file goes back with the content type it had

**This is what the first drill found.** It reached `PUT answered HTTP 415, code InvalidMimeType`, because
the restore sent each file with no type the `attachments` bucket accepts — and the bucket allows six
named types and nothing else. The comparison, which is the only part that proves anything, never ran.

The type now comes from the first of these that answers, and the run **prints the counts per source** so
you can see which one did:

| | |
|---|---|
| **1. The manifest** | Copies made from **10 October 2026 onward** record each file's content type, read off the header Storage answered with when the backup took it |
| **2. The storage record in the dump** | `storage.objects.metadata` *if* it carries a `mimetype`. **Nothing documents that it does** — the Supabase page shows metadata holding only `{"size": 1234}` — so this is looked for and never relied on |
| **3. The file's extension** | **This is what restores the two copies made before the manifest carried types.** Not a guess: the app set the type from the extension in the first place (`web/src/lib/attachments.ts`), so this reproduces how the type was decided |
| **4. Nothing** | Then **no file is uploaded at all** and the run stops, naming how many and no path. A 415 would have been the same answer one file at a time; this one is a sentence you can act on |

**If it stops there**, the file's name has an extension this app never accepted. The six it knows are
`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.heic` and `.pdf` — one more than the app offers today,
because `image/heic` is still in the bucket and a file already stored is a file somebody's data depends
on. Anything else needs a decision from the owner, not a guess from a script.

A good run ends with:

```
PASS  every one of <n> table(s) came back with the row count the copy recorded.
PASS  the accounts came back: auth.users has <n> row(s), as the copy recorded.
PASS  every one of <n> file(s) came back byte for byte, checked by SHA-256 against the copy's own manifest.
Wall clock, download to compared: <n>s.
```

**That last number is the answer to the second recovery target** — `docs/backups.md` says "at most a few
hours" and nothing but a measured drill can say whether that is true. Write it down.

Add `--show-tables` if you want every table's row count printed rather than only the ones that differ.
Think before you do: those are real row counts of real tables, and this output tends to end up pasted
into an evidence file.

## 5. Sign in as a real account

The comparison above proves the rows came back. It does not prove anybody can **reach** them, and that
is a different failure: a restore of the tables alone gives you data nobody can sign in to.

Point a local copy of the app at the temporary project and sign in as one real account — the owner's
own. `web/.env.local` takes the new project's URL and publishable key. **Nothing else about the app
needs to change.**

If sign-in fails, the usual cause is not the data: it is step 7's list — the new project's **Auth
redirect URLs** and **Site URL** are its own defaults, not production's.

## 6. Open a real file

Open a task that has an attachment and press Open. The link is a signed URL that expires after five
minutes, and it is served from the **new** project.

This is the step the whole build exists for. `docs/backups.md`'s map: Supabase's own backups do not
cover the bucket, so before this job a restore brought back rows pointing at bytes that were gone, and
the app would have shown files nobody could open ([#248](https://github.com/build-once/team-tasks/issues/248)).
If this step works, that gap is closed in fact and not only in a document.

## 7. What is NOT in the copy, and must be set again by hand

The copy says so itself — `restore-backup.mjs` prints this list straight out of the manifest — and it is
here as well because this is the step people forget until the app is up and failing.

| Not in the copy | Where to get it again |
|---|---|
| **The server functions' secrets**: the service-role key, `EMAIL_API_KEY`, `AI_API_KEY` | Each from the service that owns it, and set in the **new project's** Edge Functions settings. `docs/secrets.md` → "Every setting production needs" is the list. **A backup of a secret is another copy of a secret**, which is why they are deliberately absent |
| **Cluster roles and their passwords** | A new Supabase project creates its own `anon`, `authenticated`, `service_role` and the rest. Nothing to do — but it is why the dump's `GRANT`s replay cleanly and its `ALTER ... OWNER TO` lines may not |
| **Everything set in a dashboard**: Auth redirect URLs and Site URL, email templates, Storage settings, the Spend Cap, the organisation | By hand, in the new project. **`docs/backups.md` carries this as "not confirmed — which of production's settings exist only in a dashboard"**: nobody has walked production's settings pages against this repository, so this row is the one most likely to be incomplete. A drill is the moment to find out and write the list down |
| **The schema, if you restore into an empty project** | This repository: `supabase/migrations/`. The dump carries the schema too, but applying the migrations first is what gives you the bucket to restore files into |
| **Vercel**: the project, its two environment variables, the domain | By hand. The app's code is in this repository and GitHub has it |
| **The outside services' own records**: Resend's sending logs, Sentry's reports, whatever Anthropic holds | Nothing to do and nothing to restore. They are those companies' records, outside this project, on their own clocks |

## 8. Delete the temporary project — and record it

**Part of the drill, not tidying up afterwards.** A second live copy of production's data is a second
thing to protect, and nobody is watching it. It also costs about $10 a month in the Pro organisation.

Then write `evidence/restore-tested.md`: which copy (its object name and date), how long each step took,
the wall-clock number from step 4, what passed, what failed, what had to be set by hand in step 7, and
**that the project was deleted**. `scripts/launch-check.mjs` reads for that file's existence
([#249](https://github.com/build-once/team-tasks/issues/249)).

**No rows, no addresses, no file names, no task text, and no part of the passphrase go in that file.**
Counts, timings and verdicts, which is all anybody needs from it.

---

## Opening a copy with no scripts at all

If this repository is not to hand, or you simply want to see that the format is not a trap, a copy opens
with two programs that were on your machine before this project existed. **This is the reason the
encryption is written in OpenSSL's own file format instead of something of ours.**

```sh
# 1. decrypt. The passphrase is read OUT OF A FILE, so it is never an argument
#    and never in shell history. Delete the file afterwards.
openssl enc -d -aes-256-cbc -md sha256 -pbkdf2 -iter 600000 -pass file:passphrase.txt \
  -in production-20261010T012300Z.ttbk1.enc -out copy.ttbk1

# 2. look at what is in it. The header is plain JSON on one line.
head -c 2000 copy.ttbk1
```

**`-pass file:` and not `-pass fd:3`**, which reads better and does not work everywhere: OpenSSL 3.5.4
on Windows answered `Invalid password argument, starting with "fd:"` when it was tried on 2026-10-10,
because that source is not available there. A runbook step the owner cannot run on their own PC is not
a runbook step.

The file begins `TTBK1`, then a line holding the length of the header, then the header: a JSON object
listing every entry with its `offset`, its `storedBytes` and its checksums. The entries' bytes follow
the header, end to end, each one **gzip**. So:

```sh
# 3. cut one entry out at the offset its header gives, and open it.
dd if=copy.ttbk1 bs=1 skip=<body start + offset> count=<storedBytes> of=entry.gz
gzip -d entry.gz
```

`manifest.json` is the first entry, `database/dump.sql` the second, and every attached file is at
`storage/objects/<task id>/<file name>`. The exact numbers above —
**AES-256-CBC, PBKDF2-HMAC-SHA256, 600,000 iterations** — are the constants in
`scripts/backup/lib.mjs`, and `scripts/backup/proof.mjs` checks that the command printed here is built
from those same three constants, so this page and the code cannot drift apart.

**And this route is CHECKED, not asserted.** `scripts/backup/proof.mjs` takes the copy its own
end-to-end run just made, hands it to the real `openssl` binary with the command above, and requires
that what comes back is the container **byte for byte** — then reads the entry table out of it and
`gunzip`s the dump out of the offset the table gives. It was first run by hand on 2026-10-10 with
OpenSSL 3.5.4: `cmp` of the original and the decrypted file was silent, which is `cmp` for "identical".
`evidence/build-it-24-nightly-copy.md` has the run.

**What is still unverified about it: nobody has done this with a copy of PRODUCTION**, because no copy
of production exists. The format is the format either way; the thing a drill adds is that it was done
with the owner's own passphrase, on the owner's own machine, under pressure.

---

## If the copies are gone too

In order:

1. **Supabase's own daily backups still exist**, and they are the faster route back for the database
   alone — "Pro Plan projects can access the last 7 days of daily backups"
   ([Database Backups](https://supabase.com/docs/guides/platform/backups), read 2026-10-10). They do
   **not** include the files.
2. **The code, the migrations and the schema** are in this repository and in every clone.
3. **The files are gone.** That is the gap this job exists to close, and the reason it goes red and
   opens an issue when it fails rather than quietly skipping a night.
