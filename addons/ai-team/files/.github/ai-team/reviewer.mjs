#!/usr/bin/env node
// .github/ai-team/reviewer.mjs -- the reviewer HARNESS. No AI.
//
// Takes the reviewer's findings, keeps only the ones that point at a real
// rule (from docs/review-rules.md ON MAIN) and a file this pull request really
// changes, makes the text safe, and posts or updates ONE plain comment titled
// "AI review". It never approves, never requests changes, never merges.
//
//   node .github/ai-team/reviewer.mjs --record DIR --mode MODE --rules docs/review-rules.md
//
// Environment: PR_NUMBER, GH_TOKEN (read-only job token), WRITE_TOKEN (team
// app, on mode only).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, loadSchema, validate, readJsonIfPresent, github, safeText, summary, notice, args, parseMode, run } from "./lib.mjs";

export const MARKER = "<!-- ai-team:review -->";

// Rule ids look like "- **R1** ..." at the start of a line.
export function ruleIds(markdown) {
  return [...markdown.matchAll(/^\s*[-*]\s+\*\*(R\d{1,3})\*\*/gm)].map((m) => m[1]);
}

// Pure.
export function reviewPlan(form, rules, prFiles, cfg) {
  const problems = form ? validate(form, loadSchema("reviewer")) : ["no form was returned"];
  if (problems.length) {
    return { kept: [], dropped: [], body: `${MARKER}\n**AI review:** the reviewer's answer was rejected by the harness (${safeText(problems.slice(0, 3).join("; "), 300)}). A person should review this change as usual.`, rejected: true };
  }
  const known = new Set(rules);
  const files = new Set(prFiles);
  const kept = [];
  const dropped = [];
  for (const f of form.findings) {
    if (!known.has(f.rule)) dropped.push(`unknown rule ${safeText(f.rule, 20)}`);
    else if (!files.has(f.file)) dropped.push(`${safeText(f.file, 120)} is not changed by this pull request`);
    else kept.push(f);
  }
  const shown = kept.slice(0, cfg.reviewer.max_findings);
  const order = { problem: 0, warning: 1, info: 2 };
  shown.sort((x, y) => order[x.severity] - order[y.severity]);
  const lines = [MARKER, "**AI review** (comments only: a person reviews, decides and merges)", ""];
  if (shown.length === 0) lines.push("No findings against the review rules.");
  for (const f of shown) {
    lines.push(`- **${f.rule}** ${f.severity} at \`${safeText(f.file, 150)}:${f.line}\`: ${safeText(f.problem, 400)}`);
  }
  if (dropped.length) lines.push("", `_${dropped.length} finding(s) dropped by the harness because they did not point at a known rule and a changed file._`);
  return { kept: shown, dropped, body: lines.join("\n"), rejected: false };
}

async function main() {
  const a = args();
  const mode = parseMode(a.mode);
  const cfg = loadConfig();
  const pr = Number(process.env.PR_NUMBER);
  const read = github();
  const rules = ruleIds(readFileSync(a.rules, "utf8"));
  if (rules.length === 0) throw new Error(`no rule ids found in ${a.rules}`);
  const prFiles = (await read.paginate(`/repos/{repo}/pulls/${pr}/files`)).map((f) => f.filename);
  const plan = reviewPlan(readJsonIfPresent(join(a.record, "proposal.json")), rules, prFiles, cfg);

  summary([`### Reviewer harness (${mode} mode) for pull request #${pr}`, "", `- Findings kept: ${plan.kept.length}, dropped: ${plan.dropped.length}`, ...plan.dropped.map((d) => `- Dropped: ${d}`), "", plan.body].join("\n"));
  notice(
    `Reviewer (${mode})`,
    `pull request #${pr}: ${plan.rejected ? "form rejected" : `${plan.kept.length} finding(s) kept, ${plan.dropped.length} dropped`}` +
      (plan.kept.length ? `; ${plan.kept.map((f) => `${f.rule} ${f.severity} ${f.file}:${f.line}`).join(" | ")}` : ""),
  );
  if (mode !== "on") return;

  const write = github({ token: process.env.WRITE_TOKEN });
  const comments = await read.paginate(`/repos/{repo}/issues/${pr}/comments`);
  const mine = comments.find((c) => c.user?.type === "Bot" && typeof c.body === "string" && c.body.startsWith(MARKER));
  if (mine) await write.api("PATCH", `/repos/{repo}/issues/comments/${mine.id}`, { body: plan.body });
  else await write.api("POST", `/repos/{repo}/issues/${pr}/comments`, { body: plan.body });
}

run(import.meta.url, main, "reviewer harness");
