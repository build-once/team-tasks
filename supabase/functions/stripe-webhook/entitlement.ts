// entitlement.ts -- the decisions the webhook makes, with nothing that talks to
// anything.
//
// Split out of index.ts for the reason supabase/functions/_shared/limits.ts is
// split out of its call sites: a test can run THIS rather than a copy of it.
// Nothing here imports Stripe, Supabase or Deno, so the tests beside it need no
// network, no key and no stub of either company.

/**
 * The events that may change what somebody has paid for.
 *
 * A FIXED LIST, AND EVERYTHING ELSE IS IGNORED. A Stripe account can be
 * configured to send dozens of types, and most of them are about invoices,
 * payment methods and disputes -- none of which this app has an opinion about.
 * A function that tried to interpret an unfamiliar type would be a function
 * doing something unexpected with somebody's access.
 *
 * `checkout.session.completed` is here because it is the first word we get that
 * somebody has bought something. It is NOT trusted for the status -- see the
 * note on entitlementFromSubscription -- it only tells us which subscription to
 * go and read.
 *
 * `customer.subscription.deleted` is the cancellation. It is on this list and
 * is handled exactly like the others: re-read the subscription, write what
 * Stripe says. Stripe keeps answering for a deleted subscription with a status
 * of `canceled`, which is the fact we want.
 */
export const ACCESS_EVENTS: readonly string[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
];

/** What the webhook read back from Stripe, reduced to the five things we keep. */
export type SubscriptionFacts = {
  status: string;
  /** Unix seconds, as Stripe gives it, or null. */
  currentPeriodEnd: number | null;
  customerId: string | null;
  subscriptionId: string;
  /** From the subscription's metadata, set by the checkout. */
  userId: string | null;
};

/** Exactly the columns `entitlements` has, and no others. */
export type EntitlementRow = {
  user_id: string;
  plan: "free" | "team";
  status: string;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string;
  updated_at: string;
};

/**
 * The statuses that mean somebody is actually entitled to the Team plan.
 *
 * THE SAME TWO WORDS AS `team_member_limit()` IN THE MIGRATION, and that
 * duplication is deliberate rather than careless -- but it is a duplication, so
 * it is named here and asserted by scripts/screen-state-check.mjs rather than
 * left for somebody to notice.
 *
 * Why it exists in two places at all: the database needs it because the limit
 * is answered in one SQL statement, and this needs it because `plan` is a
 * separate column from `status` and something has to decide what to put in it.
 * The alternative -- deriving `plan` in SQL -- would mean the webhook wrote a
 * status and the database inferred a plan, which is a rule living somewhere
 * nobody would look for it.
 *
 * past_due and unpaid are NOT here. A card that has failed is not a card that
 * has paid, and the honest answer is to fall back to the free limit rather than
 * keep granting a larger team to somebody whose payment is bouncing.
 */
export const ENTITLING_STATUSES: readonly string[] = ["active", "trialing"];

/**
 * Turn what Stripe currently says into the row we store.
 *
 * NOTHING HERE READS THE EVENT. It reads the subscription the webhook fetched
 * afterwards, which is the whole of docs/plan.md's "the event is a nudge saying
 * 'look again', not a statement of fact". That is what makes order not matter:
 * a cancellation arriving before its own sign-up still ends with this function
 * being handed the CURRENT subscription, and the current subscription is the
 * same object whichever event prompted the look.
 *
 * Returns null when there is no user id, because a row with no owner is a row
 * that belongs to nobody and must not be invented. The webhook logs that and
 * answers 200: there is nothing to retry, because retrying will not add
 * metadata that was never set.
 */
export function entitlementFromSubscription(
  facts: SubscriptionFacts,
  now: Date = new Date(),
): EntitlementRow | null {
  if (!facts.userId) return null;

  const entitled = ENTITLING_STATUSES.includes(facts.status);

  return {
    user_id: facts.userId,
    // `plan` is what they have, `status` is how it is going. Somebody whose
    // card just failed keeps `status: "past_due"` and drops to `plan: "free"`,
    // which is two facts rather than one and is why both columns exist.
    plan: entitled ? "team" : "free",
    status: facts.status,
    current_period_end:
      facts.currentPeriodEnd === null
        ? null
        // Stripe sends Unix SECONDS and JavaScript wants MILLISECONDS. Getting
        // this wrong by a factor of 1000 puts every period end in January 1970,
        // which reads as "expired" and silently takes away the thing somebody
        // paid for -- so it is one of the two things the tests check by value
        // rather than by shape.
        : new Date(facts.currentPeriodEnd * 1000).toISOString(),
    stripe_customer_id: facts.customerId,
    stripe_subscription_id: facts.subscriptionId,
    updated_at: now.toISOString(),
  };
}
