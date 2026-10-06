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
  label: "sending" | "sent" | "could not be sent";
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
  if (invitation.status === "sent") {
    // Nothing more to say, and no button: somebody has that link.
    return { label: "sent", sentence: null, canRetry: false };
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
      label: "could not be sent",
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
    label: "sending",
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

// What a members list shows for somebody who has not set a nickname yet.
//
// team_roster left-joins profiles on purpose, so a person with no profile row
// still appears in their team's list with display_name null (see the view's
// comment in 20261002122203_team_rules.sql). This is what fills that gap.
//
// It is NOT their email address, and it must never become one: "never shown to
// team members" is a decision in docs/plan.md, and the app cannot read another
// person's address in any case -- addresses live in auth.users, which no policy
// in this database exposes.
export const NO_DISPLAY_NAME = "(no name yet)";

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
