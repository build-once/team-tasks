"use server";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { INVITE_REASONS, type InviteReason } from "@/lib/teams";

// Read the machine code accept-invite returns, and nothing else.
//
// WHY A CODE AND NOT THE MESSAGE. An earlier version put the function's own
// message into ?error= and the page printed it. That let anyone craft a link to
// this site that displayed words they chose -- a plausible-looking "your account
// has been suspended, telephone this number" on our own domain, with our own
// styling. The page now receives a short code from a known list and picks its
// own wording, so the worst a crafted link can do is show one of our messages
// at the wrong moment.
//
// The code is validated here as well as in the page. Belt and braces: the page
// is the one that must not be fooled, but an unknown code should not travel any
// further than it has to.
async function reasonFrom(error: unknown): Promise<InviteReason> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      const reason = (body as { reason?: unknown } | null)?.reason;
      if (
        typeof reason === "string" &&
        (INVITE_REASONS as readonly string[]).includes(reason)
      ) {
        return reason as InviteReason;
      }
    } catch {
      // Not JSON, or already read. Fall through to the status below.
    }

    // No usable code in the body: fall back to the HTTP status, which the
    // function controls and a caller cannot forge.
    //
    // THE 403 LINE IS A GUESS, and since 4 October 2026 there are two causes it
    // cannot tell apart: the invitation belongs to another address, and the
    // caller's account is suspended (issue #133). Both answer 403. Which one it
    // was travels in the body as `reason`, read above -- so this line is only
    // reached when the body could not be read at all, and then "wrong_person" is
    // the older and more likely of the two. The fix for a suspended person is
    // not to change this guess but to make sure the code above reaches them:
    // "account_suspended" is in INVITE_REASONS, which is what lets it through.
    const status = error.context?.status;
    if (status === 404) return "not_found";
    if (status === 410) return "expired";
    if (status === 409) return "used";
    if (status === 403) return "wrong_person";
    return "failed";
  }

  // A relay or network error: nothing was reached, so nothing is known.
  return "unreachable";
}

// Runs ONLY when somebody presses Accept.
//
// This is the whole reason the page does not accept on load: mail clients,
// link previewers and security scanners fetch URLs in emails automatically and
// without being asked. A page that accepted on load would burn the invitation
// before the invited person ever saw it -- and because an invitation cannot be
// accepted twice, they would then be told it had "already been used".
export async function acceptInvite(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();

  if (!token) redirect("/invite/missing?reason=not_found");

  const supabase = await createClient();

  const { error } = await supabase.functions.invoke("accept-invite", {
    body: { token },
  });

  if (error) {
    const reason = await reasonFrom(error);
    // Back to the invitation page, not to My teams: the message is about this
    // link, and the person may need to sign in as somebody else and retry.
    redirect(`/invite/${encodeURIComponent(token)}?reason=${reason}`);
  }

  revalidatePath("/teams");
  redirect("/teams?joined=1");
}
