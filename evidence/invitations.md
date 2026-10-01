# Evidence: invitations — inviting, accepting, and the refusals

Result: PASS — an invitation can be sent and accepted, and all four refusals were seen to fire
Date: 2026-10-01
How checked: by hand on the `feat/invitations` preview deployment, pointing at the staging Supabase
project, plus one scripted check run from a terminal
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
| `create_invitations` migration | **Applied** | Not applied — happens on merge, via `.github/workflows/migrate-production.yml` |
| `invite-member` | **Deployed** | Not deployed |
| `accept-invite` | **Deployed** | Not deployed |
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

- **Production: nothing.** No migration applied, neither function deployed, and no invitation ever
  sent from production. Everything above is staging.
- **No real email was ever delivered to a real inbox.** `EMAIL_TEST_INBOX` caught every message, by
  design. So "the email arrives and looks right to a stranger" is untested, and will stay untested
  until production sends one.
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

Carol is the first use of the third test account. Until `team_members` existed there was nothing for
her to test, which is noted in `evidence/create-team.md`.
