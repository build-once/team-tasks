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
  DETAIL_REMOVED,
  EMAIL_REMOVED,
  FILE_NAME_REMOVED,
  INPUT_REMOVED,
  KEY_REMOVED,
  QUERY_REMOVED,
  TOKEN_REMOVED,
  VALUES_REMOVED,
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

check(
  "a failed-fetch message quoting a Supabase URL with a filter in it",
  scrubText(
    `TypeError: fetch failed for https://example.supabase.co/rest/v1/tasks?title=eq.Buy%20milk&apikey=sb_publishable_notarealkey123`,
  ),
  `TypeError: fetch failed for https://example.supabase.co/rest/v1/tasks?title=eq.Buy%20milk&apikey=${KEY_REMOVED}`,
);

// ------------------------------------- scrubText: a database error that quotes
//
// The coach's review of #160, point 1. The issue said "A raw database error
// message must not go out unscrubbed", and the first version of this file read
// that as "mask the address in it". That was too narrow, and the review showed
// why with a real message: Postgres quotes THE WHOLE ROW back at you, and most
// of a row is not address-shaped. Task text is not address-shaped. A team name
// is not address-shaped. A rule that only recognises shapes can never catch
// them.
//
// So the three constructs Postgres uses to quote data are matched STRUCTURALLY
// -- by the words around the values, not by what the values look like -- and
// everything inside them goes whatever shape it has.
console.log("\nscrubText -- a database error that quotes the data");

// Made up here. This is the kind of thing docs/plan.md's appendix means by
// "free text; people type anything": a task title with a third party's name in
// it, belonging to somebody who never agreed to anything.
const TASK_TEXT = "Call Dr Patel about results";

check(
  "FAILING ROW: the whole row goes, including task text that is no particular shape",
  scrubText(
    `new row for relation "tasks" violates check constraint "tasks_title_len" ` +
      `DETAIL: Failing row contains (${TEAM_ID}, ${TASK_TEXT}, f, 2026-10-06).`,
  ),
  `new row for relation "tasks" violates check constraint "tasks_title_len" ` +
    `DETAIL: ${DETAIL_REMOVED}`,
);
check(
  "the constraint name SURVIVES, because that is the part that says what went wrong",
  scrubText(
    `new row for relation "tasks" violates check constraint "tasks_title_len" ` +
      `DETAIL: Failing row contains (${TEAM_ID}, ${TASK_TEXT}, f, 2026-10-06).`,
  ).includes("tasks_title_len"),
  true,
);
check(
  "KEY=VALUE: the values go whatever shape they are -- the team id is not address-shaped either",
  scrubText(
    `duplicate key value violates unique constraint "invitations_one_pending_per_email" ` +
      `DETAIL: Key (team_id, email)=(${TEAM_ID}, ${ADDRESS}) already exists.`,
  ),
  `duplicate key value violates unique constraint "invitations_one_pending_per_email" ` +
    `DETAIL: ${DETAIL_REMOVED}`,
);
check(
  "a bare DETAIL with no construct in it goes too -- DETAIL is where Postgres puts the data",
  scrubText(`could not serialize access DETAIL: some row somebody typed`),
  `could not serialize access DETAIL: ${DETAIL_REMOVED}`,
);

// The two constructs on their own, with no DETAIL in front. They arrive this way
// in a PostgrestError's `details` field, which is a separate string from
// `message`.
check(
  "FAILING ROW standing alone, no DETAIL in front of it",
  scrubText(`Failing row contains (${TEAM_ID}, ${TASK_TEXT}, f, 2026-10-06).`),
  `Failing row contains (${VALUES_REMOVED}).`,
);
check(
  "KEY=VALUE standing alone keeps the COLUMN NAMES, which are schema rather than anybody's data",
  scrubText(`Key (team_id, email)=(${TEAM_ID}, ${ADDRESS}) already exists.`),
  `Key (team_id, email)=(${VALUES_REMOVED}) already exists.`,
);

// The two ways a shape-based rule gets fooled, and the reason these are matched
// structurally. Both of these are values a person can type into the task box.
check(
  "task text containing a BRACKET does not let the rest of the row escape",
  scrubText(`Failing row contains (${TEAM_ID}, Call Dr Patel (urgent) today, f, 2026-10-06).`),
  `Failing row contains (${VALUES_REMOVED}).`,
);
check(
  "task text containing a NEWLINE does not let the rest of the row escape",
  scrubText(`Failing row contains (${TEAM_ID}, line one\nline two, f, 2026-10-06).`),
  `Failing row contains (${VALUES_REMOVED}).`,
);
check(
  "a DETAIL spanning lines goes to the end, not to the end of the first line",
  scrubText(`boom\nDETAIL: Failing row contains (${TEAM_ID}, ${TASK_TEXT},\nf, 2026-10-06).`),
  `boom\nDETAIL: ${DETAIL_REMOVED}`,
);

// ---- invalid input syntax -------------------------------------------------
//
// The third construct Postgres uses to quote data, and the one the review's
// three did not cover. It happens whenever a value fails to parse into its
// column's type -- a `?filter=` that is not a uuid, a date somebody typed -- and
// it puts THE INPUT in quotes:
//
//     invalid input syntax for type uuid: "not-a-uuid"
//
// Reachable from this app without anybody doing anything unusual: `readFilter`
// in web/src/lib/tasks.ts only lets a uuid-shaped `?filter=` through, but any
// other value Postgres is asked to parse -- a timestamp, an integer -- arrives
// here the same way. The input is whatever was typed, so it has no shape.
console.log("\nscrubText -- invalid input syntax, which quotes the input");

check(
  "INVALID INPUT SYNTAX: the quoted input goes",
  scrubText(`invalid input syntax for type uuid: "not-a-real-uuid"`),
  `invalid input syntax for type uuid: "${INPUT_REMOVED}"`,
);
check(
  "the TYPE NAME survives: it says which column refused the value, and it is schema",
  scrubText(`invalid input syntax for type uuid: "not-a-real-uuid"`).includes("uuid"),
  true,
);
check(
  "a type name with spaces in it is read whole",
  scrubText(`invalid input syntax for type timestamp with time zone: "yesterday afternoon"`),
  `invalid input syntax for type timestamp with time zone: "${INPUT_REMOVED}"`,
);
check(
  "an address as the input goes, like anything else quoted there",
  scrubText(`invalid input syntax for type uuid: "${ADDRESS}"`),
  `invalid input syntax for type uuid: "${INPUT_REMOVED}"`,
);
check(
  "task text as the input goes -- it is no particular shape, which is the whole point",
  scrubText(`invalid input syntax for type integer: "${TASK_TEXT}"`),
  `invalid input syntax for type integer: "${INPUT_REMOVED}"`,
);
check(
  "an input containing a QUOTE does not let the rest escape",
  scrubText(`invalid input syntax for type uuid: "he said "hello" loudly"`),
  `invalid input syntax for type uuid: "${INPUT_REMOVED}"`,
);
check(
  "an input containing a NEWLINE does not let the rest escape",
  scrubText(`invalid input syntax for type uuid: "line one\nline two"`),
  `invalid input syntax for type uuid: "${INPUT_REMOVED}"`,
);
check(
  "the message with its surrounding sentence: only the quoted input goes",
  scrubText(`Bad Request: invalid input syntax for type uuid: "oops" (code 22P02)`),
  `Bad Request: invalid input syntax for type uuid: "${INPUT_REMOVED}" (code 22P02)`,
);
check(
  "scrubbing an invalid-input message twice changes nothing the second time",
  scrubText(scrubText(`invalid input syntax for type uuid: "${ADDRESS}"`)),
  scrubText(`invalid input syntax for type uuid: "${ADDRESS}"`),
);
check(
  "prose that merely says the words, with nothing quoted, is left alone",
  scrubText("The invalid input syntax for type names is documented upstream."),
  "The invalid input syntax for type names is documented upstream.",
);

check(
  "scrubbing a database error twice changes nothing the second time",
  scrubText(
    scrubText(`new row for relation "tasks" violates check "c" DETAIL: Failing row contains (${TASK_TEXT}).`),
  ),
  scrubText(`new row for relation "tasks" violates check "c" DETAIL: Failing row contains (${TASK_TEXT}).`),
);
check(
  "ordinary prose that merely mentions a key is left alone -- these rules do not reach past their words",
  scrubText("The key to this is the detail nobody read."),
  "The key to this is the detail nobody read.",
);

// -------------------------------------- scrubText: a URL-encoded address
//
// The coach's review of #160, point 2. An address that has been through a URL
// has `%40` where its `@` was, and the address rule looks for a literal `@`, so
// it went straight through. This is not a hypothetical: every address this app
// sends to Supabase travels in a query string, and a failed-fetch message
// quotes the URL it called.
console.log("\nscrubText -- a URL-encoded address");

check(
  "a %40 address goes, like a plain one",
  scrubText("raj%40example.com"),
  EMAIL_REMOVED,
);
// The realistic one: this is the shape a Supabase filter actually has, and the
// shape a failed `fetch` quotes back.
//
// NOTE WHERE THE PLACEHOLDER STARTS. PostgREST's `eq.` operator prefix is
// consumed along with the address, because `eq.raj` is indistinguishable from
// the local part of a real address -- `eq.raj@example.com` would be a perfectly
// valid one. So three characters of query syntax are lost with it. That is the
// safe direction and the check records it rather than contorting the input to
// avoid it: this expectation was written the other way first and the function
// removed MORE than expected, not less.
check(
  "a %40 address inside a Supabase filter goes, taking the eq. prefix with it",
  scrubText("fetch failed: /rest/v1/invitations?email=eq.raj%40example.com"),
  `fetch failed: /rest/v1/invitations?email=${EMAIL_REMOVED}`,
);
check(
  "a plus-addressed %40 address goes whole, plus and all",
  scrubText("teamtasks.staging.test%2Balice%40example.com"),
  EMAIL_REMOVED,
);
check(
  "a %40 address with a multi-part domain goes",
  scrubText("bob%40mail.example.co.uk"),
  EMAIL_REMOVED,
);
check(
  "a bare %40 with nothing around it is not an address and is left alone",
  scrubText("100%40"),
  "100%40",
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

// ------------------------------------------ scrubText: a stored file's name
//
// Build it 23 part 2, issue #242. docs/plan.md puts a file name on the list of
// things that must never reach an error report: "A file name is exactly that
// kind of free text -- somebody's phone chose it, or somebody typed it, and
// `scan-of-the-letter-from-my-doctor.pdf` is a sentence about a person."
//
// WHAT THESE CHECKS ARE ABOUT, which is not quite what the other rules' are.
// The plan is explicit that the primary defence is this app's own code: "So the
// rule is on this app's own code, not on the scrub: a storage error is reported
// with its code and the operation, never with the path or the name."
// web/src/lib/attachment-store.ts and web/src/app/tasks/AttachFile.tsx are that
// code, and neither logs, throws or reports a path -- both read a status and an
// error code and nothing else.
//
// THIS RULE IS THE NET UNDER CODE THIS APP DID NOT WRITE: the Supabase client's
// own error messages, and a failed `fetch` quoting the URL it called. It works
// where a shape rule normally cannot because it does not match the NAME, which
// has no shape -- it matches the PATH, `<task id>/<file name>`, which is a
// construct in the same way `DETAIL:` is.
console.log("\nscrubText -- a stored file's path, which carries somebody's file name");

// A file name that is a sentence about a person, which is the plan's own
// example of why this is not a shape problem. Invented here, like everything
// else in this file.
const TELLING_NAME = "scan-of-the-letter-from-my-doctor.pdf";

check(
  "A STORED OBJECT'S PATH: the task id stays, the file name goes",
  scrubText(`${TEAM_ID}/${TELLING_NAME}`),
  `${TEAM_ID}/${FILE_NAME_REMOVED}`,
);
check(
  "with the bucket in front of it, which is schema and stays",
  scrubText(`attachments/${TEAM_ID}/${TELLING_NAME}`),
  `attachments/${TEAM_ID}/${FILE_NAME_REMOVED}`,
);
check(
  "A NAME WITH SPACES IN IT, which is an ordinary file name and not an edge case",
  scrubText(`${TEAM_ID}/my holiday photo.jpg`),
  `${TEAM_ID}/${FILE_NAME_REMOVED}`,
);
check(
  "a name that is itself an address: it goes with the rest of the name, before the address rule ever sees it",
  scrubText(`${TEAM_ID}/${ADDRESS}.pdf`),
  `${TEAM_ID}/${FILE_NAME_REMOVED}`,
);
check(
  "A STORAGE URL: the host and the endpoint stay, the path goes",
  scrubText(
    `fetch failed: https://example.supabase.co/storage/v1/object/attachments/${TEAM_ID}/${TELLING_NAME}`,
  ),
  `fetch failed: https://example.supabase.co/storage/v1/object/attachments/${TEAM_ID}/${FILE_NAME_REMOVED}`,
);
check(
  "inside a JSON body, where it stops at the closing quote and the rest of the body survives",
  scrubText(`{"name":"${TEAM_ID}/${TELLING_NAME}","size":1234}`),
  `{"name":"${TEAM_ID}/${FILE_NAME_REMOVED}","size":1234}`,
);
check(
  "inside brackets, where it stops at the closing bracket",
  scrubText(`removed (${TEAM_ID}/${TELLING_NAME}) from the bucket`),
  `removed (${TEAM_ID}/${FILE_NAME_REMOVED}) from the bucket`,
);
check(
  "a CAPITALISED task id is still a task id -- Storage is not asked to agree about case",
  scrubText(`${TEAM_ID.toUpperCase()}/${TELLING_NAME}`),
  `${TEAM_ID.toUpperCase()}/${FILE_NAME_REMOVED}`,
);
// TWO PATHS IN ONE BARE SENTENCE: the first match runs to the end of the line,
// so it takes the second with it. Both names are gone, which is the only thing
// that matters, and the second task id goes too -- which is a small loss of the
// useful half. The expectation here records what the rule DOES rather than what
// would be tidiest, because the alternative is a rule that stops at a space and
// leaks every file name with a space in it.
check(
  "two paths in one bare sentence: the first match takes the second with it, so both names go",
  scrubText(`${TEAM_ID}/one.png and ${USER_ID}/two.pdf`),
  `${TEAM_ID}/${FILE_NAME_REMOVED}`,
);
check(
  "two paths in a JSON body, where the quotes keep them apart, and BOTH task ids survive",
  scrubText(`{"a":"${TEAM_ID}/one.png","b":"${USER_ID}/two.pdf"}`),
  `{"a":"${TEAM_ID}/${FILE_NAME_REMOVED}","b":"${USER_ID}/${FILE_NAME_REMOVED}"}`,
);

// ---- and the things it must NOT reach -----------------------------------
//
// A uuid on its own is most of what makes a report useful -- "which task" --
// and the whole reason the 40-character rule below is set where it is. This
// rule must not undo that.
check(
  "A BARE TASK ID IS LEFT ALONE: nothing follows it, so there is no name to remove",
  scrubText(`task ${TEAM_ID} could not be deleted`),
  `task ${TEAM_ID} could not be deleted`,
);
check(
  "a task id at the very end of a message is left alone",
  scrubText(`refused for ${TEAM_ID}`),
  `refused for ${TEAM_ID}`,
);
check(
  "a task id with a slash and NOTHING after it is left alone -- an empty name is not a name",
  scrubText(`${TEAM_ID}/`),
  `${TEAM_ID}/`,
);
check(
  "a path in the middle of an ordinary sentence about a team keeps the team id",
  scrubText(`/rest/v1/tasks?id=eq.${TEAM_ID}`),
  `/rest/v1/tasks?id=eq.${TEAM_ID}`,
);
check(
  "something that is nearly a uuid is not one, so nothing is removed",
  scrubText("abcd-1234/photo.jpg"),
  "abcd-1234/photo.jpg",
);

// ---- what it costs, recorded rather than avoided -------------------------
//
// The rule runs to a quote, a bracket or a newline, NOT to whitespace, because a
// file name can contain a space. So a path in the middle of a bare sentence
// takes the rest of the sentence with it. That is the direction worth being
// wrong in -- more is removed, never less -- and it is written down as a check
// so nobody meets it as a surprise.
check(
  "OVER-REACH, ON PURPOSE: a path in a bare sentence takes the rest of the sentence",
  scrubText(`could not upload ${TEAM_ID}/photo.jpg to the bucket`),
  `could not upload ${TEAM_ID}/${FILE_NAME_REMOVED}`,
);
check(
  "a newline ends it, so only one line is lost",
  scrubText(`could not upload ${TEAM_ID}/photo.jpg\nTry again.`),
  `could not upload ${TEAM_ID}/${FILE_NAME_REMOVED}\nTry again.`,
);

check(
  "scrubbing a path twice changes nothing the second time",
  scrubText(scrubText(`${TEAM_ID}/${TELLING_NAME}`)),
  scrubText(`${TEAM_ID}/${TELLING_NAME}`),
);
// AND THE PLACEHOLDER ITSELF SURVIVES A SECOND PASS, which is what idempotence
// rests on here: `[file name removed]` contains a space and a bracket but no
// uuid-then-slash, so the rule cannot match its own output.
check(
  "the placeholder is not itself a path, so a third pass changes nothing either",
  scrubText(`${TEAM_ID}/${FILE_NAME_REMOVED}`),
  `${TEAM_ID}/${FILE_NAME_REMOVED}`,
);

// ---- through scrubEvent, which is the only route anything really takes ----
console.log("\nscrubEvent -- a file's name, by every route into an event");

check(
  "a path in the message",
  scrubEvent({ message: `Storage refused ${TEAM_ID}/${TELLING_NAME}` }),
  { message: `Storage refused ${TEAM_ID}/${FILE_NAME_REMOVED}` },
);
check(
  "a path in an exception value, which is where a client's own error arrives",
  scrubEvent({
    exception: {
      values: [{ type: "StorageApiError", value: `new row violates row-level security policy for ${TEAM_ID}/${TELLING_NAME}` }],
    },
  }),
  {
    exception: {
      values: [{ type: "StorageApiError", value: `new row violates row-level security policy for ${TEAM_ID}/${FILE_NAME_REMOVED}` }],
    },
  },
);
check(
  "a path in request.url, which is where a failed fetch puts it",
  scrubEvent({
    request: {
      url: `https://example.supabase.co/storage/v1/object/attachments/${TEAM_ID}/${TELLING_NAME}`,
    },
  }),
  {
    request: {
      url: `https://example.supabase.co/storage/v1/object/attachments/${TEAM_ID}/${FILE_NAME_REMOVED}`,
    },
  },
);
check(
  "a path in a tag value",
  scrubEvent({ tags: { where: `${TEAM_ID}/${TELLING_NAME}` } }),
  { tags: { where: `${TEAM_ID}/${FILE_NAME_REMOVED}` } },
);
// A DATABASE ERROR ABOUT A FILE goes through the DETAIL rule first and loses the
// whole lot, which is the stronger answer and worth having a check for: the two
// rules do not fight.
check(
  "and a Postgres error quoting a path loses it to the DETAIL rule first",
  scrubText(
    `null value in column "name" violates not-null constraint\nDETAIL: Failing row contains (${TEAM_ID}/${TELLING_NAME}).`,
  ),
  `null value in column "name" violates not-null constraint\nDETAIL: ${DETAIL_REMOVED}`,
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
// The coach's review of #160, point 3. `contexts` used to be a DENY-list: drop
// `culture`, keep the rest. So an unknown context went straight through -- the
// review got `state: {team: "Acme"}` out the other side, a team name, which
// docs/plan.md's appendix lists as personal data. A deny-list cannot be right
// here, because the list of things Sentry might add is not ours to know.
//
// It is now an ALLOW-LIST of the three the plan permits, and the plan's words
// are the whole argument: it allows "browser and operating-system details" and
// nothing else about the machine.
check(
  "the runtime is kept as well: which Node version is an operating-system detail",
  scrubEvent({ contexts: { runtime: { name: "node", version: "v22.22.2" } } }),
  { contexts: { runtime: { name: "node", version: "v22.22.2" } } },
);
check(
  "AN UNKNOWN CONTEXT IS DROPPED -- this is the one the review got through, carrying a team name",
  scrubEvent({
    contexts: { browser: { name: "Chrome" }, state: { team: "Acme" } },
  }),
  { contexts: { browser: { name: "Chrome" } } },
);
check(
  "the device context is dropped: the plan does not ask for the machine's model or memory",
  scrubEvent({ contexts: { device: { model: "iPhone", memory_size: 4000000000 } } }),
  { contexts: {} },
);
check(
  "the trace context is dropped: tracing is off, and a trace id is not on the plan's list",
  scrubEvent({ contexts: { trace: { trace_id: "abc", span_id: "def" } } }),
  { contexts: {} },
);
check(
  "THE NEXTJS CONTEXT IS DROPPED TOO, request_path and all",
  scrubEvent({
    contexts: {
      nextjs: {
        request_path: `/invite/${INVITE_TOKEN}?problem=expired`,
        router_path: "/invite/[token]",
        route_type: "render",
      },
    },
  }),
  { contexts: {} },
);
check(
  "an app context is dropped: Sentry's own build metadata is not asked for either",
  scrubEvent({ contexts: { app: { app_start_time: "2026-10-06" }, os: { name: "Windows" } } }),
  { contexts: { os: { name: "Windows" } } },
);

// ---------------------------------------- scrubEvent: tags and fingerprint
//
// The coach's review of #160, point 4. Both are set only by this app today --
// `deployment` and `runtime` in the three init files -- so the risk is low. It
// is also nearly free to close, and "only this app sets them" is a fact about
// today rather than a property of the code.
console.log("\nscrubEvent -- tags and fingerprint");

check(
  "a tag VALUE holding an address is scrubbed",
  scrubEvent({ tags: { deployment: "preview", who: ADDRESS } }),
  { tags: { deployment: "preview", who: EMAIL_REMOVED } },
);
check(
  "a tag value holding a token is scrubbed",
  scrubEvent({ tags: { link: `/invite/${INVITE_TOKEN}` } }),
  { tags: { link: `/invite/${TOKEN_REMOVED}` } },
);
check(
  "tag values that are not strings are left exactly as they are",
  scrubEvent({ tags: { count: 3, ok: false, nothing: null } }),
  { tags: { count: 3, ok: false, nothing: null } },
);
check(
  "every fingerprint entry is scrubbed",
  scrubEvent({ fingerprint: ["{{ default }}", ADDRESS, `tok-${INVITE_TOKEN}`] }),
  { fingerprint: ["{{ default }}", EMAIL_REMOVED, TOKEN_REMOVED] },
);
check(
  "a fingerprint entry that is not a string is left alone",
  scrubEvent({ fingerprint: ["{{ default }}", 7] }),
  { fingerprint: ["{{ default }}", 7] },
);
check(
  "a database error in a tag value loses the quoted row as well",
  scrubEvent({ tags: { why: `DETAIL: Failing row contains (${TASK_TEXT})` } }),
  { tags: { why: `DETAIL: ${DETAIL_REMOVED}` } },
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
