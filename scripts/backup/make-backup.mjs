#!/usr/bin/env node
// scripts/backup/make-backup.mjs
//
// Makes ONE encrypted copy of production -- the whole database and every file
// in the attachments bucket -- and writes it to Cloudflare R2.
// `.github/workflows/backup-production.yml` runs this nightly; nothing else
// does, and nothing in it is specific to a schedule, which is what lets
// scripts/backup/proof.mjs run the same code end to end against a throwaway
// database and two stand-in stores.
//
// IT READS ALL OF PRODUCTION'S DATA. There is no narrower version of a backup.
// docs/backups.md -> "What the job may read, and what stops it keeping or
// printing any of it" is the list of controls; the ones that live in this file
// rather than in the workflow are:
//
//   * NOTHING IS EVER PRINTED BUT NAMES, COUNTS, SIZES AND STATUSES. No row, no
//     table's row count, no file name, no path, no key, no part of a secret, no
//     response body, no command line, and no stack. Run logs on this repository
//     are public. Per-table row counts go in the manifest INSIDE the encrypted
//     copy, which is the only place they belong.
//   * The plaintext exists only under a temporary directory, never in the
//     checkout, so no later step can commit it -- and that directory is removed
//     when this script ends as well as when the runner is destroyed.
//   * Only the encrypted file is uploaded, and the encryption happens here,
//     before any byte leaves the machine.
//   * Secrets arrive in the environment and are never arguments to anything:
//     the passphrase is passed in memory, and the database password reaches
//     pg_dump through libpq's own PG* variables (see pgEnvFromUrl in lib.mjs).
//   * THE COPY IS CHECKED BEFORE IT IS UPLOADED, not after. If the accounts are
//     missing, a file is missing or a checksum does not match, nothing is
//     uploaded at all -- because an incomplete copy that uploaded successfully
//     is the failure this whole build exists to prevent (#248).
//
// Settings, all from the environment, by the names the GitHub environment uses
// so that the workflow is a plain one-to-one mapping:
//
//   PRODUCTION_SUPABASE_DB_URL               secret    the database, read with pg_dump
//   PRODUCTION_SUPABASE_S3_ACCESS_KEY_ID     secret    reads the bucket
//   PRODUCTION_SUPABASE_S3_SECRET_ACCESS_KEY secret    its other half
//   PRODUCTION_SUPABASE_S3_REGION            variable  the project's region, for signing
//   BACKUP_STORAGE_ENDPOINT                  variable  https://<account id>.r2.cloudflarestorage.com
//   BACKUP_STORAGE_KEY                       secret    writes to R2
//   BACKUP_STORAGE_SECRET                    secret    its other half
//   BACKUP_PASSPHRASE                        secret    encrypts the copy. CANNOT BE RE-ISSUED
//   PRODUCTION_SUPABASE_PROJECT_REF          secret    only to build the Storage endpoint
//
// Optional, with defaults, none of them a credential:
//   PRODUCTION_SUPABASE_S3_ENDPOINT   default https://<ref>.storage.supabase.co/storage/v1/s3
//   BACKUP_SOURCE_BUCKET              default attachments
//   BACKUP_DEST_BUCKET                default team-tasks-backups
//   BACKUP_DEST_REGION                default auto -- R2's own value
//   BACKUP_TMPDIR                     default $RUNNER_TEMP, else the OS temporary directory
//   BACKUP_PG_DUMP / BACKUP_PSQL      default pg_dump / psql
//   BACKUP_VERIFY_DOWNLOAD            default 1. "0" skips reading the object back
//
// Exit codes:  0 = a copy was made and verified   1 = nothing was uploaded, or
// the upload could not be verified. There is no third outcome and no
// continue-on-error anywhere: a backup job that goes green without a good copy
// manufactures confidence, which is worse than losing data.

import { spawnSync } from "node:child_process";
import { createReadStream, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildManifest,
  checkCopy,
  clientTooOld,
  encrypt,
  looksEncrypted,
  md5,
  objectName,
  packContainer,
  pgEnvFromUrl,
  readContainer,
  scanDumpLine,
  sha256,
  DUMP_PATH,
  MANIFEST_PATH,
  OBJECT_PREFIX,
} from "./lib.mjs";
import { Store } from "./s3.mjs";

const say = (line) => console.log(line);
const problem = (line) => console.error(`::error::${line}`);

// Thrown rather than exited, so the temporary directory is always removed:
// process.exit() skips a finally block, and this script's finally is the thing
// that takes the plaintext dump off the disk.
class Stopped extends Error {}
const stop = (line) => {
  throw new Stopped(line);
};

// A separator no identifier in this database contains, built here rather than
// typed, so it cannot be mistaken for a space in a diff. ASCII 31, "unit
// separator", which is what it is for.
const FIELD = String.fromCharCode(31);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

// A GitHub secret or variable that was deleted, renamed or never created
// expands to an EMPTY STRING rather than raising an error -- the reason
// migrate-production.yml gives a whole step and a long comment to each of its
// own. The workflow checks each one by name before this script runs; this is
// the second lock on the same door, and the one that also covers somebody
// running the script by hand. Whitespace counts as empty, matching every other
// settings check in this repository.
const setting = (name) => {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
};

const REQUIRED = [
  "PRODUCTION_SUPABASE_DB_URL",
  "PRODUCTION_SUPABASE_S3_ACCESS_KEY_ID",
  "PRODUCTION_SUPABASE_S3_SECRET_ACCESS_KEY",
  "PRODUCTION_SUPABASE_S3_REGION",
  "BACKUP_STORAGE_ENDPOINT",
  "BACKUP_STORAGE_KEY",
  "BACKUP_STORAGE_SECRET",
  "BACKUP_PASSPHRASE",
];

const workRoot = setting("BACKUP_TMPDIR") || setting("RUNNER_TEMP") || tmpdir();
const work = join(workRoot, `team-tasks-backup-${process.pid}`);
const pgDump = setting("BACKUP_PG_DUMP") || "pg_dump";
const psql = setting("BACKUP_PSQL") || "psql";

// stdout is captured and returned; stderr is captured and NEVER printed. A
// Postgres client's error text names the host and the database user, and the
// user name on Supabase's pooler carries the project reference -- the same
// reason drift-check.yml sends the CLI's whole output to a file nobody prints.
// What a caller gets instead is the exit code, which is a number.
function runPg(pgEnv, command, args) {
  const result = spawnSync(command, args, {
    env: { ...process.env, ...pgEnv, PGCONNECT_TIMEOUT: "30" },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) return { status: null, stdout: "" };
  return { status: result.status, stdout: result.stdout || "" };
}

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

async function main() {
  const startedAt = Date.now();

  const missing = REQUIRED.filter((name) => !setting(name));
  if (missing.length) {
    stop(
      `These settings are missing or empty, so NOTHING was read and nothing was uploaded: ${missing.join(", ")}. ` +
        "Set them at Settings -> Environments -> supabase-production; docs/environments.md lists every one and says which are secrets and which are variables. No value is ever printed by this script.",
    );
  }

  const sourceEndpoint =
    setting("PRODUCTION_SUPABASE_S3_ENDPOINT") ||
    (setting("PRODUCTION_SUPABASE_PROJECT_REF")
      ? // "https://project_ref.storage.supabase.co/storage/v1/s3"
        // -- https://supabase.com/docs/guides/storage/s3/authentication, read 2026-10-10
        `https://${setting("PRODUCTION_SUPABASE_PROJECT_REF")}.storage.supabase.co/storage/v1/s3`
      : undefined);
  if (!sourceEndpoint) {
    stop(
      "Neither PRODUCTION_SUPABASE_S3_ENDPOINT nor PRODUCTION_SUPABASE_PROJECT_REF is set, so the Storage endpoint could not be built and nothing was read. " +
        "One of the two is needed. Neither value is printed.",
    );
  }

  const passphrase = setting("BACKUP_PASSPHRASE");
  const sourceBucket = setting("BACKUP_SOURCE_BUCKET") || "attachments";
  const destBucket = setting("BACKUP_DEST_BUCKET") || "team-tasks-backups";
  const verifyDownload = (setting("BACKUP_VERIFY_DOWNLOAD") || "1") !== "0";

  let pgEnv;
  try {
    pgEnv = pgEnvFromUrl(setting("PRODUCTION_SUPABASE_DB_URL"));
  } catch (error) {
    stop(`PRODUCTION_SUPABASE_DB_URL could not be read as a connection string (${error.message}). Its value is never printed.`);
  }

  mkdirSync(work, { recursive: true });
  say("Working under a temporary directory outside the checkout. Nothing unencrypted is written anywhere else.");

  // --- 1. the database, FIRST ------------------------------------------------
  //
  // WHICH HALF IS TAKEN FIRST IS A DECISION, and the manifest records it
  // because docs/architecture.md asks it to: "a copy can easily hold rows
  // without files or files without rows ... say in the file which it took
  // first." The database goes first, so the bucket is listed afterwards. The
  // window between them is seconds, and what happens in it differs by
  // direction:
  //   * a file ATTACHED in the window is in the bucket copy and not in the
  //     dump -- bytes with no row, which nothing shows and nobody loses;
  //   * a file DELETED in the window is in the dump and not in the bucket --
  //     a row with no file, which is the bad one, and is why the two counts
  //     are reconciled below and any difference reported.
  // Either way both numbers are in the copy, so a restore knows what it has.
  const version = runPg(pgEnv, psql, ["--no-psqlrc", "--tuples-only", "--no-align", "--command", "show server_version"]);
  if (version.status !== 0) {
    stop(`Could not ask the database its version (${psql} exited ${version.status}), so NOTHING was copied. No connection detail is printed.`);
  }
  const serverVersion = version.stdout.trim();
  say(`The database reports server version ${serverVersion}.`);

  const dumpVersion = spawnSync(pgDump, ["--version"], { encoding: "utf8" });
  if (dumpVersion.status !== 0) {
    stop(`${pgDump} is not available on this machine, so NOTHING was copied. docs/backups.md names it as a tool the job needs, and scripts/backup/install-pg17.sh is what puts it there.`);
  }
  const clientVersion = (dumpVersion.stdout || "").trim();
  say(`${pgDump} reports "${clientVersion}".`);
  // Production is PostgreSQL 17.6 and the runner's own client is 16.15, so
  // this is the check that would have stopped the first real run. The
  // judgement is in lib.mjs, pure, so proof.mjs can feed it exactly that pair
  // and require a refusal.
  const tooOld = clientTooOld({ serverVersion, clientVersion });
  if (tooOld.refuse) stop(tooOld.note);
  if (tooOld.note) say(`NOTE: ${tooOld.note}`);
  else say(`The client is major version ${tooOld.clientMajor} and the server is ${tooOld.serverMajor}, so pg_dump will not refuse the server for being newer than itself.`);

  const dumpFile = join(work, "dump.sql");
  // NO -n, NO -N, NO --schema-only and NO --data-only, deliberately: every
  // schema and all of its data. That is what makes the accounts and the file
  // metadata part of the copy, and it is the one thing `supabase db dump`
  // would have got wrong (see SCHEMAS_A_COPY_MUST_COVER in lib.mjs).
  // --quote-all-identifiers so the output does not change shape with a
  // keyword, and NOT --verbose, which names every table on stderr.
  const dump = runPg(pgEnv, pgDump, ["--format=plain", "--encoding=UTF8", "--quote-all-identifiers", `--file=${dumpFile}`]);
  if (dump.status !== 0) {
    stop(
      `pg_dump exited ${dump.status}, so NOTHING was uploaded. Its output is deliberately not printed: a Postgres error names the host and the database user. ` +
        "Run the same command by hand, from a machine that holds the credential, to see why.",
    );
  }
  const dumpBytes = statSync(dumpFile).size;
  if (dumpBytes === 0) stop("pg_dump produced an empty file, so NOTHING was uploaded.");

  // Which schemas the dump really covers, read off the dump itself rather than
  // asserted. This is what makes "the accounts are in the copy" a check.
  const schemasCovered = new Set();
  await new Promise((resolve, reject) => {
    const reader = createInterface({ input: createReadStream(dumpFile, { encoding: "utf8" }), crlfDelay: Infinity });
    reader.on("line", (line) => scanDumpLine(line, schemasCovered));
    reader.on("close", resolve);
    reader.on("error", reject);
  });
  say(`The dump is ${dumpBytes} bytes and covers ${schemasCovered.size} schema(s).`);

  // Row counts per table, for the manifest. EXACT rather than the planner's
  // estimate, because a restore is compared against them. query_to_xml is the
  // one way to run count(*) per table in a single statement; it is read-only,
  // like everything else here.
  const countsQuery = `
    select table_schema || '${FIELD}' || table_name || '${FIELD}' ||
           (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', table_schema, table_name), false, true, '')))[1]::text
    from information_schema.tables
    where table_type = 'BASE TABLE'
      and table_schema not in ('pg_catalog', 'information_schema')
    order by table_schema, table_name`;
  const counts = runPg(pgEnv, psql, ["--no-psqlrc", "--tuples-only", "--no-align", "--command", countsQuery]);
  if (counts.status !== 0) {
    stop(
      `Could not count the rows in each table (${psql} exited ${counts.status}), so NOTHING was uploaded. ` +
        "A copy whose counts cannot be checked on restore is not a copy worth having.",
    );
  }
  const tables = counts.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes(FIELD))
    .map((line) => {
      const [schema, name, rows] = line.split(FIELD);
      return { schema, name, rows: Number(rows) };
    });
  if (tables.length === 0) {
    stop("The database reported no tables at all, so NOTHING was uploaded. That is a failure, not an empty database (AGENTS.md rule 8).");
  }
  // COUNTS, NOT ROW COUNTS: how many tables, and nothing about any of them.
  // The per-table numbers go in the manifest inside the ciphertext, because
  // docs/backups.md's control table says the log carries no row counts of real
  // tables.
  say(`Counted the rows in ${tables.length} table(s). The numbers are in the manifest inside the copy and are not printed here.`);

  // --- 2. the files, SECOND -------------------------------------------------
  const source = new Store({
    endpoint: sourceEndpoint,
    region: setting("PRODUCTION_SUPABASE_S3_REGION"),
    bucket: sourceBucket,
    accessKeyId: setting("PRODUCTION_SUPABASE_S3_ACCESS_KEY_ID"),
    secretAccessKey: setting("PRODUCTION_SUPABASE_S3_SECRET_ACCESS_KEY"),
    label: "the attachments bucket",
  });

  const listed = await source.list();
  say(`The ${sourceBucket} bucket holds ${listed.length} object(s). No path is printed.`);

  const files = [];
  const objectEntries = [];
  let fileBytes = 0;
  for (const object of listed) {
    const bytes = await source.get(object.key);
    if (bytes.length !== object.bytes) {
      stop(
        `An object came back a different size from the one the bucket listed, so NOTHING was uploaded. ` +
          `Listed ${object.bytes} bytes, read ${bytes.length}. Its path is not printed.`,
      );
    }
    files.push({ path: object.key, bytes: bytes.length, sha256: sha256(bytes) });
    objectEntries.push({ path: OBJECT_PREFIX + object.key, data: bytes });
    fileBytes += bytes.length;
  }
  say(`Read ${files.length} file(s), ${fileBytes} bytes in total.`);

  // The reconciliation the order above makes necessary. Numbers only.
  const storageRows = tables.find((t) => t.schema === "storage" && t.name === "objects");
  if (storageRows && storageRows.rows !== files.length) {
    say(
      `NOTE: the dump holds ${storageRows.rows} row(s) in storage.objects and ${files.length} file(s) were copied. ` +
        "A difference is expected if somebody attached or deleted a file while this ran; both numbers are in the manifest.",
    );
  }

  // --- 3. pack, check, encrypt ----------------------------------------------
  const createdAt = new Date();
  const dumpContents = readFileSync(dumpFile);
  const manifest = buildManifest({
    createdAt: createdAt.toISOString(),
    takenFirst: "database",
    database: {
      bytes: dumpBytes,
      sha256: sha256(dumpContents),
      serverVersion,
      schemasCovered: [...schemasCovered].sort(),
      tables,
    },
    storage: { bucket: sourceBucket, files },
  });
  manifest.storage.rowsInStorageObjects = storageRows ? storageRows.rows : null;

  const container = packContainer([
    { path: MANIFEST_PATH, data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") },
    { path: DUMP_PATH, data: dumpContents },
    ...objectEntries,
  ]);

  // THE GATE. Everything above is undone by one bad copy uploaded
  // confidently, so the copy is read back out of its own container -- not out
  // of the variables that built it -- and checked before anything is sent.
  const packed = readContainer(container);
  const problems = checkCopy({
    manifest: JSON.parse(packed.read(MANIFEST_PATH).toString("utf8")),
    entries: packed.entries,
    dumpSchemas: [...schemasCovered],
  });
  if (problems.length) {
    for (const line of problems) problem(line);
    stop(`The copy is not complete, so NOTHING was uploaded: ${problems.length} problem(s) above. docs/restore-runbook.md says what each one means.`);
  }
  say(`The copy checks out: ${packed.entries.length} entries, and the accounts and the file metadata are both in the dump.`);

  const ciphertext = encrypt(container, passphrase);
  if (!looksEncrypted(ciphertext)) {
    stop("The copy did not encrypt, so NOTHING was uploaded. This is the one failure that must never be survivable: the file was about to leave this machine readable.");
  }
  const ciphertextSha256 = sha256(ciphertext);
  const ciphertextMd5 = md5(ciphertext);
  say(`Encrypted: ${container.length} bytes in, ${ciphertext.length} bytes out. SHA-256 ${ciphertextSha256}.`);

  // --- 4. upload, then prove it arrived -------------------------------------
  const destination = new Store({
    endpoint: setting("BACKUP_STORAGE_ENDPOINT"),
    // "When using the S3 API, the region for an R2 bucket is `auto`."
    // -- https://developers.cloudflare.com/r2/api/s3/api/, read 2026-10-10
    region: setting("BACKUP_DEST_REGION") || "auto",
    bucket: destBucket,
    accessKeyId: setting("BACKUP_STORAGE_KEY"),
    secretAccessKey: setting("BACKUP_STORAGE_SECRET"),
    label: "the backup bucket",
  });

  const key = objectName(createdAt);
  await destination.put(key, ciphertext);
  say(`Uploaded to ${destBucket} as ${key}.`);

  // A PUT that answered 200 is not an object that is there. This job's whole
  // product is one file in somebody else's bucket, so it is read back.
  const head = await destination.head(key);
  if (head.bytes !== ciphertext.length) {
    stop(`The uploaded object is ${head.bytes} bytes and the copy is ${ciphertext.length}. The object is NOT a good copy.`);
  }
  // For a single PUT, S3-compatible services return the MD5 of the body as the
  // ETag. If this service ever stops doing that, the check says so rather than
  // passing quietly.
  if (head.etag && head.etag.toLowerCase() === ciphertextMd5) {
    say(`Verified by HEAD: ${head.bytes} bytes, and the ETag matches the copy's MD5.`);
  } else {
    say(`Verified by HEAD: ${head.bytes} bytes. The ETag is not the body's MD5, so it proves nothing here; the download check is what settles it.`);
    if (!verifyDownload) {
      stop("The ETag did not match and BACKUP_VERIFY_DOWNLOAD is off, so nothing checked the bytes that were stored. That is unverified, not a pass (AGENTS.md rule 8).");
    }
  }

  if (verifyDownload) {
    const readBack = await destination.get(key);
    if (sha256(readBack) !== ciphertextSha256) {
      stop("The object read back out of the bucket is NOT the copy that was uploaded: its SHA-256 differs.");
    }
    if (!looksEncrypted(readBack)) {
      stop("The object read back out of the bucket is not encrypted. Treat every copy in that bucket as suspect and tell the owner.");
    }
    say(`Read the object back: ${readBack.length} bytes, SHA-256 matches, and it is encrypted.`);
  }

  // THE JOB DELETES NOTHING, EVER. Retention is the bucket's own lifecycle
  // rule -- docs/plan.md's decision of 2026-10-10 -- so there is no code here
  // that could remove a copy, and the token it holds is not supposed to be able
  // to either.
  say("Nothing was deleted. Retention is the bucket's 14-day lifecycle rule, not this job's business.");
  say(`Done in ${Math.round((Date.now() - startedAt) / 1000)}s: 1 copy, ${tables.length} table(s), ${files.length} file(s), ${ciphertext.length} bytes stored.`);
}

let code = 0;
try {
  await main();
} catch (error) {
  // The message of an error from this script and from s3.mjs carries a status,
  // an operation and a count -- never a body, a path or a value. Nothing else
  // is printed: no stack, because a stack can quote what the code was holding.
  problem(
    error instanceof Stopped
      ? error.message
      : `The copy was not completed: ${error && error.message ? error.message : "an error with no message"}. Nothing partial is in the bucket, because the upload is the last step.`,
  );
  code = 1;
} finally {
  // The plaintext dump dies with this script as well as with the runner.
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    /* the runner is destroyed either way */
  }
}
// process.exitCode rather than process.exit(): exit() stops the process where
// it stands, and on Windows a run that had just written several ::error::
// lines was seen to die with a crash status (0xC0000409) instead of 1, because
// the pipe had not drained. Setting the code and letting Node finish means the
// last thing the log says is the thing that explains the failure.
process.exitCode = code;
