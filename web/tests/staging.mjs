// staging.mjs -- the settings, the guard and the request helpers that
// tests/access-rules.test.mjs is built on. Build it 17, issue #145.
//
// NOT A TEST FILE, on purpose: the runner is pointed at one named file
// (web/package.json -> "test"), and nothing here matches Node's test-file
// patterns either, so this module is only ever imported.
//
// NO PACKAGES. Node built-ins and global fetch only, so `npm test` needs no
// install and adds no dependency (AGENTS.md rule 17). Every endpoint below was
// read out of the clients installed in web/node_modules rather than recalled,
// and the same list is written out in scripts/staging/build-it-15-checks.mjs:
//
//   POST   {url}/auth/v1/token?grant_type=password   body {email,password}
//          -- @supabase/auth-js GoTrueClient.js, signInWithPassword
//   POST   {url}/auth/v1/logout?scope=global
//          -- @supabase/auth-js GoTrueAdminApi.js
//   GET    {url}/rest/v1/{relation}?select=a,b&col=eq.value
//   POST   {url}/rest/v1/{relation}            body = the row
//   PATCH  {url}/rest/v1/{relation}?id=eq.{id} body = the columns to change
//   DELETE {url}/rest/v1/{relation}?id=eq.{id}
//          -- @supabase/postgrest-js PostgrestQueryBuilder.ts
//   POST   {url}/functions/v1/{name}
//          -- @supabase/functions-js FunctionsClient.js, invoke
//   Prefer: return=representation   -- what makes a write answer with the rows
//          it touched, so a refusal reads as "0 rows" instead of being guessed
//          at. PostgrestTransformBuilder.ts appends exactly this header.
//   the apikey header carries the publishable key; Authorization carries the
//          user's JWT.
//
// WHAT NOTHING HERE EVER PRINTS OR RETURNS INTO A MESSAGE: a password, an
// access token, a refresh token, the publishable key, or the project URL. A
// missing setting is reported BY NAME. Statuses and server-sent bodies are
// shown, because that is what the tests assert on.

// ---------------------------------------------------------------------------
// The guard -- run at import, before any network call
// ---------------------------------------------------------------------------
//
// The staging project's host. These tests sign in as real accounts and create
// rows, so pointed anywhere else they would be writing to a database that is
// not staging -- which AGENTS.md rules 1 and 10 forbid. The check below is a
// refusal to start, not a warning.
//
// The reference is the one already committed in scripts/staging/*.mjs. It is
// deliberately NOT in docs/environments.md, which records names and not
// project references; that file is the authority on which project is staging,
// and this constant is the same value its two sibling scripts already use.
//
// EXACTLY EQUAL, NOT CONTAINED. A substring test passes for
// http://127.0.0.1:8799/ghskxrhqlhvrhpnivqbd and for
// https://ghskxrhqlhvrhpnivqbd.attacker.example, neither of which is staging.
// So the URL is parsed and its hostname compared whole.
const STAGING_REF = "ghskxrhqlhvrhpnivqbd";
const STAGING_HOST = `${STAGING_REF}.supabase.co`;

// The five settings, by name. Nothing else is read from the environment.
const SETTING_NAMES = [
  "STAGING_SUPABASE_URL",
  "STAGING_SUPABASE_PUBLISHABLE_KEY",
  "STAGING_ALICE_PASSWORD",
  "STAGING_CAROL_PASSWORD",
  "STAGING_BOB_PASSWORD",
];

function refuse(message) {
  // Thrown rather than process.exit: this runs while the test file is being
  // imported, and a throw makes the runner report the file as failed with this
  // message, which is what somebody reading a CI log needs to see.
  throw new Error(`REFUSING TO RUN: ${message}`);
}

const settings = {};
const missing = [];
for (const name of SETTING_NAMES) {
  const value = (process.env[name] ?? "").trim();
  if (value === "") missing.push(name);
  settings[name] = value;
}

if (missing.length > 0) {
  refuse(
    `these settings are not set, or are empty: ${missing.join(", ")}.\n` +
      `All five are needed: ${SETTING_NAMES.join(", ")}.\n` +
      `No value is printed by these tests -- only names.\n` +
      `A run without them is not a pass and must not be skipped (AGENTS.md rule 8).`,
  );
}

let parsedUrl;
try {
  parsedUrl = new URL(settings.STAGING_SUPABASE_URL);
} catch {
  refuse(
    `STAGING_SUPABASE_URL is not a URL this runtime can parse.\n` +
      `The value is not printed, because a project URL identifies an environment.\n` +
      `Expected https://${STAGING_HOST}`,
  );
}

if (parsedUrl.protocol !== "https:") {
  refuse(
    `STAGING_SUPABASE_URL is not https, so this run was stopped before any request.\n` +
      `It found the scheme "${parsedUrl.protocol}". Expected https://${STAGING_HOST}\n` +
      `The rest of the value is not printed.`,
  );
}

if (parsedUrl.hostname !== STAGING_HOST) {
  refuse(
    `STAGING_SUPABASE_URL is not the staging project, so this run was stopped\n` +
      `before any request. These tests sign in and create rows; they may run\n` +
      `against staging and nothing else (AGENTS.md rules 1 and 10).\n` +
      `Expected the host ${STAGING_HOST}, exactly -- not a URL that merely\n` +
      `contains ${STAGING_REF} somewhere.\n` +
      `\n` +
      `THE HOST IT FOUND IS NOT PRINTED, and not because of GitHub's masking,\n` +
      `which covers a secret's whole value and not a part of it: a project\n` +
      `reference identifies an environment, and this repository's run logs are\n` +
      `public. Check the setting yourself. The likeliest cause is the wrong one\n` +
      `of two addresses: this wants the project's API URL,\n` +
      `https://<ref>.supabase.co, and NOT the dashboard address, which is\n` +
      `https://supabase.com/dashboard/project/<ref> and parses perfectly well.`,
  );
}

const BASE = `https://${STAGING_HOST}`;
const AUTH_URL = `${BASE}/auth/v1`;
const REST_URL = `${BASE}/rest/v1`;
const FUNCTIONS_URL = `${BASE}/functions/v1`;

const PUBLISHABLE_KEY = settings.STAGING_SUPABASE_PUBLISHABLE_KEY;

// ---------------------------------------------------------------------------
// Who the tests are
// ---------------------------------------------------------------------------
//
// The addresses the existing staging scripts use, listed in
// docs/environments.md -> "Seed data and test accounts". They are not secret
// and are written down there on purpose; the passwords are, and come from the
// three settings above.
export const PEOPLE = {
  alice: {
    label: "Alice",
    email: "teamtasks.staging.test+alice@gmail.com",
    passwordSetting: "STAGING_ALICE_PASSWORD",
  },
  carol: {
    label: "Carol",
    email: "teamtasks.staging.test+carol@gmail.com",
    passwordSetting: "STAGING_CAROL_PASSWORD",
  },
  bob: {
    label: "Bob",
    email: "teamtasks.staging.test+bob@gmail.com",
    passwordSetting: "STAGING_BOB_PASSWORD",
  },
};

// ONE fixed address, a plus-address of the staging test mailbox, and never a
// fresh one per run. Every invitation sends an email and occupies one of the
// team's 20 pending slots, and the publishable key cannot delete it: the
// invitations table has a read policy for the team's owner and no delete
// policy at all. So a run can afford to create this one once, ever -- after
// which every later run is refused by the partial unique index with 409 and
// code 23505, which is itself proof the request got past the owner check.
export const INVITE_ADDRESS = "teamtasks.staging.test+ci-invite@gmail.com";

// What a task row answers with. Named, never a star, so a column the table
// grows later cannot arrive in a test's output without somebody putting it
// there.
export const TASK_COLUMNS = "id,title,done,team_id,owner_id";

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

// One request through PostgREST. Returns { status, rows } or { status, error },
// and never throws, so a judgement about a refusal is made by the test rather
// than by an exception unwinding the run.
//
// accessToken may be null: that is the signed-out caller, who sends the
// publishable key and no Authorization header at all.
//
// `refused` is set only when the server said no. A body in a shape this module
// did not expect is NOT a refusal and must never be counted as one.
export async function rest(method, path, { accessToken = null, body } = {}) {
  const headers = { apikey: PUBLISHABLE_KEY };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  // Set for every method, including DELETE, which carries no body: without it
  // a delete answers 204 with nothing and "refused" and "deleted" look
  // identical.
  headers.Prefer = "return=representation";
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(`${REST_URL}/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    return { error: `could not reach the database (${cause.message})` };
  }

  const text = await response.text();

  if (!response.ok) {
    // PostgREST's error body is a message, a hint, a code and sometimes
    // details. None of them is a credential, and the messages the triggers
    // raise are sentences written in the migrations, so the body is shown
    // whole: it says which rule refused.
    return {
      status: response.status,
      error: text,
      refused: true,
    };
  }

  if (text.trim() === "") return { status: response.status, rows: [] };

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      status: response.status,
      error: `HTTP ${response.status} with a body that is not JSON`,
    };
  }
  if (!Array.isArray(parsed)) {
    return {
      status: response.status,
      error: `expected a JSON array, got ${typeof parsed}`,
    };
  }
  return { status: response.status, rows: parsed };
}

// A select with eq filters, for one relation.
export function read(relation, columns, filters, accessToken = null) {
  const query = new URLSearchParams();
  query.set("select", columns);
  for (const [column, value] of Object.entries(filters)) {
    query.append(column, `eq.${value}`);
  }
  return rest("GET", `${relation}?${query.toString()}`, { accessToken });
}

// public.is_team_member(p_team_id uuid). Returns { value } or { error }.
//
// Not routed through rest(): an rpc returning a scalar answers with `true` or
// `false` itself rather than a list of rows, so the "must be a JSON array"
// check above would reject a correct answer.
//
// THE ARGUMENT IS NAMED p_team_id, not team_id. PostgREST passes the keys of
// this body as named arguments, so the name has to be the one in
// 20261002122203_team_rules.sql -- which explains why it is not team_id.
export async function isTeamMember(accessToken, teamId) {
  let response;
  try {
    response = await fetch(`${REST_URL}/rpc/is_team_member`, {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_team_id: teamId }),
    });
  } catch (cause) {
    return { error: `could not reach the database (${cause.message})` };
  }

  const text = (await response.text()).trim();
  if (!response.ok) return { error: `HTTP ${response.status} ${text}` };
  if (text === "true") return { value: true };
  if (text === "false") return { value: false };
  return { error: `expected true or false, got ${text || "an empty body"}` };
}

// One Edge Function call. Returns { status, text, json } -- the status and the
// body the server actually sent, unparsed as well as parsed, because that is
// what the invitation tests assert on. json is null when the body is not JSON.
export async function callFunction(name, { accessToken, body }) {
  const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
//
// ONE SIGN-IN PER ACCOUNT PER RUN. Supabase's auth endpoint is rate-limited,
// and a test file that signed in per test would spend its budget on sign-ins
// and start failing for a reason that has nothing to do with the rules. The
// test file calls this once per person in a before() hook and passes the
// session around.
export async function signIn(person) {
  const password = (process.env[person.passwordSetting] ?? "").trim();

  let response;
  try {
    response = await fetch(`${AUTH_URL}/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: person.email, password }),
    });
  } catch (cause) {
    throw new Error(
      `${person.label} could not reach the sign-in endpoint (${cause.message}). ` +
        `Nothing was tested.`,
    );
  }

  if (!response.ok) {
    // A failed sign-in's body carries no token, so it is safe to show, and it
    // is the only way to tell a wrong password from a missing account.
    throw new Error(
      `${person.label} (${person.passwordSetting}, value not printed) could not sign in: ` +
        `HTTP ${response.status} ${await response.text()}`,
    );
  }

  const session = await response.json();
  const accessToken = session?.access_token ?? "";
  const userId = session?.user?.id ?? "";
  if (accessToken === "") {
    throw new Error(`${person.label}: sign in returned 2xx but no access token.`);
  }
  if (userId === "") {
    throw new Error(`${person.label}: sign in returned 2xx but no user id.`);
  }
  // Neither value is ever printed, here or by the test file.
  return { label: person.label, accessToken, userId };
}

// Ends the session this run created. Failure is reported, not thrown: a
// session left behind expires on its own, and losing the test result to a
// tidy-up error would be the worse outcome.
export async function signOut(session) {
  try {
    const response = await fetch(`${AUTH_URL}/logout?scope=global`, {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.accessToken}`,
      },
    });
    return `${session.label} signed out: HTTP ${response.status}`;
  } catch (cause) {
    return `${session.label} sign out failed (${cause.message}); the session expires on its own`;
  }
}

// What the guard let through, for the run's own log. The host only -- the key,
// the passwords and the full URL stay unprinted.
export const STAGING_DESCRIPTION = `${STAGING_HOST} (staging, host checked exactly)`;
