## What changed

<!-- One or two plain sentences. What does this do, and why? -->

## Evidence (paste exact output)

<!--
Paste the REAL output of the commands you ran, including the exit code.
"It works" or "tests pass" is not evidence. For example:

    $ npm test
    ...
    exit code: 0

For anything a person sees, add a screenshot from staging.
-->

```
paste output here
```

## Environments touched (local/staging/production)

- [ ] local
- [ ] staging
- [ ] production — **if ticked, explain why and who ran it.** The AI assistant never touches production.

## Unverified items

<!--
Anything you could not check, and why. Write it as:
  unverified — <reason>
For example: "Email delivery: unverified — staging email provider is not set up yet."
"Nothing" is fine only if it is true.
-->

## Checklist

- [ ] This PR is on its own branch (not `main`).
- [ ] I pasted real output and exit codes above, not a summary.
- [ ] No secrets, keys or real customer data are in the diff, screenshots or logs.
- [ ] I tested as Alice (owner), Bob (outsider) and Carol (team member) on staging where it matters.
- [ ] No guard files were changed (`.claude/hooks/`, `.claude/settings.json`, `guard/`) — or, if they were, a person made that change on purpose and explains it here.
- [ ] Database changes are in a migration file, not typed into a dashboard.
- [ ] Anything I could not check is listed under "Unverified items".
