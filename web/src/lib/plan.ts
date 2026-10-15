// plan.ts -- the words and the two numbers the plan panel on My teams shows.
//
// Build it 27. Pure: no imports, no requests, so scripts/screen-state-check.mjs
// can run every sentence and every branch without a database.
//
// THE DATABASE IS THE AUTHORITY, NOT THIS FILE. `team_member_limit()` in
// 20261014120000_team_plan.sql is what actually decides whether somebody may
// join a team, and the two Edge Functions ask it. The numbers below are for
// DRAWING A SENTENCE, and they are a second copy -- which is why
// scripts/screen-state-check.mjs asserts the migration spells the same two
// numbers. A screen that said 25 while the database enforced 10 would be the
// app lying about what somebody had bought.

/** What a team may hold without the Team plan. */
export const FREE_TEAM_MEMBERS = 10;

/** What a team whose owner holds an active Team plan may hold. */
export const PAID_TEAM_MEMBERS = 25;

/**
 * The statuses that entitle. The same pair as `ENTITLING_STATUSES` in
 * supabase/functions/stripe-webhook/entitlement.ts and as the `in` list in
 * `team_member_limit()`. Third copy, same assertion.
 */
export const ENTITLING_STATUSES = ["active", "trialing"] as const;

export type Entitlement = {
  plan: string;
  status: string;
  current_period_end: string | null;
} | null;

/**
 * Is this person on the Team plan right now?
 *
 * BOTH CONDITIONS, because the database checks both: the status must entitle
 * AND the paid period must not have ended. A row left saying "active" by a
 * webhook that never arrived is exactly what the second condition is for, and a
 * screen that checked only the first would promise 25 where the database gives
 * 10.
 *
 * `null` -- nobody has ever started a checkout -- is the free plan, not an
 * error. That is the commonest case and the only one on a fresh account.
 */
export function onTeamPlan(entitlement: Entitlement, now: Date = new Date()): boolean {
  if (!entitlement) return false;
  if (entitlement.plan !== "team") return false;
  if (!(ENTITLING_STATUSES as readonly string[]).includes(entitlement.status)) return false;
  if (!entitlement.current_period_end) return false;

  const ends = Date.parse(entitlement.current_period_end);
  // An unparseable date is not an entitlement. An unknown is not a yes.
  if (Number.isNaN(ends)) return false;

  return ends > now.getTime();
}

/** How many people this person's teams may hold. */
export function memberLimitFor(entitlement: Entitlement, now?: Date): number {
  return onTeamPlan(entitlement, now) ? PAID_TEAM_MEMBERS : FREE_TEAM_MEMBERS;
}

// ---------------------------------------------------------------------------
// The sentences
// ---------------------------------------------------------------------------
//
// NONE OF THEM NAMES STRIPE, a card, an amount this app made up, or anybody
// else's payment status. The price is the one number that comes from outside,
// and it comes from Stripe through the server rather than from a template.

export const PLAN_TITLE = "Your plan";

export const PLAN_FREE_NAME = "Free";
export const PLAN_TEAM_NAME = "Team";

/** What the panel says about the limit, with the number filled in. */
export function limitSentence(limit: number): string {
  return `Each of your teams can have up to ${limit} members.`;
}

/**
 * The offer, shown only to somebody not on the plan.
 *
 * The price is passed in because it is read from Stripe at request time. When
 * it could not be read the panel says so rather than inventing a figure --
 * docs/plan.md: a number this app claims and Stripe disagrees with "is the one
 * kind of wrong a pricing page must not be".
 */
export function offerSentence(price: string | null, interval: string | null): string {
  if (!price) return `Raise every team you own to ${PAID_TEAM_MEMBERS} members.`;
  const per = interval ? ` a ${interval}` : "";
  return `${price}${per} raises every team you own to ${PAID_TEAM_MEMBERS} members.`;
}

export const PLAN_BUY_BUTTON = "Upgrade to Team";

/** When Stripe could not be reached at all, so there is nothing to press. */
export const PLAN_UNAVAILABLE = "Payments aren't available right now.";

/**
 * What somebody sees when they come back from a completed checkout.
 *
 * IT GRANTS NOTHING AND SAYS SO HONESTLY. docs/plan.md has this as its own
 * heading: "A person who lands on the success page has proved only that their
 * browser followed a redirect." Paid access changes when the webhook says it
 * changed, which is usually seconds later and is not instant -- so the sentence
 * promises a wait rather than a result, and the panel above it keeps showing
 * whatever the database currently says.
 */
export const PLAN_THANKS =
  "Thanks — your payment went to Stripe. Your plan updates here once Stripe confirms it, usually within a few seconds. Reload this page to check.";

/** When the checkout could not be started. */
export const PLAN_CHECKOUT_FAILED =
  "That couldn't be started just now. Please try again.";
