#!/usr/bin/env node
// .github/ai-team/check-assertions.mjs -- does a diff make the tests easier?
// No AI. Refuses any diff that deletes a test file, removes or changes an
// assertion, or skips a test. Adding new assertions is always fine.
//
//   node .github/ai-team/check-assertions.mjs change.patch
//
// Exit codes: 0 = no weakened test   1 = weakened test found   2 = cannot check

import { readFileSync, existsSync } from "node:fs";
import { loadConfig, parsePatch, assertionProblems, isMain } from "./lib.mjs";

if (isMain(import.meta.url)) {
  const file = process.argv[2];
  if (!file || !existsSync(file)) {
    console.error("UNVERIFIED -- give the path of a diff file: node .github/ai-team/check-assertions.mjs change.patch");
    process.exit(2);
  }
  const files = parsePatch(readFileSync(file, "utf8"));
  if (files.length === 0) {
    console.error("UNVERIFIED -- the file contains no diff; nothing was checked.");
    process.exit(2);
  }
  const problems = assertionProblems(files, loadConfig().test_paths);
  for (const p of problems) console.log(`REFUSE  ${p}`);
  console.log(`Checked ${files.length} file(s): ${problems.length} weakened-test problem(s).`);
  process.exit(problems.length ? 1 : 0);
}
