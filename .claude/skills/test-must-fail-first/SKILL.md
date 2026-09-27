---
name: test-must-fail-first
description: Proves a test can really catch a bug. Run it green, break the feature on purpose, watch the test turn red for the right reason, then put the feature back and see green again. Also spots tests that cannot fail. Use when writing a new test, when a test passes first time, after fixing a bug, or when the user asks "does this test actually test anything?" or "add a test for this".
license: Apache-2.0
---

# Test must fail first

A test that has never been seen failing has never been seen working. Breaking the feature on purpose is the quickest way to find out whether the test is watching it.

## When to use
- After writing any new test.
- After fixing a bug: the test for the fix should fail without the fix.
- When a test passed the very first time it ran.
- When someone asks whether a test is worth anything.

## Always / Ask first / Never
### Always
- See the test fail for the right reason: a message about the feature, not a crash or a typo.
- Restore the feature and see the test pass again.
- Keep the deliberate break tiny and obvious.
- Note the test count before and after.

### Ask first
- If breaking the feature would mean changing shared settings or shared data.

### Never
- Never commit the deliberate break.
- Never weaken a test so that it passes.
- Never accept a test that cannot fail. Common ways a test is empty:
  - no assertion at all;
  - an assertion that is always true, such as checking that a list's length is zero or more;
  - calling the function but throwing its result away, never checking it;
  - forgetting to wait for an async call, so the test ends before the check;
  - a try/catch that swallows the failure;
  - a snapshot updated without anyone reading the change.

## Steps
1. **Green.** Run the test on its own. Note the result and count, for example "1 passed".
2. **Break it.** Make the smallest change that should make the feature wrong: flip a condition, return the wrong value, skip the save. For a bug-fix test, undo the fix.
3. **Red.** Run the test again. It must fail, and the message should describe the behaviour. Paste it.
4. **Still green?** Then the test is not watching the feature. Fix the test and go back to step 1.
5. **Restore.** Undo the break. Run `git diff` and confirm only your intended changes remain.
6. **Green again.** Run the test. Then run the whole suite and check the total count has not dropped.

## Evidence to show
- Three pasted runs: green, red (with its failure message), green.
- One line describing the deliberate break.
- `git diff` after restoring, showing the break is gone.
- Suite total before and after.

## Red flags
- "The test passed first time, so it's good."
- "I couldn't make it fail, but it passes."
- "It's red because of an import error." (That is the wrong reason.)
- "I updated the snapshot so it passes."
- "I'll remove the deliberate break later."

## Course lessons
- Book 1 Ch 17: tests that can fail, vacuous assertions and discarded results.
