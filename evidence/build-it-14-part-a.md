# Evidence: build-it-14-part-a

Result: PASS on staging (22 PASS, 0 FAIL, 0 UNVERIFIED), as reported by the owner. Production not yet applied.
Date: 2026-10-02
How checked: the owner applied the migration to staging and ran the check script; the coach read the migration list and the Security Advisor. See each section for who did what.
Checked by: the owner (apply and script run); the coach (migration list, Security Advisor, sandbox test). This file was written by Claude from the owner's description. Claude did not run or observe any of it.

## 1. Staging apply

The owner applied `20261002122203_team_rules.sql` to staging (`ghskxrhqlhvrhpnivqbd`) on 2 Oct 2026 with `supabase db push`, after a `--dry-run` that listed only this file.

The coach confirmed via the staging read-only connector that staging's migration list now ends with `20261002122203 team_rules`.

## 2. Script result

`node scripts/staging/build-it-14-checks.mjs`, run by the owner on 2 Oct 2026: **22 PASS, 0 FAIL, 0 UNVERIFIED**.

The check lines below are copied as they printed. They contain no names, emails or ids beyond the team id, which isn't secret.

```
Signed out: is_team_member is not callable -- PASS (HTTP 401, 42501 permission denied)
Signed out: team_roster shows nothing -- PASS (0 rows)
Alice: is_team_member(Alice's team) is true -- PASS
Alice: can read Alice's team row -- PASS (1)
Alice: can read the members list of Alice's team -- PASS (1; the owner has no membership row)
Alice: team_roster for Alice's team has exactly 2 rows -- PASS
Alice: the two roles are exactly owner and member -- PASS
Alice: appears exactly once, with role owner -- PASS
Alice: can see the other person's display name -- PASS
Bob: is_team_member(Alice's team) is false -- PASS
Bob: team_roster for Alice's team is empty -- PASS (0)
Bob: no row anywhere in team_roster belongs to Alice's team -- PASS (0 of 0)
Bob: teams returns nothing for Alice's team -- PASS (0)
Bob: team_members returns nothing for Alice's team -- PASS (0)
Bob: profiles returns only his own row -- PASS (1, 0 others)
Carol: is_team_member(Alice's team) is true -- PASS
Carol: can read Alice's team row -- PASS (1)
Carol: can read the members list of Alice's team -- PASS (1)
Carol: team_roster for Alice's team has exactly 2 rows -- PASS
Carol: the two roles are exactly owner and member -- PASS
Carol: appears exactly once, with role member -- PASS
Carol: can see the other person's display name -- PASS
Totals: 22 PASS, 0 FAIL, 0 UNVERIFIED.
```

## 3. Security Advisor (staging, after apply), read by the coach

- No "Security Definer View" warning (the book's check).
- Two warnings:
  - (a) `0029 authenticated_security_definer_function_executable` on `is_team_member`. **Accepted, intentionally.** Policies need signed-in callers to execute it. It reads the caller from `auth.uid()` and takes no "who" argument. It returns false for a team you're not in, the same as for a team that doesn't exist.
  - (b) Leaked password protection disabled. This is an Auth setting, older than this change and out of scope.

## 4. Pre-staging test (coach's sandbox)

PostgreSQL 16 with a Supabase `auth` stand-in. All four migrations applied cleanly, with the same Alice/Bob/Carol/anon results. The results table is in the coach's review comment on this PR.

## 5. Staging data notes

- Display names were added to `profiles` by the owner in the staging SQL editor (data only, no schema; part B adds the screen).
- Alice's test team currently carries an email address as its name, from an earlier mis-typed field. To be renamed. The address is deliberately not written here.

## Screenshot (optional)

None.
