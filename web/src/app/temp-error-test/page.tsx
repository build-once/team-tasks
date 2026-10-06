// TEMPORARY. THIS WHOLE FOLDER, AND THE ONE LINE IT ADDS TO
// web/src/lib/supabase/proxy.ts, MUST BE REVERTED BEFORE #160 MERGES.
//
// WHY IT EXISTS. The coach's review of #160 made the point that cannot be
// answered by reading code: nothing in this repository has ever sent an error
// report, so nothing in it can show what a delivered event actually contains.
// Three things are unverified for that one reason -- whether a report arrives at
// all, whether the scrub really runs on it, and whether the per-request user id
// is this request's rather than the last request's. The last of those matters
// most: a stale id would put one person's identity on another person's error.
//
// A page that breaks on purpose is the cheapest way to settle all three, and it
// has to be a real page in a real deployment, because that is the only place
// Sentry, Next.js' onRequestError and the isolation scope are all genuinely in
// play.
//
// WHAT MAKES IT SAFE TO EXIST FOR A FEW MINUTES, said plainly:
//
//   * It reads nothing and writes nothing. No table is touched. The only
//     database call is the same getClaims() every page makes, which verifies a
//     token's signature and returns its claims.
//   * Every value it throws is INVENTED HERE. No real address, no real token,
//     no real task text. The "Buy milk for Sam" row is made up, and Sam is
//     nobody.
//   * It is open while signed out ON PURPOSE -- that is half the test -- and it
//     reveals nothing, because it holds nothing. It shows whether the caller is
//     signed in, which the caller already knows.
//
// WHAT MAKES IT UNSAFE TO LEAVE: it is an unauthenticated route whose whole job
// is to crash the server. On a public production site that is a free way to
// fill somebody's error budget, and docs/plan.md's budget section is not
// hypothetical about a free plan. Hence: revert before merge.
//
// HOW TO USE IT, on the preview deployment once the DSN is set:
//
//   1. Open /temp-error-test            -> server error, signed out. In Sentry
//                                          this event must have NO user id.
//   2. Sign in as Alice, open it again  -> server error with Alice's id.
//   3. Sign out, open it a third time   -> server error with NO user id again.
//      Step 3 is the one that matters. If it carries Alice's id, the isolation
//      scope is leaking between requests and review point 6 is a real bug.
//   4. Open /temp-error-test?ui=1 and press the button -> browser error.
//
//   In every event, check by eye that the address, the token and the row are
//   placeholders rather than values.

import Link from "next/link";

import { rememberUserForErrorReports } from "@/lib/sentry-user";
import { createClient } from "@/lib/supabase/server";

import { ThrowInBrowser } from "./ThrowInBrowser";

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
// whole argument behind the sentence added to docs/plan.md in the commit before
// this one.
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
  // signature every time, and then rememberUserForErrorReports with the `sub`
  // claim.
  //
  // ONE DIFFERENCE, and it is the point of the page rather than an oversight:
  // the real pages `redirect("/login")` when there are no claims. This one
  // carries on, so that a SIGNED-OUT error can be produced -- and when there is
  // no `sub`, rememberUserForErrorReports is called with undefined, which
  // clears the user rather than leaving the last one in place. Whether that
  // clearing really happens per request is the thing being tested.
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  rememberUserForErrorReports(userId);

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
          merges. It exists to see one real error report arrive, because nothing
          in the repository can show what a delivered event contains.
        </p>
        <p>
          You are currently <strong>{userId ? "signed in" : "signed out"}</strong>.
          A report from this request should carry{" "}
          {userId ? "a user id" : "no user id at all"}.
        </p>
        <p>
          <ThrowInBrowser />
        </p>
        <p>
          <Link href="/temp-error-test">Throw an error on the server</Link> —
          then sign in, do it again, sign out, and do it a third time. The third
          one must carry no user id. If it carries the id from the second, the
          per-request isolation is leaking.
        </p>
      </main>
    );
  }

  // ---- The server error ----------------------------------------------------
  //
  // Three things the scrub must remove, in one message: an address, a
  // 43-character token, and a quoted database row. All three invented above.
  throw new Error(
    `temp-error-test SERVER: invited ${FAKE_ADDRESS} with token ${FAKE_TOKEN}; ` +
      `database said: ${FAKE_ROW}`,
  );
}
