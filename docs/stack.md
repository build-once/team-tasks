# Stack — team-tasks

Checked against `docs/plan.md` on 2026-09-27. Prices read from the official pricing pages on that
date; check them again before you pay for anything.

Nothing has been installed. This file is a decision record, not a set-up log.

## The six pieces — five chosen, one planned

Pieces 1 to 5 are the stack for the first version. Piece 6 is agreed but **not set up yet**.

### 1. Next.js — the web app (`web/`)

- **Job in your app.** Every screen the six volunteers see: the sign-in page, the team page, the
  task list, the tick boxes. It builds the pages and handles the routing between them.
- **How long widely used.** Released October 2016, mainstream since roughly 2018 — about ten
  years old, one of the two or three default ways to build a web app.
- **Managed sign-in / access rules.** Not relevant. Next.js draws screens; Supabase decides who
  may see what.
- **Can I leave with my data?** Yes. It is MIT-licensed code in your own repository. There is no
  account and nothing to export.
- **Pricing page.** None — it is free and open source. Hosting is what costs money, and that is
  Vercel below. Source: https://github.com/vercel/next.js

### 2. Supabase — database, sign-in, server functions, storage

- **Job in your app.** Holds teams, members and tasks in Postgres. Runs sign-up and sign-in.
  Enforces plan feature 5 — "see only the tasks of teams you belong to" — as Row Level Security
  rules inside the database, which is what `docs/plan.md` and `docs/architecture.md` both insist
  on. It also runs the **server functions**, as Supabase Edge Functions: the invite flow lives
  there, and **Supabase's Edge Functions secrets are the only place a secret key is stored** — the
  service-role key and the Resend key. Vercel holds no secret. Storage is part of the plan but your
  first version has no file uploads, so it stays unused.
- **Backups.** Automatic daily backups come with **Pro only**. Production has them; free staging has
  none. Do not keep anything on staging you would mind losing.
- **How long widely used.** Started 2020, in wide use since roughly 2021–22 — about four to five
  years. The youngest thing in this stack by a decade, and the only one I would call "established"
  rather than "boring". It is genuinely mainstream now, not niche.
- **Managed sign-in / access rules.** Yes to both, and this is the main reason to use it. Sign-in
  is managed (you do not store passwords yourself). Access rules are Postgres RLS — real rules in
  the database, not checks in your screens.
- **Can I leave with my data?** Yes, better than most. It is ordinary Postgres, so `pg_dump` or
  the Supabase CLI gives you everything, and any other Postgres host will take it. User accounts
  live in a normal `auth` schema that dumps with the rest.
- **Pricing page.** https://supabase.com/pricing

### 3. Vercel — hosting

- **Job in your app.** Builds the Next.js app when you push, serves it to phones and laptops, and
  gives every pull request a preview link. It holds **public settings only** — the Supabase URL and
  the publishable key. No secret key lives in Vercel; those are in Supabase (piece 2).
- **How long widely used.** The service dates to 2016 (originally Zeit Now, renamed Vercel in
  2020) — about ten years. It is the company that makes Next.js, so support for it is first-class.
- **Managed sign-in / access rules.** Not relevant. It serves files; it holds none of your data.
- **Can I leave with my data?** Yes. Your code is in GitHub, not Vercel. Settings and environment
  variables can be pulled down with the Vercel CLI. Moving a Next.js app to another host is a
  normal afternoon's work, not a rescue mission.
- **Pricing page.** https://vercel.com/pricing

### 4. GitHub — code, history and automatic checks

- **Job in your app.** Stores the code and its history, runs the pull-request checks the Build
  Once kit sets up, and is where `main` gets protected so nothing lands without review.
- **How long widely used.** Since 2008 — about eighteen years. The safest choice on this list.
- **Managed sign-in / access rules.** Not relevant to your app's users. It controls who can change
  your code, not who can see a task.
- **Can I leave with my data?** Yes. `git clone` already gives you the complete history on your
  own machine. Issues and pull-request discussion need GitHub's export tool, which is the one part
  that is not automatically in your hands.
- **Pricing page.** https://github.com/pricing

### 5. The Build Once starter — the safety rails you already copied

- **Job in your app.** It is this repository: the guards in `.claude/hooks/` and `guard/`, the CI
  checks, the launch checklist, the skills that make me show evidence, and the rules in
  `AGENTS.md` and `CLAUDE.md`.
- **How long widely used.** **NOT MAINSTREAM — flagged.** `package.json` says version `0.1.0`,
  and the README says the course it accompanies is "coming soon". This is a new, small project,
  not an established tool. That is a reasonable thing to accept here, because it is plain Node
  scripts and Markdown sitting in your own repository rather than a service you depend on, and
  because the worst case is that you stop using it. But it does not belong in the same
  "widely used" category as the four above, and I am not going to pretend otherwise.
- **Managed sign-in / access rules.** Not relevant.
- **Can I leave with my data?** Yes. Apache-2.0 files already in your repository. Deleting the
  parts you do not want is the whole exit process.
- **Pricing page.** None — free and Apache-2.0. Source: https://github.com/build-once

### 6. An email service (Resend) — sending invitations — **NOT SET UP YET**

- **Status.** Agreed, not built. It arrives in a later step, when plan feature 3 ("invite people to
  a team by email") is actually built. Nothing is installed and no account exists. Until then,
  there is no working invitation email.
- **Job in your app.** Sending the one email your first version needs: "you have been invited to
  this team". Nothing else — reminder emails stay on the plan's not-yet list. Its API key lives in
  Supabase's Edge Functions secrets, and the Edge Function is what calls it.
- **How long widely used.** Launched 2023 — about three years, and the youngest thing here. It is
  widely used among teams building exactly this kind of app and is well documented, but it is
  newer than everything else on this list, so treat it as the least settled choice. The job it does
  is easy to move, which is what makes that acceptable.
- **Managed sign-in / access rules.** Not relevant. It sends mail; it holds no user data beyond
  the addresses and logs of what was sent.
- **Can I leave with my data?** Mostly. There is nothing of yours to rescue except sent-mail logs,
  and swapping one email sender for another is a small change in one place in your code. The free
  plan keeps 30 days of history, so do not treat it as a record you can go back to.
- **Pricing page.** https://resend.com/pricing — free plan is 3,000 emails a month, capped at 100
  a day, with 3 custom domains. Six volunteers sending team invitations will not come close, so
  this stays at **$0** and does not move the budget. First paid tier is $20 a month.
- **Supabase's built-in email is for testing only.** Decided. It is rate-limited and Supabase
  documents it as unsuitable for production. Use it on staging while trying things out; never for
  real invitations.

## Limits I checked myself (2026-09-27)

The owner opened all four pricing pages on this date. These four notes are the owner's own words,
kept as written. Where I have added anything, it is marked as mine.

- **Supabase:** Free allows 2 active projects and pauses them after 1 week of inactivity. Pro
  includes $10 of compute credit; the smallest compute size is about $10 a month per project.
- **Vercel:** Hobby $0, Pro $20 a month. Hobby is for non-commercial use (in Vercel's fair-use
  terms, not on the pricing page).
- **GitHub:** on the Free plan, repository rules (protected branches) and environment protection
  rules work only on public repositories. `team-tasks` is private, so protecting `main` needs
  either a public repo or a paid plan. **Decision needed before we protect `main`.**
- **Resend:** Free is 3,000 emails a month, 100 a day, 3 domains.

Two things that follow from the GitHub note, added by me:

1. **It is an organisation repo, so the paid route is GitHub Team, not GitHub Pro.** The remote is
   `https://github.com/build-once/team-tasks.git`, which is an organisation rather than a personal
   account. `docs/protect-main.md` draws the same distinction: Pro for personal accounts, Team for
   organisations. Team is charged per user per month — small, but not $0, and the plan's ceiling is
   about $30. Check the per-user price before choosing this route.
2. **Until this is decided, main protection is unverified.** `docs/protect-main.md` tells you to
   write down exactly that: *"main protection: unverified — plan does not support it"*. The local
   guards in `.claude/hooks/` still stop me pushing to `main`, but they run on this machine only —
   they do not stop a person pushing from anywhere else, and they are not a branch rule.

## Still open

### D. GitHub — protecting `main` on a private repo

Not decided. The three options, from `docs/protect-main.md`: make the repo public (it holds no
secrets — nothing in a repo should), pay for GitHub Team, or accept unprotected `main` and write it
down as unverified. This one is worth settling before the first pull request, because rule 2 of
`AGENTS.md` and the whole safe-change flow assume `main` cannot be pushed to directly.

## The three flags, decided

Dated 2026-09-27. These were open questions in the first version of this file; they are now
decisions.

### A. Email — settled: use an email service, later

`docs/plan.md` promises email invitations, and none of pieces 1 to 5 can send email. **Decision:**
add an email service — Resend — as piece 6 above, set up in a later step when invitations are
built. Supabase's built-in email is for testing only. This does not widen the plan: it is the tool
behind a feature the plan already lists, and reminder emails stay out.

### B. Supabase — settled: production paid, staging free

Two projects in one Pro organisation costs **$35 a month**, not $25 — Supabase's own worked
example is $25 for the plan plus $10 compute per project, minus the $10 credit. That is over the
plan's ceiling.

**Decision:** production goes in a **Pro organisation** ($25 a month). Staging goes in a
**separate free organisation** ($0), which the free plan allows. This keeps the two environments
that `docs/environments.md` requires and stays inside the budget. The cost: free projects pause
after a week of inactivity, so staging may need waking up before you test on it. `docs/plan.md`
has been updated to match.

Verify the compute pricing before you pay. I read it on 2026-09-27, and Supabase changes it from
time to time.

### C. Vercel — settled: Hobby now, Pro if this ever goes commercial

Hobby is $0 but is, in Vercel's words, "for personal, non-commercial use".

**Decision:** Hobby is fine, because this is a volunteer-group app — the person in the plan. But a
**commercial launch needs Vercel Pro at $20 a month per team.** That would put the running total
at roughly $45 with Supabase Pro and a domain, which is **over the plan's $30 ceiling**. So if the
app ever starts serving a business, the budget line in the plan has to be reopened before the
switch, not after. Treat that as the trigger, not the bill.

## Things I could not verify

- **UNSURE — exact Vercel founding date.** "2016, originally Zeit Now" is right to within about a
  year. It does not change any decision.
- **UNSURE — the price of GitHub Team.** I have not read GitHub's pricing page myself, and it is
  the one of the five I did not check. It is charged per user per month and is a few dollars, but
  do not budget on my figure — read it yourself, as you did for the other four.
- **UNSURE — Supabase's built-in email limits.** Now moot for production, since decision A rules
  it out there, but I have not tested where its rate limit actually bites on staging either. Expect
  to hit it while testing invitations and not be told why.
- **Unverified — Resend has not been tried.** No account, no domain verified, no email sent. The
  free-tier numbers above are from the pricing page, not from use. Domain verification (the DNS
  records that stop your mail going to spam) is the part that usually takes the time, and none of
  it has been done.
- **Unverified — none of this has been run.** No package is installed, no project created, no
  price paid. Every claim above comes from reading documentation and pricing pages, not from a
  working app.
