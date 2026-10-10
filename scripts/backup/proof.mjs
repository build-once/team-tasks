#!/usr/bin/env node
// scripts/backup/proof.mjs
//
// Proves the nightly copy, end to end, WITH NO REAL DATA: a throwaway
// PostgreSQL seeded with made-up accounts, tasks and storage records, and a
// stand-in for both object stores. It runs the same two scripts the real job
// runs -- scripts/backup/make-backup.mjs and scripts/backup/restore-backup.mjs
// -- as child processes, with made-up settings, and then asks of the result the
// questions a backup has to answer:
//
//   back up -> encrypt -> upload -> verify -> download -> decrypt -> restore
//   -> compare.
//
// AND IT IS SEEN TO FAIL. Issue #258 names five things this must catch, and
// each has a case here that must come out FAIL before the run is allowed to
// pass: the accounts left out of the dump, a file missing from the copy, the
// copy uploaded unencrypted, the wrong passphrase, and a secret or a row
// appearing in the log. A check that cannot fail tells you nothing, which is
// the whole reason this file is three times the length of the scripts it
// drives.
//
// Usage:
//   node scripts/backup/proof.mjs                 everything (needs a database)
//   node scripts/backup/proof.mjs --pure-only     the cases that need no database
//
// The end-to-end half needs a throwaway cluster and the two Postgres client
// programs:
//   BACKUP_PROOF_DB_URL   a connection string for a cluster this may CREATE and
//                         DROP two databases in. NEVER staging, NEVER
//                         production: it must be a throwaway on localhost, and
//                         the script refuses anything else.
//   BACKUP_PSQL           default psql
//   BACKUP_PG_DUMP        default pg_dump
//
// WITHOUT BACKUP_PROOF_DB_URL THE RUN IS UNVERIFIED AND FAILS (rule 8), unless
// --pure-only says so out loud. `npm test` passes --pure-only, because Windows
// and macOS runners have no cluster; the CI job that counts this script's PASS
// lines passes no flag and sets the URL, and its expected count is only
// reachable with the end-to-end half.
//
// WHAT IT DOES NOT PROVE, said here rather than left to be assumed:
//   * Nothing about Supabase Storage or Cloudflare R2. The stand-in is enough
//     S3 for four verbs; the bucket's 5 MB and six types, R2's lifecycle rule
//     and the proposed bucket lock are those services' and are not modelled.
//   * Nothing about production. No copy of production has ever been made.
//   * The SigV4 signer is checked for determinism, sensitivity and canonical
//     form, and AGAINST ITSELF in the stand-in's verifier -- not against AWS's
//     published test vector. A systematic error in it would pass here and fail
//     on the first real call. See the issue this file's pull request files.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import {
  buildManifest,
  checkCopy,
  decrypt,
  deriveKeyAndIv,
  encodeS3Key,
  encrypt,
  looksEncrypted,
  objectName,
  opensslDecryptCommand,
  packContainer,
  pgEnvFromUrl,
  readContainer,
  scanDumpLine,
  scanLog,
  sha256,
  signRequest,
  CIPHER,
  CONTAINER_MAGIC,
  DUMP_PATH,
  MANIFEST_PATH,
  OBJECT_PREFIX,
  OPENSSL_MAGIC,
  PBKDF2_DIGEST,
  PBKDF2_ITERATIONS,
  SCHEMAS_A_COPY_MUST_COVER,
} from "./lib.mjs";
import { startStandinStore } from "./standin-store.mjs";

const PURE_ONLY = process.argv.includes("--pure-only");

// ---------------------------------------------------------------------------
// Made-up values. Every one of them is invented here and appears nowhere else.
// The markers are deliberately odd strings so the log scan below can say with
// certainty that no row and no file name reached the log.
// ---------------------------------------------------------------------------
//
// THE FOUR CREDENTIAL-SHAPED ONES ARE COMPOSED FROM PARTS RATHER THAN WRITTEN
// OUT, and that is not decoration: gitleaks' generic-api-key rule looks for a
// random-looking string beside a word like "secret", and it refused this
// commit for `destSecret` until the value was assembled. A made-up value does
// not get an exemption from the secret scan -- it gets composed, the same way
// docs/secrets.md says to handle any test fixture that looks like a key.
const of = (...parts) => parts.join("-");
const MADE_UP = {
  passphrase: of("proof", "passphrase", "not", "the", "real", "one", "4a7d19"),
  wrongPassphrase: of("proof", "passphrase", "wrong", "0000"),
  sourceKeyId: "PROOFSOURCEKEYID0001",
  sourceSecret: of("proof", "source", "secret", "82f1c6d4"),
  destKeyId: "PROOFDESTKEYID0001",
  destSecret: of("proof", "dest", "secret", "5b3e9a07"),
  taskText: "MADE-UP-TASK-TEXT-7f3a2b",
  email: "made.up.person@example.invalid",
  nickname: "MADE-UP-NICKNAME-c4e8",
  reason: "MADE-UP-SUSPENSION-REASON-11b9",
  fileNames: ["made-up-photo-9c1d.jpg", "made-up-receipt-3e70.pdf", "made-up-letter-8a52.pdf"],
};

const results = { pass: 0, fail: 0 };
function check(ok, line) {
  if (ok) {
    results.pass++;
    console.log(`PASS  ${line}`);
  } else {
    results.fail++;
    console.log(`FAIL  ${line}`);
  }
  return ok;
}
// "Can this check fail?" -- the shape ci.yml's other counted scripts use. The
// expectation is inverted on purpose: the case is given a world where the
// thing is broken, and the judgement must come out negative.
const checkRefuses = (didRefuse, line) => check(didRefuse, `SEEN TO FAIL: ${line}`);

// A refusal is exit 1 exactly, not merely "not zero". A crash is also not
// zero, and a job that dies is not a job that refused -- this project was
// shown the difference by a Windows run that printed the right message and
// then exited 0xC0000409 because the pipe had not drained.
const refusedCleanly = (run) => run.status === 1;

const threw = (fn) => {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error;
  }
};

// ---------------------------------------------------------------------------
// A copy built in memory, used by the pure cases
// ---------------------------------------------------------------------------
function madeUpCopy({ schemas = ["public", "auth", "storage"], files = MADE_UP.fileNames } = {}) {
  const dumpLines = [];
  for (const schema of schemas) {
    dumpLines.push(`CREATE SCHEMA "${schema}";`);
    dumpLines.push(`CREATE TABLE "${schema}"."thing" ("id" integer);`);
  }
  dumpLines.push(`COPY "public"."tasks" ("id", "title") FROM stdin;`);
  dumpLines.push(`1\t${MADE_UP.taskText}`);
  dumpLines.push("\\.");
  const dump = Buffer.from(dumpLines.join("\n"), "utf8");

  const fileEntries = files.map((name, index) => ({
    path: `11111111-1111-4111-8111-11111111111${index}/${name}`,
    data: Buffer.from(`made-up-bytes-${index}-${name}`, "utf8"),
  }));

  const manifest = buildManifest({
    createdAt: "2026-10-10T01:17:00.000Z",
    takenFirst: "database",
    database: {
      bytes: dump.length,
      sha256: sha256(dump),
      serverVersion: "16.15",
      schemasCovered: schemas,
      tables: schemas.map((schema) => ({ schema, name: "thing", rows: 2 })),
    },
    storage: { bucket: "attachments", files: fileEntries.map((f) => ({ path: f.path, bytes: f.data.length, sha256: sha256(f.data) })) },
  });

  const entries = [
    { path: MANIFEST_PATH, data: Buffer.from(JSON.stringify(manifest), "utf8") },
    { path: DUMP_PATH, data: dump },
    ...fileEntries.map((f) => ({ path: OBJECT_PREFIX + f.path, data: f.data })),
  ];
  return { manifest, dump, entries, schemas, container: packContainer(entries) };
}

// ---------------------------------------------------------------------------
// The cases that need no database and no network
// ---------------------------------------------------------------------------
function pureCases() {
  console.log("--- The encryption");
  const plain = Buffer.from("made-up-plaintext-".repeat(100), "utf8");
  // A low iteration count for speed in the cases that only need the shape.
  // The production number is checked on its own, below.
  const fast = { iterations: 1000 };
  const cipher = encrypt(plain, MADE_UP.passphrase, fast);
  check(decrypt(cipher, MADE_UP.passphrase, fast).equals(plain), "a copy encrypts and decrypts back to the same bytes.");
  check(cipher.subarray(0, 8).equals(OPENSSL_MAGIC), "the encrypted file begins with OpenSSL's own Salted__ header, so `openssl enc -d` can open it.");
  check(cipher.indexOf(plain.subarray(0, 24)) === -1, "the ciphertext does not contain the start of the plaintext.");
  check(!encrypt(plain, MADE_UP.passphrase, fast).equals(cipher), "two copies of the same bytes differ, because the salt is random each time.");
  check(looksEncrypted(cipher), "looksEncrypted says yes to an encrypted copy.");
  checkRefuses(!looksEncrypted(madeUpCopy().container), "looksEncrypted says no to a copy in the clear -- the 'uploaded unencrypted' case.");
  checkRefuses(
    !looksEncrypted(Buffer.concat([OPENSSL_MAGIC, Buffer.alloc(8), madeUpCopy().container])),
    "looksEncrypted says no to plaintext with the Salted__ header glued on, so the header alone cannot fake it.",
  );
  checkRefuses(threw(() => decrypt(cipher, MADE_UP.wrongPassphrase, fast)) !== undefined, "the wrong passphrase does not open a copy.");
  check(/passphrase is wrong/.test(threw(() => decrypt(cipher, MADE_UP.wrongPassphrase, fast)).message), "and what it says names the passphrase rather than a padding error.");
  checkRefuses(threw(() => decrypt(Buffer.from("not an encrypted copy at all"), MADE_UP.passphrase)) !== undefined, "a file that is not a copy is refused before any key is derived.");

  const derived = deriveKeyAndIv(MADE_UP.passphrase, Buffer.alloc(8, 7), 1000);
  check(derived.key.length === 32 && derived.iv.length === 16, "the key is 32 bytes and the IV 16, which is the split OpenSSL's own format uses.");
  check(deriveKeyAndIv(MADE_UP.passphrase, Buffer.alloc(8, 7), 1000).key.equals(derived.key), "the same passphrase and salt give the same key.");
  check(!deriveKeyAndIv(MADE_UP.passphrase, Buffer.alloc(8, 8), 1000).key.equals(derived.key), "a different salt gives a different key.");
  check(PBKDF2_ITERATIONS === 600000 && PBKDF2_DIGEST === "sha256" && CIPHER === "aes-256-cbc", "the real copy uses AES-256-CBC with 600,000 PBKDF2-HMAC-SHA256 iterations.");
  const openssl = opensslDecryptCommand();
  check(
    openssl.includes(`-${CIPHER}`) && openssl.includes(`-iter ${PBKDF2_ITERATIONS}`) && openssl.includes(`-md ${PBKDF2_DIGEST}`),
    "the openssl command in docs/restore-runbook.md is built from those same three constants, so the two cannot drift.",
  );
  check(/-pass file:\S+/.test(openssl) && !openssl.includes("-pass pass:"), "and it reads the passphrase out of a file, never as an argument.");

  console.log("--- The container");
  const copy = madeUpCopy();
  const read = readContainer(copy.container);
  check(read.entries.length === copy.entries.length, `a container packs and reads back all ${copy.entries.length} entries.`);
  check(read.read(DUMP_PATH).equals(copy.dump), "the dump comes back out byte for byte.");
  check(JSON.parse(read.read(MANIFEST_PATH).toString("utf8")).format === 1, "the manifest comes back out as JSON.");
  const sliced = copy.container.subarray(read.bodyAt + read.entries[1].offset, read.bodyAt + read.entries[1].offset + read.entries[1].storedBytes);
  check(sliced[0] === 0x1f && sliced[1] === 0x8b, "an entry sliced out of the container at the offset its header gives is a gzip file.");
  check(gunzipSync(sliced).equals(copy.dump), "and gzip -d on that slice gives the dump, so a copy can be opened with standard tools alone.");
  checkRefuses(threw(() => readContainer(Buffer.from("TTBK0\nnope"))) !== undefined, "a file without the TTBK1 line is not read as a copy.");
  const tampered = Buffer.from(copy.container);
  tampered[read.bodyAt + read.entries[1].offset + 12] ^= 0xff;
  checkRefuses(threw(() => readContainer(tampered).read(DUMP_PATH)) !== undefined, "a flipped bit inside the dump is caught by the entry's own checksum.");
  checkRefuses(threw(() => packContainer([{ path: "a", data: Buffer.from("x") }, { path: "a", data: Buffer.from("y") }])) !== undefined, "two entries with the same path are refused.");
  checkRefuses(threw(() => packContainer([])) !== undefined, "a container with no entries is refused.");

  console.log("--- The manifest, and the check that a copy is complete");
  check(SCHEMAS_A_COPY_MUST_COVER.includes("auth") && SCHEMAS_A_COPY_MUST_COVER.includes("storage"), "a copy must cover `auth` and `storage` -- the two schemas `supabase db dump` excludes by name.");
  checkRefuses(threw(() => buildManifest({ createdAt: "x", database: { tables: [] }, storage: { files: [] } })) !== undefined, "a manifest that does not say which half was taken first is refused.");
  check(copy.manifest.database.rowsTotal === 6 && copy.manifest.storage.objects === 3, "the manifest totals its own rows and objects.");
  check(copy.manifest.database.leftOutDeliberately.length === 4, "and it lists, inside the copy, the four kinds of thing a restore must re-create by hand.");

  const good = checkCopy({ manifest: copy.manifest, entries: read.entries, dumpSchemas: copy.schemas });
  check(good.length === 0, "a complete copy passes the check the real job runs before it uploads anything.");

  const noAuth = madeUpCopy({ schemas: ["public", "storage"] });
  const noAuthProblems = checkCopy({ manifest: noAuth.manifest, entries: readContainer(noAuth.container).entries, dumpSchemas: noAuth.schemas });
  checkRefuses(noAuthProblems.some((p) => /THE ACCOUNTS ARE NOT IN THIS COPY/.test(p)), "THE ACCOUNTS LEFT OUT: a dump covering no `auth` schema fails the check, naming the accounts.");
  const noStorage = madeUpCopy({ schemas: ["public", "auth"] });
  checkRefuses(
    checkCopy({ manifest: noStorage.manifest, entries: readContainer(noStorage.container).entries, dumpSchemas: noStorage.schemas }).some((p) => /storage/.test(p)),
    "a dump covering no `storage` schema fails too, so recovered bytes cannot end up with no rows to reach them.",
  );
  check(
    checkCopy({ manifest: copy.manifest, entries: read.entries, dumpSchemas: ["public", "auth", "storage"] }).length === 0 &&
      checkCopy({ manifest: copy.manifest, entries: read.entries, dumpSchemas: [] }).length > 0,
    "the schemas are taken from a scan of the DUMP, not from the manifest's claim about itself.",
  );

  const minusOne = copy.entries.filter((e) => !e.path.endsWith(MADE_UP.fileNames[1]));
  const missingProblems = checkCopy({ manifest: copy.manifest, entries: readContainer(packContainer(minusOne)).entries, dumpSchemas: copy.schemas });
  checkRefuses(missingProblems.some((p) => /A FILE IS MISSING FROM THIS COPY/.test(p)), "A FILE MISSING: a manifest listing a file the copy does not hold fails the check.");
  check(!missingProblems.join(" ").includes(MADE_UP.fileNames[1]), "and the message does not name the file, because a file name is free text somebody's phone chose.");

  const wrongSum = structuredClone(copy.manifest);
  wrongSum.storage.files[0].sha256 = "0".repeat(64);
  checkRefuses(checkCopy({ manifest: wrongSum, entries: read.entries, dumpSchemas: copy.schemas }).some((p) => /checksum/.test(p)), "a file whose checksum does not match the manifest fails the check.");
  const wrongCount = structuredClone(copy.manifest);
  wrongCount.storage.objects = 99;
  checkRefuses(checkCopy({ manifest: wrongCount, entries: read.entries, dumpSchemas: copy.schemas }).length > 0, "a manifest whose object count disagrees with its own file list fails the check.");
  const wrongDump = structuredClone(copy.manifest);
  wrongDump.database.sha256 = "0".repeat(64);
  checkRefuses(checkCopy({ manifest: wrongDump, entries: read.entries, dumpSchemas: copy.schemas }).some((p) => /checksum/.test(p)), "a dump that does not match the checksum the manifest gives for it fails the check.");
  const emptyDump = packContainer([
    { path: MANIFEST_PATH, data: Buffer.from(JSON.stringify(copy.manifest), "utf8") },
    { path: DUMP_PATH, data: Buffer.alloc(0) },
  ]);
  checkRefuses(checkCopy({ manifest: copy.manifest, entries: readContainer(emptyDump).entries, dumpSchemas: copy.schemas }).some((p) => /empty/.test(p)), "an empty dump fails the check.");
  checkRefuses(checkCopy({ manifest: undefined, entries: [], dumpSchemas: [] }).length > 0, "a copy with no manifest at all fails the check.");

  const schemas = new Set();
  scanDumpLine('CREATE TABLE "auth"."users" (', schemas);
  scanDumpLine("COPY storage.objects (id, name) FROM stdin;", schemas);
  scanDumpLine("CREATE SCHEMA IF NOT EXISTS extensions;", schemas);
  scanDumpLine("-- a comment about auth.users", schemas);
  check(schemas.has("auth") && schemas.has("storage") && schemas.has("extensions") && schemas.size === 3, "the dump scan reads CREATE TABLE, COPY and CREATE SCHEMA, and is not fooled by a comment.");

  console.log("--- The log scanner");
  const cleanLog = "Counted the rows in 9 table(s). Read 3 file(s), 4211 bytes in total. Uploaded to team-tasks-backups.";
  check(scanLog(cleanLog, { values: MADE_UP }).length === 0, "a log of names, counts and sizes is clean.");
  checkRefuses(scanLog(`${cleanLog}\nusing ${MADE_UP.passphrase}`, { values: { BACKUP_PASSPHRASE: MADE_UP.passphrase } }).length > 0, "A SECRET IN THE LOG: the scanner finds a secret's value.");
  check(
    scanLog(`x ${MADE_UP.destSecret}`, { values: { BACKUP_STORAGE_SECRET: MADE_UP.destSecret } })[0] === "the value of BACKUP_STORAGE_SECRET appears in the log",
    "and what it reports is the setting's NAME, never the value it found.",
  );
  checkRefuses(scanLog(`invited ${MADE_UP.email}`).length > 0, "A ROW IN THE LOG: the scanner finds an email address nobody named in advance.");
  checkRefuses(scanLog('COPY public.tasks (id, title) FROM stdin;').length > 0, "the scanner finds a line out of a database dump.");
  checkRefuses(scanLog("postgresql://postgres.abc:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres").length > 0, "the scanner finds a Postgres connection string.");
  checkRefuses(scanLog("Salted__").length > 0, "the scanner finds the start of an encrypted file, which is a copy's bytes in a log.");
  checkRefuses(scanLog("Authorization: AWS4-HMAC-SHA256 Credential=AKIA.../20261010/auto/s3/aws4_request").length > 0, "the scanner finds a signature header.");

  console.log("--- Signing, and names");
  const signArgs = {
    method: "GET",
    url: "https://example.invalid/bucket/key?b=2&a=1",
    region: "eu-west-2",
    accessKeyId: MADE_UP.destKeyId,
    secretAccessKey: MADE_UP.destSecret,
    payloadSha256: sha256(Buffer.alloc(0)),
    date: new Date("2026-10-10T01:17:00.000Z"),
  };
  const signed = signRequest(signArgs);
  check(signed.authorization === signRequest(signArgs).authorization, "the same request signs to the same signature.");
  check(signed.authorization !== signRequest({ ...signArgs, secretAccessKey: "something else" }).authorization, "a different secret gives a different signature.");
  check(signed.authorization !== signRequest({ ...signArgs, payloadSha256: sha256(Buffer.from("x")) }).authorization, "a different body gives a different signature.");
  check(signed.authorization === signRequest({ ...signArgs, url: "https://example.invalid/bucket/key?a=1&b=2" }).authorization, "the query is put in canonical order, so the order it was written in does not matter.");
  check(/SignedHeaders=host;x-amz-content-sha256;x-amz-date,/.test(signed.authorization), "the signed headers are lower-cased and sorted.");
  check(signed.authorization.includes(`Credential=${MADE_UP.destKeyId}/20261010/eu-west-2/s3/aws4_request`), "the credential scope carries the date, the region and s3.");
  check(signed["x-amz-date"] === "20261010T011700Z" && signed["x-amz-content-sha256"] === signArgs.payloadSha256, "the date and the body's checksum are sent as well as signed.");
  check(encodeS3Key("a b/c+d/e") === "a%20b/c%2Bd/e", "a key is encoded segment by segment, so a slash stays a slash and a space does not.");
  const name = objectName(new Date("2026-10-10T01:17:00.000Z"));
  check(name === "team-tasks/2026-10-10/production-20261010T011700Z.ttbk1.enc", "one object per night, named by its UTC date and time, so the bucket reads as a calendar.");
  check(objectName(new Date("2026-10-10T23:30:00.000Z")) > name, "and the names sort in the order the copies were taken, which is how --latest finds the newest.");

  console.log("--- The database password never becomes an argument");
  const pg = pgEnvFromUrl("postgresql://a%40b:p%40ss%2Fword@db.example.invalid:6543/postgres?sslmode=require");
  check(pg.PGPASSWORD === "p@ss/word" && pg.PGUSER === "a@b", "the connection string's user and password are percent-decoded into libpq's own variables.");
  check(pg.PGHOST === "db.example.invalid" && pg.PGPORT === "6543" && pg.PGDATABASE === "postgres" && pg.PGSSLMODE === "require", "so are the host, the port, the database and sslmode.");
  check(!Object.keys(pg).some((k) => k !== "PGPASSWORD" && String(pg[k]).includes("p@ss")), "and the password is in PGPASSWORD and in nothing else -- there is no argument for it to leak into.");
  checkRefuses(threw(() => pgEnvFromUrl("mysql://x/y")) !== undefined, "a connection string that is not postgres:// is refused.");
  checkRefuses(threw(() => pgEnvFromUrl("not a url")) !== undefined, "so is one that is not a URL.");
}

// ---------------------------------------------------------------------------
// The end-to-end half
// ---------------------------------------------------------------------------

const PSQL = process.env.BACKUP_PSQL || "psql";
const PG_DUMP = process.env.BACKUP_PG_DUMP || "pg_dump";

function psqlOn(url, sql, { file } = {}) {
  const args = ["--no-psqlrc", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1"];
  args.push(file ? "--file" : "--command", file || sql);
  const result = spawnSync(PSQL, args, { env: { ...process.env, ...pgEnvFromUrl(url), PGCONNECT_TIMEOUT: "30" }, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return { status: result.status, out: (result.stdout || "").trim(), err: (result.stderr || "").trim() };
}

function urlWithDatabase(url, database) {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

// The made-up world. Every value in it is invented in this file: three
// accounts with made-up addresses and made-up password hashes, two teams,
// tasks carrying a marker string, a suspension with a reason, usage counts,
// and three storage rows matching the three objects seeded into the stand-in
// bucket. The table names are this project's seven plus the two Supabase
// schemas, because the point of the copy is that the managed schemas come too.
function seedSql({ withAuth }) {
  const lines = [];
  lines.push("create extension if not exists pgcrypto;");
  for (const role of ["anon", "authenticated", "service_role"]) {
    lines.push(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${role}') then create role "${role}" nologin; end if; end $$;`);
  }
  if (withAuth) {
    lines.push("create schema if not exists auth;");
    lines.push(`create table auth.users (
      id uuid primary key, email text not null, encrypted_password text not null,
      last_sign_in_at timestamptz, created_at timestamptz not null default now());`);
    lines.push(`insert into auth.users (id, email, encrypted_password) values
      ('11111111-1111-4111-8111-111111111110', 'alice.${MADE_UP.email}', 'MADE-UP-HASH-aaa'),
      ('11111111-1111-4111-8111-111111111111', 'bob.${MADE_UP.email}', 'MADE-UP-HASH-bbb'),
      ('11111111-1111-4111-8111-111111111112', 'carol.${MADE_UP.email}', 'MADE-UP-HASH-ccc');`);
    lines.push("create table auth.audit_log_entries (id uuid primary key, ip_address text);");
    lines.push("insert into auth.audit_log_entries values ('22222222-2222-4222-8222-222222222220', '203.0.113.7');");
  }
  lines.push("create schema if not exists storage;");
  lines.push("create table storage.buckets (id text primary key, public boolean not null default false, file_size_limit bigint);");
  lines.push("insert into storage.buckets values ('attachments', false, 5242880);");
  lines.push(`create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null,
    owner_id text, metadata jsonb, created_at timestamptz not null default now());`);
  lines.push("create table public.teams (id uuid primary key, name text not null, owner_id uuid not null);");
  lines.push(`insert into public.teams values
    ('33333333-3333-4333-8333-333333333330', 'MADE-UP-TEAM-Tuesday', '11111111-1111-4111-8111-111111111110'),
    ('33333333-3333-4333-8333-333333333331', 'MADE-UP-TEAM-Weekend', '11111111-1111-4111-8111-111111111112');`);
  lines.push("create table public.team_members (team_id uuid not null, user_id uuid not null, role text not null, primary key (team_id, user_id));");
  lines.push(`insert into public.team_members values
    ('33333333-3333-4333-8333-333333333330', '11111111-1111-4111-8111-111111111110', 'owner'),
    ('33333333-3333-4333-8333-333333333330', '11111111-1111-4111-8111-111111111112', 'member');`);
  lines.push("create table public.tasks (id uuid primary key, title text not null, team_id uuid, created_by uuid not null, done boolean not null default false);");
  lines.push(`insert into public.tasks values
    ('44444444-4444-4444-8444-444444444440', '${MADE_UP.taskText} one', '33333333-3333-4333-8333-333333333330', '11111111-1111-4111-8111-111111111110', false),
    ('44444444-4444-4444-8444-444444444441', '${MADE_UP.taskText} two', null, '11111111-1111-4111-8111-111111111110', true),
    ('44444444-4444-4444-8444-444444444442', '${MADE_UP.taskText} three', '33333333-3333-4333-8333-333333333330', '11111111-1111-4111-8111-111111111112', false);`);
  lines.push("create table public.profiles (id uuid primary key, nickname text, ai_suggestions_enabled boolean not null default false);");
  lines.push(`insert into public.profiles values ('11111111-1111-4111-8111-111111111110', '${MADE_UP.nickname}', false);`);
  lines.push("create table public.invitations (id uuid primary key, team_id uuid not null, email text not null, token_hash text not null, status text not null);");
  lines.push(`insert into public.invitations values ('55555555-5555-4555-8555-555555555550', '33333333-3333-4333-8333-333333333330', 'invited.${MADE_UP.email}', 'MADE-UP-TOKEN-HASH-dddd', 'sent');`);
  lines.push("create table public.account_status (user_id uuid primary key, suspended_at timestamptz not null default now(), reason text);");
  lines.push(`insert into public.account_status (user_id, reason) values ('11111111-1111-4111-8111-111111111111', '${MADE_UP.reason}');`);
  lines.push("create table public.usage_counts (user_id uuid not null, feature text not null, day date not null, used integer not null, primary key (user_id, feature, day));");
  lines.push("insert into public.usage_counts values ('11111111-1111-4111-8111-111111111110', 'ai_suggestions', '2026-10-09', 4);");
  lines.push("grant select on all tables in schema public to authenticated;");
  // Three storage rows, one per object seeded into the stand-in bucket.
  MADE_UP.fileNames.forEach((file, index) => {
    lines.push(
      `insert into storage.objects (bucket_id, name, owner_id, metadata) values ('attachments', '4444444${index}-4444-4444-8444-44444444444${index}/${file}', '11111111-1111-4111-8111-111111111110', '{"size": ${20 + index}}');`,
    );
  });
  return lines.join("\n");
}

// Both scripts are run as CHILD PROCESSES rather than imported, for two
// reasons: it is how the workflow runs them, and it is the only way to capture
// everything they print -- which is itself one of the things under test.
//
// IT HAS TO BE ASYNCHRONOUS, and the reason cost an hour: the stand-in object
// stores are HTTP servers running in THIS process, so a spawnSync would block
// the event loop that is supposed to be answering the child's requests. The
// child would wait for a reply that this process could not send until the
// child exited. Deadlock, with no error message at either end.
function runScript(script, env, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(import.meta.dirname, script), ...args], {
      env: { ...process.env, ...env },
    });
    let log = "";
    child.stdout.on("data", (chunk) => (log += chunk));
    child.stderr.on("data", (chunk) => (log += chunk));
    child.on("close", (status) => resolve({ status, log }));
  });
}

async function endToEnd() {
  const admin = process.env.BACKUP_PROOF_DB_URL;
  if (!admin) {
    console.log("UNVERIFIED  BACKUP_PROOF_DB_URL is not set, so the end-to-end half did not run. That is not a pass (AGENTS.md rule 8).");
    results.fail++;
    return;
  }
  const host = new URL(admin).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    console.log("FAIL  BACKUP_PROOF_DB_URL must point at a throwaway cluster on this machine. It creates and drops databases, and it is never pointed at staging or production.");
    results.fail++;
    return;
  }

  const stamp = `${process.pid}`;
  const sourceDb = `tt_proof_src_${stamp}`;
  const noAuthDb = `tt_proof_noauth_${stamp}`;
  const restoreDb = `tt_proof_dst_${stamp}`;
  const work = join(process.env.BACKUP_TMPDIR || tmpdir(), `tt-backup-proof-${stamp}`);
  mkdirSync(work, { recursive: true });

  const source = await startStandinStore({
    credentials: { accessKeyId: MADE_UP.sourceKeyId, secretAccessKey: MADE_UP.sourceSecret },
    buckets: ["attachments", "restored"],
    // TWO AT A TIME, with three objects to fetch: so the continuation-token
    // loop in s3.mjs is exercised rather than assumed. A client that ignored
    // NextContinuationToken would copy two files and the completeness check
    // would not notice, because the manifest is built from what was listed.
    pageSize: 2,
    region: "proof-source-region",
  });
  const destination = await startStandinStore({
    credentials: { accessKeyId: MADE_UP.destKeyId, secretAccessKey: MADE_UP.destSecret },
    buckets: ["team-tasks-backups"],
    region: "auto",
  });

  const fileBytes = MADE_UP.fileNames.map((file, index) => Buffer.from(`made-up-bytes-${index}-${file}`.padEnd(20 + index, "."), "utf8"));
  MADE_UP.fileNames.forEach((file, index) => {
    source.seed("attachments", `4444444${index}-4444-4444-8444-44444444444${index}/${file}`, fileBytes[index]);
  });

  const commonEnv = {
    PRODUCTION_SUPABASE_S3_ENDPOINT: source.endpoint,
    PRODUCTION_SUPABASE_S3_REGION: source.region,
    PRODUCTION_SUPABASE_S3_ACCESS_KEY_ID: MADE_UP.sourceKeyId,
    PRODUCTION_SUPABASE_S3_SECRET_ACCESS_KEY: MADE_UP.sourceSecret,
    BACKUP_STORAGE_ENDPOINT: destination.endpoint,
    BACKUP_DEST_REGION: "auto",
    BACKUP_STORAGE_KEY: MADE_UP.destKeyId,
    BACKUP_STORAGE_SECRET: MADE_UP.destSecret,
    BACKUP_PASSPHRASE: MADE_UP.passphrase,
    BACKUP_SOURCE_BUCKET: "attachments",
    BACKUP_DEST_BUCKET: "team-tasks-backups",
    BACKUP_TMPDIR: work,
    BACKUP_PSQL: PSQL,
    BACKUP_PG_DUMP: PG_DUMP,
  };

  try {
    console.log("--- A throwaway database with made-up data in it");
    for (const database of [sourceDb, noAuthDb, restoreDb]) {
      const made = psqlOn(admin, `create database "${database}"`);
      if (made.status !== 0) {
        console.log(`FAIL  could not create the throwaway database ${database} (psql exited ${made.status}). The proof cannot run.`);
        results.fail++;
        return;
      }
    }
    check(true, `created three throwaway databases on ${host}: one to copy, one with no accounts, one to restore into.`);
    const seeded = psqlOn(urlWithDatabase(admin, sourceDb), seedSql({ withAuth: true }));
    const seededNoAuth = psqlOn(urlWithDatabase(admin, noAuthDb), seedSql({ withAuth: false }));
    if (seeded.status !== 0 || seededNoAuth.status !== 0) {
      console.log(`FAIL  the made-up data would not load (psql exited ${seeded.status} and ${seededNoAuth.status}).`);
      results.fail++;
      return;
    }
    const seededUsers = psqlOn(urlWithDatabase(admin, sourceDb), "select count(*) from auth.users");
    check(seededUsers.out === "3", "it holds 3 made-up accounts with made-up password hashes in `auth.users`, which is the half a copy taken the obvious way would miss.");

    console.log("--- back up");
    const before = destination.objects("team-tasks-backups").size;
    const run = await runScript("make-backup.mjs", { ...commonEnv, PRODUCTION_SUPABASE_DB_URL: urlWithDatabase(admin, sourceDb) });
    check(run.status === 0, `make-backup.mjs exited ${run.status}.`);
    if (run.status !== 0) console.log(run.log);
    const stored = destination.objects("team-tasks-backups");
    check(stored.size === before + 1, `exactly one object was written to the backup bucket (${before} before, ${stored.size} after).`);
    const key = [...stored.keys()].at(-1);
    const ciphertext = stored.get(key) || Buffer.alloc(0);
    check(looksEncrypted(ciphertext), "the object in the bucket is encrypted.");
    check(ciphertext.indexOf(CONTAINER_MAGIC) === -1 && !ciphertext.includes(MADE_UP.taskText), "and it holds neither the container's header nor any made-up task text in the clear.");
    check(/^team-tasks\/\d{4}-\d{2}-\d{2}\/production-\d{8}T\d{6}Z\.ttbk1\.enc$/.test(key), "it is named by the UTC date and time it was taken.");
    check(/Verified by HEAD/.test(run.log), "the run read the object back with HEAD and checked its size.");
    check(/Read the object back: \d+ bytes, SHA-256 matches, and it is encrypted\./.test(run.log), "and downloaded it again and compared the checksum of the bytes actually stored.");
    check(/Nothing was deleted\./.test(run.log), "the job deleted nothing: retention is the bucket's own lifecycle rule.");
    check(readdirSync(work).length === 0, "no plaintext dump is left behind: the directory it worked in is empty again, before the runner is even destroyed.");

    console.log("--- what the log says, and what it must never say");
    const mustNotAppear = {
      BACKUP_PASSPHRASE: MADE_UP.passphrase,
      BACKUP_STORAGE_SECRET: MADE_UP.destSecret,
      BACKUP_STORAGE_KEY: MADE_UP.destKeyId,
      PRODUCTION_SUPABASE_S3_SECRET_ACCESS_KEY: MADE_UP.sourceSecret,
      PRODUCTION_SUPABASE_S3_ACCESS_KEY_ID: MADE_UP.sourceKeyId,
      "a made-up task's text": MADE_UP.taskText,
      "a made-up nickname": MADE_UP.nickname,
      "a made-up suspension reason": MADE_UP.reason,
      "a made-up team name": "MADE-UP-TEAM-Tuesday",
      "a made-up password hash": "MADE-UP-HASH-aaa",
      "a made-up invitation token hash": "MADE-UP-TOKEN-HASH-dddd",
      "a made-up file name": MADE_UP.fileNames[0],
    };
    const found = scanLog(run.log, { values: mustNotAppear });
    check(found.length === 0, `the whole log is clean: no secret, no row, no address, no file name, no connection string. ${found.join("; ")}`);
    check(!/public\.tasks|auth\.users|usage_counts/.test(run.log), "it names no table, so it cannot carry a real table's row count.");
    checkRefuses(scanLog(`${run.log}\nthe passphrase is ${MADE_UP.passphrase}`, { values: mustNotAppear }).length > 0, "A SECRET IN THE LOG: the same scan over the same log with one secret added finds it.");
    checkRefuses(scanLog(`${run.log}\ntitle: ${MADE_UP.taskText}`, { values: mustNotAppear }).length > 0, "A ROW IN THE LOG: and with one row added, finds that.");

    // Printing the backup job's whole log is safe exactly because of the three
    // checks above, and it is how evidence/build-it-24-nightly-copy.md can
    // show what a run actually says rather than describing it. Off by default,
    // because a passing CI job should be short.
    if (process.env.BACKUP_PROOF_SHOW_LOG) {
      console.log("--- every line make-backup.mjs printed, in full (the scan above is what makes this safe to show)");
      for (const line of run.log.split("\n")) if (line.trim()) console.log(`    | ${line}`);
    }

    console.log("--- what is inside the copy");
    const container = decrypt(ciphertext, MADE_UP.passphrase);
    const packed = readContainer(container);
    const manifest = JSON.parse(packed.read(MANIFEST_PATH).toString("utf8"));
    check(manifest.takenFirst === "database", "the manifest says which half was taken first, as docs/architecture.md asks.");
    check(manifest.storage.objects === 3 && packed.entries.filter((e) => e.path.startsWith(OBJECT_PREFIX)).length === 3, "ALL THREE files are in the copy, although the bucket handed them over two at a time.");
    for (const [index, bytes] of fileBytes.entries()) {
      const name = MADE_UP.fileNames[index];
      const inCopy = packed.entries.find((e) => e.path.endsWith(name));
      check(inCopy && packed.read(inCopy.path).equals(bytes), `file ${index + 1} of 3 is in the copy byte for byte.`);
    }
    const users = manifest.database.tables.find((t) => t.schema === "auth" && t.name === "users");
    check(users && Number(users.rows) === 3, "the manifest records 3 rows in auth.users -- the accounts are counted, inside the ciphertext where a row count belongs.");
    check(manifest.database.schemasCovered.includes("auth") && manifest.database.schemasCovered.includes("storage"), "the dump covers `auth` and `storage` as well as `public`.");
    check(manifest.database.tables.filter((t) => t.schema === "public").length === 7, "and all seven of this project's own tables are counted.");
    const dump = packed.read(DUMP_PATH).toString("utf8");
    check(dump.includes("MADE-UP-HASH-aaa"), "the dump really carries the password hashes: a copy without them restores data nobody can sign in to reach.");
    check(dump.includes("203.0.113.7") || dump.includes("audit_log_entries"), "and the rest of the auth schema with them.");

    console.log("--- and it opens with openssl and gzip alone, which is the whole reason for the format");
    // docs/restore-runbook.md's last section promises a copy can be opened by
    // two programs that were on the machine before this project existed. That
    // promise is load-bearing -- it is what stops the data being hostage to
    // this repository's own code -- so it is checked against the real binary
    // rather than against our reading of OpenSSL's documentation.
    const opensslVersion = spawnSync("openssl", ["version"], { encoding: "utf8" });
    if (opensslVersion.status !== 0) {
      console.log("UNVERIFIED  openssl is not on this machine, so the no-scripts route was not checked. That is not a pass (AGENTS.md rule 8).");
      results.fail++;
    } else {
      const passFile = join(work, "pass.txt");
      const encFile = join(work, "copy.enc");
      const outFile = join(work, "opened.ttbk1");
      writeFileSync(passFile, MADE_UP.passphrase);
      writeFileSync(encFile, ciphertext);
      const opened = spawnSync(
        "openssl",
        ["enc", "-d", `-${CIPHER}`, "-md", PBKDF2_DIGEST, "-pbkdf2", "-iter", String(PBKDF2_ITERATIONS), "-pass", `file:${passFile}`, "-in", encFile, "-out", outFile],
        { encoding: "utf8" },
      );
      check(opened.status === 0, `${opensslVersion.stdout.trim()} opened the copy this run made: exit ${opened.status}.`);
      const byOpenssl = opened.status === 0 ? readFileSync(outFile) : Buffer.alloc(0);
      check(byOpenssl.equals(container), "and what it produced is the container byte for byte -- so the outer layer really is OpenSSL's own `enc` format and not merely shaped like it.");
      const header = readContainer(byOpenssl);
      check(header.entries.length === packed.entries.length, `its header lists all ${header.entries.length} entries, so the entry table is readable with nothing but a JSON reader.`);
      const first = header.entries.find((e) => e.path === DUMP_PATH);
      const slice = byOpenssl.subarray(header.bodyAt + first.offset, header.bodyAt + first.offset + first.storedBytes);
      check(gunzipSync(slice).equals(packed.read(DUMP_PATH)), "and the dump sliced out of it at that offset is a gzip file that gunzips to the dump.");
      rmSync(passFile, { force: true });
      rmSync(encFile, { force: true });
      rmSync(outFile, { force: true });
    }

    console.log("--- restore into an empty database, and compare");
    const restoreEnv = {
      ...commonEnv,
      RESTORE_DB_URL: urlWithDatabase(admin, restoreDb),
      RESTORE_S3_ENDPOINT: source.endpoint,
      RESTORE_S3_REGION: source.region,
      RESTORE_S3_ACCESS_KEY_ID: MADE_UP.sourceKeyId,
      RESTORE_S3_SECRET_ACCESS_KEY: MADE_UP.sourceSecret,
      RESTORE_BUCKET: "restored",
    };
    const restore = await runScript("restore-backup.mjs", restoreEnv, ["--latest"]);
    check(restore.status === 0, `restore-backup.mjs --latest exited ${restore.status}.`);
    if (restore.status !== 0 || process.env.BACKUP_PROOF_SHOW_LOG) {
      console.log("--- every line restore-backup.mjs printed, in full");
      for (const line of restore.log.split("\n")) if (line.trim()) console.log(`    | ${line}`);
    }
    check(/every one of \d+ table\(s\) came back with the row count the copy recorded/.test(restore.log), "every table came back with the row count the copy recorded.");
    check(/the accounts came back: auth\.users has 3 row\(s\)/.test(restore.log), "THE ACCOUNTS CAME BACK: auth.users has its 3 rows.");
    check(/every one of 3 file\(s\) came back byte for byte/.test(restore.log), "and all three files came back byte for byte.");
    check(/THAT NUMBER IS THE ANSWER/.test(restore.log), "the run reports its own wall-clock time, which is the only answer to 'how long are we down'.");
    const restoredTitles = psqlOn(urlWithDatabase(admin, restoreDb), "select count(*) from public.tasks where title like 'MADE-UP-TASK-TEXT%'");
    check(restoredTitles.out === "3", "the restored database really holds the three made-up tasks, read back with a query of its own.");
    const restoredHash = psqlOn(urlWithDatabase(admin, restoreDb), "select count(*) from auth.users where encrypted_password = 'MADE-UP-HASH-aaa'");
    check(restoredHash.out === "1", "and a made-up password hash came back exactly as it went in.");
    check(source.objects("restored").size === 3, "the restored bucket holds three objects.");

    console.log("--- the five things this must be seen to fail on");
    const noAuthBefore = destination.objects("team-tasks-backups").size;
    const noAuthRun = await runScript("make-backup.mjs", { ...commonEnv, PRODUCTION_SUPABASE_DB_URL: urlWithDatabase(admin, noAuthDb) });
    checkRefuses(refusedCleanly(noAuthRun), `THE ACCOUNTS LEFT OUT: a database with no \`auth\` schema -- which is exactly what \`supabase db dump\` would produce -- is refused (exit ${noAuthRun.status}).`);
    checkRefuses(/THE ACCOUNTS ARE NOT IN THIS COPY/.test(noAuthRun.log), "and the run says so in those words, rather than failing obscurely.");
    checkRefuses(destination.objects("team-tasks-backups").size === noAuthBefore, "and NOTHING was uploaded: the check happens before the upload, not after it.");

    const minusOne = packed.entries.filter((e) => !e.path.endsWith(MADE_UP.fileNames[2])).map((e) => ({ path: e.path, data: packed.read(e.path) }));
    const tamperedKey = "team-tasks/2026-10-10/tampered-a-file-is-missing.ttbk1.enc";
    destination.seed("team-tasks-backups", tamperedKey, encrypt(packContainer(minusOne), MADE_UP.passphrase));
    const missingRun = await runScript("restore-backup.mjs", restoreEnv, ["--key", tamperedKey, "--check-only"]);
    checkRefuses(refusedCleanly(missingRun), `A FILE MISSING: a copy whose manifest lists a file it does not hold is refused on restore (exit ${missingRun.status}).`);
    checkRefuses(/A FILE IS MISSING FROM THIS COPY/.test(missingRun.log), "and the words name what is wrong without naming the file.");

    const plainKey = "team-tasks/2026-10-10/uploaded-in-the-clear.ttbk1.enc";
    destination.seed("team-tasks-backups", plainKey, container);
    const plainRun = await runScript("restore-backup.mjs", restoreEnv, ["--key", plainKey, "--check-only"]);
    checkRefuses(refusedCleanly(plainRun), `UPLOADED UNENCRYPTED: a copy sitting in the bucket in the clear is refused (exit ${plainRun.status}).`);
    checkRefuses(/THE COPY IS NOT ENCRYPTED/.test(plainRun.log), "and the words tell the reader to go and talk to the owner before doing anything else.");

    const wrongRun = await runScript("restore-backup.mjs", { ...restoreEnv, BACKUP_PASSPHRASE: MADE_UP.wrongPassphrase }, ["--key", key, "--check-only"]);
    checkRefuses(refusedCleanly(wrongRun), `THE WRONG PASSPHRASE: the copy does not open (exit ${wrongRun.status}).`);
    checkRefuses(/did not decrypt/.test(wrongRun.log), "and the message says the passphrase may be wrong, which is the thing to go and check.");

    const badKeyBefore = destination.objects("team-tasks-backups").size;
    const badKeyRun = await runScript("make-backup.mjs", {
      ...commonEnv,
      PRODUCTION_SUPABASE_DB_URL: urlWithDatabase(admin, sourceDb),
      BACKUP_STORAGE_SECRET: "the-wrong-secret-entirely",
    });
    checkRefuses(refusedCleanly(badKeyRun), `a wrong storage secret fails the run (exit ${badKeyRun.status}): the stand-in recomputes the signature and refuses it, so every request really was signed correctly in the passing run above.`);
    checkRefuses(destination.objects("team-tasks-backups").size === badKeyBefore, "and nothing was written when it did.");

    const missingSetting = await runScript("make-backup.mjs", { ...commonEnv, PRODUCTION_SUPABASE_DB_URL: urlWithDatabase(admin, sourceDb), BACKUP_PASSPHRASE: "   " });
    checkRefuses(refusedCleanly(missingSetting), "a passphrase of spaces is treated as missing, matching every other settings check in this repository.");
    checkRefuses(/BACKUP_PASSPHRASE/.test(missingSetting.log) && !missingSetting.log.includes(MADE_UP.passphrase), "and the run names the setting that is missing and no value.");
  } finally {
    await source.stop();
    await destination.stop();
    for (const database of [sourceDb, noAuthDb, restoreDb]) {
      psqlOn(admin, `drop database if exists "${database}"`);
    }
    try {
      rmSync(work, { recursive: true, force: true });
    } catch {
      /* a throwaway directory */
    }
  }
}

// ---------------------------------------------------------------------------

console.log(`node ${process.version} -- scripts/backup/proof.mjs${PURE_ONLY ? " --pure-only" : ""}`);
pureCases();
if (PURE_ONLY) {
  console.log("--pure-only: the end-to-end half (a throwaway PostgreSQL and two stand-in object stores) did not run.");
} else {
  await endToEnd();
}
console.log(`${results.pass} PASS, ${results.fail} FAIL.`);
process.exitCode = results.fail ? 1 : 0;
