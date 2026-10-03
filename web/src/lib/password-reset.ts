// Forgot password: every decision the three screens make, in one file with no
// imports, so a plain `node` run can check it (scripts/password-reset-check.mjs).
//
// The screens themselves are thin on purpose. The rules in issue #120 are all
// rules about WHAT IS SAID and WHERE A PERSON IS SENT, and both of those are
// decided here rather than in a page or an action, because here they can be
// tested without a browser, an account or an email.
//
// Nothing in this file talks to Supabase, reads a cookie or renders anything.

// ---------------------------------------------------------------- the message
//
// THE ONE SENTENCE. Issue #120 rule 1: after a request the page always says
// this, whether or not the address has an account, and whether Supabase
// answered happily or with an error such as a rate limit.
//
// It is a constant, and the only place the sentence exists, because "the same
// words in both cases" is not something a reviewer can check by reading two
// branches and comparing them by eye. With one constant and one exit there are
// no two branches to compare.
//
// Why it has to be the same words: Supabase itself cannot tell us whether the
// address has an account -- its own guide says so, "When no user is associated
// with the address, Supabase Auth won't send an email, though the method still
// returns without an error" (https://supabase.com/docs/guides/auth/passwords).
// But an error CAN be told apart, and a page that says "something went wrong"
// for a rate limit and "we've sent a link" otherwise hands somebody a way to
// sort addresses into accounts and not-accounts, one request at a time.
export const RESET_SENT_MESSAGE =
  "If that address has an account, we've sent a link";

// Where the request form sends the person afterwards -- the same screen again,
// with the message above showing. One path, used for every outcome.
export const RESET_REQUESTED_PATH = "/forgot-password?sent=1";

// -------------------------------------------------------------- the two paths
//
// The page the reset link lands on, and the page the person sets a new password
// on. Both are FIXED PATHS written here, never built from anything in a link:
// a doctored link can therefore not send anybody anywhere else.
export const RESET_LANDING_PATH = "/auth/reset";
export const NEW_PASSWORD_PATH = "/reset-password";

// Where /auth/reset sends the person once it has tried the link. Two fixed
// paths, and the only thing that decides between them is whether Supabase
// accepted the link -- never anything taken from the link itself.
//
// The failed one carries no reason and no detail. A link that has expired, a
// link already used, a link from another browser and a made-up link all land on
// the same screen with the same sentence, for the same reason RESET_SENT_MESSAGE
// is one constant.
export function resetLandingPath(accepted: boolean): string {
  return accepted ? NEW_PASSWORD_PATH : `${NEW_PASSWORD_PATH}?link=0`;
}

// ------------------------------------------------------- the outcome of a try
//
// WHAT THE REQUEST SCREEN DOES WITH WHAT SUPABASE SAID: nothing. That is the
// whole content of issue #120 rule 1, so it is written as a function that takes
// the answer and ignores it, rather than as an absence of code that a later
// edit could fill in without anybody noticing.
//
// The argument is accepted and deliberately unread. scripts/password-reset-check.mjs
// hands it four different worlds -- an address with an account, an address
// without one, a rate limit, and an error of a shape nobody expected -- and
// requires one single outcome back from all four. Add a branch here and those
// checks go red, which is what "those tests fail if the messages differ" in the
// issue asks for.
export type ResetOutcome = { path: string; message: string };

export function outcomeAfterRequest(answer: unknown): ResetOutcome {
  // Taken and dropped, in one line, where it can be seen being dropped. `void`
  // rather than an underscore in the parameter name because the point is to
  // show the value arriving and going nowhere -- and because the linter is
  // right that an unused parameter is usually a mistake. Here it is the rule.
  void answer;

  return { path: RESET_REQUESTED_PATH, message: RESET_SENT_MESSAGE };
}

// --------------------------------------------------------- the password rules
//
// The same rule as sign-up, from one constant, so the two screens cannot drift
// apart. web/src/app/signup/page.tsx uses this same export for its minLength.
//
// Supabase enforces its own project minimum on top of this, and that number is
// in the project's settings, not in this repository. This check is therefore the
// app's floor, not the only floor -- and it is a real check rather than only the
// browser's `minLength`, because `minLength` is an attribute in a page that
// anybody can post around.
export const PASSWORD_MIN_LENGTH = 8;

// The one thing this app says about a password it will not accept, in one
// constant so the form and the check cannot drift into saying two things.
//
// A reason, not a judgement, and nothing about the account: the same sentence
// comes back for a password that is too short, an empty one, and a form posted
// without the field at all. The page prints this constant -- it never prints
// text taken from the query string, which is the mistake issue #45 is about.
export const PASSWORD_TOO_SHORT = `A password needs at least ${PASSWORD_MIN_LENGTH} characters.`;

// What is wrong with a proposed password, or null if nothing is.
//
// Length in characters, and no trimming: a space is a character a password may
// legitimately contain, at either end. A missing or non-string value is short by
// definition, so it gets the same answer rather than its own branch.
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return PASSWORD_TOO_SHORT;
  }

  return null;
}

// Where the new-password form sends the person. Three fixed paths:
//
//   done     the password was changed, and the recovery link signed them in, so
//            they go straight to their tasks.
//   problem  the password did not pass passwordProblem(). The form is drawn
//            again with the reason -- which is about the password they typed,
//            never about the account.
//   stale    Supabase refused the change. The usual cause is a recovery session
//            that has lapsed between opening the link and pressing the button,
//            and the honest answer is the same one a bad link gets: ask for
//            another email. No Supabase error text is ever shown.
export function newPasswordPath(
  result: "done" | "problem" | "stale",
): string {
  if (result === "done") return "/tasks";
  if (result === "problem") return `${NEW_PASSWORD_PATH}?problem=1`;
  return `${NEW_PASSWORD_PATH}?link=0`;
}

// ------------------------------------ what the new-password page may show, and
// ------------------------------------ what it must refuse to show
//
// Issue #120 rule 3: "Opening that page without a valid reset link shows nothing
// useful and changes nothing."
//
// A session on its own is NOT enough to draw the form. A recovery link creates a
// perfectly ordinary session, so "is this person signed in?" cannot tell a
// person who followed a reset link from a person who was already signed in and
// typed the address -- and the second one has not asked to set a new password at
// all. So /auth/reset leaves a marker when, and only when, Supabase has just
// accepted a reset link, and the form is drawn only when the marker and a
// session are both there.
//
// WHAT THE MARKER IS NOT: it is not a security boundary, and nothing here
// pretends otherwise. The authority to change a password is the session, which
// comes from Supabase accepting the link; the marker only decides what the
// screen says. Somebody already signed in who set this cookie by hand would be
// able to change their OWN password, which they are entitled to do anyway.
export const RESET_MARKER_COOKIE = "reset-link-used";

// How long the marker lives. Long enough to type a password, short enough that
// it is not still lying around tomorrow. The recovery session has its own,
// shorter life, set in Supabase, and that is the one that actually matters.
export const RESET_MARKER_MAX_AGE_SECONDS = 900;

// What a person sees when they reach the new-password page without a link that
// Supabase accepted. One sentence, no reason, and no form.
//
// Every way of getting here gets this: an expired link, a link already used, a
// link opened in a different browser from the one that asked, a made-up link,
// and the address typed in by hand. Telling them apart would say something about
// the account, and none of the four needs a different action from the person --
// they all need another email.
export const DEAD_LINK_MESSAGE =
  "That link has expired, has already been used, or was opened in a different browser. Ask for a new one.";

// MAY THIS CALL CHANGE A PASSWORD? The one question, asked in two places: by the
// page, to decide whether to draw the form, and by `setNewPassword`, to decide
// whether to do anything at all.
//
// It is one function because the coach's review of PR #124 found it was one
// question answered in one place only: the page hid the form, and the action
// behind it accepted a call from any signed-in session and changed that
// account's password. A page that hides a form is not a check -- the form is not
// where the decision belongs. Issue #120 rule 3 says opening the page without a
// valid reset link "changes nothing", and a direct post to the action did change
// something.
//
// To be clear about what this is and is not, as the review was: it does not keep
// a stranger out, because a signed-in person can change their own password
// through Supabase directly whatever this app does. It makes the app's own rule
// true where it is enforced rather than only where it is drawn.
export function mayChangePassword(state: {
  marked: boolean;
  signedIn: boolean;
}): boolean {
  return state.marked && state.signedIn;
}

// Which of the two things the new-password page draws. Nothing else is drawable:
// there is no third state in which it shows an address, a name, or anything
// about whether an account exists.
//
// It defers to mayChangePassword rather than repeating its test, so the screen
// cannot start offering a form the action would refuse, or hiding one it would
// accept.
export function newPasswordView(state: {
  marked: boolean;
  signedIn: boolean;
  deadLink: boolean;
}): "form" | "dead" {
  if (state.deadLink) return "dead";
  return mayChangePassword(state) ? "form" : "dead";
}

// ------------------------------------------------- where the email links back
//
// THE ADDRESS THE EMAIL LINKS BACK TO (issue #120 rule 4). It is built from one
// setting, `SITE_URL`, and from nothing else -- not from a hard-coded localhost,
// preview or production address, and not from a request header.
//
// NOT FROM A HEADER, unlike the sign-up confirmation in
// web/src/app/auth/actions.ts, and the difference is deliberate. That one reads
// the request's own origin so a preview deploy confirms back to itself. This
// link carries a password-reset code, which is a credential until it is used or
// expires, so it gets the same treatment as `APP_URL` in the Edge Functions
// (docs/environments.md): "Only ever read from this setting, never from a
// request header -- a link built from Host or X-Forwarded-Host could be pointed
// at a site an attacker owns, harvesting the token."
//
// WHEN THE SETTING IS NOT SET, this returns undefined and the caller passes no
// `redirectTo` at all. Supabase then uses the project's own Site URL setting,
// which is still "the site address in settings" and is still not a hard-coded
// address in this repository. That is why the setting is optional: a required
// one would mean the app stops working the moment it is merged and before the
// owner has set it, which is a worse failure than a link that goes to the
// project's configured home page.
//
// It is also why nothing here validates the value. Supabase honours only the
// addresses on the project's Redirect URLs allow-list and falls back to the Site
// URL for anything else, so the allow-list is the one place that decides -- the
// same argument the sign-up confirmation makes for the same reason. A second
// list in the code would be a second thing to keep in step.
export function resetRedirectTo(siteUrl: unknown): string | undefined {
  if (typeof siteUrl !== "string") return undefined;

  const text = siteUrl.trim();
  if (text === "") return undefined;

  // One trailing slash or none, both common in a dashboard field, and both
  // giving the same address rather than a doubled slash.
  return `${text.replace(/\/+$/, "")}${RESET_LANDING_PATH}`;
}

// The setting itself, read once. Server-only on purpose: it has no
// NEXT_PUBLIC_ prefix, so Next.js never inlines it into the browser bundle, and
// nothing in a page needs it -- only the server action that asks Supabase to
// send the email. docs/environments.md lists it with the rest.
export const SITE_URL = process.env.SITE_URL;
