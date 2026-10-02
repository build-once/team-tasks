# Evidence: Build it 15 part 2 (My tasks screens for team tasks)

Issue #86, part 2 of four, and it closes #83. Branch `feat/team-tasks-screens`. No migration: part 1
(`supabase/migrations/20261002133637_tasks_join_teams.sql`, PR #85) is the whole of the schema this
needs, and it is already live in staging and production.

Two halves below, and the line between them matters:

- **§1 to §3 were run by the assistant (Claude Code) on 2 Oct 2026**, on this machine, and the output
  is pasted as it came back.
- **§4 has not been run by anybody yet.** It is the part that needs a browser and the three staging
  accounts, whose passwords the assistant does not have. Every line of it is **unverified** until the
  owner works through it and writes the result here.

## 1. Lint and build

Both from `web/`, on 2 Oct 2026.

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
✓ Running next.config.ts took 78ms

  Creating an optimized production build ...
✓ Compiled successfully in 1012ms
  Running TypeScript ...
  Finished TypeScript in 2.4s ...
  Collecting page data using 12 workers ...
✓ Generating static pages using 12 workers (10/10) in 1165ms
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

exit=0
```

(The build's static-page progress lines are trimmed to the last one. Nothing else is left out.)

## 2. The filter helpers, checked against the real module

`node scripts/tasks-filter-check.mjs`, from the repository root. It imports
`web/src/lib/tasks.ts` itself rather than a copy, and covers the four pure decisions this feature
rests on: `readFilter`, `resolveFilter`, `filterAfterAdd` and `tasksPath`.

```
37 of 37 checks passed.

exit=0
```

The full list of check names is in the script's own output; the names are written to be read.

**What this does NOT cover**, said plainly: nothing about the database, nothing about who can see what,
and nothing drawn on a screen. Those are §4 and
`scripts/staging/build-it-15-checks.mjs`.

## 3. The checks were made to fail first

A check that has never failed has not been shown to check anything. Each of the four functions was
broken in turn, the script was run, and the module was put back. Exit code 1 every time.

| What was broken | What went red | Failing checks |
|---|---|---|
| `readFilter` no longer lower-cases a team id | the two checks about an upper-case id | 35 of 37 passed |
| `resolveFilter` always reports `missed: false` | a filter naming a team you are not in was applied instead of refused — exactly the shape of #83 | 2 in that section |
| `filterAfterAdd` always returns the current filter | adding into a list you are not looking at | 3 in that section |
| `tasksPath` joins values without encoding them | `rename=a b&problem=save` came back unencoded, so a value could add a parameter | 1 in that section |

**The break-it run found a real flaw in the check script itself**, which is the argument for doing it.
The first version used fake team ids made of digits and dashes only, so `toUpperCase()` returned the
same string and the "an upper-case team id is lower-cased" check passed with the lower-casing deleted.
The ids now contain hex letters, and the comment in the script says why.

## 4. The owner's checks — partly run, 2 Oct 2026

`localhost:3000` against **staging**, as the three test accounts in `docs/environments.md`. Carol must
already be a member of one of Alice's teams; Bob must be in neither. That is the same setup part 1
needed.

Recorded from the owner's report of what they ran on 2 Oct 2026 at `localhost:3000` against staging, as each
person, with this PR's code. **PASS (owner)** means the owner ran it, not the assistant. Rows marked
**not run** were not reported and are not inferred.

| # | As | Check | Result |
|---|---|---|---|
| 1 | Alice | **Which list** chooser offers Personal and her teams, and no team she is not in | PASS (owner), 2 Oct 2026. Chooser offered Personal, Alice's team and Inbox check |
| 2 | Alice | Adds a task choosing her team: it appears with the team's **name** on it | PASS (owner), 2 Oct 2026. Shows the "Alice's team" label |
| 3 | Alice | Adds a personal task: no team name on it | PASS (owner), 2 Oct 2026. No team label |
| 4 | Alice | **All tasks / Personal / <team>** each show what they say, and the one being shown is marked | not run (owner reported only the team and Personal filters, see §5) |
| 5 | Alice | The done count changes with the filter and the line under it names the list | not run (owner reported only that the count names Alice's team, see §5) |
| 6 | Alice | Renaming and ticking from a filtered list come back to that same list, not to "all" | not run |
| 7 | Alice | Adding a personal task while filtered to a team leaves her looking at Personal, with the new task visible | not run |
| 8 | Alice | Delete on her own task works, with the confirm step | not run |
| 9 | Carol | Sees Alice's team task, **labelled with the team** | PASS (owner), 2 Oct 2026. Labelled "Alice's team" |
| 10 | Carol | Can tick it, and can rename it | PASS (owner), 2 Oct 2026. Ticked and renamed; staging shows the title now "Team check Rename" |
| 11 | Carol | Has **no Delete** on it — the control is not drawn at all | PASS (owner), 2 Oct 2026. No Delete control |
| 12 | Carol | Typing `/tasks?confirm=<that task's id>` by hand still draws **no** Delete button | PASS (owner), 2 Oct 2026. Hand-typed `/tasks?confirm=91db1858-fe37-4a7e-b459-8b22006f8303` (Alice's team task) drew no Delete button or prompt |
| 13 | Carol | Does not see Alice's personal task | PASS (owner), 2 Oct 2026 |
| 14 | Bob | Does not see Alice's team task at all, and his chooser does not offer her team | PASS (owner), 2 Oct 2026. Sees neither of Alice's tasks; add-task box shows no team name |
| 15 | Alice | `/tasks?filter=<a team she is not in>` shows every task she can see, and says that is not one of her lists | not run |

Check 12 is the one worth not skipping: it is the difference between a control that is hidden and a
rule that is enforced. The database refuses the delete either way — the owner-only delete policy from
`20260927182443_create_tasks.sql` is untouched by all of this — and `scripts/staging/build-it-15-checks.mjs`
already proved that on staging (26 PASS, see `evidence/build-it-15-part-1.md`). What check 12 adds is
that the screen does not offer the refusal.

## 5. Notes

- **Partial reports.** Check 4: the owner saw the "Alice's team" filter show only the team task and "Personal
  only" show the personal task and not the team task; "All tasks" and the marked-current indicator were not
  reported. Check 5: the done count named Alice's team under that filter; that it changes between filters
  was not reported. Check 1: the owner reported what the chooser offered; that a team Alice is not in is
  absent was not reported separately.
- **Staging state**, confirmed by the coach through the staging read-only connector, not by the assistant:
  both test tasks exist as created, the team task in Alice's team and the personal task with no team, both
  created by Alice.

- **Data captured from production: none.** Nothing was redacted, because nothing was captured. The
  team ids in `scripts/tasks-filter-check.mjs` were invented for it and belong to no database.
- **The done count's rule, written down** because #83 asks for it: the count is of what the filter is
  showing, no more and no less, and the line beside it names that list. It is not "your own tasks
  only" — a team's list is a shared one, and "4 of 9 done in Tuesday crew" is the sentence the
  organiser wants. Filtering to Personal is how you count only your own. The same words are in the
  comment above `doneCount` in `web/src/app/tasks/page.tsx`.
- **#16 is untouched and still open**: `setDone` does not notice when it changes nothing. This change
  gave it an honest message for an *error*, including a 42501 refusal, but a tick that quietly matches
  no row still looks like it worked.
- **No migration, and none is needed.** Every rule these screens rely on was created by part 1.
- `scripts/tasks-filter-check.mjs` is **not run by CI**. Filed as an issue; see the pull request.
