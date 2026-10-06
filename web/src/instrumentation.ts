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

import type { Instrumentation } from "next";
import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry/server-init");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry/edge-init");
  }
}

// How long to wait for the report to actually leave, in milliseconds.
//
// 2000, AND THE NUMBER IS NOT INVENTED HERE -- it is the one the SDK itself
// uses for this exact situation, in two places:
//
//   * @sentry/nextjs/build/esm/common/utils/responseEnd.js, line 8:
//     `await flush(2e3)` inside flushSafelyWithTimeout.
//   * @sentry/core/build/esm/utils/flushIfServerless.js, line 16:
//     `const { timeout = 2e3 } = params;`, the default for the helper whose
//     whole job is flushing on a serverless platform.
//
// WHY SHORT AT ALL. This runs while the failing request is being finished, so
// every millisecond spent here is a millisecond the person waits for their
// error page. Two seconds is the cap, not the cost: `flush` resolves as soon as
// the queue is empty, which on a healthy connection is far quicker.
const FLUSH_TIMEOUT_MS = 2000;

// Sentry's own handler, WRAPPED so that the report is waited for.
//
// WHY WRAPPING WAS NEEDED. `Sentry.captureRequestError` queues the event and
// then starts a flush it never waits for:
//
//   waitUntil(flushSafelyWithTimeout());
//     -- @sentry/nextjs/build/esm/common/captureRequestError.js, line 29
//
// and that `waitUntil` only does something in the Edge runtime:
//
//   function vercelWaitUntil(task) {
//     if (typeof EdgeRuntime !== "string") {
//       return;
//     }
//     -- @sentry/core/build/esm/utils/vercelWaitUntil.js, lines 3-6
//
// So on the Node runtime -- which is where every page and server action in this
// app runs -- nothing awaits the send and the platform is never asked to keep
// the function alive. A serverless function that freezes after responding takes
// the in-flight report with it, and nothing anywhere says so. A reporting system
// that silently drops reports is worse than none, because it is trusted.
//
// THE SUPPORTED WAY TO FLUSH, from the installed source rather than from
// memory. `flush` is a top-level export of the SDK, and its own documentation
// describes exactly this use:
//
//   "Call `flush()` on the current client, if there is one."
//   "@param timeout Maximum time in ms the client should wait to flush its
//    event queue."
//   "@returns A promise which resolves to `true` if the queue successfully
//    drains before the timeout, or `false` if it doesn't"
//     -- @sentry/core/build/types/exports.d.ts, lines 134-142
//
// And the SDK awaits it in its own serverless path, which is the pattern being
// copied here:
//
//   if (isServerless) {
//     await flushWithTimeout(timeout);
//   }
//     -- @sentry/core/build/esm/utils/flushIfServerless.js, lines 37-39
//
// That helper detects Vercel and AWS Lambda by environment variable and awaits.
// It is never called anywhere in @sentry/nextjs -- searched the whole package --
// which is why this hook has to do it.
//
// NEXT.JS ASKS FOR THE AWAIT TOO, so this is not fighting the framework:
// "If you're running any async tasks in `onRequestError`, make sure they're
// awaited." -- web/node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/instrumentation.md
//
// THE RESULT IS DELIBERATELY NOT LOGGED. `flush` resolves to `false` on a
// timeout, and it is tempting to write that down. docs/plan.md settled it:
// "Logs: we add none of our own". A line here would also be a line about a
// request that just failed, which is the worst moment to start writing things
// down about somebody.
//
// WHAT IS STILL TRUE AFTER THIS CHANGE, said plainly: a function can be frozen
// or killed before two seconds are up, and then the report is still lost. This
// makes the loss unlikely rather than impossible.
//
// Everything Sentry's own handler does is unchanged and worth knowing -- read in
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
// does nothing: with no client, `captureException` has nowhere to send, and
// `flush` returns `false` immediately rather than waiting out the timeout
// (@sentry/core/build/esm/exports.js, lines 50-57: no client, so
// `Promise.resolve(false)`). So local development pays nothing for this.
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  Sentry.captureRequestError(error, request, context);
  await Sentry.flush(FLUSH_TIMEOUT_MS);
};
