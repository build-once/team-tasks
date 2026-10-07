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
                          |  PRO PLAN ONLY.      |        +------------+-------------+
                          |  Free staging has    |                     |
                          |  NO automatic        |            (8) "you have been
                          |  backups at all.     |                invited to a team"
                          +----------------------+                     |
                                                                       v
                                                          +--------------------------+
                                                          |  Bob's email inbox       |
                                                          +--------------------------+


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
```

## The arrows that carry a secret key

Five, and all five start at the server functions. (This sentence already said five on 2026-10-06 while
the table listed four rows. The AI call added on 2026-10-07 is the fifth row, so the word and the
number of rows now agree — counted here, not remembered.)

| Arrow | Key it carries | Starts at | Where the key is stored | Why it has to be there |
|---|---|---|---|---|
| **create a team** — not drawn on the map above yet | Supabase **service-role key** | Supabase Edge Function | Supabase Edge Functions secrets | Both limits in `docs/plan.md` — a name of 1 to 60 characters, and at most 3 teams per person — have to hold even if the request does not come from our own screens. A browser cannot be trusted to enforce its own limit, and counting somebody's teams is not something a person should have to be able to read rows to do. (An earlier version of this row said creating a team also makes its owner its first member. It does not: `create-team` writes only to `teams`, and an owner has no `team_members` row.) |
| **(5)** write the invitation row | Supabase **service-role key** | Supabase Edge Function (`invite-member`) | Supabase Edge Functions secrets | Bob has no account yet, so no RLS rule can let "Bob" write his own invitation. Only trusted server code may create that row — and the 20-pending limit below needs to count the team's other invitations, which a policy cannot do. |
| **(7)** send the invitation email | **Resend API key** (`EMAIL_API_KEY`) | Supabase Edge Function (`invite-member`) | Supabase Edge Functions secrets, **per project** | Anyone holding this key could send email as your app. It must never reach a browser. |
| **accept an invitation** — not drawn on the map yet | Supabase **service-role key** | Supabase Edge Function (`accept-invite`) | Supabase Edge Functions secrets | Marking an invitation accepted and writing the `team_members` row both have to happen for somebody who is not yet in the team, so no policy on either table can allow it. The claim also has to be atomic, or two clicks both succeed. |
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
public. Arrows (1), (2), (3), (4), (6), (8), (9), (10) and (11) carry no secret.

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

## The parts

| Part | What it does in my app | Service we'll use | Public or secret |
|---|---|---|---|
| Web app | Every screen: sign-in, team page, task list, tick boxes | Next.js, in `web/` | **Public** — anyone can read this code |
| Sign-in | Sign up, sign in, password reset; answers "who is this?" | Supabase Auth | **Public** key in the browser |
| Database + RLS | Holds teams, members, tasks, invitations. RLS enforces feature 5 | Supabase Postgres | **Public** key, safe only because RLS is on |
| Server functions | Creating a team, the invite flow, and anything else needing a secret key | Supabase Edge Functions | **Secret** — server side only. The key lives in the function's settings on Supabase, never in a file |
| Where secrets live | Run-time app keys: service-role key and Resend key. Deploy credential: `PRODUCTION_SUPABASE_DB_URL`, and nothing else | Run-time keys in **Supabase Edge Functions secrets**; the one deploy credential in **GitHub Actions secrets**; a git-ignored `.env` locally | **Secret** — never in git, never in Vercel, never in a browser, never in chat |
| Email | Sends the one email the app needs: "you have been invited" | Resend — **not set up yet** | **Secret** API key, held in Supabase |
| Backups | Daily copies of the database, so a mistake is survivable | Supabase automatic backups — **Pro plan only**, so production has them and free staging has none | **Secret** — owner only |
| CI/CD | Checks every pull request, then deploys `main`, and applies database migrations to production | GitHub Actions, then Vercel | **Public** repo settings. The web app deploy runs through the GitHub–Vercel connection, so there is no deploy key to hold. The migration job holds the single GitHub Actions secret, `PRODUCTION_SUPABASE_DB_URL` |
| Hosting | Builds and serves the web app | Vercel | **Public** only — the Supabase URL and publishable key. No secret lives here |
| Monitoring | Will tell you the app is broken before a volunteer does, by sending an error report when a screen or a server route throws | **Sentry**, free plan, data region United States — chosen 5 Oct 2026, **not installed yet** | **Public** — the DSN is meant to be in the browser. No secret, because the setup wizard and its source-map auth token are not used |
| AI helper | "Suggest subtasks" on one task: sends that task's title and fixed instructions, offers back up to five short suggestions | **Anthropic Claude API**, Claude Haiku 4.5, in a Console workspace named Team Tasks with a 5 USD monthly spend limit — chosen 7 Oct 2026, **not installed yet** | **Secret** API key (`AI_API_KEY`), held per project in Supabase Edge Functions secrets. There is no public key here, so the browser never calls Anthropic at all |

## What I left out, and why

| Part | Why it is not here |
|---|---|
| **Mobile app** | `docs/plan.md` says a web app that works well in a phone browser, and "no app store, no native app". A phone browser is not a mobile app; nothing to draw. |
| **Payments** | On the plan's not-yet list. The app is free for six volunteers. No payments means no webhook, no entitlement check, and no card data anywhere — a large amount of risk simply absent. |
| **Webhooks** | A webhook is a message *in* from an outside service. Nothing sends you one: no payments, and the app does not need Resend's delivery reports. Adding one would mean signature checking, which is a real job. |
| **File storage** | File attachments are on the not-yet list. Supabase Storage exists in your project but stays unused and empty. Worth knowing that buckets have their **own** access rules — a locked database does not lock your files — for when this changes. |
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

Can wait: file storage rules (no files yet), webhook signatures (no webhooks), payment testing (no
payments), caching and speed tuning, bigger database plans.
