import Link from "next/link";

import { useEmailLink } from "@/app/auth/confirm/actions";
import { ActButton } from "@/app/components/ActButton";
import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
import { refusalSentence } from "@/lib/auth-messages";
import { BUTTON_IDS } from "@/lib/buttons";
import {
  LINK_TYPE_FIELD,
  LINK_WORDS,
  TOKEN_HASH_FIELD,
  confirmView,
  readLinkType,
  readTokenHash,
} from "@/lib/email-links";

// Where a link from an email lands, and the one page in this app that exists so
// that a GET does nothing.
//
// Build it 25 part 1, issue #284.
//
// ---------------------------------------------------------------------------
// WHAT THIS PAGE DOES NOT DO, WHICH IS THE WHOLE POINT
// ---------------------------------------------------------------------------
//
// It does not verify the link. It does not call Supabase at all. It reads two
// values out of the address bar, decides whether they are the shape of
// something this app sent, and draws a button. The token is spent by
// `useEmailLink` in ./actions.ts, which only a press can reach.
//
// So the owner's mail scanner -- which made a HEAD request to a reset link on
// 11 October 2026, before anybody clicked -- gets this page and costs the
// person nothing. Supabase names the problem itself, and naming a button as one
// of its two remedies: web/src/lib/email-links.ts carries the quotation and the
// page it is from.
//
// ---------------------------------------------------------------------------
// TWO STATES, AND NOTHING ELSE
// ---------------------------------------------------------------------------
//
// The same shape as /reset-password (issue #120 rule 3): either there is a
// usable-looking link and the page offers a button for it, or there is not and
// the page says so and offers a way to ask for another. There is no state in
// which it shows an address, a name, or anything at all about whether an
// account exists.
//
// THE TOKEN HASH IS NEVER DRAWN. It goes into a hidden field so the press can
// carry it back, and nowhere else -- not into the heading, not into a link, not
// into a message. `refusalSentence` draws from this app's own table keyed by a
// short code, so an unrecognised word in the address bar prints nothing at all;
// that is the property web/src/app/invite/[token]/page.tsx already has, for the
// same reason (issue #45).
//
// IT IS REACHABLE WHILE SIGNED OUT, which is what "/auth" being in
// web/src/lib/supabase/proxy.ts's PUBLIC_PATHS already arranges: being signed
// out is the whole reason somebody is following one of these links.
export default async function ConfirmLinkPage({
  searchParams,
}: PageProps<"/auth/confirm">) {
  const parameters = await searchParams;

  const token = readTokenHash(parameters[TOKEN_HASH_FIELD]);
  const type = readLinkType(parameters[LINK_TYPE_FIELD]);
  const refused = refusalSentence(parameters.refused);

  const view = confirmView({
    tokenHash: token,
    type,
    // `?refused=` is set by this app, by the action, when Supabase would not
    // accept the link. Any other value, including one somebody typed, lands on
    // the same screen -- which is the safe one.
    refused: parameters.refused !== undefined,
  });

  if (view === "dead" || token === null || type === null) {
    return (
      <>
        <Header />

        <main className="page stack">
          <h1>That link didn&apos;t work</h1>

          {/* The sentence comes from the code the action sent, so a link that
              has EXPIRED is told it expired and a rate limit is told it is a
              rate limit. With no recognised code -- somebody opening this
              address by hand, or a link with nothing in it -- nothing is drawn
              beyond the heading and the way out. */}
          {refused ? (
            <Banner tone="bad" icon="alert">
              {refused}
            </Banner>
          ) : null}

          <p className="switch">
            <Link href="/forgot-password">Ask for a new link</Link>
          </p>

          <p className="switch">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </main>
      </>
    );
  }

  const words = LINK_WORDS[type];

  return (
    <>
      <Header />

      <main className="page stack">
        <h1>{words.heading}</h1>
        <p className="lede">{words.lede}</p>

        <form className="card" action={useEmailLink}>
          {/* The two hidden fields are the whole of what the press carries.
              The action re-reads both through the same two functions this page
              used, rather than trusting them because this page wrote them: a
              post made by hand never passes through here. */}
          <input type="hidden" name={TOKEN_HASH_FIELD} value={token} />
          <input type="hidden" name={LINK_TYPE_FIELD} value={type} />

          <ActButton
            className="btn btn--primary btn--block"
            act={BUTTON_IDS.linkUse}
          >
            {words.button}
          </ActButton>
        </form>
      </main>
    </>
  );
}
