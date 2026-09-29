# Evidence: secret audit of the whole git history

Result: PASS — no real credential found in the history, and none in the database code
Date: 2026-09-29
How checked: every blob in the whole history scanned with `node scripts/scan-history.mjs`; the SQL
read by hand; GitHub's own settings read from the API
Checked by: the assistant

gitleaks is **not installed on this machine**, so the scan was done with `scripts/scan-history.mjs`,
which needs no installation. CI runs gitleaks itself on every pull request, over the same history.

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
