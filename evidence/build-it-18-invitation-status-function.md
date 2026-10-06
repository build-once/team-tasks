# Evidence: Build it 18 part 2b — invitation status in the function and on My teams

Issue #166. The companion to `evidence/build-it-18-invitation-status.md`, which covers part 2a, the
migration (issue #164, PR #165).

**What this part does.** `invite-member` writes the two columns PR #165 added: a row starts at
`queued`, and after the email service answers it becomes `sent`, or `failed` with one of four codes.
A failed send no longer deletes the row. The owner can ask again for a failed invitation, or for one
stuck at `queued` long enough that the send clearly never finished, and a retry issues a new link.
My teams shows the owner **sending**, **sent** or **could not be sent**, with a plain sentence and a
**Try again** button.

**Where it started.** `main` at **`cd2d3847e763015803b16b948e0d0f51690e2ef6`**, the merge of PR #165,
committed `2026-10-06T14:29:36+01:00`. Read with `git log -1 --format='%H%n%cI%n%s'` after
`git fetch origin --prune` — which also showed `feat/build-it-18-invitation-status-migration` deleted
on the remote, so the migration branch is gone and merged. The branch for this work,
`feat/build-it-18-invitation-status-function`, was created from `origin/main` at that commit.

---

## 0. The headline, before any detail

**NOTHING IN THIS PULL REQUEST IS DEPLOYED ANYWHERE.** Not staging, not production. The owner
deploys to staging; production follows a merge. So every claim below is about code in a repository
and about runs on one laptop, and the two things that can only be learned from a deployed function —
that the status really gets written, and that the owner's screen really shows it — are **unverified**
and have a script waiting for them. Section 5 says exactly which questions those are.

| What | Verdict | Where |
|---|---|---|
| The pure decisions and response bodies the function builds | **PASS** — 45 Deno tests, exit 0 | §1 |
| Those tests fail against a function that lies | **PASS** — 4 of them, exit 1 | §2 |
| The staging script's own judgements can fail | **PASS** — 55 cases, exit 0 | §3 |
| The web app compiles, lints and builds | **PASS** — exit 0 both | §4 |
| The repository's own suite | **PASS** — exit 0 | §4 |
| The deployed function writes the status | **UNVERIFIED** — nothing is deployed | §5 |
| What the owner actually sees on staging | **UNVERIFIED** — nothing is deployed | §5 |
| The `failed` path, end to end | **UNVERIFIED** — it cannot be brought about from a script | §5 |

---

## 1. The Deno tests

`supabase/functions/_tests/invitation_status_test.ts`. It imports the real
`supabase/functions/invite-member/index.ts` and calls the pure pieces it exports — not a copy of them
written out again, which is the one failure a test like this must not have.

```
deno test --no-lock --allow-env --allow-read=supabase/migrations --config supabase/functions/invite-member/deno.json supabase/functions/_tests/invitation_status_test.ts
```

```
Check supabase/functions/_tests/invitation_status_test.ts
running 45 tests from ./supabase/functions/_tests/invitation_status_test.ts
invitationAnswer: the email went and the row says sent ... ok (30ms)
invitationAnswer: the email went to the test inbox and the row says sent ... ok (0ms)
invitationAnswer: a retry's email went and the row says sent ... ok (0ms)
invitationAnswer: THE EMAIL WENT AND THE STATUS WRITE FAILED: the row still says queued, so the answer must say queued ... ok (0ms)
invitationAnswer: a retry's email went and its status write failed: queued again, not sent ... ok (0ms)
sendFailureAnswer: not_configured, recorded on the row ... ok (0ms)
sendFailureAnswer: not_configured, and the status write ALSO failed ... ok (0ms)
sendFailureAnswer: unreachable, recorded on the row ... ok (0ms)
sendFailureAnswer: unreachable, and the status write ALSO failed ... ok (0ms)
sendFailureAnswer: refused, recorded on the row ... ok (0ms)
sendFailureAnswer: refused, and the status write ALSO failed ... ok (0ms)
sendFailureAnswer: unconfirmed, recorded on the row ... ok (0ms)
sendFailureAnswer: unconfirmed, and the status write ALSO failed ... ok (0ms)
every failure code has its own plain sentence, and no two share one ... ok (0ms)
the statuses and the failure codes are the ones the migration allows ... ok (4ms)
codeFromSendResponse: 200 with an id: the email exists ... ok (0ms)
codeFromSendResponse: a 2xx that is not 200, with an id: still a send ... ok (0ms)
codeFromSendResponse: 422 with the service's own complaint: refused, and not one word of it kept ... ok (0ms)
codeFromSendResponse: 401, which is what a wrong key looks like: refused ... ok (0ms)
codeFromSendResponse: 429, rate limited: refused ... ok (0ms)
codeFromSendResponse: 500 from the service: refused ... ok (0ms)
codeFromSendResponse: 200 WITH A BODY THAT IS NOT JSON: nothing can be said to have been sent ... ok (2ms)
codeFromSendResponse: 200 WITH NO id AT ALL: unconfirmed, not a send ... ok (0ms)
codeFromSendResponse: 200 with an empty id: unconfirmed ... ok (0ms)
codeFromSendResponse: 200 with an id that is a number rather than a string: unconfirmed ... ok (0ms)
codeFromSendResponse: 200 with a JSON body that is null: unconfirmed ... ok (0ms)
retryVerdict: failed: the owner may ask again, and this is the case the button is for ... ok (0ms)
retryVerdict: failed and old: still a retry -- age is not what decides a failed row ... ok (0ms)
retryVerdict: SENT: REFUSED, because somebody has that link in their inbox ... ok (0ms)
retryVerdict: sent a week ago: still refused. A sent invitation is never re-sent by this path ... ok (0ms)
retryVerdict: queued a moment ago: the send is probably in flight, so no second email ... ok (0ms)
retryVerdict: queued, one minute inside the window: still refused ... ok (0ms)
retryVerdict: queued for exactly the window: retryable. The boundary is inclusive ... ok (0ms)
retryVerdict: queued for an hour: the send clearly never finished ... ok (0ms)
retryVerdict: queued with a created_at that cannot be read: NOT a retry, because how long is unknown ... ok (0ms)
retryVerdict: queued with no created_at at all: not a retry either ... ok (0ms)
retryVerdict: queued with a created_at in the future, which a clock skew could do: not a retry ... ok (0ms)
retryVerdict: a status the check constraint does not allow: refused, as it was before any of this ... ok (0ms)
retryVerdict: no status at all, which is what a mis-read row looks like: refused ... ok (0ms)
retryVerdict: a status of the right word in the wrong case: refused, not guessed at ... ok (0ms)
alreadyWaitingAnswer: 409, the Postgres code, and the sentence it has always sent ... ok (0ms)
stillSendingAnswer: 409 with the code, its own sentence, and no raw code for a person to read ... ok (0ms)
the answer checks REFUSE a builder that always says "sent" ... ok (0ms)
the failure checks REFUSE every broken failure answer ... ok (0ms)
the retry cases REFUSE a verdict that sends a second email ... ok (0ms)

ok | 45 passed | 0 failed (70ms)
```

**exit 0.** Read with
`(Start-Process -FilePath "deno" -ArgumentList ... -NoNewWindow -Wait -PassThru).ExitCode`, because
rule 4 forbids `cmd; echo $?` and the shell does not persist between calls.

**What the five groups cover, against what issue #166 asked for under Proof:**

| #166 asks for | Which tests |
|---|---|
| the status, code and body for **sent** | the five `invitationAnswer` cases |
| **each failure code** | the eight `sendFailureAnswer` cases (four codes × recorded or not), plus the eleven `codeFromSendResponse` cases that decide which code an answer produces |
| **retry of a failed row** | `retryVerdict: failed`, and `failed and old` |
| **retry refused for a sent row** | `retryVerdict: SENT: REFUSED`, `sent a week ago`, and `alreadyWaitingAnswer`, which checks the 409's sentence character for character |

Three of those deserve naming.

**The case that cannot be seen from outside.** `invitationAnswer: THE EMAIL WENT AND THE STATUS WRITE
FAILED` is the heart of "what the function answers must match what it stored". The email went, the
`update` that should have written `sent` failed, so the row still says `queued` — and the answer says
`queued`. Both worlds answer 201 with the same shape, so nothing but this test can tell them apart,
and a function that wrote `status: "sent"` straight into the body would look right everywhere.

**The failure codes are the migration's, not the function's.** `the statuses and the failure codes
are the ones the migration allows` reads
`supabase/migrations/20261006095847_invitation_status.sql` and pulls the values out of the two check
constraints' `in (...)` lists, then compares them with what the function names. That is why the test
needs `--allow-read=supabase/migrations`, narrowed to that one directory. Comparing against a second
copy typed into the test would only prove somebody typed the same thing twice.

**One test found a real problem on its first run, and the code changed rather than the test.**
`every failure code has its own plain sentence` refuses a sentence that contains its own code, and it
caught `refused`:

```
every failure code has its own plain sentence, and no two share one ... FAILED (2ms)
error: Error: refused's sentence contains the raw code, which is not for a person to read
FAILED | 44 passed | 1 failed (50ms)
```

The sentence was "The email service refused the message." It is now "The email service would not
accept the message." Rule 20: a failing test is the test doing its job, so the code moved. The
comment above `FAILURE_SENTENCES.refused` records what it said and why it changed.

### The suspension tests still pass

This change edits a file `supabase/functions/_tests/suspension_test.ts` imports, so that file was run
too:

```
deno test --no-lock --allow-env --config supabase/functions/create-team/deno.json supabase/functions/_tests/suspension_test.ts
```

```
ok | 40 passed | 0 failed (42ms)
```

**exit 0.** 40 is also the floor `.github/workflows/ci.yml`'s `EXPECTED_FUNCTION_TESTS` holds, so
that job's count is unchanged by this pull request — which is the whole of why no workflow file is
touched. See §6.

### And the type check

```
deno check --no-lock --config supabase/functions/invite-member/deno.json supabase/functions/invite-member/index.ts
```

```
Check supabase/functions/invite-member/index.ts
```

**exit 0.** `deno test` type-checks what it runs, so §1 covers this too; it is here because it is the
one command that checks the function alone.

---

## 2. Seen to fail first

A test that has only ever been green is a test nobody has watched work. Two deliberate breaks were
made to `supabase/functions/invite-member/index.ts` **at the same time**, both of them the mistake
anybody would make writing this feature first:

1. in `invitationAnswer`, `status: args.status` changed to `status: "sent"` — report what we hoped,
   not what the database confirmed;
2. in `retryVerdict`, the `sent` branch changed from `{ retry: false, why: "sent" }` to
   `{ retry: true, why: "failed" }` — send it again because the owner asked.

The same command as §1:

```
invitationAnswer: THE EMAIL WENT AND THE STATUS WRITE FAILED: the row still says queued, so the answer must say queued ... FAILED (4ms)
invitationAnswer: a retry's email went and its status write failed: queued again, not sent ... FAILED (0ms)
retryVerdict: SENT: REFUSED, because somebody has that link in their inbox ... FAILED (0ms)
retryVerdict: sent a week ago: still refused. A sent invitation is never re-sent by this path ... FAILED (0ms)

 ERRORS

error: Error: invitationAnswer is wrong for "THE EMAIL WENT AND THE STATUS WRITE FAILED: the row still says queued, so the answer must say queued": invitation.status is "sent", and the row says "queued" -- the answer must match what was stored
error: Error: invitationAnswer is wrong for "a retry's email went and its status write failed: queued again, not sent": invitation.status is "sent", and the row says "queued" -- the answer must match what was stored
error: Error: retryVerdict answered {"retry":true,"why":"failed"}, expected {"retry":false,"why":"sent"} -- for "SENT: REFUSED, because somebody has that link in their inbox"
error: Error: retryVerdict answered {"retry":true,"why":"failed"}, expected {"retry":false,"why":"sent"} -- for "sent a week ago: still refused. A sent invitation is never re-sent by this path"

FAILED | 41 passed | 4 failed (56ms)
error: Test failed
```

**exit 1.**

Read the failures rather than counting them. Each one names the wrong value and the right one, and
the second break — the expensive one, the one that sends a second real email to somebody who already
has the first — is caught by two independent cases, a row sent a minute ago and a row sent a week
ago. **41 of the 45 still passed**, which is the point: these are not tests that fail whenever
anything moves.

Both edits were then reverted. Checked rather than assumed:

```
diff <the file as it was before the breaks> supabase/functions/invite-member/index.ts
```

```
902a903,912
>     // AND A RETRY IS COUNTED HERE TOO, WHICH IS WRONG AND IS NOT FIXED HERE. A
>     // failed invitation is still pending by this count -- not accepted, not expired
...
```

The only difference is a comment added deliberately afterwards, pointing at issue #170. Then the same
command again: **`ok | 45 passed | 0 failed`, exit 0.**

---

## 3. The staging checks script

`scripts/staging/build-it-18-invitation-status-checks.mjs`. It is written to be run by the owner
**before and after** deploying `invite-member` to staging, and the before-run is meant to fail.

### Its own judgements, which take no network and no account

```
node scripts/staging/build-it-18-invitation-status-checks.mjs --selftest
```

```
55 cases, 0 wrong.

Every judgement said FAIL to the function from before issue #166, to an
answer that claims 'sent' over a row that says 'queued', to a second
call that sent a second email, to a failed send whose row was deleted,
to a body quoting the email service, and to a run that wrote through
PostgREST or read account_status. That is what would make a green
staging run mean something. It is NOT itself a staging result:
nothing was sent anywhere by this run.
```

**exit 0.** 55 cases, every one a judgement fed a fabricated answer with the verdict it must produce.
Counted the way `.github/workflows/ci.yml` counts the other two selftests — `grep -c '^  ok  '` over
the output gives **55**.

The seven cases worth naming individually, because they are the ones that make the rest mean
something:

- **`THE FUNCTION IS THE OLD ONE: 201 with no status, and the row keeps the migration's default`** →
  FAIL, FAIL, UNVERIFIED. This is the run before the deploy, written out as a case so that nobody has
  to guess what it will look like.
- **`THE ANSWER LIES: it says sent and the row says queued`** → PASS, FAIL, FAIL.
- **`THE ANSWER LIES THE OTHER WAY: it says sent and the row says failed`** → PASS, FAIL, FAIL. The
  exact sentence from issue #166: "it never says sent when the row says failed".
- **`IT SENT A SECOND EMAIL for an invitation that already went`** → FAIL.
- **`THE SEND FAILED AND THE ROW WAS DELETED: the behaviour from before issue #166`** → FAIL.
- **`A BODY QUOTES THE EMAIL SERVICE'S OWN COMPLAINT`** → FAIL.
- **`THE MIGRATION IS NOT ON THIS PROJECT: PostgREST refuses the unknown column`** → FAIL, so a
  project without the migration is told so rather than reported as a function problem.

### And the selftest itself can fail

A selftest that cannot go red is the same problem one level up. `judgeAlreadySent`'s verdict for a
201 — a second email sent to somebody who already has one — was changed from `FAIL` to `PASS`:

```
  WRONG  IT SENT A SECOND EMAIL for an invitation that already went
          expected FAIL; got PASS
          PASS  a second call for an invitation that says 'sent' is refused with 409 and 23505 -- HTTP 201 -- IT SENT A SECOND EMAIL FOR AN INVITATION THAT ALREADY WENT. That is a real message to a real address, and it replaced a link somebody may already be holding

55 cases, 1 wrong.

The judgements in this file do not behave as its comments claim.
Fix them before running anything against staging: a check that
cannot fail is worse than no check, because it reports a pass.
```

Reverted, and `55 cases, 0 wrong` again.

### What the script creates, and the half of issue #166 it cannot do

Issue #166 asks that the script "creates and removes its own rows". **The second half is not
possible**, and this is the one thing about the script that could not be made to match the issue:

`public.invitations` has one policy, for select, and **no delete policy at all**
(`supabase/migrations/20260930193813_create_invitations.sql`). Nothing holding the publishable key
can remove an invitation — not Alice for her own team, not anybody. So the script:

- invites **one fixed plus-address** of the staging test mailbox,
  `teamtasks.staging.test+bi18-status@gmail.com`, and never a fresh one per run. Run it fifty times
  and there is still one row, because every run after the first either sends that one again or is
  refused by the partial unique index. That is the same decision `web/tests/staging.mjs` made for
  `INVITE_ADDRESS`, for the same reason, and deliberately a **different** address so the two do not
  disturb each other's evidence;
- **prints the exact `delete from public.invitations ...` statement** at the end of every run, for
  the owner to paste into the staging SQL editor, and repeats it in the "HOW TO RUN IT" section at
  the bottom of the file.

Filed as **#171**, which is the wider version of the same thing: nothing in this project can delete
an invitation, which is a privacy gap as well as an inconvenience here — the plan says an address
"stops being usable quickly" after 7 days, and the row is not removed by anything when it expires.

### What it never prints

A password, an access or refresh token, the publishable key, the project URL, a user id, or an email
address — not Alice's and not the plus-address, even though `docs/environments.md` publishes both.
Every body goes through `scrub()`, which is given both addresses **before the first request is made**
and the access token the moment it exists. Four `--selftest` cases check the scrub itself, including
one that proves nothing (the value was not in the text) and reports UNVERIFIED rather than PASS.

---

## 4. The web app, and the repository's own suite

```
npm run lint            (in web/)
```

```
> web@0.1.0 lint
> eslint
```

**exit 0.** One thing was fixed to get there, and it is worth recording because it is not obvious:
`Date.now()` in the page is refused by the `react-hooks/purity` rule —

```
162:15  error  Error: Cannot call impure function during render
`Date.now` is an impure function.
```

— while `new Date()`, which this page already used for its expiry filter, is not. So the page reads
the clock once as `new Date()` and takes both the ISO string and the milliseconds off it, which it
needed to do anyway: the filter and the staleness reckoning must agree about what "now" is.

```
npm run build           (in web/)
```

```
✓ Compiled successfully in 1438ms
  Running TypeScript ...
  Finished TypeScript in 3.3s ...
✓ Generating static pages using 15 workers (13/13) in 1365ms
```

**exit 0.** 13 pages, `/teams` dynamic as before. The build line says `Environments: .env.local`, so
it read the git-ignored local settings file as well as the placeholder values passed in — the same
file CI does not have, and CI's own `app-build` job passes placeholders only.

```
npm test                (repository root)
```

```
PASS: 537 rule examples across 24 rules, plus 32 fail-closed checks.
lint-skills: PASS - 12 skills, 0 problems
launch-check selftest: PASS (171/171 assertions, 39 checklist items, 17 auto checks, git available)
Self-test: 7/7 cases passed.
Checked 4 workflow file(s), 20 job(s): 0 problem(s), 0 warning(s).
vet-tool selftest: PASS (34/34 assertions; ...)
handoff selftest: PASS (57/57 assertions; ...)
Self-test: 20/20 cases passed.
AI team self-test: 258 passed, 0 failed.
Checked 6 workflow file(s), 14 job(s): 0 problem(s), 0 warning(s).
```

**exit 0.** Including `drift:test`, which matters here for one specific reason: `drift-check.mjs`
reads `supabase/functions` with `readdirSync` and does **not** ask whether an entry is a folder, so a
test file sitting directly in that directory would be reported as a missing function every morning.
`invitation_status_test.ts` is under `_tests/`, which `parseFunctionFolders` skips by name — the same
reason `suspension_test.ts` lives there, recorded in that file's header.

**`web/tests/access-rules.test.mjs` is not changed.** `git diff --stat` does not list it, and rule 20
is why. It did shape one decision, which is said plainly rather than left in the code: test 18,
"Alice CAN invite to her own team", accepts **201 or 409 with code 23505** and nothing else. A
successful retry therefore answers **201**, not 200 — the row's `token_hash` and `expires_at` are
both replaced, so "there is now a pending invitation whose link has just been emailed" is honest, and
the body carries `retried: true` so no caller has to read a status code to tell the two apart. A 200
would have failed that test on any run where the staging row happened to be `failed`, and editing the
test to suit this change is exactly what rule 20 forbids.

---

## 5. What this does NOT prove

Six things, and the first two are the big ones.

**1. That the deployed function writes the status. UNVERIFIED — nothing is deployed.** Everything in
§1 and §2 is about pure functions on a laptop. The function has not been pushed to staging or to
production, and the assistant deploys nothing anywhere. The way to settle it is the pair of runs
§3's script is built for:

```
node scripts/staging/build-it-18-invitation-status-checks.mjs      # before: must FAIL
supabase functions deploy invite-member --project-ref ghskxrhqlhvrhpnivqbd   # the owner
node scripts/staging/build-it-18-invitation-status-checks.mjs      # after: must pass
```

Delete the row between the second and third steps, with the statement the script prints — otherwise
the row from step 1 is a recent `queued` and the function will rightly refuse to send it again until
the stale window passes.

**2. That the owner's screen shows any of this. UNVERIFIED.** The page compiles and builds, and
nobody has looked at it. Nothing in this repository can: it needs a browser on a deployed app with a
real invitation in one of the three states. The owner opening **My teams** on staging after the
deploy is the check, and the three states to look for are "sending", "sent", and "could not be sent"
with a sentence and a **Try again** button.

**3. The `failed` path, end to end. UNVERIFIED, and it cannot be brought about from a script.** A row
only says `failed` when the email service refuses, cannot be reached, or answers without confirming.
Staging redirects every invitation to the test inbox, which the service accepts; the settings that
would refuse are function secrets, and changing them would be changing staging to suit a test. The
script reports this UNVERIFIED on every run with that reason. What *is* proved is what the function
builds for each of the four codes (§1).

**4. That `not_configured` can ever be stored. It cannot, today.** The migration's fixed list names
`decideDelivery`'s two refusals as its source, and `decideDelivery` runs **before any row exists** —
deliberately, so an environment that may not send creates nothing. So the caller gets 503 and the
table is untouched. The other three codes are all reachable. Named in the code above the
`decideDelivery` call, and filed as **#169** with both ways out.

**5. That 15 minutes is the right stale window.** It is a chosen number, and one of the three reasons
given for it — that it is far longer than an invocation can last — rests on a platform wall-clock
limit **that was not read in this session**, so no figure for it is written anywhere. Filed as
**#168**, which names the page to read.

**6. That a retry works when the team is at its 20-pending limit. It does not.** The limit counts
pending invitations, a `failed` one is pending, and the count happens before the function discovers
the request is a retry — so the owner presses **Try again** and is told the team is full. Fixing it
means moving a refusal ahead of another one, which issue #166 does not permit here. Filed as **#170**.

### And the question issue #166 asked to be answered in words

**What does a function stopped between the insert and the status write leave behind, and how does the
owner see it?**

It leaves **one row at `status = 'queued'`, `failure_code = ''`**, and nothing will ever move it. The
row is written first and the status second, with one HTTP request to the email service in between; a
crash, a timeout or a shut-down isolate in that gap means the second write never runs. Whether the
email went is not knowable from the row — the request may have been sent and answered, or never made
at all.

The owner sees it on **My teams** as **sending**, with no sentence and no button, exactly like an
invitation that is being sent this second. There is nothing in the data to tell those two apart, so
the only thing that can is the clock: after **15 minutes** (`STALE_QUEUED_MINUTES`) the line gains a
sentence — "Nothing has confirmed this one yet, so the email probably never went. Try again to send a
new link." — and a **Try again** button, which `retryVerdict` honours with `why: "stale"`. Pressing it
issues a new token, resets the 7 days and sends. If nobody presses it, the row expires after 7 days
like any other invitation and stops occupying a pending slot.

Two smaller shapes of the same gap, both handled rather than hoped about:

- **the status write itself fails** (the row is reachable, the `update` is refused). The function
  logs a line naming the invitation id and whether the email went, answers 201 with
  `status: "queued"` rather than claiming `sent`, and the action shows a banner saying the email went
  but could not be recorded — so the list saying "sending" does not look like a bug;
- **`created_at` cannot be read** on a queued row. Then how long it has waited is unknown, and an
  unknown is not "long enough": no button, in the function and on the page both. Refusing sends no
  second email; guessing might.

---

## 6. No workflow change, and what that costs

`.github/workflows/` is **not touched by this pull request**. Issue #166 allows a change "beyond test
counts" and no count needed changing: the `functions-test` job names one file by path
(`suspension_test.ts`, still 40 tests, floor still 40), and the `staging-script-selftests` job names
two scripts by path, neither of them the new one.

The cost is plain and should not be buried: **neither of this change's two check files runs in CI.**
The 45 Deno tests and the 55 selftest cases run only when somebody runs them. Filed as **#167**, with
the exact lines a fix would change and a negative check — delete a test, push, and watch the job go
red — that would prove the job is really reading the file.

---

## 7. The commit was refused once, by the project's own secret scan

Worth recording in full, because the hook was right and the fix was in this
change's code rather than in the check.

`git commit -F <file>` exited **1**. `.githooks/pre-commit` — which this clone has
switched on with `git config core.hooksPath .githooks`, and which runs
`gitleaks git --staged --redact --no-banner --verbose --exit-code 1 .` — reported
two findings, both in files added here:

```
Finding:     const TOKEN_SHAPED = "REDACTED"
RuleID:      generic-api-key
Entropy:     4.616066
File:        supabase/functions/_tests/invitation_status_test.ts
Line:        86

Finding:     ...nst standInToken = "REDACTED"
RuleID:      jwt
Entropy:     4.786524
File:        scripts/staging/build-it-18-invitation-status-checks.mjs
Line:        827

0 commits scanned.
scanned ~190399 bytes (190.40 KB) in 470ms
leaks found: 2
```

**Neither was a credential.** Both were fixtures invented for this change: a
base64url blob of the shape `makeToken()` produces, and a JWT-shaped string, each
there so that "no token reaches a response body" could be a measured fact instead
of a reading of the code. Nothing issued either of them and no row has ever held
one.

**The hook was still right, and `--no-verify` would have been the wrong answer.** A
scanner cannot tell a fixture from the real thing, and `.github/workflows/ci.yml`'s
`Secret scan (gitleaks)` job runs the same tool over the **whole history** on every
pull request with `fetch-depth: 0` — so committing them would have turned that job
red for everybody from then on, with nothing to do about it but rewrite history.

So the fixtures changed. Both are now built from a readable prefix and a repeated
character — `not-a-real-invitation-token-xxxx…` and `not-a-real-access-token-yyyy…`
— which has almost no entropy and serves the checks identically: they look for the
string, not for how random it is. Both files carry a comment saying what the line
used to be, what gitleaks said about it, and why a dull value is the right one.

After the change: 45 Deno tests pass (exit 0), 55 selftest cases, 0 wrong (exit 0),
and the commit goes through. **No guard file was edited, no hook was skipped, and
the commit was not retried with the same content.**

---

## 8. Redaction

**Nothing captured from production or staging appears in this file, in the code, or in any issue.**
No log line, API response, error payload or webhook body was captured in this session: nothing was
run against any remote project, by anybody writing this.

**Values replaced: none.** There was nothing to replace, and that is a complete answer (rule 18)
rather than a reassurance.

Three addresses appear in this pull request, and none of them belongs to a real person:

| Where | Value | What it is |
|---|---|---|
| `scripts/staging/build-it-18-invitation-status-checks.mjs`, `INVITE_ADDRESS` | `teamtasks.staging.test+bi18-status@gmail.com` | a plus-address of the staging test mailbox, which `docs/environments.md` and `web/tests/staging.mjs` already publish on purpose. The script still never prints it |
| `supabase/functions/_tests/invitation_status_test.ts`, `MADE_UP_EMAIL` | `invited-nobody@example.com` | `example.com` is reserved by RFC 2606 and cannot belong to anybody |
| the same file, `SERVICE_REPLY` | an invented email-service error quoting that address | written so the disclosure checks have something to look for. It is not a real reply |

The token-shaped and hash-shaped strings in the test file and the staging script are **not
credentials**: nothing issued them, no row holds them, and they exist so that "no token reaches a
response body" is a measured fact rather than a reading of the code. §7 records what happened when the
first versions of two of them looked random enough for gitleaks to refuse the commit.

---

## 9. The issues filed with this change

| | What |
|---|---|
| [#167](https://github.com/build-once/team-tasks/issues/167) | CI runs neither of Build it 18 part 2b's two check files |
| [#168](https://github.com/build-once/team-tasks/issues/168) | The 15-minute stale-queued window rests on an Edge Function time limit nobody has read |
| [#169](https://github.com/build-once/team-tasks/issues/169) | The failure code `not_configured` can never be stored, because delivery is decided before any row exists |
| [#170](https://github.com/build-once/team-tasks/issues/170) | A team at the 20-pending limit cannot retry a failed invitation |
| [#171](https://github.com/build-once/team-tasks/issues/171) | Nothing can delete an invitation, so test rows and failed invitations are cleared by hand |
