---
name: incident-first-steps
description: A calm first-hour runbook for when something goes wrong in production, such as a leaked key, exposed data, a broken release or runaway costs. Stop the harm, rotate keys, keep the evidence, note the notification clock, then write a blameless review. Use when the user says "we've been hacked", "data leak", "the site is down", "I think a key leaked", "something is very wrong in production" or "incident".
license: Apache-2.0
---

# Incident first steps

Something has gone wrong. That happens to every team. Go one step at a time, and write things down as you go.

## When to use
- Data may have been seen by people who should not see it.
- A key, password or token may have leaked.
- A release has broken the live app, or costs are climbing fast.

## Always / Ask first / Never
### Always
- Keep a timeline from the first minute: the time, what you saw, what you did.
- Stop the harm first: switch the feature off, roll back to the last good release, or take the affected page offline.
- Rotate any key that could be involved.
- Keep evidence before cleaning anything up: export logs, note release versions, take screenshots.
- Write down the time you became aware. Some legal clocks start then.
- Tell the person who makes decisions for the project.

### Ask first
- Before deleting anything.
- Before contacting users, regulators or the press.
- Before restoring a backup over the current data.

### Never
- Never wipe servers or logs to "clean up" before evidence is copied somewhere safe.
- Never blame a person in the notes or the review.
- Never guess at legal duties. Get proper advice.
- Never share details publicly while the hole is still open.

## The notification clock
Under the EU and UK GDPR, a personal data breach that is likely to put people's rights at risk generally has to be reported to the data protection authority within 72 hours of becoming aware of it. If the risk to people is high, they must also be told without undue delay. Other countries, laws and contracts set their own clocks. **This is not legal advice.** Talk to a qualified adviser early, and keep a record of every decision and its time.

## Steps
1. **Start the timeline.** Create `incident-YYYY-MM-DD.md` in a private place. Write the time you became aware.
2. **Stop the harm.** Switch off the feature, roll back, or put up a maintenance page. Then prove it stopped (see prove-it).
3. **Rotate keys** that could be involved (see secrets-check). Revoke the old ones.
4. **Keep evidence.** Export logs covering the whole window, note which release was live, take screenshots. Store them privately, never in a public repository.
5. **Measure the scope** with counts only: what data, how many people, since when (see production-read).
6. **Decide on notification** with the owner and an adviser. Record the decision and the time.
7. **Fix the cause** through the normal change flow (see safe-change), with a test that fails first.
8. **Write a blameless review** within a week: what happened, the timeline, why the system allowed it, and what will change. Focus on systems, not people.

## Evidence to show
- The timeline file.
- Proof the harm stopped.
- The key rotation record.
- Where the preserved evidence is kept.
- The scope counts.
- The notification decision, with its time.
- The review document.

## Red flags
- "Let's wipe the server and start fresh." (Evidence first.)
- "It was their fault."
- "We've got plenty of time before we need to tell anyone."
- "It's fixed", with no proof the harm stopped.
- "No need to rotate, the key was only exposed for a few minutes."

## Course lessons
- Book 1 Ch 29: incident basics.
- Book 2 Ch 14: incident response and blameless reviews.
