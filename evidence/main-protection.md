# Evidence: the default branch is protected

Result: PASS — the ruleset is active, a direct push was refused by GitHub, and the local guard
refuses the attempt before it is even made
Date: 2026-09-29
How checked: the owner set the ruleset and pushed from their own terminal; the assistant read the
ruleset back from the API and ran the guard probes
Checked by: owner, and the assistant for the API and guard parts

This closes the gap reported in issue #13: the branch that deploys the site and migrates production
had nothing stopping a direct push to it.

## The ruleset

A GitHub **ruleset** named `protect main`, active, targeting the default branch:

- Restrict deletions
- Block force pushes
- Require a pull request, with **0** required approvals
- Require the `required` status check, with **up-to-date branches**
- **Empty bypass list** — nobody, including the owner, can go around it

Read back from the API on 2026-09-29, rather than taken on trust:

```
$ gh api repos/build-once/team-tasks/rulesets
[{"id":24166370,"name":"protect main","target":"branch","enforcement":"active", ...}]

$ gh api repos/build-once/team-tasks/rulesets/24166370
"enforcement":"active"
"conditions":{"ref_name":{"exclude":[],"include":["~DEFAULT_BRANCH"]}}
"rules":[
  {"type":"deletion"},
  {"type":"non_fast_forward"},
  {"type":"pull_request","parameters":{"required_approving_review_count":0, ...}},
  {"type":"required_status_checks","parameters":{
     "strict_required_status_checks_policy":true,
     "required_status_checks":[{"context":"required","integration_id":15368}]}}
]
"bypass_actors":[]
"current_user_can_bypass":"never"
```

**A note for anyone who checks this later.** The older endpoint reports nothing:
`gh api repos/build-once/team-tasks/branches/main/protection` returns `404 Branch not protected`.
That endpoint describes *classic branch protection*, which is a different feature. A ruleset is
invisible to it. Issue #13 was filed partly on the strength of that 404, so: **use the rulesets
endpoint**, or the Rules tab in the repository settings.

## A direct push, refused by GitHub

Run by the owner from their own terminal, on 2026-09-29:

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Changes must be made through a pull request.
remote: - Required status check "required" is expected.
! [remote rejected] main -> main (push declined due to repository rule violations)
```

This is the half that matters most. The ruleset is not merely configured; it was seen turning away a
real push, from a person with full access to the repository.

## The local guard, on both shells

Run by the assistant on 2026-09-29, one attempt each, with a nonce supplied by the owner. The nonce
was never printed, so neither command ran:

```
PowerShell  echo guard-arming-probe <nonce>   -> Blocked by guard [arming-probe]
Bash        echo guard-arming-probe <nonce>   -> Blocked by guard [arming-probe]
PowerShell  git push origin main              -> Blocked by guard [push-to-main]
Bash        git push origin main              -> Blocked by guard [push-to-main]
```

The last two matter more than the probe. The probe only proves the hook runs; these prove a
substantive rule matches a real, dangerous command, on both shells. On Windows that is not a given:
`guard/arming-probe.md` records a rehearsal in which every PowerShell command ran unchecked while a
Bash-only probe reported ARMED.

## Two layers, and why both are here

The guard stops the assistant before a command runs, on this machine only. The ruleset stops anybody,
from anywhere, including someone with no guard installed and including the owner. Neither replaces the
other: the guard is a seatbelt, the ruleset is the lock on the door.

## Output (secrets removed)

No key, token, password or email address appears above. Accounts are named as the owner, Alice, Bob
and Carol, as `evidence/TEMPLATE.md` asks.
