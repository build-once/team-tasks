#!/usr/bin/env node
// scripts/check-workflows.mjs
//
// What it does, in plain English:
//   Reads every GitHub Actions workflow in .github/workflows/ and checks that
//   EVERY job has
//     1. its own "permissions:" block (least privilege for the job token), and
//     2. a "timeout-minutes:" limit (so a stuck job cannot run forever).
//   It also refuses "permissions: write-all", and warns (does not fail) when a
//   third-party action is not pinned to a full 40-character commit SHA.
//
// Exit codes:  0 = all good   1 = problems found   2 = could not check anything
//
// Zero dependencies. It reads YAML line by line, so it expects the ordinary
// block style GitHub documents (2-space indents). It is a safety net, not a
// full YAML parser.
//
// Usage:  node scripts/check-workflows.mjs [repo-folder]    (default: current folder)
// Run the built-in self-test with:  node scripts/check-workflows.mjs --selftest

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Optional first argument: the repository folder to check (default: the current folder).
const REPO_ARG = process.argv.slice(2).find((a) => !a.startsWith("--"));
const WORKFLOW_DIR = join(REPO_ARG || ".", ".github", "workflows");

export function checkWorkflowText(text, fileName = "workflow.yml") {
  const problems = [];
  const warnings = [];
  const lines = text.split(/\r?\n/);

  // Find the top-level "jobs:" line.
  const jobsIdx = lines.findIndex((l) => /^jobs:\s*(#.*)?$/.test(l));
  if (jobsIdx === -1) {
    problems.push(`${fileName}: no top-level "jobs:" found`);
    return { problems, warnings, jobCount: 0 };
  }

  // Collect job blocks: a job starts at a 2-space-indented key.
  const jobs = [];
  for (let i = jobsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line) && !/^#/.test(line)) break; // next top-level key
    const m = /^  ([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(line);
    if (m) jobs.push({ name: m[1], start: i, body: [] });
    else if (jobs.length) jobs[jobs.length - 1].body.push(line);
  }

  for (const job of jobs) {
    const body = job.body;
    const has = (re) => body.some((l) => re.test(l));
    const isReusableCall = has(/^    uses:\s*\S/);
    if (!has(/^    permissions:/)) {
      problems.push(`${fileName}: job "${job.name}" has no "permissions:" block`);
    }
    if (has(/^    permissions:\s*write-all\b/)) {
      problems.push(`${fileName}: job "${job.name}" uses "permissions: write-all"`);
    }
    // A job that calls a reusable workflow cannot set timeout-minutes itself;
    // the called workflow must set it on its own jobs.
    if (!isReusableCall && !has(/^    timeout-minutes:\s*\S/)) {
      problems.push(`${fileName}: job "${job.name}" has no "timeout-minutes:"`);
    }
    for (const l of body) {
      const u = /^\s*(?:-\s+)?uses:\s*([^\s#]+)/.exec(l);
      if (!u) continue;
      const ref = u[1];
      if (ref.startsWith("./") || ref.startsWith("docker://")) continue;
      const at = ref.split("@")[1] || "";
      if (!/^[0-9a-f]{40}$/.test(at)) {
        warnings.push(`${fileName}: job "${job.name}" uses ${ref} -- not pinned to a full commit SHA`);
      }
    }
  }
  if (jobs.length === 0) problems.push(`${fileName}: "jobs:" has no jobs under it`);
  return { problems, warnings, jobCount: jobs.length };
}

function runOnRepo() {
  if (!existsSync(WORKFLOW_DIR)) {
    console.error(`UNVERIFIED -- ${WORKFLOW_DIR} not found. Run this from the repository root, or pass the repository folder as the first argument.`);
    return 2;
  }
  const files = readdirSync(WORKFLOW_DIR).filter((f) => /\.ya?ml$/.test(f));
  // An empty scan is not a clean result: checking zero files proves nothing.
  if (files.length === 0) {
    console.error(`UNVERIFIED -- no .yml/.yaml files in ${WORKFLOW_DIR}; nothing was checked.`);
    return 2;
  }
  let problems = [];
  let warnings = [];
  let jobTotal = 0;
  for (const f of files) {
    const r = checkWorkflowText(readFileSync(join(WORKFLOW_DIR, f), "utf8"), f);
    problems = problems.concat(r.problems);
    warnings = warnings.concat(r.warnings);
    jobTotal += r.jobCount;
  }
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const p of problems) console.log(`FAIL  ${p}`);
  console.log(`Checked ${files.length} workflow file(s), ${jobTotal} job(s): ${problems.length} problem(s), ${warnings.length} warning(s).`);
  if (jobTotal === 0) {
    console.error("UNVERIFIED -- found workflow files but zero jobs; the checker may be misreading them.");
    return 2;
  }
  return problems.length ? 1 : 0;
}

function selftest() {
  const good = [
    "on: push",
    "permissions: {}",
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-latest",
    "    timeout-minutes: 5",
    "    permissions:",
    "      contents: read",
    "    steps:",
    "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
    "",
  ].join("\n");
  const cases = [
    { name: "good workflow passes", text: good, problems: 0, warnings: 0 },
    { name: "missing timeout fails", text: good.replace("    timeout-minutes: 5\n", ""), problems: 1 },
    { name: "missing permissions fails", text: good.replace("    permissions:\n      contents: read\n", ""), problems: 1 },
    { name: "write-all fails", text: good.replace("    permissions:\n      contents: read\n", "    permissions: write-all\n"), problems: 1 },
    { name: "tag-pinned action warns", text: good.replace(/@[0-9a-f]{40}/, "@v7"), problems: 0, warnings: 1 },
    { name: "no jobs fails", text: "on: push\njobs:\n", problems: 1 },
    { name: "reusable workflow call needs no timeout", text: "jobs:\n  call:\n    permissions:\n      contents: read\n    uses: ./.github/workflows/other.yml\n", problems: 0 },
  ];
  let failed = 0;
  for (const c of cases) {
    const r = checkWorkflowText(c.text, "fixture.yml");
    const okP = r.problems.length === c.problems;
    const okW = c.warnings === undefined || r.warnings.length === c.warnings;
    const ok = okP && okW;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name} (problems=${r.problems.length}, warnings=${r.warnings.length})`);
  }
  console.log(`Self-test: ${cases.length - failed}/${cases.length} cases passed.`);
  return failed ? 1 : 0;
}

const code = process.argv.includes("--selftest") ? selftest() : runOnRepo();
process.exit(code);
