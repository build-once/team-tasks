// accept-invite -- turns a valid invitation token into a team membership.
//
// docs/plan.md, feature 3. The counterpart to invite-member: that one creates
// the invitation and emails a token, this one redeems it.
//
// Neither invitations nor team_members has an insert or update policy
// (supabase/migrations/20260930193813_create_invitations.sql), so the app's
// publishable key cannot write to either. This function holds the secret key.
//
// THE FOUR REFUSALS, each with its own message, because "that did not work" is
// useless to somebody holding an email link: not found, expired, already used,
// and addressed to somebody else.
//
// Written against the same official guides as create-team and invite-member:
//   https://supabase.com/docs/guides/functions/auth
//   https://supabase.com/docs/reference/server/types-userclaims
//
// Imports pinned to exact versions in deno.json (rule 17, Lesson A4).
//
// NOT DEPLOYED. This file has never been pushed to any project.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// `reason` is a short machine code -- not_found, expired, used, wrong_person,
// signin, failed -- which the /invite/[token] page maps to its own fixed
// wording. `code` stays what it was: a Postgres error code, where there is one.
//
// Two separate fields on purpose. The page must never print text that arrived
// from outside, so what crosses that boundary is a code from a known list; the
// human-readable `message` here is for the API's own callers and for logs.
type Reason =
  | "not_found"
  | "expired"
  | "used"
  | "wrong_person"
  | "signin"
  | "failed";

function fail(
  message: string,
  status: number,
  reason: Reason,
  code?: string,
) {
  return Response.json({ error: message, reason, code }, { status });
}

// SHA-256, hex-encoded. Identical to invite-member's, on purpose: the whole
// scheme rests on both sides hashing the same way, so if one ever changes the
// other must change with it.
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default {
  // auth: "user" plus verify_jwt = true in supabase/config.toml. This function
  // needs the caller's verified EMAIL, not only their id, so an unverified
  // token would defeat the whole point of the address check below.
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const userId = ctx.userClaims?.id;
    const userEmail = ctx.userClaims?.email;

    if (!userId) {
      return fail("You must be signed in to accept an invitation.", 401, "signin");
    }
    if (typeof userEmail !== "string" || userEmail.trim() === "") {
      // Without an email on the token there is nothing to compare, and
      // accepting anyway would let any signed-in person take any invitation.
      // Fail closed.
      return fail(
        "Your account has no email address on it, so this invitation cannot be checked. Please sign in again.",
        403,
        "signin",
      );
    }
    const callerEmail = userEmail.trim().toLowerCase();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("Expected a JSON body with an invitation token.", 400, "failed");
    }

    const rawToken = (body as { token?: unknown } | null)?.token;
    if (typeof rawToken !== "string" || rawToken.trim() === "") {
      return fail("This invitation link is missing its token.", 400, "not_found");
    }

    const tokenHash = await hashToken(rawToken.trim());

    // ---- Find the invitation by hash --------------------------------------
    //
    // Looked up by hash, never by id from the request: the hash IS the proof of
    // possession. The plain token is not stored anywhere, so this is the only
    // way to recognise it.
    const { data: rows, error: findError } = await ctx.supabaseAdmin
      .from("invitations")
      .select("id, team_id, email, expires_at, accepted_at")
      .eq("token_hash", tokenHash)
      .limit(1);

    // Lesson F14: the error AND what came back.
    if (findError) {
      return fail(
        "Could not check this invitation, so nothing was changed. Please try again.",
        500,
        "failed",
        findError.code,
      );
    }
    if (!Array.isArray(rows)) {
      return fail(
        "Could not check this invitation, so nothing was changed. Please try again.",
        500,
        "failed",
      );
    }
    if (rows.length === 0) {
      return fail(
        "This invitation link is not valid. It may have been withdrawn, or the link may be incomplete.",
        404,
        "not_found",
      );
    }

    const invitation = rows[0];

    // ---- The four refusals, in the order that tells the most truth ---------
    //
    // "Already used" is checked before "expired": an invitation that was
    // accepted and has since passed its expiry date was used, and saying
    // "expired" would send somebody looking for a new invitation they do not
    // need.
    if (invitation.accepted_at !== null) {
      return fail(
        "This invitation has already been used.",
        409,
        "used",
      );
    }

    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      return fail(
        "This invitation has expired. Invitations last 7 days -- ask the team's owner to send a new one.",
        410,
        "expired",
      );
    }

    // Case-insensitive. The stored address is already lowercase (the migration
    // has a constraint saying so), and the caller's was lowercased above, so
    // this is a plain comparison of two normalised values rather than a clever
    // one.
    if (invitation.email !== callerEmail) {
      return fail(
        "This invitation was sent to a different email address. Sign in with the address the invitation was sent to, then open the link again.",
        403,
        "wrong_person",
      );
    }

    // ---- Claim it ----------------------------------------------------------
    //
    // THE ORDER MATTERS. The invitation is claimed FIRST, with
    // "where accepted_at is null" as part of the update, and only then is the
    // membership row written.
    //
    // Two people -- or one person double-clicking, or a mail client opening the
    // link twice -- race here. The update is the gate: whoever's update returns
    // a row won, and the loser's returns none, because accepted_at is no longer
    // null. Checking accepted_at and then updating would leave a window between
    // the two where both callers see null.
    const { data: claimed, error: claimError } = await ctx.supabaseAdmin
      .from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id)
      .is("accepted_at", null)
      .select("id, team_id");

    if (claimError) {
      return fail(
        "Could not accept this invitation. Please try again.",
        500,
        "failed",
        claimError.code,
      );
    }
    // Exactly one row, or this caller did not win the race. Zero rows means
    // somebody else claimed it a moment ago; more than one would mean the id
    // filter matched several rows, which should be impossible and is worth
    // refusing rather than ignoring.
    if (!Array.isArray(claimed) || claimed.length !== 1) {
      const affected = Array.isArray(claimed) ? claimed.length : 0;
      if (affected === 0) {
        return fail(
          "This invitation has just been used.",
          409,
          "used",
        );
      }
      return fail(
        `This invitation could not be accepted safely: the update affected ${affected} rows instead of 1. Nothing further was changed.`,
        500,
        "failed",
      );
    }

    // ---- Add the membership ------------------------------------------------
    //
    // The primary key on (team_id, user_id) makes a duplicate impossible, so a
    // unique violation here means the person was already a member. That is not
    // an error worth showing: the invitation is claimed and they are in the
    // team, which is what they asked for.
    const { data: member, error: memberError } = await ctx.supabaseAdmin
      .from("team_members")
      .insert({ team_id: invitation.team_id, user_id: userId })
      .select("team_id, user_id");

    if (memberError) {
      if (memberError.code === "23505") {
        // Already a member. Succeed.
        return Response.json(
          { team_id: invitation.team_id, already_member: true },
          { status: 200 },
        );
      }
      // The invitation is claimed but the membership was not written. Say so
      // precisely -- this is a state somebody has to fix by hand, and a vague
      // "please try again" would send them round a loop that cannot succeed,
      // because the invitation can no longer be claimed a second time.
      console.error(
        `accept-invite: invitation ${invitation.id} was marked accepted but the team_members row failed to insert. Error code: ${memberError.code ?? "none"}. This needs fixing by hand.`,
      );
      return fail(
        "Your invitation was accepted but adding you to the team did not finish. Please tell the team's owner rather than trying again -- the invitation cannot be used twice.",
        500,
        "failed",
        memberError.code,
      );
    }
    if (!Array.isArray(member) || member.length !== 1) {
      const wrote = Array.isArray(member) ? member.length : 0;
      console.error(
        `accept-invite: invitation ${invitation.id} was marked accepted but the team_members insert returned ${wrote} rows instead of 1. This needs fixing by hand.`,
      );
      return fail(
        "Your invitation was accepted but adding you to the team did not finish. Please tell the team's owner rather than trying again -- the invitation cannot be used twice.",
        500,
        "failed",
      );
    }

    return Response.json(
      { team_id: invitation.team_id, already_member: false },
      { status: 200 },
    );
  }),
};

// The two console.error calls above print an invitation id and a Postgres error
// code, and nothing else. No token, no hash, no email address, no team name --
// docs/plan.md: "task text and email addresses never go into a log line from
// server code". An invitation id identifies a row, not a person, and is useless
// without database access; it is there because both messages describe a state
// that needs fixing by hand, and the person fixing it needs to know which row.
