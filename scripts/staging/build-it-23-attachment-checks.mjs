#!/usr/bin/env node
// build-it-23-attachment-checks.mjs -- do the DEPLOYED rules on the `attachments`
// bucket let exactly the right people read, upload and delete a file, and refuse
// everybody else? Run against STAGING only.
//
// Build it 23 part 1, the coach's review of PR #241, and issue #239's list.
//
// WHY IT EXISTS, AND WHY IT HAD TO BE RUN TWICE. PR #241 added a migration and
// nothing that used it: no screen, no Edge Function, no upload path. NOTHING WAS
// APPLIED BY THAT BRANCH -- the assistant applies nothing anywhere, and
// `supabase db push` against staging is the owner's step (rule 19). So this
// script was written to be run:
//
//   * BEFORE the apply, where it MUST FAIL. There is no bucket, so every request
//     answers 404 "Bucket not found" and section 2 reports it. Those failures are
//     the evidence that the rules were not there yet;
//   * AFTER the apply, where it must pass.
//
// A single green run proves nothing about the apply, because a check that was
// always green would look exactly the same. THE PAIR IS THE EVIDENCE. Section 2's
// first judgement says which of the two you are looking at, in those words.
//
// THAT PAIR HAS NOW HAPPENED, AND THIS IS WHAT A RUN MEANS AFTERWARDS. The owner
// applied the migration to staging on 9 October 2026; the run before it was
// 35 PASS / 12 FAIL / 1 UNVERIFIED and the run after it was 49 PASS / 2 FAIL,
// both recorded in evidence/build-it-23-attachments-bucket.md with the coach's
// read-back of the bucket between them. Production has it too, from the pipeline
// on the merge of PR #241.
//
// So a run today is no longer about the apply. It is a regression check over
// rules that are live in both projects -- and the two FAILs of the second run
// were defects in THIS FILE rather than in those rules. Both are fixed here
// (sections 14 and 15), which is the other reason to run it again.
//
// IT IS ALSO THE ONLY THING THAT CAN PROVE FOUR OF THE RULES AT ALL, which is the
// other reason it is in this pull request rather than later.
// evidence/build-it-23-attachments-bucket.md proves the policies on a local
// PostgreSQL sandbox, and a sandbox has no Supabase Storage in it: the bucket's
// own 5 MB and type limits are enforced by the Storage API and not by Postgres,
// so no sandbox run touches them, and `list` and a signed link do not exist there
// at all. Those are checks (8), (9), (5) and (6) below.
//
// ---------------------------------------------------------------------------
// WHAT ONE RUN UPLOADS, AND WHAT IT LEAVES BEHIND
// ---------------------------------------------------------------------------
//
// Asked for by name, because a check script that quietly fills a bucket is a
// check script nobody should run twice.
//
//   FILES STORED AT THE PEAK:        4  (3 on a team task, 1 on a personal task)
//   FILES STORED WHEN IT FINISHES:   0
//   TASKS CREATED:                   2      TASKS LEFT:  0
//   REQUESTS THAT CARRY FILE BYTES: 15 -- counted by hand in the session that
//                      changed section 14 from one probe into two checks, which
//                      added one. THE RUN PRINTS ITS OWN COUNT in its last
//                      section, and that is the number to trust: this one is a
//                      reader's estimate and the other is a measurement.
//   BYTES SENT:        5,243,7xx -- about 5.0 MiB, and 5,242,881 of them are the
//                      ONE deliberately oversized upload that check (8) needs.
//                      Everything else is a 70-byte PNG, a 4-byte stand-in for an
//                      executable and a 74-byte SVG.
//   BYTES RECEIVED BACK: under 1 KB -- one download and one signed-link open.
//
// The exact figures are COUNTED BY THE RUN and printed in its last section, so
// the number you read is the number that happened rather than this comment's
// arithmetic. `judgeLeftNothing` is the judgement that says the bucket and the
// task list are as the run found them, and it lists under both prefixes to say so.
//
// WHY 5 MB HAS TO BE SENT. The limit is the bucket's, so the only way to see it
// refuse is to offer it something too big. 5,242,881 bytes is one byte over, which
// is the smallest thing that can be refused for that reason.
//
// IF IT DIES HALFWAY the footprint is whatever it had reached, and the last
// section prints the exact `delete` statements for the operator. Nothing it
// creates is hidden: both task ids are printed, and both file paths are built
// from them.
//
// ---------------------------------------------------------------------------
// WHAT IT CANNOT ASK, so nobody reads a green run as more than it is (rule 8)
// ---------------------------------------------------------------------------
//
//   * WHETHER THE BYTES INSIDE A FILE ARE WHAT THE FILE CLAIMS. docs/plan.md is
//     explicit that the app promises the refusal and not the contents, and this
//     script cannot promise more. Check (10) uploads PNG bytes under a `.heic`
//     name ON PURPOSE for exactly that reason -- what is being tested there is
//     the DECLARED type, which is all Storage looks at.
//   * WHETHER A SIGNED LINK STOPS WORKING WHEN THE FILE GOES. It opens one link
//     while the file is there. Waiting five minutes to watch one expire, or
//     deleting a file and retrying a live link, is a longer run than this; both
//     are open questions in docs/plan.md and neither is answered here.
//   * ANYTHING ABOUT PRODUCTION. It refuses to run against anything but the
//     staging host, before it reads a password.
//   * ANYTHING ABOUT A SCREEN. Build it 23 part 2 adds one -- the files panel on
//     My tasks, with the upload box -- and nothing here opens a browser. What
//     this script and that screen share is the content-type table: section 14b
//     sends `image/heic` because that is what web/src/lib/attachments.ts would
//     send, so a green 14b says the app's choice works against the real service
//     and says nothing at all about the screen that makes it.
//   * AND -- BEFORE THE APPLY -- WHETHER A REFUSAL IS THE RULE'S OR THE MISSING
//     BUCKET'S. This is the one weakness worth stating plainly, because it is in
//     the output rather than hidden: sections 6, 7, 8, 11 and 12 report PASS on
//     a before-the-apply run, and they do it because a bucket that does not exist
//     refuses everybody, not because the rules refused anybody. A negative check
//     cannot tell those apart. What CAN tell them apart is section 2, which is
//     why it is first and why its FAIL says "every failure below it" in as many
//     words -- and the positive checks (3, 4, 10) which have to succeed and do
//     not. So: a before-run with section 2 red is the expected pair; a before-run
//     is NOT evidence that any rule refuses anybody.
//
// AND TWO THINGS IT NOW ANSWERS THAT IT USED TO ASK (9 October 2026):
//
//   * WHETHER A `.heic` NAME IS DECLARED AS image/heic. It is not. Section 14 was
//     one probe that passed if the upload was accepted; it is now two checks that
//     require it to be REFUSED without a content type and ACCEPTED with
//     `image/heic` set. The owner agreed to that change of expectation -- rule 20
//     -- and the long note above judgeHeicWithoutContentType says why it is not a
//     loosening.
//   * WHY SECTION 15 REPORTED A SIGNED LINK IN A BODY WHEN NO LINK WAS PRINTED.
//     Because a scrub applied when an answer arrives cannot catch a credential
//     that is born in that answer. See signedLinksIn and readStorageAnswer.
//
// IT CAN FAIL, which is the only reason to trust it passing. Every judgement is a
// pure function, and `--selftest` feeds those functions answers from a world where
// the migration was never applied -- a public bucket, no policies, a fourth file
// accepted, an SVG accepted, a rename that works, a task that deletes with a file
// still on it -- and requires each one to come out FAIL. That run needs no network,
// no account and no staging project:
//
//   node scripts/staging/build-it-23-attachment-checks.mjs --selftest
//
// AND IT GOES THROUGH THE REAL READING PATH, which is the lesson of
// build-it-20-ai-checks.mjs and is written here so it is not relearned. That
// script scrubbed a response BEFORE parsing it, so a judgement compared a
// placeholder with the string it stood for and reported a fault in a correct row;
// no selftest case could see it, because every case handed a judgement an object
// no scrub had ever touched. The owner's staging run of 7 October 2026 is where it
// showed up. So here: `readStorageBody`, `readRestBody` and `readBytes` are pure,
// and the live requests do nothing with a response except hand it to one of them --
// and the selftest drives judgements through those three from raw
// `{ status, raw }`, with the placeholders registered the way a real run registers
// them. Section S5 of the selftest is those cases.
//
// CI RUNS THAT SELFTEST. .github/workflows/ci.yml's `staging-script-selftests`
// job has a `run_and_count` line for this file and its own floor,
// EXPECTED_ATTACHMENT_CASES. The --selftest branch returns before any setting is
// read, so that job needs no secret, no account and no network -- the same as the
// four scripts beside it.
//
// NO PACKAGES. Node built-ins only -- global fetch, node:fs, node:path, node:url,
// node:buffer -- so Node 18 or newer. The endpoints, each one read off Supabase's
// own reference on 2026-10-08:
//
//   POST   {url}/auth/v1/token?grant_type=password   body {email,password}
//   POST   {url}/auth/v1/logout?scope=local
//   GET    {url}/rest/v1/{relation}?select=a,b&col=eq.value
//   POST   {url}/rest/v1/tasks                      body {title,team_id}
//   DELETE {url}/rest/v1/tasks?id=eq.{id}
//   POST   {url}/storage/v1/object/{bucket}/{path}        upload
//   GET    {url}/storage/v1/object/{bucket}/{path}        download
//   PUT    {url}/storage/v1/object/{bucket}/{path}        replace
//   DELETE {url}/storage/v1/object/{bucket}/{path}        delete
//   POST   {url}/storage/v1/object/list/{bucket}     body {prefix,limit}
//   POST   {url}/storage/v1/object/sign/{bucket}/{path}   body {expiresIn}
//   POST   {url}/storage/v1/object/move              body {bucketId,sourceKey,destinationKey}
//   GET    {url}/storage/v1/object/info/{bucket}/{path}   what Storage recorded
//
//   https://supabase.com/docs/reference/self-hosting-storage/upload-a-new-object
//   ...                                            /search-for-objects-under-a-prefix
//   ...                                            /generate-a-presigned-url-to-retrieve-an-object
//   ...                                            /moves-an-existing-file
//
//   The API key travels in the `apikey` header; Authorization carries the caller's
//   JWT. A SIGNED LINK CARRIES NEITHER, which is the point of check (6).
//
// WHAT IT NEVER PRINTS: a password, an access or refresh token, the publishable
// key, the project URL, a user id, an email address, or a signed link's token.
// Every response body goes through scrub() first. What does get printed: HTTP
// statuses, Storage's own error codes, the fixed sentence the task trigger
// raises, the two task ids this run created, and byte counts.
//
// Run it from the repository root. See the bottom of this file.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";

// The staging project's reference, and the exact host it is served at. This
// script may run against NOTHING ELSE. AGENTS.md rules 1 and 10.
//
// The HOST is what the guard decides on. `url.includes(STAGING_REF)` is not good
// enough and that is not a theory: it accepted a stand-in server at
// `http://127.0.0.1:8799/ghskxrhqlhvrhpnivqbd` in the coach's review of PR #115,
// and the script then sent two passwords to it. judgeStagingUrl below is
// build-it-18-invitation-status-checks.mjs's, unchanged.
const STAGING_REF = "ghskxrhqlhvrhpnivqbd";
const STAGING_HOST = `${STAGING_REF}.supabase.co`;

const UUID_CHARS =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const UUID_PATTERN = new RegExp(`^${UUID_CHARS}$`);

const BUCKET = "attachments";

// The migration's own numbers, copied here as this script's statement of the
// contract. If the migration changes one and this file does not, the run goes red,
// which is the point of copying rather than importing: a staging script cannot
// read a .sql file, and a number nobody checks is a number that drifts.
const MAX_FILE_BYTES = 5242880; // 5 * 1024 * 1024
const FILES_PER_TASK = 3;
const SIGNED_LINK_SECONDS = 300;

// The six types the bucket accepts, named one by one because `image/*` would admit
// image/svg+xml -- the coach's review of PR #241, and the owner's decision of
// 8 October 2026 to include HEIC. docs/plan.md, "Files attached to a task".
const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/pdf",
];

// Storage's own refusal codes, from
// https://supabase.com/docs/guides/storage/debugging/error-codes (read
// 2026-10-08). A refusal carrying something else is reported rather than counted
// as a pass: "refused" and "refused for the reason this check is about" are
// different results.
const INVALID_MIME = "InvalidMimeType";
const TOO_LARGE = "EntityTooLarge";
const BUCKET_NOT_FOUND = "Bucket not found";
// The `code` Storage puts in the body when the bucket is not there. Observed on
// staging on 8 October 2026, before the apply -- see judgeBucketExists for why
// the body and not the status is what this script reads.
const NO_SUCH_BUCKET = "NoSuchBucket";

// AND WHY EVERY "expected status" BELOW ALSO ACCEPTS 400. The same run showed
// Storage answering HTTP 400 with the real status inside the body, so the
// documented status for a refusal (400 for InvalidMimeType, 413 for
// EntityTooLarge) is what the BODY says and not necessarily what the HTTP line
// says. The discriminator this script relies on is therefore the error CODE in
// the body, which is what the error-codes page names; the status list is a
// sanity check around it rather than the check itself.
const REFUSAL_WRAPPER = 400;

// The sentence the trigger in the migration raises, character for character, and
// the SQLSTATE it raises it with. The message names no file and no count, which is
// docs/plan.md's rule about file names in errors -- judgeTaskDeleteRefused checks
// that too.
const TASK_HAS_FILES =
  "This task still has files. Remove its files first, then delete the task.";
const FOREIGN_KEY_VIOLATION = "23503";

// Everything this run makes is named from this, so a leftover is recognisable at a
// glance in the dashboard and can never be mistaken for somebody's real file.
const MARK = "bi23-check";

const MAX_REFUSAL_BODY = 400;

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
// The fixtures
// ---------------------------------------------------------------------------
//
// A real 1x1 PNG, so an accepted upload is a file a browser could actually draw
// rather than four bytes that happen to be allowed.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/WMmxY8AAAAASUVORK5CYII=",
  "base64",
);

// An SVG, which is the whole reason the bucket names its types instead of saying
// `image/*`. It carries a comment where a script would go: this file does not need
// to be dangerous to prove it is refused, and a check script should not carry a
// payload it would be embarrassing to have committed.
const SVG_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><!-- refused on purpose --></svg>',
  "utf8",
);

// The first two bytes of a Windows executable, and nothing else.
const EXE_BYTES = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);

// ONE byte over the bucket's limit, which is the smallest thing that can be
// refused for being too big. Zeros: the contents are not what is being tested.
const OVERSIZE_BYTES = Buffer.alloc(MAX_FILE_BYTES + 1);

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

// THE FIRST JUDGEMENT OF THE RUN, and the one that says which of the two runs you
// are looking at. Before `supabase db push` there is no bucket at all, and Storage
// answers 404 "Bucket not found" to everything -- so this FAIL is the expected
// result then, and the evidence that the rules were not there yet.
// IT DECIDES ON THE BODY AND NOT ON THE HTTP STATUS, and that is not a style
// choice -- it is this judgement's own bug, found by running the script against
// staging before the bucket existed on 8 October 2026. The first version asked for
// `answer.status === 404`, and the real answer is:
//
//   HTTP 400 {"statusCode":"404","error":"Bucket not found",
//             "message":"Bucket not found","code":"NoSuchBucket"}
//
// An HTTP 400 carrying a 404 INSIDE IT. So the headline judgement of the whole
// script -- the one that says which of the two runs you are looking at -- reported
// PASS when there was no bucket at all, which is precisely the failure this script
// exists to make impossible. `NoSuchBucket` is what Storage actually says, at
// whatever status it chooses to wrap it in.
export function judgeBucketExists(answer) {
  const what = `the bucket "${BUCKET}" exists on this project`;
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];

  const body = answer.printable ?? "";
  if (body.includes(NO_SUCH_BUCKET) || body.includes(BUCKET_NOT_FOUND)) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `HTTP ${answer.status} carrying "${BUCKET_NOT_FOUND}" (${NO_SUCH_BUCKET}).` +
          ` BEFORE THE APPLY THAT IS THE EXPECTED RESULT and this FAIL is the evidence --` +
          ` and so is every failure below it, because a bucket that is not there explains` +
          ` all of them. After the apply it means the migration did not create the bucket,` +
          ` or created it under another name`,
      },
    ];
  }
  return [
    {
      what,
      verdict: PASS,
      detail: `HTTP ${answer.status}, and Storage did not say ${NO_SUCH_BUCKET}`,
    },
  ];
}

// An upload that must be accepted. 200 and nothing else: Storage answers 200 with
// an Id and a Key on success.
export function judgeUploadAccepted(answer, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (answer.status === 200) {
    return [{ what, verdict: PASS, detail: "HTTP 200, the file is stored" }];
  }
  return [
    {
      what,
      verdict: FAIL,
      detail:
        `HTTP ${answer.status}, so it was refused: ` +
        (answer.printable ?? "").slice(0, MAX_REFUSAL_BODY),
    },
  ];
}

// An upload that must be refused, FOR A NAMED REASON. `expect` is the statuses and
// the Storage error code this check is about; a refusal carrying something else is
// a FAIL, because a check that passes on the wrong refusal is a check that was
// never run. The commonest way that would happen: a type or size probe refused by
// row-level security instead, which would mean the bucket's own limits were never
// reached at all.
export function judgeUploadRefused(answer, what, expect = {}) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  const body = answer.printable ?? "";

  if (answer.status === 200) {
    return [{ what, verdict: FAIL, detail: "HTTP 200 -- IT WAS ACCEPTED" }];
  }
  if (Array.isArray(expect.statuses) && !expect.statuses.includes(answer.status)) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `refused, but with HTTP ${answer.status} rather than ` +
          `${expect.statuses.join(" or ")}, so this check did not reach the rule it is` +
          ` about: ${body.slice(0, MAX_REFUSAL_BODY)}`,
      },
    ];
  }
  if (typeof expect.code === "string" && !body.includes(expect.code)) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `refused with HTTP ${answer.status}, but the body does not carry` +
          ` "${expect.code}", so this check did not reach the rule it is about:` +
          ` ${body.slice(0, MAX_REFUSAL_BODY)}`,
      },
    ];
  }
  return [
    {
      what,
      verdict: PASS,
      detail:
        `HTTP ${answer.status}` +
        (expect.code ? `, carrying ${expect.code}` : "") +
        " -- refused",
    },
  ];
}

// A list that must contain a file. The list endpoint answers an array of objects
// whose `name` is relative to the prefix asked for.
export function judgeCanList(answer, fileName, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (!Array.isArray(answer.parsed)) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `HTTP ${answer.status} and the body is not a JSON array: ` +
          (answer.printable ?? "").slice(0, MAX_REFUSAL_BODY),
      },
    ];
  }
  const names = answer.parsed.map((row) => row?.name).filter((n) => typeof n === "string");
  if (names.includes(fileName)) {
    return [
      { what, verdict: PASS, detail: `HTTP ${answer.status}, ${names.length} entry(ies), including it` },
    ];
  }
  return [
    {
      what,
      verdict: FAIL,
      detail: `HTTP ${answer.status}, ${names.length} entry(ies), and the file is NOT among them`,
    },
  ];
}

// A list that must NOT contain the file. An empty array and a refusal are both
// right; the file appearing is the only wrong answer. Supabase's own documentation
// says only that listing "may" want a different SELECT policy from reading, so
// which of the two shapes staging gives is reported rather than required.
export function judgeCannotList(answer, fileName, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (answer.status !== 200) {
    return [
      { what, verdict: PASS, detail: `HTTP ${answer.status} -- refused outright, not even an empty list` },
    ];
  }
  if (!Array.isArray(answer.parsed)) {
    return [
      {
        what,
        verdict: FAIL,
        detail: `HTTP 200 and a body that is not a JSON array, so what it returned is unclear`,
      },
    ];
  }
  const names = answer.parsed.map((row) => row?.name).filter((n) => typeof n === "string");
  if (names.includes(fileName)) {
    return [{ what, verdict: FAIL, detail: "HTTP 200 AND THE FILE IS IN THE LIST" }];
  }
  return [
    { what, verdict: PASS, detail: `HTTP 200 with ${names.length} entry(ies), and the file is not one` },
  ];
}

// A download that must work, and must hand back the bytes that went up. The
// comparison is on length and on the first bytes, so a 404 page served with a 200
// cannot pass for a PNG.
export function judgeCanDownload(answer, expected, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (answer.status !== 200) {
    return [{ what, verdict: FAIL, detail: `HTTP ${answer.status}, so it could not be opened` }];
  }
  if (answer.byteLength !== expected.length) {
    return [
      {
        what,
        verdict: FAIL,
        detail: `HTTP 200 but ${answer.byteLength} bytes came back, not ${expected.length}`,
      },
    ];
  }
  if (!answer.sameAs(expected)) {
    return [
      { what, verdict: FAIL, detail: `HTTP 200 and the right length, but the bytes are different` },
    ];
  }
  return [{ what, verdict: PASS, detail: `HTTP 200, ${answer.byteLength} bytes, byte for byte` }];
}

// A download that must not work.
export function judgeCannotDownload(answer, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (answer.status === 200) {
    return [
      { what, verdict: FAIL, detail: `HTTP 200 -- ${answer.byteLength} bytes came back` },
    ];
  }
  return [{ what, verdict: PASS, detail: `HTTP ${answer.status} -- refused` }];
}

// A signed link that must be issued. The response is { signedURL: "/object/sign/..." }
// and the token in it is a credential for five minutes, so the URL is never printed.
export function judgeSigned(answer, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (answer.status !== 200) {
    return [
      {
        what,
        verdict: FAIL,
        detail: `HTTP ${answer.status}: ${(answer.printable ?? "").slice(0, MAX_REFUSAL_BODY)}`,
      },
    ];
  }
  const url = answer.parsed?.signedURL;
  if (typeof url !== "string" || url === "") {
    return [{ what, verdict: FAIL, detail: "HTTP 200 but no signedURL in the body" }];
  }
  if (!url.includes("token=")) {
    return [{ what, verdict: FAIL, detail: "HTTP 200 and a signedURL with no token in it" }];
  }
  return [
    {
      what,
      verdict: PASS,
      detail: `HTTP 200 and a signed link was issued (not printed: it is a credential for ${SIGNED_LINK_SECONDS}s)`,
    },
  ];
}

// A signed link that must NOT be issued.
export function judgeCannotSign(answer, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (answer.status === 200 && typeof answer.parsed?.signedURL === "string") {
    return [{ what, verdict: FAIL, detail: "HTTP 200 AND A SIGNED LINK WAS ISSUED" }];
  }
  return [{ what, verdict: PASS, detail: `HTTP ${answer.status} -- no link` }];
}

// THE SHARP EDGE OF THE DESIGN, checked rather than described. A signed link
// carries no key and no session: for its five minutes, whoever holds it can open
// the file. This is a PASS when the link works with no credentials at all, because
// that is what docs/plan.md says it does -- and a reader who expected otherwise
// should read "Links, and what an unexpired one allows".
export function judgeSignedLinkOpens(answer, expected, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (answer.status !== 200) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `HTTP ${answer.status}. The link did not open with no credentials -- which is` +
          ` NOT what docs/plan.md describes, so either the plan or this run is wrong`,
      },
    ];
  }
  if (answer.byteLength !== expected.length || !answer.sameAs(expected)) {
    return [
      {
        what,
        verdict: FAIL,
        detail: `HTTP 200 but ${answer.byteLength} bytes, which are not the file that went up`,
      },
    ];
  }
  return [
    {
      what,
      verdict: PASS,
      detail:
        `HTTP 200 with no apikey and no Authorization header: ${answer.byteLength} bytes.` +
        ` The link IS the permission, for ${SIGNED_LINK_SECONDS} seconds`,
    },
  ];
}

// A delete that must be refused. Storage answers a delete nothing permits with a
// refusal rather than a quiet 200, which is what makes this checkable.
export function judgeDeleteRefused(answer, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (answer.status === 200) {
    return [{ what, verdict: FAIL, detail: "HTTP 200 -- THE FILE WAS DELETED" }];
  }
  return [
    {
      what,
      verdict: PASS,
      detail: `HTTP ${answer.status} -- refused: ${(answer.printable ?? "").slice(0, 120)}`,
    },
  ];
}

export function judgeDeleteAccepted(answer, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (answer.status === 200) return [{ what, verdict: PASS, detail: "HTTP 200 -- deleted" }];
  return [
    {
      what,
      verdict: FAIL,
      detail: `HTTP ${answer.status}: ${(answer.printable ?? "").slice(0, MAX_REFUSAL_BODY)}`,
    },
  ];
}

// Replace, and rename. There is no UPDATE policy on storage.objects, so neither is
// permitted for anybody -- and the rename is the one that matters most, because
// `name` is where the task id lives: a permitted rename would be a permitted move
// of a file from one task to another, past every rule in the migration.
export function judgeReplaceRefused(answer, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (answer.status === 200) {
    return [
      { what, verdict: FAIL, detail: "HTTP 200 -- THE FILE'S BYTES WERE REPLACED UNDER ITS NAME" },
    ];
  }
  return [{ what, verdict: PASS, detail: `HTTP ${answer.status} -- refused` }];
}

export function judgeRenameRefused(answer, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (answer.status === 200) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          "HTTP 200 -- THE FILE WAS MOVED. A rename changes the first segment of the path," +
          " which is the task id, so this would move a file between tasks",
      },
    ];
  }
  return [{ what, verdict: PASS, detail: `HTTP ${answer.status} -- refused` }];
}

// The task cannot be deleted while a file remains, and the refusal must say so
// without naming the file. Two things are checked, and the second is a rule rather
// than a nicety: docs/plan.md forbids a file name in an error, because a file name
// is free text somebody's phone chose.
export function judgeTaskDeleteRefused(answer, fileName, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  const body = answer.printable ?? "";

  if (answer.status >= 200 && answer.status < 300) {
    const rows = Array.isArray(answer.rows) ? answer.rows.length : "an unknown number of";
    return [
      {
        what,
        verdict: FAIL,
        detail: `HTTP ${answer.status} -- THE TASK WAS DELETED, with ${rows} row(s) returned, while a file was still on it`,
      },
    ];
  }
  if (!body.includes(TASK_HAS_FILES)) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `refused with HTTP ${answer.status}, but not by the trigger: the body does not` +
          ` carry the sentence the migration raises, so something else refused it --` +
          ` ${body.slice(0, MAX_REFUSAL_BODY)}`,
      },
    ];
  }
  const leaked = body.includes(fileName);
  return [
    {
      what,
      verdict: leaked ? FAIL : PASS,
      detail: leaked
        ? `refused with the right sentence, BUT THE BODY NAMES THE FILE, which docs/plan.md forbids`
        : `HTTP ${answer.status}${body.includes(FOREIGN_KEY_VIOLATION) ? ` (${FOREIGN_KEY_VIOLATION})` : ""},` +
          ` the migration's own sentence, and no file name in it`,
    },
  ];
}

// THE TIDY-UP'S OWN JUDGEMENT, and the third bug the staging run of 8 October 2026
// found. Section 15 used judgeTaskDeleteAccepted, which requires exactly one row
// back -- and before the apply, section 13's delete SUCCEEDS (there are no files to
// refuse it), so by the time the tidy-up runs that task is already gone and
// PostgREST answers 200 with zero rows. The tidy-up then reported a FAIL for having
// nothing to do, which is noise standing exactly where a real leftover would show.
//
// So: zero rows and one row are both right here, and they are reported differently.
// What would be wrong is a refusal, which means something is still holding the task.
export function judgeTidiedTask(answer, taskId, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (answer.status >= 200 && answer.status < 300) {
    const rows = answer.rows?.length ?? 0;
    return [
      {
        what,
        verdict: PASS,
        detail:
          rows === 1
            ? `HTTP ${answer.status}, one row deleted`
            : `HTTP ${answer.status}, nothing to delete -- it had already gone, which is` +
              ` what happens before the apply, when section 13's delete is not refused`,
      },
    ];
  }
  return [
    {
      what,
      verdict: FAIL,
      detail:
        `HTTP ${answer.status}, so this run could NOT remove the task it created:` +
        ` ${(answer.printable ?? "").slice(0, MAX_REFUSAL_BODY)}`,
    },
  ];
}

export function judgeTaskDeleteAccepted(answer, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (answer.status >= 200 && answer.status < 300 && (answer.rows?.length ?? 0) === 1) {
    return [{ what, verdict: PASS, detail: `HTTP ${answer.status}, one row deleted` }];
  }
  if (answer.status >= 200 && answer.status < 300) {
    return [
      {
        what,
        verdict: FAIL,
        detail: `HTTP ${answer.status} but ${answer.rows?.length ?? 0} rows came back, not 1`,
      },
    ];
  }
  return [
    {
      what,
      verdict: FAIL,
      detail: `HTTP ${answer.status}: ${(answer.printable ?? "").slice(0, MAX_REFUSAL_BODY)}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// HEIC: TWO CHECKS, AND THE EXPECTATION OF THE FIRST ONE IS REVERSED
// ---------------------------------------------------------------------------
//
// WHAT THIS USED TO BE, AND WHY IT CHANGED. There was one judgement here,
// judgeHeicByExtension, and it was a PROBE rather than a rule: docs/plan.md
// recorded as NOT CONFIRMED whether Supabase declares a `.heic` file as
// `image/heic`, issue #239 asked for one upload to settle it, and the judgement
// answered PASS if the upload was accepted.
//
// THE OWNER'S STAGING RUN OF 9 OCTOBER 2026 SETTLED IT, AND THE ANSWER IS NO. A
// `.heic` name with no content type set by the caller is refused with
// `InvalidMimeType`. Supabase works the declared type out from the extension --
// "By default, Supabase Storage determines content type from the file extension.
// You can override this with the `contentType` option"
// (https://supabase.com/docs/guides/storage/uploads/standard-uploads) -- and it
// does not map that one. So an iPhone photograph, which is the commonest thing
// this feature exists for and the reason the owner added HEIC to the bucket's
// list at all, was refused by the very bucket that was widened to accept it.
//
// SO THE EXPECTATION IS THE OTHER WAY ROUND NOW, AND THE OWNER AGREED TO THAT
// CHANGE. AGENTS.md rule 20 is the reason this paragraph exists: a test is never
// changed to make a run go green, and a test somebody was allowed to change gets
// its own line in the pull request saying what changed and who agreed to it. The
// owner agreed on 9 October 2026, and the pull request says so.
//
// IT IS NOT A LOOSENING, WHICH IS WHAT RULE 20 IS ACTUALLY ABOUT. The old
// judgement asserted a thing that is false of staging, so it could never pass; it
// was not catching a fault, it was recording an unanswered question. The two
// below assert MORE than it did:
//
//   14a  without a content type, a .heic upload is REFUSED, and refused for the
//        type -- which pins the finding, so a future Supabase that started
//        mapping the extension would turn this red and somebody would read why.
//   14b  WITH `image/heic` set by the caller, the same bytes under the same name
//        are ACCEPTED. This is the half that matters: it is the thing the app's
//        upload path now does, proved against the real service.
//
// PNG bytes under a .heic name in both, on purpose. What is being tested is the
// DECLARED type, which is all Storage looks at -- docs/plan.md is explicit that a
// renamed file gets through and that the app promises the refusal and never the
// contents.

// 14a. No content type: it must be refused, and refused for the type.
export function judgeHeicWithoutContentType(answer, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];

  const body = answer.printable ?? "";

  if (answer.status === 200) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          "HTTP 200 -- IT WAS ACCEPTED, which is the opposite of what the owner's run of" +
          " 9 October 2026 found. Either Supabase now maps the .heic extension, or this" +
          " upload set a content type after all. If it is the first, the app no longer" +
          " needs to set the type for HEIC -- read TYPE_BY_EXTENSION in" +
          " web/src/lib/attachments.ts before changing anything, because it is still" +
          " right for every other extension",
      },
    ];
  }
  if (!body.includes(INVALID_MIME)) {
    return [
      {
        what,
        verdict: FAIL,
        detail:
          `refused with HTTP ${answer.status}, but not for the TYPE: the body does not` +
          ` carry "${INVALID_MIME}", so this check did not reach the thing it is about --` +
          ` ${body.slice(0, MAX_REFUSAL_BODY)}`,
      },
    ];
  }
  return [
    {
      what,
      verdict: PASS,
      detail:
        `HTTP ${answer.status} ${INVALID_MIME} -- refused. Supabase does not declare a` +
        ` .heic name as image/heic, which is why this app sets the content type for` +
        ` every upload. It did not make HEIC work all the same -- issue #246`,
    },
  ];
}

// 14b. With `image/heic` set by the caller: it must be accepted.
//
// WHAT A PASS HERE DOES AND DOES NOT MEAN, since the owner's screen check of
// 9 October 2026. It means THE BUCKET accepts the type when a caller declares
// it. It does NOT mean a person can attach a HEIC photograph: one was tried
// through the app that day and failed, the cause was not found, and the app no
// longer offers the type (issue #246). A pass here says the fault is on this
// app's side of the line, which is the useful half of an unanswered question.
export function judgeHeicWithContentType(answer, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];

  if (answer.status === 200) {
    return [
      {
        what,
        verdict: PASS,
        detail:
          "HTTP 200 -- stored. The six named types include image/heic and the caller said" +
          " so, which is exactly what web/src/app/tasks/AttachFile.tsx does",
      },
    ];
  }
  const body = answer.printable ?? "";
  return [
    {
      what,
      verdict: FAIL,
      detail: body.includes(INVALID_MIME)
        ? `HTTP ${answer.status} ${INVALID_MIME} -- REFUSED EVEN WITH image/heic SET, so the` +
          ` bucket's own list does not hold it and the owner's HEIC decision is not in the` +
          ` database. Check allowed_mime_types on the bucket row`
        : `HTTP ${answer.status}: ${body.slice(0, MAX_REFUSAL_BODY)}`,
    },
  ];
}

// What Storage recorded about a stored file. docs/plan.md marks TWO things about
// this not confirmed -- whether the declared type is recorded, and whether a
// last-opened time exists ([#232]) -- and this reports what the info endpoint
// actually says rather than deciding anything.
export function judgeRecordedInfo(answer, what) {
  if (answer.error) return [{ what, verdict: UNVERIFIED, detail: answer.error }];
  if (answer.status !== 200 || answer.parsed === null) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail:
          `HTTP ${answer.status} with no readable body, so this run learned nothing about` +
          ` what Storage records`,
      },
    ];
  }
  const keys = Object.keys(answer.parsed).sort();
  const metadataKeys =
    answer.parsed.metadata && typeof answer.parsed.metadata === "object"
      ? Object.keys(answer.parsed.metadata).sort()
      : [];
  return [
    {
      what,
      verdict: PASS,
      detail:
        `HTTP 200. Fields: ${keys.join(", ") || "(none)"}` +
        (metadataKeys.length ? `; metadata: ${metadataKeys.join(", ")}` : "") +
        `. This is a REPORT, not a rule -- it is what issues #231 and #232 ask to be read`,
    },
  ];
}

// The bucket and the task list are as the run found them. Two prefixes listed and
// two task reads, and every one of them must be empty.
export function judgeLeftNothing(listAnswers, taskRead, what) {
  const unreachable = listAnswers.filter((a) => a.error);
  if (unreachable.length > 0) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail: `${unreachable.length} of the tidy-up reads did not arrive: ${unreachable[0].error}`,
      },
    ];
  }
  let left = 0;
  for (const answer of listAnswers) {
    if (Array.isArray(answer.parsed)) left += answer.parsed.length;
    else if (answer.status === 200) {
      return [
        { what, verdict: UNVERIFIED, detail: "a tidy-up list answered 200 with a body that is not an array" },
      ];
    }
  }
  const tasksLeft = taskRead.error ? null : (taskRead.rows?.length ?? 0);
  if (tasksLeft === null) {
    return [{ what, verdict: UNVERIFIED, detail: `the task read did not arrive: ${taskRead.error}` }];
  }
  if (left === 0 && tasksLeft === 0) {
    return [
      {
        what,
        verdict: PASS,
        detail: "0 files under both of this run's prefixes, and 0 of its tasks left",
      },
    ];
  }
  return [
    {
      what,
      verdict: FAIL,
      detail:
        `${left} file(s) and ${tasksLeft} task(s) left behind. The exact delete statements are` +
        ` printed at the end of this run`,
    },
  ];
}

// Did this run touch only what it said it would? Every request is logged by path,
// and a path outside this list is a request nobody asked for.
export function judgeTouchedNothing(log) {
  const what = "this run touched only auth, public.tasks and the attachments bucket";
  const allowed = [
    "/auth/v1/token",
    "/auth/v1/logout",
    "/rest/v1/tasks",
    `/storage/v1/object/${BUCKET}/`,
    `/storage/v1/object/list/${BUCKET}`,
    `/storage/v1/object/sign/${BUCKET}/`,
    `/storage/v1/object/info/${BUCKET}/`,
    "/storage/v1/object/move",
    "a signed link",
  ];
  const strays = log.filter((entry) => !allowed.some((prefix) => entry.path.startsWith(prefix)));
  if (strays.length > 0) {
    return [
      {
        what,
        verdict: FAIL,
        detail: `${strays.length} request(s) to something else, the first being ${strays[0].method} ${strays[0].path}`,
      },
    ];
  }
  const buckets = log.filter((e) => e.path.startsWith("/storage/v1/object/") && !e.path.includes(BUCKET) && !e.path.includes("move"));
  if (buckets.length > 0) {
    return [
      { what, verdict: FAIL, detail: `${buckets.length} storage request(s) naming another bucket` },
    ];
  }
  return [
    {
      what,
      verdict: PASS,
      detail: `${log.length} request(s), every one of them to the paths this script documents`,
    },
  ];
}

// The migration's numbers and this script's numbers are the same numbers. A
// staging script cannot read a .sql file, so they are copied -- and a copy nobody
// checks is a copy that drifts.
export function judgeContractNumbers(maxBytes, perTask, seconds, types) {
  const out = [];
  out.push({
    what: "this script's 5 MB is the migration's 5242880 bytes",
    verdict: maxBytes === 5 * 1024 * 1024 ? PASS : FAIL,
    detail: `${maxBytes} bytes`,
  });
  out.push({
    what: "this script's per-task limit is 3",
    verdict: perTask === 3 ? PASS : FAIL,
    detail: `${perTask}`,
  });
  out.push({
    what: `a signed link lives ${SIGNED_LINK_SECONDS} seconds, which is docs/plan.md's five minutes`,
    verdict: seconds === 300 ? PASS : FAIL,
    detail: `${seconds}s`,
  });
  out.push({
    what: "the accepted types are six, named, and do NOT include a wildcard or SVG",
    verdict:
      types.length === 6 &&
      !types.some((t) => t.includes("*")) &&
      !types.includes("image/svg+xml")
        ? PASS
        : FAIL,
    detail: types.join(", "),
  });
  return out;
}

// ---------------------------------------------------------------------------
// Keeping tokens, addresses and signed links out of printed lines
// ---------------------------------------------------------------------------

const PLACEHOLDERS = [];

// ONCE PER VALUE. A signed link is now registered from the bytes of the answer
// that carries it, and a second answer could carry the same link -- the same
// file opened twice in one run -- so without this the list would grow a
// duplicate pair per request and section 15 would check the same value twice.
// Harmless either way; this just keeps the count in its detail line honest.
function remember(value, placeholder) {
  if (typeof value !== "string" || value === "") return;
  if (PLACEHOLDERS.some(([known]) => known === value)) return;
  PLACEHOLDERS.push([value, placeholder]);
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
// A CREDENTIAL THAT IS BORN IN AN ANSWER, which is the fourth bug the staging
// runs found and the one that needed this function
// ---------------------------------------------------------------------------
//
// THE OWNER'S RUN OF 9 OCTOBER 2026, after the apply: 49 PASS, 2 FAIL, and the
// second FAIL was section 15 reporting that "a signed link is in a body this run
// kept or printed" -- when the output printed no link at all. The coach read the
// pasted output and said so: "the script is keeping the sign response before the
// link is registered for scrubbing, or the check is judging its own kept copy."
//
// IT IS THE FIRST OF THOSE, EXACTLY. Every value this script scrubs is
// registered before the request that could carry it: an access token, a user id
// and an address all exist the moment somebody signs in, so `remember` is called
// in signIn and every body afterwards is scrubbed against them. A SIGNED LINK IS
// DIFFERENT IN KIND -- it does not exist until the answer that carries it
// arrives. So the order was:
//
//   1. ask for a link;
//   2. readStorageBody scrubs the body against the placeholders AS THEY ARE, and
//      the link is not among them;
//   3. BODIES_SEEN keeps that copy, with the live link in it;
//   4. section 5 then registers the link for every LATER body;
//   5. section 15 checks every kept body against the link and finds it in the
//      copy made at step 2.
//
// Nothing was printed, and the check was not wrong either: a live credential
// really was sitting in a string this run had kept. A scrub applied at the
// moment of arrival cannot catch a value that becomes known from that very
// arrival, and no number of extra `remember` calls after the fact can fix it --
// the copy is already made.
//
// SO THE LINK IS REGISTERED FROM THE BYTES, BEFORE THEY ARE READ. This function
// is the pure half of that: given the raw body, it answers with every string in
// it that carries a signed-link token. storageJson calls it on the text that
// arrived and registers what it finds, and only then hands the text to
// readStorageBody -- so by the time anything is kept or printed, the placeholder
// is in place.
//
// IT LOOKS FOR `token=` AND NOT FOR A FIELD NAME, on purpose. Supabase's
// createSignedUrl answers `{ signedURL: "/object/sign/...?token=..." }` and
// createSignedUrls answers an array of objects, so a field name would be two
// shapes to keep up with and a third would arrive unnoticed. What makes a string
// a credential here is the token in it, and that is what is looked for.
export function signedLinksIn(raw) {
  let value;
  try {
    value = JSON.parse(raw ?? "");
  } catch {
    return [];
  }

  const found = [];
  const visit = (node) => {
    if (typeof node === "string") {
      if (node.includes("token=")) found.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const item of Object.values(node)) visit(item);
    }
  };
  visit(value);
  return found;
}

// Nothing printed or kept may carry a live value.
//
// "OR KEPT" IS THE HONEST WORDING, and it is what this judgement has always
// checked: BODIES_SEEN holds the scrubbed copy of every answer, which is the set
// of strings this run COULD print, and a credential sitting in one of them is a
// fault whether or not a console.log happened to reach it. The sentence said
// "reached a printed line" until 9 October 2026, which is how the owner came to
// read a FAIL about a link that was never printed and have no way to tell
// whether the script or the scrub was at fault.
export function judgeNothingLeaked(bodies, secrets) {
  const what = "no token, address, user id or signed link reached a printed or kept line";
  const checked = secrets.filter(([value]) => value !== "");
  if (checked.length === 0) {
    return [
      {
        what,
        verdict: UNVERIFIED,
        detail: "there was nothing registered to look for, so a clean result proves nothing",
      },
    ];
  }
  for (const body of bodies) {
    for (const [value, name] of checked) {
      if ((body ?? "").includes(value)) {
        return [{ what, verdict: FAIL, detail: `${name} is in a body this run kept or printed` }];
      }
    }
  }
  return [
    {
      what,
      verdict: PASS,
      detail: `${bodies.length} body(ies) checked against ${checked.length} live value(s)`,
    },
  ];
}

// ---------------------------------------------------------------------------
// One response, three forms -- and WHICH ONE A JUDGEMENT GETS is the whole point
// ---------------------------------------------------------------------------
//
// These three are pure, they are exported, and every request below does nothing
// with a response except hand it to one of them. That is deliberate, and it is the
// lesson of build-it-20-ai-checks.mjs rather than a preference: the order the scrub
// ran in was wrong there from the day the file was written, and no selftest could
// see it, because every case handed a judgement an object no scrub had ever
// touched.
//
// So: PARSE THE BYTES THAT ARRIVED, and scrub only what is printed or kept. And
// --selftest drives judgements through these, from a raw { status, raw }, with the
// placeholders registered the way a real run registers them.

export function readStorageBody({ status, raw }, placeholders) {
  const text = raw ?? "";
  let parsed = null;
  try {
    const value = JSON.parse(text);
    parsed = typeof value === "object" && value !== null ? value : null;
  } catch {
    parsed = null;
  }
  return { status, body: text, parsed, printable: scrubWith(text, placeholders) };
}

// ONE FUNCTION THAT IS THE WHOLE ORDER, which is the shape the 9 October 2026
// failure argues for rather than two lines in a request helper.
//
// The bug was an ORDER: the sign response was kept, scrubbed against the
// placeholders as they then were, before the link in it was registered. A fix
// written as two statements inside `storageJson` would have been correct and
// unreachable -- storageJson makes a network request, so no selftest can drive
// it, and the thing that went wrong would have had no check over it at all.
//
// So the order lives here, in something `--selftest` can call: register every
// credential the bytes carry, THEN read them. Remove the loop below and section
// S5a goes red.
//
// IT MUTATES THE LIST IT IS GIVEN, which is the one impure thing in this group
// and is said out loud rather than hidden behind a name. That is what makes it
// work on the real run, where `PLACEHOLDERS` is one list shared by every
// request: a link registered from one answer is scrubbed out of every later one
// as well.
export function readStorageAnswer({ status, raw }, placeholders) {
  for (const link of signedLinksIn(raw)) {
    if (!placeholders.some(([known]) => known === link)) {
      placeholders.push([link, "A_SIGNED_LINK"]);
    }
  }
  return readStorageBody({ status, raw }, placeholders);
}

export function readRestBody({ ok, status, raw }, placeholders) {
  const text = raw ?? "";
  const printable = scrubWith(text, placeholders);

  if (!ok) return { status, printable, error: undefined, body: text };
  if (text.trim() === "") return { status, printable, rows: [], body: text };

  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    return { status, printable, body: text, error: `HTTP ${status} with a body that is not JSON` };
  }
  if (!Array.isArray(rows)) {
    return { status, printable, body: text, error: `expected a JSON array, got ${typeof rows}` };
  }
  return { status, printable, rows, body: text };
}

// A download. The bytes are what a judgement decides on; `sameAs` is a method so a
// judgement never has to know they are a Buffer.
export function readBytes({ status, bytes }) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  return {
    status,
    byteLength: buffer.length,
    sameAs(other) {
      return buffer.equals(Buffer.isBuffer(other) ? other : Buffer.from(other));
    },
    // Deliberately no `printable`: a file's bytes are never printed, whatever they
    // are. A detail line gets the length.
  };
}

// ---------------------------------------------------------------------------
// --selftest -- the judgements above, fed answers from a world where the
// migration was never applied. No network, no account.
// ---------------------------------------------------------------------------

function runSelftest() {
  console.log("build-it-23-attachment-checks --selftest: can these checks fail?");
  console.log("");
  console.log("Each case is something this script might be handed: a URL from");
  console.log("web/.env.local, an answer from Supabase Storage, or a row read back");
  console.log("through PostgREST. The expectation is what the judgement must say");
  console.log("about it. Nothing is sent anywhere and no account is used.");
  console.log("");

  const taskId = "a1b2c3d4-0001-4e5f-8a9b-0c1d2e3f4a5b";
  const otherTaskId = "a1b2c3d4-0002-4e5f-8a9b-0c1d2e3f4a5b";
  const fileName = `${MARK}-one.png`;
  const key = `${taskId}/${fileName}`;

  // A stand-in for an access token. NOT JWT-shaped and deliberately dull: a
  // random-looking literal in a committed file is refused by
  // `.githooks/pre-commit` -- gitleaks cannot tell a fixture from the real
  // thing, and CI runs the same tool over the whole history. The scrub cases care
  // that the string is found and replaced, not what shape it has.
  const standInToken = `not-a-real-access-token-${"y".repeat(24)}`;
  const standInUserId = "a1b2c3d4-0003-4e5f-8a9b-0c1d2e3f4a5b";
  const standInAddress = "nobody-staging@example.com";
  const standInSignedPath = `/object/sign/${BUCKET}/${key}?token=not-a-real-token-${"z".repeat(16)}`;

  // THE FOUR BODIES BELOW ARE THE ONES STAGING REALLY SENDS, copied from the run
  // of 8 October 2026 rather than written from the documentation. That matters,
  // and it is the reason this block has a comment: the first version of these
  // fixtures was the assistant's guess at the shape, with the HTTP status equal to
  // the status inside the body -- and the real answer is an HTTP 400 carrying a
  // 404, which is what let judgeBucketExists pass with no bucket at all. A
  // fixture that is kinder than reality is a selftest that agrees with its author.
  const uploaded = JSON.stringify({ Id: taskId, Key: `${BUCKET}/${key}` });
  // Observed, verbatim.
  const bucketMissing = JSON.stringify({
    statusCode: "404",
    error: "Bucket not found",
    message: BUCKET_NOT_FOUND,
    code: NO_SUCH_BUCKET,
  });
  // Observed, verbatim: what a request with a body Storage could not read gets.
  const malformed = JSON.stringify({
    statusCode: "400",
    error: "Error",
    message: "body must be object",
    code: "InvalidRequest",
  });
  // Observed, verbatim: a delete of a path that is not there.
  const noSuchKey = JSON.stringify({
    statusCode: "404",
    error: "not_found",
    message: "Object not found",
    code: "NoSuchKey",
  });
  const denied = JSON.stringify({
    statusCode: "403",
    error: "Unauthorized",
    message: "new row violates row-level security policy",
  });
  const badMime = JSON.stringify({
    statusCode: "400",
    error: INVALID_MIME,
    message: "The specified MIME type is not valid.",
  });
  const tooLarge = JSON.stringify({
    statusCode: "413",
    error: TOO_LARGE,
    message: "The entity being uploaded is too large.",
  });
  const listWithFile = JSON.stringify([{ name: fileName, id: taskId, metadata: { size: 70 } }]);
  const listEmpty = JSON.stringify([]);
  const signedBody = JSON.stringify({ signedURL: standInSignedPath });
  const taskRow = JSON.stringify([{ id: taskId, title: `${MARK} subject`, team_id: otherTaskId }]);
  const triggerRefusal = JSON.stringify({
    code: FOREIGN_KEY_VIOLATION,
    message: TASK_HAS_FILES,
    details: null,
  });
  const triggerRefusalNamingTheFile = JSON.stringify({
    code: FOREIGN_KEY_VIOLATION,
    message: TASK_HAS_FILES,
    details: `the file ${fileName} is still there`,
  });

  const storage = (status, raw) => readStorageBody({ status, raw }, []);
  const rest = (status, raw) => readRestBody({ ok: status < 400, status, raw }, []);
  const bytes = (status, buffer) => readBytes({ status, bytes: buffer });

  const cases = [
    // ---- S1. the staging guard ----
    {
      name: "the staging URL itself",
      run: () => judgeStagingUrl(`https://${STAGING_HOST}`),
      expect: [PASS],
    },
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
      name: "NOT STAGING: http rather than https",
      run: () => judgeStagingUrl(`http://${STAGING_HOST}`),
      expect: [FAIL],
    },
    {
      name: "NOT STAGING: a user name in the URL, so the host is not what it reads as",
      run: () => judgeStagingUrl(`https://user:pw@${STAGING_HOST}`),
      expect: [FAIL],
    },
    {
      name: "NOT STAGING: a port, which a proxy in front of something else would have",
      run: () => judgeStagingUrl(`https://${STAGING_HOST}:8443`),
      expect: [FAIL],
    },
    { name: "not a URL at all", run: () => judgeStagingUrl("ghskxrhqlhvrhpnivqbd"), expect: [FAIL] },
    { name: "the empty string", run: () => judgeStagingUrl(""), expect: [FAIL] },

    // ---- S2. the numbers this script copies from the migration ----
    {
      name: "THE CONTRACT: 5 MB, 3 per task, 300 seconds, six named types",
      run: () => judgeContractNumbers(MAX_FILE_BYTES, FILES_PER_TASK, SIGNED_LINK_SECONDS, ACCEPTED_TYPES),
      expect: [PASS, PASS, PASS, PASS],
    },
    {
      name: "5 MB read as a round million, which is NOT the migration's number",
      run: () => judgeContractNumbers(5_000_000, FILES_PER_TASK, SIGNED_LINK_SECONDS, ACCEPTED_TYPES),
      expect: [FAIL, PASS, PASS, PASS],
    },
    {
      name: "a per-task limit of 4",
      run: () => judgeContractNumbers(MAX_FILE_BYTES, 4, SIGNED_LINK_SECONDS, ACCEPTED_TYPES),
      expect: [PASS, FAIL, PASS, PASS],
    },
    {
      name: "a signed link that lives an hour",
      run: () => judgeContractNumbers(MAX_FILE_BYTES, FILES_PER_TASK, 3600, ACCEPTED_TYPES),
      expect: [PASS, PASS, FAIL, PASS],
    },
    {
      name: "THE WILDCARD BACK AGAIN -- the thing the coach's review removed",
      run: () =>
        judgeContractNumbers(MAX_FILE_BYTES, FILES_PER_TASK, SIGNED_LINK_SECONDS, [
          "image/*",
          "application/pdf",
        ]),
      expect: [PASS, PASS, PASS, FAIL],
    },
    {
      name: "six types, but one of them is SVG",
      run: () =>
        judgeContractNumbers(MAX_FILE_BYTES, FILES_PER_TASK, SIGNED_LINK_SECONDS, [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/gif",
          "image/svg+xml",
          "application/pdf",
        ]),
      expect: [PASS, PASS, PASS, FAIL],
    },

    // ---- S3. before the apply: there is no bucket ----
    {
      name:
        "BEFORE THE APPLY, AT THE STATUS STAGING REALLY USES: HTTP 400 carrying a 404" +
        " and NoSuchBucket. This is the case the first version of this script got wrong",
      run: () => judgeBucketExists(storage(REFUSAL_WRAPPER, bucketMissing)),
      expect: [FAIL],
    },
    {
      name: "the same thing at a plain HTTP 404, in case Storage ever stops wrapping it",
      run: () => judgeBucketExists(storage(404, bucketMissing)),
      expect: [FAIL],
    },
    {
      name: "after it: any answer from a bucket Storage has",
      run: () => judgeBucketExists(storage(200, uploaded)),
      expect: [PASS],
    },
    {
      name: "a refusal about a bucket that DOES exist is not 'no bucket'",
      run: () => judgeBucketExists(storage(403, denied)),
      expect: [PASS],
    },
    {
      name:
        "a malformed REQUEST is not a missing bucket either -- the body Storage sends when" +
        " it cannot read one, which is the second thing the 8 October run turned up",
      run: () => judgeBucketExists(storage(REFUSAL_WRAPPER, malformed)),
      expect: [PASS],
    },
    {
      name: "the request never arrived: UNVERIFIED, not a pass and not a failure",
      run: () => judgeBucketExists({ error: "could not reach the project" }),
      expect: [UNVERIFIED],
    },

    // ---- S4. the rules, fed a world with no policies ----
    {
      name: "Alice's upload accepted",
      run: () => judgeUploadAccepted(storage(200, uploaded), "upload"),
      expect: [PASS],
    },
    {
      name: "NO POLICIES: Alice's upload refused, which would mean nothing works",
      run: () => judgeUploadAccepted(storage(403, denied), "upload"),
      expect: [FAIL],
    },
    {
      name: "Bob's upload refused",
      run: () => judgeUploadRefused(storage(403, denied), "Bob uploads", { statuses: [400, 401, 403] }),
      expect: [PASS],
    },
    {
      name: "NO POLICIES: BOB'S UPLOAD ACCEPTED -- the one that matters most",
      run: () => judgeUploadRefused(storage(200, uploaded), "Bob uploads", { statuses: [400, 401, 403] }),
      expect: [FAIL],
    },
    {
      name: "an SVG refused for being an SVG",
      run: () =>
        judgeUploadRefused(storage(400, badMime), "an SVG", { statuses: [400], code: INVALID_MIME }),
      expect: [PASS],
    },
    {
      name: "A PUBLIC BUCKET WITH NO TYPE LIST: the SVG is accepted",
      run: () =>
        judgeUploadRefused(storage(200, uploaded), "an SVG", { statuses: [400], code: INVALID_MIME }),
      expect: [FAIL],
    },
    {
      name:
        "THE WRONG REASON: the SVG refused 403 by row-level security, so the TYPE LIST was" +
        " never reached and this check did not run",
      run: () =>
        judgeUploadRefused(storage(403, denied), "an SVG", { statuses: [400], code: INVALID_MIME }),
      expect: [FAIL],
    },
    {
      name: "the right status but the wrong code: a 400 that is not about the MIME type",
      run: () =>
        judgeUploadRefused(storage(400, tooLarge), "an SVG", { statuses: [400], code: INVALID_MIME }),
      expect: [FAIL],
    },
    {
      name: "an oversized file refused for being too big",
      run: () =>
        judgeUploadRefused(storage(413, tooLarge), "6 MB", { statuses: [413], code: TOO_LARGE }),
      expect: [PASS],
    },
    {
      name: "NO SIZE LIMIT ON THE BUCKET: the oversized file is accepted",
      run: () =>
        judgeUploadRefused(storage(200, uploaded), "6 MB", { statuses: [413], code: TOO_LARGE }),
      expect: [FAIL],
    },
    {
      name: "a fourth file on one task refused",
      run: () => judgeUploadRefused(storage(403, denied), "a fourth file", { statuses: [400, 403] }),
      expect: [PASS],
    },
    // THESE TWO EXIST BECAUSE BREAKING THE CODE ON PURPOSE FOUND A HOLE IN THIS
    // SELFTEST, and the hole is worth the paragraph. judgeUploadRefused answers
    // FAIL to an HTTP 200 in its first branch -- and when the caller also passes
    // `statuses`, the NEXT branch would answer FAIL as well, for a different
    // reason. Every call in the run passes `statuses`, so deleting the first
    // branch altogether left 87 cases green: the branch was unreachable as the
    // thing that decided, and a judgement nothing exercises is a judgement
    // nothing is checking. These two call it with NO expectations, so the 200
    // branch is the only thing that can answer.
    {
      name:
        "NO EXPECTATIONS GIVEN, and it was accepted: the plain 'it was accepted' branch" +
        " is the only thing deciding here",
      run: () => judgeUploadRefused(storage(200, uploaded), "an upload with no stated reason", {}),
      expect: [FAIL],
    },
    {
      name: "NO EXPECTATIONS GIVEN, and it was refused: any refusal will do",
      run: () => judgeUploadRefused(storage(403, denied), "an upload with no stated reason", {}),
      expect: [PASS],
    },
    {
      name: "NO LIMIT FUNCTION: the fourth file is accepted",
      run: () => judgeUploadRefused(storage(200, uploaded), "a fourth file", { statuses: [400, 403] }),
      expect: [FAIL],
    },
    {
      name: "Carol can list the file",
      run: () => judgeCanList(storage(200, listWithFile), fileName, "Carol lists"),
      expect: [PASS],
    },
    {
      name: "NO READ POLICY: Carol's list comes back empty",
      run: () => judgeCanList(storage(200, listEmpty), fileName, "Carol lists"),
      expect: [FAIL],
    },
    {
      name: "Carol's list refused outright, which is also not 'she can list it'",
      run: () => judgeCanList(storage(403, denied), fileName, "Carol lists"),
      expect: [FAIL],
    },
    {
      name: "Bob's list is empty",
      run: () => judgeCannotList(storage(200, listEmpty), fileName, "Bob lists"),
      expect: [PASS],
    },
    {
      name: "Bob's list is refused outright, which is also fine",
      run: () => judgeCannotList(storage(403, denied), fileName, "Bob lists"),
      expect: [PASS],
    },
    {
      name: "A PUBLIC BUCKET: BOB'S LIST CONTAINS ALICE'S FILE",
      run: () => judgeCannotList(storage(200, listWithFile), fileName, "Bob lists"),
      expect: [FAIL],
    },
    {
      name: "Carol downloads the file, byte for byte",
      run: () => judgeCanDownload(bytes(200, PNG_BYTES), PNG_BYTES, "Carol opens"),
      expect: [PASS],
    },
    {
      name: "NO READ POLICY: Carol's download refused",
      run: () => judgeCanDownload(bytes(403, Buffer.alloc(0)), PNG_BYTES, "Carol opens"),
      expect: [FAIL],
    },
    {
      name: "200 with the wrong number of bytes -- an error page served as a file",
      run: () => judgeCanDownload(bytes(200, Buffer.from("not a png")), PNG_BYTES, "Carol opens"),
      expect: [FAIL],
    },
    {
      name: "200 with the right LENGTH and the wrong bytes",
      run: () =>
        judgeCanDownload(bytes(200, Buffer.alloc(PNG_BYTES.length, 0x41)), PNG_BYTES, "Carol opens"),
      expect: [FAIL],
    },
    {
      name: "Bob's download refused",
      run: () => judgeCannotDownload(bytes(400, Buffer.alloc(0)), "Bob opens"),
      expect: [PASS],
    },
    {
      name: "A PUBLIC BUCKET: BOB DOWNLOADS ALICE'S FILE",
      run: () => judgeCannotDownload(bytes(200, PNG_BYTES), "Bob opens"),
      expect: [FAIL],
    },
    {
      name: "Carol is issued a signed link",
      run: () => judgeSigned(storage(200, signedBody), "Carol signs"),
      expect: [PASS],
    },
    {
      name: "200 but no signedURL in the body",
      run: () => judgeSigned(storage(200, JSON.stringify({})), "Carol signs"),
      expect: [FAIL],
    },
    {
      name: "200 and a signedURL with no token in it, which would open for nobody",
      run: () =>
        judgeSigned(storage(200, JSON.stringify({ signedURL: `/object/sign/${BUCKET}/${key}` })), "Carol signs"),
      expect: [FAIL],
    },
    {
      name: "NO READ POLICY: Carol gets no link",
      run: () => judgeSigned(storage(403, denied), "Carol signs"),
      expect: [FAIL],
    },
    {
      name: "Bob gets no link",
      run: () => judgeCannotSign(storage(403, denied), "Bob signs"),
      expect: [PASS],
    },
    {
      name: "A PUBLIC BUCKET: BOB IS ISSUED A LINK TO ALICE'S FILE",
      run: () => judgeCannotSign(storage(200, signedBody), "Bob signs"),
      expect: [FAIL],
    },
    {
      name:
        "THE SHARP EDGE: the link opens with no key and no session, which is what" +
        " docs/plan.md says it does",
      run: () => judgeSignedLinkOpens(bytes(200, PNG_BYTES), PNG_BYTES, "the link opens"),
      expect: [PASS],
    },
    {
      name:
        "the link does NOT open unauthenticated, which would mean the plan's own" +
        " description of a signed link is wrong",
      run: () => judgeSignedLinkOpens(bytes(401, Buffer.alloc(0)), PNG_BYTES, "the link opens"),
      expect: [FAIL],
    },
    {
      name: "Carol's delete of Alice's file refused",
      run: () => judgeDeleteRefused(storage(400, denied), "Carol deletes"),
      expect: [PASS],
    },
    {
      name: "NO DELETE POLICY WORTH THE NAME: Carol deletes Alice's file",
      run: () => judgeDeleteRefused(storage(200, JSON.stringify({ message: "Successfully deleted" })), "Carol deletes"),
      expect: [FAIL],
    },
    {
      name: "Alice deletes her own file",
      run: () => judgeDeleteAccepted(storage(200, JSON.stringify({ message: "Successfully deleted" })), "Alice deletes"),
      expect: [PASS],
    },
    {
      name: "Alice's delete refused, which would leave the file unremovable",
      run: () => judgeDeleteAccepted(storage(403, denied), "Alice deletes"),
      expect: [FAIL],
    },
    {
      name: "a replace refused",
      run: () => judgeReplaceRefused(storage(403, denied), "replace"),
      expect: [PASS],
    },
    {
      name: "AN UPDATE POLICY EXISTS: the bytes under a name are replaced",
      run: () => judgeReplaceRefused(storage(200, uploaded), "replace"),
      expect: [FAIL],
    },
    {
      name: "a rename refused",
      run: () => judgeRenameRefused(storage(403, denied), "rename"),
      expect: [PASS],
    },
    {
      name:
        "AN UPDATE POLICY EXISTS: THE FILE IS MOVED, which moves it between tasks because" +
        " the first segment of the path is the task id",
      run: () => judgeRenameRefused(storage(200, JSON.stringify({ message: "Successfully moved" })), "rename"),
      expect: [FAIL],
    },
    {
      name: "the task cannot be deleted while a file remains",
      run: () => judgeTaskDeleteRefused(rest(409, triggerRefusal), fileName, "delete the task"),
      expect: [PASS],
    },
    {
      name: "NO TRIGGER: THE TASK IS DELETED AND ITS FILE IS ORPHANED",
      run: () => judgeTaskDeleteRefused(rest(200, taskRow), fileName, "delete the task"),
      expect: [FAIL],
    },
    {
      name:
        "refused, but by something else -- a body with no trigger sentence in it, so the" +
        " refusal was not the one this check is about",
      run: () => judgeTaskDeleteRefused(rest(403, denied), fileName, "delete the task"),
      expect: [FAIL],
    },
    {
      name:
        "the right refusal BUT IT NAMES THE FILE, which docs/plan.md forbids in an error" +
        " because a file name is free text somebody's phone chose",
      run: () => judgeTaskDeleteRefused(rest(409, triggerRefusalNamingTheFile), fileName, "delete the task"),
      expect: [FAIL],
    },
    {
      name: "the task deletes once its file is gone",
      run: () => judgeTaskDeleteAccepted(rest(200, taskRow), "delete the task"),
      expect: [PASS],
    },
    {
      name: "200 with no rows: PostgREST matched nothing, so nothing was deleted",
      run: () => judgeTaskDeleteAccepted(rest(200, "[]"), "delete the task"),
      expect: [FAIL],
    },
    {
      name: "the task still refuses to delete after the tidy-up",
      run: () => judgeTaskDeleteAccepted(rest(409, triggerRefusal), "delete the task"),
      expect: [FAIL],
    },
    {
      name: "the tidy-up removes the task it created",
      run: () => judgeTidiedTask(rest(200, taskRow), taskId, "tidy up"),
      expect: [PASS],
    },
    {
      name:
        "THE TIDY-UP FINDS IT ALREADY GONE, which is what happens before the apply --" +
        " and must not be reported as a failure standing where a real leftover would",
      run: () => judgeTidiedTask(rest(200, "[]"), taskId, "tidy up"),
      expect: [PASS],
    },
    {
      name: "THE TIDY-UP IS REFUSED, which means something is still holding the task",
      run: () => judgeTidiedTask(rest(409, triggerRefusal), taskId, "tidy up"),
      expect: [FAIL],
    },
    {
      name: "an oversized file refused at the 400 Storage really wraps it in",
      run: () =>
        judgeUploadRefused(storage(REFUSAL_WRAPPER, tooLarge), "6 MB", {
          statuses: [REFUSAL_WRAPPER, 413],
          code: TOO_LARGE,
        }),
      expect: [PASS],
    },
    {
      name:
        "THE WRONG REASON, AT THE RIGHT STATUS: a 400 that says the bucket is missing," +
        " offered to the size check. Before the apply every probe gets this, and none of" +
        " them may pass on it",
      run: () =>
        judgeUploadRefused(storage(REFUSAL_WRAPPER, bucketMissing), "6 MB", {
          statuses: [REFUSAL_WRAPPER, 413],
          code: TOO_LARGE,
        }),
      expect: [FAIL],
    },
    {
      name: "a delete of a path that is not there -- the body staging really sends",
      run: () => judgeDeleteRefused(storage(REFUSAL_WRAPPER, noSuchKey), "delete a missing file"),
      expect: [PASS],
    },
    // ---- HEIC, both halves, and the expectation reversed on 9 Oct 2026 ----
    //
    // The owner's staging run settled issue #239's question and the owner agreed
    // to this change (AGENTS.md rule 20). The notes above the two judgements say
    // what changed; these are the cases that make each of them able to fail.
    {
      name:
        "14a: a .heic name with NO content type is refused for its type, which is what" +
        " staging really does",
      run: () => judgeHeicWithoutContentType(storage(400, badMime), "heic, bare"),
      expect: [PASS],
    },
    {
      name:
        "14a: SUPABASE STARTED MAPPING THE EXTENSION -- it was accepted, which reverses the" +
        " finding the app's content-type table is built on",
      run: () => judgeHeicWithoutContentType(storage(200, uploaded), "heic, bare"),
      expect: [FAIL],
    },
    {
      name:
        "14a: REFUSED FOR THE WRONG REASON -- row-level security, so the type was never" +
        " reached and this check did not run",
      run: () => judgeHeicWithoutContentType(storage(403, denied), "heic, bare"),
      expect: [FAIL],
    },
    {
      name: "14b: with image/heic set, the same name is accepted -- an iPhone photograph works",
      run: () => judgeHeicWithContentType(storage(200, uploaded), "heic, typed"),
      expect: [PASS],
    },
    {
      name:
        "14b: THE BUCKET DOES NOT HOLD image/heic -- refused even with the type set, so the" +
        " owner's decision is not in the database",
      run: () => judgeHeicWithContentType(storage(400, badMime), "heic, typed"),
      expect: [FAIL],
    },
    {
      name: "14b: refused by a rule rather than by the type list, which is also a failure here",
      run: () => judgeHeicWithContentType(storage(403, denied), "heic, typed"),
      expect: [FAIL],
    },
    {
      name: "what Storage recorded, reported rather than decided",
      run: () =>
        judgeRecordedInfo(
          storage(200, JSON.stringify({ name: key, metadata: { size: 70, mimetype: "image/png" } })),
          "what Storage recorded",
        ),
      expect: [PASS],
    },
    {
      name: "the info endpoint answered something unreadable: UNVERIFIED",
      run: () => judgeRecordedInfo(storage(404, "not json at all"), "what Storage recorded"),
      expect: [UNVERIFIED],
    },

    // ---- S5. THE REAL READING PATH ----
    //
    // Every case above hands a judgement an answer built by `storage()`, `rest()`
    // or `bytes()` -- which ARE the readers, so those cases already go through
    // them. These four go further: they register a placeholder first, the way a
    // real run registers Alice's token before its first request, and then require
    // that the judgement still decides on the bytes that arrived while the
    // printable copy is the scrubbed one. That pairing is what build-it-20's
    // 7 October fault broke, and what no case there could see.
    {
      name:
        "THE REAL PATH: a list carrying the file name, judged on the bytes that arrived," +
        " with a token registered for the scrub",
      run: () =>
        judgeCanList(
          readStorageBody(
            { status: 200, raw: JSON.stringify([{ name: fileName, id: standInToken }]) },
            [[standInToken, "ALICE_ACCESS_TOKEN"]],
          ),
          fileName,
          "Carol lists",
        ),
      expect: [PASS],
    },
    {
      name:
        "THE REAL PATH: and the form that gets printed is still scrubbed, so the fix is" +
        " never to stop scrubbing",
      run: () =>
        judgeNothingLeaked(
          [
            readStorageBody(
              { status: 200, raw: JSON.stringify([{ name: fileName, id: standInToken }]) },
              [[standInToken, "ALICE_ACCESS_TOKEN"]],
            ).printable,
          ],
          [[standInToken, "an access token"]],
        ),
      expect: [PASS],
    },
    {
      name:
        "THE REAL PATH with NOTHING REGISTERED: the token reaches the printable form," +
        " which is what makes the case above worth having",
      run: () =>
        judgeNothingLeaked(
          [
            readStorageBody(
              { status: 200, raw: JSON.stringify([{ name: fileName, id: standInToken }]) },
              [],
            ).printable,
          ],
          [[standInToken, "an access token"]],
        ),
      expect: [FAIL],
    },
    {
      name:
        "THE REAL PATH: THE TRIGGER'S SENTENCE SURVIVES THE SCRUB. If a placeholder ever" +
        " swallowed part of it, the task-delete check would report the wrong refusal",
      run: () =>
        judgeTaskDeleteRefused(
          readRestBody(
            { ok: false, status: 409, raw: triggerRefusal },
            [[standInToken, "ALICE_ACCESS_TOKEN"], [standInUserId, "ALICE_USER_ID"]],
          ),
          fileName,
          "delete the task",
        ),
      expect: [PASS],
    },
    {
      name:
        "THE REAL PATH: a signed link is read out of the bytes that arrived, and the" +
        " token in it never reaches a printed line",
      run: () => {
        const answer = readStorageBody({ status: 200, raw: signedBody }, [
          [standInSignedPath, "A_SIGNED_LINK"],
        ]);
        return [...judgeSigned(answer, "Carol signs"), ...judgeNothingLeaked([answer.printable], [[standInSignedPath, "a signed link"]])];
      },
      expect: [PASS, PASS],
    },
    {
      name:
        "THE REAL PATH, NOTHING REGISTERED: the signed link itself reaches the printable" +
        " form -- a credential for five minutes, in a log",
      run: () => {
        const answer = readStorageBody({ status: 200, raw: signedBody }, []);
        return judgeNothingLeaked([answer.printable], [[standInSignedPath, "a signed link"]]);
      },
      expect: [FAIL],
    },

    // ---- S5a. THE BUG THE OWNER'S RUN OF 9 OCTOBER 2026 FOUND ----
    //
    // Section 15 reported a signed link in a kept body when no link had been
    // printed, and the cause was an ORDER rather than a wrong judgement: the sign
    // response was kept, scrubbed against the placeholders as they then were,
    // BEFORE the link in it was registered. Every case above this one hands a
    // judgement a body whose placeholders were decided in advance, which is
    // exactly why none of them could see it -- the same shape of blind spot the
    // header describes about build-it-20-ai-checks.mjs.
    //
    // THESE FOUR GO THROUGH THE ORDER ITSELF. The first two are what signedLinksIn
    // has to get right; the last two are the whole chain -- raw bytes, register,
    // read, judge -- with the registration in place and then left out. The fourth
    // IS the 9 October failure, reproduced, and it must come out FAIL.
    {
      name: "THE FIX: a signed link is found in the bytes that arrived",
      run: () => [
        {
          what: "signedLinksIn finds the link in a sign response",
          verdict: signedLinksIn(signedBody).includes(standInSignedPath) ? PASS : FAIL,
          detail: `${signedLinksIn(signedBody).length} credential-bearing string(s)`,
        },
      ],
      expect: [PASS],
    },
    {
      name:
        "and it finds nothing in a body with no token in it, so an ordinary answer" +
        " registers no placeholder",
      run: () => [
        {
          what: "signedLinksIn finds nothing in an upload's answer, a list, or a refusal",
          verdict:
            signedLinksIn(uploaded).length === 0 &&
            signedLinksIn(listWithFile).length === 0 &&
            signedLinksIn(denied).length === 0 &&
            signedLinksIn("not json at all").length === 0
              ? PASS
              : FAIL,
          detail: "four bodies, no credential in any of them",
        },
      ],
      expect: [PASS],
    },
    {
      name:
        "THE WHOLE CHAIN, THROUGH THE FUNCTION THE RUN REALLY USES: an empty registry, the" +
        " raw bytes in, a link issued, and nothing kept that carries it",
      run: () => {
        // readStorageAnswer is exactly what storageJson calls, with the same
        // starting point a real run has before any link exists: a registry that
        // does not contain one.
        const registry = [];
        const answer = readStorageAnswer({ status: 200, raw: signedBody }, registry);
        return [
          ...judgeSigned(answer, "Carol signs"),
          ...judgeNothingLeaked([answer.printable], [[standInSignedPath, "a signed link"]]),
          {
            what: "and the link is now registered, so every LATER body is scrubbed against it too",
            verdict: registry.some(([value]) => value === standInSignedPath) ? PASS : FAIL,
            detail: `${registry.length} placeholder(s) after one sign response`,
          },
        ];
      },
      expect: [PASS, PASS, PASS],
    },
    {
      name:
        "and it registers the link ONCE however many answers carry it, so the count in" +
        " section 15's detail line stays honest",
      run: () => {
        const registry = [];
        readStorageAnswer({ status: 200, raw: signedBody }, registry);
        readStorageAnswer({ status: 200, raw: signedBody }, registry);
        return [
          {
            what: "two answers carrying the same link register one placeholder",
            verdict: registry.length === 1 ? PASS : FAIL,
            detail: `${registry.length} placeholder(s)`,
          },
        ];
      },
      expect: [PASS],
    },
    {
      name:
        "AND AN ORDINARY ANSWER REGISTERS NOTHING: an upload, a list and a refusal leave the" +
        " registry alone, so nothing is scrubbed that should be readable",
      run: () => {
        const registry = [];
        for (const body of [uploaded, listWithFile, denied, "not json at all"]) {
          readStorageAnswer({ status: 200, raw: body }, registry);
        }
        return [
          {
            what: "four ordinary answers, no placeholder registered",
            verdict: registry.length === 0 ? PASS : FAIL,
            detail: `${registry.length} placeholder(s)`,
          },
        ];
      },
      expect: [PASS],
    },
    {
      name:
        "THE 9 OCTOBER FAILURE, REPRODUCED: read and keep FIRST, register afterwards --" +
        " which is what the script did, and the kept copy still holds the link",
      run: () => {
        // The order the script used before the fix. The registry is the one the
        // run really had at that moment: Alice's token and her user id, and no
        // link, because the link did not exist until this very body arrived.
        const registry = [
          [standInToken, "ALICE_ACCESS_TOKEN"],
          [standInUserId, "ALICE_USER_ID"],
        ];
        const kept = readStorageBody({ status: 200, raw: signedBody }, registry).printable;
        // ... and only now is the link registered, from the parsed answer, which
        // is one request too late: the copy above is already made.
        registry.push([standInSignedPath, "A_SIGNED_LINK"]);
        return judgeNothingLeaked([kept], [[standInSignedPath, "a signed link"]]);
      },
      expect: [FAIL],
    },

    // ---- S6. the scrub, and the tidy-up ----
    {
      name: "a token is taken out of a body",
      run: () =>
        judgeScrubbed("a body with a token in it", `{"id":"${standInToken}"}`, standInToken, [
          [standInToken, "ALICE_ACCESS_TOKEN"],
        ]),
      expect: [PASS],
    },
    {
      name: "an address is taken out of a body",
      run: () =>
        judgeScrubbed("a body with an address", `{"email":"${standInAddress}"}`, standInAddress, [
          [standInAddress, "ALICE_EMAIL"],
        ]),
      expect: [PASS],
    },
    {
      name: "NOTHING REGISTERED: the token comes straight back out",
      run: () => judgeScrubbed("a token with an empty registry", `{"id":"${standInToken}"}`, standInToken, []),
      expect: [FAIL],
    },
    {
      name: "a scrub case that proves nothing: the value is not in the text at all",
      run: () => judgeScrubbed("a body with no token", '{"msg":"nope"}', standInToken, [[standInToken, "T"]]),
      expect: [UNVERIFIED],
    },
    {
      name: "nothing registered to look for: UNVERIFIED rather than a clean pass",
      run: () => judgeNothingLeaked(['{"msg":"nope"}'], [["", "nothing"]]),
      expect: [UNVERIFIED],
    },
    {
      name: "the run left nothing behind",
      run: () =>
        judgeLeftNothing([storage(200, listEmpty), storage(200, listEmpty)], rest(200, "[]"), "left nothing"),
      expect: [PASS],
    },
    {
      name: "A FILE LEFT BEHIND, which is the thing this script must never do quietly",
      run: () =>
        judgeLeftNothing([storage(200, listWithFile), storage(200, listEmpty)], rest(200, "[]"), "left nothing"),
      expect: [FAIL],
    },
    {
      name: "A TASK LEFT BEHIND",
      run: () =>
        judgeLeftNothing([storage(200, listEmpty), storage(200, listEmpty)], rest(200, taskRow), "left nothing"),
      expect: [FAIL],
    },
    {
      name: "a tidy-up read that did not arrive: UNVERIFIED, so nobody reads it as clean",
      run: () =>
        judgeLeftNothing([{ error: "could not reach the project" }], rest(200, "[]"), "left nothing"),
      expect: [UNVERIFIED],
    },
    {
      name: "the request log holds only what this script documents",
      run: () =>
        judgeTouchedNothing([
          { method: "POST", path: "/auth/v1/token?grant_type=password" },
          { method: "POST", path: `/storage/v1/object/${BUCKET}/${key}` },
          { method: "POST", path: `/storage/v1/object/list/${BUCKET}` },
          { method: "DELETE", path: "/rest/v1/tasks?id=eq.x" },
          { method: "POST", path: "/auth/v1/logout?scope=local" },
        ]),
      expect: [PASS],
    },
    {
      name: "A READ OF account_status, which no staging script may make",
      run: () =>
        judgeTouchedNothing([
          { method: "POST", path: "/auth/v1/token?grant_type=password" },
          { method: "GET", path: "/rest/v1/account_status?select=user_id" },
        ]),
      expect: [FAIL],
    },
    {
      name: "A REQUEST TO ANOTHER BUCKET",
      run: () =>
        judgeTouchedNothing([{ method: "POST", path: "/storage/v1/object/avatars/x.png" }]),
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
  console.log("Every judgement said FAIL to a world where the migration was never");
  console.log("applied: no bucket at all, a public bucket Bob can read and list, no");
  console.log("type list so an SVG is accepted, no size limit, no per-task limit, an");
  console.log("update policy so a file can be renamed into another task, and no");
  console.log("trigger so a task deletes with its files orphaned. It also said FAIL");
  console.log("to a refusal for the WRONG REASON, to a file left behind, and to a");
  console.log("token or a signed link reaching a printed line. That is what would");
  console.log("make a green staging run mean something. It is NOT itself a staging");
  console.log("result: nothing was sent anywhere by this run, and no file exists.");
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
        `  node scripts/staging/build-it-23-attachment-checks.mjs --selftest`,
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
      `This script uploads files and deletes rows. It runs against staging and nothing else.`,
  );
}

const PEOPLE = [
  { label: "Alice", emailVar: "ALICE_EMAIL", passwordVar: "ALICE_PASSWORD" },
  { label: "Bob", emailVar: "BOB_EMAIL", passwordVar: "BOB_PASSWORD" },
  { label: "Carol", emailVar: "CAROL_EMAIL", passwordVar: "CAROL_PASSWORD" },
];

const aliceTeamId = (process.env.ALICE_TEAM_ID ?? "").trim();

const missingFromEnv = [];
for (const person of PEOPLE) {
  if ((process.env[person.emailVar] ?? "").trim() === "") missingFromEnv.push(person.emailVar);
  if ((process.env[person.passwordVar] ?? "") === "") missingFromEnv.push(person.passwordVar);
}
if (aliceTeamId === "") missingFromEnv.push("ALICE_TEAM_ID");
if (missingFromEnv.length > 0) {
  die(
    `these are not set in the environment: ${missingFromEnv.join(", ")}.\n` +
      `See docs/environments.md -> "Where the test accounts live". No value is printed.\n` +
      `\n` +
      `The logic check needs none of them:\n` +
      `  node scripts/staging/build-it-23-attachment-checks.mjs --selftest`,
  );
}
if (!UUID_PATTERN.test(aliceTeamId)) {
  die(`ALICE_TEAM_ID is not a uuid. Its value is not printed.`);
}

// ---------------------------------------------------------------------------
// Where the requests go
// ---------------------------------------------------------------------------

const base = supabaseUrl.replace(/\/+$/, "");
const authUrl = `${base}/auth/v1`;
const restUrl = `${base}/rest/v1`;
const storageUrl = `${base}/storage/v1`;

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

// The footprint, counted rather than estimated. Printed at the end.
let bytesSent = 0;
let bytesBack = 0;
let uploadsAttempted = 0;

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

// `apikey: false` sends NEITHER header -- no key and no token, which is the one
// request shape in this script that carries no credential at all.
function headersFor(accessToken, { apikey = true, contentType } = {}) {
  const headers = {};
  if (apikey) headers.apikey = publishableKey;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

// One Storage request whose answer is JSON: upload, list, sign, move, delete, info.
async function storageJson(method, path, { accessToken = null, apikey = true, body, contentType } = {}) {
  REQUEST_LOG.push({ method, path: `/storage/v1${path}` });
  if (Buffer.isBuffer(body)) {
    bytesSent += body.length;
    uploadsAttempted += 1;
  }

  // A JSON BODY NEEDS ITS CONTENT TYPE SAYING, and this line is the second bug the
  // staging run of 8 October 2026 found. Without it the list and sign endpoints
  // answered HTTP 400 {"error":"Error","message":"body must be object",
  // "code":"InvalidRequest"} -- so three of Carol's checks failed for a reason that
  // had nothing to do with the rules, and Bob's matching checks "passed" because a
  // malformed request is also a refused one. A check that passes because the
  // request was broken is the worst kind of green.
  const type = contentType ?? (body !== undefined && !Buffer.isBuffer(body) ? "application/json" : undefined);

  let response;
  try {
    response = await fetch(`${storageUrl}${path}`, {
      method,
      headers: headersFor(accessToken, { apikey, contentType: type }),
      body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
    });
  } catch (cause) {
    return { error: `could not reach Storage (${cause.message})` };
  }

  // Judged on what arrived, printed and kept scrubbed -- and every credential
  // the answer CARRIES registered before either of those happens, which is the
  // fix for the second FAIL of the owner's staging run of 9 October 2026.
  // readStorageAnswer is where that order lives, in one place, so --selftest can
  // drive it; signedLinksIn's note is the whole argument.
  const answer = readStorageAnswer(
    { status: response.status, raw: await response.text() },
    PLACEHOLDERS,
  );
  BODIES_SEEN.push(answer.printable);
  return answer;
}

// One Storage request whose answer is a file. The bytes are never printed.
async function storageBytes(url, { accessToken = null, apikey = true, logPath } = {}) {
  REQUEST_LOG.push({ method: "GET", path: logPath });

  let response;
  try {
    response = await fetch(url, { method: "GET", headers: headersFor(accessToken, { apikey }) });
  } catch (cause) {
    return { error: `could not reach Storage (${cause.message})` };
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  bytesBack += buffer.length;

  // A refusal arrives here too, and its body is JSON rather than a file. It is
  // kept scrubbed for the leak check and never judged as bytes.
  if (response.status !== 200 && buffer.length < 2048) {
    BODIES_SEEN.push(scrub(buffer.toString("utf8")));
  }
  return readBytes({ status: response.status, bytes: buffer });
}

async function rest(method, path, { accessToken = null, body } = {}) {
  const headers = headersFor(accessToken, { contentType: body === undefined ? undefined : "application/json" });
  // Set for every method, including DELETE, which carries no body: without it a
  // delete answers 204 with nothing and "refused" and "deleted" look identical.
  headers.Prefer = "return=representation";

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

  // Registered with scrub() the moment they exist, before any body that could
  // contain them is printed. Both of these are live.
  remember(accessToken, `${person.label.toUpperCase()}_ACCESS_TOKEN`);
  remember(userId, `${person.label.toUpperCase()}_USER_ID`);
  remember(email, `${person.label.toUpperCase()}_EMAIL`);
  return { label: person.label, accessToken, userId, email };
}

// Ends the session this run created, and only that one. scope=local is the whole
// point: 'global' ends every session belonging to that account, which on staging
// would sign the owner's own browser out of Alice, Bob or Carol every time this
// script ran.
//
// Failure is reported, not thrown: a session left behind expires on its own, and
// losing the test result to a tidy-up error would be the worse outcome.
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
// The run
// ---------------------------------------------------------------------------

const objectPath = (taskId, fileName) => `/object/${BUCKET}/${taskId}/${fileName}`;

console.log("");
console.log("build-it-23-attachment-checks: the rules on the attachments bucket, on STAGING");
console.log(`  project: https://${STAGING_HOST}`);
console.log(`  bucket:  ${BUCKET} (private)`);
console.log("");
console.log("The migration was applied to staging on 9 Oct 2026, so section 2 should");
console.log("PASS. A run before the apply fails there, and the pair of runs either side");
console.log("of it is in evidence/build-it-23-attachments-bucket.md. This run is now a");
console.log("regression check over rules that are live on staging and on production.");
console.log("");

const created = { tasks: [], files: [] };
const sessions = [];

// Section 0 -- the numbers this script copies from the migration.
console.log("0. the contract this script checks against");
record(judgeContractNumbers(MAX_FILE_BYTES, FILES_PER_TASK, SIGNED_LINK_SECONDS, ACCEPTED_TYPES));
console.log("");

try {
  // ---- 1. sign in, and make the two tasks ----
  console.log("1. the three accounts, and the two tasks this run owns");

  const alice = await signIn(PEOPLE[0]);
  if (alice.error) {
    record([{ what: "Alice signs in", verdict: UNVERIFIED, detail: alice.error }]);
    throw new Error("stop");
  }
  sessions.push(alice);
  record([{ what: "Alice signs in", verdict: PASS, detail: "HTTP 200, token not printed" }]);

  const bob = await signIn(PEOPLE[1]);
  if (bob.error) record([{ what: "Bob signs in", verdict: UNVERIFIED, detail: bob.error }]);
  else {
    sessions.push(bob);
    record([{ what: "Bob signs in", verdict: PASS, detail: "HTTP 200, token not printed" }]);
  }

  const carol = await signIn(PEOPLE[2]);
  if (carol.error) record([{ what: "Carol signs in", verdict: UNVERIFIED, detail: carol.error }]);
  else {
    sessions.push(carol);
    record([{ what: "Carol signs in", verdict: PASS, detail: "HTTP 200, token not printed" }]);
  }

  // owner_id is NOT sent: the column defaults to auth.uid(), so the row cannot
  // claim to be somebody else's. 20260927182443_create_tasks.sql.
  const teamTaskAnswer = await rest("POST", `tasks?select=${TASK_COLUMNS}`, {
    accessToken: alice.accessToken,
    body: { title: `${MARK} team task`, team_id: aliceTeamId },
  });
  const teamTaskId = teamTaskAnswer.rows?.[0]?.id ?? "";
  if (!UUID_PATTERN.test(teamTaskId)) {
    record([
      {
        what: "Alice creates a task in her team, for this run to attach files to",
        verdict: UNVERIFIED,
        detail: `HTTP ${teamTaskAnswer.status}: ${(teamTaskAnswer.printable ?? "").slice(0, MAX_REFUSAL_BODY)}`,
      },
    ]);
    throw new Error("stop");
  }
  created.tasks.push(teamTaskId);
  record([
    {
      what: "Alice creates a task in her team, for this run to attach files to",
      verdict: PASS,
      detail: `task ${teamTaskId}`,
    },
  ]);

  const personalAnswer = await rest("POST", `tasks?select=${TASK_COLUMNS}`, {
    accessToken: alice.accessToken,
    body: { title: `${MARK} personal task` },
  });
  const personalTaskId = personalAnswer.rows?.[0]?.id ?? "";
  if (!UUID_PATTERN.test(personalTaskId)) {
    record([
      {
        what: "Alice creates a personal task, for the HEIC probe",
        verdict: UNVERIFIED,
        detail: `HTTP ${personalAnswer.status}`,
      },
    ]);
  } else {
    created.tasks.push(personalTaskId);
    record([
      { what: "Alice creates a personal task, for the HEIC probe", verdict: PASS, detail: `task ${personalTaskId}` },
    ]);
  }
  console.log("");

  const first = `${MARK}-one.png`;
  const firstKey = `${teamTaskId}/${first}`;

  // ---- 2. does the bucket exist at all? ----
  console.log("2. the bucket -- WHICH OF THE TWO RUNS IS THIS?");
  const firstUpload = await storageJson("POST", objectPath(teamTaskId, first), {
    accessToken: alice.accessToken,
    body: PNG_BYTES,
    contentType: "image/png",
  });
  record(judgeBucketExists(firstUpload));
  console.log("");

  // ---- 3. Alice uploads to her team task ----
  console.log("3. Alice attaches a file to her own team task");
  record(judgeUploadAccepted(firstUpload, "Alice uploads a PNG to a task she created"));
  if (firstUpload.status === 200) created.files.push(firstKey);
  console.log("");

  // ---- 4. Carol: list, read, sign ----
  //
  // `carolSigned` is declared OUTSIDE this block so section 5 can use it. That
  // is the third of the owner's three asks about this script: the output had no
  // section 5, because the signed-link check lived inside section 4's `else` and
  // printed no heading of its own -- so a reader counting sections found 4 then
  // 6 and had no way to tell whether a check had been lost. It is a section
  // now, with a heading, and it keeps its number so every section below it keeps
  // the number the owner's two runs referred to.
  let carolSigned = null;

  console.log("4. Carol, a member of the team, can list, open and get a link");
  if (carol.error) {
    record([{ what: "Carol's three reads", verdict: UNVERIFIED, detail: "Carol could not sign in" }]);
  } else {
    record(
      judgeCanList(
        await storageJson("POST", `/object/list/${BUCKET}`, {
          accessToken: carol.accessToken,
          body: { prefix: teamTaskId, limit: 100 },
        }),
        first,
        "Carol lists the task's folder",
      ),
    );
    record(
      judgeCanDownload(
        await storageBytes(`${storageUrl}${objectPath(teamTaskId, first)}`, {
          accessToken: carol.accessToken,
          logPath: `/storage/v1${objectPath(teamTaskId, first)}`,
        }),
        PNG_BYTES,
        "Carol opens the file",
      ),
    );
    carolSigned = await storageJson("POST", `/object/sign/${BUCKET}/${firstKey}`, {
      accessToken: carol.accessToken,
      body: { expiresIn: SIGNED_LINK_SECONDS },
    });
    record(judgeSigned(carolSigned, "Carol is issued a signed link"));
  }
  console.log("");

  // ---- 5. the link, with no credentials at all ----
  //
  // A SECTION OF ITS OWN, WITH A HEADING, since 9 October 2026. It was always a
  // check and never a section: it sat inside section 4's `else` and printed no
  // heading, so the output went 4, 6 and the owner's run had a numbered gap in
  // it. Nothing about what it asks has changed.
  //
  // It is also the sharpest thing this script measures, which is an argument for
  // its own heading rather than against: the link carries no key and no session,
  // and this is where that is shown rather than described.
  console.log("5. the link itself -- no key, no session, and it still opens the file");
  const signedPath = carolSigned?.parsed?.signedURL;
  if (typeof signedPath === "string" && signedPath !== "") {
    // ALREADY REGISTERED FOR THE SCRUB, by storageJson, from the bytes of the
    // answer that carried it -- which is the fix for the second FAIL of the
    // owner's run of 9 October 2026. The call that used to be here was too late
    // by one request: the sign response had already been kept with the live link
    // in it. signedLinksIn's note is the whole argument.
    record(
      judgeSignedLinkOpens(
        await storageBytes(`${storageUrl}${signedPath}`, { apikey: false, logPath: "a signed link" }),
        PNG_BYTES,
        "the signed link opens with NO key and NO session",
      ),
    );
  } else {
    record([
      {
        what: "the signed link opens with NO key and NO session",
        verdict: UNVERIFIED,
        detail: carol.error
          ? "Carol could not sign in, so no link was asked for"
          : "no link was issued, so there was nothing to open",
      },
    ]);
  }
  console.log("");

  // ---- 6. Bob, the outsider ----
  console.log("6. Bob, who is in no team of Alice's, can do none of the five");
  if (bob.error) {
    record([{ what: "Bob's five attempts", verdict: UNVERIFIED, detail: "Bob could not sign in" }]);
  } else {
    record(
      judgeCannotList(
        await storageJson("POST", `/object/list/${BUCKET}`, {
          accessToken: bob.accessToken,
          body: { prefix: teamTaskId, limit: 100 },
        }),
        first,
        "Bob lists the task's folder",
      ),
    );
    record(
      judgeCannotDownload(
        await storageBytes(`${storageUrl}${objectPath(teamTaskId, first)}`, {
          accessToken: bob.accessToken,
          logPath: `/storage/v1${objectPath(teamTaskId, first)}`,
        }),
        "Bob opens the file",
      ),
    );
    record(
      judgeCannotSign(
        await storageJson("POST", `/object/sign/${BUCKET}/${firstKey}`, {
          accessToken: bob.accessToken,
          body: { expiresIn: SIGNED_LINK_SECONDS },
        }),
        "Bob asks for a signed link",
      ),
    );
    record(
      judgeUploadRefused(
        await storageJson("POST", objectPath(teamTaskId, `${MARK}-bob.png`), {
          accessToken: bob.accessToken,
          body: PNG_BYTES,
          contentType: "image/png",
        }),
        "Bob uploads onto Alice's task",
        { statuses: [400, 401, 403] },
      ),
    );
    record(
      judgeDeleteRefused(
        await storageJson("DELETE", objectPath(teamTaskId, first), { accessToken: bob.accessToken }),
        "Bob deletes Alice's file",
      ),
    );
  }
  console.log("");

  // ---- 7. signed out ----
  console.log("7. signed out -- twice, because there are two ways to be");
  console.log("   (a) the publishable key and no token; (b) no credentials at all");
  for (const [label, options] of [
    ["the publishable key alone", { apikey: true }],
    ["no credentials at all", { apikey: false }],
  ]) {
    record(
      judgeCannotList(
        await storageJson("POST", `/object/list/${BUCKET}`, { ...options, body: { prefix: teamTaskId, limit: 100 } }),
        first,
        `${label}: list`,
      ),
    );
    record(
      judgeCannotDownload(
        await storageBytes(`${storageUrl}${objectPath(teamTaskId, first)}`, {
          ...options,
          logPath: `/storage/v1${objectPath(teamTaskId, first)}`,
        }),
        `${label}: open`,
      ),
    );
    record(
      judgeCannotSign(
        await storageJson("POST", `/object/sign/${BUCKET}/${firstKey}`, {
          ...options,
          body: { expiresIn: SIGNED_LINK_SECONDS },
        }),
        `${label}: ask for a link`,
      ),
    );
    record(
      judgeUploadRefused(
        await storageJson("POST", objectPath(teamTaskId, `${MARK}-anon.png`), {
          ...options,
          body: PNG_BYTES,
          contentType: "image/png",
        }),
        `${label}: upload`,
        { statuses: [400, 401, 403] },
      ),
    );
    record(
      judgeDeleteRefused(
        await storageJson("DELETE", objectPath(teamTaskId, first), options),
        `${label}: delete`,
      ),
    );
  }
  console.log("");

  // ---- 8. paths that name no task the caller can see ----
  console.log("8. a made-up task id, and a path with no folder at all");
  const madeUpTask = "99999999-9999-4999-8999-999999999999";
  record(
    judgeUploadRefused(
      await storageJson("POST", objectPath(madeUpTask, `${MARK}-ghost.png`), {
        accessToken: alice.accessToken,
        body: PNG_BYTES,
        contentType: "image/png",
      }),
      "Alice uploads under a task id that does not exist",
      { statuses: [400, 403] },
    ),
  );
  record(
    judgeUploadRefused(
      await storageJson("POST", `/object/${BUCKET}/${MARK}-top-level.png`, {
        accessToken: alice.accessToken,
        body: PNG_BYTES,
        contentType: "image/png",
      }),
      "Alice uploads at the bucket's top level, with no folder",
      { statuses: [400, 403] },
    ),
  );
  console.log("");

  // ---- 9. the bucket's own two limits ----
  console.log("9. the bucket's own limits -- the part no sandbox can test");
  console.log("   Alice, on her own task, so only the bucket can refuse these");
  record(
    judgeUploadRefused(
      await storageJson("POST", objectPath(teamTaskId, `${MARK}-big.png`), {
        accessToken: alice.accessToken,
        body: OVERSIZE_BYTES,
        contentType: "image/png",
      }),
      `a file of ${OVERSIZE_BYTES.length} bytes, one over the bucket's ${MAX_FILE_BYTES}`,
      // 400 as well as 413, for the reason REFUSAL_WRAPPER names: staging was seen
      // to wrap a refusal's real status inside the body. The CODE is the check.
      { statuses: [REFUSAL_WRAPPER, 413], code: TOO_LARGE },
    ),
  );
  record(
    judgeUploadRefused(
      await storageJson("POST", objectPath(teamTaskId, `${MARK}-tool.exe`), {
        accessToken: alice.accessToken,
        body: EXE_BYTES,
        contentType: "application/x-msdownload",
      }),
      "an executable, declared as one",
      { statuses: [400], code: INVALID_MIME },
    ),
  );
  record(
    judgeUploadRefused(
      await storageJson("POST", objectPath(teamTaskId, `${MARK}-picture.svg`), {
        accessToken: alice.accessToken,
        body: SVG_BYTES,
        contentType: "image/svg+xml",
      }),
      "AN SVG -- the reason the six types are named instead of image/*",
      { statuses: [400], code: INVALID_MIME },
    ),
  );
  console.log("");

  // ---- 10. three files per task ----
  console.log(`10. ${FILES_PER_TASK} files per task, and the next one refused`);
  for (let n = 2; n <= FILES_PER_TASK; n += 1) {
    const name = `${MARK}-${n}.png`;
    const answer = await storageJson("POST", objectPath(teamTaskId, name), {
      accessToken: alice.accessToken,
      body: PNG_BYTES,
      contentType: "image/png",
    });
    record(judgeUploadAccepted(answer, `file ${n} of ${FILES_PER_TASK} on the same task`));
    if (answer.status === 200) created.files.push(`${teamTaskId}/${name}`);
  }
  record(
    judgeUploadRefused(
      await storageJson("POST", objectPath(teamTaskId, `${MARK}-four.png`), {
        accessToken: alice.accessToken,
        body: PNG_BYTES,
        contentType: "image/png",
      }),
      `file ${FILES_PER_TASK + 1}, which is one too many`,
      { statuses: [400, 403] },
    ),
  );
  console.log("");

  // ---- 11. replace and rename ----
  console.log("11. replace and rename -- nobody, not even the person who uploaded it");
  record(
    judgeReplaceRefused(
      await storageJson("PUT", objectPath(teamTaskId, first), {
        accessToken: alice.accessToken,
        body: EXE_BYTES,
        contentType: "image/png",
      }),
      "Alice replaces the bytes under her own file's name",
    ),
  );
  record(
    judgeRenameRefused(
      await storageJson("POST", "/object/move", {
        accessToken: alice.accessToken,
        body: {
          bucketId: BUCKET,
          sourceKey: firstKey,
          destinationKey: `${personalTaskId || madeUpTask}/${first}`,
        },
      }),
      "Alice moves her file to another task",
    ),
  );
  console.log("");

  // ---- 12. Carol cannot delete Alice's file ----
  console.log("12. Carol can see and open the file, and cannot delete it");
  if (carol.error) {
    record([{ what: "Carol deletes Alice's file", verdict: UNVERIFIED, detail: "Carol could not sign in" }]);
  } else {
    record(
      judgeDeleteRefused(
        await storageJson("DELETE", objectPath(teamTaskId, first), { accessToken: carol.accessToken }),
        "Carol deletes a file she did not upload, on a task she did not create",
      ),
    );
  }
  console.log("");

  // ---- 13. the task cannot go while a file remains ----
  console.log("13. the task cannot be deleted while a file is on it");
  record(
    judgeTaskDeleteRefused(
      await rest("DELETE", `tasks?id=eq.${teamTaskId}&select=${TASK_COLUMNS}`, {
        accessToken: alice.accessToken,
      }),
      first,
      "Alice deletes her own task while three files are on it",
    ),
  );
  console.log("");

  // ---- 14. HEIC: refused without a content type, accepted with one ----
  //
  // TWO CHECKS SINCE 9 OCTOBER 2026, where there was one probe. The owner's run
  // settled issue #239's HEIC question -- a .heic name with no content type is
  // refused -- and agreed to this change of expectation. The notes above
  // judgeHeicWithoutContentType say what changed and why it is not a loosening.
  //
  // AND THIS SECTION IS NOW THE MOST USEFUL THING IN THE SCRIPT, for a reason
  // that has nothing to do with what it was written for. Later the same day the
  // owner tried a HEIC photograph THROUGH THE APP, from a Windows PC, and it
  // failed; what the screen said was not recorded, so nobody knows whether the
  // fault is in the app's upload path or in the bucket. The app has since
  // stopped offering `image/heic` at all, and the bucket still permits it
  // (issue #246).
  //
  // SO 14b IS THE CHEAPEST THING THAT WOULD HALVE THAT QUESTION:
  //
  //   14b ACCEPTED -> the bucket is fine, and the fault is in the app's path.
  //   14b REFUSED  -> the bucket does not accept image/heic even when the caller
  //                   declares it, whatever allowed_mime_types says, and
  //                   narrowing the bucket in a migration becomes the honest fix
  //                   rather than a guess.
  //
  // Neither has been run since they were written. These two checks ask about the
  // BUCKET and say nothing about the app, which is the distinction to hold on to
  // when reading a green 14b: it does not mean a person can attach a HEIC photo.
  console.log("14. HEIC: refused without a content type, accepted with image/heic set");
  console.log("    (the BUCKET's behaviour -- the app no longer offers the type at all, issue #246)");
  if (!UUID_PATTERN.test(personalTaskId)) {
    record([{ what: "the two HEIC checks", verdict: UNVERIFIED, detail: "the personal task was not created" }]);
  } else {
    // 14a. The same bytes, the same name, NO Content-Type.
    const bareName = `${MARK}-phone-bare.heic`;
    record(
      judgeHeicWithoutContentType(
        await storageJson("POST", objectPath(personalTaskId, bareName), {
          accessToken: alice.accessToken,
          body: PNG_BYTES,
          // NO Content-Type ON PURPOSE: the declared type then comes from the
          // extension, which is the thing being tested.
        }),
        "a .heic name with NO content type is refused for its type",
      ),
    );

    // 14b. The same bytes, the same extension, with the type this app would set.
    // A DIFFERENT NAME, because a name is unique within a bucket and 14a may
    // have stored something if the answer ever changes -- "400 Asset Already
    // Exists" would then be a failure for the wrong reason.
    const heicName = `${MARK}-phone.heic`;
    const heic = await storageJson("POST", objectPath(personalTaskId, heicName), {
      accessToken: alice.accessToken,
      body: PNG_BYTES,
      contentType: "image/heic",
    });
    record(
      judgeHeicWithContentType(
        heic,
        "the same name WITH image/heic set by the caller is accepted -- the BUCKET's answer, which the app no longer relies on",
      ),
    );
    if (heic.status === 200) {
      created.files.push(`${personalTaskId}/${heicName}`);
      record(
        judgeRecordedInfo(
          await storageJson("GET", `/object/info/${BUCKET}/${personalTaskId}/${heicName}`, {
            accessToken: alice.accessToken,
          }),
          "what Storage recorded about it (#231, #232)",
        ),
      );
    }
  }
  console.log("");
} catch (cause) {
  if (cause?.message !== "stop") {
    console.log("");
    console.log(`  (the run stopped early: ${scrub(String(cause?.message ?? cause))})`);
  }
}

// ---------------------------------------------------------------------------
// Tidy up, and prove it
// ---------------------------------------------------------------------------

console.log("15. tidying up, and leaving the bucket as this run found it");

const aliceSession = sessions.find((s) => s.label === "Alice");
if (aliceSession) {
  // THE FILES GO FIRST, THEN THE TASKS, and that order is the migration's rule
  // rather than tidiness: the database refuses to delete a task that still has
  // files, and the right to delete those files comes FROM the task. Delete the
  // task first and the right vanishes with it. docs/plan.md says so in full.
  for (const key of created.files) {
    const answer = await storageJson("DELETE", `/object/${BUCKET}/${key}`, {
      accessToken: aliceSession.accessToken,
    });
    record(judgeDeleteAccepted(answer, `Alice deletes ${key.split("/")[1]}`));
  }
  for (const taskId of created.tasks) {
    const answer = await rest("DELETE", `tasks?id=eq.${taskId}&select=${TASK_COLUMNS}`, {
      accessToken: aliceSession.accessToken,
    });
    record(judgeTidiedTask(answer, taskId, `Alice removes task ${taskId}`));
  }

  const lists = [];
  for (const taskId of created.tasks) {
    lists.push(
      await storageJson("POST", `/object/list/${BUCKET}`, {
        accessToken: aliceSession.accessToken,
        body: { prefix: taskId, limit: 100 },
      }),
    );
  }
  const taskRead = await rest(
    "GET",
    `tasks?select=${TASK_COLUMNS}&id=in.(${created.tasks.join(",") || "00000000-0000-4000-8000-000000000000"})`,
    { accessToken: aliceSession.accessToken },
  );
  record(judgeLeftNothing(lists, taskRead, "the bucket and the task list are as this run found them"));
} else {
  record([
    {
      what: "the bucket and the task list are as this run found them",
      verdict: UNVERIFIED,
      detail: "Alice never signed in, so nothing was created and nothing had to be removed",
    },
  ]);
}

record(judgeTouchedNothing(REQUEST_LOG));
record(
  judgeNothingLeaked(
    BODIES_SEEN,
    sessions
      .flatMap((s) => [
        [s.accessToken, `${s.label}'s access token`],
        [s.userId, `${s.label}'s user id`],
        [s.email, `${s.label}'s email address`],
      ])
      .concat(PLACEHOLDERS.filter(([, name]) => name === "A_SIGNED_LINK").map(([v]) => [v, "a signed link"])),
  ),
);

for (const session of sessions) await signOut(session);

console.log("");
console.log("---------------------------------------------------------------");
console.log("The footprint of this run, counted rather than estimated:");
console.log(`  uploads attempted:      ${uploadsAttempted}`);
console.log(`  bytes sent:             ${bytesSent.toLocaleString("en-GB")}`);
console.log(`  bytes received back:    ${bytesBack.toLocaleString("en-GB")}`);
console.log(`  files stored at a peak:  ${created.files.length}`);
console.log(`  tasks created:           ${created.tasks.length}`);
console.log(`  requests in total:       ${REQUEST_LOG.length}`);
console.log("");
console.log("If the line above says anything was left behind, these remove it --");
console.log("in the staging SQL editor, and the files through the dashboard,");
console.log("because deleting a row from storage.objects ORPHANS the file:");
for (const taskId of created.tasks) {
  console.log(`  Storage -> ${BUCKET} -> ${taskId}/   (delete the folder)`);
}
for (const taskId of created.tasks) {
  console.log(`  delete from public.tasks where id = '${taskId}';`);
}
console.log("");
console.log(`${passes} PASS, ${failures} FAIL, ${unverified} UNVERIFIED.`);
console.log("");
if (failures > 0) {
  console.log("READ SECTION 2 FIRST: a bucket that is not there explains everything");
  console.log("below it, and before `supabase db push` that is the expected result.");
  console.log("The migration IS applied to staging as of 9 Oct 2026, so section 2");
  console.log("passing and something below it failing is a real finding.");
}
console.log("Nothing in this run was production. Nothing here deployed anything.");
process.exit(failures > 0 ? 1 : 0);

// ---------------------------------------------------------------------------
// How to run it
// ---------------------------------------------------------------------------
//
// The logic check, which needs nothing at all:
//
//   node scripts/staging/build-it-23-attachment-checks.mjs --selftest
//
// The staging run needs web/.env.local (the staging URL and publishable key) and
// six values plus a team id in the environment: ALICE_EMAIL, ALICE_PASSWORD,
// BOB_EMAIL, BOB_PASSWORD, CAROL_EMAIL, CAROL_PASSWORD and ALICE_TEAM_ID. See
// docs/environments.md -> "Where the test accounts live".
//
//   bash:
//     export ALICE_EMAIL='...'
//     export ALICE_PASSWORD='...'
//     export BOB_EMAIL='...'
//     export BOB_PASSWORD='...'
//     export CAROL_EMAIL='...'
//     export CAROL_PASSWORD='...'
//     export ALICE_TEAM_ID='...'
//     node scripts/staging/build-it-23-attachment-checks.mjs
//
//   PowerShell:
//     $env:ALICE_EMAIL = '...'
//     $env:ALICE_PASSWORD = '...'
//     $env:BOB_EMAIL = '...'
//     $env:BOB_PASSWORD = '...'
//     $env:CAROL_EMAIL = '...'
//     $env:CAROL_PASSWORD = '...'
//     $env:ALICE_TEAM_ID = '...'
//     node scripts/staging/build-it-23-attachment-checks.mjs
//
// THE BEFORE-AND-AFTER PAIR HAS BEEN RUN, by the owner on 9 October 2026, and is
// in evidence/build-it-23-attachments-bucket.md. A run today is a regression
// check: section 2 should pass, and anything failing under it is a real finding
// rather than a missing bucket.
