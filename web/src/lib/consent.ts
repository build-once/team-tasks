// consent.ts -- the AI suggestions setting, as seen from a screen: what state it is
// in, what the screen is allowed to say about it, and where somebody goes to change it.
//
// Build it 21 part 2b, issue #211. The database half is
// supabase/migrations/20261007204900_ai_suggestions_consent.sql and the half that
// actually enforces anything is supabase/functions/suggest-subtasks/index.ts.
//
// WHAT THIS FILE IS NOT. It is not the control. docs/plan.md says so in as many words:
// "suggest-subtasks sends nothing to the AI service unless the setting is on, and that
// is checked in the function [...] A screen that hid the button would not be this, and
// a screen is not where a rule lives." Everything here is about telling somebody the
// truth about a setting they own. If every line of this file were deleted, nobody's
// task title would leave this project, because the function checks for itself.
//
// So what is it FOR? Two things, and the second is the one that matters:
//
//   * so the Suggest subtasks button does not ask a question whose answer is already
//     known to be no -- which saves a round trip and, more to the point, lets the
//     screen say WHERE to switch the setting on, which the function cannot (it is
//     deployed separately from these pages and does not know their addresses);
//   * so the person can find the setting, read what it does, and change it. A setting
//     is not consent if the person switching it on cannot find out what it sends.
//
// IT HAS NO IMPORTS, so a plain `node` run can load it: Node strips the types as it
// reads the file. Nothing here talks to Supabase, reads a cookie, renders anything or
// looks at the clock -- the same property web/src/lib/screen-state.ts and
// web/src/lib/suggestions.ts have, and for the same reason.
//
// ---------------------------------------------------------------------------
// THE TRAP THIS FILE IS WRITTEN AROUND, which issue #207 found before any of it
// existed
// ---------------------------------------------------------------------------
//
// No client role holds SELECT on `profiles.ai_suggestions_enabled`. That is how the
// migration stops a team mate reading your setting through the existing "your team
// mates' profiles" policy -- and it closes your own ordinary read with it. So:
//
//   * reading the setting goes through `public.my_ai_suggestions()`, an RPC. A
//     `from("profiles").select("ai_suggestions_enabled")` is refused with 42501, for
//     the person's own row, every time.
//   * the WRITE must not ask for a representation of either new column.
//     `.update({ ai_suggestions_enabled }).select("ai_suggestions_enabled")` needs
//     SELECT on that column and is refused for the same reason. The read-back is a
//     separate call to the same RPC.
//
// web/src/app/settings/actions.ts is where both of those live, and the second is the
// reason the "Saved" banner is not drawn by the write's own answer.

// ---------------------------------------------------------------------------
// The name of the thing
// ---------------------------------------------------------------------------
//
// ONE NAME, USED EVERYWHERE. docs/plan.md calls it "AI suggestions" -- "A setting
// called AI suggestions, on each person's profile" -- so that is what it is called on
// the screen, in the heading, in the switch's label and in the sentence the function
// sends back. A feature with two names is a feature nobody can search for.
export const CONSENT_SETTING_NAME = "AI suggestions";

/** Where the setting lives, so nothing has to guess at the address. */
export const CONSENT_PATH = "/settings";

// ---------------------------------------------------------------------------
// What the screen says, and what makes each sentence true
// ---------------------------------------------------------------------------
//
// EVERY SENTENCE BELOW IS A ROW IN docs/claims.md. That is not a formality: each one
// is a statement about where somebody's words go, and issue #211 asks for "a row for
// every new sentence on the consent screen, each pointing at what makes it true".
//
// AND EVERY ONE OF THEM IS docs/plan.md's OWN WORDS, narrowed to fit a screen. The
// plan is the agreed description of what this feature does; a screen that described
// it differently would be a second, unreviewed description of where personal data
// goes. Where a sentence here is shorter than the plan's, it is shorter by leaving
// something out, never by adding anything.

// WHAT IS SENT. docs/plan.md: "What is sent, and nothing else: the title of the one
// task the person asked about, and fixed instructions written by this app. That is the
// whole request." And: "nothing identifying the asker is sent at all -- no address, no
// display name, no user ID, no team name."
export const CONSENT_WHAT_IS_SENT =
  "When you press Suggest subtasks, this app sends the title of that one task, " +
  "and nothing else about you: not your email address, not your name, not your " +
  "user ID, not your team's name, and none of your other tasks.";

// TO WHOM. Named, because "an AI service" is not an answer to "who has my words".
// docs/plan.md: "The service. Anthropic's Claude API".
export const CONSENT_WHO_GETS_IT =
  "It goes to Anthropic, the company that makes Claude. They are outside this app " +
  "and outside its database.";

// HOW LONG THEY KEEP IT. The figures are Anthropic's published ones, quoted in
// docs/plan.md with the page they came from, and they are stated as Anthropic's
// promise rather than as this app's -- because that is what they are. Nothing this
// project does can shorten them.
export const CONSENT_HOW_LONG =
  "Anthropic say they delete it within 30 days, with some exceptions of their own — " +
  "and keep it for up to 2 years if something is flagged as breaking their rules.";

// WHAT SWITCHING IT OFF DOES, AND WHAT IT CANNOT DO. docs/plan.md: "Switching it off
// stops any further sending at once [...] It does not recall what was already sent,
// and it cannot."
//
// THIS IS THE SENTENCE THE SCREEN EXISTS FOR. A switch that implied it undid
// something would be the one claim here that could not be put right afterwards, and
// issue #211 names it: "that switching it off stops further sending but does not
// recall what was sent".
export const CONSENT_OFF_MEANS =
  "Switching it off stops anything more being sent, straight away. It cannot bring " +
  "back what was already sent — that is with Anthropic, on their clock.";

// THE STARTING POINT. docs/plan.md: "Off for everyone -- including every account that
// already exists on the day it arrives, so nobody is opted in by a migration and a
// person who never touches it has never sent anything."
export const CONSENT_STARTS_OFF =
  "This starts off for everybody. If you have never switched it on, nothing of yours " +
  "has ever been sent.";

// ONLY YOU. docs/plan.md: "Only that person can switch it, and only for themselves.
// Not their team's owner, not another member, not the owner of the app on their
// behalf: there is no screen on which anybody changes anybody else's."
export const CONSENT_ONLY_YOU =
  "Only you can change this, and only for yourself. Nobody in your teams can see it " +
  "or change it.";

// What the Suggest subtasks button says when the setting is off. It has to say two
// things -- that it is off, and where to switch it on -- because a button that
// explained neither would read as a fault.
export const CONSENT_BUTTON_OFF =
  `${CONSENT_SETTING_NAME} are switched off, so nothing was sent. ` +
  `You can switch them on in Settings.`;

// The failed-read sentence, in the shape every other failed read on these screens
// uses: it says a read failed, never why. No database message, no code, no status.
export const CONSENT_READ_FAILED =
  `Your ${CONSENT_SETTING_NAME} setting could not be read, so this page cannot say ` +
  `whether it is on or off. Nothing has been changed.`;

// ---------------------------------------------------------------------------
// What state the setting is in, as far as a screen can tell
// ---------------------------------------------------------------------------
//
// THREE STATES, AND THE THIRD IS THE WHOLE REASON THIS IS A FUNCTION. "On", "off" and
// "we could not read it" -- and the third must never be drawn as either of the other
// two. The argument is screenState's, applied to a boolean instead of a row count: a
// failed read and a false arrive at a screen looking identical, because
// `data?.enabled ?? false` makes them the same value, and a failed read drawn as "off"
// is this app telling somebody they have not consented to something when it does not
// know.
//
// WHICH WAY ROUND THAT MATTERS, because it is not symmetric. Drawing a failed read as
// "off" tells somebody a falsehood about their own choice; drawing it as "on" would
// invite them to press a button believing their title may go. Neither is acceptable,
// so the state is neither, and the screen says so.
export const CONSENT_ON = "on";
export const CONSENT_OFF = "off";
export const CONSENT_UNREADABLE = "unreadable";

export type ConsentState =
  | typeof CONSENT_ON
  | typeof CONSENT_OFF
  | typeof CONSENT_UNREADABLE;

/** Every state, exported so a check script can assert the list rather than copy it. */
export const CONSENT_STATES: ReadonlyArray<ConsentState> = [
  CONSENT_ON,
  CONSENT_OFF,
  CONSENT_UNREADABLE,
];

/**
 * What a screen may say about the setting, given what `my_ai_suggestions()` answered.
 *
 * `failed` is true when the call returned an error. Checked FIRST, and nothing below
 * it can overrule it -- the rule web/src/lib/screen-state.ts exists to hold.
 *
 * `data` is whatever came back, as `unknown`, because this function is written to be
 * handed anything at all. The RPC returns a table of one row, which the Supabase
 * client gives back as an array of one object; `maybeSingle()` or a later change could
 * give the object itself. Both shapes are read, and anything else is unreadable rather
 * than guessed at.
 *
 * NOTE WHAT IS NOT AN ARGUMENT: who is asking. There is nothing to pass, because
 * `my_ai_suggestions()` takes no parameters and reads `auth.uid()` in its own body --
 * so there is no way for a screen to ask about somebody else's setting, by mistake or
 * otherwise. That property is the migration's, and this signature is how it is kept.
 */
export function consentState(read: {
  failed?: boolean;
  data?: unknown;
}): ConsentState {
  if (read.failed === true) return CONSENT_UNREADABLE;

  const row = Array.isArray(read.data) ? read.data[0] : read.data;
  if (row === null || typeof row !== "object") return CONSENT_UNREADABLE;

  const enabled = (row as { enabled?: unknown }).enabled;

  // `=== true` and `=== false`, with everything else unreadable. The same reasoning as
  // checkAiConsent in the function: the column is `boolean not null`, so a value that
  // is neither did not come out of it, and a truthy test would read the string "false"
  // as consent.
  if (enabled === true) return CONSENT_ON;
  if (enabled === false) return CONSENT_OFF;
  return CONSENT_UNREADABLE;
}

/**
 * May this screen draw the Suggest subtasks button as something that will work?
 *
 * Only when the setting is known to be ON. An unreadable setting is not a yes -- which
 * is the same way round as the function's own refusal, and deliberately so: a screen
 * that offered the button on an unreadable setting would send somebody to a refusal
 * they could not have predicted.
 */
export function mayAskForSuggestions(state: ConsentState): boolean {
  return state === CONSENT_ON;
}

/**
 * The state after a switch, read back out of the database.
 *
 * `wanted` is what the person pressed; `readBack` is what `my_ai_suggestions()` says
 * now. "Saved" is only true when those agree, which is Build it 19's rule: a banner
 * claiming something was saved must be a statement about what the database holds, not
 * about whether a write returned without an error.
 *
 * SO AN UNREADABLE READ-BACK IS NOT A SAVE, even though the write may well have
 * worked. That is the honest answer: the screen does not know, and saying "saved"
 * would be a claim it cannot support. The sentence it shows instead says exactly
 * that -- see SETTINGS_OUTCOMES in this file.
 */
export function savedAs(wanted: boolean, readBack: ConsentState): boolean {
  if (readBack === CONSENT_UNREADABLE) return false;
  return wanted ? readBack === CONSENT_ON : readBack === CONSENT_OFF;
}

// ---------------------------------------------------------------------------
// What the banner says after a press
// ---------------------------------------------------------------------------
//
// A FIXED TABLE, KEYED BY A CODE THIS APP CHOSE, for the reason spelled out beside
// TEAM_ACTION_OUTCOMES in web/src/lib/teams.ts: the old version of that page put a
// function's own message into `?error=` and printed it, so anybody could craft a link
// to this site that displayed words they chose, on our domain and in our styling. An
// unrecognised code shows nothing at all.
export const SETTINGS_OUTCOMES: Readonly<Record<string, string>> = {
  // The two good ones. They are separate words because they are separate claims, and
  // the second is the one somebody switching off wants to see confirmed.
  on:
    `${CONSENT_SETTING_NAME} are on. We read the setting back out of the database ` +
    `to be sure.`,
  off:
    `${CONSENT_SETTING_NAME} are off. Nothing more will be sent. What was already ` +
    `sent is with Anthropic, on their clock.`,

  // The write went through and the read-back did not, so the screen does not know.
  // NOT "saved", and not "failed" either: both would be claims.
  unconfirmed:
    `Your setting may have changed, but we could not read it back, so it is not ` +
    `confirmed. Open this page again to see where it stands.`,

  // The write itself was refused or errored.
  failed: `Your setting did not change. Please try again.`,

  // There is no profile row and no nickname was given, so there is nothing to write
  // the setting on. Issue #207's case, said rather than left to look like a fault.
  needname:
    `To switch ${CONSENT_SETTING_NAME} on we need a nickname to store the setting ` +
    `against. Please add one above and press Save again.`,

  // The nickname given alongside is not usable.
  badname: `A nickname needs some text, and no more than 40 characters.`,

  // The press did not carry a button identifier this app wrote.
  button: `That did not look like a press of a button on this page, so nothing changed.`,
};

/**
 * The sentence for a code, or null.
 *
 * Null for anything this app did not write, which is what stops a crafted link
 * printing chosen words on this site.
 */
export function settingsSentence(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const name = code.trim();
  return Object.prototype.hasOwnProperty.call(SETTINGS_OUTCOMES, name)
    ? SETTINGS_OUTCOMES[name]
    : null;
}

/** Which codes are good news, so the page knows which tone of banner to draw. */
export const SETTINGS_GOOD_CODES: ReadonlyArray<string> = ["on", "off"];

export function settingsWentWell(code: unknown): boolean {
  return typeof code === "string" && SETTINGS_GOOD_CODES.includes(code.trim());
}
