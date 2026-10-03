# Build Once

**Safety nets for apps you build with an AI coding assistant.**

Build Once is a free starter project (Apache-2.0). You copy it, build your app inside it, and it quietly stops the most common expensive mistakes people make when an AI assistant such as Claude Code is writing the code: deleting the wrong thing, pushing straight to the live site, leaking a password into git, or saying "done" when nothing was actually checked.

It goes with the course **Building Real Apps with AI** (coming soon), but you can use it on its own.

> **What it does not do.** This kit blocks the most common mistakes. It does **not** make your app secure, and it does not replace a person reading the changes. Think of it like a seatbelt and a smoke alarm: it makes the usual accidents far less likely and much easier to spot. It cannot stop every accident.

---

## What’s inside

| Part | What it does for you | Where it lives |
|---|---|---|
| **Project template** | A tidy starting layout, a secrets-safe `.gitignore`, an `.env.example`, and plain-English guides to how a real app fits together. | this repo, `docs/architecture.md`, `docs/environments.md` |
| **Guards** | Small checks that run *before* the AI assistant runs a command or edits a file, and block the dangerous ones (for example, touching production, or editing the guards themselves). | `.claude/hooks/`, `.claude/guard/`, `docs/guards.md` |
| **CI (automatic checks)** | Every pull request is checked by GitHub: the guards still work, the skills are valid, no secrets are in the history, and every workflow is locked down. One check, `required`, sums it all up. | `.github/workflows/ci.yml` |
| **Prove-it skills** | Instructions for the AI assistant that make it show real evidence (exact output and exit codes) before it says anything is finished. | `.claude/skills/`, `docs/skills.md` |
| **Launch check** | A checklist you run before real people use your app, which asks for evidence for each item instead of a tick. | `scripts/launch-check.mjs`, `docs/launch-check.md` |
| **Vetting** | A way to check an add-on tool or MCP server before you let the AI assistant use it. | `scripts/vet-tool.mjs`, `docs/vetting.md` |
| **Handoff** | A short summary of where things stand, so the next session (or the next person) starts from facts, not memory. | `scripts/handoff.mjs`, `docs/handoff.md` |

Rules for the AI assistant itself are in [`AGENTS.md`](AGENTS.md) (read by most coding agents) and [`CLAUDE.md`](CLAUDE.md) (read by Claude Code).

---

## Quick start

You need a free GitHub account and Node.js 20 or newer. No other installs.

1. **Use this as a template.** On the GitHub page for this kit, click **Use this template → Create a new repository**. You now have your own copy.
2. **Install Claude Code** (or your preferred AI coding assistant) and open your new repository with it. Follow the official install instructions for your tool.
3. **Prove the guards are armed.** Do not assume they are. Follow [`docs/guards.md`](docs/guards.md): run the self-test (`npm run guard:test`), then ask the assistant to run the probe described there. You must *see* it get blocked. If it is not blocked, or you cannot tell, treat the guards as **off** and stop until you fix it.
4. **Create your staging and production copies.** Two separate projects with separate keys: one to try things (staging), one for real users (production). Step by step in [`docs/environments.md`](docs/environments.md). Protect your `main` branch with [`docs/protect-main.md`](docs/protect-main.md).
5. **Run the launch check** before anyone real uses your app: `npm run launch:check`. See [`docs/launch-check.md`](docs/launch-check.md).

Run every check at once with `npm test`.

---

## How it pairs with the course

| Kit part | Where the course teaches it |
|---|---|
| Project template | Book 1, Chapters 1–6 |
| Guards | Book 1, Chapters 7 and 9 · Book 3, Chapters 3 and 23 |
| CI (automatic checks) | Book 1, Chapter 10 · Book 2, Chapter 7 · Book 3, Chapter 11 |
| Prove-it skills | Book 1, Chapters 8 and 17 |
| Launch check | Book 1, Chapter 30 · Book 2, Chapter 2 |
| Vetting | Book 3, Chapter 3 |
| Handoff | Book 1, Lesson L5 · Book 2, Lesson L26 · Book 3, Chapter 25 |

Course: coming soon. Follow [github.com/build-once](https://github.com/build-once) for news.

---

## Levels

Use as much of the kit as you are ready for. Each level adds to the one before.

### Beginner (Book 1)
- Start from the template and keep `.env` files out of git.
- Prove the guards are armed, and re-check whenever you start a new session.
- Work on a branch, open a pull request, and wait for the `required` check to go green.
- Ask the assistant for the exact output of every check. "Should work" is not an answer.
- Run the launch check before you share the app.

### Intermediate (Book 2)
- Keep a separate staging project with the test accounts Alice, Bob and Carol.
- Read production only by the owner-runs-query pattern (the assistant writes a read-only query; you run it; you paste back the result).
- Make `required` a required check on `main` and test that a direct push is refused.
- Use handoff notes between sessions.

### Advanced (Book 3)
- Add your own guard rules, each with self-test examples.
- Vet every new tool and MCP server before use.
- Pin every GitHub Action to a commit SHA and review Dependabot updates.
- Extend CI with your own checks, always feeding them into `required`.

---

## Licence

Apache License 2.0 — see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). Third-party material policy: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). Report a security problem: [`SECURITY.md`](SECURITY.md). Contribute: [`CONTRIBUTING.md`](CONTRIBUTING.md).
