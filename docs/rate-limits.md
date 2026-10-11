# Rate limits, and every input the server accepts

Build it 25, part 0. Written 2026-10-11 from `main` at commit
`8d99e05cda14fdca66fff626d354407496f2fde2` ("Merge pull request #279 from
build-once/fix/restore-honest-and-overdue-watcher", 2026-10-11 12:17:57 +0100).

**Documents only. Nothing was built, changed, deployed or run against any project to write this
file.** No code, no test, no workflow and no migration was touched; nothing was run against staging
or production; no MCP connector and no browser was used. What was read is this repository, at that
commit, and the vendor pages cited below.

**THIRTEEN DECISIONS CAME BACK FROM THE OWNER ON 2026-10-11, and this file was written before them
rather than after.** It went up as an inventory and a set of proposals, with thirteen things for the
owner at the top of the pull request; all thirteen were settled the same day. Each is recorded in its
place below and they are gathered in the table that follows, the way `docs/plan.md` gathers the nine
decisions of "Daily limits on what costs money" and the nine of "Files attached to a task".

**Still a set of proposals in one place, and it is named so nobody has to guess:** the **four check
constraints** in section 2 were never among the thirteen. They are open.

**Nothing in this file is applied anywhere.** A decision is not a dashboard setting and not a
migration. Section 3 is the list of what somebody still has to do by hand.

**AND FOUR OF THE THIRTEEN HAVE CODE AS OF 2026-10-11 — Build it 25 part 1,
[#284](https://github.com/build-once/team-tasks/issues/284), the same day this file went up.** The
sentence above is still true of every project: nothing is set in either dashboard. What exists in this
repository is **A** (the widget, the waiting button and the token travelling with all three requests),
**J** (one exported constant, in `scripts/lib/captcha.mjs`, imported by all nine files that sign in),
half of **I** (the dummy sitekey as CI's build placeholder and as what Preview is to be set to), and
**K** recorded rather than set, because the mode belongs to a widget nobody has created. **E, F, G, L,
M are set nowhere; B and C have no migration.** Section 3 is the list, and it gained two rows that are
not limits at all — the redirect allow-list, and the two email templates word for word.

### The thirteen, in one view

| | Decided 2026-10-11 |
|---|---|
| **A** The CAPTCHA at all | **Yes.** Cloudflare Turnstile on sign-up, sign-in and password reset |
| **B** A daily count of attachment uploads | **Yes, 30 a day per person** — and it **reverses** a decision `docs/plan.md` took on 2026-10-08 |
| **C** A cap on live tasks per person | **Yes, 500** |
| **D** Read both projects' Rate Limits pages first | **Yes, AND DONE the same day.** Both projects, from a screenshot: **every value is the documented default**, and seven of the documentation's eleven rows were reported. See "the owner has now read both dashboards" below — including the one thing the reading turned up that is not reassuring |
| **E** Sign-up, per IP | **Yes, 5 per 5 minutes** |
| **F** The token endpoint, per IP | **30 per 5 minutes, NOT the 20 proposed** — because CI and the staging scripts sign in from **shared addresses**, and the limit is per IP. **And the dashboard calls that field "token refreshes", which the reading below shows is a problem rather than a detail** |
| **G** Leaked-password protection on production | **Yes** |
| **H** Minimum password length 8 | **ALREADY DONE**, by the owner on **both projects on 7 October 2026**, four days before this file proposed it — and proven on staging by a refused 7-character sign-up |
| **I** Dummy keys on staging and Preview, real keys on production | **Yes** |
| **J** The nine test files change | **Yes, and as ONE exported constant every test and script imports.** That is the owner's rule 20 agreement to the change |
| **K** Which widget mode | **Cloudflare's "Managed"**, which is one of its three modes and the one Cloudflare recommends |
| **L** Custom SMTP on production | **Yes** |
| **M** Staging keeps the built-in sender | **Yes** |

**Two of the thirteen did not come back as the proposal, and both are worth more than a tick.**

**F is a correction of this file's own reasoning.** It proposed 20 per 5 minutes on the token
endpoint, arguing that 150 is thirty password guesses a minute against six accounts. The owner
answered **30**, because **the limit is per IP address and this project's own automation shares
addresses**: `web/tests/access-rules.test.mjs` signs in **three** accounts on every pull request, from
a GitHub-hosted runner whose address this project does not choose and does not know, and the eight
scripts under `scripts/staging/` sign in repeatedly from wherever the owner runs them. At 20, several
pull requests' checks landing in the same five minutes on the same runner address would start failing
**for a reason that has nothing to do with what they test** — which is the exact failure
`web/tests/staging.mjs` already guards against in its own comment beside `signIn`: "Supabase's auth
endpoint is rate-limited, and a test file that signed in per test would spend its budget on sign-ins
and start failing for a reason that has nothing to do with the rules." **So 30 is not a softer
version of 20; it is the number that does not break the thing that proves the rules.**

**H was already true, and this file proposed it anyway.** The owner changed "Minimum password length"
from **6 to 8** on staging **and** on production on **7 October 2026**, and on staging a direct
`POST` to `/auth/v1/signup` with the publishable key and a **7-character** password answered **HTTP
422**, `error_code` `weak_password`, "Password should be at least 8 characters."
`docs/claims.md` → "SETTLED 2026-10-07" is the record, and
`evidence/build-it-21-ai-consent-migration.md` is where it was written down. **That is a miss by this
file**, not a decision: it is recorded here rather than quietly dropped, because the inventory's whole
value is that somebody can trust what it says is missing. What the two sources add, and this file now
carries: **production's setting is owner-reported and was not tested**, and **nothing watches either
project's setting**, so a change would go unnoticed.

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
| **`usage_counts`** | One row per person, per feature, per UTC day, written by `public.count_daily_use()` — `supabase/migrations/20261008115900_usage_counts.sql` | Only covers a person who is **signed in**, because the row is keyed by `user_id`. **It is live on staging and on production, and has been since 8 October 2026** — see the correction below |
| **A database rule** | A check constraint, a unique index, a policy, or a `security definer` function a policy calls | Caps **how many rows exist**, never **how fast somebody asks**. "At most 3 teams" does not stop 3,000 attempts |
| **Nothing** | The honest answer for most of the rows below | — |

**The distinction that matters most in this table: a cap on rows is not a rate limit.** "At most 3
teams per person", "at most 20 pending invitations per team", "3 files per task" and "100 MB per
person" are all caps on what the database ends up holding. None of them stops a loop making the
request ten thousand times and being refused ten thousand times — and each refusal is still a
function invocation, a database read, and on Vercel a request somebody paid for.

### CORRECTION, 2026-10-11: the daily limits ARE deployed, and this file said they were not

**The owner's correction of 11 October 2026.** The first version of this file said, in four places,
that the daily limits were "deployed nowhere". **They have been on staging and on production since
8 October 2026.** It is not a small error: it is the difference between "nothing stands between a
retry loop and the bill but a vendor cap" and "every invitation email sent from production is
counted", and the first of those is what this file told a reader.

**Where it came from, which is the part worth knowing.** This file did not invent the claim — it
inherited it from `docs/plan.md`, `docs/costs.md` and `docs/architecture.md`, all three of which still
said it, and all three of which were **already known to be stale**:
[#230](https://github.com/build-once/team-tasks/issues/230) names eight such sentences with their file
and line and has been open since 8 October. So the inventory copied a stale claim out of the documents
it was written to improve. **The lesson is the one rule 14 states**: a sentence in this repository is a
record of what was true when somebody looked, and reading it is not the same as checking it.

**What is actually true, project by project, because "deployed" collapses two different answers:**

| | What is known, and from where |
|---|---|
| **The migration** | **Applied to staging** by the owner's `supabase db push` on 2026-10-08, CLI 2.75.0, and **read back** by the coach through the staging read-only connector: 10 migrations, newest `20261008115900`, the table with row-level security and 0 policies, `count_daily_use` present and `security definer`, and `service_role` alone holding EXECUTE. **Applied to production** by the pipeline on the merge of PR #224. `evidence/build-it-22-usage-counts.md`, Appendix B |
| **Both Edge Functions, on STAGING** | **Deployed by hand by the owner on 2026-10-08, and seen to work.** A before-and-after pair of runs of `scripts/staging/build-it-20-ai-checks.mjs`: before, five simultaneous asks all allowed and the ask after the limit answered 200; after, **429 with the code `daily_limit` and the plan's sentence character for character**. The coach then read two rows off the table — `ai_suggestions` used 4, `invitations` used 1. `evidence/build-it-22-daily-limits-counting.md` § 12 |
| **Both Edge Functions, on PRODUCTION** | **Deployed by the pipeline on the merge of PR #228**, merge commit `aaec96a`, merged 2026-10-08T16:33:09Z. Run [37809688847](https://github.com/build-once/team-tasks/actions/runs/37809688847) — read with `gh run view --json jobs` in this session — reports **"Deploy server functions to production: success"** beside "Apply migrations to production: success" and "Smoke-test production from outside: success" |
| **What NOBODY has read back off production** | **Any row of `usage_counts`, and the EXECUTE grant** ([#222](https://github.com/build-once/team-tasks/issues/222)). A green deploy job says the functions were uploaded, not what the table holds — the same distinction `docs/plan.md` makes at length about the AI consent migration |

**And one thing wrong with the record this correction leans on, found while leaning on it.**
`evidence/build-it-22-daily-limits-counting.md` says the owner deployed to staging **after** PR #228
merged, and dates that merge at 14:09. The merge was at **2026-10-08T16:33:09Z** and the coach's comment
quoted in its section 12 was posted at **16:32**, a minute before it — so the staging deploy came
**before** the merge, not after, and nothing merged at 14:09 that day. It does not change what is in the
table above, and it changes the sequence the file records, which is why it is
[#283](https://github.com/build-once/team-tasks/issues/283) rather than a footnote.

**And three things the staging record does NOT establish, kept because they are the shape of what is
still unproved rather than a hedge:**

- **The refusal was seen at a temporary limit of 4**, set on an unpushed local branch which the owner
  then restored to 20 and deleted. **The twentieth has never been reached anywhere.**
- **The invitation limit has never been reached at all.** One real send was counted on staging; the
  refused duplicate was not, which is the ordering the plan asks for.
- **Nobody has seen the limit's sentence on either screen**, which is
  [#212](https://github.com/build-once/team-tasks/issues/212).

**So the honest one-line answer, and it is the one the rows below now carry:** on **production**,
`invite-member` counts every send and refuses the twenty-first; `suggest-subtasks` writes no row at
all, because `not_configured` is decided **before** the count and production still has no
`AI_API_KEY`. On **staging** both count. In neither project has the twentieth been reached.

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

**Where they are set:** "You can modify customizable rate limits by navigating to **Authentication** >
**Rate Limits** in your project dashboard" (same page).

### AND THE OWNER HAS NOW READ BOTH DASHBOARDS — decision D, done 2026-10-11

**This section said "Nobody has read either project's Rate Limits page, and nothing in this repository
can", and asked for it as decision D. The owner read both the same day and reported them from a
screenshot: BOTH PROJECTS ARE THE SAME, AND EVERY VALUE IS THE DOCUMENTED DEFAULT.** So the figures
above stop being "a default either project may have been moved away from" and become what staging and
production are actually set to. **Owner-reported, from a screenshot, 11 October 2026 — nobody writing
this opened a dashboard, and nothing in this repository can.**

| The dashboard's own label | Value, both projects | Editable there? | The documentation row it matches |
|---|---|---|---|
| **sending emails** | **2 per hour** | **No** | "Emails sent by Supabase Auth". Not editable **because the built-in sender is in use** — the page says the limit "can be configured when you use custom SMTP or the Send Email hook", and the custom-SMTP page says saving one imposes 30 an hour and sends you to this screen to change it. **So the dashboard's "not editable" and the documentation's "customizable" agree**, and row 4 of section 3 can only happen after row 3 |
| **SMS** | **30 per hour** | **No** | "SMS messages sent by Supabase Auth". This app sends none |
| **token refreshes** | **150 per 5 minutes** | **Yes** | **"Token endpoint requests" — and the names do not match, which is the finding below** |
| **token verifications** | **30 per 5 minutes** | **Yes** | "Verification requests", `/auth/v1/verify` |
| **anonymous users** | **30 per hour** | **No** | "Anonymous sign-ins". This app has none, and the documentation's row says that limit "only applies if the endpoint is called without an email or phone number" |
| **sign-ups and sign-ins** | **30 per 5 minutes** | **Yes** | "Sign-ups and sign-ins" — the six paths, which do **not** include a password sign-in. **Decision E lowers this one to 5** |
| **Web3** | **30 per 5 minutes** | **No** | "Web3 sign-ups and sign-ins". This app has none |

**SEVEN ROWS WERE REPORTED AND THE DOCUMENTATION'S TABLE HAS ELEVEN, so four are still unread** — and
two of the four are about this app's own email:

| Not in the report | Why it matters, or does not |
|---|---|
| **Signup confirmation request** — "60 seconds window before a new request is allowed for the same user" | **It matters.** It is the per-person throttle on the sign-up email, and this app has no resend control, so somebody whose confirmation did not arrive has nothing to press anyway |
| **Password reset request** — the same 60-second window | **It matters.** It is the per-person throttle on the reset email, behind the screen that deliberately says one sentence whatever happened |
| **Send OTPs or magic links** | Does not matter: this app sends neither |
| **Create or verify an MFA challenge** | Does not matter: no MFA, and the documentation says this one is not customizable anyway |

**Whether the dashboard shows those four at all, or whether they were simply not in the report, is
unread.** Either way nothing says they are not at their defaults — and nothing says they are.

### THE FINDING THE READING PRODUCED: the dashboard calls it "token refreshes"

**This is the one thing in the reading that is not reassuring, and it lands squarely on decision F.**

The documentation's row is **"Token endpoint requests"**, path `/auth/v1/token`, and its own words are
that it "covers password, refresh token, ID token, and PKCE grants". **The dashboard's editable field at
the same number is labelled "token refreshes".** Those are not the same words, and the difference is
not cosmetic:

- **If the field is the documentation's row under a shorter name**, then decision F does what it
  intends — it lowers the limit that bounds password guessing — **and it also lowers the limit on
  REFRESHING A SESSION**, because the same endpoint serves both. That consequence is real and is set out
  below.
- **If the field governs refreshes ONLY**, then **nothing editable limits a password sign-in at all**,
  and decision F would set a careful number on the wrong thing while leaving the actual sign-in path at
  whatever the platform does. That would be the worst outcome available: a limit that reads as
  protection and is not.

**Nobody here can tell which.** It is read off a label in a screenshot against a sentence on a
documentation page, and those are the only two sources. **Two things would settle it**, and the second is
cheap: the dashboard's own help text beside that field, which the owner can read in the same sitting;
or, after decision F is applied to **staging**, thirty-one password sign-ins from one address — if the
thirty-first is refused, the field is the sign-in limit, and if it is not, it never was. **Until one of
those happens, decision F is a number set on a field whose meaning is inferred**, and this file will not
claim otherwise.

**And one consequence of F that holds either way, because the owner should have it in front of them: a
limit of 30 per 5 minutes per IP applies to whatever that field covers, for EVERYBODY behind one
address.** If it covers refreshes, then several volunteers on one home or office connection share 30
session refreshes every five minutes between them — which is plenty for six people and is not plenty
for a number chosen as though it only had to cover sign-ins. It is the same reasoning that moved the
figure from 20 to 30 in the first place, one step further on, and **it is a reason to watch the figure
after it is set rather than a reason not to set it.**

**One trap in that table, and it is worth more than its size.** The row called **"Sign-ups and
sign-ins"** does **not** cover this app's sign-in. Its paths are `/auth/v1/signup`, `/auth/v1/recover`,
`/auth/v1/resend`, `/auth/v1/magiclink`, `/auth/v1/otp` and `/auth/v1/user` — and a password sign-in goes
to **`/auth/v1/token?grant_type=password`**, which is the **"Token endpoint requests"** row — the one the
dashboard calls **"token refreshes"** — at **150** per 5
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
| **DECIDED 2026-10-11** | **A: Turnstile, yes** — `docs/plan.md` → "A CAPTCHA on the three sign-in screens". **E: the per-IP sign-up limit goes to 5 per 5 minutes**, from a published default of 30, because 30 is sized for an app that expects sign-ups and this one expects **six accounts in total**. **H was already done**: the minimum password length was 8 on both projects from 7 October 2026, four days before this file proposed it. **Set nowhere yet** — section 3, rows 1 and 11 |

| 2. Sign-in |  |
|---|---|
| **The request** | `POST /auth/v1/token?grant_type=password`, from `supabase.auth.signInWithPassword` — `web/src/app/auth/actions.ts:75` |
| **What limits it today** | Supabase Auth's token endpoint: 150 requests per 5 minutes **per IP** (published default). **Nothing else.** No lockout after N wrong passwords exists in this repository, and whether Auth has one was not read |
| **Where that limit lives** | Supabase Auth's own limits (dashboard) |
| **What the person sees** | "That email and password don't match. Check them and try again." — `web/src/app/login/page.tsx:55`. A rate-limit refusal gets the same sentence, deliberately: `signIn` has one failure path and does not show Supabase's text |
| **DECIDED 2026-10-11, AND NOT AS PROPOSED** | **A: Turnstile, yes.** **F: the token-endpoint limit goes to 30 per 5 minutes — not the 20 this file asked for.** The reason is the one the proposal missed: **the limit is per IP address, and this project's own automation shares addresses.** `web/tests/access-rules.test.mjs` signs in three accounts on every pull request from a GitHub-hosted runner, and the eight scripts under `scripts/staging/` sign in repeatedly from wherever the owner runs them — so at 20, two or three pull requests' checks in one five-minute window would fail for a reason that has nothing to do with what they test. **G: leaked-password protection on, on production** (Pro and above), which is a switch rather than a limit. **Set nowhere yet** — section 3 |

| 3. Password reset request |  |
|---|---|
| **The request** | `POST /auth/v1/recover`, from `supabase.auth.resetPasswordForEmail` — `web/src/app/auth/actions.ts:191` |
| **What limits it today** | Supabase Auth: 30 per 5 minutes **per IP**, a 60-second window **per user**, and the project-wide 2-emails-per-hour on the built-in sender |
| **Where that limit lives** | Supabase Auth's own limits (dashboard) |
| **What the person sees** | "If that address has an account, we've sent a link" — `web/src/lib/password-reset.ts:29`. **One sentence for every outcome, including a rate limit**, and that is a deliberate promise rather than an oversight: `requestPasswordReset` has a single exit and `scripts/password-reset-check.mjs` reads its source and refuses a second branch (`web/src/app/auth/actions.ts:150-201`) |
| **The cost of that promise, stated** | Somebody whose reset email was dropped by the 2-per-hour limit is told the same thing as somebody whose email went. They will wait for a message that is never coming. **Section 4 is the fix**; a different sentence is not, because telling the two apart would also tell somebody which addresses have accounts |
| **DECIDED 2026-10-11** | **A: Turnstile, yes.** **L: custom SMTP on production, yes** — which is what makes the sentence above true more often rather than true-sounding. **Neither is configured anywhere yet** |

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
| **THE THING TO KNOW — CORRECTED 2026-10-11** | **The daily 20 IS running, on staging and on production, and has been since 8 October 2026.** This row said "the daily 20 is deployed nowhere", copied out of three documents that were already known to be stale ([#230](https://github.com/build-once/team-tasks/issues/230)). **On production every send is counted and the twenty-first in a UTC day is refused**: the functions reached it on the merge of PR #228, run [37809688847](https://github.com/build-once/team-tasks/actions/runs/37809688847), "Deploy server functions to production: success". On staging one real send was counted and the refused duplicate was not. **The twentieth has never been reached in either project**, and **nobody has read a row off production's table** ([#222](https://github.com/build-once/team-tasks/issues/222)) |
| **What the person sees** | "You've reached today's limit. It resets tomorrow." (`_shared/limits.ts:167-168`) — **once it is deployed**. Today: "This team has 20 invitations waiting, the most allowed. Wait for some to be accepted or to expire." (`invite-member/index.ts:1105`) |
| **DECIDED 2026-10-11** | **Nothing to decide and nothing to deploy.** The proposal here was "deploy what exists", and it was written against a claim that turned out to be false: it is deployed. What is left is **not a limit at all** — read a row off production's table (#222), and see the refusal on a screen ([#212](https://github.com/build-once/team-tasks/issues/212)) |

| 8. suggest-subtasks |  |
|---|---|
| **The request** | `POST /functions/v1/suggest-subtasks`, body `{ task_id }` |
| **What limits it today** | **20 per person per UTC day** (`_shared/limits.ts:118-121`), counted immediately before the paid call (`suggest-subtasks/index.ts:1620-1627`). A **per-isolate one-call-at-a-time lock** (`beginCall`, `:1512`) — which [#186](https://github.com/build-once/team-tasks/issues/186) records as "a courtesy, not a control". The consent setting, **off for everybody**. **No production key.** And Anthropic's 5-dollar monthly spend limit |
| **Where those limits live** | `usage_counts`, a `Set` in one isolate's memory, a database column, an absent secret, the vendor |
| **THE THING TO KNOW — CORRECTED 2026-10-11** | **The daily 20 is deployed, as above — and on production it writes no row, which is a different fact and the one that matters here.** `not_configured` is decided **before** the count, so with no `AI_API_KEY` on production nothing is counted and nothing is sent. **What stops production spending money is still the absent key**, exactly as this row said; what was wrong was the reason given for it. On **staging** the count is live and was seen to refuse — 429, code `daily_limit` — at a temporary limit of 4 |
| **What the person sees** | "You've reached today's limit. It resets tomorrow." once deployed; "Suggestions aren't available right now." for `busy` and for `not_configured` |
| **DECIDED 2026-10-11** | **Nothing to decide, and nothing was ever missing here.** [#184](https://github.com/build-once/team-tasks/issues/184) is still open: asking is a GET, so a reload asks again — and a daily limit does not stop the second ask, it stops the twenty-first |

| 9. Attachment upload |  |
|---|---|
| **The request** | The browser uploads **straight to Storage as the signed-in person** — `web/src/app/tasks/AttachFile.tsx`, the app's only client component. Nothing of ours is in the path |
| **What limits it today** | **3 files per task** and **100 MB per person**, both counted by `public.attachments_may_add()` and called from the `INSERT` policy — `supabase/migrations/20261008191804_attachments_bucket.sql:488,784`. **5 MB per file** and **six named types**, by the bucket (`:183-197`). An unknown size counts as 5 MB, never zero (`:325-335`). Two advisory locks, so simultaneous uploads take turns |
| **Where those limits live** | A `security definer` function a policy calls, and the bucket's own settings |
| **No rate limit at all** | And here that is a real gap rather than a cheap-attempt one. **Upload, delete, upload, delete never exceeds 100 MB and spends egress and ingress every time.** `docs/costs.md` already records that the attachment limits do **not** keep this app inside Supabase's 5 GB monthly egress allowance; nothing bounds the number of uploads |
| **What the person sees** | "That task already has 3 files, which is the most it can have. Delete one first." / "That file is too big. Each file can be up to 5 MB." / the no-room sentence — all in `web/src/lib/attachments.ts:418-452`. **Nothing says "too often", because nothing counts** |
| **DECIDED 2026-10-11, AND IT CHANGES THE PLAN — B** | **Yes: a daily count of uploads per person, in `usage_counts`, at 30 a day.** `docs/plan.md` decided the opposite in as many words — "It is still not the daily limits of Build it 22, and still not counted in `usage_counts`", on the argument that storage is a stock and not a flow. **That argument is sound about storage and silent about traffic**, which is why it was put up again. It needs a third `feature` word, so a migration, and `docs/plan.md` is changed first, in this pull request (rule 9). **AND WHERE THE COUNT GOES IS NOT OBVIOUS, which is the one thing this decision does not settle** — see the row below |
| **The hard part of B, named rather than assumed** | **There is no server code in the upload path**, so there is nowhere of ours to put a count. Every other counted use in this app is written by an Edge Function immediately before it spends money; an upload goes browser → Storage, with `attachments_may_add()` in the `INSERT` policy as the only thing of ours it passes. So the count would have to be **written from inside a policy's `with check`**, by a `security definer` function calling `count_daily_use()` — and **nobody has established that a check expression may perform a write, or what happens to that write when the statement it is checking then fails.** A count that is kept when the upload is refused is the wrong way round, and a count that is lost when it succeeds is worse. **That is the question Build it 25's code has to answer before it writes a line**, and it is not answered here |

| 10. Adding and changing tasks |  |
|---|---|
| **The request** | `INSERT` / `UPDATE` / `DELETE` on `public.tasks` over the Data API, with the publishable key and the person's own session — `web/src/app/tasks/actions.ts:100,192,261,333,452` |
| **What limits it today** | Row-level security decides **whose** rows (four policies, one per command). The title: not blank and at most 200 characters (`tasks_title_not_blank`, `tasks_title_length` — `supabase/migrations/20260927182443_create_tasks.sql:31,35`). The column guard trigger, for `owner_id`, `id`, `created_at` and `team_id`. **No cap on how many tasks one person may have, and no rate limit of any kind** |
| **Where those limits live** | Database rules only |
| **What the person sees** | The `problem=` sentences in `web/src/lib/tasks.ts`. **None of them is about frequency or quantity** |
| **The exposure, plainly** | One signed-in volunteer, or one loop with one volunteer's session, can insert rows into production's `tasks` table until the database fills. At 200 characters a row that is slow, and it is not bounded by anything this app has. **Whether Supabase applies any limit of its own to the Data API was not read** (section 5) |
| **DECIDED 2026-10-11, AND IT CHANGES THE PLAN — C** | **Yes: a cap on live tasks per person, 500.** Enforceable the way "at most 3 teams" is not — it is a count of the caller's own rows, so a `security definer` function called from the `INSERT` policy does it, exactly as `attachments_may_add()` already does, with no Edge Function and no secret key. 500 is sized for a volunteer's list and is not 20: a person who hits it has done something nobody designed for. **And unlike B it needs no write inside a policy** — it is a count and nothing else, which is why C is the easier of the two to build despite looking like the bigger change. `docs/plan.md` is changed first, in this pull request (rule 9) |

#### Not an action, but it belongs in this table

| 11. Supabase's password rules and leaked-password protection |  |
|---|---|
| **What this app checks** | At least 8 characters, in `passwordProblem` (`web/src/lib/password-reset.ts:107`), called by `signUp` **before** anything is sent and by `setNewPassword` before the change |
| **What Supabase can check** | A minimum length, required character classes, and leaked passwords. From [Password security](https://supabase.com/docs/guides/auth/password-security), read 2026-10-11: "Set a large minimum password length. Anything less than 8 characters is not recommended"; "Prevent the use of leaked passwords. Supabase Auth uses the open-source HaveIBeenPwned.org Pwned Passwords API to reject passwords that have been leaked and are known by malicious actors"; and "Leaked password protection is available on the Pro Plan and above" |
| **What either project is set to — AND THE MINIMUM LENGTH IS 8, WHICH THIS FILE GOT WRONG** | This row said "**Unread** ... no number is written here". **It was read, by the owner, on 7 October 2026** — four days before this file proposed reading it. "Minimum password length" was **changed from 6 to 8 on staging AND on production**, and on **staging** a direct `POST` to `/auth/v1/signup` with the publishable key and a **7-character** password answered **HTTP 422**, `error_code` `weak_password`, "Password should be at least 8 characters." `docs/claims.md` → "SETTLED 2026-10-07" is the record; `evidence/build-it-21-ai-consent-migration.md` is where it was written down. **What is still true from those two sources and must travel with the number:** production's setting is **owner-reported and was not tested** — only staging's was exercised with a real refused request — and **nothing watches either project's setting**, so if one were lowered, this row and `docs/claims.md` would both still say 8 and nothing in this repository would notice. **Leaked-password protection is a separate switch and is still unread** |
| **DECIDED 2026-10-11** | **H: nothing to do — already done, on both projects, on 7 October 2026.** **G: switch leaked-password protection on, on production**, which is now a Pro organisation and so can have it; it is **not** done, and it is row 10 of section 3. Neither is a rate limit; G belongs on the same by-hand pass as the rest |

### What nothing in this repository limits, and what that leaves

Said plainly, because the table above is long enough to read as reassurance:

- **The Data API.** Every read and write of `tasks` and `profiles` goes to `/rest/v1` with the
  publishable key. RLS decides *what* comes back; nothing in this project decides *how often*.
- **Edge Function invocations.** Four functions, all signed-in-only. Nothing counts invocations
  except `usage_counts`, which counts two features — live in both projects since 8 October 2026 — and
  will count a third once decision **B** is built.
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

**REWRITTEN 2026-10-11 against the owner's thirteen decisions.** Three things changed in it, and they
are named here because a list that quietly grows a row is a list nobody can diff:

- **every figure is now a number somebody chose**, where the first version said "once the owner has
  chosen them";
- **the minimum password length came OFF the list**, because it was already set on both projects on
  7 October 2026 — decision **H**, and the correction is in section 1, row 11;
- **row 8 is now decided rather than conditional**: decision **J** is one exported constant, so the
  dummy token is a literal in this repository and **GitHub needs no setting at all.**

| # | Where | What, with the exact name | Why this position in the order |
|---|---|---|---|
| 1 | ~~**Supabase → both projects → Authentication → Rate Limits**~~ **DONE 2026-10-11** | **Read and write down** every customizable value, for staging and for production, before changing anything. **Decision D** — and the owner did it the same day, from a screenshot: **both projects identical, every value the documented default.** Section 1 has the seven rows reported and names the four that were not | Changing a value nobody has read is changing a value nobody knows. **It is done, so row 11 may now happen** — and the reading added a question to row 11 rather than removing one |
| 2 | **Resend** | Confirm the **verified domain**, and create an API key for **SMTP** use. Resend documents SMTP as host `smtp.resend.com`, port `465`, username `resend`, password **your API key** | Custom SMTP needs both before it can be saved |
| 3 | **Supabase → production → Authentication → Emails → SMTP Settings** | Enable custom SMTP: host, port, username, password, **Sender email** and **Sender name** (both required) | **This is the row that fixes a real breakage**, not an improvement: until it is done, production refuses to deliver to any address not on the project's team |
| 4 | **Supabase → production → Authentication → Rate Limits** | Set the **emails per hour** to a chosen number. Supabase imposes "a low rate-limit of 30 messages per hour" when custom SMTP is saved | Only possible after 3. And it must stay **under Resend's 100 a day** — 30 an hour is 720 a day |
| 5 | **Cloudflare → Turnstile** | Create a widget for the production hostname. Keep the **site key** (public) and the **secret key** (secret) | Before anything is switched on in Supabase |
| 6 | **Supabase → staging → Authentication → Bot and Abuse Protection** | Enable CAPTCHA protection, provider **Cloudflare Turnstile**, secret key **`2x0000000000000000000000000000000AA`** or **`1x0000000000000000000000000000000AA`** — Cloudflare's **dummy** secret keys, which "Only accept the dummy token, reject real tokens" | **Staging first, and with a dummy key**, so the arrangement is tried where it cannot lock anybody out |
| 7 | **Vercel → the project → Environment Variables** | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. **Preview**: Cloudflare's dummy sitekey `1x00000000000000000000AA`. **Production**: the real site key from row 5 | Per environment, like `NEXT_PUBLIC_SENTRY_DSN` already is |
| 8 | **GitHub → repository → Settings → Secrets and variables → Actions** | **NOTHING. Decision J settles it**: the token is one exported constant in this repository, holding Cloudflare's published value, so there is no secret and no variable to create | A value Cloudflare publishes on its own documentation page is not a secret, and a constant every test imports cannot drift the way nine copies could |
| 9 | **Supabase → production → Authentication → Bot and Abuse Protection** | Enable CAPTCHA protection with the **real** secret key from row 5 | **Last of the CAPTCHA rows, on purpose.** Production is where a mistake locks the owner out of their own app |
| 10 | **Supabase → production → Authentication** | **Leaked password protection ON** (Pro and above). **Decision G.** **NOT the minimum password length** — that was set to 8 on both projects on 7 October 2026 and is the one row this list lost rather than gained | Independent of every row above; grouped here so it is one sitting |
| 11 | **Supabase → both projects → Authentication → Rate Limits** | The two figures the owner chose: **sign-ups and sign-ins, 5 per 5 minutes** (decision **E**, from a published default of 30), and **the token endpoint, 30 per 5 minutes** (decision **F**, from a published default of 150). **Both projects, the same numbers** | **Last.** Lowering a limit is the change most likely to lock somebody out, and doing it after everything else means there is only one suspect. **And the token figure is 30 rather than 20 for a reason that bites here**: CI signs in three accounts per pull request from a shared runner address, so this is the row to come back to if checks start failing for no reason. **READ THE HELP TEXT BESIDE "token refreshes" BEFORE SETTING IT** — the dashboard's label and the documentation's row do not use the same words, and if that field is about refreshes only then this row sets a careful number on the wrong thing. **Do staging first, then try thirty-one sign-ins from one address**: that one run settles what the field means |

| 12 | **Supabase → both projects → Authentication → URL Configuration → Redirect URLs** | Add `/auth/confirm` for every address the app is served at, beside the `/auth/reset` and `/auth/callback` entries already there: `http://localhost:3000/auth/confirm` for the owner's own machine, the preview address, and the production address. **Nothing is removed** — the two existing paths still serve links sent before row 13 | **Before row 13 and after the code is deployed.** A template pointing at a page the host does not serve is a link that goes nowhere, and a `redirect_to` that is not on the allow-list is one Supabase ignores |
| 13 | **Supabase → both projects → Authentication → Emails → Templates** | **The two email bodies, word for word, in the subsection below.** "Reset Password" and "Confirm signup". This is what makes a link work when the email is opened in a different browser, and what stops a mail scanner spending it | **LAST, and after the pull request is merged and deployed**, because the link it produces points at `/auth/confirm`, which does not exist on a host running the old build. Independent of every CAPTCHA row above, so it can be its own sitting |

**Rows 12 and 13 were added on 2026-10-11 and they are the only two rows on this list that are not a
limit.** [#285](https://github.com/build-once/team-tasks/issues/285) is the checklist of what the owner
has to **observe** once they are done, including the one reading that answers whether the CAPTCHA
refuses anything at all. They are here because the list is "what the owner must set by hand, in order" and these two
are both of those; the owner's decision they carry out is the one taken the same day, after watching a
reset link fail in a second browser on production.

### The two email templates, word for word — rows 12 and 13

**Copy these exactly.** Each replaces the whole body of one template.

**Supabase → Authentication → Emails → Templates → "Reset Password":**

```html
<h2>Reset your password</h2>

<p>Follow the link below to set a new password for Team Tasks. It works once.</p>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Set a new password</a>
</p>
<p>If you did not ask for this, you can ignore this email.</p>
```

**Supabase → Authentication → Emails → Templates → "Confirm signup":**

```html
<h2>Confirm your email address</h2>

<p>Follow the link below to finish creating your Team Tasks account.</p>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm my email address</a>
</p>
```

**The one line in each that matters, and it is checked.** The `href` is exported from
`web/src/lib/email-links.ts` as `RECOVERY_LINK_HREF` and `SIGNUP_LINK_HREF`, and
`scripts/auth-screens-check.mjs` requires **this document** to contain both strings verbatim. So an
instruction that told the owner to point a link at a path this app no longer serves turns a pull
request red, instead of being found by a volunteer whose reset link went nowhere.

**Three things about the shape, each of them a decision rather than a copy:**

- **`{{ .TokenHash }}` and not `{{ .ConfirmationURL }}`.** This is the shape Supabase documents for a
  server-rendered app — "Follow the link below to set a new password" with
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/account/update-password`
  and a route calling `verifyOtp({ type, token_hash })`
  ([Passwords](https://supabase.com/docs/guides/auth/passwords), read 2026-10-11). A token hash carries
  **no PKCE verifier**, which is the whole reason the link then works in a second browser.
- **NO `next` PARAMETER**, which is where this departs from the documented example. Where each kind of
  link goes is `destinationAfter` in `web/src/lib/email-links.ts` — two fixed paths — because a
  destination taken out of a link is a destination somebody else chooses. Issue #120 rule 2 settled that
  for `/auth/reset` and the same answer holds here.
- **`{{ .SiteURL }}` and not `{{ .RedirectTo }}`**, so the link's host comes from a setting on the
  server and from nothing in a request. The cost, stated: a sign-up made on a Vercel **Preview** deploy
  gets a confirmation link pointing at the project's Site URL host rather than at the preview's own
  address. `{{ .RedirectTo }}` would keep that and would produce a **broken** link whenever no redirect
  was sent — `SITE_URL` is optional (`docs/environments.md`) — which is the worse failure of the two,
  on production of all places.

**And links sent BEFORE row 13 keep working.** `/auth/reset` and `/auth/callback` are untouched and
still accept the `code=` shape the old templates produce, in the browser that asked for it. So there is
no window in which somebody's reset email is dead.

**And one row that is NOT on this list and belongs to somebody else: decisions B and C are code.** A
daily count of uploads and a 500-task cap are a migration and a function, not a dashboard setting, so
neither appears above. `docs/plan.md` carries both as decided, which is the order rule 9 asks for;
building them is Build it 25's own work.

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

**THE TESTS DO CHANGE, AND THE OWNER AGREED TO IT ON 2026-10-11 — decision J, which is the rule 20
agreement this change needed and did not have.** Rule 20 says changing a test is the owner's call and
never the assistant's, and that a test which was allowed to change gets its own line saying what
changed and who agreed to it. This is that line: **nine files gain one field in their sign-in, as ONE
EXPORTED CONSTANT every test and script imports**, agreed by the owner on 11 October 2026.

**Why the shape was part of the decision rather than left to whoever builds it.** Nine copies of one
line is the shape `evidence/build-it-16-suspend-functions.md` already records about
`checkSuspension` — "a copy that drifts is a script that fails for a reason that has nothing to do
with what it is testing" — and the thing being copied here is a **magic string from somebody else's
documentation**, which is the worst kind of value to have nine of. One constant also gives the
repository one place to grep when Cloudflare ever changes it.

**Nothing below is edited in THIS change**, which is documents-only. The list is what the code change
has to touch:

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

**Where the constant goes is NOT decided here, and it is the one loose end decision J leaves.** The
obvious home is `web/tests/staging.mjs`, which already holds every endpoint and helper the tests
share — but the eight scripts under `scripts/staging/` do not import from `web/tests/` today, and
nothing has established whether they may. **Two things are true of whatever is chosen**: it is one
file, and **a new file does not run just because it exists** — `.github/workflows/ci.yml` names each
staging script by path in its "Staging script self-tests" job (`:523-527`), and `web/package.json`'s
`test` script names one test file, so anything new has to be named somewhere or it runs nowhere.

### DONE 2026-10-11 — the nine files changed, and the constant lives in `scripts/lib/captcha.mjs`

**Build it 25 part 1 ([#284](https://github.com/build-once/team-tasks/issues/284)) carried out decision
J the same day this file proposed the shape of it.** The paragraph above is kept as the question it
was; this is the answer.

**Not `web/tests/staging.mjs`, and the reason is the one that paragraph names.** `scripts/lib/` already
exists for shared script code (`scripts/lib/secrets.mjs`), and **both sides reach it with a plain
relative path** — `../lib/captcha.mjs` from `scripts/staging/`, `../../scripts/lib/captcha.mjs` from
`web/tests/`. So neither side imports from the other's folder, and nothing about `web/` depends on
`scripts/` at build time, because `web/tests/` is not part of `next build`.

| What changed | Where |
|---|---|
| One import and one spread in the sign-in body | all nine files in the table above, exactly as listed |
| `web/tests/access-rules.test.mjs` | **nothing**, as predicted: `signIn` in `web/tests/staging.mjs` is the only place that file signs in |
| The constant itself | `scripts/lib/captcha.mjs` — `DUMMY_CAPTCHA_TOKEN`, `CAPTCHA_BODY_FIELD`, and `captchaBody()`, which returns a **fresh object** so no two callers can share and mutate one |
| GitHub | **nothing**, as row 8 of section 3 says. Cloudflare publishes the value |

**And the thing decision J was for is asserted rather than hoped for.**
`scripts/auth-screens-check.mjs` requires that all nine import it, that all nine call it, that **not
one of them spells the token itself**, and that the token appears exactly once in the whole repository
— in the module that exports it — with a control that finds a tenth copy if somebody pastes one.

**The five scripts with a `--selftest` were run after the change and their case counts are unmoved**:
39, 40, 57, 140, 107. A change to a sign-in helper that had quietly broken a selftest would have shown
there.

**AND THE NEW SIXTH SCRIPT IS NAMED IN CI**, which is the trap the paragraph above names:
`scripts/staging/build-it-25-captcha-checks.mjs`, 31 cases, in the same `run_and_count` list. A script
nobody added to that list runs nowhere — which is exactly what happened to
`build-it-18-invitation-status-checks.mjs` and its 57 cases until issue #167.

---

### Decision K: the widget mode, confirmed from Cloudflare's documentation

**The owner asked for Cloudflare's "managed" mode IF that is one of its widget modes, and asked for
the modes to be confirmed from Cloudflare's own documentation rather than taken on trust. It is one of
them, and it is the one Cloudflare recommends.** Read on 2026-10-11 from
[Widget types](https://developers.cloudflare.com/turnstile/concepts/widget/), and **fetched twice with
different questions**, which agreed: three modes, and "**Managed** (recommended)".

| Mode | What Cloudflare says a visitor sees |
|---|---|
| **Managed** — chosen | "Automatically chooses between non-interactive or checkbox challenge based on visitor risk level." When it does ask, "the visitor will be prompted to select a box" and "There will be no images or text to decipher." |
| Non-interactive | "Visitors will see a widget with a loading spinner while the challenges run in their browsers", and "visitors will never be required or prompted to interact with the widget." |
| Invisible | "visitors will never interact with the Turnstile widget", and "Visitors will also not see a widget or any indication that an invisible browser challenge is in progress." |

**So what a person signing in actually sees, in one sentence: a small box below the password field
that usually settles itself, and sometimes asks them to tick it — never a puzzle, never an image to
identify, and never a word to retype.**

**Why managed and not invisible, which is the comparison worth making** — invisible is the mode that
costs a volunteer nothing at all to look at, so it is the obvious choice until you ask what happens
when it fails. Three things decide it:

- **A visible widget is the only thing that can tell somebody why they are stuck.** The cost named in
  `docs/plan.md` is that signing in starts needing JavaScript; with an invisible widget a person
  whose browser blocked the script sees a sign-in form that simply refuses them, with nothing on the
  screen to connect the refusal to. A box that failed to load is a box they can see failed to load.
- **Managed is the mode Cloudflare recommends**, and on a control that stands in front of everybody's
  sign-in, departing from the vendor's own default needs a reason rather than a preference.
- **The tick is the honest version of what is happening.** Something is being checked about this
  visitor; a mode chosen so that nobody notices is a mode chosen so that nobody is told.

**What it costs, stated:** on a risky-looking request a volunteer has one extra tap before they can
sign in, and that will sometimes happen to somebody on a shared or mobile address who has done nothing
wrong.

**And one thing read off a different page rather than this one: the free plan shows Cloudflare's
branding.** The [Plans](https://developers.cloudflare.com/turnstile/plans/) page lists "the ability to
remove Cloudflare branding" among what Enterprise adds, so the free tier keeps it. **The widget page
says nothing about branding at all** — this is read off the plans page's silence in the other
direction, which is weaker than a statement, and it is written this way rather than as a fact. What it
means if it holds: another company's name appears on this app's sign-in screen, which is a thing to
have decided rather than discovered.

---

## 5. Not confirmed

Everything this file could not settle, with the step that would settle each one. No figure is
written where none was read.

- **SETTLED for seven rows, STILL OPEN for four — what the two projects are actually set to.** This
  bullet said "Published defaults are not settings. Only **Authentication → Rate Limits** in each
  dashboard says, and nothing in this repository can read it." **The owner read both on 2026-10-11** and
  reported them identical and at the documented defaults, from a screenshot; the seven rows are in
  section 1. **What is still unread**: the two 60-second per-user windows on the sign-up and reset
  emails, the OTP window, and the MFA row — four of the documentation's eleven, and the first two of
  those are the per-person throttle on this app's own login email. **And it is owner-reported**: nobody
  writing this opened a dashboard, and no check in this repository can notice if a value changes
  tomorrow.
- **WHAT THE DASHBOARD FIELD CALLED "token refreshes" ACTUALLY COVERS, which is the sharpest thing on
  this list.** The documentation's row at the same number is "Token endpoint requests" and says it
  "covers password, refresh token, ID token, and PKCE grants"; the dashboard calls it "token refreshes".
  **If it is refreshes only, nothing editable limits a password sign-in at all and decision F sets a
  number on the wrong field.** Settled by the help text beside it, or — after F is applied to staging —
  by thirty-one password sign-ins from one address. **Until then, F is a number set on a field whose
  meaning is inferred.**
- **SETTLED, AND IT WAS SETTLED BEFORE THIS FILE ASKED — the minimum password length.** This bullet
  said it had to be read off the dashboard. **The owner read it and changed it on 7 October 2026**:
  from **6 to 8**, on staging and on production, with a 7-character sign-up on staging refused **HTTP
  422**, `weak_password`. `docs/claims.md` → "SETTLED 2026-10-07" and
  `evidence/build-it-21-ai-consent-migration.md` are the record. **What stays open about it**:
  production's setting is **owner-reported and untested**, and **nothing watches either project's
  setting**, so a change would go unnoticed by every check in this repository. The published *default*
  is still not written anywhere, and no longer matters — what either project is set to is known.
- **Whether leaked-password protection is on, on either project.** Read on the same dashboard page as
  the length above, and **not** read when that one was. It is decision **G** and row 10 of section 3.
- **Whether Supabase Auth refuses a sign-in that carries no CAPTCHA token, once CAPTCHA is on.** The
  CAPTCHA page does not say. Settle it with one request against staging, with a dummy secret key
  configured, posting no `gotrue_meta_security` field. **THE REQUEST IS NOW WRITTEN, 2026-10-11:**
  `scripts/staging/build-it-25-captcha-checks.mjs` section 1, run before and after the owner switches
  CAPTCHA on, and its selftest already requires FAIL for the world where an unchecked CAPTCHA accepts
  it. **Nobody has run it against staging**, and the question is open exactly as it was. The script also
  reports **which code** the refusal carries, which is a second unknown the first one hides: the app's
  three screens draw their own sentence for `captcha_failed` and the generic one for anything else.
- **Whether the eight scripts under `scripts/staging/` may import from `web/tests/`: SETTLED by not
  needing to, 2026-10-11.** This list carried it as decision J's loose end. The constant went in
  `scripts/lib/captcha.mjs` instead, which both sides reach with a relative path, so the question is
  moot rather than answered — nobody established whether those scripts can reach `web/tests/`, and
  nothing in this project needs to know. Section 4 has the detail.
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
- **Whether a check expression may perform a write, which is what decision B needs.** There is no
  server code in the upload path, so a daily count of uploads has to be written from inside the
  `INSERT` policy's `with check` — and **nothing read or tried here says whether that is allowed,
  or what becomes of the count when the statement it is checking is then refused.** It is the one
  decision of the thirteen whose implementation is not obvious, and settling it needs a local
  PostgreSQL sandbox rather than a page: write a `security definer` function that counts, call it
  from a check, and watch what happens to the row on a refusal.
- **Whether the free Turnstile plan really shows Cloudflare's branding on the widget.** Read off the
  Plans page listing branding removal as an Enterprise feature, which is an inference from silence
  rather than a statement. Only looking at a rendered widget settles it, and nobody has.
- **Every number in this file about this app was counted or read in this session**, from the commit
  named at the top. Nothing came from memory, and nothing was run against a project. **And that was
  not enough twice, which is the honest coda to this list.** Two claims in the first version were
  wrong — the daily limits being "deployed nowhere", and the minimum password length being unread —
  and **neither was a guess**: both were read, carefully, out of documents in this repository that
  happened to be stale. `docs/plan.md` said the first (and [#230](https://github.com/build-once/team-tasks/issues/230)
  had said so since 8 October), and nothing said the second because the answer was in `docs/claims.md`
  under a heading this file never opened. **So "read in this session" is a weaker guarantee than it
  sounds**: reading a sentence in this repository tells you what somebody saw when they wrote it, and
  rule 14 is about exactly that. What would have caught both is what the next build should do first —
  grep the *evidence* folder and `docs/claims.md` for each claim before writing it down as a gap.
