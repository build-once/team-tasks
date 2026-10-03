#!/usr/bin/env node
// build-it-16-checks.mjs -- the function doors, run against STAGING only.
// Build it 16 step 2, issue #112, which closes #110 and #111.
//
// WHAT IT IS FOR. Three doors that the project claims are shut and that nothing
// has ever pushed on:
//
//   1. A PRESENT BUT INVALID TOKEN (issue #110). Every one of the three Edge
//      functions declares `auth: "user"` and is deployed with verify_jwt = true
//      (supabase/config.toml:25, :38, :49), which is the project's entire reason
//      for believing a caller's identity. The only refusal ever observed is the
//      one where the Authorization header is MISSING altogether
//      (evidence/create-team.md:184-197, evidence/invitations.md:39-42) -- and
//      that same 401 would be produced by a function deployed with
//      verify_jwt = false whose own code happened to look for the header. A 401
//      for a token that is PRESENT is the observation that tells "the platform
//      verified this token" apart from "something looked at the header".
//
//      Two tokens are sent, because they are refusable for different reasons and
//      only the second one isolates the signature:
//
//      * a FORGED token, built from nothing: an honest header and payload with a
//        signature of random bytes. A platform can refuse this one on its header
//        alone -- see the comment above alterToken -- so a 401 here does not by
//        itself show that a signature was checked;
//      * an ALTERED token: one the platform has just issued, with its header and
//        signature kept exactly and one payload claim changed. Everything cheap
//        to refuse is correct; the only thing wrong is that the signature no
//        longer matches the payload.
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
// IT WRITES NOTHING. It signs two people in, sends eight function calls that are
// every one of them meant to be refused (three forged, three altered, one as the
// wrong person, one about a team that does not exist), reads two tables -- teams,
// to confirm Alice owns the team the owner check is about, and invitations, to
// confirm the refusal left nothing behind -- and signs out. Three more calls go
// out only if the optional expired token is supplied. No row is created by design
// rather than by luck: no request it sends has a body that any function would
// accept.
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
// WHAT IT NEVER PRINTS: a password, Alice's or Bob's access token, a refresh
// token, the publishable key, an email address belonging to a person, a user id,
// or an invitation id. The forged token is not printed either -- not because it
// is a secret, it is worthless, but because a script that prints one token shape
// today prints the wrong one tomorrow. THE ALTERED TOKEN IS THE ONE THAT MATTERS
// MOST HERE: undo the one change and it is Bob's live token, so it is registered
// with scrub() the moment it exists, and no part of it, not even its length,
// reaches any line. Every response body goes through scrub() first, which
// replaces every token this script is holding with a placeholder. What does get
// printed: HTTP statuses, counts, true/false, the real token header's `alg` and
// whether it carries a `kid`, the fabricated example.com address it tries to
// invite, the team id you passed in, and response bodies from the platform and
// from the functions' own fixed wording.
//
// Run it from the repository root. See the bottom of this file.

import { readFileSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The staging project's reference, and the exact host it is served at. This
// script may run against NOTHING ELSE. AGENTS.md rules 1 and 10.
//
// The HOST is what the guard decides on, and that is a fix rather than a detail.
// The guard used to ask whether the URL merely CONTAINED the reference. The
// coach's review of PR #115 pointed a stand-in server at
// `http://127.0.0.1:8799/ghskxrhqlhvrhpnivqbd`, which contains it, and this
// script accepted that URL and sent Alice's and Bob's passwords to it. The
// reference is still kept, because it is what the printed lines name and what the
// three scripts beside this one compare on.
const STAGING_REF = "ghskxrhqlhvrhpnivqbd";
const STAGING_HOST = `${STAGING_REF}.supabase.co`;

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

// Is this URL the staging project, and nothing else?
//
// `supabaseUrl.includes(STAGING_REF)` was the wrong question, and the first thing
// this script does once the guard is satisfied is send two passwords. A URL that
// merely CONTAINS the reference passes that test: in its path, in a query string,
// in a user name, or as the start of a longer domain somebody else owns. So the
// URL is parsed, and four things are required:
//
//   * https, because a password must not travel in clear;
//   * the host EXACTLY equal to STAGING_HOST, which refuses the reference in a
//     path and refuses `ghskxrhqlhvrhpnivqbd.supabase.co.example.com`;
//   * no user name or password in the URL itself -- those would be sent as
//     credentials, and `https://<staging host>@example.com/` reads as the staging
//     host to a person while naming example.com to fetch;
//   * the default https port, because the project is not served on another.
//
// A detail line never contains the URL, for the reason the refusal below gives:
// a project reference identifies an environment. The scheme and the port are
// named, because neither identifies anything.
function judgeStagingUrl(url) {
  const what = `the Supabase URL is the staging project, exactly ${STAGING_HOST}`;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return [{ what, verdict: FAIL, detail: "that value does not parse as a URL at all" }];
  }
  if (parsed.protocol !== "https:") {
    return [{ what, verdict: FAIL, detail: `its scheme is "${parsed.protocol}", not "https:"` }];
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return [
      {
        what,
        verdict: FAIL,
        detail: "it carries a user name or a password in the URL itself, so its host is not what it reads as",
      },
    ];
  }
  if (parsed.hostname !== STAGING_HOST) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `its host is not ${STAGING_HOST} -- the host it does name is not printed,` +
          ` because a project reference identifies an environment`,
      },
    ];
  }
  if (parsed.port !== "") {
    return [
      {
        what,
        verdict: FAIL,
        detail: `it names port ${parsed.port}; the staging project is served on the default https port`,
      },
    ];
  }
  return [{ what, verdict: PASS, detail: `https://${STAGING_HOST}` }];
}

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
// The altered token -- a real token with one claim changed
// ---------------------------------------------------------------------------
//
// WHY A SECOND INVALID TOKEN. forgeToken() further down builds a token out of
// nothing: an `HS256` header with no `kid`, and a signature of random bytes. The
// coach's review of PR #115 made the point that a platform can refuse such a
// token for its HEADER alone, before it looks at any signature -- so a 401 for it
// does not show that a signature was checked.
//
// Unverified -- that claim is about `verifyUserJwt` in `@supabase/server`, and
// that package is not installed here. `web/node_modules/@supabase` holds
// auth-js, functions-js, postgrest-js, realtime-js, ssr, storage-js, supabase-js
// and phoenix, and a search of the whole repository for `verifyUserJwt` finds
// nothing. So it is the reviewer's reading of a package this project does not
// have, not something confirmed in this session.
//
// The altered token closes that gap from the other side, and does not depend on
// the claim being right. Take a token the platform has just issued, keep its
// header and its signature exactly, and change one claim in the payload.
// Everything that is cheap to refuse -- shape, algorithm, key id, expiry, issuer
// -- is unchanged and correct. The one thing wrong with it is that the signature
// no longer matches the payload it is a signature of.
//
// IT IS BOB'S LIVE TOKEN WITH ONE FIELD MOVED, and that is the whole risk of this
// check: undo the change and you have a working credential. So it is registered
// with scrub() the moment it exists, and nothing derived from it -- no part, no
// prefix, no length -- appears in any line this script prints.
//
// `sub` is the claim changed, and it is replaced with a random uuid belonging to
// nobody: if a door were open, that is the identity a function would act as, and
// it is not a person's.

// Builds the altered copy. Returns { token } or { error }.
function alterToken(realToken) {
  const parts = realToken.split(".");
  if (parts.length !== 3) {
    return { error: "the token just issued is not three dot-separated parts, so it is not a JWT" };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return { error: "the token just issued has a payload that is not readable as JSON" };
  }
  if (typeof payload?.sub !== "string" || payload.sub === "") {
    return { error: "the token just issued has no sub claim, so there is nothing to change" };
  }
  const encoded = Buffer.from(
    JSON.stringify({ ...payload, sub: randomUUID() }),
    "utf8",
  ).toString("base64url");
  return { token: `${parts[0]}.${encoded}.${parts[2]}` };
}

// The facts judgeAlteration needs, worked out from the two token strings.
// Returns them or { error }.
//
// NEITHER TOKEN, and no part of either, is in what it returns. `alg` and whether
// a `kid` is present are properties of the header rather than secrets, and they
// are here because they are what says which question a 401 below answers.
function describeAlteration(realToken, alteredToken) {
  const real = realToken.split(".");
  const altered = alteredToken.split(".");
  if (real.length !== 3 || altered.length !== 3) {
    return { error: "one of the two values is not three dot-separated parts, so it is not a JWT" };
  }
  let header;
  let realPayload;
  let alteredPayload;
  try {
    header = JSON.parse(Buffer.from(real[0], "base64url").toString("utf8"));
    realPayload = JSON.parse(Buffer.from(real[1], "base64url").toString("utf8"));
    alteredPayload = JSON.parse(Buffer.from(altered[1], "base64url").toString("utf8"));
  } catch {
    return { error: "a header or a payload is not readable as JSON, so the change cannot be confirmed" };
  }
  if (typeof realPayload?.sub !== "string" || realPayload.sub === "") {
    return { error: "the real token has no sub claim, so there was nothing to change" };
  }
  return {
    differsFromReal: alteredToken !== realToken,
    headerUnchanged: altered[0] === real[0],
    signatureUnchanged: altered[2] === real[2],
    payloadChanged: altered[1] !== real[1],
    subChanged:
      typeof alteredPayload?.sub === "string" &&
      alteredPayload.sub !== "" &&
      alteredPayload.sub !== realPayload.sub,
    alg: typeof header?.alg === "string" ? header.alg : "(none)",
    hasKid: typeof header?.kid === "string" && header.kid !== "",
  };
}

// Is the token about to be sent an altered COPY, and not the real one?
//
// Judged BEFORE anything is sent, and a verdict other than PASS stops the three
// calls. Two reasons, and both of them are why this judgement exists at all
// rather than the alteration being trusted to have worked:
//
//   * sending the real token would ask a completely different question. The
//     platform would accept it, the handler would answer the `{}` body with its
//     own 400, and judgeClosedDoor would report that as a door standing open --
//     a FAIL that looks like a finding and is an input mistake;
//   * a live credential would be going out over the wire for no purpose.
function judgeAlteration(facts) {
  const what = "the altered token is a changed copy: the real header and signature, a different sub";
  if (facts.error) {
    return [{ what, verdict: UNVERIFIED, detail: facts.error }];
  }
  const wrong = [];
  if (!facts.differsFromReal) wrong.push("it is character-for-character the real token");
  if (!facts.headerUnchanged) wrong.push("its header is not the real token's");
  if (!facts.signatureUnchanged) wrong.push("its signature is not the real token's");
  if (!facts.payloadChanged) wrong.push("its payload is unchanged");
  if (!facts.subChanged) wrong.push("its sub claim is unchanged");
  if (wrong.length > 0) {
    return [
      {
        what,
        verdict: FAIL,
        detail: `${wrong.join("; ")} -- so nothing is sent, which is what this judgement is for`,
      },
    ];
  }
  return [
    {
      what,
      verdict: PASS,
      detail:
        `header and signature kept, sub replaced with a uuid belonging to nobody.` +
        ` The real header's alg is ${facts.alg} and it ${facts.hasKid ? "carries a kid" : "carries NO kid"}` +
        ` -- read that before reading a 401 below as proof that a signature was checked`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Keeping tokens out of printed lines
// ---------------------------------------------------------------------------
//
// This sits up here with the judgements, above --selftest, for one reason: it is
// what stops the altered token reaching the screen, and the only acceptable place
// to find out that it does not work is a run that sends nothing. The cases at the
// end of runSelftest() exercise it.

// Every token this script is holding, each with the placeholder to print in its
// place. A list rather than named constants because three of the tokens do not
// exist when this line runs: Alice's and Bob's real ones arrive at sign-in, and
// the altered one is built from Bob's. Each is registered the moment it comes
// into existence, before anything it could appear in is printed.
const TOKEN_PLACEHOLDERS = [];

// An empty value would turn scrub() into a function that rewrites the gap
// between every pair of characters, so it is refused rather than registered.
function rememberToken(token, placeholder) {
  if (typeof token === "string" && token !== "") {
    TOKEN_PLACEHOLDERS.push([token, placeholder]);
  }
}

// The substitution itself, kept pure and separate from the registry so the
// selftest can hand it a list of fabricated tokens.
function scrubWith(text, placeholders) {
  let out = text ?? "";
  for (const [token, placeholder] of placeholders) {
    if (token === "") continue;
    out = out.split(token).join(placeholder);
  }
  return out;
}

// Replaces every token this script holds with its placeholder, so no printed
// body can carry one back out. The forged one is worthless and the expired one is
// spent -- but the altered one is a live credential with one field moved, and the
// two real ones are live outright. A script that prints a token shape at all is
// one line away from printing the wrong one.
function scrub(text) {
  return scrubWith(text, TOKEN_PLACEHOLDERS);
}

// Did `token` actually get taken out of `text`?
//
// A judgement rather than a bare assertion, so it joins the cases below. It says
// UNVERIFIED when the token is not in the text to start with: a clean result
// then proves nothing, and that is the shape a scrub check usually fails in
// (AGENTS.md rule 8). Neither the text nor the token is in anything it returns.
function judgeScrubbed(label, text, token, placeholders) {
  const what = `scrub: ${label}`;
  if (!text.includes(token)) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail: "that token is not in the text to begin with, so a clean result proves nothing",
      },
    ];
  }
  const survived = scrubWith(text, placeholders).includes(token);
  return [
    {
      what,
      verdict: survived ? FAIL : PASS,
      detail: survived
        ? `the token is STILL in the result, with ${placeholders.length} placeholder(s) registered`
        : `gone from the result, with ${placeholders.length} placeholder(s) registered`,
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
  console.log("Each case below is something this script might be handed: a URL");
  console.log("from web/.env.local, a token it built, or an answer that came");
  console.log("back. The expectation is what the judgement must say about it.");
  console.log("Nothing is sent anywhere and no account is used.");
  console.log("");

  // A made-up uuid and a made-up address, for fabricated answers only. Neither
  // is in any database.
  const madeUpId = "a1b2c3d4-0001-4e5f-8a9b-0c1d2e3f4a5b";

  // A JWT-SHAPED STRING THAT IS NOT A TOKEN, for the altered-token cases. Its
  // signature is the literal word below and nothing signed anything, so it opens
  // nothing anywhere. It exists so the alteration code can be exercised with no
  // account and no network -- the real version of it is Bob's live token.
  const standInHeader = { alg: "HS256", typ: "JWT", kid: "made-up-key-id" };
  const standInClaims = { sub: madeUpId, role: "authenticated", aud: "authenticated", exp: 4000000000 };
  const fabricateJwt = (claims, header = standInHeader, signature = "not-a-signature") =>
    [
      Buffer.from(JSON.stringify(header), "utf8").toString("base64url"),
      Buffer.from(JSON.stringify(claims), "utf8").toString("base64url"),
      signature,
    ].join(".");
  const standInReal = fabricateJwt(standInClaims);
  // The altered copy of it, built by the same alterToken() the staging run uses.
  const standInAltered = alterToken(standInReal).token;

  const cases = [
    // ---- the staging guard: which URLs are the staging project ----
    {
      name: "the staging URL itself",
      run: () => judgeStagingUrl(`https://${STAGING_HOST}`),
      expect: [PASS],
    },
    {
      name: "NOT STAGING, and it contains the staging reference -- the coach's stand-in server",
      run: () => judgeStagingUrl(`http://127.0.0.1:8799/${STAGING_REF}`),
      expect: [FAIL],
    },
    {
      name: "NOT STAGING: the reference in a path on somebody else's https host",
      run: () => judgeStagingUrl(`https://example.com/${STAGING_REF}`),
      expect: [FAIL],
    },
    {
      name: "NOT STAGING: the reference in a query string",
      run: () => judgeStagingUrl(`https://example.com/?project=${STAGING_REF}`),
      expect: [FAIL],
    },
    {
      name: "NOT STAGING: the staging host as the start of a longer domain",
      run: () => judgeStagingUrl(`https://${STAGING_HOST}.example.com`),
      expect: [FAIL],
    },
    {
      name: "NOT STAGING: the staging host as a URL user name, so the host is example.com",
      run: () => judgeStagingUrl(`https://${STAGING_HOST}@example.com/`),
      expect: [FAIL],
    },
    {
      name: "NOT STAGING: the right host, but over plain http",
      run: () => judgeStagingUrl(`http://${STAGING_HOST}`),
      expect: [FAIL],
    },
    {
      name: "NOT STAGING: the right host, on another port",
      run: () => judgeStagingUrl(`https://${STAGING_HOST}:8799`),
      expect: [FAIL],
    },
    {
      name: "not a URL at all: the bare reference",
      run: () => judgeStagingUrl(STAGING_REF),
      expect: [FAIL],
    },

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

    // ---- the altered token: is the thing about to be sent a changed copy? ----
    //
    // These run the real alterToken() and describeAlteration() over a fabricated
    // stand-in, so the code that will handle Bob's live token is the code being
    // exercised here. No token text is printed by any of them.
    {
      name: "the alteration worked: the real header and signature, a different sub",
      run: () => judgeAlteration(describeAlteration(standInReal, alterToken(standInReal).token)),
      expect: [PASS],
    },
    {
      name: "THE ALTERATION DID NOTHING: the token about to be sent is the real one",
      run: () => judgeAlteration(describeAlteration(standInReal, standInReal)),
      expect: [FAIL],
    },
    {
      name: "THE WRONG PART CHANGED: the signature, not the payload -- that is the forged case over again",
      run: () =>
        judgeAlteration(
          describeAlteration(standInReal, fabricateJwt(standInClaims, standInHeader, "a-different-signature")),
        ),
      expect: [FAIL],
    },
    {
      name: "THE WRONG PART CHANGED: a fresh header, so the header is no longer the platform's",
      run: () =>
        judgeAlteration(
          describeAlteration(
            standInReal,
            fabricateJwt({ ...standInClaims, sub: randomUUID() }, { alg: "HS256", typ: "JWT" }),
          ),
        ),
      expect: [FAIL],
    },
    {
      name: "nothing to change: the real token has no sub claim",
      run: () => judgeAlteration(describeAlteration(fabricateJwt({ role: "authenticated" }), standInReal)),
      expect: [UNVERIFIED],
    },
    {
      name: "AN ALTERED TOKEN WAS ACCEPTED: the handler answered, so the signature was not checked",
      run: () =>
        judgeClosedDoor("invite-member (altered token)", {
          status: 400,
          body: '{"error":"Which team is this invitation for?","code":null}',
        }),
      expect: [FAIL, PASS, FAIL],
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

    // ---- the scrub: the altered token must never reach a printed line ----
    //
    // The altered token is Bob's live one with a single claim moved, so a body
    // that echoed it back and got printed would publish a credential. These feed
    // the real scrubWith() fabricated tokens and a fabricated body.
    {
      name: "the altered token in a response body is replaced",
      run: () =>
        judgeScrubbed(
          "the altered token in a response body is replaced",
          `{"msg":"bad jwt","got":"${standInAltered}"}`,
          standInAltered,
          [
            [standInReal, "BOB_ACCESS_TOKEN"],
            [standInAltered, "BOB_ALTERED_TOKEN"],
          ],
        ),
      expect: [PASS],
    },
    {
      name: "THE ALTERED TOKEN WAS NEVER REGISTERED: it comes straight back out",
      run: () =>
        judgeScrubbed(
          "the altered token, with only the real one registered",
          `{"msg":"bad jwt","got":"${standInAltered}"}`,
          standInAltered,
          [[standInReal, "BOB_ACCESS_TOKEN"]],
        ),
      // The failure mode this guards against: the altered token differs from the
      // real one, so registering the real one does not cover it.
      expect: [FAIL],
    },
    {
      name: "NOTHING REGISTERED AT ALL: every token survives",
      run: () =>
        judgeScrubbed(
          "the altered token, with an empty registry",
          `{"msg":"bad jwt","got":"${standInAltered}"}`,
          standInAltered,
          [],
        ),
      expect: [FAIL],
    },
    {
      name: "a real access token in a response body is replaced",
      run: () =>
        judgeScrubbed(
          "a real access token in a response body is replaced",
          `{"msg":"ok","token":"${standInReal}"}`,
          standInReal,
          [
            [standInReal, "BOB_ACCESS_TOKEN"],
            [standInAltered, "BOB_ALTERED_TOKEN"],
          ],
        ),
      expect: [PASS],
    },
    {
      name: "a scrub case that proves nothing: the token is not in the text at all",
      run: () =>
        judgeScrubbed("a body with no token in it", '{"msg":"bad jwt"}', standInAltered, [
          [standInAltered, "BOB_ALTERED_TOKEN"],
        ]),
      expect: [UNVERIFIED],
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
  console.log("Every judgement said FAIL to an open door and PASS to a shut one,");
  console.log("refused every URL that is not the staging host, refused to send a");
  console.log("token that had not actually been altered, and took a registered");
  console.log("token out of a body it was printing. That is what makes a green");
  console.log("staging run mean something. It is NOT itself a staging result:");
  console.log("nothing was sent anywhere by this run.");
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

// ---------------------------------------------------------------------------
// The staging guard
// ---------------------------------------------------------------------------
//
// FIRST, before a password is read out of the environment and long before a
// request is made. judgeStagingUrl says what it requires and why `includes` was
// not enough; the short version is that the old guard accepted a stand-in server
// at `http://127.0.0.1:8799/ghskxrhqlhvrhpnivqbd` and then signed Alice and Bob
// in against it.
const urlVerdict = judgeStagingUrl(supabaseUrl)[0];
if (urlVerdict.verdict !== PASS) {
  die(
    `the Supabase URL in web/.env.local is not the staging project: ${urlVerdict.detail}.\n` +
      `This script runs against https://${STAGING_HOST} and nothing else, and it has\n` +
      `read no password and sent no request.\n` +
      `The URL it found is not printed, because a project reference identifies an\n` +
      `environment. Check web/.env.local yourself.`,
  );
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
// The four endpoints, built from the URL the guard above has already accepted
// ---------------------------------------------------------------------------

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

rememberToken(FORGED_TOKEN, "FORGED_TOKEN");
rememberToken(expiredToken, "EXPIRED_TOKEN");

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
  // Registered with scrub() here, the moment it exists and before any body that
  // could contain it is printed. This one is live.
  rememberToken(accessToken, `${person.label.toUpperCase()}_ACCESS_TOKEN`);
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
console.log(`  staging host:       ${STAGING_HOST} (confirmed by parsing the URL, not by a substring)`);
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
  console.log("   (needs no account: the token is not anybody's. A platform may");
  console.log("   refuse this one on its header alone, which is what 1c is for)");

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
  // 1c. A real token with one claim changed -- the harder half of #110
  // -------------------------------------------------------------------------
  //
  // It sits after 1b rather than beside 1 so the section numbers in
  // evidence/build-it-16-function-doors.md keep meaning what they did. See the
  // comment above alterToken for what this asks that check 1 cannot.

  console.log("1c. A token the platform issued moments ago, with its sub claim");
  console.log("    changed and its header and signature left exactly as they were");

  if (!bob) {
    unverified += 1;
    console.log(
      "  UNVERIFIED  all three functions: an altered token is refused" +
        " -- Bob is not signed in, so there is no issued token to alter",
    );
  } else {
    const built = alterToken(bob.accessToken);
    if (built.error) {
      unverified += 1;
      console.log(`  UNVERIFIED  all three functions: an altered token is refused -- ${built.error}`);
    } else {
      rememberToken(built.token, "BOB_ALTERED_TOKEN");
      const alteration = judgeAlteration(describeAlteration(bob.accessToken, built.token));
      record(alteration);
      if (alteration[0].verdict === PASS) {
        for (const name of FUNCTIONS) {
          const answer = await callFunction(name, built.token, {});
          record(judgeClosedDoor(`${name} (altered token)`, answer));
          if (answer.body !== undefined) {
            console.log(`        body: ${answer.body}`);
          }
        }
      } else {
        unverified += 1;
        console.log(
          "  UNVERIFIED  all three functions: an altered token is refused -- NOTHING WAS" +
            " SENT, because the line above says the token is not a changed copy, and an" +
            " unchanged one would have been Bob's live token",
        );
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
// THE ALTERED TOKEN NEEDS NO EXTRA SETTING. Check 1c builds it out of the token
// Bob's sign-in returns, so a plain staging run does it. What it does need is a
// look at its own first line afterwards: that line says whether the real
// header carried a `kid`, and that is what decides whether the 401s under it are
// evidence about a signature or only about a header. See the comment above
// alterToken.
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
