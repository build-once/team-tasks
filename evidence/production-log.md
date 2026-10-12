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
migration was applied anywhere, so it says nothing about what production's privileges are now — **the
entry for 8 Oct below is the reading that does.**

---

## 2026-10-08

**Where this line comes from.** Written on 8 Oct 2026 by the assistant (Claude Code) from **the owner's
own words, given in the session that built Build it 21 part 2b** (issue #211). As with every entry above
it: the assistant has no production access of any kind, did not watch this call happen, and **did not use
the production read-only connector to check it** — rules 1 and 10 forbid that, and rule 19's exception
covers production function secrets and nothing else. Issue #211 also says in so many words, "Do not use
any MCP connector or the browser tool." The entry below is the owner's words, repeated verbatim, and the
assistant has verified **nothing** in it.

**On the time.** No clock time was given beyond "after PR #210 merged". `gh pr view 210 --json mergedAt`
reports that merge at **2026-10-08T07:27:56Z**, read in this session, so the read is after that and the
ordering is at least consistent. No more precise time is invented here.

| Time | Who | What | Why | Result |
|---|---|---|---|---|
| After 07:27:56 UTC — no more precise time given | The coach (claude.ai), via the production read-only connector | One read of **settings and counts, no row contents** | Check what the merge of PR #210 actually left in production, rather than reading the migration and the green workflow run and assuming | > 8 Oct 2026, after PR #210 merged. Coach, read-only connector. One read of settings and counts: 9 migrations, newest 20261007204900; both ai_suggestions columns present, default off; my_ai_suggestions() present; anon and authenticated hold no table-level SELECT or UPDATE on profiles; service_role holds SELECT, not UPDATE; no profile rows counted. No row contents. |

**What it settles, and it is the thing the workflow run could not say.** `.github/workflows/migrate-production.yml`
run [37743591469](https://github.com/build-once/team-tasks/actions/runs/37743591469) reported "Apply
migrations to production: success", which proves the statements ran. It does not prove what they left
behind. This read is the other question, and the answers match the migration's sections 1, 3, 4 and 4b:

- **the columns are there and the default is off** — section 1, which is what "off for everyone, including
  every account that already exists" rests on;
- **`my_ai_suggestions()` is there** — section 3, and it is what the two screens read the setting through;
- **`anon` and `authenticated` hold no table-level SELECT or UPDATE** — section 4's `revoke`, which is the
  line that closes the team-mate read. That it took effect in production is the one privilege fact this
  whole feature's privacy rests on, and it is now read rather than reasoned;
- **`service_role` holds SELECT and not UPDATE** — sections 4 and 4b. The SELECT is the grant
  `suggest-subtasks`'s consent check uses; the absent UPDATE is what stops any server function switching
  the setting for anybody, which is `docs/plan.md`'s "not the owner of the app on their behalf".

**And "no profile rows counted" is worth a sentence, because it is easy to misread as a fault.** Production
has no profile rows because **nobody has signed up** — rule 19 is still in force precisely because the
first real user has not arrived. So the default being off has had nothing to apply to yet. It also means
nothing in production can exercise the consent setting at all, which is a further reason "seen to refuse
with it off" on production is still open.

**What it says nothing about: the function.** This read is of the database. The Build it 21 version of
`suggest-subtasks` arrives in production on the merge of **this** pull request, not PR #210's — and
production has no `AI_API_KEY`, so every ask there answers the fixed failure with `not_configured`
whatever the setting says.

---

## 2026-10-09

**Recorded on 10 Oct 2026, a day late, and that is a fault in this file rather than in the read.** Rule 19
says every production action goes here **in the same session it happened**; this one happened on 9 October
and is written on the 10th, from the record the coach left in a pull-request comment. It is **not
backdated**: the date above is the day of the read, and this paragraph is when it was written down. The
reason it is here now is that the owner asked for it in this session so that
[#243](https://github.com/build-once/team-tasks/issues/243) could be closed, and #243 asks for the read to
be recorded in this file.

**Where this entry comes from.** The **"Coach review" comment on
[PR #245](https://github.com/build-once/team-tasks/pull/245)**, dated 2026-10-09T14:39:37Z, read with
`gh pr view 245 --json comments` in this session. The record is the coach's, through the **production
read-only connector**; **the assistant has no production access of any kind, opened no dashboard and used
no connector**, and has verified nothing in it. This pull request's own instructions forbid the connector
and the browser, as #211's did.

**On the time.** The comment carries a timestamp and the read does not. What is known is that the read
happened on or before 2026-10-09T14:39:37Z, which is when the comment was posted, and after the merge of
PR #241 put the migration on production that morning.

| Time | Who | What | Why | Result |
|---|---|---|---|---|
| On or before 14:39:37 UTC — no time given for the read itself | The coach (claude.ai), via the production read-only connector | One read of **the `attachments` bucket's settings, its policies, one trigger and a count — no row contents** | Answer [#243](https://github.com/build-once/team-tasks/issues/243): the attachments migration was applied to production by the pipeline and **nothing had been read back**, so a green workflow run was the only evidence that the bucket is private and the three policies exist | > **Production (answers #243), read-only connector, 9 Oct:** 11 migrations, newest `20261008191804`; bucket `attachments` private, limit 5242880, the six named types; three policies on `storage.objects` (SELECT, INSERT, DELETE), each to `authenticated`; trigger `tasks_refuse_delete_with_files` present; 0 objects. No row contents read. |

**What it settles, which is what the workflow run could not say.**
`.github/workflows/migrate-production.yml` run
[37922812469](https://github.com/build-once/team-tasks/actions/runs/37922812469) reported "Apply migrations
to production: success", and #243's whole argument is that a green run says the statements ran and not what
they left behind. Four of its six questions are now answered off production itself:

- **the bucket is private, with the 5 MB limit and the six named types** — #243's question 2, and the one
  the migration's own words call the difference between rules and decoration: "A public bucket would make
  every rule in that migration decoration";
- **three policies on `storage.objects`, SELECT, INSERT and DELETE, each `to authenticated`** — question 3,
  including its "and **no UPDATE policy**", which three-and-only-three answers: nothing in this design
  overwrites a file;
- **the trigger `tasks_refuse_delete_with_files` is there** — question 5, which is what makes "no orphaned
  files" a property of the database;
- **0 objects in the bucket** — question 6, which is expected and worth having: nobody has signed up to
  production and the files panel is deployed nowhere, so a non-zero count would have been the finding.

**TWO OF #243's SIX QUESTIONS ARE NOT ANSWERED BY THIS READ**, and they are named here rather than left for
somebody to notice that the list is short:

- **Question 1: whether `storage.objects` has row-level security switched on.** #243 asks for
  `select relrowsecurity from pg_class where oid = 'storage.objects'::regclass` to come back **true**, and
  this record does not report it. It matters for the reason #243 gives: the migration deliberately does not
  switch RLS on, because that is a Supabase-managed table, so **with RLS off the three policies filter
  nothing and every signed-in caller reaches every object**. Three policies existing is not the same fact.
- **Question 4: the two function privileges.** `attachments_may_add(text, text)` executable by
  `authenticated` and **not** by `anon`; `attachments_lock_key(text, uuid)` executable by **nobody**. The
  staging read-back checked the first of those; this production read reports neither, and they are what the
  two counted limits rest on.

**Neither gap is a reason to doubt what the read did say**, and neither is small enough to paper over —
which is why #243 is closed on the four it answers and
[#253](https://github.com/build-once/team-tasks/issues/253) holds the two it does not. The
honest summary: **production's bucket is private with the right limits and the right three policies, and
whether anything is actually filtering them has not been read.**

---

## 2026-10-10

**The first entry in this file that is not a read.** Production was moved into a different
organisation, on a paid plan. Everything above it is a read; this one changed something.

**Where these lines come from.** Written on 10 Oct 2026 by the assistant (Claude Code) from **the
owner's own words, given in this session**. As with every entry above it: the assistant has no
production access of any kind, **opened no dashboard, ran no command and used no connector**, and has
verified **nothing** below. Rules 1 and 10 forbid all of it, and rule 19's exception covers production
function secrets and nothing else.

**The production project reference is not written here.** The owner gave it in chat; this file's own
header says the reference does not go in this file, because it is already in `guard/local.json` and
repeating it spreads it for no gain. That rule is kept — the entries below name the project as
"production" and nothing more. **The organisation's name is written**, because it is not an
identifier of that kind and the owner gave it to be recorded.

**On the time.** The owner gave a clock time for **one** thing only: the backups, each at around
12:20 UTC. No time was given for the transfer, the sign-in or the connector read, and none is invented
here. What is known is their **order**, which is the order of the rows.

| Time | Who | What | Why | Result |
|---|---|---|---|---|
| No time given | **The owner**, in the Supabase dashboard | **Transferred the production project into the `DHTA Ltd` organisation** — **a change, not a read.** The first writing action in this file | `docs/plan.md`'s Budget: "Before real users arrive, production moves to a Supabase Pro organisation at about $25 a month; staging stays in a separate free organisation at $0" | Production is now in the **`DHTA Ltd`** organisation, which is on Supabase's **Pro** plan. **Staging stays in its original organisation, on the free plan** |
| After the transfer — no time given | **The owner**, in a browser | Signed in to the **live site** | Check the transfer had not broken the thing the six volunteers would use | **The owner could still sign in** |
| After the transfer — no time given | The coach (claude.ai), via the production read-only connector | One read of the **migration record — a count and one name, no row contents** | Check the database was still reachable and still held what it held before the project moved | **11 migrations, newest `20261008191804`** |
| After the transfer — no time given for the read itself. The **12:20 UTC** below is the backups' own time | **The owner**, in the Supabase dashboard | Read the **Database → Backups** page — **read-only** | Find out what backup cover production actually has, now that it is on a paid plan | **Seven daily physical backups, 3 to 9 October, each around 12:20 UTC.** The page's own statement that **Storage objects are not included**. A **"Restore to new project"** option, marked **Beta** |

**What the transfer itself changes, beyond where the project sits.** Production is now on a plan that
**can bill**, which no account in this project could do before except Anthropic's. Two consequences,
neither of them visible in the dashboard page the owner read:

- **Supabase's Spend Cap now exists for this organisation**, and `docs/costs.md` calls it "the
  strongest control of any service here". **Nobody has set or seen it.** That page also warns, about
  Vercel but in general terms, that "the dangerous moment is the upgrade … set the On-Demand Budget
  and the Pause switch in the **same sitting** as entering card details, not afterwards" — and that
  sitting is today. **Compute is excluded from the Cap**, so about $25/month bills whatever the Cap
  says.
- **Egress has a price now instead of a stop.** `docs/costs.md` worked the attachments arithmetic
  against the Free plan's 5 GB on 2026-10-08 and recorded that the limits do **not** keep inside it.
  On the Free plan the answer was "$0 — the Free plan cannot generate overage charges". That answer
  has changed and the page has not.

Both are [#250](https://github.com/build-once/team-tasks/issues/250). **This log does not change
`docs/costs.md` or `docs/plan.md`'s Budget**: the first needs a figure read off a dashboard that only
the owner can open, and the second is the owner's to change (rule 9). The move itself is **inside**
the plan — its Budget section says production moves to Pro before real users arrive, at about $25 a
month, with staging staying free — so what happened today is the plan being followed, not exceeded.

**What the backups row settles, and the thing in it nobody expected.** The seven backups are dated
**3 to 9 October** — every one of them **before** the transfer on the 10th. So **backups were already
being taken**, and the Pro transfer is not what started them. That is worth saying plainly because
`docs/stack.md` says the opposite in so many words: "Automatic daily backups come with **Pro only**.
Production has them; free staging has none." The dates say daily physical backups were being taken
while production was still in its old organisation. **Which of the two is wrong is not established
here** — nobody writing this has read a Supabase pricing or backups page, and no page is cited, so
this entry records the dates and leaves the claim in doubt rather than replacing it with a guess.
[#247](https://github.com/build-once/team-tasks/issues/247) holds it.

**And the thing that matters most, which is not about the database at all.** The page says **Storage
objects are not included**. Production has a Storage bucket as of 9 October — `attachments`, from
`20261008191804_attachments_bucket.sql` — so **the files people attach to tasks are outside these
backups**. Nothing in `docs/plan.md`'s "Files attached to a task" says so, and it was written on the
assumption that production's data is backed up. It is empty today, because nobody has signed up and
the screen is deployed nowhere, so this is a gap to close **before** a volunteer attaches anything
rather than after. [#248](https://github.com/build-once/team-tasks/issues/248) holds it.

**"Restore to new project" is marked Beta, and no restore has ever been tried.** A backup that has
not been restored is a belief about a backup. `checklist/launch.json` already carries that as two
separate items — `backups-on`, "Automatic database backups are on", and `restore-tested`, "You have
restored a backup into a scratch database and checked the data" — and **neither
`evidence/backups-on.md` nor `evidence/restore-tested.md` exists**, so `scripts/launch-check.mjs`
reports both as TODO. This entry is most of the evidence the first one asks for and **none** of the
second's. [#249](https://github.com/build-once/team-tasks/issues/249) holds both.

> **Later, 11 October 2026 — the second half of that is done, and this entry is left as it was written.**
> The owner ran the restore drill on 10–11 October and `evidence/restore-tested.md` now exists: 219
> seconds, 47 tables, 269 rows, one file byte for byte, signed into with a real account, the project and
> the local files deleted. **"No restore has ever been tried" was true on 10 October and is not now**, and
> the sentence above is kept rather than rewritten because this is a log of what was seen on a date.
> **`evidence/backups-on.md` still does not exist**, so the first half of #249 is still open — what it
> needs is Supabase's own **retention** read off the Backups page, which is the one thing this entry's
> own reading did not record. The drill restored a copy of **ours**; Supabase's "Restore to new project"
> is still marked Beta and still unpressed.

**What the connector read settles, and it is more than it looks.** 11 migrations with
`20261008191804` newest, against **11 `.sql` files in `supabase/migrations/`** — counted in this
session by listing the directory. So **production holds every migration in this repository**,
including `20261008115900_usage_counts.sql`, which `docs/environments.md` has been recording as **not
applied** to production. That is the disagreement [#238](https://github.com/build-once/team-tasks/issues/238)
was filed about, and the count resolves it in favour of "applied": were usage_counts missing,
production would report 10. **It is an inference from a count, not a read of the names** — the owner
reported a count and the newest name, not the list — and it holds only if production's recorded set is
a subset of this repository's migrations. Said the other way: this read **cannot** show *which* 11.

**And something that does not need the inference at all, found while writing this entry.**
`.github/workflows/drift-check.yml` has been comparing production's applied migrations against
`supabase/migrations/` on a daily schedule the whole time, and it **opens a "Database drift" issue and
fails the run** when they differ. Run
[37936434092](https://github.com/build-once/team-tasks/actions/runs/37936434092), at
**2026-10-09T13:22:58Z**, **succeeded** — which for that script means exit 0, "checked, and production
matches the repository", because exit 3 is drift and exit 1 is "could not check" and the workflow
fails on both. It ran after the attachments migration reached production that morning, so it compared
against all 11 files. **So `docs/environments.md` was being contradicted daily by a green job in this
repository**, and that is the lesson rather than the migration: evidence arriving on a schedule is
only evidence if somebody reads it against what the documents claim. The run conclusions here were
read with `gh run list --json` in this session; **the assistant did not run the workflow and holds
none of its credentials.**

**What the first two rows do not settle.** The owner signing in shows the live site still reached
production and that nothing in Vercel needed changing for that one path. It is not a check of the
project's URL or keys, and nothing here says whether either changed.

**What none of these rows touches: the bucket's own rules on production.**
[#243](https://github.com/build-once/team-tasks/issues/243) asks for the bucket row, the three
policies and their privileges to be read back on production, and this read was of the migration
record. **The bucket's own settings were read a day earlier** — the `2026-10-09` section above — and
**the last two of #243's six questions were read later on this day**, which is the section below.

### Later on 2026-10-10: the last two of #243's six, read on production

**Where this comes from.** A **coach comment on
[PR #257](https://github.com/build-once/team-tasks/pull/257)**, dated 2026-10-10T08:58:56Z, read with
`gh pr view 257 --json comments` in this session. The read is the coach's, through the **production
read-only connector**. **The assistant has no production access of any kind, opened no dashboard and used
no connector**, and has verified nothing in it. This pull request's own instructions forbid the connector
and the browser.

**Why it is its own subsection rather than a row in the table above.** That table is the owner's actions,
from the owner's words. This is the coach's read, and mixing the two sources in one table is how a log
stops being able to say who did what.

| Time (UTC) | Who | What | Why | Result |
|---|---|---|---|---|
| On or before 08:58:56 | The coach (claude.ai), via the production read-only connector | One read of **`relrowsecurity` on `storage.objects` and the execute rights on four functions — settings only, no row contents** | Answer the two questions [#243](https://github.com/build-once/team-tasks/issues/243) left and [#253](https://github.com/build-once/team-tasks/issues/253) was opened for: whether the three policies are actually being applied, and whether the helper functions are reachable by the wrong role | > `storage.objects` has row-level security **on** (`relrowsecurity = true`). So the three policies do filter. Execute rights: `attachments_may_add(text, text)`, `attachments_task_id(text)` and `attachments_file_bytes(text)` are executable by `authenticated` and **not** by `anon`; `attachments_lock_key(text, uuid)` is executable by **neither** (it is called only from inside `attachments_may_add`, which is `security definer`). |

**What it settles, and it is the one that could have made the 9 October read meaningless.**
[#243](https://github.com/build-once/team-tasks/issues/243)'s own words were: "With RLS off, a permissive
policy admits nothing extra because nothing is being filtered: every signed-in caller would reach every
object." So "three policies, each `to authenticated`" was confirmed on the 9th and said nothing about
whether anything was applying them. **It is on.** Three policies and a filter, not three policies and a
decoration.

**And the function privileges, which are what the two counted limits rest on.** The migration's own
statements are `supabase/migrations/20261008191804_attachments_bucket.sql` lines 288–290, 346–348,
400–403 and 626–628; this read is those statements having taken effect on production. **It reports more
than #243 asked for**: #243 named two functions and the coach read four, adding `attachments_task_id` and
`attachments_file_bytes` — the two the `SELECT` and `INSERT` policies call to read a path and a size.

**One sliver of #243's question 4 is not in those words, and it is named rather than rounded up.** #243
asked for `attachments_lock_key` to be **false for all three** of `anon`, `authenticated` and
`service_role`. The coach's "executable by neither" covers the two roles named beside it. **`service_role`
is not named in the read.** What stands in its place is the migration's own line 403,
`revoke execute on function public.attachments_lock_key(text, uuid) from service_role;`, plus the
observed fact that the same revoke pattern took effect for `anon` and `authenticated` on this project —
which is reasoning from a statement and a neighbouring read, not a read of that privilege. It is the
smallest thing in this file, and it is written down rather than quietly absorbed into "answered".

**So #253 is answered and closed**, and `docs/environments.md`'s production cell for that migration says
what both reads found rather than what has not been read.

---

### Last on 10 Oct 2026 — the PostgreSQL version, the region, and the Spend Cap

**Added in the session that built Build it 24 part 1
([#258](https://github.com/build-once/team-tasks/issues/258)).** The first row is the **coach's**, through
the production read-only connector, quoted in the coach's review of
[PR #265](https://github.com/build-once/team-tasks/pull/265); the other two are the **owner's**, from
their own words and their own screenshot in that session. **The assistant (Claude Code) ran none of them,
opened no dashboard and used no connector**, and has verified nothing below. The instructions for this
pull request forbade the connector and the browser, and rules 1 and 10 forbid the rest.

| Time | Who | What | Why | Result |
|---|---|---|---|---|
| No time given — before the coach's review of PR #265, which quotes it | The coach (claude.ai), via the production read-only connector | **One read of `server_version` — one setting, no row contents** | [#262](https://github.com/build-once/team-tasks/issues/262): the nightly copy's `pg_dump` refuses a server newer than itself, and nobody had read which PostgreSQL production runs | **`server_version` = 17.6** |
| No time given | **The owner**, in the Supabase dashboard — **read-only** | Read the production project's **region**, and gave the assistant a **screenshot** of it | The nightly copy was about to be built without anybody knowing where either end of it is | Production's database is in **West US (Oregon), `us-west-2`** |
| No time given | **The owner**, in the Supabase dashboard — **A CHANGE, NOT A READ.** The second writing action in this file | **Enabled the Spend Cap on the `DHTA Ltd` organisation** | [#250](https://github.com/build-once/team-tasks/issues/250): production went onto a billable plan that morning and the Cap had not been set | **The Spend Cap is enabled** |

**What the first row settles, and it changed what got built.** The runner image carries PostgreSQL
**16.15** — observed in CI run
[38045409343](https://github.com/build-once/team-tasks/actions/runs/38045409343), not read off
documentation — and `pg_dump` refuses to dump a server newer than itself. So **the first nightly copy
would have stopped at its own version check and copied nothing, every night.** It would have failed
legibly, because the script asks the database its version before it dumps; it would have copied nothing
all the same. The owner approved installing a client, and `scripts/backup/install-pg17.sh` is it, with
the PostgreSQL repository's signing key verified against a pinned SHA-256 **and** a pinned fingerprint
before it is trusted. **#262 is closed by it.** **Rule 19 does not come into this**: nothing is installed
*on* production — the client goes on a GitHub runner — and rule 17 makes a tool the owner's decision,
which is the approval that was given.

**One setting read, one setting read, one setting changed, and nothing else.** `server_version` is a
server setting; the region is a project setting; the Cap is a billing control. **Not one of the three
rows read, wrote or deleted a row of anybody's data**, which is the sentence the section below rests on.

**The screenshot is the only one anywhere in this log, and it is not in this repository.** It was given
to the assistant in chat and read; the *fact* is written down here and the image is not committed —
the same treatment the production project reference gets, for the same reason.

**And the third row is the first thing in this log to be written to production by anybody since the
transfer.** It is a billing setting rather than data, and it is the control `docs/costs.md` calls the
strongest of any service here. It answers **part** of #250: what that issue still holds is the Cap's
figures recorded on the costs page, that page's stale "nothing can bill us" sentences, and the fact that
**compute is excluded from the Cap**, so about $25 a month bills whatever the Cap says.

### And the first backup run — 10 Oct 2026, 12:04 UTC, by the owner

**The first time anything in this repository has read the whole of production.** The owner started
`.github/workflows/backup-production.yml` by hand, on `main`
([run 38050647011](https://github.com/build-once/team-tasks/actions/runs/38050647011), `event`
workflow_dispatch, `conclusion` **failure**). **It read everything and uploaded nothing.**

**Where these lines come from.** The run's **public log and `gh run view --json`**, read by the
assistant in the session that fixed what the run found. The assistant did not start it, holds none of
its credentials, and has read nothing of it beyond that log — which by design carries names, counts,
sizes and statuses only.

| Time (UTC) | Who | What | Why | Result |
|---|---|---|---|---|
| 12:04:32 → 12:05:11 | **The owner**, by `workflow_dispatch` on `main` | **The nightly copy, run by hand: `pg_dump` of the WHOLE production database, and a signed S3 listing of the `attachments` bucket.** Read-only against production — it writes to Cloudflare, never to Supabase | The first real test of the job built in [#258](https://github.com/build-once/team-tasks/issues/258), started by hand and watched rather than waited for | **Read: server 17.6; a dump of 654,776 bytes over 10 schemas; 47 tables counted; the `attachments` bucket listed, 0 objects. Encrypted to 138,272 bytes. THEN THE UPLOAD WAS REFUSED — `PUT answered HTTP 403`. Nothing is in the backup bucket. No row of data was printed, named or retained** |

**Why this is a read and not a write.** It ran `pg_dump` and one `ListObjectsV2`. It applied no
statement, changed no row, and deployed nothing; what it writes to is Cloudflare R2, which is not
production. The plaintext lived in the runner's temporary directory and died with the runner.

**What it cost, said plainly, because it is the reason the job changed.** For about twelve seconds
**production's entire database was in plaintext on a GitHub-hosted runner for nothing** — the upload
was never going to be accepted, and nothing in the job asked whether it would be until it had read
everything. The job now asks the backup bucket for a one-key listing **before it reads anything from
production**, so a credential fault costs a second and no data leaves the database.

**What was settled by it, and it is worth as much as the failure.** The **Supabase S3 access key
works** — that bucket listing is a signed S3 request to a real service, accepted — and the
**PostgreSQL 17 client works against production's 17.6**, which is what the client installed on
2026-10-10 was for. `evidence/build-it-24-nightly-copy.md` section 12 has the whole log and the four
changes the 403 bought; the cause of the 403 is **not established**, and the next run will name it.

**The failure job did what it is for**: it opened [#266](https://github.com/build-once/team-tasks/issues/266)
without a word about what failed.

### Four more backup runs the same day, and TWO COPIES OF PRODUCTION NOW EXIST

**Read from the public run logs and `gh run list --json` by the assistant, in the session that fixed what
the drill found. The owner started every one of them; the assistant started none, holds none of their
credentials, and has never seen a backup file.** All four are reads of production — `pg_dump` and one
signed `ListObjectsV2` — and write only to Cloudflare.

| Time (UTC) | Who | What | Why | Result |
|---|---|---|---|---|
| 12:42 and 12:45 | **The owner**, by `workflow_dispatch` on `main` | The nightly copy, twice. Read-only against production | Trying the fix for the 403 | **Read everything; the upload was refused both times — `403, code AccessDenied`.** The code is the fix from [#267](https://github.com/build-once/team-tasks/pull/267) doing its work: a permission fault named in one word. No copy |
| **12:56** | **The owner**, the same way | The nightly copy | The credential corrected | **A COPY. 47 tables, 0 files, 138,272 bytes stored, read back and verified** |
| **15:07** | **The owner**, the same way | The nightly copy | A second, after the first attached file existed in production | **A COPY WITH A FILE IN IT. 47 tables, 1 file of 1,178,671 bytes, 1,309,392 bytes stored** |

**What those two rows change, and it is the first thing in this log to close a gap rather than open one.**
Production's database and its one attached file are now in an encrypted copy at Cloudflare.
[#248](https://github.com/build-once/team-tasks/issues/248) — "the files are not backed up" — is answered
in fact and not only in a document, and `docs/backups.md`'s map cell that read "everything, permanently"
has been rewritten.

**What they do not change.** No row of data was printed, named or kept by anybody; the copies are
ciphertext and the assistant cannot open them and has not been offered one. **And nothing has been
restored**: the owner's first drill of the 15:07 copy got the database into a new project and was then
refused by the bucket — `415 InvalidMimeType` — so the comparison never ran.
`evidence/build-it-24-nightly-copy.md` section 13 is the record, and
[#266](https://github.com/build-once/team-tasks/issues/266) **stays open until a run succeeds end to
end**, which is what it is for.

---

## 2026-10-11 — the anti-robot check switched on, and the first password actually changed

**Recorded on 12 Oct 2026, a day late, and that is a fault in this file rather than in the actions.**
Rule 19 says every production action goes here **in the same session it happened**; these happened on
11 October and are written on the 12th, from the owner's own account of them given in the session that
wrote `evidence/captcha.md`. It is **not backdated**: the heading is the day of the actions, and this
paragraph is when they were written down. The same fault, with the same wording, is recorded against
the 2026-10-09 section above.

**Where these lines come from.** **The owner's own words**, except the first row (read by the
assistant from a public run log and the Actions API) and the last (the coach's report). As with every
entry above: **the assistant has no production access of any kind, opened no dashboard, ran no command
against production and used no connector**, and has verified nothing below except the first row. The
instructions for this change forbade the connector and the browser tool in as many words.

**On the times.** The owner gave none. The run in the first row carries its own timestamps and they are
printed; everything after it is in the **order** the owner gave, which is what the rows are ordered by.
No clock time is invented.

**The production project's reference is not written here**, as this file's header requires. Nor is the
real Turnstile secret key, which was never given to the assistant and never asked for.

| # | Time (UTC) | Who | What | Why | Result |
|---|---|---|---|---|---|
| 1 | 18:50:26 → 18:51:07 | **The pipeline**, on the merge of PR #289 to `main` | `.github/workflows/migrate-production.yml` — migrations, every function deployed, and the outside smoke test. **A change, through the pipeline, which is the one path rule 10 allows** | Build it 25 part 1 reaching production | Run [38165493741](https://github.com/build-once/team-tasks/actions/runs/38165493741), event `push`, head `aff6ca1`, **`success`**. All three jobs and every step `success`. **Part 1 carries no migration**, so "Apply migrations to production" applied none |
| 2 | No time given | **The owner**, in the Supabase dashboard — **A CHANGE** | **Enabled CAPTCHA protection on production**, provider Cloudflare Turnstile, with the **real** secret key | Row 9 of `docs/rate-limits.md` section 3, and decision **I**: production gets the real keys | Enabled |
| 3 | After 2 | **The owner**, in a browser | Tried to **sign in** to the live site | Checking the thing that had just been switched on | **REFUSED** — "The check that you are not a robot did not pass. Reload the page and try again." |
| 4 | After 3 | **The owner**, in a browser | Read the live sign-in page | Finding the cause | **Cloudflare's "For testing only" line was showing**, so the production build was serving the **dummy** site key, which a real secret key rejects |
| 5 | After 4 | **The owner**, in the Supabase dashboard — **A CHANGE** | **Turned CAPTCHA off** on production | Stopping the lock-out before fixing the cause | Disabled |
| 6 | After 5 | **The owner**, in the **Vercel** dashboard — **A CHANGE** | Corrected the **Production** value of `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to the real site key, and **redeployed production** | The site key is public and belongs in Vercel per environment (`docs/environments.md`); the wrong one was what refused everybody | Corrected and redeployed |
| 7 | After 6 | **The owner**, in the Supabase dashboard — **A CHANGE** | **Turned CAPTCHA on** again, with the real secret key | Finishing row 9 | Enabled, and **the owner signed in** |
| 8 | After 7 | **The owner**, in the Supabase dashboard — **A CHANGE** | **Replaced the "Reset Password" and "Confirm signup" email templates** with the two bodies in `docs/rate-limits.md` section 3 | Rows 12 and 13: what makes an emailed link work in a browser other than the one that asked | Replaced |
| 9 | After 8 | **The owner**, in two browsers — **A CHANGE, AND IT IS THE FIRST ROW OF REAL DATA ANYTHING IN THIS FILE HAS WRITTEN** | Requested a password reset in one browser, **opened the link in a different browser**, pressed the button, **set a new password**, and signed in with it | The whole point of the token-hash links: on 11 Oct a PKCE link opened in a second browser had been accepted by Supabase and reported as "That link didn't work" | **It worked, end to end.** And it **changed an account's password on production** — see below |
| 10 | No time given | The coach (claude.ai), via the read-only connectors | **Three attempted reads of the Auth logs**, on **both** projects — read-only, and nothing but paths, statuses and codes was ever wanted | To corroborate the statuses and codes in rows 2–9 from the service's own record rather than from a report | **EVERY CALL RETURNED A BACKEND ERROR AND NO DATA.** No cause is established, and nothing here can say whether it is retention, the project, the connector or the service |

**Row 9 is the one that changes a sentence this file has carried since 1 October.** The closing section
below said "Nothing has changed production's data. No row of real data has been written". **A password
reset writes one** — `auth.users`' password hash for the account that asked, and its sessions with it.
It is the owner's own account rather than a volunteer's, nothing in `public` was touched, and no row
was read back or printed by anybody. **It is still a write, and the sentence is corrected rather than
stretched to cover it.**

**Row 10 is recorded as an attempted read that returned nothing, not left out.** Rule 8: a check that
could not run is not a pass. What it was for is the one thing that would have corroborated the owner's
report independently, so its absence is why `evidence/captcha.md` labels every status and code in it as
**reported**. What would settle it later: the same read working, or the owner reading Logs → Auth in
each dashboard and reporting paths, statuses and codes only.

**And rows 2 to 7 are a lock-out and a recovery, in about the time it takes to read them.** Every
sign-in, sign-up and password reset on production was refused for as long as row 2's setting and row
6's wrong value were both in place — so there was no way into the app for anybody not already signed
in. **The only person affected was the owner**, because nobody else uses production yet. The build that
made it possible should not have been possible:
[#290](https://github.com/build-once/team-tasks/issues/290) is the guard that would have stopped it at
`next build`, and `evidence/captcha.md` section 2.3 is the whole argument.

**What was NOT done in any of this**, so the absences are on the record: **no rate-limit figure was
changed on either project** (by-hand row 11 is on hold — [#291](https://github.com/build-once/team-tasks/issues/291)),
**leaked-password protection was not reported as switched on** (row 10 of that list, decision **G**),
and **no production function secret was set**, so rule 19's one permission for the assistant is still
unused.

---

## 2026-10-12 — custom SMTP, leaked-password protection, and the counts before a migration

**Where these lines come from.** Rows 1 to 3 are **the owner's own words**, given in the session that
built Build it 25 part 2a; row 4 is the **coach's** read through the production read-only connector,
reported in the same session. As with every entry above: **the assistant has no production access of
any kind, opened no dashboard, ran no command against production and used no connector**, and has
verified nothing below. The instructions for this change forbade the connector and the browser tool in
as many words.

**On the times.** The owner gave none. Rows 1 and 2 happened on **11 October**, before this file's
2026-10-11 section was written, and are recorded here on the 12th because that is when the assistant was
told about them — so the heading is this day and the rows carry their own dates. Row 3 is the 12th.
That is the same fault the 2026-10-09 and 2026-10-11 sections record about themselves, and it is written
down rather than smoothed over.

**No key, password or token is written here**, and none was given to the assistant. The Resend key is
named and not printed, which is the treatment `docs/environments.md` gives every setting: this file holds
names.

| # | Date | Who | What | Why | Result |
|---|---|---|---|---|---|
| 1 | 11 Oct | **The owner**, in **Resend** and the Supabase dashboard — **A CHANGE** | **Enabled custom SMTP on production.** A new Resend API key named **`team-tasks-production-auth-smtp`**; `smtp.resend.com`, port **465**, username `resend`; sender **`invites@notify.raj-dhonota.com`**, sender name **"Team Tasks"** | Rows 2 and 3 of `docs/rate-limits.md` section 3, and decision **L**. Until it was done, Supabase Auth "will refuse to deliver messages to addresses that are not part of the project's team" — so a volunteer signing up on production would have received **nothing at all** | Enabled. **And a reset email arrived at the test mailbox afterwards** — the first time anything in this app's own sending has been seen to work on production |
| 2 | 11 Oct | **The owner**, in the Supabase dashboard — **A CHANGE** | Set production's **emails per hour to 10**, rather than the 30 Supabase imposes when custom SMTP is saved | Row 4 of the same list | Set to 10. **10 an hour is 240 a day against Resend's free 100 a day**, so the mismatch `docs/costs.md` records is three times narrower and has not gone away |
| 3 | 12 Oct | **The owner**, in the Supabase dashboard — **A CHANGE** | **Enabled leaked-password protection on production** | Row 10, and decision **G**. Supabase: "Leaked password protection is available on the Pro Plan and above", which production has been since 10 October | Enabled. **Nothing in this repository can read it back**, so if it were switched off tomorrow every document here would still say it is on |
| 4 | 12 Oct | The coach (claude.ai), via the production read-only connector | **One read of COUNTS ONLY — four counts and two aggregates, no row contents and no column's value in any select list** | The four check constraints in `20261012094500_task_cap_and_input_limits.sql` are validated against every existing row when they are added, so a violating row would fail the migration. `docs/rate-limits.md` section 2 has the four queries | **FOUR ZEROS.** No row violates any of the four. **Nobody is at 500 tasks, and the largest holder has 2.** So no existing row can break the migration and nobody is immediately blocked from adding a task |

**Why row 4 could only be counts.** Those four columns hold an email address, free text about a person,
and task text — all three on `docs/plan.md`'s sensitive list — and this repository is public, so anything
printed here is published. A `count(*)` with the predicate inside the `where` clause has no column in the
select list, so there is nothing for an output line to carry. **The migration keeps its own guards
anyway, at the owner's instruction**, for the reason the migration gives: a count read once is a fact
about that moment, and the file runs later and on more than one database.

**And row 4 is the only pre-check of its kind anybody has run in this project.** Every migration before
this one either created a table (so there were no rows to validate) or added a constraint to a column
this app's own code already bounded. These four are the first added to columns where a violating row was
genuinely possible — `account_status.reason` most of all, because the owner types it in the dashboard and
no code checks it.

**Nothing in row 4 wrote anything. Rows 1 to 3 are settings, not data**: no statement was applied, no
schema changed and no row of anybody's data was written, read back in full, or deleted.

### Later on 12 Oct — two more reads, both the coach's, and the second settles a design question

**Where these lines come from.** Both are **the coach's** reads through the **Supabase production
read-only connector**, reported to the assistant in the session that planned Build it 26. **The
assistant has no production access of any kind, opened no dashboard, ran no command and used no
connector in that session** — the instructions for it forbade the connector and the browser tool in as
many words. **No time was given for either**, and neither is invented here.

| # | Who | What | Why | Result |
|---|---|---|---|---|
| 5 | The coach (claude.ai), via the production read-only connector — **read-only** | Read back what the merge of PR #296 left: the migration count, the trigger on `storage.objects`, what the trigger's function identifies the uploader by, and the EXECUTE privileges on both counting functions | A green deploy job says the statements ran, not what they left behind — the distinction this file's AI-consent and usage-counts entries both make at length | **14** migrations recorded; `attachments_count_upload` **present and enabled** on `storage.objects`; the function **reads `owner_id`**, which is the whole of what `20261012150000` changed; `attachments_count_upload` and `uploads_used_today` **both `security definer`**, with **EXECUTE false for `authenticated` and for `service_role`** |
| 6 | The coach (claude.ai), via the production read-only connector, **and the staging one** — **read-only** | Read every foreign key on `storage.objects`, and the types of its two ownership columns, **on both projects** | `docs/deletion.md` §7 named this as the first unknown Build it 26 has to settle, and the one that decides whether deleting an account works at all | **`storage.objects` has exactly ONE foreign key: `objects_bucketId_fkey` → `storage.buckets(id)`.** `owner` is **uuid** and `owner_id` is **text**, and **NEITHER has a foreign key to `auth.users`** — on staging or on production |

**What row 6 settles, and it is more than it looks.** Three things, and the third is the one that
changes the design:

- **deleting an `auth.users` row neither removes nor is refused by that person's object rows.** The
  rows and the bytes stay, carrying a user id that no longer exists. So of the three possibilities
  `docs/deletion.md` §7 listed — `set null`, `cascade`, `no action` — **the answer is none of them:
  there is no constraint at all**;
- **so `docs/deletion.md`'s step 3 is MANDATORY, not a decision.** Removing every file the person
  uploaded, wherever it is, through the Storage API, is the only thing that stops a file surviving its
  uploader with nobody able to reach it;
- **and the one guard this app does have is narrower than it appeared.**
  `tasks_refuse_delete_with_files` still refuses the cascade — it reads `storage.objects` by path, not
  by owner — so an account deletion is still refused while a file sits on one of **that person's own
  tasks**. It says nothing about a file they uploaded to **somebody else's** task, because that file's
  path names a task that is not going anywhere. **That gap cannot be closed by a trigger**, which is
  exactly why it is a step in the function.

**And it settles a "not confirmed" that has been in a migration since 8 October.**
`20261008191804_attachments_bucket.sql` says of `owner_id`, twice, that "no page read states its type"
and casts both sides to text for that reason — "the comparison that is correct whichever it is". It is
**text**, so every one of those casts was right, and `20261012150000`'s `::text::uuid` wrapped in an
exception handler was right as well: a text column can hold something that is not a uuid, which is the
case that handler exists for.

**Nothing in either row wrote anything, and no row of anybody's data was read.** Row 5 read a
migration list, a catalogue entry, a function body and four privilege answers; row 6 read
`pg_constraint` and two column types. Production holds no accounts and no tasks, so there was nothing
of anybody's to read in any case.

---

## What has been written to production, and by whom

**ELEVEN entries in this file are the owner changing something: two on 10 Oct 2026 — the transfer
between organisations and enabling the Spend Cap — SIX on 11 Oct 2026** (rows **2, 5, 6, 7, 8 and 9**
of the 11 Oct section) — **and THREE more recorded on 12 Oct**: custom SMTP on production and its
emails-per-hour figure, both done on the 11th and written down a day late, and leaked-password
protection on the 12th. Every other entry is a read, except **row 1 of 11 Oct, which is the
pipeline** — counted separately here as it always has been, because a merge to `main` reaching
production is the one path rule 10 asks for rather than somebody acting on production by hand. (This
said "One entry" until the Cap was enabled on 10 Oct, "TWO entries" until 11 Oct, and "EIGHT" until
12 Oct.) Three things this section has always been for, and **one of them has changed**:

- **The assistant has never run a production command of any kind**, and rule 19's one permission —
  `supabase secrets set` against production — has not been used. The first time it is, it goes here,
  in that session, before the session ends. **Still true.**
- **PRODUCTION'S DATA HAS NOW BEEN CHANGED ONCE, and this bullet used to say it never had.** It read
  "Nothing has changed production's data. No row of real data has been written, read back in full, or
  deleted by anybody recorded here." On **11 Oct 2026** the owner reset a password on production and
  set a new one — row 9 above — which writes `auth.users`' password hash for that account and ends its
  sessions. It was the owner's own account, it was done to prove the emailed link worked in a second
  browser, and **nothing in `public` was touched.** What stays true, and is the part worth keeping:
  **no row of real data has been read back in full, printed, or deleted by anybody recorded here**, and
  nothing recorded here has written a volunteer's data because there are no volunteers yet.
- **Nothing has changed production's schema outside the pipeline.** Every migration reached it through
  `.github/workflows/migrate-production.yml` on a merge to `main`, which is what rule 10 asks for. The
  transfer moved the project between organisations, the Spend Cap changed a billing setting, the
  five dashboard changes of 11 Oct changed **Auth settings, a hosting variable and two email
  templates**, and the three recorded on 12 Oct changed **an SMTP configuration, a rate figure and one
  switch**; **not one of them applied a statement**, and the only one that touched a row is named
  in the bullet above. **AND THE THREE MIGRATIONS THIS BULLET WAS STILL WAITING FOR HAVE ARRIVED.** It
  said "The next migration to reach production is `20261012094500_task_cap_and_input_limits.sql`, and
  it goes through the pipeline on a merge like every one before it." It did, and so did
  `20261012120000_upload_daily_count.sql` and `20261012150000_upload_count_from_owner_id.sql`: row 5 of
  12 Oct read **14** migrations off production, and `git ls-files supabase/migrations` counts **14**
  files in this repository. **All three went through the pipeline**, which is what rule 10 asks for, and
  nobody applied a statement to production by hand.
