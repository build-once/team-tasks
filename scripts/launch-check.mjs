#!/usr/bin/env node
// launch-check.mjs — Build Once launch readiness checker.
// Zero dependencies, Node 20+. READ-ONLY: it never writes to your project, never makes network
// calls except optional read-only `gh` queries, and never prints secret values (file:line only).
//
// Usage:
//   node scripts/launch-check.mjs [--root <dir>] [--json] [--strict] [--no-gh]
//   node scripts/launch-check.mjs --selftest
//
// Statuses: PASS | FAIL | UNVERIFIED (the check could not run — reason given) | TODO (evidence missing)
// Exit code: 1 if any FAIL (with --strict, also if any UNVERIFIED or TODO); 2 on a crash; else 0.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findSecrets } from './lib/secrets.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHECKLIST_PATH = path.resolve(HERE, '..', 'checklist', 'launch.json');
const PASS = 'PASS', FAIL = 'FAIL', UNV = 'UNVERIFIED', TODO = 'TODO';
const res = (status, reason = '') => ({ status, reason });

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage', 'vendor', '.venv', 'venv', '__pycache__', '.dart_tool']);
const SECRET_ALLOW_MARKER = 'launch-check: allow-secret';
const DOTENV_RE = /^\.env(\.|$)/;
const DOTENV_OK_RE = /\.(example|sample|template|dist|defaults)$/;

// ---------- small helpers ----------
function run(cmd, args, cwd, timeout = 20000) {
  const r = spawnSync(cmd, args, {
    cwd, encoding: 'utf8', timeout, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: '1', GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0', GH_NO_UPDATE_NOTIFIER: '1' },
  });
  return {
    ok: !r.error && r.status === 0,
    code: r.status,
    out: r.stdout || '',
    err: (r.stderr || '') + (r.error ? String(r.error.message) : ''),
    missing: !!(r.error && r.error.code === 'ENOENT'),
    timedOut: !!(r.error && r.error.code === 'ETIMEDOUT'),
  };
}
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const nonEmpty = (p) => { const t = readText(p); return t !== null && t.trim().length > 0; };
const list = (arr, n = 5) => arr.slice(0, n).join(', ') + (arr.length > n ? ` (+${arr.length - n} more)` : '');

function walk(root, limit = 20000) {
  const out = [];
  const stack = [''];
  while (stack.length && out.length < limit) {
    const rel = stack.pop();
    let ents;
    try { ents = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push(r); }
      else if (e.isFile()) out.push(r);
    }
  }
  return out;
}

// git: returns { files } or { unavailable: reason }
function gitInfo(ctx) {
  if (ctx.cache.git) return ctx.cache.git;
  let g;
  const v = run('git', ['--version'], ctx.root);
  if (v.missing) g = { unavailable: 'git is not installed' };
  else {
    const inside = run('git', ['-C', ctx.root, 'rev-parse', '--is-inside-work-tree'], ctx.root);
    if (!inside.ok || inside.out.trim() !== 'true') g = { unavailable: 'not a git repository' };
    else {
      const ls = run('git', ['-C', ctx.root, 'ls-files', '-z'], ctx.root);
      g = ls.ok ? { files: ls.out.split('\0').filter(Boolean) } : { unavailable: 'git ls-files failed' };
    }
  }
  ctx.cache.git = g;
  return g;
}

// gh: returns { repo, branch, visibility } or { unavailable: reason }. Read-only queries only.
function ghInfo(ctx) {
  if (ctx.cache.gh) return ctx.cache.gh;
  let g;
  if (ctx.noGh) g = { unavailable: 'gh checks disabled (--no-gh)' };
  else {
    const v = run('gh', ['--version'], ctx.root);
    if (v.missing) g = { unavailable: 'gh CLI not installed' };
    else if (!run('gh', ['auth', 'status'], ctx.root).ok) g = { unavailable: 'gh CLI not authenticated (run: gh auth login)' };
    else {
      const rv = run('gh', ['repo', 'view', '--json', 'nameWithOwner,visibility,defaultBranchRef'], ctx.root);
      if (!rv.ok) g = { unavailable: 'gh could not resolve a GitHub repo for this folder' };
      else {
        try {
          const j = JSON.parse(rv.out);
          g = { repo: j.nameWithOwner, visibility: j.visibility, branch: (j.defaultBranchRef && j.defaultBranchRef.name) || 'main' };
        } catch { g = { unavailable: 'gh repo view returned unreadable output' }; }
      }
    }
  }
  ctx.cache.gh = g;
  return g;
}

// 403 / plan / permission problems must never be reported as PASS or FAIL.
function isPlanOrPermission(err) {
  return /HTTP 40[13]|upgrade to github pro|not available for|make this repository public|requires? (?:a )?(?:paid|pro|team|enterprise)|resource not accessible|must have admin|forbidden/i.test(err);
}

function parseWorkflowJobs(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^jobs:\s*(#.*)?$/.test(l));
  if (start < 0) return [];
  const jobs = [];
  let indent = null, cur = null;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l) && l.trim() && !l.trim().startsWith('#')) break; // next top-level key
    const m = /^(\s+)([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(l);
    if (m && (indent === null || m[1].length === indent)) {
      if (indent === null) indent = m[1].length;
      cur = { id: m[2], line: i + 1, body: [] };
      jobs.push(cur);
      continue;
    }
    if (cur) cur.body.push(l);
  }
  return jobs.map((j) => ({ ...j, body: j.body.join('\n') }));
}

function workflowFiles(root) {
  const dir = path.join(root, '.github', 'workflows');
  if (!isDir(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).map((f) => path.join('.github', 'workflows', f));
}

function globToRe(pat) {
  let s = '';
  for (const ch of pat) {
    if (ch === '*') s += '[^/]*';
    else if (ch === '?') s += '[^/]';
    else s += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^(?:.*/)?${s}$`);
}
function gitignoreIgnores(text, name) {
  let ignored = false;
  for (let raw of text.split(/\r?\n/)) {
    raw = raw.trim();
    if (!raw || raw.startsWith('#')) continue;
    let neg = false;
    if (raw.startsWith('!')) { neg = true; raw = raw.slice(1); }
    raw = raw.replace(/^\//, '').replace(/\/$/, '');
    if (raw.startsWith('**/')) raw = raw.slice(3);
    if (globToRe(raw).test(name)) ignored = !neg;
  }
  return ignored;
}

// ---------- auto checks (all read-only) ----------
export const CHECKS = {
  architecture_doc(ctx) {
    const c = ['docs/architecture.md', 'ARCHITECTURE.md', 'docs/ARCHITECTURE.md'].find((p) => nonEmpty(path.join(ctx.root, p)));
    return c ? res(PASS, c) : res(FAIL, 'no docs/architecture.md (or ARCHITECTURE.md) with content');
  },

  environments_doc(ctx) {
    const t = readText(path.join(ctx.root, 'docs', 'environments.md'));
    if (t === null || !t.trim()) return res(FAIL, 'docs/environments.md missing or empty');
    const missing = ['staging', 'prod'].filter((w) => !t.toLowerCase().includes(w));
    return missing.length ? res(FAIL, `docs/environments.md never mentions: ${missing.join(', ')}`) : res(PASS, 'docs/environments.md');
  },

  gitignore_env(ctx) {
    const t = readText(path.join(ctx.root, '.gitignore'));
    if (t === null) return res(FAIL, 'no .gitignore file');
    const names = ['.env', '.env.local', '.env.production'];
    const notIgnored = names.filter((n) => !gitignoreIgnores(t, n));
    return notIgnored.length ? res(FAIL, `.gitignore does not cover: ${notIgnored.join(', ')} (add ".env" and ".env.*")`) : res(PASS, 'covers .env and .env.*');
  },

  no_tracked_env(ctx) {
    const g = gitInfo(ctx);
    if (g.unavailable) return res(UNV, g.unavailable);
    const bad = g.files.filter((f) => DOTENV_RE.test(path.posix.basename(f)) && !DOTENV_OK_RE.test(f));
    return bad.length ? res(FAIL, `tracked env files: ${list(bad)} (untrack them with git's --cached removal, then rotate the keys)`) : res(PASS, `${g.files.length} tracked files checked`);
  },

  no_secrets(ctx) {
    const g = gitInfo(ctx);
    let files, source;
    if (g.files) { files = g.files; source = 'tracked files'; }
    else { files = walk(ctx.root).filter((f) => !DOTENV_RE.test(path.posix.basename(f))); source = `working-tree files (${g.unavailable})`; }
    let scanned = 0, allowed = 0;
    const hits = [];
    for (const rel of files) {
      const abs = path.join(ctx.root, rel);
      let buf;
      try { const st = fs.statSync(abs); if (!st.isFile() || st.size > 2 * 1024 * 1024) continue; buf = fs.readFileSync(abs); } catch { continue; }
      if (buf.subarray(0, 8192).includes(0)) continue; // binary
      scanned++;
      const lines = buf.toString('utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        const names = findSecrets(line);
        if (!names.length) return;
        if (line.includes(SECRET_ALLOW_MARKER)) { allowed++; return; }
        hits.push(`${rel}:${i + 1} (${names.join('+')})`);
      });
    }
    // An empty scan is not a clean result.
    if (scanned === 0) return res(UNV, `scanned 0 ${source} — an empty scan proves nothing`);
    const note = allowed ? `; ${allowed} line(s) waived with "${SECRET_ALLOW_MARKER}"` : '';
    return hits.length ? res(FAIL, `${hits.length} secret-looking line(s): ${list(hits)}${note}`) : res(PASS, `${scanned} ${source} scanned, 0 hits${note}`);
  },

  ci_required_aggregator(ctx) {
    const files = workflowFiles(ctx.root);
    if (!files.length) return res(FAIL, 'no .github/workflows/*.yml files');
    const problems = [];
    for (const f of files) {
      const text = readText(path.join(ctx.root, f)) || '';
      for (const j of parseWorkflowJobs(text)) {
        const named = j.id === 'required' || /^\s+name:\s*["']?required["']?\s*$/m.test(j.body);
        if (!named) continue;
        const always = /^\s+if:\s*(?:\$\{\{\s*)?always\(\)/m.test(j.body);
        const needs = /^\s+needs:/m.test(j.body);
        const inspects = /needs\.[\w*-]+\.result|toJSON\(\s*needs\s*\)|contains\(\s*needs/.test(j.body);
        if (always && needs && inspects) return res(PASS, `${f}:${j.line} job "${j.id}"`);
        problems.push(`${f}:${j.line} job "${j.id}" missing ${[!always && 'if: always()', !needs && 'needs:', !inspects && 'a check of needs.*.result (otherwise it goes green when a job fails)'].filter(Boolean).join(' + ')}`);
      }
    }
    return res(FAIL, problems.length ? problems.join('; ') : 'no job named "required" in any workflow');
  },

  ci_permissions_timeouts(ctx) {
    const files = workflowFiles(ctx.root);
    if (!files.length) return res(FAIL, 'no .github/workflows/*.yml files');
    const problems = [];
    let jobsSeen = 0;
    for (const f of files) {
      const text = readText(path.join(ctx.root, f)) || '';
      const jobs = parseWorkflowJobs(text);
      const topPerms = /^permissions:/m.test(text);
      for (const j of jobs) {
        jobsSeen++;
        if (!topPerms && !/^\s+permissions:/m.test(j.body)) problems.push(`${f}: job "${j.id}" has no permissions:`);
        const reusable = /^\s{2,6}uses:/m.test(j.body) && !/^\s+steps:/m.test(j.body);
        if (!reusable && !/^\s+timeout-minutes:/m.test(j.body)) problems.push(`${f}: job "${j.id}" has no timeout-minutes`);
      }
      if (!jobs.length) problems.push(`${f}: no jobs found`);
    }
    if (jobsSeen === 0) return res(UNV, 'no jobs parsed from any workflow — cannot judge');
    return problems.length ? res(FAIL, list(problems, 4)) : res(PASS, `${files.length} workflow(s), ${jobsSeen} job(s)`);
  },

  dependabot_config(ctx) {
    const f = ['.github/dependabot.yml', '.github/dependabot.yaml'].find((p) => isFile(path.join(ctx.root, p)));
    if (!f) return res(FAIL, 'no .github/dependabot.yml');
    const t = readText(path.join(ctx.root, f));
    return /updates:/.test(t) && /package-ecosystem:/.test(t) ? res(PASS, f) : res(FAIL, `${f} has no updates:/package-ecosystem entries`);
  },

  guard_files(ctx) {
    return isFile(path.join(ctx.root, '.claude', 'hooks', 'guard.mjs')) ? res(PASS, '.claude/hooks/guard.mjs') : res(FAIL, '.claude/hooks/guard.mjs not found');
  },

  settings_hook(ctx) {
    const t = readText(path.join(ctx.root, '.claude', 'settings.json'));
    if (t === null) return res(FAIL, '.claude/settings.json not found');
    let j;
    try { j = JSON.parse(t); } catch { return res(FAIL, '.claude/settings.json is not valid JSON'); }
    const pre = j && j.hooks && j.hooks.PreToolUse;
    if (!Array.isArray(pre) || !pre.length) return res(FAIL, 'no hooks.PreToolUse entry');
    const cmds = pre.flatMap((e) => (Array.isArray(e.hooks) ? e.hooks : [])).map((h) => String(h.command || ''));
    return cmds.some((c) => /guard/i.test(c)) ? res(PASS, 'PreToolUse runs the guard') : res(FAIL, `PreToolUse has ${cmds.length} command(s) but none runs the guard`);
  },

  guard_selftest(ctx) {
    const p = path.join(ctx.root, '.claude', 'guard', 'selftest.mjs');
    if (!isFile(p)) return res(UNV, '.claude/guard/selftest.mjs not found — could not run it (this is not a pass)');
    const r = run(process.execPath, [p], ctx.root, 120000);
    if (r.timedOut) return res(UNV, 'guard self-test timed out after 120s');
    const last = (r.out.trim().split(/\r?\n/).pop() || '').slice(0, 80);
    if (r.ok) return res(PASS, `exit 0: ${last}`);
    const errLine = r.err.split(/\r?\n/).find((l) => /\b\w*Error\b|FAIL/.test(l)) || r.err.trim().split(/\r?\n/).pop() || last;
    return res(FAIL, `exit ${r.code}: ${errLine.trim().slice(0, 100)}`);
  },

  migrations_folder(ctx) {
    const root = ctx.root;
    const signals = [];
    if (isDir(path.join(root, 'supabase'))) signals.push('supabase/');
    if (isFile(path.join(root, 'prisma', 'schema.prisma'))) signals.push('prisma/schema.prisma');
    for (const f of ['drizzle.config.ts', 'drizzle.config.js', 'knexfile.js', 'knexfile.ts', 'alembic.ini', 'manage.py']) if (isFile(path.join(root, f))) signals.push(f);
    const pkg = readText(path.join(root, 'package.json'));
    if (pkg) {
      try {
        const j = JSON.parse(pkg);
        const deps = Object.keys({ ...(j.dependencies || {}), ...(j.devDependencies || {}) });
        const db = deps.filter((d) => ['pg', 'postgres', 'mysql2', 'mysql', 'better-sqlite3', 'sqlite3', '@supabase/supabase-js', 'prisma', '@prisma/client', 'drizzle-orm', 'knex', 'sequelize', 'typeorm', 'kysely'].includes(d));
        if (db.length) signals.push(`package.json: ${db.join(', ')}`);
      } catch { /* ignore */ }
    }
    const req = readText(path.join(root, 'requirements.txt'));
    if (req && /\b(psycopg2?|sqlalchemy|alembic|django|asyncpg)\b/i.test(req)) signals.push('requirements.txt');
    if (!signals.length) return res(UNV, 'no database detected — if you use one, keep its migrations in the repo');
    const dirs = ['supabase/migrations', 'prisma/migrations', 'migrations', 'db/migrations', 'database/migrations', 'drizzle', 'alembic/versions'];
    const found = dirs.find((d) => isDir(path.join(root, d)) && fs.readdirSync(path.join(root, d)).some((f) => !f.startsWith('.')));
    return found ? res(PASS, `${found} (database: ${signals[0]})`) : res(FAIL, `database detected (${signals[0]}) but no migrations folder with files`);
  },

  handoff_file(ctx) {
    return nonEmpty(path.join(ctx.root, 'HANDOFF.md')) ? res(PASS, 'HANDOFF.md') : res(FAIL, 'HANDOFF.md missing — run: node scripts/handoff.mjs');
  },

  lockfile(ctx) {
    const root = ctx.root;
    const pkgT = readText(path.join(root, 'package.json'));
    if (pkgT !== null) {
      let n = 0;
      try { const j = JSON.parse(pkgT); n = Object.keys({ ...(j.dependencies || {}), ...(j.devDependencies || {}), ...(j.optionalDependencies || {}) }).length; } catch { return res(FAIL, 'package.json is not valid JSON'); }
      if (n === 0) return res(PASS, 'package.json has no dependencies');
      const lf = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock'].find((f) => isFile(path.join(root, f)));
      return lf ? res(PASS, lf) : res(FAIL, `package.json has ${n} dependencies but no lockfile`);
    }
    if (isFile(path.join(root, 'pubspec.yaml'))) return isFile(path.join(root, 'pubspec.lock')) ? res(PASS, 'pubspec.lock') : res(FAIL, 'pubspec.yaml without pubspec.lock');
    return res(UNV, 'no package.json or pubspec.yaml found');
  },

  repo_private(ctx) {
    const g = ghInfo(ctx);
    if (g.unavailable) return res(UNV, g.unavailable);
    if (g.visibility === 'PRIVATE' || g.visibility === 'INTERNAL') return res(PASS, `${g.repo} is ${g.visibility.toLowerCase()}`);
    if (g.visibility === 'PUBLIC') return res(FAIL, `${g.repo} is public`);
    return res(UNV, `unknown visibility "${g.visibility}"`);
  },

  branch_protection(ctx) {
    const g = ghInfo(ctx);
    if (g.unavailable) return res(UNV, g.unavailable);
    const prot = run('gh', ['api', `repos/${g.repo}/branches/${g.branch}/protection`], ctx.root);
    if (prot.ok) return res(PASS, `classic branch protection on ${g.branch}`);
    const perr = prot.err + prot.out;
    if (isPlanOrPermission(perr)) return res(UNV, 'UNVERIFIED — plan/permission (branch protection API refused)');
    const notProtected = /Branch not protected/i.test(perr);
    const rules = run('gh', ['api', `repos/${g.repo}/rules/branches/${g.branch}`], ctx.root);
    if (rules.ok) {
      let arr = [];
      try { arr = JSON.parse(rules.out); } catch { return res(UNV, 'rules API returned unreadable output'); }
      if (Array.isArray(arr) && arr.length) return res(PASS, `ruleset rules on ${g.branch}: ${[...new Set(arr.map((x) => x.type))].join(', ')}`);
      if (notProtected) return res(FAIL, `${g.branch} has no branch protection and no ruleset rules`);
      return res(UNV, 'protection API gave no clear answer and no rulesets were found');
    }
    if (isPlanOrPermission(rules.err + rules.out)) return res(UNV, 'UNVERIFIED — plan/permission (rules API refused)');
    return res(UNV, `could not read protection (${(perr.trim().split(/\r?\n/)[0] || 'unknown error').slice(0, 60)})`);
  },

  ci_latest_main(ctx) {
    const g = ghInfo(ctx);
    if (g.unavailable) return res(UNV, g.unavailable);
    const r = run('gh', ['run', 'list', '--branch', g.branch, '--limit', '20', '--json', 'conclusion,status,workflowName,headSha'], ctx.root);
    if (!r.ok) return res(UNV, isPlanOrPermission(r.err) ? 'UNVERIFIED — plan/permission' : 'gh run list failed');
    let runs;
    try { runs = JSON.parse(r.out); } catch { return res(UNV, 'gh run list returned unreadable output'); }
    if (!runs.length) return res(UNV, `no CI runs found on ${g.branch}`);
    const sha = runs[0].headSha;
    const latest = runs.filter((x) => x.headSha === sha);
    if (latest.some((x) => x.status !== 'completed')) return res(UNV, `CI still running on ${g.branch} (${sha.slice(0, 7)})`);
    const bad = latest.filter((x) => !['success', 'skipped', 'neutral'].includes(x.conclusion));
    return bad.length ? res(FAIL, `${sha.slice(0, 7)}: ${bad.map((x) => `${x.workflowName}=${x.conclusion}`).join(', ')}`) : res(PASS, `${sha.slice(0, 7)}: ${latest.length} run(s) green`);
  },
};

// ---------- evidence ----------
const PLACEHOLDER_RE = /<[^>]*>|^(?:tbd|todo|\.\.\.|pass\s*\/\s*fail.*)$/i;
export function checkEvidence(ctx, item) {
  const p = path.join(ctx.root, item.evidence_file);
  const t = readText(p);
  if (t === null) return res(TODO, `missing ${item.evidence_file}`);
  if (!t.trim()) return res(TODO, `${item.evidence_file} is empty`);
  const resultMatch = /^[ \t>*_-]*Result:[*_ \t]*(.*)$/mi.exec(t);
  const dateMatch = /^[ \t>*_-]*Date:[*_ \t]*(.*)$/mi.exec(t);
  const result = resultMatch ? resultMatch[1].trim() : '';
  const date = dateMatch ? dateMatch[1].trim() : '';
  if (!result || PLACEHOLDER_RE.test(result)) return res(TODO, `${item.evidence_file}: Result: not filled in`);
  if (!/\b\d{4}-\d{2}-\d{2}\b/.test(date) || PLACEHOLDER_RE.test(date)) return res(TODO, `${item.evidence_file}: Date: not filled in (YYYY-MM-DD)`);
  if (/^fail/i.test(result)) return res(FAIL, `evidence says: ${result.slice(0, 60)}`);
  return res(PASS, `${date.match(/\d{4}-\d{2}-\d{2}/)[0]}: ${result.slice(0, 50)}`);
}

// ---------- runner ----------
export function loadChecklist(p = CHECKLIST_PATH) {
  return JSON.parse(fs.readFileSync(p, 'utf8')).items;
}

export function runAll(root, { noGh = false, items = loadChecklist() } = {}) {
  const ctx = { root: path.resolve(root), noGh, cache: {} };
  return items.map((item) => {
    let r;
    try {
      if (item.type === 'auto') {
        const fn = CHECKS[item.check];
        r = fn ? fn(ctx) : res(UNV, `unknown check "${item.check}"`);
      } else r = checkEvidence(ctx, item);
    } catch (e) {
      r = res(UNV, `check crashed: ${String(e && e.message).slice(0, 80)}`);
    }
    return { id: item.id, title: item.title, lesson: item.lesson, type: item.type, status: r.status, reason: r.reason };
  });
}

function counts(results) {
  const c = { PASS: 0, FAIL: 0, UNVERIFIED: 0, TODO: 0 };
  for (const r of results) c[r.status]++;
  return c;
}

function printTable(results, root) {
  const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const rows = results.map((r) => [r.status, r.id, r.lesson, trunc(r.reason, 110)]);
  const head = ['STATUS', 'ID', 'LESSON', 'DETAIL'];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const fmt = (row) => row.map((c, i) => (i === row.length - 1 ? c : c.padEnd(w[i]))).join('  ');
  console.log(`Launch check for ${root}\n`);
  console.log(fmt(head));
  console.log(fmt(w.map((n) => '-'.repeat(n))));
  for (const row of rows) console.log(fmt(row));
  const c = counts(results);
  console.log(`\n${results.length} items: ${c.PASS} PASS, ${c.FAIL} FAIL, ${c.UNVERIFIED} UNVERIFIED, ${c.TODO} TODO`);
  console.log('UNVERIFIED means the check could not run — it is NOT a pass. TODO means evidence is missing (see evidence/README.md).');
  console.log('Item titles and how to prove each one: checklist/launch.json (or run with --json).');
}

// ---------- selftest ----------
function writeTree(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }
}

function selftest() {
  const items = loadChecklist();
  let assertions = 0, failures = 0;
  const check = (cond, msg) => { assertions++; if (!cond) { failures++; console.log(`  FAIL: ${msg}`); } };

  // Schema assertions on the real checklist.
  check(items.length >= 30, `checklist has >= 30 items (has ${items.length})`);
  check(new Set(items.map((i) => i.id)).size === items.length, 'checklist ids are unique');
  for (const i of items) {
    check(i.id && i.title && i.lesson && ['auto', 'evidence'].includes(i.type), `item ${i.id} has id/title/lesson/type`);
    if (i.type === 'auto') check(typeof CHECKS[i.check] === 'function', `item ${i.id} check "${i.check}" is implemented`);
    else check(/^evidence\/[\w.-]+\.md$/.test(i.evidence_file || '') && (i.how_to_prove || '').length > 10, `item ${i.id} has evidence_file under evidence/ and how_to_prove`);
  }
  check(Object.keys(CHECKS).length >= 10, `>= 10 auto checks implemented (${Object.keys(CHECKS).length})`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-check-selftest-'));
  const good = path.join(tmp, 'good'), bad = path.join(tmp, 'bad'), empty = path.join(tmp, 'empty'), broken = path.join(tmp, 'broken-guard');
  // Fake secrets are assembled at runtime so this file itself never contains one.
  const fakeLive = 'sk_' + 'live_' + 'Z9'.repeat(14);
  const fakeTest = 'sk_' + 'test_' + 'placeholder';
  const workflowGood = [
    'name: ci', 'on: [push, pull_request]', 'permissions:', '  contents: read', 'jobs:',
    '  test:', '    runs-on: ubuntu-latest', '    timeout-minutes: 10', '    steps:', '      - run: echo test',
    '  required:', '    if: always()', '    needs: [test]', '    runs-on: ubuntu-latest', '    timeout-minutes: 5', '    steps:',
    '      - run: exit 1', "        if: contains(needs.*.result, 'failure') || contains(needs.*.result, 'cancelled')", '',
  ].join('\n');
  const workflowBad = [
    'name: ci', 'on: [push]', 'jobs:', '  test:', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo test',
    '  required:', '    if: always()', '    needs: [test]', '    runs-on: ubuntu-latest', '    steps:', '      - run: echo all good', '',
  ].join('\n');
  const evidenceFilled = (id) => `# Evidence: ${id}\n\nResult: PASS - checked by hand\nDate: 2026-09-01\nHow checked: selftest fixture\n`;

  const goodFiles = {
    'docs/architecture.md': '# Architecture\nWeb app + database.\n',
    'docs/environments.md': '# Environments\ndevelopment, staging, production\n',
    '.gitignore': '.env\n.env.*\n!.env.example\nnode_modules/\n',
    '.env': `STRIPE_SECRET_KEY=${fakeLive}\n`, // ignored by git, must not be flagged
    '.env.example': `STRIPE_SECRET_KEY=${fakeTest}\n`, // near-miss control
    'src/app.js': 'const key = process.env.STRIPE_SECRET_KEY; // near-miss control: reads env, no literal\nexport default key;\n',
    '.github/workflows/ci.yml': workflowGood,
    '.github/dependabot.yml': 'version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    schedule:\n      interval: weekly\n',
    '.claude/hooks/guard.mjs': '// stub guard\n',
    '.claude/settings.json': JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node .claude/hooks/guard.mjs' }] }] } }),
    '.claude/guard/selftest.mjs': "console.log('guard selftest: PASS');\n",
    'supabase/config.toml': 'project_id = "fixture"\n',
    'supabase/migrations/20260101000000_init.sql': 'create table t (id int);\n',
    'HANDOFF.md': '# Handoff\n',
    'package.json': '{"name":"fixture","private":true}\n',
  };
  for (const i of items) if (i.type === 'evidence') goodFiles[i.evidence_file] = evidenceFilled(i.id);
  writeTree(good, goodFiles);

  const evid = items.filter((i) => i.type === 'evidence');
  const [evPlaceholder, evFail, evNoDate, evEmpty] = evid;
  writeTree(bad, {
    'docs/environments.md': '# Environments\njust one: live\n',
    '.gitignore': 'node_modules/\n',
    '.env': 'API_URL=http://localhost\n',
    'src/config.js': `export const stripe = "${fakeLive}";\n`,
    '.github/workflows/ci.yml': workflowBad,
    'package.json': '{"name":"fixture","dependencies":{"pg":"8.11.0"}}\n',
    [evPlaceholder.evidence_file]: 'Result: <PASS / FAIL / N/A>\nDate: <YYYY-MM-DD>\n',
    [evFail.evidence_file]: 'Result: FAIL - not done yet\nDate: 2026-09-01\n',
    [evNoDate.evidence_file]: 'Result: PASS\nDate:\n',
    [evEmpty.evidence_file]: '   \n',
  });
  fs.mkdirSync(empty, { recursive: true });
  writeTree(broken, { '.claude/guard/selftest.mjs': "console.log('guard selftest: 1 failure'); process.exit(1);\n" });

  const hasGit = !run('git', ['--version'], tmp).missing;
  if (hasGit) {
    for (const d of [good, bad]) {
      run('git', ['-C', d, 'init', '-q'], d);
      run('git', ['-C', d, 'add', '-A'], d);
    }
    run('git', ['-C', bad, 'add', '-f', '.env'], bad);
  }

  const byId = (results) => Object.fromEntries(results.map((r) => [r.id, r]));
  const expectStatus = (results, id, status, label) => {
    const r = results[id];
    check(r && r.status === status, `${label}: ${id} expected ${status}, got ${r ? `${r.status} (${r.reason})` : 'nothing'}`);
  };

  const ghChecks = ['repo_private', 'branch_protection', 'ci_latest_main'];
  const G = byId(runAll(good, { noGh: true, items }));
  for (const i of items) {
    let want = PASS;
    if (ghChecks.includes(i.check)) want = UNV; // could not run -> UNVERIFIED, never PASS
    if (i.check === 'no_tracked_env' && !hasGit) want = UNV;
    expectStatus(G, i.id, want, 'good');
  }

  const B = byId(runAll(bad, { noGh: true, items }));
  const autoWant = {
    architecture_doc: FAIL, environments_doc: FAIL, gitignore_env: FAIL, no_tracked_env: hasGit ? FAIL : UNV, no_secrets: FAIL,
    ci_required_aggregator: FAIL, ci_permissions_timeouts: FAIL, dependabot_config: FAIL, guard_files: FAIL, settings_hook: FAIL,
    guard_selftest: UNV, migrations_folder: FAIL, handoff_file: FAIL, lockfile: FAIL, repo_private: UNV, branch_protection: UNV, ci_latest_main: UNV,
  };
  for (const i of items) {
    let want;
    if (i.type === 'auto') want = autoWant[i.check];
    else if (i.id === evFail.id) want = FAIL;
    else want = TODO;
    expectStatus(B, i.id, want, 'bad');
  }
  check(!JSON.stringify(Object.values(B)).includes(fakeLive), 'bad: secret value never appears in results');
  check(/src\/config\.js:1/.test(B[items.find((i) => i.check === 'no_secrets').id].reason), 'bad: secret reported as file:line');

  // Checks that could not run must say UNVERIFIED.
  const ctxEmpty = { root: empty, noGh: true, cache: {} };
  check(CHECKS.no_secrets(ctxEmpty).status === UNV, 'empty: secret scan over 0 files is UNVERIFIED, not PASS');
  check(CHECKS.migrations_folder(ctxEmpty).status === UNV, 'empty: no database detected is UNVERIFIED');
  check(CHECKS.guard_selftest(ctxEmpty).status === UNV, 'empty: missing guard self-test is UNVERIFIED');
  check(CHECKS.guard_selftest({ root: broken, noGh: true, cache: {} }).status === FAIL, 'broken-guard: failing guard self-test is FAIL');
  check(isPlanOrPermission('gh: Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)'), 'plan-limit 403 text is classified as plan/permission');
  check(!isPlanOrPermission('gh: Branch not protected (HTTP 404)'), '"Branch not protected" is NOT classified as plan/permission');

  // CLI exit codes.
  const self = fileURLToPath(import.meta.url);
  check(run(process.execPath, [self, '--root', good, '--no-gh'], tmp, 120000).code === 0, 'cli: good exits 0');
  check(run(process.execPath, [self, '--root', good, '--no-gh', '--strict'], tmp, 120000).code === 1, 'cli: good --strict exits 1 (UNVERIFIED items)');
  check(run(process.execPath, [self, '--root', bad, '--no-gh'], tmp, 120000).code === 1, 'cli: bad exits 1');
  const js = run(process.execPath, [self, '--root', bad, '--no-gh', '--json'], tmp, 120000);
  let parsed = null;
  try { parsed = JSON.parse(js.out); } catch { /* */ }
  check(parsed && parsed.items.length === items.length && parsed.counts.FAIL > 0, 'cli: --json output parses with all items');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`launch-check selftest: ${failures ? 'FAIL' : 'PASS'} (${assertions - failures}/${assertions} assertions, ${items.length} checklist items, ${Object.keys(CHECKS).length} auto checks, git ${hasGit ? 'available' : 'absent'})`);
  return failures ? 1 : 0;
}

// ---------- main ----------
function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/launch-check.mjs [--root <dir>] [--json] [--strict] [--no-gh] | --selftest');
    return 0;
  }
  if (argv.includes('--selftest')) return selftest();
  const ri = argv.indexOf('--root');
  const root = path.resolve(ri >= 0 ? argv[ri + 1] : process.cwd());
  const results = runAll(root, { noGh: argv.includes('--no-gh') });
  const c = counts(results);
  if (argv.includes('--json')) console.log(JSON.stringify({ root, generated: new Date().toISOString(), counts: c, items: results }, null, 2));
  else printTable(results, root);
  if (c.FAIL > 0) return 1;
  if (argv.includes('--strict') && (c.UNVERIFIED > 0 || c.TODO > 0)) return 1;
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`launch-check crashed: ${e && e.message}`); process.exitCode = 2; }
}
