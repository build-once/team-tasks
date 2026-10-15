// switches.ts -- what a screen says when the owner has switched a feature off.
//
// Build it 29, Lesson J24. The other three halves of this are
// supabase/migrations/20261015120000_feature_switches.sql (the table and the one
// reader), supabase/functions/_shared/switches.ts (the four sentences and the gate
// the five server functions call) and docs/incident-plan.md (how to use them).
//
// WHY THERE IS A COPY OF THE SENTENCES HERE AT ALL, when the functions already send
// them: web/src/lib/suggestions.ts answers that about the daily limit and the answer
// is the same one, so it is worth repeating rather than cross-referencing.
//
//   the deployed function is a DIFFERENT PROGRAM from the one in this branch until
//   somebody deploys.
//
// So a screen that only ever printed what an answer carried would print whatever the
// deployed version says -- including a version nobody here has read. The screens
// read a CODE from a fixed list and pick their own words, and
// scripts/screen-state-check.mjs compares this file's four sentences with the
// function's character for character, so a change to one is a red check rather than
// two screens saying different things.
//
// AND ONE SENTENCE HERE IS NOT A COPY OF ANYTHING, which is the attachments one:
// nothing in this app's server functions sends it, because an upload has no Edge
// Function in its path. The switch is enforced by two restrictive policies on
// storage.objects, and this file is the only place the words for it exist.
//
// IT HAS NO IMPORTS, so a plain `node` run can load it: Node strips the types as it
// reads the file. Nothing here talks to Supabase, reads a cookie, renders anything
// or looks at the clock -- the same property web/src/lib/screen-state.ts and
// web/src/lib/suggestions.ts have, and for the same reason.

// ---------------------------------------------------------------------------
// The four features, and how a screen asks about one
// ---------------------------------------------------------------------------
//
// The words are the database's: feature_switches_feature_allowed is the fixed list,
// and the rpc is the only way anything may read a switch.
export const SWITCH_AI_SUGGESTIONS = "ai_suggestions";
export const SWITCH_INVITATIONS = "invitations";
export const SWITCH_ATTACHMENTS = "attachments";
export const SWITCH_PAYMENTS = "payments";

export const SWITCHES = [
  SWITCH_AI_SUGGESTIONS,
  SWITCH_INVITATIONS,
  SWITCH_ATTACHMENTS,
  SWITCH_PAYMENTS,
] as const;

export type SwitchName = (typeof SWITCHES)[number];

// `public.feature_on(p_feature text)`, which is granted to `authenticated` because
// the storage policies are evaluated as the caller. So a screen may ask, and the
// answer is the same for everybody: a switch is a fact about this app, not about the
// person asking, and nothing about anybody is sent or returned.
export const SWITCH_RPC = "feature_on";
export const SWITCH_ARGUMENT = "p_feature";

// ---------------------------------------------------------------------------
// THE FOUR SENTENCES
// ---------------------------------------------------------------------------
//
// The first is the owner's wording for Build it 29, character for character; the
// other three are the same sentence about the other three features.
//
// WHAT THEY SAY, AND WHAT THEY DELIBERATELY DO NOT: that this app turned the feature
// off on purpose, and nothing about why, for how long, which company, which table,
// or what somebody should do instead. "for now" is the shortest honest way to say
// "somebody decided this and it can be undone" without promising a time nobody
// knows.
export const SWITCHED_OFF_SENTENCES: Readonly<Record<SwitchName, string>> = {
  [SWITCH_AI_SUGGESTIONS]: "Suggestions are switched off for now.",
  [SWITCH_INVITATIONS]: "Invitations are switched off for now.",
  [SWITCH_ATTACHMENTS]: "Attachments are switched off for now.",
  [SWITCH_PAYMENTS]: "Payments are switched off for now.",
};

// The codes the server functions send with those sentences. Read as exact words and
// NEVER printed -- the same treatment web/src/lib/teams.ts gives `account_suspended`
// and `daily_limit`, for the reason it gives: a code read off an answer and shown on
// a screen is words somebody else chose appearing in our styling.
export const SWITCHED_OFF_CODES: Readonly<Record<SwitchName, string>> = {
  [SWITCH_AI_SUGGESTIONS]: "ai_suggestions_switched_off",
  [SWITCH_INVITATIONS]: "invitations_switched_off",
  [SWITCH_ATTACHMENTS]: "attachments_switched_off",
  [SWITCH_PAYMENTS]: "payments_switched_off",
};

// And the `reason` accept-invite sends, which is how the /invite/<token> page is
// told which of ITS own sentences to draw. It is in INVITE_REASONS in
// web/src/lib/teams.ts, which is the fixed list that page will accept.
export const SWITCH_OFF_REASON = "switched_off";

// ---------------------------------------------------------------------------
// Reading a switch on a screen, and the one place this differs from the server
// ---------------------------------------------------------------------------

/**
 * Three states, exactly as the server's `readSwitch` has three verdicts.
 *
 * `unknown` is the one that matters and the one this file treats DIFFERENTLY from
 * the server, on purpose:
 *
 *   A SERVER FUNCTION FAILS CLOSED on an unknown, because it is about to spend
 *   money and an unknown is not permission.
 *
 *   A SCREEN DOES NOT, because a screen is not the control. Drawing "switched off"
 *   on a read that merely failed would be this app claiming a decision nobody made
 *   -- Build it 19's rule, and the same reason `switch_unknown` exists as a separate
 *   code. So on an unknown the screen is left exactly as it was, and the database is
 *   still what refuses: the restrictive storage policies and the five function gates
 *   do not care what this screen drew.
 */
export type SwitchState = "on" | "off" | "unknown";

/**
 * What a screen makes of an rpc answer.
 *
 * Handed the whole answer rather than a boolean, because `{ data, error }` is what
 * the client returns and because the reading is the thing worth checking: `=== true`
 * and `=== false` with everything else falling through, so the string "false" --
 * which is truthy in JavaScript, and is what a boolean column read back as text
 * looks like -- can never be read as "on".
 */
export function switchState(answer: {
  data?: unknown;
  error?: unknown;
} | null | undefined): SwitchState {
  if (!answer) return "unknown";
  if (answer.error) return "unknown";
  if (answer.data === true) return "on";
  if (answer.data === false) return "off";
  return "unknown";
}

/**
 * Should the screen say this feature is switched off, and hide its controls?
 *
 * ONLY FOR "off", never for "unknown" -- see SwitchState. One function rather than
 * `state === "off"` at four call sites, so there is one place this decision lives
 * and one place a check script can point at.
 */
export function switchedOffOnScreen(state: SwitchState): boolean {
  return state === "off";
}
