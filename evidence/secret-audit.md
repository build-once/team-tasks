# Evidence: secret audit of the whole git history

Result: PASS — no real credential found in the history, and none in the database code
Date: 2026-09-29
How checked: every blob in the whole history scanned with `node scripts/scan-history.mjs`; the SQL
read by hand; GitHub's own settings read from the API
Checked by: the assistant

gitleaks was **not installed on this machine** when the section below was written, so that scan was
done with `scripts/scan-history.mjs`, which needs no installation. CI runs gitleaks itself on every
pull request, over the same history.

**Updated 2026-09-29, later the same day: gitleaks is now on PATH**, and the history has been
re-scanned with it. See "Re-scan with gitleaks itself" at the end of this file, which also records
the first end-to-end proof that the pre-commit hook stops a real-shaped key.

## What was scanned

Every blob that has ever existed, on every branch — not just the files that are there now. A secret
deleted in a later commit is still in the history, and still leaked.

```
Scanned 197 text blobs from the whole history (2 binary or oversized skipped).
Distinct blobs seen: 317
```

The two skipped are binary or over 2 MB: the design PDF and the lockfile. Untracked files were never
read, so `web/.env.local` was not opened — it is not in git, which is the point of it.

## Findings: 5 matches, 0 real

All five are the same kind, and all five are test fixtures. They are reported rather than hidden,
because "the scanner found nothing" and "the scanner found only fixtures" are different facts.

| Kind | File | Commits | Why it is not a real key |
|---|---|---|---|
| Database URL with a password | `guard/rules.json` | `9f7cafb`, `3ffcc9c`, `ea887b8` | A `should_match` example for the `db-remote-write` rule: the host is `db.example.supabase.co` |
| Database URL with a password | `guard/rules.json` | `9f7cafb`, `3ffcc9c`, `ea887b8` | A `should_not_match` example: `127.0.0.1`, this machine |
| Database URL with a password | `scripts/handoff.mjs` | `9f7cafb`, `ea887b8` | A control string that must survive redaction unchanged: `127.0.0.1` |

(The table lists three; the scan reported five hits because two blobs appear under more than one
commit.)

Confirmed by reading the lines themselves:

```
$ grep -n "postgres\(ql\)\?://" -r . --exclude-dir=node_modules
guard/rules.json:644:  "psql postgresql://postgres:pw@db.example.supabase.co:5432/postgres -c 'select 1'",
guard/rules.json:657:  "psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c 'select 1'"
scripts/handoff.mjs:174: 'db-url-with-credentials': 'postgres://admin:' + 'Hunter2Hunter2' + '@db.internal-host.io:5432/app',
scripts/handoff.mjs:192: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
```

No secret value is printed above or in the scan output: findings show the kind, the file, the commits
and a masked preview only.

**A flaw found and fixed during this audit.** The first run marked all five as `LOOKS REAL`, because
the regex matches only `postgres://user:password@` and stops before the hostname — so
`example.supabase.co` and `127.0.0.1` never reached the placeholder test. The scanner now judges the
whole line, and treats `localhost`, `127.0.0.1`, `[::1]` and `host.docker.internal` as local-only.
Recorded because the first output is what a reader would otherwise see and panic about.

## Database functions and triggers: none exist

```
$ git ls-files supabase
supabase/migrations/20260927182443_create_tasks.sql
```

One migration, and it contains no function, trigger or procedure:

```
$ grep -in "create \(or replace \)\?\(function\|trigger\|procedure\)\|security definer\|\$\$" supabase/
(no matches)

$ grep -in "password\|secret\|token\|key\|http\|://\|pgcrypto\|vault\|current_setting" \
       supabase/migrations/20260927182443_create_tasks.sql
13:  id uuid primary key default gen_random_uuid(),
```

The only hit is the word "key" inside `primary key`. So there is no database code that could hold a
credential.

**Unverified — anything created by hand.** This checks what is in the repository. A function or
trigger created directly in the Supabase dashboard would not appear here. Confirming that needs a
query against staging, which is the owner-runs-query pattern in `docs/environments.md`.

## Rotation plan

**Nothing to rotate.** No real credential was found, so no key needs replacing. The procedure to
follow if one ever is found — rotate first, assess exposure second, consider the history last — is
written in `docs/secrets.md` rather than here, because it needs to be findable before the next audit,
not after it.

## GitHub push protection: already on

```
$ gh api repos/build-once/team-tasks --jq ".private, .security_and_analysis"
false
{"dependabot_security_updates":{"status":"enabled"},
 "secret_scanning":{"status":"enabled"},
 "secret_scanning_non_provider_patterns":{"status":"disabled"},
 "secret_scanning_push_protection":{"status":"enabled"},
 "secret_scanning_validity_checks":{"status":"disabled"}}
```

Two related settings are still off — non-provider patterns, and validity checks — and both are a
decision for the owner. See `docs/secrets.md`.

The repository is **public**. That is worth stating plainly in an audit: everything in this history is
already visible to everybody, so "no real key was found" is doing real work here, not theoretical
work.

---

# Re-scan with gitleaks itself

Added 2026-09-29, after gitleaks was installed. Everything above was written when it was not
available; this section replaces the stand-in scanner with the real tool and, for the first time,
proves the pre-commit hook blocks a commit *because a key was found* rather than because the tool
was missing.

Result: PASS — history clean, and the hook refuses a commit containing a key-shaped value
Checked by: the assistant, on this machine (local only; production was not touched)

## 1. Versions and hook wiring

```
$ gitleaks version
8.30.1

$ git config --get core.hooksPath
.githooks
```

So `.githooks/pre-commit` is the hook git actually runs in this clone.

## 2. The whole history, scanned with gitleaks

```
$ gitleaks git --redact
    ○
    │╲
    │ ○
    ○ ░
    ░    gitleaks

1:10PM INF 34 commits scanned.
1:10PM INF scanned ~1671432 bytes (1.67 MB) in 1.23s
1:10PM INF no leaks found
exit code: 0
```

34 commits, no leaks, exit code 0. This agrees with the `scripts/scan-history.mjs` result above, now
from the tool CI uses. `--redact` was passed so that any finding could not print a secret into this
file or the terminal.

Note the two scanners disagree on what they count — 34 commits here, 197 text blobs above — because
they walk the history differently. Neither number is wrong; they are not the same measurement.

## 3. Negative test: the hook must refuse a key

On a throwaway branch `test/fake-key`, cut from `ci/pre-commit-scan`. The branch was never pushed,
and was deleted afterwards.

The value used is **invented** — it has never been a credential for any account. It is only shaped
like one, so gitleaks recognises it.

```
$ git switch -c test/fake-key
Switched to a new branch 'test/fake-key'

(file infra-notes.txt created, one line: GITHUB_TOKEN=ghp_<36 chars>)

$ git add infra-notes.txt
$ git status --short
A  infra-notes.txt

$ git commit -F <message file>
Finding:     GITHUB_TOKEN=REDACTED
Secret:      REDACTED
RuleID:      github-pat
Entropy:     5.021928
File:        infra-notes.txt
Line:        1
Fingerprint: infra-notes.txt:github-pat:1

1:15PM INF 0 commits scanned.
1:15PM INF scanned ~54 bytes (54 bytes) in 229ms
1:15PM WRN leaks found: 1
exit code: 1
```

This is the outcome the earlier attempt could not produce. The commit stopped because gitleaks
**found** the key — `RuleID: github-pat`, `leaks found: 1` — not because gitleaks was absent. The
"gitleaks is not installed" branch of the hook did not run.

`--redact` did its job: the finding names the rule, the file and the line, and prints `REDACTED`
where the value would be.

No commit was created:

```
$ git log --oneline -1
f9ed591 ci: scan for secrets before a commit, and record an audit of the history
```

`f9ed591` is the tip of `ci/pre-commit-scan` — the throwaway branch never moved.

Cleanup, and a second proof of the same fact:

```
$ git restore --staged infra-notes.txt
$ (infra-notes.txt deleted)
$ git status --short --branch
## test/fake-key
$ git switch ci/pre-commit-scan
Switched to branch 'ci/pre-commit-scan'
$ git branch -d test/fake-key
Deleted branch test/fake-key (was f9ed591).
```

`git branch -d` — the safe lower-case delete — refuses a branch holding commits that are not merged
elsewhere. It succeeded, which independently confirms the blocked commit never existed. `git branch
--all` afterwards showed no `test/fake-key`, locally or on `origin`.

## 4. A trap in this test, worth writing down

The first attempt at the negative test **failed to prove anything, and looked like a pass.** A file
named `fake-key.txt` holding `AWS_ACCESS_KEY_ID=AKIA` immediately followed by the 16 characters
`2E0A8F3B244C9986` was committed successfully: the hook ran, gitleaks scanned it, and reported
`no leaks found`.

(Throughout this section the `AKIA` prefix is written **separately** from its 16 characters. Joined
up, the second of the two below is a live gitleaks match, and would make this very evidence file
unable to be committed — which is the hook working correctly on the file that documents it.)

The cause was not the hook and not the filename. It was the invented value. Narrowed down by
elimination, each step a real command:

Writing `AKIA` + `<suffix>` for a value where the two are joined with no separator:

```
$ gitleaks dir --redact --no-banner --verbose --exit-code 1 infra-notes.txt   # neutral filename, no prose
no leaks found                                                                # exit 0 -> not the filename

$ gitleaks stdin ... <<< 'AWS_ACCESS_KEY_ID=AKIA + 2E0A8F3B244C9986'
no leaks found                                                                # exit 0 -> not the file at all

$ gitleaks stdin --enable-rule aws-access-token ... <<< 'AKIA + 2E0A8F3B244C9986'
no leaks found                                                                # exit 0 -> even with only that rule on

$ gitleaks stdin ... <<< 'AWS_ACCESS_KEY_ID=AKIA + XZQW7RTMKP4NVBGH'
RuleID: aws-access-token   Entropy: 4.121928   leaks found: 1                 # exit 1 -> detected
```

The difference between the last two is the 16 characters after `AKIA`. `2E0A8F3B244C9986` uses only
`0-9A-F`, so it reads as a hexadecimal string — a hash, a checksum, a commit id — and gitleaks does
not flag it. `XZQW7RTMKP4NVBGH` contains letters outside that range and is flagged at once.

**The lesson, which is the reason this section exists:** a negative test proves nothing until you
have confirmed the scanner recognises your fake value. Otherwise "the commit was allowed" has two
possible meanings — the guard is broken, or your bait was never bait — and the reassuring one is the
wrong one. Confirm the bait first, with the scanner run directly on it, and only then test the hook.

There is **no gap in the hook**: `github-pat` and a correctly-shaped `aws-access-token` are both
caught. What this records is a flaw in how the test was written the first time.

## 5. What this does not cover

- **Unverified — CI's copy of this check.** The `Secret scan` step in `.github/workflows/ci.yml` was
  not run here; only the local hook and the local history scan were. It is settled by opening a pull
  request and reading the run.
- **Unverified — other machines.** `core.hooksPath` is set per clone, and gitleaks must be on PATH.
  Both were confirmed on this machine only. On a clone where either is missing, the hook either does
  not run at all or refuses every commit.
- The hook scans **only what is staged**, by design. The whole history is CI's job, and section 2
  above.
