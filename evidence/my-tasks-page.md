# Evidence: My tasks page — rename, delete, and the done count

Result: PASS — rename and delete, and the done count, all checked by hand
Date: 2026-09-28
How checked: by hand, signed in on a Vercel preview deploy pointing at the staging database
Checked by: owner

Test accounts are the ones named in `docs/environments.md`. Their email addresses and passwords stay
in the owner's password manager and are **not** written here, as the template asks.

## Renaming and deleting a task (PR #15) — PASS

Checked on PR #15's preview, signed in as **Alice**, on 2026-09-28. All four passed.

```
1. Rename a task                     -> the new title is shown          PASS
2. Rename with an empty title        -> refused, task unchanged         PASS
3. Delete, then Cancel               -> nothing changed                 PASS
4. Delete, then confirm              -> the task was removed            PASS
```

These are the checks the pull request asked for, reported by the owner. The isolation half — that
another account cannot rename or delete Alice's task by using its id — is **not** covered here.

## The done count and the empty state — PASS

Branch `feat/done-count`. Checked by hand on a Vercel preview deploy pointing at staging.

**The preview was identified before anything was clicked**, so the results belong to known code: the
deployment's Source read `feat/done-count` at commit `6d18b57`, status **Ready**. Without that step a
passing check can belong to an older build.

Alice's tasks were left in place, including the one called `Alice private task SAMPLE`, which later
steps need. The empty state was checked with **Carol**, who has none.

```
As Alice
 1. /tasks shows "N of M done" matching the rows on screen      PASS
 2. Tick one off      -> N rises by one, M unchanged            PASS
 3. Untick it         -> back to the first reading              PASS
 4. Add a task        -> M rises by one                         PASS
 5. Delete a task     -> the total drops                        PASS

As Carol (no tasks)
 6. /tasks shows "No tasks yet", and no counter at all          PASS

As Bob
 7. The counter matches Bob's own rows -- he has one task       PASS
 8. None of Alice's tasks or numbers appear                     PASS
```

Checks 7 and 8 are the ones that matter most, and they were seen together: signed in as Bob, the page
showed his single task and nothing of Alice's.

**The counter is not a safety check.** It counts the same array the list is drawn from, so it always
agrees with the rows on screen, whatever those rows are. If the row-level security rules ever failed,
Bob would see Alice's tasks *and* a count that matched them perfectly — nothing would look wrong. The
only thing that catches that is a person recognising whose tasks are on screen, which is what check 8
is: the owner knowing that `Alice private task SAMPLE` belongs to Alice and must not appear for Bob.

## Output (secrets removed)

```
$ npm run lint    (in web/)
> eslint
npm run lint exit code: 0

$ npm run build   (in web/)
✓ Compiled successfully
  Finished TypeScript
✓ Generating static pages (9/9)
npm run build exit code: 0
```
