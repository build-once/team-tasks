import Link from "next/link";

import { Header } from "@/app/components/Header";

// The design does not cover a signed-out front page, so this one stays plain
// and uses the same pieces as the screens that are drawn.
export default function Home() {
  return (
    <>
      <Header />

      <main className="page stack">
        <h1>Team Tasks</h1>
        <p className="lede">
          See what&apos;s done, what&apos;s left and who&apos;s doing it.
        </p>

        <p>
          <Link className="btn btn--primary" href="/tasks">
            My tasks
          </Link>
        </p>

        <p className="switch">
          No account yet? <Link href="/signup">Sign up</Link>
        </p>

        <footer className="footer">Team Tasks version 2</footer>
      </main>
    </>
  );
}
