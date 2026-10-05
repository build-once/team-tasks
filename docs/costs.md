# Costs and spending controls

> **Right now every account is on a free plan with no payment method, so nothing can bill
> us. Before adding a card to any account, set its cap or alerts using this table.**

What each service charges for, and whether it can be made to *stop* rather than just
warn you. Written 2026-09-27 by reading each vendor's own billing documentation on that
date. Billing terms change — re-read the links before trusting this page.

**One exception, added 2026-10-05: the Sentry row was written without reading Sentry's pages**, because
the session that added it had no web access. Every figure in it says **NOT CONFIRMED** and names what
to read, rather than carrying a number from memory. Nothing is installed and nothing is sending, so
nothing can be billed in the meantime.

Related: the **Budget** section of `docs/plan.md` (£0/month while building, ceiling about
£30/month including a domain name).

## The table

| Service | Charges by usage? | Hard spending cap? | Alert only? | Official billing docs |
|---|---|---|---|---|
| **Supabase** — database, sign-in, storage, server functions | Yes, above plan quotas. Free plan cannot generate overage charges at all | **Yes — "Spend Cap", Pro plan only.** Usage of an item is *disallowed* past quota until next cycle; you are not charged | Spend Cap gives no per-item budgets and no notifications. Whether separate usage-alert emails exist — **UNSURE** | [Cost control & Spend Cap](https://supabase.com/docs/guides/platform/cost-control) · [Billing on Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase) |
| **Vercel** — hosting | **Hobby (free): no.** Exceeding an included limit pauses the feature — generally for 30 days — instead of billing. **Pro: yes**, metered usage beyond the monthly credit | **Hobby: none exists — and none is needed, because Hobby cannot bill.** **Pro: partly** — a spend amount does **not** stop usage on its own; "Pause Production Deployments" must be switched on, and pausing is **not instantaneous** (checks run every few minutes, so spend can overshoot) | Hobby: N/A. Pro: email/web at 50%, 75%, 100%; SMS at 100%; optional webhook | [Spend Management](https://vercel.com/docs/spend-management) · [Hobby plan](https://vercel.com/docs/plans/hobby) |
| **GitHub** — code and CI | Yes, for metered products: Actions, Packages, Git LFS, Codespaces, Copilot credits. **GitHub Free includes 2,000 Actions minutes/month for private repos; public repos are free on standard runners.** **With no payment method on file, usage is blocked once the quota is used up rather than billed** | **Yes, but off by default.** A budget only blocks usage if you tick "Stop usage when budget limit is reached" | **This is the default.** Without that tick you get email at 75%, 90%, 100% and usage continues | [Budgets and alerts](https://docs.github.com/en/billing/concepts/budgets-and-alerts) · [Set up budgets](https://docs.github.com/en/billing/tutorials/set-up-budgets) · [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| **Resend** — email (not set up yet) | Yes. Free: 3,000 emails/month and 100/day. Paid plans add pay-as-you-go overage (~$0.90 per 1,000 on Pro) | **A vendor-set cap, not one you choose.** Overage is capped at **5× your plan's monthly quota** by default, then sending pauses until the next cycle. Lowering that figure requires contacting support | Yes — quota alerts by email as you approach and exceed the quota | [Pricing](https://resend.com/pricing) · [Account quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits) |
| **Sentry** — error reports (chosen 2026-10-05, not installed) | **NOT CONFIRMED.** Whether the free plan is metered at all, what allowance of error reports it carries, and whether going past that allowance drops the extra reports or starts charging — none of it has been read. It must come from Sentry's own pricing page; no figure is written here from memory | **NOT CONFIRMED** — whether the free plan can bill at all, and whether Sentry offers a spend cap or a "stop at quota" switch, has not been read | **NOT CONFIRMED** — whether quota-warning emails exist, and at what percentages | **NOT READ — Sentry's own pricing page, and its documentation on event quotas and data retention.** No link is given: a URL written from memory is a guess (rule 15). Find them from the vendor's site, paste the exact pages here, and fill this row in |
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

### Domain registrar

Nothing can be said until one is chosen. When choosing, the only cost questions that matter
for this plan are the **renewal** price (not the first-year price, which is often
discounted) and whether WHOIS privacy costs extra. Both are fixed annual fees, so a
spending cap does not really apply. The plan's £30/month ceiling includes the domain.

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
- **UNSURE — the registrar row in full; no registrar chosen.**

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
6. **Registrar** → record the renewal price, not the introductory price.

Do that before real users arrive, alongside `docs/launch-check.md`.
