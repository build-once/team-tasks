---
name: launch-check
description: Runs the pre-launch checklist with node scripts/launch-check.mjs, then works through every FAIL and UNVERIFIED item until each one has evidence saved in the evidence/ folder. Use when the user asks "are we ready to launch?", "can we go live?", "run the pre-launch check", "can real users start using this?", or before announcing a product.
license: Apache-2.0
---

# Launch check

Launch day is when mistakes become public. The checklist makes "ready" a list of proven items rather than a feeling.

## When to use
- Before the first real users arrive.
- Before a big announcement or a paid campaign.
- After any large change, before telling people about it.

## Always / Ask first / Never
### Always
- Run `node scripts/launch-check.mjs` and paste the summary, with its counts and exit code.
- Work on FAIL items first, then UNVERIFIED items.
- Save one evidence file per item in `evidence/`, named after the item.
- Run the script again at the end and compare the counts.
- Check that the number of items checked matches what the script says it should check.

### Ask first
- Before marking any item "not applicable".
- Before launching with any item still FAIL.

### Never
- Never edit the script or the checklist to make an item pass.
- Never turn UNVERIFIED into PASS without evidence.
- Never put secrets or personal data in evidence files. Mask them.
- Never say "ready" while any FAIL is open without the owner's written decision.

## Steps
1. Run `node scripts/launch-check.mjs`. Paste the summary and exit code.
2. List the FAIL items, then the UNVERIFIED items with the reason each one gave.
3. For each item, use the matching skill (secrets-check, rls-two-account-test, migration-safety, prove-it and so on). Save the result as `evidence/<item-id>.md` containing the date, the command, the pasted output and the verdict.
4. Run the script again and confirm the counts moved the way you expect.
5. Finish with either every item PASS, or a short list of remaining items, each with the owner's written decision and a date to revisit.

## Evidence to show
- First and last runs of the script, with counts and exit codes.
- The list of files in `evidence/`.
- The owner's written decision for any exception.

## Red flags
- "Most things pass, that's good enough."
- "UNVERIFIED just means the script couldn't tell, so it's fine."
- "I marked it not applicable."
- "I relaxed the check because it was too strict."
- An evidence file that just says "done", with no output.

## Course lessons
- Book 1 Ch 30: the launch checklist and evidence folder.
