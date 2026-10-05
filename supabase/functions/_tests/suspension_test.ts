// suspension_test.ts -- can a suspended person get past the three functions,
// and does a failed check fail CLOSED?
//
// Build it 16 step 5, part B, issue #133. Run it with Deno, from the repository
// root, and see the bottom of this file for the exact command.
//
// WHAT IT TESTS, and what makes that worth anything: it imports the THREE REAL
// index.ts files and calls the `checkSuspension` and `suspendedRefusal` each one
// exports. Not a copy of the logic written out again here -- a copy would pass
// happily while the deployed code did something else, which is the one failure a
// test like this must not have. The import is the point.
//
// THE SECOND EXPORT WAS ADDED ON 5 OCTOBER 2026, AND HERE IS WHY. The owner
// deployed the three functions to staging and ran
// scripts/staging/build-it-16-suspend-checks.mjs --expect-suspended with the test
// account Bob suspended: 14 PASS, 1 FAIL. accept-invite answered
// {"error":"You can't do that at the moment.","reason":"account_suspended"} --
// no `code` field at all, because its `fail` takes the reason third and the code
// fourth and the call site, copied from the other two functions, passed three
// arguments. Every test in this file passed that whole time, because every test
// in this file looked at a verdict and no test looked at a body. A verdict of
// `{ allowed: false, why: "suspended" }` is not a refusal; it is a decision that
// a refusal is then built from, and the build was where the mistake was. So the
// refusal each function sends is now exported, and asserted field by field.
//
// WHY IT CAN BE RUN AT ALL WITH NO DATABASE. `checkSuspension` takes the read as
// a function that performs it, so this file hands it a read that fails, a read
// that throws, a read that answers with a row, and a read that answers with
// none. There is no network, no key, no staging project and no account
// involved, and nothing here proves anything about what the real query returns:
// that is what scripts/staging/build-it-16-suspend-checks.mjs is for, run by the
// owner once the functions are deployed.
//
// THE FIVE THINGS IT ASKS:
//
//   1. A ROW MEANS REFUSED. The person is suspended, so the answer is no.
//   2. NO ROW MEANS ALLOWED. Everybody who is not suspended still works -- the
//      case that matters most in practice, because getting it wrong refuses the
//      whole app for everybody.
//   3. A FAILED READ MEANS REFUSED. An error, a thrown error, a null `data`, a
//      `data` that is not a list: four ways of not knowing, and not knowing is
//      not "not suspended". This is the fail-closed case the coach's comment on
//      #133 asks to see.
//   4. THE THREE AGREE. Every case is run through all three functions and the
//      verdicts compared. The three copies of this check are deliberate -- the
//      same decision taken by hashToken, which invite-member and accept-invite
//      each have their own copy of -- and this is what stops one of them
//      drifting quietly.
//   5. THE REFUSAL EACH ONE SENDS IS RIGHT, as a response: the status, the
//      sentence, the code, accept-invite's reason, and nothing else in the body.
//      Added after the staging run described above, which is the only reason
//      anybody knows this needed asking. Checks 1 to 4 are about a decision;
//      this one is about what the caller actually receives, and the two are not
//      the same thing.
//
// AND IT CHECKS THAT IT CAN FAIL. `brokenCheckSuspension` below is the mistake
// this whole file exists to catch, written out on purpose: it treats a failed
// read as "not suspended". The last test runs it through the same cases and
// requires that they refuse it. A check that cannot fail reports a pass and
// means nothing -- the same argument scripts/staging/build-it-16-checks.mjs
// makes for its own `--selftest`.
//
// WHY IT LIVES IN A FOLDER WHOSE NAME STARTS WITH AN UNDERSCORE. "You can store
// any shared code in a folder prefixed with an underscore (_)" --
// https://supabase.com/docs/guides/functions/development-tips -- and two things
// in this repository already act on that convention, each skipping such a folder
// by name: scripts/drift-check.mjs (parseFunctionFolders) and the smoke test in
// .github/workflows/migrate-production.yml.
//
// That is not decoration. drift-check reads `supabase/functions` with readdirSync
// and does NOT ask whether an entry is a folder, so this file sitting directly
// in `supabase/functions/` would be read as a function named
// "suspension_test.ts", found nowhere in production, and reported as drift every
// morning. Measured, not guessed: the first version of this file was there, and
// `parseFunctionFolders` filters only names beginning with `_` or `.`. Under
// `_tests/` both of those skip it, and `supabase functions deploy` -- which
// names no function and deploys the folders it finds -- does not take it for one.
//
// It writes nothing, reads no file and makes no request.

import {
  checkSuspension as createTeamCheck,
  suspendedRefusal as createTeamRefusal,
} from "../create-team/index.ts";
import {
  checkSuspension as inviteMemberCheck,
  suspendedRefusal as inviteMemberRefusal,
} from "../invite-member/index.ts";
import {
  checkSuspension as acceptInviteCheck,
  suspendedRefusal as acceptInviteRefusal,
} from "../accept-invite/index.ts";

// The three, by the names in supabase/config.toml.
const CHECKS = [
  { name: "create-team", check: createTeamCheck },
  { name: "invite-member", check: inviteMemberCheck },
  { name: "accept-invite", check: acceptInviteCheck },
];

// What a verdict is allowed to be. Deliberately spelled out rather than
// imported, because this is the test's own statement of the contract.
type Expected =
  | { allowed: true }
  | { allowed: false; why: "suspended" }
  | { allowed: false; why: "unknown"; code?: string };

// A read, as `AccountStatusRead` wants it: a function returning a promise of
// { data, error }. These are the only inputs in this file.
type Read = () => PromiseLike<{
  data: unknown;
  error: { code?: string } | null;
}>;

const answers = (data: unknown, error: { code?: string } | null = null): Read =>
  () => Promise.resolve({ data, error });

// A made-up uuid belonging to nobody, and a made-up reason about nobody. The
// reason is here for one purpose: to prove it does not come back out. The real
// query never selects that column, and docs/plan.md marks it sensitive.
const MADE_UP_ID = "a1b2c3d4-0001-4e5f-8a9b-0c1d2e3f4a5b";
const MADE_UP_REASON = "Invented for a test. About nobody.";

// Every case, with the verdict each must produce.
const CASES: Array<{ name: string; read: Read; expect: Expected }> = [
  // ---- 1. a row means refused ----
  {
    name: "one row: this person is suspended",
    read: answers([{ user_id: MADE_UP_ID }]),
    expect: { allowed: false, why: "suspended" },
  },
  {
    name: "a row carrying a reason: still refused, and the reason does not come back",
    // The real read selects user_id only. This hands it a row with the
    // sensitive column in it anyway, so that "the verdict carries no reason" is
    // a measured fact rather than a reading of the query.
    read: answers([{ user_id: MADE_UP_ID, reason: MADE_UP_REASON }]),
    expect: { allowed: false, why: "suspended" },
  },
  {
    name: "two rows, which the primary key makes impossible: still refused",
    read: answers([{ user_id: MADE_UP_ID }, { user_id: MADE_UP_ID }]),
    expect: { allowed: false, why: "suspended" },
  },

  // ---- 2. no row means allowed ----
  {
    name: "no rows: this person is not suspended, and everything still works",
    read: answers([]),
    expect: { allowed: true },
  },

  // ---- 3. a failed read means refused: four ways of not knowing ----
  {
    name: "FAIL CLOSED: the read returned an error with a Postgres code",
    // 42501 is insufficient_privilege, which is what a lost `grant select` on
    // account_status would produce -- the exact symptom issue #130 predicts
    // after 30 October 2026.
    read: answers(null, { code: "42501" }),
    expect: { allowed: false, why: "unknown", code: "42501" },
  },
  {
    name: "FAIL CLOSED: the read returned an error with no code at all",
    read: answers(null, {}),
    expect: { allowed: false, why: "unknown" },
  },
  {
    name: "FAIL CLOSED: the read threw",
    read: () => {
      throw new Error("the client itself fell over");
    },
    expect: { allowed: false, why: "unknown" },
  },
  {
    name: "FAIL CLOSED: the read's promise rejected",
    read: () => Promise.reject(new Error("the network went away")),
    expect: { allowed: false, why: "unknown" },
  },
  {
    name: "FAIL CLOSED: no error, but data is null -- an unknown, not an empty list",
    read: answers(null),
    expect: { allowed: false, why: "unknown" },
  },
  {
    name: "FAIL CLOSED: no error, but data is an object rather than a list",
    read: answers({ user_id: MADE_UP_ID }),
    expect: { allowed: false, why: "unknown" },
  },
  {
    name: "FAIL CLOSED: no error, but data is a number",
    read: answers(0),
    expect: { allowed: false, why: "unknown" },
  },
];

// Compare a verdict with what was expected, and say what is wrong rather than
// only that something is.
//
// THE `reason` CHECK IS NOT DECORATION. It is the one assertion here about
// docs/plan.md's rule that the suspension reason is never readable through the
// app: whatever the row contained, the verdict is allowed to carry `allowed`,
// `why` and `code` and nothing else.
function problemsWith(verdict: unknown, expect: Expected): string[] {
  const problems: string[] = [];
  if (verdict === null || typeof verdict !== "object") {
    return [`the verdict is ${typeof verdict}, not an object`];
  }
  const got = verdict as Record<string, unknown>;

  if (got.allowed !== expect.allowed) {
    problems.push(`allowed is ${String(got.allowed)}, expected ${String(expect.allowed)}`);
  }
  if (expect.allowed === false) {
    if (got.why !== expect.why) {
      problems.push(`why is ${String(got.why)}, expected ${expect.why}`);
    }
    const expectedCode = expect.why === "unknown" ? expect.code : undefined;
    if (got.code !== expectedCode) {
      problems.push(`code is ${String(got.code)}, expected ${String(expectedCode)}`);
    }
  }

  const allowedKeys = ["allowed", "why", "code"];
  const extra = Object.keys(got).filter((key) => !allowedKeys.includes(key));
  if (extra.length > 0) {
    problems.push(`the verdict carries fields it should not: ${extra.join(", ")}`);
  }
  const text = JSON.stringify(got);
  if (text.includes(MADE_UP_REASON)) {
    problems.push("the verdict contains the row's reason text, which must never leave the table");
  }
  return problems;
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

for (const { name, check } of CHECKS) {
  for (const testCase of CASES) {
    Deno.test(`${name}: ${testCase.name}`, async () => {
      const verdict = await check(testCase.read);
      const problems = problemsWith(verdict, testCase.expect);
      if (problems.length > 0) {
        throw new Error(
          `${name} answered wrongly for "${testCase.name}": ${problems.join("; ")}`,
        );
      }
    });
  }
}

// The three must not disagree. Run every case through all three and compare the
// verdicts with each other, not only with the expectation above -- so a case
// this file has not thought to add still cannot be answered two different ways.
Deno.test("the three functions give the same verdict for every case", async () => {
  for (const testCase of CASES) {
    const verdicts: string[] = [];
    for (const { check } of CHECKS) {
      verdicts.push(JSON.stringify(await check(testCase.read)));
    }
    const unique = [...new Set(verdicts)];
    if (unique.length !== 1) {
      throw new Error(
        `the three disagree about "${testCase.name}": ` +
          CHECKS.map((c, i) => `${c.name} ${verdicts[i]}`).join(", "),
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Can this test fail?
// ---------------------------------------------------------------------------
//
// The mistake, written out: a check that reads the error and shrugs. Every line
// of it is plausible, which is the point -- `if (error) return allowed` is how
// fail-open gets written, and it passes the "a row means refused" and "no row
// means allowed" cases perfectly well. If the cases above cannot catch this,
// they are not evidence of anything.
async function brokenCheckSuspension(read: Read) {
  let answer;
  try {
    answer = await read();
  } catch {
    // "Nothing came back, so nobody is suspended." This is the bug.
    return { allowed: true };
  }
  if (answer?.error) return { allowed: true };
  const rows = answer?.data;
  if (!Array.isArray(rows)) return { allowed: true };
  if (rows.length > 0) return { allowed: false, why: "suspended" };
  return { allowed: true };
}

Deno.test("the fail-closed cases REFUSE a check that fails open", async () => {
  const caught: string[] = [];
  for (const testCase of CASES) {
    const verdict = await brokenCheckSuspension(testCase.read);
    if (problemsWith(verdict, testCase.expect).length > 0) {
      caught.push(testCase.name);
    }
  }

  // Seven of the eleven cases are the fail-closed ones, and the broken check
  // gets every one of them wrong. The number is asserted rather than described,
  // so that deleting a case shows up here rather than quietly weakening the
  // file. The other four -- a row, a row with a reason, two rows, no rows -- the
  // broken check answers correctly, which is exactly why it is dangerous.
  const failClosedCases = CASES.filter((c) =>
    c.name.startsWith("FAIL CLOSED")
  ).length;
  if (failClosedCases !== 7) {
    throw new Error(
      `expected 7 fail-closed cases, found ${failClosedCases} -- was one removed?`,
    );
  }
  if (caught.length !== failClosedCases) {
    throw new Error(
      `a check that treats a failed read as "not suspended" was caught by only` +
        ` ${caught.length} of the ${failClosedCases} fail-closed cases. Caught:` +
        ` ${caught.join("; ") || "none"}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 5. The refusal each function actually sends
// ---------------------------------------------------------------------------
//
// Everything above this line asks what `checkSuspension` DECIDES. Nothing above
// this line asks what the caller RECEIVES, and that gap is what let the bug
// described at the top of this file reach staging: the decision was right in all
// three functions, and accept-invite built the wrong response out of it.
//
// So these tests call `suspendedRefusal` -- the real exported call site, the one
// the handler itself calls -- and read the Response. Not a body written out here:
// a test that spells out the expected JSON and compares it with its own copy
// proves nothing, which is the same argument the `checkSuspension` import rests
// on.
//
// WHAT THE CONTRACT IS, and it is not identical across the three:
//
//   * all three: HTTP 403, `error` the fixed sentence, `code` "account_suspended";
//   * accept-invite ALSO: `reason` "account_suspended", because
//     web/src/app/invite/[token]/actions.ts accepts a reason only if it is in
//     INVITE_REASONS (web/src/lib/teams.ts) and otherwise falls back to the HTTP
//     status -- where 403 reads as "wrong_person", so a suspended person would be
//     told the invitation was sent to a different address and sent off to sign in
//     with an account they do not have;
//   * create-team and invite-member must NOT carry a `reason`: their `fail` has no
//     such field, their callers read `code`, and inventing one would be a second
//     vocabulary for one event;
//   * and none of them says anything else. No suspended_at, no reason text, no
//     id, no address. docs/plan.md marks the suspension reason sensitive and says
//     nobody reads it through the app.
//
// The same contract scripts/staging/build-it-16-suspend-checks.mjs judges over
// the wire, deliberately: that script is the only thing that can prove what the
// DEPLOYED functions answer, and this file is the only thing that can prove it
// before a deploy. They have to be asking the same question or the pair is
// worthless.

// Spelled out rather than imported, for the same reason the `Expected` type above
// is: this is the test's own statement of the contract. Importing the constants
// would make the test agree with the functions by construction, however the
// functions changed.
const SUSPENDED_CODE = "account_suspended";
const SUSPENDED_MESSAGE = "You can't do that at the moment.";

// A refusal is a short, fixed sentence plus one or two codes. 200 characters is
// generous for that and far too small for a sentence somebody typed.
const MAX_REFUSAL_BODY = 200;
const UUID_SHAPED = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const TIMESTAMP_SHAPED = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const REFUSALS: Array<{
  name: string;
  refusal: () => Response;
  needsReason: boolean;
}> = [
  { name: "create-team", refusal: createTeamRefusal, needsReason: false },
  { name: "invite-member", refusal: inviteMemberRefusal, needsReason: false },
  { name: "accept-invite", refusal: acceptInviteRefusal, needsReason: true },
];

// Say what is wrong with a refusal, rather than only that something is. Returns
// every problem it finds, not the first -- a body with two faults should report
// two.
async function problemsWithRefusal(
  answer: Response,
  needsReason: boolean,
): Promise<string[]> {
  const problems: string[] = [];

  if (answer.status !== 403) {
    problems.push(`the status is ${answer.status}, expected 403`);
  }

  const text = await answer.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    problems.push(`the body is not JSON: ${text}`);
    return problems;
  }
  if (parsed === null || typeof parsed !== "object") {
    problems.push(`the body is ${typeof parsed}, not a JSON object: ${text}`);
    return problems;
  }
  const body = parsed as Record<string, unknown>;

  if (body.error !== SUSPENDED_MESSAGE) {
    problems.push(
      `error is ${JSON.stringify(body.error)}, expected the fixed sentence ` +
        JSON.stringify(SUSPENDED_MESSAGE),
    );
  }

  // THE FIELD THE STAGING RUN FOUND MISSING. Read off the parsed object, so a
  // code appearing in some other field cannot satisfy it.
  if (body.code !== SUSPENDED_CODE) {
    problems.push(
      `code is ${JSON.stringify(body.code)}, expected ${JSON.stringify(SUSPENDED_CODE)}`,
    );
  }

  if (needsReason) {
    if (body.reason !== SUSPENDED_CODE) {
      problems.push(
        `reason is ${JSON.stringify(body.reason)}, expected ` +
          `${JSON.stringify(SUSPENDED_CODE)} -- without it the /invite/[token] page` +
          ` falls back to the status and says the wrong thing`,
      );
    }
  } else if ("reason" in body) {
    problems.push(
      `it carries a reason field, ${JSON.stringify(body.reason)}, and this` +
        ` function's callers read code`,
    );
  }

  const allowed = needsReason ? ["error", "code", "reason"] : ["error", "code"];
  const extra = Object.keys(body).filter((key) => !allowed.includes(key));
  if (extra.length > 0) {
    problems.push(`it carries fields it should not: ${extra.join(", ")}`);
  }

  // The disclosure checks, read off the raw text so a value is caught wherever
  // it hides rather than only in the field it was expected in.
  if (TIMESTAMP_SHAPED.test(text)) {
    problems.push("it contains something shaped like a timestamp, so possibly suspended_at");
  }
  if (UUID_SHAPED.test(text)) {
    problems.push("it contains a uuid, so possibly a user id");
  }
  if (text.includes("@")) {
    problems.push("it contains an @, so possibly an address");
  }
  if (text.includes(MADE_UP_REASON)) {
    problems.push("it contains a suspension reason, which must never leave the table");
  }
  if (text.length > MAX_REFUSAL_BODY) {
    problems.push(
      `it is ${text.length} characters, over the ${MAX_REFUSAL_BODY} expected of a refusal`,
    );
  }

  return problems;
}

for (const { name, refusal, needsReason } of REFUSALS) {
  Deno.test(
    `${name}: the suspended refusal it sends is 403 with the sentence, the code${
      needsReason ? ", the reason" : ""
    } and nothing else`,
    async () => {
      const problems = await problemsWithRefusal(refusal(), needsReason);
      if (problems.length > 0) {
        throw new Error(
          `${name}'s suspended refusal is wrong: ${problems.join("; ")}`,
        );
      }
    },
  );
}

// The two fields all three share must be identical, for the same reason the
// verdicts must: one event, one vocabulary. Compared with each other and not
// only with the expectation above, so a drift this file has not thought to
// describe still cannot pass.
Deno.test("the three refusals carry the same sentence and the same code", async () => {
  const shared: string[] = [];
  for (const { refusal } of REFUSALS) {
    const body = await refusal().json();
    shared.push(JSON.stringify({ error: body.error, code: body.code }));
  }
  const unique = [...new Set(shared)];
  if (unique.length !== 1) {
    throw new Error(
      "the three refusals disagree: " +
        REFUSALS.map((r, i) => `${r.name} ${shared[i]}`).join(", "),
    );
  }
});

// ---------------------------------------------------------------------------
// Can the body checks fail?
// ---------------------------------------------------------------------------
//
// The mistakes, written out. The first one is not invented: it is what
// accept-invite sent on staging on 5 October 2026, reproduced here exactly, and
// it is the case that makes this whole section worth having. If the checks above
// cannot catch it, they are no better than the verdict checks that let it
// through.
const BROKEN_REFUSALS: Array<{
  name: string;
  needsReason: boolean;
  build: () => Response;
}> = [
  {
    // What `fail(SUSPENDED_MESSAGE, 403, SUSPENDED_CODE)` produced in a function
    // whose `fail` is (message, status, reason, code): the reason arrived, `code`
    // was undefined, and Response.json drops an undefined field rather than
    // sending a null. Hence a body that looks complete and is not.
    name: "accept-invite's reason with no code -- the bug the staging run found",
    needsReason: true,
    build: () =>
      Response.json(
        { error: SUSPENDED_MESSAGE, reason: SUSPENDED_CODE, code: undefined },
        { status: 403 },
      ),
  },
  {
    // The mirror image, and the worse of the two for the person reading the
    // screen: the page gets no reason it recognises, falls back to the 403, and
    // tells a suspended person the invitation was sent to another address.
    name: "accept-invite's code with no reason -- the page falls back and says the wrong thing",
    needsReason: true,
    build: () =>
      Response.json(
        { error: SUSPENDED_MESSAGE, code: SUSPENDED_CODE },
        { status: 403 },
      ),
  },
  {
    name: "a refusal that explains itself, carrying suspended_at and the owner's reason",
    needsReason: false,
    build: () =>
      Response.json(
        {
          error: SUSPENDED_MESSAGE,
          code: SUSPENDED_CODE,
          suspended_at: "2026-10-04T11:43:13Z",
          reason_text: MADE_UP_REASON,
        },
        { status: 403 },
      ),
  },
  {
    name: "a refusal that names the account it is about",
    needsReason: false,
    build: () =>
      Response.json(
        { error: SUSPENDED_MESSAGE, code: SUSPENDED_CODE, user_id: MADE_UP_ID },
        { status: 403 },
      ),
  },
  {
    // A 403 is what the page and the staging script key on. A 500 would read as
    // "something broke, try again", which is the fail-closed branch's meaning and
    // not this one's.
    name: "the right body with the wrong status",
    needsReason: false,
    build: () =>
      Response.json(
        { error: SUSPENDED_MESSAGE, code: SUSPENDED_CODE },
        { status: 500 },
      ),
  },
  {
    name: "the right code with another refusal's wording",
    needsReason: false,
    build: () =>
      Response.json(
        {
          error: "This invitation was sent to a different email address.",
          code: SUSPENDED_CODE,
        },
        { status: 403 },
      ),
  },
  {
    name: "a plain-text refusal, not JSON at all",
    needsReason: false,
    build: () => new Response("Forbidden", { status: 403 }),
  },
];

Deno.test("the body checks REFUSE every broken refusal", async () => {
  const missed: string[] = [];
  for (const broken of BROKEN_REFUSALS) {
    const problems = await problemsWithRefusal(broken.build(), broken.needsReason);
    if (problems.length === 0) {
      missed.push(broken.name);
    }
  }

  // The count is asserted rather than described, so deleting a case shows up here
  // rather than quietly weakening the file -- the same argument the fail-closed
  // test above makes about its seven.
  if (BROKEN_REFUSALS.length !== 7) {
    throw new Error(
      `expected 7 broken refusals, found ${BROKEN_REFUSALS.length} -- was one removed?`,
    );
  }
  if (missed.length > 0) {
    throw new Error(
      `the body checks passed ${missed.length} refusal(s) that are wrong:` +
        ` ${missed.join("; ")}`,
    );
  }
});

// HOW TO RUN IT, from the repository root. Needs Deno; the repository's own
// `npm test` does not include this, because CI has no Deno step and
// .github/workflows/ is not the assistant's to change (rule 5). Filed as issue
// #136, with what a CI job would have to do and how to prove it works.
//
//   deno test --no-lock --allow-env --config supabase/functions/create-team/deno.json supabase/functions/_tests/suspension_test.ts
//
// WHY --no-lock. Without it, Deno writes a `deno.lock` into the function folder
// named by --config -- `supabase/functions/create-team/deno.lock` -- and the
// first run of this test did exactly that, in all three folders. Nobody asked
// for those files: both dependencies are already pinned to an exact version in
// each deno.json (rule 17), so the lockfile adds integrity hashes and nothing
// else, and a file in a function's own folder is a file that may end up in what
// gets deployed. That is a change to what production runs, arriving as a side
// effect of running a test, and this project does not make changes that way.
//
// LOCKFILES FOR THE FUNCTIONS ARE WANTED -- issue #35, "create-team has no
// deno.lock, so its transitive dependencies are unpinned", which is open and
// right. This flag is not an argument against it. The difference is that #35
// means adding lockfiles deliberately, reading what they pin, and deploying with
// them; a file that appears because somebody ran a test is none of those things.
// When #35 is done this flag comes out, and this comment with it.
//
// WHY --allow-env, on a test that reads no setting of its own. Importing the
// three functions pulls in npm:@supabase/server, whose dependency `std-env`
// probes environment variables at import time to work out whether it is running
// in CI. Without the flag the run dies before any test with
// `NotCapable: Requires env access to "NODE_ENV"`, then "AI_AGENT", and so on --
// so the narrow `--allow-env=NODE_ENV` is whack-a-mole rather than a tighter
// setting. Nothing here reads, prints or needs a secret, and this file sets no
// variable; no other permission is granted, so the run cannot reach the network,
// the disk or a subprocess.
//
// WHY THAT --config, when the test imports all three functions: the three
// deno.json files are character-for-character identical, confirmed in this
// session with Get-FileHash (all three SHA-256
// 86510527ECB93E7134801F16BF137B9C0E6B242A8A2BA6E4BA89390F44EBE4B7), so any one
// of them resolves the imports for all three. The repository root has no
// deno.json, and without --config the bare specifiers do not resolve at all.
//
// `deno test` type-checks what it runs, so this command also type-checks the
// three functions. The output of the run that accompanied this file is in
// evidence/build-it-16-suspend-functions.md, with its exit code.
