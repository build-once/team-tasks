#!/usr/bin/env node
// friendly-words-check.mjs -- every value the database allows has a word a person
// can read, and the list is READ OUT OF THE MIGRATIONS rather than written here.
//
// WHAT IT IS FOR. Build it 19 (issue #173) rule 5: internal values are shown as
// friendly words -- roles, and the invitation statuses already on My teams. The
// mapping lives in web/src/lib/words.ts, and the obvious way to check it is to list
// the values here and compare. That check would be worthless. It would be two copies
// of the same opinion agreeing with each other, and the thing it is supposed to
// catch -- a migration adding a fourth status that nothing on screen can draw --
// changes neither copy.
//
// SO THE AUTHORITY IS THE MIGRATION. This script reads:
//
//   supabase/migrations/20261002122203_team_rules.sql
//       for the roles, out of public.team_roster, which DERIVES its role column:
//       `'owner'::text as role` over public.teams, and `'member'::text as role`
//       over public.team_members. There is no roles table and nothing stored, so
//       those two literals are the whole list.
//
//   supabase/migrations/20261006095847_invitation_status.sql
//       for the statuses, out of the check constraint that enforces them:
//       `add constraint invitations_status_allowed check (status in ('queued',
//       'sent', 'failed'));`
//
// A MIGRATION ADDING A VALUE THEREFORE TURNS THIS RED, which is the only way a
// screen gets told about it. An `if` chain in a page would simply draw nothing, or
// draw the raw word.
//
// IT GOES BOTH WAYS, and the second direction matters as much as the first: a word
// in the mapping for a value the database does NOT allow is also a failure. It means
// somebody wrote wording for a value that cannot exist, which is how a screen ends
// up with a branch nobody can reach and nobody can test -- and, worse, how a stale
// word survives a migration that removed its value.
//
// THE SAME GOES FOR THE FAILURE CODES, which are not strictly "friendly words" but
// are the same promise: web/src/lib/teams.ts has a sentence per code, and the codes
// are a fixed list in the same migration's second constraint. That one is read as
// text, for the reason below.
//
// WHY words.ts IS IMPORTED AND teams.ts IS NOT. words.ts has no imports at all, so
// Node can load it with no bundler and no packages, stripping the TypeScript types
// as it reads. teams.ts imports from words.ts through the "@/lib/words" alias, which
// only the Next.js build resolves -- so it is read as TEXT here. That is enough for
// what this script asks of it.
//
// NODE 22.18 OR NEWER, for the type stripping (nodejs.org/api/typescript.html, the
// History table).
//
// IT CAN FAIL, which is the only reason to trust it passing. Proved by deleting one
// role and one status from the mapping in turn and watching the matching checks go
// red; the runs are in evidence/build-it-19-honest-screens.md.
//
// It reads three files and connects to nothing. Run it from anywhere:
//   node scripts/friendly-words-check.mjs

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = resolve(HERE, "..", "web", "src", "lib");
const MIGRATIONS = resolve(HERE, "..", "supabase", "migrations");

const TEAM_RULES = resolve(MIGRATIONS, "20261002122203_team_rules.sql");
const INVITATION_STATUS = resolve(
  MIGRATIONS,
  "20261006095847_invitation_status.sql",
);

const {
  INVITATION_STATUS_WORDS,
  ROLE_WORDS,
  UNKNOWN_INVITATION_STATUS_WORD,
  UNKNOWN_ROLE_WORD,
  invitationStatusWord,
  roleWord,
} = await import(pathToFileURL(resolve(LIB, "words.ts")).href);

const TEAMS_SOURCE = readFileSync(resolve(LIB, "teams.ts"), "utf8");

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

// ---------------------------------------------------------------------------
// Reading the database's own lists
// ---------------------------------------------------------------------------

// Every role the view derives, from `'<word>'::text as role`.
//
// Deliberately not a parser. It matches the one construct the view uses, which is
// the construct a third role would also have to use -- another branch of that union
// selecting a literal as `role`. A role introduced some other way (a case
// expression, a joined table) would not be found, and then THIS script is what is
// wrong rather than the mapping; the note is here so the next person reads it before
// trusting a green tick.
function rolesFromMigration(sql) {
  const found = new Set();
  for (const match of sql.matchAll(/'([a-z_]+)'::text\s+as\s+role/g)) {
    found.add(match[1]);
  }
  return [...found].sort();
}

// Every value a column may hold, from `check (<column> in ('a', 'b', 'c'))`.
//
// Finds the constraint by name, then reads the quoted words inside the brackets that
// follow. Named rather than positional, so adding another constraint to the file
// does not quietly change which one this reads.
function allowedValues(sql, constraintName, column) {
  const after = sql.split(`add constraint ${constraintName}`)[1];
  if (after === undefined) return null;

  const list = after.match(new RegExp(`${column}\\s+in\\s*\\(([^)]*)\\)`));
  if (list === null) return null;

  return [...list[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
}

const teamRulesSql = readFileSync(TEAM_RULES, "utf8");
const invitationStatusSql = readFileSync(INVITATION_STATUS, "utf8");

const rolesInDatabase = rolesFromMigration(teamRulesSql);

const statusesInDatabase = allowedValues(
  invitationStatusSql,
  "invitations_status_allowed",
  "status",
);

const failureCodesInDatabase = allowedValues(
  invitationStatusSql,
  "invitations_failure_code_allowed",
  "failure_code",
);

console.log(`\nReading the database's own lists out of:`);
console.log(`  ${TEAM_RULES}`);
console.log(`  ${INVITATION_STATUS}\n`);

// =========================================================================
// 0. The reading itself worked
// =========================================================================
//
// A CHECK THAT FOUND NOTHING TO CHECK IS NOT A PASS (AGENTS.md rule 8). If a
// migration were renamed, or a constraint rewritten in a shape these two functions
// do not recognise, every comparison below would be an empty list against an empty
// list and would pass. So the lists are checked for being there, and for being the
// size they are, before anything is compared with them.
console.log("0. the lists were actually found in the migrations");

check("roles were found in the view", rolesInDatabase.length > 0, true);
check("the roles the view derives", rolesInDatabase, ["member", "owner"]);

check(
  "the status constraint was found",
  statusesInDatabase !== null && statusesInDatabase.length > 0,
  true,
);
check("the statuses it allows", statusesInDatabase, [
  "failed",
  "queued",
  "sent",
]);

check(
  "the failure-code constraint was found",
  failureCodesInDatabase !== null && failureCodesInDatabase.length > 0,
  true,
);
check("the codes it allows", failureCodesInDatabase, [
  "not_configured",
  "refused",
  "unconfirmed",
  "unreachable",
]);

// =========================================================================
// 1. Roles
// =========================================================================
console.log("\n1. every role the view derives has a word, and no word is spare");

check(
  "THE MAPPING COVERS EVERY ROLE THE DATABASE ALLOWS -- this is what goes red when a migration adds a third",
  rolesInDatabase.filter(
    (role) => !Object.prototype.hasOwnProperty.call(ROLE_WORDS, role),
  ),
  [],
);

check(
  "AND NOTHING MORE: a word for a role the database cannot produce is a branch nobody can reach",
  Object.keys(ROLE_WORDS).filter((role) => !rolesInDatabase.includes(role)),
  [],
);

check(
  "the two lists are the same size, so neither direction above passed on an empty list",
  [rolesInDatabase.length, Object.keys(ROLE_WORDS).length],
  [2, 2],
);

check("owner reads as a word", roleWord("owner"), "Owner");
check("member reads as a word", roleWord("member"), "Member");

check(
  "EVERY ROLE IN THE DATABASE COMES BACK AS SOMETHING OTHER THAN ITSELF, which is what 'friendly' means here",
  rolesInDatabase.map((role) => roleWord(role) !== role),
  rolesInDatabase.map(() => true),
);

check(
  "and never as the raw value: no word in the mapping is one of the stored values",
  Object.values(ROLE_WORDS).filter((word) => rolesInDatabase.includes(word)),
  [],
);

console.log("\n1a. and a role this app has never heard of");
check(
  "an unknown role says so rather than printing itself",
  roleWord("treasurer"),
  UNKNOWN_ROLE_WORD,
);
check(
  "IT DOES NOT GUESS 'Member': guessing the lower of two permissions is a quiet lie about what somebody can do",
  roleWord("treasurer") === ROLE_WORDS.member,
  false,
);
check(
  "the raw value is not in the answer",
  roleWord("treasurer").includes("treasurer"),
  false,
);
check("null", roleWord(null), UNKNOWN_ROLE_WORD);
check("undefined", roleWord(undefined), UNKNOWN_ROLE_WORD);
check("an empty string", roleWord(""), UNKNOWN_ROLE_WORD);
check("a number", roleWord(1), UNKNOWN_ROLE_WORD);
check("an array, which a repeated value would arrive as", roleWord(["owner"]), UNKNOWN_ROLE_WORD);
check("markup", roleWord("<b>owner</b>"), UNKNOWN_ROLE_WORD);
check("a key off Object.prototype", roleWord("constructor"), UNKNOWN_ROLE_WORD);
check("upper case still matches, because a word is a word", roleWord("OWNER"), "Owner");
check("and so does a padded one", roleWord("  member  "), "Member");

// =========================================================================
// 2. Invitation statuses
// =========================================================================
console.log(
  "\n2. every status the constraint allows has a word, and no word is spare",
);

check(
  "THE MAPPING COVERS EVERY STATUS THE DATABASE ALLOWS -- this is what goes red when a migration adds a fourth",
  statusesInDatabase.filter(
    (status) =>
      !Object.prototype.hasOwnProperty.call(INVITATION_STATUS_WORDS, status),
  ),
  [],
);

check(
  "AND NOTHING MORE",
  Object.keys(INVITATION_STATUS_WORDS).filter(
    (status) => !statusesInDatabase.includes(status),
  ),
  [],
);

check(
  "the two lists are the same size, so neither direction above passed on an empty list",
  [statusesInDatabase.length, Object.keys(INVITATION_STATUS_WORDS).length],
  [3, 3],
);

check(
  "queued reads as sending: what the owner wants to know is where their invitation is, not which value a column holds",
  invitationStatusWord("queued"),
  "sending",
);
check(
  "failed reads as 'could not be sent': the send is what did not work, not the person who typed the address",
  invitationStatusWord("failed"),
  "could not be sent",
);
check(
  "sent reads as sent, which is the one case where the stored word is already the right word",
  invitationStatusWord("sent"),
  "sent",
);

// Written as a count rather than as a list in sorted order, so a fourth status does
// not silently line up with the wrong expectation.
check(
  "EVERY STATUS HAS A WORD, and exactly one of them -- 'sent' -- is already the right word",
  statusesInDatabase.filter((status) => invitationStatusWord(status) === status),
  ["sent"],
);

console.log("\n2a. and a status this app has never heard of");
check(
  "an unknown status is drawn as 'sending', the honest reading of a row nobody has confirmed",
  invitationStatusWord("bounced"),
  UNKNOWN_INVITATION_STATUS_WORD,
);
check(
  "the raw value is not in the answer",
  invitationStatusWord("bounced").includes("bounced"),
  false,
);
check("null", invitationStatusWord(null), UNKNOWN_INVITATION_STATUS_WORD);
check("undefined", invitationStatusWord(undefined), UNKNOWN_INVITATION_STATUS_WORD);
check("an empty string", invitationStatusWord(""), UNKNOWN_INVITATION_STATUS_WORD);
check(
  "a key off Object.prototype",
  invitationStatusWord("toString"),
  UNKNOWN_INVITATION_STATUS_WORD,
);
check("upper case", invitationStatusWord("SENT"), "sent");
check("padded", invitationStatusWord("  failed  "), "could not be sent");

check(
  "no word is a code: nothing in this mapping contains an underscore, which every stored code does",
  Object.values(INVITATION_STATUS_WORDS).some((word) => word.includes("_")),
  false,
);

// =========================================================================
// 3. The failure codes, and their sentences
// =========================================================================
//
// Not "friendly words" exactly -- a code gets a whole sentence rather than a word --
// but the same promise, and the same authority: the codes are a fixed list in the
// same migration, and web/src/lib/teams.ts has a sentence for each. docs/plan.md's
// rule is that a failure shows "a short reason code and nothing more -- never the
// email service's full reply", and the code is what is STORED while the sentence is
// what is SHOWN.
//
// teams.ts is read as text here, not imported, for the reason at the top of this
// file: it imports words.ts through an alias only the Next.js build resolves.
console.log("\n3. every failure code the constraint allows has a sentence");

check(
  "EVERY CODE THE DATABASE ALLOWS IS IN THE APP'S OWN LIST",
  failureCodesInDatabase.filter(
    (code) => !TEAMS_SOURCE.includes(`"${code}"`),
  ),
  [],
);

check(
  "AND EVERY ONE HAS A SENTENCE, keyed by the code in INVITATION_FAILURE_SENTENCES",
  failureCodesInDatabase.filter((code) => !TEAMS_SOURCE.includes(`${code}:`)),
  [],
);

check(
  "four codes, and the list was not empty",
  failureCodesInDatabase.length,
  4,
);

check(
  "NO SENTENCE PRINTS ITS OWN CODE: an underscored word on screen is the thing docs/plan.md guards against",
  failureCodesInDatabase.filter((code) => {
    const line = TEAMS_SOURCE.split(`${code}:`)[1] ?? "";
    return line.split("\n").slice(0, 3).join(" ").includes(`"${code}`);
  }),
  [],
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
