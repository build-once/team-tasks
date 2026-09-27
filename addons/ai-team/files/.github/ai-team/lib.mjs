// .github/ai-team/lib.mjs
//
// Shared helpers for the AI team's HARNESS: the plain, non-AI code that checks
// what an agent proposed and does all the writing. Nothing in this folder calls
// an AI. Zero dependencies; Node 20 or newer.
//
// Everything that decides something is a pure function (easy to test in
// selftest.mjs). Everything that talks to GitHub goes through api() below.

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));

// True when a script is run directly (not imported by the self-test).
export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && metaUrl === pathToFileURL(process.argv[1]).href;
}

// Runs a script's main() and turns any error into exit code 1 with a message.
export function run(metaUrl, main, label) {
  if (!isMain(metaUrl)) return;
  main().catch((e) => {
    console.error(`${label} failed: ${e.message}`);
    process.exit(1);
  });
}

// ---------------------------------------------------------------- config

export function loadConfig(path = join(HERE, "config.json")) {
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  if (cfg.version !== 1) throw new Error(`config.json: unsupported version ${cfg.version}`);
  return cfg;
}

// ---------------------------------------------------------------- the switch

const LEVEL = { off: 0, shadow: 1, on: 2 };

// Exactly "off", "shadow" or "on". Anything else -- missing, empty, "Shadow",
// " on", "true" -- is off. No trimming, no lower-casing: a switch that guesses
// what you meant is not a switch.
export function parseMode(value) {
  return Object.prototype.hasOwnProperty.call(LEVEL, value ?? "") ? value : "off";
}

// The master switch always wins downwards. A per-agent switch can only make an
// agent MORE cautious than the master switch, never less. If the per-agent
// switch is not set at all, the agent follows the master switch.
export function effectiveMode(teamValue, agentValue) {
  const team = parseMode(teamValue);
  if (agentValue === undefined || agentValue === "") return team;
  const agent = parseMode(agentValue);
  return LEVEL[agent] < LEVEL[team] ? agent : team;
}

// ---------------------------------------------------------------- execution file

// The Claude Code GitHub Action writes every message of the run to one JSON
// array (the "execution file"). This reads the facts the harness and the
// watchdog need from it: what really happened, not what the agent said.
export function parseExecution(messages) {
  if (!Array.isArray(messages)) throw new Error("execution file is not a JSON array");
  const toolUses = [];
  const results = new Map();
  let result = null;
  for (const m of messages) {
    if (m?.type === "assistant") {
      for (const c of m.message?.content ?? []) {
        if (c?.type === "tool_use") toolUses.push({ id: c.id, name: c.name, input: c.input ?? {} });
      }
    } else if (m?.type === "user") {
      const content = m.message?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type === "tool_result") results.set(c.tool_use_id, Boolean(c.is_error));
        }
      }
    } else if (m?.type === "result") {
      result = m;
    }
  }
  const bash = toolUses
    .filter((t) => t.name === "Bash")
    .map((t) => ({ command: String(t.input.command ?? ""), isError: results.get(t.id) ?? null }));
  return {
    finished: result !== null,
    subtype: result?.subtype ?? "missing",
    isError: result ? Boolean(result.is_error) : true,
    turns: Number(result?.num_turns ?? 0),
    costUsd: Number(result?.total_cost_usd ?? 0),
    permissionDenials: Array.isArray(result?.permission_denials) ? result.permission_denials.length : 0,
    toolNames: toolUses.map((t) => t.name),
    bash,
  };
}

// Did the run really execute a required command (e.g. the tests)?
// Returns the matching commands, so the report can show them.
export function findCommands(exec, patterns) {
  const res = patterns.map((p) => new RegExp(p));
  return exec.bash.filter((b) => res.some((re) => re.test(b.command.trim())));
}

// ---------------------------------------------------------------- patches

// Reads a unified diff made by `git diff --binary` into one entry per file.
export function parsePatch(text) {
  const files = [];
  let cur = null;
  for (const line of text.split("\n")) {
    const head = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (head) {
      cur = { path: head[2], oldPath: head[1], status: "modified", binary: false, added: [], removed: [] };
      files.push(cur);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith("new file mode")) cur.status = "added";
    else if (line.startsWith("deleted file mode")) cur.status = "deleted";
    else if (line.startsWith("rename from ")) cur.status = "renamed";
    else if (line.startsWith("GIT binary patch") || line.startsWith("Binary files ")) cur.binary = true;
    else if (line.startsWith("+++") || line.startsWith("---")) continue;
    else if (line.startsWith("+")) cur.added.push(line.slice(1));
    else if (line.startsWith("-")) cur.removed.push(line.slice(1));
  }
  return files;
}

// Every path a patch touches, including the old name of a renamed file.
export function patchPaths(files) {
  const set = new Set();
  for (const f of files) {
    set.add(f.path);
    if (f.oldPath !== f.path) set.add(f.oldPath);
  }
  return [...set].sort();
}

// ---------------------------------------------------------------- paths

// Minimal glob: "**" crosses folders, "*" stays inside one folder.
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

export function matchesAny(path, globs) {
  return globs.some((g) => globToRegExp(g).test(path));
}

// Risk tier from the files that REALLY changed. The highest tier wins. A file
// that matches no rule is high, and so is an empty rule list: when unsure,
// assume the worst.
export function riskTier(paths, rules) {
  const order = { low: 0, medium: 1, high: 2 };
  if (!Array.isArray(rules) || rules.length === 0) return "high";
  let tier = "low";
  for (const p of paths) {
    let best = null;
    for (const r of rules) {
      if (matchesAny(p, r.paths) && (best === null || order[r.tier] > order[best])) best = r.tier;
    }
    const t = best ?? "high";
    if (order[t] > order[tier]) tier = t;
  }
  return tier;
}

// ---------------------------------------------------------------- tests and assertions

const ASSERTION_RE = /\b(?:expect|assert)\b|\.(?:toBe|toEqual|toStrictEqual|toMatch|toThrow|toContain|toHaveLength|toHaveBeenCalled)\w*\s*\(|\bt\.(?:is|not|equal|deepEqual|ok|true|false|throws)\s*\(/;
const SKIP_RE = /\.(?:skip|only|todo)\s*\(|\b(?:xit|xdescribe|xtest)\s*\(|\{\s*skip\s*:\s*(?!false)|\btest\.skip\b|\bit\.skip\b/;

// Finds every way a patch makes the tests EASIER: a test file deleted, an
// assertion removed or changed, or a test skipped. Adding new assertions is
// always fine. Returns a list of plain-English problems (empty = none).
export function assertionProblems(files, testGlobs) {
  const problems = [];
  for (const f of files) {
    if (!matchesAny(f.path, testGlobs) && !matchesAny(f.oldPath, testGlobs)) continue;
    if (f.status === "deleted") { problems.push(`${f.path}: test file deleted`); continue; }
    const added = new Set(f.added.map((l) => l.trim()));
    for (const line of f.removed) {
      if (ASSERTION_RE.test(line) && !added.has(line.trim())) {
        problems.push(`${f.path}: assertion removed or changed: ${line.trim().slice(0, 120)}`);
      }
    }
    for (const line of f.added) {
      if (SKIP_RE.test(line)) problems.push(`${f.path}: test skipped: ${line.trim().slice(0, 120)}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------- the proposal check

// The core harness check for any agent that proposes a code change (builder
// and fixer). Pure: every fact is passed in, nothing is fetched.
//
//   patchText       the diff the harness itself took from the agent's copy
//   declaredFiles   the files the agent SAID it changed (structured output)
//   allowedPaths    folders this agent may change
//   protectedPaths  never changeable by any agent, even if allowed above
//   baseSha / currentSha   the commit the agent started from, and main (or the
//                   branch) now. Different means stale.
//   exec            parseExecution() of the run, or null if the file is missing
//   requiredCommands  regexes of commands that must appear in exec
//   assertions      "refuse" (fixer) or "raise-tier" (builder)
export function checkProposal(p) {
  const reasons = [];
  const files = parsePatch(p.patchText ?? "");
  const paths = patchPaths(files);
  if (paths.length === 0) reasons.push("the proposal changes nothing");

  const declared = [...new Set(p.declaredFiles ?? [])].sort();
  const missing = paths.filter((x) => !declared.includes(x));
  const extra = declared.filter((x) => !paths.includes(x));
  if (missing.length) reasons.push(`changed but not declared: ${missing.join(", ")}`);
  if (extra.length) reasons.push(`declared but not changed: ${extra.join(", ")}`);

  for (const x of paths) {
    if (matchesAny(x, p.protectedPaths ?? [])) reasons.push(`protected path: ${x}`);
    else if (!matchesAny(x, p.allowedPaths ?? [])) reasons.push(`outside the path allow-list: ${x}`);
  }
  for (const f of files) if (f.binary) reasons.push(`binary file not allowed: ${f.path}`);

  if (!p.baseSha || !p.currentSha) reasons.push("cannot tell whether the base is stale (missing commit)");
  else if (p.baseSha !== p.currentSha) reasons.push(`stale base: started from ${p.baseSha.slice(0, 7)}, now ${p.currentSha.slice(0, 7)}`);

  let evidence = [];
  if (!p.exec) reasons.push("execution file missing: cannot prove what the agent did");
  else {
    evidence = findCommands(p.exec, p.requiredCommands ?? []);
    if ((p.requiredCommands ?? []).length && evidence.length === 0) {
      reasons.push(`required command never ran (looked for: ${p.requiredCommands.join(" | ")})`);
    }
  }

  const assertion = assertionProblems(files, p.testPaths ?? []);
  let tier = riskTier(paths, p.riskTiers);
  if (assertion.length) {
    if (p.assertions === "refuse") reasons.push(...assertion);
    else tier = "high";
  }

  return { ok: reasons.length === 0, reasons, paths, tier, evidence, assertion };
}

// ---------------------------------------------------------------- safe text

// Text written by an agent (or a stranger) must never become a mention, a link,
// an image or HTML when the harness posts it. Keeps it short, too.
export function safeText(s, max = 300) {
  let t = String(s ?? "").replace(/[\r\n\t]+/g, " ").trim();
  if (t.length > max) t = `${t.slice(0, max - 1)}…`;
  return t
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/`/g, "'")
    .replace(/@/g, "@\u200b")
    .replace(/!\[/g, "! [")
    .replace(/\]\(/g, "] (")
    .replace(/:\/\//g, ":/\u200b/");
}

// Replaces secrets with [REDACTED] before a record is stored. Exact values
// (passed in by the workflow) plus the shapes of common keys and tokens.
export function redact(text, exactValues = []) {
  let out = String(text);
  for (const v of exactValues) {
    if (typeof v === "string" && v.length >= 8) out = out.split(v).join("[REDACTED]");
  }
  return out
    .replace(/sk-ant-[A-Za-z0-9_-]{10,}/g, "[REDACTED]")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "[REDACTED]")
    .replace(/x-access-token:[^@\s"]+@/g, "x-access-token:[REDACTED]@");
}

// ---------------------------------------------------------------- tiny JSON-schema check

// Enough of JSON Schema for the forms in schemas/: object, array, string,
// integer, boolean, null, enum, required, maxItems, maxLength,
// additionalProperties:false. Returns a list of problems (empty = valid).
export function validate(value, schema, at = "form") {
  const errs = [];
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
  if (types.length) {
    const t = typeOf(value);
    const ok = types.some((x) => x === t || (x === "number" && (t === "integer" || t === "number")));
    if (!ok) return [`${at}: expected ${types.join("|")}, got ${t}`];
  }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${at}: ${JSON.stringify(value)} is not one of ${schema.enum.join(", ")}`);
  if (typeof value === "string" && schema.maxLength && value.length > schema.maxLength) errs.push(`${at}: longer than ${schema.maxLength}`);
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) errs.push(`${at}: below ${schema.minimum}`);
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errs.push(`${at}: more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => errs.push(...validate(v, schema.items, `${at}[${i}]`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const k of schema.required ?? []) if (!(k in value)) errs.push(`${at}.${k}: missing`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties?.[k]) errs.push(...validate(v, schema.properties[k], `${at}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${at}.${k}: not allowed`);
    }
  }
  return errs;
}

export function loadSchema(name) {
  return JSON.parse(readFileSync(join(HERE, "schemas", `${name}.json`), "utf8"));
}

// The copy of a schema handed to the model: the same boxes, without the size
// and range limits, which not every structured-output engine accepts. The
// harness still enforces the limits with validate() on the full schema.
export function modelSchema(schema) {
  const DROP = new Set(["minimum", "maximum", "maxLength", "minLength", "maxItems", "minItems"]);
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o = {};
      for (const [k, x] of Object.entries(v)) if (!DROP.has(k)) o[k] = walk(x);
      return o;
    }
    return v;
  };
  return walk(schema);
}

// ---------------------------------------------------------------- GitHub

// Minimal GitHub REST client. The token comes from the environment and is
// never printed. The caller decides which token: the read-only job token, or
// the team app's short-lived token for writes.
export function github({ token = process.env.GH_TOKEN, repo = process.env.GITHUB_REPOSITORY, apiUrl = process.env.GITHUB_API_URL || "https://api.github.com" } = {}) {
  if (!token) throw new Error("GH_TOKEN is not set");
  async function api(method, path, body) {
    const url = path.startsWith("http") ? path : `${apiUrl}${path.replace("{repo}", repo)}`;
    const res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "build-once-ai-team",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const text = await res.text();
    if (!res.ok) throw new Error(`GitHub ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }
  async function paginate(path, max = 1000) {
    const out = [];
    for (let page = 1; out.length < max; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const batch = await api("GET", `${path}${sep}per_page=100&page=${page}`);
      const items = Array.isArray(batch) ? batch : batch?.workflow_runs ?? batch?.artifacts ?? batch?.jobs ?? [];
      out.push(...items);
      if (items.length < 100) break;
    }
    return out;
  }
  // "admin" | "maintain" | "write" | "triage" | "read" | "none"
  async function permissionOf(login) {
    try {
      const r = await api("GET", `/repos/{repo}/collaborators/${encodeURIComponent(login)}/permission`);
      return r?.role_name || r?.permission || "none";
    } catch {
      return "none";
    }
  }
  return { api, paginate, permissionOf, repo };
}

export const CAN_WRITE = new Set(["admin", "maintain", "write"]);

// ---------------------------------------------------------------- Actions plumbing

export function setOutput(name, value) {
  const line = `${name}=${value}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, line);
  else process.stdout.write(`[output] ${line}`);
}

export function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  console.log(markdown);
}

// A one-line verdict shown at the top of the run page, and readable through
// the GitHub API (check-run annotations) without downloading any logs.
// Escaped so text from a proposal can never start a new workflow command.
export function workflowCommandText(s) {
  return String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/:/g, "%3A").replace(/,/g, "%2C");
}
export function notice(title, text) {
  const msg = String(text).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").slice(0, 900);
  console.log(`::notice title=${workflowCommandText(title)}::${msg}`);
}

export function readJsonIfPresent(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

export function args(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    out[k] = v;
  }
  return out;
}
