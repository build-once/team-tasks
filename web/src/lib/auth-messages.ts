// auth-messages.ts -- one plain sentence per refusal Supabase Auth can give,
// chosen from the error CODE and never from the text the service sent.
//
// Build it 25 part 1, issue #284.
//
// ---------------------------------------------------------------------------
// WHAT WAS WRONG, observed on production on 11 October 2026
// ---------------------------------------------------------------------------
//
// The owner followed a real reset link in the browser that asked for it, the
// code exchange succeeded, the new-password form loaded -- and saving the
// password was refused by Supabase with HTTP 422, error code `same_password`.
// The screen said "That link didn't work."
//
// The link had worked. It had worked perfectly. What had not worked was the
// password, for a reason the person could have fixed in five seconds if
// anybody had told them. web/src/app/auth/actions.ts sent every `updateUser`
// error down one path -- `newPasswordPath("stale")` -- because at the time the
// only cause anybody had thought of was a recovery session that had lapsed.
//
// So this file exists to make one rule true: **only a link that is really dead
// says the link did not work.** Everything else gets its own sentence.
//
// ---------------------------------------------------------------------------
// WHY THE CODE AND NEVER THE MESSAGE
// ---------------------------------------------------------------------------
//
// Every sentence below was written here. Not one is Supabase's, and that is the
// same rule `web/src/lib/teams.ts` and `supabase/functions/_shared/limits.ts`
// already keep: a message this app did not write, in this app's styling, is a
// sentence nobody here can be held to. It can change on somebody else's
// release, it can name a company, a status or a column, and it can quote the
// address that was typed.
//
// The CODE is the stable half. `@supabase/auth-js` publishes the list as a type
// -- `web/node_modules/@supabase/auth-js/src/lib/error-codes.ts`, 90 codes at
// version 2.117.2 -- and carries it on the error object itself:
//
//     class AuthError extends Error {
//       code: ErrorCode | (string & {}) | undefined
//       status: number | undefined
//     }
//
//   web/node_modules/@supabase/auth-js/src/lib/errors.ts:14-33
//
// The codes this file names, each read off that list rather than recalled:
//
//   same_password                  errors list line 66, and the 422 the owner saw
//   weak_password                  line 71, and AuthWeakPasswordError at errors.ts:347-357
//   over_email_send_rate_limit     line 73
//   over_request_rate_limit        line 72
//   captcha_failed                 line 44
//   email_address_not_authorized   line 94
//   email_address_invalid          line 95
//   signup_disabled                line 22
//   email_not_confirmed            line 48
//   otp_expired                    line 68
//   session_expired                line 16
//   session_not_found              line 15
//   refresh_token_not_found        line 17
//   bad_jwt                        line 12
//
// And one error with NO code at all, which is why `name` is read as well:
// `AuthSessionMissingError` is constructed with `undefined` for the code
// (errors.ts:134-138), so a lapsed recovery session can arrive carrying nothing
// but a name and a 400.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE DELIBERATELY DOES NOT TELL ANYBODY
// ---------------------------------------------------------------------------
//
// `email_exists` and `user_already_exists` get NO sentence of their own, and
// that is a decision rather than an omission. "That address already has an
// account" is how somebody sorts a list of addresses into accounts and
// not-accounts, one sign-up at a time -- the same reason
// `web/src/lib/password-reset.ts` has one sentence for every reset request and
// the sign-in screen will not say which half was wrong. Both codes fall through
// to the sign-up screen's existing generic sentence.
//
// `email_not_confirmed` IS told, and the difference is worth stating: Supabase
// answers it only after the password matched, so saying it reveals nothing to
// anybody who did not already hold the password.
//
// NO IMPORTS, so `scripts/auth-screens-check.mjs` can load this module with a
// plain `node` run -- the same arrangement `web/src/lib/password-reset.ts` and
// `web/src/lib/buttons.ts` use. Nothing here talks to Supabase, reads a cookie
// or renders anything.

// ------------------------------------------------------------ what came back
//
// The three fields this app is allowed to look at, pulled off whatever the
// client handed back. Everything else on an `AuthError` -- `message` above all
// -- is deliberately not read.
//
// It takes `unknown` because one caller does not hand it an error at all:
// `signIn` uses a constant `{ error: true }` for a press its page did not make
// (web/src/app/auth/actions.ts), so `true` arrives here and has to come out as
// "nothing recognised" rather than throwing.
export type AuthFailure = {
  name: string;
  status: number | null;
  code: string | null;
};

export function readAuthFailure(answer: unknown): AuthFailure {
  if (typeof answer !== "object" || answer === null) {
    return { name: "", status: null, code: null };
  }

  const bag = answer as Record<string, unknown>;

  return {
    name: typeof bag.name === "string" ? bag.name : "",
    status: typeof bag.status === "number" ? bag.status : null,
    code: typeof bag.code === "string" ? bag.code : null,
  };
}

// ----------------------------------------------------------- the sentences
//
// THIS APP'S OWN CODES, not Supabase's. The word that travels in the address
// bar is one of these, so no vendor's vocabulary ends up in a URL a person can
// see, and a code somebody types in by hand that is not on this list draws
// nothing at all -- the same property `web/src/app/invite/[token]/page.tsx`
// already has, for the same reason.
//
// Every sentence says WHAT HAPPENED and WHAT TO DO, and none of them names a
// company, a status, a code, a column or an email address.
export const REFUSAL_SENTENCES: Readonly<Record<string, string>> = {
  same_as_old: "That is the password you are already using. Choose a different one.",
  password_refused:
    "That password was refused. Try a longer one, or one you have not used anywhere else.",
  email_limit:
    "This app has sent as much email as it is allowed to for now. Wait a while and ask again.",
  too_many:
    "Too many tries from your internet connection. Wait a few minutes and try again.",
  robot_check:
    "The check that you are not a robot did not pass. Reload the page and try again.",
  address_blocked:
    "This app could not send email to that address. That is a fault in the app rather than in your address, so please tell the owner.",
  address_refused: "That email address was not accepted. Check it and try again.",
  signup_off: "New accounts are switched off at the moment.",
  confirm_first:
    "That account still needs its email address confirmed. Open the link in the email sent when it was created.",
  link_expired: "That link has expired. Ask for a new one.",
  link_dead:
    "That link did not work. It may have been used already, or it may be incomplete. Ask for a new one.",
  try_again: "That did not work. Please try again.",
};

/** Every code this app will put in a `refused=` parameter. */
export const REFUSAL_CODES: ReadonlyArray<string> = Object.keys(REFUSAL_SENTENCES);

/**
 * The sentence for a code, or null.
 *
 * Null for anything this app did not write: a missing parameter, a repeated one
 * (which arrives as an array), a word nobody here chose, a sentence somebody
 * pasted into the address bar. A page draws nothing for null, so the only words
 * that can reach a screen are the ones above.
 */
export function refusalSentence(code: unknown): string | null {
  if (typeof code !== "string") return null;
  return REFUSAL_SENTENCES[code] ?? null;
}

// ------------------------------------------------ the one rate-limit rule
//
// A 429 is a rate limit whatever code rides with it, and it may ride with none:
// `AuthRetryableFetchError` is built with `undefined` for the code
// (errors.ts:290-293). So the status is asked first, everywhere, and that is
// what makes "the rate-limit 429" in issue #284 a thing this file answers
// rather than a thing it hopes a code covers.
const TOO_MANY = "too_many";

function rateLimited(failure: AuthFailure): boolean {
  return failure.status === 429 || failure.code === "over_request_rate_limit";
}

// Codes that mean the recovery session itself is gone -- which is the ONE case
// where "that link didn't work" is the true sentence, and the case the old code
// used for everything.
const DEAD_SESSION_CODES: ReadonlyArray<string> = [
  "session_expired",
  "session_not_found",
  "refresh_token_not_found",
  "bad_jwt",
];

const DEAD_SESSION_NAMES: ReadonlyArray<string> = [
  "AuthSessionMissingError",
  "AuthInvalidJwtError",
];

function sessionGone(failure: AuthFailure): boolean {
  return (
    (failure.code !== null && DEAD_SESSION_CODES.includes(failure.code)) ||
    DEAD_SESSION_NAMES.includes(failure.name)
  );
}

// ---------------------------------------------------------------- sign in
//
// Two codes get their own sentence and everything else gets the screen's
// existing one. `invalid_credentials` is the common case and is deliberately
// NOT on the list: "that email and password don't match" is the sentence, and
// it is the sentence a rate limit used to get as well, which is what this
// changes.
//
// THE PATHS ARE BUILT HERE rather than in the action, and that is the opposite
// of the house rule in web/src/app/auth/actions.ts ("the path is an inline
// literal, like every other redirect in this file"). The reason is the check:
// which of two paths a refusal takes IS the thing issue #284 asks to be proved,
// and a decision made inside a server action cannot be called by a plain `node`
// run. So the choice lives here, where scripts/auth-screens-check.mjs calls it
// with every code in the list, and the action has one `redirect(` as it always
// had -- which is also what keeps section 2 of scripts/password-reset-check.mjs
// green, where `signIn` is the control that proves its searches are specific.
export const LOGIN_SCREEN = "/login";
export const SIGNUP_SCREEN = "/signup";

export function signInRefusedPath(answer: unknown): string {
  const failure = readAuthFailure(answer);

  if (failure.code === "captcha_failed") return refused(LOGIN_SCREEN, "robot_check");
  if (rateLimited(failure)) return refused(LOGIN_SCREEN, TOO_MANY);
  if (failure.code === "email_not_confirmed") {
    return refused(LOGIN_SCREEN, "confirm_first");
  }

  // Everything else, `invalid_credentials` included: the sentence the screen
  // has always drawn, which says nothing about whether the address has an
  // account.
  return `${LOGIN_SCREEN}?problem=1`;
}

// ---------------------------------------------------------------- sign up
//
// The screen already has two sentences of its own -- the password rule, and a
// generic one that will not say which half was wrong. This adds the refusals
// that are facts about the attempt rather than about the account.
export function signUpRefusedPath(answer: unknown): string {
  const failure = readAuthFailure(answer);

  if (failure.code === "captcha_failed") return refused(SIGNUP_SCREEN, "robot_check");
  if (rateLimited(failure)) return refused(SIGNUP_SCREEN, TOO_MANY);
  if (failure.code === "weak_password") {
    return refused(SIGNUP_SCREEN, "password_refused");
  }
  if (failure.code === "over_email_send_rate_limit") {
    return refused(SIGNUP_SCREEN, "email_limit");
  }
  if (failure.code === "email_address_not_authorized") {
    return refused(SIGNUP_SCREEN, "address_blocked");
  }
  if (failure.code === "email_address_invalid") {
    return refused(SIGNUP_SCREEN, "address_refused");
  }
  if (failure.code === "signup_disabled") return refused(SIGNUP_SCREEN, "signup_off");

  // `email_exists` and `user_already_exists` land here on purpose. See the
  // header.
  return `${SIGNUP_SCREEN}?problem=1`;
}

// ------------------------------------------------------ set a new password
//
// THE ONE THE OWNER WATCHED GO WRONG. `same_password` is the first line of the
// list below and the reason the file exists.
//
// `/reset-password?link=0` -- the dead-link screen -- is now reached by exactly
// one kind of answer: the recovery session being gone. It is spelled here as a
// literal rather than imported from web/src/lib/password-reset.ts, because that
// module has no imports and this one has none either, which is what lets a
// plain `node` run load both. scripts/auth-screens-check.mjs imports BOTH and
// requires this string to equal `newPasswordPath("stale")`, so the two copies
// cannot drift.
export const NEW_PASSWORD_SCREEN = "/reset-password";

export function newPasswordRefusedPath(answer: unknown): string {
  const failure = readAuthFailure(answer);

  if (failure.code === "same_password") {
    return refused(NEW_PASSWORD_SCREEN, "same_as_old");
  }
  if (failure.code === "weak_password") {
    return refused(NEW_PASSWORD_SCREEN, "password_refused");
  }
  if (failure.code === "captcha_failed") {
    return refused(NEW_PASSWORD_SCREEN, "robot_check");
  }
  if (rateLimited(failure)) return refused(NEW_PASSWORD_SCREEN, TOO_MANY);

  // The only sentence left that claims the link failed, and now the only answer
  // that earns it.
  if (sessionGone(failure)) return `${NEW_PASSWORD_SCREEN}?link=0`;

  // An answer nobody here recognises. It is NOT called a dead link: the honest
  // thing to say is that it did not work and to offer another go.
  return refused(NEW_PASSWORD_SCREEN, "try_again");
}

// -------------------------------------------- an emailed link being spent
//
// The confirm page's own refusals (web/src/app/auth/confirm/page.tsx). Here the
// default IS about the link, because the thing that failed is a link: the
// sentence names two possibilities and claims neither, which is the same
// technique as DEAD_LINK_MESSAGE in web/src/lib/password-reset.ts.
export const CONFIRM_SCREEN = "/auth/confirm";

export function linkRefusedPath(answer: unknown): string {
  const failure = readAuthFailure(answer);

  if (failure.code === "otp_expired") return refused(CONFIRM_SCREEN, "link_expired");
  if (failure.code === "captcha_failed") return refused(CONFIRM_SCREEN, "robot_check");
  if (rateLimited(failure)) return refused(CONFIRM_SCREEN, TOO_MANY);

  return refused(CONFIRM_SCREEN, "link_dead");
}

// ------------------------------------------------------------------ the shape
//
// One place that spells the parameter, so every screen reads the same name.
export const REFUSED_FIELD = "refused";

function refused(path: string, code: string): string {
  return `${path}?${REFUSED_FIELD}=${code}`;
}

/** Which code a path this module built carries, or null. For the check script. */
export function refusedCodeIn(path: string): string | null {
  const marker = `?${REFUSED_FIELD}=`;
  const at = path.indexOf(marker);
  if (at === -1) return null;
  return path.slice(at + marker.length);
}
