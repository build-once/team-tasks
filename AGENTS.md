# AGENTS.md — rules for AI coding agents

These rules apply to any AI coding agent working in this repository (Claude Code, Codex and others). Follow them exactly. If a rule stops you from finishing, stop and tell the owner; do not work around it.

1. **Never touch production.** Do not run commands, migrations, deploys or queries against production. To learn something from production, use the **owner-runs-query pattern** (Book 2 A24): write a read-only query, give it to the owner, and wait for them to paste back the result. Never ask for production keys.
2. **Work on a branch, then open a pull request.** Never commit to `main`. Never push to `main`. Never merge your own pull request.
3. **Show evidence before claiming done.** Paste the exact command, its exact output and its exit code. "Should work", "tests pass" or "done" without output is not allowed.
4. **Run one command at a time.** No chaining with `&&`, `;` or `|`. Read each result before running the next.
5. **Never edit guard files.** Do not change, disable, move or work around `.claude/hooks/`, `.claude/settings.json` or `guard/`. If a guard blocks you, stop and tell the owner why. Only a person changes guards. Change `.github/workflows/` only when the owner asks, and never to skip or weaken a check.
6. **Use staging with the test accounts.** Test on staging as **Alice** (owner), **Bob** (outsider — must be refused Alice’s data) and **Carol** (Alice’s team member). Never use real people’s data. See `docs/environments.md`.
7. **Keep secrets out of files and chat.** Never write a key, password or token into any file except an ignored `.env` file, never print one, and never ask the owner to paste one into chat. Only `.env.example` with placeholders is committed.
8. **Say "unverified — reason" when a check could not run.** A check that was blocked, timed out, lacked permission or found zero things to check is **not** a pass. Write `unverified — <reason>` and say how to check it properly.
9. **Stay inside `docs/plan.md`.** Read `docs/plan.md` before starting work in a session, and treat it as the agreed scope. If a request needs something the plan does not list — a new feature, anything from its "deliberately not in the first version" list, a new kind of personal data, a native app, or spending above its budget ceiling — say so **before** writing code: name the part of the plan the request goes past, and ask whether to update the plan or drop the request. Widening the plan is the owner's call. The plan is updated first, then the code.

10. **Local and staging only.** You have access to local and staging only. You never ask for, read, store or use production keys, passwords or database connections. You never link a command-line tool or connector to the production project. Changes reach production only through a pull request that the owner merges. If a task seems to need production, stop and explain why.
11. **Read the Next.js docs that match the installed version.** Before writing Next.js code, read the version-matched docs in `web/node_modules/next/dist/docs/`.

When unsure, stop and ask. Background for people: `README.md`, `docs/architecture.md`, `docs/environments.md`.
