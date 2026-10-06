import Link from "next/link";

import { BUTTON_IDS } from "@/lib/buttons";
import { accountLabel } from "@/lib/words";

import { ActButton } from "./ActButton";
import styles from "./Header.module.css";

// The ticked box from the design, drawn inline so it costs no request and
// takes the colour of the text around it.
function Mark() {
  return (
    <svg
      className={styles.mark}
      width="28"
      height="28"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="M7.3 12.2l3.2 3.3 6.2-6.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// `current` marks which of the two pages you are on. It is passed in rather than
// read from the URL on purpose: usePathname would make this a client component,
// and nothing else in this app is one.
//
// `account` is WHO IS SIGNED IN (Build it 19 rule 8). The email address off the
// VERIFIED token -- `claims.email`, from `supabase.auth.getClaims()` -- passed in
// by each page that has already checked the session, for the same reason `current`
// is passed in: this component reads no cookie and makes no query, so adding it to
// a screen costs that screen nothing.
//
// WHY AN ADDRESS, ON A PAGE THAT OTHERWISE NEVER SHOWS ONE. docs/plan.md's rule is
// that an email address is "never shown to team members"; this is the one place it
// is shown to its own owner, and it is the only thing that answers "which account
// am I in?" without ambiguity. A nickname does not: two people can pick the same
// one, and somebody who has not set one has nothing to show.
//
// It is OPTIONAL, and `accountLabel` is why. Supabase's own JwtPayload type has
// `email?: string` (web/node_modules/@supabase/auth-js/dist/module/lib/types.d.ts,
// line 2028), so a token with no email claim is a real case -- and a header reading
// "undefined" would be exactly the thing rule 4 forbids. With no address the menu
// says "Signed in", which is true and claims nothing.
//
// NOT PASSED ON THE RESET-PASSWORD SCREENS, on purpose. Those draw `<Header />`
// with nothing, because that page deliberately has "no state in which it shows an
// address, a name, or anything at all about whether an account exists" -- and
// somebody arrives there through a link from an email, which is not the same as
// being somebody we should name on screen.
export function Header({
  signedIn = false,
  current,
  account,
}: {
  signedIn?: boolean;
  current?: "tasks" | "teams";
  account?: string | null;
}) {
  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/">
          <Mark />
          Team Tasks
        </Link>

        {signedIn ? (
          <div className={styles.right}>
            {/* Both pages are reachable from every signed-in screen. Before
                this, /teams could only be opened by typing the address, and
                /tasks only from the front page. */}
            <nav className={styles.nav} aria-label="Your pages">
              <Link
                className={styles.navLink}
                href="/tasks"
                aria-current={current === "tasks" ? "page" : undefined}
              >
                My tasks
              </Link>
              <Link
                className={styles.navLink}
                href="/teams"
                aria-current={current === "teams" ? "page" : undefined}
              >
                My teams
              </Link>
            </nav>

            <div className={styles.account}>
              {/* Who is signed in. `title` is not set and the address is not a
                  link: it is here to be read, not acted on. */}
              <span className={styles.who}>
                <span className="visually-hidden">Signed in as </span>
                {accountLabel(account)}
              </span>

              <form action="/auth/signout" method="post">
                {/* The identifier travels with the press even though this form
                    posts to a route handler rather than a server action, so that
                    every submit button in the app is an ActButton and a search for
                    `<button type="submit"` finds nothing. */}
                <ActButton className="btn btn--quiet" act={BUTTON_IDS.signOut}>
                  Sign out
                </ActButton>
              </form>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
