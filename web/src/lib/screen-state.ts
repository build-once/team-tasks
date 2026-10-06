// screen-state.ts -- the ONE function that decides which look a screen shows.
//
// WHY ONE FUNCTION. Before this file, every screen that read data made the same
// decision for itself, in a chain of ternaries inside its JSX:
//
//     {error ? null : tasks.length === 0 ? <Empty/> : <List/>}
//
// Read it again and the bug is the shape rather than the characters: the thing
// that decides is the same thing that draws, so there is nowhere to ask the
// question without a browser. And the question has a trap in it. "No rows" and
// "the read failed" arrive at a screen looking identical -- both leave you
// holding an empty array, because `data ?? []` is what every query in this app
// does with a null -- and a failed load drawn as an empty list is the app
// telling somebody their tasks are gone.
//
// So the decision moves here, where it can be asked hundreds of questions by
// scripts/screen-state-check.mjs with no database, no browser and no account.
//
// THE ONE RULE THIS FILE EXISTS TO HOLD: `failed` wins over `rows`. A read that
// failed is "error", whatever the row count says, and there is no argument order
// or row count that makes it "empty". The check script breaks that on purpose and
// watches the checks go red; see evidence/build-it-19-honest-screens.md.
//
// It has NO IMPORTS, so a plain `node` run can load it: Node strips the types as
// it reads the file. Nothing here talks to Supabase, reads a cookie, renders
// anything or looks at the clock.

// The four looks, as words rather than booleans, so a screen cannot end up in
// two of them at once.
//
//   loading  the read has not finished. On this app's server-rendered screens
//            that is drawn by a loading.tsx file -- Next.js' own Suspense
//            fallback -- rather than by the page, which never renders until its
//            queries have returned. The state exists here all the same, because
//            the decision is "which look", and "we do not know yet" is one of
//            them: a client-rendered screen added later must have somewhere to
//            put it, and the check script can hold this file to it today.
//   error    the read did not work. Never drawn as a list of anything.
//   empty    the read worked and there is genuinely nothing in it.
//   data     the read worked and there is something to draw.
export const SCREEN_LOADING = "loading";
export const SCREEN_ERROR = "error";
export const SCREEN_EMPTY = "empty";
export const SCREEN_DATA = "data";

export type ScreenState =
  | typeof SCREEN_LOADING
  | typeof SCREEN_ERROR
  | typeof SCREEN_EMPTY
  | typeof SCREEN_DATA;

// Every look a screen may be in, in the order they are decided. Exported so the
// check script can assert the list rather than hold its own copy.
export const SCREEN_STATES: ReadonlyArray<ScreenState> = [
  SCREEN_LOADING,
  SCREEN_ERROR,
  SCREEN_EMPTY,
  SCREEN_DATA,
];

/**
 * Which look a screen shows.
 *
 * `loading`  true while the read is still in flight. Checked FIRST, because a
 *            read that has not finished has told us nothing: a `rows` of 0 at
 *            that moment is "not yet", not "none".
 * `failed`   true when the read returned an error. Checked SECOND, and nothing
 *            below it can overrule it. This is the whole point of the file.
 * `rows`     how many rows came back. Anything that is not a number at or above
 *            zero is treated as "we cannot count what came back", which is an
 *            error rather than an empty list -- same reasoning as `failed`.
 *
 * Deliberately NOT given the rows themselves. A count is all this decision
 * needs, and a function that never sees a task's text or a team's name cannot
 * leak one into a log, a message or an error report.
 */
export function screenState(read: {
  loading?: boolean;
  failed?: boolean;
  rows?: number;
}): ScreenState {
  if (read.loading === true) return SCREEN_LOADING;

  // `=== true` rather than a truthy test, so a Postgrest error object passed in
  // by mistake is not quietly read as "failed" for the wrong reason -- and so
  // undefined, which is what a query with no error gives, means "did not fail".
  if (read.failed === true) return SCREEN_ERROR;

  const rows = read.rows;

  // A count that is not a count. NaN, a negative number, a string, undefined:
  // none of them says "there are no rows", they say "nobody knows". The honest
  // look for that is the error one, which at least offers Try again -- an empty
  // list would be a claim.
  if (typeof rows !== "number" || !Number.isFinite(rows) || rows < 0) {
    return SCREEN_ERROR;
  }

  return rows === 0 ? SCREEN_EMPTY : SCREEN_DATA;
}

/** True only for the one look that may draw rows. */
export function showsData(state: ScreenState): boolean {
  return state === SCREEN_DATA;
}

/** True only for the look that says the read did not work. */
export function showsError(state: ScreenState): boolean {
  return state === SCREEN_ERROR;
}

// ---------------------------------------------------------------------------
// Try again
// ---------------------------------------------------------------------------
//
// THE ERROR LOOK HAS A BUTTON, and the button has to land somewhere. These are
// the only places it can land.
//
// Why a fixed table and not a path from the form: the form is in a page that
// anybody can post to, so a path taken out of it is a path somebody else chose.
// A redirect to a value from a request is an open redirect -- the same argument
// web/src/lib/password-reset.ts makes for writing RESET_LANDING_PATH down rather
// than reading it off a link.
//
// The key is a short identifier chosen in code. It is what the button carries,
// and it is never shown to anybody.
export const RETRY_TARGETS: Readonly<Record<string, string>> = {
  tasks: "/tasks",
  teams: "/teams",
  home: "/",
};

// Where a Try again goes when the identifier is one this app did not write. Not
// an error and not a guess: the front page is reachable from everywhere and
// claims nothing.
export const RETRY_FALLBACK = "/";

/**
 * The path a Try again button reloads.
 *
 * Anything that is not one of the identifiers above comes back as the front
 * page, so a crafted post cannot send anybody to an address somebody else
 * chose.
 */
export function retryPath(target: unknown): string {
  if (typeof target !== "string") return RETRY_FALLBACK;

  const name = target.trim();
  return Object.prototype.hasOwnProperty.call(RETRY_TARGETS, name)
    ? RETRY_TARGETS[name]
    : RETRY_FALLBACK;
}
