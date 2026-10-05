// create-team -- the only way a team gets created.
//
// docs/plan.md, feature 2: "Create a team: a name of 1 to 60 characters. One
// person may own at most 3 teams."
//
// Why this exists at all, rather than an insert from the browser: the teams
// table has NO insert policy (supabase/migrations/20260930101343_create_teams.sql),
// so the app's publishable key cannot write to it. This function holds the
// secret key and is the single place those two limits are checked.
//
// WHERE THE SECRET KEY COMES FROM. Nowhere in this repository. SUPABASE_URL and
// SUPABASE_SECRET_KEYS are pre-populated in the function's own settings on
// Supabase, and withSupabase reads them for us -- the official guidance is
// "withSupabase reads these for you, so prefer it over reading keys by hand".
// So there is no key in this file, no key in .env, and nothing for the secret
// scanners in docs/secrets.md to find. See docs/architecture.md.
//
// Written against the official guides, read 2026-09-30:
//   https://supabase.com/docs/guides/functions/quickstart
//   https://supabase.com/docs/guides/functions/auth
//   https://supabase.com/docs/guides/ai-tools/ai-prompts/edge-functions
//   https://supabase.com/docs/reference/server/types-userclaims
//
// DEPLOYED TO STAGING on 2026-09-30, by the owner from their own terminal. Not
// deployed to production; no production deploy of this function exists yet.
// What staging is running was tested there -- evidence/create-team.md records
// what was checked, including a deliberately broken version used to prove the
// error checks below actually fire.
//
// THE SUSPENDED-ACCOUNT CHECK BELOW IS ON STAGING AND NOT IN PRODUCTION, as of
// 5 October 2026. It arrived with issue #133, part B of Build it 16 step 5. The
// owner deployed this branch's three functions to staging and ran
// scripts/staging/build-it-16-suspend-checks.mjs --expect-suspended with the test
// account Bob's account_status row in place: 14 PASS, 1 FAIL, and the one failure
// was in accept-invite's refusal body, not in this function.
//
// So a suspended person can no longer create a team on STAGING. PRODUCTION is
// still running this file without the check, because code reaches production only
// through a pull request the owner merges (rule 19) -- and the assistant has
// deployed nothing anywhere. evidence/build-it-16-suspend-functions.md records
// what the staging run showed and what is still unproved.

// Both names below resolve through the import map in deno.json, and both are
// pinned there to an EXACT version -- no ^ and no ~ (rule 17, Lesson A4):
//
//   jsr:@supabase/functions-js@2.117.2
//   npm:@supabase/server@1.9.0
//
// A range means the code that runs in production is chosen at build time by
// whatever the registry happens to serve, which is somebody else's code arriving
// with our permissions and no review. `functions new` scaffolded ^2 and ^1;
// those were replaced with the versions above, read from each specifier's own
// registry on 2026-09-30 -- npm for @supabase/server (`npm view`), and JSR for
// functions-js, because a jsr: specifier does not come from npm at all.
//
// deno.json is kept as strict JSON, with no comments, because the edge runtime's
// import-map parser has not been shown to accept JSONC here. That is why this
// note lives in this file instead.
//
// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const NAME_MIN = 1;
const NAME_MAX = 60;
const MAX_TEAMS_PER_OWNER = 3;

function fail(message: string, status: number, code?: string) {
  // One shape for every failure, so the page can always read `error`.
  return Response.json({ error: message, code }, { status });
}

// ---------------------------------------------------------------------------
// The suspended-account check (issue #133)
// ---------------------------------------------------------------------------
//
// WHY THIS IS IN TYPESCRIPT AT ALL, when suspension is a database feature.
// 20261004114313_suspend_accounts.sql adds one restrictive policy per table, and
// those policies decide for the app's own users. They do NOT decide here: this
// function writes with ctx.supabaseAdmin, which connects as `service_role`, and
// the Supabase roles page says of that role, "This role is used by the API
// (PostgREST) to bypass Row Level Security." So every rule in that migration is
// skipped on this path. Observed on staging on 4 October 2026: the owner
// suspended the test account Bob, pressed Create team as him, and the team was
// written (evidence/build-it-16-suspend-accounts.md section 8).
//
// AND IT MUST NOT CALL public.is_active(). That function answers about
// auth.uid(), and an admin connection has no signed-in user -- so auth.uid() is
// null and the answer is false for EVERY caller. It would not error; this
// function would simply refuse everybody, silently. Measured as `service_role`
// with no session: `is_active()` returns `f` (same file, section 5 step M7). So
// the table is read by user id instead, which is what the migration's
// `grant select on table public.account_status to service_role` is for, and
// which step M8 confirms works with no session.
//
// WHAT IS NEVER DONE HERE: no insert, update or delete on account_status -- the
// privilege is deliberately not granted, so an attempt would fail with 42501 --
// and the `reason` column is never selected, never returned and never logged.
// docs/plan.md marks it sensitive and says nobody reads it through the app.

// The one code every refusal uses, in all three functions. A caller learns a
// code and nothing else: no reason, no timestamp, no mention of a table.
const SUSPENDED_CODE = "account_suspended";

// Neutral, true, and blaming nothing else. docs/plan.md says this version does
// not decide what a suspended person is told, and issue #134 holds the fuller
// question -- so this says the least it can while still being honest, and it is
// deliberately NOT a message written for another cause.
const SUSPENDED_MESSAGE = "You can't do that at the moment.";

// THE REFUSAL ITSELF, exported so that supabase/functions/_tests/suspension_test.ts
// reads the body THIS function sends rather than a body the test writes out for
// itself. Same argument as the `checkSuspension` export below: a test that spells
// out `{ error, code }` by hand passes whatever the function actually does.
//
// That is not a hypothetical. On 5 October 2026 the owner ran
// scripts/staging/build-it-16-suspend-checks.mjs --expect-suspended against the
// deployed functions and got 14 PASS, 1 FAIL: accept-invite's copy of this call
// sent no `code` at all, because its `fail` takes the reason third and the code
// fourth and the call passed three arguments. Every test in this repository
// passed, because nothing here looked at a body. Now they do.
//
// `fail` here takes (message, status, code), so the body is `{ error, code }`
// with no `reason` field -- right for this function, because only accept-invite's
// caller, the /invite/[token] page, picks its wording from a reason.
export function suspendedRefusal(): Response {
  return fail(SUSPENDED_MESSAGE, 403, SUSPENDED_CODE);
}

// Three answers, not two. "I could not tell" is the one that matters: a read
// that failed does not mean "not suspended", and this file already argues the
// same shape about its team count -- "that is not a zero -- it is an unknown,
// and treating an unknown as zero is how a limit gets bypassed."
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
//
// Identical in create-team, invite-member and accept-invite, on purpose and in
// the same way hashToken is identical across the latter two: if one changes the
// others must change with it, and the test asserts all three agree.
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
    return { allowed: true };
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

export default {
  // auth: "user" is what makes this signed-in only. The platform verifies the
  // caller's sign-in token before our code runs, and hands us the verified
  // claims on ctx. An unsigned or expired token never reaches the body below.
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    // The caller's id comes from the VERIFIED token and from nowhere else.
    // UserClaims.id is documented as "User's unique ID (same as JWTClaims.sub)".
    // Nothing in the request body is ever consulted for identity: if it were,
    // any signed-in person could create teams owned by somebody else.
    const ownerId = ctx.userClaims?.id;
    if (!ownerId) {
      // Should be unreachable with auth: "user". Fail closed rather than guess.
      return fail("You must be signed in to create a team.", 401);
    }

    // ---- Is this account suspended? --------------------------------------
    //
    // BEFORE `await req.json()`, and that position is the point rather than
    // tidiness: a suspended caller is refused before a body is parsed and
    // before the team count below is run. Nothing is read about them and
    // nothing is written for them.
    const suspension = await checkSuspension(() =>
      ctx.supabaseAdmin
        .from("account_status")
        .select("user_id")
        .eq("user_id", ownerId)
        .limit(1)
    );
    if (!suspension.allowed) {
      if (suspension.why === "suspended") {
        return suspendedRefusal();
      }
      // Fail closed. The read did not answer, so whether this person may act is
      // not known -- and an unknown is not a "no row". This is a different
      // refusal from the one above, with a different status and a different
      // message, because its cause is a failed check rather than a suspension.
      return fail(
        "Could not check your account, so no team was created. Please try again.",
        500,
        suspension.code,
      );
    }

    // A malformed body is the caller's mistake, not a server fault.
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("Expected a JSON body with a team name.", 400);
    }

    const rawName = (body as { name?: unknown } | null)?.name;
    if (typeof rawName !== "string") {
      return fail("Please give the team a name.", 400);
    }

    // Trim before measuring, so "   " is empty rather than three characters.
    // This matches the teams_name_not_blank and teams_name_length constraints.
    const name = rawName.trim();
    if (name.length < NAME_MIN) {
      return fail("Please give the team a name.", 400);
    }
    if (name.length > NAME_MAX) {
      return fail(
        `A team name can be at most ${NAME_MAX} characters. That one is ${name.length}.`,
        400,
      );
    }

    // ---- Limit: fewer than 3 teams already owned -------------------------
    //
    // Counted with supabaseAdmin rather than the caller's own client on
    // purpose. The caller's client would read the same rows through the select
    // policy today -- but if that policy were ever narrowed or dropped, the
    // count would quietly come back 0 and the limit would fail OPEN, letting
    // somebody own any number of teams. A cap should not depend on a read rule.
    //
    // head: true asks for the count without the rows.
    const { count, error: countError } = await ctx.supabaseAdmin
      .from("teams")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId);

    // Lesson F14: check the error AND check what came back.
    if (countError) {
      return fail(
        "Could not check how many teams you already own, so no team was created. Please try again.",
        500,
        countError.code,
      );
    }
    if (typeof count !== "number") {
      // No error, but no number either. That is not a zero -- it is an unknown,
      // and treating an unknown as zero is how a limit gets bypassed.
      return fail(
        "Could not check how many teams you already own, so no team was created. Please try again.",
        500,
      );
    }
    if (count >= MAX_TEAMS_PER_OWNER) {
      // No "delete one and try again": there is no way to delete a team, so that
      // advice would send somebody looking for a button that does not exist.
      // This is the message the page shows in its Banner, word for word.
      return fail(`You own ${count} teams, the most allowed.`, 409);
    }

    // ---- Insert ----------------------------------------------------------
    //
    // owner_id is the verified id from above. The table has no insert policy,
    // so this only works because supabaseAdmin carries the secret key.
    const { data: inserted, error: insertError } = await ctx.supabaseAdmin
      .from("teams")
      .insert({ name, owner_id: ownerId })
      .select("id, name, created_at");

    // Lesson F14 again, and this is the half that usually gets skipped: an
    // insert can report no error and still have written nothing.
    if (insertError) {
      return fail(
        "Could not create the team. Please try again.",
        500,
        insertError.code,
      );
    }
    if (!Array.isArray(inserted) || inserted.length !== 1) {
      const wrote = Array.isArray(inserted) ? inserted.length : 0;
      return fail(
        `The team may not have been created: the database reported no error but returned ${wrote} rows instead of 1. Please check your teams before trying again.`,
        500,
      );
    }

    return Response.json({ team: inserted[0] }, { status: 201 });
  }),
};

// Deliberately no console.log anywhere above. docs/plan.md decided "Logs: we add
// none of our own", and that team names and email addresses never go into a log
// line from server code. A team name is free text somebody typed, so it is not
// logged even on failure. The Postgres error CODE is returned instead, which
// carries no personal data and is enough to tell a constraint violation from a
// connection fault.
