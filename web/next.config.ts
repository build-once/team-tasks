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
  // ---------------------------------------------------------------------------
  // The commit this build came from (Build it 19, rule 8)
  // ---------------------------------------------------------------------------
  //
  // The footer says which build you are looking at, and this is where the answer
  // is captured. `env` is a BUILD-TIME substitution -- "Next.js will replace
  // process.env.customKey with 'my-value' at build time"
  // (web/node_modules/next/dist/docs/01-app/03-api-reference/05-config/
  // 01-next-config-js/env.md) -- which is exactly right for a fact about the
  // build. Reading the name inside a page instead would make the footer depend on
  // whether the platform also sets it at run time, and nothing in this repository
  // can check that.
  //
  // VERCEL_GIT_COMMIT_SHA IS THE NAME, and it is not remembered: the installed
  // Next.js reads that exact name for this exact purpose, falling back to git --
  // `if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;`
  // in web/node_modules/next/dist/lib/helpers/git.js, lines 48-57.
  //
  // ?? "" rather than leaving it undefined: `env` values are substituted as
  // written, and an undefined one would put the literal `undefined` in the output,
  // which is the thing rule 4 forbids. An empty string is what `appVersion` in
  // web/src/lib/app-version.ts turns into the local-development sentence -- so a
  // build off Vercel (a laptop, the CI job) says so rather than naming a commit it
  // does not know.
  //
  // NO NEW SECRET. A commit SHA names a commit in a public repository and the
  // footer prints it on purpose. The env doc notes a value set this way is
  // included in the JavaScript bundle whatever it is called; that is acceptable
  // for this value and would not be for any other, which is why nothing else is
  // put here.
  env: {
    APP_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
  },

  // Next.js 16.3 and later write AGENTS.md and CLAUDE.md into the project when
  // `next dev` detects a coding agent. This project's only instruction files
  // are the AGENTS.md and CLAUDE.md at the repository root, which a person
  // owns and changes. Generated ones would sit closer to the app code and win
  // on specificity, so they are switched off here.
  // https://nextjs.org/docs/app/guides/ai-agents (see "Opting out")
  agentRules: false,
};

export default nextConfig;
