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

import { readdirSync, readFileSync } from "node:fs";
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

// Build it 27. Loaded here with the others so section 14 runs the real
// functions rather than a copy of their arithmetic.
const {
  FREE_TEAM_MEMBERS,
  PAID_TEAM_MEMBERS,
  ENTITLING_STATUSES: PLAN_ENTITLING,
  PLAN_THANKS,
  memberLimitFor,
  offerSentence,
  onTeamPlan,
} = await load("plan.ts");

const {
  ACT_FIELD,
  ALL_BUTTON_IDS,
  BUTTON_IDS,
  looksLikeButtonId,
  pressed,
  readButtonId,
} = await load("buttons.ts");

// Build it 26, PR 3. web/src/lib/export-data.ts has no imports either, for the
// same reason the four above have none: so this script can load the REAL module
// and call it, rather than proving that a copy of it works.
const {
  EXPORT_FORMAT_VERSION,
  EXPORT_HEADING,
  EXPORT_LINK_LABEL,
  EXPORT_PATH,
  EXPORT_REFUSAL_SENTENCES,
  EXPORT_REFUSED,
  EXPORT_SECTIONS,
  EXPORT_UNKNOWN,
  EXPORT_WORDS,
  NOT_IN_THIS_FILE,
  buildExport,
  exportFileName,
  exportRefusalSentence,
  ownRowsOnly,
  readExportFiles,
} = await load("export-data.ts");

// And the deletion's words. Import-free for the same reason.
const {
  ACCOUNT_DELETED,
  CONFIRM_PHRASE,
  DELETE_CODES,
  DELETE_SENTENCES,
  REQUEST_ADDRESS,
  REQUEST_PATH,
  REQUEST_WORDS,
  deleteOutcome,
  deleteSentence,
  deletionWarning,
  phraseMatches,
} = await load("account-deletion.ts");

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
// Save on the AI suggestions setting, and 17 -> 19 with Build it 23 part 2 (issue
// #242): Open and Delete on a file. Counted from the list in each session.
//
// TWO AND NOT THREE, which is the thing to know when reading that list: the
// Attach beside them is `type="button"` with an onClick, because the file's bytes
// go from the browser straight to Storage and no form is posted -- so there is
// nothing for an identifier to travel to. web/src/app/components/ActButton.tsx
// names every button in the app that is not that component and why.
//
// 19 -> 20 WITH BUILD IT 25 PART 1 (issue #284), and the one new button is
// `link_use` -- the Use this link on /auth/confirm. IT IS THE ONE BUTTON IN THIS
// APP WHOSE WHOLE POINT IS THAT A GET CANNOT PRESS IT: the owner's mail provider
// fetched a reset link before anybody clicked it, so the page now verifies
// nothing and the token is spent only by the action this identifier reaches.
// Counted from the list in this session.
//
// 20 -> 21 WITH BUILD IT 26, and the one new button is `account_delete` -- the
// ONLY IRREVERSIBLE BUTTON IN THE APP. Raising this number is the only thing a
// new button may do to this check: the two assertions that matter -- that every
// identifier is lower-case-and-underscores, and that no LABEL is in the list --
// are untouched, and `account_delete` passes both. The pull request has its own
// line about the number (AGENTS.md rule 20).
//
// 21 -> 22 WITH BUILD IT 27, and the one new button is `plan_upgrade` -- the
// only button in this app that sends somebody to another company's website.
// Same rule as above: raising the number is all a new button may do here, and
// the two assertions that matter are untouched. The pull request has its own
// line about it (AGENTS.md rule 20).
//
// AND IT IS NOT WHAT GUARDS THE PAYMENT, for the same shape of reason as
// account_delete: pressing it starts a Stripe hosted checkout and grants
// nothing. Paid access changes only when stripe-webhook writes the
// entitlement row, which no screen and no user can reach.
//
// AND THE BUTTON IS NOT WHAT GUARDS THE DELETION, which is why adding it is a
// one-number change rather than a decision: the action also requires a typed
// phrase, and supabase/functions/delete-account checks that phrase again for
// itself. Section 13a is where that pair is held.
check(
  "the buttons that actually exist, counted from the list",
  ALL_BUTTON_IDS.length,
  22,
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
// The two files Build it 23 part 2 added to that folder, read as text for the
// same reason as the others: they import through the "@/" alias that only the
// Next.js build resolves, and what section 10 wants of them is a promise about
// shape rather than a function to call.
const TASKS_ACTIONS = readFileSync(
  resolve(HERE, "..", "web", "src", "app", "tasks", "actions.ts"),
  "utf8",
);
const ATTACH_FILE = readFileSync(
  resolve(HERE, "..", "web", "src", "app", "tasks", "AttachFile.tsx"),
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

// ---------------------------------------------------------------------------
// AND THE THIRD DAILY LIMIT, WHICH IS IN A MIGRATION AND NOT IN THAT FILE
// ---------------------------------------------------------------------------
//
// 30 uploads a day, Build it 25 part 2b. docs/plan.md asked for it to go in
// limits.ts beside the two 20s -- "three numbers, one place" -- and the owner
// changed that on 2026-10-12, because an upload has no Edge Function in its path
// and a trigger inside PostgreSQL cannot read a TypeScript file.
//
// THAT DEPARTURE IS THE THING THESE FOUR CHECKS EXIST FOR. A number in an
// unexpected place is only safe while something says it is there on purpose, and
// a SENTENCE in two languages is the shape this repository keeps writing down as
// a thing that drifts.
// TWO FILES, NAMED SEPARATELY, because the trigger function was written twice.
// 20261012120000 created it; 20261012150000 REPLACED its body after the owner's
// staging run of 12 October 2026 showed the first version counted nothing -- the
// Storage API's committing insert has no session, so it took the no-uploader
// branch every time.
//
// SO "THE CURRENT ONE" IS THE SECOND, and the checks below ask it rather than the
// pair. Concatenating them was the first thing tried here and it is wrong in the
// direction that matters: a count over both files answers 2 for a number that
// should appear once, so the check that says "once, as a named constant" would
// have had to be weakened to `>= 1` -- and `>= 1` would pass a migration that
// spelled 30 at four call sites, which is the whole thing it exists to prevent.
const UPLOAD_MIGRATION_FIRST = readFileSync(
  resolve(HERE, "..", "supabase", "migrations", "20261012120000_upload_daily_count.sql"),
  "utf8",
);
const UPLOAD_MIGRATION = readFileSync(
  resolve(HERE, "..", "supabase", "migrations", "20261012150000_upload_count_from_owner_id.sql"),
  "utf8",
);

const TASK_CAP_MIGRATION = readFileSync(
  resolve(HERE, "..", "supabase", "migrations", "20261012094500_task_cap_and_input_limits.sql"),
  "utf8",
);

check(
  "`uploads` is NOT a key in limits.ts, which is the owner's decision of 2026-10-12",
  Object.keys(FUNCTION_LIMITS).includes("uploads"),
  false,
);
check(
  "the 30 is in the current migration, once, as a named constant",
  count(UPLOAD_MIGRATION, "c_uploads_per_day constant integer := 30"),
  1,
);
// AND ONCE IN THE ONE IT REPLACED, so a reader of either file finds the same
// number. The first migration is applied to staging and is not edited; this is
// the check that would notice if somebody edited it anyway.
check(
  "and once in the migration it replaced, which is applied and must not be edited",
  count(UPLOAD_MIGRATION_FIRST, "c_uploads_per_day constant integer := 30"),
  1,
);
// THE SENTENCE, COMPARED ACROSS A LANGUAGE BOUNDARY. The migration spells it in
// SQL, where an apostrophe is doubled, so the comparison has to undo that -- and
// doing it this way round means the check reads the REAL exported constant and
// the REAL migration text rather than two strings this file spells itself.
// TWICE, AND THE TWO ARE DIFFERENT PLACES rather than a copy: the current
// function raises it once on the Storage API's caller-role PROBE, where the
// refusal happens before the bytes are sent, and once on the insert that
// COMMITS, for the race between the two. Asserting 2 rather than `>= 1` is what
// would notice a third appearance -- a call site spelling it again.
check(
  "and the migration says the SAME refusal sentence as the function, character for character",
  count(UPLOAD_MIGRATION, FUNCTION_LIMIT_MESSAGE.replace(/'/g, "''")),
  2,
);
check(
  "CONTROL -- that comparison would notice a different sentence",
  count(UPLOAD_MIGRATION, "You have used all of today's uploads.".replace(/'/g, "''")),
  0,
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

// =========================================================================
// 10. Files on a task: the numbers, the six types, and every sentence
// =========================================================================
//
// Build it 23 part 2 (issue #242). web/src/lib/attachments.ts is the pure half
// of the feature, and three different kinds of thing are checked here.
//
// FIRST, AND IT IS THE ONE WORTH HAVING: THE NUMBERS AND THE TYPES ARE READ OUT
// OF THE MIGRATION'S OWN TEXT and compared with the module's. The database is
// the control -- the bucket's row holds the 5 MB and the six types, and
// public.attachments_may_add() counts the three-per-task and the 100 MB -- so
// every number in that module is a COPY, kept so the screen can say something a
// person can read instead of showing `EntityTooLarge`. A copy nobody checks is a
// copy that drifts, and a drifted copy here means a screen promising a limit the
// database does not keep.
//
// This is the same move scripts/friendly-words-check.mjs makes about roles and
// invitation statuses: read the migration, not a memory of it.
//
// SECOND, the decisions that are genuinely this module's: which content type a
// file's name gets (the finding that made the whole browser upload necessary),
// what a name is rebuilt as, and which sentence a refusal gets.
//
// THIRD, that no sentence carries a word Supabase chose. docs/plan.md asks for
// plain words and NEVER the storage service's own text, and that is a thing a
// check can hold a file to.
console.log("\n10. files on a task -- the numbers against the migration, and the sentences");

const {
  ACCEPTED_TYPES,
  ACCEPT_ATTRIBUTE,
  BUCKET,
  FILE_OUTCOMES,
  FILE_SENTENCES,
  GOOD_OUTCOMES,
  LINK_SECONDS,
  MAX_BYTES_PER_PERSON,
  MAX_FILES_PER_TASK,
  MAX_FILE_BYTES,
  MAX_NAME_CHARS,
  PHOTO_METADATA_LINE,
  TYPE_BY_EXTENSION,
  WHO_CAN_SEE_FILES,
  checkBeforeSending,
  contentTypeFor,
  fileSizeWords,
  objectPath,
  readFileList,
  readFileOutcome,
  storedName,
  taskAndFilesDeleted,
  taskIdOf,
  uploadRefusal,
  UPLOAD_LIMIT_SQLSTATE,
} = await load("attachments.ts");

// tasks.ts, for the cap and the two constraint names. IMPORTED rather than read
// as text, which is possible for the same reason attachments.ts is: it has no
// imports of its own, so Node loads it and strips the types as it reads. That
// means these compare the REAL exported constants and not strings that happen to
// appear in a file.
const {
  TASK_CAP,
  TITLE_CHARS_CONSTRAINT,
  NICKNAME_CHARS_CONSTRAINT,
  CHECK_VIOLATION_CODE,
  constraintNamed,
  // AND BUILD IT 26's TWO: what a task says when its creator has deleted their
  // account, and who may delete one. Section 13d-bis.
  FORMER_MEMBER,
  mayDeleteTask,
} = await load("tasks.ts");

// ---------------------------------------------------------------------------
// AND THE SCREEN NOW SAYS IT TOO -- Build it 25 part 2, the screens
// ---------------------------------------------------------------------------
//
// A FOURTH COPY of the daily-limit sentence, and the first on a screen a person
// reading about files will see. The three above are the Edge Functions' and the
// two screens that draw their refusals; this one is the files panel's.
//
// The comparison is against the REAL exported constant rather than a string this
// file spells, so a reworded sentence in attachments.ts goes red here.
check(
  "the files panel says the SAME daily-limit sentence as the function",
  FILE_SENTENCES.dailylimit,
  FUNCTION_LIMIT_MESSAGE,
);
check(
  "and it names no number, as the other three do not",
  /\d/.test(FILE_SENTENCES.dailylimit),
  false,
);

// THE SQLSTATE THE SCREEN MATCHES ON IS THE ONE THE MIGRATION RAISES. This is
// the pair that would otherwise fail silently: a screen looking for a code the
// trigger never raises would draw the ordinary failure sentence for ever, and
// nothing would say so. The same shape as "both screens match on the code the
// function actually sends", one layer down.
check(
  "and the SQLSTATE it looks for is the one the migration raises",
  count(UPLOAD_MIGRATION, `errcode = '${UPLOAD_LIMIT_SQLSTATE}'`) >= 1,
  true,
);

// THE TASK CAP'S NUMBER IS THE MIGRATION'S. The screen names no number, so this
// is not about the sentence -- it is about TASK_CAP, which exists so the cap can
// be checked against the database rather than remembered.
check(
  "the task cap in the app is the number the migration enforces",
  count(TASK_CAP_MIGRATION, `c_tasks_per_person constant integer := ${TASK_CAP}`),
  1,
);

// AND THE TWO CONSTRAINT NAMES THE SCREENS BRANCH ON REALLY EXIST, spelled the
// same in the app and in the migration. A screen matching a constraint name with
// a typo in it falls to the ordinary sentence and nothing notices -- which is the
// quiet failure this pair exists to stop.
check(
  "the two control-character constraints the screens name are the migration's",
  [
    count(TASK_CAP_MIGRATION, `add constraint ${TITLE_CHARS_CONSTRAINT}`),
    count(TASK_CAP_MIGRATION, `add constraint ${NICKNAME_CHARS_CONSTRAINT}`),
  ],
  [1, 1],
);

// The migration, as text. It cannot be imported -- it is SQL -- and text is all
// this needs of it: the question is whether the same numbers and the same six
// type names appear in both files.
const BUCKET_MIGRATION = readFileSync(
  resolve(
    HERE,
    "..",
    "supabase",
    "migrations",
    "20261008191804_attachments_bucket.sql",
  ),
  "utf8",
);

check(
  "the migration this module copies its numbers from is still there",
  BUCKET_MIGRATION.length > 0,
  true,
);
check(
  "the bucket's name is the same in both",
  [BUCKET, count(BUCKET_MIGRATION, `'${BUCKET}'`) > 0],
  ["attachments", true],
);
check(
  "5 MB: the module's number is the bucket row's own 5242880",
  [MAX_FILE_BYTES, count(BUCKET_MIGRATION, String(MAX_FILE_BYTES)) > 0],
  [5242880, true],
);
check(
  "100 MB: the module's number is attachments_may_add's own 104857600",
  [MAX_BYTES_PER_PERSON, count(BUCKET_MIGRATION, String(MAX_BYTES_PER_PERSON)) > 0],
  [104857600, true],
);
check(
  "3 files a task: the module's number is the migration's c_files_per_task",
  [
    MAX_FILES_PER_TASK,
    count(BUCKET_MIGRATION, `c_files_per_task constant integer := ${MAX_FILES_PER_TASK}`),
  ],
  [3, 1],
);
check(
  "both units are MiB and not millions, which is what makes '20 single 5 MB files' add up",
  [MAX_FILE_BYTES === 5 * 1024 * 1024, MAX_BYTES_PER_PERSON === 100 * 1024 * 1024],
  [true, true],
);
check(
  "a signed link lives docs/plan.md's five minutes, as 300 seconds",
  LINK_SECONDS,
  300,
);

// ---- THE SIX TYPES, against the bucket's own array ----------------------
//
// The wildcard is the thing this check exists for. `image/*` was what the
// migration had before the coach's review of PR #241, and it would have admitted
// image/svg+xml -- a document that can carry script, served back from this
// project's own address through a signed link.
check(
  "every type this app accepts is in the bucket's own allowed_mime_types",
  ACCEPTED_TYPES.filter((type) => count(BUCKET_MIGRATION, `'${type}'`) === 0),
  [],
);
// Five since the HEIC follow-up of 9 October 2026, where it was six. KEPT
// ALONGSIDE the near-identical check further down rather than merged into it, and
// the difference is the method: this one searches the migration's whole text for
// each type, and the one below slices the bucket's `array[...]` out of the insert
// statement. The second is stricter; the first would survive a change that broke
// the slicing. Neither is the other's copy.
check(
  "five of them, named, with no wildcard and no SVG",
  [
    ACCEPTED_TYPES.length,
    ACCEPTED_TYPES.some((type) => type.includes("*")),
    ACCEPTED_TYPES.includes("image/svg+xml"),
  ],
  [5, false, false],
);
// THE BUCKET'S OWN ARRAY, sliced out of the insert statement rather than
// searched for in the whole file -- which is what this check caught about itself
// on its first run. The migration's comments QUOTE `'image/*'` at length, to
// explain why it is not used, so a search over the file found the wildcard in
// the prose that rules it out. Only the statement decides anything.
const TYPE_ARRAY =
  BUCKET_MIGRATION.split("allowed_mime_types)")[1]?.split("array[")[1]?.split("]")[0] ?? "";
check(
  "the bucket's own type array was found, so the two checks below are looking at something",
  [TYPE_ARRAY !== "", count(TYPE_ARRAY, "'image/jpeg'")],
  [true, 1],
);
check(
  "and the array itself names no wildcard and no SVG -- only the statement decides",
  [count(TYPE_ARRAY, "image/*"), count(TYPE_ARRAY, "image/svg+xml")],
  [0, 0],
);
const BUCKET_TYPES = TYPE_ARRAY.split(",")
  .map((line) => line.trim().replace(/'/g, ""))
  .filter((type) => type !== "")
  .sort();

check(
  "the bucket's array still holds six types -- nothing in this change touches it",
  BUCKET_TYPES.length,
  6,
);

// ---- THE APP OFFERS FEWER TYPES THAN THE BUCKET ALLOWS, ON PURPOSE -------
//
// This check used to require the two lists to be EQUAL, and it is the thing the
// HEIC follow-up changed (9 October 2026). The owner tried a HEIC photograph
// through the app on a Windows PC and it failed; the cause was not found and the
// owner decided not to spend time on it. So the app stopped offering HEIC, and
// the bucket -- which still permits it -- was deliberately left alone, because
// changing a bucket means a migration and nobody has established that the fault
// is in the bucket.
//
// SO THE TWO LISTS NOW DIFFER BY EXACTLY ONE TYPE, AND THAT IS ASSERTED RATHER
// THAN TOLERATED. A subset check alone would pass just as happily if somebody
// quietly dropped PNG, and an equality check would fail the moment the app is
// honest about something the bucket allows. What is actually true is a named
// difference, so that is what is written down: the app's list is a subset, and
// the one type on the bucket's side of the line is `image/heic`.
//
// Which also means this check is what a future "let us turn HEIC back on" has to
// come through -- and the issue filed with that follow-up is what says what would
// have to be true first.
check(
  "every type this app offers is one the bucket allows",
  ACCEPTED_TYPES.filter((type) => !BUCKET_TYPES.includes(type)),
  [],
);
check(
  "AND THE BUCKET ALLOWS EXACTLY ONE TYPE THE APP DOES NOT OFFER: image/heic, which failed through the app and is not fixed",
  BUCKET_TYPES.filter((type) => !ACCEPTED_TYPES.includes(type)),
  ["image/heic"],
);
check(
  "so the app offers five, named, with no wildcard and no SVG",
  [
    ACCEPTED_TYPES.length,
    ACCEPTED_TYPES.some((type) => type.includes("*")),
    ACCEPTED_TYPES.includes("image/svg+xml"),
  ],
  [5, false, false],
);
check(
  "HEIC and the two neighbours nobody has been asked about are all absent from the APP's list",
  [
    ACCEPTED_TYPES.includes("image/heic"),
    ACCEPTED_TYPES.includes("image/heif"),
    ACCEPTED_TYPES.includes("image/heic-sequence"),
  ],
  [false, false, false],
);
check(
  "and the two neighbours are absent from the bucket as well -- only HEIC itself was ever added there",
  [count(BUCKET_MIGRATION, "'image/heif'"), count(BUCKET_MIGRATION, "'image/heic-sequence'")],
  [0, 0],
);
check(
  "every extension this app knows maps to one of the five, and nothing else",
  Object.values(TYPE_BY_EXTENSION).filter((type) => !ACCEPTED_TYPES.includes(type)),
  [],
);
check(
  "and every one of the five is reachable from some extension -- an accepted type nothing can produce would be decoration",
  ACCEPTED_TYPES.filter(
    (type) => !Object.values(TYPE_BY_EXTENSION).includes(type),
  ),
  [],
);
check(
  "the file chooser offers the extensions and the types, so a desktop dialogue and a camera roll both filter",
  [
    ACCEPT_ATTRIBUTE.includes(".jpg"),
    ACCEPT_ATTRIBUTE.includes("image/jpeg"),
    ACCEPT_ATTRIBUTE.includes("svg"),
  ],
  [true, true, false],
);
// AND IT OFFERS NO HEIC EITHER, which is the half that decides what a person
// sees: a file chooser that still listed `.heic` would put the photograph in
// front of them and then refuse it after they picked it.
check(
  "and it offers NO .heic and no image/heic, so the chooser does not hold one out",
  [ACCEPT_ATTRIBUTE.includes("heic"), ACCEPT_ATTRIBUTE.includes("heif")],
  [false, false],
);

// ---- contentTypeFor: which type a name gets, and which gets none ---------
//
// WHY THE APP STILL SETS THE TYPE AT ALL, now that the HEIC reason is gone. The
// owner's staging run of 9 October 2026 found that Supabase works the declared
// type out from the extension and does not map `.heic` -- which is why this
// table was written. HEIC has since been dropped from the app's list, so that is
// no longer the reason, and two others remain:
//
//   * THIS APP DECIDES, rather than depending on which extensions Supabase
//     happens to map. Nothing read says what that mapping is for any extension,
//     so every one of the five would otherwise be a guess.
//   * AND A NAME THIS APP DOES NOT KNOW IS REFUSED HERE, IN WORDS, before 5 MB
//     is sent over somebody's connection and refused out there with a code.
//
// So the table stays, with one row fewer.
console.log("\n10a. which content type a file's name gets");
// A .heic PHOTOGRAPH IS REFUSED BY THIS APP, and this is the check the follow-up
// of 9 October 2026 turns on. It asserted `image/heic` until then. The owner
// tried one through the app from a Windows PC, it failed, the cause was not
// found, and the owner decided not to fix it now -- so the app stopped saying it
// works. The bucket still permits the type; the app no longer offers it.
check("A .heic PHOTOGRAPH IS REFUSED: it failed through the app and is not fixed", contentTypeFor("IMG_0042.heic"), null);
check("and in capitals, as a camera writes it, so neither spelling slips through", contentTypeFor("IMG_0042.HEIC"), null);
check("both spellings of a JPEG", [contentTypeFor("a.jpg"), contentTypeFor("a.jpeg")], ["image/jpeg", "image/jpeg"]);
check("a screenshot", contentTypeFor("Screenshot 2026-10-09.png"), "image/png");
check("a PDF", contentTypeFor("receipt.pdf"), "application/pdf");
check("a WebP, which is what a phone browser often re-encodes to", contentTypeFor("photo.webp"), "image/webp");
check("a GIF", contentTypeFor("wave.gif"), "image/gif");
check(
  "AN SVG IS REFUSED HERE TOO, not only by the bucket: the app will not even send one",
  contentTypeFor("picture.svg"),
  null,
);
check("an executable", contentTypeFor("tool.exe"), null);
check("HEIF and HEIC-sequence, which nobody was ever asked about", [contentTypeFor("a.heif"), contentTypeFor("a.heics")], [null, null]);
check("no extension at all", contentTypeFor("photograph"), null);
check("a trailing dot, so no extension", contentTypeFor("photo."), null);
check("a leading dot, so no name", contentTypeFor(".png"), null);
check("nothing at all", [contentTypeFor(undefined), contentTypeFor(null), contentTypeFor("")], [null, null, null]);
check("not a string", contentTypeFor(42), null);
check(
  "THE LAST EXTENSION WINS, which is the honest reading of a double one: this is a .png as far as every extension rule goes",
  contentTypeFor("payload.php.png"),
  "image/png",
);

// ---- storedName: what may be in a path -----------------------------------
//
// The first segment of an object's path is the whole of how every rule in the
// migration decides which task a file belongs to, so a name that could add a
// segment is a name that could move a file to another task.
console.log("\n10b. the name this app is willing to put in a path");
check("an ordinary name survives", storedName("receipt.pdf"), "receipt.pdf");
check(
  "A SLASH CANNOT SURVIVE: it would add a path segment, which is where the task id lives",
  storedName("../../other-task/secret.png"),
  "other-task-secret.png",
);
check("spaces become one dash each run", storedName("my  holiday   photo.jpg"), "my-holiday-photo.jpg");
check("accents and other scripts become dashes, which is a real cost and is written down", storedName("reçu-café.pdf"), "re-u-caf.pdf");
check("a leading dot is dropped, so nothing becomes a hidden file", storedName("...photo.png"), "photo.png");
check("a double dot inside a name is collapsed", storedName("a..b.png"), "a.b.png");
check("the extension is kept whatever happens to the stem", storedName("***.pdf"), null);
check(
  "a name whose extension this app does not accept is refused outright",
  storedName("tool.exe"),
  null,
);
check(
  "the stem is capped and the extension still survives whole",
  (() => {
    const long = `${"a".repeat(MAX_NAME_CHARS + 40)}.png`;
    const out = storedName(long);
    return [out.length, out.endsWith(".png"), out.startsWith("a".repeat(MAX_NAME_CHARS))];
  })(),
  [MAX_NAME_CHARS + 4, true, true],
);
check("nothing usable left", [storedName("---.png"), storedName(".png"), storedName("")], [null, null, null]);

// ---- the path, and reading a task id back off one ------------------------
console.log("\n10c. the path, and the task id in front of it");
const A_TASK = "a1b2c3d4-0001-4e5f-8a9b-0c1d2e3f4a5b";
check("the path is the task id, a slash, and the name", objectPath(A_TASK, "a.png"), `${A_TASK}/a.png`);
check("and the id reads back off it", taskIdOf(`${A_TASK}/a.png`), A_TASK);
check("in capitals too, lower-cased on the way out, as the migration's own lower() does", taskIdOf(`${A_TASK.toUpperCase()}/a.png`), A_TASK);
check("a file at the top level has no task", taskIdOf("a.png"), null);
check("a file nested deeper has no task either", taskIdOf(`${A_TASK}/more/a.png`), null);
check("an empty name is not a file", [taskIdOf(`${A_TASK}/`), taskIdOf(`${A_TASK}/   `)], [null, null]);
check("a first segment that is not a uuid", taskIdOf("not-a-task/a.png"), null);
check("nothing at all", [taskIdOf(undefined), taskIdOf(""), taskIdOf(7)], [null, null, null]);

// ---- what a listing is read as ------------------------------------------
console.log("\n10d. the files a listing answered with");
check(
  "a file, with its size out of metadata",
  readFileList([{ name: "a.png", id: "x", metadata: { size: 1234 } }]),
  [{ name: "a.png", size: 1234 }],
);
check(
  "A FOLDER IS DROPPED: Supabase marks one with a null id, and a folder is not a file to open",
  readFileList([{ name: "sub", id: null, metadata: null }]),
  [],
);
check(
  "a row with no name, and a name that is not a string",
  readFileList([{ id: "x", metadata: {} }, { name: 7, id: "x" }, { name: "  ", id: "x" }]),
  [],
);
check(
  "an unknown size is null and not a nought, so no screen draws a 0 it does not know",
  readFileList([{ name: "a.png", id: "x", metadata: {} }]),
  [{ name: "a.png", size: null }],
);
check(
  "sorted by name, so two views of one task draw the same order",
  readFileList([
    { name: "c.png", id: "x", metadata: { size: 1 } },
    { name: "a.png", id: "x", metadata: { size: 1 } },
    { name: "b.png", id: "x", metadata: { size: 1 } },
  ]).map((row) => row.name),
  ["a.png", "b.png", "c.png"],
);
check(
  "a failed read is not an empty list: anything that is not an array answers with nothing to draw",
  [readFileList(null), readFileList(undefined), readFileList({})],
  [[], [], []],
);
check(
  "a size in words, and nothing at all when it is not known",
  [fileSizeWords(900), fileSizeWords(90000), fileSizeWords(1468006), fileSizeWords(null)],
  ["900 bytes", "88 KB", "1.4 MB", null],
);

// ---- which refusal, and from what ---------------------------------------
//
// THE CODES ARE READ AND NEVER DRAWN, which is the distinction
// web/src/lib/teams.ts draws about `account_suspended`. These checks are about
// the choosing; the one after them is about the sentences never carrying the
// code that chose them.
console.log("\n10e. which sentence a refusal gets, from a status and a code");
check(
  "the bucket's own type refusal",
  uploadRefusal({ status: 400, code: "InvalidMimeType" }),
  "wrongtype",
);
check(
  "the bucket's own size refusal, at EITHER status -- staging was seen to wrap the real one inside the body",
  [
    uploadRefusal({ status: 413, code: "EntityTooLarge" }),
    uploadRefusal({ status: 400, code: "EntityTooLarge" }),
  ],
  ["toobig", "toobig"],
);
check(
  "a row-level refusal on a task that already has its three is TODAY'S THREE, not 'you cannot'",
  uploadRefusal({ status: 403, filesAlready: MAX_FILES_PER_TASK }),
  "toomany",
);
check(
  "a row-level refusal on a task with room is a refusal about permission",
  uploadRefusal({ status: 403, filesAlready: 1 }),
  "notallowed",
);
check(
  "and at the two other statuses a refusal arrives as",
  [uploadRefusal({ status: 401 }), uploadRefusal({ status: 400 })],
  ["notallowed", "notallowed"],
);
check(
  "A STATUS THIS APP HAS NEVER SEEN IS A FAILURE, NOT A REFUSAL: 'try again' is the honest answer",
  [uploadRefusal({ status: 500 }), uploadRefusal({ status: 503 }), uploadRefusal({})],
  ["failed", "failed", "failed"],
);
check(
  "a code of the wrong type is ignored rather than trusted",
  uploadRefusal({ status: 500, code: 42 }),
  "failed",
);
check(
  "and the counted limit is not read off a number it cannot trust",
  uploadRefusal({ status: 403, filesAlready: "three" }),
  "notallowed",
);

console.log("\n10f. what this app refuses before it sends 5 MB over a phone connection");
check(
  "a file one byte over the bucket's limit",
  checkBeforeSending({ name: "a.png", size: MAX_FILE_BYTES + 1 }),
  { ok: false, outcome: "toobig" },
);
check("exactly the limit is fine", checkBeforeSending({ name: "a.png", size: MAX_FILE_BYTES }).ok, true);
check(
  "AN UNKNOWN SIZE IS NOT A SMALL ONE -- the same direction the migration's attachments_file_bytes takes",
  [
    checkBeforeSending({ name: "a.png" }).outcome,
    checkBeforeSending({ name: "a.png", size: "big" }).outcome,
  ],
  ["toobig", "toobig"],
);
check("an empty file, which is what a cancelled chooser leaves", checkBeforeSending({ name: "a.png", size: 0 }), { ok: false, outcome: "failed" });
check("a type this app does not accept", checkBeforeSending({ name: "a.svg", size: 10 }), { ok: false, outcome: "wrongtype" });
check(
  "and a good one comes back with the type to declare and the name to store",
  checkBeforeSending({ name: "IMG 0042.jpg", size: 2048 }),
  { ok: true, contentType: "image/jpeg", storedAs: "IMG-0042.jpg" },
);
// A HEIC PHOTOGRAPH IS REFUSED BEFORE ANYTHING IS SENT, which is the whole point
// of the follow-up: a person gets the plain sentence rather than a 5 MB upload
// and a storage code. It is the same answer as a `.zip`, which is honest --
// nobody here knows why it failed, so the app claims nothing about it.
check(
  "A HEIC PHOTOGRAPH gets the ordinary wrong-type answer, before anything is sent",
  checkBeforeSending({ name: "IMG 0042.heic", size: 2048 }),
  { ok: false, outcome: "wrongtype" },
);

// ---- the sentences ------------------------------------------------------
console.log("\n10g. the sentences, and what none of them says");
check(
  "every outcome has a sentence, and every sentence has an outcome",
  [
    FILE_OUTCOMES.filter((outcome) => typeof FILE_SENTENCES[outcome] !== "string").length,
    Object.keys(FILE_SENTENCES).sort().join(","),
    FILE_OUTCOMES.slice().sort().join(","),
  ],
  [0, FILE_OUTCOMES.slice().sort().join(","), FILE_OUTCOMES.slice().sort().join(",")],
);
// ---- NO SENTENCE NAMES A TYPE THE APP DOES NOT ACCEPT -------------------
//
// The reason this exists, and it is the follow-up of 9 October 2026 rather than
// a general principle somebody thought of in advance: `FILE_WRONG_TYPE` listed
// "JPEG, PNG, WebP, GIF, HEIC or PDF", and when HEIC came off the list that
// sentence became a screen telling somebody a HEIC photograph is accepted,
// immediately after refusing one. The worst kind of wrong message: it names the
// very thing the person just tried.
//
// SO IT IS DERIVED FROM THE LIST RATHER THAN WRITTEN OUT. The word for each
// accepted type must appear in the wrong-type sentence, and the word for every
// type the app does NOT accept must not. Change the list and this check decides
// whether the sentence still agrees with it -- which is what nobody noticed
// needed doing when the list changed.
//
// EVERY SENTENCE IS CHECKED, not only that one: the eleven in the map, plus the
// line about photographs and the line about who can open a file. A type named in
// any of them is a claim about what works.
const TYPE_WORDS = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/gif": "GIF",
  "image/heic": "HEIC",
  "application/pdf": "PDF",
};
const EVERY_SENTENCE = [
  ...FILE_OUTCOMES.map((outcome) => FILE_SENTENCES[outcome]),
  PHOTO_METADATA_LINE,
  WHO_CAN_SEE_FILES,
];
check(
  "the wrong-type sentence names every type the app DOES accept",
  ACCEPTED_TYPES.filter(
    (type) => !FILE_SENTENCES.wrongtype.includes(TYPE_WORDS[type]),
  ),
  [],
);
check(
  "AND NO SENTENCE ANYWHERE NAMES A TYPE THE APP DOES NOT ACCEPT -- which is what HEIC was doing",
  Object.entries(TYPE_WORDS)
    .filter(([type]) => !ACCEPTED_TYPES.includes(type))
    .flatMap(([, word]) =>
      EVERY_SENTENCE.filter((sentence) =>
        sentence.toUpperCase().includes(word.toUpperCase()),
      ).map(() => word),
    ),
  [],
);
check(
  "and the word HEIC appears in no sentence on screen at all",
  EVERY_SENTENCE.filter((sentence) => /heic|heif/i.test(sentence)),
  [],
);

check(
  "the five the owner asked for by name are all there and all different",
  new Set(
    ["toobig", "wrongtype", "toomany", "noroom", "notallowed"].map((o) => FILE_SENTENCES[o]),
  ).size,
  5,
);
check(
  "two of the eleven are good news, and they are the two that report something happening",
  GOOD_OUTCOMES.slice(),
  ["attached", "deleted"],
);

// NEVER THE STORAGE SERVICE'S OWN TEXT. docs/plan.md's requirement, and these
// are the exact words Supabase would have supplied.
const STORAGE_WORDS = [
  "InvalidMimeType",
  "EntityTooLarge",
  "NoSuchKey",
  "NoSuchBucket",
  "AccessDenied",
  "row-level security",
  "Bucket not found",
  "bucket",
  "mime",
  "storage.objects",
  "403",
  "400",
  "413",
  "policy",
];
check(
  "NOT ONE SENTENCE CARRIES A WORD SUPABASE CHOSE, nor a status, nor a code",
  FILE_OUTCOMES.flatMap((outcome) =>
    STORAGE_WORDS.filter((word) =>
      FILE_SENTENCES[outcome].toLowerCase().includes(word.toLowerCase()),
    ).map((word) => `${outcome}: ${word}`),
  ),
  [],
);
// AND NO SENTENCE NAMES A COMPANY. The AI helper's sentences are held to the
// same thing in section 9, and for the same reason: a person pressing a button
// on a to-do list is owed an answer about their file, not about the plumbing.
check(
  "and none names Supabase, Vercel or anybody else",
  FILE_OUTCOMES.filter((outcome) =>
    /supabase|vercel|amazon|s3|aws/i.test(FILE_SENTENCES[outcome]),
  ),
  [],
);
// THE NUMBERS IN A SENTENCE ARE INTERPOLATED FROM THE CONSTANTS, never typed.
// So the two that carry one carry the right one, and the other nine carry none.
check(
  "the two sentences with a number in them have the right numbers",
  [
    FILE_SENTENCES.toobig.includes("5 MB"),
    FILE_SENTENCES.noroom.includes("100 MB"),
    FILE_SENTENCES.toomany.includes(String(MAX_FILES_PER_TASK)),
  ],
  [true, true, true],
);
check(
  "and no other sentence names a number at all",
  FILE_OUTCOMES.filter(
    (outcome) =>
      !["toobig", "noroom", "toomany"].includes(outcome) &&
      /\d/.test(FILE_SENTENCES[outcome]),
  ),
  [],
);
check(
  "100 MB is not said as how much is left, which this screen cannot know",
  /used|using/.test(FILE_SENTENCES.noroom) && !/remaining|left of/.test(FILE_SENTENCES.noroom),
  true,
);

// THE LINE BESIDE THE UPLOAD BOX -- the owner's decision D of 8 October 2026.
// Two things have to be true of it, and both are checked rather than trusted.
check(
  "the photograph line says where AND when, and that this app does not remove it",
  [
    /where/i.test(PHOTO_METADATA_LINE),
    /when/i.test(PHOTO_METADATA_LINE),
    /does not remove/i.test(PHOTO_METADATA_LINE),
  ],
  [true, true, true],
);
check(
  "and it says a photo CAN carry it, not that one does -- nobody here has looked inside one",
  [/\bcan carry\b/i.test(PHOTO_METADATA_LINE), /\bdoes carry\b/i.test(PHOTO_METADATA_LINE)],
  [true, false],
);
check(
  "it is SHORT: a paragraph beside an upload button is a paragraph nobody reads",
  PHOTO_METADATA_LINE.length < 160,
  true,
);
check(
  "and the link's five minutes is said on screen, with who it works for",
  [/5 minutes/.test(WHO_CAN_SEE_FILES), /anyone who has it/i.test(WHO_CAN_SEE_FILES)],
  [true, true],
);

check(
  "only the fixed words are read back off a query string",
  [
    readFileOutcome("attached"),
    readFileOutcome("  deleted  "),
    readFileOutcome("Attached"),
    readFileOutcome("toobigger"),
    readFileOutcome("That file is too big."),
    readFileOutcome(undefined),
    readFileOutcome(["attached"]),
    readFileOutcome("constructor"),
  ],
  ["attached", "deleted", null, null, null, null, null, null],
);
check(
  "the task-deleted sentence counts what went, in the singular and the plural",
  [taskAndFilesDeleted(1), taskAndFilesDeleted(3)],
  ["Task deleted, with the file on it.", "Task deleted, with the 3 files on it."],
);

// ---- and the page, read as text -----------------------------------------
//
// The same two questions section 9 asks of the AI panel: does the page actually
// use the module, and does it keep the plumbing out.
console.log("\n10h. the page, and the one key that must not be anywhere near it");
check(
  "My tasks draws the sentences from the module's map rather than writing its own",
  [count(TASKS_PAGE, "FILE_SENTENCES[fileOutcome]"), count(TASKS_PAGE, "readFileOutcome(file)")],
  [1, 1],
);
check(
  "it offers the upload box, and the line about photographs is DRAWN beside it rather than merely imported",
  [count(TASKS_PAGE, "<AttachFile"), count(ATTACH_FILE, "{PHOTO_METADATA_LINE}")],
  [1, 1],
);
check(
  "the upload is made as the signed-in person, through the browser client",
  [
    count(ATTACH_FILE, 'from "@/lib/supabase/client"'),
    count(ATTACH_FILE, "contentType: ready.contentType"),
  ],
  [1, 1],
);
check(
  "and 'attached' is said only after the file is LISTED BACK, not because an upload returned no error",
  [count(ATTACH_FILE, ".list("), count(ATTACH_FILE, 'setOutcome("attached")')],
  [1, 1],
);
// THE WHOLE OF ISSUE #240 IN ONE CHECK. A service-role key anywhere in web/src
// would mean no policy on storage.objects was evaluated, so neither counted
// limit would be reached and the stored row would have no owner.
check(
  "NO SERVICE-ROLE KEY, AND NO SIGNED UPLOAD URL, anywhere in the upload path",
  [
    /createSignedUploadUrl/.test(ATTACH_FILE),
    /uploadToSignedUrl/.test(ATTACH_FILE),
    /SERVICE_ROLE|SECRET_KEY|sb_secret/i.test(ATTACH_FILE),
    /SERVICE_ROLE|SECRET_KEY|sb_secret/i.test(TASKS_ACTIONS),
  ],
  [false, false, false, false],
);
check(
  "deleting a task clears its files FIRST, and refuses the task if they are still there",
  [
    count(TASKS_ACTIONS, "clearTaskFiles(supabase, id)"),
    count(TASKS_ACTIONS, 'problem: "filesleft"'),
    count(TASKS_ACTIONS, "TASK_HAS_FILES_CODE"),
  ],
  [1, 2, 2],
);
// AND IT ASKS WHOSE TASK IT IS BEFORE IT TOUCHES STORAGE, which is about a
// SENTENCE rather than a rule: clearing first for everybody is safe -- a team
// mate cannot delete the files either -- and would tell them "its files could
// not be removed first", which is true and conceals that the task was never
// theirs. The order is what makes the message right, so the order is checked.
// TWO places send `problem=delete`, and they are the same news in two
// situations: the row is not this person's, and the delete matched nothing. The
// sentence names both possibilities and claims neither, which is why one
// sentence is right for both -- §2d of docs/claims.md.
// ANCHOR CHANGED 2026-10-14, AND THIS IS A RULE 20 LINE. It read:
//
//   TASKS_ACTIONS.indexOf("row.owner_id !== me") <
//     TASKS_ACTIONS.indexOf("clearTaskFiles(supabase, id)")
//
// The property it checks -- the permission is read BEFORE storage is touched --
// is unchanged and still checked. What changed is the string it anchors on,
// because `row.owner_id !== me` was the FAULT the owner's re-test of 14 October
// 2026 found and is gone. Worth noting how this check behaved while the fault
// was there: `indexOf` of a string that is absent is -1, which is less than any
// real index, so it would have gone GREEN against a guard that had been deleted
// altogether. An ordering check anchored on a literal needs the literal to be
// asserted present as well, which is the line below it now.
check(
  "and it reads whose task it is BEFORE clearing, so a team mate is told the truthful thing",
  [
    count(TASKS_ACTIONS, 'problem: "delete"'),
    count(TASKS_ACTIONS, "mayDeleteTask({ owner_id: ownerId, team_id: taskTeamId }"),
    TASKS_ACTIONS.indexOf("mayDeleteTask({ owner_id: ownerId") <
      TASKS_ACTIONS.indexOf("clearTaskFiles(supabase, id)"),
  ],
  [2, 1, true],
);
check(
  "an unreadable claim is not a match, so an unknown is not a yes",
  [
    count(TASKS_ACTIONS, 'typeof me !== "string"'),
    // And the teams read is skipped rather than run with an unknown caller,
    // which is the same answer reached from the other side.
    count(TASKS_ACTIONS, 'typeof me === "string"'),
  ],
  [1, 1],
);

// ---- THE ACTION ASKS THE SAME QUESTION THE SCREEN DID (14 October 2026) ----
//
// THE OWNER'S RE-TEST FOUND BOTH HALVES OF THIS AND THE CHECKS ABOVE FOUND
// NEITHER. The row's Delete control was fixed on 13 October to ask
// `mayDeleteTask`, and two places that decide the same thing were left asking
// `owner_id === me`:
//
//   the ACTION's own guard, `row.owner_id !== me`, which refused a former
//   member's task before it ever reached the database -- while the policy
//   "Team owners can remove a former member's task" was allowing it; and
//   the CONFIRMATION ROW on the page, `confirm === task.id && mine`, so
//   pressing Delete put `?confirm=` in the address bar and drew the ordinary
//   row back again, with nothing to confirm.
//
// WHY THE 13 OCTOBER CHECK PASSED ANYWAY: it asserted `count(TASKS_PAGE,
// "{mine ? (") === 0`, which was true, because the confirmation's condition is
// spelled `confirm === task.id && mine` and does not contain that substring.
// A check that names ONE spelling of a condition proves nothing about the
// others, so these name every place the question is asked and require the
// answer to come from one function.
check(
  "the ACTION asks mayDeleteTask, and compares owner_id to the caller NOWHERE",
  [
    // The CALL, not the word: the word also appears in the import and in the
    // note above the guard, and neither of those is a decision.
    count(TASKS_ACTIONS, "mayDeleteTask({ owner_id: ownerId, team_id: taskTeamId }"),
    // The fault, by name and in both directions, so it cannot come back.
    count(TASKS_ACTIONS, "row.owner_id !== me"),
    count(TASKS_ACTIONS, "row.owner_id === me"),
    count(TASKS_ACTIONS, "ownerId !== me"),
    count(TASKS_ACTIONS, "ownerId === me"),
    // team_id is read as well, because mayDeleteTask needs it: a guard that
    // selected owner_id alone could not answer the new case at all.
    count(TASKS_ACTIONS, '.select("id, owner_id, team_id")'),
    // And the owned teams come from ownership, not from the teams the caller
    // can merely see -- the same narrowness the policy has.
    count(TASKS_ACTIONS, '.eq("owner_id", me)'),
  ],
  [1, 0, 0, 0, 0, 1, 1],
);
check(
  "the CONFIRMATION ROW asks the same question as the control that opened it",
  [
    count(TASKS_PAGE, "confirm === task.id && mayDelete"),
    // The fault: `mine` decided the confirmation while `mayDelete` decided the
    // control, so one step offered what the next one withheld.
    count(TASKS_PAGE, "confirm === task.id && mine"),
    // `mine` survives, and only for what it is actually about: Move to... is
    // the creator's alone, because tasks_enforce_column_rules() refuses a
    // team_id change by anybody else.
    count(TASKS_PAGE, "const canMove = mine &&"),
  ],
  [1, 0, 1],
);
// AND NO OTHER SPELLING OF THE QUESTION IS LEFT ANYWHERE ON THE PAGE, which is
// the general form of what the 13 October check missed: it is not enough to
// forbid one substring. `owner_id === userId` may appear EXACTLY ONCE -- the
// line that defines `mine` -- and every decision is taken from `mine` or
// `mayDelete` rather than from a fresh comparison.
check(
  "owner_id is compared with the caller in exactly one place on the page",
  [
    count(TASKS_PAGE, "task.owner_id === userId"),
    count(TASKS_PAGE, "const mine = task.owner_id === userId;"),
  ],
  [1, 1],
);
// CHANGED 2026-10-12, AND THIS IS THE RULE 20 LINE. It read:
//
//   "and the two file actions read a CODE and never a message"
//     count(TASKS_ACTIONS, "error.message")  ->  0
//     count(ATTACH_FILE,   "error.message")  ->  0
//     count(ATTACH_FILE,   "plumbing.code")  ->  1
//
// IT WENT RED BECAUSE THE OWNER ASKED FOR THE BEHAVIOUR IT FORBADE, on
// 2026-10-12, and in two places at once:
//
//   the daily upload limit reaches the browser as HTTP 500 with SQLSTATE 54000
//   INSIDE A MESSAGE STRING -- so a screen that reads only the status cannot tell
//   it from a real outage, and the owner's rule is "the daily-limit sentence only
//   when the refusal carries 54000";
//
//   the two control-character constraints both raise 23514, and PostgreSQL puts
//   the CONSTRAINT'S NAME in the message and nowhere else a client can reach --
//   so "23514 with the constraint names" needs the message too.
//
// SO THE CHECK IS NARROWED RATHER THAN DROPPED, and it is narrowed towards what
// it was always protecting. "Never reads a message" was a proxy; the real rules
// are that this app never SHOWS a sentence it did not write and never branches on
// somebody else's prose. Both still hold, and now they are what is asserted:
//
//   every read of a message is an argument to one of this project's own readers --
//   constraintNamed(), which yields one of OUR constraint names or null, or
//   uploadRefusal(), which searches for OUR SQLSTATE and returns an outcome word;
//
//   and no message ever reaches a redirect, a banner or a template.
//
// A read that is not one of those two is a FAILURE, so a later `problem:
// error.message` or a sentence built from one is caught exactly as before.
//
// AGREED BY THE OWNER on 12 October 2026, in the instruction that asked for both
// sentences. Rule 20: changing a check is the owner's call, and this is its line.
check(
  "every message read in the two file actions goes to one of OUR readers, and nowhere else",
  [
    // Reads in the tasks actions: each one is a constraintNamed() argument.
    count(TASKS_ACTIONS, "error.message"),
    count(TASKS_ACTIONS, "constraintNamed(error.message)"),
    // And in the client component: one read, and it goes into uploadRefusal.
    // ONE occurrence, because the only place that string appears is the argument
    // itself -- `message: plumbing.message`. Counted, not assumed.
    count(ATTACH_FILE, "plumbing.message"),
    count(ATTACH_FILE, "message: plumbing.message"),
    count(ATTACH_FILE, "plumbing.code"),
  ],
  [2, 2, 1, 1, 1],
);
// AND NOT ONE OF THEM REACHES A PERSON. The half the narrowing above must not
// lose: a message may be read and may never be drawn, forwarded or interpolated.
check(
  "and NO message reaches a redirect, a banner or a template in either file",
  [
    count(TASKS_ACTIONS, "${error.message}"),
    count(ATTACH_FILE, "${plumbing.message}"),
    count(ATTACH_FILE, "${error.message}"),
    count(TASKS_ACTIONS, "problem: error.message"),
    // setOutcome takes an outcome word from the map, never a string from outside.
    count(ATTACH_FILE, "setOutcome(plumbing"),
  ],
  [0, 0, 0, 0, 0],
);
// A FILE'S NAME NEVER GOES IN A LINK, which is why Open and Delete are forms.
check(
  "no control carries a file's name in an address: Open and Delete are forms",
  [
    count(TASKS_PAGE, "action={openFile}"),
    count(TASKS_PAGE, "action={deleteFile}"),
    count(TASKS_PAGE, "name: stored.name"),
  ],
  [1, 1, 0],
);

// =========================================================================
// 11. The privacy page and the terms -- Build it 26, PR 1
// =========================================================================
//
// WHAT THIS SECTION IS FOR, and it is not the same job as every section above
// it. Those read a screen's sentence and check the thing that keeps it. A
// privacy policy's sentences are PROMISES TO PEOPLE ABOUT THEIR OWN DATA, and
// the failure mode is not an ugly screen -- it is telling somebody something
// untrue about where their data went. docs/claims.md section 1f is the
// precedent this project already has: "That link didn't work", drawn over a
// link that had worked, on production, watched by the owner.
//
// So this section checks three things no other section needs to:
//
//   THE DISCIPLINE  every sentence lives in one file, and neither page holds
//                   one. Two long documents have far more room to drift than
//                   the four anti-robot sentences TURNSTILE_WORDS keeps.
//   THE REFUSALS    the five sentences docs/claims.md section 7 marks MUST NOT
//                   SAY -- permanently -- cannot be slipped back in by a later
//                   edit. Each is one a drafter would reach for by habit.
//   THE NUMBERS     every figure is interpolated from the constant the app
//                   itself uses, or -- for the three with no constant in web/ --
//                   is compared with the file that holds the authority. A
//                   policy that says "5 MB" as a literal is a policy that goes
//                   stale against the bucket.
//
// IT READS legal.ts AS TEXT rather than importing it, for the reason the top of
// this file gives about teams.ts: it imports through an alias only the Next.js
// build resolves. What this section wants of it is a promise about wording, and
// that is a question text can answer.
console.log(
  "\n11. The privacy page and the terms -- one file of sentences, six refusals, and the numbers",
);

const LEGAL_SOURCE = readFileSync(resolve(LIB, "legal.ts"), "utf8");
const PRIVACY_PAGE = readFileSync(
  resolve(HERE, "..", "web", "src", "app", "privacy", "page.tsx"),
  "utf8",
);
const TERMS_PAGE = readFileSync(
  resolve(HERE, "..", "web", "src", "app", "terms", "page.tsx"),
  "utf8",
);
const FOOTER_SOURCE = readFileSync(
  resolve(HERE, "..", "web", "src", "app", "components", "Footer.tsx"),
  "utf8",
);
const PROXY_SOURCE = readFileSync(
  resolve(LIB, "supabase", "proxy.ts"),
  "utf8",
);
const INVITATIONS_MIGRATION = readFileSync(
  resolve(
    HERE,
    "..",
    "supabase",
    "migrations",
    "20260930193813_create_invitations.sql",
  ),
  "utf8",
);
const USAGE_MIGRATION = readFileSync(
  resolve(HERE, "..", "supabase", "migrations", "20261008115900_usage_counts.sql"),
  "utf8",
);
const BACKUPS_DOC = readFileSync(
  resolve(HERE, "..", "docs", "backups.md"),
  "utf8",
);

// THE SENTENCES ONLY, with every comment removed.
//
// This is not tidiness: the header of legal.ts NAMES all five forbidden
// sentences, in order to forbid them. A pattern test over the whole file would
// match the prohibition and report the thing it exists to prevent. So the
// comments go first, and what is left is what a person reads on the screen.
function sentencesOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const LEGAL_WORDS = sentencesOnly(LEGAL_SOURCE);

// A sentence-shaped literal: a quoted run of more than 32 characters.
//
// COMMENTS GO FIRST, AND THAT IS NOT OPTIONAL. Every file this is pointed at
// quotes somebody -- an issue, a decision, a vendor's own page -- in its header,
// and a quotation inside a comment is not a sentence anybody reads on a screen.
// Import lines go too, because a module path is long and is not a sentence.
function longLiterals(source) {
  const body = sentencesOnly(source)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("import"))
    .join("\n");

  return (body.match(/"[^"\n]{33,}"|'[^'\n]{33,}'|`[^`\n]{33,}`/g) ?? []).length;
}

// Is this string in there at all? Used where the check is about a SUBJECT not
// leaving the page rather than about a count -- so a sentence can be reworded,
// or said twice, without turning this section red for the wrong reason.
function has(haystack, needle) {
  return haystack.includes(needle);
}

// 11a. NO SENTENCE LIVES IN A PAGE.
//
// The two pages map over the arrays in legal.ts and render nothing of their own,
// so a reviewer reading one file has read every word of both documents. The
// `<head>` description is in that file too, for the reason legal.ts gives: it is
// a sentence, it is shown in a search result, and it is therefore a claim.
check(
  "neither page holds a sentence of its own: every word comes from legal.ts",
  [
    longLiterals(PRIVACY_PAGE),
    longLiterals(TERMS_PAGE),
    count(PRIVACY_PAGE, 'from "@/lib/legal"'),
    count(TERMS_PAGE, 'from "@/lib/legal"'),
    count(PRIVACY_PAGE, "PRIVACY.map("),
    count(TERMS_PAGE, "TERMS.map("),
  ],
  [0, 0, 1, 1, 1, 1],
);

// 11b. THE FIVE PERMANENT REFUSALS, each by the pattern a drafter would write.
//
// docs/claims.md section 7 marks these MUST NOT SAY rather than MUST NOT SAY
// YET, and the difference matters: nothing will ever make them true, so a later
// edit that adds one is a mistake and not a step forward.
//
//   1. answer 16 -- we do not SEND an IP to Sentry, which is our code. What
//      Sentry STORES is a dashboard setting nobody here has seen.
//   2. answer 4  -- no record of which version anybody accepted is kept.
//   3. answer 3  -- 16 is stated, never verified. Nothing asks for an age.
//   4. answer 5  -- the owner's own reading is not a legal review.
//   5. answer 15 -- "no cookies at all" is true signed out and false the moment
//      somebody signs in.
//   6. the coach's review of PR #303 -- that any outside company "never
//      receives" something. The Sentry sentence said exactly that about five
//      things, and docs/plan.md already records why it cannot be promised: "A
//      pattern scrub cannot recognise free text that no known phrase
//      introduces". What the page may say is what this app DOES -- it does not
//      attach them, and it removes the ones it can recognise -- which is a
//      promise about our own code rather than about a scrub's completeness.
check(
  "the six sentences docs/claims.md marks MUST NOT SAY appear nowhere in the words",
  [
    (LEGAL_WORDS.match(/does not store (your )?ip/gi) ?? []).length,
    (LEGAL_WORDS.match(/accepted version|you accepted (these )?terms on/gi) ?? [])
      .length,
    (LEGAL_WORDS.match(/verif(y|ies|ied|ying) (your |their )?age/gi) ?? []).length,
    (LEGAL_WORDS.match(/reviewed by|prepared by|legal (advice|review)/gi) ?? [])
      .length,
    (LEGAL_WORDS.match(/no cookies at all|we (use|set) no cookies/gi) ?? []).length,
    (LEGAL_WORDS.match(/never receives|never sees|never gets/gi) ?? []).length,
  ],
  [0, 0, 0, 0, 0, 0],
);

// 11c. AND THE TWO SENTENCES THAT MUST BE THERE INSTEAD.
//
// A refusal is only half of answer 16: the page may say the thing our own code
// keeps. Checking the absence without the presence would pass on a page that
// said nothing about Sentry at all.
check(
  "and the sentences the refusals leave room for ARE there",
  [
    count(LEGAL_WORDS, "We do not send your IP address to Sentry"),
    count(LEGAL_WORDS, "do not keep a record of which version"),
    // The replacement for "never receives", which is two promises about our own
    // code and one statement of the limit. All three, or the sentence is back to
    // claiming a scrub is complete.
    has(LEGAL_WORDS, "does not attach your email address"),
    has(LEGAL_WORDS, "removes the ones it can recognise"),
    has(LEGAL_WORDS, "cannot promise to catch text it has no way of recognising"),
  ],
  [1, 1, true, true, true],
);

// 11c-bis. THE FOUR SENTENCES THE COACH'S REVIEW OF PR #303 FOUND, each held by
// the absence of what it said and the presence of what replaced it.
//
// These are not style. Each of the four was a sentence that stated more than the
// code or a cited page supports, and three of them would have been read by
// somebody as a promise:
//
//   1. "nothing anybody typed is lost" after a rebuild. FALSE: a copy is a copy
//      of a moment. The figure is docs/backups.md's own replacement sentence --
//      about a day and a quarter on a normal night, about two and a half days if
//      a run is dropped -- and NOT the owner's "at most one day" target, which
//      that page says in as many words "is NOT what this design delivers".
//   2. a usage count "kept for 7 days and then removed". Not true for somebody
//      who does not come back: the sweep inside count_daily_use is scoped to the
//      caller (#223), so it only runs when that person uses the feature again.
//   3. Sentry "never receives" five things -- see the pattern above.
//   4. "DHTA Ltd is answerable" beside "There is no larger organisation behind
//      it", which on a plain reading contradict each other.
check(
  "the four sentences the review of PR #303 found are gone, and their replacements are there",
  [
    // 1. the backup window
    has(LEGAL_WORDS, "nothing anybody typed is lost"),
    has(LEGAL_WORDS, "about a day and a quarter"),
    has(LEGAL_WORDS, "about two and a half days"),
    has(LEGAL_WORDS, "Most nights an encrypted copy"),
    // 2. the usage count
    has(LEGAL_WORDS, "kept for 7 days and then removed"),
    has(LEGAL_WORDS, "the last few counts stay until you come back"),
    // 4. the contradiction
    has(LEGAL_WORDS, "no larger organisation"),
    has(LEGAL_WORDS, "is the company answerable for the data this app holds"),
    has(LEGAL_WORDS, "one person runs the app day to day"),
  ],
  [false, true, true, true, false, true, false, true, true],
);

// AND THE FIGURE IN 1 IS THE ONE docs/backups.md HOLDS, compared rather than
// copied -- the same move as the three outside figures below. If that page's
// measurement is ever revised, this goes red rather than the page quietly
// carrying the old number.
check(
  "the backup window on the page is the figure docs/backups.md measured",
  [
    // A LINE-SAFE SUBSTRING, because that page wraps its sentence across a
    // newline between "about a day" and "and a quarter". The first version of
    // this check looked for the whole phrase and went red for that reason,
    // which is a finding about reading a prose file as text rather than about
    // the figure.
    has(BACKUPS_DOC, "a quarter on a normal night"),
    has(BACKUPS_DOC, "about two and a half days if GitHub drops a run"),
  ],
  [true, true],
);

// AND #223 IS NAMED where the usage-count sentence is written, so the next
// person to read that paragraph finds the gap rather than rediscovering it.
check(
  "the usage-count paragraph names the issue that makes the simpler sentence untrue",
  [has(LEGAL_SOURCE, "issues/223")],
  [true],
);

// 11d. EVERY NUMBER THE APP OWNS IS INTERPOLATED, NEVER TYPED.
//
// Each of these figures has a constant, and each sentence uses it. A literal
// here would be a second place to change, and the one nobody would think to
// look at when a limit moves.
check(
  "the app's own figures come from its own constants, not from literals",
  [
    count(LEGAL_SOURCE, "${TITLE_MAX}"),
    count(LEGAL_SOURCE, "${NAME_MAX}"),
    count(LEGAL_SOURCE, "${MAX_FILES_PER_TASK}"),
    count(LEGAL_SOURCE, "${MAX_FILE_WORDS}"),
    count(LEGAL_SOURCE, "${PER_PERSON_WORDS}"),
    count(LEGAL_SOURCE, "${INVITATION_DAYS}"),
    count(LEGAL_SOURCE, "${MINIMUM_AGE}"),
    count(LEGAL_SOURCE, "${GOVERNING_LAW}"),
    // The literals those replace, which must appear nowhere in the words.
    count(LEGAL_WORDS, "5 MB"),
    count(LEGAL_WORDS, "100 MB"),
    count(LEGAL_WORDS, "200 characters"),
    count(LEGAL_WORDS, "7 days"),
    // THE GOVERNING-LAW SENTENCE, not the bare phrase. The optional paragraph
    // for the company's registered details says "registered in England and
    // Wales, company number ...", which is a DIFFERENT FACT -- where the
    // company is registered rather than which law the terms are read under --
    // and the two should not be coupled through one constant just to make a
    // check pass. So the check names the sentence it is about.
    count(LEGAL_WORDS, "England and Wales, and any dispute"),
    count(LEGAL_WORDS, "under 16"),
  ],
  [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
);

// 11e. THE THREE FIGURES WITH NO CONSTANT IN web/, COMPARED WITH THEIR AUTHORITY.
//
// This is the move auth-screens-check.mjs made first -- comparing a string in
// the code with an instruction in a document -- and here it is the only way to
// hold three numbers that are not this app's to declare:
//
//   the usage count's 7 days  lives in a migration, because nothing in web/ can
//                             read that table and nothing may
//   the backups' 14 days      lives in an R2 lifecycle rule at Cloudflare, which
//                             nothing in this repository can read. docs/backups.md
//                             is where the owner's decision is written down
//   the invitation's 7 days   lives in the migration's own default, and the web
//                             constant has to agree with it
check(
  "the three figures with no constant in web/ agree with the file that owns each",
  [
    count(LEGAL_SOURCE, "USAGE_COUNT_DAYS = 7"),
    // The STATEMENT, not the comment above it that quotes the same expression.
    count(USAGE_MIGRATION, "and day <= l_today - 7;"),
    count(LEGAL_SOURCE, "BACKUP_DAYS = 14"),
    // The lifecycle rule's own name, which is the one string in docs/backups.md
    // that carries the figure and cannot be reworded without renaming the rule
    // in Cloudflare too. PRESENCE, not a count: that page names it more than
    // once and may name it again.
    has(BACKUPS_DOC, "delete-after-14-days"),
    count(INVITATIONS_MIGRATION, "interval '7 days'"),
    count(LEGAL_SOURCE, "EMAIL_LOG_DAYS = 30"),
  ],
  [1, 1, 1, true, 1, 1],
);

// 11f. THE ELEVEN THINGS ISSUE #204 AND THE OWNER REQUIRE THE PAGE TO SAY.
//
// Six from #204's own "What it must say", and five the owner added afterwards:
// where data is held (10 Oct), that copies remain for about a fortnight and that
// a recovery signs everybody out (10 and 11 Oct), that there is no way to delete
// an account yet, and -- answer 15 -- the one thing actually found on a
// visitor's device.
//
// Each is a distinctive phrase rather than a whole sentence, so the wording can
// be edited without this check going red for the wrong reason. What it holds is
// that the SUBJECT has not quietly left the page.
check(
  "every item #204 and the owner require is on the page",
  [
    has(LEGAL_WORDS, "title of that one task"),
    has(LEGAL_WORDS, "Nothing that says who asked"),
    has(LEGAL_WORDS, "within 30 days of receipt or generation"),
    has(LEGAL_WORDS, "recall what was already sent"),
    has(LEGAL_WORDS, "can read the whole database"),
    has(LEGAL_WORDS, "which page, which browser"),
    // #204's sixth item WAS "that there is no way to delete an account in the
    // app", and Build it 26 built one -- so the requirement turns over: what the
    // page must now carry is where the deletion is, and the old sentence would
    // be false. 11i is where both halves are held.
    has(LEGAL_WORDS, "delete your account yourself, in Settings"),
    has(LEGAL_WORDS, "West US (Oregon)"),
    has(LEGAL_WORDS, "Western Europe"),
    has(LEGAL_WORDS, "about a fortnight"),
    has(LEGAL_WORDS, "asked to sign in again"),
    has(LEGAL_WORDS, "cf.turnstile.u"),
  ],
  [true, true, true, true, true, true, true, true, true, true, true, true],
);

// 11g. THE ADDRESS IS IN ONE PLACE, AND IT IS THE ROUTE FOR EVERY RIGHT.
//
// Answer 14 left the app with no deletion-request form on purpose, so this
// address is the only way somebody who cannot sign in reaches anybody. One
// literal, in the constant; every sentence interpolates it; and neither page
// file holds it, because neither page file holds any sentence.
check(
  "the contact address is one constant, used by the sentences and typed in no page",
  [
    count(LEGAL_SOURCE, "dp@raj-dhonota.com"),
    count(PRIVACY_PAGE, "dp@raj-dhonota.com"),
    count(TERMS_PAGE, "dp@raj-dhonota.com"),
    count(PROXY_SOURCE, "dp@raj-dhonota.com"),
  ],
  [1, 0, 0, 0],
);

// 11h. BOTH PAGES ARE PUBLIC, AND BOTH ARE LINKED FROM EVERY SCREEN.
//
// The two halves fail in opposite ways and both are silent. Without PUBLIC_PATHS
// a signed-out visitor is sent to /login, so the privacy page would be readable
// only by people who already have an account. Without the footer links there is
// a page nobody can find, which is #204's first condition failing with no error
// anywhere.
//
// The footer is the one component there is no screen without, which is why
// #204 names it: "most naturally from the footer, which is already in the root
// layout".
check(
  "both paths are public, and the footer on every screen links to both",
  [
    // The ARRAY ENTRY, with its indentation and comma -- not the comment above
    // the array, which names both paths in prose.
    count(PROXY_SOURCE, '  "/privacy",'),
    count(PROXY_SOURCE, '  "/terms",'),
    count(FOOTER_SOURCE, 'href="/privacy"'),
    count(FOOTER_SOURCE, 'href="/terms"'),
    count(FOOTER_SOURCE, 'from "@/lib/legal"'),
    // The labels come from legal.ts, so a link and its page cannot disagree.
    longLiterals(FOOTER_SOURCE),
  ],
  [1, 1, 1, 1, 1, 0],
);

// 11h-bis. THE FOUR OPTIONAL PARAGRAPHS, AS THE OWNER ANSWERED THEM.
//
// The coach's review of PR #303 asked for four the owner could accept or strike,
// and they lived in an `OPTIONAL_PRIVACY` array rendered by nobody. **The owner
// answered all four on 2026-10-13**, so this check changed shape with them:
//
//   1. why the data is held               ACCEPTED, into "Who holds this data"
//   2. the Information Commissioner's      ACCEPTED, into "What you can ask for"
//      Office
//   3. "in plain words ... the United      ACCEPTED, into "Who else receives"
//      States"
//   4. the registered number and office    NOT NOW, and DELETED rather than
//                                          left as a placeholder
//
// THE ARRAY IS GONE, and this check is what stops it coming back as a quiet
// holding place: a paragraph in a file nothing renders is a paragraph nobody
// reviews, and the whole point of one-file-of-sentences is that reading one file
// is reading both documents.
//
// AND THE PLACEHOLDER MUST APPEAR NOWHERE AT ALL -- not in either page, and not
// in legal.ts either, which is the stronger version of the first check: a
// `[COMPANY NUMBER]` sitting in a file is a thing that eventually reaches a
// page. docs/plan.md's Build it 26 section is where item 4 lives now, as an open
// item for the owner, because it is a FACT ONLY THE OWNER HAS.
check(
  "the three accepted paragraphs are on the page, and the fourth is deleted rather than parked",
  [
    // Accepted, by a distinctive phrase each.
    has(LEGAL_WORDS, "because the app cannot do what you asked of it without them"),
    has(LEGAL_WORDS, "Information Commissioner's Office"),
    has(LEGAL_WORDS, "In plain words: the database, the files you attach"),
    // The holding place is gone.
    count(LEGAL_SOURCE, "export const OPTIONAL_PRIVACY"),
    count(PRIVACY_PAGE, "OPTIONAL_PRIVACY"),
    count(TERMS_PAGE, "OPTIONAL_PRIVACY"),
    // And neither placeholder is anywhere.
    count(LEGAL_SOURCE, "[COMPANY NUMBER]"),
    count(LEGAL_SOURCE, "[REGISTERED OFFICE ADDRESS]"),
    count(PRIVACY_PAGE, "[COMPANY NUMBER]"),
    count(TERMS_PAGE, "[COMPANY NUMBER]"),
  ],
  [true, true, true, 0, 0, 0, 0, 0, 0, 0],
);

// 11i. AND NEITHER DOCUMENT CLAIMS A FEATURE THAT DOES NOT EXIST YET.
//
// The export and delete-account are PR 3 and PR 6 of docs/plan.md's order of
// work. Until each lands, the page has to say the opposite -- which for the
// second is #204's sixth required item, "that there is no way to delete an
// account in the app" -- and this check is what stops a sentence being written
// before the feature it describes.
//
// CHANGED WITH PR 3, AND IN ONE DIRECTION ONLY. The export now exists, so the
// first half of this check turned from a refusal into a REQUIREMENT: the page
// must claim it, must say where it is, and must not claim it holds things it
// leaves out. The delete-account half is untouched, because PR 6 has not
// happened -- and that asymmetry is the point. A check that had been relaxed for
// both at once would have stopped holding the half that still needs holding.
check(
  "both features are claimed now that both exist, and the old refusals are gone",
  [
    // The export, which must be there and must say where.
    has(LEGAL_WORDS, "download what this app holds about you"),
    has(LEGAL_WORDS, "from Settings"),
    // AND IT MUST NOT CLAIM THE FILE IS EVERYTHING. Decisions 8b, 8c and 8d
    // leave real things out of it, so "everything we hold" would be the kind of
    // reassuring overclaim the review of PR #303 found four of.
    (LEGAL_WORDS.match(/download everything|everything we hold about you/gi) ?? [])
      .length,
    // THE DELETION, which turned over with Build it 26: what the page had to say
    // was that there was NO way, and now it must say where the way is.
    has(LEGAL_WORDS, "delete your account yourself, in Settings"),
    has(LEGAL_WORDS, "cannot be undone"),
    // AND IT SAYS WHAT STAYS, which is the half somebody would not guess and the
    // half that is somebody ELSE'S data: decision 1 keeps a task they wrote in
    // another person's team, and `set null` on team_id returns every other
    // member's task to them.
    has(LEGAL_WORDS, "Former member"),
    has(LEGAL_WORDS, "nobody loses work they wrote themselves"),
    // AND THE ROUTE FOR SOMEBODY WHO CANNOT SIGN IN, which is the only route a
    // suspended person has and the only one an invited-but-never-signed-up
    // person has ever had.
    has(LEGAL_WORDS, "If you cannot sign in"),
    // THE SENTENCE THAT IS NOW FALSE, and must be gone rather than reworded.
    count(LEGAL_WORDS, "no way to delete your account in this app"),
  ],
  [true, true, 0, true, true, true, true, true, 0],
);

// =========================================================================
// 12. The export -- Build it 26, PR 3
// =========================================================================
//
// WHAT THIS SECTION IS FOR. The export is the first thing in this app that
// gathers everything about one person into a single artefact, and the two ways
// it can be wrong are not symmetrical:
//
//   TOO MUCH   a row that is not this person's, or a column nobody asked for,
//              reaching a file they can forward to anybody. The SELECT policy on
//              `tasks` is deliberately WIDER than the export -- it returns every
//              task in every team you are in, written by anybody -- so the thing
//              that keeps the file to one person is a FILTER, and a filter is a
//              thing somebody can delete while tidying up.
//   TOO LITTLE a read that failed arriving as `[]`. On a screen that is a
//              moment's confusion; in a DOWNLOADED FILE it is this app telling
//              somebody in writing that it holds nothing of theirs.
//
// So most of what follows is one of those two. It calls the real
// web/src/lib/export-data.ts, and reads the route and the settings page as text
// for the handful of promises that are about a file rather than a value.
console.log(
  "\n12. the export -- own rows only, a failed read is never empty, and nothing it was not asked for",
);

const EXPORT_ROUTE = readFileSync(
  resolve(HERE, "..", "web", "src", "app", "settings", "export", "route.ts"),
  "utf8",
);
// The settings page is already read as text by section 4b, which is where
// SETTINGS_PAGE is declared -- it is the same file and there is no reason for a
// second copy of it in memory.

// A person, their task, their team, and a TEAM MATE'S task in the same team --
// which is the row the SELECT policy would hand over and the export must not.
const ME = "11111111-1111-1111-1111-111111111111";
const THEM = "22222222-2222-2222-2222-222222222222";
const TEAM = "33333333-3333-3333-3333-333333333333";
const TASK = "44444444-4444-4444-4444-444444444444";

const MINE = {
  id: TASK,
  title: "Collect the keys",
  done: false,
  created_at: "2026-10-13T09:00:00Z",
  team_id: TEAM,
  owner_id: ME,
};
const THEIRS = {
  id: "55555555-5555-5555-5555-555555555555",
  title: "Carol wrote this one",
  done: true,
  created_at: "2026-10-12T09:00:00Z",
  team_id: TEAM,
  owner_id: THEM,
};

// Everything answering, so every other case below is a departure from one world
// rather than from eight different ones.
const whole = {
  generatedAt: "2026-10-13T10:11:12.000Z",
  userId: ME,
  account: { failed: false, email: "alice@example.invalid", created_at: "2026-10-01T00:00:00Z" },
  profile: { failed: false, row: { display_name: "Alice", created_at: "2026-10-02T00:00:00Z" } },
  aiSuggestions: { failed: false, enabled: true, changed_at: "2026-10-08T00:00:00Z" },
  tasks: { failed: false, rows: [MINE] },
  teams: {
    failed: false,
    rows: [{ id: TEAM, name: "Tuesday crew", created_at: "2026-10-03T00:00:00Z", owner_id: ME }],
  },
  memberships: { failed: false, rows: [{ team_id: TEAM, joined_at: "2026-10-04T00:00:00Z" }] },
  invitations: {
    failed: false,
    rows: [
      {
        team_id: TEAM,
        email: "bob@example.invalid",
        status: "sent",
        failure_code: null,
        created_at: "2026-10-05T00:00:00Z",
        expires_at: "2026-10-12T00:00:00Z",
      },
    ],
  },
  files: {
    failed: false,
    listings: [
      {
        taskId: TASK,
        rows: [{ name: "receipt.pdf", id: "o1", created_at: "2026-10-06T00:00:00Z", metadata: { size: 2048 } }],
      },
    ],
    tasksNotListed: 0,
    // WHICH OF THEM THE CALLER UPLOADED -- public.my_attachment_names()'s
    // answer, without which the section is `could_not_be_read`. See 12h.
    mine: [`${TASK}/receipt.pdf`],
  },
};

const built = buildExport(whole);

// ----------------------------------------------------- 12a. the format itself
console.log("\n12a. the format: eight sections, and three fields before any data");

check("the eight sections, in the order they appear", EXPORT_SECTIONS, [
  "account",
  "profile",
  "ai_suggestions",
  "tasks",
  "teams_you_own",
  "teams_you_belong_to",
  "invitations_you_sent",
  "files_on_your_tasks",
]);

check("the format version is in the file", EXPORT_FORMAT_VERSION, 1);

// THE KEY ORDER IS PART OF THE DESIGN, not tidiness. A reader who stops after
// three lines has still been told whether the file is complete; a `complete`
// flag at the bottom of a file nobody scrolls would be a flag nobody reads.
check(
  "every top-level key, in order -- how much to trust it comes before any data",
  Object.keys(built),
  [
    "what_this_is",
    "format_version",
    "generated_at",
    "complete",
    "sections_that_could_not_be_read",
    "tasks_whose_files_were_not_listed",
    "what_is_not_in_this_file",
    ...EXPORT_SECTIONS,
  ],
);

check(
  "a whole file is complete, with nothing missing and nothing unlisted",
  [built.complete, built.sections_that_could_not_be_read, built.tasks_whose_files_were_not_listed],
  [true, [], 0],
);

// 12a-bis. WHAT IS LEFT OUT IS SAID IN THE FILE, which is where the person
// reading it is. docs/deletion.md section 11.3 is nine rows and this is nine
// lines, and the two that matter are the last of the app's own: the usage
// counts and the suspension row, which decisions 8c and 8d leave out because
// NOBODY may read either table through the app -- so the honest form is to say
// they exist and how to ask, which is a promise docs/claims.md section 7d
// carries.
check(
  "the file says what is not in it: ten things, including the two nobody can read",
  [
    NOT_IN_THIS_FILE.length,
    NOT_IN_THIS_FILE.some((line) => line.includes("ask the owner") && line.includes("limited feature")),
    NOT_IN_THIS_FILE.some((line) => line.includes("suspended")),
    NOT_IN_THIS_FILE.some((line) => line.includes("one-way hash")),
    NOT_IN_THIS_FILE.some((line) => line.includes("credentials")),
    NOT_IN_THIS_FILE.some((line) => line.includes("sign-in log")),
    // And the list is IN the built file, not only in the module.
    built.what_is_not_in_this_file.length,
  ],
  [10, true, true, true, true, true, 10],
);

// ------------------------------------- 12b. a failed read is never an empty one
console.log("\n12b. a failed read is NEVER an empty section -- eight sections, one at a time");

// Each section's read failed in turn. The value must be the refusal shape, the
// name must be listed, and `complete` must be false. An `[]` here is this app
// telling somebody their tasks are gone, in a file they keep.
const failOne = (patch) => buildExport({ ...whole, ...patch });

check(
  "account: a failed read says so rather than giving an empty address",
  (() => {
    const f = failOne({ account: { failed: true } });
    return [f.account, f.complete, f.sections_that_could_not_be_read];
  })(),
  [{ could_not_be_read: true }, false, ["account"]],
);

check(
  "profile: a failed read is not 'no nickname'",
  (() => {
    const f = failOne({ profile: { failed: true } });
    return [f.profile, f.complete, f.sections_that_could_not_be_read];
  })(),
  [{ could_not_be_read: true }, false, ["profile"]],
);

check(
  "ai_suggestions: a failed read is not 'off' -- the same way round as consentState",
  (() => {
    const f = failOne({ aiSuggestions: { failed: true } });
    return [f.ai_suggestions, f.complete, f.sections_that_could_not_be_read];
  })(),
  [{ could_not_be_read: true }, false, ["ai_suggestions"]],
);

// THE ONE THAT MATTERS MOST: a failed tasks read takes the FILES section with
// it, because a storage listing is by prefix and a task's prefix is its id --
// so there is nothing to list and no title to attach a file to. Two names, in
// the order the sections appear.
check(
  "tasks: a failed read empties nothing, and takes the files section with it",
  (() => {
    const f = failOne({ tasks: { failed: true, rows: [] } });
    return [f.tasks, f.files_on_your_tasks, f.complete, f.sections_that_could_not_be_read];
  })(),
  [
    { could_not_be_read: true },
    { could_not_be_read: true },
    false,
    ["tasks", "files_on_your_tasks"],
  ],
);

check(
  "teams: a failed read takes BOTH team sections, because one holds the other's names",
  (() => {
    const f = failOne({ teams: { failed: true, rows: [] } });
    return [
      f.teams_you_own,
      f.teams_you_belong_to,
      f.sections_that_could_not_be_read,
    ];
  })(),
  [
    { could_not_be_read: true },
    { could_not_be_read: true },
    ["teams_you_own", "teams_you_belong_to"],
  ],
);

check(
  "memberships: a failed read takes ONLY the belong-to section",
  (() => {
    const f = failOne({ memberships: { failed: true, rows: [] } });
    return [
      Array.isArray(f.teams_you_own),
      f.teams_you_belong_to,
      f.sections_that_could_not_be_read,
    ];
  })(),
  [true, { could_not_be_read: true }, ["teams_you_belong_to"]],
);

check(
  "invitations: a failed read is not 'you sent none'",
  (() => {
    const f = failOne({ invitations: { failed: true, rows: [] } });
    return [f.invitations_you_sent, f.sections_that_could_not_be_read];
  })(),
  [{ could_not_be_read: true }, ["invitations_you_sent"]],
);

check(
  "files: a failed listing is not 'you attached nothing', even with the tasks read fine",
  (() => {
    const f = failOne({ files: { failed: true } });
    return [f.files_on_your_tasks, f.sections_that_could_not_be_read];
  })(),
  [{ could_not_be_read: true }, ["files_on_your_tasks"]],
);

// EVERY READ FAILING is still a file, and it says so eight times over. A route
// that refused outright here would hand somebody nothing to act on.
check(
  "all eight at once: eight names, and a file that says it is not complete",
  (() => {
    const f = buildExport({
      ...whole,
      account: { failed: true },
      profile: { failed: true },
      aiSuggestions: { failed: true },
      tasks: { failed: true },
      teams: { failed: true },
      memberships: { failed: true },
      invitations: { failed: true },
      files: { failed: true },
    });
    return [f.sections_that_could_not_be_read.length, f.complete];
  })(),
  [8, false],
);

// THE CONTROL, and it is what makes the eight above mean anything: a read that
// genuinely found nothing IS an empty list, and the file is still complete.
// "Nothing to show" and "we could not look" must arrive differently, and this
// is the half that proves the first one still works.
check(
  "a read that found nothing really is empty, and the file is still complete",
  (() => {
    const f = buildExport({
      ...whole,
      tasks: { failed: false, rows: [] },
      invitations: { failed: false, rows: [] },
      memberships: { failed: false, rows: [] },
      files: { failed: false, listings: [], mine: [] },
    });
    return [f.tasks, f.invitations_you_sent, f.teams_you_belong_to, f.files_on_your_tasks, f.complete];
  })(),
  [[], [], [], [], true],
);

// AND A BOUNDED SWEEP SAYS WHAT IT DROPPED. listFilesForExport stops at 200
// tasks, and a file that stopped short must not read as "you have no other
// files" -- which is the same rule as the eight above, applied to a ceiling
// rather than to a failure.
check(
  "a listing that stopped short says how many tasks it did not list, and is not complete",
  (() => {
    const f = failOne({ files: { ...whole.files, tasksNotListed: 7 } });
    return [f.tasks_whose_files_were_not_listed, f.complete];
  })(),
  [7, false],
);

// ------------------------------------------- 12c. only this person's own rows
console.log("\n12c. only rows this person created, checked on the rows and not only in the query");

check("their own task is kept", ownRowsOnly([MINE], ME).length, 1);

// THE ROW THE POLICY WOULD HAND OVER. The SELECT policy on `tasks` returns
// every task in every team you belong to, written by anybody, so this is not a
// hypothetical shape -- it is what comes back if the query's `.eq("owner_id")`
// is ever removed.
check("A TEAM MATE'S TASK IS DROPPED, which the policy alone would not do", ownRowsOnly([MINE, THEIRS], ME).length, 1);

// PR 4 of docs/plan.md makes `tasks.owner_id` nullable, so a task written by
// somebody who has deleted their account stays in its team as "Former member".
// It is somebody else's row and it is nobody's to export.
check(
  "a task with NO owner at all is dropped -- the shape PR 4 introduces",
  ownRowsOnly([{ ...MINE, owner_id: null }], ME).length,
  0,
);

check("an undefined owner is dropped too", ownRowsOnly([{ ...MINE, owner_id: undefined }], ME).length, 0);
check("a failed read is not an array, so nothing comes back", ownRowsOnly(null, ME), []);
check("neither is an object", ownRowsOnly({ rows: [MINE] }, ME), []);
check("no id to compare against means nothing comes back", ownRowsOnly([MINE], ""), []);
check("an id that is not a string means nothing comes back", ownRowsOnly([MINE], 7), []);
check("a row that is not an object is dropped", ownRowsOnly(["Collect the keys", null, 7], ME), []);

// And the whole file, through the real path rather than through the guard alone.
check(
  "the built file holds one task and it is theirs",
  (() => {
    const f = failOne({ tasks: { failed: false, rows: [MINE, THEIRS] } });
    return [f.tasks.length, f.tasks[0].title];
  })(),
  [1, "Collect the keys"],
);

check(
  "and a team mate's title appears NOWHERE in the file, not even on a file's on_task",
  JSON.stringify(
    failOne({ tasks: { failed: false, rows: [MINE, THEIRS] } }),
  ).includes("Carol wrote this one"),
  false,
);

// ------------------------------- 12d. nothing it was not asked for, and no ids
console.log("\n12d. nothing this file was not asked for: no credential, no column, no uuid");

// EVERY FIELD IS WRITTEN OUT BY NAME AND NOTHING IS SPREAD, and this is the
// check that holds it. The rows below carry what the real queries' tables carry
// and a few things they do not -- a token hash above all, which
// docs/deletion.md section 11.3 names first among what must stay out.
const noisy = buildExport({
  ...whole,
  profile: {
    failed: false,
    row: {
      display_name: "Alice",
      created_at: "2026-10-02T00:00:00Z",
      user_id: ME,
      ai_suggestions_enabled: true,
      ai_suggestions_changed_at: "2026-10-08T00:00:00Z",
    },
  },
  tasks: { failed: false, rows: [{ ...MINE, secret_column: "SHOULD-NOT-TRAVEL" }] },
  invitations: {
    failed: false,
    rows: [
      {
        ...whole.invitations.rows[0],
        id: "66666666-6666-6666-6666-666666666666",
        token_hash: "a".repeat(64),
        invited_by: ME,
        accepted_at: null,
      },
    ],
  },
});

const noisyText = JSON.stringify(noisy);

check(
  "a token hash, a column nobody asked for, and every id are all absent",
  [
    noisyText.includes("token_hash"),
    noisyText.includes("a".repeat(64)),
    noisyText.includes("secret_column"),
    noisyText.includes("SHOULD-NOT-TRAVEL"),
    noisyText.includes("invited_by"),
    noisyText.includes("accepted_at"),
    noisyText.includes("ai_suggestions_enabled"),
    noisyText.includes("user_id"),
    noisyText.includes("owner_id"),
  ],
  [false, false, false, false, false, false, false, false, false],
);

// NO UUID GOES IN THE FILE -- not a task id, not a team id, not the person's
// own. docs/deletion.md asks for a task's team by NAME, and once that is true
// for one id it may as well be true for all of them: a file somebody keeps for
// years should read as their own list rather than as a database extract.
//
// The rows above carry FIVE different uuids between them, so this is a real
// test of the assembly and not of an empty object.
check(
  "and not one uuid anywhere in the file, in any field",
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(noisyText),
  false,
);

// The one address in the file that is not the person's own is there ON PURPOSE:
// decision 8a, 2026-10-12. They typed it, and My teams already shows it to
// them -- and leaving it out would hide from somebody the one piece of other
// people's data they themselves put into this app.
check(
  "the invited address IS in the file -- decision 8a -- with the status and the code beside it",
  [
    noisy.invitations_you_sent[0].to,
    noisy.invitations_you_sent[0].status,
    noisy.invitations_you_sent[0].failure_code,
    noisy.invitations_you_sent[0].team,
  ],
  ["bob@example.invalid", "sent", null, "Tuesday crew"],
);

// ------------------------------------------------- 12e. the three profile shapes
console.log("\n12e. the profile has THREE shapes, and the middle one is the ordinary state of a new account");

check(
  "a row: the nickname, and the date the ROW was made",
  built.profile,
  { nickname: "Alice", profile_created_at: "2026-10-02T00:00:00Z" },
);

// NO ROW IS NOT A FAILURE. An account has no profile until somebody saves a
// nickname -- there is no trigger on auth.users and display_name is not null
// with no default (issue #207) -- so this is the ordinary state of a new
// account, and it must not arrive looking like a failed read.
check(
  "no row at all: said as itself, not as a failure and not as an empty nickname",
  (() => {
    const f = failOne({ profile: { failed: false, row: null } });
    return [f.profile, f.complete];
  })(),
  [{ there_is_no_profile_row: true }, true],
);

// AND THE FIELD IS NOT CALLED "when you set your nickname". `profiles` has one
// `created_at`, which is when the ROW was made; nothing in this app records a
// later change to a nickname, so a field named for one would be a claim nothing
// keeps.
check(
  "the date's name does not claim to be when the nickname was set",
  [
    Object.keys(built.profile),
    /nickname_(set|changed)/.test(JSON.stringify(built.profile)),
  ],
  [["nickname", "profile_created_at"], false],
);

// -------------------------------------------------- 12f. the setting is a word
console.log("\n12f. the AI setting is a WORD, so a missing field cannot read as 'off'");

const settingOf = (enabled) =>
  failOne({ aiSuggestions: { failed: false, enabled, changed_at: null } }).ai_suggestions
    .setting;

check("true is on", settingOf(true), "on");
check("false is off", settingOf(false), "off");
// The string "false" is the shape a boolean column read back as text arrives
// in, and a truthy test would read it as consent. The same reasoning as
// consentState and as checkAiConsent in the function.
check('the STRING "false" is neither, and must not become consent', settingOf("false"), null);
check('the STRING "true" is neither either', settingOf("true"), null);
check("nothing at all is neither", settingOf(undefined), null);
check("null is neither", settingOf(null), null);
check("a number is neither", settingOf(1), null);

// ------------------------------------------------------- 12g. the file's name
console.log("\n12g. the download's name: a fixed word and a date, and nothing about the person");

check("the day out of the moment", exportFileName("2026-10-13T10:11:12.000Z"), "team-tasks-export-2026-10-13.json");
check("a bare date works too", exportFileName("2026-10-13"), "team-tasks-export-2026-10-13.json");
check("an unusable moment gives the bare name, never one with undefined in it", exportFileName("today"), "team-tasks-export.json");
check("nothing at all gives the bare name", exportFileName(undefined), "team-tasks-export.json");
check("a number gives the bare name", exportFileName(1760000000000), "team-tasks-export.json");
check(
  "the name carries no path segment, so a Content-Disposition cannot be bent",
  /[\/\\"\r\n;]/.test(exportFileName("2026-10-13T10:11:12.000Z")),
  false,
);

// ---------------------------------------------------------- 12h. the files list
console.log("\n12h. the files on a task: three fields, a title rather than an id, and folders dropped");

check(
  "a file, with its size and when it arrived",
  readExportFiles([{ name: "a.png", id: "x", created_at: "2026-10-06T00:00:00Z", metadata: { size: 1234 } }]),
  [{ name: "a.png", size_bytes: 1234, uploaded_at: "2026-10-06T00:00:00Z" }],
);
check(
  "A FOLDER IS DROPPED: Supabase marks one with a null id",
  readExportFiles([{ name: "sub", id: null, metadata: null }]),
  [],
);
check(
  "a row with no usable name is dropped",
  readExportFiles([{ id: "x" }, { name: 7, id: "x" }, { name: "  ", id: "x" }]),
  [],
);
check(
  "an unknown size and an unknown date are null, not a nought and not a guess",
  readExportFiles([{ name: "a.png", id: "x", metadata: {} }]),
  [{ name: "a.png", size_bytes: null, uploaded_at: null }],
);
check(
  "sorted by name, so two exports of one task read the same",
  readExportFiles([
    { name: "c.png", id: "x", metadata: { size: 1 } },
    { name: "a.png", id: "x", metadata: { size: 1 } },
  ]).map((f) => f.name),
  ["a.png", "c.png"],
);
check("a failed listing is not an empty list of files", [readExportFiles(null), readExportFiles({})], [[], []]);

// ONLY THE FILES THE CALLER UPLOADED -- the owner's Dave test of 13 October
// 2026 found this section listing BY NAME a file another person had uploaded to
// one of the caller's own tasks. A file name is free text somebody's phone
// chose, so that was one person's file name inside another person's downloadable
// file. A listing cannot tell them apart, so the export asks
// public.my_attachment_names() and intersects.
check(
  "a file somebody ELSE uploaded to the caller's task is not listed",
  (() => {
    const both = buildExport({
      ...whole,
      files: {
        ...whole.files,
        listings: [
          {
            taskId: TASK,
            rows: [
              { name: "receipt.pdf", id: "o1", created_at: "2026-10-06T00:00:00Z", metadata: { size: 2048 } },
              { name: "carol-photo.jpg", id: "o2", created_at: "2026-10-07T00:00:00Z", metadata: { size: 99 } },
            ],
          },
        ],
        mine: [`${TASK}/receipt.pdf`],
      },
    });
    return [
      both.files_on_your_tasks.map((f) => f.name),
      JSON.stringify(both).includes("carol-photo.jpg"),
    ];
  })(),
  [["receipt.pdf"], false],
);

// AND AN UNANSWERED QUESTION IS NOT AN EMPTY ONE. A list filtered by an answer
// nobody got would be a shorter list presented as a complete one -- the same
// mistake as a failed read drawn as `[]`, which section 12b is entirely about.
check(
  "an unreadable 'which are mine' makes the whole section could_not_be_read",
  (() => {
    const f = buildExport({
      ...whole,
      files: { ...whole.files, mine: undefined },
    });
    return [f.files_on_your_tasks, f.complete, f.sections_that_could_not_be_read];
  })(),
  [{ could_not_be_read: true }, false, ["files_on_your_tasks"]],
);

// AND THE FILE SAYS SO. The list is now of the caller's own uploads, so what it
// leaves out has to be named where the person reading it is.
check(
  "the file's own list says other people's files on your tasks are not in it",
  [
    NOT_IN_THIS_FILE.length,
    NOT_IN_THIS_FILE.some(
      (line) =>
        line.includes("Files other people attached to your tasks") &&
        line.includes("files YOU uploaded"),
    ),
  ],
  [10, true],
);

check(
  "a file says which task it is on BY TITLE, and carries no id",
  built.files_on_your_tasks,
  [
    {
      name: "receipt.pdf",
      size_bytes: 2048,
      uploaded_at: "2026-10-06T00:00:00Z",
      on_task: "Collect the keys",
    },
  ],
);

// A listing for a task that is not in the tasks section -- which no rule makes
// reachable, because both reads are the same person's -- is reported rather
// than guessed at.
check(
  "a listing for a task that is not in the file says so with a null rather than an id",
  failOne({
    files: {
      failed: false,
      listings: [{ taskId: "77777777-7777-7777-7777-777777777777", rows: [{ name: "x.png", id: "o", metadata: {} }] }],
      // The caller's own upload, so it is in the list -- the question here is
      // what it SAYS about which task, not whether it is listed at all.
      mine: ["77777777-7777-7777-7777-777777777777/x.png"],
    },
  }).files_on_your_tasks[0].on_task,
  null,
);

// ------------------------------------------------- 12i. the route, as text
console.log("\n12i. the route: the caller's own rights, a filter that is load-bearing, and no cache");

// THE CODE ONLY, WITH EVERY COMMENT REMOVED, and that is not tidiness -- it is
// the fix for a mistake this check made on its first run and that this
// repository has now made FOUR times in two pull requests:
// `evidence/build-it-26-legal-pages.md` records three, each one a comment or an
// assertion NAMING THE STRING IT EXISTS TO FORBID.
//
// Here it was `token_hash`. The route's own comment says "token_hash IS NOT
// SELECTED, and would be dropped by buildExport even if it were", which is the
// explanation of the absence -- and the count found it and called it a presence.
// So the comments go first, exactly as `longLiterals` above does it, and what is
// left is what the route actually asks Supabase for.
const EXPORT_ROUTE_CODE = sentencesOnly(EXPORT_ROUTE);

// NO SERVICE-ROLE KEY, AND NO SECOND CLIENT. The whole feature rests on the
// policies deciding what comes back, and a key would mean no policy was
// evaluated at all -- which is issue #240's argument about the upload path,
// arriving at the one place in this app that reads everything about somebody.
check(
  "no secret key, no service role, and no client built with one",
  [
    count(EXPORT_ROUTE_CODE, "service_role"),
    count(EXPORT_ROUTE_CODE, "SERVICE_ROLE"),
    count(EXPORT_ROUTE_CODE, "createServerClient"),
    count(EXPORT_ROUTE_CODE, "createSupabaseClient"),
    // The one client it uses is the request's own.
    count(EXPORT_ROUTE_CODE, 'from "@/lib/supabase/server"'),
  ],
  [0, 0, 0, 0, 1],
);

// THE FILTER IS LOAD-BEARING, and the second lock is in export-data.ts. Both are
// required here, so removing either turns this red.
//
// `.eq("user_id", userId)` IS TWO, not one, and that number was wrong on this
// check's first run. The two are `profiles` -- where it narrows a table whose
// policy also lets a team mate's row through -- and `team_members`, where the
// policy already says `auth.uid() = user_id` and the filter is belt and braces.
// Counting them as one would have let a later change delete either.
check(
  "every read is narrowed to this person: owner_id, invited_by, and user_id TWICE",
  [
    count(EXPORT_ROUTE_CODE, '.eq("owner_id", userId)'),
    count(EXPORT_ROUTE_CODE, '.eq("invited_by", userId)'),
    count(EXPORT_ROUTE_CODE, '.eq("user_id", userId)'),
  ],
  [1, 1, 2],
);

check(
  "a suspended account is refused, and an unreadable check is NOT a yes",
  [
    count(EXPORT_ROUTE_CODE, '"is_active"'),
    // The error branch comes BEFORE the value branch, so an unknown cannot fall
    // through to the data. Compared by position, which is the only way to say
    // "first" about source.
    EXPORT_ROUTE_CODE.indexOf("activeError") <
      EXPORT_ROUTE_CODE.indexOf("activeData !== true"),
    // And it is `!== true`, not a truthy test.
    count(EXPORT_ROUTE_CODE, "activeData !== true"),
  ],
  [1, true, 1],
);

// NEVER A STAR, AND NEVER THE TWO CLOSED COLUMNS. After the consent migration a
// `select *` on `profiles` by a signed-in caller fails outright, and no client
// role may even name `ai_suggestions_enabled`.
check(
  "no select star anywhere, and neither consent column nor a token hash is ever named",
  [
    count(EXPORT_ROUTE_CODE, 'select("*")'),
    count(EXPORT_ROUTE_CODE, "ai_suggestions_enabled"),
    count(EXPORT_ROUTE_CODE, "ai_suggestions_changed_at"),
    count(EXPORT_ROUTE_CODE, "token_hash"),
    // The setting comes from the function, which takes no arguments.
    count(EXPORT_ROUTE_CODE, '"my_ai_suggestions"'),
  ],
  [0, 0, 0, 0, 1],
);

// IT WRITES NOTHING. The export is a read, decision 9 says it is not counted,
// and nothing in it may change a row -- which is worth asserting rather than
// reading, because a download that quietly wrote something would be the one
// place nobody would look.
check(
  "the route writes nothing at all: no insert, update, delete or count",
  [
    count(EXPORT_ROUTE_CODE, ".insert("),
    count(EXPORT_ROUTE_CODE, ".update("),
    count(EXPORT_ROUTE_CODE, ".delete("),
    count(EXPORT_ROUTE_CODE, ".upsert("),
    count(EXPORT_ROUTE_CODE, "count_daily_use"),
  ],
  [0, 0, 0, 0, 0],
);

// AND NOTHING KEEPS A COPY. This body is everything this app holds about one
// person; `no-store` is not a performance setting here.
check(
  "the answer is a download that nothing between here and the browser may keep",
  [
    count(EXPORT_ROUTE_CODE, "content-disposition"),
    count(EXPORT_ROUTE_CODE, "attachment; filename="),
    count(EXPORT_ROUTE_CODE, "no-store"),
    count(EXPORT_ROUTE_CODE, "nosniff"),
    count(EXPORT_ROUTE_CODE, "exportFileName(generatedAt)"),
  ],
  [1, 1, 1, 1, 1],
);

// ------------------------------------------------ 12j. the screen, and the path
console.log("\n12j. the screen: one file of sentences, a link rather than a button, and a private path");

// THE PATH IS NOT PUBLIC, and this is the half that would fail silently and
// totally: `/settings` is absent from PUBLIC_PATHS, so `/settings/export` is
// behind the proxy's sign-in check. A later change adding "/settings" to that
// list would open this download to a signed-out visitor, and the route's own
// getClaims() is the backstop rather than the control.
check(
  "the export path is under /settings and /settings is not public",
  [
    EXPORT_PATH,
    count(PROXY_SOURCE, '  "/settings",'),
    count(PROXY_SOURCE, '"/settings/export"'),
  ],
  ["/settings/export", 0, 0],
);

// Every sentence comes from the module, and the page holds none of its own --
// the same shape as the two legal pages and as TURNSTILE_WORDS.
check(
  "the settings page draws the export's words from the module and spells none of them",
  [
    count(SETTINGS_PAGE, "EXPORT_WORDS.map("),
    count(SETTINGS_PAGE, 'from "@/lib/export-data"'),
    EXPORT_WORDS.some((sentence) => SETTINGS_PAGE.includes(sentence)),
    // The heading and the label come from the module too.
    count(SETTINGS_PAGE, "{EXPORT_HEADING}"),
    count(SETTINGS_PAGE, "{EXPORT_LINK_LABEL}"),
    SETTINGS_PAGE.includes(EXPORT_HEADING) && !SETTINGS_PAGE.includes("{EXPORT_HEADING}") ? 1 : 0,
  ],
  [1, 1, false, 1, 1, 0],
);

// A LINK, NOT A FORM. The whole reason the export is a route handler is that a
// GET answering with a Content-Disposition header needs NO JAVASCRIPT.
// A LINK, NOT A FORM, AND THE CHECK IS ABOUT THE EXPORT AND NOT ABOUT THE PAGE.
//
// Its first version counted the forms on this page and required exactly one,
// which was true for an afternoon: Build it 26 added a second (the deletion),
// and the check went red over something that was right. The question it was
// trying to ask is "is the export reached by a GET rather than by a post", so
// that is what it asks now -- the export's path is in an `href` and in no
// `action`.
check(
  "the export is an anchor to the route, and its path is in no form action",
  [
    count(SETTINGS_PAGE, "href={EXPORT_PATH}"),
    count(SETTINGS_PAGE, "action={EXPORT_PATH}"),
    count(SETTINGS_PAGE, 'action="/settings/export"'),
    SETTINGS_PAGE.includes("download>"),
  ],
  [1, 0, 0, true],
);

check("four sentences, and a heading and a label beside them", [EXPORT_WORDS.length, EXPORT_HEADING, EXPORT_LINK_LABEL], [4, "Your data", "Download my data"]);

// AND NOT ONE OF THEM CARRIES A MANGLED CHARACTER, which is here because it
// HAPPENED while this change was being written.
//
// A PowerShell `Get-Content | Set-Content -Encoding utf8` round trip read the
// module's UTF-8 bytes as the system codepage and wrote them back, turning the
// em dash in `EXPORT_WORDS[2]` into `â€”` -- and it was COMMITTED, because every
// check over that sentence tested a substring that stopped before the dash.
//
// `â€` is the tell: it is what the first two bytes of a UTF-8 punctuation
// character become when they are read as Windows-1252. Checked across all three
// kinds of string a person reads, not only the four sentences, because the
// mistake is about how a file was written and not about which line it hit.
check(
  "no sentence carries a mangled character from an encoding round trip",
  [
    EXPORT_WORDS.filter((s) => s.includes("â€")).length,
    NOT_IN_THIS_FILE.filter((s) => s.includes("â€")).length,
    Object.values(EXPORT_REFUSAL_SENTENCES).filter((s) => s.includes("â€")).length,
    // And the whole module, so a comment cannot carry one either -- a mangled
    // character in a comment is the signal that the file was written wrongly,
    // and the next edit may land on a sentence.
    count(readFileSync(resolve(LIB, "export-data.ts"), "utf8"), "â€"),
    count(LEGAL_SOURCE, "â€"),
    // AND THE DELETION'S WORDS, added with Build it 26. They carry curly quotes
    // and em dashes in the sentence somebody reads before pressing the one
    // button that cannot be undone, which is the worst place in this app for a
    // character that looks like a mistake.
    count(readFileSync(resolve(LIB, "account-deletion.ts"), "utf8"), "â€"),
  ],
  [0, 0, 0, 0, 0, 0],
);

// THE SENTENCE THAT IS NOT OBVIOUS. Every row in the file is something this
// person can already read on a screen; what is new is that they are gathered
// into one artefact that can be forwarded. docs/deletion.md section 11.4 says
// so in those terms, and the screen has to say it where somebody is deciding.
check(
  "the words say what the file does not hold, and that it gathers everything into one place",
  [
    EXPORT_WORDS.some((s) => s.includes("deliberately not in it")),
    EXPORT_WORDS.some((s) => s.includes("one place") && s.includes("keep it carefully")),
    EXPORT_WORDS.some((s) => s.includes("not even you")),
    // AND NO SENTENCE CLAIMS IT IS EVERYTHING, which decisions 8b, 8c and 8d
    // make untrue.
    EXPORT_WORDS.some((s) => /everything (this app|we) hold/i.test(s)),
  ],
  [true, true, true, false],
);

// ------------------------------------------------- 12k. the two refusals
console.log("\n12k. the two refusals: a code this app wrote, and never a message");

check("the two codes", [EXPORT_REFUSED, EXPORT_UNKNOWN], ["exportrefused", "exportunknown"]);
check("a suspended caller gets the sentence create-team already gives one", exportRefusalSentence(EXPORT_REFUSED), "You can't do that at the moment.");
check("an unreadable check says so, and says nothing was downloaded", exportRefusalSentence(EXPORT_UNKNOWN).includes("nothing was downloaded"), true);
check("trimmed, because a code arrives out of a URL", exportRefusalSentence("  exportrefused  "), "You can't do that at the moment.");
// NULL FOR ANYTHING THIS APP DID NOT WRITE, which is what stops a crafted
// `/settings?problem=` printing chosen words on this site -- the hole
// web/src/app/teams/page.tsx had and closed.
check("a code this app did not write shows nothing at all", exportRefusalSentence("anything-else"), null);
check("and neither does a sentence passed as the code", exportRefusalSentence("You have been hacked, telephone this number"), null);
check("nor a non-string", [exportRefusalSentence(undefined), exportRefusalSentence(["exportrefused"])], [null, null]);

// NOT ONE WORD SUPABASE, POSTGRES OR CLOUDFLARE CHOSE. Derived from the table
// rather than written out, so a sentence added later is covered.
check(
  "neither sentence names a company, a status, a code or a table",
  Object.values(EXPORT_REFUSAL_SENTENCES).filter((sentence) =>
    /supabase|postgres|storage|rpc|42501|403|500|is_active|account_status|usage_counts|service_role/i.test(
      sentence,
    ),
  ),
  [],
);

// =========================================================================
// 13. Deleting an account -- Build it 26
// =========================================================================
//
// WHAT THIS SECTION IS FOR. The deletion is the only irreversible thing in this
// app, and the two ways it can be wrong are not symmetrical:
//
//   TOO MUCH   somebody else's work destroyed. Decision 1 of 2026-10-12 keeps a
//              task the person wrote in SOMEBODY ELSE'S team, and
//              `20261002133637_tasks_join_teams.sql` already chose `set null`
//              over `cascade` so that "Carol losing her own task because Alice
//              closed her account" cannot happen. The plan of the deletion is a
//              pure function and this is where it is asked.
//   TOO LITTLE a button that destroys on one click, or a warning that names
//              nothing. "A deletion that names nothing is a deletion nobody can
//              consent to", and a count this app could not read drawn as a 0 is
//              the worst `0` in the whole app.
//
// THE PLAN ITSELF IS CHECKED BY THE DENO TESTS, not here:
// supabase/functions/_tests/delete_account_test.ts imports the real
// `splitTasks`, `tasksToDelete`, `confirmed` and `namesOf` out of the function
// and asks them 17 questions. This section is the SCREEN'S half -- the words,
// the two steps, the path, and the sentences a refusal earns.
console.log(
  "\n13. deleting an account -- the warning names things, and one click is not a confirmation",
);

const DELETE_PAGE = readFileSync(
  resolve(HERE, "..", "web", "src", "app", "delete-account", "page.tsx"),
  "utf8",
);
// The settings action is already read as text by section 4b, where
// SETTINGS_ACTIONS is declared. Same file, so no second copy of it in memory.
const HOME_PAGE = readFileSync(
  resolve(HERE, "..", "web", "src", "app", "page.tsx"),
  "utf8",
);
// My tasks is already read as text by section 10, where TASKS_PAGE is declared.
// Same file, so no second copy of it in memory.
//
// The design, read as text for one thing only: that the label on the screen is
// the words docs/deletion.md asks for rather than a near-miss of them.
const DELETION_DOC = readFileSync(
  resolve(HERE, "..", "docs", "deletion.md"),
  "utf8",
);
// LINE ENDINGS ARE NORMALISED, and that is a finding rather than tidiness: two
// of these checks matched on a multi-line literal and went red the moment git
// re-checked the file out with CRLF. A check that passes on Linux and fails on
// Windows is a check that would turn somebody's pull request red for a reason
// that has nothing to do with what it tests -- the exact failure
// `web/tests/staging.mjs` guards against beside `signIn`.
const DELETE_FUNCTION = readFileSync(
  resolve(HERE, "..", "supabase", "functions", "delete-account", "index.ts"),
  "utf8",
).replace(/\r\n/g, "\n");
const DELETE_FUNCTION_CODE = sentencesOnly(DELETE_FUNCTION);

// ------------------------------------------- 13a. one click is not a confirmation
console.log("\n13a. the typed phrase: one click is not a confirmation");

check(
  "the phrase, trimmed and in any case",
  [
    phraseMatches(CONFIRM_PHRASE),
    phraseMatches(`  ${CONFIRM_PHRASE}  `),
    phraseMatches(CONFIRM_PHRASE.toUpperCase()),
    phraseMatches("Delete My Account"),
  ],
  [true, true, true, true],
);

// THE SHAPES A SINGLE CLICK WOULD SEND. A truthy check would take every one.
check(
  "and nothing else is one: a boolean, a number, 'yes', or the phrase with more after it",
  [
    phraseMatches(true),
    phraseMatches(1),
    phraseMatches("yes"),
    phraseMatches("ok"),
    phraseMatches(`${CONFIRM_PHRASE} please`),
    phraseMatches(""),
    phraseMatches(undefined),
    phraseMatches(null),
    phraseMatches([CONFIRM_PHRASE]),
  ],
  [false, false, false, false, false, false, false, false, false],
);

// AND THE FUNCTION CHECKS IT AGAIN, which is the check that counts: a screen can
// be skipped. The two spell the phrase separately -- the function is Deno code
// nothing in web/ can import -- so this is the only thing that would notice a
// drift between them.
check(
  "the function holds the SAME phrase, compared across the language boundary",
  [
    count(DELETE_FUNCTION_CODE, `"${CONFIRM_PHRASE}"`),
    // And it compares it the same way: trimmed and case-folded, not truthily.
    has(DELETE_FUNCTION_CODE, "trim().toLowerCase() === CONFIRM_PHRASE"),
  ],
  [1, true],
);

// ------------------------------------------- 13b. the warning names things
console.log("\n13b. the warning: counts, every team by name, and no 0 it does not know");

const WARNED = deletionWarning({ tasks: 3, files: 2, teams: ["Tuesday crew"] });

check(
  "it says it cannot be undone, what goes, what stays, the fortnight and what cannot be recalled",
  [
    WARNED.some((s) => s.includes("cannot be undone")),
    WARNED.some((s) => s.includes("3 tasks")),
    WARNED.some((s) => s.includes("2 files")),
    WARNED.some((s) => s.includes("Former member")),
    WARNED.some((s) => s.includes("about a fortnight")),
    WARNED.some((s) => s.includes("cannot be recalled")),
    // AND THE TEAMS SENTENCE ONLY WHEN THERE IS A TEAM.
    WARNED.some((s) => s.includes("Each team below is deleted")),
  ],
  [true, true, true, true, true, true, true],
);

// THE FILE COUNT IS OF THE TASKS BEING DELETED, AND THE WARNING SAYS SO -- the
// coach's fix of 2026-10-13, which this check is the words half of.
//
// A task the person created in SOMEBODY ELSE'S team survives them and keeps the
// files OTHER PEOPLE attached to it. So "N files on your tasks" counted other
// people's files as this person's loss, and the deletion itself was emptying
// those folders. Both are fixed; this is the pair of sentences that makes the
// smaller number honest.
check(
  "the file count is of the tasks being deleted, and the warning says why that is smaller",
  [
    // The count's own sentence says "those tasks", not "your tasks".
    WARNED.some((s) => s.includes("2 files on those tasks")),
    WARNED.some((s) => s.includes("files on your tasks")),
    // AND THE SENTENCE THAT EXPLAINS IT: uploads elsewhere go, other people's
    // files on a surviving task do not.
    WARNED.some((s) => s.includes("Files you attached to a task that stays are removed too")),
    WARNED.some((s) => s.includes("files other people attached to those tasks are not")),
  ],
  [true, false, true, true],
);

check(
  "one task and one file are singular, because a warning that says '1 tasks' reads as a bug",
  (() => {
    const one = deletionWarning({ tasks: 1, files: 1, teams: [] });
    return [
      one.some((s) => s.includes("1 task of yours")),
      one.some((s) => s.includes("1 file on those tasks")),
      // No team, so no sentence about teams going.
      one.some((s) => s.includes("Each team below is deleted")),
    ];
  })(),
  [true, true, false],
);

// A COUNT THIS APP COULD NOT READ IS SAID, NEVER DRAWN AS A NOUGHT. Build it
// 19's rule applied to the sentence somebody reads before pressing the one
// button that cannot be undone -- and this is the worst `0` in the app, because
// "0 tasks will be deleted" over an unreadable count invites somebody to press
// it believing they are losing nothing.
check(
  "an unreadable count says so, and a 0 appears nowhere in those sentences",
  (() => {
    const unknown = deletionWarning({ tasks: null, files: null, teams: null });
    const said = unknown.join(" ");
    return [
      said.includes("could not count your tasks"),
      said.includes("could not count your files"),
      said.includes("could not read your teams"),
      /\b0 (tasks|files)\b/.test(said),
    ];
  })(),
  [true, true, true, false],
);

check(
  "a real nought is still a nought, so the sentence above is about an UNKNOWN and not about nothing",
  (() => {
    const none = deletionWarning({ tasks: 0, files: 0, teams: [] });
    const said = none.join(" ");
    return [said.includes("0 tasks of yours"), said.includes("could not count")];
  })(),
  [true, false],
);

// AND IT NAMES NO PERSON AND NO ADDRESS. docs/deletion.md section 5: "It must
// not name the other members, and it must not name anybody's address."
check(
  "no sentence in the warning names a member, a nickname or an address",
  [
    /@/.test(WARNED.join(" ")),
    /member's name|nicknames|their email/i.test(WARNED.join(" ")),
  ],
  [false, false],
);

// ------------------------------------------- 13c. two steps, and a POST
console.log("\n13c. two steps on the screen, and a destruction that a link cannot reach");

check(
  "the card draws a link first and the warning only on ?delete=1",
  [
    count(SETTINGS_PAGE, '"/settings?delete=1"'),
    count(SETTINGS_PAGE, 'wantsDelete === "1"'),
    // The form, the typed box and the button are inside the branch.
    count(SETTINGS_PAGE, "action={deleteAccount}"),
    count(SETTINGS_PAGE, "deletionWarning(deletion)"),
  ],
  [1, 1, 1, 1],
);

// A SERVER ACTION AND NOT A ROUTE, which is the opposite of the export one card
// above -- and deliberately. An export is a GET somebody may repeat; this must
// be a POST that a link, a prefetch or a mail scanner cannot reach.
check(
  "it is an action, and there is no GET route that could delete anything",
  [
    count(SETTINGS_ACTIONS, "export async function deleteAccount"),
    count(SETTINGS_ACTIONS, "export async function GET"),
    // The press is authorised by the identifier, never by the label.
    count(SETTINGS_ACTIONS, "BUTTON_IDS.accountDelete"),
    // And the phrase is checked before anything is invoked.
    SETTINGS_ACTIONS.indexOf("phraseMatches(typed)") <
      SETTINGS_ACTIONS.indexOf('functions.invoke("delete-account"'),
  ],
  [1, 0, 1, true],
);

// NOTHING ABOUT WHO IS ASKING IS IN THE BODY. `invoke` sends the signed-in
// person's token, and the function takes the id from that verified token -- so a
// signed-in person cannot delete somebody else's account by editing a form.
// THE BODY, AND ONLY THE BODY. The first version of this counted
// `user_id: userId` across the whole file and went red on the CONSENT action's
// insert, which has to carry one -- a check about one request reading another
// one's. So it reads the invoke call itself: the body is `{ confirm }` and has
// exactly one field.
check(
  "the request body carries the phrase and nothing about who is asking",
  (() => {
    const call = /invoke\("delete-account",\s*\{([\s\S]*?)\}\s*\);/.exec(
      SETTINGS_ACTIONS,
    );
    const body = call === null ? "" : call[1];
    return [
      call !== null,
      body.includes("confirm: CONFIRM_PHRASE"),
      /user_id|userId|\bid\b|email/.test(body),
    ];
  })(),
  [true, true, false],
);

// ------------------------------------------- 13d. the function's own two checks
console.log("\n13d. the fifth door keeps the suspension check, and the key is used once");

check(
  "it is the fifth door and it checks account_status like the other four",
  [
    count(DELETE_FUNCTION_CODE, 'from("account_status")'),
    // TWO, not three: the exported function and the one call. The type is named
    // only in comments, which are stripped.
    count(DELETE_FUNCTION_CODE, "checkSuspension"),
    // BEFORE the body is parsed, which is where the other four put it too.
    DELETE_FUNCTION_CODE.indexOf("checkSuspension(() =>") <
      DELETE_FUNCTION_CODE.indexOf("await req.json()"),
    // AND IT DOES NOT CALL is_active(), which would be false for every caller on
    // an admin connection -- the trap create-team's header spells out.
    count(DELETE_FUNCTION_CODE, "is_active"),
  ],
  [1, 2, true, 0],
);

// THE SECRET KEY IS USED EXACTLY TWICE, and both are things no policy can
// express: removing an invitation addressed to the caller (that table has no
// delete policy at all) and removing the auth.users row. Everything else is the
// caller's own rights, which is docs/deletion.md's own decision.
check(
  "supabaseAdmin twice, and the rest of the work is the caller's own rights",
  [
    count(DELETE_FUNCTION_CODE, "ctx.supabaseAdmin"),
    count(DELETE_FUNCTION_CODE, "auth.admin.deleteUser"),
    // The caller's client does the reads, the task deletes and every storage walk.
    count(DELETE_FUNCTION_CODE, "ctx.supabase\n") +
      count(DELETE_FUNCTION_CODE, "ctx.supabase.") +
      count(DELETE_FUNCTION_CODE, "ctx.supabase,") >
      3,
    // A HARD DELETE: the second argument is omitted, and the installed client
    // documents it as defaulting to false.
    count(DELETE_FUNCTION_CODE, "deleteUser(\n      callerId,\n    )"),
  ],
  [3, 1, true, 1],
);

// THE ORDER IS FORCED, NOT PREFERRED, and this is the one check in this section
// that is about a sequence rather than a value. Files before tasks, because a
// SQL delete cannot remove a file; tasks before the login, because the right to
// delete a file on a task comes FROM the task.
check(
  "files, then tasks, then the login -- in that order in the source",
  (() => {
    const files = DELETE_FUNCTION_CODE.indexOf("clearFolder(ctx.supabase");
    const tasks = DELETE_FUNCTION_CODE.indexOf('.from("tasks")\n        .delete()');
    const login = DELETE_FUNCTION_CODE.indexOf("auth.admin.deleteUser");
    return [files > 0, files < tasks, tasks < login];
  })(),
  [true, true, true],
);

// AND THE WHOLE FOLDER IS EMPTIED ONLY FOR A TASK THAT IS GOING -- the coach's
// fix of 2026-10-13, and the code half of the pair above.
//
// The first version looped `clearFolder` over `split.own`: every task the caller
// CREATED, including the ones that survive them. So a departing person took with
// them every file their team mates had attached to a task that was staying.
// `folderPlan` is the pure function that splits the two, which is what lets
// supabase/functions/_tests/delete_account_test.ts ask it the question directly.
check(
  "the two storage walks are driven by folderPlan, and never by the raw own-task list",
  [
    // ONE source for both lists, and the row delete uses the same `whole`.
    count(DELETE_FUNCTION_CODE, "folderPlan(split, ownedTeamIds)"),
    count(DELETE_FUNCTION_CODE, "for (const taskId of folders.whole)"),
    count(DELETE_FUNCTION_CODE, "const doomed = folders.whole"),
    // THE FIRST BUG: neither walk iterates the own-task list or the elsewhere
    // list directly.
    count(DELETE_FUNCTION_CODE, "for (const task of split.own)"),
    count(DELETE_FUNCTION_CODE, "for (const task of split.elsewhere)"),
    // And `tasksToDelete` is called in exactly one place -- inside folderPlan --
    // so the rows deleted and the folders emptied cannot drift.
    count(DELETE_FUNCTION_CODE, "tasksToDelete(split.own, ownedTeamIds)"),
  ],
  [1, 1, 1, 0, 0, 1],
);

// AND THE SECOND BUG: ON A SURVIVING TASK IT ASKS WHICH FILES ARE THE CALLER'S
// RATHER THAN INFERRING IT FROM A REFUSAL.
//
// The owner's Dave test of 13 October 2026 found a team mate's file deleted from
// Dave's surviving task. The reasoning was "attempt everything and the DELETE
// policy will refuse what is not mine" -- true on a task somebody ELSE created,
// FALSE on one the caller created, where that policy admits the task's CREATOR
// for every file. Nothing was refused.
//
// `clearMine` IS GONE, and that absence is asserted: it is the function that
// held the wrong reasoning, and a check for the new shape alone would pass with
// the old one still sitting there unused and ready to be called again.
check(
  "the caller's own uploads come from my_attachment_names(), and clearMine is gone",
  [
    count(DELETE_FUNCTION_CODE, '"my_attachment_names"'),
    // An unanswered question refuses the whole deletion: carrying on would leave
    // files nobody can ever reach.
    count(DELETE_FUNCTION_CODE, "uploads_unknown"),
    count(DELETE_FUNCTION_CODE, "myNames === null"),
    // The names are intersected with the SURVIVING tasks, so step 2's folders
    // are not attempted twice.
    count(DELETE_FUNCTION_CODE, "new Set(folders.mineOnly)"),
    count(DELETE_FUNCTION_CODE, "for (const path of toRemove)"),
    // The function that held the wrong reasoning no longer exists.
    count(DELETE_FUNCTION_CODE, "function clearMine"),
    count(DELETE_FUNCTION_CODE, "clearMine("),
    // And a file that will not go is now a FAILURE rather than the ordinary
    // case, because these names are the caller's own rows.
    count(DELETE_FUNCTION_CODE, "function removeNamed"),
  ],
  [1, 2, 1, 1, 1, 0, 0, 1],
);

// AND THE INVITATIONS ADDRESSED TO THEM, which do NOT cascade: they are keyed by
// an ADDRESS. Without this step the app keeps the email address of somebody who
// has just left -- the one thing in the whole operation that would be a retained
// personal detail rather than an unreachable row.
check(
  "invitations addressed to the caller are removed, by an address from the VERIFIED token",
  [
    count(DELETE_FUNCTION_CODE, 'from("invitations")'),
    has(DELETE_FUNCTION_CODE, "ctx.userClaims?.email"),
    // Lowercased, because the column is stored lowercase and carries a
    // constraint saying so.
    has(DELETE_FUNCTION_CODE, "trim().toLowerCase()"),
  ],
  [1, true, true],
);

// ------------------------------- 13d-bis. the surviving task on My tasks
console.log("\n13d-bis. a former member's task: it says so, and its team's owner may delete it");

// THE OWNER'S DAVE TEST OF 13 OCTOBER 2026 FOUND BOTH OF THESE MISSING. The
// task survived exactly as it should -- `owner_id` null, still in Alice's team
// -- and the row drew its title, its team chip, Suggest subtasks, Files and
// Rename. Nothing said its author had gone, and the one person the new policy
// allows to remove it was offered no Delete. A row nobody can act on, which is
// the opposite of issue #83's fault and just as wrong.
const MINE_ID = "11111111-1111-1111-1111-111111111111";
const THEIR_TEAM = "22222222-2222-2222-2222-222222222222";
const MY_TEAM = "33333333-3333-3333-3333-333333333333";

const mayDelete = (task, owned) =>
  mayDeleteTask(task, { userId: MINE_ID, ownedTeamIds: new Set(owned) });

check(
  "its creator may delete it, which is feature 4 and is unchanged",
  [
    mayDelete({ owner_id: MINE_ID, team_id: null }, []),
    mayDelete({ owner_id: MINE_ID, team_id: THEIR_TEAM }, []),
  ],
  [true, true],
);

check(
  "AND THE OWNER OF ITS TEAM MAY, when the task has no creator left",
  [
    // A former member's task in a team I own: yes, which is the new policy.
    mayDelete({ owner_id: null, team_id: MY_TEAM }, [MY_TEAM]),
    // The same row in a team I am only IN: no. Members must not gain this, and
    // the policy reads teams.owner_id directly for the same reason.
    mayDelete({ owner_id: null, team_id: THEIR_TEAM }, [MY_TEAM]),
    // A former member's task with no team at all is the orphan docs/deletion.md
    // section 6.2 names: no policy returns it to anybody, so no control either.
    mayDelete({ owner_id: null, team_id: null }, [MY_TEAM]),
  ],
  [true, false, false],
);

check(
  "and a TEAM MATE'S task is still nobody else's to delete, however the teams fall",
  [
    mayDelete({ owner_id: "somebody-else", team_id: MY_TEAM }, [MY_TEAM]),
    mayDelete({ owner_id: "somebody-else", team_id: THEIR_TEAM }, [MY_TEAM]),
    // AND AN EMPTY SET OF OWNED TEAMS -- which is what a failed teams read
    // gives -- draws nothing rather than guessing.
    mayDelete({ owner_id: null, team_id: MY_TEAM }, []),
  ],
  [false, false, false],
);

check(
  "the page draws the label and asks mayDeleteTask for the control",
  [
    count(TASKS_PAGE, "{FORMER_MEMBER}"),
    count(TASKS_PAGE, "task.owner_id === null ?"),
    count(TASKS_PAGE, "mayDeleteTask(task, { userId, ownedTeamIds })"),
    count(TASKS_PAGE, "{mayDelete ? ("),
    // THE OLD CONDITION IS GONE: `mine` alone no longer decides the Delete.
    count(TASKS_PAGE, "{mine ? ("),
    // And the owned teams come from the teams read rather than from the teams
    // this person can merely see.
    count(TASKS_PAGE, '.select("id, name, owner_id")'),
    count(TASKS_PAGE, "const ownedTeamIds = new Set("),
  ],
  [1, 1, 1, 1, 0, 1, 1],
);

// AND THE WORDS ARE docs/deletion.md's OWN, and the label says an ABSENCE rather
// than a person: `web/src/lib/tasks.ts` has always said owner_id is "never
// shown", and that stays true.
check(
  "the label is the design's own words, and is not a name",
  [FORMER_MEMBER, /[@]/.test(FORMER_MEMBER), has(DELETION_DOC, '"Former member"')],
  ["Former member", false, true],
);

// ------------------------------------------- 13e. the refusals
console.log("\n13e. the refusals: a code this app wrote, and never a message");

check("the eight codes", DELETE_CODES, [
  "phrase",
  "button",
  "suspended",
  "toomany",
  "files",
  "login",
  "failed",
  "unreachable",
]);

check(
  "each of the function's codes maps to one of them, and nothing else does",
  [
    deleteOutcome({ reached: true, status: 403, code: "account_suspended" }),
    deleteOutcome({ reached: true, status: 400, code: "not_confirmed" }),
    deleteOutcome({ reached: true, status: 409, code: "too_much_to_scan" }),
    deleteOutcome({ reached: true, status: 500, code: "files_not_cleared" }),
    deleteOutcome({ reached: true, status: 500, code: "login_not_deleted" }),
    deleteOutcome({ reached: true, status: 500 }),
    deleteOutcome({ reached: false }),
    // A code this app did not write falls to the sentence that claims nothing.
    deleteOutcome({ reached: true, status: 500, code: "something_else" }),
  ],
  [
    "suspended",
    "phrase",
    "toomany",
    "files",
    "login",
    "failed",
    "unreachable",
    "failed",
  ],
);

// THE SUSPENDED REFUSAL POINTS SOMEWHERE, which is decision 7's other half: the
// request page is a suspended person's ONLY route, so a refusal that pointed
// nowhere would be the shape docs/plan.md calls a refusal nobody can act on.
check(
  "the suspended and too-many sentences both point at the request page",
  [
    DELETE_SENTENCES.suspended.includes(REQUEST_PATH),
    DELETE_SENTENCES.toomany.includes(REQUEST_PATH),
    // AND THE ONE THAT ADMITS SOMETHING HAPPENED does not say "nothing was
    // deleted", because that would be false: everything but the login has gone.
    DELETE_SENTENCES.login.includes("were removed"),
    /nothing was deleted/.test(DELETE_SENTENCES.login),
  ],
  [true, true, true, false],
);

check(
  "not one sentence names a company, a status, a table or a code",
  Object.values(DELETE_SENTENCES).filter((sentence) =>
    /supabase|postgres|storage|auth\.users|account_status|42501|403|500|service_role|rpc/i.test(
      sentence,
    ),
  ),
  [],
);

check(
  "and a code this app did not write draws nothing at all",
  [
    deleteSentence("anything-else"),
    deleteSentence("You have been hacked, telephone this number"),
    deleteSentence(undefined),
    deleteSentence(["phrase"]),
  ],
  [null, null, null, null],
);

// ------------------------------------------- 13f. the request page, and the path
console.log("\n13f. the request page: public, no form, and one address");

check(
  "the path is public, and that is what the page is FOR",
  [
    count(PROXY_SOURCE, '  "/delete-account",'),
    count(DELETE_PAGE, 'from "@/lib/account-deletion"'),
    // NO FORM AT ALL -- decision 10. No form element, no action, no input.
    count(DELETE_PAGE, "<form"),
    count(DELETE_PAGE, "action="),
    count(DELETE_PAGE, "<input"),
    // One mailto and nothing else that posts anywhere.
    count(DELETE_PAGE, "mailto:"),
  ],
  [1, 1, 0, 0, 0, 1],
);

check(
  "the page holds no sentence of its own, and the address is one constant compared with legal.ts's",
  [
    longLiterals(DELETE_PAGE),
    REQUEST_ADDRESS,
    count(LEGAL_SOURCE, REQUEST_ADDRESS),
    count(DELETE_PAGE, "@raj-dhonota.com"),
  ],
  [0, "dp@raj-dhonota.com", 1, 0],
);

check(
  "and it says the request must come from the address on the account, which is the only control there is",
  [
    REQUEST_WORDS.some((s) => s.includes("from the email address on the account")),
    REQUEST_WORDS.some((s) => s.includes("anybody who knew your address")),
    // The invited-but-never-signed-up person, who has no other way to be heard.
    REQUEST_WORDS.some((s) => s.includes("invited to a team and never signed up")),
    // And that it is a person, not a button.
    REQUEST_WORDS.some((s) => s.includes("not a button")),
  ],
  [true, true, true, true],
);

// ------------------------------------------- 13g. afterwards
console.log("\n13g. afterwards: signed out, and one sentence on the only page left");

check(
  "the action signs out and sends them to the home page, which is public",
  [
    count(SETTINGS_ACTIONS, "auth.signOut()"),
    count(SETTINGS_ACTIONS, 'redirect("/?deleted=1")'),
    // scope is left at the default: a global sign-out is pointless once the
    // login row is gone, and issue #150 records what one cost.
    count(SETTINGS_ACTIONS, "scope: \"global\""),
  ],
  [1, 1, 0],
);

check(
  "the home page draws ONE fixed sentence for ?deleted=1, and nothing from the address bar",
  [
    count(HOME_PAGE, 'deleted === "1"'),
    count(HOME_PAGE, "{ACCOUNT_DELETED}"),
    // The sentence lives in the module, not in the page.
    HOME_PAGE.includes(ACCOUNT_DELETED),
    // AND IT REPEATS THE FORTNIGHT, which docs/plan.md requires this build to
    // tell somebody -- at the moment they are most likely to read it. "Your
    // account is deleted" alone would be a true-sounding word that misleads.
    ACCOUNT_DELETED.includes("about a fortnight"),
  ],
  [1, 1, false, true],
);

// ------------------------------------------- 13h. the migration
console.log("\n13h. the migration: five changes, and nothing that deletes anything");

const DELETION_MIGRATION_SOURCE = readFileSync(
  resolve(
    HERE,
    "..",
    "supabase",
    "migrations",
    "20261013140000_account_deletion.sql",
  ),
  "utf8",
);

// THE STATEMENTS ONLY, WITH EVERY `--` COMMENT REMOVED, and this is the FIFTH
// time in three pull requests that a comment has tripped a check it was
// describing: `evidence/build-it-26-legal-pages.md` section 8 records three and
// `evidence/build-it-26-delete-and-export.md` records the fourth. Here it was
// `is_team_member` -- the migration's own note saying both new policies read
// `teams.owner_id` DIRECTLY rather than through that function, which the count
// found and called a use.
//
// So the comments go first, exactly as `longLiterals` and `EXPORT_ROUTE_CODE`
// do it, and what is left is what the database will actually run.
const DELETION_MIGRATION = DELETION_MIGRATION_SOURCE.split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

check(
  "owner_id becomes nullable and its foreign key becomes set null",
  [
    count(DELETION_MIGRATION, "alter column owner_id drop not null"),
    count(DELETION_MIGRATION, "references auth.users (id) on delete set null"),
    // THE OLD CONSTRAINT IS FOUND BY WHAT IT IS, NOT BY ITS NAME: the original
    // was declared inline with no name, so writing one here would be a guess
    // about this database.
    has(DELETION_MIGRATION, "from pg_constraint con"),
    has(DELETION_MIGRATION, "Nothing has been applied."),
  ],
  [1, 1, true, true],
);

check(
  "the trigger gains the branch without which the deletion is refused outright",
  [
    count(DELETION_MIGRATION, "create or replace function public.tasks_enforce_column_rules()"),
    has(DELETION_MIGRATION, "select 1 from auth.users u where u.id = old.owner_id"),
    // IT DOES NOT `return new` IN THAT BRANCH: the owner_id guard is FIRST, so
    // returning there would skip the id and created_at guards, and a cascade's
    // update must not become a way to change an id.
    count(DELETION_MIGRATION, "if new.id is distinct from old.id then"),
    count(DELETION_MIGRATION, "if new.created_at is distinct from old.created_at then"),
  ],
  [1, true, 1, 1],
);

check(
  "two new delete policies, and the second is what makes the first usable",
  [
    count(DELETION_MIGRATION, `create policy "Team owners can remove a former member's task"`),
    count(DELETION_MIGRATION, `create policy "Attachments: a team owner clears a former member's task"`),
    // THE STORAGE ONE ASKS is_active(), because storage.objects has no
    // restrictive policy of its own. The tasks one does not need to: public.tasks
    // carries "Suspended accounts are refused everything", `for all`.
    count(DELETION_MIGRATION, "(select public.is_active())"),
    // Both read teams.owner_id DIRECTLY rather than through is_team_member(), so
    // members gain nothing.
    count(DELETION_MIGRATION, "is_team_member"),
  ],
  [1, 1, 1, 0],
);

// BOTH NAMES FIT IN A POSTGRESQL IDENTIFIER. A policy name is cut at 63 bytes,
// WITH ONLY A NOTICE -- which a migration run with -q does not show -- and the
// attachments migration records what that cost the first time: this repository
// and the database would disagree about a policy's name, and a later
// `drop policy` by the written name would fail.
check(
  "neither policy name is long enough to be silently truncated at 63 bytes",
  [
    Buffer.byteLength("Team owners can remove a former member's task") <= 63,
    Buffer.byteLength("Attachments: a team owner clears a former member's task") <= 63,
  ],
  [true, true],
);

// AND NOTHING IN THE MIGRATION DELETES ANYTHING. No routine, no scheduled job,
// no new cascade. The deletion is nine steps in a function, and the only reason
// that order is forced is this file.
check(
  "the migration adds no tombstone table and destroys nothing",
  [
    count(DELETION_MIGRATION, "create table"),
    // THE WORD IS IN THE COMMENTS, which is where it belongs: the migration says
    // in capitals that the tombstone is NOT part of this change and names the
    // issue. So this looks at the SOURCE -- the only check in this section that
    // does -- and case-insensitively, because the first version looked for a
    // lower-case "tombstone" in a sentence that shouts it.
    /tombstone/i.test(DELETION_MIGRATION_SOURCE),
    (DELETION_MIGRATION.match(/^\s*delete from/gim) ?? []).length,
    (DELETION_MIGRATION.match(/^\s*drop table/gim) ?? []).length,
    (DELETION_MIGRATION.match(/^\s*truncate/gim) ?? []).length,
  ],
  [0, true, 0, 0, 0],
);

// ------------------------------------------------------------------- the score

// ---------------------------------- 14. Build it 27: the Team plan panel
console.log("\n14. The Team plan: three copies of two numbers, and one place that decides");

const PLAN_LIB = readFileSync(resolve(HERE, "..", "web", "src", "lib", "plan.ts"), "utf8");
const TEAM_PLAN_MIGRATION = readFileSync(
  resolve(HERE, "..", "supabase", "migrations", "20261014120000_team_plan.sql"),
  "utf8",
);
const ENTITLEMENT_TS = readFileSync(
  resolve(HERE, "..", "supabase", "functions", "stripe-webhook", "entitlement.ts"),
  "utf8",
);
const TEAMS_PAGE_SRC = readFileSync(
  resolve(HERE, "..", "web", "src", "app", "teams", "page.tsx"),
  "utf8",
);
const CHECKOUT_FN = readFileSync(
  resolve(HERE, "..", "supabase", "functions", "stripe-checkout", "index.ts"),
  "utf8",
);

// THE TWO NUMBERS EXIST IN TWO PLACES ON PURPOSE -- the screen draws a sentence
// and the database enforces the rule -- so the one thing that must never happen
// is them disagreeing. A panel promising 25 while team_member_limit() returns 10
// is the app lying about what somebody bought.
check(
  "the screen's two numbers are the migration's two numbers",
  [
    FREE_TEAM_MEMBERS,
    PAID_TEAM_MEMBERS,
    has(TEAM_PLAN_MIGRATION, "then 25"),
    has(TEAM_PLAN_MIGRATION, "else 10"),
  ],
  [10, 25, true, true],
);

// AND THE ENTITLING STATUSES EXIST IN THREE PLACES: the migration's `in` list,
// the webhook's ENTITLING_STATUSES, and the screen's. Same argument.
check(
  "all three copies of the entitling statuses agree, and past_due is in none of them",
  [
    [...PLAN_ENTITLING].sort().join(","),
    has(TEAM_PLAN_MIGRATION, "'active', 'trialing'"),
    has(ENTITLEMENT_TS, '["active", "trialing"]'),
    /past_due/.test(String(PLAN_ENTITLING)),
  ],
  ["active,trialing", true, true, false],
);

// THE PANEL NEVER DECIDES. It reads my_entitlement(), which returns the
// caller's own row; it must not read the entitlements table directly, and it
// must not call team_member_limit(), which is granted to service_role alone.
check(
  "the page reads my_entitlement() and nothing else about entitlements",
  [
    count(TEAMS_PAGE_SRC, 'rpc("my_entitlement")'),
    count(TEAMS_PAGE_SRC, 'from("entitlements")'),
    // The CALL, not the word: a comment on this page explains why the page
    // does not call it, and a check that counted the word would be failed by
    // its own explanation.
    count(TEAMS_PAGE_SRC, 'rpc("team_member_limit")'),
  ],
  [1, 0, 0],
);

// THE PRICE COMES FROM STRIPE, from the SAME setting the checkout charges.
check(
  "one price id, read by both halves, and the page never spells an amount",
  [
    // Read from the environment ONCE. The name appears again in the "not
    // set" message, which is a sentence rather than a second source of truth.
    count(CHECKOUT_FN, "Deno.env.get(STRIPE_SETTINGS.priceTeam)"),
    // The page asks the function; it holds no currency symbol of its own.
    count(TEAMS_PAGE_SRC, 'action: "price"'),
    /[£$€]\s?\d/.test(PLAN_LIB),
    /[£$€]\s?\d/.test(TEAMS_PAGE_SRC),
  ],
  [1, 1, false, false],
);

// AND A MISSING PRICE DRAWS NO BUTTON, which is the production path in this
// rehearsal: no key, so no offer and nothing to press.
check(
  "no price means no button, and a sentence instead",
  [
    offerSentence(null, null).includes(String(PAID_TEAM_MEMBERS)),
    has(PLAN_LIB, "PLAN_UNAVAILABLE"),
    has(TEAMS_PAGE_SRC, "planPrice === null ? ("),
  ],
  [true, true, true],
);

// THE SUCCESS PAGE GRANTS NOTHING, which is docs/plan.md's own heading. The
// page may read ?paid= to draw a sentence and must never write anything because
// of it.
check(
  "the success look draws a fixed sentence and writes nothing",
  [
    has(TEAMS_PAGE_SRC, 'paid === "1"'),
    has(TEAMS_PAGE_SRC, "{PLAN_THANKS}"),
    // It promises a wait, not a result.
    /updates here once Stripe confirms/.test(PLAN_THANKS),
    // And the plan line is drawn from the database, not from the address bar.
    has(TEAMS_PAGE_SRC, "onPlan ? PLAN_TEAM_NAME : PLAN_FREE_NAME"),
  ],
  [true, true, true, true],
);

// THE TWO ADDRESSES STRIPE IS SENT point at the page the button is on.
check(
  "the success and cancel addresses are /teams, where the button is",
  [
    has(CHECKOUT_FN, "${appUrl}/teams?paid=1"),
    has(CHECKOUT_FN, "${appUrl}/teams"),
    // No session id, no token: nothing in the success address is read as
    // permission, because there is nothing in it to read.
    /success_url:[^\n]*session/.test(CHECKOUT_FN),
  ],
  [true, true, false],
);

// ON THE PLAN ALREADY: both conditions, because the database checks both.
check(
  "an expired period is not an entitlement, however the status reads",
  [
    onTeamPlan({ plan: "team", status: "active", current_period_end: "2099-01-01T00:00:00.000Z" }),
    onTeamPlan({ plan: "team", status: "active", current_period_end: "2020-01-01T00:00:00.000Z" }),
    onTeamPlan({ plan: "team", status: "past_due", current_period_end: "2099-01-01T00:00:00.000Z" }),
    onTeamPlan({ plan: "team", status: "active", current_period_end: null }),
    onTeamPlan({ plan: "team", status: "active", current_period_end: "not a date" }),
    onTeamPlan(null),
  ],
  [true, false, false, false, false, false],
);

check(
  "and the limit follows it, so a failed read is the free plan rather than a guess",
  [memberLimitFor(null), memberLimitFor({ plan: "team", status: "active", current_period_end: "2099-01-01T00:00:00.000Z" })],
  [10, 25],
);


// ------------------------- 15. Every Edge Function says how it authenticates
console.log("\n15. withSupabase: a config object, on every function, always");

// THIS SECTION EXISTS BECAUSE OF ONE REAL FAILURE. On 2026-10-14 Alice's first
// real checkout completed in the Stripe sandbox and the webhook answered HTTP
// 502: "First argument to 'respondWith' must be a Response". stripe-webhook
// called `withSupabase(handler)` with no config, reasoning that a webhook has
// no user to authenticate. @supabase/server@1.9.0 has two overloads, and a
// one-argument call matches `withSupabase(config)`, which returns a middleware
// Entry rather than a fetch handler. So a subscription existed at Stripe and
// `stripe_events` and `entitlements` were empty -- the one split this design is
// built to prevent.
//
// AND AN EMPTY CONFIG WOULD BE ITS OWN BUG: `auth` defaults to "user", so
// `withSupabase({}, handler)` refuses Stripe too, just more tidily. So the
// check is not "is there a config" but "is there an auth mode, named".
const FUNCTION_DIRS = readdirSync(resolve(HERE, "..", "supabase", "functions"), {
  withFileTypes: true,
})
  .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
  .map((e) => e.name)
  .sort();

// Every function folder, found rather than listed, so a seventh is covered the
// day it is written rather than the day somebody remembers this line.
const WITH_SUPABASE_CALLS = FUNCTION_DIRS.map((name) => {
  const src = readFileSync(
    resolve(HERE, "..", "supabase", "functions", name, "index.ts"),
    "utf8",
  );
  // The CALL at the fetch entry point, not the word: this file and that one
  // both discuss the broken shape in comments, and a check failed by its own
  // explanation is the mistake section 14 already made twice.
  const call = /fetch:\s*withSupabase\(\s*\{\s*auth:\s*"(none|user|publishable|secret)"\s*\}/.exec(src);
  return { name, mode: call ? call[1] : null };
});

check(
  "every function entry point passes a config naming an auth mode",
  WITH_SUPABASE_CALLS.filter((c) => c.mode === null).map((c) => c.name),
  [],
);

// AND EXACTLY ONE OF THEM IS "none". If a second ever appears, it is a second
// public door and wants the same argument stripe-webhook had to make: what
// stands in place of the platform's lock, and what refuses a caller who cannot
// prove anything.
check(
  "exactly one function is unauthenticated, and it is the webhook",
  WITH_SUPABASE_CALLS.filter((c) => c.mode === "none").map((c) => c.name),
  ["stripe-webhook"],
);

// AND IT IS THE ONLY verify_jwt = false IN config.toml, which is the same fact
// from the platform's side. The two must agree: a function the platform guards
// but that asks for no auth is merely odd; one the platform does NOT guard and
// that asks for no auth is the one that needs its own door.
check(
  "and config.toml has exactly one verify_jwt = false",
  (readFileSync(resolve(HERE, "..", "supabase", "config.toml"), "utf8")
    .match(/^verify_jwt = false$/gm) ?? []).length,
  1,
);

const total = passed + failures.length;
console.log(`\n${passed} of ${total} checks passed.`);

if (failures.length > 0) {
  console.log(`\n${failures.length} FAILED:`);
  for (const name of failures) console.log(`  - ${name}`);
  console.log("");
  process.exit(1);
}

console.log("");
