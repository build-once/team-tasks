// The settings this app cannot run without, read once and checked here.
//
// Two of them are needed everywhere. A third, NEXT_PUBLIC_SENTRY_DSN, is needed
// only when Vercel builds for Production or Preview -- see the bottom of this
// file, which explains why that one is conditional and the other two are not.
//
// Why this file exists: the first two used to be read as
// `process.env.NEXT_PUBLIC_SUPABASE_URL!` in three places. The `!` tells
// TypeScript "trust me, this is set" -- it checks nothing at all. With the
// setting missing, the app built happily and then handed `undefined` to the
// Supabase client, which failed later with a message about an invalid URL and
// never mentioned the setting that was actually missing. A build that succeeds
// and an app that cannot work is the worst of the options.
//
// IMPORTANT -- why each name is written out in full below, twice.
// Next.js replaces `process.env.NEXT_PUBLIC_*` with the literal value at build
// time, but only when the reference is written out statically. The
// version-matched docs are explicit that a dynamic lookup is not inlined:
//
//     "Note that dynamic lookups will _not_ be inlined, such as:
//      const varName = 'NEXT_PUBLIC_ANALYTICS_ID'
//      setupAnalyticsService(process.env[varName])"
//
//     web/node_modules/next/dist/docs/01-app/02-guides/environment-variables.md
//
// So a tidier-looking `readSetting("NEXT_PUBLIC_SUPABASE_URL")` that did
// `process.env[name]` inside would silently become `undefined` in the browser
// bundle and break the client. The name is therefore passed separately, as a
// string for the error message, and the `process.env.X` reference stays static.

function required(name: string, value: string | undefined): string {
  // Whitespace counts as empty. A setting of " " is a mistake, not a value, and
  // it would otherwise sail through a plain `!value` check having been typed
  // into a dashboard field by accident.
  if (value === undefined || value.trim() === "") {
    const what = value === undefined ? "is not set" : "is empty";
    throw new Error(
      `Setting ${name} ${what}.\n\n` +
        `The app cannot run without it, so this build was stopped rather than ` +
        `producing something that would fail later with a confusing message.\n\n` +
        `Set it in web/.env.local for local work, or in the host's environment ` +
        `settings for a deployed build. docs/environments.md lists every ` +
        `setting and where each one belongs.\n\n` +
        `Both of this app's settings are PUBLIC and reach the browser. Never ` +
        `put a secret key in either of them.`,
    );
  }
  return value;
}

export const SUPABASE_URL = required(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);

export const SUPABASE_PUBLISHABLE_KEY = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

// ---------------------------------------------------------------------------
// The error-reporting address (issue #157)
// ---------------------------------------------------------------------------
//
// NEXT_PUBLIC_SENTRY_DSN. It is PUBLIC, like the two above and for the same
// kind of reason: it identifies a project to send reports to, it travels in the
// browser bundle, and it grants nothing. docs/plan.md says so in as many words
// -- "the DSN, identifies the project and travels in the browser: it is public,
// like the Supabase publishable key, and it is not a secret". It is not written
// down in this repository all the same, because the value belongs to one
// account and this file holds names.
//
// WRITTEN OUT STATICALLY, for the reason given at the top of this file: a
// dynamic lookup would not be replaced with the value, and the browser half of
// the error reporting would quietly never start.
//
// EMPTY IS A VALID ANSWER, on purpose. With no DSN, nothing is sent and nothing
// breaks: web/src/instrumentation-client.ts and the two files beside it return
// before calling `Sentry.init` at all. That is what makes local development
// work without anybody setting anything, and it is also what the next function
// exists to stop being true of a real deployment.
export const SENTRY_DSN = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").trim();

// The two Vercel environments where a missing DSN is a mistake rather than a
// choice. Vercel sets VERCEL_ENV on the machine doing the build; it is read
// here rather than inlined, because it has no NEXT_PUBLIC_ prefix and so never
// reaches the browser -- where it would be `undefined` and this check would
// pass for the wrong reason.
const MUST_HAVE_A_DSN: ReadonlyArray<string> = ["production", "preview"];

function requireSentryDsnWhereItMatters(): void {
  const where = (process.env.VERCEL_ENV ?? "").trim().toLowerCase();

  // Local work, and the CI build, which sets no VERCEL_ENV. Nothing to insist
  // on: an app with no error reporting still works, it just reports nothing.
  if (!MUST_HAVE_A_DSN.includes(where)) return;
  if (SENTRY_DSN !== "") return;

  throw new Error(
    `Setting NEXT_PUBLIC_SENTRY_DSN is not set, and VERCEL_ENV is "${where}".\n\n` +
      `A Production or Preview build without it produces an app that cannot ` +
      `report its own errors, and nothing afterwards would say so -- the app ` +
      `would look fine and the owner would hear about a breakage from a ` +
      `volunteer instead of from Sentry. So this build was stopped here ` +
      `rather than succeeding quietly.\n\n` +
      `Set NEXT_PUBLIC_SENTRY_DSN in the Vercel project's environment ` +
      `settings, for Production and for Preview. The value is the project's ` +
      `DSN from Sentry. It is PUBLIC -- it reaches the browser, it identifies ` +
      `the project and it grants nothing -- so it is not a secret, but it is ` +
      `still not written down in this repository. docs/environments.md lists ` +
      `every setting and where each one belongs.\n\n` +
      `Local work needs nothing: with no DSN, no report is sent and the app ` +
      `works normally.`,
  );
}

// Importing this module is what runs the first two checks above, because those
// two constants are initialised at import time. next.config.ts calls this so
// that the failure happens at the very start of `next build` and `next dev`,
// with a message naming the setting, instead of somewhere deep in a page
// render. The DSN check is a call rather than a constant for the same reason in
// reverse: it must run at build time, where VERCEL_ENV exists, and must NOT
// throw at run time inside a page -- a missing report is a problem to fix
// before the deploy, not a reason to take the app down after it.
export function assertSettingsPresent(): void {
  void SUPABASE_URL;
  void SUPABASE_PUBLISHABLE_KEY;
  requireSentryDsnWhereItMatters();
}
