# Evidence: Build it 16 step 2 — the function doors

Issue #112, which closes #110 and #111. Branch `fix/function-doors`. **No migration, no deploy, and
no change to what any function does**: the diff to `supabase/functions` is comment lines only, and the
one new file is a staging check script.

Result: **the comment fixes are done and shown below. The three staging checks are NOT RUN** — the
script exists and its own logic is proved able to fail, but nothing has been sent to staging. Issue
#112 says the owner runs it.
Date: 2026-10-03
Checked by: **the assistant (Claude Code)**, on this machine, for everything in §1 to §5. Nothing in
this file was observed on staging or production by anybody yet.

## Who observed what, and the one thing that matters

**No part of this file is a staging result.** The assistant did not run the new script against
staging, did not sign anybody in, did not call any Edge Function, and deployed nothing. Every command
below ran locally against files in this repository.

So the question issue #110 asks — *does the platform really verify a token's signature?* — is still
**unanswered**. What this change delivers is the check that would answer it, plus proof that the check
can fail. Until the owner runs it, any claim that the signature is verified still carries the
UNVERIFIED mark #110 put on it.

## 1. The three untrue comments (issue #111)

The same command #111 names as the test, run on this branch. No output, exit 1 — `git grep` exits 1
when it finds nothing:

```
$ git grep -n "NOT DEPLOYED" -- supabase/functions
exit=1
```

A check that found nothing could be a check that looked at nothing (rule 8), so here is the same
command against `origin/main`, where the two lines still are. It finds them, which is what makes the
run above mean something:

```
$ git grep -n "NOT DEPLOYED" origin/main -- supabase/functions
origin/main:supabase/functions/accept-invite/index.ts:20:// NOT DEPLOYED. This file has never been pushed to any project.
origin/main:supabase/functions/invite-member/index.ts:27:// NOT DEPLOYED. This file has never been pushed to any project.
exit=0
```

Both headers now say where each function **is** deployed — staging by the owner, production on the
merge of PR #44 by the `deploy-functions` job — and point at `evidence/invitations.md` →
"What is deployed where", which is the record with a date and an observation behind it. The wording
follows `supabase/functions/create-team/index.ts:24-28`, as #111 asked.

The third comment, at what is now `supabase/functions/invite-member/index.ts:311-323`, used to claim
the "no such team" answer was identical to "not yours". It now says what the code does: zero rows is
**404 "That team was not found."**, a non-owner is a separate **403 "Only the team's owner can invite
people."**, and the reason the two are deliberately told apart is the one the same file already gives
just above, at `:294-295` on this branch (`:286-287` on `main`, before these comments moved the lines
down).

**Nothing but comment text changed**, and that is machine-checked rather than eyeballed. Every added
and removed line in the diff was matched against "starts with `+` or `-`, and the first thing after it
is not `//`":

```
$ git diff -U0 -- supabase/functions      (saved to a file, then searched)
pattern: ^[+-]\s*[^/+\- ]
0 matches
```

And the control, because zero matches is also what a broken search looks like. The same pattern over
`git show cd547da -- web/src`, a commit that really did change code:

```
pattern: ^[+-]\s*[^/+\- ]
270 matches
```

**Unverified — the two `.ts` files were not compiled.** This repository has no Deno check and no
`tsc` step for `supabase/functions` (searched `.github/workflows/` for `deno` and `tsc --noEmit`: no
matches), so nothing here type-checks those files. For a comment-only change that is a small risk, not
a zero one. The way to settle it is `deno check` with each function's `deno.json` as its import map, or
a deploy to staging, and neither was done.

## 2. The new script parses

```
$ node --check scripts/staging/build-it-16-checks.mjs
exit=0
```

## 3. The script's own checks can fail — `--selftest`

`scripts/staging/build-it-16-checks.mjs --selftest` needs no network, no account and no
`web/.env.local`. It feeds every judgement in the file answers from a world where the doors are open,
and requires each one to come out FAIL. This is the part of #112 that asks the pull request to "show
how its checks would fail if a door were open".

```
$ node scripts/staging/build-it-16-checks.mjs --selftest
build-it-16-checks --selftest: can these checks fail?

Each case below is an answer this script might get back. The
expectation is what the judgement must say about it. Nothing is
sent anywhere and no account is used.

  ok    a shut door: 401 from the platform
          expected PASS, PASS, PASS; got PASS, PASS, PASS
  ok    AN OPEN DOOR: the forged token was accepted and the body reached the code
          expected FAIL, PASS, FAIL; got FAIL, PASS, FAIL
  ok    AN OPEN DOOR that still says 401 -- the handler's own refusal, not the platform's
          expected PASS, PASS, FAIL; got PASS, PASS, FAIL
  ok    AN OPEN DOOR: 401, but with data in the body
          expected PASS, FAIL, PASS; got PASS, FAIL, PASS
  ok    AN OPEN DOOR: 200, with a row in the body
          expected FAIL, FAIL, PASS; got FAIL, FAIL, PASS
  ok    an unexpected shape: a 401 whose body has an error string
          expected PASS, PASS, FAIL; got PASS, PASS, FAIL
  ok    the request never arrived
          expected UNVERIFIED, UNVERIFIED, UNVERIFIED; got UNVERIFIED, UNVERIFIED, UNVERIFIED
  ok    the owner rule holds: 403 in invite-member's own words
          expected PASS; got PASS
  ok    THE OWNER RULE IS OPEN: 201, an invitation into somebody else's team
          expected FAIL; got FAIL
  ok    something got past the owner check and hit a later limit: 409
          expected FAIL; got FAIL
  ok    nothing was tested: 404, so that team id does not exist
          expected UNVERIFIED; got UNVERIFIED
  ok    a 403 that is not invite-member's -- not its refusal, so not an answer
          expected UNVERIFIED; got UNVERIFIED
  ok    the refusal left nothing behind: 0 invitations, owner confirmed
          expected PASS; got PASS
  ok    THE REFUSAL STILL CREATED A ROW: 1 invitation
          expected FAIL; got FAIL
  ok    0 rows, but Alice does not own that team -- which is why 0 proves nothing
          expected UNVERIFIED; got UNVERIFIED
  ok    the 404 fires, in invite-member's own words
          expected PASS; got PASS
  ok    a 404 from the gateway, not from the function
          expected UNVERIFIED; got UNVERIFIED
  ok    THE 404 HAS BECOME A 403 -- the distinction #111 is about, collapsed
          expected UNVERIFIED; got UNVERIFIED
  ok    AN INVITATION FOR A TEAM THAT DOES NOT EXIST: 201
          expected FAIL; got FAIL

19 cases, 0 wrong.

Every judgement said FAIL to an open door and PASS to a shut one.
That is what makes a green staging run mean something. It is NOT
itself a staging result: nothing was sent anywhere by this run.
exit=0
```

The third case is the one the whole of #110 is about: **a 401 that came from the function's own code
rather than from the platform.** The status alone would have called it a pass. It is caught because the
script sends `{}` as the body of every forged call, so a function that was reached answers in its own
words — and the judgement looks for those words.

## 4. The selftest itself can fail — the break-it run

A selftest that cannot go red is decoration. So one judgement was deliberately broken — the status
check in `judgeClosedDoor` was changed to return PASS unconditionally — and the selftest was run again:

```
$ node scripts/staging/build-it-16-checks.mjs --selftest      (with the status check broken)
  WRONG  AN OPEN DOOR: the forged token was accepted and the body reached the code
          expected FAIL, PASS, FAIL; got PASS, PASS, FAIL
          PASS  create-team: answers 401 -- saw HTTP 400 -- a 400 means the body reached the function's own code, which is what verify_jwt = false looks like
          PASS  create-team: the 401 body carries no data -- HTTP 400, 52 characters, no address and no id in it
          FAIL  create-team: the refusal came from the platform, not the handler -- HTTP 400, and the body contains the function's own words ("Please give the team a name."), so the request reached the handler
  WRONG  AN OPEN DOOR: 200, with a row in the body
          expected FAIL, FAIL, PASS; got PASS, FAIL, PASS
          PASS  create-team: answers 401 -- saw HTTP 200
          FAIL  create-team: the 401 body carries no data -- HTTP 200: it contains a uuid, so possibly an id
          PASS  create-team: the refusal came from the platform, not the handler -- HTTP 200, and no wording or shape of the functions' own in the body
19 cases, 2 wrong.

The judgements in this file do not behave as its comments claim.
Fix them before running anything against staging: a check that
cannot fail is worse than no check, because it reports a pass.
exit=1
```

(Only the two WRONG blocks are shown; the other 17 lines read `ok`, exactly as in §3.)

Then the break was reverted and the selftest re-run: **19 cases, 0 wrong, exit 0** — the same output as
§3. `git grep "DELIBERATELY BROKEN"` finds nothing in `scripts/`, so the marker left with it. The
committed file is the green one.

Worth noticing in that output: the break hid two cases and the other two checks still caught both.
Three independent judgements on one refusal is why.

## 5. The repository's own test suite

```
$ npm test
PASS: 537 rule examples across 24 rules, plus 32 fail-closed checks.
lint-skills: PASS - 12 skills, 0 problems
launch-check selftest: PASS (171/171 assertions, 39 checklist items, 17 auto checks, git available)
Self-test: 7/7 cases passed.
Checked 4 workflow file(s), 16 job(s): 0 problem(s), 0 warning(s).
vet-tool selftest: PASS (34/34 assertions; 20 malicious detections, 24 findings on malicious fixture, 0 HIGH/MEDIUM on benign near-miss control)
handoff selftest: PASS (57/57 assertions; 11 secret types redacted, 9 controls unchanged, end-to-end ran)
Self-test: 20/20 cases passed.
AI team self-test: 258 passed, 0 failed.
Checked 6 workflow file(s), 14 job(s): 0 problem(s), 0 warning(s).
exit=0
```

(The per-case lines of the guard, drift and ai-team self-tests are left out; the totals above are
their own summary lines, pasted as they came back. Nothing failed.)

`web/` was not linted or built, because nothing under `web/` changed.

## 6. What was NOT run, and what therefore stays unproved

- **Nothing was sent to staging.** No sign-in, no Edge Function call, no database read. The three
  checks issue #112 asks for — a forged token refused with 401, Bob's 403 with no invitation left
  behind, and the 404 for a team that does not exist — have **not been observed**. Issue #112 says the
  owner runs the script, and it has not been run.
- **Nothing was deployed.** The comment changes reach staging and production the way everything else
  does: a pull request the owner merges.
- **The expired-token half of #110 is unverified**, and the script cannot fix that by itself: it
  cannot sign a token and it will not wait an hour for one to lapse. It checks that case only when
  `EXPIRED_ACCESS_TOKEN` is set, says `NOT RUN ... unverified: EXPIRED_ACCESS_TOKEN is not set` when it
  is not, and **that one line does not change the exit code** — so a green run still leaves the
  question open. The bottom of the script says how to get such a token. Filed as issue #113 so it does
  not leave with this pull request.
- **The two `.ts` files were not type-checked.** See the end of §1.
- **CI does not run this script's selftest.** The two staging scripts beside it are not in CI either,
  and `.github/workflows/` is not the assistant's to change (rule 5). Filed as issue #114.

## 7. CI on the pull request

PR #115, run **37126300700**. Every check green, including `required` — the one job that is marked
required in the branch rules and that fails if any other job was skipped rather than succeeding:

```
App build                               pass  29s
Drift-check self-test                   pass  5s
Guard self-test                         pass  31s
Handoff self-test                       pass  4s
Launch check self-test                  pass  6s
Secret scan (gitleaks)                  pass  6s
Skills lint                             pass  4s
Vet-tool self-test                      pass  7s
Workflow lint (permissions + timeouts)  pass  7s
npm test (macos-latest)                 pass  34s
npm test (windows-latest)               pass  1m14s
required                                pass  4s
```

(From `gh pr checks 115 --watch`. The two Vercel checks also passed; the preview deployment is not
part of this change and nothing was tested on it.)

**None of these jobs runs the new script's `--selftest`** — that is issue #114. What CI proves here is
that nothing else broke.

## Personal data in this file

**Nothing was captured from production, or from staging, or from anywhere else** — rule 18, and an
empty list is the complete answer here. There was no response body to redact, because no request was
sent to any project.

No email address, user id, team id, invitation id, token or hash appears above. The two addresses that
appear in the script are patterns it builds at run time from `example.com` and a timestamp, belonging
to nobody. The one id in this file, `cd547da`, is a commit in this repository.

The new script is written so a future run of it stays that way: it never prints a password, an access
token, a refresh token, the publishable key, a real address, a user id or an invitation id, and every
response body it prints goes through a scrub that replaces any token the script is holding with a
placeholder first.
