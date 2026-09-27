import Link from "next/link";

import { signIn } from "@/app/auth/actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { problem } = await searchParams;

  return (
    <main>
      <h1>Sign in</h1>

      {problem ? (
        <p role="alert">
          That did not work. Check the email address and password and try again.
        </p>
      ) : null}

      <form action={signIn}>
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
            autoComplete="current-password"
            required
          />
        </p>
        <button type="submit">Sign in</button>
      </form>

      <p>
        No account yet? <Link href="/signup">Sign up</Link>.
      </p>
    </main>
  );
}
