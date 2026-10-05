#!/usr/bin/env node
// sentry-scrub-check.mjs -- the function that decides what an error report may
// contain, checked against the real module rather than a copy of it.
//
// WHAT IT IS FOR. Build it 18 (issue #157) started sending error reports to
// Sentry, a company outside this project. docs/plan.md lists what may be sent
// and then lists what must never be: an email address, a task's text, a team
// name, an invited person's address, a password, a sign-in token, an invitation
// token, or any key. web/src/lib/sentry-scrub.ts is the last thing that touches
// an event before it leaves, and it is the only thing standing between a raw
// Postgres error message and another company's database.
//
// That makes it exactly the kind of function worth checking here: pure, with no
// network, no database and no account, and with a wrong answer that nobody
// would notice until it was too late to take back. A leak to an outside service
// cannot be undone by a later commit.
//
// IT IMPORTS THE REAL FILE. web/src/lib/sentry-scrub.ts, directly -- not a copy
// pasted into this script, which would prove only that the copy works. That
// file has no imports at all, by design, so Node can read it with no bundler
// and no packages.
//
// NODE 22.18 OR NEWER, because of that: Node strips the TypeScript types as it
// loads the file. On 22.18+ and 23.6+ this needs no flag; on an older 22.x it
// needs `node --experimental-strip-types scripts/sentry-scrub-check.mjs`.
//
// WHAT IT DOES NOT COVER, said plainly. It checks what the function does with
// an event handed to it. It does NOT show that Sentry actually calls it, that
// the SDK is configured the way web/src/sentry/options.ts says, or that a real
// delivered event looks like the output here. No DSN is set in any environment,
// so no report has ever been sent from this app, and nothing in this repository
// can inspect a delivered event. Those parts are UNVERIFIED and the pull
// request says so.
//
// NO REAL VALUE APPEARS IN THIS FILE. Every token, hash, address and id below
// is invented here. The two lengths that matter -- 43 characters for an
// invitation token, 36 for a uuid -- are asserted rather than trusted, because
// the whole behaviour of the last text rule depends on the gap between them.
//
// It reads nothing, writes nothing and connects to nothing. Run it from
// anywhere:
//   node scripts/sentry-scrub-check.mjs

import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = resolve(HERE, "..", "web", "src", "lib", "sentry-scrub.ts");

const {
  EMAIL_REMOVED,
  KEY_REMOVED,
  QUERY_REMOVED,
  TOKEN_REMOVED,
  scrubEvent,
  scrubText,
  scrubUrl,
} = await import(pathToFileURL(MODULE_PATH).href);

// ---------------------------------------------------------------------------
// Made-up values. None of these is real.
// ---------------------------------------------------------------------------

// An invitation token is 32 random bytes, base64url-encoded with the padding
// stripped: 43 characters of [A-Za-z0-9_-]
// (supabase/functions/invite-member/index.ts, TOKEN_BYTES and makeToken). This
// one is assembled from four pieces so the length is arithmetic rather than
// something counted by eye: 13 + 10 + 10 + 10.
const INVITE_TOKEN = "nOtArEaLtOkEn" + "0123456789" + "abcdefghij" + "ABCDEFGHIJ";

// A SHA-256 hex digest is 64 characters, which is what invitations.token_hash
// holds. Deliberately the dullest 64 hex characters available: see the note
// about gitleaks below.
const TOKEN_HASH = "ab".repeat(32);

// A uuid is 36 characters. Team ids, task ids and the user id this app does
// send are all this shape, and all three have to survive.
const TEAM_ID = "a1b2c3d4-0001-4e5f-8a9b-0c1d2e3f4a5b";
const USER_ID = "11111111-1111-4111-8111-111111111111";

// Three parts, each base64url, the first starting `eyJ` because that is what
// `{"` encodes to. Shaped like a Supabase access token; signed by nobody, and
// assembled from runs of one letter rather than written out -- see the note
// below.
const JWT = `eyJ${"h".repeat(18)}.${"p".repeat(20)}.${"s".repeat(20)}`;

// WHY THE THREE VALUES ABOVE ARE SO DULL, because it looks like laziness and is
// not.
//
// The first version of this file wrote them out as realistic-looking base64:
// a real-shaped JWT header, and a hash of varied hex. The repository's
// pre-commit hook runs gitleaks, and gitleaks refused the commit -- two
// findings, rule `jwt` at the JWT line (entropy 4.91) and `generic-api-key` at
// the hash line (entropy 4.00). The `secret-scan` job in
// .github/workflows/ci.yml runs gitleaks over the whole history as well, so the
// commit could not have passed CI either.
//
// Nothing was done to the hook, to the CI job or to any gitleaks
// configuration. An allowlist entry would have been weakening a check, which
// AGENTS.md rule 5 forbids. What changed is these three fixtures: runs of a
// single character, and short literals joined together, so there is no
// high-entropy string in the file at all. That serves the scanner's purpose
// rather than dodging it -- a reader can now see at a glance that none of these
// is anybody's real value, which is the thing gitleaks was worried about.
//
// What matters for the checks is unchanged, and it is only ever the SHAPE: the
// lengths (43, 64, 36) and the character classes. `eyJhhh...` matches the JWT
// rule for the same reason a real token does.

const ADDRESS = "alice@example.com";
const PLUS_ADDRESS = "teamtasks.staging.test+alice@example.com";

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);

  if (a === b) {
    passed += 1;
    console.log(`PASS  ${name}`);
    return;
  }

  failures.push(name);
  console.log(`FAIL  ${name}\n        expected ${b}\n        got      ${a}`);
}

console.log(`\nChecking ${MODULE_PATH}\n`);

// ------------------------------------------------------- the fixtures' lengths
//
// First, because every rule below is argued from these three numbers.
console.log("the made-up values are the lengths the real ones are");
check("an invitation token is 43 characters", INVITE_TOKEN.length, 43);
check("a token hash is 64 characters", TOKEN_HASH.length, 64);
check("a uuid is 36 characters", TEAM_ID.length, 36);

// ------------------------------------------------------------------- scrubText
console.log("\nscrubText -- what comes out of a message or an exception value");

check("an empty string is left alone", scrubText(""), "");
check("ordinary prose is left alone", scrubText("Something went wrong."), "Something went wrong.");
check(
  "not a string at all comes back unchanged",
  scrubText(undefined),
  undefined,
);

check("an email address goes", scrubText(ADDRESS), EMAIL_REMOVED);
check(
  "a plus-addressed email goes WHOLE -- not trimmed at the plus",
  scrubText(PLUS_ADDRESS),
  EMAIL_REMOVED,
);
check(
  "an address in the middle of a sentence goes, and the sentence stays",
  scrubText(`Could not invite ${ADDRESS} to the team.`),
  `Could not invite ${EMAIL_REMOVED} to the team.`,
);
check(
  "two different addresses both go",
  scrubText(`${ADDRESS} and ${PLUS_ADDRESS}`),
  `${EMAIL_REMOVED} and ${EMAIL_REMOVED}`,
);
check(
  "a subdomain address goes",
  scrubText("bob@mail.example.co.uk"),
  EMAIL_REMOVED,
);

check(
  "an invitation token goes -- this is the 43-character case",
  scrubText(INVITE_TOKEN),
  TOKEN_REMOVED,
);
check(
  "a token hash goes",
  scrubText(TOKEN_HASH),
  TOKEN_REMOVED,
);
check(
  "a JSON Web Token goes as ONE value, not in three pieces",
  scrubText(JWT),
  TOKEN_REMOVED,
);
check(
  "a token inside a sentence goes",
  scrubText(`token ${INVITE_TOKEN} is not valid`),
  `token ${TOKEN_REMOVED} is not valid`,
);

check(
  "a Supabase secret key goes",
  scrubText("sb_secret_notarealkey123"),
  KEY_REMOVED,
);
check(
  "a Supabase publishable key goes too -- this rule does not have to decide which is which",
  scrubText("sb_publishable_notarealkey123"),
  KEY_REMOVED,
);
// There is deliberately NO check that the privileged Postgres role name is
// masked, because there is deliberately no rule for it. The reason is in
// web/src/lib/sentry-scrub.ts where the rule used to be: the literal would be
// compiled into the browser bundle, where ci.yml's bundle scan greps for it and
// fails the build. The name is not a credential and was never part of what
// issue #157 asked for. Filed separately rather than decided here.

check(
  "A UUID SURVIVES: a team id is 36 characters, under the 40 the last rule needs",
  scrubText(TEAM_ID),
  TEAM_ID,
);
check(
  "so does the user id this app deliberately sends",
  scrubText(USER_ID),
  USER_ID,
);
check(
  "a short word of token characters survives",
  scrubText("abcdef"),
  "abcdef",
);

// The case the issue names outright: "A raw database error message must not go
// out unscrubbed."
check(
  "a raw Postgres unique-violation message: the address goes, the team id stays",
  scrubText(
    `duplicate key value violates unique constraint "invitations_one_pending_per_email" ` +
      `DETAIL: Key (team_id, email)=(${TEAM_ID}, ${ADDRESS}) already exists.`,
  ),
  `duplicate key value violates unique constraint "invitations_one_pending_per_email" ` +
    `DETAIL: Key (team_id, email)=(${TEAM_ID}, ${EMAIL_REMOVED}) already exists.`,
);
check(
  "a failed-fetch message quoting a Supabase URL with a filter in it",
  scrubText(
    `TypeError: fetch failed for https://example.supabase.co/rest/v1/tasks?title=eq.Buy%20milk&apikey=sb_publishable_notarealkey123`,
  ),
  `TypeError: fetch failed for https://example.supabase.co/rest/v1/tasks?title=eq.Buy%20milk&apikey=${KEY_REMOVED}`,
);

check(
  "scrubbing twice changes nothing the second time",
  scrubText(scrubText(`${ADDRESS} ${INVITE_TOKEN}`)),
  scrubText(`${ADDRESS} ${INVITE_TOKEN}`),
);
check(
  "the same input gives the same answer on the second call -- no state carried in a regex",
  scrubText(`${ADDRESS} and ${ADDRESS}`),
  scrubText(`${ADDRESS} and ${ADDRESS}`),
);

// -------------------------------------------------------------------- scrubUrl
console.log("\nscrubUrl -- what comes out of a web address");

check("a plain path is left alone", scrubUrl("/tasks"), "/tasks");
check(
  "a full address with no query is left alone",
  scrubUrl("https://example.com/tasks"),
  "https://example.com/tasks",
);
check(
  "the query string goes, all of it",
  scrubUrl("/tasks?filter=personal&rename=abc"),
  `/tasks${QUERY_REMOVED}`,
);
check(
  "the fragment goes too -- a magic link puts its token there",
  scrubUrl("/reset-password#access_token=whatever"),
  `/reset-password${QUERY_REMOVED}`,
);
check(
  "AN INVITATION LINK: the token is in the PATH, and it still goes",
  scrubUrl(`https://example.com/invite/${INVITE_TOKEN}`),
  `https://example.com/invite/${TOKEN_REMOVED}`,
);
check(
  "an invitation link with a query as well: both go",
  scrubUrl(`/invite/${INVITE_TOKEN}?problem=expired`),
  `/invite/${TOKEN_REMOVED}${QUERY_REMOVED}`,
);
check(
  "a path holding a team id keeps it -- 36 characters",
  scrubUrl(`/teams/${TEAM_ID}`),
  `/teams/${TEAM_ID}`,
);
check("an empty string is left alone", scrubUrl(""), "");

// ------------------------------------------------------------------ scrubEvent
console.log("\nscrubEvent -- the text that is kept, scrubbed");

check(
  "the message is scrubbed",
  scrubEvent({ message: `Invite to ${ADDRESS} failed` }),
  { message: `Invite to ${EMAIL_REMOVED} failed` },
);
check(
  "logentry's message is scrubbed and its params are removed outright",
  scrubEvent({ logentry: { message: `Invite to ${ADDRESS} failed`, params: [ADDRESS] } }),
  { logentry: { message: `Invite to ${EMAIL_REMOVED} failed` } },
);
check(
  "the transaction name is scrubbed",
  scrubEvent({ transaction: `POST /invite/${INVITE_TOKEN}` }),
  { transaction: `POST /invite/${TOKEN_REMOVED}` },
);
check(
  "every exception value is scrubbed, and so is its type",
  scrubEvent({
    exception: {
      values: [
        { type: "Error", value: `no invitation for ${ADDRESS}` },
        { type: `Bad token: ${INVITE_TOKEN}`, value: `token ${INVITE_TOKEN}` },
      ],
    },
  }),
  {
    exception: {
      values: [
        { type: "Error", value: `no invitation for ${EMAIL_REMOVED}` },
        { type: `Bad token: ${TOKEN_REMOVED}`, value: `token ${TOKEN_REMOVED}` },
      ],
    },
  },
);
// The behaviour the line above USED to assert wrongly, now written down as its
// own case. A token with no separator in front of it makes one longer run of
// token characters, and the rule takes the whole run -- "Bad" included. That is
// the right direction to be wrong in: more is removed, never less. It is here
// so the next person meets it as a documented property rather than as a
// surprise in a diff.
check(
  "a token stuck straight onto a word takes the word with it, because it is all one run",
  scrubText(`Bad${INVITE_TOKEN}`),
  TOKEN_REMOVED,
);
check(
  "an event with nothing in it comes back with nothing in it",
  scrubEvent({}),
  {},
);

console.log("\nscrubEvent -- the fields that are removed whole");

check(
  "BREADCRUMBS GO, every one, whatever is in them",
  scrubEvent({
    message: "boom",
    breadcrumbs: [{ category: "ui.click", message: "Buy milk for Sandra" }],
  }),
  { message: "boom" },
);
check(
  "an empty breadcrumb list goes too, rather than being sent as an empty list",
  scrubEvent({ message: "boom", breadcrumbs: [] }),
  { message: "boom" },
);
check(
  "extra goes -- whoever captured the error chose what went in it",
  scrubEvent({ message: "boom", extra: { title: "Buy milk", email: ADDRESS } }),
  { message: "boom" },
);
check(
  "local variables go from every stack frame, and the rest of the frame stays",
  scrubEvent({
    exception: {
      values: [
        {
          value: "boom",
          stacktrace: {
            frames: [
              { filename: "page.tsx", lineno: 12, vars: { token: INVITE_TOKEN } },
              { filename: "actions.ts", lineno: 40 },
            ],
          },
        },
      ],
    },
  }),
  {
    exception: {
      values: [
        {
          value: "boom",
          stacktrace: {
            frames: [
              { filename: "page.tsx", lineno: 12 },
              { filename: "actions.ts", lineno: 40 },
            ],
          },
        },
      ],
    },
  },
);

console.log("\nscrubEvent -- the request");

check(
  "the url is kept and scrubbed; cookies, bodies and query strings are not kept at all",
  scrubEvent({
    request: {
      url: `https://example.com/invite/${INVITE_TOKEN}?problem=expired`,
      cookies: { "sb-access-token": JWT },
      data: { title: "Buy milk" },
      query_string: "problem=expired",
      method: "POST",
    },
  }),
  { request: { url: `https://example.com/invite/${TOKEN_REMOVED}${QUERY_REMOVED}` } },
);
check(
  "the user-agent is the ONE header kept -- it is where the browser and OS come from",
  scrubEvent({
    request: { url: "/tasks", headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0)" } },
  }),
  { request: { url: "/tasks", headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0)" } } },
);
check(
  "the same, lower-cased -- which is how the server's headersToDict spells it",
  scrubEvent({ request: { url: "/tasks", headers: { "user-agent": "curl/8.0" } } }),
  { request: { url: "/tasks", headers: { "user-agent": "curl/8.0" } } },
);
check(
  "THE COOKIE HEADER GOES, which is the session itself",
  scrubEvent({
    request: {
      url: "/tasks",
      headers: { cookie: `sb-access-token=${JWT}`, "User-Agent": "curl/8.0" },
    },
  }),
  { request: { url: "/tasks", headers: { "User-Agent": "curl/8.0" } } },
);
check(
  "so do Authorization and Referer",
  scrubEvent({
    request: {
      url: "/tasks",
      headers: { authorization: `Bearer ${JWT}`, referer: `/invite/${INVITE_TOKEN}` },
    },
  }),
  { request: { url: "/tasks" } },
);
check(
  "a request with nothing keepable in it is dropped rather than sent empty",
  scrubEvent({ message: "boom", request: { cookies: { a: "b" } } }),
  { message: "boom" },
);

console.log("\nscrubEvent -- the user");

check(
  "the id is kept",
  scrubEvent({ user: { id: USER_ID } }),
  { user: { id: USER_ID } },
);
check(
  "THE EMAIL, THE USERNAME AND THE IP ADDRESS ALL GO -- the id is the only field",
  scrubEvent({
    user: { id: USER_ID, email: ADDRESS, username: "alice", ip_address: "203.0.113.7" },
  }),
  { user: { id: USER_ID } },
);
check(
  "a user with no id is dropped, rather than sent as an address with no id",
  scrubEvent({ message: "boom", user: { email: ADDRESS } }),
  { message: "boom" },
);
check(
  "an empty id is no id",
  scrubEvent({ message: "boom", user: { id: "" } }),
  { message: "boom" },
);

console.log("\nscrubEvent -- the contexts");

check(
  "the browser and the operating system are kept: docs/plan.md allows both",
  scrubEvent({ contexts: { browser: { name: "Chrome" }, os: { name: "Windows" } } }),
  { contexts: { browser: { name: "Chrome" }, os: { name: "Windows" } } },
);
check(
  "the culture context goes -- the locale and timezone are not on the plan's list",
  scrubEvent({
    contexts: { browser: { name: "Chrome" }, culture: { locale: "en-GB", timezone: "Europe/London" } },
  }),
  { contexts: { browser: { name: "Chrome" } } },
);
check(
  "nextjs.request_path is treated as an address, because Next.js documents it as carrying the query string",
  scrubEvent({
    contexts: {
      nextjs: {
        request_path: `/invite/${INVITE_TOKEN}?problem=expired`,
        router_path: "/invite/[token]",
        route_type: "render",
      },
    },
  }),
  {
    contexts: {
      nextjs: {
        request_path: `/invite/${TOKEN_REMOVED}${QUERY_REMOVED}`,
        router_path: "/invite/[token]",
        route_type: "render",
      },
    },
  },
);

// ------------------------------------------------------------------- purity
//
// Two properties, and both are the reason this script can be trusted at all.
console.log("\nscrubEvent -- it is pure");

const original = {
  message: `Invite to ${ADDRESS} failed`,
  breadcrumbs: [{ message: "Buy milk" }],
  user: { id: USER_ID, email: ADDRESS },
  exception: { values: [{ value: `token ${INVITE_TOKEN}` }] },
};
const beforeJson = JSON.stringify(original);
const firstResult = scrubEvent(original);
const secondResult = scrubEvent(original);

check(
  "THE EVENT HANDED IN IS NOT CHANGED -- a new one is returned",
  JSON.stringify(original),
  beforeJson,
);
check(
  "the same event twice gives the same answer twice",
  firstResult,
  secondResult,
);
check(
  "and that answer has the address, the token and the breadcrumbs out of it",
  firstResult,
  {
    message: `Invite to ${EMAIL_REMOVED} failed`,
    user: { id: USER_ID },
    exception: { values: [{ value: `token ${TOKEN_REMOVED}` }] },
  },
);
check(
  "nothing but an object comes back as it went in",
  scrubEvent(null),
  null,
);

// ------------------------------------------------------------------- the score
const total = passed + failures.length;
console.log(`\n${passed} of ${total} checks passed.`);

if (failures.length > 0) {
  console.log(`\n${failures.length} FAILED:`);
  for (const name of failures) console.log(`  - ${name}`);
  console.log("");
  // `process.exitCode = 1` rather than `process.exit(1)`, which the other two
  // check scripts use. Not a style preference: this file loads the module with
  // a top-level `await import`, and on Windows calling process.exit() while
  // that is still unwinding crashed libuv -- "Assertion failed:
  // !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76" -- and
  // the shell saw 9 instead of 1. Setting the code and letting the process end
  // normally gives a plain 1 everywhere, which is what the CI job reads.
  process.exitCode = 1;
}

console.log("");
