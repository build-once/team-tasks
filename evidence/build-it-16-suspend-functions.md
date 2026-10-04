# Evidence: Build it 16 step 5, part B — the three server functions and a suspended account

Issue #133, and the coach's comment on it. Part A was #128, PR #132, merged as `f2cf18f`.
Branch: `feat/suspend-functions`.

**Result: the check is written, type-checked and tested on this machine. NOTHING IS DEPLOYED and
NOTHING WAS RUN AGAINST STAGING.** The assistant was told, in the task, to deploy no function and
run nothing against staging, and it did neither. So part B is **not in force anywhere**: staging and
production are both still running the three functions without this check, and a suspended person can
still create a team, invite somebody and accept an invitation on both.

Everything below is output the assistant produced on the owner's machine in this session, with the
exact command and exit code. Where a number is quoted it was counted or read in this session.

| | |
|---|---|
| What is proved here | the decision each function makes, including every way the `account_status` read can fail; that all three agree; that the test catches a real fail-open; that the staging script's judgements can fail; that the web app still builds and lints |
| What is **not** proved here | anything at all about a deployed function, a real `account_status` row, a real refusal, the `teams` and `invitations` counts, or whether mail is sent. All of that needs the owner: deploy, then two runs of the new script, then two reads in the dashboard |

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
| `scripts/staging/build-it-16-suspend-checks.mjs` | **new** — the staging script, two modes, never run |

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

Every line here is something this session could not ask. AGENTS.md rule 8: a check that was not run
is not a pass.

- **Nothing is deployed.** `supabase functions deploy` was not run, against staging or anything
  else. Rule 19 permits it against staging; the task said not to, and it was not. So **no refusal
  described in this file has ever happened**, and the three functions in staging and production are
  the pre-part-B ones.
- **The staging script has never been run against staging**, in either mode. `--selftest` is logic
  only: it sends nothing, signs nobody in, and is not a staging result.
- **No real `account_status` row has been involved.** Only the owner can add or remove one. Every
  row in the test is fabricated, and the ids and reason text are invented.
- **The real query is unproved.** `.from("account_status").select("user_id").eq("user_id", id)
  .limit(1)` has never run. The test supplies the answer rather than fetching it, so what is proved
  is the decision, not the read. Part A's sandbox step M8 shows that shape of read works for
  `service_role` with no session; that was a different session, a different machine and plain SQL.
- **The 403, the code and the message have never been seen by a caller.** The script's judgements
  describe them; nothing has produced them.
- **No count of `teams` or `invitations`**, before or after anything. Nobody has read those tables
  in this session.
- **No mail check.** Nothing was sent, so the test inbox has nothing to show.
- **Nothing in a browser.** The new message on `/invite/[token]` has not been seen on a screen; it
  is proved to exist and to be reachable by type, by `npm run build`, and no further.
- **Neither new check is in CI.** `.github/workflows/ci.yml` contains the word `deno` zero times
  (counted in this session) and no `functions:test` script exists, so the Deno test and the script's
  `--selftest` both run only when somebody runs them by hand. Adding a CI job means editing
  `.github/workflows/`, which rule 5 says is the owner's call. **Filed as #136.**
- **Whether `_tests/` is skipped by `supabase functions deploy`** is reasoned from the underscore
  convention in Supabase's docs and from the two files in this repository that act on it, not
  observed. The first deploy settles it, and the folder contains no `index.ts`, so there is nothing
  there that could answer as a function.

### How #133 actually gets answered

1. The owner deploys the three functions to staging.
2. The owner adds Bob's `account_status` row in the staging dashboard, and notes Bob's `teams` and
   `invitations` counts.
3. `node scripts/staging/build-it-16-suspend-checks.mjs --expect-suspended`.
4. The owner reads those two counts again — unchanged.
5. The owner removes the row, and runs `--expect-active`.

The script prints that sequence at the bottom of its own file, with the two SQL statements and both
shells' way of loading the password file.

---

## 8. Notes

- **Data captured from production: none.** Nothing was captured, read or copied from production in
  this session, so **nothing has been redacted** (rule 18). Every id, token and reason string in the
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
