import { Header } from "@/app/components/Header";

// THE LOADING LOOK for My tasks.
//
// The heading is drawn, and nothing else is. That is the honest division: the
// heading is a fact about which screen is arriving, and everything below it --
// the count, the list, the chooser -- is data this request has not read yet.
//
// WHAT IT DELIBERATELY DOES NOT DO: draw an empty list, or a count of nought.
// Either would be the "a failed load must never look like an empty list" mistake
// in its other form -- a load that has not finished looking like an empty one.
//
// The Header is drawn signed-out, with no account, because this file knows
// neither: it runs before the page has verified the session. It is here so the
// screen does not jump when the real header arrives a moment later.
export default function Loading() {
  return (
    <>
      <Header />

      <main className="page stack">
        <h1>My tasks</h1>
        <p className="hint" role="status">
          Loading your tasks…
        </p>
      </main>
    </>
  );
}
