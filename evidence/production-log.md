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

---

## Nothing written to production yet

No entry above changed anything: every one is a read. **The assistant has never run a production
command of any kind**, and rule 19's one permission — `supabase secrets set` against production — has
not been used. The first time it is, it goes here, in that session, before the session ends.
