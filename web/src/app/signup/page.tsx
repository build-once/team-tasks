import Link from "next/link";

import { signUp } from "@/app/auth/actions";

export default async function SignUpPage({
  searchParams,
}: PageProps<"/signup">) {
  const { problem, confirm } = await searchParams;

  return (
    <main>
      <h1>Sign up</h1>

      {problem ? (
        <p role="alert">
          That did not work. Check the email address and password and try again.
        </p>
      ) : null}

      {confirm ? (
        <p role="status">
          Almost there. Open the email we just sent and confirm your address,
          then <Link href="/login">sign in</Link>.
        </p>
      ) : null}

      <form action={signUp}>
        <p>
          <label htmlFor="email">Email address</label>
          <br />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </p>
        <p>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </p>
        <button type="submit">Sign up</button>
      </form>

      <p>
        Already have an account? <Link href="/login">Sign in</Link>.
      </p>
    </main>
  );
}
