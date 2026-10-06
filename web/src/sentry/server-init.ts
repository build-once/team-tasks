// server-init.ts -- error reporting in the Node server (issue #157).
//
// Loaded by web/src/instrumentation.ts, which Next.js calls once per server
// instance. It is a separate file rather than code inside `register()` so that
// the import happens only in the Node runtime: the Edge runtime has its own
// (edge-init.ts), and importing the Node SDK there would fail.

import * as Sentry from "@sentry/nextjs";

import { SENTRY_DSN } from "@/lib/env";
import {
  DATA_COLLECTION,
  MAX_BREADCRUMBS,
  SERVER_INTEGRATIONS,
  deploymentTag,
  scrubBeforeSend,
} from "@/sentry/options";

if (SENTRY_DSN !== "") {
  Sentry.init({
    dsn: SENTRY_DSN,

    integrations: (defaults) =>
      defaults.filter((integration) => SERVER_INTEGRATIONS.has(integration.name)),

    maxBreadcrumbs: MAX_BREADCRUMBS,
    dataCollection: DATA_COLLECTION,
    beforeSend: scrubBeforeSend,

    // Tracing off by absence, as in the browser. It matters more here: with
    // spans enabled, @sentry/node adds the whole of getTracingIntegrations()
    // -- Postgres, Prisma, GraphQL, Redis and the rest
    // (@sentry/node/build/esm/sdk/index.js, line 62). Those turn database
    // queries into spans, and a query in this app carries task text.
    initialScope: {
      tags: {
        deployment: deploymentTag(process.env.VERCEL_ENV),
        runtime: "server",
      },
    },
  });
}
