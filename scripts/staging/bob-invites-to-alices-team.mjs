#!/usr/bin/env node
// bob-invites-to-alices-team.mjs -- the Bob half of the Alice / Bob / Carol
// check for feature 3, run against STAGING only.
//
// WHAT IT IS FOR. invite-member refuses anybody who is not the team's owner.
// That rule has never been exercised: the owner's preview testing invited Carol
// to Alice's own team, which is the allowed path. This signs in as Bob and asks
// Bob to invite somebody to ALICE'S team, which the function must refuse.
//
// A guard nobody has triggered is a guard nobody knows works. Expected result:
//
//     HTTP 403
//     {"error":"Only the team's owner can invite people.","code":null}
//
// Anything else is the finding. A 201 would mean any signed-in person can invite
// strangers into somebody else's team.
//
// NO PACKAGES. The repository root has no dependencies and no node_modules, so
// this uses Node built-ins only -- global fetch, needs Node 18 or newer. Every
// endpoint below was read from the installed clients in web/node_modules rather
// than recalled:
//
//   POST {url}/auth/v1/token?grant_type=password   body {email,password}
//        -- @supabase/auth-js GoTrueClient.js, signInWithPassword
//   POST {url}/functions/v1/{name}
//        -- @supabase/functions-js FunctionsClient.js, invoke
//   POST {url}/auth/v1/logout?scope=global
//        -- @supabase/auth-js GoTrueAdminApi.js
//   the API key travels in the `apikey` header; Authorization carries the user's
//        JWT -- @supabase/functions-js invoke remarks
//
// WHAT IT NEVER PRINTS: the password, the access token, the refresh token, or
// the publishable key. Only Bob's address, the team id it was given, HTTP
// statuses, and the invite-member response body.
//
// Run it from the repository root. See the bottom of this file.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The staging project's reference. This script may run against NOTHING ELSE.
//
// It signs in and calls a function that writes rows. Pointed at production it
// would be creating invitations in real people's teams, so the check below is a
// refusal to start, not a warning. AGENTS.md rules 1 and 10.
const STAGING_REF = "ghskxrhqlhvrhpnivqbd";

// A FRESH address on every run, and this matters more than it looks.
//
// The first version of this script used a fixed nobody@example.com. Alice's team
// already has a pending invitation for that address, and invite-member has a
// unique index on (team_id, email) where accepted_at is null. So if the owner
// check were broken, the call would have got past it and then failed at the
// index with 409 -- and this script would have printed "neither 403 nor 201",
// which reads as inconclusive. A serious hole would have looked like a shrug.
//
// With an address nothing has ever been invited to, that collision cannot
// happen, so 201 is the only way a broken owner check can surface.
const INVITE_ADDRESS = `bob-test-${Date.now()}@example.com`;
const FUNCTION_NAME = "invite-member";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(HERE, "..", "..", "web", ".env.local");

function die(message) {
  console.error(`\nREFUSING TO RUN: ${message}\n`);
  process.exit(1);
}

// A small .env reader. No dotenv package exists here, and adding one for a
// staging script would need a rule 17 conversation for no benefit.
//
// Handles: blank lines, # comments, optional `export ` prefix, and values
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

const bobEmail = (process.env.BOB_EMAIL ?? "").trim();
const bobPassword = process.env.BOB_PASSWORD ?? "";
const aliceTeamId = (process.env.ALICE_TEAM_ID ?? "").trim();

// Each missing name is reported by NAME, never by value.
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

const missingFromEnv = [];
if (bobEmail === "") missingFromEnv.push("BOB_EMAIL");
if (bobPassword === "") missingFromEnv.push("BOB_PASSWORD");
if (aliceTeamId === "") missingFromEnv.push("ALICE_TEAM_ID");
if (missingFromEnv.length > 0) {
  die(
    `these environment variables are not set: ${missingFromEnv.join(", ")}.\n` +
      `Set them on the command line for this one run, so they are not stored.\n` +
      `No value is printed by this script.`,
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

console.log("Bob invites somebody to Alice's team -- staging only");
console.log(`  project reference:  ${STAGING_REF} (staging, confirmed)`);
console.log(`  signing in as:      ${bobEmail}`);
console.log(`  team id:            ${aliceTeamId}`);
console.log(`  inviting:           ${INVITE_ADDRESS}`);
console.log(
  "  expected:           HTTP 403, \"Only the team's owner can invite people.\"",
);
console.log("");

// ---------------------------------------------------------------------------
// 1. Sign in as Bob
// ---------------------------------------------------------------------------

const authUrl = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
const functionsUrl = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1`;

let accessToken = "";

try {
  const signIn = await fetch(`${authUrl}/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: bobEmail, password: bobPassword }),
  });

  console.log(`Sign in: HTTP ${signIn.status}`);

  if (!signIn.ok) {
    // The body of a failed sign-in carries no token, so it is safe to show and
    // it is the only way to tell a wrong password from a missing account.
    const problem = await signIn.text();
    console.error(`Sign in failed. Response body: ${problem}`);
    die("could not sign in as Bob, so nothing was tested.");
  }

  const session = await signIn.json();
  accessToken = session?.access_token ?? "";
  if (accessToken === "") {
    die("sign in returned HTTP 2xx but no access token, so nothing was tested.");
  }
  // Deliberately not printed, here or anywhere below.
  console.log("Signed in. The access token is not printed.\n");
} catch (cause) {
  die(`could not reach ${authUrl} (${cause.message}).`);
}

// ---------------------------------------------------------------------------
// 2. Bob calls invite-member against Alice's team
// ---------------------------------------------------------------------------
//
// try/finally, so Bob is signed out even if this throws.
try {
  const response = await fetch(`${functionsUrl}/${FUNCTION_NAME}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ team_id: aliceTeamId, email: INVITE_ADDRESS }),
  });

  // Raw status and raw body, unparsed and uninterpreted. Read as text rather
  // than JSON so a non-JSON answer is shown as it arrived instead of throwing.
  const body = await response.text();

  console.log(`${FUNCTION_NAME}: HTTP ${response.status}`);
  console.log(`${FUNCTION_NAME}: response body:`);
  console.log(body);
  console.log("");

  // Said plainly, because the interesting outcome is the one nobody expects.
  if (response.status === 403) {
    console.log(
      "RESULT: refused, as it should be. Bob cannot invite into Alice's team.",
    );
  } else if (response.status === 201) {
    console.log(
      "RESULT: *** PROBLEM *** Bob created an invitation in a team he does not own.",
    );
    console.log(
      "        Any signed-in person can invite strangers into somebody else's team.",
    );
    console.log("        Tell the owner before going further, and then:");
    console.log(
      `        delete the invitation for ${INVITE_ADDRESS} from the staging invitations table,`,
    );
    console.log(
      "        because it is real and it occupies one of that team's 20 pending slots.",
    );
  } else if (response.status === 409) {
    // The one confound a fresh address does not remove.
    //
    // The owner check runs FIRST in invite-member, so a working one answers 403
    // and nothing below it is reached. A 409 therefore means something got past
    // it -- and with an address nothing has been invited to, the only 409 left
    // is the 20-pending limit.
    console.log(
      "RESULT: *** TREAT AS A PROBLEM UNTIL CHECKED *** 409 on a brand-new address.",
    );
    console.log(
      "        The owner check runs before every other check in invite-member, so a working",
    );
    console.log(
      "        one answers 403 and nothing else is reached. Getting as far as a 409 suggests",
    );
    console.log("        it did not refuse.");
    console.log(
      "        Read the body above: if it is about the 20-invitation limit, the owner check",
    );
    console.log(
      "        may still be broken and the limit merely stopped it. Clear some pending",
    );
    console.log("        invitations from that team and run this again.");
  } else {
    console.log(
      `RESULT: neither 403 nor 201. Read the status and body above before drawing a conclusion --`,
    );
    console.log(
      `        a 404 would mean the team id is wrong, so nothing was tested; a 500 would mean`,
    );
    console.log(
      `        the function failed rather than refused, which is not the same as the rule`,
    );
    console.log(
      `        working; a 503 would mean this environment is not configured to send email.`,
    );
  }
} finally {
  // -------------------------------------------------------------------------
  // 3. Sign out
  // -------------------------------------------------------------------------
  try {
    const signOut = await fetch(`${authUrl}/logout?scope=global`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });
    console.log(`\nSign out: HTTP ${signOut.status}`);
  } catch (cause) {
    console.error(`\nSign out failed (${cause.message}).`);
    console.error(
      "Bob's session may still be live. It expires on its own, but you can sign out in the browser.",
    );
  }
}

// HOW TO RUN IT, from the repository root.
//
// KEEP THE PASSWORD OFF THE COMMAND LINE. An earlier version of this comment
// said to put the values inline -- BOB_PASSWORD='...' node ... -- "so the
// password is not stored anywhere". That was wrong in both shells, and checked
// on this machine rather than assumed:
//
//   * Git Bash writes every command line to ~/.bash_history. That file exists
//     here, and HISTCONTROL is unset, so the usual leading-space trick
//     (ignorespace) would not help either.
//   * PowerShell is no better: PSReadLine's HistorySaveStyle is
//     SaveIncrementally and its history file exists, so $env:BOB_PASSWORD =
//     '...' lands in a file as soon as you press Enter.
//
// So prompt for it instead. What you TYPE at a prompt is not a command line and
// is not written to either history file.
//
// Git Bash, WSL or macOS:
//
//   read -rsp 'Bob password: ' BOB_PASSWORD; echo
//   export BOB_PASSWORD
//   export BOB_EMAIL='bob@...'
//   export ALICE_TEAM_ID='...'
//   node scripts/staging/bob-invites-to-alices-team.mjs
//   unset BOB_PASSWORD
//
// PowerShell:
//
//   $env:BOB_PASSWORD = Read-Host 'Bob password'
//   $env:BOB_EMAIL = 'bob@...'
//   $env:ALICE_TEAM_ID = '...'
//   node scripts/staging/bob-invites-to-alices-team.mjs
//   Remove-Item Env:BOB_PASSWORD
//
// BOB_EMAIL and ALICE_TEAM_ID are not secrets, so it does not matter that those
// two lines are kept in history. Only the password needs the prompt.
//
// The assistant has never run this script.
