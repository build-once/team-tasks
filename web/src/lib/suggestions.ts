// suggestions.ts -- what the screen is allowed to draw when it asks the AI helper
// for subtasks, and the one sentence it says when it cannot.
//
// Build it 20 part 1, issue #183. The function this is the other half of is
// supabase/functions/suggest-subtasks/index.ts.
//
// WHY THERE IS A SECOND FILTER HERE AT ALL, when the function already filters.
// Because the two run in different places, and they stop being the same code the
// moment one of them is deployed and the other is not. That is not a worry about
// some imagined future: it is the state this repository is in right now and has
// been in twice before. invite-member's own header records it -- "what is running
// out there is the version that DELETES an invitation whose email failed" -- and
// the honest reading is that THE DEPLOYED FUNCTION IS A DIFFERENT PROGRAM FROM THE
// ONE IN THIS BRANCH until somebody deploys.
//
// So the screen does not trust the answer's shape. It re-applies the caps, it
// refuses anything that is not a list of short plain strings, and above all:
//
//   AN EMPTY LIST IS NEVER DRAWN AS A RESULT. Issue #183 asks that the screen
//   "never shows an empty list as if it were a result", and the surest way to keep
//   that true is for this file to answer "unavailable" rather than hand the page an
//   empty array to render. A page given [] would draw a heading with nothing under
//   it, which reads as "the helper looked and there is nothing to suggest" -- a
//   claim nobody has made.
//
// It has NO IMPORTS, so a plain `node` run can load it: Node strips the types as it
// reads the file. Nothing here talks to Supabase, reads a cookie, renders anything
// or looks at the clock -- the same property web/src/lib/screen-state.ts has, and
// for the same reason.
//
// AND NOTHING HERE REPORTS ANYTHING TO SENTRY, which is a decision rather than an
// omission. Issue #183: "Nothing from the title or the reply goes to error
// reporting." The page that calls the helper could capture an exception the way
// web/src/app/teams/actions.ts does for create-team -- and the object the Supabase
// client throws carries the REQUEST, which carries the task id, and on some paths
// the response body, which carries the reply. The scrub in
// web/src/lib/sentry-scrub.ts would clean most of that; "most" is not the promise
// docs/plan.md makes about task text. There is also nothing to learn: the function
// has already turned every failure into one of a fixed list of codes, and the owner
// can read those in the function's own logs, where no title and no reply ever go.
//
// The app-wide half of the same decision is web/src/sentry/options.ts, whose
// `genAI: { inputs: false, outputs: false }` was written when there was no AI
// feature to switch off and is a live control from today.

// THE SENTENCE, and it is the function's too. issue #183: on any failure the screen
// says "Suggestions aren't available right now."
//
// WHAT IT DELIBERATELY DOES NOT SAY: which of the eleven things went wrong, whether
// this environment has a key, which company was asked, what it answered, or how
// much anything costs. A person pressing a button on a to-do list is owed the
// answer to "can I have suggestions" and nothing about the plumbing. The eleven codes
// exist for the owner, in the function's log lines.
//
// AND IT IS THE SAME SENTENCE FOR THE NO-KEY CASE, which is what production will
// answer for the whole of Build it 20 (docs/plan.md: "the production key is not
// installed -- so on production the helper answers that suggestions are not
// available, which is a real answer rather than a broken screen"). It is a true
// sentence there: suggestions genuinely are not available.
export const SUGGESTIONS_UNAVAILABLE = "Suggestions aren't available right now.";

// AND ONE SENTENCE THAT IS NOT THAT ONE, since Build it 22 (issue #221): today's
// limit. docs/plan.md's own words, character for character, and the same sentence
// the function sends -- supabase/functions/_shared/limits.ts, DAILY_LIMIT_MESSAGE.
//
// WHY IT IS NOT "Suggestions aren't available right now." The plan decided that
// against issue #184's condition 3, and the argument is worth keeping here because
// this is the file the decision is about: the thirteen fixed codes "all mean
// 'something in this app's plumbing went wrong, press it again later', and this one
// is a fact about the person's own day that they can plan around [...] hiding it
// behind 'Suggestions aren't available right now' would be using a sentence designed
// to conceal plumbing to conceal something useful."
//
// IT IS A COPY, like the two caps below, and for the reason in the header: the
// deployed function is a different program from the one in this branch until somebody
// deploys. scripts/screen-state-check.mjs compares this string with the function's
// own, so a change to one is a red check rather than two screens saying different
// things.
//
// WHAT IT DELIBERATELY DOES NOT SAY: how many are left, what the limit is, or the
// exact hour it resets. docs/plan.md names no number on purpose, and records that
// "tomorrow" is approximate for anybody not on UTC -- the counter rolls over at
// 00:00 UTC -- with the owner's decision of 2026-10-08 to keep the wording anyway.
export const SUGGESTIONS_DAILY_LIMIT =
  "You've reached today's limit. It resets tomorrow.";

// The code the function sends with that sentence. Read as an exact word and never
// printed -- the same treatment web/src/lib/teams.ts gives `account_suspended`, and
// for the same reason: a code read off an answer and shown on a screen is words
// somebody else chose appearing in our styling.
export const SUGGESTIONS_DAILY_LIMIT_CODE = "daily_limit";

// The same two caps the function applies, named here so the screen can hold the
// answer to them rather than taking the function's word for it. Copies on purpose,
// for the reason in the header; if they ever disagree, the smaller one wins, which
// is the safe direction.
export const SUGGESTIONS_MAX = 5;
export const SUGGESTION_CHARS_MAX = 80;

// What the screen does next. FOUR answers since Build it 22, no fifth, and still no
// empty-list answer.
//
//   ask          nobody has asked for suggestions on this screen. Nothing is drawn.
//   unavailable  the helper was asked and there is nothing to show. ONE sentence.
//   limit        this person has used today's allowance. Its OWN sentence, because
//                it is a fact about their day rather than about this app's plumbing,
//                and because it tells them when it comes back.
//   data         there is at least one suggestion, and every one of them is short
//                plain text.
export const SUGGEST_IDLE = "ask";
export const SUGGEST_UNAVAILABLE = "unavailable";
export const SUGGEST_LIMIT = "limit";
export const SUGGEST_DATA = "data";

export type SuggestOutcome =
  | { state: typeof SUGGEST_IDLE }
  | { state: typeof SUGGEST_UNAVAILABLE }
  | { state: typeof SUGGEST_LIMIT }
  | { state: typeof SUGGEST_DATA; suggestions: string[] };

/** Every state, exported so a check script can assert the list rather than copy it. */
export const SUGGEST_STATES: ReadonlyArray<SuggestOutcome["state"]> = [
  SUGGEST_IDLE,
  SUGGEST_UNAVAILABLE,
  SUGGEST_LIMIT,
  SUGGEST_DATA,
];

/**
 * Is this one line something the screen may draw as a suggestion?
 *
 * The same four questions the function asks, in the same order: is there anything
 * there, is it short enough, is it free of characters that are not text, and is it
 * free of a link. A link is not a subtask, and it is the one thing in a line of
 * text somebody might try to make clickable.
 */
export function drawableSuggestion(value: unknown): boolean {
  if (typeof value !== "string") return false;

  const text = value.trim();
  if (text === "") return false;
  if (text.length > SUGGESTION_CHARS_MAX) return false;
  if (text.includes("://")) return false;

  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20) return false;
    if (code >= 0x7f && code <= 0x9f) return false;
    if (code === 0x2028 || code === 0x2029) return false;
  }
  return true;
}

/**
 * What the screen shows, given what came back from the helper.
 *
 * `asked` is false when nobody pressed the button, which is the ordinary state of
 * the page and is NOT a failure -- that distinction is the whole reason there are
 * three states and not two.
 *
 * `failed` is true when the call did not succeed: an error from the client, a
 * non-2xx from the function, a network fault. It is checked BEFORE the data, so no
 * amount of data can overrule it -- the argument web/src/lib/screen-state.ts makes
 * about `failed` winning over `rows`, applied to a different kind of read.
 *
 * `data` is whatever the function answered with, as `unknown`: this function is
 * written to be handed anything at all, because an older deployed function is one
 * of the things it can be handed.
 *
 * `code` is the `code` field of a FAILED answer's body, when the page could read it.
 * It arrived with Build it 22 and it is the only reason this function needs to know
 * anything about why a call failed. Read as an exact word, compared with the one
 * value this app knows, and never printed -- so the worst an unexpected value can do
 * is produce the sentence this function has always produced.
 *
 * NOTE THE ORDER BELOW, because it is the part that matters: the limit is checked
 * BEFORE the general failure. Both are failures as far as the client is concerned,
 * and the limit's sentence is the more specific and the more useful one -- a person
 * told "suggestions aren't available right now" would press the button again, which
 * is the one piece of advice that is certainly wrong here.
 */
export function suggestOutcome(read: {
  asked: boolean;
  failed?: boolean;
  code?: unknown;
  data?: unknown;
}): SuggestOutcome {
  if (!read.asked) return { state: SUGGEST_IDLE };

  // TODAY'S LIMIT, before the general failure and only on a failure. A 200 carrying
  // this code is not a thing the function sends, and treating one as a refusal would
  // let an answer's body decide that suggestions are not shown.
  if (read.failed === true && read.code === SUGGESTIONS_DAILY_LIMIT_CODE) {
    return { state: SUGGEST_LIMIT };
  }

  if (read.failed === true) return { state: SUGGEST_UNAVAILABLE };

  const list = (read.data as { suggestions?: unknown } | null)?.suggestions;
  if (!Array.isArray(list)) return { state: SUGGEST_UNAVAILABLE };

  const suggestions: string[] = [];
  for (const item of list) {
    if (!drawableSuggestion(item)) continue;
    suggestions.push(String(item).trim());
    if (suggestions.length === SUGGESTIONS_MAX) break;
  }

  // NOUGHT USABLE SUGGESTIONS IS "unavailable", NOT AN EMPTY LIST. See the header:
  // a heading with nothing under it is a claim this screen cannot make.
  if (suggestions.length === 0) return { state: SUGGEST_UNAVAILABLE };

  return { state: SUGGEST_DATA, suggestions };
}

/** True only for the one state that may draw suggestions. */
export function showsSuggestions(outcome: SuggestOutcome): boolean {
  return outcome.state === SUGGEST_DATA;
}
