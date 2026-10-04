# Evidence: Build it 16 step 2 — the function doors

Issue #112, which closes #110 and #111. Branch `fix/function-doors`. **No migration, no deploy, and
no change to what any function does**: the diff to `supabase/functions` is comment lines only, and the
one new file is a staging check script.

Result: **the comment fixes are done, and the three staging checks issue #112 asks for have now been
run against staging by the owner.** Every check that ran passed; the run is in §6a. One optional
check, the expired-token half of #110, did **not** run — issue #113 — so that question stays open.
Date: 2026-10-03
Checked by: **the assistant (Claude Code)**, on this machine, for everything in §1 to §5 and §8.
**§6a was observed by the owner, not by the assistant**: the owner ran the script against staging and
pasted the output into the session that wrote §6a. The assistant did not run it, was not at that
terminal, and has still sent nothing to staging. Nothing in this file was observed on production by
anybody.

§6a is the newest part of this file. §8 records the two changes the coach's review of PR #115 asked
for; the output in §3 and §4 was re-run after those changes and replaced, and it is not the output the
review saw.

## Who observed what, and the one thing that matters

**§6a is a staging result. No other part of this file is.** The assistant did not run the new script
against staging, did not sign anybody in, did not call any Edge Function, and deployed nothing. Every
command in §1 to §5 and §8 ran locally against files in this repository. §6a is the owner's run,
transcribed from the output they pasted.

So the question issue #110 asks — *does the platform really verify a token's signature?* — now has a
staging observation behind it for the altered-token half, and **only** that half: §6a says what the
two refusal codes do and do not show. The expired-token half was never asked (#113) and keeps the
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

Re-run after the two review changes in §8, which is why there are 39 cases here and not the 19 the
coach's review counted:

```
$ node scripts/staging/build-it-16-checks.mjs --selftest
build-it-16-checks --selftest: can these checks fail?

Each case below is something this script might be handed: a URL
from web/.env.local, a token it built, or an answer that came
back. The expectation is what the judgement must say about it.
Nothing is sent anywhere and no account is used.

  ok    the staging URL itself
          expected PASS; got PASS
  ok    NOT STAGING, and it contains the staging reference -- the coach's stand-in server
          expected FAIL; got FAIL
  ok    NOT STAGING: the reference in a path on somebody else's https host
          expected FAIL; got FAIL
  ok    NOT STAGING: the reference in a query string
          expected FAIL; got FAIL
  ok    NOT STAGING: the staging host as the start of a longer domain
          expected FAIL; got FAIL
  ok    NOT STAGING: the staging host as a URL user name, so the host is example.com
          expected FAIL; got FAIL
  ok    NOT STAGING: the right host, but over plain http
          expected FAIL; got FAIL
  ok    NOT STAGING: the right host, on another port
          expected FAIL; got FAIL
  ok    not a URL at all: the bare reference
          expected FAIL; got FAIL
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
  ok    the alteration worked: the real header and signature, a different sub
          expected PASS; got PASS
  ok    THE ALTERATION DID NOTHING: the token about to be sent is the real one
          expected FAIL; got FAIL
  ok    THE WRONG PART CHANGED: the signature, not the payload -- that is the forged case over again
          expected FAIL; got FAIL
  ok    THE WRONG PART CHANGED: a fresh header, so the header is no longer the platform's
          expected FAIL; got FAIL
  ok    nothing to change: the real token has no sub claim
          expected UNVERIFIED; got UNVERIFIED
  ok    AN ALTERED TOKEN WAS ACCEPTED: the handler answered, so the signature was not checked
          expected FAIL, PASS, FAIL; got FAIL, PASS, FAIL
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
  ok    the altered token in a response body is replaced
          expected PASS; got PASS
  ok    THE ALTERED TOKEN WAS NEVER REGISTERED: it comes straight back out
          expected FAIL; got FAIL
  ok    NOTHING REGISTERED AT ALL: every token survives
          expected FAIL; got FAIL
  ok    a real access token in a response body is replaced
          expected PASS; got PASS
  ok    a scrub case that proves nothing: the token is not in the text at all
          expected UNVERIFIED; got UNVERIFIED

39 cases, 0 wrong.

Every judgement said FAIL to an open door and PASS to a shut one,
refused every URL that is not the staging host, refused to send a
token that had not actually been altered, and took a registered
token out of a body it was printing. That is what makes a green
staging run mean something. It is NOT itself a staging result:
nothing was sent anywhere by this run.
exit=0
```

The case named `AN OPEN DOOR that still says 401` is the one the whole of #110 is about: **a 401 that
came from the function's own code rather than from the platform.** The status alone would have called
it a pass. It is caught because the script sends `{}` as the body of every forged call, so a function
that was reached answers in its own words — and the judgement looks for those words.

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

(Only the two WRONG blocks are shown; the other lines read `ok`. That run was made against the
19-case version of the file, before §8; the case count in its totals line was 19.)

Worth noticing in that output: the break hid two cases and the other two checks still caught both.
Three independent judgements on one refusal is why.

### 4b. The same thing for the two judgements §8 adds

Both new judgements were broken in turn, by hand, and the selftest run each time. Neither break was
committed.

**The staging guard, with the old `includes()` test put back** — the exact code this change replaces,
so this run also says what the old guard let through:

```
$ node scripts/staging/build-it-16-checks.mjs --selftest   (judgeStagingUrl replaced by includes())
  ok    the staging URL itself
          expected PASS; got PASS
  WRONG  NOT STAGING, and it contains the staging reference -- the coach's stand-in server
          expected FAIL; got PASS
          PASS  the Supabase URL is the staging project, exactly ghskxrhqlhvrhpnivqbd.supabase.co -- DELIBERATELY BROKEN: includes()
  WRONG  NOT STAGING: the reference in a path on somebody else's https host
          expected FAIL; got PASS
  WRONG  NOT STAGING: the reference in a query string
          expected FAIL; got PASS
  WRONG  NOT STAGING: the staging host as the start of a longer domain
          expected FAIL; got PASS
  WRONG  NOT STAGING: the staging host as a URL user name, so the host is example.com
          expected FAIL; got PASS
  WRONG  NOT STAGING: the right host, but over plain http
          expected FAIL; got PASS
  WRONG  NOT STAGING: the right host, on another port
          expected FAIL; got PASS
  WRONG  not a URL at all: the bare reference
          expected FAIL; got PASS

34 cases, 8 wrong.
exit=1
```

**All eight** non-staging URLs passed the old guard, including the coach's stand-in server and a bare
reference that is not a URL at all. (The per-case `PASS` detail line is shown once; it was identical
on all eight. The other 26 cases read `ok`. 34 was the case count before §3's scrub cases were added.)

**The altered-token judgement, made to say PASS without comparing anything:**

```
$ node scripts/staging/build-it-16-checks.mjs --selftest   (judgeAlteration returns PASS at once)
  WRONG  THE ALTERATION DID NOTHING: the token about to be sent is the real one
          expected FAIL; got PASS
          PASS  the altered token is a changed copy: the real header and signature, a different sub -- DELIBERATELY BROKEN: nothing was actually compared
  WRONG  THE WRONG PART CHANGED: the signature, not the payload -- that is the forged case over again
          expected FAIL; got PASS
  WRONG  THE WRONG PART CHANGED: a fresh header, so the header is no longer the platform's
          expected FAIL; got PASS

34 cases, 3 wrong.
exit=1
```

That first WRONG line is the one that matters: with that judgement broken, the script would have sent
**Bob's live access token, unaltered**, to all three functions.

**The scrub, made to return its input untouched:**

```
$ node scripts/staging/build-it-16-checks.mjs --selftest   (scrubWith returns text unchanged)
  WRONG  the altered token in a response body is replaced
          expected PASS; got FAIL
          FAIL  scrub: the altered token in a response body is replaced -- the token is STILL in the result, with 2 placeholder(s) registered
  WRONG  a real access token in a response body is replaced
          expected PASS; got FAIL
          FAIL  scrub: a real access token in a response body is replaced -- the token is STILL in the result, with 2 placeholder(s) registered

39 cases, 2 wrong.
exit=1
```

Note which three cases stayed `ok` there: the two that expect FAIL and the one that expects
UNVERIFIED. A broken scrub cannot make those go green, which is why the two PASS cases are the ones
carrying the weight. (The other 34 lines read `ok`.)

### 4c. The committed file is the green one

```
$ node scripts/staging/build-it-16-checks.mjs --selftest
39 cases, 0 wrong.
exit=0
```

(The full output is §3.)

```
$ git grep -n "DELIBERATELY BROKEN" -- scripts/
exit=1
```

No output, exit 1 — `git grep` exits 1 when it finds nothing, so every marker left with its break. The
control for that empty result is the three runs above: the same marker is in their output, which is
what shows the search looks at something.

**Unverified — the three breaks were reverted by hand, one edit each, not by `git checkout`.** The
evidence that each revert was complete is the grep above plus the green run in 4c, not a diff against
a saved copy.

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

Re-run after the §8 changes. Every total above came back identical, which is the expected result and
not a strong one: **none of these suites looks at `scripts/staging/`** — that is issue #114.

`web/` was not linted or built, because nothing under `web/` changed.

## 6. The staging run, and what is still not run

### 6a. The owner's run against staging — 2026-10-03

The owner ran the script from this branch, on their own machine, against staging, and pasted the
output into the session that wrote this section. **The assistant did not run it and was not at that
terminal.** Everything below is a transcription of what was pasted. The only change made to it: lines
the terminal had hard-wrapped at the window width were joined back up, which is the same treatment
§3's output has. No wording, number, verdict or body was altered, and nothing was added.

The logic check was run first, in the same session, immediately before the staging run. Its output is
not repeated here, because it is the output already in §3 down to the totals line — `39 cases, 0
wrong.` It sends nothing anywhere, so it is not itself a staging result; it is what makes the run
below mean something.

Then the two setup commands, as the bottom of the script describes them — the first keeps a file name
in shell history rather than a password, and the team id is not a secret:

```
$ set -a; . ~/.config/team-tasks/staging.env; set +a
$ export ALICE_TEAM_ID='6a1c7b65-a84b-42aa-b40c-1c547097163a'
```

And the run:

```
$ node scripts/staging/build-it-16-checks.mjs
Build it 16 step 2 -- the function doors, staging only
  staging host:       ghskxrhqlhvrhpnivqbd.supabase.co (confirmed by parsing the URL, not by a substring)
  functions:          create-team, invite-member, accept-invite
  Alice's team id:    6a1c7b65-a84b-42aa-b40c-1c547097163a
  absent team id:     67691500-e70a-48b8-867f-379fcebb2204 (made up for this run)
  invite address:     build-it-16-1791040459129@example.com (fabricated, nobody's)
  signing in as:      Alice and Bob
  tokens, passwords and the publishable key: not printed

THIS SCRIPT CREATES NOTHING. Every request it sends is one a
function must refuse, and the forged calls carry an empty body, so
even a function that answered them would have nothing to write.

1. A token of the right shape with a made-up signature
   (needs no account: the token is not anybody's. A platform may
   refuse this one on its header alone, which is what 1c is for)
  PASS  create-team: answers 401 -- saw HTTP 401
  PASS  create-team: the 401 body carries no data -- HTTP 401, 58 characters, no address and no id in it
  PASS  create-team: the refusal came from the platform, not the handler -- HTTP 401, and no wording or shape of the functions' own in the body
        body: {"code":"UNAUTHORIZED_LEGACY_JWT","message":"Invalid JWT"}
  PASS  invite-member: answers 401 -- saw HTTP 401
  PASS  invite-member: the 401 body carries no data -- HTTP 401, 58 characters, no address and no id in it
  PASS  invite-member: the refusal came from the platform, not the handler -- HTTP 401, and no wording or shape of the functions' own in the body
        body: {"code":"UNAUTHORIZED_LEGACY_JWT","message":"Invalid JWT"}
  PASS  accept-invite: answers 401 -- saw HTTP 401
  PASS  accept-invite: the 401 body carries no data -- HTTP 401, 58 characters, no address and no id in it
  PASS  accept-invite: the refusal came from the platform, not the handler -- HTTP 401, and no wording or shape of the functions' own in the body
        body: {"code":"UNAUTHORIZED_LEGACY_JWT","message":"Invalid JWT"}

1b. A correctly signed token that has expired (optional)
  NOT RUN  all three functions: an expired token is refused -- unverified: EXPIRED_ACCESS_TOKEN is not set, so this was never asked
        This script cannot make a correctly signed token: it has no key, and
        it will not wait an hour for one to lapse. See the bottom of this file
        for how to get one. This line does NOT change the exit code -- the
        three checks issue #112 asks for are what that is about -- so a green
        run still leaves this half of issue #110 unproved.

1c. A token the platform issued moments ago, with its sub claim
    changed and its header and signature left exactly as they were
  PASS  the altered token is a changed copy: the real header and signature, a different sub -- header and signature kept, sub replaced with a uuid belonging to nobody. The real header's alg is ES256 and it carries a kid -- read that before reading a 401 below as proof that a signature was checked
  PASS  create-team (altered token): answers 401 -- saw HTTP 401
  PASS  create-team (altered token): the 401 body carries no data -- HTTP 401, 62 characters, no address and no id in it
  PASS  create-team (altered token): the refusal came from the platform, not the handler -- HTTP 401, and no wording or shape of the functions' own in the body
        body: {"code":"UNAUTHORIZED_ASYMMETRIC_JWT","message":"Invalid JWT"}
  PASS  invite-member (altered token): answers 401 -- saw HTTP 401
  PASS  invite-member (altered token): the 401 body carries no data -- HTTP 401, 62 characters, no address and no id in it
  PASS  invite-member (altered token): the refusal came from the platform, not the handler -- HTTP 401, and no wording or shape of the functions' own in the body
        body: {"code":"UNAUTHORIZED_ASYMMETRIC_JWT","message":"Invalid JWT"}
  PASS  accept-invite (altered token): answers 401 -- saw HTTP 401
  PASS  accept-invite (altered token): the 401 body carries no data -- HTTP 401, 62 characters, no address and no id in it
  PASS  accept-invite (altered token): the refusal came from the platform, not the handler -- HTTP 401, and no wording or shape of the functions' own in the body
        body: {"code":"UNAUTHORIZED_ASYMMETRIC_JWT","message":"Invalid JWT"}

2. invite-member, called by somebody who does not own the team
  PASS  invite-member as Bob, against Alice's team: answers 403 -- HTTP 403, with invite-member's own wording
        body: {"error":"Only the team's owner can invite people."}
  PASS  Alice owns ALICE_TEAM_ID -- 1 row, and its owner_id is Alice
  PASS  invite-member as Bob: created no invitation -- 0 invitation(s) for that address on that team, expected 0

3. invite-member, called about a team that does not exist
  PASS  invite-member as Alice, against a team id that does not exist: answers 404 -- HTTP 404, with invite-member's own wording
        body: {"error":"That team was not found."}

  (Alice signed out: HTTP 204)
  (Bob signed out: HTTP 204)

Totals: 23 PASS, 0 FAIL, 0 UNVERIFIED, 1 NOT RUN (optional).

Every check that ran passed. One optional check did NOT run: the
expired-token half of issue #110, marked UNVERIFIED above. This
run does not answer it, and the exit code does not pretend to.
```

**The exit code is unverified.** The paste ends at the shell prompt with no `echo $?`, so no exit code
was observed and this file does not state one. What can be said is what the source says, which is a
different kind of claim: the script sets a non-zero exit code only when there is a FAIL or an
UNVERIFIED (`scripts/staging/build-it-16-checks.mjs:1610-1617`), and the closing paragraph this run
printed is the one belonging to the `notRun > 0` branch below that (`:1618-1622`), which sets nothing.
Read from the file, not seen in the terminal. The way to settle it is to run it again and print `$?`.

**The totals, as printed:** `23 PASS, 0 FAIL, 0 UNVERIFIED, 1 NOT RUN (optional).` Counting the `PASS`
lines in the output above by hand gives 23 — nine in check 1, ten in 1c (the alteration judgement, plus
three functions × three judgements), three in check 2 and one in check 3 — the same number the script's
own totals line reports.

**The three checks issue #112 asks for were observed, for the first time:**

- **Check 1** — a forged token is refused with 401 by all three functions, with nothing in the body and
  no wording of the functions' own.
- **Check 2** — Bob, against Alice's team, gets 403 in invite-member's own words, and **left no
  invitation behind**: 0 rows for that address on that team. Alice's ownership of that team was
  confirmed in the same run (1 row, `owner_id` Alice), which is what stops the 0 from being the empty
  result a wrong team id would also produce.
- **Check 3** — a team id that does not exist gets 404 in invite-member's own words.

Checks 2 and 3 are together the observation issue #111's third comment is about: the two answers really
are different in the running functions — 403 `Only the team's owner can invite people.` and 404
`That team was not found.` — which is what that comment now claims they are.

**The two refusal codes, and what each one shows.** The forged token and the altered real token were
both refused with HTTP 401 and the same message, `Invalid JWT`, but with **different codes**:

| the token that was sent | code in the body | body length |
|---|---|---|
| forged: an `HS256` header with no `kid`, and a made-up signature | `UNAUTHORIZED_LEGACY_JWT` | 58 characters |
| altered: the real `ES256` header **with** a `kid`, the real signature, `sub` replaced with a uuid belonging to nobody | `UNAUTHORIZED_ASYMMETRIC_JWT` | 62 characters |

Both lengths agree with the bodies printed above, counted character by character in the session that
wrote this, so neither body was shortened on its way into this file.

- **`UNAUTHORIZED_LEGACY_JWT`** is check 1, and it is why check 1 **on its own does not answer #110**.
  The code names the legacy path — the shared-secret one that the forged `HS256` header asks for — and
  not the asymmetric one. A refusal there is consistent with the platform turning the token away on its
  header, which is exactly the objection the coach's review raised (§8.2) and the reason 1c exists.
  **That is a reading of what the code is called**: the platform said `Invalid JWT` and nothing more, so
  it did not state which check failed.
- **`UNAUTHORIZED_ASYMMETRIC_JWT`** is 1c, and it is the one that bears on #110. The header, the
  algorithm, the key id and the rest of the payload were the platform's own and unchanged; the one thing
  wrong with that token was that the signature no longer matched the payload it was sent with. A
  different code from check 1's says the platform did something different with it, and it was still
  refused at the door — 401, 62 characters, no wording of the functions' own, so the handler was never
  reached by a token claiming a `sub` that belongs to nobody.
- **The `kid` ambiguity §8.2 warned about does not apply to this run.** That paragraph said 1c's PASS
  would be worth less if the real header turned out to carry no `kid`, because then a platform refusing
  on a missing `kid` could explain the 401 too. The run printed the answer: *the real header's alg is
  ES256 and it carries a kid*. Nothing was missing from the header that was sent.
- **What the run does not show** is the platform naming the check that failed. `Invalid JWT` is the same
  message in both cases, and the code names a path, not a reason. What was observed is a shut door to a
  token with a real header, a real signature and an altered payload; what was not observed is any
  statement by the platform that it verified a signature.

**The expired-token check was not run.** Plainly: **1b did not run, and nothing here answers it.** The
line the run printed is `NOT RUN  all three functions: an expired token is refused -- unverified:
EXPIRED_ACCESS_TOKEN is not set, so this was never asked`, and the run's own closing paragraph says the
same thing. That is **issue #113**, which was open when this section was written (`gh issue view 113`,
in the same session: state `OPEN`, title "The expired-token half of #110 is still unasked"). A green run
does not touch it.

**What the run did not do**, as its own header says: it created nothing. Every request in it is one a
function must refuse, the forged and altered calls carry an empty body, and both accounts were signed
out at the end — HTTP 204 each. No migration, no deploy, and nothing against production.

**One thing this run settles that §8.1 had left half-open:** the new `judgeStagingUrl` guard ran
against a real `web/.env.local` and accepted it — that is the first output line, `confirmed by parsing
the URL, not by a substring`, which the script prints at `:1374`, after the guard decides at `:1115`.
The refusal half of that guard is still not exercised; see the end of §8.1 and the bullet below.

### 6b. What was NOT run, and what therefore stays unproved

- **The assistant has still sent nothing anywhere.** No sign-in, no Edge Function call, no database
  read by the assistant, on staging or anywhere else. §6a is the owner's observation, and it is a
  transcription here, not a check this file's author performed.
- **The module-level code has now run — once, in the owner's run, not on this machine.** `forgeToken`,
  the token registry's startup registrations, `callFunction`, `readRows`, `signIn` and `signOut` all
  executed in §6a. `readExpiry` still has **never** executed: it is reached only when
  `EXPIRED_ACCESS_TOKEN` is set (`scripts/staging/build-it-16-checks.mjs:1426` takes the other branch
  when it is empty, and the only call is at `:1442`), and 1b did not run. The local runs still stop at
  the missing account variables, which is earlier than all of it.
- **The guard now forecloses the review technique that found its bug.** The coach's end-to-end run
  used a local stand-in server, which §8.1 exists to refuse. Filed as issue #117 so the trade-off is
  recorded rather than discovered.
- **Nothing was deployed.** The comment changes reach staging and production the way everything else
  does: a pull request the owner merges.
- **The expired-token half of #110 is unverified, and the run in §6a did not change that.** The script
  cannot fix it by itself: it cannot sign a token and it will not wait an hour for one to lapse. It
  checks that case only when `EXPIRED_ACCESS_TOKEN` is set, and in §6a it printed
  `NOT RUN ... unverified: EXPIRED_ACCESS_TOKEN is not set` instead. **That one line does not change
  the exit code** — so the green run in §6a leaves the question exactly where it was. The bottom of the
  script says how to get such a token. Issue #113.
- **The two `.ts` files were not type-checked.** See the end of §1.
- **CI does not run this script's selftest.** The two staging scripts beside it are not in CI either,
  and `.github/workflows/` is not the assistant's to change (rule 5). Filed as issue #114. §5 above
  shows what that means in practice: the whole suite passes without looking at this file at all.
- **The guard's refusal path, as opposed to the function that decides it, is still not covered by any
  run.** §6a exercised the accepting path on a real `web/.env.local`; the three lines that turn a
  refusal into a `die()` have run nowhere. See the end of §8.1.
- **`accept-invite` trusts the email address in the verified token, which is safe only while "Confirm
  email" is on** — otherwise somebody could sign up claiming an invited person's address without ever
  proving they hold it, and the comparison in `supabase/functions/accept-invite/index.ts` would match.
  The owner reported on 3 October 2026 that it is on (added for issue #120; **reported, not observed
  here** — the setting is in the Supabase dashboard, which nothing in this repository reads).

## 7. CI on the pull request

PR #115. Two runs are recorded here, because §8's changes came after the first one.

**The §8 commit, `d98d84e`, run 37131661562.** Every check green, including `required` — the one job
that is marked required in the branch rules and that fails if any other job was skipped rather than
succeeding:

```
App build                               pass  26s
Drift-check self-test                   pass  7s
Guard self-test                         pass  30s
Handoff self-test                       pass  8s
Launch check self-test                  pass  7s
Secret scan (gitleaks)                  pass  5s
Skills lint                             pass  10s
Vet-tool self-test                      pass  7s
Workflow lint (permissions + timeouts)  pass  5s
npm test (macos-latest)                 pass  47s
npm test (windows-latest)               pass  1m5s
required                                pass  5s
```

**The first commit, `78f8b42`, run 37126300700.** Also green, with the same twelve jobs, at 29s / 5s /
31s / 4s / 6s / 6s / 4s / 7s / 7s / 34s / 1m14s / 4s. (`727ebca`, the commit that added this section,
had run 37126438976, also green — recorded in a comment on PR #115 rather than here, because a file
that records the CI result of the commit that records the CI result never finishes. The commit that
adds *this* paragraph has a later run again, and the same applies to it.)

(Both from `gh pr checks 115 --watch`. The two Vercel checks also passed in each; the preview
deployment is not part of this change and nothing was tested on it.)

**None of these jobs runs this script's `--selftest`** — that is issue #114, and §5 shows the same
thing locally. What CI proves here is that nothing else broke.

## 8. The coach's review of PR #115 — both changes made

The review is a comment on PR #115, posted at `727ebca`. It asked for two changes before the staging
run, and both are on this branch. This section was written **before** the staging run; the run that
exercised both changes is §6a, and the two notes below that it left unproved are marked there.

### 8.1 The staging guard accepts only the staging host

**What was wrong.** The guard was `supabaseUrl.includes(STAGING_REF)`. The coach pointed a stand-in
server at `http://127.0.0.1:8799/ghskxrhqlhvrhpnivqbd`, which contains the reference, and the script
accepted it **and sent Alice's and Bob's passwords to it**.

**What it is now.** `judgeStagingUrl` parses the URL with `new URL` and requires four things: the
scheme is exactly `https:`, the host is exactly `ghskxrhqlhvrhpnivqbd.supabase.co`, there is no user
name or password in the URL itself, and there is no explicit port. Anything else is a refusal.

The two extra requirements beyond what the review asked for are each there for a case the host test
alone does not cover: `https://ghskxrhqlhvrhpnivqbd.supabase.co@example.com/` reads as the staging
host to a person while `new URL` resolves its host to `example.com`, and an explicit port is not where
the project is served.

**Where it runs.** The guard moved **earlier** in the file, to immediately after `web/.env.local` is
read and **before** any account variable is read out of the environment. On the old ordering the
account variables were read first. Nothing is sent and no password is touched before the guard
decides.

**It was the whole URL, not the host, that the old guard would have accepted.** The nine selftest
cases in §3 are the proof, and §4b shows all eight non-staging ones passing the old test.

The refusal still does not print the URL it found, for the reason it gives: a project reference
identifies an environment.

**The real run path, on this machine.** With no account variables set, the script reads the real
`web/.env.local`, the new guard accepts it, and the script then refuses for the next reason — which is
how we know the guard passed rather than that it never ran. No request was sent:

```
$ node scripts/staging/build-it-16-checks.mjs
REFUSING TO RUN: these environment variables are not set: ALICE_EMAIL, ALICE_PASSWORD, BOB_EMAIL, BOB_PASSWORD, ALICE_TEAM_ID.
Load them for this one run from ~/.config/team-tasks/staging.env, which keeps a
FILENAME in shell history rather than a password: see the bottom of this file,
and docs/environments.md -> "Where the test accounts' passwords live".
The team id is not a secret and is passed on the command line.
No value is printed by this script.
exit=1
```

**Unverified — the guard's refusal path was not exercised on a real `web/.env.local`.** Doing that
would mean writing a non-staging URL into the owner's own ignored env file, which was not done. What
has been exercised is the function that decides it, nine times, in §3 — and the three lines that turn
its verdict into a `die()` are not covered by any run.

### 8.2 An altered token, as well as the forged one

**What was wrong.** `forgeToken()` builds an `HS256` header with no `kid` and a random signature. The
review's point is that a platform can refuse that on the header alone, before it looks at any
signature — so a 401 for it does not show that a signature was checked, which is the question #110
asks.

**Unverified — the mechanism behind that point is not confirmed in this repository.** The review
attributes it to `verifyUserJwt` in `@supabase/server@1.9.0`. That package is not installed here:
`web/node_modules/@supabase` holds `auth-js`, `functions-js`, `postgrest-js`, `realtime-js`, `ssr`,
`storage-js`, `supabase-js` and `phoenix`, and a search of the whole repository for `verifyUserJwt`
returns no files. So that is the reviewer's reading of a package this project does not have. The change
below does not depend on it being right.

**What was added.** Check **1c**: take the access token Bob's sign-in has just returned, keep its
header and its signature exactly as they are, replace `sub` in the payload with a random uuid
belonging to nobody, and send that to all three functions with a `{}` body. Everything cheap to refuse
— shape, algorithm, key id, expiry, issuer — is unchanged and correct; the one thing wrong with it is
that the signature no longer matches the payload. It is judged by the same `judgeClosedDoor` as check
1, labelled `(altered token)`.

It is numbered 1c and sits after 1b so the section numbers already in this file keep meaning what they
did.

**The altered token is never printed, and that is now selftested.** It is Bob's live token with one
field moved, so undoing the change gives a working credential. Three things hold it:

- `scrub()` is a registry now, not three named constants, because three of the tokens do not exist
  when it is defined. Alice's and Bob's real access tokens are registered inside `signIn` the moment
  they arrive; the altered one is registered the moment it is built, before any request carrying it is
  sent.
- `scrubWith` was split out as a pure function and moved **above** `--selftest`, so the substitution
  that protects the token is exercised by a run that sends nothing. The five `scrub:` cases in §3 are
  that. The sharpest is `THE ALTERED TOKEN WAS NEVER REGISTERED`, which is the exact mistake that
  would publish it, and it comes out FAIL.
- `judgeScrubbed` says UNVERIFIED when the token is not in the text to start with, so a case cannot
  pass by having nothing to find.

**The alteration is judged before anything is sent, and the judgement can fail.** `judgeAlteration`
compares the two tokens' parts and must say PASS — the real header, the real signature, a changed
payload, a changed `sub` — or the three calls do not happen. Without it, an alteration that silently
did nothing would send Bob's live token, the platform would accept it, the handler would answer the
`{}` body with its own 400, and `judgeClosedDoor` would report that as a door standing open: a FAIL
that looks like a finding and is an input mistake. §4b breaks that judgement and shows exactly that
case going WRONG. It reports no token text: it is handed facts, not strings.

**What 1c's PASS will and will not mean.** `judgeAlteration`'s detail line reports the real header's
`alg` and whether it carries a `kid`. If the real header turns out to have no `kid`, then a platform
that refuses on a missing `kid` could be refusing the altered token for that reason too, and the 401
would again not isolate the signature. The line is printed so the owner can read which of the two
questions the run actually answered rather than assuming. **That is not something this change can
settle without running it.** It has now been run: §6a printed `alg` `ES256` **with** a `kid`, so that
particular doubt does not apply to that run — and §6a also says what the 401 still does not show.

### 8.3 What the review asked for that is not in this branch

The review suggested the same URL guard "is probably in `build-it-14-checks.mjs`,
`build-it-15-checks.mjs` and `bob-invites-to-alices-team.mjs` (not checked by me); that can be its own
issue." It is in all three, and they are **not changed here** — filed as **issue #116** instead. The
lines, on `origin/main` so the issue's "where it is" does not depend on this branch:

```
$ git grep -n "includes(STAGING_REF)" origin/main -- scripts/staging
origin/main:scripts/staging/bob-invites-to-alices-team.mjs:181:if (!supabaseUrl.includes(STAGING_REF)) {
origin/main:scripts/staging/build-it-14-checks.mjs:195:if (!supabaseUrl.includes(STAGING_REF)) {
origin/main:scripts/staging/build-it-15-checks.mjs:235:if (!supabaseUrl.includes(STAGING_REF)) {
exit=0
```

On this branch the same search finds only a comment in `build-it-16-checks.mjs:200`, which is where
that line explains why the test was replaced.

The second issue, **#117**, is one the review did not ask for: the new guard refuses the stand-in
server the coach used, so the end-to-end review that found this bug cannot be repeated without
editing the script. That is the cost of the fix, and §6 now carries it.

## Personal data in this file

**Nothing was captured from production** — rule 18's list is empty for production, and an empty list
is the complete answer there.

§6a does carry data captured from **staging**, which no other section of this file does. **Nothing in
it was replaced with a placeholder**, so instead of a before-and-after list, here is the full
inventory of what came back and what is in it, for the owner to check:

- **Eight response-body lines, four distinct texts, each pasted whole.** Three copies of
  `{"code":"UNAUTHORIZED_LEGACY_JWT","message":"Invalid JWT"}` and three of
  `{"code":"UNAUTHORIZED_ASYMMETRIC_JWT","message":"Invalid JWT"}` from the platform, plus
  invite-member's own `{"error":"Only the team's owner can invite people."}` and
  `{"error":"That team was not found."}`. Every one is a refusal. None holds an address, an id, a
  token, a hash, or any text a person typed.
- **Alice's staging team id** — the uuid in the `export` line and in the run's header, written in full
  there and not repeated here. It is a row id in the staging project belonging to a test account, and
  it is not a secret: the script passes it on the command line precisely because it is not, and says
  so in the refusal message quoted in §8.1.
- **A team id that does not exist**, which the script invented for the run, and **the invite address**,
  which it builds at run time from `example.com` and a timestamp. Both belong to nobody. The run shows
  the address was never written anywhere: 0 invitations.
- **No token, password, hash, publishable key, user id, invitation id or real email address appears in
  §6a**, because the run printed none. Where it reports who owns the team it prints the word `Alice`,
  not a uuid.

Alice and Bob are the staging test accounts (rule 6); no real person's data is in any of the above. The
other id in this file, `cd547da`, is a commit in this repository.

The script is written so a run of it stays that way: it never prints a password, an access token, a
refresh token, the publishable key, a real address, a user id or an invitation id, and every response
body it prints goes through a scrub that replaces any token the script is holding with a placeholder
first. §6a is one run where that held — no placeholder appears in its output, because no body it
printed contained a token to replace.

**The altered token §8.2 adds is the most dangerous value this script has ever held** — Bob's live
access token with one claim moved, so reversing one field gives a working credential. It is registered
with the scrub before any request carrying it is sent, and the scrub itself is now selftested (§3, the
five `scrub:` cases; §4b, the run where it is broken). No part of it, and no part of Alice's or Bob's
real tokens, appears in this file or in any line the script prints. The only token properties that do
get printed are the real header's `alg` and whether it carries a `kid`, which are not secrets and are
printed because they are what says what a 401 proves.

The JWT-shaped strings in the selftest are fabricated: a header and a payload of made-up claims, and
the literal text `not-a-signature` where a signature goes. Nothing signed them and they open nothing.
