# Incident plan

One page, for a bad day. Build it 29, Lesson J24. Written 15 October 2026.

**Read this on a phone.** That is what it is for: the day something is wrong you will not
be at a desk, and a plan you cannot open is not a plan. It is in the repository so it is
on GitHub, so it is in a browser.

---

## Who does what

**One person.** The owner is the operator, the support desk and the person on call. There
is nobody to escalate to and no rota — this app is for one volunteer group of about six,
and pretending otherwise would be the kind of borrowed corporate wording the rest of this
repository is against.

So the only question this page has to answer is **what the one person does, in what
order**, while they are worried.

| | |
|---|---|
| **Decide and act** | the owner |
| **Tell the volunteers** | the owner, in the group chat they already use |
| **Write it down afterwards** | the owner, as a GitHub issue |
| **The AI assistant** | has no production access (AGENTS.md rules 1 and 10) and cannot flip a switch, read a log or deploy. It can help write the migration afterwards |

---

## The first five minutes

In this order, and the order is the point: **stop the harm before you understand it.**

1. **Flip the switch** for whatever is doing the harm — the table below. It takes about
   twenty seconds and **needs no deploy**.
2. **Write down the time**, in UTC, and what you saw. A note on your phone is fine. You
   will not remember it accurately in an hour.
3. **Check it stopped.** Press the thing yourself and see the sentence.
4. **Tell the group**, in one line: what is off, and that you are looking at it.
5. **Then** start finding out why.

**If a key has leaked, this is not the page.** `.claude/skills/incident-first-steps` is,
and the first move there is to rotate, not to switch something off. `docs/secrets.md` says
how to rotate each one.

---

## The four kill switches

**What they are:** four rows in a table called `feature_switches`, in this project's own
database. Changing one stops a feature **on the next request**. No branch, no pull
request, no build, no waiting for Vercel.

### How to flip one

1. Supabase dashboard → the project (**production** or **staging** — check which)
2. **Table Editor** → schema `public` → table **`feature_switches`**
3. Find the row by its `feature` name
4. Change **`enabled`** from `true` to `false`
5. Save. The next request is refused.

To switch it back on, set `enabled` back to `true`. `changed_at` stamps itself; you never
type it.

> **DELETING THE ROW ALSO SWITCHES THE FEATURE OFF — it does not switch it back on.**
> `public.feature_on()` reads a missing row as **off**, on purpose, because a kill switch
> must fail in the direction that stops things. So **change `enabled`, never delete.** If a
> row is deleted by accident, insert it again with `enabled = true`; the four names are in
> the table below and nothing else is allowed.

### The four, and exactly what each one stops

| `feature` | Off means | Still works |
|---|---|---|
| **`ai_suggestions`** | **Suggest subtasks** refuses before anything is read. No task title leaves this project, and nothing is spent at Anthropic | every other thing a task can do |
| **`invitations`** | **both directions of one feature**: no invitation is created and no email sent, and an invitation already in somebody's inbox **cannot be accepted**. Their link stays valid and keeps its 7 days | existing members, existing teams |
| **`attachments`** | **no file can be attached and no new link can be made.** And see the warning below, which is bigger than it sounds | every task, and its text |
| **`payments`** | **no new checkout can be started**, and the pricing panel says so instead of offering. Stripe webhooks are **not** recorded — they are asked to retry | **everybody's existing plan.** A paid team keeps its 25 members, because the entitlement is already in the database |

### What a person sees

One sentence, per feature, and nothing about plumbing:

- Suggestions are switched off for now.
- Invitations are switched off for now.
- Attachments are switched off for now.
- Payments are switched off for now.

**Never a crash and never a blank screen**, which is the owner's instruction for this
build. On the invitation link the sentence also says the invitation is still valid, because
that is the half somebody would otherwise act on wrongly.

---

## Three things about the switches that will surprise you

Each of these was measured on a local PostgreSQL sandbox, not reasoned about —
`evidence/build-it-29-kill-switches.md` is the run.

**1. With `attachments` off, a file CANNOT BE DELETED either.** Not refused with an error:
a delete simply matches nothing, because the restrictive policy stops the person seeing the
row to delete. And because the database refuses to delete a task that still has files,
**a task with a file on it cannot be deleted while this switch is off.**

The person gets an honest sentence, not a crash — the app says its files are still there.
But if the reason you reached for this switch is **one unwanted file**, the switch is not
how you remove it: **delete it in the dashboard** (Storage → `attachments`), where you are
the owner and no policy applies to you.

**2. A link already handed out keeps working.** A signed link lives five minutes and the
check happens when it is **made**, not when it is used. Switching attachments off stops new
links; it cannot recall one, and nothing in this app can.

**3. `payments` off for days is a real problem; for hours it is free.** The webhook answers
**500** so Stripe retries, which is right — a 200 would tell Stripe the event was handled
and it would never come back, so somebody who paid would silently never get what they paid
for. **But Stripe's retries do not last for ever.** If payments are off longer than a day,
reconcile by hand in Stripe afterwards.

---

## What the switches cannot do

Stated here so nobody goes looking for a switch that does not exist.

- **They do not suspend a person.** That is a row in `account_status` — "Suspending an
  account" in `docs/plan.md`, and it is per person rather than per feature.
- **They do not stop sign-in, sign-up or password reset.** If those are the problem, the
  controls are Supabase's Auth rate limits (`docs/rate-limits.md`) and the CAPTCHA.
- **They do not stop somebody adding or ticking a task.** Feature 4 has no switch: it is
  the app, not a risk.
- **They do not cancel a Stripe subscription**, and nothing in this app can.
- **They are not reachable by the AI assistant or by any server function**, by design: no
  role holds a privilege on that table. Only the dashboard.
- **A deploy does not change them.** They live in the database, so they survive every
  merge — which is also why switching something off and forgetting is possible. The next
  section is about that.

---

## Switching back on

**The switches are the only thing in this app that can be left wrong silently.** Nothing
alarms on a feature being off — that is what "off" means — so:

1. When the incident is over, **set `enabled` back to `true`** and press the thing
   yourself.
2. **Check all four**, not only the one you flipped. One `select` answers it:
   `select feature, enabled, changed_at from feature_switches order by feature;`
3. `changed_at` is how you tell a switch you flipped this morning from one that has been
   off for a fortnight.

---

## The uptime check

**The address:** `<production>/health`. It answers **`ok`** with HTTP 200, or **`error`**
with HTTP 503, and nothing else — no version, no counts, no database message. It is public,
so everything it says is said to anybody.

**What it actually tests:** that the app can reach its database and get an answer. Not
Stripe, not Anthropic, not Resend, not Cloudflare — those are four companies' uptime, and
an alarm at 3am because Anthropic was busy is an alarm nobody can act on.

**What the owner still has to do**, which no code in this repository can:

1. Point a monitor at `<production>/health`, expecting **200** and the body `ok`.
2. Point a **second** monitor at an address that does not exist, so an alert is **seen to
   arrive** rather than assumed. Lesson J25's own instruction.
3. Use the service's "send test alert" and watch it reach the phone **with Do Not Disturb
   on**. An alert that is politely silenced is not an alert.
4. Write it up in `evidence/uptime-alert-phone.md`.

---

## Telling people

**One line in the group chat, as soon as the harm has stopped.** What is off, and that you
are looking at it. Not a cause — you will not know one yet, and a guess that turns out
wrong is worse than silence.

**If personal data may have left the project**, that is a different clock and a different
page: `.claude/skills/incident-first-steps` has the notification timing, and the contact
address people will write to is on the privacy page.

---

## Afterwards

**A GitHub issue, within a day, while you still remember.** Four things, which is what
AGENTS.md rule 16 asks of every issue:

- **what happened** — the times, in UTC
- **where** — the file, the setting, the table
- **why it matters**
- **how we will know it is fixed**

**Blameless.** One person wrote this app; a plan that blames somebody is a plan that makes
the next incident quieter rather than shorter.

**And ask the one question that is worth more than the fix:** *what would have told us
sooner?* Usually the answer is a check, and a check is a pull request.

---

## The things this page points at

| For | Read |
|---|---|
| A leaked key, in the first hour | `.claude/skills/incident-first-steps` |
| Rotating any secret | `docs/secrets.md` |
| What limits each thing a bot could abuse | `docs/rate-limits.md` |
| Restoring from a backup | `docs/restore-runbook.md` |
| What the switches' migration actually does | `supabase/migrations/20261015120000_feature_switches.sql` |
| The run that measured the three surprises above | `evidence/build-it-29-kill-switches.md` |

---

## Not verified

**Nothing on this page has been used in a real incident.** The switches work on a local
PostgreSQL sandbox (`evidence/build-it-29-kill-switches.md`) and the migration is
**applied nowhere** on the day this was written — not local, not staging, not production.
Until the owner applies it and flips one on staging, every sentence above about what a
person sees is a reading of the code rather than something observed.

**And no uptime monitor exists yet.** `/health` answers; nothing is watching it.
