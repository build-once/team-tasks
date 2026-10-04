import Link from "next/link";

import { signIn } from "@/app/auth/actions";
import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { problem, confirmed } = await searchParams;

  return (
    <>
      <Header />

      <main className="page stack">
        <h1>Sign in</h1>
        <p className="lede">
          See what&apos;s done, what&apos;s left and who&apos;s doing it.
        </p>

        {confirmed ? (
          <Banner tone="ok" icon="check">
            Your email is confirmed. Please sign in.
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

          <button className="btn btn--primary btn--block" type="submit">
            Sign in
          </button>
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
