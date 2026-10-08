"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ACT_FIELD, BUTTON_IDS, pressed } from "@/lib/buttons";
import {
  CONSENT_OFF,
  CONSENT_ON,
  consentState,
  savedAs,
} from "@/lib/consent";
import { rememberUserForErrorReports } from "@/lib/sentry-user";
import { createClient } from "@/lib/supabase/server";
import { DISPLAY_NAME_MAX } from "@/lib/teams";

// settings/actions.ts -- the one write in this app that changes whether somebody's
// words may leave it.
//
// Build it 21 part 2b, issue #211.
//
// NO SERVER FUNCTION, AND NO SECRET KEY. The same argument the nickname write makes
// (web/src/app/teams/actions.ts): everything that must be true of this setting is true
// of the single row being written, and that is what a row-level policy does well. The
// existing "You can change your own profile" policy decides the ROW -- both its `using`
// and its `with check` are `(select auth.uid()) = user_id` -- and
// 20261007204900_ai_suggestions_consent.sql's `grant update (ai_suggestions_enabled) on
// table public.profiles to authenticated` decides the COLUMN. Between them: the person,
// their own row, that one column.
//
// AND NOTHING ELSE CAN DO IT, which is what docs/plan.md asks for in its plainest
// words -- "Not their team's owner, not another member, not the owner of the app on
// their behalf". The same migration revoked service_role's table-level UPDATE and gave
// back only the three old columns, so no server function can switch this for anybody
// either. There is no code path in this repository, and no role, that changes one
// person's setting on another person's behalf.
//
// ---------------------------------------------------------------------------
// THE TWO TRAPS ISSUE #207 FOUND, AND WHERE EACH ONE IS HANDLED HERE
// ---------------------------------------------------------------------------
//
// 1. THE WRITE MUST NOT ASK FOR A REPRESENTATION OF THE NEW COLUMNS. No client role
//    holds SELECT on `ai_suggestions_enabled`, so `.update({...}).select(
//    "ai_suggestions_enabled")` is refused with 42501 -- for the person's own row,
//    every time. `web/src/app/teams/actions.ts` is the existing pattern that DOES ask
//    for one, so this is a real trap for whoever copies it.
//
//    So the update below selects `user_id`, which `authenticated` does still hold
//    SELECT on. That tells this action the one thing the shape of the write cannot:
//    whether a row was touched at all. It says nothing about the value, which is why
//    the read-back is a separate call.
//
// 2. A PERSON WITH NO PROFILE ROW HAS NOTHING TO UPDATE. `UPDATE 0`, silently -- and
//    `profiles.display_name` is `not null` with no default, so a row cannot be created
//    without a nickname either way. Issue #211 asks that such a person CAN still
//    switch the setting on, so the form carries a nickname box when there is no row,
//    and this action inserts the profile first and then writes the setting. Two
//    statements, because `authenticated` has no INSERT grant on the setting's column:
//    a profile row can never arrive already switched on.
//
//    SWITCHING OFF WITH NO PROFILE ROW WRITES NOTHING AT ALL, and that is collecting
//    less rather than laziness: with no row the setting is already off, so creating a
//    row to record "off" would store a nickname this person never asked to store, to
//    say something that was already true.
//
// ---------------------------------------------------------------------------
// "SAVED" ONLY AFTER THE SETTING HAS BEEN READ BACK -- Build it 19's rule
// ---------------------------------------------------------------------------
//
// The read-back is a second call to `public.my_ai_suggestions()`, and it is the only
// thing that decides which banner the page draws. Not the absence of an error: a
// write that returned cleanly and a database that holds something else are the exact
// pair that rule exists for.
//
// AND AN UNREADABLE READ-BACK IS NOT A SAVE, which is the uncomfortable half. The
// write may well have worked; this action does not know, so it says `unconfirmed`
// rather than claiming either way. On a setting that governs where personal data goes,
// a confident wrong answer is the worst of the three.

export async function saveAiSuggestions(formData: FormData) {
  // The press is authorised by the identifier, never by the label (web/src/lib/
  // buttons.ts). Anything this app did not write changes nothing.
  if (!pressed(formData.get(ACT_FIELD), [BUTTON_IDS.aiSuggestionsSave])) {
    redirect("/settings?problem=button");
  }

  // THE SWITCH ITSELF. A checkbox, so what arrives is either the string "on" or
  // nothing at all -- an unchecked box submits no field. Read as "is it exactly the
  // string this form sends", so no other value can mean yes.
  //
  // WHY A CHECKBOX AND NOT TWO BUTTONS. A checkbox beside a Save button is the shape
  // somebody can read as a setting rather than as an action, and it needs no
  // JavaScript: this page is rendered on the server and the form posts.
  const wanted = formData.get("ai_suggestions") === "on";

  // The nickname, if the form carried one. Only used when there is no profile row.
  const nickname = String(formData.get("display_name") ?? "").trim();

  const supabase = await createClient();

  // From the verified token, not from the form and not from getSession(), which would
  // trust a cookie anyone can forge. If it were wrong in either direction the update
  // policy would refuse it anyway -- its `using` is (select auth.uid()) = user_id --
  // but a write about consent should not rest on a policy catching a mistake.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    // Not "save failed": the session could not be read at all, so the honest next
    // step is to sign in again.
    redirect("/login");
  }

  // So an error report from the rest of this action carries who hit it, by id and
  // nothing else (issue #157). After the redirect above, so it only runs with a
  // verified token in hand.
  rememberUserForErrorReports(userId);

  // ---- The write -------------------------------------------------------
  //
  // `.select("user_id")` and NOT the setting's own column. See trap 1 above: asking
  // for the setting back would be refused with 42501 and this action would report a
  // failure on a write that had worked. user_id is the one column it may ask for that
  // proves a row was touched, and it is this person's own id -- nothing is learned
  // from it that was not already in hand.
  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ ai_suggestions_enabled: wanted })
    .eq("user_id", userId)
    .select("user_id");

  if (updateError) redirect("/settings?problem=failed");

  let touched = Array.isArray(updated) && updated.length > 0;

  // ---- No row to write on ----------------------------------------------
  if (!touched) {
    if (!wanted) {
      // ALREADY OFF, AND NOTHING WRITTEN. See trap 2: with no profile row the setting
      // is off, so there is nothing to change and no reason to create a row holding a
      // nickname nobody asked to store. The read-back below will confirm `off`, and
      // the banner will say so truthfully.
      touched = true;
    } else if (nickname === "" || nickname.length > DISPLAY_NAME_MAX) {
      // Switching ON with no row and no usable nickname. Said plainly rather than
      // leaving a switch that appears to do nothing, which is issue #207's whole
      // complaint: "A switch that silently does nothing is worse than one that is not
      // there, because the person believes they have turned something on."
      redirect(
        `/settings?problem=${nickname === "" ? "needname" : "badname"}`,
      );
    } else {
      // The profile row first, naming the two columns a client role may insert and no
      // more. It cannot carry the setting: `authenticated` has no INSERT grant on
      // that column, which is what keeps "off for every new row" true at the
      // privilege layer as well as at the default.
      const { error: insertError } = await supabase
        .from("profiles")
        .insert({ user_id: userId, display_name: nickname })
        .select("user_id");

      // Two of this person's own requests racing -- two tabs, a double submit -- is
      // the only way this arrives after a row already exists, and then the primary key
      // refuses it rather than anything being overwritten silently.
      if (insertError) redirect("/settings?problem=failed");

      // And now the setting, on the row that exists.
      const { data: second, error: secondError } = await supabase
        .from("profiles")
        .update({ ai_suggestions_enabled: wanted })
        .eq("user_id", userId)
        .select("user_id");

      if (secondError) redirect("/settings?problem=failed");
      touched = Array.isArray(second) && second.length > 0;
    }
  }

  if (!touched) {
    // A row that still was not touched after all of that. The likeliest cause is the
    // restrictive "Suspended accounts are refused everything" policy, and this action
    // deliberately does not say so: docs/plan.md leaves what a suspended person is
    // told to a later version, and a screen guessing at it would be inventing a
    // message nobody agreed.
    redirect("/settings?problem=failed");
  }

  // ---- The read-back, which is the only thing that may say "saved" -----
  //
  // THE RPC, not a select: no client role may read the column. It takes no arguments,
  // so this cannot be pointed at anybody else's setting even by mistake.
  const { data: readBack, error: readError } = await supabase.rpc(
    "my_ai_suggestions",
  );

  const state = consentState({ failed: Boolean(readError), data: readBack });

  revalidatePath("/settings");
  revalidatePath("/tasks");

  if (!savedAs(wanted, state)) {
    // Either the read-back did not answer, or it answered with the opposite of what
    // was asked for. Both are "not confirmed" rather than "saved" or "failed".
    redirect("/settings?problem=unconfirmed");
  }

  redirect(`/settings?saved=${wanted ? CONSENT_ON : CONSENT_OFF}`);
}
