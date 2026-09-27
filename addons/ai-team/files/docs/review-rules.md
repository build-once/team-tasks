# Review rules

The AI reviewer checks every pull request against these rules, and only these. It reads this file from **main**, so a pull request cannot change the rules it is reviewed by. Keep each rule short and checkable. Every rule starts with `- **R<number>**`; the harness drops findings that cite any other id.

- **R1** Every new table has row-level security turned on, with a policy that limits each row to its owner or team.
- **R2** No secret, key, password or token appears in code, tests, logs or anything sent to the browser. Only the publishable key may be in browser code.
- **R3** No test is deleted, skipped or made easier to pass. New behaviour comes with a test.
- **R4** Database changes are expand-then-contract: add the new thing, move to it, remove the old thing in a later change. No change both drops and replaces in one step.
- **R5** Anything a user types is treated as untrusted: checked on the server, never built into SQL or HTML by joining strings.
- **R6** Errors shown to users say what to do next and never include stack traces, internal ids or other people's data.
- **R7** A user can only see or change their own data or their team's. Check the server-side rule, not only the screen.
- **R8** No new dependency without a reason in the pull request description.
