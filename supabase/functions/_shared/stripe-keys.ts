// stripe-keys.ts -- the settings Build it 27 relies on, and the startup check
// that refuses to run with the wrong one.
//
// Lesson O9, and the owner's instruction of 2026-10-14: "Add a startup check to
// the server functions: if the environment is production and the key contains
// _test_, or the environment is not production and the key contains _live_,
// refuse to run and log a clear error; never print the key itself."
//
// NO IMPORTS, like supabase/functions/_shared/limits.ts beside it, and for the
// same two reasons: the Deno tests can load it under any function's deno.json,
// and nothing here can drift with a dependency. It reads no environment of its
// own either -- every value is handed in, so a test can hand it the wrong pair
// and watch it refuse without setting a single variable.
//
// ---------------------------------------------------------------------------
// WHY A STARTUP CHECK RATHER THAN A NOTE IN A DOCUMENT
// ---------------------------------------------------------------------------
//
// Both halves of the mistake are QUIET, which is what makes them worth code:
//
//   a LIVE key on staging takes real money off real cards during a test, and
//   nothing on the screen would look different;
//   a TEST key on production lets everybody in for free, and nothing on the
//   screen would look different there either.
//
// Neither announces itself. A mismatched key produces a working-looking app
// doing the wrong thing with somebody's money, which is the exact shape of
// failure this whole repository's "unverified -- reason" habit exists for.
//
// ---------------------------------------------------------------------------
// AND IT NEVER PRINTS THE KEY, OR ANY PART OF IT
// ---------------------------------------------------------------------------
//
// Not the key, not its last four characters, not a masked version. rule 18 says
// it in general terms -- "Never shorten, mask or star out a real value:
// `sk_live_a1b2...`, `sk_...3f9` and `j••••@example.com` are all still the value
// with a hint attached" -- and this file is the one place in the project most
// tempted to do it, because a mismatch is exactly when somebody wants to see
// what they have got.
//
// What the log line says instead is the MODE it found and the MODE it wanted:
// "test" and "live" are not secrets, they are two words, and they are the whole
// of what somebody fixing this needs to know.

// ---------------------------------------------------------------------------
// EVERY STRIPE SETTING THIS APP READS, in one list
// ---------------------------------------------------------------------------
//
// The owner asked for this list by name. It is here rather than in a document
// because a list of setting names that lives only in prose is a list that goes
// stale the first time somebody renames one -- and scripts/screen-state-check.mjs
// asserts that the functions read these and no others.
//
// WHERE EACH ONE GOES is in docs/environments.md and in the pull request, not
// here: this file is about what the code reads, and a file that also claimed to
// know what a dashboard is set to would be making a claim it cannot check.
export const STRIPE_SETTINGS = {
  /** The restricted Stripe key. Supabase function secrets only, never Vercel. */
  secretKey: "STRIPE_SECRET_KEY",
  /** The webhook's own signing secret -- a DIFFERENT secret from the key above. */
  webhookSecret: "STRIPE_WEBHOOK_SECRET",
  /** The price the checkout uses AND the pricing page displays. One id, not two. */
  priceTeam: "STRIPE_PRICE_TEAM",
  /** "production" on production, anything else elsewhere. */
  environment: "APP_ENVIRONMENT",
} as const;

/**
 * The publishable key, which is the one Stripe setting that is NOT in this list
 * and must not be.
 *
 * It is public, it travels in the browser, and it lives in Vercel as
 * `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` -- the same arrangement as the Supabase
 * publishable key, the Sentry DSN and the Turnstile site key. No Edge Function
 * reads it; the web app does, and only to decide whether to draw TEST MODE.
 *
 * Named here so that a reader looking for "where is the publishable key" finds
 * the answer rather than concluding it was forgotten.
 */
export const PUBLISHABLE_KEY_SETTING = "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY";

/** The environment value that means production. Anything else is not. */
export const PRODUCTION_ENVIRONMENT = "production";

export type StripeMode = "test" | "live" | "unknown";

/**
 * Which mode a Stripe key belongs to, read off the key itself.
 *
 * Stripe's keys carry their mode in the name: `sk_test_`, `rk_test_`,
 * `pk_test_` against `sk_live_`, `rk_live_`, `pk_live_`. The owner's
 * instruction names the test for it in those terms -- "the key contains
 * `_test_`" -- so that is what this reads, rather than a prefix list that would
 * have to be kept in step with however many key types Stripe grows.
 *
 * "unknown" IS A REAL ANSWER AND IS NOT TREATED AS SAFE. An empty setting, a
 * value somebody pasted with a space in it, or a key shape nobody here has seen
 * all land here -- and the check below refuses on it, because a key whose mode
 * cannot be read is a key nobody can say is the right one. An unknown is not a
 * yes, which is the direction every other check in this project fails in.
 */
export function stripeMode(key: string): StripeMode {
  const value = key.trim();
  const isTest = value.includes("_test_");
  const isLive = value.includes("_live_");

  // Both, which is nonsense, so it is neither. Written out rather than left to
  // the order of two ifs, because "whichever I checked first wins" is how a
  // value containing both would quietly be called live or test.
  if (isTest && isLive) return "unknown";
  if (isTest) return "test";
  if (isLive) return "live";
  return "unknown";
}

/** What the environment requires, which is the other half of the comparison. */
export function requiredMode(environment: string): StripeMode {
  return environment.trim() === PRODUCTION_ENVIRONMENT ? "live" : "test";
}

export type KeyVerdict =
  | { ok: true; mode: StripeMode }
  | { ok: false; reason: "missing" | "mismatch" | "unreadable"; message: string };

/**
 * May this function run with this key, in this environment?
 *
 * Three ways to say no, and each gets its own reason so a log line can say
 * which:
 *
 *   `missing`     the setting is empty or absent. Not a mismatch -- there is
 *                 nothing to mismatch -- and the fix is different.
 *   `unreadable`  the key's mode cannot be read off it. Refused, because an
 *                 unknown is not a yes.
 *   `mismatch`    the key is readable and is the wrong one. The dangerous case,
 *                 and the one the owner's instruction is about.
 *
 * THE MESSAGE NAMES THE SETTING, THE MODE FOUND AND THE MODE WANTED, AND
 * NOTHING ELSE. No key, no fragment of one, no environment variable's value
 * beyond the two mode words.
 */
export function checkStripeKey(options: {
  key: string;
  environment: string;
  setting?: string;
}): KeyVerdict {
  const setting = options.setting ?? STRIPE_SETTINGS.secretKey;
  const key = options.key.trim();
  const wanted = requiredMode(options.environment);

  if (key === "") {
    return {
      ok: false,
      reason: "missing",
      message: `${setting} is not set. This function needs a ${wanted}-mode Stripe key and will not run without one.`,
    };
  }

  const found = stripeMode(key);

  if (found === "unknown") {
    return {
      ok: false,
      reason: "unreadable",
      message: `${setting} is set but its mode cannot be read: it contains neither _test_ nor _live_, or it contains both. Refusing to run rather than guessing. Wanted: ${wanted}.`,
    };
  }

  if (found !== wanted) {
    return {
      ok: false,
      reason: "mismatch",
      // The two sentences this check exists for, written out so that whoever
      // reads the log is told what the consequence would have been rather than
      // only that something did not match.
      message:
        found === "live"
          ? `${setting} is a LIVE key and this is not the production environment. Refusing to run: a live key here would take real money from real cards during a test. Wanted: ${wanted}.`
          : `${setting} is a TEST key and this IS the production environment. Refusing to run: a test key here would grant paid features to everybody for free. Wanted: ${wanted}.`,
    };
  }

  return { ok: true, mode: found };
}

/**
 * The answer a function sends when the key is wrong.
 *
 * 503, because the service is genuinely not able to do its job -- this is
 * plumbing, not a decision about the caller -- and the same fixed, uninformative
 * sentence whichever of the three reasons it was. A person pressing a button is
 * not the person who can fix a key, so the sentence tells them the only useful
 * thing: it is not them, and it is not working.
 *
 * THE DETAIL GOES TO THE LOG, NOT TO THE CALLER. docs/plan.md's rule about the
 * twelve fixed codes is the same one: a refusal a person cannot act on gets a
 * sentence that does not pretend they can.
 */
export const STRIPE_UNAVAILABLE_MESSAGE =
  "Payments aren't available right now.";

export const STRIPE_UNAVAILABLE_CODE = "stripe_not_configured";

export function stripeUnavailable(): Response {
  return Response.json(
    { error: STRIPE_UNAVAILABLE_MESSAGE, code: STRIPE_UNAVAILABLE_CODE },
    { status: 503 },
  );
}

/**
 * Read the key, check it, and either run the handler or refuse.
 *
 * A WRAPPER RATHER THAN A CHECK FOLLOWED BY AN `if`, for the reason
 * `withDailyLimit` and `withConsent` are wrappers: the thing that has to be
 * proved is a NEGATIVE -- that with a mismatched key, no request reaches Stripe
 * -- and a negative about an order cannot be proved by testing the pieces one
 * at a time. A test hands in a `proceed` that would call a stubbed Stripe and
 * asserts the stub was never called.
 *
 * `log` is passed in so this file does not choose a logging shape for five
 * different functions, and so a test can capture what was logged and assert the
 * key is not in it.
 */
export async function withCheckedKey(
  options: {
    key: string;
    environment: string;
    setting?: string;
    log: (message: string) => void;
  },
  proceed: (key: string) => Promise<Response>,
): Promise<Response> {
  const verdict = checkStripeKey(options);

  if (!verdict.ok) {
    options.log(verdict.message);
    return stripeUnavailable();
  }

  return await proceed(options.key.trim());
}
