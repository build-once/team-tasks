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

## What has been written to production, and by whom

**One entry in this file changed something: the transfer on 10 Oct 2026, by the owner, in the
dashboard.** Every other entry is a read. Three things stay true, and they are the three this section
has always been for:

- **The assistant has never run a production command of any kind**, and rule 19's one permission —
  `supabase secrets set` against production — has not been used. The first time it is, it goes here,
  in that session, before the session ends.
- **Nothing has changed production's data.** No row of real data has been written, read back in full,
  or deleted by anybody recorded here.
- **Nothing has changed production's schema outside the pipeline.** Every migration reached it through
  `.github/workflows/migrate-production.yml` on a merge to `main`, which is what rule 10 asks for. The
  transfer moved the project between organisations; it did not apply a statement.
