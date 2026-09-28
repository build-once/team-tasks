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

export function Header({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link className={styles.brand} href="/">
          <Mark />
          Team Tasks
        </Link>

        {signedIn ? (
          <form action="/auth/signout" method="post">
            <button className="btn btn--quiet" type="submit">
              Sign out
            </button>
          </form>
        ) : null}
      </div>
    </header>
  );
}
