# Evidence: privacy-policy

Result: **PASS — the page exists, is public, and is linked from every screen in the app.** What the
owner has seen in a browser is marked **owner-reported**; nobody writing this opened one.
Date: 2026-10-14
How checked: the repository, for what is built; the owner's report of 13-14 October 2026, for what a
browser showed. Checklist item asks for the public URL and where it is linked from — both below.
Checked by: Claude Code, from the repository and the owner's reports. **No dashboard, no connector and
no browser.**

---

## The URL

```
https://team-tasks-virid.vercel.app/privacy
```

The host is production's Site URL as recorded in `docs/environments.md` → "Where each environment
points". It is an identifier, not a credential.

## Where it is linked from

| | |
|---|---|
| **Every screen, including sign-up and sign-in** | `web/src/app/components/Footer.tsx` draws a `/privacy` link, and `Footer` is in the root layout — `web/src/app/layout.tsx:45` — so it is on every page this app serves. That is wider than the checklist asks for: the item wants the app and the sign-up page, and this is both plus everything else |
| **Reachable signed out** | `"/privacy"` is in `PUBLIC_PATHS` in `web/src/lib/supabase/proxy.ts`. Without that line a signed-out visitor is sent to `/login`, which would make a public policy unreachable by the public |

## What the page says, and where the words live

Every sentence is in `web/src/lib/legal.ts`; `web/src/app/privacy/page.tsx` renders that file and holds
no wording of its own. `scripts/screen-state-check.mjs` section 11 asserts that, and asserts five
things the page must never say — including that it was reviewed by a lawyer, which it was not.

It carries what [#204](https://github.com/build-once/team-tasks/issues/204) lists: what Suggest
subtasks sends to Anthropic and that nothing identifying the asker goes with it; Anthropic's published
retention; that the AI setting starts off and switching it off recalls nothing; that error reports go
to Sentry with the error, the page, the browser and the user ID; **where data is held**; that copies of
deleted data remain for up to about a fortnight; that after a recovery everybody signs in again; and
the one cookie answer a real reading found — Cloudflare's `cf.turnstile.u`, named as Cloudflare's and
undocumented by them (`evidence/cookies.md`).

`docs/claims.md` §7 holds a row per sentence with the file and line that makes it true.

## Owner-reported

- **2026-10-13** — the owner opened `/privacy` and `/terms` in a browser and both opened.
  `evidence/build-it-26-legal-pages.md` is the record.
- **2026-10-14** — PR #310 merged, so the page is on production.

## Not verified

- **Nobody has opened the production URL above.** Rule 10 forbids this assistant a browser, and the
  owner's look was before the merge. One visit settles it.
- **Not seen on a phone**, which `docs/plan.md` says is the device this app is for.
- **The company number and registered office are deliberately absent** — answer 1 of 2026-10-13 was
  "not now", and `scripts/screen-state-check.mjs` section 11 refuses the placeholder so a blank cannot
  reach the page. It stays an open item for the owner, not a decision against it.
