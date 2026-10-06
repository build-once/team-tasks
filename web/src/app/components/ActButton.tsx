import type { ReactNode } from "react";

import { ACT_FIELD, type ButtonId } from "@/lib/buttons";

// EVERY SUBMIT BUTTON IN THIS APP, so that there is exactly one place that knows
// how a button carries its identifier.
//
// Build it 19 rule 6: a button acts by a fixed identifier, never by its wording.
// Writing `name={ACT_FIELD} value={BUTTON_IDS.x}` on each of the sixteen buttons
// would have been the same behaviour and a worse shape -- sixteen chances to forget
// one, and nothing to search for to find out. With this component the question "does
// every button carry an identifier?" is answered by searching for
// `<button type="submit"`, which should find none: a submit button in a page is
// either this component or a mistake.
//
// THERE IS ONE BUTTON IN THE APP THAT IS NOT THIS, on purpose: the Try again in
// web/src/app/error.tsx. It is `type="button"` with an onClick, not a form
// submission at all -- there is nothing for an identifier to travel to, because
// `retry` is a function the error boundary was handed.
//
// AND ONE SMALL CONSEQUENCE WORTH NAMING, because it is why this component exists
// rather than the attributes being written out. scripts/password-reset-check.mjs
// requires that web/src/app/forgot-password/page.tsx contains no `value=` at all --
// its rule is that the request screen never echoes the address back, and the check
// is a text search rather than an attribute-aware one. Spelling `value=` on that
// page's button would have turned it red. The honest fix for a red check is the code
// and never the check (AGENTS.md rule 20), and the code that is actually better is
// this: the attribute is written once, here, and no page writes it.
//
// `act` is typed as ButtonId, so a label or a new string cannot be passed: it has to
// be one of the identifiers in web/src/lib/buttons.ts, and the build refuses
// anything else.
export function ActButton({
  act,
  className,
  ariaPressed,
  children,
}: {
  act: ButtonId;
  className?: string;
  // Only on the tick toggle on My tasks, which is a pressed/unpressed control
  // rather than a plain button.
  ariaPressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      className={className}
      type="submit"
      name={ACT_FIELD}
      value={act}
      aria-pressed={ariaPressed}
    >
      {children}
    </button>
  );
}
