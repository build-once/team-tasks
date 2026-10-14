// stripe-webhook -- the one door in this app that somebody else knocks on.
//
// Build it 27, Lesson R16. docs/plan.md, "A paid Team plan, and the first team
// size limit", and docs/architecture.md's note about the seventh arrow: every
// other credential-holding path in this project starts inside it and reaches
// out. This one starts at Stripe and arrives at a public address, carrying a
// body that anybody on the internet could have written.
//
// ---------------------------------------------------------------------------
// WHY verify_jwt = false, AND WHAT STANDS IN ITS PLACE
// ---------------------------------------------------------------------------
//
// Stripe sends no Supabase token, because Stripe has never heard of Supabase.
// So the platform lock that guards the other five functions cannot guard this
// one, and supabase/config.toml says `verify_jwt = false` for this function
// alone.
//
// WHAT REPLACES IT IS NOT WEAKER, AND IS ARGUABLY STRONGER: the other five ask
// "are you signed in", and this one asks "can you prove you hold a secret that
// only Stripe and this function's settings have". A request that cannot is
// answered 400 and nothing is read out of it. The signature is checked against
// the RAW BODY -- see readRawBody below for why that word is load-bearing.
//
// AND THE PRODUCTION SMOKE TEST KNOWS ABOUT IT. migrate-production.yml probes
// every function after a deploy and requires 401; this one cannot answer 401,
// so that job checks it differently -- a POST with no signature must answer
// 400. The owner authorised that on 2026-10-14. It is a better check than the
// one it replaces: 401 proves the platform refused, and 400 proves OUR door
// worked.
//
// ---------------------------------------------------------------------------
// WHAT THIS FUNCTION BELIEVES, WHICH IS ALMOST NOTHING
// ---------------------------------------------------------------------------
//
// A verified event is proof that Stripe sent it. It is NOT proof that it is
// current. docs/plan.md: "Events can arrive out of order -- a cancellation can
// reach us before the sign-up that preceded it. So on any event that touches
// access, the function fetches the current subscription from Stripe and makes
// our row match that. The event is a nudge saying 'look again', not a statement
// of fact."
//
// So nothing below reads a status out of the event body. The event tells us
// WHICH subscription to go and look at, and Stripe's answer to that question is
// what gets written.
//
// ---------------------------------------------------------------------------
// WHAT IT LOGS: a type and an id, and nothing else
// ---------------------------------------------------------------------------
//
// The owner's instruction: "log only event type and ID". Not the body, not an
// email address, not a customer id, not any part of a key. A webhook body is
// the single richest source of other people's personal data this app will ever
// hold in memory, and a log line is forever.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import Stripe from "stripe";

import {
  STRIPE_SETTINGS,
  withCheckedKey,
} from "../_shared/stripe-keys.ts";
import {
  ACCESS_EVENTS,
  entitlementFromSubscription,
  type SubscriptionFacts,
} from "./entitlement.ts";

// ---------------------------------------------------------------------------
// The answers. Four, and each says one thing.
// ---------------------------------------------------------------------------
//
// NONE OF THEM TELLS THE CALLER ANYTHING USEFUL ABOUT WHY, because the caller
// is either Stripe -- which only needs to know whether to retry -- or somebody
// probing a public URL, who needs to know nothing at all.
//
// 400 for a bad signature, which is the owner's instruction and is also what
// stops a retry: Stripe retries on 5xx, not on 400, and a body we cannot verify
// will never verify however many times it is sent.
const BAD_SIGNATURE = () => new Response("Bad signature", { status: 400 });

// 200 for "handled", and ALSO for "already handled" and "not interesting".
// Anything other than 2xx asks Stripe to send it again, and there is no version
// of an event we have already processed that we want again.
const OK = () => new Response("ok", { status: 200 });

// 500, the one answer that asks Stripe to retry. Used only when something that
// SHOULD have worked did not -- a database write that failed, a Stripe read
// that errored -- because those are the cases where sending it again is the
// right answer.
const RETRY = () => new Response("retry", { status: 500 });

/**
 * The body as Stripe signed it, byte for byte.
 *
 * THE WORD "RAW" IS THE WHOLE OF THIS FUNCTION'S REASON TO EXIST. Stripe signs
 * the exact bytes it sent. `await req.json()` parses them and throws the
 * original away, and re-serialising the parsed object gives different bytes --
 * a different key order, different whitespace, a number formatted differently
 * -- which produces a different signature and a verification that fails for a
 * body that was perfectly good.
 *
 * So the text is read ONCE, verified, and only then parsed. A function that
 * read json() first would have no way back.
 */
async function readRawBody(req: Request): Promise<string | null> {
  try {
    return await req.text();
  } catch {
    return null;
  }
}

export default {
  // No `auth` option, because there is no user to authenticate. The identity
  // that matters here is Stripe's, and it is established by the signature
  // rather than by a header the platform understands.
  fetch: withSupabase(async (req, ctx) => {
    // ---- Only POST -------------------------------------------------------
    //
    // Stripe sends POST. A GET on this address is somebody looking around, and
    // it gets the same uninformative 400 as an unsigned POST.
    if (req.method !== "POST") return BAD_SIGNATURE();

    const environment = (Deno.env.get(STRIPE_SETTINGS.environment) ?? "").trim();
    const secretKey = Deno.env.get(STRIPE_SETTINGS.secretKey) ?? "";
    const signingSecret = (
      Deno.env.get(STRIPE_SETTINGS.webhookSecret) ?? ""
    ).trim();

    // ---- The key must match the environment ------------------------------
    //
    // Before anything is read off the request. A function running with a live
    // key on staging must not get as far as looking at a body, let alone
    // writing a row.
    return await withCheckedKey(
      {
        key: secretKey,
        environment,
        log: (message) => console.error(`stripe-webhook: ${message}`),
      },
      async (key) => {
        // THE SIGNING SECRET IS A SECOND SECRET AND IS CHECKED SEPARATELY.
        // docs/plan.md calls it "its own signing secret in the function's
        // settings" -- it is not the API key, it is not derived from it, and a
        // function with a valid key and no signing secret can verify nothing.
        if (signingSecret === "") {
          console.error(
            `stripe-webhook: ${STRIPE_SETTINGS.webhookSecret} is not set, so no event can be verified. Refusing every request.`,
          );
          return BAD_SIGNATURE();
        }

        const signature = req.headers.get("stripe-signature");
        if (!signature) return BAD_SIGNATURE();

        const raw = await readRawBody(req);
        if (raw === null) return BAD_SIGNATURE();

        const stripe = new Stripe(key, { apiVersion: "2025-09-30.clover" });

        // ---- Verify ------------------------------------------------------
        //
        // `constructEventAsync` AND NOT `constructEvent`, and this is the one
        // Deno-specific thing in the file: the synchronous version uses Node's
        // crypto, and the async version uses Web Crypto, which is what this
        // runtime has. Stripe's own library ships both for exactly this.
        //
        // EVERY FAILURE IS THE SAME 400. A bad signature, an expired timestamp
        // and a body that is not JSON are all "you did not prove this came
        // from Stripe", and telling them apart would be telling a prober which
        // of their guesses was closest.
        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(
            raw,
            signature,
            signingSecret,
          );
        } catch {
          // Not logged with any detail, on purpose: an unverified body is
          // attacker-controlled, so nothing out of it reaches a log line.
          console.error("stripe-webhook: signature verification failed");
          return BAD_SIGNATURE();
        }

        // From here the event is Stripe's. Type and id only, which is the
        // owner's instruction and is enough to find it in Stripe's dashboard.
        console.log(`stripe-webhook: ${event.type} ${event.id}`);

        // ---- Have we already done this one? ------------------------------
        //
        // ONE INSERT THAT THE DATABASE MAY REFUSE, rather than a select
        // followed by an insert. The primary key is the mechanism: two retries
        // arriving at the same moment both try to insert, one wins, the other
        // gets a unique violation and stops. A check-then-write has a gap in
        // the middle that both would fit through.
        //
        // 23505 is unique_violation. Any OTHER error is a database that did not
        // answer, which is not permission to proceed -- so it asks Stripe to
        // retry rather than risking a second application of the same event.
        const claim = await ctx.supabaseAdmin
          .from("stripe_events")
          .insert({ event_id: event.id, event_type: event.type });

        if (claim.error) {
          if (claim.error.code === "23505") {
            // Already processed. 200, so Stripe stops sending it.
            console.log(`stripe-webhook: ${event.type} ${event.id} already processed`);
            return OK();
          }
          console.error(
            `stripe-webhook: could not record ${event.type} ${event.id}, asking for a retry`,
          );
          return RETRY();
        }

        // ---- Is this one of the events that changes access? --------------
        //
        // A FIXED LIST, and everything else is acknowledged and ignored. Stripe
        // sends dozens of event types and an account can be configured to send
        // all of them; a function that tried to be clever about an unfamiliar
        // one is a function that does something unexpected with somebody's
        // access.
        if (!ACCESS_EVENTS.includes(event.type)) return OK();

        // ---- Ask Stripe what is true NOW ---------------------------------
        //
        // The event body is not read for a status, a plan or a period end. All
        // that is taken from it is WHICH subscription to look at -- and even
        // that is re-read, because a checkout session carries a subscription id
        // rather than a subscription.
        let subscriptionId: string | null = null;

        const object = event.data.object as Record<string, unknown>;

        if (event.type === "checkout.session.completed") {
          const value = object.subscription;
          subscriptionId = typeof value === "string" ? value : null;
        } else {
          const value = object.id;
          subscriptionId = typeof value === "string" ? value : null;
        }

        if (!subscriptionId) {
          // A checkout that bought something which is not a subscription, or an
          // event shaped differently from what this code expects. Acknowledged
          // -- there is nothing to retry -- and nothing is written.
          console.log(`stripe-webhook: ${event.type} ${event.id} carries no subscription`);
          return OK();
        }

        let subscription: Stripe.Subscription;
        try {
          subscription = await stripe.subscriptions.retrieve(subscriptionId);
        } catch {
          // Stripe did not answer. This is the case retrying is FOR: the event
          // is real, we simply could not find out what is true. The claim row
          // is rolled forward rather than back -- see the note below.
          console.error(
            `stripe-webhook: could not read the subscription for ${event.type} ${event.id}, asking for a retry`,
          );
          await ctx.supabaseAdmin
            .from("stripe_events")
            .delete()
            .eq("event_id", event.id);
          return RETRY();
        }

        // ---- Make our row match ------------------------------------------
        const facts: SubscriptionFacts = {
          status: subscription.status,
          currentPeriodEnd:
            typeof subscription.items?.data?.[0]?.current_period_end === "number"
              ? subscription.items.data[0].current_period_end
              : null,
          customerId:
            typeof subscription.customer === "string"
              ? subscription.customer
              : (subscription.customer?.id ?? null),
          subscriptionId: subscription.id,
          userId:
            typeof subscription.metadata?.user_id === "string"
              ? subscription.metadata.user_id
              : null,
        };

        const row = entitlementFromSubscription(facts);

        if (!row) {
          // No user id on the subscription, so there is nobody to credit. This
          // is a misconfiguration rather than an attack -- the checkout sets
          // the metadata -- and it is logged without the ids it would be
          // tempting to include.
          console.error(
            `stripe-webhook: ${event.type} ${event.id} has no user_id in metadata, so no entitlement was changed`,
          );
          return OK();
        }

        const written = await ctx.supabaseAdmin
          .from("entitlements")
          .upsert(row, { onConflict: "user_id" });

        if (written.error) {
          console.error(
            `stripe-webhook: could not write the entitlement for ${event.type} ${event.id}, asking for a retry`,
          );
          await ctx.supabaseAdmin
            .from("stripe_events")
            .delete()
            .eq("event_id", event.id);
          return RETRY();
        }

        return OK();
      },
    );
  }),
};

// ---------------------------------------------------------------------------
// WHY THE CLAIM ROW IS DELETED ON A RETRY, which is the subtlest thing here
// ---------------------------------------------------------------------------
//
// The event id is recorded BEFORE the work, so that two simultaneous deliveries
// cannot both do it. But if the work then fails and we ask Stripe to retry, the
// retry would find its own id already recorded and answer "already processed"
// -- and the work would never happen at all. A row that says "done" about
// something that was not done is worse than no row.
//
// So a failure path removes the claim before asking for the retry. Which leaves
// one honest gap, written down rather than hidden: if the function dies between
// the claim and the delete -- a timeout, an isolate killed -- the id stays
// recorded and that event is never applied. What makes that survivable is the
// design above it: the NEXT access event for the same subscription re-reads the
// subscription from Stripe and writes the current truth, because nothing here
// depends on having seen every event in order. A missed event costs a delay,
// not a wrong answer.
