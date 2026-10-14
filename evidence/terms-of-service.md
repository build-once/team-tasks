# Evidence: terms-of-service

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
https://team-tasks-virid.vercel.app/terms
```

The host is production's Site URL as recorded in `docs/environments.md` → "Where each environment
points". It is an identifier, not a credential.

## Where it is linked from

| | |
|---|---|
| **Every screen, including sign-up and sign-in** | `web/src/app/components/Footer.tsx` draws a `/terms` link, and `Footer` is in the root layout — `web/src/app/layout.tsx:45` — so it is on every page this app serves |
| **Reachable signed out** | `"/terms"` is in `PUBLIC_PATHS` in `web/src/lib/supabase/proxy.ts`, without which a signed-out visitor is sent to `/login` |

## What it says, and the two answers behind it

Every sentence is in `web/src/lib/legal.ts`; `web/src/app/terms/page.tsx` renders that file and holds
no wording of its own.

| | Decided 2026-10-13 |
|---|---|
| Governing law and where disputes are heard | **England and Wales**, both |
| Minimum age | **16, stated and NOT checked.** Nothing is asked, so nothing is held — no date of birth, no age field, no new row. The page says the app is not for under-16s and must not imply anybody's age was verified; `docs/claims.md` §7e records that a sentence reading as verification would be **NOT ENFORCED** |
| An "accepted version" record at sign-up | **No** — a deliberate departure from the book, recorded as one in `docs/plan.md`. It would be a new column holding a new fact about a person, for a group of about six the owner will tell in person. The cost is stated there: if somebody disputes which terms they were shown, there is nothing in the database to answer with |

## There was no legal review, and the page may not pretend there was

Answer 5 of 2026-10-13: **the owner reads both documents himself, and that is not a legal review.** So
nothing in either page may say or imply it was reviewed by a lawyer, "prepared by" anybody, or checked
for compliance with any law — no such sentence, and no badge or date-of-review line that would read as
one. `scripts/screen-state-check.mjs` section 11 is where that refusal is enforced rather than
remembered, and every statement about an outside company stays attributed to that company.

## Owner-reported

- **2026-10-13** — the owner opened `/privacy` and `/terms` in a browser and both opened.
  `evidence/build-it-26-legal-pages.md` is the record.
- **2026-10-14** — PR #310 merged, so the page is on production.

## Not verified

- **Nobody has opened the production URL above**, for the same reason as the privacy page.
- **Not seen on a phone.**
- **The company number and registered office are absent on purpose** (answer 1 of 2026-10-13, "not
  now"). An open item for the owner.
