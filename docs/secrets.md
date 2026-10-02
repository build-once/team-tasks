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
- **Supabase Edge Functions secrets**, for anything the server needs at run time. Set by the owner,
  **per project** — staging's values are not production's. Names only below; no values live in this
  repository. The full table, with what each is for, is in `docs/environments.md`:
  - `EMAIL_API_KEY` — the Resend API key. **Each project has its own**, with sending access limited to
    `notify.raj-dhonota.com`, so a leaked staging key cannot send as production. Anyone holding it
    could send email as this app.
  - `EMAIL_FROM` — the address invitations are sent from.
  - `APP_URL` — the site's own address, used to build the invitation link. Read **only** from this
    setting, never from a request header.
  - `EMAIL_TEST_INBOX` — **staging only.** Redirects every invitation email away from real people, and
    overrides `EMAIL_DELIVERY`.
  - `EMAIL_DELIVERY` — **production only**, exactly `live`. The only value that permits sending to a
    real recipient.

  `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` are also there, but nobody sets them: Supabase
  pre-populates both, and `withSupabase` reads them. The secret key bypasses every row-level security
  rule, which is why no function ever writes it into a file or a log.
- **GitHub Actions secrets**, for deploy credentials. Three exist, all used only by
  `.github/workflows/migrate-production.yml`. They live in the **`supabase-production` environment**,
  not in the repository's Actions secrets — **Settings → Environments → supabase-production**, with
  deployment branches limited to `main`.

  **Why an environment and not repository secrets.** A repository secret is readable by a workflow
  running on *any* branch, and a workflow file is just a file in the branch — so anyone who can push a
  branch can push a job that reads production's credentials and prints or sends them somewhere. An
  environment with its branch list set to `main` cannot be reached from a branch at all: a job that
  names it only gets the secrets when the run is on `main`. That matters more now than it did, because
  an automated actor that can push branches is coming (level 2).

  Both jobs in `migrate-production.yml` carry `environment: supabase-production` for this reason. That
  workflow only triggers on a push to `main`, so the environment is a second lock on the same door
  rather than the only one — which is the point: the trigger is one line that a future edit could
  widen, and the branch list is enforced by GitHub regardless of what the file says.

  - `PRODUCTION_SUPABASE_DB_URL` — the production database connection string. Used by the `migrate`
    job only.
  - `PRODUCTION_SUPABASE_ACCESS_TOKEN` — a Supabase **scoped** personal access token, limited to the
    production project with only the **Edge Functions Read-write** permission. Used by the
    `deploy-functions` job only. **Expires on or about 30 December 2026** — see below.
    **As powerful as the connection string, not less.** Deploying a function means deploying code, and
    that code runs with the production secret keys, which bypass row-level security — so this token can
    read and change all production data. An earlier version of this file implied it could not touch the
    database; that was wrong. What the scoping limits: no staging, no other project in the account, no
    account settings, and nothing but Edge Functions through the Management API.
  - `PRODUCTION_SUPABASE_PROJECT_REF` — names the project to deploy to. Not a credential on its own;
    kept secret to keep the production project id out of the repository.

  The sentence above about "an automated actor that can push branches is coming" is no longer about
  the future: that is level 2, and it is the next entry.

- **The `claude` environment**, for level 2 — the workflow that runs Claude Code in GitHub Actions
  when the owner writes `@claude` on an issue or pull request. Used only by
  `.github/workflows/claude.yml`. **Settings → Environments → claude**, deployment branches limited
  to `main`, administrator bypass off. Checked with `gh api` on 2026-10-02: the branch policy is the
  single entry `main`, `can_admins_bypass` is false, and the repository has **no** repository-level
  Actions secrets at all (`total_count` 0).

  Why that matters here more than anywhere else. This environment's secrets let a run act as a
  GitHub app with write access to this repository and spend the owner's Claude subscription. A
  repository secret would be readable from any branch, which means readable by any workflow file
  someone pushes. The `main`-only branch list is what makes that impossible, and it is the reason
  `claude.yml` triggers only on `issue_comment` and `issues`: GitHub's event reference gives both of
  those `GITHUB_REF` = the default branch, whereas `pull_request_review` and
  `pull_request_review_comment` run on `refs/pull/<number>/merge` and so could never reach this
  environment.

  - `APP_ID` — a **variable**, not a secret: the App ID of the `team-tasks-claude` GitHub app
    (5151263), which is public information. Kept in the environment next to the key it goes with
    rather than hardcoded, so there is one place to change if the app is ever replaced.
  - `APP_PRIVATE_KEY` — the private key of that app. **This is the most powerful credential in this
    repository after the production ones.** Anyone holding it can mint tokens with the app's
    permissions — Contents, Issues and Pull requests read-write — so they can push branches and
    rewrite code here. It is a key, so it is never printed and never leaves the environment; the
    workflow passes it straight to `actions/create-github-app-token`, which mints a short-lived
    installation token and revokes it when the job ends.
    **What it deliberately cannot do:** the app has **no Workflows permission**, so no token minted
    from it can change a file in `.github/workflows/`. That is the one thing stopping a level-2 run
    from editing its own cage, and it is a property of the app's settings, not of any file here.
  - `CLAUDE_CODE_OAUTH_TOKEN` — the Claude credential the action authenticates with. Spends the
    owner's subscription, so treat a leak as a billing incident as well as an access one.

  **Not the official Claude app.** Level 2 uses our own app so the permission list is ours. The
  official app (<https://github.com/apps/claude>) requests Workflows read-write among others; the
  action's `docs/security.md` lists that under "Permissions for Future Features". Our app has
  Contents RW, Issues RW, Pull requests RW, Actions R, Metadata R, and nothing else.

  That last sentence is checked, not taken on trust. `gh api apps/team-tasks-claude` returns the
  app's permissions, and on 2026-10-02 it returned exactly
  `{"actions":"read","contents":"write","issues":"write","metadata":"read","pull_requests":"write"}`
  — no `workflows` key. Anyone can re-run that command; it needs no special access, because an app's
  permission list is public. **Run it again after any change to the app**, because nothing in this
  repository can enforce it.

  **Production is not reachable from here.** `claude.yml` never names the `supabase-production`
  environment, so a level-2 run cannot read a production credential. Schema and code still reach
  production only the way rule 10 says: a pull request the owner merges, which then starts
  `migrate-production.yml`.

Never in a committed file, never in a commit message, never in an issue or pull request, never in
chat. `.env.example` holds names with empty values and nothing else. See `docs/environments.md`.

## If a real key is ever found

In this order, and do not skip the first step:

1. **Rotate it first.** Create the replacement, put it where it belongs, and revoke the old one.
   Cleaning the history first just delays the fix while the key is still live.
   - **Supabase service-role or publishable key** — Supabase dashboard → the project → Settings →
     API Keys. Update it in Supabase Edge Functions secrets, and in `web/.env.local` if it is the
     publishable one. Production keys never come to this machine.
   - **`PRODUCTION_SUPABASE_DB_URL`** — change the database password in the Supabase dashboard,
     rebuild the Session pooler connection string, and update it in GitHub → Settings → Environments
     → **supabase-production**. Nowhere else holds it.
   - **`PRODUCTION_SUPABASE_ACCESS_TOKEN`** — see "Rotating the access token" below. Same steps
     whether it leaked or simply expired.
   - **A GitHub token** — GitHub → Settings → Developer settings → revoke, then reissue with the
     smallest scope that works.
   - **`EMAIL_API_KEY` (a Resend key)** — Resend dashboard → API Keys → create a replacement with
     sending access limited to `notify.raj-dhonota.com`, put it in **that one project's** Supabase
     Edge Functions secrets, then revoke the old one. Staging and production hold different keys, so
     check which project leaked and rotate only that one; rotating both is harmless, rotating the
     wrong one leaves the leak live.
   - **A payment key** — that provider's dashboard. None exists yet.
2. **Work out the exposure.** How long was it live, was the repository public at the time, and does
   the provider offer usage logs for the period?
3. **Then, and only then, consider the history.** Rewriting it with `git filter-repo` changes every
   commit id and breaks every clone, so it is a separate, agreed piece of work — and it does nothing
   for a key that has already been copied.
4. **Write it down** in `evidence/`, with what leaked, when, and what was rotated.

## Rotating the access token

`PRODUCTION_SUPABASE_ACCESS_TOKEN` is the only secret here with an **expiry date**, which makes it the
only one that breaks on a calendar rather than because somebody leaked it.

**Created 1 October 2026, with a 90-day expiry, so it lapses on or about 30 December 2026.** That
date is calculated from the creation date and the 90 days, not read from Supabase: **the exact date is
shown in the Supabase access-token list**, which is the only authoritative place. Check it there rather
than trusting the sentence above.

**Rotation is due before then.** Nothing warns you. When it lapses, the next merge to `main` still
applies migrations — `migrate` uses the database connection string and is unaffected — and then fails
at `deploy-functions`, so the database moves forward while the functions do not. That split is worth
knowing in advance, because it looks like a broken deploy rather than an expired token.

To rotate:

1. Supabase dashboard → account **Access Tokens** → create a new token. Make it a **scoped** token:
   the production project only, with the **Edge Functions Read-write** permission and nothing else. A
   classic token would work and is the wrong choice — it carries the full rights of whoever made it.
2. Note the new expiry date from that same list.
3. GitHub → Settings → **Environments** → **supabase-production** → update
   `PRODUCTION_SUPABASE_ACCESS_TOKEN`. **Not** Secrets and variables → Actions: a repository secret of
   that name would be readable from any branch, which is exactly what the environment exists to
   prevent. If one is there from before, it is stale and should be deleted, not updated.
4. **Revoke the old token** in Supabase. Until it is revoked, rotating has added a credential rather
   than replaced one.
5. Update the dates in this file and in `docs/environments.md`, so the next person reads the real ones.
6. Confirm it works by watching the `deploy-functions` job on the next merge to `main`. There is no way
   to test it earlier: the workflow has no `workflow_dispatch` and no `pull_request` trigger, on
   purpose, so a pull request can never deploy to production.
