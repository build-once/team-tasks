// turnstile.ts -- the anti-robot check on the three sign-in screens: what it
// is called, what it says, and which of four states a screen is in.
//
// Build it 25 part 1, issue #284. Decided by the owner on 11 October 2026 --
// decision A (Turnstile at all), K (managed mode) and I (dummy keys on staging
// and Preview, real keys on production). docs/plan.md -> "A CAPTCHA on the
// three sign-in screens" is the plan, and docs/rate-limits.md is the inventory
// that asked for it.
//
// ---------------------------------------------------------------------------
// WHO CHECKS THE TOKEN, WHICH IS THE PART PEOPLE GET WRONG
// ---------------------------------------------------------------------------
//
// NOT THIS APP. Supabase Auth does it: "Supabase authentication has support for
// hCaptcha and Cloudflare Turnstile", and "Supabase provides you with the
// option of adding CAPTCHA to your sign-in, sign-up, and password reset forms"
// (https://supabase.com/docs/guides/auth/auth-captcha, read 2026-10-11). The
// SECRET key is pasted into each project's own Auth settings by hand and exists
// nowhere in this repository.
//
// So this app's whole part is: draw the widget, and pass the token along. The
// token travels as `options.captchaToken`, which the installed client puts in
// the body as `gotrue_meta_security: { captcha_token: ... }` --
// web/node_modules/@supabase/auth-js/src/GoTrueClient.ts:1248 for a password
// sign-in, :1053 for sign-up and :4496 for a reset request. Nothing here
// decides whether a token is good, and nothing here could.
//
// ---------------------------------------------------------------------------
// WHY A SITE KEY MAY BE EMPTY, AND WHAT THAT MEANS
// ---------------------------------------------------------------------------
//
// Empty is a valid answer, exactly as it is for NEXT_PUBLIC_SENTRY_DSN: with no
// site key no widget is drawn, no token is sent, and the screens work as they
// did before. That is what lets local work need no setting at all, and it is
// what lets this reach production before the owner has made a widget.
//
// web/src/lib/env.ts is what stops that being true of a real deployment: it
// refuses a Vercel Production or Preview build with no site key, the same way
// it already refuses one with no Sentry DSN.
//
// ---------------------------------------------------------------------------
// WHAT THE SCREEN PROMISES IF THE WIDGET CANNOT LOAD
// ---------------------------------------------------------------------------
//
// Signing in starts needing JavaScript, and nothing else on these three
// screens does. docs/plan.md says so plainly and calls it a real loss. The one
// thing required of the screens is that they SAY so and do not look broken, so
// the sentences below cover all four of the states a visitor can be in, and the
// submit button is drawn disabled rather than hidden: a button that is not
// there is a screen somebody reads as broken.
//
// NO IMPORTS, so scripts/auth-screens-check.mjs can load this module with a
// plain `node` run. Nothing here reads a setting -- the site key is read in
// web/src/lib/env.ts with the other settings, once, and handed to the component
// as a prop.

// ------------------------------------------------------------- the vendor's
//
// Cloudflare's own script, and `render=explicit` so the widget is created by
// this app's code rather than by Cloudflare scanning the page. Both read on
// 2026-10-11 from
// https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
// which gives the URL as "https://challenges.cloudflare.com/turnstile/v0/api.js"
// and the explicit form as that URL with `?render=explicit`.
//
// THIS IS THE ONLY HARD-CODED ADDRESS IN THE SIGN-IN PATH, and it is somebody
// else's: it is where a script is fetched from, not where this app lives.
// Issue #120 rule 4 is about the second kind -- "never a hard-coded localhost,
// preview or production address" -- and scripts/password-reset-check.mjs
// enforces it over the pages and the action, which is why the URL lives here
// and not on a screen. scripts/auth-screens-check.mjs asserts that this file
// holds exactly one `https://` and that it is Cloudflare's challenges host.
export const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// The field the widget creates inside the form. Cloudflare's own name: when a
// widget is in a form "an invisible input field is automatically created with
// the name cf-turnstile-response" (same page). The server action reads this
// name off the FormData, so the token reaches Supabase without this app ever
// putting it in a URL, a cookie or a log line.
export const TURNSTILE_TOKEN_FIELD = "cf-turnstile-response";

// Managed mode -- decision K. One of Cloudflare's three widget modes and the
// one its own page labels "Managed (recommended)":
// "Automatically chooses between non-interactive or checkbox challenge based on
// visitor risk level", and when it does ask, "the visitor will be prompted to
// select a box" and "There will be no images or text to decipher"
// (https://developers.cloudflare.com/turnstile/concepts/widget/, read
// 2026-10-11). Managed is what a widget does when no appearance or execution
// option is set, so there is nothing to pass -- the mode is a property of the
// widget the owner creates in Cloudflare, and this constant is here so the
// decision is written down somewhere a reader will find it.
export const TURNSTILE_MODE = "managed";

// Cloudflare's dummy sitekey, which "Always passes" with a visible widget, and
// the dummy token it produces. Both read on 2026-10-11 from
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/ --
// "Test sitekeys generate a dummy token: XXXX.DUMMY.TOKEN.XXXX".
//
// IT IS NOT A SECRET and never was: Cloudflare publishes it on that page. It is
// here so CI's build placeholder and Vercel's Preview setting come from one
// place. The matching dummy SECRET key goes in staging's Auth settings by hand
// and appears nowhere in this repository, because it is still a secret-shaped
// field even when its value is published.
export const TURNSTILE_DUMMY_SITE_KEY = "1x00000000000000000000AA";

// ----------------------------------------------------------- the four states
//
// "off"      no site key, so there is no widget and nothing to wait for. The
//            screens are exactly what they were before Build it 25.
// "waiting"  the widget is there and has not produced a token yet. The submit
//            button is disabled.
// "failed"   the script did not load, the widget errored, or its token expired
//            before the form was sent. The screen says which of those it can
//            tell and offers another go.
// "solved"   a token is in the form. The button works.
//
// A PURE FUNCTION, so every one of those four can be exercised without a
// browser -- which is the only way any of this is checkable at all.
export type TurnstileView = "off" | "waiting" | "failed" | "solved";

export function turnstileView(state: {
  siteKey: string;
  failed: boolean;
  token: string;
}): TurnstileView {
  // The site key decides first and alone. With none, a failed script load is
  // not a failure of anything -- there was no script.
  if (state.siteKey.trim() === "") return "off";

  if (state.failed) return "failed";

  // Trimmed, because an empty-ish token is no token. Cloudflare's own value is
  // a long opaque string; a widget that has not finished gives "".
  return state.token.trim() === "" ? "waiting" : "solved";
}

/** May the form be submitted? Only when there is nothing to wait for, or a token. */
export function maySubmit(view: TurnstileView): boolean {
  return view === "off" || view === "solved";
}

// --------------------------------------------------------------- the words
//
// One place, so the three screens cannot drift into saying three things about
// one check. None of them names Cloudflare, Supabase, a status or a code: a
// message this app did not write, in this app's styling, is the thing
// web/src/lib/teams.ts has a long note about.
//
// "the check that you are not a robot" rather than "CAPTCHA", because the
// second is jargon and the first is what is happening.
export const TURNSTILE_WORDS = {
  waiting:
    "There is a quick check below that you are not a robot. It usually finishes by itself.",
  failed:
    "The check that you are not a robot could not be completed. Try it again below.",
  retry: "Try the check again",
  noScript:
    "This page needs JavaScript to run a quick check that you are not a robot, and signing in needs that check. Switch JavaScript on for this site, or use a different browser.",
} as const;

// ------------------------------------------------------ reading it back off a form
//
// What the server action does with the field. `undefined` rather than `""` for
// a missing one, because that is what `options.captchaToken` expects -- the
// client spreads it into the body either way, and `undefined` is what a
// request with no CAPTCHA at all has always sent.
//
// NOTHING IS VALIDATED HERE BEYOND BEING A NON-EMPTY STRING, on purpose. Only
// Supabase's secret key can say whether a token is good, so a shape test here
// would be this app pretending to an opinion it cannot hold. A missing token is
// passed on as missing and Supabase refuses it -- which is the honest path, and
// the one that makes the refusal sentence in web/src/lib/auth-messages.ts
// reachable rather than theoretical.
export function readCaptchaToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const token = value.trim();
  return token === "" ? undefined : token;
}
