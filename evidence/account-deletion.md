# Evidence: account-deletion

Result: **PASS — a real account was created and deleted from inside the app, on staging, and what had
to survive survived.** The run is **owner-reported**; nobody writing this opened a browser, a dashboard
or a connector. One limit is named below: **no SQL output is pasted here**, so the row-level proof is
the app's own screens and the coach's read of staging rather than a query this file can show.
Date: 2026-10-14
How checked: the owner's Dave test against staging, twice — 13 October, which found three faults, and
14 October after they were fixed. Repository facts from the merged code.
Checked by: the owner, on staging. Written up by Claude Code from the repository and the owner's
reports.

---

## Where somebody deletes their account

**Inside the app, on `/settings`**, in two steps: a warning card naming what goes and what stays, then
a typed confirmation. The work is done by the `delete-account` Edge Function — the fifth server-side
door, which checks `account_status` like the other four, so **a suspended person is refused** and sent
to the public request page instead (question 11, decided 2026-10-12).

For somebody who cannot sign in there is `/delete-account`, a public page with **no form**: it names
the address to write to and says the request must come from the address on the account. Nothing is
collected in the app.

## The Dave test, 14 October 2026, on staging — owner-reported

The fixture is a fourth staging account, created because deleting Alice, Bob or Carol would destroy
the fixture every other staging script depends on. Dave had his own team, his own personal task with a
file on it, and a task he wrote in Alice's team "Inbox check".

| What was checked | Result |
|---|---|
| **The export, before deleting** | listed **only Dave's own file** — not the other member's |
| **His login** | gone |
| **The invitation addressed to him** | gone |
| **His own-list tasks** | gone |
| **His task in Alice's team** | **still there, shown as "Former member"** — decision 1 of 2026-10-12, so nobody loses a task somebody else wrote |
| **The other member's file on that task** | **intact** |
| **Alice, as the team's owner, deleting the Former-member task** | **worked** |

That last row is the one that failed on 13 October and again on 14 October before `64214c9`: the
database policy allowed it and the app's own guard refused it. Two places decided the same thing and
only one had been fixed. It is now one function, `mayDeleteTask`, asked by both the screen and the
action, with checks in `scripts/screen-state-check.mjs` that were each seen to fail first.

## What the deletion removes, and what it deliberately does not

Removed: the account, the profile, the person's own tasks and the files on them, the teams they own
(with those teams' memberships and invitations), their memberships elsewhere, invitations addressed to
their address, and their `usage_counts` rows.

Kept on purpose: **tasks they wrote in other people's teams**, with `owner_id` set to null and
"Former member" on the screen. `docs/deletion.md` is the design and `docs/plan.md` records why — the
`on delete set null` decision of 2 October, so that "Carol losing her own task because Alice closed
her account" cannot happen.

A **tombstone** of two values — a user id and a date, no address and nothing typed — is kept **30
days** and removed by the statement that writes one. Its only job is to stop a restore from a copy
taken before the deletion bringing a deleted person back.

## What the screen tells somebody, because "deleted" must not be a true-sounding lie

Three things the app cannot undo, and says so: **copies of their data remain for up to about a
fortnight** (the 14-day R2 lifecycle rule plus the day Cloudflare allows for removal); **what has
already gone to Anthropic cannot be recalled, or even found**, because nothing identifying the asker
was sent with it; and **Resend's sending log keeps which addresses were sent what for 30 days**. Their
Sentry error reports are deleted **on request, by the owner, and only before the account goes**, since
afterwards the user ID is the only thing left to search by.

## Not verified

- **No SQL output is in this file.** The checklist asks for queries showing the rows and files are
  gone; what exists is the owner's observation through the app and the coach's read of staging for the
  surviving row. A read-only count per table for a deleted id, run by the owner, would close that gap
  — and `docs/deletion.md` §13 is where the expected answers are written down.
- **Staging, not production.** Production has no accounts at all, because nobody has signed up, so
  nothing there has been deleted and nothing can be.
- **No second account has been deleted.** One run, one fixture.
- **No automated check runs this against a real database** —
  [#311](https://github.com/build-once/team-tasks/issues/311) is that gap, filed on 14 October: twelve
  staging scripts and not one of them deletes a task, so both delete policies and the storage half are
  exercised only by hand.
