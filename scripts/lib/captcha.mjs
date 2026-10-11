// captcha.mjs -- Cloudflare's dummy CAPTCHA token, in ONE place, imported by
// every file in this repository that signs in.
//
// Build it 25 part 1, issue #284. THE OWNER'S DECISION J, taken on 11 October
// 2026, and it decided the SHAPE as well as the change: "one exported constant
// that every test and script imports", not nine copies of a literal.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS AT ALL
// ---------------------------------------------------------------------------
//
// Every automated sign-in in this project posts to
// `/auth/v1/token?grant_type=password` with `{email, password}` and nothing
// else -- nine files, counted in docs/rate-limits.md section 4:
// web/tests/staging.mjs, which web/tests/access-rules.test.mjs is built on and
// which runs against staging in CI on every pull request, and eight scripts
// under scripts/staging/.
//
// Switch CAPTCHA on at staging and all nine stop working, and the first symptom
// is a red check on a pull request that has nothing to do with sign-in.
//
// Cloudflare publishes keys for exactly this. From
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/, read
// 2026-10-11:
//
//   "Use dummy sitekeys and secret keys to test your Turnstile implementation
//    without triggering real challenges that would interfere with automated
//    testing suites."
//   "Test sitekeys generate a dummy token: XXXX.DUMMY.TOKEN.XXXX"
//   "Test secret keys: Only accept the dummy token, reject real tokens."
//   "Production secret keys: Only accept real tokens, reject dummy tokens."
//
// They work only as a MATCHED PAIR. Staging's Auth settings get a dummy SECRET
// key, by hand, and these requests send the dummy TOKEN. A real secret on
// staging would refuse this token; a dummy secret on production would refuse
// every real visitor. docs/rate-limits.md section 3 is the order.
//
// ---------------------------------------------------------------------------
// WHY ONE CONSTANT AND NOT NINE LITERALS
// ---------------------------------------------------------------------------
//
// The owner's reason, and it is the better half of decision J: nine copies of
// one line is the shape evidence/build-it-16-suspend-functions.md already
// records about `checkSuspension` -- "a copy that drifts is a script that fails
// for a reason that has nothing to do with what it is testing" -- and the thing
// being copied here is a magic string out of somebody else's documentation,
// which is the worst kind of value to have nine of. One constant also gives the
// repository one place to grep the day Cloudflare changes it.
//
// ---------------------------------------------------------------------------
// WHY IT LIVES HERE, WHICH DECISION J LEFT OPEN
// ---------------------------------------------------------------------------
//
// docs/rate-limits.md named this as "the one loose end decision J leaves": the
// obvious home is web/tests/staging.mjs, and the eight scripts under
// scripts/staging/ do not import from web/tests/ today.
//
// So it is in scripts/lib/, which is a folder that already exists for exactly
// this -- scripts/lib/secrets.mjs is shared script code -- and which BOTH sides
// can reach with a plain relative path: `../lib/captcha.mjs` from
// scripts/staging/, and `../../scripts/lib/captcha.mjs` from web/tests/. That
// is the arrangement in which neither side has to import from the other's
// folder, and nothing about web/ depends on scripts/ at build time: web/tests/
// is not part of `next build`.
//
// NO PACKAGE, nothing read from the environment, nothing sent anywhere. This
// file is three constants and a function.

/**
 * The token a Cloudflare TEST sitekey produces, and the only token a Cloudflare
 * TEST secret key accepts.
 *
 * NOT A SECRET, and it never was: Cloudflare publishes it on the page cited
 * above. It is a fixed, public, documented value, which is why it is committed
 * here rather than held as a GitHub secret -- decision J, and row 8 of
 * docs/rate-limits.md section 3 says in as many words that GitHub needs no
 * setting for it.
 */
export const DUMMY_CAPTCHA_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/**
 * Where the token goes in a sign-in body.
 *
 * Read off the installed client rather than recalled: `signInWithPassword`
 * builds `{ email, password, gotrue_meta_security: { captcha_token:
 * options?.captchaToken } }` --
 * web/node_modules/@supabase/auth-js/src/GoTrueClient.ts:1243-1251. `signUp`
 * (:1046-1057) and `resetPasswordForEmail` (:4491-4500) put it in the same
 * place.
 */
export const CAPTCHA_BODY_FIELD = "gotrue_meta_security";

/**
 * The one extra field every automated sign-in in this repository now sends.
 *
 * A FUNCTION RATHER THAN A CONSTANT OBJECT, so no two callers can share and
 * mutate one object -- and so a caller spreads a fresh value into its body
 * each time, which is what the nine call sites do.
 *
 * It is sent WHETHER OR NOT CAPTCHA IS ON. With CAPTCHA off Supabase has
 * nothing to check it against and ignores it, which is what makes this change
 * safe to merge before the owner touches a dashboard: the nine files keep
 * working today, and keep working after staging is switched on.
 */
export function captchaBody() {
  return { [CAPTCHA_BODY_FIELD]: { captcha_token: DUMMY_CAPTCHA_TOKEN } };
}
