#!/usr/bin/env node
// handoff.mjs — writes HANDOFF.md from local git state so the next session (human or AI) can pick up.
// Zero dependencies, Node 20+. No network calls. It never reads env files or key files, and it
// redacts secret-looking strings and email addresses before anything is written.
//
// Usage:
//   node scripts/handoff.mjs [--root <dir>] [--out <file>] [--commits <n>] [--stdout]
//   node scripts/handoff.mjs --selftest
//
// If git is missing (or this is not a git repo) it still writes a partial file marked UNVERIFIED.
// Anything you wrote under "## Decisions / Next steps" in an existing HANDOFF.md is kept.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { redact } from './lib/secrets.mjs';

const DECISIONS_HEADING = '## Decisions / Next steps';
const NEVER_READ_RE = /^(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|keystore|jks)|id_(?:rsa|dsa|ecdsa|ed25519).*|credentials(?:\..*)?|\.npmrc|\.netrc|\.pypirc)$/i;
const TODO_RE = /\b(TODO|FIXME|HACK|XXX)\b[:\s]?(.*)$/;
const DEFAULT_DECISIONS = [
  DECISIONS_HEADING,
  '',
  '_Fill this in before you stop. The tool keeps this section when it regenerates the file._',
  '',
  '- **Decided:** ',
  '- **Why:** ',
  '- **Not done / blocked:** ',
  '- **Next step (first thing to do):** ',
  '- **How to check it worked:** ',
  '',
].join('\n');

function git(root, args) {
  const bin = process.env.HANDOFF_GIT_BIN || 'git';
  const r = spawnSync(bin, ['-C', root, ...args], { encoding: 'utf8', timeout: 20000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', NO_COLOR: '1', GIT_PAGER: 'cat' } });
  return { ok: !r.error && r.status === 0, out: (r.stdout || '').replace(/\s+$/, ''), missing: !!(r.error && r.error.code === 'ENOENT') };
}

function gitState(root, nCommits) {
  const probe = git(root, ['rev-parse', '--is-inside-work-tree']);
  if (probe.missing) return { unverified: 'git is not installed' };
  if (!probe.ok || probe.out !== 'true') return { unverified: 'not a git repository' };
  const s = {};
  const br = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  s.hasCommits = git(root, ['rev-parse', '--verify', '-q', 'HEAD']).ok;
  s.branch = br.ok ? br.out : '(unknown — no commits yet?)';
  if (s.branch === 'HEAD') s.branch = `detached at ${git(root, ['rev-parse', '--short', 'HEAD']).out}`;
  s.commits = s.hasCommits ? git(root, ['log', '-n', String(nCommits), '--date=short', '--pretty=format:%h  %ad  %s']).out.split('\n').filter(Boolean) : [];
  const st = git(root, ['status', '--porcelain=v1', '--untracked-files=all']);
  s.statusLines = st.ok ? st.out.split('\n').filter(Boolean) : [];
  const counts = { staged: 0, modified: 0, deleted: 0, untracked: 0, conflicted: 0 };
  const changed = new Set();
  for (const l of s.statusLines) {
    const x = l[0], y = l[1];
    let p = l.slice(3);
    if (p.includes(' -> ')) p = p.split(' -> ')[1];
    p = p.replace(/^"|"$/g, '');
    changed.add(p);
    if (x === '?' && y === '?') { counts.untracked++; continue; }
    if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) { counts.conflicted++; continue; }
    if (x !== ' ') counts.staged++;
    if (y === 'M') counts.modified++;
    if (x === 'D' || y === 'D') counts.deleted++;
  }
  s.counts = counts;
  // Files changed on this branch compared with the main line, when one can be found locally.
  s.base = null;
  if (s.hasCommits) {
    for (const cand of ['origin/main', 'origin/master', 'main', 'master']) {
      if (!git(root, ['rev-parse', '--verify', '-q', cand]).ok) continue;
      const mb = git(root, ['merge-base', 'HEAD', cand]);
      if (!mb.ok) continue;
      const head = git(root, ['rev-parse', 'HEAD']).out;
      if (mb.out === head) continue; // this branch IS the base; nothing to compare
      s.base = cand;
      const d = git(root, ['diff', '--name-only', `${mb.out}...HEAD`]);
      if (d.ok) for (const f of d.out.split('\n').filter(Boolean)) changed.add(f);
      break;
    }
  }
  s.changed = [...changed].sort();
  return s;
}

function scanTodos(root, files, limit = 50, skipAbs = null) {
  const out = [];
  let skipped = 0;
  for (const rel of files) {
    if (out.length >= limit) break;
    if (NEVER_READ_RE.test(path.basename(rel))) { skipped++; continue; } // never open env/key files
    const abs = path.join(root, rel);
    if (skipAbs && path.resolve(abs) === path.resolve(skipAbs)) continue; // never re-read our own output
    let buf;
    try { const st = fs.statSync(abs); if (!st.isFile() || st.size > 1024 * 1024) continue; buf = fs.readFileSync(abs); } catch { continue; }
    if (buf.subarray(0, 8192).includes(0)) continue;
    buf.toString('utf8').split(/\r?\n/).forEach((line, i) => {
      if (out.length >= limit) return;
      const m = TODO_RE.exec(line);
      if (m) out.push(`${rel}:${i + 1}  ${m[1]}: ${m[2].trim().slice(0, 140)}`);
    });
  }
  return { todos: out, skipped };
}

function existingDecisions(outPath) {
  let t;
  try { t = fs.readFileSync(outPath, 'utf8'); } catch { return null; }
  const i = t.indexOf(DECISIONS_HEADING);
  if (i < 0) return null;
  return t.slice(i).replace(/\s+$/, '') + '\n';
}

export function buildHandoff(root, { nCommits = 10, outPath } = {}) {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const s = gitState(root, nCommits);
  const L = [];
  L.push('# HANDOFF', '');
  L.push(`Generated: ${now} by scripts/handoff.mjs. Secret-looking strings and email addresses are redacted.`);
  L.push('Read this first when you start a new session. Check anything important against the repo itself; this file is a summary, not the truth.', '');
  let todoInfo = { todos: [], skipped: 0 };
  if (s.unverified) {
    L.push(`> **UNVERIFIED — ${s.unverified}.** Branch, commits, status and changed files could not be read. Fill in the sections below by hand.`, '');
    L.push('## Branch', '', 'UNVERIFIED', '');
    L.push('## Last commits', '', 'UNVERIFIED', '');
    L.push('## Working tree (git status)', '', 'UNVERIFIED', '');
    L.push('## Changed files', '', 'UNVERIFIED', '');
    L.push('## Open TODO / FIXME in changed files', '', 'UNVERIFIED (no list of changed files)', '');
  } else {
    L.push('## Branch', '', `\`${s.branch}\``, '');
    L.push(`## Last commits (newest first, up to ${nCommits})`, '');
    if (s.commits.length) { L.push('```'); L.push(...s.commits); L.push('```'); } else L.push('_No commits yet._');
    L.push('');
    const c = s.counts;
    L.push('## Working tree (git status)', '');
    L.push(s.statusLines.length ? `${s.statusLines.length} path(s) not committed: ${c.staged} staged, ${c.modified} modified, ${c.deleted} deleted, ${c.untracked} untracked, ${c.conflicted} conflicted.` : 'Clean — everything is committed.');
    L.push('');
    L.push('## Changed files', '');
    L.push(s.base ? `Uncommitted changes plus files changed on this branch since it left \`${s.base}\`:` : 'Uncommitted changes (no main branch found locally to compare against):');
    L.push('');
    if (s.changed.length) { for (const f of s.changed.slice(0, 200)) L.push(`- \`${f}\``); if (s.changed.length > 200) L.push(`- …and ${s.changed.length - 200} more`); } else L.push('_None._');
    L.push('');
    todoInfo = scanTodos(root, s.changed, 50, outPath);
    L.push('## Open TODO / FIXME in changed files', '');
    if (todoInfo.todos.length) { L.push('```'); L.push(...todoInfo.todos); L.push('```'); } else L.push('_None found in the changed files._');
    if (todoInfo.skipped) L.push('', `_${todoInfo.skipped} env/key file(s) were not opened, by design._`);
    L.push('');
  }
  const decisions = (outPath && existingDecisions(outPath)) || DEFAULT_DECISIONS;
  const body = L.join('\n') + '\n' + decisions;
  const redacted = redact(body);
  const redactions = (redacted.match(/\[REDACTED:/g) || []).length - (body.match(/\[REDACTED:/g) || []).length;
  return { text: redacted, state: s, todos: todoInfo.todos.length, redactions };
}

// ---------- selftest ----------
function selftest() {
  let assertions = 0, failures = 0;
  const check = (cond, msg) => { assertions++; if (!cond) { failures++; console.log(`  FAIL: ${msg}`); } };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

  // Fake secrets are assembled at runtime so this file never contains one.
  const secrets = {
    'private-key': '-----BEGIN ' + 'RSA PRIVATE KEY-----',
    'stripe-live-key': 'sk_' + 'live_' + 'A1b2C3d4E5f6G7h8I9j0K1l2',
    'aws-access-key-id': 'AKIA' + 'Q'.repeat(12) + '7777',
    'github-token': 'ghp_' + 'x1Y2'.repeat(9),
    'slack-token': 'xoxb-' + '1234567890-abcdefghij',
    'google-api-key': 'AIza' + 'S'.repeat(35),
    'anthropic-key': 'sk-ant-' + 'api03-' + 'Q'.repeat(30),
    'jwt-service-key': 'eyJ' + 'hbGciOiJIUzI1NiJ9' + '.' + b64({ role: 'service' + '_role', iss: 'x' }) + '.' + 'Sig'.repeat(10),
    'db-url-with-credentials': 'postgres://admin:' + 'Hunter2Hunter2' + '@db.internal-host.io:5432/app',
    'generic-secret-assignment': 'api_key = "' + 'Zq8' + 'w7Lm4Np2Rt6Vx9' + '"',
    email: 'jane.doe' + '@' + 'example.org',
  };
  for (const [name, value] of Object.entries(secrets)) {
    const out = redact(`before ${value} after`);
    check(out.includes(`[REDACTED:${name}]`), `redact: ${name} is replaced with [REDACTED:${name}]`);
    const core = name === 'generic-secret-assignment' ? 'Zq8w7Lm4Np2Rt6Vx9' : name === 'db-url-with-credentials' ? 'Hunter2Hunter2' : value;
    check(!out.includes(core), `redact: ${name} value is gone`);
    check(out.startsWith('before ') && out.endsWith(' after'), `redact: text around ${name} survives`);
  }
  // Controls: ordinary text must survive byte-for-byte.
  const controls = [
    'Fixed the login bug in src/auth.js (see issue #42).',
    'Version 1.2.3 released on 2026-09-01; it costs $20/month.',
    'Use sk_test_ keys in staging, never live ones.',
    'Ask the @support handle on chat.',
    'password: see the password manager',
    'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    'Docs: https://example.com/docs?page=2#setup',
    'const token = process.env.API_TOKEN;',
    'eyJ' + 'hbGciOiJIUzI1NiJ9' + '.' + b64({ role: 'anon' }) + '.' + 'Sig'.repeat(10),
  ];
  for (const c of controls) check(redact(c) === c, `control survives unchanged: ${c.slice(0, 40)}`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-selftest-'));
  const prevCeil = process.env.GIT_CEILING_DIRECTORIES;
  process.env.GIT_CEILING_DIRECTORIES = path.dirname(tmp);
  const hasGit = !git(tmp, ['--version']).missing;
  let e2e = 'skipped (git not installed)';
  if (hasGit) {
    const repo = path.join(tmp, 'repo');
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    const g = (...a) => git(repo, ['-c', 'user.name=selftest', '-c', 'user.email=selftest@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=' + path.join(tmp, 'no-hooks'), ...a]);
    g('init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(repo, 'README.md'), '# demo\n');
    g('add', '-A');
    g('commit', '-q', '-m', `initial commit, ping ${secrets.email}`);
    g('checkout', '-q', '-b', 'feature/handoff-demo');
    fs.writeFileSync(path.join(repo, 'src', 'a.js'), `// TODO: rotate ${secrets['stripe-live-key']}\n// FIXME: handle the empty list\nexport const a = 1;\n`);
    g('add', '-A');
    g('commit', '-q', '-m', `add a.js with key ${secrets['github-token']}`);
    fs.writeFileSync(path.join(repo, '.env'), 'SECRET=1 # TODO: SHOULD_NOT_APPEAR\n');
    fs.writeFileSync(path.join(repo, 'src', 'b.js'), '// TODO: wire up b\n');
    const outPath = path.join(repo, 'HANDOFF.md');
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--root', repo], { encoding: 'utf8', env: process.env });
    check(r.status === 0, `e2e: handoff exits 0 (got ${r.status}: ${(r.stderr || '').trim()})`);
    const t = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
    check(t.includes('feature/handoff-demo'), 'e2e: branch name present');
    check(t.includes('add a.js with key [REDACTED:github-token]'), 'e2e: commit subject present with token redacted');
    check(t.includes('[REDACTED:email]') && !t.includes(secrets.email), 'e2e: email redacted');
    check(!t.includes(secrets['stripe-live-key']) && !t.includes(secrets['github-token']), 'e2e: no secret values in HANDOFF.md');
    check(/src\/a\.js:2\s+FIXME: handle the empty list/.test(t), 'e2e: FIXME from changed file listed with file:line');
    check(/src\/b\.js:1\s+TODO: wire up b/.test(t), 'e2e: TODO from untracked changed file listed');
    check(!t.includes('SHOULD_NOT_APPEAR'), 'e2e: env file content never read');
    check(t.includes('env/key file(s) were not opened'), 'e2e: skipped env file is reported');
    check(t.includes(DECISIONS_HEADING), 'e2e: Decisions / Next steps section present');
    check(!t.includes('UNVERIFIED'), 'e2e: no UNVERIFIED marker when git works');
    // Human-written decisions survive regeneration.
    fs.writeFileSync(outPath, t.replace('- **Decided:** ', '- **Decided:** keep the retry at 3 attempts'));
    spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--root', repo], { encoding: 'utf8', env: process.env });
    const t2 = fs.readFileSync(outPath, 'utf8');
    check(t2.includes('keep the retry at 3 attempts'), 'e2e: human-written decisions are kept on regenerate');
    check(!/HANDOFF\.md:\d+/.test(t2), 'e2e: regenerating never lists TODOs from HANDOFF.md itself');
    e2e = 'ran';
  }
  // No git repository: still writes a partial file, marked UNVERIFIED.
  const plain = path.join(tmp, 'plain');
  fs.mkdirSync(plain);
  const np = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--root', plain], { encoding: 'utf8', env: process.env });
  const nt = fs.existsSync(path.join(plain, 'HANDOFF.md')) ? fs.readFileSync(path.join(plain, 'HANDOFF.md'), 'utf8') : '';
  check(np.status === 0 && nt.includes('UNVERIFIED — not a git repository') && nt.includes(DECISIONS_HEADING), 'no-repo: partial HANDOFF.md written and marked UNVERIFIED');
  // git binary missing: same.
  const nogit = path.join(tmp, 'nogit');
  fs.mkdirSync(nogit);
  const ng = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--root', nogit], { encoding: 'utf8', env: { ...process.env, HANDOFF_GIT_BIN: path.join(tmp, 'no-such-git') } });
  const ngt = fs.existsSync(path.join(nogit, 'HANDOFF.md')) ? fs.readFileSync(path.join(nogit, 'HANDOFF.md'), 'utf8') : '';
  check(ng.status === 0 && ngt.includes('UNVERIFIED — git is not installed'), 'no-git: partial HANDOFF.md written and marked UNVERIFIED');

  if (prevCeil === undefined) delete process.env.GIT_CEILING_DIRECTORIES; else process.env.GIT_CEILING_DIRECTORIES = prevCeil;
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`handoff selftest: ${failures ? 'FAIL' : 'PASS'} (${assertions - failures}/${assertions} assertions; ${Object.keys(secrets).length} secret types redacted, ${controls.length} controls unchanged, end-to-end ${e2e})`);
  return failures ? 1 : 0;
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/handoff.mjs [--root <dir>] [--out <file>] [--commits <n>] [--stdout] | --selftest');
    return 0;
  }
  if (argv.includes('--selftest')) return selftest();
  const val = (flag, dflt) => { const i = argv.indexOf(flag); return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt; };
  const root = path.resolve(val('--root', process.cwd()));
  const outPath = path.resolve(root, val('--out', 'HANDOFF.md'));
  const nCommits = Math.max(1, Math.min(100, parseInt(val('--commits', '10'), 10) || 10));
  const r = buildHandoff(root, { nCommits, outPath });
  if (argv.includes('--stdout')) { process.stdout.write(r.text); return 0; }
  fs.writeFileSync(outPath, r.text);
  const s = r.state;
  const summary = s.unverified
    ? `UNVERIFIED — ${s.unverified}; wrote a partial file`
    : `branch ${s.branch}, ${s.commits.length} commit(s), ${s.changed.length} changed file(s), ${r.todos} TODO/FIXME`;
  console.log(`Wrote ${path.relative(process.cwd(), outPath) || outPath}: ${summary}; ${r.redactions} value(s) redacted.`);
  console.log('Now fill in "Decisions / Next steps" by hand.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (e) { console.error(`handoff crashed: ${e && e.message}`); process.exitCode = 2; }
}
