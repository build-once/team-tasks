"use server";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { NAME_MAX } from "@/lib/teams";

// How long an error message from the function may be before this trims it. The
// message is shown on the page, and the page should not become a wall of text
// because something upstream returned an essay.
const MESSAGE_MAX = 200;

// Pull the function's own message out of a failed invoke.
//
// The client throws FunctionsHttpError when a function answers with a non-2xx
// status, and the documented way to read the body is `await error.context.json()`
// -- error.context is the Response itself. From the installed client's own
// reference (web/node_modules/@supabase/functions-js):
//
//   if (error instanceof FunctionsHttpError) {
//     const errorMessage = await error.context.json()
//   }
//
// Anything else -- a relay error, a network error -- has no body to read, so it
// falls through to a general message.
async function messageFrom(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      const message = (body as { error?: unknown } | null)?.error;
      if (typeof message === "string" && message.trim() !== "") {
        return message.trim().slice(0, MESSAGE_MAX);
      }
    } catch {
      // The body was not JSON, or was already read. Fall through.
    }
    return "The team could not be created. Please try again.";
  }

  return "Could not reach the server to create the team. Please try again.";
}

export async function createTeam(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();

  // Checked here so an obvious mistake costs no round trip. This is NOT the
  // check that matters: create-team checks the same thing, and it is the only
  // thing that can write a team.
  if (!name || name.length > NAME_MAX) {
    redirect(`/teams?problem=name`);
  }

  const supabase = await createClient();

  // The team is created by the function, never by an insert from here. The
  // teams table has no insert policy, so an insert with the app's publishable
  // key would be refused -- see supabase/migrations and docs/architecture.md.
  //
  // invoke sends the signed-in person's token in the Authorization header, and
  // the function takes the owner's id from that verified token. Note what is
  // NOT sent: no owner_id, no user id. There is nothing in this body for a
  // caller to tamper with to create a team for somebody else.
  const { error } = await supabase.functions.invoke("create-team", {
    body: { name },
  });

  if (error) {
    const message = await messageFrom(error);
    redirect(`/teams?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/teams");
  redirect("/teams?created=1");
}
