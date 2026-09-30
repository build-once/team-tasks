import type { NextConfig } from "next";

import { assertSettingsPresent } from "./src/lib/env";

// Checked here, before anything is compiled, so a missing setting stops the
// build at the top with a message that names it -- rather than building
// successfully and failing later at run time, where the error came from the
// Supabase client and never mentioned the setting.
//
// Next.js loads .env.local before it evaluates this file, so a local build that
// gets its values from web/.env.local still works. Verified by running the build
// both ways; the run log prints "Environments: .env.local" before "Running
// next.config.ts".
assertSettingsPresent();

const nextConfig: NextConfig = {
  // Next.js 16.3 and later write AGENTS.md and CLAUDE.md into the project when
  // `next dev` detects a coding agent. This project's only instruction files
  // are the AGENTS.md and CLAUDE.md at the repository root, which a person
  // owns and changes. Generated ones would sit closer to the app code and win
  // on specificity, so they are switched off here.
  // https://nextjs.org/docs/app/guides/ai-agents (see "Opting out")
  agentRules: false,
};

export default nextConfig;
