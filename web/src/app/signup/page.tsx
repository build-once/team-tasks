import Link from "next/link";

import { signUp } from "@/app/auth/actions";
import { ActButton } from "@/app/components/ActButton";
import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
import { BUTTON_IDS } from "@/lib/buttons";
// The same number as the reset form, from one place, so "the same password rules
// as sign-up" (issue #120 rule 3) stays true after somebody changes one of them.
//
// PASSWORD_TOO_SHORT arrived with issue #197, and it is the same sentence the reset
// screen shows for the same refusal. Both now come from this one constant, so the
// two screens cannot drift into saying two things about one rule -- and the rule is
// enforced by `signUp` in web/src/app/auth/actions.ts, not by the `minLength`
// attribute below, which anything posting by hand would skip.
import { PASSWORD_MIN_LENGTH, PASSWORD_TOO_SHORT } from "@/lib/password-reset";

export default async function SignUpPage({
  searchParams,
}: PageProps<"/signup">) {
  const { problem, confirm } = await searchParams;

  return (
    <>
      <Header />

      <main className="page stack">
        <h1>Create your account</h1>
        {/* "Free for your volunteer group." USED TO BE HERE (issue #201). It was
            true on the day it was written and no file in this repository could
            make it true or keep it true: it was a promise about money, on the
            screen where somebody decides to put their group's work into this app.
            docs/claims.md recorded it as NOT ENFORCED.

            What replaced it is a fact about the app as built, which is why a file
            and line can carry it: the form below asks for an address and a
            password and nothing else, `credentials()` in
            web/src/app/auth/actions.ts reads only those two, and there is no
            payment dependency, route, action or table anywhere in this
            repository. docs/claims.md §4a records the four searches that
            established the last of those. */}
        <p className="lede">No card needed to sign up.</p>

        {/* THE PASSWORD REFUSAL COMES FIRST, and it is the one case where this
            screen says which half was wrong (issue #197). It is safe to be
            specific here and it would not be below: this sentence is about the
            password the person just typed, so it gives nothing away about whether
            the address has an account -- seven characters are refused identically
            either way. The generic sentence below stays generic for exactly the
            opposite reason. */}
        {problem === "password" ? (
          <Banner tone="bad" icon="alert">
            {PASSWORD_TOO_SHORT}
          </Banner>
        ) : problem ? (
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

          <ActButton
            className="btn btn--primary btn--block"
            act={BUTTON_IDS.signUp}
          >
            Create account
          </ActButton>
        </form>

        <p className="switch">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </main>
    </>
  );
}
