# Evidence: Build it 15 part 1 (tasks join teams, expand migration)

PR #85, closes #82 (part 1 of four). Migration: `supabase/migrations/20261002133637_tasks_join_teams.sql`.
Script: `scripts/staging/build-it-15-checks.mjs`.

Everything below was run by the owner or the coach and reported on the PR. This file records those
reports; it is not output captured by the agent that wrote it.

## 1. Staging apply

- The owner applied `20261002133637_tasks_join_teams.sql` to staging (`ghskxrhqlhvrhpnivqbd`) on
  2 Oct 2026 with `supabase db push`.
- The file applied was the final version, including the `revoke` added in `dbaa7d7`.
- Before the push, a `--dry-run` listed only this file, and `supabase/.temp/project-ref` was checked
  to be the staging project.
- The coach confirmed through the staging read-only connector that staging's migration list now ends
  with `20261002133637 tasks_join_teams`.

## 2. Script run on staging

Command: `node scripts/staging/build-it-15-checks.mjs`, run by the owner on 2 Oct 2026.

- `ALICE_TEAM_ID=6a1c7b65-a84b-42aa-b40c-1c547097163a`
- `CAROL_TEAM_ID=b555eb00-ad6b-4a3d-b1cd-88e37eb61616` (a team Carol created through the app for this test)

Result: **26 PASS, 0 FAIL, 0 UNVERIFIED.** Cleanup deleted the 2 rows the script created and confirmed
them gone. Check names are grouped as the script prints them; HTTP bodies are left out.

### Setup (5)

- PASS  Alice belongs to ALICE_TEAM_ID
- PASS  Carol belongs to ALICE_TEAM_ID
- PASS  Bob does NOT belong to ALICE_TEAM_ID
- PASS  Carol belongs to CAROL_TEAM_ID
- PASS  Alice does NOT belong to CAROL_TEAM_ID

### Alice creates a team task and a personal task (2)

- PASS  Alice can create a task for her team
- PASS  Alice can create a personal task

### Carol (a member of Alice's team) (10)

- PASS  Carol can see Alice's team task
- PASS  Carol can tick Alice's team task
- PASS  Carol can rename Alice's team task
- PASS  Carol CANNOT delete Alice's team task
- PASS  the team task survived Carol's delete
- PASS  Carol CANNOT take Alice's team task over (owner_id)
- PASS  Carol CANNOT move Alice's team task to her own team
- PASS  Carol CANNOT make Alice's team task personal
- PASS  the team task is unchanged except for the tick and the name
- PASS  Carol sees nothing of Alice's personal task

### Bob (in neither team) (4)

- PASS  Bob sees nothing of Alice's team task
- PASS  Bob CANNOT tick Alice's team task
- PASS  Bob sees nothing of Alice's personal task
- PASS  Bob CANNOT create a task for Alice's team

### Alice (the creator) (4)

- PASS  Alice CANNOT give her task to somebody else (owner_id)
- PASS  Alice CANNOT move her task into a team she is not in
- PASS  Alice CAN move her own task back to personal
- PASS  once personal, Carol stops seeing it

### Signed out (1)

- PASS  Signed out: tasks shows nothing

## 3. Pre-staging tests (coach's sandbox)

The coach's sandbox is PostgreSQL 16 with a Supabase `auth` stand-in. It ran all five migrations both
before and after `dbaa7d7`, with matching results. That included team deletion returning each task to
its creator as a personal task. See the coach's two review comments on PR #85.

## 4. Notes

- The team-deletion path (`on delete set null` firing the trigger) was proven in the sandbox, not on
  staging. No automated check covers it on staging, because nothing in the app can delete a team.
- `tasks_enforce_column_rules()` still has EXECUTE for `anon` and `authenticated` through Supabase's
  default grants. This is harmless, because a trigger function cannot be called directly. See the
  coach's re-test comment on PR #85 and #84.
- #83 (My tasks shows team tasks unlabelled) is part 2's job.
- Data captured from production: none. Nothing was redacted. The two team ids above are staging
  values supplied by the owner.
