#!/usr/bin/env node
// .github/ai-team/watchdog.mjs -- the WATCHDOG. No AI, and it does not use the
// team's app or key: if those break, the watchdog still works.
//
// Every hour it checks every AI run of the last day:
//   * it finished (not stuck);
//   * if the AI step ran, its record was kept, and the record shows the run
//     ended cleanly, within its turn cap;
//   * builder runs really ran the tests (from the record, not the summary);
//   * the day's total cost is under the limit.
// It keeps ONE issue titled "AI team health" up to date. Sending the outside
// heartbeat is the workflow's last step, so a crashed watchdog sends none.
//
//   node .github/ai-team/watchdog.mjs
//
// Environment: GH_TOKEN (job token: actions read, issues write),
// AI_TEAM_MODE and the per-agent switches (for the report only).

import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { loadConfig, github, parseExecution, findCommands, effectiveMode, parseMode, summary, notice, run } from "./lib.mjs";

export const HEALTH_TITLE = "AI team health";
export const HEALTH_LABEL = "ai-team-health";

// Pure: one run in, one verdict out.
export function evaluateRun({ agent, runInfo, proposeJob, exec, recordPresent, cfg, now = Date.now() }) {
  const notes = [];
  let fail = false;
  const cap = cfg[agent]?.max_turns;
  if (runInfo.status !== "completed") {
    const ageMin = (now - Date.parse(runInfo.created_at)) / 60000;
    if (ageMin > cfg.watchdog.stuck_after_minutes) { fail = true; notes.push(`stuck: still ${runInfo.status} after ${Math.round(ageMin)} minutes`); }
    else notes.push(`still ${runInfo.status}`);
    return { fail, notes, cost: 0 };
  }
  if (runInfo.conclusion !== "success" && runInfo.conclusion !== "skipped") { fail = true; notes.push(`run concluded ${runInfo.conclusion}`); }
  if (!proposeJob || proposeJob.conclusion === "skipped") {
    notes.push("no AI step ran (switch off, or the gate said no)");
    return { fail, notes, cost: 0 };
  }
  if (!recordPresent) { fail = true; notes.push("record missing: the AI step ran but no execution file was kept"); return { fail, notes, cost: 0 }; }
  if (!exec) { fail = true; notes.push("execution file unreadable"); return { fail, notes, cost: 0 }; }
  if (!exec.finished) { fail = true; notes.push("the AI run never reached its end"); }
  if (exec.isError) { fail = true; notes.push(`the AI run ended with an error (${exec.subtype})`); }
  if (cap && exec.turns > cap) { fail = true; notes.push(`turns ${exec.turns} over the cap of ${cap}`); }
  const edited = exec.toolNames.some((t) => t === "Edit" || t === "Write" || t === "MultiEdit");
  if (agent === "builder" || (agent === "fixer" && edited)) {
    const req = cfg[agent].required_commands;
    if (findCommands(exec, req).length === 0) { fail = true; notes.push("tests never ran (from the execution file)"); }
  }
  if (exec.permissionDenials) notes.push(`${exec.permissionDenials} blocked tool call(s)`);
  notes.push(`turns ${exec.turns}, $${exec.costUsd.toFixed(4)}`);
  return { fail, notes, cost: exec.costUsd };
}

async function loadRecord(gh, runId) {
  const arts = await gh.paginate(`/repos/{repo}/actions/runs/${runId}/artifacts`);
  const art = arts.find((x) => x.name === "ai-record" && !x.expired);
  if (!art) return { present: false, exec: null };
  const dir = mkdtempSync(join(tmpdir(), "ai-record-"));
  const res = await fetch(art.archive_download_url, { headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: "application/vnd.github+json" } });
  if (!res.ok) return { present: true, exec: null };
  writeFileSync(join(dir, "r.zip"), Buffer.from(await res.arrayBuffer()));
  execFileSync("unzip", ["-q", "-o", join(dir, "r.zip"), "-d", dir]);
  const p = join(dir, "execution.json");
  if (!existsSync(p)) return { present: true, exec: null };
  try { return { present: true, exec: parseExecution(JSON.parse(readFileSync(p, "utf8"))) }; } catch { return { present: true, exec: null }; }
}

async function main() {
  const cfg = loadConfig();
  const gh = github();
  const since = new Date(Date.now() - cfg.watchdog.window_hours * 3600 * 1000).toISOString();
  const rows = [];
  let cost = 0;
  let failing = 0;
  for (const [agent, { workflow }] of Object.entries(cfg.watchdog.agents)) {
    let runs = [];
    try {
      runs = await gh.paginate(`/repos/{repo}/actions/workflows/${workflow}/runs?created=${encodeURIComponent(`>=${since}`)}`, 200);
    } catch (e) {
      rows.push({ agent, run: "-", fail: true, notes: [`could not list runs: ${e.message.slice(0, 120)}`] });
      failing++;
      continue;
    }
    for (const r of runs) {
      const jobs = await gh.paginate(`/repos/{repo}/actions/runs/${r.id}/jobs`);
      const proposeJob = jobs.find((j) => j.name === "propose");
      let rec = { present: false, exec: null };
      if (proposeJob && proposeJob.conclusion !== "skipped" && r.status === "completed") rec = await loadRecord(gh, r.id);
      const v = evaluateRun({ agent, runInfo: r, proposeJob, exec: rec.exec, recordPresent: rec.present, cfg });
      cost += v.cost;
      if (v.fail) failing++;
      rows.push({ agent, run: `[${r.id}](${r.html_url})`, fail: v.fail, notes: v.notes });
    }
  }
  if (cost > cfg.watchdog.daily_cost_usd) {
    failing++;
    rows.push({ agent: "all", run: "-", fail: true, notes: [`cost $${cost.toFixed(2)} in ${cfg.watchdog.window_hours}h, over the $${cfg.watchdog.daily_cost_usd} limit`] });
  }

  const team = parseMode(process.env.AI_TEAM_MODE);
  const modes = Object.keys(cfg.watchdog.agents).map((a) => `${a}: \`${effectiveMode(process.env.AI_TEAM_MODE, process.env[`AI_${a.toUpperCase()}_MODE`])}\``).join(", ");
  const lines = [
    `Last checked: ${new Date().toISOString()} (window: ${cfg.watchdog.window_hours} hours)`,
    "",
    `Master switch AI_TEAM_MODE: \`${team}\`. Effective per agent: ${modes}.`,
    "",
    failing ? `**FAILING: ${failing} problem(s).** ${cfg.notify ? cfg.notify : ""}`.trim() : "**Healthy.** No problems found.",
    "",
    `Total AI cost in the window: $${cost.toFixed(4)} (limit $${cfg.watchdog.daily_cost_usd}).`,
    "",
    "| Agent | Run | Status | Notes |",
    "| --- | --- | --- | --- |",
    ...rows.map((r) => `| ${r.agent} | ${r.run} | ${r.fail ? "FAILING" : "ok"} | ${r.notes.join("; ").replace(/\|/g, "/")} |`),
    ...(rows.length ? [] : ["| - | - | ok | no AI runs in the window |"]),
    "",
    "_Written by the watchdog workflow, which uses no AI. If this stops updating, the outside heartbeat alerts you._",
  ];
  const body = lines.join("\n");
  summary(body);
  notice("Watchdog", failing ? `FAILING: ${failing} problem(s); ${rows.filter((r) => r.fail).map((r) => `${r.agent}: ${r.notes.join("; ")}`).join(" | ")}` : `healthy; ${rows.length} run(s) checked; cost $${cost.toFixed(4)}`);

  const open = await gh.paginate(`/repos/{repo}/issues?state=open&labels=${HEALTH_LABEL}`, 100);
  const mine = open.find((i) => i.title === HEALTH_TITLE && !i.pull_request);
  if (mine) await gh.api("PATCH", `/repos/{repo}/issues/${mine.number}`, { body });
  else await gh.api("POST", "/repos/{repo}/issues", { title: HEALTH_TITLE, body, labels: [HEALTH_LABEL] });
}

run(import.meta.url, main, "watchdog");
