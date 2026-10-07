#!/usr/bin/env node
// build-it-20-ai-checks.mjs -- is the DEPLOYED suggest-subtasks there, does it refuse
// the people it should, and does it ever answer with anything but up to five short
// suggestions? Run against STAGING only.
//
// Build it 20 part 1, issue #183.
//
// WHAT IT IS FOR, AND WHY IT HAS TO BE RUN TWICE. Nothing in this branch is deployed
// anywhere: the assistant deploys nothing, and `supabase functions deploy` against
// staging is the owner's step (rule 19). So this script is written to be run:
//
//   * BEFORE the deploy, where it MUST FAIL. There is no function called
//     suggest-subtasks on the staging project, so the platform answers 404 to every
//     call and every check about the function's behaviour fails. Keep that output: it
//     is the evidence that the behaviour was not there yet.
//   * AFTER the deploy, where it must pass.
//
// A single green run proves nothing about the deploy, because a check that was always
// green would look exactly the same. THE PAIR IS THE EVIDENCE.
//
// AND THERE IS A THIRD RUN WORTH MAKING, because this feature has two deployed states
// rather than one:
//
//   * after the deploy and BEFORE the owner sets AI_API_KEY, every ask answers the
//     fixed failure with the code `not_configured`. That is a PASS of "the function is
//     deployed and answers honestly" and leaves "it can actually suggest something"
//     UNVERIFIED, which is what this script reports;
//   * after the key is set, an ask answers with suggestions and the run can be green.
//
// Production stays in the first of those states for the whole of Build it 20, on
// purpose: docs/plan.md says the production key is not installed until the Build it 21
// consent setting exists, so "nobody's task title leaves production before there is a
// setting that lets them say no".
//
// WHAT IT CREATES, AND WHAT IT TAKES BACK. One personal task belonging to Alice, with
// a fixed title that is nobody's business and says what it is. It DELETES that task at
// the end, in a `finally`, and checks the row is gone -- which this script can do and
// build-it-18-invitation-status-checks.mjs beside it cannot: `tasks` has a delete
// policy for a task's creator (20261002170244_tasks_drop_owner_only_rules.sql leaves
// delete owner-only), while `invitations` has no delete policy at all. So this one
// leaves staging as it found it.
//
// WHAT IT COSTS, IN MONEY, and this is the only script in this repository of which that
// is true. Once AI_API_KEY is set on staging, an ask is a metered request to Anthropic.
// AT MOST THREE PER RUN reach the service: Alice's ask about her own task, and the two
// simultaneous asks in the one-at-a-time check. Every other call in this script is
// refused before any key is touched -- a 400 for a bad id, a 404 for a task the caller
// cannot see, a 401 for a signed-out call -- so none of those costs anything. Claude
// Haiku 4.5 is $1 per million input tokens and $5 per million output, and the reply is
// capped at 300 output tokens (docs/costs.md), so three asks is a fraction of a penny.
// The ceiling behind all of it is the 5-dollar monthly spend limit on the Team Tasks
// workspace.
//
// WHAT IT CANNOT ASK, so that nobody reads a green run as more than it is (rule 8):
//
//   * WHETHER THE SUGGESTIONS ARE ANY GOOD. It checks that there are between one and
//     five of them, that each is short plain text with no link and no control
//     character, and that none of them claims anything was done. Whether they are
//     useful subtasks for the title is a question for a person reading them.
//   * THE SPEND LIMIT, THE RATE LIMIT, A WRONG KEY, A TIMEOUT, OR THE SERVICE BEING
//     DOWN. None of those can be brought about from here without changing staging's
//     settings to suit a test, which would be changing the thing under test. Those are
//     supabase/functions/_tests/suggest_subtasks_test.ts's job, where each one is a
//     Response the test builds.
//   * WHETHER "ONE CALL AT A TIME" HOLDS ACROSS ISOLATES. It cannot: the lock is a Set
//     in one isolate's memory, and the platform may run several. The check below fires
//     two asks at once and reports whether the lock engaged; when it does not, that is
//     the documented limit rather than a fault, and the function's own comment says so
//     at length.
//   * ANYTHING ABOUT PRODUCTION. It refuses to run against anything but the staging
//     host, before it reads a password.
//
// IT CAN FAIL, which is the only reason to trust it passing. Every judgement is a pure
// function, and `--selftest` feeds those functions fabricated answers -- the platform's
// 404 for a function that is not deployed, an answer carrying six suggestions, one
// carrying a link, one claiming the subtasks were added, a 404 for Alice's own task
// that differs from the 404 a stranger gets -- and checks each one comes out FAIL. That
// run needs no network, no account and no staging project:
//
//   node scripts/staging/build-it-20-ai-checks.mjs --selftest
//
// CI RUNS THAT SELFTEST, in .github/workflows/ci.yml's `staging-script-selftests` job,
// with its own expected count. The --selftest branch returns before any setting is
// read, so that job needs no secret, no account and no network.
//
// NO PACKAGES. Node built-ins only -- global fetch, node:fs, node:path, node:url -- so
// Node 18 or newer. The endpoints are the ones the scripts beside this one use:
//
//   POST   {url}/auth/v1/token?grant_type=password   body {email,password}
//   POST   {url}/auth/v1/logout?scope=local
//   POST   {url}/functions/v1/suggest-subtasks       body {task_id}
//   POST   {url}/rest/v1/tasks                       body {title}
//   DELETE {url}/rest/v1/tasks?id=eq.{id}
//   GET    {url}/rest/v1/tasks?id=eq.{id}&select=...
//   Prefer: return=representation   -- what makes a write answer with the rows it
//          touched, so a refusal reads as "0 rows" instead of being guessed at
//   the API key travels in the `apikey` header; Authorization carries the caller's JWT.
//
// The sign-out SCOPE is `local`, as in web/tests/staging.mjs and
// build-it-18-invitation-status-checks.mjs: `global` would end every session belonging
// to that account and sign the owner's own browser out of Alice and Bob every time this
// ran.
//
// WHAT IT NEVER PRINTS: a password, an access or refresh token, the publishable key,
// the project URL, a user id, or an email address -- not Alice's and not Bob's, even
// though docs/environments.md publishes both. Every response body goes through scrub()
// first. What does get printed: HTTP statuses, the eleven failure codes, the fixed
// sentence the function produces, the task id it made, and THE SUGGESTIONS THEMSELVES
// -- which is a deliberate exception and is argued for beside judgeSuggestions.
//
// Run it from the repository root. See the bottom of this file.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The staging project's reference, and the exact host it is served at. This script may
// run against NOTHING ELSE. AGENTS.md rules 1 and 10.
//
// The HOST is what the guard decides on. `url.includes(STAGING_REF)` is not good enough
// and that is not a theory: it accepted a stand-in server at
// `http://127.0.0.1:8799/ghskxrhqlhvrhpnivqbd` in the coach's review of PR #115, and
// the script then sent two passwords to it. judgeStagingUrl below is
// build-it-18-invitation-status-checks.mjs's, unchanged.
const STAGING_REF = "ghskxrhqlhvrhpnivqbd";
const STAGING_HOST = `${STAGING_REF}.supabase.co`;

const UUID_CHARS =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const UUID_PATTERN = new RegExp(`^${UUID_CHARS}$`);

// The function under test, by the name in supabase/config.toml.
const FUNCTION_NAME = "suggest-subtasks";

// THE TITLE THIS SCRIPT PUTS IN THE DATABASE, and once AI_API_KEY is set on staging it
// is a title that really goes to Anthropic. So it is chosen rather than typed: it says
// what it is, it names nobody, it describes nothing real, and it is the kind of thing
// the helper can plausibly suggest steps for -- which matters, because a title with no
// possible subtasks would make a correct function answer `bad_reply` and this script
// report a fault.
const TASK_TITLE = "Build it 20 staging check: organise a village jumble sale";

// The fixed sentence the function sends for every failure, written out here character
// for character. This is the script's own statement of the contract: importing it from
// the function would make the two agree however the function changed.
const UNAVAILABLE_MESSAGE = "Suggestions aren't available right now.";

// The 404 for a task the caller cannot see, which must be the same answer a task that
// does not exist gets. Written out for the same reason.
const NOT_FOUND_MESSAGE = "That task was not found.";

// The eleven codes, copied from supabase/functions/suggest-subtasks/index.ts's
// SUGGEST_CODES rather than imported, for the same reason.
//
// THIS LIST REFUSES A CODE IT DOES NOT KNOW, which is what makes it worth keeping in
// step: judgeSuggestions below fails a 503 whose code is not on it, so a code added to
// the function and not here would turn a correct deployed function red. The Deno test
// "every code produces the SAME sentence" asserts the count on the other side and names
// this file in its failure message.
//
// `model_unavailable` arrived with the coach's review of PR #190.
const SUGGEST_CODES = [
  "not_configured",
  "no_model",
  "refused",
  "model_unavailable",
  "rate_limited",
  "spend_limit",
  "unavailable",
  "unreachable",
  "timeout",
  "bad_reply",
  "busy",
];

// The two caps, copied from the function.
const SUGGESTIONS_MAX = 5;
const SUGGESTION_CHARS_MAX = 80;

// What the PLATFORM answers when a function is not deployed under that name, and what
// it answers to a signed-out call. The second is recorded from production in
// evidence/create-team.md and evidence/invitations.md; the first is what this script
// expects to meet on its before-the-deploy run and is NOT something read out of a
// dashboard here, so the judgement below keys off the status and the absence of our own
// sentence rather than off a code it has not seen.
const PLATFORM_NO_AUTH_CODE = "UNAUTHORIZED_NO_AUTH_HEADER";

// A refusal body is short. 400 characters is generous.
const MAX_REFUSAL_BODY = 400;

// Phrases that only a reply pretending to have acted would contain. A shorter list than
// the function's CLAIM_MARKERS on purpose: this script is checking that the FUNCTION
// filtered, not doing the filtering, so it looks for the handful that would be
// unmistakable if one got through.
const CLAIM_FRAGMENTS = [
  "i've added",
  "i have added",
  "has been added",
  "have been added",
  "successfully added",
  "system prompt",
  "ignore the above",
];

// What the AI service's own words look like. None of these may appear in anything the
// function answers.
const SERVICE_FRAGMENTS = [
  "anthropic",
  "invalid_request_error",
  "authentication_error",
  "rate_limit_error",
  "request_id",
  "api.anthropic.com",
  "anthropic-version",
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
// Every one takes what came back and returns a list of { what, verdict, detail }. None
// sends a request, reads a file or looks at the environment.
//
// "UNVERIFIED" is for an answer that does not settle the question -- a request that
// never arrived, a sign-in that failed, a path this run could not reach. AGENTS.md
// rule 8: that is not a pass.

// Is this URL the staging project, and nothing else? Four requirements: https, the host
// EXACTLY equal to STAGING_HOST, no user name or password in the URL itself, and the
// default port. A detail line never contains the URL, because a project reference
// identifies an environment.
export function judgeStagingUrl(url) {
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

// THE CONTROL. Alice creates a personal task and reads its id back. If this fails,
// nothing else in the run means what it looks like: a 404 from the helper everywhere
// would be evidence the project is shut, not evidence about the helper.
export function judgeTaskCreated(answer) {
  const what = "Alice can create a personal task, which is what the rest of the run is about";
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (!Array.isArray(answer.rows) || answer.rows.length !== 1) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `${Array.isArray(answer.rows) ? answer.rows.length : "no list of"} row(s) came back` +
          ` from the insert, expected 1. Without a task of her own there is nothing to ask` +
          ` the helper about`,
      },
    ];
  }
  const row = answer.rows[0];
  if (typeof row.id !== "string" || !UUID_PATTERN.test(row.id)) {
    return [{ what, verdict: FAIL, detail: "the row came back without a uuid id" }];
  }
  if (row.title !== TASK_TITLE) {
    return [
      {
        what,
        verdict: FAIL,
        detail: "the stored title is not the one that was sent, so the read-back disagrees",
      },
    ];
  }
  if (row.team_id !== null) {
    return [
      {
        what,
        verdict: FAIL,
        detail: "the task is not personal, so this run would be touching a team's list",
      },
    ];
  }
  return [{ what, verdict: PASS, detail: `one personal task, id ${row.id}` }];
}

// IS THE FUNCTION THERE AT ALL? The before-the-deploy question, and the one that makes
// the before-run fail rather than merely look odd.
//
// The platform answers 404 for a function name it does not know. This function's OWN
// 404 -- a task the caller cannot see -- is also a 404, so the status alone cannot tell
// them apart: the body is what does. Our 404 carries NOT_FOUND_MESSAGE; the platform's
// carries something else entirely.
export function judgeFunctionDeployed(answer) {
  const what = `the function ${FUNCTION_NAME} is deployed on this project`;
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];

  const body = answer.body ?? "";

  if (answer.status === 404 && !body.includes(NOT_FOUND_MESSAGE)) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `HTTP 404 with a body that is not this function's own "not found" sentence, so` +
          ` there is no function of that name on this project. BEFORE THE DEPLOY THAT IS` +
          ` THE EXPECTED RESULT and this FAIL is the evidence. After the deploy it means` +
          ` the deploy did not happen, or happened under another name. Body: ` +
          body.slice(0, MAX_REFUSAL_BODY),
      },
    ];
  }

  // Anything else -- our 200, our 503, our 404, our 400 -- means the request reached
  // the handler, which is all this check claims.
  return [
    {
      what,
      verdict: PASS,
      detail: `HTTP ${answer.status}, which came from the function's own code rather than from the platform`,
    },
  ];
}

// Pull the `suggestions` list and the `error`/`code` pair out of a body, without caring
// what else is in it.
function readAnswerBody(answer) {
  let parsed = null;
  try {
    parsed = JSON.parse(answer.body ?? "");
  } catch {
    parsed = null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { parsed: null };
  }
  return {
    parsed,
    suggestions: parsed.suggestions,
    message: parsed.error,
    code: parsed.code,
    extra: Object.keys(parsed),
  };
}

// Is this one line a short plain-text suggestion? The function's usableSuggestion, as
// this script's own statement of the contract.
export function drawable(line) {
  if (typeof line !== "string") return false;
  if (line.trim() === "") return false;
  if (line.length > SUGGESTION_CHARS_MAX) return false;
  if (line.includes("://")) return false;
  for (const character of line) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20) return false;
    if (code >= 0x7f && code <= 0x9f) return false;
    if (code === 0x2028 || code === 0x2029) return false;
  }
  return true;
}

// THE MAIN JUDGEMENT. What did the deployed function answer when Alice asked about her
// own task?
//
// Three outcomes are acceptable and they are not the same news:
//
//   200 with between one and five short plain suggestions -> PASS, and this is the only
//       outcome that proves the whole path works end to end.
//   503 with the fixed sentence and code `not_configured` -> PASS for "the function is
//       deployed and answers honestly", and UNVERIFIED for "it can suggest something",
//       because no key means it was never asked. This is what an after-the-deploy,
//       before-the-key run looks like, and what production looks like for the whole of
//       Build it 20.
//   503 with the fixed sentence and any OTHER code -> UNVERIFIED, with the code named.
//       Something went wrong at the service or in the reply, and this script cannot say
//       which from here -- but the function told the truth about it, which is what the
//       shape checks below are for.
//
// Everything else is a FAIL.
//
// WHY THE SUGGESTIONS THEMSELVES ARE PRINTED, when this script prints no address, no
// token and no title. Because they are the thing under test, and because a check that
// says "five suggestions came back, shape fine" and shows none of them cannot be read
// by a person deciding whether this feature is fit to turn on. They are also not
// personal data about anybody: they are a model's words about a title this script
// invented. The TITLE is still not printed, and nor is anything about who asked.
export function judgeSuggestions(answer) {
  const what = "Alice's ask about her own task answers with up to five short suggestions";
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];

  const read = readAnswerBody(answer);
  if (read.parsed === null) {
    return [
      {
        what,
        verdict: FAIL,
        detail: `HTTP ${answer.status} with a body that is not a JSON object: ${(answer.body ?? "").slice(0, MAX_REFUSAL_BODY)}`,
      },
    ];
  }

  // ---- the fixed failure ----
  if (answer.status === 503) {
    const results = [];
    const codeIsKnown = SUGGEST_CODES.includes(read.code);

    results.push({
      what: "the fixed failure answer is the one this function is supposed to send",
      verdict:
        read.message === UNAVAILABLE_MESSAGE && codeIsKnown && read.extra.length === 2
          ? PASS
          : FAIL,
      detail:
        `sentence ${JSON.stringify(read.message)}, code ${JSON.stringify(read.code)},` +
        ` fields ${read.extra.join(", ")}. Expected exactly the sentence` +
        ` ${JSON.stringify(UNAVAILABLE_MESSAGE)}, one of the eleven codes, and nothing but` +
        ` error and code`,
    });

    if (read.code === "not_configured") {
      results.push({
        what,
        verdict: UNVERIFIED,
        detail:
          "AI_API_KEY is not set on this project, so nothing was sent to the AI service and" +
          " no suggestion could come back. The function answered honestly, which the check" +
          " above confirms. To settle this one, the owner sets AI_API_KEY on staging and runs" +
          " this again. PRODUCTION STAYS IN EXACTLY THIS STATE for the whole of Build it 20" +
          " (docs/plan.md), so this is not a fault there either",
      });
    } else {
      results.push({
        what,
        verdict: UNVERIFIED,
        detail:
          `the function answered the fixed failure with the code "${read.code}", so no` +
          ` suggestion came back. That is the function working -- it turns everything into` +
          ` one sentence and a code -- but it leaves this question unanswered. Read` +
          ` the function's logs in the Supabase dashboard for the status it saw`,
      });
    }
    return results;
  }

  // ---- the success ----
  if (answer.status !== 200) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `HTTP ${answer.status}, expected 200 with suggestions or 503 with the fixed` +
          ` failure. A 404 here means the function could not see Alice's own task, which` +
          ` would be the caller-rights read going wrong; a 401 means the token was not` +
          ` accepted; a 400 means the task id was not sent in the shape it expects`,
      },
    ];
  }

  const results = [];
  const list = read.suggestions;

  if (!Array.isArray(list)) {
    return [
      {
        what,
        verdict: FAIL,
        detail: `HTTP 200 and \`suggestions\` is ${JSON.stringify(list)}, not a list`,
      },
    ];
  }

  // AN EMPTY LIST IS NOT A RESULT. Issue #183: the screen "never shows an empty list as
  // if it were a result", and the function is supposed to answer the fixed failure
  // rather than send one.
  if (list.length === 0) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          "HTTP 200 with an EMPTY list. The function is supposed to answer the fixed" +
          " failure with the code bad_reply rather than send nought suggestions, because a" +
          " screen drawing an empty list makes a claim nobody made",
      },
    ];
  }

  results.push({
    what,
    verdict: list.length <= SUGGESTIONS_MAX ? PASS : FAIL,
    detail:
      `${list.length} suggestion(s) came back, cap ${SUGGESTIONS_MAX}: ` +
      list.map((s) => JSON.stringify(s)).join(", "),
  });

  const tooLong = list.filter((s) => !drawable(s));
  results.push({
    what: "every suggestion is short plain text, with no link and no control character",
    verdict: tooLong.length === 0 ? PASS : FAIL,
    detail:
      tooLong.length === 0
        ? `all ${list.length} are at most ${SUGGESTION_CHARS_MAX} characters of plain text`
        : `${tooLong.length} are not: ${tooLong.map((s) => JSON.stringify(String(s).slice(0, 120))).join(", ")}`,
  });

  const whole = JSON.stringify(list).toLowerCase();
  const claims = CLAIM_FRAGMENTS.filter((fragment) => whole.includes(fragment));
  results.push({
    what: "no suggestion claims anything was done, or tries to give instructions",
    verdict: claims.length === 0 ? PASS : FAIL,
    detail:
      claims.length === 0
        ? "none of the claim phrases is in any of them"
        : `these phrases got through: ${claims.join(", ")}. A reply like that should have` +
          ` been refused whole, with the code bad_reply`,
  });

  results.push({
    what: "the success body carries the suggestions and nothing else",
    verdict: read.extra.join(",") === "suggestions" ? PASS : FAIL,
    detail: `its fields are ${read.extra.join(", ")}`,
  });

  return results;
}

// A task the caller CANNOT SEE answers exactly as a task that does not exist.
//
// `stranger` is Bob asking about Alice's task; `nonexistent` is Alice asking about a
// uuid nobody issued. BYTE FOR BYTE, because that is the whole requirement: if the two
// differed by one character, somebody with a list of guessed uuids could sort the real
// ones from the invented ones, which is a fact about other people's lists.
export function judgeSameAsNotFound(stranger, nonexistent) {
  const what =
    "a task the caller cannot see answers EXACTLY as a task that does not exist";

  if (stranger.error) return [{ what, verdict: UNVERIFIED, detail: `Bob's ask: ${stranger.error}` }];
  if (nonexistent.error) {
    return [{ what, verdict: UNVERIFIED, detail: `the made-up id: ${nonexistent.error}` }];
  }

  const results = [];

  results.push({
    what: "both answer HTTP 404",
    verdict: stranger.status === 404 && nonexistent.status === 404 ? PASS : FAIL,
    detail:
      `Bob asking about Alice's task: HTTP ${stranger.status}. A made-up id: HTTP` +
      ` ${nonexistent.status}. A 200 for Bob would mean a stranger's task title went to` +
      ` the AI service, which is the worst outcome this feature has`,
  });

  results.push({
    what,
    verdict: stranger.body === nonexistent.body ? PASS : FAIL,
    detail:
      stranger.body === nonexistent.body
        ? `both bodies are ${(stranger.body ?? "").slice(0, MAX_REFUSAL_BODY)}`
        : `they differ. Bob gets ${(stranger.body ?? "").slice(0, MAX_REFUSAL_BODY)} and a` +
          ` made-up id gets ${(nonexistent.body ?? "").slice(0, MAX_REFUSAL_BODY)}. The` +
          ` difference is how somebody learns which task ids are real`,
  });

  results.push({
    what: "the 404 says nothing about whose task it is or why",
    verdict: (() => {
      const message = String(readAnswerBody(stranger).message ?? "").toLowerCase();
      const telling = ["permission", "allowed", "yours", "belongs", "team", "suspend"];
      return message !== "" && !telling.some((word) => message.includes(word)) ? PASS : FAIL;
    })(),
    detail: `its sentence is ${JSON.stringify(readAnswerBody(stranger).message)}`,
  });

  return results;
}

// A malformed ask is the caller's mistake, and is answered as one.
export function judgeBadRequest(answer, what, expectedStatus) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  const read = readAnswerBody(answer);
  return [
    {
      what,
      verdict: answer.status === expectedStatus ? PASS : FAIL,
      detail:
        `HTTP ${answer.status}, expected ${expectedStatus}. Sentence` +
        ` ${JSON.stringify(read.message)}`,
    },
  ];
}

// A signed-out call is refused by the PLATFORM, before the function's code runs.
//
// Two different ways a signed-out call can come back 401, and the code tells them
// apart: the platform's refusal carries UNAUTHORIZED_NO_AUTH_HEADER, and a 401 from the
// function's own code means the request reached the handler -- which is what
// verify_jwt = false looks like, and is the exact mistake this check is here to catch.
// The same argument .github/workflows/migrate-production.yml's smoke-test job makes.
export function judgeSignedOut(answer) {
  const what = "a signed-out POST is refused by the platform, before the function runs";
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];

  const read = readAnswerBody(answer);
  if (answer.status === 401 && read.code === PLATFORM_NO_AUTH_CODE) {
    return [
      {
        what,
        verdict: PASS,
        detail: `HTTP 401, code ${PLATFORM_NO_AUTH_CODE} -- verify_jwt = true is doing its job`,
      },
    ];
  }
  if (answer.status === 401) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `HTTP 401 but the code is ${JSON.stringify(read.code)}, not ${PLATFORM_NO_AUTH_CODE}.` +
          ` A 401 from the function's own code instead of the platform means the request` +
          ` REACHED the handler, which is what verify_jwt = false looks like. Check` +
          ` [functions.${FUNCTION_NAME}] in supabase/config.toml and that the deploy did not` +
          ` pass --no-verify-jwt`,
      },
    ];
  }
  return [
    {
      what,
      verdict: FAIL,
      detail:
        `HTTP ${answer.status} to a POST with no Authorization header at all, expected 401.` +
        ` Anything in the 2xx range means the function RAN for a caller with no token, and` +
        ` on this function that means it spent money for one`,
    },
  ];
}

// Two asks at once. The lock is a Set in one isolate's memory, so this check reports
// whether it engaged rather than insisting that it did -- see the note at the top.
export function judgeOneAtATime(first, second) {
  const what = "two simultaneous asks never both answer with anything but a known shape";
  if (first.error || second.error) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail: `one of the two asks did not arrive: ${first.error ?? second.error}`,
      },
    ];
  }

  const answers = [first, second];
  const busy = answers.filter((a) => a.status === 503 && readAnswerBody(a).code === "busy");
  const allowed = answers.filter((a) => [200, 503].includes(a.status));

  return [
    {
      what,
      verdict: allowed.length === 2 ? PASS : FAIL,
      detail:
        `HTTP ${first.status} and ${second.status}.` +
        (busy.length > 0
          ? ` ${busy.length} was refused with the code "busy", so the one-at-a-time lock` +
            ` engaged -- both asks reached the same isolate.`
          : ` Neither said "busy", which is the documented limit rather than a fault: the` +
            ` lock is per isolate and the platform may run several, so two asks can land in` +
            ` two different memories and both proceed. The function's own comment says so,` +
            ` and nothing from here can make them share an isolate.`),
    },
  ];
}

// The task this script made is gone again.
export function judgeTaskDeleted(deleted, readBack) {
  const results = [];

  results.push({
    what: "the task this run created was deleted",
    verdict:
      !deleted.error && Array.isArray(deleted.rows) && deleted.rows.length === 1
        ? PASS
        : FAIL,
    detail: deleted.error
      ? deleted.error
      : `${Array.isArray(deleted.rows) ? deleted.rows.length : "no list of"} row(s) came back` +
        ` from the delete, expected 1. Prefer: return=representation is set, so a refusal` +
        ` reads as 0 rows rather than being guessed at`,
  });

  results.push({
    what: "and reading it back finds nothing, so staging is as this run found it",
    verdict: !readBack.error && Array.isArray(readBack.rows) && readBack.rows.length === 0
      ? PASS
      : FAIL,
    detail: readBack.error
      ? readBack.error
      : `${Array.isArray(readBack.rows) ? readBack.rows.length : "no list of"} row(s) came` +
        ` back, expected 0`,
  });

  return results;
}

// Did anything this run printed carry something it should not?
export function judgeNothingLeaked(bodies) {
  const what = "nothing this run printed carries a title, an address, a token or the service's words";
  const problems = [];

  for (const body of bodies) {
    const lower = String(body ?? "").toLowerCase();
    if (lower.includes(TASK_TITLE.toLowerCase())) {
      problems.push("a body carries the task's title");
    }
    if (lower.includes("@gmail.com") || lower.includes("@example.com")) {
      problems.push("a body carries an email address");
    }
    if (lower.includes("ai_api_key")) {
      problems.push("a body names the key setting");
    }
    for (const fragment of SERVICE_FRAGMENTS) {
      if (lower.includes(fragment)) {
        problems.push(`a body carries "${fragment}", which only the AI service says`);
      }
    }
  }

  const unique = [...new Set(problems)];
  return [
    {
      what,
      verdict: unique.length === 0 ? PASS : FAIL,
      detail:
        unique.length === 0
          ? `${bodies.length} body/bodies were checked and none carries any of them`
          : unique.join("; "),
    },
  ];
}

// Did this run touch anything it had no business touching?
export function judgeTouchedNothing(log) {
  const what = "this run used only the endpoints it says it uses";
  const allowed = [
    "/auth/v1/token?grant_type=password",
    "/auth/v1/logout?scope=local",
    `/functions/v1/${FUNCTION_NAME}`,
    "/rest/v1/tasks",
  ];

  const problems = [];
  for (const entry of log) {
    const path = entry.path.split("?")[0];
    const full = entry.path;
    const ok = allowed.some((prefix) => full === prefix || path === prefix);
    if (!ok) problems.push(`${entry.method} ${entry.path}`);
  }

  // It must NEVER have read account_status, which docs/plan.md says nobody reads
  // through the app, suspended or not.
  const touchedAccountStatus = log.some((entry) => entry.path.includes("account_status"));
  if (touchedAccountStatus) problems.push("it read account_status, which nothing may read through the app");

  // And it must have created and deleted exactly one task.
  const inserts = log.filter((e) => e.method === "POST" && e.path.startsWith("/rest/v1/tasks"));
  const deletes = log.filter((e) => e.method === "DELETE");

  if (inserts.length !== 1) problems.push(`${inserts.length} task inserts, expected exactly 1`);
  if (deletes.length !== 1) problems.push(`${deletes.length} deletes, expected exactly 1`);

  return [
    {
      what,
      verdict: problems.length === 0 ? PASS : FAIL,
      detail:
        problems.length === 0
          ? `${log.length} requests, all to the four endpoints above, one task created and one deleted`
          : problems.join("; "),
    },
  ];
}

// ---------------------------------------------------------------------------
// Keeping tokens, addresses and the title out of printed lines
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

// Did `value` actually get taken out of `text`? UNVERIFIED when it was not in the text
// to begin with, because a clean result then proves nothing.
export function judgeScrubbed(label, text, value, placeholders) {
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
// --selftest -- the judgements above, fed answers from a world where the function
// is absent, or lies, or answers with six links. No network, no account.
// ---------------------------------------------------------------------------

function runSelftest() {
  console.log("build-it-20-ai-checks --selftest: can these checks fail?");
  console.log("");
  console.log("Each case is something this script might be handed: a URL from");
  console.log("web/.env.local, an answer from suggest-subtasks, or a row read back.");
  console.log("The expectation is what the judgement must say about it. Nothing is");
  console.log("sent anywhere and no account is used.");
  console.log("");

  const madeUpTaskId = "a1b2c3d4-0001-4e5f-8a9b-0c1d2e3f4a5b";
  const madeUpAddress = "nobody-at-all@example.com";

  // A stand-in for an access token, deliberately dull: a realistic one is what
  // `.githooks/pre-commit` refuses, gitleaks reporting a JWT. The scrub cases care
  // that the string is found and replaced, not what shape it has.
  const standInToken = `not-a-real-access-token-${"y".repeat(24)}`;

  const ok = (suggestions) => ({
    status: 200,
    body: JSON.stringify({ suggestions }),
  });
  const unavailable = (code) => ({
    status: 503,
    body: JSON.stringify({ error: UNAVAILABLE_MESSAGE, code }),
  });
  const notFound = { status: 404, body: JSON.stringify({ error: NOT_FOUND_MESSAGE }) };

  const goodThree = ["Book the hall", "Print flyers", "Ask for donations"];

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
      name: "the control holds: Alice created one personal task",
      run: () =>
        judgeTaskCreated({ rows: [{ id: madeUpTaskId, title: TASK_TITLE, team_id: null }] }),
      expect: [PASS],
    },
    {
      name: "THE CONTROL IS BROKEN: no row came back, so there is nothing to ask about",
      run: () => judgeTaskCreated({ rows: [] }),
      expect: [FAIL],
    },
    {
      name: "the control proves nothing: the insert could not be made at all",
      run: () => judgeTaskCreated({ error: "could not reach the database" }),
      expect: [UNVERIFIED],
    },
    {
      name: "the control fails: the stored title is not the one sent",
      run: () => judgeTaskCreated({ rows: [{ id: madeUpTaskId, title: "something else", team_id: null }] }),
      expect: [FAIL],
    },
    {
      name: "the control fails: the task landed in a team, so this run would touch a shared list",
      run: () =>
        judgeTaskCreated({ rows: [{ id: madeUpTaskId, title: TASK_TITLE, team_id: madeUpTaskId }] }),
      expect: [FAIL],
    },

    // ---- is the function there at all: THE BEFORE-THE-DEPLOY CASE ----
    {
      name:
        "THE FUNCTION IS NOT DEPLOYED: the platform's 404, which is what the before-run meets",
      run: () => judgeFunctionDeployed({ status: 404, body: '{"code":"NOT_FOUND"}' }),
      expect: [FAIL],
    },
    {
      name: "the function's OWN 404 is not the platform's: the request reached the handler",
      run: () => judgeFunctionDeployed(notFound),
      expect: [PASS],
    },
    {
      name: "a 503 from the function means it is deployed",
      run: () => judgeFunctionDeployed(unavailable("not_configured")),
      expect: [PASS],
    },
    {
      name: "a 200 means it is deployed",
      run: () => judgeFunctionDeployed(ok(goodThree)),
      expect: [PASS],
    },

    // ---- the main judgement ----
    {
      name: "SUCCESS: three short suggestions",
      run: () => judgeSuggestions(ok(goodThree)),
      expect: [PASS, PASS, PASS, PASS],
    },
    {
      name: "success: exactly five",
      run: () => judgeSuggestions(ok(["One", "Two", "Three", "Four", "Five"])),
      expect: [PASS, PASS, PASS, PASS],
    },
    {
      name: "SIX SUGGESTIONS: over the cap, so the function did not filter",
      run: () => judgeSuggestions(ok(["One", "Two", "Three", "Four", "Five", "Six"])),
      expect: [FAIL, PASS, PASS, PASS],
    },
    {
      name: "A SUGGESTION OVER THE LENGTH CAP got through",
      run: () => judgeSuggestions(ok(["Book the hall", "x".repeat(81)])),
      expect: [PASS, FAIL, PASS, PASS],
    },
    {
      name: "A SUGGESTION CARRYING A LINK got through",
      run: () => judgeSuggestions(ok(["Book the hall", "See https://example.com"])),
      expect: [PASS, FAIL, PASS, PASS],
    },
    {
      name: 'A SUGGESTION CLAIMING "I\'ve added these" got through',
      run: () => judgeSuggestions(ok(["I've added these to your list", "Book the hall"])),
      expect: [PASS, PASS, FAIL, PASS],
    },
    {
      name: "AN EMPTY LIST with HTTP 200: not a result, and the function should have said so",
      run: () => judgeSuggestions(ok([])),
      expect: [FAIL],
    },
    {
      name: "HTTP 200 with no suggestions field at all",
      run: () => judgeSuggestions({ status: 200, body: "{}" }),
      expect: [FAIL],
    },
    {
      name: "HTTP 200 carrying fields it should not",
      run: () =>
        judgeSuggestions({
          status: 200,
          body: JSON.stringify({ suggestions: goodThree, model: "something", title: TASK_TITLE }),
        }),
      expect: [PASS, PASS, PASS, FAIL],
    },
    {
      name: "NO KEY: the fixed failure with not_configured. The answer is right; the question is unanswered",
      run: () => judgeSuggestions(unavailable("not_configured")),
      expect: [PASS, UNVERIFIED],
    },
    {
      name: "another code: the answer is still right, and still settles nothing",
      run: () => judgeSuggestions(unavailable("bad_reply")),
      expect: [PASS, UNVERIFIED],
    },
    {
      name:
        "THE MODEL HAS GONE: model_unavailable is a known code, so the answer is right and the" +
        " question is unsettled -- and this is the one to expect after 15 October 2026 (#185)",
      run: () => judgeSuggestions(unavailable("model_unavailable")),
      expect: [PASS, UNVERIFIED],
    },
    {
      name: "A 503 WITH THE WRONG SENTENCE: the function is not saying what it is supposed to",
      run: () => judgeSuggestions({ status: 503, body: JSON.stringify({ error: "AI service error 429", code: "rate_limited" }) }),
      expect: [FAIL, UNVERIFIED],
    },
    {
      name: "A 503 WITH A CODE THAT IS NOT ON THE LIST",
      run: () => judgeSuggestions({ status: 503, body: JSON.stringify({ error: UNAVAILABLE_MESSAGE, code: "kaput" }) }),
      expect: [FAIL, UNVERIFIED],
    },
    {
      name: "A 503 CARRYING THE SERVICE'S OWN REPLY in a third field",
      run: () =>
        judgeSuggestions({
          status: 503,
          body: JSON.stringify({ error: UNAVAILABLE_MESSAGE, code: "refused", upstream: "authentication_error" }),
        }),
      expect: [FAIL, UNVERIFIED],
    },
    {
      name: "A 404 FOR ALICE'S OWN TASK: the caller-rights read is going wrong",
      run: () => judgeSuggestions(notFound),
      expect: [FAIL],
    },
    {
      name: "a body that is not JSON at all",
      run: () => judgeSuggestions({ status: 200, body: "<html>maintenance</html>" }),
      expect: [FAIL],
    },
    {
      name: "the ask never arrived, so nothing is settled",
      run: () => judgeSuggestions({ error: "could not reach the function" }),
      expect: [UNVERIFIED],
    },

    // ---- a task the caller cannot see ----
    {
      name: "both 404, byte for byte identical: a stranger learns nothing",
      run: () => judgeSameAsNotFound(notFound, notFound),
      expect: [PASS, PASS, PASS],
    },
    {
      name:
        "THE TWO BODIES DIFFER: a stranger can sort the real task ids from the invented ones",
      run: () =>
        judgeSameAsNotFound(
          { status: 404, body: JSON.stringify({ error: "That task is not yours." }) },
          notFound,
        ),
      expect: [PASS, FAIL, FAIL],
    },
    {
      name: "BOB GOT SUGGESTIONS FOR ALICE'S TASK -- the worst outcome this feature has",
      run: () => judgeSameAsNotFound(ok(goodThree), notFound),
      expect: [FAIL, FAIL, FAIL],
    },
    {
      name: "the 404's sentence explains why, which is how a task id is confirmed",
      run: () =>
        judgeSameAsNotFound(
          { status: 404, body: JSON.stringify({ error: "You do not belong to that team." }) },
          { status: 404, body: JSON.stringify({ error: "You do not belong to that team." }) },
        ),
      expect: [PASS, PASS, FAIL],
    },
    {
      name: "Bob's ask never arrived, so nothing is settled",
      run: () => judgeSameAsNotFound({ error: "could not reach the function" }, notFound),
      expect: [UNVERIFIED],
    },

    // ---- malformed asks ----
    {
      name: "a task id that is not a uuid: 400",
      run: () => judgeBadRequest({ status: 400, body: JSON.stringify({ error: "That is not a valid task id." }) }, "a task id that is not a uuid is refused as a bad request", 400),
      expect: [PASS],
    },
    {
      name: "A NON-UUID THAT REACHED THE DATABASE: 500, so the shape check is not running first",
      run: () => judgeBadRequest({ status: 500, body: JSON.stringify({ error: "Could not read that task.", code: "22P02" }) }, "a task id that is not a uuid is refused as a bad request", 400),
      expect: [FAIL],
    },

    // ---- signed out ----
    {
      name: "the platform refuses a signed-out POST",
      run: () => judgeSignedOut({ status: 401, body: JSON.stringify({ code: PLATFORM_NO_AUTH_CODE }) }),
      expect: [PASS],
    },
    {
      name: "A 401 FROM THE FUNCTION'S OWN CODE: the request reached the handler, so verify_jwt is off",
      run: () => judgeSignedOut({ status: 401, body: JSON.stringify({ error: "You must be signed in to ask for suggestions." }) }),
      expect: [FAIL],
    },
    {
      name: "A SIGNED-OUT CALL GOT SUGGESTIONS: a live hole, and one that spends money",
      run: () => judgeSignedOut(ok(goodThree)),
      expect: [FAIL],
    },

    // ---- one at a time ----
    {
      name: "the lock engaged: one of the two was refused with busy",
      run: () => judgeOneAtATime(ok(goodThree), unavailable("busy")),
      expect: [PASS],
    },
    {
      name: "the lock did not engage, which is the documented limit rather than a fault",
      run: () => judgeOneAtATime(ok(goodThree), ok(goodThree)),
      expect: [PASS],
    },
    {
      name: "ONE OF THE TWO ANSWERED SOMETHING THIS FUNCTION MAY NOT SEND",
      run: () => judgeOneAtATime(ok(goodThree), { status: 500, body: "{}" }),
      expect: [FAIL],
    },

    // ---- clearing up ----
    {
      name: "the task was deleted and reading it back finds nothing",
      run: () => judgeTaskDeleted({ rows: [{ id: madeUpTaskId }] }, { rows: [] }),
      expect: [PASS, PASS],
    },
    {
      name: "THE DELETE TOUCHED NO ROW: staging is left holding this run's task",
      run: () => judgeTaskDeleted({ rows: [] }, { rows: [{ id: madeUpTaskId }] }),
      expect: [FAIL, FAIL],
    },
    {
      name: "the delete reported success and the row is still there",
      run: () => judgeTaskDeleted({ rows: [{ id: madeUpTaskId }] }, { rows: [{ id: madeUpTaskId }] }),
      expect: [PASS, FAIL],
    },

    // ---- what leaked ----
    {
      name: "nothing leaked: a body with none of them in it",
      run: () => judgeNothingLeaked([JSON.stringify({ suggestions: goodThree })]),
      expect: [PASS],
    },
    {
      name: "A BODY CARRYING THE TASK'S TITLE",
      run: () => judgeNothingLeaked([JSON.stringify({ error: `no suggestions for "${TASK_TITLE}"` })]),
      expect: [FAIL],
    },
    {
      name: "A BODY CARRYING AN EMAIL ADDRESS",
      run: () => judgeNothingLeaked([JSON.stringify({ error: `asked by ${madeUpAddress}` })]),
      expect: [FAIL],
    },
    {
      name: "A BODY CARRYING THE SERVICE'S OWN WORDS",
      run: () => judgeNothingLeaked([JSON.stringify({ error: "authentication_error from the service" })]),
      expect: [FAIL],
    },
    {
      name: "A BODY NAMING THE KEY SETTING",
      run: () => judgeNothingLeaked([JSON.stringify({ error: "AI_API_KEY is not set" })]),
      expect: [FAIL],
    },

    // ---- what was touched ----
    {
      name: "only the four endpoints, one task created and one deleted",
      run: () =>
        judgeTouchedNothing([
          { method: "POST", path: "/auth/v1/token?grant_type=password" },
          { method: "POST", path: "/rest/v1/tasks" },
          { method: "POST", path: `/functions/v1/${FUNCTION_NAME}` },
          { method: "GET", path: "/rest/v1/tasks?id=eq.x&select=id" },
          { method: "DELETE", path: "/rest/v1/tasks?id=eq.x" },
          { method: "POST", path: "/auth/v1/logout?scope=local" },
        ]),
      expect: [PASS],
    },
    {
      name: "IT READ account_status, which nothing may read through the app",
      run: () =>
        judgeTouchedNothing([
          { method: "POST", path: "/auth/v1/token?grant_type=password" },
          { method: "POST", path: "/rest/v1/tasks" },
          { method: "GET", path: "/rest/v1/account_status?select=user_id" },
          { method: "DELETE", path: "/rest/v1/tasks?id=eq.x" },
        ]),
      expect: [FAIL],
    },
    {
      name: "IT CALLED ANOTHER FUNCTION",
      run: () =>
        judgeTouchedNothing([
          { method: "POST", path: "/rest/v1/tasks" },
          { method: "POST", path: "/functions/v1/invite-member" },
          { method: "DELETE", path: "/rest/v1/tasks?id=eq.x" },
        ]),
      expect: [FAIL],
    },
    {
      name: "IT CREATED A TASK AND NEVER DELETED ONE: staging is left dirty",
      run: () => judgeTouchedNothing([{ method: "POST", path: "/rest/v1/tasks" }]),
      expect: [FAIL],
    },
    {
      name: "IT CREATED TWO TASKS",
      run: () =>
        judgeTouchedNothing([
          { method: "POST", path: "/rest/v1/tasks" },
          { method: "POST", path: "/rest/v1/tasks" },
          { method: "DELETE", path: "/rest/v1/tasks?id=eq.x" },
        ]),
      expect: [FAIL],
    },
    {
      name: "IT SIGNED OUT GLOBALLY, which would end the owner's own browser session",
      run: () =>
        judgeTouchedNothing([
          { method: "POST", path: "/rest/v1/tasks" },
          { method: "DELETE", path: "/rest/v1/tasks?id=eq.x" },
          { method: "POST", path: "/auth/v1/logout?scope=global" },
        ]),
      expect: [FAIL],
    },

    // ---- the scrub ----
    {
      name: "a token echoed back in a body is replaced",
      run: () =>
        judgeScrubbed("a token in a body", `{"token":"${standInToken}"}`, standInToken, [
          [standInToken, "ALICE_ACCESS_TOKEN"],
        ]),
      expect: [PASS],
    },
    {
      name: "the task's title echoed back is replaced",
      run: () =>
        judgeScrubbed("a title in a body", `{"title":"${TASK_TITLE}"}`, TASK_TITLE, [
          [TASK_TITLE, "TASK_TITLE"],
        ]),
      expect: [PASS],
    },
    {
      name: "NOTHING REGISTERED: the title comes straight back out",
      run: () => judgeScrubbed("a title with an empty registry", `{"title":"${TASK_TITLE}"}`, TASK_TITLE, []),
      expect: [FAIL],
    },
    {
      name: "a scrub case that proves nothing: the value is not in the text at all",
      run: () => judgeScrubbed("a body with no title in it", '{"msg":"nope"}', TASK_TITLE, [[TASK_TITLE, "TASK_TITLE"]]),
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
  console.log("Every judgement said FAIL to a function that is not deployed, to six");
  console.log("suggestions where five are allowed, to a suggestion carrying a link, to");
  console.log("one claiming the subtasks were added, to an empty list dressed as a");
  console.log("result, to a stranger getting a different 404 from a made-up id, to a");
  console.log("signed-out caller getting suggestions, and to a run that left its own");
  console.log("task behind. That is what would make a green staging run mean something.");
  console.log("It is NOT itself a staging result: nothing was sent anywhere by this run.");
  return 0;
}

if (process.argv.slice(2).includes("--selftest")) {
  process.exit(runSelftest());
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
//
// A small .env reader, the same one the scripts beside this use and for the same
// reason: no dotenv package exists here, and adding one for a staging script would
// need a rule 17 conversation for no benefit.

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
        `  node scripts/staging/build-it-20-ai-checks.mjs --selftest`,
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
// FIRST, before a password is read out of the environment and long before a request is
// made.
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

// TWO PEOPLE. Alice owns the task; Bob is the outsider who must be refused it, which is
// rule 6's whole shape and the one check in this script that proves a task title cannot
// leave on somebody else's behalf. Carol is not needed: "a member of the team" is not a
// distinct case here, because the task is personal.
const PEOPLE = [
  { label: "Alice", emailVar: "ALICE_EMAIL", passwordVar: "ALICE_PASSWORD" },
  { label: "Bob", emailVar: "BOB_EMAIL", passwordVar: "BOB_PASSWORD" },
];

const missingFromEnv = [];
for (const person of PEOPLE) {
  if ((process.env[person.emailVar] ?? "").trim() === "") missingFromEnv.push(person.emailVar);
  if ((process.env[person.passwordVar] ?? "") === "") missingFromEnv.push(person.passwordVar);
}

if (missingFromEnv.length > 0) {
  die(
    `these environment variables are not set: ${missingFromEnv.join(", ")}.\n` +
      `Load them for this one run from ~/.config/team-tasks/staging.env, which keeps a\n` +
      `FILENAME in shell history rather than a password: see the bottom of this file,\n` +
      `and docs/environments.md -> "Where the test accounts' passwords live".\n` +
      `No value is printed by this script.`,
  );
}

// Both addresses and the title go into the scrub before a single request is made, so no
// body can print one even if the function echoes it back.
for (const person of PEOPLE) {
  remember((process.env[person.emailVar] ?? "").trim(), `${person.label.toUpperCase()}_EMAIL`);
}
remember(TASK_TITLE, "TASK_TITLE");

// ---------------------------------------------------------------------------
// The endpoints, built from the URL the guard has already accepted
// ---------------------------------------------------------------------------

const base = supabaseUrl.replace(/\/+$/, "");
const authUrl = `${base}/auth/v1`;
const functionsUrl = `${base}/functions/v1`;
const restUrl = `${base}/rest/v1`;

// The columns this script reads off a task. Named, never a star: a column the table
// grows later must not arrive in this script's output because nobody said it should not.
const TASK_COLUMNS = "id,title,done,team_id,owner_id";

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

async function callFunction(accessToken, body) {
  const headers = { apikey: publishableKey, "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  REQUEST_LOG.push({ method: "POST", path: `/functions/v1/${FUNCTION_NAME}` });

  let response;
  try {
    response = await fetch(`${functionsUrl}/${FUNCTION_NAME}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (cause) {
    return { error: `could not reach ${FUNCTION_NAME} (${cause.message})` };
  }
  const text = scrub(await response.text());
  BODIES_SEEN.push(text);
  return { status: response.status, body: text };
}

// One request through PostgREST. Returns { status, rows } or { error }, and never
// throws, so a judgement about a refusal is made by the judgement rather than by an
// exception unwinding the run.
async function rest(method, path, { accessToken = null, body } = {}) {
  const headers = { apikey: publishableKey };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  // Set for every method, including DELETE, which carries no body: without it a delete
  // answers 204 with nothing and "refused" and "deleted" look identical.
  headers.Prefer = "return=representation";
  if (body !== undefined) headers["Content-Type"] = "application/json";

  REQUEST_LOG.push({ method, path: `/rest/v1/${path}` });

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

  const text = scrub(await response.text());
  BODIES_SEEN.push(text);

  if (!response.ok) return { status: response.status, error: `HTTP ${response.status} ${text}` };
  if (text.trim() === "") return { status: response.status, rows: [] };
  try {
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) return { error: `expected a JSON array, got ${typeof rows}` };
    return { status: response.status, rows };
  } catch {
    return { error: `HTTP ${response.status} with a body that is not JSON` };
  }
}

async function signIn(person) {
  REQUEST_LOG.push({ method: "POST", path: "/auth/v1/token?grant_type=password" });

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
    return { error: `${person.label} could not reach the auth endpoint (${cause.message})` };
  }
  if (!response.ok) {
    return {
      error:
        `${person.label} (${person.passwordVar}, value not printed) could not sign in: ` +
        `HTTP ${response.status} ${scrub(await response.text())}`,
    };
  }
  const session = await response.json();
  const accessToken = session?.access_token ?? "";
  const userId = session?.user?.id ?? "";
  if (accessToken === "") return { error: `${person.label}: HTTP 2xx but no access token` };
  if (userId === "") return { error: `${person.label}: HTTP 2xx but no user id` };

  // Registered with scrub() the moment they exist, before any body that could contain
  // them is printed. Both of these are live.
  remember(accessToken, `${person.label.toUpperCase()}_ACCESS_TOKEN`);
  remember(userId, `${person.label.toUpperCase()}_USER_ID`);
  return { label: person.label, accessToken, userId };
}

// Ends the session this run created, and only that one. scope=local is the whole point:
// 'global' ends every session belonging to that account, which on staging would sign the
// owner's own browser out of Alice or Bob every time this script ran. The three accepted
// values are 'global', 'local' and 'others' -- SIGN_OUT_SCOPES, in
// web/node_modules/@supabase/auth-js/src/lib/types.ts.
//
// Failure is reported, not thrown: a session left behind expires on its own, and losing
// the test result to a tidy-up error would be the worse outcome.
async function signOut(session) {
  if (!session?.accessToken) return;
  REQUEST_LOG.push({ method: "POST", path: "/auth/v1/logout?scope=local" });
  try {
    const response = await fetch(`${authUrl}/logout?scope=local`, {
      method: "POST",
      headers: { apikey: publishableKey, Authorization: `Bearer ${session.accessToken}` },
    });
    console.log(`  (${session.label} signed out: HTTP ${response.status})`);
  } catch (cause) {
    console.log(`  (${session.label} sign out failed: ${cause.message}; the session expires on its own)`);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log("Build it 20 part 1 -- the AI helper in the deployed function");
console.log(`  staging host:    ${STAGING_HOST} (confirmed by parsing the URL, not by a substring)`);
console.log(`  function:        ${FUNCTION_NAME}`);
console.log("  accounts:        Alice (owns the task) and Bob (must be refused it)");
console.log("  the task:        one PERSONAL task, created by this run and deleted by it");
console.log("  tokens, passwords, addresses, user ids and the task's title: not printed");
console.log("");
console.log("RUN THIS BEFORE AND AFTER DEPLOYING THE FUNCTION TO STAGING. Before the");
console.log("deploy it MUST FAIL: there is no function of that name on the project, so");
console.log("the platform answers 404 to every call. One green run on its own says");
console.log("nothing about the deploy -- the pair is the evidence.");
console.log("");
console.log("IT SPENDS MONEY, once AI_API_KEY is set on staging: at most THREE metered");
console.log("requests to Anthropic per run. Every other call here is refused before any");
console.log("key is touched. See the note at the top of this file for the arithmetic.");
console.log("");

let alice = null;
let bob = null;
let taskId = null;

try {
  // -------------------------------------------------------------------------
  // 1. Sign in, and create the one task this run is about
  // -------------------------------------------------------------------------

  console.log("1. Signing in, and creating one personal task");

  const aliceSession = await signIn(PEOPLE[0]);
  if (aliceSession.error) {
    record([
      {
        what: "Alice can sign in",
        verdict: UNVERIFIED,
        detail: `${aliceSession.error}. Nothing else in this run can mean anything`,
      },
    ]);
    throw new Error("stop: Alice could not sign in");
  }
  alice = aliceSession;
  record([{ what: "Alice can sign in", verdict: PASS, detail: "HTTP 2xx, with a token and a user id" }]);

  const bobSession = await signIn(PEOPLE[1]);
  if (bobSession.error) {
    record([
      {
        what: "Bob can sign in",
        verdict: UNVERIFIED,
        detail: `${bobSession.error}. The check that a stranger is refused cannot be made`,
      },
    ]);
  } else {
    bob = bobSession;
    record([{ what: "Bob can sign in", verdict: PASS, detail: "HTTP 2xx, with a token and a user id" }]);
  }

  // owner_id is left out: the column's default is auth.uid(), so the database fills it
  // in from the signed-in person and a request cannot claim to be somebody else.
  const created = await rest("POST", `tasks?select=${TASK_COLUMNS}`, {
    accessToken: alice.accessToken,
    body: { title: TASK_TITLE },
  });
  record(judgeTaskCreated(created));

  if (created.error || !Array.isArray(created.rows) || created.rows.length !== 1) {
    throw new Error("stop: there is no task to ask about");
  }
  taskId = created.rows[0].id;
  console.log(`  (the task this run created: ${taskId})`);
  console.log("");

  // -------------------------------------------------------------------------
  // 2. Is the function there, and what does it say about Alice's own task?
  // -------------------------------------------------------------------------

  console.log("2. Alice asks for suggestions on her own task");

  const aliceAsk = await callFunction(alice.accessToken, { task_id: taskId });
  if (aliceAsk.body !== undefined) console.log(`        body: ${aliceAsk.body}`);
  record(judgeFunctionDeployed(aliceAsk));
  record(judgeSuggestions(aliceAsk));
  console.log("");

  // -------------------------------------------------------------------------
  // 3. Who may NOT ask
  // -------------------------------------------------------------------------

  console.log("3. Who may not ask: a stranger, a made-up id, a malformed id, and nobody at all");

  // A uuid nobody issued. Built rather than random so two runs produce the same one,
  // which makes two runs' output comparable.
  const MADE_UP_ID = "00000000-0000-4000-8000-000000000001";

  const nonexistent = await callFunction(alice.accessToken, { task_id: MADE_UP_ID });
  if (nonexistent.body !== undefined) console.log(`        made-up id:      ${nonexistent.body}`);

  if (bob === null) {
    record([
      {
        what: "a task the caller cannot see answers EXACTLY as a task that does not exist",
        verdict: UNVERIFIED,
        detail:
          "Bob could not sign in, so nobody asked about somebody else's task. This is the" +
          " check that proves a stranger cannot send another person's task title to the AI" +
          " service, and it has not been made",
      },
    ]);
  } else {
    const strangerAsk = await callFunction(bob.accessToken, { task_id: taskId });
    if (strangerAsk.body !== undefined) console.log(`        Bob on Alice's:  ${strangerAsk.body}`);
    record(judgeSameAsNotFound(strangerAsk, nonexistent));
  }

  const badId = await callFunction(alice.accessToken, { task_id: "not-a-uuid" });
  if (badId.body !== undefined) console.log(`        not a uuid:      ${badId.body}`);
  record(
    judgeBadRequest(badId, "a task id that is not a uuid is refused as a bad request", 400),
  );

  const noId = await callFunction(alice.accessToken, {});
  if (noId.body !== undefined) console.log(`        no task id:      ${noId.body}`);
  record(judgeBadRequest(noId, "a body with no task id at all is refused as a bad request", 400));

  // A TITLE INSTEAD OF AN ID, which is the shape issue #183 forbids: "The caller sends a
  // task ID, never a title." If the function ever grew a title parameter, this would
  // stop being a 400 -- and a signed-in person could send any text they liked.
  const titleInstead = await callFunction(alice.accessToken, { title: TASK_TITLE });
  if (titleInstead.body !== undefined) console.log(`        a title:         ${titleInstead.body}`);
  record(
    judgeBadRequest(
      titleInstead,
      "a body carrying a TITLE rather than an id is refused: the function takes ids only",
      400,
    ),
  );

  const signedOut = await callFunction(null, { task_id: taskId });
  if (signedOut.body !== undefined) console.log(`        signed out:      ${signedOut.body}`);
  record(judgeSignedOut(signedOut));
  console.log("");

  // -------------------------------------------------------------------------
  // 4. One call at a time
  // -------------------------------------------------------------------------

  console.log("4. Two asks at once");

  const [firstAsk, secondAsk] = await Promise.all([
    callFunction(alice.accessToken, { task_id: taskId }),
    callFunction(alice.accessToken, { task_id: taskId }),
  ]);
  if (firstAsk.body !== undefined) console.log(`        first:  ${firstAsk.body}`);
  if (secondAsk.body !== undefined) console.log(`        second: ${secondAsk.body}`);
  record(judgeOneAtATime(firstAsk, secondAsk));
  console.log("");
} catch (cause) {
  console.log("");
  console.log(`  (the run stopped early: ${cause.message})`);
  console.log("");
} finally {
  // -------------------------------------------------------------------------
  // 5. Put staging back as it was found
  // -------------------------------------------------------------------------

  console.log("5. Clearing up, and what this run touched");

  if (taskId !== null && alice !== null) {
    const deleted = await rest("DELETE", `tasks?id=eq.${taskId}&select=id`, {
      accessToken: alice.accessToken,
    });
    const readBack = await rest("GET", `tasks?id=eq.${taskId}&select=id`, {
      accessToken: alice.accessToken,
    });
    record(judgeTaskDeleted(deleted, readBack));
  } else {
    record([
      {
        what: "the task this run created was deleted",
        verdict: taskId === null ? PASS : UNVERIFIED,
        detail:
          taskId === null
            ? "no task was created, so there is nothing to delete"
            : `the task ${taskId} may still be in staging, and this run could not delete it.` +
              ` Delete it by hand: delete from public.tasks where id = '${taskId}';`,
      },
    ]);
  }

  record(judgeNothingLeaked(BODIES_SEEN));
  record(judgeTouchedNothing(REQUEST_LOG));
  console.log("");

  await signOut(alice);
  await signOut(bob);
  console.log("");

  console.log(`Totals: ${passes} PASS, ${failures} FAIL, ${unverified} UNVERIFIED.`);
  console.log("");
  console.log("WHAT THIS RUN CANNOT TELL YOU, whatever the totals say (rule 8):");
  console.log("  * whether the suggestions are any GOOD. It checks there are between");
  console.log("    one and five, that each is short plain text, and that none claims");
  console.log("    anything was done. Whether they are useful is for a person to say.");
  console.log("  * anything about a wrong key, a timeout, the rate limit, the spend");
  console.log("    limit or the service being down. None can be brought about from here");
  console.log("    without changing staging to suit a test. The Deno tests cover them.");
  console.log("  * whether 'one call at a time' holds ACROSS isolates. It cannot: the");
  console.log("    lock is a Set in one isolate's memory and the platform may run");
  console.log("    several. Section 4 reports whether it engaged, not that it must.");
  console.log("  * anything about production. This script refuses to run against it.");

  if (failures > 0 || unverified > 0) {
    console.log("");
    console.log("NOT GREEN. Before the deploy that is the point: there is no function of");
    console.log("that name on the project, so every check about its behaviour fails.");
    console.log("After the deploy but before AI_API_KEY is set, expect ONE UNVERIFIED --");
    console.log("'it can suggest something' -- with the code not_configured beside it;");
    console.log("that is production's state for the whole of Build it 20 and is not a");
    console.log("fault. A FAIL after the key is set is a real finding.");
    process.exitCode = 1;
  } else {
    console.log("");
    console.log("All checks passed. That is only half the evidence: a run from BEFORE the");
    console.log("deploy, showing these same checks failing, is the other half.");
  }
}

// HOW TO RUN IT, from the repository root.
//
// THE LOGIC CHECK NEEDS NOTHING AT ALL -- no account, no network, no web/.env.local.
// Run this first, and whenever this file is edited:
//
//   node scripts/staging/build-it-20-ai-checks.mjs --selftest
//
// THE STAGING RUNS. Three of them, and the first is meant to fail:
//
//   1. BEFORE the deploy. There is no suggest-subtasks on staging, so the platform
//      answers 404 and the checks in sections 2, 3 and 4 fail. Keep that output: it is
//      what shows the behaviour was not there.
//
//   2. The owner deploys the function to staging, from their own terminal:
//
//        supabase functions deploy suggest-subtasks --project-ref ghskxrhqlhvrhpnivqbd
//
//      and runs this script again. With no AI_API_KEY yet, expect PASSes everywhere
//      except ONE UNVERIFIED: "it can suggest something", with the code
//      not_configured. That is the honest answer, and it is what production answers for
//      the whole of Build it 20.
//
//   3. The owner sets the staging key, from their own terminal:
//
//        supabase secrets set AI_API_KEY --project-ref ghskxrhqlhvrhpnivqbd
//
//      and runs this script once more. Now it can be green. THIS IS THE RUN THAT COSTS
//      MONEY: at most three metered requests to Anthropic.
//
//      The assistant runs none of these. Rule 19 permits `functions deploy` and
//      `secrets set` against staging, and no such command has been run from this
//      session: the pull request says so.
//
// KEEP THE PASSWORDS OFF THE COMMAND LINE: both shells on this machine save command
// lines to a file -- Git Bash writes ~/.bash_history with HISTCONTROL unset, and
// PowerShell's PSReadLine saves incrementally. So load the password file instead of
// typing values; what lands in history is a FILENAME.
//
// Git Bash, WSL or macOS:
//
//   set -a
//   . ~/.config/team-tasks/staging.env
//   set +a
//   node scripts/staging/build-it-20-ai-checks.mjs
//
// PowerShell has no `source`, so it reads the file line by line instead:
//
//   foreach ($line in Get-Content "$HOME\.config\team-tasks\staging.env") {
//     if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
//       Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim().Trim("'").Trim('"')
//     }
//   }
//   node scripts/staging/build-it-20-ai-checks.mjs
//
// Close the shell window afterwards: the passwords live in that one process, and
// nothing writes them to disk.
//
// This script reads ALICE_EMAIL, ALICE_PASSWORD, BOB_EMAIL and BOB_PASSWORD from the
// environment, and NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
// from web/.env.local. Nothing else, and it never reads the password file itself. It
// does NOT read AI_API_KEY and could not use it: that key lives only in the Supabase
// project's function settings, which is the whole point of the design.
//
// The assistant has never run this script against staging. It has run --selftest; that
// output is in evidence/build-it-20-ai-helper.md.
