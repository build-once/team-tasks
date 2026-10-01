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

## Nothing written to production yet

No entry above changed anything. **The assistant has never run a production command of any kind**, and
rule 19's one permission — `supabase secrets set` against production — has not been used. The first
time it is, it goes here, in that session, before the session ends.
