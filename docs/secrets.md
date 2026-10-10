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
- **`~/.config/team-tasks/staging.env`**, outside this repository, for the **staging test accounts'
  passwords** (Alice, Bob, Carol). Written by hand by the owner, loaded into the shell for one run, and
  read by the staging scripts as environment variables — never committed, never printed, never pasted
  into chat. The names each script expects, and how to load the file, are in `docs/environments.md`
  → *Where the test accounts' passwords live*. These are staging accounts with fake data, but a
  password is a password: it goes nowhere near the repository.
- **Supabase Edge Functions secrets**, for anything the server needs at run time. Set by the owner,
  **per project** — staging's values are not production's. Names only below; no values live in this
  repository. The full table, with what each is for, is in `docs/environments.md`:
  - `EMAIL_API_KEY` — the Resend API key. **Each project has its own**, with sending access limited to
    `notify.raj-dhonota.com`, so a leaked staging key cannot send as production. Anyone holding it
    could send email as this app.
  - `EMAIL_FROM` — the address invitations are sent from.
  - `APP_URL` — the site's own address, used to build the invitation link. Read **only** from this
    setting, never from a request header.
  - `EMAIL_TEST_INBOX` — **staging only**, set to the Gmail test mailbox
    `teamtasks.staging.test@gmail.com`. Redirects every invitation email away from real people, and
    overrides `EMAIL_DELIVERY`. Not a secret — an address, written down in `docs/environments.md`.
  - `EMAIL_DELIVERY` — **production only**, exactly `live`. The only value that permits sending to a
    real recipient.

  `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` are also there, but nobody sets them: Supabase
  pre-populates both, and `withSupabase` reads them. The secret key bypasses every row-level security
  rule, which is why no function ever writes it into a file or a log.
- **GitHub Actions secrets**, for credentials CI uses. **Eight exist, plus three plain variables**, all
  in the **`supabase-production` environment** — **Settings → Environments → supabase-production**, with
  deployment branches limited to `main`, and not in the repository's Actions secrets.

  **This bullet said "Three exist, all used only by `migrate-production.yml`" until 2026-10-10**, and the
  nightly copy of production ([#258](https://github.com/build-once/team-tasks/issues/258)) is what made
  that wrong: it added five more settings and a second workflow that reads them. The count and the list
  below are the fix for the first half of
  [#255](https://github.com/build-once/team-tasks/issues/255); the section **"Every setting production
  needs"** at the end of this file is the fix for its second and worse half, which is that nothing
  anywhere listed what production needs in order to be stood up again.

  **One sentence this file and `docs/architecture.md` both used to lean on is now true only on a careful
  reading**: that GitHub Actions secrets hold "deploy credentials and nothing else". A backup passphrase
  is not a deploy credential and it is not a run-time app key either. What is still true, and is the thing
  that sentence was protecting, is that **no key the running app uses is here**: the service-role key, the
  Resend key and the Anthropic key live only in Supabase's own function settings. The right reading is
  "credentials CI uses, never a run-time app key", and that is how it is written above.

  **Why an environment and not repository secrets.** A repository secret is readable by a workflow
  running on *any* branch, and a workflow file is just a file in the branch — so anyone who can push a
  branch can push a job that reads production's credentials and prints or sends them somewhere. An
  environment with its branch list set to `main` cannot be reached from a branch at all: a job that
  names it only gets the secrets when the run is on `main`. That matters more now than it did, because
  an automated actor that can push branches is coming (level 2).

  All three jobs in `migrate-production.yml` carry `environment: supabase-production` for this reason.
  That workflow only triggers on a push to `main`, so the environment is a second lock on the same door
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
    kept secret to keep the production project id out of the repository. Used by `deploy-functions`
    and by `smoke-test`, which builds the function URLs from it — and, since 2026-10-10, by the nightly
    copy, which builds the Storage endpoint from it.

  **And five added on 2026-10-10 for the nightly copy** (`docs/plan.md` → "A nightly copy of production,
  held by another company"), read only by `.github/workflows/backup-production.yml`:

  - `PRODUCTION_SUPABASE_S3_ACCESS_KEY_ID` and `PRODUCTION_SUPABASE_S3_SECRET_ACCESS_KEY` — a Supabase
    **S3 access key** for the production project, which is how the job reads the bytes of every attached
    file. **Know what it reaches**: Supabase's own words are that such keys "provide full access to all
    S3 operations across all buckets and bypass RLS policies"
    ([S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication), read 2026-10-10).
    The owner accepted that cost on 2026-10-10 **rather than using the service-role key**, for one
    reason: this one cannot write to `tasks`, and a backup credential should not be able to change the
    thing it is backing up.
  - `BACKUP_STORAGE_KEY` and `BACKUP_STORAGE_SECRET` — the Cloudflare R2 API token
    (`team-tasks-backup-job`, **Object Read & Write**, limited to the `team-tasks-backups` bucket) that
    the copy is written with. **Holding both gets you the encrypted files and nothing readable.**
  - `BACKUP_PASSPHRASE` — what each copy is encrypted with, on the runner, before it leaves.
    **THIS IS THE ONE VALUE IN THIS PROJECT THAT CANNOT BE RE-ISSUED.** A GitHub secret cannot be read
    back once set, so the **owner's password manager holds the only readable copy in existence**. If it
    is lost, every copy in that bucket becomes bytes — not openable by the owner, by Cloudflare, or by
    anybody, with no reset and no support request that helps. It is therefore the most valuable string
    here, ahead of the service-role key, because a leaked key can be rotated and a lost passphrase
    cannot be recovered. `docs/backups.md` → "The one thing that cannot be recovered" is the argument in
    full.

  **The same environment also holds three plain variables, not secrets**, under *Environment variables*:

  - `PRODUCTION_SITE_URL` — the production home page address that the `smoke-test` job fetches expecting
    200.
  - `BACKUP_STORAGE_ENDPOINT` — the R2 S3 endpoint, of the shape
    `https://<cloudflare account id>.r2.cloudflarestorage.com`. A variable because an endpoint is not a
    credential, and **not in this repository** because the value embeds the Cloudflare account id and
    this repository is public (the owner's decision of 2026-10-10).
  - `PRODUCTION_SUPABASE_S3_REGION` — the production project's region, which S3 request signing needs.
    Supabase's page says to use "the region value displayed on the S3 configuration page", so it cannot
    be guessed or derived, and the job stops naming this variable rather than signing with a region it
    made up.

  None of the three grants anything, so none is in the list above. **All three are still never printed:**
  GitHub masks secrets in run logs but **not** variables, and this repository's run logs are public. See
  `docs/environments.md` → *One environment variable, which is not a secret*.

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
    **The one credential in a level-2 run that outlives the run.** `APP_PRIVATE_KEY` is never used
    directly by Claude — it mints an installation token that `create-github-app-token` revokes when
    the job ends. This one is long-lived and sits in the job's environment for the whole session, so
    if prompt injection ever got through, this is what would still be held afterwards. Nothing in
    `claude.yml` can shorten its life; **rotating it is the only lever**, and it is the owner's:
    **Settings → Environments → claude**.

  **A known limitation of the guard on pull requests, recorded here because this is where someone
  reads about level 2.** The guard runs inside the Action, and since #66 both its script and the
  rules it enforces come from the *base* branch, because both live under `.claude/` — which is
  what #66 fixed, by moving `guard/` to `.claude/guard/`. **`AGENTS.md` and `docs/plan.md` are
  still the branch's**, so the habit survives for those two: **do not write `@claude` on a pull
  request whose branch changes `AGENTS.md` or `docs/plan.md`.** The full explanation, with the
  evidence, is in the header of `.github/workflows/claude.yml` and in #66.

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

## Every setting production needs, and where each one comes from again

Added 2026-10-10 for [#255](https://github.com/build-once/team-tasks/issues/255), whose second and
older complaint was that **nothing in this repository listed which secrets production needs at all.**
`docs/backups.md`'s map puts it in one sentence: "**What is missing is not a copy but a list** — nothing
in this repository enumerates which secrets production needs, so 'set them again' rests on somebody
remembering."

**Why a list and not a backup.** Secrets are deliberately **not** in the nightly copy, and that is
correct: a backup of a secret is another copy of a secret. The consequence is that standing production
up again needs a list of **names and sources** — which is free, carries no value, and did not exist.
This is it.

**NAMES AND SOURCES ONLY. No value of any kind is in this table, or anywhere in this repository**
(rule 7). Nineteen settings, counted here by reading the four groups below.

### Supabase → the production project → Edge Functions secrets

Five, and the app cannot send an invitation without the first three.

| Name | Where it comes from again | If it is lost |
|---|---|---|
| `EMAIL_API_KEY` | Resend → API Keys → a new key with sending limited to `notify.raj-dhonota.com` | Re-issue, then revoke the old one |
| `EMAIL_FROM` | A decision, not a credential: the address invitations come from | Re-type it |
| `APP_URL` | The production site's own `https` address | Re-type it |
| `EMAIL_DELIVERY` | Exactly `live`, and nothing else is accepted | Re-type it |
| `AI_API_KEY` | Anthropic Console → the **Team Tasks** workspace. **Production has none on purpose** until `docs/plan.md`'s three preconditions are met | Re-issue |

`SUPABASE_URL` and `SUPABASE_SECRET_KEYS` are in that settings page too and **nobody sets them**:
Supabase pre-populates both. The secret key is re-issued from the project's own API Keys page if it ever
has to be, which also invalidates the old one everywhere.

### GitHub → Settings → Environments → `supabase-production`

Eight secrets and three variables, listed with what each reaches in "Where secrets are allowed to live"
above. Where each comes from again:

| Name | Where it comes from again |
|---|---|
| `PRODUCTION_SUPABASE_DB_URL` | Supabase → the project → Settings → Database → the **Session pooler** string, password percent-encoded |
| `PRODUCTION_SUPABASE_ACCESS_TOKEN` | Supabase account → Access Tokens → a **scoped** token, production project, **Edge Functions Read-write** only. See "Rotating the access token" below |
| `PRODUCTION_SUPABASE_PROJECT_REF` | The project's own reference, from its dashboard URL |
| `PRODUCTION_SUPABASE_S3_ACCESS_KEY_ID` | Supabase → the project → Storage → S3 configuration → a new access key |
| `PRODUCTION_SUPABASE_S3_SECRET_ACCESS_KEY` | Shown once, when that key is created. Not readable afterwards — make a new key instead |
| `BACKUP_STORAGE_KEY` | Cloudflare → R2 → API tokens → a new **Object Read & Write** token for `team-tasks-backups` |
| `BACKUP_STORAGE_SECRET` | Shown once, when that token is created |
| **`BACKUP_PASSPHRASE`** | **NOWHERE. IT CANNOT BE RE-ISSUED.** The owner's password manager holds the only readable copy; a GitHub secret cannot be read back. Generating a new one does not open the old copies — it only means tonight's copy can be opened and the fortnight of copies before it cannot. **If it is lost, say so immediately and treat every existing copy as gone** |
| `PRODUCTION_SITE_URL` *(variable)* | The production home page address |
| `BACKUP_STORAGE_ENDPOINT` *(variable)* | Cloudflare → R2 → the bucket's S3 API address, `https://<account id>.r2.cloudflarestorage.com` |
| `PRODUCTION_SUPABASE_S3_REGION` *(variable)* | Supabase → the project → Storage → S3 configuration, the region shown there |

### GitHub → Settings → Environments → `claude`

Three, for level 2, listed in full above: `APP_ID` (a variable), `APP_PRIVATE_KEY` and
`CLAUDE_CODE_OAUTH_TOKEN`. All three are re-issuable — the first two from the `team-tasks-claude` GitHub
app's settings, the third from Claude.

### Vercel → the team-tasks project

Two, both **public** values and neither a secret: `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, scoped to Production, plus `NEXT_PUBLIC_SENTRY_DSN` when error
reporting is installed. All from the project they point at. `docs/environments.md` → "Every setting the
app uses" is the table.

### What is NOT on this list, and is not missing

**Everything set in a dashboard rather than in a settings page**: Auth redirect URLs and Site URL, the
email templates, the Spend Cap, the organisation. `docs/backups.md` carries that as **not confirmed** —
nobody has walked production's settings pages against this repository — and `docs/restore-runbook.md`
step 7 says a restore drill is the moment to find out and write it down.

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
   - **`PRODUCTION_SUPABASE_S3_ACCESS_KEY_ID` / `..._SECRET_ACCESS_KEY`** — Supabase → the project →
     Storage → S3 configuration → make a new access key, put both halves in the
     **supabase-production** environment, then revoke the old one. **Treat a leak of this as a leak of
     every attached file**: the key reads all buckets and bypasses row-level security.
   - **`BACKUP_STORAGE_KEY` / `BACKUP_STORAGE_SECRET`** — Cloudflare → R2 → API tokens → a new
     **Object Read & Write** token for `team-tasks-backups`, then revoke the old one. Whoever held the
     old pair could **download every copy**, which is only as bad as the passphrase is safe — and a
     13-day Bucket Lock, if the owner takes it (`docs/plan.md`), is what stops them destroying one.
   - **`BACKUP_PASSPHRASE`** — **this one cannot be rotated in the ordinary sense, and that is the
     whole point of it.** Setting a new one means tonight's copy uses it and **every copy already in the
     bucket still needs the old one**. So if the passphrase leaks: set a new one, keep the old one safe
     in the password manager until the last copy encrypted with it has expired (about a fortnight), and
     treat everything in that bucket as readable by whoever has the leaked value for as long as they
     also hold a storage key. Rotating the **storage** key is therefore the faster half of the fix.
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
