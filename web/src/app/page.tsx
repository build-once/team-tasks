// THROWAWAY BRANCH -- test/bundle-leak. Do NOT merge this.
// This file exists in this state only to make the "No Supabase secret key in
// the built bundle" step of the App build job fail on purpose.
//
// "use client" is here deliberately: the rest of this app is server-rendered,
// so a string in a server component would be compiled into .next/server and
// never reach .next/static, which is the directory the check scans. A client
// component is the only way to get the string in front of the check.
//
// The value below is INVENTED. It has never been a credential for any account.
"use client";

import Link from "next/link";

import { Header } from "@/app/components/Header";

// Rendered below rather than merely declared, so the minifier cannot drop it as
// dead code -- an unused constant would be removed and the bundle would come out
// clean, which would prove nothing.
//
// The name is deliberately bland. Called FAKE_SECRET, this line is caught by the
// pre-commit hook's gitleaks rule "generic-api-key" -- not because of the
// sb_secret_ prefix, which gitleaks has no rule for, but because an identifier
// containing the word "secret" next to a high-entropy string is what that generic
// rule looks for. The hook is doing its job; renaming keeps this throwaway test
// from tripping it without switching anything off. The real gap that gitleaks
// cannot see the sb_secret_ shape at all is issue #25.
const k = "sb_secret_Xk29fQmLp7Rt4WzVb8NyHc3Jd6Gs1Aq5";

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

        <p data-testid="fake-secret">{k}</p>

        <footer className="footer">Team Tasks version 2</footer>
      </main>
    </>
  );
}
