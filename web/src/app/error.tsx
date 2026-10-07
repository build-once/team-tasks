"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// THE ERROR LOOK for a screen that threw rather than for a read that failed.
//
// TWO DIFFERENT ERROR LOOKS, AND BOTH ARE NEEDED. A query that comes back with an
// error is handled inside the page, by the LoadFailed component, because the page
// is still standing and can say which read failed. An unexpected throw is not: the
// render stopped, and without this file Next.js draws its own screen. This is the
// boundary that catches it -- "error.js wraps a route segment and its nested
// children in a React Error Boundary"
// (web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// error.md).
//
// IT IS AT THE TOP OF app/, so every screen has it: My tasks, My teams, the
// invitation page, sign-in, sign-up and both password screens.
//
// NOTHING FROM THE ERROR IS DRAWN, and that is the point rather than an oversight.
// Not `error.message`, not `error.digest`. The version-matched docs are explicit
// that in DEVELOPMENT the message is serialised through to the client "for easier
// debugging" -- so a component that printed it would print a Postgres error
// quoting a row, or a fetch error quoting a URL with an address in it, to whoever
// was looking at the screen. In production it would be a hash, which is worse to
// read and no more use. Build it 19 rule 2: people never see raw error text or
// internal codes.
//
// THE DETAIL GOES TO SENTRY INSTEAD, through `beforeSend`, which is
// web/src/lib/sentry-scrub.ts' scrubEvent (wired up in web/src/sentry/options.ts).
// That is the existing scrub, so an address or a token inside the message is
// replaced before anything leaves.
//
// `retry` RATHER THAN `reset`, which is what the installed version wants: "In most
// cases, you should use retry() instead" -- `retry()` re-fetches and re-renders the
// boundary's children, where `reset()` only clears the error state without reading
// anything again. A Try again that does not try again is the kind of dishonest
// screen this issue is about.
//
// Error boundaries must be Client Components, so this is the one client component
// in the app. It holds no data: an error, which it does not read, and a function.
export default function ScreenError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: "app" } });
  }, [error]);

  return (
    <main className="page stack">
      <h1>Something went wrong</h1>

      {/* "Nothing you were doing has been lost unless a message said so." USED TO
          BE THE MIDDLE SENTENCE (issue #200). It was a promise about the state of
          the database, and nothing in this repository made it true.

          An error boundary catches a throw during RENDER, and a throw can happen
          AFTER a write has already landed -- a server action that inserts a row and
          then throws on the way to its redirect reaches this very screen. The hedge
          did not cover that case, because in that case there is no message: the
          screen that would have carried one is the screen that failed. This app has
          a real version of the failure, too -- accept-invite can mark an invitation
          accepted and fail to write the membership row, which it logs as needing
          fixing by hand.

          So it was removed rather than reworded: nothing can make a general promise
          about unrelated writes true, and the sentence's effect was to tell somebody
          not to check at the one moment something had definitely gone wrong. What is
          left is what this screen can keep, and it now matches global-error.tsx,
          which never made the claim. */}
      <p className="banner banner--bad" role="alert">
        <span>
          This screen could not be shown. The details have gone to the owner.
        </span>
      </p>

      <p>
        {/* No identifier on this one, and it is the only button in the app
            without one: it is not a form submission at all. There is nothing for
            an identifier to travel to -- `retry` is a function this boundary was
            handed, so what the button does is decided by the code it is written
            in and cannot be decided by anything a caller sends. */}
        <button className="btn btn--primary" type="button" onClick={() => retry()}>
          Try again
        </button>
      </p>
    </main>
  );
}
