# Session handoff

**Course link:** *Building Real Apps with AI*, Book 1 Lesson L5 ("Save anything important before the session ends, and check files really exist") and Book 2 Lesson L26. The launch checklist also checks that a handoff file is present.

## Why

An AI assistant does not remember yesterday's session. Neither will you, three weeks from now. A short handoff note stops the next session from redoing work, undoing a decision, or trusting something that was never finished.

## How to use it

At the end of a working session, from your project folder:

```
node scripts/handoff.mjs
```

It writes `HANDOFF.md` with:

- the **branch** you are on,
- the **last commits** (default 10; change with `--commits 20`),
- a **git status summary** (what is staged, modified, untracked),
- the **changed files** (uncommitted, plus everything changed on this branch since it left `main`),
- open **TODO / FIXME** notes in those changed files, with file and line,
- a **Decisions / Next steps** section for **you** to fill in.

Then open `HANDOFF.md` and fill in *Decisions / Next steps*: what you decided and why, what is not done, and the very first thing the next session should do. That section is the most valuable part, and only you can write it. When you run the tool again, it keeps what you wrote there.

At the start of the next session, tell the assistant: "Read HANDOFF.md first."

## Safety

- It **never opens** `.env` files or key files, even if they changed. It just notes that it skipped them.
- It **redacts** anything that looks like a secret (keys, tokens, passwords in connection strings) and every email address before writing, e.g. `[REDACTED:github-token]`, `[REDACTED:email]`.
- It makes no network calls.
- Still, read the file before you commit or share it. Redaction catches common patterns, not all of them.

If git is not installed, or the folder is not a git repository, it still writes the file, marks the missing parts **UNVERIFIED**, and you fill them in by hand.

Options: `--root <folder>`, `--out <file>`, `--stdout` (print instead of writing).

## Proving it works

```
node scripts/handoff.mjs --selftest
```

It checks that every kind of secret it knows about is redacted, and that ordinary text (version numbers, URLs, `sk_test_` mentions, a local database address, a public "anon" token) comes through **unchanged**, so the redaction is not simply wiping everything. It then builds a practice git repository and checks the real output: branch, commits, TODOs, secrets redacted, env file never read, your notes kept. Finally it checks the no-git case writes a partial file marked UNVERIFIED.

## Related

- `docs/launch-check.md`: the launch checklist checks that `HANDOFF.md` exists.
