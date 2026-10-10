// scripts/backup/s3.mjs
//
// The four S3 operations the nightly copy needs, over `fetch`, signed with
// scripts/backup/lib.mjs' SigV4. No dependency, and no AWS SDK: both stores
// speak the same four verbs and the whole of what is needed is below.
//
// Both ends of the job use this one file, which is the point: the read from
// Supabase Storage and the write to Cloudflare R2 are the same code with
// different settings, so the proof exercising one exercises the other.
//
// Operations, and that both services implement them, read 2026-10-10:
//   * Supabase -- ListObjectsV2, GetObject, HeadObject and PutObject are all
//     marked implemented: https://supabase.com/docs/guides/storage/s3/compatibility
//   * Cloudflare R2 -- the same four are listed, with the note that "it is
//     recommended that you use `ListObjectsV2` instead when developing
//     applications": https://developers.cloudflare.com/r2/api/s3/api/
//
// WHAT IT NEVER PRINTS. Nothing. This file does not log at all: every message
// a run produces comes from the scripts that call it, which print names, counts
// and statuses. An error thrown here carries the HTTP status and the operation
// and never a response body -- a Storage error body can quote the key it was
// asked for, and a key is `<task id>/<file name>`, which docs/plan.md puts on
// the list of things that must never reach a log.

import { createHash } from "node:crypto";
import { signRequest, encodeS3Key, sha256 } from "./lib.mjs";

const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");

export class Store {
  constructor({ endpoint, region, bucket, accessKeyId, secretAccessKey, label }) {
    for (const [name, value] of Object.entries({ endpoint, region, bucket, accessKeyId, secretAccessKey })) {
      if (!value) throw new Error(`the ${label || "store"} is missing its ${name}`);
    }
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.region = region;
    this.bucket = bucket;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.label = label || "store";
  }

  url(key, search) {
    const path = key === "" ? `${this.endpoint}/${this.bucket}` : `${this.endpoint}/${this.bucket}/${encodeS3Key(key)}`;
    const url = new URL(path);
    for (const [k, v] of Object.entries(search || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    return url;
  }

  async send({ method, key = "", search, body, headers = {}, expect = [200] }) {
    const url = this.url(key, search);
    const payloadSha256 = body ? sha256(body) : EMPTY_SHA256;
    const signed = signRequest({
      method,
      url: url.toString(),
      region: this.region,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      payloadSha256,
      headers: body ? { ...headers, "content-length": String(body.length) } : headers,
      date: new Date(),
    });
    const response = await fetch(url, { method, headers: signed, body: body ?? undefined });
    if (!expect.includes(response.status)) {
      // The body is read and discarded so the socket is freed, and is never
      // put in the message. See the header of this file.
      await response.arrayBuffer().catch(() => undefined);
      throw new Error(`${this.label}: ${method} answered HTTP ${response.status}. No response body is printed.`);
    }
    return response;
  }

  // ListObjectsV2, following continuation tokens. Returns [{ key, bytes }].
  async list(prefix = "") {
    const found = [];
    let token;
    for (let page = 0; page < 1000; page++) {
      const response = await this.send({
        method: "GET",
        search: { "list-type": 2, prefix, "max-keys": 1000, "continuation-token": token },
      });
      const xml = await response.text();
      for (const block of xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || []) {
        const key = /<Key>([\s\S]*?)<\/Key>/.exec(block);
        const size = /<Size>(\d+)<\/Size>/.exec(block);
        if (key && size) found.push({ key: unescapeXml(key[1]), bytes: Number(size[1]) });
      }
      const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
      const next = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml);
      if (!truncated || !next) return found;
      token = unescapeXml(next[1]);
    }
    throw new Error(`${this.label}: list did not finish in 1000 pages`);
  }

  async get(key) {
    const response = await this.send({ method: "GET", key });
    return Buffer.from(await response.arrayBuffer());
  }

  async put(key, body, { contentType = "application/octet-stream" } = {}) {
    const response = await this.send({ method: "PUT", key, body, headers: { "content-type": contentType } });
    return { etag: stripQuotes(response.headers.get("etag")) };
  }

  async head(key) {
    const response = await this.send({ method: "HEAD", key });
    return {
      bytes: Number(response.headers.get("content-length")),
      etag: stripQuotes(response.headers.get("etag")),
    };
  }
}

export function stripQuotes(value) {
  return typeof value === "string" ? value.replace(/^(?:W\/)?"|"$/g, "") : value;
}

export function unescapeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}
