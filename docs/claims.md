# Claims register and email audit

Written 2026-10-07 for issue #194, from commit `11e091f5bc364d9f6b09ddcb572f59717c10ac1a` — the head of
`origin/main` when this file was started (`git rev-parse HEAD`, run in this session).

**Updated 2026-10-07 with the owner's decisions** on all seven rows in §4, and **again, the same day, when
those decisions were carried out.** #196, #197, #198, #199, #200, #201 and #202 are done: the screens were
changed, and every row in §1 and §2 below now cites the file and line that makes the new claim true, or
records the removal. §4 and §4a are kept as the record of what was wrong and why each choice was made.

**Two things from those decisions are NOT finished, and neither is a loose end.**

- **There is no privacy page, and it is now a release gate.** #202 asked that a privacy page say the operator
  can access the database. The sentence is on the screen; the page does not exist, so the app tells the people
  using it nothing about what it holds or where it goes.
  [#204](https://github.com/build-once/team-tasks/issues/204) holds it, and `docs/plan.md`'s consent entry now
  names a privacy page as a precondition for installing the production `AI_API_KEY`.
- **#197 is enforced in the app, and the account-level floor is still unverified.** `signUp` refuses a short
  password, which is what the decision asked for. It does **not** bind a caller who uses the public
  publishable key against Supabase Auth directly and never passes through this app; there the project's own
  minimum password length is the only rule, and nobody here has read it. Both §1c password rows say so, and §6
  carries what would settle it: the owner confirming the setting on staging and on production.

**What this file is.** Two lists. The first is every factual claim the app makes on a screen, with the
file and line where the words are and the file and line that makes them true. The second is every email
Team Tasks sends or causes to be sent. Nothing here changes any behaviour: the register is a reading of
the code as it stands, so that each claim can be checked against the thing that is supposed to keep it.

**What "makes them true" means.** The file and line that would refuse the thing the words promise.
Where that is a row-level security policy or a check constraint, the migration is named; where it is a
server function, the function and line are named. A browser attribute — `maxLength`, `minLength`,
`required` — is **not** counted as making a claim true, because anything running in a browser can be
skipped; where that is all there is, the row says so.

**Three verdicts, and nothing else.** A file and line; **NOT ENFORCED**, meaning nothing in this
repository makes the words true; or **not verified**, meaning the thing that would decide lives in a
dashboard and nobody writing this opened one. Rule 8: a check that could not run is not a pass.

**What was NOT done here.** No screen was opened, no browser was used, no connector was used, and nothing
was deployed. Every claim's wording was read in this repository. So every row is a claim about **the code
on this commit**, not about what any deployed version is currently doing — and
`web/src/lib/suggestions.ts`'s own header is the reason that distinction matters: a deployed Edge Function
can be a different program from the one in this branch.

**One exception, added with the decisions and worth being exact about.** §4a row 5 cites a run against
**staging**. Nobody here ran it: it is the `App tests (access rules on staging)` job of this branch's own
CI, and what was done in this session was to read its log with `gh run view --log`. No command in either
session touched staging or production, and no production action was taken, so there is no
`evidence/production-log.md` entry to make. The distinction matters because that log line is the one piece
of evidence in this file that is an **observation of a running database** rather than a reading of source.

---

## 1. The pages the public can see

**Which pages those are, and how that was decided.** `web/src/lib/supabase/proxy.ts:30-44` is the list:
`/` plus `/login`, `/signup`, `/auth`, `/invite`, `/forgot-password`, `/reset-password` and everything
beneath them. Anything else redirects a signed-out visitor to `/login`
(`web/src/lib/supabase/proxy.ts:88-92`). Three more files are included because they draw on top of any
screen, signed out included: the root layout, the error boundaries and the loading fallback.

Headings that are only a name (`Team Tasks`, `Sign in`, `Create your account`, `My tasks`), link labels,
button labels, placeholders and form labels are left out: they promise nothing. Everything that asserts
a fact is below.

### 1a. On every screen, signed out included

| The exact words | Where they appear | What makes them true |
|---|---|---|
| `See what's done, what's left, and which list it's on.` (the page description in `<head>`) | `web/src/app/layout.tsx:28` | **ENFORCED, and the claim changed to get there (#196, done).** The old third clause was "and who's doing it" and nothing in the app answered it. Each clause now has something that keeps it: `tasks.done` (`supabase/migrations/20260927182443_create_tasks.sql:28`), the count at `web/src/app/tasks/page.tsx:322-327`, and the team chip at `web/src/app/tasks/page.tsx:825-840`, decided by `taskTeam()` at `web/src/lib/tasks.ts:214-233` and called at `:630` |
| `Team Tasks — Version 1234567` / `Team Tasks — Version 1234567 (preview)` / `Team Tasks — Local development — no deployed version` | `web/src/app/components/Footer.tsx:31-34`, wording decided in `web/src/lib/app-version.ts:107-130` | `web/next.config.ts:47-48` sets `APP_COMMIT` from `VERCEL_GIT_COMMIT_SHA` at build time; `web/src/lib/app-version.ts:67` refuses anything that is not 40 hex digits, so the only two things the footer can say are a real commit or the local-development sentence. Checked by `scripts/screen-state-check.mjs`. |
| `Loading…` | `web/src/app/loading.tsx:24-26` | True by construction: Next.js draws this file while the server page is still rendering (`loading.tsx` convention, cited in the file's own header). |
| `This screen could not be shown. The details have gone to the owner.` | `web/src/app/error.tsx:77` | **"This screen could not be shown"** is the boundary's own existence: it renders only when a render threw. **"The details have gone to the owner"**: `web/src/app/error.tsx:50` reports the error, and `web/src/lib/env.ts:91-115` stops a Production or Preview build that has no `NEXT_PUBLIC_SENTRY_DSN`, so a deployed build cannot be in the state where nothing is sent. On a build with **no** DSN — local development — `web/src/instrumentation-client.ts:48` never starts Sentry and the sentence is not true; that build is nobody's public site |
| ~~`Nothing you were doing has been lost unless a message said so.`~~ | **REMOVED (#200)** — was the middle sentence of the row above | **Recorded as a removal, and nothing replaced it.** It was a promise about the database that nothing could keep: a throw **after** a write lands reaches this same screen, and in that case there is no message for "unless a message said so" to point at. This app has a real version of that failure — `accept-invite` can mark an invitation accepted and fail to write the membership row (`supabase/functions/accept-invite/index.ts:472`), which it logs as needing fixing by hand. The screen now matches `global-error.tsx:57-60`, which never made the claim; the reasoning is kept beside it at `web/src/app/error.tsx:58-74` |
| `Team Tasks could not be shown at all. The details have gone to the owner.` | `web/src/app/global-error.tsx:57-60` | As the row above: `web/src/app/global-error.tsx:41` reports it, `web/src/lib/env.ts:91-115` is what makes a deployed build have somewhere to send it. |

### 1b. The home page, `/`

| The exact words | Where they appear | What makes them true |
|---|---|---|
| `See what's done, what's left, and which list it's on.` | `web/src/app/page.tsx:29` | **ENFORCED (#196, done).** Three clauses, three things that keep them. **"what's done"**: the `done` column (`supabase/migrations/20260927182443_create_tasks.sql:28`), drawn as the tick at `web/src/app/tasks/page.tsx:787-835` and read back after every press by `web/src/app/tasks/actions.ts:189`. **"what's left"**: the count at `web/src/app/tasks/page.tsx:322-327`, computed at `:273` from exactly the rows about to be drawn. **"which list it's on"**: the team chip at `web/src/app/tasks/page.tsx:825-840`, decided by `taskTeam()` at `web/src/lib/tasks.ts:214-233` and called at `:630`. **No clause claims to show a person**, which is what #196 was about |
| ~~`See what's done, what's left and who's doing it.`~~ | **REMOVED (#196)** — it was on this page, on `/login` and in the `<head>` description | **Recorded as a removal, with no live citations, because the words are gone from all three places.** It was NOT ENFORCED for the third clause: `owner_id` exists but is never drawn, and no column recorded who ticked a task. Why it was removed rather than made true, and the searches that established it, are in §4 item 1 and §4a row 1. The comment at `web/src/app/page.tsx:14-28` keeps the reason beside the new wording |
| `No account yet? Sign up` | `web/src/app/page.tsx:39` | `web/src/app/signup/page.tsx` draws the form and `signUp` at `web/src/app/auth/actions.ts:87-148` creates the account. |

### 1c. Sign up, `/signup`

| The exact words | Where they appear | What makes them true |
|---|---|---|
| `No card needed to sign up.` | `web/src/app/signup/page.tsx:42` | **ENFORCED (#201, done).** Unlike the promise about money it replaces, this is a statement about the app as built, so a file and line can carry it: the form asks for an address and a password and nothing else — the whole of it is `web/src/app/signup/page.tsx:69-110`, with the two fields at `:74-82` and `:89-97` — and `credentials()` at `web/src/app/auth/actions.ts:19-24` reads only those two before `signUp` sends them at `:134-137`. **And there is no payment flow anywhere** — no dependency, route, action or table; §4a row 4 records the four searches |
| ~~`Free for your volunteer group.`~~ | **REMOVED (#201)** | **Recorded as a removal.** It was NOT ENFORCED and could not be made so by any file: it was a promise about money. §4 item 2 carries the reasoning, and the comment at `web/src/app/signup/page.tsx:30-41` keeps it beside the new wording |
| `A password needs at least 8 characters.` | `web/src/app/signup/page.tsx:53`, from `PASSWORD_TOO_SHORT` in `web/src/lib/password-reset.ts:100` | **ENFORCED IN THE APP; ACCOUNT-LEVEL DEPENDS ON THE SUPABASE SETTING, NOT VERIFIED.** New with #197. The sentence is drawn for `?problem=password` only (`web/src/app/signup/page.tsx:51`), and that code is sent by `signUp` at `web/src/app/auth/actions.ts:127-129` — which calls `passwordProblem` **before** `createClient()` and before `auth.signUp`, so a password this app refuses never reaches Supabase. **Same constant as the reset screen**, so the two cannot drift. Checked by `scripts/password-reset-check.mjs` §7b, including both orderings and three controls. **What it does not reach:** a caller using the public publishable key against Supabase Auth directly, who never passes through this action — there the project's own minimum is the only rule, and it is **not verified**. See §6 |
| `That did not work. Check the email address and password and try again.` | `web/src/app/signup/page.tsx:55-59` | `web/src/app/auth/actions.ts:139` sends `?problem=1` for any error Supabase returned, and `:88-90` for a post that did not come from this page's button. Deliberately does not say which half was wrong — unlike the password sentence above, which is safe to be specific because it is about the password just typed and says nothing about the address |
| `Check your email. We've sent you a link to confirm your account.` | `web/src/app/signup/page.tsx:62-67` | `web/src/app/auth/actions.ts:144` draws it only when Supabase returned no session, which is what a project that asks people to confirm does. **Whether an email actually went is not verified** — the sending, and the project's "Confirm email" setting, are Supabase's, and no template or setting for them exists in this repository (see §5). |
| `At least 8 characters. A password manager can make one for you.` | `web/src/app/signup/page.tsx:99`, the number from `PASSWORD_MIN_LENGTH` in `web/src/lib/password-reset.ts:91` | **ENFORCED IN THE APP; ACCOUNT-LEVEL DEPENDS ON THE SUPABASE SETTING, NOT VERIFIED (#197, done).** Two paths, and only one of them is this repository's to keep. **Through this app**: `signUp` refuses a short password at `web/src/app/auth/actions.ts:127-129`, before `createClient()` and before `auth.signUp`, with the same message the screen shows. It used to be kept only by the browser attribute `minLength={PASSWORD_MIN_LENGTH}` (`:95`), which a direct post skips; the attribute stays as the rule stated where somebody is typing, but is no longer the only thing applying it. **Round this app**: the publishable key is public and reaches the browser (`web/src/lib/env.ts:44`), so anybody holding it can call Supabase Auth's sign-up endpoint directly, bypass this action entirely, and get whatever minimum the **project** is set to. **On that path nothing in this repository applies, and the only floor is Supabase's own minimum — not verified**, in staging or production. See §6 |

### 1d. Sign in, `/login`

| The exact words | Where they appear | What makes them true |
|---|---|---|
| `See what's done, what's left, and which list it's on.` | `web/src/app/login/page.tsx:23` | **ENFORCED (#196, done)** — the same three citations as the home-page row in §1b |
| `Please sign in to finish.` | `web/src/app/login/page.tsx:49` | **ENFORCED, by asserting nothing about the account (#198, done)** — which is the whole repair. What has to be citable is only that signing in is available and does something: the form at `web/src/app/login/page.tsx:59-94` and `signIn` at `web/src/app/auth/actions.ts:68-85`, which signs the person in and sends them to `/tasks` at `:84`. **True on both paths that reach it** — a failed code exchange (`web/src/app/auth/callback/route.ts:24-27`) and a request with no code (`:16`). **One loose edge, named rather than hidden:** on the no-code path nothing was started, so "finish" is imprecise. It states no falsehood about the account, which is what #198 was filed for |
| ~~`Your email is confirmed. Please sign in.`~~ | **REMOVED (#198)** | **Recorded as a removal.** It was NOT ENFORCED: `?confirmed=1` is set only by the fall-through at `web/src/app/auth/callback/route.ts:37`, reached when the exchange **failed** (`:24-27`) and when there was **no code at all** (`:16`), while the success path goes to `/tasks` (`:25`). So it was drawn exactly where nothing in this app had seen a confirmation. The comment at `web/src/app/login/page.tsx:25-47` keeps the reasoning beside the new sentence |
| `That email and password don't match. Check them and try again.` | `web/src/app/login/page.tsx:55` | `web/src/app/auth/actions.ts:81` redirects here for any `signInWithPassword` error. **Note, not a defect:** `web/src/app/auth/actions.ts:74-76` gives the same sentence to a post that carried no recognised button identifier, where the stated cause is not the cause. That path is not reachable from this screen, and the file's comment at 78-81 says the single sentence is deliberate — telling the two apart would help somebody sort addresses into accounts and not-accounts. |

### 1e. Forgot password, `/forgot-password`

| The exact words | Where they appear | What makes them true |
|---|---|---|
| `Type the address you signed up with and we'll email you a link to set a new password.` | `web/src/app/forgot-password/page.tsx:34-37` | `web/src/app/auth/actions.ts:147-156` asks Supabase to send it. The sentence is conditioned on "the address you signed up with", which is the honest form: Supabase's own guide, quoted at `web/src/lib/password-reset.ts:25-27`, says no email is sent for an address with no account and the call still returns without an error. |
| `If that address has an account, we've sent a link` | the constant `RESET_SENT_MESSAGE`, `web/src/lib/password-reset.ts:29-30`, drawn at `web/src/app/forgot-password/page.tsx:39-43` | One constant, one exit: `outcomeAfterRequest` takes Supabase's answer and drops it (`web/src/lib/password-reset.ts:71-79`), and `requestPasswordReset` has no branch (`web/src/app/auth/actions.ts:158-162`). `scripts/password-reset-check.mjs` reads that action's source and requires no `if`, no ternary and no `&&` in it. |
| `The link lasts a short while and can be used once. Asking again sends a new one.` | `web/src/app/forgot-password/page.tsx:59-62` | Three claims. **"Asking again sends a new one"**: `web/src/app/auth/actions.ts:152` is called on every press. **"Can be used once"** in this app: the marker cookie is deleted the moment a password is set or refused (`web/src/app/auth/actions.ts:215`, `233`, `239`), so the form is not offered again. **"Lasts a short while"**: the recovery token's lifetime is a Supabase project setting — **not verified**, nothing in this repository states or constrains it. |

### 1f. Set a new password, `/reset-password`

| The exact words | Where they appear | What makes them true |
|---|---|---|
| `That link didn't work` | `web/src/app/reset-password/page.tsx:66` | `newPasswordView` (`web/src/lib/password-reset.ts:201-208`) returns `"dead"` for every state that is not a marker plus a session, so the heading is drawn exactly when the link did not work. |
| `That link has expired, has already been used, or was opened in a different browser. Ask for a new one.` | `DEAD_LINK_MESSAGE`, `web/src/lib/password-reset.ts:168-169`, drawn at `web/src/app/reset-password/page.tsx:67` | True because it names three causes and claims none of them, which is what one constant for four different failures requires (`web/src/lib/password-reset.ts:161-167`). |
| `Choose a new password for your account. This link works once.` | `web/src/app/reset-password/page.tsx:85-87` | The app's half: `web/src/app/auth/actions.ts:239` deletes the marker after a successful change, and `mayChangePassword` (`web/src/lib/password-reset.ts:187-192`) is asked by both the page and the action, so a second attempt is refused by the action and not only hidden by the screen. Supabase's own single-use recovery token is a project behaviour — **not verified** here. |
| `A password needs at least 8 characters.` | `PASSWORD_TOO_SHORT`, `web/src/lib/password-reset.ts:100`, drawn at `web/src/app/reset-password/page.tsx:89-93` | `passwordProblem` (`web/src/lib/password-reset.ts:107-113`), called at `web/src/app/auth/actions.ts:223` before `updateUser`. |
| `At least 8 characters. A password manager can make one for you.` | `web/src/app/reset-password/page.tsx:109-112` | Enforced on the server here, unlike sign-up: `web/src/app/auth/actions.ts:223`. |

### 1g. The invitation page, `/invite/[token]`

| The exact words | Where they appear | What makes them true |
|---|---|---|
| `If you were invited, sign in to accept it.` | `web/src/app/invite/[token]/page.tsx:122` | **ENFORCED (#199, done).** Two halves. **The conditional** carries the uncertainty the old heading asserted — the page still looks nothing up, deliberately (`web/src/app/invite/[token]/page.tsx:63-77`), so claiming an invitation exists would be claiming something unchecked. **"accept it"** is what a signed-in person is actually offered: the Accept form at `web/src/app/invite/[token]/page.tsx:139-149`, which posts to `acceptInvite`, and `accept-invite` performing the acceptance at `supabase/functions/accept-invite/index.ts:455-456` after its four refusals at `:374-400` |
| ~~`You have been invited`~~ | **REMOVED (#199)** | **Recorded as a removal.** It was NOT ENFORCED: drawn flatly for any string in the address, because the page looks nothing up. A made-up link got the same confident heading as a real one, on our own domain and in our styling. §4a row 3 carries the argument, including why "see it" could not be used and "accept it" could |
| `Accepting adds you to the team.` | `web/src/app/invite/[token]/page.tsx:121` | `supabase/functions/accept-invite/index.ts:455-456` inserts the `team_members` row, after the four refusals at 374-400. |
| `If you are signed in as somebody else, the invitation will be refused: it only works for the address it was sent to.` | `web/src/app/invite/[token]/page.tsx:135-138` | `supabase/functions/accept-invite/index.ts:394-400` compares the invitation's address with the signed-in person's, both lowercased (`261`, and the constraint `invitations_email_lowercase` at `supabase/migrations/20260930193813_create_invitations.sql:72`). `supabase/config.toml:49` keeps `verify_jwt = true`, which is what makes "the signed-in person" trustworthy. |
| `To accept this invitation, sign in with the email address it was sent to — or sign up with that address if you do not have an account yet. Then open this link again.` | `web/src/app/invite/[token]/page.tsx:142-146` | `supabase/functions/accept-invite/index.ts:246-261` refuses a caller with no address on the token; `394-400` refuses the wrong one. |
| `The invitation must be accepted within 7 days of being sent. It only works for the address it was sent to, so signing in with a different one will not accept it.` | `web/src/app/invite/[token]/page.tsx:157-161`, the number from `INVITATION_DAYS` in `web/src/lib/teams.ts:219` | `supabase/functions/invite-member/index.ts:82` and `1265` set `expires_at` seven days out; `supabase/functions/accept-invite/index.ts:382-388` refuses an expired one. The address half as the row above. |
| `This invitation link is not valid. It may have been withdrawn, or the link may be incomplete — check you copied the whole thing from the email.` | `web/src/app/invite/[token]/page.tsx:25-26` | `supabase/functions/accept-invite/index.ts:358-364` answers `not_found` when no row has that token hash. |
| `This invitation has expired. Invitations last 7 days — ask the team's owner to send a new one.` | `web/src/app/invite/[token]/page.tsx:27` | `supabase/functions/accept-invite/index.ts:382-388`. |
| `This invitation has already been used.` | `web/src/app/invite/[token]/page.tsx:33` | `supabase/functions/accept-invite/index.ts:374-380`, checked before expiry for the reason given at 370-373. |
| `This invitation was sent to a different email address. Sign in with the address it was sent to, then open the link again.` | `web/src/app/invite/[token]/page.tsx:34-35` | `supabase/functions/accept-invite/index.ts:394-400`. |
| `Please sign in again, then open this link once more. Your sign-in could not be checked.` | `web/src/app/invite/[token]/page.tsx:36-37` | `supabase/functions/accept-invite/index.ts:246-261` (no usable identity on the token). |
| `This invitation could not be accepted. Please try again.` | `web/src/app/invite/[token]/page.tsx:38` | The generic refusal; `supabase/functions/accept-invite/index.ts:343-357` is one way to reach it. Claims nothing beyond "it did not happen". |
| `You can't do that at the moment.` | `web/src/app/invite/[token]/page.tsx:49` | `supabase/functions/accept-invite/index.ts:277` reads `account_status` and refuses a suspended caller with the `account_suspended` code; the code is only honoured because it is on the list at `web/src/lib/teams.ts:276-285`. |
| `Could not reach the server to accept this invitation. Please try again.` | `web/src/app/invite/[token]/page.tsx:50-51` | Added by the action, not the function, when nothing was reached — the `unreachable` entry in `web/src/lib/teams.ts:276-285`. |

**One structural fact about this page, which is what keeps all of the above honest:** every message is
chosen from a fixed list keyed by a short code (`web/src/app/invite/[token]/page.tsx:24-59`), and an
unrecognised code shows nothing. Nothing from the address bar is printed, so a crafted link cannot make
this site display words somebody else wrote.

---

## 2. Claims the app makes after sign-in that a person relies on

Limits, privacy and what the Suggest subtasks panel says, as issue #194 asks, plus the refusal messages
that tell somebody what the rules are.

### 2a. Privacy — who can see what

| The exact words | Where they appear | What makes them true |
|---|---|---|
| `Personal — no one else on Team Tasks can see it.` (the chooser option, on the add form and on Move to…) | `web/src/app/tasks/page.tsx:369` and `:759`; and as the first sentence of the hint at `:378` and of both move hints at `:788-789` | **ENFORCED (#202, done).** **The policy**: `supabase/migrations/20261002133637_tasks_join_teams.sql:137-144` returns a row to its creator, or to a member of its team when `team_id` is not null — so a row with `team_id` null reaches nobody else. **The test**: `web/tests/access-rules.test.mjs:372-384`, "Bob CANNOT read Alice's personal task", whose `:379` asserts the row Bob is refused actually exists, so the refusal is not vacuous. It runs against staging in CI (`.github/workflows/ci.yml:640-714`, with a floor of 25 and skips refused). **"on Team Tasks" is the scope that makes this exact** — it is a claim about other people using the app, and the sentence below now says what that leaves out |
| `The person who runs this app can access the database.` — **new with #202** | `web/src/app/tasks/page.tsx:379` (the add form's hint) and `:788-789` (both move hints) | **ENFORCED in the only way a disclosure can be: by being true and being said.** What makes it true is the absence of any rule that could stop it — row-level security constrains the `authenticated` and `anon` roles, and the dashboard connects as the project owner, so every policy in `supabase/migrations/` is beside the point for that caller. `docs/plan.md`'s appendix has recorded it from the start: the "Task text" row's "Who can see it" column names the owner, and its "Owner" note defines that as anyone with Supabase or Vercel dashboard access. **This is the sentence that was missing from the screen**, and it is the half of #202 the owner asked for alongside the reword. **It is NOT the privacy page** that decision also asked for — see the §6 entry and the new issue filed with this change |
| ~~`Personal — only you`~~ and ~~`A personal task is yours alone`~~ | **REPLACED (#202)** | **Recorded as a replacement.** Both were enforced against every request through the app, and both were wider than the policy in one way the screen never mentioned: whoever holds the dashboard reads every row. "Only you" meant "only you, of the people using this app" — on the one screen where somebody is about to type something, beside a box asking them not to put personal details in it. The two sentences above are what replaced them |
| `Personal — no one else on Team Tasks can see it. The person who runs this app can access the database. Everyone in a team can see, tick and rename that team's tasks; only the person who added a task can delete it.` | `web/src/app/tasks/page.tsx:377-382` | Four claims, four things that keep them. **No one else on Team Tasks**: the select policy, `supabase/migrations/20261002133637_tasks_join_teams.sql:137-144`, and the staging test in the row above. **The operator**: the row above, second entry. **Tick and rename**: the update policy, same file `:166-177`. **Only the creator can delete**: the original owner-only delete policy, `supabase/migrations/20260927182443_create_tasks.sql:73-77`, deliberately left standing — `supabase/migrations/20261002170244_tasks_drop_owner_only_rules.sql:202-207` says why it was not dropped. The first two sentences replaced "A personal task is yours alone" (#202) |
| `Everyone in a team can see, tick and rename that team's tasks. Moving a task to Personal means no one else on Team Tasks can see it. The person who runs this app can access the database.` | `web/src/app/tasks/page.tsx:789` | As the row above, plus the trigger that decides which columns may change: `tasks_enforce_column_rules()` in `supabase/migrations/20261002133637_tasks_join_teams.sql` (part 3, from line 260). The tail replaced "takes it back to you alone" (#202), which was the same claim as "only you" in different words |
| `This task is in a team you are no longer in, so you cannot tick or rename it while it stays there. Moving it to Personal means no one else on Team Tasks can see it. The person who runs this app can access the database.` | `web/src/app/tasks/page.tsx:788` | The stranded case, which keeps its own first sentence because that is the only thing telling somebody how to get out of a rule they cannot see — `web/src/lib/tasks.ts:246-257` is where the rule is written down. Its tail got the same two sentences as the row above, for the same reason (#202) |
| `A nickname of up to 40 characters, shown to your team mates. Please not your full name.` | `web/src/app/teams/page.tsx:378-381`, the number from `DISPLAY_NAME_MAX` in `web/src/lib/teams.ts:236` | **40**: `profiles_display_name_length` at `supabase/migrations/20261002122203_team_rules.sql:174-175`, with `profiles_display_name_not_blank` at `173`. **Shown to your team mates**: the profiles select policy at `supabase/migrations/20261002122203_team_rules.sql:228`, read through the `team_roster` view at `423-424`, which is `security_invoker = true` so the policies decide what comes back. "Please not your full name" is a request, not a claim; nothing enforces it and nothing could. |
| `Signed in as <the address>` (visually hidden label plus the address) | `web/src/app/components/Header.tsx:112-115`, wording from `accountLabel` in `web/src/lib/words.ts:105-107` | The address comes from `supabase.auth.getClaims()`, which verifies the token's signature, and is passed in by the page that already checked the session (`web/src/app/tasks/page.tsx:96-97` and `313`). With no `email` claim it says `Signed in` instead of inventing a name (`web/src/lib/words.ts:92`). |
| `Unnamed member` / `Owner` / `Member` / `Role not known` | `web/src/lib/words.ts:83`, `122-125`, `134`, drawn at `web/src/app/teams/page.tsx:123` and `130` | The members list has no email column to fall back to: `team_roster` does not select one (`supabase/migrations/20261002122203_team_rules.sql:423-448`). `scripts/friendly-words-check.mjs` reads the two role literals out of that migration and fails if either has no word. |

### 2b. Limits

| The exact words | Where they appear | What makes them true |
|---|---|---|
| `A task needs some text, and no more than 200 characters.` | `web/src/app/tasks/page.tsx:416-420`, the number from `TITLE_MAX` in `web/src/lib/tasks.ts:29` | `web/src/app/tasks/actions.ts:64` refuses it in the action, and `tasks_title_length` / `tasks_title_not_blank` at `supabase/migrations/20260927182443_create_tasks.sql:31-35` refuse it in the database. |
| `You own 3 teams, the most allowed.` (the number is counted) | `web/src/app/teams/page.tsx:436-438`, counted at `349-350` from `MAX_TEAMS_PER_OWNER` in `web/src/lib/teams.ts:37` | `supabase/functions/create-team/index.ts:293-297` counts the caller's teams with the admin client and refuses at 3; `272-291` refuse rather than treat a failed count as zero. The note on screen is only a warning — the function is what says no (`web/src/app/teams/page.tsx:331-339` explains why the form is not hidden). |
| `You already own 3 teams, the most allowed, so no team was created.` | `CREATE_TEAM_SENTENCES.conflict`, `web/src/lib/teams.ts:429` | As the row above. The sentence's number is this repository's own constant interpolated at build time, never a number read back from the function (`web/src/lib/teams.ts:417-420`). |
| `Up to 60 characters. Please pick a name that does not identify the members.` | `web/src/app/teams/page.tsx:456-459`, the number from `NAME_MAX` in `web/src/lib/teams.ts:36` | `supabase/functions/create-team/index.ts:256-258` refuses a longer name, and `teams_name_length` at `supabase/migrations/20260930101343_create_teams.sql:46` is the backstop. The second sentence is a request; nothing enforces it. |
| `They get a link that works for 7 days, and only for that address. A team may have up to 20 invitations waiting.` | `web/src/app/teams/page.tsx:661-665`, numbers from `INVITATION_DAYS` and `MAX_PENDING_INVITATIONS` in `web/src/lib/teams.ts:218-219` | **7 days**: `supabase/functions/invite-member/index.ts:82` and `1265`, refused on acceptance at `supabase/functions/accept-invite/index.ts:382-388`. **Only that address**: `supabase/functions/accept-invite/index.ts:394-400`. **20 waiting**: `supabase/functions/invite-member/index.ts:1045-1073`, which counts rows that are neither accepted nor expired and refuses at 20, and refuses rather than guessing when the count cannot be read. |
| `3 of 20 invitations waiting:` (the first number is counted) | `web/src/app/teams/page.tsx:693-696` | Counted from the rows this page just read (`web/src/app/teams/page.tsx:216-223`, grouped at `270-275`), filtered to the same definition of pending the function counts against, so the list and the limit cannot disagree. |
| `1 person` / `4 people in this team:` | `web/src/app/teams/page.tsx:98-101` | Counted from the `team_roster` rows the database returned for that team; nothing is claimed when the read failed (`web/src/app/teams/page.tsx:85-90`). |
| `4 of 9 tasks done in Tuesday crew` (both numbers counted) | `web/src/app/tasks/page.tsx:322-328`, counted at `273` | Counted from exactly the rows about to be drawn (`web/src/app/tasks/page.tsx:258-273`), and drawn only when the read succeeded — `screenState` puts a failed read ahead of any row count (`web/src/lib/screen-state.ts`, used at `294-297`). |

### 2c. The Suggest subtasks panel

| The exact words | Where they appear | What makes them true |
|---|---|---|
| `Nothing is saved until you press Add.` | `web/src/app/tasks/page.tsx:945-950` | `supabase/functions/suggest-subtasks/index.ts` performs **no database write at all** — searched it for `.insert(`, `.update(`, `.delete(` and `.upsert(` in this session; the only hit is `IN_FLIGHT.delete(userId)` at line 566, which is an in-memory map. The only thing that writes is the Add form, which posts the existing `addTask` action (`web/src/app/tasks/page.tsx:971-991`, action at `web/src/app/tasks/actions.ts:64-145`). |
| `Suggested subtasks` (the heading, drawn only when there is at least one) | `web/src/app/tasks/page.tsx:943-950` | `suggestOutcome` answers `unavailable` rather than handing the page an empty list (`web/src/lib/suggestions.ts:143-147`), so a heading with nothing under it cannot be drawn. |
| `Suggestions aren't available right now.` | `SUGGESTIONS_UNAVAILABLE`, `web/src/lib/suggestions.ts:60`, drawn at `web/src/app/tasks/page.tsx:933-935` | One sentence for every failure, including the no-key case: `suggestOutcome` checks `failed` before the data (`web/src/lib/suggestions.ts:131`), and the function reduces every cause to a code that never reaches the screen (`supabase/functions/suggest-subtasks/index.ts:241-295`). On production it is literally true today — `docs/plan.md:180-184` says no production key is installed. |
| What the panel does **not** say, and why it matters here: the words `Add` beside each suggestion | `web/src/app/tasks/page.tsx:984-990` | The suggestion travels in a hidden field and is drawn beside the button as text (`web/src/app/tasks/page.tsx:977` and `983`), so what is agreed to is what is sent. It then goes through the same action, the same length check and the same insert as a task somebody typed — which is what `docs/plan.md:155-158` promises. |

### 2d. Refusals — sentences that tell somebody what a rule is

| The exact words | Where they appear | What makes them true |
|---|---|---|
| `You cannot do that. A task can only be added to a team you belong to.` | `web/src/app/tasks/page.tsx:461-466` | The insert policy at `supabase/migrations/20261002133637_tasks_join_teams.sql:193-200`, and `tasks_enforce_column_rules()` in the same migration. |
| `That task was not moved. Only the person who created a task can move it, and only to Personal or to a team they belong to.` | `web/src/app/tasks/page.tsx:473-478` | The update policy's `with check` at `supabase/migrations/20261002133637_tasks_join_teams.sql:174-177` and the trigger, which refuses a `team_id` change by anybody but the creator. |
| `That task is in a team you are no longer in, so it cannot be ticked or renamed while it stays there. Use Move to… on the task to bring it back to Personal, and you can tick and rename it again.` | `web/src/app/tasks/page.tsx:484-490`, and the shorter form at `757-758` | The reasoning is written out at `web/src/lib/tasks.ts:246-257`: once `supabase/migrations/20261002170244_tasks_drop_owner_only_rules.sql:189` dropped the old owner-only update rule, the surviving `with check` refuses a finished row that is neither personal-and-yours nor in a team you belong to. |
| `That task was not deleted. Only the person who created a task can delete it — or it may have been deleted already.` | `web/src/app/tasks/page.tsx:520-525` | `supabase/migrations/20260927182443_create_tasks.sql:73-77`. Names both possibilities and claims neither, because a refused delete matches no row rather than failing. |
| `That is not one of your lists, so nothing changed. Please choose Personal or one of your teams.` | `web/src/app/tasks/page.tsx:425-430` | `resolveFilter` / `readFilter` throw away anything that is not `personal` or a team the database returned (`web/src/lib/tasks.ts:81-122`), and the insert policy refuses the rest. |
| `Only the team's owner can invite people, so nothing was sent.` | `INVITE_SENTENCES.refused`, `web/src/lib/teams.ts:439` | `supabase/functions/invite-member/index.ts` refuses a non-owner with 403 — proved on staging by `scripts/staging/bob-invites-to-alices-team.mjs`, as `web/src/app/teams/page.tsx:176-181` records. |
| `No invitation was sent. That address may already be in the team, may already have one waiting, or may be your own — and a team may have at most 20 invitations waiting.` | `INVITE_SENTENCES.conflict`, `web/src/lib/teams.ts:444-446` | Three refusals share one HTTP 409, so the sentence names all three and claims none. The limitation is written down at `web/src/lib/teams.ts:321-327`, and the follow-up — a code per refusal — is recorded there as filed. |
| `You can't do that at the moment.` (both actions) | `web/src/lib/teams.ts:426` and `438` | `supabase/functions/create-team/index.ts:217` and `supabase/functions/invite-member/index.ts:845` read `account_status` and refuse a suspended caller; the five restrictive policies at `supabase/migrations/20261004114313_suspend_accounts.sql:359-404` are the database half. |
| `Invitation sent.` and `Invitation sent again, with a new link. The earlier link no longer works.` | `web/src/app/teams/page.tsx:503-524` | The action reads `invitation.status` out of the function's answer and picks the parameter from it (`web/src/app/teams/page.tsx:495-499` records this), so the banner cannot say "sent" while the list says "sending". `supabase/functions/invite-member/index.ts:1345-1351` is the send. |
| `This environment sends all invitation email to the test inbox, not to the invited address.` | `web/src/app/teams/page.tsx:507` and `521` | `decideDelivery` at `supabase/functions/invite-member/index.ts:706-716`: if `EMAIL_TEST_INBOX` is set at all, it wins over `EMAIL_DELIVERY` and the message goes there. |
| `Team created.` | `web/src/app/teams/page.tsx:473-476` | Said only after the action read the row back out of the database, not because the function answered 201 — `web/src/app/teams/page.tsx:469-471` records the change. |
| `The team may have been created, but we could not read it back, so it is not confirmed. Look for it below before creating it again.` | `web/src/app/teams/page.tsx:482-487` | True by construction: the list underneath is read in the same request, so the sentence and the list cannot disagree. |
| `You have joined the team.` | `web/src/app/teams/page.tsx:540-544` | Said after the membership was read back as a team this person can now see; the write is `supabase/functions/accept-invite/index.ts:455-456`. |
| `sending` / `sent` / `could not be sent`, beside one waiting invitation | `web/src/lib/words.ts:171-177`, chosen in `invitationDelivery` at `web/src/lib/teams.ts:149-213`, drawn at `web/src/app/teams/page.tsx:709-711` | The three words map the three values `invitations_status_allowed` permits (`supabase/migrations/20261006095847_invitation_status.sql:104-105`), and `scripts/friendly-words-check.mjs` reads that constraint and fails if a value has no word. A stored failure **code** is never printed: one sentence per code at `web/src/lib/teams.ts:114-120`, with a fallback that prints nothing at `130-131`. |
| `Not arrived? Ask them to check their junk or spam folder.` | `web/src/app/teams/page.tsx:768-771` | Promises nothing, on purpose: the reasoning at `753-767` says the app cannot tell a filtered email from a delivered one, so no claim is made about where any message went. |
| The failed-read sentences — `Your tasks could not be loaded, so nothing below is a list of them.`, `Your teams could not be loaded…`, `Pending invitations could not be loaded…`, `The members lists could not be loaded…`, `Your name could not be loaded…`, `This team's members could not be loaded.` | `web/src/app/tasks/page.tsx:533-538`, `552-556`; `web/src/app/teams/page.tsx:89`, `414-419`, `585-598`, `604-610` | `screenState` in `web/src/lib/screen-state.ts` puts `failed` ahead of the row count, so a failed read can never be drawn as an empty list or counted; checked by `scripts/screen-state-check.mjs`. No database message, code or status appears in any of them. |
| `No tasks yet` / `No tasks in this list yet` / `No teams yet` / `You do not own a team yet.` / `You are not a member of anybody else's team.` / `No invitations waiting.` | `web/src/app/tasks/page.tsx:590-595`; `web/src/app/teams/page.tsx:615`, `621-623`, `784-787`, `688-690` | Each is drawn only on the empty look, never the error look — same function and same check script as the row above. `No invitations waiting.` is additionally suppressed when the invitations read failed (`web/src/app/teams/page.tsx:688`). |

---

## 3. Testimonials, numbers and screenshots, and where each came from

**Testimonials: none.** No quote, endorsement, review, star rating, user count or logo appears on any
screen. Searched the pages and components for one; there is nothing of the kind to report.

**Screenshots and images: none on any screen.** `web/public/` holds five SVGs — `file.svg`, `globe.svg`,
`next.svg`, `vercel.svg`, `window.svg` — left over from `create-next-app`, and **none is referenced by
any file in `web/src/`**: searched `web/src/` for each filename, for `<img` and for `next/image` in this
session; the only matches are the Proxy's path pattern at `web/src/proxy.ts:15` and `19`. The only
drawn graphics are two inline SVGs written in this repository: the ticked box in
`web/src/app/components/Header.tsx:11-41` and the tick in `web/src/app/tasks/page.tsx:40-57`, plus
`web/src/app/favicon.ico`. `docs/design/team-tasks-screens.pdf` is a design file; nothing serves it.

**Every number on a screen, and its source.**

| The number | Where it is shown | Where it came from |
|---|---|---|
| `8` characters | `web/src/app/signup/page.tsx:68-71`, `web/src/app/reset-password/page.tsx:109-112`, `web/src/lib/password-reset.ts:100` | `PASSWORD_MIN_LENGTH`, `web/src/lib/password-reset.ts:91`. The app's own floor; Supabase's project minimum is separate and **not verified**. |
| `7` days | `web/src/app/invite/[token]/page.tsx:27`, `158`; `web/src/app/teams/page.tsx:662` | `INVITATION_DAYS`, `web/src/lib/teams.ts:219`, from `docs/plan.md` feature 3. Enforced copy: `supabase/functions/invite-member/index.ts:82`. |
| `20` invitations | `web/src/app/teams/page.tsx:664`, `694`; `web/src/lib/teams.ts:446` | `MAX_PENDING_INVITATIONS`, `web/src/lib/teams.ts:218`. Enforced copy: `supabase/functions/invite-member/index.ts:71`. |
| `3` teams | `web/src/lib/teams.ts:429`; and counted at `web/src/app/teams/page.tsx:436-438` | `MAX_TEAMS_PER_OWNER`, `web/src/lib/teams.ts:37`. Enforced copy: `supabase/functions/create-team/index.ts:66`. |
| `60` characters | `web/src/app/teams/page.tsx:457`; `web/src/lib/teams.ts:425` | `NAME_MAX`, `web/src/lib/teams.ts:36`. Enforced copies: `supabase/functions/create-team/index.ts:65`, `teams_name_length`. |
| `40` characters | `web/src/app/teams/page.tsx:379` | `DISPLAY_NAME_MAX`, `web/src/lib/teams.ts:236`. Enforced by `profiles_display_name_length`. |
| `200` characters | `web/src/app/tasks/page.tsx:418` | `TITLE_MAX`, `web/src/lib/tasks.ts:29`. Enforced by `web/src/app/tasks/actions.ts:64` and `tasks_title_length`. |
| The done count and the list length (`4 of 9`) | `web/src/app/tasks/page.tsx:322-327` | Counted from the rows being drawn, `web/src/app/tasks/page.tsx:273`. |
| The waiting-invitation count | `web/src/app/teams/page.tsx:694` | Counted from the rows read in the same request, `web/src/app/teams/page.tsx:216-223`. |
| The member count | `web/src/app/teams/page.tsx:99-100` | Counted from the `team_roster` rows for that team. |
| The owned-team count | `web/src/app/teams/page.tsx:437` | Counted from the teams read in the same request, `web/src/app/teams/page.tsx:182`. |
| The short commit in the footer | `web/src/app/components/Footer.tsx:32` | `VERCEL_GIT_COMMIT_SHA`, via `web/next.config.ts:47-48`; seven characters because that is what `git log --oneline` prints (`web/src/lib/app-version.ts:58-61`). |
| An invitation's expiry date (`3 October 2026`) | `web/src/app/teams/page.tsx:709-710`, formatted at `60-68` | `invitations.expires_at`, written by `supabase/functions/invite-member/index.ts:1265`. |

**No number on any screen is an achievement, a benchmark or a count of users.** Every one is either a
limit from `docs/plan.md` or a count of rows the same request just read.

---

## 4. The NOT ENFORCED rows, the proposals, and the owner's decisions

Six rows, plus one that is enforced and narrower than its words. Issue #194 asked for a proposal per row
and for no change. **The owner decided all seven on 2026-10-07**, and each decision is recorded against
its row below, with the issue it will be carried out in.

**ALL SEVEN ARE NOW CARRIED OUT.** The decisions were recorded in the pull request that merged as
`docs/claims.md`; the screens were changed in the one after it, and the rows in §1 and §2 above now cite
the file and line that makes each new claim true, or record the removal. §4a carries the before-and-after.
**What is left of these seven is one thing and it is not on a screen**: the privacy page that #202's
decision also asked for, which does not exist — see §6 and the issue filed for it.

**The sections below are kept as they were written**, as the record of what was wrong and why each choice
was made. They are history now, not a to-do list: "NOT ENFORCED" in them describes the state before the
fix, and each decision block says what was done.

**THE RULE THE OWNER SET FOR EVERY REWORD, and it governs §4a below:** new wording is a new claim. It gets
its own row with the file and line that make it true. **If no line can be cited, the decision becomes
"remove the words" instead.** That rule is what produced the one deviation flagged in §4a — the wording
decided for #199 cannot be cited while the page is forbidden to look an invitation up, so a citable
variant was proposed instead. **The owner accepted that variant on 2026-10-07**, so the rule was followed
rather than waived: the heading that shipped is the one with a citation.

**1. `See what's done, what's left and who's doing it.`** (#196) — home page, sign-in page and the page
description (`web/src/app/page.tsx:14-16`, `web/src/app/login/page.tsx:18-20`,
`web/src/app/layout.tsx:22`). No screen shows who created a task, and no column records who ticked one.

- *Make it true*: draw the creator's nickname on each team task, from `team_roster`, and add a column
  recording who last changed `done`. Both are new personal data on a screen and a new column, so they
  are a `docs/plan.md` change first, not a code change — and the appendix row "Who created and who
  ticked off each task" already claims the second one exists, which it does not.
- *Remove the words*: change the third clause to something the app does do, in the three places above.

> **DECIDED 2026-10-07 — remove.** Replace only with wording that describes what the screen actually
> shows. The replacement and its citations are row 1 of §4a. The appendix row in `docs/plan.md` still
> claims who-ticked-it is stored and is corrected in the same pull request as the screens (#196).

**2. `Free for your volunteer group.`** (#201) — `web/src/app/signup/page.tsx:23`. True today, and no file can
keep it true.

- *Make it true*: nothing in code can. The nearest honest thing is to say for how long, or to say what
  it is free of.
- *Remove the words*: drop the line, or narrow it to a fact about the app as built rather than a promise
  about next year.

> **DECIDED 2026-10-07 — remove.** Replace with `No card needed to sign up.` **only if no payment flow
> exists anywhere in the repository.** That condition was checked in this session and is met — the
> evidence is in row 4 of §4a, and it is the whole reason the replacement is allowed.

**3. `At least 8 characters.` on sign-up** (#197) — `web/src/app/signup/page.tsx:68-71`. Enforced only by a
browser attribute; `signUp` never checks it.

- *Make it true*: call `passwordProblem` in `signUp` (`web/src/app/auth/actions.ts:87-109`) before
  `supabase.auth.signUp`, exactly as `setNewPassword` does at line 223, and redirect to
  `/signup?problem=1`. This is the recommended one: the check already exists, it is already tested by
  `scripts/password-reset-check.mjs` on the other path, and the words are already on the screen.
- *Remove the words*: not sensible — the number would still be in the `minLength` attribute, and
  removing the sentence would leave a rule nobody is told about.

> **DECIDED 2026-10-07 — make it true.** A server-side check in `signUp`, carrying **the same message as
> the browser check**, **with a test**. The words on screen do not change, so this adds no row to §4a:
> what changes is the "What makes them true" cell for this claim in §1c, which says NOT ENFORCED today and
> will cite the new line in `web/src/app/auth/actions.ts` once the fix lands. The same message means
> `PASSWORD_TOO_SHORT` (`web/src/lib/password-reset.ts:100`), which is already the one constant both
> password screens use. **Not done in this pull request** — the owner put it in the next one.
>
> One warning carried forward for whoever writes it: `scripts/password-reset-check.mjs` reads these
> actions' source and counts branches and exits, and uses `signIn` as its deliberate control. If a new
> guard moves those counts, the fix is the code and never the check (rule 20).
>
> **DONE 2026-10-07 — AND HERE IS THE LIMIT OF WHAT IT ACHIEVED, which the owner named and this register
> had overstated.** The guard is in (`web/src/app/auth/actions.ts:127-129`) and tested
> (`scripts/password-reset-check.mjs` §7b). But it binds **callers who go through this app**, and the app is
> not the only way to reach the account system: the publishable key is public and is inlined into the browser
> bundle (`web/src/lib/env.ts:44`), so anybody holding it can POST to Supabase Auth's sign-up endpoint
> directly and never execute a line of this repository. On that path the **project's own minimum password
> length** is the only floor, it lives in a dashboard, and it is **not verified** — §6 carries it, and both
> §1c password rows now say so rather than claiming the screen's words are enforced outright.
>
> **Why that is a real limit and not a quibble.** "Enforced" in this file has always meant "something would
> refuse the thing the words promise". For a person using the app, something now does. For the account that
> gets created, the answer is the dashboard's and nobody here has read it. The row therefore reads **enforced
> in the app; account-level depends on the Supabase setting, not verified** — which is the honest shape, and
> is the same shape as the `minLength` attribute it replaced, one layer further out.

**4. `Your email is confirmed. Please sign in.`** (#198) — `web/src/app/login/page.tsx:22-26`, reached only from
the fall-through at `web/src/app/auth/callback/route.ts:37`, which is also where a request with no code
at all lands.

- *Make it true*: give the two causes two different destinations — a failed exchange keeps
  `?confirmed=1`, and a request with no code goes to `/login` with nothing set. That still rests on the
  reasoning at `web/src/app/auth/callback/route.ts:29-32` (Supabase has confirmed the address by the
  time the link is followed), which nothing here has observed.
- *Remove the words*: say what is known instead, which is true on both paths and sends the person to the
  same place.

> **DECIDED 2026-10-07 — replace with `Please sign in to finish.`** Row 2 of §4a. The claim about the
> account is gone, which is the point: the sentence no longer asserts anything that the fall-through
> cannot support.

**5. `You have been invited`** (#199) — `web/src/app/invite/[token]/page.tsx:106`. Drawn for any string in the
address, because the page deliberately looks nothing up.

- *Make it true*: it cannot be made true without looking the invitation up, and the comment at
  `web/src/app/invite/[token]/page.tsx:63-77` gives two good reasons not to — the page is public, and a
  mail scanner fetching the link must not be able to learn anything. Making it true would undo both.
- *Remove the words*: this is the recommended one. A heading that claims nothing, with the sentence
  underneath already explaining what to do.

> **DECIDED 2026-10-07 — replace**, with wording like `If you were invited, sign in to see it.`, and
> **no invitation lookup before sign-in**. Row 3 of §4a, which is the one row carrying a flagged
> deviation: with no lookup — before *or* after sign-in, since the page never looks one up in either
> state — nothing makes "see it" true, so by the owner's own rule a citable variant is proposed instead.
> **RESOLVED 2026-10-07: the owner accepted the variant.** The heading now reads
> `If you were invited, sign in to accept it.` (`web/src/app/invite/[token]/page.tsx:122`), and §1g carries
> its citations.

**6. `Nothing you were doing has been lost unless a message said so.`** (#200) —
`web/src/app/error.tsx:57-62`.
Nothing in this repository establishes it. An error boundary catches a throw during render, and a throw
that happens *after* a write has already landed reaches the same screen; the hedge "unless a message
said so" does not cover it, because in that case there is no message.

- *Make it true*: nothing can make a general promise about unrelated writes true.
- *Remove the words*: this is the recommended one. Drop the sentence; what remains — "This screen could
  not be shown. The details have gone to the owner." — is true and is the part a person needs.

> **DECIDED 2026-10-07 — remove the sentence.** No replacement, so **no row in §4a**: removing words
> makes no new claim, which is the one case the owner's rule does not have to cover. What remains on the
> screen is already in §1a with its citations, and it matches `global-error.tsx:57-60`, which never made
> this claim.

**And one more, for the owner to decide rather than a NOT ENFORCED row (#202).**
`Personal — only you` (`web/src/app/tasks/page.tsx:353`, `736`) and `A personal task is yours alone`
(`web/src/app/tasks/page.tsx:361`) **are** enforced, by the select policy at
`supabase/migrations/20261002133637_tasks_join_teams.sql:137-144`, against every request that goes
through the app. They are wider than that policy in one way the screen does not mention: `docs/plan.md`'s
appendix records the owner as able to read task text through the Supabase dashboard, for every row in
the table. "Only you" means "only you, of the people using this app". Worth a decision because it is the
app's strongest privacy claim and it is made in the one place somebody is about to type something.

- *Make it true*: not possible on this stack. Whoever holds the database holds the rows.
- *Change the words*: `Personal — only you and the owner` is accurate and clumsy;
  `Personal — not shared with your teams` says exactly what the policy does.

> **DECIDED 2026-10-07 — replace with `Personal — no one else on Team Tasks can see it.`** Row 5 of §4a,
> which cites the read policy and the staging test the owner asked for by name.
>
> **AND: the privacy page must say the operator can access the database.** **There is no privacy page.**
> Checked in this session: `git ls-files` matching `privacy`, `terms` and `legal` returns nothing, and
> `web/src/app` holds eight `page.tsx` files — the front page, sign-up, sign-in, both password screens,
> the invitation page, My tasks and My teams — none of which is one. A search of `web/src` for `privacy`
> finds no match. The new wording's own accuracy does not depend on it — "no one else **on Team Tasks**" is
> a claim about other people using the app, and the operator reaches rows through the Supabase dashboard
> rather than through Team Tasks — but the disclosure the owner asked for had nowhere to live.
>
> **WHAT WAS DONE ABOUT IT, 2026-10-07.** The owner then asked for the operator sentence to go on the screen
> as well, in the same place as the reword, and that is done: `The person who runs this app can access the
> database.` is in the hint beside both choosers (`web/src/app/tasks/page.tsx:379` and `:788-789`), with its
> own register row in §2a. The PAGE remains missing, and it is now a **release gate** rather than a gap:
> [#204](https://github.com/build-once/team-tasks/issues/204), and `docs/plan.md`'s consent entry names a
> privacy page as a precondition for installing the production `AI_API_KEY`. Writing its words is the
> owner's — they carry legal weight.
>
> **One judgement made while carrying this out, and worth recording because nobody asked for it.** The
> decision said both sentences go where the old claim was, and the old claim was in two kinds of place: an
> `<option>` label inside a `<select>`, and the hint paragraph beneath it. An option label cannot carry two
> sentences — it is a label in a list somebody scrolls past, and a disclosure buried there is a disclosure
> nobody reads. So the label carries the first sentence and the hint carries both. The hint is tied to the
> chooser by `aria-describedby`, so a screen reader gets the two together.

---

## 4a. The decided new wording, and what makes each new claim true

The owner's rule, applied. One row per new claim, each with the file and line that makes it true.

**ALL OF IT IS ON A SCREEN NOW.** This table was written when the wording was decided and nothing had been
changed; #196, #198, #199, #201 and #202 then landed together. The "Where it will go" column has been kept
in the future tense as it was written, because the live citations are the rows in §1 and §2 above and
duplicating them here would give two places to update and one of them would go stale. What this table is
for is the **argument** — why each wording was chosen, and what was rejected.

**Row 3's "awaiting the owner's word" is resolved.** The owner accepted the variant on 2026-10-07: the
heading reads `If you were invited, sign in to accept it.` The row below is left as it was written, because
the reasoning is why the decided wording could not be used, and that reasoning is the thing worth keeping.

Two of the seven decisions produce no row, for two different reasons, and both are stated in §4 rather
than left to inference: **#200** removes a sentence and adds no claim, and **#197** keeps its existing
wording and changes only what enforces it.

| # | The new wording | Where it will go | What will make it true |
|---|---|---|---|
| **1** | `See what's done, what's left, and which list it's on.` (#196) | `web/src/app/page.tsx:14-16`, `web/src/app/login/page.tsx:18-20`, `web/src/app/layout.tsx:22` — the three places the old sentence is | Three clauses, three citations, which is why the wording was chosen. **"what's done"**: the `done` column, `supabase/migrations/20260927182443_create_tasks.sql:28`, drawn as the tick at `web/src/app/tasks/page.tsx:764-812` and read back after every press by `web/src/app/tasks/actions.ts:189`. **"what's left"**: the count at `web/src/app/tasks/page.tsx:322-327`, computed at `:273` from exactly the rows about to be drawn. **"which list it's on"**: the team chip at `web/src/app/tasks/page.tsx:795-810`, decided by `taskTeam()` at `web/src/lib/tasks.ts:214-233`, which also covers the two honest cases where a name cannot be shown (`TEAM_NOT_SHOWN`, `TEAM_LEFT`). **No clause claims to show a person**, which is what #196 is about |
| **2** | `Please sign in to finish.` (#198) | `web/src/app/login/page.tsx:22-26`, replacing `Your email is confirmed. Please sign in.` | It asserts nothing about the account, which is the whole repair — so what has to be citable is only that signing in is available and does something: the form at `web/src/app/login/page.tsx:34-69` and the action at `web/src/app/auth/actions.ts:68-85`, which signs the person in and sends them to `/tasks` at `:84`. True on **both** paths that reach it — a failed code exchange (`web/src/app/auth/callback/route.ts:24-27`) and a request with no code (`:16`). **One loose edge, named rather than hidden:** on the no-code path nothing was started, so "finish" is imprecise. It states no falsehood about the account, which is what #198 was filed for, and the alternative — splitting the two paths — is the *make it true* option the owner did not choose |
| **3** | **Decided:** `If you were invited, sign in to see it.` **Proposed instead, and ACCEPTED by the owner on 2026-10-07:** `If you were invited, sign in to accept it.` (#199) | `web/src/app/invite/[token]/page.tsx:106`, replacing `You have been invited` | **The decided wording cannot be cited, and the owner's own constraint is why.** "No invitation lookup before sign-in" was part of the decision, and the page looks an invitation up in **neither** state — signed out or signed in — by deliberate design (`web/src/app/invite/[token]/page.tsx:72-77`). So after signing in a person does not *see* the invitation: they see an Accept button and nothing about the team, the address, or whether the token is real. Nothing makes "see it" true, so the owner's rule turns it into "remove the words". **The one-word variant is citable**: "accept it" is made true by the signed-in branch drawing the Accept form at `web/src/app/invite/[token]/page.tsx:114-139` and by `accept-invite` performing the acceptance at `supabase/functions/accept-invite/index.ts:455-456`. The conditional `If you were invited` carries the uncertainty that the heading used to assert, which is the part both versions get right |
| **4** | `No card needed to sign up.` (#201) | `web/src/app/signup/page.tsx:23`, replacing `Free for your volunteer group.` | **The sign-up form asks for two things**: email and password, at `web/src/app/signup/page.tsx:44-52` and `:59-67`, and `credentials()` at `web/src/app/auth/actions.ts:19-24` reads only those two before `signUp` at `:95-98` sends them. **And the condition the owner attached — no payment flow anywhere in the repository — was checked in this session and is met**, four ways: no payment dependency in `web/package.json`, the root `package.json` or any function's `deno.json`; no payment route or action among the seven files in `web/src/app` matching `route.ts` or `actions.ts`; no payment table among the eight migrations in `supabase/migrations`; and a search of every tracked file under `web/src/` and `supabase/` for `stripe`, `paypal`, `payment`, `billing`, `subscription`, `invoice`, `price_`, `sk_live` and `pk_live` returning **two hits, both in one test case** — `supabase/functions/_tests/suggest_subtasks_test.ts:484-486`, which checks how `suggest-subtasks` handles a `402 billing_error` from Anthropic. That is **Anthropic billing the owner**, not this app charging a person. Unlike the sentence it replaces, this is a statement about the app as built, so a file and line can carry it |
| **5** | `Personal — no one else on Team Tasks can see it.` (#202) | `web/src/app/tasks/page.tsx:353` and `:736` — both choosers — replacing `Personal — only you` | **The policy**: the select rule on `tasks`, `supabase/migrations/20261002133637_tasks_join_teams.sql:137-144`, returns a row to its creator or to a member of its team when `team_id` is not null, so a row with a null `team_id` reaches nobody else. **The test, which the owner asked for by name**: `web/tests/access-rules.test.mjs:372-384`, "Bob CANNOT read Alice's personal task" — and note `:379`, which asserts the row Bob is refused **actually exists**, so the refusal is not vacuous. **It ran on staging in this pull request's own CI**, not merely on a laptop: run [37639457834](https://github.com/build-once/team-tasks/actions/runs/37639457834), job "App tests (access rules on staging)", whose log reads `# Bob reading Alice's personal task: no row matched, so nothing changed` with `# pass 25`, `# fail 0`, `# skipped 0`. The job also refuses a skipped test and enforces a floor of 25 (`.github/workflows/ci.yml:654`, `:707-714`), so a run that tested nothing could not have passed. **The operator is out of scope of the new wording on purpose** — "on Team Tasks" is a claim about other people using the app — and the disclosure that the operator can reach the database is the half of this decision with nowhere to live yet, because there is no privacy page |

---

## 5. Email audit

Every email Team Tasks sends or causes to be sent. "Can it contain…" asks whether the **text that goes
out** can carry a task's text, a team name, or a person's name or address.

### 5a. Sent by this app's own code — readable in this repository

| Email | Subject | First line | Where its text is defined | Task text? | Team name? | Name or address? |
|---|---|---|---|---|---|---|
| Invitation to a team, sent live | `You have been invited to <team name>` | `You have been invited to join the team "<team name>" on Team Tasks.` | `supabase/functions/invite-member/index.ts:724` (subject), `1333-1343` (body). Sent through Resend at `768-779`, from `1345-1351` | **No.** Nothing in `supabase/functions/invite-member/index.ts:1333-1343` reads a task | **Yes** — in the subject and the first line | **Yes, the invited address**, at `supabase/functions/invite-member/index.ts:1339` ("The link works for 7 days, and only for `<address>`"). No display name, and nobody else's address. The body also carries the **invitation token** at `1331`, which is a credential until it is used or expires |
| The same invitation, redirected to the test inbox | `[staging] invitation for <invited address>` | the same first line | `supabase/functions/invite-member/index.ts:713` (subject), body as above | **No** | **Yes**, in the body | **Yes** — the invited address is in the **subject** as well here. Deliberate, and the reason is at `supabase/functions/invite-member/index.ts:707-709`: the test inbox belongs to whoever set it up and they already hold the invitation list |

Three facts about this one email that the audit should carry:

- **Text only, never HTML** — `supabase/functions/invite-member/index.ts:749-751`, because a team name is
  free text somebody typed.
- **The link's host comes only from `APP_URL`**, never from a request header
  (`supabase/functions/invite-member/index.ts:1326-1331`): a link built from `Host` could be pointed at a
  site somebody else owns, harvesting the token.
- **Resend keeps its own log of what it sent**, which is outside this project
  (`supabase/functions/invite-member/index.ts:137`, and the appendix row "Sent-invitation logs" in
  `docs/plan.md`). Nothing in this repository can show what is in it.

### 5b. Caused by this app, but written by Supabase — **not verified**

These are triggered by calls in this repository, and their wording lives in the Supabase dashboard
(Authentication → Emails). **No template text exists anywhere in this repository**: searched for
`email template`, `Email Templates`, `mailer_templates` and `auth.email` across the repo in this session
— the only hits are inside `web/node_modules/@supabase/auth-js`, one route file, and
`evidence/build-it-16-password-reset.md`, which records at lines 532-536 and 544-550 that nobody writing
this has read or changed either project's templates. `supabase/config.toml` configures the four Edge
Functions and nothing else; it holds no `[auth.email]` section.

| Email | Subject and first line | What triggers it, in this repository | Where its text is defined | Task text? | Team name? | Name or address? |
|---|---|---|---|---|---|---|
| Confirm your sign-up | **Not verified** — never read | `supabase.auth.signUp`, `web/src/app/auth/actions.ts:95-98`, with `emailRedirectTo` built at `35-48` | Supabase dashboard, per project. Not in this repository | **No** — the call sends only the address, the password and a redirect address; there is no task in scope | **No** — same reason | **The recipient's own address is the one thing it is sent to.** Whether the template also prints it, and whether it prints anything else, is **not verified** |
| Reset your password | **Not verified** — never read. `evidence/build-it-16-password-reset.md:544-550` records that the **default** template sends the person to Supabase's own verify endpoint, which is why `/auth/reset` has two branches | `supabase.auth.resetPasswordForEmail`, `web/src/app/auth/actions.ts:152-155`, with `redirectTo` from `SITE_URL` only (`web/src/lib/password-reset.ts:238-253`) | Supabase dashboard, per project | **No** | **No** | **The recipient's own address.** The link carries a **recovery code**, which is a credential until used. Template contents **not verified** |
| Change of email address | **Not verified** — never read | **Nothing.** This app has no code path that changes an address: searched `web/src/` for `updateUser`, `resend(`, `signInWithOtp`, `inviteUserByEmail` and `reauthenticate` in this session — the only hit is `updateUser({ password })` at `web/src/app/auth/actions.ts:226` | Supabase dashboard, per project | **No** | **No** | Would carry the old and new addresses. Since nothing triggers it, no such email has been caused by this app. **Not verified** either way |

Supabase can also send magic-link, invite-a-user and reauthentication emails. **Nothing in this
repository triggers any of them** — the same search as above found no call that would.

### 5c. One more thing that sends mail because of this app — **not verified**

| Email | Subject and first line | What triggers it | Where its text is defined | Task text? | Team name? | Name or address? |
|---|---|---|---|---|---|---|
| A Sentry alert to the owner, when an error report arrives | **Not verified** — never read; Sentry composes it | `Sentry.captureException` at `web/src/app/error.tsx:50` and `web/src/app/global-error.tsx:41`, plus the server reports | Sentry's own dashboard and its alert rules. Not in this repository, and whether any alert rule exists at all is **not verified** | **Should not be** — `genAI: { inputs: false, outputs: false }` and `httpBodies: []` at `web/src/sentry/options.ts:82` and `112`, and `scrubEvent` (`web/src/lib/sentry-scrub.ts:382`) runs on every event. But an error *message* can quote whatever the code was holding, which is why `docs/plan.md` requires this app's own messages never to include task text | **Same answer** | **Addresses are replaced** with `[email address removed]` and tokens with `[token removed]` by `web/src/lib/sentry-scrub.ts:47-53`. The **user ID is sent on purpose** (`web/src/lib/sentry-user.ts`), which `docs/plan.md` allows. Whether an alert email is sent at all, and what it quotes, is **not verified** |

### 5d. What this app does not do

- **No reminder emails, no digests, no notifications.** `docs/plan.md:197` keeps reminder emails off the
  first version, and the only `fetch` to an email service in this repository is the one at
  `supabase/functions/invite-member/index.ts:768`.
- **A suspended person is emailed nothing.** `docs/plan.md:53-54` says so, and no function sends mail on
  suspension.
- **Nobody is emailed about a failed invitation except the owner, on screen.** The failure is a short
  code in the row (`supabase/migrations/20261006095847_invitation_status.sql:135-136`), read only by the
  team's owner.

---

## 6. Everything in this file that could not be verified here

Collected so it is not buried in a table. Each one names what would settle it.

- **Not verified — the three Supabase email templates** (sign-up confirmation, password reset, address
  change). No template text is in this repository. Settled by reading Authentication → Emails in each
  Supabase project's dashboard and recording the subject and first line for both projects.
- **Not verified — Supabase's own minimum password length**, and since #197 this is the **account-level**
  floor rather than "the only" one. The distinction matters and is the reason the two §1c password rows are
  worded as they are: `signUp` now refuses a short password (`web/src/app/auth/actions.ts:127-129`), but that
  guard only binds callers who go **through this app**. The publishable key is public by design — it is
  inlined into the browser bundle, and `web/src/lib/env.ts:44` says so in as many words: "Both of this app's
  settings are PUBLIC and reach the browser." So anyone holding it can call Supabase Auth's sign-up endpoint
  directly, never reach this app's action, and create an account under whatever minimum the **project** is
  set to. **On that path this repository enforces nothing**, and nothing in it can: the only floor is the
  dashboard setting. Settled in Authentication → Policies in each project's dashboard, staging and
  production, and the owner has said they will confirm both. Linked from the two password rows in §1c.
- **Not verified — how long a password-reset link lasts**, which the forgot-password page describes as
  "a short while". Settled in the same place.
- **Not verified — whether Supabase's "Confirm email" setting is on**, which is what makes the sign-up
  banner's words true. Settled in the same place.
- **Not verified — whether `NEXT_PUBLIC_SENTRY_DSN` is set in Vercel**, and so whether "The details have
  gone to the owner" is true of the live site. `web/src/lib/env.ts:91-115` stops a Production or Preview
  **build** without it, which is strong but is not the same as having seen the value. Settled in the
  Vercel project's environment settings.
- **Not verified — whether any Sentry alert rule exists**, and so whether §5c's email is ever sent.
  Settled in Sentry's dashboard.
- **Not verified — what any deployed function is currently running.** Every enforcement line cited for
  an Edge Function is the code **on this commit**. `web/src/lib/suggestions.ts:7-14` records that this
  repository has twice been in a state where the deployed function was a different program. Settled by
  deploying, or by a staging run that exercises the refusal.
- **STILL MISSING — there is no privacy page, and it is now a release gate: [#204](https://github.com/build-once/team-tasks/issues/204).**
  #202 asked for the sentence "The person who runs this app can access the database" on the privacy page as
  well as on the screen. The screen half is done (`web/src/app/tasks/page.tsx:379`, `:788-789`); the page
  half had nowhere to go. Re-checked on 2026-10-07 and still true: `git ls-files` matching `privacy`,
  `terms` or `legal` returns nothing; `web/src/app` has eight `page.tsx` files and none is a privacy page;
  `web/src` contains no match for `privacy`. **It is no longer only a gap**: `docs/plan.md`'s "AI
  suggestions — the consent setting" now names a privacy page as a precondition for installing the
  production `AI_API_KEY`, because a setting is not consent if the person switching it on cannot find out
  what it sends. Settled by #204, and writing the page's words is the owner's.
- ~~**Outstanding — the exact wording for #199.**~~ **RESOLVED 2026-10-07**: the owner accepted "accept it",
  and the heading is `If you were invited, sign in to accept it.` (`web/src/app/invite/[token]/page.tsx:122`).
  §1g carries its citations and §4a row 3 keeps the argument for why the originally decided wording could
  not be used.
- **One thing found while writing this, and filed rather than fixed here: #195.** `docs/plan.md` still says
  of Suggest subtasks that there is "no `AI_API_KEY` in any environment, no function, and no call ever
  made", and `evidence/build-it-20-ai-helper.md` section 12 records the owner deploying the function to
  staging and setting a key there on 7 October 2026. The production half of the plan's claim is still
  correct. Not changed here: this task was the claims register, and what staging holds today is the owner's
  to confirm.
- **Unverified — no screen was opened for this file.** Every claim's wording was read out of a source
  file, not off a rendered page. A screen could differ from its source if a CSS rule hid something, and
  nothing here would see that.
