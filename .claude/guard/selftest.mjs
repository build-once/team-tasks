#!/usr/bin/env node
// Build Once self-test. Apache-2.0.
// Runs every example in .claude/guard/rules.json through the REAL hook (as a separate
// process, exactly as Claude Code runs it), plus fail-closed checks.
// Exits non-zero on any mismatch, or if fewer than MIN_EXAMPLES examples ran,
// so an empty or truncated rule set can never pass.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(ROOT, '.claude', 'hooks', 'guard.mjs');
const MIN_EXAMPLES = 60;

const { loadRules, evaluate } = await import(pathToFileURL(HOOK).href);

function runHook(payload, { hook = HOOK, cwd = ROOT, raw } = {}) {
  const input = raw !== undefined ? raw : JSON.stringify(payload);
  const r = spawnSync(process.execPath, [hook], { input, cwd, encoding: 'utf8', timeout: 15000 });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function payloadFor(example) {
  if (typeof example === 'string') return { hook_event_name: 'PreToolUse', cwd: ROOT, tool_name: 'Bash', tool_input: { command: example } };
  return { hook_event_name: 'PreToolUse', cwd: ROOT, tool_name: example.tool, tool_input: example.input };
}

const label = (ex) => (typeof ex === 'string' ? ex : `${ex.tool} ${JSON.stringify(ex.input)}`);
const failures = [];
let examples = 0;
let core = 0;

// ------------------------------------------------------------- rule examples
const rules = loadRules(ROOT);
for (const rule of rules) {
  const ex = rule.examples || {};
  const yes = [...(ex.should_match || [])];
  const no = [...(ex.should_not_match || [])];
  if (yes.length === 0 || no.length === 0) failures.push(`${rule.id}: needs at least one should_match and one should_not_match example`);
  const tag = `[${rule.id}]`;

  // A rule written for the shell must hold in EVERY shell tool, not just Bash: run each
  // plain command example again as a PowerShell call (Windows has both tools).
  const shellRule = rule.tools.some((t) => t === 'Bash' || t === 'Shell' || t === '*');
  const asPowerShell = (list) => (shellRule ? list.filter((e) => typeof e === 'string').map((c) => ({ tool: 'PowerShell', input: { command: c } })) : []);
  yes.push(...asPowerShell(yes));
  no.push(...asPowerShell(no));

  for (const e of yes) {
    examples++;
    const out = runHook(payloadFor(e));
    const matched = evaluate(payloadFor(e), rules, ROOT).matches.some((m) => m.id === rule.id);
    let ok = matched;
    if (rule.decision === 'forbid') ok = ok && out.status === 2 && out.stderr.includes(tag);
    if (rule.decision === 'ask') {
      let d = null;
      try { d = JSON.parse(out.stdout).hookSpecificOutput; } catch {}
      ok = ok && out.status === 0 && d && d.permissionDecision === 'ask' && d.permissionDecisionReason.includes(tag);
    }
    if (rule.decision === 'allow') ok = ok && out.status === 0 && out.stdout === '' && out.stderr === '';
    if (!ok) failures.push(`${rule.id}: should MATCH but did not: ${label(e)}  (exit ${out.status}) ${out.stderr.trim()}`);
  }
  for (const e of no) {
    examples++;
    const out = runHook(payloadFor(e));
    const matched = evaluate(payloadFor(e), rules, ROOT).matches.some((m) => m.id === rule.id);
    if (matched || out.stderr.includes(tag) || out.stdout.includes(tag)) {
      failures.push(`${rule.id}: should NOT match but did: ${label(e)}`);
    }
  }
}

// ---------------------------------------------------------- fail-closed checks
function check(name, ok, detail = '') {
  core++;
  if (!ok) failures.push(`core: ${name} ${detail}`);
}
const bash = (command, cwd = ROOT) => ({ hook_event_name: 'PreToolUse', cwd, tool_name: 'Bash', tool_input: { command } });

let r = runHook(null, { raw: '{not json' });
check('malformed stdin is denied', r.status === 2, `(exit ${r.status})`);
r = runHook(null, { raw: '' });
check('empty stdin is denied', r.status === 2, `(exit ${r.status})`);
r = runHook({ tool_name: 'Bash', tool_input: {} });
check('Bash with no command is denied', r.status === 2, `(exit ${r.status})`);
r = runHook({ tool_name: 'PowerShell', tool_input: {} });
check('PowerShell with no command is denied', r.status === 2, `(exit ${r.status})`);
r = runHook({ tool_name: 'Write', tool_input: { content: 'x' } });
check('Write with no file path is denied', r.status === 2, `(exit ${r.status})`);
r = runHook(bash('ls'));
check('plain ls is allowed silently', r.status === 0 && r.stdout === '' && r.stderr === '', `(exit ${r.status}) ${r.stdout}${r.stderr}`);

// The hook must work out the project root from its own location, not the cwd.
const sub = join(ROOT, 'docs');
mkdirSync(sub, { recursive: true });
r = runHook(bash('ls', sub), { cwd: sub });
check('ls from a sub-folder is allowed', r.status === 0 && r.stdout === '', `(exit ${r.status}) ${r.stderr}`);
r = runHook({ cwd: sub, tool_name: 'Edit', tool_input: { file_path: '../.claude/guard/rules.json', old_string: 'a', new_string: 'b' } }, { cwd: sub });
check('relative guard path from a sub-folder is denied', r.status === 2 && r.stderr.includes('[guard-self-protect]'), `(exit ${r.status})`);

// Broken installs, built in a throw-away copy of the kit.
function tempKit({ rules: rulesText, local } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'buildonce-'));
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true });
  mkdirSync(join(dir, '.claude', 'guard'), { recursive: true });
  copyFileSync(HOOK, join(dir, '.claude', 'hooks', 'guard.mjs'));
  if (rulesText !== undefined) writeFileSync(join(dir, '.claude', 'guard', 'rules.json'), rulesText);
  if (local !== undefined) writeFileSync(join(dir, '.claude', 'guard', 'local.json'), local);
  return dir;
}
const realRules = readFileSync(join(ROOT, '.claude', 'guard', 'rules.json'), 'utf8');
const cases = [
  ['missing rules file is denied', {}],
  ['empty rule list is denied', { rules: '{"rules":[]}' }],
  ['unreadable rules file is denied', { rules: '{"rules":[' }],
  ['rule with a broken regex is denied', { rules: JSON.stringify({ rules: [{ id: 'x', decision: 'forbid', tools: ['Bash'], pattern: '(', reason: 'r' }] }) }],
  ['rule with an unknown decision is denied', { rules: JSON.stringify({ rules: [{ id: 'x', decision: 'maybe', tools: ['Bash'], pattern: 'a', reason: 'r' }] }) }],
  ['malformed .claude/guard/local.json is denied', { rules: realRules, local: '{oops' }],
];
for (const [name, opts] of cases) {
  const dir = tempKit(opts);
  const out = runHook(bash('ls', dir), { hook: join(dir, '.claude', 'hooks', 'guard.mjs'), cwd: dir });
  check(name, out.status === 2, `(exit ${out.status})`);
  rmSync(dir, { recursive: true, force: true });
}
{
  const dir = tempKit({ rules: realRules, local: JSON.stringify({ production_patterns: ['abcd1234prodref'] }) });
  const out = runHook(bash('supabase link --project-ref abcd1234prodref', dir), { hook: join(dir, '.claude', 'hooks', 'guard.mjs'), cwd: dir });
  check('.claude/guard/local.json production pattern is enforced', out.status === 2 && out.stderr.includes('[production-access]'), `(exit ${out.status})`);
  const out2 = runHook(bash('supabase link --project-ref abcd1234prodref'));
  check('same command is not flagged by production-access without local.json', !out2.stderr.includes('[production-access]'));
  rmSync(dir, { recursive: true, force: true });
}

// The exact command registered in .claude/settings.json, run through a shell the way
// Claude Code runs a shell-form hook (sh, or Git Bash on Windows), from a sub-folder.
const settings = JSON.parse(readFileSync(join(ROOT, '.claude', 'settings.json'), 'utf8'));
const groups = settings.hooks && settings.hooks.PreToolUse;
check('settings.json registers PreToolUse hooks', Array.isArray(groups) && groups.length > 0);
const matchers = (groups || []).map((g) => g.matcher).join(' ');
for (const t of ['Bash', 'PowerShell', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'mcp__.*']) check(`settings.json matcher covers ${t}`, matchers.includes(t));
const commands = [...new Set((groups || []).flatMap((g) => g.hooks.map((h) => h.command)))];
check('every matcher uses the same hook command', commands.length === 1, JSON.stringify(commands));
// Claude Code runs hook commands with Git Bash on Windows, and with sh elsewhere.
const HOOK_SHELL = process.platform !== 'win32' ? 'sh' : [
  process.env.CLAUDE_CODE_GIT_BASH_PATH,
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe'),
].find((p) => p && existsSync(p));
check('a shell for hook commands was found (Git Bash on Windows)', !!HOOK_SHELL, '- install Git for Windows. Without Git Bash, Claude Code runs hooks in PowerShell, where this hook command does not work.');
const runSettings = (payload, projectDir) =>
  spawnSync(HOOK_SHELL || 'sh', ['-c', commands[0]], { input: JSON.stringify(payload), cwd: sub, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir } });
r = runSettings(bash('ls', sub), ROOT);
check('settings command allows ls from a sub-folder', r.status === 0 && r.stdout === '', `(exit ${r.status}) ${r.stderr}`);
r = runSettings({ cwd: sub, tool_name: 'Write', tool_input: { file_path: '../.claude/guard/rules.json', content: '{}' } }, ROOT);
check('settings command denies a guard edit from a sub-folder', r.status === 2, `(exit ${r.status})`);
const empty = mkdtempSync(join(tmpdir(), 'buildonce-empty-'));
r = runSettings(bash('ls', sub), empty);
check('settings command fails closed when the hook script is missing', r.status === 2, `(exit ${r.status})`);
rmSync(empty, { recursive: true, force: true });

// Opened through a symlink (a junction on Windows), the hook must still run and still
// protect its own files. A plain text comparison of paths once switched the guard off here.
{
  const linkDir = mkdtempSync(join(tmpdir(), 'buildonce-link-'));
  const link = join(linkDir, 'project');
  let made = true;
  try { symlinkSync(ROOT, link, process.platform === 'win32' ? 'junction' : 'dir'); } catch { made = false; }
  check('a symlinked path to the project could be made for the test', made);
  if (made) {
    const linkedHook = join(link, '.claude', 'hooks', 'guard.mjs');
    let out = runHook(null, { hook: linkedHook, cwd: link, raw: '' });
    check('hook started through a symlink still fails closed on empty input', out.status === 2, `(exit ${out.status})`);
    out = runHook({ cwd: link, tool_name: 'Edit', tool_input: { file_path: join(link, '.claude', 'guard', 'rules.json'), old_string: 'a', new_string: 'b' } }, { hook: linkedHook, cwd: link });
    check('guard edit through a symlinked path is denied', out.status === 2 && out.stderr.includes('[guard-self-protect]'), `(exit ${out.status})`);
    rmSync(link, { force: true }); // removes the link only, never the project
  }
  rmSync(linkDir, { recursive: true, force: true });
}

// ------------------------------------------------------------------- summary
if (examples < MIN_EXAMPLES) failures.push(`only ${examples} rule examples ran; at least ${MIN_EXAMPLES} are required`);
if (failures.length) {
  console.error(`FAIL: ${failures.length} problem(s)`);
  for (const f of failures) console.error('  - ' + f);
  console.error(`(${examples} rule examples across ${rules.length} rules, ${core} fail-closed checks)`);
  process.exit(1);
}
console.log(`PASS: ${examples} rule examples across ${rules.length} rules, plus ${core} fail-closed checks.`);
