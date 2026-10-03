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

Nothing else: no phone numbers, addresses, birthdays or photos. We ask people not to put
sensitive information in task text, and the app does not need it.

Supabase and Vercel also record IP addresses; the appendix lists everything.

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

---

# Appendix — every piece of personal data

The one-page plan ends above. This appendix is reference material; it is not part of the page.

Table names marked *(proposed)* do not exist yet — no database has been created. "Owner" means
anyone with access to the Supabase or Vercel dashboard, which today is one person. Supabase, Vercel
and Resend can technically reach the data they hold; that is true of any host.

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
| Sent-invitation logs | Proof an invitation actually went out | Resend — outside your app | Owner via Resend; Resend | 30 days on the free plan | Not user-deletable; owner clears | No |
| Sign-in audit records, including IP address | **Nothing** — Supabase Auth writes them anyway | Supabase `auth.audit_log_entries` | Owner via dashboard; Supabase | UNSURE — see notes below | Not user-deletable | **Yes** — IP address |
| Session and refresh tokens, last sign-in time | Keeping people signed in (feature 1) | Supabase `auth.sessions`, `auth.refresh_tokens`, `auth.users` | Nobody — they are secrets | Until sign-out or expiry | Sign out | **Yes** — credentials |
| Hosting access logs: IP address, browser and device, page visited | **Nothing** — Vercel writes them anyway; we add no logging of our own | Vercel — outside your database | Owner via Vercel; Vercel | UNSURE — short, depends on plan | Not user-deletable | **Yes** — IP address and device |
| Database and API logs, including caller IP | **Nothing** — Supabase writes them anyway; we add no logging of our own | Supabase logs | Owner via dashboard; Supabase | UNSURE — see notes below | Not user-deletable | **Yes** — IP address |
| Analytics and error reports | **Nothing — none is collected, and none is planned** | Nowhere | — | — | — | No |

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
  write, and task text and email addresses never go into a log line from server code.
- **Analytics: stays at none.** If numbers are ever wanted, count rows in the database rather than
  adding a tracker.

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

### Not affected by any of these decisions

The three things below are unchanged, because there was nothing to reduce:

- **Team name.** Nothing to remove — but ask for names that do not identify the members:
  "Tuesday crew", not a family name.
- **Team membership.** Nothing to remove. It *is* the rule that enforces feature 5.
- **Sign-in audit records and session tokens.** Cannot be switched off. Never copy them into your
  own tables, and never build a feature on them.

## Two gaps this table exposes

**There is no way for anyone to delete their account.** Features 1 to 5 do not include it, which is
why nine rows above say the owner must delete by hand. That is a report, not a suggestion: as
written, this app collects personal data and offers no way out. Decide whether that is acceptable
for six volunteers, or whether the plan changes.

**Four rows are things you never chose to collect.** The sign-in audit records, both log stores and
the session tokens are created by Supabase and Vercel whether you want them or not, and they
include IP addresses. They are not in your tables and you cannot turn most of them off. The
"Personal data it will hold" section now points here so the plan does not read as though they do not
exist.

## Unverified

- **UNSURE — how long the three log stores actually keep data** (sign-in audit records, Vercel
  access logs, Supabase database and API logs). Retention depends on the plan and changes over
  time. The only authoritative place is each dashboard: Supabase → Logs settings, Vercel → project
  observability. Do not publish a retention promise anywhere until you have read them yourself.
- **Unverified — nothing in this table has been built.** No database, no tables, no accounts. Every
  storage location is where the data *will* live, based on how Supabase Auth and Vercel work, not
  something observed in a running app.
