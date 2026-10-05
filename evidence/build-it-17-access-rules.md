# Evidence: Build it 17 — access-rule tests on staging (issue #145)

Result: **PASS** — the guard, the lint, the workflow lint and the counting logic are PASS below, and
the **App tests** job is green on commit `25a1a36`: run 37341726285, 25 passed, 0 failed, read from
the job log in this session. The owner's earlier local run is recorded separately as **reported**,
not observed here. One thing is still not run: `npm test` with `scope=local` from a machine rather
than from CI.
Date: 2026-10-05
How checked: every command below was run from the repository root on the owner's machine, one at a
time, and its exact output pasted. Node v24.13.1 locally; the CI job pins Node 22.
Checked by: Claude Code, on branch `test/access-rules`, from `main` at `691dab6`.

**Added 5 Oct 2026 (issue #151), from `main` at `16c97bf`:** the section "Build it 17's last step:
break a rule on purpose, watch a test fail, put it back" below. The tests have now been **seen to
fail** — two of them, for the right reason, with a read rule deliberately broken on staging — and
seen to pass again once it was put back. Those lines were read from the run's own logs with `gh` in
this session. The policy change itself, and the staging row and policy counts, are the owner's and
the coach's reports, marked as such where they appear.

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

## Sign-out narrowed to `scope=local`

Added 5 Oct 2026. `signOut()` in `web/tests/staging.mjs` posted to
`/auth/v1/logout?scope=global`, which ends **every** session belonging to that account — so each
test run signed the owner's own browser out of Alice, Carol and Bob on staging. It now posts
`?scope=local`, which ends only the session the run itself created.

`local` was confirmed from the installed client, not recalled:

```
$ grep -n "SIGN_OUT_SCOPES" web/node_modules/@supabase/auth-js/dist/main/lib/types.js
3:exports.SIGN_OUT_SCOPES = void 0;
23:exports.SIGN_OUT_SCOPES = ['global', 'local', 'others'];
```

Exit code 0. `GoTrueAdminApi.js:72` builds the request as `` `${this.url}/logout?scope=${scope}` ``
after rejecting any scope outside that list, so the query-parameter form used here is the client's
own. `lib/types.d.ts:1931-1943` documents the three: "Global means all sessions by this account.
Local means only this session. Others means all other sessions except the current one."

The comment block above `signOut()` and the endpoint list in the file's header both said `global`;
both now say `local` and say why. Nothing else in the tests changed —
`web/tests/access-rules.test.mjs` is untouched.

Lint, re-run after the change:

```
$ npm --prefix web run lint

> web@0.1.0 lint
> eslint
```

Exit code 0, no findings.

**Exercised in CI**, on commit `25a1a36` — the three sign-outs answered HTTP 204. See "The green
CI run" below. No *local* run with `scope=local` has been made.

**Five scripts still do this.** `scripts/staging/build-it-14-checks.mjs`,
`build-it-15-checks.mjs`, `build-it-16-checks.mjs`, `build-it-16-suspend-checks.mjs` and
`bob-invites-to-alices-team.mjs` all still post `?scope=global`. They were left alone because this
pull request's scope was the test file. Filed as
[#150](https://github.com/build-once/team-tasks/issues/150), with the line numbers.

## The staging run — reported, not observed here

Added 5 Oct 2026. Everything in this section was **reported to the assistant**, which did not run
any of it and cannot: the three passwords are the owner's, and the assistant has no read access to
staging's tables. It is recorded exactly as reported, and the raw TAP log and the raw SQL output
were not pasted, so there is no exact output to reproduce below — the figures are what there is.
Treat it as the owner's and the coach's testimony, which is a weaker thing than a pasted log, and
say so rather than letting the numbers read as something this session saw.

### The run

| | |
|---|---|
| Command | `npm --prefix web test` |
| Who ran it | The owner, locally, against staging |
| When | 5 Oct 2026 |
| Result | **25 passed, 0 failed, 0 skipped, 0 todo** |
| Run marker | `ba0947e8-9687-4081-9caa-b010b825f7b2` |
| Alice's invite | answered **201** |
| Bob's invite | answered **403** |

25 passed meets the `EXPECTED_APP_TESTS` floor of 25 exactly, and 0 skipped and 0 todo clear the
skip-guard. 201 for Alice is the "created" branch rather than the 409 / 23505 one, so this was the
run that created the one `+ci-invite` invitation the table above predicts. Bob's 403 is the refusal
the pull request describes; whether its body carried the owner-check message rather than the
suspension one is a test assertion inside that run, not something reported separately.

**That run used `scope=global`.** It was made before the sign-out change now on this branch, so it
is evidence for the 25 tests and **not** evidence for the code as it currently stands.

### Row counts on staging, before and after

Before — the **owner**, in staging's SQL editor. After — the **coach**, through the staging
read-only connector. Two different observers using two different tools, which is worth naming:
neither number was produced by the same hand twice.

| Table | Before | After | Change |
|---|---|---|---|
| `tasks` | 9 | 9 | 0 |
| `teams` | 9 | 9 | 0 |
| `team_members` | 2 | 2 | 0 |
| `invitations` | 4 | 5 | **+1** |
| `profiles` | 3 | 3 | 0 |
| `account_status` | 0 | 0 | 0 |

The single new invitation is to the `+ci-invite` address, and **0 tasks carry the run marker**.
That is the result the "What the tests create on staging" table above predicts, item for item: the
two task rows were created and removed again, and the one invitation stayed because nothing holding
a publishable key can delete it.

### Issue #146

**#146 is a duplicate of #145.**

## The green CI run — read from the log in this session

Run [37341726285](https://github.com/build-once/team-tasks/actions/runs/37341726285), 5 Oct 2026,
`pull_request`. Unlike the section above, this one **was** read here: the job log was fetched with
`gh` and the lines below are quoted out of it.

```
$ gh run view 37341726285 --json headSha,headBranch,status,conclusion,createdAt,event
{"conclusion":"success","createdAt":"2026-10-05T16:33:18Z","event":"pull_request","headBranch":"test/access-rules","headSha":"25a1a363c6ba56021c004a35ee66a947e957283b"}
```

`headSha` is `25a1a363c6ba56021c004a35ee66a947e957283b` — commit `25a1a36`, the commit that made
sign-out `scope=local`. **So this run exercised `scope=local`**, and it is the first run that did.
All 16 jobs concluded `success`, `required` included.

### The count, quoted exactly

```
App tests: 25 passed, 0 failed, 0 skipped, 0 todo; at least 25 expected to pass.
```

Node's own summary, from the same log: `# tests 25`, `# pass 25`, `# fail 0`, `# skipped 0`,
`# todo 0`.

### The two invite statuses, quoted from the log

```
# \# Bob inviting: HTTP 403 {"error":"Only the team's owner can invite people."}
ok 17 - Bob CANNOT invite anyone to Alice's team (403)
# \# Alice inviting: HTTP 409 {"error":"That person already has an invitation waiting for this team.","code":"23505"}
ok 18 - Alice CAN invite to her own team (201, or 409 with code 23505)
```

**Alice answered 409, not 201** — the other accepted branch, and the right one here: the owner's
local run already created the single `+ci-invite` invitation, so the partial unique index refuses
the second attempt with code `23505`. That is the path the test was written to accept, and it is
why `invitations` does not climb with each run. Bob answered **403** carrying the owner-check
message rather than the suspension one, which is the assertion that distinguishes the two.

### The three sign-outs, quoted from the log

```
# \# Alice signed out: HTTP 204
# \# Carol signed out: HTTP 204
# \# Bob signed out: HTTP 204
```

HTTP 204 from all three, with `?scope=local`. The endpoint accepts the narrowed scope; the earlier
"not exercised" note in this file no longer holds and has been corrected.

### Row counts after this run

Reported by the **coach**, through the staging read-only connector. Not read here.

| Table | After local run | After this CI run | Change |
|---|---|---|---|
| `tasks` | 9 | 9 | 0 |
| `teams` | 9 | 9 | 0 |
| `team_members` | 2 | 2 | 0 |
| `invitations` | 5 | 5 | 0 |
| `profiles` | 3 | 3 | 0 |
| `account_status` | 0 | 0 | 0 |

**Unchanged from after the local run** — every table, including `invitations`, which is what
Alice's 409 predicts: the run created the two task rows and removed them again, and added no
invitation because the one it would add was already there.

### What this run also settles

`STAGING_SUPABASE_URL` was corrected. The run before it,
[37318706722](https://github.com/build-once/team-tasks/actions/runs/37318706722), failed at the
hostname check; this one signed in as all three accounts and reached staging, which cannot happen
unless the secret is `https` and the host is exactly the staging project. The value itself is still
unread and unprinted — a secret cannot be read from a log — so what is settled is that it is
**right**, not what it is. The same run settles the `staging` environment and its five secrets:
sign-in as Alice, Carol and Bob all succeeded, so all five are present and correct.

## Build it 17's last step: break a rule on purpose, watch a test fail, put it back

Added 5 Oct 2026, for [#151](https://github.com/build-once/team-tasks/issues/151). A test nobody has
seen fail is not yet known to be a test. This section is the record of making these ones fail, and
of the green run that followed.

### The book's method does not fit, and why

The book's method for this step is to remove the policy a test relies on. That does not work here.
`tasks` has **one** read policy covering both personal and team tasks, and removing a policy can
only ever **narrow** access — so every "Bob CANNOT read…" test would still pass, and the only tests
that could fail are the "Alice CAN…" and "Carol can…" ones. Breaking the rules in the direction the
book suggests proves the wrong half.

So the **owner** did the opposite, in staging's SQL editor:

```sql
create policy "TEMP broken on purpose - Build it 17" on public.tasks for select to authenticated using (true);
```

One extra permissive policy. Postgres ORs `select` policies together, so this one alone lets any
signed-in account read every row in `tasks` — which is exactly the thing point 5 of `docs/plan.md`
forbids, and exactly what the "Bob CANNOT" tests exist to catch. **Reported, not run here**: the
assistant has no write access to staging and did not run this statement.

### The three attempts of run 37344248197

One run, re-run twice. All three attempts are the same run id, so all three carried the same commit.

```
$ gh run view 37344248197 --json headSha,workflowName,conclusion,event,attempt,headBranch,createdAt,updatedAt,status,url
{"attempt":3,"conclusion":"success","createdAt":"2026-10-05T16:53:16Z","event":"pull_request","headBranch":"test/access-rules","headSha":"cdcde5377791665891ce3343e7a3788c8a2ff12b","status":"completed","updatedAt":"2026-10-05T17:55:32Z","url":"https://github.com/build-once/team-tasks/actions/runs/37344248197"}
```

| Attempt | When `App tests` ran | `App tests` | The run | What was true on staging |
|---|---|---|---|---|
| 1 | 16:53:20–16:53:37Z | success | success | the real policies |
| 2 | 17:40:32–17:40:44Z | **failure** | **failure** | the temporary permissive policy added |
| 3 | 17:54:38–17:54:47Z | success | success | the temporary policy dropped again |

Attempts 1 and 3 were read with `gh run view 37344248197 --attempt <n> --json conclusion,jobs`;
attempt 2's job list came from the same command. Attempt 2 and attempt 3 each re-ran the failed
jobs only — `App tests` and `required` — which is why the other fourteen jobs still carry attempt
1's timestamps.

**Which commit the re-runs executed.** `headSha` is `cdcde5377791665891ce3343e7a3788c8a2ff12b` —
commit `cdcde53`, the head of `test/access-rules` at the time. A re-run re-executes **the run's own
commit**, both the workflow file and the test file, not whatever `main` has moved on to. So this is
evidence about `cdcde53`, and nothing else.

### Attempt 2 — the two tests that failed, quoted from the log

Read in this session with
`gh run view 37344248197 --attempt 2 --log`. The owner reported these same lines first; they are
quoted here from the log rather than from the report.

```
not ok 7 - Bob CANNOT read Alice's team task
  ---
  duration_ms: 65.900022
  type: 'test'
  location: '/home/runner/work/team-tasks/team-tasks/web/tests/access-rules.test.mjs:246:1'
  failureType: 'testCodeFailure'
  error: |-
    Bob reads Alice's team task: the database ALLOWED it -- 1 row(s) affected

    1 !== 0

  code: 'ERR_ASSERTION'
```

```
not ok 13 - Bob CANNOT read Alice's personal task
  ---
  duration_ms: 126.912377
  type: 'test'
  location: '/home/runner/work/team-tasks/team-tasks/web/tests/access-rules.test.mjs:348:1'
  failureType: 'testCodeFailure'
  error: |-
    Bob reads Alice's personal task: the database ALLOWED it -- 1 row(s) affected

    1 !== 0

  code: 'ERR_ASSERTION'
```

**Two, and exactly the right two.** The failure message is the test's own wording — "the database
ALLOWED it" — and `1 !== 0` is Bob getting one row where he must get none. Nothing else moved.

Node's summary and the job's own count line, from the same log:

```
1..25
# tests 25
# suites 0
# pass 23
# fail 2
# cancelled 0
# skipped 0
# todo 0
# duration_ms 5977.614992
App tests: 23 passed, 2 failed, 0 skipped, 0 todo; at least 25 expected to pass.
##[error]npm test exited 1. Read the lines above: a FAIL here is an access rule not doing what its migration says it does.
##[error]Process completed with exit code 1.
```

23 + 2 = 25, so no test vanished — two reported a wrong answer. The run still exercised all 25,
and `0 skipped, 0 todo` means nothing was quietly stepped over.

**`required` failed, and named the job**, from the same log:

```
Result of every needed job:
  guard-selftest: success
  skills-lint: success
  launch-check-selftest: success
  workflow-lint: success
  vet-tool-selftest: success
  handoff-selftest: success
  drift-check-selftest: success
  pure-checks: success
  staging-script-selftests: success
  functions-test: success
  other-os: success
  secret-scan: success
  app-build: success
  app-tests: failure
##[error]These jobs did not succeed (skipped counts as NOT succeeded): app-tests
##[error]Process completed with exit code 1.
```

`EXPECTED_JOBS: 14` in the same step's environment, and fourteen jobs are listed, so the count
guard was satisfied and `required` failed for one reason only: `app-tests`. **This is the whole
point of the step** — a broken access rule on staging turns the one check a merge waits on red.

### The temporary policy was dropped

Reported: the **owner** dropped the temporary policy. Confirmed by the **coach**, through the
staging read-only connector — **5 policies on `tasks`, the temporary one absent**. Not read here:
the assistant has no connector to staging and cannot list policies.

### Attempt 3 — green again, quoted from the log

Read with `gh run view 37344248197 --attempt 3 --log`. The same two tests, now passing:

```
ok 7 - Bob CANNOT read Alice's team task
ok 13 - Bob CANNOT read Alice's personal task
```

The count line:

```
App tests: 25 passed, 0 failed, 0 skipped, 0 todo; at least 25 expected to pass.
```

Node's own summary from the same log: `1..25`, `# tests 25`, `# pass 25`, `# fail 0`, `# skipped 0`,
`# todo 0`. And `required`:

```
All 14 jobs succeeded.
```

**Fail, then recover, with nothing touched in between but the database.** No test file, workflow
file or migration changed across the three attempts — it is one commit, `cdcde53`, run three times.
That is what makes this evidence rather than coincidence: the only variable was the access rule, and
the tests followed it both ways.

### Staging row counts and policy count after the last attempt

Reported by the **coach**, through the staging read-only connector. **Not read here.**

| Table | After attempt 3 |
|---|---|
| `tasks` | 9 |
| `teams` | 9 |
| `team_members` | 2 |
| `invitations` | 5 |
| `profiles` | 3 |
| `account_status` | 0 |

Policies in `public`: **16**. Every row count is unchanged from after the green run on `25a1a36`
recorded above — including `invitations` at 5, which is Alice's 409 again — so breaking a read rule
and putting it back left nothing behind.

### The rule this step adds

`AGENTS.md` rule 20, added in the same pull request: when a test fails, fix the code, never the
test. Nothing in rules 1–19 said it. Rule 5 forbids weakening a **check** in
`.github/workflows/`, and rule 8 forbids calling an unrun check a pass, but neither covers deleting,
skipping or loosening a test. Attempt 2 above is the case the rule exists for: two red tests whose
quickest route to green would have been to delete them.

## Still not reported, and still unverified

- **Not run — `npm --prefix web test` with `scope=local`, locally.** CI has now run it on
  `25a1a36`, and three more times on `cdcde53` in run 37344248197, but nobody has run it from a
  machine. What would settle it: the owner runs `npm --prefix web test` and the three sign-outs
  answer 2xx — and, the part CI cannot show, their own browser session on staging survives it.
- **Not read here — the staging policy list and the row counts in the section above.** Both are the
  coach's report through the staging read-only connector. What would settle it: the same connector,
  or the owner pasting the output of `select count(*) from pg_policies where schemaname = 'public';`
  and the six `count(*)` queries from staging's SQL editor.
