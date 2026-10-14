// Build it 27's tests, over the real exported pieces rather than copies of
// them.
//
// WHAT IS AND IS NOT TESTED HERE, said first so nothing is read as more than it
// is. These run no network, hold no key and talk to no database. What they
// establish is that the DECISIONS are right: which key is refused, what a
// subscription becomes, which events are acted on, and that an order problem
// produces the right row. What they cannot establish is that Stripe's library
// verifies a signature correctly -- that is Stripe's test suite -- or that any
// of this works deployed, which only a staging run can say.

import { assert, assertEquals } from "jsr:@std/assert@1.0.8";

import {
  checkStripeKey,
  requiredMode,
  stripeMode,
  STRIPE_SETTINGS,
  withCheckedKey,
} from "../_shared/stripe-keys.ts";
import {
  ACCESS_EVENTS,
  ENTITLING_STATUSES,
  entitlementFromSubscription,
  type SubscriptionFacts,
} from "../stripe-webhook/entitlement.ts";

// ---------------------------------------------------------------------------
// 1. The key check -- Lesson O9, and the two quiet mistakes it exists for
// ---------------------------------------------------------------------------

Deno.test("a live key outside production is refused", () => {
  const verdict = checkStripeKey({
    key: "rk_live_" + "x".repeat(40),
    environment: "staging",
  });

  assert(!verdict.ok);
  assertEquals(verdict.reason, "mismatch");
  // The message explains the CONSEQUENCE, not just the mismatch.
  assert(verdict.message.includes("real money"));
});

Deno.test("a test key IN production is refused", () => {
  const verdict = checkStripeKey({
    key: "rk_test_" + "x".repeat(40),
    environment: "production",
  });

  assert(!verdict.ok);
  assertEquals(verdict.reason, "mismatch");
  assert(verdict.message.includes("for free"));
});

Deno.test("the matching pairs are allowed", () => {
  assert(checkStripeKey({ key: "rk_test_abc", environment: "staging" }).ok);
  assert(checkStripeKey({ key: "rk_test_abc", environment: "" }).ok);
  assert(checkStripeKey({ key: "sk_live_abc", environment: "production" }).ok);
});

Deno.test("a missing key is its own reason, not a mismatch", () => {
  const verdict = checkStripeKey({ key: "   ", environment: "staging" });
  assert(!verdict.ok);
  assertEquals(verdict.reason, "missing");
});

Deno.test("a key whose mode cannot be read is refused, because an unknown is not a yes", () => {
  for (const key of ["abc123", "sk_abc", "rk_test_live_both", "pk_live_test_x"]) {
    const verdict = checkStripeKey({ key, environment: "staging" });
    assert(!verdict.ok, `expected ${key} to be refused`);
  }
});

Deno.test("stripeMode reads both words, and both at once is unknown", () => {
  assertEquals(stripeMode("sk_test_x"), "test");
  assertEquals(stripeMode("rk_live_x"), "live");
  assertEquals(stripeMode("pk_test_x"), "test");
  assertEquals(stripeMode("x_test_live_x"), "unknown");
  assertEquals(stripeMode(""), "unknown");
});

Deno.test("only the exact word production means production", () => {
  assertEquals(requiredMode("production"), "live");
  assertEquals(requiredMode("Production"), "test");
  assertEquals(requiredMode("prod"), "test");
  assertEquals(requiredMode(""), "test");
});

// THE NEGATIVE: with a wrong key, Stripe is never reached. This is why
// withCheckedKey is a wrapper rather than an `if` -- a test can ask an `if`
// what it decided, but not what did not run after it.
Deno.test("a mismatched key means the handler never runs", async () => {
  let ranHandler = false;
  const logged: string[] = [];

  const answer = await withCheckedKey(
    {
      key: "rk_live_secret",
      environment: "staging",
      log: (m) => logged.push(m),
    },
    async () => {
      ranHandler = true;
      return new Response("should never happen");
    },
  );

  assertEquals(ranHandler, false);
  assertEquals(answer.status, 503);
  assertEquals(logged.length, 1);
});

// AND THE OVER-CORRECTION IS GUARDED FROM THE OTHER SIDE: a wrapper that
// refused everybody would pass the test above too.
Deno.test("a matching key runs the handler exactly once and returns its answer", async () => {
  let calls = 0;

  const answer = await withCheckedKey(
    { key: "rk_test_ok", environment: "staging", log: () => {} },
    async () => {
      calls += 1;
      return new Response("handled", { status: 201 });
    },
  );

  assertEquals(calls, 1);
  assertEquals(answer.status, 201);
});

// RULE 18, AS A TEST: the key must never appear in what is logged.
Deno.test("the refusal never logs the key or any part of it", async () => {
  // COMPOSED RATHER THAN WRITTEN OUT, so this file does not itself contain a
  // string shaped like a live key. CI's stripe-live-keys job matches the prefix
  // followed by ten or more key characters, and a test fixture long enough to
  // be a convincing fake is also long enough to trip it.
  const key = "rk" + "_live_" + "SUPERSECRETVALUE1234567890";
  const logged: string[] = [];

  await withCheckedKey(
    { key, environment: "staging", log: (m) => logged.push(m) },
    async () => new Response("no"),
  );

  const all = logged.join("\n");
  assert(!all.includes(key), "the whole key reached the log");
  assert(!all.includes("SUPERSECRETVALUE"), "the key's body reached the log");
  assert(!all.includes("1234567890"), "the key's tail reached the log");
  // What it DOES say: the setting's name and the two mode words.
  assert(all.includes(STRIPE_SETTINGS.secretKey));
  assert(all.includes("live") && all.includes("test"));
});

// ---------------------------------------------------------------------------
// 2. What a subscription becomes
// ---------------------------------------------------------------------------

const facts = (over: Partial<SubscriptionFacts> = {}): SubscriptionFacts => ({
  status: "active",
  currentPeriodEnd: 1_800_000_000,
  customerId: "cus_123",
  subscriptionId: "sub_123",
  userId: "11111111-1111-1111-1111-111111111111",
  ...over,
});

Deno.test("an active subscription is the team plan", () => {
  const row = entitlementFromSubscription(facts());
  assert(row);
  assertEquals(row.plan, "team");
  assertEquals(row.status, "active");
  assertEquals(row.stripe_subscription_id, "sub_123");
});

Deno.test("a trial counts, and a failing card does not", () => {
  assertEquals(entitlementFromSubscription(facts({ status: "trialing" }))?.plan, "team");

  for (const status of ["past_due", "unpaid", "canceled", "incomplete", "paused"]) {
    const row = entitlementFromSubscription(facts({ status }));
    assertEquals(row?.plan, "free", `${status} should not entitle`);
    // The status is still recorded, so a lapse can be told from a cancellation.
    assertEquals(row?.status, status);
  }
});

Deno.test("the period end is seconds, not milliseconds", () => {
  const row = entitlementFromSubscription(facts({ currentPeriodEnd: 1_800_000_000 }));
  // 1800000000 seconds is 2027-01-15. Read as milliseconds it would be 1970,
  // which reads as expired and silently takes away what somebody paid for.
  assertEquals(row?.current_period_end, "2027-01-15T08:00:00.000Z");
});

Deno.test("no user id means no row, because a row with no owner belongs to nobody", () => {
  assertEquals(entitlementFromSubscription(facts({ userId: null })), null);
});

Deno.test("a null period end survives rather than becoming 1970", () => {
  const row = entitlementFromSubscription(facts({ currentPeriodEnd: null }));
  assertEquals(row?.current_period_end, null);
});

// ---------------------------------------------------------------------------
// 3. ORDER DOES NOT MATTER, which is the book's third webhook test
// ---------------------------------------------------------------------------
//
// "a cancellation arriving before the sign-up". The point of the design is that
// this cannot produce a wrong answer, because nothing reads a status out of an
// event -- both events cause the same question to be asked of Stripe, and the
// answer to that question is what is written. So the test is: whichever event
// prompted the look, the same current subscription produces the same row.

Deno.test("a cancellation arriving before the sign-up still ends on Stripe's current truth", () => {
  // Stripe's current truth, whenever we ask: this person is active.
  const current = facts({ status: "active" });

  // The late sign-up event prompts a look.
  const fromSignup = entitlementFromSubscription(current);
  // The early cancellation event prompted the same look, and got the same
  // answer, because the answer comes from Stripe and not from the event.
  const fromCancellation = entitlementFromSubscription(current);

  assertEquals(fromSignup, fromCancellation);
  assertEquals(fromSignup?.plan, "team");
});

Deno.test("and the reverse: a real cancellation wins however it arrives", () => {
  const current = facts({ status: "canceled" });
  assertEquals(entitlementFromSubscription(current)?.plan, "free");
});

Deno.test("the access events are a fixed list and cancellation is on it", () => {
  assert(ACCESS_EVENTS.includes("customer.subscription.deleted"));
  assert(ACCESS_EVENTS.includes("checkout.session.completed"));
  // Nothing about invoices or payment methods -- the function acknowledges and
  // ignores anything not on this list.
  assert(!ACCESS_EVENTS.some((e) => e.startsWith("invoice.")));
  assert(!ACCESS_EVENTS.some((e) => e.startsWith("payment_method.")));
});

Deno.test("the two entitling statuses match the migration's", () => {
  // team_member_limit() in 20261014120000_team_plan.sql spells the same pair.
  // scripts/screen-state-check.mjs asserts the SQL side; this asserts ours, so
  // the duplication is checked from both ends rather than remembered.
  assertEquals([...ENTITLING_STATUSES].sort(), ["active", "trialing"]);
});
