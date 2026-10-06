"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ACT_FIELD, BUTTON_IDS, pressed } from "@/lib/buttons";
import { retryPath } from "@/lib/screen-state";
import { readFilter, tasksPath } from "@/lib/tasks";

// The Try again button on every error look.
//
// WHY IT IS A BUTTON AND NOT A LINK. A link to the address you are already on is
// not reliably a reload: the App Router has a client-side cache, and following a
// link to the current route can be answered out of it. A post that calls
// `revalidatePath` first throws that cache away for the path, so the next render
// genuinely reads the database again. "Try again" has to try again, or it is a
// button that redraws the same error and teaches people the app is lying.
//
// WHERE IT CAN LAND IS A FIXED LIST, in web/src/lib/screen-state.ts, and the form
// carries a short identifier rather than a path. A path taken out of a form is a
// path whoever posted the form chose, which is an open redirect -- the same
// argument web/src/lib/password-reset.ts makes for writing RESET_LANDING_PATH down
// instead of reading it off a link.
//
// IT IS THE SAME ACTION FOR EVERY SCREEN, which is why the button needs its own
// identifier (BUTTON_IDS.tryAgain) as much as any other: without one, this action
// would accept a post from anything.
export async function tryAgain(formData: FormData) {
  if (!pressed(formData.get(ACT_FIELD), [BUTTON_IDS.tryAgain])) {
    // Nothing is revalidated and nothing is claimed. The front page is reachable
    // from everywhere and says nothing that could be wrong.
    redirect("/");
  }

  const path = retryPath(formData.get("target"));

  // The list the person was in, for /tasks only, so a Try again does not quietly
  // move them to "all tasks". readFilter drops anything it does not recognise, so
  // what comes out is never more than "personal" or a team id in uuid shape.
  const filter = readFilter(formData.get("filter"));

  // revalidatePath takes the ROUTE, not the address with its query string, which
  // is why it is the fixed path from the table above and the filter is added only
  // to the redirect.
  revalidatePath(path);

  redirect(path === "/tasks" ? tasksPath({ filter }) : path);
}
