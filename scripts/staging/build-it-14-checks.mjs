#!/usr/bin/env node
// build-it-14-checks.mjs -- the Alice / Bob / Carol checks for the team rules
// migration (Build it 14 part A, issue #75), run against STAGING only.
//
// WHAT IT IS FOR. 20261002122203_team_rules.sql widens two read rules from
// owner-only to member-level, adds a profiles table, a security definer function
// and a view. Every one of those is a decision about who may see what, and the
// only way to know a rule works is to be the person it is supposed to refuse.
// So this signs in as each of the three test accounts in turn and asks the
// database the questions the rules are supposed to answer:
//
//   Bob (an outsider)  must be refused Alice's team entirely.
//   Alice (the owner)  must see the team's roster: herself and Carol.
//   Carol (a member)   must see the same roster, which is the new part --
//                      before this migration she could not see the team at all.
//   A signed-out caller must be refused the view and the function.
//
// It only ever READS. No row is created, changed or deleted by this script, so
// running it twice leaves staging exactly as it found it.
//
// IT PROVES NOTHING UNTIL THE MIGRATION IS APPLIED. Run before that, every check
// fails with "relation does not exist" or similar, which is the honest answer.
//
// BEFORE IT CAN PASS, staging needs three things that are nobody's code:
//   1. the migration applied;
//   2. a display name set for Alice and for Carol (there is no screen for this
//      yet -- part B builds it -- so the owner inserts the two rows by hand);
//   3. Carol accepted an invitation to Alice's team, so she has a team_members
//      row for it.
// The pull request for #75 lists these in order.
//
// NO PACKAGES. The repository root has no dependencies and no node_modules, so
// this uses Node built-ins only -- global fetch, needs Node 18 or newer. Every
// endpoint below was read from the installed clients in web/node_modules rather
// than recalled:
//
//   POST {url}/auth/v1/token?grant_type=password   body {email,password}
//        -- @supabase/auth-js GoTrueClient.js, signInWithPassword
//   POST {url}/auth/v1/logout?scope=global
//        -- @supabase/auth-js GoTrueAdminApi.js
//   GET  {url}/rest/v1/{relation}?select=a,b&col=eq.value
//        -- @supabase/postgrest-js PostgrestQueryBuilder.ts (url.searchParams
//           .set('select', ...)) and PostgrestFilterBuilder.ts (append(column,
//           `eq.${value}`)); the /rest/v1 prefix is SupabaseClient.ts line 401
//   POST {url}/rest/v1/rpc/{function}             body = the named arguments
//        -- @supabase/postgrest-js PostgrestClient.ts, rpc()
//   the API key travels in the `apikey` header; Authorization carries the user's
//        JWT -- @supabase/functions-js invoke remarks
//
// WHAT IT NEVER PRINTS: a password, an access token, a refresh token, the
// publishable key, an email address, a user id, a team name or a display name.
// Only counts, true/false, roles, HTTP statuses, and PostgREST's error text when
// a request fails. The three people are named Alice, Bob and Carol, which is
// what docs/environments.md calls them.
//
// Run it from the repository root. See the bottom of this file.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The staging project's reference. This script may run against NOTHING ELSE.
//
// It is read-only, which makes it safer than its neighbour -- but pointed at
// production it would be signing in to a real database and reading real
// people's rows, which is exactly what AGENTS.md rules 1 and 10 forbid. So the
// check below is a refusal to start, not a warning.
const STAGING_REF = "ghskxrhqlhvrhpnivqbd";

// The shape Postgres accepts for a uuid column: 8-4-4-4-12 hex digits.
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(HERE, "..", "..", "web", ".env.local");

function die(message) {
  console.error(`\nREFUSING TO RUN: ${message}\n`);
  process.exit(1);
}

// A small .env reader, the same one bob-invites-to-alices-team.mjs uses and for
// the same reason: no dotenv package exists here, and adding one for a staging
// script would need a rule 17 conversation for no benefit.
//
// Handles: blank lines, # comments, an optional `export ` prefix, and values
// wrapped in single or double quotes. Does not handle multi-line values, which
// neither of the two names below has.
function readEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (cause) {
    die(
      `could not read ${path} (${cause.code ?? "unknown error"}).\n` +
        `That file holds the staging URL and publishable key. It is git-ignored, so it\n` +
        `exists only on your own machine.`,
    );
  }

  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const withoutExport = trimmed.replace(/^export\s+/, "");
    const eq = withoutExport.indexOf("=");
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const fileEnv = readEnvFile(ENV_FILE);

const supabaseUrl = (fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const publishableKey = (
  fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""
).trim();

const missingFromFile = [];
if (supabaseUrl === "") missingFromFile.push("NEXT_PUBLIC_SUPABASE_URL");
if (publishableKey === "") {
  missingFromFile.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}
if (missingFromFile.length > 0) {
  die(
    `${ENV_FILE} is missing: ${missingFromFile.join(", ")}.\n` +
      `No value is printed by this script.`,
  );
}

// Three people, two names each, as docs/environments.md says to do it.
const PEOPLE = [
  { label: "Alice", emailVar: "ALICE_EMAIL", passwordVar: "ALICE_PASSWORD" },
  { label: "Bob", emailVar: "BOB_EMAIL", passwordVar: "BOB_PASSWORD" },
  { label: "Carol", emailVar: "CAROL_EMAIL", passwordVar: "CAROL_PASSWORD" },
];

const aliceTeamId = (process.env.ALICE_TEAM_ID ?? "").trim();

// Each missing name is reported BY NAME, never by value.
const missingFromEnv = [];
for (const person of PEOPLE) {
  if ((process.env[person.emailVar] ?? "").trim() === "") {
    missingFromEnv.push(person.emailVar);
  }
  if ((process.env[person.passwordVar] ?? "") === "") {
    missingFromEnv.push(person.passwordVar);
  }
}
if (aliceTeamId === "") missingFromEnv.push("ALICE_TEAM_ID");

if (missingFromEnv.length > 0) {
  die(
    `these environment variables are not set: ${missingFromEnv.join(", ")}.\n` +
      `Load them for this one run from ~/.config/team-tasks/staging.env, which keeps a\n` +
      `FILENAME in shell history rather than a password: see the bottom of this file,\n` +
      `and docs/environments.md -> "Where the test accounts' passwords live".\n` +
      `No value is printed by this script.`,
  );
}

// ALICE_TEAM_ID must look like a uuid, checked BEFORE anybody signs in.
//
// A run that cannot test anything should not get as far as sending a password.
// A wrong team id would make every count below 0 and the whole run would read
// like a wall of passes for Bob and failures for the other two, which is the
// most misleading outcome available.
if (!UUID_PATTERN.test(aliceTeamId)) {
  die(
    `ALICE_TEAM_ID is not a uuid, so this run could not have tested anything.\n` +
      `Expected 8-4-4-4-12 hex digits, for example 0f8fad5b-d9cb-469f-a165-70867728950e.\n` +
      `Copy the team's id from the staging Table Editor -- not its name, and not an\n` +
      `email address. Nothing was sent and nobody was signed in.`,
  );
}

// ---------------------------------------------------------------------------
// The staging guard
// ---------------------------------------------------------------------------
//
// Checked against the URL from web/.env.local, before any request is made.
if (!supabaseUrl.includes(STAGING_REF)) {
  die(
    `the Supabase URL in web/.env.local is not the staging project.\n` +
      `This script only runs against the project whose reference is ${STAGING_REF}.\n` +
      `The URL it found is not printed, because a project reference identifies an\n` +
      `environment. Check web/.env.local yourself.`,
  );
}

const base = supabaseUrl.replace(/\/+$/, "");
const authUrl = `${base}/auth/v1`;
const restUrl = `${base}/rest/v1`;

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
//
// Three outcomes, not two. AGENTS.md rule 8: a check that could not run is not a
// pass. UNVERIFIED exits non-zero exactly as FAIL does, so a run that could not
// ask the question cannot be mistaken for a run that got the right answer.

let passes = 0;
let failures = 0;
let unverified = 0;

function pass(what, detail) {
  passes += 1;
  console.log(`  PASS  ${what}${detail ? ` -- ${detail}` : ""}`);
}

function fail(what, detail) {
  failures += 1;
  console.log(`  FAIL  ${what}${detail ? ` -- ${detail}` : ""}`);
}

function unverifiedResult(what, reason) {
  unverified += 1;
  console.log(`  UNVERIFIED  ${what} -- ${reason}`);
}

// Checks an expectation that is already a boolean, so every check below reads
// the same way: say what was expected, say what came back.
function expect(what, condition, detail) {
  if (condition) pass(what, detail);
  else fail(what, detail);
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

// A read through PostgREST. Returns either { rows } or { error }, never throws,
// so one unreachable request does not abandon the remaining checks.
//
// accessToken may be null: that is the signed-out caller, who sends the
// publishable key and no Authorization header at all.
async function select(accessToken, relation, columns, filters = {}) {
  const url = new URL(`${restUrl}/${relation}`);
  url.searchParams.set("select", columns);
  for (const [column, value] of Object.entries(filters)) {
    url.searchParams.append(column, `eq.${value}`);
  }

  const headers = { apikey: publishableKey };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response;
  try {
    response = await fetch(url, { headers });
  } catch (cause) {
    return { error: `could not reach the database (${cause.message})` };
  }

  const body = await response.text();
  if (!response.ok) {
    // PostgREST's error body is a message, a hint and a code. None of them is a
    // credential, and the hint is usually the actual fix, so it is shown whole.
    //
    // refused is set only when the DATABASE said no, which the signed-out checks
    // below need to tell apart from "the answer came back in a shape this script
    // did not expect". The second is not a refusal and must never be read as one.
    return { error: `HTTP ${response.status} ${body}`, refused: true };
  }

  try {
    const rows = JSON.parse(body);
    if (!Array.isArray(rows)) {
      return { error: `expected a JSON array, got ${typeof rows}` };
    }
    return { rows };
  } catch {
    return { error: `HTTP ${response.status} with a body that is not JSON` };
  }
}

// Calls public.is_team_member. Returns { value } or { error }.
//
// THE ARGUMENT IS NAMED p_team_id, not team_id, and it has to be: PostgREST
// passes the keys of this body as named arguments, so the name here must be the
// name in the migration. The parameter is p_team_id because public.team_members
// has a column called team_id, and a parameter of that name inside the function
// body would be a name that could mean either -- see the comment above the
// function in 20261002122203_team_rules.sql.
async function isTeamMember(accessToken, teamId) {
  const headers = {
    apikey: publishableKey,
    "Content-Type": "application/json",
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response;
  try {
    response = await fetch(`${restUrl}/rpc/is_team_member`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_team_id: teamId }),
    });
  } catch (cause) {
    return { error: `could not reach the database (${cause.message})` };
  }

  const body = await response.text();
  if (!response.ok) {
    return { error: `HTTP ${response.status} ${body}`, refused: true };
  }

  const trimmed = body.trim();
  if (trimmed === "true") return { value: true };
  if (trimmed === "false") return { value: false };
  return { error: `expected true or false, got ${trimmed || "an empty body"}` };
}

// Signs in and returns { accessToken, userId } or { error }.
//
// userId comes from the sign-in response rather than from a table, because the
// "profiles: only my own row" check needs something to compare against and
// reading it from profiles would be assuming the answer. It is never printed.
async function signIn(person) {
  const email = (process.env[person.emailVar] ?? "").trim();
  const password = process.env[person.passwordVar] ?? "";

  let response;
  try {
    response = await fetch(`${authUrl}/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (cause) {
    return { error: `could not reach ${authUrl} (${cause.message})` };
  }

  if (!response.ok) {
    // A failed sign-in's body carries no token, so it is safe to show, and it is
    // the only way to tell a wrong password from a missing account.
    return { error: `sign in returned HTTP ${response.status}: ${await response.text()}` };
  }

  const session = await response.json();
  const accessToken = session?.access_token ?? "";
  const userId = session?.user?.id ?? "";
  if (accessToken === "") {
    return { error: "sign in returned HTTP 2xx but no access token" };
  }
  if (userId === "") {
    return { error: "sign in returned HTTP 2xx but no user id" };
  }
  return { accessToken, userId };
}

async function signOut(accessToken) {
  try {
    const response = await fetch(`${authUrl}/logout?scope=global`, {
      method: "POST",
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
    });
    console.log(`  (signed out: HTTP ${response.status})`);
  } catch (cause) {
    console.log(`  (sign out failed: ${cause.message}; the session expires on its own)`);
  }
}

// ---------------------------------------------------------------------------
// The checks for one person
// ---------------------------------------------------------------------------

// Bob: an outsider. Every one of these is a refusal, and a refusal under
// row-level security looks like an empty answer rather than an error, so each
// check is a count that must be 0.
async function checkBob(accessToken, userId) {
  const member = await isTeamMember(accessToken, aliceTeamId);
  if (member.error) {
    unverifiedResult("Bob: is_team_member(Alice's team) is false", member.error);
  } else {
    expect(
      "Bob: is_team_member(Alice's team) is false",
      member.value === false,
      `got ${member.value}`,
    );
  }

  const roster = await select(accessToken, "team_roster", "role", {
    team_id: aliceTeamId,
  });
  if (roster.error) {
    unverifiedResult("Bob: team_roster for Alice's team is empty", roster.error);
  } else {
    expect(
      "Bob: team_roster for Alice's team is empty",
      roster.rows.length === 0,
      `${roster.rows.length} rows`,
    );
  }

  // The whole view, unfiltered. Rows here are not automatically wrong: if Bob
  // owns a team of his own on staging, his own roster is exactly what he should
  // see. So this is reported as a count and judged only on whether any row
  // belongs to Alice's team -- which the filtered check above already covers,
  // and this repeats from the other direction in case the filter itself were
  // ignored.
  const allRoster = await select(accessToken, "team_roster", "team_id,role");
  if (allRoster.error) {
    unverifiedResult(
      "Bob: no row anywhere in team_roster belongs to Alice's team",
      allRoster.error,
    );
  } else {
    const alicesRows = allRoster.rows.filter((r) => r.team_id === aliceTeamId);
    expect(
      "Bob: no row anywhere in team_roster belongs to Alice's team",
      alicesRows.length === 0,
      `${allRoster.rows.length} rows visible in total, ${alicesRows.length} of them Alice's team`,
    );
  }

  const teams = await select(accessToken, "teams", "id", { id: aliceTeamId });
  if (teams.error) {
    unverifiedResult("Bob: teams returns nothing for Alice's team", teams.error);
  } else {
    expect(
      "Bob: teams returns nothing for Alice's team",
      teams.rows.length === 0,
      `${teams.rows.length} rows`,
    );
  }

  const members = await select(accessToken, "team_members", "user_id", {
    team_id: aliceTeamId,
  });
  if (members.error) {
    unverifiedResult(
      "Bob: team_members returns nothing for Alice's team",
      members.error,
    );
  } else {
    expect(
      "Bob: team_members returns nothing for Alice's team",
      members.rows.length === 0,
      `${members.rows.length} rows`,
    );
  }

  // profiles: his own row and nobody else's. Two things can go wrong and they
  // are different, so they are counted separately: a row that is not his, and
  // more than one row.
  const profiles = await select(accessToken, "profiles", "user_id");
  if (profiles.error) {
    unverifiedResult("Bob: profiles returns only his own row", profiles.error);
  } else {
    const notHis = profiles.rows.filter((r) => r.user_id !== userId).length;
    expect(
      "Bob: profiles returns only his own row",
      notHis === 0 && profiles.rows.length <= 1,
      `${profiles.rows.length} rows, ${notHis} of them somebody else's` +
        (profiles.rows.length === 0
          ? " (0 rows means Bob has not set a display name, which is fine here)"
          : ""),
    );
  }
}

// Alice and Carol: both are in the team, so both must see the same roster. The
// only difference is which role is their own, which is the one thing the two
// calls below disagree about.
async function checkInsider(label, accessToken, userId, expectedOwnRole) {
  const member = await isTeamMember(accessToken, aliceTeamId);
  if (member.error) {
    unverifiedResult(`${label}: is_team_member(Alice's team) is true`, member.error);
  } else {
    expect(
      `${label}: is_team_member(Alice's team) is true`,
      member.value === true,
      `got ${member.value}`,
    );
  }

  const teams = await select(accessToken, "teams", "id", { id: aliceTeamId });
  if (teams.error) {
    unverifiedResult(`${label}: can read Alice's team row`, teams.error);
  } else {
    expect(
      `${label}: can read Alice's team row`,
      teams.rows.length === 1,
      `${teams.rows.length} rows, expected 1`,
    );
  }

  // One row, and it is Carol's: an owner has no team_members row at all
  // (docs/architecture.md -- create-team writes only to teams), so the members
  // list of a team of two is one row long.
  const members = await select(accessToken, "team_members", "user_id", {
    team_id: aliceTeamId,
  });
  if (members.error) {
    unverifiedResult(
      `${label}: can read the members list of Alice's team`,
      members.error,
    );
  } else {
    expect(
      `${label}: can read the members list of Alice's team`,
      members.rows.length === 1,
      `${members.rows.length} rows, expected 1 (the owner has no membership row)`,
    );
  }

  const roster = await select(accessToken, "team_roster", "user_id,display_name,role", {
    team_id: aliceTeamId,
  });
  if (roster.error) {
    unverifiedResult(`${label}: team_roster for Alice's team`, roster.error);
    return;
  }

  const rows = roster.rows;
  expect(
    `${label}: team_roster for Alice's team has exactly 2 rows`,
    rows.length === 2,
    `${rows.length} rows` +
      (rows.length < 2
        ? " -- has Carol accepted her invitation, and has the migration been applied?"
        : rows.length > 2
          ? " -- a third person in this team would also cause this"
          : ""),
  );

  const roles = rows.map((r) => r.role).sort();
  expect(
    `${label}: the two roles are exactly owner and member`,
    roles.length === 2 && roles[0] === "member" && roles[1] === "owner",
    `roles: ${roles.join(", ") || "none"}`,
  );

  const own = rows.filter((r) => r.user_id === userId);
  expect(
    `${label}: appears exactly once, with role ${expectedOwnRole}`,
    own.length === 1 && own[0].role === expectedOwnRole,
    `${own.length} rows for this account, role ${own.map((r) => r.role).join(", ") || "none"}`,
  );

  // "Each sees the other's display name." The name itself is not printed -- what
  // matters is that it arrived and is not null, which is the thing the profiles
  // read rule decides.
  const others = rows.filter((r) => r.user_id !== userId);
  const named = others.filter(
    (r) => typeof r.display_name === "string" && r.display_name.trim() !== "",
  );
  expect(
    `${label}: can see the other person's display name`,
    others.length === 1 && named.length === 1,
    `${others.length} other people in the roster, ${named.length} of them with a display name` +
      (others.length === 1 && named.length === 0
        ? " -- either the profiles read rule refused it, or that person has no profile row yet"
        : ""),
  );
}

// A signed-out caller: the publishable key and nothing else. This is the only
// check that exercises the revoke in the migration, and the only one that would
// notice if security_invoker were missing from the view and anon could read
// every team in the database.
async function checkSignedOut() {
  const member = await isTeamMember(null, aliceTeamId);
  if (member.refused) {
    // The expected outcome, and it is a PASS: with execute revoked from public
    // and anon, PostgREST answers 404 (it does not publish a function the role
    // cannot execute) or 401/403. Either way the function did not run for a
    // stranger.
    pass(
      "Signed out: is_team_member is not callable",
      `refused -- ${member.error}`,
    );
  } else if (member.error) {
    unverifiedResult("Signed out: is_team_member is not callable", member.error);
  } else {
    fail(
      "Signed out: is_team_member is not callable",
      `it ran and returned ${member.value}; execute has not been revoked from anon`,
    );
  }

  const roster = await select(null, "team_roster", "role");
  if (roster.refused) {
    // Also a pass: being refused outright is at least as good as being given an
    // empty answer.
    pass("Signed out: team_roster shows nothing", `refused -- ${roster.error}`);
  } else if (roster.error) {
    unverifiedResult("Signed out: team_roster shows nothing", roster.error);
  } else {
    expect(
      "Signed out: team_roster shows nothing",
      roster.rows.length === 0,
      `${roster.rows.length} rows -- every policy underneath the view is limited to the authenticated role, so any row here means the view is not reading them as the caller`,
    );
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log("Build it 14 part A -- team rules checks, staging only");
console.log(`  project reference:  ${STAGING_REF} (staging, confirmed)`);
console.log(`  Alice's team id:    ${aliceTeamId}`);
console.log("  signing in as:      Alice, Bob and Carol in turn");
console.log("  addresses, passwords, tokens, user ids, team and display names:");
console.log("                      not printed by this script");
console.log("");
console.log("Expected: Bob refused everything about Alice's team; Alice and");
console.log("Carol both see a roster of two, Alice owner and Carol member, each");
console.log("with the other's display name; a signed-out caller sees nothing.");
console.log("");

console.log("Signed out (publishable key only)");
await checkSignedOut();
console.log("");

for (const person of PEOPLE) {
  console.log(`${person.label} (${person.emailVar}, value not printed)`);

  const session = await signIn(person);
  if (session.error) {
    unverifiedResult(`${person.label}: every check below`, session.error);
    console.log("");
    continue;
  }

  // try/finally, so the session is closed even if a check throws.
  try {
    if (person.label === "Bob") {
      await checkBob(session.accessToken, session.userId);
    } else {
      await checkInsider(
        person.label,
        session.accessToken,
        session.userId,
        person.label === "Alice" ? "owner" : "member",
      );
    }
  } finally {
    await signOut(session.accessToken);
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// The verdict
// ---------------------------------------------------------------------------

console.log(
  `Totals: ${passes} PASS, ${failures} FAIL, ${unverified} UNVERIFIED.`,
);

if (failures > 0 || unverified > 0) {
  console.log("");
  console.log("NOT GREEN. A FAIL is a rule not doing what the migration says it");
  console.log("does. An UNVERIFIED is a question that could not be asked, which");
  console.log("is not a pass either (AGENTS.md rule 8) -- the usual causes are a");
  console.log("migration that has not been applied, a wrong ALICE_TEAM_ID, or a");
  console.log("sign-in that failed. Read the lines above before concluding");
  console.log("anything about the rules themselves.");
  process.exit(1);
}

console.log("");
console.log("All checks passed.");

// HOW TO RUN IT, from the repository root.
//
// KEEP THE PASSWORDS OFF THE COMMAND LINE. Both shells on this machine save
// command lines to a file: Git Bash writes ~/.bash_history with HISTCONTROL
// unset, and PowerShell's PSReadLine saves incrementally. So load the password
// file instead of typing values -- what lands in history is a FILENAME.
//
// The owner keeps the test accounts' passwords in
// ~/.config/team-tasks/staging.env, outside this repository. It needs six names
// for this script: ALICE_EMAIL, ALICE_PASSWORD, BOB_EMAIL, BOB_PASSWORD,
// CAROL_EMAIL, CAROL_PASSWORD. See docs/environments.md -> "Where the test
// accounts' passwords live".
//
// Git Bash, WSL or macOS:
//
//   set -a
//   . ~/.config/team-tasks/staging.env
//   set +a
//   export ALICE_TEAM_ID='...'
//   node scripts/staging/build-it-14-checks.mjs
//
// PowerShell has no `source`, so it reads the file line by line instead:
//
//   foreach ($line in Get-Content "$HOME\.config\team-tasks\staging.env") {
//     if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
//       Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim().Trim("'").Trim('"')
//     }
//   }
//   $env:ALICE_TEAM_ID = '...'
//   node scripts/staging/build-it-14-checks.mjs
//
// ALICE_TEAM_ID is not a secret, so it does not matter that its line is kept in
// history. Close the shell window afterwards: the passwords live in that one
// process, and nothing writes them to disk.
//
// This script reads those seven names from the environment and nothing else. It
// never reads ~/.config/team-tasks/staging.env itself.
//
// The assistant has never run this script.
