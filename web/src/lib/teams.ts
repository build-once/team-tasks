// One team, as the app reads it back from the database.
export type Team = {
  id: string;
  name: string;
  created_at: string;
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
