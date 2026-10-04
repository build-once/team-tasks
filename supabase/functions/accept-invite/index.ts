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
// DEPLOYED TO STAGING AND TO PRODUCTION. Staging first, by the owner from their
// own terminal; production on the merge of PR #44, by the `deploy-functions` job
// in .github/workflows/migrate-production.yml. Both are recorded in
// evidence/invitations.md -> "What is deployed where", written 2026-10-01.
//
// That same file records what production has NOT seen of this function: nobody
// has ever accepted an invitation there. The button press, the atomic claim and
// the team_members write are proven on staging only.
//
// This line used to say the file had never been pushed to any project, which was
// untrue from the moment PR #44 merged (issue #111). Read what follows as code
// that is running in production: it is.
//
// WITH ONE EXCEPTION, as of 4 October 2026: THE SUSPENDED-ACCOUNT CHECK BELOW IS
// DEPLOYED NOWHERE. It arrived with issue #133, part B of Build it 16 step 5, and
// the assistant deploys nothing (rule 19 permits `functions deploy` against
// staging; it was not used). So what staging and production are running is this
// file WITHOUT that check, and a suspended person can still accept an invitation
// on both until the owner deploys. evidence/build-it-16-suspend-functions.md
// says what was proved and where.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// `reason` is a short machine code -- not_found, expired, used, wrong_person,
// signin, failed, account_suspended -- which the /invite/[token] page maps to its
// own fixed wording. `code` stays what it was: a Postgres error code, where there
// is one.
//
// Two separate fields on purpose. The page must never print text that arrived
// from outside, so what crosses that boundary is a code from a known list; the
// human-readable `message` here is for the API's own callers and for logs.
//
// account_suspended ADDED 4 OCTOBER 2026 (issue #133), and it has to exist rather
// than the refusal borrowing an existing code. web/src/app/invite/[token]/
// actions.ts accepts a reason only if it is in INVITE_REASONS, and otherwise
// falls back to the HTTP status -- where 403 reads as "wrong_person". So without
// this code a suspended person would be told the invitation was sent to a
// different email address, and sent off to sign in with an account they do not
// have. Adding a code here is only half of it: INVITE_REASONS in
// web/src/lib/teams.ts and the message map in that page must carry it too, or
// the fallback happens anyway.
type Reason =
  | "not_found"
  | "expired"
  | "used"
  | "wrong_person"
  | "signin"
  | "failed"
  | "account_suspended";

function fail(
  message: string,
  status: number,
  reason: Reason,
  code?: string,
) {
  return Response.json({ error: message, reason, code }, { status });
}

// ---------------------------------------------------------------------------
// The suspended-account check (issue #133)
// ---------------------------------------------------------------------------
//
// Identical to create-team's and invite-member's, on purpose and for the same
// reason hashToken is identical to invite-member's: one question, asked the same
// way in all three places, so that if one ever changes the others must change
// with it. supabase/functions/_tests/suspension_test.ts imports all three and asserts
// they agree, so a copy that drifts is a failing test rather than a hole.
//
// WHY THIS IS IN TYPESCRIPT AT ALL, when suspension is a database feature.
// 20261004114313_suspend_accounts.sql adds one restrictive policy per table, and
// those policies decide for the app's own users. They do NOT decide here: this
// function reads and writes with ctx.supabaseAdmin, which connects as
// `service_role`, and the Supabase roles page says of that role, "This role is
// used by the API (PostgREST) to bypass Row Level Security." So every rule in
// that migration is skipped on this path.
//
// WHY THE POSITION OF THE CALL MATTERS MORE HERE THAN ANYWHERE ELSE. The claim
// below is one-shot: `update ... where accepted_at is null` can succeed exactly
// once, ever. Claiming an invitation and then refusing the caller would burn it
// for good, and the invited person would be told forever that it "has already
// been used" -- a refusal that destroys the thing it is refusing. So the check
// runs before the body is even parsed, which is before the lookup and a long way
// before the claim.
//
// AND IT MUST NOT CALL public.is_active(). That function answers about
// auth.uid(), and an admin connection has no signed-in user -- so auth.uid() is
// null and the answer is false for EVERY caller. It would not error; this
// function would simply refuse everybody, silently. Measured as `service_role`
// with no session: `is_active()` returns `f`
// (evidence/build-it-16-suspend-accounts.md section 5, step M7). So the table is
// read by user id instead, which is what the migration's `grant select on table
// public.account_status to service_role` is for, and which step M8 confirms
// works with no session.
//
// WHAT IS NEVER DONE HERE: no insert, update or delete on account_status -- the
// privilege is deliberately not granted, so an attempt would fail with 42501 --
// and the `reason` column is never selected, never returned and never logged.
// docs/plan.md marks it sensitive and says nobody reads it through the app.

// The one code every refusal uses, in all three functions. A caller learns a
// code and nothing else: no reason, no timestamp, no mention of a table.
//
// It is both the `code` field and the `reason` field here, deliberately: the
// page needs a reason from INVITE_REASONS to pick its wording, and inventing a
// second word for the same refusal would be two vocabularies for one event.
const SUSPENDED_CODE = "account_suspended";

// Neutral, true, and blaming nothing else. docs/plan.md says this version does
// not decide what a suspended person is told, and issue #134 holds the fuller
// question -- so this says the least it can while still being honest, and it is
// deliberately NOT a message written for another cause. The page has its own
// copy of this wording, because it never prints text that arrived over the wire.
const SUSPENDED_MESSAGE = "You can't do that at the moment.";

// Three answers, not two. "I could not tell" is the one that matters: a read
// that failed does not mean "not suspended", and an unknown refused is the shape
// this project keeps choosing -- invite-member's comments say "an unknown is not
// a zero" about its two counts.
export type SuspensionVerdict =
  | { allowed: true }
  | { allowed: false; why: "suspended" }
  | { allowed: false; why: "unknown"; code?: string };

// The read itself is passed IN, as a function that performs it. Two reasons,
// and the second is the one that made this the shape rather than passing the
// client:
//
//   * supabase/functions/_tests/suspension_test.ts can hand this a read that FAILS, and
//     so prove the fail-closed branch below without a database, a key or a
//     network. It exercises this very function, not a copy of it;
//   * the query stays written out at the call site, in the handler, where a
//     reviewer can see which table and which column it reads. An earlier version
//     took the admin client as a narrowed structural type instead, and
//     `deno check` refused it: TS2589, "Type instantiation is excessively deep
//     and possibly infinite", because matching the generated client against a
//     hand-written shape instantiates its generics. A cast would have silenced
//     that by switching the check off, which is the opposite of the point.
//
// `data: unknown` because nothing here cares what the row contains. Only whether
// there is one. The `reason` column is never selected.
export type AccountStatusRead = () => PromiseLike<{
  data: unknown;
  error: { code?: string } | null;
}>;

// Is this person allowed to act? Exported so the test runs THIS function rather
// than a copy of it.
export async function checkSuspension(
  read: AccountStatusRead,
): Promise<SuspensionVerdict> {
  let answer: { data: unknown; error: { code?: string } | null };
  try {
    answer = await read();
  } catch {
    // A thrown error -- the network, the client itself -- is still an unknown.
    // Nothing about the cause is returned or logged.
    return { allowed: false, why: "unknown" };
  }

  // Lesson F14: the error AND what came back.
  if (answer?.error) {
    return { allowed: false, why: "unknown", code: answer.error.code };
  }
  if (!Array.isArray(answer?.data)) {
    // No error and no array either. Not an empty result -- an unanswered
    // question, which is refused rather than guessed at.
    return { allowed: false, why: "unknown" };
  }
  if (answer.data.length > 0) {
    return { allowed: false, why: "suspended" };
  }
  return { allowed: true };
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

    // ---- Is this account suspended? --------------------------------------
    //
    // After the two identity checks, because the read needs a user id -- and
    // before everything else, which is the part that matters. See "WHY THE
    // POSITION OF THE CALL MATTERS MORE HERE THAN ANYWHERE ELSE" above: the
    // claim is one-shot, so refusing after it would destroy the invitation.
    //
    // A side effect worth naming, because a staging check leans on it: a
    // suspended caller is refused even for a token that does not exist, since
    // nothing is looked up before this point. That is what shows the check runs
    // before any lookup or claim, and it tells the caller nothing -- a made-up
    // token and a real one get the identical answer.
    const suspension = await checkSuspension(() =>
      ctx.supabaseAdmin
        .from("account_status")
        .select("user_id")
        .eq("user_id", userId)
        .limit(1)
    );
    if (!suspension.allowed) {
      if (suspension.why === "suspended") {
        return fail(SUSPENDED_MESSAGE, 403, SUSPENDED_CODE);
      }
      // Fail closed. The read did not answer, so whether this person may act is
      // not known -- and an unknown is not a "no row". Reported as "failed",
      // which is this function's existing code for "something broke, nothing
      // changed": the invitation is untouched and trying again is reasonable,
      // which is not true of the refusal above.
      return fail(
        "Could not check your account, so nothing was changed. Please try again.",
        500,
        "failed",
        suspension.code,
      );
    }

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

    // NO UUID CHECK HERE, and that is not an omission.
    //
    // invite-member validates its team_id as a UUID before querying, because a
    // malformed one reached a uuid column and came back as Postgres 22P02 and a
    // misleading 500. This function has no equivalent: the token is the ONLY
    // value it takes from the request, and it is never used as an id.
    //
    //   * the token is hashed first, and hashToken returns 64 hex characters for
    //     any input whatsoever, so token_hash is always a well-formed value for
    //     a text column;
    //   * the two id-shaped filters below -- invitation.id and
    //     invitation.team_id -- come from a row the DATABASE returned, so they
    //     are already valid uuids;
    //   * nothing else from the request reaches a query.
    //
    // So there is no input that can provoke a cast error. If this function ever
    // takes an id from a caller, it needs the same check invite-member has.

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
