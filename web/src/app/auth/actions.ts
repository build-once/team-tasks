"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  newPasswordRefusedPath,
  signInRefusedPath,
  signUpRefusedPath,
} from "@/lib/auth-messages";
import { ACT_FIELD, BUTTON_IDS, pressed } from "@/lib/buttons";
import {
  RESET_MARKER_COOKIE,
  SITE_URL,
  mayChangePassword,
  newPasswordPath,
  outcomeAfterRequest,
  passwordProblem,
  resetRedirectTo,
} from "@/lib/password-reset";
import { createClient } from "@/lib/supabase/server";
import { TURNSTILE_TOKEN_FIELD, readCaptchaToken } from "@/lib/turnstile";

// THE ANTI-ROBOT TOKEN, read off the form and handed straight on (issue #284).
//
// Cloudflare's widget puts its own hidden field in the form, named
// `cf-turnstile-response`, so the token arrives in the FormData these actions
// already receive -- there is nothing to wire up and nothing of ours to store.
// web/src/lib/turnstile.ts is the one place that name is spelled.
//
// NOTHING HERE DECIDES WHETHER A TOKEN IS GOOD. Supabase Auth does that, with
// the secret key in the project's own Auth settings, which exists nowhere in
// this repository. All three calls below therefore pass whatever arrived --
// including `undefined`, which is what every request sent before Build it 25
// sent -- and report Supabase's refusal with this app's own words.
function captchaToken(formData: FormData): string | undefined {
  return readCaptchaToken(formData.get(TURNSTILE_TOKEN_FIELD));
}

function credentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
}

// Where the confirmation email should send the person back to: the address
// they are actually using, whether that is localhost, a preview, or the real
// site. Without this, Supabase always uses the project's Site URL, so someone
// signing up on a preview is sent somewhere else entirely.
//
// This is not checked against a list here on purpose. Supabase honours only the
// addresses on the project's Redirect URLs allow-list and falls back to the
// Site URL for anything else, so the allow-list is the one place that decides.
// A second list in the code would be a second thing to keep in step.
async function confirmationRedirect() {
  const headerList = await headers();

  const origin = headerList.get("origin");
  if (origin) return `${origin}/auth/callback`;

  // A form post does not always carry an Origin header. Rebuild it from the
  // forwarded host, which is what a preview deploy sets.
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) return undefined;

  const protocol = headerList.get("x-forwarded-proto") ?? "https";
  return `${protocol}://${host}/auth/callback`;
}

// What a sign-in attempt that did not come from this page's button is worth: the
// same as a wrong password, and nothing else happens.
//
// A constant rather than a value built in the function, and this is the one place
// in the app where the SHAPE of a guard was decided by a check rather than only by
// taste, so it is written down. scripts/password-reset-check.mjs uses `signIn` as
// its CONTROL -- the function in this file that legitimately has two redirects, one
// branch and two mentions of an outcome, proving its searches are specific rather
// than matching everywhere. An ordinary `if (!pressed(...)) redirect(...)` guard
// would have made that three and two, turned the control red, and the honest fix
// for that is the code and never the check (AGENTS.md rule 20).
//
// So the guard is folded into the one branch that was already there, which turns
// out to be the better shape anyway: a press this page did not make is not a
// different kind of failure from a password that does not match, and this says so
// in one place instead of two.
const NOT_THIS_BUTTON = { error: true as const };

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  // The button, by identifier, never by its wording (Build it 19 rule 6). Nothing
  // is sent to Supabase for a press this page did not make -- the ternary is what
  // makes that true, because the call is on the branch that is not taken.
  //
  // THE ANSWER IS NAMED RATHER THAN DESTRUCTURED, and that is not a style
  // choice. scripts/password-reset-check.mjs uses this function as its CONTROL
  // -- the one in this file that legitimately has two redirects, one branch and
  // two mentions of an outcome, which is how it proves its searches are
  // specific rather than matching everywhere. Destructuring `error` and then
  // passing it to signInRefusedPath would have made that THREE mentions and
  // turned the control red, and the honest fix for a red check is the code and
  // never the check (AGENTS.md rule 20). Naming the answer keeps the count at
  // two and reads no worse.
  const answer = pressed(formData.get(ACT_FIELD), [BUTTON_IDS.signIn])
    ? await supabase.auth.signInWithPassword({
        ...credentials(formData),
        options: { captchaToken: captchaToken(formData) },
      })
    : NOT_THIS_BUTTON;

  // STILL NOT TOLD WHICH HALF WAS WRONG, and still none of Supabase's text on
  // the screen: either would help somebody sort addresses into accounts and
  // not-accounts. What changed with issue #284 is that three refusals which are
  // NOT about the credentials now say what they are -- a rate limit, a failed
  // anti-robot check, and an address that has not been confirmed -- instead of
  // being told their password did not match. signInRefusedPath chooses from the
  // error CODE, and `invalid_credentials` and a press from somewhere else both
  // still get the one generic sentence.
  if (answer.error) redirect(signInRefusedPath(answer.error));

  revalidatePath("/", "layout");
  redirect("/tasks");
}

export async function signUp(formData: FormData) {
  if (!pressed(formData.get(ACT_FIELD), [BUTTON_IDS.signUp])) {
    redirect("/signup?problem=1");
  }

  // THE PASSWORD RULE, ON THE SERVER (issue #197).
  //
  // WHAT WAS WRONG: the sign-up screen said "At least 8 characters" and the only
  // thing enforcing it was `minLength={PASSWORD_MIN_LENGTH}` on the input -- an
  // attribute in a page, which a post made by hand skips entirely. So the app
  // stated a rule it did not keep, on the screen where somebody chooses the
  // credential that protects everything else they put in. docs/claims.md recorded
  // it as NOT ENFORCED and the owner decided to make it true rather than to
  // soften the words.
  //
  // IT IS THE SAME FUNCTION AND THE SAME MESSAGE as the reset screen, which is
  // the half that keeps the two from drifting: `passwordProblem` is the one check
  // (web/src/lib/password-reset.ts), `PASSWORD_TOO_SHORT` is the one sentence, and
  // web/src/app/signup/page.tsx draws that same constant. "The same password rules
  // as sign-up" was already true of the number; now it is true of the refusal too.
  //
  // BEFORE `createClient()` AND BEFORE ANYTHING IS SENT, on purpose. A password
  // this app will not accept should not reach Supabase at all, and ordering the
  // gate ahead of the thing it guards is what makes it a gate rather than a
  // comment -- the same argument `setNewPassword` makes below, and the thing
  // scripts/password-reset-check.mjs checks by order rather than by presence.
  //
  // `formData.get` is passed STRAIGHT IN, not through String(). passwordProblem
  // takes `unknown` and treats anything that is not a string as too short, which
  // is the honest reading of a missing field -- where String(null) would become
  // the four characters "null" and be judged as a password somebody typed.
  //
  // THE PATH IS AN INLINE LITERAL, like every other redirect in this file. It is a
  // CODE and not a sentence: the page owns the words and draws its own constant for
  // this code, so nothing a caller puts in the address bar is ever printed (issue
  // #45's lesson). It is a SEPARATE code from `problem=1` because `problem=1`
  // deliberately will not say which half was wrong -- telling an address apart from
  // a password is how somebody sorts addresses into accounts and not-accounts --
  // whereas this one is about the password just typed and gives nothing away: seven
  // characters are refused identically whether or not the address has an account.
  if (passwordProblem(formData.get("password"))) {
    redirect("/signup?problem=password");
  }

  const supabase = await createClient();
  const emailRedirectTo = await confirmationRedirect();

  const { data, error } = await supabase.auth.signUp({
    ...credentials(formData),
    // ALWAYS AN OPTIONS OBJECT NOW, where it used to be `undefined` when there
    // was no redirect to pass: the anti-robot token lives in there too, and it
    // has to travel whether or not a redirect does.
    options: {
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
      captchaToken: captchaToken(formData),
    },
  });

  // CHOSEN FROM THE ERROR CODE (issue #284), where this used to be one path for
  // everything Supabase could say. Six refusals now have their own sentence,
  // and two of them are the ones production would really hit: the email limit,
  // and an address the sender will not deliver to -- which is what production
  // answers today for any address that is not on the Supabase project's team
  // (docs/rate-limits.md). `email_exists` is deliberately NOT one of the six
  // and falls through to the generic sentence below, because telling somebody
  // an address already has an account is how a list of addresses gets sorted
  // into accounts and not-accounts.
  if (error) redirect(signUpRefusedPath(error));

  // If the project asks people to confirm their email address, signing up does
  // not sign them in. There is no session to use yet, so say so instead of
  // sending them to a page the proxy would bounce them straight back from.
  if (!data.session) redirect("/signup?confirm=1");

  revalidatePath("/", "layout");
  redirect("/tasks");
}

// Ask Supabase to send a password-reset email, and say the same thing however
// that went.
//
// ONE EXIT, ON PURPOSE. There is no `if` in this function and no second
// `redirect`, because issue #120 rule 1 is that the screen is identical for an
// address with an account, an address without one, and an error such as a rate
// limit. The answer from Supabase is handed to outcomeAfterRequest, which
// ignores it; the sentence lives in one constant in web/src/lib/password-reset.ts.
// scripts/password-reset-check.mjs checks both of those, and also checks this
// function itself for a second exit, because a branch added here later is
// exactly how the promise would quietly stop being true.
//
// The result is not even read into a named variable: there is nothing this code
// may legitimately do with it. Nothing is logged -- an error logged with the
// address beside it would rebuild the very distinction the screen refuses to
// make, in a place the owner reads.
// Ask Supabase for the email, but only for a press that came from this page's
// button (Build it 19 rule 6).
//
// WHY THE GUARD IS IN HERE AND NOT IN THE ACTION. The action below must contain no
// branch at all -- that is issue #120 rule 1, and scripts/password-reset-check.mjs
// reads the action's own source and requires zero `if (`, zero ternaries and zero
// `&&` in it, because "the same screen whatever happened" is not something a
// reviewer can check by comparing two branches, and with no branches there is
// nothing to compare. Putting the guard there would turn that check red, and the
// honest fix for a red check is the code and never the check (AGENTS.md rule 20).
//
// So the branch lives here, where it decides only whether to ASK, and the action
// keeps its single exit. Nothing comes back out of this function: it returns void,
// it reads no answer and it logs nothing, so the action still has no outcome to
// treat differently -- which is the property rule 1 is actually about.
//
// A press from somewhere else therefore sends no email and still lands on the same
// screen with the same sentence, which is the right answer for the same reason a
// non-existent address gets it: any screen that differs is a way to sort addresses
// into accounts and not-accounts.
async function askForResetEmail(formData: FormData): Promise<void> {
  if (!pressed(formData.get(ACT_FIELD), [BUTTON_IDS.resetRequest])) return;

  const supabase = await createClient();

  // The anti-robot token rides along here too, and it is the one of the three
  // whose refusal this app CANNOT report: the screen below says one sentence
  // whatever happened, which is issue #120 rule 1, and a different sentence for
  // a failed check would be a second branch in a function that is checked for
  // having none. So the widget's own words on the screen
  // (web/src/app/components/CaptchaGate.tsx) are the whole of what a person
  // gets told here, and a spent or expired token means no email and the usual
  // sentence -- the same cost the 2-emails-an-hour limit already has, written
  // down in docs/rate-limits.md rather than discovered.
  //
  // `resetPasswordForEmail` takes a FLAT options object -- `{ redirectTo,
  // captchaToken }` -- where signUp and signInWithPassword take `options: {
  // captchaToken }`. Read off the installed client rather than assumed:
  // web/node_modules/@supabase/auth-js/src/GoTrueClient.ts:4468-4500.
  await supabase.auth.resetPasswordForEmail(
    String(formData.get("email") ?? ""),
    {
      redirectTo: resetRedirectTo(SITE_URL),
      captchaToken: captchaToken(formData),
    },
  );
}

export async function requestPasswordReset(formData: FormData) {
  await askForResetEmail(formData);

  redirect(outcomeAfterRequest(undefined).path);
}

// Set the new password, for somebody who has just come through a reset link.
//
// The authority for this is the session Supabase created when it accepted the
// link: `updateUser` changes the password of whoever the session belongs to, and
// nothing in this function names an account. An address is never read here, and
// the reset code never reaches this function at all.
//
// THE GATE IS HERE, not only on the page that draws the form. Asked for by the
// coach's review of PR #124: the page hid the form without the marker, and this
// function would still change a password for any signed-in caller who posted to
// it directly. Both halves are now required before anything happens --
// mayChangePassword is the same function the page asks -- and a call that fails
// them takes the dead-link path, having changed nothing.
export async function setNewPassword(formData: FormData) {
  const supabase = await createClient();

  // getClaims() verifies the token's signature; getSession() would trust a
  // cookie anyone can forge. Same reason every private page in this app uses it.
  const { data: claimsData } = await supabase.auth.getClaims();
  const cookieStore = await cookies();

  // MAY THIS CALL CHANGE A PASSWORD? Two things have to be true, and they are
  // asked as one question so there is one answer and one way out.
  //
  // The second is the reset gate that was already here: the marker cookie and a
  // session, which is `mayChangePassword`. The first is new with Build it 19 rule 6
  // -- the press has to have come from this page's button, by identifier and never
  // by its wording.
  //
  // WHY IT IS FOLDED IN RATHER THAN WRITTEN AS ITS OWN GUARD ABOVE. A separate
  // `if (!pressed(...)) redirect(newPasswordPath("stale"))` would put that path
  // before the call to `mayChangePassword`, and scripts/password-reset-check.mjs
  // requires the gate to come first -- "a refused call takes the dead-link path" is
  // checked by order, because a gate written after the thing it guards is not a
  // gate. The honest fix for that is the code and never the check (AGENTS.md
  // rule 20), and one question with one answer is the better shape anyway: a press
  // from somewhere else and a stale link both mean "this call may not change a
  // password", and both get the same screen for the same reason.
  //
  // `&&` short-circuits, so a press from somewhere else does not even ask the
  // second question.
  const allowed =
    mayChangePassword({
      marked: cookieStore.get(RESET_MARKER_COOKIE)?.value !== undefined,
      signedIn: Boolean(claimsData?.claims),
    }) && pressed(formData.get(ACT_FIELD), [BUTTON_IDS.passwordSave]);

  // Before the password is even looked at, so a refused call cannot learn
  // anything from which answer it got back. The marker goes too: after a
  // refusal the form is not offered again until a new link is accepted.
  if (!allowed) {
    cookieStore.delete(RESET_MARKER_COOKIE);
    redirect(newPasswordPath("stale"));
  }

  const password = String(formData.get("password") ?? "");

  // Then the app's own rule, so a password that is too short is refused without
  // a round trip, and with the same words sign-up would use.
  const problem = passwordProblem(password);
  if (problem) redirect(newPasswordPath("problem"));

  const { error } = await supabase.auth.updateUser({ password });

  // THIS IS THE LINE THE OWNER WATCHED LIE, on production on 11 October 2026
  // (issue #284). It used to be `redirect(newPasswordPath("stale"))` for every
  // answer Supabase could give, with the comment above it saying "the realistic
  // cause is a recovery session that lapsed". The real answer that morning was
  // HTTP 422, code `same_password` -- the link had worked, the form had loaded,
  // and the person was told the link didn't work when what was wrong was a
  // password they could have changed in five seconds.
  //
  // Still no Supabase error text on screen. What changed is that the sentence
  // is chosen from the CODE: `same_password`, `weak_password` and a rate limit
  // each get their own words, a genuinely gone session still gets the dead-link
  // screen -- `newPasswordRefusedPath` returns exactly what
  // `newPasswordPath("stale")` returns for that one case, and
  // scripts/auth-screens-check.mjs compares the two strings so they cannot
  // drift -- and an answer nobody recognises is told it did not work and
  // offered another go, rather than being called a dead link on no evidence.
  //
  // AND THE MARKER IS NOW KEPT FOR A REFUSAL THE PERSON CAN FIX, which is the
  // other half of the repair and is easy to miss. This used to delete the
  // marker for every error, so even with the right sentence the page would have
  // drawn the dead-link screen instead of the form -- the marker is what lets
  // the form be drawn at all (web/src/lib/password-reset.ts). Somebody told
  // "that is the password you are already using" needs the form back, with
  // their recovery session intact, to type a different one.
  //
  // The test is the destination itself: the one path that means the link is
  // gone is the one `newPasswordPath("stale")` builds, and that is exactly the
  // string newPasswordRefusedPath returns for a session that has lapsed. So
  // there is no second list of codes here to drift out of step with the first.
  if (error) {
    const refusedPath = newPasswordRefusedPath(error);
    if (refusedPath === newPasswordPath("stale")) {
      cookieStore.delete(RESET_MARKER_COOKIE);
    }
    redirect(refusedPath);
  }

  // One use per link. The session stays -- the person is signed in, which is
  // what the reset link did -- but the marker that lets this form be drawn is
  // spent, so a refresh or a back button does not offer it again.
  cookieStore.delete(RESET_MARKER_COOKIE);

  revalidatePath("/", "layout");
  redirect(newPasswordPath("done"));
}
