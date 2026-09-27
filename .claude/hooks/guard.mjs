#!/usr/bin/env node
// Build Once: PreToolUse guard hook. Apache-2.0. Zero dependencies, Node 20+.
//
// Behaviour of the Claude Code hooks API that this file relies on, checked against
// the official docs on 2026-09-25:
//   https://code.claude.com/docs/en/hooks        (hooks reference)
//   https://code.claude.com/docs/en/hooks-guide  (hooks guide)
//
//  * Input arrives as JSON on stdin. Common fields include session_id, cwd,
//    hook_event_name, tool_name and tool_input. For Bash, tool_input.command holds
//    the command. For Write and Edit, tool_input.file_path holds the target file.
//  * On Windows, Claude Code can also have a PowerShell tool, next to Bash. It runs
//    commands too, so a rule written for "Bash" covers EVERY shell tool listed in
//    SHELL_TOOLS below. A guard that only watched Bash let PowerShell commands through
//    unchecked; this was found in a live rehearsal on Windows on 2026-09-27.
//    MCP tools are named mcp__<server>__<tool>.
//  * Exit code 2 blocks the tool call, and stderr is fed back to Claude as the
//    reason. The docs say exit 2 blocks "whether or not you print JSON".
//  * Exit 0 with JSON on stdout of the form
//      {"hookSpecificOutput":{"hookEventName":"PreToolUse",
//        "permissionDecision":"allow"|"deny"|"ask","permissionDecisionReason":"..."}}
//    gives structured control. "ask" shows the normal permission prompt to the user.
//  * Exit 0 with no output means "no objection". The normal permission flow still
//    applies, so this hook never grants permission. It only blocks or asks.
//  * IMPORTANT: any other non-zero exit code (for example a Node crash, which is
//    exit 1) does NOT block. It is a "non-blocking error". A hook that times out
//    also does not block. That is why:
//      - this script turns every internal error into exit 2, and has its own
//        short timer; and
//      - .claude/settings.json runs it as  node "$CLAUDE_PROJECT_DIR/..." || exit 2
//        so a missing script or a missing `node` binary also blocks.
//  * ${CLAUDE_PROJECT_DIR} is the project root where the session started. Using it
//    means the hook still resolves after the assistant runs `cd` into a sub-folder.
//  * A PreToolUse deny blocks the tool even in bypassPermissions mode.
//
// Decision order: forbid beats ask, and ask beats allow. Unreadable input, a rules
// file that can't be loaded, a bad rule, or any exception all result in DENY.

import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
// The project root is two folders above this file (.claude/hooks/guard.mjs).
// It is worked out from the script's own absolute location, never from the
// current working directory, so a `cd` cannot move it.
export const ROOT = resolve(dirname(SELF), '..', '..');

const DECISIONS = ['forbid', 'ask', 'allow'];
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
// Every tool that runs a shell command. A rule that lists "Bash" (or "Shell") applies
// to all of them. Add a new shell tool here AND to the matcher in .claude/settings.json.
export const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const PATH_KEYS = new Set(['file_path', 'notebook_path', 'path', 'glob']);
const ALLOWED_FLAGS = /^[imsu]*$/;
const INPUT_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------- rule loading

function expandLocal(pattern, local, ruleId) {
  // {{local:key}} (braces may be written escaped, as \{\{local:key\}\}) is replaced
  // by the regexes listed under that key in
  // guard/local.json. If the key is absent, it becomes (?!), which never matches.
  return pattern.replace(/\\?\{\\?\{local:([A-Za-z0-9_]+)\\?\}\\?\}/g, (_, key) => {
    const list = local[key];
    if (list === undefined) return '(?!)';
    if (!Array.isArray(list) || list.some((s) => typeof s !== 'string' || s === '')) {
      throw new Error(`guard/local.json: "${key}" must be a list of non-empty strings (rule ${ruleId})`);
    }
    if (list.length === 0) return '(?!)';
    for (const s of list) new RegExp(s); // throws on a bad entry
    return '(?:' + list.join('|') + ')';
  });
}

export function loadRules(root = ROOT) {
  const rulesPath = resolve(root, 'guard', 'rules.json');
  const localPath = resolve(root, 'guard', 'local.json');
  const doc = JSON.parse(readFileSync(rulesPath, 'utf8')); // throws if missing
  const rules = Array.isArray(doc) ? doc : doc && doc.rules;
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new Error('guard/rules.json contains no rules');
  }
  let local = {};
  if (existsSync(localPath)) {
    local = JSON.parse(readFileSync(localPath, 'utf8'));
    if (!local || typeof local !== 'object' || Array.isArray(local)) {
      throw new Error('guard/local.json must be a JSON object');
    }
  }
  const seen = new Set();
  return rules.map((r, i) => {
    const where = `rule #${i + 1}`;
    if (!r || typeof r !== 'object') throw new Error(`${where} is not an object`);
    if (typeof r.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(r.id)) throw new Error(`${where} has a bad id`);
    if (seen.has(r.id)) throw new Error(`duplicate rule id ${r.id}`);
    seen.add(r.id);
    if (!DECISIONS.includes(r.decision)) throw new Error(`rule ${r.id}: decision must be forbid, ask or allow`);
    if (!Array.isArray(r.tools) || r.tools.length === 0 || r.tools.some((t) => typeof t !== 'string' || !t)) {
      throw new Error(`rule ${r.id}: tools must be a non-empty list`);
    }
    if (typeof r.pattern !== 'string' || !r.pattern) throw new Error(`rule ${r.id}: missing pattern`);
    if (typeof r.reason !== 'string' || !r.reason) throw new Error(`rule ${r.id}: missing reason`);
    const flags = r.flags === undefined ? 'i' : r.flags;
    if (typeof flags !== 'string' || !ALLOWED_FLAGS.test(flags)) throw new Error(`rule ${r.id}: flags may only use i, m, s, u`);
    const re = new RegExp(expandLocal(r.pattern, local, r.id), flags);
    return { ...r, flags, re };
  });
}

// ------------------------------------------------------------ what to inspect

function toolApplies(tools, name) {
  return tools.some(
    (t) =>
      t === '*' ||
      t === name ||
      ((t === 'Bash' || t === 'Shell') && SHELL_TOOLS.has(name)) ||
      (t.endsWith('*') && name.startsWith(t.slice(0, -1))),
  );
}

// A second view of a shell command with quotes and backslashes removed, so that
// tricks such as  r\m -rf /  or  "rm" -rf "/"  still match.
export function normalizeCommand(cmd) {
  return cmd.replace(/\\\r?\n/g, ' ').replace(/["'\\]/g, '').replace(/\s+/g, ' ').trim();
}

function collectPaths(value, out, depth = 0) {
  if (depth > 6 || value === null || typeof value !== 'object') return out;
  for (const [k, v] of Object.entries(value)) {
    if (PATH_KEYS.has(k) && typeof v === 'string' && v !== '') out.push(v);
    else if (v && typeof v === 'object') collectPaths(v, out, depth + 1);
  }
  return out;
}

const slash = (p) => p.replace(/\\/g, '/');

// The real location of a path, following symlinks (and, on Windows, fixing letter case).
// Works for files that do not exist yet: resolves the nearest folder that does exist.
export function realPath(p) {
  let head = resolve(p);
  const tail = [];
  for (;;) {
    try {
      return resolve(realpathSync.native(head), ...tail);
    } catch {
      const parent = dirname(head);
      if (parent === head) return resolve(p);
      tail.unshift(head.slice(parent.length).replace(/^[\\/]+/, ''));
      head = parent;
    }
  }
}

export function subjectsFor(payload, root = ROOT) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('input is not a JSON object');
  const { tool_name: name, tool_input: input } = payload;
  if (typeof name !== 'string' || name === '') throw new Error('input has no tool_name');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('input has no tool_input object');

  if (SHELL_TOOLS.has(name)) {
    if (typeof input.command !== 'string') throw new Error(`${name} input has no command`);
    return [...new Set([input.command, normalizeCommand(input.command)])];
  }
  if (name.startsWith('mcp__')) {
    return [name + ' ' + JSON.stringify(input)];
  }
  const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
  const paths = collectPaths(input, []);
  if (FILE_TOOLS.has(name) && paths.length === 0) throw new Error(`${name} input has no file path`);
  const subjects = [];
  const realRoot = realPath(root);
  for (const p of paths) {
    const abs = isAbsolute(p) ? p : resolve(cwd, p);
    // Also match on the real location, so a symlinked path cannot hide a guard file.
    subjects.push(slash(p), slash(abs), slash(relative(root, abs)), slash(relative(realRoot, realPath(abs))));
  }
  return [...new Set(subjects)];
}

export function evaluate(payload, rules, root = ROOT) {
  const subjects = subjectsFor(payload, root);
  const matches = rules.filter((r) => toolApplies(r.tools, payload.tool_name) && subjects.some((s) => r.re.test(s)));
  const pick = (d) => matches.filter((r) => r.decision === d);
  const decision = pick('forbid').length ? 'forbid' : pick('ask').length ? 'ask' : 'allow';
  return { decision, matches, primary: pick(decision)[0] || null };
}

// ------------------------------------------------------------------- output

function describe(rule) {
  return `[${rule.id}] ${rule.reason}` + (rule.lesson ? ` (Course: ${rule.lesson})` : '');
}

function deny(message) {
  try {
    process.stderr.write(message + '\n');
  } finally {
    process.exit(2);
  }
}

function report(result) {
  if (result.decision === 'forbid') {
    const others = result.matches.filter((r) => r !== result.primary && r.decision === 'forbid').map((r) => `[${r.id}]`);
    deny(
      `Blocked by guard ${describe(result.primary)}` +
        (others.length ? ` Also matched: ${others.join(' ')}.` : '') +
        ' Do not try to work around this. If the step is really needed, ask the human to do it themselves, outside the assistant.',
    );
  }
  if (result.decision === 'ask') {
    const out = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: `Guard asks for a human check: ${describe(result.primary)}`,
      },
    };
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exit(0);
  }
  process.exit(0); // allow: stay silent, so the normal permission flow applies
}

async function main() {
  process.on('uncaughtException', (e) => deny(`Blocked by guard: internal error (${e && e.message}). Failing closed.`));
  process.on('unhandledRejection', (e) => deny(`Blocked by guard: internal error (${e && e.message}). Failing closed.`));
  setTimeout(() => deny('Blocked by guard: no complete input within 5 seconds. Failing closed.'), INPUT_TIMEOUT_MS);

  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let result;
  try {
    const payload = JSON.parse(raw);
    const rules = loadRules();
    result = evaluate(payload, rules);
  } catch (e) {
    deny(`Blocked by guard: could not check this action safely (${e && e.message}). Failing closed.`);
  }
  report(result);
}

// Run the checks when started as the hook, not when imported by the self-test or checker.
// Compare REAL paths: a symlinked or differently-cased path must never switch the guard off.
// If the comparison itself fails, assume we are the hook (fail closed).
function startedAsHook() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(SELF);
  } catch {
    return true;
  }
}
if (startedAsHook()) {
  main().catch((e) => deny(`Blocked by guard: internal error (${e && e.message}). Failing closed.`));
}
