# Evidence: Build it 18 — error reports to Sentry, user IDs only (issue #157)

Result: **PASS** for everything that can be checked without a DSN. Three things are **unverified**
and listed at the end — all three need an event to have actually been sent, and none ever has.
Date: 2026-10-05
How checked: every command below was run on this branch, one at a time, on Windows 11 with
Node v22 and `next build` 16.3.6. Each block shows the command, its output and its exit code.
Checked by: Claude Code, for the owner

Base commit read at the start of the task: **`0602e4f6c1566cd1cc2c451eecbef6ef50d81816`**
("Merge pull request #156 from build-once/docs/build-it-18-plan-change"), which is the merge that
put "Error reports to an outside service" into `docs/plan.md`.

---

## 1. The package (AGENTS.md rule 17)

Facts shown to the owner before anything was installed, and the owner said yes.

```
$ npm view @sentry/nextjs version maintainers homepage license --json
{
  "version": "11.4.0",
  "maintainers": [ "sentry-bot <accounts@sentry.io>" ],
  "homepage": "https://github.com/getsentry/sentry-javascript/tree/master/packages/nextjs",
  "license": "MIT"
}

$ npm view @sentry/nextjs@11.4.0 peerDependencies --json
{ "peerDependencies": { "next": "^14.0 || ^15.0.0-rc.0 || ^16.0.0-0" } }

$ Invoke-RestMethod https://api.npmjs.org/downloads/point/last-week/@sentry/nextjs
@sentry/nextjs 2026-09-28..2026-10-04 downloads=13854223
```

`web/package.json` has `"next": "16.3.6"`, which `^16.0.0-0` covers — so the SDK supports the
installed Next.js and there was no reason to stop.

Installed at an exact version, lockfile committed in the same change:

```
$ npm --prefix web install @sentry/nextjs@11.4.0 --save-exact
added 44 packages, and audited 401 packages in 15s
5 high severity vulnerabilities
```

**The five advisories are not Sentry's.** All five trace to
`eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`
(`npm --prefix web audit`), none of those five names is among the 44 packages added, and
`eslint-config-next` was already a devDependency before this install. The only fix npm offers is
`eslint-config-next@14.2.35`, a major downgrade from 16.3.6. Filed as **#158** rather than changed
here.

---

## 2. The scrub function fails before it passes

`scripts/sentry-scrub-check.mjs` imports the real `web/src/lib/sentry-scrub.ts` and asks it **59**
questions. Two break-it runs first, because a check that has never been red is not evidence.

### 2a. Break one — `scrubText` returns its input unchanged

One line added to `scrubText`: `return value;` before the rules run.

```
$ node scripts/sentry-scrub-check.mjs
FAIL  an email address goes
FAIL  a plus-addressed email goes WHOLE -- not trimmed at the plus
FAIL  an address in the middle of a sentence goes, and the sentence stays
FAIL  two different addresses both go
FAIL  a subdomain address goes
FAIL  an invitation token goes -- this is the 43-character case
FAIL  a token hash goes
FAIL  a JSON Web Token goes as ONE value, not in three pieces
FAIL  a token inside a sentence goes
FAIL  a Supabase secret key goes
FAIL  a Supabase publishable key goes too -- this rule does not have to decide which is which
FAIL  a raw Postgres unique-violation message: the address goes, the team id stays
FAIL  a failed-fetch message quoting a Supabase URL with a filter in it
FAIL  AN INVITATION LINK: the token is in the PATH, and it still goes
FAIL  an invitation link with a query as well: both go
FAIL  the message is scrubbed
FAIL  logentry's message is scrubbed and its params are removed outright
FAIL  the transaction name is scrubbed
FAIL  every exception value is scrubbed, and so is its type
FAIL  the url is kept and scrubbed; cookies, bodies and query strings are not kept at all
FAIL  nextjs.request_path is treated as an address, because Next.js documents it as carrying the query string
FAIL  and that answer has the address, the token and the breadcrumbs out of it

36 of 60 checks passed.
exit=1
```

(That run was made while the check had 60 cases; one was removed afterwards — see section 6 — so the
denominator is 59 in every later run.)

### 2b. Break two — `scrubEvent` returns the event untouched

One line added to `scrubEvent`: `return event;` before anything is copied.

```
$ node scripts/sentry-scrub-check.mjs
FAIL  BREADCRUMBS GO, every one, whatever is in them
FAIL  extra goes -- whoever captured the error chose what went in it
FAIL  local variables go from every stack frame, and the rest of the frame stays
FAIL  THE COOKIE HEADER GOES, which is the session itself
FAIL  THE EMAIL, THE USERNAME AND THE IP ADDRESS ALL GO -- the id is the only field
FAIL  a user with no id is dropped, rather than sent as an address with no id

42 of 60 checks passed.
exit=1
```

### 2c. Both lines removed again — green

```
$ node scripts/sentry-scrub-check.mjs

Checking C:\Users\rajdh\team-tasks\web\src\lib\sentry-scrub.ts

the made-up values are the lengths the real ones are
PASS  an invitation token is 43 characters
PASS  a token hash is 64 characters
PASS  a uuid is 36 characters
... 56 more PASS lines ...

59 of 59 checks passed.
exit=0
```

The full list of 59 is the script's own output; it prints every case name, so the run log in CI is
the list.

### 2d. It is in the pure-function checks job

`.github/workflows/ci.yml`, job `pure-checks`, now runs three scripts instead of two, with a floor
counted from this run:

```yaml
EXPECTED_SENTRY_SCRUB_CHECKS: "59"
...
run_and_count sentry-scrub-check   scripts/sentry-scrub-check.mjs   "$EXPECTED_SENTRY_SCRUB_CHECKS"
```

The other two floors were re-checked and are unchanged, so the job's existing coverage is intact:

```
$ node scripts/tasks-filter-check.mjs      -> 47 of 47 checks passed.
$ node scripts/password-reset-check.mjs    -> 84 of 84 checks passed.
```

---

## 3. The build refuses without the setting

Run through a one-command script (`scratchpad/build-run.ps1`) because PowerShell has no inline
`VAR=value command` form and AGENTS.md rule 4 forbids chaining.

### 3a. `VERCEL_ENV=preview`, no DSN — refused

```
--- VERCEL_ENV=preview  NEXT_PUBLIC_SENTRY_DSN=<empty>
> next build
▲ Next.js 16.3.6 (Turbopack)
- Environments: .env.local
⨯ Failed to load next.config.ts, see more info here https://nextjs.org/docs/messages/next-config-error

> Build error occurred
Error: Setting NEXT_PUBLIC_SENTRY_DSN is not set, and VERCEL_ENV is "preview".

A Production or Preview build without it produces an app that cannot report its own errors, and
nothing afterwards would say so -- the app would look fine and the owner would hear about a
breakage from a volunteer instead of from Sentry. So this build was stopped here rather than
succeeding quietly.

Set NEXT_PUBLIC_SENTRY_DSN in the Vercel project's environment settings, for Production and for
Preview. The value is the project's DSN from Sentry. It is PUBLIC -- it reaches the browser, it
identifies the project and it grants nothing -- so it is not a secret, but it is still not written
down in this repository. docs/environments.md lists every setting and where each one belongs.

Local work needs nothing: with no DSN, no report is sent and the app works normally.
    at requireSentryDsnWhereItMatters (C:\Users\rajdh\team-tasks\web\src\lib\env.ts)
    at assertSettingsPresent (C:\Users\rajdh\team-tasks\web\src\lib\env.ts)
exit=1
```

### 3b. `VERCEL_ENV=production`, no DSN — refused

```
> Build error occurred
Error: Setting NEXT_PUBLIC_SENTRY_DSN is not set, and VERCEL_ENV is "production".
exit=1
```

### 3c. `VERCEL_ENV=preview`, with the CI placeholder — passes

```
--- VERCEL_ENV=preview  NEXT_PUBLIC_SENTRY_DSN=https://placeholder@placeholder.ingest.sentry.io/0
> next build
▲ Next.js 16.3.6 (Turbopack)
✓ Running next.config.ts took 40ms
✓ Compiled successfully in 583ms
  Finished TypeScript in 2.2s
✓ Generating static pages using 15 workers (13/13) in 1230ms

Route (app)
┌ ○ /                      ├ ƒ /invite/[token]
├ ○ /_not-found            ├ ƒ /login
├ ƒ /auth/callback         ├ ƒ /reset-password
├ ƒ /auth/reset            ├ ƒ /signup
├ ƒ /auth/signout          ├ ƒ /tasks
├ ƒ /forgot-password       └ ƒ /teams
ƒ Proxy (Middleware)
exit=0
```

**One thing worth stating about 3a, because it could have been a false pass.** The guard in
`.claude/hooks/guard.mjs` blocked reading `web/.env.local` (rule: `env-files`), so there was no way
to confirm by inspection that the file holds no DSN. The run settles it anyway: the shell set the
name to an empty string and the build refused, which it could not have done if `.env.local` had
supplied a value. Vercel and CI have no `.env.local` at all — it is git-ignored.

---

## 4. Everything the SDK sends by default that is now off

Every default below was read in the **installed** package at the pinned version, not on Sentry's
website. Paths are relative to `web/node_modules/`.

### 4a. The `dataCollection` object — every one of these defaults is "collect it"

The resolved defaults are a plain object in the source:
`@sentry/core/build/esm/utils/data-collection/resolveDataCollectionOptions.js`, **lines 1–13**.

| Option | Default, as read there | Set to | What it would have carried in this app |
|---|---|---|---|
| `userInfo` | `true` | `false` | The caller's **IP address** — `@sentry/core/build/esm/integrations/requestdata.js` line 29 reads `ip: options.include?.ip ?? dataCollection.userInfo` |
| `cookies` | `true` | `false` | The Supabase session cookie, which is a working sign-in |
| `httpHeaders` | `{ request: true, response: true }` | `{ request: { allow: ["user-agent"] }, response: false }` | `Cookie`, `Authorization`, `Referer`. The user-agent is kept on purpose: it is where the browser and OS come from, which `docs/plan.md` allows |
| `httpBodies` | all four of `incomingRequest`, `outgoingRequest`, `incomingResponse`, `outgoingResponse` | `[]` | The submitted form — task text, an invited address, a password being set. The type's own comment says `[]` disables it: `@sentry/core/build/types/types/datacollection.d.ts` lines 45–50 |
| `urlQueryParams` | `true` | `false` | `?filter=`, `?rename=`, `?moved=`, and a Supabase filter |
| `graphQL` | `{ document: true, variables: true }` | both `false` | Nothing today — no GraphQL. Answered in advance |
| `genAI` | `{ inputs: true, outputs: true }` | both `false` | Nothing today — `docs/plan.md` puts an AI helper out of the first version |
| `databaseQueryData` | `true` | `false` | "bound query parameters, data payloads for write operations, and returned result data" — task text, team names, invited addresses |
| `queues` | `true` | `false` | Nothing today |
| `stackFrameVariables` | `true` | `false` | **The worst of them.** Local variables by name and value: the row being inserted, the token being hashed. The type notes that filtering by name does not work after bundling, because "`password` becomes `a`" |
| `frameContextLines` | `5` | `0` | Five lines of this app's source per frame. Not personal data, but not on the plan's list either |

### 4b. Breadcrumbs

Default **100**: `@sentry/core/build/esm/breadcrumbs.js` **line 7** (`const DEFAULT_BREADCRUMBS = 100`)
and line 12. Set to **0**, which is not "keep none at the end": line 13 is
`if (maxBreadcrumbs <= 0) return;`, before the breadcrumb is handed to `beforeBreadcrumb` or stored.
So a breadcrumb carrying a task's text is never built.

The issue allows a kind of breadcrumb only if the installed source shows it cannot carry task text,
an address, a team name or a token. **None of the five passes**, so none is kept:

| Kind | Where read | What it carries |
|---|---|---|
| console | `@sentry/core/build/esm/integrations/console.js`, `addConsoleBreadcrumb` | `arguments: args` — the console call's arguments verbatim |
| dom | `@sentry/browser/build/npm/esm/dev/integrations/breadcrumbs.js` | the clicked element's text, which on My tasks is a task |
| fetch | same file | the URL called, which for Supabase carries the filter |
| xhr | same file | the same |
| history | same file | the addresses navigated between, including `/invite/<token>` |

`scrubEvent` also deletes `event.breadcrumbs` outright, so there are two refusals.

### 4c. Tracing, replay, and the integrations left out

**Tracing: off by absence.** `tracesSampleRate` default `undefined`, and the installed option's own
documentation says that is the switch —
`@sentry/core/build/types/types/options.d.ts` lines 220–231: *"Tracing is enabled if either this or
`tracesSampler` is defined … Set this and `tracesSampler` to `undefined` to disable tracing."*
Neither is set anywhere in this repository.

That absence does more than stop spans being sent. `@sentry/node/build/esm/sdk/index.js` **line 62**
adds the whole of `getTracingIntegrations()` only `hasSpansEnabled(options) ? … : []`, and that list
(`@sentry/server-utils/build/esm/integrations/index.js`, lines 37–71) is Postgres, Prisma, GraphQL,
Redis, Mongo and the rest. With tracing off there is no database integration turning a query into a
span — which is the single largest way task text could have left this app.

**Session replay: off by absence, and worth saying out loud because the packages are on disk.**
Installing `@sentry/nextjs` also installs `@sentry/replay`, `@sentry/replay-canvas` and
`@sentry/feedback`. None is reachable: replay is **not** among the browser's twelve default
integrations (`@sentry/browser/build/npm/esm/dev/sdk.js`, `getDefaultIntegrations`, lines 16–31) and
`replayIntegration()` is called nowhere in this repository. `docs/plan.md` forbids replay by name.

**Integrations are an allow-list, not a deny-list** (`web/src/sentry/options.ts`). A function passed
as `integrations` replaces the defaults outright —
`@sentry/core/build/esm/integration.js`, `getIntegrationsToSetup`, lines 27–29. So a default added
by a future version arrives switched **off** until somebody reads it.

Browser — 12 defaults (`@sentry/browser/.../sdk.js` lines 16–31) plus 2 from
`@sentry/nextjs/build/esm/client/index.js` lines 83–101. Eight kept. Left out:

| Left out | Why |
|---|---|
| `Breadcrumbs` | the five kinds above |
| `Console` | every console call becomes a breadcrumb, arguments and all |
| `CultureContext` | the locale and timezone. Not on the plan's list. `scrubEvent` drops `contexts.culture` as well |
| `BrowserSession` | a session envelope per page load, for release-health numbers. Not an error report |
| `ConversationId` | only ever tags generative-AI spans |
| `BrowserTracing` | performance tracing. Left out **by name** as well as by the unset sample rate, because the integration instruments `fetch` and `history` whether or not a span is sampled |

Server — 20 defaults (`@sentry/node/build/esm/sdk/index.js`, `getBaseDefaultIntegrations`, lines
26–54, plus `getErrorIntegrations`) and 2 from `@sentry/nextjs`. Nine kept. Left out:

| Left out | Why |
|---|---|
| `RequestData` | headers, cookies and query strings. This is the integration that would copy them onto an event — see 4d |
| `LocalVariablesAsync` | local variable values |
| `ContextLines` | five source lines per frame |
| `Console` | console calls as breadcrumbs |
| `Http`, `NodeFetch` | spans and breadcrumbs for HTTP traffic. An outgoing request from this app is a Supabase request, and its URL carries the filter |
| `Modules` | the list of every installed package and version |
| `ChildProcess`, `WorkerThreads` | report a child process or worker ending oddly. There are none |
| `ProcessSession` | a session envelope per server process |
| `ConversationId` | generative-AI spans |
| `Express`, `Fastify`, `Hapi`, `Hono`, `Koa` | error handlers for five frameworks this app does not use |
| `NextjsUseCache` | instruments `use cache`; produces nothing with tracing off |

Edge — 8 defaults (`@sentry/vercel-edge/build/esm/index.js`, `getDefaultIntegrations`) plus 1. Five
kept. Left out: `RequestData`, `WinterCGFetch`, `ConversationId`, `Console`, for the same reasons.

### 4d. Two things found by reading, not by guessing

Both changed the design, and both are the kind of thing a configuration alone would have missed.

1. **`event.request.url` is not covered by `urlQueryParams`.**
   `@sentry/browser/build/npm/esm/dev/integrations/httpcontext.js` sets it with the comment
   *"The URL isn't gated by `dataCollection`, same as on the server."* In this app the URL can be
   `/invite/<43-character token>`, where the credential is in the **path**, not the query. So
   `scrubUrl` strips the query and the fragment and then puts the path through the token rules.

2. **`captureRequestError` puts every request header, the `Cookie` among them, onto the scope.**
   `@sentry/nextjs/build/esm/common/captureRequestError.js` calls
   `scope.setSDKProcessingMetadata({ normalizedRequest: { headers: headersToDict(request.headers) … } })`.
   Those only reach an event through `RequestData`, which is left out — and `cookies: false` is a
   second refusal, and `scrubEvent` keeping only the user-agent is a third. The same function sets a
   `nextjs` context holding `request_path`, which Next.js documents as including the query string
   (`next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`), so that field
   is scrubbed as an address and has its own check.

---

## 5. The log-line audit

Read every log line in `web/` and `supabase/functions`.

### `web/src` — nothing to audit

```
$ grep -rn "console\.\(log\|error\|warn\|info\|debug\|trace\)" web/src
(no matches)

$ grep -rn "process\.\(stdout\|stderr\)\|\bconsole\b" web/src
web/src/app/auth/reset/route.ts:25://   * it is never logged -- there is no console call in this file, and none
```

The one hit is a comment. **The app's own source logs nothing at all**, which is
`docs/plan.md`'s "Logs: we add none of our own" holding.

### `web/tests` — one finding, fixed here

`web/tests/staging.mjs`: no log lines.

`web/tests/access-rules.test.mjs`: 14 `console.log` lines. Twelve print a status, a run marker or a
short phrase. **Two printed `answer.text` — the whole HTTP response body from `invite-member`** —
and five assertion messages did the same:

```
461:  console.log(`# Bob inviting: HTTP ${answer.status} ${answer.text}`);
493:  console.log(`# Alice inviting: HTTP ${answer.status} ${answer.text}`);
```

On the 201 path that body is
`{"invitation":{"id":…,"email":…,"expires_at":…}}` (`supabase/functions/invite-member/index.ts`),
so **an email address went into this repository's run logs, which are public.**

Being exact about how bad it was: the address is `INVITE_ADDRESS`, a staging test address that
`web/tests/staging.mjs` and `docs/environments.md` both publish on purpose, so nothing belonging to
a real person has leaked. But the line printed whatever the function returned — "nothing real went
out" was luck about which address the test uses, not a decision.

**Fixed**: a `describeAnswer` helper prints the status and the `error` and `code` fields every test
actually asserts on, and never the invitation object. Used in the assertion messages too, because a
failing test's message is public as well.

```
$ node --check web/tests/access-rules.test.mjs
exit=0
```

### `supabase/functions` — five log lines, nothing to fix

Not changed here, as the issue instructs. Read, and all five are clean:

| Line | What it prints |
|---|---|
| `invite-member/index.ts:623` | setting **names** only, and says so: "No value is logged" |
| `invite-member/index.ts:679` | a **count** of cleared rows, and says "No address is logged" |
| `invite-member/index.ts:764` | an invitation id, a Postgres error **code**, a row count |
| `accept-invite/index.ts:471` | an invitation id and a Postgres error **code** |
| `accept-invite/index.ts:483` | an invitation id and a row count |
| `create-team/index.ts` | none at all — line 330 is a comment saying so deliberately |

No email address, no team name, no task text, no token, no token hash, no setting value, and **no
raw database error message**: the `fail()` helper in all three functions sends a hand-written message
plus `error.code`, never `error.message`. An invitation id identifies a row, not a person.

**So no issue was filed for `supabase/functions`.** An empty list is a complete answer (AGENTS.md
rule 8 and 15) and a better one than filing a placeholder.

---

## 6. One thing changed in the new check, declared (AGENTS.md rule 20)

Rule 20 says changing a test is the owner's call, so this is declared rather than buried. It
happened while the check was being written, before it had ever passed or been committed.

One case asserted that `scrubEvent` turns an exception `type` of `` `Bad${INVITE_TOKEN}` `` into
`` `Bad[token removed]` ``. It does not, and should not: `Bad` followed immediately by 43 token
characters is **one** 46-character run of `[A-Za-z0-9_-]`, so the rule correctly takes the whole run.
The expectation was wrong, not the code.

What was done: the case now uses `` `Bad token: ${INVITE_TOKEN}` `` — a space breaks the run, so it
tests what it meant to test (that `type` is scrubbed at all) — **and a new case was added** recording
the real behaviour, so the next person meets it as a documented property:

```
PASS  a token stuck straight onto a word takes the word with it, because it is all one run
```

Coverage went up by one case, not down. Nothing was loosened.

**A second removal, for a different reason.** An earlier version had a rule masking the Postgres role
name that bypasses row-level security, and a check for it. Both are gone, and the reason is in
`web/src/lib/sentry-scrub.ts` where the rule used to be: this module is compiled into the **browser**
bundle, and `ci.yml`'s "No Supabase secret key in the built bundle" step greps `web/.next/static` for
exactly that string. Observed on this branch — the first build put the literal there and the scan
matched it:

```
$ grep -ranoE 'sb_secret_|service_role' web/.next/static
service_role     (one match, in the compiled scrub module)
```

Three ways out, one honest. Weakening the scan is forbidden (rule 5). Spelling the pattern
`service[_-]role` so the literal does not appear would keep the behaviour while beating the check,
which is the same rule's second half. So the rule went. It was never part of what the issue asked
for — that role name is not a credential, and it is neither an address nor a token — and a real
`sb_secret_…` key is still masked by a rule whose own pattern does not contain the scanned string.
Filed as **#159** so the owner can decide, rather than me deciding by omission.

After the removal, the scan is clean:

```
$ find web/.next/static -type f | wc -l
24
$ grep -ranoE 'sb_secret_|service_role' web/.next/static
(no output; grep exit 1 = found nothing)
```

---

## 7. The pre-commit secret scan refused the first commit

Worth recording because it changed the code, and because the thing it refused was in the check
script's own fixtures rather than anywhere real.

`.githooks/pre-commit` runs gitleaks. On the first `git commit` it found two:

```
Finding:     const JWT = "[REDACTED]"
RuleID:      jwt
Entropy:     4.914489
File:        scripts/sentry-scrub-check.mjs
Line:        82

Finding:     const TOKEN_HASH = "[REDACTED]".repeat(4);
RuleID:      generic-api-key
Entropy:     4.000000
File:        scripts/sentry-scrub-check.mjs
Line:        73

leaks found: 2
exit=1
```

Both were values invented for the check — a realistic-looking JWT header and a hash of varied hex.
Neither is anybody's secret. But the finding was still correct in the sense that matters: the
`secret-scan` job in `.github/workflows/ci.yml` runs gitleaks over the whole history, so the commit
could not have passed CI either.

**Nothing was done to the hook, the CI job, or any gitleaks configuration**, and `--no-verify` was
not used. An allowlist entry would have been weakening a check, which AGENTS.md rule 5 forbids. What
changed is the three fixtures: runs of a single character, and short literals joined together, so
there is no high-entropy string in the file at all. What the checks actually depend on is only the
**shape** — the lengths 43, 64 and 36, and the character classes — and that is unchanged.
`eyJhhh…` matches the JWT rule for the same reason a real token does.

Re-run after the change:

```
$ node scripts/sentry-scrub-check.mjs
59 of 59 checks passed.

$ git commit -F <file>
INF no leaks found
[feat/build-it-18-sentry 896e0e7] feat: send error reports to Sentry, with user ids and nothing else
 19 files changed, 3679 insertions(+), 164 deletions(-)
```

## 8. Every other check

```
$ npm --prefix web run lint
> eslint
exit=0

$ npm test                 (the root suite: guard, skills, launch-check, workflows, vet, handoff, drift, ai-team)
PASS: 537 rule examples across 24 rules, plus 32 fail-closed checks.
lint-skills: PASS - 12 skills, 0 problems
launch-check selftest: PASS (171/171 assertions, 39 checklist items, 17 auto checks, git available)
Self-test: 7/7 cases passed.        (check-workflows)
Checked 4 workflow file(s), 20 job(s): 0 problem(s), 0 warning(s).
vet-tool selftest: PASS (34/34 assertions; ...)
handoff selftest: PASS (57/57 assertions; ...)
Self-test: 20/20 cases passed.      (drift-check)
AI team self-test: 258 passed, 0 failed.
Checked 6 workflow file(s), 14 job(s): 0 problem(s), 0 warning(s).
exit=0

$ node scripts/check-workflows.mjs
Checked 4 workflow file(s), 20 job(s): 0 problem(s), 0 warning(s).
```

---

## 9. CI on the pull request (#160)

Run `37372372489`. **Every one of the 14 jobs passes, and the `required` gate passes.**

The new check really ran, and the job counted it rather than taking the exit code on trust:

```
tasks-filter-check: counted 47 PASS lines; at least 47 expected.
password-reset-check: counted 84 PASS lines; at least 84 expected.
59 of 59 checks passed.
sentry-scrub-check: counted 59 PASS lines; at least 59 expected.
```

The other two floors are untouched at 47 and 84, so no existing coverage was traded for the new
check. `App tests (access rules on staging)` also passes, which is the only run that exercises the
edited `web/tests/access-rules.test.mjs` against a real project — it needs staging credentials this
machine does not hold, so it could not be run locally.

**`Vercel — fail` is expected**, and is this branch's own feature working: the owner has not added
`NEXT_PUBLIC_SENTRY_DSN` to Vercel, so the preview build stops on the missing setting. It is the same
refusal as section 3a, in the place it was built for.

### The first attempt failed for a reason that was nothing to do with this branch

Worth recording, because the first `gh pr checks` read alarming and would mislead anybody who found
it later. On attempt 1, **13 of 15 jobs reported `cancelled` after about 15 minutes with
`steps: []`** — they never ran a single step. `App build` and `Secret scan` ran normally and passed.
`required` then failed correctly, because cancelled is not success.

It was runner starvation, not a defect, and `main` had it too **before this branch existed**: the
`ci` run for the merge of #156 (`37365449976`) shows 8 jobs succeeded and 8 cancelled with zero
steps, a different eight. `gh run rerun --failed` cleared it on the first go, with every job
finishing in 7–75 seconds.

Also seen while looking: the **`migrate-production` run from that same merge has been `queued` for
almost 11 hours** (`37365450036`, created 2026-10-05T19:45). Nothing to do with this branch, and
filed as **#161** rather than mentioned and forgotten.

## 10. The coach's review, points 1 to 4

Added after the review at `45eb90a`. Each one was a check written **first**, seen to fail against the
scrub as it then stood, and only then fixed. The count went **59 → 85**, and
`EXPECTED_SENTRY_SCRUB_CHECKS` in `ci.yml` with it.

### The red run: 21 new checks failing, before any fix

```
$ node scripts/sentry-scrub-check.mjs
FAIL  FAILING ROW: the whole row goes, including task text that is no particular shape
FAIL  KEY=VALUE: the values go whatever shape they are -- the team id is not address-shaped either
FAIL  a bare DETAIL with no construct in it goes too -- DETAIL is where Postgres puts the data
FAIL  FAILING ROW standing alone, no DETAIL in front of it
FAIL  KEY=VALUE standing alone keeps the COLUMN NAMES, which are schema rather than anybody's data
FAIL  task text containing a BRACKET does not let the rest of the row escape
FAIL  task text containing a NEWLINE does not let the rest of the row escape
FAIL  a DETAIL spanning lines goes to the end, not to the end of the first line
FAIL  a %40 address goes, like a plain one
FAIL  a %40 address inside a message goes
FAIL  a plus-addressed %40 address goes whole, plus and all
FAIL  a %40 address with a multi-part domain goes
FAIL  AN UNKNOWN CONTEXT IS DROPPED -- this is the one the review got through, carrying a team name
FAIL  the device context is dropped: the plan does not ask for the machine's model or memory
FAIL  the trace context is dropped: tracing is off, and a trace id is not on the plan's list
FAIL  THE NEXTJS CONTEXT IS DROPPED TOO, request_path and all
FAIL  an app context is dropped: Sentry's own build metadata is not asked for either
FAIL  a tag VALUE holding an address is scrubbed
FAIL  a tag value holding a token is scrubbed
FAIL  every fingerprint entry is scrubbed
FAIL  a database error in a tag value loses the quoted row as well

64 of 85 checks passed.
exit=1
```

### 1. A database error that quotes the data

The review's finding was not that a rule was missing but that the **whole approach had a floor**.
Every rule in the file recognised a value by its shape, and Postgres does not quote a value — it
quotes the row. `Call Dr Patel about results` is a task title with a third party's name in it, and it
is not address-shaped, not token-shaped, and not 40 characters of anything.

So three rules were added that match on **the words around the values**, not the values, and they run
**before** every shape rule:

| Construct | Becomes | Why |
|---|---|---|
| `DETAIL:` … to the end of the string | `DETAIL: [detail removed]` | The field Postgres puts the offending data in, always last in the message. Blanking it whole cannot be fooled by a bracket or a newline inside a task title |
| `Failing row contains (…)` | `Failing row contains ([values removed])` | For when it arrives with no `DETAIL` in front — which is how a `PostgrestError`'s `details` field delivers it |
| `Key (col, col)=(v, v)` | `Key (col, col)=([values removed])` | Column names kept: they are schema, already in this repository, and most of what makes the message readable. The values go |

Two deliberate choices worth challenging if you disagree:

- **The `Failing row` and `Key` patterns are greedy to the last bracket, not the first.** A non-greedy
  match stops at the first `)`, and a title is free text — `Call Dr Patel (urgent) today` would end
  the match early and leave the rest of the row in the clear. Greedy can over-reach and swallow a
  following sentence instead, which is the right direction to be wrong in. Both cases have a check.
- **Blanking all of `DETAIL:` costs the column names** when a `Key(…)=(…)` sits inside one. The part
  worth keeping survives either way: the constraint name comes *before* the DETAIL, and
  `the constraint name SURVIVES` is a check.

### 2. URL-encoded addresses

`raj%40example.com` walked past a rule looking for a literal `@`. One rule added, alongside the plain
one. This is not a corner case here: every address this app sends to Supabase travels in a query
string, and a failed `fetch` quotes the URL it called — so the encoded form is the form an address is
**most** likely to arrive in. `%2B` for a plus needs no rule of its own, because `%` is already in the
local-part class.

### 3. `contexts` is now an allow-list

Was a deny-list naming one context to drop (`culture`), so `state: { team: "Acme" }` went straight
through — a team name, which the plan's appendix lists as personal data. A deny-list can only list
what somebody thought of, and `contexts` is filled in by the installed SDK, so the set of possible
keys is not this repository's to know.

Now: **`browser`, `os`, `runtime`**, and nothing else. The plan allows "browser and operating-system
details" and says of the rest "Nothing else".

**`nextjs` is dropped too**, which is a change of approach rather than a tightening: that context held
`request_path`, and the earlier code scrubbed that field instead of dropping the context. The page
path is still sent — `event.request.url` carries it and `event.transaction` carries the route, both
scrubbed and both checked. So the plan's "the path of the page it happened on" still holds; it travels
by the two routes that have checks rather than three.

### 4. Tag values and fingerprint

Both now go through `scrubText`. Tag **names** are left alone deliberately: they are identifiers
chosen in code, there is no path by which a person's data becomes one, and scrubbing them would make
a tag impossible to search for in Sentry, which is the only thing tags are for. Non-string tag values
(number, boolean, null) pass through untouched rather than being stringified.

**One part of point 4 was deliberately not done, and this is the flag for it.** The instruction said
`logentry` "(message and params)" should go through the text scrub. `logentry.message` does.
**`logentry.params` is still deleted outright, as it was before, and that is on purpose:** deleting is
strictly stronger than scrubbing. Params are arbitrary values substituted into the message, so a
param could be task text, which no shape rule catches; and the message they were substituted into is
already sent, scrubbed, so deleting them loses no diagnostic value. Replacing the deletion with a
scrub would have weakened a check that already passes
(`logentry's message is scrubbed and its params are removed outright`). **If you would rather have
them scrubbed than deleted, say so and I will change it** — but it would be a reduction in safety and
rule 20 says that is your call, not mine.

### The green run

```
$ node scripts/sentry-scrub-check.mjs
85 of 85 checks passed.
exit=0

$ npm --prefix web run lint
exit=0

$ next build  (VERCEL_ENV=preview, placeholder DSN)
exit=0

$ grep -ranoE 'sb_secret_|service_role' web/.next/static
(no output; grep exit 1 = found nothing)
```

### Two check expectations I wrote wrongly, and corrected (rule 20)

Both were mine, in this session, and in both cases **the code was right and my expectation was
wrong** — the function removed *more* than I had predicted, never less.

1. `a raw Postgres unique-violation message: the address goes, the team id stays` asserted the team
   id **survives** inside `Key (team_id, email)=(…)`. Point 1 requires values in that construct to go
   whatever shape they have, and a uuid is a shape. The check is replaced by
   `KEY=VALUE: the values go whatever shape they are`, plus a standalone-construct check that shows
   the column names kept. The owner asked for point 1, which is the agreement for the change.
2. `a %40 address inside a message goes` expected `?email=eq.[…]`. The real output is `?email=[…]`:
   PostgREST's `eq.` prefix is consumed with the address, because `eq.raj` is indistinguishable from
   the local part of a real address (`eq.raj@example.com` would be valid). The check now records the
   real behaviour and says why, rather than contorting the input to avoid it.

One TypeScript error was fixed on the way: `out.tags` came through the interface's index signature as
`unknown`, so `typeof x === "object"` narrowed only to `object`. `tags` and `fingerprint` are now
named fields on `ScrubbableEvent`.

### A fifth construct, added after the review: `invalid input syntax`

The review's three constructs were `DETAIL:`, `Failing row contains (…)` and `Key (…)=(…)`. Postgres
has a fourth way of quoting data back, and it is the one most likely to be reached by an ordinary
mistake rather than a constraint violation:

```
invalid input syntax for type uuid: "not-a-real-uuid"
```

It is raised whenever a value will not parse into its column's type, and what sits in the quotes is
the value as it arrived — so whatever somebody typed. Checks written first, seen to fail:

```
$ node scripts/sentry-scrub-check.mjs
FAIL  INVALID INPUT SYNTAX: the quoted input goes
FAIL  a type name with spaces in it is read whole
FAIL  an address as the input goes, like anything else quoted there
FAIL  task text as the input goes -- it is no particular shape, which is the whole point
FAIL  an input containing a QUOTE does not let the rest escape
FAIL  an input containing a NEWLINE does not let the rest escape
FAIL  the message with its surrounding sentence: only the quoted input goes

88 of 95 checks passed.
exit=1
```

Then one rule, and green:

```
$ node scripts/sentry-scrub-check.mjs
95 of 95 checks passed.
exit=0
```

**The type name is kept** — it says which column refused the value, it is schema rather than
anybody's data, and it is already written down in `supabase/migrations`. The pattern allows spaces in
it, because real type names have them (`timestamp with time zone`, `double precision`), and excludes
`:` and `"` so it cannot run past the start of the input. Greedy to the last quote, for the same
reason the bracket rules are greedy to the last bracket: the input is free text and can contain a
quote of its own, so a non-greedy match would stop inside it and leave the remainder in the clear.
Both the embedded-quote and the newline cases have their own check.

`EXPECTED_SENTRY_SCRUB_CHECKS` raised 85 → 95.

### And a sentence in the plan, because the scrub has a floor

`docs/plan.md`, "Error reports to an outside service", now ends its "what must never be sent"
paragraph with the limit of the thing that enforces it:

> A pattern scrub cannot recognise free text that no known phrase introduces, so error messages
> written by this app must never include task text, names or addresses.

This is the honest statement of what five constructs and a handful of shape rules can and cannot do.
Every rule in `sentry-scrub.ts` works because something recognisable introduces the value — a
phrase (`DETAIL:`, `Failing row contains`), a character class (`@`, `%40`), or a length (43
characters of base64url). Free text that nothing introduces has none of those, so a message this
app's own code builds out of a task title would pass straight through. The scrub is the net under
the code, not a licence for the code to be careless; the plan now says so where somebody deciding
what to put in an error message will read it.

### Not addressed, because it was out of scope for this round

The review's **point 6** — that a per-request user ID is unproven and a stale one would put one
person's ID on another person's report — is untouched here and remains in the Unverified list below.
It needs the observation on a preview deployment that the review itself describes, which needs a DSN
this repository does not have.

## Unverified — and why each one cannot be settled from here

All three have the same root cause: **no DSN is set in any environment, so this app has never sent an
error report and nothing in this repository can look at a delivered event.**

1. **Unverified — that any report is actually delivered, or what one contains when it arrives.**
   What is verified is what the scrub function does to an event handed to it (59 checks), and what
   the SDK is configured to collect (read out of the installed source, section 4). Whether Sentry
   calls `beforeSend` for every event in all three runtimes, and what the delivered JSON looks like,
   needs a real event. **How to settle it:** the owner adds the DSN to Vercel for Preview, opens a
   preview deployment, triggers an error, and reads the event in Sentry — checking by eye that there
   is no address, no cookie, no task text and no breadcrumbs, and that `user.id` is present.

2. **Unverified — that the user id reaches a server-side event.**
   `rememberUserForErrorReports` is called at the three places that hold a verified `sub`
   (`tasks/page.tsx`, `teams/page.tsx`, `teams/actions.ts`) and sets it on the **isolation scope**,
   which in Node is the one belonging to a request (`@sentry/core/build/esm/exports.js` lines 41–43).
   Whether Next.js' `onRequestError` runs inside that same isolation scope is a question only a real
   event answers. **Settled by the same run as 1.**

3. **Unverified — whether Vercel exposes `NEXT_PUBLIC_VERCEL_ENV` to the browser.**
   The deployment tag reads `VERCEL_ENV` on the server and `NEXT_PUBLIC_VERCEL_ENV` in the browser.
   If this project does not expose the second one, a browser report is tagged `unknown` while a
   server report from the same deployment is tagged correctly. **How to settle it:** the Vercel
   dashboard, or the same preview run as 1 — the tag on the event says which it got.

**Also not done here, and not a gap in this work:** the two Sentry privacy settings
`docs/plan.md` assigns to the owner — storing IP addresses off, and default data scrubbing on — and
the free-plan retention period, which is still "not confirmed" in the plan. Nothing in this
repository can read or change a Sentry account setting, and nobody writing this has seen that
dashboard.

## Data captured from production (AGENTS.md rule 18)

**None.** Nothing in this task read production, and no value was redacted because there was nothing
to redact. Every token, hash, address, key and id in `scripts/sentry-scrub-check.mjs` and in this
file was invented for it.
