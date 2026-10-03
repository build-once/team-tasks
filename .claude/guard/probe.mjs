#!/usr/bin/env node
// Build Once arming probe. Apache-2.0. See .claude/guard/arming-probe.md.
//
//   node .claude/guard/probe.mjs              make a new nonce and print the probe command
//   node .claude/guard/probe.mjs judge NONCE  paste what the assistant's tool call showed,
//                                             then press Ctrl-D; prints ARMED, UNARMED or UNKNOWN
//   node .claude/guard/probe.mjs offline      pipe the probe through the hook script directly
//                                             (proves the script works; NOT proof it is armed)
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = resolve(ROOT, '.claude', 'hooks', 'guard.mjs');
const DENY_MARK = 'Blocked by guard [arming-probe]';

export function probeCommand(nonce) {
  return `echo guard-arming-probe ${nonce}`;
}

// The three outcomes. Silence is not a pass.
export function judge(output, nonce) {
  const nonceSeen = output.includes(nonce);
  const denySeen = output.includes(DENY_MARK);
  if (nonceSeen && !denySeen) return 'UNARMED';
  if (denySeen && !nonceSeen) return 'ARMED';
  return 'UNKNOWN';
}

const [mode, arg] = process.argv.slice(2);

if (!mode) {
  const nonce = 'n' + randomBytes(8).toString('hex');
  console.log(`Nonce: ${nonce}`);
  console.log('Ask the assistant to run exactly this with its Bash tool, and to show you the full result.');
  console.log('On Windows, ask again with its PowerShell tool: every tool that runs commands must be ARMED.');
  console.log('');
  console.log(`    ${probeCommand(nonce)}`);
  console.log('');
  console.log('Then look at what the tool call returned (not the command itself):');
  console.log(`  ARMED    you see "${DENY_MARK}" and the nonce is NOT printed in the output`);
  console.log('  UNARMED  the nonce IS printed in the output (the echo ran, so no guard stopped it)');
  console.log('  UNKNOWN  you see neither. Treat this as a failure: the probe did not really run.');
  console.log(`To have it judged for you: node .claude/guard/probe.mjs judge ${nonce}   (paste the output, then Ctrl-D)`);
  process.exit(0);
}

if (mode === 'judge') {
  if (!arg) { console.error('Usage: node .claude/guard/probe.mjs judge <nonce>'); process.exit(64); }
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  // Remove the command line itself, if it was pasted, so the nonce inside the
  // command text is not mistaken for the nonce being printed by echo.
  const cleaned = text.split(/\r?\n/).filter((l) => !l.includes('guard-arming-probe')).join('\n');
  const verdict = judge(cleaned, arg);
  console.log(verdict);
  process.exit(verdict === 'ARMED' ? 0 : 1);
}

if (mode === 'offline') {
  const nonce = 'n' + randomBytes(8).toString('hex');
  let ok = true;
  for (const tool of ['Bash', 'PowerShell']) {
    const payload = { hook_event_name: 'PreToolUse', cwd: ROOT, tool_name: tool, tool_input: { command: probeCommand(nonce) } };
    const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8' });
    const out = `${r.stdout || ''}${r.stderr || ''}`;
    const denied = r.status === 2 && out.includes(DENY_MARK) && !out.includes(nonce);
    if (!denied) console.log(`Hook script did NOT deny the probe for the ${tool} tool (exit ${r.status}). Fix this first.`);
    ok = ok && denied;
  }
  if (ok) console.log('Hook script denies the probe for Bash and PowerShell (exit 2). This proves the script and rules work. It does NOT prove the hook is armed in your session; use the live probe for that.');
  process.exit(ok ? 0 : 1);
}

console.error('Unknown mode. Use no argument, "judge <nonce>" or "offline".');
process.exit(64);
