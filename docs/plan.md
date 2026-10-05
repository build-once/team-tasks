# Plan — team-tasks

One page. Written 2026-09-27. Update it before adding anything below.

## Who it is for

The organiser of a volunteer group of about six. Every morning they scroll the
group chat to work out which jobs are done, which are left, and who said they would
do them. The other five use it too, but the organiser feels the pain most.

## The problem

Shared to-dos live in chat, so nobody knows what is done, what is left or who is doing
it. Some jobs get done twice, others forgotten until too late. The organiser spends
20 minutes a day chasing people.

## Smallest useful version

Five things, and nothing else:

1. Sign up and sign in.
2. Create a team: a name of 1 to 60 characters. One person may own at most 3 teams.
3. Invite people to a team by email: an invitation expires after 7 days, and a team
   may have at most 20 pending.
4. Add, tick, rename and delete tasks. A task is either **personal** or belongs to
   **one of your teams**. A personal task is yours alone. Every member of a team can
   see, tick and rename that team's tasks — but only the person who created a task can
   delete it, so nobody loses an entry because somebody else tidied up.
5. See only your own personal tasks, and the tasks of teams you belong to.

## Suspending an account

Added 2026-10-04. Not a sixth feature of the list above: nobody using the app gets a new
button, and the five things stay five. This is a **safety control for the owner**, and it is
in the plan because it holds personal data the appendix did not list.

What it is: the owner can stop one account from reading or changing anything — their own
tasks, their teams, everything — without deleting the account or its work. It exists for the
case the app otherwise has no answer to: somebody is putting other people's personal details
into task text, or an account has been taken over.

How it works, in one line: a row in a table means that person is suspended, and every
database rule refuses them while the row is there. Removing the row restores them exactly as
they were.

What it deliberately is **not**:

- **No screen, and no self-service.** The owner adds and removes the row by hand, in the
  Supabase dashboard. There is no admin page in this version, and nobody can suspend anybody
  else.
- **Not deletion.** Nothing is destroyed. The tasks, teams and memberships stay, and come
  back untouched when the row goes.
- **No notification.** Nobody is emailed. A suspended person sees an app with nothing in it;
  what they are told, and how, is a decision this version does not make.
- **No history.** One row per suspended person, deleted when they are restored. We do not
  keep a log of who was suspended and when, because nothing in the first version needs one.

**Decided 2026-10-04, on collecting less.** The reason is optional free text, and **nobody
can read it through the app** — not the suspended person, not their team mates, not even
through a signed-in request, because the table has no rule and no privileges that would let
one through. Only the owner, in the dashboard, and the server functions. Keep it short and
factual: it is a note to the owner, not a case file about a person.

## Error reports to an outside service

Added 2026-10-05. Not a sixth feature of the list above: nobody using the app gets a new button, and
the five things stay five. It is in the plan because it sends data about people **out of this
project**, to a company that was not part of it yesterday.

**The service.** Sentry, free plan. Organisation data region: **United States** — the owner's
choice, 5 October 2026. The owner has created the account and a Next.js project named `team-tasks`.
**Nothing is installed and nothing is sending yet:** no package, no key in any environment, no code.

**What may be sent, and nothing else:**

- the error's type, its message and its stack trace
- the path of the page it happened on
- browser and operating-system details
- the signed-in person's user ID — the Supabase `auth.users` id, which is not an email address

**What must never be sent.** An email address. A task's text. A team name. An invited person's
address. A password, a sign-in token, an invitation token, or any key. Three whole Sentry features
stay off for the same reason: **no session replay**, **no performance tracing**, and **no request or
response bodies** — each of them would carry exactly the things in that list.

**IP addresses.** Sentry has a setting that stops an event's IP address being stored, and a default
data-scrubbing step that drops values which look like secrets — the owner's description of the service
on 5 October 2026, not something read in Sentry's documentation here. The owner will switch the first
on and leave the second on. **Owner to set, not yet reported** — neither has been seen in a dashboard
by anybody writing this, and nothing in this repository can show it.

**Who can see the reports.** The owner, and Sentry.

**How long they are kept. Not confirmed**, and no number is written here. The only acceptable source
is Sentry's own published documentation for the free plan; it was not read when this section was
written, and a figure from memory is a guess wearing a uniform. Read it, cite the page here, and if no
such page can be found, write that instead of an estimate.

**Can a person have their reports deleted.** By the owner, yes: every event carries the user ID, so
the owner can search Sentry for one person's events and delete them. **Not yet tried** — no event has
ever been sent, so this is how Sentry is understood to work, not something observed.

**No new secret, on purpose.** The setup wizard is not used, so **no source maps are uploaded and
there is no Sentry auth token** — the two things that would add a secret. The project key, the DSN,
identifies the project and travels in the browser: it is public, like the Supabase publishable key,
and it is not a secret.

## Invitation status

Added 2026-10-05. Part of feature 3 rather than a new feature: an invitation records what happened to
its email, so the person who sent it can tell whether it actually went.

- **queued** when the row is created, then **sent** or **failed**.
- On a failure, a **short reason code** and nothing more — never the email service's full reply,
  which can quote the address, the subject and the message.
- **Who can see it:** the team's owner, on My teams. Nobody else — not the team's other members, and
  not the invited person.
- **Kept and deleted with the invitation itself.** It has no life of its own, and no history is kept
  of earlier attempts.

## Deliberately not in the first version

Comments. Reminder emails. File attachments. An AI helper. Payments. A phone app.

Some of these come later, on purpose. When one does, this plan gets updated first.

## Personal data it will hold

- Email address
- Display name
- Team names
- Task text
- Who created each task
- Dates
- Whether an account is suspended, when it happened, and the owner's reason for it
- Whether an invitation was queued, sent or failed, and a short code if it failed
- Error reports when the app breaks: what went wrong, which page, which browser, and the user ID of
  whoever hit it — sent to Sentry, outside this project

Nothing else: no phone numbers, addresses, birthdays or photos. We ask people not to put
sensitive information in task text, and the app does not need it.

Supabase and Vercel also record IP addresses, and Sentry would record one with every error report
unless the owner switches that off, which is what "Error reports to an outside service" above says
they will do. The appendix lists everything.

Point 5 protects all of this: a person sees their own personal tasks and their own
teams' tasks, and nothing more. That must be true in the database, not just the screens.

## Web or mobile

A web app that works well in a phone's browser. The organiser checks it on their phone
each morning, sometimes on a laptop. No app store, no native app.

## Budget

£0 a month while building and testing, on free plans. Before real users arrive, production
moves to a Supabase Pro organisation at about $25 a month; staging stays in a separate free
organisation at $0. Ceiling about $30 a month including a domain name. If a choice would push
past that, stop and decide.

Sentry, added 2026-10-05, is on its free plan and adds £0 today. What volume of error reports would
make it stop or start charging is **not confirmed** — see `docs/costs.md`, which says the same thing
and names the page to read.

---

# Appendix — every piece of personal data

The one-page plan ends above. This appendix is reference material; it is not part of the page.

Table names marked *(proposed)* do not exist yet — no database has been created. "Owner" means
anyone with access to the Supabase or Vercel dashboard, which today is one person. Supabase, Vercel,
Resend and now Sentry can technically reach the data they hold; that is true of any host.

**What "Sensitive? Yes" means here.** None of this is special-category data — no health, beliefs,
ethnicity or anything of that kind. "Yes" means handle it carefully: a credential, an IP address, or
free text that could contain absolutely anything.

| Data | Why the first version needs it | Where it is stored | Who can see it | How long we keep it | How a user deletes it | Sensitive? |
|---|---|---|---|---|---|---|
| Email address | Sign-in identity, and invitations (features 1, 3) | Supabase `auth.users` | The person; owner — **never shown to team members** | Until the account is deleted | **No way in the app** — owner deletes by hand | No |
| Password, hashed | Email-and-password sign-in (feature 1) | Supabase `auth.users` | Nobody — one-way hash, unreadable | Until the account is deleted | Reset replaces it; goes with the account | **Yes** — a credential |
| Display name — a nickname | So the organiser sees "Carol", not an address; never a real or full name | `profiles` *(proposed)* | Their team members; owner | Until the account is deleted | No way in the app yet | No |
| Team name | Feature 2 | `teams` *(proposed)* | Members of that team; owner | Until the team is deleted | Only by deleting the team — not built yet | No |
| Team membership — who is in which team | Feature 5; the RLS rule decides by this | `team_members` *(proposed)* | Members of that team; owner | Until removed from the team | Leave the team — not built yet | No, but it shows who belongs to which group |
| Task text — length-limited | Feature 4; the input box carries the "no personal details" request | `tasks` *(proposed)* | Its creator; the members of its team if it has one — a personal task is seen by its creator alone; owner | Until the task is deleted — no automatic clear-out in the first version | Delete the task, on the My tasks page — **built**. Only its creator can delete it: a team mate can rename it, not remove it | **Yes** — free text; people type anything |
| Who created and who ticked off each task | Feature 4; answers "who said they would do it" | `tasks` *(proposed)* | Its creator; the members of its team if it has one; owner | With the task | With the task — deleting the task removes it, **built** | No |
| Which team a task belongs to, or none | Feature 5; this is what decides who may see a task | `tasks.team_id` *(proposed)* | Its creator; the members of that team; owner | With the task. Deleting the team clears it — the task returns to its creator as personal, rather than being deleted with somebody else's team | With the task, or by its creator moving it back to personal — **built**: "Move to…" on the My tasks page, drawn only on a task you created, offering Personal or a team you belong to. A task left in a team its creator has since left can be seen and deleted, but not ticked or renamed until its creator moves it back — the screen says so, and offers the move | No, but it links a person's task to a group |
| Dates on tasks and teams — exact timestamps | Feature 4; ordering and "what is left" | `tasks`, `teams` *(proposed)* | Members of that team; owner | With the row | With the row | No, but it records when a person was active |
| An invited person's email, before they accept | Feature 3. Stored lowercase, so the same address cannot be invited twice under different capitalisation | `invitations` — **built** | The inviter; owner | Until accepted, or 7 days — then it expires. At most 20 pending per team | **They cannot** — not a user yet; owner deletes | No, but it is data about someone who never signed up |
| An invitation's token, hashed | Feature 3 — proves the person opening the link is the one who was invited | `invitations.token_hash` — **built**. A SHA-256 hash; the token itself is **never stored**, only emailed | Nobody — a hash cannot be read back into a token | With the invitation | With the invitation | **Yes** — until it expires or is used, the token in the email *is* a credential |
| An invitation's status, and a short reason code if sending failed | "Invitation status" above — so the person who sent an invitation can tell whether the email went | `invitations.status` *(proposed)*, with the code alongside it | The team's **owner**, on My teams — nobody else, which is the same owner-only read the address itself gets | With the invitation: until accepted, or 7 days | **They cannot** — it goes when the invitation goes | No, but a failure code is a fact about an address somebody typed |
| Whether an account is suspended, and when | "Suspending an account" above — a row here *is* how the database knows to refuse somebody | `account_status` — **built**: the table, `is_active()` and the five rules that refuse a suspended person. The part that stops the three server functions acting for them is **not built yet** (#133) | **Nobody through the app**, suspended or not: the table has no rule and no table privileges for signed-in or signed-out callers. Owner via the dashboard; the three server functions, which hold the secret key | Until the owner removes the row, or the account is deleted — the row goes with it | **They cannot.** The owner removes the row by hand, which is also what un-suspends them | No, but it records a judgement the owner has made about a person |
| The owner's reason for a suspension — optional free text | So the owner still knows why weeks later, when deciding whether to restore the account | `account_status.reason` — **built**. Optional free text, written by hand in the dashboard | As the row above: nobody through the app. Owner via the dashboard; the server functions | With the row | **They cannot** — it goes when the owner removes the row | **Yes** — free text, and it is text *about a person*, so it can name a third party who never agreed to anything |
| Sent-invitation logs | Proof an invitation actually went out | Resend — outside your app | Owner via Resend; Resend | 30 days on the free plan | Not user-deletable; owner clears | No |
| Sign-in audit records, including IP address | **Nothing** — Supabase Auth writes them anyway | Supabase `auth.audit_log_entries` | Owner via dashboard; Supabase | UNSURE — see notes below | Not user-deletable | **Yes** — IP address |
| Session and refresh tokens, last sign-in time | Keeping people signed in (feature 1) | Supabase `auth.sessions`, `auth.refresh_tokens`, `auth.users` | Nobody — they are secrets | Until sign-out or expiry | Sign out | **Yes** — credentials |
| Hosting access logs: IP address, browser and device, page visited | **Nothing** — Vercel writes them anyway; we add no logging of our own | Vercel — outside your database | Owner via Vercel; Vercel | UNSURE — short, depends on plan | Not user-deletable | **Yes** — IP address and device |
| Database and API logs, including caller IP | **Nothing** — Supabase writes them anyway; we add no logging of our own | Supabase logs | Owner via dashboard; Supabase | UNSURE — see notes below | Not user-deletable | **Yes** — IP address |
| Analytics | **Nothing — none is collected, and none is planned** | Nowhere | — | — | — | No |
| An error report: the error's type, message and stack trace; the page path; browser and operating system | "Error reports to an outside service" above — so a broken app is noticed by the owner rather than by a volunteer | Sentry — outside your app and outside your database. **Nothing is installed, so nothing has been sent yet** | Owner via Sentry; Sentry | **Not confirmed** — Sentry publishes a free-plan retention period; that page has not been read, so no number is written here | **No way in the app.** The owner can search Sentry for a person's events and delete them — **not yet tried** | **Yes** — a message or a stack trace can quote whatever the code was holding, which is why task text, addresses and tokens must never reach one |
| The signed-in person's user ID, attached to an error report | Tells the owner whether one person or everyone is hitting an error, without an address | Sentry — as the row above | Owner via Sentry; Sentry | **Not confirmed** — as the row above | **No way in the app** — it is what the owner searches by to delete the events; **not yet tried** | No on its own — it is not an address — but it links a person to everything else in the report |
| The caller's IP address on an error report | **Nothing** — Sentry stores one by default, and we do not want it | Sentry, unless switched off | Owner via Sentry; Sentry | **Owner to set, not yet reported**: the owner will switch on Sentry's setting that stops an IP being stored, and its default data scrubbing. Neither has been seen in the dashboard | Not user-deletable | **Yes** — IP address |

## Collecting less — decided

Decided 2026-09-27. Six reductions accepted, three declined. The reasons for declining are kept
here on purpose, so the same question does not get re-argued from scratch later.

### Accepted — these are now how the app behaves

- **Email address: never shown to team members.** The display name is enough. An address stays
  between the person, the sign-in system and the owner.
- **Display name: a nickname, never a real or full name.** Ask for a nickname, so the app never
  holds a legal name in the first place.
- **Task text: a length limit, and the request shown in the input box itself.** "No personal
  details" belongs where people are typing, not only in this plan — nobody using the app will ever
  read this document.
- **An invited person's email: invitations expire after 7 days.** An address belonging to someone who
  never joined stops being usable quickly. A team may also have **at most 20 pending invitations**,
  which caps how many addresses of non-users one team can accumulate, and stops the invite form being
  used to send mail in bulk.
- **The email service key lives only in each Supabase project's function settings.** Staging and
  production each hold their own Resend key, in that project's Edge Functions secrets and nowhere
  else — not in this repository, not in Vercel, not in a `.env` file on anybody's laptop. Only server
  code ever holds it, because anyone holding it could send email as this app.
- **Logs: we add none of our own.** No request logging on top of what Vercel and Supabase already
  write, and task text and email addresses never go into a log line from server code. *(Still true of
  logs on 2026-10-05. Error reports are a separate thing and are now planned — see "Error reports to
  an outside service" above, and the decision below.)*
- **Analytics: stays at none.** If numbers are ever wanted, count rows in the database rather than
  adding a tracker. *(Unchanged on 2026-10-05: an error report is not analytics, and no tracker is
  being added.)*

### Declined, and why

- **Password: keep email-and-password sign-in for the first version.** A sign-in link or one-time
  code would mean storing no credential at all, which is the bigger privacy win — but it changes how
  feature 1 works, and email and password is the known quantity for now. A sign-in link can come
  later. The hashed password row stays in the table above, and stays marked sensitive.
- **Who ticked off a task: keep it.** Storing less here was suggested on privacy grounds, but "who
  is doing it" is the problem this app exists to solve. Removing it would remove the point.
- **Deleting completed tasks, and rounding dates to the day: not in the first version.** Both are
  worth doing and neither is needed to ship. **Revisit before launch**, alongside the checklist in
  `docs/launch-check.md`. Until then, completed tasks are kept until someone deletes them, and
  timestamps are exact.

### Added 2026-10-05 — collecting less from an error report

Kept apart from the 2026-09-27 list above, because these decisions are about a service that did not
exist in this plan then. Each one is a thing Sentry can send and will not:

- **No email address in a report, ever — the user ID instead.** It answers the only question the
  owner has ("is this one person or everyone?") and it is not an address.
- **No session replay, no performance tracing, no request or response bodies.** All three carry task
  text, addresses and tokens by design, so none of them is switched on.
- **The IP address is switched off at Sentry**, along with its default data scrubbing left on. **Owner
  to set, not yet reported.**
- **No source maps and no Sentry auth token.** The setup wizard is skipped, so this adds no secret to
  the project; the DSN is public, like the Supabase publishable key.
- **The reason an invitation failed is a short code, not the email service's reply.** The reply can
  quote the address and the message; a code cannot.

### Not affected by any of these decisions

The three things below are unchanged, because there was nothing to reduce:

- **Team name.** Nothing to remove — but ask for names that do not identify the members:
  "Tuesday crew", not a family name.
- **Team membership.** Nothing to remove. It *is* the rule that enforces feature 5.
- **Sign-in audit records and session tokens.** Cannot be switched off. Never copy them into your
  own tables, and never build a feature on them.

## Two gaps this table exposes

**There is no way for anyone to delete their account.** Features 1 to 5 do not include it, which is
why **fifteen** rows above say the owner must delete by hand, or that nobody can: nine of them from
the first version, the two suspension rows added on 2026-10-04, and four added on 2026-10-05 — an
invitation's status and the three error-report rows. That is a report, not a suggestion: as written,
this app collects personal data and offers no way out. Decide whether that is acceptable for six
volunteers, or whether the plan changes.

Suspension makes that gap sharper rather than softer, and this is the place to say so: a suspended
person can no longer reach anything in the app, so they cannot delete their own tasks either, and
there was never a way to delete the account. Everything about their data is in the owner's hands
while the row is there.

Error reports widen it by one service: a person cannot see their own reports, cannot ask the app to
delete them, and the reports sit in a company's system outside this project. The owner can delete them
by searching for a user ID — **not yet tried** — and nothing but the owner's hand will do it.

**Four rows are things you never chose to collect.** The sign-in audit records, both log stores and
the session tokens are created by Supabase and Vercel whether you want them or not, and they
include IP addresses. They are not in your tables and you cannot turn most of them off. The
"Personal data it will hold" section now points here so the plan does not read as though they do not
exist.

Still four, after 2026-10-05. The IP address on an error report looks like a fifth, but it is not the
same kind of thing: that one arrives because we chose to add Sentry, and Sentry has a setting that
stops it. The four above cannot be switched off at all.

## Unverified

- **UNSURE — how long the three log stores actually keep data** (sign-in audit records, Vercel
  access logs, Supabase database and API logs). Retention depends on the plan and changes over
  time. The only authoritative place is each dashboard: Supabase → Logs settings, Vercel → project
  observability. Do not publish a retention promise anywhere until you have read them yourself.
- **Unverified — nothing in this table has been built.** No database, no tables, no accounts. Every
  storage location is where the data *will* live, based on how Supabase Auth and Vercel work, not
  something observed in a running app.
- **Not confirmed — how long Sentry keeps an error report on the free plan.** No Sentry page was read
  when these rows were written on 2026-10-05, so they say "not confirmed" rather than a number. Read
  Sentry's own retention documentation, cite the page, and replace the words with the figure — not from
  memory.
- **Owner to set, not yet reported — the two Sentry privacy settings.** Storing IP addresses off, and
  default data scrubbing on. Only the Sentry dashboard shows what this account is actually set to, and
  nothing in this repository can check it.
- **Not yet tried — deleting one person's error reports.** No event has ever been sent, so searching
  Sentry by user ID and deleting the matches is how Sentry is understood to work, not something done.
- **Unverified — the whole Sentry entry describes an intention.** The account and the `team-tasks`
  project exist, by the owner's word on 2026-10-05; no package is installed, no DSN is set in any
  environment, and no error report has left this app.
