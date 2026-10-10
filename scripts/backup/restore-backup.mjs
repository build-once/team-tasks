#!/usr/bin/env node
// scripts/backup/restore-backup.mjs
//
// Opens a copy made by scripts/backup/make-backup.mjs and puts it back.
// docs/restore-runbook.md is the procedure a person follows; this is the tool
// that procedure uses, and the same tool scripts/backup/proof.mjs drives in CI
// against a throwaway database and a stand-in store.
//
// THE DRILL IS THE OWNER'S, START TO FINISH. docs/backups.md: "The coach and
// the coding assistant never receive a backup file, any part of one, a
// decrypted dump, or a row out of a restored project." Nothing in this file
// sends anything anywhere; it reads one object, decrypts it in memory, and
// writes to the database and bucket it is told to.
//
// NEVER INTO PRODUCTION, AND NEVER INTO STAGING. Rules 1 and 10 forbid the
// first. The second is the one that needs saying: staging is the one project
// the coding assistant holds keys for, and docs/environments.md's own rule is
// "Production data is never copied to local or staging". A restore goes into a
// NEW temporary project, created for the drill and deleted the same day.
// Nothing in this script can enforce that -- it does what its settings say --
// so the settings are the thing to read twice.
//
// Usage:
//   node scripts/backup/restore-backup.mjs --latest --check-only
//   node scripts/backup/restore-backup.mjs --key <object key>
//   node scripts/backup/restore-backup.mjs --file <a copy already downloaded>
//
//   --latest       list the backup bucket and take the newest object
//   --key <k>      take exactly that object
//   --file <path>  skip the download; open a file already on this machine
//   --check-only   decrypt, unpack and check, and restore NOTHING
//   --show-tables  print the row count of every table, not only the mismatches
//
// Settings. The first is always needed; the download group is needed unless
// --file is given; the restore group is needed unless --check-only is.
//
//   BACKUP_PASSPHRASE                 the passphrase. From the PASSWORD MANAGER,
//                                     because that is the copy a person can
//                                     actually reach at 2 a.m. -- a GitHub
//                                     secret cannot be read back
//   BACKUP_STORAGE_ENDPOINT           }
//   BACKUP_STORAGE_KEY                } the backup bucket
//   BACKUP_STORAGE_SECRET             }
//   BACKUP_DEST_BUCKET                default team-tasks-backups
//   BACKUP_DEST_REGION                default auto
//
//   RESTORE_DB_URL                    the NEW temporary project's database
//   RESTORE_S3_ENDPOINT               }
//   RESTORE_S3_REGION                 } its Storage, as an S3 endpoint
//   RESTORE_S3_ACCESS_KEY_ID          }
//   RESTORE_S3_SECRET_ACCESS_KEY      }
//   RESTORE_BUCKET                    default attachments
//
// Exit codes:  0 = PASS   1 = FAIL. A FAIL means the copy is not a copy you
// can rely on, or the restore did not come back equal to it. There is no
// "mostly".

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkCopy, decrypt, looksEncrypted, pgEnvFromUrl, readContainer, scanDumpLine, sha256, DUMP_PATH, MANIFEST_PATH, OBJECT_PREFIX } from "./lib.mjs";
import { Store } from "./s3.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

const say = (line) => console.log(line);
const setting = (name) => {
  const v = process.env[name];
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
};

const checkOnly = flag("--check-only");
const showTables = flag("--show-tables");
const work = join(setting("BACKUP_TMPDIR") || setting("RUNNER_TEMP") || tmpdir(), `team-tasks-restore-${process.pid}`);

const failures = [];
const pass = (line) => say(`PASS  ${line}`);
const fail = (line) => {
  failures.push(line);
  console.error(`FAIL  ${line}`);
};

function backupStore() {
  return new Store({
    endpoint: setting("BACKUP_STORAGE_ENDPOINT"),
    region: setting("BACKUP_DEST_REGION") || "auto",
    bucket: setting("BACKUP_DEST_BUCKET") || "team-tasks-backups",
    accessKeyId: setting("BACKUP_STORAGE_KEY"),
    secretAccessKey: setting("BACKUP_STORAGE_SECRET"),
    label: "the backup bucket",
  });
}

async function main() {
  const startedAt = Date.now();
  if (!setting("BACKUP_PASSPHRASE")) {
    fail("BACKUP_PASSPHRASE is not set, so nothing could be opened. It is the only readable copy's value, from the password manager. It is never printed.");
    return;
  }
  mkdirSync(work, { recursive: true });

  // --- 1. get the copy -------------------------------------------------------
  let ciphertext;
  let name;
  if (value("--file")) {
    name = value("--file");
    ciphertext = readFileSync(name);
    say(`Opened a copy already on this machine: ${ciphertext.length} bytes.`);
  } else {
    const store = backupStore();
    if (flag("--latest")) {
      const objects = await store.list();
      if (objects.length === 0) {
        fail("The backup bucket is empty, so there was nothing to restore. That is the state this whole build exists to get out of.");
        return;
      }
      // The names carry the UTC date and time they were taken, so the newest
      // is the last one in sorted order. objectName() in lib.mjs is what makes
      // that true.
      name = objects.map((o) => o.key).sort().at(-1);
      say(`The bucket holds ${objects.length} copy(ies); taking the newest, ${name}.`);
    } else {
      name = value("--key");
      if (!name) {
        fail("Give one of --latest, --key <object key> or --file <path>.");
        return;
      }
    }
    ciphertext = await store.get(name);
    say(`Downloaded ${name}: ${ciphertext.length} bytes.`);
  }

  // --- 2. it must be encrypted ---------------------------------------------
  if (looksEncrypted(ciphertext)) {
    pass("the copy is encrypted: it begins with OpenSSL's Salted__ header and holds no readable container.");
  } else {
    fail("THE COPY IS NOT ENCRYPTED. Whatever is in that bucket is not what this job is supposed to put there. Tell the owner before doing anything else.");
    return;
  }

  // --- 3. decrypt ------------------------------------------------------------
  let container;
  try {
    container = decrypt(ciphertext, setting("BACKUP_PASSPHRASE"));
    pass(`the copy decrypted: ${container.length} bytes.`);
  } catch (error) {
    fail(`the copy did not decrypt (${error.message}). If the passphrase came from the password manager and is right, the file is damaged -- try an older copy.`);
    return;
  }

  // --- 4. unpack and check -------------------------------------------------
  const packed = readContainer(container);
  const manifest = JSON.parse(packed.read(MANIFEST_PATH).toString("utf8"));
  const dump = packed.read(DUMP_PATH);
  const dumpSchemas = new Set();
  for (const line of dump.toString("utf8").split("\n")) scanDumpLine(line, dumpSchemas);

  const problems = checkCopy({ manifest, entries: packed.entries, dumpSchemas: [...dumpSchemas] });
  if (problems.length === 0) {
    pass(
      `the copy is complete: taken ${manifest.createdAt}, ${manifest.database.tables.length} table(s), ` +
        `${manifest.storage.objects} file(s), the ${manifest.takenFirst} half taken first.`,
    );
  } else {
    for (const line of problems) fail(line);
  }
  say(`What it says it holds: ${manifest.database.rowsTotal} row(s) across ${manifest.database.tables.length} table(s), and ${manifest.storage.bytes} byte(s) of files.`);
  say(`What has to be re-created by hand, from the copy's own manifest:`);
  for (const line of manifest.database.leftOutDeliberately) say(`  - ${line}`);

  if (checkOnly) {
    say("--check-only: nothing was restored.");
    return;
  }

  // --- 5. the database into the new project --------------------------------
  if (!setting("RESTORE_DB_URL")) {
    fail("RESTORE_DB_URL is not set, so the database was not restored. It must be the NEW temporary project -- never production, never staging.");
    return;
  }
  const pgEnv = pgEnvFromUrl(setting("RESTORE_DB_URL"));
  const psql = setting("BACKUP_PSQL") || "psql";
  const dumpFile = join(work, "dump.sql");
  writeFileSync(dumpFile, dump);

  // ON_ERROR_STOP is deliberately OFF. A dump of a Supabase database replayed
  // into a new Supabase project tries to create things the new project already
  // has, and each of those is an error that does not matter. What matters is
  // whether the rows and the files came back, which is the comparison below --
  // so the errors are counted, reported as a number, and the OUTPUT IS NOT
  // PRINTED, because psql's error text quotes the statement that failed and a
  // statement can carry a row.
  const logFile = join(work, "psql.log");
  const restore = spawnSync(psql, ["--no-psqlrc", "--quiet", "--file", dumpFile, "--output", logFile], {
    env: { ...process.env, ...pgEnv, PGCONNECT_TIMEOUT: "30" },
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  const errorLines = `${restore.stderr || ""}`.split("\n").filter((l) => /^(psql:.*)?ERROR/i.test(l.trim())).length;
  writeFileSync(join(work, "psql-stderr.log"), restore.stderr || "");
  say(
    `psql exited ${restore.status} with ${errorLines} ERROR line(s). Its output is deliberately not printed; it is kept in the temporary directory ONLY if this run fails, ` +
      "and the path is named at the end if so.",
  );

  // --- 6. the files into the new project's bucket ---------------------------
  const target = new Store({
    endpoint: setting("RESTORE_S3_ENDPOINT"),
    region: setting("RESTORE_S3_REGION"),
    bucket: setting("RESTORE_BUCKET") || "attachments",
    accessKeyId: setting("RESTORE_S3_ACCESS_KEY_ID"),
    secretAccessKey: setting("RESTORE_S3_SECRET_ACCESS_KEY"),
    label: "the restored bucket",
  });
  for (const file of manifest.storage.files) {
    await target.put(file.path, packed.read(OBJECT_PREFIX + file.path));
  }
  say(`Put ${manifest.storage.files.length} file(s) back.`);

  // --- 7. compare, which is the only part that proves anything -------------
  const FIELD = String.fromCharCode(31);
  const countsQuery = `
    select table_schema || '${FIELD}' || table_name || '${FIELD}' ||
           (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', table_schema, table_name), false, true, '')))[1]::text
    from information_schema.tables
    where table_type = 'BASE TABLE'
      and table_schema not in ('pg_catalog', 'information_schema')`;
  const counted = spawnSync(psql, ["--no-psqlrc", "--tuples-only", "--no-align", "--command", countsQuery], {
    env: { ...process.env, ...pgEnv, PGCONNECT_TIMEOUT: "30" },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (counted.status !== 0) {
    fail(`could not count the rows in the restored database (psql exited ${counted.status}), so the restore is UNVERIFIED rather than good.`);
  } else {
    const after = new Map();
    for (const line of (counted.stdout || "").split("\n")) {
      if (!line.includes(FIELD)) continue;
      const [schema, table, rows] = line.trim().split(FIELD);
      after.set(`${schema}.${table}`, Number(rows));
    }
    let same = 0;
    for (const table of manifest.database.tables) {
      const key = `${table.schema}.${table.name}`;
      const got = after.get(key);
      if (got === undefined) fail(`${key} is in the copy and not in the restored database.`);
      else if (got !== Number(table.rows)) fail(`${key}: the copy says ${table.rows} row(s), the restored database has ${got}.`);
      else {
        same++;
        if (showTables) say(`      ${key}: ${got} row(s)`);
      }
    }
    if (same === manifest.database.tables.length) pass(`every one of ${same} table(s) came back with the row count the copy recorded.`);

    // The accounts are the half a dump taken the obvious way would have
    // missed, so they get their own line rather than being one of the rows
    // above.
    const users = manifest.database.tables.find((t) => t.schema === "auth" && t.name === "users");
    if (!users) fail("the copy's manifest has no auth.users at all, so there are no accounts to come back.");
    else if (after.get("auth.users") === Number(users.rows)) pass(`the accounts came back: auth.users has ${users.rows} row(s), as the copy recorded.`);
  }

  const back = await target.list();
  if (back.length !== manifest.storage.files.length) {
    fail(`the restored bucket holds ${back.length} object(s) and the copy recorded ${manifest.storage.files.length}.`);
  }
  let matched = 0;
  for (const file of manifest.storage.files) {
    const bytes = await target.get(file.path).catch(() => undefined);
    if (!bytes) fail("a file did not come back out of the restored bucket. Its path is not printed.");
    else if (sha256(bytes) !== file.sha256) fail("a file came back with different bytes from the ones the copy recorded. Its path is not printed.");
    else matched++;
  }
  if (matched === manifest.storage.files.length) {
    pass(`every one of ${matched} file(s) came back byte for byte, checked by SHA-256 against the copy's own manifest.`);
  }

  say(`Wall clock, download to compared: ${Math.round((Date.now() - startedAt) / 1000)}s. THAT NUMBER IS THE ANSWER to "how long are we down" -- write it in evidence/restore-tested.md.`);
}

let code = 0;
try {
  await main();
  if (failures.length) {
    console.error(`::error::${failures.length} check(s) FAILED. This copy is not one to rely on: read each FAIL line above.`);
    code = 1;
  } else {
    say("Every check passed.");
  }
} catch (error) {
  console.error(`::error::The restore stopped: ${error && error.message ? error.message : "an error with no message"}.`);
  code = 1;
} finally {
  // On a PASS the temporary directory goes, dump and all: it holds the
  // database in plaintext and there is no reason to leave it lying about.
  // On a FAIL it is kept, because psql's own output is the only thing that
  // says why -- and the warning says what it is, because a person who forgets
  // it has left a readable copy of production on a laptop.
  if (code === 0) {
    try {
      rmSync(work, { recursive: true, force: true });
    } catch {
      /* nothing readable is left anywhere else */
    }
  } else {
    console.error(
      `::error::The working directory is KEPT so you can read why: ${work}. IT HOLDS THE DATABASE IN PLAINTEXT. Delete it when you are done, and never put any of it in a file in this repository, an issue or a chat.`,
    );
  }
}
// See the note at the end of make-backup.mjs: the code is set and Node is left
// to finish, so nothing it printed is lost on the way out.
process.exitCode = code;
