import { Header } from "@/app/components/Header";
import {
  LAST_UPDATED,
  PRIVACY,
  PRIVACY_INTRO,
  PRIVACY_META,
  PRIVACY_TITLE,
} from "@/lib/legal";

// The privacy page. Build it 26, PR 1. Issue #204.
//
// THIS FILE CONTAINS NO SENTENCE, AND THAT IS THE POINT. Every word comes from
// web/src/lib/legal.ts, which is the one place both documents' wording lives --
// the shape web/src/lib/turnstile.ts already has for the four anti-robot
// sentences, for the reason Build it 25 gives: words drawn by one thing "cannot
// drift into saying three things". Two long documents have far more room to
// drift than four sentences do.
//
// scripts/screen-state-check.mjs section 11 refuses a sentence-shaped literal in
// this file, so the discipline is checked rather than remembered.
//
// IT IS PUBLIC, and that needs one line in one other file:
// web/src/lib/supabase/proxy.ts's PUBLIC_PATHS. Without it the Proxy sends a
// signed-out visitor to /login, which would make a privacy page readable only by
// people who already have an account -- the exact opposite of what it is for.
//
// NO NOINDEX, NO ROBOTS RULE, on purpose: this is a page that should be findable.
//
// WHY THERE IS NO "LAST REVIEWED" LINE. The owner's answer 5 of 13 Oct 2026: the
// owner reads both documents himself, and that is NOT a legal review. So nothing
// here may read as one -- no reviewer, no badge, no seal, and no date presented
// as a review date. `LAST_UPDATED` is when the words changed and says so.

export const metadata = PRIVACY_META;

export default function Privacy() {
  return (
    <>
      <Header />

      <main className="page stack">
        <h1>{PRIVACY_TITLE}</h1>

        <p className="lede">{PRIVACY_INTRO}</p>

        {PRIVACY.map((section) => (
          <section className="stack" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </section>
        ))}

        <p className="switch">{LAST_UPDATED}</p>
      </main>
    </>
  );
}
