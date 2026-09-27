# AI team add-on

An optional add-on for Build Once: a small team of AI agents that works on your project inside walls you can see and test. It is the working version of **Book 3, Part 6: Your AI team**.

| Agent | Starts when | It can only | The harness (plain code, no AI) then |
| --- | --- | --- | --- |
| Triage | Anyone opens an issue | Fill in a form | Applies allow-listed labels and a templated comment |
| Builder | A maintainer adds `agent:build` and has written a `/spec` | Change a throwaway copy | Checks the diff and opens a **draft** pull request |
| Reviewer | A pull request opens or changes | List findings against `docs/review-rules.md` on main | Posts one plain "AI review" comment |
| Fixer | Checks fail on a builder's pull request | Classify failures, and repair real bugs | Pushes a repair that weakens no test; stops after 3 |
| Watchdog | Every hour | (no AI) | Updates the "AI team health" issue and pings an outside heartbeat |

Every AI step has read-only permissions, no web access and, except for running the tests, no shell. People press go, mark ready and merge. One switch, `AI_TEAM_MODE`, turns the whole team `off`, to `shadow` (report only) or `on`; anything unexpected is off.

## What is in `files/`

Copy the contents of `files/` into the root of your repository:

```text
.github/ai-team/        the harness: plain Node scripts, zero dependencies, plus config.json and the form schemas
.github/workflows/ai-*  the five agents and the self-test
docs/ai-team.md         the job cards: who may do what, and what enforces it
docs/review-rules.md    the reviewer's rules (edit these for your app)
```

It expects:

- tests that run with `npm --prefix web test`, and a workflow named `ci` that runs them on pull requests (edit `config.json` and the prompts if yours differ);
- the paths the builder may change: `web/src/**`, `web/test/**`, `supabase/migrations/**` (edit `config.json`).

## Setting it up

Follow Book 3, Chapter 26, Step 2, one step at a time. In short, in a **rehearsal** repository first:

1. Create an API key in a separate AI-provider workspace with its own spend limit. Add it as the secret `ANTHROPIC_API_KEY`.
2. Create your team's own GitHub App (Contents, Issues and Pull requests: read and write; nothing else; no webhook) and install it on that one repository. Add its client ID as the variable `AI_TEAM_APP_CLIENT_ID`, its slug as the variable `AI_TEAM_APP_SLUG`, and a private key as the secret `AI_TEAM_APP_PRIVATE_KEY`.
3. Create the variable `AI_TEAM_MODE` with the value `off`.
4. For the watchdog, create a heartbeat check in an uptime service with a **period of 1 hour and a grace time of 1 hour**, and add its URL as the secret `WATCHDOG_HEARTBEAT_URL`. Check both numbers after saving: some services give a new check a period of 1 day, which would delay the alert by a day.

Why a separate app and not the job's own token: GitHub does not start other workflows (your checks, the reviewer) for changes made with the job's own token, so the builder's pull requests would never be checked.

## Checking it

```text
node .github/ai-team/selftest.mjs
```

This tests every part that is not AI: the switch, every form check, the proposal check, the weakened-test check, the go button, the fixer's counter, the reviewer's filter, the watchdog's verdicts, the secret scrubbing, that a planted git setting in the agent's copy cannot run a command, that no harness script can approve, merge or push to main, and the walls in every workflow file. The AI steps themselves can only be checked by running them, in a rehearsal repository, as the book describes.

## Status

- The harness and its self-test run here.
- The workflows pass actionlint and the kit's workflow check.
- **Rehearsed live, end to end, on 25–26 September 2026**, in a private practice repository with a real AI key. It ran with the walls above, and each wall was shown to hold:
  - the switch: a misspelt or deleted value read as `off`; with the switch `off`, no AI step ran;
  - triage: three planted attacks were each flagged `needs-human`, with nothing posted; in `on` mode it labelled issues as the team's app;
  - the builder: it refused without a `/spec`; it refused a stale base; a migration was tiered high; a workflow edit was blocked; in `on` mode it opened a draft pull request that a person merged;
  - the reviewer: a pull request that rewrote the rules still got findings from main's rules; it never approved;
  - the fixer: it repaired a planted bug in one attempt, with the counter label added first and no test changed;
  - the watchdog: it reported every run and the day's cost; with its workflow disabled, the outside heartbeat emailed the owner;
  - the whole relay: one issue went through to a merged pull request, with a person pressing go, ready and merge.
- **Unverified — not yet seen live:**
  - the fixer's stop after 3 attempts (covered by the self-test);
  - the fixer's `wrong_test` / `unclear_spec` classification;
  - issues opened by an account with no access to the repository;
  - a deploy.
