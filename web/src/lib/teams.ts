import {
  invitationStatusWord,
  type InvitationStatusWord,
} from "@/lib/words";

// One team, as the app reads it back from the database.
//
// owner_id is read because the select rule on teams is no longer owner-only:
// since 20261002122203_team_rules.sql a person reads every team they BELONG to
// as well as every team they own. "Did this person create this team?" is
// therefore a question the rows have to answer, and teams.owner_id is where
// ownership lives. The My teams page compares it with the signed-in person's id
// to split the two lists (issue #76).
//
// It is a user id, not a name or an address, and it is only ever compared --
// never shown. The people whose ids can arrive here are the owners of teams
// this person is already in, which is the same group team_roster shows them.
export type Team = {
  id: string;
  name: string;
  created_at: string;
  owner_id: string;
};

// docs/plan.md, feature 2: "Create a team: a name of 1 to 60 characters. One
// person may own at most 3 teams."
//
// All three numbers live in three places on purpose, and that is not
// duplication for its own sake:
//   * here, so the input box can stop a too-long name before a round trip;
//   * in supabase/functions/create-team, which is the only thing that can
//     actually write a team and so is the only place the limits are enforced;
//   * as check constraints in supabase/migrations, as the last line of defence.
// The one in this file is a convenience. It is never the check that counts,
// because anything running in a browser can be skipped.
export const NAME_MAX = 60;
export const MAX_TEAMS_PER_OWNER = 3;

// One pending invitation, as the owner's My teams page reads it back.
//
// Only the team's owner can read these rows: the select policy on invitations
// checks teams.owner_id, deliberately not team membership, because an invited
// person's address is never shown to the rest of the team (docs/plan.md). That is
// the same rule the two columns added below are read through -- docs/plan.md says
// of an invitation's status, "the team's owner, on My teams. Nobody else -- not
// the team's other members, and not the invited person", and no new rule was
// needed for it, because the rule that keeps the ADDRESS from the rest of the team
// already covers every column of the row.
//
// status and failure_code are typed as plain strings, not as a union of the three
// words and the four codes. That is deliberate: they arrive from the database, and
// narrowing them here would be this file claiming to know what came back -- the
// same reason RosterEntry.role below is a string. `invitationDelivery` is where an
// unexpected value is handled, and it handles it by saying so rather than by
// drawing nothing.
export type Invitation = {
  id: string;
  team_id: string;
  email: string;
  created_at: string;
  expires_at: string;
  status: string;
  failure_code: string;
};

// The four codes that may sit beside a failed invitation.
//
// THE LIST IS THE MIGRATION'S. 20261006095847_invitation_status.sql enforces it
// with the check constraint invitations_failure_code_allowed, and
// supabase/functions/invite-member/index.ts has its own copy for the same reason
// this one exists: so the code can name a value rather than spell a string.
// Neither copy decides anything. Adding a code needs a new migration.
//
// The three words a STATUS may hold -- 'queued', 'sent' and 'failed' -- are not
// listed here on purpose. Nothing on this side of the app needs to enumerate them:
// `invitationDelivery` below asks about one at a time and has an answer for a word
// it does not know, which is the behaviour that matters.
export const INVITATION_FAILURE_CODES = [
  "not_configured",
  "unreachable",
  "refused",
  "unconfirmed",
] as const;

// How long a 'queued' invitation may sit there before the page offers to send it
// again.
//
// THE FUNCTION IS WHAT DECIDES THIS, and its copy carries the full argument for
// the number -- supabase/functions/invite-member/index.ts, STALE_QUEUED_MINUTES.
// In short: a function that stopped between writing the row and writing the status
// leaves a row at 'queued' that nothing will ever move, and the clock is the only
// thing that can tell such a row from a send that is happening this second.
//
// The copy here exists so the Try again button appears at the same moment the
// function would honour it. A button that appears too early would be refused with
// "that invitation is being sent now", which is correct but reads as a broken
// button.
export const STALE_QUEUED_MINUTES = 15;

// What the owner is told about a failed send: one plain sentence per code, and
// NEVER the code itself.
//
// docs/plan.md, "Invitation status": "On a failure, a short reason code and
// nothing more -- never the email service's full reply, which can quote the
// address, the subject and the message." The code is what is STORED; these are
// what is SHOWN. Nothing the email service said reaches either, which is the whole
// reason the stored value is a code from a fixed list rather than a message.
//
// These are close to the sentences invite-member sends in its own 502 body, and
// deliberately not imported from it: that file is Deno code deployed to Supabase,
// and nothing in web/ can import it. If the two ever disagree the owner sees two
// wordings for one event, which is untidy and not dangerous -- whereas a screen
// that could not draw a stored code at all would be.
export const INVITATION_FAILURE_SENTENCES: Record<string, string> = {
  not_configured: "This app is not set up to send invitation email at the moment.",
  unreachable: "The email service could not be reached.",
  refused: "The email service would not accept the message.",
  unconfirmed:
    "The email service answered, but did not confirm that an email was created.",
};

// For a code this page does not recognise, which can only happen if a migration
// added one and this list was not updated with it.
//
// It says what is true -- the send did not work, and we cannot say why -- and it
// does NOT print the code. A raw value on a screen is the thing docs/plan.md's
// "never the email service's full reply" is guarding against, and "a code this
// page has never heard of" is exactly when printing one is most tempting and least
// safe.
export const INVITATION_FAILURE_FALLBACK =
  "The email did not go out. The reason is not one this page recognises.";

// What the owner sees beside one waiting invitation.
//
// `label` is the three words issue #166 asks for and nothing else. `sentence` is
// the plain explanation, shown only when there is something to explain.
// `canRetry` is whether to draw the Try again button, and it matches what
// invite-member's `retryVerdict` would decide -- a button is not offered for
// something the function would refuse.
export type InvitationDelivery = {
  label: InvitationStatusWord;
  sentence: string | null;
  canRetry: boolean;
};

// Pure, and `nowMs` is passed in rather than read from the clock, so this is the
// same shape as the function's `retryVerdict` and can be reasoned about without a
// clock or a database.
export function invitationDelivery(
  invitation: Pick<Invitation, "status" | "failure_code" | "created_at">,
  nowMs: number,
): InvitationDelivery {
  // THE WORD COMES FROM THE MAPPING, not from a literal here (Build it 19 rule 5).
  // invitationStatusWord in web/src/lib/words.ts is the one place a stored status
  // becomes something a person reads, and scripts/friendly-words-check.mjs holds
  // that mapping against the check constraint in
  // 20261006095847_invitation_status.sql. Reading it once, at the top, means the
  // three branches below cannot drift into spelling three different words.
  const label = invitationStatusWord(invitation.status);

  if (invitation.status === "sent") {
    // Nothing more to say, and no button: somebody has that link.
    return { label, sentence: null, canRetry: false };
  }

  if (invitation.status === "failed") {
    // Checked against the LIST, not against the sentence map, so a sentence
    // written for a code the migration does not allow cannot be shown. The two
    // could disagree only by somebody's mistake, and this is the direction to fail
    // in: a code off the list falls through to the fallback sentence, which says
    // what is true and prints nothing.
    const known = (INVITATION_FAILURE_CODES as readonly string[]).includes(
      invitation.failure_code,
    );
    return {
      label,
      sentence: known
        ? (INVITATION_FAILURE_SENTENCES[invitation.failure_code] ??
          INVITATION_FAILURE_FALLBACK)
        : INVITATION_FAILURE_FALLBACK,
      canRetry: true,
    };
  }

  // 'queued', or anything this page does not recognise.
  //
  // AN UNRECOGNISED STATUS IS DRAWN AS "sending" rather than as nothing at all. It
  // is the honest reading of a row nobody has confirmed, and it never shows the raw
  // value. The check constraint makes it unreachable through the database in any
  // case.
  //
  // IT GETS NO BUTTON EITHER, whatever the clock says, because invite-member's
  // retryVerdict refuses a status it does not recognise -- so the button would
  // offer something that would then be refused. Only a row that genuinely says
  // 'queued' can go stale.
  const createdAt = Date.parse(invitation.created_at ?? "");
  const stale =
    invitation.status === "queued" &&
    !Number.isNaN(createdAt) &&
    nowMs - createdAt >= STALE_QUEUED_MINUTES * 60_000;

  return {
    label,
    sentence: stale
      ? "Nothing has confirmed this one yet, so the email probably never went. " +
        "Try again to send a new link."
      : null,
    // An unreadable created_at means "how long" is unknown, and an unknown is not
    // "long enough" -- the function's retryVerdict refuses it for the same reason,
    // so offering the button here would offer something that would be refused.
    canRetry: stale,
  };
}

// docs/plan.md, feature 3: "an invitation expires after 7 days, and a team may
// have at most 20 pending." Both numbers are enforced by invite-member and by
// the database; the copies here are for wording on screen, never for deciding.
export const MAX_PENDING_INVITATIONS = 20;
export const INVITATION_DAYS = 7;

// An email address is at most 320 characters (64 local + @ + 255 domain), which
// is what the function checks too.
export const EMAIL_MAX = 320;

// This person's own display name, as the My teams page reads it back. One row
// per person at most: profiles.user_id is the primary key.
export type Profile = {
  display_name: string;
};

// docs/plan.md's appendix: the display name is "a nickname, never a real or
// full name". 40 characters is what profiles_display_name_length allows in
// 20261002122203_team_rules.sql, and that check constraint -- plus
// profiles_display_name_not_blank -- is what actually decides. The copy here
// stops the input box accepting something the database will refuse.
export const DISPLAY_NAME_MAX = 40;

// WHAT A MEMBERS LIST SHOWS FOR SOMEBODY WITH NO NICKNAME now lives in
// web/src/lib/words.ts, as NO_DISPLAY_NAME, beside the role words and the
// invitation-status words -- because it is the same kind of decision as those two
// (an internal absence turned into something a person reads) and because it is
// checked by the same script. It also changed: it used to read "(no name yet)",
// and Build it 19 asks for "Unnamed member".
//
// One line of a team's members list, as the page reads it from team_roster.
//
// display_name is nullable because the view left-joins profiles: a missing
// nickname is a missing name, never a missing person.
//
// role is the view's derived text -- 'owner' for the team's owner, 'member' for
// anybody with a team_members row. It is typed as a string rather than a union
// of those two words because it arrives from the database: narrowing it here
// would be this file claiming to know what came back.
export type RosterEntry = {
  team_id: string;
  display_name: string | null;
  role: string;
};

// The only outcomes /invite/[token] will describe.
//
// Every one of these is a CODE, never a message. The page maps each to its own
// fixed wording and ignores anything not on this list, so a crafted link cannot
// make the site display words somebody else chose. The first seven come from
// accept-invite's `reason` field; "unreachable" is added by the action when the
// function could not be reached at all.
//
// "account_suspended" was added on 4 October 2026 (issue #133), and this list is
// the half that makes it work. accept-invite now answers 403 with that reason
// when the caller has a row in account_status -- but
// web/src/app/invite/[token]/actions.ts accepts a reason only if it appears
// HERE, and otherwise falls back to the HTTP status, where 403 means
// "wrong_person". So leaving this list alone would have told a suspended person
// the invitation was sent to a different email address, and sent them off to
// sign in with an account they do not have.
export const INVITE_REASONS = [
  "not_found",
  "expired",
  "used",
  "wrong_person",
  "signin",
  "failed",
  "account_suspended",
  "unreachable",
] as const;

export type InviteReason = (typeof INVITE_REASONS)[number];

// ---------------------------------------------------------------------------
// What My teams says when a server function refuses (Build it 19, rule 2)
// ---------------------------------------------------------------------------
//
// WHAT THIS REPLACED, because the shape of the old mistake is the whole argument.
// web/src/app/teams/actions.ts had a helper called `messageFrom` that read the
// failed function's own body, pulled `error` out of it, trimmed it to 200
// characters and put it in `/teams?error=<that text>`. The page then printed it.
// Three things were wrong with that, in increasing order of seriousness:
//
//   1. The page could not know what it was about to draw. Whatever the deployed
//      function said appeared on screen -- including a version of the function
//      older or newer than this repository, saying something nobody here has read.
//   2. A function's message can quote data. invite-member's do not today (checked:
//      none of its `fail` calls interpolates the address), but "today" is not a
//      property of the code, and docs/plan.md's rule is that an error message from
//      this app never includes task text, names or addresses.
//   3. IT WENT THROUGH THE URL, so anyone could craft a link to this site that
//      displayed words they chose -- on our domain, in our styling. That is the
//      same hole web/src/app/invite/[token]/page.tsx already closed, and its
//      comment says exactly this: "a plausible-looking 'your account has been
//      suspended, telephone this number' on our own domain".
//
// So My teams now does what the invitation page does: it receives a SHORT CODE
// from a known list and picks its own wording. The worst a crafted link can do is
// show one of the sentences below at a moment when it is not true.
//
// WHERE THE CODE COMES FROM: the HTTP STATUS, which the function sets and a caller
// cannot forge, plus the `code` field for the one code the three functions
// genuinely send ("account_suspended"). NOT from the message. The mapping is
// `teamActionOutcome` below.
//
// WHAT THIS COSTS, said plainly rather than glossed over. A status is coarser than
// a sentence, and invite-member answers 409 to three different refusals -- the
// address is already in the team, it is the owner's own address, or the team is at
// its 20-invitation limit. One status, so one sentence, which names all three and
// claims none. That is a real loss of precision against the old behaviour, and the
// fix is for the function to send a code per refusal the way accept-invite does --
// which is a change under supabase/ and so outside this issue's limits. Filed.
export const TEAM_ACTION_OUTCOMES = [
  // The caller has no usable session. Honest answer: sign in again.
  "signin",
  // 400: the function would not take what was sent.
  "input",
  // 403 carrying the "account_suspended" code.
  "suspended",
  // 403 otherwise: a rule said no.
  "refused",
  // 404: the function could not find what the request named.
  "notfound",
  // 409: a limit, or something that already exists.
  "conflict",
  // 429 carrying the "daily_limit" code: this person has used today's allowance of
  // the thing that spends money. Build it 22, issue #221.
  //
  // IT IS TOLD APART BY ITS CODE, not by its status, for the same reason "suspended"
  // is: the sentence it earns is specific advice ("it resets tomorrow") and the
  // default sentence is the opposite advice ("please try again"). A 429 falling
  // through to `broke` would tell somebody to do the one thing that cannot work.
  "limit",
  // Anything else the function answered with -- 500, 503, a status nobody here
  // has seen. The app cannot explain it, so it says so and reports it.
  "broke",
  // The function was not reached at all: no status, no body, nothing known.
  "unreachable",
] as const;

export type TeamActionOutcome = (typeof TEAM_ACTION_OUTCOMES)[number];

// The one code the three server functions actually send in their body. Every
// other refusal is told apart by its status.
//
// It is read from the body rather than from the 403 because 403 has two causes and
// this is the only thing that separates them -- the same split
// web/src/app/invite/[token]/actions.ts makes, and for the same reason: the other
// 403 sentence tells somebody to do something, and telling a suspended person to
// do it would send them somewhere pointless.
export const SUSPENDED_CODE = "account_suspended";

// AND THE SECOND, since Build it 22 (issue #221): today's limit on the thing that
// spends money. supabase/functions/_shared/limits.ts, DAILY_LIMIT_CODE.
//
// Read as an exact word and never printed, exactly like the one above. So "the one
// code the three server functions actually send" is now two -- and both of them are
// read from the body for the same reason: their status alone would send the person
// the wrong advice.
export const DAILY_LIMIT_CODE = "daily_limit";

// THE SENTENCE, which is docs/plan.md's own and is the same one
// web/src/lib/suggestions.ts shows for the AI helper. "One sentence for both
// features", so this app says one thing about a daily limit however somebody met it.
//
// A COPY, like every other number and word in this file, for the reason beside
// INVITATION_FAILURE_CODES: the deployed function is a different program from the one
// in this branch until somebody deploys, and scripts/screen-state-check.mjs compares
// the two copies so a drift is a red check.
export const DAILY_LIMIT_SENTENCE =
  "You've reached today's limit. It resets tomorrow.";

/**
 * Which outcome a failed function call was.
 *
 * `reached` false when nothing was reached -- a network error, a relay error. Then
 *           nothing is known and nothing is claimed.
 * `status`  the HTTP status the function answered with.
 * `code`    the `code` field of the body, if it could be read.
 *
 * Pure: no clock, no network, no environment. The caller does the reading of the
 * body; this does the deciding, so the deciding can be checked.
 */
export function teamActionOutcome(answer: {
  reached: boolean;
  status?: unknown;
  code?: unknown;
}): TeamActionOutcome {
  if (answer.reached !== true) return "unreachable";

  // Checked before the status, because it is the thing that tells the two 403s
  // apart, and checked for exact equality with the one code this app knows --
  // never used as a word to print.
  if (answer.code === SUSPENDED_CODE) return "suspended";

  // And the same, for the same reason: a 429 whose sentence has to say when the
  // allowance comes back rather than "please try again".
  if (answer.code === DAILY_LIMIT_CODE) return "limit";

  switch (answer.status) {
    case 401:
      return "signin";
    case 400:
      return "input";
    case 403:
      return "refused";
    case 404:
      return "notfound";
    case 409:
      return "conflict";
    default:
      return "broke";
  }
}

/**
 * Is this an outcome the app cannot explain, and so should report?
 *
 * The refusals are not reported. A person at the limit of three teams, inviting
 * somebody already in the team, or -- since Build it 22 -- having used today's
 * twenty invitations, is the app working: filling Sentry with those would bury the
 * reports that matter and spend a free plan's quota on normal use. The two that ARE
 * reported are the two where something is wrong and nobody would otherwise hear
 * about it.
 *
 * SO "limit" IS NOT REPORTED, which needs no new line here because it is not one of
 * the two named below -- but it is worth saying, because a daily limit is exactly the
 * kind of thing somebody would reach for Sentry to count. The place that counts it is
 * the `usage_counts` table, which the operator reads in the dashboard; the error
 * reporter is not a metrics service and docs/plan.md's "Analytics: stays at none"
 * covers the temptation.
 */
export function worthReporting(outcome: TeamActionOutcome): boolean {
  return outcome === "broke" || outcome === "unreachable";
}

// THE SENTENCES. One map per action, because the same outcome means different
// things for the two of them: a 409 from create-team is the three-team limit, and
// a 409 from invite-member is one of three refusals about an address.
//
// Every sentence is written HERE, in this repository, and read by nothing but the
// page. None of them quotes a number read back from a function, an address, a team
// name or a code. The two numbers that do appear are the constants in this file --
// this app's own copies of the limits docs/plan.md sets -- interpolated at build
// time, not taken from an answer.
export const CREATE_TEAM_SENTENCES: Readonly<
  Record<TeamActionOutcome, string>
> = {
  signin: "Please sign in again, then create the team once more.",
  input: `A team needs a name of 1 to ${NAME_MAX} characters.`,
  suspended: "You can't do that at the moment.",
  refused: "You cannot create a team at the moment.",
  notfound: "The team could not be created. Please try again.",
  conflict: `You already own ${MAX_TEAMS_PER_OWNER} teams, the most allowed, so no team was created.`,
  // CREATE-TEAM IS NOT A LIMITED FEATURE AND CANNOT SEND THIS CODE. Creating a team
  // spends no money, so docs/plan.md's daily limits are on the other two things only
  // -- and `count_daily_use` would refuse the word anyway, because
  // usage_counts_feature_allowed is a fixed list of two.
  //
  // The entry exists because the type requires a sentence for every outcome, which is
  // the right way round: a screen that met an outcome it had no words for would draw
  // nothing. If it is ever reached, it is true and it is the same sentence the other
  // map uses.
  limit: DAILY_LIMIT_SENTENCE,
  broke: "The team could not be created. Please try again.",
  unreachable:
    "Could not reach the server, so no team was created. Please try again.",
};

export const INVITE_SENTENCES: Readonly<Record<TeamActionOutcome, string>> = {
  signin: "Please sign in again, then send the invitation once more.",
  input: "That does not look like an email address, so nothing was sent.",
  suspended: "You can't do that at the moment.",
  refused: "Only the team's owner can invite people, so nothing was sent.",
  notfound: "That team was not found, so no invitation was sent.",
  // The three-in-one sentence this file's note above is about. It names each
  // possibility and claims none of them, which is the same thing the My tasks
  // page does for a delete that matched no row.
  conflict:
    `No invitation was sent. That address may already be in the team, may already have one waiting, ` +
    `or may be your own — and a team may have at most ${MAX_PENDING_INVITATIONS} invitations waiting.`,
  // TODAY'S LIMIT (Build it 22, issue #221), and it is a DIFFERENT fact from the
  // `conflict` sentence above, which is about this team. This one is about this
  // person's day: it is per person, not per team, so somebody who owns three teams
  // has one allowance between them. The sentence names no number, by the plan's
  // decision, so it says nothing about which of the two limits was met -- and that is
  // right, because the `conflict` sentence is the one that names the team's.
  limit: DAILY_LIMIT_SENTENCE,
  broke: "That invitation could not be sent. Please try again.",
  unreachable:
    "Could not reach the server, so no invitation was sent. Please try again.",
};
