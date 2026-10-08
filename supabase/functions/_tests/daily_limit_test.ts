// daily_limit_test.ts -- the daily limits, over the bodies the two functions
// actually build.
//
// Build it 22 part 2, issue #221. What it is about:
//
//   supabase/functions/_shared/limits.ts       the two numbers, the sentence, the
//                                              two codes, and the gate
//   supabase/functions/suggest-subtasks/...    the AI ask, which must not reach
//                                              Anthropic when the count refuses
//   supabase/functions/invite-member/...       the invitation, which must not reach
//                                              the email service when it refuses
//
// WHAT MAKES THIS FILE WORTH ANYTHING, and it is the same argument the consent
// tests in suggest_subtasks_test.ts rest on: every function it calls is IMPORTED
// FROM THE CODE UNDER TEST. The gate is the real `withDailyLimit` the two handlers
// call, the refusal is the real `dailyLimitRefusal` they send, the numbers are the
// real `DAILY_LIMITS` they read, and `proceed` is built out of the real pieces of
// each handler -- `buildAnthropicRequest` and `callAnthropic` for one,
// `codeFromSendResponse` and `invitationAnswer` for the other. Nothing here writes
// out a copy of a sentence, a status or an order and then checks its own copy.
//
// THE FOUR THINGS ISSUE #221 ASKS FOR, and where each one is:
//
//   under the limit                section 5 and 6, the "ONCE and untouched" tests
//   at the limit                   section 5 and 6, and section 3 for the body
//   an error from the count        section 5 and 6, and section 2 for every shape
//   the stubbed service gets       section 5 and 6: the spies' log must be EMPTY,
//   NOTHING at the limit           and `proceed` must not have run at all
//
//   and a can-this-fail guard      section 7, which feeds the same assertions a
//                                  gate from a world where the count always says
//                                  yes -- and requires them to go RED
//
// IT REACHES NO DATABASE AND NO NETWORK. Every count is a function returning a
// value this file wrote, and both paid services are stubs that record what they
// were given. The one thing it reads off the disk is the migration, so that the two
// feature words are compared with the check constraint that enforces them rather
// than with a second copy of themselves.
//
// AND IT PROVES NOTHING ABOUT A DEPLOYED FUNCTION, which is rule 8's half of this.
// Nothing in this repository is deployed by this change: a run here says the bodies
// are right, and `scripts/staging/build-it-20-ai-checks.mjs` is what says the
// deployed one refuses. The bottom of this file has the command.

import {
  COUNT_RPC,
  countOneUse,
  DAILY_LIMIT_CODE,
  DAILY_LIMIT_MESSAGE,
  DAILY_LIMIT_STATUS,
  DAILY_LIMIT_UNKNOWN_CODE,
  DAILY_LIMITS,
  dailyLimit,
  dailyLimitRefusal,
  FEATURE_AI_SUGGESTIONS,
  FEATURE_INVITATIONS,
  FEATURES,
  type UsageCountCall,
  withDailyLimit,
} from "../_shared/limits.ts";

// The real pieces of the AI ask, in the order the handler runs them.
import {
  buildAnthropicRequest,
  callAnthropic,
  readSuggestions,
  SUGGEST_CODES,
  suggestionsAnswer,
  UNAVAILABLE_MESSAGE,
  unavailableAnswer,
} from "../suggest-subtasks/index.ts";

// And the real pieces of the invitation send.
import {
  codeFromSendResponse,
  FAILURE_CODES,
  invitationAnswer,
  sendFailureAnswer,
} from "../invite-member/index.ts";

// ---------------------------------------------------------------------------
// Made-up values. Every one of them belongs to nobody.
// ---------------------------------------------------------------------------

const MADE_UP_USER_ID = "a1b2c3d4-0022-4e5f-8a9b-0c1d2e3f4a5b";
const MADE_UP_TITLE = "Run the autumn jumble sale";
const MADE_UP_EMAIL = "nobody-at-all@example.com";
const MADE_UP_TEAM_NAME = "Tuesday crew";
const MADE_UP_INVITATION_ID = "a1b2c3d4-0023-4e5f-8a9b-0c1d2e3f4a5b";

// A key-shaped string, deliberately dull: `.githooks/pre-commit` runs gitleaks,
// which cannot tell a fixture from the real thing, and a repeated character has
// almost no entropy. suggest_subtasks_test.ts beside this file says the same.
const KEY_SHAPED = `not-a-real-api-key-${"y".repeat(24)}`;

// A model name is NOT written out here: approved-models.json is the only file
// allowed to name one, and scripts/approved-model-check.mjs enforces that from the
// other end. This is obviously not one.
const NOT_A_MODEL = "a-model-name-this-app-never-sends";

// ---------------------------------------------------------------------------
// Reading a response
// ---------------------------------------------------------------------------

type Body = Record<string, unknown>;

async function readBody(answer: Response): Promise<{ text: string; body: Body | null }> {
  const text = await answer.text();
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { text, body: null };
    }
    return { text, body: parsed as Body };
  } catch {
    return { text, body: null };
  }
}

// Things that must never appear in a refusal about a limit. The sentence names no
// company, model, key, status or number -- docs/plan.md says so in those words --
// and it must not carry anything about the person either.
const MUST_NOT_APPEAR = [
  MADE_UP_USER_ID,
  MADE_UP_EMAIL,
  MADE_UP_TITLE,
  MADE_UP_TEAM_NAME,
  KEY_SHAPED,
  "anthropic",
  "claude",
  "resend",
  "usage_counts",
  "count_daily_use",
  FEATURE_AI_SUGGESTIONS,
  FEATURE_INVITATIONS,
];

function disclosureProblems(text: string): string[] {
  const problems: string[] = [];
  const lower = text.toLowerCase();
  for (const value of MUST_NOT_APPEAR) {
    if (lower.includes(value.toLowerCase())) {
      problems.push(`the answer contains ${JSON.stringify(value)}`);
    }
  }
  return problems;
}

// The shapes a count can come back in, written once and used by both halves of
// section 5 and 6 so that neither function is tested against a softer set than the
// other.
const COUNT_SAYS_YES: UsageCountCall = () =>
  Promise.resolve({ data: true, error: null });
const COUNT_SAYS_NO: UsageCountCall = () =>
  Promise.resolve({ data: false, error: null });
// The unknown-feature raise and the foreign-key raise both arrive like this. The
// coach measured both in a sandbox on PR #224 and said what the calling functions
// have to do about them: treat any error as "not allowed".
const COUNT_ERRORED: UsageCountCall = () =>
  Promise.resolve({ data: null, error: { code: "23514" } });

// =========================================================================
// 1. The config: two numbers, two words, one file
// =========================================================================

Deno.test("the two limits are 20 and 20, in one file, and nothing else is in it", () => {
  const problems: string[] = [];

  // THE NUMBERS THE OWNER CONFIRMED ON 2026-10-08, after the arithmetic in
  // docs/costs.md and knowing that 20 is not what keeps either service inside its
  // vendor ceiling. A change to either is a change to this line as well, which is
  // the point: a limit nobody can find is a limit nobody can check.
  if (DAILY_LIMITS[FEATURE_AI_SUGGESTIONS] !== 20) {
    problems.push(`the AI limit is ${DAILY_LIMITS[FEATURE_AI_SUGGESTIONS]}, expected 20`);
  }
  if (DAILY_LIMITS[FEATURE_INVITATIONS] !== 20) {
    problems.push(`the invitation limit is ${DAILY_LIMITS[FEATURE_INVITATIONS]}, expected 20`);
  }

  // TWO FEATURES AND NO MORE. A third key here with no migration behind it would be
  // a bucket no limit watches and the database would refuse every write to it.
  const keys = Object.keys(DAILY_LIMITS).sort();
  if (JSON.stringify(keys) !== JSON.stringify([FEATURE_AI_SUGGESTIONS, FEATURE_INVITATIONS].sort())) {
    problems.push(`the features are ${keys.join(", ")}`);
  }

  // dailyLimit() is what the call sites use, so it is what has to agree.
  for (const feature of FEATURES) {
    if (dailyLimit(feature) !== DAILY_LIMITS[feature]) {
      problems.push(`dailyLimit(${feature}) is ${dailyLimit(feature)}`);
    }
  }

  if (problems.length > 0) throw new Error(problems.join("; "));
});

// THE FEATURE WORDS ARE THE DATABASE'S, NOT THIS FILE'S, and this is where the two
// are compared. The same shape of test as invitation_status_test.ts' reading of the
// invitation-status constraint, and for the same reason: a word added in TypeScript
// without a migration behind it is refused at run time by
// usage_counts_feature_allowed, which turns into an error, which the gate turns
// into a refusal -- so the first symptom would be a feature that silently stopped
// working.
Deno.test("the feature words are the ones the migration's check constraint allows", async () => {
  const path = new URL(
    "../../migrations/20261008115900_usage_counts.sql",
    import.meta.url,
  );
  const sql = await Deno.readTextFile(path);

  const problems: string[] = [];

  const constraint = sql.match(
    /add constraint usage_counts_feature_allowed\s*\n?\s*check \(feature in \(([^)]*)\)\)/,
  );
  if (!constraint) {
    throw new Error(
      "usage_counts_feature_allowed was not found in " +
        "supabase/migrations/20261008115900_usage_counts.sql. If that migration was " +
        "renamed or the constraint rewritten, this test has to be pointed at the new one " +
        "-- it must not be deleted, because then nothing compares the words with the " +
        "constraint that enforces them",
    );
  }

  const allowed = [...constraint[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  const ours = [...FEATURES].sort();

  if (JSON.stringify(allowed) !== JSON.stringify(ours)) {
    problems.push(
      `the migration allows ${allowed.join(", ")} and limits.ts names ${ours.join(", ")}`,
    );
  }

  // AND THE NAME OF THE FUNCTION THE TWO CALL SITES CALL. A misspelled rpc name is a
  // 404 from PostgREST, which countOneUse reads as an error, which refuses -- safe,
  // and silent. This line is what makes it loud instead.
  if (!sql.includes(`create function public.${COUNT_RPC}(`)) {
    problems.push(
      `the migration does not declare public.${COUNT_RPC}(, so COUNT_RPC names a ` +
        `function that is not there`,
    );
  }

  // The three argument names, by which PostgREST matches an rpc call. A rename in the
  // database with no change here would mean every call ran with defaults -- and there
  // are none, so it would error, so it would refuse everybody.
  for (const argument of ["p_user_id", "p_feature", "p_limit"]) {
    if (!sql.includes(argument)) {
      problems.push(`the migration does not mention the argument ${argument}`);
    }
  }

  if (problems.length > 0) throw new Error(problems.join("; "));
});

// NEITHER NUMBER IS SPELLED AT A CALL SITE, which is issue #221's first condition
// and docs/plan.md's "Not spelled at a call site and not in two places".
//
// HOW IT IS CHECKED: the two handlers' source is read and searched for a limit-shaped
// number near the counting call. Reading source rather than calling a function is
// unusual in this folder and it is the only way to assert an ABSENCE -- there is no
// value to pass in that would reveal a second copy of 20 sitting in a file.
Deno.test("neither function spells a limit: both read it from the one file", async () => {
  const problems: string[] = [];

  for (
    const [name, path] of [
      ["suggest-subtasks", "../suggest-subtasks/index.ts"],
      ["invite-member", "../invite-member/index.ts"],
    ] as const
  ) {
    const source = await Deno.readTextFile(new URL(path, import.meta.url));

    // The import itself. Without it the rest of this test would pass trivially.
    if (!source.includes(`from "../_shared/limits.ts"`)) {
      problems.push(`${name} does not import from ../_shared/limits.ts at all`);
    }
    if (!source.includes("dailyLimit(")) {
      problems.push(`${name} never calls dailyLimit(), so where does its limit come from?`);
    }

    // AND NO NUMBER PASSED AS p_limit. The call site must pass the function's
    // answer, never a literal. This looks for `p_limit:` followed by digits, which
    // is exactly the mistake being ruled out.
    if (/p_limit:\s*\d/.test(source)) {
      problems.push(
        `${name} passes a NUMBER as p_limit. The limit must come from ` +
          `dailyLimit(), or there are two places to change it`,
      );
    }
  }

  if (problems.length > 0) throw new Error(problems.join("; "));
});

// =========================================================================
// 2. countOneUse: three answers, and everything that is not a boolean
// =========================================================================
//
// THE WHOLE OF THE "an unknown is not a yes" RULE IS HERE. Issue #221: "An error
// from count_daily_use is a refusal. A failed count is not permission to spend
// money -- same shape as create-team's 'an unknown is not a zero'."

for (
  const testCase of [
    {
      name: "true: the count was below the limit and has been increased",
      answer: { data: true, error: null },
      expect: { allowed: true },
    },
    {
      name: "FALSE: the count had already reached the limit, so nothing was written",
      answer: { data: false, error: null },
      expect: { allowed: false, why: "at_limit" },
    },
    {
      name: "AN ERROR WITH A CODE: the check constraint refused an unknown feature",
      answer: { data: null, error: { code: "23514" } },
      expect: { allowed: false, why: "unknown", code: "23514" },
    },
    {
      name: "an error with a code: the foreign key refused a user id with no account",
      answer: { data: null, error: { code: "23503" } },
      expect: { allowed: false, why: "unknown", code: "23503" },
    },
    {
      name: "an error with a code: the execute grant is missing, which is 42501",
      answer: { data: null, error: { code: "42501" } },
      expect: { allowed: false, why: "unknown", code: "42501" },
    },
    {
      name: "an error with no code at all",
      answer: { data: null, error: {} },
      expect: { allowed: false, why: "unknown", code: undefined },
    },
    {
      name: "no error, and null -- which the database never sends, so it is an unknown",
      answer: { data: null, error: null },
      expect: { allowed: false, why: "unknown" },
    },
    {
      name: "no error, and nothing at all",
      answer: { data: undefined, error: null },
      expect: { allowed: false, why: "unknown" },
    },
    {
      name: "the STRING \"true\" rather than the boolean: not a yes",
      answer: { data: "true", error: null },
      expect: { allowed: false, why: "unknown" },
    },
    {
      name: "THE STRING \"false\", WHICH IS TRUTHY: emphatically not a yes",
      answer: { data: "false", error: null },
      expect: { allowed: false, why: "unknown" },
    },
    {
      name: "the number 1, which a truthy test would read as permission",
      answer: { data: 1, error: null },
      expect: { allowed: false, why: "unknown" },
    },
    {
      name: "the number 0",
      answer: { data: 0, error: null },
      expect: { allowed: false, why: "unknown" },
    },
    {
      name: "the single character \"t\", which is how Postgres prints a true to a terminal",
      answer: { data: "t", error: null },
      expect: { allowed: false, why: "unknown" },
    },
    {
      name: "a row rather than a scalar, which is what a function returning a table would give",
      answer: { data: [{ count_daily_use: true }], error: null },
      expect: { allowed: false, why: "unknown" },
    },
  ]
) {
  Deno.test(`countOneUse: ${testCase.name}`, async () => {
    const verdict = await countOneUse(() => Promise.resolve(testCase.answer));
    const got = JSON.stringify(verdict);
    const want = JSON.stringify(testCase.expect);
    if (got !== want) throw new Error(`got ${got}, expected ${want}`);
  });
}

Deno.test("countOneUse: the call THREW -- still not a yes", async () => {
  const verdict = await countOneUse(() => {
    throw new Error("the connection went away");
  });
  if (verdict.allowed) throw new Error("a thrown error was read as permission to spend money");
  if (verdict.why !== "unknown") throw new Error(`why is ${verdict.why}, expected unknown`);
});

Deno.test("countOneUse: the call's promise REJECTED -- still not a yes", async () => {
  const verdict = await countOneUse(() => Promise.reject(new Error("no")));
  if (verdict.allowed) throw new Error("a rejected promise was read as permission to spend money");
  if (verdict.why !== "unknown") throw new Error(`why is ${verdict.why}, expected unknown`);
});

// NOTHING ABOUT THE CAUSE COMES BACK except a Postgres code, and that goes no
// further than this verdict -- the two call sites put it in no body and no log line.
Deno.test("countOneUse: a thrown error's message is not kept", async () => {
  const verdict = await countOneUse(() => {
    throw new Error(`connection to ${MADE_UP_EMAIL} failed holding ${KEY_SHAPED}`);
  });
  const problems = disclosureProblems(JSON.stringify(verdict));
  if (problems.length > 0) throw new Error(problems.join("; "));
});

// =========================================================================
// 3. The refusal: one sentence, one status, two codes
// =========================================================================

Deno.test("the limit refusal is the plan's sentence, character for character", async () => {
  const problems: string[] = [];

  // docs/plan.md: "When the limit is reached the person sees: 'You've reached
  // today's limit. It resets tomorrow.'" Written out here as this file's own
  // statement of the contract -- the point of a test is to disagree with the code
  // when the code changes, which importing the string and comparing it with itself
  // could never do.
  const EXPECTED = "You've reached today's limit. It resets tomorrow.";

  if (DAILY_LIMIT_MESSAGE !== EXPECTED) {
    problems.push(
      `the sentence is ${JSON.stringify(DAILY_LIMIT_MESSAGE)}, expected ` +
        `${JSON.stringify(EXPECTED)}`,
    );
  }

  const answer = dailyLimitRefusal();
  if (answer.status !== DAILY_LIMIT_STATUS) {
    problems.push(`the status is ${answer.status}, expected ${DAILY_LIMIT_STATUS}`);
  }
  if (DAILY_LIMIT_STATUS !== 429) {
    problems.push(`DAILY_LIMIT_STATUS is ${DAILY_LIMIT_STATUS}, expected 429`);
  }

  const { text, body } = await readBody(answer);
  if (!body) {
    problems.push(`the body is not a JSON object: ${text}`);
  } else {
    if (body.error !== EXPECTED) problems.push(`the body's sentence is ${JSON.stringify(body.error)}`);
    if (body.code !== DAILY_LIMIT_CODE) problems.push(`the body's code is ${JSON.stringify(body.code)}`);
    const extra = Object.keys(body).filter((key) => !["error", "code"].includes(key));
    if (extra.length > 0) problems.push(`extra fields: ${extra.join(", ")}`);
  }

  // NAMES NO COMPANY, MODEL, KEY, STATUS OR NUMBER -- docs/plan.md's own list. The
  // digit check is what catches "you have used 20 of 20", which would be truer and
  // would be the one sentence in this app that could go stale against limits.ts.
  if (/\d/.test(DAILY_LIMIT_MESSAGE)) {
    problems.push("the sentence contains a digit, so possibly a limit or a status");
  }
  if (DAILY_LIMIT_MESSAGE.includes(DAILY_LIMIT_CODE)) {
    problems.push("the sentence contains the raw code, which is not for a person to read");
  }
  problems.push(...disclosureProblems(text));

  if (problems.length > 0) throw new Error(problems.join("; "));
});

Deno.test("the limit sentence says what happened AND when it ends", () => {
  const problems: string[] = [];
  const lower = DAILY_LIMIT_MESSAGE.toLowerCase();

  // Two halves, because a sentence with only the first reads as a dead end and the
  // plan asks for both: "saying what happened and when it ends".
  if (!lower.includes("limit")) problems.push("it does not say a limit was reached");
  if (!lower.includes("tomorrow")) problems.push("it does not say when it comes back");

  if (problems.length > 0) throw new Error(problems.join("; "));
});

// THE TWO CODES AND WHERE THEY MAY AND MAY NOT APPEAR. This is the test that holds
// docs/plan.md's decision that the limit refusal is NOT one of the twelve -- now
// thirteen -- fixed failure codes, and the matching one that the COUNTER ERROR is.
Deno.test("daily_limit is NOT a fixed-failure code, and daily_limit_unknown IS", () => {
  const problems: string[] = [];
  const codes = SUGGEST_CODES as readonly string[];

  // If `daily_limit` were in that list, suggest_subtasks_test.ts' "every code
  // produces the SAME sentence" would require it to carry "Suggestions aren't
  // available right now." -- which is exactly the sentence docs/plan.md refuses for
  // this refusal: "hiding it behind 'Suggestions aren't available right now' would be
  // using a sentence designed to conceal plumbing to conceal something useful."
  if (codes.includes(DAILY_LIMIT_CODE)) {
    problems.push(
      `${DAILY_LIMIT_CODE} is in SUGGEST_CODES, so it would be required to carry the ` +
        `fixed sentence -- and it has its own, on purpose`,
    );
  }

  // And the other way round: the counter ERROR is plumbing, so it gets the fixed
  // sentence, and being in that list IS the fixed sentence.
  if (!codes.includes(DAILY_LIMIT_UNKNOWN_CODE)) {
    problems.push(
      `${DAILY_LIMIT_UNKNOWN_CODE} is not in SUGGEST_CODES, so a count that cannot be ` +
        `written would not get the fixed sentence that docs/plan.md requires for a ` +
        `failed read`,
    );
  }

  // NEITHER IS AN INVITATION STATUS CODE. invite-member's FAILURE_CODES are a check
  // constraint in 20261006095847_invitation_status.sql -- they say what happened to an
  // email -- and nothing about a daily limit is that. Adding to that list would need a
  // migration, which this change does not have and does not need.
  for (const code of [DAILY_LIMIT_CODE, DAILY_LIMIT_UNKNOWN_CODE]) {
    if ((FAILURE_CODES as readonly string[]).includes(code)) {
      problems.push(
        `${code} is in invite-member's FAILURE_CODES, which is a check constraint on the ` +
          `invitations table -- so a row could never be written with it`,
      );
    }
  }

  // Two different words, because they are different news: one is a quiet day, the
  // other is a page to open.
  //
  // Compared as plain strings, because with both as literal types the compiler
  // narrows them and refuses the comparison as unintentional -- which is a stronger
  // guarantee than this line, and also means this line has to be written in a way
  // that still runs. If they were ever made the same word, `deno check` would be the
  // thing that complained first.
  const codeWords: string[] = [DAILY_LIMIT_CODE, DAILY_LIMIT_UNKNOWN_CODE];
  if (new Set(codeWords).size !== codeWords.length) {
    problems.push("the two codes are the same word, so the owner cannot tell them apart");
  }
  for (const code of [DAILY_LIMIT_CODE, DAILY_LIMIT_UNKNOWN_CODE]) {
    if (!/^[a-z][a-z_]*[a-z]$/.test(code)) {
      problems.push(`"${code}" is not a short lower-case identifier`);
    }
  }

  if (problems.length > 0) throw new Error(problems.join("; "));
});

// =========================================================================
// 4. There is no way to give a use back
// =========================================================================
//
// docs/plan.md, the owner's decision of 2026-10-08: "The count is written
// immediately before the paid call is made, and no answer -- success, refusal,
// timeout or silence -- changes it afterwards."
//
// THIS IS AN ABSENCE, so it is checked as one: the module exports nothing that could
// undo a count. A later change that added a refund path would have to delete this
// test, which is a thing a reviewer can see.

Deno.test("limits.ts exports no way to give a counted use back", async () => {
  const module = await import("../_shared/limits.ts");
  const names = Object.keys(module);
  const problems: string[] = [];

  for (const forbidden of ["uncount", "giveBack", "refund", "decrement", "resetCount"]) {
    if (names.some((name) => name.toLowerCase() === forbidden.toLowerCase())) {
      problems.push(
        `limits.ts exports ${forbidden}. A count that can be given back makes a loop of ` +
          `failures free, which is the thing the owner's ordering decision rules out`,
      );
    }
  }

  if (problems.length > 0) throw new Error(problems.join("; "));
});

// =========================================================================
// 5. suggest-subtasks: AT THE LIMIT, ANTHROPIC RECEIVES NOTHING
// =========================================================================
//
// The spies below stand in for the one thing in that handler that costs money,
// and nothing else. `proceed` IS the rest of the handler: it builds the request
// with the real `buildAnthropicRequest`, sends it through the real `callAnthropic`
// with a stubbed fetch, reads the reply with the real `readSuggestions`, and
// answers with the real `suggestionsAnswer`. So a gate that counted and then
// carried on regardless would fail these, and so would one that called the service
// first and counted afterwards.

function aiSpies() {
  const log: string[] = [];

  const stubbedService = (
    _url: string,
    init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal },
  ) => {
    log.push(`the AI service received a request of ${init.body.length} bytes`);
    return Promise.resolve(
      Response.json({ content: [{ type: "text", text: "Book the hall" }] }, { status: 200 }),
    );
  };

  let calls = 0;
  const proceed = async (): Promise<Response> => {
    calls += 1;
    const result = await callAnthropic(
      buildAnthropicRequest({ model: NOT_A_MODEL, title: MADE_UP_TITLE, apiKey: KEY_SHAPED }),
      { fetchImpl: stubbedService },
    );
    if (!result.ok) return unavailableAnswer(result.code);
    const verdict = readSuggestions(result.body);
    if (!verdict.ok) return unavailableAnswer(verdict.code);
    return suggestionsAnswer(verdict.suggestions);
  };

  return { log, proceed, calls: () => calls };
}

// The unknown answer suggest-subtasks passes in, built out of ITS real builder so
// that what this test reads is the body that function sends.
function aiUnknownAnswer(): Response {
  return unavailableAnswer(DAILY_LIMIT_UNKNOWN_CODE);
}

for (
  const testCase of [
    {
      name: "AT THE LIMIT",
      count: COUNT_SAYS_NO,
      expectStatus: DAILY_LIMIT_STATUS,
      expectCode: DAILY_LIMIT_CODE,
      expectSentence: DAILY_LIMIT_MESSAGE,
    },
    {
      name: "THE COUNT ERRORED",
      count: COUNT_ERRORED,
      expectStatus: 503,
      expectCode: DAILY_LIMIT_UNKNOWN_CODE,
      expectSentence: UNAVAILABLE_MESSAGE,
    },
  ]
) {
  Deno.test(
    `suggest-subtasks: ${testCase.name} -- the AI service receives NOTHING and no request is built`,
    async () => {
      const spies = aiSpies();
      const answer = await withDailyLimit(
        { count: testCase.count, unknownAnswer: aiUnknownAnswer },
        spies.proceed,
      );

      const problems: string[] = [];

      // THE WHOLE POINT, first.
      if (spies.calls() !== 0) {
        problems.push(
          `the rest of the handler ran ${spies.calls()} time(s). What it did: ` +
            `${spies.log.join("; ") || "(nothing recorded)"}`,
        );
      }
      if (spies.log.length > 0) {
        problems.push(
          `these things happened and none of them should have: ${spies.log.join("; ")}`,
        );
      }

      if (answer.status !== testCase.expectStatus) {
        problems.push(`the status is ${answer.status}, expected ${testCase.expectStatus}`);
      }

      const { text, body } = await readBody(answer);
      if (!body) {
        problems.push(`the body is not a JSON object: ${text}`);
      } else {
        if (body.code !== testCase.expectCode) {
          problems.push(`the code is ${JSON.stringify(body.code)}, expected ${testCase.expectCode}`);
        }
        if (body.error !== testCase.expectSentence) {
          problems.push(`the sentence is ${JSON.stringify(body.error)}`);
        }
      }
      problems.push(...disclosureProblems(text));

      if (problems.length > 0) throw new Error(problems.join("; "));
    },
  );
}

Deno.test(
  "suggest-subtasks: UNDER THE LIMIT -- the ask runs ONCE and its answer comes back untouched",
  async () => {
    const spies = aiSpies();
    const answer = await withDailyLimit(
      { count: COUNT_SAYS_YES, unknownAnswer: aiUnknownAnswer },
      spies.proceed,
    );

    const problems: string[] = [];

    // THE OVER-CORRECTION GUARD. A gate that refused everybody would pass both tests
    // above and would quietly break the feature for everybody inside their limit --
    // which is the failure nobody would notice until a volunteer complained.
    if (spies.calls() !== 1) {
      problems.push(`the rest of the handler ran ${spies.calls()} time(s), expected exactly 1`);
    }
    if (!spies.log.some((line) => line.startsWith("the AI service received a request"))) {
      problems.push("the AI service received nothing, so the gate did not let the ask through");
    }

    // And the gate returns `proceed`'s answer rather than one of its own.
    if (answer.status !== 200) problems.push(`the status is ${answer.status}, expected 200`);
    const { text, body } = await readBody(answer);
    if (!body) {
      problems.push(`the body is not a JSON object: ${text}`);
    } else if (JSON.stringify(body.suggestions) !== JSON.stringify(["Book the hall"])) {
      problems.push(`the answer is ${text}, not the one the rest of the handler built`);
    }

    if (problems.length > 0) throw new Error(problems.join("; "));
  },
);

// AND THE USE IS NOT GIVEN BACK WHEN THE PAID CALL FAILS, which is the awkward half
// of the owner's decision and the one place this rule gives a wrong-looking answer.
// docs/plan.md: "`unreachable` -- the request could never be made at all, so it cost
// nothing", and it counts anyway.
//
// What this test can show about that, and it is the whole of what a body can show:
// the count was asked exactly ONCE, before the call, and nothing after the failure
// asked it anything again.
Deno.test(
  "suggest-subtasks: a request that could never be made still counted -- the count is asked once, before it",
  async () => {
    const order: string[] = [];

    const count: UsageCountCall = () => {
      order.push("counted");
      return Promise.resolve({ data: true, error: null });
    };

    const unreachable = () => {
      order.push("the AI service was called and could not be reached");
      return Promise.reject(new Error("dns"));
    };

    const answer = await withDailyLimit(
      { count, unknownAnswer: aiUnknownAnswer },
      async () => {
        const result = await callAnthropic(
          buildAnthropicRequest({ model: NOT_A_MODEL, title: MADE_UP_TITLE, apiKey: KEY_SHAPED }),
          { fetchImpl: unreachable },
        );
        if (!result.ok) return unavailableAnswer(result.code);
        return suggestionsAnswer(["unreachable, so this line is wrong"]);
      },
    );

    const problems: string[] = [];

    if (JSON.stringify(order) !== JSON.stringify([
      "counted",
      "the AI service was called and could not be reached",
    ])) {
      problems.push(`the order was ${order.join(" -> ")}`);
    }
    if (order.filter((step) => step === "counted").length !== 1) {
      problems.push("the count was not asked exactly once");
    }

    const { body } = await readBody(answer);
    if (body?.code !== "unreachable") {
      problems.push(`the code is ${JSON.stringify(body?.code)}, expected unreachable`);
    }

    if (problems.length > 0) throw new Error(problems.join("; "));
  },
);

// =========================================================================
// 6. invite-member: AT THE LIMIT, THE EMAIL SERVICE RECEIVES NOTHING
// =========================================================================
//
// The same three tests over the other function, with the real pieces of ITS send:
// a stubbed fetch to the email service, the real `codeFromSendResponse` reading what
// came back, and the real `invitationAnswer` and `sendFailureAnswer` building the
// answer.

function emailSpies() {
  const log: string[] = [];

  let calls = 0;
  const proceed = async (): Promise<Response> => {
    calls += 1;

    // The stubbed email service. It records that it was asked at all, which is the
    // one thing these tests are about.
    log.push(`the email service received a message for ${MADE_UP_EMAIL}`);
    const serviceAnswer = Response.json({ id: "a-made-up-message-id" }, { status: 200 });

    const sent = await codeFromSendResponse(serviceAnswer);
    if (!sent.ok) return sendFailureAnswer({ code: sent.code, recorded: true });

    return invitationAnswer({
      id: MADE_UP_INVITATION_ID,
      email: MADE_UP_EMAIL,
      expires_at: "2026-10-15T00:00:00.000Z",
      status: "sent",
      redirected: false,
      retried: false,
    });
  };

  return { log, proceed, calls: () => calls };
}

// The unknown answer invite-member passes in. Its own sentence, in the shape that
// function uses for every other check that did not answer, and a 500 because the
// cause is a failed check rather than a limit.
function inviteUnknownAnswer(): Response {
  return Response.json(
    {
      error:
        "Could not check today's limit, so no invitation email was sent. Please try again.",
      code: DAILY_LIMIT_UNKNOWN_CODE,
    },
    { status: 500 },
  );
}

for (
  const testCase of [
    {
      name: "AT THE LIMIT",
      count: COUNT_SAYS_NO,
      expectStatus: DAILY_LIMIT_STATUS,
      expectCode: DAILY_LIMIT_CODE,
    },
    {
      name: "THE COUNT ERRORED",
      count: COUNT_ERRORED,
      expectStatus: 500,
      expectCode: DAILY_LIMIT_UNKNOWN_CODE,
    },
  ]
) {
  Deno.test(
    `invite-member: ${testCase.name} -- the email service receives NOTHING and no email is sent`,
    async () => {
      const spies = emailSpies();
      const answer = await withDailyLimit(
        { count: testCase.count, unknownAnswer: inviteUnknownAnswer },
        spies.proceed,
      );

      const problems: string[] = [];

      if (spies.calls() !== 0) {
        problems.push(
          `the rest of the handler ran ${spies.calls()} time(s). What it did: ` +
            `${spies.log.join("; ") || "(nothing recorded)"}`,
        );
      }
      if (spies.log.length > 0) {
        problems.push(
          `these things happened and none of them should have: ${spies.log.join("; ")}`,
        );
      }

      if (answer.status !== testCase.expectStatus) {
        problems.push(`the status is ${answer.status}, expected ${testCase.expectStatus}`);
      }

      const { text, body } = await readBody(answer);
      if (!body) {
        problems.push(`the body is not a JSON object: ${text}`);
      } else if (body.code !== testCase.expectCode) {
        problems.push(`the code is ${JSON.stringify(body.code)}, expected ${testCase.expectCode}`);
      }

      // The invited address must not come back in either refusal. It is personal data
      // under docs/plan.md's appendix, and it is data about somebody who never signed
      // up for anything.
      problems.push(...disclosureProblems(text));

      if (problems.length > 0) throw new Error(problems.join("; "));
    },
  );
}

Deno.test(
  "invite-member: UNDER THE LIMIT -- the send runs ONCE and its answer comes back untouched",
  async () => {
    const spies = emailSpies();
    const answer = await withDailyLimit(
      { count: COUNT_SAYS_YES, unknownAnswer: inviteUnknownAnswer },
      spies.proceed,
    );

    const problems: string[] = [];

    if (spies.calls() !== 1) {
      problems.push(`the rest of the handler ran ${spies.calls()} time(s), expected exactly 1`);
    }
    if (!spies.log.some((line) => line.startsWith("the email service received"))) {
      problems.push("the email service received nothing, so the gate did not let the send through");
    }

    // 201, which is what invite-member answers for a send that went -- read off ITS
    // builder rather than written out here.
    if (answer.status !== 201) problems.push(`the status is ${answer.status}, expected 201`);
    const { body } = await readBody(answer);
    const invitation = (body as { invitation?: { status?: unknown } } | null)?.invitation;
    if (invitation?.status !== "sent") {
      problems.push(`the invitation's status is ${JSON.stringify(invitation?.status)}`);
    }

    if (problems.length > 0) throw new Error(problems.join("; "));
  },
);

// A RETRY IS COUNTED, AND IT IS COUNTED BY THE SAME GATE. The owner decided on
// 2026-10-08 that a retry counts, "because the thing being limited is the email and a
// retry sends one".
//
// WHAT THIS TEST CAN AND CANNOT SHOW. It cannot drive the handler's retry branch,
// which needs a database. What it shows is the thing that makes the retry counted at
// all: ONE gate in front of ONE send, so a retried send goes through exactly the same
// count as a first one and is refused by it in exactly the same way. The deployed
// half is the staging script's.
Deno.test(
  "invite-member: a RETRY goes through the same gate -- at the limit, no second email either",
  async () => {
    const problems: string[] = [];

    // The same spies, with the answer a retry builds: `retried: true`.
    const log: string[] = [];
    let calls = 0;
    const retrySend = async (): Promise<Response> => {
      calls += 1;
      log.push(`the email service received a SECOND message for ${MADE_UP_EMAIL}`);
      const sent = await codeFromSendResponse(
        Response.json({ id: "a-made-up-message-id" }, { status: 200 }),
      );
      if (!sent.ok) return sendFailureAnswer({ code: sent.code, recorded: true });
      return invitationAnswer({
        id: MADE_UP_INVITATION_ID,
        email: MADE_UP_EMAIL,
        expires_at: "2026-10-15T00:00:00.000Z",
        status: "sent",
        redirected: false,
        retried: true,
      });
    };

    const refused = await withDailyLimit(
      { count: COUNT_SAYS_NO, unknownAnswer: inviteUnknownAnswer },
      retrySend,
    );

    if (calls !== 0) problems.push(`the retry sent ${calls} email(s) at the limit`);
    if (log.length > 0) problems.push(`and this happened: ${log.join("; ")}`);
    if (refused.status !== DAILY_LIMIT_STATUS) {
      problems.push(`the status is ${refused.status}, expected ${DAILY_LIMIT_STATUS}`);
    }

    // And under the limit the retry goes, and says it was a retry.
    const allowed = await withDailyLimit(
      { count: COUNT_SAYS_YES, unknownAnswer: inviteUnknownAnswer },
      retrySend,
    );
    if (calls !== 1) problems.push(`under the limit the retry sent ${calls} email(s), expected 1`);
    const { body } = await readBody(allowed);
    if ((body as { retried?: unknown } | null)?.retried !== true) {
      problems.push("the answer does not say it was a retry, so this is not the retry path");
    }

    if (problems.length > 0) throw new Error(problems.join("; "));
  },
);

// =========================================================================
// 7. CAN THESE CHECKS FAIL? Three broken gates, and each must go RED
// =========================================================================
//
// Issue #221's fourth condition asks for this by name: "a can-this-fail guard that
// feeds the gate a world where the count always says yes and requires the test to go
// red."
//
// Every test above is written to pass. That is worth nothing on its own: a check
// that cannot fail looks exactly the same as a check that passes. So the three
// broken gates below are the three mistakes somebody would actually make, each run
// through the SAME assertions, and this section fails if any of them comes out green.

type Gate = (
  options: { count: UsageCountCall; unknownAnswer: () => Response },
  proceed: () => Promise<Response>,
) => Promise<Response>;

// Mistake 1: the obvious one. Count, ignore the answer, carry on. This is what the
// two functions did before this change, with a count added and nothing reading it.
const GATE_THAT_COUNTS_AND_CARRIES_ON: Gate = async (options, proceed) => {
  await countOneUse(options.count);
  return await proceed();
};

// Mistake 2: the subtle one, and the reason the count is written BEFORE the call.
// Call the service, then count, then refuse. Every assertion about the ANSWER would
// pass; the request has already gone.
const GATE_THAT_COUNTS_AFTERWARDS: Gate = async (options, proceed) => {
  const answer = await proceed();
  const use = await countOneUse(options.count);
  if (!use.allowed) {
    return use.why === "at_limit" ? dailyLimitRefusal() : options.unknownAnswer();
  }
  return answer;
};

// Mistake 3: an error is read as permission. `if (data === false) refuse` and
// nothing about the error, which is how "an unknown is not a zero" gets lost.
const GATE_THAT_TRUSTS_AN_ERROR: Gate = async (options, proceed) => {
  const answered = await options.count();
  if (answered.data === false) return dailyLimitRefusal();
  return await proceed();
};

// The assertions from sections 5 and 6, as one function, so a broken gate is judged
// by exactly what the real gate was judged by.
async function gateProblems(gate: Gate, count: UsageCountCall): Promise<string[]> {
  const problems: string[] = [];

  const ai = aiSpies();
  let aiAnswer: Response;
  try {
    aiAnswer = await gate({ count, unknownAnswer: aiUnknownAnswer }, ai.proceed);
  } catch (cause) {
    // A gate that throws has also failed these assertions, which is a pass for this
    // section.
    return [`the gate threw: ${(cause as Error).message}`];
  }
  if (ai.calls() !== 0) problems.push(`the AI ask ran ${ai.calls()} time(s)`);
  if (ai.log.length > 0) problems.push(`the AI service was reached: ${ai.log.join("; ")}`);
  if (aiAnswer.status === 200) problems.push("the ask was answered with suggestions");

  const email = emailSpies();
  let emailAnswer: Response;
  try {
    emailAnswer = await gate({ count, unknownAnswer: inviteUnknownAnswer }, email.proceed);
  } catch (cause) {
    return [...problems, `the gate threw: ${(cause as Error).message}`];
  }
  if (email.calls() !== 0) problems.push(`the send ran ${email.calls()} time(s)`);
  if (email.log.length > 0) {
    problems.push(`the email service was reached: ${email.log.join("; ")}`);
  }
  if (emailAnswer.status === 201) problems.push("an invitation was answered as sent");

  return problems;
}

Deno.test("the limit checks REFUSE a gate that counts and then carries on regardless", async () => {
  const problems = await gateProblems(GATE_THAT_COUNTS_AND_CARRIES_ON, COUNT_SAYS_NO);
  if (problems.length === 0) {
    throw new Error(
      "a gate that ignores the count passed the same assertions the real gate passes, " +
        "so those assertions prove nothing. Section 5 and 6 are not checking what they " +
        "say they are checking",
    );
  }
});

Deno.test("the limit checks REFUSE a gate that counts AFTER the paid call", async () => {
  const problems = await gateProblems(GATE_THAT_COUNTS_AFTERWARDS, COUNT_SAYS_NO);
  if (problems.length === 0) {
    throw new Error(
      "a gate that calls the service first and counts afterwards passed, so the " +
        "assertions are reading the ANSWER and not the ORDER. The whole protection is " +
        "that the count comes first",
    );
  }
});

Deno.test("the limit checks REFUSE a gate that reads an ERROR as permission", async () => {
  const problems = await gateProblems(GATE_THAT_TRUSTS_AN_ERROR, COUNT_ERRORED);
  if (problems.length === 0) {
    throw new Error(
      "a gate that treats an errored count as permission passed, so nothing here holds " +
        "issue #221's third condition: 'A failed count is not permission to spend money'",
    );
  }
});

// AND THE WORLD WHERE THE COUNT ALWAYS SAYS YES, which is the one issue #221 names.
// Feed the REAL gate a count that never refuses and the at-limit assertions must go
// red -- if they stay green with that count, they were never about the count.
Deno.test(
  "the limit checks REFUSE a world where the count always says yes",
  async () => {
    const problems = await gateProblems(withDailyLimit, COUNT_SAYS_YES);
    if (problems.length === 0) {
      throw new Error(
        "with a count that always says yes, the at-limit assertions still passed. They " +
          "are therefore not reading the count at all",
      );
    }
  },
);

// AND ONE MORE FROM THE OTHER SIDE, because every guard above is satisfied by a gate
// that refuses everybody. This one requires the real gate to LET AN ASK THROUGH when
// the count says yes -- so a change that broke the feature for everybody inside their
// limit cannot pass this file.
Deno.test(
  "and the real gate DOES let an ask through under the limit, so refusing everybody is not a fix",
  async () => {
    const problems = await gateProblems(withDailyLimit, COUNT_SAYS_YES);
    const expected = [
      "the AI ask ran 1 time(s)",
      "the ask was answered with suggestions",
      "the send ran 1 time(s)",
      "an invitation was answered as sent",
    ];
    for (const want of expected) {
      if (!problems.includes(want)) {
        throw new Error(
          `under the limit, "${want}" did not happen. The gate is refusing somebody who ` +
            `is inside their limit, which breaks the feature for everybody. What did ` +
            `happen: ${problems.join("; ") || "(nothing)"}`,
        );
      }
    }
  },
);

// HOW TO RUN IT, from the repository root. Needs Deno.
//
//   deno test --no-lock --allow-env --allow-read=supabase/migrations,supabase/functions --config supabase/functions/create-team/deno.json supabase/functions/_tests/daily_limit_test.ts
//
// CI runs the whole folder in one go instead, which also type-checks it:
//
//   deno test --no-lock --allow-env --allow-read=supabase/migrations,supabase/functions --config supabase/functions/create-team/deno.json supabase/functions/_tests
//
// WHY --no-lock AND WHY --allow-env: the reasons at the bottom of suspension_test.ts,
// unchanged. In short, without --no-lock Deno writes a deno.lock into the function
// folder named by --config, and --allow-env is needed because the import chain
// reaches npm:@supabase/server, whose dependency probes environment variables at
// import time. Nothing here reads, sets, prints or needs a secret.
//
// WHY --allow-read NAMES TWO DIRECTORIES, which is new with this file and is a change
// to .github/workflows/ci.yml that the pull request calls out on its own line. One test
// reads supabase/migrations/20261008115900_usage_counts.sql, so the two feature words
// are compared with the check constraint that enforces them; and one reads the two
// handlers' own source, because "neither function spells a limit" is an ABSENCE and
// there is no value to pass in that would reveal a stray 20 sitting in a file. Both
// paths hold code that is committed to this repository. Neither can reach a key, a
// .env file, supabase/.temp or anything else on the disk -- which is what the narrowing
// is for, and the reason it was widened by a named directory rather than to the parent.
