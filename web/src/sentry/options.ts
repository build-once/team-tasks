// options.ts -- the Sentry settings that are the same in all three runtimes,
// and the list of which of Sentry's own integrations are allowed to run.
//
// There are three places this app initialises Sentry, because Next.js has three
// runtimes: the browser (web/src/instrumentation-client.ts), the Node server
// (web/src/sentry/server-init.ts) and the Edge runtime that runs the Proxy
// (web/src/sentry/edge-init.ts). Everything they agree about is here, so there
// is one place to read and one place to change.
//
// EVERY "off" BELOW CITES WHERE THE DEFAULT WAS READ. Not Sentry's website --
// the installed package in web/node_modules, at the exact version in
// web/package.json. A default read from a web page is a default read about some
// other version.
//
// WHY AN ALLOW-LIST OF INTEGRATIONS AND NOT A DENY-LIST. A deny-list says "all
// of Sentry's defaults, except these". The next version adds a default and it
// is on, silently, with nobody having decided. An allow-list says "these, and
// nothing else", so a new default arrives switched off and somebody has to read
// it before it sends anything. The cost is real and worth saying: if a future
// version renames one of the names below, that integration stops running. The
// version is pinned exactly, so that cannot happen without a deliberate bump --
// and a bump is when somebody should be reading this list anyway.

import { scrubEvent, type ScrubbableEvent } from "@/lib/sentry-scrub";

/**
 * `beforeSend`, in all three runtimes.
 *
 * The whole of what this does lives in web/src/lib/sentry-scrub.ts, which has
 * no imports and is checked by scripts/sentry-scrub-check.mjs in the
 * pure-function checks job. This wrapper exists only to satisfy the SDK's
 * types: `scrubEvent` describes the fields it touches, not Sentry's full Event.
 */
export function scrubBeforeSend<E>(event: E): E {
  return scrubEvent(event as unknown as ScrubbableEvent) as unknown as E;
}

// ---------------------------------------------------------------------------
// What the SDK is told not to collect
// ---------------------------------------------------------------------------
//
// In version 11 these live under one `dataCollection` option, and the
// resolved defaults are a plain object in the installed source:
//
//   web/node_modules/@sentry/core/build/esm/utils/data-collection/
//     resolveDataCollectionOptions.js, lines 1-13
//
// Every field in it defaults to `true` (or, for the two numbers and the one
// array, to "collect everything"). It is worth reading that object once: the
// SDK's out-of-the-box behaviour is to collect cookies, both directions of HTTP
// headers, all four kinds of request and response body, URL query parameters,
// database query data, and the local variables of every stack frame. For this
// app, those are respectively the session cookie, the session cookie again, the
// task text somebody typed, the filter on the My tasks page, the row Postgres
// refused, and whatever variable the token was in.
export const DATA_COLLECTION = {
  // Default: true. Stops the SDK filling in `user.*` by itself -- which
  // includes the caller's IP address: requestdata.js line 29 reads
  // `ip: options.include?.ip ?? dataCollection.userInfo`. The user id this app
  // does send is set by hand, in web/src/lib/sentry-user.ts, and it is the only
  // thing about a person that goes.
  userInfo: false,

  // Default: true. The Supabase session cookie is a working sign-in.
  cookies: false,

  // Default: { request: true, response: true }. The one exception in this whole
  // object: the user-agent string is kept, because it is where Sentry gets the
  // browser and the operating system from, and docs/plan.md allows "browser and
  // operating-system details". Every other header -- Cookie, Authorization,
  // Referer -- is replaced with "[Filtered]" by the SDK
  // (@sentry/core/build/esm/utils/data-collection/filterKeyValueData.js, line
  // 28) and then dropped altogether by scrubEvent.
  httpHeaders: { request: { allow: ["user-agent"] }, response: false },

  // Default: all four of incomingRequest, outgoingRequest, incomingResponse,
  // outgoingResponse. An empty array collects none, which the type's own
  // comment says: "an empty array (`[]`) disables body collection"
  // (@sentry/core/build/types/types/datacollection.d.ts, lines 45-50). A
  // request body here is the form somebody just submitted -- the task text, the
  // address they were inviting, the password they were setting.
  httpBodies: [],

  // Default: true. `?filter=`, `?rename=`, `?moved=` on this app's own pages,
  // and on a Supabase request the filter itself.
  urlQueryParams: false,

  // Default: { document: true, variables: true }. There is no GraphQL in this
  // app and no GraphQL integration is allowed to run, so this changes nothing
  // today. It is written down so that the day somebody adds one, the answer is
  // already no.
  graphQL: { document: false, variables: false },

  // Default: { inputs: true, outputs: true }. THE VALUE IS UNCHANGED AND THE
  // REASON IS NOT (issue #179). This used to say docs/plan.md put an AI helper
  // under "deliberately not in the first version", which made it read as a
  // precaution about something that did not exist -- and a reader who believed
  // that is a reader who might relax it.
  //
  // It is a live control from 2026-10-07. "Suggest subtasks" is in the plan and
  // built (issue #183): supabase/functions/suggest-subtasks sends one task's
  // title to Anthropic's Claude API and offers back up to five suggestions.
  // `inputs` here IS that task title, which is free text somebody typed and
  // which docs/plan.md's appendix marks sensitive; `outputs` is the reply. The
  // plan's list of what may never reach an error report names task text first.
  //
  // Nothing in this app would send one today in any case -- the call is made by
  // server code in a Supabase function, which has no Sentry SDK in it, and
  // web/src/lib/suggestions.ts explains why the page that reads the answer
  // reports nothing either. This option is the answer for the day somebody adds
  // an AI call where the SDK IS watching.
  genAI: { inputs: false, outputs: false },

  // Default: true. "bound query parameters, data payloads for write
  // operations, and returned result data" -- which for this app is the task
  // text, the team name and the invited address.
  databaseQueryData: false,

  // Default: true. No queues here either.
  queues: false,

  // Default: true, and this is the one that would hurt most. Local variables
  // are, by name and value, whatever the function was holding: the row being
  // inserted, the token being hashed, the address being invited. The type's own
  // note is worth reading -- filtering them BY NAME does not work after
  // bundling, because "`password` becomes `a`". So the answer is none, not
  // some.
  stackFrameVariables: false,

  // Default: 5. Five lines of source either side of each stack frame. That is
  // this app's own code rather than anybody's personal data, so it is the
  // mildest thing in this object -- but docs/plan.md lists what may be sent and
  // source code is not on the list, so it is nought.
  frameContextLines: 0,
};

/**
 * The maximum number of breadcrumbs kept.
 *
 * Default: 100 (@sentry/core/build/esm/breadcrumbs.js, line 7). Zero is not
 * merely "keep none at the end" -- `addBreadcrumb` reads this option and
 * returns on line 13, `if (maxBreadcrumbs <= 0) return;`, before the breadcrumb
 * is handed to `beforeBreadcrumb` or stored on the scope. So a DOM breadcrumb
 * carrying a task's text is never built, not built and then dropped.
 *
 * The issue allows a kind of breadcrumb only if the installed source shows it
 * cannot carry task text, an address, a team name or a token. None of the five
 * kinds passes that test:
 *
 *   console  -- `arguments: args`, the console call's arguments verbatim
 *               (@sentry/core/build/esm/integrations/console.js,
 *               addConsoleBreadcrumb)
 *   dom      -- the text and attributes of the element that was clicked, which
 *               on the My tasks page is a task
 *   fetch    -- the URL called, which for Supabase carries the filter
 *   xhr      -- the same
 *   history  -- the addresses navigated between, which includes
 *               /invite/<token>
 *
 * So: none, and the integrations that make them are not in the lists below
 * either.
 */
export const MAX_BREADCRUMBS = 0;

// ---------------------------------------------------------------------------
// Which integrations may run
// ---------------------------------------------------------------------------
//
// `integrations` accepts a function, and what it returns REPLACES the defaults
// outright -- @sentry/core/build/esm/integration.js, getIntegrationsToSetup,
// lines 27-29. So filtering the list it is handed is how an allow-list is
// expressed.

// Each list is a Set rather than an array, so the three init files all read
// `defaults.filter((i) => LIST.has(i.name))` and TypeScript works out the
// integration type from the option it is being passed to.

/**
 * The browser.
 *
 * Sentry's defaults for the browser are twelve integrations
 * (@sentry/browser/build/npm/esm/dev/sdk.js, getDefaultIntegrations, lines
 * 16-31), and @sentry/nextjs adds two more
 * (@sentry/nextjs/build/esm/client/index.js, lines 83-101). The eight kept:
 */
export const CLIENT_INTEGRATIONS: ReadonlySet<string> = new Set([
  "EventFilters", // drops noise Sentry knows about, such as a browser extension's errors
  "FunctionToString", // makes a wrapped function print as the original
  "GlobalHandlers", // window.onerror and onunhandledrejection -- without this almost nothing is caught
  "BrowserApiErrors", // errors thrown inside a setTimeout or an event listener
  "LinkedErrors", // follows an error's `cause` chain, so the real failure is in the report
  // Dedupe STAYS HERE, and is removed from the two server lists below. The
  // difference is not a compromise, it is the reason: a browser is ONE
  // person's. Deduplicating consecutive identical errors in a single tab can
  // only ever merge one person's error with their own, which is what Dedupe is
  // for -- a render loop or a repeated failing click would otherwise send the
  // same error hundreds of times and spend the free plan's event quota on it.
  // On a server, the consecutive errors belong to DIFFERENT PEOPLE, which is
  // what made it wrong there.
  "Dedupe",
  "HttpContext", // where the browser and operating system come from. See DATA_COLLECTION above
  "NextjsClientStackFrameNormalization", // makes the stack frames name this app's files
]);

// Switched off in the browser, and why, each one a default until this list:
//
//   Breadcrumbs     the five kinds above. See MAX_BREADCRUMBS.
//   Console         turns every console call into a breadcrumb, arguments and all.
//   CultureContext  the locale and the timezone. Not in docs/plan.md's list.
//   BrowserSession  sends a session envelope per page load, for release-health
//                   numbers. It is not an error report, and docs/plan.md's
//                   "Analytics: stays at none" is the nearest decision to it.
//   ConversationId  only ever tags generative-AI spans. There are none.
//   BrowserTracing  performance tracing. Switched off by name as well as by
//                   leaving tracesSampleRate unset, because the integration
//                   instruments fetch and history whether or not a span is
//                   ever sampled.

/**
 * The Node server.
 *
 * Sentry's Node defaults are twenty integrations
 * (@sentry/node/build/esm/sdk/index.js, getBaseDefaultIntegrations, lines
 * 26-54, plus getErrorIntegrations), and @sentry/nextjs adds two more. The
 * database and AI integrations are NOT among them, because they are only added
 * `hasSpansEnabled(options) ? getTracingIntegrations() : []` (same file, line
 * 62) and tracing is off -- which is the only reason there is no Postgres
 * integration here turning every query into a span with its parameters.
 */
export const SERVER_INTEGRATIONS: ReadonlySet<string> = new Set([
  "EventFilters",
  "FunctionToString",
  "LinkedErrors",
  // NO "Dedupe" HERE, deliberately. See the block below the list.
  "NodeSystemError", // names the syscall behind an ENOENT or ECONNREFUSED
  "OnUncaughtException",
  "OnUnhandledRejection",
  "Context", // the operating system and the Node version. docs/plan.md allows both
  "DistDirRewriteFrames", // makes server stack frames name this app's files
]);

// Switched off on the server, and why:
//
//   Dedupe            IT DOES NOT LOOK AT WHO THE ERROR BELONGS TO, and on a
//                     server that is the whole problem. It decides by the
//                     exception's type and value, the fingerprint and the stack
//                     frames -- @sentry/core/build/esm/integrations/dedupe.js,
//                     `_shouldDropEvent` at line 27 and `_isSameExceptionEvent`
//                     at lines 59-75. `event.user` does not appear in that file
//                     at all. So two people hitting the same broken page one
//                     after another are reported as one, and docs/plan.md's
//                     reason for sending a user id -- "Tells the owner whether
//                     one person or everyone is hitting an error" -- is defeated
//                     in the direction that matters.
//
//                     This is not a theory. It cost a real report: on 6 October
//                     three visits to a test page threw the same message and
//                     only two events arrived, the middle one dropped. The same
//                     three visits with a timestamp in each message produced
//                     three events. See evidence/build-it-18-sentry.md sections
//                     11 to 14.
//
//                     ALSO WORTH KNOWING: line 22 is
//                     `return previousEvent = currentEvent;`, so the baseline
//                     only moves when an event SURVIVES. A dropped event is not
//                     the new baseline, which is why the drop is not limited to
//                     one repeat.
//
//                     WHAT REMOVING IT COSTS: duplicate events against the free
//                     plan's quota, whose limits docs/costs.md records as not
//                     confirmed. Sentry's own server-side grouping still
//                     collapses repeats into ONE ISSUE, so what grows is the
//                     event count, not the number of things to read. Paying
//                     quota to know how many people are affected is the right
//                     way round for this app.
//
//   RequestData       headers, cookies and query strings. @sentry/nextjs'
//                     captureRequestError puts EVERY request header, the Cookie
//                     among them, onto the scope
//                     (@sentry/nextjs/build/esm/common/captureRequestError.js);
//                     this is the integration that would copy them onto the
//                     event. Without it they stay on the scope and are never
//                     sent.
//   LocalVariablesAsync  local variable values. See stackFrameVariables above.
//   ContextLines      five lines of this app's source per frame.
//   Console           console calls as breadcrumbs.
//   Http              spans and breadcrumbs for HTTP traffic. An outgoing
//                     request from this app is a Supabase request, and its URL
//                     carries the filter -- so this is one of the places task
//                     text could have left.
//   NodeFetch         the same, for global fetch, which is what @supabase/ssr
//                     actually uses.
//   Modules           the list of every installed package and its version.
//   ChildProcess      reports a child process exiting oddly. There are none.
//   WorkerThreads     the same, for worker threads.
//   ProcessSession    a session envelope per server process.
//   ConversationId    generative-AI spans.
//   Express, Fastify, Hapi, Hono, Koa
//                     error handlers for five frameworks this app does not use.
//   NextjsUseCache    instruments Next.js' "use cache". Tracing is off, so it
//                     would produce nothing; left out rather than left to it.

/**
 * The Edge runtime, which is where web/src/proxy.ts runs.
 *
 * Its defaults are eight (@sentry/vercel-edge/build/esm/index.js,
 * getDefaultIntegrations), plus DistDirRewriteFrames from @sentry/nextjs.
 */
export const EDGE_INTEGRATIONS: ReadonlySet<string> = new Set([
  "EventFilters",
  "FunctionToString",
  "LinkedErrors",
  // NO "Dedupe" HERE either, for exactly the reason given for the server list
  // above: the Proxy runs on every request, for everybody, so consecutive
  // identical errors here belong to different people too.
  "DistDirRewriteFrames",
]);

// Switched off on the edge, and why:
//
//   Dedupe          as on the server, and for the same reason: it does not look
//                   at the user. The Proxy refreshes everybody's session, so a
//                   run of identical errors here is a run of different people.
//   RequestData     as on the server: headers, cookies, query strings.
//   WinterCGFetch   spans and breadcrumbs for fetch in the edge runtime. The
//                   Proxy's own fetch calls are Supabase calls.
//   Console         console calls as breadcrumbs.
//   ConversationId  generative-AI spans.

// ---------------------------------------------------------------------------
// The tag that says where a report came from
// ---------------------------------------------------------------------------

/**
 * `production`, `preview`, `development`, or `unknown`.
 *
 * Vercel sets `VERCEL_ENV` on the server and exposes `NEXT_PUBLIC_VERCEL_ENV`
 * to the browser. The name has to be passed in rather than looked up here:
 * Next.js only replaces `process.env.NEXT_PUBLIC_*` with its value when the
 * reference is written out statically, which is the same reason
 * web/src/lib/env.ts writes each of its names out twice.
 *
 * UNVERIFIED, and it matters for the browser half: nothing in this repository
 * can show that this Vercel project exposes `NEXT_PUBLIC_VERCEL_ENV`. If it
 * does not, a browser report is tagged `unknown` while a server report from the
 * same deployment is tagged correctly. The Vercel dashboard is the only place
 * that settles it.
 */
export function deploymentTag(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? "unknown" : trimmed;
}
