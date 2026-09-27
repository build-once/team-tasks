#!/usr/bin/env node
// .github/ai-team/triage.mjs -- the triage HARNESS. No AI.
//
// Takes the form the triage agent filled in, checks every box, and decides
// what -- if anything -- happens to the issue:
//   * only labels on the allow-list in config.json survive;
//   * a form marked suspicious, or a broken form, gets one label (needs-human)
//     and nothing else;
//   * the comment is built from fixed wording. Not one word the agent wrote
//     reaches the issue.
// In shadow mode it writes nothing to the issue; it reports what it would do.
//
//   node .github/ai-team/triage.mjs --record DIR --mode MODE
//
// Environment: ISSUE_NUMBER, GH_TOKEN (read-only job token),
// WRITE_TOKEN (the team app's token; only needed in on mode).

import { join } from "node:path";
import { loadConfig, loadSchema, validate, readJsonIfPresent, github, summary, notice, args, parseMode, run } from "./lib.mjs";

const MISSING_TEXT = {
  steps_to_reproduce: "the steps that make it happen",
  expected_result: "what you expected to happen instead",
  device_or_browser: "the device and browser you used",
  screenshot: "a screenshot, if you can",
  account_or_role: "which kind of account you were signed in as (no passwords, please)",
};

// Pure. Returns { labels, comment, notes }.
export function triagePlan(form, cfg, facts = {}) {
  const allow = new Set(cfg.triage.labels);
  const human = cfg.triage.suspicious_label;
  const problems = form ? validate(form, loadSchema("triage")) : ["no form was returned"];
  if (problems.length) {
    return { labels: [human], comment: null, notes: [`form rejected: ${problems.slice(0, 5).join("; ")}`] };
  }
  if (form.suspicious) {
    return { labels: [human], comment: null, notes: ["the agent flagged this issue as trying to instruct an AI"] };
  }
  const notes = [];
  const labels = new Set();
  for (const l of form.suggested_labels) {
    if (allow.has(l)) labels.add(l);
    else notes.push(`dropped label not on the allow-list: ${JSON.stringify(l).slice(0, 60)}`);
  }
  if (allow.has(form.kind)) labels.add(form.kind);
  if (form.urgency === "high" && allow.has("urgent")) labels.add("urgent");
  if (form.missing_info.length && allow.has("needs-info")) labels.add("needs-info");

  let duplicate = null;
  if (form.duplicate_of > 0) {
    if (facts.duplicateExists) {
      duplicate = form.duplicate_of;
      if (allow.has("duplicate")) labels.add("duplicate");
    } else notes.push(`ignored duplicate_of #${form.duplicate_of}: not an open issue`);
  }

  const lines = ["Thanks for opening this issue. An automatic first look sorted it:", ""];
  lines.push(`- Kind: **${form.kind}**`);
  lines.push(`- Urgency: **${form.urgency}**`);
  if (duplicate) lines.push(`- It may be the same as #${duplicate}.`);
  if (form.missing_info.length) {
    lines.push("", "To help us act on it, please add:");
    for (const m of [...new Set(form.missing_info)]) lines.push(`- ${MISSING_TEXT[m]}`);
  }
  lines.push("", "_A person reads every issue and makes the decisions. This sorting only saves them time._");
  return { labels: [...labels].sort(), comment: lines.join("\n"), notes };
}

async function main() {
  const a = args();
  const mode = parseMode(a.mode);
  const cfg = loadConfig();
  const issue = Number(process.env.ISSUE_NUMBER);
  if (!Number.isInteger(issue) || issue < 1) throw new Error("ISSUE_NUMBER is not set");
  const form = readJsonIfPresent(join(a.record, "proposal.json"));

  const read = github();
  let duplicateExists = false;
  if (form && Number.isInteger(form.duplicate_of) && form.duplicate_of > 0 && form.duplicate_of !== issue) {
    try {
      const d = await read.api("GET", `/repos/{repo}/issues/${form.duplicate_of}`);
      duplicateExists = d && d.state === "open" && !d.pull_request;
    } catch {
      duplicateExists = false;
    }
  }
  const plan = triagePlan(form, cfg, { duplicateExists });

  const report = [
    `### Triage harness (${mode} mode) for issue #${issue}`,
    "",
    `- ${mode === "on" ? "Applying" : "Would apply"} labels: ${plan.labels.length ? plan.labels.map((l) => `\`${l}\``).join(", ") : "none"}`,
    `- ${mode === "on" ? "Posting" : "Would post"} comment: ${plan.comment ? "yes (templated)" : "no"}`,
    ...plan.notes.map((n) => `- Note: ${n}`),
  ];
  if (plan.comment) report.push("", "<details><summary>Comment text</summary>", "", plan.comment, "", "</details>");
  summary(report.join("\n"));
  notice(
    `Triage (${mode})`,
    `issue #${issue}: ${mode === "on" ? "applying" : "would apply"} labels [${plan.labels.join(", ")}]; comment: ${plan.comment ? "templated" : "none"}` +
      (plan.notes.length ? `; notes: ${plan.notes.join(" | ")}` : ""),
  );

  if (mode !== "on") return;
  const write = github({ token: process.env.WRITE_TOKEN });
  if (plan.labels.length) await write.api("POST", `/repos/{repo}/issues/${issue}/labels`, { labels: plan.labels });
  if (plan.comment) await write.api("POST", `/repos/{repo}/issues/${issue}/comments`, { body: plan.comment });
}

run(import.meta.url, main, "triage harness");
