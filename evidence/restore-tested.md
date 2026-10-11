# Evidence: restore-tested

Result: PASS — a nightly copy of production was restored into a new temporary project and compared: 47 tables, 269 rows, 1 file byte for byte, signed into with a real account, project deleted. 219 seconds.
Date: 2026-10-11
How checked: `docs/restore-runbook.md`, every step, by the owner. The 15:07:48Z copy of 2026-10-10 was downloaded from `team-tasks-backups`, opened with the passphrase from the password manager, restored with `node scripts/backup/restore-backup.mjs` into a **new project in the Pro organisation** with this repository's 11 migrations applied first, compared, signed into through a local copy of the app, and the project and every local file were deleted the next day.
Checked by: the owner. **Not the assistant and not the coach** — neither received the copy, any part of it, the passphrase, or a row out of the restored project (`docs/backups.md` → "The restore drill").

## What this file is and is not

**Counts, timings and verdicts.** No rows, no addresses, no file names, no task text, no part of the
passphrase, and no connection string — the runbook's own rule for this file.

**Everything below is the owner's report**, given in chat on 2026-10-11. Nobody writing this file opened
a dashboard, ran a command against production, or saw a byte of the copy. The three numbers computed in
this session rather than reported are marked as such.

## 1. Which copy

| | |
|---|---|
| Taken | **2026-10-10T15:07:48Z** — the second of the two copies made by hand that day |
| What it held | **47 tables**, **269 rows**, **1 file of 1,178,671 bytes** |
| Where it went | a **new project in the Pro organisation**, created for the drill. Never production, never staging (`docs/environments.md`: "Production data is never copied to local or staging") |
| Prepared first | this repository's **11 migrations**, applied to the new project — which is what creates the `attachments` bucket the files are restored into |

## 2. Before restoring anything: the copy opens, and only with the passphrase

| Check | Result |
|---|---|
| `--check-only` on **both** copies in the bucket | **PASS** on both |
| The same command with the passphrase deliberately wrong | **refused** |
| The downloaded file opened in Notepad | **unreadable** |

That third line is not a cryptographic proof and it is the one that convinces a person: what Cloudflare
holds cannot be read. The first line is the completeness check — the accounts in the dump, the file
metadata in it, every packed file present, every checksum matching.

## 3. The first attempt failed, and that is what a drill is for

**It stopped at the files**: `the restored bucket: PUT answered HTTP 415, code InvalidMimeType`. The
restore was sending each file with no content type the `attachments` bucket accepts, and the bucket
allows six named types and nothing else. **The comparison — the only part that proves anything — never
ran.**

Fixed in [PR #269](https://github.com/build-once/team-tasks/pull/269): every file now goes back with the
content type it had, and a file whose type cannot be determined stops the restore **before anything is
uploaded**.

## 4. The second run, into the same project

### psql

```
psql exited 0 with 574 ERROR line(s)
```

The owner's breakdown, as the classifier reported it at the time:

| Count | Kind |
|---|---|
| 83 | already exists |
| 424 | not the owner |
| 7 | row already restored |
| 8 | a primary key the table already has |
| **52** | **the script called unexpected** |
| **574** | total — **the five figures sum to 574, added in this session** |

**And psql exited 0**, which is the point of classifying kinds rather than counting them: a dump replayed
into a project that already has the schema produces hundreds of errors that do not matter, and an exit
code cannot tell you which.

### The kinds behind the 52, read off the owner's own machine with no row text

| Count | What psql said |
|---|---|
| 52 | `permission denied to change default privileges` |
| 32 | `grant options cannot be granted back to your own grantor` |
| 97 | `permission denied for schema` — auth 41, realtime 26, storage 28, pgbouncer 1, graphql_public 1 |
| 6 | `Non-superuser owned event trigger must execute a non-superuser owned function` |
| 2 | `permission denied for function get_auth` |
| 5 | `permission denied for table` — vector_indexes, secrets, schema_migrations, migrations, buckets_vectors, one each |
| 2 | a foreign key refused: `refresh_tokens_session_id_fkey`, and `mfa_amr_claims_session_id_fkey` |
| **3** | **syntax errors at character 1** — one `trailing junk after numeric literal`, and twice `syntax error at or near` a number |
| **199** | itemised in total — **added in this session** |

**Three numbers computed in this session, by running the classifier over those kinds** (not by
re-running the drill):

| | |
|---|---|
| Of the 199 itemised lines, how many the classifier **as it was** called unexpected | **43** — the 32 grant-option lines, the 6 event triggers, the 2 foreign keys and the 3 syntax errors |
| So how many of the owner's 52 are **not itemised** | **9.** Nothing here classifies them, and nothing should pretend to |
| Of the 199, how many the classifier **as it now is** calls unexpected | **3** — the syntax errors, and deliberately only those |

**One candidate for some of those 9, NOT established**: psql also writes `error: invalid command \.` for
every refused `COPY` block, because the end-of-data marker begins with a backslash. That was measured in
this session against psql 17.10 and is counted as an ERROR line by the same classifier. Whether any of
the drill's 9 unitemised lines were these is **unknown** — the owner's list was a list of kinds, not an
exhaustive count.

### The comparison

| | Result |
|---|---|
| `auth.users` | **1 of 1** — the accounts came back |
| The attached file | **byte for byte**, SHA-256 against the copy's own manifest |
| Its content type | taken from **the storage record inside the dump** — the second of the three sources the restore tries |
| `auth.refresh_tokens` | **0 of 2** |
| `auth.mfa_amr_claims` | **0 of 1** |
| Every other table | **matched** |
| **Wall clock, download to compared** | **219 seconds** |

## 5. The part a comparison cannot prove

The owner pointed a local copy of the app at the restored project, **signed in with his own real
account**, and saw **his own tasks and the attachment**.

That is the step the whole build exists for. Before the nightly copy, a restore would have brought back
`storage.objects` rows pointing at bytes that were gone, and the app would have shown a file nobody
could open ([#248](https://github.com/build-once/team-tasks/issues/248)).

## 6. Deleted — the project, and everything on the owner's own machine

On **2026-10-11** the owner deleted:

1. the drill project, in the Supabase dashboard;
2. the local files holding its secrets **and the passphrase**;
3. the working folders.

**Part of the drill, not tidying up afterwards.** A second live copy of production's data is a second
thing to protect and nobody is watching it; a passphrase in a file on a laptop is the most valuable
string in this project sitting somewhere nobody is watching. `docs/costs.md` has the other reason: a
forgotten project in the Pro organisation costs about $10 a month.

## 7. What the drill found, which is the whole reason for doing one

Three faults, all three now fixed or decided:

| Found | Answer |
|---|---|
| **The files did not go back at all** — `415 InvalidMimeType` | every file goes back with the type it had; a file with no usable type stops the restore before anything is sent ([PR #269](https://github.com/build-once/team-tasks/pull/269)) |
| **Three of the 574 error lines were rows of a table being executed as SQL** | the dump is no longer replayed with its data inline. Every `COPY … FROM stdin;` block is lifted into a file of its own and replayed with psql's `\copy`, in a second pass — so no row is in either script psql runs. `docs/backups.md` → "And no row of data is ever executed as SQL again" has the mechanism, measured against a real psql |
| **Two tables were reported as a failure that the restore was never going to bring back** | the owner's decision of 2026-10-11: **sign-in sessions are not restored, and after a recovery everybody signs in again.** The restore now promises a named set and reports everything else as "not restored, by design", with a count. `docs/backups.md` → "What a restore promises" |

**And five of the error kinds behind the "52 unexpected" were Supabase refusing us its own schemas**, in
four different sentences. Each is now its own named expected kind, so a later restore's report says which
refusal happened. **The three syntax errors stay unexpected on purpose**: a kind for them would have
hidden the bug behind a classification.

## 8. What this does NOT establish

- **219 seconds is one measurement**, of a copy holding **269 rows and one file**. It says nothing about
  restoring a production people have used.
- **It is not the outage.** It is the restore script's own wall clock, download to compared. It does not
  include creating the project, applying the migrations, signing in, or setting by hand everything in
  the runbook's step 7.
- **No Supabase backup has been restored.** The dashboard's "Restore to new project" is marked Beta and
  is still unpressed. This drill restored a copy of **ours**.
- **`backups-on` is still TODO.** `evidence/backups-on.md` does not exist, so the other half of
  [#249](https://github.com/build-once/team-tasks/issues/249) is open. What it needs is Supabase's own
  **retention** read off the Backups page rather than inferred from how many backups happen to be listed.
- **One object is not a rule.** The content type coming from the storage record inside the dump means
  `storage.objects.metadata` carried a type for **that** object. `docs/plan.md` has carried "whether
  `storage.objects` records the file's declared type, and where" as not confirmed since 2026-10-08; this
  is one observation towards it and no Supabase page read says it.
- **No second drill.** Everything above happened once.

## Output (secrets removed)

The owner's reported figures, gathered. No command output is reproduced: the restore's own log names
tables and row counts, and this file is public.

```
copy taken         2026-10-10T15:07:48Z
in the copy        47 tables, 269 rows, 1 file of 1178671 bytes
psql               exit 0, 574 ERROR lines (83 / 424 / 7 / 8 / 52)
auth.users         1 of 1
the file           byte for byte, type from the storage record in the dump
not restored       auth.refresh_tokens 0 of 2, auth.mfa_amr_claims 0 of 1
everything else    matched
wall clock         219 s
sign-in            the owner's own account, his tasks and the attachment
deleted 11 Oct     the project, the local secret and passphrase files, the working folders
```
