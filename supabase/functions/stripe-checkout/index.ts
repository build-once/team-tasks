// stripe-checkout -- start a hosted checkout, and tell the pricing page what
// the price is.
//
// Build it 27, Lesson O8: "Never touch cards." This function's whole job is to
// hand the browser a Stripe URL and get out of the way.
//
// ---------------------------------------------------------------------------
// NO CARD NUMBER REACHES THIS APP, AND THAT IS STRUCTURAL
// ---------------------------------------------------------------------------
//
// Not "we are careful with card numbers" -- there is nowhere for one to go.
// This app has no card field, no Stripe script in any page, and no endpoint
// that accepts a payment method. The card is typed on `checkout.stripe.com`,
// on Stripe's page, and the only thing that crosses back is a redirect.
//
// The same shape as the attachments bucket being private and the signed link
// being five minutes: the safest way to hold something is not to hold it.
//
// ---------------------------------------------------------------------------
// WHAT IT SENDS STRIPE, which is as little as a checkout can be given
// ---------------------------------------------------------------------------
//
// A price id, two addresses to come back to, and the caller's user id as
// METADATA so the webhook knows whose entitlement to write. docs/plan.md's list
// of what must never be sent: "a task title, a team name, a display name, a
// file, or any other person's address." None of those is in scope here -- this
// function never reads a task, a team or a profile.
//
// THE USER ID COMES FROM THE VERIFIED TOKEN, never from the body. If it came
// from the body, anybody signed in could buy a Team plan for somebody else's
// account -- or, more usefully to them, make somebody else's checkout credit
// their own.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import Stripe from "stripe";

import { STRIPE_SETTINGS, withCheckedKey } from "../_shared/stripe-keys.ts";

// ---------------------------------------------------------------------------
// Two things this function does, chosen by the body's `action`
// ---------------------------------------------------------------------------
//
// ONE FUNCTION RATHER THAN TWO, because both need the same key, the same
// startup check and the same price id, and two functions would mean two copies
// of all three. The actions are a fixed pair; anything else is refused.
const ACTION_PRICE = "price";
const ACTION_CHECKOUT = "checkout";

function fail(message: string, status: number, code?: string): Response {
  return Response.json({ error: message, code }, { status });
}

/**
 * The amount, formatted by Intl rather than by us.
 *
 * Stripe gives an amount in the currency's smallest unit -- pence, cents -- and
 * a currency code. Dividing by 100 is right for most currencies and wrong for
 * the ones with no minor unit, so the division is left to Intl, which knows
 * which is which.
 */
function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    if (!userId) return fail("You must be signed in.", 401);

    const environment = (Deno.env.get(STRIPE_SETTINGS.environment) ?? "").trim();
    const secretKey = Deno.env.get(STRIPE_SETTINGS.secretKey) ?? "";
    const priceId = (Deno.env.get(STRIPE_SETTINGS.priceTeam) ?? "").trim();
    const appUrl = (Deno.env.get("APP_URL") ?? "").trim().replace(/\/+$/, "");

    return await withCheckedKey(
      {
        key: secretKey,
        environment,
        log: (message) => console.error(`stripe-checkout: ${message}`),
      },
      async (key) => {
        if (priceId === "") {
          console.error(
            `stripe-checkout: ${STRIPE_SETTINGS.priceTeam} is not set, so there is no price to sell or to show.`,
          );
          return fail("Payments aren't available right now.", 503, "stripe_not_configured");
        }

        let action: unknown;
        try {
          action = (await req.json())?.action;
        } catch {
          return fail("That request could not be read.", 400, "bad_request");
        }

        const stripe = new Stripe(key, { apiVersion: "2025-09-30.clover" });

        // ---- What does it cost? ------------------------------------------
        //
        // READ FROM STRIPE, FROM THE SAME PRICE ID THE CHECKOUT USES, which is
        // the owner's instruction and docs/plan.md's own sentence: "Not typed
        // into a template, where it would become a number this app claims and
        // Stripe disagrees with -- which is the one kind of wrong a pricing
        // page must not be."
        //
        // The id is read from ONE setting, so the two cannot drift: there is no
        // arrangement in which the page shows one price and the checkout
        // charges another, because there is only one id.
        if (action === ACTION_PRICE) {
          try {
            const price = await stripe.prices.retrieve(priceId);

            if (price.unit_amount === null) {
              // A price with no fixed amount -- metered or tiered. This app
              // sells one flat plan, so this is a misconfiguration, and the
              // page says nothing rather than inventing a number.
              console.error("stripe-checkout: the configured price has no unit_amount");
              return fail("Payments aren't available right now.", 503, "stripe_not_configured");
            }

            return Response.json({
              amount: formatPrice(price.unit_amount, price.currency),
              interval: price.recurring?.interval ?? null,
            });
          } catch {
            console.error("stripe-checkout: could not read the price from Stripe");
            return fail("Payments aren't available right now.", 503, "stripe_unreachable");
          }
        }

        // ---- Start a checkout --------------------------------------------
        if (action !== ACTION_CHECKOUT) {
          return fail("That request could not be read.", 400, "bad_request");
        }

        if (appUrl === "") {
          console.error("stripe-checkout: APP_URL is not set, so there is nowhere to return to.");
          return fail("Payments aren't available right now.", 503, "stripe_not_configured");
        }

        // The customer we already have, if any, so a second checkout does not
        // create a second Stripe customer for the same person. Read with the
        // admin client because the caller may not read their own row's
        // customer id -- my_entitlement() deliberately does not return it.
        const existing = await ctx.supabaseAdmin
          .from("entitlements")
          .select("stripe_customer_id")
          .eq("user_id", userId)
          .limit(1);

        if (existing.error) {
          // An unknown is not "no customer": proceeding would create a second
          // customer for somebody who already has one, which is the one
          // mistake here that is awkward to undo.
          console.error("stripe-checkout: could not read the caller's entitlement");
          return fail("Payments aren't available right now.", 503, "stripe_unreachable");
        }

        const customerId = existing.data?.[0]?.stripe_customer_id ?? undefined;

        try {
          const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            line_items: [{ price: priceId, quantity: 1 }],
            customer: customerId,
            // THE SUCCESS PAGE GRANTS NOTHING. docs/plan.md says so as its own
            // heading, and this address is the proof rather than the exception:
            // it carries no token, no session id and nothing a screen could
            // read as permission. It is a page that says "thank you, this may
            // take a moment".
            success_url: `${appUrl}/settings?paid=1`,
            cancel_url: `${appUrl}/settings`,
            // THE ONE THING THAT TIES A PAYMENT TO A PERSON. The webhook reads
            // this off the subscription and writes the entitlement for it, so
            // a subscription with no metadata credits nobody -- which is the
            // null branch in entitlementFromSubscription.
            subscription_data: { metadata: { user_id: userId } },
            client_reference_id: userId,
          });

          if (!session.url) {
            console.error("stripe-checkout: Stripe returned a session with no URL");
            return fail("Payments aren't available right now.", 503, "stripe_unreachable");
          }

          // The URL, and nothing else. No session id, no customer id: the
          // browser needs somewhere to go and the app needs nothing back.
          return Response.json({ url: session.url });
        } catch {
          console.error("stripe-checkout: could not create a checkout session");
          return fail("Payments aren't available right now.", 503, "stripe_unreachable");
        }
      },
    );
  }),
};
