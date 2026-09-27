#!/usr/bin/env node
// .github/ai-team/record.mjs -- runs straight after every AI step, even when
// the AI step failed (if: always()). No AI.
//
// Saves the run's record into one folder, ready to upload as an artifact:
//   execution.json  every message of the run, with secrets replaced by [REDACTED]
//   proposal.json   the filled-in form (structured output), or null
//   change.patch    (builder and fixer only) the diff, taken by THIS script
//                   from the agent's copy -- never a diff the agent wrote
//   stats.json      turns, cost, commands run, and whether anything was redacted
//
//   node .github/ai-team/record.mjs --out DIR [--patch-from WORK_DIR --git-dir PRISTINE_GIT --base SHA]
//
// Environment: EXEC_FILE (from the action), STRUCTURED_OUTPUT (from the
// action), and the secrets to scrub: ANTHROPIC_API_KEY, GITHUB_TOKEN, and any
// variable whose name starts with REDACT_.

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { parseExecution, redact, summary, notice, args } from "./lib.mjs";

// Empty files Claude Code's sandbox was seen to leave at the top of the copy.
const SANDBOX_PLACEHOLDERS = new Set([".gitmodules", ".npmrc", ".yarnrc", ".yarnrc.yml", "bunfig.toml", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);

const a = args();
const out = a.out;
if (!out || out === "true") {
  console.error("usage: record.mjs --out DIR [--patch-from WORK_DIR --git-dir PRISTINE_GIT --base SHA]");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const secrets = [process.env.ANTHROPIC_API_KEY, process.env.GITHUB_TOKEN, process.env.GH_TOKEN]
  .concat(Object.entries(process.env).filter(([k]) => k.startsWith("REDACT_")).map(([, v]) => v))
  .filter(Boolean);

const stats = { execution_file: "missing", redacted_in_execution: false, redacted_in_patch: false };

// 1. The execution file.
const execPath = process.env.EXEC_FILE || join(process.env.RUNNER_TEMP ?? "", "claude-execution-output.json");
if (execPath && existsSync(execPath)) {
  const raw = readFileSync(execPath, "utf8");
  const clean = redact(raw, secrets);
  stats.redacted_in_execution = clean !== raw;
  writeFileSync(join(out, "execution.json"), clean);
  try {
    const e = parseExecution(JSON.parse(clean));
    Object.assign(stats, {
      execution_file: "present",
      finished: e.finished,
      subtype: e.subtype,
      is_error: e.isError,
      turns: e.turns,
      cost_usd: e.costUsd,
      permission_denials: e.permissionDenials,
      bash_commands: e.bash.map((b) => b.command.slice(0, 200)),
    });
  } catch (err) {
    stats.execution_file = `unreadable: ${err.message}`;
  }
}

// 2. The form. Stored exactly as returned; the harness validates it later.
let proposal = null;
if (process.env.STRUCTURED_OUTPUT) {
  try {
    proposal = JSON.parse(redact(process.env.STRUCTURED_OUTPUT, secrets));
  } catch {
    proposal = { unreadable: true };
  }
}
writeFileSync(join(out, "proposal.json"), JSON.stringify(proposal, null, 2));

// 3. The diff, taken by plain git from the agent's copy.
//
// The agent could have edited its own copy's .git folder (its settings can
// make git run commands). So we never use it: git runs with a PRISTINE .git
// folder, checked out before the agent started and kept outside its reach,
// looking at the agent's files only as a work tree.
if (a["patch-from"] && a["patch-from"] !== "true") {
  const dir = a["patch-from"];
  const base = a.base;
  const gitDir = a["git-dir"];
  if (!base || base === "true") throw new Error("--base SHA is required with --patch-from");
  if (!gitDir || gitDir === "true") throw new Error("--git-dir PRISTINE/.git is required with --patch-from");
  // git gets the normal environment (Windows needs variables such as
  // SystemRoot) minus anything secret and minus every GIT_* variable (those
  // can carry settings too), and ignores all but the pristine repository's
  // own settings.
  const gitEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (!/TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL|^REDACT_|^INPUT_|^ACTIONS_|^GIT_/i.test(k)) gitEnv[k] = v;
  }
  // An empty settings file and an empty hooks folder: plain files, so this
  // works the same on Linux, macOS and Windows (Git for Windows cannot open
  // the Windows null device as a settings file).
  const blank = mkdtempSync(join(tmpdir(), "ai-team-git-"));
  const emptyConfig = join(blank, "empty.gitconfig");
  const emptyHooks = join(blank, "no-hooks");
  writeFileSync(emptyConfig, "");
  mkdirSync(emptyHooks);
  Object.assign(gitEnv, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: emptyConfig, GIT_TERMINAL_PROMPT: "0" });
  const g = (...argv) =>
    execFileSync("git", ["-c", `core.hooksPath=${emptyHooks}`, "-c", "core.fsmonitor=false", `--git-dir=${gitDir}`, `--work-tree=${dir}`, ...argv], {
      maxBuffer: 50 * 1024 * 1024,
      env: gitEnv,
    });
  const exclude = ["ai-input/", "pr-head/", "node_modules/"];
  writeFileSync(join(gitDir, "info", "exclude"), `${exclude.join("\n")}\n`);
  // Claude Code's sandbox leaves EMPTY placeholder files for config files it
  // protects (seen in rehearsal: .gitmodules, .npmrc, lock files...). Only
  // files that are new, at the top of the copy, on this list AND empty are
  // left out of the diff -- and each one is reported. Anything with content
  // still lands in the diff, where the path allow-list refuses it. Leaving a
  // file out cannot reach a pull request: the harness applies only the diff.
  const untracked = g("ls-files", "--others", "--exclude-standard", "-z").toString().split("\0").filter(Boolean);
  const ignored = untracked.filter((p) => SANDBOX_PLACEHOLDERS.has(p) && statSync(join(dir, p)).size === 0);
  if (ignored.length) {
    writeFileSync(join(gitDir, "info", "exclude"), `${exclude.concat(ignored.map((p) => `/${p}`)).join("\n")}\n`);
    notice("Run record", `left out of the diff: empty sandbox placeholder file(s) ${ignored.join(", ")}`);
  }
  stats.ignored_placeholders = ignored;
  g("add", "-A");
  const patch = g("diff", "--cached", "--binary", base).toString();
  const clean = redact(patch, secrets);
  // A secret inside the diff means the change itself contains a secret. The
  // redacted patch will no longer apply, and the harness refuses it.
  stats.redacted_in_patch = clean !== patch;
  writeFileSync(join(out, "change.patch"), clean);
  stats.patch_bytes = clean.length;
}

writeFileSync(join(out, "stats.json"), JSON.stringify(stats, null, 2));
summary(
  `Run record: execution file **${stats.execution_file}**, turns ${stats.turns ?? "?"}, ` +
    `cost $${(stats.cost_usd ?? 0).toFixed(4)}, commands ${stats.bash_commands?.length ?? 0}` +
    (stats.redacted_in_execution ? ", **a secret was redacted from the record**" : "") +
    (stats.redacted_in_patch ? ", **a secret was found in the diff**" : ""),
);
