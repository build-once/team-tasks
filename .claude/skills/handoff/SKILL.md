---
name: handoff
description: Ends a work session cleanly by generating redacted handoff notes with node scripts/handoff.mjs, reviewing every line, and committing them, and starts the next session by reading those notes and checking them against the real state of the project. Use when the user says "wrap up", "end of session", "I'm stopping for today", "write a handoff", "where did we leave off?" or "pick up from last time".
license: Apache-2.0
---

# Handoff

The assistant forgets everything between sessions. The handoff notes are its memory, so they must be accurate, reviewed, and free of secrets.

## When to use
- At the end of any working session.
- At the start of a session that continues earlier work.
- When handing a task to another person or another assistant.

## Always / Ask first / Never
### Always
- At the end, run `node scripts/handoff.mjs`, then read the notes in full before committing them.
- Make sure the notes cover: what was done (with evidence), what is half-done, what comes next, open questions, and branch and pull request names.
- At the start, read the newest notes, then check them against reality: files, branches and pull requests.
- Commit the notes on a branch, like any other change (see safe-change).

### Ask first
- Before committing notes that mention customers or live incidents.
- Before deleting older notes.

### Never
- Never put secrets, keys, passwords, tokens or personal data in the notes. The script redacts, but redaction can miss things.
- Never trust the notes over the project itself. If the notes say "merged", check.
- Never skip the review because "the script already redacted it".

## Steps
**Ending a session**
1. Run `git status` and note any uncommitted work.
2. Run `node scripts/handoff.mjs`. Note where it wrote the file, and the exit code.
3. Open the file and read every line. Look for anything like a key, a password, an email address, a token, or a web address with a login in it.
4. Add what matters most: the very next step, and anything blocking it.
5. Commit the notes on a branch and open a pull request as usual.

**Starting a session**
1. Read the newest notes.
2. Check what they claim: run `git status`, then `git log --oneline -5`, then `gh pr list`.
3. Tell the user: "Picking up from notes dated X. Confirmed: ... Different from the notes: ..."

## Evidence to show
- The `handoff.mjs` output and exit code, and the path of the notes.
- A line confirming the review: "Read all N lines; no secrets found."
- The commit or pull request link.
- At the start of a session: which claims were checked, and what matched.

## Red flags
- "I'll remember where we were."
- "The script redacts, so I didn't read it."
- "The notes say it's merged, so it's merged."
- Notes containing anything that looks like a key or password.
- "I left the notes uncommitted."

## Course lessons
- Book 2 Lesson L26: ending a session well.
- Book 3 Ch 25: handoffs between sessions and people.
