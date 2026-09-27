---
name: secrets-check
description: Finds passwords, API keys and tokens that have leaked into your code, your git history or the built app that ships to browsers, and explains what to do when one turns up. Use when the user says "check for secrets", "did I leak my API key?", "is my .env file safe?", "can I put this key in the frontend?", before making a repository public, or before a launch.
license: Apache-2.0
---

# Secrets check

A secret is anything that lets the holder act as you or spend your money. Once a secret has been seen, you have to assume it has been copied.

## When to use
- Before making a repository public, and before any launch.
- When a key, password or token has been pasted somewhere it should not be.
- When deciding whether a key can live in frontend (browser) code.

## Always / Ask first / Never
### Always
- Know the difference between the two kinds of key:
  - **Public keys** (often called publishable or anon keys) are designed to be seen by anyone. They only work within rules you set on the server, such as row-level security. They can go in frontend code.
  - **Secret keys** (service, admin or secret keys, payment secret keys, AI API keys) can do anything your account can do. They live only on a server or in a secrets manager.
- Search three places: the current files, the git history, and the built bundle.
- Treat an exposed secret as stolen: rotate it.
- Keep `.env` in `.gitignore`, and commit a `.env.example` with placeholder values.

### Ask first
- Before rewriting git history, because it affects everyone with a copy.
- Before revoking a key the live app depends on. Plan the swap so the app is not left without one.

### Never
- Never paste a real secret into chat, an issue, a commit message or handoff notes.
- Never believe that deleting the line fixes it. Copies exist in history, in forks and in caches.
- Never put a secret key in frontend code, or in an environment variable whose name marks it for the browser (for example names starting `NEXT_PUBLIC_` or `VITE_`).

## Steps
1. **Check `.env` is ignored.** Run `git check-ignore -v .env`. Exit code 0 means it is ignored.
2. **Search the current files.** Run `git grep -n -I -E "sk_live|sk-[A-Za-z0-9]{20}|secret_key|BEGIN [A-Z ]*PRIVATE KEY"`. Positive control: run `git grep -c function` and confirm it finds hits, so you know the search is looking at real files.
3. **Search the history.** Run `git log -p --all -G "sk_live|BEGIN [A-Z ]*PRIVATE KEY"`. Old commits count even if the file has since changed.
4. **Search the built bundle.** Build the app (for example `npm run build`), then run `grep -rn -E "sk_live|service_role" dist/`, using your real output folder. Positive control: search the same folder for your app's title and confirm it is found.
5. **If you find a secret, rotate it.** Create a new key in the provider's dashboard, update it wherever the app reads it, deploy, then revoke the old key. Check the provider's usage logs for activity you do not recognise.
6. **Then tidy the code.** Move the value into an environment variable or secrets manager. Cleaning history is optional and needs agreement first. Rotation is the real fix.
7. Consider a pre-commit secret scanner, vetted with the vet-a-tool skill.

## Evidence to show
- The output of each search, with its positive control.
- Findings as file and line, with the value masked (show at most the first 4 characters).
- A rotation record: date, which key, where the new one was set, old key revoked (yes or no).

## Red flags
- "I deleted the key from the file, so we're safe."
- "It's only in an old commit."
- "It's a private repo, so it doesn't matter."
- "No secrets found", without saying which files and folders were searched.
- "The secret key is in the frontend, but it's hidden in an environment variable."

## Course lessons
- Book 1 Ch 11: secrets, public and secret keys, rotation.
- Book 1 Ch 1, Lesson A11: keeping keys out of code from day one.
