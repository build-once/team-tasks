// invite-member -- the only way an invitation gets created.
//
// docs/plan.md, feature 3: "Invite people to a team by email: an invitation
// expires after 7 days, and a team may have at most 20 pending."
//
// The invitations table has NO insert policy
// (supabase/migrations/20260930193813_create_invitations.sql), so the app's
// publishable key cannot write to it. This function holds the secret key and is
// the single place the ownership check and the 20-pending limit happen.
//
// WHERE THE KEYS COME FROM. Nowhere in this repository. SUPABASE_URL and
// SUPABASE_SECRET_KEYS are pre-populated in the function's own settings on
// Supabase and withSupabase reads them; EMAIL_API_KEY, EMAIL_FROM, APP_URL and
// the delivery settings are set by the owner in the same place, per project.
// No value is ever logged -- see the note at the end of this file.
//
// Written against the official guides:
//   https://supabase.com/docs/guides/functions/quickstart
//   https://supabase.com/docs/guides/functions/auth
//   https://supabase.com/docs/guides/ai-tools/ai-prompts/edge-functions
//   https://supabase.com/docs/reference/server/types-userclaims
// and Resend's current send-email reference:
//   https://resend.com/docs/api-reference/emails/send-email
//
// Both imports are pinned to exact versions in deno.json (rule 17, Lesson A4).
//
// NOT DEPLOYED. This file has never been pushed to any project.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const MAX_PENDING_PER_TEAM = 20;
const TOKEN_BYTES = 32; // 32 random bytes = 256 bits. See makeToken below.

function fail(message: string, status: number, code?: string) {
  // One shape for every failure, so the page can always read `error`.
  return Response.json({ error: message, code }, { status });
}

// A URL-safe token from at least 32 random bytes of cryptographic randomness.
//
// crypto.getRandomValues is the Web Crypto API, available in the Edge runtime.
// Math.random() would be catastrophic here: the token is the only thing standing
// between a stranger and joining somebody's team, so it has to be unguessable,
// not merely unpredictable-looking.
function makeToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  // Base64url, so the token survives being pasted into a URL unescaped.
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// SHA-256 of the token, hex-encoded: 64 characters, matching the
// invitations_token_hash_shape constraint in the migration.
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Work out where this email may be sent, BEFORE anything is written to the
// database. Returns either a refusal or a decided recipient and subject.
//
// The order is deliberate and is the whole point of doing this first: an
// invitation that exists but whose email was never sent is worse than no
// invitation, because it occupies one of the team's 20 pending slots and the
// person it names never heard about it.
//
// EMAIL_TEST_INBOX wins over EMAIL_DELIVERY on purpose. If a test inbox is set
// at all, that is somebody saying "do not send to real people from here", and
// that instruction should not be overridable by another setting sitting beside
// it. Staging sets the test inbox; production sets EMAIL_DELIVERY=live.
type Delivery =
  | { ok: true; to: string; subject: string; redirected: boolean }
  | { ok: false; message: string; missing: string[] };

function decideDelivery(invitedEmail: string, teamName: string): Delivery {
  const env = Deno.env;

  const apiKey = (env.get("EMAIL_API_KEY") ?? "").trim();
  const from = (env.get("EMAIL_FROM") ?? "").trim();
  const appUrl = (env.get("APP_URL") ?? "").trim();
  const testInbox = (env.get("EMAIL_TEST_INBOX") ?? "").trim();
  const delivery = env.get("EMAIL_DELIVERY") ?? "";

  // The three settings that are required whatever the delivery mode.
  const missing: string[] = [];
  if (apiKey === "") missing.push("EMAIL_API_KEY");
  if (from === "") missing.push("EMAIL_FROM");
  if (appUrl === "") missing.push("APP_URL");
  if (missing.length > 0) {
    return {
      ok: false,
      message:
        `Invitations are not configured on this environment, so no invitation was created. ` +
        `Missing: ${missing.join(", ")}.`,
      missing,
    };
  }

  if (testInbox !== "") {
    // Redirected. The real address goes in the subject so a tester can tell the
    // messages apart -- it is not a leak: the test inbox belongs to whoever set
    // this up, and they already have the invitation list.
    return {
      ok: true,
      to: testInbox,
      subject: `[staging] invitation for ${invitedEmail}`,
      redirected: true,
    };
  }

  // Exactly "live". Not "true", not "Live", not "1". A delivery switch that
  // accepts near-misses is a switch that turns itself on by accident.
  if (delivery === "live") {
    return {
      ok: true,
      to: invitedEmail,
      subject: `You have been invited to ${teamName}`,
      redirected: false,
    };
  }

  return {
    ok: false,
    message:
      `This environment is not allowed to send invitation emails, so no invitation was created. ` +
      `Set EMAIL_TEST_INBOX to redirect mail, or EMAIL_DELIVERY to "live" to send to real people.`,
    missing: ["EMAIL_TEST_INBOX", "EMAIL_DELIVERY"],
  };
}

// POST to Resend. Built from Resend's current reference:
// https://resend.com/docs/api-reference/emails/send-email
//
//   POST https://api.resend.com/emails
//   Authorization: Bearer re_xxxxxxxxx
//   Content-Type: application/json
//   body: { from, to, subject, text }   -- from/to/subject required
//   success body: { "id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }
//
// Plain fetch, no package (rule 17).
//
// TEXT ONLY, never html. The team name is free text somebody typed, and a team
// called `<img onerror=...>` in an HTML email is a scripting hole in whatever
// mail client opens it. Plain text cannot be interpreted that way, and this app
// has no need for a styled email.
async function sendEmail(args: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: args.from,
        to: args.to,
        subject: args.subject,
        text: args.text,
      }),
    });
  } catch {
    // Network-level failure: nothing was sent, and no status to read.
    return { ok: false, reason: "the email service could not be reached" };
  }

  // A 2xx status ALONE is not success. Read the body and require an id.
  if (!response.ok) {
    return { ok: false, reason: `the email service answered ${response.status}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      reason: "the email service answered 2xx with a body that was not JSON",
    };
  }

  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || id === "") {
    // 2xx with no id means we cannot say an email exists. Treat as a failure:
    // reporting success here would leave an invitation nobody was told about.
    return {
      ok: false,
      reason: "the email service answered 2xx but returned no email id",
    };
  }

  return { ok: true, id };
}

export default {
  // auth: "user" plus verify_jwt = true in supabase/config.toml: the platform
  // verifies the caller's token before this code runs.
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    // The caller's id comes from the VERIFIED token and nowhere else.
    // UserClaims.id is documented as "User's unique ID (same as JWTClaims.sub)".
    const callerId = ctx.userClaims?.id;
    if (!callerId) {
      return fail("You must be signed in to invite somebody.", 401);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("Expected a JSON body with a team id and an email.", 400);
    }

    const rawTeamId = (body as { team_id?: unknown } | null)?.team_id;
    const rawEmail = (body as { email?: unknown } | null)?.email;

    if (typeof rawTeamId !== "string" || rawTeamId.trim() === "") {
      return fail("Which team is this invitation for?", 400);
    }
    if (typeof rawEmail !== "string") {
      return fail("Please give an email address to invite.", 400);
    }

    const teamId = rawTeamId.trim();
    // Lowercased here, so it matches the invitations_email_lowercase constraint
    // and so accept-invite's comparison is case-insensitive by construction.
    const email = rawEmail.trim().toLowerCase();

    if (email === "") {
      return fail("Please give an email address to invite.", 400);
    }
    // Deliberately loose. Address validity is settled by whether the mail
    // arrives, not by a regular expression; this only catches obvious typos.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return fail("That does not look like an email address.", 400);
    }
    if (email.length > 320) {
      return fail("That email address is too long.", 400);
    }

    // ---- Only the team's owner may invite ---------------------------------
    //
    // Read with supabaseAdmin and check owner_id here, rather than relying on
    // the caller's own client returning nothing for somebody else's team. Both
    // would work today; this one keeps working if the select policy changes,
    // and it lets "not your team" be told apart from "no such team".
    const { data: team, error: teamError } = await ctx.supabaseAdmin
      .from("teams")
      .select("id, name, owner_id")
      .eq("id", teamId)
      .limit(1);

    // Lesson F14: check the error AND what came back.
    if (teamError) {
      return fail(
        "Could not check the team, so no invitation was created. Please try again.",
        500,
        teamError.code,
      );
    }
    if (!Array.isArray(team) || team.length !== 1) {
      // Zero rows: no such team. Deliberately the same answer as "not yours",
      // so this cannot be used to discover which team ids exist.
      return fail("That team was not found.", 404);
    }
    if (team[0].owner_id !== callerId) {
      return fail("Only the team's owner can invite people.", 403);
    }
    const teamName = String(team[0].name ?? "");

    // ---- Limit: fewer than 20 PENDING invitations -------------------------
    //
    // Pending means not accepted and not expired. An expired or accepted
    // invitation does not occupy a slot, which is what stops a team being
    // permanently full because of invitations that went nowhere.
    const nowIso = new Date().toISOString();
    const { count: pendingCount, error: countError } = await ctx.supabaseAdmin
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .is("accepted_at", null)
      .gt("expires_at", nowIso);

    if (countError) {
      return fail(
        "Could not check how many invitations this team already has, so none was created. Please try again.",
        500,
        countError.code,
      );
    }
    if (typeof pendingCount !== "number") {
      // No error but no number is an unknown, not a zero. Treating it as zero
      // is how a limit gets bypassed.
      return fail(
        "Could not check how many invitations this team already has, so none was created. Please try again.",
        500,
      );
    }
    if (pendingCount >= MAX_PENDING_PER_TEAM) {
      return fail(
        `This team has ${pendingCount} invitations waiting, the most allowed. Wait for some to be accepted or to expire.`,
        409,
      );
    }

    // ---- Decide delivery BEFORE writing anything --------------------------
    //
    // Required by the delivery rules, and worth restating: if this environment
    // may not send, nothing is created at all. No invitation, no wasted slot.
    const decision = decideDelivery(email, teamName);
    if (!decision.ok) {
      // Names the settings. Never their values -- see the note at the end.
      console.error(
        `invite-member refused: email delivery not configured. Settings involved: ${decision.missing.join(", ")}. No value is logged.`,
      );
      return fail(decision.message, 503);
    }

    // ---- Create the invitation --------------------------------------------
    const token = makeToken();
    const tokenHash = await hashToken(token);

    const { data: inserted, error: insertError } = await ctx.supabaseAdmin
      .from("invitations")
      .insert({
        team_id: teamId,
        email,
        token_hash: tokenHash,
        invited_by: callerId,
      })
      .select("id, email, expires_at");

    if (insertError) {
      // 23505 is unique_violation: the partial unique index means this address
      // already has a live invitation to this team.
      if (insertError.code === "23505") {
        return fail(
          "That person already has an invitation waiting for this team.",
          409,
          insertError.code,
        );
      }
      return fail(
        "Could not create the invitation. Please try again.",
        500,
        insertError.code,
      );
    }
    if (!Array.isArray(inserted) || inserted.length !== 1) {
      const wrote = Array.isArray(inserted) ? inserted.length : 0;
      return fail(
        `The invitation may not have been created: the database reported no error but returned ${wrote} rows instead of 1. Please check the team's invitations before trying again.`,
        500,
      );
    }
    const invitationId = inserted[0].id;

    // ---- Send the email ---------------------------------------------------
    //
    // The link's host comes ONLY from APP_URL. Never from a request header:
    // Host, X-Forwarded-Host and Origin are all attacker-controlled, and a link
    // built from one would let somebody send a real invitation pointing at a
    // site they own, harvesting the token when it is opened.
    const appUrl = (Deno.env.get("APP_URL") ?? "").trim().replace(/\/+$/, "");
    const link = `${appUrl}/invite/${token}`;

    const text = [
      `You have been invited to join the team "${teamName}" on Team Tasks.`,
      ``,
      `Open this link to accept:`,
      link,
      ``,
      `The link works for 7 days, and only for ${email}.`,
      `Sign in or sign up with that address first, then open the link again.`,
      ``,
      `If you were not expecting this, you can ignore this email.`,
    ].join("\n");

    const sent = await sendEmail({
      apiKey: (Deno.env.get("EMAIL_API_KEY") ?? "").trim(),
      from: (Deno.env.get("EMAIL_FROM") ?? "").trim(),
      to: decision.to,
      subject: decision.subject,
      text,
    });

    if (!sent.ok) {
      // The email did not go. Remove the invitation just created, so the team
      // is not left with a slot used up by an invitation nobody received and
      // nobody can act on.
      const { error: cleanupError, count: deletedCount } = await ctx.supabaseAdmin
        .from("invitations")
        .delete({ count: "exact" })
        .eq("id", invitationId);

      // F14 on the cleanup too. If this fails, say so plainly rather than
      // reporting a tidy failure -- somebody has to know a row was orphaned.
      if (cleanupError || deletedCount !== 1) {
        console.error(
          `invite-member: email send failed AND the invitation could not be removed. Invitation id ${invitationId} is orphaned and occupies a pending slot. Cleanup error code: ${cleanupError?.code ?? "none"}; rows deleted: ${deletedCount ?? "unknown"}.`,
        );
        return fail(
          `The invitation email could not be sent (${sent.reason}), and the half-made invitation could not be cleaned up. Please check the team's invitations before trying again.`,
          500,
        );
      }

      return fail(
        `The invitation email could not be sent (${sent.reason}), so no invitation was created. Please try again.`,
        502,
      );
    }

    return Response.json(
      {
        invitation: {
          id: inserted[0].id,
          email: inserted[0].email,
          expires_at: inserted[0].expires_at,
        },
        // True when the email went to the test inbox instead of the invited
        // person, so a staging tester is not left wondering.
        redirected: decision.redirected,
      },
      { status: 201 },
    );
  }),
};

// ABOUT LOGGING, because this function handles more sensitive material than any
// other in the project.
//
// The two console.error calls above name SETTINGS and an invitation id. They
// never print:
//   * any setting's value -- not EMAIL_API_KEY, not EMAIL_FROM, not APP_URL,
//     not EMAIL_TEST_INBOX, not EMAIL_DELIVERY;
//   * the token, or its hash;
//   * the invited email address, or the team name, both of which are personal
//     data under docs/plan.md's appendix.
//
// docs/plan.md decided "Logs: we add none of our own ... task text and email
// addresses never go into a log line from server code". The two lines here are
// the narrow exception that decision allows for: a misconfiguration and a failed
// cleanup both need to be discoverable, and neither message contains anything
// personal or secret.
