# Evidence: the built bundle is checked for Supabase secret keys

Result: PASS — the check fails a build that ships a secret-key shape, and passes one that does not
Date: 2026-09-29
How checked: the step's own shell logic run against a clean and a leaking bundle locally; then
end-to-end in CI on a throwaway branch
Checked by: the assistant. Local only — production was not touched.

## Why this check exists at all

Everything under `web/.next/static` is **public**. Next.js serves it to every browser that opens the
app. A publishable key belongs there. A secret key never does, and once one has been served it is
leaked — the only real fix is to rotate it.

The `Secret scan (gitleaks)` job already in `.github/workflows/ci.yml` does **not** cover this. It
reads the git history; this reads the compiled output, and a key can reach the compiled output
without ever appearing in a source file — inlined from an environment variable at build time, for
instance.

There is a second, sharper reason, found while writing this:

```
$ gitleaks stdin --no-banner --redact --verbose --exit-code 1 <<< 'const k = "sb_secret_<invented>"'
1:45PM INF scanned ~55 bytes (55 bytes) in 161ms
1:45PM INF no leaks found
exit code: 0
```

**gitleaks 8.30.1 has no rule for the `sb_secret_` shape.** So neither the pre-commit hook nor the
history scan would stop a real Supabase secret key of that form, in the bundle or in source. This
check closes part of that hole, and the rest is filed as an issue — see the end of this file.

## The exact search it runs

From the `App build` job. The job sets `defaults.run.working-directory: web`, so the paths are
relative to `web/`:

```sh
grep -ranoE 'sb_secret_|service_role' .next/static
```

- `-r` recursive
- `-a` treat every file as text, so nothing is skipped for looking binary
- `-n` line numbers
- `-o` print **only** the matched token. This is a safety measure, not cosmetic: it prints
  `sb_secret_` and not the key that follows it, so a real leak cannot be copied out of the public
  Actions log.
- `-E` extended regular expressions, for the `|`

Around that one line, the step does three things that the grep alone would get wrong:

1. **Refuses to pass when it scanned nothing.** If `.next/static` is missing or empty it fails with
   "NOTHING was scanned", rather than reporting success. A check with nothing to look at is not a
   pass (`AGENTS.md` rule 8).
2. **Tells grep's three exit codes apart.** `0` = found a match, `1` = found nothing, `2` = grep
   itself failed. Only `1` is good news. A bare `grep || true` would treat a real error as clean,
   so the step captures the status explicitly instead.
3. **Prints where, never what.** File and line and which of the two tokens matched.

## Proof 1 — the logic, run locally both ways

The step body was copied to a script and run against two synthetic bundles. The only change was
taking the bundle root as an argument, since the workflow gets `web` from the job's
`working-directory` and cannot be pointed elsewhere.

A clean bundle passes:

```
$ bash bundle-scan.sh /tmp/bs/clean
Scanning 1 files under web/.next/static for sb_secret_ or service_role.
Clean: no sb_secret_ or service_role in any of the 1 files.
exit code: 0
```

A bundle containing both shapes fails:

```
$ bash bundle-scan.sh /tmp/bs/leak
Scanning 1 files under web/.next/static for sb_secret_ or service_role.
::error::A Supabase secret key shape was found in the built bundle. Everything under .next/static
is served to browsers, so treat the key as leaked and rotate it -- see docs/secrets.md.
Where it was found (file:line:matched-token -- the key itself is not printed):
/tmp/bs/leak/.next/static/chunks/main.js:1:sb_secret_
/tmp/bs/leak/.next/static/chunks/main.js:1:service_role
exit code: 1
```

Both tokens found, and the output shows `sb_secret_` without the invented key that followed it — so
`-o` is doing what it is there for.

The "nothing was scanned" guard also fired for real, by accident, when the script was run from the
wrong directory:

```
$ bash bundle-scan.sh
::error::web/.next/static does not exist, so NOTHING was scanned. Did the build step run?
exit code: 1
```

That is the branch that matters most, and it failed instead of passing.

## Proof 2 — end to end in CI, both directions

### The control: a clean bundle passes

Run `36572024100` on `ci/bundle-scan` itself (commit `4dcb3dc`), conclusion `success`. From the
`App build` log:

```
Scanning 24 files under web/.next/static for sb_secret_ or service_role.
Clean: no sb_secret_ or service_role in any of the 24 files.
```

This matters as much as the failure below. It shows the step really runs in CI, really reads 24 real
files, and does not break a clean build.

### The test: a leaking bundle fails

Throwaway branch `test/bundle-leak`, PR #26, run `36573882943`. **Not for merging.** From the
`App build` log:

```
Scanning 25 files under web/.next/static for sb_secret_ or service_role.
##[error]A Supabase secret key shape was found in the built bundle. Everything under .next/static
is served to browsers, so treat the key as leaked and rotate it -- see docs/secrets.md.
Where it was found (file:line:matched-token -- the key itself is not printed):
.next/static/chunks/2egur_b3juy0a.js:1:sb_secret_
##[error]Process completed with exit code 1.
```

Job results in that run:

```
X App build in 37s
  ✓ Install exactly what the lockfile says
  ✓ Lint
  ✓ Build
  X No Supabase secret key in the built bundle
X required
  X These jobs did not succeed (skipped counts as NOT succeeded): app-build
```

Three things worth reading off that list:

1. It failed at **the new step**, with `Install`, `Lint` and `Build` all green before it. The failure
   is the check firing, not a broken branch.
2. `required` failed with it, so a pull request in this state cannot be merged.
3. The log shows `sb_secret_` and **not** the invented key that follows it, in a public log, which is
   what `-o` is there for.

### The same run proves why this check was needed

In that run, `Secret scan (gitleaks)` **passed** — a green tick — on a branch that has a fake Supabase
secret key sitting in `web/src/app/page.tsx`:

```
✓ Secret scan (gitleaks) in 8s
```

That is the gap in issue #25, observed in CI rather than argued from a stdin test: gitleaks walked the
whole history, found the `sb_secret_` string, and did not consider it a secret. The bundle scan caught
what the dedicated secret scanner missed.

### One thing the hook taught us on the way

The first attempt to commit the fake string was **refused by the pre-commit hook**:

```
RuleID:      generic-api-key
Entropy:     5.041010
File:        web/src/app/page.tsx
Line:        20
exit code: 1
```

The constant was called `FAKE_SECRET`. gitleaks' generic rule fires on an identifier containing the
word "secret" beside a high-entropy string — not on the `sb_secret_` prefix. Same value, only the
name differing:

```
const k = "sb_secret_<invented>"            -> no leaks found,  exit 0
const FAKE_SECRET = "sb_secret_<invented>"  -> generic-api-key, exit 1
```

The owner chose to rename it. `--no-verify` was never used, and nothing was allowlisted or switched
off — the hook kept full force on every other line and file, and passed the renamed commit on its own
terms. This is recorded because "we renamed a variable to get past a secret scanner" is exactly the
sort of sentence that should never appear without its reason attached.

## What this does not cover

- **Only the two shapes asked for.** `sb_secret_` and `service_role`. A leaked key of any other
  shape — a Stripe key, a legacy Supabase JWT that does not contain the string `service_role` —
  passes this check.
- **Only `web/.next/static`.** Not `.next/server`, which is not served to browsers, and not the
  deployed output on Vercel.
- **Source files are still uncovered for this key shape.** This check reads the build output. A
  Supabase secret key sitting in a source file that never reaches the client bundle is caught by
  neither this nor gitleaks today — issue #25.
- **Unverified — the deployed site.** Nothing here was checked against a running deployment, only the
  build output produced in CI and locally.

## Issue filed

- #25 — gitleaks has no rule for Supabase `sb_secret_` keys, so a real secret key can be committed:
  https://github.com/build-once/team-tasks/issues/25
