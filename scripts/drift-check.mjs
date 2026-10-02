#!/usr/bin/env node
// scripts/drift-check.mjs
//
// What it does, in plain English:
//   Compares what is ACTUALLY in production with what this repository says
//   should be there, and writes a report. It changes nothing, anywhere.
//
//   Two comparisons:
//     1. migrations -- the versions applied to production, against the files in
//        supabase/migrations/;
//     2. functions  -- the function slugs deployed to production, against the
//        folders in supabase/functions/.
//
//   It does NOT talk to production itself. It cannot: it has no connection
//   string, no token and no network code. The workflow
//   .github/workflows/drift-check.yml runs two read-only Supabase CLI commands,
//   saves their output to files, and hands those files to this script. That
//   split is on purpose -- it is what lets the comparison have a self-test, and
//   it keeps the only credential-holding step down to one line.
//
// Exit codes:
//     0 = checked, and production matches the repository
//     3 = checked, and it does NOT match -- a drift report was written
//     1 = could NOT check (bad input, nothing to check, a parse failure).
//         This is "unverified", not a pass: AGENTS.md rule 8.
//     2 = wrong usage
//
// WHAT IT NEVER PRINTS. The run log of the workflow is public, because the
// repository is. So this script prints only:
//     * migration versions (14 digits) and the names taken from the FILENAMES
//       in supabase/migrations/ -- both already public in this repository;
//     * function slugs, which are the folder names in supabase/functions/ --
//       also already public here;
//     * a function's status, which is one of ACTIVE, REMOVED or THROTTLED.
//
//   It never prints anything else out of the CLI's output, and that restraint
//   is not decoration. Two things in there are NOT safe to echo:
//     * the CLI's error payload names the host and user it tried to connect as.
//       Observed verbatim from the pinned CLI against a local cluster:
//         {"_tag":"Error","error":{"code":"LegacyDbConnectError","message":
//          "failed to connect to postgres: failed to connect to
//           `host=127.0.0.1 user=postgres database=postgres`: tls error ..."}}
//       Against production that message carries production's pooler host and
//       database user. So when this script meets an error payload it prints the
//       `code` -- a plain identifier -- and NOT the message.
//     * every function in `functions list` carries an `id` (a UUID), plus
//       `entrypoint_path` and `import_map_path`. None of them is read here.
//
// Zero dependencies. Node >= 20.
//
// Usage, as the workflow calls it:
//   node scripts/drift-check.mjs \
//     --migration-list <file> \
//     --function-list <file> \
//     --migrations-dir supabase/migrations \
//     --functions-dir supabase/functions \
//     [--report <file>]
//
// Run the built-in self-test with:
//   node scripts/drift-check.mjs --selftest

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

// ---------------------------------------------------------------------------
// Parsing the CLI's output
//
// Both commands below were read from the PINNED CLI (2.117.0) on 2026-10-02,
// not remembered, and the exact outputs are recorded in
// evidence/build-it-15-part-4.md.
//
// The format of both is settled by `--output-format json`, which the workflow
// passes. Why it is passed explicitly, rather than left to the default: on
// 2.117.0 the default format depends on whether the CLI thinks it is being run
// by an agent (`--agent auto` is the default). The same command printed JSON in
// the assistant's shell and a pipe-separated table with `--agent no`. A format
// that changes with the environment is not something to build a parser on.
//
// Note that `-o json` is a DIFFERENT, older flag -- "output format of status
// variables" -- and on 2.117.0 passing it made `migration list` print the
// TABLE. Both were tried; the evidence file has both outputs.
//
// The table parser below is kept anyway, as a fallback, for the day the flag or
// its default changes. Both paths are covered by the self-test.
// ---------------------------------------------------------------------------

// Pulls the one JSON object out of the CLI's output.
//
// The CLI surrounds its result with human lines -- "Connecting to remote
// database..." before it, and sometimes a "A new version of Supabase CLI is
// available" notice after. So every line is tried in turn and the first one
// that parses into an object is taken.
function findJsonObject(text) {
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  }
  return null;
}

// The CLI reports its own failures as {"_tag":"Error","error":{"code":...,"message":...}}.
// Only the code is used. See the header for why the message is not.
function throwIfCliError(obj, what) {
  if (!obj || obj._tag !== "Error") return;
  const code = obj.error && typeof obj.error.code === "string" ? obj.error.code : "";
  const safe = /^[A-Za-z0-9_]+$/.test(code) ? code : "(not a plain identifier; not printed)";
  throw new Error(
    `The Supabase CLI reported an error instead of ${what}: code ${safe}. ` +
      "Its message is deliberately not shown -- it names the host and database user it tried to connect as."
  );
}

/**
 * The workflow never lets a failing CLI command fail its own step. It saves the
 * output, records the exit code, and hands both to this script -- so that the
 * ONE place that reads the CLI's output is the one place with a self-test, and
 * so that the extraction of a safe error code happens in tested code rather
 * than in a shell line nobody checks.
 *
 * Throws if the command did not exit 0. Nothing but the exit code and, when one
 * is there, the error `code` reaches the message.
 */
export function assertCliSucceeded(text, exitCode, command) {
  if (exitCode === 0) return;
  let code = "";
  const obj = findJsonObject(text);
  if (obj && obj._tag === "Error" && typeof obj.error?.code === "string") code = obj.error.code;
  const shown = /^[A-Za-z0-9_]{1,64}$/.test(code) ? `, error code ${code}` : ", with no plain error code in its output";
  throw new Error(
    `\`${command}\` exited ${exitCode}${shown}, so NOTHING was compared. ` +
      "The command's own output is deliberately not shown: it names the host and database user it tried to connect as."
  );
}

/**
 * Reads `supabase migration list` output.
 *
 * Returns { rows, source } where each row is { local, remote } -- exactly the
 * CLI's own two columns, with "" for an empty cell:
 *   local set, remote ""   -> in this repository, NOT applied to production
 *   local "", remote set   -> applied to production, NOT in this repository
 */
export function parseMigrationList(text) {
  const obj = findJsonObject(text);
  throwIfCliError(obj, "a migration list");

  if (obj && Array.isArray(obj.migrations)) {
    const rows = obj.migrations.map((m) => ({
      local: typeof m?.local === "string" ? m.local.trim() : "",
      remote: typeof m?.remote === "string" ? m.remote.trim() : "",
    }));
    return { rows, source: "json" };
  }

  // Fallback: the pipe-separated table. Its empty cell is a backtick, a space
  // and a backtick, which strips to "".
  const lines = String(text).split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /\bLocal\b/.test(l) && /\bRemote\b/.test(l) && l.includes("|"));
  if (headerIdx === -1) {
    throw new Error(
      "Could not read the migration list: it is neither the JSON shape nor the table shape this script knows. " +
        "Nothing was compared. The CLI's output is NOT printed here (see the header of scripts/drift-check.mjs)."
    );
  }
  const cell = (s) => s.replace(/`/g, "").trim();
  const rows = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.includes("|")) continue;
    if (/^[\s|-]+$/.test(line)) continue; // the ---|---|--- rule
    const parts = line.split("|").map(cell);
    if (parts.length < 2) continue;
    const local = parts[0];
    const remote = parts[1];
    if (!/^\d{14}$/.test(local) && !/^\d{14}$/.test(remote)) continue;
    rows.push({ local: /^\d{14}$/.test(local) ? local : "", remote: /^\d{14}$/.test(remote) ? remote : "" });
  }
  return { rows, source: "table" };
}

/**
 * Reads `supabase functions list --output-format json` output.
 *
 * Returns { functions, source }, each function { slug, status }.
 *
 * The shape -- {"functions":[{id,slug,name,status,version,created_at,
 * updated_at,...}],"message":""} -- and the three possible statuses, ACTIVE,
 * REMOVED and THROTTLED, were read out of the pinned 2.117.0 binary on
 * 2026-10-02 and match the Management API's own list-functions response schema
 * (api.supabase.com/api/v1-json, components.schemas.FunctionResponse_Output,
 * which requires id, slug, name, status, version, created_at, updated_at).
 *
 * UNVERIFIED: no successful `functions list` has ever been run from this
 * repository -- the assistant holds no token for any project. So this has been
 * read off the binary and the API schema, not off a real answer. If the first
 * real run cannot be parsed, the job goes red with the message below, which is
 * the right outcome: a check that could not read its input has not passed.
 */
export function parseFunctionList(text) {
  const obj = findJsonObject(text);
  throwIfCliError(obj, "a function list");

  let items = null;
  if (obj && Array.isArray(obj.functions)) items = obj.functions;
  else {
    // A bare array, in case a later CLI drops the wrapper.
    for (const line of String(text).split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("[")) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          items = parsed;
          break;
        }
      } catch {
        /* keep looking */
      }
    }
  }

  if (!items) {
    throw new Error(
      "Could not read the function list: no JSON object with a \"functions\" array, and no bare array. " +
        "Nothing was compared. The CLI's output is NOT printed here (see the header of scripts/drift-check.mjs)."
    );
  }

  const functions = [];
  for (const f of items) {
    const slug = typeof f?.slug === "string" ? f.slug.trim() : typeof f?.name === "string" ? f.name.trim() : "";
    if (!slug) {
      throw new Error(
        "Could not read the function list: an entry has neither a \"slug\" nor a \"name\". Nothing was compared."
      );
    }
    const status = typeof f?.status === "string" ? f.status.trim() : "";
    functions.push({ slug, status });
  }
  return { functions, source: "json" };
}

// ---------------------------------------------------------------------------
// Reading this repository
// ---------------------------------------------------------------------------

/** supabase/migrations/20260927182443_create_tasks.sql -> {version, name}. */
export function parseMigrationFilenames(files) {
  const out = [];
  for (const file of files) {
    const name = basename(file);
    if (!name.endsWith(".sql")) continue;
    const m = /^(\d{14})_(.+)\.sql$/.exec(name);
    if (!m) {
      throw new Error(
        `supabase/migrations/${name} is not named <14 digits>_<name>.sql, so the comparison cannot name it. Nothing was compared.`
      );
    }
    out.push({ version: m[1], name: m[2] });
  }
  out.sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));
  return out;
}

/** Folder names under supabase/functions/, minus Supabase's shared-code folders. */
export function parseFunctionFolders(entries) {
  // "You can store any shared code in a folder prefixed with an underscore (_)"
  // -- https://supabase.com/docs/guides/functions/development-tips
  // migrate-production.yml's smoke test skips those folders for the same reason.
  return entries.filter((e) => !e.startsWith("_") && !e.startsWith(".")).sort();
}

// ---------------------------------------------------------------------------
// The comparison itself
// ---------------------------------------------------------------------------

/**
 * @param {object} input
 * @param {{local:string,remote:string}[]} input.migrationRows  from parseMigrationList
 * @param {{version:string,name:string}[]} input.repoMigrations  from parseMigrationFilenames
 * @param {{slug:string,status:string}[]} input.deployedFunctions from parseFunctionList
 * @param {string[]} input.repoFunctions                         from parseFunctionFolders
 * @returns {{drift:boolean, findings:string[], notes:string[], counts:object}}
 */
export function compareDrift({ migrationRows, repoMigrations, deployedFunctions, repoFunctions }) {
  const findings = [];
  const notes = [];

  // A check with nothing to check is not a pass (AGENTS.md rule 8). Both of
  // these would also be a sign the checkout, not production, is what is wrong.
  if (repoMigrations.length === 0) {
    throw new Error("supabase/migrations/ holds no migration files, so NOTHING was compared.");
  }
  if (repoFunctions.length === 0) {
    throw new Error("supabase/functions/ holds no function folders, so NOTHING was compared.");
  }
  if (migrationRows.length === 0) {
    throw new Error("The migration list was read but held no rows, so NOTHING was compared.");
  }

  const nameOf = new Map(repoMigrations.map((m) => [m.version, m.name]));

  // Integrity check before the comparison: the CLI's "Local" column is its own
  // reading of supabase/migrations/, and this script reads that folder too. If
  // the two disagree, one of them is looking at something unexpected -- a
  // --workdir pointing elsewhere, a file that is not .sql, a partial checkout --
  // and the honest answer is "could not check", not a drift report built on a
  // list we do not trust.
  const cliLocal = migrationRows.map((r) => r.local).filter(Boolean).sort();
  const repoLocal = repoMigrations.map((m) => m.version).sort();
  if (cliLocal.join(",") !== repoLocal.join(",")) {
    throw new Error(
      "The CLI's view of supabase/migrations/ does not match this script's: " +
        `the CLI listed ${cliLocal.length} local version(s), the folder holds ${repoLocal.length}. ` +
        "Nothing was compared, because a drift report built on a list we cannot reconcile would be worse than none."
    );
  }

  for (const row of migrationRows) {
    if (row.local && !row.remote) {
      findings.push(
        `MIGRATION MISSING FROM PRODUCTION -- \`${row.local}\` \`${nameOf.get(row.local) ?? ""}\` is in supabase/migrations/ but has not been applied to production.`
      );
    } else if (!row.local && row.remote) {
      findings.push(
        `MIGRATION EXTRA IN PRODUCTION -- \`${row.remote}\` has been applied to production but is not in supabase/migrations/. (The CLI does not report a name for a version this repository does not have.)`
      );
    }
  }

  const deployedBySlug = new Map(deployedFunctions.map((f) => [f.slug, f]));
  for (const slug of repoFunctions) {
    const deployed = deployedBySlug.get(slug);
    if (!deployed) {
      findings.push(
        `FUNCTION MISSING FROM PRODUCTION -- \`${slug}\` is a folder in supabase/functions/ but is not deployed to production.`
      );
      continue;
    }
    if (deployed.status && deployed.status !== "ACTIVE") {
      findings.push(
        `FUNCTION NOT ACTIVE IN PRODUCTION -- \`${slug}\` is deployed but its status is \`${safeStatus(deployed.status)}\`, not \`ACTIVE\`.`
      );
    }
  }
  for (const f of deployedFunctions) {
    if (!repoFunctions.includes(f.slug)) {
      findings.push(
        `FUNCTION EXTRA IN PRODUCTION -- \`${f.slug}\` is deployed to production but has no folder in supabase/functions/.`
      );
    }
  }

  notes.push(
    `Compared ${repoMigrations.length} migration file(s) and ${repoFunctions.length} function folder(s) against production.`
  );

  return {
    drift: findings.length > 0,
    findings,
    notes,
    counts: {
      repoMigrations: repoMigrations.length,
      migrationRows: migrationRows.length,
      repoFunctions: repoFunctions.length,
      deployedFunctions: deployedFunctions.length,
    },
  };
}

// A status is meant to be one of three fixed words. Anything else is printed as
// a placeholder rather than passed through, for the same reason the smoke test
// in migrate-production.yml only prints an error `code` when it is a plain
// identifier: the log is public, and nothing arbitrary should reach it.
function safeStatus(status) {
  return /^[A-Z_]{1,32}$/.test(status) ? status : "(not a plain status; not printed)";
}

/** The body of the "Database drift" issue, or of its comment. */
export function renderReport(result, { runUrl = "" } = {}) {
  const lines = [];
  lines.push("## What differs");
  lines.push("");
  for (const f of result.findings) lines.push(`- ${f}`);
  lines.push("");
  lines.push("## Where it was found");
  lines.push("");
  lines.push(
    "The daily drift check, `.github/workflows/drift-check.yml`, comparing production with `main`. " +
      "It reads and changes nothing: the two commands it runs are `supabase migration list` and `supabase functions list`."
  );
  if (runUrl) lines.push("", `Run: ${runUrl}`);
  lines.push("");
  lines.push("## Why it matters");
  lines.push("");
  lines.push(
    "Production is supposed to be exactly what `main` says it is, because that is the only route a change is allowed to take " +
      "(AGENTS.md rules 2 and 10). A difference means either a change reached production outside the pipeline, or a change " +
      "that was merged never arrived. Both make every later claim about production a guess."
  );
  lines.push("");
  lines.push("## How we will know it is fixed");
  lines.push("");
  lines.push(
    "The next run of this workflow finds no difference and does not comment here. Do **not** close this by hand on the " +
      "strength of a fix having been made: start the workflow from the Actions tab and let it say so."
  );
  lines.push("");
  lines.push(`_${result.notes.join(" ")}_`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function run() {
  const migrationListFile = arg("migration-list");
  const functionListFile = arg("function-list");
  const migrationsDir = arg("migrations-dir") || "supabase/migrations";
  const functionsDir = arg("functions-dir") || "supabase/functions";
  const reportFile = arg("report");
  const migrationExitArg = arg("migration-list-exit") ?? "0";
  const functionExitArg = arg("function-list-exit") ?? "0";

  if (!migrationListFile || !functionListFile) {
    console.error(
      "Usage: node scripts/drift-check.mjs --migration-list <file> --function-list <file> " +
        "[--migration-list-exit n] [--function-list-exit n] [--migrations-dir d] [--functions-dir d] [--report f]"
    );
    return 2;
  }
  if (!/^\d{1,3}$/.test(migrationExitArg) || !/^\d{1,3}$/.test(functionExitArg)) {
    console.error("--migration-list-exit and --function-list-exit must each be a whole number.");
    return 2;
  }

  let result;
  try {
    const migrationText = readFileSync(migrationListFile, "utf8");
    const functionText = readFileSync(functionListFile, "utf8");
    assertCliSucceeded(migrationText, Number(migrationExitArg), "supabase migration list");
    assertCliSucceeded(functionText, Number(functionExitArg), "supabase functions list");

    const { rows, source: migrationSource } = parseMigrationList(migrationText);
    const { functions, source: functionSource } = parseFunctionList(functionText);
    const repoMigrations = parseMigrationFilenames(readdirSync(migrationsDir));
    const repoFunctions = parseFunctionFolders(readdirSync(functionsDir));

    console.log(`Migration list read as ${migrationSource}; function list read as ${functionSource}.`);
    console.log(`In supabase/migrations/: ${repoMigrations.map((m) => `${m.version}_${m.name}`).join(", ")}`);
    console.log(`In supabase/functions/: ${repoFunctions.join(", ")}`);
    console.log(`Applied to production: ${rows.map((r) => r.remote).filter(Boolean).join(", ")}`);
    console.log(`Deployed to production: ${functions.map((f) => `${f.slug} (${safeStatus(f.status)})`).join(", ")}`);

    result = compareDrift({ migrationRows: rows, repoMigrations, deployedFunctions: functions, repoFunctions });
  } catch (err) {
    console.error(`::error::UNVERIFIED -- ${err.message}`);
    return 1;
  }

  if (!result.drift) {
    console.log(`No drift. ${result.notes.join(" ")}`);
    return 0;
  }

  const body = renderReport(result, { runUrl: process.env.DRIFT_RUN_URL || "" });
  if (reportFile) writeFileSync(reportFile, `${body}\n`, "utf8");
  console.log("DRIFT FOUND:");
  for (const f of result.findings) console.log(`  ${f}`);
  return 3;
}

// ---------------------------------------------------------------------------
// Self-test
//
// This is the "prove it can fail" half of issue #93. The fixtures marked
// "recorded" are the real output of the PINNED CLI 2.117.0 against a throwaway
// PostgreSQL 17 cluster on the owner's own machine on 2026-10-02 -- not
// hand-written to match the parser. See evidence/build-it-15-part-4.md.
// ---------------------------------------------------------------------------

// Recorded: six migrations in the repository, all six applied. Default format.
const RECORDED_JSON_IDENTICAL =
  "Connecting to remote database...\n" +
  '{"migrations":[{"local":"20260927182443","remote":"20260927182443","time":"2026-09-27 18:24:43"},' +
  '{"local":"20260930101343","remote":"20260930101343","time":"2026-09-30 10:13:43"},' +
  '{"local":"20260930193813","remote":"20260930193813","time":"2026-09-30 19:38:13"},' +
  '{"local":"20261002122203","remote":"20261002122203","time":"2026-10-02 12:22:03"},' +
  '{"local":"20261002133637","remote":"20261002133637","time":"2026-10-02 13:36:37"},' +
  '{"local":"20261002170244","remote":"20261002170244","time":"2026-10-02 17:02:44"}],' +
  '"message":"Migrations listed"}\n' +
  "A new version of Supabase CLI is available: v2.119.0 (currently installed v2.117.0)\n";

// Recorded, after one row was deleted from the throwaway cluster's
// supabase_migrations.schema_migrations and one unknown version inserted: the
// last repository migration is unapplied, and production carries one the
// repository does not have.
const RECORDED_JSON_BOTH_WAYS =
  "Connecting to remote database...\n" +
  '{"migrations":[{"local":"20260927182443","remote":"20260927182443","time":"2026-09-27 18:24:43"},' +
  '{"local":"20260930101343","remote":"20260930101343","time":"2026-09-30 10:13:43"},' +
  '{"local":"20260930193813","remote":"20260930193813","time":"2026-09-30 19:38:13"},' +
  '{"local":"20261002122203","remote":"20261002122203","time":"2026-10-02 12:22:03"},' +
  '{"local":"20261002133637","remote":"20261002133637","time":"2026-10-02 13:36:37"},' +
  '{"local":"20261002170244","remote":"","time":"2026-10-02 17:02:44"},' +
  '{"local":"","remote":"20261003090000","time":"2026-10-03 09:00:00"}],' +
  '"message":"Migrations listed"}\n';

// Recorded: the same drifted cluster, with -o pretty, which on 2.117.0 prints
// the table. The empty cell really is a backtick, a space and a backtick.
const RECORDED_TABLE_BOTH_WAYS = [
  "Connecting to remote database...",
  "",
  "  ",
  "   Local            | Remote           | Time (UTC)            ",
  "  ------------------|------------------|-----------------------",
  "   `20260927182443` | `20260927182443` | `2026-09-27 18:24:43` ",
  "   `20260930101343` | `20260930101343` | `2026-09-30 10:13:43` ",
  "   `20260930193813` | `20260930193813` | `2026-09-30 19:38:13` ",
  "   `20261002122203` | `20261002122203` | `2026-10-02 12:22:03` ",
  "   `20261002133637` | `20261002133637` | `2026-10-02 13:36:37` ",
  "   `20261002170244` | ` `              | `2026-10-02 17:02:44` ",
  "   ` `              | `20261003090000` | `2026-10-03 09:00:00` ",
  "",
].join("\n");

// Recorded: the pinned CLI's error payload, from a connection attempt that
// failed. Kept here to prove the `message` field does not reach the report.
const RECORDED_CLI_ERROR =
  "Connecting to remote database...\n" +
  '{"_tag":"Error","error":{"code":"LegacyDbConnectError","message":"failed to connect to postgres: ' +
  "failed to connect to `host=127.0.0.1 user=postgres database=postgres`: tls error " +
  '(The server does not support SSL connections)"}}\n';

const REPO_MIGRATION_FILES = [
  "20260927182443_create_tasks.sql",
  "20260930101343_create_teams.sql",
  "20260930193813_create_invitations.sql",
  "20261002122203_team_rules.sql",
  "20261002133637_tasks_join_teams.sql",
  "20261002170244_tasks_drop_owner_only_rules.sql",
];

const REPO_FUNCTION_FOLDERS = ["accept-invite", "create-team", "invite-member"];

function deployed(slugs, status = "ACTIVE") {
  return JSON.stringify({ functions: slugs.map((slug) => ({ slug, name: slug, status })), message: "" });
}

const ALL_THREE_DEPLOYED = deployed(REPO_FUNCTION_FOLDERS);

function selftest() {
  const cases = [];

  // A case either expects a result, or expects the comparison to refuse.
  const check = (name, migrationText, functionText, expect, files = REPO_MIGRATION_FILES, folders = REPO_FUNCTION_FOLDERS) =>
    cases.push({ name, migrationText, functionText, expect, files, folders });

  // --- the four the issue asks for ---------------------------------------
  check("identical lists produce no drift", RECORDED_JSON_IDENTICAL, ALL_THREE_DEPLOYED, {
    drift: false,
    findings: 0,
  });

  check(
    "a migration in the repository but not applied is drift",
    RECORDED_JSON_IDENTICAL.replace('{"local":"20261002170244","remote":"20261002170244"', '{"local":"20261002170244","remote":""'),
    ALL_THREE_DEPLOYED,
    { drift: true, findings: 1, match: /MIGRATION MISSING FROM PRODUCTION .*20261002170244.*tasks_drop_owner_only_rules/ }
  );

  check(
    "a migration applied but not in the repository is drift",
    RECORDED_JSON_IDENTICAL.replace(
      '}],"message"',
      '},{"local":"","remote":"20261003090000","time":"2026-10-03 09:00:00"}],"message"'
    ),
    ALL_THREE_DEPLOYED,
    { drift: true, findings: 1, match: /MIGRATION EXTRA IN PRODUCTION .*20261003090000/ }
  );

  check("a function in the repository but not deployed is drift", RECORDED_JSON_IDENTICAL, deployed(["accept-invite", "create-team"]), {
    drift: true,
    findings: 1,
    match: /FUNCTION MISSING FROM PRODUCTION .*invite-member/,
  });

  // --- and the ones a real morning could also bring ----------------------
  check("both migration directions at once, from recorded output", RECORDED_JSON_BOTH_WAYS, ALL_THREE_DEPLOYED, {
    drift: true,
    findings: 2,
    match: /MIGRATION MISSING FROM PRODUCTION/,
  });

  check("the recorded table format is read the same way", RECORDED_TABLE_BOTH_WAYS, ALL_THREE_DEPLOYED, {
    drift: true,
    findings: 2,
    match: /MIGRATION EXTRA IN PRODUCTION .*20261003090000/,
  });

  check(
    "a function deployed with no folder is drift",
    RECORDED_JSON_IDENTICAL,
    deployed([...REPO_FUNCTION_FOLDERS, "left-over"]),
    { drift: true, findings: 1, match: /FUNCTION EXTRA IN PRODUCTION .*left-over/ }
  );

  check(
    "a deployed function whose status is not ACTIVE is drift",
    RECORDED_JSON_IDENTICAL,
    deployed(REPO_FUNCTION_FOLDERS, "REMOVED"),
    { drift: true, findings: 3, match: /FUNCTION NOT ACTIVE IN PRODUCTION .*REMOVED/ }
  );

  // --- refusals: "could not check" is not a pass -------------------------
  check("the CLI's own error is a refusal, and its message is not repeated", RECORDED_CLI_ERROR, ALL_THREE_DEPLOYED, {
    throws: /code LegacyDbConnectError/,
    notMatch: /127\.0\.0\.1|user=postgres/,
  });

  check("unreadable migration output is a refusal", "something else entirely\n", ALL_THREE_DEPLOYED, {
    throws: /neither the JSON shape nor the table shape/,
  });

  check("unreadable function output is a refusal", RECORDED_JSON_IDENTICAL, "nothing here\n", {
    throws: /no JSON object with a "functions" array/,
  });

  check("no migration files is a refusal, not a pass", RECORDED_JSON_IDENTICAL, ALL_THREE_DEPLOYED, {
    throws: /holds no migration files/,
  }, []);

  check("no function folders is a refusal, not a pass", RECORDED_JSON_IDENTICAL, ALL_THREE_DEPLOYED, {
    throws: /holds no function folders/,
  }, REPO_MIGRATION_FILES, []);

  check(
    "a migration file the repository has and the CLI did not list is a refusal",
    RECORDED_JSON_IDENTICAL,
    ALL_THREE_DEPLOYED,
    { throws: /does not match this script's/ },
    [...REPO_MIGRATION_FILES, "20261004120000_added_after_the_list_was_taken.sql"]
  );

  check(
    "a badly named migration file is a refusal",
    RECORDED_JSON_IDENTICAL,
    ALL_THREE_DEPLOYED,
    { throws: /is not named <14 digits>_<name>\.sql/ },
    [...REPO_MIGRATION_FILES, "fix_it.sql"]
  );

  // A shared-code folder must not be mistaken for an undeployed function.
  check(
    "a _shared folder is not treated as a function",
    RECORDED_JSON_IDENTICAL,
    ALL_THREE_DEPLOYED,
    { drift: false, findings: 0 },
    REPO_MIGRATION_FILES,
    [...REPO_FUNCTION_FOLDERS, "_shared"]
  );

  // --- a CLI that failed is a refusal, and its message stays out of the log --
  // These four go through assertCliSucceeded rather than the comparison, so
  // they carry their own exit codes.
  cases.push({
    name: "a non-zero CLI exit is a refusal, naming only the error code",
    cliExit: { migration: 1 },
    migrationText: RECORDED_CLI_ERROR,
    functionText: ALL_THREE_DEPLOYED,
    files: REPO_MIGRATION_FILES,
    folders: REPO_FUNCTION_FOLDERS,
    expect: {
      throws: /`supabase migration list` exited 1, error code LegacyDbConnectError/,
      notMatch: /127\.0\.0\.1|user=postgres|tls error/,
    },
  });
  cases.push({
    name: "a non-zero CLI exit with no error code still refuses",
    cliExit: { migration: 137 },
    migrationText: "Killed\n",
    functionText: ALL_THREE_DEPLOYED,
    files: REPO_MIGRATION_FILES,
    folders: REPO_FUNCTION_FOLDERS,
    expect: { throws: /exited 137, with no plain error code/ },
  });
  cases.push({
    name: "a failing functions list is a refusal too",
    cliExit: { function: 1 },
    migrationText: RECORDED_JSON_IDENTICAL,
    functionText: '{"_tag":"Error","error":{"code":"LegacyFunctionsListUnexpectedStatusError","message":"unexpected list functions status 401"}}\n',
    files: REPO_MIGRATION_FILES,
    folders: REPO_FUNCTION_FOLDERS,
    expect: { throws: /`supabase functions list` exited 1, error code LegacyFunctionsListUnexpectedStatusError/ },
  });
  cases.push({
    name: "both CLI commands exiting 0 is what lets the comparison run",
    cliExit: { migration: 0, function: 0 },
    migrationText: RECORDED_JSON_IDENTICAL,
    functionText: ALL_THREE_DEPLOYED,
    files: REPO_MIGRATION_FILES,
    folders: REPO_FUNCTION_FOLDERS,
    expect: { drift: false, findings: 0 },
  });

  let failed = 0;
  for (const c of cases) {
    let got = null;
    let error = null;
    try {
      assertCliSucceeded(c.migrationText, c.cliExit?.migration ?? 0, "supabase migration list");
      assertCliSucceeded(c.functionText, c.cliExit?.function ?? 0, "supabase functions list");
      const { rows } = parseMigrationList(c.migrationText);
      const { functions } = parseFunctionList(c.functionText);
      got = compareDrift({
        migrationRows: rows,
        repoMigrations: parseMigrationFilenames(c.files),
        deployedFunctions: functions,
        repoFunctions: parseFunctionFolders(c.folders),
      });
    } catch (err) {
      error = err;
    }

    let ok = true;
    let why = "";
    if (c.expect.throws) {
      if (!error) {
        ok = false;
        why = "expected a refusal, got a result";
      } else if (!c.expect.throws.test(error.message)) {
        ok = false;
        why = `refusal message did not match: ${error.message}`;
      } else if (c.expect.notMatch && c.expect.notMatch.test(error.message)) {
        ok = false;
        why = "the refusal message leaked something it should not have";
      }
    } else if (error) {
      ok = false;
      why = `unexpected refusal: ${error.message}`;
    } else {
      if (got.drift !== c.expect.drift) {
        ok = false;
        why = `drift was ${got.drift}, expected ${c.expect.drift}`;
      } else if (got.findings.length !== c.expect.findings) {
        ok = false;
        why = `${got.findings.length} finding(s), expected ${c.expect.findings}: ${got.findings.join(" | ")}`;
      } else if (c.expect.match && !c.expect.match.test(got.findings.join("\n"))) {
        ok = false;
        why = `no finding matched: ${got.findings.join(" | ")}`;
      }
      // Every finding must survive being rendered, and the rendered report must
      // carry the four things an issue has to say (AGENTS.md rule 16).
      if (ok && got.drift) {
        const body = renderReport(got);
        for (const heading of ["## What differs", "## Where it was found", "## Why it matters", "## How we will know it is fixed"]) {
          if (!body.includes(heading)) {
            ok = false;
            why = `the rendered report is missing "${heading}"`;
          }
        }
      }
    }

    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}${ok ? "" : ` -- ${why}`}`);
  }

  console.log(`Self-test: ${cases.length - failed}/${cases.length} cases passed.`);
  return failed ? 1 : 0;
}

const code = process.argv.includes("--selftest") ? selftest() : run();
process.exit(code);
