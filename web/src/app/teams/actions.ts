"use server";

import { FunctionsHttpError } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { BUTTON_IDS, ACT_FIELD, pressed } from "@/lib/buttons";
import { rememberUserForErrorReports } from "@/lib/sentry-user";
import { createClient } from "@/lib/supabase/server";
import {
  DISPLAY_NAME_MAX,
  EMAIL_MAX,
  NAME_MAX,
  teamActionOutcome,
  worthReporting,
  type TeamActionOutcome,
} from "@/lib/teams";

// Work out which outcome a failed `functions.invoke` was, and report it if the
// app cannot explain it.
//
// WHAT IS READ FROM THE ANSWER, AND WHAT IS NOT. The status, which the function
// sets and a caller cannot forge, and the `code` field, which is compared with one
// known value and never printed. NOT the `error` message: see the long note beside
// TEAM_ACTION_OUTCOMES in web/src/lib/teams.ts for why that message used to be
// shown and must not be.
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
// Anything else -- a relay error, a network error -- has no status and no body, so
// nothing is known and the outcome is "unreachable".
//
// WHERE THE DETAIL GOES (Build it 19 rule 2). To Sentry, through `beforeSend`,
// which is web/src/lib/sentry-scrub.ts' `scrubEvent` -- the existing scrub, wired
// up in web/src/sentry/options.ts. So an address or a token quoted by something
// upstream is replaced on the way out, and the screen never had it in the first
// place. `what` names the action for the report, and it is a fixed string from
// this file, never anything a caller sent.
async function outcomeOf(error: unknown, what: string): Promise<TeamActionOutcome> {
  let outcome: TeamActionOutcome;

  if (error instanceof FunctionsHttpError) {
    let code: unknown;
    try {
      const body = await error.context.json();
      code = (body as { code?: unknown } | null)?.code;
    } catch {
      // Not JSON, or already read. The status alone decides, which is the whole
      // point of deciding by status.
    }

    outcome = teamActionOutcome({
      reached: true,
      status: error.context?.status,
      code,
    });
  } else {
    outcome = teamActionOutcome({ reached: false });
  }

  if (worthReporting(outcome)) {
    // A tag rather than a message built out of the error, so what is searchable in
    // Sentry is this app's own words. The exception itself carries whatever the
    // client put in it, and the scrub cleans that.
    Sentry.captureException(error, {
      tags: { action: what, outcome },
    });
  }

  return outcome;
}

export async function createTeam(formData: FormData) {
  // The button, by identifier, never by its wording (Build it 19 rule 6). A post
  // that does not carry the identifier this action answers to changes nothing.
  if (!pressed(formData.get(ACT_FIELD), [BUTTON_IDS.teamCreate])) {
    redirect("/teams?problem=button");
  }

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
  const { data, error } = await supabase.functions.invoke("create-team", {
    body: { name },
  });

  if (error) {
    const outcome = await outcomeOf(error, "create-team");
    redirect(`/teams?problem=create&outcome=${outcome}`);
  }

  revalidatePath("/teams");

  // ---- THE READ-BACK (Build it 19 rule 3) ---------------------------------
  //
  // "Team created." is not said because the request worked. It is said because the
  // row is in the database and this code has just read it.
  //
  // The function answering 201 is strong evidence and it is not the same thing: it
  // reports what its own insert returned, and between that and the next screen
  // sits a redirect, a fresh request and a different connection. A read is what
  // closes that gap, and it is cheap -- one row, by primary key, through the
  // select policy that already lets the owner read their own teams.
  //
  // ONE COLUMN, and `id` rather than `name`: the question is "is it there", and a
  // name read back and compared would be this action asserting something about
  // text somebody typed rather than about the row existing.
  const teamId = (data as { team?: { id?: unknown } } | null)?.team?.id;

  if (typeof teamId !== "string" || teamId === "") {
    // A 201 with no id in it. Nothing to read back, so nothing is claimed.
    redirect("/teams?created=unconfirmed");
  }

  const { data: readBack, error: readBackError } = await supabase
    .from("teams")
    .select("id")
    .eq("id", teamId)
    .maybeSingle();

  if (readBackError || readBack === null) {
    // The team probably exists -- the function said so -- and this code has not
    // seen it, so it does not say "created". The list below the banner is read in
    // the same request as the banner, so whichever answer the database gives, the
    // screen and the sentence agree.
    redirect("/teams?created=unconfirmed");
  }

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
  if (!pressed(formData.get(ACT_FIELD), [BUTTON_IDS.nameSave])) {
    redirect("/teams?problem=button");
  }

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

  // Update first, and let .select() report what it actually wrote.
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
  //
  // display_name RATHER THAN user_id (Build it 19 rule 3). The old version selected
  // user_id, which proves a row was touched and says nothing about what is now in
  // it. "Your name is saved." is a claim about the name, so the name is what comes
  // back and what is compared.
  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("user_id", userId)
    .select("display_name");

  if (updateError) redirect("/teams?problem=profile");

  if (updated && updated.length > 0) {
    // The read-back. A database that stored something other than what was sent --
    // a trigger, a future column default, a check that rewrote it -- must not be
    // reported as "saved": the box on the next screen would show one thing and the
    // banner would claim another.
    if ((updated[0] as { display_name?: unknown }).display_name !== displayName) {
      redirect("/teams?problem=profile");
    }

    revalidatePath("/teams");
    redirect("/teams?named=1");
  }

  const { data: inserted, error: insertError } = await supabase
    .from("profiles")
    .insert({ user_id: userId, display_name: displayName })
    .select("display_name");

  // Two of this person's own requests racing -- two tabs, or a double submit
  // -- is the only way this can arrive after a row already exists, and then
  // the primary key refuses it rather than anything being overwritten
  // silently. That is the right way round: the page says it did not save, and
  // saving again works, because by then the update above finds the row.
  if (insertError) redirect("/teams?problem=profile");

  // The same read-back on the insert path, which the old version did not have at
  // all: it checked only that there was no error.
  if (
    !inserted ||
    inserted.length === 0 ||
    (inserted[0] as { display_name?: unknown }).display_name !== displayName
  ) {
    redirect("/teams?problem=profile");
  }

  revalidatePath("/teams");
  redirect("/teams?named=1");
}

// Send an invitation, or send an existing one again.
//
// ONE ACTION FOR BOTH, AND ONE FUNCTION BEHIND IT. The Try again button beside a
// failed invitation on My teams submits this same action with the address in a
// hidden field, so a retry goes through exactly the checks a first invitation does
// -- the suspension check, the owner check, the already-in-the-team check and the
// 20-pending limit, in that order, none of them skipped because the row happens to
// exist. invite-member is what notices there is already a row and decides whether
// it may be sent again (its `retryVerdict`); nothing here decides that, and nothing
// here needs to know which of the two happened until it reads the answer.
//
// TWO BUTTONS, TOLD APART BY IDENTIFIER (Build it 19 rule 6). This is the one
// action in the app that serves more than one button, and before this the only
// thing distinguishing "Send invitation" from "Try again" was which hidden fields
// the surrounding form happened to carry. Now each button says which it is, by a
// fixed identifier that is nothing like its label.
export async function inviteMember(formData: FormData) {
  if (
    !pressed(formData.get(ACT_FIELD), [
      BUTTON_IDS.inviteSend,
      BUTTON_IDS.inviteRetry,
    ])
  ) {
    redirect("/teams?problem=button");
  }

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
    const outcome = await outcomeOf(error, "invite-member");
    redirect(`/teams?problem=invite&outcome=${outcome}`);
  }

  revalidatePath("/teams");

  // On staging the email goes to the test inbox instead of the invited person.
  // Saying so on screen stops a tester concluding the invitation failed because
  // nothing arrived at the address they typed.
  const redirected = (data as { redirected?: unknown } | null)?.redirected === true;

  const answered = (data as { invitation?: { id?: unknown } } | null)?.invitation;
  const retried = (data as { retried?: unknown } | null)?.retried === true;

  // ---- THE READ-BACK (Build it 19 rule 3) ---------------------------------
  //
  // The banner's wording comes from THE ROW, read here, out of the database.
  //
  // Build it 18 already stopped it coming from "the request worked" and made it
  // come from the status in the function's answer, which was the bigger half of
  // this. This is the rest: the function reports what its own query returned, and
  // what the owner is about to look at is a fresh read of the same table. Reading
  // it here means the banner and the list underneath cannot disagree -- and if the
  // row cannot be read at all, the banner does not claim a status for it.
  //
  // The row is readable: invitations' one select policy answers the team's owner,
  // which is who this is. No new rule and no secret key.
  const invitationId = answered?.id;

  if (typeof invitationId !== "string" || invitationId === "") {
    // An answer with no id -- which is what an older deployed function gives.
    // Nothing to read back, so nothing is claimed about the status.
    redirect("/teams?invited=sending");
  }

  const { data: row, error: rowError } = await supabase
    .from("invitations")
    .select("status")
    .eq("id", invitationId)
    .maybeSingle();

  // Anything that is not the word 'sent' in the row falls to "sending", which is
  // the honest reading of a row nobody has confirmed: the email went -- the
  // function only answers 201 when it did -- and the row does not say so.
  //
  // A failed read lands here too, and that is right. "We could not read it back"
  // is not "it was sent".
  const sent =
    !rowError &&
    row !== null &&
    (row as { status?: unknown }).status === "sent";

  if (!sent) {
    // No `to=test` here: the one thing worth saying is that the row does not know
    // the email went, and where the message was addressed is a smaller fact than
    // that.
    redirect("/teams?invited=sending");
  }

  const what = retried ? "again" : "sent";
  redirect(redirected ? `/teams?invited=${what}&to=test` : `/teams?invited=${what}`);
}
