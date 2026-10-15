import Link from "next/link";

import { appVersion } from "@/lib/app-version";
import {
  PRIVACY_TITLE,
  SUPPORT_ADDRESS,
  SUPPORT_TITLE,
  TERMS_TITLE,
} from "@/lib/legal";

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
//
// AND THAT IS WHY THE TWO LINKS ADDED IN BUILD IT 26 ARE HERE. Issue #204's first
// condition is that a privacy page is "reachable from every screen -- most
// naturally from the footer, which is already in the root layout". Any other
// placement would be a list of screens somebody has to keep in step; this is the
// one component there is no screen without.
//
// The two labels come from web/src/lib/legal.ts rather than being typed here, so
// the words on the link and the heading on the page cannot drift apart.
export function Footer() {
  const version = appVersion(process.env.APP_COMMIT, process.env.VERCEL_ENV);

  return (
    <footer className="footer">
      Team Tasks — {version.label}
      {" · "}
      <Link href="/privacy">{PRIVACY_TITLE}</Link>
      {" · "}
      <Link href="/terms">{TERMS_TITLE}</Link>
      {" · "}
      {/* CONTACT US (Build it 29, Lesson J26). Here for the same reason the two
          links beside it are: this component is in the root layout, so there is no
          screen without it and no screen that has to remember to add it. From any
          page that is ONE TAP, which is inside the owner's "three taps or fewer".

          A `mailto:` AND NOT A PAGE, which is the whole of this feature. A contact
          page would be a page with a form on it -- a new endpoint taking text from
          a stranger, a new thing to rate-limit, a new CAPTCHA, and a new store of
          addresses. The same argument the deletion-request page already settled
          (decision 10, 12 October 2026): nothing is collected in the app, and the
          owner's own mailbox is the store.

          NOT A NEW `PUBLIC_PATHS` ENTRY either, because there is no path: this
          works signed out, on every screen, with no proxy rule to keep in step. */}
      <a href={`mailto:${SUPPORT_ADDRESS}`}>{SUPPORT_TITLE}</a>
    </footer>
  );
}
