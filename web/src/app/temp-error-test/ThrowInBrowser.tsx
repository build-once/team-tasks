"use client";

import * as Sentry from "@sentry/nextjs";

// TEMPORARY -- part of the commits that must be reverted before #160 merges.
// See web/src/app/temp-error-test/page.tsx for the whole explanation.
//
// THE ONLY "use client" FILE IN THIS REPOSITORY, and that is worth knowing
// rather than glossing over: every other page is a server component, which is
// exactly why a browser error report carries no user id (the browser has no
// signed-in identity without shipping the Supabase client into the bundle).
// This file exists to produce a browser error at all, so that the browser half
// of the reporting can be seen working once.

// Made up here, and deliberately dull so no secret scanner mistakes it for a
// real one. The pieces are joined rather than written out for the same reason:
// 13 + 10 + 10 + 10 = 43 characters, which is the length of a real invitation
// token (supabase/functions/invite-member/index.ts, TOKEN_BYTES and makeToken).
const FAKE_TOKEN_IN_BROWSER =
  "nOtArEaLtOkEn" + "9876543210" + "zyxwvutsrq" + "ZYXWVUTSRQ";

// Per page load, counted the same way the server counts visits, so two clicks
// are two different messages and Dedupe cannot match the second against the
// first (@sentry/core/build/esm/integrations/dedupe.js compares the exception's
// value, not the user).
let clicks = 0;

export function ThrowInBrowser({ signedIn }: { signedIn: boolean }) {
  return (
    <button
      type="button"
      onClick={() => {
        clicks += 1;

        // The same tag the server page sets, with the value the SERVER decided
        // and passed down. The browser cannot work out who is signed in -- that
        // is the gap described in web/src/instrumentation-client.ts -- so this
        // is the server's answer carried into the browser event, and it is why
        // a browser report can say `signed_in: yes` while carrying no user id.
        Sentry.setTag("signed_in", signedIn ? "yes" : "no");

        // A DIFFERENT error from the server one, so the two are told apart in
        // Sentry at a glance, and different on every click. It carries three
        // things the scrub must remove: an address, a token, and the quoted
        // input of a Postgres parse error.
        throw new Error(
          `temp-error-test BROWSER click ${clicks} at ${new Date().toISOString()}: ` +
            `clicked by jo.bloggs@example.com ` +
            `with token ${FAKE_TOKEN_IN_BROWSER} ` +
            `and invalid input syntax for type uuid: "Ring Sam about the keys"`,
        );
      }}
      style={{
        padding: "0.75rem 1.25rem",
        fontSize: "1rem",
        cursor: "pointer",
      }}
    >
      Throw an error in the browser
    </button>
  );
}
