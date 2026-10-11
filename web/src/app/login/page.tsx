import Link from "next/link";

import { signIn } from "@/app/auth/actions";
import { Banner } from "@/app/components/Banner";
import { CaptchaGate } from "@/app/components/CaptchaGate";
import { Header } from "@/app/components/Header";
import { refusalSentence } from "@/lib/auth-messages";
import { BUTTON_IDS } from "@/lib/buttons";
import { TURNSTILE_SITE_KEY } from "@/lib/env";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { problem, confirmed, refused } = await searchParams;

  // A refusal that is NOT about the email and password: a rate limit, a failed
  // anti-robot check, an address that has not been confirmed. All three used to
  // be told "that email and password don't match", which was a sentence about
  // the one thing that had not gone wrong (issue #284).
  //
  // The sentence comes from this app's own table keyed by a short code
  // (web/src/lib/auth-messages.ts). An unrecognised word in the address bar
  // draws nothing, so nothing a caller types is ever printed -- issue #45's
  // lesson, and the same property the invitation page has.
  const refusal = refusalSentence(refused);

  return (
    <>
      <Header />

      <main className="page stack">
        <h1>Sign in</h1>
        {/* The same change as the front page and the root layout (issue #196):
            the third clause was "and who's doing it", and nothing in the app
            shows who is doing anything. See web/src/app/page.tsx for the full
            note and docs/claims.md §4a row 1 for what makes each clause true. */}
        <p className="lede">
          See what&apos;s done, what&apos;s left, and which list it&apos;s on.
        </p>

        {/* THIS USED TO SAY "Your email is confirmed. Please sign in." (issue
            #198), and it was drawn on the one path where nothing in this app had
            seen a confirmation.

            `?confirmed=1` is set in exactly one place --
            web/src/app/auth/callback/route.ts -- and that place is the route's
            FALL-THROUGH: it is reached when the code exchange FAILED, and when the
            request carried no code at all. The successful exchange redirects to
            /tasks instead and never comes here. So somebody whose confirmation had
            just failed was told it had succeeded, and would sign in, fail, and have
            no idea why. The value can also simply be typed into the address bar.

            The new sentence asserts nothing about the account, which is the whole
            repair. What it needs to be true is only that signing in is available
            and does something, which is the form below and `signIn` in
            web/src/app/auth/actions.ts.

            ONE LOOSE EDGE, named rather than hidden: on the no-code path nothing
            was started, so "finish" is imprecise. It states no falsehood about the
            account, which is what #198 was filed for; splitting the two paths was
            the other option and the owner chose this one. */}
        {confirmed ? (
          <Banner tone="ok" icon="check">
            Please sign in to finish.
          </Banner>
        ) : null}

        {refusal ? (
          <Banner tone="bad" icon="alert">
            {refusal}
          </Banner>
        ) : problem ? (
          <Banner tone="bad" icon="alert">
            That email and password don&apos;t match. Check them and try again.
          </Banner>
        ) : null}

        <form className="card" action={signIn}>
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
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              className="input"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {/* The anti-robot check and the submit button, as one thing (issue
              #284). It owns the button because "it never submits without a
              token" is a property of the button, and with no site key set it
              draws exactly the plain button that was here before. */}
          <CaptchaGate siteKey={TURNSTILE_SITE_KEY} act={BUTTON_IDS.signIn}>
            Sign in
          </CaptchaGate>
        </form>

        {/* Outside the form, so pressing Enter in the password box signs in
            rather than following this link. */}
        <p className="switch">
          <Link href="/forgot-password">Forgot password?</Link>
        </p>

        <p className="switch">
          No account yet? <Link href="/signup">Sign up</Link>
        </p>
      </main>
    </>
  );
}
