// edge-init.ts -- error reporting in the Edge runtime (issue #157).
//
// This is where web/src/proxy.ts runs -- the file Next.js 16 calls the Proxy and
// older versions called Middleware. It runs on every request and refreshes the
// signed-in person's token, so an error here is an error nobody can sign in
// through, which makes it worth reporting.

import * as Sentry from "@sentry/nextjs";

import { SENTRY_DSN } from "@/lib/env";
import {
  DATA_COLLECTION,
  EDGE_INTEGRATIONS,
  MAX_BREADCRUMBS,
  deploymentTag,
  scrubBeforeSend,
} from "@/sentry/options";

if (SENTRY_DSN !== "") {
  Sentry.init({
    dsn: SENTRY_DSN,

    integrations: (defaults) =>
      defaults.filter((integration) => EDGE_INTEGRATIONS.has(integration.name)),

    maxBreadcrumbs: MAX_BREADCRUMBS,
    dataCollection: DATA_COLLECTION,
    beforeSend: scrubBeforeSend,

    initialScope: {
      tags: {
        deployment: deploymentTag(process.env.VERCEL_ENV),
        runtime: "edge",
      },
    },
  });
}
