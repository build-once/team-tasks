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
// AND SINCE BUILD IT 21 IT ALSO CHANGES A SETTING, which is a different kind of thing
// from creating a row and is treated more carefully for one reason: the setting is a
// CONSENT setting, and a script that quietly left somebody opted in to sending their
// task titles to an outside company would be a worse thing than any bug it was looking
// for. So:
//
//   * it READS each person's setting before it writes it, and writes nothing if it
//     could not read it -- because then it would have no way to put it back;
//   * it puts both back in the `finally`, so a run that stops on an EXCEPTION still
//     restores them -- and NOT a run that is interrupted. A `finally` does not run on
//     Ctrl-C: Node delivers SIGINT, the default handler exits, and the restore never
//     happens. Issue #213 holds that, with the window (the tens of seconds the three
//     metered requests take), what it leaves behind, and what a fix has to show. Until
//     it is fixed: IF YOU INTERRUPT THIS SCRIPT, check Alice's and Bob's
//     ai_suggestions_enabled before running it again -- otherwise the next run reads
//     the left-over `true` as where it found the setting and faithfully puts it back;
//   * and it CHECKS that it put them back, with judgeConsentRestored, which fails
//     rather than assuming. If that check fails, the message says to look in the
//     dashboard by hand.
//
// It changes Alice's setting (off, on, off, then back to what it was) and Bob's (on,
// then back) -- Bob's because the consent check runs BEFORE the task is read, so with
// his setting off his ask would be refused for consent and section 5's question about
// task visibility would never be asked. It creates no profile row for anybody.
//
// WHAT IT COSTS, IN MONEY, and this is the only script in this repository of which that
// is true. Once AI_API_KEY is set on staging, an ask is a metered request to Anthropic.
// AT MOST THREE PER RUN reach the service: Alice's ask about her own task, and the two
// simultaneous asks in the one-at-a-time check. Every other call in this script is
// refused before any key is touched -- a 400 for a bad id, a 404 for a task the caller
// cannot see, two 401s for the two shapes of a signed-out call, and BOTH of the asks
// made with the setting off, which the function refuses before it reads the task -- so
// none of those costs anything. Claude Haiku 4.5 is $1 per million input tokens and $5
// per million output, and the reply is capped at 300 output tokens (docs/costs.md), so
// three asks is a fraction of a penny. The ceiling behind all of it is the 5-dollar
// monthly spend limit on the Team Tasks workspace.
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
//   POST   {url}/rest/v1/rpc/my_ai_suggestions       body {} -- reads the setting
//   PATCH  {url}/rest/v1/profiles?user_id=eq.{id}    body {ai_suggestions_enabled}
//   GET    {url}/rest/v1/profiles?select=...         -- the read that must be REFUSED
//   Prefer: return=representation   -- what makes a write answer with the rows it
//          touched, so a refusal reads as "0 rows" instead of being guessed at
//   the API key travels in the `apikey` header; Authorization carries the caller's JWT.
//
// ONE CALL IN THIS SCRIPT SENDS NEITHER HEADER, on purpose: section 3's check (a), where a
// POST with no key and no token is expected to be refused by the platform itself. Every
// other call carries the publishable key. Which header is missing turns out to decide WHICH
// LAYER refuses the call, and that is the whole of the note beside PLATFORM_NO_AUTH_CODE
// below.
//
// The sign-out SCOPE is `local`, as in web/tests/staging.mjs and
// build-it-18-invitation-status-checks.mjs: `global` would end every session belonging
// to that account and sign the owner's own browser out of Alice and Bob every time this
// ran.
//
// WHAT IT NEVER PRINTS: a password, an access or refresh token, the publishable key,
// the project URL, a user id, or an email address -- not Alice's and not Bob's, even
// though docs/environments.md publishes both. Every response body goes through scrub()
// before it is printed or kept. What does get printed: HTTP statuses, the failure
// codes, the fixed sentence the function produces, the task id it made, whether each
// person's AI-suggestions setting reads ON or OFF, and THE SUGGESTIONS THEMSELVES --
// which is a deliberate exception and is argued for beside judgeSuggestions.
//
// THE SETTING IS PRINTED AS THE WORD "ON" OR "OFF" AND NEVER AS A ROW, which is why the
// timestamp beside it never appears: `my_ai_suggestions()` answers with `changed_at` as
// well, and when somebody last changed a setting is a fact about when they were active.
// readConsentState reads `enabled` and nothing else, and every detail line is built
// from its answer rather than from the body.
//
// AND THE ORDER THE SCRUB RUNS IN, which the owner's staging run of 7 October 2026
// proved is not a detail. Each response is read into TWO forms and they are not
// interchangeable: the bytes that arrived, which is what every judgement decides on, and
// a scrubbed copy, which is the only form that is printed or kept in BODIES_SEEN.
// Scrubbing first and judging the result is how that run reported "the stored title is
// not the one that was sent" about a perfectly good row -- TASK_TITLE is registered with
// the scrub before the insert is made, so the title read back arrived as the word
// TASK_TITLE and could never equal the string it stands for. readRestBody and
// readFunctionBody below are where that order lives, and --selftest puts bodies through
// both of them rather than past them.
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

// The twelve codes, copied from supabase/functions/suggest-subtasks/index.ts's
// SUGGEST_CODES rather than imported, for the same reason.
//
// THIS LIST REFUSES A CODE IT DOES NOT KNOW, which is what makes it worth keeping in
// step: judgeSuggestions below fails a 503 whose code is not on it, so a code added to
// the function and not here would turn a correct deployed function red. The Deno test
// "every code produces the SAME sentence" asserts the count on the other side and names
// this file in its failure message.
//
// `model_unavailable` arrived with the coach's review of PR #190.
// `ai_suggestions_unknown` arrived with Build it 21 (issue #211): the consent setting
// could not be read, which docs/plan.md says must answer with this same fixed sentence
// rather than be treated as permission.
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
  "ai_suggestions_unknown",
];

// ---------------------------------------------------------------------------
// THE CONSENT SETTING (Build it 21, issue #211)
// ---------------------------------------------------------------------------
//
// The setting is `profiles.ai_suggestions_enabled`, added by
// 20261007204900_ai_suggestions_consent.sql, and it decides whether suggest-subtasks
// sends anything at all. This script's job is to prove that from OUTSIDE: switch it,
// ask, and see what the deployed function does.
//
// THE OFF REFUSAL IS NOT ONE OF THE TWELVE CODES ABOVE and does not carry their
// sentence, which is the function's own decision: off is the one refusal the person
// can act on, so it says so and says nothing about plumbing. Both halves are written
// out here character for character, as this script's statement of the contract.
const CONSENT_OFF_CODE = "ai_suggestions_off";
const CONSENT_OFF_MESSAGE =
  "AI suggestions are switched off for your account, so nothing was sent.";

// HOW THE SETTING IS READ FROM OUTSIDE, and it is not a select. No client role holds
// SELECT on that column -- that is how the migration stops a team mate reading it
// through the existing "your team mates' profiles" policy -- so a
// `profiles?select=ai_suggestions_enabled` is refused 42501 even for the person's own
// row. `public.my_ai_suggestions()` is the way, and PostgREST publishes a function in
// the public schema at /rest/v1/rpc/<name>.
//
// IT TAKES NO ARGUMENTS, which is the property this script relies on when it checks
// that Bob cannot learn Alice's setting: there is no parameter to point at her.
const CONSENT_RPC = "rpc/my_ai_suggestions";

// And how it is WRITTEN: a PATCH on the person's own profile row, naming the one
// column `authenticated` holds an update grant on.
const PROFILES_PATH = "profiles";

// The two caps, copied from the function.
const SUGGESTIONS_MAX = 5;
const SUGGESTION_CHARS_MAX = 80;

// ---------------------------------------------------------------------------
// WHO REFUSES A CALL WITH NO USER TOKEN -- and it is TWO questions, not one
// ---------------------------------------------------------------------------
//
// This file asked it as one question until 7 October 2026, and the answer it expected was
// wrong. The owner agreed the EXPECTATION was the thing at fault rather than the function
// (rule 20), and these are the two shapes it is now split into.
//
// WHAT WAS OBSERVED, twice, on staging. A POST carrying the publishable key in the
// `apikey` header and NO Authorization header came back
//
//   HTTP 401, code UNUSABLE_CREDENTIAL, "received: authorization absent, apikey publishable"
//
// which is @supabase/server's refusal from INSIDE the function -- not the platform's. The
// coach read staging's settings in the same session: suggest-subtasks has
// verify_jwt = true, like the other three. So BOTH of those are true at once, and what
// follows from them is the correction: a publishable key is a credential the gateway
// accepts, so verify_jwt being on does not make an apikey-only POST stop before the
// function. `auth: "user"` is what refuses that one.
//
// AND IT IS THE DOCUMENTED BEHAVIOUR rather than a surprise, which is why the expectation
// below is written off a page rather than off a memory. @supabase/server@1.9.0 is the
// version pinned in supabase/functions/suggest-subtasks/deno.json, and that package's own
// docs/error-handling.md, under "UNUSABLE_CREDENTIAL", lists three shapes it covers. The
// second is this request, word for word:
//
//   "API key to an endpoint that reads none. Every accepted mode is `user`, so an API key
//    can't satisfy it in either header. This is what an unauthenticated supabase-js call
//    to a `user`-only endpoint looks like: the publishable key rides both headers, but no
//    session token does."
//
// THE TWO SHAPES, then, and what each one proves:
//
//   (a) NO apikey AND NO Authorization. The PLATFORM's own refusal is expected: HTTP 401
//       with the code UNAUTHORIZED_NO_AUTH_HEADER. Why that is the expectation: it is what
//       production answered for create-team on 30 September 2026
//       (evidence/create-team.md) and for two more functions in evidence/invitations.md,
//       and it is what .github/workflows/migrate-production.yml's smoke-test job requires
//       of every function in the folder -- a job that sends no key and no token either,
//       which is what makes its request the same shape as this one.
//       **IT HAS NEVER BEEN RUN AGAINST THIS FUNCTION.** Nobody has seen suggest-subtasks
//       answer a credential-less POST, on staging or anywhere else, so this expectation is
//       UNVERIFIED until the owner's next staging run -- reasoning from three other
//       functions and one job, which is not the same as an observation (rule 15).
//       If the gateway did NOT refuse it, the library would, and under a different code:
//       the same docs file calls that MISSING_CREDENTIALS -- "The request carried nothing:
//       no `apikey` header, and no `Authorization` header at all" -- so a 401 carrying
//       THAT code is news about the gateway, and judgeNoCredentials says so rather than
//       reading any 401 as a pass.
//
//   (b) THE apikey AND NOTHING ELSE, which is what a signed-out browser using supabase-js
//       sends, and what was observed above. The LIBRARY's refusal is expected. What it
//       proves is narrower than "the platform refused" and is the part that matters: the
//       handler did not run, so no task was read with anybody's rights and no metered
//       request was made.
const PLATFORM_NO_AUTH_CODE = "UNAUTHORIZED_NO_AUTH_HEADER";
const LIBRARY_UNUSABLE_CODE = "UNUSABLE_CREDENTIAL";
const LIBRARY_MISSING_CODE = "MISSING_CREDENTIALS";

// SENTENCES ONLY THIS FUNCTION'S OWN CODE SENDS. If one of them turns up in a refusal, the
// request got past the gateway AND past `withSupabase({ auth: "user" })` and reached the
// handler -- which is what both checks below are really asking about, and what the code
// alone cannot settle when the code is missing. Copied from
// supabase/functions/suggest-subtasks/index.ts (lines 1067, 1091, 1101, 1116, 1125, and
// SUSPENDED_MESSAGE at 375) rather than imported, for the same reason as the codes and the
// two sentences above: importing would make the two agree however the function changed.
// build-it-16-checks.mjs:159 keeps the same kind of list for the other three functions.
const HANDLER_FINGERPRINTS = [
  "You must be signed in to ask for suggestions.",
  "Could not check your account",
  "Expected a JSON body with a task id.",
  "Which task are the suggestions for?",
  "That is not a valid task id.",
  "You can't do that at the moment.",
  UNAVAILABLE_MESSAGE,
  NOT_FOUND_MESSAGE,
];

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
//
// AN ANSWER HAS TWO FORMS, and every judgement below uses both deliberately:
//
//   * `body` -- the bytes that actually arrived. A judgement DECIDES on this one, and
//     only this one. A judgement compares what came back with what this file says it
//     should be, so comparing a scrubbed copy compares a placeholder with the very value
//     it stands for: it can only ever be unequal. That is the 7 October fault.
//   * `printable` -- the same text with every registered address, token, user id and the
//     task's title replaced. A detail line SHOWS this one, because a detail line is
//     printed.
//
// A fabricated answer in --selftest carries `body` alone, and nothing worth scrubbing, so
// `shown` falls back to it and every case written before this existed reads unchanged.
function shown(answer) {
  return answer.printable ?? answer.body ?? "";
}

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
          shown(answer).slice(0, MAX_REFUSAL_BODY),
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
// what else is in it. It takes the TEXT rather than the answer, because an answer holds
// two texts and which one is being read has to be said at every call site.
function readAnswerBody(text) {
  let parsed = null;
  try {
    parsed = JSON.parse(text ?? "");
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

// The two reads a judgement needs, named so a mix-up is hard to write: `judged` is the
// bytes that arrived and `show` is the scrubbed copy, for detail lines. They are the same
// read in --selftest, where there is nothing registered to replace. A scrub can never
// turn valid JSON invalid -- it swaps a plain substring for a word of capitals and
// underscores -- but if the scrubbed copy somehow will not parse, detail lines fall back
// to the judged read rather than going blank.
function readBothWays(answer) {
  const judged = readAnswerBody(answer.body);
  const printable = readAnswerBody(shown(answer));
  return { judged, show: printable.parsed === null ? judged : printable };
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

  // `read` is the bytes that arrived and decides every verdict below; `show` is the
  // scrubbed copy and appears in the detail lines.
  const { judged: read, show } = readBothWays(answer);
  if (read.parsed === null) {
    return [
      {
        what,
        verdict: FAIL,
        detail: `HTTP ${answer.status} with a body that is not a JSON object: ${shown(answer).slice(0, MAX_REFUSAL_BODY)}`,
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
        `sentence ${JSON.stringify(show.message)}, code ${JSON.stringify(show.code)},` +
        ` fields ${show.extra.join(", ")}. Expected exactly the sentence` +
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
          `the function answered the fixed failure with the code "${show.code}", so no` +
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
  // The same list with every registered value replaced, used for the detail lines only.
  // Where the scrubbed copy is not a list of the same length, the judged one is printed
  // rather than nothing: a detail line that cannot be lined up is still worth reading.
  const listShown =
    Array.isArray(show.suggestions) && show.suggestions.length === (list?.length ?? -1)
      ? show.suggestions
      : list;

  if (!Array.isArray(list)) {
    return [
      {
        what,
        verdict: FAIL,
        detail: `HTTP 200 and \`suggestions\` is ${JSON.stringify(show.suggestions)}, not a list`,
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
      listShown.map((s) => JSON.stringify(s)).join(", "),
  });

  // Judged on the arrived text and shown by position, so a suggestion that is only short
  // once a registered value inside it is replaced still fails the cap it broke. The
  // printed form of one of these can therefore read SHORTER than the length that was
  // judged, which the detail line says out loud rather than leaving to be noticed.
  const notDrawable = list.map((s, index) => index).filter((index) => !drawable(list[index]));
  results.push({
    what: "every suggestion is short plain text, with no link and no control character",
    verdict: notDrawable.length === 0 ? PASS : FAIL,
    detail:
      notDrawable.length === 0
        ? `all ${list.length} are at most ${SUGGESTION_CHARS_MAX} characters of plain text`
        : `${notDrawable.length} are not, shown scrubbed and so possibly shorter here than` +
          ` the text that was judged: ` +
          notDrawable
            .map((index) => JSON.stringify(String(listShown[index]).slice(0, 120)))
            .join(", "),
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
    detail: `its fields are ${show.extra.join(", ")}`,
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

  // THE BYTES THAT ARRIVED, on both sides. A scrub is applied to both the same way, so
  // comparing scrubbed copies would usually agree -- but "usually" is not what this check
  // claims, and the two are not even scrubbed into the same words when one carries Bob's
  // token and the other Alice's.
  results.push({
    what,
    verdict: stranger.body === nonexistent.body ? PASS : FAIL,
    detail:
      stranger.body === nonexistent.body
        ? `both bodies are ${shown(stranger).slice(0, MAX_REFUSAL_BODY)}`
        : `they differ. Bob gets ${shown(stranger).slice(0, MAX_REFUSAL_BODY)} and a` +
          ` made-up id gets ${shown(nonexistent).slice(0, MAX_REFUSAL_BODY)}. The` +
          ` difference is how somebody learns which task ids are real`,
  });

  const strangerRead = readBothWays(stranger);

  results.push({
    what: "the 404 says nothing about whose task it is or why",
    verdict: (() => {
      const message = String(strangerRead.judged.message ?? "").toLowerCase();
      const telling = ["permission", "allowed", "yours", "belongs", "team", "suspend"];
      return message !== "" && !telling.some((word) => message.includes(word)) ? PASS : FAIL;
    })(),
    detail: `its sentence is ${JSON.stringify(strangerRead.show.message)}`,
  });

  return results;
}

// A malformed ask is the caller's mistake, and is answered as one.
export function judgeBadRequest(answer, what, expectedStatus) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  const { show } = readBothWays(answer);
  return [
    {
      what,
      verdict: answer.status === expectedStatus ? PASS : FAIL,
      detail:
        `HTTP ${answer.status}, expected ${expectedStatus}. Sentence` +
        ` ${JSON.stringify(show.message)}`,
    },
  ];
}

// DID THIS BODY COME FROM THE FUNCTION'S OWN HANDLER? A sentence only this function
// sends, or a `suggestions` list, which nothing in front of the handler can produce.
// Decided on the bytes that arrived, like every other judgement here.
function handlerAnswered(answer) {
  const text = answer.body ?? "";
  if (HANDLER_FINGERPRINTS.some((sentence) => text.includes(sentence))) return true;
  return Array.isArray(readAnswerBody(text).suggestions);
}

// (a) A POST CARRYING NO CREDENTIALS AT ALL -- no apikey, no Authorization. The PLATFORM's
// own refusal is expected. The long note beside PLATFORM_NO_AUTH_CODE says where that
// expectation comes from, that nobody has seen THIS function answer this request, and what
// the library would say instead if the gateway let it through.
export function judgeNoCredentials(answer) {
  const what =
    "a POST with NO credentials at all -- no apikey, no Authorization -- is refused by the" +
    " platform, before the function runs";
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];

  const { judged: read, show } = readBothWays(answer);

  if (answer.status === 401 && read.code === PLATFORM_NO_AUTH_CODE) {
    return [
      {
        what,
        verdict: PASS,
        detail:
          `HTTP 401, code ${PLATFORM_NO_AUTH_CODE} -- the gateway refused it, so the` +
          ` function's code was never reached. This is the answer production gives for the` +
          ` other three functions, and the one the smoke-test job requires`,
      },
    ];
  }

  if (answer.status === 401 && read.code === LIBRARY_MISSING_CODE) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `HTTP 401 with the code ${LIBRARY_MISSING_CODE}, which is @supabase/server's and` +
          ` not the platform's: this request was refused INSIDE the function. It is still` +
          ` refused, the handler still did not run and it still cost nothing -- but the` +
          ` gateway let a credential-less POST reach the function, which is not what this` +
          ` check claims and not what production answers for the other three. Check` +
          ` [functions.${FUNCTION_NAME}] in supabase/config.toml and that the deploy did` +
          ` not pass --no-verify-jwt`,
      },
    ];
  }

  if (answer.status === 401) {
    return [
      {
        what,
        verdict: FAIL,
        detail: handlerAnswered(answer)
          ? `HTTP 401 and the body is one this function's OWN CODE sends, so the request` +
            ` reached the handler with no credentials at all -- past the gateway and past` +
            ` auth: "user". Body: ${shown(answer).slice(0, MAX_REFUSAL_BODY)}`
          : `HTTP 401, and the code is ${JSON.stringify(show.code)} -- neither the` +
            ` platform's ${PLATFORM_NO_AUTH_CODE} nor @supabase/server's` +
            ` ${LIBRARY_MISSING_CODE}. Refused, but by something this script cannot name,` +
            ` so it will not read it as the platform doing its job. Body:` +
            ` ${shown(answer).slice(0, MAX_REFUSAL_BODY)}`,
      },
    ];
  }

  return [
    {
      what,
      verdict: FAIL,
      detail:
        `HTTP ${answer.status} to a POST carrying no credentials at all, expected 401.` +
        ` Anything in the 2xx range means the function RAN for a caller with nothing, and on` +
        ` this function that means it spent money for one. Body:` +
        ` ${shown(answer).slice(0, MAX_REFUSAL_BODY)}`,
    },
  ];
}

// (b) A POST CARRYING THE apikey AND NOTHING ELSE -- the publishable key in the `apikey`
// header, no Authorization. This is what a signed-out browser using supabase-js sends, and
// it is the request the owner's two staging runs of 7 October 2026 answered
// 401 UNUSABLE_CREDENTIAL to.
//
// TWO RESULTS, because they are two different pieces of news and only the first is a
// promise this feature makes:
//
//   1. THE HANDLER DID NOT RUN. No task was read with anybody's rights, nothing was sent
//      to the AI service and nothing was spent. True of any refusal, whichever layer sends
//      it, and this is the result that matters.
//   2. AND IT IS @supabase/server's REFUSAL, with the code that package documents for this
//      exact request. That is what was observed, twice. If the PLATFORM refuses it first
//      instead, result 1 still holds -- nothing ran -- but which layer says no has not been
//      exercised, so result 2 is UNVERIFIED and not a FAIL: a stricter gateway than the one
//      observed is not a hole, and reporting it as one would be reporting a fault that is
//      not there (rule 8).
export function judgeApikeyOnly(answer) {
  const whatRan =
    "an apikey-only POST -- the publishable key, no Authorization -- never reaches the handler";
  const whatCode =
    `and it is @supabase/server that refuses it, with the code ${LIBRARY_UNUSABLE_CODE}` +
    ` -- what staging answered twice on 7 October 2026`;

  if (answer.error) {
    return [
      { what: whatRan, verdict: UNVERIFIED, detail: answer.error },
      { what: whatCode, verdict: UNVERIFIED, detail: answer.error },
    ];
  }

  const { judged: read, show } = readBothWays(answer);
  const reachedHandler = handlerAnswered(answer);
  const results = [];

  results.push({
    what: whatRan,
    verdict: answer.status === 401 && !reachedHandler ? PASS : FAIL,
    detail: reachedHandler
      ? `HTTP ${answer.status}, and the body is one this function's OWN CODE sends, so the` +
        ` request got past auth: "user" with no user token at all. On this function that is` +
        ` a caller with no identity reading a task and spending money. Body:` +
        ` ${shown(answer).slice(0, MAX_REFUSAL_BODY)}`
      : answer.status === 401
        ? `HTTP 401, and nothing in the body is a sentence this function's own code sends,` +
          ` so no task was read and nothing was sent to the AI service`
        : `HTTP ${answer.status}, expected 401. Body:` +
          ` ${shown(answer).slice(0, MAX_REFUSAL_BODY)}`,
  });

  if (answer.status === 401 && read.code === LIBRARY_UNUSABLE_CODE) {
    results.push({
      what: whatCode,
      verdict: PASS,
      detail:
        `HTTP 401, code ${LIBRARY_UNUSABLE_CODE}. @supabase/server@1.9.0's` +
        ` docs/error-handling.md gives this request as its second shape: an API key sent to` +
        ` an endpoint where every accepted mode is \`user\`, which no key can satisfy in` +
        ` either header`,
    });
  } else if (answer.status === 401 && read.code === PLATFORM_NO_AUTH_CODE) {
    results.push({
      what: whatCode,
      verdict: UNVERIFIED,
      detail:
        `HTTP 401, code ${PLATFORM_NO_AUTH_CODE} -- the PLATFORM refused this one, so the` +
        ` library was never asked and what it would have said is unexercised. Nothing ran,` +
        ` which the result above records, and a gateway stricter than the one observed on` +
        ` 7 October 2026 is not a fault. Worth telling the owner: the platform's behaviour` +
        ` towards an apikey-only POST is then not what staging did twice`,
    });
  } else {
    results.push({
      what: whatCode,
      verdict: FAIL,
      detail:
        `HTTP ${answer.status}, code ${JSON.stringify(show.code)} -- neither` +
        ` @supabase/server's ${LIBRARY_UNUSABLE_CODE} nor the platform's` +
        ` ${PLATFORM_NO_AUTH_CODE}, so this script cannot say what refused it. Body:` +
        ` ${shown(answer).slice(0, MAX_REFUSAL_BODY)}`,
    });
  }

  return results;
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
  const busy = answers.filter((a) => a.status === 503 && readAnswerBody(a.body).code === "busy");
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

// ---------------------------------------------------------------------------
// The consent setting, judged from outside (Build it 21, issue #211)
// ---------------------------------------------------------------------------

// WHERE DOES THE SETTING STAND? Read through my_ai_suggestions(), which always returns
// exactly one row -- the migration's section 3 says so and says why -- so anything else
// is a finding rather than an absence.
//
// `enabled` comes back as a real JSON boolean, and this reads it as one: `=== true` and
// `=== false`, with everything else unreadable. A truthy test here would read the
// four-character string "false" as consent, and the same mistake is checked on the
// function's side and on the screen's.
export function readConsentState(answer) {
  if (answer.error) return { known: false, detail: answer.error };
  if (!Array.isArray(answer.rows)) {
    return { known: false, detail: "the RPC did not answer with a list of rows" };
  }
  if (answer.rows.length !== 1) {
    return {
      known: false,
      detail:
        `${answer.rows.length} row(s) came back from my_ai_suggestions(), expected` +
        ` exactly 1. That function is written to answer one row for every caller --` +
        ` signed out, suspended, and with no profile row -- so a different number is a` +
        ` change in the database rather than a state of this account`,
    };
  }
  const value = answer.rows[0]?.enabled;
  if (value === true) return { known: true, enabled: true };
  if (value === false) return { known: true, enabled: false };
  return {
    known: false,
    detail:
      `its \`enabled\` is ${JSON.stringify(value)}, which is neither true nor false.` +
      ` The column is \`boolean not null\`, so a value that is neither did not come out` +
      ` of it -- and guessing which way to read it is the guess docs/plan.md forbids`,
  };
}

export function judgeConsentRead(answer, who) {
  const what = `${who}'s AI-suggestions setting can be read through my_ai_suggestions()`;
  const state = readConsentState(answer);
  if (!state.known) return [{ what, verdict: UNVERIFIED, detail: state.detail }];
  return [
    {
      what,
      verdict: PASS,
      detail: `it reads ${state.enabled ? "ON" : "OFF"}`,
    },
  ];
}

// A PATCH on the person's own row. `Prefer: return=representation` is set for every
// write this script makes, so a refusal reads as 0 rows rather than being guessed at.
export function judgeConsentSwitched(answer, who, wanted) {
  const what = `${who} can switch the setting ${wanted ? "ON" : "OFF"} on her own row`;
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (!Array.isArray(answer.rows) || answer.rows.length !== 1) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `${Array.isArray(answer.rows) ? answer.rows.length : "no list of"} row(s) came` +
          ` back from the update, expected 1. Nought rows means no profile row to write` +
          ` on, or the row rules refused it -- and with no profile row the setting cannot` +
          ` be switched on at all, which is issue #207`,
      },
    ];
  }
  return [{ what, verdict: PASS, detail: "one row updated" }];
}

// AND THE READ-BACK, because an update that answered 1 row is not the same fact as a
// setting that now holds the value. Build it 19's rule, from outside.
export function judgeConsentReadBack(answer, who, wanted) {
  const what =
    `and reading it back says ${wanted ? "ON" : "OFF"} -- the switch is confirmed` +
    ` against the database, not against ${who}'s own write`;
  const state = readConsentState(answer);
  if (!state.known) return [{ what, verdict: UNVERIFIED, detail: state.detail }];
  return [
    {
      what,
      verdict: state.enabled === wanted ? PASS : FAIL,
      detail: `it reads ${state.enabled ? "ON" : "OFF"}`,
    },
  ];
}

// THE CHECK THIS WHOLE SECTION IS FOR. With the setting off, the ask is refused, with
// the function's own consent code, and nothing was sent.
//
// FOUR RESULTS, because they are four different pieces of news:
//
//   1. it was refused at all, with 403 -- not 200, and not the fixed 503 either;
//   2. the code is the consent one, so this is the setting doing it rather than some
//      other refusal that happens to land on the same status;
//   3. the sentence is the function's own, character for character, and says nothing
//      was sent;
//   4. and the body carries nothing but error and code.
//
// BEFORE THE DEPLOY ALL FOUR FAIL, which is the point: the version of this function on
// staging today has no consent check, so Alice's ask with the setting off answers 200
// with suggestions -- and that FAIL is the evidence that the behaviour was not there.
export function judgeRefusedWhenOff(answer) {
  const what = "with the setting OFF, the ask is REFUSED and nothing is sent";
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];

  const { judged: read, show } = readBothWays(answer);
  const results = [];

  results.push({
    what,
    verdict: answer.status === 403 ? PASS : FAIL,
    detail:
      answer.status === 403
        ? "HTTP 403"
        : `HTTP ${answer.status}, expected 403. A 200 here means the deployed function` +
          ` sent a task title to the AI service for somebody who has not consented,` +
          ` which is the one thing this setting exists to prevent. A 503 means it` +
          ` refused for some other reason and the consent check was not what did it.` +
          ` Body: ${shown(answer).slice(0, MAX_REFUSAL_BODY)}`,
  });

  results.push({
    what: `and the code is "${CONSENT_OFF_CODE}", so it is the SETTING that refused it`,
    verdict: read.code === CONSENT_OFF_CODE ? PASS : FAIL,
    detail:
      `its code is ${JSON.stringify(show.code)}. ` +
      (read.code === "account_suspended"
        ? "That is the SUSPENSION refusal, which is also a 403 -- this account is" +
          " suspended on staging and this check cannot say anything about consent until" +
          " the owner removes the row"
        : `Expected ${JSON.stringify(CONSENT_OFF_CODE)}`),
  });

  results.push({
    what: "and the sentence is the function's own, saying that nothing was sent",
    verdict: read.message === CONSENT_OFF_MESSAGE ? PASS : FAIL,
    detail:
      `its sentence is ${JSON.stringify(show.message)}. Expected exactly` +
      ` ${JSON.stringify(CONSENT_OFF_MESSAGE)}`,
  });

  results.push({
    what: "and the body carries error and code and nothing else",
    verdict:
      Array.isArray(read.extra) && read.extra.slice().sort().join(",") === "code,error"
        ? PASS
        : FAIL,
    detail: `its fields are ${(show.extra ?? []).join(", ")}`,
  });

  return results;
}

// NOBODY SWITCHES ANYBODY ELSE'S. docs/plan.md: "Only that person can switch it, and
// only for themselves. Not their team's owner, not another member, not the owner of
// the app on their behalf."
//
// Bob is not in Alice's team, so he does not even get the team-mate read -- but the
// check is worth making from the weakest position available to this script, because
// what it tests is the UPDATE policy, whose `using` is `(select auth.uid()) = user_id`
// and which no membership changes.
//
// 0 ROWS IS THE PASS, not an error: a refused update matches no row rather than
// failing, which is why `Prefer: return=representation` is set.
export function judgeCannotChangeAnother(answer, before, after) {
  const what = "Bob CANNOT switch Alice's setting: his update changes no row";
  if (answer.error) {
    // A 42501 would also be a refusal, and a correct one -- but it is not the refusal
    // this check predicts, so it is reported rather than counted as a pass.
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail:
          `his update answered an error rather than 0 rows: ${answer.error}. Still a` +
          ` refusal, and Alice's setting is checked below either way`,
      },
    ];
  }

  const results = [];

  results.push({
    what,
    verdict: Array.isArray(answer.rows) && answer.rows.length === 0 ? PASS : FAIL,
    detail:
      Array.isArray(answer.rows) && answer.rows.length === 0
        ? "0 rows came back, so the update matched nothing"
        : `${Array.isArray(answer.rows) ? answer.rows.length : "no list of"} row(s) came` +
          ` back. Anything but 0 means one person changed another person's consent` +
          ` setting, which docs/plan.md forbids in its plainest words`,
  });

  // AND ALICE'S SETTING IS WHAT IT WAS. The row count is Bob's side of it; this is
  // hers, and it is the one that would actually matter.
  const beforeState = readConsentState(before);
  const afterState = readConsentState(after);

  results.push({
    what: "and Alice's own setting is unchanged, read through her own rights",
    verdict:
      beforeState.known && afterState.known && beforeState.enabled === afterState.enabled
        ? PASS
        : FAIL,
    detail:
      !beforeState.known || !afterState.known
        ? `her setting could not be read on both sides of his attempt: ` +
          `${beforeState.detail ?? "before: fine"} / ${afterState.detail ?? "after: fine"}`
        : `it read ${beforeState.enabled ? "ON" : "OFF"} before his attempt and ` +
          `${afterState.enabled ? "ON" : "OFF"} after`,
  });

  return results;
}

// AND BOB CANNOT READ HERS EITHER, which is a different promise from not changing it.
// He has no SELECT on the column and my_ai_suggestions() takes no arguments, so there
// is no request he can make for her value. The nearest thing he CAN do is ask for the
// column directly, and that is what this checks: it must be refused rather than
// answered with an empty result.
export function judgeCannotReadAnother(answer) {
  const what =
    "Bob cannot read the setting's column at all -- not Alice's, and not even his own";
  if (answer.error) {
    // THIS IS THE PASS. `readRestBody` turns a non-2xx into `error`, so a 42501 arrives
    // here as one. The detail names the status, which is the whole of what is checked.
    return [
      {
        what,
        verdict: /\b40[13]\b/.test(answer.error) || /42501/.test(answer.error)
          ? PASS
          : UNVERIFIED,
        detail:
          `his request for that column was refused: ${answer.error}. No client role` +
          ` holds SELECT on it, which is how the migration stops a team mate reading it` +
          ` through the existing "your team mates' profiles" policy`,
      },
    ];
  }
  return [
    {
      what,
      verdict: FAIL,
      detail:
        `HTTP ${answer.status} with ` +
        `${Array.isArray(answer.rows) ? answer.rows.length : "no list of"} row(s). A` +
        ` signed-in caller selected that column, so the privilege that was supposed to` +
        ` hide it is not there. An EMPTY result is still a FAIL here: it means the` +
        ` select was allowed and the row rules happened to return nothing`,
    },
  ];
}

// THE SETTING IS LEFT AS THE RUN FOUND IT, for each person this run touched. A test
// that quietly opts somebody in to sending their task titles to an outside company
// would be a worse thing than the bug it was looking for.
export function judgeConsentRestored(who, before, after) {
  const what = `${who}'s setting is left exactly as this run found it`;
  const beforeState = readConsentState(before);
  const afterState = readConsentState(after);

  if (!beforeState.known) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail:
          `this run could not read the setting before it started, so it cannot say` +
          ` whether it put it back: ${beforeState.detail}`,
      },
    ];
  }
  if (!afterState.known) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `it read ${beforeState.enabled ? "ON" : "OFF"} before the run and cannot be` +
          ` read now: ${afterState.detail}. CHECK IT BY HAND in the dashboard --` +
          ` public.profiles.ai_suggestions_enabled for this account -- because this run` +
          ` changed it and cannot confirm it put it back`,
      },
    ];
  }

  return [
    {
      what,
      verdict: beforeState.enabled === afterState.enabled ? PASS : FAIL,
      detail:
        beforeState.enabled === afterState.enabled
          ? `it was ${beforeState.enabled ? "ON" : "OFF"} and it is ${
            afterState.enabled ? "ON" : "OFF"
          }`
          : `IT WAS ${beforeState.enabled ? "ON" : "OFF"} AND IT IS NOW ${
            afterState.enabled ? "ON" : "OFF"
          }. Put it back by hand: this run left somebody's consent setting somewhere` +
            ` they did not put it`,
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
    // Build it 21 (issue #211). The setting is read through the function and written
    // on the profile row, so this run touches two more endpoints than it used to.
    `/rest/v1/${CONSENT_RPC}`,
    `/rest/v1/${PROFILES_PATH}`,
  ];

  const problems = [];
  for (const entry of log) {
    const path = entry.path.split("?")[0];
    const full = entry.path;
    const ok = allowed.some((prefix) => full === prefix || path === prefix);
    if (!ok) problems.push(`${entry.method} ${entry.path}`);
  }

  // AND NOTHING WAS INSERTED INTO OR DELETED FROM profiles. This run switches a
  // setting on an existing row and nothing else: it must not create a profile for
  // anybody, which would leave a nickname on staging that nobody asked for, and it
  // must not remove one.
  const profileWrites = log.filter(
    (entry) =>
      entry.path.startsWith(`/rest/v1/${PROFILES_PATH}`) &&
      entry.method !== "PATCH" &&
      entry.method !== "GET",
  );
  if (profileWrites.length > 0) {
    problems.push(
      `it did more than PATCH and GET on profiles: ` +
        profileWrites.map((e) => `${e.method} ${e.path}`).join(", "),
    );
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
          ? `${log.length} requests, all to the ${allowed.length} endpoints above, one` +
            ` task created and one deleted, and nothing but PATCH and GET on profiles`
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

// ---------------------------------------------------------------------------
// One response, two forms -- and WHICH ONE A JUDGEMENT GETS is the whole point
// ---------------------------------------------------------------------------
//
// These two are pure, they are exported, and `rest` and `callFunction` below do nothing
// with a response except hand it to one of them. That is deliberate: the order the scrub
// runs in was wrong from the day this file was written (ac9cdc5, 7 October 2026) and no
// selftest could see it, because every case handed a judgement a row object or a body
// string that no scrub had ever touched. Now --selftest goes through the real path.
//
// WHAT WENT WRONG, so it is not reintroduced by somebody tidying. The old code read
//
//   const text = scrub(await response.text());
//   const rows = JSON.parse(text);
//
// which means judgeTaskCreated received `title: "TASK_TITLE"` -- the placeholder, because
// TASK_TITLE is registered with the scrub before the insert is ever made -- and compared
// it with TASK_TITLE, the string it stands for. Those can never be equal, so the check
// reported "the stored title is not the one that was sent" about a row that was perfectly
// correct. The owner's staging run of 7 October 2026 is where that showed up: 8 PASS, 9
// FAIL, 0 UNVERIFIED, and eight of the nine FAILs were the expected "function not
// deployed". The ninth was this.
//
// So: PARSE THE BYTES THAT ARRIVED, and scrub only what is printed or kept.

// One PostgREST response, read into the rows a judgement decides on and the text that may
// be printed.
export function readRestBody({ ok, status, raw }, placeholders) {
  const text = raw ?? "";
  const printable = scrubWith(text, placeholders);

  if (!ok) return { status, printable, error: `HTTP ${status} ${printable}` };
  if (text.trim() === "") return { status, printable, rows: [] };

  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    return { status, printable, error: `HTTP ${status} with a body that is not JSON` };
  }
  if (!Array.isArray(rows)) return { status, printable, error: `expected a JSON array, got ${typeof rows}` };
  return { status, printable, rows };
}

// One suggest-subtasks response. Both forms travel on, because this one's body is judged
// whole -- byte for byte, in judgeSameAsNotFound -- as well as printed.
export function readFunctionBody({ status, raw }, placeholders) {
  const text = raw ?? "";
  return { status, body: text, printable: scrubWith(text, placeholders) };
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
  const madeUpUserId = "a1b2c3d4-0002-4e5f-8a9b-0c1d2e3f4a5b";
  const madeUpAddress = "nobody-at-all@example.com";

  // The columns a PATCH on profiles asks back, written out here rather than taken from
  // TASK_COLUMNS or a constant further down the file: everything below the --selftest
  // branch has not been declared yet when this function runs, so naming one would be a
  // ReferenceError rather than a check.
  const SOME_TASK_COLUMNS = "id,title,done,team_id,owner_id";

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

  // One row from my_ai_suggestions(), as a PostgREST read gives it back. `changed_at`
  // is included because the function returns it and this script must not care.
  const consentRows = (enabled) => ({
    status: 200,
    rows: [{ enabled, changed_at: enabled ? "2026-10-08T09:00:00+00:00" : null }],
  });

  // The refusal the deployed function is supposed to send with the setting off.
  const consentRefusal = {
    status: 403,
    body: JSON.stringify({ error: CONSENT_OFF_MESSAGE, code: CONSENT_OFF_CODE }),
  };

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

    // ---- signed out, WHICH IS TWO QUESTIONS AND NOT ONE ----
    //
    // See the long note beside PLATFORM_NO_AUTH_CODE. (a) nothing at all, where the
    // platform's refusal is expected and has never been seen on THIS function; (b) the
    // apikey and nothing else, which is what staging answered twice on 7 October 2026 and
    // what the single check these replace called a FAIL.

    // ---- (a) no apikey and no Authorization ----
    {
      name: "the platform refuses a POST carrying no credentials at all",
      run: () => judgeNoCredentials({ status: 401, body: JSON.stringify({ code: PLATFORM_NO_AUTH_CODE }) }),
      expect: [PASS],
    },
    {
      name:
        "NO CREDENTIALS AND THE LIBRARY ANSWERED: MISSING_CREDENTIALS is @supabase/server's," +
        " so the gateway let a credential-less POST through",
      run: () => judgeNoCredentials({ status: 401, body: JSON.stringify({ code: LIBRARY_MISSING_CODE }) }),
      expect: [FAIL],
    },
    {
      name: "A POST WITH NO CREDENTIALS GOT SUGGESTIONS: a live hole, and one that spends money",
      run: () => judgeNoCredentials(ok(goodThree)),
      expect: [FAIL],
    },
    {
      name: "the credential-less POST never arrived, so nothing is settled",
      run: () => judgeNoCredentials({ error: "could not reach the function" }),
      expect: [UNVERIFIED],
    },

    // ---- (b) the apikey and nothing else ----
    {
      name:
        "APIKEY ONLY: @supabase/server refuses it with UNUSABLE_CREDENTIAL, so the handler" +
        " did not run -- WHAT STAGING ANSWERED TWICE on 7 October 2026",
      run: () =>
        judgeApikeyOnly({
          status: 401,
          body: JSON.stringify({ code: LIBRARY_UNUSABLE_CODE, message: "received: authorization absent, apikey publishable" }),
        }),
      expect: [PASS, PASS],
    },
    {
      name:
        "APIKEY ONLY AND THE HANDLER'S OWN SENTENCE CAME BACK: the request got past" +
        ' auth: "user", which is the mistake this check exists to catch',
      run: () =>
        judgeApikeyOnly({
          status: 401,
          body: JSON.stringify({ error: "You must be signed in to ask for suggestions." }),
        }),
      expect: [FAIL, FAIL],
    },
    {
      name: "AN APIKEY-ONLY POST GOT SUGGESTIONS: the worst shape of this fault, and it spends money",
      run: () => judgeApikeyOnly(ok(goodThree)),
      expect: [FAIL, FAIL],
    },
    {
      name:
        "apikey only, and the PLATFORM refused it first: nothing ran, which is the result that" +
        " matters, but which layer says no was not exercised",
      run: () => judgeApikeyOnly({ status: 401, body: JSON.stringify({ code: PLATFORM_NO_AUTH_CODE }) }),
      expect: [PASS, UNVERIFIED],
    },
    {
      name: "apikey only, 401 with a code nobody here has seen: refused, by something unnamed",
      run: () => judgeApikeyOnly({ status: 401, body: JSON.stringify({ code: "SOMETHING_ELSE" }) }),
      expect: [PASS, FAIL],
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

    // ---- THE ORDER THE SCRUB RUNS IN, through the real reading path ----
    //
    // The four cases above feed judgements and scrubs separately, which is exactly how
    // the 7 October fault stayed invisible: no case ever put a body through the step that
    // does both. These go through readRestBody and readFunctionBody, with the title
    // registered the way the real run registers it before its first request. The first
    // and the last FAILED before that order was fixed.
    {
      name:
        "THE REAL PATH: a row read back carrying the title, judged on the bytes that" +
        " arrived -- the 7 October FAIL, which was this script's own fault and not staging's",
      run: () =>
        judgeTaskCreated(
          readRestBody(
            {
              ok: true,
              status: 201,
              raw: JSON.stringify([
                { id: madeUpTaskId, title: TASK_TITLE, done: false, team_id: null, owner_id: madeUpTaskId },
              ]),
            },
            [[TASK_TITLE, "TASK_TITLE"]],
          ),
        ),
      expect: [PASS],
    },
    {
      name:
        "THE REAL PATH: and the form that gets printed and kept in BODIES_SEEN is still" +
        " scrubbed, so the fix was not to stop scrubbing",
      run: () =>
        judgeNothingLeaked([
          readRestBody(
            { ok: true, status: 201, raw: JSON.stringify([{ id: madeUpTaskId, title: TASK_TITLE }]) },
            [[TASK_TITLE, "TASK_TITLE"]],
          ).printable,
        ]),
      expect: [PASS],
    },
    {
      name:
        "THE REAL PATH with NOTHING REGISTERED: the title reaches the printable form, which" +
        " is what makes the case above worth having",
      run: () =>
        judgeNothingLeaked([
          readRestBody(
            { ok: true, status: 201, raw: JSON.stringify([{ id: madeUpTaskId, title: TASK_TITLE }]) },
            [],
          ).printable,
        ]),
      expect: [FAIL],
    },
    {
      name:
        "THE REAL PATH: a suggestion that is only short once the title inside it is replaced." +
        " The 80-character cap is judged on the 159 characters that arrived, not the 65 printed",
      run: () =>
        judgeSuggestions(
          readFunctionBody(
            {
              status: 200,
              raw: JSON.stringify({
                suggestions: [`Ask the hall about ${TASK_TITLE}, then print flyers about ${TASK_TITLE}`],
              }),
            },
            [[TASK_TITLE, "TASK_TITLE"]],
          ),
        ),
      expect: [PASS, FAIL, PASS, PASS],
    },

    // ---- the consent setting (Build it 21, issue #211) ----
    //
    // The judgements above were all about a function that may send. These are about
    // the setting that decides whether it may at all, and the one that matters is
    // `judgeRefusedWhenOff`: every case below hands it the answer a function WITHOUT a
    // consent check gives, and requires a FAIL.
    { name: "the setting reads ON", run: () => judgeConsentRead(consentRows(true), "Alice"), expect: [PASS] },
    { name: "the setting reads OFF", run: () => judgeConsentRead(consentRows(false), "Alice"), expect: [PASS] },
    {
      name: "the RPC could not be reached: UNVERIFIED, not off",
      run: () => judgeConsentRead({ error: "HTTP 500" }, "Alice"),
      expect: [UNVERIFIED],
    },
    {
      name: "THE RPC ANSWERED NO ROWS, which it is written never to do",
      run: () => judgeConsentRead({ rows: [] }, "Alice"),
      expect: [UNVERIFIED],
    },
    {
      name: "the RPC answered two rows",
      run: () => judgeConsentRead({ rows: [{ enabled: true }, { enabled: false }] }, "Alice"),
      expect: [UNVERIFIED],
    },
    {
      name: 'THE SETTING CAME BACK AS THE STRING "false", WHICH IS TRUTHY: not read as consent',
      run: () => judgeConsentRead({ rows: [{ enabled: "false" }] }, "Alice"),
      expect: [UNVERIFIED],
    },
    {
      name: 'and the string "true" is not read as consent either',
      run: () => judgeConsentRead({ rows: [{ enabled: "true" }] }, "Alice"),
      expect: [UNVERIFIED],
    },
    {
      name: "the setting came back null",
      run: () => judgeConsentRead({ rows: [{ enabled: null }] }, "Alice"),
      expect: [UNVERIFIED],
    },

    // ---- switching it ----
    {
      name: "one row updated: the switch took",
      run: () => judgeConsentSwitched({ status: 200, rows: [{ user_id: madeUpUserId }] }, "Alice", true),
      expect: [PASS],
    },
    {
      name:
        "NOUGHT ROWS UPDATED: no profile row to write on, or the row rules refused it --" +
        " which is issue #207's silent switch",
      run: () => judgeConsentSwitched({ status: 200, rows: [] }, "Alice", true),
      expect: [FAIL],
    },
    {
      name: "the update was refused outright",
      run: () => judgeConsentSwitched({ error: "HTTP 403" }, "Alice", true),
      expect: [UNVERIFIED],
    },
    {
      name: "the read-back agrees with what was asked for",
      run: () => judgeConsentReadBack(consentRows(true), "Alice", true),
      expect: [PASS],
    },
    {
      name:
        "THE UPDATE SAID ONE ROW AND THE READ-BACK SAYS OFF: not saved, which is Build it" +
        " 19's rule from outside",
      run: () => judgeConsentReadBack(consentRows(false), "Alice", true),
      expect: [FAIL],
    },
    {
      name: "the read-back could not be made",
      run: () => judgeConsentReadBack({ error: "HTTP 500" }, "Alice", true),
      expect: [UNVERIFIED],
    },

    // ---- THE ONE THIS SECTION EXISTS FOR ----
    {
      name: "the setting is off and the ask is refused, with the consent code and sentence",
      run: () => judgeRefusedWhenOff(consentRefusal),
      expect: [PASS, PASS, PASS, PASS],
    },
    {
      name:
        "A FUNCTION WITH NO CONSENT CHECK: the setting is off and it answers 200 with" +
        " suggestions. This is what staging answers BEFORE the deploy, and every part fails",
      run: () => judgeRefusedWhenOff(ok(goodThree)),
      expect: [FAIL, FAIL, FAIL, FAIL],
    },
    {
      name:
        "refused, but with the FIXED FAILURE instead -- so something other than the setting" +
        " refused it and the consent check is unexercised",
      run: () => judgeRefusedWhenOff(unavailable("not_configured")),
      expect: [FAIL, FAIL, FAIL, PASS],
    },
    {
      name:
        "THE SUSPENSION REFUSAL, which is also a 403: the status passes and the code does not," +
        " because this account being suspended says nothing about consent",
      run: () =>
        judgeRefusedWhenOff({
          status: 403,
          body: JSON.stringify({
            error: "You can't do that at the moment.",
            code: "account_suspended",
          }),
        }),
      expect: [PASS, FAIL, FAIL, PASS],
    },
    {
      name: "the right code with the WRONG sentence: the function and this file disagree",
      run: () =>
        judgeRefusedWhenOff({
          status: 403,
          body: JSON.stringify({ error: "Nope.", code: CONSENT_OFF_CODE }),
        }),
      expect: [PASS, PASS, FAIL, PASS],
    },
    {
      name: "the right refusal carrying a field it should not",
      run: () =>
        judgeRefusedWhenOff({
          status: 403,
          body: JSON.stringify({
            error: CONSENT_OFF_MESSAGE,
            code: CONSENT_OFF_CODE,
            user_id: madeUpUserId,
          }),
        }),
      expect: [PASS, PASS, PASS, FAIL],
    },
    {
      name: "the ask never arrived at all",
      run: () => judgeRefusedWhenOff({ error: "could not reach suggest-subtasks" }),
      expect: [UNVERIFIED],
    },

    // ---- nobody switches anybody else's ----
    {
      name: "Bob's update of Alice's row changes nothing, and her setting is unmoved",
      run: () =>
        judgeCannotChangeAnother(
          { status: 200, rows: [] },
          consentRows(false),
          consentRows(false),
        ),
      expect: [PASS, PASS],
    },
    {
      name:
        "BOB'S UPDATE CHANGED A ROW: one person switched another person's consent setting," +
        " which docs/plan.md forbids in its plainest words",
      run: () =>
        judgeCannotChangeAnother(
          { status: 200, rows: [{ user_id: madeUpUserId }] },
          consentRows(false),
          consentRows(true),
        ),
      expect: [FAIL, FAIL],
    },
    {
      name:
        "his update changed no row and HERS MOVED ANYWAY, which would mean something else" +
        " did it",
      run: () =>
        judgeCannotChangeAnother({ status: 200, rows: [] }, consentRows(false), consentRows(true)),
      expect: [PASS, FAIL],
    },
    {
      name: "Bob's attempt was refused with an error rather than 0 rows: still a refusal, reported",
      run: () =>
        judgeCannotChangeAnother({ error: "HTTP 403" }, consentRows(false), consentRows(false)),
      expect: [UNVERIFIED],
    },
    {
      name: "Bob's request for the column is refused, which is the privilege doing its job",
      run: () => judgeCannotReadAnother({ error: "HTTP 403 permission denied for table profiles" }),
      expect: [PASS],
    },
    {
      name:
        "HIS REQUEST FOR THE COLUMN WAS ANSWERED, with nought rows -- which is still a FAIL," +
        " because the select was allowed and the row rules merely happened to return nothing",
      run: () => judgeCannotReadAnother({ status: 200, rows: [] }),
      expect: [FAIL],
    },
    {
      name: "or answered with a row, which is the leak itself",
      run: () => judgeCannotReadAnother({ status: 200, rows: [{ ai_suggestions_enabled: true }] }),
      expect: [FAIL],
    },

    // ---- and it is put back ----
    {
      name: "off before, off after: staging is as this run found it",
      run: () => judgeConsentRestored("Alice", consentRows(false), consentRows(false)),
      expect: [PASS],
    },
    {
      name: "on before, on after",
      run: () => judgeConsentRestored("Alice", consentRows(true), consentRows(true)),
      expect: [PASS],
    },
    {
      name:
        "OFF BEFORE AND ON AFTER: this run left somebody opted in to sending their task" +
        " titles to an outside company",
      run: () => judgeConsentRestored("Alice", consentRows(false), consentRows(true)),
      expect: [FAIL],
    },
    {
      name: "it cannot be read now, and this run changed it: a FAIL that says to check by hand",
      run: () => judgeConsentRestored("Alice", consentRows(false), { error: "HTTP 500" }),
      expect: [FAIL],
    },
    {
      name:
        "it could not be read BEFORE the run either, so whether it was put back is unknown" +
        " rather than wrong",
      run: () => judgeConsentRestored("Alice", { error: "HTTP 500" }, consentRows(false)),
      expect: [UNVERIFIED],
    },

    // ---- and the endpoint list knows about the two new ones ----
    {
      name: "the two new endpoints are allowed, and a PATCH on profiles is what this run makes",
      run: () =>
        judgeTouchedNothing([
          { method: "POST", path: "/auth/v1/token?grant_type=password" },
          { method: "POST", path: `/rest/v1/tasks?select=${SOME_TASK_COLUMNS}` },
          { method: "POST", path: `/rest/v1/${CONSENT_RPC}` },
          { method: "PATCH", path: `/rest/v1/${PROFILES_PATH}?user_id=eq.${madeUpUserId}` },
          { method: "DELETE", path: `/rest/v1/tasks?id=eq.${madeUpTaskId}&select=id` },
        ]),
      expect: [PASS],
    },
    {
      name:
        "AN INSERT INTO profiles: this run must not create a profile for anybody, which" +
        " would leave a nickname on staging nobody asked for",
      run: () =>
        judgeTouchedNothing([
          { method: "POST", path: `/rest/v1/tasks?select=${SOME_TASK_COLUMNS}` },
          { method: "POST", path: `/rest/v1/${PROFILES_PATH}` },
          { method: "DELETE", path: `/rest/v1/tasks?id=eq.${madeUpTaskId}&select=id` },
        ]),
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
  console.log("Every judgement said FAIL to a function that is not deployed, to six");
  console.log("suggestions where five are allowed, to a suggestion carrying a link, to");
  console.log("one claiming the subtasks were added, to an empty list dressed as a");
  console.log("result, to a stranger getting a different 404 from a made-up id, to either");
  console.log("shape of signed-out caller getting suggestions, to an apikey-only call that");
  console.log("reached the handler, and to a run that left its own task behind. That is");
  console.log("what would make a green staging run mean something.");
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

// `apikey: false` sends NEITHER header -- no key and no token, which is the one request
// shape in this script that carries no credential at all. It is section 3's check (a), and
// it is the same shape .github/workflows/migrate-production.yml's smoke-test job uses.
async function callFunction(accessToken, body, { apikey = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (apikey) headers.apikey = publishableKey;
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

  // Judged on what arrived, printed and kept scrubbed. readFunctionBody is where that
  // order lives, and --selftest exercises it.
  const answer = readFunctionBody(
    { status: response.status, raw: await response.text() },
    PLACEHOLDERS,
  );
  BODIES_SEEN.push(answer.printable);
  return answer;
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

  // The rows come out of the bytes that arrived; the error line and BODIES_SEEN get the
  // scrubbed copy. readRestBody is where that order lives, and --selftest exercises it:
  // scrubbing before the parse is what made a correct insert read as a wrong title on
  // 7 October 2026.
  const answer = readRestBody(
    { ok: response.ok, status: response.status, raw: await response.text() },
    PLACEHOLDERS,
  );
  BODIES_SEEN.push(answer.printable);
  return answer;
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
// The consent setting, read and written from outside (Build it 21, issue #211)
// ---------------------------------------------------------------------------

// READ IT THROUGH THE FUNCTION. `public.my_ai_suggestions()` is published by PostgREST
// as an RPC because it is a function in the public schema, and it takes no arguments,
// so this is the whole request: a POST with an empty body carrying the person's token.
//
// A SELECT WOULD NOT WORK AND MUST NOT BE SUBSTITUTED FOR IT. No client role holds
// SELECT on either new column, so `profiles?select=ai_suggestions_enabled` is refused
// 42501 -- for the person's own row. That refusal is itself checked, as Bob, further
// down: judgeCannotReadAnother.
async function readConsent(session) {
  return await rest("POST", CONSENT_RPC, {
    accessToken: session.accessToken,
    body: {},
  });
}

// WRITE IT ON THE PERSON'S OWN ROW. `select=user_id` and NOT the column being written:
// asking for the setting back needs SELECT on it and would be refused 42501, which is
// issue #207's second trap and the one a screen is most likely to walk into.
//
// The `user_id=eq.` filter is not what keeps this to one person's row -- the update
// policy's `using (select auth.uid()) = user_id` does that -- it is here so the request
// says plainly which row it means, and so that Bob's attempt below can name Alice's.
async function setConsent(session, userId, wanted) {
  return await rest(
    "PATCH",
    `${PROFILES_PATH}?user_id=eq.${userId}&select=user_id`,
    {
      accessToken: session.accessToken,
      body: { ai_suggestions_enabled: wanted },
    },
  );
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log("Build it 20 part 1 -- the AI helper in the deployed function");
console.log("Build it 21 part 2b -- and the consent setting that decides whether it may send");
console.log(`  staging host:    ${STAGING_HOST} (confirmed by parsing the URL, not by a substring)`);
console.log(`  function:        ${FUNCTION_NAME}`);
console.log("  accounts:        Alice (owns the task) and Bob (must be refused it)");
console.log("  the task:        one PERSONAL task, created by this run and deleted by it");
console.log("  the setting:     switched by this run, and PUT BACK as it was found");
console.log("  tokens, passwords, addresses, user ids and the task's title: not printed");
console.log("");
console.log("RUN THIS BEFORE AND AFTER DEPLOYING THE FUNCTION TO STAGING. Before the");
console.log("deploy it MUST FAIL. Twice over, now: the version of this function on");
console.log("staging today has NO CONSENT CHECK, so section 2's 'refused when off'");
console.log("fails even though the function answers -- and if the function is not");
console.log("deployed at all, the platform answers 404 to every call. One green run on");
console.log("its own says nothing about the deploy -- the pair is the evidence.");
console.log("");
console.log("IT SPENDS MONEY, once AI_API_KEY is set on staging: at most THREE metered");
console.log("requests to Anthropic per run. Every other call here is refused before any");
console.log("key is touched -- including both of the asks made with the setting off,");
console.log("which cost nothing because the function refuses before it reads the task.");
console.log("See the note at the top of this file for the arithmetic.");
console.log("");

let alice = null;
let bob = null;
let taskId = null;

// Where each person's setting stood before this run touched it, so the `finally` can
// put it back. `null` means nobody has looked yet, which is different from "it could
// not be read" -- and a run that never read it never writes it either.
let aliceConsentBefore = null;
let bobConsentBefore = null;

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
  // 2. THE CONSENT SETTING, OFF: the ask must be refused and nothing sent
  // -------------------------------------------------------------------------
  //
  // FIRST, before anything is asked with the setting on, because this is the state the
  // feature is FOR. docs/plan.md: "Nobody's task title leaves production before there
  // is a setting that lets them say no."
  //
  // Where it stands is read before it is touched, so the `finally` can put it back.

  console.log("2. The consent setting is OFF, and the ask is refused");

  aliceConsentBefore = await readConsent(alice);
  record(judgeConsentRead(aliceConsentBefore, "Alice"));

  const aliceConsentKnown = readConsentState(aliceConsentBefore).known;

  if (!aliceConsentKnown) {
    // IT IS NOT TOUCHED IF IT CANNOT BE READ. A run that switched a consent setting it
    // could not read would have no way of putting it back, and leaving somebody opted
    // in to sending their task titles to an outside company is worse than an
    // unanswered check (rule 8).
    record([
      {
        what: "the consent checks in sections 2 and 7 can be made at all",
        verdict: UNVERIFIED,
        detail:
          "Alice's setting could not be read, so this run has NOT written it: it would" +
          " have no way to put it back. Everything below runs against whatever the" +
          " setting happens to be, which may show as failures. Fix the read first --" +
          " my_ai_suggestions() should answer one row for any signed-in caller",
      },
    ]);
  } else {
    const toOff = await setConsent(alice, alice.userId, false);
    record(judgeConsentSwitched(toOff, "Alice", false));
    record(judgeConsentReadBack(await readConsent(alice), "Alice", false));

    // THE ASK, with the setting off. This is also the first call this run makes to the
    // function, so it is the one that answers "is it deployed at all" -- the function's
    // own 403 is an answer from its own code, and the platform's 404 for a name it does
    // not know is not.
    const askedWhileOff = await callFunction(alice.accessToken, { task_id: taskId });
    if (askedWhileOff.printable !== undefined) {
      console.log(`        body: ${askedWhileOff.printable}`);
    }
    record(judgeFunctionDeployed(askedWhileOff));
    record(judgeRefusedWhenOff(askedWhileOff));
  }
  console.log("");

  // -------------------------------------------------------------------------
  // 3. She switches it ON, and so does Bob
  // -------------------------------------------------------------------------
  //
  // WHY BOB TOO, which is not obvious. Section 5's whole point is that a task Bob
  // cannot see answers EXACTLY as a task that does not exist -- and the consent check
  // comes before the task is read, so with Bob's setting off his ask would be refused
  // for consent and never reach the read at all. The check would compare a consent
  // refusal with a 404 and fail, while proving nothing about task visibility.
  //
  // So Bob consents for the duration of the run, and his setting is put back too. That
  // is the only way section 5 asks its question rather than a different, easier one.

  console.log("3. Both switch the setting ON, so the asks below reach the task read");

  if (aliceConsentKnown) {
    const toOn = await setConsent(alice, alice.userId, true);
    record(judgeConsentSwitched(toOn, "Alice", true));
    record(judgeConsentReadBack(await readConsent(alice), "Alice", true));
  }

  if (bob !== null) {
    bobConsentBefore = await readConsent(bob);
    record(judgeConsentRead(bobConsentBefore, "Bob"));

    if (readConsentState(bobConsentBefore).known) {
      const bobOn = await setConsent(bob, bob.userId, true);
      record(judgeConsentSwitched(bobOn, "Bob", true));
    }
  }
  console.log("");

  // -------------------------------------------------------------------------
  // 4. Is the function there, and what does it say about Alice's own task?
  // -------------------------------------------------------------------------

  console.log("4. Alice asks for suggestions on her own task, with the setting ON");

  const aliceAsk = await callFunction(alice.accessToken, { task_id: taskId });
  if (aliceAsk.printable !== undefined) console.log(`        body: ${aliceAsk.printable}`);
  record(judgeFunctionDeployed(aliceAsk));
  record(judgeSuggestions(aliceAsk));
  console.log("");

  // -------------------------------------------------------------------------
  // 5. Who may NOT ask
  // -------------------------------------------------------------------------

  console.log(
    "5. Who may not ask: a stranger, a made-up id, a malformed id, and nobody at all -- in" +
      " the two shapes 'nobody' comes in",
  );

  // A uuid nobody issued. Built rather than random so two runs produce the same one,
  // which makes two runs' output comparable.
  const MADE_UP_ID = "00000000-0000-4000-8000-000000000001";

  const nonexistent = await callFunction(alice.accessToken, { task_id: MADE_UP_ID });
  if (nonexistent.printable !== undefined) console.log(`        made-up id:      ${nonexistent.printable}`);

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
    if (strangerAsk.printable !== undefined) console.log(`        Bob on Alice's:  ${strangerAsk.printable}`);
    record(judgeSameAsNotFound(strangerAsk, nonexistent));
  }

  const badId = await callFunction(alice.accessToken, { task_id: "not-a-uuid" });
  if (badId.printable !== undefined) console.log(`        not a uuid:      ${badId.printable}`);
  record(
    judgeBadRequest(badId, "a task id that is not a uuid is refused as a bad request", 400),
  );

  const noId = await callFunction(alice.accessToken, {});
  if (noId.printable !== undefined) console.log(`        no task id:      ${noId.printable}`);
  record(judgeBadRequest(noId, "a body with no task id at all is refused as a bad request", 400));

  // A TITLE INSTEAD OF AN ID, which is the shape issue #183 forbids: "The caller sends a
  // task ID, never a title." If the function ever grew a title parameter, this would
  // stop being a 400 -- and a signed-in person could send any text they liked.
  const titleInstead = await callFunction(alice.accessToken, { title: TASK_TITLE });
  if (titleInstead.printable !== undefined) console.log(`        a title:         ${titleInstead.printable}`);
  record(
    judgeBadRequest(
      titleInstead,
      "a body carrying a TITLE rather than an id is refused: the function takes ids only",
      400,
    ),
  );

  // NOBODY AT ALL, in the TWO shapes that means -- see the note beside
  // PLATFORM_NO_AUTH_CODE for why one check could not cover both.
  //
  // (b) first, because it is the one that was observed: the publishable key and nothing
  // else, which is what a signed-out browser using supabase-js sends.
  const apikeyOnly = await callFunction(null, { task_id: taskId });
  if (apikeyOnly.printable !== undefined) console.log(`        apikey only:     ${apikeyOnly.printable}`);
  record(judgeApikeyOnly(apikeyOnly));

  // (a) and then nothing at all -- no apikey, no Authorization.
  const noCredentials = await callFunction(null, { task_id: taskId }, { apikey: false });
  if (noCredentials.printable !== undefined) console.log(`        no credentials:  ${noCredentials.printable}`);
  record(judgeNoCredentials(noCredentials));
  console.log("");

  // -------------------------------------------------------------------------
  // 6. One call at a time
  // -------------------------------------------------------------------------

  console.log("6. Two asks at once");

  const [firstAsk, secondAsk] = await Promise.all([
    callFunction(alice.accessToken, { task_id: taskId }),
    callFunction(alice.accessToken, { task_id: taskId }),
  ]);
  if (firstAsk.printable !== undefined) console.log(`        first:  ${firstAsk.printable}`);
  if (secondAsk.printable !== undefined) console.log(`        second: ${secondAsk.printable}`);
  record(judgeOneAtATime(firstAsk, secondAsk));
  console.log("");

  // -------------------------------------------------------------------------
  // 7. She switches it OFF again -- and nobody else can touch it
  // -------------------------------------------------------------------------
  //
  // THE SECOND HALF OF WHAT ISSUE #211 ASKS FOR, and it is not the same check as
  // section 2's. Section 2 asked whether a setting that was already off refuses.
  // This asks whether switching it off STOPS something that was working a moment ago
  // -- which is the promise docs/plan.md makes in those words: "Switching it off stops
  // any further sending at once, because the function reads the setting on each
  // request and nothing caches it."
  //
  // So the order matters: this ask comes after three that succeeded, in the same run,
  // against the same deployed isolate. If the function cached the setting, or read it
  // once per isolate rather than once per request, this is the check that would catch
  // it and section 2's would not.

  console.log("7. She switches it OFF again, and the ask is refused again");

  if (aliceConsentKnown) {
    const backOff = await setConsent(alice, alice.userId, false);
    record(judgeConsentSwitched(backOff, "Alice", false));
    record(judgeConsentReadBack(await readConsent(alice), "Alice", false));

    const askedAfterOff = await callFunction(alice.accessToken, { task_id: taskId });
    if (askedAfterOff.printable !== undefined) {
      console.log(`        body: ${askedAfterOff.printable}`);
    }
    record(judgeRefusedWhenOff(askedAfterOff));
  }

  // NOBODY SWITCHES ANYBODY ELSE'S, and nobody reads anybody else's. Two separate
  // promises, both docs/plan.md's: "Only that person can switch it, and only for
  // themselves", and "Who can see it: the person whose setting it is; owner".
  if (bob === null) {
    record([
      {
        what: "Bob CANNOT switch Alice's setting: his update changes no row",
        verdict: UNVERIFIED,
        detail:
          "Bob could not sign in, so nobody tried to change somebody else's consent" +
          " setting. This is the check that proves one person cannot opt another person" +
          " in to sending their task titles to an outside company, and it has not been" +
          " made",
      },
    ]);
  } else {
    const before = await readConsent(alice);
    const bobsAttempt = await setConsent(bob, alice.userId, true);
    if (bobsAttempt.printable !== undefined) {
      console.log(`        Bob on Alice's row: ${bobsAttempt.printable}`);
    }
    const after = await readConsent(alice);
    record(judgeCannotChangeAnother(bobsAttempt, before, after));

    // And the column itself, asked for directly. HIS OWN ROW IS ENOUGH to settle it:
    // the privilege is about a column for a role across the whole table, so if he can
    // select it at all he can select it for every row the policies give him -- which
    // includes his team mates'.
    const bobsRead = await rest(
      "GET",
      `${PROFILES_PATH}?select=ai_suggestions_enabled`,
      { accessToken: bob.accessToken },
    );
    record(judgeCannotReadAnother(bobsRead));
  }
  console.log("");
} catch (cause) {
  console.log("");
  console.log(`  (the run stopped early: ${cause.message})`);
  console.log("");
} finally {
  // -------------------------------------------------------------------------
  // 8. Put staging back as it was found
  // -------------------------------------------------------------------------

  console.log("8. Clearing up, and what this run touched");

  // THE SETTINGS FIRST, before the task and before the sign-outs, because this is the
  // part that would otherwise leave somebody opted in to sending their task titles to
  // an outside company. It is in the `finally`, so it happens even when the run
  // stopped early -- which is exactly when it is most needed.
  //
  // Each person is only written if this run READ their setting to begin with: the
  // restore writes the value it found, so with nothing found there is nothing to write
  // and nothing was ever changed.
  for (const [who, session, before] of [
    ["Alice", alice, aliceConsentBefore],
    ["Bob", bob, bobConsentBefore],
  ]) {
    if (session === null || before === null) continue;

    const state = readConsentState(before);
    if (!state.known) {
      record(judgeConsentRestored(who, before, before));
      continue;
    }

    await setConsent(session, session.userId, state.enabled);
    record(judgeConsentRestored(who, before, await readConsent(session)));
  }

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
  console.log("  * WHICH LAYER refuses a call with no credentials at ALL, until this run");
  console.log("    has actually made one. Section 3 check (a) is the first time anybody");
  console.log("    has asked suggest-subtasks that; the expectation is the platform's own");
  console.log("    401, reasoned from the other three functions, not observed here.");

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
//   1. BEFORE the deploy of the Build it 21 version. TWO THINGS MAKE THIS FAIL and it
//      is worth knowing which one you are looking at:
//
//        * if the function is deployed but is the BUILD IT 20 version, it has no
//          consent check, so section 2's "the ask is refused with the setting off"
//          fails -- the function answers 200 with suggestions for somebody who has not
//          consented. That is the FAIL issue #211 asks to be kept, and it is the
//          evidence that the behaviour was not there;
//        * if no function of that name is deployed at all, the platform answers 404 to
//          every call and judgeFunctionDeployed fails as well.
//
//      Keep that output either way.
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
