# Evidence: invitations — inviting, accepting, and the refusals

Result: **staging PASS, production MIXED.** On staging an invitation can be sent and accepted and all
four refusals were seen to fire. On production the feature works end to end, but the invitation email
arrived in the recipient's **junk** folder — see the Production section, and issue #48
Date: 2026-10-01
How checked: by hand on the `feat/invitations` preview deployment pointing at the staging Supabase
project, plus one scripted check from a terminal; then by hand on the production site after the merge
Checked by: **the owner**

## Who observed what

**Every result in this file was observed by the owner. The assistant observed none of it.** It has no
production access and did not do any of this: it did not apply the migration, did not deploy either
function, did not set any email setting, did not open the preview, did not read the Table Editor, and
did not run the script. This file was written from the owner's reports.

What the assistant checked itself, and can stand behind: `npm run lint` and `npm run build` in `web/`
both exit 0; the repository test suite passes; `node --check` parses the staging script; the UUID
pattern added in fix 1 was tested against nine inputs including the exact malformed one below.

The split is recorded rather than blurred because a file that says PASS without saying whose eyes saw
it invites the next reader to assume it was automated. None of this is automated. Nothing in CI would
notice if any of it regressed.

## What is deployed where

| | Staging | Production |
|---|---|---|
| `create_invitations` migration | **Applied** | **Applied** on the merge of PR #44, by the `migrate` job |
| `invite-member` | **Deployed** | **Deployed** on the merge of PR #44, by the `deploy-functions` job |
| `accept-invite` | **Deployed** | **Deployed** on the merge of PR #44, by the `deploy-functions` job |
| `EMAIL_API_KEY`, `EMAIL_FROM`, `APP_URL` | Set | Set |
| `EMAIL_TEST_INBOX` | Set | Not set, correctly |
| `EMAIL_DELIVERY` | Not set, correctly | Set to `live` |

All set by the owner. The assistant deploys nothing and sets nothing (`AGENTS.md` rules 1 and 10).

**Both functions answer 401 when signed out.** That is `verify_jwt = true` in `supabase/config.toml`
taking effect through the deploy — the platform refusing the request before the function's own code
runs. It is the same check that was proven for `create-team`, and it had to be re-proven here because
`functions new` scaffolds `verify_jwt = false` every time and both files had to be corrected by hand.

## The happy path

**Alice invited Carol.** The email was caught in the staging test inbox rather than reaching the
invited address, which is `EMAIL_TEST_INBOX` doing its job. The owner confirmed:

- it came **from the `invites@` address on `notify.raj-dhonota.com`** — the sending domain the Resend
  key is restricted to;
- the subject carried the **`[staging]`** prefix, which is how a redirected message is told apart from
  a real one;
- the link pointed at the **preview deployment**, built from `APP_URL` and not from any request header.

**Carol accepted by pressing the button.** Not on page load — which is the behaviour that matters, and
the reason the page does nothing until the button is pressed: mail clients and link scanners open URLs
in emails automatically, and accepting on load would spend the invitation before the invited person
ever read it.

## What the database held afterwards

From the staging Table Editor:

- **one** `team_members` row — one accepted invitation, one membership, no duplicate;
- the invitation's `accepted_at` **set**;
- `token_hash` **64 characters long**, which is the length of a hex-encoded SHA-256 digest;
- **no raw token stored anywhere.** This is the one worth dwelling on: until it expires or is used,
  the token in the email *is* a credential — whoever holds it can join the team. A leaked copy of the
  `invitations` table therefore lets nobody join anything, because what it holds cannot be turned back
  into a token.

## The deliberate refusals

Each of these is a guard that had never fired. A guard nobody has triggered is a guard nobody knows
works.

| What was tried | Result |
|---|---|
| Opening the **same link again** after Carol accepted | refused — already used |
| Inviting a **placeholder address** | caught in the test inbox, as redirected mail should be |
| **Bob** opening Carol's invitation | refused — a different email address |
| **Bob inviting into Alice's team**, via `scripts/staging/bob-invites-to-alices-team.mjs` | **HTTP 403, "Only the team's owner can invite people."** |

The 403 is the important one. It is the only check that stops any signed-in person adding strangers to
somebody else's team, and until this run nothing had exercised it: the earlier preview testing invited
Carol to Alice's *own* team, which is the allowed path.

### The first attempt at that check tested nothing

Worth recording rather than tidying away. The first run passed a **wrong team id**, and the answer was
**HTTP 500 with Postgres error 22P02** (`invalid_text_representation`) — `teams.id` is a `uuid` column,
and the value could not be cast to one.

That outcome says nothing about the owner rule. It also reads, at a glance, like a broken function
rather than a bad input. Two fixes came out of it:

- **`invite-member` now checks `team_id` is a UUID before any database call**, and answers
  **400 "That is not a valid team id."** A shape that easy to check should never reach the database to
  be rejected, and a 500 should not be the answer to a malformed request.
- **The script now refuses to run at all** unless `ALICE_TEAM_ID` looks like a UUID — before signing
  in, so no session is created and nothing is sent. A run that cannot test anything should not get as
  far as asking for a password.

`accept-invite` needed no equivalent check, and that was established rather than assumed: the only
value it takes from a request is the token, which is hashed before use — and hashing produces 64 hex
characters for any input at all. The two id-shaped values it queries on come from a row the database
returned. So no input can provoke a cast error.

## Signed-out visitors, and a limit on staging

**A signed-out visitor opening an invitation link sees the sign-in / sign-up message**, which is the
whole reason `/invite` is a public path. The invited person usually has no account yet, so a page that
redirected them to sign in without explaining *which address to use* would be a dead end.

**Staging invitation links only work for the project owner.** Vercel's Deployment Protection guards
preview deployments, so opening a link in another browser reaches Vercel's own sign-in rather than the
app. Every check above was therefore done from the owner's own browser.

That is a real limit on what staging can prove, not a fault to fix: it means the invited-person
experience has only ever been seen by somebody who is also the project owner.

## What this does not cover

- **Production has its own section below**, added after the merge. Everything in the sections above is
  staging only.
- **No real email reached a real inbox from STAGING**, and none ever will: `EMAIL_TEST_INBOX` catches
  every message there, by design. Production sent one, and it did not land in the inbox — see below.
- **The 20-pending limit was not reached.** `invite-member` refuses at 20; nothing has gone near it.
- **Expiry was not waited out.** The 7-day rule and the "expired" refusal are both unexercised — the
  expiry is a stored timestamp, so testing it properly means waiting or editing a row.
- **The re-invite-after-expiry fix is untested**, for the same reason. It is the one that deletes an
  address's dead invitations before inserting, and nothing has expired yet to delete.
- **The two `insert` error branches in `accept-invite` have never run**, nor has the race between two
  simultaneous accepts. The atomic claim rests on `where accepted_at is null` and a one-row check, not
  on an observed double-click.
- **`accept-invite` can still spend an invitation without adding the member** if the `team_members`
  insert fails — the two writes are not in one transaction. Issue #46.
- **Staging's `APP_URL` points at a preview that will stop existing on merge**, after which staging
  invitation links go nowhere until the owner sets a new value. See `docs/environments.md` and
  issue #47.

## Personal data in this file

**No email addresses, no user ids, no team ids, no invitation ids, no tokens, no hashes, no URLs
containing any of those** — `AGENTS.md` rule 18.

Names only: **Alice**, **Bob** and **Carol**, the test-account names in `docs/environments.md`. The
sending domain `notify.raj-dhonota.com` and the `invites@` mailbox are recorded because they are the
app's own configured sender, already named in `docs/secrets.md`, and identify no person. The invited
placeholder address is described rather than written out, and the team is not named.

The same applies to the Production section, and a little more carefully, because the addresses there
are the owner's real ones. **Neither is written down**: the invited address is described only as "a
second address of their own", the receiving mail provider is not named, and the production web address
is not recorded. The **Supabase project reference is not in this file either** — not staging's, not
production's.

One id *is* recorded: the GitHub Actions run number `36841140349`. That is a public build number, it
identifies nobody, and it is what makes the claim about the merge checkable rather than a story. If you
would rather it went too, say so and it goes.

Carol is the first use of the third test account. Until `team_members` existed there was nothing for
her to test, which is noted in `evidence/create-team.md`.

---

# Production

Result: **MIXED** — the feature works end to end, but the invitation email arrived in the recipient's
**junk** folder, which for an invitation is close to not arriving at all
Date: 2026-10-01
**All of this is reported by the owner. The assistant observed none of it** — no production access, did
not merge, did not call either function, did not open the production site, and did not see the email
(`AGENTS.md` rules 1 and 10). Recorded here because otherwise it would exist only in a chat window
(rule 13).

## How it reached production

PR #44 merged, and `migrate-production` run **36841140349** succeeded with **both jobs green**: the
`migrate` job applied the `create_invitations` migration, and `deploy-functions` deployed both
functions. One merge, both halves, no hand-deploys.

## Signed out, both functions refuse

The owner called **both** `invite-member` and `accept-invite` on production with no `Authorization`
header. Both answered:

```
HTTP 401
UNAUTHORIZED_NO_AUTH_HEADER
```

That is `verify_jwt = true` surviving the pipeline deploy, for both new functions. Worth stating why
it needed checking again rather than being assumed from `create-team`: `supabase functions new`
scaffolds `verify_jwt = false` every single time, and both of these files had that corrected by hand.
A 401 naming the missing header is the platform refusing the request before the function's own code
runs — which is the only way to tell the corrected setting actually shipped.

## The feature works end to end

Signed in as themselves on the production site, the owner invited **a second address of their own** to
their own test team — deliberately, so no second person's data entered production.

- **It appeared in the pending list.** That also establishes the `invitations` table exists on
  production with its select policy working: the row had to be read back through it to be listed.
- **The email arrived at the real recipient**, from the `notify.raj-dhonota.com` sender.
- **No `[staging]` marker**, and the **link pointed at the production site** — so `EMAIL_TEST_INBOX`
  is correctly unset in production, `EMAIL_DELIVERY` is `live`, and `APP_URL` holds the production
  address. Three settings confirmed by one email.
- **Opening the link while signed out showed the sign-in / sign-up message**, which is why `/invite` is
  a public path.

**The invitation was deliberately not accepted**, to avoid creating a second production account. It
expires in 7 days and will lapse on its own.

## The finding: it went to junk

**The email arrived in the recipient's junk folder.**

For a feature whose whole purpose is to get a link in front of somebody, this is close to failure. An
invitation in a junk folder is one the volunteer does not see, and the organiser has no way to know —
`invite-member` is told the send succeeded, because as far as Resend is concerned it did.

**Why it was filtered is not known, and is not guessed at here.** Several things could contribute —
a sending domain with no history, DNS authentication records that are absent or not aligned, a
plain-text message consisting largely of a link, or the recipient's own provider being strict with a
first-time sender. Which of those applies is an open question, filed as **issue #48** with the checks
that would settle it — starting with reading the authentication headers on the message itself, before
changing anything. Nothing in this file should be read as having diagnosed it.

What is established: **one message, one recipient, one mail provider, one moment.** A single
observation cannot distinguish "this domain is filtered" from "this provider was cautious about a
first message", and the difference matters for what the fix is.

## What production still does not cover

- **Accepting was not done on production.** The button press, the atomic claim, the `team_members`
  write — all of that is proven on staging only. The deliberate choice not to accept means the
  production path from link to membership has never run.
- **Nobody but the owner has used it.** Both the inviter and the invited address belong to them, so
  the experience of being invited by somebody else is untested in production.
- **No second person's data is in production**, which is the point, and also the limit.
- **The 20-pending limit, expiry, and the re-invite-after-expiry fix** are all unexercised on
  production, as they are on staging.
- **Nothing watches production.** These are observations from one moment on 2026-10-01; no error
  monitoring exists yet (`docs/architecture.md` lists it as a later step), so a regression in any of
  this would be noticed by a volunteer before it was noticed by anybody else.
