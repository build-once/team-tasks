#!/usr/bin/env node
// .github/ai-team/apply-change.mjs -- does the WRITING for the builder and the
// fixer, after check-proposal.mjs has passed the change. No AI.
//
// Builder: puts the checked diff on a new branch agent/issue-N-RUN, pushes it
//          and opens a DRAFT pull request labelled with its risk tier.
// Fixer:   moves the attempt counter up FIRST, then pushes the checked repair
//          to the same branch. With no acceptable repair, it posts what it
//          found and asks for a person.
//
// It never merges, never approves, never marks a pull request ready, and
// never pushes to main. selftest.mjs checks this file for those calls.
//
//   node .github/ai-team/apply-change.mjs --agent builder --record DIR
//   node .github/ai-team/apply-change.mjs --agent fixer   --record DIR
//
// Run from the repository folder, already checked out at the right commit.
// Environment: WRITE_TOKEN, APP_SLUG, and ISSUE_NUMBER + RUN_ID + BASE_BRANCH (builder) or
// PR_NUMBER + HEAD_BRANCH + ATTEMPT (fixer).

import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { loadConfig, github, readJsonIfPresent, safeText, summary, notice, args, run } from "./lib.mjs";

function git(...argv) {
  return execFileSync("git", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

// Pushes with the token in a one-off header: it never lands in .git/config,
// in the remote URL or in the log.
function push(token, branch) {
  if (!branch || branch === "main" || branch === "master" || !branch.startsWith("agent/")) {
    throw new Error(`refusing to push to ${branch}: the harness only pushes agent/ branches`);
  }
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  git("-c", `http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}`, "push", "origin", `HEAD:refs/heads/${branch}`);
}

async function commitAs(gh, slug, message) {
  const bot = await gh.api("GET", `/users/${encodeURIComponent(`${slug}[bot]`)}`);
  git("-c", `user.name=${slug}[bot]`, "-c", `user.email=${bot.id}+${slug}[bot]@users.noreply.github.com`, "commit", "--no-verify", "-m", message);
}

async function builder(dir, cfg) {
  const token = process.env.WRITE_TOKEN;
  const gh = github({ token });
  const issue = Number(process.env.ISSUE_NUMBER);
  const verdict = readJsonIfPresent(join(dir, "verdict.json"));
  if (!verdict) throw new Error("verdict.json missing");
  if (!verdict.ok) {
    await gh.api("POST", `/repos/{repo}/issues/${issue}/comments`, {
      body: [
        "**The harness refused the builder's proposal.** Nothing was opened.",
        "",
        ...verdict.reasons.map((r) => `- ${safeText(r, 300)}`),
        "",
        `Run record: ${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.RUN_ID}`,
      ].join("\n"),
    });
    summary("Refused; reasons posted on the issue.");
    notice("Builder harness (on)", `refused; reasons posted on issue #${issue}`);
    return;
  }
  const form = readJsonIfPresent(join(dir, "proposal.json"));
  const branch = `${cfg.builder.branch_prefix}issue-${issue}-${process.env.RUN_ID}`;

  git("switch", "-c", branch);
  git("apply", "--index", join(dir, "change.patch"));
  await commitAs(gh, process.env.APP_SLUG, `Builder: proposal for #${issue}\n\nProposed by the AI builder, checked by the harness. Tier: ${verdict.tier}.`);
  push(token, branch);

  const body = [
    `Proposed change for #${issue}. **Draft: a person reviews, marks it ready and merges.**`,
    "",
    `- Risk tier (worked out from the real diff): **${verdict.tier}**`,
    `- Files: ${verdict.paths.map((p) => `\`${p}\``).join(", ")}`,
    `- Test commands found in the run's execution file: ${verdict.evidence.map((c) => `\`${safeText(c, 120)}\``).join(", ") || "none"}`,
    `- Run record: ${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.RUN_ID}`,
    "",
    "<details><summary>The builder's own summary (its words, not checked)</summary>",
    "",
    safeText(form?.summary ?? "", 1500),
    "",
    "</details>",
    "",
    `Closes #${issue}`,
  ].join("\n");
  const pr = await gh.api("POST", "/repos/{repo}/pulls", {
    title: `Builder: #${issue}`,
    head: branch,
    base: process.env.BASE_BRANCH || "main",
    body,
    draft: true,
  });
  await gh.api("POST", `/repos/{repo}/issues/${pr.number}/labels`, { labels: [`tier:${verdict.tier}`, "agent"] });
  await gh.api("POST", `/repos/{repo}/issues/${issue}/comments`, { body: `The builder's proposal is ready for review as a draft: #${pr.number} (tier: ${verdict.tier}).` });
  summary(`Opened draft pull request #${pr.number} on branch \`${branch}\`.`);
  notice("Builder harness (on)", `opened draft pull request #${pr.number} (tier ${verdict.tier}) on ${branch}`);
}

async function fixer(dir, cfg) {
  const token = process.env.WRITE_TOKEN;
  const gh = github({ token });
  const pr = Number(process.env.PR_NUMBER);
  const attempt = Number(process.env.ATTEMPT);
  const branch = process.env.HEAD_BRANCH;
  const prefix = cfg.fixer.attempt_label_prefix;
  const verdict = readJsonIfPresent(join(dir, "verdict.json"));
  const form = readJsonIfPresent(join(dir, "proposal.json"));
  if (!verdict) throw new Error("verdict.json missing");
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > cfg.fixer.max_attempts) throw new Error(`bad attempt number ${attempt}`);

  // 1. The counter moves BEFORE anything is pushed, so the next failure sees it.
  const current = await gh.api("GET", `/repos/{repo}/issues/${pr}/labels`);
  for (const l of current) {
    if (l.name.startsWith(prefix)) await gh.api("DELETE", `/repos/{repo}/issues/${pr}/labels/${encodeURIComponent(l.name)}`).catch(() => {});
  }
  await gh.api("POST", `/repos/{repo}/issues/${pr}/labels`, { labels: [`${prefix}${attempt}`] });

  const findings = (form?.failures ?? []).map((f) => `- \`${safeText(f.test, 120)}\`: **${f.classification}**, ${safeText(f.reason, 300)}`);

  if (verdict.ok) {
    git("apply", "--index", join(dir, "change.patch"));
    await commitAs(gh, process.env.APP_SLUG, `Fixer: attempt ${attempt} for #${pr}\n\nProposed by the AI fixer, checked by the harness (no assertion weakened).`);
    push(token, branch);
    await gh.api("POST", `/repos/{repo}/issues/${pr}/comments`, {
      body: [`**Fixer, attempt ${attempt} of ${cfg.fixer.max_attempts}:** pushed a repair. The checks will run again.`, "", ...findings].join("\n"),
    });
    summary(`Pushed fixer attempt ${attempt} to \`${branch}\`.`);
    notice("Fixer harness (on)", `pushed attempt ${attempt} to ${branch}`);
    return;
  }

  await gh.api("POST", `/repos/{repo}/issues/${pr}/labels`, { labels: ["needs-human"] });
  await gh.api("POST", `/repos/{repo}/issues/${pr}/comments`, {
    body: [
      `**Fixer, attempt ${attempt} of ${cfg.fixer.max_attempts}: nothing pushed. A person needs to look.**`,
      "",
      ...verdict.reasons.map((r) => `- ${safeText(r, 300)}`),
      "",
      "What the fixer found:",
      ...(findings.length ? findings : ["- (no classification returned)"]),
    ].join("\n"),
  });
  summary(`Fixer attempt ${attempt}: nothing pushed; asked for a person.`);
  notice("Fixer harness (on)", `attempt ${attempt}: nothing pushed; asked for a person`);
}

async function main() {
  const a = args();
  const cfg = loadConfig();
  if (a.agent === "builder") return builder(a.record, cfg);
  if (a.agent === "fixer") return fixer(a.record, cfg);
  throw new Error("--agent must be builder or fixer");
}

run(import.meta.url, main, "apply change");
