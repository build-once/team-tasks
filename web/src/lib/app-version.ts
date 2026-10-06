// app-version.ts -- what the footer says about which build you are looking at.
//
// WHY IT MATTERS ENOUGH TO BE A FILE. The footer used to read "Team Tasks version
// 2", written by hand in web/src/app/page.tsx. There was no version 1 and nothing
// anywhere decided what "2" meant. When the owner asks "is the fix live?", a
// footer like that answers confidently and wrongly, which is worse than a footer
// that says nothing -- and it is the exact failure this whole issue is about.
//
// So the footer now says the COMMIT the build came from, and the commit comes from
// the thing that actually built it.
//
// WHERE THE COMMIT COMES FROM, and this is the one fact worth citing rather than
// remembering. The installed Next.js reads exactly this name for exactly this
// purpose:
//
//     function getGitCommit(cwd) {
//         if (process.env.VERCEL_GIT_COMMIT_SHA) {
//             return process.env.VERCEL_GIT_COMMIT_SHA;
//         }
//         try { return gitExec('rev-parse HEAD', cwd); } catch { return undefined; }
//     }
//
//     web/node_modules/next/dist/lib/helpers/git.js, lines 48-57
//
// So `VERCEL_GIT_COMMIT_SHA` is the name, and a build that is not on Vercel has
// none -- which is the "say something honest in local development" half of the
// requirement, and the reason the fallback below is a sentence rather than a
// shrug.
//
// IT IS READ AT BUILD TIME, NOT AT RUN TIME. web/next.config.ts puts it into the
// `env` config, which the version-matched docs describe as a build-time
// substitution: "Next.js will replace process.env.customKey with 'my-value' at
// build time" (web/node_modules/next/dist/docs/01-app/03-api-reference/05-config/
// 01-next-config-js/env.md). That is deliberate. "The commit the build came from"
// is a fact about the build, so it is captured by the build; reading it per
// request would make the footer depend on whether the platform also sets the name
// at run time, which is not something this repository can check.
//
// NO NEW SECRET, and nothing here is one. A commit SHA names a commit in a public
// repository; the footer puts it on the screen on purpose, so there is nothing to
// keep. The env doc notes a value configured this way is included in the
// JavaScript bundle whatever it is called, and that is fine for this value and
// would not be for any other.
//
// NO IMPORTS, so scripts/screen-state-check.mjs can load it with a plain `node`
// run. It reads no environment variable itself -- both values are passed in --
// which is what makes it answerable without a build.

// What the footer says when there is no commit to name. A sentence, not a dash:
// somebody looking at a footer wants to know whether they are looking at a
// deployed build, and "Local development" answers that.
//
// It is also what a build on any machine that is not Vercel gets, which includes
// the CI build in .github/workflows/ci.yml. That is correct rather than a gap: a
// CI build is not a deployment, and nobody reads its footer.
export const NO_VERSION_LABEL = "Local development — no deployed version";

// How much of the commit to show. Seven characters is what `git log --oneline`
// prints and what GitHub puts in a URL, so it is the form somebody can paste into
// a search and find the commit with.
export const SHORT_COMMIT_LENGTH = 7;

// A commit SHA, as git writes one: 40 hex digits. Checked rather than trusted,
// because the alternative is a footer that will print whatever string the
// environment happened to hold -- including the words "null" or "undefined",
// which is the thing this issue's rule 4 forbids outright.
const COMMIT_PATTERN = /^[0-9a-f]{40}$/i;

// The deployment names Vercel uses, and the word each one gets on screen.
//
// "Production" is left OFF the label on purpose: the live site is the thing
// somebody is normally looking at, so saying so every time is noise. A PREVIEW is
// the thing worth labelling, because a preview that looks like production is how
// somebody tests the wrong deployment and reports the wrong result.
const WHERE_WORDS: Readonly<Record<string, string>> = {
  production: "",
  preview: "preview",
  development: "development",
};

export type AppVersion = {
  // What the footer draws. Never empty, never null, never "undefined".
  label: string;
  // The short commit on its own, or null when there is none. The footer does not
  // use this; the check script does, and so would anything that wanted to link
  // to the commit later.
  commit: string | null;
};

/**
 * What the footer says.
 *
 * `commit` the full SHA from the build, or anything at all when there is none:
 *          undefined, an empty string, a half-typed value, the word "undefined".
 *          Everything that is not 40 hex digits is treated as "no commit", which
 *          is the only honest reading of a value that cannot be a commit.
 * `where`  VERCEL_ENV, which is "production", "preview" or "development". An
 *          unrecognised value is named as it stands rather than hidden, because
 *          a deployment this app does not know about is a thing the owner should
 *          see in the footer -- but it is lower-cased and trimmed first, and the
 *          commit check above means a crafted value cannot smuggle a commit in
 *          with it.
 *
 * Returns the same answer for the same arguments, always. No clock, no
 * environment, no I/O.
 */
export function appVersion(commit: unknown, where: unknown): AppVersion {
  const sha =
    typeof commit === "string" && COMMIT_PATTERN.test(commit.trim())
      ? commit.trim().toLowerCase()
      : null;

  if (sha === null) {
    return { label: NO_VERSION_LABEL, commit: null };
  }

  const short = sha.slice(0, SHORT_COMMIT_LENGTH);
  const place = typeof where === "string" ? where.trim().toLowerCase() : "";

  // A known deployment gets its own word, or no word at all for production. An
  // unknown one is named, because "there is a fourth kind of deployment" is news.
  const word = Object.prototype.hasOwnProperty.call(WHERE_WORDS, place)
    ? WHERE_WORDS[place]
    : place;

  return {
    label: word === "" ? `Version ${short}` : `Version ${short} (${word})`,
    commit: short,
  };
}
