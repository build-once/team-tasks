# Launch check

**Course link:** *Building Real Apps with AI*, Book 1 Lesson G16 ("Run the launch checklist and prove every item"). Each item in `checklist/launch.json` carries a `lesson` field naming the lesson that teaches it (for example "Book 1 A19"), and the results table shows it.

## What it is

Before you put an app in front of real users, a few dozen things need to be true: secrets are not in your code, backups can actually be restored, an alert really reaches your phone, and so on. `scripts/launch-check.mjs` goes through that list and tells you where you stand.

It only reads. It never changes your project, never uploads anything, and never prints a secret (only the file and line number where it saw something that looks like one).

## How to run it

From your project folder:

```
node scripts/launch-check.mjs
```

You need Node 20 or newer. Nothing to install.

Useful options:

| Option | What it does |
|---|---|
| `--root <folder>` | Check a different folder. |
| `--json` | Machine-readable output (includes every item's title). |
| `--strict` | Also fail when anything is UNVERIFIED or TODO. Use this on launch day. |
| `--no-gh` | Skip the optional GitHub checks. |
| `--selftest` | Prove the checker itself works (see below). |

## Reading the results

| Status | Meaning | What to do |
|---|---|---|
| **PASS** | Checked, and it is fine. | Nothing. |
| **FAIL** | Checked, and it is not fine. | Fix it. The DETAIL column says what and where. |
| **UNVERIFIED** | The check *could not run*: a tool was missing, you are on a plan that hides the setting, or there was nothing to look at. | Treat this as "unknown", **never** as a pass. Check it another way, or record evidence. |
| **TODO** | This item needs proof from you, and the proof file is missing or unfilled. | Follow `evidence/README.md`. |

The exit code is 1 if anything FAILs (and, with `--strict`, if anything is UNVERIFIED or TODO), so you can use it in CI.

### Why UNVERIFIED matters

A check that could not run looks a lot like a check that passed: no errors, no red text. That is how problems slip through. So this tool never turns "I couldn't look" into PASS. Examples:

- The guard self-test (`guard/selftest.mjs`) is missing: **UNVERIFIED**, not PASS.
- The secret scan found zero files to read: **UNVERIFIED**, because an empty scan proves nothing.
- GitHub refused to show branch protection because of your plan (an HTTP 403): **UNVERIFIED - plan/permission**. It is never reported as PASS or FAIL.

## What it checks automatically

About a third of the items are checked by the script. The rest need your evidence.

- Architecture and environments are written down (`docs/architecture.md`, `docs/environments.md`).
- `.gitignore` covers `.env` and `.env.*`, and no `.env` file is tracked in git.
- No secret-looking strings in tracked files (private keys, live payment keys, cloud keys, service-role tokens, passwords in connection strings, and so on). It reports file and line only.
- CI has a `required` job that runs with `if: always()` **and** checks the other jobs' results, so it cannot go green when a job fails.
- Every workflow sets `permissions:` and every job sets `timeout-minutes`.
- Dependabot is configured; a lockfile is committed.
- The AI-assistant guard is installed, registered as a PreToolUse hook, and its self-test passes.
- A migrations folder exists if you use a database.
- `HANDOFF.md` exists (see `docs/handoff.md`).
- With the GitHub `gh` tool installed and logged in: the repo is private, `main` is protected, and the latest CI run on `main` is green. These are read-only queries.

## Proving the checker works

```
node scripts/launch-check.mjs --selftest
```

This builds a "good" and a "bad" practice project in a temporary folder, runs every check on both, and confirms each one gives the expected answer, including that checks which cannot run say UNVERIFIED. It prints `PASS` with the number of assertions, or lists what went wrong and exits with an error.

## Related lessons

- Book 1 Chapter 30 - the launch checklist this tool is built from.
- `docs/vetting.md` - checking third-party tools before you install them.
- `docs/handoff.md` - the handoff file this checklist asks for.
