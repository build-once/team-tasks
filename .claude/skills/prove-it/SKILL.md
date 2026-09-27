---
name: prove-it
description: Makes the assistant prove a piece of work is finished before saying so, by naming the command that checks it, running it, and pasting the real output and exit code with a PASS, FAIL or UNVERIFIED verdict. Use whenever you are about to say "done", "fixed", "working", "all tests pass" or "ready to merge", or when the user asks "is it done?", "did that work?", "prove it" or "show me the evidence".
license: Apache-2.0
---

# Prove it

A claim of "done" is only worth the evidence behind it. This skill turns "I think it works" into "here is the command, here is what it printed, here is its exit code."

## When to use
- Just before you tell the user that anything is finished, fixed, passing or safe.
- When the user asks "did it work?", "is it done?" or "prove it".
- When checking someone else's claim that a task is complete.

## Always / Ask first / Never
### Always
- Name the exact command that would show the claim is true, before you run it.
- Paste the output as it was printed, plus the exit code (0 usually means success).
- Give one verdict per claim: PASS, FAIL, or UNVERIFIED with a reason.
- Say how many things you expected (tests, rows, files) and check that number was reached.
- Run a positive control: show that the same check finds something when there is something to find.

### Ask first
- Before running a check that is slow, costs money, or touches a shared or live system.
- When the only possible proof needs access you do not have, such as live customer data or a paid account.

### Never
- Never write "should work", "looks good" or "that fixed it" without output to back it up.
- Never report UNVERIFIED as if it were FAIL, or as if it were PASS. "I could not check" is its own answer.
- Never treat "0 failures" as success on its own. A run that tested nothing also has 0 failures.
- Never trim, edit or retell the output so that it reads better.

## Steps
1. Write the claim in one sentence, for example "The sign-up form rejects an empty email."
2. Choose the command that proves it (a test, a build, a script, a query) and write down the expected result, including a count: "expect 14 tests, 14 passed."
3. Run it. One command at a time, so each exit code belongs to exactly one step.
4. Copy the output and the exit code into your reply without changing them.
5. Compare what you got with what you expected. Check the count, not just the absence of red.
6. Run the positive control. If a search or scan came back empty, run it again on something you know should match. If the control is empty too, the tool is not pointed at anything, and the empty result means nothing.
7. Give the verdict:
   - **PASS**: it ran, the expected count was reached, and the control fired.
   - **FAIL**: it ran and the result was wrong. Say what was wrong.
   - **UNVERIFIED**: it could not run, or you could not see the result. Give the reason (no access, tool missing, hidden behind another error). Unverified does not mean false. It means nobody knows yet.

## Evidence to show
- The claim, the command, and the expected result with its count.
- The pasted output and the exit code.
- The comparison: "expected 14, saw 14".
- The positive control and what it found.
- The verdict word: PASS, FAIL or UNVERIFIED.

## Red flags
- "Should work now." / "That ought to fix it."
- "All tests pass", with no count and no output.
- "No problems found" from a search, with no sign the search looked at any files.
- "I verified it", with nothing pasted.
- "I couldn't check it, so it's probably fine."
- Output that has been described in words instead of pasted.

## Course lessons
- Book 1 Ch 8, Lessons G1 to G15: evidence, exit codes, expected counts and positive controls.
