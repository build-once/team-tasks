import Link from "next/link";

import { signUp } from "@/app/auth/actions";
import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
// The same number as the reset form, from one place, so "the same password rules
// as sign-up" (issue #120 rule 3) stays true after somebody changes one of them.
import { PASSWORD_MIN_LENGTH } from "@/lib/password-reset";

export default async function SignUpPage({
  searchParams,
}: PageProps<"/signup">) {
  const { problem, confirm } = await searchParams;

  return (
    <>
      <Header />

      <main className="page stack">
        <h1>Create your account</h1>
        <p className="lede">Free for your volunteer group.</p>

        {problem ? (
          <Banner tone="bad" icon="alert">
            That did not work. Check the email address and password and try
            again.
          </Banner>
        ) : null}

        {confirm ? (
          <Banner tone="ok" icon="mail">
            Check your email. We&apos;ve sent you a link to confirm your
            account.
          </Banner>
        ) : null}

        <form className="card" action={signUp}>
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
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              required
            />
            <p className="hint">
              At least {PASSWORD_MIN_LENGTH} characters. A password manager can
              make one for you.
            </p>
          </div>

          <button className="btn btn--primary btn--block" type="submit">
            Create account
          </button>
        </form>

        <p className="switch">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </main>
    </>
  );
}
