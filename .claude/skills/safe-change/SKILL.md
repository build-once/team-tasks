---
name: safe-change
description: The everyday flow for changing code without breaking the live app. Save your work, make a branch, make one small change, open a pull request with evidence, wait for the checks to pass, then merge. Use when starting any fix or feature, or when the user says "commit this", "ship it", "make a PR", "merge it" or asks to put a change straight onto the main branch.
license: Apache-2.0
---

# Safe change

The main branch is what your users get. Every change travels the same short road to get there, so that a mistake is caught on the way rather than in front of users.

## When to use
- At the start of any edit, fix or new feature.
- Before any commit, upload of a branch, or merge.
- Whenever someone suggests skipping the branch and changing main directly "just this once".

## Always / Ask first / Never
### Always
- Check where you are first with `git status`.
- Make a new branch for each change, named after the change.
- Keep the change small: one idea per pull request.
- Run one command at a time, and read its result before running the next.
- Put evidence in the pull request description (see the prove-it skill).

### Ask first
- Before merging.
- Before deleting a branch that is not yet merged.
- Before anything that rewrites history.

### Never
- Never commit directly on main, or send commits straight to it.
- Never force the remote to accept your history (a "force push").
- Never join several commands into one line. If one fails, the failure hides behind the others.
- Never merge while checks are red or still running.
- Never slip unrelated changes into the same pull request.

## Steps
1. **Look.** Run `git status`. If there is work you did not expect, stop and ask the user about it.
2. **Start from a fresh main.** Run `git switch main`, then `git pull`.
3. **Branch.** Run `git switch -c fix/short-description` (use `feat/`, `fix/`, `docs/` or `chore/`).
4. **Change.** Make the small change. Run the app or the tests on your machine.
5. **Stage only what you mean.** Run `git add path/to/file` for each file, then `git status` again to check.
6. **Commit.** Run `git commit -m "fix: short description"`.
7. **Upload the branch.** Run `git push -u origin fix/short-description`.
8. **Open a pull request.** Use `gh pr create` or the website. Say what changed, why, and how you checked it, with the pasted output.
9. **Wait for the checks.** Run `gh pr checks`. If one is red, read the failure, fix it on the same branch, and upload again.
10. **Merge** only when the checks are green and the change has been read. Then run `git switch main`, `git pull`, and `git branch -d fix/short-description`.

## Evidence to show
- `git status` output showing the branch name before the first edit.
- The pull request link.
- The list of checks, all passed.
- The test or build output pasted into the pull request.

## Red flags
- "I put it straight on main, it was tiny."
- "I'll open the pull request later."
- "The checks are still running, but it's fine to merge."
- "While I was there, I tidied up a few other files."
- "I forced the history through to tidy it up."
- One long command joined with `&&` that does five things.

## Course lessons
- Book 1 Ch 4, Lessons L21 to L24: branches, pull requests, checks and merging.
