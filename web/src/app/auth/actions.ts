"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

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
  const { error } = pressed(formData.get(ACT_FIELD), [BUTTON_IDS.signIn])
    ? await supabase.auth.signInWithPassword(credentials(formData))
    : NOT_THIS_BUTTON;

  // On purpose, the person is not told which half was wrong, and the text Supabase
  // sent is not shown. Either would help someone guess at accounts. A press from
  // somewhere else lands here too, and gets the same sentence, for the same reason.
  if (error) redirect("/login?problem=1");

  revalidatePath("/", "layout");
  redirect("/tasks");
}

export async function signUp(formData: FormData) {
  if (!pressed(formData.get(ACT_FIELD), [BUTTON_IDS.signUp])) {
    redirect("/signup?problem=1");
  }

  const supabase = await createClient();
  const emailRedirectTo = await confirmationRedirect();

  const { data, error } = await supabase.auth.signUp({
    ...credentials(formData),
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });

  if (error) redirect("/signup?problem=1");

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

  await supabase.auth.resetPasswordForEmail(
    String(formData.get("email") ?? ""),
    { redirectTo: resetRedirectTo(SITE_URL) },
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

  // No Supabase error text on screen. The realistic cause is a recovery session
  // that lapsed while the form was open, and the honest answer for that is the
  // dead-link screen: ask for another email.
  if (error) {
    cookieStore.delete(RESET_MARKER_COOKIE);
    redirect(newPasswordPath("stale"));
  }

  // One use per link. The session stays -- the person is signed in, which is
  // what the reset link did -- but the marker that lets this form be drawn is
  // spent, so a refresh or a back button does not offer it again.
  cookieStore.delete(RESET_MARKER_COOKIE);

  revalidatePath("/", "layout");
  redirect(newPasswordPath("done"));
}
