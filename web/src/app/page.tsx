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
        {/* THE THIRD CLAUSE USED TO BE "and who's doing it" (issue #196), and
            nothing in the app answered it. `tasks.owner_id` exists but is never
            drawn -- web/src/lib/tasks.ts says it is "only ever compared with the
            signed-in person's own id -- never shown" -- and there is NO COLUMN
            recording who ticked a task at all. So the app's headline promised a
            third of something it did not do.

            Each clause of the replacement has something that makes it true, which
            is why this wording and not another: "what's done" is the `done`
            column, drawn as the tick on My tasks; "what's left" is the count
            beside that heading, computed from exactly the rows being drawn; "which
            list it's on" is the team chip, decided by taskTeam(). None of the
            three claims to show a person. docs/claims.md §4a row 1 carries the
            file and line for each. */}
        <p className="lede">
          See what&apos;s done, what&apos;s left, and which list it&apos;s on.
        </p>

        <p>
          <Link className="btn btn--primary" href="/tasks">
            My tasks
          </Link>
        </p>

        <p className="switch">
          No account yet? <Link href="/signup">Sign up</Link>
        </p>

        {/* THE FOOTER THAT USED TO BE HERE SAID "Team Tasks version 2". There was
            no version 1 and nothing decided what "2" meant, and it was on this page
            only -- the other six screens had none. It now comes from the root layout
            (web/src/app/layout.tsx), says the commit the build came from, and is on
            every screen. See web/src/lib/app-version.ts. */}
      </main>
    </>
  );
}
