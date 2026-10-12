#!/usr/bin/env node
// build-it-25-limits-checks.mjs -- the 500-task cap and the control-character
// constraints, against STAGING, run BEFORE and AFTER the owner applies
// supabase/migrations/20261012094500_task_cap_and_input_limits.sql.
//
// Build it 25 part 2a. STAGING ONLY.
//
// ---------------------------------------------------------------------------
// BEFORE MUST FAIL, AFTER MUST PASS, AND THERE IS NO FLAG
// ---------------------------------------------------------------------------
//
// Every judgement below is written for the world AFTER the migration. Run it
// first against staging as it is: the cap checks and the constraint checks FAIL,
// and those failures are the evidence that nothing was enforcing them yet. Then
// apply the migration and run it again: they pass. The pair is what makes the
// second run mean something -- a refusal nobody saw being an acceptance first is
// a refusal that might always have been there.
//
// That is the shape scripts/staging/build-it-23-attachment-checks.mjs used for
// the attachments bucket (35 PASS / 12 FAIL before, 49 PASS / 2 FAIL after),
// rather than build-it-25-captcha-checks.mjs's --after flag, because here the
// "before" answer for every check is simply the opposite one.
//
// ---------------------------------------------------------------------------
// WHAT IT CREATES, AND WHY THAT IS THE RISKIEST THING ABOUT IT
// ---------------------------------------------------------------------------
//
// IT FILLS ALICE'S TASK LIST TO 500. That is the only way to try a cap of 500,
// and it is a lot of rows to leave behind, so three things guard it:
//
//   1. EVERY TASK IT MAKES IS TITLED FROM ONE FIXED PREFIX -- see MARK below --
//      so a leftover is recognisable at a glance in the dashboard and can never
//      be mistaken for somebody's real task. The cleanup matches on that prefix
//      and on nothing else.
//   2. IT FILLS ALICE UP TO 500 FROM WHEREVER SHE STARTS, rather than adding 500
//      to whatever she has. It reads her count first and creates the difference.
//      She has a handful of real tasks on staging; this script must not bury
//      them under five hundred of its own.
//   3. IT TIDIES UP EVEN WHEN A CHECK FAILS, and prints the number removed and
//      the number she is left holding. And if it dies in a way that skips that --
//      Ctrl-C, a crash, a dropped connection -- there is a mode that does
//      nothing else:
//
//        node scripts/staging/build-it-25-limits-checks.mjs --cleanup
//
// WHY LEAVING HER AT 500 WOULD BREAK CI, which is the real hazard and is worth
// being exact about. `web/tests/access-rules.test.mjs` runs against staging on
// every pull request, and it does not count Alice's tasks -- but it CREATES
// tasks as Alice (`:258-266`, `:363`, `:682`). With Alice at the cap those
// inserts would be refused, and three tests would fail for a reason that has
// nothing to do with the rules they check. So the cleanup is not tidiness; it is
// what keeps this script from turning somebody else's pull request red.
//
// NOTHING ELSE IS TOUCHED. No file is uploaded, no email is sent, no account is
// created, no team is made or changed, and no row belonging to Bob or Carol is
// written except the one task Bob makes to show the cap is per person -- which is
// marked and removed with the rest.
//
// WHAT IT NEVER PRINTS: a password, an access token, a user id, the publishable
// key, or the project URL. Statuses, error codes, constraint names and counts are
// printed, because those are what the judgements are about.
//
// ---------------------------------------------------------------------------
// HOW TO RUN IT
// ---------------------------------------------------------------------------
//
//   node scripts/staging/build-it-25-limits-checks.mjs --selftest
//       The logic only. No setting is read, no request is made, no account is
//       used. CI runs this on every pull request.
//
//   node scripts/staging/build-it-25-limits-checks.mjs
//       Against staging. Needs web/.env.local for the URL and the publishable
//       key, and ALICE_EMAIL / ALICE_PASSWORD / BOB_EMAIL / BOB_PASSWORD /
//       CAROL_EMAIL / CAROL_PASSWORD in the environment.
//
//   node scripts/staging/build-it-25-limits-checks.mjs --cleanup
//       Removes every row whose title starts with this script's prefix and
//       reports the count. Makes no judgement and runs no check.
//
// NO PACKAGES. Node built-ins and global fetch only (AGENTS.md rule 17).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The one place this repository spells Cloudflare's dummy token -- the owner's
// decision J of 11 October 2026. Staging has CAPTCHA switched on, so every
// sign-in in this repository has to carry it.
import { captchaBody } from "../lib/captcha.mjs";

const PASS = "PASS";
const FAIL = "FAIL";
const UNVERIFIED = "UNVERIFIED";

const STAGING_REF = "ghskxrhqlhvrhpnivqbd";
const STAGING_HOST = `${STAGING_REF}.supabase.co`;

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(HERE, "..", "..", "web", ".env.local");

// Everything this run makes is named from this. The cleanup matches on it and on
// nothing else, so no row this script did not create can be removed by it.
const MARK = "bi25-cap-check";

// The cap itself. The same number as the migration's c_tasks_per_person, and it
// is written here rather than imported because a staging script cannot read a
// plpgsql constant -- so this is a SECOND copy, and the check below that compares
// the two behaviours is what would notice if they ever disagreed.
const TASK_CAP = 500;

const TITLE_MAX = 200;
const EMAIL_MAX = 320;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PostgreSQL's own codes, which PostgREST passes through in the body.
const RLS_VIOLATION = "42501";
const CHECK_VIOLATION = "23514";

function die(message) {
  console.error(`\nREFUSING TO RUN: ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Reading an answer -- the ONE place a body is turned into something a
// judgement can look at
// ---------------------------------------------------------------------------
//
// IT IS A SEPARATE PURE FUNCTION SO THE SELFTEST CAN DRIVE THE REAL READING
// PATH, which is the lesson scripts/staging/build-it-23-attachment-checks.mjs
// records the hard way: its first selftest handed every judgement an object it
// had built itself, so an order-of-operations bug in the reading step was
// invisible to every case. A fixture that skips the parser is a fixture that
// agrees with its author.
export function readRestAnswer({ status, raw, error }) {
  if (error) return { error };

  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }

  return { status, json };
}

/**
 * The PostgreSQL error code off a PostgREST refusal, or null.
 *
 * PostgREST puts it in `code`. A successful answer is an array and carries no
 * code, which is why the array case is checked first: `[].code` is undefined
 * rather than an error, and reading a code off a success would be reading
 * nothing and calling it something.
 */
export function codeOf(answer) {
  const bag = answer.json;
  if (bag === null || typeof bag !== "object" || Array.isArray(bag)) return null;
  if (typeof bag.code === "string") return bag.code;
  return null;
}

/** The constraint a check violation names, read out of the message, or null. */
export function constraintOf(answer) {
  const bag = answer.json;
  if (bag === null || typeof bag !== "object" || Array.isArray(bag)) return null;
  const message = typeof bag.message === "string" ? bag.message : "";
  const found = message.match(/violates check constraint "([a-z0-9_]+)"/i);
  return found ? found[1] : null;
}

/** How many rows a successful PostgREST answer carries. */
export function rowsIn(answer) {
  return Array.isArray(answer.json) ? answer.json.length : 0;
}

// ---------------------------------------------------------------------------
// The judgements -- pure functions, which is what --selftest exercises
// ---------------------------------------------------------------------------
//
// Every one takes what came back and returns a list of
// { what, verdict, detail }. None sends a request, reads a file or looks at the
// environment.

// Is this URL the staging project, and nothing else? The same four requirements
// scripts/staging/build-it-23-attachment-checks.mjs asks.
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

// Is it safe to start? Alice must not already be at or over the cap: if she is,
// either a previous run of this script did not tidy up, or somebody has 500 real
// tasks -- and in both cases filling her list further is the wrong move.
export function judgeStartingCount(count, cap) {
  const what = `Alice starts below the cap, so this run has room to fill her list`;
  if (count === null) {
    return [{ what, verdict: UNVERIFIED, detail: "her task count could not be read" }];
  }
  if (count >= cap) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `she already holds ${count}, which is at or over ${cap}. Run --cleanup first; if that` +
          ` removes nothing, these are real tasks and this script must not be run.`,
      },
    ];
  }
  return [{ what, verdict: PASS, detail: `she holds ${count}, so ${cap - count} to create` }];
}

// THE CAP'S OWN CHECK. The insert that takes her from cap-1 to cap must succeed,
// and the one after it must be refused with 42501.
export function judgeAtTheCap(lastAllowed, oneTooMany, cap) {
  const results = [];

  const whatAllowed = `the ${cap}th task is allowed`;
  if (lastAllowed.error) {
    results.push({ what: whatAllowed, verdict: UNVERIFIED, detail: lastAllowed.error });
  } else if (lastAllowed.status >= 400) {
    results.push({
      what: whatAllowed,
      verdict: FAIL,
      detail:
        `HTTP ${lastAllowed.status} code=${JSON.stringify(codeOf(lastAllowed))} -- the cap refused one` +
        ` too early, which would be a cap of ${cap - 1}`,
    });
  } else {
    results.push({
      what: whatAllowed,
      verdict: PASS,
      detail: `HTTP ${lastAllowed.status}, ${rowsIn(lastAllowed)} row back`,
    });
  }

  const whatRefused = `AND THE ${cap + 1}th IS REFUSED`;
  if (oneTooMany.error) {
    results.push({ what: whatRefused, verdict: UNVERIFIED, detail: oneTooMany.error });
    return results;
  }
  if (oneTooMany.status < 400) {
    results.push({
      what: whatRefused,
      verdict: FAIL,
      detail:
        `HTTP ${oneTooMany.status}, ACCEPTED. Before the migration this is the right answer and is` +
        ` the evidence the cap is not there yet. After it, it is the finding.`,
    });
    return results;
  }

  const code = codeOf(oneTooMany);
  results.push({
    what: whatRefused,
    verdict: PASS,
    detail: `HTTP ${oneTooMany.status} code=${JSON.stringify(code)}`,
  });
  results.push({
    // A SECOND JUDGEMENT, on purpose: the screen PR has to tell this refusal from
    // every other way the insert policy can say no, and the code is the only
    // thing it has to go on besides the RPC below.
    what: "and the refusal is a row-level security refusal, which is what the screen will see",
    verdict: code === RLS_VIOLATION ? PASS : UNVERIFIED,
    detail:
      code === RLS_VIOLATION
        ? `${RLS_VIOLATION}, as the migration's section 4 expects`
        : `it is ${JSON.stringify(code)} and not ${RLS_VIOLATION}. Write it down: section 4 of the` +
          ` migration is written against ${RLS_VIOLATION} and would need changing.`,
  });
  return results;
}

// THE SCREEN'S MECHANISM, which is the owner's decision of 2026-10-12: the action
// must ASK rather than infer the cap from a bare 42501. So tasks_may_add() has to
// be callable by a signed-in person and has to answer false for somebody at the
// cap.
export function judgeMayAddRpc(atCap, withRoom) {
  const results = [];

  const whatAtCap = "tasks_may_add() answers FALSE for somebody at the cap";
  if (atCap.error) {
    results.push({ what: whatAtCap, verdict: UNVERIFIED, detail: atCap.error });
  } else if (atCap.status === 404) {
    results.push({
      what: whatAtCap,
      verdict: FAIL,
      detail:
        `HTTP 404 -- the function does not exist on this project. Before the migration that is the` +
        ` right answer; after it, the screen PR has nothing to ask.`,
    });
  } else if (atCap.status >= 400) {
    results.push({
      what: whatAtCap,
      verdict: FAIL,
      detail:
        `HTTP ${atCap.status} code=${JSON.stringify(codeOf(atCap))} -- a signed-in caller must be able` +
        ` to call it, or the screen cannot ask`,
    });
  } else {
    results.push({
      what: whatAtCap,
      verdict: atCap.json === false ? PASS : FAIL,
      detail:
        atCap.json === false
          ? "false, so the screen draws the cap's own sentence"
          : `it answered ${JSON.stringify(atCap.json)}, so the screen would draw the ordinary sentence` +
            ` to somebody who is actually at the cap`,
    });
  }

  const whatRoom = "and TRUE for somebody with room, so the two sentences cannot be swapped";
  if (withRoom.error) {
    results.push({ what: whatRoom, verdict: UNVERIFIED, detail: withRoom.error });
    return results;
  }
  if (withRoom.status >= 400) {
    results.push({
      what: whatRoom,
      verdict: FAIL,
      detail: `HTTP ${withRoom.status} code=${JSON.stringify(codeOf(withRoom))}`,
    });
    return results;
  }
  results.push({
    what: whatRoom,
    verdict: withRoom.json === true ? PASS : FAIL,
    detail:
      withRoom.json === true
        ? "true"
        : `it answered ${JSON.stringify(withRoom.json)} for somebody who is not at the cap`,
  });
  return results;
}

// A MULTI-ROW INSERT MUST NOT GET PAST THE CAP. The local sandbox proved the
// whole statement is refused and nothing partial lands; this is the same question
// asked of the real Data API, which is a different thing from a psql session.
export function judgeMultiRow(answer, before, after, batch, cap) {
  const what = `one POST of ${batch} rows from ${cap - 1} is refused, and nothing partial lands`;

  if (answer.error) {
    return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  }
  if (before === null || after === null) {
    return [{ what, verdict: UNVERIFIED, detail: "the counts either side could not be read" }];
  }

  if (answer.status < 400) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `HTTP ${answer.status}, ACCEPTED -- ${rowsIn(answer)} row(s) back and she now holds ${after}.` +
          ` Before the migration that is right. After it, a batch walks past the cap and the number` +
          ` means nothing.`,
      },
    ];
  }

  return [
    {
      what,
      verdict: PASS,
      detail: `HTTP ${answer.status} code=${JSON.stringify(codeOf(answer))}`,
    },
    {
      what: "and she holds exactly what she held before it",
      verdict: before === after ? PASS : FAIL,
      detail:
        before === after
          ? `${after}, unchanged`
          : `she held ${before} and now holds ${after}, so part of the batch landed`,
    },
  ];
}

// The cap is PER PERSON. docs/plan.md: "Not per team. A team task belongs to the
// person who created it, so it counts against theirs."
export function judgePerPerson(answer) {
  const what = "somebody else can still add a task while Alice is at the cap";
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (answer.status >= 400) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `HTTP ${answer.status} code=${JSON.stringify(codeOf(answer))} -- the cap is counting the` +
          ` wrong thing if one person filling their list stops another`,
      },
    ];
  }
  return [{ what, verdict: PASS, detail: `HTTP ${answer.status}, ${rowsIn(answer)} row back` }];
}

// AT THE CAP, THE REST OF THE APP STILL WORKS. The cap is on INSERT and on
// nothing else, so ticking, renaming and deleting must be untouched -- and
// deleting must make room, which is the half the screen's sentence promises.
export function judgeStillUsable(ticked, renamed, deleted, insertAfterDelete) {
  const results = [];

  for (const [what, answer] of [
    ["at the cap, a task can still be ticked", ticked],
    ["at the cap, a task can still be renamed", renamed],
    ["at the cap, a task can still be deleted", deleted],
  ]) {
    if (answer.error) {
      results.push({ what, verdict: UNVERIFIED, detail: answer.error });
      continue;
    }
    results.push({
      what,
      verdict: answer.status < 400 && rowsIn(answer) === 1 ? PASS : FAIL,
      detail:
        answer.status < 400
          ? `HTTP ${answer.status}, ${rowsIn(answer)} row(s) changed`
          : `HTTP ${answer.status} code=${JSON.stringify(codeOf(answer))}`,
    });
  }

  const what = "AND DELETING ONE MAKES ROOM, which is what the cap's sentence promises";
  if (insertAfterDelete.error) {
    results.push({ what, verdict: UNVERIFIED, detail: insertAfterDelete.error });
    return results;
  }
  results.push({
    what,
    verdict: insertAfterDelete.status < 400 ? PASS : FAIL,
    detail:
      insertAfterDelete.status < 400
        ? `HTTP ${insertAfterDelete.status}, so a person told "delete one" can act on it`
        : `HTTP ${insertAfterDelete.status} code=${JSON.stringify(codeOf(insertAfterDelete))} -- the` +
          ` sentence would be advice that does not work`,
  });
  return results;
}

// A control character in a title or a nickname. `expectRefused` is false for the
// samples the constraint deliberately lets through, which is what keeps this from
// being a check that only knows how to say no.
export function judgeControlChar(label, answer, expectRefused, constraintName) {
  const what = expectRefused
    ? `${label} is REFUSED`
    : `${label} is still allowed, which the constraint says it is`;

  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];

  const refused = answer.status >= 400;

  if (!expectRefused) {
    return [
      {
        what,
        verdict: refused ? FAIL : PASS,
        detail: refused
          ? `HTTP ${answer.status} code=${JSON.stringify(codeOf(answer))} constraint=` +
            `${JSON.stringify(constraintOf(answer))} -- it refused something it was not meant to`
          : `HTTP ${answer.status}`,
      },
    ];
  }

  if (!refused) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `HTTP ${answer.status}, ACCEPTED. Before the migration this is the right answer; after it,` +
          ` a screen can be handed text it cannot draw.`,
      },
    ];
  }

  const code = codeOf(answer);
  const constraint = constraintOf(answer);
  return [
    {
      what,
      verdict: code === CHECK_VIOLATION ? PASS : UNVERIFIED,
      detail:
        `HTTP ${answer.status} code=${JSON.stringify(code)} constraint=${JSON.stringify(constraint)}` +
        (code === CHECK_VIOLATION ? "" : ` -- expected ${CHECK_VIOLATION}`),
    },
    {
      what: `and the constraint it names is ${constraintName}`,
      verdict: constraint === constraintName ? PASS : UNVERIFIED,
      detail:
        constraint === constraintName
          ? constraintName
          : `it named ${JSON.stringify(constraint)}, so something else refused it`,
    },
  ];
}

// The existing title bounds must still bite. A migration that added a constraint
// and broke one would be worse than one that added nothing.
export function judgeExistingBounds(atMax, overMax) {
  const results = [];

  const whatAt = `a title of exactly ${TITLE_MAX} characters is still allowed`;
  if (atMax.error) {
    results.push({ what: whatAt, verdict: UNVERIFIED, detail: atMax.error });
  } else {
    results.push({
      what: whatAt,
      verdict: atMax.status < 400 ? PASS : FAIL,
      detail:
        atMax.status < 400
          ? `HTTP ${atMax.status}`
          : `HTTP ${atMax.status} code=${JSON.stringify(codeOf(atMax))} constraint=` +
            `${JSON.stringify(constraintOf(atMax))}`,
    });
  }

  const whatOver = `and one of ${TITLE_MAX + 1} is still refused`;
  if (overMax.error) {
    results.push({ what: whatOver, verdict: UNVERIFIED, detail: overMax.error });
    return results;
  }
  results.push({
    what: whatOver,
    verdict: overMax.status >= 400 ? PASS : FAIL,
    detail:
      overMax.status >= 400
        ? `HTTP ${overMax.status} constraint=${JSON.stringify(constraintOf(overMax))}`
        : `HTTP ${overMax.status}, accepted -- tasks_title_length has stopped working`,
  });
  return results;
}

// THE TWO CONSTRAINTS THIS SCRIPT CANNOT EXERCISE, and they are reported rather
// than skipped. Neither public.invitations nor public.account_status has an
// insert or update policy for any client role, so there is no request a signed-in
// person can make that would reach either column -- and invite-member refuses
// over EMAIL_MAX before the database sees it. The constraints are backstops
// behind code and behind the dashboard, and the only places they can be exercised
// are a local sandbox and the dashboard itself.
export function judgeUnreachable() {
  return [
    {
      what: "invitations_email_length cannot be reached from a client, and is not claimed to be",
      verdict: UNVERIFIED,
      detail:
        `public.invitations has no insert policy for anon or authenticated, and invite-member refuses` +
        ` over ${EMAIL_MAX} before any query. Proved on a local PostgreSQL sandbox instead --` +
        ` evidence/build-it-25-task-cap.md section 4.`,
    },
    {
      what: "account_status_reason_length cannot be reached from a client either",
      verdict: UNVERIFIED,
      detail:
        `public.account_status has no policy and no table privilege for any client role; the owner` +
        ` types that column in the dashboard, which is the write path it exists for. Same sandbox,` +
        ` same section.`,
    },
  ];
}

// WHAT THIS RUN TOUCHED, counted rather than claimed.
export function judgeCleanup(removed, finalCount, startingCount) {
  const results = [
    {
      what: "every row this run created was removed",
      verdict: removed === null ? UNVERIFIED : PASS,
      detail:
        removed === null
          ? "the cleanup could not be read, so run --cleanup"
          : `${removed} row(s) whose title starts with "${MARK}"`,
    },
  ];

  const what = "AND ALICE IS BACK WHERE SHE STARTED, so CI's own tests can still create tasks as her";
  if (finalCount === null || startingCount === null) {
    results.push({ what, verdict: UNVERIFIED, detail: "a count could not be read; run --cleanup" });
    return results;
  }
  results.push({
    what,
    verdict: finalCount === startingCount ? PASS : FAIL,
    detail:
      finalCount === startingCount
        ? `${finalCount}, the same as before this run`
        : `she started with ${startingCount} and holds ${finalCount}. RUN --cleanup. web/tests/` +
          `access-rules.test.mjs creates tasks as Alice on every pull request and would be refused` +
          ` at ${TASK_CAP}.`,
  });
  return results;
}

const ALLOWED_PATH_SHAPES = [
  /^\/auth\/v1\/token\?grant_type=password$/,
  /^\/auth\/v1\/logout\?scope=local$/,
  /^\/rest\/v1\/tasks/,
  /^\/rest\/v1\/profiles/,
  /^\/rest\/v1\/rpc\/tasks_may_add$/,
];

export function judgeTouchedNothingElse(log) {
  const what = "this run touched only tasks, profiles, one rpc, and sign in and out";
  const strays = log
    .filter((entry) => !ALLOWED_PATH_SHAPES.some((shape) => shape.test(entry.path)))
    .map((entry) => `${entry.method} ${entry.path}`);

  if (strays.length > 0) {
    return [
      {
        what,
        verdict: FAIL,
        detail: `it also made: ${[...new Set(strays)].join(", ")}`,
      },
    ];
  }

  const global = log.filter((entry) => entry.path.includes("scope=global"));
  if (global.length > 0) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          "it signed out with scope=global, which ends EVERY session belonging to that account --" +
          " including the owner's own browser.",
      },
    ];
  }

  return [{ what, verdict: PASS, detail: `${log.length} request(s)` }];
}

// ---------------------------------------------------------------------------
// --selftest -- the judgements above, fed answers from both worlds
// ---------------------------------------------------------------------------

function runSelftest() {
  console.log("build-it-25-limits-checks --selftest: can these checks fail?");
  console.log("");

  let cases = 0;
  let wrong = 0;

  function expect(what, results, wantedVerdicts) {
    cases += 1;
    const got = results.map((r) => r.verdict);
    const same =
      got.length === wantedVerdicts.length && got.every((v, i) => v === wantedVerdicts[i]);
    if (same) {
      console.log(`  ok  ${what}`);
    } else {
      wrong += 1;
      console.log(`  WRONG  ${what}`);
      console.log(`         wanted ${wantedVerdicts.join(", ")}`);
      console.log(`         got    ${got.join(", ")}`);
    }
  }

  // Answers are built from RAW STRINGS through readRestAnswer, never as objects,
  // so every case drives the real parser.
  const ok = (status, raw) => readRestAnswer({ status, raw });
  const refusedRls = ok(
    403,
    JSON.stringify({ code: "42501", message: 'new row violates row-level security policy for table "tasks"' }),
  );
  const refusedCheckTitle = ok(
    400,
    JSON.stringify({
      code: "23514",
      message: 'new row for relation "tasks" violates check constraint "tasks_title_no_control_chars"',
    }),
  );
  const refusedCheckName = ok(
    400,
    JSON.stringify({
      code: "23514",
      message:
        'new row for relation "profiles" violates check constraint "profiles_display_name_no_control_chars"',
    }),
  );
  const oneRow = ok(201, JSON.stringify([{ id: "x" }]));
  const noRows = ok(200, JSON.stringify([]));
  const unreachable = { error: "could not reach the database" };

  // --- the URL guard
  expect("the staging host is accepted", judgeStagingUrl(`https://${STAGING_HOST}`), [PASS]);
  expect("another project is refused", judgeStagingUrl("https://somewhere-else.supabase.co"), [FAIL]);
  expect("http is refused", judgeStagingUrl(`http://${STAGING_HOST}`), [FAIL]);
  expect("a URL with a password in it is refused", judgeStagingUrl(`https://u:p@${STAGING_HOST}`), [FAIL]);
  expect("a port is refused", judgeStagingUrl(`https://${STAGING_HOST}:8443`), [FAIL]);
  expect("rubbish is refused", judgeStagingUrl("not a url"), [FAIL]);

  // --- the starting count
  expect("a starting count below the cap is fine", judgeStartingCount(5, TASK_CAP), [PASS]);
  expect("exactly at the cap REFUSES TO RUN", judgeStartingCount(TASK_CAP, TASK_CAP), [FAIL]);
  expect("over the cap refuses too", judgeStartingCount(TASK_CAP + 1, TASK_CAP), [FAIL]);
  expect("an unreadable count is unverified", judgeStartingCount(null, TASK_CAP), [UNVERIFIED]);

  // --- the cap
  expect(
    "AFTER: the 500th allowed and the 501st refused with 42501",
    judgeAtTheCap(oneRow, refusedRls, TASK_CAP),
    [PASS, PASS, PASS],
  );
  expect(
    "THE WORLD WHERE THE CAP IS NOT THERE: the 501st is accepted",
    judgeAtTheCap(oneRow, oneRow, TASK_CAP),
    [PASS, FAIL],
  );
  expect(
    "a cap that bites one too early",
    judgeAtTheCap(refusedRls, refusedRls, TASK_CAP),
    [FAIL, PASS, PASS],
  );
  expect(
    "a refusal with some other code is UNVERIFIED, not a pass",
    judgeAtTheCap(oneRow, ok(400, JSON.stringify({ code: "23514", message: "something else" })), TASK_CAP),
    [PASS, PASS, UNVERIFIED],
  );
  expect(
    "a request that never arrived is unverified",
    judgeAtTheCap(oneRow, unreachable, TASK_CAP),
    [PASS, UNVERIFIED],
  );

  // --- the screen's mechanism
  expect(
    "AFTER: false at the cap, true with room",
    judgeMayAddRpc(ok(200, "false"), ok(200, "true")),
    [PASS, PASS],
  );
  expect(
    "BEFORE: the function does not exist",
    judgeMayAddRpc(ok(404, JSON.stringify({ code: "PGRST202" })), ok(404, JSON.stringify({ code: "PGRST202" }))),
    [FAIL, FAIL],
  );
  expect(
    "THE WORLD WHERE THE SCREEN WOULD LIE: true for somebody at the cap",
    judgeMayAddRpc(ok(200, "true"), ok(200, "true")),
    [FAIL, PASS],
  );
  expect(
    "a signed-in caller refused the rpc: the screen cannot ask",
    judgeMayAddRpc(ok(403, JSON.stringify({ code: "42501" })), ok(200, "true")),
    [FAIL, PASS],
  );

  // --- a multi-row insert
  expect(
    "AFTER: the batch is refused and nothing partial lands",
    judgeMultiRow(refusedRls, 499, 499, 5, TASK_CAP),
    [PASS, PASS],
  );
  expect(
    "THE WORLD WHERE A BATCH WALKS PAST THE CAP",
    judgeMultiRow(ok(201, JSON.stringify([{}, {}, {}, {}, {}])), 499, 504, 5, TASK_CAP),
    [FAIL],
  );
  expect(
    "refused, but part of it landed anyway",
    judgeMultiRow(refusedRls, 499, 502, 5, TASK_CAP),
    [PASS, FAIL],
  );

  // --- per person
  expect("Bob can still add", judgePerPerson(oneRow), [PASS]);
  expect("THE WORLD WHERE ONE PERSON BLOCKS ANOTHER", judgePerPerson(refusedRls), [FAIL]);

  // --- still usable at the cap
  expect(
    "AFTER: tick, rename, delete, and room again",
    judgeStillUsable(oneRow, oneRow, oneRow, oneRow),
    [PASS, PASS, PASS, PASS],
  );
  expect(
    "THE WORLD WHERE THE CAP BROKE TICKING",
    judgeStillUsable(refusedRls, oneRow, oneRow, oneRow),
    [FAIL, PASS, PASS, PASS],
  );
  expect(
    "THE WORLD WHERE DELETING DOES NOT MAKE ROOM, so the sentence is a lie",
    judgeStillUsable(oneRow, oneRow, oneRow, refusedRls),
    [PASS, PASS, PASS, FAIL],
  );
  expect(
    "a change that matched no row is not a pass",
    judgeStillUsable(noRows, oneRow, oneRow, oneRow),
    [FAIL, PASS, PASS, PASS],
  );

  // --- control characters
  expect(
    "AFTER: a newline in a title is refused, naming its constraint",
    judgeControlChar("a line feed in a title", refusedCheckTitle, true, "tasks_title_no_control_chars"),
    [PASS, PASS],
  );
  expect(
    "THE WORLD WHERE A NEWLINE STILL GETS IN",
    judgeControlChar("a line feed in a title", oneRow, true, "tasks_title_no_control_chars"),
    [FAIL],
  );
  expect(
    "a refusal naming the WRONG constraint is unverified",
    judgeControlChar("a line feed in a title", refusedCheckName, true, "tasks_title_no_control_chars"),
    [PASS, UNVERIFIED],
  );
  expect(
    "a nickname with a tab is refused, naming its own constraint",
    judgeControlChar("a tab in a nickname", refusedCheckName, true, "profiles_display_name_no_control_chars"),
    [PASS, PASS],
  );
  expect(
    "a zero-width space is ALLOWED, and that is a pass",
    judgeControlChar("a zero-width space in a title", oneRow, false, "tasks_title_no_control_chars"),
    [PASS],
  );
  expect(
    "THE WORLD WHERE IT REFUSED SOMETHING IT SHOULD NOT",
    judgeControlChar("a zero-width space in a title", refusedCheckTitle, false, "tasks_title_no_control_chars"),
    [FAIL],
  );

  // --- the existing bounds
  expect("AFTER: 200 allowed, 201 refused", judgeExistingBounds(oneRow, refusedCheckTitle), [PASS, PASS]);
  expect(
    "THE WORLD WHERE THIS MIGRATION BROKE tasks_title_length",
    judgeExistingBounds(oneRow, oneRow),
    [PASS, FAIL],
  );
  expect(
    "THE WORLD WHERE IT BROKE A TITLE THAT USED TO FIT",
    judgeExistingBounds(refusedCheckTitle, refusedCheckTitle),
    [FAIL, PASS],
  );

  // --- the two it cannot reach
  expect("both unreachable constraints are reported, not skipped", judgeUnreachable(), [
    UNVERIFIED,
    UNVERIFIED,
  ]);

  // --- cleanup
  expect("AFTER: everything removed and Alice back where she started", judgeCleanup(495, 5, 5), [
    PASS,
    PASS,
  ]);
  expect(
    "THE WORLD THAT WOULD TURN SOMEBODY ELSE'S PULL REQUEST RED",
    judgeCleanup(0, TASK_CAP, 5),
    [PASS, FAIL],
  );
  expect("an unreadable cleanup is unverified twice", judgeCleanup(null, null, 5), [
    UNVERIFIED,
    UNVERIFIED,
  ]);

  // --- the footprint
  expect(
    "the allowed paths pass",
    judgeTouchedNothingElse([
      { method: "POST", path: "/auth/v1/token?grant_type=password" },
      { method: "POST", path: "/rest/v1/tasks?select=id" },
      { method: "PATCH", path: "/rest/v1/profiles?user_id=eq.x" },
      { method: "POST", path: "/rest/v1/rpc/tasks_may_add" },
      { method: "POST", path: "/auth/v1/logout?scope=local" },
    ]),
    [PASS],
  );
  expect(
    "A STRAY TABLE IS A FAILURE",
    judgeTouchedNothingElse([{ method: "DELETE", path: "/rest/v1/teams?id=eq.x" }]),
    [FAIL],
  );
  expect(
    "A GLOBAL SIGN-OUT IS A FAILURE",
    judgeTouchedNothingElse([{ method: "POST", path: "/auth/v1/logout?scope=global" }]),
    [FAIL],
  );

  // --- the readers
  cases += 1;
  if (codeOf(ok(200, JSON.stringify([{ code: "not a code" }]))) === null) {
    console.log("  ok  a code is not read off a successful array answer");
  } else {
    wrong += 1;
    console.log("  WRONG  a code was read off a successful array answer");
  }
  cases += 1;
  if (codeOf(ok(400, "this is not json")) === null) {
    console.log("  ok  a body that is not JSON carries no code");
  } else {
    wrong += 1;
    console.log("  WRONG  a non-JSON body produced a code");
  }
  cases += 1;
  if (constraintOf(refusedCheckTitle) === "tasks_title_no_control_chars") {
    console.log("  ok  the constraint name is read out of the message");
  } else {
    wrong += 1;
    console.log("  WRONG  the constraint name was not read");
  }
  cases += 1;
  if (constraintOf(refusedRls) === null) {
    console.log("  ok  a message with no constraint in it yields null");
  } else {
    wrong += 1;
    console.log("  WRONG  a constraint was invented");
  }

  console.log("");
  console.log(`${cases} cases, ${wrong} wrong.`);
  console.log("");
  console.log("Every judgement said FAIL or UNVERIFIED to the worlds that matter: a");
  console.log("project where the 501st task is accepted, where a batch walks past the");
  console.log("cap, where a newline still reaches a title, where tasks_may_add() tells");
  console.log("the screen the wrong thing, where deleting a task does not make room,");
  console.log("and where this run left Alice at 500. That is what would make a green");
  console.log("staging run mean something. It is NOT itself a staging result: nothing");
  console.log("was sent anywhere by this run.");
  return wrong === 0 ? 0 : 1;
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) {
  process.exit(runSelftest());
}
const cleanupOnly = args.includes("--cleanup");

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
//
// The same small .env reader the scripts beside this use, and for the same
// reason: no dotenv package exists here and adding one for a staging script
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
        `  node scripts/staging/build-it-25-limits-checks.mjs --selftest`,
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

// THE STAGING GUARD, first, before a password is read out of the environment and
// long before a request is made.
const urlVerdict = judgeStagingUrl(supabaseUrl)[0];
if (urlVerdict.verdict !== PASS) {
  die(
    `the Supabase URL in web/.env.local is not the staging project: ${urlVerdict.detail}.\n` +
      `This script creates five hundred rows and deletes them. It runs against staging and\n` +
      `nothing else.`,
  );
}

const PEOPLE = [
  { label: "Alice", emailVar: "ALICE_EMAIL", passwordVar: "ALICE_PASSWORD" },
  { label: "Bob", emailVar: "BOB_EMAIL", passwordVar: "BOB_PASSWORD" },
  { label: "Carol", emailVar: "CAROL_EMAIL", passwordVar: "CAROL_PASSWORD" },
];

const needed = cleanupOnly ? PEOPLE.slice(0, 1) : PEOPLE;
const missingFromEnv = [];
for (const person of needed) {
  if ((process.env[person.emailVar] ?? "").trim() === "") missingFromEnv.push(person.emailVar);
  if ((process.env[person.passwordVar] ?? "") === "") missingFromEnv.push(person.passwordVar);
}
if (missingFromEnv.length > 0) {
  die(
    `these are not set in the environment: ${missingFromEnv.join(", ")}.\n` +
      `See docs/environments.md -> "Where the test accounts live". No value is printed.\n` +
      `\n` +
      `The logic check needs none of them:\n` +
      `  node scripts/staging/build-it-25-limits-checks.mjs --selftest`,
  );
}

const base = supabaseUrl.replace(/\/+$/, "");
const authUrl = `${base}/auth/v1`;
const restUrl = `${base}/rest/v1`;

const REQUEST_LOG = [];
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

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

async function signIn(person) {
  const path = "/auth/v1/token?grant_type=password";
  REQUEST_LOG.push({ method: "POST", path });

  const email = (process.env[person.emailVar] ?? "").trim();
  const password = process.env[person.passwordVar] ?? "";

  let response;
  try {
    response = await fetch(`${authUrl}/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, ...captchaBody() }),
    });
  } catch (cause) {
    die(`${person.label} could not reach the auth endpoint (${cause.message})`);
  }
  if (!response.ok) {
    die(
      `${person.label} (${person.passwordVar}, value not printed) could not sign in: ` +
        `HTTP ${response.status}. If this is a CAPTCHA refusal, staging's secret key must be one of ` +
        `Cloudflare's DUMMY ones -- docs/rate-limits.md section 3 row 6.`,
    );
  }
  const session = await response.json();
  const accessToken = session?.access_token ?? "";
  const userId = session?.user?.id ?? "";
  if (accessToken === "" || userId === "") {
    die(`${person.label}: HTTP 2xx but no session came back`);
  }
  if (!UUID_PATTERN.test(userId)) die(`${person.label}: the user id is not a uuid`);
  // Neither is ever printed.
  return { label: person.label, accessToken, userId };
}

async function signOut(session) {
  if (!session?.accessToken) return;
  const path = "/auth/v1/logout?scope=local";
  REQUEST_LOG.push({ method: "POST", path });
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

async function rest(method, path, { accessToken, body } = {}) {
  REQUEST_LOG.push({ method, path: `/rest/v1/${path}` });

  const headers = { apikey: publishableKey, Prefer: "return=representation" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

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
  return readRestAnswer({ status: response.status, raw: await response.text() });
}

/** How many tasks this person owns, or null if it could not be read. */
async function taskCount(session) {
  const answer = await rest("GET", `tasks?select=id&owner_id=eq.${session.userId}&limit=2000`, {
    accessToken: session.accessToken,
  });
  if (answer.error || answer.status >= 400 || !Array.isArray(answer.json)) return null;
  return answer.json.length;
}

/** Remove every row this script could have made. Returns the count, or null. */
async function cleanup(session) {
  const answer = await rest(
    "DELETE",
    `tasks?select=id&owner_id=eq.${session.userId}&title=like.${encodeURIComponent(`${MARK}%`)}`,
    { accessToken: session.accessToken },
  );
  if (answer.error || answer.status >= 400 || !Array.isArray(answer.json)) return null;
  return answer.json.length;
}

async function mayAdd(session) {
  return rest("POST", "rpc/tasks_may_add", { accessToken: session.accessToken, body: {} });
}

// ---------------------------------------------------------------------------
// --cleanup
// ---------------------------------------------------------------------------

if (cleanupOnly) {
  console.log("Build it 25 part 2a -- CLEANUP ONLY, against STAGING");
  console.log(`  project:  ${STAGING_HOST}`);
  console.log(`  removing: tasks whose title starts with "${MARK}", and nothing else`);
  console.log("");

  const alice = await signIn(PEOPLE[0]);
  const bob = await signIn(PEOPLE[1]);

  for (const session of [alice, bob]) {
    const removed = await cleanup(session);
    const left = await taskCount(session);
    console.log(
      `  ${session.label}: removed ${removed === null ? "UNKNOWN" : removed} row(s); ` +
        `now holds ${left === null ? "UNKNOWN" : left}`,
    );
    await signOut(session);
  }

  console.log("");
  console.log("Nothing else was touched. No judgement was made.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

console.log("Build it 25 part 2a -- the task cap and the input limits, against STAGING only");
console.log(`  project:  ${STAGING_HOST} (host checked exactly)`);
console.log(`  cap:      ${TASK_CAP} tasks per person`);
console.log(`  marks:    every task it creates is titled "${MARK} ..."`);
console.log("  creates:  no account, no team, no file. sends: no email.");
console.log("");
console.log("  Run this BEFORE applying the migration and AFTER. Before, the cap and");
console.log("  constraint checks MUST FAIL -- that is the evidence nothing was enforcing");
console.log("  them. After, they must pass.");
console.log("");

const alice = await signIn(PEOPLE[0]);
const bob = await signIn(PEOPLE[1]);

let aliceStart = null;
let removedAtEnd = null;
let aliceEnd = null;

try {
  console.log("1. where Alice starts");
  aliceStart = await taskCount(alice);
  record(judgeStartingCount(aliceStart, TASK_CAP));
  if (aliceStart === null || aliceStart >= TASK_CAP) {
    console.log("");
    console.log("Stopping here: nothing has been created, so there is nothing to tidy.");
    await signOut(alice);
    await signOut(bob);
    process.exit(1);
  }
  console.log("");

  // ---- fill to one below the cap ------------------------------------------
  console.log(`2. filling Alice's list to ${TASK_CAP - 1}`);
  const toCreate = TASK_CAP - 1 - aliceStart;
  // In batches, because one POST of several hundred rows is one statement and one
  // very large body. 100 at a time keeps each request small and each failure
  // legible -- and every batch is well under the cap, so none of them is the
  // multi-row case being tested in step 5.
  let created = 0;
  for (let from = 0; from < toCreate; from += 100) {
    const size = Math.min(100, toCreate - from);
    const rows = Array.from({ length: size }, (unused, i) => ({
      title: `${MARK} fill ${from + i + 1}`,
    }));
    const answer = await rest("POST", "tasks?select=id", { accessToken: alice.accessToken, body: rows });
    if (answer.error || answer.status >= 400) {
      console.log(
        `  FAIL  filling the list -- HTTP ${answer.status ?? "?"} code=${JSON.stringify(codeOf(answer))}`,
      );
      failures += 1;
      break;
    }
    created += rowsIn(answer);
  }
  console.log(`  created ${created} row(s); Alice now holds ${await taskCount(alice)}`);
  console.log("");

  // ---- the cap itself -----------------------------------------------------
  console.log(`3. the ${TASK_CAP}th, and the ${TASK_CAP + 1}th`);
  const lastAllowed = await rest("POST", "tasks?select=id", {
    accessToken: alice.accessToken,
    body: { title: `${MARK} the last one that fits` },
  });
  const oneTooMany = await rest("POST", "tasks?select=id", {
    accessToken: alice.accessToken,
    body: { title: `${MARK} one too many` },
  });
  record(judgeAtTheCap(lastAllowed, oneTooMany, TASK_CAP));
  console.log("");

  // ---- the screen's mechanism --------------------------------------------
  console.log("4. tasks_may_add(), which is how the screen will tell this refusal apart");
  record(judgeMayAddRpc(await mayAdd(alice), await mayAdd(bob)));
  console.log("");

  // ---- a multi-row insert -------------------------------------------------
  console.log("5. one POST of five rows, from one below the cap");
  const deletedForBatch = await rest(
    "DELETE",
    `tasks?select=id&owner_id=eq.${alice.userId}&title=eq.${encodeURIComponent(`${MARK} the last one that fits`)}`,
    { accessToken: alice.accessToken },
  );
  if (deletedForBatch.error || deletedForBatch.status >= 400) {
    record([
      {
        what: "a batch insert at the cap",
        verdict: UNVERIFIED,
        detail: "could not free a place first, so the batch would have been over the cap anyway",
      },
    ]);
  } else {
    const before = await taskCount(alice);
    const batch = await rest("POST", "tasks?select=id", {
      accessToken: alice.accessToken,
      body: Array.from({ length: 5 }, (unused, i) => ({ title: `${MARK} batch ${i + 1}` })),
    });
    const after = await taskCount(alice);
    record(judgeMultiRow(batch, before, after, 5, TASK_CAP));
  }
  console.log("");

  // ---- per person ---------------------------------------------------------
  console.log("6. the cap is per person");
  record(
    judgePerPerson(
      await rest("POST", "tasks?select=id", {
        accessToken: bob.accessToken,
        body: { title: `${MARK} bob's own` },
      }),
    ),
  );
  console.log("");

  // ---- still usable at the cap -------------------------------------------
  console.log("7. at the cap, the rest of the app still works");
  const fillOne = await rest("POST", "tasks?select=id", {
    accessToken: alice.accessToken,
    body: { title: `${MARK} back to the cap` },
  });
  const target = Array.isArray(fillOne.json) && fillOne.json[0]?.id ? fillOne.json[0].id : null;
  if (target === null) {
    record([
      {
        what: "at the cap, the rest of the app still works",
        verdict: UNVERIFIED,
        detail: "could not get Alice back to the cap, so none of this would mean anything",
      },
    ]);
  } else {
    const ticked = await rest("PATCH", `tasks?select=id&id=eq.${target}`, {
      accessToken: alice.accessToken,
      body: { done: true },
    });
    const renamed = await rest("PATCH", `tasks?select=id&id=eq.${target}`, {
      accessToken: alice.accessToken,
      body: { title: `${MARK} renamed at the cap` },
    });
    const deleted = await rest("DELETE", `tasks?select=id&id=eq.${target}`, {
      accessToken: alice.accessToken,
    });
    const insertAfterDelete = await rest("POST", "tasks?select=id", {
      accessToken: alice.accessToken,
      body: { title: `${MARK} room again` },
    });
    record(judgeStillUsable(ticked, renamed, deleted, insertAfterDelete));
  }
  console.log("");

  // ---- control characters ------------------------------------------------
  console.log("8. control characters in a task title -- Bob, who has room");
  const samples = [
    ["a tab (U+0009) in a title", String.fromCharCode(9), true],
    ["a line feed (U+000A) in a title", String.fromCharCode(10), true],
    ["a carriage return (U+000D) in a title", String.fromCharCode(13), true],
    ["a delete (U+007F) in a title", String.fromCharCode(127), true],
    ["a C1 character (U+0080) in a title", String.fromCharCode(128), true],
    ["a zero-width space (U+200B) in a title", String.fromCharCode(8203), false],
    ["a right-to-left override (U+202E) in a title", String.fromCharCode(8238), false],
  ];
  for (const [label, character, expectRefused] of samples) {
    const answer = await rest("POST", "tasks?select=id", {
      accessToken: bob.accessToken,
      body: { title: `${MARK} two${character}words` },
    });
    record(judgeControlChar(label, answer, expectRefused, "tasks_title_no_control_chars"));
  }
  console.log("");

  // ---- the existing bounds -----------------------------------------------
  console.log("9. and the title bounds that were already there still bite");
  const atMax = await rest("POST", "tasks?select=id", {
    accessToken: bob.accessToken,
    body: { title: `${MARK} ` + "a".repeat(TITLE_MAX - MARK.length - 1) },
  });
  const overMax = await rest("POST", "tasks?select=id", {
    accessToken: bob.accessToken,
    body: { title: `${MARK} ` + "a".repeat(TITLE_MAX) },
  });
  record(judgeExistingBounds(atMax, overMax));
  console.log("");

  // ---- a nickname --------------------------------------------------------
  console.log("10. a control character in a nickname");
  const before = await rest("GET", `profiles?select=display_name&user_id=eq.${bob.userId}`, {
    accessToken: bob.accessToken,
  });
  const originalName =
    Array.isArray(before.json) && typeof before.json[0]?.display_name === "string"
      ? before.json[0].display_name
      : null;
  if (originalName === null) {
    record([
      {
        what: "a tab in a nickname is REFUSED",
        verdict: UNVERIFIED,
        detail: "Bob's current nickname could not be read, so it could not be put back afterwards",
      },
    ]);
  } else {
    const answer = await rest("PATCH", `profiles?select=user_id&user_id=eq.${bob.userId}`, {
      accessToken: bob.accessToken,
      body: { display_name: `Bo${String.fromCharCode(9)}b` },
    });
    record(
      judgeControlChar(
        "a tab in a nickname",
        answer,
        true,
        "profiles_display_name_no_control_chars",
      ),
    );
    // PUT IT BACK WHATEVER HAPPENED. If the constraint is not there yet, the
    // update succeeded and Bob's nickname now has a tab in it.
    const restored = await rest("PATCH", `profiles?select=display_name&user_id=eq.${bob.userId}`, {
      accessToken: bob.accessToken,
      body: { display_name: originalName },
    });
    console.log(
      `  (Bob's nickname put back: HTTP ${restored.status ?? "?"}${
        restored.status >= 400 ? " -- CHECK IT BY HAND" : ""
      })`,
    );
  }
  console.log("");

  // ---- the two it cannot reach -------------------------------------------
  console.log("11. the two constraints a client cannot reach at all");
  record(judgeUnreachable());
  console.log("");
} finally {
  // ---- tidy up, whatever happened above ----------------------------------
  console.log("12. tidying up");
  const removedAlice = await cleanup(alice);
  const removedBob = await cleanup(bob);
  removedAtEnd =
    removedAlice === null || removedBob === null ? null : removedAlice + removedBob;
  aliceEnd = await taskCount(alice);
  console.log(
    `  removed ${removedAlice === null ? "UNKNOWN" : removedAlice} of Alice's and ` +
      `${removedBob === null ? "UNKNOWN" : removedBob} of Bob's`,
  );
  record(judgeCleanup(removedAtEnd, aliceEnd, aliceStart));
  console.log("");

  console.log("13. what this run actually did");
  record(judgeTouchedNothingElse(REQUEST_LOG));
  await signOut(alice);
  await signOut(bob);
  console.log("");

  const total = passes + failures + unverified;
  console.log(`${passes} PASS, ${failures} FAIL, ${unverified} UNVERIFIED (${total} judgements).`);
  console.log("");
  console.log("WHAT THIS RUN CANNOT TELL YOU:");
  console.log("  * anything about production. Nothing here touches it.");
  console.log("  * whether the two unreachable constraints hold. Only the dashboard and a");
  console.log("    local sandbox can exercise those -- section 11 says so rather than");
  console.log("    skipping them.");
  console.log("  * what any screen says. No page is opened by this script.");
}

process.exit(failures > 0 ? 1 : 0);
