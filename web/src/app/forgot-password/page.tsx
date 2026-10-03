import Link from "next/link";

import { requestPasswordReset } from "@/app/auth/actions";
import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
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

          <button className="btn btn--primary btn--block" type="submit">
            Email me a link
          </button>
        </form>

        <p className="switch">
          Remembered it? <Link href="/login">Sign in</Link>
        </p>
      </main>
    </>
  );
}
