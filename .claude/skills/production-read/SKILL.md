---
name: production-read
description: A safe way to answer questions about live production data without giving the assistant access to it. The assistant writes a read-only query that returns only counts, proves it on staging against an answer known in advance, and the owner runs it on production and pastes back just the numbers. Use when someone asks "how many users in production...", "check the live data", "is this bug affecting real users?" or "can you query the production database?".
license: Apache-2.0
---

# Production read

The assistant never needs to see real people's data to answer most questions about it. It needs numbers, and it needs to be sure the query producing them is right.

## When to use
- Any question about what is in the live database.
- Sizing a bug: how many users, how many rows, since when.
- When someone offers to hand over production credentials "just for a minute".

## Always / Ask first / Never
### Always
- Read only: `SELECT` inside a read-only transaction.
- Return counts and totals only. No names, emails, IDs, messages or other personal data.
- Prove the query on staging first, against an answer you set up in advance.
- Include a control count (such as the table's total rows) so a zero can be trusted.
- Let the owner run it on production.

### Ask first
- If the question can only be answered by looking at individual rows. Stop and discuss.
- If the query may be slow on a large table.

### Never
- Never ask for production passwords, keys or connection strings.
- Never include `INSERT`, `UPDATE`, `DELETE` or schema changes.
- Never ask the owner to paste raw rows or personal data.
- Never trust a zero without the control count beside it.

## Steps
1. **Turn the question into a number.** "How many accounts created since 1 September have no profile?"
2. **Write the query**, with a control column and the answer column:
   ```sql
   START TRANSACTION READ ONLY;
   SELECT count(*) AS total_accounts,
          count(*) FILTER (WHERE p.id IS NULL) AS answer
   FROM accounts a
   LEFT JOIN profiles p ON p.account_id = a.id
   WHERE a.created_at >= '2026-09-01';
   ROLLBACK;
   ```
3. **Set up a known answer on staging.** For example, create 3 accounts with no profile. Run the query. The answer must be 3. Paste the output.
4. **Prove the guard.** On staging, add a write inside the same read-only transaction and show the database refuses it ("cannot execute ... in a read-only transaction").
5. **Hand over.** Give the owner the exact query text, where to run it, and what to paste back: the two numbers only.
6. **Read the result.** If the control count is 0, the query looked at nothing: the answer is UNVERIFIED, not "no one is affected". Otherwise report the answer with the control beside it.

## Evidence to show
- Staging run output, with the known answer matched.
- The refused write, proving the transaction is read-only.
- The owner's pasted counts.
- Your reading of them, with a PASS, FAIL or UNVERIFIED verdict.

## Red flags
- "Send me the production password and I'll check."
- "Paste the first 50 rows so I can see."
- "It returned 0, so nobody is affected." (Where is the control count?)
- "I tweaked the query after testing it on staging." (Test it again.)
- "While we're in there, let's fix those rows."

## Course lessons
- Book 2 Lesson A24: the owner-runs-query pattern.
