# Evidence: Build it 20 part 1 — Suggest subtasks, the AI helper

Result: **PASS for everything this session can check. NOTHING IS DEPLOYED, so nothing here
says anything about a running function.**
Date: 2026-10-07
How checked: every command below was run from the repository root on this machine, and its
output is pasted verbatim — captured to a file by a script and embedded, not retyped.
Checked by: Claude Code (assistant), on branch `feat/ai-helper`, from commit `dade326` of
`main` (`Merge pull request #182 from build-once/docs/build-it-20-plan-change`).

Issue: **#183**. It also closes **#179**.

---

## What is NOT proved here, first

Read this before the totals, because the totals are about a program that is not running
anywhere.

- **The function is deployed NOWHERE.** Not staging, not production. No
  `supabase functions deploy` and no `supabase secrets set` has been run from this
  session — rule 19 permits both against staging, and neither was used. There is no entry
  in `evidence/production-log.md` for this work because no production command was run.
- **No request has ever been sent to Anthropic by this project.** Not one. Every test
  below either builds the request and reads it, or hands the code a reply the test wrote
  itself. Nothing has been spent.
- **Whether the Supabase bundler accepts the JSON import is UNVERIFIED.**
  `supabase/functions/suggest-subtasks/index.ts` imports `approved-models.json` with an
  import attribute. `deno check` and `deno test` accept it (below); `supabase functions
  deploy --use-api` bundles server-side and nothing here can run it. If the bundler cannot
  resolve it the deploy fails and nothing is deployed, which is the safe direction — and
  `scripts/staging/build-it-20-ai-checks.mjs` tells "not deployed" apart from "deployed"
  by the body of the 404, so the owner sees which happened.
- **Whether the suggestions are any good is unverified**, because none has ever been
  produced. The tests check that there are between one and five, that each is short plain
  text, and that none claims anything was done.
- **The staging script has never been run against staging.** Only `--selftest`.

---

## 1. The Deno tests over the new function, SEEN TO FAIL FIRST

`supabase/functions/_tests/suggest_subtasks_test.ts`, 85 tests. Issue #183 asks for twelve
named cases plus a thirteenth about what the request carries; the file's header says where
each one is.

### 1a. They pass

```
$ deno test --no-lock --allow-env --config supabase/functions/suggest-subtasks/deno.json supabase/functions/_tests/suggest_subtasks_test.ts

running 85 tests from ./supabase/functions/_tests/suggest_subtasks_test.ts
approved-models.json names exactly one model to use, and the function uses it ... ok (9ms)
chooseModel refuses nought, two, and a nameless entry ... ok (0ms)
the request carries the title and the fixed instructions, and nothing else ... ok (0ms)
A TITLE THAT CONTAINS INSTRUCTIONS is still sent as the title, unchanged ... ok (0ms)
judgeAnthropicStatus: 200: not a failure at all -- the reply still has to be read ... ok (0ms)
judgeAnthropicStatus: 201, which this endpoint does not send, is still not a failure ... ok (0ms)
judgeAnthropicStatus: 401 authentication_error -- A WRONG, REVOKED OR EXPIRED KEY ... ok (0ms)
judgeAnthropicStatus: 402 billing_error: refused ... ok (0ms)
judgeAnthropicStatus: 403 permission_error: refused ... ok (0ms)
judgeAnthropicStatus: 404 not_found_error: refused ... ok (0ms)
judgeAnthropicStatus: 413 request_too_large: refused ... ok (0ms)
judgeAnthropicStatus: 429 RATE LIMITED, which is also a tier spend cap ... ok (0ms)
judgeAnthropicStatus: THE SPEND LIMIT: 400, invalid_request_error, and the published opening words ... ok (0ms)
judgeAnthropicStatus: THE WORKSPACE SPEND LIMIT, which is the 5-dollar one on Team Tasks ... ok (0ms)
judgeAnthropicStatus: a 400 that is OUR mistake, not a spend limit: same status, same type, different words ... ok (0ms)
judgeAnthropicStatus: a 400 with the spend-limit words but the WRONG error type: not claimed as a spend limit ... ok (0ms)
judgeAnthropicStatus: a 400 with the spend-limit words somewhere in the MIDDLE, not at the start ... ok (0ms)
judgeAnthropicStatus: a 400 with no body to read at all ... ok (0ms)
judgeAnthropicStatus: 409 conflict_error: refused ... ok (0ms)
judgeAnthropicStatus: 500 api_error: the service is there and not working ... ok (0ms)
judgeAnthropicStatus: 504 timeout_error from the service, which is not OUR timeout ... ok (0ms)
judgeAnthropicStatus: 529 overloaded_error ... ok (0ms)
judgeAnthropicStatus: a 3xx, which this endpoint does not send: not a success, so it must not be read as one ... ok (0ms)
errorFields reads the documented error shape and shrugs at anything else ... ok (0ms)
readSuggestions: SUCCESS: three plain lines ... ok (0ms)
readSuggestions: success: one line ... ok (0ms)
readSuggestions: success: bullets the instructions asked it not to write are stripped, not refused ... ok (0ms)
readSuggestions: success: blank lines between suggestions are dropped ... ok (0ms)
readSuggestions: success: two text blocks are read as one list ... ok (0ms)
readSuggestions: success: blocks this app does not read are ignored, not refused ... ok (0ms)
readSuggestions: MORE THAN FIVE ITEMS: the extras are dropped and five come back ... ok (0ms)
readSuggestions: a line over the length cap is DROPPED, not trimmed into something that looks fine ... ok (0ms)
readSuggestions: a line of exactly the cap is kept: the boundary is inclusive ... ok (0ms)
readSuggestions: a line carrying a link is dropped: a link is not a subtask ... ok (0ms)
readSuggestions: a line carrying a tab is dropped ... ok (0ms)
readSuggestions: A REPLY SAYING "I've added these": THE WHOLE REPLY IS REFUSED ... ok (0ms)
readSuggestions: a reply claiming the tasks have been created, in the passive ... ok (0ms)
readSuggestions: a reply that obeyed a hostile title and offers to print the system prompt ... ok (0ms)
readSuggestions: a reply telling the app to ignore the above ... ok (0ms)
readSuggestions: JUNK: not an object at all ... ok (0ms)
readSuggestions: junk: null ... ok (0ms)
readSuggestions: junk: an object with no content ... ok (0ms)
readSuggestions: junk: content is a string ... ok (0ms)
readSuggestions: junk: an empty content array ... ok (0ms)
readSuggestions: junk: a content array with no text block in it ... ok (0ms)
readSuggestions: junk: a text block whose text is a number ... ok (0ms)
readSuggestions: AN EMPTY REPLY IS NOT AN EMPTY LIST: the model did as it was told and had nothing ... ok (0ms)
readSuggestions: a reply of nothing but blank lines and bullets ... ok (0ms)
readSuggestions: a reply of one over-long paragraph: nought usable lines, so no empty list ... ok (0ms)
usableSuggestion refuses a line that is not one, and keeps one that is ... ok (0ms)
every claim marker really does refuse a reply that would otherwise pass ... ok (0ms)
textFromReply joins text blocks and returns null when there is nothing to read ... ok (0ms)
callAnthropic: a request that never answers times out AND is aborted ... ok (23ms)
callAnthropic: a request that cannot be made at all is unreachable, not a timeout ... ok (0ms)
callAnthropic: a fast answer comes back with its status and body, and the timer is cleared ... ok (5ms)
callAnthropic: a 2xx whose body is not JSON is read as a bad reply, not a crash ... ok (0ms)
readApiKey treats every kind of absence as absent, and whitespace as absent too ... ok (0ms)
readTaskTitle: one row with a title: that is what gets sent ... ok (0ms)
readTaskTitle: a title with spaces round it is trimmed ... ok (0ms)
readTaskTitle: NOUGHT ROWS: the task does not exist, or it is not this person's to see, and this function cannot and must not tell which ... ok (0ms)
readTaskTitle: the read FAILED: an unknown, which must not be answered as 'no such task' ... ok (0ms)
readTaskTitle: the read failed with no code ... ok (0ms)
readTaskTitle: the read threw ... ok (0ms)
readTaskTitle: the read's promise rejected ... ok (0ms)
readTaskTitle: no error and no list either: an unanswered question, not an empty one ... ok (0ms)
readTaskTitle: a row with no title ... ok (0ms)
readTaskTitle: a row whose title is a number ... ok (0ms)
readTaskTitle: a row whose title is only spaces ... ok (0ms)
readTaskTitle: a title longer than this database can hold: refused rather than sent, because the request is paid for by the character ... ok (0ms)
readTaskTitle: a title of exactly the limit: sent, because the database allows it ... ok (0ms)
the 404 for a task you cannot see says nothing about the task at all ... ok (0ms)
checkSuspension: no row: not suspended, so the call may go ahead ... ok (0ms)
checkSuspension: A ROW: SUSPENDED, so no title leaves and no money is spent ... ok (0ms)
checkSuspension: THE READ FAILED: fail CLOSED. An unknown is not a 'no row' ... ok (0ms)
checkSuspension: the read threw: still closed ... ok (0ms)
checkSuspension: no error and no array: still closed ... ok (0ms)
the suspended refusal is the same 403 the other doors send ... ok (0ms)
every code produces the SAME sentence and the same status, and carries its own code ... ok (0ms)
the success answer carries the suggestions and nothing else ... ok (0ms)
beginCall refuses a second call and endCall lets the next one through ... ok (0ms)
endCall on somebody who has no call in flight is harmless ... ok (0ms)
the reply checks REFUSE a reader that passes a claim straight through ... ok (0ms)
the request checks REFUSE a builder that helpfully attaches who asked ... ok (0ms)
the status checks REFUSE a judge that cannot see a spend limit ... ok (0ms)
the timeout check REFUSES a timer that gives up without aborting ... ok (28ms)

ok | 85 passed | 0 failed (96ms)

Check supabase/functions/_tests/suggest_subtasks_test.ts

exit code: 0
```

### 1b. They can fail — six plausible mistakes, one at a time

This is the part that makes 1a worth anything. A script copied the real function aside,
applied one mistake, ran the test file, recorded what failed, and put the function back —
checking the SHA-256 after each one, so the repository cannot be left holding a broken
function.

Each break is something a reasonable person would write. The first is the one this whole
feature turns on: strip the claim check and a reply saying "I've added these to your list"
reaches the screen, telling somebody their tasks were created when nothing was.

**One of them walked straight past the tests on the first attempt**, and that is left in
the record below rather than tidied away: break 4, a timer that reports a timeout without
aborting the request. The test hung instead of asserting, so the run reported 52 of 85
tests and no failure at all. A hung test reports nothing. The stub was changed to model
both of a real fetch's endings — cancelled, or answered late — and break 4 is caught in
the run below. The comment on that test now says so.

```
Can the new Deno tests fail? One plausible mistake at a time.

target: supabase/functions/suggest-subtasks/index.ts
sha256 of the real file before any of this: 53f5998ef751c2342d24b13fb06f89563cdf3ea0edb57fcbc5a11b628ccb7e13

==============================================================================
BREAK 1. The claim-marker check is removed, so a reply saying "I've added these" is passed straight through
WHY IT IS PLAUSIBLE: The mistake anybody would make first: take the lines, cap them, return them. Every happy case still passes. The person is told their tasks were created when nothing was.

exit code: 1
summary:   FAILED | 80 passed | 5 failed (118ms)
tests that FAILED (5):
  - readSuggestions: A REPLY SAYING "I've added these": THE WHOLE REPLY IS REFUSED
  - readSuggestions: a reply claiming the tasks have been created, in the passive
  - readSuggestions: a reply that obeyed a hostile title and offers to print the system prompt
  - readSuggestions: a reply telling the app to ignore the above
  - every claim marker really does refuse a reply that would otherwise pass

the first failure's message, as Deno printed it:
  (not found in the output)

restored: sha256 is now 53f5998ef751c2342d24b13fb06f89563cdf3ea0edb57fcbc5a11b628ccb7e13 -- IDENTICAL to before

==============================================================================
BREAK 2. The request carries the asker's user id, as an Anthropic-documented optional header and in a metadata field
WHY IT IS PLAUSIBLE: Added with the best intentions, so the owner can tell whose request a Console entry belongs to. docs/plan.md forbids it in so many words.

exit code: 1
summary:   FAILED | 83 passed | 2 failed (114ms)
tests that FAILED (2):
  - the request carries the title and the fixed instructions, and nothing else
  - the request checks REFUSE a builder that helpfully attaches who asked

the first failure's message, as Deno printed it:
  (not found in the output)

restored: sha256 is now 53f5998ef751c2342d24b13fb06f89563cdf3ea0edb57fcbc5a11b628ccb7e13 -- IDENTICAL to before

==============================================================================
BREAK 3. The spend limit is judged on the status alone, so the 5-dollar ceiling reads as an ordinary refusal
WHY IT IS PLAUSIBLE: A 400 is a 400. This is the obvious reading, and it turns the one failure the owner can act on into the same word as a malformed request.

exit code: 1
summary:   FAILED | 83 passed | 2 failed (112ms)
tests that FAILED (2):
  - judgeAnthropicStatus: THE SPEND LIMIT: 400, invalid_request_error, and the published opening words
  - judgeAnthropicStatus: THE WORKSPACE SPEND LIMIT, which is the 5-dollar one on Team Tasks

the first failure's message, as Deno printed it:
  (not found in the output)

restored: sha256 is now 53f5998ef751c2342d24b13fb06f89563cdf3ea0edb57fcbc5a11b628ccb7e13 -- IDENTICAL to before

==============================================================================
BREAK 4. The timer gives up without aborting, so the request is left running
WHY IT IS PLAUSIBLE: Racing the fetch against a sleep reports a timeout at exactly the right moment and leaves a metered request in flight. Reading only the code would pass it.

exit code: 1
summary:   FAILED | 84 passed | 1 failed (480ms)
tests that FAILED (1):
  - callAnthropic: a request that never answers times out AND is aborted

the first failure's message, as Deno printed it:
  (not found in the output)

restored: sha256 is now 53f5998ef751c2342d24b13fb06f89563cdf3ea0edb57fcbc5a11b628ccb7e13 -- IDENTICAL to before

==============================================================================
BREAK 5. A failed task read is treated as 'no such task', so a database fault is reported as a 404
WHY IT IS PLAUSIBLE: `if (!data?.length) return missing` is one line shorter and sends somebody looking for a task that is sitting right there.

exit code: 1
summary:   FAILED | 82 passed | 3 failed (103ms)
tests that FAILED (3):
  - readTaskTitle: the read FAILED: an unknown, which must not be answered as 'no such task'
  - readTaskTitle: the read failed with no code
  - readTaskTitle: no error and no list either: an unanswered question, not an empty one

the first failure's message, as Deno printed it:
  (not found in the output)

restored: sha256 is now 53f5998ef751c2342d24b13fb06f89563cdf3ea0edb57fcbc5a11b628ccb7e13 -- IDENTICAL to before

==============================================================================
BREAK 6. Nought usable suggestions comes back as an EMPTY LIST rather than a failure
WHY IT IS PLAUSIBLE: An empty array is the natural thing to return from a filter. The screen then draws an empty list as if it were a result, which issue #183 forbids by name.

exit code: 1
summary:   FAILED | 82 passed | 3 failed (99ms)
tests that FAILED (3):
  - readSuggestions: AN EMPTY REPLY IS NOT AN EMPTY LIST: the model did as it was told and had nothing
  - readSuggestions: a reply of nothing but blank lines and bullets
  - readSuggestions: a reply of one over-long paragraph: nought usable lines, so no empty list

the first failure's message, as Deno printed it:
  (not found in the output)

restored: sha256 is now 53f5998ef751c2342d24b13fb06f89563cdf3ea0edb57fcbc5a11b628ccb7e13 -- IDENTICAL to before

==============================================================================
All 6 breaks were caught, and the function was restored byte for byte after each one.
```

### 1c. The whole folder, which is what CI runs

`.github/workflows/ci.yml`'s `functions-test` job names the FOLDER rather than a file —
issue #167's change — so this file was covered the day it was written. Only the floor
moved, from 102 to 187.

```
$ deno test --no-lock --allow-env --allow-read=supabase/migrations --config supabase/functions/create-team/deno.json supabase/functions/_tests

running 62 tests from ./supabase/functions/_tests/invitation_status_test.ts
invitationAnswer: the email went and the row says sent ... ok (17ms)
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
the statuses and the failure codes are the ones the migration allows ... ok (3ms)
codeFromSendResponse: 200 with an id: the email exists ... ok (0ms)
codeFromSendResponse: a 2xx that is not 200, with an id: still a send ... ok (0ms)
codeFromSendResponse: 422 with the service's own complaint: refused, and not one word of it kept ... ok (0ms)
codeFromSendResponse: 401, which is what a wrong key looks like: refused ... ok (0ms)
codeFromSendResponse: 429, rate limited: refused ... ok (0ms)
codeFromSendResponse: 500 from the service: refused ... ok (0ms)
codeFromSendResponse: 200 WITH A BODY THAT IS NOT JSON: nothing can be said to have been sent ... ok (0ms)
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
resetForRetry: the write is pinned to the row's state, not to its id alone ... ok (0ms)
resetForRetry: what it writes is a new token, queued, no code and a fresh expiry ... ok (0ms)
resetForRetry: one row came back: the retry has the row, and the answer is built from it ... ok (0ms)
resetForRetry: NO ROW CAME BACK: another request got there first, which is a lost race and NOT an error ... ok (0ms)
resetForRetry: the write failed with a Postgres code ... ok (0ms)
resetForRetry: the write failed with no code at all ... ok (0ms)
resetForRetry: the write threw ... ok (0ms)
resetForRetry: the write's promise rejected ... ok (0ms)
resetForRetry: no error, but no list of rows either -- an unknown, not a lost race ... ok (0ms)
resetForRetry: two rows, which the primary key makes impossible ... ok (0ms)
resetForRetry: one row, but it came back without the address the answer needs ... ok (0ms)
resetFailureAnswer: a lost race is the 409 'being sent now', not a failure ... ok (0ms)
resetFailureAnswer: a failed write is a 500 carrying its Postgres code ... ok (0ms)
resetFailureAnswer: a failed write with no code is still a 500 ... ok (0ms)
resetFailureAnswer: two rows back is a 500 that names the count ... ok (0ms)
resetFailureAnswer: no list of rows at all is a 500 that says so rather than printing a negative number ... ok (0ms)
the answer checks REFUSE a builder that always says "sent" ... ok (0ms)
the failure checks REFUSE every broken failure answer ... ok (0ms)
the retry-reset checks REFUSE a write that is not a compare-and-set ... ok (0ms)
the retry cases REFUSE a verdict that sends a second email ... ok (0ms)
running 85 tests from ./supabase/functions/_tests/suggest_subtasks_test.ts
approved-models.json names exactly one model to use, and the function uses it ... ok (9ms)
chooseModel refuses nought, two, and a nameless entry ... ok (0ms)
the request carries the title and the fixed instructions, and nothing else ... ok (0ms)
A TITLE THAT CONTAINS INSTRUCTIONS is still sent as the title, unchanged ... ok (0ms)
judgeAnthropicStatus: 200: not a failure at all -- the reply still has to be read ... ok (0ms)
judgeAnthropicStatus: 201, which this endpoint does not send, is still not a failure ... ok (0ms)
judgeAnthropicStatus: 401 authentication_error -- A WRONG, REVOKED OR EXPIRED KEY ... ok (0ms)
judgeAnthropicStatus: 402 billing_error: refused ... ok (0ms)
judgeAnthropicStatus: 403 permission_error: refused ... ok (0ms)
judgeAnthropicStatus: 404 not_found_error: refused ... ok (0ms)
judgeAnthropicStatus: 413 request_too_large: refused ... ok (0ms)
judgeAnthropicStatus: 429 RATE LIMITED, which is also a tier spend cap ... ok (0ms)
judgeAnthropicStatus: THE SPEND LIMIT: 400, invalid_request_error, and the published opening words ... ok (0ms)
judgeAnthropicStatus: THE WORKSPACE SPEND LIMIT, which is the 5-dollar one on Team Tasks ... ok (0ms)
judgeAnthropicStatus: a 400 that is OUR mistake, not a spend limit: same status, same type, different words ... ok (0ms)
judgeAnthropicStatus: a 400 with the spend-limit words but the WRONG error type: not claimed as a spend limit ... ok (0ms)
judgeAnthropicStatus: a 400 with the spend-limit words somewhere in the MIDDLE, not at the start ... ok (0ms)
judgeAnthropicStatus: a 400 with no body to read at all ... ok (0ms)
judgeAnthropicStatus: 409 conflict_error: refused ... ok (0ms)
judgeAnthropicStatus: 500 api_error: the service is there and not working ... ok (0ms)
judgeAnthropicStatus: 504 timeout_error from the service, which is not OUR timeout ... ok (0ms)
judgeAnthropicStatus: 529 overloaded_error ... ok (0ms)
judgeAnthropicStatus: a 3xx, which this endpoint does not send: not a success, so it must not be read as one ... ok (0ms)
errorFields reads the documented error shape and shrugs at anything else ... ok (0ms)
readSuggestions: SUCCESS: three plain lines ... ok (0ms)
readSuggestions: success: one line ... ok (0ms)
readSuggestions: success: bullets the instructions asked it not to write are stripped, not refused ... ok (0ms)
readSuggestions: success: blank lines between suggestions are dropped ... ok (0ms)
readSuggestions: success: two text blocks are read as one list ... ok (0ms)
readSuggestions: success: blocks this app does not read are ignored, not refused ... ok (0ms)
readSuggestions: MORE THAN FIVE ITEMS: the extras are dropped and five come back ... ok (0ms)
readSuggestions: a line over the length cap is DROPPED, not trimmed into something that looks fine ... ok (0ms)
readSuggestions: a line of exactly the cap is kept: the boundary is inclusive ... ok (0ms)
readSuggestions: a line carrying a link is dropped: a link is not a subtask ... ok (0ms)
readSuggestions: a line carrying a tab is dropped ... ok (0ms)
readSuggestions: A REPLY SAYING "I've added these": THE WHOLE REPLY IS REFUSED ... ok (0ms)
readSuggestions: a reply claiming the tasks have been created, in the passive ... ok (0ms)
readSuggestions: a reply that obeyed a hostile title and offers to print the system prompt ... ok (0ms)
readSuggestions: a reply telling the app to ignore the above ... ok (0ms)
readSuggestions: JUNK: not an object at all ... ok (0ms)
readSuggestions: junk: null ... ok (0ms)
readSuggestions: junk: an object with no content ... ok (0ms)
readSuggestions: junk: content is a string ... ok (0ms)
readSuggestions: junk: an empty content array ... ok (0ms)
readSuggestions: junk: a content array with no text block in it ... ok (0ms)
readSuggestions: junk: a text block whose text is a number ... ok (0ms)
readSuggestions: AN EMPTY REPLY IS NOT AN EMPTY LIST: the model did as it was told and had nothing ... ok (0ms)
readSuggestions: a reply of nothing but blank lines and bullets ... ok (0ms)
readSuggestions: a reply of one over-long paragraph: nought usable lines, so no empty list ... ok (0ms)
usableSuggestion refuses a line that is not one, and keeps one that is ... ok (0ms)
every claim marker really does refuse a reply that would otherwise pass ... ok (0ms)
textFromReply joins text blocks and returns null when there is nothing to read ... ok (0ms)
callAnthropic: a request that never answers times out AND is aborted ... ok (25ms)
callAnthropic: a request that cannot be made at all is unreachable, not a timeout ... ok (0ms)
callAnthropic: a fast answer comes back with its status and body, and the timer is cleared ... ok (7ms)
callAnthropic: a 2xx whose body is not JSON is read as a bad reply, not a crash ... ok (0ms)
readApiKey treats every kind of absence as absent, and whitespace as absent too ... ok (0ms)
readTaskTitle: one row with a title: that is what gets sent ... ok (0ms)
readTaskTitle: a title with spaces round it is trimmed ... ok (0ms)
readTaskTitle: NOUGHT ROWS: the task does not exist, or it is not this person's to see, and this function cannot and must not tell which ... ok (0ms)
readTaskTitle: the read FAILED: an unknown, which must not be answered as 'no such task' ... ok (0ms)
readTaskTitle: the read failed with no code ... ok (0ms)
readTaskTitle: the read threw ... ok (0ms)
readTaskTitle: the read's promise rejected ... ok (0ms)
readTaskTitle: no error and no list either: an unanswered question, not an empty one ... ok (0ms)
readTaskTitle: a row with no title ... ok (0ms)
readTaskTitle: a row whose title is a number ... ok (0ms)
readTaskTitle: a row whose title is only spaces ... ok (0ms)
readTaskTitle: a title longer than this database can hold: refused rather than sent, because the request is paid for by the character ... ok (0ms)
readTaskTitle: a title of exactly the limit: sent, because the database allows it ... ok (0ms)
the 404 for a task you cannot see says nothing about the task at all ... ok (1ms)
checkSuspension: no row: not suspended, so the call may go ahead ... ok (0ms)
checkSuspension: A ROW: SUSPENDED, so no title leaves and no money is spent ... ok (0ms)
checkSuspension: THE READ FAILED: fail CLOSED. An unknown is not a 'no row' ... ok (0ms)
checkSuspension: the read threw: still closed ... ok (0ms)
checkSuspension: no error and no array: still closed ... ok (0ms)
the suspended refusal is the same 403 the other doors send ... ok (0ms)
every code produces the SAME sentence and the same status, and carries its own code ... ok (1ms)
the success answer carries the suggestions and nothing else ... ok (0ms)
beginCall refuses a second call and endCall lets the next one through ... ok (0ms)
endCall on somebody who has no call in flight is harmless ... ok (0ms)
the reply checks REFUSE a reader that passes a claim straight through ... ok (0ms)
the request checks REFUSE a builder that helpfully attaches who asked ... ok (0ms)
the status checks REFUSE a judge that cannot see a spend limit ... ok (0ms)
the timeout check REFUSES a timer that gives up without aborting ... ok (23ms)
running 40 tests from ./supabase/functions/_tests/suspension_test.ts
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
invite-member: one row: this person is suspended ... ok (0ms)
invite-member: a row carrying a reason: still refused, and the reason does not come back ... ok (0ms)
invite-member: two rows, which the primary key makes impossible: still refused ... ok (0ms)
invite-member: no rows: this person is not suspended, and everything still works ... ok (0ms)
invite-member: FAIL CLOSED: the read returned an error with a Postgres code ... ok (0ms)
invite-member: FAIL CLOSED: the read returned an error with no code at all ... ok (0ms)
invite-member: FAIL CLOSED: the read threw ... ok (0ms)
invite-member: FAIL CLOSED: the read's promise rejected ... ok (0ms)
invite-member: FAIL CLOSED: no error, but data is null -- an unknown, not an empty list ... ok (0ms)
invite-member: FAIL CLOSED: no error, but data is an object rather than a list ... ok (0ms)
invite-member: FAIL CLOSED: no error, but data is a number ... ok (0ms)
accept-invite: one row: this person is suspended ... ok (0ms)
accept-invite: a row carrying a reason: still refused, and the reason does not come back ... ok (0ms)
accept-invite: two rows, which the primary key makes impossible: still refused ... ok (0ms)
accept-invite: no rows: this person is not suspended, and everything still works ... ok (0ms)
accept-invite: FAIL CLOSED: the read returned an error with a Postgres code ... ok (0ms)
accept-invite: FAIL CLOSED: the read returned an error with no code at all ... ok (0ms)
accept-invite: FAIL CLOSED: the read threw ... ok (0ms)
accept-invite: FAIL CLOSED: the read's promise rejected ... ok (0ms)
accept-invite: FAIL CLOSED: no error, but data is null -- an unknown, not an empty list ... ok (0ms)
accept-invite: FAIL CLOSED: no error, but data is an object rather than a list ... ok (0ms)
accept-invite: FAIL CLOSED: no error, but data is a number ... ok (0ms)
the three functions give the same verdict for every case ... ok (0ms)
the fail-closed cases REFUSE a check that fails open ... ok (0ms)
create-team: the suspended refusal it sends is 403 with the sentence, the code and nothing else ... ok (6ms)
invite-member: the suspended refusal it sends is 403 with the sentence, the code and nothing else ... ok (0ms)
accept-invite: the suspended refusal it sends is 403 with the sentence, the code, the reason and nothing else ... ok (0ms)
the three refusals carry the same sentence and the same code ... ok (0ms)
the body checks REFUSE every broken refusal ... ok (1ms)

ok | 187 passed | 0 failed (526ms)


exit code: 0
```

---

## 2. The CI check on model names, SEEN TO FAIL

`scripts/approved-model-check.mjs`. It fails if any file names a model that is not in
`supabase/functions/suggest-subtasks/approved-models.json`.

### 2a. It passes

```
$ node scripts/approved-model-check.mjs

approved-model-check -- does any file name a model nobody approved?
  repository root: C:\Users\rajdh\team-tasks
  the one file allowed to name a model: supabase\functions\suggest-subtasks\approved-models.json

approved-model-check: can these judgements fail?

  ok    a dated model id is found
  ok    THE UNDATED ALIAS IS FOUND TOO -- it is the moving pointer the plan refuses
  ok    the Amazon Bedrock form is found, prefix and all
  ok    the Google Cloud form, with its @ before the date
  ok    the older order, version before family
  ok    a trailing full stop is punctuation, not part of the name
  ok    upper case is still the same name
  ok    the same name twice is one name
  ok    NOT A MODEL: claude-code-action, which is in six workflow files here
  ok    NOT A MODEL: claude-pr
  ok    NOT A MODEL: claude-github-actions-1790855283132, which DOES contain digits
  ok    NOT A MODEL: claude-execution-output.json
  ok    NOT A MODEL: a .claude directory path
  ok    NOT A MODEL: the words a person writes, with spaces
  ok    NOT A MODEL: the tail of a longer word
  ok    a good file: one entry, a name, a date, marked for use
  ok    a file with no approved array at all
  ok    AN EMPTY LIST: nothing is approved, and that is a problem rather than a quiet pass
  ok    TWO entries marked for use -- array order is not an approval
  ok    nothing marked for use: the function would refuse to send, so this says so first
  ok    NO DATE, which issue #183 asks for by name
  ok    a date that is not a date
  ok    an entry with a date and no model name
  ok    a model name that is not shaped like one, so nothing could ever match it
  ok    a good file still lists its approved name, lower-cased
  ok    a record: an evidence file is exempt
  ok    a record: nested under evidence/
  ok    NOT a record: docs/, which is read by people and quoted into code
  ok    NOT a record: a script
  ok    NOT a record: a staging script
  ok    NOT a record: the function itself
  ok    NOT a record: a test file
  ok    NOT a record: a workflow
  ok    NOT a record: anything in the web app
  ok    NOT a record: a file whose name merely STARTS with the word evidence
  ok    NOT a record: evidence/ somewhere in the middle of a path
  ok    the record list is exactly one directory
  ok    AN UNAPPROVED NAME IN A FILE IS CAUGHT -- the alias beside the approved id
  ok    the approved name in a file is not caught

39 logic cases, 0 wrong.

PASS the judgements can fail: all 39 logic cases behaved as described, including the four strings already in this repository that look like models and are not, and the undated alias, which must be caught
PASS supabase\functions\suggest-subtasks\approved-models.json exists and parses as JSON
PASS supabase\functions\suggest-subtasks\approved-models.json approves 1 model name(s), each with the date it was approved, and exactly one is marked for use
PASS 251 text files were read, of which 2 name a model at all
PASS 7 unapproved model name(s) appear in 1 file(s) under evidence/, and are ALLOWED there: those files record what a command printed on a given day, and this check's own failure output names the model it refused. Nothing reads a model name from them. The files: evidence/build-it-20-ai-helper.md
PASS no file names a model that is not in supabase\functions\suggest-subtasks\approved-models.json. The approved name lives in that one file, so changing which model this app sends a task title to is a one-line edit a reviewer cannot miss

Totals: 6 PASS, 0 FAIL.

exit code: 0
```

### 2b. It caught ITSELF twice, before anything was planted

Worth recording because neither was planned, and because each one was the check doing its
job on the author.

**First, on its own comments.** The first run ever failed on **four** model names — in this
script's own explanatory comments, where the shape of a model id was spelled out with real
examples:

```
PASS 248 text files were read, of which 2 name a model at all
FAIL scripts/approved-model-check.mjs names the model "claude-opus-5-5", which is not approved. ...
FAIL scripts/approved-model-check.mjs names the model "claude-3-5-sonnet-20241022", which is not approved. ...
FAIL scripts/approved-model-check.mjs names the model "claude-haiku-4-5", which is not approved. ...
FAIL scripts/approved-model-check.mjs names the model "claude-haiku-4-5@20251001", which is not approved. ...

Totals: 4 PASS, 4 FAIL.
```

The comments were rewritten to use placeholders — `claude-<family>-<version>-<date>` — and
the selftest fixtures are assembled from pieces at runtime, so the file contains no
model-shaped literal and can be scanned like every other. The same trick
`invitation_status_test.ts` uses to keep a token-shaped fixture past gitleaks.

**Then, on THIS EVIDENCE FILE.** Once section 2b above existed, the check failed again,
seven times — because an evidence file that faithfully quotes this check's failure output
necessarily quotes the model names it refused, and section 9's fixture table names the
composed ones:

```
PASS 251 text files were read, of which 2 name a model at all
FAIL evidence/build-it-20-ai-helper.md names the model "claude-opus-5-5", which is not approved. ...
FAIL evidence/build-it-20-ai-helper.md names the model "claude-3-5-sonnet-20241022", which is not approved. ...
FAIL evidence/build-it-20-ai-helper.md names the model "claude-haiku-4-5", which is not approved. ...
FAIL evidence/build-it-20-ai-helper.md names the model "claude-haiku-4-5@20251001", which is not approved. ...
FAIL evidence/build-it-20-ai-helper.md names the model "claude-opus-4-1-20250805", which is not approved. ...
FAIL evidence/build-it-20-ai-helper.md names the model "claude-sonnet-3-7", which is not approved. ...
FAIL evidence/build-it-20-ai-helper.md names the model "claude-haiku-4-5-20991231", which is not approved. ...

Totals: 4 PASS, 7 FAIL.
```

That is a real tension and the two ways out were both bad: no evidence that this check can
ever fail, or evidence edited to pass a check. So `evidence/` became an **exemption that is
reported out loud on every run** — names there are counted, the files listed, and the
reason printed — on the grounds that nothing reads a model name from an evidence file, and
that issue #179 already settled the same question about `evidence/build-it-18-sentry.md`:
"a dated record of what was true on the day the check was run and should **not** be
rewritten."

**The exemption has its own selftest cases, twelve of them**, because an exemption tested
only by the directory it was written for is one that grows a `docs/` the next time one is
inconvenient. `docs/`, `scripts/`, `scripts/staging/`, the function, the test file, the
workflow, `web/`, a file merely *named* `evidence-notes.md`, and `docs/evidence/plan.md`
must all be refused the exemption, and `RECORD_DIRECTORIES` must be exactly one directory.
That is why the logic-case count went from 27 to 39.

### 2c. And it fails on a planted name, three ways

The first case is the one `docs/plan.md` actually worries about: the **undated alias** of
the approved model. Two characters' difference, and a moving pointer rather than a pinned
snapshot. The planted file is deleted in a `finally`, and the check is shown green again
afterwards.

```
Seen to fail: the approved-model check, against a file that names a model nobody approved.

the planted file: docs/SCRATCH-model-check-demo.md (created, then deleted)

==============================================================================
PLANTED: THE UNDATED ALIAS of the approved model, in a document -- the two-character difference docs/plan.md pins the dated name to avoid

exit code: 1
Totals: 5 PASS, 1 FAIL.
FAIL docs/SCRATCH-model-check-demo.md names the model "claude-haiku-4-5", which is not approved. Either add it to supabase\functions\suggest-subtasks\approved-models.json with the date and who agreed to it, or take it out of that file. If it is the undated alias of an approved id, taking it out is the answer: docs/plan.md pins the dated name on purpose, "so the model cannot change under the app without somebody editing a line"

==============================================================================
PLANTED: a different model entirely, in a code-shaped line

exit code: 1
Totals: 5 PASS, 1 FAIL.
FAIL docs/SCRATCH-model-check-demo.md names the model "claude-opus-4-1-20250805", which is not approved. Either add it to supabase\functions\suggest-subtasks\approved-models.json with the date and who agreed to it, or take it out of that file. If it is the undated alias of an approved id, taking it out is the answer: docs/plan.md pins the dated name on purpose, "so the model cannot change under the app without somebody editing a line"

==============================================================================
PLANTED: the Amazon Bedrock form of an unapproved model

exit code: 1
Totals: 5 PASS, 1 FAIL.
FAIL docs/SCRATCH-model-check-demo.md names the model "claude-sonnet-3-7", which is not approved. Either add it to supabase\functions\suggest-subtasks\approved-models.json with the date and who agreed to it, or take it out of that file. If it is the undated alias of an approved id, taking it out is the answer: docs/plan.md pins the dated name on purpose, "so the model cannot change under the app without somebody editing a line"

==============================================================================
the planted file is gone: true

with nothing planted, the same command again:
exit code: 0
  PASS the judgements can fail: all 39 logic cases behaved as described, including the four strings already in this repository that look like models and are not, and the undated alias, which must be caught
  PASS supabase\functions\suggest-subtasks\approved-models.json exists and parses as JSON
  PASS supabase\functions\suggest-subtasks\approved-models.json approves 1 model name(s), each with the date it was approved, and exactly one is marked for use
  PASS 251 text files were read, of which 2 name a model at all
  PASS 7 unapproved model name(s) appear in 1 file(s) under evidence/, and are ALLOWED there: those files record what a command printed on a given day, and this check's own failure output names the model it refused. Nothing reads a model name from them. The files: evidence/build-it-20-ai-helper.md
  PASS no file names a model that is not in supabase\functions\suggest-subtasks\approved-models.json. The approved name lives in that one file, so changing which model this app sends a task title to is a one-line edit a reviewer cannot miss
  Totals: 6 PASS, 0 FAIL.

Every planted name was caught, and the check is green again with none planted.
```

---

## 3. The staging checks script's self-test

`scripts/staging/build-it-20-ai-checks.mjs --selftest`. 64 cases. Nothing is sent anywhere
and no account is used: the `--selftest` branch returns before a setting is read, which is
why CI can run it with no secret.

```
$ node scripts/staging/build-it-20-ai-checks.mjs --selftest

build-it-20-ai-checks --selftest: can these checks fail?

Each case is something this script might be handed: a URL from
web/.env.local, an answer from suggest-subtasks, or a row read back.
The expectation is what the judgement must say about it. Nothing is
sent anywhere and no account is used.

  ok    the staging URL itself
          expected PASS; got PASS
  ok    NOT STAGING, and it contains the staging reference -- the coach's stand-in server
          expected FAIL; got FAIL
  ok    NOT STAGING: the staging host as the start of a longer domain
          expected FAIL; got FAIL
  ok    NOT STAGING: the staging host as a URL user name, so the host is example.com
          expected FAIL; got FAIL
  ok    NOT STAGING: the right host over plain http
          expected FAIL; got FAIL
  ok    NOT STAGING: the right host on another port
          expected FAIL; got FAIL
  ok    not a URL at all: the bare reference
          expected FAIL; got FAIL
  ok    the control holds: Alice created one personal task
          expected PASS; got PASS
  ok    THE CONTROL IS BROKEN: no row came back, so there is nothing to ask about
          expected FAIL; got FAIL
  ok    the control proves nothing: the insert could not be made at all
          expected UNVERIFIED; got UNVERIFIED
  ok    the control fails: the stored title is not the one sent
          expected FAIL; got FAIL
  ok    the control fails: the task landed in a team, so this run would touch a shared list
          expected FAIL; got FAIL
  ok    THE FUNCTION IS NOT DEPLOYED: the platform's 404, which is what the before-run meets
          expected FAIL; got FAIL
  ok    the function's OWN 404 is not the platform's: the request reached the handler
          expected PASS; got PASS
  ok    a 503 from the function means it is deployed
          expected PASS; got PASS
  ok    a 200 means it is deployed
          expected PASS; got PASS
  ok    SUCCESS: three short suggestions
          expected PASS, PASS, PASS, PASS; got PASS, PASS, PASS, PASS
  ok    success: exactly five
          expected PASS, PASS, PASS, PASS; got PASS, PASS, PASS, PASS
  ok    SIX SUGGESTIONS: over the cap, so the function did not filter
          expected FAIL, PASS, PASS, PASS; got FAIL, PASS, PASS, PASS
  ok    A SUGGESTION OVER THE LENGTH CAP got through
          expected PASS, FAIL, PASS, PASS; got PASS, FAIL, PASS, PASS
  ok    A SUGGESTION CARRYING A LINK got through
          expected PASS, FAIL, PASS, PASS; got PASS, FAIL, PASS, PASS
  ok    A SUGGESTION CLAIMING "I've added these" got through
          expected PASS, PASS, FAIL, PASS; got PASS, PASS, FAIL, PASS
  ok    AN EMPTY LIST with HTTP 200: not a result, and the function should have said so
          expected FAIL; got FAIL
  ok    HTTP 200 with no suggestions field at all
          expected FAIL; got FAIL
  ok    HTTP 200 carrying fields it should not
          expected PASS, PASS, PASS, FAIL; got PASS, PASS, PASS, FAIL
  ok    NO KEY: the fixed failure with not_configured. The answer is right; the question is unanswered
          expected PASS, UNVERIFIED; got PASS, UNVERIFIED
  ok    another code: the answer is still right, and still settles nothing
          expected PASS, UNVERIFIED; got PASS, UNVERIFIED
  ok    A 503 WITH THE WRONG SENTENCE: the function is not saying what it is supposed to
          expected FAIL, UNVERIFIED; got FAIL, UNVERIFIED
  ok    A 503 WITH A CODE THAT IS NOT ON THE LIST
          expected FAIL, UNVERIFIED; got FAIL, UNVERIFIED
  ok    A 503 CARRYING THE SERVICE'S OWN REPLY in a third field
          expected FAIL, UNVERIFIED; got FAIL, UNVERIFIED
  ok    A 404 FOR ALICE'S OWN TASK: the caller-rights read is going wrong
          expected FAIL; got FAIL
  ok    a body that is not JSON at all
          expected FAIL; got FAIL
  ok    the ask never arrived, so nothing is settled
          expected UNVERIFIED; got UNVERIFIED
  ok    both 404, byte for byte identical: a stranger learns nothing
          expected PASS, PASS, PASS; got PASS, PASS, PASS
  ok    THE TWO BODIES DIFFER: a stranger can sort the real task ids from the invented ones
          expected PASS, FAIL, FAIL; got PASS, FAIL, FAIL
  ok    BOB GOT SUGGESTIONS FOR ALICE'S TASK -- the worst outcome this feature has
          expected FAIL, FAIL, FAIL; got FAIL, FAIL, FAIL
  ok    the 404's sentence explains why, which is how a task id is confirmed
          expected PASS, PASS, FAIL; got PASS, PASS, FAIL
  ok    Bob's ask never arrived, so nothing is settled
          expected UNVERIFIED; got UNVERIFIED
  ok    a task id that is not a uuid: 400
          expected PASS; got PASS
  ok    A NON-UUID THAT REACHED THE DATABASE: 500, so the shape check is not running first
          expected FAIL; got FAIL
  ok    the platform refuses a signed-out POST
          expected PASS; got PASS
  ok    A 401 FROM THE FUNCTION'S OWN CODE: the request reached the handler, so verify_jwt is off
          expected FAIL; got FAIL
  ok    A SIGNED-OUT CALL GOT SUGGESTIONS: a live hole, and one that spends money
          expected FAIL; got FAIL
  ok    the lock engaged: one of the two was refused with busy
          expected PASS; got PASS
  ok    the lock did not engage, which is the documented limit rather than a fault
          expected PASS; got PASS
  ok    ONE OF THE TWO ANSWERED SOMETHING THIS FUNCTION MAY NOT SEND
          expected FAIL; got FAIL
  ok    the task was deleted and reading it back finds nothing
          expected PASS, PASS; got PASS, PASS
  ok    THE DELETE TOUCHED NO ROW: staging is left holding this run's task
          expected FAIL, FAIL; got FAIL, FAIL
  ok    the delete reported success and the row is still there
          expected PASS, FAIL; got PASS, FAIL
  ok    nothing leaked: a body with none of them in it
          expected PASS; got PASS
  ok    A BODY CARRYING THE TASK'S TITLE
          expected FAIL; got FAIL
  ok    A BODY CARRYING AN EMAIL ADDRESS
          expected FAIL; got FAIL
  ok    A BODY CARRYING THE SERVICE'S OWN WORDS
          expected FAIL; got FAIL
  ok    A BODY NAMING THE KEY SETTING
          expected FAIL; got FAIL
  ok    only the four endpoints, one task created and one deleted
          expected PASS; got PASS
  ok    IT READ account_status, which nothing may read through the app
          expected FAIL; got FAIL
  ok    IT CALLED ANOTHER FUNCTION
          expected FAIL; got FAIL
  ok    IT CREATED A TASK AND NEVER DELETED ONE: staging is left dirty
          expected FAIL; got FAIL
  ok    IT CREATED TWO TASKS
          expected FAIL; got FAIL
  ok    IT SIGNED OUT GLOBALLY, which would end the owner's own browser session
          expected FAIL; got FAIL
  ok    a token echoed back in a body is replaced
          expected PASS; got PASS
  ok    the task's title echoed back is replaced
          expected PASS; got PASS
  ok    NOTHING REGISTERED: the title comes straight back out
          expected FAIL; got FAIL
  ok    a scrub case that proves nothing: the value is not in the text at all
          expected UNVERIFIED; got UNVERIFIED

64 cases, 0 wrong.

Every judgement said FAIL to a function that is not deployed, to six
suggestions where five are allowed, to a suggestion carrying a link, to
one claiming the subtasks were added, to an empty list dressed as a
result, to a stranger getting a different 404 from a made-up id, to a
signed-out caller getting suggestions, and to a run that left its own
task behind. That is what would make a green staging run mean something.
It is NOT itself a staging result: nothing was sent anywhere by this run.

exit code: 0
```

---

## 4. The workflow lint, after the CI changes

```
$ node scripts/check-workflows.mjs

Checked 4 workflow file(s), 20 job(s): 0 problem(s), 0 warning(s).

exit code: 0
```

---

## 5. The web app: lint and build

```
$ cd web && npm run lint

> web@0.1.0 lint
> eslint

```

Clean, no output. The build, with the same three placeholder settings `ci.yml`'s
`app-build` job uses — none of them real, and all three public in any case:

```
$ NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... NEXT_PUBLIC_SENTRY_DSN=... npm run build

> web@0.1.0 build
> next build

▲ Next.js 16.3.6 (Turbopack)
✓ Compiled successfully in 3.2s
  Running TypeScript ...
  Finished TypeScript in 5.4s ...
✓ Generating static pages using 15 workers (13/13) in 2.3s

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
```

---

## 6. Every CI count, measured against its floor

Run on this machine, now. A floor, not an equality: adding checks must not fail a job, and
a run that checked fewer things than it used to has lost coverage.

```
$ node -e "<run each pure-check script and count its PASS lines>"
tasks-filter-check     exit 0   PASS 47   FAIL 0   floor 47 OK
password-reset-check   exit 0   PASS 84   FAIL 0   floor 84 OK
sentry-scrub-check     exit 0   PASS 95   FAIL 0   floor 95 OK
screen-state-check     exit 0   PASS 110  FAIL 0   floor 110 OK
friendly-words-check   exit 0   PASS 45   FAIL 0   floor 45 OK
approved-model-check   exit 0   PASS 6    FAIL 0   floor 6 OK
```

```
$ node -e "<run each staging script's --selftest and count its ok lines>"
build-it-16-checks                     exit 0   ok 39   WRONG 0   floor 39 OK
build-it-16-suspend-checks             exit 0   ok 40   WRONG 0   floor 40 OK
build-it-18-invitation-status-checks   exit 0   ok 57   WRONG 0   floor 57 OK
build-it-20-ai-checks                  exit 0   ok 64   WRONG 0   floor 64 OK
```

The two numbers that MOVED, and nothing else in `ci.yml` changed except comments and the
two new `run_and_count` lines:

| Floor | Was | Now | Why |
|---|---|---|---|
| `EXPECTED_FUNCTION_TESTS` | 102 | 187 | 85 new Deno tests, picked up because the job names the folder |
| `EXPECTED_APPROVED_MODEL_CHECKS` | — | 6 | new |
| `EXPECTED_AI_CASES` | — | 64 | new |

**No floor was lowered, no assertion loosened, and no existing test file was edited.**
`suspension_test.ts` was deliberately left exactly as it is (rule 20): the new function has
a fourth copy of `checkSuspension`, and rather than change that file, the new test file
imports create-team's copy and asserts the two agree on every case. That file's prose still
says "the three functions"; **issue #187** holds it.

### Issues filed with this change

| | What |
|---|---|
| [#184](https://github.com/build-once/team-tasks/issues/184) | The AI helper asks again on every reload, and nothing counts the asks |
| [#185](https://github.com/build-once/team-tasks/issues/185) | The approved model's published retirement floor is eight days after it was approved |
| [#186](https://github.com/build-once/team-tasks/issues/186) | "One call at a time per person" is per isolate, so it is a courtesy and not a control |
| [#187](https://github.com/build-once/team-tasks/issues/187) | `suspension_test.ts` says "the three functions" and there are now four doors |
| [#188](https://github.com/build-once/team-tasks/issues/188) | Unverified: whether the Supabase bundler accepts the JSON import in suggest-subtasks |
| [#189](https://github.com/build-once/team-tasks/issues/189) | The claim-marker list refuses some legitimate suggestions, and nothing counts how often |

---

## 7. The root test suite

```
$ npm test
PASS: 537 rule examples across 24 rules, plus 32 fail-closed checks.
lint-skills: PASS - 12 skills, 0 problems
Self-test: 7/7 cases passed.
Checked 4 workflow file(s), 20 job(s): 0 problem(s), 0 warning(s).
Self-test: 20/20 cases passed.
AI team self-test: 258 passed, 0 failed.
Checked 6 workflow file(s), 14 job(s): 0 problem(s), 0 warning(s).
```

Exit 0.

---

## 8. Where the model name came from

`docs/plan.md` said: "**To be confirmed by the owner — Claude Haiku 4.5's exact dated API
name.** It is to be read off Anthropic's models page and pinned in the code pull request.
No name is written here from memory."

**The owner's message in this session carried the unfilled placeholder**
`<name from Anthropic's models page>` rather than a name. That was flagged before any code
was written, and the owner chose "read it off the models page now". So it was read, not
remembered:

- Page: <https://platform.claude.com/docs/en/about-claude/models/overview>, read 2026-10-07.
- The **Claude API ID** row, under the **Claude Haiku 4.5** column:
  `claude-haiku-4-5-20251001`.
- The **Claude API alias** row gives the undated form. It is **deliberately not written
  anywhere in this repository**, including in `approved-models.json`, because the page
  describes an alias of this generation as "a convenience pointer that resolves to the
  dated ID" — the moving part `docs/plan.md` refuses. `approved-model-check.mjs` would flag
  it, and §2c shows it doing so.

**One thing the owner should read on that page, which is why an issue is filed about it.**
The same column's **Retirement** row says **"Not sooner than October 15, 2026"**. That is
**eight days** after the approval date. It is recorded in `approved-models.json` beside the
approval rather than argued with — the model is the owner's choice — but nobody should meet
a dead model and go looking for a bug.

---

## 9. What was captured from production, and redacted

**Nothing.** No production log line, API response, error payload, webhook body, support
example or test fixture was captured from production or from any running system, because
nothing is running. Rule 18's list is therefore empty, and that is a complete answer.

Every value in every test and script here is invented. For the record, the made-up ones
that look real:

| Looks like | What it actually is |
|---|---|
| `a1b2c3d4-0001-4e5f-8a9b-0c1d2e3f4a5b` and friends | uuids typed out by hand, issued by nothing |
| `nobody-at-all@example.com`, `invited-nobody@example.com` | `example.com` addresses, which belong to nobody by RFC |
| `not-a-real-api-key-zzzz…` | 24 repeated characters. Built to be dull on purpose: a realistic blob is what `.githooks/pre-commit` refuses, gitleaks reporting `generic-api-key` on entropy |
| `claude-haiku-4-5-20991231` and the other fixtures in `approved-model-check.mjs` | assembled from pieces at runtime, so the file contains no model-shaped literal; the date is in 2099 and names nothing |
| `00000000-0000-4000-8000-000000000001` | the "made-up task id" the staging script asks about. Fixed rather than random, so two runs are comparable |
