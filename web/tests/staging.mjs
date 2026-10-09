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
//   POST   {url}/auth/v1/logout?scope=local
//          -- @supabase/auth-js GoTrueAdminApi.js builds exactly
//          `${url}/logout?scope=${scope}` and refuses any scope outside
//          SIGN_OUT_SCOPES = ['global', 'local', 'others'] (lib/types.js)
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

// Buffer is a global in Node, and is imported by name anyway: it is what the
// file fixtures below are, and a named import says where it comes from. Still no
// package -- `node:buffer` is a built-in, so `npm test` installs nothing.
import { Buffer } from "node:buffer";

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
const STORAGE_URL = `${BASE}/storage/v1`;

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
// Files in the `attachments` bucket (Build it 23 part 2, issue #242)
// ---------------------------------------------------------------------------
//
// Four requests, each one carrying the caller's own session and nothing more.
// There is no secret key here and there is none anywhere in this folder: the
// whole point of the tests that use these is that the three POLICIES on
// storage.objects decide, and a service key "entirely bypass[es] RLS policies"
// (https://supabase.com/docs/guides/storage/security/access-control), so a test
// written with one would prove nothing about them.
//
// accessToken may be null, which is the signed-out caller: the publishable key
// and no Authorization header at all.
//
// THE ENDPOINTS, read off Supabase's own self-hosting reference and already
// written out in scripts/staging/build-it-23-attachment-checks.mjs:
//
//   POST   {url}/storage/v1/object/{bucket}/{path}    upload
//   GET    {url}/storage/v1/object/{bucket}/{path}    download
//   DELETE {url}/storage/v1/object/{bucket}/{path}    delete
//   POST   {url}/storage/v1/object/list/{bucket}      body {prefix,limit}
//
// AND WHY EVERY REFUSAL HERE IS READ BY ITS CODE RATHER THAN ITS STATUS. The
// owner's staging run of 8 October 2026 found Storage answering HTTP 400 with
// the real status inside the body -- `{"statusCode":"404", ...,
// "code":"NoSuchBucket"}` -- so the HTTP line is a weak signal. The error CODE
// in the body is what the error-codes page names
// (https://supabase.com/docs/guides/storage/debugging/error-codes) and is what
// these tests assert on.

export const BUCKET = "attachments";

// A real 1x1 PNG, so an accepted upload is a file a browser could draw rather
// than a few bytes that happen to be allowed. Base64 so there is no binary in
// this repository.
export const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/WMmxY8AAAAASUVORK5CYII=",
  "base64",
);

// An SVG, which is the whole reason the bucket names its six types instead of
// saying `image/*`: an SVG is a document and it can carry script. This one
// carries a comment where a script would go -- a test does not need a payload to
// prove a refusal, and a committed payload is a thing somebody has to explain.
export const SVG_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><!-- refused on purpose --></svg>',
  "utf8",
);

// 5 MB as the bucket has it: 5 * 1024 * 1024. The migration spells 5242880.
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** One byte over, which is the smallest thing that can be refused for its size. */
export const oversizeBytes = () => Buffer.alloc(MAX_FILE_BYTES + 1);

function storageHeaders(accessToken, contentType) {
  const headers = { apikey: PUBLISHABLE_KEY };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

// What every one of the four returns: the status, the body as text, and the body
// parsed when it is JSON. `refused` is set only when the server said no -- a body
// in a shape these helpers did not expect is NOT a refusal and must never be
// counted as one (AGENTS.md rule 8).
function storageAnswer(status, text) {
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status, text, json, refused: status < 200 || status >= 300 };
}

/**
 * Upload one file.
 *
 * `contentType` IS SET BY THE CALLER, ALWAYS, and that is the finding Build it 23
 * part 2 turns on rather than a tidiness: Supabase works the declared type out
 * from the extension unless it is overridden, and the owner's staging run of
 * 9 October 2026 showed it does NOT map `.heic` to `image/heic`. So the app sets
 * the type from its own table, and these tests send the type the same way for the
 * same reason.
 */
export async function storageUpload(path, bytes, contentType, accessToken = null) {
  let response;
  try {
    response = await fetch(`${STORAGE_URL}/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: storageHeaders(accessToken, contentType),
      body: bytes,
    });
  } catch (cause) {
    return { error: `could not reach Storage (${cause.message})` };
  }
  return storageAnswer(response.status, await response.text());
}

/**
 * List one task's folder.
 *
 * TWO ANSWERS ARE A REFUSAL AND THEY ARE DIFFERENT THINGS, so both are reported
 * rather than blurred: a 4xx, or a 200 with an empty array because no policy
 * matched a row. Supabase's own access-control page says only that listing "may"
 * want a different SELECT policy from reading, so which shape staging gives is
 * something the tests report rather than require.
 */
export async function storageList(prefix, accessToken = null) {
  let response;
  try {
    response = await fetch(`${STORAGE_URL}/object/list/${BUCKET}`, {
      method: "POST",
      headers: storageHeaders(accessToken, "application/json"),
      body: JSON.stringify({ prefix, limit: 100 }),
    });
  } catch (cause) {
    return { error: `could not reach Storage (${cause.message})` };
  }

  const answer = storageAnswer(response.status, await response.text());
  // The names in the answer, relative to the prefix, so a test can ask whether
  // its own file is among them without knowing the shape of a row.
  answer.names = Array.isArray(answer.json)
    ? answer.json.map((row) => row?.name).filter((name) => typeof name === "string")
    : null;
  return answer;
}

/**
 * Download one file. The bytes are what a test decides on, and they are never
 * printed -- a file's contents are not something a public run log should carry,
 * whatever they are. A test compares lengths and bytes.
 */
export async function storageDownload(path, accessToken = null) {
  let response;
  try {
    response = await fetch(`${STORAGE_URL}/object/${BUCKET}/${path}`, {
      method: "GET",
      headers: storageHeaders(accessToken),
    });
  } catch (cause) {
    return { error: `could not reach Storage (${cause.message})` };
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    refused: response.status !== 200,
    byteLength: bytes.length,
    sameAs: (other) => bytes.equals(Buffer.isBuffer(other) ? other : Buffer.from(other)),
    // The body as text ONLY when it is small and the request failed, which is
    // when it is a JSON refusal rather than a file.
    text: response.status !== 200 && bytes.length < 2048 ? bytes.toString("utf8") : "",
  };
}

/**
 * Delete one file.
 *
 * THROUGH THE STORAGE API AND NEVER WITH SQL. "Deleting objects via a SQL query
 * will not remove the object from the bucket and will result in the object being
 * orphaned"
 * (https://supabase.com/docs/guides/storage/management/delete-objects) -- so a
 * cleanup that went through PostgREST would leave the bytes behind, paid for and
 * unreachable, which is exactly what the owner's "leftover files are not
 * acceptable" decision forbids.
 *
 * NOTHING IS READ OUT OF THE ANSWER'S BODY, AND THAT IS DELIBERATE. The obvious
 * thing to read would be a row count -- "deleted" against "matched nothing" --
 * the way `Prefer: return=representation` buys that for every write in `rest`
 * above. It is not available here and the shortcut would be wrong twice over:
 *
 *   * this endpoint answers `{"message":"Successfully deleted"}`, which is not a
 *     count of anything (seen on staging, and the fixture in
 *     scripts/staging/build-it-23-attachment-checks.mjs is that body verbatim);
 *   * and the JS client's own `remove`, which takes a list and IS typed as
 *     answering with the rows it deleted, documents its response as
 *     `{"data": [], "error": null}` for a successful delete of one named file
 *     (web/node_modules/@supabase/storage-js/dist/index.mjs). So an empty array
 *     is not evidence of anything either.
 *
 * So a test decides on the STATUS and on reading the folder back, which is what
 * every test in this file does about every write anyway.
 */
export async function storageDelete(path, accessToken = null) {
  let response;
  try {
    response = await fetch(`${STORAGE_URL}/object/${BUCKET}/${path}`, {
      method: "DELETE",
      headers: storageHeaders(accessToken),
    });
  } catch (cause) {
    return { error: `could not reach Storage (${cause.message})` };
  }

  return storageAnswer(response.status, await response.text());
}

/**
 * How a storage answer is described in a log line or an assertion message.
 *
 * THE STATUS AND THE CODE, NEVER THE WHOLE BODY, and never the path. The reason
 * is the one `describeAnswer` in the test file gives about an email address, and
 * one more that is specific to this bucket: docs/plan.md forbids a file name in
 * an error report, because a name is free text somebody's phone chose. A run log
 * in this repository is public, and an assertion message is printed on failure.
 */
export const describeStorage = (answer) =>
  `HTTP ${answer.status} code=${JSON.stringify(answer.json?.code ?? answer.json?.error ?? null)}`;

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

// Ends the session this run created, and only that one. scope=local is the
// whole point: 'global' ends every session belonging to that account, which
// on staging would sign the owner's own browser out of Alice, Carol or Bob
// every time the tests ran. The three accepted values are 'global', 'local'
// and 'others' -- @supabase/auth-js lib/types.js, SIGN_OUT_SCOPES.
//
// Failure is reported, not thrown: a session left behind expires on its own,
// and losing the test result to a tidy-up error would be the worse outcome.
export async function signOut(session) {
  try {
    const response = await fetch(`${AUTH_URL}/logout?scope=local`, {
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
