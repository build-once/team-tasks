"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  RESET_MARKER_COOKIE,
  SITE_URL,
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

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword(
    credentials(formData),
  );

  // On purpose, the person is not told which half was wrong, and the error text
  // from Supabase is not shown. Either would help someone guess at accounts.
  if (error) redirect("/login?problem=1");

  revalidatePath("/", "layout");
  redirect("/tasks");
}

export async function signUp(formData: FormData) {
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
export async function requestPasswordReset(formData: FormData) {
  const supabase = await createClient();

  await supabase.auth.resetPasswordForEmail(
    String(formData.get("email") ?? ""),
    { redirectTo: resetRedirectTo(SITE_URL) },
  );

  redirect(outcomeAfterRequest(undefined).path);
}

// Set the new password, for somebody who has just come through a reset link.
//
// The authority for this is the session Supabase created when it accepted the
// link: `updateUser` changes the password of whoever the session belongs to, and
// nothing in this function names an account. An address is never read here, and
// the reset code never reaches this function at all.
export async function setNewPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  // The app's own rule first, so a password that is too short is refused without
  // a round trip, and with the same words sign-up would use.
  const problem = passwordProblem(password);
  if (problem) redirect(newPasswordPath("problem"));

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  // No Supabase error text on screen. The realistic cause is a recovery session
  // that lapsed while the form was open, and the honest answer for that is the
  // dead-link screen: ask for another email.
  if (error) {
    (await cookies()).delete(RESET_MARKER_COOKIE);
    redirect(newPasswordPath("stale"));
  }

  // One use per link. The session stays -- the person is signed in, which is
  // what the reset link did -- but the marker that lets this form be drawn is
  // spent, so a refresh or a back button does not offer it again.
  (await cookies()).delete(RESET_MARKER_COOKIE);

  revalidatePath("/", "layout");
  redirect(newPasswordPath("done"));
}
