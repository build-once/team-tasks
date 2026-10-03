import Link from "next/link";
import { cookies } from "next/headers";

import { setNewPassword } from "@/app/auth/actions";
import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
import {
  DEAD_LINK_MESSAGE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_SHORT,
  RESET_MARKER_COOKIE,
  newPasswordView,
} from "@/lib/password-reset";
import { createClient } from "@/lib/supabase/server";

// Set a new password, for somebody who has just followed a reset link.
//
// TWO STATES, AND NOTHING ELSE (issue #120 rule 3). Either /auth/reset has just
// had a reset link accepted by Supabase -- in which case the form is drawn --
// or it has not, and the page says one sentence and offers a way to ask for
// another email. There is no state in which this page shows an address, a name,
// or anything at all about whether an account exists.
//
// Opening it without a link therefore shows nothing useful and changes nothing:
// no form is drawn, so there is nothing to submit, and the action behind it needs
// a session this page never creates.
//
// It is reachable while signed out on purpose (web/src/lib/supabase/proxy.ts):
// somebody whose link has expired has no session, and the alternative is being
// bounced to the sign-in page with no explanation of why the link they just
// clicked did nothing.
export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const { link, problem } = await searchParams;
  const supabase = await createClient();

  // getClaims() verifies the token's signature every time; getSession() would
  // trust a cookie anyone can forge -- the same reason the other private pages
  // in this app use it.
  const { data: claimsData } = await supabase.auth.getClaims();

  const marked =
    (await cookies()).get(RESET_MARKER_COOKIE)?.value !== undefined;

  const view = newPasswordView({
    marked,
    signedIn: Boolean(claimsData?.claims),
    // ?link=0 is set by this app, by /auth/reset when Supabase refused the link
    // and by the action when it refused the change. Any other value, including
    // one somebody typed, lands on the same screen -- which is the safe one.
    deadLink: link !== undefined,
  });

  if (view === "dead") {
    return (
      <>
        <Header />

        <main className="page stack">
          <h1>That link didn&apos;t work</h1>

          <Banner tone="bad" icon="alert">
            {DEAD_LINK_MESSAGE}
          </Banner>

          <p className="switch">
            <Link href="/forgot-password">Ask for a new link</Link>
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />

      <main className="page stack">
        <h1>Set a new password</h1>
        <p className="lede">
          Choose a new password for your account. This link works once.
        </p>

        {problem ? (
          <Banner tone="bad" icon="alert">
            {PASSWORD_TOO_SHORT}
          </Banner>
        ) : null}

        <form className="card" action={setNewPassword}>
          <div>
            <label className="label" htmlFor="password">
              New password
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
            Save new password
          </button>
        </form>
      </main>
    </>
  );
}
