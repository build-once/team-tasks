# Claims register and email audit

Written 2026-10-07 for issue #194, from commit `11e091f5bc364d9f6b09ddcb572f59717c10ac1a` — the head of
`origin/main` when this file was started (`git rev-parse HEAD`, run in this session).

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

**What was NOT done here.** No screen was opened, no browser was used, no connector was used, nothing
was deployed, and nothing was run against staging or production. Every line below was read in this
repository. So every row is a claim about **the code on this commit**, not about what any deployed
version is currently doing — and `web/src/lib/suggestions.ts`'s own header is the reason that
distinction matters: a deployed Edge Function can be a different program from the one in this branch.

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
| `See what's done, what's left and who's doing it.` (the page description in `<head>`) | `web/src/app/layout.tsx:22` | **Partly NOT ENFORCED** — see the home-page row below. "what's done" and "what's left" are kept by `tasks.done` (`supabase/migrations/20260927182443_create_tasks.sql:28`) and the count at `web/src/app/tasks/page.tsx:322-327`. Nothing anywhere shows **who is doing** a task. |
| `Team Tasks — Version 1234567` / `Team Tasks — Version 1234567 (preview)` / `Team Tasks — Local development — no deployed version` | `web/src/app/components/Footer.tsx:31-34`, wording decided in `web/src/lib/app-version.ts:107-130` | `web/next.config.ts:47-48` sets `APP_COMMIT` from `VERCEL_GIT_COMMIT_SHA` at build time; `web/src/lib/app-version.ts:67` refuses anything that is not 40 hex digits, so the only two things the footer can say are a real commit or the local-development sentence. Checked by `scripts/screen-state-check.mjs`. |
| `Loading…` | `web/src/app/loading.tsx:24-26` | True by construction: Next.js draws this file while the server page is still rendering (`loading.tsx` convention, cited in the file's own header). |
| `This screen could not be shown. Nothing you were doing has been lost unless a message said so. The details have gone to the owner.` | `web/src/app/error.tsx:57-62` | Split in two. **"The details have gone to the owner"**: `web/src/app/error.tsx:50` reports the error, and `web/src/lib/env.ts:91-115` stops a Production or Preview build that has no `NEXT_PUBLIC_SENTRY_DSN`, so a deployed build cannot be in the state where nothing is sent. On a build with **no** DSN — local development — `web/src/instrumentation-client.ts:48` never starts Sentry and the sentence is not true; that build is nobody's public site. **"Nothing you were doing has been lost"**: **NOT ENFORCED** — see §3. |
| `Team Tasks could not be shown at all. The details have gone to the owner.` | `web/src/app/global-error.tsx:57-60` | As the row above: `web/src/app/global-error.tsx:41` reports it, `web/src/lib/env.ts:91-115` is what makes a deployed build have somewhere to send it. |

### 1b. The home page, `/`

| The exact words | Where they appear | What makes them true |
|---|---|---|
| `See what's done, what's left and who's doing it.` | `web/src/app/page.tsx:14-16` | **NOT ENFORCED for the third clause.** `tasks` has `owner_id` (`supabase/migrations/20260927182443_create_tasks.sql:24`), but **no screen shows it**: `web/src/app/tasks/page.tsx:604` compares it with the signed-in person's id and the comment at `web/src/lib/tasks.ts:16` says it is "only ever compared with the signed-in person's own id — never shown". There is also **no column recording who ticked a task** — searched for `done_by`, `ticked_by` and `completed_by` across `supabase/`, `web/src/`, `scripts/` and `docs/` in this session: no match. So nothing in the app answers "who's doing it". |
| `No account yet? Sign up` | `web/src/app/page.tsx:25` | `web/src/app/signup/page.tsx` draws the form and `web/src/app/auth/actions.ts:87-109` creates the account. |

### 1c. Sign up, `/signup`

| The exact words | Where they appear | What makes them true |
|---|---|---|
| `Free for your volunteer group.` | `web/src/app/signup/page.tsx:23` | **NOT ENFORCED.** No file makes it true and none can: it is a promise about money. What can be shown is that nothing in the app charges anybody — searched `web/src/`, `supabase/functions/` and `scripts/` for `stripe`, `payment`, `billing` and `subscribe` in this session; the only hits are a fake key in a test fixture (`scripts/launch-check.mjs:505`) and the word "price" in a comment. `docs/plan.md:197` keeps Payments on the not-in-the-first-version list. |
| `That did not work. Check the email address and password and try again.` | `web/src/app/signup/page.tsx:26-29` | `web/src/app/auth/actions.ts:100` sends `?problem=1` for any error Supabase returned, and `web/src/app/auth/actions.ts:88-90` for a post that did not come from this page's button. Deliberately does not say which half was wrong. |
| `Check your email. We've sent you a link to confirm your account.` | `web/src/app/signup/page.tsx:32-37` | `web/src/app/auth/actions.ts:105` draws it only when Supabase returned no session, which is what a project that asks people to confirm does. **Whether an email actually went is not verified** — the sending, and the project's "Confirm email" setting, are Supabase's, and no template or setting for them exists in this repository (see §5). |
| `At least 8 characters. A password manager can make one for you.` | `web/src/app/signup/page.tsx:68-71`, the number from `PASSWORD_MIN_LENGTH` in `web/src/lib/password-reset.ts:91` | **NOT ENFORCED on the server.** The only thing in this repository that applies it at sign-up is the browser attribute `minLength={PASSWORD_MIN_LENGTH}` (`web/src/app/signup/page.tsx:65`), which a direct post skips: `signUp` (`web/src/app/auth/actions.ts:87-109`) never calls `passwordProblem`. The reset form does (`web/src/app/auth/actions.ts:223`). Supabase's own project minimum is the only other floor and it lives in a dashboard — **not verified**. |

### 1d. Sign in, `/login`

| The exact words | Where they appear | What makes them true |
|---|---|---|
| `See what's done, what's left and who's doing it.` | `web/src/app/login/page.tsx:18-20` | As §1b: **NOT ENFORCED for the third clause**. |
| `Your email is confirmed. Please sign in.` | `web/src/app/login/page.tsx:22-26` | **NOT ENFORCED.** `?confirmed=1` is set by `web/src/app/auth/callback/route.ts:37`, which is the route's **fall-through**: it is reached when the code exchange **failed** (`web/src/app/auth/callback/route.ts:24-27`) and when the request carried **no code at all** (`web/src/app/auth/callback/route.ts:16`). The successful exchange goes to `/tasks` instead (`web/src/app/auth/callback/route.ts:25`). So the one path that draws this sentence is the path on which nothing in this app saw a confirmation. The query value can also simply be typed. |
| `That email and password don't match. Check them and try again.` | `web/src/app/login/page.tsx:28-32` | `web/src/app/auth/actions.ts:81` redirects here for any `signInWithPassword` error. **Note, not a defect:** `web/src/app/auth/actions.ts:74-76` gives the same sentence to a post that carried no recognised button identifier, where the stated cause is not the cause. That path is not reachable from this screen, and the file's comment at 78-81 says the single sentence is deliberate — telling the two apart would help somebody sort addresses into accounts and not-accounts. |

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
| `You have been invited` | `web/src/app/invite/[token]/page.tsx:106` | **NOT ENFORCED.** The page deliberately does not look the invitation up — its own comment says so at `web/src/app/invite/[token]/page.tsx:72-77` — so this heading is drawn for any string in the address, including a made-up one. Nothing checks the token until `accept-invite` runs, on the button press. |
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
| `Personal — only you` (the chooser option, on the add form and on Move to…) | `web/src/app/tasks/page.tsx:353` and `736` | The select policy on `tasks`: `supabase/migrations/20261002133637_tasks_join_teams.sql:137-144` returns a row to its creator, or to a member of its team when `team_id` is not null — so a row with `team_id` null reaches nobody but its creator. **See §4 for the one way these words are wider than the policy.** |
| `A personal task is yours alone. Everyone in a team can see, tick and rename that team's tasks; only the person who added a task can delete it.` | `web/src/app/tasks/page.tsx:360-364` | Three separate rules. **Yours alone / team can see**: the select policy, `supabase/migrations/20261002133637_tasks_join_teams.sql:137-144`. **Tick and rename**: the update policy, same file `166-177`. **Only the creator can delete**: the original owner-only delete policy, `supabase/migrations/20260927182443_create_tasks.sql:73-77`, deliberately left standing — `supabase/migrations/20261002170244_tasks_drop_owner_only_rules.sql:202-207` says why it was not dropped. |
| `Everyone in a team can see, tick and rename that team's tasks. Moving a task to Personal takes it back to you alone.` | `web/src/app/tasks/page.tsx:759` | As the row above, plus the trigger that decides which columns may change: `tasks_enforce_column_rules()` in `supabase/migrations/20261002133637_tasks_join_teams.sql` (part 3, from line 260). |
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

## 4. The NOT ENFORCED rows, and what to do about each

Six rows, plus one that is enforced and narrower than its words. Issue #194 asks for a proposal per row
and for no change here. **Nothing below has been changed.** Each row has its own issue so the decision has
somewhere to live and can be closed on its own: #196, #201, #197, #198, #199, #200, and #202 for the last
one.

**1. `See what's done, what's left and who's doing it.`** (#196) — home page, sign-in page and the page
description (`web/src/app/page.tsx:14-16`, `web/src/app/login/page.tsx:18-20`,
`web/src/app/layout.tsx:22`). No screen shows who created a task, and no column records who ticked one.

- *Make it true*: draw the creator's nickname on each team task, from `team_roster`, and add a column
  recording who last changed `done`. Both are new personal data on a screen and a new column, so they
  are a `docs/plan.md` change first, not a code change — and the appendix row "Who created and who
  ticked off each task" already claims the second one exists, which it does not.
- *Remove the words*: change the third clause to something the app does do — "See what's done, what's
  left and whose list it's on" — in the three places above.

**2. `Free for your volunteer group.`** (#201) — `web/src/app/signup/page.tsx:23`. True today, and no file can
keep it true.

- *Make it true*: nothing in code can. The nearest honest thing is to say for how long, or to say what
  it is free of.
- *Remove the words*: drop the line, or narrow it to "No payment, no card, no adverts", each of which is
  a fact about the app as built rather than a promise about next year.

**3. `At least 8 characters.` on sign-up** (#197) — `web/src/app/signup/page.tsx:68-71`. Enforced only by a
browser attribute; `signUp` never checks it.

- *Make it true*: call `passwordProblem` in `signUp` (`web/src/app/auth/actions.ts:87-109`) before
  `supabase.auth.signUp`, exactly as `setNewPassword` does at line 223, and redirect to
  `/signup?problem=1`. This is the recommended one: the check already exists, it is already tested by
  `scripts/password-reset-check.mjs` on the other path, and the words are already on the screen.
- *Remove the words*: not sensible — the number would still be in the `minLength` attribute, and
  removing the sentence would leave a rule nobody is told about.

**4. `Your email is confirmed. Please sign in.`** (#198) — `web/src/app/login/page.tsx:22-26`, reached only from
the fall-through at `web/src/app/auth/callback/route.ts:37`, which is also where a request with no code
at all lands.

- *Make it true*: give the two causes two different destinations — a failed exchange keeps
  `?confirmed=1`, and a request with no code goes to `/login` with nothing set. That still rests on the
  reasoning at `web/src/app/auth/callback/route.ts:29-32` (Supabase has confirmed the address by the
  time the link is followed), which nothing here has observed.
- *Remove the words*: say what is known instead — "Please sign in to finish" — which is true on both
  paths and sends the person to the same place.

**5. `You have been invited`** (#199) — `web/src/app/invite/[token]/page.tsx:106`. Drawn for any string in the
address, because the page deliberately looks nothing up.

- *Make it true*: it cannot be made true without looking the invitation up, and the comment at
  `web/src/app/invite/[token]/page.tsx:63-77` gives two good reasons not to — the page is public, and a
  mail scanner fetching the link must not be able to learn anything. Making it true would undo both.
- *Remove the words*: this is the recommended one. `Invitation` or `An invitation to a team` as the
  heading claims nothing, and the sentence underneath already explains what to do.

**6. `Nothing you were doing has been lost unless a message said so.`** (#200) —
`web/src/app/error.tsx:57-62`.
Nothing in this repository establishes it. An error boundary catches a throw during render, and a throw
that happens *after* a write has already landed reaches the same screen; the hedge "unless a message
said so" does not cover it, because in that case there is no message.

- *Make it true*: nothing can make a general promise about unrelated writes true.
- *Remove the words*: this is the recommended one. Drop the sentence; what remains — "This screen could
  not be shown. The details have gone to the owner." — is true and is the part a person needs.

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
  `Personal — not shared with your teams` says exactly what the policy does. No change made.

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
- **Not verified — Supabase's own minimum password length**, which is the only server-side floor at
  sign-up today. Settled in Authentication → Policies in each project's dashboard.
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
- **One thing found while writing this, and filed rather than fixed here: #195.** `docs/plan.md` still says
  of Suggest subtasks that there is "no `AI_API_KEY` in any environment, no function, and no call ever
  made", and `evidence/build-it-20-ai-helper.md` section 12 records the owner deploying the function to
  staging and setting a key there on 7 October 2026. The production half of the plan's claim is still
  correct. Not changed here: this task was the claims register, and what staging holds today is the owner's
  to confirm.
- **Unverified — no screen was opened for this file.** Every claim's wording was read out of a source
  file, not off a rendered page. A screen could differ from its source if a CSS rule hid something, and
  nothing here would see that.
