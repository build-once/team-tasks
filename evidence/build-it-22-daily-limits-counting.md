# Build it 22 part 2 — the two functions count, and refuse at the limit

Issue [#221](https://github.com/build-once/team-tasks/issues/221). Part 1 was
[#220](https://github.com/build-once/team-tasks/issues/220) / PR #224, which built `usage_counts` and
`public.count_daily_use()` and deliberately left them unused; its evidence is
`evidence/build-it-22-usage-counts.md`. This file is the half that connects them.

**Read this first, because it is what the rest of the file is bounded by.**

> **NOTHING IN THIS CHANGE IS DEPLOYED.** Neither Edge Function with the counting in it is on staging or
> on production. The assistant deploys nothing (rule 19): staging is the owner's step, and production
> follows a merge through `.github/workflows/migrate-production.yml`. **So no number has ever been counted
> in a running app, and nothing is limited in one.**
>
> **No command in this session touched staging or production.** No `supabase` command of any kind was
> run. One command did reach staging and it was not the assistant's choice of target: `npm test` in
> `web/` is `node --test tests/access-rules.test.mjs`, which signs the three test accounts in and
> exercises the **deployed** `invite-member` — the version with no counting in it. It passed 25/25,
> which is the same result it gave before this change, and that is the only staging fact in this file.

Everything below is a local run on the owner's machine, with its exact command, its output and its exit
code.

> **That banner was true of the session that wrote this file, and it stopped being true later the same
> day.** After PR #228 merged, the owner deployed both functions to **staging** and ran the checks there,
> and the coach read the counts back off the table. **Section 12 is that record, copied in from the
> coach's comment on PR #228**, added by the Build it 23 part 0 pull request because a record that lives
> only in a comment thread is not saved (rule 13). The banner above is **not** rewritten: it says what was
> true when the work was done, and section 12 says what happened next. **Read them in that order.**
>
> Nothing in section 12 was run or seen by the assistant, then or now. It is the coach's account of the
> owner's runs and the coach's own connector reads, copied without alteration.

---

## 1. What was built

| File | What it is |
|---|---|
| `supabase/functions/_shared/limits.ts` | **New.** The two numbers (20 and 20), the feature words, the refusal's sentence, its status and its two codes, `countOneUse` and the `withDailyLimit` gate. |
| `supabase/functions/suggest-subtasks/index.ts` | Counts immediately before the request to Anthropic — after the door checks, the consent check, the task read, and the key and model checks. `daily_limit_unknown` added to `SUGGEST_CODES`, making it thirteen. |
| `supabase/functions/invite-member/index.ts` | Counts immediately before each send, **including a retry**: both paths fall through to the one `sendEmail`, so one gate covers both. |
| `supabase/functions/_tests/daily_limit_test.ts` | **New.** 37 tests over the bodies those two functions actually build. |
| `web/src/lib/suggestions.ts` | A fourth state, `limit`, with the plan's sentence; the code read off a failed answer. |
| `web/src/lib/teams.ts` | A ninth outcome, `limit`, told apart by its code the way `account_suspended` is; the same sentence. |
| `web/src/app/tasks/page.tsx` | Reads the `code` off the failed response and draws the limit's own panel. |
| `scripts/staging/build-it-20-ai-checks.mjs` | A new section 7 for today's limit, behind `--ai-limit=<n>`, and 30 new selftest cases. |
| `scripts/screen-state-check.mjs` | A new section 9: one sentence, in three places, character for character. |
| `.github/workflows/ci.yml` | Three expected counts raised, and the Deno job's `--allow-read` widened by one named directory. |

**No migration.** `supabase/migrations/` is untouched by this change; the one it needs was PR #224's.

---

## 2. The numbers are in one file, and neither function spells one

`docs/plan.md`: "Both numbers live in **one config file**: `supabase/functions/_shared/limits.ts`, read
by both `suggest-subtasks` and `invite-member`. Not spelled at a call site and not in two places."

That is an **absence**, so it is checked as one, by a test that reads both handlers' own source and
searches for a limit-shaped number passed as `p_limit`. See section 4c for the run where it was broken on
purpose and went red.

```
> deno check --no-lock --config supabase/functions/create-team/deno.json supabase/functions/suggest-subtasks/index.ts supabase/functions/invite-member/index.ts supabase/functions/_shared/limits.ts
Check supabase/functions/suggest-subtasks/index.ts
Check supabase/functions/invite-member/index.ts
Check supabase/functions/_shared/limits.ts
exit=0
```

---

## 3. The whole Deno folder: 250 passed, 0 failed

213 before this change, 250 after. The 37 new ones are `daily_limit_test.ts`; the one existing test that
changed is in section 6.

```
> deno test --no-lock --allow-env --allow-read=supabase/migrations,supabase/functions --config supabase/functions/create-team/deno.json supabase/functions/_tests
...
ok | 250 passed | 0 failed (903ms)
exit=0
```

And the new file on its own, with every test name, because the names are the specification:

```
> deno test --no-lock --allow-env --allow-read=supabase/migrations,supabase/functions --config supabase/functions/create-team/deno.json supabase/functions/_tests/daily_limit_test.ts
running 37 tests from ./supabase/functions/_tests/daily_limit_test.ts
the two limits are 20 and 20, in one file, and nothing else is in it ... ok
the feature words are the ones the migration's check constraint allows ... ok
neither function spells a limit: both read it from the one file ... ok
countOneUse: true: the count was below the limit and has been increased ... ok
countOneUse: FALSE: the count had already reached the limit, so nothing was written ... ok
countOneUse: AN ERROR WITH A CODE: the check constraint refused an unknown feature ... ok
countOneUse: an error with a code: the foreign key refused a user id with no account ... ok
countOneUse: an error with a code: the execute grant is missing, which is 42501 ... ok
countOneUse: an error with no code at all ... ok
countOneUse: no error, and null -- which the database never sends, so it is an unknown ... ok
countOneUse: no error, and nothing at all ... ok
countOneUse: the STRING "true" rather than the boolean: not a yes ... ok
countOneUse: THE STRING "false", WHICH IS TRUTHY: emphatically not a yes ... ok
countOneUse: the number 1, which a truthy test would read as permission ... ok
countOneUse: the number 0 ... ok
countOneUse: the single character "t", which is how Postgres prints a true to a terminal ... ok
countOneUse: a row rather than a scalar, which is what a function returning a table would give ... ok
countOneUse: the call THREW -- still not a yes ... ok
countOneUse: the call's promise REJECTED -- still not a yes ... ok
countOneUse: a thrown error's message is not kept ... ok
the limit refusal is the plan's sentence, character for character ... ok
the limit sentence says what happened AND when it ends ... ok
daily_limit is NOT a fixed-failure code, and daily_limit_unknown IS ... ok
limits.ts exports no way to give a counted use back ... ok
suggest-subtasks: AT THE LIMIT -- the AI service receives NOTHING and no request is built ... ok
suggest-subtasks: THE COUNT ERRORED -- the AI service receives NOTHING and no request is built ... ok
suggest-subtasks: UNDER THE LIMIT -- the ask runs ONCE and its answer comes back untouched ... ok
suggest-subtasks: a request that could never be made still counted -- the count is asked once, before it ... ok
invite-member: AT THE LIMIT -- the email service receives NOTHING and no email is sent ... ok
invite-member: THE COUNT ERRORED -- the email service receives NOTHING and no email is sent ... ok
invite-member: UNDER THE LIMIT -- the send runs ONCE and its answer comes back untouched ... ok
invite-member: a RETRY goes through the same gate -- at the limit, no second email either ... ok
the limit checks REFUSE a gate that counts and then carries on regardless ... ok
the limit checks REFUSE a gate that counts AFTER the paid call ... ok
the limit checks REFUSE a gate that reads an ERROR as permission ... ok
the limit checks REFUSE a world where the count always says yes ... ok
and the real gate DOES let an ask through under the limit, so refusing everybody is not a fix ... ok

ok | 37 passed | 0 failed (45ms)
exit=0
```

**What the four tests issue #221 asks for are, by name.** Under the limit: the two "UNDER THE LIMIT"
tests. At the limit: the two "AT THE LIMIT" tests, plus "the limit refusal is the plan's sentence". A
counter error: the two "THE COUNT ERRORED" tests, plus seventeen `countOneUse` cases. And **the stubbed
service receiving nothing**: that is the same two "AT THE LIMIT" tests, which assert the spies' log is
**empty** and that `proceed` never ran at all — not that the answer was a refusal.

**Why that last one is possible at all**, and it is the reason the code is shaped as it is: the count sits
behind one exported gate, `withDailyLimit`, whose second argument is *the rest of the handler*. So the
test hands in a `proceed` built from the real pieces of each handler — `buildAnthropicRequest` and
`callAnthropic` with a stubbed fetch for one, `codeFromSendResponse` and `invitationAnswer` with a
stubbed service for the other — and then asserts those were never reached. The same argument
`withConsent` rests on, in `supabase/functions/suggest-subtasks/index.ts`: a test can ask an `if` what it
decided, but not what did not run after it.

---

## 4. Seen to fail first: three breakages, three red runs

A test that cannot fail looks exactly like a test that passes. So the feature was broken on purpose,
three ways, and each run is here with its exit code. **All three breakages were reverted**, and section 3
is the run after.

### 4a. The gate ignores the count

One line added to `withDailyLimit` in `supabase/functions/_shared/limits.ts`:
`if (true as boolean) return await proceed();` before the verdict is read. That is the mistake somebody
would actually make: count, and carry on.

```
> deno test ... supabase/functions/_tests/daily_limit_test.ts
suggest-subtasks: AT THE LIMIT -- the AI service receives NOTHING and no request is built ... FAILED (1ms)
suggest-subtasks: THE COUNT ERRORED -- the AI service receives NOTHING and no request is built ... FAILED (0ms)
invite-member: AT THE LIMIT -- the email service receives NOTHING and no email is sent ... FAILED (1ms)
invite-member: THE COUNT ERRORED -- the email service receives NOTHING and no email is sent ... FAILED (0ms)
invite-member: a RETRY goes through the same gate -- at the limit, no second email either ... FAILED (0ms)

 ERRORS

suggest-subtasks: AT THE LIMIT -- the AI service receives NOTHING and no request is built
error: Error: the rest of the handler ran 1 time(s). What it did: the AI service received a request of 863 bytes; these things happened and none of them should have: the AI service received a request of 863 bytes; the status is 200, expected 429; the code is undefined, expected daily_limit; the sentence is undefined

invite-member: AT THE LIMIT -- the email service receives NOTHING and no email is sent
error: Error: the rest of the handler ran 1 time(s). What it did: the email service received a message for nobody-at-all@example.com; these things happened and none of them should have: the email service received a message for nobody-at-all@example.com; the status is 201, expected 429; the code is undefined, expected daily_limit; the answer contains "nobody-at-all@example.com"

invite-member: a RETRY goes through the same gate -- at the limit, no second email either
error: Error: the retry sent 1 email(s) at the limit; and this happened: the email service received a SECOND message for nobody-at-all@example.com; the status is 201, expected 429; under the limit the retry sent 2 email(s), expected 1

FAILED | 32 passed | 5 failed (52ms)
exit=1
```

**That is the red the file exists for.** Five tests, and every message names the stubbed service being
reached — "the AI service received a request of 863 bytes", "the email service received a message" — so
what went red is the **order**, not the wording of an answer. Note also that the four can-this-fail guards
in section 7 of the test file still **passed** with the gate broken, which is correct: they judge broken
gates, and a broken real gate does not make a broken fake gate pass.

### 4b. The count is read truthily

`countOneUse`'s `if (answer?.data === true)` changed to `if (answer?.data)`. This is the mistake that
reads the four-character string `"false"` as permission.

```
> deno test ... --filter countOneUse supabase/functions/_tests/daily_limit_test.ts
countOneUse: the STRING "true" rather than the boolean: not a yes ... FAILED (0ms)
countOneUse: THE STRING "false", WHICH IS TRUTHY: emphatically not a yes ... FAILED (0ms)
countOneUse: the number 1, which a truthy test would read as permission ... FAILED (0ms)
countOneUse: the single character "t", which is how Postgres prints a true to a terminal ... FAILED (0ms)
countOneUse: a row rather than a scalar, which is what a function returning a table would give ... FAILED (0ms)

 ERRORS

countOneUse: THE STRING "false", WHICH IS TRUTHY: emphatically not a yes
error: Error: got {"allowed":true}, expected {"allowed":false,"why":"unknown"}

FAILED | 12 passed | 5 failed | 20 filtered out (33ms)
exit=1
```

### 4c. A limit spelled at a call site

`p_limit: dailyLimit(FEATURE_INVITATIONS)` in `invite-member` changed to `p_limit: 20`. The function
would behave identically; what it would lose is the one-file decision.

```
> deno test ... --filter spells supabase/functions/_tests/daily_limit_test.ts
neither function spells a limit: both read it from the one file ... FAILED (3ms)

 ERRORS

error: Error: invite-member never calls dailyLimit(), so where does its limit come from?; invite-member passes a NUMBER as p_limit. The limit must come from dailyLimit(), or there are two places to change it

FAILED | 0 passed | 1 failed | 36 filtered out (11ms)
exit=1
```

---

## 5. The refusal, in full

| | `suggest-subtasks` | `invite-member` |
|---|---|---|
| **At the day's limit** | HTTP **429**, code `daily_limit`, `"You've reached today's limit. It resets tomorrow."` | the same 429, the same code, the same sentence — it is one builder in the shared file |
| **The count did not answer** | HTTP **503**, code `daily_limit_unknown`, the fixed `"Suggestions aren't available right now."` | HTTP **500**, code `daily_limit_unknown`, `"Could not check today's limit, so no invitation email was sent. Please try again."` |
| **Logged?** | the limit: **no**. The counter error: **yes**, its code and nothing else | the same |

**One sentence for both features**, which is `docs/plan.md`'s decision and the reason it lives in the
shared file rather than in either function. **Two codes, not one**, because they are different news to
the owner: `daily_limit` is a quiet day, `daily_limit_unknown` is a page to open.

**The body carries `error` and `code` and nothing else.** No limit, no count, no feature word, no date,
no user id — asserted by the test "the limit refusal is the plan's sentence, character for character",
which also requires the sentence to contain no digit, no raw code, and none of the words Anthropic,
Claude, Resend, `usage_counts` or `count_daily_use`.

**`daily_limit` is deliberately NOT one of the thirteen fixed-failure codes, and `daily_limit_unknown`
is.** A test asserts both halves. The thirteen all mean "something in this app's plumbing went wrong,
press it again later"; reaching a limit is a fact about the person's own day.

**Every existing refusal keeps its order, status and body.** The count is the **last** thing before the
paid call in both functions, so every refusal above it answers exactly as it did before: the 401s, the
403 `account_suspended`, the 500 for a suspension read that did not answer, `ai_suggestions_off`, the
400s, the 404, `busy`, `not_configured` and `no_model` in one function; the 401, the 403s, the three 409s,
the 503 for unconfigured delivery and the 500s for a failed write in the other. The 250-test run in
section 3 includes all of them and none changed.

---

## 6. The one existing test that changed, and who agreed to it

**`supabase/functions/_tests/suggest_subtasks_test.ts`, one line: `SUGGEST_CODES.length !== 12` became
`!== 13`.** Rule 20 says a changed test gets its own line, so this is it.

It is an **increase in a count because the list grew**, not a loosened assertion, and the test file
itself pre-authorises exactly that — its own comment, written before this change:

> **RAISING THIS NUMBER IS THE ONLY THING A NEW CODE MAY DO TO THIS TEST.** The two assertions that
> matter — one sentence, one status, across every code in the list — are untouched.

Both of those assertions are untouched, and `daily_limit_unknown` is held to both by being in the list.
The two refusals that must **not** be in the list are the consent one and the limit one, and there is a
test for each.

**It was the test that noticed, before the number was touched.** `deno check` refused the comparison:

```
TS2367 [ERROR]: This comparison appears to be unintentional because the types '13' and '12' have no overlap.
  if (SUGGEST_CODES.length !== 12) {
    at file:///C:/Users/rajdh/team-tasks/supabase/functions/_tests/suggest_subtasks_test.ts:1941:7
error: Type checking failed.
exit=1
```

No other test was edited, skipped, deleted, loosened or lowered.

---

## 7. The screens

The sentence is in **three** places and they must agree character for character: the function's
`DAILY_LIMIT_MESSAGE`, `web/src/lib/suggestions.ts` for My tasks, and `web/src/lib/teams.ts` for My
teams. Each is a deliberate copy — the deployed function is a different program from the one in this
branch until somebody deploys — so a drift has to be a red check, and section 9 of
`scripts/screen-state-check.mjs` is that check.

```
> node scripts/screen-state-check.mjs
...
9. today's limit: one sentence, in three places, and never the fixed one
PASS  My tasks says the plan's sentence, character for character
PASS  My teams says the same sentence, and it is in that module exactly once
PASS  and so does the function, from its own one file
PASS  so all three copies are the same characters -- there is ONE sentence
PASS  and both screens match on the code the function actually sends
PASS  the status it refuses with is 429
PASS  the limits live in the function's one file, and both are 20
PASS  and NEITHER SCREEN NAMES A NUMBER in its daily-limit sentence
PASS  it names no company, no model, no key and no code
PASS  and says both halves: what happened, and when it ends
PASS  the four states My tasks can be in
PASS  the limit state is its own, not the unavailable one
PASS  a failed ask carrying the limit's code is the LIMIT
PASS  a failed ask carrying one of the fixed codes is unavailable, as before
PASS  a failed ask carrying the COUNTER'S error code is unavailable: that one is plumbing
PASS  a failed ask whose body could not be read at all is unavailable
PASS  a SUCCESSFUL ask carrying that code anyway still draws its suggestions
PASS  and nobody having asked is still idle, whatever code is lying about
PASS  the code is matched exactly: a near-miss is not the limit
PASS  My teams tells the limit apart by its CODE, not by its status
PASS  and the page would not draw a code it does not know: the outcome is on the fixed list
PASS  the tasks page reads the code off the failed answer and passes it in
PASS  and it draws the limit's own panel, not the fixed sentence's
PASS  the tasks page reads the CODE and never the message

182 of 182 checks passed.
exit=0
```

**Two of those checks failed on their first run and the expectations were what was wrong, not the code.**
"and so does the function" expected the sentence to appear once in `limits.ts` and it appears twice —
once as the constant and once in a comment quoting `docs/plan.md` — and the outcome-list check used a
helper that splits on `};`, which runs past the end of an array declaration. Both were fixed by making
the checks read the real exported value rather than count characters in a file: `limits.ts` has no
imports, so this script can **import** it, and the comparison is now against
`DAILY_LIMIT_MESSAGE` itself. That is a better check than the one that was wrong.

**It is also the first coverage `web/src/lib/suggestions.ts` has had from any script.** Before this
change nothing in `scripts/` read that module.

**Nobody has seen either screen in a browser.** Not the limit panel on My tasks, not the banner on My
teams. The same gap [#212](https://github.com/build-once/team-tasks/issues/212) records for the consent
screen, and nothing in this change narrows it.

---

## 8. The staging script, and what it would cost to run

`scripts/staging/build-it-20-ai-checks.mjs` gains a section 7 for today's limit. **It has not been run
against staging** — it cannot be, because the counting is not deployed there, and running it is the
owner's step.

**The selftest, which is what makes a future green run mean anything:**

```
> node scripts/staging/build-it-20-ai-checks.mjs --selftest
...
140 cases, 0 wrong.
exit=0
```

110 before this change, 140 after. The case that matters feeds `judgeRefusedAtLimit` the answer a
function that **counts nothing** gives — 200 with suggestions, which is what staging answers today — and
requires all four parts to come out FAIL. Six more check the arithmetic the script's own drive-to-the-limit
rests on: which answers spend one of the day's uses, read off `docs/plan.md`'s table, `unreachable`
included.

**Four expectations were wrong on the first run and the selftest said so.** Three cases expected four
FAILs from `judgeRefusedAtLimit` where the fourth part — "the body carries error and code and nothing
else" — correctly passes for a fixed 503, which does carry exactly those two fields. The fourth expected
one result from `judgeSuggestions` where it returns two. The expectations were corrected, with a comment
saying which was wrong; no judgement was loosened.

### How the owner runs the limit section, and how the temporary limit is set

The section only runs with `--ai-limit=<n>`, and without the flag it reports **UNVERIFIED** and makes no
extra asks — so an ordinary run still costs at most three metered requests.

**Why the flag exists at all:** the script cannot discover the limit. No role holds SELECT on
`usage_counts` — not `anon`, not `authenticated`, and **not `service_role`**, which the coach read back
off staging on 8 October 2026 — and the limit is a constant compiled into the deployed bundle. So
whoever deployed has to say what it is.

**Why not just run it at 20:** twenty-one asks is twenty-one metered requests, every run, to establish
that twenty-one is more than twenty.

**The five steps, which do not change the config on `main`:**

```
1. git switch -c tmp/low-limit-for-staging          # throwaway, never pushed
2. edit ONE line in supabase/functions/_shared/limits.ts:
     [FEATURE_AI_SUGGESTIONS]: 4,
3. supabase functions deploy suggest-subtasks --project-ref ghskxrhqlhvrhpnivqbd
4. node scripts/staging/build-it-20-ai-checks.mjs --ai-limit=4
5. git switch -  and deploy again, so staging is not left at 4. Delete the branch.
```

**Why not an environment-variable override in `limits.ts`**, which is the obvious alternative: it would
be a second place the limit could come from, settable on **production**, where the only thing between a
loop and a bill would then be whatever somebody last typed into a dashboard. `docs/plan.md` asks for one
file; this keeps one file. The cost is that the temporary limit needs a deploy, which is the honest
trade and is said here rather than hidden.

The flag refuses anything outside 3..30, before reading any file:

```
> node scripts/staging/build-it-20-ai-checks.mjs --ai-limit=99
REFUSING TO RUN: --ai-limit must be a whole number from 3 to 30, and it was "99".
exit=1
```

### Run it at most once per UTC day

The count is keyed by the UTC date and **nothing in the script can reset it**: no role holds DELETE on
`usage_counts`. A second run the same day starts at the limit and reports UNVERIFIED for the drive, with
a detail line saying exactly that. To run it again sooner the operator deletes that person's rows in the
dashboard, or waits for 00:00 UTC.

### And the count has to be read back by hand

Issue #221's fifth condition asks for the count read off the table, and **this script cannot do it**. In
the Supabase dashboard, after a run:

```sql
select feature, day, used from public.usage_counts order by day desc, feature;
```

That is the operator's query, in the dashboard, because no role the app uses may run it.

---

## 9. Every other check that ran

| Command | Result | Exit |
|---|---|---|
| `deno check` over the three files | 3 checked | **0** |
| `deno test` over `supabase/functions/_tests` | 250 passed, 0 failed | **0** |
| `node scripts/screen-state-check.mjs` | 182 of 182 | **0** |
| `node scripts/staging/build-it-20-ai-checks.mjs --selftest` | 140 cases, 0 wrong | **0** |
| `node scripts/approved-model-check.mjs` | 6 PASS, 0 FAIL; 263 text files read, no unapproved model | **0** |
| `node scripts/drift-check.mjs --selftest` | 20/20 cases | **0** |
| `npx tsc --noEmit` in `web/` | no output | **0** |
| `npm run lint` in `web/` | no findings | **0** |
| `npm test` in `web/` | 25 pass, 0 fail — **this one reaches staging**, see the note at the top | **0** |

`approved-model-check` and `drift-check` are listed because both read the new files: the first scans every
text file for a model-shaped string (the test file's `NOT_A_MODEL` placeholder is deliberately not one),
and the second is what already asserts "a `_shared` folder is not treated as a function".

### The CI counts raised, and the one widening

| In `.github/workflows/ci.yml` | From | To |
|---|---|---|
| `EXPECTED_FUNCTION_TESTS` | 213 | **250** |
| `EXPECTED_SCREEN_STATE_CHECKS` | 158 | **182** |
| `EXPECTED_AI_CASES` | 110 | **140** |

Each is a **floor**, and each number was counted from the run quoted above in this session.

**And one `--allow-read` was widened**, which is the only change to a workflow in this pull request
beyond the three numbers: the Deno test job read `supabase/migrations` and now reads
`supabase/migrations,supabase/functions`. One test reads the two handlers' own source, because "neither
function spells a limit" is an absence and there is no value to pass in that would reveal a stray 20
sitting in a file. **It enables a check and skips none.** It was widened by a named directory rather than
to the parent on purpose: `supabase/.temp` is git-ignored and may hold a project reference, and it stays
out of reach.

---

## 10. What this does NOT settle

Rule 8, and this is the half a green run cannot give.

1. **Nothing is deployed, so nothing is limited in a running app.** No number has been counted outside a
   test. Every claim in this file is about bodies built locally.
2. **No deployed function has ever answered the limit's refusal.** The staging script's section 7 has
   never run; the production equivalent cannot exist (rule 19).
3. **The count has never been read back off a table.** Issue #221's fifth condition is the owner's step
   and is open.
4. **`invite-member`'s half has no deployed check at all**, and it is the half that spends money on
   production. Filed: [#227](https://github.com/build-once/team-tasks/issues/227).
5. **Whether the Supabase bundler accepts an import from `_shared` is unknown.** No function here has
   ever been deployed with a cross-folder import, and `deno check` passing is not the same question.
   Filed: [#226](https://github.com/build-once/team-tasks/issues/226). If it is refused, the deploy fails
   and nothing is deployed, which is the safe direction.
6. **Production's privileges on `usage_counts` have never been read back.** The migration grants
   `service_role` EXECUTE on `count_daily_use` and nothing on the table; staging was read back by the
   coach, production was not. If that grant were somehow absent on production, `invite-member` would
   refuse every invitation with `daily_limit_unknown` — fail closed, and visible. Already filed as
   [#222](https://github.com/build-once/team-tasks/issues/222).
7. **Nobody has seen either screen.** No browser, no phone. Same gap as
   [#212](https://github.com/build-once/team-tasks/issues/212).
8. **A refused invitation leaves a row saying `sending`.** A stated consequence of the ordering the owner
   chose, not a surprise — filed as [#225](https://github.com/build-once/team-tasks/issues/225) rather
   than left in a code comment.
9. **One command was blocked by a guard and the block stands.** A `grep` over
   `.github/workflows/migrate-production.yml` was refused by `supabase-functions-deploy-target`, because
   the search pattern contained a literal the guard reads as a deploy command. Rule 5 forbids retrying or
   reaching for another tool after a block, so **the body of that workflow was not read in this
   session.** What that costs: this file cannot say whether anything gates the job that deploys functions
   to production. What was established instead, before the block, is in section 11.
10. **The per-call cost is still arithmetic on an assumed input token count.** `docs/costs.md` says so;
    nothing here measures it, because nothing here calls the service.

---

## 11. What merging this does, which is the thing to read before merging

**Production will get the counting on merge, and staging will not.**

`.github/workflows/migrate-production.yml` runs on a merge to `main` and its jobs include **"Deploy
server functions to production"**. Read off the run for PR #224's merge commit, in this session:

```
> gh run view 37780308766 --json jobs --jq '.jobs[] | "\(.name): \(.conclusion)"'
Apply migrations to production: success
Deploy server functions to production: success
Smoke-test production from outside: success
```

`docs/plan.md` says the same in words, in its Build it 21 entry: "Production gets every function on
merge, through the same workflow." **Whether anything gates that job is unchecked** — see item 9 above.

So, on merge:

| | What happens |
|---|---|
| **Production** | Gets both functions with the counting. The migration is **already applied** there (PR #224, same workflow, same merge), so `count_daily_use` exists and `service_role` holds EXECUTE on it. |
| **Staging** | Gets nothing. Functions reach staging only when the owner deploys by hand. |

**What that means for production, feature by feature:**

- **`suggest-subtasks`: nothing changes.** Production has no `AI_API_KEY`, and `not_configured` is
  decided **before** the count, so no row is ever written and no behaviour changes. That is by design —
  `docs/plan.md`'s order of release keeps the production key out until the consent setting has been seen
  to refuse there and a privacy page exists ([#204](https://github.com/build-once/team-tasks/issues/204)).
- **`invite-member`: this is the live one.** Production sends real email, so after merge each send is
  counted and the twenty-first in a UTC day is refused. The plan asks for exactly that. The one thing
  that could go wrong is the EXECUTE grant not being what the migration says on production, which
  **nobody has read back** (#222) — and it fails closed: invitations would be refused with
  `daily_limit_unknown` and a 500 rather than over-sent.
- **The bundler question (#226) is decided by that same deploy**, and if it goes the wrong way the job
  turns red and production keeps the functions it has.

**If the owner would rather production did not get this before staging has tried it**, the merge is the
thing to hold, not this pull request's contents — there is nothing in the code that could be made to
deploy to one and not the other.

---

## 12. The coach's review, and the staging runs after the merge

**Added by the Build it 23 part 0 pull request, 2026-10-08.** This is the coach's comment on PR #228,
posted at 16:32 UTC on 8 October 2026 — after the merge at 14:09 — copied here **verbatim** because its
own first line asks for that and because rule 13 says a record that exists only in a chat or a comment
thread is not saved. It is the first and only account of any of this running anywhere.

**What it is and is not.** It is the **coach's** record of the **owner's** runs, plus the coach's own
reads through the staging read-only connector. **Nothing in it was run, seen or verified by the
assistant**, in that session or in the one that copied it: no `supabase` command, no connector, no
browser, no staging terminal. It is reproduced because it is the evidence, not because it was checked
here — and the one thing the assistant did do is read it against this file's section 10, which it changes
in four places. That comparison is after the quote.

**Nothing in it was redacted, and the list of replaced values is empty.** It names the staging test
accounts the repository already names (`docs/environments.md`), a script's own invitation address suffix,
and no address, token, key, link or user ID. Rule 18 asks for the list rather than a reassurance, and an
empty list is the complete answer here.

> **Coach review and record of the staging runs (comment only), 8 Oct 2026.** To be copied into the evidence file by the next pull request.
>
> Read myself: `supabase/functions/_shared/limits.ts` and the gate in `invite-member`. `countOneUse` allows only on `data === true`; `false` is "at limit"; a thrown call, an error, or any other answer is "unknown" and nothing is sent. The limits (20 and 20) are in the one file. Production already had migration `20261008115900` before this review (read-only connector: table with row-level security, function present, `service_role` execute only).
>
> Staging, run by the owner with `scripts/staging/build-it-20-ai-checks.mjs --ai-limit=4`:
>
> - **Before any deploy** (function from PR #214, no counting): 49 PASS, 5 FAIL, 2 UNVERIFIED. All five FAILs in section 7: five simultaneous asks all allowed; the ask after the limit answered 200; "uses this run spent in total: 9 of 4".
> - **Temporary limit:** on an unpushed local branch the owner changed the one line to 4 and deployed `suggest-subtasks` to staging.
> - **After that deploy:** 55 PASS, 0 FAIL, 1 UNVERIFIED (the section had no asks left to make, having spent 3 of 4 earlier). Five simultaneous asks with 1 use left: 1 allowed, 4 refused by the count. The ask after the limit: 429, code `daily_limit`, "You've reached today's limit. It resets tomorrow." Both signed-out shapes refused at the door, not by the count. "uses this run spent in total: 4 of 4".
> - **Coach, staging read-only connector:** `usage_counts` held one row: `ai_suggestions`, 2026-10-08, used 4.
> - **Restored:** the owner restored the file (grep showed 20), deleted the local branch, and deployed `suggest-subtasks` and `invite-member` from this branch. Both deploys listed `_shared/limits.ts` among the uploaded assets, which answers #226.
> - **invite-member with the counter** (`build-it-18-invitation-status-checks.mjs`): 8 PASS, 0 FAIL, 2 UNVERIFIED; 201 with status `sent`; the second call 409 with 23505 and the row unchanged. Coach's read afterwards: a second row, `invitations`, 2026-10-08, used 1. The refused duplicate was not counted. This is the first staging observation for #227; the limit itself was not reached for invitations.
>
> Not seen: the limit sentence on either screen; a counter error against the real database; the invitation limit being reached; #225 (a refused invitation left showing "sending").
>
> Staging's count for the Alice test account today is 4 of 20 AI suggestions and 1 of 20 invitations. The script's `+bi18-status` invitation row is still to be deleted by the owner in the SQL editor.
>
> No blocking findings. Merge is the owner's decision; it puts counting live on production for invitations.

### What that changes about section 10, read item by item

Four of the ten are answered and six are not. **This is a reading of the comment above, not a new
check** — no command was run to confirm any of it.

| Section 10 item | Now |
|---|---|
| **1.** Nothing is deployed, so nothing is limited in a running app | **Changed for staging.** Both functions are deployed there, and the before-and-after pair of runs is what makes the refusal the deploy's doing rather than a coincidence. **Production is a separate question** — it got both functions on the merge, and nothing in the comment above reads production back |
| **2.** No deployed function has ever answered the limit's refusal | **Answered, on staging.** 429, code `daily_limit`, and the plan's sentence character for character. **At a temporary limit of 4**, on a local branch that was then restored and deleted — so the twentieth has still never been reached anywhere |
| **3.** The count has never been read back off a table | **Answered, on staging.** Two rows, read by the coach through the read-only connector: `ai_suggestions` used 4, and `invitations` used 1. That is issue #221's fifth condition, done for staging |
| **4.** `invite-member`'s half has no deployed check at all | **Changed.** It is deployed to staging and counted one real send; the refused duplicate was **not** counted, which is the ordering the plan asks for. [#227](https://github.com/build-once/team-tasks/issues/227)'s first staging observation. **The invitation limit itself was not reached**, so the refusal path for that half is still unseen |
| **5.** Whether the Supabase bundler accepts an import from `_shared` | **Answered.** Both deploys listed `_shared/limits.ts` among the uploaded assets — [#226](https://github.com/build-once/team-tasks/issues/226) |
| **6.** Production's privileges on `usage_counts` have never been read back | **Still open** for the table, and narrowed: the coach reports reading production's migration, table, function and `service_role` execute-only before the review. Whether that is the same read [#222](https://github.com/build-once/team-tasks/issues/222) asks for is not for this file to decide |
| **7.** Nobody has seen either screen | **Still open.** The comment's own "Not seen" list says the limit sentence has not been seen on either screen — [#212](https://github.com/build-once/team-tasks/issues/212) |
| **8.** A refused invitation leaves a row saying `sending` | **Still open**, and named in the "Not seen" list — [#225](https://github.com/build-once/team-tasks/issues/225) |
| **9.** One command was blocked by a guard and the block stands | **Unchanged.** Nothing in the comment touches it, and rule 5 means it stays |
| **10.** The per-call cost is arithmetic on an assumed input token count | **Unchanged.** Real calls were made to Anthropic on staging; no `usage` figures are in the comment, so `docs/costs.md`'s assumption stands |

**And one thing the comment leaves for the owner**, carried here so it is not lost with the thread: "The
script's `+bi18-status` invitation row is still to be deleted by the owner in the SQL editor."

**What this does NOT do: update `docs/plan.md`, `docs/costs.md` or `docs/architecture.md`.** All three
still say Build it 22 is "deployed nowhere", which the record above makes stale for staging. Changing them
is not this pull request's job — it is documents-only for Build it 23 (issue #229), and the three files it
may touch, it touches for attachments. The staleness is listed at the top of that pull request and filed
as [#230](https://github.com/build-once/team-tasks/issues/230), which names all eight sentences with their
file and line, and sets out what a fix must be careful about: **staging and production are different
answers**, and "deployed" collapses them.
