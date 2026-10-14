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
are designed, and the code for them was written on 2026-10-08.

**AND THEY ARE LIVE IN BOTH PROJECTS, WHICH THIS PARAGRAPH DENIED UNTIL 2026-10-11.** It said they were
"**deployed nowhere**, so for anything actually running the only thing between a loop and a bill is still
the 5-dollar spend limit at Anthropic". **Both halves of that are wrong**, and
[#230](https://github.com/build-once/team-tasks/issues/230) had said so since 8 October: the migration
reached staging by the owner's hand and production by the pipeline on the merge of PR #224, and **both
Edge Functions reached staging by the owner's hand and production on the merge of PR #228** — run
[37809688847](https://github.com/build-once/team-tasks/actions/runs/37809688847), "Deploy server functions
to production: success".

**What is true of THIS feature on production, which is the narrow version and still worth having:** the
5-dollar spend limit **is** the only thing between a loop and a bill **for `suggest-subtasks` on
production**, because `not_configured` is decided before the count, so with no `AI_API_KEY` there nothing
is counted and nothing is sent. On **staging** the count is live and was seen to refuse — 429, code
`daily_limit` — at a temporary limit of 4. `evidence/build-it-22-daily-limits-counting.md` § 12 is the
record, and `docs/rate-limits.md` is where the correction is set out in full.

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
holds it, with the full list and how we will know it is done.

**And it gained a second requirement on 10 October 2026, from the owner: the privacy page must say WHERE
DATA IS HELD.** Production's database is in **West US (Oregon)**, the nightly encrypted copy is in
**Western Europe** at Cloudflare, Sentry's data region would be the **United States**, and three places
are not established at all — "A nightly copy of production" above and `docs/backups.md` → "Where the data
is held" are the record. The owner put it on **Build it 26**, which is where deleting an account arrives
and therefore where this plan already owes people two other sentences: that deletion is real, and that
copies of their data remain for up to about a fortnight. All three belong on one page. **Writing the words is the owner's**, not
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

**AND THERE WILL BE A THIRD NUMBER AND A THIRD FEATURE WORD — the owner's decision of 2026-10-11.**
**Attachment uploads get a daily count, 30 a day per person**, which "Files attached to a task" below
sets out in full and which **reverses what that section decided on 8 October**. Three things about it
belong here, in the section that owns the mechanism:

- ~~**It goes in the same config file**, so the rule above holds: three numbers, one place.~~
  **CHANGED BY THE OWNER ON 2026-10-12: IT CANNOT.** `supabase/functions/_shared/limits.ts` is
  TypeScript read by two Edge Functions, and this count is written by a **trigger inside PostgreSQL** —
  an upload has no Edge Function in its path, which is the owner's decision of 9 October. A trigger
  cannot read that file. **So the 30 lives in the migration**,
  `20261012120000_upload_daily_count.sql`, as a named constant. Putting it in limits.ts as well would
  be a second copy that nothing reads, which is worse than one copy somewhere unexpected: a number in
  a config file is a number somebody will change, and changing that one would do nothing at all.
  **The rule the config file exists for is unchanged — one limit, one place — and it is now checked
  rather than remembered**: `scripts/screen-state-check.mjs` asserts that `uploads` is not one of
  limits.ts's keys, that the 30 is in the migration once, and that the migration's refusal sentence is
  the same characters as the function's.
- **It needs a new migration**, because `usage_counts_feature_allowed` is a check constraint naming two
  words and the point of a fixed list is that adding to it is deliberate and visible.
- **And it is the first count here that is NOT about money.** The two above bound money per press; an
  upload spends **traffic**. So this section's own title stops being the whole of what it covers, and
  that is said here rather than left for somebody to notice — **where** that count gets written is the
  part nobody has settled, and "Files attached to a task" says why it is harder than it looks.

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

## A ceiling on how many tasks one person can hold

Added 2026-10-11, for Build it 25, and **decided by the owner on that day**: **at most 500 live tasks
per person.** Not a sixth feature of the list above, nothing new to press, and **nothing new leaves this
project or is held about anybody** — it adds no row, no column and no kind of data, which makes it the
smallest thing in this plan to have its own section. It is here because rule 9 asks for the plan before
the code, and because it is the first limit this app has ever had on **feature 4 itself**.

**Why. `docs/rate-limits.md` went looking for what limits each thing a bot could abuse, and this is
the row that came back emptiest:** adding a task is an `INSERT` on `public.tasks` over the Data API,
with the publishable key and the person's own session. Row-level security decides **whose** rows; two
check constraints decide the title; a trigger decides which columns may change. **Nothing decides how
many, and nothing decides how often.** So one signed-in volunteer — or one loop holding one volunteer's
session — can insert rows into production's database until it fills, and no sentence in this app would
ever say so.

**Why 500, and why it is not 20.** The two daily limits are 20 because they bound **money per press**.
This bounds a **list**, and a list is a thing a person uses: 500 is far past any volunteer's morning and
far short of a problem for the database. Somebody who reaches it has not been organising jobs. The
number is chosen to be one nobody meets by accident, because a cap a real person hits is a cap that
teaches them the app is broken.

**Live tasks, not tasks ever created.** Deleting a task frees its place at once. There is no archive in
this app and no soft delete, so "live" and "in the table" are the same thing — said anyway, because the
first thing somebody would ask is whether ticking a task off makes room. **It does not**: a done task is
still on the list, which is the whole point of the list.

**Where it is enforced, which is the half that decides whether it is real.** In the **database**, as a
count of the caller's own rows, by a `security definer` function called from the `INSERT` policy —
exactly the shape `attachments_may_add()` already has for "3 files per task" and "100 MB per
person". **Not in a screen**, because a screen can be bypassed, and **not in an Edge Function**, because
there is no function in this path and adding one would mean the browser stopped inserting its own rows.

**And that makes it the EASIER of the two limits Build it 25 adds**, which is the opposite of how the two
look. This one is a **read** — count, compare, allow or refuse — and the pattern for it is already in
this database, applied and proved. The upload count in "Files attached to a task" above is a **write**
from inside a policy, and nobody has established that is even allowed.

**What the person sees is not decided here**, beyond the one thing that must be true of it: **it says
they have reached the most this app will hold and that deleting a task makes room**, rather than "that
did not save". A refusal a person can act on earns its own words — the same argument the daily limit's
own sentence rests on, and the same shape as "You own 3 teams, the most allowed."

**What it deliberately is not:**

- **Not a rate limit.** It bounds how many a person holds, not how fast they ask. A loop refused 10,000
  times at the ceiling still costs 10,000 requests, and nothing in this app bounds that — which
  `docs/rate-limits.md` says in full and this section does not fix.
- **Not per team.** A team task belongs to the person who created it, so it counts against theirs. Three
  people in a team have 1,500 between them, and a team has no ceiling of its own.
- **Not retrospective.** Nobody has 500 tasks; production has no accounts at all. So **no existing row
  can violate it**, which is the one thing that makes this cheap to add — and the way to be sure is a
  `count(*)` per owner before the migration, which `docs/rate-limits.md` shows cannot print a row.
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
went to the owner with **five** open decisions and two things to accept or reject, all seven came back
settled the same day, and **writing them down produced an eighth question that the owner then settled
too** — the one in the "who may delete" row. **A ninth followed from the migration's review**, later the
same day, and it is the last row. Each is recorded in its place below; they are gathered here
so the whole set is in one view, the way "Daily limits on what costs money" above gathers its nine.

| | Decided |
|---|---|
| How many files per task | **3** |
| How much per person in total | **100 MB**, and **enforced on the server at upload** — which is the half that decides where the check lives |
| Who may delete a file | **The person who uploaded it, or the person who created its task. Nobody else.** Settled in two steps on the same day: "only the uploader" first, then the question that exposed ([#234](https://github.com/build-once/team-tasks/issues/234)) — and the owner's answer to that was a third option neither this section nor the issue had proposed |
| Whether the upload box warns about what is inside a photograph | **Yes — one line beside the box**, saying a photo can carry where and when it was taken and that the app does not remove it |
| Whether files may be left behind | **No. Not acceptable.** Deleting a task **deletes its files first** and is **refused if they cannot be removed**; and **the database refuses to delete a task that still has files**. Removing a person's files when an account is deleted is **a requirement of Build it 26** |
| That a renamed file can get through | **Accepted as written.** The app promises the refusal and promises nothing about contents |
| That the limits do not keep this inside the egress allowance | **Recorded as written, and no egress limit is built now** |
| **Which image types, exactly** | **Six named types in the bucket and no wildcard: JPEG, PNG, WebP, GIF, HEIC and PDF.** The ninth decision, and the only one that came from the migration's review rather than from this section: `image/*` would have admitted `image/svg+xml`, and an SVG can carry script. **HEIC is the owner's addition** — it was proposed rather than assumed, and allowed the same day. **AND THE OWNER TOOK IT BACK OFF THE APP ON 9 OCTOBER 2026**, after a HEIC photograph failed through the app and the cause was not found: the bucket still permits the type and the app offers **five** of the six. "A HEIC photograph does not work, and the app says so" below is the record |

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

**And "images" is a NAMED LIST, not a wildcard. Decided 2026-10-08, after the coach's review of the
migration, and the owner added one type to it.** The bucket accepts six types and nothing else; **the app
offers five of those six**, and the row that differs is the last one before the PDF:

| In the bucket | Offered by the app | Why it is on the list |
|---|---|---|
| `image/jpeg` | yes | the camera default almost everywhere |
| `image/png` | yes | screenshots, and anything with sharp edges |
| `image/webp` | yes | what a phone browser often produces when it re-encodes a photo |
| `image/gif` | yes | it costs nothing to accept, and people have them |
| `image/heic` | **NO — 9 October 2026** | iPhone photographs. The owner's addition of 8 October; **it failed through the app the next day and the owner decided not to pursue it.** The bucket still permits it; the app refuses it before anything is sent. See "A HEIC photograph does not work, and the app says so" below |
| `application/pdf` | yes | the form, the receipt, the letter |

**Everything else is refused, and `image/svg+xml` is the reason the list exists.** The first version of
this said "images and PDFs" and the bucket was given `image/*`, which would have accepted an SVG. **An SVG
is not a picture, it is a document, and it can carry script.** A file in this bucket is opened through a
signed link to the project's own Supabase address, so an SVG would be script running from this app's own
origin, fetched by whoever clicked it — out of a file nobody read before it was stored, which is the thing
the appendix already marks as the most sensitive row in its table. The wildcard was a convenience that
widened the one row of this plan with the least known contents, and it is gone.

**HEIC went on the bucket's list because the owner put it there, and the order matters.** The review's
words were: "say in `docs/plan.md` that other image types, including SVG and HEIC, are refused. If the
owner wants HEIC for phone photos, that is the owner's call; propose it, do not add it." It was proposed
and the owner's answer the same day was to allow it — **the intention being** that an iPhone photograph
would be accepted without the person having to convert it first, which for a group of volunteers taking
photos on phones is the difference between the feature working and the feature looking broken. **That
intention has not been delivered**, which is the subsection below; the paragraph is kept in the past tense
it belongs in rather than rewritten, because the reason the owner wanted it is still the reason somebody
should want it.

**Two neighbours of HEIC were never on the list**, and that is the limit of what was asked rather than a
reading of it: `image/heif` and `image/heic-sequence`. The owner said HEIC, which is what a phone's
settings screen calls the format; nobody has been asked about the sibling media types. Both are refused by
the bucket and by the app, which is the fail-closed direction. The "Unverified" list below carries it.

### A HEIC photograph does not work, and the app says so

**Decided by the owner on 9 October 2026, and this subsection is the whole of what is known.** It is kept
apart from the list above because the list records what was *decided* on 8 October and this records what
*happened* the next day — and the two are not the same thing.

**First, the finding that was supposed to make it work.** The owner's staging run that morning answered a
question this plan had carried as not confirmed: **Supabase does not declare a `.heic` file as
`image/heic`.** A `.heic` name with no content type set by the caller is refused with `InvalidMimeType`,
so an iPhone photograph was refused by the very list it had just been added to. The answer was for the app
to set the content type itself, from one table in `web/src/lib/attachments.ts` keyed by the file's
extension, and that table was written for exactly this.

**Then the owner tried a HEIC photograph through the app, and it failed anyway.** On the pull request's
preview, from a **Windows PC** rather than a phone, signed in with the staging accounts. Every other step
of that check list passed.

**What is known is very little, and the gaps are the point:**

- it failed;
- **what the screen said was not recorded**;
- so **whether the fault is in the app's upload path or in the bucket is not established.** The staging
  script's check that the bucket accepts `image/heic` when the caller declares it has not been run since
  it was rewritten, and that one run would halve the question.

**The owner's decision: not to pursue it now.** HEIC is an edge case for this project.

**So the app stopped saying it works, and that is all this change did.** `image/heic` came off the app's
own list, off the file chooser, and out of every sentence on screen. **A `.heic` file now gets the plain
"that kind of file can't be attached" message** — the same answer a `.zip` gets, refused by the app before
anything is sent. That is the honest answer: nobody knows why it failed, so the app claims nothing about
it either way. [#246](https://github.com/build-once/team-tasks/issues/246) records what was seen, what was
not, and the one run that would tell the two possible faults apart.

**AND THE BUCKET STILL PERMITS IT.** `image/heic` is still in `allowed_mime_types` on the `attachments`
row, untouched, so **the app's list and the bucket's differ by exactly one type**. That is deliberate:

- **changing the bucket means a migration**, applied to staging and to production, to narrow something
  that is not the known fault — and nobody has shown the bucket is at fault;
- nothing can reach the bucket except through the app, which no longer offers the type, so the wider list
  admits nothing in practice;
- and leaving it keeps the cheap test available: if the bucket still accepts the type when a caller
  declares it, the fault is in this app's path, which is where to look.

The difference is **asserted by name** rather than tolerated — `scripts/screen-state-check.mjs` requires
the app's list to be a subset of the bucket's and the one type on the bucket's side to be `image/heic`. So
a later change that quietly dropped PNG goes red, and so does one that puts HEIC back without #246's
evidence.

**What this does not change: the refusal is still about the declared type and never about the contents.**
The section below says so in full, and naming types instead of a wildcard does not move that line one
inch — it only makes the set of things the app has agreed to serve back smaller and nameable.

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

**AN UPLOAD IS NOW COUNTED TOO — 30 A DAY PER PERSON. DECIDED BY THE OWNER ON 2026-10-11, AND IT REVERSES
WHAT THIS SECTION DECIDED ON 2026-10-08.** The two paragraphs that stood here said it twice over, in
nearly the same words, and they are quoted rather than deleted because a reversal is only worth anything
if the reader can see what was reversed:

> **It is still not the daily limits of Build it 22, and still not counted in `usage_counts`.** Uploading
> a file spends nobody's money per press — it spends storage, which is a stock rather than a flow, and a
> stock is bounded by a total rather than by a rate. A count per day would be the wrong instrument:
> somebody who uploads nothing for a month and then fills their 100 MB in an afternoon has not done
> anything the app needs to stop. Nothing in "Daily limits on what costs money" above changes, and no new
> feature name is added to that table.

**That argument is still correct about STORAGE, and it was silent about TRAFFIC, which is what the
reversal is about.** A stock really is bounded by a total: 100 MB per person is the right instrument for
how much is kept, and nothing about that changes. But **uploading and deleting the same file forever
never exceeds 100 MB and spends ingress and egress every time** — and `docs/costs.md` already
records that the attachment limits do **not** keep this app inside Supabase's 5 GB monthly egress
allowance. So the 2026-10-08 paragraph answered "what stops somebody keeping too much" and nobody had
asked "what stops somebody moving too much". `docs/rate-limits.md` asked it, and this is the answer.

**The number is 30 a day, per person**, and it sits beside the two 20s rather than matching them because
it is bounding a different thing: not money per press, but traffic. Three files per task at ten tasks in
a day is a volunteer having an unusually busy morning; thirty-one is something nobody designed for.

**So "Daily limits on what costs money" above DOES change**, and in the one way that section said would
need a migration: **a third feature word**. `usage_counts_feature_allowed` is a check constraint listing
two values, and the whole point of a fixed list is that adding to it is deliberate and visible. The
appendix row for `usage_counts` changes with it.

**AND WHERE THE COUNT IS WRITTEN IS THE HARD PART, WHICH THIS DECISION DOES NOT SETTLE.** Every other
counted use in this app is written by an Edge Function immediately before it spends money. **An upload
has no Edge Function**: the owner's decision of 9 October was that the browser uploads straight to
Storage as the signed-in person, so the only thing of ours an upload passes through is
`attachments_may_add()`, called from the `INSERT` policy. Which means the count would have to be
**written from inside a policy's `with check`** — and **nobody has established that a check
expression may perform a write, or what becomes of that write when the statement it is checking is then
refused.** A count kept on a refused upload is the wrong way round; a count lost on a successful one is
worse. **That is the first question Build it 25's code has to answer**, it is on the "Unverified" list
below, and the thing that settles it is a local PostgreSQL sandbox rather than a page.

**SETTLED 2026-10-12, AND NOT BY ANSWERING IT: the count is written by a BEFORE INSERT TRIGGER on
`storage.objects`, so no write happens inside a `with check` at all.** The owner's decision, after the
question above turned up a second problem the paragraph did not know about.

**What a count inside the policy would have cost, which is the part worth keeping.**
`attachments_may_add()` is granted EXECUTE to `authenticated` — it has to be, because the `INSERT`
policy names it and a policy's expression runs with the caller's privileges — and a function in
`public` with that grant is published as an RPC. So **a signed-in person could have called it thirty
times and spent their own day without uploading anything**, and every direct call would have committed,
because there is no outer INSERT to roll it back. The realistic harm is not somebody attacking
themselves: it is a future screen that greys out the upload box by asking "can I add a file?", which
would spend a slot on every page load.

**A trigger has neither problem.** It fires only on a real INSERT, it cannot be called directly, and it
can raise a message rather than only answering false. And the question this paragraph asked becomes
moot: **a BEFORE INSERT trigger writes inside the statement it is checking, so a refused or failed
upload rolls the count back with the row** — which is the way round the paragraph wanted and could not
get. Measured, on a local PostgreSQL 17.10 database:
`evidence/build-it-25-upload-count.md`.

**And one thing the trigger needs that nothing else in this project has ever needed: the TRIGGER
privilege on `storage.objects`**, a table this project does not own. `CREATE TRIGGER` needs that
privilege and **not** ownership — measured, not remembered — so the migration **asks before it creates
anything** and a push that would be refused is refused at its first statement with nothing applied.

**Three things this does NOT change**, so the reversal stays the size it is: the 100 MB, the three per
task and the 5 MB are untouched; an upload still spends **nobody's money** at a vendor, so this is the
first entry in `usage_counts` that is not about a bill; and **nothing new leaves this project** —
the count is a row in our own database, four values wide, exactly as the other two are.

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

**And naming the six types rather than saying `image/*` is what this paragraph bought, added
2026-10-08.** It is worth joining up, because the two decisions are about the same sentence from opposite
ends. This paragraph says the app cannot promise anything about a file's **contents**; the named list in
"Limits" above is about the **set of declared types the app agrees to serve back at all**. Since a file is
served back under the type it was stored as, that set is the whole of what the app has promised to hand a
browser and ask it to render — so it is the one half of this that *can* be made small, and `image/*` was
making it large by accident. Neither decision rescues the other: a JPEG that is really something else
still gets through, and the list still cannot stop it.

**So what the app will and will not promise:**

- **It will promise** that an upload declaring anything other than those six types is refused, and that
  one over 5 MB is refused — both by Storage, not by a screen.
- **It will not promise** that what is in the bucket is really a JPEG, a PNG, a WebP, a GIF, a HEIC or a
  PDF. It cannot, and saying so here is cheaper than somebody inferring it later from a list of types.
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
| **Delete a file** | yes | **only if they attached it, or they created the task** | **no** |

**And a suspended person is refused all three**, the same way "Suspending an account" above refuses them
everything else. The database rule on the bucket has to ask `is_active()` the way the existing table rules
do; a storage rule that forgot it would be a new way round a control the plan says is total. **A
suspended person cannot delete their own attachments either**, which is the same sharpening of the
account-deletion gap that suspension already causes for tasks, and the "Two gaps" section below now says
so about files too.

**Who may delete a file: the person who uploaded it, or the person who created its task. Nobody else.
Decided by the owner on 2026-10-08**, and it is **the owner's third answer rather than either of the two
this section originally offered** — which is worth recording, because the question it settles was one the
plan found rather than one it was asked.

**What the question was.** This section was first written proposing "only the uploader", chosen against
"anyone who can see the task". The owner took "only the uploader" on 2026-10-08 — and writing it down
beside the deletion decision below exposed a case neither answer covered. Alice creates a task in a team;
Bob attaches a photo. Only Alice may delete the task (feature 4); only Bob may delete his file; and **the
database refuses to delete a task that still has files**. So **Alice could not delete her own task**, and
no screen could offer her a way through, because the only person who could clear the obstacle was Bob. It
could not happen on a personal task — nobody else can see one, so its creator is its only possible
uploader — and on a team task it was not rare but normal. It went back to the owner as
[#234](https://github.com/build-once/team-tasks/issues/234) with the two answers the plan could see, and
the answer that came back was neither.

**The rule now, in one line: a file may be deleted by its uploader, or by the creator of the task it is
on.** Which is to say the task's creator is the custodian of the task *and everything hanging off it*,
and that is the same person feature 4 already trusts with destroying the task outright.

**Three things it gets right, and they are the reason it beats both of the originals.**

- **The deadlock is gone, without an exception.** Alice may delete Bob's file because she created the
  task, so deleting her own task is something she can simply do. No code path needs permission the person
  does not have, and no screen has to explain a thing a person cannot fix.
- **It gives the task's creator almost nothing new.** She could already destroy Bob's photo by deleting
  the whole task — feature 4 has always let her, and the deletion decision below means the files go with
  it. What she gains is the *finer* version of a power she had: removing one file and keeping the task.
  That is a real addition and a small one, and it is the right size.
- **It keeps the reason "only the uploader" was proposed in the first place.** That reason was feature
  4's: "only the person who created a task can delete it, so nobody loses an entry because somebody else
  tidied up." **The person it protects against is a team mate at large** — Carol, who is in the team,
  can see the task, and did not create it or upload the file. **Carol still cannot delete anything**, and
  "anyone who can see the task" would have let her. So the protection survives; what changed is that it
  is not also aimed at the one person who owns the thing the file is attached to.

**What it costs, stated rather than left to be discovered.** Bob's photo can be removed by somebody
other than Bob, and he is not asked and not told. That is a genuine loss against "only the uploader" and
the plan does not pretend otherwise — it is bounded by the fact that the person who can do it is the one
person who could already have taken the whole task away, and by Bob being able to delete his own file
whenever he likes.

**And one case is now narrower but not gone: a file nobody wants, on a task nobody will delete.** If Bob
attaches something unwanted to Alice's task, Alice can remove it. If Bob attaches it to **his own** task
in the team, only Bob can — he is both uploader and creator. So the operator in the dashboard is still
the last resort, for a smaller set of cases than before.

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

1. **The app deletes all the files, then the task — under the creator's own rights — and refuses the
   whole thing if any of them cannot be removed.** Not "tries and carries on": a file that would not
   delete means the task stays, and the person is told.

   **"Under the creator's own rights" is the clause that matters, and it is the owner's decision of
   2026-10-08.** The deletion runs **as the person asking**, with no more authority than they have
   sitting at the screen — and it works because the rule above gives a task's creator the right to delete
   the files on it. So **nothing in this app needs a privileged delete path**: the thing that permits it
   is a database rule a reviewer can read, not code that acts on somebody's behalf with more power than
   they have. That is the same preference this plan shows everywhere else — "the database is what
   actually stops Bob" — applied to a destructive action rather than a read.

   **And the order has two reasons now, not one.** The first is failure: files-then-task can fail halfway
   and leave a task with fewer files than it had, which is visible and recoverable, where task-then-files
   fails halfway and leaves exactly the orphan this decision exists to prevent. The second arrived with
   the rights decision and is sharper — **the creator's right to delete the files comes *from* the task**.
   Delete the task first and that right vanishes with it, along with any way of asking who created the
   task the file hangs on. So the order is not a preference; it is the only order in which the permission
   exists.
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
remember and becomes something they cannot get past. **Confirmed later the same day, by trying.** This
paragraph said "**Not confirmed**: nobody has built or tried this, and whether a refusal fires on a
cascade the way it fires on a direct delete is a question about Postgres that this plan has not answered
by reading or by trying." It has now been built — the trigger in
`supabase/migrations/20261008191804_attachments_bucket.sql` — and tried:
`evidence/build-it-23-attachments-bucket.md` section 8.5 shows the account deletion refused, with the
cascade's own statement as the error's context. **On a local PostgreSQL sandbox, and the migration is
applied nowhere**, so it is a property of PostgreSQL rather than something seen on Supabase. The
"Unverified" list below carries both caveats.

**And what "refused" can now mean has narrowed, which is the second thing the rights decision bought.**
Before it, the most likely reason a file could not be removed was **permission** — somebody else's file
on your task, with no way through. That reason is gone: a task's creator may delete every file on their
own task. So a refusal now means something went **wrong** rather than something is **not allowed** — a
storage error, a request that did not arrive — which is a failure a person can reasonably retry, and a
different conversation from being told they are powerless.

It still has to mean something a person can act on. A delete that fails with nothing useful behind it is
worse than one that leaves an orphan, because the person tries again blindly. What the screen says is not
written here, beyond the one thing that must be true of it: **it says the task was not deleted**, plainly,
rather than failing quietly and leaving somebody to find the task still there.

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

**AND THERE IS A FOURTH CASE, FOUND ON 10 OCTOBER 2026 AND MISSING FROM THIS SECTION UNTIL THEN:
production having to be restored.** The three above are all about somebody *doing* something. This one is
about the project failing, and it was not asked when this section was written because the section assumed
production's data is backed up. **The files were not.**
[#248](https://github.com/build-once/team-tasks/issues/248) is the finding: production's backups cover the
database and **not** the bucket — "Database backups do not include objects you store via the Storage API,
as the database only includes metadata about these objects"
([Database Backups](https://supabase.com/docs/guides/platform/backups), read 2026-10-10), which is also
what the owner read on the dashboard page itself on 10 October 2026.

**What losing them would mean, plainly.** A restore would bring back the `tasks` rows and the
`storage.objects` rows that both say a file is there, pointing at bytes that are gone — so the app would
show files nobody can open, which is a worse answer than showing none. And a file is the one thing in this
app **nobody can retype**: task text, team names and memberships are all things a person could put back,
and a photograph of a job that has since been done cannot be taken again.

**What is being done about it: "A nightly copy of production, held by another company" below**, which
copies the bucket as well as the database. Two things about it belong here rather than only there, because
they are about files specifically:

- **A deleted file stays in older copies until they expire** — about a fortnight on the proposal there. So
  "nothing is left behind", decided on 2026-10-08 and enforced by the database, is a promise about **this
  app**, and the copies are outside it. Both statements are true and the second does not weaken the first:
  nothing in the app or its bucket outlives its task, and a backup that honoured deletions would have
  dutifully honoured the wrong one too.
- **The copy does not remove what is inside a photograph either**, any more than the app does — "What is
  inside a photograph" below says the file is stored as it arrives, and it is copied as it was stored.

**THE JOB HAS NOW RUN, AND THE ONE FILE IN PRODUCTION IS IN THREE COPIES.** This paragraph said "**The
job is built and has never run against production**, so for the files this gap is open exactly as it was:
no copy of them exists anywhere", and that stopped being true on 10 October 2026: two copies by hand, and
a third **by the schedule** on 11 October. So for the files the gap is no longer open — it is **narrowed
to the window between copies**, which is the thing that has a measured number on it rather than an
intention. `docs/backups.md` → "The two targets" is that number: **about a day and a quarter on a normal
night**, because the first scheduled run started 5h 57m 24s late, and **about two and a half days** if
GitHub drops a run. That page is the full map of what is covered today and what is not, and
`docs/restore-runbook.md` is what to do with a copy.

**AND A COPY HAS NOW BEEN PUT BACK — 10 to 11 October 2026.** The sentence that stood here said the
runbook "still ends in the one thing nobody has done: **no restore has ever finished**, so what exists is
three copies and no proof that a copy can be put back." There is proof now: the owner restored the copy
of 10 October into a new project, **and opened the attachment in the app**. For the files, which is what
this section is about, that is the half that mattered — a restore of the rows alone would have brought
back `storage.objects` rows pointing at bytes that were gone, which is the failure
[#248](https://github.com/build-once/team-tasks/issues/248) describes from the other end.
`evidence/restore-tested.md` is the record.

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

## A nightly copy of production, held by another company

Added 2026-10-10. Not a sixth feature of the list above, and **nobody using the app gets a new button**:
the five things stay five, and there is no screen anywhere in this. It is in the plan because it sends
**everything this app holds about everybody** out of this project, to a company that was not part of it
yesterday — which is the same reason the Sentry, Anthropic and attachment sections are here, except that
those three send a sliver each and this one sends the lot.

**What it is.** Every night, the whole production database and every file in the `attachments` bucket
are copied, **encrypted on GitHub's runner before either leaves it**, and written to a **private
Cloudflare R2 bucket named `team-tasks-backups`**, in Cloudflare's **Western Europe (WEUR)** region. The
bucket's public development URL is **disabled** and it has **no custom domain**, so nothing in it is
reachable by address — the owner's report of 10 October 2026, and the coach saw that settings page.

**"Every night" is NIGHTLY-ISH, and that is measured rather than hedged — 11 October 2026.** The first
run the schedule started by itself asked for 01:23 UTC and was created at 07:20:24Z: **5h 57m 24s late**.
The job takes 38 seconds, so the lateness is GitHub's queue and not the work. GitHub's own page says the
`schedule` event "can be delayed during periods of high loads", that "high load times include the start
of every hour" — and, the sentence that matters more, **"If the load is sufficiently high enough, some
queued jobs may be dropped"** ([Events that trigger
workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows),
read 2026-10-11). So a night's copy can be **late by hours or not happen at all**, and nothing in this
design can currently tell the difference between a dropped run and a schedule that has stopped working.
What that costs is written as a number in `docs/backups.md` → "The two targets" rather than as a word
here: **about a day and a quarter on a normal night, about two and a half days if a run is dropped.**

**Why, in one line.** Supabase's own daily backups cover the database and **not the files**: "Database
backups do not include objects you store via the Storage API, as the database only includes metadata
about these objects" ([Database Backups](https://supabase.com/docs/guides/platform/backups), read
2026-10-10), which the owner also read on the dashboard page itself. So the one thing in this app nobody
can retype is the one thing nothing backs up.
[#248](https://github.com/build-once/team-tasks/issues/248) is that gap, and **this nightly copy is
exactly what it is for.** `docs/backups.md` is the full map of what is covered and what is not, and it
says which of #248's conditions this meets and which it does not.

**WHERE ALL OF THIS PHYSICALLY IS, recorded 2026-10-10 because a copy of everything that crosses an
ocean is the point at which "where" stops being a detail.** Production's database — and with it the
accounts and the `attachments` bucket, which live in the same project — is in **West US (Oregon),
`us-west-2`**, from the **owner's screenshot** of that day; the nightly copy is in **Western Europe**.
So the copy lives in a different part of the world from the thing it is a copy of. **It is ciphertext
the whole way**, which is what makes that acceptable rather than merely true, and a copy surviving a
regional failure is the more useful of the two arrangements for a backup — but **nobody chose the
pairing on purpose**, and `docs/backups.md` → "Where the data is held" is the full table, including the
three places nobody has established at all. **And people have to be told: Build it 26's privacy page
must say where data is held** — the owner's instruction of 10 Oct 2026, which is now one of the things
[#204](https://github.com/build-once/team-tasks/issues/204) carries.

**Cloudflare is a new company holding this app's data, and the whole of what it holds is ciphertext.**
That is the difference from the other three outside services, and it cuts both ways. Sentry would hold
readable error reports and Anthropic holds readable task titles; Cloudflare holds a file it cannot open.
What it does hold is **the fact that this project exists, how big its data is, and when the job ran** —
which is not nothing, and is the honest limit of "encrypted form only".

### What a copy contains, and what it does not

**Contains:**

- **Every table.** All seven — `tasks`, `teams`, `team_members`, `invitations`, `profiles`,
  `account_status`, `usage_counts` — counted in the session that wrote this by reading
  `supabase/migrations/`. So: every task's text, every team name, who is in which team, every pending
  invitation's address and hashed token, everybody's nickname and AI-suggestions setting, any suspension
  **and the owner's reason for it**, and the daily usage counts. The two tables the appendix says nobody
  can read through the app — `account_status` and `usage_counts` — are in the copy like everything else.
- **The accounts, with their password hashes.** Supabase Auth's own tables: the addresses, the hashed
  passwords, the sessions and the sign-in audit records with their IP addresses. **This has to be said
  explicitly because the obvious tool silently leaves it out**: `supabase db dump` "Runs `pg_dump` in a
  container with additional flags to exclude Supabase managed schemas. The ignored schemas include auth,
  storage, and those created by extensions"
  ([`supabase db dump`](https://supabase.com/docs/reference/cli/supabase-db-dump), read 2026-10-10). A
  copy built on that command would contain no accounts at all, and would look complete.
- **Every attached file**, as uploaded — including, in a photograph, the place and moment it was taken,
  which "What is inside a photograph" above says this app does not remove. A copy does not remove it
  either.

**Does not contain:**

- **The server functions' secrets.** Not the service-role key, not `EMAIL_API_KEY`, not `AI_API_KEY`.
  Those live only in each Supabase project's function settings and **a backup of a secret is another copy
  of a secret** — the thing `docs/architecture.md` and `docs/secrets.md` both exist to prevent. Losing one
  is answered by re-issuing it, not by restoring it.
- **The deploy credentials**, for the same reason. Nor the passphrase below, which would be a copy of the
  key inside the thing it locks.
- **The outside services' own data.** Resend's sending logs, Sentry's error reports and whatever
  Anthropic holds are each that company's records, outside this project, on their own clocks. Nothing here
  copies them and nothing here could.

### Who can open a copy

**Only somebody holding both halves**: the **storage key**, which gets the file out of R2, and the
**passphrase**, which decrypts it. Either alone is useless — the key gets you ciphertext, and the
passphrase gets you nothing without the file.

**The passphrase is in two places and nowhere else.** The owner's report of 10 October 2026: generated on
the owner's own PC, kept in the **owner's password manager**, and set as a **GitHub environment secret**
(`BACKUP_PASSPHRASE`, in the `supabase-production` environment). Not in this repository, not in a `.env`
file, not in Supabase, not in Cloudflare, and never in a chat (rule 7).

**And only one of those two can be read back.** A GitHub Actions secret cannot be displayed once set — it
can be overwritten and a workflow can use it, and that is all. So the password manager holds **the only
readable copy in existence**.

**If the passphrase is lost, no copy can be opened.** Not by the owner, not by Cloudflare, not by
anybody, and there is no recovery, no reset and no support request that helps. Every file in that bucket
becomes bytes. That is the price of encrypting before the data leaves the runner, and it is the right
price — the alternative is this app's whole database, accounts included, sitting readable at a company
on a key somebody else holds — but it makes the passphrase **the most valuable string in this project**,
ahead of the service-role key, because a leaked key can be rotated and a lost passphrase cannot be
recovered.

**The coach and the coding assistant never receive a backup file, any part of one, or the passphrase.**
Rules 1 and 10 already say the assistant has no production access; this says the same thing about the
one new artefact that *is* production data in a file, so nobody has to reason it out from the general
rule.

### How long copies are kept, and how old ones are removed — DECIDED 2026-10-10

**Decided by the owner on 2026-10-10: 14 daily copies, removed by a Cloudflare R2 object lifecycle rule
and never by the job.** This section was written as a proposal the day before and is kept in the shape it
was argued in — the reasons, and the two options not taken — because that is how every other retention
decision in this plan is recorded: the invitation's 7 days and the usage count's 7 days both keep their
alternatives.

| The decision | Why |
|---|---|
| **14 days** | It is twice Supabase's own window for the database — "Pro Plan projects can access the last 7 days of daily backups" — and a fortnight covers a holiday, which is the realistic shape of "nobody noticed for a while" in a volunteer group of six. It is the shortest window that still answers "it was already wrong a week ago" |
| **Removed by a lifecycle rule, not by the job** | R2 can delete on its own: "you can create an object lifecycle rule to delete objects after 90 days", and a rule "can specify which prefix you would like it to apply to" ([Object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/), read 2026-10-10). So the **job never deletes anything** — and retention cannot drift, because it is not a step anybody can forget or a script anybody can break. It is the same preference as the usage count's window being part of the statement that counts, reached a different way |
| **And the window is "14 days, plus up to a day"** | Cloudflare's own words: "Objects will typically be removed from a bucket within 24 hours of the `x-amz-expiration` value." So a copy can live a fifteenth day. Stated rather than rounded away, because the deletion consequence below is measured in exactly this number |

**The two not taken**, kept so the question is not re-argued from scratch later:

| Not taken | Why not |
|---|---|
| **7 days**, matching Supabase | Collects least, which is this plan's bias. But both windows then end at the same moment, so a problem that is a week old has no copy from before it anywhere — and the storage it saves is free either way |
| **Keep a weekly or monthly one for longer** | The usual shape, and wrong here. A copy older than a fortnight is a copy of a volunteer's task list from last month: of almost no use for recovery, and a month of somebody's data held past the point anybody would look at it. **If the owner wants it, this is the line to come back to**, and the deletion consequence below gets correspondingly worse |

**It costs nothing on Cloudflare's free tier at the plan's group size**, and `docs/costs.md` has the
arithmetic, the quotas as published, and the headcount at which it stops being free.

### And a 13-day Bucket Lock beside it — PROPOSED 2026-10-10, for the owner to decide

**The owner decided on 2026-10-10 to leave the R2 token as it is** — `team-tasks-backup-job`, Object Read
& Write, limited to this bucket — **and asked instead what an R2 Bucket Lock rule does and, if it prevents
deletion and overwriting until an age, for a 13-day lock to be proposed alongside the 14-day lifecycle
rule.** It does, and here it is.

**What Cloudflare says it does**, read on 2026-10-10 from
[Bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/) and cited rather than
remembered:

| | Cloudflare's own words |
|---|---|
| What it prevents | "Bucket locks prevent the deletion **and overwriting** of objects in an R2 bucket for a specified period — or indefinitely." |
| How long for | Three kinds of condition: an **Age** (the page's own example is `"condition": {"type": "Age","maxAgeSeconds": 604800}`, which is 7 days), a date to retain until, or indefinite |
| Which objects | "Each rule specifies which objects it covers (via prefix)", "Rules without prefix apply to all objects", and — the sentence that matters for a bucket that already has copies in it — "Rules apply to both new and existing objects in the bucket." |
| How many | "A bucket lock configuration can include up to 1,000 rules." |
| **What happens when it meets the lifecycle rule** | "Bucket lock rules take precedence over lifecycle rules. For example, if a lifecycle rule attempts to delete an object at 30 days but a bucket lock rule requires it be retained for 90 days, the object will not be deleted until the 90-day requirement is met." |

**So: a 13-day Age lock — `maxAgeSeconds` 1,123,200 — alongside the 14-day lifecycle rule.**

**Why 13 and not 14, which is the whole of the arithmetic.** The last row above is the reason. A lock
takes precedence over a lifecycle rule, so a 14-day lock against a 14-day deletion asks the two
conditions to be satisfied at the same instant — and retention is not a thing to bet on a tie. **13 gives
a full day of margin and costs a day of immutability**, which is the right way round: the lock is there
for the twelve days after a copy is written, not for the hour before it expires.

**What it buys, and it is more than a narrower token would have.** For **13 of a copy's roughly 14-day
life, nothing can delete or overwrite it** — not the backup job, not a mistake in a later version of the
workflow, not somebody who has taken the storage key. That last one is the case worth naming: **a stolen
`BACKUP_STORAGE_KEY` is a key that can read the copies and cannot destroy them**, which is exactly the
protection narrowing the token was reaching for. And it is **strictly stronger**, because a
write-without-delete permission would still permit *overwriting* a copy with rubbish, and this does not.

**And the backup job cannot change the lock.** Editing a lock needs "An API token with permissions to
edit R2 bucket configuration" (the lock page), and the permission that carries that is **Admin Read &
Write**, described as allowing "the ability to create, list, and delete buckets, **edit bucket
configuration**, read, write, and list objects, …" ([R2 API
tokens](https://developers.cloudflare.com/r2/api/tokens/), read 2026-10-10), where **Object Read &
Write** — what the job's token has — is described only as "the ability to read, write, and list objects
in specific buckets". *That last comparison is read off two pages rather than stated by either*, which is
the same care `docs/plan.md` already takes about `owner_id`: the Object scope's description does not
mention bucket configuration, and the Admin scope's does.

**What it costs, and the first of the two is the reason this is a proposal and not a decision:**

- **It may not be undoable.** **Not confirmed**: the lock page read on 2026-10-10 carries **no statement
  that a rule can be removed or shortened**, and no warning that it cannot. A lock is a promise about
  immutability, so a mechanism that let anybody shorten it would be a weak promise — which is a reason to
  expect it is hard rather than evidence that it is. **So a wrong rule may be unfixable for its own
  duration.** The cheap way round that is to set a **short** Age first — a day — see that it refuses a
  delete, and only then set 13.
- **Nobody can purge a copy early, including the owner.** That is the point of it and it is also a real
  loss, and the deletion section below now says so rather than leaving it to be discovered.

**It is proposed for the whole bucket rather than a prefix**, because everything in `team-tasks-backups`
is a backup and there is nothing in it that should be deletable sooner. If copies are ever given a prefix,
the rule gains the same prefix as the lifecycle rule and the two stay in step.

### What this means for deletion, which is the part a person would care about

**A deleted account or a deleted file stays in older copies until those copies expire.** Plainly: if
somebody deletes a photograph today, the copies from the last fortnight still have it, and the one made
tonight will not. So "deleted" means *deleted from the app*, and the data is actually gone **up to
fifteen days later** — the 14 of the window plus the day Cloudflare's own page allows for removal.

**Nothing in this plan pretends otherwise, and nothing can make it otherwise.** A backup that excluded
whatever somebody had deleted would not be a backup: the case it exists for is "something deleted the
wrong thing", and a copy that honoured deletions would have dutifully honoured that one too.

**Which means Build it 26 has to say it to users, and this paragraph is the requirement.** That build is
where deleting an account arrives (and where removing that person's files is already a requirement —
"What happens to a task's files when things change" above, and
[#235](https://github.com/build-once/team-tasks/issues/235)). Whatever it tells somebody who deletes
their account must say that **copies of their data remain for up to about a fortnight and then go**,
because a person who is told "deleted" and means it has been misled by a true-sounding word. It is the
same shape as the consent setting's own sentence — "switching it off stops any further sending at once …
It does not recall what was already sent, and it cannot."

**And it sharpens the gap the appendix already names.** There is still no way to delete an account in
this app, so there is nothing to attach that sentence to yet. What this section adds is that when there
is, the sentence is not optional.

**AND THE PROPOSED 13-DAY LOCK MAKES THAT WINDOW A FLOOR AS WELL AS A CEILING, which is the one thing
about it worth arguing over.** Without a lock, "up to about a fortnight" is how long the copies *happen*
to keep something — and if somebody ever asked for their data to be gone sooner, the owner could delete
the copies by hand. **With a 13-day lock, nobody can**, the owner included: that is what a lock is. So the
fortnight stops being an outer bound and becomes a promise in both directions, and the sentence Build it
26 has to write is "for up to about a fortnight" rather than "we will clear them if you ask".

**That is the trade, stated plainly: a copy that cannot be destroyed by a stolen key is also a copy that
cannot be destroyed for somebody who asks.** The reason this plan leans the first way is the shape of the
risk at six volunteers — the realistic threat to a backup is a mistake or a leaked key, and nothing in
this app's life so far has produced an erasure request — but it is the owner's call, it is why the lock is
a proposal rather than written in as decided, and **this paragraph is the one to come back to the first
time somebody asks.**

### The restore drill

**A copy nobody has restored is a belief about a copy**, so the drill is part of this and not a later
nicety. `docs/backups.md` has what a run must establish and what must be written down; this is where it
may happen and what never leaves.

- **Into a new temporary project, created for the drill and deleted the same day.** Not kept in case it
  is useful: a second live copy of production's data is a second thing to protect and nobody is watching
  it.
- **In the Pro organisation, decided by the owner on 2026-10-10.** Not the free organisation staging lives
  in, which would have been £0 and allows a second project — because that puts production's real data in
  the organisation the coding assistant has keys for, and the rule in the bullet below is not a rule you
  keep to the letter and break in spirit. The Pro organisation's compute is **hourly**, so a drill costs
  **5 to 33 cents** and a forgotten project costs about $10 a month: `docs/costs.md` has both figures, and
  **deleting the project is part of the drill rather than tidying up afterwards.**
- **Never into production**, which rules 1 and 10 forbid anyway.
- **Never into staging.** This is the one that needs saying out loud, because staging is the convenient
  answer. `docs/environments.md`'s own rule is "Production data is never copied to local or staging", and
  staging is the one project the coding assistant has keys for — so a restore there would put real
  volunteers' task text within reach of the assistant and beside the Alice / Bob / Carol accounts.
- **The coach and the coding assistant never receive a backup file**, any part of one, a decrypted dump,
  or a row out of a restored project. The drill is the owner's from start to finish; what this repository
  holds is the procedure and the evidence of a run — counts, timings, pass or fail.

**It is also the only thing that can settle one of the two launch items, and IT HAS.**
`checklist/launch.json` has carried `backups-on` and `restore-tested` the whole time. The drill of 10 to
11 October 2026 was run, every rule above was kept, and **`evidence/restore-tested.md` now exists**, so
`restore-tested` is no longer TODO. `evidence/backups-on.md` still does not, so the other half of
[#249](https://github.com/build-once/team-tasks/issues/249) is open.

### What a restore brings back, and what it does not — DECIDED 2026-10-11

**Added after the first finished drill, and it is a decision about people rather than about code.** That
drill reported "every table matched except three", and two of the three were **sign-in sessions** — rows
that were never going to come back, because the rows they point at were not restored either.

**The owner's decision, 11 October 2026: sign-in sessions are not restored. After a recovery, everybody
signs in again.** Which means a restore now promises a **named set**, and says plainly what is outside
it:

| | |
|---|---|
| **Brought back, and a difference is a failure** | every table in `public` — so every task, team, membership, invitation, nickname, suspension and usage count; **the accounts**, with their hashed passwords, so people can sign in at all; **what Storage records about each file**; and **the files themselves**, byte for byte |
| **Not brought back, on purpose** | **sign-in sessions and refresh tokens** — so everybody signs in again; **the sign-in log**, with its IP addresses, which the appendix already says nothing should be built on; **confirmation and reset links in flight**, because every one of them is a credential with a clock on it and restoring one would restart the clock; and Supabase's own bookkeeping, which a new project brings with it |

**Nobody loses anything they typed**, which is the whole of what this costs. What they lose is being
already signed in, on the one day the app has been rebuilt from a copy.

**And it is a thing to tell people, not only a thing this plan knows.** Whatever Build it 26's privacy
page says about recovery — it already owes people two sentences there, about deletion being real and
about copies remaining for up to about a fortnight — this is the third: **after a recovery you will be
asked to sign in again.** [#204](https://github.com/build-once/team-tasks/issues/204) carries it.

**No new kind of data, and nothing new leaves the project.** This section adds nothing to the appendix:
it says which of the rows already in it a restore puts back. `docs/backups.md` → "What a restore
promises" is the table, with a reason per table, and the runbook's step 4 is the same thing for somebody
in the middle of a bad day.

### The job reads all of production's data, so what stops it keeping or printing any

**There is no narrower version of this job**: a copy of everything is a read of everything, which makes
it the most powerful thing that will ever run in this repository's CI. Six things hold it, and they are
listed rather than summarised because a summary is where one of them goes missing:

- **Nothing is echoed but names, byte counts and statuses.** This repository is public, so its run logs
  are. No sample row, no row counts of real tables, no `set -x`. It is the rule
  `.github/workflows/migrate-production.yml`'s smoke-test job already follows and writes down.
- **No artifact, ever.** `actions/upload-artifact` is not used at all. An uploaded dump would be a
  downloadable copy of production's whole database, and on a public repository it is downloadable by
  anybody who can read the repository. This is the easy mistake and the worst one.
- **The plaintext exists only in the runner's temporary directory**, never in the checkout, so there is
  nothing for a later step to commit — and the runner is destroyed when the job ends.
- **Only the encrypted file leaves.** Encryption happens on the runner, before the upload, which is what
  makes the sentence "Cloudflare holds it in encrypted form only" true rather than hopeful.
- **Secrets arrive through `env:` and are never put on a command line.** The passphrase is read from the
  environment inside the script and used in memory, and the database password reaches `pg_dump` through
  libpq's own `PG*` variables, so **no argument ever carries it** — which is a better answer than the
  "standard input or a file descriptor" this bullet proposed, and was arrived at by writing it. Every
  setting gets a "set and non-empty" check before anything is read, printing only its **name** — the
  pattern the production workflow uses, for the reason it gives: a deleted or renamed GitHub secret
  expands to an empty string rather than raising an error.
- **No pull request can run it, and a branch cannot reach the credentials.** No `pull_request` trigger,
  and the `supabase-production` environment, whose deployment branches are limited to `main`.

  **This bullet said "a `schedule` trigger only, no `workflow_dispatch`" until Build it 24 part 1, and
  the job has one.** [#258](https://github.com/build-once/team-tasks/issues/258) — the owner's, and
  later than this section — asks for it in those words: "Runs nightly on a schedule and by hand." What
  the original sentence was protecting is unchanged and is protected by the **environment** rather than
  by the absence of a trigger: a manual run started from any branch but `main` is handed no secrets at
  all and stops at the first settings check. A pull request cannot start it either way. That is the
  shape `.github/workflows/drift-check.yml` has run in since Build it 15, and the reason "by hand" is
  worth having is the obvious one — taking a copy **before** a risky migration, rather than finding out
  tomorrow that you wanted one.

**And what it reads production with, decided by the owner on 2026-10-10.** The database half uses
`PRODUCTION_SUPABASE_DB_URL`, which already exists. The files half needed a credential that did not, and
the answer is **a Supabase S3 access key for the production project, held as GitHub environment secrets in
`supabase-production` and nowhere else** — **accepted with its stated cost**, which is Supabase's own
sentence about such keys: they "provide full access to all S3 operations across all buckets and bypass RLS
policies" ([S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication), read
2026-10-10). **And never the service-role key**, which was the alternative and is refused for one reason:
that one can write to `tasks`. A backup credential should not be able to change the thing it is backing
up. `docs/architecture.md` → "The nightly copy" has the detail and the two secret names.

**And the cost that none of those removes.** For the few minutes the job runs, **production's entire
database — every address, every task, every password hash — is in plaintext on a machine this project
does not own.** That is true of any copy made this way; it is why the encryption happens on the runner
rather than after the upload, and why the job does as little as possible between the dump and the
encryption. It is stated here rather than in a footnote because it is the real price of the design.

**A silent failure is the other thing to design against, and it is now decided.** A backup job that
quietly stopped would manufacture confidence rather than lose data, which is worse. **Decided by the owner
on 2026-10-10: a failed run OPENS A GITHUB ISSUE, the way `.github/workflows/drift-check.yml` already
does, in addition to GitHub's own failure email.** Both, not either — the email is what reaches a person
on the day, and the issue is what is still there a week later when the email has been scrolled past.

**Which means it follows a pattern that already exists in this repository rather than inventing one**, and
that is most of why it is the right answer. `drift-check.yml` runs on a schedule, holds
`issues: write` beside `contents: read`, writes its report to a file and passes it with
`gh issue create --body-file` (rule 12), and **matches an open issue by exact title so a daily failure
comments on one issue instead of opening thirty.** The backup job does the same, with its own fixed
title. Two things have to be true of what the issue says, and they are the same two that are true of
every other sentence in this design: **it names what failed and when**, and **it carries no row, no path,
no file name and no part of any secret** — because an issue on a public repository is as public as the
run log.

Related, and not solved by any of that: GitHub disables scheduled workflows in a public repository "when
no repository activity has occurred in 60 days"
([Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows),
read 2026-10-10), so **"nothing has run for two months" is a state this design can reach** — and it is a
state in which there is no failed run to open an issue about. `drift-check.yml`'s own comment names the
same trap: "If this check goes quiet, that is the first thing to look at."

## A CAPTCHA on the three sign-in screens

Added 2026-10-11, for Build it 25, at the owner's instruction in
[#281](https://github.com/build-once/team-tasks/issues/281). Not a sixth feature of the list above, and
nobody gets a new button: it is a box that appears on three screens people already use. It is in the plan
because it is a **new outside company that sees something about every visitor to those screens**, which
is the same reason Sentry, Anthropic and Cloudflare R2 are each here — and because rule 9 asks for the
plan before the code. **Nothing is installed on the day this was written:** no package, no site key in any
environment, no secret key in either project's Auth settings, no widget on any screen, and no code.

**AND THE CODE ARRIVED THE SAME DAY — Build it 25 part 1, [#284](https://github.com/build-once/team-tasks/issues/284).**
The sentence above is kept in the tense it was written in, because the order it records is the order rule
9 asks for; what is true now is different and is said here rather than by rewriting it. **What exists:**
the widget and the submit button that waits for it, on all three screens
(`web/src/app/components/CaptchaGate.tsx`); the token travelling to Supabase with all three requests;
the setting `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, which a Vercel Production or Preview build now refuses to
go without; and **no new package** — rule 17 never came up, because the whole of the interface is a
script tag and three function calls. **What still does not exist, and it is everything that is not
code:** no Turnstile account or widget, no site key in any environment, no secret key in either
project's Auth settings, and nobody has seen a rendered widget. **With no site key the three screens are
exactly what they were**, which is what lets this reach production before the owner's last step rather
than instead of it.

**AND EVERY WORD OF THAT LAST LIST STOPPED BEING TRUE THE SAME EVENING — 11 October 2026.** The
paragraph above is kept in the tense it was written in, for the same reason the one before it is: the
order it records is the order rule 9 asks for. What is true now, and **all of it is owner-reported —
nobody writing this opened a dashboard, a browser or a terminal against either project**:

- **The widget exists, and a rendered one has been seen** — on a Vercel Preview, and again on
  production, where it showed Cloudflare's own "For testing only" line.
- **CAPTCHA is switched ON in BOTH projects**: staging with Cloudflare's dummy secret key, production
  with the real one. Site keys are set in Vercel for Preview and for Production.
- **AND THE QUESTION THIS WHOLE FEATURE RESTED ON IS ANSWERED: Supabase Auth REFUSES a sign-in that
  carries no CAPTCHA token.** HTTP **400**, code **`captcha_failed`** — the code the three screens
  already have their own sentence for, so nothing in the app had to change. A sign-in carrying
  Cloudflare's dummy token is still accepted, which is what keeps every automated sign-in in this
  repository working. "What this section deliberately does not decide" below called this the most
  important sentence missing from the design; it is not missing any more.
- **The production deploy got there with the WRONG site key first** — the dummy one — so the real
  secret key refused everybody on all three screens until the owner corrected the Vercel value and
  redeployed. That accident is also the only observation anybody has that production's check is
  **applied** rather than merely configured.
  [#290](https://github.com/build-once/team-tasks/issues/290) is the build guard that would have
  refused that deploy.
- **What is still NOT done**: no rate-limit figure is changed on either project — **E** and **F** are
  set nowhere and the by-hand row for them is **on hold**
  ([#291](https://github.com/build-once/team-tasks/issues/291)) — leaked-password protection (**G**) is
  not reported as on, and nobody has seen a widget on a phone or written down whether Cloudflare's
  branding is on it.

`evidence/captcha.md` is the record, with a table of who saw what, and `docs/rate-limits.md` section 3
is what is left.

**Decided 2026-10-11, and this section was written before those decisions rather than after them.** It
went to the owner as part of a list of thirteen, with `docs/rate-limits.md` as the inventory behind it,
and all thirteen came back settled the same day. Each is recorded in its place below; they are gathered
here so the whole set is in one view, the way "Daily limits on what costs money" gathers its nine and
"Files attached to a task" gathers its nine. **Nine of the thirteen belong to this section:**

| | Decided |
|---|---|
| **A** The CAPTCHA at all | **Yes.** Cloudflare Turnstile, on the three screens |
| **D** Read both projects' Rate Limits pages before changing anything | **Yes — and DONE the same day.** Both projects identical, **every value at the documented default**, owner-reported from a screenshot |
| **E** The per-IP sign-up limit | **5 per 5 minutes**, from a default of 30 — now known to be what both projects are actually set to |
| **F** The per-IP token-endpoint limit | **30 per 5 minutes, NOT the 20 proposed** — because CI and the staging scripts sign in from **shared addresses**, and the limit is per IP |
| **G** Leaked-password protection on production | **Yes** |
| **H** Minimum password length 8 | **ALREADY DONE** — the owner set it on both projects on **7 October 2026**, four days before it was proposed |
| **I** Dummy keys on staging and Preview, real on production | **Yes** |
| **J** The nine test files change | **Yes, as ONE exported constant** every test and script imports. That is the owner's **rule 20** agreement |
| **K** The widget mode | **Cloudflare's "Managed"** — confirmed as one of its three modes, and the one Cloudflare recommends |

**Two of the eight did not come back as asked, and both are worth more than a tick.**

**F is a correction of the proposal's own reasoning.** It asked for 20 per 5 minutes, on the argument
that 150 is thirty password guesses a minute against six accounts. The owner answered **30**, because
**the limit is per IP address and this project's own automation shares addresses**:
`web/tests/access-rules.test.mjs` signs in **three** accounts on every pull request from a GitHub-hosted
runner whose address nobody here chooses, and eight scripts under `scripts/staging/` sign in repeatedly
from wherever the owner runs them. At 20, two or three pull requests' checks inside one five-minute window
would start failing **for a reason that has nothing to do with what they test** — which is the failure
`web/tests/staging.mjs` already guards against in its own words beside `signIn`. So 30 is not a softer
20; it is the number that does not break the thing that proves the rules.

**H was already true, and the proposal asked for it anyway.** The owner changed "Minimum password length"
from **6 to 8** on staging **and** on production on **7 October 2026**, and on staging a direct `POST` to
`/auth/v1/signup` with the publishable key and a **7-character** password answered **HTTP 422**,
`error_code` `weak_password`. `docs/claims.md` → "SETTLED 2026-10-07" is the record. Two things travel with
that number and are not softened by it: **production's setting is owner-reported and was not tested**, and
**nothing watches either project's setting**, so a change would go unnoticed by every check in this
repository.

**What it is.** **Cloudflare Turnstile** on **sign-up**, **sign-in** and **password reset**, verified by
**Supabase Auth** rather than by this app. Supabase does the checking: "Supabase authentication has
support for hCaptcha and Cloudflare Turnstile", and "Supabase provides you with the option of adding
CAPTCHA to your sign-in, sign-up, and password reset forms"
([Enable CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha), read 2026-10-11). So
this app's part is to draw the widget and pass the token along; **nothing in this project decides whether
a token is good.**

**Why, in one line, and it is not "bots".** `docs/rate-limits.md` is the inventory, and the sentence it
produced about these three screens was that **the only thing limiting any of them is a Supabase default
nobody had read**. **The owner read both dashboards on 2026-10-11 — decision D — and every value is the
documented default**, so the sentence is now: the only thing limiting any of them is a Supabase default,
and we know it is the default. For sign-in that is **150 requests per 5 minutes per IP address**, which is
thirty password guesses a minute against an app that will ever have about six accounts.

**And the reading turned up one thing that is not reassuring, which belongs here rather than only in the
inventory.** The documentation's row for that 150 is "Token endpoint requests", path `/auth/v1/token`,
and it says it "covers password, refresh token, ID token, and PKCE grants". **The dashboard's editable
field at the same number is labelled "token refreshes".** If those are the same thing under two names,
decision F does what it intends. **If that field is about refreshes only, then nothing editable limits a
password sign-in at all** — and the CAPTCHA becomes the only thing in front of this app's sign-in rather
than the second thing. Either way the CAPTCHA is worth having; which of the two it is decides whether it
is worth having *more*. `docs/rate-limits.md` carries the question and the one run that settles it.

**Where the keys live, and which is which.** The **secret key** goes only into each Supabase project's
Auth settings, set by the owner by hand, and nowhere else — not in this repository, not in Vercel, not in
a `.env` file, exactly as the Resend and AI keys live only in function settings. The **site key** is
**public**: it travels in the browser and identifies the widget, like the Supabase publishable key and the
Sentry DSN. It goes in Vercel, **per environment**, as `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

### What Cloudflare sees, and what it keeps

**What it collects, cited rather than remembered:** "Cloudflare Turnstile processes a variety of
client-side signals ("Signals") such as client IP address, TLS Fingerprint, User-Agent Header and Sitekey
and associated origin", and "The purpose of collecting these Signals is not to identify, profile or target
any individuals but solely to detect and block bots"
([Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/), read 2026-10-11). The
developer documentation adds "Turnstile processes only the data strictly necessary to provide this security
function" and "Turnstile does not access, store, or transmit user communications, form entries, or other
page inputs" ([Turnstile](https://developers.cloudflare.com/turnstile/), read 2026-10-11) — so **the
password typed into the box beside it is not part of this.**

**So the new thing this app sends out is an IP ADDRESS, and that is worth being exact about** because this
plan has been careful about IP addresses from the first page. The appendix already lists four log stores
that record one — Supabase's sign-in audit, Vercel's access logs, Supabase's own logs, and Sentry's, which
the owner is switching off. Those four are things **nobody chose**: they are written whether we want them
or not. **This one is chosen**, by us, on purpose, and it is the first time an IP address leaves this
project to a company whose only job is to look at it.

**What is NOT sent:** an email address, a password, a task, a team name, a user ID. The widget sits beside
the form; it is not given the form.

**How long Cloudflare keeps a Signal: NOT CONFIRMED, and no number is written here.** The addendum read on
2026-10-11 states no retention period. `docs/rate-limits.md` → "Not confirmed" carries it with the page to
read, and the privacy page ([#204](https://github.com/build-once/team-tasks/issues/204)) cannot describe
this until somebody has.

**Whether Turnstile sets a cookie: NOT CONFIRMED either.** The addendum points elsewhere — "For more
information about the cookies used by Cloudflare, please check our Cookie Policy and our Turnstile
Developer Docs" — and says nothing itself. It matters because a cookie set by a third party on this app's
sign-in page is a thing a privacy page has to mention.

**It costs £0 at any size this app will be.** Cloudflare's free plan is "Up to 20 widgets", "Unlimited
challenges (traffic or verification requests)" and "10 hostnames per widget"
([Plans](https://developers.cloudflare.com/turnstile/plans/), read 2026-10-11). `docs/costs.md` has the
row.

### THE TESTS, which is the half that decides whether this can be switched on at all

**Every automated sign-in in this project is a password sign-in with no CAPTCHA token** — nine files,
counted on 2026-10-11: `web/tests/staging.mjs`, which `web/tests/access-rules.test.mjs` is built on and
which **runs against staging in CI on every pull request**, and eight scripts under `scripts/staging/`.
Switch CAPTCHA on at staging with a real key and all nine stop working, and the first symptom is a red
check on a pull request that has nothing to do with sign-in.

**Cloudflare publishes keys for exactly this**, and they work as a matched pair:

| | Cloudflare's own words, read 2026-10-11 |
|---|---|
| What the dummy keys are for | "Use dummy sitekeys and secret keys to test your Turnstile implementation without triggering real challenges that would interfere with automated testing suites." |
| The token a test sitekey produces | "Test sitekeys generate a dummy token: `XXXX.DUMMY.TOKEN.XXXX`" |
| What a test secret key accepts | "Test secret keys: Only accept the dummy token, reject real tokens." |
| What a real secret key accepts | "Production secret keys: Only accept real tokens, reject dummy tokens." |
| And therefore | "Production secret keys will reject the dummy token. You must also use a dummy secret key for testing purposes." |

**The arrangement, DECIDED 2026-10-11 (I): dummy keys on staging and on Vercel's Preview, real keys on
production.** So staging keeps CAPTCHA **switched on** — which is the point, because a staging project
with the feature off proves nothing about the code path — and the nine files keep passing by sending the
dummy token.

**What the tests would send.** One field, read out of the installed client rather than recalled:
`gotrue_meta_security: { captcha_token: "XXXX.DUMMY.TOKEN.XXXX" }`, alongside `email` and `password` in the
body of `POST /auth/v1/token?grant_type=password`
(`web/node_modules/@supabase/auth-js/src/GoTrueClient.ts:1243-1251`).

**What staging would then prove: that the field is sent, in the right place and the right shape, and that
Supabase Auth takes it.** That is the half that breaks loudly and the half a later code change can
regress, so it is worth having.

**What staging would NOT prove, said plainly because the list is the point:**

- **that a real CAPTCHA refuses anybody.** A dummy secret key accepts the dummy token by definition, so
  this is a check staging is incapable of failing;
- **that a sign-in with no token at all is refused** — see the next paragraph;
- **that a person on a phone can solve one.** A widget, its script and its appearance are not reachable
  from a `fetch`.

**~~And one thing nobody has established in either direction: whether Supabase Auth refuses a sign-in
that carries no token once CAPTCHA is on.~~ SETTLED 11 OCTOBER 2026, AND THE ANSWER IS THAT IT
REFUSES.** The paragraph said: "The CAPTCHA page says what to switch on and **does not say what happens
to a request that arrives without one**. It is the most important sentence missing from this design,
because if the answer is 'it is accepted' then the whole thing protects nothing. **Staging with a dummy
secret key can settle it with one request**, and that check should be written before production is
switched on, not after."

**The check was written before production was switched on, and the owner ran it before and after.**
Before CAPTCHA was enabled on staging, a sign-in carrying no token was **accepted, HTTP 200**. After,
with Cloudflare's dummy secret key: **HTTP 400, `captcha_failed`**. The pair is what makes the refusal
the CAPTCHA's doing rather than something that was always there. So the widget on the screen is **not**
the only thing in the way, and something posting to `/auth/v1/token` by hand does not walk past it.
**Owner-reported; nobody writing this ran it.** `evidence/captcha.md` section 1.

**How production's real CAPTCHA gets seen to refuse — by the owner, and not by a script.** Rule 19 permits
no production command and nothing in this project opens a browser. Two things, and they are the whole of
it: **open production's sign-in page with JavaScript switched off** and see what it says, which is the
refusal path observed rather than reasoned about; and **post to production's token endpoint with the dummy
token**, using a wrong password for an address that has no account, where a real secret key must reject the
dummy token — so a CAPTCHA refusal rather than "wrong password" is what says the check is actually running.
Neither involves a real account or a real password.

**THE NINE FILES DO CHANGE, AND THE OWNER AGREED TO IT ON 2026-10-11 — decision J. This paragraph is the
rule 20 line.** Rule 20 says changing a test is the owner's call and never the assistant's, and that a
test which was allowed to change "gets its own line in the pull request saying what changed and who
agreed to it". What changed: **nine sign-in helpers each gain one field**,
`gotrue_meta_security: { captcha_token: … }`. Who agreed: **the owner, 11 October 2026**, in answer to
the thirteen.

**And the owner decided the SHAPE as well, which is the part that matters a year from now: ONE EXPORTED
CONSTANT that every test and script imports**, not nine copies of a literal. Nine copies of a magic
string from another company's documentation is the shape `evidence/build-it-16-suspend-functions.md`
already records about `checkSuspension` — "a copy that drifts is a script that fails for a reason that
has nothing to do with what it is testing" — and it gives the repository one place to change if
Cloudflare ever changes the value.

**Where the constant lives is NOT decided**, and it is the one loose end: `web/tests/staging.mjs` is the
obvious home, and the eight scripts under `scripts/staging/` do not import from `web/tests/` today.
`docs/rate-limits.md` lists every file and line, and carries that question in its "Not confirmed" list.
**Nothing in any of the nine is edited by the change that adds this section**, which is documents-only.

### What a person sees, which is decision K — Cloudflare's "Managed" mode

**The owner asked for Cloudflare's "managed" mode IF that is one of its widget modes, and asked for the
modes to be confirmed from Cloudflare's own documentation rather than taken on trust. It is one of them,
and it is the one Cloudflare recommends.** Read on 2026-10-11 from
[Widget types](https://developers.cloudflare.com/turnstile/concepts/widget/) — **fetched twice with
different questions, which agreed** — there are three, and the page's own label is "**Managed**
(recommended)":

| Mode | What Cloudflare says a visitor sees |
|---|---|
| **Managed** — chosen | "Automatically chooses between non-interactive or checkbox challenge based on visitor risk level." When it does ask, "the visitor will be prompted to select a box", and "There will be no images or text to decipher." |
| Non-interactive | "Visitors will see a widget with a loading spinner while the challenges run in their browsers", and "visitors will never be required or prompted to interact with the widget." |
| Invisible | "visitors will never interact with the Turnstile widget", and "Visitors will also not see a widget or any indication that an invisible browser challenge is in progress." |

**So what a volunteer signing in actually sees, in one sentence: a small box below the password field
that usually settles itself, and sometimes asks them to tick it — never a puzzle, never an image to
identify, and never a word to retype.** That sentence is what the three screens have to be built to make
true, and it is the one a privacy page can repeat to somebody who asks what the box is.

**Why Managed and not Invisible, which is the comparison worth making.** Invisible costs a volunteer
nothing at all to look at, so it is the obvious choice until you ask what happens when it fails:

- **A visible widget is the only thing that can tell somebody why they are stuck.** The cost named below
  is that signing in starts needing JavaScript. With an **invisible** widget, a person whose browser
  blocked the script sees a sign-in form that simply refuses them, with nothing on the screen to connect
  the refusal to. A box that failed to load is a box they can see failed to load.
- **It is the mode Cloudflare recommends**, and on a control standing in front of everybody's sign-in,
  departing from the vendor's own default wants a reason rather than a preference.
- **The tick is the honest version of what is happening.** Something is being checked about this visitor;
  a mode chosen so that nobody notices is a mode chosen so that nobody is told.

**What it costs, stated:** on a risky-looking request a volunteer has one extra tap, and that will
sometimes fall on somebody with a shared or mobile address who has done nothing wrong.

**And one thing read off a different page rather than that one, so it is not written as a fact: the free
plan probably shows Cloudflare's branding.** The [Plans](https://developers.cloudflare.com/turnstile/plans/)
page lists "the ability to remove Cloudflare branding" among what Enterprise adds, so the free tier keeps
it — an inference from what a pricing page says Enterprise buys, not a statement about the widget, and
the widget page says nothing about branding at all. **If it holds, another company's name appears on this
app's sign-in screen**, which is a thing to have decided rather than discovered. Nobody has looked at a
rendered widget.

### What a person sees if the CAPTCHA cannot load, and the thing it costs

**Signing in would need JavaScript, and nothing else in this app does.** Every screen today is a
server-rendered page and a form posting to a server action; the one exception is attaching a file, which
`docs/architecture.md` already records as needing JavaScript and says so in a `<noscript>` line beside the
box. Turnstile is a script that renders a widget — the script is
`https://challenges.cloudflare.com/turnstile/v0/api.js`, and the token arrives in a hidden field the widget
creates ([Client-side rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/),
read 2026-10-11) — so with no JavaScript there is no token, and with no token there is no sign-in.

**That is a real loss and the plan is not going to pretend otherwise.** This app is for a phone browser, and
a volunteer on a slow connection or a locked-down work laptop would go from "sign-in works" to "sign-in does
not work, and the screen had better say why".

**So the one thing required of the screens: they say what happened, and they do not look broken.** Three
cases, and the wording belongs with the screens rather than here:

- **The widget has not been solved yet.** The button says so, rather than posting and coming back with
  "that email and password don't match" — which is the sentence those screens have today, and it would be a
  lie about the password.
- **The widget could not load**, or JavaScript is off. A sentence that says the check could not load and
  that signing in needs it, in the place the box would have been. Not a blank space, and not a form that
  posts into a refusal.
- **The token expired before the form was sent.** Cloudflare's own figure: "Tokens expire after 300 seconds
  (5 minutes). Each token can only be validated once." Five minutes is less than somebody can plausibly take
  over a password field, so this will happen, and the honest answer is "that check timed out, here it is
  again" rather than a wrong-password sentence.

**What the screens must never do is show Cloudflare's or Supabase's own words.** Same rule as everywhere
else in this app: a message this app did not write, in this app's styling, is `web/src/lib/teams.ts`'s long
note about exactly that.

### What this section deliberately does not decide

- ~~**The wording on the three screens.**~~ **WRITTEN 2026-10-11, in Build it 25 part 1**, and the two
  requirements are kept: four sentences in one constant (`TURNSTILE_WORDS`, `web/src/lib/turnstile.ts`),
  drawn by one component on all three screens so they cannot drift into saying three things, and **not one
  of them names Cloudflare, Supabase or the word CAPTCHA** — "the check that you are not a robot" is what
  is happening, said in words. `docs/claims.md` §1i is the row for each, with what makes it true.
- ~~**Whether the widget is visible or invisible.**~~ **Decided 2026-10-11 — Managed**, which is visible
  and sometimes asks for a tick. The subsection above is the decision and the reasoning; this line is
  struck through rather than deleted, because a question that gets answered is worth as much on the record
  as one that stays open.
- ~~**Where the one exported constant for the test token lives.**~~ **DECIDED BY BUILDING IT, 2026-10-11:
  `scripts/lib/captcha.mjs`.** Not `web/tests/staging.mjs`, which was the obvious home: the eight scripts
  under `scripts/staging/` do not import from `web/tests/`, and `scripts/lib/` is a folder that already
  exists for shared script code (`scripts/lib/secrets.mjs`) and that BOTH sides reach with a plain
  relative path — `../lib/captcha.mjs` from the scripts, `../../scripts/lib/captcha.mjs` from the tests.
  So neither side imports from the other's folder, and nothing about `web/` depends on `scripts/` at build
  time, because `web/tests/` is not part of `next build`. **All nine files import it and not one spells
  the token**, which `scripts/auth-screens-check.mjs` asserts by name.
- **Whether `/auth/v1/resend` and `/auth/v1/verify` are covered.** The CAPTCHA page names "forms" and no
  endpoints, so this is **not confirmed** and is on `docs/rate-limits.md`'s list.
- ~~**Anything about the Auth rate limits themselves.**~~ **Decided: the two numbers are E and F, and
  both dashboards have now been read (D).** What is left is neither a decision nor a reading: **the
  figures are chosen and set nowhere**, which are different things, and one of the two is aimed at a
  field whose label does not match the documentation's. `docs/rate-limits.md` section 3 is the list of
  what somebody still has to do by hand, and its row 11 says what to read before touching it.

## Login emails that work in any browser

Added 2026-10-11, for Build it 25, at the owner's instruction after watching a reset link fail on
production. **Not a sixth feature, no new button that anybody goes looking for, no new company, and
nothing new leaves this project** — it adds no row, no column and no kind of data, and the appendix is
untouched by it. It is in the plan for one reason: it is **how features 1 and 3 actually reach a person**,
and until today they reached them in a way that worked only on one device.

**What the owner saw on production, 11 October 2026.** Custom SMTP through Resend was on and reset emails
were arriving. Then:

- **a reset link opened in a DIFFERENT browser from the one that asked for it:** Supabase accepted the
  link (303) and the app showed "That link didn't work";
- **a reset link opened in the SAME browser:** the exchange succeeded, the new-password page loaded, and
  **saving was refused with HTTP 422, code `same_password`** — and the app said "That link didn't work"
  again. That half is "True messages" below;
- **the owner's mail provider rewrites links through a scanner**, which made a HEAD request to the link
  before anybody clicked it.

**Why the first one happened, because it is not a bug in either side.** The links are **PKCE** links: the
library asks for the reset with a code challenge and keeps the matching verifier in a cookie **in the
browser that asked**, so the code that comes back is one only that browser can exchange. A volunteer who
asks on their phone and opens their mail on a laptop is the ordinary case, not the odd one.

**THE OWNER'S DECISION: sign-up confirmation and password-reset links must work when the email is opened
in a different browser or on another device.**

**How, and it is Supabase's own documented answer rather than an invention.** The email carries a **token
hash** to a page of this app instead of an authorization code to Supabase, and a token hash carries no
verifier. Supabase documents the shape for server-rendered apps, and documents the scanner problem
separately — "certain email providers may have spam detection or other security features that prefetch URL
links from incoming emails", with one of its two remedies being to "create a custom link that redirects to
a confirmation page where users click a button containing the actual confirmation link". So:

- **`/auth/confirm` is a PAGE, and a GET verifies NOTHING.** It reads the token hash and the kind of link,
  decides whether they are the right shape, and draws a **button**. A scanner's GET or HEAD costs the
  person nothing.
- **The token is spent only by the press**, in a server action that checks the button's identifier first.
- **No destination comes out of the link.** Supabase's documented route reads a `next` parameter; this one
  will not, because a destination taken out of a link is a destination somebody else chooses. Each kind of
  link goes to one of two fixed paths written in the app.
- **Only two kinds of link are accepted** — `recovery` and `signup` — and the password form is still gated
  on the marker cookie this app sets, which is set only on the recovery path.
- **The link's host still comes only from a setting on the server**, never from a request header: the
  template names `{{ .SiteURL }}`, which is the Supabase project's own Site URL.

**What it costs, stated rather than discovered.** A sign-up made on a Vercel **Preview** deploy now gets a
confirmation link pointing at the project's Site URL host rather than at the preview's own address,
because the template does not use the per-request value the app passes today. The alternative,
`{{ .RedirectTo }}`, keeps the preview behaviour and produces a **broken** link whenever no redirect was
sent — and `SITE_URL` is optional — which is the worse failure of the two, on production of all places.

**Nothing of this happens until the owner edits two email templates by hand**, and the exact words are in
`docs/rate-limits.md` section 3, rows 12 and 13, compared on every pull request against the path this app
actually serves. **Links sent before that edit keep working:** `/auth/reset` and `/auth/callback` are
untouched and still accept the old shape in the browser that asked, so there is no window in which
somebody's reset email is dead.

## True messages on the login screens

Added 2026-10-11, for Build it 25, and it is the smallest thing in this plan: **no new data, no new
company, no new button, and not one new thing anybody can do.** It is here because the plan is the
register of what this app tells people, and on 11 October 2026 the owner watched it tell them something
false — "That link didn't work", drawn over a link that had worked, for a password that was simply the one
they already had.

**The rule, in one line: every refusal Supabase Auth can give when a password is set or an account is made
gets its own plain sentence, chosen from the error CODE and never from the text the service sent — and only
a link that is really dead says the link did not work.**

**Why the code and not the message.** A message this app did not write, in this app's styling, is a
sentence nobody here can be held to: it changes on somebody else's release, and it can name a company, a
status, a column or the address that was typed. The same argument `web/src/lib/teams.ts` already makes at
length, applied to the one place in the app that had not had it.

**What is now told apart, and two of them matter on production today:**

- **the email limit**, which is per project and not per person — so the third person to ask for a reset in
  an hour was told nothing at all about why;
- **an address the sender will not deliver to**, which is what production answers for every address that is
  not on the Supabase project's team. Before this it got "Check the email address and password", which is
  advice that could not possibly have helped.

**What is deliberately NOT told apart, and it is a privacy decision rather than an omission: an address
that already has an account.** "That address is already registered" is how somebody sorts a list of
addresses into accounts and not-accounts, one sign-up at a time, so it falls through to the sign-up
screen's existing generic sentence — the same reason the reset-request screen says one sentence whatever
happened.

**And one screen cannot report a refusal at all, which is the cost of an older promise.** The reset-request
screen says "If that address has an account, we've sent a link" for every outcome, and that is enforced by
having no branch in it to add one to. So a failed anti-robot check there means no email and that same
sentence. The words beside the box are what a person gets instead, in the place they can act on them, and
`docs/rate-limits.md` already records the same cost for the email limit.

**THE OWNER ACCEPTED THAT COST AS IT STANDS — 11 October 2026**, which is the first of the two answers
[#288](https://github.com/build-once/team-tasks/issues/288) asks for and the reason that issue needs no
code. So the promise is kept and the cost stays: **a person whose anti-robot check failed on the
reset-request screen gets no email and the same reassuring sentence**, and nothing on that screen will
ever say otherwise. What makes it bearable is written in #288 and is not softened here — the widget's own
words sit beside the box, in the place a person can act on them before pressing anything, and the submit
button is disabled until there is a token, so the realistic path to this is a token that expired while
somebody was typing an address. **The same screen cannot report a rate limit either**, and the two look
identical from outside; that is the same promise's cost twice, and it is accepted twice.
`scripts/password-reset-check.mjs` reads the action's source and refuses a second branch, so this
decision is enforced rather than remembered.

## The sign-up and reset emails move to Resend

Added 2026-10-11, for Build it 25, and it is what
[#219](https://github.com/build-once/team-tasks/issues/219) has been holding since 8 October. Not a sixth
feature, no new button, and **no new company**: Resend already sends this app's invitations. What changes is
**which of this app's emails go through it** — and therefore **what Resend holds about people**, which is
why it is in the plan and not only in `docs/stack.md`.

**Decided 2026-10-11, and this section was written before those decisions rather than after them.** Two of
the owner's thirteen belong here, and both came back as proposed:

| | Decided |
|---|---|
| **L** Custom SMTP on **production** | **Yes.** Resend, `smtp.resend.com`, port 465, username `resend`, password an API key |
| **M** Staging keeps the **built-in sender** | **Yes** — so there is no second SMTP configuration and no second place a credential that can send email as this app lives |

**What it is.** The **sign-up confirmation** and the **password-reset** email stop being sent by Supabase's
built-in sender and start being sent by **Resend, through Supabase Auth's custom SMTP setting**. On
**production**. The owner sets it by hand in the dashboard; nothing in this repository sends either email,
and nothing in this change sends them either — `supabase/functions/invite-member` is untouched and keeps its
own `EMAIL_API_KEY`. **Nothing is configured on either project on the day this was written**, so every
sentence below about what Resend will hold is about what the decision means and not about what has
happened.

**This is not an improvement. It is a repair, and the plan should say so in the first paragraph.** From
Supabase's own page: "Unless you configure a custom SMTP server for your project, Supabase Auth will refuse
to deliver messages to addresses that are not part of the project's team"
([Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), read 2026-10-11). Read against this app,
that says: **on production as it stands, a volunteer signing up or asking for a password reset receives
nothing at all** — not late, not rate-limited, nothing — because their address is not on the Supabase
project's team. Nobody has observed it, because nobody has signed up on production, so it is a reading of
that sentence rather than a measurement; `docs/rate-limits.md` names the one sign-up that settles it and
fixes it in the same act.

**And the rate is the smaller of the two problems, which is the thing #219 asked to be read.** The built-in
sender's limit is "2 emails per hour with the built-in email provider"
([Auth Rate Limits](https://supabase.com/docs/guides/auth/rate-limits), read 2026-10-11) — **per project,
not per person**. The custom-SMTP page cited above says the default service is "provided as best-effort
only and intended for the following non-production use cases", and lists "Exploring and getting started with Supabase Auth",
"Setting up and testing email templates with the members of the project's team", and "Building toy
projects, demos or any non-mission-critical application". `docs/stack.md` decided on 2026-09-27 that
"Supabase's built-in email is for testing only"; this is that decision reaching the two emails it had not
yet reached.

**What happens to Supabase's own email rate limit once custom SMTP is on: it becomes a number the owner
chooses, and until they choose it is 30 an hour.** Both halves are published. The rate-limits table's own
row reads "2 emails per hour with the built-in email provider. You can configure this limit when you use
custom SMTP or the Send Email hook"; and the custom-SMTP page says "To protect the reputation of your newly
set up service a low rate-limit of 30 messages per hour is imposed. To adjust this to an acceptable value
for your use case head to the Rate Limits configuration page." **So the limit does not go away** — it stops
being 2 and starts being a setting, and **nobody has read what either project is set to**, which is the
first row of `docs/rate-limits.md`'s by-hand list.

**One number to keep in step, and it is not obvious.** 30 messages an hour is **720 a day**, and Resend's
free plan allows **100 a day**. So the Auth setting, left at its imposed default, permits seven times what
the email service will accept. At six volunteers neither is reachable; the figures are written down because
**a limit that is looser than the thing behind it is a limit that reports the wrong failure**, and
`docs/costs.md` carries the arithmetic.

### What Resend then holds, which is the part that is about people

**Today Resend sees only the addresses of people who have been INVITED.** After this, it sees **the address
of everybody who uses this app** — on sign-up, and again on every password reset — because those messages
pass through it.

That is a genuine widening and this plan's habit is to state it rather than fold it into "we already use
Resend":

- **What is sent:** the recipient's address, the sender address and name, a subject, and Supabase's own
  email body carrying a **confirmation or reset link**. That link is a credential with a clock on it, in the
  same class as an invitation token — `docs/architecture.md` already puts it that way about invitations, and
  the appendix's row for "Confirmation and reset links in flight" is the same thing seen from the restore
  side.
- **What Resend keeps:** its sending log, **30 days on the free plan**, which the appendix already records
  for invitations. The log is a record of **which addresses were sent what, when** — so it becomes a record
  of who signed up and who has been resetting their password.
- **Who can see it:** the owner, through Resend, and Resend.
- **What this app keeps about it: nothing.** No row, no status, no log line. Unlike an invitation, which has
  a `status` column and a failure code, these two emails leave no trace in this project at all — which is
  also why the app cannot tell somebody their reset email failed.

**And the password-reset promise is untouched, which is the one thing this change must not break.** The
reset screen says one sentence whatever happened — "If that address has an account, we've sent a link" —
and `scripts/password-reset-check.mjs` reads the action's source and refuses a second branch. Moving the
sender changes nothing about that: **the app still learns nothing it could leak**, because it still does not
read the answer. What does change is that the sentence is **true more often**, which is the whole point.

### What staging does: nothing, and that is the proposal

**DECIDED 2026-10-11 (M): staging keeps Supabase's built-in sender and is not given custom SMTP.** Three
reasons, and the third is the deciding one:

- **Staging's email already goes nowhere real.** `invite-member` on staging redirects every message to
  `EMAIL_TEST_INBOX`, and the function's own comment says why that setting wins over every other: "If a test
  inbox is set at all, that is somebody saying 'do not send to real people from here'". The two login emails
  are Supabase's, so that redirect does not cover them — but the accounts staging signs in as are **Alice,
  Bob and Carol**, test accounts whose addresses the owner owns.
- **The built-in sender's refusal is harmless there.** It refuses addresses "not part of the project's
  team", and on staging the only addresses used are the three test ones.
- **A second SMTP configuration is a second place for a key to be**, and a staging project whose Auth sends
  through Resend would be a second copy of a credential that can send email as this app — for no benefit,
  because nothing on staging needs a real volunteer to receive anything.

**What that costs, stated, and the owner took the decision with it in front of them:** staging cannot be
used to check that custom SMTP works. So **the first time this arrangement is exercised is on
production.** The check is small and it is the owner's: one sign-up with the test mailbox, after the
setting is saved, and see whether the email arrives. **That one sign-up does two jobs** — it is also the
only thing that would confirm the refusal this section is a repair for, which nobody has observed.

### What this section deliberately does not decide

- **The email templates.** Supabase's defaults carry this app's links today and no template for either
  email exists in this repository. `docs/claims.md` already says so.
- **The sender address and name**, which custom SMTP requires. The owner chooses both; they appear in
  everybody's inbox.
- **Whether "Confirm email" is on at all.** `docs/claims.md` records it as **not verified** — nobody has
  read the setting — and this section does not change it.
- **Counting these two emails.** The owner decided on 2026-10-08 that they are **not** counted in
  `usage_counts`, because there is no signed-in person to key a count by and counting per address would
  rebuild the distinction the reset screen refuses to make. **Unchanged.** What holds them is the Auth
  setting above, which is now a number somebody chose rather than a number nobody read.

## The documents, your own data, and deleting an account

Added 2026-10-12, for Build it 26, at the owner's instruction. **Three of these are not features and
one is.** The privacy policy, the terms and the cookie answer are *documents* — nobody using the app
gets a new button from them, and the five things stay five. **Exporting your own data and deleting your
account are new things people can press**, and they are in the plan for the reason every other
section here is: deleting destroys data, and an export assembles everything this app holds about one
person into a single file, which is a shape of risk this plan has not had before.

**And it is the build that closes the gap this plan has reported from its first page.** "Two gaps this
table exposes" has said since 27 September that this app "collects personal data and offers no way
out", and that **twenty-one** rows of the appendix answer "they cannot" or "the owner deletes by hand".
[#204](https://github.com/build-once/team-tasks/issues/204) is the other half: it collects personal
data and **does not say so anywhere a person using it can reach**. Build it 26 is both halves.

**Nothing is built on the day this was written:** no privacy page, no terms page, no cookie list on any
screen, no export, no delete-account button, no deletion-request page, no migration, and no new column.
`docs/data-inventory.md` is the reading of what this app actually holds and who receives it;
`docs/deletion.md` is the design for the deletion, the export and the request page. Both were written
before any code, which is the order rule 9 asks for.

### What it is, in five parts

1. **A privacy page.** Public, reachable from every screen, saying what is held, who receives it, where
   it is held, how long for, and what a person can do about it. [#204](https://github.com/build-once/team-tasks/issues/204)
   is the requirement and the list; this section is the release order around it.
2. **Terms.** Public, reachable from every screen. What this app is, what it is not, what it does not
   promise, and the law it is read under.
3. **An answer about cookies**, which was a list before it was a decision — and the decision is now
   taken. `docs/data-inventory.md` section 5 is the list, from the code and from Cloudflare's own
   documentation; **`evidence/cookies.md` is the reading of a real screen, and the answer is NO BANNER,
   WITH DISCLOSURE** (question 15, 2026-10-13). What the reading found is smaller than the list
   allowed for: on a signed-out `/login` **this app stores nothing at all on the device**, and the one
   thing found is **Cloudflare's local-storage item `cf.turnstile.u`, in Cloudflare's own frame** —
   which the privacy page must **name**, because a cookie answer that omits the one thing actually
   found would be the sort of true-sounding omission this build exists to prevent.
4. **Export your own data.** One JSON file, the signed-in person's own data and nobody else's, built
   **with their own rights and no secret key** — because nearly everything in it is something
   row-level security already lets them read. `docs/deletion.md` section 11.
5. **Delete your account.** Eight steps, in an order the schema forces rather than one somebody chose.
   `docs/deletion.md` sections 2 to 9.

### What it deliberately is not

- **Not an admin screen.** Nobody deletes anybody else's account, and nobody exports anybody else's
  data. Suspension stays what "Suspending an account" above says it is: a row the owner adds by hand.
- **Not a consent record, unless the owner asks for one.** Recording which version of the terms
  somebody accepted at sign-up would be a **new column holding a new kind of fact about a person**, and
  it is question 4 below rather than an assumption here.
- **Not a cookie banner. DECIDED 2026-10-13**, on a reading of a real screen rather than on the
  evidence being thin: there was nothing of ours on the device to ask about. Part 3 above, and
  `evidence/cookies.md`.
- **Not a change to what any outside company receives.** Nothing new leaves this project in this build.
  What changes is that people are **told**, and that they can ask for it to stop.

### The new kinds of data, which is why this is in the plan and not only in `docs/`

Three, and each gets a row in the appendix:

- **The export file.** Not stored anywhere — it is built on request and handed to the browser — but it
  is the first artefact this app creates that holds **everything about one person at once**, and
  somebody holding a session can take it.
- **A tombstone row. DECIDED 2026-10-12** (question 10, and `docs/deletion.md`'s decision 6): **two
  columns**, a user id and a date, with **no policy and no privilege for any role**, removed after
  **30 days** by the same statement that writes one. It exists for exactly one reason — a restore from
  a copy taken before a deletion would otherwise **bring a deleted person back** — and 30 days is
  chosen because it outlives the longest-lived backup that could do that (about fifteen days) and
  nothing more. **One thing it must not copy from `count_daily_use`**: that function sweeps only the
  caller's own rows, and a tombstone's subject never calls anything again, so the sweep has to run over
  **all** tombstones on **every** deletion.
- **The deletion-request mailbox.** A public page with **no form** (decision 10) collects nothing in the
  app — and it makes **the owner's own mailbox** the place where a stranger's address and their request
  sit. That is outside this project, it is a real store of personal data, and the appendix says so
  rather than leaving it out because no table is involved.

### Users' rights, stated as what this app will actually do

Not a recital of law — the five things a person can ask for and where each is answered:

| What somebody asks | What this app will do | Where |
|---|---|---|
| **"What do you hold about me?"** | the privacy page says what is held and who receives it; the **export** hands them their own copy | parts 1 and 4 |
| **"Correct it"** | they can rename a task, change their nickname and switch the AI setting themselves. **An email address cannot be changed in this app** — that is the owner, by hand, and the policy must say so | today's features, plus one sentence |
| **"Delete it"** | **delete your account**, from inside the app; or the **request page** if they cannot sign in | parts 5 and the request page |
| **"Stop sending my task titles out"** | the **AI suggestions** setting, which starts off for everybody | "AI suggestions — the consent setting" above |
| **"Delete my error reports"** | **the owner, by hand, searching Sentry for their user ID — and only before the account is deleted**, because afterwards the id is the only thing left to search by. So the policy says these are deleted **on request**, not automatically | `docs/deletion.md` section 8 |

**And three things the policy must say it cannot do**, because saying "deleted" and meaning "mostly" is
the one failure this whole build exists to avoid:

- **copies of their data remain for up to about a fortnight** — 14 days by the R2 lifecycle rule, plus
  the day Cloudflare allows for a removal;
- **what has already gone to Anthropic cannot be recalled**, and cannot even be found, because nothing
  identifying the asker was sent with it;
- **Resend's sending log** keeps which addresses were sent what for 30 days, and after 11 October 2026
  that includes everybody's own address and not only invited ones.

### Questions only the owner can answer

Five the owner named, and the rest from writing the design. The documents cannot be drafted without 1
to 5, and the code cannot be written without 6 to 16.

**ALL SEVENTEEN ARE NOW ANSWERED.** Nine on **2026-10-12** — 6 to 14, all as recommended — and the
remaining eight on **2026-10-13**: 1 to 5, 15, 16 and the seventeenth the first nine produced. Each
answer is marked below and recorded in full where its design is: `docs/deletion.md` §13 for 6 to 14 and
17, `evidence/cookies.md` for 15, `docs/claims.md` §7 for every sentence 1 to 5 and 16 decide.

**One of the eight came with a reading of a rendered screen rather than a judgement**, and it is the
only answer in this list that is a measurement: question 15. **Two of them are departures from the
book**, named as such below — questions 4 and 17.

1. ~~**Who is the data controller, and what contact address is published on the page?**~~ **ANSWERED
   2026-10-13: the controller is `DHTA Ltd`, and the published address is `dp@raj-dhonota.com`.** Both
   go on the privacy page and on the terms. **Two things follow that are worth writing down rather
   than discovering**: it is **a public address on a public page**, so it will be scraped and will
   receive rubbish — and it is **the address every right in this plan is exercised through**, including
   the deletion requests of people who cannot sign in (question 14 left the app with no form, on
   purpose), so it is the one address in this project that must not go unread.
   **AND ONE THING ABOUT THE CONTROLLER IS STILL OPEN, recorded here at the owner's instruction on
   2026-10-13: `DHTA Ltd`'s COMPANY NUMBER AND REGISTERED OFFICE ARE NOT PUBLISHED.** A paragraph
   giving them was drafted for the privacy page as one of four optional ones, and the owner's answer
   was **not now** — and to **delete the placeholder rather than leave it**, because a blank in square
   brackets sitting in a file is a thing that eventually reaches a page.

   **So it is an open item for the owner rather than a decision anybody has taken against it.** It is
   the one thing on this whole list that could not be drafted: a registered number and a registered
   office are **facts only the owner has**, not judgements, so guessing at them was never available.
   The page names the company and the address to write to, which is what somebody needs in order to
   reach anybody; what it does not do is identify the company in a register.
   `scripts/screen-state-check.mjs` section 11 refuses the placeholder anywhere in
   `web/src/lib/legal.ts` or either page, so this stays an item on this list until the owner supplies
   the two values — at which point it is one paragraph and one claims-register row.
2. ~~**Which law governs the terms, and where disputes are heard?**~~ **ANSWERED 2026-10-13: England
   and Wales**, for both.
3. ~~**Is there a minimum age?**~~ **ANSWERED 2026-10-13: 16, STATED on the page and NOT CHECKED.**
   That is the smaller of the two in every sense and the distinction has to survive into the wording:
   the page says the app is **not for under-16s**, and it must **not** say or imply that anybody's age
   is verified. **Nothing is asked, so nothing is held** — no date of birth, no age field, no new row,
   and the appendix is untouched by this answer. `docs/claims.md` §7e is the row, and its verdict is
   that a sentence which read as a verification would be **NOT ENFORCED**.
4. ~~**Do the terms need an "accepted version" record at sign-up?**~~ **ANSWERED 2026-10-13: NO — and
   it is a DELIBERATE DEPARTURE FROM THE BOOK, recorded as one at the owner's instruction.** The
   chapter recap recommends recording **who accepted which version of the terms, and when**. This app
   does not, and the reason is the reason this plan gives for everything else it declines: **it would
   be a new column holding a new fact about a person** — one row per account, saying what they agreed
   to and on what date — for a group of about six volunteers the owner will tell in person.
   **So the trade is stated plainly in both directions.** What is given up: if somebody ever disputes
   which terms they were shown, there is nothing in the database to answer with, and the honest answer
   would be "we did not record it". What is gained: **no new personal data at all.** This is the line
   to come back to if this app ever has people the owner does not know — and a version record added
   later cannot be backdated, which is the part that makes it a decision rather than a deferral.
5. ~~**Who is the real person reading both documents before launch?**~~ **ANSWERED 2026-10-13: the
   owner reads both himself.** And the owner asked for the limit of that to be recorded, which is the
   half that matters: **it is NOT a legal review.** Two consequences, and the second is a drafting rule
   the pages are held to:
   - **nothing in either document may say or imply that it was reviewed by a lawyer**, that it was
     "prepared by" anybody, or that it has been checked for compliance with any law. No such sentence,
     and no badge, seal or date-of-review line that would read as one;
   - **and every statement in them about an outside company stays attributed.** "Anthropic publishes",
     "Cloudflare states", "the project's settings say" — never this app's own voice asserting another
     company's practice. `docs/claims.md` §7f item 3 is that rule, and it is the reviewer who has to
     hold it, which is now the owner.
6. ~~**Do tasks somebody created in other people's teams survive their account, shown as "Former
   member"?**~~ **ANSWERED 2026-10-12: YES.** And it costs **five** schema changes rather than the four
   this question named — a nullable `owner_id`, a new branch in `tasks_enforce_column_rules` **without
   which the deletion is refused outright**, a delete policy for the team's owner, the screens' word,
   **and a fifth found after the answer**: a branch on the storage delete policy, without which the
   team's owner cannot clear a former member's files and so cannot use the delete policy at all.
   `docs/deletion.md` §6.1.
7. ~~**What happens to a former member's task when its team is later deleted?**~~ **ANSWERED
   2026-10-12: accept the orphan; the operator sweeps it** — **and** `delete-account` removes a doomed
   team's former-member tasks **explicitly** (step 4b), so the orphan can arise only from a team
   deleted by hand in the dashboard. The option this plan leaned towards turned out to be unbuildable:
   a trigger cannot call the Storage API, so it would delete the row and leave the bytes.
8. ~~**Does the deletion remove files they uploaded to tasks that survive?**~~ **ANSWERED 2026-10-12:
   YES — and it is MANDATORY rather than a decision**, because the coach's read of both projects found
   that `storage.objects` has **no foreign key to `auth.users` at all**. Nothing in the database
   removes those files and nothing refuses the deletion over them.
9. ~~**Are invitations addressed to them deleted?**~~ **ANSWERED 2026-10-12: YES.** They do not
   cascade, so without a step the app would keep the address of somebody who had just left.
10. ~~**Tombstones, the owner's own record, or accept that a restore brings a deleted person back?**~~
    **ANSWERED 2026-10-12: tombstones, 30 days**, two columns, no privilege for any role, removed by
    the statement that writes one.
11. ~~**May a suspended person delete their own account?**~~ **ANSWERED 2026-10-12: NO** — the request
    page is their route, and the new door checks `account_status` like the other four. **One
    consequence, and it changes the order below**: the refusal has to point somewhere, so the request
    page must exist first.
12. ~~**The export's contents**, four parts.~~ **ANSWERED 2026-10-12: the invited addresses on
    invitations they sent, YES; their teams' rosters, NO; their usage counts, NO; their suspension row,
    NO — and the privacy page says the two closed tables exist and how to ask for what is in them.**
    That last clause adds two sentences the owner can be held to, and `docs/claims.md` §7d carries
    them.
13. ~~**Is the export counted against a daily limit?**~~ **ANSWERED 2026-10-12: NO.** So
    `usage_counts` stays at three feature words and needs no migration, and **what bounds the export is
    Supabase's per-IP limits and nothing else** — said plainly rather than implied.
14. ~~**Does the deletion-request page have a form?**~~ **ANSWERED 2026-10-12: NO FORM.** Nothing is
    collected in the app; the cost is that the owner's own mailbox is the store, and that the owner has
    to check the request came from the address on the account.
15. ~~**Is the cookie answer "no banner"?**~~ **ANSWERED 2026-10-13: NO BANNER, WITH DISCLOSURE — and
    this is the one answer in the list that rests on a measurement rather than a judgement.** The owner
    looked, in Chrome, at production's signed-out `/login` at version `45d187b`, with storage cleared
    first and the widget settled, and found **less than anybody expected**:

    | Store | this app's origin | `challenges.cloudflare.com` |
    |---|---|---|
    | Cookies | **none** | **none** |
    | Session storage | **empty** | **empty** |
    | Local storage | **empty** | **ONE item: `cf.turnstile.u`** |

    **So this app stores NOTHING on a signed-out visitor's device** — not a cookie, not a storage item.
    The three things `docs/data-inventory.md` §5.1 says it can set are all written by signing in, by a
    link exchange, or on the reset path, and a signed-out `/login` does none of those. **The one item
    found is Cloudflare's, in Cloudflare's own frame**, which this app cannot read.

    **"With disclosure" is the part that is not optional**: the privacy page **names `cf.turnstile.u`**,
    says it is Cloudflare's and not ours, and says **Cloudflare does not document it** — because
    **three Cloudflare pages were read on 2026-10-13 and not one mentions it.** Its purpose and its
    lifetime are **NOT CONFIRMED**, and no guess at either is written anywhere; the only thing said
    without a citation is that local storage has no expiry of its own, which is a property of the store.
    `evidence/cookies.md` is the record, including the five things still not looked at — the other two
    screens, any signed-in page, an interaction-required challenge, any other browser, and a phone.
16. ~~**May the privacy page say Sentry does not store an IP address?**~~ **ANSWERED 2026-10-13: it may
    say "we do not send your IP address to Sentry", and it may NOT say Sentry does not store one.**
    Which is exactly the shape of what is held: `userInfo: false` in `web/src/sentry/options.ts` stops
    the SDK attaching one — that is **our** code, in this repository, checkable — and whether Sentry
    records the address a report arrives from is **a dashboard setting nobody has seen**, still "owner
    to set, not yet reported". **The two sentences are one word apart and the difference is who is
    promising**, which is why the answer is written as two sentences rather than one.
17. ~~**Every task in a doomed team, or only the orphan-producing ones?**~~ **ANSWERED 2026-10-13: THE
    NARROW READING — only the tasks that would become unreachable.** So step 4b stands as written, and
    `docs/deletion.md` is now a design rather than a design with a question in it.

    **AND THIS IS THE SECOND DELIBERATE DEPARTURE FROM THE BOOK, recorded as one at the owner's
    instruction.** The book's Build it 26 text has a deleted owner's teams go **"with that team's
    tasks"** — all of them. This app does not, and the reason is a decision already in this repository
    and older than the question: `20261002133637_tasks_join_teams.sql` chose `on delete set null` over
    `cascade` for this exact case, and said why in words this answer keeps — "Carol losing her own task
    because Alice closed her account is a stranger deleting Carol's work, and this database has no
    point-in-time restore on the free plan to undo it with."

    **What that costs, stated rather than implied:** a team whose owner leaves does **not** take the
    other members' tasks with it — each returns to the person who wrote it as a personal task, and
    **that person may not expect to find it there.** The warning in `docs/deletion.md` §5 is where they
    are told. The alternative cost somebody else's work, and this plan has preferred a surprise over a
    loss since 2 October.
**Where the question came from, kept because the order it happened in is the point.** It was not on the
owner's list: it was raised on 2026-10-12 by writing answer 7 down, which said "removes that team's
tasks … rather than leaving them to the set-null" — a sentence with two readings, one of which quietly
reversed the `set null` decision and decision 2's own promise that "nobody loses a task they wrote
themselves". `docs/deletion.md` was written to the narrow reading and **said so**, rather than choosing
for the owner; the answer of 13 October is that the narrow reading was meant.

`docs/deletion.md` section 13 holds 6 to 14 and 17 with the answer each came back with, and
`evidence/cookies.md` holds 15's reading. **Nothing in this list is open.** What is left is not a
question but a drafting job: **the words**, which answer 5 puts in the owner's hands.

### The order of the work

Documents first, then the read-only feature, then the schema, then the thing that destroys data. **One
pull request per row.**

**REORDERED 2026-10-12 by answer 11.** The request page was row 6 and is now row 5, and the reason is
in that answer: a suspended person may not delete their own account, so the refusal has to point
somewhere — and a refusal pointing at a page that does not exist is the shape this plan calls a refusal
nobody can act on.

| | What | Needs a staging run? |
|---|---|---|
| **0** | **This one.** The plan, the inventory, the deletion design. Documents only | no |
| **1** | The **privacy page** and the **terms page**: two public pages, footer links, and `"/privacy"`, `"/terms"` added to `PUBLIC_PATHS` in `web/src/lib/supabase/proxy.ts` — **without which a signed-out visitor is sent to `/login`**. Plus a `docs/claims.md` row for every sentence | **no** — nothing touches the database. **But a look in a browser, on a phone**, which is the device this plan says the app is for |
| **2** | ~~The **cookie answer**.~~ **FOLDED INTO ROW 1 by answer 15 of 2026-10-13**: there is no banner to build, so what is left is the disclosure — the list, and `cf.turnstile.u` named — which belongs on the privacy page row 1 already builds. **Row 2 is therefore empty on purpose rather than deleted**, so the numbering below does not move under anybody reading an older version of this table | — |
| **3** | The **export**. Read-only, no migration, no secret key, a route handler so the download needs no JavaScript | **yes.** Dave's export must contain Dave's data and none of Alice's |
| **4** | The **deletion schema**: nullable `owner_id`, the foreign key as `on delete set null`, the new branch in `tasks_enforce_column_rules`, **both** new delete policies — the team owner's on `tasks` and the one on `storage.objects` without which the first is unusable — and the **tombstone** table | **yes**, and the owner applies it |
| **5** | The **public deletion-request page** — **moved up from row 6 by answer 11** | no |
| **6** | **Delete my account**: a fifth server-function door, the warning screen, the typed confirmation, and the nine steps of `docs/deletion.md` §3 | **yes — the Dave test**, below |
| **7** | **The evidence files the launch checklist is waiting for**: `evidence/privacy-policy.md`, `evidence/terms-of-service.md`, `evidence/account-deletion.md`. All three are `type: evidence` in `checklist/launch.json` and all three are TODO today | no |
| **8** | One step added to `docs/restore-runbook.md`: **re-run the deletions a copy predates**; and the dashboard note for deleting a team by hand, which is where answer 7's orphan is swept | no, until the next drill |

**Row 4 before row 6, and that order is forced rather than preferred.** The deletion is refused by
`tasks_enforce_column_rules` the moment it tries to null an `owner_id`, so the function cannot be
written against today's schema at all.

**And row 4 no longer waits on a read.** This table said it needed "**one read nobody has done**: what
`storage.objects.owner_id` does when its `auth.users` row goes". The coach did it on 12 October:
**there is no foreign key**, which is why row 4 gained a second policy and step 3 of the deletion
stopped being optional.

### The Dave test, and how Dave gets created

**Four accounts, not three.** Alice, Bob and Carol cannot test a deletion, because deleting any of them
destroys the fixture every other staging script depends on. So Build it 26 adds **Dave**:
`teamtasks.staging.test+dave@gmail.com`, with

- **a team of his own**, so the warning has a team to name and the cascade has a team to take;
- **a task of his own**, personal;
- **an attachment** on that task, so step 2 of the deletion has a file to remove and the trigger has
  something to refuse;
- **and a task in Alice's team**, which is the whole point: that task is what must still be there
  afterwards, shown as **"Former member"**, with Alice and Carol able to tick and rename it.

**What the test proves, in one run:** Dave's team is gone; Dave's personal task and its file are gone;
**Alice's team is untouched**; the task Dave wrote in it is still there and still tickable; Carol sees
no change; and `select count(*) from usage_counts where user_id = <Dave>` is zero.

**How Dave gets created, now that staging has CAPTCHA on and the built-in sender's two emails an hour.**
Both obstacles are real and neither needs solving:

- **The CAPTCHA is not an obstacle at all.** Staging's Auth holds Cloudflare's **dummy** secret key, so
  a request carrying the dummy token is accepted — proved for sign-in by the owner on 11 October 2026
  (HTTP 400 `captcha_failed` without it, accepted with it, `evidence/captcha.md` section 1). `signUp`
  puts the token in the same place as `signInWithPassword` does, and the token lives in one place,
  `scripts/lib/captcha.mjs`.
- **The email is the obstacle, and the way round it is not to send one.** Staging uses Supabase's
  **built-in sender**: 2 emails an hour **per project**, and it refuses any address not on the
  project's team. Whether "Confirm email" is even on is **not verified** (`docs/claims.md`). So a
  sign-up could stall on an email that never arrives, for a reason nobody can see.

  **So the owner creates Dave in the Supabase dashboard** — Authentication → Users → Add user, with the
  account marked confirmed — which **sends no email and needs no CAPTCHA**. His password joins
  `ALICE_PASSWORD`, `BOB_PASSWORD` and `CAROL_PASSWORD` as `DAVE_PASSWORD`, in the same place and never
  printed. Everything after that — his nickname, his team, his task, his attachment — a staging script
  does while signed in as Dave, with the dummy token and no email at all.

  **The one email in the whole fixture is Alice's invitation to Dave**, which goes through
  **`invite-member` and therefore Resend**, is redirected to `EMAIL_TEST_INBOX`, and spends one of
  Alice's twenty for the day. Supabase's two-an-hour limit is never reached, because nothing in the
  fixture asks Supabase to send anything.

  **If the owner would rather use the app's own path**, a sign-up on a **Preview** deploy works — Preview
  holds the dummy sitekey — and Dave can be confirmed in the dashboard if the email does not arrive. It
  is the same fixture by a longer road, and it exercises one screen on the way.

**And one reason to prefer Dave for the upload steps rather than Alice**:
[#298](https://github.com/build-once/team-tasks/issues/298) records that every CI run already spends
one of Alice's thirty daily uploads on staging. Dave's thirty are his own.

### The gate this does not move: the production AI key

**Restated here because Build it 26 is where two of its three preconditions are met, and it is still
not the owner's cue to install anything.** From "AI suggestions — the consent setting" above and
[#204](https://github.com/build-once/team-tasks/issues/204), all of these before the production
`AI_API_KEY`:

1. the consent setting **live on production** and **seen to refuse with it off, on production** —
   staging is done, production has no profile rows at all because nobody has signed up;
2. **a privacy page exists in the app and is reachable from every screen**, carrying every item #204
   lists — what Suggest subtasks sends and to whom, that nothing identifying the asker goes, Anthropic's
   retention, that the setting starts off and switching it off recalls nothing, that the operator can
   access the database, that error reports go to Sentry with the error, the page, the browser and the
   user ID, **where data is held**, that copies remain for up to about a fortnight, and that after a
   recovery everybody signs in again;
3. **a row in `docs/claims.md` for each of those sentences**, naming the file and line that makes it
   true.

**Build it 26 delivers 2 and 3. It does not deliver 1**, and nothing in it should be read as doing so.

## A paid Team plan, and the first team size limit

Added 2026-10-14, for Build it 27, at the owner's instruction. **This one is a new thing people can
press, and it is the first thing in this app that takes money.** It is in the plan for three reasons,
and the third is the one this plan has never had to write before: it adds a **new outside company**
(Stripe), it holds a **new kind of row about a person** (what they are paying for), and it introduces
**the first limit this app has ever had on how many people may be in a team**.

**THE WHOLE OF IT IS A REHEARSAL. The owner's decision of 2026-10-14: build and test entirely in
Stripe's sandbox, and DO NOT CREATE LIVE KEYS.** So no money moves, nobody is charged, and the
production half of every arrangement below is written down and deliberately left unbuilt. That is not
a shortcut — it is the point of the step. What is being proved is the plumbing: that the server
decides, that a webhook is verified, that a repeat is ignored, and that no card number comes near this
app.

### What it is

A team may have **10 members**. A team whose **owner** holds an active Team plan may have **25**.
That is the whole of what the money buys in this version.

**And the 10 is new.** There has never been a limit on how many people are in a team: `docs/plan.md`
feature 2 caps teams per person at 3, and feature 3 caps **pending invitations** at 20 per team, and
neither of those is a size. So this build adds a rule that refuses somebody, which is worth saying
plainly rather than letting it arrive as a side effect of a pricing page. At the plan's group size —
"a volunteer group of about six" — nobody meets either number.

**Where it is checked: `invite-member` and `accept-invite`, against the entitlements table, in the
server functions.** Not on a screen, for the reason this plan gives everywhere else, and not in a
row-level policy, because a count across a team's rows is the same shape of question as "at most 3
teams per person" and "at most 20 pending" — both of which are already counted in a function that can
see all the rows and that the person cannot edit.

**Both doors, not one.** An invitation can be sent while a team has room and accepted after it has
filled, so checking only at the invitation would let the limit be walked past by whoever accepts last.

### Stripe, and what it sees

**The company.** Stripe. **Sandbox only in this rehearsal** — test keys, test cards, test webhooks.
The owner creates the objects; nothing in this repository creates a product or a price.

**NO CARD NUMBER EVER REACHES THIS APP, and that is not a promise about our care — it is a property of
the design.** Paying happens on **Stripe's own hosted checkout page**, at Stripe's address. This app
creates a checkout session on the server and sends the browser to the URL Stripe returns. There is no
card field anywhere in this app, no Stripe script in any page, and nothing for a card number to be
typed into. The same reasoning as the attachments bucket being private: the safest way to hold
something is not to hold it.

**What Stripe therefore sees, and it is a real widening:** the **email address** of anybody who starts
a checkout, their **card details**, and what they bought. Stripe is a payments company and holds that
as its own record, on its own clock, outside this project. Resend already sees everybody's address;
Stripe sees the address **and the payment**, which nothing else here does.

**What this app sends it:** a price id, a success and cancel address, and — so a second checkout does
not create a second customer — the person's **Stripe customer id** where we already hold one. **Not**
their task text, their team names, their nickname or anything they typed.

**What must never be sent:** a task title, a team name, a display name, a file, or any other person's
address.

### What is stored here, and nothing else

Two tables, and between them they are nine values.

**`entitlements`** — one row per person who has ever started a checkout: the **user id**, the **plan**,
the **status**, the **current period end**, the **Stripe customer id** and the **subscription id**.
Nothing about a card, no last four digits, no amount, no invoice, no address. A row says what this
person is entitled to and when that runs out, and is incapable of saying what they paid or with what.

**Who can read it: the person whose row it is, and nobody else.** Not their team mates, not the other
members of a team they own. **Who can write it: nothing that a person can reach.** No user may write
any row, ever — not their own. **Only `stripe-webhook` writes**, holding the service-role key, and
that is the whole of the design: *the thing that decides what you have paid for is the thing Stripe
talks to, not the thing you talk to.*

**`stripe_events`** — the **event id** Stripe sent, its **type**, and **when we processed it**. A
unique constraint on the id, so the same event arriving twice is written once and ignored the second
time. Stripe retries, so this is not a precaution.

**Nobody can read `stripe_events` through the app at all**, the way `usage_counts` and `account_status`
can be read by nobody: no policy and no privileges for any role.

### Reaching the success page grants nothing

**Said as its own heading because it is the commonest way this goes wrong.** A person who lands on
`/settings?paid=1` has proved only that their browser followed a redirect. Nothing in this app reads
that address and writes an entitlement, and nothing ever will. **Paid access changes when Stripe tells
the webhook it changed**, and at no other moment. The success page says "thank you, this may take a
moment", and the limit changes when the row does.

**And the webhook does not trust the event's contents either, for anything that changes paid access.**
Events can arrive out of order — a cancellation can reach us before the sign-up that preceded it. So
on any event that touches access, the function **fetches the current subscription from Stripe** and
makes our row match that. The event is a nudge saying "look again", not a statement of fact.

### The price on the pricing page comes from Stripe

Read by the server, from **the same price id the checkout uses**. Not typed into a template, where it
would become a number this app claims and Stripe disagrees with — which is the one kind of wrong a
pricing page must not be.

### What this deliberately is not

- **No live keys, and no live mode.** The owner's decision of 2026-10-14. Production's secret store
  stays empty of Stripe keys in this rehearsal, and the startup check below is what makes a mistake
  loud rather than expensive.
- **Not per-person billing, not seats, not usage billing.** One plan, one price, one thing it changes.
- **No invoices, receipts or billing history in this app.** Stripe's own portal and emails are where
  those live; building a second copy would mean holding amounts and addresses this plan has just
  decided not to hold.
- **No refunds, proration or plan switching in this app.**
- **Nothing is deleted differently.** The entitlements row is keyed by the person's id and goes with
  the account, like every other row; `docs/deletion.md` gains it. **What this app cannot do is cancel
  somebody's Stripe subscription for them**, and the deletion screen must say so rather than letting
  somebody delete an account and keep paying.

### The keys, which is Lesson O9 and the reason the rehearsal is safe

**Three rules, and the third is the one with teeth.**

1. **Local and staging use sandbox keys only** — a publishable `pk_test_` and a **restricted** key
   (`rk_test_`), never an unrestricted secret key where a restricted one will do.
2. **Production would use live keys, stored only in production's own secret store.** In this rehearsal
   there are none.
3. **No key of any kind goes in this repository**, which rule 7 already says and which a CI check now
   enforces for the two that would be worst: anything beginning `sk_live_` or `rk_live_`.

**And the server functions refuse to run if the key does not match the environment.** A test key in
production, or a live key anywhere else, means the function **stops and says so, naming neither the key
nor any part of it**. The reason this is a startup check rather than a note: a live key on staging
would take real money from real cards during a test, and a test key on production would silently let
everybody in for free. Both are quiet failures, and both are now loud ones.

**A TEST MODE banner is shown in the app whenever the publishable key starts with `pk_test_`.** So
nobody can look at a screen in this rehearsal and mistake it for the real thing — and when live keys
ever exist, the banner disappears by itself rather than by somebody remembering to remove it.

### Personal data this adds

Three rows for the appendix, and they are listed here as well because the appendix is long:

- **What somebody is paying for** — plan, status, period end, and two Stripe identifiers. Ours.
- **The processed event ids** — Stripe's identifiers and nothing about a person. Ours.
- **Everything Stripe holds**: an email address, card details, and a payment history. **Theirs**, on
  their clock, outside this project, and not deletable by anything in this app.

## Deliberately not in the first version

Comments. Reminder emails. A phone app.

Some of these come later, on purpose. When one does, this plan gets updated first.

**An AI helper left this list on 2026-10-07.** It is "Suggest subtasks" above. That is what "updated
first" looks like in practice: the line moved out of this list, and the section above was written,
before any code existed.

**File attachments left it on 2026-10-08**, the same way. It is "Files attached to a task" above, written
for Build it 23 with no bucket, no rule and no code in existence — so the list is now four things rather
than five, counted here rather than remembered.

**PAYMENTS LEFT IT ON 2026-10-14**, the same way again, and it is the last of the original five to go:
"A paid Team plan, and the first team size limit" above was written for Build it 27 before any code,
any table, any Stripe object or any key existed. **So the list is now three things**, counted here
rather than remembered — and the one thing worth noting about this departure is that it is a
**rehearsal**: payments have left the list in test mode only, and the owner's decision of 2026-10-14 is
that no live key is created. The line can be read as fully gone only when it takes real money.

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
- **A nightly encrypted copy of every line above it** — every table, the accounts with their password
  hashes, and every attached file — held by Cloudflare, outside this project, as ciphertext only, and
  removed after about a fortnight. It adds no new *kind* of data and it is the only line here that
  contains all the others, which is why the two lines below it were added after it rather than before
- **Every visitor's IP address, TLS fingerprint and browser string on the three sign-in screens** — sent
  to Cloudflare by the CAPTCHA, outside this project, and the **first IP address this app chooses to send
  anywhere**. "A CAPTCHA on the three sign-in screens" above. Added 2026-10-11
- **Every person's own email address at the email service**, once the sign-up and reset emails go through
  Resend — where today Resend sees only the addresses of people who were **invited**. "The sign-up and
  reset emails move to Resend" above. Added 2026-10-11
- **A file holding every line above it about ONE person**, built on request and handed to their browser —
  the export. It is stored nowhere, and it is the first artefact this app assembles that holds
  everything about somebody at once. "The documents, your own data, and deleting an account" above.
  Added 2026-10-12
- **The fact that an account was deleted, and when** — a tombstone row of two values and nothing else,
  kept **30 days** and removed by the statement that writes one. It exists only so that a restore from a
  copy taken before a deletion cannot bring a deleted person back. **Decided 2026-10-12 (question 10);
  not built.** Added 2026-10-12
- **What somebody is paying for** — their plan, its status, when the current period ends, and two
  Stripe identifiers. Six values in `entitlements`, nothing about a card, no amount and no invoice.
  Readable by that person alone and **writable by nobody a person can reach**. "A paid Team plan, and
  the first team size limit" above. Added 2026-10-14
- **The identifiers of the Stripe events we have already processed** — an event id, its type and when
  it was handled. Nothing about a person at all, and it is in this list because it is a new table
  rather than because it is personal. Added 2026-10-14
- **An email address and card details at Stripe**, for anybody who starts a checkout — **outside this
  project**, held by a payments company on its own clock, and the one line in this list this app
  cannot delete, search or even see. **No card number ever reaches this app.** Added 2026-10-14
- **A deletion request from somebody who cannot sign in** — an email address and whatever they write,
  **in the owner's own mailbox, outside this project**, because the public request page deliberately has
  no form and collects nothing in the app. It is in this list because "no table is involved" is not the
  same as "no personal data is held". **The address is `dp@raj-dhonota.com`** — answer 1 of
  2026-10-13 — and it is **published on a public page**, which is also what makes it the one address in
  this project that must not go unread. Added 2026-10-12, address added 2026-10-13

Nothing else: no phone numbers, addresses, birthdays or photos — **and that last word changed meaning on
2026-10-08.** The app still asks for none of those and has no field for a photograph; what it now has is
a box a person can put a file in, so a photo can arrive because somebody attached one to a task. "Files
attached to a task" above is where that is set out. We ask people not to put
sensitive information in task text, and the app does not need it.

Supabase and Vercel also record IP addresses, and Sentry would record one with every error report
unless the owner switches that off, which is what "Error reports to an outside service" above says
they will do. **And from 2026-10-11 there is a fourth kind of IP address in this plan, which is the one
to notice**: those three are recorded by companies that were going to log the request anyway, and the
CAPTCHA's is one this app **sends on purpose, to a company whose only job is to look at it.** The
appendix lists everything.

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

The nightly copy, added 2026-10-10, brings in **another company and adds £0 at this group's size.**
Cloudflare R2's published forever-free tier is **10 GB-month of storage, 1 million Class A and 10 million
Class B operations a month**, and **data transfer out is free**
([R2 pricing](https://developers.cloudflare.com/r2/pricing/), read 2026-10-10) — so fourteen nightly
copies of this app at six people sit inside it with room, and the headcount at which they stop doing so is
on that page too. `docs/costs.md` → "Backups: what the nightly copy and a restore drill cost" has the
arithmetic, and the one thing here that is **not** £0: **a restore drill creates a project, and a project
on a paid organisation is billed by the hour.** It is pennies, it is named on that page, and it is a
decision rather than a surprise.

The CAPTCHA, added 2026-10-11, brings in **a fifth outside company and adds £0**, which is the cheapest
thing on this page: Cloudflare's Turnstile free plan is "Up to 20 widgets", "Unlimited challenges (traffic
or verification requests)" and "10 hostnames per widget"
([Plans](https://developers.cloudflare.com/turnstile/plans/), read 2026-10-11) — and "unlimited" is a word
no other service on this page offers, so there is no arithmetic to do and no headcount at which it stops.
The sign-up and reset emails moving to Resend, added the same day, add **no new service and no new bill**:
Resend is already here, and the two emails fit inside the free plan's 100 a day beside the invitations.
`docs/costs.md` has both rows, and the one number on them worth keeping in step — Supabase's imposed
30-messages-an-hour Auth limit is 720 a day against Resend's 100.

Stripe, added 2026-10-14, brings in **a sixth outside company and adds £0 in this rehearsal, because
nothing runs in live mode.** Stripe's published pricing is per successful charge and there are no
charges in a sandbox: no monthly fee, no charge for a test payment, and the account itself costs
nothing. **The figure that matters is therefore not a cost but a direction** — this is the first
service in this app whose bill would be driven by somebody else succeeding rather than by us spending,
and it is also the first that could ever take money **in**. `docs/costs.md` has the row and the three
things that would have to be true before any of it is a real number.

**And one sentence of this section is now out of date for a reason that has nothing to do with backups.**
"Before real users arrive, production moves to a Supabase Pro organisation at about $25 a month" is what
happened on 10 October 2026 — so it has moved, and the plan is being followed rather than exceeded. This
section is left as written, because rewriting the Budget is the owner's and
[#250](https://github.com/build-once/team-tasks/issues/250) is where it is held.

**The Spend Cap is now ENABLED on the `DHTA Ltd` organisation — the owner, 10 October 2026.** This
paragraph said "What has **not** happened is anybody setting or seeing the Spend Cap that a billable
organisation now has", and that was true for a few hours. `docs/costs.md` calls the Cap "the strongest
control of any service here", and the window that page warns about — the same sitting as the upgrade —
was that day. **It answers part of #250 and not all of it:** that issue also wants the figures recorded
on the costs page and its stale "nothing can bill us" sentences fixed, and the Cap **excludes compute**,
so about $25 a month bills whatever the Cap says.

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
| Session and refresh tokens, last sign-in time | Keeping people signed in (feature 1) | Supabase `auth.sessions`, `auth.refresh_tokens`, `auth.users` | Nobody — they are secrets | Until sign-out or expiry. **And a restore does not bring them back — the owner's decision of 2026-10-11**: they are in the nightly copy like everything else, and the restore deliberately leaves them there, so after a recovery everybody signs in again. "What a restore brings back, and what it does not" above | Sign out | **Yes** — credentials |
| Hosting access logs: IP address, browser and device, page visited | **Nothing** — Vercel writes them anyway; we add no logging of our own | Vercel — outside your database | Owner via Vercel; Vercel | UNSURE — short, depends on plan | Not user-deletable | **Yes** — IP address and device |
| Database and API logs, including caller IP | **Nothing** — Supabase writes them anyway; we add no logging of our own | Supabase logs | Owner via dashboard; Supabase | UNSURE — see notes below | Not user-deletable | **Yes** — IP address |
| Analytics | **Nothing — none is collected, and none is planned** | Nowhere | — | — | — | No |
| An error report: the error's type, message and stack trace; the page path; browser and operating system | "Error reports to an outside service" above — so a broken app is noticed by the owner rather than by a volunteer | Sentry — outside your app and outside your database. **IT IS INSTALLED AND IT HAS SENT REAL EVENTS, WHICH THIS CELL DENIED UNTIL 2026-10-12.** It said "**Nothing is installed, so nothing has been sent yet**". What is true: `@sentry/nextjs` **11.4.0** is in `web/package.json`; the code is in all three runtimes with one settings file, `web/src/sentry/options.ts`; a **Production or Preview build refuses to complete without `NEXT_PUBLIC_SENTRY_DSN`** (`web/src/lib/env.ts`), so a deployed build cannot be one that sends nothing; and the owner watched three visits to a test page on a **Vercel Preview** produce events in Sentry on **6 October 2026** (`evidence/build-it-18-sentry.md` §11–14). **Whether PRODUCTION's DSN is set is an INFERENCE** from that build check — nobody has opened the Vercel or the Sentry dashboard, and no production event has been seen | Owner via Sentry; Sentry | **Not confirmed** — Sentry publishes a free-plan retention period; that page has not been read, so no number is written here | **No way in the app.** The owner can search Sentry for a person's events and delete them — **not yet tried** | **Yes** — a message or a stack trace can quote whatever the code was holding, which is why task text, addresses and tokens must never reach one |
| The signed-in person's user ID, attached to an error report | Tells the owner whether one person or everyone is hitting an error, without an address | Sentry — as the row above | Owner via Sentry; Sentry | **Not confirmed** — as the row above | **No way in the app** — it is what the owner searches by to delete the events; **not yet tried** | No on its own — it is not an address — but it links a person to everything else in the report |
| The caller's IP address on an error report | **Nothing** — Sentry stores one by default, and we do not want it | Sentry, unless switched off | Owner via Sentry; Sentry | **Owner to set, not yet reported**: the owner will switch on Sentry's setting that stops an IP being stored, and its default data scrubbing. Neither has been seen in the dashboard | Not user-deletable | **Yes** — IP address |
| One task's title, sent to an outside AI service | "Suggest subtasks" above — the helper cannot suggest subtasks for a task without its title. Sent with fixed instructions and nothing else: no address, no display name, no user ID, no team name, no other task | Anthropic's Claude API — outside your app and outside your database. **STALE, AND [#195](https://github.com/build-once/team-tasks/issues/195) HAS SAID SO SINCE 8 OCTOBER.** This cell said "**Nothing is installed, so nothing has been sent yet**". What is true: **staging has the key and the function**, and requests have been made from there — the owner's runs of `scripts/staging/build-it-20-ai-checks.mjs`; **production has the function and NO KEY**, so the helper there answers that suggestions are not available and nothing is sent. The section above says both, and this cell did not | The person who pressed the button; owner via Anthropic's console; Anthropic | Anthropic's published retention: deleted **within 30 days** of receipt or generation, with stated exceptions — and **up to 2 years**, with classification scores up to 7 years, for anything flagged as a Usage Policy violation. Cited in "Suggest subtasks" above. Nothing is kept on our side | **No way in the app**, and there is nothing of ours to delete. What Anthropic holds runs on the clock above; **not tried** — no request has ever been sent | **Yes** — it is task text, which people type anything into, and this is the one row in this table where task text leaves the project |
| Whether AI suggestions are switched on, and when that last changed | "AI suggestions — the consent setting" above — the row *is* how the function knows whether a task title may leave this project | `profiles.ai_suggestions_enabled` and `profiles.ai_suggestions_changed_at` — **built**: the two columns, the trigger that stamps the second and refuses any caller who supplies it, the constraint that makes "on with no date" unrepresentable, and `my_ai_suggestions()`. Applied to staging and to production on 2026-10-08 (see the "Unverified" entry below for who did each, and the evidence) | The person whose setting it is, through `my_ai_suggestions()` — **no client role may SELECT either column**, so a team mate cannot read it through the existing "your team mates' profiles" policy; owner via the dashboard; `service_role` may read it and may **not** write it, so no server function can switch it for anybody | With the profile | **Not on its own** — switching it off is the control a person has, and the value goes when the profile goes. There is still no way to delete a profile in the app | No, but it records a choice a person made about their own data |
| The suggestions that come back | "Suggest subtasks" above — they are what the person reads | **Nowhere in this project unless the person adds one**, which writes an ordinary `tasks` row. At Anthropic, as the row above | Before anyone adds one: only the person looking at the screen. After: as any task — its creator, and its team if it has one; owner | Not stored by this app at all until somebody adds one; then with the task. At Anthropic, as the row above | Delete the task — **built**, exactly as for a task somebody typed | **Yes** — until somebody reads it, it is text from outside this project; it is treated as data and never as instructions |
| A file attached to a task, and whatever is inside it | "Files attached to a task" above — feature 4 with a file beside the text. The file *is* the thing somebody wanted to share | A **private** Supabase Storage bucket named `attachments`, at `attachments/<task id>/<file name>` — **inside this project**, not outside it. **Built, and applied to staging and to production on 2026-10-09**: `supabase/migrations/20261008191804_attachments_bucket.sql`, with `evidence/build-it-23-attachments-bucket.md`. **Production has never been read back** ([#243](https://github.com/build-once/team-tasks/issues/243)). The screen is **built and deployed nowhere** (#242) — the files panel on My tasks, with the upload box — so **the only files that have ever existed in either bucket are the ones the owner's staging script stored and removed again**, and production's bucket is empty because nobody has signed up. **3 per task, 5 MB each, 100 MB per person**, the last enforced on the server at upload. **The bucket allows six named types with no wildcard, so no SVG — JPEG, PNG, WebP, GIF, HEIC, PDF — and THE APP OFFERS FIVE OF THEM**: a HEIC photograph failed through the app on 2026-10-09, the cause was not found, and the owner decided not to pursue it ([#246](https://github.com/build-once/team-tasks/issues/246)), so the app refuses that one before anything is sent while the bucket still permits it | Exactly the people who can see its task: its creator for a personal task, every member of its team for a team task — **and a suspended person nobody**. Plus the operator, in the dashboard. Opened through a **signed link that expires after 5 minutes**, and for those five minutes **anyone holding that link** can open the file, signed in or not | **With the task, and that is enforced rather than intended — decided 2026-10-08.** Deleting a task deletes its files first and is refused if they cannot be removed, **and the database refuses to delete a task that still has files**. So there is no state in which a file outlives its task. Removing a person's files when an account is deleted is **a requirement of Build it 26** | **Delete the file, or delete the task it is on** — the second removes the first. **A file may be deleted by whoever uploaded it, or by whoever created its task, and by nobody else** (decided 2026-10-08). So on a team task a third member can see and open a file and remove nothing. Deleting a task removes all its files **under the creator's own rights**, so no part of this app deletes anything with more authority than the person asking | **Yes**, and more so than anything else in this table. It is a file nobody read before it was stored, it can be a photograph carrying **where and when it was taken** — which the app does not remove, and **the upload box says so** — and it can be a document about a third party who never agreed to anything |
| What Storage records about each file | **Nothing** — Supabase Storage writes the row whether we want it or not; this is the first row in this table with that shape that is also **inside** our own project | `storage.objects`: `name` (the whole path, so **the task's ID and the file name the device gave it**), `metadata` (holding the size), `owner_id` (the uploader), `created_at`, `updated_at` — cited in the section above. **The declared type is not confirmed**, and so is **`last_accessed_at`**, which the schema page omits and the API reference shows — and which, if it exists, records **when somebody last opened a file** | The operator, in the dashboard; Supabase. Through the app, only as far as a storage rule is written to expose it | **With the object, and the object goes with its task** — so this row inherits the row above's answer rather than outliving it, which is a change from what this table said earlier on 2026-10-08 | **With the file.** Deleting the file deletes the row Storage keeps about it; there is nothing separate to remove | **Yes** — a file name is free text somebody's phone chose or somebody typed, which is why no file name may ever appear in an error report |
| How many times a person used each limited feature on each day — **two features live, and a THIRD is written and applied nowhere**: `uploads`, 30 a day, in `supabase/migrations/20261012120000_upload_daily_count.sql` (2026-10-12). It is counted by a **BEFORE INSERT trigger on `storage.objects`** rather than by a server function, because an upload has no Edge Function in its path — so it is the first entry here written by something other than an Edge Function, and the first that bounds **traffic** rather than a bill. The row's shape is unchanged: still four values, still incapable of saying which file | "Daily limits on what costs money" above — the count *is* how a server function knows whether this person has reached today's limit, and a limit that is not counted somewhere every isolate can read is not a limit | `usage_counts` — **built, and applied to staging and to production on 2026-10-08**: `supabase/migrations/20261008115900_usage_counts.sql`, with `evidence/build-it-22-usage-counts.md`. **AND THE TWO EDGE FUNCTIONS THAT WRITE IT ARE LIVE IN BOTH PROJECTS, WHICH THIS CELL DENIED UNTIL 2026-10-11.** It said they "are **deployed nowhere**, so the table is empty in both projects", and [#230](https://github.com/build-once/team-tasks/issues/230) had said that was stale since 8 October. What is known, and it is different for each project: **STAGING** has both functions, deployed by the owner on 2026-10-08, and **the table is NOT empty** — the coach read two rows off it through the read-only connector, `ai_suggestions` used 4 and `invitations` used 1 (`evidence/build-it-22-daily-limits-counting.md` § 12). **PRODUCTION** got both functions on the merge of PR #228, run [37809688847](https://github.com/build-once/team-tasks/actions/runs/37809688847), "Deploy server functions to production: success" — and **whether production's table holds a row has never been read by anybody** ([#222](https://github.com/build-once/team-tasks/issues/222)). What can be said about it without reading it: `invite-member` there counts every send, and `suggest-subtasks` there writes nothing, because `not_configured` is decided before the count. **"Empty" was the one kind of error this register must not make**, which is why the correction is written out rather than swapped in. Four values: the person's ID, the feature, the day, the count. **No task id, no title, no address, no team, no time of day** | **Nobody through the app**, not even the person whose count it is — **no rule and no table privileges for any role at all**: not for signed-in or signed-out callers, and **not for `service_role` either**, which holds only the right to run `count_daily_use()` (the owner's correction of 2026-10-08). The app's **operator** via the dashboard. **Not a team's owner**, for whom there is nothing to read | **7 days, decided 2026-10-08**, removed by the same statement that counts — so the window is enforced by code rather than by anybody remembering. Unchanged by the third feature word | **They cannot.** It goes with the account, and there is still no way in the app to delete an account | No, but it records **which days a person used this app**, which is the same kind of fact as the exact timestamps row above |
| **A nightly encrypted copy of everything above** — every table, the accounts with their password hashes, and every attached file | "A nightly copy of production, held by another company" above — Supabase's own backups cover the database and **not** the files, so the one thing in this app nobody can retype is the one thing nothing backs up ([#248](https://github.com/build-once/team-tasks/issues/248)) | A **private** Cloudflare R2 bucket named `team-tasks-backups`, region **Western Europe (WEUR)**, public development URL **disabled** and **no custom domain** — **outside this project, and a company that was not part of it the day before.** Encrypted on GitHub's runner before it leaves, so what Cloudflare holds is **ciphertext only**. **BUILT, THREE COPIES EXIST, ONE HAS BEEN RESTORED, AND COPIES NOW EXPIRE**: `.github/workflows/backup-production.yml`, `.github/workflows/backup-freshness.yml` and `scripts/backup/` are exercised in CI against made-up data on every pull request (`evidence/build-it-24-nightly-copy.md`). This cell has said "**NO COPY HAS EVER BEEN MADE**", then "**the workflow has never run**", then "**NO RESTORE HAS EVER FINISHED**", and all three are gone: the owner made two copies by hand on 10 Oct, **the schedule made the third by itself on 11 Oct** ([38121029695](https://github.com/build-once/team-tasks/actions/runs/38121029695), success in 38 seconds), and **the drill of 10–11 Oct put one back in 219 seconds** — 47 tables, 269 rows, one file byte for byte, signed into with a real account, project then deleted (`evidence/restore-tested.md`). **A 14-day lifecycle rule exists** on the bucket, named `delete-after-14-days`, owner-reported for 10 Oct, so the 14 days in the next column is now a thing happening rather than only a decision ([#259](https://github.com/build-once/team-tasks/issues/259)). **What is still not done**: no second drill, so 219 seconds is one measurement; no bucket lock; and `evidence/backups-on.md` does not exist, which is the open half of [#249](https://github.com/build-once/team-tasks/issues/249). **And "every night" is nightly-ish**: that first scheduled run started **5h 57m 24s** after its cron time, so the window between copies is about a day and a quarter rather than a day — `docs/backups.md` → "The two targets". The bucket, the token and the three `BACKUP_*` GitHub environment secrets are the **owner's report of 2026-10-10**; nobody writing this opened a dashboard | **Only somebody holding BOTH the storage key and the passphrase** — the key gets the file, the passphrase opens it, and neither alone is enough. So: the owner, and nobody else. **Cloudflare cannot read it.** The passphrase is in the owner's password manager and a GitHub environment secret and nowhere else, and **a GitHub secret cannot be read back**, so the password manager holds the only readable copy. **If it is lost, no copy can ever be opened.** The coach and the coding assistant never receive a copy, a part of one, or the passphrase | **14 days, decided by the owner on 2026-10-10**, removed by a Cloudflare R2 object lifecycle rule rather than by the job — so retention cannot drift, and the job never needs to delete anything. Cloudflare's own page allows up to a day for a removal, so the real window is **up to about fifteen days**. **And a 13-day Bucket Lock is PROPOSED beside it**, which would make nothing in the bucket deletable or overwritable for the first 13 days of its life — including by the owner, which is the trade | **They cannot, and this is the row where that answer bites hardest.** Deleting a file or a task removes it from the app at once; **it stays in the copies already made until they expire**, so "deleted" means gone in up to about a fortnight. Nothing can make it otherwise — a backup that honoured deletions would have honoured the wrong one too. **Build it 26 must say this to users** when deleting an account arrives | **Yes — the most, of anything in this table, and for a different reason from every other row.** Not because of what it is but because of **how much**: it is every other row at once, including the password hashes and the files nobody read, in one file at a company that was not part of this project yesterday. What makes that acceptable is that the file is useless without the passphrase; what it costs is that the passphrase is now the most valuable string in this project |
| **A visitor's IP address, TLS fingerprint and browser string on the three sign-in screens** — Cloudflare's "Signals" | "A CAPTCHA on the three sign-in screens" above — the CAPTCHA cannot tell a bot from a person without looking at the request, and today the only thing limiting sign-in is a Supabase default nobody has read (`docs/rate-limits.md`) | Cloudflare Turnstile — **outside this project, and a company that was not part of it the day before.** **IT IS ON, IN BOTH PROJECTS, AND THIS CELL SAID "NOTHING IS INSTALLED" UNTIL 2026-10-12.** It listed "no package, no site key in any environment, no secret key in either project's Auth settings, no widget on any screen", and every clause of that stopped being true on the evening of 11 October: the widget is on all three screens, site keys are in Vercel for Preview and Production, both projects' Auth settings hold a secret key — the dummy one on staging, the real one on production — and a sign-in carrying no token is refused **HTTP 400 `captcha_failed`**. All owner-reported; `evidence/captcha.md` is the record, and **nobody writing this opened a dashboard**. Cloudflare's own list of what it processes is "client IP address, TLS Fingerprint, User-Agent Header and Sitekey and associated origin" ([Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/), read 2026-10-11). **Nothing of ours stores any of it**; the token the widget hands back goes to Supabase Auth and is never written down | Cloudflare. The owner, through Turnstile's analytics, which the free plan keeps for "7 days maximum" ([Plans](https://developers.cloudflare.com/turnstile/plans/), read 2026-10-11). **Not this app**: no screen and no table ever holds a Signal | **Not confirmed, and no number is written here.** The addendum read on 2026-10-11 states no retention period. Read Cloudflare's own page and cite it, or write that none could be found | **They cannot**, and there is nothing of ours to remove. It is Cloudflare's record of a request, on Cloudflare's clock | **Yes** — an IP address, which is this table's standing reason for that answer. And it is the **first IP address this app chooses to send out**: the four log rows above it are written whether we want them or not |
| **Every person's own email address at the email service**, on sign-up and on every password reset | "The sign-up and reset emails move to Resend" above — Supabase's built-in sender "will refuse to deliver messages to addresses that are not part of the project's team" ([Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), read 2026-10-11), so on production as it stands a volunteer receives neither email | Resend — **outside your app**, which already holds the "Sent-invitation logs" row above. **IT IS DONE ON PRODUCTION, AND THIS CELL SAID "NOTHING IS CHANGED YET" UNTIL 2026-10-12.** Custom SMTP was set on **production** on 11 October 2026, through Resend, and a reset email arrived at the test mailbox; **staging keeps the built-in sender** (decision M). So the widening below is **real rather than planned**, and nothing in this repository can read either project's SMTP setting back. Owner-reported. What widened is **whose** addresses Resend sees: today only people who were **invited**, afterwards **everybody who uses this app**. The message body carries Supabase's confirmation or reset **link**, which until it expires is a credential — the same class as the invitation token row above | Owner via Resend; Resend | 30 days on the free plan, as the invitation-log row above. **This app keeps nothing at all** — no row, no status, no log line, which is also why it cannot tell somebody their reset email failed | **They cannot.** Not user-deletable; the owner clears it in Resend, as for the invitation logs | **Yes** — the log becomes a record of **who signed up and who has been resetting their password**, and the body carries a live credential while the link lasts |
| **An export file: every row of this table that is about ONE person, in one JSON file** | "The documents, your own data, and deleting an account" above, and the first of the five rights that section lists — "what do you hold about me?" is not answered by a document that describes the shape of the answer | **Nowhere.** It is built on request from rows the person can already read, **with their own rights and no secret key**, and handed to their browser. Nothing of it is stored, logged or sent anywhere. **NOT BUILT** | The person themselves, and whoever they give the file to. **Nobody else, and no server function assembles it on anybody's behalf** | **Not kept at all.** It exists for the length of one request, and then only on the person's own device | **Not applicable** — there is nothing of ours to delete. The app's part of it is a read | **Yes**, and it is the one row here whose risk is about **concentration** rather than content: every line of it is readable by that person today, and the file is new. Somebody holding a session can take it |
| **That an account was deleted, and on what date** — a tombstone of two values | "The documents, your own data, and deleting an account" above. **One reason only**: a restore from a copy taken before a deletion would otherwise recreate the account, the tasks, the nickname and the files of somebody who asked to be gone, and nobody would notice, because a successful restore is one where everything matched | A table of **two columns** — the `auth.users` id and a date — with **no policy and no privilege for any role**, exactly as `account_status` and `usage_counts` have none. No address, no nickname, no task text, no reason. **DECIDED 2026-10-12 (question 10, option A), NOT BUILT** | **Nobody through the app.** The app's operator, in the dashboard, and the restore | **30 days**, removed by the same statement that writes one — the mechanism `count_daily_use` already uses for its 7 days. **30 is chosen because it outlives the longest-lived copy that could resurrect the person** (about fifteen days) and nothing more. So it is a note that expires before the thing it exists to correct does, not a register of departures | **They cannot**, and it is the one row in this table where that is the point: it is the record that their deletion happened | No — it is an id and a date, and it holds nothing a person typed. **But it is a fact about a person held after they asked to be forgotten**, which is why it is bounded at 30 days rather than kept |
| **A deletion request from somebody who cannot sign in** — their address, and whatever they chose to write | The public request page: somebody who has forgotten their password, whose account is suspended, or **who was invited and never had an account at all** — whose address is in `invitations` and who this app has no other way of hearing from | **The owner's own mailbox, outside this project.** The page deliberately has **no form** — question 14, **decided 2026-10-12** — so nothing is collected in the app: no row, no endpoint, no email sent by this app, no CAPTCHA and no rate limit needed. **NOT BUILT** | The owner; whoever runs that mailbox | **Not decided here, and the owner's to decide**, because it is their mailbox. The request should be deleted once the deletion is done | **They cannot through the app.** They can ask the owner, in the same message | **Yes** — free text somebody wrote, which can say anything, plus the address it came from. **And the address is what proves who is asking**: the request must come from the address on the account, or anybody who knows a volunteer's address could have their account destroyed |

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
- **A named list of types, and 5 MB**, so the bucket cannot quietly become a file share — six types in
  the bucket, five offered by the app. And the limit is **stated for what it is**: Storage checks the type
  the upload *declares*, so a renamed file gets through, and the app promises the refusal rather than the
  contents.
- **No wildcard, added 2026-10-08 after the migration's review.** This bullet said "two types" and the
  bucket was given `image/*`, which collects **more** than it has to: it would have accepted
  `image/svg+xml`, a document that can carry script, served back from this project's own address. Naming
  the six types is the reduction — and it is the only one in this list that was found by somebody reading
  the code rather than by writing the plan, which is an argument for the review and not against the plan.
  **HEIC was then added on purpose, by the owner**, because an iPhone photograph is the commonest thing
  this feature exists for; that widens the list by one named type and not by a class. **And on 9 October
  2026 the APP stopped offering that one**, after a HEIC photograph failed through it and the cause was
  not found — so the app now collects one type fewer than the bucket allows, which is a reduction nobody
  intended and is recorded rather than celebrated ([#246](https://github.com/build-once/team-tasks/issues/246)).
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

### Added 2026-10-10 — collecting less in a backup

Kept apart again, and this one is the hardest of the six by a distance, because **the usual move is not
available and neither is the attachment section's fallback.** Every list above reduces by choosing what to
leave out of something this app composes — one title and not the list, a code and not the reply, a count
and not a log. The attachment list could not do that, because a file arrives whole, so it reduced the
*edges* instead: how many, how big, how long a link lives, who can open it. **A backup cannot even do
that.** Its whole purpose is to contain everything; a backup that left things out would be a backup that
fails at the one moment it is needed. So what is left to reduce is: **how long, who can read it, and
whether anybody can print it.**

- **Encrypted before it leaves the runner, not after it arrives.** This is the reduction that does the most
  work, and it is about the *new company* rather than about the data: Cloudflare holds a file it cannot
  open, so adding another company adds **no readable personal data anywhere**. Neither Sentry nor Anthropic
  can say that.
- **One key, in two places, one of which cannot be read.** The passphrase is in the owner's password
  manager and a GitHub environment secret, and never in this repository, a `.env` file, Supabase,
  Cloudflare or a chat. **And the coach and the coding assistant never receive a copy or the passphrase**,
  which is the same line the restore drill draws.
- **A private bucket with no public URL and no custom domain**, so nothing in it is reachable by address —
  the same reduction as the `attachments` bucket's, for the same reason.
- **Fourteen days, removed by a lifecycle rule rather than by anybody remembering.** Decided by the owner
  on 2026-10-10. This is deliberately the same move as the usage count's 7-day window being part of the
  statement that counts: a retention period nobody enforces is not a retention period. And it is the
  **only** number in this list that bounds how long a deleted thing survives, which is what makes it the
  one that was argued about rather than waved through.
- **And a 13-day Bucket Lock, PROPOSED 2026-10-10, which is the one item on this list that collects
  MORE rather than less.** It would make a copy undeletable and un-overwritable for 13 days — so a stolen
  storage key could read the copies and not destroy them, and **nobody could clear a copy early, the owner
  included.** It is on this list because leaving it off would be the kind of silence this list exists to
  prevent: every other bullet here reduces, and this one knowingly does not.
- **No artifact, and nothing printed.** The plaintext never leaves the runner and the run log carries names,
  sizes and statuses and nothing else — which matters more here than anywhere else in this plan, because
  this repository is public and the thing passing through is every row of everything.
- **And one reduction that is NOT taken, written here so it is a decision rather than an oversight:** the
  copy does **not** leave out the things the app itself makes unreadable. `account_status.reason` — free
  text about a person — and `usage_counts` are both in the copy, though the appendix says nobody can read
  either through the app. Leaving them out would mean a restore that silently un-suspends somebody or
  resets a day's counts, which is a worse failure than holding them. **The copy is as readable as the
  database it came from, and the passphrase is the whole of what stands in front of it.**

### Added 2026-10-11 — collecting less at the door, and in the two login emails

Kept apart again, and this one is a different shape from all six above: **both of today's additions are
things somebody else collects, not things this app composes or stores.** Every list above reduces what we
write down or what we send. Here the app writes down nothing at all — no Signal, no delivery record, no row
— and what is left to reduce is **who else gets to see it, and how long for.**

- **No CAPTCHA anywhere but the three sign-in screens.** Not on the invite form, not on Suggest subtasks,
  not on the upload box. Every one of those is behind a sign-in already, and the limits that belong there
  are counts in our own database (`usage_counts`) rather than a third party watching a signed-in person
  work.
- **Nothing of a Signal is stored by this app, and nothing of it is logged.** The token the widget produces
  goes to Supabase Auth and is never written to a row, a log line or an error report. There is no column
  anywhere in this project for anything Cloudflare collects.
- **No Enterprise features, and the reason is this list's reason rather than the price.** Turnstile's
  Enterprise tier offers "ephemeral IDs", which is a per-visitor identifier this app has no use for and
  would rather not have the option of.
- **The reset screen's one sentence survives the move to Resend**, which is the reduction that was hardest
  to keep: the app still does not read the answer, still has no branch, and `scripts/password-reset-check.mjs`
  still refuses a second one. So the app learns nothing about which addresses have accounts, even though
  what now sends the email keeps a log that would say.
- **Staging is NOT given custom SMTP**, proposed 2026-10-11. One fewer place holding a credential that can
  send email as this app, and nothing on staging needs a real person to receive anything.
- **And two reductions that are NOT taken, written here so they are decisions rather than oversights.**
  The first: **an IP address leaves this project on purpose for the first time**, and that is the whole of
  what the CAPTCHA costs. The alternative was to lower Supabase's own rate limits and nothing else — which
  collects least and stops nobody who has more than one IP address. The second: **Resend's log becomes a
  record of who signed up and who resets their password**, where today it holds only invited addresses.
  There is no version of custom SMTP that does not do that; the alternative is the built-in sender, which
  on production **delivers nothing at all** to the people this app is for.

### Added 2026-10-12 — collecting less while telling people more, and while destroying things

Kept apart again, and this one is a different shape from all seven above: **every list before it reduces
what is collected. This one is mostly about a build whose job is to GIVE DATA BACK and THROW DATA
AWAY**, so "collecting less" here means not adding anything on the way.

- **The export needs no secret key and no new privilege.** Nearly everything in it is already readable
  by the person through row-level security, and their address is on the session's own user object — so
  the export is a read **with their own rights**, and the policies are what keep it to their own data.
  Nothing new is granted to anybody, and no server function assembles anybody's data on their behalf.
- **The export leaves out the two tables nobody may read**, which is the awkward reduction rather than
  the comfortable one: their `usage_counts` rows and their `account_status` row, including the owner's
  free-text reason. Including either would mean a new privilege and would contradict the plan's own
  "nobody through the app, not even the person it is about". **So the privacy page SAYS both exist and
  what each contains, and that they are available from the owner on request** — which is the honest
  version of leaving them out, and is what makes it a reduction rather than an omission.
- **The export leaves out other people**, and that is where the line is drawn: no team rosters, no
  other members' nicknames, no team tasks somebody else wrote. A roster in a durable file is a list of
  other people.
- **The deletion-request page has NO FORM**, which is the biggest reduction in the whole build: no row,
  no endpoint, no email sent by this app, no CAPTCHA to add, no rate limit to choose, and no new store
  of strangers' addresses. **The cost is stated rather than hidden**: the owner's own mailbox becomes
  the place a request sits, and the owner has to check that the request came from the address on the
  account — without which anybody who knows a volunteer's address could have their account destroyed.
- **The tombstone is two columns and expires before the thing it exists for.** A user id and a date; no
  address, no nickname, no task text. **30 days**, removed by the statement that writes one, chosen
  because it outlives the longest-lived backup that could resurrect the person and nothing more. The
  obvious design — a durable list of who has been deleted — is exactly the "permanent record wearing a
  window's label" this plan rejects everywhere else.
- **And two reductions that are NOT taken, written here so they are decisions rather than oversights.**
  The first: **the export is not rate-limited — question 13, decided 2026-10-12**, so it is the one new
  way to pull everything about yourself repeatedly. It spends nobody's money, which is why the
  daily-limit argument does not reach it, and a fourth feature word would need a migration; **what
  bounds it is Supabase's per-IP limits and nothing of ours.** The second: **a
  deletion does not remove anything from the nightly copies**, and cannot. A backup that honoured
  deletions would have honoured the wrong one too, which is the same sentence "A nightly copy of
  production" already carries, arriving at the one feature it bites hardest on.

### Not affected by any of these decisions

The three things below are unchanged, because there was nothing to reduce:

- **Team name.** Nothing to remove — but ask for names that do not identify the members:
  "Tuesday crew", not a family name.
- **Team membership.** Nothing to remove. It *is* the rule that enforces feature 5.
- **Sign-in audit records and session tokens.** Cannot be switched off. Never copy them into your
  own tables, and never build a feature on them.

## Two gaps this table exposes

**There is no way for anyone to delete their account.** Features 1 to 5 do not include it, which is
why **nineteen** rows above say the owner must delete by hand, or that nobody can: nine of them from
the first version, the two suspension rows added on 2026-10-04, four added on 2026-10-05 — an
invitation's status and the three error-report rows — two added on 2026-10-07, the task title sent
to Anthropic and the AI-suggestions setting, **one added on 2026-10-08**, the daily usage count, and
**one added on 2026-10-10**, the nightly copy.
(Fifteen before 2026-10-07, seventeen after it, eighteen on 2026-10-08; the count was made again on
**2026-10-10** by reading the table's "How a user deletes it" column for all **30** data rows, after the
nightly-copy row was added, and it came to nineteen. Every one of those
numbers was counted in the session that wrote it, not carried forward.) That is a
report, not a suggestion: as written,
this app collects personal data and offers no way out. Decide whether that is acceptable for six
volunteers, or whether the plan changes.

**AND IT IS TWENTY-ONE AS OF 2026-10-11, because Build it 25 added two rows and both answer "they
cannot".** What was counted in this session, and what was not, said exactly: the table now holds **32**
data rows, counted here by reading it; the two added today — Cloudflare's Signals, and everybody's own
address at the email service — both say **they cannot** in the "How a user deletes it" column, so the
figure goes up by two. **The nineteen itself was counted on 2026-10-10 against 30 rows and is carried
rather than re-made**, which is the one place this paragraph departs from its own rule, and it says so
rather than quietly re-asserting a number. Both new rows are **outside this project**, which is the
harder version of the gap: there is nothing of ours to delete, and for the CAPTCHA there is nothing to
search by either.

**AND BUILD IT 26 IS WHAT CLOSES IT — THE PART OF IT THAT CAN BE CLOSED. Added 2026-10-12, and the
number is said carefully because this paragraph's own rule is that a figure is counted or declared
carried.** This change adds **three** rows to the table, so the table now holds **35** data rows — **32
plus 3, which is arithmetic on the 32 counted on 2026-10-11 and not a fresh count of the table**. Of
the three, two answer "they cannot" (the tombstone, and a deletion request in the owner's mailbox) and
one is "not applicable" (the export, where there is nothing of ours to delete), so the twenty-one
becomes **twenty-three** — **also carried arithmetic, on a number this paragraph has already said was
carried rather than re-made.**

**What Build it 26 does to those twenty-three, and what it cannot do.** It gives a person **one route
that works**: delete the account, and every row keyed to their id goes with it. So the many rows whose
answer is "the owner deletes by hand" stop being the only answer for anything inside this project.
**What it cannot reach is everything outside it** — Sentry's reports, Resend's log, what Anthropic
holds, the four log stores nobody chose, and **the nightly copies for up to about a fortnight.** The
honest form of this section after Build it 26 is therefore not "the gap is closed": it is **"inside this
project, yes; outside it, here is the list and here is what the owner can do about each"**, which is
what the privacy page has to say. **The column is re-counted when the feature exists**, and not before.

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
thing that would make it better for the other **nineteen** rows. (That word said "eighteen" until
2026-10-10, when the nightly-copy row was added and the column was counted again.)

**The nightly copy widens it a fourth way, and it is the widest of the four — which is why it is written
out rather than noted.** The other three widen it by *what* they hold: an error report, a task title, a
count. This one widens it by **how much and for how long**, and it is the first thing in this table that
puts a **time** on the gap:

- **It holds everything.** Every row of every table, the accounts with their password hashes, and every
  file — one row in this table that contains all the others.
- **A person cannot reach it, cannot ask for it, and cannot have it removed.** Not even the owner can take
  one person out of a copy: the file is a single encrypted blob, so "delete Bob's data from the backup"
  is not an operation that exists.
- **And "deleted" now has a delay attached to it.** Delete a file or a task and it is gone from the app at
  once and from the copies in **up to about a fortnight**. That is new. Every other row in this table
  either goes immediately, goes with its parent, or never goes at all; this is the first one that goes
  *later*, on a clock.

**What makes it tolerable rather than the worst thing here**, and all three parts are needed:
**Cloudflare cannot read it** — it is ciphertext, so the new company holds no readable personal data at
all, which is not true of Sentry or Anthropic; **the window is short and enforces itself**, by a
lifecycle rule rather than by anybody remembering, which is the same move as the usage count's 7 days;
and **the alternative is worse** — the gap it closes is the permanent, total loss of the one thing in
this app nobody can retype. A plan that collects less by having no backup is not collecting less, it is
risking more.

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

Still four on 2026-10-10, and the nightly copy is not close to being a fifth — it is the **most** chosen
row in this table, more so even than the usage count. Nothing creates it but a workflow we write, running
on a schedule we set, sending what we name, to a bucket the owner made; delete the workflow and it stops.
What it does change is the *shape* of the question. The four above are small things written about people
using the app at all; this is a large thing written about everything, on purpose. "Chosen" and "safe" are
different words, and this row is the one place in this table where the first is emphatically true and the
second rests entirely on one passphrase.

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
- **"Daily limits on what costs money" IS DEPLOYED, IN BOTH PROJECTS, AND THIS ENTRY SAID OTHERWISE FOR
  THREE DAYS. Rewritten 2026-10-11, which is what
  [#230](https://github.com/build-once/team-tasks/issues/230) asked for.** Its heading read "**Unverified
  — 'Daily limits on what costs money' is now written in full and DEPLOYED NOWHERE**". The
  nine decisions in that section's table are the owner's, taken on 2026-10-08. **Rewritten twice that
  day**: once when the migration was written, and again when the counting arrived
  ([#221](https://github.com/build-once/team-tasks/issues/221)). The sentence replaced then said "there
  is no `supabase/functions/_shared/limits.ts`, `suggest-subtasks` and `invite-member` are untouched, and
  no number has ever been counted anywhere but in that sandbox", and the first two clauses stopped being
  true. **And then the whole entry went stale on the evening of 8 October and nobody re-read it.** Taken
  one at a time:

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
  - **AND BOTH FUNCTIONS ARE DEPLOYED, which is what this bullet denied.** It said "**AND NOTHING IS
    DEPLOYED, which is why this entry stays.** Neither Edge Function with the counting in it is on staging
    or on production ... So **no number has ever been counted in a running app**, nobody has ever seen the
    refusal on a screen, and `docs/costs.md` is still right that the vendor ceilings are the only thing in
    the way of anything actually running." **Every clause of that is now wrong except one.** What is true,
    and it is two different answers:

    | | What is known, and from where |
    |---|---|
    | **Staging** | **Both functions, deployed by the owner on 2026-10-08, and seen to work.** A before-and-after pair of runs of `scripts/staging/build-it-20-ai-checks.mjs`: before, five simultaneous asks all allowed and the ask after the limit answered 200; after, **429, code `daily_limit`, and the plan's sentence character for character**. The coach then read **two rows** off the table — `ai_suggestions` used 4, `invitations` used 1. `evidence/build-it-22-daily-limits-counting.md` § 12 |
    | **Production** | **Both functions, on the merge of PR #228** — merge commit `aaec96a`, merged 2026-10-08T16:33:09Z, run [37809688847](https://github.com/build-once/team-tasks/actions/runs/37809688847), **"Deploy server functions to production: success"**. So `invite-member` counts every real send there and refuses the twenty-first. **Nobody has read a row, or the EXECUTE grant, off production** ([#222](https://github.com/build-once/team-tasks/issues/222)) |

    **The one clause that survives, narrowed to where it is still true:** the vendor ceiling is the only
    thing in the way **for `suggest-subtasks` on production**, because `not_configured` is decided before
    the count, so with no `AI_API_KEY` there nothing is counted and nothing is sent.

    **And three things the staging record does NOT establish**, kept because they are the shape of what is
    left rather than a hedge: the refusal was seen **at a temporary limit of 4**, on a local branch the
    owner then restored to 20 and deleted, so **the twentieth has never been reached anywhere**; **the
    invitation limit has never been reached at all**; and **nobody has seen the sentence on either screen**
    ([#212](https://github.com/build-once/team-tasks/issues/212)).

  **Decided is not the same as true, written is not the same as applied, applied is not the same as
  deployed — AND DEPLOYED IS NOT THE SAME AS READ BACK, which is the step this entry now rests on.** Issue
  #221's fifth condition — a staging run showing the limit refusing, and the count read off the table —
  **is met**, and #221's sixth condition says this entry "can be removed". **It is kept, narrowed to
  production**: nobody has read a row or a grant off production's table, and until somebody has, what this
  app does to a volunteer's twenty-first invitation is a reading of a green deploy job rather than
  something observed. **The reason this entry outlived its own trigger by three days is worth more than
  the correction**: it was not a guess, it was a sentence nobody re-read, and rule 14 is about exactly
  that.
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
- **"Files attached to a task": APPLIED TO BOTH PROJECTS, PROVED ON STAGING, AND THE SCREEN DEPLOYED
  NOWHERE. Rewritten 2026-10-09 (issue #242).** The first sentence of this entry said "**is APPLIED
  NOWHERE**", and the one before that, written for Build it 23 part 0, said "**There is no bucket**, no
  storage rule, no migration, no screen, no code and no package". Each was true when it was written and
  neither is now. The paragraphs below are kept in the order things happened, because this entry is the
  record of that rather than only of where it has got to.

  - **The migration exists**: `supabase/migrations/20261008191804_attachments_bucket.sql` (issue #237) —
    the bucket row, the three policies on `storage.objects`, the two counted limits, and the trigger that
    refuses to delete a task with files. **On the day it was written it had been applied nowhere**: not
    local, not staging, not production. Rule 19, and the owner was not asked to apply it in that session.
  - **What the local proof is, and is not.** `evidence/build-it-23-attachments-bucket.md` is four
    throwaway local PostgreSQL databases, with every rule attacked as the task's creator, a team member,
    an outsider, a suspended member and signed out. **Its `storage` schema is a stand-in the assistant
    wrote**: the column names are Supabase's and cited, every type is a choice, and
    `storage.foldername()` is not there at all. So the rules are proved there against PostgreSQL, not
    against Supabase Storage — and **the bucket's own 5 MB and type limits are not proved there at all**,
    because nothing in PostgreSQL enforces them.

  **AND ALL THREE OF THOSE STOPPED BEING THE WHOLE STORY ON 9 OCTOBER 2026 (issue #242).** The paragraphs
  above are kept because they are what was true when the migration was written, and this is what has
  happened since. Four stages, and they are four different things:

  - **APPLIED TO STAGING, AND READ BACK.** The owner ran `supabase db push` from PR #241's branch on
    9 October 2026 (CLI 2.75.0, one migration listed), which answers #239's first question — the role
    `db push` connects as may insert into `storage.buckets` and create policies on `storage.objects`. The
    coach read it back the same day through the staging read-only connector: 11 migrations, newest
    `20261008191804`; the bucket private with the 5 MB and the six types; three policies, each `to
    authenticated`; the trigger present; `attachments_may_add` executable by `authenticated` and not by
    `anon`; 0 objects.
  - **APPLIED TO PRODUCTION, AND NOT READ BACK.** `.github/workflows/migrate-production.yml` ran on the
    merge of PR #241 — run
    [37922812469](https://github.com/build-once/team-tasks/actions/runs/37922812469), whose "Apply
    migrations to production" step succeeded. **Nothing on production has been looked at**: not the bucket
    row, not the policies, not the privileges. A green workflow run says the statements ran, not what they
    left behind, which is the distinction the AI-consent entry above makes at length.
    [#243](https://github.com/build-once/team-tasks/issues/243) holds the read.
  - **PROVED AGAINST THE REAL SERVICE, ON STAGING.** The owner ran
    `scripts/staging/build-it-23-attachment-checks.mjs` before the apply — 35 PASS, 12 FAIL, 1 UNVERIFIED,
    no bucket — and after it: **49 PASS, 2 FAIL, 0 UNVERIFIED**. The pair is what makes the second run
    mean something. Seen in it: Alice's upload; Carol listing, opening and getting a signed link that
    opens with no key and no session; Bob and a signed-out caller refused all five actions; a made-up task
    id and a top-level path refused; 5242881 bytes refused; an executable and an SVG refused; the fourth
    file on a task refused; replace and move refused even for the uploader; Carol's delete refused; and
    the task's own deletion refused with 23503 while three files sat on it. **The two FAILs were defects
    in that script** rather than in the rules, and both are fixed in #242.
  - **AND THE SCREEN IS BUILT, DEPLOYED NOWHERE, AND CHECKED ONCE BY THE OWNER.** The files panel on My
    tasks: a task's files, Open and Delete on each, the upload box, and the line about what is inside a
    photograph. It reaches production when a pull request merges and Vercel builds it.

    **The owner checked it on 9 October 2026**, on the pull request's preview, from a **Windows PC** and
    signed in with the staging accounts. **Every step passed except attaching a HEIC photograph** — which
    is why the app no longer offers that type; see "A HEIC photograph does not work, and the app says so"
    above and [#246](https://github.com/build-once/team-tasks/issues/246). The sentence this replaces said
    "**Nobody has opened it in a browser**", which was true for about an hour.

    **What is still not done: a check on a phone**, which is the device `docs/plan.md` says this app is
    for, and any screenshot. The assistant has opened nothing in a browser and ran nothing against
    staging. What this repository shows by itself is 286 pure-function checks and 15 access-rule tests
    that run against staging in CI on every pull request.

  **None of the staging or production work above was done or seen by the assistant.** The applies are the
  owner's, the connector reads are the coach's, the script runs are the owner's, and the production run's
  step conclusions were read with `gh run view --json`. Nobody writing this opened a dashboard.
- **Decided, so no longer open — the five decisions and two acceptances this section carried when it was
  written on 2026-10-08, and the eighth question that writing them down produced.** Three files per task;
  100 MB per person, **enforced on the server at upload**; one line beside the upload box about what is
  inside a photograph; and **leftover files are not acceptable**, so deleting a task deletes its files and
  the database refuses to delete a task that still has them, with the account half a requirement of Build
  it 26. Plus the two that were put up to accept or reject: that a renamed file can get through
  (**accepted as written**), and that the limits do not keep this inside the egress allowance (**recorded
  as written, with no egress limit built now**).

  **And the eighth, which was the one this list carried as open for part of that day:** who may delete a
  file. "Only the uploader" was taken first, and writing it beside the deletion decision exposed a
  deadlock — a team task whose creator could not delete it, because another member's file was on it and
  only that member could remove it
  ([#234](https://github.com/build-once/team-tasks/issues/234)). **The owner's answer was a third option
  neither the plan nor the issue had proposed: a file may be deleted by whoever uploaded it, or by
  whoever created its task, and by nobody else** — and **deleting a task removes all its files under the
  creator's own rights**, so no part of this app deletes anything with more authority than the person
  asking. All of it is recorded in the section itself and gathered in its table. They are named
  here so that somebody reading this list for open questions does not go looking for answers that are
  already above.
- **And one thing that followed from it rather than being decided — a privileged delete path is not
  needed and is not designed.** Because the task's creator holds the right to delete the files on their
  own task, the deletion runs as the person asking, permitted by a database rule rather than by code
  acting on somebody's behalf. Nothing in the plan now asks for a delete that carries the service-role
  key. **Nothing is built**, so this is a property of the design rather than of anything observed.
- **Confirmed by trying, 2026-10-08 — a refusal to delete a task that still has files DOES fire on a
  cascade.** This entry said it was "a question about Postgres this plan has answered neither by reading
  nor by trying, and nothing of it is built". The refusal is now built — the trigger in
  `supabase/migrations/20261008191804_attachments_bucket.sql` — and
  `evidence/build-it-23-attachments-bucket.md` section 8.5 is the run: deleting the `auth.users` row is
  refused, and the error carries the cascade's own statement as its context, which is what says the
  refusal came from inside the cascade rather than from somewhere else. **So deleting an account is
  refused while any of that person's tasks still has a file, and the Build it 26 requirement
  ([#235](https://github.com/build-once/team-tasks/issues/235)) is self-enforcing rather than
  aspirational.** Two caveats that remain: it was tried on a local PostgreSQL 17.10 sandbox with a
  two-column stand-in for `auth.users`, and **the migration is applied nowhere** — so what is established
  is a property of PostgreSQL, which is the right place for it to be a property of, and not something
  observed on Supabase.
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
- **CONFIRMED BY TRYING, 2026-10-09, AND THE ANSWER IS NO — Supabase does NOT declare a `.heic` file as
  `image/heic`.** This entry asked whether it did, said it was "what decides whether the owner's HEIC
  decision works at all", and asked for one upload to settle it
  ([#239](https://github.com/build-once/team-tasks/issues/239)). The owner's staging run of 9 October 2026
  is that upload: **a `.heic` name with no `contentType` set by the caller is refused with
  `InvalidMimeType`.** So an iPhone photograph — the commonest thing this feature exists for, and the
  whole reason the owner added HEIC to the list on 8 October — was refused by the very bucket that had
  been widened to accept it.

  **The answer this entry predicted was the one taken, and then it did not work.**
  `web/src/lib/attachments.ts` holds one table from extension to type, and
  `web/src/app/tasks/AttachFile.tsx` declares the type from it on every upload. **It is read off the
  file's NAME and never off the browser's own guess**, which matters twice over: a browser that does not
  recognise `.heic` reports an empty type, which is exactly the case that failed, and a browser's answer
  is chosen by whatever is uploading. None of that changed what the app promises — a renamed file still
  gets through, and the app still promises the refusal and never the contents.

  **AND IT STILL FAILED. Later on 9 October 2026 the owner tried a HEIC photograph through the app, from
  a Windows PC, and it did not attach.** What the screen said was not recorded, so **whether the fault is
  in the app's path or in the bucket is not established**. The owner decided not to pursue it: HEIC is an
  edge case for this project. So **the app no longer offers `image/heic` at all**, and a `.heic` file gets
  the ordinary wrong-type sentence; **the bucket still permits the type**, untouched, because narrowing it
  would be a migration against something nobody has shown to be at fault. "A HEIC photograph does not
  work, and the app says so" above is the record, and
  [#246](https://github.com/build-once/team-tasks/issues/246) holds it with the one run that would halve
  the question.

  **So this entry's own question is answered and the thing it was answered FOR is not.** Supabase does not
  map the extension — that stands. Whether a HEIC photograph can be attached through this app is a
  different question, it has been tried once, and the answer was no.

  **The staging script's section 14 still asks about the BUCKET, and that is still worth asking.** It is
  two checks rather than one probe: a `.heic` name with no content type must be **refused for its type**,
  and the same name with `image/heic` set must be **accepted**. The expectation of the first was reversed,
  which the owner agreed to (rule 20). Neither has been run since they were written, and 14b is now the
  cheapest thing in the project that would tell the two possible faults apart.

  **Still not confirmed, and smaller than it was: `.heif` and `.webp`.** `.webp` is on this app's own
  table, so what Supabase would have made of the extension no longer decides anything for it. `.heif` is
  refused by the bucket and by the app in any case — see the entry below about the two neighbours nobody
  has been asked about.
- **Decided, so no longer open — whether the bucket takes the `image/*` wildcard.** This list carried it
  as "not confirmed" for part of 2026-10-08, and the question is now moot rather than answered: the coach's
  review of the migration asked for the types to be named instead, because the wildcard would have
  admitted `image/svg+xml`, and they are. **Nobody ever established whether the column accepts a
  wildcard**, and nothing in this project needs to know any more.
- **And two media types that are refused because nobody has been asked about them**: `image/heif` and
  `image/heic-sequence`. The owner's answer named HEIC; these are its neighbours, and a file declaring
  either is refused by the bucket and by the app. **There is no point asking about them while HEIC itself
  does not work** ([#246](https://github.com/build-once/team-tasks/issues/246)) — they are the same format
  family, so whatever is wrong with one is the likeliest thing to be wrong with the others.
- **A THIRD SOURCE ON `last_accessed_at`, read 2026-10-09, and it does not settle the question.** The
  installed client declares the field: `FileObject` in
  `web/node_modules/@supabase/storage-js/dist/index.d.mts` has
  `/** @deprecated Last access timestamp (null for folders) */ last_accessed_at: string | null`. So a
  listing's answer has the field in its type and the client calls it deprecated — which is **not** the same
  as the column existing in a real project, and is not the same as its being maintained. It is a reason to
  think the column is or was there, and it is read off a type declaration rather than off a table. The
  entry below stands, and the step that settles it is unchanged.
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
- **"A nightly copy of production": IT IS BUILT, THE SCHEDULE HAS RUN ITSELF ONCE, AND NO RESTORE HAS
  EVER FINISHED. Rewritten 2026-10-11.** This entry's first line has now said three different things, and
  the third is the one to quote. It said "**IT IS BUILT, AND NOTHING IS DEPLOYED**", then "**IT IS BUILT,
  AND NO COPY HAS EVER BEEN MADE**" — and that second one was already false when the owner made two
  copies by hand on 10 October, and is doubly false now.

  **What happened on 11 October 2026:** the schedule started the job **by itself** for the first time —
  [38121029695](https://github.com/build-once/team-tasks/actions/runs/38121029695), event `schedule`,
  **success in 38 seconds**, `Done in 15s: 1 copy, 47 table(s), 1 file(s), 1309424 bytes stored.` The
  `report-failure` job was `skipped`. **So three copies of production exist** and one of them was made on
  a night nobody asked for it, which is the only version of this job that protects anything.

  **Two things that run settled, both of them things this list had been carrying:**

  - **Production's PostgreSQL is 17.6**, printed by the run against a `pg_dump` 17.11 on the runner. This
    list named "`pg_dump` 16 on the runner against a production Postgres whose version nobody has read"
    as the likeliest first-night failure; the client was pinned to 17 before the first run and the
    versions are now read rather than guessed ([#262](https://github.com/build-once/team-tasks/issues/262),
    closed).
  - **R2's ETag is the body's MD5** — `Verified by HEAD: 1309424 bytes, and the ETag matches the copy's
    MD5.` The job checks instead of assuming, so this is a check passing.

  **And one thing it exposed, which is the opposite of reassuring: it started 5h 57m 24s after its cron
  time.** The cron asks for 01:23 UTC; the run was created at 07:20:24Z, and the job is 38 seconds long,
  so the lateness is GitHub's queue. GitHub also publishes that a queued job **may be dropped** entirely.
  So **"every night" is nightly-ish and a night can be missed with no failure to report**, which moves the
  data-loss window from "about a day" to about a day and a quarter, or about two and a half days if a run
  is dropped. `docs/backups.md` → "The two targets" is reworded with the arithmetic, and
  `evidence/build-it-24-nightly-copy.md` section 14 is the record.

  **FOUR OF THE FIVE THINGS THIS ENTRY LISTED AS NOT DONE ARE NOW DONE, 10 to 11 October 2026.** It
  said: "**no restore has ever finished** — one drill got the database into a new project and stopped at
  the files, so `evidence/restore-tested.md` does not exist — **there is no lifecycle rule**, so all
  three copies will sit there indefinitely, there is **no bucket lock**, and **nothing notices if the
  copies stop** or when they start again". Each, in turn:

  | | |
  |---|---|
  | **A finished restore** | **DONE.** 219 seconds, 47 tables, 269 rows, one file byte for byte, signed into with a real account, the attachment opened, the project and the local files deleted. `evidence/restore-tested.md`. **One measurement, against a production holding 269 rows** — a second drill has never been done, and [#249](https://github.com/build-once/team-tasks/issues/249) stays open for its other half, `evidence/backups-on.md` |
  | **A lifecycle rule** | **DONE, owner-reported for 10 Oct**: `delete-after-14-days`, whole bucket, delete after 14 days, shown as Enabled. **Nobody writing this has seen it**, and nothing in this repository can read an R2 rule — the first thing that will check it is the copy of 10 October either disappearing in about a fortnight or not. [#259](https://github.com/build-once/team-tasks/issues/259) |
  | **A bucket lock** | **STILL NOT DONE.** It is the proposal of 10 October and the owner has not accepted it; [#277](https://github.com/build-once/team-tasks/issues/277) holds it |
  | **Something noticing if the copies stop** | **BUILT**, at the owner's threshold of **36 hours**: `.github/workflows/backup-freshness.yml`, holding the two storage settings and **not the passphrase**. **It has never run against the real bucket**, and it cannot catch its own silence — which its own header says. [#264](https://github.com/build-once/team-tasks/issues/264) |
  | **Something noticing when they start again** | **BUILT**: a `close-alarm` job closes the "Backup did not run" issue when a copy succeeds. The owner also closed the stale one, #268, by hand on 11 October. [#272](https://github.com/build-once/team-tasks/issues/272) **stays open** for its third condition — a failure, a success and a second failure seen in sequence against the real thing, which nothing in CI can reach |

  **And the restore itself changed, which is the part that matters to people's data rather than to the
  schedule.** The drill found that three of psql's error lines were **rows of a table being executed as
  SQL**, and that two tables it called a failure were sign-in sessions it was never going to bring back.
  So: no row of data is in the script psql runs any more, and **a restore promises a named set** — "What
  a restore brings back, and what it does not" above is the decision, and `docs/backups.md` is the full
  table.

  **Nothing above was run or seen by the assistant**: the copies are the owner's and the schedule's, and
  the run's facts were read from a public log and the Actions API.

  **The rest of this entry is the earlier record and is kept.** What changed and what did not, as at
  Build it 24 part 1 ([#258](https://github.com/build-once/team-tasks/issues/258)) on 2026-10-10:
  - **Built**: `.github/workflows/backup-production.yml`, `scripts/backup/` — the copy, the restore, the
    format, and a proof that runs the whole sequence in CI on every pull request against a throwaway
    PostgreSQL and a stand-in for both object stores — and `docs/restore-runbook.md`.
    `evidence/build-it-24-nightly-copy.md` is that run, with its output. **No new package**: the
    encryption is Node's own crypto writing OpenSSL's `enc` format and the S3 calls are `fetch` with a
    signature computed in forty lines, so rule 17 never came up.
  - **Not done as at 2026-10-10, and PART OF IT IS DONE NOW** — kept in the words it was written in,
    with what has changed marked, because this is the record of what was true that day: "**no copy of
    production exists**, no object is in `team-tasks-backups`, there is **no lifecycle rule**, no bucket
    lock, no restore drill and no `evidence/restore-tested.md`. **Three of the nine settings the job needs
    have not been created**, so the first run will stop at the settings check and name them". **Since
    then**: the settings were created and three copies have been made, so the first two clauses are
    gone — and so are three more, as the head of this entry now records: **the lifecycle rule, the
    finished drill and the evidence file all exist**, and **the bucket lock is the one thing on that
    sentence still missing**.
    `docs/backups.md` → "What the owner must set by hand" is the settings list, and it gained a row that
    writing the code found: `PRODUCTION_SUPABASE_S3_REGION`, which Supabase says must be read off its own
    S3 configuration page and so cannot be derived.
  - **And nothing was verified about the real services, as at 2026-10-10.** The proof establishes things
    about *our code*, never about Supabase Storage's S3 gateway or Cloudflare R2. `docs/backups.md`'s
    "Not confirmed" list carries that, and named the likeliest first-night failure: "`pg_dump` 16 on the
    runner against a production Postgres whose version nobody has read". **That one is settled**: the
    client was pinned to PostgreSQL 17 before the first run, and the run of 11 October printed the server
    as **17.6** and the client as **17.11**. The ones still unchecked are `ListObjectsV2` paging, which
    needs a bucket holding more than one page, and a 5 GB single `PUT`
    ([#263](https://github.com/build-once/team-tasks/issues/263)) — the largest copy so far is 1,309,424
    bytes.

  The rest of this entry is the earlier record and is kept. **Rewritten later the same day**, when
  the owner settled the decisions: this entry said "**Three of its decisions are still open**" and named
  the targets, the retention window and the failure notification, and all three are now taken — with the
  credential, the restore drill's organisation, the token and the endpoint beside them.
  `docs/backups.md` → "What the owner must set by hand" is the list of what those decisions now require
  somebody to do. **That list said "not one of those settings has been made or seen by anybody writing
  this", and the settings the JOB needs have since been made** — a run that reads production and writes
  to R2 cannot succeed otherwise, and three have. **Nobody writing this has still seen any of them**:
  what is observed is a green run, which proves the values work and says nothing about what they are.
  **What is still open is ONE PROPOSAL and nothing else**: the **13-day Bucket Lock**, which the owner
  asked to be proposed and has not accepted ([#277](https://github.com/build-once/team-tasks/issues/277)).
  This sentence also named the **14-day lifecycle rule** as missing, and it exists as of 10 October
  ([#259](https://github.com/build-once/team-tasks/issues/259)). The sentence that said "**nothing is deployed, because the workflow has not been
  written** — Build it 24 part 1" is the half that has gone: the workflow is written. Six vendor facts
  these sections cite nothing for are gathered in
  [#256](https://github.com/build-once/team-tasks/issues/256); the new secrets being in no secrets
  document was [#255](https://github.com/build-once/team-tasks/issues/255), and Build it 24 part 1
  answers it with one list in `docs/secrets.md` → "Every setting production needs".
- **Not confirmed — whether an R2 Bucket Lock rule can be removed or shortened once it is set.** The page
  read on 2026-10-10 says what a lock prevents, for how long, over which objects, and that it beats a
  lifecycle rule; it carries **no statement that a rule can be undone, and no warning that it cannot**.
  That is the one thing standing between the 13-day lock being a proposal and being a decision, because a
  lock set wrongly may be unfixable for its own duration. The cheap way to settle it is to set a **one-day**
  Age first, try a delete, and watch it refuse.
- **Read off two pages rather than stated by either — that the backup job's token cannot change the
  lock.** The lock page says editing one needs "An API token with permissions to edit R2 bucket
  configuration"; the tokens page gives **Admin Read & Write** as the scope that allows "edit bucket
  configuration" and gives **Object Read & Write** — the job's scope — as only "the ability to read, write,
  and list objects in specific buckets". Neither page says in one sentence that an Object-scoped token is
  refused. **And on the same reading, whether "write" includes deleting an object is not stated anywhere
  read**, which is a correction to what this list said earlier on 2026-10-10: it claimed the token
  "includes delete". Nobody established that, and the lock is what makes it not matter.
- **Owner-reported, not seen by anybody writing this — the Cloudflare bucket, the token and the three
  secrets.** A private R2 bucket `team-tasks-backups` in **Western Europe (WEUR)**, public development URL
  **disabled**, **no custom domain** (the coach saw that settings page); an R2 API token named
  `team-tasks-backup-job`, limited to that bucket, with **Object Read & Write**; **an object lifecycle
  rule named `delete-after-14-days`, whole bucket, delete after 14 days, shown as Enabled**; a passphrase
  generated on the owner's PC and held in the owner's password manager; and `BACKUP_STORAGE_KEY`,
  `BACKUP_STORAGE_SECRET` and `BACKUP_PASSPHRASE` in the `supabase-production` GitHub environment. All of
  it is the owner's report of 2026-10-10. **Nobody writing this opened the Cloudflare or GitHub dashboard,
  and nothing in this repository can show what either is set to.**

  **One correction inside that, and it is the answer to the three failed runs: the token was created with
  Object Read ONLY, and the owner changed it to Object Read & Write.** That is what ended the 403s. So
  `AccessDenied` meant exactly what the one-word error code said — a real credential that was not allowed
  to write — and the cause of the first real failure is established rather than guessed.
- **Not confirmed — whether Supabase's own backups include the `auth` schema**, which is where the
  accounts and their password hashes live. The pages read on 2026-10-10 say a backup contains database
  data and name **Storage** as the exclusion; **none says the accounts are included**. It matters for this
  section only as a reason to build the copy with `pg_dump` and not with `supabase db dump`, whose own page
  says it excludes `auth` and `storage` by name. `docs/backups.md` carries it with the step that would
  settle it.
- **A copy of OURS has been restored; a SUPABASE backup still has not.** This entry said "Not tried —
  restoring anything, from Supabase's backups or from a copy of ours ... so **'down for at most a few
  hours' is an aspiration with no measurement behind it**". Half of that is gone: the drill of 10–11
  October 2026 restored our copy in **219 seconds**, so that target has a measurement behind it — one
  measurement, against a production holding 269 rows and one file, and the restore itself rather than the
  whole outage. The dashboard's **"Restore to new project" is still marked Beta and still unpressed**, so
  the faster route back for the database alone is still a belief
  ([#249](https://github.com/build-once/team-tasks/issues/249)).
- **Not confirmed — that the tools this job needs are already on GitHub's runner.** It assumes something
  that can encrypt with a passphrase and something that can write to an S3-compatible endpoint, both
  present on `ubuntu-latest`, because rule 17 makes installing one the owner's decision. **Neither has
  been checked.**
- **Decided, so no longer open — the R2 token stays as it is.** This list carried it on 2026-10-10 as
  "whether the R2 token can delete, and whether a narrower permission exists", and said that on the
  reading here "Object Read & Write" includes delete. **The owner decided the same day to leave the token
  alone and to look at a Bucket Lock instead**, which is the better answer and not merely the easier one:
  a lock stops a delete **and an overwrite** whatever the token can do, where a narrower permission would
  only have stopped the delete. The claim about what the token can do is corrected two bullets above —
  nobody established it.
- **Decided, so no longer open — the R2 S3 endpoint goes in a GitHub environment variable and not in this
  repository.** The owner's decision of 2026-10-10, which is what this list carried as a judgement for the
  owner to overrule. So what is written here is its **shape** —
  `https://<cloudflare account id>.r2.cloudflarestorage.com` — and the value lives in
  `BACKUP_STORAGE_ENDPOINT` in the `supabase-production` environment, the way `PRODUCTION_SITE_URL`
  already holds the site address. The reason is the one `evidence/production-log.md`'s header gives for
  the production project reference: it is an identifier of that kind, and this repository is public.
  **Not set yet** — it is on `docs/backups.md`'s by-hand list.

- **THE THIRTEEN DECISIONS OF 2026-10-11: EIGHT ARE NOW LIVE IN A PROJECT, AND THIS ENTRY HAS SAID THE
  OPPOSITE TWICE.** It first said "**Not one of them is applied anywhere**"; Build it 25 part 1
  ([#284](https://github.com/build-once/team-tasks/issues/284)) changed part of that the same day and
  the heading became "**FOUR NOW HAVE SOMETHING BEHIND THEM, AND NOT ONE IS APPLIED TO A PROJECT**".
  **The owner then did seven dashboard rows on the evening of 11 October**, and the second heading was
  stale within hours. **Rewritten 2026-10-12**, and the distinction between **code in this repository**
  and **a setting in a dashboard** is still the whole of what has and has not moved.

  | | Where it stands, 2026-10-12 |
  |---|---|
  | **A** the CAPTCHA | **ON, IN BOTH PROJECTS, AND IT REFUSES.** The widget exists, a rendered one has been seen, site keys are in Vercel, and Supabase Auth answers a tokenless sign-in **HTTP 400 `captcha_failed`**. Production got there with the **wrong** site key first and refused everybody until it was corrected — [#290](https://github.com/build-once/team-tasks/issues/290) |
  | **J** one exported constant | **DONE**: `scripts/lib/captcha.mjs`, imported by all nine files that sign in. Nothing in a dashboard to do — and now a thing CI depends on, because staging keeps CAPTCHA on |
  | **I** dummy keys on staging and Preview | **DONE.** Staging's Auth holds Cloudflare's dummy **secret**; Preview holds the dummy **sitekey**; production holds the real pair. The dummy token was seen to be accepted on staging with CAPTCHA on, which is the half that keeps the tests alive |
  | **K** managed mode | **STILL RECORDED, NOT READ BACK.** A widget exists now, but nobody writing this has seen its settings page, so `TURNSTILE_MODE` is a record of a decision and not of a setting |
  | **D**, **H** | **Already done before this**: both dashboards read, and the minimum password length set, by the owner on 11 and 7 October |
  | **E**, **F** | **STILL SET NOWHERE, and the by-hand row for them is ON HOLD** — deliberately, because the field decision F aims at is labelled "token refreshes" and nobody has established what it covers. 31 wrong-password sign-ins saw no 429, which settles nothing at a limit of 150. [#291](https://github.com/build-once/team-tasks/issues/291) |
  | **G** | **DONE 2026-10-12.** Leaked-password protection is on, on production — owner-reported, and nothing here can read it back |
  | **L**, **M** | **BOTH DONE.** **L**: custom SMTP on production, through Resend, set 11 October — with the emails-per-hour limit chosen at **10** rather than the imposed 30, and a reset email seen to arrive. **M**: staging was not given it. The four sentences in this repository that said custom SMTP was configured on neither project are corrected, and [#292](https://github.com/build-once/team-tasks/issues/292) is closed with the owner's facts as the answer |
  | **B**, **C** | **Still no migration.** The upload count and the 500-task cap are Build it 25's remaining code |

  `docs/rate-limits.md` section 3 is the list of what is left, in the order to do it, and it gained two
  rows that are not limits at all: the redirect allow-list — **done by being unnecessary, because both
  projects' `/**` wildcards already covered `/auth/confirm`** — and the two email templates, **done on
  production and impossible on staging.**
- **Owner-reported, not seen by anybody writing this — both projects' Authentication → Rate Limits
  pages.** Read by the owner on **2026-10-11** from a screenshot: **both projects identical, every value
  at the documented default** — sending emails 2 per hour (not editable), SMS 30 per hour (not editable),
  token refreshes 150 per 5 minutes, token verifications 30 per 5 minutes, anonymous users 30 per hour
  (not editable), sign-ups and sign-ins 30 per 5 minutes, Web3 30 per 5 minutes (not editable). **Nobody
  writing this opened a dashboard and nothing in this repository can.** Two consequences this list has to
  carry: **seven rows were reported and the documentation's table has eleven**, so the two 60-second
  per-user windows on the sign-up and reset emails are **still unread** — and they are the per-person
  throttle on exactly the two emails Build it 25 moves; and **no check in this repository would notice
  if a value changed tomorrow**, which is the same gap `docs/claims.md` already names about the
  minimum password length.
- **NOT CONFIRMED, AND DECISION F RESTS ON IT — what the dashboard field called "token refreshes"
  actually covers.** The documentation's row at the same number is "Token endpoint requests", path
  `/auth/v1/token`, and says it "covers password, refresh token, ID token, and PKCE grants". The
  dashboard calls it **"token refreshes"**. **If it is refreshes only, nothing editable limits a password
  sign-in at all**, and decision F sets a careful number on the wrong field while the real sign-in path
  stays at whatever the platform does — which would make the CAPTCHA the *only* thing in front of
  sign-in rather than the second thing. Settled by the help text beside that field, or, after F is
  applied to **staging**, by thirty-one password sign-ins from one address.

  **STILL OPEN AFTER THE RUN OF 11 OCTOBER 2026, and the reason is arithmetic rather than a failure.**
  The script's check 3 made **31** wrong-password sign-ins from one address on both runs and saw **no
  429**. That is what the default predicts: **no rate-limit figure has been changed on either project**,
  so the token endpoint is still at the documented **150** per 5 minutes and 31 attempts cannot reach it.
  **"No 429 in 31" must not be read as "no limit was found."** The by-hand row for E and F is **on
  hold**, which is that row's own instruction being followed.

  **And the documentation was read again on 2026-10-12 with the same result in a second place**: its
  management-API example names seven parameters, one being `rate_limit_token_refresh`, and **the page
  does not map parameter names to table rows**. One thing that read did settle — **nothing is counted per
  address or per account**: the token endpoint is limited by IP and no per-account limit on sign-in is
  published at all. [#291](https://github.com/build-once/team-tasks/issues/291) carries it, with a
  measurement at the **current default** that changes no setting and cannot spend CI's budget, because
  the limit is per IP and the runner is a different address from the owner's machine.
- **~~NOT CONFIRMED, AND DECISION B RESTS ON IT — whether a policy's `with check` may perform a
  write.~~ MOOT FROM 2026-10-12: nothing writes inside a `with check`.** This entry asked whether a
  check expression may write and what becomes of that write when the statement is refused, and named a
  local sandbox as what would settle it. **The owner chose a different mechanism instead** — a BEFORE
  INSERT trigger on `storage.objects` — so the question is no longer load-bearing and was never
  answered. It is left here rather than deleted, because somebody will ask it again.

  **Why the mechanism changed**: a count inside `attachments_may_add()` would have been **spendable
  without uploading**. That function must be EXECUTE-able by `authenticated` for the policy to work, so
  it is reachable as an RPC — thirty direct calls would have spent somebody's day, and each would have
  committed. A trigger fires only on a real INSERT and cannot be called directly.

  **And what the trigger settled instead, measured on a local PostgreSQL 17.10 database**
  (`evidence/build-it-25-upload-count.md`): a BEFORE INSERT trigger writes inside the statement it is
  checking, so **a refused or failed upload rolls the count back with the row** — the way round this
  entry wanted. 30 uploads counted, the 31st refused with SQLSTATE 54000, a fourth-file refusal left
  the count untouched, a delete cost nothing, a signed-in 40-row insert was refused at the 31st with
  nothing landing, and **40 files in one service-role statement landed with nothing counted**, which is
  what a restore needs.
- **NOT CONFIRMED — whether `supabase db push` may create a trigger on `storage.objects` on a real
  project, and it is the one thing PR B rests on.** `CREATE TRIGGER` needs the **TRIGGER privilege** on
  the table and **not** ownership — measured on a local sandbox, where a non-owner role with
  `grant trigger` created one on a table still owned by `postgres`. **What nobody has read is whether
  the role Supabase's `db push` connects as holds it.**

  **The reason to expect yes**: the same sandbox showed `CREATE POLICY` on that table needs
  **ownership** ("must be owner of table objects"), and
  `20261008191804_attachments_bucket.sql` created three policies on it on both projects in October. If
  that role owns the table, it holds every privilege on it including TRIGGER. **That is a chain of two
  measurements and one observed fact, not a reading of a page**, so it is written as an expectation.

  **And a wrong answer is harmless, which is the point of the migration's section 0**: it asks
  `has_table_privilege(current_user, 'storage.objects', 'TRIGGER')` first and raises before anything is
  created. Proved both ways on a sandbox whose public objects were owned by a non-superuser role:
  privilege revoked → the push stopped at statement one with **the constraint still naming two words,
  no function and no trigger**; privilege granted → it applied. The fallback if the answer is no is the
  owner's decision of 2026-10-12 and is a different migration, not a change to that one.
- **Nothing can violate the 500-task cap today, and that is worth one line rather than an assumption.**
  Production has no accounts at all and staging has three test ones; nobody has 500 tasks. So the
  migration for decision C cannot fail on existing rows — and the way to be sure is a `count(*)` per
  owner before it is applied, which `docs/rate-limits.md` shows cannot print a row.
- **Unverified — the CAPTCHA's CODE exists and nothing else about it does. Rewritten 2026-10-11 the same
  day it was written, AND AGAIN ON 2026-10-12, BECAUSE IT WAS STALE WITHIN HOURS BOTH TIMES.** The first
  sentence was "**Nothing is installed.** No Turnstile account or widget has been seen by anybody writing
  this, no site key is in any Vercel environment, no secret key is in either project's Auth settings, no
  widget is on any screen, and **no code was written**." The second kept all of that but the last clause.
  **Every clause of it is now wrong**, and the plain version is:

  **A widget exists. Site keys are in Vercel for Preview and Production. Secret keys are in BOTH
  projects' Auth settings — the dummy one on staging, the real one on production. CAPTCHA is on in both.
  And a rendered widget has been looked at, twice.** All owner-reported, 11 October 2026;
  `evidence/captcha.md` has the table of who saw what.

  **What that leaves unverified is still everything a browser would tell you, and the list is now three
  things rather than four.** **Gone**: that the widget loads — Cloudflare's box was shown on the Preview
  deploy of `6f94868`, and production's live page showed Cloudflare's own "For testing only" line, which
  is what diagnosed the dummy-key deploy. **Left**: nobody has seen it on a **phone**, which is the device
  this plan says the app is for; **nobody wrote down whether Cloudflare's branding was on it**, so that is
  unrecorded rather than unreadable now; and **whether it drew a tick or settled itself was not noted
  either.** All three are one more look at one screen. What **is** established without a browser is
  unchanged: 90 checks in `scripts/auth-screens-check.mjs` over the four states, the one place the field's
  name is spelled, the three screens drawing the component, and the fact that only two of the four states
  may post.

  **And the lesson, since this entry has now gone stale twice in two days: it was never a guess either
  time.** Both versions were written carefully, from the repository, on the day — and the owner kept
  working. Rule 14 is about exactly that, and this entry is the clearest example of it in the file.

  The four Cloudflare pages and the Supabase CAPTCHA page cited in it were read on **2026-10-11** through
  this session's page-fetching tool, which converts a page to text and answers a question about it — the
  testing page was fetched twice, with different questions, and agreed both times. `docs/rate-limits.md`
  says the same about its own quotations, and anybody about to depend on an exact wording should open the
  page.
- **"Login emails that work in any browser" IS NOW PROVED ON PRODUCTION, for the reset half. Rewritten
  2026-10-12.** This entry said it was "BUILT and PROVED NOWHERE" and named three things nobody had done.
  **Two of the three are done**, on production, on 11 October 2026, and all of it is owner-reported:

  - **The two email templates were edited** — "Reset Password" and "Confirm signup", with the bodies
    `docs/rate-limits.md` section 3 carries word for word. So production's links are the
    `{{ .TokenHash }}` shape and no longer the PKCE `code=` one.
  - **A link WAS opened in a second browser, and it worked end to end**: the reset was requested in one
    browser, the link opened in a different one, the button pressed, a new password set, and signed in
    with it. "Works in any browser" stops being a reading of what a token hash is and becomes something
    somebody watched.
  - **Nobody has watched a mail scanner fetch the new link and then used it**, which is the one of the
    three still open — and it is what `/auth/confirm` exists for.

  **AND THE TEMPLATES COULD NOT BE DONE ON STAGING AT ALL**, which nobody expected: the dashboard locks
  the templates while a project uses the built-in sender, and decision **M** keeps staging on it. So
  `/auth/confirm` **has never been exercised on staging and cannot be**, and the production edit was made
  against a path no project had served a link to. `docs/rate-limits.md` section 3's correction of
  2026-10-12 is the record. It is decision M's stated cost — "the first time this arrangement is
  exercised is on production" — arriving somewhere nobody had looked.

  **Also still open: a sign-up confirmation link, either half.** The template is in place; no sign-up has
  been made on production. [#285](https://github.com/build-once/team-tasks/issues/285) is the checklist
  of all eleven things the owner has to observe — five done, one answered sideways, one half, four not
  started — and [#286](https://github.com/build-once/team-tasks/issues/286) is the one cost this shape
  carries: a sign-up on a Preview deploy gets a link pointing at the project's Site URL host.
- **NOT CONFIRMED — whether `verifyOtp` refuses a token of the wrong kind** ([#287](https://github.com/build-once/team-tasks/issues/287)). `/auth/confirm` reads the
  kind of link from the address bar, which `/auth/reset` deliberately does not, and the fixed list of two
  plus a fixed destination per word is what keeps that safe. The one thing left: if Supabase were to
  accept a **sign-up** token under `type=recovery`, somebody holding that token could reach the password
  form — which would be their own account's form, on a screen this plan already says is not a security
  boundary, so the exposure is not larger than holding the token already is. **No page read says either
  way and nobody has tried it.** `web/src/lib/email-links.ts` carries the whole argument.
- **Unverified — "True messages on the login screens" is checked without a screen and observed on none.**
  Twelve sentences, each chosen from an error code read off
  `web/node_modules/@supabase/auth-js/src/lib/error-codes.ts` at version 2.117.2, with 90 checks over
  which code gets which. **What nobody has seen is any of them drawn**: no screen has been opened, and the
  only one of the twelve anybody has watched the OLD behaviour of is `same_password`, on production, which
  is what started this. **And two of the twelve are mapped on reasoning rather than on an observed answer**
  — `captcha_failed`, whose code nobody has seen Supabase send, and `email_not_confirmed`, where "Supabase
  answers it only after the password matched" is how the code is described and not something tried.
- **~~NOT CONFIRMED, AND THE WHOLE CAPTCHA RESTS ON IT~~ SETTLED 2026-10-11: SUPABASE AUTH REFUSES A
  SIGN-IN THAT CARRIES NO CAPTCHA TOKEN.** This entry was the longest-standing unknown in Build it 25 and
  it is answered. What it said: [Enable CAPTCHA
  protection](https://supabase.com/docs/guides/auth/auth-captcha) "says what to switch on and **does not
  say what happens to a request that arrives without one**. If the answer turns out to be 'it is
  accepted', the feature protects nothing." It then recorded that the check had been written —
  `scripts/staging/build-it-25-captcha-checks.mjs` section 1 — and that it **had not been run**.

  **The owner ran it, twice, on 11 October 2026.** Before switching CAPTCHA on for staging: the tokenless
  sign-in was **accepted, HTTP 200** — which is the evidence the check was not there yet. After, with
  Cloudflare's dummy secret key: **HTTP 400, `error_code` `captcha_failed`**. Totals reported: **3 PASS /
  0 FAIL / 1 UNVERIFIED** before, **4 PASS / 0 FAIL / 1 UNVERIFIED** after.

  **And the code is one the app already had words for**, which the script checks as a second judgement on
  purpose: `captcha_failed` maps to "The check that you are not a robot did not pass. Reload the page and
  try again." on all four screens that choose a refusal. **The after-run's fourth PASS is only reachable
  if that second judgement passed**, which is the one way the reported code is corroborated by something
  other than the report.

  **Owner-reported. Nobody writing this ran it, opened a dashboard or used a connector.**
  `evidence/captcha.md` is the record. **The one UNVERIFIED in both runs is the rate-limit check**, and
  it is uninformative rather than worrying: see the entry below.
- **Not confirmed — which Auth endpoints CAPTCHA covers.** The page names "your sign-in, sign-up, and
  password reset forms" and names no endpoint, so `/auth/v1/resend` and `/auth/v1/verify` are
  unknown. Same one-request method, per endpoint.
- **Not confirmed — how long Cloudflare keeps a Turnstile Signal, and whether Turnstile sets a cookie.**
  The [Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/), read 2026-10-11,
  states **no retention period**, and on cookies it points elsewhere — "For more information about the
  cookies used by Cloudflare, please check our Cookie Policy and our Turnstile Developer Docs". Both
  belong on the privacy page ([#204](https://github.com/build-once/team-tasks/issues/204)), so both have
  to be read and cited before it can be written. **No number and no answer is written here from memory.**
- **Not confirmed — whether Cloudflare sells Signals or uses them for advertising.** The addendum says the
  purpose "is not to identify, profile or target any individuals" and carries **no sentence** saying the
  data is not sold. Read the main Cloudflare privacy policy for that, or write that it could not be found.
- **Unverified — what either Supabase project's Auth settings are actually set to.** Every rate limit in
  `docs/rate-limits.md` is the **published default**, and the page says the customizable ones are changed
  in **Authentication → Rate Limits** in the dashboard. Nobody has read either project's page and nothing
  in this repository can. The same goes for the minimum password length, for leaked-password protection,
  and for whether "Confirm email" is on at all — which `docs/claims.md` already carries.
- **~~Unverified — the whole "sign-up and reset emails move to Resend" section describes an
  intention.~~ DONE ON PRODUCTION, 11 October 2026.** This entry said "Custom SMTP is configured on
  **neither** project; both emails are still sent by Supabase's built-in sender", and that was true
  when it was written and wrong within hours.

  **What the owner reports, 11 October 2026**: custom SMTP is on **production**, through Resend —
  `smtp.resend.com`, port 465, username `resend`, a key named `team-tasks-production-auth-smtp`, sender
  `invites@notify.raj-dhonota.com`, sender name "Team Tasks" — with the **emails-per-hour limit set to
  10** rather than the 30 Supabase imposes. **A reset email arrived at the test mailbox afterwards.**
  **Staging has none**, which is decision **M** doing exactly what it was chosen for.

  **So two things this section promised have happened**: production can now deliver to an address that
  is not on the Supabase project's team, and the sign-up and reset emails go through Resend. **Which
  means Resend now holds the address of everybody who uses this app**, not only people who were
  invited — the widening the appendix's own row describes, now real rather than planned.

  **What is still unverified**: nothing in this repository can read either project's SMTP setting, so
  if it were switched off tomorrow every sentence here would still say it is on. **And no volunteer has
  signed up on production**, so "it delivers to somebody who is not on the project's team" rests on one
  email to the owner's own test mailbox.
  [#292](https://github.com/build-once/team-tasks/issues/292) is the issue this answered, and the thing
  it was filed about is worth keeping: **four sentences in this repository said the opposite, and all
  four were written carefully from documents that were true when somebody read them.**
- **Not observed, only read — that production refuses to deliver to a non-team address today.** It is a
  reading of one sentence on [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) (read
  2026-10-11): Supabase Auth "will refuse to deliver messages to addresses that are not part of the
  project's team". **Nobody has signed up on production**, so nobody has watched an email not arrive.
  One sign-up to the test mailbox, after custom SMTP is saved, both settles it and fixes it.
- **Not read, and not tried — what happens when Supabase's Auth email limit is set above Resend's daily
  quota.** The imposed default once custom SMTP is saved is "a low rate-limit of 30 messages per hour",
  which is 720 a day against Resend's free 100 a day. Which refuses first, and what the person sees, is
  unknown.
- **Decided, so no longer open — what Supabase's rate limits on the sign-up and reset emails are.** This
  list and `docs/costs.md` both carried it as "not read, and now scheduled ... reading them is Build it
  25" ([#219](https://github.com/build-once/team-tasks/issues/219)). They were read on **2026-10-11** and
  are in `docs/rate-limits.md`: **2 emails per hour with the built-in provider, per project**, and a
  60-second window per user on each of the two endpoints. The reading also produced something the issue
  did not ask for and which matters more than the rate — the refusal to deliver to a non-team address,
  two bullets above.
