# Evidence: Build it 25 part 1 — the three sign-in screens

Result: **PASS for everything this repository can decide. UNVERIFIED for everything that needs a
dashboard, a browser or a project** — and that second list is long and is named in full below.

Date: 2026-10-11
Issue: [#284](https://github.com/build-once/team-tasks/issues/284)
Branch read from: `main` at `6b8c9d099416d23b5c9dfd4fc9c989229cda5767` ("Merge pull request #282 from
build-once/docs/build-it-25-abuse-limits-inventory"), printed with `git rev-parse HEAD` in this session.
Checked by: the coding assistant.

**NOTHING WAS RUN AGAINST STAGING OR PRODUCTION. No MCP connector and no browser tool was used.** No
dashboard was opened, no project was deployed to, no email was sent, no account was created, and no
migration exists in this change. Every command below ran on the owner's own machine against files in
this repository.

---

## 0. What this change is for, in one paragraph

The owner watched three things on production on 11 October 2026 (the coach read the auth log — paths,
statuses and codes only):

1. **A reset link opened in a different browser from the one that asked.** Supabase accepted it (303)
   and the app said **"That link didn't work"**. The links are PKCE links, so the code can only be
   exchanged by the browser holding the verifier.
2. **A reset link opened in the same browser.** The exchange succeeded, the new-password page loaded,
   and saving was refused by Supabase with **HTTP 422, code `same_password`** — and the app said
   **"That link didn't work" again**. The link had worked perfectly.
3. **The owner's mail provider rewrites links through a scanner**, which made a **HEAD** request to the
   link before anybody clicked (answered 405).

So: true messages, links that work anywhere and that a scanner cannot spend, and a CAPTCHA.

---

## 1. True messages — `scripts/auth-screens-check.mjs`, written first and seen to fail

### 1.1 The check, green

```
$ node scripts/auth-screens-check.mjs
0. the searches this file relies on can find something
PASS  CONTROL -- the stripper removes both kinds of comment and keeps the code beside them
PASS  CONTROL -- and it does NOT eat the second half of a URL, which is the bug it was written with
PASS  CONTROL -- functionBody finds a body and stops at its own closing brace
PASS  CONTROL -- functionBody answers null for a function that is not there
PASS  CONTROL -- orderedBefore says false when the second thing comes first

1. the sentences: one per refusal, and not one of them Supabase's
PASS  every code in the table has a sentence, and the table is the only list
PASS  every sentence ends in a full stop and says more than a word
PASS  no sentence names a company, a status, a code or an underscore word
PASS  CONTROL -- the same search finds those words when they are there
PASS  a code this app did not write draws NOTHING, so nothing from an address bar is printed

1a. reading an answer, including the ones that are not errors
PASS  an AuthError's three fields
PASS  the `{ error: true }` constant signIn uses for a press its page did not make
PASS  nothing at all, and every other shape that is not an object
PASS  a status that arrived as a string is not read as a number

1b. setting a new password: the refusal the owner saw, and the rest
PASS  the two modules agree on the dead-link path, which neither can import from the other
PASS  same_password -- 11 Oct 2026, HTTP 422, the one that said the link didn't work
PASS  and its sentence is about the password and names no link
PASS  weak_password gets its own sentence rather than the link's
PASS  a rate limit, by code and by status alone
PASS  a CAPTCHA failure
PASS  a session that is really gone: the dead-link screen, by code and by name
PASS  AND NOTHING ELSE DOES: an answer nobody here recognises is told it did not work, not that the link is dead
PASS  CONTROL -- the old behaviour, every answer on the dead-link path, is NOT what this returns

1c. signing in: three refusals that are not about the password
PASS  a rate limit no longer says the password did not match
PASS  a CAPTCHA failure, and an unconfirmed address
PASS  and the one sentence that must NOT change: wrong credentials, and a press from somewhere else

1d. signing up: six refusals, and the one that must stay generic
PASS  the six, each with its own code
PASS  an address that already has an account is NOT told so
PASS  CONTROL -- no sentence in the table mentions an existing account

1e. the actions choose their refusal with these functions, not with one path
PASS  all three actions were found, so the checks below are reading something
PASS  each action asks its own chooser, exactly once
PASS  THE LINE THAT LIED IS GONE: exactly one redirect to the dead-link path, and it is the gate's
PASS  and the one that is left is the gate's refusal, which comes BEFORE the password is read
PASS  the marker is kept for a refusal the person can fix, and deleted only for the dead-link path
PASS  CONTROL -- the cookie's name is a constant in both files rather than a string either spells
PASS  no action prints or forwards a word Supabase wrote: `error.message` appears nowhere
PASS  CONTROL -- the same search finds a forwarded message when there is one

2. the emailed link: any browser, and a press rather than a fetch
PASS  the page's own path
PASS  the two fields the press carries
PASS  the two kinds of link, and nothing else is accepted
PASS  where each kind goes: two fixed paths, and the recovery one is the password form
PASS  the recovery destination IS the new-password screen, compared across the two modules
PASS  a token hash has to be a token-shaped string, so junk in the address bar sends no request
PASS  the page draws a button only for a link that is the right shape, and says so otherwise
PASS  both kinds of link have their own heading and button, and neither names a company

2a. the page verifies NOTHING, and the action needs a press
PASS  the confirm PAGE never calls Supabase at all: no client, no verifyOtp, no exchange
PASS  CONTROL -- /auth/reset, the route that still serves links sent before this change, DOES call Supabase
PASS  LINKS SENT BEFORE THIS CHANGE STILL WORK: both old landing routes are untouched and still read `code`
PASS  the action was found
PASS  it spends the token exactly once, and only after the button has been checked
PASS  THE PRESS IS THE GATE: it re-reads both fields through the same two functions the page used
PASS  and the type it hands Supabase comes from that fixed list, never straight from the request
PASS  NO DESTINATION IS TAKEN FROM THE LINK: no `next`, and the two exits are destinationAfter's
PASS  the marker is set only for a recovery link
PASS  the token hash is never drawn, logged or put in a redirect

2b. the two email templates: word for word, and pointing at this app
PASS  each template points at this page, carries the token hash, and names its own type
PASS  NEITHER CARRIES A `next`, so no destination can come out of an email
PASS  THE HOST COMES FROM A SETTING, not from a request: `{{ .SiteURL }}` and no literal address
PASS  AND THE DOCUMENT THE OWNER FOLLOWS CARRIES BOTH, VERBATIM, as the href of a link
PASS  CONTROL -- a template naming a path this app does not serve is NOT in that document
PASS  CONTROL -- and the quoted Supabase example really is in there, so the two are distinguishable

3. the anti-robot check: on three screens, and never a submit without a token
PASS  the script is Cloudflare's own, asked for explicit rendering
PASS  ONE address in that module, and it is Cloudflare's challenges host and nothing of ours
PASS  the field the widget creates, which is how the token reaches the action
PASS  Cloudflare's published dummy sitekey, for CI's build and for Vercel's Preview
PASS  the four states, and the one the site key decides alone
PASS  IT NEVER SUBMITS WITHOUT A TOKEN: only `off` and `solved` may post
PASS  CONTROL -- a gate that allowed `waiting` would be the thing this is written to refuse
PASS  the token is read off the form, and an absent one stays absent rather than becoming an empty string
PASS  the words cover all four states a visitor can be in, and none names a company
PASS  and the no-JavaScript line says that signing in needs it, in the place the box would be

3a. all three screens draw it, and the token travels with all three requests
PASS  sign in draws the gate, with the site key from the settings file
PASS  sign up draws the gate, with the site key from the settings file
PASS  the reset request draws the gate, with the site key from the settings file
PASS  CONTROL -- the new-password screen is NOT one of the three, so these searches are specific
PASS  all three calls to Supabase carry the token, and each in the shape that call takes
PASS  the field's name is spelled in ONE place, and the action reads it from there
PASS  nothing in the sign-in path holds the token in a variable of its own, so nothing can log it

3b. the site key: required where it matters, placeholder where it does not
PASS  the setting is read once, statically, from a NEXT_PUBLIC_ name so Next.js inlines it
PASS  a Production or Preview build with no site key is stopped, the same way the Sentry DSN is
PASS  and both checks use ONE list of environments, so they cannot be insisted on in different places
PASS  CI's build sets the name, with Cloudflare's published dummy sitekey as the value

3c. the nine automated sign-ins: one constant, imported everywhere
PASS  Cloudflare's dummy token, and the field it goes in
PASS  a fresh object each call, so no two callers can share and mutate one
PASS  all nine import that one constant, and all nine call it
PASS  AND NOT ONE OF THEM SPELLS THE TOKEN ITSELF -- decision J's whole point
PASS  the token is spelled once in the whole repository, in the module that exports it
PASS  CONTROL -- the same search would find a ninth copy if somebody pasted one
PASS  and every one of the nine still carries the field in the body it actually posts
PASS  the new staging script is named in the workflow's run list, and its count is there too

90 of 90 checks passed.
```

Exit code: `0`.

### 1.2 SEEN TO FAIL — the old behaviour, restored on purpose

`newPasswordRefusedPath` was given back the one line it replaced: every answer takes the dead-link
path, which is exactly what `setNewPassword` did before this change and what the owner saw on
production.

```
$ node scripts/auth-screens-check.mjs
FAIL  same_password -- 11 Oct 2026, HTTP 422, the one that said the link didn't work
FAIL  and its sentence is about the password and names no link
FAIL  weak_password gets its own sentence rather than the link's
FAIL  a rate limit, by code and by status alone
FAIL  a CAPTCHA failure
FAIL  AND NOTHING ELSE DOES: an answer nobody here recognises is told it did not work, not that the link is dead
FAIL  CONTROL -- the old behaviour, every answer on the dead-link path, is NOT what this returns
83 of 90 checks passed.
```

Exit code: `1`. **Seven red**, including the control that exists for exactly this. The file was then
restored and the run above re-run green.

### 1.3 SEEN TO FAIL — three more things broken on purpose, one at a time's worth

Three edits at once, each the obvious way the thing could stop being true: the confirm **page** made to
call `verifyOtp` on a GET (the scanner bug), `maySubmit` made to allow the `waiting` state (a form that
posts with no token), and the action's button check removed (a token spent without a press).

```
$ node scripts/auth-screens-check.mjs
FAIL  the confirm PAGE never calls Supabase at all: no client, no verifyOtp, no exchange
FAIL  it spends the token exactly once, and only after the button has been checked
FAIL  IT NEVER SUBMITS WITHOUT A TOKEN: only `off` and `solved` may post
FAIL  CONTROL -- a gate that allowed `waiting` would be the thing this is written to refuse
86 of 90 checks passed.
```

Exit code: `1`. All three files restored, and the green run above re-confirmed:
`90 of 90 checks passed.`

### 1.4 And one check found its own author out, which is why it is worth recording

The comment stripper in this script was written as `text.replace(/\/\/[^\n]*/g, "")`, and the check
that asserts `web/src/lib/turnstile.ts` holds **exactly one** `https://` address came out **0**. A
line-comment rule eats `//` — including the `//` inside `https://`, which is the very URL the check
exists to find. The fix is the stripper `scripts/password-reset-check.mjs` already uses, which refuses a
`//` preceded by a colon, and there is now a control for it:

```
PASS  CONTROL -- and it does NOT eat the second half of a URL, which is the bug it was written with
```

---

## 2. Which codes, and where each was read

Every code is read off the installed client, not recalled:
`web/node_modules/@supabase/auth-js/src/lib/error-codes.ts`, version **2.117.2** (printed with
`node -e "console.log(require('./web/node_modules/@supabase/auth-js/package.json').version)"`).

| Supabase code | line in that file | this app's code | the sentence |
|---|---|---|---|
| `same_password` | 66 | `same_as_old` | That is the password you are already using. Choose a different one. |
| `weak_password` | 71 | `password_refused` | That password was refused. Try a longer one, or one you have not used anywhere else. |
| `over_email_send_rate_limit` | 73 | `email_limit` | This app has sent as much email as it is allowed to for now. Wait a while and ask again. |
| `over_request_rate_limit`, **or any HTTP 429** | 72 | `too_many` | Too many tries from your internet connection. Wait a few minutes and try again. |
| `captcha_failed` | 44 | `robot_check` | The check that you are not a robot did not pass. Reload the page and try again. |
| `email_address_not_authorized` | 94 | `address_blocked` | This app could not send email to that address. That is a fault in the app rather than in your address, so please tell the owner. |
| `email_address_invalid` | 95 | `address_refused` | That email address was not accepted. Check it and try again. |
| `signup_disabled` | 22 | `signup_off` | New accounts are switched off at the moment. |
| `email_not_confirmed` | 48 | `confirm_first` | That account still needs its email address confirmed. Open the link in the email sent when it was created. |
| `otp_expired` | 68 | `link_expired` | That link has expired. Ask for a new one. |
| anything else, on a link | — | `link_dead` | That link did not work. It may have been used already, or it may be incomplete. Ask for a new one. |
| anything else, on a password | — | `try_again` | That did not work. Please try again. |

**The 429 is asked by STATUS before any code**, because `AuthRetryableFetchError` is built with
`undefined` for the code (`web/node_modules/@supabase/auth-js/src/lib/errors.ts:290-293`).

**The dead-link screen is now reached by exactly one kind of answer**: `session_expired`,
`session_not_found`, `refresh_token_not_found`, `bad_jwt` (lines 16, 15, 17, 12), or an error whose
**name** is `AuthSessionMissingError` or `AuthInvalidJwtError` — the first of which carries no code at
all (`errors.ts:134-138`).

**`email_exists` and `user_already_exists` are deliberately NOT on that table.** Telling somebody an
address already has an account is how a list of addresses gets sorted into accounts and not-accounts.
`docs/claims.md` §1c carries the decision and the check asserts it.

---

## 3. Links that work in any browser — the pages cited, word for word

Both read on **2026-10-11** through this session's page-fetching tool, which converts a page to text and
answers a question about it. Anybody about to depend on an exact wording should open the page.

**The shape** — [Passwords](https://supabase.com/docs/guides/auth/passwords):

> `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/account/update-password">Reset password</a>`

and the route it describes calls `verifyOtp({ type, token_hash })`.

**The scanner** — [Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates), the
"Email prefetching" section:

> "certain email providers may have spam detection or other security features that prefetch URL links
> from incoming emails"

and its two remedies, in the fetch's own summary: use the OTP token instead of the confirmation URL, or
**"Create a custom link that redirects to a confirmation page where users click a button containing the
actual confirmation link."** This app takes the second.

**Why PKCE was the first problem**, from the installed client rather than from a page:
`resetPasswordForEmail` sends a code challenge when the flow type is pkce
(`web/node_modules/@supabase/auth-js/src/GoTrueClient.ts:4481-4500`), and the library's own error says
what that costs — "This can happen if the auth flow was initiated in a different browser or device"
(`web/node_modules/@supabase/auth-js/src/lib/errors.ts:260-272`).

**What this app departs from in the documented shape, and why:**

| Documented | Here | Why |
|---|---|---|
| a `next` parameter, redirected to | **no `next`** | a destination taken out of a link is a destination somebody else chooses (issue #120 rule 2) |
| one route, GET, verifies | **a page that verifies nothing, and an action a button reaches** | the scanner. The page's zero calls to Supabase are asserted, with `/auth/reset` as the control |
| `type` from the query | **`type` from the query, against a fixed list of two**, each with a destination written in the app | one page serves both emails, which is the documented shape. `web/src/lib/email-links.ts` carries the full argument and the one thing about it that is **not confirmed** |

**Links sent before the template change keep working.** `/auth/reset/route.ts` and
`/auth/callback/route.ts` are untouched — asserted by the check, which requires both still to read
`code` and requires `/auth/reset` still to read `token_hash` as well.

---

## 4. The CAPTCHA — what was built, and what was not

**Built:** `web/src/lib/turnstile.ts` (the vendor's script URL, the field name, the four states, the
words), `web/src/app/components/CaptchaGate.tsx` (the widget and the submit button that waits for it),
the token travelling with all three Supabase calls, and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in
`web/src/lib/env.ts`.

**NO NEW PACKAGE.** Rule 17 never came up: the whole of Turnstile's interface here is a `<script>` tag
and three function calls — `render`, `reset`, `remove` — all four read off
[client-side rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/),
read 2026-10-11. `web/package-lock.json` is unchanged.

### 4.1 The build, with CI's placeholders

```
$ NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... \
  NEXT_PUBLIC_SENTRY_DSN=... NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
  npm run build
▲ Next.js 16.3.6 (Turbopack)
✓ Compiled successfully in 6.9s
  Running TypeScript ...
  Finished TypeScript in 5.2s ...
✓ Generating static pages using 15 workers (15/15) in 767ms

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /auth/callback
├ ƒ /auth/confirm
├ ƒ /auth/reset
...
```

Exit code: `0`. The new route is there, and the two old ones are still there beside it.

### 4.2 SEEN TO FAIL — a Production build with no site key

```
$ VERCEL_ENV=production NEXT_PUBLIC_TURNSTILE_SITE_KEY= npm run build
> Build error occurred
Error: Setting NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set, and VERCEL_ENV is "production".

Without it the sign-in, sign-up and password-reset screens draw no anti-robot check and send no
token. If CAPTCHA is switched on in the matching Supabase project's Auth settings, every one of those
three screens then refuses everybody -- and the screen would say the check did not pass, on a page
with no check on it. So this build was stopped here rather than succeeding quietly.
...
    at requireTurnstileSiteKeyWhereItMatters (web/src/lib/env.ts:100:11)
    at assertSettingsPresent (web/src/lib/env.ts:106:5)
```

Exit code: `1`. The same shape as the Sentry DSN's check, and sharing one list of environments with it.

### 4.3 The bundle still carries no secret-key shape

```
$ find .next/static -type f | wc -l
31
$ grep -ranoE 'sb_secret_[A-Za-z0-9]|service_role' .next/static > /dev/null; echo $?
1
```

Exit code `1` from grep is "found nothing", which is the pass. 31 files scanned.

---

## 5. The nine files that sign in — decision J, carried out

One import and one spread in each. The constant is `scripts/lib/captcha.mjs`.

```
$ for s in build-it-16-checks build-it-16-suspend-checks build-it-18-invitation-status-checks \
           build-it-20-ai-checks build-it-23-attachment-checks; do
    printf '%s: ' "$s"; node "scripts/staging/$s.mjs" --selftest | grep -c '^  ok  '
  done
build-it-16-checks: 39
build-it-16-suspend-checks: 40
build-it-18-invitation-status-checks: 57
build-it-20-ai-checks: 140
build-it-23-attachment-checks: 107
```

**Every count is unmoved** from what `.github/workflows/ci.yml` already expects. A change to a sign-in
helper that had quietly broken one of those selftests would have shown here.

**`web/tests/access-rules.test.mjs` is untouched**, which is what `docs/rate-limits.md` section 4
predicted: `signIn` in `web/tests/staging.mjs` is the only place that file signs in.

**THIS IS THE RULE 20 LINE.** Nine test and script files were changed. **The owner agreed to it on 11
October 2026** — decision J, recorded in `docs/plan.md` → "THE NINE FILES DO CHANGE" and in PR #282.
What changed in each: one `import` and one `...captchaBody()` in the sign-in body. **No assertion was
loosened, no expected count lowered, and no test skipped or removed.**

---

## 6. The new staging script, and what only the owner can run

`scripts/staging/build-it-25-captcha-checks.mjs`, 31 cases, named in CI's
`staging-script-selftests` job.

```
$ node scripts/staging/build-it-25-captcha-checks.mjs --selftest | grep -c '^  ok  '
31
$ node scripts/staging/build-it-25-captcha-checks.mjs --selftest | tail -9
31 cases, 0 wrong.

Every judgement said FAIL or UNVERIFIED to the worlds that matter: a
project with CAPTCHA switched on that accepts a sign-in with no token
at all, a dummy token refused because the secret key is a real one,
thirty-one sign-ins with no 429 anywhere, and a run that created an
account or signed somebody out globally. That is what would make a
green staging run mean something. It is NOT itself a staging result:
nothing was sent anywhere by this run.
```

Exit code: `0`.

**The case that matters** feeds `judgeNoToken` the answer a project with CAPTCHA switched on but **not
checked** would give — HTTP 200 and a session, for a sign-in carrying no token at all — and requires
**FAIL**. That is the world `docs/rate-limits.md` calls "the sharpest thing on this list", and the one
no page read says either way.

**EVERY FIXTURE GOES THROUGH THE REAL READING PATH**, which issue #284 asks for in those words. The
body-parsing step is a function of its own, `readAuthAnswer`, and the run and the selftest both use it:
each case is a **raw string** put through the same parser, not an object built in the selftest. That is
the hole `scripts/staging/build-it-23-attachment-checks.mjs` found in its own selftest on 9 October
2026, and three of the 31 cases exist only to drive it — the older body shape with the code under
`code` as a string, a body that is not JSON at all, and `code` carrying the HTTP status as a **number**,
which must not be read as a refusal's name.

### 6.1 SEEN TO FAIL — the selftest catches a judgement that cannot fail

`judgeNoToken`'s `const refused = answer.status >= 400` replaced with `const refused = true`, which is
the one mistake that would make this script report protection it has not got:

```
$ node scripts/staging/build-it-25-captcha-checks.mjs --selftest
  WRONG  BEFORE: no token, accepted -- which is what says the check is not there yet
  WRONG  THE WORLD WHERE THIS PROTECTS NOTHING: CAPTCHA on, no token, and ACCEPTED anyway
31 cases, 2 wrong.
```

Exit code: `1`. Restored, and re-run: `31 cases, 0 wrong.`, exit code `0`.

**IT HAS NOT BEEN RUN AGAINST STAGING, and will not be by the assistant.** It signs in as Alice and
spends most of a five-minute rate-limit budget; the runs are the owner's, before and after switching
CAPTCHA on, and `--after` is what tells the script which of the two it is looking at.

---

## 7. Every other check in CI, run locally

```
$ node scripts/password-reset-check.mjs      -> 92 of 92 checks passed.
$ node scripts/screen-state-check.mjs        -> 286 of 286 checks passed.
$ node scripts/sentry-scrub-check.mjs        -> 119 of 119 checks passed.
$ node scripts/tasks-filter-check.mjs        ->  47 of 47 checks passed.
$ node scripts/friendly-words-check.mjs      ->  45 of 45 checks passed.
$ node scripts/approved-model-check.mjs      ->   6 PASS lines
$ node scripts/auth-screens-check.mjs        ->  90 of 90 checks passed.
$ node scripts/check-workflows.mjs           -> Checked 6 workflow file(s), 27 job(s): 0 problem(s), 0 warning(s).
$ node scripts/launch-check.mjs --selftest   -> PASS (171/171 assertions, 39 checklist items, 17 auto checks)
$ node .claude/guard/selftest.mjs            -> PASS: 537 rule examples across 24 rules, plus 32 fail-closed checks.
$ node scripts/lint-skills.mjs               -> PASS - 12 skills, 0 problems
$ npm test  (repository root)                -> AI team self-test: 258 passed, 0 failed.
$ cd web && npm run lint                     -> (no output, exit 0)
```

**`screen-state-check` was red first**, at the one equality in it, and the number was raised on purpose:

```
FAIL  the buttons that actually exist, counted from the list
        expected 19
        got      20
285 of 286 checks passed.
```

19 → 20, for `link_use`, which is the one new button. That check's own comment says adding a button
means raising the number in the same change and saying so in the pull request, and the pull request
does.

**The Deno tests over the four Edge Functions were NOT run here** and nothing under `supabase/` was
touched by this change — no function, no migration, no test. They run in CI.

---

## 8. What is UNVERIFIED, in full, because a check that could not run is not a pass (rule 8)

Nothing in this list is a hedge; each one names what would settle it, and every one of them is the
owner's. **[#285](https://github.com/build-once/team-tasks/issues/285) is this table as a checklist**,
so it does not live only here.

| What | Why it could not be settled here | What settles it |
|---|---|---|
| **That an emailed link works in a second browser** | the two email templates have not been edited, so every link Supabase sends today is still the PKCE `code=` shape | `docs/rate-limits.md` section 3 rows 12 and 13, then one reset email opened on a second device |
| **That a mail scanner's fetch now spends nothing** | nobody has watched a scanner fetch the new link and the person then use it. What IS established is that `/auth/confirm` calls Supabase nowhere | the owner's own mail provider, and one reset email |
| **That Supabase Auth refuses a sign-in with no CAPTCHA token** | the CAPTCHA page does not say, and nothing is switched on. **If it does not, the whole thing protects nothing** | `scripts/staging/build-it-25-captcha-checks.mjs` section 1, run against staging with a dummy secret key |
| **That the refusal carries `captcha_failed`** | same: nobody has seen Supabase send it. The three screens draw their own sentence for that code and the generic one for anything else | the same run, which reports the code and answers UNVERIFIED rather than PASS for any other |
| **Which attempt a 429 arrives at, and therefore what the dashboard field called "token refreshes" covers** | decision F's figure is set nowhere | the same script's section 3, after F is applied to staging. A 429 at the thirty-first says the field is the sign-in limit; none says it never was |
| **That any widget has ever been rendered** | no Turnstile account, no widget, no site key in any environment, and no browser was opened | the owner, on a Preview deploy with the dummy sitekey |
| **Whether the free plan puts Cloudflare's name on this app's sign-in screen** | read off the Plans page listing branding removal as an Enterprise feature — an inference from silence | looking at a rendered widget |
| **That `verifyOtp` refuses a token of the wrong kind** | no page read says either way | one upload of a mismatched pair against staging, or a Supabase page that says |
| **That `email_not_confirmed` only ever follows a correct password** | it is how the code is described, not something tried — and it is what makes telling somebody safe | a wrong password against an unconfirmed staging account |
| **Any of the twelve sentences drawn on a screen** | no screen was opened in a browser by anybody writing this | the owner, on a Preview deploy |
| **What either project's Auth settings are** | nothing in this repository can read a dashboard, and rule 19 permits no production command | the owner, `docs/rate-limits.md` section 3 |

---

## 8a. AND THE REAL CI RUN, read after the pull request was opened

Run [38161681527](https://github.com/build-once/team-tasks/actions/runs/38161681527) on PR #289. **All
fifteen GitHub jobs `success`, including `required`.** The two jobs with new counts, read out of their
own logs with `gh run view --job … --log` rather than inferred from a green tick:

```
tasks-filter-check:    counted  47 PASS lines; at least  47 expected.
password-reset-check:  counted  92 PASS lines; at least  84 expected.
sentry-scrub-check:    counted 119 PASS lines; at least 119 expected.
screen-state-check:    counted 286 PASS lines; at least 286 expected.
friendly-words-check:  counted  45 PASS lines; at least  45 expected.
approved-model-check:  counted   6 PASS lines; at least   6 expected.
auth-screens-check:    counted  90 PASS lines; at least  90 expected.   <- NEW

build-it-16-checks:                   counted  39 cases; at least  39 expected.
build-it-16-suspend-checks:           counted  40 cases; at least  40 expected.
build-it-18-invitation-status-checks: counted  57 cases; at least  57 expected.
build-it-20-ai-checks:                counted 140 cases; at least 140 expected.
build-it-23-attachment-checks:        counted 107 cases; at least 107 expected.
build-it-25-captcha-checks:           counted  31 cases; at least  31 expected.   <- NEW
```

**`App tests (access rules on staging)` passed**, which is the one job in this repository that signs in
to a real project — three accounts, now each sending the dummy CAPTCHA token. So the change to the nine
files was exercised against staging by CI, with CAPTCHA still switched off there: the field is ignored,
which is what makes it safe to merge before any dashboard is touched.

### AND THE VERCEL PREVIEW DEPLOY FAILED, which is the new guard doing its job

**UNVERIFIED — the Vercel build log was not read, and no hosting dashboard was opened (rule 10).** The
commit status carries no reason beyond "Deployment has failed — run this Vercel CLI command", and
`npx vercel inspect` needs a credential this session does not have and must not ask for.

**What was done instead: the only cause this change could have, reproduced locally.**

```
$ VERCEL_ENV=preview … NEXT_PUBLIC_TURNSTILE_SITE_KEY= npm run build --prefix web
> Build error occurred
Error: Setting NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set, and VERCEL_ENV is "preview".
    at requireTurnstileSiteKeyWhereItMatters (web/src/lib/env.ts:100:11)
exit=1
```

Three facts, and the conclusion drawn from them rather than from the log: a Preview build with no site
key stops with a message naming the setting; **nobody has set that variable in Vercel**, because it did
not exist before this branch and it is row S2 of the by-hand list; and the Preview build stopped. `App
build` in CI passed, because GitHub Actions sets no `VERCEL_ENV` and so is deliberately not bound by
this guard.

**It was not softened to make the check green.** Issue #284 asks for the site key to be "required at
build on Production and Preview like the Sentry setting", and a Preview that built happily with no site
key would draw no widget — so the on-screen check "a small box appears" would pass by the box being
absent. PR #289's comment has the whole of it, and the alternative, which is the owner's to choose.

## 9. Redaction (rule 18)

**Nothing was captured from production.** The three observations in section 0 are the owner's report
and the coach's reading of the auth log, already reduced to paths, statuses and codes before they
reached this session: no address, no token, no link and no row. **So the list of replaced values is
empty, and that is a complete answer.**

Two values in this change look like credentials and are not, and both are written in the open on
purpose:

| Value | What it is |
|---|---|
| `1x00000000000000000000AA` | Cloudflare's **published** dummy **sitekey**, which always passes. On its own testing page |
| `XXXX.DUMMY.TOKEN.XXXX` | Cloudflare's **published** dummy **token**. On the same page |

**The dummy SECRET keys are deliberately NOT in any file in this repository**, even though Cloudflare
publishes those too: they go into a Supabase project's Auth settings by hand, and a secret-shaped field
is one this repository stays out of whatever its value. `docs/rate-limits.md` section 3 row 6 is where
they are named, which is a document and not code.
