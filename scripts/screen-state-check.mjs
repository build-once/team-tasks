#!/usr/bin/env node
// screen-state-check.mjs -- the decisions Build it 19 (issue #173) moved out of the
// screens, checked against the real modules rather than against copies of them.
//
// WHAT IT IS FOR. "Screens that tell the truth" is mostly a set of small judgements
// that each look obviously right and are not. Four of them now live in pure
// modules, and this is where they are asked hundreds of questions with no database,
// no browser and no account:
//
//   screenState     WHICH LOOK A SCREEN SHOWS: loading, error, empty or data. The
//                   trap is that "no rows" and "the read failed" arrive at a screen
//                   looking identical -- `data ?? []` is what every query in this
//                   app does with a null -- so a failed load drawn as an empty list
//                   is the app telling somebody their tasks are gone. `failed` has
//                   to win over the row count, always, and that is what most of
//                   section 1 is about.
//   plainText       NO SCREEN SHOWS "null" OR "undefined". Two of the four shapes a
//                   missing value arrives in are the WORDS, which React draws
//                   exactly as it would draw a name.
//   appVersion      WHAT THE FOOTER SAYS. The old one said "Team Tasks version 2",
//                   which was true of nothing.
//   buttons         A BUTTON ACTS BY A FIXED IDENTIFIER, never by its wording.
//
// And two mappings that are not pure-function decisions so much as promises about
// wording: the Try again targets, and the sentences My teams shows when a server
// function refuses -- which replaced a path that printed whatever the function said.
//
// THE FRIENDLY WORDS ARE NOT HERE. Roles and invitation statuses have their own
// script, scripts/friendly-words-check.mjs, because that one reads the MIGRATIONS
// and compares the mapping with what the database allows. Keeping it separate means
// a red check names which kind of thing went wrong.
//
// IT IMPORTS THE REAL FILES -- web/src/lib/screen-state.ts, words.ts,
// app-version.ts, buttons.ts and teams.ts -- not copies pasted into this script,
// which would prove only that the copies work.
//
// NODE 22.18 OR NEWER, because of that: Node strips the TypeScript types as it
// loads the files. That needs no flag from v22.18.0 and v23.6.0
// (nodejs.org/api/typescript.html, the History table).
//
// ONE OF THE FIVE MODULES HAS AN IMPORT, and it is worth knowing why that is fine:
// web/src/lib/teams.ts imports from web/src/lib/words.ts, by the "@/lib/words"
// alias that only the Next.js build resolves. So teams.ts is NOT imported here --
// its two sentence maps are read as TEXT instead, which is all this script needs of
// them. The four modules it does import have no imports at all.
//
// WHAT IT DOES NOT COVER, said plainly: nothing about the database, nothing about
// what any person can see, and nothing actually drawn on a screen. Whether the My
// tasks page really asks screenState is a question for the diff and for a browser,
// and nobody has looked at this change in a browser -- the pull request says so.
//
// IT CAN FAIL, which is the only reason to trust it passing. Proved by breaking
// each decision in turn and watching the matching checks go red; the runs are in
// evidence/build-it-19-honest-screens.md. The one that matters most is the first:
// make screenState check the row count before `failed`, and a failed load becomes
// an empty list.
//
// It reads two files and connects to nothing. Run it from anywhere:
//   node scripts/screen-state-check.mjs

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, "..", "web", "src", "lib");

const load = (name) => import(pathToFileURL(resolve(LIB, name)).href);

const {
  RETRY_FALLBACK,
  RETRY_TARGETS,
  SCREEN_DATA,
  SCREEN_EMPTY,
  SCREEN_ERROR,
  SCREEN_LOADING,
  SCREEN_STATES,
  retryPath,
  screenState,
  showsData,
  showsError,
} = await load("screen-state.ts");

const { NO_ACCOUNT_NAME, NO_DISPLAY_NAME, accountLabel, plainText } =
  await load("words.ts");

const { NO_VERSION_LABEL, SHORT_COMMIT_LENGTH, appVersion } =
  await load("app-version.ts");

const {
  ACT_FIELD,
  ALL_BUTTON_IDS,
  BUTTON_IDS,
  looksLikeButtonId,
  pressed,
  readButtonId,
} = await load("buttons.ts");

// web/src/lib/teams.ts as TEXT, for the reason given at the top: it imports from
// words.ts through an alias only the Next.js build resolves, so it cannot be
// imported here. What this script wants of it is a promise about wording, and that
// is a question text can answer.
const TEAMS_SOURCE = readFileSync(resolve(LIB, "teams.ts"), "utf8");

// And the action that used to print a function's own message, for the same reason.
const TEAMS_ACTIONS = readFileSync(
  resolve(HERE, "..", "web", "src", "app", "teams", "actions.ts"),
  "utf8",
);

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);

  if (a === b) {
    passed += 1;
    console.log(`PASS  ${name}`);
    return;
  }

  failures.push(name);
  console.log(`FAIL  ${name}\n        expected ${b}\n        got      ${a}`);
}

// How many times a string appears in another. Used only for the two text checks at
// the end; everything else calls a real function.
function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

console.log(`\nChecking the pure modules under ${LIB}\n`);

// =========================================================================
// 1. screenState -- which look a screen shows
// =========================================================================
console.log("1. screenState -- the four looks, and which one wins");

check("the four looks, in the order they are decided", SCREEN_STATES, [
  "loading",
  "error",
  "empty",
  "data",
]);

// ---- the ordinary cases -------------------------------------------------
check(
  "a read that worked, with rows: data",
  screenState({ failed: false, rows: 3 }),
  SCREEN_DATA,
);
check(
  "a read that worked, with no rows: empty",
  screenState({ failed: false, rows: 0 }),
  SCREEN_EMPTY,
);
check(
  "one row is data, not nearly-empty",
  screenState({ failed: false, rows: 1 }),
  SCREEN_DATA,
);
check(
  "a read that failed: error",
  screenState({ failed: true, rows: 0 }),
  SCREEN_ERROR,
);
check(
  "still loading: loading",
  screenState({ loading: true, rows: 0 }),
  SCREEN_LOADING,
);

// ---- THE RULE THIS WHOLE FILE EXISTS FOR --------------------------------
//
// A FAILED LOAD IS NEVER AN EMPTY LIST. Every query in this app does `data ?? []`,
// so a failed read and an empty one both leave a count of nought here -- which is
// exactly the pair of worlds in which the answer must differ.
console.log(
  "\n1a. A FAILED LOAD IS NEVER EMPTY -- the one rule screenState exists to hold",
);
check(
  "failed with nought rows is ERROR, not empty: this is the `data ?? []` case, and the whole point",
  screenState({ failed: true, rows: 0 }),
  SCREEN_ERROR,
);
check(
  "failed with rows is error too: a partial read is not a list",
  screenState({ failed: true, rows: 5 }),
  SCREEN_ERROR,
);
check(
  "failed and loading is loading: nothing has finished, so nothing is known",
  screenState({ loading: true, failed: true, rows: 0 }),
  SCREEN_LOADING,
);
check(
  "not one of the three arguments is enough to turn a failure into an empty list",
  [
    screenState({ failed: true, rows: 0 }),
    screenState({ failed: true, rows: 1 }),
    screenState({ failed: true, rows: 999 }),
    screenState({ failed: true, rows: -1 }),
  ],
  [SCREEN_ERROR, SCREEN_ERROR, SCREEN_ERROR, SCREEN_ERROR],
);

// ---- a count that is not a count ----------------------------------------
//
// None of these says "there are no rows". They say "nobody knows", and the honest
// look for that is the error one -- which at least offers Try again.
console.log("\n1b. a count that is not a count is an unknown, not a nought");
check("no rows argument at all", screenState({ failed: false }), SCREEN_ERROR);
check("an empty object", screenState({}), SCREEN_ERROR);
check(
  "NaN, which is what a length read off a missing array becomes",
  screenState({ rows: Number.NaN }),
  SCREEN_ERROR,
);
check("Infinity", screenState({ rows: Number.POSITIVE_INFINITY }), SCREEN_ERROR);
check("a negative count", screenState({ rows: -1 }), SCREEN_ERROR);
check("a count as a string", screenState({ rows: "0" }), SCREEN_ERROR);
check("null", screenState({ rows: null }), SCREEN_ERROR);

// ---- `failed` and `loading` are read strictly ---------------------------
//
// `=== true`, not a truthy test, so a Postgrest error object handed in by mistake
// is not read as "failed" for the wrong reason -- and so undefined, which is what a
// query with no error gives, means "did not fail".
console.log("\n1c. failed and loading are read strictly, not truthily");
check(
  "undefined failed, which is what a successful query gives, is not a failure",
  screenState({ failed: undefined, rows: 2 }),
  SCREEN_DATA,
);
check(
  "a non-empty string is not `true`",
  screenState({ failed: "yes", rows: 2 }),
  SCREEN_DATA,
);
check(
  "nor is an object, which is the shape a Postgrest error actually has",
  screenState({ failed: { code: "42501" }, rows: 2 }),
  SCREEN_DATA,
);
check(
  "undefined loading is not loading",
  screenState({ loading: undefined, failed: false, rows: 0 }),
  SCREEN_EMPTY,
);

// ---- the two helpers ----------------------------------------------------
console.log("\n1d. showsData and showsError -- one look each, and no overlap");
check(
  "showsData is true for exactly one look",
  SCREEN_STATES.map(showsData),
  [false, false, false, true],
);
check(
  "showsError is true for exactly one look",
  SCREEN_STATES.map(showsError),
  [false, true, false, false],
);

// =========================================================================
// 2. retryPath -- where a Try again button may land
// =========================================================================
//
// The form carries a short identifier and never a path, because a path taken out of
// a form is a path whoever posted the form chose. An identifier this app did not
// write comes back as the front page.
console.log("\n2. retryPath -- a fixed table, so Try again cannot be redirected");

check("the three targets", Object.keys(RETRY_TARGETS).sort(), [
  "home",
  "tasks",
  "teams",
]);
check("every target is an absolute path on this site", Object.values(RETRY_TARGETS).map((p) => p.startsWith("/") && !p.startsWith("//")), [true, true, true]);
check("my tasks", retryPath("tasks"), "/tasks");
check("my teams", retryPath("teams"), "/teams");
check("trimmed", retryPath("  teams  "), "/teams");
check("an unknown identifier", retryPath("elsewhere"), RETRY_FALLBACK);
check("nothing at all", retryPath(undefined), RETRY_FALLBACK);
check("not a string", retryPath(["teams"]), RETRY_FALLBACK);
check(
  "ANOTHER SITE, which is the thing this function exists to refuse",
  retryPath("https://example.invalid/phish"),
  RETRY_FALLBACK,
);
check(
  "a protocol-relative address, which a startsWith('/') check would have let through",
  retryPath("//example.invalid/phish"),
  RETRY_FALLBACK,
);
check(
  "a path on this site that is not on the list is still refused: the list is the point",
  retryPath("/auth/signout"),
  RETRY_FALLBACK,
);
check(
  "a key off Object.prototype cannot be used as a target",
  [retryPath("constructor"), retryPath("toString"), retryPath("__proto__")],
  [RETRY_FALLBACK, RETRY_FALLBACK, RETRY_FALLBACK],
);

// =========================================================================
// 3. plainText -- no screen shows "null" or "undefined"
// =========================================================================
console.log("\n3. plainText -- nothing on a screen is ever the word null");

const GAP = "Unnamed member";

check("an ordinary name", plainText("Carol", GAP), "Carol");
check("trimmed", plainText("  Carol  ", GAP), "Carol");
check("null", plainText(null, GAP), GAP);
check("undefined", plainText(undefined, GAP), GAP);
check("an empty string", plainText("", GAP), GAP);
check("spaces only", plainText("   ", GAP), GAP);

// THE CASE THAT MOTIVATES THE WHOLE FUNCTION. React draws nothing for null and
// undefined, so those two show up as a gap. It draws the WORDS exactly as it would
// draw a name, and a value that has been through a URL, a JSON round trip or a
// String(x) arrives as the word.
check(
  'the WORD "null", which React would draw as four characters of text',
  plainText("null", GAP),
  GAP,
);
check('the WORD "undefined"', plainText("undefined", GAP), GAP);
check('the WORD "NaN"', plainText("NaN", GAP), GAP);
check("the same words in capitals", plainText("NULL", GAP), GAP);
check("the same words with spaces around them", plainText(" Undefined ", GAP), GAP);

check(
  "a real name that merely CONTAINS one of the words is kept: this is not a word filter",
  plainText("Nullable Nora", GAP),
  "Nullable Nora",
);

check("a number is not a string, so it is the fallback", plainText(0, GAP), GAP);
check("a boolean", plainText(false, GAP), GAP);
check("an object", plainText({ name: "Carol" }, GAP), GAP);
check(
  "an array, which is what a repeated query parameter arrives as",
  plainText(["Carol"], GAP),
  GAP,
);
check(
  "IT NEVER RETURNS SOMETHING UNDRAWABLE, over every shape above",
  [
    null,
    undefined,
    "",
    "  ",
    "null",
    "undefined",
    0,
    false,
    {},
    [],
    "Carol",
  ].every((value) => {
    const out = plainText(value, GAP);
    return typeof out === "string" && out.trim() !== "";
  }),
  true,
);

// =========================================================================
// 4. the two gap-fillers, and the account menu
// =========================================================================
console.log("\n4. the words shown in place of a missing name");

check(
  'a missing display name reads "Unnamed member", which is what issue #173 rule 4 asks for',
  NO_DISPLAY_NAME,
  "Unnamed member",
);
check(
  "it is not an address and has no @ in it: an address is never shown to a team mate",
  NO_DISPLAY_NAME.includes("@"),
  false,
);

check("the account menu, with an address", accountLabel("alice@example.com"), "alice@example.com");
check("trimmed", accountLabel("  alice@example.com  "), "alice@example.com");
check(
  "WITH NO EMAIL CLAIM, which Supabase's own JwtPayload type allows",
  accountLabel(undefined),
  NO_ACCOUNT_NAME,
);
check("with null", accountLabel(null), NO_ACCOUNT_NAME);
check('with the word "undefined"', accountLabel("undefined"), NO_ACCOUNT_NAME);
check("what it says instead", NO_ACCOUNT_NAME, "Signed in");

// =========================================================================
// 5. appVersion -- what the footer says
// =========================================================================
console.log("\n5. appVersion -- the commit the build came from, or an honest no");

// A made-up 40-character hex string. Not a commit from this repository: the point
// is the shape, and a real sha here would be a number this script did not count.
const SHA = "0123456789abcdef0123456789abcdef01234567";

check(
  "a production build names the commit, short, with no place word",
  appVersion(SHA, "production"),
  { label: "Version 0123456", commit: "0123456" },
);
check(
  "A PREVIEW SAYS SO, which is the one that matters: a preview that looks like production is how somebody tests the wrong deployment",
  appVersion(SHA, "preview"),
  { label: "Version 0123456 (preview)", commit: "0123456" },
);
check(
  "Vercel's third name",
  appVersion(SHA, "development"),
  { label: "Version 0123456 (development)", commit: "0123456" },
);
check("the short length is seven, as git log --oneline prints", SHORT_COMMIT_LENGTH, 7);
check(
  "upper case is accepted and lower-cased",
  appVersion(SHA.toUpperCase(), "production"),
  { label: "Version 0123456", commit: "0123456" },
);
check("trimmed", appVersion(` ${SHA} `, " PRODUCTION "), {
  label: "Version 0123456",
  commit: "0123456",
});
check(
  "a deployment name this app has never heard of is NAMED rather than hidden: a fourth kind of deployment is news",
  appVersion(SHA, "canary"),
  { label: "Version 0123456 (canary)", commit: "0123456" },
);

// ---- and everything that is not a commit --------------------------------
console.log("\n5a. anything that is not 40 hex digits is NOT a commit");
check("no commit at all", appVersion(undefined, undefined), {
  label: NO_VERSION_LABEL,
  commit: null,
});
check(
  "an empty string, which is what next.config.ts puts there off Vercel",
  appVersion("", "development"),
  { label: NO_VERSION_LABEL, commit: null },
);
check(
  'the WORD "undefined", which is what an unset env var substituted as written becomes',
  appVersion("undefined", "production"),
  { label: NO_VERSION_LABEL, commit: null },
);
check("the word null", appVersion("null", "production"), {
  label: NO_VERSION_LABEL,
  commit: null,
});
check("a short sha", appVersion("0123456", "production"), {
  label: NO_VERSION_LABEL,
  commit: null,
});
check("41 characters", appVersion(`${SHA}0`, "production"), {
  label: NO_VERSION_LABEL,
  commit: null,
});
check("40 characters with a non-hex letter in them", appVersion(`${SHA.slice(0, 39)}z`, "production"), {
  label: NO_VERSION_LABEL,
  commit: null,
});
check("a branch name", appVersion("feat/honest-screens", "production"), {
  label: NO_VERSION_LABEL,
  commit: null,
});
check("not a string", appVersion(42, "production"), {
  label: NO_VERSION_LABEL,
  commit: null,
});
check(
  "the local sentence says where you are rather than nothing",
  NO_VERSION_LABEL,
  "Local development — no deployed version",
);
check(
  "THE OLD FOOTER'S WORDS ARE GONE: nothing here can produce them",
  [
    appVersion(undefined, undefined).label,
    appVersion(SHA, "production").label,
    appVersion(SHA, "preview").label,
  ].some((label) => label.includes("version 2")),
  false,
);
check(
  "NO LABEL IS EVER EMPTY OR UNDRAWABLE, over every input above",
  [undefined, null, "", "undefined", "null", 42, SHA, `${SHA}0`].every(
    (value) => {
      const label = appVersion(value, undefined).label;
      return typeof label === "string" && label.trim() !== "";
    },
  ),
  true,
);
check(
  "and no label ever contains the words a missing value turns into",
  [undefined, null, "", "undefined", "null", 42].some((value) =>
    /undefined|null|NaN/.test(appVersion(value, value).label),
  ),
  false,
);

// =========================================================================
// 6. buttons -- a button acts by a fixed identifier, never by its wording
// =========================================================================
console.log("\n6. buttons -- the identifier is what a press IS");

check("the field every button submits", ACT_FIELD, "act");

check(
  "every identifier is unique: a copied line that kept the old value is caught here",
  new Set(ALL_BUTTON_IDS).size,
  ALL_BUTTON_IDS.length,
);
check(
  "every identifier has the right shape -- lower case and underscores, so a label pasted into one of these slots fails rather than working",
  ALL_BUTTON_IDS.every(looksLikeButtonId),
  true,
);
check(
  "NO IDENTIFIER IS A LABEL: none contains a space or a capital, which every label in this app does",
  ALL_BUTTON_IDS.some((id) => /[A-Z\s]/.test(id)),
  false,
);
check(
  "the buttons that actually exist, counted from the list",
  ALL_BUTTON_IDS.length,
  16,
);

// ---- readButtonId -------------------------------------------------------
console.log("\n6a. readButtonId -- only what this app wrote");
check("a real identifier", readButtonId("invite_retry"), "invite_retry");
check("trimmed", readButtonId("  invite_retry  "), "invite_retry");
check("nothing at all", readButtonId(undefined), null);
check("an empty string", readButtonId(""), null);
check(
  "THE LABEL, which is the thing this must never accept",
  readButtonId("Try again"),
  null,
);
check("a near miss", readButtonId("invite_retries"), null);
check("the wrong case", readButtonId("INVITE_RETRY"), null);
check(
  "a repeated field, which arrives as an array",
  readButtonId(["invite_send", "invite_retry"]),
  null,
);
check("markup", readButtonId("<script>alert(1)</script>"), null);
check(
  "a key off Object.prototype",
  [readButtonId("constructor"), readButtonId("toString")],
  [null, null],
);

// ---- pressed ------------------------------------------------------------
//
// The question each action asks. The one that matters is the LAST: inviteMember
// serves two buttons, and every other action serves one -- so each action must
// refuse the other buttons' identifiers, or the identifier is decoration.
console.log("\n6b. pressed -- each action answers to its own buttons and no others");
check(
  "the one it is for",
  pressed(BUTTON_IDS.taskAdd, [BUTTON_IDS.taskAdd]),
  true,
);
check(
  "ANOTHER BUTTON'S IDENTIFIER IS REFUSED: a delete must not reach the add",
  pressed(BUTTON_IDS.taskDelete, [BUTTON_IDS.taskAdd]),
  false,
);
check("nothing at all", pressed(undefined, [BUTTON_IDS.taskAdd]), false);
check(
  "both of the two that share inviteMember are accepted there",
  [
    pressed(BUTTON_IDS.inviteSend, [BUTTON_IDS.inviteSend, BUTTON_IDS.inviteRetry]),
    pressed(BUTTON_IDS.inviteRetry, [BUTTON_IDS.inviteSend, BUTTON_IDS.inviteRetry]),
  ],
  [true, true],
);
check(
  "and nothing else is",
  pressed(BUTTON_IDS.teamCreate, [BUTTON_IDS.inviteSend, BUTTON_IDS.inviteRetry]),
  false,
);
check(
  "an empty allow-list accepts nothing, including a real identifier",
  pressed(BUTTON_IDS.taskAdd, []),
  false,
);

// EVERY identifier against EVERY one-button allow-list: the diagonal must be true
// and nothing else may be. This is the whole promise in one check, and it is the
// one that goes red if `pressed` is ever loosened to "is it a known identifier".
check(
  "ACROSS ALL 16 BUTTONS: each one-button gate accepts exactly itself",
  ALL_BUTTON_IDS.map((gate) =>
    ALL_BUTTON_IDS.filter((id) => pressed(id, [gate])).join(","),
  ),
  ALL_BUTTON_IDS.slice(),
);

// =========================================================================
// 7. My teams never prints a function's own message
// =========================================================================
//
// The two text checks. They are not pure-function questions -- they are questions
// about whether the old path is really gone -- and they are here rather than in a
// comment because a comment saying "we removed that" is not a check.
//
// What was removed: a helper called `messageFrom` in web/src/app/teams/actions.ts
// that read the failed function's body, pulled `error` out of it, and put it in
// `/teams?error=<that text>` for the page to print. The page could not know what it
// was about to draw, and anybody could craft a link to this site that displayed
// words they chose.
console.log("\n7. the raw-message path is gone, and the sentences are ours");

check(
  "the action no longer has the helper that read a function's message",
  count(TEAMS_ACTIONS, "messageFrom"),
  0,
);
check(
  "and no longer builds a /teams address out of one",
  count(TEAMS_ACTIONS, "error=${encodeURIComponent"),
  0,
);
check(
  "it reads the status and the code from the body, and not the message",
  [
    count(TEAMS_ACTIONS, "error.context?.status"),
    count(TEAMS_ACTIONS, "body as { code?: unknown }"),
    count(TEAMS_ACTIONS, "body as { error?: unknown }"),
  ],
  [1, 1, 0],
);
check(
  "THE DETAIL GOES TO ERROR REPORTING INSTEAD, through the existing scrub's beforeSend",
  count(TEAMS_ACTIONS, "Sentry.captureException("),
  1,
);
check(
  "both sentence maps are written in the repository, one sentence per outcome",
  [
    count(TEAMS_SOURCE, "CREATE_TEAM_SENTENCES"),
    count(TEAMS_SOURCE, "INVITE_SENTENCES"),
  ],
  [1, 1],
);
// EVERY OUTCOME HAS A SENTENCE IN BOTH MAPS. TypeScript already requires it --
// both are typed `Record<TeamActionOutcome, string>`, so a missing key is a build
// error -- and this is the check that says so out loud, and that would notice if the
// type were ever loosened to a partial one. Each key appears exactly twice in the
// file: once in each map.
const OUTCOME_KEYS = [
  "signin",
  "input",
  "suspended",
  "refused",
  "notfound",
  "conflict",
  "broke",
  "unreachable",
];

// Each map's own text, cut out between its declaration and the `};` that closes it.
// Scoped rather than counted over the whole file on purpose: INVITATION_FAILURE_
// SENTENCES in the same module has keys called `refused` and `unreachable` too --
// they are the EMAIL SERVICE's failure codes, a different list for a different
// thing -- and a count over the file would have been quietly satisfied by those.
function mapBody(source, name) {
  const after = source.split(`export const ${name}`)[1];
  if (after === undefined) return "";
  return after.split("};")[0];
}

const CREATE_MAP = mapBody(TEAMS_SOURCE, "CREATE_TEAM_SENTENCES");
const INVITE_MAP = mapBody(TEAMS_SOURCE, "INVITE_SENTENCES");

check(
  "both maps were found in the module",
  [CREATE_MAP !== "", INVITE_MAP !== ""],
  [true, true],
);

check(
  "every outcome has a sentence in the create-team map: eight outcomes, once each",
  OUTCOME_KEYS.map((key) => count(CREATE_MAP, `${key}:`)),
  OUTCOME_KEYS.map(() => 1),
);

check(
  "every outcome has a sentence in the invitation map too",
  OUTCOME_KEYS.map((key) => count(INVITE_MAP, `${key}:`)),
  OUTCOME_KEYS.map(() => 1),
);

// ------------------------------------------------------------------- the score
const total = passed + failures.length;
console.log(`\n${passed} of ${total} checks passed.`);

if (failures.length > 0) {
  console.log(`\n${failures.length} FAILED:`);
  for (const name of failures) console.log(`  - ${name}`);
  console.log("");
  process.exit(1);
}

console.log("");
