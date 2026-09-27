---
name: rls-two-account-test
description: Proves that row-level security (the database rules that decide who can see which rows) really keeps users apart, using two test accounts, Alice and Bob, on staging. Covers signed-out access, reading, writing and deleting another user's rows, and storage buckets. Use when adding or changing a table, a policy, a storage bucket or a sharing feature, or when the user asks "can other users see my data?", "is RLS working?", "test the permissions" or "check data isolation".
license: Apache-2.0
---

# RLS two-account test

Security rules that were never tested against a second user are a guess. Alice and Bob turn the guess into evidence.

## When to use
- After adding a table, a storage bucket or a security policy.
- After changing who can share, invite or see something.
- When the user asks whether other people can see their data.

## Always / Ask first / Never
### Always
- Test on staging, never production.
- Create Alice and Bob through the app's normal sign-up.
- Test signed out as well as signed in.
- Test read, insert, update and delete, one at a time.
- Test storage buckets (uploaded files) as well as tables.
- Write down the expected result before each test.
- Include the positive control: Alice can read her own row and file.

### Ask first
- Before creating test accounts in a shared environment.
- Before changing a policy just to make a test pass.

### Never
- Never test with an admin or service key. It skips the rules, so everything "works".
- Never rely only on the dashboard's SQL editor, which usually runs as the owner and also skips the rules.
- Never read an empty result as "blocked" unless Alice's control read succeeded.
- Never run this against production.

## Steps
1. **Set up.** On staging, sign up Alice and Bob. As Alice, create one row in each table under test and upload one file to each bucket. Note the row IDs and file paths.
2. **Positive control.** As Alice, read her row and download her file. Both must work. If they do not, the test itself is broken: stop and fix it.
3. **Signed out.** Using only the public key, try to list the table and download Alice's file. Expect nothing, or a clear denial.
4. **As Bob, try to:**
   - read Alice's row by its ID;
   - list the table (expect Bob's rows only: zero of Alice's);
   - change Alice's row;
   - remove Alice's row;
   - add a row that claims Alice as its owner;
   - download, overwrite and remove Alice's file.
5. **Re-check as Alice.** Sign back in as Alice and confirm her row and file are unchanged. Many databases answer a blocked change or removal with "success, 0 rows affected" rather than an error, so only the re-check proves nothing happened.
6. **Record** every attempt in a table: action, who, expected, actual, verdict.
7. **Save the test** as a script so it can be re-run whenever a policy changes.

## Evidence to show
- The results table, one line per attempt.
- Alice's positive control result.
- The after-check showing Alice's data unchanged.
- Which key was used for each role (public key only; never the service key).

## Red flags
- "I tested it in the SQL editor and it's fine."
- "Bob got no error, so the change was blocked." (Check the rows-affected count, and re-check as Alice.)
- "I only tested reading."
- "Storage uses the same rules, so I skipped it."
- "Staging wasn't set up, so I ran it on production."

## Course lessons
- Book 1 Ch 14: protecting your database (Lessons D1 and D3).
- Book 1 Ch 23, Lessons D23 and D24: storage rules, and testing file access as a second user and signed out.
- Book 1 Lesson A22: creating Alice and Bob on staging.
