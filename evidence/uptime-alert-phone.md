# Evidence: uptime-alert-phone

Result: PASS — a Sentry uptime monitor watches production's health address every minute, and
Sentry's test notification reached the owner's iPhone **with Do Not Disturb on**. The monitor's own
history also caught a **real** outage: the 503 period while `/health` was broken.
(No angle brackets in that line on purpose: `scripts/launch-check.mjs`'s `PLACEHOLDER_RE` is
`/<[^>]*>|…/`, so the `<production>` this repository writes everywhere else to keep the address out
would be read as the template's unfilled `<...>` and this row would stay TODO. It was, until the
line was reworded.)
Date: 2026-10-15
How checked: the owner created the monitor in Sentry, read its history back, and sent a test
notification to their phone. The 503 period it recorded was found independently by the owner
opening `/health` in a browser, and is the subject of PR #324.
Checked by: the owner. **Nothing here was run or seen by the assistant**, which has opened no
dashboard; rule 10 forbids it. The one thing the assistant did was fetch the public `/health`
address with `curl`, which is what started the diagnosis.

---

## 1. The monitor

| | |
|---|---|
| Service | **Sentry** — uptime monitoring |
| Name | `Team Tasks production health` |
| Project / environment | `team-tasks` / `production` |
| What it fetches | `GET <production>/health` |
| How often | every **1 minute** |
| Up means | **2xx** |
| Opens an issue after | **3 consecutive failures** |
| Alert | `Team Tasks production down`, by email to the owner |

**The production address is written as `<production>` on purpose.** `docs/environments.md`:
the production address "is deliberately not written down in the repository", and it is held in
the `PRODUCTION_SITE_URL` environment variable instead. Nothing in this file names it, and no
project reference appears either.

**NO NEW OUTSIDE COMPANY**, which is the part that matters beyond the alarm working. `docs/plan.md`
left the choice of service open precisely because the other answer would have been a seventh
company seeing this app's address and availability: *"If the owner picks Sentry, this plan needs no
new company."* The owner picked Sentry, which has been in use since Build it 18. So the plan's open
decision is now taken and closes with no new section and no new row in the appendix.

**Three consecutive failures and not one**, which is worth recording as a choice: a single missed
minute on a free-plan monitor is noise, and an alarm that cries wolf is an alarm somebody silences.
Three minutes is the delay that buys.

## 2. The test notification reached the phone, with Do Not Disturb on

The owner used Sentry's own "send test notification" and it arrived on their **iPhone with Do Not
Disturb switched on**.

**That last clause is the whole of this launch row**, and it is why Lesson J25 asks for it in those
words. A monitor that files an issue nobody reads at 3am is not an alert; an alert that is politely
silenced by the phone is not one either. Everything else here is configuration — this is the part
that was observed.

## 3. AND IT CAUGHT A REAL FAILURE, WHICH NO TEST ALERT CAN PROVE

The monitor's history showed **genuine failures around 13:05–13:15 UTC on 15 October 2026**, then
green.

That window is not a drill. It is the period in which production's `/health` really was answering
**503 `error`** — because `20261015120000_feature_switches.sql` revoked `EXECUTE` on
`public.feature_on(text)` from `anon`, and `/health` is fetched with no session.
`evidence/build-it-29-kill-switches.md` section 15 has the cause and the measurement; PR #324 is
the one-line fix.

**So this row is stronger than the one the checklist asks for.** The checklist wants a test alert
seen on a phone. What exists is that **plus** a monitor that independently recorded an outage
somebody else found by hand, and then recorded its recovery. A monitor that has only ever been
green has not been shown to be able to go red.

**One honest limit on that:** the owner found the 503 by opening the page, and the monitor's history
was read **afterwards**. Nobody watched the alert email arrive for that outage, so what is
established is that the monitor **recorded** the failures, not that the alert reached anybody at the
time. The alert path is established by section 2 instead.

## 4. After the fix

- PR #324's preview deploy: `/health` → **ok**
- Production, in a **private window** so no session and no cache could flatter it: `/health` → **ok**
- `migrate-production` for #324: **green**

## 5. What this does NOT establish

- **No second monitor on an address that does not exist.** The incident plan asks for one, as the
  cheap way to see an alert arrive on purpose. It was not needed in the end, because a real outage
  did the same job — but it is still the thing to do before trusting this on a quiet week.
- **The alert has never been seen to arrive for a real failure**, only the test notification
  (section 3).
- **Nothing watches staging.** This is one monitor, on production.
- **Sentry's own uptime retention and free-plan limits are not read**, so nothing here says how long
  that history is kept. `docs/costs.md` already carries Sentry's free plan as unread in that respect.
- **Nothing was captured from production** beyond a status code and the word `error`; the list of
  redacted values is empty.
