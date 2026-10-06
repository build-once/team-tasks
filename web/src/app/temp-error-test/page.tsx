// TEMPORARY. THIS WHOLE FOLDER, AND THE ONE LINE IT ADDS TO
// web/src/lib/supabase/proxy.ts, MUST BE REVERTED BEFORE #160 MERGES.
//
// WHY IT EXISTS. The coach's review of #160 made the point that cannot be
// answered by reading code: nothing in this repository has ever sent an error
// report, so nothing in it can show what a delivered event actually contains.
//
// WHAT THE FIRST RUN FOUND, and why this file changed. The owner visited this
// page three times on 6 October -- signed in as one person, signed out, then
// signed in as another -- and Sentry received only TWO events. The signed-out
// visit drew the error page and produced nothing. The two events that did
// arrive carried the right, different user ids, so the thing the review was
// most worried about (one person's id on another person's report) did not
// happen. Something else did: an event went missing.
//
// Reading the installed SDK turned up two mechanisms that can each lose an
// event here, and NEITHER can be told apart with the events as they were,
// because all three visits threw a byte-identical message and nothing on an
// event identified which server instance produced it:
//
//   1. Dedupe compares the message, the fingerprint and the stack frames, and
//      NOT the user (@sentry/core/build/esm/integrations/dedupe.js, lines
//      27-75). Two identical consecutive errors from two different people: the
//      second is dropped.
//   2. The flush after onRequestError is started and never awaited, and the
//      call that would ask the platform to keep the instance alive does nothing
//      outside the Edge runtime (@sentry/nextjs .../captureRequestError.js line
//      29 -> .../responseEnd.js lines 14-20 ->
//      @sentry/core/.../vercelWaitUntil.js lines 4-6).
//
// SO THIS VERSION MAKES EVERY REPORT DISTINGUISHABLE. Three changes, and each
// one is there to separate those two explanations:
//
//   * the thrown message carries a visit number and a timestamp, so no two
//     errors are ever identical and Dedupe can no longer match one against the
//     last. If all three visits now produce events, the first run's missing one
//     was Dedupe. If one still goes missing, it was the flush.
//   * a tag `instance`, fixed at module load, so two events can be SHOWN to
//     have come from the same server instance or not. This is the fact the
//     first run lacked: both its events carried the same `server_name`, and
//     `server_name` is set nowhere in the installed SDK, so it is not an
//     instance identifier.
//   * a tag `signed_in`, yes or no, as this page itself decided before
//     throwing -- so a missing event's own view of who it was is recoverable
//     from the events that did arrive around it.
//
// WHAT MAKES IT SAFE TO EXIST FOR A FEW MINUTES: it reads nothing and writes
// nothing, no table is touched, and every value it throws is invented here. It
// is open while signed out on purpose -- that is half the test -- and it
// reveals nothing, because it holds nothing.
//
// WHAT MAKES IT UNSAFE TO LEAVE: it is an unauthenticated route whose whole job
// is to crash the server. On a public site that is a free way to fill an error
// budget. Hence: revert before merge.

import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

import { rememberUserForErrorReports } from "@/lib/sentry-user";
import { createClient } from "@/lib/supabase/server";

import { ThrowInBrowser } from "./ThrowInBrowser";

// ---------------------------------------------------------------------------
// Per-instance state, fixed when this module is first loaded
// ---------------------------------------------------------------------------
//
// A serverless function is a process that is started, used for a while, frozen,
// and eventually thrown away. Everything in this block is per PROCESS, so two
// requests that share these values ran on the same instance, and two that do
// not, did not. That is the whole point of it.
//
// SIX CHARACTERS OF base36, which is about 2 billion possibilities -- plenty to
// tell a handful of instances apart in one afternoon, and short enough to read
// off a Sentry tag at a glance. It identifies a process, not a person: it is
// made before any request arrives, so it cannot be about whoever is calling.
const INSTANCE = Math.random().toString(36).slice(2, 8);

// Set ON THE GLOBAL SCOPE, once, here at module load -- not per request. The
// global scope is a true process-wide singleton
// (@sentry/core/build/esm/currentScopes.js, getGlobalScope, lines 25-27) and its
// data is merged into every event the process sends, so this tag is on
// everything this instance reports without being re-set anywhere.
Sentry.getGlobalScope().setTag("instance", INSTANCE);

// THERE IS DELIBERATELY NO VISIT COUNTER, and the reason is a lint rule worth
// agreeing with. A module-level `let` incremented during render is exactly what
// `react-hooks/globals` refuses:
//
//   Variable `visitsOnThisInstance` is declared outside of the component/hook.
//   Reassigning this value during render is a form of side effect, which can
//   cause unpredictable behavior depending on when the component happens to
//   re-render.
//
// The rule is right, and switching it off to win an argument with it would be
// weakening a check. The brief asked for "a short visit number OR time", so the
// time does the job: each request is stamped with an ISO timestamp to the
// millisecond and a four-character request id, which together make every
// message unique without anything being mutated during a render.

// Made up here. Dull on purpose so that no secret scanner mistakes either for a
// real one, and joined from pieces for the token so its length is arithmetic:
// 13 + 10 + 10 + 10 = 43, the length of a real invitation token
// (supabase/functions/invite-member/index.ts, TOKEN_BYTES and makeToken).
const FAKE_ADDRESS = "sam.taylor@example.com";
const FAKE_TOKEN = "nOtArEaLtOkEn" + "0123456789" + "abcdefghij" + "ABCDEFGHIJ";

// Exactly the string asked for, and worth saying why it is the interesting one:
// "Buy milk for Sam" is not address-shaped, not token-shaped and not 40
// characters of anything. No shape rule can catch it. It is removed only
// because "Failing row contains (" is a phrase the scrub knows -- which is the
// whole argument behind the sentence in docs/plan.md about free text.
const FAKE_ROW = "Failing row contains (1, Buy milk for Sam, f)";

export default async function TempErrorTestPage({
  searchParams,
}: {
  searchParams: Promise<{ ui?: string }>;
}) {
  const { ui } = await searchParams;

  // ---- Exactly what the real pages do to remember the user ----------------
  //
  // The same two calls, in the same order, as web/src/app/tasks/page.tsx and
  // web/src/app/teams/page.tsx: getClaims(), which verifies the token's
  // signature every time, then rememberUserForErrorReports with the `sub`
  // claim.
  //
  // ONE DIFFERENCE, and it is the point of the page rather than an oversight:
  // the real pages `redirect("/login")` when there are no claims. This one
  // carries on, so that a SIGNED-OUT error can be produced -- and when there is
  // no `sub`, rememberUserForErrorReports is called with undefined, which
  // clears the user rather than leaving the last one in place.
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  rememberUserForErrorReports(userId);

  // What this page decided about who is calling, recorded as a tag so it
  // survives onto the event even when the user id does not. If an event ever
  // shows `signed_in: no` AND a user id, those two disagree and the id is
  // stale -- which is review point 6, asked in a way one event can answer.
  //
  // On the isolation scope, which in Node is per request, so this cannot bleed
  // between callers the way the module-level values above deliberately do.
  Sentry.setTag("signed_in", userId ? "yes" : "no");

  // This one request, named by its time to the millisecond.
  //
  // A four-character random id was here too, and `react-hooks/purity` refused
  // it -- "`Math.random` is an impure function. Calling an impure function can
  // produce unstable results" -- for the same good reason the rule refused a
  // mutable counter above. It went rather than the rule. The timestamp alone is
  // what the brief allows ("a short visit number or time"), and visits made by
  // hand are seconds apart, so milliseconds are more resolution than the job
  // needs.
  const at = new Date().toISOString();

  // ---- The view, which exists only so the browser button is reachable -----
  //
  // A page that throws during render cannot also draw a button, so the throw is
  // the DEFAULT and the view is behind ?ui=1. That way the plain address is the
  // server test and needs no instructions.
  if (ui === "1") {
    return (
      <main style={{ padding: "2rem", maxWidth: "40rem", lineHeight: 1.6 }}>
        <h1>Temporary error test</h1>
        <p>
          <strong>This page is temporary</strong> and is reverted before #160
          merges. It exists to see real error reports arrive, and to tell apart
          two reasons one of them can go missing.
        </p>
        <p>
          Server instance <code>{INSTANCE}</code> at <code>{at}</code>. You are
          currently <strong>{userId ? "signed in" : "signed out"}</strong>, so a
          report from this request should carry{" "}
          {userId ? "a user id" : "no user id at all"} and the tag{" "}
          <code>signed_in: {userId ? "yes" : "no"}</code>.
        </p>
        <p>
          <ThrowInBrowser signedIn={Boolean(userId)} />
        </p>
        <p>
          <Link href="/temp-error-test">Throw an error on the server</Link> —
          then sign in, do it again, sign out, and do it a third time. Every
          event now carries a different message, an <code>instance</code> tag
          and a <code>signed_in</code> tag, so a missing one can be accounted
          for.
        </p>
      </main>
    );
  }

  // ---- The server error ----------------------------------------------------
  //
  // THE PREAMBLE IS WHY THIS FILE CHANGED. The instance and the timestamp make
  // every message different from every other, so Dedupe cannot match this event
  // against the previous one -- it compares the exception's value, and the
  // timestamp makes the value unique. Neither is touched by the scrub: six
  // base36 characters is far under the 40-character run the token rule needs,
  // and an ISO timestamp has no such run and no `@` in it.
  //
  // Then the same three things the scrub must remove: an address, a
  // 43-character token, and a quoted database row.
  throw new Error(
    `temp-error-test SERVER instance ${INSTANCE} at ${at}: ` +
      `invited ${FAKE_ADDRESS} with token ${FAKE_TOKEN}; ` +
      `database said: ${FAKE_ROW}`,
  );
}
