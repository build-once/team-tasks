# Rate limits, and every input the server accepts

Build it 25, part 0. Written 2026-10-11 from `main` at commit
`8d99e05cda14fdca66fff626d354407496f2fde2` ("Merge pull request #279 from
build-once/fix/restore-honest-and-overdue-watcher", 2026-10-11 12:17:57 +0100).

**Documents only. Nothing was built, changed, deployed or run against any project to write this
file.** No code, no test, no workflow and no migration was touched; nothing was run against staging
or production; no MCP connector and no browser was used. What was read is this repository, at that
commit, and the vendor pages cited below.

**This file is an inventory and a set of proposals. It decides nothing.** Every number marked
**PROPOSED** is for the owner, and every one of them is listed at the top of the pull request that
adds this file. A limit nobody chose is not a limit.

### About the quotations

Every vendor quotation below was read on **2026-10-11** through this session's page-fetching tool,
which turns a page into text and answers a question about it. Short quotations are reproduced as
that tool returned them. Two pages — Supabase's Auth rate limits, and Cloudflare's Turnstile
testing page — were fetched **twice, with different questions**, and the two answers agreed on
every figure this file relies on. That is the strongest check available here and it is not the same
as reading the page: **anybody about to depend on an exact wording should open the page.** Each
quotation carries its URL for that reason.

---

## 1. What limits each abusable action today

### The four places a limit can live, and what each kind can and cannot do

Read the table with these in mind, because "what limits it" is nearly always one of them and they
are not interchangeable.

| Where | What it is | What it cannot do |
|---|---|---|
| **Supabase Auth's own limits** | Counted by Supabase, per IP address or per user, on its own endpoints | Nothing of ours configures it in this repository. It is a **dashboard setting**, so this repository cannot say what either project is actually set to |
| **`usage_counts`** | One row per person, per feature, per UTC day, written by `public.count_daily_use()` — `supabase/migrations/20261008115900_usage_counts.sql` | Only covers a person who is **signed in**, because the row is keyed by `user_id`. It is **deployed nowhere**: both functions that write it are in this repository and in no Supabase project |
| **A database rule** | A check constraint, a unique index, a policy, or a `security definer` function a policy calls | Caps **how many rows exist**, never **how fast somebody asks**. "At most 3 teams" does not stop 3,000 attempts |
| **Nothing** | The honest answer for most of the rows below | — |

**The distinction that matters most in this table: a cap on rows is not a rate limit.** "At most 3
teams per person", "at most 20 pending invitations per team", "3 files per task" and "100 MB per
person" are all caps on what the database ends up holding. None of them stops a loop making the
request ten thousand times and being refused ten thousand times — and each refusal is still a
function invocation, a database read, and on Vercel a request somebody paid for.

### Supabase Auth's own limits, as published

From [Auth Rate Limits](https://supabase.com/docs/guides/auth/rate-limits), read 2026-10-11. The
rows that touch this app; the page also lists SMS, MFA, anonymous sign-in and Web3 rows, none of
which this app uses.

| Operation | Path | Limited by | Customizable | Limit, as published |
|---|---|---|---|---|
| Emails sent by Supabase Auth | All email-sending Auth endpoints | Project | Custom SMTP or Send Email hook | "2 emails per hour with the built-in email provider. You can configure this limit when you use custom SMTP or the Send Email hook." |
| Sign-ups and sign-ins | `/auth/v1/signup` `/auth/v1/recover` `/auth/v1/resend` `/auth/v1/magiclink` `/auth/v1/otp` `/auth/v1/user` | IP Address | Yes | "Defaults to 30 requests per 5 minutes, with bursts up to 30 requests." |
| Signup confirmation request | `/auth/v1/signup` | User | Yes | "Defaults to a 60 seconds window before a new request is allowed for the same user." |
| Password reset request | `/auth/v1/recover` | User | Yes | "Defaults to a 60 seconds window before a new request is allowed for the same user." |
| Verification requests | `/auth/v1/verify` | IP Address | Yes | "Defaults to 30 requests per 5 minutes, with bursts up to 30 requests." |
| Token endpoint requests | `/auth/v1/token` | IP Address | Yes | "Defaults to 150 requests per 5 minutes, with bursts up to 30 requests. This covers password, refresh token, ID token, and PKCE grants." |

**Where they are set, and why no number above is a fact about this app:** "You can modify
customizable rate limits by navigating to **Authentication** > **Rate Limits** in your project
dashboard" (same page). Every row marked *Customizable: Yes* is therefore a **default** that either
project may already have been moved away from. **Nobody has read either project's Rate Limits page,
and nothing in this repository can.** So for each of these the honest statement is: *the published
default is X; what staging and production are set to is unread.* Section 3 puts both readings on the
owner's by-hand list.

**One trap in that table, and it is worth more than its size.** The row called **"Sign-ups and
sign-ins"** does **not** cover this app's sign-in. Its paths are `/auth/v1/signup`, `/auth/v1/recover`,
`/auth/v1/resend`, `/auth/v1/magiclink`, `/auth/v1/otp` and `/auth/v1/user` — and a password sign-in goes
to **`/auth/v1/token?grant_type=password`**, which is the **"Token endpoint requests"** row: **150** per 5
minutes, not 30, and the row's own words say it "covers password, refresh token, ID token, and PKCE
grants". So **the limit on guessing a password is the loosest of the three** on this app's screens, and
somebody reading the table by its row names would conclude the opposite.

**And the one row that is not a default but a hard fact about today: 2 emails per hour, project-wide,
on the built-in sender.** Not per person — per project. Which means that on production, with the
built-in sender, **the third person to ask for a password reset in an hour gets no email**, and the
app tells all three the same sentence because that sentence is deliberately identical whatever
happened. Section 4 is what fixes it.

**Worse than the rate, and the finding that makes section 4 urgent rather than tidy.** From
[Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), read 2026-10-11: "Unless you
configure a custom SMTP server for your project, Supabase Auth will refuse to deliver messages to
addresses that are not part of the project's team." Read against this app: **on production, as it
stands, a volunteer signing up or resetting their password receives nothing at all**, because their
address is not on the Supabase project's team. It is not a rate limit biting; it is a refusal to
deliver. Nobody has observed this on production — nobody has signed up — so it is a reading of that
sentence and not a measurement. The one run that would settle it is in section 5.

### The inventory

Every action a bot could abuse. **"What the person sees" is the sentence this app actually draws
today**, with the file it comes from.

#### Not signed in

| 1. Sign-up |  |
|---|---|
| **The request** | `POST /auth/v1/signup`, from `supabase.auth.signUp` — `web/src/app/auth/actions.ts:134` |
| **What limits it today** | Supabase Auth: 30 requests per 5 minutes **per IP** (published default), a 60-second window **per user**, and the project-wide email limit. Plus this app's own password rule: at least 8 characters, checked on the server before anything is sent — `web/src/app/auth/actions.ts:127`, `web/src/lib/password-reset.ts:91,107` |
| **Where that limit lives** | Supabase Auth's own limits (dashboard), except the password rule, which is ours |
| **Nothing of ours limits the rate** | A loop can create accounts up to whatever Auth's per-IP limit is set to, from as many IP addresses as it has |
| **What the person sees** | "That did not work. Check the email address and password and try again." (`web/src/app/signup/page.tsx:57-58`), or the password sentence "A password needs at least 8 characters." (`web/src/lib/password-reset.ts:100`). **A rate-limit refusal gets the first sentence**, which says nothing about waiting |
| **PROPOSED** | **Turnstile** (section 3 of `docs/plan.md`, added in this change). And **read, then lower, the per-IP sign-up limit** — 30 per 5 minutes is sized for an app with sign-ups; this one expects **six accounts in total**. A proposal of **5 per 5 minutes** is in the owner's list |

| 2. Sign-in |  |
|---|---|
| **The request** | `POST /auth/v1/token?grant_type=password`, from `supabase.auth.signInWithPassword` — `web/src/app/auth/actions.ts:75` |
| **What limits it today** | Supabase Auth's token endpoint: 150 requests per 5 minutes **per IP** (published default). **Nothing else.** No lockout after N wrong passwords exists in this repository, and whether Auth has one was not read |
| **Where that limit lives** | Supabase Auth's own limits (dashboard) |
| **What the person sees** | "That email and password don't match. Check them and try again." — `web/src/app/login/page.tsx:55`. A rate-limit refusal gets the same sentence, deliberately: `signIn` has one failure path and does not show Supabase's text |
| **PROPOSED** | **Turnstile.** And **read, then lower, the token-endpoint limit**: 150 per 5 minutes per IP is 30 password guesses a minute against six accounts. **20 per 5 minutes** is in the owner's list. Also **leaked-password protection**, which is a switch rather than a limit — see below |

| 3. Password reset request |  |
|---|---|
| **The request** | `POST /auth/v1/recover`, from `supabase.auth.resetPasswordForEmail` — `web/src/app/auth/actions.ts:191` |
| **What limits it today** | Supabase Auth: 30 per 5 minutes **per IP**, a 60-second window **per user**, and the project-wide 2-emails-per-hour on the built-in sender |
| **Where that limit lives** | Supabase Auth's own limits (dashboard) |
| **What the person sees** | "If that address has an account, we've sent a link" — `web/src/lib/password-reset.ts:29`. **One sentence for every outcome, including a rate limit**, and that is a deliberate promise rather than an oversight: `requestPasswordReset` has a single exit and `scripts/password-reset-check.mjs` reads its source and refuses a second branch (`web/src/app/auth/actions.ts:150-201`) |
| **The cost of that promise, stated** | Somebody whose reset email was dropped by the 2-per-hour limit is told the same thing as somebody whose email went. They will wait for a message that is never coming. **Section 4 is the fix**; a different sentence is not, because telling the two apart would also tell somebody which addresses have accounts |
| **PROPOSED** | **Turnstile**, and **section 4** (custom SMTP), which is what makes the sentence true more often |

| 4. Email confirmation resend |  |
|---|---|
| **The request** | **There is none.** `POST /auth/v1/resend` exists on Supabase Auth; nothing in this app calls it. Checked across `web/src` in this session: no `auth.resend` anywhere |
| **What limits it today** | Auth's own limits would, if anything called it: 30 per 5 minutes per IP, plus the email limit |
| **What the person sees** | Nothing, because there is no control. Somebody whose confirmation email was dropped by the 2-per-hour limit sees "Check your email. We've sent you a link to confirm your account." (`web/src/app/signup/page.tsx:64-65`) and has **no way to ask again** except signing up again with the same address |
| **PROPOSED** | **Nothing here.** Adding a resend button is a new control on a screen and so a plan change, and it is the wrong fix for the right problem: what is actually wrong is the sender, which section 4 replaces. Recorded rather than proposed, so the gap is on the record |

| 5. Accepting an invitation |  |
|---|---|
| **The request** | `POST /functions/v1/accept-invite`, body `{ token }` — `web/src/app/invite/[token]/actions.ts`, function `supabase/functions/accept-invite/index.ts` |
| **What limits it today** | **Signed-in only** — `verify_jwt = true` (`supabase/config.toml:49`) and `auth: "user"`. Then: the token's own size, 32 random bytes from `crypto.getRandomValues` (`supabase/functions/invite-member/index.ts:108,680`), stored only as a SHA-256 hash with a unique index; a 7-day expiry; `accepted_at` claimed exactly once. **No rate limit of any kind, and no count in `usage_counts`** |
| **Where those limits live** | Database rules, plus the platform's token check |
| **What the person sees** | The `/invite/[token]` page's wording, chosen from the function's `reason` |
| **Is the missing rate limit a hole?** | **For guessing, no.** 256 bits is not guessable, and a wrong token is a 404. **For cost, yes, and it is small**: every attempt is a signed-in caller spending one Edge Function invocation and one indexed database read, and nothing counts them. A signed-in person can do that in a loop |
| **PROPOSED** | **Nothing, and the reason is written down so it is a decision.** A daily count here would need a third `feature` word, which is a check constraint and so a migration, to bound something that spends no money and leaks nothing. If the platform's own invocation limits are ever read (section 5), revisit |

#### Signed in

| 6. create-team |  |
|---|---|
| **The request** | `POST /functions/v1/create-team`, body `{ name }` — `web/src/app/teams/actions.ts:107` |
| **What limits it today** | **At most 3 teams per owner**, counted with the secret key before the insert — `supabase/functions/create-team/index.ts:66,272-298`. The name's length, twice: the function (`:64-65,253-261`) and the database (`teams_name_length`, `supabase/migrations/20260930101343_create_teams.sql:46`). A suspended caller refused first (`:215-235`). **No rate limit, and no count in `usage_counts`** |
| **Where those limits live** | A server function for the count; a check constraint for the name |
| **The number** | 3 |
| **What the person sees** | "You own 3 teams, the most allowed." — `supabase/functions/create-team/index.ts:297`, drawn in the page's banner |
| **PROPOSED** | **Nothing.** This is the one row where a cap on rows really is enough: the fourth attempt costs one count query and writes nothing, forever. A rate limit would bound the attempts and the attempts are cheap |

| 7. invite-member |  |
|---|---|
| **The request** | `POST /functions/v1/invite-member`, body `{ team_id, email }` — `web/src/app/teams/actions.ts:318` |
| **What limits it today** | **20 per person per UTC day** — `supabase/functions/_shared/limits.ts:118-121`, counted immediately before the send (`invite-member/index.ts:1436-1443`), **a retry included**. **At most 20 pending per team** (`:107,1103-1108`). One pending invitation per address per team (`invitations_one_pending_per_email`). A 7-day expiry. Only the team's owner (`:988-990`). Address shape and length (`:945-950`). **And Resend's own quota: 100 emails a day, 3,000 a month, 10 requests a second** |
| **Where those limits live** | `usage_counts` for the daily 20; database rules for the rest; the vendor for the quota |
| **THE THING TO KNOW** | **The daily 20 is deployed nowhere.** The function that counts is in this repository and in no Supabase project — `docs/plan.md`'s "Unverified" list says so in full. So **today the only limits actually running are the 20-pending cap and Resend's quota** |
| **What the person sees** | "You've reached today's limit. It resets tomorrow." (`_shared/limits.ts:167-168`) — **once it is deployed**. Today: "This team has 20 invitations waiting, the most allowed. Wait for some to be accepted or to expire." (`invite-member/index.ts:1105`) |
| **PROPOSED** | **Deploy what exists.** No new number. The gap here is not a missing limit, it is a written limit that is not running |

| 8. suggest-subtasks |  |
|---|---|
| **The request** | `POST /functions/v1/suggest-subtasks`, body `{ task_id }` |
| **What limits it today** | **20 per person per UTC day** (`_shared/limits.ts:118-121`), counted immediately before the paid call (`suggest-subtasks/index.ts:1620-1627`). A **per-isolate one-call-at-a-time lock** (`beginCall`, `:1512`) — which [#186](https://github.com/build-once/team-tasks/issues/186) records as "a courtesy, not a control". The consent setting, **off for everybody**. **No production key.** And Anthropic's 5-dollar monthly spend limit |
| **Where those limits live** | `usage_counts`, a `Set` in one isolate's memory, a database column, an absent secret, the vendor |
| **THE THING TO KNOW** | **The daily 20 is deployed nowhere**, as above. What actually stops production spending money today is that **production has no `AI_API_KEY`** |
| **What the person sees** | "You've reached today's limit. It resets tomorrow." once deployed; "Suggestions aren't available right now." for `busy` and for `not_configured` |
| **PROPOSED** | **Deploy what exists**, and nothing else. [#184](https://github.com/build-once/team-tasks/issues/184) is still open: asking is a GET, so a reload asks again |

| 9. Attachment upload |  |
|---|---|
| **The request** | The browser uploads **straight to Storage as the signed-in person** — `web/src/app/tasks/AttachFile.tsx`, the app's only client component. Nothing of ours is in the path |
| **What limits it today** | **3 files per task** and **100 MB per person**, both counted by `public.attachments_may_add()` and called from the `INSERT` policy — `supabase/migrations/20261008191804_attachments_bucket.sql:488,784`. **5 MB per file** and **six named types**, by the bucket (`:183-197`). An unknown size counts as 5 MB, never zero (`:325-335`). Two advisory locks, so simultaneous uploads take turns |
| **Where those limits live** | A `security definer` function a policy calls, and the bucket's own settings |
| **No rate limit at all** | And here that is a real gap rather than a cheap-attempt one. **Upload, delete, upload, delete never exceeds 100 MB and spends egress and ingress every time.** `docs/costs.md` already records that the attachment limits do **not** keep this app inside Supabase's 5 GB monthly egress allowance; nothing bounds the number of uploads |
| **What the person sees** | "That task already has 3 files, which is the most it can have. Delete one first." / "That file is too big. Each file can be up to 5 MB." / the no-room sentence — all in `web/src/lib/attachments.ts:418-452`. **Nothing says "too often", because nothing counts** |
| **PROPOSED, AND IT IS A PLAN CHANGE** | **A daily count of uploads per person, in `usage_counts`, at 30 a day.** `docs/plan.md` currently decides the opposite in as many words — "It is still not the daily limits of Build it 22, and still not counted in `usage_counts`", on the argument that storage is a stock and not a flow. **That argument is sound about storage and silent about traffic**, which is what this proposal is aimed at. It needs a third `feature` word, so a migration, and it needs the plan changed first (rule 9). **The owner's call, and it is in their list** |

| 10. Adding and changing tasks |  |
|---|---|
| **The request** | `INSERT` / `UPDATE` / `DELETE` on `public.tasks` over the Data API, with the publishable key and the person's own session — `web/src/app/tasks/actions.ts:100,192,261,333,452` |
| **What limits it today** | Row-level security decides **whose** rows (four policies, one per command). The title: not blank and at most 200 characters (`tasks_title_not_blank`, `tasks_title_length` — `supabase/migrations/20260927182443_create_tasks.sql:31,35`). The column guard trigger, for `owner_id`, `id`, `created_at` and `team_id`. **No cap on how many tasks one person may have, and no rate limit of any kind** |
| **Where those limits live** | Database rules only |
| **What the person sees** | The `problem=` sentences in `web/src/lib/tasks.ts`. **None of them is about frequency or quantity** |
| **The exposure, plainly** | One signed-in volunteer, or one loop with one volunteer's session, can insert rows into production's `tasks` table until the database fills. At 200 characters a row that is slow, and it is not bounded by anything this app has. **Whether Supabase applies any limit of its own to the Data API was not read** (section 5) |
| **PROPOSED, AND IT IS A PLAN CHANGE** | **A cap on live tasks per person: 500.** Enforceable the way "at most 3 teams" is not — it is a count of the caller's own rows, so a `security definer` function called from the `INSERT` policy does it, exactly as `attachments_may_add()` already does, with no Edge Function and no secret key. 500 is sized for a volunteer's list and is not 20: a person who hits it has done something nobody designed for. **The owner's call** |

#### Not an action, but it belongs in this table

| 11. Supabase's password rules and leaked-password protection |  |
|---|---|
| **What this app checks** | At least 8 characters, in `passwordProblem` (`web/src/lib/password-reset.ts:107`), called by `signUp` **before** anything is sent and by `setNewPassword` before the change |
| **What Supabase can check** | A minimum length, required character classes, and leaked passwords. From [Password security](https://supabase.com/docs/guides/auth/password-security), read 2026-10-11: "Set a large minimum password length. Anything less than 8 characters is not recommended"; "Prevent the use of leaked passwords. Supabase Auth uses the open-source HaveIBeenPwned.org Pwned Passwords API to reject passwords that have been leaked and are known by malicious actors"; and "Leaked password protection is available on the Pro Plan and above" |
| **What either project is set to** | **Unread.** The page does not publish a default minimum length either, so **no number is written here**. Both are dashboard settings |
| **PROPOSED** | **Switch leaked-password protection on, on production**, which is now a Pro organisation and so can have it. And **set the minimum length to 8 in Auth's own settings**, so the rule this app states on its sign-up screen is kept by the server that stores the password and not only by the app in front of it. Neither is a rate limit; both belong on the same by-hand pass |

### What nothing in this repository limits, and what that leaves

Said plainly, because the table above is long enough to read as reassurance:

- **The Data API.** Every read and write of `tasks` and `profiles` goes to `/rest/v1` with the
  publishable key. RLS decides *what* comes back; nothing in this project decides *how often*.
- **Edge Function invocations.** Four functions, all signed-in-only. Nothing counts invocations
  except `usage_counts`, which counts two features and is deployed nowhere.
- **Storage reads and writes.** A signed link is made on demand by a server action; nothing counts
  how many a person asks for, and each one is a request to Supabase.
- **Anything on Vercel.** The pages and server actions are served by Vercel. Whether any firewall or
  rate rule is configured there was **not read**, and nothing in this repository configures one.

---

## 2. Every place the server accepts input

### The four kinds of entry point, and all of them

| Kind | Which | Who the request runs as |
|---|---|---|
| **Server functions** | `create-team`, `invite-member`, `accept-invite`, `suggest-subtasks` | The caller's verified token for identity; `service_role` for the writes, which **bypasses every policy** |
| **Database functions the app can call** | `public.is_team_member(uuid)`, `public.my_ai_suggestions()`, `public.attachments_may_add(text,text)`, `public.attachments_task_id(text)`, `public.attachments_file_bytes(text)` — `authenticated` holds EXECUTE. **And `public.count_daily_use(uuid,text,integer)`, which it does not**: EXECUTE is revoked from `PUBLIC`, `anon` and `authenticated`, because the limit is an argument | The caller, except where `security definer` makes it the owner |
| **Tables the app writes directly** | `public.tasks` (insert, update, delete) and `public.profiles` (insert, update). **Nothing else**: `teams`, `team_members`, `invitations`, `account_status` and `usage_counts` have no insert, update or delete policy for any client role | The signed-in person, through RLS |
| **File uploads** | `storage.objects` in the `attachments` bucket, **straight from the browser as the signed-in person** | The signed-in person, through three policies on `storage.objects` |

### The four the book asks for: all four already hold

This is the first and most useful finding of section 2, so it goes first.

| The book asks for | Already there? | Where |
|---|---|---|
| **Task title not empty** | **YES** | `constraint tasks_title_not_blank check (btrim(title) <> '')` — `supabase/migrations/20260927182443_create_tasks.sql:31`. `btrim`, so a title of spaces is empty rather than three characters |
| **Task title at most 200 characters** | **YES** | `constraint tasks_title_length check (char_length(title) <= 200)` — same file, line 35. `char_length`, so it counts **characters** and not bytes or UTF-16 units |
| **Team name at most 60** | **YES** | `constraint teams_name_length check (char_length(name) between 1 and 60)`, beside `teams_name_not_blank` — `supabase/migrations/20260930101343_create_teams.sql:45-46` |
| **Display name at most 40** | **YES** | `constraint profiles_display_name_length check (char_length(display_name) between 1 and 40)`, beside `profiles_display_name_not_blank` — `supabase/migrations/20261002122203_team_rules.sql:173-175` |
| **Invitation email shaped like an address** | **YES** | `constraint invitations_email_shape check (email like '%_@_%.__%')`, beside `invitations_email_lowercase` and `invitations_email_not_blank` — `supabase/migrations/20260930193813_create_invitations.sql:72-74` |

**So Build it 25's input chapter asks this app for five things it has had since the migration that
created each table.** That is worth saying rather than quietly ticking off: these were put in when
the columns were made, each with a comment saying why, and three of them are **backstops** behind a
function that checks the same thing and returns a readable sentence.

**And the copies in the app agree with them, which is the other half of a constraint being useful.**
`TITLE_MAX = 200` (`web/src/lib/tasks.ts:29`), `NAME_MAX = 60` (`web/src/lib/teams.ts:36`),
`DISPLAY_NAME_MAX = 40` (`web/src/lib/teams.ts:236`), `EMAIL_MAX = 320` (`web/src/lib/teams.ts:223`),
`NAME_MIN/NAME_MAX = 1/60` (`supabase/functions/create-team/index.ts:64-65`). **A copy is a copy**:
each of those files says in its own comment that the database is what decides, and
`web/src/app/teams/actions.ts:179-182` names the one place where the two genuinely differ —
JavaScript counts UTF-16 units and `char_length` counts characters, so a name of emoji can pass the
app's check and be refused by the database, which that action reports rather than swallows.

### Field by field

**How to read the "Missing" column**: it says what is *not* checked by the database or by a server
function. A thing checked only in a form or only in an `<input>` attribute counts as missing, for
the reason [#197](https://github.com/build-once/team-tasks/issues/197) already established about the
password rule — "an attribute in a page, which a post made by hand skips entirely".

#### `public.tasks` — written directly by the app

| Field | Checked today | Missing |
|---|---|---|
| `title` | Not blank; at most 200 characters — `20260927182443_create_tasks.sql:31,35`. Trimmed and re-checked in the action — `web/src/app/tasks/actions.ts:53,71,239,245` | **Control characters and newlines are allowed.** A title may contain `\n`, `\t` or a zero-width character, which a screen draws as something other than what it holds |
| `owner_id` | `not null default auth.uid()`, foreign key to `auth.users` with `on delete cascade`, and **never sent by the app** (`actions.ts:100-103`); the trigger refuses any change — `20261002133637_tasks_join_teams.sql:315-318` | Nothing |
| `done` | `boolean not null default false`; the action reads the form field as `=== "true"` — `actions.ts:164` | Nothing |
| `team_id` | Foreign key to `teams`, `on delete set null`; uuid shape checked before the query (`isTeamId`, `web/src/lib/tasks.ts:65`); the trigger requires a team the row's **owner** belongs to, on insert and on move — `20261002133637_tasks_join_teams.sql:287-308,330-375`; the `with check` requires the finished row to be personal-and-yours or in a team you are in | Nothing |
| `created_at` | `not null default now()`; the trigger refuses any change — same file, `:325-328` | Nothing |
| `id` | `uuid primary key default gen_random_uuid()`; the trigger refuses any change — `:320-323` | Nothing |
| **How many rows** | **Nothing at all** | **A cap on tasks per person.** Row 10 of section 1 |

#### `public.profiles` — written directly by the app

| Field | Checked today | Missing |
|---|---|---|
| `user_id` | Primary key, foreign key to `auth.users`, `on delete cascade`; both write policies pin it to `auth.uid()` — `20261002122203_team_rules.sql:203-207,253-258`; the action takes it from `getClaims()` and never from the form — `web/src/app/teams/actions.ts:189-195` | Nothing |
| `display_name` | Not blank; between 1 and 40 characters — `:173-175`. Trimmed and re-checked in two actions — `web/src/app/teams/actions.ts:173,183` and `web/src/app/settings/actions.ts:97` | **Control characters**, as with a task title |
| `ai_suggestions_enabled` | `not null`, default **false**; `profiles_ai_suggestions_on_is_dated` makes "on with no date" unrepresentable — `20261007204900_ai_suggestions_consent.sql:117-118`; no client role may `SELECT` or `UPDATE` the column directly | Nothing |
| `ai_suggestions_changed_at` | Stamped by a trigger, which **refuses a caller who supplies it** | Nothing |

#### `storage.objects` in `attachments` — written directly by the browser

| Field | Checked today | Missing |
|---|---|---|
| The object's **path** | `public.attachments_task_id()` is the only thing that decides what well-formed means: exactly two segments, first a uuid, lowercased — `20261008191804_attachments_bucket.sql:248`. All three policies ask it. The app checks the same shape before sending (`taskIdOf`, `web/src/lib/attachments.ts:307`) and refuses a `/` in a file name (`web/src/app/tasks/actions.ts:553-562`) | **The file name itself is unconstrained in the database.** Length, alphabet and control characters are all checked only by `storedName` in the app (`attachments.ts:254-281`, stem capped at 80). **A file put in by the operator in the dashboard need not match**, and `web/src/app/tasks/actions.ts:546-552` says that is deliberate: a name check that refused those would leave files this app could display and not delete |
| Declared **type** | Six named types, by the bucket — `:189-196`. The app offers five of them and sets the type from the extension — `web/src/lib/attachments.ts:157,206` | **Nothing about the contents**, which `docs/plan.md` states at length and the owner accepted as written. A renamed file gets through |
| **Size** | 5 MB, by the bucket (`:188`). An unparseable size counts as 5 MB, never zero (`:325-335`) | Nothing. **And it is not confirmed** whether `metadata` is populated when the `with check` runs, which the migration says costs a person up to 5 MB of their 100 MB |
| **How many, how much** | 3 per task and 100 MB per person, in `attachments_may_add()` — `:488` | **Nothing about how often.** Row 9 of section 1 |

#### `create-team`

| Field | Checked today | Missing |
|---|---|---|
| Body | Must parse as JSON — `index.ts:239-243` | Nothing |
| `name` | Must be a string (`:246`); trimmed (`:252`); at least 1 (`:253`); at most 60 with the length in the message (`:256`). Backed by two check constraints | Nothing. Trimming before measuring is the thing to notice: `"   "` is empty rather than three characters |
| Identity | `ctx.userClaims.id`, from the verified token; **nothing in the body is consulted for identity** (`:199-207`) | Nothing |

#### `invite-member`

| Field | Checked today | Missing |
|---|---|---|
| Body | Must parse as JSON — `:901-906` | Nothing |
| `team_id` | Must be a non-empty string (`:911`); trimmed; **must match a uuid shape before any database call** (`:932`), which exists because a malformed one once reached a uuid column and came back as a misleading 500 | Nothing |
| `email` | Must be a string (`:914`); trimmed and lowercased (`:938`); non-empty (`:940`); a deliberately loose shape test (`:945`); **at most 320 characters** (`:948`). Backed by three check constraints on the column | **The 320 is in the function and not in the database.** See the proposals below |
| Identity | `ctx.userClaims.id`; ownership of the team read with the secret key and compared here rather than relying on a select policy (`:958-990`) | Nothing |

#### `accept-invite`

| Field | Checked today | Missing |
|---|---|---|
| Body | Must parse as JSON — `index.ts:299-304` | Nothing |
| `token` | Must be a non-empty string (`:307`); trimmed; hashed before anything else, and `hashToken` returns 64 hex characters for any input whatsoever — so nothing from the request ever reaches a query as an id. The file argues for the **absence** of a uuid check at `:311-327` | Nothing. This is the one input in the project that needs no shape check, and the reason is written down |
| Identity, and the address | `ctx.userClaims.id` and `ctx.userClaims.email`, both from the verified token; the invitation's address is compared against the **signed-in** address (`:394`) | Nothing |

#### `suggest-subtasks`

| Field | Checked today | Missing |
|---|---|---|
| Body | Must parse as JSON — `index.ts:1476-1481` | Nothing |
| `task_id` | Must be a non-empty string (`:1494`); trimmed; must match a uuid shape before any database call (`:1503`) | Nothing |
| What is sent out | The title is read **with the caller's own rights** — `ctx.supabase`, not `ctx.supabaseAdmin` (`:1524-1530`) — so the policies decide whose titles may leave. A title over `TITLE_MAX` is treated as unusable (`:823`) | Nothing. **The caller sends an id and never a title** (`:1483-1492`), which is the whole design |
| What comes back | Length-capped per suggestion, at most five, bullets stripped, a fixed refusal list | Nothing |

#### `public.count_daily_use(uuid, text, integer)` — the one the app cannot call

| Argument | Checked today | Missing |
|---|---|---|
| `p_user_id` | Foreign key: a user id with no account **raises** rather than answering — which both callers treat as "not allowed" | Nothing |
| `p_feature` | `usage_counts_feature_allowed` is a fixed list of two words; a typo raises — `20261008115900_usage_counts.sql:172-174` | Nothing |
| `p_limit` | `<= 0` refuses everybody, which is what switching a feature off should mean | Nothing. **And the reason `authenticated` holds no EXECUTE is exactly this argument**: a caller who could call it would choose the limit |

### The proposals, and whether existing rows could violate them

Four, and they are deliberately small. **For each: whether a row could already break it, and how
the migration finds out without printing a row.**

**The technique, once, because all four use it.** A check constraint added to a populated table is
validated against every existing row, so **the migration itself is the check**: if a row violates
it, `ALTER TABLE` fails with `23514` and the migration stops. What it must not do is tell anybody
*which* row, because these columns hold an email address, free text about a person, and a file name
somebody's phone chose — all three on `docs/plan.md`'s sensitive list, and this repository is
public, so a migration's output is public. So each proposal below is paired with a **counting
query** that answers "how many rows would break this" and **can only return a number**:

```sql
-- Run by the owner, in the dashboard, BEFORE the migration. Returns one integer.
-- It names no row, selects no column's value, and cannot print one.
select count(*) from public.invitations where char_length(email) > 320;
```

A `count(*)` with the predicate inside the `where` clause is the whole trick: there is no column in
the select list, so there is nothing for an output line to carry. **Zero means apply it. Anything
else means look at the rows in the dashboard first**, by hand, and never through this repository or
a pull request.

| PROPOSED constraint | Where | Could an existing row break it? | How the migration finds out |
|---|---|---|---|
| `invitations_email_length check (char_length(email) <= 320)` | `public.invitations` | **In principle yes, in practice almost certainly not.** Every row was written by `invite-member`, which has refused over 320 since it was written (`:948`) — but the column is plain `text` with no bound, and `service_role` and the dashboard can both write one. **Nobody has counted the rows in either project** | The `ALTER TABLE` validates every row and fails with `23514` naming the **constraint**, not the row. The counting query above is run first |
| `account_status_reason_length check (reason is null or char_length(reason) <= 500)` | `public.account_status` | **Yes, possibly**, and it is the likeliest of the four: `reason` is unbounded free text **typed by the owner in the dashboard**, which is the one write path in this app no code checks. Production has no rows (nobody has signed up); staging may. **Not counted** | Same. Note the `reason is null or …`: the column is nullable, and a check that evaluates to *unknown* is how a constraint silently accepts what it was written to refuse — the pattern `20261006095847_invitation_status.sql:131-133` and `20261008115900_usage_counts.sql:169-171` both name |
| `tasks_title_no_control_chars check (title !~ '[\x00-\x1F\x7F]')` | `public.tasks` | **Yes.** Nothing has ever stopped one. A title pasted from a document can carry a newline, and the app has never refused it | Same, plus `count(*)` first. **And this one has a real cost**: it would refuse a paste that works today, so it is the proposal most likely to be declined, and that is a reasonable thing to decline |
| `profiles_display_name_no_control_chars check (display_name !~ '[\x00-\x1F\x7F]')` | `public.profiles` | **Yes**, as above, and less likely: a nickname is typed rather than pasted. Three profile rows exist on staging; production has none | Same |

**What is deliberately NOT proposed, so the absences are decisions:**

- **No tighter email pattern.** `invite-member` already says why its test is loose: "Address validity
  is settled by whether the mail arrives, not by a regular expression". A cleverer pattern refuses
  real addresses and catches nothing a sender would not catch.
- **No `name = btrim(name)` on `teams` or `profiles`.** Both functions and all three actions trim
  before writing, so every row this app made is already trimmed; a constraint would add a
  migration, a validation pass and a new way for a hand-written row to fail, to normalise something
  nothing reads back. Named here so it is not re-argued from scratch.
- **No length bound on a stored file's name.** The reason is in the table above and in
  `web/src/app/tasks/actions.ts:546-552`: the requirement is that a name cannot reach another task,
  which `attachments_task_id()` already enforces, and a stricter rule would strand files the
  operator put in.
- **Nothing about `usage_counts`.** Four columns, all constrained, and `authenticated` cannot reach
  the table or the function. There is nothing to add.

---

## 3. What the owner must set by hand, in order

**Nothing in this list is done by this change, and nothing in this repository can do any of it or
read it back.** Every row is a dashboard. The order matters: a CAPTCHA switched on before the test
keys exist breaks every automated sign-in, and a rate limit lowered before custom SMTP is on makes a
bad email situation worse.

| # | Where | What, with the exact name | Why this position in the order |
|---|---|---|---|
| 1 | **Supabase → both projects → Authentication → Rate Limits** | **Read and write down** every customizable value, for staging and for production, before changing anything | Section 1's numbers are published **defaults**. Changing a value nobody has read is changing a value nobody knows |
| 2 | **Resend** | Confirm the **verified domain**, and create an API key for **SMTP** use. Resend documents SMTP as host `smtp.resend.com`, port `465`, username `resend`, password **your API key** | Custom SMTP needs both before it can be saved |
| 3 | **Supabase → production → Authentication → Emails → SMTP Settings** | Enable custom SMTP: host, port, username, password, **Sender email** and **Sender name** (both required) | **This is the row that fixes a real breakage**, not an improvement: until it is done, production refuses to deliver to any address not on the project's team |
| 4 | **Supabase → production → Authentication → Rate Limits** | Set the **emails per hour** to a chosen number. Supabase imposes "a low rate-limit of 30 messages per hour" when custom SMTP is saved | Only possible after 3. And it must stay **under Resend's 100 a day** — 30 an hour is 720 a day |
| 5 | **Cloudflare → Turnstile** | Create a widget for the production hostname. Keep the **site key** (public) and the **secret key** (secret) | Before anything is switched on in Supabase |
| 6 | **Supabase → staging → Authentication → Bot and Abuse Protection** | Enable CAPTCHA protection, provider **Cloudflare Turnstile**, secret key **`2x0000000000000000000000000000000AA`** or **`1x0000000000000000000000000000000AA`** — Cloudflare's **dummy** secret keys, which "Only accept the dummy token, reject real tokens" | **Staging first, and with a dummy key**, so the arrangement is tried where it cannot lock anybody out |
| 7 | **Vercel → the project → Environment Variables** | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. **Preview**: Cloudflare's dummy sitekey `1x00000000000000000000AA`. **Production**: the real site key from row 5 | Per environment, like `NEXT_PUBLIC_SENTRY_DSN` already is |
| 8 | **GitHub → repository → Settings → Secrets and variables → Actions** | Nothing, **if** the dummy token is a literal in the test helper. **If** the owner decides otherwise, a variable — not a secret: Cloudflare publishes the value | Decided by the owner's answer to decision **C** at the top of the pull request |
| 9 | **Supabase → production → Authentication → Bot and Abuse Protection** | Enable CAPTCHA protection with the **real** secret key from row 5 | **Last of the CAPTCHA rows, on purpose.** Production is where a mistake locks the owner out of their own app |
| 10 | **Supabase → production → Authentication** | **Leaked password protection ON** (Pro and above), and **minimum password length 8** | Independent of the rows above; grouped here so it is one sitting |
| 11 | **Supabase → both projects → Authentication → Rate Limits** | The lowered figures, once the owner has chosen them from section 1's proposals | **Last.** Lowering a limit is the change most likely to lock somebody out, and doing it after everything else means there is only one suspect |

**No new secret is created in this repository by any of this.** The Turnstile secret key lives only
in each Supabase project's Auth settings; the Resend API key used as the SMTP password lives only in
production's Auth settings (the invitation function's own `EMAIL_API_KEY` is separate and unchanged);
the site key and the dummy keys are public. `docs/secrets.md`'s rule is unchanged and nothing is
added to it.

---

## 4. What staging would prove, and what it would not

This is section 3 of [#281](https://github.com/build-once/team-tasks/issues/281) in one place,
because it is the part most likely to be skimmed and it is the part that decides whether the tests
keep working.

**Every automated sign-in in this project is a password sign-in with no CAPTCHA token.** Nine files,
counted in this session: `web/tests/staging.mjs:540` (which `web/tests/access-rules.test.mjs` is built on, and which runs
against staging in CI on every pull request) and eight scripts under `scripts/staging/`
(`build-it-14`, `build-it-15`, `build-it-16`, `build-it-16-suspend`, `build-it-18-invitation-status`,
`build-it-20-ai`, `build-it-23-attachment`, and `bob-invites-to-alices-team`). All of them post to
`/auth/v1/token?grant_type=password` with `{email, password}` and nothing else.

**What token they would send.** Read out of the installed client rather than recalled:
`@supabase/auth-js`'s `signInWithPassword` puts it in the body as
`gotrue_meta_security: { captcha_token: options?.captchaToken }`
(`web/node_modules/@supabase/auth-js/src/GoTrueClient.ts:1243-1251`). So a raw `fetch`, which is what
all ten files use, adds one field:

```js
body: JSON.stringify({
  email: person.email,
  password,
  gotrue_meta_security: { captcha_token: "XXXX.DUMMY.TOKEN.XXXX" },
})
```

`XXXX.DUMMY.TOKEN.XXXX` is Cloudflare's own value — "Test sitekeys generate a dummy token:
`XXXX.DUMMY.TOKEN.XXXX`"
([Testing](https://developers.cloudflare.com/turnstile/troubleshooting/testing/), read 2026-10-11).

**Whether the dummy keys let staging keep CAPTCHA on: yes, and only as a matched pair.** The same
page: "Test secret keys: Only accept the dummy token, reject real tokens"; "Production secret keys:
Only accept real tokens, reject dummy tokens"; "Production secret keys will reject the dummy token.
You must also use a dummy secret key for testing purposes." So staging needs the **dummy secret** in
its Auth settings (row 6 above) and the tests need the **dummy token** in the body. A real secret on
staging refuses the dummy token, and a dummy secret on production refuses every real visitor.

**What staging then proves:** that the app and every script send the field in the right place, in the
right shape, and that Supabase Auth accepts it. That is worth having — it is the half that breaks
loudly and the half a code change can regress.

**What staging does NOT prove, and the list is the point:**

- **That a real CAPTCHA refuses anybody.** A dummy secret key accepts the dummy token by definition.
  Staging cannot fail this check.
- **That a sign-in with NO token is refused.** Whether Supabase Auth refuses one once CAPTCHA is on
  is **not confirmed** — [the CAPTCHA page](https://supabase.com/docs/guides/auth/auth-captcha) says
  what to switch on and does not say what happens to a request that arrives without a token. Staging
  with a dummy secret **can** test this, and it is the one new check worth writing: post without the
  field and assert a refusal.
- **That a real browser can solve it.** The widget, its script, and whether it loads on a phone are
  not reachable from a `fetch`.

**How production's real CAPTCHA gets seen to refuse.** Not by a script, and not by the assistant —
rule 19 permits no production command, and nothing here opens a browser. Two things the **owner** can
do, and they are the whole of it:

1. **Open production's sign-in page in a browser with JavaScript switched off**, and see what it says.
   With the widget unable to run there is no token, so this is the refusal path and the screen's
   wording for it, observed rather than reasoned about.
2. **Post to production's `/auth/v1/token?grant_type=password` with the dummy token**, from the
   owner's own machine, with a wrong password for a non-existent address. A real secret key must
   reject the dummy token, so the expected answer is a CAPTCHA refusal and **not** "wrong password" —
   which is the one request that distinguishes "CAPTCHA is on" from "CAPTCHA is configured and not
   being checked". No real account and no real password is involved, so nothing is signed in to and
   nothing is written.

**If the tests must change, these are the files**, and **rule 20 means the owner agrees before any of
them is touched** — none of them is edited in this change:

| File | What would change |
|---|---|
| `web/tests/staging.mjs` | `signIn` (line 535) gains the one field. **One place**, which is why the helper exists |
| `scripts/staging/build-it-14-checks.mjs` | its own `signIn`, line 338 |
| `scripts/staging/build-it-15-checks.mjs` | line 463 |
| `scripts/staging/build-it-16-checks.mjs` | line 1312 |
| `scripts/staging/build-it-16-suspend-checks.mjs` | line 1264 |
| `scripts/staging/build-it-18-invitation-status-checks.mjs` | line 1484 |
| `scripts/staging/build-it-20-ai-checks.mjs` | line 3406 |
| `scripts/staging/build-it-23-attachment-checks.mjs` | line 2499 |
| `scripts/staging/bob-invites-to-alices-team.mjs` | line 210 |
| `web/tests/access-rules.test.mjs` | **nothing**, if the helper is the only change |

**Nine copies of one line is the shape of the risk**, and it is the same shape
`evidence/build-it-16-suspend-functions.md` already records about `checkSuspension`: a copy that
drifts is a script that fails for a reason that has nothing to do with what it is testing. The
cheapest answer is one exported constant, and where it should live is **decision C** at the top of
the pull request.

---

## 5. Not confirmed

Everything this file could not settle, with the step that would settle each one. No figure is
written where none was read.

- **What staging and production are actually set to, for every customizable Auth rate limit.**
  Published defaults are not settings. Only **Authentication → Rate Limits** in each dashboard says,
  and nothing in this repository can read it. Section 3, rows 1 and 11.
- **Supabase Auth's default minimum password length.** The password-security page read on 2026-10-11
  advises "Anything less than 8 characters is not recommended" and **publishes no default**. Read it
  off the dashboard.
- **Whether Supabase Auth refuses a sign-in that carries no CAPTCHA token, once CAPTCHA is on.** The
  CAPTCHA page does not say. Settle it with one request against staging, with a dummy secret key
  configured, posting no `gotrue_meta_security` field.
- **Which Auth endpoints CAPTCHA actually covers.** The page says "your sign-in, sign-up, and
  password reset forms" and names no endpoint. `/auth/v1/resend` and `/auth/v1/verify` are therefore
  unknown. Same one-request method, per endpoint.
- **Whether Turnstile sets a cookie or uses local storage.** The
  [Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/) read on
  2026-10-11 points elsewhere — "For more information about the cookies used by Cloudflare, please
  check our Cookie Policy and our Turnstile Developer Docs" — and states no answer itself. It
  matters for the privacy page ([#204](https://github.com/build-once/team-tasks/issues/204)). Read
  Cloudflare's Cookie Policy, cite it, and write what it says.
- **How long Cloudflare keeps a Turnstile Signal.** The addendum "does not specify a retention
  period", in the fetch's own words. No number is written anywhere in this change.
- **Whether Cloudflare sells or advertises from Signals.** The addendum says the Signals are
  "strictly necessary" and that the purpose "is not to identify, profile or target any individuals",
  and carries **no sentence** saying the data is not sold. Read the main Cloudflare privacy policy
  for that, or write that it could not be found.
- **Whether Supabase applies any rate limit to the Data API (`/rest/v1`) or to Edge Function
  invocations.** Not read, and it is the gap behind rows 5, 9 and 10 of section 1: if the platform
  bounds invocations, three of this file's "nothing limits it" answers get a ceiling. Read Supabase's
  platform limits and its Edge Functions limits pages, cite them, and come back to those rows.
- **Whether anything is configured on Vercel** — a firewall rule, a rate rule, bot protection.
  Nothing in this repository configures one and nobody has looked.
- **Whether production actually refuses to deliver to a non-team address today.** It is a reading of
  one sentence on Supabase's custom-SMTP page, not an observation; nobody has signed up on
  production. One sign-up from the owner's test mailbox, after row 3 of section 3, both settles it
  and fixes it.
- **Whether a Supabase project's Auth email rate limit can be set above Resend's daily quota, and
  what happens if it is.** 30 an hour is 720 a day against a 100-a-day quota. Which refuses first,
  and what the person sees, was not read and has not been tried.
- **Every number in this file about this app was counted or read in this session**, from the commit
  named at the top. Nothing came from memory, and nothing was run against a project.
