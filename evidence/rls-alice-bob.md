# Evidence: rls-alice-bob

Result: PASS — Bob is refused Alice's rows on read, write and delete, and it is asserted on **every
pull request** against the real staging database rather than observed once.
Date: 2026-10-15
How checked: `web/tests/access-rules.test.mjs` signs in as Alice, Bob and Carol against **staging**
with the publishable key, and asserts what each may and may not do. It runs in CI as the job
**"App tests (access rules on staging)"**, which requires **at least 44 passing tests** (`EXPECTED_APP_TESTS`
in `.github/workflows/ci.yml:1568`) and fails the run if fewer pass.
Checked by: CI, on every pull request. The run cited below is the owner's merge of PR #325 to
`main`. **The assistant has not signed in to staging** — it holds none of the five settings those
tests need, and a local `npm test` in `web/` refuses to run without them.

---

## 1. The run

| | |
|---|---|
| Workflow run | **[38746693998](https://github.com/build-once/team-tasks/actions/runs/38746693998)** on `main` |
| Commit | `e792066` — "Merge pull request #325 from build-once/docs/build-it-29-evidence" |
| Job | **App tests (access rules on staging)** — `success`, started 2026-10-15T13:54:23Z |
| Floor | 44 tests must pass, or the job fails |

```
$ gh run view 38746693998 --json jobs
App tests (access rules on staging): success  started=2026-10-15T13:54:23Z
```

**Why a CI job counts for this row.** `checklist/launch.json`'s own `how_to_prove` says so: *"Log in
as Alice, create a record. Log in as Bob and try to read, edit and delete it. Paste the results (all
three must be refused). **A test file that does this counts.**"*

## 2. What it asserts about Bob

Read off `web/tests/access-rules.test.mjs` in this repository. Bob is an ordinary signed-in person
with his own account — not a signed-out caller, which is the weaker test.

- **read** — Bob's select does not return Alice's personal task
- **change** — Bob's update of Alice's row changes nothing
- **delete** — Bob's delete of Alice's row removes nothing
- **and the row is read back afterwards**, so a refusal that silently did something would fail

**Row-level security refuses by returning nothing rather than by erroring**, which is why the
read-back matters: a test that only checked for an error message would pass against a policy that
quietly deleted the row.

## 3. Why this is stronger than one observation

- it runs **against staging**, the real Postgres with the real policies, not a mock;
- it runs **on every pull request**, so a policy change that opened a hole turns a check red the
  same day rather than at the next audit;
- the **count is a floor**: a test file whose tests were deleted would still exit 0, so the job
  counts passes and fails below 44.

## 4. What this does NOT establish

- **Nothing about production's policies.** They are the same migrations, applied by the same
  pipeline — but no test signs in to production, and rules 1 and 10 forbid one.
- **Carol is the subtler case and is covered by the same file**, not by this row's wording: a team
  mate who *can* see a task still may not delete somebody else's file or a task she did not create.
- **This file cites a run rather than pasting its log.** The job's output is in a public Actions log
  at the link above; copying it here would add nothing it does not already say, and the counts are
  enforced by the job rather than by this file.
- **Nothing was captured from production.** The accounts are the staging test accounts, Alice, Bob
  and Carol; the list of redacted values is empty.
