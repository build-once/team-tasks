# Every piece of personal data this app holds, and every company that receives any of it

Written 2026-10-12 for Build it 26, from `origin/main` at `45d187b` — the merge of PR #299, which was
the head of `origin/main` when this file was started (`git log --oneline -3`, run in this session).

**What this file is, and why it is not `docs/plan.md`'s appendix.** The appendix is the *register of
decisions*: what we agreed to hold, why, and who may see it. This file is the *reading of the code and
the fourteen migrations* — built by opening every one of them in this session, not from memory and not
from the appendix. The two should agree. **Where they do not, this file says so and names the
correction**, because a privacy policy written from a document that has gone stale is a policy that
tells people something false.

**Why it exists at all.** `docs/plan.md`'s "Two gaps this table exposes" has said since 27 September
that this app "collects personal data and offers no way out", and
[#204](https://github.com/build-once/team-tasks/issues/204) adds the other half: it collects personal
data and **does not say so anywhere a person using it can reach**. A privacy policy is a list of what
is held, who receives it and for how long. This is that list, assembled so that the page can be
written from something checkable.

**What was NOT done here, said first.** No dashboard was opened. No connector was used. No browser was
used. Nothing was deployed and nothing was run against staging or production. Every row below is read
from this repository at the commit above, or is marked as somebody else's report with the date.

---

## 1. This project's own database

**Seven tables and one view in `public`, and one storage bucket.** Counted in this session by reading
`supabase/migrations/` — fourteen files, `git ls-files supabase/migrations`, which matches the coach's
production read-back of 12 October 2026 (14 migrations recorded).

**Thirty-five columns across the seven tables**, counted here column by column. Every one is listed
below; there is no "and some others".

### 1.1 `public.tasks` — 6 columns

`supabase/migrations/20260927182443_create_tasks.sql`, with `team_id` added by
`20261002133637_tasks_join_teams.sql`.

| Column | What it holds | Why it is held | How long |
|---|---|---|---|
| `id` | a uuid | the row's identity | with the row |
| `owner_id` | the `auth.users` id of the person who created the task | feature 4 — "who created each task"; and it is what every rule on this table reads to decide who may see it | with the row. **`on delete cascade`: the task goes when the account goes** |
| `title` | **free text somebody typed**, 1–200 characters, no control characters | feature 4. The box carries the "no personal details" request | with the row |
| `done` | true or false | feature 4 | with the row |
| `created_at` | an **exact** timestamp | ordering | with the row |
| `team_id` | a team, or null for a personal task | feature 5 — this is what decides who may see the task | with the row. **`on delete set null`: deleting a team returns its tasks to their creators as personal tasks** |

**Sensitive:** `title`. It is free text and people type anything into it.

### 1.2 `public.teams` — 4 columns

`supabase/migrations/20260930101343_create_teams.sql`.

| Column | What it holds | Why | How long |
|---|---|---|---|
| `id` | a uuid | identity | with the row |
| `name` | **free text**, 1–60 characters | feature 2 | with the row |
| `owner_id` | the creator's `auth.users` id | feature 2, and the "at most 3 teams" count | with the row. **`on delete cascade`** |
| `created_at` | an exact timestamp | ordering | with the row |

### 1.3 `public.team_members` — 3 columns

Same migration as the invitations table.

| Column | What it holds | Why | How long |
|---|---|---|---|
| `team_id` | a team | feature 5 — **this table is the rule** that decides who sees a team's tasks | until the membership is removed |
| `user_id` | a person | as above | **`on delete cascade`** |
| `joined_at` | an exact timestamp | — | with the row |

**It records who belongs to which group**, which is the one fact in this app that is about a
relationship rather than about a person.

### 1.4 `public.invitations` — 10 columns, and it is the table that holds OTHER PEOPLE'S addresses

`supabase/migrations/20260930193813_create_invitations.sql`, with `status` and `failure_code` added by
`20261006095847_invitation_status.sql` and a length bound added by
`20261012094500_task_cap_and_input_limits.sql`.

| Column | What it holds | Why | How long |
|---|---|---|---|
| `id` | a uuid | identity | with the row |
| `team_id` | the team | feature 3 | **`on delete cascade`** from the team |
| `email` | **the email address of somebody who may have no account at all**, stored lowercase, at most 320 characters | feature 3. It is the only way to invite a person | until accepted, or 7 days — and then **the row stays**: see the gap below |
| `token_hash` | a SHA-256 hash, 64 hex characters. **The token itself is never stored** | feature 3 — it proves the person opening the link is the one invited | with the row |
| `invited_by` | the sender's `auth.users` id | feature 3 | **`on delete cascade`** |
| `created_at`, `expires_at` | exact timestamps | the 7-day expiry, stored as an absolute moment | with the row |
| `accepted_at` | null until accepted | stops two clicks both succeeding | with the row |
| `status` | `queued`, `sent` or `failed` | "Invitation status" in the plan — so the sender can tell whether the email went | with the row |
| `failure_code` | one of four short codes, or `''` | as above, and deliberately **never the email service's own words**, which can quote the address and the message | with the row |

**Two things about this table that a privacy policy has to say and that nothing else in this project
holds:**

- **It is personal data about somebody who is not a user.** An invited address belongs to a person who
  has not signed up, has agreed to nothing, and cannot reach this app at all.
- **"Expires after 7 days" is not "deleted after 7 days".** `expires_at` makes the token unusable; **no
  row is ever removed.** Nothing in this app can delete an invitation —
  [#171](https://github.com/build-once/team-tasks/issues/171) is that gap, and it means an address a
  volunteer typed in on 30 September is still in the table today. The appendix's "How long we keep it"
  for that row says "Until accepted, or 7 days — then it expires", which is accurate about the token and
  is read by most people as a sentence about the row. **The policy must say which it means.**

### 1.5 `public.profiles` — 5 columns

`supabase/migrations/20261002122203_team_rules.sql`, with the two AI columns added by
`20261007204900_ai_suggestions_consent.sql`.

| Column | What it holds | Why | Who may read it |
|---|---|---|---|
| `user_id` | the `auth.users` id — it **is** the primary key | one profile per person | — |
| `display_name` | **a nickname, 1–40 characters**, never a real or full name | so the organiser sees "Carol", not an address | the person, **and anybody who shares a team with them** |
| `created_at` | an exact timestamp | — | as above |
| `ai_suggestions_enabled` | true or false, **false for every row** | "AI suggestions — the consent setting". This row *is* how `suggest-subtasks` knows whether a task title may leave the project | **no client role holds SELECT on this column.** The person reads their own value through `my_ai_suggestions()`; `service_role` may read and may not write |
| `ai_suggestions_changed_at` | when it last changed, or null for never | as above | as above |

### 1.6 `public.account_status` — 3 columns, and nobody can read it through the app

`supabase/migrations/20261004114313_suspend_accounts.sql`.

| Column | What it holds | Why | Who may read it |
|---|---|---|---|
| `user_id` | the suspended person | a row **is** the suspension | **nobody through the app.** `revoke all ... from anon, authenticated, service_role`, then `grant select` back to `service_role` alone, and no policy at all |
| `suspended_at` | when | so the owner knows | as above |
| `reason` | **optional free text ABOUT A PERSON**, at most 500 characters | so the owner still knows why weeks later | as above |

**`reason` is the most sensitive single column in this database after a task title**, and for a
different reason: it is text written *about* somebody, so it can name a third party who never agreed to
anything. Nothing in the app can read it, and nothing in the app writes it — the owner types it in the
dashboard.

### 1.7 `public.usage_counts` — 4 columns, and nobody can read it at all

`supabase/migrations/20261008115900_usage_counts.sql`, with `uploads` added to the fixed list by
`20261012120000_upload_daily_count.sql`.

| Column | What it holds | Why | Who may read it |
|---|---|---|---|
| `user_id` | the person | the count has to be per person | **nobody.** Every table privilege is revoked from PUBLIC, `anon`, `authenticated` **and `service_role`** |
| `feature` | `ai_suggestions`, `invitations` or `uploads` — a fixed list | the limit is per feature | as above |
| `day` | a **date**, not a timestamp, so the row cannot say what time of day anybody was active | the limit is per UTC day | as above |
| `used` | a number, at least 1 | the limit | as above |

**Kept 7 days**, removed by the same statement that counts, so the window is enforced by code and not by
anybody remembering — with the caveat
[#223](https://github.com/build-once/team-tasks/issues/223) names: the sweep only runs for a person who
comes back, so somebody who stops using the app keeps the rows they had.

**What it is, in one sentence a policy can use: a record of which days somebody used this app, and how
often, and nothing about what they did.**

### 1.8 `public.team_roster` — a view, no storage of its own

`security_invoker = true`, so it reads `teams`, `team_members` and `profiles` as the person asking. It
holds nothing; it is listed because it is the one place a team name, a nickname and a role appear
together.

---

## 2. The `attachments` bucket, and the row Storage writes about every file

`supabase/migrations/20261008191804_attachments_bucket.sql`. **Private**, 5 MB a file, 3 files a task,
100 MB a person, 30 uploads a person a day, six named types and no wildcard. Path:
`attachments/<task id>/<file name>`.

**Two things are held, and the second is the one that is easy to forget.**

**The file itself**, which is the only thing in this app **nobody read before it was stored**. A
photograph can carry the place and the moment it was taken, inside the file, and **the app does not
remove any of it** — the upload box says so.

**And a row in `storage.objects`, whose shape this project did not choose.** From Supabase's own schema
page, cited in the migration: `id`, `bucket_id`, `name`, `created_at`, `updated_at`, `metadata`,
`path_tokens`, `version`, `owner_id`. For this app that means:

| | What it holds for us |
|---|---|
| `name` | the whole path — so **the task's id and the file name the person's device gave it**. A file name is free text somebody's phone chose or somebody typed |
| `metadata` | holds the size, as `{"size": 1234}` |
| `owner_id` | the uploader. **Another place this project holds a user id**, and on a team task it need not be the same person as the task's creator. **It is a `text` column, and it has NO foreign key to `auth.users`** — see below |
| `created_at`, `updated_at` | exact timestamps |
| `last_accessed_at` | **NOT CONFIRMED whether this column exists.** Supabase's schema page does not list it; its self-hosting reference shows it; the installed client declares it and marks it `@deprecated`. **If it exists and is maintained, this project holds when each person last opened each file** — a fact about people that nothing in the plan has decided to collect. [#232](https://github.com/build-once/team-tasks/issues/232) |

**AND THE UPLOADER'S ID IS NOT A REFERENCE TO ANYTHING — read on both projects, 2026-10-12.** The
coach read every foreign key on `storage.objects` through the read-only connectors:
**`objects_bucketId_fkey` → `storage.buckets(id)` and nothing else.** `owner` is `uuid`, `owner_id` is
`text`, and **neither points at `auth.users`**, on staging or on production
(`evidence/production-log.md`, 12 Oct, row 6).

Three things that means for this register:

- **a file can outlive the account that uploaded it**, carrying a user id that no longer exists.
  Nothing in the database removes it and nothing refuses the deletion over it;
- **and such a file is then unreachable by everybody through the app** — the delete rule admits the
  uploader (no live account matches a dangling id) or the task's creator, and if the task went with the
  account there is no creator left to ask. So **removing a departing person's uploads is a step in
  `delete-account`, not something the database can be trusted with**: `docs/deletion.md` §3, step 3;
- **it also settles a "not confirmed" the attachments migration has carried since 8 October**, which
  says twice that "no page read states its type" of `owner_id` and casts both sides to text for that
  reason. It is **text**, so those casts were right.

**How long:** with the file, and the file goes with its task — the database **refuses** to delete a task
that still has files (`tasks_refuse_delete_with_files`), so there is no state in which a file outlives
the thing it was attached to. **With one limit on that, now that the foreign keys are known:** that
trigger reads `storage.objects` **by path**, so it guards files on the departing person's **own** tasks
and says nothing about files they uploaded to **somebody else's** task, whose path names a task that is
not going anywhere. **Removing a person's files when their account goes is Build it 26's job**
([#235](https://github.com/build-once/team-tasks/issues/235)) and is designed in `docs/deletion.md`.

---

## 3. Supabase Auth — the data this app did not design and cannot switch off

| What | Where | Why it is held | How long |
|---|---|---|---|
| **Email address** | `auth.users` | it is the sign-in identity (feature 1), and the only thing an invitation can be matched against | until the account is deleted |
| **Password, hashed** | `auth.users` | feature 1 | until the account is deleted |
| **Identity rows** | `auth.identities` | what a password sign-in matches | with the account |
| **Sessions and refresh tokens** | `auth.sessions`, `auth.refresh_tokens` | keeping people signed in | until sign-out or expiry |
| **Confirmation and reset links in flight** | `auth.one_time_tokens` | feature 1. **Each row is a credential with a clock on it** | until used or expired |
| **The sign-in log, with IP addresses** | `auth.audit_log_entries` | **nothing.** Supabase Auth writes it whether we want it or not | **UNSURE** — only the dashboard says, and nobody has read it |

**Four of this project's rows are things nobody chose to collect** — the sign-in log, Vercel's access
logs, Supabase's database and API logs, and the session tokens — and `docs/plan.md`'s appendix has said
so since the first version. They are listed here because a privacy policy has to describe them even
though no feature asked for them.

---

## 4. Every company that receives any of it

**Checked against `docs/architecture.md` in this session, service by service. Four of its entries are
out of date, and each is named below rather than left to be noticed** — the map still says Sentry,
Anthropic, the attachments bucket and the login emails are not installed or not configured.
[#216](https://github.com/build-once/team-tasks/issues/216),
[#181](https://github.com/build-once/team-tasks/issues/181) and
[#274](https://github.com/build-once/team-tasks/issues/274) already hold that staleness; this file does
not re-file it.

### 4.1 Supabase — everything

| | |
|---|---|
| **What it receives** | all of section 1, all of section 2, all of section 3. It *is* the database, the sign-in, the storage and the server functions |
| **Where it is held** | **production: West US (Oregon), `us-west-2`** — the owner's screenshot of 10 Oct 2026, recorded in `docs/backups.md`. The `attachments` bucket is in the same project, so the files are there too. **Staging's region: not established** |
| **Who can see it** | the owner, through the dashboard; Supabase |
| **How long** | as section 1. Supabase's own daily backups of production exist (Pro plan) and **do not include Storage** — their region is **not established** |
| **Confirmed?** | the region is owner-reported from a screenshot; everything else is read from the migrations |

### 4.2 Vercel — the app, and an access log

| | |
|---|---|
| **What it receives** | every request to the app: **IP address, browser and device, the page visited.** It serves the pages, so it sees the traffic |
| **Where** | **NOT ESTABLISHED.** No page has been read and no dashboard opened |
| **How long** | **UNSURE** — depends on the plan, and only the dashboard says |
| **Note** | Vercel holds **no secret of ours**: the Supabase URL, the publishable key, the Sentry DSN and the Turnstile **site** key are all public. `docs/environments.md` is the list |

### 4.3 Resend — invitation emails, and now everybody's own address

**This is the entry that changed most recently, and the change widens who it holds.**

| | |
|---|---|
| **What it receives — invitations** | the invited person's **address**, the sender address, a **subject**, and a plain-text body carrying **the team's name** and **the invitation link, which is a credential until it expires**. Read from `supabase/functions/invite-member/index.ts`: `POST https://api.resend.com/emails` with `{from, to, subject, text}`, text only and never HTML |
| **and on staging** | every message is redirected to `EMAIL_TEST_INBOX`, **with the real invited address in the subject** so a tester can tell which is which |
| **What it receives — the login emails** | **since 11 October 2026, on PRODUCTION only**: the **sign-up confirmation** and the **password-reset** email, sent by Supabase Auth through `smtp.resend.com` with a Resend API key as the SMTP password. So Resend now sees **the address of everybody who uses this app**, not only of people who were invited — and the body carries a confirmation or reset **link**, which is a credential while it lasts |
| **Staging** | **keeps Supabase's built-in sender** — decision M. So there is no second place holding a credential that can send email as this app |
| **Where it is held** | **NOT ESTABLISHED** |
| **How long** | **30 days**, the free plan's sending log — which is a record of **which addresses were sent what, when**, and therefore of who signed up and who has been resetting their password |
| **Who can see it** | the owner, through Resend; Resend |
| **Confirmed?** | the invitation half is read from the function's source. **The custom-SMTP half is entirely owner-reported, 11 October 2026**, and nothing in this repository can read either project's SMTP setting back. `docs/architecture.md` still says "NOT CONFIGURED ANYWHERE" |
| **What this app keeps about either login email** | **nothing.** No row, no status, no log line — which is also why the app cannot tell somebody their reset email failed |

### 4.4 Sentry — error reports. **IT IS INSTALLED, AND IT HAS RECEIVED REAL EVENTS**

**This is the correction that matters most to a privacy policy**, because three documents in this
repository still say the opposite. `docs/plan.md`'s appendix says "**Nothing is installed, so nothing
has been sent yet**" in three rows; `docs/backups.md` → "Where the data is held" says "**Sentry, if it
is ever installed**"; `docs/architecture.md`'s map says "**NOT INSTALLED YET**"; and #204's own comment
table repeats it. **All of them are stale.**

What is true at this commit, read here:

- **the package is installed**: `@sentry/nextjs` at `11.4.0`, in `web/package.json`;
- **the code exists in all three runtimes**: `web/src/instrumentation-client.ts`,
  `web/src/sentry/server-init.ts`, `web/src/sentry/edge-init.ts`, with one settings file,
  `web/src/sentry/options.ts`, and a scrub, `web/src/lib/sentry-scrub.ts`;
- **a Production or Preview build REFUSES to complete without `NEXT_PUBLIC_SENTRY_DSN`**
  (`web/src/lib/env.ts`). So a deployed build cannot be one that sends nothing;
- **events have been sent and received.** `evidence/build-it-18-sentry.md` sections 11–14: the owner
  watched three visits to a test page on a **Vercel Preview** deployment on **6 October 2026** produce
  events in Sentry, one of them dropped by `Dedupe` — which is how that integration came off the server
  allow-list.

| | |
|---|---|
| **What it receives** | the error's type, its message and its stack trace; the path of the page; browser and operating-system details; and **the signed-in person's user ID** |
| **What it must never receive** | an email address, task text, a team name, an invited address, **a file name**, a password, a session token, an invitation token, any key |
| **What is switched off, in code** | `userInfo` (which is also what would attach the caller's **IP address**), cookies, every request and response body, URL query parameters, database query data, stack-frame variables, source context lines, breadcrumbs (`maxBreadcrumbs: 0`), session replay, performance tracing, and generative-AI inputs and outputs. Each default is cited against the installed package in `web/src/sentry/options.ts` |
| **Where it is held** | **United States** — the owner's choice of 5 Oct 2026, owner-reported |
| **How long** | **NOT CONFIRMED.** Sentry publishes a free-plan retention period; that page has not been read, and **no number is written here** |
| **Who can see it** | the owner, through Sentry; Sentry |
| **Whether PRODUCTION sends** | **an inference, and labelled as one.** Production builds succeed, and `web/src/lib/env.ts` stops a Production build with no DSN — so a DSN is set in Vercel for Production. **Nobody writing this has opened the Vercel or the Sentry dashboard**, and no production event has been seen |
| **The IP setting** | `docs/plan.md` says the owner will switch on Sentry's "do not store IP" setting and leave default scrubbing on. **OWNER TO SET, NOT YET REPORTED.** So the policy must **not** claim Sentry holds no IP address: the SDK does not attach one, and whether Sentry records the sending address is a dashboard setting nobody has seen |

### 4.5 Anthropic — one task title, and only with the setting on

| | |
|---|---|
| **What it receives** | **the title of the one task the person asked about, and fixed instructions written by this app.** Read from `supabase/functions/suggest-subtasks/index.ts`: `POST https://api.anthropic.com/v1/messages`, with `model`, `system` (the fixed instructions), `messages` (the title) and `max_tokens` |
| **What it never receives** | an email address, a display name, **a user ID**, a team name, any other task, a sign-in token, a key. Nothing in the request says who asked |
| **When** | only when the person has switched **AI suggestions** on, checked **in the function**, and only on production once the key is installed — **production has no key today** |
| **Where it is held** | **NOT ESTABLISHED, and not asked** |
| **How long** | Anthropic's published figures, cited in `docs/plan.md`: deleted **within 30 days** of receipt or generation with stated exceptions, and **up to 2 years** — classification scores up to 7 years — for anything flagged as a Usage Policy violation |
| **Who can see it** | the person who pressed the button; the owner, through Anthropic's console; Anthropic |
| **Deletion** | the owner cannot search for one person's requests, **because nothing identifying the asker is sent.** That is the price of sending no user ID, and it is the right price |
| **Confirmed?** | the request body is read from the function. **STAGING has a key and the function is deployed there; production has the function and no key** — so on production the helper answers that suggestions are not available. `docs/architecture.md` still says "NOT INSTALLED YET" |

### 4.6 Cloudflare R2 — the nightly copy, as ciphertext

| | |
|---|---|
| **What it receives** | **every table, the accounts with their password hashes, and every attached file** — all of sections 1, 2 and 3, in one file, **encrypted on GitHub's runner before it leaves**. What it does **not** receive: any secret of ours, and the outside services' own records |
| **Where** | **Western Europe (`WEUR`)**, a private bucket `team-tasks-backups` with the public development URL disabled and no custom domain — owner-reported, 10 Oct 2026 |
| **How long** | **14 days**, by an R2 object lifecycle rule named `delete-after-14-days` — owner-reported for 10 Oct 2026, **never seen by anybody writing this**, and nothing in this repository can read an R2 rule. Cloudflare allows up to a day for a removal, so the real window is **up to about fifteen days** |
| **Who can open one** | only somebody holding **both** the storage key and the passphrase. **Cloudflare cannot read it.** If the passphrase is lost, no copy can ever be opened |
| **The thing a policy must say** | **a deleted account or a deleted file stays in the copies already made until they expire.** "Deleted" means gone from the app at once and gone everywhere in up to about a fortnight |
| **Confirmed?** | the job, the encryption and the restore are in this repository and are exercised in CI. **The bucket, the token, the lifecycle rule and the region are all the owner's report**, and three copies exist — one made by the schedule itself on 11 Oct 2026, and one restored |

### 4.7 Cloudflare Turnstile — the anti-robot check. **NEW SINCE 11 OCTOBER 2026**

**This is the first time an IP address leaves this project on purpose**, and that is the whole of what
it costs. The four log stores in section 3 and 4.2 are written by companies that were going to log the
request anyway; this one is sent, by us, to a company whose only job is to look at it.

**What it receives, in Cloudflare's own words.** From the
[Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/), read **2026-10-11**
and **re-read 2026-10-12** in the session that wrote this file:

> "Cloudflare Turnstile processes a variety of client-side signals ("Signals") such as client IP
> address, TLS Fingerprint, User-Agent Header and Sitekey and associated origin"

and

> "The purpose of collecting these Signals is not to identify, profile or target any individuals but
> solely to detect and block bots"

And from the developer documentation,
[Turnstile](https://developers.cloudflare.com/turnstile/), read 2026-10-11:

> "Turnstile does not access, store, or transmit user communications, form entries, or other page
> inputs."

**So the password typed into the box beside the widget is not part of this**, and neither is the
address.

| | |
|---|---|
| **When** | on **three screens only**: sign-up, sign-in and password reset. Not on the invite form, not on Suggest subtasks, not on the upload box — all three of those are behind a sign-in already |
| **What this app stores about it** | **nothing.** The token the widget produces goes to Supabase Auth and is never written to a row, a log line or an error report. There is no column anywhere in this project for anything Cloudflare collects |
| **Where it is held** | **NOT ESTABLISHED** |
| **How long Cloudflare keeps a Signal** | **NOT CONFIRMED, and no number is written here.** The addendum, re-read on 2026-10-12, **states no retention period.** Turnstile's own analytics are kept "7 days maximum" on the free plan ([Plans](https://developers.cloudflare.com/turnstile/plans/), read 2026-10-11), which is a different thing from a Signal |
| **Whether Cloudflare sells Signals or uses them for advertising** | **NOT CONFIRMED.** The addendum says the purpose "is not to identify, profile or target any individuals" and **carries no sentence saying the data is not sold.** Read the main Cloudflare privacy policy for that, or write that it could not be found |
| **Cookies** | section 5 below |
| **State** | **ON in both projects** since 11 Oct 2026 — staging with Cloudflare's dummy secret key, production with the real one — and a tokenless sign-in is refused with HTTP 400 `captcha_failed`. All owner-reported; `evidence/captcha.md` is the record. `docs/architecture.md` still says "CAPTCHA switched on in neither project" |

### 4.8 GitHub — the code, and one machine that holds everything for a few minutes

Not a service that receives *users'* data in the ordinary course — but the nightly job runs there, and
**for the few minutes it runs, production's entire database is in plaintext on a machine this project
does not own**, in a region nobody has established. The job uploads no artifact and prints only names,
byte counts and statuses, because this repository is public. It is in this list because leaving it out
would make the list look complete when it is not.

---

## 5. Cookies and browser storage

**The whole list, from the code and from Cloudflare's own documentation. Nothing is concluded about a
banner until the last row is settled** — see the verdict at the end, which is deliberately not "no
banner needed".

### 5.1 What this app and its libraries set

| Name | Who sets it | What it is for | Essential? |
|---|---|---|---|
| `sb-<project-ref>-auth-token`, and its numbered chunks `…​.0`, `…​.1`, … | `@supabase/ssr` 0.12.7, through `web/src/lib/supabase/proxy.ts` and `web/src/lib/supabase/server.ts`. The name shape is read off the installed package: `storageKey: 'sb-<project-ref>-auth-token'`, in `web/node_modules/@supabase/ssr/dist/main/clearAuthCookiesAtScopes.js`, and `isChunkLike` is what splits it | **the sign-in itself.** It carries the access and refresh token | **Yes.** Feature 1 does not work without it |
| `<storageKey>-code-verifier`, `<storageKey>-flow-<flowId>-code-verifier`, `<storageKey>-flows-code-verifier` | the same package — the three names are listed in its own `cookies.js` header | the PKCE verifier, which is **why a reset link only worked in the browser that asked** until the token-hash links arrived | **Yes**, while a sign-in or a link exchange is in flight |
| `reset-link-used` | **this app's own code**: `web/src/lib/password-reset.ts` (`RESET_MARKER_COOKIE`), set in `web/src/app/auth/reset/route.ts` and `web/src/app/auth/confirm/actions.ts` | it is how `/reset-password` knows a reset link has just been accepted, so the form is not drawn for somebody who merely happens to be signed in. `httpOnly`, `sameSite: lax`, **900 seconds** | **Yes**, and it is the only cookie this app writes itself |

**Browser storage: none found.** A search of `web/src` for `localStorage` and `sessionStorage` in this
session returns **no match**. The browser Supabase client is `@supabase/ssr`'s, which keeps the session
in cookies — that is the whole reason the three names above exist.

**NOT CONFIRMED, and it is one look at one screen:** whether `@supabase/ssr` sets `httpOnly` on the
session cookie by default (this app does not pass cookie options), and whether the Sentry browser SDK
writes anything to `sessionStorage` at the settings this app uses. Session replay — the one Sentry
feature that certainly would — is switched off by name.

### 5.2 What Turnstile may set, which is the row that decides the verdict

**Cloudflare's Turnstile pages do not name a cookie.** The Privacy Addendum points elsewhere —

> "For more information about the cookies used by Cloudflare, please check our Cookie Policy and our
> Turnstile Developer Docs"

— and the developer documentation, re-read on 2026-10-12, says nothing about cookie names, purposes or
lifetimes.

**Cloudflare's own cookie list does name candidates**, from
[Cloudflare cookies](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/),
read **2026-10-12** in the session that wrote this file. It describes the whole set as **strictly
necessary** and says:

> "Cloudflare does not track users from site to site or from session to session."

The three that could plausibly appear on a page carrying a challenge widget:

| Name | Cloudflare's stated purpose | Lifetime, as published |
|---|---|---|
| `cf_clearance` | "Challenge completion proof". The page adds that it "is required for JavaScript detections" and "is set with `SameSite=None; Secure; Partitioned` so that challenge state is preserved across cross-site requests" | not stated on that page |
| `__cf_bm` | Bot Management / Bot Fight Mode detection | 30 minutes of inactivity |
| `cf_chl_rc_i`, `cf_chl_rc_ni`, `cf_chl_rc_m` | "Challenge Platform internal diagnostics" | not stated |

**That page does not mention Turnstile by name**, so which of them — if any — a Turnstile widget
embedded in this app actually sets is **NOT CONFIRMED**. It is the cheapest unknown on this page to
settle: **open production's or a Preview's sign-in screen in a browser and read the cookie jar.**
Nothing in this repository can do it, and nobody writing this has opened a browser.

### 5.3 And one more that is not ours

**Vercel may set a cookie on Preview deployments** for its toolbar or deployment protection. **NOT
ESTABLISHED** — no page read and no dashboard opened. It would not appear on production for an ordinary
visitor, which is why it is last; it still has to be checked before a cookie list is published.

### 5.4 The verdict, which is not a verdict yet

**What IS established:**

- **there is no analytics and no tracker.** `docs/plan.md`'s "Analytics: stays at none" is a decision,
  and a search of `web/src` finds no analytics package; the only outside script the app loads is
  Cloudflare's `challenges.cloudflare.com/turnstile/v0/api.js`, on three screens;
- **every cookie this app sets itself is strictly necessary** — a session, a PKCE verifier, and a
  15-minute marker that decides what one screen draws;
- **nothing this app sets is used to profile anybody**, because nothing reads any of them for anything
  but signing in.

**What is NOT established, and what a banner decision needs:**

1. **which Turnstile cookies actually land**, on which screens, with which lifetimes — one look at a
   rendered screen;
2. **whether Vercel sets anything** on the addresses the app is served at;
3. **whether `@supabase/ssr` and the Sentry browser SDK write to browser storage** at this app's
   settings.

**So this file does not say "no banner is needed", and the page must not either until those three are
answered.** What it does say is that if the Turnstile cookies turn out to be the ones above, and
Cloudflare's own categorisation of them as strictly necessary holds, then nothing in this app's cookie
list is there for marketing, analytics or profiling — and **whether that means no consent banner is a
legal judgement, not a reading of the code**, which is question 5 in `docs/plan.md`'s Build it 26
decisions.

---

## 6. Where this file disagrees with `docs/plan.md`'s appendix

Listed so the appendix can be corrected rather than quietly contradicted. Four of the five are
staleness that already has an issue.

| What the appendix says | What is true | Where it is filed |
|---|---|---|
| Sentry: "Nothing is installed, so nothing has been sent yet" (three rows) | installed at `@sentry/nextjs` 11.4.0, and events were seen arriving on a Preview on 6 Oct 2026 | **corrected in this change**, and [#216](https://github.com/build-once/team-tasks/issues/216) holds the same staleness on the costs and architecture pages |
| Suggest subtasks: "Nothing is installed, so nothing has been sent yet" | staging has the key and the function; production has the function and no key | [#195](https://github.com/build-once/team-tasks/issues/195) |
| The CAPTCHA row: "NOTHING IS INSTALLED" | on in both projects since 11 Oct 2026 | **corrected in this change** |
| An invitation's address: "Until accepted, or 7 days — then it expires" | the **token** expires; **the row is never deleted**, and nothing in the app can delete one | [#171](https://github.com/build-once/team-tasks/issues/171) |
| Tables marked *(proposed)* | all seven exist and are applied to both projects | [#78](https://github.com/build-once/team-tasks/issues/78) |

---

## 7. Not confirmed, gathered

Everything above that nobody has settled, in one list, so the privacy page can be written around it
rather than over it.

1. **How long Sentry keeps an error report on the free plan.** No Sentry page has been read.
2. **Whether Sentry's "do not store IP" setting is on.** Owner to set, not yet reported — so the page
   must not claim it.
3. **Whether production's Sentry DSN is set.** Inferred from the build refusing without one; no
   dashboard opened.
4. **How long Cloudflare keeps a Turnstile Signal**, and **whether it sells them or uses them for
   advertising.** The addendum states neither.
5. **Which cookies Turnstile sets on this app's three screens.** One look at one rendered screen.
6. **Whether Vercel sets a cookie**, and **where Vercel holds its access logs, and for how long.**
7. **Where Anthropic holds a request**, and **where Resend holds its sending log.** Neither asked.
8. **Where Supabase's own daily backups of production are held.**
9. **Whether `storage.objects` has a `last_accessed_at` column**, and whether it is maintained — because
   if it is, this project holds when each person last opened each file.
10. **How long the three log stores keep data** — the sign-in log, Vercel's access logs, Supabase's
    database and API logs. Only each dashboard says.
11. **Whether "Confirm email" is on at all**, on either project. `docs/claims.md` records it as not
    verified.
12. **Whether `@supabase/ssr` sets `httpOnly` on the session cookie** at this app's settings, and
    **whether the Sentry browser SDK touches browser storage.**
