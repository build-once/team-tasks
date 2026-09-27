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
   |  decide what      |  |                      |  |  Supabase Edge         |
   |  they may see.    |  |  ROW LEVEL SECURITY  |  |  Functions secrets     |
   +---------+---------+  |  decides what each   |  |  Runs the invite flow  |
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
   |  MONITORING  -  PLANNED, LATER STEP.                                  |
   |  Error monitoring gets added in its own step, before real             |
   |  volunteers rely on the app. Not built yet.                           |
   +-----------------------------------------------------------------------+
```

## The arrows that carry a secret key

Exactly two, and both start at the server functions:

| Arrow | Key it carries | Starts at | Where the key is stored | Why it has to be there |
|---|---|---|---|---|
| **(5)** write the invitation row | Supabase **service-role key** | Supabase Edge Function | Supabase Edge Functions secrets | Bob has no account yet, so no RLS rule can let "Bob" write his own invitation. Only trusted server code may create that row. |
| **(7)** send the invitation email | **Resend API key** | Supabase Edge Function | Supabase Edge Functions secrets | Anyone holding this key could send email as your app. It must never reach a browser. |

Neither key is stored in Vercel. Vercel holds only public settings for the web app: the Supabase
URL and the publishable key.

There is a **third secret store, planned for a later step**: GitHub Actions secrets, holding
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `SUPABASE_PROJECT_ID` so CI can apply database
migrations to production. Those are **deploy credentials, not run-time keys** — they never appear
in a request from a volunteer's browser, which is why they are not an arrow on the map above. They
are drawn on the CI side instead.

Every other arrow carries no key, or carries only the **publishable key**, which is meant to be
public. Arrows (1), (2), (3), (4), (6), (8), (9) and (10) carry no secret.

**No secret arrow starts at the web app.** There is no mobile app. If you ever find yourself
wanting a secret in `web/` client code, the answer is a new server function, not an exception.

## Where the permission checks live

- **"Which tasks may this person see?"** — in the **database**, as Row Level Security on `teams`,
  `team_members` and `tasks`. This is feature 5 of the plan. The web app also hides other people's
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
| Server functions | The invite flow, and anything needing a secret key | Supabase Edge Functions | **Secret** — server side only |
| Where secrets live | Run-time app keys: service-role key and Resend key. Deploy credentials: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID` | Run-time keys in **Supabase Edge Functions secrets**; deploy credentials in **GitHub Actions secrets** — *planned, later step*; a git-ignored `.env` locally | **Secret** — never in git, never in Vercel, never in a browser, never in chat |
| Email | Sends the one email the app needs: "you have been invited" | Resend — **not set up yet** | **Secret** API key, held in Supabase |
| Backups | Daily copies of the database, so a mistake is survivable | Supabase automatic backups — **Pro plan only**, so production has them and free staging has none | **Secret** — owner only |
| CI/CD | Checks every pull request, then deploys `main`. **Planned, later step:** also applies database migrations to production | GitHub Actions, then Vercel | **Public** repo settings. The web app deploy runs through the GitHub–Vercel connection, so there is no deploy key to hold. The migration step needs **GitHub Actions secrets** — *planned, later step* |
| Hosting | Builds and serves the web app | Vercel | **Public** only — the Supabase URL and publishable key. No secret lives here |
| Monitoring | Will tell you the app is broken before a volunteer does | **Planned, later step** — no service chosen yet | — |

## What I left out, and why

| Part | Why it is not here |
|---|---|
| **Mobile app** | `docs/plan.md` says a web app that works well in a phone browser, and "no app store, no native app". A phone browser is not a mobile app; nothing to draw. |
| **Payments** | On the plan's not-yet list. The app is free for six volunteers. No payments means no webhook, no entitlement check, and no card data anywhere — a large amount of risk simply absent. |
| **Webhooks** | A webhook is a message *in* from an outside service. Nothing sends you one: no payments, and the app does not need Resend's delivery reports. Adding one would mean signature checking, which is a real job. |
| **File storage** | File attachments are on the not-yet list. Supabase Storage exists in your project but stays unused and empty. Worth knowing that buckets have their **own** access rules — a locked database does not lock your files — for when this changes. |
| **AI or other outside services** | "An AI helper" is on the not-yet list. No model is called, so no prompt, no token bill, and no third party receiving task text. |
| **Monitoring** | Drawn, but empty. **Planned for a later step**, before real volunteers rely on the app. Not a gap — a sequencing decision. |

## Two things settled

**Monitoring is planned, not missing.** Error monitoring gets added in its own later step, before
real volunteers rely on the app. It is deliberately not in the first build, and the box in the map
says so. Nothing to decide here.

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

- RLS on `teams`, `team_members`, `tasks` and `invitations`, tested as Alice, Bob and Carol.
- Run-time secrets only in **Supabase's Edge Functions secrets** and a git-ignored `.env`; nothing
  secret in Vercel; the CI secret scan green.
- Deploy credentials only in **GitHub Actions secrets**, and scoped so they are available only to
  workflows running on `main` — never to a pull request from a fork. `SUPABASE_DB_PASSWORD` is a
  production credential: whatever can read it can change production data.
- Separate staging and production Supabase projects, in separate organisations (`docs/stack.md`
  decision B).
- Production on Pro so automatic daily backups exist, and **one test restore actually done**. Free
  staging has no automatic backups — do not keep anything on staging you would mind losing.
- `main` protected — still open, see `docs/stack.md` decision D.
- Invitation email working from a verified domain, not Supabase's built-in test sender.
- Error monitoring set up — planned for a later step, and it needs to happen before real volunteers
  rely on the app.
- Some way to delete an account, or a written decision that there is none (`docs/plan.md` appendix).
- `npm run launch:check` completed with evidence.

Can wait: file storage rules (no files yet), webhook signatures (no webhooks), payment testing (no
payments), caching and speed tuning, bigger database plans.
