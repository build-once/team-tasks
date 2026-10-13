import { NextResponse, type NextRequest } from "next/server";

import { listFilesForExport } from "@/lib/attachment-store";
import {
  EXPORT_REFUSED,
  EXPORT_UNKNOWN,
  buildExport,
  exportFileName,
} from "@/lib/export-data";
import { rememberUserForErrorReports } from "@/lib/sentry-user";
import { createClient } from "@/lib/supabase/server";

// Download what this app holds about you, as one file.
//
// Build it 26, PR 3. docs/deletion.md section 11 is the design;
// web/src/lib/export-data.ts is the half that decides what ends up in the file,
// and this is the half that makes the requests.
//
// ---------------------------------------------------------------------------
// WHOSE RIGHTS EVERY REQUEST HERE CARRIES, which is the whole design
// ---------------------------------------------------------------------------
//
// The caller's. Every read below goes through the client
// web/src/lib/supabase/server.ts builds from THIS REQUEST'S cookies, so each one
// arrives at Supabase carrying that person's own session and the publishable
// key, and the row-level policies decide what comes back.
//
// THERE IS NO SERVICE-ROLE KEY IN THIS FILE, and there is none anywhere in
// web/src. docs/deletion.md says why in one line: "nearly everything in it is
// something the person can already read through row-level security with their
// own session", so the POLICIES are what keep the file to their own data and no
// new privilege is granted to anybody by this feature.
//
// IT IS A ROUTE AND NOT A SERVER ACTION, and that is the one design decision
// worth defending here: a GET that answers with a Content-Disposition header is
// an ordinary download, which NEEDS NO JAVASCRIPT. Attaching a file is the only
// thing in this app that does, and docs/architecture.md records that as a cost
// rather than a precedent.
//
// ---------------------------------------------------------------------------
// THE THREE THINGS IT REFUSES, AND WHY TWO OF THEM ARE THE SAME SHAPE
// ---------------------------------------------------------------------------
//
//   no signed-in caller  -> /login. src/proxy.ts already turns a signed-out
//                           visitor away, because "/settings" is not in
//                           PUBLIC_PATHS; this is the backstop, and it uses
//                           getClaims() rather than getSession(), which would
//                           trust a cookie anyone can forge.
//   a suspended account  -> /settings?problem=exportrefused. docs/plan.md's
//                           decision 7 of 2026-10-12: a suspended person uses
//                           the request page, not the app.
//   is_active() UNREAD   -> /settings?problem=exportunknown, AND THAT IS THE
//                           ONE WORTH READING TWICE. An unknown is not a yes.
//                           For a suspended person every policy returns
//                           nothing, so carrying on would build an EMPTY file
//                           headed "everything Team Tasks holds about one
//                           person" -- which is the worst sentence this feature
//                           could produce. The same way round as create-team
//                           counting teams: an unknown is not a zero.
//
// A FAILED READ OF ANYTHING ELSE IS NOT A REFUSAL. The file is still built, the
// section says `could_not_be_read`, its name is listed at the top and
// `complete` is false. A download cannot draw a banner, so the file has to say
// it -- and buildExport is where that happens.
//
// ---------------------------------------------------------------------------
// WHAT IT NEVER DOES
// ---------------------------------------------------------------------------
//
// It writes nothing: there is no INSERT, UPDATE or DELETE in this file, and
// nothing is counted. The owner's decision 9 of 2026-10-12 is that the export is
// NOT counted against a daily limit, "and what bounds it is Supabase's own
// per-IP limits and nothing else" -- which docs/deletion.md section 11.4 states
// plainly rather than implying, because it means a loop holding one person's
// session can ask for their own file as often as the platform allows.
//
// And it logs nothing and reports nothing. docs/plan.md forbids a file's name
// reaching an error report, and the storage listings below carry names somebody
// else's phone chose.

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  // ---- who is asking ------------------------------------------------------
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const userId = claimsData.claims.sub;
  rememberUserForErrorReports(userId);

  // ---- is this account active? -------------------------------------------
  //
  // public.is_active(), which 20261004114313_suspend_accounts.sql grants to
  // `authenticated`. It takes no arguments: who is asking comes from auth.uid()
  // inside its own body, so there is no parameter here that could be pointed at
  // somebody else.
  const { data: activeData, error: activeError } =
    await supabase.rpc("is_active");

  if (activeError) {
    return NextResponse.redirect(
      new URL(`/settings?problem=${EXPORT_UNKNOWN}`, req.url),
    );
  }
  if (activeData !== true) {
    return NextResponse.redirect(
      new URL(`/settings?problem=${EXPORT_REFUSED}`, req.url),
    );
  }

  // ---- the account itself -------------------------------------------------
  //
  // getUser() rather than the claims, because the claims do not carry when the
  // account was made. It validates the token with the Auth server, so it is not
  // a weaker check than getClaims() -- it is a second, more expensive one, made
  // only after the gate above has already passed.
  const { data: userData, error: userError } = await supabase.auth.getUser();

  // ---- the profile row, and the setting -----------------------------------
  //
  // NAMED COLUMNS, NEVER A STAR. After 20261007204900_ai_suggestions_consent.sql
  // the table-level SELECT on `profiles` was revoked and given back column by
  // column, so a `select *` by a signed-in caller fails outright. These three
  // are what `authenticated` holds.
  //
  // maybeSingle() because there is at most one row -- user_id is the primary
  // key -- and because NO ROW IS AN ORDINARY ANSWER: an account has no profile
  // until somebody saves a nickname (issue #207). buildExport tells that apart
  // from a failed read, and must.
  const profileAnswer = await supabase
    .from("profiles")
    .select("display_name, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  // The setting goes through the function and never through a select: no client
  // role holds SELECT on either consent column, so an ordinary read is refused
  // with 42501 for this person's own row, every time.
  const consentAnswer = await supabase.rpc("my_ai_suggestions");
  const consentRow = Array.isArray(consentAnswer.data)
    ? consentAnswer.data[0]
    : consentAnswer.data;

  // ---- the rows ------------------------------------------------------------
  //
  // THE TASKS QUERY FILTERS BY owner_id, and that filter is load-bearing: the
  // SELECT policy on `tasks` returns every task in every team this person
  // belongs to, written by anybody. `ownRowsOnly` in export-data.ts checks the
  // same thing again on the rows that come back, which is the lock that would
  // catch this filter being removed.
  //
  // `id` is selected and is NOT exported. It is here for one job: a storage
  // listing is by prefix, and a task's prefix is its id.
  const tasksAnswer = await supabase
    .from("tasks")
    .select("id, title, done, created_at, team_id, owner_id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  // Every team the policy returns -- `is_team_member(id)` -- which is every team
  // owned or belonged to. Two sections are built from it, plus the names used by
  // the tasks and the invitations.
  const teamsAnswer = await supabase
    .from("teams")
    .select("id, name, created_at, owner_id");

  // Their own membership rows, for joined_at. The policy is
  // `auth.uid() = user_id`, so this returns nobody else's -- and it deliberately
  // cannot list who else is in a team.
  const membershipsAnswer = await supabase
    .from("team_members")
    .select("team_id, joined_at")
    .eq("user_id", userId);

  // The invitations they sent. The only policy on this table is the team
  // OWNER's, so a member reads nothing here at all; the filter on `invited_by`
  // narrows it from "my teams' invitations" to "the ones I sent", which is what
  // docs/deletion.md section 11.2 asks for.
  //
  // `token_hash` IS NOT SELECTED, and would be dropped by buildExport even if it
  // were: it is the hash of a credential.
  const invitationsAnswer = await supabase
    .from("invitations")
    .select("team_id, email, status, failure_code, created_at, expires_at")
    .eq("invited_by", userId);

  // ---- and the files on those tasks ---------------------------------------
  //
  // Only when the tasks read worked, because there would be nothing to list and
  // no title to attach a file to. buildExport says the same thing from the other
  // end, so a change here cannot produce a files section with nothing to hang on.
  const taskIds = (tasksAnswer.data ?? [])
    .map((row) => (row as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string" && id !== "");

  const files = tasksAnswer.error
    ? { failed: true as const }
    : await listFilesForExport(supabase, taskIds);

  // ---- the file ------------------------------------------------------------
  const generatedAt = new Date().toISOString();

  const file = buildExport({
    generatedAt,
    userId,
    account: {
      failed: Boolean(userError) || !userData?.user,
      email: userData?.user?.email,
      created_at: userData?.user?.created_at,
    },
    profile: {
      failed: Boolean(profileAnswer.error),
      row: profileAnswer.data ?? null,
    },
    aiSuggestions: {
      failed: Boolean(consentAnswer.error),
      enabled: (consentRow as { enabled?: unknown } | null)?.enabled,
      changed_at: (consentRow as { changed_at?: unknown } | null)?.changed_at,
    },
    tasks: { failed: Boolean(tasksAnswer.error), rows: tasksAnswer.data },
    teams: { failed: Boolean(teamsAnswer.error), rows: teamsAnswer.data },
    memberships: {
      failed: Boolean(membershipsAnswer.error),
      rows: membershipsAnswer.data,
    },
    invitations: {
      failed: Boolean(invitationsAnswer.error),
      rows: invitationsAnswer.data,
    },
    files:
      "listings" in files
        ? {
            failed: files.failed,
            listings: files.listings,
            tasksNotListed: files.notListed,
          }
        : { failed: true },
  });

  // Two spaces, because a person opens this in a text editor and a single line
  // of JSON is not a file anybody can read.
  const body = `${JSON.stringify(file, null, 2)}\n`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // The download, with a name that says nothing about the person --
      // exportFileName is a fixed word and a date, and web/src/lib/export-data.ts
      // says why that matters more than it looks.
      "content-disposition": `attachment; filename="${exportFileName(generatedAt)}"`,
      // NO-STORE, AND IT IS NOT A PERFORMANCE SETTING. This body is everything
      // this app holds about one person. Nothing between here and their browser
      // may keep a copy of it -- not a CDN, not a proxy, not the back button.
      "cache-control": "no-store, max-age=0, must-revalidate",
      // A JSON body a browser might otherwise sniff as something to render.
      "x-content-type-options": "nosniff",
    },
  });
}
