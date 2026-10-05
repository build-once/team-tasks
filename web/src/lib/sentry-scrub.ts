// sentry-scrub.ts -- the last thing that touches an error report before it
// leaves this app.
//
// WHY IT EXISTS. docs/plan.md, "Error reports to an outside service", lists what
// may be sent and then lists what must never be: an email address, a task's
// text, a team name, an invited person's address, a password, a sign-in token,
// an invitation token, or any key. Nothing in the Sentry SDK knows that. It
// sends an error's message and its exception values, and those are whatever the
// code happened to be holding when it broke -- a Postgres error quoting the row
// it refused, a fetch failure quoting the URL it called, a thrown string
// somebody built out of user input.
//
// So this runs on every event, as `beforeSend`, and it does two different jobs:
//
//   1. REPLACES anything shaped like an address, a key or a token inside the
//      text we do send. Replace, not mask: AGENTS.md rule 18 is explicit that
//      `cs_live_a1b2...` and `j****@example.com` are still the value with a
//      hint attached. Every match becomes a whole placeholder and the original
//      is gone.
//   2. REMOVES whole fields that the plan does not list at all -- breadcrumbs,
//      request headers, cookies, extra data, local variables in stack frames,
//      and everything about the user except the one id.
//
// Job 2 is the belt to job 1's braces. The SDK is configured not to collect any
// of it (web/src/sentry/options.ts switches each one off and says where the
// default was read), but a configuration is a thing that can be edited by
// somebody who does not know why it was that way. This file refuses the data a
// second time, at the door.
//
// IT IS PURE, AND THAT IS THE POINT. No imports, no clock, no randomness, no
// network, no `process.env`. The same event in gives the same event out, and it
// does not change the event it was handed -- it returns a new one. That is what
// lets scripts/sentry-scrub-check.mjs load this exact file and ask it hundreds
// of questions in the pure-function checks job, instead of us believing a
// comment.
//
// WHAT IT DOES NOT DO, said plainly: it cannot know that a 30-character string
// is somebody's task text. "Buy milk for Sandra Taylor, 07700 900123" contains
// no address, no key and no token, and this file will pass it through untouched.
// Keeping task text out of an error message is the job of the code that throws
// the error, and of the SDK options that stop local variables and request
// bodies being collected at all. This file is the net under that, not a
// substitute for it.

// The placeholders. Each one says what was taken out, so a report still reads
// as a sentence and the owner can tell a redaction from a value somebody typed.
export const EMAIL_REMOVED = "[email address removed]";
export const TOKEN_REMOVED = "[token removed]";
export const KEY_REMOVED = "[key removed]";
export const QUERY_REMOVED = "?[query removed]";

// The text rules, in the order they are applied. Order matters: the broad
// "any long run of token characters" rule at the end would otherwise swallow
// the start of something the earlier rules label more precisely.
const TEXT_RULES: ReadonlyArray<{ readonly find: RegExp; readonly put: string }> = [
  // A JSON Web Token. Supabase's access token and refresh token are both this
  // shape, and either one, until it expires, IS the session: three base64url
  // parts separated by dots, the first beginning `eyJ` because that is what
  // `{"` encodes to. Caught before anything else, because the dots mean the
  // last rule would only eat it in pieces and leave the rest readable.
  { find: /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g, put: TOKEN_REMOVED },

  // A Supabase API key, either kind. The publishable one is public and the
  // secret one bypasses every row-level security rule, and this rule does not
  // try to tell them apart: neither belongs in an error report, and a rule that
  // has to decide which is which is a rule that can decide wrongly.
  { find: /sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, put: KEY_REMOVED },

  // THERE IS NO RULE HERE FOR THE POSTGRES ROLE NAME, and the reason is worth
  // writing down because it looks like an omission.
  //
  // An earlier version of this file had one: the name of the role that
  // bypasses row-level security, replaced with KEY_REMOVED. It was dropped,
  // not because it was wrong but because of where this file ends up. This
  // module is imported by web/src/instrumentation-client.ts, so it is compiled
  // into the BROWSER bundle -- and .github/workflows/ci.yml's "No Supabase
  // secret key in the built bundle" step greps everything under
  // web/.next/static for exactly that string and fails the build when it finds
  // one. Verified on this branch: the first build put the literal into
  // .next/static and the scan matched it.
  //
  // Three ways out, and only one of them is honest. Weakening the scan is out
  // (AGENTS.md rule 5 forbids changing a workflow to skip a check). Spelling
  // the pattern so the literal does not appear -- `service[_-]role` -- would
  // get past the scan while leaving the behaviour, which is rewording to beat
  // a check and is the same rule's second half. So: the rule goes.
  //
  // What is lost, exactly: that role name is NOT a credential -- it grants
  // nothing on its own -- and it is neither an address nor a token, so it was
  // never part of what issue #157 asked this function to mask. A real secret
  // key is still caught, by the rule above, whose own pattern does not contain
  // the scanned string. The owner may still want the name masked; that is
  // filed rather than decided here.

  // An email address. Deliberately greedy about the local part, because the
  // addresses this app actually holds use plus-addressing
  // (`something+alice@example.com`) and a rule that stopped at the `+` would
  // leave half of it behind.
  { find: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, put: EMAIL_REMOVED },

  // Any run of 40 or more base64url characters. This is the one that catches an
  // invitation token, which is the credential this app is most likely to be
  // holding when something breaks: 32 random bytes, base64url-encoded with the
  // padding stripped, which is 43 characters of exactly this alphabet
  // (supabase/functions/invite-member/index.ts, makeToken). It also catches the
  // 64-character hex of a token hash.
  //
  // FORTY IS CHOSEN, NOT ROUNDED. A uuid is 36 characters, so a team id, a task
  // id and the user id this app does send all stay readable -- and they need to,
  // because "which task" is most of what makes a report useful. One character
  // fewer than 40 and every uuid in every message would come out as
  // "[token removed]"; a few characters more and a shorter token would get
  // through. The two lengths, 36 and 43, are what the number sits between.
  { find: /[A-Za-z0-9_-]{40,}/g, put: TOKEN_REMOVED },
];

/**
 * Put every rule through one piece of text.
 *
 * Idempotent: the placeholders contain no address, no key and no run of 40
 * token characters, so scrubbing an already-scrubbed string changes nothing.
 * That matters because the same string can reach this file twice -- once as an
 * exception value and once inside the message built from it.
 */
export function scrubText(value: string): string {
  if (typeof value !== "string" || value === "") return value;

  let out = value;
  for (const rule of TEXT_RULES) {
    // A fresh RegExp per call, so the /g flag's lastIndex cannot carry from one
    // call to the next. Sharing a global regex across calls is the classic way
    // for a "pure" function to start giving different answers to the same
    // question, and this one is checked on hundreds of inputs in a row.
    out = out.replace(new RegExp(rule.find.source, rule.find.flags), rule.put);
  }
  return out;
}

/**
 * The same, for something that is a web address.
 *
 * Two things happen that `scrubText` alone would not do:
 *
 *   * THE QUERY AND THE FRAGMENT GO, ALL OF THEM. Not filtered, not inspected --
 *     removed. Every parameter this app puts in an address is either an id or a
 *     value somebody typed (`?rename=`, `?filter=`, `?problem=`), and the two
 *     credentials that travel by link -- a Supabase password-reset code and a
 *     magic-link token -- arrive in exactly these two places. Sentry does not
 *     do this for us: `@sentry/browser`'s HttpContext integration sets the URL
 *     with the comment "The URL isn't gated by `dataCollection`, same as on the
 *     server" (web/node_modules/@sentry/browser/build/npm/esm/dev/integrations/
 *     httpcontext.js), so the setting that filters query parameters does not
 *     reach it.
 *
 *   * THEN THE PATH GOES THROUGH THE TEXT RULES, because in this app the path
 *     itself can be a credential: an invitation link is
 *     `/invite/<43-character token>`, and that token is the whole of what stops
 *     a stranger joining somebody's team. It comes out as
 *     `/invite/[token removed]`.
 */
export function scrubUrl(value: string): string {
  if (typeof value !== "string" || value === "") return value;

  const cut = value.search(/[?#]/);
  const withoutQuery = cut === -1 ? value : `${value.slice(0, cut)}${QUERY_REMOVED}`;
  return scrubText(withoutQuery);
}

// ---------------------------------------------------------------------------
// The event
// ---------------------------------------------------------------------------
//
// The shapes below are written out here rather than imported from
// @sentry/core, for one reason: this file has no imports, so the check script
// can load it with nothing installed and nothing mocked. They name only the
// fields this file reads or removes; `[key: string]: unknown` carries the rest
// through untouched.

export interface ScrubbableFrame {
  readonly [key: string]: unknown;
}

export interface ScrubbableException {
  type?: string;
  value?: string;
  stacktrace?: { frames?: ScrubbableFrame[]; [key: string]: unknown };
  [key: string]: unknown;
}

export interface ScrubbableEvent {
  message?: string;
  logentry?: { message?: string; params?: unknown[]; [key: string]: unknown };
  transaction?: string;
  exception?: { values?: ScrubbableException[]; [key: string]: unknown };
  breadcrumbs?: unknown;
  request?: { url?: string; headers?: Record<string, unknown>; [key: string]: unknown };
  user?: { id?: unknown; [key: string]: unknown };
  extra?: unknown;
  contexts?: Record<string, unknown>;
  [key: string]: unknown;
}

// The one request header that is kept. docs/plan.md allows "browser and
// operating-system details", and this is where they come from -- Sentry works
// out the browser and the operating system from the user-agent string. Matched
// without regard to case because the two places it arrives from disagree:
// @sentry/browser sends "User-Agent" and the server's headersToDict lowercases
// every name.
const KEPT_REQUEST_HEADER = "user-agent";

// A context that is dropped whole. `cultureContextIntegration` reports the
// browser's locale and timezone, and neither is in the plan's list of what may
// be sent. The integration is not switched on (web/src/sentry/options.ts), so
// this is the second refusal, not the first.
const DROPPED_CONTEXTS: ReadonlyArray<string> = ["culture"];

function scrubFrame(frame: ScrubbableFrame): ScrubbableFrame {
  // `vars` is the local variables of that stack frame, by name and value. In
  // this app that is the row that was being written, the title somebody typed,
  // the token that was being hashed. The SDK is told not to collect them
  // (dataCollection.stackFrameVariables), and they are removed here as well.
  const { vars: _vars, ...rest } = frame as { vars?: unknown };
  void _vars;
  return rest as ScrubbableFrame;
}

function scrubException(value: ScrubbableException): ScrubbableException {
  const out: ScrubbableException = { ...value };

  if (typeof out.type === "string") out.type = scrubText(out.type);
  if (typeof out.value === "string") out.value = scrubText(out.value);

  if (out.stacktrace && typeof out.stacktrace === "object") {
    const frames = out.stacktrace.frames;
    out.stacktrace = {
      ...out.stacktrace,
      ...(Array.isArray(frames) ? { frames: frames.map(scrubFrame) } : {}),
    };
  }

  return out;
}

/**
 * Everything this app sends to Sentry goes through here first.
 *
 * Returns a NEW event. The one it was handed is not changed, which is half of
 * what "pure" means and the half that is easy to lose by accident.
 */
export function scrubEvent(event: ScrubbableEvent): ScrubbableEvent {
  if (event === null || typeof event !== "object") return event;

  const out: ScrubbableEvent = { ...event };

  // ---- The text we do send -------------------------------------------------
  if (typeof out.message === "string") out.message = scrubText(out.message);

  if (out.logentry && typeof out.logentry === "object") {
    const logentry = { ...out.logentry };
    if (typeof logentry.message === "string") logentry.message = scrubText(logentry.message);
    // `params` are the values substituted into that message. They are the
    // values, so there is nothing to scrub them down to.
    delete logentry.params;
    out.logentry = logentry;
  }

  // The transaction name. On a server error @sentry/nextjs sets it to
  // "<method> <route file path>" -- "/invite/[token]", the file name, not a
  // token -- but it is text from outside this file, so it is treated as such.
  if (typeof out.transaction === "string") out.transaction = scrubText(out.transaction);

  if (out.exception && typeof out.exception === "object" && Array.isArray(out.exception.values)) {
    out.exception = { ...out.exception, values: out.exception.values.map(scrubException) };
  }

  // ---- The fields that are not sent at all ---------------------------------
  //
  // BREADCRUMBS, ALL OF THEM, ALWAYS. The issue asks for none unless a kind can
  // be shown to be safe, and none can: a DOM breadcrumb carries the text of the
  // element that was clicked, which on the My tasks page is a task's text; a
  // fetch breadcrumb carries the URL, which for Supabase carries the filter in
  // its query string; a console breadcrumb carries whatever was logged. The
  // SDK is also told `maxBreadcrumbs: 0`, which makes `addBreadcrumb` return
  // before it stores anything (@sentry/core/build/esm/breadcrumbs.js line 13),
  // so this line should have nothing to delete. "Should" is why it is here.
  delete out.breadcrumbs;

  // `extra` is free-form: whoever wrote the capture decided what went in it.
  delete out.extra;

  out.request = scrubRequest(out.request);
  if (out.request === undefined) delete out.request;

  out.user = scrubUser(out.user);
  if (out.user === undefined) delete out.user;

  if (out.contexts && typeof out.contexts === "object") {
    out.contexts = scrubContexts(out.contexts);
  }

  return out;
}

function scrubRequest(request: ScrubbableEvent["request"]): ScrubbableEvent["request"] {
  if (!request || typeof request !== "object") return undefined;

  // Built up from nothing rather than filtered down, so a field the SDK adds in
  // a later version is absent by default instead of present until noticed.
  const out: NonNullable<ScrubbableEvent["request"]> = {};

  if (typeof request.url === "string") out.url = scrubUrl(request.url);

  // Cookies are the session. Headers carry the cookie and the referrer. Query
  // strings and bodies carry what somebody typed. None of them is named in the
  // plan, so none of them is copied across -- including anything not listed
  // here, which is the reason for building up rather than deleting.
  if (request.headers && typeof request.headers === "object") {
    for (const [name, headerValue] of Object.entries(request.headers)) {
      if (name.toLowerCase() === KEPT_REQUEST_HEADER && typeof headerValue === "string") {
        out.headers = { [name]: scrubText(headerValue) };
      }
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

function scrubUser(user: ScrubbableEvent["user"]): ScrubbableEvent["user"] {
  if (!user || typeof user !== "object") return undefined;

  // The id and nothing else. Not the email address, not the username, not the
  // ip_address -- Sentry's own User type has a field for each, and the plan
  // forbids all three. docs/plan.md: "the signed-in person's user ID -- the
  // Supabase `auth.users` id, which is not an email address".
  return typeof user.id === "string" && user.id !== "" ? { id: user.id } : undefined;
}

function scrubContexts(contexts: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...contexts };

  for (const name of DROPPED_CONTEXTS) delete out[name];

  // @sentry/nextjs' captureRequestError puts the failing request's path into a
  // "nextjs" context, and Next.js documents that path as including the query
  // string ("resource path, e.g. /blog?name=foo" --
  // web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
  // instrumentation.md). For this app that path can also be
  // /invite/<token>, so it gets the address treatment and not the text one.
  const nextjs = out.nextjs;
  if (nextjs && typeof nextjs === "object" && !Array.isArray(nextjs)) {
    const copy = { ...(nextjs as Record<string, unknown>) };
    if (typeof copy.request_path === "string") copy.request_path = scrubUrl(copy.request_path);
    if (typeof copy.router_path === "string") copy.router_path = scrubText(copy.router_path);
    out.nextjs = copy;
  }

  return out;
}
