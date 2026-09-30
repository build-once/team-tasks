// The two settings this app cannot run without, read once and checked here.
//
// Why this file exists: these two used to be read as
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

// Importing this module is what runs the checks above, because the two
// constants are initialised at import time. next.config.ts calls this so that
// the failure happens at the very start of `next build` and `next dev`, with a
// message naming the setting, instead of somewhere deep in a page render.
export function assertSettingsPresent(): void {
  void SUPABASE_URL;
  void SUPABASE_PUBLISHABLE_KEY;
}
