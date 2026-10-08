# Production log

Every action against the production project goes here, in the same session it happened. **A missing
entry is a broken rule, not a late one** (rule 19).

One line per action, with:

| Field | What it means |
|---|---|
| **Time** | When, with the timezone. Approximate is fine; absent is not. |
| **Who** | The person or assistant that ran it. "The coach (claude.ai)" and "the assistant (Claude Code)" are different actors and are named differently. |
| **What** | The command, query or connector call. Read-only or writing — say which. |
| **Why** | What question it answered or what it changed. |
| **Result** | What came back. Counts and statuses, never rows of personal data. |

**Why this log exists at all.** Under rule 19 the assistant may set production function secrets, and
there is **no guard prompt** for that one command. Nothing else records it. So this file is the only
trace, which makes an entry here part of doing the action rather than paperwork after it.

**What never goes in this file** (rule 18): no email addresses, no user, team or invitation ids, no
tokens, no keys, no connection strings, no rows of real data. Counts, statuses and schema names only.
The production project reference is not written here either — it is already in `guard/local.json`, and
repeating it spreads it for no gain.

---

## 2026-10-01

All **three** entries below were **recorded after the fact on 1 Oct 2026, when this log was created.**
They are **not backdated**: the times are approximate (BST), and they come from **the coach's session
notes of 1 Oct**, not from anybody's memory and not from timestamps read off a system. Anything added
from now on is written in the session it happened, which is what rule 19 asks for.

All three actions were by **the coach (claude.ai)**, through the **Supabase production (read-only)
connector**, and all three were **read-only**.

| Time (BST, approx.) | Who | What | Why | Result |
|---|---|---|---|---|
| ~10:25 | The coach (claude.ai), via the production read-only connector | `get_project_url` — read-only | Confirm the connector was pointed at the production project before anything else was run | Returned the project URL |
| ~10:25 | The coach (claude.ai), via the production read-only connector | `select current_setting('transaction_read_only'), current_user` — read-only | Prove the connection really is read-only, rather than trusting the connector's name | `transaction_read_only` = **`on`**; `current_user` = **`supabase_read_only_user`** |
| ~10:40 | The coach (claude.ai), via the production read-only connector | `list_tables` on schema `public` — read-only, **counts only** | See what production holds, without reading any row of real data | Table list for `public`, counts only. No row contents retrieved |

**The second entry is the one worth keeping.** A connector labelled "read-only" is a label; `on` and
`supabase_read_only_user` are the database saying so. Checking the claim rather than the name is the
difference between knowing and assuming — and if that query had come back `off`, every other
read-only connector action would have needed re-examining.

---

## 2026-10-02

Both entries below were by **the coach (claude.ai)**, through the **Supabase production (read-only)
connector**, and both were **read-only**. They were run before the screens half of Build it 14 (issue
#80) was written, to check that the schema it depends on was really live.

**Where these two lines come from, and what that means.** They were written on 2 Oct 2026 by the
assistant (Claude Code), **from the description in issue #80**, not from anything the assistant ran or
saw. The assistant has no production access of any kind and did not watch these calls happen. The
times are the ones the issue gives, approximate, BST. If the coach's own record disagrees with a line
below, the coach's record is the one to trust.

| Time (BST, approx.) | Who | What | Why | Result |
|---|---|---|---|---|
| ~13:04 | The coach (claude.ai), via the production read-only connector | `list_migrations` — read-only | Confirm part A's migration was live in production **before** any screen was built on top of it (Lesson E2: the schema goes first, and is checked, not assumed) | Production's migration list ends with `20261002122203 team_rules` |
| ~13:04 | The coach (claude.ai), via the production read-only connector | `get_advisors`, security — read-only | Check what the migration did to production's security advice, rather than trusting that staging's reading carried over | **No** "Security Definer View" warning. `0029 authenticated_security_definer_function_executable` on `is_team_member` — **accepted as intentional**, for the reasons in `evidence/build-it-14-part-a.md` §3. Leaked password protection disabled — an Auth setting, **pre-existing**, older than this change |

### A third entry for 2 Oct, added later the same day

Same provenance warning as the two above, and it matters as much: the line below was written by the
assistant (Claude Code) **from the description in issue #86**, not from anything the assistant ran or
saw. The assistant has no production access of any kind. If the coach's own record disagrees with it,
the coach's record is the one to trust.

**On the time.** Issue #86 does not give one. It says the read happened after pull request #85 was
merged, and `gh pr view 85 --json mergedAt` reports that merge at **14:26:27 UTC on 2 Oct 2026** —
15:26 BST — which is the only part of the timing this file can stand behind. "After 15:26" is
therefore what the entry says, rather than a precise-looking time nobody measured.

| Time (BST) | Who | What | Why | Result |
|---|---|---|---|---|
| After 15:26 — exact time not recorded | The coach (claude.ai), via the production read-only connector | `list_migrations` — read-only | Confirm Build it 15 **part 1's** migration was live in production **before** part 2's screens were built on top of it (Lesson E2: the schema goes first, and is checked, not assumed) | Production's migration list ends with `20261002133637 tasks_join_teams` |

### Two more entries for 2 Oct, added later the same day

Same provenance warning again, and it has not got any weaker for being repeated: the two lines below
were written by the assistant (Claude Code) **from the description in issue #93**, not from anything
the assistant ran or saw. The assistant has no production access of any kind and did not watch these
calls happen. If the coach's own record disagrees with them, the coach's record is the one to trust.

**On the time.** Issue #93 does not give one. It says the reads happened after pull request #92 was
merged, and `gh pr view 92 --json mergedAt` reports that merge at **18:25:39 UTC on 2 Oct 2026** —
19:25 BST. So "after 19:25" is what the entries say, rather than a precise-looking time nobody
measured.

Both were by **the coach (claude.ai)**, through the **Supabase production (read-only) connector**,
and both were **read-only**.

| Time (BST) | Who | What | Why | Result |
|---|---|---|---|---|
| After 19:25 — exact time not recorded | The coach (claude.ai), via the production read-only connector | `list_migrations` — read-only | Confirm Build it 15 **part 3's** contract migration was live in production, rather than assuming the merge had carried it there (Lesson E2) | Production's migration list ends with `20261002170244 tasks_drop_owner_only_rules` |
| After 19:25 — exact time not recorded | The coach (claude.ai), via the production read-only connector | A query against `pg_policies` for `public.tasks` — read-only, **policy names only, no rows of data** | Check the contract is what production actually enforces. The migration dropped three superseded policies; the point of the read is that production says four remain, not that the migration file says it should | **Four** policies on `public.tasks`, one per command — matching what `evidence/build-it-15-part-3.md` §2 records for staging |

**Why the second one is worth having.** A green `migrate-production` run proves the `drop policy`
statements ran. It does not prove what is left behind. Counting the policies production actually has
is a different question from reading the migration that was meant to change them, and it is the only
one of the two that would have caught a half-applied migration.

**What this pair makes possible, and the honest limit on it.** Both answers are what the new daily
drift check (issue #93, `.github/workflows/drift-check.yml`) will go on to ask every morning without
anybody opening a connector — the first one, at least: the drift check compares migration *versions*
and function *names*. It does not count policies, and nothing in this repository does that
automatically. So the policy count above is a point-in-time reading by a person, not a standing
guarantee.

---

## 2026-10-03

**Where this line comes from, and what that means.** It was written on 3 Oct 2026 by the assistant
(Claude Code) **from the description in issue #118**, not from anything the assistant ran or saw. The
assistant has no production access of any kind, did not watch this call happen, and **did not use the
production read-only connector to check it** — rules 1 and 10 forbid that, and rule 19's exception
covers production function secrets and nothing else. Every value in the row below is the issue's,
repeated. If the coach's own record disagrees with it, the coach's record is the one to trust.

**On the time.** Issue #118 places the read after the merge of PR #115, and
`gh pr view 115 --json mergedAt` reports that merge at **15:17:00 UTC on 3 Oct 2026** — 16:17 BST,
checked in the session that wrote this line. The versions the read returned are stamped 15:17:28 UTC,
which is later again. So "after 16:17" is what the entry says, rather than a precise-looking time
nobody measured.

| Time (BST) | Who | What | Why | Result |
|---|---|---|---|---|
| After 16:17 — exact time not recorded | The coach (claude.ai), via the production read-only connector | `list_edge_functions` — read-only, **the list only**: no function contents and no table were read | Confirm the deploy that followed the merge of PR #115 | Three functions: `create-team` version 22, `invite-member` version 19, `accept-invite` version 19. All three **ACTIVE**, `verify_jwt` **true**, updated **2026-10-03 15:17:28 UTC** |

**What this line is not.** `verify_jwt true` above is a reading of **production**, taken from the
issue. The staging run in `evidence/build-it-16-function-doors.md` §6a is a different project, and
nothing here says what staging's setting is, or what either platform does with a token when one
arrives. The two are easy to blur, because they are about the same three functions by name.

---

## 2026-10-04

**Where these two lines come from, and what that means.** They were written on 4 Oct 2026 by the
assistant (Claude Code) **from the coach's comment on issue #133**, not from anything the assistant
ran or saw. The assistant has no production access of any kind, did not watch these calls happen,
and **did not use the production read-only connector to check them** — rules 1 and 10 forbid that,
and rule 19's exception covers production function secrets and nothing else. Every value below is
the comment's, repeated. If the coach's own record disagrees with it, the coach's record is the one
to trust.

**On the time.** The comment gives **14:31 UTC**, which is 15:31 BST, and that is what the rows say.
Two things in this session agree with it rather than confirm it: the comment itself is stamped
`2026-10-04T14:31:48Z` (`gh issue view 133 --json comments`), and it places the reads after the
merge of PR #132, which `gh pr view 132 --json mergedAt` reports at **14:24:08 UTC** — seven minutes
earlier, so the order is at least consistent.

Both entries were by **the coach (claude.ai)**, through the **Supabase production (read-only)
connector**, and both were **read-only**.

| Time (BST) | Who | What | Why | Result |
|---|---|---|---|---|
| 15:31 (14:31 UTC) | The coach (claude.ai), via the production read-only connector | One SQL read of **catalogue facts only** — no row of any user table | Check what part A's merge actually left in production, rather than reading the migration and assuming | **Seven** migrations recorded, the last `20261004114313`. **11 permissive and 5 restrictive** policies, one restrictive on each of the five tables. `account_status`: row-level security **on**, **0 policies**, **0 rows**. Privileges on it: `anon` **none**, `authenticated` **none**, `service_role` **select only**. `is_active()` execute: `anon` **false**, `authenticated` **true**, `service_role` **true**. PostgreSQL **17.6** |
| 15:31 (14:31 UTC) | The coach (claude.ai), via the production read-only connector | `get_advisors`, security — read-only | See what part A did to production's security advice | `account_status` **RLS-enabled-no-policy** (info; **intended** — the table is meant to be unreachable through the app). Security-definer function executable by signed-in users for **`is_active`**, **`is_team_member`** and **`tasks_enforce_column_rules`**; executable by `anon` for **`tasks_enforce_column_rules`**. **Leaked password protection disabled** — an Auth setting, pre-existing, older than this change. **Staging's advisor, read the same day, listed the same** |

**What these two lines settle, and what they do not.** They are the first reading of part A in
production, and they match what `evidence/build-it-16-suspend-accounts.md` section 7 records for
staging — the same seven migrations, the same 11-and-5 policy counts, the same three privileges on
`account_status`, the same three `is_active()` execute answers. The RLS-enabled-no-policy notice is
the table working as designed: the migration creates no policy on purpose, and the `revoke` is the
lock that matters.

They say **nothing about part B**. Part B is the three Edge Functions, and no function has been
deployed with the suspension check in it — not to staging and not to production (issue #133, and
the branch `feat/suspend-functions`). So production today has part A's rules and the hole part A
could not reach: a suspended person there can still create a team, invite somebody and accept an
invitation. Nothing in this session changed that, and nothing in this session touched production.

---

## 2026-10-05

**Where these four lines come from.** They were written on 5 Oct 2026 by the assistant (Claude Code)
**from the text of issue #140**, which is the owner's account of what the coach read. The assistant
has no production access of any kind, did not watch these calls happen, and **did not use the
production read-only connector to check them** — rules 1 and 10 forbid that, and rule 19's exception
covers production function secrets and nothing else. Every value below is the issue's, repeated. If
the coach's own record disagrees with it, the coach's record is the one to trust.

**On the times.** The issue gives **08:33:29 UTC** for the first pair, which is 09:33:29 BST, and
"a few minutes later" for the second pair. The second pair's own evidence is the deploy stamp it
reported, **08:33:35 UTC**, so the read happened at or after that; the exact clock time of the read
is **not recorded**, and the table says so rather than inventing one. One thing in this session
agrees with the ordering rather than confirms it: `gh pr view 138 --json mergedAt` reports PR #138
merged at **2026-10-05T08:33:08Z** — 21 seconds before the first read, which is why the first
function list still shows versions stamped 4 Oct.

All four actions were by **the coach (claude.ai)**, through the **Supabase production (read-only)
connector**, and all four were **read-only**.

| Time (BST) | Who | What | Why | Result |
|---|---|---|---|---|
| 09:33:29 (08:33:29 UTC) | The coach (claude.ai), via the production read-only connector | `list_edge_functions` — read-only, **the list only** | See whether the merge of PR #138 had reached production yet | Three functions: `create-team` version **26**, `invite-member` version **23**, `accept-invite` version **23**, last updated **2026-10-04 14:24:38 UTC**. So **not yet redeployed** — these are part A's versions, 21 seconds after the merge |
| 09:33:29 (08:33:29 UTC) | The coach (claude.ai), via the production read-only connector | One SQL read of **counts only** — no row of any user table | Check what part A left in production, and that part B's merge had not touched the schema | `account_status`: **0 rows**. Last migration **20261004114313** — the same one 4 Oct recorded, so no migration arrived with PR #138 |
| A few minutes later — exact time not recorded; at or after 08:33:35 UTC | The coach (claude.ai), via the production read-only connector | `list_edge_functions` again — read-only, **the list only** | Confirm the deploy that followed the merge | Three functions: `create-team` version **27**, `invite-member` version **24**, `accept-invite` version **24**. All three **ACTIVE**, `verify_jwt` **true**, updated **2026-10-05 08:33:35 UTC**. **Only those three** — so `_tests` was not deployed as a function by CLI **2.117.0** |
| The same read — exact time not recorded | The coach (claude.ai), via the production read-only connector | `get_edge_function` for **`create-team` version 27** — read-only, the function's own source | Check that what landed is part B, and that the check runs before the request body is read | The contents carry the **suspension check before the request body is read**. **The contents of the other two functions were not read** |

**What these four lines settle, and what they do not.** Part B is in production for `create-team`,
and its check is in the right place — before the body, which is the ordering
`build-it-16-suspend-checks.mjs` has a judgement for. For `invite-member` and `accept-invite` the
only thing read was the **version number going up**; their contents were **not read**, so "part B is
live in all three" is **unverified** from this log alone. The way to settle it is to read those two
functions the same way, or to run the staging script against production — which rule 19 does not
permit, so it is the first of those two.

Nothing here wrote anything, and nothing in this session touched production.

---

### A fifth entry for 5 Oct, added later the same day

**Where this line comes from.** Written on 5 Oct 2026 by the assistant (Claude Code) from the text
of **issue #145**, which is the owner's account of what the coach read. As with the four lines
above: the assistant has no production access of any kind, did not watch the call happen, and **did
not use the production read-only connector to check it**. The entry below is the issue's words,
repeated verbatim.

> 5 Oct 2026, after 12:10 UTC. Coach, read-only connector. Read the source of invite-member and
> accept-invite (issue #142). Both v26, updated 5 Oct 12:09:59 UTC. Each runs the suspension check
> before `await req.json()`. accept-invite's refusal carries both `reason` and `code`. No table
> read.

**What it settles.** The entry above said "part B is live in all three" was **unverified**, because
only `create-team`'s contents had been read and the other two were known by their version number
alone. It named reading those two functions as the way to settle it, and this is that read: the
suspension check is before the body in both. This entry is a **read**, like every one before it, so
the closing section below still holds.

---

## 2026-10-06

**Where this line comes from.** Written on 6 Oct 2026 by the assistant (Claude Code) from the text of
**issue #166**, which is the owner's account of what the coach read. As with every entry above it: the
assistant has no production access of any kind, did not watch the calls happen, and **did not use the
production read-only connector to check them** — rules 1 and 10 forbid that, and rule 19's exception
covers production function secrets and nothing else. Issue #166 also says in so many words, "Do not
use any MCP connector or the browser tool." The entry below is the issue's words, repeated verbatim,
and the assistant has verified **nothing** in it.

**On the time.** The issue gives none beyond "after PR #165 merged", so no clock time is invented
here. `gh pr view 165 --json mergedAt` reports **2026-10-06T13:29:37Z**, read in this session, so the
reads are after that and the ordering is at least consistent.

| Time | Who | What | Why | Result |
|---|---|---|---|---|
| After 13:29:37 UTC — no more precise time given | The coach (claude.ai), via the production read-only connector | Two reads of **settings and counts, no row contents** | Check what the merge of PR #165 actually left in production, rather than reading the migration and assuming | > 6 Oct 2026, after PR #165 merged. Coach, read-only connector. Two reads of settings and counts, no row contents: 8 migrations, newest 20261006095847; invitations.status default 'queued' and failure_code default ''; both check constraints present; 2 invitations, both status sent with empty code; anon and authenticated have no INSERT or UPDATE on the table or on either new column; service_role has both; 16 policies in public. |

**What it settles, and what it does not.** The migration from PR #165 is in production, with both
columns, both defaults, both check constraints, and the privileges the migration's section 4 set — the
`revoke insert, update ... from anon, authenticated` took effect, and `service_role` has what it needs
to write the two columns. The policy count went from the 16 of 5 Oct to 16, so the migration added
none, which is what "no new rule was needed" meant.

What it says nothing about: **the function**. The two invitations say `sent` because the migration's
backfill said so, not because any deployed function wrote it — `update public.invitations set status =
'sent'` is section 2 of that migration. No deployed `invite-member`, in staging or production, has ever
written either column. The code in this pull request is what would, and **it is deployed nowhere**.

Nothing here wrote anything, and nothing in this session touched production.

---

## 2026-10-07

**Where this line comes from.** Written on 8 Oct 2026 by the assistant (Claude Code) from the coach's
review comment on **pull request #210**, and copied into this log because issue #211 asked for it in
those words. As with every entry above it: the assistant has no production access of any kind, did not
watch the call happen, and **did not use the production read-only connector to check it** — rules 1 and
10 forbid that, and rule 19's exception covers production function secrets and nothing else. Issue #211
also says in so many words, "Do not use any MCP connector or the browser tool." The entry below is the
issue's words, repeated verbatim, and the assistant has verified **nothing** in it.

| Time | Who | What | Why | Result |
|---|---|---|---|---|
| 7 Oct 2026 — no clock time given | The coach (claude.ai), via the production read-only connector | One read of **rights only, no row contents** | Settle the open question in PR #210: whether that migration's grants to `anon` would *widen* what it already holds, before the migration reached production | > 7 Oct 2026. Coach, read-only connector. One read of rights on `public.profiles` for `anon`, `authenticated` and `service_role`: each held table-level SELECT, INSERT and UPDATE. No row contents. |

**What it settles.** `20261007204900_ai_suggestions_consent.sql` revokes table-level SELECT, INSERT and
UPDATE from `anon` and `authenticated` and grants them back column by column. Whether that *narrows* or
*widens* what those roles hold depends entirely on what they held first — and the answer is that all
three held the table-level privileges, so the migration narrows. Had `anon` held nothing, the re-grants
in its section 4 would have been handing it rights it did not have.

**Two things this is not.** It is a reading of **production's privileges**, which is a different project
from the sandbox that same comment describes — the sandbox reads are in
`evidence/build-it-21-ai-consent-migration.md` and are not production. And it was taken **before** the
migration was applied anywhere, so it says nothing about what production's privileges are now; the
record of the apply itself is in that evidence file and in `docs/environments.md`.

---

## Nothing written to production yet

No entry above changed anything: every one is a read. **The assistant has never run a production
command of any kind**, and rule 19's one permission — `supabase secrets set` against production — has
not been used. The first time it is, it goes here, in that session, before the session ends.
