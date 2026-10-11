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

// Headers the Fetch standard will not let a caller set: "a header (name,
// value) is a forbidden request-header if these steps return true: … name
// matches one of these (byte-case-insensitive): … `Content-Length` … `Host` …"
// (https://fetch.spec.whatwg.org/, read 2026-10-10 — the full list is longer;
// these are the two SigV4 touches).
//
// WHY THIS MATTERS TO A SIGNER AND NOT ONLY TO TIDINESS. SigV4 signs the
// headers it lists in SignedHeaders, and the request is refused if what
// arrives differs from what was signed. `host` MUST be signed and must NOT be
// set by us — the HTTP layer sets it from the URL. `content-length` is the
// same the other way round: it is not ours to set, so it is not ours to sign.
// Signing something you do not control is how a 403 with no explanation
// happens.
export const FORBIDDEN_REQUEST_HEADERS = new Set(["content-length", "host"]);

const encodeSegment = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

export function encodeS3Key(key) {
  return key.split("/").map(encodeSegment).join("/");
}

export function amzDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function signRequest({
  method,
  url,
  region,
  service = "s3",
  accessKeyId,
  secretAccessKey,
  payloadSha256,
  headers = {},
  date,
  // Both object stores want `x-amz-content-sha256` and it is sent by default.
  // The ONLY caller that turns it off is scripts/backup/proof.mjs, reproducing
  // AWS's own published test vectors, which are for a generic service and do
  // not carry that header. Being able to reproduce them exactly is what makes
  // them a check rather than a gesture.
  contentSha256Header = true,
}) {
  if (!accessKeyId || !secretAccessKey) throw new Error("no access key for signing");
  const target = new URL(url);
  const stamp = amzDate(date);
  const day = stamp.slice(0, 8);

  // Lower-cased keys throughout: SigV4 signs header names in lower case, and
  // doing the fold once removes any chance of signing one spelling and sending
  // another.
  const all = {};
  const given = { ...headers, host: target.host, "x-amz-date": stamp };
  if (contentSha256Header) given["x-amz-content-sha256"] = payloadSha256;
  for (const [name, value] of Object.entries(given)) {
    all[name.toLowerCase()] = String(value);
  }
  const names = Object.keys(all).sort();
  // TRIMMED **AND** INTERNAL WHITESPACE COLLAPSED. The second half is not a
  // nicety: AWS's published test suite case `get-header-value-trim` sends
  // `My-Header2: "a   b   c"` and expects the canonical form `"a b c"`, and
  // this signer got it wrong until those vectors were run against it. Nothing
  // this project sends has runs of spaces in a header value, which is exactly
  // why it would never have been noticed here.
  const canonicalHeaders = names.map((n) => `${n}:${all[n].trim().replace(/\s+/g, " ")}\n`).join("");
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
    headers: {
      ...all,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    signedHeaders,
    signature,
    // THE WORKINGS, so proof.mjs can compare them with AWS's published
    // expected strings. They are returned BESIDE the headers rather than
    // mixed in with them, which is not tidiness: the first version put them
    // in the same object, `sendableHeaders` passed the lot to fetch, and
    // `Headers.append` refused a multi-line value -- so the preflight died
    // with the canonical request in the error message. In a real run that
    // would have printed the request's PATH into a public log.
    //
    // NOTHING PRINTS THESE. A canonical request carries the path, and a path
    // is `<task id>/<file name>`.
    canonicalRequest,
    stringToSign: toSign,
  };
}

// What goes on the wire: the signed headers, minus the ones the Fetch
// standard will not let a caller set. Takes the whole result of signRequest
// and reads only its `headers`, so the workings above cannot leak into a
// request by accident.
export function sendableHeaders(signed) {
  const out = {};
  for (const [name, value] of Object.entries(signed.headers ?? signed)) {
    if (!FORBIDDEN_REQUEST_HEADERS.has(name.toLowerCase())) out[name] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Putting a file back with the content type it had
// ---------------------------------------------------------------------------
//
// THE REASON THIS EXISTS. The owner's first restore drill, 10 October 2026,
// got through the completeness checks and the database and then stopped:
//
//     the restored bucket: PUT answered HTTP 415, code InvalidMimeType
//
// The `attachments` bucket allows six named types and nothing else, and the
// restore was sending each file with no type the bucket accepts. So the
// comparison -- the only part of a drill that proves anything -- never ran.
//
// What the bucket allows, from `allowed_mime_types` on its row in
// `supabase/migrations/20261008191804_attachments_bucket.sql`. That migration
// is the authority; this constant is a copy of it, and proof.mjs reads the
// migration's own SQL and requires the two to agree, the way
// scripts/screen-state-check.mjs already does for the app's copy.
export const BUCKET_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "application/pdf"];

// SIX EXTENSIONS AND ONE MORE THAN THE APP OFFERS, deliberately.
// `web/src/lib/attachments.ts` maps six extensions to five types: it dropped
// `heic` on 9 October 2026 because a HEIC photograph failed through the app
// (#246). **This map keeps it**, and the distinction is the whole point:
//
//   the app's list is about what may be ADDED. This one is about what may be
//   PUT BACK.
//
// A HEIC file the bucket already holds is a file somebody's data depends on;
// refusing to restore it because the app would no longer accept a new one
// would be losing data to tidiness. The bucket still permits the type.
export const TYPE_BY_EXTENSION = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  pdf: "application/pdf",
};

// Where a file's content type comes from, in order, and WHY THE ORDER IS THIS
// ONE -- which matters because the owner has two copies already and wants them
// restorable without making a third:
//
//   1. THE MANIFEST. Copies made from now on record each file's content type,
//      read off the `content-type` header Supabase Storage answered with when
//      the backup read the file. That is the type the file actually had.
//      TODAY'S TWO COPIES DO NOT HAVE IT -- they were made before this change.
//   2. THE STORAGE RECORD INSIDE THE DUMP. `storage.objects.metadata` is a
//      JSON blob, and if it carries a `mimetype` (or `contentType`), that is
//      the service's own record of the type. **IT IS NOT CONFIRMED THAT IT
//      DOES**: `docs/plan.md` has carried "the declared type is not confirmed
//      ... presumably in `metadata` beside the size, and presumably is not a
//      citation" since 8 October, and the Supabase page read again on
//      2026-10-10 shows an example whose metadata holds only `{"size": 1234}`.
//      So this is looked for, used when found, and never relied on.
//   3. THE FILE'S EXTENSION. Not a guess, and this is the step that makes
//      today's copies restorable: the app set the type FROM THE EXTENSION in
//      the first place -- `web/src/lib/attachments.ts` exists for exactly that,
//      after the owner's staging run found Supabase would not do it. So
//      reproducing it here reproduces how the type was decided, rather than
//      inventing one.
//   4. NOTHING. Then the file is not uploaded and the restore STOPS, before
//      sending anything, with a count and no path. A 415 at this point is what
//      the drill already hit; refusing first is the same answer in a sentence
//      somebody can act on.
//
// A type that is not one the bucket allows is treated as no type at all, for
// the same reason: sending it would be refused, and saying so first is better.
export function contentTypeFor({ manifestType, storageType, path }) {
  const allowed = (type) => (typeof type === "string" && BUCKET_ALLOWED_TYPES.includes(type.trim().toLowerCase()) ? type.trim().toLowerCase() : undefined);

  const fromManifest = allowed(manifestType);
  if (fromManifest) return { type: fromManifest, source: "the manifest" };

  const fromStorage = allowed(storageType);
  if (fromStorage) return { type: fromStorage, source: "the storage record in the dump" };

  const extension = /\.([A-Za-z0-9]+)$/.exec(String(path ?? ""));
  const fromExtension = extension ? allowed(TYPE_BY_EXTENSION[extension[1].toLowerCase()]) : undefined;
  if (fromExtension) return { type: fromExtension, source: "the file's extension" };

  return { type: undefined, source: "nowhere" };
}

// Reads the content types out of a plain-text pg_dump, by finding the COPY
// block for `storage.objects` and pulling the `name` and `metadata` columns.
// Returns a Map of object name -> type, which may be empty -- and an empty
// answer is a normal one, not a failure, because nothing confirms that
// `metadata` carries a type at all.
//
// Why parse the dump rather than restore first and query: because this has to
// work for copies that already exist, and because the type is needed BEFORE
// the file is uploaded.
//
// It reads the column ORDER off the COPY line rather than assuming it: a dump
// writes `COPY storage.objects (id, bucket_id, name, owner, metadata, ...)`,
// and the column list is whatever that project had.
export function parseStorageObjectTypes(dumpText) {
  const types = new Map();
  const text = String(dumpText ?? "");
  const start = /^COPY\s+"?storage"?\.\s*"?objects"?\s*\(([^)]*)\)\s+FROM\s+stdin;\s*$/im.exec(text);
  if (!start) return types;
  const columns = start[1].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const nameAt = columns.indexOf("name");
  const metadataAt = columns.indexOf("metadata");
  if (nameAt === -1 || metadataAt === -1) return types;

  const body = text.slice(start.index + start[0].length);
  for (const line of body.split("\n")) {
    if (line === "\\." || line.startsWith("\\.")) break;
    if (line === "") continue;
    const fields = line.split("\t");
    if (fields.length <= Math.max(nameAt, metadataAt)) continue;
    const name = unescapeCopyField(fields[nameAt]);
    const metadata = unescapeCopyField(fields[metadataAt]);
    if (!name || metadata === "\\N") continue;
    let parsed;
    try {
      parsed = JSON.parse(metadata);
    } catch {
      continue;
    }
    const type = parsed?.mimetype ?? parsed?.mimeType ?? parsed?.contentType ?? parsed?.content_type;
    if (typeof type === "string" && type !== "") types.set(name, type);
  }
  return types;
}

// A COPY field escapes tab, newline and backslash. Nothing here prints a
// field; they are compared with the manifest's paths and read for a type.
function unescapeCopyField(field) {
  return String(field ?? "").replace(/\\(.)/g, (whole, char) => (char === "t" ? "\t" : char === "n" ? "\n" : char === "r" ? "\r" : char === "\\" ? "\\" : whole));
}

// ---------------------------------------------------------------------------
// WHAT A RESTORE PROMISES TO BRING BACK, BY NAME
// ---------------------------------------------------------------------------
//
// THE OWNER'S DECISION OF 11 OCTOBER 2026, after the first finished drill:
// **sign-in sessions are not restored, and after a recovery everybody signs in
// again.** That is a small decision with a large consequence for this code,
// because until it was taken the restore compared EVERY table in the copy
// against the restored database and called any difference a failure. A copy of
// a Supabase project holds dozens of tables that a new Supabase project brings
// with it, and two of them -- `auth.refresh_tokens` and `auth.mfa_amr_claims`
// -- came back as 0 of 2 and 0 of 1 in the drill, because the sessions they
// point at were not there. "Every table matched except three" is not a verdict
// anybody can act on.
//
// So the promise is a NAMED SET, and the three answers are different:
//
//   INSIDE the promise  -- a mismatch FAILS the restore. No "mostly".
//   OUTSIDE it          -- reported as "not restored, by design", with a count,
//                          and NEVER as a failure.
//   NAMED NOWHERE       -- still not a failure (the owner's decision above),
//                          but printed by name, because a table this design has
//                          never heard of is the line somebody should read when
//                          Supabase ships a new one.
//
// WHERE THE NAMES COME FROM, AND THE ONE THING THAT IS NOT CONFIRMED. The
// `public` half needs no list: every table in it is this app's own. The account
// half is a list, and it was written from this project's knowledge of Supabase
// Auth and from the constraint names in the drill's own error messages -- NOT by
// reading a dump, because the assistant never receives one (docs/backups.md).
// So the restore PRINTS every `auth` table it meets that is in neither list, and
// the next drill's output is what settles the naming. Issue #276.
export const PROMISED_ACCOUNT_TABLES = {
  users: "the account itself, with its hashed password",
  identities: "the identity that ties an email address to that account, which is what a password sign-in matches",
  mfa_factors: "a second factor somebody enrolled -- without it, their sign-in is not the one they set up",
};

// "The storage records" of the owner's instruction: the rows Storage keeps about
// each file. The bucket row is in it because a file has nowhere to go without
// one; `docs/plan.md`'s appendix calls these two rows and the bytes three
// separate things, and a restore that brought back two of the three would show
// files nobody can open -- which is #248 all over again, from the other end.
export const PROMISED_STORAGE_TABLES = {
  buckets: "the bucket row -- without it there is nowhere for a file to be",
  objects: "what Storage records about each file: its path, its size, who uploaded it, and when",
};

// NOT RESTORED, AND THIS IS WHY -- the `auth` tables this design has looked at
// and decided about. Every one of them is sign-in state, a log, or Supabase's
// own bookkeeping that a new project arrives with.
export const AUTH_TABLES_NOT_RESTORED = {
  sessions: "a sign-in session. The owner's decision of 11 October 2026: after a recovery everybody signs in again",
  refresh_tokens: "the same thing one layer down, and one of the two the drill saw refused",
  mfa_amr_claims: "which factors a session used, so it goes wherever the session goes -- the other one the drill saw refused",
  mfa_challenges: "a second-factor challenge that was in flight",
  flow_state: "a sign-in that was half-done at the moment production died",
  one_time_tokens: "a confirmation or reset link in flight. Every one of them is a credential with a clock on it, and restoring it would restart the clock",
  audit_log_entries: "the sign-in log, with its IP addresses. docs/plan.md's appendix says never to build anything on it; a restore is not the place to start",
  instances: "GoTrue's own bookkeeping; a new project brings its own",
  schema_migrations: "GoTrue's own migration record; a new project has already applied its own",
  sso_providers: "single sign-on, which this app does not use",
  sso_domains: "single sign-on, which this app does not use",
  saml_providers: "single sign-on, which this app does not use",
  saml_relay_states: "single sign-on, which this app does not use",
};

// One answer per table, used by the restore's comparison and by the replay
// planner -- the same function in both places, so what is COMPARED and what is
// actually SENT cannot disagree.
export function restoreScope(schema, table) {
  const s = String(schema ?? "");
  const t = String(table ?? "");
  if (s === "public") return { promised: true, named: true, part: "every table in public", why: "this app's own data" };
  if (s === "auth" && Object.hasOwn(PROMISED_ACCOUNT_TABLES, t)) {
    return { promised: true, named: true, part: "the accounts", why: PROMISED_ACCOUNT_TABLES[t] };
  }
  if (s === "storage" && Object.hasOwn(PROMISED_STORAGE_TABLES, t)) {
    return { promised: true, named: true, part: "the storage records", why: PROMISED_STORAGE_TABLES[t] };
  }
  if (s === "auth" && Object.hasOwn(AUTH_TABLES_NOT_RESTORED, t)) {
    return { promised: false, named: true, part: "sign-in state and Supabase Auth's own bookkeeping", why: AUTH_TABLES_NOT_RESTORED[t] };
  }
  if (s === "auth") {
    return {
      promised: false,
      named: false,
      part: "an `auth` table this design has never named",
      why: "it is neither on the promised list nor on the deliberately-not-restored one, which is the state a new Supabase release can create. Read it and decide (#276)",
    };
  }
  return {
    promised: false,
    named: true,
    part: "a schema a new project brings with it",
    why: "Supabase's own -- storage internals, realtime, vault, the extensions' tables and the migration records. A new project has its own and refuses ours",
  };
}

// ---------------------------------------------------------------------------
// HOW THE DUMP IS REPLAYED, AND WHY A ROW CAN NO LONGER BE EXECUTED AS SQL
// ---------------------------------------------------------------------------
//
// THE FAULT, from the owner's finished drill of 10-11 October 2026: three of
// psql's 574 ERROR lines were **syntax errors at character 1** -- one "trailing
// junk after numeric literal" and two "syntax error at or near" a number. Those
// are not schema errors. They are ROWS OF A TABLE BEING PARSED AS SQL.
//
// WHAT HAPPENED. The sequence below was MEASURED against psql 17.10 on
// 2026-10-11, and every step of it is explained by a sentence psql's own
// documentation already carries
// (https://www.postgresql.org/docs/17/app-psql.html and
// https://www.postgresql.org/docs/17/sql-copy.html, both read 2026-10-11). The
// measured run, three lines of it, in full:
//
//   psql:oldway.sql:1: ERROR:  relation "public.nope" does not exist
//   psql:oldway.sql:4: error: invalid command \.
//   psql:oldway.sql:5: ERROR:  syntax error at or near "1" at character 1
//
//   1. A plain pg_dump writes a table's data INLINE: `COPY "s"."t" (...) FROM
//      stdin;`, then one line per row, then a line holding `\.` -- the
//      "end-of-data marker", which COPY documents as "a single line containing
//      just backslash-period (`\.`)".
//   2. The COPY is refused. The rows are then still sitting in the script, and
//      psql does not stop, because `ON_ERROR_STOP` is deliberately off here:
//      psql "returns … 3 if an error occurred in a script and the variable
//      `ON_ERROR_STOP` was set", and it is not set.
//   3. The rows produce NO error of their own, because "Ordinarily, input lines
//      are sent to the server when a command-terminating semicolon is reached.
//      An end of line does not terminate a command." They are buffered.
//   4. `\.` is read as a meta-command, because "Anything you enter in psql that
//      begins with an unquoted backslash is a psql meta-command" -- so it does
//      not end the mess, it is simply `invalid command \.`. **That is an extra
//      error line per refused block**, and it is counted like any other.
//   5. THE NEXT REAL STATEMENT'S SEMICOLON FLUSHES THE WHOLE LOT AS ONE
//      STATEMENT. The rows and that statement are parsed together, so the
//      failure lands **at character 1** and quotes the FIRST TOKEN OF THE FIRST
//      ROW -- in the run above, `"1"`, which is a row's first column.
//
// WHICH IS EXACTLY WHAT THE DRILL REPORTED, and this is the part that makes it a
// diagnosis rather than a theory: "three syntax errors at character 1 ('trailing
// junk after numeric literal', and two 'syntax error at or near' a number)". At
// character 1, quoting a number -- the first column of a row. And three of them
// rather than hundreds, because each one covers every row buffered up to the
// next semicolon.
//
// scripts/backup/proof.mjs runs that measurement as a case, against a real psql,
// and then requires the same dump replayed the new way to produce no syntax
// error, no `invalid command`, and no sign of the row at all.
//
// THE FIX: THE ROWS NEVER GO IN THE SQL STREAM. Each `COPY … FROM stdin;` block
// is lifted out of the dump into a file of its own, and is replayed with psql's
// own `\copy` meta-command, which "runs an SQL COPY command, but instead of the
// server reading or writing the specified file, psql reads or writes the file
// and routes the data between the server and the local file system". A refused
// COPY is then an error with nothing after it: the next line is the next
// statement, because the rows are not in the stream to be read.
//
// IT IS TWO SCRIPTS AND TWO psql RUNS, AND THAT IS NOT A STYLE CHOICE -- IT IS
// FORCED BY POSTGRESQL'S OWN HARDENING, found by running this against a real
// psql on 2026-10-11 and not by reading anything:
//
//   psql:…: error: backslash commands are restricted; only \unrestrict is allowed
//
// A pg_dump from a current PostgreSQL wraps its whole output in `\restrict
// <token>` … `\unrestrict <token>`, and inside that region psql refuses every
// meta-command but `\unrestrict`. That exists to stop a hostile dump's data
// lines being read as psql commands -- which is a cousin of the very fault being
// fixed here, so it is not something to switch off. So:
//
//   PASS 1  the dump, verbatim, with each COPY block replaced by a comment. Its
//           `\restrict` is left exactly where pg_dump put it, and nothing of
//           ours needs a backslash command.
//   PASS 2  a script of nothing but our own `\copy` lines, in its own psql
//           process, where no `\restrict` has ever been issued.
//
// AND A RETRY ROUND, which is the part the hardening forced us to think about.
// pg_dump's data section is ordered **alphabetically by schema and table** --
// measured on 2026-10-11: `auth.identities` is dumped before `auth.users`. A
// plain dump gets away with that because its own foreign keys are added
// afterwards, in the post-data section. A restore into a project that ALREADY
// has the schema -- which is what docs/restore-runbook.md step 3 tells you to
// do, because that is what gives you the bucket -- has those foreign keys in
// place during the load, so the child's `COPY` is refused before its parent is
// there. So the restore counts the rows, and runs the data pass again for the
// promised tables that did not match, while that number is going down. The
// runbook's "run it again" advice, done by the script instead of by a person.
//
// WHY THIS AND NOT THE OBVIOUS ALTERNATIVES:
//
//   * `ON_ERROR_STOP=on` would stop at the FIRST error, and a restore into a
//     project that already has the schema is supposed to produce hundreds. It
//     would turn every restore into a failure.
//   * `pg_dump --format=custom` with `pg_restore` cannot have this fault at all,
//     because the data is not SQL -- and it is the usual answer. It is refused
//     here for one reason: the copy would stop being readable with stock tools.
//     docs/restore-runbook.md's "Opening a copy with no scripts at all" and
//     docs/backups.md both rest on the dump inside the copy being plain text
//     that `openssl` and `gzip` get you to. Trading that away to fix a parser
//     problem would be paying for a backup with the thing that makes it a
//     backup.
//   * Feeding each COPY block to its own `psql` invocation does NOT fix it: the
//     rows would still follow the command in that invocation's input.
//   * `\unrestrict`-ing around each `\copy` would keep it to one pass and one
//     order. It is refused because it means switching off a protection
//     PostgreSQL added on purpose, in the middle of replaying somebody else's
//     file, to save a second process.
//
// AND THE SECOND THING IT BUYS, which is the owner's promise decision above: a
// table outside the promise simply gets NO `\copy` line and NO data file. "Not
// restored, by design" becomes true by construction rather than by comparison,
// and the rows of a table nobody promised never touch the disk.
export const COPY_FROM_STDIN_LINE = /^COPY\s+(.*?)\s+FROM\s+stdin\s*((?:WITH\s*)?\([^()]*\))?\s*;\s*$/i;

// Reads one `COPY … FROM stdin;` line into its parts. It THROWS rather than
// guessing, and that is the point: a line this cannot read is a line the old
// code would have left in the script with its rows behind it, which is the
// fault. A loud stop is the fail-closed direction.
export function parseCopyFromStdin(line) {
  const text = String(line ?? "").replace(/\r$/, "");
  const m = COPY_FROM_STDIN_LINE.exec(text);
  if (!m) throw new Error("a COPY ... FROM stdin line in the dump could not be read. Its text is deliberately not quoted: a COPY line names a table and its columns.");
  const target = m[1].trim();
  const options = (m[2] || "").trim();
  const withColumns = /^(.*?)\s*(\([^()]*\))\s*$/.exec(target);
  const relation = (withColumns ? withColumns[1] : target).trim();
  const columns = withColumns ? withColumns[2] : "";
  const parts = /^(?:"((?:[^"]|"")*)"|([A-Za-z_][\w$]*))\.(?:"((?:[^"]|"")*)"|([A-Za-z_][\w$]*))$/.exec(relation);
  if (!parts) {
    throw new Error("a COPY ... FROM stdin line names a relation this cannot split into a schema and a table. pg_dump always qualifies one; a dump that does not is not a dump this restore understands.");
  }
  // THE NAMES GO INTO A psql META-COMMAND, so they are checked before they do.
  // `\copy` takes "the entire remainder of the line" as its arguments, so an
  // apostrophe in a name would end the quoted file path early and the rest of
  // the line would be read as something else. Nothing in this project has such a
  // name; a dump that did would stop here rather than build a line nobody meant.
  for (const [what, value] of [
    ["the relation", relation],
    ["the column list", columns],
    ["the options", options],
  ]) {
    if (/['\r\n\\]/.test(value)) {
      throw new Error(
        `${what} on a COPY ... FROM stdin line carries an apostrophe, a backslash or a line break, which cannot go into a psql \\copy line safely. Nothing was replayed, and the name is not printed.`,
      );
    }
  }
  if (options !== "" && !/^(?:WITH\s*)?\([A-Za-z0-9_,\s]*\)$/i.test(options)) {
    throw new Error("the options on a COPY ... FROM stdin line are not a plain `WITH (...)` list of words, so this refuses to reproduce them. Nothing was replayed.");
  }
  const unquote = (value) => value.replace(/""/g, '"');
  return {
    relation,
    columns,
    options,
    schema: parts[1] !== undefined ? unquote(parts[1]) : parts[2],
    table: parts[3] !== undefined ? unquote(parts[3]) : parts[4],
  };
}

// Where a `COPY` line may be recognised and where it may not. A dump carries
// function bodies in dollar quotes and comments in single quotes, and either can
// hold a line that begins with the word COPY. Mistaking one for a real block
// would swallow the rest of a function body as "rows", so the state is tracked
// rather than hoped about: single quotes (with '' as the escape), double-quoted
// identifiers (with "" as the escape), dollar quotes, and `--` to end of line.
//
// NOT TRACKED: `/* */` block comments, which pg_dump does not emit. If that ever
// changes, an unterminated block throws rather than passing silently.
export function advanceQuoteState(line, state) {
  const text = String(line ?? "");
  let at = 0;
  while (at < text.length) {
    if (state.dollarTag !== undefined) {
      const closes = text.indexOf(state.dollarTag, at);
      if (closes === -1) return state;
      at = closes + state.dollarTag.length;
      state.dollarTag = undefined;
      continue;
    }
    if (state.inSingle) {
      if (text[at] === "'") {
        if (text[at + 1] === "'") at += 2;
        else {
          state.inSingle = false;
          at += 1;
        }
        continue;
      }
      at += 1;
      continue;
    }
    if (state.inDouble) {
      if (text[at] === '"') {
        if (text[at + 1] === '"') at += 2;
        else {
          state.inDouble = false;
          at += 1;
        }
        continue;
      }
      at += 1;
      continue;
    }
    const here = text[at];
    if (here === "-" && text[at + 1] === "-") return state;
    if (here === "'") {
      state.inSingle = true;
      at += 1;
      continue;
    }
    if (here === '"') {
      state.inDouble = true;
      at += 1;
      continue;
    }
    if (here === "$") {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(at));
      if (tag) {
        state.dollarTag = tag[0];
        at += tag[0].length;
        continue;
      }
    }
    at += 1;
  }
  return state;
}

export function freshQuoteState() {
  return { inSingle: false, inDouble: false, dollarTag: undefined };
}

// Builds the data pass out of blocks: nothing but `\copy` lines, which is what
// lets it run in a psql that has never seen a `\restrict`. Exported because the
// retry round builds a narrower one from the same blocks.
export function dataScript(blocks) {
  const lines = blocks.filter((block) => block.restored).map((block) => block.copyLine);
  return lines.length ? `${lines.join("\n")}\n` : "";
}

// Turns a plain-text dump into (a) a script with no row of data anywhere in it,
// (b) a data script of `\copy` lines, and (c) one data file per table that is
// going back. Pure: it is given a function that says which tables are promised
// and a function that names a data file, and it opens nothing.
//
// `split("\n")` then `join("\n")` is lossless, CRLF included, because a trailing
// `\r` stays on the end of its line either way.
export function planReplay(dumpText, { isPromised = () => true, dataPath = (index) => `copy-${index}.dat` } = {}) {
  const lines = String(dumpText ?? "").split("\n");
  const script = [];
  const blocks = [];
  const state = freshQuoteState();
  let index = 0;
  let skippedInsideQuotes = 0;

  for (let at = 0; at < lines.length; at++) {
    const line = lines[at];
    const insideQuotes = state.inSingle || state.inDouble || state.dollarTag !== undefined;
    const looksLikeCopy = /^COPY\s/i.test(line) && /\bFROM\s+stdin\b/i.test(line);
    if (insideQuotes && looksLikeCopy) skippedInsideQuotes++;
    if (!insideQuotes && looksLikeCopy) {
      const copy = parseCopyFromStdin(line);
      const rows = [];
      let terminated = false;
      while (++at < lines.length) {
        if (lines[at].replace(/\r$/, "") === "\\.") {
          terminated = true;
          break;
        }
        rows.push(lines[at]);
      }
      if (!terminated) {
        throw new Error(
          `a COPY block for ${copy.schema}.${copy.table} runs to the end of the dump with no \\. end-of-data marker, so this cannot tell its rows from the rest of the file. ` +
            "Nothing was replayed. That is a damaged or unexpected dump, not something to work around.",
        );
      }
      const restored = isPromised(copy.schema, copy.table) === true;
      const file = restored ? dataPath(index) : undefined;
      blocks.push({
        index,
        schema: copy.schema,
        table: copy.table,
        restored,
        file,
        // ONE LINE, NO SEMICOLON, AND THE PATH QUOTED. psql: "Unlike most other
        // meta-commands, the entire remainder of the line is always taken to be
        // the arguments of \copy, and neither variable interpolation nor
        // backquote expansion are performed in the arguments." So nothing in
        // this line is expanded, and a `;` would be read as part of the file
        // name.
        copyLine: restored ? `\\copy ${copy.relation}${copy.columns ? ` ${copy.columns}` : ""} FROM '${file}'${copy.options ? ` ${copy.options}` : ""}` : undefined,
        // Kept with a trailing newline so the file ends in one, which is what
        // COPY expects of its last row.
        rows: rows.length ? `${rows.join("\n")}\n` : "",
        rowCount: rows.filter((row) => row.replace(/\r$/, "") !== "").length,
      });
      // WHAT GOES IN THE SCHEMA PASS IS A COMMENT EITHER WAY, because a `\copy`
      // here would be refused: the dump's own `\restrict` is still in force.
      script.push(
        restored
          ? `-- data for ${copy.schema}.${copy.table} is loaded by the data pass, out of a file of its own`
          : `-- not restored, by design: ${copy.schema}.${copy.table}`,
      );
      index++;
      continue;
    }
    advanceQuoteState(line, state);
    script.push(line);
  }

  // THE INVARIANT: NOT ONE `COPY … FROM stdin;` LINE MAY SURVIVE IN THE SCRIPT.
  // This is the thing that makes the guarantee a guarantee rather than a
  // best-effort parse. A line of that shape still in the script has its rows
  // behind it, which is exactly the fault this function exists to remove, so the
  // run STOPS. It stops for either cause, and the message says which:
  //
  //   * the quote tracker believed the line was inside a string -- a function
  //     body with such a line in it, or a string shape it read wrongly;
  //   * something else entirely, which is a dump this does not understand.
  //
  // THE COST, STATED RATHER THAN DISCOVERED: a dump carrying a line that merely
  // LOOKS like a data block stops a restore that might have worked. That is the
  // right way round. A false stop is read by a person; a row executed as SQL is
  // not, and the drill is how we found out.
  const leftover = script.filter((line) => /^COPY\s/i.test(line) && /\bFROM\s+stdin\b/i.test(line)).length;
  if (leftover > 0) {
    throw new Error(
      `${leftover} \`COPY … FROM stdin;\` line(s) are still in the script after planning the replay, so this refuses to run it -- ` +
        `${skippedInsideQuotes} of them because the scanner judged the line to be inside a quoted string, and ${leftover - skippedInsideQuotes} for some other reason. ` +
        "Every one has to be lifted out, because a row left in the SQL stream is a row psql will execute if the COPY is refused. " +
        "Nothing was replayed, and no row and no line of the dump is printed.",
    );
  }

  return { script: script.join("\n"), data: dataScript(blocks), blocks };
}

// ---------------------------------------------------------------------------
// Which of psql's errors are the ones a restore is supposed to produce
// ---------------------------------------------------------------------------
//
// THE DRILL SAW "psql exited 0 with 573 ERROR line(s)" and carried on, because
// a count on its own cannot tell a harmless error from a fatal one. 573 is the
// number ONE drill saw, restoring into a project that already had this
// repository's 11 migrations applied -- it is not a constant, and treating it
// as one would be a check that breaks every time a migration is added.
//
// WHAT IS STABLE IS THE KINDS. Replaying a dump into a project that already
// has the schema produces errors that all say some version of "that is already
// there" or "that is not yours to change"; anything else is a real failure
// hiding in a crowd. So every ERROR line is classified, the counts per kind are
// printed, and **an unexpected kind fails the run**.
//
// NOTHING OF THE TEXT IS EVER PRINTED. Not the statement, not the detail, not
// the message. psql's DETAIL for a unique-violation quotes the row's key, and
// the ERROR line for some faults quotes a value -- so what comes out of here is
// a kind, a count, and nothing else. The run keeps psql's own output in the
// temporary directory when it fails, which is the place to read it: on the
// owner's machine, not in a log.
// THE KINDS THE OWNER'S FINISHED DRILL ADDED, 10-11 October 2026. The first
// drill's 573 lines were a number; the finished one's **574** were a list,
// because the owner read the kinds off his own machine and sent them with no row
// text. Five of them this classifier called "unexpected", and four of those five
// are Supabase saying "that schema is mine" in four different sentences. They are
// expected kinds now, each with its own name, so the report says which of them
// happened rather than lumping them under "not the owner".
//
// THE FIFTH IS NOT HERE AND MUST NOT BE: the three **syntax errors** at
// character 1. Those were rows of a table being executed as SQL after a `COPY`
// was refused, and they are the fault `planReplay` below exists to make
// impossible. A kind for them would have hidden the bug behind a classification.
export const EXPECTED_PSQL_ERROR_KINDS = [
  // Replaying a schema the project already has.
  { kind: "already exists", test: /already exists/i },
  // THE SAME THING, SAID DIFFERENTLY, and it is its own kind because this
  // classifier found it rather than anybody predicting it: replaying
  // `ALTER TABLE … ADD CONSTRAINT … PRIMARY KEY` onto a table that already has
  // one does not say "already exists", it says this. Measured on a throwaway
  // PostgreSQL 17.10 on 2026-10-10 -- one line per table, so the owner's drill
  // of 47 tables would have had 47 of them, and the first version of this
  // check would have failed a restore that was fine.
  { kind: "a primary key the table already has", test: /multiple primary keys for table .* are not allowed/i },
  // --- The four Supabase-managed-schema refusals, named from the owner's
  // finished drill. Each is "that is Supabase's, not yours", said differently,
  // and each is ORDERED BEFORE the broad `permission denied` kind below so the
  // report names the particular refusal rather than the general one.
  //
  // 52 of them in the drill. `ALTER DEFAULT PRIVILEGES` for a role the restoring
  // user does not belong to.
  { kind: "default privileges are not ours to change", test: /permission denied to change default privileges/i },
  // 32. A dump replays `GRANT … WITH GRANT OPTION` and PostgreSQL refuses to
  // hand a grant option back to the role that gave it.
  { kind: "a grant option cannot be given back to its grantor", test: /grant options cannot be granted back to your own grantor/i },
  // 97, over five schemas: auth, realtime, storage, pgbouncer, graphql_public.
  { kind: "a managed schema is not ours to write in", test: /permission denied for schema/i },
  // 6. Supabase's own event triggers, which a dump cannot recreate here.
  { kind: "an event trigger a non-superuser may not own", test: /non-superuser owned event trigger must execute a non-superuser owned function/i },
  // THE TWO FOREIGN KEYS THAT FOLLOW FROM THE OWNER'S DECISION OF 11 OCTOBER
  // 2026: sign-in sessions are not restored, so a row that points at one cannot
  // be either. Named by CONSTRAINT rather than by "violates foreign key
  // constraint" at large, because any other table's foreign key failing is a
  // real failure and must stay unexpected. A constraint name is schema, not a
  // row -- nothing of the row comes near this.
  {
    kind: "a sign-in row whose session this restore does not promise",
    test: /violates foreign key constraint "(?:refresh_tokens_session_id_fkey|mfa_amr_claims_session_id_fkey)"/i,
  },
  // ANY OTHER FOREIGN KEY ON A DATA LOAD, which is an ORDERING artefact and not
  // a fault: pg_dump's data section is alphabetical, so `auth.identities` is sent
  // before `auth.users`, and into a project that already has the schema the
  // child is refused before its parent exists. The restore's retry round is what
  // answers it.
  //
  // AND THE REASON LETTING THIS PASS IS NOT A HOLE: a table whose rows did not
  // arrive is caught by the ROW-COUNT COMPARISON, which is a stronger check than
  // an error count and fails the restore by name. Only promised tables are sent
  // at all, and every promised table is compared -- so an unrepaired foreign-key
  // failure cannot be survived, it just gets reported by the thing that can tell
  // whether it mattered.
  { kind: "a row whose parent had not loaded yet -- the retry round answers this", test: /violates foreign key constraint/i },
  // Supabase owns its managed schemas and roles; a dump tries to set owners
  // and privileges on them and is refused. Expected, and not ours to fix.
  { kind: "not the owner", test: /must be owner of|must be member of role|permission denied/i },
  // A second run over tables whose rows are already there. This is what makes
  // a stopped restore safe to run again -- see the comment in
  // restore-backup.mjs -- and it is the one kind that is expected for TWO
  // different reasons, which is said out loud rather than glossed: on a first
  // run it should not happen, and this classifier cannot tell the two runs
  // apart. The comparison at the end is what still decides.
  { kind: "row already restored", test: /duplicate key value violates unique constraint|violates unique constraint/i },
  // An extension, event trigger or publication a dump cannot create here.
  { kind: "not supported here", test: /must be superuser|is not allowed|unrecognized configuration parameter|no schema has been selected/i },
];

export function classifyPsqlErrors(stderr) {
  const counts = new Map();
  let total = 0;
  let unexpected = 0;
  for (const raw of String(stderr ?? "").split("\n")) {
    const line = raw.trim();
    // psql writes `psql:file:line: ERROR:  …`. DETAIL, HINT, CONTEXT and
    // STATEMENT lines are deliberately NOT counted and never read: they are
    // where a row's values appear.
    if (!/^(psql:[^ ]*\s*)?ERROR:/i.test(line)) continue;
    total++;
    const match = EXPECTED_PSQL_ERROR_KINDS.find((candidate) => candidate.test.test(line));
    if (match) counts.set(match.kind, (counts.get(match.kind) || 0) + 1);
    else unexpected++;
  }
  return { total, unexpected, byKind: [...counts.entries()].map(([kind, count]) => ({ kind, count })) };
}

// ---------------------------------------------------------------------------
// What an object store said "no" for, in one word
// ---------------------------------------------------------------------------
//
// THE REASON THIS EXISTS. On 10 October 2026 the first real run got all the
// way to the upload and stopped at "the backup bucket: PUT answered HTTP 403.
// No response body is printed." That message is correct and nearly useless:
// three completely different faults answer 403, and they need three
// completely different fixes.
//
//   SignatureDoesNotMatch  our signing is wrong, or the secret has a stray
//                          character in it
//   AccessDenied           the credential is real and is not allowed to do
//                          this -- a token scope or a bucket restriction
//   InvalidAccessKeyId     the key id is not a key id this service knows
//
// So the code is printed, and nothing else. **Never the message, never the
// RequestId, never a header.** A body from an object store can quote the key
// it was asked for, and a key is `<task id>/<file name>` -- which
// docs/plan.md puts on the list of things that must never reach a log, and
// this repository's run logs are public.
//
// HOW IT IS KEPT SAFE: the code is matched against a FIXED LIST and anything
// else prints as "unrecognised". So the list being incomplete is harmless by
// construction -- an unknown code costs a word of detail, where echoing an
// unknown string could cost a file name. That property is the design, not a
// limitation of it.
//
// Where the list comes from: the codes Supabase's own Storage error-code page
// documents (https://supabase.com/docs/guides/storage/debugging/error-codes,
// read 2026-10-10) plus the S3 codes that name a cause somebody could act on.
// Both of this project's object stores speak S3, so both answer in these
// terms.
export const S3_ERROR_CODES = new Set([
  // the three that answer a 403, and the whole reason for this
  "AccessDenied",
  "InvalidAccessKeyId",
  "S3InvalidAccessKeyId",
  "SignatureDoesNotMatch",
  "InvalidSignature",
  "InvalidJWT",
  // wrong place, wrong name
  "NoSuchBucket",
  "NoSuchKey",
  "NoSuchUpload",
  "InvalidBucketName",
  "InvalidKey",
  "InvalidUploadId",
  "KeyAlreadyExists",
  "BucketAlreadyExists",
  "ResourceAlreadyExists",
  "TenantNotFound",
  // the request itself
  "InvalidRequest",
  "InvalidArgument",
  "InvalidRange",
  "InvalidMimeType",
  "InvalidChecksum",
  "MissingContentLength",
  "MissingParameter",
  "MissingPart",
  "MalformedXML",
  "AuthorizationHeaderMalformed",
  "RequestTimeTooSkewed",
  "EntityTooLarge",
  "MethodNotAllowed",
  "PermanentRedirect",
  // the service, not us
  "InternalError",
  "S3Error",
  "SlowDown",
  "ServiceUnavailable",
  "DatabaseTimeout",
  "DatabaseError",
  "LockTimeout",
  "ResourceLocked",
  "S3MaximumCredentialsLimit",
]);

// Reads <Code>…</Code> out of an S3 error body and answers with it ONLY if it
// is one we know. Everything else — an unknown code, an HTML error page, an
// empty body, a body with no Code element — is "unrecognised".
//
// The regex is deliberately narrow: a code is letters and digits, so no
// response can smuggle a path, an address or a quoted value through this
// function even if it puts one inside the Code element.
export function s3ErrorCode(body) {
  const found = /<Code>\s*([A-Za-z0-9]{1,64})\s*<\/Code>/.exec(String(body ?? ""));
  if (found && S3_ERROR_CODES.has(found[1])) return found[1];
  return "unrecognised";
}

// ---------------------------------------------------------------------------
// Is this client old enough to be useless?
// ---------------------------------------------------------------------------
//
// `pg_dump` refuses to dump a server NEWER than itself, and says so in a way
// that reads like a database fault rather than a missing tool. **Production is
// PostgreSQL 17.6** -- read through the production read-only connector by the
// coach on 2026-10-10 -- and the ubuntu-24.04 runner carries 16.15, so this is
// not a hypothetical: a nightly copy with the runner's own client would stop
// every night and copy nothing (#262). `scripts/backup/install-pg17.sh` is the
// fix; this is the thing that says so in one sentence if the fix ever stops
// working.
//
// It lives here, pure and exported, so proof.mjs can feed it the exact pair of
// numbers that was about to break the first run and require a refusal.

// The first integer after "PostgreSQL)" if the text has one, else the first
// integer at all. So all four of these read correctly:
//   "17.6"                                            -> 17
//   "pg_dump (PostgreSQL) 16.15 (Ubuntu 16.15-1.pgdg)" -> 16
//   "psql (PostgreSQL) 17.6 (Ubuntu 17.6-1.pgdg24.04+1)" -> 17
//   "18beta1"                                          -> 18
// and anything with no number in it reads as unknown rather than as zero.
export function majorVersion(text) {
  const whole = String(text ?? "");
  const marker = whole.indexOf("PostgreSQL)");
  const after = marker === -1 ? whole : whole.slice(marker + "PostgreSQL)".length);
  const found = /(\d+)/.exec(after);
  return found ? Number(found[1]) : undefined;
}

export function clientTooOld({ serverVersion, clientVersion }) {
  const serverMajor = majorVersion(serverVersion);
  const clientMajor = majorVersion(clientVersion);
  if (serverMajor === undefined || clientMajor === undefined) {
    // DELIBERATELY NOT A REFUSAL, and this is the one place in these scripts
    // where an unknown does not stop the work. The reason is that the refusal
    // this check exists to produce is `pg_dump`'s own: it will decline a newer
    // server whatever we think. So an unreadable version string costs a clear
    // message and nothing else, where failing closed here would turn a
    // cosmetic change in somebody's `--version` output into no backup at all.
    return {
      refuse: false,
      serverMajor,
      clientMajor,
      note:
        "Could not read a major version from one of the two version strings, so this check did not run. " +
        "pg_dump's own refusal of a newer server is what still stops a mismatch -- it is a real refusal, not a silent pass.",
    };
  }
  if (clientMajor < serverMajor) {
    return {
      refuse: true,
      serverMajor,
      clientMajor,
      note:
        `pg_dump is major version ${clientMajor} and the database is major version ${serverMajor}. pg_dump refuses to dump a newer server, so NOTHING was copied. ` +
        "The fix is scripts/backup/install-pg17.sh, which both workflows run before this script -- if that step was skipped or failed, that is where to look. " +
        "Installing a client is a tool decision and therefore the owner's (AGENTS.md rule 17); it was taken on 2026-10-10 and #262 is the record.",
    };
  }
  return { refuse: false, serverMajor, clientMajor, note: undefined };
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

// The other direction, and the whole reason the name carries a timestamp: a
// watcher can tell how old the newest copy is WITHOUT holding the passphrase.
// `undefined` for anything that is not one of this job's own names, so a
// stray object in the bucket cannot make the bucket look fresh.
export function dateFromObjectName(key) {
  const m = /production-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.ttbk1\.enc$/.exec(String(key ?? ""));
  if (!m) return undefined;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  return Number.isFinite(ms) ? new Date(ms) : undefined;
}

// ---------------------------------------------------------------------------
// IS THERE A RECENT COPY AT ALL? -- 36 hours, the owner's decision of 2026-10-11
// ---------------------------------------------------------------------------
//
// WHY 36 AND NOT 24, which is the number anybody would have reached for. The
// first scheduled run started **5h 57m 24s** after its cron time, so two copies
// on consecutive nights can be **29h 57m 24s** apart with nothing wrong at all
// (docs/backups.md -> "The two targets" has the arithmetic). A 24-hour threshold
// would have cried wolf over a perfectly good copy, and a watcher nobody
// believes is worse than no watcher. 36 clears that measured delay by six hours
// and still fires on the FIRST missed night rather than the second -- which is
// the failure it exists for, because GitHub publishes that a queued job "may be
// dropped" and a dropped run leaves no failure to report.
//
// Everything about this judgement is pure and the threshold is a parameter, so
// scripts/backup/proof.mjs can hand it an empty bucket, a three-day-old copy and
// the measured 29h 57m delay and require the right answer to each.
export const COPY_OVERDUE_AFTER_HOURS = 36;

export function judgeCopyFreshness({ keys = [], now, thresholdHours = COPY_OVERDUE_AFTER_HOURS } = {}) {
  const at = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(at)) throw new Error("judgeCopyFreshness needs the time now, as a Date or a number of milliseconds.");
  const all = [...keys];
  const dated = all.map((key) => ({ key, when: dateFromObjectName(key) })).filter((candidate) => candidate.when !== undefined);

  if (dated.length === 0) {
    return {
      verdict: "none",
      overdue: true,
      counted: 0,
      ignored: all.length,
      thresholdHours,
      ageHours: undefined,
      newestKey: undefined,
      newestAt: undefined,
      // AN EMPTY BUCKET IS THE STATE THIS IS REALLY ABOUT (#264's own words), so
      // it is overdue rather than "nothing to judge". Fail closed.
      note:
        all.length === 0
          ? "The backup bucket is EMPTY. There is no copy of production anywhere, which is the state this whole build exists to get out of."
          : `The bucket holds ${all.length} object(s) and not one of them is named like a copy this job makes, so nothing here can be dated. Treated as no copy at all.`,
    };
  }

  const newest = dated.reduce((best, candidate) => (candidate.when > best.when ? candidate : best));
  const ageHours = (at - newest.when.getTime()) / 3600000;
  const overdue = ageHours > thresholdHours;
  return {
    verdict: overdue ? "overdue" : "fresh",
    overdue,
    counted: dated.length,
    ignored: all.length - dated.length,
    thresholdHours,
    ageHours,
    newestKey: newest.key,
    newestAt: newest.when,
    note: overdue
      ? `The newest copy is ${ageHours.toFixed(1)} hours old and the limit is ${thresholdHours}. A night has been missed, or the schedule has stopped.`
      : `The newest copy is ${ageHours.toFixed(1)} hours old, inside the ${thresholdHours}-hour limit.`,
  };
}
