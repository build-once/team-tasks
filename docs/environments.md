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
| **Database project name** | **None.** There is no local database; local development points at the staging project | `teamtasks-staging` — a Supabase project in a **separate free organisation**, and **it stayed there on 10 Oct 2026** when production moved | `teamtasks-production` — a Supabase project in the **`DHTA Ltd` organisation, on the Pro plan** (about $25/month). **Moved there by the owner on 10 Oct 2026**, which is the day this stopped being an intention: it had read "a Pro organisation" since this file was written, from `docs/stack.md`'s decision B rather than from anything done. `evidence/production-log.md`, 10 Oct, is the record — and so is the spending control nobody has set yet ([#250](https://github.com/build-once/team-tasks/issues/250)) |
| **Where its keys are kept** | `web/.env.local`, never committed (`web/.gitignore` ignores `.env*`). It holds the **staging** project URL and publishable key and nothing else — no secret key ever sits on the laptop. See the note on variable names at the end | The two public values in the Vercel project's environment settings, **scoped to Preview only**; the secret keys (service-role, Resend) only in Supabase Edge Functions secrets — never in Vercel | **Set since Build it 6**: the two public values in the Vercel project's environment settings, **scoped to Production**, pointing at the production project — the same split as staging with **different values**. Production keys never go on a laptop in a plain file, never into chat, and never to the AI assistant |
| **What data it holds** | No data of its own — it reads and writes the staging project's fake seed data | Fake seed data only, plus the Alice / Bob / Carol test accounts. No backups — the free plan has none, so keep nothing here you would mind losing. **That claim is now in doubt** rather than settled: production had daily backups while it was still on a free plan, which is [#247](https://github.com/build-once/team-tasks/issues/247) | Real people's data: the volunteers' email addresses, nicknames, team names and task text listed in the appendix of `docs/plan.md`. **Backed up daily — the database, and not the files.** On 10 Oct 2026 the owner read Database → Backups: **seven daily physical backups, 3 to 9 October, each around 12:20 UTC**, and the page's own statement that **Storage objects are not included**. So the `attachments` bucket is **outside** these backups ([#248](https://github.com/build-once/team-tasks/issues/248)), and **no restore has ever been tried** — the page's "Restore to new project" option is marked Beta ([#249](https://github.com/build-once/team-tasks/issues/249)) |
| **Who or what may change it** | The owner and the AI assistant, directly — and because local points at staging, what they change lands in the **staging** database | The owner and the AI assistant, through the change flow — branch, pull request, checks, merge | **Only the automatic deploy from `main`**, plus the migration job in `.github/workflows/migrate-production.yml`, which runs on a push to `main` and nothing else. No hand-editing in a dashboard, and the AI assistant never touches it |

## Where each migration has been applied

Added 2026-10-08 for [#208](https://github.com/build-once/team-tasks/issues/208), which asked that this
record live here rather than in a status note inside a migration file — a note kept in the file itself
goes stale without anyone noticing.

**Both columns of this table are reports, not observations by the assistant.** The staging row is the
owner's apply plus the coach's read-back through the staging read-only connector; the production row is
the step conclusions of a GitHub Actions run, read with `gh run view --json` or `gh run list --json`,
**plus — where a cell says so — a read through the production read-only connector, which is the coach's
and never the assistant's.** Nobody writing this opened a dashboard or connected to either database.

**And the two are not the same kind of fact, which is what this table now keeps straight cell by cell.**
A workflow run says the statements ran. A migration count says production records having applied them.
**Neither says what they left behind** — the column, the table, the bucket, the policy, the privilege —
and only a connector read of the thing itself does. Three cells below are at three different points on
that scale, deliberately.

| Migration | Staging | Production |
|---|---|---|
| Everything up to and including `20261006095847_invitation_status.sql` | applied | applied — `migrate-production` has run on every merge to `main` since Build it 6 |
| `20261007204900_ai_suggestions_consent.sql` | **applied 8 Oct 2026**, by the owner from the `feat/ai-consent-migration-206` branch. Read back by the coach the same day: 9 migrations recorded, newest `20261007204900`; `ai_suggestions_enabled` default false and not null; `ai_suggestions_changed_at` nullable with no default; `my_ai_suggestions()` present and `security definer`; trigger `profiles_stamp_ai_suggestions` present. `evidence/build-it-21-ai-consent-migration.md` appendix B holds it | **applied 8 Oct 2026**, by `.github/workflows/migrate-production.yml` when PR #210 merged — run [37743591469](https://github.com/build-once/team-tasks/actions/runs/37743591469), whose "Apply migrations to production" step succeeded. **And read back the same day** by the coach through the production read-only connector: 9 migrations, newest `20261007204900`; both columns present, default off; `my_ai_suggestions()` present; `anon` and `authenticated` hold **no** table-level SELECT or UPDATE on `profiles`; `service_role` holds SELECT and **not** UPDATE; no profile rows. `evidence/production-log.md`, 8 Oct, holds it — and that read is what settles what the statements left behind, which a green workflow run cannot. *(The workflow step's own log output was never read: the command used to read it was refused by the guard — `db-remote-write`, matching the literal text of a remote push inside a search pattern — and was not retried.)* |
| `20261008115900_usage_counts.sql` | **not applied.** The owner has not applied it, and was not asked to in the session that wrote it. Proved only on a throwaway local PostgreSQL sandbox — `evidence/build-it-22-usage-counts.md`. **This row disagrees with that file's appendix B**, which records the owner applying it to staging on 8 Oct 2026 and the coach reading it back. Neither claim was checked in the session that noticed the disagreement; [#238](https://github.com/build-once/team-tasks/issues/238) holds it | **APPLIED 8 Oct 2026, and this cell said "not applied" until 10 Oct.** It was wrong, and in the direction that matters least but reads worst: a migration recorded as absent from production that had been there for two days. Two things settle it, found on 10 Oct. **First, the run**: `.github/workflows/migrate-production.yml` run [37780308766](https://github.com/build-once/team-tasks/actions/runs/37780308766) succeeded at **2026-10-08T12:54:51Z** on the merge of PR #224 — the pull request that added this migration — read with `gh run list --json`. **Second, the count**: on 10 Oct the coach's production read-only connector reported **11 migrations, newest `20261008191804`**, against **11 `.sql` files in `supabase/migrations/`**, counted by listing the directory. Were this one missing, production would hold 10. **And third, the check that was already doing this all along**: `.github/workflows/drift-check.yml` compares the migrations applied to production against the files in `supabase/migrations/` every day, and **opens a "Database drift" issue and fails the run** when they differ. Run [37936434092](https://github.com/build-once/team-tasks/actions/runs/37936434092), on a schedule at **2026-10-09T13:22:58Z** — after the attachments migration reached production at 11:17 that morning, so against all 11 files — **succeeded**, which for that script means exit 0, "checked, and production matches the repository". Exit 3 is drift and exit 1 is "could not check", and the workflow fails the run on both. **The count is an inference, the run and the drift check are not** — the connector gave a count and one name, never the list, so it cannot show *which* 11. **So this cell was contradicted every day by a green job in this repository**, which is the part worth not glossing over: the evidence was arriving on a schedule and nobody read it against this table. **This half of [#238](https://github.com/build-once/team-tasks/issues/238) is answered: production is "applied", and `evidence/build-it-22-usage-counts.md` appendix B was right about production.** The staging cell's disagreement is untouched and #238 stays open for it. `evidence/production-log.md`, 10 Oct, holds the connector read. **Not read back**: no connector read has looked at `usage_counts` itself — the table, its 0 policies, or the privileges — so what the statements left behind on production is still unverified |
| `20261008191804_attachments_bucket.sql` | **applied 9 Oct 2026**, by the owner, with `supabase db push` from PR #241's branch (CLI 2.75.0; it listed one migration and printed "Finished supabase db push."). **That answers [#239](https://github.com/build-once/team-tasks/issues/239)'s first question** — the role `db push` connects as may insert into `storage.buckets` and create policies on `storage.objects` — which this cell carried as the most likely way the apply would fail. Read back by the coach the same day through the staging read-only connector: 11 migrations recorded, newest `20261008191804`; bucket `attachments` private, limit 5242880, the six types; three policies on `storage.objects` (SELECT, INSERT, DELETE), each `to authenticated` only; trigger `tasks_refuse_delete_with_files` present; `attachments_may_add` executable by `authenticated` and not by `anon`; 0 objects. `evidence/build-it-23-attachments-bucket.md`, "Record of the staging apply and runs", holds it, with the before-and-after pair of script runs either side | **applied 9 Oct 2026**, by `.github/workflows/migrate-production.yml` when PR #241 merged — run [37922812469](https://github.com/build-once/team-tasks/actions/runs/37922812469), whose "Apply migrations to production" step succeeded, read with `gh run view --json`. **The migration record IS now read back, and the bucket is not — a distinction worth keeping.** On 10 Oct 2026, after the project moved organisation, the coach's production read-only connector reported **11 migrations, newest `20261008191804`**, which is this one: so production records having applied it, read rather than reasoned (`evidence/production-log.md`, 10 Oct). **That is still not what [#243](https://github.com/build-once/team-tasks/issues/243) asks for.** No production read has looked at **the bucket row, the three policies or their privileges** — and those are the whole of what this migration was for. A migration recorded as applied says a statement ran, the same way a green workflow run does; neither says the bucket is private, carries the 5 MB limit and the six types, or that the three policies are `to authenticated` only. **#243 stays open**, and it is the one production fact this feature's privacy rests on |

**And where the server functions stand, which is a different question and is answered differently.**
Migrations and functions do not travel together: production gets every function on a merge to `main`,
through the same workflow, while **staging is deployed by hand** by the owner (rule 19).

| Function | Staging | Production |
|---|---|---|
| `create-team`, `invite-member`, `accept-invite` | deployed | deployed |
| `suggest-subtasks` | **the Build it 20 version**, deployed by the owner on 7 Oct 2026. The Build it 21 consent check is **not** on staging until the owner deploys it again | **the newest merged version**, because the pipeline deploys every function on merge. **With no `AI_API_KEY`**, so every ask there answers the fixed failure with the code `not_configured` — which is production's intended state until `docs/plan.md`'s three preconditions are met |

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

Four names the **web app** reads — three public, one server-side and optional — and four the
**server functions** read, which the web app never sees.

### What the web app reads, from Vercel

| Name | Public or secret | Local | Staging | Production | What it is |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Public** — it reaches the browser | Needed (staging value) | Needed | Needed, a **different** value | The Supabase project's address |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Public** — it reaches the browser | Needed (staging value) | Needed | Needed, a **different** value | The publishable key. Public only because row-level security decides what it may reach |
| `NEXT_PUBLIC_SENTRY_DSN` | **Public** — it reaches the browser, identifies the Sentry project and grants nothing | **Optional, and normally not set** — with no DSN nothing is sent, which is what a laptop should do | **Needed**, or the Preview build fails | **Needed**, or the Production build fails. The same value is fine for both | Where error reports go. See below |
| `SITE_URL` | Not secret, but **not public either** — no `NEXT_PUBLIC_` prefix, so Next.js never puts it in the browser bundle | **Optional** — set it to `http://localhost:3000` to test password reset locally | **Optional**, the preview's own address | **Optional**, the production address, and `https` | The site's own address, used for one thing: the `<SITE_URL>/auth/reset` link in a password-reset email. **Read only from this setting, never from a request header** — see below |

**Secret: none in the web app.** It talks to Supabase with the publishable key and lets the database
rules decide, which is why nothing secret belongs in Vercel. The Sentry DSN does not change that: it
is public in the same way the publishable key is.

### `NEXT_PUBLIC_SENTRY_DSN`, and why the build refuses without it

Added 2026-10-05 with error reporting (**issue #157**). `docs/plan.md`, "Error reports to an outside
service", is the decision this implements; read that first, because it also lists what must never be
sent.

**It is public.** The DSN identifies a Sentry project and grants nothing — it cannot read reports,
only post them. `docs/plan.md` says so outright: "the DSN, identifies the project and travels in the
browser: it is public, like the Supabase publishable key, and it is not a secret". It is still not
written down in this repository, for the same reason no other value is: this file holds names.

**There is no second setting, on purpose.** No Sentry auth token and no source-map upload, because
the setup wizard was not used and `next.config.ts` is not wrapped in `withSentryConfig`. The cost of
that is worth knowing: a **browser** stack trace names the built, minified file rather than the
source file. Server stack traces are unaffected.

**With no DSN, nothing is sent and nothing breaks.** The three files that start Sentry —
`web/src/instrumentation-client.ts`, `web/src/sentry/server-init.ts` and
`web/src/sentry/edge-init.ts` — each return before calling `Sentry.init` at all when the setting is
empty. That is what makes local development work with nothing set.

**But a Production or Preview build fails without it**, with a message naming the setting.
`web/src/lib/env.ts` checks `VERCEL_ENV` and insists on a DSN when it is `production` or `preview`.
The reason is that the failure it prevents is silent: an app with no error reporting looks exactly
like an app with it, and the owner would hear about a breakage from a volunteer instead of from
Sentry.

The check is deliberately **not** a module-level constant like the two Supabase names. Those throw
the moment the module is imported, anywhere. This one is a function that only
`assertSettingsPresent()` calls, so it fires during `next build` — where `VERCEL_ENV` exists — and
never from inside a page render. A missing error report is a problem to fix before the deploy, not a
reason to take the live app down after it.

**The CI build sets an obvious placeholder**,
`https://placeholder@placeholder.ingest.sentry.io/0`, in the `app-build` job in
`.github/workflows/ci.yml`. It is not what makes that job pass — GitHub Actions sets no `VERCEL_ENV`,
so the build would succeed without it — it is there so the build compiles the Sentry code path with
a value present instead of only ever compiling the empty-DSN branch. The host it names does not
exist, so nothing could reach anybody's project even if something tried to send.

**Unverified — whether Vercel exposes `NEXT_PUBLIC_VERCEL_ENV` to the browser.** The app tags every
report with which deployment it came from. On the server that comes from `VERCEL_ENV`; in the browser
it has to come from a `NEXT_PUBLIC_` name, and nothing in this repository can show whether this
project exposes one. If it does not, a browser report is tagged `unknown` while a server report from
the same deployment is tagged correctly. The Vercel dashboard is the only place that settles it.

### `SITE_URL`, and why it is optional

Added 2026-10-03 with the Forgot password screens (**issue #120**).

A password-reset email has to link back to this app. That address is built from `SITE_URL` and from
nothing else — not from a hard-coded localhost, preview or production address, and **not from a
request header**, which is the one difference from the sign-up confirmation in
`web/src/app/auth/actions.ts`. A confirmation link reads the request's own origin so a preview
confirms back to itself; a reset link carries a credential, so it gets the same treatment as `APP_URL`
in the Edge Functions: a link built from `Host` or `X-Forwarded-Host` could be pointed at a site an
attacker owns, and then the reset code arrives there.

**With the setting absent, the app sends no `redirectTo` at all** and Supabase uses the project's own
**Site URL** setting. That is still an address from settings, so rule 4 of the issue holds either way —
and it is why the setting is optional rather than required: a required one would stop the app working
the moment this merged and before anybody had set it.

**Each address used has to be on that Supabase project's Redirect URLs allow-list**, or Supabase
ignores it and falls back to the Site URL. The addresses are listed in the pull request for #120.
Supabase settings are not the assistant's to change (rule 10), so the owner adds them.

**Unverified — what is on either project's allow-list today.** Nothing in this repository records it;
`supabase/config.toml` has no `[auth]` section, and no document here lists a Site URL or a redirect
address. The Supabase dashboard is the only authoritative place.

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
| `AI_API_KEY` | **Secret** | **Needed from Build it 20** | **Deliberately NOT SET until Build it 21** — see below | The Anthropic Claude API key, for `suggest-subtasks`. Each project gets its own, from the **Team Tasks** Console workspace with its 5-dollar monthly spend limit, so a leaked staging key cannot spend production's allowance. It is the first key here that **spends money per request** |

**With none of these set, `invite-member` creates nothing and sends nothing.** It refuses, names the
settings that are missing, and writes no invitation row — because an invitation that exists but whose
email never went is worse than none: it occupies one of the team's 20 pending slots and the person it
names never heard about it. No setting's **value** is ever logged.

### `AI_API_KEY`, and why production has none yet

Added 2026-10-07 with Build it 20 part 1 (**issue #183**, which closes **#179**). The row above used to
sit in the "Removed" table at the bottom of this file, saying "No AI feature. `docs/plan.md` lists an AI
helper under 'deliberately not in the first version'". **Both halves stopped being true on 2026-10-07**:
`docs/plan.md` gained a "Suggest subtasks" section and "An AI helper" left its not-in-the-first-version
list. Issue #179 was filed because this is the file somebody reads to find out where a secret belongs,
and a stale "no AI feature" row is how a key ends up in the wrong store.

**Where it lives, and nowhere else.** In each Supabase project's own Edge Functions secrets, exactly
like `EMAIL_API_KEY`. **Not in Vercel**, not in `.env.example`, not in `web/.env.local`, not in a GitHub
Actions secret, and not in this repository. `docs/architecture.md`'s arrow (12) is the reason in one
line: the key never reaches a browser, so the call is made by server code and the browser never holds
anything that could spend money.

**Production is deliberately left without one for the whole of Build it 20.** `docs/plan.md`:
"the consent setting arrives in Build it 21, not here. Until it exists, the production key is not
installed — so on production the helper answers that suggestions are not available, which is a real
answer rather than a broken screen. Staging has its key from Build it 20, which is where the thing is
actually tried. Nobody's task title leaves production before there is a setting that lets them say no."

So the production deploy of `suggest-subtasks` is expected and correct, and it will answer every ask
with one fixed sentence and the code `not_configured` until somebody sets this. **That is not a
misconfiguration to fix.** The function treats whitespace as absent, matching every other settings check
here, so a key of spaces does not accidentally switch it on.

**What it costs, which no other setting in this file does.** Anthropic's Claude API has no free plan and
charges per token. The ceiling is the **5-dollar monthly spend limit** on the Team Tasks workspace; past
it, requests come back refused and the helper answers that suggestions are not available.
`docs/costs.md` carries the published prices and the arithmetic. **Usage counts and daily limits arrive
in Build it 22** — until then the spend limit is the only thing between a loop and a bill, which
`docs/plan.md` says in those words.

**Unverified — what either project actually holds today.** Nothing in this repository can see a Supabase
project's function secrets, and no `supabase secrets set` has been run from any assistant session. The
staging key is the owner's step, with `supabase functions deploy suggest-subtasks`; the Supabase
dashboard is the only authoritative place. `evidence/build-it-20-ai-helper.md` records what has and has
not been done.

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

**Seven files**, thirteen `process.env` lines between them, plus one line in `web/next.config.ts`.
Counted on 2026-10-06 by searching the whole of `web/src` for `process.env.<NAME>`; the only other
hits are explanatory comments inside `env.ts`, `sentry/options.ts` and `app-version.ts`, which name
settings without reading them.

| File | What it reads |
|---|---|
| `web/src/lib/env.ts` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SENTRY_DSN`, once each — and `VERCEL_ENV`, to decide whether a missing DSN should stop the build |
| `web/src/lib/password-reset.ts` | `SITE_URL`, once, and nothing else |
| `web/src/instrumentation-client.ts` | `NEXT_PUBLIC_VERCEL_ENV`, for the deployment tag on a browser report |
| `web/src/sentry/server-init.ts` | `VERCEL_ENV`, for the same tag on a server report |
| `web/src/sentry/edge-init.ts` | `VERCEL_ENV`, for the same tag on an edge report |
| `web/src/instrumentation.ts` | `NEXT_RUNTIME`, three times — Next.js' own name for which runtime is loading the file, not a setting anybody sets |
| `web/src/app/components/Footer.tsx` | `APP_COMMIT` and `VERCEL_ENV`, for the version in the footer — see the section below |
| `web/next.config.ts` | `VERCEL_GIT_COMMIT_SHA`, once, to set `APP_COMMIT` at build time |

This table used to name `client.ts`, `server.ts` and `proxy.ts` with line numbers, and it had gone
stale: those three now import their values from `env.ts` and read no environment variable of their
own. It then said "two files, three lines", which Build it 18 made stale in turn — the five new lines
arrived with error reporting. Line numbers are still deliberately left out, because they are what
went stale the first time.

Worth noticing about the last four rows: none of them reads a **setting of this app's**.
`NEXT_PUBLIC_VERCEL_ENV`, `VERCEL_ENV`, `NEXT_RUNTIME` and `VERCEL_GIT_COMMIT_SHA` are all set by the
platform, and `APP_COMMIT` is set by this repository's own `next.config.ts` — so there is nothing to
add to the table above for any of them, and nothing for the owner to set anywhere.

### The version in the footer, and the two names behind it

Added 2026-10-06 with Build it 19 (**issue #173**, rule 8). The footer on every screen says which
build you are looking at. **Nothing here is a secret and nothing here is for the owner to set.**

`VERCEL_GIT_COMMIT_SHA` is the commit Vercel built from. The name is not remembered: the installed
Next.js reads that exact name for this exact purpose, falling back to `git rev-parse HEAD` —
`web/node_modules/next/dist/lib/helpers/git.js`, lines 48–57.

`web/next.config.ts` copies it into `APP_COMMIT` through the `env` config, which is a **build-time**
substitution: "Next.js will replace `process.env.customKey` with `'my-value'` at build time"
(`web/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/env.md`). That
is deliberate — "the commit the build came from" is a fact about the build, so the build captures it,
rather than the footer depending on whether the platform also sets the name at run time.

`web/src/app/components/Footer.tsx` then hands `APP_COMMIT` and `VERCEL_ENV` to `appVersion` in
`web/src/lib/app-version.ts`, which is pure and is checked by
`scripts/screen-state-check.mjs`. Anything that is not 40 hex digits is treated as "no commit", so:

| Where | What the footer says |
|---|---|
| Vercel **Production** | `Version <7 characters>` |
| Vercel **Preview** | `Version <7 characters> (preview)` |
| A laptop, and the CI build | `Local development — no deployed version` |

**Unverified — what the footer actually reads on Vercel.** Nothing in this repository can show it. The
reasoning above is from the installed Next.js source and the version-matched docs, not from a
deployed page; the owner checks the Production and Preview footers against
`git log -1 --format=%h` on the deployed commit.

A commit SHA names a commit in a public repository and the footer prints it on purpose, so it is not
a secret. The `env` doc notes that a value configured this way is included in the JavaScript bundle
whatever it is called — acceptable for this value, and the reason nothing else is put there.

No project address and no key is written into the code anywhere, and no secret name sits behind a
public prefix such as `NEXT_PUBLIC_` or `VITE_`. Both statements were re-checked on 2026-09-28 by
searching the whole repository, not only `web/`.

### What `.env.example` lists, and what was taken out of it

`.env.example` lists **four** names with empty values, and nothing else: the two Supabase ones,
`SITE_URL`, and — since 2026-10-05 — `NEXT_PUBLIC_SENTRY_DSN`. It used to carry ten. The eight that
went were removed because the app does not use them, and because a host reads this file: importing
the project into Vercel turned all ten into environment variables, five of them secret names. A name
written here in advance becomes an empty slot in a dashboard, waiting for somebody to fill it.

That is also the rule for what may be added back, and it is why the DSN belongs here while nothing
else from Build it 18 does: the app reads it, so it is not written here "in advance". The other three
names those files read — `VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_ENV` and `NEXT_RUNTIME` — are set by the
platform, not by anybody, so putting them here would create exactly the empty slots this paragraph
warns about.

This paragraph said "those two names ... and nothing else" until 2026-10-05, which had been wrong
since `SITE_URL` was added to the file — issue #120, dated 2026-10-03 in the section above. A small
piece of staleness, corrected here along with the new name.

| Removed | Why |
|---|---|
| `APP_ENV` | Nothing in the app reads it. (The `production-access` guard rule still recognises `APP_ENV=production` in a command; removing the name from this file does not change that.) |
| `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` | Superseded. Next.js only exposes `NEXT_PUBLIC_…` names to the browser, so these two were inert and invited someone to fill in the wrong pair |
| `SUPABASE_SERVICE_ROLE_KEY` | Not used. It bypasses every database rule, and must never live in Vercel |
| `PAYMENTS_SECRET_KEY`, `PAYMENTS_WEBHOOK_SIGNING_SECRET`, `PUBLIC_PAYMENTS_PUBLISHABLE_KEY` | No payments. `docs/plan.md` puts them outside the first version |
| `EMAIL_API_KEY` | No email sending yet. Invitations (plan feature 3) are not built; the name comes back when they are, and the value lives in Supabase Edge Functions secrets, not Vercel |
| `AI_API_KEY` | **It came back on 2026-10-07, and it is NOT in Vercel.** This row used to read "No AI feature. `docs/plan.md` lists an AI helper under 'deliberately not in the first version'", and both halves stopped being true that day: the plan gained a "Suggest subtasks" section and an AI helper left that list. The name is still rightly absent from `.env.example` and from Vercel, because the app does not read it — the Edge Function does. See **"`AI_API_KEY`, and why production has none yet"** above, which is where it is now described. Issue #179 |
| `PUBLIC_MONITORING_DSN` | Not used, and still not — but the reasoning in this row has changed. It used to read "No monitoring or error reporting. The plan says none is collected and none is planned", and that stopped being true on 2026-10-05, when `docs/plan.md` added "Error reports to an outside service" and issue #157 built it. What is true now is narrower: the name is wrong twice over. `PUBLIC_…` is inert in Next.js, and the app reads `NEXT_PUBLIC_SENTRY_DSN` — see "Every setting the app uses" above |

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

**Eight** scripts read them today, and `scripts/staging/` holds all eight. **This said "five" and listed
five until 2026-10-08**, when the eighth was added and the count was checked by listing the directory
rather than trusting the sentence; the three rows in the middle had been missing since Build it 18.

| Short name | File | What it checks | Does it write? |
|---|---|---|---|
| `bob` | `bob-invites-to-alices-team.mjs` | an outsider is refused when he invites somebody to Alice's team | no |
| `rules` | `build-it-14-checks.mjs` | the team **read** rules, with all three accounts signed in | no |
| `tasks` | `build-it-15-checks.mjs` | the team **task** rules | **yes** — it creates tasks and deletes them again by id at the end of the run |
| `doors` | `build-it-16-checks.mjs` | the three Edge Functions refuse a token that is present but not genuine, refuse somebody who does not own the team, and answer 404 for a team that does not exist | no — every request it sends is one a function must refuse, and the forged ones carry an empty body |
| `suspend` | `build-it-16-suspend-checks.mjs` | the three Edge Functions refuse a **suspended** caller, and still answer an active one normally (issue #133) | no — every body it sends is one each function refuses on its own merits, so there is nothing to create |
| `status` | `build-it-18-invitation-status-checks.mjs` | the deployed `invite-member` writes down what happened to an invitation's email, and the team's owner can read it | **yes** — one invitation, to one fixed plus-address, and **it cannot be deleted from the script**: `invitations` has no delete policy, so the owner removes the row by hand. The statement is printed at the end of every run |
| `ai` | `build-it-20-ai-checks.mjs` | the deployed `suggest-subtasks`: what it sends, the consent setting, and today's limit | **yes**, and **it is the only one that COSTS MONEY** — metered requests to Anthropic. It creates a task and deletes it again |
| `files` | `build-it-23-attachment-checks.mjs` | the rules on the `attachments` bucket: who may read, list, sign, upload and delete, the bucket's own 5 MB and six named types, three files per task, that nothing may be replaced or renamed, and that a task cannot be deleted while a file is on it | **yes** — two tasks and up to four files, **all removed at the end**, and a judgement that lists both prefixes to prove it. One run sends about **5 MB**, nearly all of it the one deliberately oversized upload the 5 MB check needs. **Run it before `supabase db push` and after**: before, it must fail |

`suspend` needs one of `--expect-suspended` or `--expect-active`, and will not run without one: only
the owner can add or remove a row in `account_status`, so the script has to be told which state it is
looking at. Its own file explains the whole sequence, including the two SQL statements. `doors` takes
one optional extra name, `EXPIRED_ACCESS_TOKEN`, and says UNVERIFIED for that one check when it is
not set.

**`files` reads all six account names and `ALICE_TEAM_ID`** — it is the only one that signs in as all
three people and creates a task in a team, so the "Read by" column below is not exhaustive for it. Five
of the eight have a `--selftest` that needs none of these and is run by CI: `doors`, `suspend`, `status`,
`ai` and `files`.

| Variable | Read by | What it is |
|---|---|---|
| `ALICE_EMAIL` | `rules`, `tasks`, `doors`, `suspend` | `teamtasks.staging.test+alice@gmail.com`. Not secret |
| `ALICE_PASSWORD` | `rules`, `tasks`, `doors`, `suspend` | Alice's staging password. **Secret** — never printed, by that script or any other |
| `BOB_EMAIL` | `bob`, `rules`, `tasks`, `doors`, `suspend` | `teamtasks.staging.test+bob@gmail.com`. Not secret |
| `BOB_PASSWORD` | `bob`, `rules`, `tasks`, `doors`, `suspend` | Bob's staging password. **Secret** — never printed |
| `CAROL_EMAIL` | `rules`, `tasks` | `teamtasks.staging.test+carol@gmail.com`. Not secret |
| `CAROL_PASSWORD` | `rules`, `tasks` | Carol's staging password. **Secret** — never printed |
| `ALICE_TEAM_ID` | `bob`, `rules`, `tasks`, `doors`, `suspend` | The UUID of the team Bob must be refused, the team whose roster Alice and Carol must both see, the team Alice's test task is filed into, and — in `suspend` — the team Alice reads to show that an active person's reads still work. Not secret, and it changes whenever staging's seed data is reloaded |
| `CAROL_TEAM_ID` | `tasks` | The UUID of a second team that **Carol belongs to and Alice does not** — the team Carol must not be able to move Alice's task into. Carol owning a team of her own is the easy way to have one. Not secret; it must not be the same team as `ALICE_TEAM_ID`, and that script refuses to start if it is |
| `EXPIRED_ACCESS_TOKEN` | `doors`, optional | A correctly signed access token that has lapsed — the other half of issue #110, which that script cannot make for itself. **Secret while it lasts**, never printed, and the check says UNVERIFIED rather than passing when it is absent |

**`doors` was added to this list on 2026-10-04**, along with `suspend`. It was written in PR #112 and
reads the same four account names, and this table said "three scripts" until now — which is the kind
of staleness worth noticing: a reader loading the file for `doors` would have found no row telling
them which names it needs.

The pattern for any further account is the same two names per person, `<NAME>_EMAIL` and
`<NAME>_PASSWORD`, and a row here.

The staging URL and publishable key are **not** in that file: they live in `web/.env.local`, which
all five scripts read directly.

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
  back, so they are recorded here on the owner's word.
- **The two-organisation split is no longer only a decision, as of 2026-10-10.** This bullet used to
  end "whether the two projects are really in two organisations has not been checked either", with the
  split described as decided in `docs/stack.md` (decision B) and in the Budget section of
  `docs/plan.md`. **The owner performed it on 10 Oct 2026**: production was transferred into the
  `DHTA Ltd` organisation, which is on the Pro plan, and staging stayed where it was on the free plan.
  So the two projects are in two organisations on two plans **by the owner's account of an action they
  took**, which is a step up from a decision in a document and still not something anybody writing
  this has seen in a dashboard. `evidence/production-log.md`, 10 Oct, is the record.
  - **What the transfer did not break, as far as anybody checked:** the owner could still sign in to
    the live site afterwards, and the coach's production read-only connector still read the database
    afterwards. Neither is a check of the project's URL or keys, and nothing records whether either
    changed.
  - **And what it opened, which is still open:** production can now be billed, so Supabase's Spend Cap
    exists for that organisation and **nobody has set or seen it** —
    [#250](https://github.com/build-once/team-tasks/issues/250), which also carries the sentences in
    `docs/costs.md` and `docs/plan.md`'s Budget that the move has made stale.
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
- **Closed 2026-09-28 — the guard now recognises the production project.** `.claude/guard/local.json` exists
  and lists the production project reference under `production_patterns`, so the `production-access`
  rule in `.claude/guard/rules.json` can block a command or connector call that names production
  (`docs/guards.md`, "Tell the guard what production looks like"). Still worth knowing: it matches the
  project reference, not a production web address, because no domain name has been chosen yet. Guard
  files are changed by a person, never by the assistant.
- **Note — `main` is not protected yet.** Rule 4 above assumes changes cannot be pushed straight to
  `main`. On GitHub's Free plan, branch protection needs a public repository or a paid plan, and
  `team-tasks` is private. This is still open: see `docs/stack.md` (still open, D) and
  `docs/protect-main.md`. Until it is settled, "changes reach production only through the change
  flow" is enforced by habit and by the local guards in `.claude/hooks/`, which run on this machine
  only — **not** by a branch rule.
