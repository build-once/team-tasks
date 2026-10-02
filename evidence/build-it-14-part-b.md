# Evidence: build-it-14-part-b

Result: **PARTIAL.** Lint and build PASS, run by the assistant. **Every screen state is UNVERIFIED** — nobody has looked at the new screens in a browser yet.
Date: 2026-10-02
How checked: `npm run lint` and `npm run build` in `web/`, both exit 0, output below. One signed-out request to `/teams`. The signed-in screens were **not** opened: see "Why the screens are unverified".
Checked by: the assistant (Claude Code), for the two commands and the one request. Nobody, for the screens.

This is part B of Build it 14 (issue #80, folding in #76): the screens that read what part A's
migration added. Part A's evidence is `evidence/build-it-14-part-a.md`.

## 1. Lint

```
> web@0.1.0 lint
> eslint

lint exit code: 0
```

No output from `eslint` means nothing to report. Run from `web/`.

## 2. Build, including TypeScript

```
> web@0.1.0 build
> next build

▲ Next.js 16.3.6 (Turbopack)
- Environments: .env.local
✓ Running next.config.ts took 113ms

  Creating an optimized production build ...
✓ Compiled successfully in 825ms
  Running TypeScript ...
  Finished TypeScript in 2.2s ...
  Collecting page data using 12 workers ...
✓ Generating static pages using 12 workers (10/10) in 1038ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /auth/callback
├ ƒ /auth/signout
├ ƒ /invite/[token]
├ ƒ /login
├ ƒ /signup
├ ƒ /tasks
└ ƒ /teams

build exit code: 0
```

Two of the "Generating static pages" progress lines are left out above; they are the same line
counting up. Nothing else is trimmed, and no value in this block is a secret — `.env.local` is named
by Next.js itself and nothing from inside it is printed.

**What this proves and what it does not.** It compiles, and the types line up: `team_roster`,
`profiles` and `teams.owner_id` are read with the right shapes, and the new server action type-checks.
It says nothing at all about what the screens look like or whether the right rows come back.

`npm test` at the repository root also exits 0 — the guard self-test (513 rule examples, 32
fail-closed checks), the skills lint, the launch-check and workflow-lint self-tests, and the AI team
self-test (258 passed, 0 failed). None of those is about part B; they are in CI, so they are reported
here as "still green", not as evidence of anything this change does.

## 3. Signed out, `/teams`

```
status: 307
location: /login
```

Asked of the dev server on `localhost:3000`, which was already running against staging.

**This proves less than it looks.** The redirect comes from `src/proxy.ts`, which turns signed-out
visitors away *before* the page component runs — so the new page did not execute, and this is a check
of the proxy, not of part B. It is here so nobody mistakes it for one.

## 4. Why the screens are unverified

The assistant could not sign in as Alice, Bob or Carol. Their passwords live in
`~/.config/team-tasks/staging.env` on the owner's machine, and rule 7 means the assistant never asks
for one. The browser extension was not connected either, so no screenshot could be taken.

So **unverified — could not sign in; no test-account password is available to the assistant, and the
browser extension was not connected.** The screens below are described from the code, which is a
description of what it *should* do and is not evidence. The checks in §6 are what would settle it.

## 5. The screen states, read from the code

`web/src/app/teams/page.tsx`, top to bottom. Not observed — see §4.

| State | What the page does |
|---|---|
| **Your name, not set** | The box is empty, and its hint ends "You have not set one yet." |
| **Your name, set** | The box opens with the current nickname in it, ready to edit |
| **Name saved** | Green banner, "Your name is saved." |
| **Name blank or too long** | Red banner, "A name needs some text, and no more than 40 characters." The form is not sent |
| **Name would not save** | Red banner, "Your name did not save. Please try again." |
| **Name could not be read** | Red banner saying the box is empty whether or not a name is set, so an empty box is not mistaken for "no name" |
| **Session unreadable while saving** | Sent to `/login`, rather than told the save failed |
| **No teams at all** | One line, "No teams yet". Neither section heading appears |
| **Teams you own** | Each team: name, members list, invite box, waiting invitations. Unchanged from before except the members list |
| **Teams you own, none** | The heading, and "You do not own a team yet." |
| **Teams you belong to** | Each team: name and members list. **No** invite box, **no** waiting invitations |
| **Teams you belong to, none** | The heading, and "You are not a member of anybody else's team." |
| **A members list** | "2 people in this team:" then one line per person, `name — role`, owner first |
| **Somebody with no name** | That line reads `(no name yet) — member`. Never an email address: `team_roster` has no email column, and no policy in this database exposes one |
| **Members could not be read** | Red banner at the top, and each team says "This team's members could not be loaded." rather than drawing an empty list |
| **At the team limit** | "You own 3 teams, the most allowed." Counted from **owned** teams only (#76) |

## 6. The owner's checks — NOT RUN

On `localhost:3000` against staging, as the issue asks. Each person sets their own name through the
new field first.

1. **Alice** (owner): her team is under "Teams you own", its members list shows Alice as `owner` and
   Carol as `member`, and the invite box is there.
2. **Carol** (member): the same team and the same two names, under "Teams you belong to", with **no**
   invite box and no waiting invitations. "Teams you own" says she owns none, and there is **no**
   "most allowed" note.
3. **Bob** (outsider): no teams, and no names. He must not see Alice's team in either section.
4. **A name that is not set**: whoever has no profile row shows as `(no name yet)` to their team
   mates, never as an address.

Until those are done, write **"unverified — reason"** against them, not "passed".

## 7. Notes

- Staging's seed data at the time of writing: Alice's test team carries an email address as its name,
  from an earlier mis-typed field (`evidence/build-it-14-part-a.md` §5). Rename it before taking any
  screenshot, or the screenshot publishes an address.
- No migration is part of this change, and none is needed: every table, view and policy it reads was
  created by part A.

## Screenshot (optional)

None. See §4 for why.
