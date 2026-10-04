// suspension_test.ts -- can a suspended person get past the three functions,
// and does a failed check fail CLOSED?
//
// Build it 16 step 5, part B, issue #133. Run it with Deno, from the repository
// root, and see the bottom of this file for the exact command.
//
// WHAT IT TESTS, and what makes that worth anything: it imports the THREE REAL
// index.ts files and calls the `checkSuspension` each one exports. Not a copy of
// the logic written out again here -- a copy would pass happily while the
// deployed code did something else, which is the one failure a test like this
// must not have. The import is the point.
//
// WHY IT CAN BE RUN AT ALL WITH NO DATABASE. `checkSuspension` takes the read as
// a function that performs it, so this file hands it a read that fails, a read
// that throws, a read that answers with a row, and a read that answers with
// none. There is no network, no key, no staging project and no account
// involved, and nothing here proves anything about what the real query returns:
// that is what scripts/staging/build-it-16-suspend-checks.mjs is for, run by the
// owner once the functions are deployed.
//
// THE FOUR THINGS IT ASKS:
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

import { checkSuspension as createTeamCheck } from "../create-team/index.ts";
import { checkSuspension as inviteMemberCheck } from "../invite-member/index.ts";
import { checkSuspension as acceptInviteCheck } from "../accept-invite/index.ts";

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

// HOW TO RUN IT, from the repository root. Needs Deno; the repository's own
// `npm test` does not include this, because CI has no Deno step and
// .github/workflows/ is not the assistant's to change (rule 5). Issue filed --
// see the pull request for #133.
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
// effect of running a test, and this project does not make changes that way. If
// lockfiles are ever wanted they are their own decision, with their own reason
// and their own deploy. Until then, this flag keeps the run from leaving
// anything behind.
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
