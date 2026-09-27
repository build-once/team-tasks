---
name: migration-safety
description: Keeps database changes safe. Every schema change lives in a migration file, is tried on your own machine and then on staging, and reaches production only through the normal deploy, using expand-then-contract for anything that renames or removes. Use when the user wants to "add a column", "rename a field", "change the database", "remove a table", "run this SQL on production", or edits anything in a migrations folder.
license: Apache-2.0
---

# Migration safety

A migration is a small, numbered file that describes one change to the database's shape. Because it is a file, it can be reviewed, tested, replayed on a fresh database, and traced later.

## When to use
- Any change to tables, columns, indexes, constraints, policies or database functions.
- When someone offers to "just run it in the dashboard" on production.
- When renaming or removing anything the running app still uses.

## Always / Ask first / Never
### Always
- One migration file per change, committed with git.
- Test in this order: your machine (rebuild the database from every migration), then staging, then production through the deploy pipeline.
- Use expand-then-contract for any rename or removal (explained below).
- Say whether each migration is an expand step or a contract step.
- Prove a new rule works: try to save a bad row and watch it be refused.

### Ask first
- Any contract step (removing a column or table, or making a rule stricter).
- Anything that rewrites or locks a large table.
- Editing a migration that has already run anywhere other than your machine.

### Never
- Never change the production schema by hand in a dashboard or SQL console.
- Never edit a migration that has already been applied elsewhere. Write a new one.
- Never expand and contract the same thing in one deploy.
- Never deploy code that needs a new column before that column exists.

## Expand, then deploy, then contract
Renaming `fullname` to `display_name` safely takes three separate releases:
1. **Expand.** A migration adds `display_name` and copies the data across. The old code keeps working because nothing it uses has gone.
2. **Deploy the code** that writes both columns and reads the new one. Wait, and confirm nothing reads `fullname` any more.
3. **Contract.** A later migration, in its own pull request, removes `fullname`.

At every moment, the running code matches the database it is talking to.

## Steps
1. Create the file with your framework's "new migration" command, so it gets the right number and folder.
2. Write the SQL. Make it safe to run twice where you can (for example `IF NOT EXISTS`).
3. On your machine, rebuild the database from all migrations and run the tests. Paste the output and exit code.
4. Test the behaviour: for a new required field or rule, try to save a row that breaks it and show the refusal.
5. Open a pull request (see safe-change). Let the pipeline apply it to staging and check the app there.
6. Merge. Let the pipeline apply it to production, then confirm it appears in the list of applied migrations.
7. Plan the contract step as its own later pull request, if one is needed.

## Evidence to show
- The migration file path and whether it is expand or contract.
- The local rebuild and test output, with exit codes.
- The refused bad row, for any new rule.
- Staging checked, and the production applied-migrations list showing the file.

## Red flags
- "I ran it in the SQL editor on production, it was quicker."
- "I edited the old migration file."
- "The migration ran without errors, so it works." (Did anything test the behaviour?)
- "I removed the old column in the same change as adding the new one."
- "The code is merged; the migration will catch up."
- A migration containing `DROP` with no mention of what still reads that data.

## Course lessons
- Book 1 Ch 15: migrations and schema changes.
- Book 2 Ch 10: expand and contract, and release ordering.
