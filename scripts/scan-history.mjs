#!/usr/bin/env node
// scripts/scan-history.mjs
//
// Scans EVERY blob in the whole git history -- every version of every file that
// was ever committed, on every branch -- for things that look like credentials.
// A secret deleted in a later commit is still in the history, and still leaked.
//
// This is a second pair of eyes, not a replacement for gitleaks. CI runs
// gitleaks on every pull request (.github/workflows/ci.yml, "Secret scan"), and
// .githooks/pre-commit runs it before each commit. This script needs no
// installation at all, so it works on a machine where gitleaks is not present.
//
// It NEVER prints a secret. Findings show the kind, the file, the commits and a
// masked preview: the first few characters and the length, nothing more.
//
// Usage:  node scripts/scan-history.mjs
// Exit:   0 = nothing that looks real   1 = something to look at

import { spawnSync } from "node:child_process";

const MAX_BLOB_BYTES = 2_000_000;

// Each rule: what it is, and how to spot it. Ordered most specific first.
const RULES = [
  { kind: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "Stripe live secret key", re: /\bsk_live_[0-9A-Za-z]{10,}/g },
  { kind: "Stripe test secret key", re: /\bsk_test_[0-9A-Za-z]{10,}/g },
  { kind: "GitHub token", re: /\bgh[pousr]_[0-9A-Za-z]{20,}/g },
  { kind: "GitHub fine-grained token", re: /\bgithub_pat_[0-9A-Za-z_]{40,}/g },
  { kind: "Google API key", re: /\bAIza[0-9A-Za-z\-_]{30,}/g },
  { kind: "Slack token", re: /\bxox[baprs]-[0-9A-Za-z-]{10,}/g },
  { kind: "Supabase secret key", re: /\bsb_secret_[0-9A-Za-z_-]{10,}/g },
  { kind: "Supabase publishable key", re: /\bsb_publishable_[0-9A-Za-z_-]{10,}/g },
  { kind: "JSON web token", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { kind: "Private key block", re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { kind: "Database URL with a password", re: /\bpostgres(?:ql)?:\/\/[^:\s"']+:[^@\s"']+@/gi },
  { kind: "Password assignment", re: /\b(?:password|passwd|pwd)\s*[=:]\s*["'][^"'\s]{6,}["']/gi },
  { kind: "Secret assignment", re: /\b(?:secret|token|api[_-]?key)[A-Za-z_]*\s*[=:]\s*["'][A-Za-z0-9_\-./+]{16,}["']/gi },
];

// Text that is meant to be seen: placeholders, examples, test fixtures. A hit
// containing one of these is reported, but marked as not real.
const PLACEHOLDER = /replace[-_ ]?me|placeholder|your[-_]|example\.com|example\.supabase|example\.io|changeme|<[^>]+>|xxx+|\.\.\.|test[-_]?key|dummy|fake|sample|REDACTED/i;

// A connection string pointing at this machine is not a leaked credential.
const LOCAL_ONLY = /localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal/i;

function git(args, opts = {}) {
  const r = spawnSync("git", args, { encoding: "buffer", maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0 && !opts.allowFail) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr?.toString()}`);
  }
  return r;
}

function mask(value) {
  const head = value.slice(0, 4).replace(/\s/g, "");
  return `${head}… (${value.length} characters)`;
}

// Every blob that has ever existed, with the path it was stored under.
const listed = git(["rev-list", "--objects", "--all"]).stdout.toString("utf8");
const blobs = new Map(); // sha -> Set(paths)
for (const line of listed.split("\n")) {
  const space = line.indexOf(" ");
  if (space === -1) continue; // a commit or a tree, not a file
  const sha = line.slice(0, space);
  const path = line.slice(space + 1).trim();
  if (!path) continue;
  if (!blobs.has(sha)) blobs.set(sha, new Set());
  blobs.get(sha).add(path);
}

const findings = [];
let scanned = 0;
let skipped = 0;

for (const [sha, paths] of blobs) {
  const type = git(["cat-file", "-t", sha], { allowFail: true }).stdout.toString().trim();
  if (type !== "blob") continue;

  const raw = git(["cat-file", "blob", sha], { allowFail: true }).stdout;
  if (!raw || raw.length === 0) continue;
  if (raw.length > MAX_BLOB_BYTES || raw.includes(0)) {
    skipped++;
    continue; // too big, or binary
  }
  scanned++;

  const text = raw.toString("utf8");
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text)) !== null) {
      // Judge the whole line, not just the matched characters. A match often
      // stops before the part that gives it away: postgres://user:pw@ looks
      // alarming until you see "example.supabase.co" three characters later.
      const lineStart = text.lastIndexOf("\n", m.index) + 1;
      let lineEnd = text.indexOf("\n", m.index);
      if (lineEnd === -1) lineEnd = text.length;
      const line = text.slice(lineStart, lineEnd);

      findings.push({
        kind: rule.kind,
        sha,
        paths: [...paths],
        preview: mask(m[0]),
        placeholder: PLACEHOLDER.test(m[0]) || PLACEHOLDER.test(line) || LOCAL_ONLY.test(line),
      });
    }
  }
}

// Which commits carry a blob. Only asked for blobs that produced a finding.
const commitsFor = new Map();
for (const f of findings) {
  if (commitsFor.has(f.sha)) continue;
  const out = git(["log", "--all", "--oneline", "--find-object", f.sha], { allowFail: true })
    .stdout.toString("utf8").trim();
  commitsFor.set(f.sha, out ? out.split("\n").map((l) => l.trim()) : ["(no commit found)"]);
}

console.log(`Scanned ${scanned} text blobs from the whole history (${skipped} binary or oversized skipped).`);
console.log(`Distinct blobs seen: ${blobs.size}`);
console.log("");

if (findings.length === 0) {
  console.log("No matches at all.");
  process.exit(0);
}

const real = findings.filter((f) => !f.placeholder);
const placeholders = findings.filter((f) => f.placeholder);

function report(list, heading) {
  if (list.length === 0) return;
  console.log(`=== ${heading}: ${list.length} ===`);
  for (const f of list) {
    console.log(`  kind    : ${f.kind}`);
    console.log(`  file(s) : ${f.paths.join(", ")}`);
    console.log(`  preview : ${f.preview}`);
    console.log(`  commits : ${commitsFor.get(f.sha).join(" | ")}`);
    console.log("");
  }
}

report(real, "LOOKS REAL -- check every one of these");
report(placeholders, "Looks like a placeholder or example");

process.exit(real.length > 0 ? 1 : 0);
