// scripts/backup/lib.mjs
//
// The pure parts of the nightly copy: the encryption, the container the copy is
// packed into, the manifest, the completeness check, the log scanner and the
// AWS Signature Version 4 signer. Nothing in this file opens a socket, reads a
// setting or spawns a process -- which is what lets scripts/backup/proof.mjs
// run every judgement in it with no database, no network and no secret.
//
// Zero dependencies. Node built-ins only (AGENTS.md rule 17: a package is the
// owner's decision, and this needed none).
//
// WHAT THE FORMAT IS, AND WHY IT IS THIS ONE. docs/restore-runbook.md is the
// procedure; this comment is the reason the procedure can exist.
//
// A copy is ONE file:
//
//   AES-256-CBC( gzip-per-entry container ), PBKDF2-HMAC-SHA256 from the passphrase
//
// and the outer layer is written in OpenSSL's own `enc` file format -- the
// 8-byte literal "Salted__", then an 8-byte salt, then the ciphertext. That is
// a deliberate choice over anything of our own: it means the copy can be opened
// by a tool that was on every machine before this repository existed, so the
// data is not hostage to a script. The runbook gives both routes, ours and
// plain openssl, and the drill is told to try the openssl one.
//
// The container inside is ours, because there is no tar in Node and spawning
// one would make the restore depend on which tar a machine has (GNU, bsdtar or
// Windows'). It is deliberately the dullest thing that could work: a magic
// line, a decimal header length, a JSON header naming every entry with its
// offset, size and checksum, then the entries' bytes end to end. Each entry is
// gzip, so an entry sliced out of the container with `dd` is a valid `.gz` file
// that `gzip -d` opens. Two standard tools and a JSON reader get you to every
// byte without running any of this code.

import { createHash, createHmac, pbkdf2Sync, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

// OpenSSL's `enc` header. Its own file format, not ours.
export const OPENSSL_MAGIC = Buffer.from("Salted__", "ascii");

// 600,000 PBKDF2-HMAC-SHA256 iterations. The passphrase is a generated one in a
// password manager rather than a human-chosen word, so this is belt and braces
// -- but it costs a fraction of a second once per night and the copy it guards
// is every row of everything.
export const PBKDF2_ITERATIONS = 600000;
export const PBKDF2_DIGEST = "sha256";
export const CIPHER = "aes-256-cbc";

// The one command that opens a copy with no code of ours at all. Kept here, in
// the file that writes the format, so the two cannot drift: the runbook quotes
// it, and proof.mjs both checks the numbers in it against the constants above
// and hands it to the real openssl binary to see that it works.
//
// `-pass file:` and NOT `-pass pass:`, so the passphrase is never an argument.
// And not `fd:3` either, which reads better and was TRIED on 2026-10-10:
// OpenSSL 3.5.4 on Windows answered `Invalid password argument, starting with
// "fd:"`, because that source is not available there. A runbook step the owner
// cannot run on their own PC is not a runbook step.
export function opensslDecryptCommand({ inFile = "copy.enc", outFile = "copy.ttbk1", passFile = "passphrase.txt" } = {}) {
  return `openssl enc -d -${CIPHER} -md ${PBKDF2_DIGEST} -pbkdf2 -iter ${PBKDF2_ITERATIONS} -pass file:${passFile} -in ${inFile} -out ${outFile}`;
}

// PBKDF2 gives 48 bytes: the first 32 are the key, the next 16 the IV. That
// split is OpenSSL's, which is what makes the file above readable by it.
export function deriveKeyAndIv(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  if (typeof passphrase !== "string" || passphrase === "") throw new Error("no passphrase");
  const material = pbkdf2Sync(Buffer.from(passphrase, "utf8"), salt, iterations, 48, PBKDF2_DIGEST);
  return { key: material.subarray(0, 32), iv: material.subarray(32, 48) };
}

export function encrypt(plaintext, passphrase, { iterations = PBKDF2_ITERATIONS, salt } = {}) {
  const useSalt = salt || randomBytes(8);
  if (useSalt.length !== 8) throw new Error("the salt must be 8 bytes, as OpenSSL's format requires");
  const { key, iv } = deriveKeyAndIv(passphrase, useSalt, iterations);
  const cipher = createCipheriv(CIPHER, key, iv);
  return Buffer.concat([OPENSSL_MAGIC, useSalt, cipher.update(plaintext), cipher.final()]);
}

export function decrypt(ciphertext, passphrase, { iterations = PBKDF2_ITERATIONS } = {}) {
  if (ciphertext.length < 16 || !ciphertext.subarray(0, 8).equals(OPENSSL_MAGIC)) {
    throw new Error("this is not an encrypted copy: it does not start with OpenSSL's Salted__ header");
  }
  const salt = ciphertext.subarray(8, 16);
  const { key, iv } = deriveKeyAndIv(passphrase, salt, iterations);
  const decipher = createDecipheriv(CIPHER, key, iv);
  try {
    return Buffer.concat([decipher.update(ciphertext.subarray(16)), decipher.final()]);
  } catch {
    // CBC has no authentication tag, so a wrong passphrase shows up as padding
    // that does not decode. That is the only signal there is at this layer --
    // the checksums in the container are what prove the bytes are really ours.
    throw new Error("the copy did not decrypt: the passphrase is wrong, or the file is damaged");
  }
}

// Does this file look encrypted? Used after an upload and in the proof, where
// "the copy was uploaded unencrypted" is one of the things that must be caught.
// It is deliberately two tests rather than one: the header must be OpenSSL's,
// AND the body must not contain the container's own magic line, so a file that
// had the header glued onto plaintext would still be refused.
export function looksEncrypted(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) return false;
  if (!buffer.subarray(0, 8).equals(OPENSSL_MAGIC)) return false;
  return buffer.indexOf(CONTAINER_MAGIC) === -1;
}

// ---------------------------------------------------------------------------
// The container
// ---------------------------------------------------------------------------

export const CONTAINER_MAGIC = Buffer.from("TTBK1\n", "ascii");

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function md5(buffer) {
  return createHash("md5").update(buffer).digest("hex");
}

// entries: [{ path, data: Buffer }]. Every entry is gzipped on its own, so one
// can be sliced out and opened with gzip.
export function packContainer(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("a container with no entries is not a copy");
  const seen = new Set();
  const index = [];
  const blobs = [];
  let offset = 0;
  for (const entry of entries) {
    if (typeof entry.path !== "string" || entry.path === "") throw new Error("an entry with no path");
    if (seen.has(entry.path)) throw new Error(`two entries with the same path: ${entry.path}`);
    seen.add(entry.path);
    const stored = gzipSync(entry.data, { level: 6 });
    index.push({
      path: entry.path,
      offset,
      storedBytes: stored.length,
      storedSha256: sha256(stored),
      plainBytes: entry.data.length,
      plainSha256: sha256(entry.data),
      encoding: "gzip",
    });
    blobs.push(stored);
    offset += stored.length;
  }
  const header = Buffer.from(JSON.stringify({ format: "ttbk1", entries: index }), "utf8");
  const length = Buffer.from(`${header.length}\n`, "ascii");
  return Buffer.concat([CONTAINER_MAGIC, length, header, Buffer.from("\n", "ascii"), ...blobs]);
}

export function readContainer(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.subarray(0, CONTAINER_MAGIC.length).equals(CONTAINER_MAGIC)) {
    throw new Error("this is not a Team Tasks copy: the TTBK1 line is missing");
  }
  let at = CONTAINER_MAGIC.length;
  const newline = buffer.indexOf(0x0a, at);
  if (newline === -1) throw new Error("the container has no header length");
  const declared = Number(buffer.subarray(at, newline).toString("ascii").trim());
  if (!Number.isInteger(declared) || declared <= 0) throw new Error("the container's header length is not a number");
  at = newline + 1;
  const header = JSON.parse(buffer.subarray(at, at + declared).toString("utf8"));
  at = at + declared + 1; // the newline after the header
  const base = at;
  if (header.format !== "ttbk1" || !Array.isArray(header.entries)) throw new Error("the container's header is not a ttbk1 header");
  const read = (path) => {
    const entry = header.entries.find((e) => e.path === path);
    if (!entry) throw new Error(`the copy has no entry at ${path}`);
    const stored = buffer.subarray(base + entry.offset, base + entry.offset + entry.storedBytes);
    if (sha256(stored) !== entry.storedSha256) throw new Error(`the stored bytes of ${path} do not match their checksum`);
    const data = gunzipSync(stored);
    if (sha256(data) !== entry.plainSha256) throw new Error(`the contents of ${path} do not match their checksum`);
    return data;
  };
  return { entries: header.entries, read, bodyAt: base };
}

// ---------------------------------------------------------------------------
// The manifest, and the check that a copy is complete
// ---------------------------------------------------------------------------

export const MANIFEST_PATH = "manifest.json";
export const DUMP_PATH = "database/dump.sql";
export const OBJECT_PREFIX = "storage/objects/";

// The two schemas a copy is worthless without, and the whole reason this job
// does not use `supabase db dump`: that command "Runs pg_dump in a container
// with additional flags to exclude Supabase managed schemas. The ignored
// schemas include auth, storage, and those created by extensions"
// -- https://supabase.com/docs/reference/cli/supabase-db-dump, read 2026-10-10.
// A copy built that way holds no accounts and no file metadata and looks
// complete, because every table in `public` is there.
export const SCHEMAS_A_COPY_MUST_COVER = ["auth", "storage"];

export function buildManifest({ createdAt, takenFirst, database, storage }) {
  if (!createdAt) throw new Error("a manifest with no date");
  if (takenFirst !== "database" && takenFirst !== "files") throw new Error("a manifest must say which half was taken first");
  return {
    format: 1,
    createdAt,
    // docs/architecture.md: "the two halves are taken by different mechanisms
    // on different clocks ... Whatever is built has to take both as near the
    // same moment as it can and say in the file which it took first."
    takenFirst,
    database: {
      entry: DUMP_PATH,
      bytes: database.bytes,
      sha256: database.sha256,
      serverVersion: database.serverVersion,
      schemasCovered: database.schemasCovered,
      tables: database.tables,
      rowsTotal: database.tables.reduce((sum, t) => sum + Number(t.rows), 0),
      // Said in the copy itself, so a restore cannot be surprised by it.
      leftOutDeliberately: [
        "cluster roles and their passwords -- a new Supabase project creates its own, and a copy of a credential is another credential",
        "the server functions' secrets (service-role key, EMAIL_API_KEY, AI_API_KEY) -- see docs/secrets.md for what to set again",
        "anything set in a dashboard rather than in this repository: Auth redirect URLs, email templates, the Spend Cap",
        "the outside services' own records (Resend, Sentry, Anthropic)",
      ],
    },
    storage: {
      bucket: storage.bucket,
      objects: storage.files.length,
      bytes: storage.files.reduce((sum, f) => sum + f.bytes, 0),
      files: storage.files,
    },
  };
}

// The gate the real job runs on what it has built BEFORE it uploads anything,
// and the gate a restore runs on what it has downloaded. Same function, both
// ends, so "a copy is complete" means one thing.
//
// `dumpSchemas` is the set of schemas found by READING THE DUMP (see
// scanDumpForSchemas), never the manifest's own claim about itself. A manifest
// that says "auth is in here" proves nothing; the dump saying so does.
export function checkCopy({ manifest, entries, dumpSchemas }) {
  const problems = [];
  const path = (p) => entries.find((e) => e.path === p);

  if (!manifest || manifest.format !== 1) problems.push("the manifest is missing or is not format 1");
  if (!manifest?.createdAt) problems.push("the manifest has no date");
  if (manifest?.takenFirst !== "database" && manifest?.takenFirst !== "files") {
    problems.push("the manifest does not say which half was taken first");
  }

  const dump = path(DUMP_PATH);
  if (!dump) problems.push(`the copy has no ${DUMP_PATH}`);
  else {
    if (dump.plainBytes === 0) problems.push("the database dump is empty");
    if (manifest?.database?.sha256 && manifest.database.sha256 !== dump.plainSha256) {
      problems.push("the database dump does not match the checksum the manifest gives for it");
    }
    if (manifest?.database?.bytes !== undefined && manifest.database.bytes !== dump.plainBytes) {
      problems.push("the database dump is not the size the manifest gives for it");
    }
  }

  const covered = new Set(dumpSchemas || []);
  for (const schema of SCHEMAS_A_COPY_MUST_COVER) {
    if (!covered.has(schema)) {
      problems.push(
        schema === "auth"
          ? "THE ACCOUNTS ARE NOT IN THIS COPY: the dump covers no `auth` schema, so it holds no users and no password hashes. A restore from it would give data nobody can sign in to reach."
          : `the dump covers no \`${schema}\` schema, so the copy holds no file metadata`,
      );
    }
  }
  for (const table of manifest?.database?.tables || []) {
    if (!covered.has(table.schema)) problems.push(`the manifest counts rows in ${table.schema}.${table.name} but the dump does not cover that schema`);
  }

  const files = manifest?.storage?.files || [];
  if (manifest?.storage?.objects !== files.length) problems.push("the manifest's object count does not match its own file list");
  const packed = entries.filter((e) => e.path.startsWith(OBJECT_PREFIX));
  if (packed.length !== files.length) {
    problems.push(`the copy holds ${packed.length} file(s) and the manifest lists ${files.length}`);
  }
  for (const file of files) {
    const entry = path(OBJECT_PREFIX + file.path);
    if (!entry) {
      problems.push("A FILE IS MISSING FROM THIS COPY: the manifest lists an attached file that is not packed in it. Its path is not printed.");
      continue;
    }
    if (entry.plainBytes !== file.bytes) problems.push("a packed file is not the size the manifest gives for it. Its path is not printed.");
    if (entry.plainSha256 !== file.sha256) problems.push("a packed file does not match the checksum the manifest gives for it. Its path is not printed.");
  }

  return problems;
}

// Reads a pg_dump plain-text dump and answers which schemas it actually
// carries. Two shapes count, because a dump of an empty table has the first and
// not the second:
//   CREATE TABLE auth.users (
//   COPY auth.users (id, ...) FROM stdin;
// Line by line on purpose: a dump is tens of megabytes and nothing here needs
// it in one string.
export function scanDumpLine(line, into) {
  const create = /^\s*CREATE TABLE (?:IF NOT EXISTS )?"?([A-Za-z0-9_]+)"?\./.exec(line);
  if (create) into.add(create[1]);
  const copy = /^\s*COPY "?([A-Za-z0-9_]+)"?\./.exec(line);
  if (copy) into.add(copy[1]);
  const schema = /^\s*CREATE SCHEMA (?:IF NOT EXISTS )?"?([A-Za-z0-9_]+)"?/.exec(line);
  if (schema) into.add(schema[1]);
  return into;
}

// ---------------------------------------------------------------------------
// The log scanner
// ---------------------------------------------------------------------------

// Run logs on this repository are PUBLIC, because the repository is. This is
// the thing that says so with a test rather than with a comment: it is handed
// everything the job printed, plus the values that must not be in it, and it
// names which kind of thing it found and never the thing itself.
//
// Two halves, and the second is the one that catches what nobody thought of:
//   * the values we know -- every secret the job holds, and (in the proof) the
//     made-up rows it copied;
//   * the shapes we do not -- an email address, an OpenSSL header, a Postgres
//     connection string, a SQL COPY line.
const SHAPES = [
  { what: "an email address", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { what: "a Postgres connection string", re: /postgres(?:ql)?:\/\/[^\s]*@/i },
  { what: "a line out of a database dump", re: /^\s*(?:COPY\s+\w+\.|INSERT INTO\s+\w+\.)/m },
  { what: "the start of an encrypted file", re: /Salted__/ },
  { what: "a Supabase secret key", re: /sb_secret_[A-Za-z0-9]/ },
  { what: "an AWS-style signature header", re: /AWS4-HMAC-SHA256 Credential=/ },
];

export function scanLog(text, { values = {} } = {}) {
  const findings = [];
  const haystack = String(text);
  for (const [name, value] of Object.entries(values)) {
    if (typeof value !== "string" || value.length < 4) continue;
    if (haystack.includes(value)) findings.push(`the value of ${name} appears in the log`);
  }
  for (const shape of SHAPES) {
    if (shape.re.test(haystack)) findings.push(`${shape.what} appears in the log`);
  }
  return findings;
}

// ---------------------------------------------------------------------------
// AWS Signature Version 4
// ---------------------------------------------------------------------------
//
// Both stores speak S3 and both want SigV4:
//   * Supabase -- "Supabase Storage expects requests to be made using AWS
//     Signature Version 4."
//     https://supabase.com/docs/guides/storage/s3/compatibility, read 2026-10-10
//   * Cloudflare R2 -- "When using the S3 API, the region for an R2 bucket is
//     `auto`."  https://developers.cloudflare.com/r2/api/s3/api/, read 2026-10-10
//
// Written here rather than taken from a package: signing is forty lines of
// HMAC, and a package is the owner's decision (rule 17).

const encodeSegment = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export function encodeS3Key(key) {
  return key.split("/").map(encodeSegment).join("/");
}

export function amzDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function signRequest({ method, url, region, service = "s3", accessKeyId, secretAccessKey, payloadSha256, headers = {}, date }) {
  if (!accessKeyId || !secretAccessKey) throw new Error("no access key for signing");
  const target = new URL(url);
  const stamp = amzDate(date);
  const day = stamp.slice(0, 8);

  // Lower-cased keys throughout: SigV4 signs header names in lower case, and
  // doing the fold once removes any chance of signing one spelling and sending
  // another.
  const all = {};
  for (const [name, value] of Object.entries({ ...headers, host: target.host, "x-amz-content-sha256": payloadSha256, "x-amz-date": stamp })) {
    all[name.toLowerCase()] = String(value);
  }
  const names = Object.keys(all).sort();
  const canonicalHeaders = names.map((n) => `${n}:${all[n].trim()}\n`).join("");
  const signedHeaders = names.join(";");

  const query = [...target.searchParams.entries()]
    .map(([k, v]) => [encodeSegment(k), encodeSegment(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const canonicalRequest = [method, target.pathname, query, canonicalHeaders, signedHeaders, payloadSha256].join("\n");
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", stamp, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");

  const hmac = (key, data) => createHmac("sha256", key).update(data).digest();
  let signing = hmac(`AWS4${secretAccessKey}`, day);
  for (const part of [region, service, "aws4_request"]) signing = hmac(signing, part);
  const signature = createHmac("sha256", signing).update(toSign).digest("hex");

  return {
    ...all,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

// ---------------------------------------------------------------------------
// Talking to Postgres without putting a password on a command line
// ---------------------------------------------------------------------------
//
// `pg_dump "postgresql://user:password@host/db"` works and is wrong here: the
// whole connection string, password included, is then an argument, and
// arguments are visible in a process list and in anything that echoes a
// command. docs/backups.md's control table says secrets "arrive through env:
// and are never interpolated into a command line", and this is how that is
// true of the child process as well as of the workflow.
//
// So the URL is taken apart and handed over as libpq's own environment
// variables, which every Postgres client program reads:
// PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PGSSLMODE.
export function pgEnvFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("the database connection string is not a URL");
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) throw new Error("the database connection string is not a postgres:// URL");
  const env = {};
  if (parsed.hostname) env.PGHOST = decodeURIComponent(parsed.hostname);
  if (parsed.port) env.PGPORT = parsed.port;
  if (parsed.username) env.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);
  const database = parsed.pathname.replace(/^\//, "");
  if (database) env.PGDATABASE = decodeURIComponent(database);
  const sslmode = parsed.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

// One object per night, named by the UTC day it was taken, so the bucket reads
// as a calendar and the lifecycle rule that deletes at 14 days has nothing to
// interpret. The date is UTC for the same reason usage_counts' day is
// (docs/plan.md): the job has no other clock.
export function objectName(date) {
  const stamp = amzDate(date);
  // `stamp` already ends in Z, because that is the form SigV4 wants.
  return `team-tasks/${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}/production-${stamp}.ttbk1.enc`;
}
