#!/usr/bin/env node
// Build Once offline checker. Apache-2.0.
// Shows what the guard would decide, without running anything.
//   node .claude/guard/check.mjs "<shell command>"
//   node .claude/guard/check.mjs --tool Write --path some/file.txt
//   node .claude/guard/check.mjs --tool mcp__server__tool --json '{"arg":"value"}'
// Run it yourself in a terminal. If you ask the assistant to run it, the guard
// also checks that command, and may block it because of the text you are testing.
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { loadRules, evaluate } = await import(pathToFileURL(resolve(ROOT, '.claude', 'hooks', 'guard.mjs')).href);

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const tool = opt('--tool') || 'Bash';
let input;
if (tool === 'Bash') {
  const command = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))).join(' ');
  if (!command) {
    console.error('Usage: node .claude/guard/check.mjs "<command>"   or   --tool <Name> --path <file>   or   --tool mcp__x__y --json <args>');
    process.exit(64);
  }
  input = { command };
} else if (opt('--json')) {
  input = JSON.parse(opt('--json'));
} else {
  input = { file_path: opt('--path') };
}

try {
  const rules = loadRules(ROOT);
  const result = evaluate({ tool_name: tool, tool_input: input, cwd: process.cwd() }, rules, ROOT);
  const word = { forbid: 'DENY (forbid)', ask: 'ASK a human', allow: 'ALLOW (guard stays silent)' }[result.decision];
  console.log(`Decision: ${word}`);
  if (result.matches.length === 0) console.log('No rule matched.');
  for (const r of result.matches) {
    console.log(`  - [${r.id}] ${r.decision}: ${r.reason}${r.lesson ? ` (Course: ${r.lesson})` : ''}`);
  }
} catch (e) {
  console.log(`Decision: DENY (fail-closed). The guard could not evaluate this: ${e.message}`);
  process.exit(2);
}
