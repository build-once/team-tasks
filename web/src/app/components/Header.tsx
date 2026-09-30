import Link from "next/link";

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
export function Header({
  signedIn = false,
  current,
}: {
  signedIn?: boolean;
  current?: "tasks" | "teams";
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

            <form action="/auth/signout" method="post">
              <button className="btn btn--quiet" type="submit">
                Sign out
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </header>
  );
}
