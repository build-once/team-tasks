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
// THE COUNT, AND IT IS AN EQUALITY RATHER THAN A FLOOR, on purpose: a button
// appearing in this list that nobody meant to add is worth a red check. So adding a
// button means raising this number in the same change, and saying so in the pull
// request -- 16 -> 17 with Build it 21 (issue #211), whose one new button is the
// Save on the AI suggestions setting. Counted from the list in that session.
check(
  "the buttons that actually exist, counted from the list",
  ALL_BUTTON_IDS.length,
  17,
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
  "ACROSS EVERY BUTTON: each one-button gate accepts exactly itself",
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
//
// NINE SINCE BUILD IT 22 (issue #221), which added "limit" -- today's allowance of
// the thing that spends money, told apart from every other refusal by its code and
// not by its status. It has a sentence in BOTH maps even though create-team can never
// send it: the type requires one, which is the right way round, because a screen that
// met an outcome it had no words for would draw nothing.
const OUTCOME_KEYS = [
  "signin",
  "input",
  "suspended",
  "refused",
  "notfound",
  "conflict",
  "limit",
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
  "every outcome has a sentence in the create-team map: nine outcomes, once each",
  OUTCOME_KEYS.map((key) => count(CREATE_MAP, `${key}:`)),
  OUTCOME_KEYS.map(() => 1),
);

check(
  "every outcome has a sentence in the invitation map too",
  OUTCOME_KEYS.map((key) => count(INVITE_MAP, `${key}:`)),
  OUTCOME_KEYS.map(() => 1),
);

// =========================================================================
// 8. The AI suggestions consent setting, as a screen sees it
// =========================================================================
//
// Build it 21 (issue #211). web/src/lib/consent.ts holds three decisions, and the
// trap in all three is the same one section 1 is about, applied to a boolean instead
// of a row count: A FAILED READ IS NOT "OFF". `data?.enabled ?? false` makes the two
// identical, and a failed read drawn as "off" is this app telling somebody they have
// not consented to something when it does not know.
//
// AND THE SECOND TRAP IS THE TRUTHY TEST. `if (row.enabled)` is correct for a real
// `true` and a real `false` and reads the four-character string "false" as consent.
// The same mistake is checked on the function's side, in
// supabase/functions/_tests/suggest_subtasks_test.ts.
//
// WHAT THIS DOES NOT COVER, said plainly: nothing about the database, and nothing
// about whether suggest-subtasks really refuses. The function's own check is what
// stops anything being sent, and its Deno tests are where that is established. This
// section is about what a screen may SAY.
console.log("\n8. the AI suggestions setting: a failed read is never 'off'");

const {
  CONSENT_OFF,
  CONSENT_ON,
  CONSENT_PATH,
  CONSENT_SETTING_NAME,
  CONSENT_STATES,
  CONSENT_UNREADABLE,
  SETTINGS_GOOD_CODES,
  SETTINGS_OUTCOMES,
  consentState,
  mayAskForSuggestions,
  savedAs,
  settingsSentence,
  settingsWentWell,
} = await load("consent.ts");

check("the three states", CONSENT_STATES.slice(), ["on", "off", "unreadable"]);

check(
  "switched on",
  consentState({ data: [{ enabled: true, changed_at: "2026-10-08T00:00:00Z" }] }),
  CONSENT_ON,
);
check("switched off", consentState({ data: [{ enabled: false }] }), CONSENT_OFF);
check(
  "the RPC's row as an object rather than a one-item list: read the same way",
  consentState({ data: { enabled: true } }),
  CONSENT_ON,
);

// THE ONE THIS SECTION EXISTS FOR.
check(
  "THE READ FAILED: unreadable, NOT off -- a failed read is not a statement about anybody's choice",
  consentState({ failed: true, data: [{ enabled: true }] }),
  CONSENT_UNREADABLE,
);
check(
  "failed wins over a row saying off, too",
  consentState({ failed: true, data: [{ enabled: false }] }),
  CONSENT_UNREADABLE,
);
check(
  "failed with nothing at all",
  consentState({ failed: true }),
  CONSENT_UNREADABLE,
);

// Every shape of nothing.
check("no data at all", consentState({}), CONSENT_UNREADABLE);
check("data is null", consentState({ data: null }), CONSENT_UNREADABLE);
check("an empty list", consentState({ data: [] }), CONSENT_UNREADABLE);
check("a row with no enabled", consentState({ data: [{}] }), CONSENT_UNREADABLE);
check(
  "enabled is null",
  consentState({ data: [{ enabled: null }] }),
  CONSENT_UNREADABLE,
);
check("data is a string", consentState({ data: "on" }), CONSENT_UNREADABLE);
check("data is a number", consentState({ data: 1 }), CONSENT_UNREADABLE);

// THE TRUTHY SHAPES, which are the ones a column read back as text arrives in. Every
// one of them is truthy in JavaScript, and three of them are plausible.
check(
  'the STRING "true"',
  consentState({ data: [{ enabled: "true" }] }),
  CONSENT_UNREADABLE,
);
check(
  'THE STRING "false", WHICH IS TRUTHY',
  consentState({ data: [{ enabled: "false" }] }),
  CONSENT_UNREADABLE,
);
check(
  'the single character "t", which is how Postgres prints a true',
  consentState({ data: [{ enabled: "t" }] }),
  CONSENT_UNREADABLE,
);
check(
  "the number 1",
  consentState({ data: [{ enabled: 1 }] }),
  CONSENT_UNREADABLE,
);
check(
  "the number 0, which is falsy and still not a false",
  consentState({ data: [{ enabled: 0 }] }),
  CONSENT_UNREADABLE,
);

// May the Suggest subtasks button be offered? Only on a setting known to be ON.
check(
  "only a setting known to be ON may be asked on -- unreadable is not a yes",
  CONSENT_STATES.map((state) => mayAskForSuggestions(state)),
  [true, false, false],
);

// "Saved" only after the read-back agrees. Build it 19's rule, applied to a boolean.
console.log("\n8b. 'Saved' only after the setting has been read back");

check(
  "asked for on, read back on",
  savedAs(true, CONSENT_ON),
  true,
);
check("asked for off, read back off", savedAs(false, CONSENT_OFF), true);
check(
  "ASKED FOR ON, READ BACK OFF: not saved, whatever the write answered",
  savedAs(true, CONSENT_OFF),
  false,
);
check("asked for off, read back on: not saved", savedAs(false, CONSENT_ON), false);
check(
  "THE READ-BACK FAILED: not saved. The write may have worked; this does not know",
  [savedAs(true, CONSENT_UNREADABLE), savedAs(false, CONSENT_UNREADABLE)],
  [false, false],
);

// The sentence table, for the reason TEAM_ACTION_OUTCOMES has one: an unrecognised
// code must print nothing at all, so a crafted link cannot display chosen words on
// this site in this site's styling.
console.log("\n8c. the settings sentences are ours, and an unknown code prints nothing");

const SETTINGS_KEYS = [
  "on",
  "off",
  "unconfirmed",
  "failed",
  "needname",
  "badname",
  "button",
];

check(
  "every outcome this app writes has a sentence, and there are no others",
  Object.keys(SETTINGS_OUTCOMES).sort(),
  SETTINGS_KEYS.slice().sort(),
);
check(
  "each one is a non-empty sentence",
  SETTINGS_KEYS.map((key) => typeof SETTINGS_OUTCOMES[key] === "string" && SETTINGS_OUTCOMES[key].length > 10),
  SETTINGS_KEYS.map(() => true),
);
check(
  "each key resolves to its own sentence",
  SETTINGS_KEYS.map((key) => settingsSentence(key) === SETTINGS_OUTCOMES[key]),
  SETTINGS_KEYS.map(() => true),
);
check(
  "AN UNKNOWN CODE PRINTS NOTHING, which is what stops a crafted link showing chosen words",
  [
    settingsSentence("your account has been closed"),
    settingsSentence("__proto__"),
    settingsSentence("toString"),
    settingsSentence("constructor"),
    settingsSentence(undefined),
    settingsSentence(null),
    settingsSentence(42),
    settingsSentence(["on"]),
  ],
  [null, null, null, null, null, null, null, null],
);
check("a code with spaces round it is still read", settingsSentence("  off  "), SETTINGS_OUTCOMES.off);
check(
  "only the two good codes are drawn as good news",
  SETTINGS_KEYS.map((key) => settingsWentWell(key)),
  SETTINGS_KEYS.map((key) => SETTINGS_GOOD_CODES.includes(key)),
);
check(
  "and nothing else is, including an unknown code",
  [settingsWentWell("failed"), settingsWentWell("nonsense"), settingsWentWell(undefined)],
  [false, false, false],
);

// THE SENTENCES THEMSELVES, held to the promises docs/plan.md makes and
// docs/claims.md records. Not a taste check: each of these is the difference between
// a consent screen and a screen that looks like one.
console.log("\n8d. what the consent screen promises, in its own words");

const CONSENT_SOURCE = readFileSync(resolve(LIB, "consent.ts"), "utf8");

check(
  "the setting has ONE name, and it is the plan's",
  CONSENT_SETTING_NAME,
  "AI suggestions",
);
check("and one address", CONSENT_PATH, "/settings");

const {
  CONSENT_HOW_LONG,
  CONSENT_OFF_MEANS,
  CONSENT_ONLY_YOU,
  CONSENT_STARTS_OFF,
  CONSENT_WHAT_IS_SENT,
  CONSENT_WHO_GETS_IT,
} = await load("consent.ts");

// WHO GETS IT MUST BE NAMED. "An AI service" is not an answer to "who has my words",
// and docs/plan.md names the company.
check(
  "the screen names the company the title goes to",
  CONSENT_WHO_GETS_IT.includes("Anthropic"),
  true,
);

// WHAT IS SENT MUST NAME WHAT IS NOT. docs/plan.md's list of what must never go is
// the list this sentence has to be able to answer for.
check(
  "and says what is NOT sent: address, name, user ID, team, other tasks",
  [
    /email address/i.test(CONSENT_WHAT_IS_SENT),
    /\bname\b/i.test(CONSENT_WHAT_IS_SENT),
    /user ID/i.test(CONSENT_WHAT_IS_SENT),
    /team/i.test(CONSENT_WHAT_IS_SENT),
    /other tasks/i.test(CONSENT_WHAT_IS_SENT),
  ],
  [true, true, true, true, true],
);
check(
  "and that it is the title of the ONE task, not the list",
  /one task/i.test(CONSENT_WHAT_IS_SENT),
  true,
);

// OFF MEANS NO MORE GOES, AND NOT THAT ANYTHING COMES BACK. This is the one claim on
// the screen that could not be put right afterwards if it were wrong.
check(
  "off means nothing more is sent",
  /stops anything more being sent/i.test(CONSENT_OFF_MEANS),
  true,
);
check(
  "AND SAYS IT CANNOT BRING BACK WHAT WENT -- the claim that must never be implied",
  /cannot bring back/i.test(CONSENT_OFF_MEANS),
  true,
);
check(
  "the retention figures are Anthropic's, and both are named",
  [/30 days/.test(CONSENT_HOW_LONG), /2 years/.test(CONSENT_HOW_LONG), /Anthropic say/.test(CONSENT_HOW_LONG)],
  [true, true, true],
);
check(
  "it starts off, for everybody",
  /starts off for everybody/i.test(CONSENT_STARTS_OFF),
  true,
);
check(
  "and only the person can change it",
  [/only you/i.test(CONSENT_ONLY_YOU), /nobody in your teams/i.test(CONSENT_ONLY_YOU)],
  [true, true],
);

// NO SCREEN MAY READ THE COLUMN DIRECTLY (issue #207). The module that holds the
// screen's half of this says so, and these two checks are about the files that do the
// reading.
console.log("\n8e. no screen reads the setting's column, and no write asks for it back");

const SETTINGS_ACTIONS = readFileSync(
  resolve(HERE, "..", "web", "src", "app", "settings", "actions.ts"),
  "utf8",
);
const SETTINGS_PAGE = readFileSync(
  resolve(HERE, "..", "web", "src", "app", "settings", "page.tsx"),
  "utf8",
);
const TASKS_PAGE = readFileSync(
  resolve(HERE, "..", "web", "src", "app", "tasks", "page.tsx"),
  "utf8",
);

// Counted as "the RPC's name appears, and `.rpc(` appears" rather than as an exact
// run of characters: the two pages indent that call differently, and a check that
// broke when a line was wrapped would be a check about formatting.
check(
  "all three files read the setting through my_ai_suggestions(), not through a select",
  [
    count(SETTINGS_PAGE, '"my_ai_suggestions"') > 0 && count(SETTINGS_PAGE, ".rpc(") > 0,
    count(TASKS_PAGE, '"my_ai_suggestions"') > 0 && count(TASKS_PAGE, ".rpc(") > 0,
    count(SETTINGS_ACTIONS, '"my_ai_suggestions"') > 0 &&
      count(SETTINGS_ACTIONS, ".rpc(") > 0,
  ],
  [true, true, true],
);

// THE TRAP ISSUE #207 NAMES: `.update({...}).select("ai_suggestions_enabled")` would
// be refused 42501 for the person's own row. No file may ask for either new column
// back, and no file may select either of them at all.
check(
  "NO FILE SELECTS EITHER NEW COLUMN: a select on it is refused for everybody, the person included",
  [
    count(SETTINGS_ACTIONS, '.select("ai_suggestions_enabled")'),
    count(SETTINGS_PAGE, '.select("ai_suggestions_enabled")'),
    count(TASKS_PAGE, '.select("ai_suggestions_enabled")'),
    count(SETTINGS_ACTIONS, "ai_suggestions_changed_at"),
    count(SETTINGS_PAGE, "ai_suggestions_changed_at"),
  ],
  [0, 0, 0, 0, 0],
);
check(
  "and no file reads profiles with a star, which fails outright after the consent migration",
  [
    count(SETTINGS_PAGE, '.select("*")'),
    count(SETTINGS_ACTIONS, '.select("*")'),
    count(TASKS_PAGE, '.select("*")'),
  ],
  [0, 0, 0],
);
// TWO WRITES OF THE SETTING, and that is the number this action should have: the
// ordinary update, and the second one after a profile row has been created for
// somebody who had none (issue #207). A third would be a path nobody meant to add.
//
// The representation each one asks for is `user_id` and the check above is what says
// it is not either new column -- counted there rather than here, because an exact
// count of `.select("user_id")` in this file would also be counting the sentence in
// the comment that explains why it is user_id.
check(
  "the setting is written in exactly the two places this action has for it",
  count(SETTINGS_ACTIONS, "ai_suggestions_enabled: wanted"),
  2,
);
check(
  "the profile insert names only the two columns a client role may insert",
  [
    count(SETTINGS_ACTIONS, ".insert({ user_id: userId, display_name: nickname })"),
    count(SETTINGS_ACTIONS, "ai_suggestions_enabled: wanted,"),
  ],
  [1, 0],
);
check(
  "the module that holds the screen's half says the column cannot be read",
  count(CONSENT_SOURCE, "my_ai_suggestions()") > 0,
  true,
);

// =========================================================================
// 9. Today's limit, as both screens say it
// =========================================================================
//
// Build it 22 (issue #221). docs/plan.md: "When the limit is reached the person sees:
// 'You've reached today's limit. It resets tomorrow.' One sentence for both features,
// saying what happened and when it ends, and naming NO company, model, key, status or
// number."
//
// SO THE THING THIS SECTION IS ABOUT IS THAT THERE IS ONE SENTENCE. It lives in three
// places that must agree character for character -- the function's
// supabase/functions/_shared/limits.ts, web/src/lib/suggestions.ts for My tasks, and
// web/src/lib/teams.ts for My teams -- and each is a deliberate copy, for the reason
// both lib files give: the deployed function is a different program from the one in
// this branch until somebody deploys. A copy that drifts has to be a red check,
// because there is nothing else that would notice.
//
// AND THE OTHER THING IT IS ABOUT IS THE ORDER. A screen that read the limit as one of
// the thirteen plumbing failures would show "Suggestions aren't available right now",
// which is the one piece of advice that is certainly wrong: pressing the button again
// cannot help until tomorrow. docs/plan.md decided that against issue #184's
// condition 3, so it is checked rather than trusted.
console.log("\n9. today's limit: one sentence, in three places, and never the fixed one");

const {
  SUGGESTIONS_DAILY_LIMIT,
  SUGGESTIONS_DAILY_LIMIT_CODE,
  SUGGESTIONS_UNAVAILABLE,
  SUGGEST_DATA,
  SUGGEST_IDLE,
  SUGGEST_LIMIT,
  SUGGEST_STATES,
  SUGGEST_UNAVAILABLE,
  suggestOutcome,
} = await load("suggestions.ts");

// THE SENTENCE, written out here as this script's own statement of the contract.
// Importing it and comparing it with itself could never disagree with anything.
const DAILY_LIMIT_SENTENCE = "You've reached today's limit. It resets tomorrow.";

check("My tasks says the plan's sentence, character for character", SUGGESTIONS_DAILY_LIMIT, DAILY_LIMIT_SENTENCE);

// AND MY TEAMS SAYS THE SAME ONE. teams.ts is read as TEXT, for the reason at the top
// of this file -- it imports through an alias only the Next.js build resolves -- so
// the comparison is that the exact characters appear in it.
check(
  "My teams says the same sentence, and it is in that module exactly once",
  count(TEAMS_SOURCE, DAILY_LIMIT_SENTENCE),
  1,
);

// AND THE FUNCTION SAYS IT TOO, which is the copy that actually reaches a person when
// the screen is an older deploy than the function.
//
// IMPORTED, not read as text, which is unusual for a file under supabase/ and is
// possible for exactly the reason limits.ts has no imports: Node loads it and strips
// the types as it reads it, the same property web/src/lib/suggestions.ts has. So this
// compares the REAL exported constant the two Edge Functions send, not a string that
// happens to appear in a file -- and the comment in that file quoting docs/plan.md
// cannot satisfy it.
const LIMITS_PATH = resolve(
  HERE,
  "..",
  "supabase",
  "functions",
  "_shared",
  "limits.ts",
);
const LIMITS_SOURCE = readFileSync(LIMITS_PATH, "utf8");
const {
  DAILY_LIMIT_CODE: FUNCTION_LIMIT_CODE,
  DAILY_LIMIT_MESSAGE: FUNCTION_LIMIT_MESSAGE,
  DAILY_LIMIT_STATUS: FUNCTION_LIMIT_STATUS,
  DAILY_LIMITS: FUNCTION_LIMITS,
} = await import(pathToFileURL(LIMITS_PATH).href);

check(
  "and so does the function, from its own one file",
  FUNCTION_LIMIT_MESSAGE,
  DAILY_LIMIT_SENTENCE,
);
check(
  "so all three copies are the same characters -- there is ONE sentence",
  [SUGGESTIONS_DAILY_LIMIT === FUNCTION_LIMIT_MESSAGE, count(TEAMS_SOURCE, FUNCTION_LIMIT_MESSAGE)],
  [true, 1],
);
// AND THE CODE THE SCREENS MATCH ON IS THE ONE THE FUNCTION SENDS. This is the pair
// that would otherwise fail silently: a screen reading a code the function never
// sends draws the fixed sentence and nobody ever sees the limit's words.
check(
  "and both screens match on the code the function actually sends",
  [
    SUGGESTIONS_DAILY_LIMIT_CODE === FUNCTION_LIMIT_CODE,
    count(TEAMS_SOURCE, `DAILY_LIMIT_CODE = "${FUNCTION_LIMIT_CODE}"`),
  ],
  [true, 1],
);
check("the status it refuses with is 429", FUNCTION_LIMIT_STATUS, 429);

// THE TWO NUMBERS ARE IN THAT FILE AND IN NO SCREEN. A screen that named the limit
// would be a second place to change it, and would go stale the moment limits.ts
// changed -- which is exactly what docs/plan.md's "one config file" rules out.
check(
  "the limits live in the function's one file, and both are 20",
  [
    FUNCTION_LIMITS.ai_suggestions,
    FUNCTION_LIMITS.invitations,
    Object.keys(FUNCTION_LIMITS).sort().join(","),
  ],
  [20, 20, "ai_suggestions,invitations"],
);
check(
  "and NEITHER SCREEN NAMES A NUMBER in its daily-limit sentence",
  [/\d/.test(SUGGESTIONS_DAILY_LIMIT), /\d/.test(DAILY_LIMIT_SENTENCE)],
  [false, false],
);

// NAMES NO COMPANY, MODEL, KEY, STATUS OR CODE -- docs/plan.md's own list.
check(
  "it names no company, no model, no key and no code",
  [
    /anthropic/i.test(SUGGESTIONS_DAILY_LIMIT),
    /claude/i.test(SUGGESTIONS_DAILY_LIMIT),
    /resend|email service/i.test(SUGGESTIONS_DAILY_LIMIT),
    SUGGESTIONS_DAILY_LIMIT.includes(SUGGESTIONS_DAILY_LIMIT_CODE),
  ],
  [false, false, false, false],
);
check(
  "and says both halves: what happened, and when it ends",
  [/limit/i.test(SUGGESTIONS_DAILY_LIMIT), /tomorrow/i.test(SUGGESTIONS_DAILY_LIMIT)],
  [true, true],
);

// FOUR STATES NOW, and the new one is not the fixed-failure one.
check("the four states My tasks can be in", SUGGEST_STATES.slice(), ["ask", "unavailable", "limit", "data"]);
check(
  "the limit state is its own, not the unavailable one",
  [SUGGEST_LIMIT === SUGGEST_UNAVAILABLE, SUGGESTIONS_DAILY_LIMIT === SUGGESTIONS_UNAVAILABLE],
  [false, false],
);

// THE DECISION ITSELF. A failed call carrying the limit's code is the limit; a failed
// call carrying anything else is the fixed sentence, exactly as before.
check(
  "a failed ask carrying the limit's code is the LIMIT",
  suggestOutcome({ asked: true, failed: true, code: SUGGESTIONS_DAILY_LIMIT_CODE }),
  { state: SUGGEST_LIMIT },
);
check(
  "a failed ask carrying one of the fixed codes is unavailable, as before",
  suggestOutcome({ asked: true, failed: true, code: "not_configured" }),
  { state: SUGGEST_UNAVAILABLE },
);
check(
  "a failed ask carrying the COUNTER'S error code is unavailable: that one is plumbing",
  suggestOutcome({ asked: true, failed: true, code: "daily_limit_unknown" }),
  { state: SUGGEST_UNAVAILABLE },
);
check(
  "a failed ask whose body could not be read at all is unavailable",
  suggestOutcome({ asked: true, failed: true }),
  { state: SUGGEST_UNAVAILABLE },
);

// AND THE CODE IS READ ONLY ON A FAILURE. A 200 carrying that code is not something
// the function sends, and letting a body turn a success into a refusal would mean an
// answer could hide its own suggestions.
check(
  "a SUCCESSFUL ask carrying that code anyway still draws its suggestions",
  suggestOutcome({
    asked: true,
    failed: false,
    code: SUGGESTIONS_DAILY_LIMIT_CODE,
    data: { suggestions: ["Book the hall"] },
  }),
  { state: SUGGEST_DATA, suggestions: ["Book the hall"] },
);
check(
  "and nobody having asked is still idle, whatever code is lying about",
  suggestOutcome({ asked: false, code: SUGGESTIONS_DAILY_LIMIT_CODE }),
  { state: SUGGEST_IDLE },
);

// THE CODE IS COMPARED AS AN EXACT WORD, never used as a word to print and never
// matched loosely. A near-miss must not become a refusal with wording nobody wrote.
check(
  "the code is matched exactly: a near-miss is not the limit",
  [
    suggestOutcome({ asked: true, failed: true, code: "daily_limits" }).state,
    suggestOutcome({ asked: true, failed: true, code: "DAILY_LIMIT" }).state,
    suggestOutcome({ asked: true, failed: true, code: " daily_limit" }).state,
    suggestOutcome({ asked: true, failed: true, code: 429 }).state,
  ],
  [SUGGEST_UNAVAILABLE, SUGGEST_UNAVAILABLE, SUGGEST_UNAVAILABLE, SUGGEST_UNAVAILABLE],
);

// MY TEAMS: the same decision, by the same means. teamActionOutcome is in the module
// that cannot be imported here, so this is checked over its text -- that it reads the
// code for the limit the way it reads it for a suspension, and that the sentence maps
// carry the outcome.
check(
  "My teams tells the limit apart by its CODE, not by its status",
  [
    count(TEAMS_SOURCE, 'DAILY_LIMIT_CODE = "daily_limit"'),
    count(TEAMS_SOURCE, 'answer.code === DAILY_LIMIT_CODE) return "limit"'),
  ],
  [1, 1],
);
// AND THE OUTCOME IS ON THE FIXED LIST, which is what lets the page draw it at all:
// web/src/app/teams/page.tsx refuses any outcome not in TEAM_ACTION_OUTCOMES and
// draws nothing, so a sentence in the maps with no entry on the list would never
// appear.
//
// The list is sliced between its own brackets rather than passed to mapBody, which
// splits on `};` and so would run past the end of an array declaration -- that is
// what this check caught about itself on its first run.
const OUTCOME_LIST = TEAMS_SOURCE.split("export const TEAM_ACTION_OUTCOMES = [")[1]
  ?.split("] as const;")[0] ?? "";
check(
  "and the page would not draw a code it does not know: the outcome is on the fixed list",
  [OUTCOME_LIST !== "", count(OUTCOME_LIST, '"limit",')],
  [true, 1],
);

// AND THE PAGE THAT DRAWS IT. The tasks page must pass the code into the decision and
// must draw the new sentence -- a state nothing rendered would be a blank panel.
check(
  "the tasks page reads the code off the failed answer and passes it in",
  [
    count(TASKS_PAGE, "suggestionsCode") > 0,
    count(TASKS_PAGE, "code: suggestionsCode"),
    count(TASKS_PAGE, "SUGGESTIONS_DAILY_LIMIT"),
  ],
  [true, 1, 2],
);
check(
  "and it draws the limit's own panel, not the fixed sentence's",
  count(TASKS_PAGE, "suggestions.state === SUGGEST_LIMIT"),
  1,
);

// AND IT STILL READS NO MESSAGE. The whole argument beside TEAM_ACTION_OUTCOMES --
// that a function's own words must not reach a screen -- applies to this new read as
// much as to the teams one, so the same check is made of the tasks page.
check(
  "the tasks page reads the CODE and never the message",
  [
    count(TASKS_PAGE, "body as { code?: unknown }"),
    count(TASKS_PAGE, "body as { error?: unknown }"),
  ],
  [1, 0],
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
