#!/usr/bin/env node
// build-it-18-invitation-status-checks.mjs -- does the DEPLOYED invite-member
// write down what happened to an invitation's email, and does the owner's own
// read see it? Run against STAGING only.
//
// Build it 18 part 2b, issue #166.
//
// WHAT IT IS FOR, AND WHY IT HAS TO BE RUN TWICE. PR #165 put two columns on
// `invitations` and nothing that writes them. This branch makes invite-member
// write them: 'queued' when the row is made, then 'sent', or 'failed' with one of
// four codes. NOTHING IS DEPLOYED BY THIS BRANCH -- the assistant deploys nothing
// anywhere, and `supabase functions deploy` against staging is the owner's step
// (rule 19). So this script is written to be run:
//
//   * BEFORE the deploy, where it MUST FAIL. The function that is live is the one
//     from before this change: it answers 201 with no `status` field at all and
//     leaves the row at the migration's default 'queued'. The failures that run
//     reports are the evidence that the behaviour was not there yet;
//   * AFTER the deploy, where it must pass.
//
// A single green run proves nothing about the deploy, because a check that was
// always green would look exactly the same. The PAIR is the evidence.
//
// WHAT IT CREATES, AND WHAT IT CANNOT TAKE BACK. One invitation, to ONE FIXED
// plus-address of the staging test mailbox, and never a fresh address per run.
// That is the same decision web/tests/staging.mjs made for its own address, for
// the same reason, and the reason is worth repeating here because it is the one
// thing about this script that cannot be tidied:
//
//   THE ROW CANNOT BE DELETED FROM HERE. public.invitations has one policy, for
//   select, and no delete policy at all -- so a caller holding the publishable
//   key cannot remove an invitation, whoever they are. Nothing in this repository
//   can. ISSUE #166 ASKS THAT THIS SCRIPT "creates and removes its own rows", AND
//   THE SECOND HALF IS NOT POSSIBLE: the only thing that can remove the row is
//   the owner, in the staging SQL editor, and the exact statement is printed at
//   the end of every run and repeated at the bottom of this file. Issue #171
//   holds the wider question -- there is no way to delete an invitation anywhere
//   in this project, which is a privacy gap as well as an inconvenience here.
//
// What a fixed address buys instead is that the footprint never grows: run this
// fifty times and there is still one row, because every run after the first one
// either sends it again or is refused by the partial unique index. One pending
// slot out of the team's twenty, not fifty.
//
// WHAT IT CANNOT ASK, so that nobody reads a green run as more than it is
// (AGENTS.md rule 8):
//
//   * THE 'failed' PATH. A row only says 'failed' when the email service refuses,
//     cannot be reached, or answers without confirming -- and none of those can be
//     brought about from here. Staging redirects all invitation mail to the test
//     inbox, so the address this script sends to is one the service accepts; the
//     settings that would produce `not_configured` are function secrets, and
//     changing them would be changing staging to suit a test. So this run reports
//     that path UNVERIFIED with the reason, every time, and it is
//     supabase/functions/_tests/invitation_status_test.ts that proves what the
//     function builds for each of the four codes.
//   * WHETHER ANY MAIL ACTUALLY ARRIVED. The service reporting a send is not a
//     delivery. The test mailbox is the only place that answers that, and the
//     script says so rather than implying otherwise.
//   * ANYTHING ABOUT PRODUCTION. It refuses to run against anything but the
//     staging host, before it reads a password.
//
// IT CAN FAIL, which is the only reason to trust it passing. Every judgement is a
// pure function, and `--selftest` feeds those functions fabricated answers -- the
// pre-change function's 201 with no status, an answer that says 'sent' over a row
// that says 'queued', a second call that sends a SECOND email to an address that
// already has one, a body carrying the email service's own complaint -- and
// checks each one comes out FAIL. That run needs no network, no account and no
// staging project:
//
//   node scripts/staging/build-it-18-invitation-status-checks.mjs --selftest
//
// NOTHING RUNS THAT SELFTEST AUTOMATICALLY. .github/workflows/ci.yml's
// `staging-script-selftests` job names two scripts by path and this is not one of
// them, and issue #166 says not to change that workflow beyond test counts. Filed
// as issue #167 together with the Deno test file, which CI does not run either.
//
// NO PACKAGES. Node built-ins only -- global fetch, node:fs, node:path, node:url
// -- so Node 18 or newer. The endpoints are the ones the four scripts beside this
// one use:
//
//   POST   {url}/auth/v1/token?grant_type=password   body {email,password}
//   POST   {url}/auth/v1/logout?scope=global
//   POST   {url}/functions/v1/invite-member
//   GET    {url}/rest/v1/{relation}?select=a,b&col=eq.value
//   the API key travels in the `apikey` header; Authorization carries the
//          caller's JWT.
//
// WHAT IT NEVER PRINTS: a password, an access or refresh token, the publishable
// key, the project URL, a user id, or an email address -- not Alice's, and not the
// plus-address it invites, even though docs/environments.md publishes both. Every
// response body goes through scrub() first, which replaces both of those and every
// token this script holds with a placeholder. What does get printed: HTTP statuses,
// the three status words, the four failure codes, the fixed wording the function
// produces, and the team id you passed in.
//
// Run it from the repository root. See the bottom of this file.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The staging project's reference, and the exact host it is served at. This
// script may run against NOTHING ELSE. AGENTS.md rules 1 and 10.
//
// The HOST is what the guard decides on. `url.includes(STAGING_REF)` is not good
// enough and that is not a theory: it accepted a stand-in server at
// `http://127.0.0.1:8799/ghskxrhqlhvrhpnivqbd` in the coach's review of PR #115,
// and the script then sent two passwords to it. judgeStagingUrl below is
// build-it-16-suspend-checks.mjs's, unchanged.
const STAGING_REF = "ghskxrhqlhvrhpnivqbd";
const STAGING_HOST = `${STAGING_REF}.supabase.co`;

const UUID_CHARS =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const UUID_PATTERN = new RegExp(`^${UUID_CHARS}$`);

// ONE fixed address, a plus-address of the staging test mailbox, and deliberately
// NOT the one web/tests/access-rules.test.mjs uses: that file's row is its own
// evidence and this script must not send a second email for it or move its status.
//
// docs/environments.md publishes the mailbox on purpose. It still never reaches a
// printed line here -- see scrub() -- because "this address belongs to the owner"
// is a fact about today, and a script that prints whatever address it was given is
// a script that prints a real one the day somebody runs it differently.
const INVITE_ADDRESS = "teamtasks.staging.test+bi18-status@gmail.com";

// The three words a status may hold and the four codes, copied from
// 20261006095847_invitation_status.sql's two check constraints -- not remembered.
const STATUSES = ["queued", "sent", "failed"];
const FAILURE_CODES = ["not_configured", "unreachable", "refused", "unconfirmed"];

// How long a 'queued' row may sit before the function will send it again.
//
// Copied from supabase/functions/invite-member/index.ts, STALE_QUEUED_MINUTES,
// which carries the argument for the number and is the copy that decides. This one
// is here so the script can work out which answer to EXPECT from a row it finds,
// rather than accepting whichever answer arrives.
const STALE_QUEUED_MINUTES = 15;

// The refusal issue #166 requires to be unchanged, written out here character for
// character. This is the script's own statement of the contract: reading it out of
// the function would make the two agree however the function changed.
const UNCHANGED_409 = "That person already has an invitation waiting for this team.";
const UNIQUE_VIOLATION = "23505";

// A refusal body is short. 400 characters is generous -- the longest platform
// refusal seen in this project is `{"code":"UNAUTHORIZED_NO_AUTH_HEADER"}`.
const MAX_REFUSAL_BODY = 400;

// What the email service's own reply looks like, in fragments. None of these may
// appear in anything the function answers: docs/plan.md's reason is that a reply
// "can quote the address, the subject and the message".
const SERVICE_FRAGMENTS = [
  "resend",
  "validation_error",
  "statusCode",
  "api.resend.com",
];

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(HERE, "..", "..", "web", ".env.local");

function die(message) {
  console.error(`\nREFUSING TO RUN: ${message}\n`);
  process.exit(1);
}

const PASS = "PASS";
const FAIL = "FAIL";
const UNVERIFIED = "UNVERIFIED";

// ---------------------------------------------------------------------------
// The judgements -- pure functions, which is what --selftest exercises
// ---------------------------------------------------------------------------
//
// Every one takes what came back and returns a list of
// { what, verdict, detail }. None sends a request, reads a file or looks at the
// environment.
//
// "UNVERIFIED" is for an answer that does not settle the question -- a request
// that never arrived, a sign-in that failed, a path this run could not reach.
// AGENTS.md rule 8: that is not a pass.

// Is this URL the staging project, and nothing else? Four requirements: https, the
// host EXACTLY equal to STAGING_HOST, no user name or password in the URL itself,
// and the default port. A detail line never contains the URL, because a project
// reference identifies an environment.
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

// The control: Alice reads the team she owns. If this fails, nothing else in the
// run means what it looks like -- a refusal everywhere is not evidence about
// status, it is evidence the project is shut.
function judgeAliceReadsHerTeam(read, teamId, aliceId) {
  const what = "Alice, the team's owner, can read the team she owns";
  if (read.error) return [{ what, verdict: UNVERIFIED, detail: read.error }];
  if (read.rows.length === 1 && read.rows[0].owner_id === aliceId) {
    return [
      {
        what,
        verdict: PASS,
        detail: `1 row for ${teamId}, and its owner_id is Alice -- the owner's reads work`,
      },
    ];
  }
  return [
    {
      what,
      verdict: read.rows.length === 0 ? FAIL : UNVERIFIED,
      detail:
        read.rows.length === 0
          ? `0 rows for ${teamId}. Either ALICE_TEAM_ID is wrong or Alice cannot read her own` +
            ` team -- and if it is the second, nothing else in this run says anything`
          : `${read.rows.length} row(s) came back and none is a team Alice owns, so this control` +
            ` proves nothing`,
    },
  ];
}

// Can the owner read the two columns at all, through the policy that was already
// there? This is the screen's whole data source, and it is a separate question
// from whether anything writes them.
//
// `read` is a PostgREST answer for the invitation row. A column that does not
// exist makes PostgREST refuse the whole request with 42703, which arrives here as
// read.error -- so this check tells "the migration is not on this project" apart
// from "the function does not write them".
function judgeOwnerCanReadTheColumns(read) {
  const what = "the team's owner can read status and failure_code on her own team's invitation";
  if (read.error) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `the read failed: ${read.error}. If it names 42703 or an unknown column, the migration` +
          ` 20261006095847_invitation_status.sql is not applied to this project, and nothing else` +
          ` in this run can mean anything`,
      },
    ];
  }
  if (read.rows.length === 0) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail:
          "no invitation row came back, so there was nothing to read the columns off. Either the" +
          " invitation has not been created yet or the owner cannot see it",
      },
    ];
  }
  const row = read.rows[0];
  const missing = ["status", "failure_code", "created_at"].filter(
    (column) => !(column in row),
  );
  if (missing.length > 0) {
    return [
      {
        what,
        verdict: FAIL,
        detail: `the row came back without: ${missing.join(", ")}`,
      },
    ];
  }
  if (!STATUSES.includes(row.status)) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `status is ${JSON.stringify(row.status)}, which is not one of ${STATUSES.join(", ")} --` +
          ` the check constraint should have made that impossible`,
      },
    ];
  }
  return [
    {
      what,
      verdict: PASS,
      detail: `status "${row.status}", failure_code ${JSON.stringify(row.failure_code)}`,
    },
  ];
}

// Which answer should the first call get, given the row that is already there?
//
// This is the script's copy of the function's own `retryVerdict`, and it exists so
// a run judges the answer it SHOULD have got rather than accepting whichever one
// arrived. `before` is the row read before the call, or null when there is none.
function expectedOutcome(before, nowMs) {
  if (!before) return "send";
  if (before.status === "failed") return "send";
  if (before.status === "sent") return "already-sent";
  if (before.status === "queued") {
    const createdAt = Date.parse(before.created_at ?? "");
    if (Number.isNaN(createdAt)) return "still-sending";
    return nowMs - createdAt >= STALE_QUEUED_MINUTES * 60_000 ? "send" : "still-sending";
  }
  // Not one of the three words. The function refuses with the unchanged 409.
  return "already-sent";
}

// A call that should have sent an email. Three judgements on one answer, because
// they fail independently and one verdict would hide which did.
//
// `answer` is { status, body } or { error }; `row` is the invitation read back
// AFTER the call, as { rows } or { error }.
function judgeSendRecorded(answer, row) {
  const statusCheck = "the call that should send answers 201 and reports a status";
  const rowCheck = "the row itself says 'sent', with no failure code";
  const agreeCheck = "what the function answered and what the row says are the same thing";

  if (answer.error) {
    return [statusCheck, rowCheck, agreeCheck].map((what) => ({
      what,
      verdict: UNVERIFIED,
      detail: answer.error,
    }));
  }

  const body = answer.body ?? "";
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }
  const invitation =
    parsed && typeof parsed === "object" && parsed.invitation && typeof parsed.invitation === "object"
      ? parsed.invitation
      : null;
  const answeredStatus = invitation ? invitation.status : undefined;

  const results = [];

  // ---- the answer ----
  if (answer.status !== 201) {
    const detail = {
      409: `HTTP 409 -- the insert hit the unique index and the function refused instead of sending. If the body carries "${UNCHANGED_409}" the row was already there and already sent, and this run cannot exercise a send: look at the pre-read printed above`,
      403: "HTTP 403 -- a refusal. Either Alice does not own ALICE_TEAM_ID, or her account is suspended",
      503: "HTTP 503 -- this environment is not allowed to send invitation email, so the function created nothing. Check the staging function secrets; nothing about status was tested",
      502: "HTTP 502 -- the email service did not accept the message. That is the 'failed' path, judged separately below; nothing about the 'sent' path was tested",
      500: "HTTP 500 -- a failure rather than a refusal. Read the body",
      401: "HTTP 401 -- Alice's own token was refused, so nothing was tested",
    }[answer.status];
    results.push({
      what: statusCheck,
      verdict: answer.status === 403 || answer.status === 409 ? FAIL : UNVERIFIED,
      detail: detail ?? `HTTP ${answer.status} -- body: ${body}`,
    });
  } else if (answeredStatus === undefined) {
    // THE PRE-DEPLOY ANSWER. The function from before this change answers 201 with
    // { invitation: { id, email, expires_at } } and no status at all.
    results.push({
      what: statusCheck,
      verdict: FAIL,
      detail:
        "HTTP 201, and the body carries no invitation.status. That is the function from BEFORE" +
        " issue #166: it answers 201 and says nothing about what happened to the email. This is" +
        " the failure a run before the deploy is supposed to report",
    });
  } else if (answeredStatus === "sent") {
    results.push({
      what: statusCheck,
      verdict: PASS,
      detail: `HTTP 201, invitation.status "sent", retried ${JSON.stringify(parsed.retried)}`,
    });
  } else if (answeredStatus === "queued") {
    results.push({
      what: statusCheck,
      verdict: FAIL,
      detail:
        'HTTP 201 with invitation.status "queued": the function is saying the email went and that' +
        " it could not write that down. The answer is honest and the status write is broken --" +
        " look at the function's logs for the line about the status not being written",
    });
  } else {
    results.push({
      what: statusCheck,
      verdict: FAIL,
      detail: `HTTP 201 with invitation.status ${JSON.stringify(answeredStatus)}, which is not one of ${STATUSES.join(", ")}`,
    });
  }

  // ---- the row ----
  if (row.error) {
    results.push({ what: rowCheck, verdict: UNVERIFIED, detail: row.error });
  } else if (row.rows.length !== 1) {
    results.push({
      what: rowCheck,
      verdict: row.rows.length === 0 ? FAIL : UNVERIFIED,
      detail:
        row.rows.length === 0
          ? "no pending invitation for that address came back after the call. Either nothing was" +
            " created, or the old function deleted it because the send failed"
          : `${row.rows.length} pending rows for one address and team, which the partial unique index should make impossible`,
    });
  } else if (row.rows[0].status === "sent" && row.rows[0].failure_code === "") {
    results.push({
      what: rowCheck,
      verdict: PASS,
      detail: 'status "sent", failure_code "" -- written by the function, not by the migration',
    });
  } else if (row.rows[0].status === "queued") {
    results.push({
      what: rowCheck,
      verdict: FAIL,
      detail:
        'the row still says "queued" after a call that should have sent. Before the deploy that is' +
        " exactly what to expect: the live function never writes the column, so the row keeps the" +
        " migration's default",
    });
  } else {
    results.push({
      what: rowCheck,
      verdict: FAIL,
      detail: `status ${JSON.stringify(row.rows[0].status)}, failure_code ${JSON.stringify(row.rows[0].failure_code)}`,
    });
  }

  // ---- do the two agree? ----
  //
  // THE CHECK ISSUE #166 ASKS FOR IN SO MANY WORDS: "it never says sent when the
  // row says failed". Compared rather than each being checked against 'sent', so a
  // pair that is wrong in the same direction is still caught.
  if (answer.status !== 201 || row.error || row.rows.length !== 1) {
    results.push({
      what: agreeCheck,
      verdict: UNVERIFIED,
      detail: "there is not both an answer and a row to compare",
    });
  } else if (answeredStatus === undefined) {
    results.push({
      what: agreeCheck,
      verdict: UNVERIFIED,
      detail: "the answer carries no status, so there is nothing to compare the row with",
    });
  } else if (answeredStatus === row.rows[0].status) {
    results.push({
      what: agreeCheck,
      verdict: PASS,
      detail: `both say "${answeredStatus}"`,
    });
  } else {
    results.push({
      what: agreeCheck,
      verdict: FAIL,
      detail:
        `THE FUNCTION SAID "${answeredStatus}" AND THE ROW SAYS "${row.rows[0].status}". The owner` +
        ` is being told one thing and the screen will show another`,
    });
  }

  return results;
}

// The second call, for an invitation that now says 'sent'. The refusal that must
// not have changed, and the one place this script can prove a second email is NOT
// sent to somebody who already has the first.
function judgeAlreadySent(answer) {
  const what = "a second call for an invitation that says 'sent' is refused with 409 and 23505";

  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];

  const body = answer.body ?? "";
  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }

  if (answer.status === 201) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          "HTTP 201 -- IT SENT A SECOND EMAIL FOR AN INVITATION THAT ALREADY WENT. That is a real" +
          " message to a real address, and it replaced a link somebody may already be holding",
      },
    ];
  }
  if (answer.status !== 409) {
    return [
      {
        what,
        verdict: answer.status === 401 || answer.status === 500 ? UNVERIFIED : FAIL,
        detail: `HTTP ${answer.status}, expected 409 -- body: ${body}`,
      },
    ];
  }

  const problems = [];
  if (!parsed || typeof parsed !== "object") {
    problems.push("the body is not a JSON object, so it cannot be checked field by field");
  } else {
    if (parsed.error !== UNCHANGED_409) {
      problems.push(
        `the message is ${JSON.stringify(parsed.error)}, not the unchanged sentence` +
          ` ${JSON.stringify(UNCHANGED_409)}`,
      );
    }
    if (parsed.code !== UNIQUE_VIOLATION) {
      problems.push(`code is ${JSON.stringify(parsed.code)}, expected "${UNIQUE_VIOLATION}"`);
    }
    const extra = Object.keys(parsed).filter((key) => !["error", "code"].includes(key));
    if (extra.length > 0) problems.push(`it carries extra fields: ${extra.join(", ")}`);
  }

  return [
    {
      what,
      verdict: problems.length === 0 ? PASS : FAIL,
      detail:
        problems.length === 0
          ? `HTTP 409, code ${UNIQUE_VIOLATION}, and the sentence this function has always sent`
          : problems.join("; "),
    },
  ];
}

// The 'failed' path. This run cannot bring it about, so this is a reporter rather
// than a check -- unless the send really did fail, in which case there is
// something to judge after all.
function judgeFailedPath(answer, row) {
  const what = "a failed send leaves the row as 'failed' with a code from the fixed list";

  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];

  if (answer.status !== 502 && answer.status !== 500) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail:
          "the email service did not fail during this run, so this path was not exercised. It" +
          " CANNOT be brought about from here: staging redirects all invitation mail to the test" +
          " inbox, which the service accepts, and the settings that would refuse are function" +
          " secrets. supabase/functions/_tests/invitation_status_test.ts is what proves the body" +
          " and the code for each of the four failures",
      },
    ];
  }

  let parsed = null;
  try {
    parsed = JSON.parse(answer.body ?? "");
  } catch {
    parsed = null;
  }
  const code = parsed && typeof parsed === "object" ? parsed.code : undefined;

  const problems = [];
  if (!FAILURE_CODES.includes(code)) {
    problems.push(
      `the answer's code is ${JSON.stringify(code)}, which is not one of ${FAILURE_CODES.join(", ")}`,
    );
  }
  if (row.error) {
    problems.push(`the row could not be read back: ${row.error}`);
  } else if (row.rows.length === 0) {
    problems.push(
      "the row is GONE. A failed send must leave the invitation behind, saying it failed -- deleting" +
        " it is what the function did before issue #166",
    );
  } else {
    if (row.rows[0].status !== "failed") {
      problems.push(
        `the row says ${JSON.stringify(row.rows[0].status)} and the send failed, so the two disagree`,
      );
    }
    if (row.rows[0].failure_code !== code) {
      problems.push(
        `the answer's code is ${JSON.stringify(code)} and the row's is` +
          ` ${JSON.stringify(row.rows[0].failure_code)}`,
      );
    }
  }

  return [
    {
      what,
      verdict: problems.length === 0 ? PASS : FAIL,
      detail:
        problems.length === 0
          ? `HTTP ${answer.status}, code "${code}", and the row says "failed" with the same code`
          : problems.join("; "),
    },
  ];
}

// Did anything the function answered quote the email service, name an address, or
// carry a token?
//
// `bodies` is every response body this run saw, already scrubbed. The scrub is what
// replaces the two addresses and the access token; this check is what notices
// anything the scrub does not know about.
function judgeNothingLeaked(bodies) {
  const what = "nothing the function answered quotes the email service, an address, or a token";
  if (bodies.length === 0) {
    return [{ what, verdict: UNVERIFIED, detail: "no body was read, so there is nothing to check" }];
  }

  const problems = [];
  for (const body of bodies) {
    const lower = body.toLowerCase();
    for (const fragment of SERVICE_FRAGMENTS) {
      if (lower.includes(fragment)) {
        problems.push(`a body contains "${fragment}", which only the email service says`);
      }
    }
    if (body.includes("@")) {
      problems.push("a body contains an @ that the scrub did not replace, so possibly an address");
    }
    // 64 hex characters is a token hash; the token itself is base64url and longer
    // than anything else in these bodies.
    if (/[0-9a-f]{64}/i.test(body)) {
      problems.push("a body contains 64 hex characters, so possibly a token hash");
    }
    if (body.length > MAX_REFUSAL_BODY && !body.includes("invitation")) {
      problems.push(`a body is ${body.length} characters and is not an invitation, so it is unexpected`);
    }
  }

  return [
    {
      what,
      verdict: problems.length === 0 ? PASS : FAIL,
      detail:
        problems.length === 0
          ? `${bodies.length} body/bodies, none of them carrying a service reply, an address, or a hash`
          : [...new Set(problems)].join("; "),
    },
  ];
}

// Did this run touch anything it said it would not? `log` is every request made,
// as { method, path }.
function judgeTouchedNothing(log) {
  const what = "this run called only invite-member, and read only teams and invitations";
  const allowed = [
    { method: "POST", path: "/auth/v1/token" },
    { method: "POST", path: "/auth/v1/logout" },
    { method: "POST", path: "/functions/v1/invite-member" },
    { method: "GET", path: "/rest/v1/teams" },
    { method: "GET", path: "/rest/v1/invitations" },
  ];

  if (log.length === 0) {
    return [
      { what, verdict: UNVERIFIED, detail: "no request was made at all, so there is nothing to check" },
    ];
  }

  const problems = [];
  for (const entry of log) {
    if (entry.path.includes("account_status")) {
      problems.push(`${entry.method} ${entry.path} names account_status`);
      continue;
    }
    // A write through PostgREST would be a POST, PATCH or DELETE to /rest/v1.
    if (entry.path.startsWith("/rest/v1/") && entry.method !== "GET") {
      problems.push(`${entry.method} ${entry.path} is a write through PostgREST, and this script makes none`);
      continue;
    }
    const ok = allowed.some((a) => a.method === entry.method && entry.path.startsWith(a.path));
    if (!ok) problems.push(`${entry.method} ${entry.path} is not on the allowed list`);
  }

  return [
    {
      what,
      verdict: problems.length === 0 ? PASS : FAIL,
      detail:
        problems.length === 0
          ? `${log.length} request(s): sign-ins, sign-outs, calls to invite-member, and reads of teams and invitations`
          : problems.join("; "),
    },
  ];
}

// ---------------------------------------------------------------------------
// Keeping tokens and addresses out of printed lines
// ---------------------------------------------------------------------------

const PLACEHOLDERS = [];

function remember(value, placeholder) {
  if (typeof value === "string" && value !== "") {
    PLACEHOLDERS.push([value, placeholder]);
  }
}

function scrubWith(text, placeholders) {
  let out = text ?? "";
  for (const [value, placeholder] of placeholders) {
    if (value === "") continue;
    out = out.split(value).join(placeholder);
  }
  return out;
}

function scrub(text) {
  return scrubWith(text, PLACEHOLDERS);
}

// Did `value` actually get taken out of `text`? UNVERIFIED when it was not in the
// text to begin with, because a clean result then proves nothing.
function judgeScrubbed(label, text, value, placeholders) {
  const what = `scrub: ${label}`;
  if (!text.includes(value)) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail: "that value is not in the text to begin with, so a clean result proves nothing",
      },
    ];
  }
  const survived = scrubWith(text, placeholders).includes(value);
  return [
    {
      what,
      verdict: survived ? FAIL : PASS,
      detail: survived
        ? `it is STILL in the result, with ${placeholders.length} placeholder(s) registered`
        : `gone from the result, with ${placeholders.length} placeholder(s) registered`,
    },
  ];
}

// ---------------------------------------------------------------------------
// --selftest -- the judgements above, fed answers from a world where the
// function is the old one, or lies, or sends twice. No network, no account.
// ---------------------------------------------------------------------------

function runSelftest() {
  console.log("build-it-18-invitation-status-checks --selftest: can these checks fail?");
  console.log("");
  console.log("Each case is something this script might be handed: a URL from");
  console.log("web/.env.local, an answer from invite-member, or a row read back.");
  console.log("The expectation is what the judgement must say about it. Nothing is");
  console.log("sent anywhere and no account is used.");
  console.log("");

  const madeUpId = "a1b2c3d4-0001-4e5f-8a9b-0c1d2e3f4a5b";
  const aliceId = "a1b2c3d4-0002-4e5f-8a9b-0c1d2e3f4a5b";
  const madeUpAddress = "invited-nobody@example.com";
  const nowMs = Date.parse("2026-10-06T12:00:00.000Z");
  const minute = 60_000;
  const iso = (ms) => new Date(ms).toISOString();

  // The three bodies, built the way the real function builds them.
  const sentBody = JSON.stringify({
    invitation: { id: madeUpId, email: madeUpAddress, expires_at: iso(nowMs), status: "sent" },
    redirected: true,
    retried: false,
  });
  const queuedBody = JSON.stringify({
    invitation: { id: madeUpId, email: madeUpAddress, expires_at: iso(nowMs), status: "queued" },
    redirected: true,
    retried: false,
  });
  // What the function answered BEFORE issue #166: no status at all.
  const oldBody = JSON.stringify({
    invitation: { id: madeUpId, email: madeUpAddress, expires_at: iso(nowMs) },
    redirected: true,
  });
  const alreadyBody = JSON.stringify({ error: UNCHANGED_409, code: UNIQUE_VIOLATION });

  const sentRow = {
    rows: [{ id: madeUpId, status: "sent", failure_code: "", created_at: iso(nowMs - minute) }],
  };
  const queuedRow = {
    rows: [{ id: madeUpId, status: "queued", failure_code: "", created_at: iso(nowMs - minute) }],
  };
  const failedRow = {
    rows: [
      { id: madeUpId, status: "failed", failure_code: "refused", created_at: iso(nowMs - minute) },
    ],
  };

  // A stand-in for an access token, for the scrub cases only. NOT a JWT, and
  // deliberately dull: the first version was JWT-shaped and `.githooks/pre-commit`
  // refused the commit, gitleaks reporting `jwt, entropy 4.786`. It was right to --
  // a scanner cannot tell a fixture from the real thing, and CI runs the same tool
  // over the whole history on every pull request. The scrub cases care that the
  // string is found and replaced, not what shape it has.
  const standInToken = `not-a-real-access-token-${"y".repeat(24)}`;

  const cases = [
    // ---- the staging guard ----
    { name: "the staging URL itself", run: () => judgeStagingUrl(`https://${STAGING_HOST}`), expect: [PASS] },
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
    { name: "NOT STAGING: the right host over plain http", run: () => judgeStagingUrl(`http://${STAGING_HOST}`), expect: [FAIL] },
    { name: "NOT STAGING: the right host on another port", run: () => judgeStagingUrl(`https://${STAGING_HOST}:8799`), expect: [FAIL] },
    { name: "not a URL at all: the bare reference", run: () => judgeStagingUrl(STAGING_REF), expect: [FAIL] },

    // ---- the control ----
    {
      name: "the control holds: Alice reads the team she owns",
      run: () => judgeAliceReadsHerTeam({ rows: [{ id: madeUpId, owner_id: aliceId }] }, madeUpId, aliceId),
      expect: [PASS],
    },
    {
      name: "THE CONTROL IS BROKEN: Alice cannot read her own team, so nothing else means anything",
      run: () => judgeAliceReadsHerTeam({ rows: [] }, madeUpId, aliceId),
      expect: [FAIL],
    },
    {
      name: "the control proves nothing: a row came back that Alice does not own",
      run: () => judgeAliceReadsHerTeam({ rows: [{ id: madeUpId, owner_id: "somebody-else" }] }, madeUpId, aliceId),
      expect: [UNVERIFIED],
    },

    // ---- can the owner read the columns at all ----
    {
      name: "the owner reads both new columns",
      run: () => judgeOwnerCanReadTheColumns(sentRow),
      expect: [PASS],
    },
    {
      name: "THE MIGRATION IS NOT ON THIS PROJECT: PostgREST refuses the unknown column",
      run: () =>
        judgeOwnerCanReadTheColumns({
          error: 'HTTP 400 {"code":"42703","message":"column invitations.status does not exist"}',
        }),
      expect: [FAIL],
    },
    {
      name: "the row came back without failure_code, so half the screen has no data",
      run: () =>
        judgeOwnerCanReadTheColumns({
          rows: [{ id: madeUpId, status: "sent", created_at: iso(nowMs) }],
        }),
      expect: [FAIL],
    },
    {
      name: "A STATUS THE CONSTRAINT FORBIDS came back",
      run: () =>
        judgeOwnerCanReadTheColumns({
          rows: [{ id: madeUpId, status: "posted", failure_code: "", created_at: iso(nowMs) }],
        }),
      expect: [FAIL],
    },
    {
      name: "nothing came back to read the columns off, so the question was not asked",
      run: () => judgeOwnerCanReadTheColumns({ rows: [] }),
      expect: [UNVERIFIED],
    },

    // ---- which answer to expect for the row that is already there ----
    { name: "no row yet: expect a send", run: () => [{ what: "x", verdict: expectedOutcome(null, nowMs) === "send" ? PASS : FAIL, detail: "" }], expect: [PASS] },
    {
      name: "a failed row: expect a send, which is the retry",
      run: () => [{ what: "x", verdict: expectedOutcome(failedRow.rows[0], nowMs) === "send" ? PASS : FAIL, detail: "" }],
      expect: [PASS],
    },
    {
      name: "a sent row: expect the unchanged 409",
      run: () => [{ what: "x", verdict: expectedOutcome(sentRow.rows[0], nowMs) === "already-sent" ? PASS : FAIL, detail: "" }],
      expect: [PASS],
    },
    {
      name: "a row queued a minute ago: expect 'it is being sent now'",
      run: () => [{ what: "x", verdict: expectedOutcome(queuedRow.rows[0], nowMs) === "still-sending" ? PASS : FAIL, detail: "" }],
      expect: [PASS],
    },
    {
      name: "a row queued an hour ago: expect a send, because the send clearly never finished",
      run: () => [
        {
          what: "x",
          verdict:
            expectedOutcome({ status: "queued", created_at: iso(nowMs - 60 * minute) }, nowMs) === "send"
              ? PASS
              : FAIL,
          detail: "",
        },
      ],
      expect: [PASS],
    },
    {
      name: "a queued row whose created_at cannot be read: expect no send, because how long is unknown",
      run: () => [
        {
          what: "x",
          verdict:
            expectedOutcome({ status: "queued", created_at: "whenever" }, nowMs) === "still-sending"
              ? PASS
              : FAIL,
          detail: "",
        },
      ],
      expect: [PASS],
    },

    // ---- the send, recorded ----
    {
      name: "it works: 201 says sent, the row says sent, and the two agree",
      run: () => judgeSendRecorded({ status: 201, body: sentBody }, sentRow),
      expect: [PASS, PASS, PASS],
    },
    {
      name: "THE FUNCTION IS THE OLD ONE: 201 with no status, and the row keeps the migration's default",
      run: () => judgeSendRecorded({ status: 201, body: oldBody }, queuedRow),
      // The answer fails, the row fails, and there is nothing to compare: which is
      // exactly what a run BEFORE the deploy must report.
      expect: [FAIL, FAIL, UNVERIFIED],
    },
    {
      name: "THE ANSWER LIES: it says sent and the row says queued",
      run: () => judgeSendRecorded({ status: 201, body: sentBody }, queuedRow),
      expect: [PASS, FAIL, FAIL],
    },
    {
      name: "THE ANSWER LIES THE OTHER WAY: it says sent and the row says failed",
      run: () => judgeSendRecorded({ status: 201, body: sentBody }, failedRow),
      expect: [PASS, FAIL, FAIL],
    },
    {
      name: "honest about a broken status write: 201 saying queued, and the row says queued",
      // The answer is right to say 'queued' -- but the status write is broken, so
      // this is a finding, not a pass.
      run: () => judgeSendRecorded({ status: 201, body: queuedBody }, queuedRow),
      expect: [FAIL, FAIL, PASS],
    },
    {
      name: "THE ROW IS GONE: the old function deleted it when the send failed",
      run: () => judgeSendRecorded({ status: 201, body: sentBody }, { rows: [] }),
      expect: [PASS, FAIL, UNVERIFIED],
    },
    {
      name: "the call was refused for ownership, so nothing about status was tested",
      run: () =>
        judgeSendRecorded(
          { status: 403, body: '{"error":"Only the team\'s owner can invite people."}' },
          sentRow,
        ),
      expect: [FAIL, PASS, UNVERIFIED],
    },
    {
      name: "this environment may not send, so the function created nothing",
      run: () =>
        judgeSendRecorded(
          { status: 503, body: '{"error":"This environment is not allowed to send invitation emails, so no invitation was created."}' },
          { rows: [] },
        ),
      expect: [UNVERIFIED, FAIL, UNVERIFIED],
    },
    {
      name: "the request never arrived",
      run: () => judgeSendRecorded({ error: "could not reach invite-member (fetch failed)" }, sentRow),
      expect: [UNVERIFIED, UNVERIFIED, UNVERIFIED],
    },

    // ---- the second call ----
    {
      name: "the second call is refused with the unchanged 409",
      run: () => judgeAlreadySent({ status: 409, body: alreadyBody }),
      expect: [PASS],
    },
    {
      name: "IT SENT A SECOND EMAIL for an invitation that already went",
      run: () => judgeAlreadySent({ status: 201, body: sentBody }),
      expect: [FAIL],
    },
    {
      name: "409, BUT THE SENTENCE CHANGED -- the refusal issue #166 says must not",
      run: () =>
        judgeAlreadySent({
          status: 409,
          body: JSON.stringify({ error: "That invitation is being sent now.", code: UNIQUE_VIOLATION }),
        }),
      expect: [FAIL],
    },
    {
      name: "409 with the right sentence and no code, so a caller cannot tell which 409 it is",
      run: () => judgeAlreadySent({ status: 409, body: JSON.stringify({ error: UNCHANGED_409 }) }),
      expect: [FAIL],
    },
    {
      name: "409 carrying an extra field nobody asked for",
      run: () =>
        judgeAlreadySent({
          status: 409,
          body: JSON.stringify({ error: UNCHANGED_409, code: UNIQUE_VIOLATION, status: "sent" }),
        }),
      expect: [FAIL],
    },
    {
      name: "the second call was refused for another reason entirely",
      run: () => judgeAlreadySent({ status: 403, body: '{"error":"Only the team\'s owner can invite people."}' }),
      expect: [FAIL],
    },

    // ---- the failed path ----
    {
      name: "the failed path was not exercised, which is this run's normal outcome",
      run: () => judgeFailedPath({ status: 201, body: sentBody }, sentRow),
      expect: [UNVERIFIED],
    },
    {
      name: "the send did fail, and the row says so with the same code",
      run: () =>
        judgeFailedPath(
          { status: 502, body: JSON.stringify({ error: "The invitation email could not be sent.", code: "refused" }) },
          failedRow,
        ),
      expect: [PASS],
    },
    {
      name: "THE SEND FAILED AND THE ROW WAS DELETED: the behaviour from before issue #166",
      run: () =>
        judgeFailedPath(
          { status: 502, body: JSON.stringify({ error: "The invitation email could not be sent.", code: "refused" }) },
          { rows: [] },
        ),
      expect: [FAIL],
    },
    {
      name: "the send failed and the row says sent -- the answer and the row disagree",
      run: () =>
        judgeFailedPath(
          { status: 502, body: JSON.stringify({ error: "The invitation email could not be sent.", code: "refused" }) },
          sentRow,
        ),
      expect: [FAIL],
    },
    {
      name: "the send failed with a code that is not on the fixed list",
      run: () =>
        judgeFailedPath(
          { status: 502, body: JSON.stringify({ error: "The invitation email could not be sent.", code: "smtp_oops" }) },
          failedRow,
        ),
      expect: [FAIL],
    },

    // ---- what leaked ----
    {
      name: "nothing leaked: the bodies carry statuses and codes and nothing else",
      run: () => judgeNothingLeaked([alreadyBody, JSON.stringify({ invitation: { status: "sent" } })]),
      expect: [PASS],
    },
    {
      name: "A BODY QUOTES THE EMAIL SERVICE'S OWN COMPLAINT",
      run: () =>
        judgeNothingLeaked([
          JSON.stringify({
            error: 'The invitation email could not be sent: {"statusCode":422,"name":"validation_error"}',
            code: "refused",
          }),
        ]),
      expect: [FAIL],
    },
    {
      name: "A BODY NAMES THE ADDRESS, and the scrub did not know it",
      run: () => judgeNothingLeaked([JSON.stringify({ error: `Could not send to ${madeUpAddress}` })]),
      expect: [FAIL],
    },
    {
      name: "A BODY CARRIES A TOKEN HASH",
      run: () => judgeNothingLeaked([JSON.stringify({ token_hash: "a".repeat(64) })]),
      expect: [FAIL],
    },
    {
      name: "no body was read, so the claim is unproved rather than true",
      run: () => judgeNothingLeaked([]),
      expect: [UNVERIFIED],
    },

    // ---- what the run touched ----
    {
      name: "the run touched only what it said it would",
      run: () =>
        judgeTouchedNothing([
          { method: "POST", path: "/auth/v1/token?grant_type=password" },
          { method: "GET", path: "/rest/v1/teams?id=eq.x&select=id,owner_id" },
          { method: "GET", path: "/rest/v1/invitations?select=id,status" },
          { method: "POST", path: "/functions/v1/invite-member" },
          { method: "POST", path: "/auth/v1/logout?scope=global" },
        ]),
      expect: [PASS],
    },
    {
      name: "IT TRIED TO WRITE THROUGH PostgREST, which this script never does",
      run: () => judgeTouchedNothing([{ method: "DELETE", path: "/rest/v1/invitations?id=eq.x" }]),
      expect: [FAIL],
    },
    {
      name: "IT READ account_status: the one table nothing here may touch",
      run: () => judgeTouchedNothing([{ method: "GET", path: "/rest/v1/account_status?select=user_id" }]),
      expect: [FAIL],
    },
    {
      name: "IT CALLED ANOTHER FUNCTION, which is outside what this script is about",
      run: () => judgeTouchedNothing([{ method: "POST", path: "/functions/v1/accept-invite" }]),
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
        judgeScrubbed("a token in a response body", `{"msg":"bad jwt","got":"${standInToken}"}`, standInToken, [
          [standInToken, "ALICE_ACCESS_TOKEN"],
        ]),
      expect: [PASS],
    },
    {
      name: "the invited address echoed back in a 201 is replaced",
      run: () =>
        judgeScrubbed("an address in a 201", `{"invitation":{"email":"${madeUpAddress}"}}`, madeUpAddress, [
          [madeUpAddress, "INVITED_ADDRESS"],
        ]),
      expect: [PASS],
    },
    {
      name: "NOTHING REGISTERED: the address comes straight back out",
      run: () =>
        judgeScrubbed("an address with an empty registry", `{"invitation":{"email":"${madeUpAddress}"}}`, madeUpAddress, []),
      expect: [FAIL],
    },
    {
      name: "a scrub case that proves nothing: the value is not in the text at all",
      run: () => judgeScrubbed("a body with no address in it", '{"msg":"nope"}', madeUpAddress, [[madeUpAddress, "INVITED_ADDRESS"]]),
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
  console.log("Every judgement said FAIL to the function from before issue #166, to an");
  console.log("answer that claims 'sent' over a row that says 'queued', to a second");
  console.log("call that sent a second email, to a failed send whose row was deleted,");
  console.log("to a body quoting the email service, and to a run that wrote through");
  console.log("PostgREST or read account_status. That is what would make a green");
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
//
// A small .env reader, the same one the four scripts beside this use and for the
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
        `  node scripts/staging/build-it-18-invitation-status-checks.mjs --selftest`,
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

// One person. Alice owns the team, and only the team's owner may invite -- so Bob
// and Carol have nothing to do here. docs/environments.md names them, and rule 6
// says to use them and never a real person's data.
const aliceEmail = (process.env.ALICE_EMAIL ?? "").trim();
const alicePassword = process.env.ALICE_PASSWORD ?? "";
const aliceTeamId = (process.env.ALICE_TEAM_ID ?? "").trim();

const missingFromEnv = [];
if (aliceEmail === "") missingFromEnv.push("ALICE_EMAIL");
if (alicePassword === "") missingFromEnv.push("ALICE_PASSWORD");
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

if (!UUID_PATTERN.test(aliceTeamId)) {
  die(
    `ALICE_TEAM_ID is not a uuid, so nothing in this script could have meant anything.\n` +
      `Expected 8-4-4-4-12 hex digits, for example\n` +
      `0f8fad5b-d9cb-469f-a165-70867728950e. Copy the team's id from the staging Table\n` +
      `Editor -- not its name, and not an email address. Nothing was sent and nobody\n` +
      `was signed in.`,
  );
}

// The two addresses go into the scrub before a single request is made, so no body
// can print one even if the function echoes it back.
remember(aliceEmail, "ALICE_EMAIL");
remember(INVITE_ADDRESS, "INVITED_ADDRESS");

// ---------------------------------------------------------------------------
// The endpoints, built from the URL the guard has already accepted
// ---------------------------------------------------------------------------

const base = supabaseUrl.replace(/\/+$/, "");
const authUrl = `${base}/auth/v1`;
const functionsUrl = `${base}/functions/v1`;
const restUrl = `${base}/rest/v1`;

// The columns this script reads off an invitation. Named, never a star: a column
// the table grows later must not arrive in this script's output because nobody
// said it should not.
const INVITATION_COLUMNS = "id,status,failure_code,created_at,expires_at,accepted_at";

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

const REQUEST_LOG = [];
const BODIES_SEEN = [];

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

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
  const text = scrub(await response.text());
  BODIES_SEEN.push(text);
  return { status: response.status, body: text };
}

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

async function signIn() {
  REQUEST_LOG.push({ method: "POST", path: "/auth/v1/token?grant_type=password" });

  let response;
  try {
    response = await fetch(`${authUrl}/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: aliceEmail, password: alicePassword }),
    });
  } catch (cause) {
    return { error: `could not reach the auth endpoint (${cause.message})` };
  }
  if (!response.ok) {
    return { error: `sign in returned HTTP ${response.status}: ${scrub(await response.text())}` };
  }
  const session = await response.json();
  const accessToken = session?.access_token ?? "";
  const userId = session?.user?.id ?? "";
  if (accessToken === "") return { error: "sign in returned HTTP 2xx but no access token" };
  if (userId === "") return { error: "sign in returned HTTP 2xx but no user id" };
  // Registered with scrub() the moment it exists, before any body that could
  // contain it is printed. This one is live.
  remember(accessToken, "ALICE_ACCESS_TOKEN");
  return { accessToken, userId };
}

async function signOut(accessToken) {
  REQUEST_LOG.push({ method: "POST", path: "/auth/v1/logout?scope=global" });
  try {
    const response = await fetch(`${authUrl}/logout?scope=global`, {
      method: "POST",
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
    });
    console.log(`  (Alice signed out: HTTP ${response.status})`);
  } catch (cause) {
    console.log(`  (Alice sign out failed: ${cause.message}; the session expires on its own)`);
  }
}

// The invitation this script is about, read as Alice through the owner-only select
// policy. `accepted_at=is.null` so an accepted one from some other run is not
// mistaken for this one's.
function readTheInvitation(accessToken) {
  return readRows(
    `invitations?team_id=eq.${aliceTeamId}&email=eq.${encodeURIComponent(INVITE_ADDRESS)}` +
      `&accepted_at=is.null&select=${INVITATION_COLUMNS}`,
    accessToken,
  );
}

function describeRow(read) {
  if (read.error) return `could not be read: ${read.error}`;
  if (read.rows.length === 0) return "no pending invitation for that address";
  const row = read.rows[0];
  return (
    `status "${row.status}", failure_code ${JSON.stringify(row.failure_code)},` +
    ` created ${row.created_at}, expires ${row.expires_at}`
  );
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log("Build it 18 part 2b -- invitation status in the deployed function");
console.log(`  staging host:       ${STAGING_HOST} (confirmed by parsing the URL, not by a substring)`);
console.log("  function:           invite-member");
console.log(`  Alice's team id:    ${aliceTeamId}`);
console.log("  invited address:    one fixed plus-address of the staging test mailbox (not printed)");
console.log(`  stale window:       ${STALE_QUEUED_MINUTES} minutes`);
console.log("  tokens, passwords, addresses and the publishable key: not printed");
console.log("");
console.log("RUN THIS BEFORE AND AFTER DEPLOYING invite-member TO STAGING. Before the");
console.log("deploy it MUST FAIL: the live function answers 201 with no status and");
console.log("leaves the row at the migration's default 'queued'. One green run on its");
console.log("own says nothing about the deploy -- the pair is the evidence.");
console.log("");
console.log("IT SENDS REAL EMAIL, to the staging test mailbox. One message per run at");
console.log("most, and the staging function secrets redirect every invitation there,");
console.log("so nothing reaches the address in the row.");
console.log("");
console.log("IT CANNOT DELETE WHAT IT CREATES. invitations has no delete policy, so");
console.log("the one row this script makes is removed only by you, in the SQL editor.");
console.log("The statement is printed at the end of this run.");
console.log("");

const alice = await signIn();

if (alice.error) {
  console.log("Alice (ALICE_EMAIL, value not printed)");
  console.log(`  UNVERIFIED  Alice could not sign in -- ${alice.error}`);
  unverified += 1;
  console.log("");
  console.log("Nothing else could be asked. Totals: 0 PASS, 0 FAIL, 1 UNVERIFIED.");
  process.exit(1);
}

let created = false;

try {
  // -------------------------------------------------------------------------
  // 1. The control
  // -------------------------------------------------------------------------
  //
  // FIRST, deliberately. If Alice cannot read the team she owns, every refusal
  // below is a refusal of everybody and says nothing about invitation status.
  console.log("1. The control: Alice reads the team she owns");
  const team = await readRows(`teams?id=eq.${aliceTeamId}&select=id,owner_id`, alice.accessToken);
  record(judgeAliceReadsHerTeam(team, aliceTeamId, alice.userId));
  console.log("");

  // -------------------------------------------------------------------------
  // 2. What is already there
  // -------------------------------------------------------------------------
  //
  // Read BEFORE anything is sent, because it decides which answer the call below
  // should get. A script that judged whichever answer arrived would pass whatever
  // the function did.
  console.log("2. The invitation that is already there, if any");
  const before = await readTheInvitation(alice.accessToken);
  console.log(`  (pre-read) ${describeRow(before)}`);
  record(judgeOwnerCanReadTheColumns(before));

  const beforeRow = before.error || before.rows.length === 0 ? null : before.rows[0];
  const expected = expectedOutcome(beforeRow, Date.now());
  console.log(`  (expecting the first call to: ${expected})`);
  console.log("");

  // -------------------------------------------------------------------------
  // 3. The first call
  // -------------------------------------------------------------------------

  console.log("3. Alice invites the fixed plus-address");
  const first = await callFunction("invite-member", alice.accessToken, {
    team_id: aliceTeamId,
    email: INVITE_ADDRESS,
  });
  if (first.body !== undefined) console.log(`        body: ${first.body}`);
  if (first.status === 201) created = true;

  const afterFirst = await readTheInvitation(alice.accessToken);
  console.log(`  (row now) ${describeRow(afterFirst)}`);

  if (expected === "send") {
    record(judgeSendRecorded(first, afterFirst));
    record(judgeFailedPath(first, afterFirst));
  } else if (expected === "already-sent") {
    console.log("  (the row was already 'sent', so this call is the already-sent check)");
    record(judgeAlreadySent(first));
    record([
      {
        what: "the call that should send answers 201 and reports a status",
        verdict: UNVERIFIED,
        detail:
          "a sent invitation was already there, so this run could not exercise a send. Delete the" +
          " row with the statement printed below and run again to test that path",
      },
    ]);
  } else {
    console.log("  (the row was queued and recent, so a refusal is the right answer)");
    record([
      {
        what: "a recently queued invitation is not sent again",
        verdict: first.status === 409 ? PASS : FAIL,
        detail:
          first.status === 409
            ? `HTTP 409 -- body: ${first.body}`
            : `HTTP ${first.status}, expected 409 -- body: ${first.body}`,
      },
    ]);
  }
  console.log("");

  // -------------------------------------------------------------------------
  // 4. The second call
  // -------------------------------------------------------------------------
  //
  // Only meaningful when the row now says 'sent'. Said rather than skipped
  // quietly: a check that could not be asked is not a pass.
  console.log("4. Alice asks again for the same address");
  const rowSaysSent =
    !afterFirst.error && afterFirst.rows.length === 1 && afterFirst.rows[0].status === "sent";

  if (!rowSaysSent) {
    record([
      {
        what: "a second call for an invitation that says 'sent' is refused with 409 and 23505",
        verdict: UNVERIFIED,
        detail:
          `the row does not say 'sent' after the first call (${describeRow(afterFirst)}), so this` +
          ` check has nothing to be about. Before the deploy that is expected: the live function` +
          ` never writes the column`,
      },
    ]);
    // The call is still made, because the refusal matters whatever the status is:
    // the one thing that must never happen is a second email.
    const second = await callFunction("invite-member", alice.accessToken, {
      team_id: aliceTeamId,
      email: INVITE_ADDRESS,
    });
    if (second.body !== undefined) console.log(`        body: ${second.body}`);
    record([
      {
        what: "the second call did not create a second invitation",
        verdict: second.status === 409 || second.status === 201 ? (second.status === 409 ? PASS : UNVERIFIED) : UNVERIFIED,
        detail:
          second.status === 409
            ? "HTTP 409 -- refused by the unique index, as it should be"
            : `HTTP ${second.status}. A 201 here is a retry, which is correct behaviour for a` +
              ` 'failed' or long-stuck row -- read the pre-read above to see which`,
      },
    ]);
  } else {
    const second = await callFunction("invite-member", alice.accessToken, {
      team_id: aliceTeamId,
      email: INVITE_ADDRESS,
    });
    if (second.body !== undefined) console.log(`        body: ${second.body}`);
    record(judgeAlreadySent(second));

    const afterSecond = await readTheInvitation(alice.accessToken);
    console.log(`  (row now) ${describeRow(afterSecond)}`);
    record([
      {
        what: "the refused second call changed nothing on the row",
        verdict:
          !afterSecond.error &&
          afterSecond.rows.length === 1 &&
          afterSecond.rows[0].status === "sent" &&
          afterSecond.rows[0].created_at === afterFirst.rows[0].created_at &&
          afterSecond.rows[0].expires_at === afterFirst.rows[0].expires_at
            ? PASS
            : FAIL,
        detail:
          "a refusal must not rotate the token or move the expiry -- compared by created_at and" +
          ` expires_at: ${describeRow(afterSecond)}`,
      },
    ]);
  }
  console.log("");

  // -------------------------------------------------------------------------
  // 5. What leaked, and what was touched
  // -------------------------------------------------------------------------

  console.log("5. What this run said, and what it touched");
  record(judgeNothingLeaked(BODIES_SEEN));
  record(judgeTouchedNothing(REQUEST_LOG));
  console.log("");
} finally {
  await signOut(alice.accessToken);
  console.log("");

  console.log(`Totals: ${passes} PASS, ${failures} FAIL, ${unverified} UNVERIFIED.`);
  console.log("");
  console.log("WHAT THIS RUN CANNOT TELL YOU, whatever the totals say (rule 8):");
  console.log("  * whether any email ARRIVED. The service reporting a send is not a");
  console.log("    delivery, and junk folders are invisible to this script. The");
  console.log("    staging test mailbox is the only place that answers it.");
  console.log("  * anything about the 'failed' path, unless the send happened to");
  console.log("    fail. It cannot be brought about from here -- see the note at the");
  console.log("    top of this file.");
  console.log("  * anything about production. This script refuses to run against it.");
  console.log("");
  console.log("CLEAN UP, IN THE STAGING SQL EDITOR. This script cannot delete the row");
  console.log("it makes: invitations has no delete policy, and nothing holding the");
  console.log("publishable key can remove one.");
  console.log("");
  console.log("  delete from public.invitations");
  console.log(`  where team_id = '${aliceTeamId}'`);
  console.log("    and email = 'teamtasks.staging.test+bi18-status@gmail.com';");
  console.log("");
  console.log(
    created
      ? "  (this run created or re-sent that invitation, so there is one to delete)"
      : "  (this run created nothing new; the row may still be there from an earlier run)",
  );

  if (failures > 0 || unverified > 0) {
    console.log("");
    console.log("NOT GREEN. Before the deploy that is the point: the live function");
    console.log("answers 201 with no status and never writes the column, so the two");
    console.log("checks about the answer and the row both fail. After the deploy, a");
    console.log("FAIL means the function and the row disagree, or a second email went");
    console.log("to somebody who already had one. An UNVERIFIED is a question that");
    console.log("could not be asked, which is not a pass either -- the usual causes");
    console.log("are a sign-in that failed, a wrong ALICE_TEAM_ID, a row left 'sent'");
    console.log("by an earlier run, or the email service failing during the run.");
    process.exitCode = 1;
  } else {
    console.log("");
    console.log("All checks passed. That is only half the evidence: a run from BEFORE");
    console.log("the deploy, showing these same checks failing, is the other half.");
  }
}

// HOW TO RUN IT, from the repository root.
//
// THE LOGIC CHECK NEEDS NOTHING AT ALL -- no account, no network, no
// web/.env.local. Run this first, and whenever this file is edited:
//
//   node scripts/staging/build-it-18-invitation-status-checks.mjs --selftest
//
// THE STAGING RUNS. Two of them, and the first is meant to fail:
//
//   1. BEFORE the deploy. The live invite-member is the one from before issue
//      #166. Expect FAILs on "answers 201 and reports a status" and "the row
//      itself says 'sent'". Keep that output: it is what shows the behaviour was
//      not there.
//
//   2. The owner deploys the function to staging, from their own terminal:
//
//        supabase functions deploy invite-member --project-ref ghskxrhqlhvrhpnivqbd
//
//      The assistant does not run this (rule 19 permits it, but no deploy has been
//      made from this session and the PR says so).
//
//   3. AFTER the deploy, in the same shell. The row from step 1 now says 'queued'
//      and was created minutes ago, so the function will refuse to send it again
//      until the stale window passes. DELETE THE ROW FIRST, with the statement
//      this script prints, so step 3 exercises a fresh send:
//
//        delete from public.invitations
//        where team_id = '<Alice's team id>'
//          and email = 'teamtasks.staging.test+bi18-status@gmail.com';
//
//   4. Delete the row again when you are done, so staging is left as it was.
//
// KEEP THE PASSWORDS OFF THE COMMAND LINE: both shells on this machine save
// command lines to a file -- Git Bash writes ~/.bash_history with HISTCONTROL
// unset, and PowerShell's PSReadLine saves incrementally. So load the password
// file instead of typing values; what lands in history is a FILENAME.
//
// Git Bash, WSL or macOS:
//
//   set -a
//   . ~/.config/team-tasks/staging.env
//   set +a
//   export ALICE_TEAM_ID='...'
//   node scripts/staging/build-it-18-invitation-status-checks.mjs
//
// PowerShell has no `source`, so it reads the file line by line instead:
//
//   foreach ($line in Get-Content "$HOME\.config\team-tasks\staging.env") {
//     if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
//       Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim().Trim("'").Trim('"')
//     }
//   }
//   $env:ALICE_TEAM_ID = '...'
//   node scripts/staging/build-it-18-invitation-status-checks.mjs
//
// Close the shell window afterwards: the passwords live in that one process, and
// nothing writes them to disk.
//
// This script reads ALICE_EMAIL, ALICE_PASSWORD and ALICE_TEAM_ID from the
// environment, and NEXT_PUBLIC_SUPABASE_URL and
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from web/.env.local. Nothing else, and it
// never reads the password file itself.
//
// The assistant has never run this script against staging. It has run --selftest;
// that output is in evidence/build-it-18-invitation-status-function.md.
