# Evidence: Build it 16 step 5, part B — the three server functions and a suspended account

Issue #133, and the coach's comment on it. Part A was #128, PR #132, merged as `f2cf18f`.
Branch: `feat/suspend-functions`.

**Read sections 1 to 7 as the state on 4 October 2026, section 8 as the first staging run and the bug
it found, and section 9 as all four runs in order.** Sections 1 to 7 were written before any of this
had been deployed, and they say so repeatedly. Since then the owner deployed to staging and ran the
script, which found a bug that every check in sections 2 to 6 had passed; the fix was made, deployed
and run again. **Section 9 is the current state; where it contradicts an earlier section, section 9 is
right.**

In one line: part B **and the fix are in force on staging**, both modes of the script have now been run
there — 15 PASS and 9 PASS, 0 FAIL — and **production has neither** until the owner merges PR #138.

Everything in sections 1 to 7 is output the assistant produced on the owner's machine, with the exact
command and exit code. The staging runs in sections 8 and 9 are the **owner's**, reported by them, and
the counts in section 9 are the **coach's** reads; the assistant deployed nothing and ran nothing
against staging in any of the three sessions. Where a number is quoted it was counted or read in the
session that wrote it.

| | |
|---|---|
| What is proved here | the decision each function makes, including every way the `account_status` read can fail; that all three agree; that all three send the right refusal BODY (section 8 on this machine, section 9 over the wire from staging); that the tests catch both a real fail-open and the real missing-`code` bug; that the staging script's judgements can fail; that the web app still builds and lints |
| What is **not** proved here | anything the assistant did not see itself. The four staging runs, the two deploys, the real `account_status` row, the real refusals over the wire and the `teams`/`invitations` counts are all the owner's and the coach's observations, quoted. **Nothing in production has been touched or read** |
| What is **known to be unproved** | nothing in **production**: it has neither part B nor the fix. On staging, the per-check output of all four runs and every exit code are **not reported** — only the totals and the bodies quoted in section 9. The new message on `/invite/[token]` has never been seen on a screen |

---

## 1. What changed

Five files, and one new folder.

| File | Change |
|---|---|
| `supabase/functions/create-team/index.ts` | the check, after the `ownerId` guard and **before `await req.json()`** |
| `supabase/functions/invite-member/index.ts` | the check, after the `callerId` guard and **before `await req.json()`** — so before `decideDelivery`, before the pending count, before any insert |
| `supabase/functions/accept-invite/index.ts` | the check, after the `userId`/`userEmail` guards and **before `await req.json()`** — so before the lookup and a long way before the one-shot claim. Plus `"account_suspended"` added to the `Reason` union |
| `web/src/lib/teams.ts` | `"account_suspended"` added to `INVITE_REASONS` |
| `web/src/app/invite/[token]/page.tsx` | the message for that reason, chosen by the page |
| `web/src/app/invite/[token]/actions.ts` | comment only: the 403 fallback is now ambiguous, and why that is all right |
| `supabase/functions/_tests/suspension_test.ts` | **new** — the Deno test |
| `scripts/staging/build-it-16-suspend-checks.mjs` | **new** — the staging script, two modes, never run *(both modes have since been run on staging, four times — section 9)* |

### The refusal

One fixed code for all three, `account_suspended`, with **HTTP 403**, and one sentence:
**"You can't do that at the moment."** Nothing else about the suspension is in the body, and
nothing at all is logged — there is no `console.log` or `console.error` on any of the three new
paths.

`docs/plan.md` says this version does not decide what a suspended person is told and #134 holds the
fuller question, so the sentence is deliberately neutral, and deliberately **not** one written for
another cause.

### Why the position of each call is the point

A 403 where the old code answered 400 or 404 is the only outside evidence that the check runs
**first**. That is what the staging script reads, and it is why all three calls sit before
`await req.json()`:

- `create-team`: nothing is read about the caller and no team count is run.
- `invite-member`: `decideDelivery` is never reached, so **no mail**, and no pending slot is spent.
- `accept-invite`: the claim is `update ... where accepted_at is null`, which succeeds **once,
  ever**. Claiming and then refusing would burn the invitation and the invited person would be told
  forever that it "has already been used".

### Three copies, not a shared module

`checkSuspension` is identical in all three files. That is the decision `hashToken` already took —
invite-member and accept-invite each have their own copy, with a comment saying that if one changes
the other must change with it.

The alternative, `supabase/functions/_shared/suspension.ts` imported by all three, is the folder
layout Supabase's own docs describe ("you can store any shared code in a folder prefixed with an
underscore (_)", https://supabase.com/docs/guides/functions/development-tips). It was not taken for
one reason: **no function in this project has ever been deployed with an import of a file outside
its own folder**, this pull request cannot deploy one to find out, and the first symptom of getting
it wrong would be all three functions failing to boot. Three copies need no new mechanism, and the
test below asserts the three agree, so a copy that drifts is a red test rather than a hole.

### `is_active()` is not called, on purpose

`public.is_active()` answers about `auth.uid()`. An admin connection has no signed-in user, so
`auth.uid()` is null and the answer is **false for every caller** — all three functions would refuse
everybody, with no error anywhere. Measured in part A's sandbox as `service_role` with no session:
`is_active()` returns `f` (`evidence/build-it-16-suspend-accounts.md` section 5, step M7). So the
table is read by user id instead, which step M8 shows works with no session, and which the
migration's `grant select on table public.account_status to service_role` exists for.

### Nothing writes `account_status`, and the reason is never read

No `insert`, `update` or `delete` on that table in any of the three functions, or in the script.
The `select` names **`user_id` only** — the `reason` column is never selected, never returned and
never logged. `docs/plan.md` marks it sensitive and says nobody reads it through the app.

---

## 2. The three functions type-check

```
> deno check --config supabase/functions/create-team/deno.json supabase/functions/create-team/index.ts
Check supabase/functions/create-team/index.ts
exit: 0

> deno check --config supabase/functions/invite-member/deno.json supabase/functions/invite-member/index.ts
Check supabase/functions/invite-member/index.ts
exit: 0

> deno check --config supabase/functions/accept-invite/deno.json supabase/functions/accept-invite/index.ts
Check supabase/functions/accept-invite/index.ts
exit: 0
```

`deno 2.8.2 (stable, release, x86_64-pc-windows-msvc)`, `typescript 6.0.3`, read from
`deno --version` in this session.

**Add `--no-lock` when repeating those three commands.** As written above they each wrote a
`deno.lock` into the function's own folder, which is what section 8 records deleting; the three
runs are quoted here exactly as they were made rather than tidied up afterwards.

**One rejected design is worth recording, because the comment in each file refers to it.** The first
version passed `ctx.supabaseAdmin` to a hand-written structural type. `deno check` refused it:

```
TS2589 [ERROR]: Type instantiation is excessively deep and possibly infinite.
    const suspension = await checkSuspension(ctx.supabaseAdmin, ownerId);
                             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    at file:///C:/Users/rajdh/team-tasks/supabase/functions/create-team/index.ts:191:30

error: Type checking failed.
exit: 1
```

A cast would have silenced that by switching the check off. Instead `checkSuspension` takes the read
as a function that performs it, so the query stays written out at the call site where a reviewer can
see which table and column it reads — and a stand-in read is what makes the test below possible.

---

## 3. The Deno test: 35 cases, including every way the read can fail

> **This section describes the file as it was on 4 October 2026, with 35 tests.** It has 40 now: five
> were added on 5 October, after the staging run, and they test something no test in this section
> tested — the response body. **Section 8 has the current run.** The 35 below all still pass, and all
> 35 passed while the bug section 8 describes was live, which is the whole point of section 8.

```
> deno test --no-lock --allow-env --config supabase/functions/create-team/deno.json supabase/functions/_tests/suspension_test.ts
Check supabase/functions/_tests/suspension_test.ts
running 35 tests from ./supabase/functions/_tests/suspension_test.ts
create-team: one row: this person is suspended ... ok (10ms)
create-team: a row carrying a reason: still refused, and the reason does not come back ... ok (0ms)
create-team: two rows, which the primary key makes impossible: still refused ... ok (0ms)
create-team: no rows: this person is not suspended, and everything still works ... ok (0ms)
create-team: FAIL CLOSED: the read returned an error with a Postgres code ... ok (0ms)
create-team: FAIL CLOSED: the read returned an error with no code at all ... ok (0ms)
create-team: FAIL CLOSED: the read threw ... ok (0ms)
create-team: FAIL CLOSED: the read's promise rejected ... ok (0ms)
create-team: FAIL CLOSED: no error, but data is null -- an unknown, not an empty list ... ok (0ms)
create-team: FAIL CLOSED: no error, but data is an object rather than a list ... ok (0ms)
create-team: FAIL CLOSED: no error, but data is a number ... ok (0ms)
invite-member: [the same eleven] ... ok
accept-invite: [the same eleven] ... ok
the three functions give the same verdict for every case ... ok (0ms)
the fail-closed cases REFUSE a check that fails open ... ok (0ms)

ok | 35 passed | 0 failed (27ms)
exit: 0
```

The twenty-two lines marked `[the same eleven]` are abbreviated **here only**; the run printed all
35 names in full, each `ok`, and `invite-member` and `accept-invite` differ from the block above
only in the name before the colon.

**What makes this worth anything: the test imports the three real `index.ts` files** and calls the
`checkSuspension` each one exports. Not a copy of the logic written out again — a copy would pass
while the deployed code did something else.

Three things it asserts that are easy to miss:

- **the reason never comes back.** One case hands the read a row containing the sensitive `reason`
  column, and the verdict is checked for extra fields and for that text. The real query selects
  `user_id` only, so this is a measured fact rather than a reading of the query.
- **no row means allowed.** The case that matters most in practice: getting it wrong shuts the app
  for everybody.
- **the three agree**, case by case, compared with each other and not only with the expectation.

`--allow-env` is needed because importing the three functions pulls in `npm:@supabase/server`, whose
dependency `std-env` probes environment variables at import time; without it the run dies with
`NotCapable: Requires env access to "NODE_ENV"`, then `"AI_AGENT"`, so the narrower
`--allow-env=NODE_ENV` is whack-a-mole rather than a tighter setting. No other permission is
granted, so the run cannot reach the network, the disk or a subprocess, and nothing in the file
reads or prints a setting.

### The test catches a real fail-open, shown rather than claimed

`create-team`'s own `checkSuspension` was edited to `return { allowed: true }` on a read error — the
exact mistake the file exists to catch — and the test was run again:

```
> deno test --no-lock --allow-env --config supabase/functions/create-team/deno.json supabase/functions/_tests/suspension_test.ts

create-team: FAIL CLOSED: the read returned an error with a Postgres code ... FAILED (2ms)
create-team: FAIL CLOSED: the read returned an error with no code at all ... FAILED (0ms)
the three functions give the same verdict for every case ... FAILED (0ms)

 ERRORS

create-team: FAIL CLOSED: the read returned an error with a Postgres code => ...
error: Error: create-team answered wrongly for "FAIL CLOSED: the read returned an error with a
Postgres code": allowed is true, expected false; why is undefined, expected unknown; code is
undefined, expected 42501

the three functions give the same verdict for every case => ...
error: Error: the three disagree about "FAIL CLOSED: the read returned an error with a Postgres
code": create-team {"allowed":true}, invite-member {"allowed":false,"why":"unknown","code":"42501"},
accept-invite {"allowed":false,"why":"unknown","code":"42501"}

FAILED | 32 passed | 3 failed (30ms)
exit: 1
```

Two things that run shows, and the second was not designed for: the fail-closed cases caught the
bug, **and so did the "the three agree" test**, by noticing that one copy had drifted from the other
two. The edit was then undone and the test re-run: `ok | 35 passed | 0 failed`, `exit: 0` — the same
output as the block at the top of this section.

The file also carries its own `brokenCheckSuspension`, written as the same mistake, and a test that
requires the seven fail-closed cases to refuse it. That one runs every time, so the question "can
these cases fail?" does not depend on somebody repeating the experiment above by hand.

---

## 4. The staging script's judgements can fail: 40 cases

```
> node scripts/staging/build-it-16-suspend-checks.mjs --selftest
build-it-16-suspend-checks --selftest: can these checks fail?
...
40 cases, 0 wrong.

Every judgement said FAIL to a function that acted for a suspended
person, to a check that ran too late, to a refusal that leaked the
reason or the timestamp, to a refusal aimed at everybody, and to a
run that touched account_status. That is what would make a green
staging run mean something. It is NOT itself a staging result:
nothing was sent anywhere by this run.
exit: 0
```

The 40 case names are printed in full by the run. The ones worth naming here, because they are the
failures this script exists to notice:

| Case | What it is |
|---|---|
| `THE HOLE IS OPEN: create-team created a team for a suspended person` | the 201 the owner saw on staging on 4 Oct |
| `PART B IS NOT DEPLOYED: the body was parsed first, so the answer is the old 400` | what a run before the deploy looks like |
| `THE CHECK IS IN THE WRONG PLACE: accept-invite looked the token up first (404)` | the check after the lookup |
| `403, BUT THE WRONG CODE: the page would read it as wrong_person` | the reason-code half of #133 |
| `403 WITH THE REASON TEXT IN IT` / `403 WITH THE TIMESTAMP IN IT` | the sensitive column, and when, through the app |
| `403 WITH A MESSAGE WRITTEN FOR ANOTHER CAUSE` | #134's mistake, repeated in part B |
| `THE is_active() TRAP: Alice is refused as well` | the quiet catastrophe: everybody refused |
| `IT READ account_status` / `IT WROTE account_status` | the script doing what it must never do |

**The mode is required, and that is enforced.** Both of these ran before anything was read or sent:

```
> node scripts/staging/build-it-16-suspend-checks.mjs
REFUSING TO RUN: say which state the account is in. Exactly one of:

  --expect-suspended   the owner has just ADDED Bob's row in account_status
  --expect-active      the owner has just REMOVED it
...
exit: 1

> node scripts/staging/build-it-16-suspend-checks.mjs --expect-suspended --expect-active
REFUSING TO RUN: say which state the account is in. Exactly one of:
...
exit: 1
```

### What the script does, and the two things it cannot do

It signs Alice and Bob in, calls the three functions as each of them, reads `teams` twice, and signs
out. **It creates nothing, and that is structural rather than careful**: `create-team` is sent `{}`
(no name), `invite-member` `{}` (no team id and no address), and `accept-invite` a well-formed random
token that is in no row. There is nothing in any of those three requests for a function to write,
and no address for it to send mail to, whatever state the account is in — so a run before the deploy
is as harmless as a run after it.

**Alice is the control, read first.** She is never suspended in either mode, and she must get her
ordinary 400, 400 and 404 from the three functions. A run where Bob is refused and Alice is not tells
part B working apart from part B refusing everybody; a run where both are refused is the
`is_active()` trap, and the script says so in those words.

Two things it cannot ask, and says so in its own output rather than leaving them to be assumed
(rule 8):

- **"and no row appeared in `teams`", "and no invitation was written".** A suspended person's reads
  come back empty whatever exists, so Bob counting 0 is part A working, not a count; and nobody else
  can read his team's invitations, because the select policy on `invitations` is the team **owner's**.
  Those two readings belong to the owner, in the dashboard or through a read-only connector, and the
  script prints what to look at. What it offers instead is the structural answer above.
- **whether mail was sent.** `invite-member` is never given an address, so there is nothing to send.

**It never touches `account_status`** — and that is measured, not promised: every request is recorded
in a log and `judgeTouchedNothing` checks the whole log at the end against a list of six allowed
paths. Three of the 40 selftest cases are fabricated logs that read or write that table, and all
three come out FAIL.

---

## 5. The web app

```
> npm run lint          (in web/)
> eslint
exit: 0

> npm run build         (in web/)
> next build
▲ Next.js 16.3.6 (Turbopack)
✓ Compiled successfully in 1321ms
  Running TypeScript ...
  Finished TypeScript in 3.4s ...
✓ Generating static pages using 15 workers (13/13) in 1013ms
exit: 0
```

The build is what proves the new reason is wired up at both ends: `REASON_MESSAGES` in
`web/src/app/invite/[token]/page.tsx` is typed `Record<InviteReason, string>`, so adding
`"account_suspended"` to `INVITE_REASONS` without adding its message would be a TypeScript error
rather than a page that silently shows nothing.

---

## 6. The repository's own checks

```
> npm test              (in the repository root)
PASS: 537 rule examples across 24 rules, plus 32 fail-closed checks.      (guard)
lint-skills: PASS - 12 skills, 0 problems
launch-check selftest: PASS (171/171 assertions, 39 checklist items, 17 auto checks, git available)
Self-test: 7/7 cases passed.                                              (workflow lint)
Checked 4 workflow file(s), 16 job(s): 0 problem(s), 0 warning(s).
vet-tool selftest: PASS (34/34 assertions; ...)
handoff selftest: PASS (57/57 assertions; ...)
Self-test: 20/20 cases passed.                                            (drift check)
AI team self-test: 258 passed, 0 failed.
exit: 0
```

### The pull request's own run

PR **#138**. On commit `c942d5c`, `gh pr checks 138 --watch` reported **14 checks, all pass**,
including the `required` aggregator: App build, Drift-check self-test, Guard self-test, Handoff
self-test, Launch check self-test, Secret scan (gitleaks), Skills lint, Vercel, Vercel Preview
Comments, Vet-tool self-test, Workflow lint, `npm test (macos-latest)`, `npm test (windows-latest)`,
`required`. **None of those 14 runs the Deno test or the new script's selftest** — that is #136, and
it is why the two commands above were run by hand and their output pasted here.

### One finding from this, and it changed where a file lives

The test was first written at `supabase/functions/suspension_test.ts`. That would have turned the
**daily drift check red every morning**. `scripts/drift-check.mjs`, lines 272-277:

```js
export function parseFunctionFolders(entries) {
  // "You can store any shared code in a folder prefixed with an underscore (_)"
  // -- https://supabase.com/docs/guides/functions/development-tips
  // migrate-production.yml's smoke test skips those folders for the same reason.
  return entries.filter((e) => !e.startsWith("_") && !e.startsWith(".")).sort();
}
```

It reads `supabase/functions` with `readdirSync` and **does not ask whether an entry is a folder**,
so a loose `.ts` file there is read as a function. It would have been looked for in production, not
found, and reported as drift — a red check every day for a file that is not a function.

The file is now at `supabase/functions/_tests/suspension_test.ts`. The directory, listed in this
session:

```
> Get-ChildItem supabase/functions
Mode   Name
d----- accept-invite
d----- create-team
d----- invite-member
d----- _tests
```

Four entries, all four of them folders; `parseFunctionFolders` drops `_tests` on its first filter
and returns the three function names. `.github/workflows/migrate-production.yml`'s smoke test skips
`_*` by name too (lines 413-415), and it also requires `[ -d "$dir" ]`, so it was never at risk.

Moving the file fixes this one file and not the rule — `readdirSync` without `withFileTypes` throws
away the only information that could tell a file from a folder, so the next loose file in there does
the same thing. **Filed as #137**, with the self-test case that would catch it.

---

## 7. Not verified — and most of part B is in this section

Every line here is something the 4 October session could not ask. AGENTS.md rule 8: a check that was
not run is not a pass.

> **Eight of the eleven bullets below were answered on 5 October, by the owner's four staging runs**
> (eleven bullets, eight struck through, counted in this session). They are kept, struck
> through, with what the runs showed — because what this section got right was more important than
> what it got wrong: it said the refusal had never been seen by a caller, and when a caller finally
> saw it, it was wrong. Section 8 has the bug; **section 9 has all four runs** and is the current state.
> The bullets still standing unstruck are the ones that are **still** unanswered.

- ~~**Nothing is deployed.**~~ **ANSWERED.** The owner deployed this branch's three functions to
  staging on 5 October. Production is still pre-part-B, and the assistant has still deployed nothing,
  anywhere, in either session.
- ~~**The staging script has never been run against staging**, in either mode.~~ **ANSWERED — both
  modes.** Four runs, all the owner's: `--expect-suspended` before the deploy (6 PASS, 9 FAIL), after
  it (14 PASS, 1 FAIL), after the fix (15 PASS, 0 FAIL), and `--expect-active` with the row removed
  (9 PASS, 0 FAIL) — the half that catches a check which refuses everybody. Section 9.
- ~~**No real `account_status` row has been involved.**~~ **ANSWERED.** The owner put Bob's row in
  place for the run. Every row in the Deno test is still fabricated, with invented ids and reason
  text.
- ~~**The real query is unproved.**~~ **ANSWERED for staging.** 14 of the 15 judgements passed, which
  they could not have done had the read not worked: `.from("account_status").select("user_id")
  .eq("user_id", id).limit(1)` now has run, as `service_role`, with no session. Unproved in
  production.
- ~~**The 403, the code and the message have never been seen by a caller.**~~ **ANSWERED, and this is
  the bullet that mattered.** A caller saw them, and accept-invite's body was missing its `code`. The
  403 and the sentence were right in all three.
- ~~**The fixed `accept-invite` is unproved against anything deployed.**~~ **ANSWERED for staging.**
  The owner deployed again after `669fe09` and run 3 came back 15 PASS, 0 FAIL, with `accept-invite`
  sending both `reason` and `code`. **Production still has neither the fix nor the check**, and that
  half of this bullet stands until PR #138 is merged.
- ~~**No count of `teams` or `invitations`** was read…~~ **ANSWERED by the coach, not by the
  assistant.** Three reads through the staging read-only connector, counts only, before deploy 1 and
  after run 4: every count identical, `account_status` 1 → 0. Section 9 has the table. **The
  assistant read none of them**, and the **per-check output of all four runs is still not reported**,
  so which individual judgements passed remains **unverified here** — including the script's "nothing
  was created" judgements, which are a log of its own requests rather than a count of rows.
- **No mail check.** The assistant sent nothing, so it has nothing to show from the test inbox — and
  `invite-member` was never given an address in any of the four runs, so there was nothing to send.
- **Nothing in a browser.** The new message on `/invite/[token]` has not been seen on a screen; it
  is proved to exist and to be reachable by type, by `npm run build`, and no further.
- **Neither new check is in CI.** `.github/workflows/ci.yml` contains the word `deno` zero times
  (counted in this session) and no `functions:test` script exists, so the Deno test and the script's
  `--selftest` both run only when somebody runs them by hand. Adding a CI job means editing
  `.github/workflows/`, which rule 5 says is the owner's call. **Filed as #136.**
- ~~**Whether `_tests/` is skipped by `supabase functions deploy`** is reasoned from the underscore
  convention in Supabase's docs and from the two files in this repository that act on it, not
  observed.~~ **ANSWERED, and by the first deploy exactly as predicted.** With **CLI 2.75.0** the
  deploy uploaded `deno.json` and `index.ts` for each of the three functions and **did not mention
  `_tests`**. Section 9, Deploy 1, including the two limits on that observation.

### How #133 actually gets answered

1. The owner deploys the three functions to staging.
2. The owner adds Bob's `account_status` row in the staging dashboard, and notes Bob's `teams` and
   `invitations` counts.
3. `node scripts/staging/build-it-16-suspend-checks.mjs --expect-suspended`.
4. The owner reads those two counts again — unchanged.
5. The owner removes the row, and runs `--expect-active`.

The script prints that sequence at the bottom of its own file, with the two SQL statements and both
shells' way of loading the password file.

**All five steps have since been carried out, on staging — section 9.** Steps 1 and 3 were done twice,
because the first `--expect-suspended` run found the bug section 8 records; step 4's two counts were
read by the coach rather than in the dashboard. What is left of #133 is production, which means merging
PR #138.

---

## 8. The staging run of 5 October 2026, and the bug it found

Written in a second session, on 5 October 2026, on the same branch. Everything above was unchanged
except where a note points here.

### What the owner did, and what they reported

The owner deployed this branch's three functions to staging, put the test account **Bob**'s
`account_status` row in place, and ran the script. **This is run 2 of the four section 9 records**:
the row went in first and the script had already been run once *before* the deploy, which this
session did not know. Section 9 has the order.

```
node scripts/staging/build-it-16-suspend-checks.mjs --expect-suspended
```

**14 PASS, 1 FAIL.** The failure, as reported:

> `accept-invite` answered `{"error":"You can't do that at the moment.","reason":"account_suspended"}`
> — no `code` field.

**What the assistant has, and has not, seen.** It has the two counts, the failing function, and that
body. It did **not** see the run's output, did not run the script, did not deploy, and has touched
neither staging nor production (AGENTS.md rules 1, 10 and 19; the task said to deploy nothing and run
nothing). Which 14 judgements passed is **unverified here** — see section 7.

### The bug

`supabase/functions/accept-invite/index.ts` is the only one of the three whose `fail` takes four
arguments, because it is the only one whose caller picks its wording from a reason:

```
function fail(message: string, status: number, reason: Reason, code?: string)   // accept-invite
function fail(message: string, status: number, code?: string)                   // the other two
```

The suspended refusal was copied from the other two and kept their shape — three arguments:

```
return fail(SUSPENDED_MESSAGE, 403, SUSPENDED_CODE);
```

So `"account_suspended"` landed in `reason`, `code` was `undefined`, and `Response.json` **omits an
undefined field rather than sending a null**. Hence a body that looks complete and is missing the one
field the other two functions' callers read.

**Why 14 of 15 still passed.** The refusal was right in every other respect — 403, the fixed
sentence, nothing leaked — and the check ran in the right place. The decision was never wrong; only
the response built from it was.

### Why nothing in this repository caught it

This is the part worth keeping. Before this session:

- **the Deno test** (section 3) asserted `checkSuspension`'s **verdict** — `{ allowed: false, why:
  "suspended" }` — and never once looked at a `Response`. All 35 tests passed with the bug live;
- **`deno check`** (section 2) could not have: three arguments to a four-parameter function whose
  fourth is optional is valid TypeScript, and `SUSPENDED_CODE` is a `string` that is also a valid
  `Reason`, so the third argument type-checks in either position;
- **the staging script** (section 4) *did* catch it, on the first run, because it reads the body. Its
  own `--selftest` even contains the mirror-image case, "403 with the code, but accept-invite left
  `reason` off". It was the only check of the five that asked the right question, and it is the one
  that needs a deploy to run.

A verdict is not a refusal. It is a decision that a refusal is built from, and the build was where
the mistake was.

### The fix

| File | Change |
|---|---|
| `supabase/functions/accept-invite/index.ts` | `suspendedRefusal()` — the call site, now passing `SUSPENDED_CODE` as **both** `reason` and `code` |
| `supabase/functions/create-team/index.ts` | `suspendedRefusal()` — same call as before, `{ error, code }`, no behaviour change |
| `supabase/functions/invite-member/index.ts` | `suspendedRefusal()` — same call as before, `{ error, code }`, no behaviour change |
| `supabase/functions/_tests/suspension_test.ts` | five new tests that read the Response each function sends |

The refusal is now a **named, exported function** in each of the three, called by the handler. That is
the only way the test can assert the real body: a test that writes out the expected JSON and compares
it with its own copy proves nothing. Same argument the `checkSuspension` export already rested on,
applied one level further out.

The three bodies are deliberately **not** identical, and the test says so:

| Function | Suspended refusal body | Status |
|---|---|---|
| `create-team` | `{"error":"You can't do that at the moment.","code":"account_suspended"}` | 403 |
| `invite-member` | `{"error":"You can't do that at the moment.","code":"account_suspended"}` | 403 |
| `accept-invite` | `{"error":"You can't do that at the moment.","reason":"account_suspended","code":"account_suspended"}` | 403 |

`accept-invite` needs the `reason` because `web/src/app/invite/[token]/actions.ts` accepts a reason
only if it is in `INVITE_REASONS` (`web/src/lib/teams.ts`) and otherwise falls back to the HTTP
status — where 403 reads as `wrong_person`. Without it a suspended person is told the invitation was
sent to a different address and sent off to sign in with an account they do not have. The other two
must **not** carry a `reason`: their `fail` has no such field and their callers read `code`.

### The new test fails without the fix — shown, not claimed

The fix was reverted to the three-argument call and the test run:

```
> deno test --no-lock --allow-env --config supabase/functions/create-team/deno.json supabase/functions/_tests/suspension_test.ts

create-team: the suspended refusal it sends is 403 with the sentence, the code and nothing else ... ok (6ms)
invite-member: the suspended refusal it sends is 403 with the sentence, the code and nothing else ... ok (0ms)
accept-invite: the suspended refusal it sends is 403 with the sentence, the code, the reason and nothing else ... FAILED (5ms)
the three refusals carry the same sentence and the same code ... FAILED (0ms)
the body checks REFUSE every broken refusal ... ok (1ms)

 ERRORS

accept-invite: the suspended refusal it sends is 403 with the sentence, the code, the reason and nothing else => ./supabase/functions/_tests/suspension_test.ts:474:8
error: Error: accept-invite's suspended refusal is wrong: code is undefined, expected "account_suspended"

the three refusals carry the same sentence and the same code => ./supabase/functions/_tests/suspension_test.ts:493:6
error: Error: the three refusals disagree: create-team {"error":"You can't do that at the moment.","code":"account_suspended"}, invite-member {"error":"You can't do that at the moment.","code":"account_suspended"}, accept-invite {"error":"You can't do that at the moment."}

FAILED | 38 passed | 2 failed (40ms)
exit: 1
```

Two things that shows. The new test fails **for the exact reason the staging run gave** — `code is
undefined` — and the "the three refusals agree" test caught it independently, by noticing one body
had drifted, which is the same way the verdict test caught a drifted copy in section 3. The 38 that
passed include every one of the 35 from section 3: **the old tests cannot see this bug, and that is
measured here rather than argued.**

Colour codes are stripped from the quoted output and the 33 passing lines above the failures are left
out; nothing else is altered.

### With the fix: 40 passed, exit 0

```
> deno test --no-lock --allow-env --config supabase/functions/create-team/deno.json supabase/functions/_tests/suspension_test.ts

the three functions give the same verdict for every case ... ok (0ms)
the fail-closed cases REFUSE a check that fails open ... ok (0ms)
create-team: the suspended refusal it sends is 403 with the sentence, the code and nothing else ... ok (5ms)
invite-member: the suspended refusal it sends is 403 with the sentence, the code and nothing else ... ok (0ms)
accept-invite: the suspended refusal it sends is 403 with the sentence, the code, the reason and nothing else ... ok (0ms)
the three refusals carry the same sentence and the same code ... ok (0ms)
the body checks REFUSE every broken refusal ... ok (0ms)

ok | 40 passed | 0 failed (32ms)
exit: 0
```

The 33 earlier lines, all `ok`, are left out here; the run printed all 40 names. `deno test`
type-checks what it runs, so this also type-checks the three functions after the edit.

### Can the new body checks fail? Seven mistakes, all refused

The new section of the test carries seven broken refusals and requires its checks to reject every
one. The first is **not invented** — it is what staging actually sent, reproduced exactly:

| Broken refusal | Caught by |
|---|---|
| accept-invite's reason with no `code` — the staging bug | `code is undefined` |
| accept-invite's `code` with no reason — the mirror image, which sends the page to the wrong wording | `reason is undefined` |
| a refusal carrying `suspended_at` and the owner's reason text | extra fields; timestamp-shaped text; reason text |
| a refusal naming the account it is about | extra field; uuid-shaped text |
| the right body with status 500 | status |
| the right `code` with another refusal's wording | the sentence |
| a plain-text `Forbidden`, not JSON | not JSON |

That test also asserts the count is 7, so deleting a case fails the test rather than quietly
weakening the file — the same guard the fail-closed test has on its seven.

### The repository's own checks, after the fix

```
> npm test
AI team self-test: 258 passed, 0 failed.
Checked 6 workflow file(s), 14 job(s): 0 problem(s), 0 warning(s).
exit: 0
```

```
> node scripts/staging/build-it-16-suspend-checks.mjs --selftest
40 cases, 0 wrong.
exit: 0
```

`--selftest` sends nothing and is not a staging result; it is the script's own logic being checked
against expected verdicts. It was unchanged in this session — the script already judged this
correctly, which is how the bug was found.

`git status` after the runs shows five modified files — the four above plus this evidence file — and
**no `deno.lock` anywhere**, so the `--no-lock` flag is still doing its job (#35 remains the right way
to add lockfiles deliberately):

```
> git status --short
 M evidence/build-it-16-suspend-functions.md
 M supabase/functions/_tests/suspension_test.ts
 M supabase/functions/accept-invite/index.ts
 M supabase/functions/create-team/index.ts
 M supabase/functions/invite-member/index.ts
```

### What is still needed, and it is the owner's

**Steps 1 to 4 were done on 5 October — section 9 records all four, with the numbers. Step 5 is the
only one left.** The list is kept as written, with what happened against each.

1. **Deploy the three functions to staging again**, so the fixed body is actually served. Until then
   staging refuses a suspended person *without* the `code` field. — **DONE**, deploy 2; its output is
   not reported.
2. **Re-run `--expect-suspended`** with Bob's row in place. Expect 15 PASS, 0 FAIL. — **DONE**, run 3:
   **15 PASS, 0 FAIL, 0 UNVERIFIED**, which is the expectation written before the run and met.
3. **Run `--expect-active`** with the row removed — still never run, in either session, and it is the
   half that would catch a check refusing everybody. — **DONE**, run 4: **9 PASS, 0 FAIL, 0
   UNVERIFIED**.
4. **Read Bob's `teams` and `invitations` counts** in the dashboard, before and after, and confirm
   they did not move. — **DONE**, by the coach through the staging read-only connector: unchanged.
5. **Merge the pull request** for production to get any of this at all. — **STILL OPEN.** PR #138.

Step 1 is permitted to the assistant by rule 19 and was **not** done by it, in any session: both
deploys and all four runs are the owner's.

### The root cause is still there, and it is filed

The fix corrects the one call site that was wrong. It does **not** remove the trap: the three `fail`
helpers still take different arguments, so the third parameter means `code` in two files and `reason`
in the third, and a three-argument call type-checks in all three. The next refusal copied between them
can lose a field the same way.

**Filed as [#139](https://github.com/build-once/team-tasks/issues/139)** — with the two options
(one shared helper, or named arguments so an omitted field is a type error) and, as the test of
whether it is fixed, that `deno check` must reject the mistake that caused this, since `deno check`
is precisely the check that could not see it.

---

## 9. All four staging runs, as the owner reported them

Written in a third session, on 5 October 2026, on the same branch. **This section is the current state
of this file**; where it contradicts sections 1 to 8, this one is right. Section 8 recorded one run and
the bug it found; this section records all four, in order, including the two that came after the fix.

Every number and every body below is the **owner's** report of their own runs, plus the coach's reads
through the staging read-only connector. The assistant **deployed nothing, ran nothing against staging
and read nothing there** — not in this session and not in either earlier one; the task said to deploy
nothing and run nothing. So nothing here is an observation of this machine, and anything the owner did
not report is marked **not reported** rather than filled in.

### The setup, as reported

| | |
|---|---|
| Date | 5 October 2026 |
| Who ran all of it | the owner |
| Branch | `feat/suspend-functions` |
| Supabase CLI | 2.75.0 |
| Staging project | `ghskxrhqlhvrhpnivqbd` — the same ref already committed in `.claude/guard/local.json` |
| Bob's `account_status` row | added by the owner by hand, in the staging SQL editor, before run 1 |

### The sequence

| # | What | Result, as reported |
|---|---|---|
| Run 1 | `--expect-suspended`, **before any deploy** | **6 PASS, 9 FAIL, 0 UNVERIFIED** |
| Deploy 1 | `supabase functions deploy --project-ref ghskxrhqlhvrhpnivqbd` | three functions deployed |
| Run 2 | `--expect-suspended` | **14 PASS, 1 FAIL** — the missing `code`, section 8 |
| Deploy 2 | the same deploy, after `669fe09` | **output not reported** |
| Run 3 | `--expect-suspended` | **15 PASS, 0 FAIL, 0 UNVERIFIED** |
| — | the owner **deleted** Bob's row in the SQL editor | — |
| Run 4 | `--expect-active` | **9 PASS, 0 FAIL, 0 UNVERIFIED** |

**Exit codes: not reported**, for any of the four runs or either deploy. The totals above are the
owner's report of the totals line each run printed, not of its exit status.

### Run 1 — the script fails when part B is absent

`node scripts/staging/build-it-16-suspend-checks.mjs --expect-suspended`, with Bob's row in place and
the old functions still deployed: **6 PASS, 9 FAIL, 0 UNVERIFIED**.

All nine FAILs were in **section 2**, Bob's section. The old functions answered Bob **400, 400 and
404, in their own words** — the part-A behaviour, which is exactly what the script's status table calls
a failure and says is "part B is not deployed here, or the check is in the wrong place". **Alice's four
control checks passed**, so the run was not a run where the app was shut for everybody.

This is the run worth having. Section 4 argued that the script's judgements *can* fail; run 1 is that
argued thing happening against the real deployment, on the one occasion it could ever be observed —
before the deploy. After deploy 1 this evidence is unreproducible without putting the old functions
back.

### Deploy 1 — and what it settles about `_tests`

`supabase functions deploy --project-ref ghskxrhqlhvrhpnivqbd`. As reported, the output:

- printed `WARNING: Docker is not running`;
- deployed **create-team, invite-member and accept-invite**, uploading **`deno.json` and `index.ts`
  for each**;
- **did not mention `_tests`** anywhere, and deployed no fourth function.

So the last bullet of section 7 — *"whether `_tests/` is skipped by `supabase functions deploy` is
reasoned from the underscore convention, not observed"* — is now **observed**: with **CLI 2.75.0** the
`_tests` folder is skipped. Two limits on that, both real: it is one CLI version on one machine, so a
later CLI could behave differently; and what was observed is the deploy's own list of what it
uploaded, which is the right evidence for "it was not sent" and is not a read of what is deployed.

### Run 2 — the bug, and the fix

**14 PASS, 1 FAIL.** The failure: `accept-invite` answered

```
{"error":"You can't do that at the moment.","reason":"account_suspended"}
```

with **no `code` field**. Section 8 is the whole account of it: why 14 of 15 still passed, why `deno
check` and the 35 verdict tests could not see it, the fix, and the five new tests that read the real
`Response`. Fixed in **`669fe09`**.

### Deploy 2 — output not reported

The owner deployed again after `669fe09`. **The deploy's output is not reported**, so this file has
nothing to quote for it. What stands in its place is run 3's bodies below: a function cannot send the
`code` unless the fixed code is the code running.

### Run 3 — 15 PASS, 0 FAIL, 0 UNVERIFIED

`--expect-suspended`, Bob's row still in place. The three refusal bodies, as reported:

| Function | Body |
|---|---|
| `accept-invite` | `{"error":"You can't do that at the moment.","reason":"account_suspended","code":"account_suspended"}` |
| `create-team` | `{"error":"You can't do that at the moment.","code":"account_suspended"}` |
| `invite-member` | `{"error":"You can't do that at the moment.","code":"account_suspended"}` |

These are, character for character, the three bodies the table in section 8 says the fix produces and
the five new tests assert — now coming back over the wire from a deployed function rather than from a
`Response` built in a test. That answers the one bullet section 8 left standing as **known to be
unproved**: a caller has now received a body with both `reason` and `code`.

The `0 FAIL` also covers the disclosure half of each refusal, because the script's third judgement per
function is the quiet check: the fixed sentence, no field outside `error`/`code`/`reason`, nothing
timestamp-shaped, no `@`, no uuid. **No `suspended_at` and no `reason` text left the functions**, which
is what `docs/plan.md` requires of the `account_status.reason` column.

### Run 4 — `--expect-active`, the half that had never been run

The owner **deleted Bob's row** in the SQL editor, then ran `--expect-active`: **9 PASS, 0 FAIL, 0
UNVERIFIED**. Bob got **400, 400 and 404 in the functions' own words** — his ordinary answers, the same
ones he got in run 1 — and **read 2 teams he owns**.

This is the run that catches a check which refuses everybody, which is the `is_active()` trap section 1
explains being avoided. Both modes have now been run, so the sequence section 7 wrote out as "how #133
actually gets answered" has been carried out end to end **on staging**.

### The coach's reads — counts only, through the staging read-only connector

Three reads, reported as counts only. No row contents, no addresses, no `reason` text.

| When (UTC) | `account_status` | Bob's teams | `teams` | `invitations` | team members |
|---|---|---|---|---|---|
| 06:46, before deploy 1 | **1** row (Bob's) | 2 | 9 | 4 | 2 |
| 06:47 | the same | 2 | 9 | 4, **2 of them accepted** | 2 |
| 07:46, after run 4 | **0** rows | 2 | 9 | 4 (2 accepted) | 2 |

**Nothing was written by any run.** That is the reading the script itself says it cannot do — its own
"nothing was created" judgement is a log of its requests, not a count of rows — and section 7 listed it
as the owner's step 4. It is now answered: every count is identical before and after, and
`account_status` went 1 → 0 exactly as the owner's two SQL-editor statements intended.

Two things the table does **not** say. The **06:46 and 06:47 reads are both stamped "before deploy
1"**, and **where run 1 falls relative to them is not reported** — so "before any deploy" is the only
ordering claim this file makes about run 1. And the 06:46 read did not report how many invitations were
accepted; the 06:47 read added that, and the 07:46 read matched it.

### What this section does not contain

Marked rather than guessed (rule 8 — a check that was not run is not a pass):

- **Exit codes: not reported**, for all four runs and both deploys.
- **Deploy 2's output: not reported.**
- **Per-check output: not reported** for any of the four runs. What the owner reported is each run's
  totals, the failing function and body in run 2, the three bodies in run 3, and Bob's answers in runs
  1 and 4. **Which** individual judgements passed is therefore still **unverified here**, exactly as
  section 7 says of run 2.
- **No browser test**: the new message on `/invite/[token]` has **not** been seen on a screen, in any
  session. It is proved to exist and to be reachable by type and by `npm run build`, and no further.
- **Whether mail was sent: not run, and nothing could have been sent.** `invite-member` was never
  given an address in any of the four runs, so there was nothing to send; the test inbox was not
  looked at.
- **Nothing in production** was deployed, run, read or touched. Production still has neither part B nor
  the fix; it gets them when the owner merges PR #138.

### One arithmetic reconciliation, and it is mine, not the owner's

The totals fit the script exactly, which is worth writing down because it is the only cross-check
available to a session that saw no output. Counted from
`scripts/staging/build-it-16-suspend-checks.mjs` in this session, by reading the code:

- `--expect-suspended` asks **15** judgements — section 1: four (Alice's team read, plus one per
  function); section 2: ten (`judgeSuspendedRefusal` returns **three** per function — status, code,
  quiet — so nine, plus Bob's own read of `teams`); section 3: one.
- `--expect-active` asks **9** — four, four (`judgeActiveAnswer` returns one per function, plus Bob's
  read), one.

So 6 + 9 = 15 in run 1, with the nine FAILs being section 2's three-per-function judgements and the
tenth — Bob's own read, which is part A working — passing; 15 in run 3; 9 in run 4. **This is deduced
from the script's source, not read from any output**, and it is the reason the per-check breakdown
above is still marked unverified: arithmetic that fits is not the same as output seen.

---

## 10. Notes

- **Data captured from production: none, in any of the three sessions.** The third session added
  section 9, which quotes **staging**, not production, and **nothing in it needed redacting** (rule
  18): the three refusal bodies carry the fixed sentence and the code and nothing else — no id, no
  address, no timestamp, no `reason` text, which is what the script's quiet check asserts and what
  run 3's 0 FAIL means. The coach's reads are **counts only**. No token, password or key appears, and
  the staging project ref `ghskxrhqlhvrhpnivqbd` is not a secret — it is already committed in
  `.claude/guard/local.json`. **Nothing was replaced, so the list of replacements is empty.**
- **Data captured from production: none.** Nothing was captured, read or copied from production in
  the first two sessions either, so **nothing has been redacted** (rule 18). Every id, token and reason string in the
  test and the script is invented or randomly generated: `a1b2c3d4-0001-4e5f-8a9b-0c1d2e3f4a5b`,
  `"Invented for a test. About nobody."`, and a random 32-byte token the script makes for itself. No
  real address appears anywhere; the script prints none.
- **The production log has a new entry** for 4 Oct, written from the coach's comment on #133 — two
  read-only connector calls by the coach. The assistant did not make them and has no production
  access.
- **No package was installed.** No `package.json`, `package-lock.json` or `deno.json` was changed.
  `deno check` and `deno test` did download `jsr:@supabase/functions-js@2.117.2` and
  `npm:@supabase/server@1.9.0` and their dependencies **into Deno's own cache** on this machine,
  because they had never been fetched here before — both are already pinned to exact versions in the
  three `deno.json` files, and nothing in the repository changed.
- **Three files were created by the tool run, and deleted again.** The first `deno check` and
  `deno test` runs wrote `deno.lock` into each of the three function folders. They are not in this
  change, and the documented command now passes `--no-lock` so no further run leaves one: a file in
  a function's own folder is a file that may end up in what gets deployed, which is a change to what
  production runs arriving as a side effect of running a test. `git status` after the final run shows
  no `deno.lock` anywhere. **Lockfiles for the functions are wanted — #35 is open and right about
  that** — and this is not an argument against it: #35 means adding them deliberately, reading what
  they pin and deploying with them, none of which describes a file that appears because somebody ran
  a test.
- **One thing noticed and already filed by somebody else.** `create-team`'s and `invite-member`'s
  refusals reach the screen through `/teams?error=<the function's message>`, and `/teams` prints that
  parameter — so the neutral sentence this change adds travels in a URL that a crafted link can
  also set to anything. That is **#45**, open since before this work, and this change neither
  worsens nor fixes it: the sentence is the same length and the same kind of text as the messages
  already going that way. The `/invite/[token]` half of the flow does not have the problem, which is
  why part B's new reason is a code rather than a message.
- **The three `deno.json` files are character-for-character identical**, checked with `Get-FileHash`
  in this session: all three SHA-256
  `86510527ECB93E7134801F16BF137B9C0E6B242A8A2BA6E4BA89390F44EBE4B7`. That is why one `--config`
  resolves the imports for a test that imports all three functions.
- **Download lines are left out** of the `deno check` output quoted in section 2: the first run
  printed about a hundred `Download https://registry.npmjs.org/...` lines as it filled the cache.
  Nothing else in any quoted output is altered.
- **Two editor diagnostics were ignored, and they are not new.** The IDE's TypeScript service reports
  `Cannot find module '@supabase/server'` and two implicit-`any` parameters in each `index.ts`. They
  are an artefact of a Node-oriented TypeScript service reading Deno files whose specifiers resolve
  through `deno.json`; they appear on lines nothing in this change touched, and `deno check` — the
  type-checker that matches the runtime — passes on all three files.
