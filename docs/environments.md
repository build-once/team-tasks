# Local, staging and production

The app exists in three places. Keeping them apart is the single most useful habit for avoiding
disasters.

Parts of this table are still **to be filled in**. The two Supabase projects now exist —
`teamtasks-staging` and `teamtasks-production` — and so does the Vercel project that hosts the app.
There is still no domain name. Production's environment values **have** been set, since Build it 6.
Where a cell is filled in, it records what was decided or done, not what has been observed in a
running service unless it says so. See "What is not filled in yet, and why" at the end.

## The three copies

| | **Local** | **Staging** | **Production** |
|---|---|---|---|
| **Purpose** | Where the code is written and first tried. Fast, throwaway, breaks often | A full copy online, for trying a change properly before real people see it. Where the Alice / Bob / Carol checks are run | The real app the six volunteers use |
| **Web address** | `http://localhost:3000` — the `next dev` default (unverified: the dev server has not been run yet) | not written down here — a Vercel URL on the Hobby plan; pull-request previews get their own URL and point at staging | to be filled in — no domain name chosen yet |
| **Database project name** | **None.** There is no local database; local development points at the staging project | `teamtasks-staging` — a Supabase project in a **separate free organisation** | `teamtasks-production` — a Supabase project in a **Pro organisation** (about $25/month) |
| **Where its keys are kept** | `web/.env.local`, never committed (`web/.gitignore` ignores `.env*`). It holds the **staging** project URL and publishable key and nothing else — no secret key ever sits on the laptop. See the note on variable names at the end | The two public values in the Vercel project's environment settings, **scoped to Preview only**; the secret keys (service-role, Resend) only in Supabase Edge Functions secrets — never in Vercel | **Set since Build it 6**: the two public values in the Vercel project's environment settings, **scoped to Production**, pointing at the production project — the same split as staging with **different values**. Production keys never go on a laptop in a plain file, never into chat, and never to the AI assistant |
| **What data it holds** | No data of its own — it reads and writes the staging project's fake seed data | Fake seed data only, plus the Alice / Bob / Carol test accounts. No backups — the free plan has none, so keep nothing here you would mind losing | Real people's data: the volunteers' email addresses, nicknames, team names and task text listed in the appendix of `docs/plan.md` |
| **Who or what may change it** | The owner and the AI assistant, directly — and because local points at staging, what they change lands in the **staging** database | The owner and the AI assistant, through the change flow — branch, pull request, checks, merge | **Only the automatic deploy from `main`**, plus the migration job in `.github/workflows/migrate-production.yml`, which runs on a push to `main` and nothing else. No hand-editing in a dashboard, and the AI assistant never touches it |

## Rules

- We never build, test or experiment on production.
- Staging holds fake data only. Production data is never copied to local or staging.
- The AI assistant has keys for local and staging only.
- Changes reach production only through the change flow: branch, pull request, checks, merge.

### What follows from those four

1. **Separate projects, separate keys.** Staging and production are two different Supabase
   projects, each with its own URL and its own keys. Never reuse a key between them.
2. **Previews point at staging.** When Vercel builds a preview of a pull request, that preview uses
   the **staging** URL and keys. This is set in Vercel's environment settings, per environment.
3. **Reading production** uses the **owner-runs-query pattern** (Book 2 A24): the AI assistant
   writes a read-only query, **the owner** runs it on production and pastes back the result with
   anything private removed. The assistant never gets production keys.
4. **Keys live in `.env` files that git ignores**, and in the host's secret settings.
   `.env.example` shows the names only, never a real value.

## The host: Vercel (Hobby)

Set up 2026-09-27. The app is hosted on Vercel, on the free **Hobby** plan, which keeps this inside
the £0-while-building line in `docs/plan.md`.

- **Root Directory is `web`.** The Next.js app lives in a sub-folder of this repository, not at the
  top. Vercel has to be told that, or it looks for an app at the top level and the build fails.
- **Two environment variables, scoped to Preview only.** `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, set to the **staging** project's values. Preview scope means
  every pull-request deploy talks to staging and its fake data. That is the same rule as rule 2 above,
  enforced in Vercel's settings rather than by memory.
- **Production has its two values set**, since Build it 6: the same two names again, scoped to
  Production, pointing at the **production** project. So the two scopes hold different values on
  purpose — Preview talks to staging, Production talks to production — which is rule 2 above made real
  in Vercel's settings rather than remembered.

  This bullet used to say production had no values at all and that a production deploy should be
  treated as "broken by design". That is no longer true, and the distinction matters: a production
  deploy now reaches a real database with real people's data in it.
- **Nothing secret is stored in Vercel.** Only those two public values. The service-role key and the
  email-sending key live in Supabase Edge Functions secrets, as the table above says.

### The ten pre-filled variables, and why they were deleted

When the project was imported, Vercel read `.env.example` and pre-filled **ten** environment
variables with its placeholder values, scoped to **Production and Preview**. That is every name in
that file:

`APP_ENV`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_PAYMENTS_PUBLISHABLE_KEY`,
`PUBLIC_MONITORING_DSN`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMENTS_SECRET_KEY`,
`PAYMENTS_WEBHOOK_SIGNING_SECRET`, `EMAIL_API_KEY`, `AI_API_KEY`.

**All ten were deleted.** Three reasons, in order of importance:

1. **Five of them are secret names**, including `SUPABASE_SERVICE_ROLE_KEY`, which bypasses every
   database rule. Vercel holds no secrets in this design, so a slot waiting to be filled with one
   does not belong there. An empty box invites someone to fill it.
2. **The values were placeholders, not settings.** `replace-me-server-only` in a live environment
   variable makes a deploy look configured when it points nowhere.
3. **The names are not the ones this app reads.** The app reads `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `PUBLIC_…` names are inert in Next.js. Keeping them would
   have left two sets of names for one value.

`.env.example` is still what a host reads on import, but it no longer carries those ten names. On
2026-09-28 it was cut down to the two the app actually reads, so a fresh import offers only those
two. The next section lists them and says what went, and why.

## Rolling back production

If a release breaks the live site, the owner puts the previous one back. **The owner does this in the
Vercel dashboard. The assistant never does it.**

1. Open Vercel, go to the **team-tasks** project, and open **Deployments**.
2. Find the deployment currently serving production.
3. Choose **Instant Rollback**, and confirm.
4. On the Hobby plan there is only one step back: you can roll back to the **previous** production
   deployment, not to any older one.
5. Afterwards, new merges stop going live. A later merge to `main` still builds, but it stays off the
   live site until someone presses **Undo Rollback**, or promotes a newer deployment. Remember this,
   or the next fix will look as though it did nothing.

**A rollback changes the website code and nothing else.** It does **not** undo a database migration
that the `migrate-production` job has already applied. A bad migration is fixed by writing another
migration and taking it through a pull request, the same way as any other change.

## Every setting the app uses

Two names the **web app** reads, both public, and four the **server functions** read, which the web app
never sees.

### What the web app reads, from Vercel

| Name | Public or secret | Local | Staging | Production | What it is |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Public** — it reaches the browser | Needed (staging value) | Needed | Needed, a **different** value | The Supabase project's address |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Public** — it reaches the browser | Needed (staging value) | Needed | Needed, a **different** value | The publishable key. Public only because row-level security decides what it may reach |

**Secret: none in the web app.** It talks to Supabase with the publishable key and lets the database
rules decide, which is why nothing secret belongs in Vercel.

### What the server functions read, from Supabase Edge Functions secrets

Set by the **owner**, in each Supabase project's own function settings. **Names only below — no
values, here or anywhere else in this repository.** Local is not listed because there is no local
database and the functions are not served locally.

| Name | Public or secret | Staging | Production | What it is |
|---|---|---|---|---|
| `EMAIL_API_KEY` | **Secret** | Needed | Needed, a **different** value | The Resend API key. Each project has its own, with sending access limited to `notify.raj-dhonota.com`, so a leaked staging key cannot send as production |
| `EMAIL_FROM` | Not secret, but not public either | Needed | Needed | The address invitations are sent from. `invite-member` refuses to send without it |
| `APP_URL` | Not secret | Needed — currently `http://localhost:3000`, see below | Needed, a **different** value, and `https` | The site's own address, used to build the `<APP_URL>/invite/<token>` link. **Only ever read from this setting, never from a request header** — a link built from `Host` or `X-Forwarded-Host` could be pointed at a site an attacker owns, harvesting the token |
| `EMAIL_TEST_INBOX` | Not secret | **Set** — `teamtasks.staging.test@gmail.com`, the Gmail test mailbox. Every invitation email goes there instead of to the invited person | **Not set** | Where staging's invitation mail is redirected. Its presence *alone* is what redirects mail, and it **overrides `EMAIL_DELIVERY`**: if a test inbox is set, nothing reaches a real recipient |
| `EMAIL_DELIVERY` | Not secret | **Not set** | **Needed**, exactly `live` | The only value that permits sending to a real recipient. Not `true`, not `Live`, not `1` — a delivery switch that accepts near-misses is one that turns itself on by accident |

**With none of these set, `invite-member` creates nothing and sends nothing.** It refuses, names the
settings that are missing, and writes no invitation row — because an invitation that exists but whose
email never went is worse than none: it occupies one of the team's 20 pending slots and the person it
names never heard about it. No setting's **value** is ever logged.

`SUPABASE_URL` and `SUPABASE_SECRET_KEYS` are not in that table because nobody sets them: Supabase
pre-populates both in every function's settings, and `withSupabase` reads them.

### Staging's `APP_URL` is `http://localhost:3000`

Decided 2026-10-01 (**issue #47**) and set by the owner in the staging project's function settings.

It used to point at the `feat/invitations` preview deployment, which was the only address available
while the feature was being built. That was going to break: a preview URL stops existing when its
branch is merged and deleted, and staging would have carried on sending invitation emails whose links
pointed nowhere. Nothing would have warned anybody — `invite-member` reads `APP_URL`, finds a non-empty
value, and sends.

**Why localhost.** It is **stable**: it belongs to no branch, so no merge or deletion can take it away.
That removes the rot entirely, which a second preview URL would only have postponed.

**What it costs.** A staging invitation link now starts `http://localhost:3000/invite/<token>`, which
works only on a machine running `next dev`. It is not a link anybody can click straight from the email.

**How to use it.** When testing against a Vercel preview, **swap the start of the link by hand**: take
the `/invite/<token>` part and paste it after the preview's address. The token is the only part that
matters — the host is a prefix.

Two things worth being exact about:

- **It is `http://`, not `https://`.** Correct for localhost, and it **must not** be copied to
  production, which is `https`. The two environments hold different values, which is the whole point of
  the table above.
- **"Never a dead address" is not "a working link".** The claim is that the *setting* cannot go stale.
  It is not that the link resolves to the app for whoever opens it.

**A permanent staging address is deferred to launch**, to be decided together with the production custom
domain — because the two questions have one answer: once a real domain exists, staging takes a subdomain
of it and production takes another. That also would remove one of **#48**'s three unproven factors, since serving the
app from the same registered domain as the sender (currently `raj-dhonota.com`, if that is the launch
domain) makes the invitation link and the email's sender agree.

Worth knowing alongside it: **staging invitation links only work for the project owner.** Vercel's
Deployment Protection guards preview deployments, so opening a link in another browser or as another
person reaches Vercel's own sign-in rather than the app. That is why the Carol and Bob checks in
`evidence/invitations.md` were all done from the owner's own browser, and it is a limit on what can be
tested on staging at all — not a fault.

The secrets in the whole system are not the app's: they belong to the deploy pipeline, and there are
**three**, all in the **`supabase-production` GitHub environment** and used only by
`.github/workflows/migrate-production.yml`. None is in `.env.example`, in Vercel, on the laptop, or in
this document.

**Where they live, exactly: Settings → Environments → `supabase-production`**, whose deployment
branches are limited to `main`, with no reviewers and no wait timer. They are deliberately **not**
repository Actions secrets. A repository secret is readable by a workflow running on *any* branch, and
a workflow file is only a file in that branch — so whoever can push a branch can push a job that reads
production's credentials. Limiting the environment to `main` means a job that names it gets nothing
unless the run is on `main`. All three jobs in `migrate-production.yml` therefore carry
`environment: supabase-production`. The workflow already triggers only on a push to `main`, so this is
a second lock on the same door — which is the point, because the trigger is a line in a file and the
branch list is enforced by GitHub whatever the file says.

A separate **`Production`** environment also exists, created by Vercel's integration. It holds none of
these and is not used by this workflow.

| Secret | What it reaches | Which job uses it |
|---|---|---|
| **`PRODUCTION_SUPABASE_DB_URL`** | The production **database**, and nothing else. Production's Session pooler connection string, password percent-encoded | `migrate` only |
| **`PRODUCTION_SUPABASE_ACCESS_TOKEN`** | **In effect, all production data.** A Supabase *scoped* personal access token for the production project, with the **Edge Functions Read-write** permission — but deploying a function means deploying code, and that code runs with the production secret keys, which bypass row-level security. Treat it as equal in power to the connection string, not lesser. See below for what the scoping does limit | `deploy-functions` only |
| **`PRODUCTION_SUPABASE_PROJECT_REF`** | Nothing on its own — it only names which project to deploy to. Kept as a secret to keep the production project id out of the repository | `deploy-functions` and `smoke-test` |

The two credential-holding jobs are separate so that each credential is visible to one job and not the
other: steps inside a single job share an environment, so splitting the jobs is what makes the
separation real rather than merely tidy. `deploy-functions` also has `needs: migrate`, so functions are
only deployed onto a database that has already been migrated. That separation limits what one leaked
credential exposes; it does **not** make either job the safer one.

### One environment variable, which is not a secret

The same environment also holds **one configuration variable**, under **Environment variables** rather
than Environment secrets:

| Variable | What it is | Which job uses it |
|---|---|---|
| **`PRODUCTION_SITE_URL`** | The full `https` address of the production home page, which the smoke test fetches expecting 200. Not a credential — it grants nothing | `smoke-test` only |

It is a variable because it is not secret, and it lives in the environment rather than this file for the
reason the rest of this document gives: the production address is deliberately not written down in the
repository. **Being a variable has one cost worth knowing.** GitHub masks secrets in run logs; it does
not mask variables, and this repository's run logs are public. So `smoke-test` never prints it — not in
a message, not in a success line, and not through curl, which is run with `-s` and deliberately without
`-S` because curl's own error text names the host it could not reach.

**The third job, `smoke-test`, holds no credential at all.** It reads the project ref, to build the
function URLs, and this variable, to fetch the home page. Every request it makes is a stranger's
request — no key, no token, no cookie, nothing that writes — because being signed out is precisely what
it is testing: every function must answer a signed-out POST with HTTP 401 and the code
`UNAUTHORIZED_NO_AUTH_HEADER`, which is the platform refusing before the function's own code runs. A
401 from the function's own code instead would mean `verify_jwt` was off and the request reached the
handler, so the job checks the code as well as the status.

### What the access token can actually do

An earlier version of this section said the token "cannot read the database". **That was wrong, and
wrong in the dangerous direction.** The correction matters enough to state plainly:

**A token that can deploy Edge Functions can deploy code, and that code runs with the production secret
keys — the service-role key, which bypasses every row-level security rule. So whoever holds this token
can read and change all production data.** The reach is indirect, needing one deploy to get there, but
the end state is the same. It is not a lesser credential than `PRODUCTION_SUPABASE_DB_URL`.

**What the scoping does limit,** and this is still worth having:

- **Staging is out of reach** — a different project entirely.
- **Every other project in the account is out of reach.**
- **Account settings are out of reach** — billing, members, other tokens.
- **Through the Management API it can do nothing but Edge Functions** — no database branches, no API
  keys, no project configuration.

**About the earlier objection, answered accurately.** This document used to say "No Supabase access
token is stored anywhere", on the grounds that such a token "reaches the whole account — staging
included". That was correct about a **classic** personal access token, which carries the full rights of
the person who created it. The gain from a scoped token is that its reach is **confined to one
project** — not that it excludes that project's data, because it does not.

`supabase link` is still not used: linking needs permissions this token does not have, so the workflow
names the project with `functions deploy --project-ref` instead.

**The token expires.** It was created on **1 October 2026** with a **90-day** expiry, so it lapses
**on or about 30 December 2026** — the exact date is shown in the Supabase access-token list, which is
the only authoritative place. **Rotation is due before then**, or the first merge afterwards will fail
at the deploy step. How to rotate it is in `docs/secrets.md`.

Where each copy keeps them:

- **Local** — `web/.env.local`, git-ignored, holding the **staging** values.
- **Staging** — the Vercel project's environment settings, scoped to **Preview** only.
- **Production** — the same two names, different values, scoped to Production. **Not set yet**
  (Build it 6), so a production deploy has nothing to talk to.

### Where the app reads them

Three files, six lines, all `process.env`, all in `web/`:

| File | Lines |
|---|---|
| `web/src/lib/supabase/client.ts` | 8–9 |
| `web/src/lib/supabase/server.ts` | 10–11 |
| `web/src/lib/supabase/proxy.ts` | 22–23 |

No project address and no key is written into the code anywhere, and no secret name sits behind a
public prefix such as `NEXT_PUBLIC_` or `VITE_`. Both statements were re-checked on 2026-09-28 by
searching the whole repository, not only `web/`.

### What `.env.example` lists, and what was taken out of it

`.env.example` now lists those two names with empty values, and nothing else. It used to carry ten.
The other eight were removed because the app does not use them, and because a host reads this file:
importing the project into Vercel turned all ten into environment variables, five of them secret
names. A name written here in advance becomes an empty slot in a dashboard, waiting for somebody to
fill it.

| Removed | Why |
|---|---|
| `APP_ENV` | Nothing in the app reads it. (The `production-access` guard rule still recognises `APP_ENV=production` in a command; removing the name from this file does not change that.) |
| `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` | Superseded. Next.js only exposes `NEXT_PUBLIC_…` names to the browser, so these two were inert and invited someone to fill in the wrong pair |
| `SUPABASE_SERVICE_ROLE_KEY` | Not used. It bypasses every database rule, and must never live in Vercel |
| `PAYMENTS_SECRET_KEY`, `PAYMENTS_WEBHOOK_SIGNING_SECRET`, `PUBLIC_PAYMENTS_PUBLISHABLE_KEY` | No payments. `docs/plan.md` puts them outside the first version |
| `EMAIL_API_KEY` | No email sending yet. Invitations (plan feature 3) are not built; the name comes back when they are, and the value lives in Supabase Edge Functions secrets, not Vercel |
| `AI_API_KEY` | No AI feature. `docs/plan.md` lists an AI helper under "deliberately not in the first version" |
| `PUBLIC_MONITORING_DSN` | No monitoring or error reporting. The plan says none is collected and none is planned |

If one of these comes back, add the name with an empty value, and put the real value only where that
kind of value belongs: a public one in the host's environment settings, a secret one in Supabase Edge
Functions secrets.

## No local database, for now

Decided 2026-09-27. A database on the laptop is optional (Build it 5), and the usual way to run one —
the Supabase CLI — needs Docker. Docker is not installed and is not going to be. So local
development points at the **staging** project, which holds fake data only.

What follows from that:

- One less copy to keep in step, and no Docker on the machine.
- **Local is not isolated any more.** A row added while developing, a task deleted, a migration tried
  by hand — all of it happens in the staging database that the Alice / Bob / Carol checks share.
  Expect to reload the seed data more often, and do not assume a clean slate.
- Staging still holds fake data only. That rule does not loosen because local now shares it.
- Revisit this if two people ever develop at the same time, or when a change could destroy staging
  data rather than just add to it.

## Seed data and test accounts

Seed data is fake data you can load into local and staging at any time, so tests always start from
the same place. Keep it in the repo as a script. Never copy real people's data into staging.

Create these three test accounts on **staging** (and locally). They all use the **Gmail test
mailbox**, `teamtasks.staging.test@gmail.com`, with plus-addressing, so every sign-up confirmation and
every staging invitation lands in one inbox nobody real reads:

| Account | Email address | Role | What it proves |
|---|---|---|---|
| **Alice** | `teamtasks.staging.test+alice@gmail.com` | The owner of some data (e.g. owns a team with a few tasks) | Normal use works |
| **Bob** | `teamtasks.staging.test+bob@gmail.com` | An outsider with his own separate account | He must **not** see or change anything of Alice's |
| **Carol** | `teamtasks.staging.test+carol@gmail.com` | A member of Alice's team | She sees what a team member should — and nothing that is owner-only |

These three are what plan feature 5 — "see only the tasks of teams you belong to" — is tested with.

The accounts are created by **real sign-up on the app, pointed at staging** — the owner does that, in
a browser. Nothing in this repository creates them.

**Why one mailbox and not three.** Staging's `EMAIL_TEST_INBOX` is set to
`teamtasks.staging.test@gmail.com`, so `invite-member` redirects *every* staging invitation there, no
matter who it names. Plus-addressing makes the three accounts separate identities to Supabase Auth —
`+alice` and `+bob` are different rows in `auth.users` — while the mail all arrives in one place the
owner can actually open. Gmail delivers `name+anything@gmail.com` to `name@gmail.com`.

These addresses are **not secret**; they are written down here on purpose. The passwords are, and they
are not here — see below.

### Where the test accounts' passwords live

**`~/.config/team-tasks/staging.env`**, on the owner's machine, **outside this repository**. The
owner writes that file by hand; it is never committed, never printed, and no value from it is ever
pasted into chat or into a commit message (rule 7). It holds the staging test accounts' passwords and
nothing from production.

One `NAME=value` per line, `#` comments and an optional `export ` prefix allowed, for example:

```sh
BOB_EMAIL=teamtasks.staging.test+bob@gmail.com
BOB_PASSWORD='the password you chose when you signed Bob up'
```

The scripts do not read the file themselves. They read **environment variables**, so the owner loads
the file into the shell for one run and the values stay out of shell history — what you type is a
filename, not a password:

```sh
# Git Bash, WSL or macOS, from the repository root
set -a
. ~/.config/team-tasks/staging.env
set +a
node scripts/staging/bob-invites-to-alices-team.mjs
```

PowerShell has no `source`, so it reads the file line by line instead. Run from the repository root:

```powershell
foreach ($line in Get-Content "$HOME\.config\team-tasks\staging.env") {
  if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
    Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim().Trim("'").Trim('"')
  }
}
node scripts/staging/bob-invites-to-alices-team.mjs
```

**Both snippets were run on this machine on 2026-10-02**, against a fake file holding a `#` comment
line, a plain `NAME=value`, a single-quoted value and an `export NAME="value"` line. Each set all
three names, skipped the comment and stripped both kinds of quote. Only the names and the value
*lengths* were printed, never a value. Close the shell window when you are done — the values live in
that one process, and nothing writes them to disk.

The names the scripts expect, as they are read in the code today:

Two scripts read them today. `bob` is `scripts/staging/bob-invites-to-alices-team.mjs`; `rules` is
`scripts/staging/build-it-14-checks.mjs`, which signs all three accounts in and checks the team read
rules.

| Variable | Read by | What it is |
|---|---|---|
| `ALICE_EMAIL` | `rules` | `teamtasks.staging.test+alice@gmail.com`. Not secret |
| `ALICE_PASSWORD` | `rules` | Alice's staging password. **Secret** — never printed, by that script or any other |
| `BOB_EMAIL` | `bob`, `rules` | `teamtasks.staging.test+bob@gmail.com`. Not secret |
| `BOB_PASSWORD` | `bob`, `rules` | Bob's staging password. **Secret** — never printed |
| `CAROL_EMAIL` | `rules` | `teamtasks.staging.test+carol@gmail.com`. Not secret |
| `CAROL_PASSWORD` | `rules` | Carol's staging password. **Secret** — never printed |
| `ALICE_TEAM_ID` | `bob`, `rules` | The UUID of the team Bob must be refused, and the team whose roster Alice and Carol must both see. Not secret, and it changes whenever staging's seed data is reloaded |

The pattern for any further account is the same two names per person, `<NAME>_EMAIL` and
`<NAME>_PASSWORD`, and a row here.

The staging URL and publishable key are **not** in that file: they live in `web/.env.local`, which
both scripts read directly.

## Checks you can do yourself (no coding needed)

Do these on **staging** after any change to sign-in, sharing, or database rules. Write down what you
saw — that is your evidence.

1. **Bob cannot see Alice's things.** Sign in as Bob. Try Alice's page by pasting its web address.
   You should see "not found" or be sent away — not her data.
2. **Bob cannot change Alice's things.** As Bob, try to edit or delete something of Alice's (for
   example by using an old link). It must fail.
3. **Carol sees the team's things, not the owner-only things.** Sign in as Carol. Team tasks:
   visible. Owner settings: not visible or not editable.
4. **Signed-out visitors see nothing private.** Open a private/incognito window and visit a private
   page. You should be asked to sign in.
5. **Staging is really staging.** On the staging site, open your browser's developer tools → Network
   and check that requests go to your **staging** project address, not production.
6. **Files are locked too.** Not applicable in the first version — it has no file uploads. Re-check
   this if that ever changes.
7. **No secrets in the page.** On staging, view the page source and search for `service` or
   `secret`. Only public keys should appear.

If any of these cannot be done (for example, you have no second account yet), write
**"unverified — reason"**, not "passed".

## What is not filled in yet, and why

Every "to be filled in" above is waiting on something that has not been created. None of it is
unknown in the sense of undecided — the decisions are in `docs/stack.md`; the values just do not
exist yet.

- **Web addresses for staging and production.** The Vercel project exists and issues URLs, but they
  are deliberately not written down in this repository, and no domain name has been chosen.
- **Production environment values: no longer missing.** They were set in Vercel at Build it 6, scoped
  to Production. The values themselves stay out of this file, as everywhere else — only the names are
  recorded, above.
- **Unverified — the two database project names.** `teamtasks-staging` and `teamtasks-production` are
  the names the owner reported on 2026-09-27. Nothing has connected to either project to read them
  back, so they are recorded here on the owner's word. The split — production in a Pro organisation,
  staging in a separate free organisation — is decided in `docs/stack.md` (decision B) and in the
  Budget section of `docs/plan.md`; whether the two projects are really in two organisations has not
  been checked either.
- **Project references, URLs and keys are deliberately not here.** This file holds names only. The
  values live in `web/.env.local` on the laptop and in the host's secret settings, never in git.
- **The local database is settled, not missing** — see "No local database, for now" above.
- **Unverified — the local web address.** `http://localhost:3000` is the documented `next dev`
  default and matches `web/package.json`, but the dev server has not been run, so it has not been
  seen.
- **Partly verified — Vercel builds, but its settings have not been inspected.** A preview deployment
  for the pull request that added this section completed successfully, which is good evidence that the
  Root Directory setting is right: a wrong one fails the build. Everything else here — the Preview
  scoping, and the deletion of the ten pre-filled variables — is recorded from the owner's account of
  what they did in the dashboard. No tool has read Vercel's configuration back, and the assistant has
  no Vercel access. A green build does **not** show which Supabase project a preview talks to; check 5
  below is how to establish that.
- **Unverified — no secret has been stored in either Supabase project.** The "where its keys are kept"
  row describes the intended arrangement from `docs/stack.md` for the secret half, not a configuration
  that was inspected.
- **Closed 2026-09-28 — the variable names in `.env.example` now match what Next.js needs.** It used
  to list `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`, which Next.js never exposes to the
  browser, alongside eight names the app does not use. It now lists `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with empty values, and nothing else, so a fresh import into
  any host offers only those two. See "Every setting the app uses".
- **Closed 2026-09-28 — the guard now recognises the production project.** `guard/local.json` exists
  and lists the production project reference under `production_patterns`, so the `production-access`
  rule in `guard/rules.json` can block a command or connector call that names production
  (`docs/guards.md`, "Tell the guard what production looks like"). Still worth knowing: it matches the
  project reference, not a production web address, because no domain name has been chosen yet. Guard
  files are changed by a person, never by the assistant.
- **Note — `main` is not protected yet.** Rule 4 above assumes changes cannot be pushed straight to
  `main`. On GitHub's Free plan, branch protection needs a public repository or a paid plan, and
  `team-tasks` is private. This is still open: see `docs/stack.md` (still open, D) and
  `docs/protect-main.md`. Until it is settled, "changes reach production only through the change
  flow" is enforced by habit and by the local guards in `.claude/hooks/`, which run on this machine
  only — **not** by a branch rule.
