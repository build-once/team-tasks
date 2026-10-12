#!/usr/bin/env node
// build-it-25-upload-count-checks.mjs -- the daily upload count, against
// STAGING, run BEFORE and AFTER the owner applies
// supabase/migrations/20261012120000_upload_daily_count.sql.
//
// Build it 25 part 2b. STAGING ONLY.
//
// ---------------------------------------------------------------------------
// THE ONE THING ONLY THIS SCRIPT CAN ANSWER
// ---------------------------------------------------------------------------
//
// THE BROWSER NEVER SEES THE TRIGGER'S EXCEPTION. It talks to the Storage API,
// which talks to PostgreSQL, and what Storage makes of a trigger raising
// SQLSTATE 54000 -- the HTTP status, whether the message comes through, whether
// the code appears anywhere -- IS NOT KNOWN. No page read says, and a local
// database cannot answer it: it is a property of a service.
//
// So section 4 PRINTS THE EXACT STATUS AND THE EXACT BODY of the thirty-first
// upload, whatever they are. Nothing in the screen pull request may be written
// against the sentence or the code until that has been read, and the migration's
// own section 6 says what to do if neither survives.
//
// ---------------------------------------------------------------------------
// BEFORE MUST FAIL, AFTER MUST PASS, AND THERE IS NO FLAG
// ---------------------------------------------------------------------------
//
// Every judgement is written for the world after the migration. Run it against
// staging as it is and the count checks FAIL -- which is the evidence nothing was
// counting. Apply the migration, run it again, and they pass. The same shape
// build-it-23-attachment-checks.mjs and build-it-25-limits-checks.mjs use.
//
// ---------------------------------------------------------------------------
// WHOSE DAY IT SPENDS, AND WHY IT IS NOT ALICE'S
// ---------------------------------------------------------------------------
//
// IT SPENDS ONE PERSON'S WHOLE DAILY ALLOWANCE AND CANNOT GIVE IT BACK. A count
// in usage_counts is removed only by its own 7-day window; nothing in this
// project can reset one, and `service_role` deliberately holds no privilege on
// that table (20261008115900_usage_counts.sql section 2). So whoever this script
// uses cannot upload again until 00:00 UTC.
//
// THAT PERSON IS BOB, NOT ALICE, at the owner's instruction. Alice is the account
// `web/tests/access-rules.test.mjs` leans on hardest in CI on every pull request
// -- and while that file does not upload anything today, the attachments screen's
// own future tests would, and an account with no uploads left is an account whose
// failures have nothing to do with the rules being tested.
//
// BOB'S DAY IS STILL SPENT, which is a real cost and is stated rather than hidden:
// after a full run, Bob cannot attach a file on staging until the UTC day turns.
// `--skip-limit` leaves sections 3 and 4 out for a run that only wants the rest.
//
// ---------------------------------------------------------------------------
// WHAT IT CREATES AND REMOVES
// ---------------------------------------------------------------------------
//
// ELEVEN TASKS and up to THIRTY-ONE FILES, because the bucket allows 3 files per
// task and 31 uploads need 11 tasks -- docs/plan.md's own arithmetic, "three
// files per task at ten tasks in a day".
//
// EVERY FILE IS 70 BYTES: one real 1x1 PNG, the same fixture
// build-it-23-attachment-checks.mjs uses, so an accepted upload is a file a
// browser could draw rather than four bytes that happen to be allowed. 31 of them
// is about 2 KB, which is nothing against anybody's 100 MB.
//
// EVERY TASK IS TITLED FROM ONE FIXED PREFIX and every file sits under one of
// those tasks, so a leftover is recognisable at a glance and the cleanup matches
// on that prefix and nothing else. It tidies up in a `finally`, and there is a
// mode that does nothing else:
//
//   node scripts/staging/build-it-25-upload-count-checks.mjs --cleanup
//
// ORDER MATTERS IN THE CLEANUP, and the database enforces it: a task cannot be
// deleted while it still has files (`tasks_refuse_delete_with_files`). So the
// files go first, then the tasks -- which is also the order the app itself uses.
//
// WHAT IT NEVER PRINTS: a password, an access token, a user id, the publishable
// key, or the project URL. Statuses, error codes and counts are printed, and in
// section 4 a whole refusal body is printed on purpose -- which is why that body
// is put through the scrubber first.
//
// ---------------------------------------------------------------------------
// HOW TO RUN IT
// ---------------------------------------------------------------------------
//
//   node scripts/staging/build-it-25-upload-count-checks.mjs --selftest
//       The logic only. No setting is read, no request is made, no account is
//       used. CI runs this on every pull request.
//
//   node scripts/staging/build-it-25-upload-count-checks.mjs
//       Against staging. Needs web/.env.local for the URL and the publishable
//       key, and BOB_EMAIL / BOB_PASSWORD in the environment. Nobody else's.
//
//   node scripts/staging/build-it-25-upload-count-checks.mjs --cleanup
//       Removes this script's files and then its tasks, and reports both counts.
//
//   node scripts/staging/build-it-25-upload-count-checks.mjs --skip-limit
//       Leaves out sections 3 and 4, so Bob's day is not spent.
//
// NO PACKAGES. Node built-ins and global fetch only (AGENTS.md rule 17).

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { captchaBody } from "../lib/captcha.mjs";

const PASS = "PASS";
const FAIL = "FAIL";
const UNVERIFIED = "UNVERIFIED";

const STAGING_REF = "ghskxrhqlhvrhpnivqbd";
const STAGING_HOST = `${STAGING_REF}.supabase.co`;

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(HERE, "..", "..", "web", ".env.local");

const MARK = "bi25-upload-check";
const BUCKET = "attachments";

// The day's limit, and the number of tasks needed to reach it at 3 files each.
// A SECOND COPY of the migration's c_uploads_per_day: a staging script cannot
// read a plpgsql constant, and section 3 compares the two behaviours rather than
// the two numbers.
const UPLOADS_PER_DAY = 30;
const FILES_PER_TASK = 3;
const TASKS_NEEDED = Math.ceil((UPLOADS_PER_DAY + 1) / FILES_PER_TASK);

// A real 1x1 PNG, the same fixture build-it-23-attachment-checks.mjs uses.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/WMmxY8AAAAASUVORK5CYII=",
  "base64",
);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// How much of a refusal body section 4 prints. Enough for a message and a code,
// short enough that an HTML error page does not fill the terminal.
const MAX_BODY = 600;

function die(message) {
  console.error(`\nREFUSING TO RUN: ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Scrubbing, and why it exists in this script in particular
// ---------------------------------------------------------------------------
//
// SECTION 4 PRINTS A WHOLE RESPONSE BODY, which no other check in this
// repository does. That is its entire job -- nobody knows what Storage says, so
// guessing which field to read would be reading what somebody expected rather
// than what arrived. A body that is printed whole is a body that could carry
// something it should not, so every live value is registered here BEFORE anything
// is printed, and replaced by a placeholder.
//
// It is the shape build-it-23-attachment-checks.mjs arrived at the hard way: its
// own section records a FAIL caused by printing a body before the credential in
// it had been registered.
const PLACEHOLDERS = new Map();

export function remember(value, placeholder) {
  if (typeof value === "string" && value.length >= 8) {
    PLACEHOLDERS.set(value, `[${placeholder}]`);
  }
}

export function scrub(text, placeholders = PLACEHOLDERS) {
  let out = typeof text === "string" ? text : String(text);
  for (const [value, placeholder] of placeholders) {
    out = out.split(value).join(placeholder);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reading an answer -- the ONE place a body becomes something judgeable
// ---------------------------------------------------------------------------
//
// A SEPARATE PURE FUNCTION so --selftest drives the real reading path. Every
// fixture below is a RAW STRING put through this, never an object built in the
// selftest: the hole build-it-23-attachment-checks.mjs found in its own first
// selftest, where a fixture that skipped the parser agreed with its author.
//
// `printable` is scrubbed and capped and is the only thing section 4 prints.
export function readStorageAnswer({ status, raw, error }, placeholders = PLACEHOLDERS) {
  if (error) return { error };

  let json = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }

  const scrubbed = scrub(raw, placeholders);
  return {
    status,
    json,
    printable: scrubbed.length > MAX_BODY ? `${scrubbed.slice(0, MAX_BODY)}… (truncated)` : scrubbed,
  };
}

/**
 * Does this answer carry the trigger's SQLSTATE anywhere at all?
 *
 * Deliberately a SEARCH OF THE WHOLE BODY rather than a read of one field:
 * nobody knows which field Storage would put it in, or whether it uses one. A
 * search can answer "it is in there somewhere", which is the useful half, and
 * cannot answer "it is in the field the screen will read" -- which is why the
 * judgement that uses it reports rather than passes.
 */
export function mentions(answer, needle) {
  if (answer.error) return false;
  const body = typeof answer.printable === "string" ? answer.printable : "";
  return body.includes(needle);
}

/** Storage's own error code, if the body is JSON and carries one. */
export function storageCodeOf(answer) {
  const bag = answer.json;
  if (bag === null || typeof bag !== "object" || Array.isArray(bag)) return null;
  for (const field of ["statusCode", "code", "error"]) {
    if (typeof bag[field] === "string") return bag[field];
  }
  return null;
}

// ---------------------------------------------------------------------------
// The judgements -- pure functions, which is what --selftest exercises
// ---------------------------------------------------------------------------

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
        detail: "it carries a user name or a password in the URL itself, so its host is not what it reads as",
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

// Did the setup work? Nothing after it means anything if the tasks are not there.
export function judgeSetup(tasksMade, needed) {
  const what = `${needed} tasks to hang the files on`;
  if (tasksMade === null) {
    return [{ what, verdict: UNVERIFIED, detail: "the tasks could not be created" }];
  }
  return [
    {
      what,
      verdict: tasksMade === needed ? PASS : FAIL,
      detail:
        tasksMade === needed
          ? `${tasksMade} made`
          : `${tasksMade} of ${needed} made, so the limit cannot be reached cleanly`,
    },
  ];
}

// THE FIRST THIRTY. All allowed, before and after: the limit is 30, so reaching it
// must not refuse anything on the way.
export function judgeFirstThirty(statuses, limit) {
  const what = `the first ${limit} uploads are all allowed`;
  if (statuses.length !== limit) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail: `${statuses.length} attempts were made, not ${limit}`,
      },
    ];
  }
  const refused = statuses.filter((s) => s === null || s >= 400);
  if (refused.length > 0) {
    const firstBad = statuses.findIndex((s) => s === null || s >= 400);
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `${refused.length} of ${limit} were refused, the first at attempt ${firstBad + 1}` +
          ` (HTTP ${statuses[firstBad] ?? "no answer"}). Something other than the daily limit is` +
          ` refusing these -- the per-task 3, the 100 MB, or the bucket.`,
      },
    ];
  }
  return [{ what, verdict: PASS, detail: `${limit} of ${limit}, none refused` }];
}

// THE THIRTY-FIRST, AND THE WHOLE POINT OF THE SCRIPT. Four judgements, and only
// the first is pass-or-fail: the other three REPORT, because what Storage does
// with a trigger's exception is the unknown this run exists to record.
export function judgeThirtyFirst(answer, limit, sentence, sqlstate) {
  if (answer.error) {
    return [{ what: `the ${limit + 1}th upload is refused`, verdict: UNVERIFIED, detail: answer.error }];
  }

  const results = [];
  const refused = answer.status >= 400;

  results.push({
    what: `THE ${limit + 1}th UPLOAD IS REFUSED`,
    verdict: refused ? PASS : FAIL,
    detail: refused
      ? `HTTP ${answer.status}`
      : `HTTP ${answer.status}, ACCEPTED. Before the migration this is the right answer and is the` +
        ` evidence nothing was counting. After it, the trigger is not firing.`,
  });

  if (!refused) return results;

  // THE RECORDING. Printed whatever it is, scrubbed, because the screen pull
  // request has nothing else to go on.
  results.push({
    what: "and THIS IS THE EXACT BODY Storage returned -- write it down",
    verdict: UNVERIFIED,
    detail: `HTTP ${answer.status} body=${answer.printable}`,
  });

  results.push({
    what: "does the app's own sentence survive the Storage API?",
    verdict: mentions(answer, sentence) ? PASS : UNVERIFIED,
    detail: mentions(answer, sentence)
      ? "yes -- the screen could show what the database said"
      : `NO. The screen cannot use the message, so it needs the migration's section 6 option 1:` +
        ` after a refusal, ask attachments_may_add() and infer the daily limit from a yes.`,
  });

  results.push({
    what: `does the SQLSTATE ${sqlstate} survive it?`,
    verdict: mentions(answer, sqlstate) ? PASS : UNVERIFIED,
    detail: mentions(answer, sqlstate)
      ? `yes -- ${sqlstate} is in the body somewhere, though WHICH FIELD is a separate question this` +
        ` script cannot settle`
      : `NO. Storage's own code is ${JSON.stringify(storageCodeOf(answer))}, which is about the` +
        ` request and not about the limit.`,
  });

  return results;
}

// A REFUSED UPLOAD MUST NOT SPEND A SLOT. Proved from the outside the only way it
// can be: after a refusal that is NOT the daily limit, one more upload must still
// be allowed. If the refused attempt had spent a slot, this one would be the
// thirty-first.
export function judgeRefusalCostsNothing(refused, nextOne) {
  const results = [];

  const whatRefused = "a FOURTH file on one task is refused by the per-task limit";
  if (refused.error) {
    results.push({ what: whatRefused, verdict: UNVERIFIED, detail: refused.error });
    return results;
  }
  results.push({
    what: whatRefused,
    verdict: refused.status >= 400 ? PASS : FAIL,
    detail:
      refused.status >= 400
        ? `HTTP ${refused.status}`
        : `HTTP ${refused.status}, allowed -- the per-task 3 is not holding, so this check cannot` +
          ` test what it is for`,
  });

  const what = "AND THE UPLOAD AFTER IT IS STILL ALLOWED, so the refusal cost no slot";
  if (nextOne.error) {
    results.push({ what, verdict: UNVERIFIED, detail: nextOne.error });
    return results;
  }
  results.push({
    what,
    verdict: nextOne.status < 400 ? PASS : FAIL,
    detail:
      nextOne.status < 400
        ? `HTTP ${nextOne.status}`
        : `HTTP ${nextOne.status} -- a refused upload spent a slot, which is the wrong way round:` +
          ` the count is meant to be written in the same transaction as the row`,
  });
  return results;
}

// DELETING A FILE MUST NOT COST A SLOT. The trigger is on INSERT and nothing else,
// and the reason this is checked rather than assumed is that the opposite would be
// cruel: deleting a file to make room would spend the room.
export function judgeDeleteCostsNothing(deleted, nextOne) {
  const results = [];

  const whatDeleted = "a file can be deleted";
  if (deleted.error) {
    results.push({ what: whatDeleted, verdict: UNVERIFIED, detail: deleted.error });
    return results;
  }
  results.push({
    what: whatDeleted,
    verdict: deleted.status < 400 ? PASS : FAIL,
    detail: `HTTP ${deleted.status}`,
  });

  const what = "AND AN UPLOAD AFTER THE DELETE IS ALLOWED, so deleting cost no slot";
  if (nextOne.error) {
    results.push({ what, verdict: UNVERIFIED, detail: nextOne.error });
    return results;
  }
  results.push({
    what,
    verdict: nextOne.status < 400 ? PASS : FAIL,
    detail:
      nextOne.status < 400
        ? `HTTP ${nextOne.status}`
        : `HTTP ${nextOne.status} -- deleting a file spent a slot, so making room costs room`,
  });
  return results;
}

// THE RESTORE CASE, which this script can only describe. scripts/backup/ puts
// files back with the SERVICE-ROLE key, and the trigger deliberately counts
// nothing for a caller with no auth.uid(). A staging script holds no service-role
// key and must not -- docs/secrets.md -- so this is UNVERIFIED here by design
// rather than by omission, and it names what did establish it.
export function judgeRestoreCase() {
  return [
    {
      what: "a service-role restore of more than 30 files is neither counted nor refused",
      verdict: UNVERIFIED,
      detail:
        "this script holds no service-role key and must not. Established instead on a local" +
        " PostgreSQL 17.10 database: 40 files in ONE committed service-role statement, all landed," +
        " nothing counted -- evidence/build-it-25-upload-count.md section 5. The owner can repeat it" +
        " on staging from the dashboard's SQL editor if it is ever in doubt.",
    },
  ];
}

export function judgeCleanup(filesRemoved, tasksRemoved, tasksMade) {
  const results = [
    {
      what: "every file this run uploaded was removed",
      verdict: filesRemoved === null ? UNVERIFIED : PASS,
      detail:
        filesRemoved === null
          ? "the cleanup could not be read, so run --cleanup"
          : `${filesRemoved} file(s)`,
    },
  ];

  const what = "AND EVERY TASK IT MADE WAS REMOVED, files first, which the database enforces";
  if (tasksRemoved === null || tasksMade === null) {
    results.push({ what, verdict: UNVERIFIED, detail: "a count could not be read; run --cleanup" });
    return results;
  }
  results.push({
    what,
    verdict: tasksRemoved === tasksMade ? PASS : FAIL,
    detail:
      tasksRemoved === tasksMade
        ? `${tasksRemoved} of ${tasksMade}`
        : `${tasksRemoved} of ${tasksMade}. A task that still has a file cannot be deleted` +
          ` (tasks_refuse_delete_with_files), so a leftover file is the likeliest cause. Run --cleanup.`,
  });
  return results;
}

const ALLOWED_PATH_SHAPES = [
  /^\/auth\/v1\/token\?grant_type=password$/,
  /^\/auth\/v1\/logout\?scope=local$/,
  /^\/rest\/v1\/tasks/,
  /^\/storage\/v1\/object\/attachments\//,
  /^\/storage\/v1\/object\/list\/attachments$/,
];

export function judgeTouchedNothingElse(log) {
  const what = "this run touched only its own tasks, the attachments bucket, and sign in and out";
  const strays = log
    .filter((entry) => !ALLOWED_PATH_SHAPES.some((shape) => shape.test(entry.path)))
    .map((entry) => `${entry.method} ${entry.path}`);

  if (strays.length > 0) {
    return [{ what, verdict: FAIL, detail: `it also made: ${[...new Set(strays)].join(", ")}` }];
  }
  if (log.some((entry) => entry.path.includes("scope=global"))) {
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

// NOTHING THIS RUN PRINTED CARRIES A LIVE VALUE. Section 4 prints a whole body,
// so this is not a formality.
export function judgeNothingLeaked(printed, placeholders) {
  const what = "no live value appears in anything this run printed";
  const leaked = [...placeholders.keys()].filter((value) =>
    printed.some((text) => typeof text === "string" && text.includes(value)),
  );
  if (leaked.length > 0) {
    return [
      {
        what,
        verdict: FAIL,
        detail: `${leaked.length} value(s) reached the output unscrubbed. They are not named here.`,
      },
    ];
  }
  return [
    {
      what,
      verdict: PASS,
      detail: `${placeholders.size} live value(s) registered, none of them in the output`,
    },
  ];
}

// ---------------------------------------------------------------------------
// --selftest
// ---------------------------------------------------------------------------

function runSelftest() {
  console.log("build-it-25-upload-count-checks --selftest: can these checks fail?");
  console.log("");

  let cases = 0;
  let wrong = 0;

  function expect(what, results, wanted) {
    cases += 1;
    const got = results.map((r) => r.verdict);
    const same = got.length === wanted.length && got.every((v, i) => v === wanted[i]);
    if (same) {
      console.log(`  ok  ${what}`);
    } else {
      wrong += 1;
      console.log(`  WRONG  ${what}`);
      console.log(`         wanted ${wanted.join(", ")}`);
      console.log(`         got    ${got.join(", ")}`);
    }
  }

  const SENTENCE = "You've reached today's limit. It resets tomorrow.";
  const SQLSTATE = "54000";
  const none = new Map();
  const ok = (status, raw) => readStorageAnswer({ status, raw }, none);
  const created = ok(200, JSON.stringify({ Key: "attachments/x/y.png" }));
  const unreachable = { error: "could not reach Storage" };

  // Three shapes a refusal might have, and nobody knows which it is. That is the
  // point: every one is a world this script has to behave sensibly in.
  const refusalWithEverything = ok(
    500,
    JSON.stringify({ statusCode: "500", error: "Internal", message: `${SENTENCE} (SQLSTATE ${SQLSTATE})` }),
  );
  const refusalWithSentenceOnly = ok(
    400,
    JSON.stringify({ statusCode: "400", error: "Bad Request", message: SENTENCE }),
  );
  const refusalWithNeither = ok(
    500,
    JSON.stringify({ statusCode: "500", error: "Internal", message: "Internal Server Error" }),
  );

  // --- the URL guard
  expect("the staging host is accepted", judgeStagingUrl(`https://${STAGING_HOST}`), [PASS]);
  expect("another project is refused", judgeStagingUrl("https://somewhere-else.supabase.co"), [FAIL]);
  expect("http is refused", judgeStagingUrl(`http://${STAGING_HOST}`), [FAIL]);
  expect("a URL with a password in it is refused", judgeStagingUrl(`https://u:p@${STAGING_HOST}`), [FAIL]);
  expect("a port is refused", judgeStagingUrl(`https://${STAGING_HOST}:8443`), [FAIL]);
  expect("rubbish is refused", judgeStagingUrl("not a url"), [FAIL]);

  // --- setup
  expect("eleven tasks made", judgeSetup(11, 11), [PASS]);
  expect("THE WORLD WHERE SETUP HALF-WORKED", judgeSetup(7, 11), [FAIL]);
  expect("no tasks at all is unverified", judgeSetup(null, 11), [UNVERIFIED]);

  // --- the first thirty
  expect(
    "thirty allowed",
    judgeFirstThirty(Array.from({ length: 30 }, () => 200), 30),
    [PASS],
  );
  expect(
    "THE WORLD WHERE SOMETHING ELSE REFUSES ON THE WAY UP",
    judgeFirstThirty([...Array.from({ length: 12 }, () => 200), 400, ...Array.from({ length: 17 }, () => 200)], 30),
    [FAIL],
  );
  expect(
    "an attempt that never arrived counts as refused",
    judgeFirstThirty([...Array.from({ length: 29 }, () => 200), null], 30),
    [FAIL],
  );
  expect("the wrong number of attempts is unverified", judgeFirstThirty([200, 200], 30), [UNVERIFIED]);

  // --- the thirty-first, in all three worlds
  expect(
    "AFTER, and both the sentence and the code survive",
    judgeThirtyFirst(refusalWithEverything, 30, SENTENCE, SQLSTATE),
    [PASS, UNVERIFIED, PASS, PASS],
  );
  expect(
    "AFTER, the sentence survives and the code does not",
    judgeThirtyFirst(refusalWithSentenceOnly, 30, SENTENCE, SQLSTATE),
    [PASS, UNVERIFIED, PASS, UNVERIFIED],
  );
  expect(
    "AFTER, NEITHER survives -- still a pass for the refusal, and the screen needs option 1",
    judgeThirtyFirst(refusalWithNeither, 30, SENTENCE, SQLSTATE),
    [PASS, UNVERIFIED, UNVERIFIED, UNVERIFIED],
  );
  expect(
    "THE WORLD WHERE NOTHING IS COUNTING: the 31st is accepted",
    judgeThirtyFirst(created, 30, SENTENCE, SQLSTATE),
    [FAIL],
  );
  expect(
    "a request that never arrived is unverified",
    judgeThirtyFirst(unreachable, 30, SENTENCE, SQLSTATE),
    [UNVERIFIED],
  );

  // --- a refusal costs nothing
  expect(
    "AFTER: the fourth file refused, the next upload still allowed",
    judgeRefusalCostsNothing(refusalWithSentenceOnly, created),
    [PASS, PASS],
  );
  expect(
    "THE WORLD WHERE A REFUSED UPLOAD SPENT A SLOT",
    judgeRefusalCostsNothing(refusalWithSentenceOnly, refusalWithSentenceOnly),
    [PASS, FAIL],
  );
  expect(
    "and if the per-task 3 is not holding, this check says so",
    judgeRefusalCostsNothing(created, created),
    [FAIL, PASS],
  );

  // --- a delete costs nothing
  expect("AFTER: delete, then upload", judgeDeleteCostsNothing(ok(200, "{}"), created), [PASS, PASS]);
  expect(
    "THE WORLD WHERE DELETING A FILE SPENDS THE ROOM IT MAKES",
    judgeDeleteCostsNothing(ok(200, "{}"), refusalWithSentenceOnly),
    [PASS, FAIL],
  );

  // --- the restore case
  expect("the restore case is reported, not skipped", judgeRestoreCase(), [UNVERIFIED]);

  // --- cleanup
  expect("everything removed", judgeCleanup(31, 11, 11), [PASS, PASS]);
  expect("THE WORLD WHERE TASKS WERE LEFT BEHIND", judgeCleanup(31, 4, 11), [PASS, FAIL]);
  expect("an unreadable cleanup is unverified", judgeCleanup(null, null, 11), [UNVERIFIED, UNVERIFIED]);

  // --- the footprint
  expect(
    "the allowed paths pass",
    judgeTouchedNothingElse([
      { method: "POST", path: "/auth/v1/token?grant_type=password" },
      { method: "POST", path: "/rest/v1/tasks?select=id" },
      { method: "POST", path: "/storage/v1/object/attachments/x/y.png" },
      { method: "POST", path: "/storage/v1/object/list/attachments" },
      { method: "POST", path: "/auth/v1/logout?scope=local" },
    ]),
    [PASS],
  );
  expect(
    "A STRAY BUCKET IS A FAILURE",
    judgeTouchedNothingElse([{ method: "POST", path: "/storage/v1/object/avatars/x.png" }]),
    [FAIL],
  );
  expect(
    "A GLOBAL SIGN-OUT IS A FAILURE",
    judgeTouchedNothingElse([{ method: "POST", path: "/auth/v1/logout?scope=global" }]),
    [FAIL],
  );

  // --- the leak check, which matters here because section 4 prints a body
  const live = new Map([["a-live-access-token-value", "[TOKEN]"]]);
  expect("nothing leaked", judgeNothingLeaked(["HTTP 500 body={}"], live), [PASS]);
  expect(
    "THE WORLD WHERE A PRINTED BODY CARRIED A LIVE TOKEN",
    judgeNothingLeaked(["HTTP 500 body={\"t\":\"a-live-access-token-value\"}"], live),
    [FAIL],
  );

  // --- the readers
  cases += 1;
  if (
    readStorageAnswer({ status: 500, raw: "<html>not json</html>" }, none).json === null &&
    readStorageAnswer({ status: 500, raw: "<html>not json</html>" }, none).printable === "<html>not json</html>"
  ) {
    console.log("  ok  a body that is not JSON is still printable, and carries no json");
  } else {
    wrong += 1;
    console.log("  WRONG  a non-JSON body was mishandled");
  }
  cases += 1;
  if (readStorageAnswer({ status: 500, raw: "x".repeat(MAX_BODY + 50) }, none).printable.endsWith("(truncated)")) {
    console.log("  ok  a very long body is truncated rather than filling the terminal");
  } else {
    wrong += 1;
    console.log("  WRONG  a long body was not truncated");
  }
  cases += 1;
  if (
    readStorageAnswer(
      { status: 500, raw: '{"m":"token-abcdefgh here"}' },
      new Map([["token-abcdefgh", "[TOKEN]"]]),
    ).printable === '{"m":"[TOKEN] here"}'
  ) {
    console.log("  ok  a live value is replaced BEFORE the body is ever printable");
  } else {
    wrong += 1;
    console.log("  WRONG  a live value survived into printable");
  }
  cases += 1;
  if (storageCodeOf(refusalWithNeither) === "500" && storageCodeOf(created) === null) {
    console.log("  ok  Storage's own code is read off a refusal and not invented on a success");
  } else {
    wrong += 1;
    console.log("  WRONG  storageCodeOf misread an answer");
  }
  cases += 1;
  if (TASKS_NEEDED === 11) {
    console.log("  ok  31 uploads at 3 files per task needs 11 tasks");
  } else {
    wrong += 1;
    console.log(`  WRONG  TASKS_NEEDED is ${TASKS_NEEDED}, expected 11`);
  }

  console.log("");
  console.log(`${cases} cases, ${wrong} wrong.`);
  console.log("");
  console.log("Every judgement said FAIL or UNVERIFIED to the worlds that matter: a");
  console.log("project where the thirty-first upload is accepted, where a refused upload");
  console.log("spent a slot, where deleting a file spent the room it made, where the");
  console.log("per-task 3 was not holding, where tasks were left behind, and where a");
  console.log("printed body carried a live token. And it reports rather than passes for");
  console.log("the thing nobody knows: whether the message or the SQLSTATE survives the");
  console.log("Storage API at all. It is NOT itself a staging result: nothing was sent.");
  return wrong === 0 ? 0 : 1;
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) {
  process.exit(runSelftest());
}
const cleanupOnly = args.includes("--cleanup");
const skipLimit = args.includes("--skip-limit");

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

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
        `  node scripts/staging/build-it-25-upload-count-checks.mjs --selftest`,
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

const urlVerdict = judgeStagingUrl(supabaseUrl)[0];
if (urlVerdict.verdict !== PASS) {
  die(
    `the Supabase URL in web/.env.local is not the staging project: ${urlVerdict.detail}.\n` +
      `This script uploads thirty-one files and spends an account's whole daily allowance.\n` +
      `It runs against staging and nothing else.`,
  );
}

// ONE PERSON, AND IT IS BOB. See the header: this run spends a daily allowance
// that nothing can give back, and Alice is the account CI leans on.
const BOB = { label: "Bob", emailVar: "BOB_EMAIL", passwordVar: "BOB_PASSWORD" };

const missingFromEnv = [];
if ((process.env[BOB.emailVar] ?? "").trim() === "") missingFromEnv.push(BOB.emailVar);
if ((process.env[BOB.passwordVar] ?? "") === "") missingFromEnv.push(BOB.passwordVar);
if (missingFromEnv.length > 0) {
  die(
    `these are not set in the environment: ${missingFromEnv.join(", ")}.\n` +
      `See docs/environments.md -> "Where the test accounts live". No value is printed.\n` +
      `\n` +
      `The logic check needs none of them:\n` +
      `  node scripts/staging/build-it-25-upload-count-checks.mjs --selftest`,
  );
}

const base = supabaseUrl.replace(/\/+$/, "");
const authUrl = `${base}/auth/v1`;
const restUrl = `${base}/rest/v1`;
const storageUrl = `${base}/storage/v1`;

const SENTENCE = "You've reached today's limit. It resets tomorrow.";
const SQLSTATE = "54000";

const REQUEST_LOG = [];
const PRINTED = [];
let passes = 0;
let failures = 0;
let unverified = 0;

function record(results) {
  for (const result of results) {
    if (result.verdict === PASS) passes += 1;
    else if (result.verdict === FAIL) failures += 1;
    else unverified += 1;
    const line = `  ${result.verdict}  ${result.what} -- ${result.detail}`;
    PRINTED.push(line);
    console.log(line);
  }
}

function say(line) {
  PRINTED.push(line);
  console.log(line);
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

async function signIn(person) {
  REQUEST_LOG.push({ method: "POST", path: "/auth/v1/token?grant_type=password" });

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
  if (accessToken === "" || userId === "") die(`${person.label}: HTTP 2xx but no session came back`);
  if (!UUID_PATTERN.test(userId)) die(`${person.label}: the user id is not a uuid`);

  // REGISTERED THE MOMENT THEY EXIST, before any body that could contain them is
  // printed. Section 4 prints a whole body, so this ordering is the thing that
  // makes that safe.
  remember(accessToken, "ACCESS_TOKEN");
  remember(session?.refresh_token ?? "", "REFRESH_TOKEN");
  remember(userId, "USER_ID");
  remember(email, "EMAIL");
  return { label: person.label, accessToken, userId };
}

async function signOut(session) {
  if (!session?.accessToken) return;
  REQUEST_LOG.push({ method: "POST", path: "/auth/v1/logout?scope=local" });
  try {
    const response = await fetch(`${authUrl}/logout?scope=local`, {
      method: "POST",
      headers: { apikey: publishableKey, Authorization: `Bearer ${session.accessToken}` },
    });
    say(`  (${session.label} signed out: HTTP ${response.status})`);
  } catch (cause) {
    say(`  (${session.label} sign out failed: ${cause.message}; the session expires on its own)`);
  }
}

async function rest(method, path, { accessToken, body } = {}) {
  REQUEST_LOG.push({ method, path: `/rest/v1/${path.split("?")[0]}` });

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
  return readStorageAnswer({ status: response.status, raw: await response.text() });
}

async function upload(taskId, fileName, session) {
  const path = `/storage/v1/object/${BUCKET}/${taskId}/${fileName}`;
  REQUEST_LOG.push({ method: "POST", path });

  let response;
  try {
    response = await fetch(`${storageUrl}/object/${BUCKET}/${taskId}/${fileName}`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "image/png",
      },
      body: PNG_BYTES,
    });
  } catch (cause) {
    return { error: `could not reach Storage (${cause.message})` };
  }
  return readStorageAnswer({ status: response.status, raw: await response.text() });
}

async function removeFile(taskId, fileName, session) {
  const path = `/storage/v1/object/${BUCKET}/${taskId}/${fileName}`;
  REQUEST_LOG.push({ method: "DELETE", path });
  try {
    const response = await fetch(`${storageUrl}/object/${BUCKET}/${taskId}/${fileName}`, {
      method: "DELETE",
      headers: { apikey: publishableKey, Authorization: `Bearer ${session.accessToken}` },
    });
    return readStorageAnswer({ status: response.status, raw: await response.text() });
  } catch (cause) {
    return { error: `could not reach Storage (${cause.message})` };
  }
}

/** Every file under one of this script's tasks. */
async function listFiles(taskId, session) {
  const path = `/storage/v1/object/list/${BUCKET}`;
  REQUEST_LOG.push({ method: "POST", path });
  try {
    const response = await fetch(`${storageUrl}/object/list/${BUCKET}`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix: `${taskId}/`, limit: 100 }),
    });
    const answer = readStorageAnswer({ status: response.status, raw: await response.text() });
    return Array.isArray(answer.json) ? answer.json.map((o) => o.name).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** This script's tasks, newest first. */
async function myTasks(session) {
  const answer = await rest(
    "GET",
    `tasks?select=id,title&owner_id=eq.${session.userId}&title=like.${encodeURIComponent(`${MARK}%`)}&limit=200`,
    { accessToken: session.accessToken },
  );
  return Array.isArray(answer.json) ? answer.json : [];
}

/** Files first, then the tasks. The database refuses the other order. */
async function cleanup(session) {
  const tasks = await myTasks(session);
  let filesRemoved = 0;
  let tasksRemoved = 0;

  for (const task of tasks) {
    for (const name of await listFiles(task.id, session)) {
      const gone = await removeFile(task.id, name, session);
      if (!gone.error && gone.status < 400) filesRemoved += 1;
    }
  }
  for (const task of tasks) {
    const gone = await rest("DELETE", `tasks?select=id&id=eq.${task.id}`, {
      accessToken: session.accessToken,
    });
    if (!gone.error && gone.status < 400 && Array.isArray(gone.json) && gone.json.length === 1) {
      tasksRemoved += 1;
    }
  }
  return { filesRemoved, tasksRemoved, tasksSeen: tasks.length };
}

// ---------------------------------------------------------------------------
// --cleanup
// ---------------------------------------------------------------------------

if (cleanupOnly) {
  console.log("Build it 25 part 2b -- CLEANUP ONLY, against STAGING");
  console.log(`  project:  ${STAGING_HOST}`);
  console.log(`  removing: files under tasks titled "${MARK} …", then those tasks`);
  console.log("");

  const bob = await signIn(BOB);
  const { filesRemoved, tasksRemoved, tasksSeen } = await cleanup(bob);
  console.log(`  ${filesRemoved} file(s) removed`);
  console.log(`  ${tasksRemoved} of ${tasksSeen} task(s) removed`);
  if (tasksRemoved < tasksSeen) {
    console.log("  SOME TASKS REMAIN. A task that still has a file cannot be deleted; run this again.");
  }
  await signOut(bob);
  console.log("");
  console.log("Nothing else was touched. No judgement was made.");
  console.log("NOTE: Bob's daily upload count is NOT reset by this -- nothing can reset it.");
  console.log("It falls out of usage_counts' own 7-day window, and his allowance returns at 00:00 UTC.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

console.log("Build it 25 part 2b -- the daily upload count, against STAGING only");
console.log(`  project:  ${STAGING_HOST} (host checked exactly)`);
console.log(`  limit:    ${UPLOADS_PER_DAY} uploads per person per UTC day`);
console.log(`  as:       Bob -- NOT Alice, because this spends a day that cannot be given back`);
console.log(`  creates:  ${TASKS_NEEDED} tasks and up to ${UPLOADS_PER_DAY + 1} files of ${PNG_BYTES.length} bytes`);
console.log(`  marks:    every task is titled "${MARK} …"`);
console.log("");
console.log("  Run BEFORE applying the migration and AFTER. Before, the count checks");
console.log("  MUST FAIL. Section 4 is the one that matters either way: it prints the");
console.log("  exact status and body Storage returns for the thirty-first upload.");
console.log("");

const bob = await signIn(BOB);
let tasksMade = null;

// Did the limit refuse anything in this run? null until section 3 has looked.
// The closing notice reports this rather than asserting a side effect it has not
// checked -- see the note beside that notice for why.
let limitRefusedSomething = null;

try {
  say(`1. ${TASKS_NEEDED} tasks to hang the files on`);
  const made = [];
  for (let i = 1; i <= TASKS_NEEDED; i += 1) {
    const answer = await rest("POST", "tasks?select=id", {
      accessToken: bob.accessToken,
      body: { title: `${MARK} ${i}` },
    });
    if (!answer.error && answer.status < 400 && Array.isArray(answer.json) && answer.json[0]?.id) {
      made.push(answer.json[0].id);
    }
  }
  tasksMade = made.length;
  record(judgeSetup(tasksMade, TASKS_NEEDED));
  say("");

  if (tasksMade !== TASKS_NEEDED) {
    say("Stopping: without the tasks, nothing below would mean anything.");
  } else if (skipLimit) {
    say("2-4. SKIPPED -- --skip-limit was passed, so Bob's day is not spent.");
    record([
      {
        what: `the ${UPLOADS_PER_DAY + 1}th upload is refused, and what Storage says about it`,
        verdict: UNVERIFIED,
        detail: "--skip-limit was passed, so this was not run",
      },
    ]);
    say("");
  } else {
    // ---- the first thirty ------------------------------------------------
    say(`2. the first ${UPLOADS_PER_DAY} uploads, ${FILES_PER_TASK} per task`);
    const statuses = [];
    for (let i = 1; i <= UPLOADS_PER_DAY; i += 1) {
      const task = made[Math.floor((i - 1) / FILES_PER_TASK)];
      const answer = await upload(task, `f${i}.png`, bob);
      statuses.push(answer.error ? null : answer.status);
    }
    record(judgeFirstThirty(statuses, UPLOADS_PER_DAY));
    say("");

    // ---- THE THIRTY-FIRST ------------------------------------------------
    say(`3. THE ${UPLOADS_PER_DAY + 1}th UPLOAD, and what the Storage API makes of it`);
    const oneTooMany = await upload(made[Math.floor(UPLOADS_PER_DAY / FILES_PER_TASK)], "f31.png", bob);
    // Recorded before the judgement, so the closing notice reports what arrived
    // rather than what the judgement made of it. An attempt that never arrived
    // leaves it null, which is "unknown" and not "no".
    limitRefusedSomething = oneTooMany.error ? null : oneTooMany.status >= 400;
    record(judgeThirtyFirst(oneTooMany, UPLOADS_PER_DAY, SENTENCE, SQLSTATE));
    say("");

    // ---- a refusal costs nothing ----------------------------------------
    // Done AFTER the limit is reached, on a task that already has three, so the
    // refusal is the per-task limit and not the daily one. A fourth file is
    // refused; then one place is freed and an upload must still be allowed.
    say("4. a refusal that is not the daily limit costs no slot");
    const fourth = await upload(made[0], "fourth.png", bob);
    await removeFile(made[0], "f1.png", bob);
    const afterFreeing = await upload(made[0], "replacement.png", bob);
    record(judgeRefusalCostsNothing(fourth, afterFreeing));
    say("");
  }

  // ---- a delete costs nothing -------------------------------------------
  say("5. deleting a file costs no slot");
  if (tasksMade !== TASKS_NEEDED || skipLimit) {
    record([
      {
        what: "deleting a file costs no slot",
        verdict: UNVERIFIED,
        detail: skipLimit ? "--skip-limit was passed" : "the setup did not complete",
      },
    ]);
  } else {
    const tasks = await myTasks(bob);
    const last = tasks.length > 0 ? tasks[tasks.length - 1].id : null;
    if (last === null) {
      record([
        { what: "deleting a file costs no slot", verdict: UNVERIFIED, detail: "no task to use" },
      ]);
    } else {
      const names = await listFiles(last, bob);
      if (names.length === 0) {
        record([
          { what: "deleting a file costs no slot", verdict: UNVERIFIED, detail: "no file to delete" },
        ]);
      } else {
        const deleted = await removeFile(last, names[0].split("/").pop(), bob);
        const after = await upload(last, "after-delete.png", bob);
        record(judgeDeleteCostsNothing(deleted, after));
      }
    }
  }
  say("");

  // ---- the restore case --------------------------------------------------
  say("6. the service-role restore, which this script cannot do");
  record(judgeRestoreCase());
  say("");
} finally {
  say("7. tidying up -- files first, then the tasks");
  const { filesRemoved, tasksRemoved } = await cleanup(bob);
  say(`  ${filesRemoved} file(s), ${tasksRemoved} task(s)`);
  record(judgeCleanup(filesRemoved, tasksRemoved, tasksMade));
  say("");

  say("8. what this run actually did");
  record(judgeTouchedNothingElse(REQUEST_LOG));
  record(judgeNothingLeaked(PRINTED, PLACEHOLDERS));
  await signOut(bob);
  say("");

  const total = passes + failures + unverified;
  console.log(`${passes} PASS, ${failures} FAIL, ${unverified} UNVERIFIED (${total} judgements).`);
  console.log("");
  console.log("WHAT THIS RUN CANNOT TELL YOU:");
  console.log("  * anything about production. Nothing here touches it.");
  console.log("  * that a service-role restore is uncounted. This script holds no such key");
  console.log("    and must not -- section 6 names what established it instead.");
  console.log("  * what any screen says. No page is opened by this script.");
  console.log("");
  // WHAT WAS ACTUALLY OBSERVED, not what was assumed. The first version of this
  // notice said Bob's allowance was spent whatever happened -- and on 12 October
  // 2026 it said that after a run in which NOTHING WAS COUNTED, because the
  // trigger was taking its no-uploader branch on every insert. A closing line
  // that reports a side effect it has not checked is a line that teaches the
  // reader to distrust the whole report.
  //
  // So it reports the one thing it can see from outside: whether the limit
  // refused anything. The count itself is not readable from here -- no client
  // role may select usage_counts, by design -- and this says that rather than
  // implying it looked.
  if (skipLimit) {
    console.log("BOB'S ALLOWANCE WAS NOT TOUCHED: --skip-limit was passed, so no upload");
    console.log("beyond the setup was attempted.");
  } else if (limitRefusedSomething === true) {
    console.log("AND BOB'S DAILY UPLOAD ALLOWANCE IS NOW SPENT. That is OBSERVED rather than");
    console.log("assumed: the limit refused an upload in this run, which it can only do once");
    console.log(`${UPLOADS_PER_DAY} have been counted. Nothing in this project can reset a count in`);
    console.log("usage_counts -- service_role deliberately holds no privilege on it -- so it");
    console.log("returns at 00:00 UTC. Use --skip-limit for a run that must not do that.");
  } else if (limitRefusedSomething === false) {
    console.log(`BOB'S ALLOWANCE IS PROBABLY UNSPENT, AND THAT IS A FINDING RATHER THAN GOOD NEWS:`);
    console.log(`${UPLOADS_PER_DAY + 1} uploads were accepted and the limit refused NOTHING, so either the`);
    console.log("migration is not applied or the trigger is not counting what it should.");
    console.log("Section 3 above is the evidence. This exact state was seen on staging on");
    console.log("12 October 2026, and the cause was that the insert which commits carries no");
    console.log("session -- evidence/build-it-25-upload-count.md.");
  } else {
    console.log("WHETHER BOB'S ALLOWANCE WAS SPENT IS UNKNOWN: this run did not get far enough");
    console.log("to find out, and no client role may read usage_counts to check.");
  }
}

process.exit(failures > 0 ? 1 : 0);
