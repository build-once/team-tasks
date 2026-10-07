import Link from "next/link";

import { signIn } from "@/app/auth/actions";
import { ActButton } from "@/app/components/ActButton";
import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
import { BUTTON_IDS } from "@/lib/buttons";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { problem, confirmed } = await searchParams;

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

        {problem ? (
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

          <ActButton
            className="btn btn--primary btn--block"
            act={BUTTON_IDS.signIn}
          >
            Sign in
          </ActButton>
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
