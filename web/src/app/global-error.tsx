"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// THE LAST ERROR LOOK: when the root layout itself threw.
//
// web/src/app/error.tsx catches anything inside the layout. It cannot catch the
// layout, because a boundary "does not wrap the layout.js or template.js above it
// in the same segment" -- and this file is the documented answer: "you can handle
// errors in the root layout or template using global-error.jsx"
// (web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// error.md).
//
// Without it, a throw in the layout shows Next.js' own built-in screen, which is
// not this app's words and has no Try again.
//
// IT DRAWS ITS OWN html AND body, which the same doc requires, because it replaces
// the root layout. And it gets NO global styles -- the doc says so in as many
// words: "global-error and the built-in 500 page render their own document and do
// not include your global styles". So the few things that matter here are written
// inline rather than through a class that will not be loaded.
//
// NO FOOTER HERE, deliberately, and it is the one screen in the app without the
// version. The Footer component reads a build-time value and is a server
// component; this file is a client component standing in for the layout that would
// have rendered it. A screen whose layout has just thrown is not the place to add
// another thing that could throw.
//
// NOTHING FROM THE ERROR IS DRAWN, and the detail goes to Sentry through the
// existing scrub -- the same reasoning as web/src/app/error.tsx, written there in
// full.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: "global" } });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: "24px 20px",
          fontFamily: "system-ui, sans-serif",
          lineHeight: 1.5,
        }}
      >
        <main style={{ maxWidth: "36rem", margin: "0 auto" }}>
          <h1>Something went wrong</h1>

          <p role="alert">
            Team Tasks could not be shown at all. The details have gone to the
            owner.
          </p>

          <p>
            <button type="button" onClick={() => retry()}>
              Try again
            </button>
          </p>
        </main>
      </body>
    </html>
  );
}
