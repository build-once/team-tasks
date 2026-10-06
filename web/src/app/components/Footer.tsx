import { appVersion } from "@/lib/app-version";

// The footer, on every screen, saying which build you are looking at.
//
// WHAT IT REPLACED: `<footer className="footer">Team Tasks version 2</footer>`,
// written by hand in web/src/app/page.tsx, on the front page only. There was no
// version 1, nothing decided what "2" meant, and five of the seven screens had no
// footer at all. A footer that answers "is the fix live?" confidently and wrongly
// is worse than none, which is the whole subject of Build it 19.
//
// WHY THE TWO NAMES ARE WRITTEN OUT STATICALLY. Next.js replaces
// `process.env.X` with its literal value at build time, but only when the
// reference is written out -- "dynamic lookups will not be inlined"
// (web/node_modules/next/dist/docs/01-app/02-guides/environment-variables.md, the
// note web/src/lib/env.ts quotes in full). So there is no readSetting(name) helper
// here, for exactly the reason that file gives.
//
// APP_COMMIT is set in web/next.config.ts from VERCEL_GIT_COMMIT_SHA, at build
// time. VERCEL_ENV is read here, where it is `undefined` off Vercel -- which is
// what `appVersion` turns into the local-development sentence.
//
// NO NEW SECRET. A commit SHA names a commit in a public repository, and this
// component puts it on the screen on purpose.
//
// IT IS IN THE ROOT LAYOUT, so there is no screen without it and no screen that
// has to remember to add it.
export function Footer() {
  const version = appVersion(process.env.APP_COMMIT, process.env.VERCEL_ENV);

  return (
    <footer className="footer">
      Team Tasks — {version.label}
    </footer>
  );
}
