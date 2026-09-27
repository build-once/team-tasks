#!/usr/bin/env node
// .github/ai-team/check-proposal.mjs -- checks a proposed code change from the
// builder or the fixer. No AI. Writes nothing to GitHub.
//
// Refuses the change unless ALL of these hold:
//   * the form is valid, and the files it declares are exactly the files the
//     diff changes (the diff is taken by record.mjs, not written by the agent);
//   * every file is inside this agent's path allow-list and none is protected;
//   * the agent's starting point is still current (not a stale base);
//   * the execution file proves the required commands (the tests) really ran;
//   * no secret was found in the diff;
//   * (fixer) no test was deleted, skipped or had an assertion removed or
//     changed, and only a failure classified broken_app gets a code change.
// It also works out the risk tier from the real diff.
//
//   node .github/ai-team/check-proposal.mjs --agent builder|fixer --record DIR --base SHA --current SHA
//
// Writes DIR/verdict.json and outputs ok=true|false and tier=low|medium|high.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, loadSchema, validate, parseExecution, checkProposal, readJsonIfPresent, setOutput, summary, notice, args, run } from "./lib.mjs";

// Pure: everything is passed in.
export function verdictFor(agent, { cfg, form, patchText, exec, stats, baseSha, currentSha }) {
  const rules = agent === "builder" ? cfg.builder : cfg.fixer;
  const formProblems = form ? validate(form, loadSchema(agent)) : ["no form was returned"];
  const v = checkProposal({
    patchText,
    declaredFiles: form?.files_changed ?? [],
    allowedPaths: rules.allowed_paths,
    protectedPaths: cfg.protected_paths,
    baseSha,
    currentSha,
    exec,
    requiredCommands: rules.required_commands,
    testPaths: cfg.test_paths,
    riskTiers: cfg.builder.risk_tiers,
    assertions: agent === "fixer" ? "refuse" : "raise-tier",
  });
  const reasons = [...formProblems.map((p) => `form: ${p}`), ...v.reasons];
  if (stats?.redacted_in_patch) reasons.push("a secret was found in the diff");

  let noChangeWanted = false;
  if (agent === "fixer" && form && !formProblems.length) {
    const broken = form.failures.some((f) => f.classification === "broken_app");
    if (!broken) {
      noChangeWanted = true;
      // Changing nothing is the RIGHT answer when no failure is broken_app.
      // (and with no change, there was nothing to test).
      for (let i = reasons.length - 1; i >= 0; i--) {
        if (reasons[i] === "the proposal changes nothing" || (!v.paths.length && reasons[i].startsWith("required command never ran"))) reasons.splice(i, 1);
      }
      if (v.paths.length) reasons.push("code was changed although no failure was classified broken_app");
      else reasons.push("no change proposed: no failure was classified broken_app");
    }
  }
  return { ok: reasons.length === 0, reasons, tier: v.tier, paths: v.paths, evidence: v.evidence.map((e) => e.command), assertion: v.assertion, noChangeWanted };
}

async function main() {
  const a = args();
  const agent = a.agent;
  if (agent !== "builder" && agent !== "fixer") throw new Error("--agent must be builder or fixer");
  const dir = a.record;
  const cfg = loadConfig();
  const execPath = join(dir, "execution.json");
  let exec = null;
  if (existsSync(execPath)) {
    try { exec = parseExecution(JSON.parse(readFileSync(execPath, "utf8"))); } catch { exec = null; }
  }
  const patchPath = join(dir, "change.patch");
  const v = verdictFor(agent, {
    cfg,
    form: readJsonIfPresent(join(dir, "proposal.json")),
    patchText: existsSync(patchPath) ? readFileSync(patchPath, "utf8") : "",
    exec,
    stats: readJsonIfPresent(join(dir, "stats.json")),
    baseSha: a.base,
    currentSha: a.current,
  });
  writeFileSync(join(dir, "verdict.json"), JSON.stringify(v, null, 2));
  setOutput("ok", v.ok ? "true" : "false");
  setOutput("tier", v.tier);
  notice(
    `${agent} proposal check`,
    `${v.ok ? "PASSED" : "REFUSED"}; tier ${v.tier}; files [${v.paths.join(", ")}]; tests found: ${v.evidence.length ? "yes" : "no"}` +
      (v.reasons.length ? `; reasons: ${v.reasons.join(" | ")}` : ""),
  );
  summary([
    `### ${agent} proposal check: ${v.ok ? "PASSED" : "REFUSED"}`,
    "",
    `- Files: ${v.paths.length ? v.paths.map((p) => `\`${p}\``).join(", ") : "none"}`,
    `- Risk tier (from the real diff): **${v.tier}**`,
    `- Required commands found in the execution file: ${v.evidence.length ? v.evidence.map((c) => `\`${c}\``).join(", ") : "none"}`,
    ...v.reasons.map((r) => `- Refused because: ${r}`),
  ].join("\n"));
}

run(import.meta.url, main, "proposal check");
