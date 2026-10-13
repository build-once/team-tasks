# Evidence: Build it 26 PR 3 — download your own data

Result: **PASS for everything this repository can answer, and NOTHING has been run against staging or a
deployed build.** Four commands below, with their exit codes, plus four deliberate breakages. What is
left is the owner's: one staging run, one production run after the merge, and a look in a browser.
Date: 2026-10-13.
How checked: `node scripts/screen-state-check.mjs`, the staging script's `--selftest`, `npm run lint`,
`npm run build`. Plus four breakages, to show the checks that matter most can fail.
Checked by: Claude Code. **No dashboard, no connector, no browser, and nothing run against staging or
production.**

---

## 1. What this pull request is, and the one thing it is NOT

**`docs/plan.md`'s Build it 26 order of work, row 3: the export.** Read-only, no migration, no secret
key, and a route handler rather than a server action so the download needs no JavaScript.

**IT HAS NO MIGRATION, AND THAT IS NOT AN OVERSIGHT — IT IS THE DESIGN.** `docs/deletion.md` section
11.1: "nearly everything in it is something the person can already read through row-level security with
their own session, and their email address is on the session's own user object. So the export is **a
read with the caller's own rights**, and the policies are what keep it to their own data."

So **the usual rules for a migration pull request do not apply here, and this file says so rather than
leaving somebody to notice**: there is no local PostgreSQL sandbox probe, because there is no SQL; no
`supabase db push`, because there is nothing to apply; no new policy, privilege, table, column,
constraint, trigger or function. **Not one statement in `supabase/` is touched by this change.** PR 4 is
the migration, and it is the next row.

**What that does to a before/after staging run** is set out in section 5, because it changes what the
BEFORE is *for*.

| | |
|---|---|
| `web/src/lib/export-data.ts` | **the half that decides what ends up in the file.** Import-free, so a plain `node` run loads it and the check script calls the real module rather than a copy |
| `web/src/app/settings/export/route.ts` | the half that makes the requests — every one with the caller's own session |
| `web/src/lib/attachment-store.ts` | one function added, `listFilesForExport`, and the four that were there are untouched |
| `web/src/app/settings/page.tsx` | a **Your data** card: four sentences from the module, and an `<a download>` |
| `web/src/lib/legal.ts` | **one sentence added to the privacy page**, which is what the export being built now permits |
| `scripts/screen-state-check.mjs` | **section 12, seventy-three new checks**, and section 11i changed in one direction |
| `scripts/staging/build-it-26-export-checks.mjs` | the before/after the owner runs, with 44 selftest cases |

## 2. The four commands

### 2.1 The pure checks — `node scripts/screen-state-check.mjs`

```
383 of 383 checks passed.
```

Exit code **0**.

**310 before this change, 383 after — SEVENTY-THREE new checks, and both numbers were counted in this
session rather than carried.** The before was read by running `main`'s own copy of the script:
`git show main:scripts/screen-state-check.mjs` into a file beside the real one, so its relative paths
still resolved, then `node` on it — **310 of 310** — and the temporary file deleted.

**CI needs no change for them to be enforced.** `.github/workflows/ci.yml:347` holds
`EXPECTED_SCREEN_STATE_CHECKS: "297"` and the comparison is a floor (`-lt`), so 383 passes it and a
later run that lost coverage would not.

The section headings, which are what the checks are about:

```
12a. the format: eight sections, and three fields before any data
12b. a failed read is NEVER an empty section -- eight sections, one at a time
12c. only rows this person created, checked on the rows and not only in the query
12d. nothing this file was not asked for: no credential, no column, no uuid
12e. the profile has THREE shapes, and the middle one is the ordinary state of a new account
12f. the AI setting is a WORD, so a missing field cannot read as 'off'
12g. the download's name: a fixed word and a date, and nothing about the person
12h. the files on a task: three fields, a title rather than an id, and folders dropped
12i. the route: the caller's own rights, a filter that is load-bearing, and no cache
12j. the screen: one file of sentences, a link rather than a button, and a private path
12k. the two refusals: a code this app wrote, and never a message
```

### 2.2 The staging script's selftest — `--selftest`

```
44 logic cases, 0 wrong.
PASS every judgement can fail: 44 cases, including the world where the export's own
owner filter is gone, the world where the check would have proved nothing because the
policy hid the row anyway, a closed table answering an empty list rather than a
refusal, the consent function askable about somebody else, and the export file itself
handed to a caller with no cookie.

This is the LOGIC only. Nothing was sent anywhere by this run.
```

Exit code **0**. No setting is read, no request is made, no account is used.

### 2.3 `npm run lint`

Exit code **0**, no output, which is eslint saying nothing is wrong.

**It had one warning first**, and it was a real one: `Read<T>` declared a type parameter nothing used.
Fixed by making it non-generic, with the reason written beside it — `rows` is `unknown` because that
module is written to be handed anything, so a type parameter would have been a promise about a row's
shape that nothing in the file checks.

### 2.4 `npm run build`

Exit code **0**, and the new route appears as a dynamic one, which is what a per-person download must be:

```
├ ƒ /settings
├ ƒ /settings/export
```

```
ƒ  (Dynamic)  server-rendered on demand
```

**A `○ (Static)` there would have been a finding**, not a detail: a prerendered export is one person's
file served to everybody.

## 3. The four deliberate breakages — can these checks fail?

Each one is a mistake somebody could actually make, and the fourth is the one that would be hardest to
spot in a diff.

### 3.1 A failed read becoming an empty section — **9 checks red**

`note()` changed to return `[]` instead of the refusal shape:

```
FAIL  account: a failed read says so rather than giving an empty address
FAIL  profile: a failed read is not 'no nickname'
FAIL  ai_suggestions: a failed read is not 'off' -- the same way round as consentState
FAIL  tasks: a failed read empties nothing, and takes the files section with it
FAIL  teams: a failed read takes BOTH team sections, because one holds the other's names
FAIL  memberships: a failed read takes ONLY the belong-to section
FAIL  invitations: a failed read is not 'you sent none'
FAIL  files: a failed listing is not 'you attached nothing', even with the tasks read fine
FAIL  all eight at once: eight names, and a file that says it is not complete
374 of 383 checks passed.
```

Exit code **1**. **This is the breakage worth having**, because it is Build it 19's rule applied to a
file rather than a screen, and it bites harder here: an empty list on a screen is a moment's confusion,
and an empty list in a **downloaded file** is this app telling somebody in writing that it holds nothing
of theirs.

### 3.2 A spread putting a token hash in somebody's download — **2 checks red**

`...invitation` added to the invitation row:

```
FAIL  a token hash, a column nobody asked for, and every id are all absent
        expected [false,false,false,false,false,false,false,false,false]
        got      [true,true,false,false,true,true,false,false,false]
FAIL  and not one uuid anywhere in the file, in any field
        expected false
        got      true
```

Exit code **1**. The `true`s are, in order, the string `token_hash`, the hash itself, `invited_by` and
`accepted_at`. **One character of a diff**, and the hash of a credential is in a file somebody can
forward.

### 3.3 The own-rows guard removed — **5 checks red**

`ownRowsOnly` changed to drop nothing:

```
FAIL  A TEAM MATE'S TASK IS DROPPED, which the policy alone would not do
FAIL  a task with NO owner at all is dropped -- the shape PR 4 introduces
FAIL  an undefined owner is dropped too
FAIL  the built file holds one task and it is theirs
FAIL  and a team mate's title appears NOWHERE in the file, not even on a file's on_task
378 of 383 checks passed.
```

Exit code **1**.

### 3.4 The route's own filter removed — **1 check red**

`.eq("owner_id", userId)` deleted from the tasks query:

```
FAIL  every read is narrowed to this person: owner_id, invited_by, and user_id TWICE
382 of 383 checks passed.
```

Exit code **1**. **And this is the pair that matters**: 3.3 and 3.4 are the two locks on the same door,
and breaking either one alone turns something red. With both in place a team mate's task cannot reach
the file even if the query is wrong, and the check notices the query being wrong even though the guard
would have saved it.

### 3.5 And the staging script's selftest — **1 case WRONG**

`judgeOwnTasksOnly`'s second part made to always pass:

```
  WRONG  THE WORLD WHERE THE FILTER IS GONE: Carol's task in Alice's own read FAILS the second part
44 logic cases, 1 wrong.
```

Exit code **1**.

**All five breakages were reverted** — restored with `git checkout --` from the index — and the runs
after them are exit code **0** again, at 383 of 383 and 44 of 44.

## 4. Two findings in these checks' own first run, and both were real

Neither was a typo. Recording them because each says something about the thing being checked.

| What went red | Why | What it changed |
|---|---|---|
| `.eq("user_id", userId)` counted **2**, not 1 | There are **two** such filters — `profiles` and `team_members` — and the check was written expecting one. Counting them as one would have let a later change delete either | the expectation is 2, and the check's comment now names both and says what each is for: `profiles` has a policy that also admits a team mate's row, so there the filter narrows; `team_members`' policy is already `auth.uid() = user_id`, so there it is belt and braces |
| `token_hash` counted **1** in the route | The route's own comment says "`token_hash` IS NOT SELECTED" — **the explanation of an absence, read as a presence** | the route is read with its comments stripped, using the `sentencesOnly` helper section 11 already has. **This is the FOURTH time in two pull requests that a comment has tripped a check it was describing**: `evidence/build-it-26-legal-pages.md` section 8 records three |

## 5. What the owner runs, and why the BEFORE is a CONTROL rather than a failure

`scripts/staging/build-it-26-export-checks.mjs`. **It has ten judgements across seven sections**, and
the before/after is not the shape its siblings have.

**Sections 1 to 6 (staging) MUST PASS BEFORE AND AFTER.** They are the control for the claim this change
rests on: that the export needed no new access to anything. A difference between the two runs would mean
somebody's visibility moved, which is the one thing this change must not do.

**Section 7 (`--app`) holds the ONE judgement expected to FAIL before the merge:** the privacy page
carrying the sentence about the download. It is the only part of this feature a script with no session
can watch change — the route needs a session and `/settings` is behind the proxy's sign-in check — and
it changes when the pull request is merged and deployed.

**So: 1 expected BEFORE failure, out of 10 judgements.** Section 6 of this file lists all ten, and the
count is checked against that list rather than asserted.

What it creates: **two tasks**, both titled from one fixed prefix (`bi26-export-check`), removed again
in a `finally` and removable with `--cleanup`. Nothing else is written. **No file is uploaded** — issue
#298 records that every CI run already spends one of Alice's thirty daily uploads on staging — and
nothing is sent to any vendor.

## 6. The ten judgements, and which one is expected to fail before the merge

**Counted from the script: ten.** The list is here so the count can be checked against it rather than
taken on trust.

| | Judgement | Section | Before the merge | After |
|---|---|---|---|---|
| 1 | `judgeStagingUrl` — the project this is pointed at | 1 | PASS | PASS |
| 2 | the fixture: a team Alice owns that Carol is in | 2 | PASS, or **UNVERIFIED** if there is no such team | same |
| 3 | `judgeOwnTasksOnly` — her task is in, Carol's is not, **and the policy would have shown it** | 3 | PASS (3 parts) | PASS |
| 4 | `judgeOutsiderSeesNothing` — Bob's version of all five reads | 4 | PASS (5 reads) | PASS |
| 5 | `judgeSignedOutSeesNothing` — the publishable key alone | 4 | PASS (5 reads) | PASS |
| 6 | `judgeClosedTablesRefuse` — `usage_counts` and `account_status` | 5 | PASS (2 tables) | PASS |
| 7 | `judgeConsentReadable` — the column refused, the function answering, and unaskable about anybody else | 6 | PASS (3 parts) | PASS |
| 8 | **`judgeExportSentenceOnPage` — the privacy page carries the download sentence** | 7 | **FAIL** | PASS |
| 9 | `judgeExportPathNotPublic` — `/settings/export` hands nothing to a cookieless caller | 7 | PASS | PASS |
| 10 | the two marked tasks were created | 3 | PASS (2) | PASS |

**Why 9 passes both times, said rather than left to be noticed:** before the merge the route does not
exist; after it, the proxy turns a cookieless request away because `/settings` is not in `PUBLIC_PATHS`.
Both are the right answer. The check is there for the day somebody adds `"/settings"` to that list — and
it decides on the **body**, not on the redirect, so a 200 carrying something shaped like the export file
fails even if the path looks right.

## 7. What is NOT checked here, and it is everything a browser or staging would say

1. **Nothing has been run against staging.** No session has been created, no row written, no read made.
   Every judgement in that script has been exercised only against answers this session invented.
2. **No export file has ever been produced.** `buildExport` has been called hundreds of times with
   made-up rows; nothing has read a real row, and **no file has been downloaded by anybody**. In
   particular the `files_on_your_tasks` section has never met a real Storage listing, so whether
   `created_at` is the field name a listing actually carries is **read off the installed client's own
   type and not observed** — `readFileList` in `web/src/lib/attachments.ts` reads `metadata.size` the
   same way and that one has been seen to work on staging.
3. **No screen has been opened.** The **Your data** card has not been looked at on a laptop or a phone,
   and whether a `btn--quiet` anchor reads as something to press is not a question any check here can
   answer. That is the same item `evidence/build-it-23-attachments-screen.md` has carried about the
   files panel since 9 October and `evidence/build-it-26-legal-pages.md` carried about the two pages
   until the owner looked.
4. **No browser has downloaded the file**, so whether `Content-Disposition` behaves as intended —
   a download rather than a tab full of JSON — is a reading of a header and not an observation.
5. **The 200-task ceiling on the file listing has never been reached.** `EXPORT_LIST_TASK_LIMIT` is
   200 and nobody on staging has 200 tasks, so `tasks_whose_files_were_not_listed` has only ever been
   non-zero in a check.
6. **And `getUser()`'s `created_at` has not been seen.** The field is on the installed client's `User`
   type (`web/node_modules/@supabase/auth-js/dist/module/lib/types.d.ts:402-416`, read this session) and
   no real answer has been looked at.

## 8. The three gaps this change leaves, each filed rather than mentioned

| | What | Issue |
|---|---|---|
| **1** | **`scripts/staging/build-it-26-export-checks.mjs` is named in no CI job**, so its 44 logic cases run nowhere and cannot fail a pull request. The same fault as [#302](https://github.com/build-once/team-tasks/issues/302) the day before, and [#167](https://github.com/build-once/team-tasks/issues/167) and [#102](https://github.com/build-once/team-tasks/issues/102) before that. **Not fixed here on purpose**: the fix is one line in `.github/workflows/ci.yml` plus one expected count, and **AGENTS.md rule 5 says that file changes only when the owner asks.** Adding a selftest strengthens a check rather than weakening one, so it is a question rather than a refusal | [#304](https://github.com/build-once/team-tasks/issues/304) |
| **2** | **The file listing stops at 200 tasks**, so a person near the 500-task cap gets a file whose `files_on_your_tasks` section is partial, and the only thing that says so is a number inside it. **And nobody has measured what 200 listings cost**, so the ceiling protects against something whose shape nobody has seen | [#305](https://github.com/build-once/team-tasks/issues/305) |
| **3** | **No export file has ever been produced.** Nothing run against staging, nobody has downloaded one, no screen opened — and two fields (`created_at` on a Storage listing, and on the session's user object) are read off an installed package's type rather than off an answer. Section 7 above is the list, and the issue is the version of it somebody can tick off | [#306](https://github.com/build-once/team-tasks/issues/306) |
