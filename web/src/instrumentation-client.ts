// instrumentation-client.ts -- error reporting in the browser (issue #157).
//
// NEXT.JS RUNS THIS FILE BY ITSELF. It is a file convention, not something
// imported: "place the file in the root of your application or inside a src
// folder", and it runs "After the HTML document is loaded, Before React
// hydration begins, Before user interactions are possible"
// (web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// instrumentation-client.md). That timing is why error reporting goes here
// rather than in a component: a component cannot catch what broke before it
// rendered.
//
// NO SENTRY WIZARD AND NO withSentryConfig. The setup is by hand, which is what
// issue #157 asks for, and it has a consequence worth stating: without
// `withSentryConfig` wrapping next.config.ts there is no source-map upload, no
// Sentry auth token and no tunnel route. docs/plan.md calls that out as the
// whole reason this adds no new secret -- "The setup wizard is not used, so no
// source maps are uploaded and there is no Sentry auth token".
//
// WHAT THIS MEANS IN PRACTICE, said plainly: a browser stack trace will name
// the built, minified file rather than the source file. That is the price of
// not uploading source maps, and it was paid on purpose.
//
// NO USER ID ON A BROWSER REPORT, and this is a real gap rather than an
// oversight. Setting one needs the signed-in person's id, and in this app the
// browser does not have it: every page is a server component, there is not one
// `"use client"` file in web/src, and web/src/lib/supabase/client.ts is not
// imported by anything. Reading the id here would mean shipping the Supabase
// client into the browser bundle for this one purpose. So a report from the
// browser carries no user, and a report from the server carries the id -- see
// web/src/lib/sentry-user.ts. Server errors are where this app's failures
// actually happen, because that is where all of its code runs.

import * as Sentry from "@sentry/nextjs";

import { SENTRY_DSN } from "@/lib/env";
import {
  CLIENT_INTEGRATIONS,
  DATA_COLLECTION,
  MAX_BREADCRUMBS,
  deploymentTag,
  scrubBeforeSend,
} from "@/sentry/options";

// With no DSN, nothing starts. That is local development, and it is deliberate:
// a laptop sends no error reports to a company's servers. A Production or
// Preview build cannot reach this state -- web/src/lib/env.ts stops the build
// with a message naming the setting.
if (SENTRY_DSN !== "") {
  Sentry.init({
    dsn: SENTRY_DSN,

    // The allow-list. See web/src/sentry/options.ts for every name, what it
    // does, and what was left out.
    integrations: (defaults) =>
      defaults.filter((integration) => CLIENT_INTEGRATIONS.has(integration.name)),

    maxBreadcrumbs: MAX_BREADCRUMBS,
    dataCollection: DATA_COLLECTION,

    // The scrub. web/src/lib/sentry-scrub.ts, checked by
    // scripts/sentry-scrub-check.mjs in the pure-function checks job.
    beforeSend: scrubBeforeSend,

    // TRACING IS OFF BY ABSENCE. `tracesSampleRate` and `tracesSampler` are
    // both left unset, and the installed option's own documentation says that
    // is what switches it off: "Tracing is enabled if either this or
    // `tracesSampler` is defined ... Set this and `tracesSampler` to
    // `undefined` to disable tracing"
    // (web/node_modules/@sentry/core/build/types/types/options.d.ts, lines
    // 220-231). Default: undefined. BrowserTracing is also kept out of the
    // allow-list above, because the integration instruments fetch and history
    // whether or not a span is ever sampled.
    //
    // SESSION REPLAY IS OFF BY ABSENCE TOO, and this one needs saying because
    // the packages are on disk: installing @sentry/nextjs also installs
    // @sentry/replay and @sentry/replay-canvas. Replay is not among the
    // browser's twelve default integrations
    // (@sentry/browser/build/npm/esm/dev/sdk.js, getDefaultIntegrations, lines
    // 16-31) and `replayIntegration()` is never called in this repository, so
    // nothing records anything. docs/plan.md forbids it by name.
    initialScope: {
      tags: {
        // Which deployment this report came from. See deploymentTag for the
        // unverified part: whether Vercel exposes this name to the browser.
        deployment: deploymentTag(process.env.NEXT_PUBLIC_VERCEL_ENV),
        runtime: "browser",
      },
    },
  });
}
