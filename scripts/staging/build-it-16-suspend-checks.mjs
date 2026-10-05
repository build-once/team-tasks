#!/usr/bin/env node
// build-it-16-suspend-checks.mjs -- do the three Edge Functions refuse a
// suspended person? Run against STAGING only.
//
// Build it 16 step 5, part B, issue #133, and the coach's comment on it.
//
// WHAT IT IS FOR. Part A (#128, PR #132) made the database refuse a suspended
// person, and left a hole it could not reach: all three functions write with
// `ctx.supabaseAdmin`, which connects as `service_role`, and service_role
// bypasses row-level security. Observed on staging on 4 October 2026 -- the owner
// suspended Bob, pressed Create team as him, and the team was written at
// 12:56:57 UTC (evidence/build-it-16-suspend-accounts.md section 8). Part B adds
// a check in TypeScript to each function. This script is what says whether that
// check is really there, in the deployed functions, rather than only in the
// repository.
//
// TWO MODES, BECAUSE ONLY THE OWNER CAN ADD OR REMOVE THE ROW. Nothing in this
// repository may write `public.account_status`: the privilege is deliberately not
// granted (the migration revokes everything and grants back `select` only), and
// docs/plan.md says the owner adds and removes the row by hand in the dashboard.
// So the script cannot set up its own state, and instead has to be TOLD which
// state it is looking at:
//
//   --expect-suspended   the owner has just added Bob's row
//   --expect-active      the owner has just removed it
//
// One of the two is required. There is no default, on purpose: a run in the wrong
// mode would report failures that mean nothing, and the second-worst outcome
// after a missed hole is a scary red run that was only ever asking the wrong
// question.
//
// THE MOST IMPORTANT CHECK IN HERE IS NOT ABOUT BOB. It is that ALICE, who is
// not suspended, still gets her ordinary answers from all three functions in
// BOTH modes. The migration's own comment warns why: a part B that called
// `public.is_active()` would get `false` for every caller, because an admin
// connection has no `auth.uid()`, and all three functions would then refuse
// EVERYBODY -- with no error and nothing in a log. A run where Bob gets 403 and
// Alice gets her usual 400 tells those two worlds apart. A run where both get 403
// is the quiet catastrophe.
//
// IT CREATES NOTHING, AND THAT IS STRUCTURAL RATHER THAN CAREFUL. Every request
// it sends is one each function refuses on its own merits, whatever the account's
// state:
//
//   create-team     body {}                 -- no name. create-team answers 400
//                                              "Please give the team a name."
//   invite-member   body {}                 -- no team id and no address.
//                                              invite-member answers 400 "Which
//                                              team is this invitation for?"
//   accept-invite   body { token: <random> } -- a well-formed token that is not
//                                              in the table. accept-invite
//                                              answers 404 "This invitation link
//                                              is not valid."
//
// So in `--expect-active` there is no team to create, no address to invite and no
// invitation to claim -- nothing can be written and no mail can be sent even if
// every check in part B were missing. And in `--expect-suspended` the SHAPE of
// the refusal is the evidence: a 403 for a body that would otherwise be refused
// with 400 can only mean the suspension check ran BEFORE the body was parsed,
// which is before `decideDelivery`, before any insert, and -- in accept-invite --
// before the one-shot atomic claim.
//
// WHAT THIS SCRIPT CANNOT ASK, so that nobody reads a green run as more than it
// is (rule 8):
//
//   * "and no row appeared in `teams`" and "and no invitation was written". A
//     suspended person's own reads return nothing because the five restrictive
//     rules work, so Bob counting 0 proves nothing about what exists; and nobody
//     else can read his team's invitations, because the select policy on
//     invitations is the TEAM OWNER's. Those two belong to the owner, in the
//     dashboard or through the read-only connector -- the script prints what to
//     look at. What it offers instead is the stronger structural answer above:
//     the request carries nothing that could be written.
//   * anything about the `reason` column. It is never read, here or anywhere.
//
// IT NEVER TOUCHES account_status. Not a read, not a write. Every request this
// script makes is recorded in a log, and `judgeTouchedNothing` checks that log at
// the end: three function names, one table read (`teams`), two sign-ins, two
// sign-outs, and nothing else. That is a measured claim rather than a promise.
//
// IT CAN FAIL, which is the only reason to trust it passing. Every judgement is a
// pure function, and `--selftest` feeds those functions fabricated answers -- a
// function that acted for a suspended person, a 403 for everybody, a 403 whose
// body carries the suspension reason, a request that read account_status -- and
// checks each one comes out FAIL. That run needs no network, no account and no
// staging project:
//
//   node scripts/staging/build-it-16-suspend-checks.mjs --selftest
//
// NOTHING RUNS THAT SELFTEST AUTOMATICALLY, which is issue #114's point about
// build-it-16-checks.mjs and is now true of this file too -- filed as #136,
// together with the Deno test beside the three functions.
//
// NO PACKAGES. Node built-ins only -- global fetch, node:crypto, node:buffer --
// so Node 18 or newer. The four endpoints are the ones the three scripts beside
// this one use, read from the installed clients in web/node_modules rather than
// recalled:
//
//   POST   {url}/auth/v1/token?grant_type=password   body {email,password}
//   POST   {url}/auth/v1/logout?scope=global
//   POST   {url}/functions/v1/{name}
//   GET    {url}/rest/v1/{relation}?select=a,b&col=eq.value
//   the API key travels in the `apikey` header; Authorization carries the
//          caller's JWT.
//
// WHAT IT NEVER PRINTS: a password, an access or refresh token, the publishable
// key, an email address belonging to a person, or a user id. Every response body
// goes through scrub() first, which replaces every token this script holds with a
// placeholder. What does get printed: HTTP statuses, counts, the fixed codes and
// wording the functions produce, and the team id you passed in.
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
// The HOST is what the guard decides on, and that is a fix rather than a detail:
// `url.includes(STAGING_REF)` accepted a stand-in server at
// `http://127.0.0.1:8799/ghskxrhqlhvrhpnivqbd` in the coach's review of PR #115,
// and the script then sent two passwords to it. judgeStagingUrl below is
// build-it-16-checks.mjs's, unchanged.
const STAGING_REF = "ghskxrhqlhvrhpnivqbd";
const STAGING_HOST = `${STAGING_REF}.supabase.co`;

// The shape Postgres accepts for a uuid column: 8-4-4-4-12 hex digits.
const UUID_CHARS =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const UUID_PATTERN = new RegExp(`^${UUID_CHARS}$`);

// The three functions, by the names in supabase/config.toml.
const FUNCTIONS = ["create-team", "invite-member", "accept-invite"];

// The fixed code all three functions use for this one refusal, copied from the
// three index.ts files rather than remembered: `const SUSPENDED_CODE =
// "account_suspended"`. accept-invite sends it as `reason` as well as `code`,
// because web/src/app/invite/[token]/actions.ts reads a reason from a known list
// and would otherwise fall back to the status, where 403 means "wrong_person".
const SUSPENDED_CODE = "account_suspended";

// The one sentence a suspended person is shown, again copied from the three
// files: `const SUSPENDED_MESSAGE = "You can't do that at the moment."`.
//
// Checked exactly, not loosely, and that is the disclosure check in this script:
// docs/plan.md marks the suspension reason sensitive and says nobody reads it
// through the app, so the body must carry this sentence and the code and nothing
// else -- no reason text, no timestamp, no table name.
const SUSPENDED_MESSAGE = "You can't do that at the moment.";

// What each function answers for the bodies above when the caller is NOT
// suspended. These are the pre-part-B answers, copied from the three files:
//   create-team:85    "Please give the team a name."
//   invite-member:250 "Which team is this invitation for?"
//   accept-invite:158 "This invitation link is not valid. ..."
const ACTIVE_ANSWERS = {
  "create-team": { status: 400, words: "Please give the team a name." },
  "invite-member": { status: 400, words: "Which team is this invitation for?" },
  "accept-invite": { status: 404, words: "This invitation link is not valid." },
};

// A refusal body is short. 400 characters is generous -- the longest platform
// refusal seen in this project is `{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}`.
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
// Every one takes what came back and returns a list of
// { what, verdict, detail } with verdict "PASS", "FAIL" or "UNVERIFIED". None of
// them sends a request, reads a file or looks at the environment.
//
// "UNVERIFIED" is for an answer that does not settle the question -- a request
// that never arrived, a sign-in that failed, a 500 that refused for a different
// reason. AGENTS.md rule 8: that is not a pass.

const PASS = "PASS";
const FAIL = "FAIL";
const UNVERIFIED = "UNVERIFIED";

// Is this URL the staging project, and nothing else? Four requirements: https,
// the host EXACTLY equal to STAGING_HOST, no user name or password in the URL
// itself, and the default port. A detail line never contains the URL, because a
// project reference identifies an environment.
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
        detail:
          "it carries a user name or a password in the URL itself, so its host is not what it reads as",
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

// A suspended person's call. Three judgements on one answer, because they fail
// independently and one verdict would hide which did.
//
// `label` names the call. `answer` is { status, body } or { error }.
function judgeSuspendedRefusal(label, answer) {
  const statusCheck = `${label}: answers 403`;
  const codeCheck = `${label}: the body carries the code ${SUSPENDED_CODE}`;
  const quietCheck = `${label}: the body says nothing about the suspension beyond that code`;

  if (answer.error) {
    return [statusCheck, codeCheck, quietCheck].map((what) => ({
      what,
      verdict: UNVERIFIED,
      detail: answer.error,
    }));
  }

  const body = answer.body ?? "";
  const results = [];

  // ---- the status ----
  //
  // A 403 is the answer. Everything else is sorted into "this is a finding" and
  // "this asked nothing", because the difference decides whether the owner is
  // looking at a hole or at a setup problem.
  const statusDetail = {
    200: "HTTP 200 -- THE FUNCTION ACTED FOR A SUSPENDED PERSON",
    201: "HTTP 201 -- THE FUNCTION CREATED SOMETHING FOR A SUSPENDED PERSON",
    400: "HTTP 400 -- the request body was parsed and refused, so the suspension check did NOT run before it. That is the part-A behaviour: part B is not deployed here, or the check is in the wrong place",
    404: "HTTP 404 -- the invitation was looked up, so the suspension check did NOT run before the lookup. Part B is not deployed here, or the check is in the wrong place",
    409: "HTTP 409 -- a later limit answered, so something got past the suspension check",
    401: "HTTP 401 -- the caller's own token was refused, so nothing about suspension was tested",
    500: `HTTP 500 -- a refusal, but not this one. If the body names a Postgres code this is probably part B's fail-closed branch: the account_status read failed, the function refused (which is the right direction) and the suspension itself was not proved`,
    503: "HTTP 503 -- the function could not send email, so it never reached a verdict",
  }[answer.status];

  results.push({
    what: statusCheck,
    verdict:
      answer.status === 403
        ? PASS
        : answer.status === 401 || answer.status === 500 || answer.status === 503
          ? UNVERIFIED
          : FAIL,
    detail: statusDetail ?? `HTTP ${answer.status} -- body: ${body}`,
  });

  // ---- the code ----
  //
  // Read out of the JSON rather than searched for in the text, so a code
  // appearing in some other field cannot pass this.
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }
  const code = parsed && typeof parsed === "object" ? parsed.code : undefined;
  const reason = parsed && typeof parsed === "object" ? parsed.reason : undefined;

  const codeIsRight = code === SUSPENDED_CODE;
  // accept-invite must ALSO send it as `reason`, or the page falls back to the
  // status and tells the person the invitation was sent to another address.
  const needsReason = label.startsWith("accept-invite");
  const reasonIsRight = !needsReason || reason === SUSPENDED_CODE;

  results.push({
    what: codeCheck,
    verdict: codeIsRight && reasonIsRight ? PASS : FAIL,
    detail:
      codeIsRight && reasonIsRight
        ? needsReason
          ? `code and reason are both "${SUSPENDED_CODE}"`
          : `code is "${SUSPENDED_CODE}"`
        : `code is ${JSON.stringify(code)}` +
          (needsReason ? `, reason is ${JSON.stringify(reason)}` : "") +
          `, expected "${SUSPENDED_CODE}"` +
          (needsReason ? " in both" : "") +
          ` -- body: ${body}`,
  });

  // ---- what else the body says ----
  //
  // The disclosure check. Three things are required: the message is the fixed
  // neutral sentence, there is no field beyond error/code/reason, and nothing
  // in the body looks like a timestamp or a sentence of free text.
  const leaks = [];
  if (!parsed || typeof parsed !== "object") {
    leaks.push("the body is not a JSON object, so what it says cannot be checked field by field");
  } else {
    if (parsed.error !== SUSPENDED_MESSAGE) {
      leaks.push(
        `the message is ${JSON.stringify(parsed.error)}, not the fixed sentence` +
          ` ${JSON.stringify(SUSPENDED_MESSAGE)}`,
      );
    }
    const allowed = ["error", "code", "reason"];
    const extra = Object.keys(parsed).filter((key) => !allowed.includes(key));
    if (extra.length > 0) leaks.push(`it carries extra fields: ${extra.join(", ")}`);
  }
  // A timestamp would be `suspended_at` leaking. Looked for in the raw text, so
  // it is caught wherever it hides.
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(body)) {
    leaks.push("it contains something shaped like a timestamp");
  }
  if (body.includes("@")) leaks.push("it contains an @, so possibly an address");
  if (new RegExp(UUID_CHARS).test(body)) leaks.push("it contains a uuid, so possibly an id");
  if (body.length > MAX_REFUSAL_BODY) {
    leaks.push(`it is ${body.length} characters, over the ${MAX_REFUSAL_BODY} expected of a refusal`);
  }

  results.push({
    what: quietCheck,
    verdict: leaks.length === 0 ? PASS : FAIL,
    detail:
      leaks.length === 0
        ? `${body.length} characters: the fixed sentence, the code${needsReason ? ", the reason" : ""}, and nothing else`
        : leaks.join("; "),
  });

  return results;
}

// An ACTIVE person's call -- Bob in `--expect-active`, and Alice in both modes.
//
// This is the check that catches the is_active() trap and a check placed where
// it refuses everybody. `name` is one of FUNCTIONS.
function judgeActiveAnswer(label, name, answer) {
  const what = `${label}: gets its ordinary answer, unchanged by part B`;
  const expected = ACTIVE_ANSWERS[name];

  if (answer.error) {
    return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  }
  const body = answer.body ?? "";

  if (answer.status === expected.status && body.includes(expected.words)) {
    return [
      {
        what,
        verdict: PASS,
        detail: `HTTP ${expected.status}, with ${name}'s own wording -- the same answer it gave before part B`,
      },
    ];
  }

  // A 403 with the suspension code here is the catastrophe this check exists
  // for: the function is refusing somebody who is not suspended.
  if (answer.status === 403 && body.includes(SUSPENDED_CODE)) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `HTTP 403 with "${SUSPENDED_CODE}" FOR A PERSON WHO IS NOT SUSPENDED. If this is Alice,` +
          ` part B is refusing everybody -- which is what calling public.is_active() from an admin` +
          ` connection does, because auth.uid() is null there and the answer is false for every` +
          ` caller. If this is Bob in --expect-active, his account_status row is still there`,
      },
    ];
  }
  if (answer.status === 401) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail: "HTTP 401 -- the caller's own token was refused, so nothing was tested",
      },
    ];
  }
  if (answer.status === 500) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail:
          `HTTP 500 -- a failure rather than the ordinary refusal. If part B's account_status read` +
          ` is failing, this is its fail-closed branch, and nobody can use the app. Body: ${body}`,
      },
    ];
  }
  if (answer.status === expected.status) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail:
          `HTTP ${answer.status}, the expected status, but not ${name}'s own wording -- this may be` +
          ` the gateway rather than the function. Body: ${body}`,
      },
    ];
  }
  return [
    {
      what,
      verdict: FAIL,
      detail: `HTTP ${answer.status}, expected ${expected.status} with "${expected.words}" -- body: ${body}`,
    },
  ];
}

// Alice reads her own team. The positive control: it says the run reached a
// working project with working rules, so that Bob's refusals mean something.
//
// `read` is { rows } or { error }; `aliceId` is her user id from the sign-in.
function judgeAliceUnaffected(read, teamId, aliceId) {
  const what = "Alice, who is not suspended, still reads the team she owns";
  if (read.error) {
    return [{ what, verdict: UNVERIFIED, detail: read.error }];
  }
  const owns = read.rows.length === 1 && read.rows[0].owner_id === aliceId;
  if (owns) {
    return [
      {
        what,
        verdict: PASS,
        detail: `1 row for ${teamId}, and its owner_id is Alice -- reads still work for an active person`,
      },
    ];
  }
  return [
    {
      what,
      verdict: read.rows.length === 0 ? FAIL : UNVERIFIED,
      detail:
        read.rows.length === 0
          ? `0 rows for ${teamId}. Either ALICE_TEAM_ID is wrong, or Alice cannot read her own team` +
            ` -- and if it is the second, this run's refusals say nothing about suspension`
          : `${read.rows.length} row(s) came back and none is a team Alice owns, so this control proves nothing`,
    },
  ];
}

// Bob reads his own teams. NOT a check on what exists -- it cannot be.
//
// In --expect-suspended, 0 rows is the five restrictive rules working and says
// nothing about whether a team was created, because a suspended person's reads
// return nothing either way. That is reported as UNVERIFIED with the reason,
// and the owner is pointed at the dashboard. In --expect-active it is a real
// count, printed so the owner can compare it with what they see there.
function judgeBobsOwnReadOfTeams(read, expectSuspended) {
  const what = "what Bob himself can see of his teams";
  if (read.error) {
    return [{ what, verdict: UNVERIFIED, detail: read.error }];
  }
  if (expectSuspended) {
    return [
      {
        what,
        verdict: read.rows.length === 0 ? PASS : FAIL,
        detail:
          read.rows.length === 0
            ? `0 rows, which is part A's restrictive rule on teams working. It is NOT evidence that no` +
              ` team was created: a suspended person's reads return nothing whatever exists, so the` +
              ` count in the dashboard is the only one that answers that`
            : `${read.rows.length} row(s) came back for a suspended person, so the restrictive rule on` +
              ` teams is NOT refusing his reads -- that is part A, not part B, and it needs looking at`,
      },
    ];
  }
  return [
    {
      what,
      verdict: PASS,
      detail:
        `${read.rows.length} team(s) Bob owns, read as Bob with no row in account_status. This is a` +
        ` number to compare with the dashboard, not a judgement -- the script creates nothing, so it` +
        ` should be the same before and after a --expect-suspended run`,
    },
  ];
}

// Did this run touch anything it said it would not?
//
// `log` is every request made, as { method, path }. Checked against a list of
// what this script is allowed to do, so "it never touches account_status" is
// measured rather than promised.
function judgeTouchedNothing(log) {
  const what = "this run touched account_status not at all, and wrote nothing";
  const allowed = [
    { method: "POST", path: "/auth/v1/token" },
    { method: "POST", path: "/auth/v1/logout" },
    { method: "POST", path: "/functions/v1/create-team" },
    { method: "POST", path: "/functions/v1/invite-member" },
    { method: "POST", path: "/functions/v1/accept-invite" },
    { method: "GET", path: "/rest/v1/teams" },
  ];

  if (log.length === 0) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail: "no request was made at all, so there is nothing to check",
      },
    ];
  }

  const problems = [];
  for (const entry of log) {
    if (entry.path.includes("account_status")) {
      problems.push(`${entry.method} ${entry.path} names account_status`);
      continue;
    }
    const ok = allowed.some(
      (a) => a.method === entry.method && entry.path.startsWith(a.path),
    );
    if (!ok) problems.push(`${entry.method} ${entry.path} is not on the allowed list`);
  }

  return [
    {
      what,
      verdict: problems.length === 0 ? PASS : FAIL,
      detail:
        problems.length === 0
          ? `${log.length} request(s), every one of them a sign-in, a sign-out, a call to one of the` +
            ` three functions, or a read of teams`
          : problems.join("; "),
    },
  ];
}

// ---------------------------------------------------------------------------
// Keeping tokens out of printed lines
// ---------------------------------------------------------------------------

const TOKEN_PLACEHOLDERS = [];

function rememberToken(token, placeholder) {
  if (typeof token === "string" && token !== "") {
    TOKEN_PLACEHOLDERS.push([token, placeholder]);
  }
}

function scrubWith(text, placeholders) {
  let out = text ?? "";
  for (const [token, placeholder] of placeholders) {
    if (token === "") continue;
    out = out.split(token).join(placeholder);
  }
  return out;
}

function scrub(text) {
  return scrubWith(text, TOKEN_PLACEHOLDERS);
}

// Did `token` actually get taken out of `text`? UNVERIFIED when the token was
// not in the text to begin with, because a clean result then proves nothing.
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
// --selftest -- the judgements above, fed answers from a world where the check
// is missing, misplaced, or refusing everybody. No network, no account.
// ---------------------------------------------------------------------------

function runSelftest() {
  console.log("build-it-16-suspend-checks --selftest: can these checks fail?");
  console.log("");
  console.log("Each case is something this script might be handed: a URL from");
  console.log("web/.env.local, or an answer that came back. The expectation is");
  console.log("what the judgement must say about it. Nothing is sent anywhere");
  console.log("and no account is used.");
  console.log("");

  const madeUpId = "a1b2c3d4-0001-4e5f-8a9b-0c1d2e3f4a5b";
  const aliceId = "a1b2c3d4-0002-4e5f-8a9b-0c1d2e3f4a5b";

  // The body a working part B produces, built from the same two constants the
  // functions use.
  const goodRefusal = JSON.stringify({ error: SUSPENDED_MESSAGE, code: SUSPENDED_CODE });
  const goodInviteRefusal = JSON.stringify({
    error: SUSPENDED_MESSAGE,
    reason: SUSPENDED_CODE,
    code: SUSPENDED_CODE,
  });

  // A JWT-shaped string that is not a token: nothing signed it, so it opens
  // nothing. For the scrub cases only.
  const standInToken = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }), "utf8").toString("base64url"),
    Buffer.from(JSON.stringify({ sub: madeUpId }), "utf8").toString("base64url"),
    "not-a-signature",
  ].join(".");

  const cases = [
    // ---- the staging guard ----
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
      name: "NOT STAGING: the right host, over plain http",
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

    // ---- the suspended refusal, as it should be ----
    {
      name: "part B works: 403, the code, the fixed sentence and nothing else",
      run: () => judgeSuspendedRefusal("create-team as Bob", { status: 403, body: goodRefusal }),
      expect: [PASS, PASS, PASS],
    },
    {
      name: "part B works in accept-invite: the code travels as `reason` too",
      run: () =>
        judgeSuspendedRefusal("accept-invite as Bob", { status: 403, body: goodInviteRefusal }),
      expect: [PASS, PASS, PASS],
    },

    // ---- the hole, in each of its shapes ----
    {
      name: "THE HOLE IS OPEN: create-team created a team for a suspended person",
      run: () =>
        judgeSuspendedRefusal("create-team as Bob", {
          status: 201,
          body: `{"team":{"id":"${madeUpId}","name":"Suspended test team"}}`,
        }),
      expect: [FAIL, FAIL, FAIL],
    },
    {
      name: "PART B IS NOT DEPLOYED: the body was parsed first, so the answer is the old 400",
      run: () =>
        judgeSuspendedRefusal("create-team as Bob", {
          status: 400,
          body: '{"error":"Please give the team a name.","code":null}',
        }),
      expect: [FAIL, FAIL, FAIL],
    },
    {
      name: "THE CHECK IS IN THE WRONG PLACE: accept-invite looked the token up first (404)",
      run: () =>
        judgeSuspendedRefusal("accept-invite as Bob", {
          status: 404,
          body: '{"error":"This invitation link is not valid.","reason":"not_found"}',
        }),
      expect: [FAIL, FAIL, FAIL],
    },
    {
      name: "403, BUT THE WRONG CODE: the page would read it as wrong_person",
      run: () =>
        judgeSuspendedRefusal("accept-invite as Bob", {
          status: 403,
          body: JSON.stringify({ error: SUSPENDED_MESSAGE, reason: "wrong_person" }),
        }),
      expect: [PASS, FAIL, PASS],
    },
    {
      name: "403 with the code, but accept-invite left `reason` off -- the fallback bites",
      run: () =>
        judgeSuspendedRefusal("accept-invite as Bob", {
          status: 403,
          body: JSON.stringify({ error: SUSPENDED_MESSAGE, code: SUSPENDED_CODE }),
        }),
      expect: [PASS, FAIL, PASS],
    },
    {
      name: "403 WITH THE REASON TEXT IN IT: the sensitive column, through the app",
      run: () =>
        judgeSuspendedRefusal("create-team as Bob", {
          status: 403,
          body: JSON.stringify({
            error: SUSPENDED_MESSAGE,
            code: SUSPENDED_CODE,
            reason_text: "Invented for a test. About nobody.",
          }),
        }),
      expect: [PASS, PASS, FAIL],
    },
    {
      name: "403 WITH THE TIMESTAMP IN IT: when they were suspended",
      run: () =>
        judgeSuspendedRefusal("create-team as Bob", {
          status: 403,
          body: JSON.stringify({
            error: SUSPENDED_MESSAGE,
            code: SUSPENDED_CODE,
            suspended_at: "2026-10-04T12:51:47Z",
          }),
        }),
      expect: [PASS, PASS, FAIL],
    },
    {
      name: "403 WITH A MESSAGE WRITTEN FOR ANOTHER CAUSE -- what #134 is about",
      run: () =>
        judgeSuspendedRefusal("create-team as Bob", {
          status: 403,
          body: JSON.stringify({
            error: "A task can only be added to a team you belong to.",
            code: SUSPENDED_CODE,
          }),
        }),
      expect: [PASS, PASS, FAIL],
    },
    {
      name: "the fail-closed branch fired instead: a refusal, but not the one being tested",
      run: () =>
        judgeSuspendedRefusal("create-team as Bob", {
          status: 500,
          body: '{"error":"Could not check your account, so no team was created. Please try again.","code":"42501"}',
        }),
      // UNVERIFIED on the status, and the code and quiet checks still FAIL,
      // which is right: this body is not the refusal this check is about.
      expect: [UNVERIFIED, FAIL, FAIL],
    },
    {
      name: "the request never arrived",
      run: () =>
        judgeSuspendedRefusal("create-team as Bob", {
          error: "could not reach create-team (fetch failed)",
        }),
      expect: [UNVERIFIED, UNVERIFIED, UNVERIFIED],
    },

    // ---- the active answers: the is_active() trap, and part B's absence ----
    {
      name: "an active person is unaffected: create-team's ordinary 400",
      run: () =>
        judgeActiveAnswer("create-team as Alice", "create-team", {
          status: 400,
          body: '{"error":"Please give the team a name.","code":null}',
        }),
      expect: [PASS],
    },
    {
      name: "an active person is unaffected: accept-invite's ordinary 404",
      run: () =>
        judgeActiveAnswer("accept-invite as Alice", "accept-invite", {
          status: 404,
          body: '{"error":"This invitation link is not valid. It may have been withdrawn, or the link may be incomplete.","reason":"not_found"}',
        }),
      expect: [PASS],
    },
    {
      name: "THE is_active() TRAP: Alice is refused as well, so the app is shut for everybody",
      run: () =>
        judgeActiveAnswer("create-team as Alice", "create-team", {
          status: 403,
          body: goodRefusal,
        }),
      expect: [FAIL],
    },
    {
      name: "the row was not actually removed: Bob still refused in --expect-active",
      run: () =>
        judgeActiveAnswer("create-team as Bob", "create-team", { status: 403, body: goodRefusal }),
      expect: [FAIL],
    },
    {
      name: "AN ACTIVE PERSON'S CALL SUCCEEDED: 201 from a body that has no name in it",
      run: () =>
        judgeActiveAnswer("create-team as Alice", "create-team", {
          status: 201,
          body: `{"team":{"id":"${madeUpId}"}}`,
        }),
      expect: [FAIL],
    },
    {
      name: "the read failed closed for everybody: 500 from the account_status read",
      run: () =>
        judgeActiveAnswer("invite-member as Alice", "invite-member", {
          status: 500,
          body: '{"error":"Could not check your account, so no invitation was created. Please try again.","code":"42501"}',
        }),
      expect: [UNVERIFIED],
    },
    {
      name: "the right status from the wrong place: a 404 that is not accept-invite's",
      run: () =>
        judgeActiveAnswer("accept-invite as Alice", "accept-invite", {
          status: 404,
          body: '{"message":"Function not found"}',
        }),
      expect: [UNVERIFIED],
    },

    // ---- the controls ----
    {
      name: "the control holds: Alice reads the team she owns",
      run: () =>
        judgeAliceUnaffected({ rows: [{ id: madeUpId, owner_id: aliceId }] }, madeUpId, aliceId),
      expect: [PASS],
    },
    {
      name: "THE CONTROL IS BROKEN: Alice cannot read her own team, so nothing else means anything",
      run: () => judgeAliceUnaffected({ rows: [] }, madeUpId, aliceId),
      expect: [FAIL],
    },
    {
      name: "the control proves nothing: a row came back that Alice does not own",
      run: () =>
        judgeAliceUnaffected({ rows: [{ id: madeUpId, owner_id: "somebody-else" }] }, madeUpId, aliceId),
      expect: [UNVERIFIED],
    },
    {
      name: "suspended: Bob sees 0 of his own teams, which is part A working",
      run: () => judgeBobsOwnReadOfTeams({ rows: [] }, true),
      expect: [PASS],
    },
    {
      name: "SUSPENDED, BUT HIS READS STILL WORK: part A's rule on teams is not refusing him",
      run: () => judgeBobsOwnReadOfTeams({ rows: [{ id: madeUpId }] }, true),
      expect: [FAIL],
    },
    {
      name: "active: Bob's own count, a number for the owner to compare",
      run: () => judgeBobsOwnReadOfTeams({ rows: [{ id: madeUpId }] }, false),
      expect: [PASS],
    },

    // ---- what the run touched ----
    {
      name: "the run touched only what it said it would",
      run: () =>
        judgeTouchedNothing([
          { method: "POST", path: "/auth/v1/token?grant_type=password" },
          { method: "POST", path: "/functions/v1/create-team" },
          { method: "POST", path: "/functions/v1/invite-member" },
          { method: "POST", path: "/functions/v1/accept-invite" },
          { method: "GET", path: "/rest/v1/teams?id=eq.x&select=id,owner_id" },
          { method: "POST", path: "/auth/v1/logout?scope=global" },
        ]),
      expect: [PASS],
    },
    {
      name: "IT READ account_status: the one table nothing here may touch",
      run: () =>
        judgeTouchedNothing([
          { method: "GET", path: "/rest/v1/account_status?select=user_id" },
        ]),
      expect: [FAIL],
    },
    {
      name: "IT WROTE account_status: suspending somebody, which no script may do",
      run: () =>
        judgeTouchedNothing([{ method: "POST", path: "/rest/v1/account_status" }]),
      expect: [FAIL],
    },
    {
      name: "IT WENT SOMEWHERE ELSE ENTIRELY: a table this script has no business reading",
      run: () =>
        judgeTouchedNothing([{ method: "GET", path: "/rest/v1/invitations?select=email" }]),
      expect: [FAIL],
    },
    {
      name: "nothing was requested at all, so the claim is unproved rather than true",
      run: () => judgeTouchedNothing([]),
      expect: [UNVERIFIED],
    },

    // ---- the scrub ----
    {
      name: "an access token echoed back in a body is replaced",
      run: () =>
        judgeScrubbed(
          "a token in a response body is replaced",
          `{"msg":"bad jwt","got":"${standInToken}"}`,
          standInToken,
          [[standInToken, "BOB_ACCESS_TOKEN"]],
        ),
      expect: [PASS],
    },
    {
      name: "NOTHING REGISTERED: the token comes straight back out",
      run: () =>
        judgeScrubbed(
          "a token with an empty registry",
          `{"msg":"bad jwt","got":"${standInToken}"}`,
          standInToken,
          [],
        ),
      expect: [FAIL],
    },
    {
      name: "a scrub case that proves nothing: the token is not in the text at all",
      run: () =>
        judgeScrubbed("a body with no token in it", '{"msg":"bad jwt"}', standInToken, [
          [standInToken, "BOB_ACCESS_TOKEN"],
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
  console.log("Every judgement said FAIL to a function that acted for a suspended");
  console.log("person, to a check that ran too late, to a refusal that leaked the");
  console.log("reason or the timestamp, to a refusal aimed at everybody, and to a");
  console.log("run that touched account_status. That is what would make a green");
  console.log("staging run mean something. It is NOT itself a staging result:");
  console.log("nothing was sent anywhere by this run.");
  return 0;
}

if (process.argv.slice(2).includes("--selftest")) {
  process.exit(runSelftest());
}

// ---------------------------------------------------------------------------
// Which mode
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const wantsSuspended = args.includes("--expect-suspended");
const wantsActive = args.includes("--expect-active");

if (wantsSuspended === wantsActive) {
  die(
    `say which state the account is in. Exactly one of:\n` +
      `\n` +
      `  --expect-suspended   the owner has just ADDED Bob's row in account_status\n` +
      `  --expect-active      the owner has just REMOVED it\n` +
      `\n` +
      `There is no default, because a run in the wrong mode reports failures that mean\n` +
      `nothing. Only the owner can add or remove the row -- nothing in this repository\n` +
      `has the privilege, and docs/plan.md says the owner does it by hand in the\n` +
      `dashboard. Nothing was sent and nobody was signed in.\n` +
      `\n` +
      `To check this script's own logic instead, which needs no account and no network:\n` +
      `  node scripts/staging/build-it-16-suspend-checks.mjs --selftest`,
  );
}

const expectSuspended = wantsSuspended;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
//
// A small .env reader, the same one the three scripts beside this use and for the
// same reason: no dotenv package exists here, and adding one for a staging script
// would need a rule 17 conversation for no benefit.

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
        `  node scripts/staging/build-it-16-suspend-checks.mjs --selftest`,
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
// request is made.
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

// Two people. Bob is the one the owner suspends; Alice is the control, and she is
// never suspended in either mode. docs/environments.md names them, and rule 6
// says to use them and never a real person's data.
const PEOPLE = [
  { label: "Alice", emailVar: "ALICE_EMAIL", passwordVar: "ALICE_PASSWORD" },
  { label: "Bob", emailVar: "BOB_EMAIL", passwordVar: "BOB_PASSWORD" },
];

const aliceTeamId = (process.env.ALICE_TEAM_ID ?? "").trim();

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

// ALICE_TEAM_ID must look like a uuid, checked BEFORE anybody signs in: a run
// that cannot test anything should not get as far as sending a password.
if (!UUID_PATTERN.test(aliceTeamId)) {
  die(
    `ALICE_TEAM_ID is not a uuid, so the control read in this script could not have\n` +
      `meant anything. Expected 8-4-4-4-12 hex digits, for example\n` +
      `0f8fad5b-d9cb-469f-a165-70867728950e. Copy the team's id from the staging Table\n` +
      `Editor -- not its name, and not an email address. Nothing was sent and nobody\n` +
      `was signed in.`,
  );
}

// ---------------------------------------------------------------------------
// The endpoints, built from the URL the guard has already accepted
// ---------------------------------------------------------------------------

const base = supabaseUrl.replace(/\/+$/, "");
const authUrl = `${base}/auth/v1`;
const functionsUrl = `${base}/functions/v1`;
const restUrl = `${base}/rest/v1`;

// A well-formed token that is in no database. 32 random bytes, base64url, which
// is the shape invite-member's makeToken produces -- so accept-invite hashes it
// like any other and finds nothing. It is not a credential: nothing issued it.
const ABSENT_TOKEN = randomBytes(32)
  .toString("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");

// The three bodies, and the reason each is safe in every mode, restated here
// beside the values themselves:
//
//   create-team    {}                     no name, so there is nothing to create
//   invite-member  {}                     no team id and no address, so there is
//                                         nothing to invite and nowhere to send
//   accept-invite  { token: ABSENT_TOKEN } a token in no row, so there is nothing
//                                         to claim
const BODIES = {
  "create-team": {},
  "invite-member": {},
  "accept-invite": { token: ABSENT_TOKEN },
};

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

let passes = 0;
let failures = 0;
let unverified = 0;

function record(results) {
  for (const result of results) {
    if (result.verdict === PASS) passes += 1;
    else if (result.verdict === FAIL) failures += 1;
    else unverified += 1;
    console.log(`  ${result.verdict}  ${result.what} -- ${result.detail}`);
  }
}

// Every request this run makes, for judgeTouchedNothing at the end.
const REQUEST_LOG = [];

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

// One call to an Edge Function. Returns { status, body } or { error }, never
// throws, so one unreachable function does not abandon the rest. The body is read
// as TEXT: a non-JSON answer must be shown as it arrived.
async function callFunction(name, accessToken, body) {
  const headers = { apikey: publishableKey, "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  REQUEST_LOG.push({ method: "POST", path: `/functions/v1/${name}` });

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

  REQUEST_LOG.push({ method: "GET", path: `/rest/v1/${path}` });

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

  REQUEST_LOG.push({ method: "POST", path: "/auth/v1/token?grant_type=password" });

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
  // Registered with scrub() the moment it exists, before any body that could
  // contain it is printed. This one is live.
  rememberToken(accessToken, `${person.label.toUpperCase()}_ACCESS_TOKEN`);
  return { accessToken, userId };
}

async function signOut(label, accessToken) {
  REQUEST_LOG.push({ method: "POST", path: "/auth/v1/logout?scope=global" });
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

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log("Build it 16 step 5 part B -- the three functions and a suspended account");
console.log(`  mode:               ${expectSuspended ? "--expect-suspended" : "--expect-active"}`);
console.log(`  staging host:       ${STAGING_HOST} (confirmed by parsing the URL, not by a substring)`);
console.log(`  functions:          ${FUNCTIONS.join(", ")}`);
console.log(`  Alice's team id:    ${aliceTeamId} (the control; Alice is never suspended)`);
console.log("  signing in as:      Alice and Bob");
console.log("  tokens, passwords and the publishable key: not printed");
console.log("");
console.log(
  expectSuspended
    ? "YOU HAVE TOLD IT Bob's account_status row IS THERE. If it is not, every\nrefusal below will read as a failure of part B when it is really a failure\nto set up."
    : "YOU HAVE TOLD IT Bob's account_status row IS GONE. If it is still there,\nBob's lines below will read as part B refusing an active person.",
);
console.log("");
console.log("THIS SCRIPT CREATES NOTHING, and that is structural: create-team is");
console.log("sent {} (no name), invite-member {} (no team and no address), and");
console.log("accept-invite a well-formed token that is in no row. There is nothing");
console.log("in any of the three for a function to write, and no address for it to");
console.log("send mail to, whatever state the account is in.");
console.log("");
console.log("IT NEVER READS OR WRITES account_status. The last check in the run");
console.log("proves that from a log of every request it made.");
console.log("");

const sessions = {};
for (const person of PEOPLE) {
  const session = await signIn(person);
  if (session.error) {
    console.log(`${person.label} (${person.emailVar}, value not printed)`);
    console.log(`  UNVERIFIED  ${person.label} could not sign in -- ${session.error}`);
    console.log("");
    unverified += 1;
  } else {
    sessions[person.label] = session;
  }
}

const alice = sessions.Alice;
const bob = sessions.Bob;

try {
  // -------------------------------------------------------------------------
  // 1. The control: Alice, who is not suspended in either mode
  // -------------------------------------------------------------------------
  //
  // FIRST, deliberately. If Alice is refused, nothing after this means what it
  // looks like: a run where everybody is refused is not a run where suspension
  // works, it is a run where the app is shut. Reading it first also means the
  // owner sees it at the top of the output rather than hunting for it.

  console.log("1. Alice, who is NOT suspended -- the control for the whole run");

  if (!alice) {
    unverified += 4;
    console.log("  UNVERIFIED  Alice is not signed in, so the control could not be read");
    console.log("  UNVERIFIED  (and the three function answers for her were not asked)");
  } else {
    const team = await readRows(`teams?id=eq.${aliceTeamId}&select=id,owner_id`, alice.accessToken);
    record(judgeAliceUnaffected(team, aliceTeamId, alice.userId));

    for (const name of FUNCTIONS) {
      const answer = await callFunction(name, alice.accessToken, BODIES[name]);
      record(judgeActiveAnswer(`${name} as Alice`, name, answer));
      if (answer.body !== undefined) console.log(`        body: ${answer.body}`);
    }
  }
  console.log("");

  // -------------------------------------------------------------------------
  // 2. Bob
  // -------------------------------------------------------------------------

  console.log(
    expectSuspended
      ? "2. Bob, whose account_status row you have just added"
      : "2. Bob, whose account_status row you have just removed",
  );

  if (!bob) {
    unverified += 3;
    console.log("  UNVERIFIED  Bob is not signed in, so nothing about him was tested");
    console.log("        A suspended person CAN still sign in -- suspension is a database rule,");
    console.log("        not an auth block (evidence/build-it-16-suspend-accounts.md section 8).");
    console.log("        So a failed sign-in here is a wrong password or a missing account, not");
    console.log("        the suspension working.");
  } else {
    for (const name of FUNCTIONS) {
      const answer = await callFunction(name, bob.accessToken, BODIES[name]);
      record(
        expectSuspended
          ? judgeSuspendedRefusal(`${name} as Bob`, answer)
          : judgeActiveAnswer(`${name} as Bob`, name, answer),
      );
      if (answer.body !== undefined) console.log(`        body: ${answer.body}`);
    }

    // What Bob can see of his own teams. Read last, because in
    // --expect-suspended it is the one line in this section that is about part A
    // rather than part B, and it is easy to misread as a count of what exists.
    const bobsTeams = await readRows(
      `teams?owner_id=eq.${bob.userId}&select=id`,
      bob.accessToken,
    );
    record(judgeBobsOwnReadOfTeams(bobsTeams, expectSuspended));
  }
  console.log("");

  // -------------------------------------------------------------------------
  // 3. What this run touched
  // -------------------------------------------------------------------------

  console.log("3. What this run touched");
  record(judgeTouchedNothing(REQUEST_LOG));
  console.log("");
} finally {
  for (const [label, session] of Object.entries(sessions)) {
    await signOut(label, session.accessToken);
  }
  console.log("");

  console.log(`Totals: ${passes} PASS, ${failures} FAIL, ${unverified} UNVERIFIED.`);
  console.log("");
  console.log("WHAT THIS RUN CANNOT TELL YOU, whatever the totals say (rule 8):");
  console.log("  * whether a row appeared in `teams` or `invitations`. Nothing in");
  console.log("    this request could have written one -- see the bodies above --");
  console.log("    but the reading of those tables belongs to you, in the");
  console.log("    dashboard or through a read-only connector. A suspended");
  console.log("    person's own reads come back empty whatever exists, so his 0");
  console.log("    is not a count.");
  console.log("  * whether any mail was sent. invite-member was never given an");
  console.log("    address, so there was nothing to send; the test inbox is the");
  console.log("    place to confirm it.");
  console.log("  * anything about the `reason` column, which nothing here reads.");

  if (failures > 0 || unverified > 0) {
    console.log("");
    console.log("NOT GREEN. A FAIL in section 2 is a function acting for somebody it");
    console.log("should refuse, or refusing somebody it should not. A FAIL in section 1");
    console.log("is worse: it means the app is shut for everybody, which is what calling");
    console.log("public.is_active() from an admin connection does. An UNVERIFIED is a");
    console.log("question that could not be asked, which is not a pass either -- the");
    console.log("usual causes are a sign-in that failed, a wrong ALICE_TEAM_ID, or the");
    console.log("wrong mode for the state the account is actually in.");
    process.exitCode = 1;
  } else {
    console.log("");
    console.log("All checks passed, for the one state you said the account is in.");
    console.log("Both modes have to be run -- and the functions have to be deployed --");
    console.log("before #133 is answered.");
  }
}

// HOW TO RUN IT, from the repository root.
//
// THE LOGIC CHECK NEEDS NOTHING AT ALL -- no account, no network, no
// web/.env.local. Run this first, and whenever this file is edited:
//
//   node scripts/staging/build-it-16-suspend-checks.mjs --selftest
//
// THE STAGING RUN NEEDS THE FUNCTIONS DEPLOYED FIRST. Part B changes
// supabase/functions/*/index.ts, and nothing in this repository deploys them: the
// assistant deploys nothing, and `supabase functions deploy` against staging is
// the owner's step. Run before the deploy, --expect-suspended will report the
// 400s and 404s of part A and call them failures, which is correct -- the check
// really is not there yet.
//
// KEEP THE PASSWORDS OFF THE COMMAND LINE: both shells on this machine save
// command lines to a file -- Git Bash writes ~/.bash_history with HISTCONTROL
// unset, and PowerShell's PSReadLine saves incrementally. So load the password
// file instead of typing values; what lands in history is a FILENAME.
//
// The owner keeps the test accounts' passwords in
// ~/.config/team-tasks/staging.env, outside this repository. This script needs
// four names from it: ALICE_EMAIL, ALICE_PASSWORD, BOB_EMAIL, BOB_PASSWORD. See
// docs/environments.md -> "Where the test accounts' passwords live".
//
// THE WHOLE SEQUENCE, which needs the dashboard twice because only you can write
// account_status:
//
//   1. In the staging SQL editor, add Bob's row:
//
//        insert into public.account_status (user_id, reason)
//        values ('<Bob's user id>', 'Part B check. Invented, about nobody.');
//
//      Note what Bob's teams and invitations counts are BEFORE you go on -- the
//      script cannot read them for you, and they are what answers "and nothing
//      was created".
//
//   2. Git Bash, WSL or macOS:
//
//        set -a
//        . ~/.config/team-tasks/staging.env
//        set +a
//        export ALICE_TEAM_ID='...'
//        node scripts/staging/build-it-16-suspend-checks.mjs --expect-suspended
//
//      PowerShell has no `source`, so it reads the file line by line instead:
//
//        foreach ($line in Get-Content "$HOME\.config\team-tasks\staging.env") {
//          if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
//            Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim().Trim("'").Trim('"')
//          }
//        }
//        $env:ALICE_TEAM_ID = '...'
//        node scripts/staging/build-it-16-suspend-checks.mjs --expect-suspended
//
//   3. Check the two counts again in the dashboard. They should be exactly what
//      they were in step 1.
//
//   4. In the SQL editor, remove the row:
//
//        delete from public.account_status where user_id = '<Bob's user id>';
//
//   5. Run the second mode in the same shell:
//
//        node scripts/staging/build-it-16-suspend-checks.mjs --expect-active
//
// Close the shell window afterwards: the passwords live in that one process, and
// nothing writes them to disk.
//
// This script reads ALICE_EMAIL, ALICE_PASSWORD, BOB_EMAIL, BOB_PASSWORD and
// ALICE_TEAM_ID from the environment, and NEXT_PUBLIC_SUPABASE_URL and
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from web/.env.local. Nothing else, and it
// never reads the password file itself.
//
// The assistant has never run this script against staging, in either mode. It has
// run --selftest; that output is in
// evidence/build-it-16-suspend-functions.md.
