# Evidence: Build it 16 step 4 — Forgot password (screens only)

Issue #120. Branch `feat/password-reset`. **No migration and no change under `supabase/functions`**,
and nothing was changed in Supabase: the diff is the web app, one check script, this file, one line in
`evidence/build-it-16-function-doors.md`, `.env.example` and `docs/environments.md`.

Result: **the screens are built, every check that can run without an email passes, and the owner has
now run the flow end to end on staging — it works, on the third attempt.** §11 is that run, on
4 Oct 2026. The first two attempts failed for two different setup reasons, neither of them a bug in
this code, and the second one is why §7's step order changed.

**§11 is the newest part of this file, and it supersedes every sentence before it that says no reset
email has been sent.** Those sentences were true when §1–§10 were written, at commit `22b5564`, and
they are left standing as the record of that state rather than edited away; §8 now carries a pointer
to §11 beside each claim §11 settles. **§10** is the previous addition: the one change the coach's
review of PR #124 asked for — `setNewPassword` now requires the reset marker and a signed-in session
before it changes anything — and the break-it run that shows the new checks go red when the gate is
removed. The check count in §2 and §4 went from 69 to **84** with that change.

Dates: §1–§10, 2026-10-03. §11, 2026-10-04.
Checked by: **the assistant (Claude Code)**, on this machine, for §1–§10 — and for those sections
nothing was observed on staging or on production by anybody, no email was sent, no account was signed
in and no reset link was clicked. **§11 is the opposite: none of it was run or seen by the assistant.**
It is the owner's test and the coach's log readings, written down here as reported. The assistant sent
nothing to staging in this task either.

## What is proved here, and what is not

**Proved by a run on this machine:** the request screen gives one identical outcome for a known
address, an unknown address, an error from Supabase and an answer of a shape nobody expected; the
sentence exists in exactly one place in the code; the request action has one exit and no branch; no
address is hard-coded anywhere in `web/src`; nothing under `web/src` logs anything; the reset code
never travels into a URL, a cookie or a redirect of ours; the new-password page draws no form without
a link Supabase accepted; **`setNewPassword` refuses, before it reads the password or calls Supabase,
unless the marker and a session are both there** (§10); the password minimum is sign-up's, from one
constant. 84 checks, §2.

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

## 2. The checks: 84 of 84, and what each group is for

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
PASS  the marker cookie is set by the route handler, and read by BOTH the page and the action
PASS  the marker is httpOnly, same-site and short-lived

6b. the action refuses before it changes anything
PASS  setNewPassword was found in web/src/app/auth/actions.ts
PASS  marker and session: allowed
PASS  a signed-in person who never followed a link: refused
PASS  a marker with no session: refused
PASS  neither: refused
PASS  the page asks the same function rather than repeating its test, so the two cannot drift
PASS  the action READS the marker cookie, not merely deletes it
PASS  the action verifies the session itself, with getClaims rather than getSession
PASS  the action asks mayChangePassword
PASS  A GATE THAT RUNS AFTER THE CHANGE IS NOT A GATE: mayChangePassword comes before updateUser
PASS  and before the password is even read, so a refused call learns nothing from which answer it got
PASS  a refused call takes the dead-link path
PASS  CONTROL -- a gate written AFTER the change is not mistaken for a gate
PASS  CONTROL -- an action with no gate at all comes out false, not true
PASS  CONTROL -- signUp, in the same file, has no gate, so these searches are specific rather than everywhere

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

84 of 84 checks passed.

exit=0
```

(One warning is printed after the totals on every run and is left out above:
`MODULE_TYPELESS_PACKAGE_JSON`, because Node strips the types out of a `.ts` file inside a folder whose
`package.json` has no `"type"` field. `scripts/tasks-filter-check.mjs` has the same note, and the
answer is the same: do not add `"type"` to `web/package.json` to silence it, because that file
configures the Next.js build.)

**Eleven of those checks are controls** — counted by listing them out of the script in this session.
Most are a string that does contain what is being searched for, run through the same code, because
zero matches is also what a broken search looks like (rule 8). The sharpest is
`CONTROL -- signIn ... really does have two redirects, a branch and an error`: it is the same reader,
on the same file, on the function next door.

Two of the three added in §6b work the other way round: they are fixtures where the right answer is
**false** — a gate written after the change, and an action with no gate at all — so a comparison that
said "true" whatever it was handed would fail them. The third, `signUp`, is an ordinary "found
nothing" control and is the weaker of the three, because a search that always found nothing would
pass it. It is there to show the §6b searches are specific to one function rather than true of any
function in the file.

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
84 of 84 checks passed.
exit=0
```

(The full output is §2. §3's three break-it runs were made against the 69-check version of the script,
before §10 added the gate and its checks; their totals lines read 69. §10 has its own run, and its own
revert, recorded there.)

Each break carried a `DELIBERATELY BROKEN` comment, so the reverts can be checked rather than taken on
trust:

```
$ git grep -n "DELIBERATELY BROKEN" -- web scripts
exit=1
```

No output, exit 1 — `git grep` exits 1 when it finds nothing. The control for that empty result is the
three runs above: the breaks were real enough to turn eleven checks red between them.

**The reverts were made by hand, one edit each, not by `git checkout`.** Three in §3, and a fourth in
§10. What stands behind them is the grep above, the green run, and the lint and build in §5 — not a
diff against a saved copy.

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

**If neither is added, nothing crashes — but the reset cannot be completed.** With `SITE_URL` unset the
app sends no redirect address at all and Supabase uses the project's Site URL; with `SITE_URL` set to
an address that is not on the allow-list, Supabase ignores it and falls back to the same Site URL. In
both cases the link lands on the project's home page, carrying a code that no page there handles, so
the person never reaches the form. **So the feature needs both: the setting set, and the address
allow-listed.** That sharper reading is the coach's, in §10.4; this paragraph originally stopped at
"lands on the home page", which understated it.

The first half of that is read from the installed client rather than assumed: `resetRedirectTo` returns
`undefined` when the setting is absent, and `web/node_modules/@supabase/auth-js/dist/module/lib/fetch.js:99-101`
adds `redirect_to` to the request only when the option is truthy — so nothing is sent, rather than an
empty value being sent. **The second half is not read from anything here**: that Supabase falls back to
the Site URL for an address not on the allow-list is from its own documentation, not from an
observation in this repository.

## 7. The owner's test, on localhost:3000 against staging

Not run by the assistant. The owner ran these steps on 4 Oct 2026 and **§11 is the result** — read §11
for what actually happened; this section is the procedure, now corrected by it.

**The unknown-address request is step 11, not step 6, and that reordering is the point of this
section.** It used to be step 6, immediately after Alice's request and *before* the emailed link was
opened. In that order the test cannot pass, and §11.2 is the run where it did not: a second
`recover` request from the same browser **replaces the PKCE code verifier that the first link needs**,
so Alice's link — correctly emailed, correctly opened, verified by Supabase — then fails at the code
exchange, and the owner gets *That link didn't work* with nothing wrong in the app at all. (That cause
is the coach's reading of the staging log, §11.2.) The request for an unknown address proves rule 1,
which is about the screen and the sentence; it needs no email and no link, so it costs nothing to do
**after** the link has been used, and doing it before destroys the rest of the test.

Two smaller corrections from §11 are also folded in: step 2 now says to check the file ends with a line
break (§11.1), and step 6 says **copy**, not follow, which §10.4 had already flagged and the old step 7
still got wrong.

1. Add `http://localhost:3000/auth/reset` to **staging's** Redirect URLs (§6).
2. Put `SITE_URL=http://localhost:3000` in `web/.env.local` — the git-ignored file that already holds
   the staging URL and publishable key. Nothing secret: it is an address. **Put it on its own line and
   make sure the previous line ends with a line break.** A file with no final newline swallows the new
   setting onto the end of the key above it, which breaks the key and not the setting — §11.1, where
   that is exactly what happened and what it cost.
3. `cd web`, then `npm run dev`.
4. Open `http://localhost:3000/login` and press **Forgot password?**.
5. Type Alice's address, `teamtasks.staging.test+alice@gmail.com`, and submit. Expect the page to come
   back saying *If that address has an account, we've sent a link*.
6. Open the Gmail test mailbox, `teamtasks.staging.test@gmail.com`, and **copy** the link in the mail
   for Alice into **the same browser you used in step 5** — do not click it in the mailbox if that is a
   different browser. The flow exchanges a code only the browser that asked for it can complete
   (§10.4). **Make no other reset request between step 5 and this step**, for the reason above. Expect
   to land on **Set a new password** — not on the tasks page, and not on the home page.
7. Type a 7-character password. Expect *A password needs at least 8 characters.* and no change.
8. Type a password of 8 or more and save. Expect to arrive at **My tasks**, signed in.
9. Press the browser's back button to the form and try to save again. Expect **That link didn't work**
   — the marker is spent.
10. Open `http://localhost:3000/reset-password` directly, in a private window. Expect **That link
    didn't work**, no form, and nothing about any account.
11. **Now**, and not before, go back to **Forgot password?** and type an address with no account —
    `teamtasks.staging.test+nobody@gmail.com`. Expect **the same screen, the same sentence** as step 5.
    This is the half of rule 1 only a person can confirm, and it is safe here because Alice's link has
    already been used: there is no verifier left to overwrite, and Supabase sends no email for an
    address it does not know, so it costs nothing from the sender's hourly allowance either.
12. Sign out, then sign in as Alice with the **new** password. Expect it to work. Then put Alice's
    password back to the one in `~/.config/team-tasks/staging.env`, or update that file, or the staging
    scripts stop being able to sign her in.

Step 12 is the one easy to forget, and the one that breaks three other scripts if it is. §11.5 records
that the owner did it, and the run that proves it.

## 8. What was NOT run, and what therefore stays unproved

**This section is as it stood at `22b5564`, before the owner's test. Five of its items are now settled
and one is not; each says which, and §11 is the record.** Nothing here was rewritten, so the list still
reads as the honest state of the change on its own.

- ~~**No email was sent, by anybody.**~~ **Settled by §11** — three `recover` requests were made on
  4 Oct 2026, Alice's email arrived, its link landed on `/auth/reset`, Supabase accepted the code
  (exchange 200, §11.3) and the new password then signed her in. As written, this item said nothing
  here shows any of that; §11 shows all four, as reported by the owner and the coach rather than
  observed by the assistant.
- **Nothing was changed in Supabase by the assistant, and nothing was read from it by the assistant.**
  No setting, no template, no allow-list entry, in this task or the one that added §11. **The owner
  added staging's redirect address and the coach read staging's gateway log** — that is how §11 exists,
  and neither is the assistant's doing. Still **unverified by the assistant**: what is on either
  project's Redirect URLs list today.
- **The code-exchange landing is the same mechanism as `/auth/callback`, and no evidence file in this
  repository records `/auth/callback` ever having worked with a real emailed link.** Searched
  `evidence/` for `auth/callback`: the three hits are all build output listing the route, not an
  observation of a link being followed. **§11.3 now records the mechanism working on `/auth/reset`** —
  verify 303, exchange 200 — so "the link lands and the code is accepted" is no longer resting on the
  client's source and Supabase's guide alone. `/auth/callback` itself is still unexercised; what §11
  shows is the shared mechanism, on the other route.
- **The `token_hash` branch of `/auth/reset` is the one the official guide documents, and it is the one
  least likely to run.** The default recovery email template sends the person to Supabase's own verify
  endpoint, which comes back with a `code`. The second branch exists so the flow still works if the
  project's template points straight at the app — and nothing here has exercised it, because that
  needs a real link. **Still unverified after §11**: all three attempts went through Supabase's verify
  endpoint and came back with a `code`, which is the first branch. The `token_hash` branch has still
  never run.
- ~~**The marker cookie's behaviour across the hop from the email was not observed.**~~ **Settled by
  §11.3** — the owner landed on the new-password form, and landing on the form at all means the cookie
  arrived, which is what this item said would settle it.
- **No screen was looked at by the assistant, and there is still no screenshot.** The pages compiled and
  type-checked. The owner has now seen four screens — the sentence after a request, the new-password
  form, *That link didn't work*, and My tasks — and reported them in words (§11.4). Nobody captured an
  image, so what each screen looks like is still unrecorded.
- ~~**The gate in §10 was not exercised by a running request.**~~ **Settled by §11.4, both halves** —
  the back button to a spent marker and `/reset-password` in a private window each gave *That link
  didn't work*, which are steps 9 and 10 of §7, the two this item named. What those two show is the
  refusal a person can reach through a browser; **nobody posted to `setNewPassword` directly**, so the
  gate's own path is reported only from the screen it produces.
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

## 9. CI on the pull request

PR **#124**, commit `d441598`, run 37144233483. Every check green, including `required` — the one job
marked required in the branch rules, which fails if any other job was skipped rather than succeeding:

```
$ gh pr checks 124 --watch
App build                               pass  27s
Drift-check self-test                   pass  7s
Guard self-test                         pass  28s
Handoff self-test                       pass  8s
Launch check self-test                  pass  6s
Secret scan (gitleaks)                  pass  7s
Skills lint                             pass  6s
Vet-tool self-test                      pass  4s
Workflow lint (permissions + timeouts)  pass  7s
npm test (macos-latest)                 pass  50s
npm test (windows-latest)               pass  1m4s
required                                pass  4s
```

The two Vercel checks also passed. **The preview deployment was not tested**: it points at staging, and
testing the reset flow on it would mean sending an email, which this task does not do. A green Vercel
build says the app compiles, not that any screen works.

**None of these jobs runs `scripts/password-reset-check.mjs`** — the end of §5, and issue #102. What CI
proves here is that nothing else broke.

The commit that adds this section has a later run again, which is not recorded here, because a file
that records the CI result of the commit that records the CI result never finishes.

## 10. The coach's review of PR #124 — the one change it asked for

The review is a comment on PR #124, posted after commit `255678d`. It asked for **one** change, and it
was right.

### 10.1 What was wrong

**`setNewPassword` did not check the reset marker; only the page did.** The page hid the form unless
the marker cookie was there, and the action behind it accepted a post from **any signed-in session**
and changed that account's password. The review's words: *"A page that hides a form is not a check…
#120 says opening the page without a valid reset link 'changes nothing'; a direct call to the action
does change something."*

It was not a way in for a stranger — a signed-in person can change their own password through Supabase
directly, whatever this app does — and the review said so too. What was wrong is that the app's own
rule was enforced where it was drawn rather than where it counts.

### 10.2 What it is now

`mayChangePassword({ marked, signedIn })` is a new function in `web/src/lib/password-reset.ts`, and
**both** places ask it: the page, to decide whether to draw the form, and `setNewPassword`, to decide
whether to do anything at all. `newPasswordView` now defers to it instead of repeating its test, so
the screen cannot start offering a form the action would refuse.

In the action the gate comes **first** — before the password field is read and before Supabase is
called:

- it reads the marker cookie itself, with `cookieStore.get(RESET_MARKER_COOKIE)`;
- it verifies the session itself, with `getClaims()` — not `getSession()`, which trusts a cookie
  anyone can forge;
- a call that fails either half gets `newPasswordPath("stale")`, the dead-link screen, and the marker
  is deleted, so the form is not offered again until a new link is accepted;
- the password is not even read on that path, so a refused call learns nothing from which answer it
  got back.

### 10.3 The new checks, and the run where they go red

Fifteen checks were added, in a new section **6b**, and one existing check changed: it used to assert
the marker was *"read only by the page"*, which is the line that recorded the bug as if it were a
design. The script now has **84** checks.

The run with the gate removed — the exact state the review found, `DELIBERATELY BROKEN`:

```
$ node scripts/password-reset-check.mjs      (with the gate deleted from setNewPassword)
6. the new-password page: two states, and only one has a form
...
FAIL  the marker cookie is set by the route handler, and read by BOTH the page and the action
        expected [2,2,5]
        got      [2,2,3]
PASS  the marker is httpOnly, same-site and short-lived

6b. the action refuses before it changes anything
PASS  setNewPassword was found in web/src/app/auth/actions.ts
PASS  marker and session: allowed
PASS  a signed-in person who never followed a link: refused
PASS  a marker with no session: refused
PASS  neither: refused
PASS  the page asks the same function rather than repeating its test, so the two cannot drift
FAIL  the action READS the marker cookie, not merely deletes it
        expected 1
        got      0
FAIL  the action verifies the session itself, with getClaims rather than getSession
        expected [1,0]
        got      [0,0]
FAIL  the action asks mayChangePassword
        expected 1
        got      0
FAIL  A GATE THAT RUNS AFTER THE CHANGE IS NOT A GATE: mayChangePassword comes before updateUser
        expected true
        got      false
FAIL  and before the password is even read, so a refused call learns nothing from which answer it got
        expected true
        got      false
FAIL  a refused call takes the dead-link path
        expected true
        got      false
PASS  CONTROL -- a gate written AFTER the change is not mistaken for a gate
PASS  CONTROL -- an action with no gate at all comes out false, not true
PASS  CONTROL -- signUp, in the same file, has no gate, so these searches are specific rather than everywhere

77 of 84 checks passed.

7 FAILED:
  - the marker cookie is set by the route handler, and read by BOTH the page and the action
  - the action READS the marker cookie, not merely deletes it
  - the action verifies the session itself, with getClaims rather than getSession
  - the action asks mayChangePassword
  - A GATE THAT RUNS AFTER THE CHANGE IS NOT A GATE: mayChangePassword comes before updateUser
  - and before the password is even read, so a refused call learns nothing from which answer it got
  - a refused call takes the dead-link path
exit=1
```

(Only sections 6 and 6b are shown; every other line read `PASS`.) **Seven independent checks catch
it**, and the five pure-function cases above them stay green — which is the same lesson as §3b, in the
other direction: testing `mayChangePassword` proves what the function decides, not that anybody asks
it.

**One of those seven was weaker on the first attempt, and the break-it run is what found it.** The
check started as "the action mentions `RESET_MARKER_COOKIE` at least twice", and it **passed** with the
gate deleted, because the two `delete` calls alone satisfied it. It now looks for
`get(RESET_MARKER_COOKIE)` exactly once — reading the cookie, not merely deleting it — and the run
above is after that fix: six failures became seven.

The revert, and the green run:

```
$ git grep -n "DELIBERATELY BROKEN" -- web scripts
exit=1

$ node scripts/password-reset-check.mjs
84 of 84 checks passed.
exit=0

$ npm run lint          (in web/)
exit=0

$ npm run build         (in web/)
✓ Compiled successfully in 1348ms
  Running TypeScript ...
  Finished TypeScript in 2.6s ...
exit=0
```

### 10.4 What the review raised that is NOT a code change

Three notes for the owner's setup, recorded here because each one makes the test in §7 more likely to
work first time. **All three are the reviewer's reading, not something observed here** — nothing in
this task sent an email or opened a link.

- **`SITE_URL` is "optional" only in the sense that nothing crashes.** With it unset, Supabase sends
  the link to the project's Site URL with a code attached, and no page there handles a code — so the
  reset does not complete. The same happens, silently, if `<SITE_URL>/auth/reset` is not on the
  project's Redirect URLs. **For the feature to work: the setting set, and the address allow-listed.**
  §6 said the symptom but called the consequence "a reset link that lands on the project's home page
  instead of the form"; the sharper statement is that the reset then cannot be completed at all.
- **The link must be opened in the browser that asked for it.** The flow exchanges a PKCE code, and
  only the browser that made the request holds the other half. The test mailbox is in a different
  browser, so the link has to be **copied across**, not clicked there. §7 step 7 says to follow the
  link from the mailbox, which is exactly the thing that will not work — read it as "copy the link into
  the browser running `next dev`".
- **A reset link signs the person in** even if they never choose a new password. That is how Supabase's
  recovery works, and it is why the dead-link screen and the spent marker matter: the session is real
  before any password is typed.

### 10.5 What the review checked, and what it did not

Recorded so the next reader does not take it for more than it was. The review states it was done in
the coach's sandbox, that no email was sent, and that nothing touched staging or production. It
checked: scope (no migration, nothing under `supabase/functions`); the script at 69 of 69; the request
path, finding no way for a known address, an unknown address, an empty address or a Supabase error to
give a different screen; and `/auth/reset`'s two fixed redirects.

It explicitly did **not** check any real email or link, the `token_hash` branch, or how the screens
look — the same three things §8 of this file already lists as unverified. It also did not look at
**#121**, **#122** or **#123** beyond their titles.

## 11. The owner's test, run — 4 Oct 2026

On `localhost:3000` against **staging**. Three attempts; the third one worked.

**Who saw what, because this section is the one place in this file where the answer is not "the
assistant".** The screens are the **owner's**, in a browser on their machine. The staging gateway log
lines are the **coach's** readings of staging's log. The assistant ran nothing, sent nothing, opened no
screen and read no log, here or anywhere in this task — **so every line below is reported, and
unverified by the assistant.** Staging's own log is the authority for the timings and statuses, and
only the owner and the coach can see it. Times are UTC, as reported.

### 11.1 Attempt 1 — the sentence appeared, and no email came

The request screen showed the usual sentence. **No email arrived.**

The coach read staging's gateway log: `POST /auth/v1/recover` at **09:40:43 UTC** answered **401**,
`UNAUTHORIZED_INVALID_API_KEY`, reason **`bad_length`**.

**Cause.** In `web/.env.local` the `SITE_URL` setting had been **appended to the end of the publishable
key line**, because the file had no final line break. So the key carried the setting on its end and was
the wrong length — which is what `bad_length` says, and why the failure landed on the key and not on
the setting that was being added.

**Whose it was.** The command that appended it was the **coach's**, and the coach's own check of the
result **cut lines to 40 characters**, which hid the problem: what was appended sat on the **end** of a
line, and a view that stops at 40 characters never reaches the end of a line longer than that.

Fixed by the **owner**. The three lines then measured **65, 83 and 30** characters — and two of those
three are longer than 40, so for those two the check could not have shown what was on the end, whatever
was there.

Two things this does **not** say. It does not say the app behaved wrongly: `requestPasswordReset` has
one exit and never looks at the answer (§2, section 2), so a 401 from Supabase reaches the person as the
same reassuring sentence as a success — by design, for issue #120 rule 1. **That is issue #127, filed
from this attempt**: the refusal was invisible everywhere except a log only two people can read. And it
does not say the key leaked: the key is Supabase's **publishable** key, the one the browser
holds anyway, and **its value is not printed here or anywhere in this repository** — only the character
counts above, which are a measurement and not the value.

### 11.2 Attempt 2 — both addresses first, then the link, and the link failed

The coach's reading of the staging log, UTC:

| Time | What the log shows |
|---|---|
| 09:50:12 | `recover` **accepted** for Alice |
| 09:50:21 | `recover` **accepted** for the unknown address |
| 09:50:36 | the emailed link opened — `verify` answered **303** |
| 09:50:37 | the code exchange answered **400** |

The owner saw **"That link didn't work"**.

The owner **confirmed both requests and the link were in the same browser** — which is what rules out
the cause §10.4 had warned about, the one everybody expects.

**Cause, as the coach reads it: the second request replaced the code verifier the first link needed.**
Two `recover` requests nine seconds apart from one browser, and the second one's verifier is the one
still stored when the first one's link comes back to be exchanged. The link itself was fine — Supabase
verified it, 303 — and the exchange a second later is where it died, 400.

This is the finding that **reordered §7**: the unknown-address request moved from step 6 to step 11, so
it happens after the link has been used. Read §7's opening for the reasoning as it now stands in the
procedure.

**Reordering the test is not a fix, and it is filed as issue #126.** A person using the app gets the
same failure the owner got, with no procedure to follow: ask on a phone and open the email on a laptop,
or ask twice because the first email seems slow, and the link that arrives does not work. #126 carries
the option from Supabase's guide — a `token_hash` link, which `/auth/reset` already handles at
`web/src/app/auth/reset/route.ts:69-79` and which has never run — and the one thing that has to be
settled first, whether editing the recovery template needs custom SMTP.

### 11.3 Attempt 3 — Alice only, then the link in the same browser

Alice's address only, then the link in the same browser. Staging log, as read by the coach:

| Time | What the log shows |
|---|---|
| 09:54:02 | `verify` answered **303** |
| 09:54:03 | the code exchange answered **200** |

The owner reported: **landed on the new-password form, password reset, signed in.**

### 11.4 The owner's results, as reported

| What was asked for | Result |
|---|---|
| Short password refused | **NOT RUN** |
| Back button, then save again, shows *That link didn't work* | **yes** |
| `/reset-password` in a private window shows *That link didn't work* and no form | **yes** |
| The unknown address shows the same screen as Alice's | **yes** |
| Alice signs in with the new password | **yes** |

**"Short password refused: NOT RUN" is not a pass** (rule 8). The server-side length check in
`setNewPassword` has been exercised by the check script's pure-function cases and by a reader over the
action's source (§2, section 7), and by nothing in a browser. §7 step 7 is still the step that would
settle it, and it is the one step of §7 that remains unrun.

### 11.5 Afterwards — Alice's password, and the script that depends on it

§7 step 12, the one easy to forget. Reported by the owner:

- Alice's password in the owner's `~/.config/team-tasks/staging.env` was **updated to the new one**.
- The owner then ran **`scripts/staging/build-it-16-checks.mjs`**, which signs in as Alice using that
  file: **23 PASS, 0 FAIL, 0 UNVERIFIED, 1 NOT RUN.**

Those totals are **character-for-character the ones already recorded for that script** in
`evidence/build-it-16-function-doors.md:459` — `23 PASS, 0 FAIL, 0 UNVERIFIED, 1 NOT RUN (optional).`
So the re-run says the sign-in still works and nothing else moved, which is exactly what step 12 is
for.

**That script is not a password-reset check**, and its `1 NOT RUN` is **not** the short-password step
above. It is the function-doors script (issue #112), and its one NOT RUN line is #110's optional
expired-token case, skipped when `EXPIRED_ACCESS_TOKEN` is not set — the line is at
`scripts/staging/build-it-16-checks.mjs:1433` and recorded at
`evidence/build-it-16-function-doors.md:423`. Two different NOT RUNs, one in §11.4 and one here, and
neither is evidence for the other.

The owner did not report whether the other two staging scripts were re-run.

### 11.6 What was NOT reported, and therefore is not recorded

Rule 8: anything not reported is not a pass, and this list is as much of the section as the tables are.

- **The short-password refusal: NOT RUN**, as above. §7 step 7.
- **No screenshots, and no exact screen wording beyond the four phrases quoted** — *the usual
  sentence*, *That link didn't work*, *the new-password form*, *My tasks*. Whether each screen's text
  matches the constants in `web/src/lib/password-reset.ts` character for character was not checked by
  anybody; the owner reported screens by description.
- **No command output, and no exit code, for anything in §11.1 to §11.4.** Browser steps do not produce
  either, and the log lines are a person's reading of a dashboard, not a pasted terminal result. The one
  run with real totals is §11.5's, and those totals are quoted from the owner's report, not from a run
  on this machine.
- **The `token_hash` branch of `/auth/reset` was not exercised.** All three attempts produced a `code`
  via Supabase's verify endpoint, which is the other branch. §8 keeps this unverified.
- **Posting to `setNewPassword` directly, with no marker, was not done.** The two refusals in §11.4 are
  the ones a browser can reach. The gate's own refusal path is reported only through the screen it
  produced.
- **What is on staging's Redirect URLs list** was not reported, nor whether production's was touched.
  The owner added staging's address (§11 exists, so it was added); the list itself is unseen here.
- **Nothing about Bob or Carol** (rule 6). This change has no table, policy or query to test with them,
  as §8 says, and the owner's test did not involve them.
- **How many emails staging's sender has left this hour** was not reported. Three `recover` requests
  were made across the three attempts; Supabase sends nothing for an address with no account, so how
  many of them became mail is not something any line above states.
- **Whether `web/.env.local` now ends with a line break.** The fix in §11.1 is reported by its result —
  three lines of 65, 83 and 30 characters — not by anybody looking at the end of the file. The file is
  git-ignored and not on this machine's branch to check.

## Personal data in this file

**Nothing was captured from production. Rule 18's list of replaced values is empty, and an empty list
is the complete answer.** No command in any task on this branch talked to the production project.

**§11 does carry data read off staging**, which §1–§10 did not, so the empty list needs saying more
carefully than "nothing was captured". What came from staging's gateway log, via the coach, is: six
seven timestamps (counted in this session off §11.1 to §11.3), four distinct HTTP status codes — 401,
303, 400 and 200 — one error code (`UNAUTHORIZED_INVALID_API_KEY`), one reason (`bad_length`), and two
endpoint names, `recover` and `verify`. **None of that is a value rule 18 asks to be replaced**, so
nothing was replaced and nothing is listed:

- **Nothing that grants access.** No reset code, no `token_hash`, no session or refresh token, no signed
  URL, no cookie value, no API key. The emailed link is named in §11.2 and §11.3 and **its address is
  not written down**, nor any part of it. The publishable key of §11.1 is referred to by what went
  wrong with it and by character counts; **its value appears nowhere**, and a character count is a
  measurement, not a shortened value — rule 18 forbids `sk_…3f9`, and there is no equivalent here.
- **Nothing that identifies a person.** The only addresses in this file are the staging test mailbox
  with plus-addressing, `teamtasks.staging.test+alice@gmail.com` and the `+nobody` variant, both already
  in `docs/environments.md` on purpose and neither belonging to a real person (rule 6). §11's log lines
  say "for Alice" and "for the unknown address" rather than repeating either. No user id, no project
  reference, no IP address — **the coach reported statuses and times, not log lines verbatim, so no
  caller IP reached this file.** No password or hash, old or new, appears anywhere above: §11.3 says the
  password was reset, and not to what.

No value was shortened, masked or starred out anywhere in this file.

The two email addresses in §7 are the staging test mailbox with plus-addressing —
`teamtasks.staging.test+alice@gmail.com` and a `+nobody` variant invented here — both already written
down in `docs/environments.md` on purpose, and neither belonging to a real person (rule 6). No
password, token, hash, key, user id or project reference appears anywhere above.

The code in this change is written so a run of it stays that way: no file under `web/src` logs
anything (§2, section 5), the reset code never reaches a template string, a cookie, a redirect or a
page, and the request screen never echoes back the address it was given.
