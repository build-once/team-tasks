#!/usr/bin/env node
// build-it-16-checks.mjs -- the function doors, run against STAGING only.
// Build it 16 step 2, issue #112, which closes #110 and #111.
//
// WHAT IT IS FOR. Three doors that the project claims are shut and that nothing
// has ever pushed on:
//
//   1. A PRESENT BUT FORGED TOKEN (issue #110). Every one of the three Edge
//      functions declares `auth: "user"` and is deployed with verify_jwt = true
//      (supabase/config.toml:25, :38, :49), which is the project's entire reason
//      for believing a caller's identity. The only refusal ever observed is the
//      one where the Authorization header is MISSING altogether
//      (evidence/create-team.md:184-197, evidence/invitations.md:39-42) -- and
//      that same 401 would be produced by a function deployed with
//      verify_jwt = false whose own code happened to look for the header. A
//      forged-signature 401 is the observation that tells "the platform verified
//      the signature" apart from "something looked at the header".
//
//   2. invite-member's 403 for somebody who is not the team's owner. Exercised
//      once, by scripts/staging/bob-invites-to-alices-team.mjs. Re-asked here
//      because it is one of two answers that must stay DIFFERENT from each
//      other, and because this script also checks the thing that script did not:
//      that the refusal left no invitation behind.
//
//   3. invite-member's 404 for a team id that does not exist. Never exercised at
//      all. It is the other half of the pair above: a comment in that file used
//      to claim the 403 and the 404 were the same answer, which was untrue
//      (issue #111). A check that sees both, separately, is what stops somebody
//      collapsing one into the other later.
//
// HOW A 401 IS JUDGED, and this is the point of the whole script. Each forged
// call sends `{}` as its body -- a body every one of the three functions refuses
// with 400 and its own wording. So there are two independent signals:
//
//   * the status must be 401. A 400 means the request reached the handler, which
//     is what verify_jwt = false looks like;
//   * the body must carry none of the functions' own text. A 401 carrying the
//     function's own `error` sentence would mean the handler produced it -- the
//     same reasoning as .github/workflows/migrate-production.yml:442.
//
// An empty body also means there is NOTHING FOR A FORGED CALL TO CREATE. If a
// door turned out to be open, the worst this script can provoke is a 400.
//
// THE OTHER HALF OF #110 IS OPTIONAL AND IS NOT RUN BY DEFAULT. #110 asks for an
// expired-but-correctly-signed token as well as a forged one. This script cannot
// make one: it cannot sign anything, and it will not wait an hour. So it checks
// that case only if EXPIRED_ACCESS_TOKEN is set, and when it is not set it says
// UNVERIFIED and says why. That one line does NOT change the exit code -- the
// three checks issue #112 asks for are what the exit code is about -- so read the
// lines, not only the code. See the bottom of this file for how to get one.
//
// IT CAN FAIL, which is the only reason to trust it passing. Every judgement
// below is a pure function, and `--selftest` feeds those functions fabricated
// answers -- an open door, a handler-produced 401, a body with data in it, a 201
// where a 403 belongs -- and checks that each one comes out FAIL. That run needs
// no network, no account and no staging project:
//
//   node scripts/staging/build-it-16-checks.mjs --selftest
//
// IT WRITES NOTHING. It signs two people in, sends four requests that are all
// meant to be refused, reads the invitations table once to confirm a refusal left
// nothing behind, and signs out. No row is created by design rather than by luck:
// no request it sends has a body that any function would accept.
//
// NO PACKAGES. The repository root has no dependencies and no node_modules, so
// this uses Node built-ins only -- global fetch, node:crypto, node:buffer --
// needs Node 18 or newer. Every endpoint was read from the installed clients in
// web/node_modules rather than recalled, and they are the same four the two
// earlier staging scripts use:
//
//   POST   {url}/auth/v1/token?grant_type=password   body {email,password}
//          -- @supabase/auth-js GoTrueClient.js, signInWithPassword
//   POST   {url}/auth/v1/logout?scope=global
//          -- @supabase/auth-js GoTrueAdminApi.js
//   POST   {url}/functions/v1/{name}
//          -- @supabase/functions-js FunctionsClient.js, invoke
//   GET    {url}/rest/v1/{relation}?select=a,b&col=eq.value
//          -- @supabase/postgrest-js PostgrestQueryBuilder.ts, and the /rest/v1
//             prefix is SupabaseClient.ts
//   the API key travels in the `apikey` header; Authorization carries the
//          caller's JWT -- @supabase/functions-js invoke remarks
//
// WHAT IT NEVER PRINTS: a password, a real access token, a refresh token, the
// publishable key, an email address belonging to a person, a user id, or an
// invitation id. The forged token is not printed either -- not because it is a
// secret, it is worthless, but because a script that prints one token shape today
// prints the wrong one tomorrow. Every response body is passed through scrub()
// first, which replaces any token this script holds with a placeholder. What does
// get printed: HTTP statuses, counts, true/false, the fabricated example.com
// address it tries to invite, the team id you passed in, and response bodies from
// the platform and from the functions' own fixed wording.
//
// Run it from the repository root. See the bottom of this file.

import { readFileSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The staging project's reference. This script may run against NOTHING ELSE.
// AGENTS.md rules 1 and 10. The same constant as the two scripts beside it.
const STAGING_REF = "ghskxrhqlhvrhpnivqbd";

// The shape Postgres accepts for a uuid column: 8-4-4-4-12 hex digits. Used
// twice below for two different jobs -- validating ALICE_TEAM_ID, and looking for
// an id that should not be in a 401 body -- so it is deliberately not anchored
// here; the two uses add their own anchors or do not, as each needs.
const UUID_CHARS =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const UUID_PATTERN = new RegExp(`^${UUID_CHARS}$`);
const UUID_ANYWHERE = new RegExp(UUID_CHARS);

// The three functions, by the names in supabase/config.toml.
const FUNCTIONS = ["create-team", "invite-member", "accept-invite"];

// Sentences the FUNCTIONS' OWN CODE produces, copied from the three index.ts
// files rather than remembered. Each is one a `{}` body or a missing claim can
// reach, which is exactly what this script sends:
//
//   "You must be signed in ..."  -- all three, the handler's own 401
//     (create-team:72, invite-member:236, accept-invite:83)
//   "Expected a JSON body ..."   -- all three, a body that will not parse
//     (create-team:80, invite-member:243, accept-invite:101)
//   the three below                -- each function's first complaint about `{}`
//     (create-team:85, invite-member:250, accept-invite:106)
//
// If any of them turns up in a 401 body, the request reached the handler and the
// platform did not refuse it.
const HANDLER_FINGERPRINTS = [
  "You must be signed in",
  "Expected a JSON body",
  "Please give the team a name.",
  "Which team is this invitation for?",
  "This invitation link is missing its token.",
];

// A platform refusal is short. An application answer carrying rows is not. 400
// characters is generous for the former -- the longest one seen in this project
// is `{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}` (evidence/create-team.md:184-197)
// -- and a body over it is reported with its length so the owner can judge.
const MAX_REFUSAL_BODY = 400;

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(HERE, "..", "..", "web", ".env.local");

function die(message) {
  console.error(`\nREFUSING TO RUN: ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// The judgements -- pure functions, which is what --selftest exercises
// ---------------------------------------------------------------------------
//
// Every one of these takes what came back and returns a list of
// { what, verdict, detail } with verdict "PASS", "FAIL" or "UNVERIFIED". None of
// them sends a request, reads a file or looks at the environment, so the selftest
// can hand them fabricated answers and check they say FAIL to each one.
//
// "UNVERIFIED" is for an answer that does not settle the question -- a request
// that never arrived, a 404 where a 403 was being tested. AGENTS.md rule 8: that
// is not a pass.

const PASS = "PASS";
const FAIL = "FAIL";
const UNVERIFIED = "UNVERIFIED";

// Three separate judgements on one refusal, because they can fail independently
// and a single verdict would hide which one did.
//
// `label` names what was called. `answer` is { status, body } or { error }.
function judgeClosedDoor(label, answer) {
  const statusCheck = `${label}: answers 401`;
  const dataCheck = `${label}: the 401 body carries no data`;
  const whoCheck = `${label}: the refusal came from the platform, not the handler`;

  if (answer.error) {
    return [statusCheck, dataCheck, whoCheck].map((what) => ({
      what,
      verdict: UNVERIFIED,
      detail: answer.error,
    }));
  }

  const body = answer.body ?? "";
  const results = [
    {
      what: statusCheck,
      verdict: answer.status === 401 ? PASS : FAIL,
      detail:
        `saw HTTP ${answer.status}` +
        (answer.status === 400
          ? " -- a 400 means the body reached the function's own code, which is what" +
            " verify_jwt = false looks like"
          : ""),
    },
  ];

  // What "no data" means, said as a list rather than a feeling: no email
  // address, no id, and short.
  const leaks = [];
  if (body.includes("@")) leaks.push("it contains an @, so possibly an address");
  const idMatch = body.match(UUID_ANYWHERE);
  if (idMatch) leaks.push("it contains a uuid, so possibly an id");
  if (body.length > MAX_REFUSAL_BODY) {
    leaks.push(`it is ${body.length} characters, over the ${MAX_REFUSAL_BODY} expected of a refusal`);
  }
  results.push({
    what: dataCheck,
    verdict: leaks.length === 0 ? PASS : FAIL,
    detail:
      leaks.length === 0
        ? `HTTP ${answer.status}, ${body.length} characters, no address and no id in it`
        : `HTTP ${answer.status}: ${leaks.join("; ")}`,
  });

  // Who answered. Two signals, and either one is enough to say "the handler
  // did": its own wording, or the { error: ... } shape every one of its
  // failures uses (the `fail` helper at the top of each index.ts).
  //
  // This errs towards FAIL on purpose. If the platform itself ever answers with
  // an `error` key this check will cry wolf -- and the detail line says which of
  // the two signals tripped, so the owner can see that is what happened. A
  // false FAIL gets looked at; a false PASS does not.
  const fingerprint = HANDLER_FINGERPRINTS.find((text) => body.includes(text));
  let shapedLikeHandler = false;
  try {
    const parsed = JSON.parse(body);
    shapedLikeHandler =
      parsed !== null &&
      typeof parsed === "object" &&
      typeof parsed.error === "string";
  } catch {
    // Not JSON. The platform's refusals are JSON, but a gateway or proxy answer
    // need not be, and that is not by itself a reason to fail this check.
    shapedLikeHandler = false;
  }

  if (fingerprint) {
    results.push({
      what: whoCheck,
      verdict: FAIL,
      detail:
        `HTTP ${answer.status}, and the body contains the function's own words` +
        ` ("${fingerprint}"), so the request reached the handler`,
    });
  } else if (shapedLikeHandler) {
    results.push({
      what: whoCheck,
      verdict: FAIL,
      detail:
        `HTTP ${answer.status}, and the body has an "error" string, the shape every` +
        ` failure inside these functions uses -- so the handler answered. If the` +
        ` PLATFORM has started using that key, this is a false alarm: read the body above`,
    });
  } else {
    results.push({
      what: whoCheck,
      verdict: PASS,
      detail: `HTTP ${answer.status}, and no wording or shape of the functions' own in the body`,
    });
  }

  return results;
}

// invite-member, called by somebody who is not the team's owner.
function judgeNotTheOwner(answer) {
  const what = "invite-member as Bob, against Alice's team: answers 403";
  if (answer.error) {
    return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  }
  const body = answer.body ?? "";
  if (answer.status === 403) {
    // The status alone is not enough: the function's own 403 says so, and a 403
    // from somewhere else entirely would not.
    const ownWords = body.includes("Only the team's owner can invite people.");
    return [
      {
        what,
        verdict: ownWords ? PASS : UNVERIFIED,
        detail: ownWords
          ? "HTTP 403, with invite-member's own wording"
          : `HTTP 403, but not invite-member's own wording -- body: ${body}`,
      },
    ];
  }
  const detail = {
    201: "HTTP 201 -- an invitation was CREATED by somebody who does not own the team",
    401: "HTTP 401 -- Bob's own token was refused, so the owner rule was never reached",
    404: "HTTP 404 -- that team id does not exist, so nothing about ownership was tested",
    409: "HTTP 409 -- something got PAST the owner check: it runs before every other check in that function",
    503: "HTTP 503 -- the function could not send email, so it never reached a verdict on ownership",
  }[answer.status];
  return [
    {
      what,
      // 404, 401 and 503 tested nothing. 201 and 409 are findings.
      verdict: answer.status === 404 || answer.status === 401 || answer.status === 503 ? UNVERIFIED : FAIL,
      detail: detail ?? `HTTP ${answer.status} -- body: ${body}`,
    },
  ];
}

// The half bob-invites-to-alices-team.mjs never asked: did the refusal leave
// anything behind? `read` is the invitations read, as the team's owner.
//
// `ownerConfirmed` is false when the read could not be trusted to mean anything
// -- if Alice does not own that team, her reading no rows proves nothing, since
// the select policy would hide another team's invitations from her anyway.
function judgeNothingCreated(read, ownerConfirmed) {
  const what = "invite-member as Bob: created no invitation";
  if (read.error) {
    return [{ what, verdict: UNVERIFIED, detail: read.error }];
  }
  if (!ownerConfirmed) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail:
          `${read.rows.length} row(s) came back, but Alice was not confirmed as that team's` +
          ` owner -- the select policy would show her nothing either way, so 0 rows says nothing`,
      },
    ];
  }
  return [
    {
      what,
      verdict: read.rows.length === 0 ? PASS : FAIL,
      detail: `${read.rows.length} invitation(s) for that address on that team, expected 0`,
    },
  ];
}

// invite-member, called by a team's owner, about a team id that does not exist.
function judgeNoSuchTeam(answer) {
  const what = "invite-member as Alice, against a team id that does not exist: answers 404";
  if (answer.error) {
    return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  }
  const body = answer.body ?? "";
  // The wording matters as much as the status here. A 404 from the gateway --
  // a function that is not deployed under that name, say -- would otherwise be
  // counted as the function's own refusal, which is the one mistake this check
  // exists to avoid making.
  const ownWords = body.includes("That team was not found.");
  if (answer.status === 404 && ownWords) {
    return [{ what, verdict: PASS, detail: "HTTP 404, with invite-member's own wording" }];
  }
  if (answer.status === 404) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail:
          `HTTP 404, but not invite-member's own wording -- this may be the gateway` +
          ` rather than the function. Body: ${body}`,
      },
    ];
  }
  const detail = {
    400: "HTTP 400 -- the id was rejected as malformed, so the no-such-team path was never reached",
    401: "HTTP 401 -- Alice's own token was refused, so nothing was tested",
    403: "HTTP 403 -- 'not your team', which means that id DOES exist: pick another",
    201: "HTTP 201 -- an invitation was created for a team that does not exist",
  }[answer.status];
  return [
    {
      what,
      verdict: answer.status === 401 || answer.status === 403 ? UNVERIFIED : FAIL,
      detail: detail ?? `HTTP ${answer.status} -- body: ${body}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// --selftest -- the judgements above, fed answers from a world where the doors
// are open. No network, no account, no staging project.
// ---------------------------------------------------------------------------

function runSelftest() {
  console.log("build-it-16-checks --selftest: can these checks fail?");
  console.log("");
  console.log("Each case below is an answer this script might get back. The");
  console.log("expectation is what the judgement must say about it. Nothing is");
  console.log("sent anywhere and no account is used.");
  console.log("");

  // A made-up uuid and a made-up address, for fabricated answers only. Neither
  // is in any database.
  const madeUpId = "a1b2c3d4-0001-4e5f-8a9b-0c1d2e3f4a5b";

  const cases = [
    // ---- the forged-token checks ----
    {
      name: "a shut door: 401 from the platform",
      run: () => judgeClosedDoor("create-team", { status: 401, body: '{"code":"UNAUTHORIZED_BAD_JWT"}' }),
      expect: [PASS, PASS, PASS],
    },
    {
      name: "AN OPEN DOOR: the forged token was accepted and the body reached the code",
      run: () =>
        judgeClosedDoor("create-team", {
          status: 400,
          body: '{"error":"Please give the team a name.","code":null}',
        }),
      // The status is wrong AND the handler's own words are in the body. The
      // middle check still passes: a 400 saying that carries no data.
      expect: [FAIL, PASS, FAIL],
    },
    {
      name: "AN OPEN DOOR that still says 401 -- the handler's own refusal, not the platform's",
      run: () =>
        judgeClosedDoor("invite-member", {
          status: 401,
          body: '{"error":"You must be signed in to invite somebody.","code":null}',
        }),
      // This is the case the whole of #110 is about: the status alone would
      // have called it a pass.
      expect: [PASS, PASS, FAIL],
    },
    {
      name: "AN OPEN DOOR: 401, but with data in the body",
      run: () =>
        judgeClosedDoor("accept-invite", {
          status: 401,
          body: `{"code":401,"invitation":"${madeUpId}","email":"somebody@example.com"}`,
        }),
      expect: [PASS, FAIL, PASS],
    },
    {
      name: "AN OPEN DOOR: 200, with a row in the body",
      run: () =>
        judgeClosedDoor("create-team", {
          status: 200,
          body: `{"team":{"id":"${madeUpId}","name":"Tuesday crew"}}`,
        }),
      expect: [FAIL, FAIL, PASS],
    },
    {
      name: "an unexpected shape: a 401 whose body has an error string",
      run: () => judgeClosedDoor("create-team", { status: 401, body: '{"error":"no"}' }),
      // Errs towards FAIL, as the comment on that check says.
      expect: [PASS, PASS, FAIL],
    },
    {
      name: "the request never arrived",
      run: () => judgeClosedDoor("create-team", { error: "could not reach the function (fetch failed)" }),
      expect: [UNVERIFIED, UNVERIFIED, UNVERIFIED],
    },

    // ---- the owner check ----
    {
      name: "the owner rule holds: 403 in invite-member's own words",
      run: () =>
        judgeNotTheOwner({
          status: 403,
          body: '{"error":"Only the team\'s owner can invite people.","code":null}',
        }),
      expect: [PASS],
    },
    {
      name: "THE OWNER RULE IS OPEN: 201, an invitation into somebody else's team",
      run: () => judgeNotTheOwner({ status: 201, body: '{"ok":true}' }),
      expect: [FAIL],
    },
    {
      name: "something got past the owner check and hit a later limit: 409",
      run: () => judgeNotTheOwner({ status: 409, body: '{"error":"...waiting, the most allowed."}' }),
      expect: [FAIL],
    },
    {
      name: "nothing was tested: 404, so that team id does not exist",
      run: () => judgeNotTheOwner({ status: 404, body: '{"error":"That team was not found.","code":null}' }),
      expect: [UNVERIFIED],
    },
    {
      name: "a 403 that is not invite-member's -- not its refusal, so not an answer",
      run: () => judgeNotTheOwner({ status: 403, body: "Forbidden" }),
      expect: [UNVERIFIED],
    },

    // ---- nothing created ----
    {
      name: "the refusal left nothing behind: 0 invitations, owner confirmed",
      run: () => judgeNothingCreated({ rows: [] }, true),
      expect: [PASS],
    },
    {
      name: "THE REFUSAL STILL CREATED A ROW: 1 invitation",
      run: () => judgeNothingCreated({ rows: [{ id: madeUpId }] }, true),
      expect: [FAIL],
    },
    {
      name: "0 rows, but Alice does not own that team -- which is why 0 proves nothing",
      run: () => judgeNothingCreated({ rows: [] }, false),
      expect: [UNVERIFIED],
    },

    // ---- no such team ----
    {
      name: "the 404 fires, in invite-member's own words",
      run: () => judgeNoSuchTeam({ status: 404, body: '{"error":"That team was not found.","code":null}' }),
      expect: [PASS],
    },
    {
      name: "a 404 from the gateway, not from the function",
      run: () => judgeNoSuchTeam({ status: 404, body: '{"message":"Function not found"}' }),
      expect: [UNVERIFIED],
    },
    {
      name: "THE 404 HAS BECOME A 403 -- the distinction #111 is about, collapsed",
      run: () =>
        judgeNoSuchTeam({
          status: 403,
          body: '{"error":"Only the team\'s owner can invite people.","code":null}',
        }),
      expect: [UNVERIFIED],
    },
    {
      name: "AN INVITATION FOR A TEAM THAT DOES NOT EXIST: 201",
      run: () => judgeNoSuchTeam({ status: 201, body: '{"ok":true}' }),
      expect: [FAIL],
    },
  ];

  let wrong = 0;
  for (const testCase of cases) {
    const got = testCase.run().map((r) => r.verdict);
    const same =
      got.length === testCase.expect.length &&
      got.every((verdict, i) => verdict === testCase.expect[i]);
    if (!same) wrong += 1;
    console.log(`  ${same ? "ok  " : "WRONG"}  ${testCase.name}`);
    console.log(`          expected ${testCase.expect.join(", ")}; got ${got.join(", ")}`);
    if (!same) {
      for (const r of testCase.run()) {
        console.log(`          ${r.verdict}  ${r.what} -- ${r.detail}`);
      }
    }
  }

  console.log("");
  console.log(`${cases.length} cases, ${wrong} wrong.`);
  if (wrong > 0) {
    console.log("");
    console.log("The judgements in this file do not behave as its comments claim.");
    console.log("Fix them before running anything against staging: a check that");
    console.log("cannot fail is worse than no check, because it reports a pass.");
    return 1;
  }
  console.log("");
  console.log("Every judgement said FAIL to an open door and PASS to a shut one.");
  console.log("That is what makes a green staging run mean something. It is NOT");
  console.log("itself a staging result: nothing was sent anywhere by this run.");
  return 0;
}

if (process.argv.slice(2).includes("--selftest")) {
  process.exit(runSelftest());
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

// A small .env reader, the same one the two scripts beside this use and for the
// same reason: no dotenv package exists here, and adding one for a staging script
// would need a rule 17 conversation for no benefit.
//
// Handles blank lines, # comments, an optional `export ` prefix, and values
// wrapped in single or double quotes. Not multi-line values, which neither of the
// two names below has.
function readEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (cause) {
    die(
      `could not read ${path} (${cause.code ?? "unknown error"}).\n` +
        `That file holds the staging URL and publishable key. It is git-ignored, so it\n` +
        `exists only on your own machine.\n` +
        `\n` +
        `If you only wanted to check this script's own logic, that needs none of it:\n` +
        `  node scripts/staging/build-it-16-checks.mjs --selftest`,
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

const fileEnv = readEnvFile(ENV_FILE);

const supabaseUrl = (fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const publishableKey = (fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();

const missingFromFile = [];
if (supabaseUrl === "") missingFromFile.push("NEXT_PUBLIC_SUPABASE_URL");
if (publishableKey === "") missingFromFile.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
if (missingFromFile.length > 0) {
  die(`${ENV_FILE} is missing: ${missingFromFile.join(", ")}.\nNo value is printed by this script.`);
}

// Two people. Alice owns the team; Bob is the outsider the 403 is about.
// docs/environments.md names them.
const PEOPLE = [
  { label: "Alice", emailVar: "ALICE_EMAIL", passwordVar: "ALICE_PASSWORD" },
  { label: "Bob", emailVar: "BOB_EMAIL", passwordVar: "BOB_PASSWORD" },
];

const aliceTeamId = (process.env.ALICE_TEAM_ID ?? "").trim();

// Optional: a correctly signed token that has EXPIRED. See the bottom of this
// file. Never printed.
const expiredToken = (process.env.EXPIRED_ACCESS_TOKEN ?? "").trim();

// Each missing name is reported BY NAME, never by value.
const missingFromEnv = [];
for (const person of PEOPLE) {
  if ((process.env[person.emailVar] ?? "").trim() === "") missingFromEnv.push(person.emailVar);
  if ((process.env[person.passwordVar] ?? "") === "") missingFromEnv.push(person.passwordVar);
}
if (aliceTeamId === "") missingFromEnv.push("ALICE_TEAM_ID");

if (missingFromEnv.length > 0) {
  die(
    `these environment variables are not set: ${missingFromEnv.join(", ")}.\n` +
      `Load them for this one run from ~/.config/team-tasks/staging.env, which keeps a\n` +
      `FILENAME in shell history rather than a password: see the bottom of this file,\n` +
      `and docs/environments.md -> "Where the test accounts' passwords live".\n` +
      `The team id is not a secret and is passed on the command line.\n` +
      `No value is printed by this script.`,
  );
}

// ALICE_TEAM_ID must look like a uuid, checked BEFORE anybody signs in.
//
// The first real run of bob-invites-to-alices-team.mjs passed a wrong team id and
// got a 500 out of Postgres, which tested nothing and looked like a broken
// function (evidence/invitations.md:88-102). invite-member now answers 400 for
// that -- and a run that cannot test anything should still not get as far as
// sending a password.
if (!UUID_PATTERN.test(aliceTeamId)) {
  die(
    `ALICE_TEAM_ID is not a uuid, so this run could not have tested the owner rule.\n` +
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
const functionsUrl = `${base}/functions/v1`;
const restUrl = `${base}/rest/v1`;

// ---------------------------------------------------------------------------
// The forged token
// ---------------------------------------------------------------------------
//
// A JWT is three base64url parts joined by dots: header, payload, signature.
// This builds the first two honestly and makes the third up out of random bytes,
// so the result is a token of exactly the right SHAPE whose signature cannot
// verify against any key. That is the whole question #110 asks: does the platform
// check the signature, or only the header?
//
// The claims are the ones Supabase Auth puts on a real token -- sub, role, aud,
// email, iss, iat, exp -- with an exp an hour in the future, so an expired token
// cannot be the reason it is refused. The sub is a random uuid belonging to
// nobody and the email is a fabricated example.com address: if a door were open,
// these are the claims a function would act on, and neither names a person.
function forgeToken() {
  const header = { alg: "HS256", typ: "JWT" };
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `${base}/auth/v1`,
    sub: randomUUID(),
    aud: "authenticated",
    role: "authenticated",
    email: `forged-${nowSeconds}@example.com`,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const encode = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const signature = randomBytes(32).toString("base64url");
  return `${encode(header)}.${encode(payload)}.${signature}`;
}

const FORGED_TOKEN = forgeToken();

// Replaces any token this script holds with a placeholder, so no printed body
// can carry one back out. The forged one is worthless and the expired one is
// spent, but a script that prints a token shape at all is one line away from
// printing a live one.
function scrub(text) {
  let out = text ?? "";
  if (FORGED_TOKEN) out = out.split(FORGED_TOKEN).join("FORGED_TOKEN");
  if (expiredToken) out = out.split(expiredToken).join("EXPIRED_TOKEN");
  return out;
}

// A fabricated address, fresh on every run. Fresh matters: Alice's team already
// has pending invitations, and invite-member has a unique index on
// (team_id, email) where accepted_at is null -- so a reused address could make a
// broken owner check surface as a 409 instead of a 201, which reads as
// inconclusive rather than as the finding it would be. The same reasoning as
// bob-invites-to-alices-team.mjs.
const INVITE_ADDRESS = `build-it-16-${Date.now()}@example.com`;

// A well-formed team id that does not exist. Random, so it is not a team's id by
// coincidence; if it somehow were, invite-member answers 403 "not yours" and the
// judgement above reports UNVERIFIED and says to pick another, rather than
// counting that as the 404.
const ABSENT_TEAM_ID = randomUUID();

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

let passes = 0;
let failures = 0;
let unverified = 0;

// Optional checks that were not run at all, counted separately because they do
// not change the exit code. There is exactly one: the expired-token half of
// #110, which needs a token this script cannot make.
let notRun = 0;

function record(results) {
  for (const result of results) {
    if (result.verdict === PASS) passes += 1;
    else if (result.verdict === FAIL) failures += 1;
    else unverified += 1;
    console.log(`  ${result.verdict}  ${result.what} -- ${result.detail}`);
  }
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

// One call to an Edge Function. Returns { status, body } or { error }, never
// throws, so one unreachable function does not abandon the remaining checks.
// The body is read as TEXT, not JSON: a non-JSON answer must be shown as it
// arrived rather than turning into an exception.
async function callFunction(name, accessToken, body) {
  const headers = { apikey: publishableKey, "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response;
  try {
    response = await fetch(`${functionsUrl}/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (cause) {
    return { error: `could not reach ${name} (${cause.message})` };
  }
  return { status: response.status, body: scrub(await response.text()) };
}

// One read through PostgREST. Returns { status, rows } or { error }.
async function readRows(path, accessToken) {
  const headers = { apikey: publishableKey };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response;
  try {
    response = await fetch(`${restUrl}/${path}`, { headers });
  } catch (cause) {
    return { error: `could not reach the database (${cause.message})` };
  }
  const text = scrub(await response.text());
  if (!response.ok) return { error: `HTTP ${response.status} ${text}` };
  if (text.trim() === "") return { status: response.status, rows: [] };
  try {
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) return { error: `expected a JSON array, got ${typeof rows}` };
    return { status: response.status, rows };
  } catch {
    return { error: `HTTP ${response.status} with a body that is not JSON` };
  }
}

// Signs in and returns { accessToken, userId } or { error }. The token is never
// printed, here or anywhere below.
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
    return { error: `sign in returned HTTP ${response.status}: ${scrub(await response.text())}` };
  }
  const session = await response.json();
  const accessToken = session?.access_token ?? "";
  const userId = session?.user?.id ?? "";
  if (accessToken === "") return { error: "sign in returned HTTP 2xx but no access token" };
  if (userId === "") return { error: "sign in returned HTTP 2xx but no user id" };
  return { accessToken, userId };
}

async function signOut(label, accessToken) {
  try {
    const response = await fetch(`${authUrl}/logout?scope=global`, {
      method: "POST",
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
    });
    console.log(`  (${label} signed out: HTTP ${response.status})`);
  } catch (cause) {
    console.log(`  (${label} sign out failed: ${cause.message}; the session expires on its own)`);
  }
}

// Reads a JWT's exp WITHOUT verifying anything, which is all that is wanted:
// whether the token the owner supplied has actually expired yet. A live one
// would get past the platform and be answered by the handler, and the result
// would read as a failure of this check rather than as the wrong input it is.
// Returns { expSeconds } or { error }. Nothing from the token is printed.
function readExpiry(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { error: "that value is not three dot-separated parts, so it is not a JWT" };
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (typeof payload?.exp !== "number") {
      return { error: "that token's payload has no numeric exp, so expiry cannot be told" };
    }
    return { expSeconds: payload.exp };
  } catch {
    return { error: "that token's payload is not readable as JSON, so expiry cannot be told" };
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log("Build it 16 step 2 -- the function doors, staging only");
console.log(`  project reference:  ${STAGING_REF} (staging, confirmed)`);
console.log(`  functions:          ${FUNCTIONS.join(", ")}`);
console.log(`  Alice's team id:    ${aliceTeamId}`);
console.log(`  absent team id:     ${ABSENT_TEAM_ID} (made up for this run)`);
console.log(`  invite address:     ${INVITE_ADDRESS} (fabricated, nobody's)`);
console.log("  signing in as:      Alice and Bob");
console.log("  tokens, passwords and the publishable key: not printed");
console.log("");
console.log("THIS SCRIPT CREATES NOTHING. Every request it sends is one a");
console.log("function must refuse, and the forged calls carry an empty body, so");
console.log("even a function that answered them would have nothing to write.");
console.log("");

const sessions = {};
for (const person of PEOPLE) {
  const session = await signIn(person);
  if (session.error) {
    console.log(`${person.label} (${person.emailVar}, value not printed)`);
    console.log(`  UNVERIFIED  ${person.label} could not sign in -- ${session.error}`);
    console.log("");
  } else {
    sessions[person.label] = session;
  }
}

const alice = sessions.Alice;
const bob = sessions.Bob;

try {
  // -------------------------------------------------------------------------
  // 1. A present but forged token (#110)
  // -------------------------------------------------------------------------

  console.log("1. A token of the right shape with a made-up signature");
  console.log("   (needs no account: the token is not anybody's)");

  for (const name of FUNCTIONS) {
    const answer = await callFunction(name, FORGED_TOKEN, {});
    record(judgeClosedDoor(name, answer));
    if (answer.body !== undefined) {
      console.log(`        body: ${answer.body}`);
    }
  }
  console.log("");

  // -------------------------------------------------------------------------
  // 1b. The other half of #110: expired but correctly signed. OPTIONAL.
  // -------------------------------------------------------------------------

  console.log("1b. A correctly signed token that has expired (optional)");

  if (expiredToken === "") {
    notRun += 1;
    // Labelled NOT RUN rather than UNVERIFIED so the word in the line and the
    // number in the totals agree -- this one is counted separately because it
    // does not change the exit code. The reason is still spelled out, which is
    // what AGENTS.md rule 8 is actually asking for.
    console.log(
      "  NOT RUN  all three functions: an expired token is refused" +
        " -- unverified: EXPIRED_ACCESS_TOKEN is not set, so this was never asked",
    );
    console.log("        This script cannot make a correctly signed token: it has no key, and");
    console.log("        it will not wait an hour for one to lapse. See the bottom of this file");
    console.log("        for how to get one. This line does NOT change the exit code -- the");
    console.log("        three checks issue #112 asks for are what that is about -- so a green");
    console.log("        run still leaves this half of issue #110 unproved.");
  } else {
    const expiry = readExpiry(expiredToken);
    if (expiry.error) {
      unverified += 1;
      console.log(`  UNVERIFIED  all three functions: an expired token is refused -- ${expiry.error}`);
    } else if (expiry.expSeconds > Math.floor(Date.now() / 1000)) {
      unverified += 1;
      const minutes = Math.ceil((expiry.expSeconds - Date.now() / 1000) / 60);
      console.log(
        `  UNVERIFIED  all three functions: an expired token is refused` +
          ` -- EXPIRED_ACCESS_TOKEN has NOT expired yet: about ${minutes} minute(s) left.` +
          ` Wait, then run again.`,
      );
    } else {
      for (const name of FUNCTIONS) {
        const answer = await callFunction(name, expiredToken, {});
        record(judgeClosedDoor(`${name} (expired token)`, answer));
        if (answer.body !== undefined) {
          console.log(`        body: ${answer.body}`);
        }
      }
    }
  }
  console.log("");

  // -------------------------------------------------------------------------
  // 2. Bob, who does not own Alice's team
  // -------------------------------------------------------------------------

  console.log("2. invite-member, called by somebody who does not own the team");

  if (!bob) {
    unverified += 2;
    console.log("  UNVERIFIED  invite-member as Bob, against Alice's team: answers 403 -- Bob is not signed in");
    console.log("  UNVERIFIED  invite-member as Bob: created no invitation -- Bob is not signed in");
  } else {
    const answer = await callFunction("invite-member", bob.accessToken, {
      team_id: aliceTeamId,
      email: INVITE_ADDRESS,
    });
    record(judgeNotTheOwner(answer));
    if (answer.body !== undefined) console.log(`        body: ${answer.body}`);

    // Did the refusal leave anything behind? Asked as ALICE, because the select
    // policy on invitations is "Team owners can read their team's invitations"
    // (20260930193813_create_invitations.sql:113) -- so she is the only one of
    // the two who can see that team's rows at all.
    //
    // And her ownership is CONFIRMED first rather than assumed: if she does not
    // own that team, the policy hides its invitations from her too, and 0 rows
    // would be a pass for entirely the wrong reason.
    let ownerConfirmed = false;
    if (!alice) {
      unverified += 1;
      console.log(
        "  UNVERIFIED  Alice owns ALICE_TEAM_ID -- Alice is not signed in, so the" +
          " invitations read below cannot mean anything",
      );
    } else {
      const team = await readRows(`teams?id=eq.${aliceTeamId}&select=id,owner_id`, alice.accessToken);
      if (team.error) {
        unverified += 1;
        console.log(`  UNVERIFIED  Alice owns ALICE_TEAM_ID -- ${team.error}`);
      } else {
        ownerConfirmed = team.rows.length === 1 && team.rows[0].owner_id === alice.userId;
        record([
          {
            what: "Alice owns ALICE_TEAM_ID",
            verdict: ownerConfirmed ? PASS : UNVERIFIED,
            detail: ownerConfirmed
              ? "1 row, and its owner_id is Alice"
              : `${team.rows.length} row(s) came back and none is a team Alice owns --` +
                ` so the invitations read below would show her nothing either way`,
          },
        ]);
      }
    }

    if (alice) {
      const read = await readRows(
        `invitations?team_id=eq.${aliceTeamId}&email=eq.${encodeURIComponent(INVITE_ADDRESS)}&select=id`,
        alice.accessToken,
      );
      record(judgeNothingCreated(read, ownerConfirmed));
    } else {
      unverified += 1;
      console.log("  UNVERIFIED  invite-member as Bob: created no invitation -- Alice is not signed in");
    }
  }
  console.log("");

  // -------------------------------------------------------------------------
  // 3. A team id that does not exist
  // -------------------------------------------------------------------------

  console.log("3. invite-member, called about a team that does not exist");

  if (!alice) {
    unverified += 1;
    console.log(
      "  UNVERIFIED  invite-member as Alice, against a team id that does not exist:" +
        " answers 404 -- Alice is not signed in",
    );
  } else {
    const answer = await callFunction("invite-member", alice.accessToken, {
      team_id: ABSENT_TEAM_ID,
      email: INVITE_ADDRESS,
    });
    record(judgeNoSuchTeam(answer));
    if (answer.body !== undefined) console.log(`        body: ${answer.body}`);
  }
  console.log("");
} finally {
  for (const [label, session] of Object.entries(sessions)) {
    await signOut(label, session.accessToken);
  }
  console.log("");

  console.log(
    `Totals: ${passes} PASS, ${failures} FAIL, ${unverified} UNVERIFIED,` +
      ` ${notRun} NOT RUN (optional).`,
  );

  if (failures > 0 || unverified > 0) {
    console.log("");
    console.log("NOT GREEN. A FAIL is a door that is not shut. An UNVERIFIED is a");
    console.log("question that could not be asked, which is not a pass either");
    console.log("(AGENTS.md rule 8) -- the usual causes are a sign-in that failed,");
    console.log("a wrong ALICE_TEAM_ID, or a team Alice does not own. Read the");
    console.log("lines above before concluding anything about the functions.");
    process.exitCode = 1;
  } else if (notRun > 0) {
    console.log("");
    console.log("Every check that ran passed. One optional check did NOT run: the");
    console.log("expired-token half of issue #110, marked UNVERIFIED above. This");
    console.log("run does not answer it, and the exit code does not pretend to.");
  } else {
    console.log("");
    console.log("All checks passed.");
  }
}

// HOW TO RUN IT, from the repository root.
//
// THE LOGIC CHECK NEEDS NOTHING AT ALL -- no account, no network, no
// web/.env.local. Run this first, and whenever this file is edited:
//
//   node scripts/staging/build-it-16-checks.mjs --selftest
//
// THE STAGING RUN. KEEP THE PASSWORDS OFF THE COMMAND LINE: both shells on this
// machine save command lines to a file -- Git Bash writes ~/.bash_history with
// HISTCONTROL unset, and PowerShell's PSReadLine saves incrementally. So load the
// password file instead of typing values; what lands in history is a FILENAME.
//
// The owner keeps the test accounts' passwords in
// ~/.config/team-tasks/staging.env, outside this repository. This script needs
// four names from it: ALICE_EMAIL, ALICE_PASSWORD, BOB_EMAIL, BOB_PASSWORD. See
// docs/environments.md -> "Where the test accounts' passwords live".
//
// Git Bash, WSL or macOS:
//
//   set -a
//   . ~/.config/team-tasks/staging.env
//   set +a
//   export ALICE_TEAM_ID='...'
//   node scripts/staging/build-it-16-checks.mjs
//
// PowerShell has no `source`, so it reads the file line by line instead:
//
//   foreach ($line in Get-Content "$HOME\.config\team-tasks\staging.env") {
//     if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
//       Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim().Trim("'").Trim('"')
//     }
//   }
//   $env:ALICE_TEAM_ID = '...'
//   node scripts/staging/build-it-16-checks.mjs
//
// The team id is not a secret, so it does not matter that that line is kept in
// history. Close the shell window afterwards: the passwords live in that one
// process, and nothing writes them to disk.
//
// THE OPTIONAL EXPIRED TOKEN, which is the other half of issue #110. One way to
// get one, with no key and no waiting around for it:
//
//   1. Sign in to the STAGING app in a browser as any test account.
//   2. Leave it alone for longer than the project's access-token lifetime --
//      Supabase's default is one hour, and the real number is in the staging
//      dashboard under Authentication -> Sessions, which is the only place worth
//      believing.
//   3. Copy the access token out of the browser's stored session.
//   4. Put it in the SAME shell as above -- never in a file in this repository,
//      never in a commit, never pasted into a chat (AGENTS.md rule 7):
//
//        export EXPIRED_ACCESS_TOKEN='...'          # Git Bash
//        $env:EXPIRED_ACCESS_TOKEN = '...'          # PowerShell
//
//      then run the script again. It reads the token's `exp` first and says so
//      if it has not actually lapsed yet, rather than reporting a misleading
//      failure. The token is never printed, and anything it appears in is
//      scrubbed before printing.
//
// Keeping it off the command line matters less here than for a password -- an
// expired token opens nothing -- but it is the same habit, and the habit is what
// stops a live one being pasted there by mistake.
//
// This script reads ALICE_EMAIL, ALICE_PASSWORD, BOB_EMAIL, BOB_PASSWORD,
// ALICE_TEAM_ID and the optional EXPIRED_ACCESS_TOKEN from the environment, and
// NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from
// web/.env.local. Nothing else, and it never reads the password file itself.
//
// The assistant has never run this script against staging. It has run
// --selftest; that output is in evidence/build-it-16-function-doors.md.
