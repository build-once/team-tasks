import type { ReactNode } from "react";

import { Banner } from "@/app/components/Banner";
import { BUTTON_IDS } from "@/lib/buttons";

import { ActButton } from "./ActButton";
import { tryAgain } from "./retry-action";

// THE ERROR LOOK. One component, so every screen's failed read looks the same and
// every one of them has the button.
//
// WHAT IT REPLACED: each screen had a Banner saying the read failed, and none of
// them had anything to press. The only way out was the browser's reload button --
// which is a thing the person has to think of, and which on a page reached by a
// form post asks them whether to send the form again.
//
// `children` is the SENTENCE, written by the screen, because what failed to load
// differs: "Your tasks could not be loaded" is not "The members lists could not be
// loaded". What does not differ is that the sentence says a read failed, never why
// -- no database message, no code, no status. Those go to Sentry, through the
// scrub in web/src/lib/sentry-scrub.ts.
//
// `target` is an identifier from RETRY_TARGETS in web/src/lib/screen-state.ts, not
// a path. See retry-action.ts.
//
// `filter` is carried for the My tasks page only, so pressing Try again puts the
// person back in the list they were in rather than in "all tasks".
export function LoadFailed({
  target,
  filter,
  children,
}: {
  target: string;
  filter?: string | null;
  children: ReactNode;
}) {
  return (
    <>
      <Banner tone="bad" icon="alert">
        {children}
      </Banner>

      <form action={tryAgain}>
        <input type="hidden" name="target" value={target} />
        <input type="hidden" name="filter" value={filter ?? ""} />
        {/* The identifier is what this button IS. "Try again" is only what it
            says, and the action reads the first and ignores the second. */}
        <ActButton className="btn" act={BUTTON_IDS.tryAgain}>
          Try again
        </ActButton>
      </form>
    </>
  );
}
