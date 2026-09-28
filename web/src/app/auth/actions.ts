"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

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
