# Costs and spending controls

> **Right now every account is on a free plan with no payment method, so nothing can bill
> us. Before adding a card to any account, set its cap or alerts using this table.**
>
> **No longer true of every service, as of 2026-10-07.** That sentence was written of the four
> services below it on 2026-09-27. **Anthropic's Claude API has no free plan** — it is metered per
> token — and the owner reports a **5-dollar monthly spend limit** on the Team Tasks workspace, which
> is a setting that only means anything on an account that can be billed. Whether a payment method is
> on that account has not been checked by anybody writing this. Nothing is installed and no call has
> ever been made, so nothing has been spent yet.
>
> **And no longer true of Supabase either, as of 2026-10-10.** The owner moved the production project
> into an organisation on the **Pro** plan that day (`evidence/production-log.md`), which is what
> `docs/plan.md`'s Budget always said would happen before real users arrive — so production **can now
> bill**, the Spend Cap exists for it, and **nobody has set or seen it**. Two sections of this page were
> written against the Free plan's quotas and have not been reworked:
> [#250](https://github.com/build-once/team-tasks/issues/250) holds that, and nothing on this page is
> changed for it here beyond this paragraph and the egress note in the backups section below, because the
> figures it needs are read off a dashboard only the owner can open.

What each service charges for, and whether it can be made to *stop* rather than just
warn you. Written 2026-09-27 by reading each vendor's own billing documentation on that
date. Billing terms change — re-read the links before trusting this page.

**One exception, added 2026-10-05: the Sentry row was written without reading Sentry's pages**, because
the session that added it had no web access. Every figure in it says **NOT CONFIRMED** and names what
to read, rather than carrying a number from memory. Nothing is installed and nothing is sending, so
nothing can be billed in the meantime.

**The Anthropic row, added 2026-10-07, is not that exception:** its prices and its spend-limit
behaviour were read from Anthropic's own pages on that date and are cited in the row. What is *not*
confirmed there is confirmed-as-unknown on purpose, and says so.

Related: the **Budget** section of `docs/plan.md` (ceiling about £30/month including a domain name; it
said £0/month while building until 2026-10-07, when the Claude API — which has no free plan — brought a
5-dollar monthly ceiling of its own).

## The table

| Service | Charges by usage? | Hard spending cap? | Alert only? | Official billing docs |
|---|---|---|---|---|
| **Supabase** — database, sign-in, storage, server functions | Yes, above plan quotas. Free plan cannot generate overage charges at all | **Yes — "Spend Cap", Pro plan only.** Usage of an item is *disallowed* past quota until next cycle; you are not charged | Spend Cap gives no per-item budgets and no notifications. Whether separate usage-alert emails exist — **UNSURE** | [Cost control & Spend Cap](https://supabase.com/docs/guides/platform/cost-control) · [Billing on Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase) |
| **Vercel** — hosting | **Hobby (free): no.** Exceeding an included limit pauses the feature — generally for 30 days — instead of billing. **Pro: yes**, metered usage beyond the monthly credit | **Hobby: none exists — and none is needed, because Hobby cannot bill.** **Pro: partly** — a spend amount does **not** stop usage on its own; "Pause Production Deployments" must be switched on, and pausing is **not instantaneous** (checks run every few minutes, so spend can overshoot) | Hobby: N/A. Pro: email/web at 50%, 75%, 100%; SMS at 100%; optional webhook | [Spend Management](https://vercel.com/docs/spend-management) · [Hobby plan](https://vercel.com/docs/plans/hobby) |
| **GitHub** — code and CI | Yes, for metered products: Actions, Packages, Git LFS, Codespaces, Copilot credits. **GitHub Free includes 2,000 Actions minutes/month for private repos; public repos are free on standard runners.** **With no payment method on file, usage is blocked once the quota is used up rather than billed** | **Yes, but off by default.** A budget only blocks usage if you tick "Stop usage when budget limit is reached" | **This is the default.** Without that tick you get email at 75%, 90%, 100% and usage continues | [Budgets and alerts](https://docs.github.com/en/billing/concepts/budgets-and-alerts) · [Set up budgets](https://docs.github.com/en/billing/tutorials/set-up-budgets) · [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| **Resend** — email (not set up yet) | Yes. Free: 3,000 emails/month and 100/day. Paid plans add pay-as-you-go overage (~$0.90 per 1,000 on Pro) | **A vendor-set cap, not one you choose.** Overage is capped at **5× your plan's monthly quota** by default, then sending pauses until the next cycle. Lowering that figure requires contacting support | Yes — quota alerts by email as you approach and exceed the quota | [Pricing](https://resend.com/pricing) · [Account quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits) |
| **Sentry** — error reports (chosen 2026-10-05, not installed) | **NOT CONFIRMED.** Whether the free plan is metered at all, what allowance of error reports it carries, and whether going past that allowance drops the extra reports or starts charging — none of it has been read. It must come from Sentry's own pricing page; no figure is written here from memory | **NOT CONFIRMED** — whether the free plan can bill at all, and whether Sentry offers a spend cap or a "stop at quota" switch, has not been read | **NOT CONFIRMED** — whether quota-warning emails exist, and at what percentages | **NOT READ — Sentry's own pricing page, and its documentation on event quotas and data retention.** No link is given: a URL written from memory is a guess (rule 15). Find them from the vendor's site, paste the exact pages here, and fill this row in |
| **Anthropic Claude API** — the AI helper (chosen 2026-10-07, not installed) | **Yes, per token, and there is no free plan.** Claude Haiku 4.5 is listed at **$1 / MTok input and $5 / MTok output** on [Pricing](https://platform.claude.com/docs/en/about-claude/pricing), read 2026-10-07 | **Yes, and it stops rather than warns — the strongest control of any service on this page.** A spend limit you set yourself is enforced: "When usage reaches a spend limit you set, requests return HTTP 400 with error type `invalid_request_error`." Limits can be set **per workspace**, which is what the Team Tasks workspace is for. The owner reports setting **5 USD a month**; that figure has not been seen in a dashboard here | **Not confirmed.** The pages read on 2026-10-07 describe what happens when a limit is *reached*, not any notification threshold. The owner reports notifications at **1** and **3** dollars; nothing read here confirms the feature exists or fires | [Pricing](https://platform.claude.com/docs/en/about-claude/pricing) · [Rate limits → Spend limits](https://platform.claude.com/docs/en/api/rate-limits#spend-limits) · [Setting your own spend limit](https://platform.claude.com/docs/en/api/rate-limits#setting-your-own-spend-limit) |
| **Cloudflare R2** — where the nightly copy is kept (chosen 2026-10-10, nothing built) | **Yes, above the free tier**, and the free tier is generous for this: **10 GB-month of storage, 1 million Class A and 10 million Class B operations a month**, with **data transfer out free** across all storage classes. Past it, Standard storage is **$0.015 / GB-month**, Class A **$4.50 / million** and Class B **$0.36 / million** ([R2 pricing](https://developers.cloudflare.com/r2/pricing/), read 2026-10-10) | **NOT CONFIRMED** — whether Cloudflare offers a spend cap or a stop-at-quota switch was **not read** on 2026-10-10, and no page is cited for it. Whether a payment method is on the account has **not been checked**. What *is* known is that the usage this design can generate is far below the free tier at this group's size — see the backups section below for the headcount at which that stops being true | **NOT CONFIRMED** — whether usage alerts exist, and at what thresholds | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) · [Object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/) |
| **Domain registrar** — not chosen | **UNSURE** — depends entirely on the registrar. Domains are normally a fixed annual fee, not metered | **UNSURE** — and a spending cap is usually not applicable to a fixed annual fee | **UNSURE** | **UNSURE — no registrar chosen, so there is no documentation to link.** Fill this row in once one is picked |

## Notes per service

### Supabase

- Spend Cap is the strongest control of any service here: it refuses the usage rather than
  billing you for it.
- It is **Pro plan only**. On the Free plan there is nothing to cap, because overage
  charges are not possible; instead a project can be paused.
- **Spend Cap does not cover everything.** The docs exclude predictable, user-initiated
  items — compute instances and custom domains — from the cap. Those still bill. Plan's
  intent is production on Pro at about $25/month, so compute is the line item to watch.
- The plan's split (production in a Pro organisation, staging in a separate free
  organisation) means the Spend Cap only ever applies to the production organisation.
- **Two of this row's allowances stop being theoretical in Build it 23**, added 2026-10-08: **storage
  size** and **egress**, which attachments are the first feature to spend. Neither can bill on the Free
  plan. "Attachments: the storage and egress allowance" below has both quotas, cited, and the arithmetic
  — including the part the limits do **not** keep inside the allowance.

### Vercel

- Read the caveat in the table carefully. This is the weakest "cap" of the three that have
  one: a spend amount alone is an alert. The stop is a separate switch, and it works by
  pausing production for **all projects on the team** — visitors then get a 503.
- Projects do **not** auto-resume when you raise the amount. Each must be resumed by hand.
- Set the amount **below** the most you are willing to spend, because of the few-minutes
  check interval.
- **Hobby has no Spend Management at all** — the Hobby-vs-Pro table lists it as `N/A` for
  Hobby and `Configurable` for Pro. It does not need one: Hobby is a free tier with no
  billing cycle, and "if you exceed your usage limits on the Hobby plan, you will have to
  wait until 30 days have passed before you can use the feature again." Web Analytics
  pauses for 7 days rather than 30. So on Hobby the failure mode is **downtime, not a
  bill** — which is the right way round while building. (Matches Lesson A15.)
- **The dangerous moment is the upgrade.** Spend Management appears only once you are on
  Pro, and upgrading is exactly when a card goes on file. Set the On-Demand Budget and the
  Pause switch in the same sitting as entering card details, not afterwards.
- One thing to note before production: the [fair use
  guidelines](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage) restrict
  Hobby to non-commercial, personal use. A volunteer group app is probably fine, but this
  is a reason production ends up on Pro regardless of usage.

### GitHub

- The important detail is the default: **alert only**. A budget you set without ticking the
  stop box will not stop anything.
- The stop applies to metered products (Actions, Copilot credits, cloud sandboxes). For
  licence-based products it alerts only, except GitHub Advanced Security SKUs.
- **UNSURE what the default budget amount is** — the docs do not state one, and say you
  must set a budget manually.
- **GitHub Free includes 2,000 Actions minutes per month for private repositories.** Public
  repositories are free on standard GitHub-hosted runners. So CI on this repo draws on that
  allowance while it is private, and costs nothing at all if it is public.
- **With no payment method on file, "usage is blocked once you use up your quota."** That is
  a hard stop you get for free, without configuring anything — and it is why the banner at
  the top of this page is true today. Adding a card removes that protection, which is the
  moment to set a budget with the stop box ticked.

### Resend

- Not set up yet, so none of this is observed — it is read from the pricing and quota docs.
- Two separate limits: a **daily** 100-email cap and a **monthly** 3,000 on the free plan.
  The daily one is the one that bites during testing.
- Overage exists only on paid plans, so the free plan cannot run up a bill.
- **UNSURE whether overages are opt-in.** A Resend changelog describes a "Transactional
  Overages" toggle in Settings, which would mean pay-as-you-go is off until you enable it.
  The quota documentation does not confirm this, so treat it as unverified and check the
  Settings page yourself when the account is created.
- **UNSURE what happens on the free plan when the quota is hit** — the docs describe
  overage behaviour for paid plans only and do not say whether free sending pauses or
  fails.

### Sentry

Added 2026-10-05, when the owner chose Sentry for error reports (`docs/plan.md` → "Error reports to an
outside service", `docs/architecture.md` → the monitoring box). **Every figure in it is unconfirmed,
and that is deliberate rather than sloppy.**

- **Nothing is installed, so nothing is being sent, so nothing can be billed today.** No package, no
  DSN in any environment, no code. An account and a Next.js project named `team-tasks` exist, on the
  free plan, by the owner's word.
- **Why nothing is confirmed.** The four rows above it — Supabase, Vercel, GitHub and Resend — were
  written on 2026-09-27 by reading each vendor's own billing documentation. No Sentry page was read
  when this row was added: the session that wrote it had no web access, and the rules of this
  repository forbid writing a number from memory and calling it a fact. So the row names what has to be
  read instead of guessing at it.
- **What to look for, and in this order:** the free plan's allowance of error reports and what happens
  when it is used up, on Sentry's pricing page; whether extra reports past that allowance are dropped or
  billed, and whether any switch stops rather than warns, in its documentation on event quotas; and how
  long a report is kept, in its retention documentation — which `docs/plan.md` needs as well. If a page
  for one of these cannot be found, write that down rather than estimating.
- **Whether a payment method is on the Sentry account was not checked.** The banner at the top of this
  page says no account has one; that was written of the four services above and has not been re-checked
  for Sentry. Check it in the dashboard before trusting the banner for this service.
- **The spending risk here is shaped differently from the others.** Error reports are generated by the
  app failing, not by people using it, so a single looping bug on a busy page is the thing that would
  burn a monthly allowance in an afternoon — not growth. That is an argument for finding out what the
  allowance is *before* the first report is ever sent.

### Anthropic Claude API

Added 2026-10-07, when the owner chose Anthropic's Claude API for the "Suggest subtasks" helper
(`docs/plan.md` → "Suggest subtasks — an outside AI service", `docs/architecture.md` → arrow (12)).
Unlike the Sentry row, the figures here were read from the vendor's own pages on that date.

- **Nothing is installed, so nothing has been sent, so nothing has been spent.** No package, no
  `AI_API_KEY` in any environment, no function, no call.
- **The ceiling is the 5-dollar monthly spend limit**, and it is a real stop rather than an alert. On
  the limit you set yourself: "When usage reaches a spend limit you set, requests return HTTP 400 with
  error type `invalid_request_error`. The message begins `You have reached your specified API usage
  limits`, or `You have reached your specified workspace API usage limits` for a workspace limit, and
  states when access resumes."
  ([Setting your own spend limit](https://platform.claude.com/docs/en/api/rate-limits#setting-your-own-spend-limit),
  read 2026-10-07.) So the failure mode past 5 dollars is **the helper stops working, not a bill** —
  which is the right way round while building, and the same shape as Vercel Hobby.
- **There is a tier cap above it as well**, which the 5-dollar limit sits far below: "Each of the
  Start, Build, and Scale tiers carries a monthly spend cap", listed as $500 for Start, and reaching it
  pauses usage "until 00:00 UTC on the first day of the next month"
  ([Spend limits](https://platform.claude.com/docs/en/api/rate-limits#spend-limits), read 2026-10-07).
  Which tier this account is on has **not been checked**; it does not matter while the owner's own
  5-dollar limit is the lower of the two.
- **The published per-token price, and what it does not tell you.** Claude Haiku 4.5 is **$1 / MTok
  input and $5 / MTok output** ([Pricing](https://platform.claude.com/docs/en/about-claude/pricing),
  read 2026-10-07). **The per-call cost is not confirmed**, and cannot be until the code exists: the
  prompt has not been written, so there is no token count to multiply. What can be done honestly is
  arithmetic on an assumption, labelled as one. **Assume** 1,000 input tokens (one short title plus the
  fixed instructions) and 200 output tokens (five short suggestions) — neither figure measured,
  both invented here to give the price a shape:

  | Line | Calculation | Cost |
  |---|---|---|
  | Input | 1,000 × $1 ÷ 1,000,000 | $0.001 |
  | Output | 200 × $5 ÷ 1,000,000 | $0.001 |
  | **One call** | | **$0.002** |
  | **Calls before the 5-dollar limit** | 5 ÷ 0.002 | **2,500** |

  That arithmetic was run on 2026-10-07; the token counts it rests on were not. Replace them with the
  `usage` figures from a real response once the function exists, and this becomes a measurement instead
  of an illustration.
- **The spending risk here is shaped differently again.** Sentry's risk is a looping bug; this one is a
  person pressing a button, or a loop in our own code pressing it for them. 2,500 calls is a lot for six
  volunteers and nothing at all for a retry loop, which is why **usage counts and daily limits are
  Build it 22** (`docs/plan.md`). **Those now exist in this repository** (issue
  [#221](https://github.com/build-once/team-tasks/issues/221)) and are **deployed nowhere**, so for
  anything actually running the 5-dollar limit is still the only thing in the way. The section "Daily
  limits per person" below says where each half stands.
- **Whether a payment method is on the Anthropic account has not been checked**, and a spend limit
  implies one. Check it in the Console before trusting the banner at the top of this page for this
  service.

### Cloudflare R2

Added 2026-10-10, when the owner chose R2 for the nightly copy (`docs/plan.md` → "A nightly copy of
production, held by another company"; `docs/backups.md` is the map of what it covers). Like the Anthropic
row and unlike Sentry's, the figures were read from the vendor's own page on that date.

- **Nothing is built, so nothing has been stored and nothing can be billed today.** No workflow, no copy,
  no object in the bucket. The bucket itself exists, by the owner's report of 10 October 2026.
- **The free tier is the ceiling that matters here, and this design sits well inside it** at the plan's
  six people. The backups section below has the arithmetic, including the **headcount at which it stops**
  — which turns out to be lower than the headcount Supabase's own storage allowance runs out at, and is
  therefore the number to remember.
- **Egress out of R2 is free**, which is the one place this choice makes something cheaper rather than
  dearer: downloading a copy for a restore drill costs nothing at Cloudflare. **What is not free is the
  Supabase egress the job spends reading the files every night**, and that is the finding in the backups
  section.
- **The failure mode past the free tier is a charge, not a stop** — unlike Vercel Hobby's 30-day wait,
  GitHub's block with no card on file, Resend's no-overage-on-free and Supabase Free's grace period.
  **Reading the "Hard spending cap?" column of the table above in this session, R2 is the only free tier on
  this page whose overrun is a bill**, and the bill is **pennies at any size this app will be**: $0.015 a
  GB-month means every gigabyte over the free ten costs about a penny and a half. (Anthropic also bills,
  and it has no free tier at all, so it is a different shape of thing.)
- **Whether a spend cap or an alert exists was not read**, which is the gap in its row above, and it is
  smaller than it looks for exactly the reason in the bullet before this one. Still worth filling in before
  a payment method goes on the account.

### Domain registrar

Nothing can be said until one is chosen. When choosing, the only cost questions that matter
for this plan are the **renewal** price (not the first-year price, which is often
discounted) and whether WHOIS privacy costs extra. Both are fixed annual fees, so a
spending cap does not really apply. The plan's £30/month ceiling includes the domain.

## Daily limits per person, and the worst case they allow

Added 2026-10-08 for Build it 22 (`docs/plan.md` → "Daily limits on what costs money"). **Rewritten the
same day**, when the counting arrived (issue
[#221](https://github.com/build-once/team-tasks/issues/221)), because the sentence this replaces said
"there is no config file, and neither Edge Function counts" and that stopped being true.

**Where it stands now, in one line each:**

- **The migration is applied to staging**, by the owner on 8 October 2026 when PR #224 merged, and read
  back by the coach through the staging read-only connector. **Production has it too**, through
  `.github/workflows/migrate-production.yml` on that merge.
- **`supabase/functions/_shared/limits.ts` exists** and holds both numbers, 20 and 20, read by both
  Edge Functions. Neither spells a limit at a call site, and a Deno test holds them to it.
- **Both functions count** — `suggest-subtasks` immediately before the request to Anthropic,
  `invite-member` immediately before each send including a retry — and refuse with the plan's sentence
  once the day's count is reached.
- **And none of that is deployed to either project.** The assistant deploys nothing (rule 19); staging is
  the owner's step and production follows a merge. **So nothing is limited in any running app today**, and
  the figures below are still arithmetic on a design rather than a measurement of anything that has run.

That last line is the one that matters for this page: until the deploy, the vendor ceilings below are
still the only thing in the way, exactly as they were yesterday.

> **The owner read this section on 2026-10-08 and kept both limits at 20, and kept this arithmetic as
> written.** That is worth recording here rather than only in the plan, because the arithmetic says the
> limits do **not** keep either service inside its ceiling at six people — and the decision was taken with
> that in front of them, for the reason set out under the Anthropic table below: the vendor cap stops the
> *bill*, and the daily limit stops *one person or one loop* taking the month in an afternoon. Nothing on
> this page is softened to make the numbers look better.

**Two services are in scope, because they are the only two a person can spend by pressing a button.**
Supabase, Vercel, GitHub and Sentry are not: nothing a volunteer does meters them per action — Supabase
and Vercel are metered by hosting a working app, GitHub by CI runs that a volunteer cannot start, and
Sentry by the app *breaking*, which is why its own row calls a looping bug the risk rather than growth. A
per-person daily limit on any of them would have nothing to count.

| Service | Per-person daily limit | Spend cap in its dashboard | Worst case per month |
|---|---|---|---|
| **Anthropic Claude API** | **20** AI suggestions | **5 USD a month** on the Team Tasks workspace, owner-set and owner-reported — a real stop (HTTP 400), see the row above | **$9.30 at six people** — which is **above** the 5-dollar cap, so the cap binds first and the helper stops |
| **Resend** | **20** invitations | **No cap you choose.** The free plan's own quota is the ceiling: **100 emails a day and 3,000 a month**, taken from this page's own Resend row | **$0** — the free plan cannot generate overage charges. The worst case is not a bill but **120 emails a day against a 100-a-day quota**, so invitations stop going |

### Anthropic: the arithmetic, shown

Two inputs. One is read from the code and one is an assumption, and they are marked:

- **Output: 300 tokens**, the hard cap `MAX_OUTPUT_TOKENS` in
  `supabase/functions/suggest-subtasks/index.ts`, read in the session that wrote this. A reply cannot be
  longer, so this is a real worst case and not a guess.
- **Input: 1,000 tokens — AN ASSUMPTION, still not measured.** The same assumption the Anthropic row
  above has carried since 2026-10-07: one short title plus the fixed instructions. The instructions now
  exist and could be counted; they have not been. Replace it with the `usage` figures from a real
  response and this becomes a measurement.
- Prices as cited above: **$1 / MTok input, $5 / MTok output** for Claude Haiku 4.5.

| Line | Calculation | Result |
|---|---|---|
| Input, one call | 1,000 × $1 ÷ 1,000,000 | $0.0010 |
| Output, one call | 300 × $5 ÷ 1,000,000 | $0.0015 |
| **One call, worst case** | | **$0.0025** |
| One person, one day, at the limit | 20 × $0.0025 | $0.05 |
| One person, one month (31 days, the longest) | 20 × 31 × $0.0025 | **$1.55** |
| **Six people, one month** — the plan's group size | 6 × $1.55 | **$9.30** |

**So the daily limit does not on its own keep this inside the 5-dollar cap, and that is the finding.**
$9.30 is 1.86 times the cap. The number of people the limit alone keeps under 5 dollars is
**5 ÷ 1.55 = 3.2**, so three people at full tilt is $4.65 and four is $6.20. The plan's group is about
six.

That is not an argument for a lower limit, and it is worth saying why. **The two controls do different
jobs.** The 5-dollar cap stops the *bill*, properly, by refusing requests — so money cannot run away
whatever the daily limit is. What it cannot do is stop **one** person, or one retry loop, from using the
whole month's allowance in an afternoon and leaving the other five with a helper that has stopped
working. That is the job of the daily limit, and 20 a day is sized for a volunteer using the feature
rather than for the arithmetic above: twenty presses is a generous day's use, and a loop reaches it in
seconds and then stops.

**What would make the two agree**, if the daily limit were wanted as the binding one at six people: it
would have to be **5 ÷ (6 × 31 × $0.0025) ≈ 10.7**, so **10 a day**. **Not taken.** The owner kept 20 on
2026-10-08, for the reason in the paragraph above. The figure is kept here because it is the thing to
re-read if the group ever grows, or if a measured input token count moves the per-call cost.

### Resend: the arithmetic, shown

The limit is 20 invitations per person per day, and the quota it runs into is the free plan's, from this
page's own Resend row: **100 a day, 3,000 a month.**

| Line | Calculation | Result |
|---|---|---|
| Six people, one day, at the limit | 6 × 20 | **120 emails** |
| Against the free plan's daily quota | 120 vs 100 | **over by 20** |
| Six people, one month (31 days) | 120 × 31 | **3,720 emails** |
| Against the free plan's monthly quota | 3,720 vs 3,000 | **over by 720** |
| People the daily quota allows at 20 each | 100 ÷ 20 | **5 exactly** |
| People the monthly quota allows at 20 each | 3,000 ÷ 31 ÷ 20 | **4.8, so four** |
| **Cost of any of it** | free plan has no overage | **$0** |

**So here too the daily limit is not the binding ceiling at six people — Resend's free quota is.** The
difference from Anthropic is the failure mode: **nothing is billed**, because overage exists only on
paid plans, so what happens instead is that sending stops. **And what the free plan actually does at
quota is UNSURE** — this page has said so since 2026-09-27 and reading it is still the only way to know
whether sending pauses or fails, and whether a failed send would land in `invitations.failure_code` as
`refused` or as something else.

**Three reasons the 120 is a worst case nobody is near.** Twenty invitations a day each, by six people,
every day for a month, is 3,720 invitations to a group of about six. The plan's existing limits push the
same way: at most **20 pending** invitations per team, at most **3 teams** per person, and a **7-day**
expiry. And `docs/plan.md` already calls the realistic shape of this risk a loop rather than growth.

**And one thing that makes the 20 tighter than it looks: a retry counts.** The owner decided on
2026-10-08 that re-sending an invitation whose email failed consumes a slot, because it sends a second
email and the email is the metered thing. So a person whose sends are failing works through their twenty
faster, which is the right way round — a failing email service is exactly the situation in which a
person presses the button repeatedly, and that is what this limit exists to bound.

### One email path these limits do not cover, and when it gets read

**The sign-up confirmation and the password-reset email are sent by Supabase, not by `invite-member`**,
and **nothing in Build it 22 counts them — decided by the owner on 2026-10-08.** They cannot be counted
the way the other two are: both are sent to somebody who is **not signed in**, so there is no person's ID
to key a count by, and the password-reset path deliberately answers identically whether or not the
address has an account (`docs/plan.md`, and `scripts/password-reset-check.mjs` enforces it) — so counting
per address would rebuild exactly the distinction that screen refuses to make. A limit that undid a
privacy promise to save an email would be the wrong trade.

What holds them is **Supabase's own rate limits on its built-in email**, and **what those are has not
been read.** No figure is written here. **Reading them is Build it 25** — the owner's decision of
2026-10-08, and [#219](https://github.com/build-once/team-tasks/issues/219) holds it with what to read
and how we will know it is done.

The nearest thing to a number this project has today is `docs/stack.md`'s decision that the built-in
sender is for testing only and is "rate-limited and Supabase documents it as unsuitable for production".
The cost today is **£0**: it is Supabase's own sending on the free plan, not Resend's quota. **Which is
also why this is Build it 25 rather than urgent** — nothing here can produce a bill, so what is at risk
is a volunteer not getting a reset email, not money.

## Attachments: the storage and egress allowance, and what the limits mean against it

Added 2026-10-08 for Build it 23 (`docs/plan.md` → "Files attached to a task"). **Documents only: there
is no bucket, no rule and no code, and no file has ever been uploaded to any project.** Unlike the Sentry
row, the figures here were read from Supabase's own pages on that date and are cited.

**Attachments add no service and no new bill.** They use Supabase Storage in the two projects this app
already has, so there is nothing to sign up for and no fifth vendor row in the table above. What they do
is use **two of Supabase's metered allowances for the first time** — the amount stored, and the amount
served — and the Supabase row above already covers the only thing that matters about both: **the Free
plan cannot generate overage charges at all.**

### The two allowances, cited

| Allowance | Free plan | Pro plan | Price past it | Page, read 2026-10-08 |
|---|---|---|---|---|
| **Storage size** — how much is kept | **1 GB** included | 100 GB included | **$0.0213 per GB** per month | [Manage your usage → Storage size](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size) |
| **Egress** — how much is served out | **5 GB** a month | 250 GB a month | **$0.09 per GB** uncached, $0.03 cached | [Manage your usage → Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress) |

**Two things about those rows that decide how to read everything below.**

- **Egress is one shared figure, not a storage one.** The page's quota covers egress across the services,
  so opening an attachment spends from the same 5 GB that every page load and every database read spends
  from. There is no separate attachment budget to watch.
- **What the Free plan does at quota is not a bill and not nothing.** Both pages say the same thing: a
  project past quota on the Free plan gets "a notification to your billing email address and put under a
  grace period", pointing at the Fair Use Policy. **So the failure mode is the project's standing, not a
  charge** — which is a different shape from Vercel Hobby's "wait 30 days" and from Anthropic's HTTP 400,
  and it is the one of the three that is least precise about what happens next. **The Fair Use Policy was
  not read on 2026-10-08**, so what a grace period ends in is not written here.

**Storage also has a size limit of its own, which 5 MB sits well under:** "For Free projects, the limit
can't exceed 50 MB" globally, and a bucket's own limit "can't be higher than this global limit"
([Storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits), read 2026-10-08).

### The arithmetic, shown

Three inputs, and **all three are now decided** — which is a change from what this section said when it
was written earlier on 2026-10-08, where two of them were proposals in front of the owner.

- **5 MB per file.**
- **3 files per task** and **100 MB per person in total**, both **confirmed by the owner on 2026-10-08**,
  after this arithmetic and with it kept as written. The 100 MB is **enforced on the server at upload**,
  which is what makes it a ceiling rather than a hope — a total has to be summed across rows the person
  cannot be trusted to count, so it lives in server code the way every other counted limit in this app
  does.
- **Six people**, the plan's group size, and **31 days**, the longest month.
- **A GB read as 1,000 MB**, because neither Supabase page says which it means. That is the conservative
  reading: 1,024 would give more room, not less.

**Storage size — the proposal fits, with room:**

| Line | Calculation | Result |
|---|---|---|
| One task, full | 3 × 5 MB | **15 MB** |
| One person, at their total | — | **100 MB**, about 6 full tasks or 20 single 5 MB files |
| Six people, all at their total | 6 × 100 MB | **600 MB** |
| Against the Free plan's 1 GB | 600 vs 1,000 | **60% of it** |
| People the 1 GB allows at 100 MB each | 1,000 ÷ 100 | **10 exactly** |
| **Cost of any of it** | Free plan has no overage | **$0** |

**So storage is not where this bites, and the number to remember is ten.** At the plan's six people the
design uses 60% of the free allowance; at **ten** people it uses all of it. That is the first limit in
this project whose binding constraint is **the size of the group** rather than the behaviour of one
person, which is worth saying because every other ceiling on this page scales with use and this one
scales with headcount.

**And one thing about whose 100 MB it is, which the deletion decision of 2026-10-08 made worth writing
down.** The total is per **uploader** — so a file Bob attaches to Alice's team task counts against
**Bob's** 100 MB, not Alice's, even though it lives on her task and she is the one who may delete the
task. Two consequences, neither of them a problem and both of them surprising the first time:

- **Somebody else can free your allowance.** A file may be deleted by whoever uploaded it **or by
  whoever created its task** (`docs/plan.md`), so Alice deleting Bob's photo — or deleting the task it is
  on, which removes every file — gives Bob his space back without Bob doing anything.
- **Nobody else can spend it.** The reverse does not hold: no action of Alice's can push Bob closer to his
  100 MB, because only Bob's own uploads count against it. So the limit still bounds exactly one person's
  behaviour, which is what makes it a limit rather than a shared pool.

Both follow from keying the total to the uploader, which is also the only thing it *can* be keyed to —
`storage.objects.owner_id` is the one field that says who put the file there.

**Egress — this is where it bites, and the finding is the opposite way round:**

| Line | Calculation | Result |
|---|---|---|
| Opening one 5 MB file | — | **5 MB served** |
| Opens the Free plan's 5 GB a month allows | 5,000 ÷ 5 | **1,000 opens a month** |
| Shared across six people | 1,000 ÷ 6 | **167 each a month** |
| Per person per day | 167 ÷ 31 | **5.4 opens a day** |
| **Cost of going past it** | Free plan has no overage | **$0**, and a grace-period notification instead |

**So the attachment limits do not keep this inside the egress allowance either, and it is the same
finding as Build it 22's** — stated here rather than buried, for the same reason that section's
arithmetic was kept as written. **Five and a bit opens of a worst-case file per person per day is not a
generous allowance**, and it is *shared with everything else the app serves*: every page, every task
list, every sign-in. Three things soften it and none of them removes it:

- **5 MB is the worst case, not the normal one.** A photograph off a phone is commonly a fraction of
  that, and a PDF of a form usually far less. The table divides by the maximum.
- **A file is opened far less often than it is attached.** The realistic pattern is "look once, when
  it arrives".
- **Nothing is billed.** The Free plan has no overage, so what is at risk is the project's standing under
  the Fair Use Policy, not money.

**And one thing that makes it tighter than it looks, which is the five-minute link.** A signed link
expires after 5 minutes and **cannot be cached between people**, so two volunteers looking at the same
photo is two downloads, and somebody who comes back to it tomorrow is a third. **Whether Supabase's CDN
caches a private object's bytes at all — the difference between $0.09 and $0.03 a GB above — was not
established on 2026-10-08**, so the table uses the uncached figure, which is the right direction for an
unknown to fail in.

**No change to the £30 ceiling, and no new per-person daily limit.** Attachments spend a **stock**, not a
flow: a file sits there costing storage whether anybody presses anything, which is why the plan bounds
them with a total rather than with a count per day, and why they are **not** in the `usage_counts` table
or in either number in `supabase/functions/_shared/limits.ts`.

> **The owner read this section on 2026-10-08 and recorded the egress finding as written, with no egress
> limit built now.** That is a decision rather than a silence, and it is recorded here for the same reason
> the Build it 22 limits were: **the arithmetic above says the limits do not keep this inside the free
> egress allowance at six people**, and the decision was taken with that in front of them. Nothing on this
> page is softened to make the numbers look better.

**So the honest position, stated plainly: nothing limits egress.** There is no per-person cap on opening
files anywhere in this design, and the free plan's **5 GB a month is the only ceiling**. What makes that
acceptable rather than reckless is the shape of the failure, and it is worth being precise about it:
**the Free plan cannot bill**, so going past the allowance is a notification and a grace period under the
Fair Use Policy — which this page has **not read** — and not a charge. The thing at risk is the project's
standing, not money.

**What would change that**, and the three things to watch for, so this is a decision with a trigger rather
than one nobody revisits:

- **Moving production to Pro**, which the Budget section already plans. Egress past 250 GB then costs
  **$0.09 a GB**, and the failure mode stops being a notification.
- **The group growing.** The 5.4-opens-a-day figure divides by six. At ten people it is 3.2, and ten is
  also the headcount at which the 100 MB each fills the whole 1 GB — so both halves of this section run
  out at the same size of group, which is the one coincidence here worth remembering.
- **Anything that opens files on a person's behalf.** A screen that fetched every attachment to draw a
  thumbnail would spend the allowance without anybody pressing anything, and that is the shape of problem
  `docs/plan.md` calls a loop rather than growth.

If any of those arrives, this paragraph is the one to come back to, and the gap to design against is a
per-person cap on opening files — which does not exist today and is not being built.

## Backups: what the nightly copy and a restore drill cost

Added 2026-10-10 for Build it 24 part 0 (`docs/plan.md` → "A nightly copy of production, held by another
company"; `docs/backups.md` is the map of what is covered and what is not). **Documents only: there is no
workflow, no copy has ever been made, no object exists in the bucket, and no restore has ever been tried.**
Every figure below is read from a provider's page on that date and cited, or marked not confirmed.

**Three things could cost something here, and which of the three it is will surprise you.** Keeping the
copies is **free**. The restore drill costs **pennies**, because it creates a project. And **reading the
files out of Supabase every night is the expensive one** — on the Free plan it would have been impossible,
and it is affordable only because production moved to Pro **two days** after the attachments arithmetic was
written against the free quota.

### Supabase's paid plan, which production is now on

**Production moved into a Pro organisation on 10 October 2026** (`evidence/production-log.md`), which
`docs/plan.md`'s Budget has always planned for — "about $25 a month". Supabase's own page gives Pro as
**"from $25/month"** ([Pricing](https://supabase.com/pricing), read 2026-10-10), and the Supabase row above
already notes that **compute is excluded from the Spend Cap**, so that figure bills whatever the Cap says.
**Staging stays on the free plan in its own organisation**, so nothing below applies to it — and the free
plan's own line about backups is "Not included", which is the whole reason that page tells free projects
to export for themselves.

**What the move changes for this page beyond the backups**: the attachments egress arithmetic above was
worked against the Free plan's 5 GB, and the sentence "the Free plan cannot generate overage charges" is
no longer true of production. [#250](https://github.com/build-once/team-tasks/issues/250) holds that
rework, and the one part of it that belongs here is immediately below, because the nightly copy makes it
worse rather than better.

### Keeping the copies: free at this group's size, and the number to remember is SEVEN

Three inputs, all of them already decided or published:

- **100 MB per person**, the plan's per-person attachment total, confirmed by the owner on 2026-10-08.
- **Six people**, the plan's group size, and **31 days**, the longest month.
- **14 nightly copies**, which is **PROPOSED and not decided** — `docs/plan.md` says so, and the number
  below moves with it.
- **A GB read as 1,000 MB**, the same conservative convention the attachments section above uses, because
  neither page says which it means.

| Line | Calculation | Result |
|---|---|---|
| One copy, worst case — the files | 6 × 100 MB | **600 MB** |
| One copy — the database | — | **not measured, and small.** Production has no accounts, no tasks and no objects today, so a dump is schema and almost nothing else. Even full, seven tables of task text for six volunteers are dominated by the 600 MB above. **No figure is written here** |
| **14 copies kept** | 14 × 600 MB | **8,400 MB — 8.4 GB** |
| Against R2's free 10 GB-month | 8.4 vs 10 | **inside it, with 1.6 GB spare** |
| 7 copies instead of 14 | 7 × 600 MB | **4.2 GB — 42% of the free tier** |
| **People 14 copies allow inside the free tier** | 10,000 ÷ 14 ÷ 100 | **7.14, so SEVEN** |
| Eight people, 14 copies | 8 × 100 × 14 | 11,200 MB — **over by 1.2 GB**, costing 1.2 × $0.015 = **about 2 cents a month** |
| Ten people, 14 copies | 10 × 100 × 14 | 14,000 MB — over by 4 GB, **about 6 cents a month** |
| **Cost at the plan's six people** | inside the free tier | **$0** |

**So the number to remember is seven, and it is lower than the ten this page already had.** The
attachments section above found that the 100 MB each fills Supabase's whole 1 GB at **ten** people. Keeping
fourteen nightly copies of the same files fits **seven** and not eight. That is the first ceiling in this project
that the *backup* hits before the *thing being backed up* does — and it is worth stating because the
instinct is the other way round, that a backup is cheaper than the original. **It is not: it is fourteen
originals.**

**And going past it is a charge, not a stop**, which is the other reversal. Everywhere else on this page
the free-tier failure mode is something stopping. R2 bills. **At about two cents a month for the eighth
person it is not a risk to design against** — it is a fact to know before somebody is surprised by a
Cloudflare invoice for the first time.

### Reading the files every night: THIS is the expensive line, and it is Supabase's

**The job downloads every file in the bucket every night**, and that is **Supabase egress**, which the
attachments section above measures and which the nightly copy was not part of when that section was
written.

| Line | Calculation | Result |
|---|---|---|
| One night's read, worst case | 6 × 100 MB | **600 MB of Supabase egress** |
| One month | 600 MB × 31 | **18,600 MB — 18.6 GB** |
| Against the **Free** plan's 5 GB a month | 18.6 vs 5 | **3.7 times the entire allowance** |
| Against the **Pro** plan's 250 GB a month | 18.6 vs 250 | **7.4% of it** |
| Egress out of **R2**, for a restore | free across all storage classes | **$0** |

**Read that table in the order it happened.** On 8 October this would have been impossible: 18.6 GB
against a 5 GB free allowance, on top of an egress budget the same section already found too tight for
people merely *opening* files. **Production moving to Pro on 10 October is what makes it affordable**, and
it is pure luck of timing rather than planning — the transfer was about the $25 and the Spend Cap, and
nobody weighed it against a backup job that did not exist yet. At 7.4% of Pro's 250 GB it is comfortable.
**Staging could not carry this job at all**, which is one more reason it runs against production only.

**The obvious saving, named and not designed: copy only what is new or changed.** An incremental copy would
cut almost all of that read, because an attachment never changes once uploaded — the plan has no replace
and no update policy. What it costs is that **a single night's copy stops being a complete copy**, so a
restore needs the chain, and a broken link in the chain is a class of failure a full copy cannot have.
**Not proposed here**, and this paragraph is the one to come back to if the egress figure ever matters.

**And one thing that is not confirmed and would change the table above entirely**: whether Supabase meters
a read made with an **S3 access key** as egress at all. The Unverified list already carries the same gap
about uploads. If it is not metered, this whole section's cost is zero; if it is, the table stands. Nothing
read on 2026-10-10 says which.

### A restore drill: pennies, and the decision is which organisation it runs in

A restore needs somewhere to restore *to*, and `docs/plan.md` says that is **a new temporary project,
deleted the same day, never staging and never production**. What a project costs:

- **Compute is hourly.** "Compute is charged by the hour, meaning you are charged for the exact number of
  hours that a project is running", and "If a project runs for part of an hour, you are still charged for
  the full hour."
- **The smallest size is Micro, at `$0.01344` an hour (~$10 a month)**, and on a paid organisation there is
  no cheaper tier: "in paid organizations, Nano Compute are billed at the same price as Micro Compute."
- **The Pro plan's compute credit is already spent.** "Paid plans include $10 in Compute Credits, which
  cover one project running on the Micro/Nano Compute size" — one project, and production is it. "Each
  project you launch increases your monthly Compute costs."
  (All four quotes: [Manage your usage → Compute](https://supabase.com/docs/guides/platform/manage-your-usage/compute), read 2026-10-10.)

| Drill, in the Pro organisation | Calculation | Cost |
|---|---|---|
| A 4-hour drill | 4 × $0.01344 | **$0.054** |
| A whole day, project deleted that evening | 24 × $0.01344 | **$0.323** |

**So the money is not the question. Which organisation it runs in is**, and it is a decision for the owner
rather than this page's to take:

| Option | Cost | What is wrong with it |
|---|---|---|
| **A temporary project in the Pro organisation** — what this page would recommend | about **5 to 35 cents** per drill | Nothing, beyond remembering to delete it. The hourly billing means a forgotten project quietly becomes ~$10 a month, which is the only trap |
| **A temporary project in the free staging organisation** | **$0** — the Free plan's own limit is "Limit of 2 active projects" per organisation ([Pricing](https://supabase.com/pricing), read 2026-10-10), and staging is one of the two | **It puts production's real data in the organisation staging lives in**, and the coding assistant holds keys for that organisation's other project. `docs/environments.md`'s rule is "Production data is never copied to local or staging", and this is the letter of it kept while the spirit is not |
| **A local PostgreSQL sandbox**, the way migrations are already proved in this project | **$0** | It restores the **database** and cannot test the two halves that matter most: **signing in**, and **the files**. Useful as a first pass on the dump, not as the drill |

**One more cost, and it is the one nobody budgets: the owner's time.** The drill is the owner's from start
to finish — `docs/plan.md` says the coach and the coding assistant never receive a backup file — and its
whole purpose is to produce a wall-clock number for "how long are we down". That number has never been
measured ([#249](https://github.com/build-once/team-tasks/issues/249)).

### No change to the £30 ceiling

At the plan's six people the nightly copy adds **£0**: R2's free tier covers the storage, R2's egress is
free, and the Supabase egress it spends is 7.4% of a Pro allowance already being paid for. The restore
drill is pennies per run and is a deliberate spend rather than a surprise. `docs/plan.md`'s Budget says the
same thing in one paragraph.

## Unverified

These are gaps in this page, not findings. Resolved items are listed at the end so the same
question does not get re-asked from scratch.

- **Unverified — nothing here has been observed in a running account.** No Supabase
  organisation, Vercel team, Resend account or registrar account was inspected. Every row
  is read from public vendor documentation on 2026-09-27, which is how the vendor describes
  the behaviour, not what your account is actually set to.
- **UNSURE — whether Supabase sends usage alerts separately from Spend Cap.**
- **UNSURE — GitHub's default budget amount.** The docs say you must set a budget manually
  but do not state a default figure.
- **UNSURE — whether Resend overages are opt-in, and free-plan behaviour at quota.**
- **NOT CONFIRMED — the Sentry row in full.** Its free-plan error allowance, what happens past it,
  whether any cap or stop switch exists, whether quota alerts are sent, and how long a report is kept.
  No Sentry page was read on 2026-10-05, and no number was written from memory.
- **Not checked — whether the Sentry account has a payment method on file.** The banner at the top of
  this page was written of the four services covered on 2026-09-27.
- **Not confirmed — the per-call cost of the AI helper.** The per-token price is cited; the token counts
  in the worked example above are an assumption, because no prompt exists yet to count. Settle it with
  the `usage` figures from a real response.
- **Not confirmed — whether Anthropic sends a notification at a spend threshold at all.** The owner
  reports setting them at 1 and 3 dollars. The pages read on 2026-10-07 describe reaching a limit and
  say nothing about notifications, so neither the feature nor those two settings has been confirmed.
- **Not checked — the Anthropic account's usage tier, and whether it has a payment method on file.**
  Neither matters while the owner's own 5-dollar limit is the lower ceiling, and both are visible only
  in the Console.
- **Unverified — the Anthropic row describes an account nobody writing this has opened.** The workspace
  name, the 5-dollar limit and the two notification thresholds are the owner's report of 2026-10-07. The
  prices and the spend-limit behaviour are read from Anthropic's pages, which is how Anthropic describes
  the service, not what this account is set to.
- **UNSURE — the registrar row in full; no registrar chosen.**
- **Unverified — the "Daily limits per person" section is arithmetic on a design, and nothing in it has
  been measured.** Added 2026-10-08; the owner settled the limits, the retention and the counting rule
  the same day. **Rewritten later the same day** (issue
  [#221](https://github.com/build-once/team-tasks/issues/221)), because the sentence this replaces said
  "there is still no config file, no check in either function, and nothing has ever been counted outside
  that sandbox", and the first two clauses stopped being true. What is true now:

  - **The code is complete in this repository**: `supabase/functions/_shared/limits.ts` holds both
    numbers, both Edge Functions count immediately before the thing that spends money, and 37 Deno tests
    over the bodies they actually build say what each refusal is. Those tests were **seen to fail first**
    — `evidence/build-it-22-daily-limits-counting.md` has the red runs.
  - **The migration is applied to staging and to production.** The owner applied it to staging on 8
    October 2026 and the production workflow applied it on the same merge; the coach read both back.
  - **NOTHING IS DEPLOYED.** Neither Edge Function with the counting in it is on staging or on
    production: the assistant deploys nothing (rule 19). **So no number has ever been counted in a
    running app, and nothing is limited in one.**
  - **And no figure in that section is a measurement even after it is deployed.** The per-call cost rests
    on an assumed input token count (the entry below), and the worst case rests on the limit rather than
    on observed use. What a deploy would settle is whether the refusal happens, not what it costs.

  This entry stays until a staging run shows the limit refusing and the count read back off the table —
  which is issue #221's fifth condition, is the owner's step, and has not happened.
- **Still not confirmed — the input token count the Anthropic worst case rests on.** 1,000 is the same
  assumption carried since 2026-10-07, and the fixed instructions that would let somebody count it now
  exist in `supabase/functions/suggest-subtasks/index.ts`. The 300-token output figure is **not** an
  assumption: it is `MAX_OUTPUT_TOKENS` in that file, read in this session. So **$9.30 is an upper bound
  on a guess**, and the owner's decision to keep the limits at 20 was taken knowing that.
- **Not read, and now scheduled — Supabase's rate limits on the sign-up and password-reset emails it
  sends.** They are the one email path no daily limit here covers, by the owner's decision of
  2026-10-08, and no figure for them is written on this page. **Reading them is Build it 25**:
  [#219](https://github.com/build-once/team-tasks/issues/219).
- **Unverified — nothing in the attachments section exists, and none of it has been measured.** Added
  2026-10-08 for Build it 23 part 0. There is **no bucket, no storage rule, no code and no uploaded
  file**, so nothing has been stored or served and no allowance has been touched. **Rewritten later the
  same day**, when the owner settled the numbers: the sentence this replaces said two of the three inputs
  were "proposals the owner has not decided", and 3 files per task and 100 MB per person are now decided,
  with the 100 MB enforced on the server at upload. So this is arithmetic on a **design** rather than on a
  proposal — which is the same standing as the Build it 22 section above, and still not a measurement of
  anything that has run. The quotas and prices themselves are cited from Supabase's own pages, read
  on that date with no connector and no browser, which is how Supabase describes the plan rather than what
  this account is set to.
- **Decided and accepted — a 20-a-day-style limit is not what bounds attachments, and nothing bounds
  egress at all.** The owner recorded the egress arithmetic as written on 2026-10-08 and built no limit
  against it. This is now a known fact rather than a gap: the free plan's 5 GB a month is the only
  ceiling, the Free plan cannot bill, and the three things that would change that are listed in the
  section above.
- **Not read — the Supabase Fair Use Policy**, which is what both usage pages point at for what a Free
  project's "grace period" actually ends in. The section above quotes the notification and the grace
  period and stops there, because that is as far as the pages read go. This is the one gap on this page
  where the consequence is the project's standing rather than a bill, and it is therefore the one where
  "nothing is billed" is the least reassuring sentence.
- **Not established — whether Supabase's CDN caches a private object, and so whether attachment egress is
  billed at $0.09 or $0.03 a GB.** The section above uses the uncached figure throughout, which is the
  conservative direction. It makes no difference at £0 on the Free plan and would make a real one on Pro.
- **Not established — whether an upload is metered at all.** The egress quota covers what is served out;
  nothing read on 2026-10-08 says what, if anything, bringing a file in counts against. No figure for it
  is written anywhere.
- **Not confirmed — whether a GB in those two Supabase quotas is 1,000 MB or 1,024 MB.** Neither page
  says. The arithmetic uses 1,000, which understates the room rather than overstating it.
- **Unverified — the whole backups section is arithmetic on a design, and NOTHING IS BUILT.** Added
  2026-10-10 for Build it 24 part 0. There is **no workflow, no copy, no object in the bucket, no lifecycle
  rule and no restore drill**, so nothing has been stored, nothing has been read and no allowance has been
  touched. The **14-copy window is a proposal**, not a decision, and every figure in that section moves
  with it.
- **Not read — whether Cloudflare R2 offers a spend cap, a stop-at-quota switch, or usage alerts.** Its
  row above says so. The pricing page was read on 2026-10-10 and gives the free tier and the rates; no page
  about billing controls was read, and none is linked. It matters less than it would elsewhere, because the
  worst case this design generates is **cents** — but R2 **bills** past the free tier rather than stopping,
  which makes it the only service on this page where the free-tier failure mode is a charge.
- **Not checked — whether the Cloudflare account has a payment method on file.** As with Sentry and
  Anthropic, the banner at the top of this page was written of four other services.
- **Not confirmed — whether Supabase meters a Storage read made with an S3 access key as egress.** The
  nightly copy's 18.6 GB a month rests entirely on it being metered. **If it is not, that whole line costs
  zero**; if it is, the table stands. This is the same shape of gap as the upload entry below it and is the
  more expensive of the two.
- **Not measured — how big a database dump of production is.** The backups section deliberately writes no
  figure: production has no accounts, no tasks and no objects today, and nobody has run a dump. The files
  dominate the total at any size this app will be, which is why the arithmetic is built on them.
- **Not priced — Supabase's Point-in-Time Recovery add-on**, which is the thing that would close the
  one-day window the daily backups leave. `docs/backups.md` quotes Supabase describing it; no price for it
  was read on 2026-10-10 and none is written anywhere in this repository.
- **All five attachment gaps above are gathered in
  [#231](https://github.com/build-once/team-tasks/issues/231)**, with what to read or try for each and
  how somebody else can tell it is settled, alongside the ones that live in `docs/plan.md`.

Resolved on 2026-09-27, both confirmed against vendor documentation:

- ~~Whether Vercel Spend Management is available on Hobby.~~ It is not — `N/A` for Hobby in
  the plan comparison table; exceeding a limit pauses the feature for 30 days instead of
  billing.
- ~~Whether this repo can incur GitHub Actions charges.~~ GitHub Free includes 2,000
  minutes/month for private repos, public repos are free, and with no payment method on file
  usage is blocked rather than billed.

## How to check this properly

Documentation describes the default; only the dashboard shows your setting. For each
service, the authoritative place is the billing settings page of the real account:

1. **Supabase** → Organisation → Billing → confirm Spend Cap is **on** for the production
   organisation once it is on Pro. **And, from Build it 23, the two usage figures attachments spend**:
   Organisation → Usage → storage size against the 1 GB, and egress against the 5 GB a month. Those are
   the only place either is visible; this page has the published quotas and not this project's numbers.
2. **Vercel** → Team → Settings → Billing → Spend Management → confirm both the On-Demand
   Budget **and** the Pause Production Deployments switch.
3. **GitHub** → Settings → Billing → Budgets and alerts → confirm a budget exists **and**
   that "Stop usage when budget limit is reached" is ticked.
4. **Resend** → Settings → Billing → check whether Transactional Overages is on, and what
   the overage cap is set to.
5. **Sentry** → the organisation's Usage and Billing settings → read the free plan's error allowance
   and what it does when the allowance is used up, and confirm no payment method is on file. Read the
   pricing and retention pages at the same sitting, and paste both links into the table above.
6. **Anthropic** → Claude Console → Settings → Billing → confirm the **Team Tasks** workspace's spend
   limit is set to 5 USD, note which usage tier the organisation is on, and check whether a payment
   method is on file. While you are there, look for whether notifications at 1 and 3 dollars exist as a
   setting at all — nothing read on 2026-10-07 says they do.
7. **Cloudflare** → the R2 bucket's own usage page → read the stored size against the **10 GB-month** free
   tier and the operation counts against the **1 million / 10 million**, and check whether a payment method
   is on the account. While you are there, look for whether a spend cap or a usage alert exists as a
   setting at all — nothing read on 2026-10-10 says it does. **And confirm the lifecycle rule is actually
   there**, because it is what makes the retention window real rather than intended.
8. **Registrar** → record the renewal price, not the introductory price.

Do that before real users arrive, alongside `docs/launch-check.md`.
