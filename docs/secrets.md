# Keeping secrets out of this repository

Three checks, at three moments. Each catches what the one before it missed.

| When | What runs | Covers |
|---|---|---|
| Before a commit is made | `.githooks/pre-commit` → `gitleaks git --staged` | What you are about to commit |
| On every pull request | `.github/workflows/ci.yml`, "Secret scan" → `gitleaks git` | The whole history |
| On demand, no install needed | `node scripts/scan-history.mjs` | The whole history, every branch |
| On a push to GitHub | GitHub push protection | Known provider key formats |

The pre-commit hook is the one that matters most. Once a secret is committed, deleting it later does
not un-leak it — anyone who cloned in between still has it, and so does every fork and cache. **The
only real fix for a leaked key is to rotate it.** Stopping it before the commit avoids all of that.

## Turn the hook on

Once per clone:

```
git config core.hooksPath .githooks
```

It is not automatic, because git will not run hooks from a cloned repository without being told to —
which is a feature, not an oversight: a repository that could run code on clone would be a hazard.

The hook **fails closed**: if gitleaks is not installed, it refuses the commit rather than passing
silently. A check that quietly does nothing is worse than no check, because it buys false confidence.

## Installing gitleaks

Not an npm package, so it does not go in `package.json`. Download the release binary and verify its
checksum, the same way CI does — `.github/workflows/ci.yml` pins both the version and the SHA-256 of
the Linux tarball.

Facts to weigh before installing it, as rule 17 asks:

- **Source**: https://github.com/gitleaks/gitleaks — MIT licence, ~29,500 stars, last pushed
  2026-09-23, not archived.
- **Maintainer**: the `gitleaks` organisation. The README says the author is *"shifting my focus to
  Betterleaks"* and that gitleaks is now **feature complete, with only security patches planned**.
  That is worth knowing: a stable tool, not an abandoned one, but not one that will grow either.
- **Weekly downloads**: not applicable — it is a GitHub release binary, not a registry package. The
  comparable number is the release download count on the project's releases page.
- **Version in use**: CI pins `8.30.1` with its SHA-256. Pin the same one locally.

Note that `protect` and `detect` were **deprecated in v8.19.0**. The current scanning modes are
`git`, `dir` and `stdin`, which is why the hook uses `gitleaks git --staged`.

## GitHub push protection

**Already on.** Checked on 2026-09-29:

```
$ gh api repos/build-once/team-tasks --jq ".private, .security_and_analysis"
false
{"dependabot_security_updates":{"status":"enabled"},
 "secret_scanning":{"status":"enabled"},
 "secret_scanning_non_provider_patterns":{"status":"disabled"},
 "secret_scanning_push_protection":{"status":"enabled"},
 "secret_scanning_validity_checks":{"status":"disabled"}}
```

To see or change it in the browser: **Settings → Code security** (older layouts say "Code security
and analysis") → **Secret scanning**, and the **Push protection** switch beneath it.

Two related settings are still **off**, and both are worth a decision:

- **Non-provider patterns** — catches generic things like a private key block or a connection string,
  not only known vendor formats. More findings, more false positives.
- **Validity checks** — asks the provider whether a found token is still live, which tells you
  whether a leak is urgent.

This repository is **public** (`"private": false`), which is why these are available at no cost.
Being public also raises the stakes: a key pushed here is visible to everyone immediately, and
scrapers watch new public commits for exactly that.

## Where secrets are allowed to live

- **Environment variables**, from a git-ignored `.env` file locally, or the host's secret store.
- **Supabase Edge Functions secrets**, for anything the server needs at run time.
- **GitHub Actions secrets**, for deploy credentials. Exactly one exists: `SUPABASE_DB_URL`.

Never in a committed file, never in a commit message, never in an issue or pull request, never in
chat. `.env.example` holds names with empty values and nothing else. See `docs/environments.md`.

## If a real key is ever found

In this order, and do not skip the first step:

1. **Rotate it first.** Create the replacement, put it where it belongs, and revoke the old one.
   Cleaning the history first just delays the fix while the key is still live.
   - **Supabase service-role or publishable key** — Supabase dashboard → the project → Settings →
     API Keys. Update it in Supabase Edge Functions secrets, and in `web/.env.local` if it is the
     publishable one. Production keys never come to this machine.
   - **`SUPABASE_DB_URL`** — change the database password in the Supabase dashboard, rebuild the
     Session pooler connection string, and update it in GitHub → Settings → Secrets and variables →
     Actions. Nowhere else holds it.
   - **A GitHub token** — GitHub → Settings → Developer settings → revoke, then reissue with the
     smallest scope that works.
   - **An email or payment key** — that provider's dashboard. None exists yet.
2. **Work out the exposure.** How long was it live, was the repository public at the time, and does
   the provider offer usage logs for the period?
3. **Then, and only then, consider the history.** Rewriting it with `git filter-repo` changes every
   commit id and breaks every clone, so it is a separate, agreed piece of work — and it does nothing
   for a key that has already been copied.
4. **Write it down** in `evidence/`, with what leaked, when, and what was rotated.
