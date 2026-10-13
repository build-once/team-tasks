// account-deletion.ts -- every sentence this app says about deleting an account,
// and the one phrase somebody has to type.
//
// Build it 26. docs/deletion.md sections 3, 5, 10 and 12 are the design, and the
// owner's decisions of 2026-10-12 are built to rather than re-argued.
//
// IT HAS NO IMPORTS, so a plain `node` run can load it -- the same property
// web/src/lib/consent.ts, screen-state.ts and export-data.ts have, and for the
// same reason: scripts/screen-state-check.mjs imports the real module rather
// than a copy of it.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE IS NOT
// ---------------------------------------------------------------------------
//
// It is not the control. Nothing here deletes anything, and nothing here decides
// whether a deletion is allowed: supabase/functions/delete-account checks the
// typed phrase for itself, checks the account is not suspended for itself, and
// holds the only key that can remove a login. If every line below were deleted,
// nobody's account would be any safer or any less safe -- what would go is the
// person's chance to know what they were about to do.
//
// ---------------------------------------------------------------------------
// THE WARNING IS THE POINT, AND THIS IS WHY IT NAMES THINGS
// ---------------------------------------------------------------------------
//
// docs/deletion.md section 5, decision 2: the screen says how many tasks and how
// many files will go, and THE NAME OF EVERY TEAM the person owns, one per line,
// because "a deletion that names nothing is a deletion nobody can consent to".
//
// AND IT MUST NOT NAME THE OTHER MEMBERS, or anybody's address. A team's name is
// enough to identify it to the person who made it, and a list of the people who
// are about to lose it is a list of other people.

/** What the person has to type. The function holds the same phrase and checks it. */
export const CONFIRM_PHRASE = "delete my account";

/** The field the phrase arrives in. */
export const CONFIRM_FIELD = "confirm";

/** Where the deletion lives, and where somebody who cannot sign in goes. */
export const SETTINGS_PATH = "/settings";
export const REQUEST_PATH = "/delete-account";

/** The heading on the card, and the button's words. */
export const DELETE_HEADING = "Delete my account";
export const DELETE_BUTTON_LABEL = "Delete my account";

/**
 * Is what was typed the phrase?
 *
 * Trimmed and case-folded, because somebody typing into a box on a phone gets a
 * capital letter they did not ask for. Everything else is a no -- including a
 * truthy value, which is what a single click would send.
 *
 * THIS IS THE SECOND CHECK AND NOT THE FIRST. The function's own `confirmed`
 * is the one that counts; this one exists so the button can be refused before a
 * request is made, and so the screen can say why.
 */
export function phraseMatches(typed: unknown): boolean {
  if (typeof typed !== "string") return false;
  return typed.trim().toLowerCase() === CONFIRM_PHRASE;
}

// ---------------------------------------------------------------------------
// What the warning says
// ---------------------------------------------------------------------------
//
// EVERY SENTENCE IS A ROW IN docs/claims.md, and every one of them is
// docs/deletion.md's own, narrowed to fit a screen. Where one is shorter than
// the design's, it is shorter by leaving something out, never by adding
// anything.

/** It cannot be undone. First, because it is the only thing that matters. */
export const DELETE_IRREVERSIBLE =
  "This cannot be undone. There is no way to get any of it back.";

/**
 * What goes. The counts are filled in by `deletionWarning` below, because they
 * are facts about this person's own rows rather than words.
 */
export const DELETE_WHAT_GOES =
  "Your account, your nickname, your settings, and the tasks and files listed below.";

/** What stays, and it is the half somebody would not guess. */
export const DELETE_WHAT_STAYS =
  "Tasks you wrote in other people's teams stay with those teams, shown as “Former member”. " +
  "Your name is not on them any more, and nothing links them to you.";

/**
 * And what happens to a team the person owns.
 *
 * TWO FACTS IN ONE SENTENCE, and the second is the reassuring one that has to be
 * exact: the TEAM goes, its shared list goes, and every member's own task comes
 * back to them as a personal task. `tasks.team_id` is `on delete set null`, so
 * that is the database's behaviour rather than a promise this app keeps by hand.
 *
 * IT SAYS "they may not expect to find it there", which docs/claims.md asks for:
 * a true sentence can still surprise somebody.
 */
export const DELETE_TEAMS_GO =
  "Each team below is deleted, with any invitations waiting in it. Its members lose the team " +
  "and the shared list — but nobody loses a task they wrote themselves: each of those comes " +
  "back to whoever wrote it as a personal task, which they may not expect to find there.";

/** The fortnight, which docs/plan.md requires this build to say. */
export const DELETE_COPIES_REMAIN =
  "Encrypted copies of the whole app are kept for about a fortnight, so your data is gone " +
  "from the app at once and gone from the last copy up to about a fortnight later.";

/** And what cannot be recalled at all. */
export const DELETE_CANNOT_RECALL =
  "Anything already sent to the AI service cannot be recalled, and cannot even be found, " +
  "because nothing identifying you was sent with it. Error reports are deleted on request — " +
  "ask in the same message, because afterwards there is nothing left to find them by.";

/** What the person types, said plainly. */
export const DELETE_TYPE_TO_CONFIRM =
  `To confirm, type “${CONFIRM_PHRASE}” in the box.`;

/**
 * And the one sentence said AFTERWARDS, on the home page.
 *
 * WHY THERE, and it is the only place it could be: after a deletion there is no
 * signed-in person, so there is no signed-in screen left to say it on. The
 * action signs them out and sends them to `/`, which is public.
 *
 * IT REPEATS THE FORTNIGHT rather than only saying "deleted", because
 * docs/plan.md requires this build to tell somebody that copies remain -- and
 * the moment they are most likely to read it is the moment it has happened. A
 * sentence that said only "your account is deleted" would be a true-sounding
 * word that misleads, which is the failure that whole requirement exists for.
 */
export const ACCOUNT_DELETED =
  "Your account is deleted. Your tasks, your files and your teams are gone from the app. " +
  "Encrypted copies of the whole app are kept for about a fortnight, so your data goes from " +
  "the last of those up to about a fortnight from now.";

/**
 * The warning, with this person's own numbers in it.
 *
 * PURE, and the counts are passed in. `teams` is a list of NAMES, which the card
 * draws one per line -- decision 2 asks for the name of every team, and a count
 * alone would be a warning somebody could not check.
 *
 * `null` for a count means THIS APP COULD NOT READ IT, and it is said rather
 * than drawn as a nought: an unknown count in a warning about destruction is the
 * one place a `0` would be worst. That is Build it 19's rule again -- a failed
 * read is never an empty list -- applied to the sentence a person reads before
 * pressing the button.
 */
export function deletionWarning(counts: {
  tasks: number | null;
  files: number | null;
  teams: ReadonlyArray<string> | null;
}): ReadonlyArray<string> {
  const said: string[] = [DELETE_IRREVERSIBLE, DELETE_WHAT_GOES];

  said.push(
    counts.tasks === null
      ? "We could not count your tasks, so this page cannot tell you how many will go."
      : counts.tasks === 1
        ? "1 task of yours will be deleted."
        : `${counts.tasks} tasks of yours will be deleted.`,
  );

  said.push(
    counts.files === null
      ? "We could not count your files, so this page cannot tell you how many will go."
      : counts.files === 1
        ? "1 file on your tasks will be deleted."
        : `${counts.files} files on your tasks will be deleted.`,
  );

  if (counts.teams === null) {
    said.push(
      "We could not read your teams, so this page cannot name the ones that will be deleted.",
    );
  } else if (counts.teams.length > 0) {
    said.push(DELETE_TEAMS_GO);
  }

  said.push(DELETE_WHAT_STAYS, DELETE_COPIES_REMAIN, DELETE_CANNOT_RECALL);

  return said;
}

// ---------------------------------------------------------------------------
// What the screen says afterwards, keyed by a code this app chose
// ---------------------------------------------------------------------------
//
// A FIXED TABLE, for the reason spelled out beside TEAM_ACTION_OUTCOMES in
// web/src/lib/teams.ts: `/settings?problem=<anything>` is a URL anybody can
// build, so the worst a crafted link can do is show one of these sentences at a
// moment when it is not true. An unrecognised code shows nothing at all.

export const DELETE_CODES = [
  /** The box did not hold the phrase. */
  "phrase",
  /** The press did not carry this app's own button identifier. */
  "button",
  /** The account is suspended, which decision 7 refuses -- and it points. */
  "suspended",
  /** Too many tasks to walk safely. It refuses rather than half-doing it. */
  "toomany",
  /** Files could not be removed, so nothing was deleted. */
  "files",
  /** Everything else went and the login itself did not. The awkward one. */
  "login",
  /** Something else the app cannot explain. */
  "failed",
  /** The function was not reached at all. */
  "unreachable",
] as const;

export type DeleteCode = (typeof DELETE_CODES)[number];

export const DELETE_SENTENCES: Readonly<Record<DeleteCode, string>> = {
  phrase: `Nothing was deleted. ${DELETE_TYPE_TO_CONFIRM}`,
  button:
    "That did not look like a press of a button on this page, so nothing was deleted.",
  // The same sentence the other four doors give a suspended caller -- AND IT
  // POINTS SOMEWHERE, which is decision 7's other half: a suspended person's
  // only route is the request page, and a refusal that pointed nowhere is a
  // refusal nobody can act on.
  suspended:
    `You can't do that at the moment. If you want your account deleted, ask through ${REQUEST_PATH}.`,
  toomany:
    "There are too many tasks here for this to run safely, so nothing was deleted. " +
    `Please ask for your account to be deleted through ${REQUEST_PATH}.`,
  files:
    "Some of your files could not be removed, so nothing was deleted. Please try again.",
  // THE ONE THAT ADMITS SOMETHING HAPPENED. Everything else has gone and the
  // login has not, so "nothing was deleted" would be false -- and a second
  // attempt is safe, which is the useful half.
  login:
    "Your tasks and files were removed, but the account itself was not deleted. " +
    `Please try again, or ask through ${REQUEST_PATH}.`,
  failed: "Your account was not deleted. Please try again.",
  unreachable:
    "Could not reach the server, so nothing was deleted. Please try again.",
};

/** The sentence for a code, or null for anything this app did not write. */
export function deleteSentence(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const name = code.trim();
  return (DELETE_CODES as ReadonlyArray<string>).includes(name)
    ? DELETE_SENTENCES[name as DeleteCode]
    : null;
}

/**
 * Which code a failed call was, from the status and the body's `code`.
 *
 * READ FROM THE STATUS AND A KNOWN CODE WORD, NEVER FROM A MESSAGE. The long
 * note beside TEAM_ACTION_OUTCOMES in web/src/lib/teams.ts is the argument: a
 * sentence the deployed function wrote, drawn in this app's styling, is a
 * sentence nobody here has read.
 *
 * Pure: the caller does the reading of the body, this does the deciding, so the
 * deciding can be checked.
 */
export function deleteOutcome(answer: {
  reached: boolean;
  status?: unknown;
  code?: unknown;
}): DeleteCode {
  if (answer.reached !== true) return "unreachable";

  // Checked before the status, because each of these tells two refusals apart
  // that share one status -- and each earns different advice.
  if (answer.code === "account_suspended") return "suspended";
  if (answer.code === "not_confirmed") return "phrase";
  if (answer.code === "too_much_to_scan") return "toomany";
  if (answer.code === "files_not_cleared") return "files";
  if (answer.code === "login_not_deleted") return "login";

  return "failed";
}

// ---------------------------------------------------------------------------
// And the page somebody who cannot sign in reaches
// ---------------------------------------------------------------------------
//
// DECISION 10, 2026-10-12: NO FORM. Not a page with a form that posts
// somewhere: one public page that says what deleting does and gives one address
// to write to. What that buys is in docs/deletion.md section 12.1 -- no row, no
// endpoint, no email sent by this app, no CAPTCHA to add, no rate limit to
// choose, and no new store of strangers' addresses.
//
// WHAT IT COSTS, and the page has to carry it: the owner's own mailbox becomes
// the place a request sits, and THE REQUEST MUST COME FROM THE ADDRESS ON THE
// ACCOUNT. Without that, anybody who knows a volunteer's address could have
// their account destroyed by sending one email.
//
// WHO IT IS FOR, which is wider than it looks: somebody who has forgotten their
// password; somebody whose account is suspended (decision 7); somebody who
// signed up and never confirmed; and AN INVITED PERSON WHOSE ADDRESS IS IN THE
// INVITATIONS TABLE AND WHO NEVER HAD AN ACCOUNT AT ALL -- which this app has
// no other way of hearing from.

export const REQUEST_HEADING = "Ask for your account to be deleted";

/**
 * The page's `<head>` description.
 *
 * HERE RATHER THAN IN THE PAGE, for the reason `web/src/lib/legal.ts` gives
 * about its own: a description is a SENTENCE, it is shown to people in a search
 * result and in a link preview, and it is therefore a claim. Leaving it in the
 * page file would mean one sentence about deleting an account that nobody
 * reviewing the wording would ever see.
 *
 * The first version of this WAS in the page, and section 13f caught it -- the
 * same check that requires the page to hold no sentence of its own.
 */
export const REQUEST_DESCRIPTION =
  "How to ask for a Team Tasks account to be deleted when you cannot sign in.";

/**
 * The address. A COPY of legal.ts's `CONTACT_ADDRESS` and deliberately so.
 *
 * This module has no imports, which is what lets a check script load it -- and
 * `legal.ts` imports from three other modules through an alias only the Next.js
 * build resolves. So the value is written twice, and
 * scripts/screen-state-check.mjs compares the two: a drift turns a pull request
 * red rather than leaving one page pointing at an address nobody reads.
 */
export const REQUEST_ADDRESS = "dp@raj-dhonota.com";

/**
 * What the page says.
 *
 * It repeats the warning's facts rather than linking to them, because the person
 * reading it cannot sign in and so cannot see the warning. Everything in it is
 * either in `deletionWarning` above or in docs/deletion.md section 12.2.
 */
export const REQUEST_WORDS: ReadonlyArray<string> = [
  "If you can sign in, you can delete your account yourself in Settings. This page is for when you cannot.",
  `Write to ${REQUEST_ADDRESS} from the email address on the account, and ask for the account to be deleted.`,
  "It has to come from that address. That is the only way we can tell it is you — without it, anybody who knew your address could have your account destroyed.",
  "If you were invited to a team and never signed up, write from the address that was invited and we will remove it.",
  "This is a person reading a mailbox, not a button. It is not instant.",
  DELETE_IRREVERSIBLE,
  DELETE_WHAT_STAYS,
  DELETE_COPIES_REMAIN,
  DELETE_CANNOT_RECALL,
  "If a recovery ever has to happen from one of those copies, everybody is asked to sign in again.",
];

/**
 * What a suspended person is told here, and why they are here at all.
 *
 * Decision 7. It says what is true and nothing about why: `docs/plan.md` decided
 * on 4 October 2026 that nobody is notified of a suspension and that what they
 * are told is a decision this version does not make, so this says the least it
 * can while still pointing somewhere.
 */
export const REQUEST_SUSPENDED_NOTE =
  "If the app is refusing you, this is the way to ask. Write from the address on the account.";
