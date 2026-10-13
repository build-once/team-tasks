import type { Metadata } from "next";

import { Header } from "@/app/components/Header";
import {
  REQUEST_ADDRESS,
  REQUEST_DESCRIPTION,
  REQUEST_HEADING,
  REQUEST_SUSPENDED_NOTE,
  REQUEST_WORDS,
  SETTINGS_PATH,
} from "@/lib/account-deletion";

// The public deletion-request page. Build it 26, decision 10 of 2026-10-12.
//
// NO FORM, AND THAT IS THE DECISION RATHER THAN A SIMPLIFICATION. One public
// page that says what deleting does and gives one address to write to. What that
// buys, from docs/deletion.md section 12.1: no row, no endpoint, no email sent
// by this app, no CAPTCHA to add, no rate limit to choose, and no new store of
// strangers' addresses. The alternative -- a form taking an address from an
// unauthenticated stranger -- is the shape issue #122 already records as a
// problem on the one screen that has it.
//
// WHAT IT COSTS, and the page says it rather than hiding it: the owner's own
// mailbox becomes the place a request sits, and the request MUST COME FROM THE
// ADDRESS ON THE ACCOUNT. Without that, anybody who knows a volunteer's address
// could have their account destroyed by sending one email.
//
// WHY IT MUST BE PUBLIC, and this is the half that fails silently and totally:
// `"/delete-account"` is in `PUBLIC_PATHS` in web/src/lib/supabase/proxy.ts.
// Without that line a signed-out visitor is redirected to `/login` -- and the
// whole point of this page is that it is for people who cannot sign in. It is
// also where a SUSPENDED person is sent, and they can sign in: decision 7 refuses
// them the button and the refusal points here, so a page that bounced them would
// be a refusal nobody can act on.
//
// EVERY SENTENCE COMES FROM web/src/lib/account-deletion.ts and this page holds
// none of its own -- the same shape as the privacy page and the terms.

export const metadata: Metadata = {
  title: REQUEST_HEADING,
  description: REQUEST_DESCRIPTION,
};

export default function DeleteAccountRequestPage() {
  return (
    <>
      {/* No `signedIn` and no account: this page is drawn for somebody who may
          well have no session, and the header must not imply one. */}
      <Header />

      <main className="page stack">
        <h1>{REQUEST_HEADING}</h1>

        <div className="card">
          {REQUEST_WORDS.map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
        </div>

        <p className="hint">{REQUEST_SUSPENDED_NOTE}</p>

        {/* A plain mailto, which is the whole of the mechanism. No subject
            template and no body template: a template would put words in
            somebody's message that this app wrote, and the one thing that has
            to be true of the message is that it comes from their own address. */}
        <p>
          <a className="btn btn--primary" href={`mailto:${REQUEST_ADDRESS}`}>
            {REQUEST_ADDRESS}
          </a>
        </p>

        <p className="switch">
          Can you sign in? <a href={SETTINGS_PATH}>Delete your account in Settings</a>
        </p>
      </main>
    </>
  );
}
