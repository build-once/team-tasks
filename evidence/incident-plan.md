# Evidence: incident-plan

Result: PASS — `docs/incident-plan.md` exists, and one of its four kill switches has been flipped
off and on again on staging, with the sentence seen on the screen both ways round.
Date: 2026-10-15
How checked: the owner applied the migration to staging with `supabase db push`, deployed the five
server functions, then switched `ai_suggestions` off in the Supabase Table Editor and pressed
Suggest subtasks on PR #316's preview deploy as Alice; then switched it back on and pressed it
again. The before-and-after pair is the whole check.
Checked by: the owner. **Nothing here was run or seen by the assistant** — rule 19 refuses
`supabase db push` to it everywhere, and it has opened no dashboard and no browser.

---

## 1. The plan exists and is reachable from a phone

`docs/incident-plan.md`, committed, so it is on GitHub and opens in a phone's browser — which is
the one thing Lesson J24 asks of it beyond its contents. It names the one person, the first five
minutes in order, each of the four switches, how to flip one in the Table Editor, and what each
one does and does not stop.

**What it is checked against, so this row is not only "a file exists":**
`scripts/screen-state-check.mjs` section 16j requires the page to name all four switches, the
table, the column and the Table Editor, and to carry the two warnings in section 3 below. That
runs on every pull request.

## 2. The switch, flipped — staging, 15 October 2026

**Order, as the owner reports it:**

1. `supabase db push` to staging for `20261015120000_feature_switches.sql` — *"Finished supabase
   db push."*
2. The five server functions deployed to staging. This mattered more than usual: it is the first
   time `accept-invite` imports from `_shared`, so a bundler refusal would have failed the deploy
   and changed nothing.
3. In the Supabase **Table Editor**, `public.feature_switches` → row `ai_suggestions` →
   `enabled` set to **false**.
4. On PR #316's preview deploy, signed in as **Alice**, pressed **Suggest subtasks**.

```
Suggestions are switched off for now.
```

5. `enabled` set back to **true**, pressed Suggest subtasks again: **suggestions returned.**

**Why both halves are the check and not one.** A gate that refused everybody would have produced
that sentence too. Step 5 is what says the switch is a switch rather than a feature that has
stopped working — the same before-and-after pair every other staging run in this folder rests on.

**It is the sentence this repository holds in four places**, compared character for character by
`scripts/screen-state-check.mjs` section 16b: the Edge Function's `SWITCHED_OFF_MESSAGES`,
`web/src/lib/switches.ts`, `web/src/lib/suggestions.ts` and My tasks. So what Alice saw is the
string in the repository and not a near-miss.

## 3. The two surprises the plan warns about, and their standing

`docs/incident-plan.md` carries both because they were measured on a local PostgreSQL sandbox
(`evidence/build-it-29-kill-switches.md`), **not because anybody has met them on a real project:**

| The warning | Standing today |
|---|---|
| **Deleting a row switches the feature OFF**, because `feature_on()` reads a missing row as false | measured on the sandbox; **nobody has deleted a row on staging or production** |
| **With `attachments` off, a file cannot be deleted either**, so a task with files cannot be deleted | measured on the sandbox; **the attachments switch has not been flipped on any real project** |

So the plan's own "Not verified" section stays, narrowed: the `ai_suggestions` switch has been
exercised on staging, and the other three have not.

## 4. What this row does NOT establish

- **No switch has been flipped on PRODUCTION**, and the plan does not ask for one to be: the
  point of a kill switch is that the first time you use it is a bad day.
- **No incident has happened.** The plan has not been followed through under pressure, which is
  the only thing that would really test the order of its first five minutes.
- **The screens for the other three switches have not been seen** — the attachments banner on My
  tasks, the plan panel on My teams, and the invitation page's sentence.
- **Nothing was captured from production**, so there is nothing in this file to redact and the
  list of replaced values is empty.
