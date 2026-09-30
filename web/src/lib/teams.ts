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
