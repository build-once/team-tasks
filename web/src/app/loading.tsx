// THE LOADING LOOK, for every screen that does not have one of its own.
//
// WHY A FILE AND NOT A SPINNER IN A PAGE. Every screen in this app is rendered on
// the server, so a page's own code never runs until its queries have returned --
// there is no moment inside a page at which it could draw "loading". The moment
// exists all the same: it is the gap between pressing a link and the new screen
// arriving, and before this file that gap showed the OLD screen, unchanged. On a
// slow connection that reads as a link that did nothing.
//
// loading.tsx is Next.js' own name for it: the file "will automatically wrap the
// page.js file and any children below in a <Suspense> boundary"
// (web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// loading.md). It is prefetched, so it appears at once.
//
// AT THE TOP OF app/, so it covers /login, /signup, /forgot-password,
// /reset-password, /invite/[token] and the front page. /tasks and /teams have
// their own, which say which screen is coming.
//
// `role="status"` so a screen reader says it rather than leaving somebody waiting
// in silence. `aria-live` is implied by the role, so it is not set twice.
export default function Loading() {
  return (
    <main className="page stack">
      <p className="hint" role="status">
        Loading…
      </p>
    </main>
  );
}
