# Evidence: Build it 16 step 4 — Forgot password (screens only)

Issue #120. Branch `feat/password-reset`. **No migration and no change under `supabase/functions`**,
and nothing was changed in Supabase: the diff is the web app, one check script, this file, one line in
`evidence/build-it-16-function-doors.md`, `.env.example` and `docs/environments.md`.

Result: **the screens are built and every check that can run without an email has been run and passes.
No reset email has been sent, by anybody, so the flow has not been seen working end to end.** That is
the owner's test, and the steps are in §7 and in the pull request.

Date: 2026-10-03
Checked by: **the assistant (Claude Code)**, on this machine, for everything below. Nothing in this
file was observed on staging or on production by anybody. No email was sent, no account was signed in,
and no reset link was clicked.

## What is proved here, and what is not

**Proved by a run on this machine:** the request screen gives one identical outcome for a known
address, an unknown address, an error from Supabase and an answer of a shape nobody expected; the
sentence exists in exactly one place in the code; the request action has one exit and no branch; no
address is hard-coded anywhere in `web/src`; nothing under `web/src` logs anything; the reset code
never travels into a URL, a cookie or a redirect of ours; the new-password page draws no form without
a link Supabase accepted; the password minimum is sign-up's, from one constant. 69 checks, §2.

**Not proved, and not provable from here:** that a real reset email arrives, that its link lands on
`/auth/reset`, that Supabase accepts the code, and that the new password then works. All four need an
email to be sent, and the issue says plainly not to send one — staging's built-in sender allows very
few per hour, and the owner tests with Alice. **Unverified — the whole end-to-end flow.**

## 1. The diff contains no migration and no function change

```
$ git diff --cached --stat -- supabase
exit=0
```

No output: nothing under `supabase/` is touched at all — not a migration, not a function, not
`config.toml`. A check that found nothing could be a check that looked at nothing (rule 8), so here is
the same command with no path filter, which does find the change:

```
$ git diff --cached --stat
 .env.example                           |  15 +
 docs/environments.md                   |  44 ++-
 evidence/build-it-16-function-doors.md |   5 +
 evidence/build-it-16-password-reset.md | 490 ++++++++++++++++++++++++
 scripts/password-reset-check.mjs       | 660 +++++++++++++++++++++++++++++++++
 web/src/app/auth/actions.ts            |  71 +++-
 web/src/app/auth/reset/route.ts        | 105 ++++++
 web/src/app/forgot-password/page.tsx   |  74 ++++
 web/src/app/login/page.tsx             |   6 +
 web/src/app/reset-password/page.tsx    | 118 ++++++
 web/src/app/signup/page.tsx            |   8 +-
 web/src/lib/password-reset.ts          | 226 +++++++++++
 web/src/lib/supabase/proxy.ts          |  20 +-
 13 files changed, 1831 insertions(+), 11 deletions(-)
exit=0
```

**Both commands were run on the staged change, before the commit, which is why they read `--cached`
rather than `origin/main...HEAD`.** The count for this file is therefore the one it had when the
command ran: correcting this section changed it again, and a file that records its own line count never
finishes. The pull request's own diff is the authority for the final numbers.

## 2. The checks: 69 of 69, and what each group is for

`node scripts/password-reset-check.mjs` sends nothing anywhere, needs no account and reads no
`.env.local`. It imports the real `web/src/lib/password-reset.ts` and reads the real source of the
pages, the action, the route handler and the proxy.

```
$ node scripts/password-reset-check.mjs

Checking C:\Users\rajdh\team-tasks\web\src\lib\password-reset.ts
  and the files that use it

1. the one sentence, and the one outcome
PASS  the message is the exact sentence issue #120 rule 1 requires
PASS  a known address: Supabase sent a link -- same outcome
PASS  an unknown address: Supabase sent nothing, and said so with no error -- same outcome
PASS  AN ERROR FROM SUPABASE: the rate limit, which CAN be told apart -- same outcome
PASS  an answer of a shape nobody expected -- same outcome
PASS  all four worlds give ONE outcome, counted as distinct values rather than compared by eye
PASS  the outcome sends the person back to the same screen

2. the request action: one exit, no branch, nothing logged
PASS  requestPasswordReset was found in web/src/app/auth/actions.ts
PASS  it has exactly one redirect
PASS  it has no branch at all: no if, no ternary, no &&
PASS  it never looks at an error
PASS  CONTROL -- signIn, in the same file, really does have two redirects, a branch and an error

3. the sentence lives in one place, and the page prints it
PASS  the sentence appears once in the whole of web/src, in the module that defines it
PASS  the request page prints the constant rather than a sentence of its own
PASS  the request page draws exactly one banner, so there is no second message to drift
PASS  the request page never echoes the address back: no defaultValue, no value=, and the address is not in the redirect

4. where the email links back to: a setting, and nothing else
PASS  no setting means no redirectTo at all
PASS  an empty setting is no setting
PASS  a setting of spaces is no setting
PASS  not a string is no setting
PASS  the owner's local test address, from the setting
PASS  a trailing slash gives the same address, not a doubled one
PASS  several trailing slashes, as a dashboard field can collect
PASS  surrounding whitespace is trimmed
PASS  the landing path is the fixed one, so every allow-list entry ends the same way

   and nothing anywhere in web/src is a hard-coded address
PASS  no "localhost" in the code of any of these files
PASS  no "vercel.app" in the code of any of these files
PASS  no ".supabase.co" in the code of any of these files
PASS  no "http://" in the code of any of these files
PASS  no "https://" in the code of any of these files
PASS  CONTROL -- the stripper removes both kinds of comment and keeps the code beside them
PASS  CONTROL -- a hard-coded address in code is found by the same search
PASS  the setting is read once, from a server-only name
PASS  the reset action reads no request header
PASS  CONTROL -- the sign-up confirmation in the same file really does read headers

5. the reset code: never printed, never logged, never carried
PASS  nothing under web/src logs anything at all
PASS  CONTROL -- the same search finds a console call when there is one
PASS  the route handler has exactly one redirect
PASS  and it goes to a fixed path from resetLandingPath
PASS  CONTROL -- a redirect to something built from the link is not mistaken for a fixed one
PASS  the two fixed paths, neither carrying anything from the link
PASS  both of them are the new-password page
PASS  no line puts the code into a template string, a URL, a cookie or a redirect
PASS  CONTROL -- such a line is found when it exists
PASS  the token type is written in the code, not read from the address bar

6. the new-password page: two states, and only one has a form
PASS  a link Supabase accepted, and a session: the form
PASS  no marker, but signed in -- somebody who typed the address
PASS  a marker but no session -- the session lapsed
PASS  neither: a stranger opening the page
PASS  ?link=0 wins over everything else
PASS  the dead-link state says one sentence and draws no form and no password field
PASS  the page draws exactly one form in total
PASS  the dead-link sentence gives no reason away: it names every cause at once
PASS  the marker cookie is set only by the route handler, and read only by the page
PASS  the marker is httpOnly, same-site and short-lived

7. the password rule is sign-up's rule, from one constant
PASS  the minimum
PASS  one character short
PASS  exactly the minimum is allowed
PASS  longer is allowed
PASS  empty
PASS  missing altogether
PASS  not a string
PASS  spaces count as characters, and nothing is trimmed: a password may begin and end with one
PASS  the refusal says what to do and names no account
PASS  both forms take their minimum from the constant, and neither writes a number of its own
PASS  where the new-password form goes next, for each of the three results

8. which screens a signed-out person may open
PASS  the request screen and the new-password screen are both reachable while signed out
PASS  CONTROL -- /tasks is NOT in that list, so the list means something
PASS  the sign-in page offers the link, and it points at the request screen

69 of 69 checks passed.

exit=0
```

(One warning is printed after the totals on every run and is left out above:
`MODULE_TYPELESS_PACKAGE_JSON`, because Node strips the types out of a `.ts` file inside a folder whose
`package.json` has no `"type"` field. `scripts/tasks-filter-check.mjs` has the same note, and the
answer is the same: do not add `"type"` to `web/package.json` to silence it, because that file
configures the Next.js build.)

**Eight of those checks are controls.** Each one is a string that does contain what is being searched
for, run through the same code, because zero matches is also what a broken search looks like (rule 8).
The sharpest is `CONTROL -- signIn ... really does have two redirects, a branch and an error`: it is
the same reader, on the same file, on the function next door.

## 3. The checks can fail — three break-it runs

A check that cannot go red reports a pass and means nothing. So each of the three promises was broken
in turn and the script run again. **None of the breaks was committed**; §4 is the proof of that.

### 3a. The message differs when Supabase complains

This is the break issue #120's "those tests fail if the messages differ" is about. `outcomeAfterRequest`
was given a branch: a different path and a different sentence when the answer carries an error.

```
$ node scripts/password-reset-check.mjs      (with outcomeAfterRequest branching on the error)
1. the one sentence, and the one outcome
PASS  the message is the exact sentence issue #120 rule 1 requires
PASS  a known address: Supabase sent a link -- same outcome
PASS  an unknown address: Supabase sent nothing, and said so with no error -- same outcome
FAIL  AN ERROR FROM SUPABASE: the rate limit, which CAN be told apart -- same outcome
        expected {"path":"/forgot-password?sent=1","message":"If that address has an account, we've sent a link"}
        got      {"path":"/forgot-password?problem=1","message":"Something went wrong. Please try again in a minute."}
PASS  an answer of a shape nobody expected -- same outcome
FAIL  all four worlds give ONE outcome, counted as distinct values rather than compared by eye
        expected 1
        got      2

67 of 69 checks passed.

2 FAILED:
  - AN ERROR FROM SUPABASE: the rate limit, which CAN be told apart -- same outcome
  - all four worlds give ONE outcome, counted as distinct values rather than compared by eye
exit=1
```

(Only section 1 is shown; every other line read `PASS`.) Two checks caught it, and the second one is
the one worth having: it counts distinct outcomes rather than comparing two of them, so it would catch
a difference between any pair.

### 3b. A second exit in the action, with the message unchanged

The more realistic mistake, and the one no test of the pure function could ever see: the sentence stays
in its constant, and the ACTION grows a branch that never reaches it.

```
$ node scripts/password-reset-check.mjs      (with `if (error) redirect("/forgot-password?problem=1")` in the action)
1. the one sentence, and the one outcome
PASS  ... (all seven checks in section 1 passed)

2. the request action: one exit, no branch, nothing logged
PASS  requestPasswordReset was found in web/src/app/auth/actions.ts
FAIL  it has exactly one redirect
        expected 1
        got      2
FAIL  it has no branch at all: no if, no ternary, no &&
        expected [0,0,0]
        got      [1,0,0]
FAIL  it never looks at an error
        expected 0
        got      2
PASS  CONTROL -- signIn, in the same file, really does have two redirects, a branch and an error

66 of 69 checks passed.

3 FAILED:
  - it has exactly one redirect
  - it has no branch at all: no if, no ternary, no &&
  - it never looks at an error
exit=1
```

**Every check in section 1 stayed green**, which is the whole argument for reading the action's source
as well as calling its functions.

### 3c. A hard-coded localhost, when the setting is missing

The mistake issue #120 rule 4 names: a fallback address written into the code.

```
$ node scripts/password-reset-check.mjs      (with `const fallback = "http://localhost:3000"` in resetRedirectTo)
4. where the email links back to: a setting, and nothing else
FAIL  no setting means no redirectTo at all
        expected undefined
        got      "http://localhost:3000/auth/reset"
FAIL  an empty setting is no setting
        expected undefined
        got      "http://localhost:3000/auth/reset"
FAIL  a setting of spaces is no setting
        expected undefined
        got      "http://localhost:3000/auth/reset"
FAIL  not a string is no setting
        expected undefined
        got      "http://localhost:3000/auth/reset"
PASS  the owner's local test address, from the setting
...
FAIL  no "localhost" in the code of any of these files
        expected []
        got      ["module"]
PASS  no "vercel.app" in the code of any of these files
PASS  no ".supabase.co" in the code of any of these files
FAIL  no "http://" in the code of any of these files
        expected []
        got      ["module"]
PASS  no "https://" in the code of any of these files

63 of 69 checks passed.

6 FAILED:
  - no setting means no redirectTo at all
  - an empty setting is no setting
  - a setting of spaces is no setting
  - not a string is no setting
  - no "localhost" in the code of any of these files
  - no "http://" in the code of any of these files
exit=1
```

Six, from two independent directions: four by calling the function, two by reading the file. The second
pair matters because a fallback could be written somewhere the function is not, and the text search
covers every file in the list.

## 4. The committed files are the green ones

```
$ node scripts/password-reset-check.mjs
69 of 69 checks passed.
exit=0
```

(The full output is §2.) Each break carried a `DELIBERATELY BROKEN` comment, so the reverts can be
checked rather than taken on trust:

```
$ git grep -n "DELIBERATELY BROKEN" -- web scripts
exit=1
```

No output, exit 1 — `git grep` exits 1 when it finds nothing. The control for that empty result is the
three runs above: the breaks were real enough to turn eleven checks red between them.

**The three reverts were made by hand, one edit each, not by `git checkout`.** What stands behind them
is the grep above, the green run, and the lint and build in §5 — not a diff against a saved copy.

## 5. Lint, build and the repository's own suite

```
$ npm run lint          (in web/)
> web@0.1.0 lint
> eslint

exit=0
```

```
$ npm run build         (in web/)
> web@0.1.0 build
> next build

▲ Next.js 16.3.6 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 226ms

  Creating an optimized production build ...
✓ Compiled successfully in 1236ms
  Running TypeScript ...
  Finished TypeScript in 2.4s ...
✓ Generating static pages using 15 workers (13/13) in 1114ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /auth/callback
├ ƒ /auth/reset
├ ƒ /auth/signout
├ ƒ /forgot-password
├ ƒ /invite/[token]
├ ƒ /login
├ ƒ /reset-password
├ ƒ /signup
├ ƒ /tasks
└ ƒ /teams


ƒ Proxy (Middleware)

exit=0
```

The three new routes are in that list: `/auth/reset`, `/forgot-password` and `/reset-password`. The
build also type-checks the whole app, which is what says the pages, the action and the route handler
agree with the module they import.

```
$ npm test              (at the top of the repository)
PASS: 537 rule examples across 24 rules, plus 32 fail-closed checks.
lint-skills: PASS - 12 skills, 0 problems
launch-check selftest: PASS (171/171 assertions, 39 checklist items, 17 auto checks, git available)
Self-test: 7/7 cases passed.
Checked 4 workflow file(s), 16 job(s): 0 problem(s), 0 warning(s).
vet-tool selftest: PASS (34/34 assertions; 20 malicious detections, 24 findings on malicious fixture, 0 HIGH/MEDIUM on benign near-miss control)
handoff selftest: PASS (57/57 assertions; 11 secret types redacted, 9 controls unchanged, end-to-end ran)
Self-test: 20/20 cases passed.
AI team self-test: 258 passed, 0 failed.
Checked 6 workflow file(s), 14 job(s): 0 problem(s), 0 warning(s).
exit=0
```

(The per-case lines of the guard, drift and ai-team self-tests are left out; the totals above are their
own summary lines, pasted as they came back. Nothing failed.)

Every total is the same as the one in `evidence/build-it-16-function-doors.md` §5, which is the
expected result and not a strong one: **none of those suites looks at the new script.** `npm test` runs
the kit's own self-tests and never reaches `scripts/password-reset-check.mjs`, exactly as it never
reaches `scripts/tasks-filter-check.mjs` — issues **#87** and **#102**. The new script was added to
that record as a comment on #102 rather than as a third near-duplicate issue.

## 6. The redirect addresses the owner has to add

Supabase settings are not the assistant's to change (rule 10 and issue #120 rule 5), so these are for
the owner, in each project's **Authentication → URL Configuration → Redirect URLs**:

| Project | Address to add | Why |
|---|---|---|
| **staging** | `http://localhost:3000/auth/reset` | The owner's test runs `next dev` on this machine against staging, so the reset link has to come back to localhost. `http`, not `https`, which is correct for localhost and must not be copied to production |
| **production** | `<the production site address>/auth/reset`, over `https` | Where a real reset link has to land |

**Unverified — which of these already exist, and what the production address is.** Nothing in this
repository records either. `supabase/config.toml` has no `[auth]` section; no document here lists a
Site URL, a redirect address or the production web address, and `docs/environments.md` says the
production address is deliberately not written down and no domain name has been chosen. So the
production row above names a placeholder, not an address — the owner substitutes the real one. The
Supabase dashboard is the only authoritative place for what is on either list today.

**If neither is added, the feature still does not break.** With `SITE_URL` unset the app sends no
redirect address at all and Supabase uses the project's Site URL; with `SITE_URL` set to an address
that is not on the allow-list, Supabase ignores it and falls back to the same Site URL. The visible
symptom in both cases is a reset link that lands on the project's home page instead of the form.

## 7. The owner's test, on localhost:3000 against staging

Not run by the assistant. **No reset email has been sent by anybody**, which is what issue #120 asks
for: staging's built-in sender allows very few per hour, and the owner tests with Alice.

1. Add `http://localhost:3000/auth/reset` to **staging's** Redirect URLs (§6).
2. Put `SITE_URL=http://localhost:3000` in `web/.env.local` — the git-ignored file that already holds
   the staging URL and publishable key. Nothing secret: it is an address.
3. `cd web`, then `npm run dev`.
4. Open `http://localhost:3000/login` and press **Forgot password?**.
5. Type Alice's address, `teamtasks.staging.test+alice@gmail.com`, and submit. Expect the page to come
   back saying *If that address has an account, we've sent a link*.
6. Type an address with no account — `teamtasks.staging.test+nobody@gmail.com` — and submit. Expect
   **the same screen, the same sentence**. This is the half of rule 1 only a person can confirm.
7. Open the Gmail test mailbox, `teamtasks.staging.test@gmail.com`, and follow the link in the mail for
   Alice. Expect to land on **Set a new password** — not on the tasks page, and not on the home page.
8. Type a 7-character password. Expect *A password needs at least 8 characters.* and no change.
9. Type a password of 8 or more and save. Expect to arrive at **My tasks**, signed in.
10. Press the browser's back button to the form and try to save again. Expect **That link didn't work**
    — the marker is spent.
11. Open `http://localhost:3000/reset-password` directly, in a private window. Expect **That link
    didn't work**, no form, and nothing about any account.
12. Sign out, then sign in as Alice with the **new** password. Expect it to work. Then put Alice's
    password back to the one in `~/.config/team-tasks/staging.env`, or update that file, or the staging
    scripts stop being able to sign her in.

Step 12 is the one easy to forget, and the one that breaks three other scripts if it is.

## 8. What was NOT run, and what therefore stays unproved

- **No email was sent, by anybody.** So nothing here shows that a reset email arrives, that its link
  lands on `/auth/reset`, that Supabase accepts the code, or that the new password works.
  **Unverified — the end-to-end flow**, and §7 is how to settle it.
- **Nothing was changed in Supabase, and nothing was read from it.** No setting, no template, no
  allow-list entry. The assistant has sent nothing to staging or production in this task.
- **The code-exchange landing is the same mechanism as `/auth/callback`, and no evidence file in this
  repository records `/auth/callback` ever having worked with a real emailed link.** Searched
  `evidence/` for `auth/callback`: the three hits are all build output listing the route, not an
  observation of a link being followed. So "the link lands and the code is accepted" rests on the
  installed client's own source and Supabase's guide, not on anything seen here.
- **The `token_hash` branch of `/auth/reset` is the one the official guide documents, and it is the one
  least likely to run.** The default recovery email template sends the person to Supabase's own verify
  endpoint, which comes back with a `code`. The second branch exists so the flow still works if the
  project's template points straight at the app — and nothing here has exercised it, because that
  needs a real link.
- **The marker cookie's behaviour across the hop from the email was not observed.** It is set
  `sameSite: lax` on a redirect from this app's own origin to this app's own page, which is a same-site
  request, so it should be sent — **"should" is exactly what rule 15 forbids claiming**. Step 7 of §7
  is what settles it: landing on the form at all means the cookie arrived.
- **No screen was looked at.** The pages compiled and type-checked; nobody has seen one rendered. There
  is no screenshot in this file.
- **No rate limit or bot check protects the new request form.** It is an unauthenticated endpoint that
  causes an email to be sent, and the only limit on it today is whatever Supabase applies by default,
  which has not been read. `checklist/launch.json` already carries both items ("Rate limits protect
  login, sign-up, password reset and any costly endpoint", and "Sign-up and password reset are
  protected by a CAPTCHA or bot check"); the new endpoint is filed as an issue so the two are not first
  thought about at launch.
- **Sign-up still has no server-side password-length check.** The reset form checks the length on the
  server; sign-up relies on the browser's `minLength` and on Supabase's own project minimum, which is
  not in this repository. Both forms now take the number from one constant, so they cannot disagree
  about what the rule is — but they do still disagree about where it is enforced. Filed as an issue.
- **CI does not run this script.** See the end of §5.

## Personal data in this file

**Nothing was captured from production, and nothing from staging either** — rule 18's list is empty for
both, and an empty list is the complete answer. No command in this task talked to any Supabase project,
so there was no response body, log line or error payload to redact. No value was shortened, masked or
starred out, because there was no value.

The two email addresses in §7 are the staging test mailbox with plus-addressing —
`teamtasks.staging.test+alice@gmail.com` and a `+nobody` variant invented here — both already written
down in `docs/environments.md` on purpose, and neither belonging to a real person (rule 6). No
password, token, hash, key, user id or project reference appears anywhere above.

The code in this change is written so a run of it stays that way: no file under `web/src` logs
anything (§2, section 5), the reset code never reaches a template string, a cookie, a redirect or a
page, and the request screen never echoes back the address it was given.
