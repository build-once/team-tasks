#!/usr/bin/env node
// approved-model-check.mjs -- does any file in this repository name an AI model that
// nobody approved?
//
// Build it 20 part 1, issue #183: "A CI check that fails if any file names a model
// that is not in approved-models.json, seen to fail."
//
// WHY THIS CHECK EXISTS, and it is not about tidiness. The model is the thing that
// decides where a person's task title goes, what the reply is like, and what each
// call costs. docs/plan.md pinned it deliberately: "Claude Haiku 4.5, pinned by its
// dated API name rather than a moving alias, so the model cannot change under the app
// without somebody editing a line." A pin is only a pin if there is exactly one place
// to unpin it. Without this check, a model name could arrive in a function, a test
// fixture, a staging script, a workflow or a document, and the one-line edit the plan
// relies on would become a one-line edit *somewhere*.
//
// The commonest way it would happen is the dull way: somebody copies an example out of
// a tutorial, and the example uses the undated alias. That is the moving pointer the
// plan refuses, and it would read as a harmless two-character difference.
//
// WHAT IT DOES:
//   1. Reads supabase/functions/suggest-subtasks/approved-models.json and checks it is
//      a usable list: every entry has a model name and a date it was approved on, and
//      EXACTLY ONE entry is marked for use.
//   2. Walks every text file in this repository and collects every string shaped like
//      an Anthropic model API name.
//   3. Fails if any of those strings is not in the approved file.
//   4. Fails if it scanned nothing, because a check with nothing to check is not a
//      pass (AGENTS.md rule 8).
//
// THE APPROVED FILE IS THE AUTHORITY, so every model-shaped string in THAT file counts
// as approved. That is not a loophole, it is the design: writing a name in that file IS
// the act of approving it, which is why the file also carries who approved it and when,
// and why a reviewer looking at one changed file can see the whole decision.
//
// AND evidence/ IS A RECORD RATHER THAN CODE, which is the one other exemption and the
// one that needs arguing for. An evidence file's job is to say what a command printed on
// a given day, verbatim. This very check's output NAMES the model it refused -- that is
// the most useful thing a failure can say -- so an evidence file recording a run of it
// necessarily quotes an unapproved name. Refusing that would mean either no evidence of
// this check ever failing, or evidence that had been edited to pass a check, which is
// worse than both.
//
// Issue #179 already settled the same question about a different file:
// evidence/build-it-18-sentry.md carries a sentence that stopped being true, and that
// issue says of it, "That one is a dated record of what was true on the day the check was
// run and should NOT be rewritten."
//
// THE EXEMPTION IS NEVER SILENT. Names found under evidence/ are counted and the files
// are listed on every run, so somebody reading the output can see how much is being let
// through and where. What makes it safe is that nothing reads an evidence file: no
// function, no script and no workflow takes a model name from one, so a name there cannot
// become the model this app sends to. Every other directory -- docs/, scripts/,
// supabase/, web/, .github/ -- is scanned in full.
//
// WHAT IT CANNOT DO, so that a green run is not read as more than it is:
//   * It cannot tell whether the approved model is a GOOD choice, whether it still
//     exists, or whether it is about to be retired. approved-models.json records the
//     retirement date Anthropic published; nothing here checks it against the calendar.
//   * It cannot see a model name that is assembled at runtime from pieces, or read from
//     an environment variable, or fetched. It reads the text of files. A determined
//     author can walk past it -- which is true of every check in this repository, and is
//     why the function also refuses to send unless exactly one entry is marked for use.
//   * It says nothing about what any model is actually sent. That is
//     supabase/functions/_tests/suggest_subtasks_test.ts.
//
// IT CHECKS THAT IT CAN FAIL, on every run and not only when somebody remembers.
// `--selftest` alone runs just the logic cases; with no arguments the script runs them
// FIRST and then does the real scan, so the CI job that counts this script's PASS lines
// is also counting the proof that its judgements still refuse a bad file.
//
// NO PACKAGES. Node built-ins only (AGENTS.md rule 17), and no network.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const APPROVED_FILE = join(
  "supabase",
  "functions",
  "suggest-subtasks",
  "approved-models.json",
);

// ---------------------------------------------------------------------------
// What an Anthropic model API name looks like
// ---------------------------------------------------------------------------
//
// THE SHAPE, and the reasoning matters more than the characters because the whole
// check rests on it. Every Anthropic model id on
// https://platform.claude.com/docs/en/about-claude/models/overview begins `claude-`
// and its next segment is either a model family word or a version digit. Written with
// placeholders rather than examples, for a reason given again below: THIS FILE MUST NOT
// NAME A MODEL, or its own scan flags it -- which is what happened on the first run, and
// is recorded in evidence/build-it-20-ai-helper.md.
//
//   claude-<family>-<version>-<date>   family, then version, then a dated snapshot
//   claude-<family>-<version>          family, then version, with no date
//   claude-<version>-<family>-<date>   the older order: version first
//   anthropic.claude-<family>-<...>    the Amazon Bedrock form, which contains the above
//   claude-<family>-<version>@<date>   the Google Cloud form, with an @ before the date
//
// THAT NEXT SEGMENT IS WHAT MAKES THIS USABLE, and it was chosen by measurement rather
// than by taste: this repository already contains `claude-code-action`,
// `claude-pr`, `claude-github-actions-1790855283132` and `claude-execution-output.json`,
// none of which is a model. A pattern that matched `claude-` plus anything would flag all
// four. A pattern that merely required a digit somewhere would flag the third. Requiring
// the segment immediately after `claude-` to be a family word or a digit separates them
// cleanly -- `code`, `pr`, `github` and `execution` are none of those. All four are
// selftest cases below, so that separation is measured rather than asserted.
//
// THE FAMILY LIST WILL GO STALE, and that is a known limit written down rather than
// hidden: a model line Anthropic has not announced yet would not be matched, so a name
// from it could land in a file unnoticed. The list is cheap to extend, and the cost of a
// miss is bounded -- the function sends only what approved-models.json names, whatever
// any other file says.
const FAMILIES = ["opus", "sonnet", "haiku", "fable", "mythos", "instant"];

// The lookbehind refuses a match that is the tail of a longer word -- `notclaude-` plus a
// family and a version is not a model name -- while still allowing a dot before it, which
// is what the Amazon Bedrock form needs.
const MODEL_PATTERN = new RegExp(
  `(?<![a-z0-9-])claude-(?:[0-9]|${FAMILIES.join("|")})[a-z0-9.@:-]*`,
  "gi",
);

/** Every model-shaped string in a piece of text, lower-cased and de-duplicated. */
export function modelNamesIn(text) {
  const found = new Set();
  for (const match of String(text ?? "").matchAll(MODEL_PATTERN)) {
    // A trailing dot or hyphen is punctuation in a sentence, not part of a name: a
    // sentence that ends "...and we send <the name>." must not report a different name
    // from one that ends "...and we send <the name> today". The selftest case "a
    // trailing full stop is punctuation" is this line, measured.
    //
    // No example here, for the reason given at the top: this file must not name a model.
    found.add(match[0].toLowerCase().replace(/[.\-:@]+$/, ""));
  }
  return [...found];
}

// ---------------------------------------------------------------------------
// Reading the approved file
// ---------------------------------------------------------------------------

/**
 * What the approved file allows, and what is wrong with it.
 *
 * Pure: it takes the parsed JSON, so --selftest can hand it every broken shape.
 * Returns { approved: string[], problems: string[] }.
 */
export function judgeApprovedFile(parsed) {
  const problems = [];
  const approved = [];

  const list = parsed?.approved;
  if (!Array.isArray(list)) {
    return {
      approved,
      problems: ["it has no `approved` array, so no model is approved at all"],
    };
  }
  if (list.length === 0) {
    problems.push("the `approved` array is empty, so no model is approved");
  }

  let markedForUse = 0;
  for (const [index, entry] of list.entries()) {
    const where = `approved[${index}]`;
    const model = entry?.model;

    if (typeof model !== "string" || model.trim() === "") {
      problems.push(`${where} has no model name`);
    } else {
      approved.push(model.trim().toLowerCase());
      // The name must actually look like a model name, or the file is approving
      // something this check could never match -- which would be an approval that
      // protects nothing.
      if (modelNamesIn(model).length !== 1) {
        problems.push(
          `${where}'s model ${JSON.stringify(model)} is not shaped like an Anthropic ` +
            `model API name, so nothing this check finds could ever match it`,
        );
      }
    }

    // ISSUE #183 ASKS FOR THE DATE: "The model name lives in one file,
    // approved-models.json, with the date it was approved."
    const approvedOn = entry?.approvedOn;
    if (typeof approvedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(approvedOn)) {
      problems.push(
        `${where} has no approvedOn date in YYYY-MM-DD form, so there is no record of ` +
          `when anybody agreed to it`,
      );
    }

    if (entry?.use === true) markedForUse += 1;
  }

  // EXACTLY ONE, OR THE FUNCTION REFUSES TO SEND. chooseModel in the function itself
  // takes the same view and answers the fixed failure with the code `no_model`; this
  // check is here so that a pull request says so before a deploy does.
  if (markedForUse !== 1) {
    problems.push(
      `${markedForUse} entries are marked "use": true, and exactly one must be. Array ` +
        `order is not an approval, so neither nought nor two can be resolved by guessing`,
    );
  }

  return { approved, problems };
}

// ---------------------------------------------------------------------------
// Which files get read
// ---------------------------------------------------------------------------
//
// Everything in the repository except: the places that are not ours, and the files that
// are not text.

const SKIP_DIRECTORIES = new Set([
  // Not ours, and enormous. web/node_modules alone holds tens of thousands of files
  // from other people, whose documentation and fixtures may legitimately name any
  // model at all -- and none of it is a model THIS app sends.
  "node_modules",
  // Git's own object store, which is binary.
  ".git",
  // Build output. Nothing in it is edited by hand, and it is git-ignored.
  ".next",
  "dist",
  "build",
  "coverage",
]);

// By extension, because reading a PDF or an image as text produces noise and could
// produce a false match out of compressed bytes.
const SKIP_EXTENSIONS = new Set([
  ".pdf", ".ico", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".zip", ".gz", ".tgz", ".br", ".7z", ".mp4", ".mp3", ".wasm",
]);

function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

// Directories whose files are a RECORD of what happened rather than code. Still read,
// still counted, and the names they carry are reported -- but not required to be
// approved. See the long argument in the header. Exported so --selftest can check the
// boundary rather than take it on trust.
export const RECORD_DIRECTORIES = ["evidence/"];

/** Is this path a dated record rather than something that decides behaviour? */
export function isRecord(path) {
  return RECORD_DIRECTORIES.some((prefix) => path.startsWith(prefix));
}

/** Every text file under `from`, as paths relative to the repository root. */
export function textFilesUnder(from, root = from, found = []) {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      textFilesUnder(join(from, entry.name), root, found);
      continue;
    }
    if (!entry.isFile()) continue;
    if (SKIP_EXTENSIONS.has(extensionOf(entry.name))) continue;

    const full = join(from, entry.name);
    // A file too big to be hand-written is a file nobody typed a model name into, and
    // reading one into memory is how a check becomes the slowest job in CI.
    if (statSync(full).size > 2_000_000) continue;

    found.push(relative(root, full).split(sep).join("/"));
  }
  return found;
}

// ---------------------------------------------------------------------------
// Saying what happened
// ---------------------------------------------------------------------------
//
// PASS and FAIL at the start of a line, because .github/workflows/ci.yml's pure-checks
// job counts the PASS lines: a script that compiled, exited 0 and checked nothing would
// otherwise be a green tick.

let passes = 0;
let failures = 0;

function pass(what) {
  passes += 1;
  console.log(`PASS ${what}`);
}

function fail(what) {
  failures += 1;
  console.log(`FAIL ${what}`);
}

// ---------------------------------------------------------------------------
// Can this check fail?
// ---------------------------------------------------------------------------
//
// Every case is a file this script might be handed, or a line it might read. The
// expectation is what the judgement must say about it. Nothing is written and no file
// is read.
//
// THE FIXTURE MODEL NAMES ARE ASSEMBLED FROM PIECES, NEVER WRITTEN OUT, and that is
// the one trick in this file worth pointing at. If a realistic name appeared as a
// literal here, THIS SCRIPT WOULD FLAG ITSELF on its own scan -- and the obvious
// workaround, skipping its own path, would leave the one file in the repository that
// knows what a model name looks like unable to be checked for one. So they are built at
// runtime and the file itself contains no model-shaped string. The same reasoning
// invitation_status_test.ts gives for composing a token-shaped fixture rather than
// writing one, where the scanner was gitleaks rather than this script.
const piece = (...parts) => parts.join("-");

// Shaped exactly like a real dated id, and belonging to no model: the date is in 2099.
const FIXTURE_APPROVED = piece("claude", "haiku", "4", "5", "20991231");
// The undated alias of the same: the moving pointer docs/plan.md refuses.
const FIXTURE_ALIAS = piece("claude", "haiku", "4", "5");
// A different family entirely, which nobody approved.
const FIXTURE_OTHER = piece("claude", "opus", "9", "9");

function runSelftest() {
  console.log("approved-model-check: can these judgements fail?");
  console.log("");

  const cases = [
    // ---- what counts as a model name, and what does not ----
    {
      name: "a dated model id is found",
      run: () => modelNamesIn(`model: "${FIXTURE_APPROVED}"`),
      expect: [FIXTURE_APPROVED],
    },
    {
      name: "THE UNDATED ALIAS IS FOUND TOO -- it is the moving pointer the plan refuses",
      run: () => modelNamesIn(`model: "${FIXTURE_ALIAS}"`),
      expect: [FIXTURE_ALIAS],
    },
    {
      name: "the Amazon Bedrock form is found, prefix and all",
      run: () => modelNamesIn(`anthropic.${FIXTURE_ALIAS}`),
      expect: [FIXTURE_ALIAS],
    },
    {
      name: "the Google Cloud form, with its @ before the date",
      run: () => modelNamesIn(`${FIXTURE_ALIAS}@20991231`),
      expect: [`${FIXTURE_ALIAS}@20991231`],
    },
    {
      name: "the older order, version before family",
      run: () => modelNamesIn(piece("claude", "3", "5", "sonnet", "20991231")),
      expect: [piece("claude", "3", "5", "sonnet", "20991231")],
    },
    {
      name: "a trailing full stop is punctuation, not part of the name",
      run: () => modelNamesIn(`we send ${FIXTURE_ALIAS}.`),
      expect: [FIXTURE_ALIAS],
    },
    {
      name: "upper case is still the same name",
      run: () => modelNamesIn(FIXTURE_ALIAS.toUpperCase()),
      expect: [FIXTURE_ALIAS],
    },
    {
      name: "the same name twice is one name",
      run: () => modelNamesIn(`${FIXTURE_ALIAS} and ${FIXTURE_ALIAS}`),
      expect: [FIXTURE_ALIAS],
    },
    // ---- the four strings this repository already contains, none of them a model ----
    {
      name: "NOT A MODEL: claude-code-action, which is in six workflow files here",
      run: () => modelNamesIn("uses: anthropics/claude-code-action@v1"),
      expect: [],
    },
    { name: "NOT A MODEL: claude-pr", run: () => modelNamesIn("name: claude-pr"), expect: [] },
    {
      name: "NOT A MODEL: claude-github-actions-1790855283132, which DOES contain digits",
      run: () => modelNamesIn("app: claude-github-actions-1790855283132"),
      expect: [],
    },
    {
      name: "NOT A MODEL: claude-execution-output.json",
      run: () => modelNamesIn("writes claude-execution-output.json"),
      expect: [],
    },
    {
      name: "NOT A MODEL: a .claude directory path",
      run: () => modelNamesIn(".claude/guard/rules.json"),
      expect: [],
    },
    {
      name: "NOT A MODEL: the words a person writes, with spaces",
      run: () => modelNamesIn("We use Claude Haiku 4.5 for this."),
      expect: [],
    },
    {
      name: "NOT A MODEL: the tail of a longer word",
      run: () => modelNamesIn(`not${FIXTURE_ALIAS}`),
      expect: [],
    },
    // ---- the approved file itself ----
    {
      name: "a good file: one entry, a name, a date, marked for use",
      run: () =>
        judgeApprovedFile({
          approved: [{ model: FIXTURE_APPROVED, use: true, approvedOn: "2026-10-07" }],
        }).problems,
      expect: [],
    },
    {
      name: "a file with no approved array at all",
      run: () => judgeApprovedFile({}).problems.length > 0,
      expect: true,
    },
    {
      name: "AN EMPTY LIST: nothing is approved, and that is a problem rather than a quiet pass",
      run: () => judgeApprovedFile({ approved: [] }).problems.length > 0,
      expect: true,
    },
    {
      name: "TWO entries marked for use -- array order is not an approval",
      run: () =>
        judgeApprovedFile({
          approved: [
            { model: FIXTURE_APPROVED, use: true, approvedOn: "2026-10-07" },
            { model: FIXTURE_OTHER, use: true, approvedOn: "2026-10-07" },
          ],
        }).problems.length > 0,
      expect: true,
    },
    {
      name: "nothing marked for use: the function would refuse to send, so this says so first",
      run: () =>
        judgeApprovedFile({
          approved: [{ model: FIXTURE_APPROVED, approvedOn: "2026-10-07" }],
        }).problems.length > 0,
      expect: true,
    },
    {
      name: "NO DATE, which issue #183 asks for by name",
      run: () =>
        judgeApprovedFile({ approved: [{ model: FIXTURE_APPROVED, use: true }] }).problems
          .length > 0,
      expect: true,
    },
    {
      name: "a date that is not a date",
      run: () =>
        judgeApprovedFile({
          approved: [{ model: FIXTURE_APPROVED, use: true, approvedOn: "last Tuesday" }],
        }).problems.length > 0,
      expect: true,
    },
    {
      name: "an entry with a date and no model name",
      run: () =>
        judgeApprovedFile({ approved: [{ use: true, approvedOn: "2026-10-07" }] }).problems
          .length > 0,
      expect: true,
    },
    {
      name: "a model name that is not shaped like one, so nothing could ever match it",
      run: () =>
        judgeApprovedFile({
          approved: [{ model: "the fast one", use: true, approvedOn: "2026-10-07" }],
        }).problems.length > 0,
      expect: true,
    },
    {
      name: "a good file still lists its approved name, lower-cased",
      run: () =>
        judgeApprovedFile({
          approved: [
            { model: FIXTURE_APPROVED.toUpperCase(), use: true, approvedOn: "2026-10-07" },
          ],
        }).approved,
      expect: [FIXTURE_APPROVED],
    },
    // ---- the record exemption, and exactly where its edge is ----
    //
    // THESE EXIST SO THE EXEMPTION CANNOT WIDEN WITHOUT SOMEBODY NOTICING. An exemption
    // tested only by the directory it was written for is an exemption that grows a
    // `docs/` or a `scripts/staging/` the next time one is inconvenient.
    { name: "a record: an evidence file is exempt", run: () => isRecord("evidence/build-it-20-ai-helper.md"), expect: true },
    { name: "a record: nested under evidence/", run: () => isRecord("evidence/old/run.md"), expect: true },
    { name: "NOT a record: docs/, which is read by people and quoted into code", run: () => isRecord("docs/plan.md"), expect: false },
    { name: "NOT a record: a script", run: () => isRecord("scripts/approved-model-check.mjs"), expect: false },
    { name: "NOT a record: a staging script", run: () => isRecord("scripts/staging/build-it-20-ai-checks.mjs"), expect: false },
    { name: "NOT a record: the function itself", run: () => isRecord("supabase/functions/suggest-subtasks/index.ts"), expect: false },
    { name: "NOT a record: a test file", run: () => isRecord("supabase/functions/_tests/suggest_subtasks_test.ts"), expect: false },
    { name: "NOT a record: a workflow", run: () => isRecord(".github/workflows/ci.yml"), expect: false },
    { name: "NOT a record: anything in the web app", run: () => isRecord("web/src/lib/suggestions.ts"), expect: false },
    {
      name: "NOT a record: a file whose name merely STARTS with the word evidence",
      run: () => isRecord("evidence-notes.md"),
      expect: false,
    },
    {
      name: "NOT a record: evidence/ somewhere in the middle of a path",
      run: () => isRecord("docs/evidence/plan.md"),
      expect: false,
    },
    { name: "the record list is exactly one directory", run: () => RECORD_DIRECTORIES, expect: ["evidence/"] },

    // ---- and the comparison the whole check comes down to ----
    {
      name: "AN UNAPPROVED NAME IN A FILE IS CAUGHT -- the alias beside the approved id",
      run: () => modelNamesIn(`model: "${FIXTURE_ALIAS}"`).filter((n) => n !== FIXTURE_APPROVED),
      expect: [FIXTURE_ALIAS],
    },
    {
      name: "the approved name in a file is not caught",
      run: () =>
        modelNamesIn(`model: "${FIXTURE_APPROVED}"`).filter((n) => n !== FIXTURE_APPROVED),
      expect: [],
    },
  ];

  let wrong = 0;
  for (const testCase of cases) {
    const got = testCase.run();
    const same = JSON.stringify(got) === JSON.stringify(testCase.expect);
    if (!same) wrong += 1;
    console.log(`  ${same ? "ok  " : "WRONG"}  ${testCase.name}`);
    if (!same) {
      console.log(`          expected ${JSON.stringify(testCase.expect)}`);
      console.log(`          got      ${JSON.stringify(got)}`);
    }
  }

  console.log("");
  console.log(`${cases.length} logic cases, ${wrong} wrong.`);
  console.log("");

  if (wrong > 0) {
    fail(
      `the judgements in approved-model-check do not behave as its comments claim: ` +
        `${wrong} of ${cases.length} logic cases are wrong. A check that cannot fail is ` +
        `worse than no check, because it reports a pass`,
    );
    return false;
  }
  pass(
    `the judgements can fail: all ${cases.length} logic cases behaved as described, ` +
      `including the four strings already in this repository that look like models and ` +
      `are not, and the undated alias, which must be caught`,
  );
  return true;
}

// ---------------------------------------------------------------------------
// The real scan
// ---------------------------------------------------------------------------

function runScan() {
  // ---- 1. the approved file ----
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(ROOT, APPROVED_FILE), "utf8"));
  } catch (cause) {
    fail(
      `${APPROVED_FILE} could not be read or parsed (${cause.message}). Nothing was ` +
        `scanned, because there is nothing to compare against`,
    );
    return;
  }
  pass(`${APPROVED_FILE} exists and parses as JSON`);

  const { approved, problems } = judgeApprovedFile(parsed);
  if (problems.length > 0) {
    for (const problem of problems) fail(`${APPROVED_FILE}: ${problem}`);
  } else {
    pass(
      `${APPROVED_FILE} approves ${approved.length} model name(s), each with the date it ` +
        `was approved, and exactly one is marked for use`,
    );
  }

  const allowed = new Set(approved);

  // ---- 2. every text file ----
  const files = textFilesUnder(ROOT);

  // A check that had nothing to look at is not a pass (AGENTS.md rule 8).
  if (files.length === 0) {
    fail("no text files were found under the repository root, so NOTHING was scanned");
    return;
  }

  const offences = [];
  const inRecords = new Map();
  let scanned = 0;
  let mentioning = 0;

  for (const file of files) {
    let text;
    try {
      text = readFileSync(join(ROOT, file), "utf8");
    } catch {
      // Unreadable is not clean. Named rather than skipped silently.
      offences.push({ file, name: "(could not be read)" });
      continue;
    }
    scanned += 1;

    const names = modelNamesIn(text);
    if (names.length === 0) continue;
    mentioning += 1;

    // THE APPROVED FILE IS THE AUTHORITY, so names in it are approved by being there.
    if (file === APPROVED_FILE.split(sep).join("/")) continue;

    // A DATED RECORD, not code. Counted and listed below rather than refused.
    if (isRecord(file)) {
      const unapproved = names.filter((name) => !allowed.has(name));
      if (unapproved.length > 0) inRecords.set(file, unapproved);
      continue;
    }

    for (const name of names) {
      if (!allowed.has(name)) offences.push({ file, name });
    }
  }

  pass(
    `${scanned} text files were read, of which ${mentioning} ` +
      `${mentioning === 1 ? "names" : "name"} a model at all`,
  );

  // THE EXEMPTION, SAID OUT LOUD ON EVERY RUN. A check that lets something through
  // quietly is a check nobody can audit.
  if (inRecords.size === 0) {
    pass(
      `no file under ${RECORD_DIRECTORIES.join(", ")} names an unapproved model, so the ` +
        `record exemption let nothing through on this run`,
    );
  } else {
    const total = [...inRecords.values()].reduce((sum, list) => sum + list.length, 0);
    pass(
      `${total} unapproved model name(s) appear in ${inRecords.size} file(s) under ` +
        `${RECORD_DIRECTORIES.join(", ")}, and are ALLOWED there: those files record what a ` +
        `command printed on a given day, and this check's own failure output names the model ` +
        `it refused. Nothing reads a model name from them. The files: ` +
        [...inRecords.keys()].join(", ")
    );
  }

  if (offences.length === 0) {
    pass(
      `no file names a model that is not in ${APPROVED_FILE}. The approved name lives in ` +
        `that one file, so changing which model this app sends a task title to is a ` +
        `one-line edit a reviewer cannot miss`,
    );
    return;
  }

  for (const offence of offences) {
    fail(
      `${offence.file} names the model "${offence.name}", which is not approved. ` +
        `Either add it to ${APPROVED_FILE} with the date and who agreed to it, or take ` +
        `it out of that file. If it is the undated alias of an approved id, taking it ` +
        `out is the answer: docs/plan.md pins the dated name on purpose, "so the model ` +
        `cannot change under the app without somebody editing a line"`,
    );
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const onlySelftest = process.argv.slice(2).includes("--selftest");

console.log("approved-model-check -- does any file name a model nobody approved?");
console.log(`  repository root: ${ROOT}`);
console.log(`  the one file allowed to name a model: ${APPROVED_FILE}`);
console.log("");

// THE SELFTEST RUNS EVERY TIME, not only when somebody passes a flag. The CI job counts
// this script's PASS lines, so running the logic cases here means every pull request is
// also told whether these judgements can still fail -- which is the thing that makes the
// scan's own PASS line mean anything.
const logicOk = runSelftest();

if (onlySelftest) {
  console.log("--selftest given, so the repository was NOT scanned.");
} else if (!logicOk) {
  console.log(
    "The logic cases are wrong, so the scan was not run: a scan by broken judgements " +
      "would report a pass it has not earned.",
  );
} else {
  runScan();
}

console.log("");
console.log(`Totals: ${passes} PASS, ${failures} FAIL.`);

if (failures > 0) {
  console.log("");
  console.log("NOT GREEN. Each FAIL above says what to do about it.");
  process.exitCode = 1;
}

// HOW TO RUN IT, from the repository root:
//
//   node scripts/approved-model-check.mjs             the logic cases, then the scan
//   node scripts/approved-model-check.mjs --selftest  the logic cases alone
//
// It reads files and nothing else: no network, no database, no key, no .env file.
//
// CI RUNS THE FIRST FORM, in .github/workflows/ci.yml's pure-checks job, which counts
// the PASS lines and fails if there are fewer than EXPECTED_APPROVED_MODEL_CHECKS. The
// run where it was SEEN TO FAIL -- against a file naming the undated alias -- is in
// evidence/build-it-20-ai-helper.md.
