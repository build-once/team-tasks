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
  Build it 22** (`docs/plan.md`) and why until then the 5-dollar limit is the only thing in the way.
- **Whether a payment method is on the Anthropic account has not been checked**, and a spend limit
  implies one. Check it in the Console before trusting the banner at the top of this page for this
  service.

### Domain registrar

Nothing can be said until one is chosen. When choosing, the only cost questions that matter
for this plan are the **renewal** price (not the first-year price, which is often
discounted) and whether WHOIS privacy costs extra. Both are fixed annual fees, so a
spending cap does not really apply. The plan's £30/month ceiling includes the domain.

## Daily limits per person, and the worst case they allow

Added 2026-10-08 for Build it 22 (`docs/plan.md` → "Daily limits on what costs money"). **Nothing is
built**: there is no table, no config file and no check in either function, so every figure below is
arithmetic on a design, not a measurement of anything that has run.

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

**What would make the two agree**, if the owner wants the daily limit to be the binding one at six
people: the limit would have to be **5 ÷ (6 × 31 × $0.0025) ≈ 10.7**, so **10 a day**. Written down
rather than acted on — the plan says 20, and changing it is the owner's call.

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

### One email path these limits do not cover

**The sign-up confirmation and the password-reset email are sent by Supabase, not by `invite-member`**,
and **nothing in Build it 22 counts them.** They cannot be counted the way the other two are: both are
sent to somebody who is **not signed in** — there is no person's ID to key a count by, and the
password-reset path deliberately answers identically whether or not the address has an account
(`docs/plan.md`, and `scripts/password-reset-check.mjs` enforces it), so counting per address would
rebuild exactly the distinction that screen refuses to make.

What holds them is **Supabase's own rate limits on its built-in email**, and **what those are has not
been read** — no figure is written here. `docs/stack.md` records the decision that the built-in sender is
for testing only and is "rate-limited and Supabase documents it as unsuitable for production", which is
the nearest thing to a number this project has. The cost today is **£0**: it is Supabase's own sending
on the free plan, not Resend's quota.

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
- **Unverified — the whole "Daily limits per person" section is arithmetic on a design.** Added
  2026-10-08. No table, no config file, no check in either function, and nothing has ever been counted.
  The two limits are `docs/plan.md`'s; everything else in that section is multiplication, done in the
  session that wrote it.
- **Still not confirmed — the input token count the Anthropic worst case rests on.** 1,000 is the same
  assumption carried since 2026-10-07, and the fixed instructions that would let somebody count it now
  exist in `supabase/functions/suggest-subtasks/index.ts`. The 300-token output figure is **not** an
  assumption: it is `MAX_OUTPUT_TOKENS` in that file, read in this session.
- **Not read — Supabase's rate limits on the sign-up and password-reset emails it sends.** They are the
  one email path no daily limit here covers, and no figure for them is written on this page.

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
   organisation once it is on Pro.
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
7. **Registrar** → record the renewal price, not the introductory price.

Do that before real users arrive, alongside `docs/launch-check.md`.
