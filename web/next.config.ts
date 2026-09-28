import type { NextConfig } from "next";

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
