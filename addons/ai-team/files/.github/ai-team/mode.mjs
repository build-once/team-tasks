#!/usr/bin/env node
// .github/ai-team/mode.mjs -- the first step of every AI workflow. No AI.
//
// Reads the master switch (AI_TEAM_MODE) and this agent's own switch
// (AGENT_MODE, optional) and outputs exactly one of: off, shadow, on.
// Anything unexpected is off. Also outputs the agent's form (schema) as one
// line, ready for --json-schema.
//
//   node .github/ai-team/mode.mjs --agent triage
//
// Exit code is always 0 unless the files it needs are broken: "off" is a
// normal answer, not an error.

import { effectiveMode, loadSchema, modelSchema, setOutput, summary, notice, args } from "./lib.mjs";

const a = args();
const mode = effectiveMode(process.env.AI_TEAM_MODE, process.env.AGENT_MODE);
setOutput("mode", mode);
if (a.agent && a.agent !== "true") {
  setOutput("schema", JSON.stringify(modelSchema(loadSchema(a.agent))));
}
summary(`AI team switch for **${a.agent ?? "team"}**: \`${mode}\``);
notice("AI team switch", `${a.agent && a.agent !== "true" ? a.agent : "team"}: ${mode}`);
