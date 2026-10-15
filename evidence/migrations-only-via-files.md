# Evidence: migrations-only-via-files

Result: PASS — the rule is written down and enforced by a guard, and a daily job compares
production's applied migrations with the files in this repository. The latest run,
**15 October 2026 at 11:35:42 UTC, succeeded**, which for that script means "checked, and production
matches the repository".
Date: 2026-10-15
How checked: read the rule in `AGENTS.md`, read the guard that enforces it, and read the last three
`drift-check` runs out of the Actions API with `gh run list --json`.
Checked by: the daily job, and the assistant for the run list. **Nobody ran anything against
production**: the drift check runs in CI with production's own credentials, which rules 1 and 10
keep away from the assistant.

---

## 1. The rule we follow

**`AGENTS.md` rule 1 and rule 10**, in their own words: *"Changes reach production only through a
pull request that the owner merges."* And rule 19's narrowing, which is the only exception and does
not cover schema: *"Schema and code reach production **only** through the pipeline — a pull request
the owner merges. Never `db push`, `functions deploy` or a migration against production yourself."*

**It is enforced rather than remembered, in three places:**

| | |
|---|---|
| **The guard** | `.claude/guard/` refuses every `supabase db push` except `--local` from the assistant, on any project. Its self-test is a CI job: *"PASS: 537 rule examples across 24 rules, plus 32 fail-closed checks."* |
| **The pipeline** | `.github/workflows/migrate-production.yml` runs on a push to `main` and nothing else — no `pull_request` trigger, no `workflow_dispatch` |
| **The drift check** | below: it is what catches a change made by hand anyway |

**What the rule does NOT forbid**, said plainly because the row's wording invites the wrong reading:
**the owner applies migrations to STAGING by hand**, with `supabase db push`, and that is the
intended route — staging migrations have no CI job yet
([#55](https://github.com/build-once/team-tasks/issues/55)). The rule is about **production**.

## 2. The drift check, and the last three runs

`.github/workflows/drift-check.yml` runs daily on a schedule, compares the migrations applied to
production against the `.sql` files in `supabase/migrations/`, and **opens a GitHub issue titled
"Database drift"** — matching an existing open one by exact title, so a daily failure comments
rather than opening thirty — and fails the run.

```
$ gh run list --workflow=drift-check.yml --limit 3 --json conclusion,event,createdAt,databaseId
success schedule 2026-10-15T11:35:42Z id=38728446447
success schedule 2026-10-14T11:58:57Z id=38560429712
success schedule 2026-10-13T14:17:28Z id=38412080779
```

**`success` is the informative outcome here**, which is unusual and is why the exit codes matter:
the script exits **0** for "checked, and they match", **3** for drift, and **1** for "could not
check" — and the workflow fails the run on both of the latter. So a green run is not silence; it is
a comparison that was made and agreed.

## 3. The one thing worth knowing about this row

**A green drift check does not mean nobody could change production by hand** — it means that if they
did, the difference would show up within a day. The owner holds production's credentials and can
reach the SQL editor; that is unavoidable and is what makes this a daily comparison rather than a
lock.

## 4. What this does NOT establish

- **The run's log body was not read.** What is cited is each run's `conclusion` from the Actions API.
  An attempt to read run #84's log was **refused by this repository's own guard** (`db-remote-write`,
  because the grep pattern contained the literal text of a remote push), and under rule 5 it was not
  reworded — so **which migrations that particular comparison saw is unchecked here**.
- **The drift check reads production and this file does not.** How many migrations production has
  applied is in `docs/environments.md`, from the coach's connector reads; nothing in this file
  re-establishes it.
- **Nothing was captured from production**; the list of redacted values is empty.
