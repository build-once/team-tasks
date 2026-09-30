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
