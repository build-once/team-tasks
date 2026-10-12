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
// So section 5 PRINTS THE EXACT STATUS AND THE EXACT BODY of the thirty-first
// upload, whatever they are.
//
// AND ON 12 OCTOBER 2026 IT ANSWERED, which is why this script now has a fixture
// of its real shape rather than an invented one:
//
//   HTTP 500
//   {"statusCode":"500","error":"DatabaseError",
//    "message":"database error, code: 54000","code":"DatabaseError"}
//
// THE SENTENCE DOES NOT SURVIVE. The SQLSTATE does, inside a message string. So
// the screen cannot use the words the database chose, and the migration's own
// section 6 option 1 is what it has instead -- ask attachments_may_add() after a
// refusal. Section 2 of this script is what tells the two refusals apart from
// outside, and it is why that check now asserts the ABSENCE of 54000 rather than
// merely "was it refused".
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
// WHOSE DAY IT SPENDS: `--as`, AND IT IS REQUIRED
// ---------------------------------------------------------------------------
//
// IT SPENDS ONE PERSON'S WHOLE DAILY ALLOWANCE AND CANNOT GIVE IT BACK. A count
// in usage_counts is removed only by its own 7-day window; nothing in this
// project can reset one, and `service_role` deliberately holds no privilege on
// that table (20261008115900_usage_counts.sql section 2). So whoever this script
// uses cannot upload again until 00:00 UTC.
//
// SO THE ACCOUNT IS NAMED AND HAS NO DEFAULT: `--as alice | bob | carol`. It was
// hard-coded to Bob until 2026-10-12, which was fine until the day Bob's
// allowance was already spent by the run that found the no-session bug -- a
// hard-coded account is an account you cannot move off when it runs out.
//
// NO PASSWORD ON A COMMAND LINE, EVER. The addresses and passwords are read from
// the ENVIRONMENT and never from an argument, so
// `source ~/.config/team-tasks/staging.env` puts all three in place and `--as`
// picks one. Nothing secret reaches a shell history or `ps`.
//
// `--skip-limit` leaves sections 2 to 5 out for a run that must not spend a day.
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
//   source ~/.config/team-tasks/staging.env
//   node scripts/staging/build-it-25-upload-count-checks.mjs --as carol
//       Against staging. Needs web/.env.local for the URL and the publishable
//       key, and that person's two environment variables. `--as` is REQUIRED and
//       has no default, and no password is ever an argument.
//
//   node scripts/staging/build-it-25-upload-count-checks.mjs --as carol --cleanup
//       Removes this script's files and then its tasks, and reports both counts.
//
//   node scripts/staging/build-it-25-upload-count-checks.mjs --as carol --skip-limit
//       Leaves out sections 2 to 5, so nobody's day is spent.
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

// EXACTLY THE LIMIT, ACCEPTED, AND NOTHING REFUSED ON THE WAY.
//
// THIS IS THE JUDGEMENT THAT PROVES A REFUSAL COSTS NO SLOT, and it replaces a
// pairwise check that could not. The old version uploaded a fourth file to a full
// task, freed a place, and asked whether the next upload was allowed -- which on
// 12 October 2026 compared two refusals that were BOTH the daily limit, because
// it ran after the limit was already reached. It passed for the wrong reason and
// then failed for the right one.
//
// The arithmetic is the proof instead. If the run accepts exactly `limit`
// uploads, and the refusals and deletes along the way cost nothing, then the next
// upload is the first one over -- so a run that reaches `limit` WITHOUT being
// refused early is a run in which nothing uncounted was counted. If the per-task
// refusal had spent a slot, this judgement would see a refusal before the end.
export function judgeAcceptedExactly(accepted, refusedEarly, limit) {
  const what = `exactly ${limit} uploads are accepted, and NOTHING is refused before the ${limit}th`;

  if (accepted === null) {
    return [{ what, verdict: UNVERIFIED, detail: "the run did not get far enough to count" }];
  }
  if (refusedEarly > 0) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `${accepted} accepted and ${refusedEarly} refused before reaching ${limit}. Either a` +
          ` refusal or a delete earlier in this run SPENT A SLOT -- which is the thing the count is` +
          ` not supposed to do -- or something other than the daily limit is refusing uploads.`,
      },
    ];
  }
  if (accepted !== limit) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail: `${accepted} were accepted, not ${limit}, so the boundary below means nothing`,
      },
    ];
  }
  return [
    {
      what,
      verdict: PASS,
      detail: `${accepted} accepted, 0 refused -- so the counter should read exactly ${limit}`,
    },
  ];
}

// THE PER-TASK REFUSAL, AND IT MUST NOT BE THE DAILY ONE.
//
// A fourth file on a task that already has three is refused by
// public.attachments_may_add() through the INSERT policy. A thirty-first upload
// is refused by the trigger. BOTH ARE REFUSALS AND THEY ARE NOT THE SAME THING,
// and a judgement that accepts either is the "one status for more than one
// meaning" fault this repository files as #174 -- committed here, in a check.
//
// WHAT TELLS THEM APART, from the owner's staging runs of 12 October 2026: the
// daily limit answers HTTP 500 with the SQLSTATE in the body --
// {"statusCode":"500","error":"DatabaseError","message":"database error, code: 54000",...}
// -- and the per-task limit answered HTTP 400.
//
// THE TEST IS THE ABSENCE OF THE SQLSTATE, not the presence of 400. A status is a
// weaker thing to depend on than the code the trigger actually raises, and if
// Storage ever changes what it returns for a policy refusal this check still
// reads correctly. The body is PRINTED either way, because what a policy refusal
// looks like from outside is not written down anywhere yet.
export function judgePerTaskRefusal(answer, sqlstate) {
  const what = "a FOURTH file on one task is refused, and NOT by the daily limit";

  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];

  if (answer.status < 400) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `HTTP ${answer.status}, ALLOWED. The per-task limit of 3 is not holding, so this run` +
          ` cannot tell a per-task refusal from a daily one.`,
      },
    ];
  }

  if (mentions(answer, sqlstate)) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `HTTP ${answer.status} and the body carries ${sqlstate}, so this was THE DAILY LIMIT and` +
          ` not the per-task one. The checks have run in the wrong order: the daily limit must not` +
          ` be reached until after this one. body=${answer.printable}`,
      },
    ];
  }

  return [
    {
      what,
      verdict: PASS,
      detail: `HTTP ${answer.status}, and no ${sqlstate} in the body`,
    },
    {
      // A SECOND JUDGEMENT THAT ONLY RECORDS. What a policy refusal looks like
      // from outside the Storage API is not written down anywhere, and the screen
      // pull request has to tell it from the other two.
      what: "and THIS IS WHAT A PER-TASK REFUSAL LOOKS LIKE from outside -- write it down",
      verdict: UNVERIFIED,
      detail: `HTTP ${answer.status} body=${answer.printable}`,
    },
  ];
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

// DELETING A FILE MAKES ROOM ON THE TASK, and costs no slot.
//
// Two different things, and the second is the one the arithmetic proves rather
// than this judgement: here we only need the delete to succeed and the next
// upload to be allowed. Whether the delete cost a DAILY slot is answered by
// judgeAcceptedExactly, which would see a refusal before the end if it had.
//
// IT RUNS WELL BEFORE THE LIMIT, which is what went wrong on 12 October 2026: run
// after the limit is reached, every upload is refused by the daily limit and this
// says "deleting cost a slot" when nothing of the kind happened.
export function judgeDeleteMakesRoom(deleted, nextOne, sqlstate) {
  const results = [];

  const whatDeleted = "a file can be deleted from a full task";
  if (deleted.error) {
    results.push({ what: whatDeleted, verdict: UNVERIFIED, detail: deleted.error });
    return results;
  }
  results.push({
    what: whatDeleted,
    verdict: deleted.status < 400 ? PASS : FAIL,
    detail: `HTTP ${deleted.status}`,
  });

  const what = "AND THE UPLOAD AFTER IT IS ALLOWED, so deleting made room";
  if (nextOne.error) {
    results.push({ what, verdict: UNVERIFIED, detail: nextOne.error });
    return results;
  }
  if (nextOne.status < 400) {
    results.push({ what, verdict: PASS, detail: `HTTP ${nextOne.status}` });
    return results;
  }
  results.push({
    what,
    verdict: FAIL,
    detail: mentions(nextOne, sqlstate)
      ? `HTTP ${nextOne.status} and the body carries ${sqlstate} -- THE DAILY LIMIT refused it, so` +
        ` this check ran too late. It belongs before the limit is reached.`
      : `HTTP ${nextOne.status} -- deleting a file did not make room on the task.` +
        ` body=${nextOne.printable}`,
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

// EVERY FILE ACCOUNTED FOR, AND THE ARITHMETIC SAID OUT LOUD.
//
// THIS IS THE ANSWER TO "29 file(s) removed when 30 uploads were accepted".
// On 12 October 2026 the cleanup reported 29 and nothing was lost: the run had
// uploaded 30 and DELETED ONE ITSELF, in the check that frees a place on a full
// task. The number was right and the report could not show it, which left the
// owner to work out whether a file had gone missing on staging.
//
// So the judgement now reconciles rather than counting: removed must equal
// accepted minus the ones this run deleted on purpose. A mismatch in either
// direction is a real finding -- fewer means something is left on staging, more
// means it removed something it did not make.
export function judgeCleanup(filesRemoved, tasksRemoved, tasksMade, accepted, deletedInRun) {
  const expected =
    accepted === null || deletedInRun === null ? null : accepted - deletedInRun;

  const results = [
    {
      what: "every file this run uploaded was removed, and the arithmetic adds up",
      verdict:
        filesRemoved === null || expected === null
          ? UNVERIFIED
          : filesRemoved === expected
            ? PASS
            : FAIL,
      detail:
        filesRemoved === null || expected === null
          ? "the cleanup could not be read, so run --cleanup"
          : filesRemoved === expected
            ? `${filesRemoved} removed = ${accepted} uploaded - ${deletedInRun} this run deleted itself`
            : `${filesRemoved} removed, but ${accepted} were uploaded and ${deletedInRun} were` +
              ` deleted during the run, so ${expected} was expected.` +
              (filesRemoved < expected
                ? " FEWER than expected: something is still on staging. Run --cleanup."
                : " MORE than expected: it removed something this run did not make."),
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
  // WHAT STAGING ACTUALLY RETURNED on 12 October 2026 for the thirty-first
  // upload. The sentence does NOT survive; the SQLSTATE does, inside a message
  // string. This is the fixture the screen pull request has to be written
  // against, so it is here by its real shape rather than an invented one.
  const refusalWithSqlstateOnly = ok(
    500,
    JSON.stringify({
      statusCode: "500",
      error: "DatabaseError",
      message: `database error, code: ${SQLSTATE}`,
      code: "DatabaseError",
    }),
  );
  // And a per-task refusal: a policy refusal, which on 12 October answered 400
  // and carries no SQLSTATE. Its body is not written down anywhere yet, which is
  // why the judgement prints it.
  const refusalWithoutSqlstate = ok(
    400,
    JSON.stringify({ statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" }),
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

  // --- exactly the limit, which is now what proves a refusal costs no slot
  expect("exactly thirty accepted, nothing refused early", judgeAcceptedExactly(30, 0, 30), [PASS]);
  expect(
    "THE WORLD WHERE A REFUSAL OR A DELETE SPENT A SLOT: refused before the end",
    judgeAcceptedExactly(28, 1, 30),
    [FAIL],
  );
  expect(
    "stopped short with nothing refused is unverified, not a pass",
    judgeAcceptedExactly(27, 0, 30),
    [UNVERIFIED],
  );
  expect("a run that never counted is unverified", judgeAcceptedExactly(null, 0, 30), [UNVERIFIED]);

  // --- the per-task refusal, which must not be the daily one
  expect(
    "AFTER: a fourth file refused, and no SQLSTATE in the body",
    judgePerTaskRefusal(refusalWithoutSqlstate, SQLSTATE),
    [PASS, UNVERIFIED],
  );
  expect(
    "THE WORLD OF 12 OCTOBER: it was the DAILY limit wearing a refusal's clothes",
    judgePerTaskRefusal(refusalWithEverything, SQLSTATE),
    [FAIL],
  );
  expect(
    "and the same for a body that carries only the SQLSTATE",
    judgePerTaskRefusal(refusalWithSqlstateOnly, SQLSTATE),
    [FAIL],
  );
  expect(
    "THE WORLD WHERE THE PER-TASK 3 IS NOT HOLDING",
    judgePerTaskRefusal(created, SQLSTATE),
    [FAIL],
  );
  expect(
    "a request that never arrived is unverified",
    judgePerTaskRefusal(unreachable, SQLSTATE),
    [UNVERIFIED],
  );

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
    "AND WHAT STAGING ACTUALLY RETURNED on 12 Oct: the SQLSTATE survives, the sentence does not",
    judgeThirtyFirst(refusalWithSqlstateOnly, 30, SENTENCE, SQLSTATE),
    [PASS, UNVERIFIED, UNVERIFIED, PASS],
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

  // --- deleting makes room
  expect("AFTER: delete, then upload", judgeDeleteMakesRoom(ok(200, "{}"), created, SQLSTATE), [
    PASS,
    PASS,
  ]);
  expect(
    "THE WORLD WHERE DELETING DOES NOT MAKE ROOM ON THE TASK",
    judgeDeleteMakesRoom(ok(200, "{}"), refusalWithoutSqlstate, SQLSTATE),
    [PASS, FAIL],
  );
  expect(
    "AND THE WORLD OF 12 OCTOBER: it ran too late, and the DAILY limit refused it",
    judgeDeleteMakesRoom(ok(200, "{}"), refusalWithEverything, SQLSTATE),
    [PASS, FAIL],
  );
  expect(
    "a delete that was itself refused",
    judgeDeleteMakesRoom(refusalWithoutSqlstate, created, SQLSTATE),
    [FAIL, PASS],
  );

  // --- the restore case
  expect("the restore case is reported, not skipped", judgeRestoreCase(), [UNVERIFIED]);

  // --- cleanup, and the arithmetic that explains "29 of 30"
  expect(
    "AFTER: 28 removed = 30 uploaded - 2 this run deleted",
    judgeCleanup(28, 11, 11, 30, 2),
    [PASS, PASS],
  );
  expect(
    "THE 12 OCTOBER NUMBER, now explained rather than puzzling: 29 = 30 - 1",
    judgeCleanup(29, 11, 11, 30, 1),
    [PASS, PASS],
  );
  expect(
    "THE WORLD WHERE A FILE IS LEFT ON STAGING: fewer removed than expected",
    judgeCleanup(27, 11, 11, 30, 2),
    [FAIL, PASS],
  );
  expect(
    "THE WORLD WHERE IT REMOVED SOMETHING IT DID NOT MAKE",
    judgeCleanup(30, 11, 11, 30, 2),
    [FAIL, PASS],
  );
  expect("THE WORLD WHERE TASKS WERE LEFT BEHIND", judgeCleanup(28, 4, 11, 30, 2), [PASS, FAIL]);
  expect("an unreadable cleanup is unverified", judgeCleanup(null, null, 11, null, null), [
    UNVERIFIED,
    UNVERIFIED,
  ]);

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

// ---------------------------------------------------------------------------
// WHOSE DAY TO SPEND: `--as`, AND IT IS REQUIRED
// ---------------------------------------------------------------------------
//
// This run spends one person's whole daily upload allowance and NOTHING CAN GIVE
// IT BACK -- no client role may write usage_counts, and its own 7-day window is
// the only thing that clears a row. So the account is not a default: naming it is
// how the person running this says which day they are willing to spend.
//
// IT WAS HARD-CODED TO BOB UNTIL 2026-10-12, which was fine until the day Bob's
// allowance was already spent by the run that found the no-session bug. A
// hard-coded account is an account you cannot move off when it runs out.
//
// NO PASSWORD ON A COMMAND LINE, EVER. The names below are environment variables
// and this script reads the environment, never an argument -- so the owner's
// `source ~/.config/team-tasks/staging.env` puts all three accounts in place and
// `--as carol` picks one. Nothing secret appears in a shell history, in `ps`, or
// in anything the guard reads.
const PEOPLE = {
  alice: { label: "Alice", emailVar: "ALICE_EMAIL", passwordVar: "ALICE_PASSWORD" },
  bob: { label: "Bob", emailVar: "BOB_EMAIL", passwordVar: "BOB_PASSWORD" },
  carol: { label: "Carol", emailVar: "CAROL_EMAIL", passwordVar: "CAROL_PASSWORD" },
};

// `--as carol` or `--as=carol`. Both, because a person typing one and getting a
// usage message for the other is friction for nothing.
function readWho(argv) {
  const joined = argv.find((a) => a.startsWith("--as="));
  if (joined) return joined.slice("--as=".length).trim().toLowerCase();
  const at = argv.indexOf("--as");
  if (at !== -1 && argv[at + 1] && !argv[at + 1].startsWith("--")) {
    return argv[at + 1].trim().toLowerCase();
  }
  return null;
}

const who = readWho(args);

if (who === null) {
  die(
    `say whose daily allowance to spend: --as alice | bob | carol\n` +
      `\n` +
      `IT IS NOT OPTIONAL AND HAS NO DEFAULT, because a full run spends that person's\n` +
      `whole upload allowance for the UTC day and nothing in this project can give it\n` +
      `back. Naming the account is how you say you meant to.\n` +
      `\n` +
      `  source ~/.config/team-tasks/staging.env\n` +
      `  node scripts/staging/build-it-25-upload-count-checks.mjs --as carol\n` +
      `\n` +
      `No password is ever passed as an argument: the addresses and passwords are read\n` +
      `from the environment. The logic check needs neither:\n` +
      `  node scripts/staging/build-it-25-upload-count-checks.mjs --selftest`,
  );
}

const PERSON = PEOPLE[who];
if (!PERSON) {
  die(`--as ${who} is not one of: ${Object.keys(PEOPLE).join(", ")}. No value is printed.`);
}

const missingFromEnv = [];
if ((process.env[PERSON.emailVar] ?? "").trim() === "") missingFromEnv.push(PERSON.emailVar);
if ((process.env[PERSON.passwordVar] ?? "") === "") missingFromEnv.push(PERSON.passwordVar);
if (missingFromEnv.length > 0) {
  die(
    `these are not set in the environment: ${missingFromEnv.join(", ")}.\n` +
      `See docs/environments.md -> "Where the test accounts live". No value is printed.\n` +
      `\n` +
      `  source ~/.config/team-tasks/staging.env\n` +
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

/**
 * This script's tasks, OLDEST FIRST.
 *
 * `order=created_at.asc` is not decoration: this said "newest first" and had no
 * `order=` at all, so PostgREST returned them in whatever order it liked. On 12
 * October 2026 the check that deletes a file picked `tasks[length - 1]`, got the
 * one task with no files on it, and reported "no file to delete" -- a check that
 * could not run, because of a comment that described an ordering nothing asked
 * for. A sentence in a comment is not an ORDER BY.
 */
async function myTasks(session) {
  const answer = await rest(
    "GET",
    `tasks?select=id,title&owner_id=eq.${session.userId}` +
      `&title=like.${encodeURIComponent(`${MARK}%`)}&order=created_at.asc&limit=200`,
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

  PERSON.session = await signIn(PERSON);
  const { filesRemoved, tasksRemoved, tasksSeen } = await cleanup(PERSON.session);
  console.log(`  ${filesRemoved} file(s) removed`);
  console.log(`  ${tasksRemoved} of ${tasksSeen} task(s) removed`);
  if (tasksRemoved < tasksSeen) {
    console.log("  SOME TASKS REMAIN. A task that still has a file cannot be deleted; run this again.");
  }
  await signOut(PERSON.session);
  console.log("");
  console.log("Nothing else was touched. No judgement was made.");
  console.log(`NOTE: ${PERSON.label}'s daily upload count is NOT reset by this -- nothing can reset it.`);
  console.log("It falls out of usage_counts' own 7-day window, and the allowance returns at 00:00 UTC.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

console.log("Build it 25 part 2b -- the daily upload count, against STAGING only");
console.log(`  project:  ${STAGING_HOST} (host checked exactly)`);
console.log(`  limit:    ${UPLOADS_PER_DAY} uploads per person per UTC day`);
console.log(`  as:       ${PERSON.label} -- named with --as, because this spends a day nothing can give back`);
console.log(`  creates:  ${TASKS_NEEDED} tasks and up to ${UPLOADS_PER_DAY + 1} files of ${PNG_BYTES.length} bytes`);
console.log(`  marks:    every task is titled "${MARK} …"`);
console.log("");
console.log("  Run BEFORE applying the migration and AFTER. Before, the count checks");
console.log("  MUST FAIL. Section 5 is the one that matters either way: it prints the");
console.log(`  exact status and body Storage returns for the ${UPLOADS_PER_DAY + 1}th upload.`);
console.log("");

PERSON.session = await signIn(PERSON);
let tasksMade = null;

// The arithmetic the cleanup reconciles against, and the answer to "29 file(s)
// removed when 30 uploads were accepted". Both are set by the run below.
let uploadsAccepted = null;
let filesDeletedInRun = null;

// Did the limit refuse anything in this run? null until section 3 has looked.
// The closing notice reports this rather than asserting a side effect it has not
// checked -- see the note beside that notice for why.
let limitRefusedSomething = null;

try {
  say(`1. ${TASKS_NEEDED} tasks to hang the files on`);
  const made = [];
  for (let i = 1; i <= TASKS_NEEDED; i += 1) {
    const answer = await rest("POST", "tasks?select=id", {
      accessToken: PERSON.session.accessToken,
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
    say("2-5. SKIPPED -- --skip-limit was passed, so nobody's day is spent.");
    record([
      {
        what: `the ${UPLOADS_PER_DAY + 1}th upload is refused, and what Storage says about it`,
        verdict: UNVERIFIED,
        detail: "--skip-limit was passed, so this was not run",
      },
    ]);
    say("");
  } else {
    // =====================================================================
    // THE ORDER OF WHAT FOLLOWS IS THE WHOLE FIX OF 2026-10-12
    // =====================================================================
    //
    // The cheap checks -- the per-task refusal, and deleting to make room --
    // RUN FIRST, while the person is nowhere near 30. Run after the limit is
    // reached, as they were on 12 October, every refusal in them is the daily
    // limit and they report the wrong thing twice over: one passed because it
    // only asked "was it refused", and the next failed for a cause it named
    // wrongly.
    //
    // Then the run to exactly 30, then the thirty-first, and NOTHING AFTER IT
    // THAT NEEDS AN UPLOAD.
    //
    // THE ARITHMETIC, worked out here rather than discovered in the output:
    //
    //   section 2 on task 0:  3 uploads, a fourth REFUSED (per-task),
    //                         one deleted, 1 upload, one deleted, 1 upload
    //                         -> 5 ACCEPTED, 2 deleted, task 0 holds 3
    //   section 3:            25 more, over tasks 1..9 at 3 each (task 9 gets 1)
    //                         -> 30 ACCEPTED in total
    //   section 4:            the 31st, to task 10, WHICH IS EMPTY -- so the only
    //                         thing that can refuse it is the daily limit
    //
    // AT THE END THE COUNTER SHOULD READ EXACTLY 30: thirty accepted uploads
    // counted once each, and nothing else counted -- not the per-task refusal,
    // not the two deletes, not the thirty-first.
    //
    // AND 28 FILES SHOULD EXIST: 30 uploaded minus the 2 this run deleted. That
    // is what section 6's reconciliation checks, and it is the thing that could
    // not be seen on 12 October, when "29 file(s)" was correct and unexplained.
    let accepted = 0;
    let refusedEarly = 0;
    let deletedInRun = 0;

    // ---- the cheap checks, BEFORE the limit -------------------------------
    say(`2. before the limit: a per-task refusal, and deleting to make room`);
    say(`   (${PERSON.label} is at 0, so nothing here can be the daily limit)`);

    for (let i = 1; i <= FILES_PER_TASK; i += 1) {
      const answer = await upload(made[0], `a${i}.png`, PERSON.session);
      if (!answer.error && answer.status < 400) accepted += 1;
      else refusedEarly += 1;
    }
    say(`   task 1 filled with ${FILES_PER_TASK} files; ${accepted} accepted so far`);

    // A fourth file on a full task. The per-task limit must refuse it, and the
    // judgement asserts it was NOT the daily one.
    const fourth = await upload(made[0], "a-fourth.png", PERSON.session);
    record(judgePerTaskRefusal(fourth, SQLSTATE));
    say("");

    // Free a place, then upload into it. Both of these are on task 1, whose
    // contents this run knows exactly -- no listing and no ordering involved,
    // which is the other half of what went wrong on 12 October.
    say("3. deleting a file makes room on the task");
    const freed = await removeFile(made[0], "a1.png", PERSON.session);
    if (!freed.error && freed.status < 400) deletedInRun += 1;
    const intoTheGap = await upload(made[0], "a-replacement.png", PERSON.session);
    if (!intoTheGap.error && intoTheGap.status < 400) accepted += 1;
    record(judgeDeleteMakesRoom(freed, intoTheGap, SQLSTATE));

    // And once more, so the count of accepted uploads is 5 and task 1 is full
    // again -- which keeps the arithmetic above exactly as written.
    const freedAgain = await removeFile(made[0], "a2.png", PERSON.session);
    if (!freedAgain.error && freedAgain.status < 400) deletedInRun += 1;
    const second = await upload(made[0], "a-replacement-2.png", PERSON.session);
    if (!second.error && second.status < 400) accepted += 1;
    say(`   ${accepted} accepted, ${deletedInRun} deleted by this run`);
    say("");

    // ---- up to exactly the limit -----------------------------------------
    say(`4. up to exactly ${UPLOADS_PER_DAY} accepted uploads`);
    let nextTask = 1;
    let onThisTask = 0;
    while (accepted < UPLOADS_PER_DAY && nextTask < TASKS_NEEDED - 1) {
      const answer = await upload(made[nextTask], `b${accepted + 1}.png`, PERSON.session);
      if (!answer.error && answer.status < 400) {
        accepted += 1;
        onThisTask += 1;
        if (onThisTask === FILES_PER_TASK) {
          nextTask += 1;
          onThisTask = 0;
        }
      } else {
        refusedEarly += 1;
        break;
      }
    }
    record(judgeAcceptedExactly(accepted, refusedEarly, UPLOADS_PER_DAY));
    say("");

    // ---- THE ONE OVER ----------------------------------------------------
    say(`5. THE ${UPLOADS_PER_DAY + 1}th UPLOAD, and what the Storage API makes of it`);
    say(`   it goes to task ${TASKS_NEEDED}, WHICH IS EMPTY -- so the per-task limit cannot be`);
    say(`   the cause and the daily limit is the only thing left`);
    const oneTooMany = await upload(made[TASKS_NEEDED - 1], "one-too-many.png", PERSON.session);
    // Recorded before the judgement, so the closing notice reports what arrived
    // rather than what the judgement made of it. An attempt that never arrived
    // leaves it null, which is "unknown" and not "no".
    limitRefusedSomething = oneTooMany.error ? null : oneTooMany.status >= 400;
    record(judgeThirtyFirst(oneTooMany, UPLOADS_PER_DAY, SENTENCE, SQLSTATE));
    say("");

    // NOTHING AFTER THIS NEEDS AN UPLOAD. Every upload from here would be
    // refused by the daily limit, and a check whose every answer is the same
    // answer is not a check.
    uploadsAccepted = accepted;
    filesDeletedInRun = deletedInRun;
  }

  // ---- the restore case --------------------------------------------------
  say("6. the service-role restore, which this script cannot do");
  record(judgeRestoreCase());
  say("");
} finally {
  say("7. tidying up -- files first, then the tasks");
  const { filesRemoved, tasksRemoved } = await cleanup(PERSON.session);
  say(`  ${filesRemoved} file(s), ${tasksRemoved} task(s)`);
  record(
    judgeCleanup(filesRemoved, tasksRemoved, tasksMade, uploadsAccepted, filesDeletedInRun),
  );
  say("");

  say("8. what this run actually did");
  record(judgeTouchedNothingElse(REQUEST_LOG));
  record(judgeNothingLeaked(PRINTED, PLACEHOLDERS));
  await signOut(PERSON.session);
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
    console.log("THE ALLOWANCE WAS NOT TOUCHED: --skip-limit was passed, so no upload");
    console.log("beyond the setup was attempted.");
  } else if (limitRefusedSomething === true) {
    console.log("AND THAT DAILY UPLOAD ALLOWANCE IS NOW SPENT. That is OBSERVED rather than");
    console.log("assumed: the limit refused an upload in this run, which it can only do once");
    console.log(`${UPLOADS_PER_DAY} have been counted. Nothing in this project can reset a count in`);
    console.log("usage_counts -- service_role deliberately holds no privilege on it -- so it");
    console.log("returns at 00:00 UTC. Use --skip-limit for a run that must not do that.");
  } else if (limitRefusedSomething === false) {
    console.log(`THE ALLOWANCE IS PROBABLY UNSPENT, AND THAT IS A FINDING RATHER THAN GOOD NEWS:`);
    console.log(`${UPLOADS_PER_DAY + 1} uploads were accepted and the limit refused NOTHING, so either the`);
    console.log("migration is not applied or the trigger is not counting what it should.");
    console.log("Section 3 above is the evidence. This exact state was seen on staging on");
    console.log("12 October 2026, and the cause was that the insert which commits carries no");
    console.log("session -- evidence/build-it-25-upload-count.md.");
  } else {
    console.log("WHETHER THE ALLOWANCE WAS SPENT IS UNKNOWN: this run did not get far enough");
    console.log("to find out, and no client role may read usage_counts to check.");
  }
}

process.exit(failures > 0 ? 1 : 0);
