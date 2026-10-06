import { Header } from "@/app/components/Header";

// THE LOADING LOOK for My teams. Same reasoning as web/src/app/tasks/loading.tsx:
// the heading says which screen is arriving, and nothing below it is drawn,
// because none of it has been read.
//
// No "Teams you own" and "Teams you belong to" headings either, even though they
// are fixed words. Two empty sections are what this screen looks like when
// somebody has no teams, and a load in progress must not borrow that look.
export default function Loading() {
  return (
    <>
      <Header />

      <main className="page stack">
        <h1>My teams</h1>
        <p className="hint" role="status">
          Loading your teams…
        </p>
      </main>
    </>
  );
}
