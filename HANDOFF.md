# HANDOFF

Generated: 2026-10-15T17:09:25Z by scripts/handoff.mjs. Secret-looking strings and email addresses are redacted.
Read this first when you start a new session. Check anything important against the repo itself; this file is a summary, not the truth.

## Branch

`launch/final`

## Last commits (newest first, up to 10)

```
70ec9fa  2026-10-15  Merge pull request #326 from build-once/launch/batch-1
8381f6f  2026-10-15  docs: the owner's four answers, recorded in the files they belong to
9f03391  2026-10-15  docs: Build it 30 batch 1 -- four proven rows, the secret scan, and the public-repo decision
e792066  2026-10-15  Merge pull request #325 from build-once/docs/build-it-29-evidence
1ec548c  2026-10-15  docs: Build it 29's owner results, and the staging claim I got wrong twice
34553e9  2026-10-15  Merge pull request #324 from build-once/fix/health-anon
baffab3  2026-10-15  fix: /health runs as anon, which the switches migration revoked
96b3342  2026-10-15  Merge pull request #316 from build-once/feat/bad-day
47dfa23  2026-10-15  fix: the migration's own pre-check refused a push that works
992fcb9  2026-10-15  feat: four kill switches, a health check, and a way to reach a person
```

## Working tree (git status)

1 path(s) not committed: 0 staged, 1 modified, 0 deleted, 0 untracked, 0 conflicted.

## Changed files

Uncommitted changes (no main branch found locally to compare against):

- `HANDOFF.md`

## Open TODO / FIXME in changed files

_None found in the changed files._

## Decisions / Next steps

_Fill this in before you stop. The tool keeps this section when it regenerates the file._

**THIS SECTION WAS STALE AND IS REWRITTEN, 15 October 2026.** `scripts/handoff.mjs` preserves it
across regenerations, which is the right behaviour and means it goes quietly out of date: until now
it described **the Build Once kit**, not this app — "22 guard rules with 203 self-test examples",
PRs #1–#4, and "private until v0.1 is finished", which **contradicts
`docs/decisions/public-repo.md`**. Anybody who had trusted it would have been reading about a
different repository. The guard today has **24 rules and 537 examples**, measured in this session.

- **What this project is:** `team-tasks`, the app the course is built around — a shared to-do list
  for a volunteer group of about six. `docs/plan.md` is the agreed scope and is read at the start of
  every session; `AGENTS.md` holds the 20 rules.
- **Where it got to today (15 Oct 2026):** Build it 27 (the Team plan, a Stripe **rehearsal** with
  no live keys), 28 (no app-store app — `docs/decisions/mobile.md`), 29 (four kill switches, a health
  check, Contact us, Dependabot on `web/`) and 30 (the launch checklist) all merged to `main`, CI
  green. PRs #314, #315, #316, #324, #325, #326.
- **The launch check stands at 33 PASS / 0 FAIL / 6 TODO** (`evidence/launch-check.txt` is the saved
  run). The six are **owner dashboard looks deliberately not done in the rehearsal**: `accounts-2fa`,
  `spend-caps`, `billing-alerts`, `env-separate-keys`, `previews-staging`, `error-monitoring`. **They
  must be done before any real launch.**
- **Decided today, and worth not re-arguing:** the repository is **public on purpose** (Vercel Hobby
  cannot deploy a private org repo) — `docs/decisions/public-repo.md`; `repo-private` is therefore an
  **evidence** row rather than an automatic one, because `launch-check.mjs` has no N/A path for an
  auto row; **Sentry** watches `/health` every minute, so no seventh outside company.
- **Not done / open, and the first four are the ones that bite:**
  - **Three of the four kill switches have been flipped nowhere but a local sandbox** —
    `invitations`, `attachments`, `payments`. Only `ai_suggestions` was exercised on staging.
  - **No second uptime monitor** on an address that does not exist, so the alarm has been seen to go
    red only by accident (a real 503 on 15 Oct), not on purpose.
  - **8 Dependabot alerts are open**, and **ten Dependabot pull requests are open** (#317–#323, #270,
    #163, #125); several were red and are deliberately unmerged.
  - **`error-monitoring` needs a deliberate test error.** The page that produced event ids on 6 Oct
    was `/temp-error-test`, **reverted in `183a17f`** — so re-adding it temporarily on a **preview**
    is the way. **Sentry listing only "preview" is expected, not a fault:** this app sets a **tag**
    called `deployment` from `VERCEL_ENV`, never Sentry's own `environment`. Filter on that tag.
  - Older threads: #313 (a flaky backup assertion, ~0.9% of runs), #311, #309, #308, #306, #305,
    #300, #298.
- **Next step (first thing to do):** the six TODO rows, in the order `evidence/launch-check.txt`
  gives — they are dashboard looks and need no code.
- **How to check it worked:** `node scripts/launch-check.mjs` → 33 PASS / 0 FAIL / 6 TODO today, and
  every row PASS or a written N/A before a real launch.

**Marked UNCHECKED in this session, so do not read them as facts:** whether production's storage
policies refuse Bob (same migrations as staging, never read back that way); whether the `auth` schema
is inside Supabase's own backups (no page read says so); which migrations the cited drift-check run
compared (reading its log was refused by this repository's own guard, and rule 5 says stop rather
than reword); and whether GitHub's Secret Protection has ever actually stopped a push (both settings
read as on, never tested).
