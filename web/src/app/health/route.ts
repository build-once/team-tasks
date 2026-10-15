import { createClient } from "@/lib/supabase/server";

// health -- the one address an uptime monitor watches, answering "ok" or "error".
//
// Build it 29, Lesson J25. The owner's instruction: "The health check page must
// report only 'ok' or 'error'."
//
// ---------------------------------------------------------------------------
// WHY IT SAYS SO LITTLE, WHICH IS THE WHOLE DESIGN
// ---------------------------------------------------------------------------
//
// It is PUBLIC and unauthenticated -- it has to be, because a monitor holds no
// session -- so everything it says is said to anybody who finds it. The temptation
// on a page like this is to be helpful: name the thing that failed, give a version,
// count some rows, print a database error. Every one of those is a sentence about
// this app's insides published at a fixed address.
//
// So the body is five characters or eight, and the status code carries the rest:
//
//   200  ok
//   503  error
//
// A monitor needs no more than that. A person debugging needs the Vercel and
// Supabase logs, which they have, and which say what this deliberately does not.
//
// ---------------------------------------------------------------------------
// WHAT IT ACTUALLY CHECKS, AND THE ONE THING IT MUST NOT BE
// ---------------------------------------------------------------------------
//
// `select 1 from feature_switches` -- or rather the cheapest question that reaches
// the database at all. A health check that only proved Next.js was running would go
// on answering "ok" through the whole of the failure that matters most: Vercel up,
// database gone, every screen broken. That is the failure this exists to catch.
//
// IT IS NOT A LIVENESS CHECK FOR THE WHOLE STACK, and that is said rather than
// implied. It does not ask Stripe, Anthropic, Resend or Cloudflare whether they are
// well: those are four companies' uptime, they are checked by this app's own
// refusals when somebody presses a button, and a health check that went red because
// Anthropic was busy would be an alarm nobody could act on at 3am.
//
// WHY `public.feature_on`, which is the narrowest thing it could ask. It takes no
// user id, returns one boolean, and reads one row of a four-row table. A `select` on
// `tasks` would be a query over people's data to answer a question that is not
// about them.
//
// AND IT RUNS AS `anon`, WHICH IS THE THING THIS COMMENT GOT WRONG AND IS KEPT HERE
// AS A CORRECTION RATHER THAN A TIDY-UP. It used to say the function "is granted to
// `authenticated` AND to no client role beyond that -- so an anonymous caller here
// reaches it through the publishable key the same way every signed-out screen does",
// which contradicts itself: a monitor holds NO SESSION, so the publishable key makes
// it `anon`, and 20261015120000_feature_switches.sql revoked EXECUTE from `anon` by
// name. The two were written in the same change.
//
// So this route answered 503 `error` on production from the merge of PR #316 until
// 20261015160000_feature_on_for_anon.sql granted `anon` that one EXECUTE. Nothing
// was misconfigured and no setting was missing; the home page was fine throughout,
// and no check in CI fetches this address, so a green pull request said nothing
// about it. That migration's header has the measurement.
//
// WHAT THAT GRANT DOES AND DOES NOT WIDEN: a signed-out caller can learn whether a
// feature is switched off -- the same answer everybody gets, about this app rather
// than about any person -- and `public.feature_switches` itself stays unreachable by
// every role, so nothing can read which switches exist or change one.
//
// AND THE ANSWER'S VALUE IS IGNORED. Whether attachments are switched on or off has
// nothing to do with whether this app is healthy -- a switched-off feature is the
// app working. What is being tested is that the question could be ASKED and ANSWERED:
// a connection, a role, a function, a round trip.
//
// ---------------------------------------------------------------------------
// NOT CACHED, which is the one way a health check fails silently
// ---------------------------------------------------------------------------
//
// A cached health check is worse than none: it answers "ok" from the edge while the
// database is on fire, and nothing ever alarms. Two things stop it, because one is
// not enough to be sure of:
//
//   * `export const dynamic = "force-dynamic"`, which Next.js documents as forcing
//     "dynamic rendering, which will result in routes being rendered for each user
//     at request time"
//     (web/node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md);
//   * `cache-control: no-store` on the way out, so nothing between here and the
//     monitor keeps a copy either -- the same header
//     web/src/app/settings/export/route.ts sets, for a different reason.
export const dynamic = "force-dynamic";

const OK = "ok";
const ERROR = "error";

// Plain text rather than JSON, on purpose: there is no field to name, and a JSON
// body invites somebody to add one later. A monitor matching a body matches five
// characters.
function answer(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store, max-age=0, must-revalidate",
    },
  });
}

export async function GET() {
  try {
    const supabase = await createClient();

    // The narrowest question that reaches the database. Its ANSWER is discarded;
    // only `error` is read.
    const { error } = await supabase.rpc("feature_on", {
      p_feature: "ai_suggestions",
    });

    if (error) {
      // THE DETAIL GOES TO THE LOG AND NOT TO THE CALLER, and what goes to the log
      // is the error's own code and nothing else -- not its message, which can
      // quote a statement, and not its details. The same line
      // supabase/functions/_shared/limits.ts draws about a count that failed.
      console.error(`health: the database did not answer. Code: ${error.code ?? "none"}.`);
      return answer(ERROR, 503);
    }

    return answer(OK, 200);
  } catch {
    // A thrown error -- a missing setting, the client itself, the network. Nothing
    // about the cause is returned, and nothing is logged about it either: a thrown
    // object here can carry a request, and a request carries a key in a header.
    console.error("health: the check threw before it could ask anything.");
    return answer(ERROR, 503);
  }
}

// ---------------------------------------------------------------------------
// WHAT THE OWNER STILL HAS TO DO, which no code in this repository can
// ---------------------------------------------------------------------------
//
// This file is the thing being watched, not the watching. docs/incident-plan.md
// has it as a step: point a monitor at <production>/health, expect 200 and the body
// `ok`, and -- the half that is easy to skip -- point a SECOND monitor at an
// address that does not exist, so that an alert is seen to arrive rather than
// assumed. Lesson J25's own instruction, and `evidence/uptime-alert-phone.md` is
// where the result goes.
//
// AND IT NEEDS ONE LINE IN ANOTHER FILE, which is the half that fails silently and
// totally: `"/health"` is in `PUBLIC_PATHS` in `web/src/lib/supabase/proxy.ts`.
//
// An earlier version of this comment said the opposite -- that a route handler is
// reached without the session proxy, so no entry was needed. That is wrong.
// `web/src/proxy.ts`'s matcher is
// `/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|…)$).*)`, which
// matches /health like any other path, so without that line a monitor would be
// REDIRECTED TO /login -- a 307, not a 200, and an alarm that fires for ever
// against a healthy app. The same trap the privacy page's own header records about
// itself, arriving at the one address whose job is to be reachable.
//
// `scripts/screen-state-check.mjs` asserts the entry by name rather than leaving it
// to be remembered.
