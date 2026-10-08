// buttons.ts -- what a button IS, as opposed to what a button SAYS.
//
// THE RULE THIS FILE EXISTS FOR: a button acts by a fixed identifier, never by its
// wording. Wording changes. It changes for a better sentence, for a shorter one
// that fits a phone, for a translation, and it changes in a hurry when somebody
// misreads a screen. Every one of those is a change to prose, and none of them
// should be able to change what a button does.
//
// WHAT WAS ALREADY TRUE, said plainly so this file is not read as a fix for a hole
// that existed: nothing in this app ever dispatched on a label. Each form posts to
// its own server action, and an action is a function, not a string. What was
// MISSING is the other half -- a way to tell two buttons apart that share an
// action, and anything at all written down that a check could hold the app to.
//
// Both of those are real today. "Send invitation" and "Try again" on My teams post
// to the SAME action (inviteMember), and the only thing distinguishing them was
// which hidden fields the surrounding form happened to carry. The two Try again
// buttons on a failed load are the same again: one action, several screens.
//
// So every submit button in this app now carries `name="act"` and one of the
// identifiers below, and the action reads it. The label beside it is prose and
// nothing else.
//
// WHY A BUTTON'S name/value IS THE RIGHT PLACE. A clicked submit button submits its
// own name and value with the form, and no other button's -- so the identifier
// arrives from the button that was actually pressed. It needs no JavaScript, which
// matters because every screen in this app is server-rendered and works with none.
//
// NO IMPORTS, so scripts/screen-state-check.mjs can load it with a plain `node`
// run.

// The form field every submit button uses. Short, and not a word that collides
// with anything in a form on these screens (`id`, `title`, `email`, `filter`,
// `team_id`, `done`, `display_name`, `name`, `password`, `token`, `target`).
export const ACT_FIELD = "act";

// Every button in the app, by identifier.
//
// THE IDENTIFIERS ARE NOT THE LABELS, and a few of them deliberately read nothing
// like the words on screen -- `invite_retry` is a button that says "Try again",
// `task_done` is a button whose whole label is a tick and a task's text. That is
// the point: the identifier says what the press MEANS, so the label is free to say
// whatever a person needs to read.
//
// Adding a button means adding a line here. The check script requires every value
// to be unique and in a fixed shape, so a copied line that kept the old value is
// caught rather than silently making two buttons the same button.
export const BUTTON_IDS = {
  // My tasks
  taskAdd: "task_add",
  taskDone: "task_done",
  taskRename: "task_rename",
  taskMove: "task_move",
  taskDelete: "task_delete",

  // My teams
  teamCreate: "team_create",
  nameSave: "name_save",
  inviteSend: "invite_send",
  inviteRetry: "invite_retry",

  // Settings. One button, and the switch it carries is the thing that decides
  // whether anybody's task title leaves this project (Build it 21, issue #211).
  aiSuggestionsSave: "ai_suggestions_save",

  // The invitation page
  inviteAccept: "invite_accept",

  // Sign in, sign up, and the two password screens
  signIn: "sign_in",
  signUp: "sign_up",
  resetRequest: "reset_request",
  passwordSave: "password_save",

  // Everywhere: the account menu, and the error look on any screen
  signOut: "sign_out",
  tryAgain: "try_again",
} as const;

export type ButtonId = (typeof BUTTON_IDS)[keyof typeof BUTTON_IDS];

// The shape an identifier must have: lower-case letters and underscores, nothing
// else. Not a rule about taste -- it is what makes an identifier obviously not a
// sentence, so a label pasted into one of these slots by mistake fails the check
// instead of becoming a working identifier.
const ID_PATTERN = /^[a-z][a-z_]*[a-z]$/;

/** Every identifier, for the check script and for `isButtonId` below. */
export const ALL_BUTTON_IDS: ReadonlyArray<ButtonId> = Object.values(BUTTON_IDS);

/** Does this identifier have the right shape? Used only by the check script. */
export function looksLikeButtonId(value: unknown): boolean {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/**
 * The identifier a form actually submitted, or null.
 *
 * Null for anything this app did not write: a missing field, a repeated field
 * (which arrives as an array), an unknown word, a label somebody posted by hand.
 * Every action treats null as "not a press I recognise" and changes nothing --
 * which is the behaviour that makes the identifier the thing that authorises the
 * action, rather than a decoration beside the thing that does.
 */
export function readButtonId(value: unknown): ButtonId | null {
  if (typeof value !== "string") return null;

  const name = value.trim();
  return (ALL_BUTTON_IDS as readonly string[]).includes(name)
    ? (name as ButtonId)
    : null;
}

/**
 * Was this form submitted by one of the buttons named?
 *
 * The question an action asks. `inviteMember` serves two buttons and asks
 * `pressed(act, [inviteSend, inviteRetry])`; every other action names its one.
 */
export function pressed(
  value: unknown,
  allowed: readonly ButtonId[],
): boolean {
  const id = readButtonId(value);
  return id !== null && allowed.includes(id);
}
