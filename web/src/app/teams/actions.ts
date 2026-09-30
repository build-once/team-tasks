"use server";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { EMAIL_MAX, NAME_MAX } from "@/lib/teams";

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
// `what` names the thing that failed, so one helper can serve both actions
// without either inheriting the other's wording.
async function messageFrom(error: unknown, what: string): Promise<string> {
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
    return `${what} did not work. Please try again.`;
  }

  return `Could not reach the server: ${what} did not work. Please try again.`;
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
    const message = await messageFrom(error, "creating the team");
    redirect(`/teams?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/teams");
  redirect("/teams?created=1");
}

export async function inviteMember(formData: FormData) {
  const teamId = String(formData.get("team_id") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!teamId) redirect("/teams?problem=invite");

  // Checked here so an obvious typo costs no round trip. NOT the check that
  // matters: invite-member checks the address, the ownership and the 20-pending
  // limit, and it is the only thing that can write an invitation.
  if (!email || email.length > EMAIL_MAX || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect("/teams?problem=email");
  }

  const supabase = await createClient();

  // The invitation is created by the function, never by an insert from here:
  // the invitations table has no insert policy. Note what is NOT sent -- no
  // inviter id, no token, no expiry. The function takes the inviter from the
  // verified token and makes the token itself, so there is nothing here for a
  // caller to tamper with.
  const { data, error } = await supabase.functions.invoke("invite-member", {
    body: { team_id: teamId, email },
  });

  if (error) {
    const message = await messageFrom(error, "sending the invitation");
    redirect(`/teams?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/teams");

  // On staging the email goes to the test inbox instead of the invited person.
  // Saying so on screen stops a tester concluding the invitation failed because
  // nothing arrived at the address they typed.
  const redirected = (data as { redirected?: unknown } | null)?.redirected === true;
  redirect(redirected ? "/teams?invited=test" : "/teams?invited=1");
}
