#!/usr/bin/env node
// .github/ai-team/fixer-gate.mjs -- decides whether the fixer may run. No AI.
//
// The fixer runs only when ALL hold:
//   * the checks failed on a branch the builder made (agent/...);
//   * that branch has an open pull request, and the failure is for its latest
//     commit (otherwise a newer run will come along);
//   * the attempt counter (labels fix-attempt-1..N, stored on GitHub, not in
//     the agent) is below the limit, and no one asked for a person (needs-human).
// When the limit is reached it posts, once, "a person needs to look".
// It also saves the end of each failing job's log for the fixer to read.
//
//   node .github/ai-team/fixer-gate.mjs --mode MODE --out DIR
//
// Environment: RUN_CONCLUSION, HEAD_BRANCH, HEAD_SHA, CI_RUN_ID, REPO_OWNER,
// GH_TOKEN (job token: actions read, pull-requests read), WRITE_TOKEN (on mode).

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, github, setOutput, summary, notice, args, parseMode, run } from "./lib.mjs";

export const STOP_MARKER = "<!-- ai-team:fixer-stopped -->";

// Pure.
export function gatePlan({ conclusion, branch, headSha, pr, labels, cfg }) {
  const prefix = cfg.fixer.attempt_label_prefix;
  if (conclusion !== "failure") return { go: false, reason: `checks concluded ${conclusion}, not failure` };
  if (!branch?.startsWith(cfg.builder.branch_prefix)) return { go: false, reason: `branch ${branch} is not an agent branch` };
  if (!pr) return { go: false, reason: "no open pull request for this branch" };
  if (pr.head.sha !== headSha) return { go: false, reason: "the failure is for an older commit; a newer run will follow" };
  const names = labels.map((l) => l.name);
  if (names.includes("needs-human")) return { go: false, reason: "a person has been asked to look (needs-human)" };
  const done = names
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number(n.slice(prefix.length)))
    .filter((n) => Number.isInteger(n) && n > 0);
  const attemptsSoFar = done.length ? Math.max(...done) : 0;
  if (attemptsSoFar >= cfg.fixer.max_attempts) return { go: false, stop: true, reason: `already made ${attemptsSoFar} attempts (limit ${cfg.fixer.max_attempts})` };
  return { go: true, attempt: attemptsSoFar + 1 };
}

async function main() {
  const a = args();
  const mode = parseMode(a.mode);
  const cfg = loadConfig();
  const read = github();
  const branch = process.env.HEAD_BRANCH;
  const owner = process.env.REPO_OWNER;
  const prs = await read.api("GET", `/repos/{repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`);
  const pr = Array.isArray(prs) && prs.length ? prs[0] : null;
  const labels = pr ? await read.api("GET", `/repos/{repo}/issues/${pr.number}/labels`) : [];
  const plan = gatePlan({ conclusion: process.env.RUN_CONCLUSION, branch, headSha: process.env.HEAD_SHA, pr, labels, cfg });

  setOutput("go", plan.go ? "true" : "false");
  if (pr) setOutput("pr", String(pr.number));
  if (plan.go) setOutput("attempt", String(plan.attempt));

  if (!plan.go) {
    notice("Fixer gate", `not running: ${plan.reason}`);
    summary(`### Fixer gate: not running\n\n- ${plan.reason}`);
    if (plan.stop && mode === "on") {
      const comments = await read.paginate(`/repos/{repo}/issues/${pr.number}/comments`);
      if (!comments.some((c) => c.body?.startsWith(STOP_MARKER))) {
        const write = github({ token: process.env.WRITE_TOKEN });
        await write.api("POST", `/repos/{repo}/issues/${pr.number}/labels`, { labels: ["needs-human"] });
        await write.api("POST", `/repos/{repo}/issues/${pr.number}/comments`, {
          body: `${STOP_MARKER}\n**Fixer stopped after ${cfg.fixer.max_attempts} attempts. A person needs to look.** The latest failing run: ${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.CI_RUN_ID}`,
        });
      }
    }
    return;
  }

  // Save the end of every failing job's log for the fixer.
  mkdirSync(a.out, { recursive: true });
  const jobs = await read.paginate(`/repos/{repo}/actions/runs/${process.env.CI_RUN_ID}/jobs`);
  const parts = [];
  for (const j of jobs.filter((x) => x.conclusion === "failure")) {
    let log = "";
    try {
      const res = await fetch(`${process.env.GITHUB_API_URL || "https://api.github.com"}/repos/${read.repo}/actions/jobs/${j.id}/logs`, {
        headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: "application/vnd.github+json" },
      });
      log = res.ok ? await res.text() : `(log not available: ${res.status})`;
    } catch (e) {
      log = `(log not available: ${e.message})`;
    }
    const tail = log.split("\n").slice(-200).join("\n");
    parts.push(`## Failing job: ${j.name}\n\n\`\`\`text\n${tail}\n\`\`\`\n`);
  }
  writeFileSync(join(a.out, "failures.md"), parts.join("\n") || "No failing job logs were found.\n");
  summary(`### Fixer gate: running attempt ${plan.attempt} of ${cfg.fixer.max_attempts} on pull request #${pr.number}`);
  notice("Fixer gate", `running attempt ${plan.attempt} of ${cfg.fixer.max_attempts} on pull request #${pr.number}`);
}

run(import.meta.url, main, "fixer gate");
