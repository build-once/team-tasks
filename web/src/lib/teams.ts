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
// person's address is never shown to the rest of the team (docs/plan.md).
export type Invitation = {
  id: string;
  team_id: string;
  email: string;
  expires_at: string;
};

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
// make the site display words somebody else chose. The first six come from
// accept-invite's `reason` field; "unreachable" is added by the action when the
// function could not be reached at all.
export const INVITE_REASONS = [
  "not_found",
  "expired",
  "used",
  "wrong_person",
  "signin",
  "failed",
  "unreachable",
] as const;

export type InviteReason = (typeof INVITE_REASONS)[number];
