// instrumentation.ts -- the server half of error reporting (issue #157).
//
// Two exports, both Next.js conventions
// (web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// instrumentation.md):
//
//   register         called once when a new server instance starts, and it
//                    "must complete before the server is ready to handle
//                    requests". This is where Sentry is started.
//   onRequestError   called when the Next.js server catches an error from a
//                    page, a route handler, a server action or the Proxy. This
//                    is where a server error becomes a report.
//
// THE RUNTIME SPLIT IS NOT OPTIONAL. Next.js runs this same file in both the
// Node runtime and the Edge runtime, and the two need different Sentry builds.
// `process.env.NEXT_RUNTIME` is the documented way to tell them apart (same
// page, "Specifying the runtime"), and the imports are dynamic so that each
// runtime only ever loads its own.

import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry/server-init");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry/edge-init");
  }
}

// Sentry's own handler for this hook. It is used as-is rather than wrapped,
// because what it does is exactly what is wanted and it is worth knowing in
// detail -- it is read in
// web/node_modules/@sentry/nextjs/build/esm/common/captureRequestError.js:
//
//   * it puts the request's headers onto the SCOPE, as SDK processing
//     metadata, and that includes the Cookie header. Those headers only reach
//     an event through the RequestData integration, which is NOT in this app's
//     allow-list (web/src/sentry/options.ts), so they stay on the scope and
//     are never sent. `dataCollection.cookies: false` is the second refusal and
//     scrubEvent dropping every header but the user-agent is the third.
//
//   * it sets a "nextjs" context holding `request_path`, which Next.js
//     documents as including the query string, and which in this app can be
//     /invite/<token>. web/src/lib/sentry-scrub.ts scrubs that field
//     specifically, and there is a check for it.
//
//   * it skips Next.js' own control-flow "errors" -- a redirect is not a
//     breakage and should not reach Sentry as one.
//
// If `register` never ran -- no DSN, so no `Sentry.init` -- this still runs and
// does nothing: with no client, `captureException` has nowhere to send.
export const onRequestError = Sentry.captureRequestError;
