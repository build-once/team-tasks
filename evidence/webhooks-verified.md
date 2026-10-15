# Evidence: webhooks-verified

Result: **PASS for delivery, idempotency and the entitlement write, all seen on staging.** One of the
book's three deliberate tests — a bad signature answering 400 — is **NOT YET RUN**; section 4 says
exactly what is missing and the one command that settles it.
Date: 2026-10-15
How checked: the owner's staging run of 15 October 2026 (sections 1 and 2), and the access-rule tests
that run against staging on every pull request (section 3). Nothing in this file was run by the
assistant: there is no staging connector here, and rule 10 forbids the production one.
Checked by: the owner, on staging. Written up by Claude Code from the owner's report and the test file.

---

## 1. A real event was delivered and accepted

Owner-reported, staging, after `974c716` was deployed:

```
event    evt_1UQWCYBJ487I3EKp5DwF2Q5i   (checkout.session.completed)
retry    18:42:36 UTC  ->  HTTP 200 "ok"
```

Stripe's own automatic retry is what delivered it, which is worth noting: the first delivery had
failed **502** against the previous build, and the design's answer to a failed delivery is that Stripe
sends it again. It did, and the second attempt worked without anybody replaying anything.

## 2. The same event twice changes nothing

The owner pressed **Resend** on that same event id: **HTTP 200**, and the plan panel was unchanged.

That is the idempotency design doing its job. `stripe_events` has the event id as its **primary key**,
and the function's claim is a single `insert` the database may refuse — not a check followed by a
write, which would have a gap two simultaneous retries fit through. A repeat lands on `23505` and the
function answers 200 so Stripe stops sending it.

## 3. The entitlement was written, and nobody but the webhook can write one

Alice's My teams page then read:

```
Your plan: Team — Each of your teams can have up to 25 members.
```

**And that is now asserted on every pull request** rather than observed once:
`web/tests/access-rules.test.mjs` gained four tests that run against staging in CI —

- Alice can read her own entitlement through `my_entitlement()`, and it is `team` with a status of
  `active` or `trialing`;
- **Bob cannot change Alice's entitlement**, and her row is read back afterwards to prove the refusal
  left it alone;
- **Bob cannot insert one for himself** — the likelier attack, and a separate test because a policy
  written `auth.uid() = user_id` would have permitted exactly this while still refusing the first;
- **nobody can read `stripe_events` at all**, not even their own.

`EXPECTED_APP_TESTS` moved 40 → 44 so the coverage cannot silently drop back.

## 4. NOT VERIFIED — the bad-signature test

**The book asks for a webhook with a bad signature to be answered 400, and nobody has run it.** The
code is there — `constructEventAsync` against the **raw** body, every failure answered 400 with
nothing read out of the body — and `supabase/functions/stripe-webhook/index.ts` carries the argument
for why that is the function's only door. But an argument is not an observation.

**The one command that settles it**, run by the owner against staging, needing no key and no account:

```
curl -i -X POST https://<staging-ref>.supabase.co/functions/v1/stripe-webhook -d '{}'
```

Expected: **HTTP 400**. A 200 would mean the webhook accepts unsigned bodies, which is the single
worst outcome this feature can have — anybody could then grant themselves a paid plan.

**The same check runs automatically on production after every deploy**, as the smoke-test exception in
`.github/workflows/migrate-production.yml`, which the owner authorised on 14 October: every other
function must answer 401, and this one must answer 400.

## 5. Also not verified

- **`stripe_events` has not been read directly.** The row's existence is inferred from the Resend
  answering 200 and changing nothing, which is the behaviour only a recorded event id produces. A
  read-only `select count(*) from stripe_events where event_id = '…'` would confirm it; there is no
  staging connector here to run it with.
- **A cancellation has never been delivered.** The out-of-order design is proved by the Deno tests
  over `entitlementFromSubscription` and by nothing on staging.
- **Nothing has run in live mode**, by the owner's decision of 14 October. This is a sandbox
  throughout.
