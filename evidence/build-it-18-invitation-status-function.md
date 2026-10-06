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
| The pure decisions and response bodies the function builds | **PASS** — 62 Deno tests, exit 0 | §1 |
| Those tests fail against a function that lies | **PASS** — 4 of them, exit 1 | §2 |
| Two Try again presses at once do not both send | **PASS** — a compare-and-set, 16 tests, seen to fail first | §2a |
| The staging script's own judgements can fail | **PASS** — 57 cases, exit 0 | §3 |
| Both new check files now run in CI | **PASS** — CI counted 102 and 57 against those floors, run 37507349936 | §3a |
| The web app compiles, lints and builds | **PASS** — exit 0 both | §4 |
| The repository's own suite | **PASS** — exit 0 | §4 |
| The deployed function writes the status | **UNVERIFIED** — nothing is deployed | §5 |
| What the owner actually sees on staging | **UNVERIFIED** — nothing is deployed | §5 |
| The `failed` path, end to end | **UNVERIFIED** — it cannot be brought about from a script | §5 |
| Two retries racing **against a real database** | **UNVERIFIED** — the filter is proved, the race is not run | §2a |

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
running 62 tests from ./supabase/functions/_tests/invitation_status_test.ts
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

ok | 62 passed | 0 failed (47ms)
```

**The 17 `resetForRetry` / `resetFailureAnswer` / compare-and-set lines arrived after
the coach's review of this pull request**, and §2a records them separately: what they
are for, the run where two of them failed first, and what changed to make them pass.
Everything above them is from the first commit.

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
command again: **`ok | 45 passed | 0 failed`, exit 0** — 45 being the count at the time,
before the 17 lines §2a added.

---

## 2a. The coach's point 1 — the retry is a compare-and-set, seen to fail first

The coach's review of PR #172 asked for this, and it is a real defect rather than a
tidiness note:

> The reset `update … where id = …` does not check that the row is still in the
> state the verdict was made on. Two Try again requests at once both pass, both
> rotate the token and both send; the first email's link is dead on arrival.

**Why it is worse than two emails.** The token is rotated by each write, and only its
SHA-256 hash is stored. So the second write replaces the hash the first email's link
points at — and that first link is the older message, the one at the top of a
threaded inbox, the one the invited person is most likely to open. It opens nothing.

### What was done, in the order it was done

**Step 1 — a behaviour-preserving extraction.** The reset step was lifted out of the
handler into `resetForRetry`, which takes the write **as a function that performs
it** — the same shape `checkSuspension` uses, and for the same two reasons: a test
can hand it a write that touches no row, with no database, key or network; and the
query stays written out at the call site. The filter was left exactly as it was,
`{ id }` alone, and zero rows kept answering as "unexpected" → 500. Nothing changed:

```
ok | 45 passed | 0 failed (51ms)        exit 0
```

**Step 2 — the tests, run against that.** 16 new tests. Two of them failed, and they
failed naming the defect rather than a symptom:

```
resetForRetry: the write is pinned to the row's state, not to its id alone ... FAILED (0ms)
resetForRetry: NO ROW CAME BACK: another request got there first, which is a lost race and NOT an error ... FAILED (0ms)

error: Error: the retry's filter is wrong: the filter pins id -- expected id,
status and expires_at. Pinned on the id alone, two Try again presses both succeed
and the first email's link is dead on arrival; filter.status is undefined,
expected the row's own "failed"; filter.expires_at is undefined, expected the
row's own "2026-10-09T09:00:00.000Z" -- which is the version, because it is
replaced on every retry even when the status is not

error: Error: resetForRetry answered {"ok":false,"why":"unexpected","rows":0},
expected {"ok":false,"why":"lost"} -- for "NO ROW CAME BACK: another request got
there first, which is a lost race and NOT an error"

FAILED | 59 passed | 2 failed (52ms)
```

**exit 1.** 59 of the 61 passed — the two failures are the two halves of the coach's
point and nothing else.

**Step 3 — the change.** The row's own `status` and `expires_at` joined `id` in the
filter, and zero rows became its own verdict:

```
ok | 62 passed | 0 failed (47ms)        exit 0
```

(62 rather than 61 because a seventh "can these tests fail?" case was added after
the fix — see below.)

### Why `expires_at` and not status alone

The case nobody thinks of: a **stale `queued`** row retried is written back as
`queued`. The status does not change, so a filter on status alone would let the
second request straight through. `expires_at` is replaced on every retry without
exception, which is what makes it a version. That is the coach's own reasoning and
the test asserts it with that sentence in the failure message.

### How the filter is proved to reach the database

A test can read what `resetForRetry` *produces*; it cannot see `.eq()` calls at the
call site. So `RetryFilter` is a **map**, and the handler applies every entry in a
loop:

```ts
apply: (patch, filter) => {
  let write = ctx.supabaseAdmin.from("invitations").update(patch);
  for (const [column, value] of Object.entries(filter)) {
    write = write.eq(column, value);
  }
  return write.select("id, email, expires_at, status");
},
```

A field named in the filter therefore cannot be left unapplied by somebody adding one
and forgetting a line. `deno check` accepts the loop (exit 0), which was not a
foregone conclusion — this repository has hit TS2589 on the generated client's
generics before.

### The one way this could have failed silently, and why it does not

Filtering on a `timestamptz` means putting a value like `2026-10-13T09:00:00+00:00`
into a query string — and **an unencoded `+` in a query string means a space**. If the
client did not encode it, PostgREST would receive `09:00:00 00:00`, the filter would
match nothing, and **every retry would report "that invitation is being sent now" and
never send anything**. A compare-and-set that always loses is worse than no
compare-and-set: the button would be dead and the tests above would all still pass,
because none of them goes near a URL.

So it was measured rather than assumed. `.eq()` is
`this.url.searchParams.append(column, \`eq.${value}\`)` —
`web/node_modules/@supabase/postgrest-js/dist/index.cjs:1542` — and `URLSearchParams`
percent-encodes:

```
node -e "const u=new URL('https://x.example/rest/v1/invitations'); u.searchParams.append('expires_at','eq.2026-10-13T09:00:00+00:00'); console.log(u.toString())"

https://x.example/rest/v1/invitations?expires_at=eq.2026-10-13T09%3A00%3A00%2B00%3A00
```

`%2B` is a literal `+`, so the offset survives and equality on `timestamptz` compares
instants rather than text.

**The limit of that check, stated rather than glossed:** the copy read is the one
installed under `web/node_modules`, for the app. The Edge Function resolves
`@supabase/server` from npm inside Deno, which is a different copy and was not read —
`searchParams.append` is long-standing in that library, but "the deployed function's
client encodes it the same way" is **unverified**, and the staging run is what would
show it. A retry that answers "being sent now" on a row nobody else is touching is the
symptom to watch for.

### What the 16 tests cover

| | |
|---|---|
| the filter pins id, status **and** expires_at, each read off the row | 1 |
| the patch rotates the token, queues it, clears the code, moves the expiry, and writes nothing else — `created_at` in particular | 1 |
| one row back → the retry has it; **zero rows → lost**, not an error; an error with a code; an error with none; a thrown write; a rejected promise; no list of rows; two rows; one row missing the address | 9 |
| a lost race is answered with the 409 "being sent now", carrying the insert's 23505, and **the same sentence** a recently-queued invitation gets — compared against `stillSendingAnswer`'s own body, so one fact cannot grow two wordings | 1 |
| the three failure answers: a 500 with its Postgres code, a 500 with none, and two that name the count; all four say "nothing was sent", and none leaks an address, a token or a hash | 4 |

### And it stays caught

The fail-first run is a moment; a test is forever. A seventh case was added to the
file's "can these tests fail?" section: a `brokenResetForRetry` that filters on the
id alone and reports zero rows as something broken — the mistake written out — put
through the **same** `retryFilterProblems` judgement the real test uses, so a check
weakened later stops catching it and this case goes red. It also asserts the broken
copy still passes the ordinary one-row case, because a "mistake" that fails
everything is not the plausible one this is about.

### What this does NOT prove

**That two real requests racing against Postgres resolve this way. UNVERIFIED.** What
is proved is the filter the database is given and the answer each outcome produces.
Two concurrent requests against a real project is not something these tests or the
staging script run — the script's calls are sequential — and nothing in this
repository can make two Edge Function invocations overlap on purpose. The staging
run will not settle it either. Treat the compare-and-set as a correct filter whose
behaviour under genuine contention is reasoned, not measured.

### Noted by the coach, not blocking, and not changed

> a stale `queued` row keeps its old `created_at` after a retry, so it reads as
> stale again at once; the compare-and-set covers the harm.

Correct, and left as it is deliberately: `created_at` answers "when was this person
first invited", which a retry does not change. The consequence is that the **Try
again** button stays drawn on a stale row that has just been retried, and pressing it
again now loses the compare-and-set and gets "being sent now" instead of a second
email — which is why the coach calls the harm covered. Using `expires_at` for the
staleness reckoning instead would fix the cosmetic half; it is not done here because
point 1 was the ask and the screen's reckoning is a separate decision.

---

## 3. The staging checks script

`scripts/staging/build-it-18-invitation-status-checks.mjs`. It is written to be run by the owner
**before and after** deploying `invite-member` to staging, and the before-run is meant to fail.

### Its own judgements, which take no network and no account

```
node scripts/staging/build-it-18-invitation-status-checks.mjs --selftest
```

```
57 cases, 0 wrong.

Every judgement said FAIL to the function from before issue #166, to an
answer that claims 'sent' over a row that says 'queued', to a second
call that sent a second email, to a failed send whose row was deleted,
to a body quoting the email service, and to a run that wrote through
PostgREST or read account_status. That is what would make a green
staging run mean something. It is NOT itself a staging result:
nothing was sent anywhere by this run.
```

**exit 0.** 57 cases, every one a judgement fed a fabricated answer with the verdict it must produce.
Counted the way `.github/workflows/ci.yml` counts the other two selftests — `grep -c '^  ok  '` over
the output gives **57**, which is the floor the new CI line holds.

**55 of those were there at the first commit; two arrived in review round 2**, both about the
compare-and-set — see the subsection below on the one way it could have failed silently.

The eight cases worth naming individually, because they are the ones that make the rest mean
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
- **`THE COMPARE-AND-SET ALWAYS LOSES: a retryable row answered 'being sent now', so Try again is
  dead`** → FAIL, FAIL, UNVERIFIED. Added in review round 2, and the reason is in §2a: this is the
  one symptom a staging run could see if the retry's timestamp filter never matched. The judgement
  names that cause in its detail line rather than reporting a generic 409, because the owner reading
  the output is the person who would otherwise spend an afternoon on it. Its twin — a 409 for the
  ordinary reason, which must NOT be read as this — is the 57th case.

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

Reverted, and `55 cases, 0 wrong` again — 55 being the count at the time of that run, before review
round 2 added the two cases above.

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

## 3a. The coach's point 2 — both new check files now run in CI

The coach lifted the constraint that kept them out:

> The "no workflow change beyond test counts" line in the issue was the coach's and
> was too tight: a test nothing runs is not a gate.

So `.github/workflows/ci.yml` is changed, in two jobs, and **#167 is closed from this
pull request**. No job was added, so `required`'s `needs` list and its
`EXPECTED_JOBS: "14"` are untouched — checked, not assumed.

### `functions-test` — the folder, not a file

It named one file by path. It now names the folder, which is strictly more than the
coach asked for and the reason is the next file rather than this one: `deno test <dir>`
picks up anything matching its test naming convention, so a third test file is covered
the day it is written instead of the day somebody remembers the line.

```diff
-      EXPECTED_FUNCTION_TESTS: "40"
+      EXPECTED_FUNCTION_TESTS: "102"
...
-          "$RUNNER_TEMP/deno" test --no-lock --allow-env \
-            --config supabase/functions/create-team/deno.json \
-            supabase/functions/_tests/suspension_test.ts | tee ...
+          "$RUNNER_TEMP/deno" test --no-lock --allow-env \
+            --allow-read=supabase/migrations \
+            --config supabase/functions/create-team/deno.json \
+            supabase/functions/_tests | tee ...
```

`--allow-read` is **narrowed to the migrations folder and nothing else**, because one
test reads `20261006095847_invitation_status.sql` to compare the fixed list of failure
codes with the check constraint that enforces it. The run cannot reach a key, a `.env`
file or anything else on the disk.

Measured by running exactly what CI will run, with `NO_COLOR=1`:

```
deno test --no-lock --allow-env --allow-read=supabase/migrations --config supabase/functions/create-team/deno.json supabase/functions/_tests
```

```
running 62 tests from ./supabase/functions/_tests/invitation_status_test.ts
running 40 tests from ./supabase/functions/_tests/suspension_test.ts
ok | 102 passed | 0 failed (270ms)
```

**exit 0.** And the number CI will actually read, through its own `sed`:

```
sed -n 's/^ok | \([0-9][0-9]*\) passed .*/\1/p' <the log>
102
```

So the floor is a counted number, not an estimate: 40 + 62.

### `staging-script-selftests` — a third line

No folder to point at here: each script carries its own expected count, so each needs
its own line.

```diff
       EXPECTED_SUSPEND_CASES: "40"
+      EXPECTED_INVITATION_STATUS_CASES: "57"
...
+          run_and_count build-it-18-invitation-status-checks scripts/staging/build-it-18-invitation-status-checks.mjs "$EXPECTED_INVITATION_STATUS_CASES"
```

And the number CI will read, through its own `grep`:

```
grep -c '^  ok  ' <the selftest log>
57
```

The script's `--selftest` branch runs before it reads `web/.env.local`, so the job
needs no secret, no account and no network — the same as the two beside it.

### Checked, not assumed

```
npm run workflows:check
```

```
Self-test: 7/7 cases passed.
Checked 4 workflow file(s), 20 job(s): 0 problem(s), 0 warning(s).
```

**exit 0** — permissions and timeouts still right on every job, including the two
edited.

### And the run on GitHub, which is the only thing that shows the jobs really do it

Run **37507349936**, `event=pull_request`, `conclusion=success`, on
`dccd85eeb7aaa717494550c1126c3b5964e53e8a` — read with
`gh run view 37507349936 --json headSha,status,conclusion,event`. All 18 checks pass,
including `required`.

`Edge function tests (Deno)`, step "Every Deno test beside the functions (suspension,
invitation status)":

```
running 62 tests from ./supabase/functions/_tests/invitation_status_test.ts
running 40 tests from ./supabase/functions/_tests/suspension_test.ts
ok | 102 passed | 0 failed (131ms)
Counted 102 passing tests; at least 102 expected.
```

`Staging script self-tests (can these checks fail?)`:

```
build-it-16-checks: counted 39 cases; at least 39 expected.
build-it-16-suspend-checks: counted 40 cases; at least 40 expected.
build-it-18-invitation-status-checks: counted 57 cases; at least 57 expected.
```

So both files are not merely named in the workflow — CI **executed** them and compared
what they ran against the floor, and the numbers are the ones measured on this machine.
`--allow-read=supabase/migrations` is enough for the migration-reading test on a Linux
runner, which was worth finding out rather than assuming.

**What is still not proved:** the negative half. #167 asks for it in so many words —
delete a test from `invitation_status_test.ts` on a scratch branch, push, and watch
`functions-test` go red on the count; do the same to a case in the selftest's array.
That has **not** been done, so "the job would catch a deleted test" rests on reading the
`-lt` comparison rather than on seeing it fire. The floors and the counts matching
exactly is the positive half.

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

## 6. The workflow change, and the line this section used to carry

**This section used to say `.github/workflows/` was not touched, and that neither of
this change's two check files ran in CI.** That was true of the first commit and is no
longer: the coach's review lifted the constraint, both files are now in their jobs with
counted floors, and **#167 is closed from this pull request**. §3a has the diffs, the
measured numbers and the commands.

What stays true from the original note: the floors are floors, not equalities, so
adding tests cannot fail either job — and a run that counted fewer than before has lost
coverage and goes red. The counts are 102 for the Deno job and 57 for the new
selftest, both counted from output in this session rather than estimated.

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

After the change: the Deno tests pass (45 at the time, 62 now) and the selftest cases
come out 0 wrong (55 at the time, 57 now), both exit 0, and the commit goes through. **No guard file was edited, no hook was skipped, and
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
| [#167](https://github.com/build-once/team-tasks/issues/167) | CI runs neither of Build it 18 part 2b's two check files — **fixed in this pull request** after the coach's review lifted the constraint; the PR closes it. See §3a |
| [#168](https://github.com/build-once/team-tasks/issues/168) | The 15-minute stale-queued window rests on an Edge Function time limit nobody has read |
| [#169](https://github.com/build-once/team-tasks/issues/169) | The failure code `not_configured` can never be stored, because delivery is decided before any row exists |
| [#170](https://github.com/build-once/team-tasks/issues/170) | A team at the 20-pending limit cannot retry a failed invitation |
| [#171](https://github.com/build-once/team-tasks/issues/171) | Nothing can delete an invitation, so test rows and failed invitations are cleared by hand |
