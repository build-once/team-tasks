# Evidence: Build it 26 — delete your account, and download your data

Result: **PASS for everything this repository can answer, and NOTHING has been applied or deployed.** The
migration is applied nowhere, the function is deployed nowhere, and **no account has ever been deleted and
no export file has ever been produced.** Five commands below with their exit codes, and four deliberate
breakages.
Date: 2026-10-13.
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
| `supabase/migrations/20261013140000_account_deletion.sql` | the **five** schema changes `docs/deletion.md` §6.1 names, and nothing else. **Applied nowhere** |
| `supabase/functions/delete-account/` | the nine steps of §3, in that order. **Deployed nowhere** |
| `supabase/functions/_tests/delete_account_test.ts` | 17 tests over the real exported pieces of that function |
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
| `node scripts/screen-state-check.mjs` | **414 of 414 checks passed** | **0** |
| `deno test … supabase/functions/_tests` | **ok \| 267 passed \| 0 failed** | **0** |
| `npm run lint` | no output, which is eslint saying nothing is wrong | **0** |
| `npm run build` | every route compiled; see below | **0** |
| `node scripts/check-workflows.mjs` | **6 workflow files, 27 jobs, 0 problems, 0 warnings** | **0** |

**310 → 414 pure checks**, both numbers counted this session — the before by running `main`'s own copy of
the script beside the real one (`310 of 310`) and deleting the temporary file. **250 → 267 Deno tests.**

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
