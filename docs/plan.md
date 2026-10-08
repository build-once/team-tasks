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

**And the limit of the thing that enforces it, because it decides how the app's own code must be
written.** A pattern scrub cannot recognise free text that no known phrase introduces, so error
messages written by this app must never include task text, names or addresses.

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

## Suggest subtasks — an outside AI service

Added 2026-10-07. Unlike the three sections above, this one **is** a new thing people can press. It is
in the plan because it sends text somebody typed **out of this project**, to a company that was not
part of it yesterday. "An AI helper" sat on the not-in-the-first-version list below until today; the
line moved before any code was written, which is the order rule 9 asks for.

What it is: on a task the person can already see, a **Suggest subtasks** button. The app sends that
one task's title to Anthropic's Claude API and offers back up to five short suggestions. A suggestion
stays a suggestion: nothing is written to the database until the person presses add on one.

**The service.** Anthropic's Claude API, in a separate Console workspace named **Team Tasks**, with a
monthly spend limit of **5 US dollars** and notifications at **1** and **3** dollars — the owner's
report of what they set, 7 October 2026, not something seen in a dashboard by anybody writing this.
Two keys, one for staging and one for production, each held only in that Supabase project's function
secrets as **`AI_API_KEY`** and nowhere else. **Nothing is installed yet:** no package, no key in any
environment, no code.

**The model.** Claude **Haiku 4.5**, pinned by its dated API name rather than a moving alias, so the
model cannot change under the app without somebody editing a line. The exact dated name is **to be
confirmed by the owner** on Anthropic's models page before the code pull request; no name is written
here from memory.

**What is sent, and nothing else:** the **title of the one task the person asked about**, and **fixed
instructions written by this app**. That is the whole request.

**What must never be sent.** An email address. A display name. A user ID. A team name. Any other
task, including the rest of the list the person is looking at. Anything else that identifies who
asked. The request also carries no sign-in token and no key belonging to the person: the server
function holds the key, and the request says nothing about who is behind it.

**What comes back is data, never instructions.** Up to five short suggestions. Whatever the reply
says, the app does not act on it: it is drawn on a screen as text to read, and it becomes a task only
when the person presses add — through exactly the same rules, and the same limits, as a task they
typed themselves. A reply is treated the way task text is treated: as something a stranger wrote.

**What Anthropic keeps, for how long, and whether it trains on it.** Both read on 7 October 2026 from
Anthropic's own published pages, and cited rather than remembered:

- **Retention.** "we automatically delete inputs and outputs on our backend within 30 days of receipt
  or generation", with exceptions for longer-retention services, agreed arrangements, enforcing the
  Usage Policy, and legal requirements. Where something is flagged as a Usage Policy violation,
  "we retain inputs and outputs for up to 2 years and trust and safety classification scores for up
  to 7 years" — [How long do you store my organization's
  data?](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)
- **Training.** "By default, we will not use your inputs or outputs from our commercial products
  (e.g. Claude for Work, Anthropic API, Claude Gov, etc.) to train our models", and the one stated
  exception is explicitly reporting feedback or bugs, or otherwise choosing to allow it — [Is my data
  used for model
  training?](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training). This
  app reports no feedback and opts into nothing, so the default is what applies.

**Who can see what was sent.** The person who pressed the button, the owner through Anthropic's
console, and Anthropic.

**Order of release, which is the part that decides what production does.** The **consent setting
arrives in Build it 21** — it is "AI suggestions — the consent setting" below — not here. Until it
exists, **the production key is not installed** — so on production the helper answers that suggestions
are not available, which is a real answer rather than a broken screen. **Staging has its key from Build it 20**, which is where the thing is actually tried.
Nobody's task title leaves production before there is a setting that lets them say no.

**Usage counts and daily limits arrive in Build it 22.** They are not designed here and no number for
them is written here. **They have now arrived** — "Daily limits on what costs money" below is where they
are designed, and the code for them was written on 2026-10-08 — but they are **deployed nowhere**, so for
anything actually running the only thing between a loop and a bill is still the 5-dollar spend limit at
Anthropic. See `docs/costs.md`, and the "Unverified" entry for that section, which says which half stands
where.

**A suspended person gets no suggestions.** The helper is a server function holding a secret key, so
it belongs with the other three: it reads `account_status` by user id and refuses a suspended caller,
the way `create-team`, `invite-member` and `accept-invite` do. "Suspending an account" above says a
suspended person can read and change nothing; a fourth door that ignored that would undo it.

## AI suggestions — the consent setting

Added 2026-10-07. Not a sixth feature of the list above, and not a new thing to send anywhere: it is the
**off switch** for the section directly above, which that section's "Order of release" paragraph has been
promising since before the helper was written. It is in the plan because it is the thing that decides
whether anybody's task title leaves this project at all.

**What it is.** A setting called **AI suggestions**, on each person's profile. **Off for everyone** —
including every account that already exists on the day it arrives, so nobody is opted in by a migration
and a person who never touches it has never sent anything. **Only that person can switch it, and only
for themselves.** Not their team's owner, not another member, not the owner of the app on their behalf:
there is no screen on which anybody changes anybody else's.

**Where it is checked, which is the only part that counts.** `suggest-subtasks` sends nothing to the AI
service unless the setting is on, and that is **checked in the function** — in the same place and for
the same reason the suspension check is there: the function holds the key, so the function is the only
thing that can decide not to spend it. A screen that hid the button would not be this, and a screen is
not where a rule lives.

**If the setting cannot be read, it is off.** A failed read is not a yes. The function answers that
suggestions are not available — the one sentence it already has for every other refusal — rather than
treating an unknown as permission. Same way round as `create-team` counting teams: an unknown is not a
zero.

**What is stored:** whether it is **on or off**, and **when it was last changed**. Nothing else — no
history of earlier switches, and no record of who read it. **Who can see it:** the person whose setting
it is, and the owner through the database. **Deleted with the profile**; it has no life of its own.

**Switching it off stops any further sending at once**, because the function reads the setting on each
request and nothing caches it. **It does not recall what was already sent, and it cannot.** What
Anthropic holds runs on the clock quoted in "Suggest subtasks" above and on nothing this project
controls: deleted "within 30 days of receipt or generation", with the stated exceptions, and up to 2
years — with classification scores up to 7 years — for anything flagged as a Usage Policy violation. Off
means nothing more goes. It does not mean anything comes back.

**Order of release, which is again the part that decides what production does.** Once this setting is
**live on production** and has been **seen to refuse with it off**, the production `AI_API_KEY` may be
installed. Until both of those are true, **production stays exactly as it is**: no key, and the helper
answers that suggestions are not available, which is a real answer rather than a broken screen.

**And a third precondition, added 2026-10-07: there must be a privacy page.** The app has none today — no
page, and nothing linking to one — so everything this plan says about what leaves the project is written
somewhere nobody using the app will ever look. A setting is not consent if the person switching it on cannot
find out what it sends. Before the production key is installed, a privacy page must exist and must say
**what Suggest subtasks sends and to whom**: one task's title and fixed instructions, to Anthropic, with
nothing attached that says who asked; how long Anthropic keeps it; that the setting starts off; and that
switching it off stops further sending but recalls nothing. [#204](https://github.com/build-once/team-tasks/issues/204)
holds it, with the full list and how we will know it is done. **Writing the words is the owner's**, not
least because they carry legal weight; the gate is written here so the release order is decided in one
place.

## Daily limits on what costs money

Added 2026-10-08. Not a sixth feature of the list above, and **nothing new leaves this project**: it is a
ceiling on the two things in this app that spend money when somebody presses a button. It is in the plan
because it holds a **new kind of row the appendix did not list** — a count, per person, per day — and
because rule 9 asks for the plan before the code. Build it 22 is where it is built; this section is
written first, with no code, no migration and no table in existence on the day it was written.

**What it is.** A count of how many times each person used each limited feature on each day, kept in this
project's own database in a table called **`usage_counts`**, and a refusal once that count has reached the
day's limit. It is the thing "Suggest subtasks" above has been promising since 7 October — "**Usage counts
and daily limits arrive in Build it 22.** They are not designed here and no number for them is written
here" — and this is where they are designed and where the numbers are written.

**Decided 2026-10-08, and this section was written before those decisions rather than after them.** It
went to the owner with **seven** open questions and one wording point, and all eight came back settled
the same day. Each is recorded in its place below; they are gathered here so the whole set is in one
view. **Nine rows for eight answers**, because one question — the names — covered two things:

| | Decided |
|---|---|
| How long a count is kept | **7 days**, removed by the same statement that does the counting |
| The two limits | **20 and 20**, unchanged, **with the arithmetic kept as written** in `docs/costs.md` — which says they are not the binding ceiling at six people |
| A retry of an invitation | **Counts.** It sends a second email |
| When the count is written | **Before the paid call, and never given back** |
| The table's name | **`usage_counts`**, everywhere |
| The config file | **`supabase/functions/_shared/limits.ts`**, as proposed |
| The refusal's sentence | **Stands as written below**, and [#184](https://github.com/build-once/team-tasks/issues/184) is the one to update |
| "It resets tomorrow" | **Stays**, with the inaccuracy for people not on UTC recorded rather than fixed |
| The sign-up and reset emails | **Not counted.** Supabase's own rate limits hold them, and reading those is **Build it 25** |

**What is stored, and nothing else:** the **person's ID**, the **feature**, the **day**, and the
**count**. Four values. **Nothing about which task** and **nothing about which address**: not a task id,
not a title, not an invited person's email, not a team, not a time of day, not whether the use succeeded.
A row says "this person used this feature this many times on this day" and is incapable of saying more.

**Who can see it: no app user, not even the person whose count it is.** Not their team's owner, not
another member, and not through a signed-in request — the table carries **no rule and no privileges** that
would let one through, exactly as `account_status` carries none. Only **the app's operator**, through the
database.

**And not the server functions either, which is a correction the owner made on 2026-10-08** while the
migration was being written. This section first said the server functions could see it, because they were
expected to read and write the table directly the way the other three read `account_status`. They do not:
there is **one database function** that counts, and the role those functions connect as holds **the right
to run it and no privilege on the table at all** — no select, no insert, no update, no delete. So a server
function can ask for one use and be told yes or no, and can neither read which days somebody used this app
nor reset a count to start their day again. `docs/architecture.md` carried the same sentence and is
corrected in the same change.

*"The app's operator", not "owner", and the distinction is the reason the words were chosen.* In this app
"owner" also means the owner of a team — feature 2 — and **a team's owner can see nothing here**, not even
for a member of their own team. The person who can is whoever has the Supabase dashboard, which today is
one person.

**How long it is kept: 7 days, removed by the same statement that does the counting. Decided by the owner
on 2026-10-08.** The count's only job in the app is to answer "how many today", so yesterday's row is
already useless for enforcement; everything past today is for the operator, and a row per person per
feature per day is a record of **which days somebody used this app**, which is the same kind of fact the
appendix already flags about exact timestamps. A week is enough for the operator to tell a spike from a
habit, and no more than that is kept.

**The removal is in code, not in a routine, and that is the half of the decision that matters.** It
happens on a path that is already writing, so it needs **no scheduler, no new dependency and no second
thing for anybody to remember** — and it cannot drift, because it runs on every use. A retention period
that depends on somebody doing it is not a retention period; it is a permanent record wearing a window's
label. The cost, stated rather than hidden: one extra statement on every counted use, and the deletion is
a side effect of counting rather than a job you can watch run.

**The two options not chosen**, kept here on purpose so the question is not re-argued from scratch later,
the way the "Collecting less — declined" list below keeps its reasons:

| Not chosen | Why not |
|---|---|
| 35 days, removed by hand by the operator | It would cover a month, so a month of counts could be held against a month of Anthropic's billing. But **nobody will do it** — and then it is not a 35-day window, it is a permanent activity log that says it is a window |
| Only today, older rows deleted on the next write | Collects least, which is this plan's bias everywhere else. But the operator loses the one view that would show a loop: "this person did 20 a day for six days" is the shape of a problem, and a single day cannot show it |

**Deleted with the account.** The rows are keyed by the person's ID and go when the account goes. There is
still no way to delete an account in this app, which the appendix's "Two gaps" section already says and
this section does not improve.

**The limits: 20 AI suggestions and 20 invitations per person per day. Confirmed by the owner on
2026-10-08, after the arithmetic, and the arithmetic is kept as written.** That last clause is the
decision, not a formality: `docs/costs.md` works out that at the plan's group size of about six, **20 a
day is not the binding ceiling for either service** — Anthropic's worst case is above the 5-dollar spend
limit, and 20 invitations each is above the email service's free daily quota. The numbers stand anyway,
because **the two controls do different jobs**. The vendor cap stops the *bill*, properly, by refusing
requests. What it cannot do is stop **one** person, or one retry loop, from using the whole month's
allowance in an afternoon and leaving the other five with a helper that has stopped working. That is this
limit's job, and 20 is sized for a volunteer's day rather than for the multiplication. The arithmetic is
kept **because** it says so: a page that showed only the reassuring half would be the page somebody
trusted later.

Both numbers live in **one config file**: `supabase/functions/_shared/limits.ts`, the location proposed
when this section was written and confirmed on 2026-10-08, read by both `suggest-subtasks` and
`invite-member`. Not spelled at a call site and not in two places. Changing a limit is then a one-line
change in one file, which is also what makes it reviewable: a limit nobody can find is a limit nobody can
check.

**Per person, not per team**: one person who owns three teams has 20 invitations a day in total, not 20
for each team. The existing limits are untouched and are different things — at most 20 **pending**
invitations per team, at most 3 teams per person, and a 7-day expiry — none of which caps how many a
person may send in a day.

**The day is a UTC day**, and the count is keyed by that date. Not the person's local day, because the
app does not know what that is: nothing in this project stores a time zone, and a zone taken from the
browser would make the same person's limit reset at a different moment depending on which device they
picked up.

**So what "resets tomorrow" means for somebody not on UTC.** Their counter rolls over at **00:00 UTC**,
which is some fixed hour of their own afternoon or evening rather than their midnight: at UTC+13 it is
13:00 their time, and at UTC−5 it is 19:00 the previous local evening. Two consequences, both stated
rather than hidden:

- **Their "day" is not their day.** Twenty uses spread across one local Monday can fall in two different
  UTC days, or two local days can share one.
- **The sentence below is approximate for them, and can be wrong by up to the offset.** Somebody at UTC−5
  who reaches the limit at 10:00 local gets their allowance back at 19:00 **the same local day**, and the
  app will have told them "tomorrow". **The wording stays, decided by the owner on 2026-10-08** with that
  inaccuracy in front of them: "it resets at 00:00 UTC" is precise and means nothing to a volunteer, and
  this app is for one group of about six. So the inaccuracy is **recorded here rather than fixed**, which
  is the honest version of leaving it alone — and if this app ever has people spread across time zones,
  this paragraph is the one to come back to.

**What counts as a use. Decided by the owner on 2026-10-08, and this is the half that decides whether the
limit protects anything.** The rule is: **a use is counted the moment this app is about to spend money,
and it is never given back.** The count is written immediately before the paid call is made, and no
answer — success, refusal, timeout or silence — changes it afterwards.

| Does it count? | `suggest-subtasks` | `invite-member` |
|---|---|---|
| **No — refused before anything is sent** | No signed-in caller; `account_suspended`; a suspension read that did not answer; `ai_suggestions_off`; `ai_suggestions_unknown`; a malformed body or a bad task id; `busy`; a task that was not found or whose title is unusable; a task read that did not answer; `not_configured` (production has no key); `no_model` | No signed-in caller; `account_suspended`; a caller who does not own the team; inviting yourself; inviting somebody already in the team; the team's 20-pending limit; no `EMAIL_FROM` or no delivery setting; a failure writing the invitation row |
| **Yes — the request was made** | The call to Anthropic, whatever comes back: suggestions, `refused`, `model_unavailable`, `rate_limited`, `spend_limit`, `unavailable`, `timeout`, `bad_reply` | The send to the email service, whether it answers **sent** or **failed** — and **a retry counts**, decided 2026-10-08: it replaces the link and sends a second email, so it is a second use. See below |
| **Yes, and it is the awkward one** | `unreachable` — the request could never be made at all, so it cost nothing | — |

**A retry of an invitation counts. Decided by the owner on 2026-10-08**, and the argument against it was
real enough to be worth keeping: somebody retrying because the first send failed is not doing a second
thing, and charging them a slot for the email service's bad day reads as unfair. It counts anyway,
because **the thing being limited is the email and a retry sends one** — `invite-member`'s retry path
replaces the link and starts the 7 days again, so it is a second send by every measure except intent.
The alternative would also need the app to tell a retry from a first attempt in the count, which is a
second thing to get right in exchange for softening a limit.

**Why `unreachable` still counts, which is the one place this rule gives a wrong-looking answer. Decided
by the owner on 2026-10-08: the count is written before the paid call and never given back.** That
ordering is the whole protection:
a count written only on success makes a loop of failures free, and a failing service is exactly when
something retries. Over-counting by one when the network is down costs a person one press; under-counting
when the service is broken costs the owner the thing this limit exists for. **The count may therefore be
higher than the number of requests that reached anybody, and never lower**, which is the direction an
unknown should fail in — the same way round as `create-team` counting teams, where an unknown is not a
zero.

**When the limit is reached the person sees:** "You've reached today's limit. It resets tomorrow."

One sentence for both features, saying what happened and when it ends, and naming **no** company, model,
key, status or number. It is **not** one of the twelve fixed failure codes `suggest-subtasks` already has,
for the same reason the consent refusal is not: those twelve all mean "something in this app's plumbing
went wrong, press it again later", and this one is a fact about the person's own day that they can plan
around. Like the consent refusal, it gets its own sentence and its own code.

**The sentence stands. Decided by the owner on 2026-10-08**, against
[#184](https://github.com/build-once/team-tasks/issues/184)'s condition 3, which asks for this refusal to
reuse the function's existing fixed sentence and one of its existing codes. **#184 is the thing that
changes, not the sentence**, and a comment on that issue says so. The reason the condition was written
that way is sound — a new sentence usually means new plumbing on a screen to explain it — and the consent
refusal has since shown the other shape: a refusal a person can act on earns its own words, and hiding it
behind "Suggestions aren't available right now" would be using a sentence designed to conceal plumbing to
conceal something useful instead.

**This replaces the per-instance "one call at a time" lock as the real control, and that lock stays
exactly where it is.** [#186](https://github.com/build-once/team-tasks/issues/186) records what is wrong
with it: it is a `Set` of user IDs in one isolate's memory, so two asks from one person that land on two
isolates both proceed, and it is "a courtesy, not a control". A count in a table is the control, because
every isolate reads the same row.

What happens to the lock: **nothing is removed.** It keeps catching the double click without a database
write, which is worth having and costs nothing, and **it stops being the thing anybody points at** when
asked what keeps this feature from spending money. The caveat in the code stays true and stays written
down, so #186 does **not** close when this lands — its four conditions are about two *simultaneous* asks
being counted, not about a daily limit — and nothing in this section softens it.

**And it does not close [#184](https://github.com/build-once/team-tasks/issues/184) either, which is
worth saying because it looks as though it should.** #184 is the reload: asking is a GET, so every reload
of `/tasks?suggest=<id>` asks again and spends again. A daily limit does not stop the second ask — it
stops the twenty-first. What it does is make the asks **countable**, which is #184's condition 2 and
half of its condition 4; its condition 1, "the second ask did not reach the AI service", stays open and
needs something this section does not design. **And its condition 3 is departed from on purpose** — see
the sentence above, and the owner's decision of 2026-10-08 that #184 is what updates.

## Files attached to a task

Added 2026-10-08. Like "Suggest subtasks" and unlike the two sections between them — the consent setting
and the daily limits, counted here rather than remembered — this one **is** a
new thing people can press: a task can carry files, and somebody has to choose them and open them. "File
attachments" sat on the not-in-the-first-version list below until today; the line moved before any code
was written, which is the order rule 9 asks for. Build it 23 is where it is built, and **nothing exists
on the day this was written** — no bucket, no storage rule, no migration, no screen and no code.

It is in the plan for a second reason as well, and it is the bigger one: a file is the first thing this
app will hold that **nobody has read before it is stored**. Task text is typed into a box with a request
above it. A photograph arrives whole, with whatever is inside it.

**What it is.** On a task the person can already see, they can attach a file and open a file that is
already there. **Images and PDFs only, 5 MB each.** The files live in Supabase Storage, inside this
project, and they are opened through a link that **expires after 5 minutes**.

**Decided 2026-10-08, and this section was written before those decisions rather than after them.** It
went to the owner with **five** open decisions and two things to accept or reject, and all seven came back
settled the same day. Each is recorded in its place below; they are gathered here so the whole set is in
one view, the way "Daily limits on what costs money" above gathers its nine.

| | Decided |
|---|---|
| How many files per task | **3** |
| How much per person in total | **100 MB**, and **enforced on the server at upload** — which is the half that decides where the check lives |
| Who may delete a file | **Only the uploader** |
| Whether the upload box warns about what is inside a photograph | **Yes — one line beside the box**, saying a photo can carry where and when it was taken and that the app does not remove it |
| Whether files may be left behind | **No. Not acceptable.** Deleting a task **deletes its files first** and is **refused if they cannot be removed**; and **the database refuses to delete a task that still has files**. Removing a person's files when an account is deleted is **a requirement of Build it 26** |
| That a renamed file can get through | **Accepted as written.** The app promises the refusal and promises nothing about contents |
| That the limits do not keep this inside the egress allowance | **Recorded as written, and no egress limit is built now** |

**The fifth row is the one that changed this section most**, and it is worth saying why before the detail:
this plan's habit is to write a gap down and leave it ([#204](https://github.com/build-once/team-tasks/issues/204),
the privacy page, is one; the account-deletion gap is another). Here the owner did the opposite. "Files
are left behind" was written as a known cost of the design, and the answer that came back was that it is
not a cost worth paying — so the deletion of a task is now **two things that must both happen**, with the
database as the thing that refuses if only one of them does.

### What is stored

Two things, and the second is the one that is easy to forget.

**The file itself**, in a **private** Supabase Storage bucket named **`attachments`**, in a folder named
after its task's ID — so a file sits at `attachments/<task id>/<file name>`. "Folder" here is part of the
object's path rather than a thing of its own: `storage.foldername()` "Returns an array path, with all of
the subfolders that a file belongs to" ([Storage helper
functions](https://supabase.com/docs/guides/storage/schema/helper-functions), read 2026-10-08), which is
what lets a rule ask which task a file belongs to by reading the first segment of its path.

**And a row Storage writes about it**, in `storage.objects`, which the app does not choose the shape of.
Its columns are `id`, `bucket_id`, `name`, `created_at`, `updated_at`, `metadata` (a JSON blob),
`path_tokens`, `version` and `owner_id` ([The Storage
Schema](https://supabase.com/docs/guides/storage/schema/design), read 2026-10-08). Taking the five things
the owner's issue names one at a time — **and a sixth it does not** — because they are not all equally
confirmed:

| | Where it is | Confirmed? |
|---|---|---|
| **Its name** | `name`, which is the whole path — so it carries **the task's ID and the file name the person's device gave it** | Cited: the schema page above |
| **Its size** | inside `metadata`, as `"metadata": {"size": 1234}` | Cited: the example object in [Self-Hosting Storage → objects](https://supabase.com/docs/reference/self-hosting-storage/get-object-info), read 2026-10-08 |
| **Its type** | **not confirmed.** Presumably in `metadata` beside the size, and presumably is not a citation. No page read on 2026-10-08 says the declared type is stored, or where | **Not confirmed** |
| **Who uploaded it** | `owner_id`. The schema page lists the column; the helper-functions page compares `owner_id` with `auth.uid()` in a policy example, which is how it is meant to be used | **Column cited; its meaning is read off those two pages, not stated by either.** No page read gives `owner_id` a formal definition |
| **When** | `created_at` and `updated_at` | Cited: the schema page above |
| **When it was last opened** | **not confirmed, and worth more than a shrug.** The schema page does **not** list a `last_accessed_at` column; the self-hosting example response **does** show one. So either the schema page is incomplete or the API adds it, and nobody writing this knows which | **Not confirmed.** If it exists, it is a record of **when somebody last looked at a file**, which is a fact about a person this plan has not decided to hold |

That table is the reason this section says "and a row Storage writes about it" rather than naming the
fields and stopping: **the app does not get to choose what Storage records.** Every other table in this
project was designed here, column by column, and `usage_counts` was deliberately given four values so it
could not say more. This one arrives already shaped — and the last row of that table is what the
difference costs.

**One thing it means, stated because it is easy to miss:** `owner_id` is **another** place this project
holds a user ID — no count of the others is given here, because none was made — and on a team task it
need not be the same person as the task's creator. The task's row knows who wrote the task; the file's row
knows who attached the file.

### Limits

**Images and PDFs only, 5 MB each.** 5 MB sits well under what Supabase would allow: "For Free projects,
the limit can't exceed 50 MB" globally, and a bucket's own limit "can't be higher than this global
limit" ([Storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits), read
2026-10-08).

**Three files per task, and 100 MB per person in total. Both confirmed by the owner on 2026-10-08**, after
the arithmetic, and the arithmetic is kept as written:

| Decided | Figure | Why |
|---|---|---|
| **Per task** | **3 files** | Three is enough for the job this app exists for — a photo of the thing, a photo of the receipt, the form as a PDF — and it keeps a single task's worst case at **15 MB**, which is a number a person can be told. It is also small enough that the screen can draw them all without a "show more" |
| **In total, per person** | **100 MB** across all their attachments | The ceiling that matters is Supabase's, not a design preference. The Free plan includes **1 GB** of storage ([Manage your usage → Storage size](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size), read 2026-10-08). Six people at 100 MB each is **600 MB**, which is **60%** of that 1 GB — reading a GB as the conservative 1,000 MB, because the page does not say which it means. 100 MB is about **6 fully-loaded tasks**, or **20** single 5 MB files, or a great many small ones |

**There is no total-per-app limit, and that is deliberate**: six people at 100 MB each cannot
reach 1 GB, so a second ceiling would be a number nobody could hit sitting in front of a reviewer looking
like protection. If the group ever grows past ten people, this paragraph is the one to come back to —
**ten** people at 100 MB is 1,000 MB, which is the whole free allowance.

**And the 100 MB is enforced on the server, at upload. Decided by the owner on 2026-10-08, and this is
the half that decides what gets built rather than what the number is.** A per-person total needs a sum
across rows the caller may not be able to see, exactly like "at most 3 teams per person" and "at most 20
pending invitations per team" — which a row-level policy cannot do, and which a screen must not be trusted
with. So the check happens in server code holding the secret key, before the file is accepted, for the
same reason `create-team` counts teams: *the only place a count can honestly happen is somewhere that can
see all the rows and that the person cannot edit.* The per-task three is the same shape and goes to the
same place.

**What that rules out, which is worth stating because it was the obvious design an hour earlier:** an
upload straight from the browser with nothing but a storage rule in front of it. That shape is the mirror
of how a file is *read*, it needs no key, and it cannot enforce either number. **So something of ours now
stands in front of every upload** — and `docs/architecture.md` says what is settled about that and what is
still a choice, because "on the server" names where the decision is made and not how the bytes travel.

**It is still not the daily limits of Build it 22, and still not counted in `usage_counts`.** Uploading
a file spends nobody's money per press — it spends storage, which is a stock rather than a flow, and a
stock is bounded by a total rather than by a rate. A count per day would be the wrong instrument: somebody
who uploads nothing for a month and then fills their 100 MB in an afternoon has not done anything the app
needs to stop. Nothing in "Daily limits on what costs money" above changes, and no new feature name is
added to that table.

**These are not the daily limits of Build it 22, and they are not counted in `usage_counts`.** Uploading
a file spends nobody's money per press — it spends storage, which is a stock rather than a flow, and a
stock is bounded by a total rather than by a rate. Nothing in "Daily limits on what costs money" above
changes, and no new feature name is added to that table.

### What the type limit does and does not guarantee

**What Storage checks is the type the upload declares, and the app does not get to see inside the file.**
A bucket can be given `allowedMimeTypes` and `maxFileSize`, and "If an upload request doesn't meet the
above restrictions it will be rejected" ([Creating
buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets), read 2026-10-08) — a
rejection the error list gives as `InvalidMimeType`, "The specified MIME type is not valid.", 400
([Storage error codes](https://supabase.com/docs/guides/storage/debugging/error-codes), read
2026-10-08).

**And where that declared type comes from is the whole answer: "By default, Supabase Storage determines
content type from the file extension. You can override this with the `contentType` option"** ([Standard
uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads), read 2026-10-08).

So, plainly: **a renamed file can get through.** Both halves of the check are chosen by whoever is
uploading — the extension is part of the name they send, and `contentType` is a value they can set
outright. Anything at all, renamed to `.png`, is a file Storage has been told is a PNG.

**Not confirmed: whether Supabase inspects the bytes at all.** Four Storage pages were read on
2026-10-08 — fundamentals, file limits, creating buckets and standard uploads — and **none of them says
the contents are examined**, which is not the same as a page saying they are not. Nobody has tried it.
Settling it needs either a Supabase page that describes content sniffing or an actual upload of a
deliberately misnamed file to staging.

**This was put to the owner and accepted as written, on 2026-10-08.** Not waved through: the decision was
to keep the limit, keep the sentence that says what it does not cover, and **not** go looking for a way to
check the contents. The reason that is the right trade here is in the third bullet below — the people who
can open a file are a handful of volunteers who can already see the task, so the realistic risk is
somebody's odd file in their own team rather than anything arriving from outside. **What was explicitly
not accepted is a vaguer promise**: "images and PDFs only" stays in the plan *because* the paragraph
underneath it says what it means.

**So what the app will and will not promise:**

- **It will promise** that an upload declaring anything other than an image or a PDF is refused, and that
  one over 5 MB is refused — both by Storage, not by a screen.
- **It will not promise** that what is in the bucket is really an image or really a PDF. It cannot, and
  saying so here is cheaper than somebody inferring it later from the words "images and PDFs only".
- **It will not promise that opening a file is safe**, which is the consequence that actually matters. A
  file comes back to a browser with the type it was stored under, so a browser can be asked to render a
  stranger's bytes as a picture or a PDF. The people who can open a file are the small set in the next
  section, so the realistic shape of this is a volunteer uploading something odd to their own team, not
  the internet — but it is the reason the bucket is private and the reason this paragraph is here rather
  than absent.

### Who can read, upload and delete a file

**Exactly the people who can see its task, by the same rules as tasks, and nobody else.** Not a wider
set, not a narrower one: the file inherits its task's audience, because the file is part of the task.
Which, read off the "Who may touch a task" table in `docs/architecture.md`, means:

| | Personal task of theirs | Team task in a team they are in | Anybody else's task |
|---|---|---|---|
| **See that a file is there, and open it** | yes | yes | **no** |
| **Attach a file** | yes | yes | **no** |
| **Delete a file** | yes | **only the file they attached themselves** | **no** |

**And a suspended person is refused all three**, the same way "Suspending an account" above refuses them
everything else. The database rule on the bucket has to ask `is_active()` the way the existing table rules
do; a storage rule that forgot it would be a new way round a control the plan says is total. **A
suspended person cannot delete their own attachments either**, which is the same sharpening of the
account-deletion gap that suspension already causes for tasks, and the "Two gaps" section below now says
so about files too.

**Only the uploader may delete a file. Decided by the owner on 2026-10-08**, against the one alternative,
and both are kept here so the question is not re-argued from scratch later:

| | Why |
|---|---|
| **Only the uploader — chosen** | It is the rule feature 4 already chose for tasks, for the stated reason: "only the person who created a task can delete it, so nobody loses an entry because somebody else tidied up". A file is more costly to lose than a line of text — the person's copy may be gone from the phone that took it — so the argument that picked this rule for tasks is **stronger** here, not weaker |
| **Anyone who can see the task — not chosen** | Simpler to explain, and it matches ticking and renaming rather than deleting. It was also the only one of the two that let a team clear up a file somebody attached and then left, since nobody can leave a team in this version and nobody can delete an account |

**What choosing it costs, stated rather than left to be discovered:** a file nobody wants can only be
removed by the person who attached it, or by the operator in the dashboard. That is the same shape as a
stranded task, and it is a real cost.

**And it collides with the deletion decision below, in one specific case. This is the one thing the
owner's seven answers did not settle, and it is new rather than overlooked** — it exists *because* two of
them were decided the way they were, and neither is wrong on its own.

Put the two side by side. **Only the uploader may delete a file.** And **the database refuses to delete a
task that still has files.** Now: Alice creates a task in a team, Bob attaches a photo to it. Only Alice
may delete the task — feature 4 — and only Bob may delete his file. So **Alice cannot delete her own
task**, and no screen can offer her a way through, because the only person who can clear the obstacle is
Bob.

- **It cannot happen on a personal task.** Nobody else can see one, so its creator is the only possible
  uploader, and that person is the same person. This is a team-task case only.
- **It is not rare, either.** A task somebody else attached a photo to is the normal shape of this
  feature working.
- **Both plausible answers are somebody's call, not this document's.** Either the delete path is allowed
  to remove files on the task it is deleting — which means removing Bob's file on Alice's instruction, and
  reads as a departure from "only the uploader" unless that rule is read as being about *deleting a file*
  rather than about *deleting a task* — or a team task with somebody else's file on it stays until that
  person removes the file, which is a task nobody can finish with.

**So this plan does not choose.** It is filed as its own question, with the two answers and what each
costs, because inventing a third here would be exactly the kind of quiet design decision rule 9 asks to
be put in front of the owner first.

### Links, and what an unexpired one allows

**A file is opened through a signed link that expires after 5 minutes.** The bucket is private, so there
is no URL that works without one: a signed URL is how Supabase shares a file from a private bucket — "Use
a signed URL to share a file for a fixed amount of time", with `expiresIn` being "The number of seconds
until the signed URL expires" ([`createSignedUrl`](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl),
read 2026-10-08). Five minutes is **300** seconds, and it is chosen to be long enough to open a photo on
a slow phone connection and short enough that a link pasted into a chat has usually stopped working
before anybody clicks it.

**What an unexpired link allows, said plainly: anyone holding it can open that file, until it expires.**
Not the person who asked for it — **whoever has the link.** It carries no sign-in, it is not tied to a
session, and nothing about it checks who is using it. For those five minutes the link **is** the
permission, which puts it in the same class as an invitation token: "until it expires or is used, the
token in the email *is* a credential" is how `docs/architecture.md` already puts it about invitations,
and the same sentence applies here with "used" removed, because a signed link does not get used up. It
can be opened any number of times inside its five minutes.

**Three consequences, all of them the price of the design rather than faults in it:**

- **A link outlives the permission that created it.** Suspend the account, remove the person from the
  team, or move the task out of the team, and a link already in their hands keeps working until it
  expires. The check happens when the link is **made**, not when it is used.
- **It also outlives the screen.** A link sitting in a browser's history or a phone's share sheet is live
  for the rest of its five minutes.
- **Whether deleting the file kills an outstanding link is not confirmed.** It is reasonable to expect a
  deleted object to answer with nothing, and no page read on 2026-10-08 says so. Do not write it down as
  a promise until somebody has deleted a file and then opened an unexpired link to it.

**Five minutes is the control, and it is the only one.** There is no revoking a signed link in this
design, so the number is doing all of the work — which is the argument for keeping it small and for not
quietly raising it later to make something convenient.

### What happens to a task's files when things change

Three cases. **This section was written saying two of them leave files behind, and that was put to the
owner as a thing to accept. It was not accepted.** The decision of 2026-10-08, in the owner's terms:
**leftover files are not acceptable.** Deleting a task **deletes its files first** and **is refused if
they cannot be removed**; **the database refuses to delete a task that still has files**; and removing a
person's files when an account is deleted is **a requirement of Build it 26**.

**Why the start of this paragraph is kept.** The gap is written out below as well as its answer, because
"nothing is left behind" is a promise, and a promise is only worth what the reader can see it was weighed
against. This plan keeps its declined options for the same reason.

**When the task is deleted: the files go first, and the task does not go without them.**

The problem it answers is that **nothing in Supabase connects `storage.objects` to this project's `tasks`
table** — the columns above are `bucket_id`, `name`, `owner_id` and the rest, and not one of them is a
reference to a task. So there is no cascade to lean on: deleting a task's row would delete nothing in the
bucket, and the files would be left **unreachable and undeleteable through the app at the same time**,
because the storage rule asks "may you see the task this file belongs to?" and once the task is gone that
question has no yes for anybody. Only the operator, in the dashboard, could see or remove them.

**Two things now stop that, and the second is the one that makes it true rather than intended:**

1. **The app deletes the files, then the task — and refuses the whole thing if the files cannot be
   removed.** Not "tries and carries on": a file that would not delete means the task stays, and the
   person is told. The order matters and is the right way round. Files-then-task can fail halfway and
   leave a task with fewer files than it had, which is recoverable and visible. Task-then-files fails
   halfway and leaves exactly the orphan this decision exists to prevent.
2. **And the database refuses to delete a task that still has files**, whatever asked it to. This is the
   half that counts, for the same reason row-level security rather than a screen is what enforces feature
   5: *a rule that lives only in the app is a rule that holds until something else deletes the row.* A
   row deleted in the SQL editor, by a server function, or by a cascade from somewhere else all meet this
   one. It makes "no orphaned files" a property of the database rather than a property of one code path
   being correct.

**Two consequences of the second half, both stated rather than discovered later.**

**It makes the Build it 26 requirement unavoidable rather than aspirational**, and that is the neatest
thing about the decision. Deleting an account cascades to that person's `tasks` rows — so if the database
refuses to delete a task that still has files, **deleting an account is refused too** while any of those
tasks has one. The intention "we should remove their files as well" stops being something anybody has to
remember and becomes something they cannot get past. **Not confirmed**: nobody has built or tried this,
and whether a refusal fires on a cascade the way it fires on a direct delete is a question about Postgres
that this plan has not answered by reading or by trying. If it turns out not to, the Build it 26
requirement is still a requirement and is simply no longer self-enforcing.

**And "refused" has to mean something a person can act on.** A delete that fails with nothing useful
behind it is worse than one that leaves an orphan, because the person tries again. What the screen says
is not written here, beyond the one thing that must be true of it: it says **which** thing is in the way,
because in the one case named in the section above the person is powerless and needs to know that rather
than guess.

**When the task moves between personal and a team: nothing is left behind, and nothing has to move.**
The path is `attachments/<task id>/…` and the task's ID does not change when its `team_id` does, so
nothing has to be copied or renamed — the rule simply starts answering differently. Which is convenient
and has one edge the screens will have to say out loud: **moving a personal task into a team shows that
team every file already attached to it**, including files attached while the task was private, with no
step in between that asks "are you sure about these three photos?". Moving it back out hides them again.
**This case was never a leftover-files case** and is unchanged by the decision.

**When an account is deleted: a requirement of Build it 26, written down rather than built now. Decided
by the owner on 2026-10-08.** There is still no way to delete an account in this app, so this is about the
owner doing it by hand, and it is the one of the three the app cannot currently reach. What the
requirement says: **deleting a person's account removes that person's files**, and it is not finished
until it does. Two things make it more than a note:

- **The database refusal above means the deletion cannot quietly half-happen.** It fails instead, which
  is the loud failure that gets fixed.
- **It is now a condition on Build it 26 rather than a wish about it**, with its own issue, so it is
  checkable by somebody who was not in this conversation.

What it deliberately does **not** do is design the removal. Whose job it is to walk a person's tasks and
clear their files — a server function, a database routine, the operator with a list — is Build it 26's
question, and guessing at it here would put a design in a plan that nobody has reviewed.

**So: one of the three cases was never a problem, one is solved in this build, and one is a named
requirement of a later one.** The thing that changed between the morning and the evening of 2026-10-08 is
that none of them is now a cost somebody is being asked to accept.

### What is inside a photograph, which the app does not look at

**A photograph can carry the place it was taken and the device that took it, inside the file**, along with
the exact moment. **The app does not remove any of it**, and will not in this version: the file is stored
as it arrives. So a volunteer attaching a photo of a job may be attaching the coordinates of where they
were standing, to a file their whole team can open.

That is worth putting beside what this plan already refuses to collect. The appendix says "no phone
numbers, addresses, birthdays or photos" about what the app asks for, and "Collecting less" trimmed a
display name to a nickname so the app would never hold a legal name. **A photo's own metadata walks
straight past all of that** — it is not asked for, not typed, not visible on the screen that uploads it,
and more precise than anything a person would have volunteered.

**Stripping it was not proposed and was not chosen, for two reasons and one of them is a rule.** The
first: removing metadata
means a library that rewrites image files, which is a dependency, and rule 17 makes that the owner's
decision rather than a thing a plan quietly assumes. The second: a rewrite that goes wrong damages the
file somebody attached, and an attachment feature whose first act is to re-encode the attachment is a
worse trade than it sounds.

**So the decision was not "strip or do not strip". It was whether "the app does not remove them" is said
to the person uploading, in the place they are uploading — and the answer, from the owner on 2026-10-08,
is yes: one line beside the upload box.** It says that a photo can carry where and when it was taken, and
that the app does not remove it. One sentence, in the place it matters, costing nothing and adding no
dependency.

**That is the same decision this plan took once before, for the same reason**, which is why it is the
consistent answer rather than merely the cautious one: "Task text: a length limit, and the request shown
in the input box itself — 'No personal details' belongs where people are typing, not only in this plan —
nobody using the app will ever read this document." A photo is the harder case of exactly that, because
what it carries is **not something the person typed and cannot be seen on the screen they are uploading
from**. Somebody who reads the line and attaches the photo anyway has made a choice. Somebody who was
never told has not.

**The two it was chosen over**, kept so the question is not re-argued later:

| Not chosen | Why not |
|---|---|
| **Nothing on the screen** | This section would have been the only record, which is a record nobody using the app will ever read — the exact thing the task-text decision above rejected in those words |
| **Strip the metadata** | Needs a package that rewrites image files, so rule 17 applies: registry page, weekly downloads, maintainer, and a yes, before anything is installed. And a rewrite that goes wrong damages the file somebody attached. **Still available later**, and this line is the one to come back to if it is ever wanted |

**What the line actually says is written when the screen is**, not here — the substance is decided and the
wording belongs with the box it sits beside. Two things have to be true of it: it is **short**, because a
paragraph beside an upload button is a paragraph nobody reads, and it says **the app does not remove it**
rather than implying anybody has checked.

### What files are never part of

**A file is never sent to the AI helper.** "Suggest subtasks" sends "the **title of the one task the
person asked about**, and **fixed instructions written by this app**. That is the whole request" — and an
attachment is not a title. No file, no file name, no part of a file's contents, and no count of how many
files a task has. The helper does not read the bucket and has no privilege on it.

**A file is never sent to error reporting, and neither is its name.** The Sentry section above lists what
may be sent and adds "What must never be sent"; **a file name joins that list**, for the reason that
section already gives about its own limit: "A pattern scrub cannot recognise free text that no known
phrase introduces, so error messages written by this app must never include task text, names or
addresses." A file name is exactly that kind of free text — somebody's phone chose it, or somebody typed
it, and `scan-of-the-letter-from-my-doctor.pdf` is a sentence about a person. **So the rule is on this
app's own code, not on the scrub**: a storage error is reported with its code and the operation, never
with the path or the name. Nor is the file's contents, its size or its type attached to a report.

## Deliberately not in the first version

Comments. Reminder emails. Payments. A phone app.

Some of these come later, on purpose. When one does, this plan gets updated first.

**An AI helper left this list on 2026-10-07.** It is "Suggest subtasks" above. That is what "updated
first" looks like in practice: the line moved out of this list, and the section above was written,
before any code existed.

**File attachments left it on 2026-10-08**, the same way. It is "Files attached to a task" above, written
for Build it 23 with no bucket, no rule and no code in existence — so the list is now four things rather
than five, counted here rather than remembered.

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
- The title of one task, sent to Anthropic's Claude API when somebody presses Suggest subtasks, and
  the suggestions that come back — outside this project, and with nothing attached that says who asked
- Whether somebody has switched AI suggestions on, and when they last changed it
- How many times each person used each limited feature on each day — a count, and nothing about which
  task or which address
- Files attached to a task — images and PDFs, in this project's own storage; plus what Storage records
  about each one: its path, which carries its task's ID and the file name the person's device gave it,
  its size, who uploaded it and when
- **Whatever is inside those files**, which is the one line in this list the app does not choose the
  contents of — including the place and the moment a photograph was taken, which the app does not remove

Nothing else: no phone numbers, addresses, birthdays or photos — **and that last word changed meaning on
2026-10-08.** The app still asks for none of those and has no field for a photograph; what it now has is
a box a person can put a file in, so a photo can arrive because somebody attached one to a task. "Files
attached to a task" above is where that is set out. We ask people not to put
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

The Claude API, added 2026-10-07, is the first service here with **no free plan**: it is metered per
token. Its ceiling is the **5-dollar monthly spend limit** on the Team Tasks workspace, which sits
inside the £30-a-month ceiling above but is **not £0** — so the first sentence of this section is no
longer true of every service while building. `docs/costs.md` carries the published per-token prices,
the arithmetic, and what Anthropic does when a spend limit is reached.

Attachments, added 2026-10-08, add **no new service and no new bill**: they use Supabase Storage in the
projects this app already has. They do use two of its metered allowances for the first time — **storage
size** and **egress** — and on the Free plan neither can produce a charge. `docs/costs.md` carries the
published quotas (**1 GB** of storage, **5 GB** of egress a month), what the limits come to
against them, and what the page says happens when a Free project goes past one. **The storage half fits
and the egress half does not**, and the owner recorded that on 2026-10-08 rather than building a limit
against it — which is on that page, with the three things that would change it.

---

# Appendix — every piece of personal data

The one-page plan ends above. This appendix is reference material; it is not part of the page.

Table names marked *(proposed)* do not exist yet — no database has been created. "Owner" means
anyone with access to the Supabase or Vercel dashboard, which today is one person. Supabase, Vercel,
Resend, Sentry and now Anthropic can technically reach the data they hold; that is true of any host.

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
| One task's title, sent to an outside AI service | "Suggest subtasks" above — the helper cannot suggest subtasks for a task without its title. Sent with fixed instructions and nothing else: no address, no display name, no user ID, no team name, no other task | Anthropic's Claude API — outside your app and outside your database. **Nothing is installed, so nothing has been sent yet** | The person who pressed the button; owner via Anthropic's console; Anthropic | Anthropic's published retention: deleted **within 30 days** of receipt or generation, with stated exceptions — and **up to 2 years**, with classification scores up to 7 years, for anything flagged as a Usage Policy violation. Cited in "Suggest subtasks" above. Nothing is kept on our side | **No way in the app**, and there is nothing of ours to delete. What Anthropic holds runs on the clock above; **not tried** — no request has ever been sent | **Yes** — it is task text, which people type anything into, and this is the one row in this table where task text leaves the project |
| Whether AI suggestions are switched on, and when that last changed | "AI suggestions — the consent setting" above — the row *is* how the function knows whether a task title may leave this project | `profiles.ai_suggestions_enabled` and `profiles.ai_suggestions_changed_at` — **built**: the two columns, the trigger that stamps the second and refuses any caller who supplies it, the constraint that makes "on with no date" unrepresentable, and `my_ai_suggestions()`. Applied to staging and to production on 2026-10-08 (see the "Unverified" entry below for who did each, and the evidence) | The person whose setting it is, through `my_ai_suggestions()` — **no client role may SELECT either column**, so a team mate cannot read it through the existing "your team mates' profiles" policy; owner via the dashboard; `service_role` may read it and may **not** write it, so no server function can switch it for anybody | With the profile | **Not on its own** — switching it off is the control a person has, and the value goes when the profile goes. There is still no way to delete a profile in the app | No, but it records a choice a person made about their own data |
| The suggestions that come back | "Suggest subtasks" above — they are what the person reads | **Nowhere in this project unless the person adds one**, which writes an ordinary `tasks` row. At Anthropic, as the row above | Before anyone adds one: only the person looking at the screen. After: as any task — its creator, and its team if it has one; owner | Not stored by this app at all until somebody adds one; then with the task. At Anthropic, as the row above | Delete the task — **built**, exactly as for a task somebody typed | **Yes** — until somebody reads it, it is text from outside this project; it is treated as data and never as instructions |
| A file attached to a task, and whatever is inside it | "Files attached to a task" above — feature 4 with a file beside the text. The file *is* the thing somebody wanted to share | A **private** Supabase Storage bucket named `attachments` *(proposed)*, at `attachments/<task id>/<file name>` — **inside this project**, not outside it. **Nothing exists**: no bucket, no rule, no code. **3 per task, 5 MB each, 100 MB per person**, the last enforced on the server at upload | Exactly the people who can see its task: its creator for a personal task, every member of its team for a team task — **and a suspended person nobody**. Plus the operator, in the dashboard. Opened through a **signed link that expires after 5 minutes**, and for those five minutes **anyone holding that link** can open the file, signed in or not | **With the task, and that is enforced rather than intended — decided 2026-10-08.** Deleting a task deletes its files first and is refused if they cannot be removed, **and the database refuses to delete a task that still has files**. So there is no state in which a file outlives its task. Removing a person's files when an account is deleted is **a requirement of Build it 26** | **Delete the file, or delete the task it is on** — the second removes the first. **Only the uploader may delete a file** (decided 2026-10-08), which on a team task means a file somebody else attached is theirs to remove, not yours | **Yes**, and more so than anything else in this table. It is a file nobody read before it was stored, it can be a photograph carrying **where and when it was taken** — which the app does not remove, and **the upload box says so** — and it can be a document about a third party who never agreed to anything |
| What Storage records about each file | **Nothing** — Supabase Storage writes the row whether we want it or not; this is the first row in this table with that shape that is also **inside** our own project | `storage.objects`: `name` (the whole path, so **the task's ID and the file name the device gave it**), `metadata` (holding the size), `owner_id` (the uploader), `created_at`, `updated_at` — cited in the section above. **The declared type is not confirmed**, and so is **`last_accessed_at`**, which the schema page omits and the API reference shows — and which, if it exists, records **when somebody last opened a file** | The operator, in the dashboard; Supabase. Through the app, only as far as a storage rule is written to expose it | **With the object, and the object goes with its task** — so this row inherits the row above's answer rather than outliving it, which is a change from what this table said earlier on 2026-10-08 | **With the file.** Deleting the file deletes the row Storage keeps about it; there is nothing separate to remove | **Yes** — a file name is free text somebody's phone chose or somebody typed, which is why no file name may ever appear in an error report |
| How many times a person used each limited feature on each day | "Daily limits on what costs money" above — the count *is* how a server function knows whether this person has reached today's limit, and a limit that is not counted somewhere every isolate can read is not a limit | `usage_counts` — **built, and applied to staging and to production on 2026-10-08**: `supabase/migrations/20261008115900_usage_counts.sql`, with `evidence/build-it-22-usage-counts.md`. The two Edge Functions that write it through `count_daily_use()` are **deployed nowhere**, so the table is empty in both projects. Four values: the person's ID, the feature, the day, the count. **No task id, no title, no address, no team, no time of day** | **Nobody through the app**, not even the person whose count it is — **no rule and no table privileges for any role at all**: not for signed-in or signed-out callers, and **not for `service_role` either**, which holds only the right to run `count_daily_use()` (the owner's correction of 2026-10-08). The app's **operator** via the dashboard. **Not a team's owner**, for whom there is nothing to read | **7 days, decided 2026-10-08**, removed by the same statement that counts — so the window is enforced by code rather than by anybody remembering | **They cannot.** It goes with the account, and there is still no way in the app to delete an account | No, but it records **which days a person used this app**, which is the same kind of fact as the exact timestamps row above |

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

### Added 2026-10-07 — collecting less in a request to an AI service

Kept apart again, for the same reason: a different service, and a different shape of risk. Here the
data leaves because somebody asked for help with it, not because something broke.

- **One title, not the list.** The request carries the title of the one task the person asked about.
  Not its team, not its dates, not the other tasks on the screen beside it.
- **No name, and not even a user ID.** The error-report decision above kept the user ID, because the
  owner needed to know whether one person or everyone was affected. There is no equivalent question
  here, so nothing identifying the asker is sent at all — no address, no display name, no user ID, no
  team name.
- **The reply is data, not instructions.** Up to five short suggestions, drawn as text. Nothing a
  reply says makes the app do anything, and a suggestion becomes a task only when the person adds it.
- **The key never reaches a browser.** `AI_API_KEY` lives only in each Supabase project's function
  secrets, one per project, exactly like the Resend key — so the call is made by server code and the
  browser never holds anything that could spend money.
- **Production waits for consent.** The production key is not installed until the Build it 21 setting is
  live on production and has been seen to refuse with it off — "AI suggestions — the consent setting"
  above says it in those words — so until then nothing is sent from production at all.
- **Off is the starting point, for everybody.** The setting arrives off for every account that already
  exists, so the first version of consent here is not a box somebody has to find and clear. Nobody has
  sent anything until they have switched it on themselves.

### Added 2026-10-08 — collecting less in a usage count

Kept apart again, and this one is a different shape from all three above: nothing leaves the project, and
the data is not something anybody typed. It is a number this app writes about a person, which is the first
time that has been true of anything in this plan except a suspension.

- **A count, not a log.** One row per person, per feature, per day, holding a number. **Not a row per
  use**, which would be a timestamped record of each time somebody pressed a button, and would be the
  request logging "Logs: we add none of our own" rules out above.
- **Nothing about what was used.** No task id, no title, no invited address, no team, and no time of day
  — so the count cannot be read backwards into what somebody was doing, only how often.
- **Nobody can read it through the app, not even the person it is about.** No rule and no table
  privileges for signed-in or signed-out callers, the way `account_status` has none.
- **A short window, and one that enforces itself.** **7 days**, decided 2026-10-08, removed by the same
  statement that does the counting — because a retention period that depends on somebody remembering is
  one that quietly becomes "forever". Both halves were the owner's choice: the length, and that it be
  enforced by code rather than by intention.
- **One file holds the numbers.** Two limits, in one place, so the thing a reviewer has to find is in one
  place.

### Added 2026-10-08 — collecting less in an attachment

Kept apart again, and this one is the hardest of the five, because **the usual move does not work here.**
Every list above reduces by choosing what to leave out of something this app composes: one title and not
the list, a code and not the reply, a count and not a log. **A file is not composed by this app.** It
arrives whole, and "collecting less" can only be about how many, how big, how long a link lives, and who
can open it — never about what is inside.

- **Private bucket, and no public URL at all.** Nothing in `attachments` is reachable by address. The
  only way in is a signed link this app makes for somebody it has already checked.
- **Five minutes, not an hour.** The shortest link that still works on a slow phone. A link is a
  credential while it lives, so its life is the thing to keep small — and it is the only control there
  is, because a signed link cannot be called back.
- **Two types and 5 MB**, so the bucket cannot quietly become a file share. And the limit is **stated for
  what it is**: Storage checks the type the upload *declares*, so a renamed file gets through, and the
  app promises the refusal rather than the contents.
- **The audience is the task's, not a new one.** No sharing, no link to send somebody, no "anyone with
  the link" setting. A file is visible to exactly the people the task is visible to, and a suspended
  person is refused — so attachments add **no new answer** to "who can see what", which is feature 5's
  whole point.
- **No file name in an error report, ever**, and nothing of the file's contents, size or type either. A
  name is free text somebody's phone chose; the Sentry section's own caveat says a scrub cannot catch
  that, so this app's code is what has to not say it.
- **Nothing goes to the AI helper.** Not the file, not its name, not how many there are.
- **Nothing is left behind, and the database is what makes that true. Decided 2026-10-08.** Deleting a
  task deletes its files first and is refused if they cannot be removed, **and the database refuses to
  delete a task that still has files** — so there is no state in which a file outlives the thing it was
  attached to. This is the same move as the usage count's 7-day window being part of the statement that
  counts: a retention rule that depends on somebody remembering is not a retention rule. Removing a
  person's files when an **account** is deleted is a requirement of **Build it 26**, which this does not
  do and does not pretend to.
- **And one reduction that is NOT taken, written here so it is a decision rather than an oversight:**
  the app does **not** strip the location and device details inside a photograph. That is the one place
  this list collects more than it has to; it needs a package to change (rule 17), and it stays available
  for later. **What was decided on 2026-10-08 instead is that the person is told**: one line beside the
  upload box, saying a photo can carry where and when it was taken and that the app does not remove it.
  Which is what "Task text: a length limit, and the request shown in the input box itself" already chose
  for the same problem in words — and the harder case, because what a photo carries is not something the
  person typed and cannot be seen on the screen they are uploading from.

### Not affected by any of these decisions

The three things below are unchanged, because there was nothing to reduce:

- **Team name.** Nothing to remove — but ask for names that do not identify the members:
  "Tuesday crew", not a family name.
- **Team membership.** Nothing to remove. It *is* the rule that enforces feature 5.
- **Sign-in audit records and session tokens.** Cannot be switched off. Never copy them into your
  own tables, and never build a feature on them.

## Two gaps this table exposes

**There is no way for anyone to delete their account.** Features 1 to 5 do not include it, which is
why **eighteen** rows above say the owner must delete by hand, or that nobody can: nine of them from
the first version, the two suspension rows added on 2026-10-04, four added on 2026-10-05 — an
invitation's status and the three error-report rows — two added on 2026-10-07, the task title sent
to Anthropic and the AI-suggestions setting, and **one added on 2026-10-08**, the daily usage count.
(Fifteen before 2026-10-07, seventeen after it; the count was made again on **2026-10-08** by reading the
table's "How a user deletes it" column for all **29** data rows, after the two attachment rows were added
and after the owner's deletion decision was recorded in them, and it came to eighteen. Every one of those
numbers was counted in the session that wrote it, not carried forward.) That is a
report, not a suggestion: as written,
this app collects personal data and offers no way out. Decide whether that is acceptable for six
volunteers, or whether the plan changes.

**Attachments added two rows to that table and nothing to this gap, which nothing else added to this plan
has managed.** Error reports added four rows that nobody can delete; the AI sections added two; the usage
count added one. The two attachment rows add **none** — a person can delete a file, and deleting the task
removes the files with it, because the owner's decision of 2026-10-08 made that the database's rule rather
than an intention. **An earlier version of this paragraph, written the same morning, said the opposite**:
that the attached file was the first row in the table whose answer was neither yes nor no, because
deleting a task would strand its own files beyond anybody's reach. That is what changed, and it is the
clearest thing this decision bought. The sentence is kept here, struck through in effect, because a gap
that closes is worth as much on the record as one that opens.

**With one condition on it, which is the account half.** "Deleting the task removes the files" covers the
route a person can actually take. **Deleting an account still has no route at all**, and the files
belonging to somebody whose account is deleted are a **requirement of Build it 26** rather than something
this build does. So attachments do not widen this gap, and they do not narrow it either: they are the
first thing added to this plan that lands exactly on it, with the per-task half solved and the per-account
half named.

Suspension makes that gap sharper rather than softer, and this is the place to say so: a suspended
person can no longer reach anything in the app, so they cannot delete their own tasks either, and
there was never a way to delete the account. Everything about their data is in the owner's hands
while the row is there.

Error reports widen it by one service: a person cannot see their own reports, cannot ask the app to
delete them, and the reports sit in a company's system outside this project. The owner can delete them
by searching for a user ID — **not yet tried** — and nothing but the owner's hand will do it.

Suggest subtasks widens it by a second service, and differently. What goes to Anthropic is not a
by-product of the app breaking: it is **something a person typed**, sent because they asked for help
with it. They cannot ask the app to pull it back — there is nothing of ours to delete — and because
nothing identifying them is sent, the owner cannot search for one person's requests either, which is
the price of sending no user ID. What Anthropic holds runs on the 30-day clock cited above and on
nothing this project controls. The consent setting in Build it 21 is what will make that a choice
rather than a consequence of pressing a button.

The daily usage count widens it a third way, and it is the smallest of the three and worth one sentence
anyway: it adds no service and leaves no company holding anything — the row is ours, and it goes with
the account — but it joins the two suspension rows as something **nobody can see through the app,
including the person it is about**. So a person cannot find out from the app how many
times it thinks they have done something, which is a reasonable price for a count that holds nothing but
a number, and is still a thing to have said rather than to have passed over.

Attachments are the first addition to this plan that **does not** widen it, and the reason is worth
keeping. A file is the largest kind of thing in this table — whatever somebody attached, possibly a
photograph carrying where its taker was standing, held in our own bucket where the operator can open it —
so on the face of it, it should have widened this gap further than any of the three above. It does not,
because the question "what happens when somebody deletes it" was asked before the bucket existed rather
than after, and the answer came back that leftovers are not acceptable. **Deleting a task deletes its
files, and the database refuses to delete a task that still has them.**

**That leaves one half, and it is the half this whole section is about.** Deleting an *account* removes a
person's files only once Build it 26 does it, and there is still no way for anybody to delete an account
at all. So attachments do not make this gap worse, and the thing that would make it better is the same
thing that would make it better for the other eighteen rows.

**Four rows are things you never chose to collect.** The sign-in audit records, both log stores and
the session tokens are created by Supabase and Vercel whether you want them or not, and they
include IP addresses. They are not in your tables and you cannot turn most of them off. The
"Personal data it will hold" section now points here so the plan does not read as though they do not
exist.

Still four, after 2026-10-05. The IP address on an error report looks like a fifth, but it is not the
same kind of thing: that one arrives because we chose to add Sentry, and Sentry has a setting that
stops it. The four above cannot be switched off at all.

Still four on 2026-10-07 as well. Everything Anthropic receives, it receives because this app chose to
send it, and not sending it is always available.

Still four on 2026-10-08, and the day added two rows that pull in opposite directions. The daily usage
count is the most chosen row in this table: it exists only because we decided to write it, in our own
database, and the whole of it is one number we picked the shape of. **What Storage records about a file
is the nearest thing to a fifth that this table has ever held** — Supabase writes that row whether we
want it or not, and it is not the row's existence we chose but the file's. It is still not a fifth, and
the line is worth drawing precisely: the four above are written **about people using the app at all**,
and they cannot be switched off. This one is written only when somebody attaches a file, and not
attaching one is always available — the same test the Anthropic paragraph above uses. What is new is
that the thing we did not choose is now **inside our own project**, which is a reason to know what is in
it rather than a reason to recount.

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
- **Unverified — the whole Suggest subtasks entry describes an intention.** Nothing is installed: no
  package, no `AI_API_KEY` in any environment, no function, and no call ever made. The Console
  workspace named Team Tasks, the 5-dollar monthly spend limit and the 1- and 3-dollar notifications
  are the **owner's report of 2026-10-07**; nobody writing this opened a dashboard, and nothing in this
  repository can show what that account is set to.
- **To be confirmed by the owner — Claude Haiku 4.5's exact dated API name.** It is to be read off
  Anthropic's models page and pinned in the code pull request. No name is written here from memory.
- **Not confirmed — whether Anthropic sends a notification at the 1- and 3-dollar thresholds.** The
  Anthropic pages read on 2026-10-07 describe what happens when a spend limit is *reached*
  (`docs/costs.md` quotes them) and say nothing about notification thresholds. Only the Console shows
  whether the two the owner reported are there.
- **Not tried — asking Anthropic to delete one person's data.** No request has ever been sent, so the
  30-day and 2-year retention figures cited above are what Anthropic publishes, not something observed
  or exercised. Nothing identifying the asker is sent, so there would be nothing to search by.
- **The AI suggestions setting — what exists, and what still does not. Rewritten 2026-10-08, which is
  what [#208](https://github.com/build-once/team-tasks/issues/208) asked for.** The sentence this
  replaces said "there is no column, no screen, no check in `suggest-subtasks`, and no production key",
  which was true when it was written on 7 October and stopped being true the next morning. Four claims,
  taken one at a time:

  - **The column exists, on staging and on production.** `20261007204900_ai_suggestions_consent.sql`
    added `profiles.ai_suggestions_enabled` and `profiles.ai_suggestions_changed_at`, the trigger that
    stamps the second, and `my_ai_suggestions()`. The owner applied it to **staging on 8 October 2026**
    and the coach read the result back through the staging read-only connector: 9 migrations recorded,
    newest `20261007204900`; the default false and not null; all 3 profile rows off; the function present
    and `security definer`. **Production has it too**, applied by
    `.github/workflows/migrate-production.yml` when PR #210 merged — run
    [37743591469](https://github.com/build-once/team-tasks/actions/runs/37743591469), whose "Apply
    migrations to production" step succeeded — **and read back the same day** through the production
    read-only connector: both columns present and off, the function present, `anon` and `authenticated`
    holding **no** table-level SELECT or UPDATE on `profiles`, `service_role` holding SELECT and **not**
    UPDATE, and **no profile rows at all**, because nobody has signed up. That read is the one that says
    what the statements left behind, which a green workflow run cannot — and the privilege half of it is
    the fact this whole feature's privacy rests on. **None of it was done or seen by the assistant**: the
    staging apply and both sets of connector reads are the owner's and the coach's, recorded in
    `evidence/build-it-21-ai-consent-migration.md` and `evidence/production-log.md`, and the production
    run's step conclusions were read with `gh run view --json`. Nobody writing this opened a dashboard.
  - **The check in `suggest-subtasks` exists in this repository and is now deployed to both projects.**
    Build it 21 part 2b added it: `withConsent` refuses a caller whose setting is off with its own
    sentence and the code `ai_suggestions_off`, and refuses an unreadable setting with the fixed sentence
    and `ai_suggestions_unknown`. Production gets every function on merge, through the same workflow.
    **Staging is deployed by hand, and on 8 October 2026 it was** — which is a change from what this
    bullet said when it was written that morning, and the sentence it replaces ("Staging is deployed by
    hand and has not been") is exactly the kind of claim this list exists to keep from going stale.
  - **And on staging the setting has been seen to refuse with it off.** The owner ran
    `scripts/staging/build-it-20-ai-checks.mjs` **before** the deploy — 37 PASS, 8 FAIL, the 8 being
    sections 2 and 7, where the deployed function answered 200 with suggestions for a person whose
    setting was off — and **after** it: 45 PASS, 0 FAIL, 0 UNVERIFIED, with the setting off answering 403
    `ai_suggestions_off`. The before-and-after pair is what makes that the deploy's doing rather than a
    coincidence. **None of it was run or seen by the assistant**: it is the coach's record of the owner's
    runs, copied into `evidence/build-it-21-ai-consent-function-and-screen.md`, and nobody writing this
    opened a dashboard or a terminal on staging.
  - **The screen exists**: `/settings`, with the switch and the words. The owner reports using it against
    staging on 8 October — off, switched on, suggestions, switched off again, all as the words say — and
    reported it as "all are right and passed", with **no screenshots**. Nobody writing this has opened it
    in a browser ([#212](https://github.com/build-once/team-tasks/issues/212)).
  - **The production key is still not installed**, and **two** of its three preconditions are still open:
    the setting has **not** been seen to refuse with it off **on production** — staging is not production,
    and production has no profile rows at all because nobody has signed up — and there is still no privacy
    page ([#204](https://github.com/build-once/team-tasks/issues/204)).

  So "seen to refuse with it off" in the order of release above is **done for staging and not for
  production**, and production is the one the order of release is about. What this repository can show by
  itself is the check refusing in Deno tests, with the task never read and a stubbed service receiving
  nothing; what settles a **deployed** refusal is a run of
  `scripts/staging/build-it-20-ai-checks.mjs`, and the production equivalent of that run does not exist,
  because rule 19 does not permit one.
- **Unverified — "Daily limits on what costs money" is now written in full and DEPLOYED NOWHERE.** The
  nine decisions in that section's table are the owner's, taken on 2026-10-08. **Rewritten twice that
  day**: once when the migration was written, and again when the counting arrived
  ([#221](https://github.com/build-once/team-tasks/issues/221)). The sentence this replaces said "there
  is no `supabase/functions/_shared/limits.ts`, `suggest-subtasks` and `invite-member` are untouched, and
  no number has ever been counted anywhere but in that sandbox", and the first two clauses stopped being
  true. Issue #221's sixth condition says this entry "can be removed"; **it cannot yet, and the reason is
  the last bullet.** Taken one at a time:

  - **The migration is applied to staging and to production.** The owner ran `supabase db push` against
    staging from PR #224's branch on **8 October 2026** (CLI 2.75.0, one migration listed) and the coach
    read the result back through the staging read-only connector: 10 migrations recorded, newest
    `20261008115900`; `usage_counts` with row-level security on and 0 policies; `count_daily_use` present,
    `security definer`, empty search path; and the privileges read off `has_table_privilege` and
    `has_function_privilege` — `anon`, `authenticated` and `service_role` all holding **no** SELECT,
    INSERT, UPDATE or DELETE on the table, and `service_role` alone able to run the function. **Production
    followed on the merge**, through `.github/workflows/migrate-production.yml`. **None of that was done or
    seen by the assistant**: it is the owner's apply and the coach's reads, copied into
    `evidence/build-it-22-usage-counts.md`. **No call to the function has been made on staging.**
  - **Both functions now count, in this repository.** `supabase/functions/_shared/limits.ts` holds 20 and
    20 and is read by both; `suggest-subtasks` counts immediately before the request to Anthropic and
    `invite-member` immediately before each send, a retry included; an error from `count_daily_use`
    refuses with its own code and sends nothing. 37 Deno tests over the bodies those functions actually
    build say so, and they were **seen to fail first** —
    `evidence/build-it-22-daily-limits-counting.md` has the red runs, the green run and the exit codes.
  - **The refusal sentence exists in three places and they agree character for character**: the function's
    `DAILY_LIMIT_MESSAGE`, `web/src/lib/suggestions.ts` for My tasks, and `web/src/lib/teams.ts` for My
    teams. `scripts/screen-state-check.mjs` section 9 compares all three.
  - **AND NOTHING IS DEPLOYED, which is why this entry stays.** Neither Edge Function with the counting in
    it is on staging or on production — the assistant deploys nothing (rule 19), staging is the owner's
    step, production follows a merge. So **no number has ever been counted in a running app**, nobody has
    ever seen the refusal on a screen, and `docs/costs.md` is still right that the vendor ceilings are the
    only thing in the way of anything actually running.

  **Decided is not the same as true, written is not the same as applied, and applied is not the same as
  deployed.** This entry stays until a staging run shows the limit refusing and the count read back off
  the table — issue #221's fifth condition, which is the owner's step and has not happened.
- **Decided, so no longer open — the four questions this list carried on the morning of 2026-10-08.** How
  long a count is kept (7 days, removed by the counting statement), whether the limits stay at 20 (they
  do), whether a retry counts (it does), and when the count is written (before the paid call, never given
  back). They are recorded in the section itself. They are named here so that somebody reading this list
  for open questions does not go looking for answers that are already above.
- **Confirmed and accepted — a 20-a-day limit does NOT keep either service inside its ceiling.** This was
  a "not confirmed" until the arithmetic was done on 2026-10-08, and the answer in both cases is **no** at
  about six people: the Anthropic worst case is above the 5-dollar monthly limit, and 20 invitations each
  is above the email service's free 100-a-day. **The owner kept both limits and kept the arithmetic**, so
  this is now a known fact rather than a gap: the vendor ceilings are the outer limit, and the daily limit
  is what stops **one person or one loop** reaching them alone. `docs/costs.md` has the numbers.
- **Still not confirmed — the input token count that half of that arithmetic rests on.** The Anthropic
  figure assumes 1,000 input tokens per call, the same assumption `docs/costs.md` has carried since
  2026-10-07, and it has never been measured. The output figure is not an assumption: it is
  `MAX_OUTPUT_TOKENS` read from the function. So the $9.30 is an upper bound on a guess, and settling it
  needs the `usage` figures from a real response.
- **Not read, and now scheduled — what limits Supabase applies to the sign-up and password-reset emails
  it sends.** Those two are the only email this app sends that `invite-member` does not, they are sent to
  people who are **not signed in**, and **nothing in Build it 22 counts them** — decided by the owner on
  2026-10-08, because there is no person's ID to key a count by, and the reset screen deliberately
  answers identically whether or not an address has an account, so counting per address would rebuild the
  exact distinction that screen refuses to make. What holds them is **Supabase's own rate limits**, and
  **reading those is Build it 25** — the owner's decision of 2026-10-08.
  [#219](https://github.com/build-once/team-tasks/issues/219) holds it, with what to read and how we will
  know it is done. No figure is written here until somebody has read the page.
- **Unverified — "Files attached to a task" describes nothing that exists.** Added 2026-10-08 for Build
  it 23 part 0, documents only. **There is no bucket**, no storage rule, no migration, no screen, no code
  and no package; **no file has ever been uploaded to any project**, and Supabase Storage is still the
  empty, unused thing `docs/architecture.md` has called it since the start. Every sentence in that section
  is a decision about what will be built, and the facts about Supabase Storage in it come from the pages
  cited there — read on 2026-10-08, with no connector and no browser used — which is how Supabase
  describes the service, not something observed in this project.
- **Decided, so no longer open — the five decisions and two acceptances this section carried when it was
  written on 2026-10-08.** Three files per task; 100 MB per person, **enforced on the server at upload**;
  only the uploader may delete a file; one line beside the upload box about what is inside a photograph;
  and **leftover files are not acceptable**, so deleting a task deletes its files and the database refuses
  to delete a task that still has them, with the account half a requirement of Build it 26. Plus the two
  that were put up to accept or reject: that a renamed file can get through (**accepted as written**), and
  that the limits do not keep this inside the egress allowance (**recorded as written, with no egress
  limit built now**). They are recorded in the section itself and gathered in its table. They are named
  here so that somebody reading this list for open questions does not go looking for answers that are
  already above.
- **ONE question the decisions created, and it is open: who clears a file somebody else attached, when the
  task has to go?** Only the uploader may delete a file, and the database refuses to delete a task that
  still has files — so on a **team** task, the creator cannot delete their own task while another
  member's file is on it, and no screen can offer them a way through. It cannot happen on a personal task.
  It is set out in "Who can read, upload and delete a file" above with the two plausible answers and what
  each costs, and **this plan does not choose between them**:
  [#234](https://github.com/build-once/team-tasks/issues/234).
- **Not confirmed — whether a refusal to delete a task that still has files also fires on a cascade.**
  The Build it 26 requirement is made self-enforcing by the expectation that deleting an account, which
  cascades to that person's tasks, would be refused the same way a direct delete is. That is a question
  about Postgres this plan has answered neither by reading nor by trying, and nothing of it is built. If
  it turns out not to fire, the Build it 26 requirement stands and is simply no longer enforced by the
  database.
- **A requirement of Build it 26, not of this one — removing a person's files when their account is
  deleted.** The owner's decision of 2026-10-08. Nothing about it is designed here, deliberately: whose
  job it is to walk a person's tasks and clear their files is Build it 26's question.
  [#235](https://github.com/build-once/team-tasks/issues/235) holds it.
- **The six Supabase Storage facts below are gathered in
  [#231](https://github.com/build-once/team-tasks/issues/231)**, with what to read or try for each and
  how somebody else can tell it is settled. Three of them decide what the code must do and one decides
  what the app may promise, so they belong before the bucket exists rather than after. The seventh —
  whether a last-opened time is recorded — is [#232](https://github.com/build-once/team-tasks/issues/232)
  and is kept apart because it is a question about personal data rather than about Supabase.
- **Not confirmed — whether Supabase Storage looks inside a file at all.** Four Storage pages were read
  on 2026-10-08 — fundamentals, file limits, creating buckets and standard uploads — and none of them says
  the contents are examined, which is **not** a page saying they are not. What is confirmed is where the
  declared type comes from: "By default, Supabase Storage determines content type from the file extension.
  You can override this with the `contentType` option". So the plan says a renamed file gets through and
  promises nothing about contents. Settling it properly needs either a Supabase page that describes
  content sniffing or an actual upload of a deliberately misnamed file to staging.
- **Not confirmed — whether `storage.objects` records the file's declared type, and where.** Presumably in
  `metadata` beside the size; no page read on 2026-10-08 says so, and presumably is not a citation.
- **Not confirmed — whether `storage.objects` has a `last_accessed_at` column.** [The Storage
  Schema](https://supabase.com/docs/guides/storage/schema/design) does not list one; the [self-hosting
  object reference](https://supabase.com/docs/reference/self-hosting-storage/get-object-info) shows one in
  an example response. The two Supabase pages disagree and nobody writing this has looked at a real table.
  **It matters rather than being a curiosity**: if the column exists and is maintained, this project will
  be holding **when each person last opened each file**, which is a fact about people that nothing in this
  plan has decided to collect. Settle it by reading the column list of `storage.objects` in a real
  project, and if it is there, decide about it the way the other rows were decided.
  [#232](https://github.com/build-once/team-tasks/issues/232) holds it, in three steps, and the last of
  them is the owner's decision rather than a reading.
- **Not confirmed — what `owner_id` on a stored object is filled with.** The column is listed on the
  schema page and compared with `auth.uid()` in the helper-functions page's policy example, which is how
  it is meant to be used; **no page read gives it a formal definition**, so "the uploader's user ID" is
  read off two pages rather than stated by one.
- **Not confirmed — whether deleting a file invalidates a signed link that has not yet expired.** It is
  reasonable to expect a deleted object to answer with nothing; no page read on 2026-10-08 says so. Until
  somebody deletes a file and then opens an unexpired link to it, the plan treats the five minutes as the
  only control there is.
- **Not read — whether Supabase meters the upload as well as the download.** `docs/costs.md` works the
  attachment arithmetic against the egress quota, which is what serving a file spends. Whether bringing
  one in counts against anything was not established on 2026-10-08, and no figure for it is written
  anywhere.
