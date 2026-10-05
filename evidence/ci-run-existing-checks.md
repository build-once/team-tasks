# Running the checks this repository already had — issue #140, PR #141

What was wired into `.github/workflows/ci.yml`, what was **not**, and the runs that prove each new
job can go red as well as green.

Written 5 October 2026 by the assistant (Claude Code), on branch `ci/run-existing-checks`.

---

## 1. The problem, in one line

Six issues — #73, #87, #95, #102, #114 and #136 — all say the same thing about different files: a
check was written, was proved able to fail on the day it was written, and then **nothing ran it
again**. This change runs the ones that need no secret and no staging account.

---

## 2. What is now wired, and what it costs

Three new jobs. None of them reads a secret. None of them sends anything to staging or production.

| Job | Runs | Counted |
|---|---|---|
| `pure-checks` | `node scripts/tasks-filter-check.mjs` | 47 PASS lines |
| | `node scripts/password-reset-check.mjs` | 84 PASS lines |
| `staging-script-selftests` | `node scripts/staging/build-it-16-checks.mjs --selftest` | 39 cases |
| | `node scripts/staging/build-it-16-suspend-checks.mjs --selftest` | 40 cases |
| `functions-test` | `deno test --no-lock --allow-env --config supabase/functions/create-team/deno.json supabase/functions/_tests/suspension_test.ts` | 40 tests |

`required`'s `needs` gains all three and `EXPECTED_JOBS` goes from 10 to 13, because GitHub counts a
skipped job as a pass.

**Every number above is a floor, not an equality.** Adding checks to a script must not turn a job
red. Running *fewer* than the floor does, because that is coverage quietly going missing — see §5.

**The one network call.** `functions-test` reaches `github.com` to download Deno, `jsr.io` and the
npm registry for the two imports in `supabase/functions/create-team/deno.json`. It reaches **no
Supabase project**: nothing in that job has a project URL, a key or an account.

---

## 3. Two decisions, and why

**Node needs no `--experimental-strip-types`.** Issue #87's owner comment asked for this to be
confirmed from Node's documentation rather than guessed. <https://nodejs.org/api/typescript.html>,
History table: *"v23.6.0, v22.18.0 — Type stripping is enabled by default."* CI's
`actions/setup-node` with `node-version: "22"` resolves to the newest 22.x; the job prints
`node --version` so the log records which one ran. Run 1 below printed **v22.23.3**, which is past
22.18.0, and both scripts loaded their `.ts` modules with no flag.

**Deno is installed from its own release, checksum-verified — not with a setup action.** A
third-party action is somebody else's code running with this repository's permissions, which
AGENTS.md rule 17 says the owner approves *before* it is added. `ci.yml` already installs the
gitleaks CLI exactly this way, so this follows a convention the file already has instead of adding a
dependency. Pinned: Deno **2.9.7**, sha256
`c6527f24f4b16031d3ae4fa9f658d5f11534c8d84ce7dc8502420280919c3490`, taken from that release's
`deno-x86_64-unknown-linux-gnu.zip.sha256sum`. If the owner would rather use `denoland/setup-deno`,
that is a rule 17 conversation first.

---

## 4. Run 1 — green, the jobs do run and do count

<https://github.com/build-once/team-tasks/actions/runs/37298766358> · commit `76303cf` ·
conclusion **success**

```
Pure-function checks   v22.23.3
Pure-function checks   47 of 47 checks passed.
Pure-function checks   tasks-filter: counted 47 PASS lines; at least 47 expected.
Pure-function checks   84 of 84 checks passed.
Pure-function checks   password-reset: counted 84 PASS lines; at least 84 expected.

Staging script self-tests   39 cases, 0 wrong.
Staging script self-tests   build-it-16: counted 39 cases; at least 39 expected.
Staging script self-tests   40 cases, 0 wrong.
Staging script self-tests   suspend: counted 40 cases; at least 40 expected.

Edge function tests (Deno)  /home/runner/work/_temp/deno.zip: OK
Edge function tests (Deno)  deno 2.9.7 (stable, release, x86_64-unknown-linux-gnu)
Edge function tests (Deno)  ok | 40 passed | 0 failed (28ms)
Edge function tests (Deno)  Counted 40 passing tests; at least 40 expected.
```

`required` in the same run:

```
  guard-selftest: success          pure-checks: success
  skills-lint: success             staging-script-selftests: success
  launch-check-selftest: success   functions-test: success
  workflow-lint: success           other-os: success
  vet-tool-selftest: success       secret-scan: success
  handoff-selftest: success        app-build: success
  drift-check-selftest: success
All 13 jobs succeeded.
```

---

## 5. Run 2 — red on purpose, each new job seen to fail

<https://github.com/build-once/team-tasks/actions/runs/37299667532> · commit `d8574ec` ·
conclusion **failure**

One break per job, each one that job's own failure mode. All three were run locally first, so the
run confirmed an expectation rather than discovering one.

**`pure-checks`** — `web/src/lib/tasks.ts:159`, `&& value !== ""` removed from the loop in
`tasksPath`. This is the break issue #102 names by hand.

```
FAIL  an empty value adds nothing
46 of 47 checks passed.
##[error]Process completed with exit code 1.
```

**`staging-script-selftests`** — `scripts/staging/build-it-16-checks.mjs`, the selftest loop
changed to `cases.slice(0, 5)`. **This is the interesting one.** The script still exits 0, and its
own summary line still claims 39 cases, because that line prints `cases.length`. Only 5 ran.

```
39 cases, 0 wrong.
build-it-16: counted 5 cases; at least 39 expected.
##[error]build-it-16 ran 5 cases, fewer than the 39 expected. A selftest that has stopped
running its cases cannot tell you the checks can still fail.
```

That is exactly the silent coverage loss issue #114 is about, and it is why the job counts the `ok`
lines instead of trusting the script's own total. A job that only checked the exit code would have
been green here.

**`functions-test`** — `supabase/functions/create-team/index.ts`, `checkSuspension` returns
`{ allowed: true }` when the `account_status` read reports an error, i.e. it fails **open**. The
mistake issue #136 names, and the one issue #130's 30 October grant change would start triggering.

```
create-team: FAIL CLOSED: the read returned an error with a Postgres code ... FAILED (647µs)
create-team: FAIL CLOSED: the read returned an error with no code at all ... FAILED (154µs)
the three functions give the same verdict for every case ... FAILED (341µs)
FAILED | 37 passed | 3 failed (20ms)
```

**The jobs that failed in run 2, in full:** `Edge function tests (Deno)`,
`Pure-function checks (My tasks filter, password reset)`,
`Staging script self-tests (can these checks fail?)`, and `required`. **Nothing else.**
`app-build`, `other-os`, `secret-scan` and the seven older self-tests were all green with all three
regressions in the tree — which is the measurement that matters: before this change, every one of
those three would have merged.

---

## 6. Run 3 — green again on the revert

<https://github.com/build-once/team-tasks/actions/runs/37299975055> · commit `cc8ab06` ·
conclusion **success**

`git diff 76303cf --stat` printed nothing after the revert, so the tree is byte-for-byte what it was
before the breaks.

All three new jobs green, with the same counts as run 1:

```
Pure-function checks        tasks-filter: counted 47 PASS lines; at least 47 expected.
Pure-function checks        password-reset: counted 84 PASS lines; at least 84 expected.
Staging script self-tests   build-it-16: counted 39 cases; at least 39 expected.
Staging script self-tests   suspend: counted 40 cases; at least 40 expected.
Edge function tests (Deno)  ok | 40 passed | 0 failed (31ms)
Edge function tests (Deno)  Counted 40 passing tests; at least 40 expected.
```

A fourth run follows, triggered by the commit that adds this file. Its tree is run 3's plus this
one markdown file, so it exercises nothing new; its link is in PR #141.

---

## 7. What is NOT wired, and why

Said plainly, because a partial answer reported as a whole one is the thing rule 8 exists to stop.

**Nothing here needs staging credentials, so nothing here was left out for that reason.** The staging
*runs* of the two `build-it-16` scripts are a different matter: they need the staging URL and the
Alice/Bob/Carol accounts, they are not in this change, and they belong to Build it 17.

| Issue | Wired here | Left, and why |
|---|---|---|
| **#73** smoke-test shell | **Nothing.** | There is no existing check to run. #73 asks for the ~60 lines of shell in `migrate-production.yml`'s `smoke-test` job to be **extracted into a script with a self-test first**. That is new code, not wiring. Issue stays open, untouched. |
| **#87** `tasks-filter-check.mjs` | All of it. The script runs in `pure-checks`; breaking `tasksPath` turned a required check red in run 2, and the failing job names the check. The Node question its comment asked is answered in §3. | Its owner comment asked for this to be batched with #73 and #95, which are **not** done. That is a scheduling note, not an acceptance criterion — every line of the issue's own "how we will know it is fixed" is now met. Recommend the owner closes it; not closed here. |
| **#95** drift-check shell | **Nothing.** `drift-check.mjs --selftest` already ran in CI before this change and still does. | Same shape as #73: the two branching `run:` blocks in `drift-check.yml` need a harness that extracts them from the YAML and executes them with stubs. New code. Issue stays open, untouched. |
| **#102** `tasks-filter-check.mjs` + `password-reset-check.mjs` | Both scripts run, in `pure-checks`. Its criteria 2 and 3 are met: the break went red in run 2, and `tasks-filter-check` now appears in `.github/workflows/ci.yml`. | Criterion **1 is not met**: `npm test` from the repository root still does not run either script. `package.json` was deliberately not touched — issue #140 scoped this to `ci.yml`, and the root `test` script is what `other-os` runs on Windows and macOS, so changing it changes what every pull request must pass. **Issue stays open for the `npm test` half.** |
| **#114** `build-it-16-checks.mjs --selftest` | The selftest runs in `staging-script-selftests`, the job is in `required`'s `needs`, and `EXPECTED_JOBS` went up. Its "if a CI job is added instead" clause is satisfied in full. | Its first criterion, `npm test` running the selftest, is **not** met, for the reason above. It also names two neighbours with **no selftest at all** — `scripts/staging/bob-invites-to-alices-team.mjs` and `scripts/staging/build-it-15-checks.mjs`. Confirmed in this session: `grep -c selftest` returns **0** for `build-it-14-checks.mjs` and **0** for `build-it-15-checks.mjs`, so there is nothing to wire for those two. Writing one is new work. **Issue stays open.** |
| **#136** Deno test + suspend selftest | All four of its criteria. (1) `functions-test` installs Deno at a pinned version and runs the test. (2) `staging-script-selftests` runs `build-it-16-suspend-checks.mjs --selftest`. (3) Both job names are in `required`'s `needs`. (4) `checkSuspension` was broken, run 2 went red for that reason, the revert went green — both links above. | Nothing of the issue's own asks. Its note that adding the Deno test to `npm test` would break `other-os` is **why the Deno test is its own job** rather than part of `npm test`. Recommend the owner closes it; not closed here. |

**One thing issue #140's wording does not match the files.** It asks for "the `--selftest` of each
`scripts/staging/build-it-*-checks.mjs` and of `scripts/password-reset-check.mjs`". Checked in this
session:

- Four files match `build-it-*-checks.mjs`. Only **two** have a `--selftest`:
  `build-it-16-checks.mjs` and `build-it-16-suspend-checks.mjs`. `build-it-14-checks.mjs` and
  `build-it-15-checks.mjs` contain the string `selftest` **zero** times.
- `scripts/password-reset-check.mjs` takes **no arguments at all** — `grep -n argv` finds nothing in
  it. It is run plainly, as `node scripts/password-reset-check.mjs`, and that runs all 84 checks.

So three of the five things that sentence asks for do not exist to be wired. The two selftests that
do exist are wired, and `password-reset-check.mjs` is wired in the form it actually has.

---

## 8. What this change does not claim

- **It says nothing about staging or production.** No job here sends a request to either. The
  suspension work being correct *in production* is a separate question, and an open one — see the
  `## 2026-10-05` section of `evidence/production-log.md`, where only `create-team`'s deployed
  contents were read. Filed as **#142**.
- **It does not test the shell in any workflow.** #73 and #95 are untouched, and the counting shell
  added by this change is itself not covered by a test — the same gap, now in one more place. Filed
  as **#143**.
- **`EXPECTED_JOBS: "13"` is a number a person has to keep right.** Adding a job without touching
  `needs` and that number is caught by the `required` job's own guard, which is why that guard is
  there.
