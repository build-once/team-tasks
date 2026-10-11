"use server";

// The only place an emailed token is spent, and it happens on a BUTTON PRESS.
//
// Build it 25 part 1, issue #284.
//
// ---------------------------------------------------------------------------
// WHY A POST AND NOT A GET
// ---------------------------------------------------------------------------
//
// Supabase names the problem on its own documentation: "certain email providers
// may have spam detection or other security features that prefetch URL links
// from incoming emails"
// (https://supabase.com/docs/guides/auth/auth-email-templates, "Email
// prefetching", read 2026-10-11), and one of the two remedies it gives is to
// "create a custom link that redirects to a confirmation page where users click
// a button containing the actual confirmation link".
//
// The owner watched the first half happen on 11 October 2026: their mail
// provider rewrites links through a scanner, which made a HEAD request to the
// link before anybody clicked it.
//
// So web/src/app/auth/confirm/page.tsx draws a form and verifies NOTHING, and
// this action -- which only a press can reach -- is where `verifyOtp` is
// called. A scanner's GET or HEAD costs the person nothing.
//
// ---------------------------------------------------------------------------
// WHAT THIS FUNCTION TAKES FROM THE REQUEST, AND WHAT IT REFUSES TO
// ---------------------------------------------------------------------------
//
// It takes the token hash and the kind of link, both out of hidden fields the
// page put there, and both re-read through the same two functions the page used
// (`readTokenHash`, `readLinkType`) rather than trusted because the page wrote
// them. A post made by hand reaches this action without going through the page
// at all, which is the only reason those checks are here twice.
//
// IT TAKES NO DESTINATION. Supabase's documented route reads a `next`
// parameter and redirects to it; this one will not. Where each kind of link
// goes is `destinationAfter` in web/src/lib/email-links.ts, which returns one
// of two fixed paths. Issue #120 rule 2 settled that for /auth/reset and the
// same answer holds here: a destination taken out of a link is a destination
// somebody else chooses.
//
// NOTHING IS LOGGED AND NOTHING IS PRINTED. The token hash is a credential
// until it is spent, so it goes from the form into `verifyOtp` and nowhere
// else: not into a redirect, not into a cookie, not into a message. There is no
// console call in this file and none anywhere under web/src.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ACT_FIELD, BUTTON_IDS, pressed } from "@/lib/buttons";
import { linkRefusedPath } from "@/lib/auth-messages";
import {
  LINK_TYPE_FIELD,
  TOKEN_HASH_FIELD,
  destinationAfter,
  readLinkType,
  readTokenHash,
} from "@/lib/email-links";
import {
  RESET_MARKER_COOKIE,
  RESET_MARKER_MAX_AGE_SECONDS,
} from "@/lib/password-reset";
import { createClient } from "@/lib/supabase/server";

// What a press this page did not make is worth, and what a token hash or a kind
// of link this app does not recognise is worth: the same as a link that did not
// work, and nothing is sent.
//
// A constant rather than a value built in the function, for the reason
// web/src/app/auth/actions.ts gives about `NOT_THIS_BUTTON`: the refusal is one
// thing, said in one place, so a reader does not have to compare three
// branches to see that they agree.
const NOTHING_USABLE = { name: "", status: null, code: null };

export async function useEmailLink(formData: FormData) {
  // THE BUTTON, BY IDENTIFIER, never by its wording (Build it 19 rule 6). This
  // is the half that makes a prefetch harmless: a GET carries no form fields at
  // all, so it cannot get past this line, and nothing below it runs.
  const token = pressed(formData.get(ACT_FIELD), [BUTTON_IDS.linkUse])
    ? readTokenHash(formData.get(TOKEN_HASH_FIELD))
    : null;

  const type = readLinkType(formData.get(LINK_TYPE_FIELD));

  if (token === null || type === null) {
    redirect(linkRefusedPath(NOTHING_USABLE));
  }

  const supabase = await createClient();

  // `type` is one of two words from a fixed list, checked above. Everything
  // else Supabase can issue -- an email change, an invitation, a magic link --
  // never reaches this call. web/src/lib/email-links.ts has the full argument,
  // including the one thing about it that is not confirmed.
  const { error } = await supabase.auth.verifyOtp({
    token_hash: token,
    type,
  });

  // Chosen from the code, never from the text Supabase sent
  // (web/src/lib/auth-messages.ts). A link that has expired is told it has
  // expired; a rate limit is told it is a rate limit; anything else is told the
  // link did not work and offered another, which for a LINK is the honest
  // default -- and is the one place in this app where that sentence is still
  // the fallback.
  if (error) redirect(linkRefusedPath(error));

  // THE MARKER, and only for a recovery link. It is what lets
  // /reset-password draw the form at all, and
  // web/src/lib/password-reset.ts says at length what it is and what it is not:
  // the authority to change a password is the session Supabase just created,
  // and this cookie only decides what the screen says.
  //
  // httpOnly so no script can read or write it; sameSite lax so it survives the
  // hop from the email; secure wherever the page was served over https, which
  // is everywhere except plain-http localhost, where the owner tests.
  if (type === "recovery") {
    const cookieStore = await cookies();
    cookieStore.set({
      name: RESET_MARKER_COOKIE,
      value: "1",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: RESET_MARKER_MAX_AGE_SECONDS,
    });
  }

  revalidatePath("/", "layout");

  // One of two fixed paths, decided by the kind of link and by nothing in the
  // address bar.
  redirect(destinationAfter(type));
}
