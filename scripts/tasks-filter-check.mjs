#!/usr/bin/env node
// tasks-filter-check.mjs -- the My tasks list-filter helpers, checked against the
// real module rather than a copy of it.
//
// WHAT IT IS FOR. Build it 15 part 2 (issue #86) gave the My tasks page a choice
// of lists: all tasks, personal only, or one team's. Four small decisions came
// with it, and all four are the kind that look obviously right and are not:
//
//   readFilter       what a ?filter= in the address bar is allowed to become.
//                    Anything it does not recognise has to come out as null, or
//                    a value somebody else chose gets written back into the
//                    links on the page.
//   resolveFilter    which list is actually drawn, given the teams the database
//                    let the page read. A filter naming a team you are not in
//                    must not quietly draw an empty list.
//   filterAfterAdd   which list to show after a task is added, so a new task is
//                    never added out of sight.
//   tasksPath        the one place a /tasks link or redirect is built. Every
//                    value is encoded, so no value can add a second parameter.
//
// A FIFTH ARRIVED WITH "MOVE TO..." (issues #88 and #91), and it is the same kind
// of decision -- one that looks obviously right and is not:
//
//   taskTeam         what a task's team chip says, and whether the task is
//                    STRANDED: sitting in a team its creator has left, which is
//                    the one state the app cannot tick or rename. The trap is
//                    that "this team's name is missing" has three possible
//                    readings and only one of them may be said out loud. Getting
//                    it wrong means either telling somebody they have left a team
//                    when the teams query simply failed, or leaving the person
//                    with the unexplainable refusal #91 is about.
//
// IT IMPORTS THE REAL FILE. web/src/lib/tasks.ts, directly -- not a copy pasted
// into this script, which would prove only that the copy works. That file has no
// imports of its own and nothing but types and plain functions in it, so Node can
// read it with no bundler and no packages.
//
// NODE 22.6 OR NEWER, because of that: Node strips the TypeScript types as it
// loads the file. On Node 24 (`node --version`) this needs no flag. On 22.x it
// needs `node --experimental-strip-types scripts/tasks-filter-check.mjs`.
//
// WHAT IT DOES NOT COVER, said plainly: nothing about the database, nothing about
// what any person can see, and nothing drawn on a screen. The rules about who may
// read, change or delete a task live in supabase/migrations and are checked by
// scripts/staging/build-it-15-checks.mjs against staging. This script checks four
// pure functions and claims nothing else.
//
// IT CAN FAIL, which is the only reason to trust it passing. Proved by breaking
// each of the four functions in turn and watching the matching checks go red --
// the runs are in evidence/build-it-15-part-2.md.
//
// ONE HARMLESS WARNING. Node prints MODULE_TYPELESS_PACKAGE_JSON when it loads
// the .ts file, because web/package.json has no "type" field. Do not add one to
// silence it: that file configures the Next.js build, and this script is not a
// reason to change it.
//
// It reads nothing, writes nothing and connects to nothing. Run it from anywhere:
//   node scripts/tasks-filter-check.mjs

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = resolve(HERE, "..", "web", "src", "lib", "tasks.ts");

const {
  FILTER_ALL,
  FILTER_PERSONAL,
  TEAM_LEFT,
  TEAM_NOT_SHOWN,
  filterAfterAdd,
  isTeamId,
  readFilter,
  resolveFilter,
  taskTeam,
  tasksPath,
} = await import(pathToFileURL(MODULE_PATH).href);

// Two team ids this person belongs to, and one they do not. Made up here, in the
// uuid shape Postgres uses. No real id from any database appears in this file.
//
// THEY CONTAIN HEX LETTERS ON PURPOSE. The first version of this file used ids
// made of digits and dashes only, which made the "an upper-case team id is
// lower-cased" check below pass even with the lower-casing deleted from the
// module: toUpperCase() on "1111-..." returns "1111-...". The break-it run found
// that, which is the whole argument for doing the break-it run.
const TEAM_ONE = "a1b2c3d4-0001-4e5f-8a9b-0c1d2e3f4a5b";
const TEAM_TWO = "a1b2c3d4-0002-4e5f-8a9b-0c1d2e3f4a5b";
const TEAM_OTHER = "a1b2c3d4-0003-4e5f-8a9b-0c1d2e3f4a5b";
const MINE = [TEAM_ONE, TEAM_TWO];

// Two made-up user ids, for the taskTeam checks: the signed-in person, and
// somebody else whose task they can see because they share a team. Invented
// here, in uuid shape. No real user id from any database appears in this file,
// and nothing in it is an email address or a name.
const ME = "11111111-1111-4111-8111-111111111111";
const SOMEBODY_ELSE = "22222222-2222-4222-8222-222222222222";

// The teams the page read back, as the page holds them: id to name.
const TEAM_NAMES = new Map([
  [TEAM_ONE, "Tuesday crew"],
  [TEAM_TWO, "Hall setup"],
]);

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

console.log(`\nChecking ${MODULE_PATH}\n`);

// ---------------------------------------------------------------- readFilter
//
// Everything that is not "personal" or a uuid becomes null, which the page reads
// as "show all tasks". Null is the safe answer: it is the only one that never
// travels back into a link.
console.log("readFilter -- what a ?filter= is allowed to become");
check("nothing at all is 'all'", readFilter(undefined), null);
check("an empty string is 'all'", readFilter(""), null);
check("the word all is 'all'", readFilter(FILTER_ALL), null);
check("personal is kept", readFilter(FILTER_PERSONAL), FILTER_PERSONAL);
check("personal is trimmed", readFilter("  personal  "), FILTER_PERSONAL);
check("a team id is kept", readFilter(TEAM_ONE), TEAM_ONE);
check(
  "an upper-case team id is lower-cased, to match what Postgres returns",
  readFilter(TEAM_ONE.toUpperCase()),
  TEAM_ONE,
);
check("a word is refused", readFilter("mine"), null);
check(
  "markup is refused",
  readFilter("<script>alert(1)</script>"),
  null,
);
check(
  "a second parameter cannot be smuggled in",
  readFilter(`${TEAM_ONE}&problem=save`),
  null,
);
check(
  "a repeated ?filter=, which arrives as an array, is refused",
  readFilter([FILTER_PERSONAL, TEAM_ONE]),
  null,
);

// ------------------------------------------------------------------ isTeamId
console.log("\nisTeamId -- the shape of a team id, and nothing more");
check("a uuid", isTeamId(TEAM_ONE), true);
check("the same digits without dashes", isTeamId(TEAM_ONE.replaceAll("-", "")), false);
check("an empty string", isTeamId(""), false);
check("not a string at all", isTeamId(null), false);

// -------------------------------------------------------------- resolveFilter
console.log("\nresolveFilter -- which list is drawn, and what travels on");
check("no filter shows everything", resolveFilter(undefined, MINE), {
  active: FILTER_ALL,
  carried: null,
  missed: false,
});
check("personal", resolveFilter(FILTER_PERSONAL, MINE), {
  active: FILTER_PERSONAL,
  carried: FILTER_PERSONAL,
  missed: false,
});
check("a team this person belongs to", resolveFilter(TEAM_ONE, MINE), {
  active: TEAM_ONE,
  carried: TEAM_ONE,
  missed: false,
});
check(
  "the same team in upper case still matches",
  resolveFilter(TEAM_ONE.toUpperCase(), MINE),
  { active: TEAM_ONE, carried: TEAM_ONE, missed: false },
);
check(
  "a team this person is NOT in: everything is shown, and the page is told to say so",
  resolveFilter(TEAM_OTHER, MINE),
  { active: FILTER_ALL, carried: null, missed: true },
);
check(
  "a team id with no teams read back at all -- what a failed teams query leaves",
  resolveFilter(TEAM_ONE, []),
  { active: FILTER_ALL, carried: null, missed: true },
);
check(
  "nonsense shows everything WITHOUT a complaint: it never named a list",
  resolveFilter("mine", MINE),
  { active: FILTER_ALL, carried: null, missed: false },
);

// ------------------------------------------------------------- filterAfterAdd
//
// The one rule: after adding, the person must be looking at a list that contains
// what they just added.
console.log("\nfilterAfterAdd -- the new task is never added out of sight");
check("all tasks already shows it", filterAfterAdd(null, FILTER_PERSONAL), null);
check("all tasks shows a team task too", filterAfterAdd(null, TEAM_ONE), null);
check(
  "personal, added to personal: stay",
  filterAfterAdd(FILTER_PERSONAL, FILTER_PERSONAL),
  FILTER_PERSONAL,
);
check(
  "personal, added to a team: move to the team",
  filterAfterAdd(FILTER_PERSONAL, TEAM_ONE),
  TEAM_ONE,
);
check(
  "a team, added to personal: move to personal",
  filterAfterAdd(TEAM_ONE, FILTER_PERSONAL),
  FILTER_PERSONAL,
);
check(
  "one team, added to another: move to that one",
  filterAfterAdd(TEAM_ONE, TEAM_TWO),
  TEAM_TWO,
);
check("the same team: stay", filterAfterAdd(TEAM_ONE, TEAM_ONE), TEAM_ONE);

// ------------------------------------------------------------------- taskTeam
//
// The chip on a task's row, and the stranded flag that decides whether the
// screen offers an explanation. The question underneath every check: when this
// task's team is NOT among the teams the page read, what may the app honestly
// say about why?
console.log("\ntaskTeam -- what a task's team chip says, and what it may claim");

const loaded = { userId: ME, teamNames: TEAM_NAMES, teamsFailed: false };
const failed = { userId: ME, teamNames: new Map(), teamsFailed: true };

check(
  "a personal task has no chip at all",
  taskTeam({ team_id: null, owner_id: ME }, loaded),
  { label: null, stranded: false },
);
check(
  "a task in a team you are in says the team's name",
  taskTeam({ team_id: TEAM_ONE, owner_id: ME }, loaded),
  { label: "Tuesday crew", stranded: false },
);
check(
  "a team mate's task in that team says the same name: the chip is about the task, not about who you are",
  taskTeam({ team_id: TEAM_TWO, owner_id: SOMEBODY_ELSE }, loaded),
  { label: "Hall setup", stranded: false },
);
check(
  "YOUR OWN task in a team missing from a list that loaded is stranded, and says so",
  taskTeam({ team_id: TEAM_OTHER, owner_id: ME }, loaded),
  { label: TEAM_LEFT, stranded: true },
);
check(
  "the SAME task when the teams query failed is not called stranded: nothing is known about your teams",
  taskTeam({ team_id: TEAM_OTHER, owner_id: ME }, failed),
  { label: TEAM_NOT_SHOWN, stranded: false },
);
check(
  "a task that is not yours, in a team not in your list, claims nothing either",
  taskTeam({ team_id: TEAM_OTHER, owner_id: SOMEBODY_ELSE }, loaded),
  { label: TEAM_NOT_SHOWN, stranded: false },
);
check(
  "a personal task is never stranded, even when the teams query failed",
  taskTeam({ team_id: null, owner_id: ME }, failed),
  { label: null, stranded: false },
);

// ------------------------------------------------------------------ tasksPath
console.log("\ntasksPath -- the only place a /tasks address is built");
check("nothing to carry", tasksPath({}), "/tasks");
check("an absent filter adds nothing", tasksPath({ filter: null }), "/tasks");
check(
  "an empty value adds nothing",
  tasksPath({ filter: "", problem: "" }),
  "/tasks",
);
check(
  "the filter alone",
  tasksPath({ filter: FILTER_PERSONAL }),
  "/tasks?filter=personal",
);
check(
  "the filter travels with a rename",
  tasksPath({ filter: TEAM_ONE, rename: "abc" }),
  `/tasks?filter=${TEAM_ONE}&rename=abc`,
);
check(
  "a problem without a filter",
  tasksPath({ filter: null, problem: "save" }),
  "/tasks?problem=save",
);
check(
  "the filter travels with a move, so the chooser opens in the list you were in",
  tasksPath({ filter: TEAM_ONE, move: "abc" }),
  `/tasks?filter=${TEAM_ONE}&move=abc`,
);
check("the added flag", tasksPath({ added: "1" }), "/tasks?added=1");
check(
  "where a task was moved to: Personal",
  tasksPath({ filter: TEAM_ONE, moved: FILTER_PERSONAL }),
  `/tasks?filter=${TEAM_ONE}&moved=personal`,
);
check(
  "where a task was moved to: a team, named by its id for the page to look up",
  tasksPath({ moved: TEAM_TWO }),
  `/tasks?moved=${TEAM_TWO}`,
);
check(
  "every value is encoded, so no value can add a parameter of its own",
  tasksPath({ rename: "a b&problem=save" }),
  "/tasks?rename=a+b%26problem%3Dsave",
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
