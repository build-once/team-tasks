"use server";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { rememberUserForErrorReports } from "@/lib/sentry-user";
import { createClient } from "@/lib/supabase/server";
import { DISPLAY_NAME_MAX, EMAIL_MAX, NAME_MAX } from "@/lib/teams";

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

// Save the signed-in person's display name: insert if they have no profile row,
// update it if they do, and only ever their own row.
//
// THIS IS THE ONLY WRITE THE APP MAKES WITHOUT A SERVER FUNCTION, and the
// migration that added profiles says why: creating a team, inviting somebody and
// accepting an invitation each need a count of rows OTHER than the one being
// written -- at most 3 teams, at most 20 pending, accepted exactly once -- which
// is what a server function holding the secret key is for. Everything that must
// be true of a nickname is true of the single row being written, which is what a
// policy does well. So there is no function here, and no secret key: the two
// policies "You can create your own profile" and "You can change your own
// profile" are the check, and both pin user_id to auth.uid().
export async function saveDisplayName(formData: FormData) {
  const displayName = String(formData.get("display_name") ?? "").trim();

  // Trimmed first, so a name of spaces is caught here rather than by
  // profiles_display_name_not_blank, and so the stored value has no edges.
  //
  // Checked here so an obvious mistake costs no round trip. NOT the check that
  // matters: profiles_display_name_length and profiles_display_name_not_blank
  // are, and they count characters where JavaScript counts UTF-16 units -- so a
  // name of emoji can pass this line and still be refused by the database. That
  // refusal is reported rather than swallowed, below.
  if (!displayName || displayName.length > DISPLAY_NAME_MAX) {
    redirect("/teams?problem=yourname");
  }

  const supabase = await createClient();

  // The id has to be in the insert: profiles.user_id is the primary key and has
  // no default. It comes from getClaims(), which verifies the token's signature
  // -- not from the form, and not from getSession(), which would trust a cookie
  // anyone can forge. If it were wrong in either direction the insert policy
  // would refuse it anyway, because its with check is (auth.uid() = user_id).
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    // Not "save failed": the session could not be read at all, so the honest
    // next step is to sign in again.
    redirect("/login");
  }

  // So an error report from the rest of this action carries who hit it, by id
  // and nothing else (issue #157). After the redirect above, so it only runs
  // with a verified token in hand.
  rememberUserForErrorReports(userId);

  // Update first, and let .select() report how many rows it touched.
  //
  // From the reference for update: "By default, updated rows are not returned.
  // To return it, chain the call with .select() after filters."
  // https://supabase.com/docs/reference/javascript/update
  //
  // Zero rows back means there is no profile row yet, which is the ordinary
  // first-time case rather than an error -- so it falls through to the insert
  // below. The .eq() is not what keeps this to one person's row (the update
  // policy does that); it is here so the statement says plainly which row it
  // means.
  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("user_id", userId)
    .select("user_id");

  if (updateError) redirect("/teams?problem=profile");

  if (!updated || updated.length === 0) {
    const { error: insertError } = await supabase
      .from("profiles")
      .insert({ user_id: userId, display_name: displayName });

    // Two of this person's own requests racing -- two tabs, or a double submit
    // -- is the only way this can arrive after a row already exists, and then
    // the primary key refuses it rather than anything being overwritten
    // silently. That is the right way round: the page says it did not save, and
    // saving again works, because by then the update above finds the row.
    if (insertError) redirect("/teams?problem=profile");
  }

  revalidatePath("/teams");
  redirect("/teams?named=1");
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
