import { Header } from "@/app/components/Header";
import {
  LAST_UPDATED,
  TERMS,
  TERMS_INTRO,
  TERMS_META,
  TERMS_TITLE,
} from "@/lib/legal";

// The terms. Build it 26, PR 1.
//
// The same shape as web/src/app/privacy/page.tsx and for the same reasons, which
// that file's header gives in full: no sentence lives here, every word comes from
// web/src/lib/legal.ts, the path is public through
// web/src/lib/supabase/proxy.ts's PUBLIC_PATHS, and nothing on it may read as a
// legal review.
//
// ONE THING THIS DOCUMENT DOES THAT THE PRIVACY PAGE DOES NOT: it says what the
// app does NOT promise. docs/claims.md section 7e's verdict for those rows is
// "ENFORCED by being a disclaimer rather than a claim -- but it must not
// contradict anything the app says elsewhere", which is why the three sentences
// in that section are about availability, support and keeping data, and NOT
// about security or accuracy. The app makes real claims about who can see what,
// and a term disclaiming those would contradict them.

export const metadata = TERMS_META;

export default function Terms() {
  return (
    <>
      <Header />

      <main className="page stack">
        <h1>{TERMS_TITLE}</h1>

        <p className="lede">{TERMS_INTRO}</p>

        {TERMS.map((section) => (
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
