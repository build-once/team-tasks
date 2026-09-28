"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { TITLE_MAX } from "@/lib/tasks";

export async function addTask(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();

  if (!title || title.length > TITLE_MAX) redirect("/tasks?problem=title");

  const supabase = await createClient();

  // owner_id is left out on purpose. The database fills it in from the signed-in
  // person (its default is auth.uid()), so a request cannot claim to be someone
  // else, however it is put together.
  const { error } = await supabase.from("tasks").insert({ title });

  if (error) redirect("/tasks?problem=save");

  revalidatePath("/tasks");
  // The design confirms the add with a "Task added." message, so say so.
  redirect("/tasks?added=1");
}

export async function setDone(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const done = String(formData.get("done") ?? "") === "true";

  if (!id) redirect("/tasks?problem=save");

  const supabase = await createClient();

  // There is no "and owner_id is me" here on purpose: the row-level security
  // rules already allow a person to change only their own rows, so a guessed id
  // from somebody else's list changes nothing. That is what the Alice / Bob /
  // Carol checks in docs/environments.md have to prove on staging.
  const { error } = await supabase.from("tasks").update({ done }).eq("id", id);

  if (error) redirect("/tasks?problem=save");

  revalidatePath("/tasks");
}

export async function renameTask(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();

  if (!id) redirect("/tasks?problem=save");

  // Keep the row in its editing state so the person does not lose what they
  // were typing into a list that has closed itself.
  if (!title || title.length > TITLE_MAX) {
    redirect(`/tasks?problem=title&rename=${id}`);
  }

  const supabase = await createClient();

  // .select() is what makes the changed rows come back. From the reference for
  // update: "By default, updated rows are not returned. To return it, chain the
  // call with .select() after filters."
  // https://supabase.com/docs/reference/javascript/update
  //
  // That is how this tells "renamed" from "changed nothing". A row belonging to
  // somebody else is not an error: the row-level security rules simply leave it
  // out, so the update matches nothing and data comes back empty.
  const { data, error } = await supabase
    .from("tasks")
    .update({ title })
    .eq("id", id)
    .select("id");

  if (error) redirect("/tasks?problem=save");
  if (!data || data.length === 0) redirect("/tasks?problem=missing");

  revalidatePath("/tasks");
  redirect("/tasks");
}

export async function deleteTask(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  if (!id) redirect("/tasks?problem=save");

  const supabase = await createClient();

  // Same as rename. From the reference for delete: "By default, deleted rows
  // are not returned. To return it, chain the call with .select() after
  // filters." https://supabase.com/docs/reference/javascript/delete
  //
  // An empty result means nothing was deleted -- the task is gone already, or
  // it was never this person's to delete. Either way, say so rather than
  // returning to a list that looks as though it worked.
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) redirect("/tasks?problem=save");
  if (!data || data.length === 0) redirect("/tasks?problem=missing");

  revalidatePath("/tasks");
  redirect("/tasks");
}
