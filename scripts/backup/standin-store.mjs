// scripts/backup/standin-store.mjs
//
// A stand-in for the two object stores, so the nightly copy can be run end to
// end with no real data, no Supabase project and no Cloudflare account. It is
// used by scripts/backup/proof.mjs and by nothing else; the real job never
// imports it.
//
// WHAT IT IS AND IS NOT. It is enough S3 for the four operations
// scripts/backup/s3.mjs uses -- ListObjectsV2, GetObject, HeadObject,
// PutObject -- served from a Map, on 127.0.0.1, with buckets held in memory
// and nothing written to disk. It is NOT Supabase Storage and NOT R2: the
// limits those two enforce (the attachments bucket's 5 MB and its six types,
// R2's lifecycle and lock rules) are theirs, and nothing here stands in for
// them. The same honesty the local Postgres sandbox is held to in
// evidence/build-it-23-attachments-bucket.md applies: what this proves is that
// OUR code reads, writes and verifies correctly, not that either service
// behaves as documented.
//
// THE ONE THING IT IS STRICT ABOUT IS THE SIGNATURE, and that is deliberate:
// it recomputes AWS Signature Version 4 over the request it actually received,
// with the key it holds, and answers 403 if it differs. So a run that passes
// here has really signed every request correctly -- which is the half of an S3
// client that is easy to get wrong and impossible to notice until the first
// real call. The proof includes a case with the wrong key that must be
// refused, so the strictness is itself checked.
//
// It also truncates a listing at a page size it is given, so the
// continuation-token loop in s3.mjs is exercised rather than assumed: with
// three objects and a page size of two, a client that ignores
// NextContinuationToken comes back with two files and the copy fails its own
// completeness check.

import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { signRequest } from "./lib.mjs";

const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");

const escapeXml = (text) =>
  String(text).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

// "20261010T011700Z" back into a Date, so the verifier signs with the same
// timestamp the client signed with.
function dateFromAmz(stamp) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(stamp || ""));
  if (!m) return undefined;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
}

// `allowedTypes` -- ADDED 2026-10-10, AND IT IS THE ONE LIMIT THIS STAND-IN
// MODELS. Its header says the bucket's own 5 MB and six named types are
// Supabase's and are not modelled here, and that was true until the owner's
// first restore drill walked straight into the gap: the restore sent every
// file with no type the bucket accepts, and the real service answered
// `415 InvalidMimeType`. CI could not have caught it, because nothing here
// cared what a PUT declared.
//
// So a bucket may now be given a list of types, and a PUT declaring anything
// else is refused the way Supabase refuses it -- HTTP 415 with
// `InvalidMimeType` in the body. That is enough to make the fault reproducible
// in CI and no more: the SIZE limit is still not modelled, and neither is
// anything else Storage decides.
export async function startStandinStore({ credentials, buckets = [], pageSize = 1000, region = "test-region", allowedTypes = undefined } = {}) {
  // bucket -> Map(key -> Buffer), and beside it the content type each object
  // was stored with. Two maps rather than one richer value, so that
  // `objects(bucket)` stays a plain Map of bytes for everything that already
  // reads it.
  const content = new Map();
  const types = new Map();
  for (const bucket of buckets) {
    content.set(bucket, new Map());
    types.set(bucket, new Map());
  }
  const calls = [];

  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks);
      try {
        answer(request, response, body);
      } catch (error) {
        response.writeHead(500, { "content-type": "text/plain" });
        response.end(String(error && error.message));
      }
    });
  });

  function verify(request, body) {
    const header = request.headers.authorization || "";
    const parsed = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/\S*, SignedHeaders=([^,]+), Signature=([0-9a-f]+)$/.exec(header);
    if (!parsed) return "no AWS4-HMAC-SHA256 Authorization header";
    const [, keyId, signedHeaders, signature] = parsed;
    if (keyId !== credentials.accessKeyId) return "unknown access key id";
    const date = dateFromAmz(request.headers["x-amz-date"]);
    if (!date) return "no usable x-amz-date";

    const headers = {};
    for (const name of signedHeaders.split(";")) {
      if (name === "host") continue; // signRequest adds it from the URL
      if (name === "x-amz-date" || name === "x-amz-content-sha256") continue; // likewise
      if (request.headers[name] === undefined) return `the request signed ${name} and did not send it`;
      headers[name] = request.headers[name];
    }
    const declared = request.headers["x-amz-content-sha256"];
    const actual = body.length ? createHash("sha256").update(body).digest("hex") : EMPTY_SHA256;
    if (declared !== actual) return "x-amz-content-sha256 does not match the body";

    const expected = signRequest({
      method: request.method,
      url: `http://${request.headers.host}${request.url}`,
      region,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      payloadSha256: declared,
      headers,
      date,
    });
    return expected.headers.authorization === header ? undefined : "the signature does not match";
  }

  function answer(request, response, body) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const [, bucket, ...rest] = url.pathname.split("/");
    const key = rest.map(decodeURIComponent).join("/");
    calls.push({ method: request.method, bucket, key, query: url.search });

    const bad = verify(request, body);
    if (bad) {
      response.writeHead(403, { "content-type": "application/xml" });
      response.end(`<?xml version="1.0"?><Error><Code>SignatureDoesNotMatch</Code><Message>${escapeXml(bad)}</Message></Error>`);
      return;
    }
    const store = content.get(bucket);
    if (!store) {
      response.writeHead(404, { "content-type": "application/xml" });
      response.end('<?xml version="1.0"?><Error><Code>NoSuchBucket</Code></Error>');
      return;
    }

    if (request.method === "GET" && url.searchParams.get("list-type") === "2") {
      const prefix = url.searchParams.get("prefix") || "";
      const after = url.searchParams.get("continuation-token") || "";
      const limit = Math.min(Number(url.searchParams.get("max-keys") || pageSize), pageSize);
      const all = [...store.keys()].filter((k) => k.startsWith(prefix) && (after === "" || k > after)).sort();
      const page = all.slice(0, limit);
      const truncated = all.length > page.length;
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">',
        `<Name>${escapeXml(bucket)}</Name><Prefix>${escapeXml(prefix)}</Prefix><KeyCount>${page.length}</KeyCount>`,
        `<MaxKeys>${limit}</MaxKeys><IsTruncated>${truncated}</IsTruncated>`,
        truncated ? `<NextContinuationToken>${escapeXml(page.at(-1))}</NextContinuationToken>` : "",
        ...page.map((k) => `<Contents><Key>${escapeXml(k)}</Key><Size>${store.get(k).length}</Size></Contents>`),
        "</ListBucketResult>",
      ].join("");
      response.writeHead(200, { "content-type": "application/xml" });
      response.end(xml);
      return;
    }

    if (request.method === "PUT") {
      if (allowedTypes) {
        // Supabase's own answer to a type its bucket does not allow:
        // `InvalidMimeType`, "The specified MIME type is not valid.", 400 --
        // https://supabase.com/docs/guides/storage/debugging/error-codes. The
        // owner's drill saw it as a 415, which is what this sends, because
        // that is what the real service said on the day.
        const declared = String(request.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
        if (!allowedTypes.includes(declared)) {
          response.writeHead(415, { "content-type": "application/xml" });
          response.end('<?xml version="1.0"?><Error><Code>InvalidMimeType</Code><Message>The specified MIME type is not valid.</Message></Error>');
          return;
        }
      }
      // A PUT to an existing key REPLACES it, which is what makes a stopped
      // restore safe to run again. The Map does that by construction.
      store.set(key, body);
      types.get(bucket).set(key, String(request.headers["content-type"] || "application/octet-stream").split(";")[0].trim());
      response.writeHead(200, { etag: `"${createHash("md5").update(body).digest("hex")}"` });
      response.end();
      return;
    }

    if (request.method === "GET" || request.method === "HEAD") {
      const bytes = store.get(key);
      if (!bytes) {
        response.writeHead(404, { "content-type": "application/xml" });
        response.end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>');
        return;
      }
      response.writeHead(200, {
        "content-length": String(bytes.length),
        etag: `"${createHash("md5").update(bytes).digest("hex")}"`,
        // The type it was stored with, so a backup reading this can record
        // what each file actually is -- which is the half of the drill's fault
        // that lives in the backup rather than in the restore.
        "content-type": types.get(bucket)?.get(key) || "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : bytes);
      return;
    }

    response.writeHead(405, { "content-type": "application/xml" });
    response.end('<?xml version="1.0"?><Error><Code>MethodNotAllowed</Code></Error>');
  }

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  return {
    endpoint: `http://127.0.0.1:${port}`,
    region,
    calls,
    // The harness reaches into the buckets directly, because seeding and
    // tampering are its business and not something the HTTP surface should
    // offer.
    seed(bucket, key, bytes, contentType = "application/octet-stream") {
      if (!content.has(bucket)) content.set(bucket, new Map());
      if (!types.has(bucket)) types.set(bucket, new Map());
      content.get(bucket).set(key, Buffer.from(bytes));
      types.get(bucket).set(key, contentType);
    },
    objects(bucket) {
      return content.get(bucket) || new Map();
    },
    typeOf(bucket, key) {
      return types.get(bucket)?.get(key);
    },
    async stop() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
