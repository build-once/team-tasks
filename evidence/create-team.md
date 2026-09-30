# Evidence: creating a team, and the limits that protect it

Result: PASS — the limits hold, owners are isolated, and the error checks were shown to fire
Date: 2026-09-30
How checked: by hand on a Vercel preview deploy of PR #34, pointing at the staging Supabase project,
signed in as the Alice and Bob test accounts; plus a deliberately broken version of the function
deployed to staging on purpose
Checked by: **the owner**, from their own terminal and browser. See "Who observed what" below — this
matters, and the distinction is not decoration.

## Who observed what

**Everything in the Results section was observed by the owner, not by the assistant.** The assistant
has local and staging access in principle but did not apply the migration, did not deploy the
function, and did not open the preview. It wrote this file from the owner's reports.

What the assistant did check itself, and can stand behind: `npm run lint` and `npm run build` in `web/`
both exit 0, the whole repository test suite passes, and the import specifiers in
`supabase/functions/create-team/deno.json` are pinned to exact versions.

Recording the split rather than blurring it is the point. A file that says "PASS" without saying whose
eyes saw it invites the next reader to assume it was automated.

## What is deployed where

| | Staging | Production |
|---|---|---|
| `supabase/migrations/20260930101343_create_teams.sql` | **Applied** 2026-09-30 | Not applied — happens when PR #34 merges, via `.github/workflows/migrate-production.yml` |
| `supabase/functions/create-team` | **Deployed** 2026-09-30 | Not deployed |

Both were done by the owner from their own terminal. The assistant deploys nothing (`AGENTS.md` rules
1 and 10).

## Results

### 1. The 3-team limit is enforced by the function

Signed in as **Alice**:

- Three teams created, one after another. Each succeeded.
- A **fourth** was refused, with exactly the message the function returns:

```
You own 3 teams, the most allowed.
```

- The staging function log for that attempt shows **409**.

That message is the function's own, shown in the page's Banner. It is worth being precise about why
that matters: an earlier version of the page **hid the Create team form** once three teams existed, so
this refusal could never be reached by anybody using the app. The limit was being asserted only by the
screen. The form is now always visible and the function does the refusing, which is what made this
observation possible at all.

### 2. An empty name is refused

Submitting the form with no name was refused. The function trims before measuring, so whitespace
counts as empty, and `teams_name_not_blank` / `teams_name_length` in the migration are the database's
own backstop.

### 3. Bob cannot see Alice's teams

Signed in as **Bob**: none of Alice's teams were visible.

This is the whole point of the table's single `select` policy — owners read their own teams and nothing
else — and it is the team-level half of `docs/plan.md` feature 5. Enforced in the database, not in the
screens.

Bob then created a team called "Bob test" successfully, so the isolation is not simply everything being
broken for Bob.

### 4. Row-level security is on

The staging Table Editor shows RLS **enabled** on `teams`. Without `alter table ... enable row level
security`, every policy in the migration would be inert and the table would be readable by anyone with
the publishable key.

### 5. The Lesson F14 error check was proven to fire

The check that matters most is the one nobody ever sees. Every run above took a success path, so the
error branch had never executed. It was made to execute on purpose.

On a local throwaway branch `test/broken-column` — never pushed — one character was changed in the
count query only:

```diff
-      .eq("owner_id", ownerId);
+      .eq("owner_idd", ownerId);
```

`owner_idd` is not a column, so the count query fails. The insert below kept the correct `owner_id`, so
this exercised the count path and nothing else. The owner deployed that version to staging and tried to
create a team as **Bob**:

```
Could not check how many teams you already own, so no team was created. Please try again.
```

- **No team was created.**
- The staging function log shows **500**.

That is the behaviour the F14 check exists to produce. The failure it prevents is the opposite one: a
failed count read as "0 teams owned", so the limit fails **open** and a fourth team is written. Before
this test, nothing had shown which of those two the code actually did.

The correct function was then redeployed to staging, and Bob created "Bob test" successfully — so the
breakage was fully reversed, not merely moved on from.

## Personal data in this file

Names only: **Alice** and **Bob**, which are the test-account names in `docs/environments.md`, not real
people. **No email addresses, no user IDs, no team ids, no tokens** — `AGENTS.md` rule 18. The only
free text quoted is the team name "Bob test", typed by the owner for this test.

The function logs nothing of its own, by the decision in `docs/plan.md`: no team name and no email
address ever reaches a log line from server code. The status codes above (409, 500) carry no personal
data, which is why they are safe to quote.

## What this does not cover

- **Production: nothing.** No migration applied, no function deployed, and no production values are set
  in Vercel. Every result above is staging only.
- **Carol was not used.** `docs/environments.md` asks for Alice, Bob and Carol; Carol is the
  team-member case, and team membership does not exist yet — there is no `team_members` table, so
  there was nothing for her to test. That arrives with the invite feature.
- **No automated test.** Everything here was done by hand. Nothing in CI would catch a regression in
  the limit, the name check or the isolation rule; a later change could undo any of it silently.
- **The `insert` error branches were not exercised.** The F14 test broke the count path only. The two
  checks after the insert — an error, and a row count other than 1 — have still never run.
- **Unverified — no `deno.lock`.** The function's transitive dependencies are unpinned; see issue #35.
