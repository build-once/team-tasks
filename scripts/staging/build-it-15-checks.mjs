#!/usr/bin/env node
// build-it-15-checks.mjs -- the Alice / Bob / Carol checks for team tasks
// (Build it 15 part 1, issue #82), run against STAGING only.
//
// WHAT IT IS FOR. 20261002133637_tasks_join_teams.sql adds tasks.team_id, widens
// the read and update rules on tasks from owner-only to member-level, and adds a
// trigger that decides which columns a member may change. Every one of those is a
// decision about who may do what, and the only way to know a rule works is to be
// the person it is supposed to refuse. So this signs in as all three test
// accounts and asks the database the questions the rules are supposed to answer:
//
//   Alice (the owner)   creates a task for her team, and a personal one.
//   Carol (a member)    must be able to tick and rename the team task, and must
//                       be refused everything else: deleting it, taking it over,
//                       moving it to her own team, making it personal.
//   Bob (an outsider)   must not see the team task at all, and must not be able
//                       to create one for Alice's team.
//   Both of them        must see nothing of Alice's personal task.
//   Alice again         may move her own task to personal, after which Carol
//                       stops seeing it -- the positive half of the same rule.
//
// IT WRITES, UNLIKE ITS PREDECESSOR. scripts/staging/build-it-14-checks.mjs only
// read. This one has to create tasks, because there is no screen that can create
// a team task yet -- that is part 2. So it keeps a list of every row it created,
// with its id, and deletes those ids and nothing else at the end, whether the
// checks passed, failed or threw. If a row survives cleanup the script says so
// loudly and prints that row's id, which is a row it made itself, so that you can
// remove it by hand.
//
// IT PROVES NOTHING UNTIL THE MIGRATION IS APPLIED. Run before that, creating the
// team task fails with "column tasks.team_id does not exist" or similar, and
// every check that depends on it is reported UNVERIFIED, which is the honest
// answer.
//
// BEFORE IT CAN PASS, staging needs three things that are nobody's code:
//   1. the migration applied;
//   2. Carol a member of Alice's team -- she accepted an invitation, so she has a
//      team_members row for it (the same setup Build it 14 needed);
//   3. a SECOND team that CAROL belongs to and Alice does not, so that "Carol
//      cannot move Alice's task to another team" is a test of who is asking
//      rather than a test of team membership. Carol creating a team of her own is
//      the easy way: she owns it, and create-team allows up to 3.
// The pull request for #82 lists these in order.
//
// NO PACKAGES. The repository root has no dependencies and no node_modules, so
// this uses Node built-ins only -- global fetch and node:crypto, needs Node 18 or
// newer. Every endpoint below was read from the installed clients in
// web/node_modules rather than recalled:
//
//   POST   {url}/auth/v1/token?grant_type=password   body {email,password}
//          -- @supabase/auth-js GoTrueClient.js, signInWithPassword
//   POST   {url}/auth/v1/logout?scope=global
//          -- @supabase/auth-js GoTrueAdminApi.js
//   GET    {url}/rest/v1/{relation}?select=a,b&col=eq.value
//   POST   {url}/rest/v1/{relation}            body = the row
//   PATCH  {url}/rest/v1/{relation}?id=eq.{id} body = the columns to change
//   DELETE {url}/rest/v1/{relation}?id=eq.{id}
//          -- @supabase/postgrest-js PostgrestQueryBuilder.ts: select() sets the
//             select parameter, insert() is POST, update() is PATCH, delete() is
//             DELETE; PostgrestFilterBuilder.ts appends `eq.${value}`; the
//             /rest/v1 prefix is SupabaseClient.ts
//   Prefer: return=representation            -- what makes a write answer with the
//          rows it touched, so a refusal can be counted as "0 rows" rather than
//          guessed at. PostgrestTransformBuilder.ts line 119 appends exactly this
//          header when .select() follows a write.
//   the API key travels in the `apikey` header; Authorization carries the user's
//          JWT -- @supabase/functions-js invoke remarks
//
// WHAT IT NEVER PRINTS: a password, an access token, a refresh token, the
// publishable key, an email address, a user id, a team id other than the two you
// passed in yourself, a team name or a display name. Only counts, true/false,
// HTTP statuses, PostgREST's error text when a request fails, and -- if and only
// if cleanup failed -- the ids of rows this script created. The three people are
// named Alice, Bob and Carol, which is what docs/environments.md calls them.
//
// Run it from the repository root. See the bottom of this file.

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The staging project's reference. This script may run against NOTHING ELSE.
//
// It is the first check script that writes, which makes this guard matter more
// than it did for its read-only predecessor: pointed at production it would be
// creating and deleting rows in a real database, which is exactly what AGENTS.md
// rules 1 and 10 forbid. So the check below is a refusal to start, not a warning.
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

// A small .env reader, the same one build-it-14-checks.mjs uses and for the same
// reason: no dotenv package exists here, and adding one for a staging script
// would need a rule 17 conversation for no benefit.
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
const carolTeamId = (process.env.CAROL_TEAM_ID ?? "").trim();

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
if (carolTeamId === "") missingFromEnv.push("CAROL_TEAM_ID");

if (missingFromEnv.length > 0) {
  die(
    `these environment variables are not set: ${missingFromEnv.join(", ")}.\n` +
      `Load them for this one run from ~/.config/team-tasks/staging.env, which keeps a\n` +
      `FILENAME in shell history rather than a password: see the bottom of this file,\n` +
      `and docs/environments.md -> "Where the test accounts' passwords live".\n` +
      `The two team ids are not secrets and are passed on the command line.\n` +
      `No value is printed by this script.`,
  );
}

// Both team ids must look like uuids, checked BEFORE anybody signs in.
//
// A run that cannot test anything should not get as far as sending a password,
// and -- now that this script writes -- should not get as far as creating a row
// it would then have to clean up.
for (const [name, value] of [
  ["ALICE_TEAM_ID", aliceTeamId],
  ["CAROL_TEAM_ID", carolTeamId],
]) {
  if (!UUID_PATTERN.test(value)) {
    die(
      `${name} is not a uuid, so this run could not have tested anything.\n` +
        `Expected 8-4-4-4-12 hex digits, for example 0f8fad5b-d9cb-469f-a165-70867728950e.\n` +
        `Copy the team's id from the staging Table Editor -- not its name, and not an\n` +
        `email address. Nothing was sent, nobody was signed in and no row was created.`,
    );
  }
}

// CAROL_TEAM_ID is the team Carol must NOT be able to move Alice's task into. If
// it were the same team, that check would pass for the wrong reason: moving a task
// to the team it is already in changes nothing, so the trigger would never be
// asked.
if (aliceTeamId.toLowerCase() === carolTeamId.toLowerCase()) {
  die(
    `ALICE_TEAM_ID and CAROL_TEAM_ID are the same team.\n` +
      `CAROL_TEAM_ID must be a DIFFERENT team, one that Carol belongs to and Alice\n` +
      `does not -- see the top of this file. Nothing was sent and nobody was signed in.`,
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

// One marker per run, so every row this script creates is recognisable as its
// own, and two runs cannot be confused with each other. It is not personal data
// and it is not a secret: it is a random uuid in a task title.
const RUN_ID = randomUUID();
const title = (what) => `build-it-15 check ${RUN_ID} -- ${what}`;

// The columns a task answers with. Named, never a star, so a column the table
// grows later cannot arrive in this script's output without somebody deciding to
// put it there.
const TASK_COLUMNS = "id,title,done,team_id,owner_id";

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

// Checks an expectation that is already a boolean, so every check below reads the
// same way: say what was expected, say what came back.
function expect(what, condition, detail) {
  if (condition) pass(what, detail);
  else fail(what, detail);
}

// ---------------------------------------------------------------------------
// Rows this script created
// ---------------------------------------------------------------------------
//
// Cleanup deletes these ids and nothing else. `by` is the label of the person who
// created the row, because only its creator can delete a task -- which is one of
// the rules being tested, so cleanup is also the last check.

const createdRows = [];

function remember(id, by, what) {
  createdRows.push({ id, by, what });
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

// One request through PostgREST. Returns { status, rows } or { status, error },
// never throws, so one unreachable request does not abandon the remaining checks.
//
// accessToken may be null: that is the signed-out caller, who sends the
// publishable key and no Authorization header at all.
//
// `refused` is set only when the DATABASE said no, which the checks below need to
// tell apart from "the answer came back in a shape this script did not expect".
// The second is not a refusal and must never be read as one.
async function request(method, path, { accessToken, body } = {}) {
  const headers = { apikey: publishableKey };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    // Answer with the rows the write touched, so a refusal under row-level
    // security can be counted as 0 rows instead of inferred from silence.
    headers.Prefer = "return=representation";
  }

  let response;
  try {
    response = await fetch(`${restUrl}/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    return { error: `could not reach the database (${cause.message})` };
  }

  const text = await response.text();
  if (!response.ok) {
    // PostgREST's error body is a message, a hint, a code and sometimes details.
    // None of them is a credential. The messages this migration's trigger raises
    // are sentences written in the migration itself, so they are safe to show
    // whole and they say which rule refused.
    return { status: response.status, error: `HTTP ${response.status} ${text}`, refused: true };
  }

  if (text.trim() === "") return { status: response.status, rows: [] };

  try {
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) {
      return { status: response.status, error: `expected a JSON array, got ${typeof rows}` };
    }
    return { status: response.status, rows };
  } catch {
    return {
      status: response.status,
      error: `HTTP ${response.status} with a body that is not JSON`,
    };
  }
}

const readTasks = (accessToken, filters) => {
  const query = new URLSearchParams();
  query.set("select", TASK_COLUMNS);
  for (const [column, value] of Object.entries(filters)) {
    query.append(column, `eq.${value}`);
  }
  return request("GET", `tasks?${query.toString()}`, { accessToken });
};

const createTask = (accessToken, row) =>
  request("POST", `tasks?select=${TASK_COLUMNS}`, { accessToken, body: row });

const changeTask = (accessToken, id, columns) =>
  request("PATCH", `tasks?id=eq.${id}&select=${TASK_COLUMNS}`, {
    accessToken,
    body: columns,
  });

// DELETE carries no body, so `Prefer: return=representation` has to be set here
// rather than by request(). Without it a delete answers 204 with nothing, and
// "refused" and "deleted" look identical.
async function deleteTask(accessToken, id) {
  const headers = { apikey: publishableKey, Prefer: "return=representation" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response;
  try {
    response = await fetch(`${restUrl}/tasks?id=eq.${id}&select=id`, {
      method: "DELETE",
      headers,
    });
  } catch (cause) {
    return { error: `could not reach the database (${cause.message})` };
  }

  const text = await response.text();
  if (!response.ok) {
    return { status: response.status, error: `HTTP ${response.status} ${text}`, refused: true };
  }
  try {
    const rows = text.trim() === "" ? [] : JSON.parse(text);
    if (!Array.isArray(rows)) {
      return { status: response.status, error: `expected a JSON array, got ${typeof rows}` };
    }
    return { status: response.status, rows };
  } catch {
    return { status: response.status, error: `HTTP ${response.status} with a body that is not JSON` };
  }
}

// Calls public.is_team_member. Returns { value } or { error }.
//
// It does not go through request() above: an rpc returning a scalar answers with
// the value itself -- `true` or `false` -- rather than a list of rows, so
// request()'s "must be a JSON array" check would reject a correct answer.
//
// THE ARGUMENT IS NAMED p_team_id, not team_id, and it has to be: PostgREST
// passes the keys of this body as named arguments, so the name here must be the
// name in 20261002122203_team_rules.sql, which explains why it is not team_id.
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

  const text = (await response.text()).trim();
  if (!response.ok) {
    return { status: response.status, error: `HTTP ${response.status} ${text}`, refused: true };
  }
  if (text === "true") return { value: true };
  if (text === "false") return { value: false };
  return { error: `expected true or false, got ${text || "an empty body"}` };
}

// Signs in and returns { accessToken, userId } or { error }.
//
// userId comes from the sign-in response rather than from a table, because
// several checks below compare a row's owner_id against "this person" and reading
// it from the row would be assuming the answer. It is never printed.
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
    return {
      error: `sign in returned HTTP ${response.status}: ${await response.text()}`,
    };
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

async function signOut(label, accessToken) {
  try {
    const response = await fetch(`${authUrl}/logout?scope=global`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    console.log(`  (${label} signed out: HTTP ${response.status})`);
  } catch (cause) {
    console.log(
      `  (${label} sign out failed: ${cause.message}; the session expires on its own)`,
    );
  }
}

// A refusal, counted the way row-level security and the trigger actually behave.
//
// There are TWO shapes of no, and both are a pass:
//   * the trigger raises, and PostgREST answers 4xx with the message from the
//     migration -- that is `refused`;
//   * no policy matches the row, so the statement changes nothing and the answer
//     is an empty list of rows -- that is `rows.length === 0`.
// Anything else is either a success (which is a FAIL for these checks) or a
// surprise (UNVERIFIED), and the two must not be blurred together.
function expectRefused(what, result) {
  if (result.refused) {
    pass(what, `refused -- ${result.error}`);
    return;
  }
  if (result.error) {
    unverifiedResult(what, result.error);
    return;
  }
  if (result.rows.length === 0) {
    pass(what, "no row matched, so nothing changed");
    return;
  }
  fail(what, `the database allowed it: ${result.rows.length} row(s) affected`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log("Build it 15 part 1 -- team tasks checks, staging only");
console.log(`  project reference:  ${STAGING_REF} (staging, confirmed)`);
console.log(`  Alice's team id:    ${aliceTeamId}`);
console.log(`  Carol's team id:    ${carolTeamId}`);
console.log(`  this run's marker:  ${RUN_ID} (in the title of every row it creates)`);
console.log("  signing in as:      Alice, Bob and Carol");
console.log("  addresses, passwords, tokens, user ids and display names:");
console.log("                      not printed by this script");
console.log("");
console.log("THIS SCRIPT CREATES ROWS and deletes them again at the end, by id.");
console.log("");
console.log("Expected: Carol can tick and rename Alice's team task but cannot");
console.log("delete it, take it over or move it; Bob sees none of it and cannot");
console.log("add a task to Alice's team; neither of them sees Alice's personal");
console.log("task; Alice can move her own task back to personal, after which");
console.log("Carol stops seeing it.");
console.log("");

const sessions = {};

for (const person of PEOPLE) {
  const session = await signIn(person);
  if (session.error) {
    console.log(`${person.label} (${person.emailVar}, value not printed)`);
    unverifiedResult(`${person.label}: every check needing this account`, session.error);
    console.log("");
  } else {
    sessions[person.label] = session;
  }
}

const alice = sessions.Alice;
const bob = sessions.Bob;
const carol = sessions.Carol;

try {
  // -------------------------------------------------------------------------
  // The setup this run depends on
  // -------------------------------------------------------------------------
  //
  // Asked first, and asked of the database rather than assumed, because every
  // check below is meaningless if one of these is wrong -- and a wrong answer
  // here reads as a wall of failures somewhere else.

  console.log("The setup these checks depend on");

  let carolIsInAlicesTeam = false;
  let carolIsInHerOwnTeam = false;
  let aliceIsInCarolsTeam = true; // assume the worst until asked

  if (!alice || !bob || !carol) {
    unverifiedResult(
      "the setup",
      "at least one of the three accounts could not sign in, so the setup could not be read",
    );
  } else {
    const a = await isTeamMember(alice.accessToken, aliceTeamId);
    if (a.error) unverifiedResult("Alice belongs to ALICE_TEAM_ID", a.error);
    else expect("Alice belongs to ALICE_TEAM_ID", a.value === true, `got ${a.value}`);

    const c = await isTeamMember(carol.accessToken, aliceTeamId);
    if (c.error) unverifiedResult("Carol belongs to ALICE_TEAM_ID", c.error);
    else {
      carolIsInAlicesTeam = c.value === true;
      expect(
        "Carol belongs to ALICE_TEAM_ID",
        carolIsInAlicesTeam,
        `got ${c.value}` +
          (c.value === false ? " -- has she accepted her invitation to that team?" : ""),
      );
    }

    const b = await isTeamMember(bob.accessToken, aliceTeamId);
    if (b.error) unverifiedResult("Bob does NOT belong to ALICE_TEAM_ID", b.error);
    else
      expect(
        "Bob does NOT belong to ALICE_TEAM_ID",
        b.value === false,
        `got ${b.value}` +
          (b.value === true
            ? " -- Bob is in the team, so he is not an outsider and nothing below tests one"
            : ""),
      );

    const c2 = await isTeamMember(carol.accessToken, carolTeamId);
    if (c2.error) unverifiedResult("Carol belongs to CAROL_TEAM_ID", c2.error);
    else {
      carolIsInHerOwnTeam = c2.value === true;
      expect(
        "Carol belongs to CAROL_TEAM_ID",
        carolIsInHerOwnTeam,
        `got ${c2.value}` +
          (c2.value === false
            ? " -- she must belong to it, or 'Carol cannot move the task there' would" +
              " pass because of membership rather than because she is not the creator"
            : ""),
      );
    }

    const a2 = await isTeamMember(alice.accessToken, carolTeamId);
    if (a2.error) unverifiedResult("Alice does NOT belong to CAROL_TEAM_ID", a2.error);
    else {
      aliceIsInCarolsTeam = a2.value !== false;
      expect(
        "Alice does NOT belong to CAROL_TEAM_ID",
        a2.value === false,
        `got ${a2.value}` +
          (a2.value === true
            ? " -- 'Alice cannot move her task into a team she is not in' cannot be" +
              " tested with this team"
            : ""),
      );
    }
  }
  console.log("");

  // -------------------------------------------------------------------------
  // Alice creates the two tasks this run is about
  // -------------------------------------------------------------------------

  console.log("Alice creates a team task and a personal task");

  let teamTaskId = null;
  let personalTaskId = null;

  if (!alice) {
    unverifiedResult("Alice can create a task for her team", "Alice is not signed in");
    unverifiedResult("Alice can create a personal task", "Alice is not signed in");
  } else {
    const created = await createTask(alice.accessToken, {
      title: title("a team task"),
      team_id: aliceTeamId,
    });
    if (created.error) {
      unverifiedResult(
        "Alice can create a task for her team",
        `${created.error} -- has the migration been applied? Everything below about` +
          ` the team task could not be asked.`,
      );
    } else if (created.rows.length !== 1) {
      fail(
        "Alice can create a task for her team",
        `${created.rows.length} rows came back, expected 1`,
      );
    } else {
      const row = created.rows[0];
      teamTaskId = row.id;
      remember(teamTaskId, "Alice", "the team task");
      expect(
        "Alice can create a task for her team",
        row.team_id === aliceTeamId &&
          row.owner_id === alice.userId &&
          row.done === false,
        `team_id is the team she asked for: ${row.team_id === aliceTeamId};` +
          ` owner_id is Alice: ${row.owner_id === alice.userId};` +
          ` done: ${row.done}`,
      );
    }

    const personal = await createTask(alice.accessToken, {
      title: title("a personal task"),
    });
    if (personal.error) {
      unverifiedResult("Alice can create a personal task", personal.error);
    } else if (personal.rows.length !== 1) {
      fail(
        "Alice can create a personal task",
        `${personal.rows.length} rows came back, expected 1`,
      );
    } else {
      const row = personal.rows[0];
      personalTaskId = row.id;
      remember(personalTaskId, "Alice", "the personal task");
      expect(
        "Alice can create a personal task",
        row.team_id === null && row.owner_id === alice.userId,
        `team_id is null: ${row.team_id === null};` +
          ` owner_id is Alice: ${row.owner_id === alice.userId}`,
      );
    }
  }
  console.log("");

  // -------------------------------------------------------------------------
  // Carol, a member: two things she may do, four she may not
  // -------------------------------------------------------------------------

  console.log("Carol (a member of Alice's team)");

  const carolChecks = [
    "Carol can see Alice's team task",
    "Carol can tick Alice's team task",
    "Carol can rename Alice's team task",
    "Carol CANNOT delete Alice's team task",
    "Carol CANNOT take Alice's team task over (owner_id)",
    "Carol CANNOT move Alice's team task to her own team",
    "Carol CANNOT make Alice's team task personal",
  ];

  if (!carol || teamTaskId === null) {
    const reason = !carol
      ? "Carol is not signed in"
      : "the team task was not created, so there was nothing to ask about";
    for (const what of carolChecks) unverifiedResult(what, reason);
  } else {
    const seen = await readTasks(carol.accessToken, { id: teamTaskId });
    if (seen.error) unverifiedResult(carolChecks[0], seen.error);
    else
      expect(
        carolChecks[0],
        seen.rows.length === 1,
        `${seen.rows.length} rows, expected 1` +
          (seen.rows.length === 0 && !carolIsInAlicesTeam
            ? " -- she is not in that team, which the setup above already reported"
            : ""),
      );

    // Ticking it. This is the member-level update rule doing the thing the
    // feature exists for.
    const ticked = await changeTask(carol.accessToken, teamTaskId, { done: true });
    if (ticked.error) unverifiedResult(carolChecks[1], ticked.error);
    else
      expect(
        carolChecks[1],
        ticked.rows.length === 1 && ticked.rows[0].done === true,
        `${ticked.rows.length} row(s) changed, done is now ${ticked.rows[0]?.done}`,
      );

    const renamedTo = title("renamed by a member");
    const renamed = await changeTask(carol.accessToken, teamTaskId, {
      title: renamedTo,
    });
    if (renamed.error) unverifiedResult(carolChecks[2], renamed.error);
    else
      expect(
        carolChecks[2],
        renamed.rows.length === 1 && renamed.rows[0].title === renamedTo,
        `${renamed.rows.length} row(s) changed, the title is what she sent: ` +
          `${renamed.rows[0]?.title === renamedTo}`,
      );

    // The book's deliberate test: a member must not be able to delete. A delete
    // nobody is allowed to make is not an error -- it matches no row and changes
    // nothing -- so the row is read back afterwards as well, because "0 rows
    // deleted" and "the row is gone" would otherwise be told apart by hope.
    const deleted = await deleteTask(carol.accessToken, teamTaskId);
    expectRefused(carolChecks[3], deleted);

    const stillThere = await readTasks(carol.accessToken, { id: teamTaskId });
    if (stillThere.error) {
      unverifiedResult("the team task survived Carol's delete", stillThere.error);
    } else {
      expect(
        "the team task survived Carol's delete",
        stillThere.rows.length === 1,
        `${stillThere.rows.length} rows, expected 1`,
      );
    }

    // Taking it over. The policies let this through -- the finished row is still
    // a task in a team she belongs to -- so this is a test of the trigger and
    // nothing else.
    const takeOver = await changeTask(carol.accessToken, teamTaskId, {
      owner_id: carol.userId,
    });
    expectRefused(carolChecks[4], takeOver);

    const moveToHers = await changeTask(carol.accessToken, teamTaskId, {
      team_id: carolTeamId,
    });
    expectRefused(
      carolChecks[5] + (carolIsInHerOwnTeam ? "" : " [weakened: see the setup above]"),
      moveToHers,
    );

    const makePersonal = await changeTask(carol.accessToken, teamTaskId, {
      team_id: null,
    });
    expectRefused(carolChecks[6], makePersonal);

    // One read-back for all three refusals above, as Alice, who can see the
    // whole row: the point of each was that the row did not change.
    if (alice) {
      const after = await readTasks(alice.accessToken, { id: teamTaskId });
      if (after.error) {
        unverifiedResult("the team task is unchanged except for the tick and the name", after.error);
      } else if (after.rows.length !== 1) {
        fail(
          "the team task is unchanged except for the tick and the name",
          `${after.rows.length} rows, expected 1`,
        );
      } else {
        const row = after.rows[0];
        expect(
          "the team task is unchanged except for the tick and the name",
          row.owner_id === alice.userId && row.team_id === aliceTeamId,
          `owner_id is still Alice: ${row.owner_id === alice.userId};` +
            ` team_id is still her team: ${row.team_id === aliceTeamId}`,
        );
      }
    }

    // Personal tasks stay private.
    if (personalTaskId !== null) {
      const peek = await readTasks(carol.accessToken, { id: personalTaskId });
      if (peek.error) {
        unverifiedResult("Carol sees nothing of Alice's personal task", peek.error);
      } else {
        expect(
          "Carol sees nothing of Alice's personal task",
          peek.rows.length === 0,
          `${peek.rows.length} rows, expected 0`,
        );
      }
    } else {
      unverifiedResult(
        "Carol sees nothing of Alice's personal task",
        "the personal task was not created",
      );
    }
  }
  console.log("");

  // -------------------------------------------------------------------------
  // Bob, an outsider: everything is a refusal
  // -------------------------------------------------------------------------

  console.log("Bob (in neither team)");

  if (!bob) {
    for (const what of [
      "Bob sees nothing of Alice's team task",
      "Bob sees nothing of Alice's personal task",
      "Bob CANNOT create a task for Alice's team",
      "Bob CANNOT tick Alice's team task",
    ]) {
      unverifiedResult(what, "Bob is not signed in");
    }
  } else {
    if (teamTaskId !== null) {
      const seen = await readTasks(bob.accessToken, { id: teamTaskId });
      if (seen.error) unverifiedResult("Bob sees nothing of Alice's team task", seen.error);
      else
        expect(
          "Bob sees nothing of Alice's team task",
          seen.rows.length === 0,
          `${seen.rows.length} rows, expected 0`,
        );

      // Not in the issue's list, added because a refusal to read is not a
      // refusal to write: the using half of the update rule is a different
      // expression from the select rule, and only this asks it about an outsider.
      const ticked = await changeTask(bob.accessToken, teamTaskId, { done: true });
      expectRefused("Bob CANNOT tick Alice's team task", ticked);
    } else {
      unverifiedResult(
        "Bob sees nothing of Alice's team task",
        "the team task was not created",
      );
      unverifiedResult(
        "Bob CANNOT tick Alice's team task",
        "the team task was not created",
      );
    }

    if (personalTaskId !== null) {
      const peek = await readTasks(bob.accessToken, { id: personalTaskId });
      if (peek.error) unverifiedResult("Bob sees nothing of Alice's personal task", peek.error);
      else
        expect(
          "Bob sees nothing of Alice's personal task",
          peek.rows.length === 0,
          `${peek.rows.length} rows, expected 0`,
        );
    } else {
      unverifiedResult(
        "Bob sees nothing of Alice's personal task",
        "the personal task was not created",
      );
    }

    // The one write an outsider might get away with: a row with his own name on
    // it, pointed at somebody else's team. While the old owner-only insert policy
    // still stands this is refused by the trigger rather than by a policy, which
    // is exactly why the trigger is part of the expand step.
    const intruded = await createTask(bob.accessToken, {
      title: title("Bob's attempt at Alice's team"),
      team_id: aliceTeamId,
    });
    if (intruded.rows && intruded.rows.length > 0) {
      // It worked, which is a FAIL -- and a row this script now owns the cleanup
      // of. Bob created it, so Bob is the only one who can delete it.
      for (const row of intruded.rows) remember(row.id, "Bob", "Bob's task in Alice's team");
    }
    expectRefused("Bob CANNOT create a task for Alice's team", intruded);
  }
  console.log("");

  // -------------------------------------------------------------------------
  // Alice, the creator: the positive half of the team_id rule
  // -------------------------------------------------------------------------
  //
  // Not in the issue's list of checks. It is here because every team_id check
  // above is a refusal, and a rule that only ever says no would pass all of them
  // while being broken: a trigger that refused every move, including the
  // creator's, would look identical. This is the check that tells those apart.

  console.log("Alice (the creator)");

  if (!alice || teamTaskId === null) {
    for (const what of [
      "Alice CANNOT give her task to somebody else (owner_id)",
      "Alice CANNOT move her task into a team she is not in",
      "Alice CAN move her own task back to personal",
      "once personal, Carol stops seeing it",
    ]) {
      unverifiedResult(
        what,
        !alice ? "Alice is not signed in" : "the team task was not created",
      );
    }
  } else {
    // owner_id can never change -- not even by the person it names.
    if (carol) {
      const giveAway = await changeTask(alice.accessToken, teamTaskId, {
        owner_id: carol.userId,
      });
      expectRefused("Alice CANNOT give her task to somebody else (owner_id)", giveAway);
    } else {
      unverifiedResult(
        "Alice CANNOT give her task to somebody else (owner_id)",
        "Carol is not signed in, so there is nobody to try to give it to",
      );
    }

    const wrongTeam = await changeTask(alice.accessToken, teamTaskId, {
      team_id: carolTeamId,
    });
    if (aliceIsInCarolsTeam) {
      unverifiedResult(
        "Alice CANNOT move her task into a team she is not in",
        "Alice belongs to CAROL_TEAM_ID (see the setup above), so this is not a team she is outside of",
      );
      // If that move succeeded the row is now in Carol's team, which the cleanup
      // below still handles -- Alice created it, so she can still delete it.
    } else {
      expectRefused("Alice CANNOT move her task into a team she is not in", wrongTeam);
    }

    const toPersonal = await changeTask(alice.accessToken, teamTaskId, {
      team_id: null,
    });
    if (toPersonal.error) {
      unverifiedResult("Alice CAN move her own task back to personal", toPersonal.error);
      unverifiedResult("once personal, Carol stops seeing it", "the move did not happen");
    } else if (toPersonal.rows.length !== 1 || toPersonal.rows[0].team_id !== null) {
      fail(
        "Alice CAN move her own task back to personal",
        `${toPersonal.rows.length} row(s) changed, team_id is now ${
          toPersonal.rows[0]?.team_id === null ? "null" : "still a team"
        }`,
      );
      unverifiedResult("once personal, Carol stops seeing it", "the move did not happen");
    } else {
      pass("Alice CAN move her own task back to personal", "1 row changed, team_id is null");

      if (carol) {
        const gone = await readTasks(carol.accessToken, { id: teamTaskId });
        if (gone.error) unverifiedResult("once personal, Carol stops seeing it", gone.error);
        else
          expect(
            "once personal, Carol stops seeing it",
            gone.rows.length === 0,
            `${gone.rows.length} rows, expected 0 -- the team was the only thing making it visible to her`,
          );
      } else {
        unverifiedResult("once personal, Carol stops seeing it", "Carol is not signed in");
      }
    }
  }
  console.log("");

  // -------------------------------------------------------------------------
  // A signed-out caller
  // -------------------------------------------------------------------------
  //
  // Also not in the issue's list. Every policy on tasks is limited to the
  // authenticated role, so a stranger with nothing but the publishable key must
  // get nothing -- and this is the only check that would notice if one of them
  // were ever written without `to authenticated`.

  console.log("Signed out (publishable key only)");

  if (teamTaskId !== null || personalTaskId !== null) {
    const anyId = teamTaskId ?? personalTaskId;
    const seen = await readTasks(null, { id: anyId });
    if (seen.refused) {
      pass("Signed out: tasks shows nothing", `refused -- ${seen.error}`);
    } else if (seen.error) {
      unverifiedResult("Signed out: tasks shows nothing", seen.error);
    } else {
      expect(
        "Signed out: tasks shows nothing",
        seen.rows.length === 0,
        `${seen.rows.length} rows, expected 0`,
      );
    }
  } else {
    unverifiedResult("Signed out: tasks shows nothing", "no row was created to ask about");
  }
  console.log("");
} finally {
  // -------------------------------------------------------------------------
  // Cleanup -- only the rows this script created, by id
  // -------------------------------------------------------------------------
  //
  // In a finally block, so a check that throws still takes its rows with it.
  // Each row is deleted BY ITS CREATOR, because only the creator can delete a
  // task -- so this is both the tidy-up and the last proof of that rule.

  console.log(`Cleanup -- ${createdRows.length} row(s) this run created`);

  if (createdRows.length === 0) {
    console.log("  nothing to delete: no row was created.");
  }

  const leftBehind = [];

  for (const row of createdRows) {
    const session = sessions[row.by];
    if (!session) {
      leftBehind.push({ ...row, why: `${row.by} is not signed in` });
      continue;
    }
    const deleted = await deleteTask(session.accessToken, row.id);
    if (deleted.error) {
      leftBehind.push({ ...row, why: deleted.error });
      continue;
    }
    if (deleted.rows.length !== 1) {
      leftBehind.push({
        ...row,
        why: `the delete matched ${deleted.rows.length} rows, expected 1`,
      });
      continue;
    }
    // Read it back: a delete that reports a row is still worth confirming,
    // because "it is gone" is the only thing that makes this cleanup true.
    const after = await readTasks(session.accessToken, { id: row.id });
    if (after.error) {
      leftBehind.push({ ...row, why: `deleted, but could not confirm: ${after.error}` });
    } else if (after.rows.length !== 0) {
      leftBehind.push({ ...row, why: "the row is still there after the delete" });
    } else {
      console.log(`  deleted ${row.what}, created by ${row.by}, and confirmed gone.`);
    }
  }

  if (leftBehind.length > 0) {
    failures += 1;
    console.log("");
    console.log(`  FAIL  cleanup left ${leftBehind.length} row(s) behind.`);
    console.log("  These are rows THIS SCRIPT created, so their ids are printed:");
    for (const row of leftBehind) {
      console.log(`    ${row.id}  (${row.what}, created by ${row.by}) -- ${row.why}`);
    }
    console.log(
      `  Every title also contains this run's marker, ${RUN_ID}, so they can be found` +
        ` in the staging Table Editor by searching for it.`,
    );
  }
  console.log("");

  for (const [label, session] of Object.entries(sessions)) {
    await signOut(label, session.accessToken);
  }
  console.log("");

  // -----------------------------------------------------------------------
  // The verdict
  // -----------------------------------------------------------------------

  console.log(`Totals: ${passes} PASS, ${failures} FAIL, ${unverified} UNVERIFIED.`);

  if (failures > 0 || unverified > 0) {
    console.log("");
    console.log("NOT GREEN. A FAIL is a rule not doing what the migration says it");
    console.log("does. An UNVERIFIED is a question that could not be asked, which");
    console.log("is not a pass either (AGENTS.md rule 8) -- the usual causes are a");
    console.log("migration that has not been applied, a wrong team id, Carol not");
    console.log("being in Alice's team, or a sign-in that failed. Read the lines");
    console.log("above before concluding anything about the rules themselves.");
    process.exitCode = 1;
  } else {
    console.log("");
    console.log("All checks passed.");
  }
}

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
//   export CAROL_TEAM_ID='...'
//   node scripts/staging/build-it-15-checks.mjs
//
// PowerShell has no `source`, so it reads the file line by line instead:
//
//   foreach ($line in Get-Content "$HOME\.config\team-tasks\staging.env") {
//     if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
//       Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim().Trim("'").Trim('"')
//     }
//   }
//   $env:ALICE_TEAM_ID = '...'
//   $env:CAROL_TEAM_ID = '...'
//   node scripts/staging/build-it-15-checks.mjs
//
// Neither team id is a secret, so it does not matter that those lines are kept in
// history. Close the shell window afterwards: the passwords live in that one
// process, and nothing writes them to disk.
//
// This script reads those eight names from the environment and nothing else. It
// never reads ~/.config/team-tasks/staging.env itself.
//
// The assistant has never run this script.
