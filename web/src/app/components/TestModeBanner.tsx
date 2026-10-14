import { STRIPE_TEST_MODE } from "@/lib/env";

// TEST MODE -- Build it 27, and the owner's instruction: "Show a visible TEST
// MODE banner in the app whenever the publishable key starts with pk_test_."
//
// WHY IT IS WORTH A COMPONENT. The owner's decision of 2026-10-14 is that the
// whole of Build it 27 is a REHEARSAL in Stripe's sandbox, and the thing that
// goes wrong with rehearsals is that somebody forgets they are in one. A screen
// in test mode and a screen in live mode are otherwise identical: the same
// buttons, the same prices, the same words. This is the only difference a
// person can see.
//
// AND IT REMOVES ITSELF. Nobody has to remember to take it down when live keys
// arrive, because it is drawn off the key rather than off a flag somebody sets:
// a `pk_live_` key does not start with `pk_test_`, so the banner is simply not
// there. The alternative -- a SHOW_TEST_BANNER setting -- is a thing that would
// be left switched on, or switched off too early.
//
// IT IS IN THE ROOT LAYOUT, so it is on every screen including the signed-out
// ones. A banner only on the pricing page would be a banner that is absent at
// the moment somebody is looking at a task list wondering whether this is the
// real app.
//
// NO JAVASCRIPT, no dismiss button and no animation. It is a strip of text, it
// is rendered on the server like every other screen in this app, and it cannot
// be closed -- a banner somebody can dismiss is a banner that is not there the
// moment it matters.
export function TestModeBanner() {
  if (!STRIPE_TEST_MODE) return null;

  return (
    <div className="test-mode" role="status">
      <strong>TEST MODE</strong>
      {" — payments here are not real. No card is charged and no money moves."}
    </div>
  );
}
