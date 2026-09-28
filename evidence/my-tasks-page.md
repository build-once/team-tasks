# Evidence: My tasks page — rename, delete, and the done count

Result: PARTIAL — rename and delete PASS; the done count is not checked yet
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

## The done count and the empty state — NOT CHECKED YET

Branch `feat/done-count`. Lint and build pass; nothing below has been run.

Do not delete all of Alice's tasks: later steps need the task called
`Alice private task SAMPLE`. The empty state is checked with **Carol**, who has none.

```
As Alice
 1. /tasks shows "N of M done" matching the rows on screen      [ ]
 2. Tick one off      -> N rises by one, M unchanged            [ ]
 3. Untick it         -> back to the first reading              [ ]
 4. Add a task        -> M rises by one, N unchanged            [ ]
 5. Delete a ticked task -> both N and M drop by one            [ ]

As Carol (no tasks)
 6. /tasks shows "No tasks yet", and no counter at all          [ ]

As Bob
 7. The counter matches Bob's own rows, whatever he has         [ ]
 8. None of Alice's tasks or numbers appear                     [ ]
```

Check 8 is the one that matters most. The count comes from the same query that draws the list, so if
the row-level security rules ever failed, a number larger than the rows on screen would be the first
visible symptom.

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
