# Evidence: Build it 26 — delete your account, and download your data

Result: **AN ACCOUNT HAS NOW BEEN DELETED ON STAGING, AND IT FOUND THREE FAULTS — all three fixed here.**
Section 2c is the owner's Dave test of 13 October 2026, what passed, what did not, and what the fixes
can and cannot be said to prove. The **second** migration and the fixed function are applied and
deployed **nowhere**.
Date: 2026-10-13, and updated the same day after the owner's staging run.
How checked: `node scripts/screen-state-check.mjs`, `deno test supabase/functions/_tests`,
`npm run lint`, `npm run build`, `node scripts/check-workflows.mjs`.
Checked by: Claude Code. **No dashboard, no connector, no browser, and nothing run against staging or
production.**

---

## 1. What was built, in one list

The book's Build it 26 step 4, and the owner's change of method of 13 October 2026: one pull request, the
book's own prompts and checks, no added process.

| | |
|---|---|
| `supabase/migrations/20261013140000_account_deletion.sql` | the **five** schema changes `docs/deletion.md` §6.1 names, and nothing else. **APPLIED TO STAGING by the owner on 2026-10-13**, for the Dave test |
| `supabase/migrations/20261013170000_my_attachment_names.sql` | **added after that test** — one `security definer` read, which is fault 1's fix. **Applied nowhere** |
| `supabase/functions/delete-account/` | the nine steps of §3, in that order. **Deployed nowhere** |
| `supabase/functions/_tests/delete_account_test.ts` | 22 tests over the real exported pieces of that function |
| `web/src/lib/account-deletion.ts` | every sentence, the typed phrase, and the eight refusal codes. Import-free |
| `web/src/app/settings/page.tsx` | the **Your data** card and the **Delete my account** card, two steps |
| `web/src/app/settings/actions.ts` | `deleteAccount` — a server action, not a route |
| `web/src/app/delete-account/page.tsx` | the public request page, **no form** |
| `web/src/lib/supabase/proxy.ts` | `"/delete-account"` in `PUBLIC_PATHS` |
| `web/src/app/page.tsx` | one sentence for `?deleted=1`, on the only page left after a deletion |
| `web/src/lib/export-data.ts`, `web/src/app/settings/export/route.ts` | the export |
| `web/src/lib/legal.ts` | the privacy page's deletion sentences, rewritten |
| `scripts/screen-state-check.mjs` | sections 12 and 13, and 11f and 11i turned over |

**Nothing else in `supabase/` is touched.** No other migration, no other function.

## 2. The five commands

| Command | Result | Exit |
|---|---|---|
| `node scripts/screen-state-check.mjs` | **425 of 425 checks passed** | **0** |
| `deno test … supabase/functions/_tests` | **ok \| 278 passed \| 0 failed** | **0** |
| `npm run lint` | no output, which is eslint saying nothing is wrong | **0** |
| `npm run build` | every route compiled; see below | **0** |
| `node scripts/check-workflows.mjs` | **6 workflow files, 27 jobs, 0 problems, 0 warnings** | **0** |

**310 → 425 pure checks**, both numbers counted this session — the before by running `main`'s own copy of
the script beside the real one (`310 of 310`) and deleting the temporary file. **250 → 278 Deno tests.**

**CI needs no change for either.** `.github/workflows/ci.yml:347` holds
`EXPECTED_SCREEN_STATE_CHECKS: "297"` and `:857` holds `EXPECTED_FUNCTION_TESTS: "250"`; both comparisons
are floors (`-lt`), and the Deno job names the **folder** rather than a file — which is issue #167's fix
paying for itself a third time.

### What the build says, and one line of it is a finding

```
┌ ƒ /
├ ○ /delete-account
├ ƒ /settings
├ ƒ /settings/export
```

* **`/settings/export` is `ƒ` dynamic.** A `○ Static` there would have been a finding and not a detail: a
  prerendered export is one person's file served to everybody.
* **`/delete-account` is `○` static**, which is right — it is text and one `mailto:`.
* **`/` MOVED FROM `○` TO `ƒ`**, and that is this change's doing: it now reads `searchParams` for
  `?deleted=1`. It is a page with no data read and no secret, so the cost is a render rather than a
  query — but it is a change to the only page in this app that was prerendered for everybody, and it is
  recorded rather than left in a diff.

## 2b. THE ONE BUG THE COACH'S READ FOUND, AND IT WAS A REAL ONE — 2026-10-13

**Step 2 cleared the whole folder of every task the caller CREATED.** A task they created in **somebody
else's team survives them** — that is decision 1, and the entire reason this change has a migration — so
emptying its folder **deleted the files their team mates had attached to a task that was staying.**

**Nothing here would have caught it.** All 17 tests were about which **rows** go, and every check in
section 13 was about words, order and privilege. The bug was a `for` loop over the right list for the
wrong job.

**The recorded decision, which the fix implements:** remove every file the departing person **uploaded**,
wherever it is; remove **everything** only on tasks that are themselves being deleted.

| | |
|---|---|
| `folderPlan(split, ownedTeamIds)` | **new, and PURE, which is the point** — the two lists are worked out by a function a test can ask directly, rather than inside the handler's loops. `whole` is `tasksToDelete`'s list; `mineOnly` is the caller's own tasks that **survive**, plus every task they did not create |
| the two walks | `for (const taskId of folders.whole)` and `for (const taskId of folders.mineOnly)`. **Neither iterates `split.own` or `split.elsewhere` any more**, and section 13d asserts both absences |
| step 4a | uses `folders.whole` rather than calling `tasksToDelete` a second time, so **the rows deleted and the folders emptied cannot drift** |
| a refusal on the uploader-only path | **already not a failure, and now said in the code**: `clearMine` never reads the error from a `remove`, because being refused is what "that file is not mine" looks like. Only a folder it could not **list** sets `ok` false |
| the warning's file count | **it counted other people's files as this person's loss.** Counted only on the tasks being deleted now (`readWhatWouldGo` filters to personal-or-own-team), the sentence says "on **those** tasks", and `DELETE_UPLOADS_ELSEWHERE` says why the number is smaller: uploads on a surviving task go too, and other people's files on it do not |
| the task count | **also narrowed**, in the same pass: the sentence says "will be deleted" and a task in somebody else's team will not be. And it is **null if the TEAMS read failed**, because without the owned team ids an undercount would be dressed as a fact |

**Five new tests, including the one the coach asked for by name** — Dave's task in Alice's team with a
file of his and one of Carol's: his goes, Carol's stays, the task stays. **22 passed, 0 failed**, and the
folder went 267 → **272**.

**Seen to fail.** `folderPlan`'s `whole` put back to every own task, which is exactly what the loop used
to do:

```
THE FOLDER PLAN: whole only for the tasks that are going ... FAILED
DAVE'S TASK IN ALICE'S TEAM: his file goes, Carol's stays, the task stays ... FAILED
CAN THIS FAIL: the old implementation emptied every task he created ... FAILED
every task is in exactly one of the two lists, never both and never neither ... FAILED
FAILED | 18 passed | 4 failed
```

Exit **1**. Reverted: **272 passed**, and **416 of 416** pure checks.

**What this does NOT change: the owner's steps.** The Dave test's step 5 already has Dave writing a task
in Alice's team, and its expected count already requires that row to be there with a null `owner_id`.
What the fix changes is that **a file Carol attached to it must still be there afterwards too** — which
the count's `files` column already says is unchanged.

## 2c. THE OWNER'S DAVE TEST ON STAGING — three faults, all three fixed. 13 Oct 2026

**Owner-reported. Nobody writing this ran it, opened a browser or used a connector.** The function was
deployed from `c09d6a1` and the coach confirmed the deployed source contains `folderPlan`.

**What passed:** the login gone and sign-in refused; Dave's crew and his two own-list tasks gone; the
invitation to his address gone; **his task in Alice's team survived with `owner_id` null**; the bucket
back to its three pre-test files; no orphaned objects and none with a missing owner.

### Fault 1 — a team mate's file was deleted from the surviving task

The task ended with **0 files**: one uploaded by Dave at 14:37:33Z and one by another member at
14:38:35Z, both gone.

**The cause, and it was a piece of reasoning rather than a typo.** `clearMine` attempted every file on a
surviving task and trusted the DELETE policy to refuse the ones that were not the caller's. True on a
task somebody **else** created — and **false on a task the caller created**, where
`"Attachments: delete a file you attached, or one on your task"` admits the task's **creator** for every
file. Nothing was refused.

**AND THE UNIT TEST SHARED THE ASSUMPTION WITH THE BUG.** It stubbed nothing about the policy, so "the
policy refuses what is not yours" was taken as given by the thing testing it. No number of cases over
`folderPlan` could have found this.

**The fix: stop inferring, and ask.** A second migration,
`20261013170000_my_attachment_names.sql` — `20261013140000` is applied on staging, so an edit to it was
not available. One `security definer` function, `authenticated` only, taking **no arguments**, returning
the names of the `attachments` objects whose `owner_id` is `auth.uid()`, with `is_active()` in the body.
`delete-account` deletes exactly those under a surviving task; `clearMine` is **gone**, and §13d asserts
its absence as well as the new shape.

**WHAT THE NEW TESTS DO AND DO NOT PROVE, said plainly:**

| | |
|---|---|
| **They prove** | that an unanswered `my_attachment_names()` is **not** read as "you uploaded nothing" (it refuses the whole deletion); that a malformed name never reaches a delete; and that only names under a **surviving** task are selected |
| **They do not prove** | **anything about the real policy or the real function.** That `my_attachment_names()` returns exactly the caller's rows is a property of a migration **applied nowhere**; that the DELETE policy then admits the uploader for each of those names is a property of a policy no test here evaluates. **Only a staging run can say either** — which is the whole lesson of this fault, and why the re-test exists |

### Fault 2 — the surviving task said nothing, and its team's owner had no Delete

The owner's screenshot: title, team chip, Suggest subtasks, Files, Rename. **Nothing said its author had
gone**, and the one person the new policy allows to remove it was offered no control — **a row nobody can
act on**, which is the opposite of issue #83's fault and just as wrong.

Both added: `FORMER_MEMBER` (the design's own words) drawn when `owner_id` is null, read out as "by
Former member"; and `mayDeleteTask`, which admits the creator **or** the owner of its team when there is
no creator — the same pair the policy admits. My tasks now reads `owner_id` on the teams query for that
one question, and **an empty owned-team set on a failed read draws no Delete rather than one on a guess.**

### Fault 3 — the export listed another person's file by name

**A file name is free text somebody's phone chose**, so that was one person's file name inside another
person's downloadable file. The listing is intersected with `my_attachment_names()` — the same source as
fault 1 — an **absent** answer makes the whole section `could_not_be_read` rather than a shorter list
presented as complete, and `NOT_IN_THIS_FILE` gained a **tenth** line saying other people's files on your
tasks are not listed and why.

### What it cost in checks

**425 pure checks** (from 416) and **278 Deno tests** (from 272). Seen to fail, twice more:
`mayDeleteTask` loosened to "any member may delete a former member's task" turned **2** red, and the
export's intersection removed put `carol-photo.jpg` back in the file — **1** red, naming it.

## 3. Four deliberate breakages — can these checks fail?

### 3.1 A truthy confirmation — **1 check red, and it is the one that matters**

`phraseMatches` replaced with `Boolean(typed)`:

```
FAIL  and nothing else is one: a boolean, a number, 'yes', or the phrase with more after it
        expected [false,false,false,false,false,false,false,false,false]
        got      [true,true,true,true,true,false,false,false,true]
```

Exit **1**. The `true`s are, in order, `true`, `1`, `"yes"`, `"ok"`, the phrase with a word after it, and
an array. **Every one of those is a shape a single click would send**, and the book's prompt asks for "a
clear confirmation step".

### 3.2 An unknown count drawn as a nought — **1 check red**

`deletionWarning` made to use `counts.tasks ?? 0`:

```
FAIL  an unreadable count says so, and a 0 appears nowhere in those sentences
        expected [true,true,true,false]
        got      [false,true,true,true]
```

Exit **1**. **This is the worst `0` in the whole app**: "0 tasks of yours will be deleted" over a count
this app could not read invites somebody to press the one irreversible button believing they are losing
nothing. Build it 19's rule — a failed read is never an empty list — applied to a warning.

### 3.3 Deleting every task the person created — **2 Deno tests red**

`tasksToDelete` made to return all of `own`:

```
THE TASK IN SOMEBODY ELSE'S TEAM IS NOT DELETED -- decision 1 ... FAILED
CAN THIS FAIL: deleting every task he created would take Alice's team's copy ... FAILED
FAILED | 15 passed | 2 failed
```

Exit **1**. **This is the whole of decision 1 of 2026-10-12**, and the reason the check is worth having is
in `20261002133637_tasks_join_teams.sql`'s own words: "Carol losing her own task because Alice closed her
account is a stranger deleting Carol's work, and this database has no point-in-time restore on the free
plan to undo it with."

### 3.4 And the export's two, from the branch this work came from

Repeated here because the code is the same and the breakages were run on it: a failed read returning `[]`
turned **9** checks red, and a `...invitation` spread putting `token_hash` into somebody's download turned
**2** red. Both are in section 12 of the check script.

**All four were reverted** — restored with `git checkout --` from the index — and the runs after them are
exit **0** again, at 414 of 414 and 267 passed.

## 4. Seven findings in these checks' own first run, and every one was real

Not one was a typo. Each says something about the thing being checked.

| What went red | Why | What it changed |
|---|---|---|
| the button count, 20 → 21 | `account_delete` is a real new button | **the number, and it is this file's AGENTS.md rule 20 line.** Raising it is the only thing a new button may do to that check: the two assertions that matter — every identifier is lower-case-and-underscores, and no LABEL is in the list — are untouched, and `account_delete` passes both. **Agreed by the owner** in the instruction that asked for this build |
| "one form only" on the settings page | the check counted the forms on the page and required **one**, which was true for an afternoon | it now asks the question it meant: the export's path is in an `href` and in **no** `action` |
| `user_id: userId` found in the delete action | it counted across the whole file and found the **consent** action's insert, which has to carry one | it reads the `invoke` call's body only, and requires that body to have no id, no email and no `user_id` at all |
| `checkSuspension` counted 3, is 2 | the type is named only in comments, which are stripped | the expectation. Two: the exported function and the one call |
| the request page held a sentence of its own | the `<head>` **description** — and a description *is* a claim: it is shown in a search result | moved into `account-deletion.ts` as `REQUEST_DESCRIPTION`, which is the rule `legal.ts` already states about its own |
| `is_team_member` found in the migration | **the migration's own comment** saying both new policies read `teams.owner_id` **directly rather than** through that function | the SQL is read with `--` comments stripped. **This is the FIFTH time in three pull requests that a comment has tripped a check it was describing** — `evidence/build-it-26-legal-pages.md` §8 records three, and the fourth is in the next row |
| `tombstone` counted 0, expected 1 | the migration shouts it in capitals and `count` is case-sensitive | the check reads the **source** case-insensitively — the one check in section 13h that does, because the word belongs in a comment and nowhere else |
| and then **two more went red after a `git checkout --`** | the restore re-checked the function out with **CRLF**, and two checks matched on multi-line literals | the function's text is read with line endings normalised. **A check that passes on Linux and fails on Windows would turn somebody's pull request red for a reason that has nothing to do with what it tests**, which is the failure `web/tests/staging.mjs` already guards against beside `signIn` — and it was found by the breakage runs rather than by CI |

## 5. What this change DOES NOT include, and where each went

| | Where |
|---|---|
| **The 30-day tombstone.** So a restore from a copy taken before a deletion brings the person back, for up to about fifteen days, and nothing notices | [#309](https://github.com/build-once/team-tasks/issues/309), at the owner's instruction. **The privacy page did not have to change for it**, checked rather than assumed: it says what a recovery does — everybody signs in again — and nowhere claims a deleted account stays deleted through one |
| **Any apply or deploy.** The migration and the function both | the owner's steps. `delete-account` **cannot succeed** without the migration: step 6 is refused by `tasks_enforce_column_rules()` the moment the cascade tries to null an `owner_id`, so a deploy without an apply would leave a button that always fails |
| **A custom staging script** | not written, by the owner's change of method. The book's own check is the Dave test, which the owner runs |
| **A separate plan pull request, a sandbox probe write-up, and any new document but this one** | not written, same reason |

## 6. What is NOT checked here, and it is everything that matters most

1. **No account has ever been deleted.** Not on a local database, not on staging. Every judgement in
   `delete_account_test.ts` has been exercised only against rows this session invented.
2. **The migration has been applied nowhere** — not local, not staging, not production — so **four things
   are reasoned about rather than observed**:
   * that the cascade can null an `owner_id` at all, which is the trigger branch's whole purpose;
   * that the new delete policy on `tasks` really admits a team owner for a former member's task;
   * that the new delete policy on `storage.objects` really lets that owner clear its files — **without
     which the first is useless**, because `tasks_refuse_delete_with_files` refuses the task;
   * and that the constraint lookup in section 1 finds exactly one foreign key. It raises and applies
     nothing if it does not, which is the right direction, and nobody has seen it run.
3. **`auth.admin.deleteUser` has never been called.** Its signature is read off the installed client —
   `deleteUser(id: string, shouldSoftDelete?: boolean)`, defaulting to `false`
   (`web/node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.d.ts:608`, read this session, version
   2.117.2) — and the function's own Deno dependency is pinned separately, so even the version is an
   inference.
4. **Step 3's policy-as-filter cannot be measured.** A storage listing does **not** say who uploaded a
   file: the installed client marks `owner` as "NOT returned by list() or remove() operations. This field
   should not be relied upon." So the function attempts each file on a task it did not create, one at a
   time, and the DELETE policy admits exactly the caller's own uploads. **Completeness comes from the
   policy, not from a read-back**, and that is the one step in the whole operation whose success cannot be
   confirmed by looking.
5. **No export file has ever been produced**, and two of its fields are read off a package's **type**
   rather than off an answer: `created_at` on a Storage listing, and on the session's user object.
   [#306](https://github.com/build-once/team-tasks/issues/306).
6. **No screen has been opened**, on a laptop or a phone. The two cards on Settings, the request page and
   the sentence on the home page have been looked at by nobody — and the one thing a browser would settle
   that nothing here can is whether a two-step destructive control reads as careful or as broken.
7. **The 200-task ceiling on the file listing has never been reached**, and neither has the function's own
   1000-task ceiling. [#305](https://github.com/build-once/team-tasks/issues/305).

## 7. The Dave test, which is the book's own check and the owner's to run

The book asks for "a test that creates a user with data in every table and bucket, deletes the account,
and counts what remains". That is the Dave test, it needs an apply and a deploy, and **it is the owner's
from start to finish** — rules 1 and 10, and the owner's instruction not to apply or deploy anything here.

The steps and the SQL are in the pull request. **What this file can say is what the count should be**, so
that a run has something to be compared against rather than read:

| After Dave's account is deleted | Should be |
|---|---|
| `auth.users` rows for Dave | **0** |
| `profiles`, `account_status`, `usage_counts`, `team_members` rows for Dave | **0** each, by cascade |
| `teams` Dave owned | **0**, by cascade |
| `invitations` in those teams, and invitations addressed to Dave's address | **0** — the first by cascade, the second by step 5, which is the only one of these that does **not** cascade |
| Dave's own tasks, personal or in his own team | **0**, by step 4a |
| Files on any of those tasks | **0**, by step 2 |
| **The task Dave wrote in ALICE'S team** | **1, with `owner_id` NULL** — and this is the row the whole test is for |
| Alice's team, her memberships, her own tasks | **unchanged** |
| Carol's view of that team | **unchanged** |

**And one count that is zero for a different reason: there is no record anywhere that Dave existed.** No
tombstone (#309), so nothing to count.
