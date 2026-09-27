#!/usr/bin/env node
// .github/ai-team/builder-start.mjs -- the builder's GO BUTTON check. No AI.
//
// The builder may start only when:
//   1. the label added is exactly the go label (agent:build), and
//   2. the person who added it is a person (not a bot) with write access, and
//   3. the issue has a /spec comment written by a person with write access.
// The builder then works from that spec ONLY. The issue's own text, which a
// stranger may have written, never reaches it.
//
// On success it saves the spec to DIR/spec.md and, in on mode, posts a
// decision record: who pressed go, when, and which spec.
//
//   node .github/ai-team/builder-start.mjs --mode MODE --out DIR
//
// Environment: ISSUE_NUMBER, LABEL_NAME, SENDER_LOGIN, SENDER_TYPE,
// GH_TOKEN (read-only job token), WRITE_TOKEN (team app, on mode only).

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, github, summary, notice, setOutput, args, parseMode, CAN_WRITE, run } from "./lib.mjs";

// Pure apart from permOf(login) -> Promise<role>, which is passed in.
export async function decideStart({ label, sender, comments, permOf, cfg }) {
  const go = cfg.builder.go_label;
  const prefix = cfg.builder.spec_prefix;
  if (label !== go) return { ok: false, silent: true, reason: `label is not ${go}` };
  if (sender?.type !== "User") return { ok: false, reason: `the go label was added by a non-person (${sender?.type ?? "unknown"})` };
  if (!CAN_WRITE.has(await permOf(sender.login))) {
    return { ok: false, reason: "only people with write access can start the builder", removeLabel: true };
  }
  const specs = comments
    .filter((c) => c.user?.type === "User" && typeof c.body === "string")
    .filter((c) => c.body.trimStart().startsWith(`${prefix} `) || c.body.trimStart().startsWith(`${prefix}\n`))
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
  for (const c of specs) {
    if (CAN_WRITE.has(await permOf(c.user.login))) {
      const text = c.body.trimStart().slice(prefix.length).trim();
      if (!text) continue;
      return { ok: true, spec: text, specUrl: c.html_url, specAuthor: c.user.login, pressedBy: sender.login };
    }
  }
  return { ok: false, reason: `no ${prefix} comment from a person with write access`, removeLabel: true, askForSpec: true };
}

async function main() {
  const a = args();
  const mode = parseMode(a.mode);
  const cfg = loadConfig();
  const issue = Number(process.env.ISSUE_NUMBER);
  const read = github();
  const cache = new Map();
  const permOf = async (login) => {
    if (!cache.has(login)) cache.set(login, await read.permissionOf(login));
    return cache.get(login);
  };
  const comments = await read.paginate(`/repos/{repo}/issues/${issue}/comments`);
  const d = await decideStart({
    label: process.env.LABEL_NAME,
    sender: { login: process.env.SENDER_LOGIN, type: process.env.SENDER_TYPE },
    comments,
    permOf,
    cfg,
  });

  setOutput("ok", d.ok ? "true" : "false");
  if (d.silent) return;

  if (!d.ok) {
    notice(`Builder go button (${mode})`, `refused: ${d.reason}`);
    summary(`### Builder go button (${mode} mode): refused\n\n- Reason: ${d.reason}\n- ${mode === "on" ? "Removing" : "Would remove"} the ${cfg.builder.go_label} label.`);
    if (mode !== "on") return;
    const write = github({ token: process.env.WRITE_TOKEN });
    if (d.removeLabel) {
      await write.api("DELETE", `/repos/{repo}/issues/${issue}/labels/${encodeURIComponent(cfg.builder.go_label)}`).catch(() => {});
    }
    const body = d.askForSpec
      ? `The builder needs a spec first. A maintainer should add a comment that starts with \`${cfg.builder.spec_prefix}\` describing exactly what should change, then add the \`${cfg.builder.go_label}\` label again.`
      : "Only maintainers can start the builder.";
    await write.api("POST", `/repos/{repo}/issues/${issue}/comments`, { body });
    return;
  }

  mkdirSync(a.out, { recursive: true });
  writeFileSync(join(a.out, "spec.md"), `${d.spec}\n`);
  const when = new Date().toISOString();
  const record = [
    "**Decision record: builder started**",
    "",
    `- Go pressed by: ${d.pressedBy}`,
    `- When: ${when}`,
    `- Spec: ${d.specUrl} (written by ${d.specAuthor})`,
    `- Mode: ${mode}`,
    "",
    "_The builder works only from that spec. It proposes; plain code checks the proposal; a person decides._",
  ].join("\n");
  summary(`### Builder go button (${mode} mode): accepted\n\n${record}`);
  notice(`Builder go button (${mode})`, `accepted: pressed by ${d.pressedBy}; spec by ${d.specAuthor}: ${d.specUrl}`);
  if (mode === "on") {
    await github({ token: process.env.WRITE_TOKEN }).api("POST", `/repos/{repo}/issues/${issue}/comments`, { body: record });
  }
}

run(import.meta.url, main, "builder go button");
