# Evidence: webhooks-verified

Result: **PASS.** Delivery, idempotency, the entitlement write, and the refusal of a body that cannot
prove it came from Stripe — missing header and forged header both — were all seen on staging, and
nobody but the webhook can write an entitlement, asserted on every pull request rather than observed
once.
Date: 2026-10-15
How checked: the owner's staging runs of 15 October 2026 (sections 1, 2 and 4), and the access-rule
tests that run against staging on every pull request (section 3). Nothing in this file was run by the
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

## 4. A body that cannot prove it came from Stripe is refused — OBSERVED, 15 October 2026

**The book's bad-signature test, run by the owner against staging at 07:58:33 GMT.** A POST with a
body of `{}` and **no `Stripe-Signature` header at all**:

```
HTTP/1.1 400 Bad Request
Bad signature
                        (served by supabase-edge-runtime)
sb-request-id: 01a13e91-e874-7ef7-ace7-0a917b24654a
```

**This is the sentence the whole feature rests on**, so it is worth being exact about what it proves
and what it does not.

**What it proves.** The function's own door works on a deployed build. `verify_jwt = false` means the
platform refuses nobody here — a request with no credentials of any kind reaches our code — and our
code answered 400 and read nothing out of the body. A **200** would have meant the webhook accepts
unsigned bodies, which is the worst outcome this feature can have: anybody who found the address
could post themselves a paid plan.

**Why the request id is kept and is not a secret.** It is a correlation id Supabase stamps on a
response so a log line can be found later. It grants nothing, identifies nobody, and is the one thing
that makes this observation checkable against the function's logs rather than taken on trust. No
header, cookie, key or body from the request is recorded here, and the request carried none.

### And a present-but-wrong signature, 08:03:48 GMT the same morning

The caveat this section carried — that only the *absent* header had been tried — is closed. The owner
posted a made-up `checkout.session.completed` body carrying a real-shaped header:

```
Stripe-Signature: t=1792051112,v1=<64 zeros>

HTTP/1.1 400 Bad Request
Bad signature
sb-request-id: 01a13e96-bb29-7b96-8056-c291f050987f
```

So a forged header is refused as firmly as a missing one, which is the thing worth knowing: somebody
who finds this address and knows the shape of Stripe's header gets no further than somebody who sends
nothing.

**WHICH OF THE TWO REASONS IT WAS CANNOT BE TOLD FROM THIS RUN, and that is worth writing down rather
than rounding off.** `t=1792051112` is **2026-10-15T07:58:32Z**, and the request was made at
**08:03:48** — **316 seconds later**, against Stripe's default tolerance of **300**. So the header was
~16 seconds too old to be accepted whatever its `v1` said, and the refusal may have been the
**timestamp** rather than the **HMAC**. Our code cannot distinguish them either: both land in the one
`catch` around `constructEventAsync`, which has no branch in it on purpose — telling a prober which of
their guesses was closest is not something this function does.

**What that leaves untested is narrow and named:** a wrong `v1` carried on a *fresh* timestamp. It is
the same code path by inspection, and no run has isolated it. The Deno tests do not cover it either,
deliberately — verifying a signature is Stripe's library's job, not ours.

**And the same check now runs on production after every deploy**, as the smoke-test exception in
`.github/workflows/migrate-production.yml` the owner authorised on 14 October: every other function
must answer 401, and this one must answer 400. So this is not a one-off observation but a standing
one — the next deploy that broke the door would turn that job red.

**CORRECTION, 15 October 2026: on production that check has never passed, and it cannot while
production holds no Stripe key.** The paragraph above is kept as written because it is what was
believed when the evidence was recorded, and this is what happened. The step ran twice — on the merge
of [#312](https://github.com/build-once/team-tasks/pull/312) (run 80) and of
[#314](https://github.com/build-once/team-tasks/pull/314) (run 81) — and **failed both times** with
`FAIL stripe-webhook: expected HTTP 400 for an unsigned POST, got 503`. The reason is the order of the
function's own gates: it checks its **key** before it checks the signature, and production has no key,
so it answers `503 stripe_not_configured` and the signature check is never reached. The owner
authorised the step to accept that 503 on 15 October, and `docs/environments.md` carries the
requirement to tighten it back to 400 only when a live key is installed.

**So what section 4's two runs prove is unchanged, and what this paragraph claimed is narrowed.** The
400 was observed **on staging**, twice, which is where the signature check has a key to get past. On
production, what is observed after every deploy is that the webhook **refuses an unsigned body before
doing anything with it** — by the key gate rather than by the signature check. The standing check
against a 2xx is intact in both projects: a webhook that accepted an unsigned body would still turn
that job red.

## 5. Also not verified

- **`stripe_events` has not been read directly.** The row's existence is inferred from the Resend
  answering 200 and changing nothing, which is the behaviour only a recorded event id produces. A
  read-only `select count(*) from stripe_events where event_id = '…'` would confirm it; there is no
  staging connector here to run it with.
- **A cancellation has never been delivered.** The out-of-order design is proved by the Deno tests
  over `entitlementFromSubscription` and by nothing on staging.
- **Nothing has run in live mode**, by the owner's decision of 14 October. This is a sandbox
  throughout.
