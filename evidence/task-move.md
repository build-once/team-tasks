# Evidence: "Move to…" for a task's creator

Issue #101, which closes #88 and #91. Branch `feat/task-move`. **No migration**: the rules this
screen needs were written and proved in Build it 15 part 1
(`supabase/migrations/20261002133637_tasks_join_teams.sql`) and narrowed in part 3
(`20261002170244_tasks_drop_owner_only_rules.sql`). Both are already applied to staging and
production. This change is screen code only — the control, not the permission.

Two halves below, and the line between them matters:

- **§1 to §4 were run by the assistant (Claude Code) on 3 Oct 2026**, on this machine, and the
  output is pasted as it came back.
- **§5 was run by the owner on 3 Oct 2026**, in a browser against staging, and what is written
  there is **their report, not the assistant's observation**. Nine of its twelve checks were run and
  all nine passed. Checks 3, 5 and 7 were not run and stay **unverified**; three details inside
  checks that did pass were not reported, and each is marked where it sits.

## 1. Lint and build

Both from `web/`, on 3 Oct 2026. Run as a single command each, with the child process's own exit
code printed last, so nothing is chained (rule 4) and the code is not taken on trust (rule 3):
`(Start-Process -FilePath "npm.cmd" -ArgumentList "run","lint" -WorkingDirectory ... -NoNewWindow -Wait -PassThru).ExitCode`

```
$ npm run lint

> web@0.1.0 lint
> eslint

exit=0
```

```
$ npm run build

> web@0.1.0 build
> next build

▲ Next.js 16.3.6 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 45ms

  Creating an optimized production build ...
✓ Compiled successfully in 588ms
  Running TypeScript ...
  Finished TypeScript in 2.4s ...
  Collecting page data using 12 workers ...
✓ Generating static pages using 12 workers (10/10) in 1118ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /auth/callback
├ ƒ /auth/signout
├ ƒ /invite/[token]
├ ƒ /login
├ ƒ /signup
├ ƒ /tasks
└ ƒ /teams


ƒ Proxy (Middleware)

exit=0
```

(The build's static-page progress lines are trimmed to the last one. Nothing else is left out.)

## 2. The repository's own test suite

`npm test` from the repository root, on 3 Oct 2026. It does not touch the web app; it is here
because this change must not break anything else.

```
$ npm test

PASS: 513 rule examples across 24 rules, plus 32 fail-closed checks.
lint-skills: PASS - 12 skills, 0 problems
launch-check selftest: PASS (171/171 assertions, 39 checklist items, 17 auto checks, git available)
Self-test: 7/7 cases passed.
Checked 4 workflow file(s), 16 job(s): 0 problem(s), 0 warning(s).
vet-tool selftest: PASS (34/34 assertions; 20 malicious detections, 24 findings on malicious fixture, 0 HIGH/MEDIUM on benign near-miss control)
handoff selftest: PASS (57/57 assertions; 11 secret types redacted, 9 controls unchanged, end-to-end ran)
Self-test: 20/20 cases passed.
AI team self-test: 258 passed, 0 failed.
Checked 6 workflow file(s), 14 job(s): 0 problem(s), 0 warning(s).

exit=0
```

(One summary line per sub-suite. The per-case PASS lines are in the run itself; none failed.)

## 3. The pure helpers, checked against the real module

`node scripts/tasks-filter-check.mjs`, from the repository root. It imports `web/src/lib/tasks.ts`
itself rather than a copy. Eleven checks are new in this change: seven for `taskTeam` and four more
for `tasksPath`.

```
$ node scripts/tasks-filter-check.mjs

taskTeam -- what a task's team chip says, and what it may claim
PASS  a personal task has no chip at all
PASS  a task in a team you are in says the team's name
PASS  a team mate's task in that team says the same name: the chip is about the task, not about who you are
PASS  YOUR OWN task in a team missing from a list that loaded is stranded, and says so
PASS  the SAME task when the teams query failed is not called stranded: nothing is known about your teams
PASS  a task that is not yours, in a team not in your list, claims nothing either
PASS  a personal task is never stranded, even when the teams query failed

tasksPath -- the only place a /tasks address is built
PASS  the filter travels with a move, so the chooser opens in the list you were in
PASS  where a task was moved to: Personal
PASS  where a task was moved to: a team, named by its id for the page to look up

47 of 47 checks passed.

exit=0
```

(The four older sections — `readFilter`, `isTeamId`, `resolveFilter`, `filterAfterAdd` — and the
seven older `tasksPath` checks all passed too; they are left out here only for length, and the
total of 47 counts them.)

**What this does NOT cover**, said plainly: nothing about the database, nothing about who can see
what, and nothing drawn on a screen. The rules live in `supabase/migrations`; the screen is §5.

**It is not run by `npm test` or by CI.** Searched on 3 Oct 2026: `tasks-filter-check` appears in no
file under `.github/`, and `package.json` does not name it. So these 47 checks only run when
somebody runs them by hand, including the three that are this change's safety net. Filed as #102.

## 4. The new checks were made to fail first

Three breaks, one at a time, each put back before the next. A check that cannot go red proves
nothing.

| What was broken, in `web/src/lib/tasks.ts` | What happened |
|---|---|
| `taskTeam`: `if (context.teamsFailed \|\| task.owner_id !== context.userId)` → `if (task.owner_id !== context.userId)` — the honesty guard loses the failed-query half | **46/47, exit 1.** "the SAME task when the teams query failed is not called stranded" FAILED: expected `{"label":"(team not shown)","stranded":false}`, got `{"label":"(a team you have left)","stranded":true}` |
| `taskTeam`: the stranded return → `{ label: TEAM_NOT_SHOWN, stranded: false }` — the app stops recognising a stranded task at all, which is the state #91 is about | **46/47, exit 1.** "YOUR OWN task in a team missing from a list that loaded is stranded, and says so" FAILED: expected `{"label":"(a team you have left)","stranded":true}`, got `{"label":"(team not shown)","stranded":false}` |
| `tasksPath`: `if (typeof value === "string" && value !== "")` → `if (typeof value === "string")` — the one loop that every link and redirect on the page goes through, the new `move` and `moved` keys included | **46/47, exit 1.** "an empty value adds nothing" FAILED: expected `/tasks`, got `/tasks?filter=&problem=` |

Then restored, and green again: **47 of 47, exit 0** (§3).

**Said plainly about the third break.** `tasksPath` has no per-key code — it loops over whatever it
is handed — so the two new `moved` checks and the new `move` check cannot be broken on their own:
any break lands on the shared loop, as above. They are worth having anyway, because they pin the
exact addresses the move flow depends on, and a later rewrite of that loop would fail them.

## 5. The owner's checks — 9 of 12 run on 3 Oct 2026, all 9 passed; 3, 5 and 7 not run

On `localhost:3000` against **staging**, signed in as the staging test accounts
(`docs/environments.md`). The assistant cannot run these: it has no account passwords, and rule 6
puts the three test accounts in a browser the owner drives.

**Everything below is the owner's report, written down as they gave it on 3 Oct 2026.** The
assistant did not watch any of it and has no output of its own to paste, so none of it carries the
kind of evidence §1 to §4 carry — it carries the owner's word, which is what rule 6 leaves
available for these.

### As Alice (owner of a team Carol belongs to)

1. A task Alice created in her team shows **Move to…** beside Rename and Delete. → **PASS**
2. Move it to **Personal**. The task stays on screen with the filter unchanged, a green **"Task
   moved to Personal."** appears, and the team chip is gone. → **PASS**
3. Carol, refreshing My tasks, no longer sees that task. → `unverified — not run`
4. Move it back into the team. The banner names the team, and the chip returns with the team's
   name. → **PASS** — Alice moved a team task to Personal and back; the banner and the chip label
   were both correct.
5. With the filter set to that team, move a task to Personal: the person stays in the team's list,
   the task leaves it, and the banner says where it went — nothing vanishes silently. →
   `unverified — not run`

### As Carol (a member, not the creator)

6. On **Alice's** task in that team: Rename is offered, **Move to… is not**, Delete is not. →
   **PASS** — Rename was offered; Move to… and Delete were both absent on Alice's task.
7. A move request made by hand for Alice's task — the form posted with Alice's task id — is refused
   and the page says **"That task was not moved. Only the person who created a task can move it, and
   only to Personal or to a team they belong to."** No database wording, no "please try again". →
   `unverified — not run`. The owner reports it as covered by the Build it 15 staging proof
   (`evidence/build-it-15-part-1.md` line 50, "PASS  Carol CANNOT move Alice's team task to her own
   team"), as the coach's review on #104 notes.
   **Said plainly: that proof is not this check.** It was run against the staging database, and it
   proves the database refuses Carol's move — which is the half that matters most, and it is proved.
   What check 7 asks about is the sentence the **page** shows when that refusal comes back. That
   wording is still unverified, and the way to settle it is to run check 7 as written.

### The stranded task (issue #91, which needs a hand-made removal)

8. As Carol, create a task in Alice's team. Then have Alice remove Carol from the team — **by hand,
   in the Supabase SQL editor on staging; there is no screen for it**, and that is why this state is
   hard to reach today. → **PASS** — Carol created "Carol stranded test" in Alice's team (the team
   label showed and Move to… was offered); the owner removed Carol's membership in the staging SQL
   editor; the coach confirmed 0 memberships through the staging read-only connector.
9. Carol opens My tasks: the task is **visible**, and its chip reads **"(a team you have left)"** in
   the app's problem colour, not a blank and not a team name. → **PASS** — visible, and the chip
   read "(a team you have left)". The owner did not report the chip's **colour**, so that detail of
   the line is `unverified — not reported`.
10. Carol ticks it: refused, and the page says **"That task is in a team you are no longer in, so it
    cannot be ticked or renamed while it stays there. Use Move to… on the task to bring it back to
    Personal, and you can tick and rename it again."** → **PASS** — that sentence exactly.
11. Carol renames it: the same message, and the row closes so the Move to… control is in front of
    her. → **PASS** on the message — the same sentence exactly. Whether the **row closed** was not
    reported, so that detail is `unverified — not reported`.
12. Carol uses **Move to… → Personal**. It succeeds in one step, and she can then tick and rename it
    normally. → **PASS** on the move and the tick — Move to Personal succeeded and the task could
    then be ticked. **Renaming after the move was not reported**, so that half is
    `unverified — not reported`.

Afterwards the owner restored Carol's membership, and the coach confirmed 1 membership — so
staging is back as it was before check 8.

Result: **PASS on every check that was run.** Nine checks were run (1, 2, 4, 6, 8, 9, 10, 11, 12)
and nine passed; **three were not run** (3, 5, 7) and stay unverified. Three details inside passing
checks were not reported and stay unverified too: the chip's colour in 9, the row closing in 11,
and renaming after the move in 12.

Date: 2026-10-03

## What is still not covered, after all of the above

- **No staging script covers the stranded sequence end to end.** Issue #91 asked for one in
  `scripts/staging/`, alongside `build-it-15-checks.mjs`. Issue #101's proof list does not include
  it, so it is not in this change. Filed as #103 so the gap is written down rather than remembered.
- **Nothing here proves a database rule.** Every claim in §3 and §4 is about four pure functions in
  one TypeScript file. What the database allows was proved in
  `evidence/build-it-15-part-1.md` (§2, on staging) and `evidence/build-it-15-part-3.md` (§3, on a
  local throwaway cluster). This change adds no rule and relies on those.

## Data captured from production

**None.** No production command was run, nothing was read from production, and no value from it
appears in this file or in the change. The two user ids and three team ids in
`scripts/tasks-filter-check.mjs` are invented, in uuid shape; the team names in it
("Tuesday crew", "Hall setup") are made up for the checks.
