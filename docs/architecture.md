# How Team Tasks fits together

A map of this app, not of apps in general. It matches `docs/plan.md` — the five features of the
first version and nothing else.

Nothing here has been built. No database, no project, no code in `web/`. This is the plan for how
the pieces will sit, so that the shape is agreed before anything is typed.

> The generic example map that used to live in this file is still in git history, if you want it
> back: `git show ea887b8:docs/architecture.md`.

## The map

```
  =============================== THE CLIENT ===============================

        +-------------------------------------------------------------+
        |  A volunteer's phone browser, or a laptop browser           |
        |                                                             |
        |  TEAM TASKS WEB APP   (Next.js, in web/)                    |
        |                                                             |
        |  PUBLIC. Anyone can read this code and copy its keys.       |
        |  Holds NO secret key.                                       |
        |  Decides NOTHING about who may see what.                    |
        +------+-------------------+--------------------------+-------+
               |                   |                          |
          (1) sign in         (2) read and write         (3) "invite
          publishable key     own teams' tasks          bob@example.com"
          -- PUBLIC --        publishable key           session cookie
               |              -- PUBLIC --              -- no key --
               v                   v                          v
   +-------------------+  +----------------------+  +------------------------+
   |  SIGN-IN          |  |  DATABASE + RLS      |  |  SERVER FUNCTIONS      |
   |  Supabase Auth    |  |  Supabase Postgres   |  |  Supabase Edge         |
   |                   |  |                      |  |  Functions             |
   |  Answers only     |  |  teams               |  |                        |
   |  "who is this?"   |  |  team_members        |  |  THE ONLY PLACE AN     |
   |                   |  |  tasks               |  |  APP SECRET KEY LIVES  |
   |  It does NOT      |  |  invitations         |  |  AT RUN TIME - in      |
   |  decide what      |  |  profiles            |  |  Supabase Edge         |
   |  they may see.    |  |  ROW LEVEL SECURITY  |  |  Functions secrets     |
   +---------+---------+  |  decides what each   |  |  Runs invites + teams  |
             |            |  person may read     |  +---+----------------+---+
             | (4) "this  |  and change.         |      |                |
             | is Carol"  |  THE REAL RULE       |      |                |
             +----------->|  behind feature 5.   |<-----+                |
                          +----------+-----------+  (5) write the         |
                                     |                invitation row     |
                                     |                SERVICE-ROLE KEY   |
                                     |                *** SECRET ***     |
                                (6) automatic                            |
                                    backups                     (7) send the email
                                    PRODUCTION ONLY                 RESEND API KEY
                                     |                              *** SECRET ***
                                     v                                   |
                          +----------------------+                       v
                          |  BACKUPS             |        +--------------------------+
                          |  Supabase automatic  |        |  EMAIL                   |
                          |  daily copies        |        |  Resend                  |
                          |                      |        |  NOT SET UP YET          |
                          |  THE DATABASE ONLY.  |        +------------+-------------+
                          |  STORAGE OBJECTS ARE |                     |
                          |  NOT INCLUDED, so    |            (8) "you have been
                          |  ATTACHMENTS ARE NOT |                invited to a team"
                          |  BACKED UP (#248).   |                     |
                          |                      |                     v
                          |  PRO PLAN ONLY -     |        +--------------------------+
                          |  free staging has    |        |  Bob's email inbox       |
                          |  none (#247).        |        +--------------------------+
                          |  NO RESTORE HAS EVER |
                          |  BEEN TRIED (#249).  |
                          +----------------------+


  ========================= AROUND ALL OF IT =========================

   +------------------+  (9) push a branch,       +------------------------+
   |  GITHUB          |  open a pull request      |  CI CHECKS             |
   |  code + history  |------------------------->|  .github/workflows     |
   |  main protected  |                           |  one check: required   |
   |                  |                           |                        |
   |  GITHUB ACTIONS  |                           |  LATER STEP: applies   |
   |  SECRETS         |                           |  database migrations   |
   |  *** SECRET ***  |                           |  to production, using  |
   |  PLANNED, LATER  |                           |  the Actions secrets   |
   +---------+--------+                           +-----------+------------+
             |                                                |
             | (10) merge to main = a release                 | must be green
             v                                                v
   +-----------------------------------------------------------------------+
   |  HOSTING  -  Vercel                                                   |
   |  Builds the web app and serves it to phones and laptops.              |
   |  Holds PUBLIC settings only: the Supabase URL and the publishable     |
   |  key. NO SECRET KEY IS STORED HERE.                                   |
   +-----------------------------------------------------------------------+

   +-----------------------------------------------------------------------+
   |  THE NIGHTLY COPY  -  CLOUDFLARE R2 chosen 10 Oct 2026.               |
   |  NOTHING IS BUILT: no workflow, and no copy has ever been made.       |
   |  A PRIVATE bucket "team-tasks-backups", region WEUR. Public           |
   |  development URL DISABLED, no custom domain.                          |
   |                                                                       |
   |  (15) A SCHEDULED GITHUB ACTIONS JOB, nightly, no pull_request and    |
   |       no workflow_dispatch, in the supabase-production environment.   |
   |       READS: the whole production DATABASE through                    |
   |              PRODUCTION_SUPABASE_DB_URL -- *** SECRET ***             |
   |              and every FILE in the attachments bucket, which needs    |
   |              a credential that DOES NOT EXIST YET -- see below.       |
   |       ENCRYPTS on the runner, with BACKUP_PASSPHRASE                  |
   |              *** SECRET ***, and only then                            |
   |       WRITES: the encrypted file to R2, with BACKUP_STORAGE_KEY and   |
   |              BACKUP_STORAGE_SECRET -- *** SECRET ***                  |
   |                                                                       |
   |  CLOUDFLARE HOLDS CIPHERTEXT ONLY. Opening a copy needs BOTH the      |
   |  storage key AND the passphrase. The passphrase is in the owner's     |
   |  password manager and a GitHub secret and NOWHERE ELSE; if it is      |
   |  lost, NO COPY CAN EVER BE OPENED.                                    |
   |  NO ARTIFACT is ever uploaded. The log prints names, byte counts      |
   |  and statuses ONLY - this repository is public.                       |
   |  The coach and the coding assistant NEVER receive a copy.             |
   +-----------------------------------------------------------------------+

   +-----------------------------------------------------------------------+
   |  MONITORING  -  SENTRY chosen 5 Oct 2026.  NOT INSTALLED YET.         |
   |  Free plan, data region UNITED STATES. Account and a Next.js          |
   |  project named team-tasks exist; no package, no DSN, no code.         |
   |                                                                       |
   |  (11) the web app sends an error report, from the BROWSER and         |
   |       from the SERVER side of Next.js                                 |
   |       DSN -- PUBLIC, not a secret                                     |
   |  Production and Preview on Vercel send. Local development sends       |
   |  NOTHING unless the DSN is set in a local file.                       |
   |  NEVER sent: an address, task text, a team name, a token, a key.      |
   |  OFF: session replay, performance tracing, request bodies.            |
   +-----------------------------------------------------------------------+

   +-----------------------------------------------------------------------+
   |  AI HELPER  -  ANTHROPIC CLAUDE API chosen 7 Oct 2026.                |
   |  NOT INSTALLED YET. Separate Console workspace "Team Tasks", 5 USD    |
   |  monthly spend limit - owner-reported, not seen in a dashboard.       |
   |  Model: Claude Haiku 4.5, dated name TO BE CONFIRMED BY THE OWNER.    |
   |                                                                       |
   |  (12) a SERVER FUNCTION sends ONE TASK TITLE + fixed instructions     |
   |       AI_API_KEY -- *** SECRET ***, one per Supabase project          |
   |       The BROWSER never holds it and never calls Anthropic.           |
   |  Back: up to five short suggestions, TREATED AS DATA, never as        |
   |  instructions. One becomes a task only when the person adds it.       |
   |  NEVER sent: an address, a name, a user ID, a team name, any other    |
   |  task, a sign-in token, a key.                                        |
   |  STAGING has a key from Build it 20. PRODUCTION has NO KEY until the  |
   |  consent setting lands in Build it 21 - until then production answers |
   |  that suggestions are not available.                                  |
   +-----------------------------------------------------------------------+

   +-----------------------------------------------------------------------+
   |  FILES  -  SUPABASE STORAGE.  Build it 23, NOTHING EXISTS YET.        |
   |  A PRIVATE bucket named "attachments". Images and PDFs, 5 MB each,    |
   |  3 per task, 100 MB per person. Path: attachments/<task id>/<file>.   |
   |  INSIDE this project - not an outside service, and no new vendor.     |
   |                                                                       |
   |  (13) READING: the BROWSER asks for a SIGNED LINK, then fetches       |
   |       publishable key -- PUBLIC -- plus the person's session          |
   |       RULES ON storage.objects decide, the same way RLS decides       |
   |       about tasks: may you see the task this file belongs to?         |
   |       A suspended person is refused, as everywhere else.              |
   |       NO SECRET KEY on this arrow.                                    |
   |  The link EXPIRES AFTER 5 MINUTES, and while it lives ANYONE          |
   |  HOLDING IT can open the file - signed in or not.                     |
   |                                                                       |
   |  (14) UPLOADING: through SERVER CODE, because the 100 MB per person   |
   |       is a SUM the browser cannot be trusted to make. Same reason     |
   |       as "at most 3 teams per person". Owner's decision, 8 Oct 2026.  |
   |       SERVICE-ROLE KEY -- *** SECRET ***, one that already exists.    |
   |                                                                       |
   |  DELETING A TASK DELETES ITS FILES FIRST, and the DATABASE REFUSES    |
   |  to delete a task that still has files. Nothing is left behind.       |
   |  Never sent to Sentry or to Anthropic, and a FILE NAME never          |
   |  appears in an error report.                                          |
   +-----------------------------------------------------------------------+
```

## The arrows that carry a secret key

**Six that a person's request can set off, and all six start at the server functions.** (This sentence
said five on 2026-10-06 while the table listed four rows; the AI call added on 2026-10-07 was the fifth
and made the word and the rows agree. **The upload path added on 2026-10-08 is the sixth** — the word and
the rows are counted here again, not remembered.)

**And one that nobody's request sets off, added 2026-10-10: arrow (15), the nightly copy.** It is counted
apart on purpose rather than making the word seven, because it is a different class of thing and mixing
them would hide what this table is for. The six below are **run-time** arrows: a volunteer presses
something, a function reaches for a key. Arrow (15) is a **scheduled job** holding **deploy-class**
credentials — the same class as `PRODUCTION_SUPABASE_DB_URL`, which this file already keeps off the
run-time side for exactly this reason ("a **deploy credential, not a run-time key**: it never appears in
a request from a volunteer's browser"). Nothing a person does in the app can make arrow (15) fire, and no
screen can reach it. It has its own section below.

| Arrow | Key it carries | Starts at | Where the key is stored | Why it has to be there |
|---|---|---|---|---|
| **create a team** — not drawn on the map above yet | Supabase **service-role key** | Supabase Edge Function | Supabase Edge Functions secrets | Both limits in `docs/plan.md` — a name of 1 to 60 characters, and at most 3 teams per person — have to hold even if the request does not come from our own screens. A browser cannot be trusted to enforce its own limit, and counting somebody's teams is not something a person should have to be able to read rows to do. (An earlier version of this row said creating a team also makes its owner its first member. It does not: `create-team` writes only to `teams`, and an owner has no `team_members` row.) |
| **(5)** write the invitation row | Supabase **service-role key** | Supabase Edge Function (`invite-member`) | Supabase Edge Functions secrets | Bob has no account yet, so no RLS rule can let "Bob" write his own invitation. Only trusted server code may create that row — and the 20-pending limit below needs to count the team's other invitations, which a policy cannot do. |
| **(7)** send the invitation email | **Resend API key** (`EMAIL_API_KEY`) | Supabase Edge Function (`invite-member`) | Supabase Edge Functions secrets, **per project** | Anyone holding this key could send email as your app. It must never reach a browser. |
| **accept an invitation** — not drawn on the map yet | Supabase **service-role key** | Supabase Edge Function (`accept-invite`) | Supabase Edge Functions secrets | Marking an invitation accepted and writing the `team_members` row both have to happen for somebody who is not yet in the team, so no policy on either table can allow it. The claim also has to be atomic, or two clicks both succeed. |
| **(14)** accept a file onto a task — **nothing is built yet** | Supabase **service-role key** | Supabase Edge Function | Supabase Edge Functions secrets | The owner decided on 2026-10-08 that **100 MB per person is enforced on the server at upload**, and a total is a sum across rows the caller may not be able to see — the same reason "at most 3 teams per person" needs a function and cannot be a policy. The three-per-task count is the same shape. A row-level rule on `storage.objects` can say "this file belongs to a task you may see"; it cannot say "and you are under your 100 MB". **This arrow adds a key to an existing store rather than a new store**, and it is the only arrow on this map whose *reason* is arithmetic rather than authority. **How the bytes travel is not decided** — through the function, or a signed upload URL the function hands back — and the section below sets out both |
| **(12)** ask for subtask suggestions — **nothing is installed yet** | **Anthropic Claude API key** (`AI_API_KEY`) | Supabase Edge Function | Supabase Edge Functions secrets, **per project** | Anyone holding this key can spend the owner's money at Anthropic, so it must never reach a browser — which is the whole reason this is a server function and not a `fetch` from a screen. The function is also where the three limits live that a browser could not be trusted with: only the one task's title goes out, nothing identifying the asker goes with it, and a suspended caller is refused. **Staging holds a key from Build it 20; production holds none until the consent setting lands in Build it 21**, so on production the function answers that suggestions are not available. See `docs/plan.md` → "Suggest subtasks — an outside AI service". |

"Service-role key" and "secret key" are the same thing: the Supabase key that bypasses every
row-level security rule. It is the most damaging value in this project to lose.

**The `teams` table has no insert rule, so only the function can create a team.** Row-level security
refuses whatever no policy allows, and `supabase/migrations/20260930101343_create_teams.sql` gives
`teams` exactly one policy: owners may *read* their own teams. There is no insert, update or delete
policy. So the web app, which holds only the publishable key, cannot write to `teams` at all — an
insert from the browser is refused by the database, not merely discouraged by the screens.

That is what makes the two limits in `docs/plan.md` real rather than decorative. "At most 3 teams per
person" cannot be expressed as a policy on an insert, because the rule would have to count the
caller's other rows; and a limit checked only in a form is not a limit, because a form can be
bypassed. Routing every creation through one function that holds the secret key gives the count
somewhere to happen. The cost is that the function is now the only door, and it has to check its own
work — which is why it verifies both the error and the row count of every database call it makes.

**`invitations` and `team_members` have no insert rule either**, for the same reason and one more.
`supabase/migrations/20260930193813_create_invitations.sql` gives each table exactly one policy:
a team's **owner** may read that team's invitations, and a person may read their own membership rows.
(The `team_members` half of that was widened later — see "Who may read a team" below. The
`invitations` half was not.) So:

- **The 20-pending limit is enforceable.** Like the 3-team limit, it needs a count of the team's other
  rows, which a policy cannot do. `invite-member` counts invitations that are neither accepted nor
  expired, and refuses at 20.
- **An invitation is written for somebody who has no account.** No policy can authorise a row on
  behalf of a person who does not exist yet, which is the same reason arrow (5) needs the secret key.
- **Accepting has to be atomic.** `accept-invite` claims the invitation with `where accepted_at is
  null` and requires exactly one affected row, so two clicks cannot both succeed. A policy has no way
  to express "only if nobody else got here first".

Note which policy reads the **owner** rather than the team's members: an invited person's address is
never shown to the rest of the team (`docs/plan.md`), so a member-level read on `invitations` would
leak exactly what that decision protects.

**Invitations expire after 7 days.** `expires_at` is stored as an absolute moment, defaulting to
`created_at + 7 days`, rather than computed when read — so an invitation's life cannot be quietly
extended by a later code change, and "expired" means the same thing to every query.

**The invitation token is never stored.** Only a SHA-256 hash of it, in `invitations.token_hash`. The
token itself goes into one email and nowhere else. Until it expires or is used, that token *is* a
credential — anyone holding the link can join the team — so it is kept the way a password is kept: as
a hash that cannot be read back. A leaked copy of the `invitations` table therefore lets nobody join
anything.

**Where these keys live, and the one place they do not.** All the keys above live *only* in the
function's own settings on Supabase — Edge Functions secrets — and **each project has its own**:
staging's Resend key is not production's, and staging's `AI_API_KEY` is not production's either —
production has no `AI_API_KEY` at all until Build it 21. **Never in a file.** Not in this
repository, not in a `.env` file on anybody's laptop, not in `.env.example`, not in Vercel, not in
GitHub Actions secrets, and not pasted into a chat. A server function reads its key from its own
environment at run time and nowhere else, so there is no file to leak and nothing for the secret
scanners in `docs/secrets.md` to find.

None of these keys is stored in Vercel. Vercel holds only public settings for the web app: the
Supabase URL and the publishable key.

There is a **third secret store**: GitHub Actions secrets. It holds **exactly one secret,
`PRODUCTION_SUPABASE_DB_URL`** — production's Session pooler connection string, password
percent-encoded — and it is used by exactly one job, `migrate` in
`.github/workflows/migrate-production.yml`, which applies database migrations to production after the
owner merges to `main`.

**No Supabase access token is stored anywhere**, in GitHub or otherwise. Supabase's own example
workflow uses `supabase link` with a `SUPABASE_ACCESS_TOKEN`; this project does not, deliberately. An
access token reaches the entire Supabase account, every project in it, staging included. A database
connection string reaches one database and nothing else. Fewer things, smaller blast radius. There is
no `SUPABASE_DB_PASSWORD` and no `SUPABASE_PROJECT_ID` either — both are inside that one string.

That secret is a **deploy credential, not a run-time key**: it never appears in a request from a
volunteer's browser, which is why it is not an arrow on the map above. It is drawn on the CI side
instead.

Every other arrow carries no key, or carries only the **publishable key**, which is meant to be
public. Arrows (1), (2), (3), (4), (6), (8), (9), (10), (11) and (13) carry no secret.

**Arrow (11), the error report, adds no secret — and that is a decision, not luck.** Sentry's project
key, the DSN, identifies a project and is meant to travel in a browser, exactly like the Supabase
publishable key; it is not a password for the account. Sentry's setup wizard would add a second value,
an **auth token** for uploading source maps, which *is* a secret. The wizard is not used and no source
maps are uploaded, so that token does not exist and there is no fourth secret store. See
`docs/plan.md` → "Error reports to an outside service".

**Arrow (12), the AI helper, is the opposite case, and that is also a decision.** Anthropic has no
public key that a browser could safely carry: the API key *is* the credential, and anything holding it
can spend money. So the call cannot be made from `web/` at all, and the arrow starts where every other
secret arrow starts — inside a server function, reading `AI_API_KEY` from that project's Edge Functions
secrets. It adds a key, but **not a new secret store**: it goes in the one that already holds the
service-role key and the Resend key. What crosses that arrow is deliberately thin — one task title and
fixed instructions written by this app — and what comes back is treated as text to read, never as
something to act on. See `docs/plan.md` → "Suggest subtasks — an outside AI service".

**No secret arrow starts at the web app.** There is no mobile app. If you ever find yourself
wanting a secret in `web/` client code, the answer is a new server function, not an exception.

## `usage_counts`, and which functions write it

Added 2026-10-08 for Build it 22 (`docs/plan.md` → "Daily limits on what costs money"), when nothing was
built. **Both halves are now built, and the status line has moved twice in one day** — which is exactly
what this paragraph exists to keep honest:

- **The migration is applied to staging and to production** (issue #220, PR #224):
  `supabase/migrations/20261008115900_usage_counts.sql`, the table and the one counting function. The
  owner applied it to staging on 8 October 2026 and the coach read it back through the staging read-only
  connector; production followed on the merge. `evidence/build-it-22-usage-counts.md` has both.
- **The counting is written** (issue #221): `supabase/functions/_shared/limits.ts` holds both numbers and
  both Edge Functions call `count_daily_use()` through it.
  `evidence/build-it-22-daily-limits-counting.md` has the tests, including the runs where they failed
  first.
- **And neither function is DEPLOYED.** The assistant deploys nothing (rule 19), staging is the owner's
  step and production follows a merge. **So nothing is limited in any running app**, both projects' tables
  are empty, and `docs/costs.md` is still right that the vendor ceilings are the only thing in the way of
  anything running today.

The rest of this section is the shape, agreed before anything was typed, which is what the top
of this file says the whole document is for — and every line of it is now also a description of code that
exists.

**The table is called `usage_counts`** — named by the owner on 2026-10-08, and the name to use
everywhere. One row per person, per feature, per day, holding four values and nothing else:

| Column | What it is |
|---|---|
| the person's ID | the `auth.users` id, and what the row is keyed by. `on delete cascade`, so the count goes with the account |
| the feature | which limited thing was used. A short fixed word, not free text |
| the day | a **UTC** date. Not a timestamp, so the row cannot say what time of day anybody was active |
| the count | how many times, that day |

The natural key is **(person, feature, day)**, so there is exactly one row per person per feature per
day and a use is an increment rather than an insert. **No task id, no title, no invited address, no team
id.** A row cannot be read backwards into what somebody was doing.

**Rows live 7 days**, decided by the owner on 2026-10-08, **and the removal is part of the same
statement that does the counting** — not a scheduled job, and not something anybody has to remember. So
the write path is: refuse if today's count has reached the limit, otherwise increment today's row and
delete this person's rows older than the window. One step.

**Which functions write it: the two that spend money, and nothing else.**

| Writes it | What it counts | Where in the order |
|---|---|---|
| `suggest-subtasks` | one metered request to Anthropic | after the door checks and the consent check, **immediately before** the call to the AI service |
| `invite-member` | one email sent to the email service — **including a retry**, which sends a second one | after the door checks and the team's 20-pending check, **immediately before** the send |

**Both write the count *before* the paid call and never take it back**, which is the owner's decision of
2026-10-08 and the reason the increment sits where the table above says. A count written after the answer
would make a loop of failures free, and a failing service is exactly when something retries. So the
count can be **higher than the number of calls that reached anybody, and never lower** — `docs/plan.md`
sets out why that is the right direction for an unknown to fail in.

**The two limits come from one file**: `supabase/functions/_shared/limits.ts`, confirmed by the owner on
2026-10-08, holding 20 and 20. A `_`-prefixed directory beside the functions rather than inside one,
because both functions read it and neither owns it.

**Nothing else writes it.** `create-team` and `accept-invite` spend nothing, so they have nothing to
count. The web app cannot write it at all — same reason it cannot write `teams`: the table will have no
insert or update policy, and the browser holds only the publishable key.

**It reads the count in the same place it writes it.** The check and the increment are one step in one
function, for the reason every other limit in this app lives in a function: a count has to be read across
rows the caller may not see, which a row-level policy cannot do, and a limit enforced by a screen is not
enforced. This is the same argument as "at most 3 teams per person" and "at most 20 pending invitations"
above, with one addition — those two count rows a person owns, and this one counts **what a person did**,
which is the first table in this database that is about behaviour rather than content.

**Who can read it: nobody through the app.** RLS on, **no policy**, and no table privileges for `anon`
or `authenticated` — the same shape as `account_status`, and the same reasoning: the table is meant to be
unreachable through the Data API, so the `revoke` is the lock that matters and the absence of a policy is
intended rather than an oversight. (Supabase's security advisor reports that as an
`RLS-enabled-no-policy` notice, which is the table working as designed; `evidence/production-log.md`
records the same notice being accepted for `account_status` on 4 October 2026.) **And `service_role`
needs no privilege on the table at all — only the right to run the one function that counts.** It holds
`EXECUTE` on `public.count_daily_use()` and **no `select`, `insert`, `update` or `delete`**, which is
what `supabase/migrations/20261008115900_usage_counts.sql` builds and what
`evidence/build-it-22-usage-counts.md` reads back.

*That is a correction, made by the owner on 8 October 2026, to what this section said when it was written
earlier the same day: "`service_role` needs select, insert, update and delete ... delete is needed because
of the 7-day decision". The second half was the mistake. The 7-day removal does need a deleter, but the
deleter is the **function**, which runs as its owner, not the role that calls it.* What the narrower shape
buys: a server function holding the service-role key cannot add to a count, cannot reset one to start
somebody's day again, cannot delete the window early, and cannot read which days a person used this app.
The only thing it can do is ask for one use and be told yes or no. The operator still reads the table in
the dashboard.

**It adds no secret and no new arrow.** Both writes happen inside functions that already hold the
service-role key, on connections that already exist, so nothing crosses a boundary that was not already
crossed. The two arrows that *do* carry a key — **(7)** the invitation email and **(12)** the AI call —
are unchanged; what changes is that each now has a counter in front of it.

**And it is what finally makes one claim on this page true.** The row for arrow (12) above says the
function is "where the three limits live that a browser could not be trusted with". A fourth joins them,
and it is the first one that is about *how often* rather than about *what*: until this table exists, the
only thing between a retry loop and Anthropic's 5-dollar cap is the cap itself
([#186](https://github.com/build-once/team-tasks/issues/186) and
[#184](https://github.com/build-once/team-tasks/issues/184) are the two open issues that say so). The
`Set` of user ids inside one isolate that `suggest-subtasks` uses today is **not** this: it lives in one
isolate's memory, so two asks that land on two isolates both proceed. It stays, because it catches a
double click for free, and it stops being the answer to "what stops this spending money".

**What happens to that `Set`, written out because "it stays" is easy to read as "it was forgotten"
(issue #221).** Nothing is removed and nothing about it is weakened. It still refuses a second
simultaneous ask from the same person on the same isolate, with the code `busy`, before any database
write — which is worth having and costs nothing. What changed is that both of the asks it *cannot* catch,
the two that land on two isolates, now go through the count, where they **are** told apart: the check and
the increment are one statement in the database, so the second one spends one of that person's twenty
instead of being free. **So [#186](https://github.com/build-once/team-tasks/issues/186) does not close.**
Its four conditions are about two *simultaneous* asks being counted, which is a different question from a
daily limit, and `docs/plan.md` says so in those words. Nor does
[#184](https://github.com/build-once/team-tasks/issues/184): a reload asks again, and a daily limit does
not stop the second ask — it stops the twenty-first.

## `attachments`, its rules, and how a browser gets a signed link

Added 2026-10-08 for Build it 23 (`docs/plan.md` → "Files attached to a task"), **when nothing was
built**: no bucket, no rule, no migration, no screen, no code, and no file ever uploaded to either
project. This is the shape, agreed before anything is typed, which is what the top of this file says the
whole document is for. The Supabase facts in it are cited from the pages named in `docs/plan.md`, read on
2026-10-08.

**What existed as of later the same day: the migration, and nothing else.**
`supabase/migrations/20261008191804_attachments_bucket.sql` (issue #237) holds the bucket row, the three
policies on `storage.objects`, the two counted limits and the trigger that refuses to delete a task with
files.

**And on 9 October 2026 it was applied and the screen was built (issue #242).** The migration is on
staging — the owner's `supabase db push`, read back by the coach — and on production, from the pipeline on
the merge of PR #241, **where nothing has been read back** ([#243](https://github.com/build-once/team-tasks/issues/243)).
`docs/environments.md` is where the applied-or-not record lives and is the authority on it. The screen is
the files panel on My tasks: a list of a task's files, Open and Delete on each, and the upload box. So
this section is no longer a description of a shape agreed before anything was typed — the parts of it
marked below as decided are built, and the parts marked unverified are still unverified.

### The bucket

**One bucket, named `attachments`, and it is private.** A file sits at
`attachments/<task id>/<file name>`, so **the first segment of the path is the task's ID** — and that is
not cosmetic, it is the whole mechanism: `storage.foldername()` returns an object's path segments, which
is what lets a rule ask which task a file belongs to without a column that says so.

**Private means there is no address that works.** Nothing in this bucket can be fetched by URL. The only
way to a file's bytes is a **signed link** the app asks Supabase for, on behalf of somebody it has
already checked. A public bucket would make every rule below decoration, which is the storage version of
the point this file makes about the publishable key: the key is safe only because RLS is on.

**Two restrictions live on the bucket itself**, so they hold whoever is uploading and whatever screen they
came from: **six named types only — `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/heic`
and `application/pdf`** — and **5 MB**.

**The types are named rather than admitted by `image/*`, decided 2026-10-08 after the migration's
review**, and the reason belongs here as well as in `docs/plan.md` because it is about this document's own
subject: the wildcard would have accepted `image/svg+xml`, and an SVG is a document that can carry script.
Arrow (13) below hands a browser a signed link to **this project's own Supabase address**, so an SVG
served through it would be script running from this app's origin, out of a file nobody read before it was
stored. **HEIC is the owner's addition** the same day, for iPhone photographs.

**And here is the honest limit of that, because it decides what the app may claim.** Supabase checks the
type the upload *declares*, and the declared type comes from the file's extension or from a `contentType`
the caller sets — both of which the uploader chooses. **So a renamed file gets through.** The bucket
enforces the refusal, not the contents. `docs/plan.md` says what the app will and will not promise as a
result, and carries the "not confirmed" that no Supabase page read says whether the bytes are inspected
at all.

**Which is why THIS APP SETS THE CONTENT TYPE ITSELF, and that is a finding rather than a preference —
settled on 9 October 2026 by the owner's staging run.** `docs/plan.md` and
[#239](https://github.com/build-once/team-tasks/issues/239) carried as not confirmed whether Supabase
maps a `.heic` file to `image/heic`. **It does not.** A `.heic` name with no `contentType` set by the
caller is refused with `InvalidMimeType` — so an iPhone photograph, the commonest thing this feature
exists for and the whole reason the owner added HEIC to the list, was refused by the very bucket that had
been widened to accept it.

So `web/src/lib/attachments.ts` holds one table from extension to type, and the upload declares the type
from it. Two things follow, and the second is the one that keeps the paragraph above honest:

- **It is read off the NAME, not off the bytes** — and not off `file.type` either: a browser that does not
  recognise `.heic` reports an empty type, which is the case that failed, and a browser's answer is chosen
  by whatever is uploading. So nothing above changes. A renamed file still gets through, and the app still
  promises the refusal and never the contents.
- **What it changes is that a file this app does not recognise is refused HERE, in words**, instead of
  being sent and refused out there with a code. The bucket is still what enforces the refusal; this only
  means the person reads a sentence.

### The rules: `storage.objects`, not a new table

**The rules are row-level security policies on `storage.objects`**, which is where Supabase keeps one row
per stored file. "By default Storage does not allow any uploads to buckets without RLS policies. You
selectively allow certain operations by creating RLS policies on the `storage.objects` table"
([Storage access control](https://supabase.com/docs/guides/storage/security/access-control), read
2026-10-08). So a bucket with no policy is a bucket nothing can be put in or taken out of — the same
default-deny `teams` relies on, and the reason that page's own warning about the service key matters here
too: "Service keys entirely bypass RLS policies".

**This project's own table of who may touch a file is one sentence: the same people who may touch its
task.** Which is not a new rule to write down — it is a rule to *delegate*, and the delegation is the
interesting part:

| Operation | The policy, in words | Why it is shaped that way |
|---|---|---|
| **`SELECT`** — see that a file is there, and get a signed link for it | the caller may see the task whose ID is the first segment of the path, **and** `is_active()` | A subquery on `public.tasks` inside the policy runs **as the caller**, so `tasks`' own policies apply to it. The storage rule therefore does not restate feature 5 — it **asks** it, and cannot drift from it |
| **`INSERT`** — attach a file | the same question, plus `is_active()` — **and it is no longer the only thing in the way** | "the only RLS policy required for uploading objects is to grant the `INSERT` permission", from the page above. But the owner's decision of 2026-10-08 puts **the 100 MB per person on the server at upload**, and a policy cannot sum a person's other files. So this policy is now the **floor** rather than the control: it still refuses an upload onto somebody else's task, and something of ours stands in front of it to count — see below |
| **`DELETE`** — remove a file | the same question, plus `is_active()`, **plus either `owner_id = auth.uid()` or the caller created the task** | **A file may be deleted by whoever uploaded it, or by whoever created its task, and by nobody else** — decided by the owner on 2026-10-08. So this is the one of the four policies with a **second** condition beside the task question, and the only one that asks something about the file itself: which is why `owner_id` has to mean what `docs/plan.md` marks as not confirmed about it. The two halves come from different rows — `storage.objects.owner_id` for the uploader, `tasks.owner_id` for the creator — so the policy reads both, and a team mate who is neither gets no `DELETE` at all |
| **`UPDATE`** | **none, on purpose** | Nothing in this design overwrites a file. Upsert is what would need `SELECT` and `UPDATE` together, and not offering it means a file's bytes never change under a link somebody already holds |

**That `exists (select 1 from public.tasks where id = …)` shape is the thing to get right**, and it is the
same trick `team_roster` uses with `security_invoker = true`: a rule that reads its tables **as the person
asking** inherits every decision already made about them, where a rule that re-implements the question
has two places to keep in step. There is exactly one definition of "may this person see this task" in
this project, and attachments must not become a second.

**`is_active()` has to be named explicitly, though — it is not inherited.** `tasks`' policies refuse a
suspended person, so a subquery on `tasks` already answers no for one; writing the call anyway costs
nothing and means the storage rule still refuses if anything about that chain ever changes. The plan says
a suspended person reaches nothing, and a bucket is one more door that has to agree.

### How the browser gets a signed link

**Arrow (13), and it carries no secret key** — the only arrow added since Build it 20 that does not.

1. The browser is on My tasks, signed in, holding the **publishable key** and the person's session.
2. It asks Supabase Storage for a signed URL for one object. Creating one is a read of that object, so
   **the `SELECT` policy above is what decides** — and it decides by asking whether this person may see
   the task. A person who may not gets no link, from the database rather than from a screen.
3. Supabase answers with a URL that works "for a fixed amount of time", the time being `expiresIn` —
   "The number of seconds until the signed URL expires"
   ([`createSignedUrl`](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl),
   read 2026-10-08). **This app uses 300 seconds.**
4. The browser fetches the file from that URL. **That fetch carries no key and no session** — the
   signature in the URL is the whole of its authority.

**So the check happens when the link is made, and never again.** Which is the design's one sharp edge and
is written up in `docs/plan.md` rather than here: for those five minutes **anyone holding the link** can
open the file, signed in or not, and suspending the account, removing the person from the team or moving
the task out of it does not call the link back. The five minutes is the only control, which is why it is
short and why raising it is not a free convenience.

**No server function is involved in reading a file, and that is deliberate.** Reading needs no **count**:
the question is a single fact about one row — may you see its task — which is precisely the line this file
draws elsewhere between what a policy does well and what needs a function. So **reading** adds no key and
no new secret store.

### Uploading goes through server code, and that is now decided

**The owner decided on 2026-10-08 that the 100 MB per person is enforced on the server, at upload.** That
is one sentence and it settles the thing this section could not settle when it was written that morning:
**a direct browser upload with nothing but a storage policy in front of it is ruled out.**

The reason is the one this file gives about every counted limit in this app. A per-person total is a **sum
across rows the caller may not be able to see**, and so is the three-per-task — the same shape as "at most
3 teams per person" and "at most 20 pending invitations per team". A limit checked only in a form is not a
limit, because a form can be bypassed.

**One sentence of this is corrected, 8 October 2026, and the decision above is not.** This paragraph read
"neither of which a row-level policy can express, because the rule would have to count the caller's other
rows", and the row for arrow (14) says the same: "A row-level rule on `storage.objects` can say 'this file
belongs to a task you may see'; it cannot say 'and you are under your 100 MB'." **That is true of a policy
expression evaluated as the caller, and not true of a policy that calls a `security definer` function** —
which is how `is_active()` already reads a table the app has no privilege on at all.
`supabase/migrations/20261008191804_attachments_bucket.sql` does exactly that: `attachments_may_add()`
counts both limits as its owner, the `INSERT` policy calls it, and
`evidence/build-it-23-attachments-bucket.md` section 7 is both limits refusing — including twenty and
forty simultaneous uploads held to three, with the same test seen to fail when the two advisory-lock lines
are removed.

**So the limits are now in the database as well, and the owner's decision stands unchanged, because of
the sentence above about service keys.** "Service keys entirely bypass RLS policies", so in the
through-a-function upload shape **no policy on `storage.objects` is evaluated at all** and the database's
count is not reached. An upload made that way also has no `owner_id` — "When using the `service_key` to
create a resource, the owner will not be set"
([Ownership](https://supabase.com/docs/guides/storage/security/ownership), read 2026-10-08) — so it
belongs to nobody's 100 MB and nobody but the task's creator can delete it. The server-side count is
therefore still required, and these two facts are an argument for the **signed upload URL** shape over the
through-a-function one, which the next section leaves open.

**So uploading is now the mirror image of reading, which is worth stating because the two look alike and
are not:**

| | Reading a file | Uploading a file |
|---|---|---|
| What has to be decided | a single fact about one row | a fact about one row **and a sum over others** |
| Where it is decided | the `SELECT` policy, in the database | **server code**, before the file is accepted |
| Does it need a key | **no** | yes — the counting runs where the secret key already lives |

**How the bytes travel was the open question, and it is decided: THE BROWSER UPLOADS STRAIGHT TO
STORAGE, AS THE SIGNED-IN PERSON.** The owner's requirement for Build it 23 part 2, 9 October 2026 —
"uploads go from the browser with the person's own rights; no service-role upload" — and it is
[#240](https://github.com/build-once/team-tasks/issues/240)'s question answered. The code is
`web/src/app/tasks/AttachFile.tsx`, the only client component in this app.

**So "server code" in the owner's decision above means the database, not an Edge Function**, and that is
worth being exact about because the two readings build different things. The count the owner asked for is
`attachments_may_add()`: it runs with more rights than the caller, sums rows the caller cannot see, and
the `INSERT` policy calls it — which a screen cannot bypass and a later code change cannot forget. What
it needs in order to run at all is that **the upload be made by somebody row-level security applies to**,
which is exactly what this shape guarantees and what the other two did not.

**The two shapes this section used to name, and why neither was chosen:**

| Not chosen | Why not |
|---|---|
| **Through an Edge Function** with the service-role key | It loses both halves of #240. "Service keys entirely bypass RLS policies", so `attachments_may_add()` is **never called** and the count would have to be re-implemented in the function — a second place holding 3 and 104857600. And the stored row would have **no owner**: "When using the `service_key` to create a resource, the owner will not be set" ([Ownership](https://supabase.com/docs/guides/storage/security/ownership)), so the file would belong to nobody's 100 MB and nobody but the task's creator could delete it |
| **A signed upload URL** | It keeps the bytes out of our code, and its own page says those URLs "remain valid for 2 hours" — twenty-four times the life of the read link this app issues, and a credential of exactly the kind `docs/plan.md`'s "Links, and what an unexpired one allows" is careful about. Whether that can be shortened was never established, and it does not need to be: the chosen shape needs no second credential at all |

**What the chosen shape costs, stated rather than discovered.** Two things:

- **Attaching a file needs JavaScript**, and nothing else in this app does. Every other control on every
  screen is a link or a form posting to a server action, which is why the screens work with none. The
  upload box says so in a `<noscript>` line, in the place it matters. Seeing a file, opening one and
  deleting one all still work without it — a server-rendered list and two forms.
- **`@supabase/supabase-js` is now in the browser bundle**, which it never was before: `createClient` in
  `web/src/lib/supabase/client.ts` existed and nothing imported it. That had one concrete consequence
  worth recording, because it is the sort of thing that looks like a security finding and is not: the
  library ships `e.startsWith("sb_publishable_")||e.startsWith("sb_secret_")`, a test for which kind of
  key a string is, so the literal `sb_secret_` arrived in `web/.next/static` and CI's "No Supabase secret
  key in the built bundle" step matched it. **The owner authorised one change to that step on 9 October
  2026**: it now requires a character after the prefix, so every real key still matches and a prefix test
  does not. The reasoning is written out in `.github/workflows/ci.yml` beside the line.

**A server action was the alternative that needed no client JavaScript**, and it was offered: the server
client carries the person's own JWT, so the `INSERT` policy would still be evaluated and `owner_id` still
set. What it costs is that the 5 MB passes through this app's own server, and that
`serverActions.bodySizeLimit` would have to be raised from its documented 1 MB default. The owner chose
the browser.

**This adds no new secret store and no new secret.** There was never a key in this path: the browser holds
the publishable key and the person's session, exactly as it does for every other read in this app, and the
publishable key is safe for the reason the bottom of this file gives — row-level security decides what it
may reach.

### Deleting a task deletes its files, and the database is what enforces it

**The owner decided on 2026-10-08 that leftover files are not acceptable.** Two mechanisms, and the second
is the one that makes it a property of the system rather than of one code path:

1. **The app deletes all the files first, then the task, under the creator's own rights, and refuses the
   whole thing if any cannot be removed.** The order has **two** reasons. Failure: files-then-task can
   fail halfway and leave a task with fewer files, which is visible and recoverable; task-then-files
   fails halfway and leaves exactly the orphan this exists to prevent. And **permission**, which is the
   stronger one — the creator's right to delete these files comes *from* the task, through the `DELETE`
   policy above. Delete the task first and that right is gone, along with any row that could answer who
   created it. So this is the only order in which the permission exists at all.
2. **And the database refuses to delete a `tasks` row while files remain under `attachments/<task id>/`.**
   Whatever asked — a screen, a server function, the SQL editor, a cascade from somewhere else.

**Why the second is not belt-and-braces but the actual rule**, and it is the same argument this file makes
about feature 5: *a rule that lives only in the app holds until something else deletes the row.* There is
no foreign key available to do this job — nothing in Supabase connects `storage.objects` to `tasks`, which
is the whole problem — so the link has to be made rather than inherited, and it has to be made where
every path goes through it.

**The consequence worth drawing out: it makes a Build it 26 requirement self-enforcing.** Deleting an
account cascades to that person's `tasks`, so a refusal on `tasks` refuses the account deletion too while
any of those tasks still has a file. The intention "remove their files as well" stops being something
anybody has to remember.

**Confirmed on 8 October 2026, by trying.** This paragraph said "**Not confirmed** — whether such a
refusal fires on a cascade the way it fires on a direct delete has been neither read nor tried, and
nothing of this is built." The refusal is now built — a `before delete` row trigger on `public.tasks`,
`supabase/migrations/20261008191804_attachments_bucket.sql` section 7 — and
`evidence/build-it-23-attachments-bucket.md` section 8.5 is the run: deleting the `auth.users` row is
refused, and the error carries the cascade's own statement
(`DELETE FROM ONLY "public"."tasks" WHERE $1 = "owner_id"`) as its context, which is what says the
refusal came from inside the cascade rather than from something else. **On a local PostgreSQL 17.10
sandbox, not on Supabase**, and with a two-column stand-in for `auth.users` — so what is established is
a property of PostgreSQL, which is the right place for it to be a property of.

**And the reason nothing here needs a privileged delete path, which is the quiet virtue of the owner's
decision of 2026-10-08.** This section first said it created a case it could not resolve: with only the
uploader able to delete a file, a team task's creator could not delete their own task while another
member's file sat on it ([#234](https://github.com/build-once/team-tasks/issues/234)). The answer was to
widen the `DELETE` policy rather than to widen anybody's *authority* — **a file may be deleted by whoever
uploaded it or by whoever created its task** — and the consequence for this file is worth stating
plainly:

**no part of this app deletes anything with more power than the person asking for it.** The alternative
answer would have been a delete path running with the service-role key, removing one person's file on
another's instruction, bypassing every policy on the way through — and once a path like that exists, what
it may do is a property of code rather than of a rule a reviewer can read. The thing that permits this
deletion is instead the policy in the table above, which is exactly where this file says such decisions
belong: "the database is what actually stops Bob."

**What it does not grant.** A team mate who neither uploaded the file nor created the task gets no
`DELETE` at all — they can see it and open it, and that is the whole of it. And the task's creator gains
little she did not have: she could already destroy that file by deleting the whole task, which feature 4
has always permitted. What is new is the finer version of it.

### What this section does NOT decide

**Two** things, named so they are open questions rather than gaps somebody discovers while building.
(This said four earlier on 2026-10-08 and three later that day. The fourth was who clears a file somebody
else attached when the task has to go, and the owner settled it the same day — the paragraph above. The
third was which upload shape is used, and the owner settled that on 9 October 2026: the browser uploads
straight to Storage as the signed-in person. Counted here each time, not remembered.)

- **What removes a person's files when their account is deleted.** The task half is settled above, and
  this half is **a requirement of Build it 26** rather than of this one — the owner's decision of
  2026-10-08, held by [#235](https://github.com/build-once/team-tasks/issues/235). Whose job it is to walk
  a person's tasks and clear their files is that build's question, and guessing at it here would put an
  unreviewed design in this file.
- **Whether `storage.objects` records a last-opened time.** Two Supabase pages disagree, and if it does,
  this project will be holding when each person last opened each file. `docs/plan.md`'s "Unverified" list
  carries it, because it is a question about personal data before it is a question about architecture.

## The nightly copy: one scheduled job, what it reads, and where it writes

Added 2026-10-10 for Build it 24 part 0 ([#252](https://github.com/build-once/team-tasks/issues/252)),
**when nothing is built**: there is no workflow file, no copy has ever been made, no object exists in
`team-tasks-backups`, and no restore has ever been tried. This is the shape, agreed before anything is
typed, which is what the top of this file says the whole document is for. `docs/plan.md` → "A nightly copy
of production, held by another company" is the decision and what it means for people's data;
`docs/backups.md` is the map of what is covered today and what is not.

**Why it exists, in one line.** Supabase's own daily backups cover the database and **not** the files:
"Database backups do not include objects you store via the Storage API, as the database only includes
metadata about these objects" ([Database Backups](https://supabase.com/docs/guides/platform/backups), read
2026-10-10). The box on the map says so now; it used to say "PRO PLAN ONLY" and nothing about Storage.
[#248](https://github.com/build-once/team-tasks/issues/248) is the gap and this job is the answer.

### What it is, and the two ways it is unlike everything else on this map

**One GitHub Actions workflow, on a `schedule` trigger, with no `pull_request` and no
`workflow_dispatch`**, running in the **`supabase-production` environment** — the environment that already
exists and already holds the production credentials, which is why this needs no fourth secret store. It
reads production's database and bucket, encrypts on the runner, and writes one file to Cloudflare R2.

**First: it is the only thing in this project that reads everything.** Every other path in this document
is narrowed by design — a policy decides one row, a function checks one caller, a signed link opens one
file. A backup is a read of all of it, and there is no narrower version. That makes it the most powerful
thing that will ever run in this repository's CI, and the reason `docs/plan.md` lists the six controls on
it one by one instead of summarising them.

**Second: it is the only path where our code holds production data in plaintext.** Not a key *to*
production data — the data itself, on a GitHub-hosted runner, for the few minutes between the dump and the
encryption. Stated plainly because it is unavoidable for any copy made this way, and it is why the
encryption happens **on the runner** rather than after the upload.

### What it reads

| What | Through | Standing |
|---|---|---|
| **The whole production database** — all seven tables, and the Supabase-managed schemas with them: the accounts and their hashed passwords in `auth`, and the file metadata in `storage` | `PRODUCTION_SUPABASE_DB_URL`, **the secret that already exists**, in the same environment, used today by `migrate-production.yml`'s `migrate` job | **Available.** No new credential, and the same connection string that applies migrations can read everything |
| **Every file in the `attachments` bucket** | **A credential that does not exist yet** | **OPEN, and it is the one thing that stops this being buildable today** — see below |

**The database half has a trap in it, and it is worth this document's space because the obvious tool walks
straight into it.** `supabase db dump` is the CLI command for exactly this job, and it "Runs `pg_dump` in a
container with additional flags to exclude Supabase managed schemas. The ignored schemas include auth,
storage, and those created by extensions"
([`supabase db dump`](https://supabase.com/docs/reference/cli/supabase-db-dump), read 2026-10-10) — and
"The default dump does not contain any data or custom roles." So a copy built that way would contain **no
accounts, no password hashes and no file metadata**, and would look complete: the tables would all be
there. **`pg_dump` against the connection string is what takes everything**, which is available because the
secret is a plain Postgres URL rather than a Supabase API credential.

**And the two halves are taken by different mechanisms on different clocks**, which is the one correctness
problem in this design rather than a security one. A file's bytes live in the bucket and its row lives in
`storage.objects`, so a copy can easily hold rows without files or files without rows. Whatever is built
has to take both as near the same moment as it can and **say in the file which it took first** — because
on restore, a row without a file is a file the app offers and cannot open, and a file without a row is
bytes nobody can reach.

### The credential the bucket half needs, which does not exist

**Neither secret in that environment can read a file's bytes.** This is worth being exact about, because
"the pipeline already has production credentials" is the easy wrong answer:

- **`PRODUCTION_SUPABASE_DB_URL`** reaches the database, which holds `storage.objects` — the path, the
  size, the uploader, the timestamps — and **not one byte of any file**. The rows are metadata, which is
  precisely what the Supabase quote above says a backup already has and why it is not enough.
- **`PRODUCTION_SUPABASE_ACCESS_TOKEN`** is scoped to **Edge Functions Read-write** and nothing else, so
  through the Management API "it can do nothing but Edge Functions" — `migrate-production.yml`'s own header
  says so. It cannot read Storage. *It could deploy a function that reads Storage*, which that header is
  also careful to say about this token's real reach — and using it that way would be a backup job that
  works by deploying code to production, which is not a design anybody should accept.

**So something has to be added, and the shape of it is a decision at the top of the pull request.** The
option this document would propose, with its cost stated rather than buried: a **Supabase S3 access key**
for the production project, as two more environment secrets. Supabase's own warning about them is the
whole of the cost — "S3 access keys provide full access to all S3 operations across all buckets and bypass
RLS policies" and they are "meant to be used only on the server"
([S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication), read 2026-10-10). That
is a credential as powerful as the service-role key over Storage, held by a GitHub Actions job.

**What it is not, and must not become: the production service-role key in GitHub Actions secrets.** That
would be a value reaching every row of every table *and* every file, in a store whose whole current
justification is that it holds deploy credentials and no run-time app key — a sentence this file states
twice. If the choice ends up being between a Storage-only key and the service-role key, it is the
Storage-only key, and the reason is one line: **it cannot write to `tasks`.**

### Where it writes, and what Cloudflare actually holds

**One encrypted file per night, into a private R2 bucket named `team-tasks-backups`**, region Western
Europe (WEUR), public development URL disabled and no custom domain — the owner's report of 10 October
2026, with the coach having seen that settings page. Two secrets for the write
(`BACKUP_STORAGE_KEY`, `BACKUP_STORAGE_SECRET`), one for the encryption (`BACKUP_PASSPHRASE`), all three in
the `supabase-production` environment.

**The endpoint is an S3-compatible address of the shape
`https://<cloudflare account id>.r2.cloudflarestorage.com`, and its value is deliberately not written in
this repository.** It embeds the Cloudflare account ID, and `evidence/production-log.md`'s header refuses
to write the production project reference for the same reason; this repository is public. It belongs in a
GitHub environment variable beside the secrets, the way `PRODUCTION_SITE_URL` already does for the site
address.

**Cloudflare holds ciphertext and nothing else**, which is the difference between this new company and the
two outside services on this map that receive the app's data: Sentry would hold readable error reports and
Anthropic holds readable task titles. What Cloudflare *can* see is that the project exists, roughly how big its data is, and when the job
ran — the honest limit of "encrypted form only".

**Opening a copy needs both halves — the storage key and the passphrase — and the passphrase cannot be
recovered.** It is in the owner's password manager and a GitHub environment secret and nowhere else, and a
GitHub secret cannot be read back once set, so the password manager holds the only readable copy. **Lose it
and no copy can ever be opened.** That makes it the most valuable string in this project, ahead of the
service-role key, for a reason this file has not had to state before: **a leaked key can be rotated and a
lost passphrase cannot be recovered.**

### What this section does NOT decide

Four things, named so they are open questions rather than gaps somebody finds while building. All four are
at the top of the pull request.

- **The credential for the bucket half**, above. Nothing can be built until it is settled.
- **The two targets** — how much data we are willing to lose, and how long we are willing to be down.
  `docs/backups.md` proposes a day and a few hours and says what today's answers are against them.
- **The retention window and how old copies are removed.** `docs/plan.md` proposes 14 days by an R2
  lifecycle rule, so the job never deletes anything.
- **How a failed run reaches a person.** A backup job that quietly stopped manufactures confidence, so
  this matters more than it sounds. The two shapes already in this repository are GitHub's own failure
  email and `drift-check.yml`'s habit of opening an issue.

And two things it does **not** leave open, because they are not choices: **no artifact is ever uploaded**
(on a public repository that is a downloadable copy of production's database), and **the log carries names,
byte counts and statuses only** — the rule `migrate-production.yml`'s smoke-test job already follows and
documents.

## Who may read a team

`supabase/migrations/20261002122203_team_rules.sql` (Build it 14 part A) is the first migration whose
rules are about a **team** rather than a person. Three pieces, and one question underneath all of
them:

- **`profiles`** — one nickname per person, keyed by the auth user id. The only table in this
  database with write rules rather than a server function in front of it, because a display name has
  no limit that needs counting other rows: everything that must be true of it is true of the single
  row being written. You read your own row, and the rows of people who share a team with you.
- **`is_team_member(p_team_id)`** — "does the person making this request belong to this team?" True
  for the owner and for anybody with a `team_members` row. It is `security definer`, so it runs as the
  table owner and therefore does not re-enter the very rule that called it; it has
  `set search_path = ''` and schema-qualified names, because a function running with more rights than
  its caller must not resolve a name through a path somebody else can change; and **it never takes a
  user id**, only a team. Who is asking comes from `auth.uid()` inside its own body. `execute` is
  revoked from `public` and `anon` and granted to `authenticated` only.
- **`team_roster`** — team name, display name and a derived role (`owner` or `member`), created
  `with (security_invoker = true)` so it reads its tables **as the person asking**. Without that word
  a view reads as its own owner, which here would bypass every rule above and hand the whole database
  to anyone who selected from it.

Two existing read rules were widened by that migration, both from owner-only to member-level, and
both replacements return every row the old rule returned:

| Table | Was | Now |
|---|---|---|
| `teams` | the owner reads their own teams | the owner **and the members** read the team |
| `team_members` | you read your own membership rows | you read the whole members list of any team you are in |

`invitations` was deliberately left owner-only. An invited person's address is never shown to the rest
of the team (`docs/plan.md`), and a member-level read there would leak exactly what that decision
protects.

**What the screens do with all that** — Build it 14 part B, issue #80, folding in #76.
`web/src/app/teams/page.tsx` reads three of the pieces above: `teams` for the list of teams,
`team_roster` for each team's members list, and `profiles` for the signed-in person's own nickname.
The roster is read three columns at a time — `team_id` to group the rows, `display_name` and `role` to
draw each line — and never with a star, so a column the view grows later cannot arrive on a screen
nobody has looked at.

Because the select rule on `teams` now returns the teams a person **belongs to** as well as the teams
they **own**, that page can no longer treat one list as both. It splits them by comparing
`teams.owner_id` with the signed-in person's id, and the owner-only parts — the invite box, the waiting
invitations, and the count toward "at most 3 teams" — hang off the owned list only. Before that split,
a member was offered an invite box that `invite-member` could only refuse (HTTP 403), and the limit
note counted teams somebody merely belonged to.

Saving that nickname is the **only write any screen makes straight to a table**: every other write the
app performs goes through a server function holding the secret key. It can, for the same reason
`profiles` is the one table with write policies — a nickname needs no count of other rows.

The same migration adds a second write rule that is not a server function, which **no screen uses
yet**: a team's **owner** may delete a `team_members` row, which is how a member would be removed. It
needs a single fact about the row
being deleted — who owns its team — rather than a count of other rows, which is the line between what
a policy does well and what needs a function. Nobody can *leave* a team of their own accord; that is
on `docs/plan.md`'s not-built list and needs deciding rather than assuming.

## Who may touch a task

`supabase/migrations/20261002133637_tasks_join_teams.sql` (Build it 15 part 1) gives `tasks` an
optional `team_id`, so a task is either **personal** or belongs to **one team**. `docs/plan.md`
features 4 and 5 say what that means: every member of the team can see, tick and rename the team's
tasks, and only the person who created a task can delete it.

| Who | Personal task of theirs | Team task in a team they are in | Anybody else's |
|---|---|---|---|
| Read | yes | yes | no |
| Tick, rename | yes | yes | no |
| Delete | yes | **only if they created it** | no |
| Move between teams | yes, to a team they belong to | **only if they created it**, and only to a team they belong to | no |
| Change `owner_id` | **nobody, ever** | **nobody, ever** | no |

Three of those rows are ordinary policies, member-level through `is_team_member(team_id)`, and the
delete rule is the owner-only one `tasks` has had since it was created. The last two rows are a
**trigger**, `tasks_enforce_column_rules`, because a policy sees a whole row and cannot say "these
columns may differ and the others may not" — and column privileges could not express it either, being
per-role when every person using this app is the same role, `authenticated`.

That migration was an **expand** step: the new rules stood *alongside* the original owner-only ones.
While both sets stood, policies for the same command being OR-ed meant the old insert rule would let
an outsider file a task into somebody else's team, and the trigger was what refused that. So the
trigger is not scaffolding: it is what made the expand phase behave like the finished thing, and it
is untouched by everything below.

`supabase/migrations/20261002170244_tasks_drop_owner_only_rules.sql` (Build it 15 part 3) is the
**contract** step. It drops the three superseded owner-only rules — read, add and change — and keeps
`"Owners can remove their own tasks"`, which is the only delete policy `tasks` has: dropping it would
leave the table with no delete rule at all. Afterwards `tasks` has exactly four policies, one per
command, plus the trigger. The hole the old insert rule left — an outsider filing a task into
somebody else's team — is now closed by the policy as well as the trigger, and the trigger still
refuses a row written by hand in the SQL editor, where `auth.uid()` is null and no policy applies.

**No refusal message changes with that step**, which is worth knowing before anyone re-runs the
checks expecting different text. The trigger is a `BEFORE ROW` trigger, so it runs before a policy's
`with check` is evaluated: wherever both would refuse, the trigger gets there first and its sentence
is still what comes back.

One answer does change, and only one: a **stranded task** — one whose `team_id` names a team its
creator is no longer in, which today can only happen if a team owner removes that member by hand.
Its creator could tick and rename it while the old owner-only update rule stood; afterwards they
cannot, because they are not a member of its team. They can still see it, **move it back to
personal** — and then rename and tick it freely — and delete it. That is `docs/plan.md`'s rule
rather than a regression, but nothing in the app offers that route, so it is filed as its own issue.

`team_id` is `on delete set null`: deleting a team returns its tasks to the people who wrote them as
personal tasks, rather than destroying work written by members who did not delete anything. The
members of that team stop seeing each other's tasks, and which team a task used to be in is gone.

## Where the permission checks live

- **"Which tasks may this person see?"** — in the **database**, as Row Level Security on `teams`,
  `team_members` and `tasks`, plus the trigger above for which *columns* a member may change. This is
  feature 5 of the plan. The web app also hides other people's
  tasks, but that is only tidiness; the database is what actually stops Bob reading Alice's list.
  Test it with the Alice / Bob / Carol accounts (`docs/environments.md`), do not assume it.
- **"Who has paid?"** — **does not exist.** There are no payments and no paid tiers in the first
  version, so there is nothing to check. If payments ever arrive, the check belongs in the database
  or a server function reading a webhook, never in the browser.
- **"May this person invite someone?"** — in a **server function**, which checks membership before
  writing the invitation, because that step uses the service-role key and bypasses RLS.
- **"May this person open this file?"** — in the **database**, as Row Level Security on
  `storage.objects`, and **by asking the task question rather than answering it again**: the policy
  checks whether the caller may see the task whose ID is the first segment of the file's path. Added
  2026-10-08, built nowhere. Two things follow and both are the point. A locked database does not lock a
  bucket — buckets have their own rules, and a bucket with none refuses everything. And the check happens
  when the **signed link is made**, not when it is used, so a link already handed out keeps working for
  its five minutes whatever changes behind it.
- **"May this person attach another file?"** — in a **server function**, and this is the pair to the
  bullet above rather than a repeat of it. Opening a file is a fact about one row, so the database
  answers it. Attaching one is a question about **how much this person already has** — 3 on this task,
  100 MB in total — which no row-level rule can answer, because the rule would have to count rows the
  caller may not be able to see. The owner decided on 2026-10-08 that it is enforced on the server, which
  is the same answer "at most 3 teams per person" got and for the same reason.
- **"May this person delete this file?"** — in the **database**, and it is the one storage question with
  **two** ways to say yes: the person uploaded the file, or the person created the task it is on. The
  owner's decision of 2026-10-08. Worth its own bullet because of what it avoids: deleting a task removes
  all its files **under the creator's own rights**, so there is no delete path in this app that runs with
  more authority than the person asking. The alternative would have been code holding the service-role
  key removing one person's file on another's instruction — and what such a path may do is a property of
  code rather than of a rule anybody can read.

## The parts

| Part | What it does in my app | Service we'll use | Public or secret |
|---|---|---|---|
| Web app | Every screen: sign-in, team page, task list, tick boxes | Next.js, in `web/` | **Public** — anyone can read this code |
| Sign-in | Sign up, sign in, password reset; answers "who is this?" | Supabase Auth | **Public** key in the browser |
| Database + RLS | Holds teams, members, tasks, invitations. RLS enforces feature 5 | Supabase Postgres | **Public** key, safe only because RLS is on |
| Server functions | Creating a team, the invite flow, and anything else needing a secret key | Supabase Edge Functions | **Secret** — server side only. The key lives in the function's settings on Supabase, never in a file |
| Where secrets live | Run-time app keys: service-role key and Resend key. Deploy credential: `PRODUCTION_SUPABASE_DB_URL`, and nothing else | Run-time keys in **Supabase Edge Functions secrets**; the one deploy credential in **GitHub Actions secrets**; a git-ignored `.env` locally | **Secret** — never in git, never in Vercel, never in a browser, never in chat |
| Email | Sends the one email the app needs: "you have been invited" | Resend — **not set up yet** | **Secret** API key, held in Supabase |
| Backups | Daily copies of the **database**, so a mistake is survivable — **and they do not include the files**: "Database backups do not include objects you store via the Storage API" ([Database Backups](https://supabase.com/docs/guides/platform/backups), read 2026-10-10). **No restore has ever been tried** (#249) | Supabase automatic backups — **Pro plan only**, so production has them and free staging has none. (That claim is in doubt: production had seven dailies dated before its Pro transfer — #247) | **Secret** — owner only |
| The nightly copy | Closes the gap in the row above: copies the whole database **and every attached file**, encrypted on GitHub's runner before it leaves, so a restore brings the files back too (#248). Added 10 Oct 2026, **nothing built** | **Cloudflare R2**, a private bucket `team-tasks-backups` in WEUR — **a fifth company, and the only outside service that holds this app's data without being able to read it** | **Secret**, and two of them have to be held together: `BACKUP_STORAGE_KEY` + `BACKUP_STORAGE_SECRET` get the file, `BACKUP_PASSPHRASE` opens it. All three in the `supabase-production` GitHub environment. **The passphrase has one readable copy, in the owner's password manager; lose it and no copy can ever be opened** |
| CI/CD | Checks every pull request, then deploys `main`, and applies database migrations to production | GitHub Actions, then Vercel | **Public** repo settings. The web app deploy runs through the GitHub–Vercel connection, so there is no deploy key to hold. The migration job holds the single GitHub Actions secret, `PRODUCTION_SUPABASE_DB_URL` |
| Hosting | Builds and serves the web app | Vercel | **Public** only — the Supabase URL and publishable key. No secret lives here |
| Monitoring | Will tell you the app is broken before a volunteer does, by sending an error report when a screen or a server route throws | **Sentry**, free plan, data region United States — chosen 5 Oct 2026, **not installed yet** | **Public** — the DSN is meant to be in the browser. No secret, because the setup wizard and its source-map auth token are not used |
| Files on a task | Holds the images and PDFs people attach to a task, in a private bucket named `attachments`, and hands them back through links that expire after 5 minutes | **Supabase Storage**, in the projects this app already has — chosen 8 Oct 2026, **nothing built yet** | **Both, and the split is the point.** *Reading*: **public** key only — the browser asks for a signed link with the publishable key and its session, and rules on `storage.objects` decide. *Uploading*: **secret** — the service-role key, in a server function, because the 100 MB per person is a sum a browser cannot be trusted to make |
| AI helper | "Suggest subtasks" on one task: sends that task's title and fixed instructions, offers back up to five short suggestions | **Anthropic Claude API**, Claude Haiku 4.5, in a Console workspace named Team Tasks with a 5 USD monthly spend limit — chosen 7 Oct 2026, **not installed yet** | **Secret** API key (`AI_API_KEY`), held per project in Supabase Edge Functions secrets. There is no public key here, so the browser never calls Anthropic at all |

## What I left out, and why

| Part | Why it is not here |
|---|---|
| **Mobile app** | `docs/plan.md` says a web app that works well in a phone browser, and "no app store, no native app". A phone browser is not a mobile app; nothing to draw. |
| **Payments** | On the plan's not-yet list. The app is free for six volunteers. No payments means no webhook, no entitlement check, and no card data anywhere — a large amount of risk simply absent. |
| **Webhooks** | A webhook is a message *in* from an outside service. Nothing sends you one: no payments, and the app does not need Resend's delivery reports. Adding one would mean signature checking, which is a real job. |
| **File storage** | **No longer left out, as of 8 Oct 2026.** This row used to read: "File attachments are on the not-yet list. Supabase Storage exists in your project but stays unused and empty. Worth knowing that buckets have their **own** access rules — a locked database does not lock your files — for when this changes." This is what "for when this changes" looks like: the plan was changed first (`docs/plan.md` → "Files attached to a task"), and the bucket, its rules and arrow (13) are above. **The migration exists and is applied nowhere** (#237, 8 Oct 2026); there is no screen, no upload path and no file. And the warning in the old sentence is the reason the section above exists: buckets *do* have their own rules, so the rules on `storage.objects` are written to **ask** the task rules rather than restate them. What is left out *inside* it is deliberate: the bucket is private, there is no sharing and no "anyone with the link" setting, nothing goes to Sentry or to Anthropic, and no file name may appear in an error report. |
| **AI or other outside services** | **No longer left out, as of 7 Oct 2026.** This row used to read: "'An AI helper' is on the not-yet list. No model is called, so no prompt, no token bill, and no third party receiving task text." All three halves of that sentence stop being true when Build it 20's code lands — a model *is* called, there *is* a token bill, and a third party *does* receive one task's text. The plan was changed first (`docs/plan.md` → "Suggest subtasks"), and the box and arrow (12) are on the map above. Still nothing installed. What is left out *inside* it is deliberate: no name, no user ID, no team name, no second task, and no production key until the consent setting lands in Build it 21. |
| **Monitoring** | No longer empty: **Sentry** was chosen on 5 Oct 2026 and is drawn on the map, still with nothing installed. What is left out *inside* it is deliberate: no session replay, no performance tracing, and no request or response bodies — the three Sentry features that would carry task text, addresses and tokens out of this project. |

## Two things settled

**Monitoring is planned, not missing — and the service is now chosen.** Error monitoring gets added in
its own step, before real volunteers rely on the app. On 5 October 2026 the owner picked **Sentry**, on
its free plan, with the organisation's data region set to the **United States**, and created a Next.js
project named `team-tasks`. Nothing is installed: no package, no DSN in any environment, no code, and
no error report has ever left this app. Which environments will send is settled — **Production and
Preview on Vercel; local development sends nothing unless a DSN is set in a local file** — and what may
be in a report is settled in `docs/plan.md`. What is not settled is in that file's "Unverified" list.

**Team Tasks is for volunteer groups in the first version.** `docs/plan.md` is right as written: one
volunteer organiser and about five others. Business teams are not in scope for version one, which is
also what keeps Vercel's free plan usable (`docs/stack.md` decision C). Settled — no reopening
needed.

## The publishable key is safe only when RLS is on

Carried over from the generic version of this file, because it is the single most important thing
on this page.

Supabase gives you two kinds of key:

- The **publishable (anon) key** sits in the browser and anyone can copy it. That is fine **only
  because RLS decides what it can do.** If `tasks` has RLS **off**, anyone with that key can read
  and change every task in your database — all six volunteers' lists, and everyone else's.
- The **service-role key** skips RLS completely. It is a master key. It lives only in **Supabase's
  Edge Functions secrets** and in your git-ignored `.env`. Never in Vercel, never in the browser,
  never in git, never pasted into a chat.

Test it, do not assume it: sign in on staging as **Bob** and try to read **Alice's** tasks. You
should get nothing back.

## What cannot wait, for this app

Before any real volunteer signs up:

- RLS on `teams`, `team_members`, `tasks`, `invitations` and `profiles`, tested as Alice, Bob and
  Carol. For the team rules that means `scripts/staging/build-it-14-checks.mjs`, green, with its
  output saved as evidence.
- Run-time secrets only in **Supabase's Edge Functions secrets** and a git-ignored `.env`; nothing
  secret in Vercel; the CI secret scan green.
- The one deploy credential, `PRODUCTION_SUPABASE_DB_URL`, only in **GitHub Actions secrets**, and
  reachable only by workflows running on `main` — never by a pull request, and never from a fork. It
  is a production credential: whatever can read it can change production data. The workflow that
  uses it has no `pull_request` trigger for exactly that reason.
- Separate staging and production Supabase projects, in separate organisations (`docs/stack.md`
  decision B).
- Production on Pro so automatic daily backups exist, and **one test restore actually done**. Free
  staging has no automatic backups — do not keep anything on staging you would mind losing.
  **Both halves moved on 10 October 2026, in opposite directions.** Production *is* on Pro, by the owner's
  transfer that day. And the first half turns out not to be enough: **those backups do not include the
  files** (#248), so "automatic daily backups exist" covers the database and leaves the one thing in this
  app nobody can retype uncovered. That is what the nightly copy above is for, and **it is not built.**
  The restore half is untouched and still undone — `scripts/launch-check.mjs` reports `backups-on` and
  `restore-tested` as TODO because neither evidence file exists (#249), and the restore drill belongs in a
  temporary project deleted the same day, **never staging** (`docs/plan.md`, `docs/backups.md`).
- `main` protected — still open, see `docs/stack.md` decision D.
- Invitation email working from a verified domain, not Supabase's built-in test sender.
- Error monitoring set up — **Sentry** chosen on 5 Oct 2026, **nothing installed yet**, and it needs to
  happen before real volunteers rely on the app. Two settings go with it, neither yet seen in the
  dashboard: storing IP addresses **off**, and default data scrubbing **on** (`docs/plan.md`).
- The AI helper's consent setting — Build it 21. Until it exists, **production has no `AI_API_KEY`**,
  which is what keeps a task title from leaving production before anybody has been asked. Checking that
  production really has no such secret is a thing to do with eyes on the dashboard, not an assumption
  (`docs/plan.md` → "Suggest subtasks"). Usage counts and daily limits are Build it 22; until then the
  only ceiling is the 5-dollar spend limit at Anthropic (`docs/costs.md`).
- Some way to delete an account, or a written decision that there is none (`docs/plan.md` appendix).
- `npm run launch:check` completed with evidence.

- **The rules on the `attachments` bucket, tested as Alice, Bob and Carol** — added 2026-10-08, and it
  moved up from the "can wait" line below on the day the plan changed. A private bucket with no policy
  refuses everything, so the danger is not the default: it is a policy written slightly too wide, which
  would hand a file to somebody who cannot see its task. There is nothing to test yet, and when there is,
  it is the same three accounts and the same shape as `scripts/staging/build-it-14-checks.mjs`.

Can wait: webhook signatures (no webhooks), payment testing (no
payments), caching and speed tuning, bigger database plans.

**"File storage rules (no files yet)" left that line on 2026-10-08** and is now the bullet above it. The
parenthesis was the reason it could wait, and `docs/plan.md` → "Files attached to a task" is what stopped
it being true.
