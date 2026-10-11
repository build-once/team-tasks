import Link from "next/link";

import { requestPasswordReset } from "@/app/auth/actions";
import { Banner } from "@/app/components/Banner";
import { CaptchaGate } from "@/app/components/CaptchaGate";
import { Header } from "@/app/components/Header";
import { BUTTON_IDS } from "@/lib/buttons";
import { TURNSTILE_SITE_KEY } from "@/lib/env";
import { RESET_SENT_MESSAGE } from "@/lib/password-reset";

// Ask for a password-reset email.
//
// ONE MESSAGE, FROM ONE CONSTANT. The banner below is the only thing this page
// says about a request, and its words come from RESET_SENT_MESSAGE in
// web/src/lib/password-reset.ts. There is no second banner, no error state and
// no "that address isn't registered": the screen looks the same for an address
// with an account, an address without one, and a request Supabase refused
// (issue #120 rule 1).
//
// The address is not echoed back either -- not in the banner, not in the input's
// value, not in the query string. "We've sent a link to alice@..." would read
// nicely and would confirm, to whoever typed it, that something about that
// address was worth printing.
export default async function ForgotPasswordPage({
  searchParams,
}: PageProps<"/forgot-password">) {
  const { sent } = await searchParams;

  return (
    <>
      <Header />

      <main className="page stack">
        <h1>Forgot your password?</h1>
        <p className="lede">
          Type the address you signed up with and we&apos;ll email you a link to
          set a new password.
        </p>

        {sent ? (
          <Banner tone="ok" icon="mail">
            {RESET_SENT_MESSAGE}
          </Banner>
        ) : null}

        <form className="card" action={requestPasswordReset}>
          <div>
            <label className="label" htmlFor="email">
              Email address
            </label>
            <input
              className="input"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
            <p className="hint">
              The link lasts a short while and can be used once. Asking again
              sends a new one.
            </p>
          </div>

          {/* The anti-robot check and the submit button, as one thing (issue
              #284).

              THIS SCREEN IS THE ONE THAT CANNOT REPORT A CAPTCHA REFUSAL, and
              that is deliberate rather than an oversight. Issue #120 rule 1 is
              that this page says one sentence whatever happened, and
              scripts/password-reset-check.mjs reads the action's own source and
              requires it to have no branch at all -- so there is nowhere for a
              second sentence to come from, and a second banner here would turn
              that check red. The honest fix for a red check is the code and
              never the check (AGENTS.md rule 20), and the code that is actually
              right is this: the words about the check live in the component,
              beside the box, where somebody can act on them BEFORE pressing
              anything. A token that is spent or expired by the time the form
              posts means no email and the usual sentence -- the same cost the
              2-emails-an-hour limit already has, written down in
              docs/rate-limits.md rather than discovered -- and in issue #288,
              which is where the owner decides whether to accept it as it stands
              or to design a sentence this screen may say. */}
          <CaptchaGate
            siteKey={TURNSTILE_SITE_KEY}
            act={BUTTON_IDS.resetRequest}
          >
            Email me a link
          </CaptchaGate>
        </form>

        <p className="switch">
          Remembered it? <Link href="/login">Sign in</Link>
        </p>
      </main>
    </>
  );
}
