# Evidence: Build it 17 — access-rule tests on staging (issue #145)

Result: **PARTIAL** — the guard, the lint, the workflow lint and the counting logic are PASS below.
The staging run of `npm test` and the "App tests" job on the pull request are **unverified** at the
time this file was written, and are filled in below when each has been seen.
Date: 2026-10-05
How checked: every command below was run from the repository root on the owner's machine, one at a
time, and its exact output pasted. Node v24.13.1 locally; the CI job pins Node 22.
Checked by: Claude Code, on branch `test/access-rules`, from `main` at `691dab6`.

## What was added

| File | What |
|---|---|
| `web/tests/staging.mjs` | The URL guard, the five settings, sign-in and the request helpers. Not a test file |
| `web/tests/access-rules.test.mjs` | 25 tests, Node's built-in runner, no package |
| `web/package.json` | `"test": "node --test --test-reporter=tap tests/access-rules.test.mjs"` |
| `.github/workflows/ci.yml` | The `app-tests` job, `environment: staging`; added to `required`'s `needs`; `EXPECTED_JOBS` 13 → 14 |

## The guard refuses — four runs, no network call in any of them

The guard runs while `staging.mjs` is being imported, which is before the test file has registered
a single test, so none of these four runs sent a request anywhere. Each was run with obvious
placeholder values for the other four settings, never a real one.

### 1. No settings at all

```
$ node --test --test-reporter=tap web/tests/access-rules.test.mjs
TAP version 13
# Error: REFUSING TO RUN: these settings are not set, or are empty: STAGING_SUPABASE_URL, STAGING_SUPABASE_PUBLISHABLE_KEY, STAGING_ALICE_PASSWORD, STAGING_CAROL_PASSWORD, STAGING_BOB_PASSWORD.
# All five are needed: STAGING_SUPABASE_URL, STAGING_SUPABASE_PUBLISHABLE_KEY, STAGING_ALICE_PASSWORD, STAGING_CAROL_PASSWORD, STAGING_BOB_PASSWORD.
# No value is printed by these tests -- only names.
# A run without them is not a pass and must not be skipped (AGENTS.md rule 8).
not ok 1 - web\tests\access-rules.test.mjs
# pass 0
# fail 1
```

Exit code 1. Names only, no values.

### 2. A made-up URL

```
$ STAGING_SUPABASE_URL=https://not-a-real-project.example.com STAGING_SUPABASE_PUBLISHABLE_KEY=placeholder-not-a-real-key STAGING_ALICE_PASSWORD=placeholder STAGING_CAROL_PASSWORD=placeholder STAGING_BOB_PASSWORD=placeholder node --test --test-reporter=tap web/tests/access-rules.test.mjs
TAP version 13
# Error: REFUSING TO RUN: STAGING_SUPABASE_URL is not the staging project, so this run was stopped
# before any request. These tests sign in and create rows; they may run
# against staging and nothing else (AGENTS.md rules 1 and 10).
# Expected the host ghskxrhqlhvrhpnivqbd.supabase.co, exactly -- not a URL that merely
# contains ghskxrhqlhvrhpnivqbd somewhere. The host it found is not printed.
not ok 1 - web\tests\access-rules.test.mjs
# pass 0
# fail 1
```

Exit code 1.

### 3. A URL that only contains the staging ref

```
$ STAGING_SUPABASE_URL=http://127.0.0.1:8799/ghskxrhqlhvrhpnivqbd STAGING_SUPABASE_PUBLISHABLE_KEY=placeholder-not-a-real-key STAGING_ALICE_PASSWORD=placeholder STAGING_CAROL_PASSWORD=placeholder STAGING_BOB_PASSWORD=placeholder node --test --test-reporter=tap web/tests/access-rules.test.mjs
TAP version 13
# Error: REFUSING TO RUN: STAGING_SUPABASE_URL is not https, so this run was stopped before any request.
# It found the scheme "http:". Expected https://ghskxrhqlhvrhpnivqbd.supabase.co
# The rest of the value is not printed.
not ok 1 - web\tests\access-rules.test.mjs
# pass 0
# fail 1
```

Exit code 1. This one is caught by the **https** half of the guard, because it is `http`. That is a
correct refusal but it does not exercise the hostname comparison, so there is a fourth run.

### 4. https, and the expected host as a substring of a different host

```
$ STAGING_SUPABASE_URL=https://ghskxrhqlhvrhpnivqbd.supabase.co.attacker.example STAGING_SUPABASE_PUBLISHABLE_KEY=placeholder-not-a-real-key STAGING_ALICE_PASSWORD=placeholder STAGING_CAROL_PASSWORD=placeholder STAGING_BOB_PASSWORD=placeholder node --test --test-reporter=tap web/tests/access-rules.test.mjs
TAP version 13
# Error: REFUSING TO RUN: STAGING_SUPABASE_URL is not the staging project, so this run was stopped
# before any request. These tests sign in and create rows; they may run
# against staging and nothing else (AGENTS.md rules 1 and 10).
# Expected the host ghskxrhqlhvrhpnivqbd.supabase.co, exactly -- not a URL that merely
# contains ghskxrhqlhvrhpnivqbd somewhere. The host it found is not printed.
not ok 1 - web\tests\access-rules.test.mjs
# pass 0
# fail 1
```

Exit code 1. This is the run that shows the check is **not** a substring test: the value contains
`ghskxrhqlhvrhpnivqbd.supabase.co` in full, and `url.hostname` is compared whole, so it is refused.

## The npm script resolves its own path

```
$ npm --prefix web test

> web@0.1.0 test
> node --test --test-reporter=tap tests/access-rules.test.mjs

TAP version 13
# Error: REFUSING TO RUN: these settings are not set, or are empty: ...
```

Exit code 1 — the guard again, which is the expected answer with no settings loaded. What this run
shows is that `npm test` in `web` finds the file.

## The job's counting logic, over real TAP output

The `App tests` job reads the counts out of Node's TAP summary rather than trusting the exit code,
because a file whose tests had all been deleted would also exit 0. The same lines were run here
against two real logs produced by Node's runner.

```
$ bash parse.sh tap.log 2
App tests: 2 passed, 0 failed, 0 skipped, 0 todo; at least 2 expected to pass.
WOULD PASS
```

```
$ bash parse.sh tap.log 25
App tests: 2 passed, 0 failed, 0 skipped, 0 todo; at least 25 expected to pass.
FLOOR WOULD FAIL
```
Exit code 1 — the floor stops a run that tested fewer things than expected.

```
$ bash parse.sh tap-skip.log 2
App tests: 1 passed, 0 failed, 1 skipped, 0 todo; at least 2 expected to pass.
SKIP-GUARD WOULD FAIL
```
Exit code 1 — and note `# pass` is **1**, not 2: a skipped test does not count as a pass in Node's
own summary either.

## Lint and workflow lint

```
$ npm --prefix web run lint

> web@0.1.0 lint
> eslint
```
Exit code 0, no findings. ESLint does lint `web/tests` — there is no new ignore and nothing was
weakened to get this.

```
$ node scripts/check-workflows.mjs
Checked 4 workflow file(s), 20 job(s): 0 problem(s), 0 warning(s).
```
Exit code 0. The new job has both `permissions:` and `timeout-minutes:`.

## The count: 25

Counted in this session from the test file, not remembered:

```
$ grep -c "^test(" web/tests/access-rules.test.mjs
18
$ grep -c "^  \[\"" web/tests/access-rules.test.mjs
7
```

18 tests written out one by one, plus 7 generated from the list of relations the signed-out section
walks — `tasks`, `teams`, `team_members`, `invitations`, `profiles`, `account_status` and the
`team_roster` view. `EXPECTED_APP_TESTS` in `ci.yml` is **25**, as a floor.

## What the tests create on staging

| Row | Where | Removed again |
|---|---|---|
| One task in the team Alice owns and Carol belongs to | `tasks` | Yes — deleted by Alice in the test, and again by the `after()` hook if a test failed first |
| One personal task owned by Alice | `tasks` | Yes — the same way |
| One invitation to `teamtasks.staging.test+ci-invite@gmail.com` | `invitations` | **No.** Created at most once in the life of the project; every later run is refused by the partial unique index with 409 and code 23505. A publishable key cannot delete it — `invitations` has a read policy for the team's owner and no delete policy |
| Three auth sessions | `auth.sessions` | Yes — signed out in the `after()` hook |

Nothing else is written, and nothing the tests did not create is changed or deleted.

## The first CI run on PR #147 — the guard refused there too

Run [37318706722](https://github.com/build-once/team-tasks/actions/runs/37318706722), 5 Oct 2026.

```
$ gh run view 37318706722 --json jobs --jq '.jobs[] | "\(.conclusion)\t\(.name)"'
success	Vet-tool self-test
success	Workflow lint (permissions + timeouts)
success	Skills lint
success	Secret scan (gitleaks)
success	Staging script self-tests (can these checks fail?)
success	Handoff self-test
failure	App tests (access rules on staging)
success	Guard self-test
success	npm test (macos-latest)
success	Edge function tests (Deno)
success	Launch check self-test
success	Pure-function checks (tasks-filter-check, password-reset-check)
success	App build
success	npm test (windows-latest)
success	Drift-check self-test
failure	required
```

**Three things this settles.**

1. **The five environment secrets exist.** The job's first step, "All five settings must be
   present", **passed** — so `environment: staging` handed the job all five, none empty.
2. **`required` sees 14 jobs.** Its log lists all fourteen by name and raises no count error; it
   failed for one reason only: `These jobs did not succeed (skipped counts as NOT succeeded):
   app-tests`.
3. **`App tests` failed at the guard, before any network call**, with the hostname refusal:

```
# Error: REFUSING TO RUN: STAGING_SUPABASE_URL is not the staging project, so this run was stopped
# before any request. ...
# pass 0
# fail 1
App tests: 0 passed, 1 failed, 0 skipped, 0 todo; at least 25 expected to pass.
X npm test exited 1. Read the lines above: ...
```

So the secret parses and **is** https — both earlier checks passed — and its host is not
`ghskxrhqlhvrhpnivqbd.supabase.co`. **The host it found is not printed anywhere**, in the job log
or here: GitHub masks a secret's whole value and not a part of it, this repository's run logs are
public, and a project reference identifies an environment. The owner reads the secret; nobody else
can.

The likeliest cause is the wrong one of two addresses — the dashboard address,
`https://supabase.com/dashboard/project/<ref>`, parses perfectly well and fails exactly this way.
Reproduced locally, which is how the guard's message came to name it:

```
$ STAGING_SUPABASE_URL=https://supabase.com/dashboard/project/ghskxrhqlhvrhpnivqbd ... node --test --test-reporter=tap web/tests/access-rules.test.mjs
# Error: REFUSING TO RUN: STAGING_SUPABASE_URL is not the staging project ...
# pass 0
# fail 1
```
Exit code 1 — the same refusal the CI run printed.

**This is the guard working, not the guard failing.** It is also, unplanned, the fifth proof that
it refuses: in CI, with a real secret, before a single request.

## Unverified at the time of writing

- **Unverified — `npm test` against staging.** The three passwords are the owner's and are not the
  assistant's to hold, so the assistant has never run this against staging. The owner runs it and
  the output goes in the pull request and here.
- **Unverified — the `App tests` job on the pull request.** It has not run yet.
- **Unverified — staging's row counts before and after a run.** The owner runs the counts on
  staging; the assistant has no way to count rows it cannot read.
- **Unchecked — whether the `staging` GitHub environment and its five secrets exist.** Issue #145
  says the owner created them. Nothing in this session read them back, and nothing could: a secret
  is not readable from a workflow log or from here.
