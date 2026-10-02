// One job on somebody's list, as the app reads it back from the database.
//
// team_id and owner_id arrived with 20261002133637_tasks_join_teams.sql, which
// widened the select rule on tasks from owner-only to "its creator, or any
// member of its team". The rows that come back are therefore no longer all the
// same kind of thing, and the screen has two questions to answer about each one
// that it used to be able to assume:
//
//   team_id   null for a personal task, or the team the task belongs to. The
//             page turns it into a team NAME, so a team mate's task is never
//             drawn as though it were your own (issue #83).
//   owner_id  who created it. Only the creator may delete a task, so this is
//             what decides whether a delete control is drawn at all.
//
// owner_id is a user id, not a name or an address. It is only ever compared with
// the signed-in person's own id -- never shown, and never put in a link.
export type Task = {
  id: string;
  title: string;
  done: boolean;
  created_at: string;
  team_id: string | null;
  owner_id: string;
};

// docs/plan.md keeps task text short on purpose, and asks people not to type
// personal details into it. The same limit is a check constraint in
// supabase/migrations, so the database refuses a longer one as well.
export const TITLE_MAX = 200;

// A team as the My tasks page needs one: its id, to file a task into it and to
// filter by it, and its name, to label the tasks that belong to it.
//
// Deliberately narrower than Team in lib/teams.ts, which also carries
// created_at and owner_id: this page shows neither, and a query asks for the
// columns it shows and nothing more (Lesson D17).
//
// Which teams come back is the database's decision, not this screen's: since
// 20261002122203_team_rules.sql the select rule on teams is is_team_member(id),
// so it returns every team this person owns and every team they belong to. That
// is exactly the set feature 4 allows a task to be filed into, which is why the
// page can offer every row it gets back and can never offer a team somebody is
// not in.
export type TaskTeam = {
  id: string;
  name: string;
};

// What the list is showing. "all" is the default, and is never written into a
// URL -- an absent filter is what "all" looks like. "personal" means team_id is
// null. Anything else is a team's id.
export const FILTER_ALL = "all";
export const FILTER_PERSONAL = "personal";

// The shape Postgres accepts for a uuid: 8-4-4-4-12 hex digits.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Is this the shape of a team id? A shape check and nothing else: it says
// nothing about whether such a team exists, or whether the person asking
// belongs to it. Both of those are the database's answer to give, and it does
// give them -- the select rule on teams decides which teams the page can read,
// and the insert policy plus tasks_enforce_column_rules() decide which team a
// task may be filed into.
export function isTeamId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

// Narrow a filter -- from the query string, or from a hidden field on a form
// this page drew -- down to something safe to put back into a URL: "personal",
// a team id in uuid shape, or null for "show everything".
//
// null is the answer for "all", for a missing value, and for anything
// unrecognised, so a crafted ?filter= travels no further than this function and
// is never echoed back into a link.
//
// What it cannot do is say whether a uuid names a team this person belongs to.
// Only the page can, by looking for it among the teams the database let it
// read -- and it says so on screen when the answer is no, rather than quietly
// showing an empty list.
export function readFilter(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (text === FILTER_PERSONAL) return FILTER_PERSONAL;

  // Lowercased because that is how Postgres gives a uuid back, and this value is
  // compared with tasks.team_id as text rather than being sent to the database.
  return isTeamId(text) ? text.toLowerCase() : null;
}

// Which list the page is showing, worked out from the ?filter= it was given and
// the ids of the teams the database let it read. Three answers, because the
// screen needs three different things:
//
//   active   what the page draws: "all", "personal", or a team id.
//   carried  what every link and form on the page passes on -- the same value,
//            except that "all" carries nothing, because an absent filter IS
//            "all". A filter that was not applied carries nothing either, so
//            following any link clears it instead of taking the complaint along.
//   missed   the filter named a team that is not in the list given. This is said
//            out loud on screen, rather than drawn as an empty list: an empty
//            list would read as "that team has no tasks", which is a claim no
//            page can make about a team it cannot see.
//
// The membership question itself is never answered here. It is answered by the
// rows the caller passes in, which came from the database.
export function resolveFilter(
  value: unknown,
  teamIds: readonly string[],
): { active: string; carried: string | null; missed: boolean } {
  const requested = readFilter(value);

  const missed =
    requested !== null &&
    requested !== FILTER_PERSONAL &&
    !teamIds.includes(requested);

  const active = missed ? FILTER_ALL : (requested ?? FILTER_ALL);

  return { active, carried: active === FILTER_ALL ? null : active, missed };
}

// Which list to show once a task has been added, given the list the person was
// looking at and the list the task went into.
//
// Adding a task to one list while filtered to another would leave the new task
// out of sight, which reads exactly like the add having failed. So when the
// filter in front of the person would not show what they just added, the list
// moves to the one that does. A null filter is "all tasks", which already shows
// it, and is left alone.
export function filterAfterAdd(
  filter: string | null,
  destination: string,
): string | null {
  return filter === null || filter === destination ? filter : destination;
}

// A /tasks link or redirect, carrying only the keys given and only values this
// app chose for them.
//
// Every link on the page and every redirect in actions.ts goes through here, so
// the list a person is looking at survives a tick, a rename, a delete and every
// refusal in between. A list that jumps back to "all tasks" after each action is
// a list nobody can work in -- and the filter is the one thing on this page that
// has to persist, because it decides what the person can see.
export function tasksPath(params: {
  filter?: string | null;
  rename?: string;
  confirm?: string;
  added?: string;
  problem?: string;
}): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value !== "") query.set(key, value);
  }

  const text = query.toString();
  return text === "" ? "/tasks" : `/tasks?${text}`;
}

// What a team task shows when its team's name is not among the rows the page
// could read. The screen cannot tell the two reasons apart, so the wording
// beside it names both: the teams query failed, or the task's creator has left
// the team -- in which case they still read their own task, through owner_id,
// while no longer reading the team row that would name it.
//
// Never a team id instead: an id is not a name, and this page shows no ids.
export const TEAM_NOT_SHOWN = "(team not shown)";

// Postgres's insufficient_privilege. PostgREST passes the code straight through,
// and the client's own reference says to branch on it: "code -- stable error
// code from PostgREST (e.g. PGRST301) or Postgres (e.g. 42501). Branch on this
// rather than on message text." (PostgrestError, in
// web/node_modules/@supabase/postgrest-js/dist/index.d.mts.)
//
// Three things raise it on tasks: a row-level policy refusing a write, and the
// two 42501s raised by hand in tasks_enforce_column_rules()
// (20261002133637_tasks_join_teams.sql). All three mean the same thing to the
// person at the screen -- not that it broke, but that they may not -- and that
// is a different sentence from "please try again".
export const REFUSED_CODE = "42501";
