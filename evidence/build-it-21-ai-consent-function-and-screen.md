# Evidence: Build it 21 part 2b — the consent check in the function, and the switch on screen

**Issue:** [#211](https://github.com/build-once/team-tasks/issues/211)
**Date:** 2026-10-08
**Checked by:** the assistant (Claude Code), in one session
**Started from:** `origin/main` at `10a77238df3d97f00e1f188bd4a58c6794d67dda` — the merge of PR #210,
confirmed with `git rev-parse HEAD` after `git checkout -b feat/build-it-21-consent-check-211
origin/main`. The branch was created from that commit and nothing was rebased.

**Result: PASS for everything this session can check, and two whole halves it cannot.**

| What | Verdict |
|---|---|
| The consent check in `suggest-subtasks`, over every shape of answer the read can give | **PASS** — 213 Deno tests, 0 failed |
| That with the setting off the task is never read and a stubbed AI service gets nothing | **PASS** — and seen to fail three ways first, §3 |
| The screen's decisions: a failed read is never "off", "Saved" only after a read-back | **PASS** — 158 checks, 0 failed |
| The staging script's own logic | **PASS** — 110 cases, 0 wrong |
| The web app builds and lints | **PASS** |
| **The deployed function refusing with the setting off** | **UNVERIFIED — the owner's staging run.** Nothing in this session deployed anything, and the version on staging has no consent check |
| **Anything seen in a browser** | **UNVERIFIED — no browser was opened.** Issue #211 forbids it, and nobody has looked at `/settings` |

---

## 1. What was built, in one paragraph each

**The function.** `supabase/functions/suggest-subtasks/index.ts` grew a consent gate between the
suspension door and everything else. `checkAiConsent` reads one boolean; `withConsent` either answers or
calls the rest of the handler. Off and no-profile-row get a 403 with the code `ai_suggestions_off` and
their own sentence; a setting that **cannot** be read gets the fixed sentence at 503 with the new code
`ai_suggestions_unknown`, which is `docs/plan.md`'s own instruction for that case and is why
`SUGGEST_CODES` went from eleven words to twelve.

**How it reads the setting, which issue #211 asks to be said out loud.** The **admin connection, by user
id** — `ctx.supabaseAdmin.from("profiles").select("ai_suggestions_enabled").eq("user_id", callerId)`. Not
`my_ai_suggestions()` through the caller's rights, and that is the merged migration's own instruction
rather than a preference: `20261007204900_ai_suggestions_consent.sql` section 3 revokes execute on that
function from `service_role` **by name** and says why — an admin connection has no signed-in user, so
`auth.uid()` is null and the function would answer false for every caller without erroring — and then
says what this function must do instead: "read the column for a specific user id". Section 4's
`grant select (ai_suggestions_enabled, ai_suggestions_changed_at) ... to service_role` exists for this
read and nothing else.

**Why it cannot read somebody else's by mistake.** Three things, in order of how much they matter. The id
is `ctx.userClaims.id`, from the verified token, and the request body **has not been parsed yet** when
this runs — so there is no value a caller can put anywhere that changes which row is selected. The select
names one column and it is a boolean, so even a wrong row would yield a true or a false and nothing about
a person. And the read is passed in as a function, written out at the call site, so the `.eq()` is a line
a reviewer sees. *(The other choice would have been structurally incapable — `my_ai_suggestions()` takes
no arguments — and it was still not taken, for the reason above and one more: that function folds the
suspension check into its answer, so a suspended caller would get a sentence about an AI setting instead
of `account_suspended` at 403 in the same order as the other three doors.)*

**The screen.** A new page, `/settings`, with the switch and the words; `web/src/lib/consent.ts` holds
every sentence and the three decisions. `/tasks` reads the setting only when somebody has actually pressed
Suggest subtasks, and with it off draws a panel saying so and linking to Settings **without calling the
function at all**.

---

## 2. Every command, its output and its exit code

Run from `C:\Users\rajdh\team-tasks` on Windows 11. Each exit code was captured with
`(Start-Process ... -PassThru).ExitCode`, because rule 4 forbids chaining and the shell does not persist
between calls.

### 2.1 The Deno tests — 213 passed, 0 failed

```
deno test --no-lock --allow-env --allow-read=supabase/migrations \
  --config supabase/functions/create-team/deno.json supabase/functions/_tests
```

```
running 62 tests from ./supabase/functions/_tests/invitation_status_test.ts
running 111 tests from ./supabase/functions/_tests/suggest_subtasks_test.ts
running 40 tests from ./supabase/functions/_tests/suspension_test.ts
...
checkAiConsent: SWITCHED ON: the one case in which anything may be sent ... ok (0ms)
checkAiConsent: SWITCHED OFF, explicitly -- which is every account's starting state ... ok (0ms)
checkAiConsent: NO PROFILE ROW: the ordinary state of a new account ... ok (0ms)
checkAiConsent: THE READ FAILED: an unknown, and an unknown is not a yes ... ok (0ms)
checkAiConsent: the read failed with no code ... ok (0ms)
checkAiConsent: the read threw: still not a yes ... ok (0ms)
checkAiConsent: the read's promise rejected: still not a yes ... ok (0ms)
checkAiConsent: no error and no list either: an unanswered question, not an empty one ... ok (0ms)
checkAiConsent: a row with no such column: the setting could not be read ... ok (0ms)
checkAiConsent: a row whose setting is null ... ok (0ms)
checkAiConsent: the STRING "true" rather than the boolean: not a yes ... ok (0ms)
checkAiConsent: THE STRING "false", WHICH IS TRUTHY: emphatically not a yes ... ok (0ms)
checkAiConsent: the number 1 ... ok (0ms)
checkAiConsent: the single character "t", which is how Postgres prints a true to a terminal ... ok (0ms)
the OFF refusal says what happened, and nothing about the plumbing ... ok (0ms)
the OFF code is NOT one of the fixed-failure codes, and the unreadable one IS ... ok (0ms)
withConsent: the setting is OFF -- the task is NEVER read and the AI service gets NOTHING ... ok (0ms)
withConsent: there is NO PROFILE ROW -- the task is NEVER read and the AI service gets NOTHING ... ok (0ms)
withConsent: the setting CANNOT BE READ -- the task is NEVER read and the AI service gets NOTHING ... ok (0ms)
withConsent: the setting is ON -- the rest of the handler runs ONCE and its answer comes back untouched ... ok (0ms)
the consent checks REFUSE a gate that reads the setting with a truthy test ... ok (0ms)
...
ok | 213 passed | 0 failed (684ms)
```

`exit=0`. **192 before, 213 now** — twenty-one tests. `deno 2.8.2` locally; CI pins `2.9.7`, so the
number CI counts is CI's, and `EXPECTED_FUNCTION_TESTS` is a floor.

One thing to notice in that output rather than take on trust: the `setting CANNOT BE READ` case prints
the function's own log line, and it carries the code and nothing else — no user id, no title, no database
message.

### 2.2 The screen's decisions — 158 of 158 checks passed

```
node scripts/screen-state-check.mjs
```

```
8. the AI suggestions setting: a failed read is never 'off'
PASS  the three states
PASS  switched on
PASS  switched off
PASS  the RPC's row as an object rather than a one-item list: read the same way
PASS  THE READ FAILED: unreadable, NOT off -- a failed read is not a statement about anybody's choice
PASS  failed wins over a row saying off, too
...
PASS  THE STRING "false", WHICH IS TRUTHY
PASS  only a setting known to be ON may be asked on -- unreadable is not a yes

8b. 'Saved' only after the setting has been read back
PASS  ASKED FOR ON, READ BACK OFF: not saved, whatever the write answered
PASS  THE READ-BACK FAILED: not saved. The write may have worked; this does not know
...
8e. no screen reads the setting's column, and no write asks for it back
PASS  all three files read the setting through my_ai_suggestions(), not through a select
PASS  NO FILE SELECTS EITHER NEW COLUMN: a select on it is refused for everybody, the person included
PASS  and no file reads profiles with a star, which fails outright after the consent migration
PASS  the setting is written in exactly the two places this action has for it
PASS  the profile insert names only the two columns a client role may insert
PASS  the module that holds the screen's half says the column cannot be read

158 of 158 checks passed.
```

`exit=0`. **110 was the floor in CI before; 158 now.**

**Two of those checks failed on their first run, and the fault was mine rather than the code's.** Section
8e expected an exact run of characters for the RPC call (the two pages indent it differently) and an exact
count of `.select("user_id")` (which also counts the sentence in the comment explaining why it is
`user_id`). Both were rewritten to ask the question they meant — that the RPC is used, and that the
setting is written in exactly two places — rather than to count formatting. The output above is the second
run.

### 2.3 The staging script's own logic — 110 cases, 0 wrong

```
node scripts/staging/build-it-20-ai-checks.mjs --selftest
```

```
110 cases, 0 wrong.
```

`exit=0`, and `110` counted with the same `^  ok  ` grep CI uses. **75 before.** The thirty-five new ones
are the consent setting; the one that earns its place is:

```
  ok    A FUNCTION WITH NO CONSENT CHECK: the setting is off and it answers 200 with suggestions.
        This is what staging answers BEFORE the deploy, and every part fails
          expected FAIL, FAIL, FAIL, FAIL; got FAIL, FAIL, FAIL, FAIL
```

### 2.4 Lint, build and workflow lint

```
npm run lint                  (in web/)   ->  exit=0
npm run build                 (in web/)   ->  exit=0, and /settings is in the route list
node scripts/check-workflows.mjs          ->  Checked 4 workflow file(s), 20 job(s): 0 problem(s), 0 warning(s).  exit=0
deno check --no-lock --config supabase/functions/create-team/deno.json \
  supabase/functions/suggest-subtasks/index.ts  ->  exit=0
```

The build's route list is worth one line of it, because it is the only mechanical confirmation in this
session that the new page exists at the address everything else links to:

```
├ ƒ /reset-password
├ ƒ /settings
├ ƒ /signup
```

### 2.5 And CI's own numbers, which are the ones that count

Everything in §2 above ran on this machine. The numbers CI measured on another, with its own pinned
versions, are below — read from the three counting jobs' logs of run
[37753549151](https://github.com/build-once/team-tasks/actions/runs/37753549151) on PR #214, with
`gh run view --log --job=<id>`. **All 18 checks pass, `required` included.**

```
Edge function tests (Deno), with deno 2.9.7:
  ok | 213 passed | 0 failed (448ms)
  Counted 213 passing tests; at least 213 expected.

Pure-function checks:
  tasks-filter-check:   counted  47 PASS lines; at least  47 expected.
  password-reset-check: counted  92 PASS lines; at least  84 expected.
  sentry-scrub-check:   counted  95 PASS lines; at least  95 expected.
  screen-state-check:   counted 158 PASS lines; at least 158 expected.
  friendly-words-check: counted  45 PASS lines; at least  45 expected.
  approved-model-check: counted   6 PASS lines; at least   6 expected.

Staging script self-tests:
  build-it-16-checks:                   counted  39 cases; at least  39 expected.
  build-it-16-suspend-checks:           counted  40 cases; at least  40 expected.
  build-it-18-invitation-status-checks: counted  57 cases; at least  57 expected.
  build-it-20-ai-checks:                counted 110 cases; at least 110 expected.
```

The three numbers this change moved — **213**, **158** and **110** — are the same on CI as they are
locally, which is the point of reading them rather than assuming: a count that only holds on one machine
is a count that turns a pull request red on somebody else's. `deno 2.8.2` here against CI's `2.9.7`, and
Linux against Windows, made no difference to any of them.

**`password-reset-check` counting 92 against a floor of 84 is not this change's doing** and is not a
fault: that number is a floor, somebody added eight checks without raising it, and a floor behaving that
way is a floor working. It is noted because it appears in the output above and would otherwise look like
something this change left behind.

**One thing CI's green does NOT mean, said before anybody reads it as more than it is.** `App tests
(access rules on staging)` passed in 13 seconds, against the staging database — which **does** now have
the consent migration. That proves this branch's code breaks none of the existing access rules, which is
worth having. It proves nothing about the consent check, because that job never calls
`suggest-subtasks`: the function on staging is still Build it 20's. And `Edge function tests (Deno)` is
where the consent check is actually exercised, with every read injected, so its green says nothing about
any deployed function either.

---

## 3. Seen to fail first — three runs, and the third is the one that matters

Issue #211 asks for the tests to have been "seen to fail". They were, three ways, each by breaking
something on purpose and putting it back. The backup-and-restore was a file copy in the scratchpad; `git
diff --stat` afterwards shows only the two intended files changed.

### 3.1 Against `main`'s function — the behaviour did not exist

`git checkout origin/main -- supabase/functions/suggest-subtasks/index.ts`, then the Deno run:

```
TS2614 [ERROR]: Module '...suggest-subtasks/index.ts' has no exported member 'AI_SUGGESTIONS_OFF_CODE'.
TS2614 [ERROR]: ... has no exported member 'AI_SUGGESTIONS_OFF_MESSAGE'.
TS2614 [ERROR]: ... has no exported member 'checkAiConsent'.
TS2614 [ERROR]: ... has no exported member 'consentOffRefusal'.
TS2614 [ERROR]: ... has no exported member 'withConsent'.
TS2367 [ERROR]: This comparison appears to be unintentional because the types '11' and '12' have no overlap.
  if (SUGGEST_CODES.length !== 12) {
Found 6 errors.
error: Type checking failed.
```

`exit=1`. This is the truest "it was not there", and the least informative: the file does not load at all.
Hence the next two.

### 3.2 The truthy read — `if (row.ai_suggestions_enabled)`

One line of the restored function changed to the mistake anybody writes without thinking twice. Six tests
went red:

```
checkAiConsent: a row with no such column: the setting could not be read ... FAILED
  error: Error: why is off, expected unknown
checkAiConsent: a row whose setting is null ... FAILED
checkAiConsent: the STRING "true" rather than the boolean: not a yes ... FAILED
  error: Error: consented is true -- it answered {"consented":true}
checkAiConsent: THE STRING "false", WHICH IS TRUTHY: emphatically not a yes ... FAILED
  error: Error: consented is true -- it answered {"consented":true}
checkAiConsent: the number 1 ... FAILED
checkAiConsent: the single character "t", which is how Postgres prints a true to a terminal ... FAILED

FAILED | 12 passed | 6 failed | 93 filtered out (33ms)
```

`exit=1`. Read the fourth one again: a function with that line sends somebody's task title to Anthropic
because the four-character string `"false"` is truthy.

### 3.3 The gate that checks **after** doing the work — and this is the hole

`withConsent` changed to call `proceed()` first and check the setting afterwards. **Every refusal it sends
is still correct**: the right status, the right code, the right sentence. Three tests went red anyway:

```
withConsent: the setting is OFF -- the task is NEVER read and the AI service gets NOTHING ... FAILED
  error: Error: the rest of the handler ran 1 time(s). What it did: the task was read;
         the AI service received a request of 863 bytes; these things happened and none of
         them should have: the task was read; the AI service received a request of 863 bytes
withConsent: there is NO PROFILE ROW -- ... ... FAILED
withConsent: the setting CANNOT BE READ -- ... ... FAILED
withConsent: the setting is ON -- the rest of the handler runs ONCE ... ok

FAILED | 1 passed | 3 failed | 107 filtered out (31ms)
```

`exit=1`. **That is the whole argument for the shape of the gate.** A check-then-`if` would have passed
its own tests here: the body of the refusal is right, the status is right, and the title had already
gone. The only way to catch it is to ask what did **not** run — which needs the rest of the handler to be
a function the gate is handed, and that is why `withConsent` takes a `proceed` instead of returning a
verdict for the handler to branch on.

The over-correction is guarded from the other side by the fourth test in that list, which stayed green
here and goes red if the gate ever refuses everybody.

---

## 4. The staging script, and what the owner has to run

`scripts/staging/build-it-20-ai-checks.mjs` is extended rather than replaced. **The assistant has never
run it against staging**, and has run only `--selftest`.

**The sequence it now performs**, which is what issue #211 asks for:

| § | What it does | Costs money? |
|---|---|---|
| 1 | Sign in as Alice and Bob; create one personal task | no |
| 2 | Read Alice's setting; switch it **off**; ask → must be refused with `ai_suggestions_off` | **no** — the function refuses before it reads the task |
| 3 | Switch Alice **on**, and Bob too | no |
| 4 | Alice asks about her own task → suggestions | **yes**, one metered request |
| 5 | Who may not ask: a stranger, a made-up id, a bad id, a title instead of an id, two shapes of signed-out | no |
| 6 | Two asks at once | **yes**, two |
| 7 | Switch Alice **off** again → refused again. Bob cannot switch Alice's setting, and cannot read the column at all | **no** |
| 8 | Delete the task; **put both settings back**; check they went back; sign out | no |

**At most three metered requests per run, unchanged** — both of the asks made with the setting off cost
nothing, which is the point.

**Why Bob's setting is switched on too, which is not obvious.** The consent check runs *before* the task
is read, so with Bob's setting off his ask in §5 would be refused for consent and never reach the read.
`judgeSameAsNotFound` would then compare a consent refusal with a 404, fail, and prove nothing about task
visibility. His setting is put back in §8 with Alice's.

**It will not touch a setting it could not read.** A run that switched a consent setting it could not read
would have no way of putting it back, and leaving somebody opted in to sending their task titles to an
outside company is worse than an unanswered check (rule 8). So the read comes first, and `judgeConsentRestored`
**fails** rather than assuming — if it ever does, its message says to look in the dashboard by hand.

**And one way the restore does NOT happen, found while writing this and filed as
[#213](https://github.com/build-once/team-tasks/issues/213).** The restore is in a `finally`, which covers
an exception and does **not** cover Ctrl-C: Node delivers SIGINT, the default handler exits, and nothing
runs. The window is the tens of seconds the three metered requests take, which is exactly when somebody
watching a slow script reaches for Ctrl-C — and the failure is silent, because the line that would have
reported it is the one that did not run. The script's header now says so, and says what to check by hand
if a run is interrupted.

### What the owner runs, in order

1. **Before deploying**, with the Build it 20 function still on staging:

   ```
   node scripts/staging/build-it-20-ai-checks.mjs
   ```

   **This must FAIL**, and specifically §2's `with the setting OFF, the ask is REFUSED and nothing is
   sent` must fail — the function there has no consent check, so it answers 200 with suggestions for
   somebody who has not consented. Keep that output: it is the evidence that the behaviour was not there.

2. **Deploy** `suggest-subtasks` to staging (rule 19 permits `functions deploy` against staging; the
   assistant has not run it), then run the script again. Now §2 and §7 must pass.

3. The same output is what settles `docs/plan.md`'s "seen to refuse with it off" — for **staging**. The
   production half of that precondition is a separate question and is still open; so is the privacy page
   ([#204](https://github.com/build-once/team-tasks/issues/204)).

---

## 5. Redaction list

**Empty, and that is a complete answer.** No data was captured from production or from staging in this
session: no connector was used, no browser was opened, no request was sent to either project, and the
only things pasted into this file are the outputs of local commands. The two key-shaped and token-shaped
strings in the test and script fixtures are composed from repeated characters on purpose — gitleaks
cannot tell a fixture from the real thing, and CI runs it over the whole history.

The one value worth naming as *not* printed: the staging project reference appears in the staging script,
as it has since Build it 20, because that script's guard is built on it. Nothing new was added.

---

## 6. What this session could not check, said plainly (rule 8)

1. **Whether the deployed function refuses.** Nothing here is deployed. The version of `suggest-subtasks`
   on staging is Build it 20's and has no consent check; production has the newest merged version and no
   key. The run that settles it is the owner's, §4 above.
2. **Whether `/settings` looks like anything.** No browser was opened — issue #211 forbids it. The page
   compiles and is in the route list; that is all. Nobody has seen the switch, the hints, or the
   nickname box for somebody with no profile row. **Filed as
   [#212](https://github.com/build-once/team-tasks/issues/212)**, which names the three things only a
   browser can settle: whether six hint paragraphs read as a disclosure or as grey text to scroll past,
   whether the app's **first checkbox** is big enough to hit on a phone and shows a focus ring (there is
   no checkbox rule in `globals.css`), and whether the plain link in the failed-read state reads wrong
   beside every other screen's Try again button.
3. **Whether a person with no profile row can really switch it on.** The *path* is written and the pure
   decisions around it are checked, but the two statements it makes — an insert then an update — have
   been exercised only in the sandbox in `evidence/build-it-21-ai-consent-migration.md`, as Carol, by the
   coach. On staging the test accounts all have profile rows, so the staging script does not reach this
   path either. It is the weakest-covered thing in this change, and
   [#207](https://github.com/build-once/team-tasks/issues/207) is what holds it open.
4. **Whether the Supabase bundler accepts the function at all.** Unchanged from Build it 20 and issue
   #188: the JSON import is resolved by `deno check` here and bundled server-side by the deploy, which
   nothing in this session can run.
5. **Anything about the retention figures on the screen.** They are `docs/plan.md`'s, quoted from
   Anthropic's published page on 7 October; that page was **not re-read** in this session. The screen
   attributes them — "Anthropic say" — because that is all they can be.
