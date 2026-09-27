"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function credentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
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

  const { data, error } = await supabase.auth.signUp(credentials(formData));

  if (error) redirect("/signup?problem=1");

  // If the project asks people to confirm their email address, signing up does
  // not sign them in. There is no session to use yet, so say so instead of
  // sending them to a page the proxy would bounce them straight back from.
  if (!data.session) redirect("/signup?confirm=1");

  revalidatePath("/", "layout");
  redirect("/tasks");
}
