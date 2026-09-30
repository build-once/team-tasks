"use server";

import { FunctionsHttpError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const MESSAGE_MAX = 200;

async function messageFrom(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      const message = (body as { error?: unknown } | null)?.error;
      if (typeof message === "string" && message.trim() !== "") {
        return message.trim().slice(0, MESSAGE_MAX);
      }
    } catch {
      // Not JSON, or already read. Fall through.
    }
    return "This invitation could not be accepted. Please try again.";
  }

  return "Could not reach the server to accept this invitation. Please try again.";
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

  if (!token) redirect("/teams?error=This%20invitation%20link%20is%20incomplete.");

  const supabase = await createClient();

  const { error } = await supabase.functions.invoke("accept-invite", {
    body: { token },
  });

  if (error) {
    const message = await messageFrom(error);
    // Back to the invitation page, not to My teams: the message is about this
    // link, and the person may need to sign in as somebody else and retry.
    redirect(`/invite/${encodeURIComponent(token)}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/teams");
  redirect("/teams?joined=1");
}
