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
