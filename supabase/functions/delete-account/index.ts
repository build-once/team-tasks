// delete-account -- the only way an account gets deleted, and the only
// irreversible thing in this app.
//
// Build it 26. docs/deletion.md section 3 is the order, and every step below
// names the step it is. The owner's decisions of 2026-10-12 are built to and
// not re-argued.
//
// DEPLOYED NOWHERE when this was written, and the migration it needs is applied
// nowhere either: supabase/migrations/20261013140000_account_deletion.sql.
// Without that migration this function CANNOT succeed -- step 6 is refused by
// tasks_enforce_column_rules() the moment the cascade tries to null an
// owner_id -- so a deploy without an apply would leave a button that always
// fails. The pull request says so, and so does the owner's order of steps.
//
// ---------------------------------------------------------------------------
// WHY A FUNCTION AT ALL
// ---------------------------------------------------------------------------
//
// One thing in the whole operation needs the secret key: removing the
// `auth.users` row, which no policy can express and no SQL the app can run will
// do. Everything else is done with the CALLER'S OWN RIGHTS, through the
// policies -- which is docs/deletion.md's own decision, and the reason it gives:
// "no part of this app deletes anything with more authority than the person
// asking". So `ctx.supabase` does the work and `ctx.supabaseAdmin` appears
// exactly twice, both marked.
//
// ---------------------------------------------------------------------------
// THE ORDER IS FORCED, NOT PREFERRED, and two facts force it
// ---------------------------------------------------------------------------
//
//   A SQL DELETE CANNOT DELETE A FILE. Supabase: "Deleting objects via a SQL
//   query will not remove the object from the bucket and will result in the
//   object being orphaned". So the bytes come out through the Storage API, and
//   they must come out BEFORE the rows, or they are paid for and unreachable.
//
//   THE RIGHT TO DELETE A FILE COMES FROM THE TASK. The storage DELETE policy
//   asks "did you upload it, or did you create the task?" -- so deleting the
//   task first destroys the permission to clear its files. And the login is
//   last for the same reason one level up: delete it and nothing is left that
//   may delete anything.
//
// ---------------------------------------------------------------------------
// A REFUSAL STOPS THE WHOLE THING AND SAYS SO
// ---------------------------------------------------------------------------
//
// Nothing is half-done on purpose. Every step below can refuse, and a refusal
// returns a code and leaves the account there -- so the person can try again,
// and the next attempt starts from wherever the last one got to. There is no
// transaction across Storage and the database and there cannot be one; what
// there is instead is an order in which a failure leaves something visible and
// recoverable rather than something nobody can reach.
//
// ---------------------------------------------------------------------------
// WHAT IT NEVER DOES
// ---------------------------------------------------------------------------
//
// No console.log, anywhere, for the reason create-team gives: docs/plan.md
// decided "Logs: we add none of our own", and this function handles a task's
// text, a team's name, a file's name and an email address. A Postgres or
// Storage CODE is returned instead, which carries no personal data.
//
// It writes no tombstone. docs/deletion.md section 9.2 settles that it should
// have one -- two columns, 30 days -- and the owner's instruction of
// 2026-10-13 is that it is NOT part of this change. It is filed as an issue,
// and nothing here claims a restore cannot bring a deleted person back.

import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// ---------------------------------------------------------------------------
// The shapes a refusal takes
// ---------------------------------------------------------------------------

/** The bucket. The same literal the migration and the app use. */
const BUCKET = "attachments";

/** At most three files per task, so four is "the three, and evidence of more". */
const LIST_LIMIT = 4;

/**
 * What the person has to type, exactly, before anything is destroyed.
 *
 * CHECKED HERE AS WELL AS ON THE SCREEN, and the server's check is the one that
 * counts: a screen can be skipped. docs/deletion.md step 1 asks for "a typed
 * confirmation, not a single click", because this is the only irreversible
 * thing in the app.
 *
 * It is compared after trimming and case-folding, because somebody typing a
 * word into a box on a phone gets a capital letter they did not ask for.
 */
export const CONFIRM_PHRASE = "delete my account";

/**
 * How many of the caller's visible tasks this function will walk.
 *
 * WHY THERE IS A CEILING AND WHY IT REFUSES RATHER THAN TRUNCATING. Step 3 has
 * to look at every task the caller can SEE but does not own, because those are
 * where a file they uploaded can survive -- and a storage listing is one
 * request per task. A person in a busy team can see thousands.
 *
 * A truncation here would leave files nobody can ever reach (see step 3), so
 * this refuses instead and says so. 1000 is above the 500-task cap on one
 * person's own list, so the only way to meet it is to be in teams holding more
 * than that between them.
 */
export const MAX_TASKS_SCANNED = 1000;

function fail(message: string, status: number, code?: string) {
  // One shape for every failure, so the page can always read `error`.
  return Response.json({ error: message, code }, { status });
}

// ---------------------------------------------------------------------------
// The suspended-account check -- Build it 16, issue #133
// ---------------------------------------------------------------------------
//
// IDENTICAL TO THE FOUR OTHER DOORS, on purpose and in the same way: if one
// changes the others must change with it. The long argument is in
// supabase/functions/create-team/index.ts and is not repeated; the two lines
// that matter here are that this function writes with `service_role`, which
// bypasses every restrictive policy in 20261004114313_suspend_accounts.sql, and
// that it must NOT call public.is_active(), which answers about auth.uid() and
// would be false for every caller on an admin connection.
//
// AND THIS IS THE FIFTH DOOR, which docs/deletion.md's decision 7 of 2026-10-12
// settles: a suspended person may NOT delete their own account, and asks through
// the public request page instead. So this is not the first of five doors to
// skip the check -- it keeps it, and the refusal points at that page.
const SUSPENDED_CODE = "account_suspended";

const SUSPENDED_MESSAGE = "You can't do that at the moment.";

export function suspendedRefusal(): Response {
  return fail(SUSPENDED_MESSAGE, 403, SUSPENDED_CODE);
}

/** Three answers, not two. "I could not tell" is the one that matters. */
export type SuspensionVerdict =
  | { allowed: true }
  | { allowed: false; why: "suspended" }
  | { allowed: false; why: "unknown"; code?: string };

export type AccountStatusRead = () => PromiseLike<{
  data: unknown;
  error: { code?: string } | null;
}>;

export async function checkSuspension(
  read: AccountStatusRead,
): Promise<SuspensionVerdict> {
  let answer: { data: unknown; error: { code?: string } | null };
  try {
    answer = await read();
  } catch {
    return { allowed: false, why: "unknown" };
  }

  if (answer?.error) {
    return { allowed: false, why: "unknown", code: answer.error.code };
  }
  if (!Array.isArray(answer?.data)) {
    return { allowed: false, why: "unknown" };
  }
  if (answer.data.length > 0) {
    return { allowed: false, why: "suspended" };
  }
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// The confirmation, as a pure function so a test can drive it
// ---------------------------------------------------------------------------

/**
 * Did the request carry the typed confirmation?
 *
 * Exported so supabase/functions/_tests/ runs THIS function rather than a copy
 * of it -- the same argument `checkSuspension` carries.
 *
 * ANYTHING THAT IS NOT THE PHRASE IS A NO, including an empty body, a missing
 * field, a boolean true, and the phrase with something else after it. A
 * confirmation that accepted a truthy value would be a confirmation a single
 * click could satisfy.
 */
export function confirmed(body: unknown): boolean {
  const typed = (body as { confirm?: unknown } | null)?.confirm;
  if (typeof typed !== "string") return false;
  return typed.trim().toLowerCase() === CONFIRM_PHRASE;
}

/**
 * Which of the caller's visible tasks is which.
 *
 * Pure, so the whole plan of a deletion can be checked without a database.
 *
 *   `own`      every task the caller created. Their files go in step 2, and the
 *              rows in step 4a if they are personal or in a team the caller
 *              owns -- otherwise they SURVIVE with a null owner, which is the
 *              whole of decision 1.
 *   `elsewhere` every task the caller can see and did NOT create. Step 3 walks
 *              these, because a file the caller uploaded to one of them has no
 *              route to deletion once their account is gone.
 *   `formerInOwnTeams` tasks in a team the caller owns whose creator has
 *              ALREADY gone. Step 4b removes these explicitly, because when the
 *              team goes they would get team_id null beside an owner_id that is
 *              already null -- and then no policy returns them to anybody.
 */
export type TaskSplit = {
  own: ReadonlyArray<{ id: string; teamId: string | null }>;
  elsewhere: ReadonlyArray<{ id: string }>;
  formerInOwnTeams: ReadonlyArray<{ id: string }>;
};

export function splitTasks(
  rows: unknown,
  callerId: string,
  ownedTeamIds: ReadonlyArray<string>,
): TaskSplit {
  const own: Array<{ id: string; teamId: string | null }> = [];
  const elsewhere: Array<{ id: string }> = [];
  const formerInOwnTeams: Array<{ id: string }> = [];

  if (!Array.isArray(rows)) return { own, elsewhere, formerInOwnTeams };

  const owned = new Set(ownedTeamIds);

  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const task = row as { id?: unknown; owner_id?: unknown; team_id?: unknown };
    if (typeof task.id !== "string" || task.id === "") continue;

    const teamId = typeof task.team_id === "string" ? task.team_id : null;

    if (task.owner_id === callerId) {
      own.push({ id: task.id, teamId });
      continue;
    }

    // A FORMER MEMBER'S TASK IN A TEAM THE CALLER OWNS is in BOTH lists, and
    // deliberately: step 3 attempts its files -- the new storage policy admits a
    // team owner for exactly this case -- and step 4b removes the row. Leaving
    // it out of `elsewhere` would leave files on a row step 4b then could not
    // delete, because the trigger refuses a task that still has one.
    if (task.owner_id === null && teamId !== null && owned.has(teamId)) {
      formerInOwnTeams.push({ id: task.id });
    }

    elsewhere.push({ id: task.id });
  }

  return { own, elsewhere, formerInOwnTeams };
}

/**
 * Which of the caller's own tasks are deleted outright in step 4a.
 *
 * Personal ones, and ones in a team the caller owns -- which would go with the
 * team anyway, and are removed explicitly so that step 6's `set null` leaves
 * behind ONLY the tasks that are meant to survive.
 *
 * Everything else is a task the caller created in SOMEBODY ELSE'S team. Those
 * stay, and decision 1 is what says so.
 */
export function tasksToDelete(
  own: TaskSplit["own"],
  ownedTeamIds: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const owned = new Set(ownedTeamIds);
  return own
    .filter((task) => task.teamId === null || owned.has(task.teamId))
    .map((task) => task.id);
}

/**
 * Which folders are emptied WHOLE, and which only of the caller's own uploads.
 *
 * THIS FUNCTION EXISTS BECAUSE THE FIRST VERSION GOT IT WRONG, and the mistake
 * is worth naming: step 2 cleared the whole folder of every task the caller
 * CREATED -- and a task they created in somebody else's team SURVIVES them
 * (decision 1). So a departing person took with them every file their team
 * mates had attached to a task that was staying. The recorded decision is the
 * other way round:
 *
 *   remove every file the departing person UPLOADED, wherever it is;
 *   remove EVERYTHING only on tasks that are themselves being deleted.
 *
 * `whole`    the tasks in `tasksToDelete` -- personal, or in a team the caller
 *            owns. The row is going, so nothing on it may be left behind, and
 *            the DELETE policy admits the task's creator for every file on it
 *            whoever uploaded it (the owner's decision of 8 October 2026).
 * `mineOnly` everything else the caller can reach: their own tasks that SURVIVE,
 *            and every task they did not create. On those the policy admits
 *            only "you uploaded it", so attempting each file removes exactly
 *            theirs and leaves every other -- and a refusal is the ordinary
 *            case rather than a failure.
 *
 * A task is in exactly one of the two lists, never both and never neither.
 */
export function folderPlan(
  split: TaskSplit,
  ownedTeamIds: ReadonlyArray<string>,
): { whole: ReadonlyArray<string>; mineOnly: ReadonlyArray<string> } {
  const doomed = new Set(tasksToDelete(split.own, ownedTeamIds));

  return {
    whole: split.own.filter((task) => doomed.has(task.id)).map((task) => task.id),
    mineOnly: [
      // THE CALLER'S OWN TASKS THAT SURVIVE. This is the list the first version
      // was missing, and it is the whole of the fix.
      ...split.own.filter((task) => !doomed.has(task.id)).map((task) => task.id),
      ...split.elsewhere.map((task) => task.id),
    ],
  };
}

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

export default {
  // auth: "user" is what makes this signed-in only, and it is what gives us
  // ctx.supabase scoped to the caller's own policies -- which this function
  // needs more than any other, because almost everything it does is done with
  // the caller's own rights.
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const callerId = ctx.userClaims?.id;
    if (!callerId) {
      // Should be unreachable with auth: "user". Fail closed rather than guess.
      return fail("You must be signed in to delete your account.", 401);
    }

    // ---- Is this account suspended? --------------------------------------
    //
    // BEFORE the body is parsed and before anything is read, exactly as in the
    // other four doors. A suspended person is refused here and the SCREEN points
    // them at /delete-account, which is decision 7's other half: a refusal that
    // pointed nowhere is a refusal nobody can act on.
    const suspension = await checkSuspension(() =>
      ctx.supabaseAdmin
        .from("account_status")
        .select("user_id")
        .eq("user_id", callerId)
        .limit(1)
    );
    if (!suspension.allowed) {
      if (suspension.why === "suspended") return suspendedRefusal();
      return fail(
        "Could not check your account, so nothing was deleted. Please try again.",
        500,
        suspension.code,
      );
    }

    // ---- Step 1: the typed confirmation ----------------------------------
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("Expected a JSON body with a confirmation.", 400);
    }
    if (!confirmed(body)) {
      return fail(
        "Nothing was deleted: the confirmation did not match.",
        400,
        "not_confirmed",
      );
    }

    // ---- What is about to happen -----------------------------------------
    //
    // Read with the CALLER'S OWN RIGHTS, so a uuid nobody may see cannot be
    // walked by guessing one. The teams read returns every team the caller owns
    // or belongs to; only the owned ones matter here.
    const teamsAnswer = await ctx.supabase
      .from("teams")
      .select("id, owner_id");
    if (teamsAnswer.error) {
      return fail(
        "Could not read your teams, so nothing was deleted. Please try again.",
        500,
        teamsAnswer.error.code,
      );
    }
    const ownedTeamIds = (teamsAnswer.data ?? [])
      .filter((row) => (row as { owner_id?: unknown }).owner_id === callerId)
      .map((row) => (row as { id: string }).id);

    const tasksAnswer = await ctx.supabase
      .from("tasks")
      .select("id, owner_id, team_id");
    if (tasksAnswer.error) {
      return fail(
        "Could not read your tasks, so nothing was deleted. Please try again.",
        500,
        tasksAnswer.error.code,
      );
    }

    const visible = tasksAnswer.data ?? [];
    if (visible.length > MAX_TASKS_SCANNED) {
      // IT REFUSES RATHER THAN TRUNCATING, which is the whole point of the
      // ceiling: a partial walk of step 3 leaves files nobody can ever reach.
      return fail(
        "There are too many tasks here for this to run safely, so nothing was deleted. Please ask for your account to be deleted by hand.",
        409,
        "too_much_to_scan",
      );
    }

    const split = splitTasks(visible, callerId, ownedTeamIds);
    const folders = folderPlan(split, ownedTeamIds);

    let filesRemoved = 0;

    // ---- Step 2: every file on every task that is BEING DELETED -----------
    //
    // NOT "every task the caller created", which is what the first version of
    // this said and is the one bug the coach's read of this file found. A task
    // the caller created in SOMEBODY ELSE'S team survives them (decision 1), so
    // emptying its folder would take with them every file their team mates had
    // attached to a task that was staying. `folderPlan` is where the two lists
    // are worked out, and its comment carries the argument.
    //
    // AS THE CALLER. On a task that is going, the storage DELETE policy admits
    // the task's creator for every file on it whoever uploaded it -- the owner's
    // decision of 8 October 2026, which the files panel already relies on when a
    // task is deleted.
    //
    // ONE BATCH PER TASK, and then THE FOLDER IS READ BACK, which is the half
    // that matters: `remove` documents its own answer as `{"data": []}` for a
    // successful delete, so neither the array nor its length is evidence of
    // anything. A delete that answered without an error and removed nothing
    // would otherwise be counted as a success -- and the task would then be
    // refused by tasks_refuse_delete_with_files with nothing to explain it.
    for (const taskId of folders.whole) {
      const cleared = await clearFolder(ctx.supabase, taskId);
      if (!cleared.ok) {
        return fail(
          "Some of your files could not be removed, so nothing was deleted. Please try again.",
          500,
          cleared.code ?? "files_not_cleared",
        );
      }
      filesRemoved += cleared.removed;
    }

    // ---- Step 3: files the caller uploaded to tasks that SURVIVE ---------
    //
    // MANDATORY, not a decision: `storage.objects` has NO foreign key to
    // `auth.users` -- the coach read both projects on 2026-10-12 and found one
    // constraint, to `storage.buckets`. So nothing in the database removes these
    // files and nothing refuses the deletion over them, and left behind they are
    // bytes NOBODY can reach: no live account matches their dangling owner, and
    // the task's-creator branch belongs to somebody else.
    //
    // THE POLICY IS THE FILTER, and that is the design rather than a shortcut.
    // A storage listing does NOT say who uploaded a file -- the installed
    // client's own type marks `owner` as "NOT returned by list() or remove()
    // operations. This field should not be relied upon." So this cannot select
    // the caller's uploads and delete those.
    //
    // SO IT ASKS WHICH FILES ARE THE CALLER'S, AND DOES NOT INFER IT FROM A
    // REFUSAL. That inference is the fault the owner's Dave test of 13 October
    // 2026 found, and it is worth writing out because it was a reasonable
    // mistake: the first version attempted every file one at a time and trusted
    // the DELETE policy to refuse the ones that were not the caller's. That is
    // true on a task somebody ELSE created -- and false on a task the CALLER
    // created, where the policy admits the task's CREATOR for every file. So on
    // Dave's own surviving task nothing was refused, and a file another member
    // had attached to it was deleted with his.
    //
    // `public.my_attachment_names()` is the answer, added by
    // 20261013170000_my_attachment_names.sql: a `security definer` read of the
    // caller's own `storage.objects` rows, taking no arguments. A storage
    // listing cannot answer this -- the installed client marks `owner` as "NOT
    // returned by list() or remove() operations" -- and no client role may read
    // that table at all.
    //
    // AN UNREADABLE ANSWER IS NOT "I UPLOADED NOTHING". If this read fails the
    // whole deletion stops: carrying on would leave files that NOBODY can ever
    // reach, because after step 6 no live account matches their dangling owner
    // and the task's-creator branch belongs to somebody else. The same way round
    // as every other unknown in this app.
    const mine = await ctx.supabase.rpc("my_attachment_names");
    if (mine.error) {
      return fail(
        "Could not work out which files are yours, so nothing was deleted. Please try again.",
        500,
        "uploads_unknown",
      );
    }
    const myNames = readNames(mine.data);
    if (myNames === null) {
      // No error and no list either. Not "none": an unanswered question.
      return fail(
        "Could not work out which files are yours, so nothing was deleted. Please try again.",
        500,
        "uploads_unknown",
      );
    }

    // `folders.mineOnly` IS WIDER THAN `split.elsewhere`: it also holds THE
    // CALLER'S OWN TASKS THAT SURVIVE -- the ones they created in somebody
    // else's team. Those are exactly the tasks the old reasoning got wrong, and
    // they are why this list and the names are intersected rather than either
    // being used alone.
    //
    // The whole folders are skipped here: step 2 has already emptied them, and a
    // name under one of them is gone.
    const surviving = new Set(folders.mineOnly);
    const toRemove = myNames.filter((name) => {
      const taskId = name.slice(0, name.indexOf("/"));
      return surviving.has(taskId);
    });

    for (const path of toRemove) {
      const cleared = await removeNamed(ctx.supabase, path);
      if (!cleared.ok) {
        return fail(
          "Some of your files could not be removed, so nothing was deleted. Please try again.",
          500,
          cleared.code ?? "files_not_cleared",
        );
      }
      filesRemoved += cleared.removed;
    }

    // ---- Step 4a: the caller's own tasks that are not being kept ---------
    //
    // Personal ones, and ones in a team the caller owns. Done explicitly, BEFORE
    // the account goes, so that step 6's `set null` leaves behind only the tasks
    // decision 1 keeps: the ones they created in somebody else's team.
    //
    // As the caller, through "Owners can remove their own tasks".
    //
    // `folders.whole` AND NOT A SECOND CALL TO `tasksToDelete`: it is the same
    // list by construction, and the rows deleted here must be exactly the
    // folders emptied in step 2. Two calls could drift; one cannot.
    const doomed = folders.whole;
    let tasksRemoved = 0;

    if (doomed.length > 0) {
      const { data: gone, error } = await ctx.supabase
        .from("tasks")
        .delete()
        .in("id", doomed as string[])
        .select("id");
      if (error) {
        return fail(
          "Your tasks could not be deleted, so nothing else was. Please try again.",
          500,
          error.code,
        );
      }
      tasksRemoved += Array.isArray(gone) ? gone.length : 0;
    }

    // ---- Step 4b: a former member's task in a team that is about to go ---
    //
    // The owner's addition of 2026-10-12, and it is what makes the orphan in
    // docs/deletion.md section 6.2 reachable only from the dashboard. Those rows
    // are the only ones in a doomed team that would become unreachable: when the
    // team goes, team_id becomes null beside an owner_id that is ALREADY null,
    // and no policy returns them to anybody.
    //
    // IT IS DELIBERATELY NOT EVERY TASK IN THE TEAM -- answer 17 of 2026-10-13,
    // the narrow reading. Other members' tasks return to their creators by
    // `set null` on team_id, which is what "nobody loses a task they wrote
    // themselves" means.
    //
    // Their files went in step 3, through the policy this migration adds for
    // exactly this case.
    if (split.formerInOwnTeams.length > 0) {
      const { data: gone, error } = await ctx.supabase
        .from("tasks")
        .delete()
        .in("id", split.formerInOwnTeams.map((task) => task.id))
        .select("id");
      if (error) {
        return fail(
          "A former member's task could not be deleted, so nothing else was. Please try again.",
          500,
          error.code,
        );
      }
      tasksRemoved += Array.isArray(gone) ? gone.length : 0;
    }

    // ---- Step 5: invitations addressed to the caller's own address -------
    //
    // These do NOT cascade: they are keyed by an ADDRESS, not by a user id. So
    // without this step the app keeps the email address of somebody who has just
    // left -- which is the one thing in the whole operation that would be a
    // retained personal detail rather than an unreachable row.
    //
    // ctx.supabaseAdmin, AND IT IS THE FIRST OF THE TWO. `invitations` has one
    // policy, for the team owner's SELECT, and no delete policy at all
    // (20260930193813_create_invitations.sql: "only the invite-member and
    // accept-invite functions can write here"), so the caller cannot remove a
    // row about their own address. Issue #171 is the standing version of that
    // gap.
    //
    // THE ADDRESS COMES FROM THE VERIFIED TOKEN and from nowhere else, and is
    // lowercased because the column is stored lowercase and carries a
    // constraint saying so.
    const email = ctx.userClaims?.email;
    let invitationsRemoved = 0;

    if (typeof email === "string" && email.trim() !== "") {
      const { data: gone, error } = await ctx.supabaseAdmin
        .from("invitations")
        .delete()
        .eq("email", email.trim().toLowerCase())
        .select("id");
      if (error) {
        return fail(
          "Invitations addressed to you could not be removed, so nothing else was deleted. Please try again.",
          500,
          error.code,
        );
      }
      invitationsRemoved = Array.isArray(gone) ? gone.length : 0;
    }

    // ---- Step 6: the login itself ----------------------------------------
    //
    // ctx.supabaseAdmin, and it is THE SECOND AND LAST use of the secret key in
    // this function. Nothing else can remove an auth.users row: there is no
    // policy that could express it and no SQL the app may run.
    //
    // Everything left goes with it, by the six cascades: their teams, and with
    // each team its invitations and memberships; the invitations they SENT;
    // their profile; their suspension row; their usage counts. And the
    // OWNERSHIP of the tasks that stay becomes null, which is this change's
    // migration and is what "Former member" means.
    //
    // A HARD DELETE. The installed client's own signature is
    // `deleteUser(id: string, shouldSoftDelete?: boolean)` and the second
    // argument "Defaults to false" -- so it is omitted on purpose, because a
    // soft delete "allows user identification from the hashed user ID" and is
    // not what anybody pressing this button asked for.
    const { error: deleteError } = await ctx.supabaseAdmin.auth.admin.deleteUser(
      callerId,
    );
    if (deleteError) {
      // EVERYTHING ABOVE HAS ALREADY HAPPENED, and this is the one failure that
      // leaves something half-done -- so it says so rather than "please try
      // again" alone. A second attempt is safe: every step above finds less to
      // do and reaches this one again.
      return fail(
        "Your tasks and files were removed, but the account itself could not be deleted. Please try again, or ask for it to be deleted by hand.",
        500,
        "login_not_deleted",
      );
    }

    // ---- Step 7 is the SCREEN'S: sign out, and say it is done ------------
    //
    // Counts and nothing else. No title, no team name, no file name, no address:
    // the caller may see these numbers about themselves and there is nothing
    // here anybody else could learn from.
    return Response.json(
      {
        deleted: true,
        removed: {
          files: filesRemoved,
          tasks: tasksRemoved,
          invitations: invitationsRemoved,
        },
        teams: ownedTeamIds.length,
      },
      { status: 200 },
    );
  }),
};

// ---------------------------------------------------------------------------
// The two storage walks
// ---------------------------------------------------------------------------

type Cleared = { ok: boolean; removed: number; code?: string };

/**
 * Every file on one task, removed in one batch, and the folder read back.
 *
 * For a task the caller CREATED, where the policy admits them for every file.
 *
 * `ok` is false when the folder could not be read either before or after, or
 * when anything is left: a folder this function could not read is a folder it
 * must not claim to have emptied, and the trigger would refuse the task
 * afterwards with nothing on screen to explain it.
 */
// deno-lint-ignore no-explicit-any
async function clearFolder(client: any, taskId: string): Promise<Cleared> {
  const before = await client.storage.from(BUCKET).list(taskId, { limit: LIST_LIMIT });
  if (before.error) return { ok: false, removed: 0, code: before.error?.code };

  const names = namesOf(before.data);
  if (names.length === 0) return { ok: true, removed: 0 };

  await client.storage.from(BUCKET).remove(names.map((name) => `${taskId}/${name}`));

  const after = await client.storage.from(BUCKET).list(taskId, { limit: LIST_LIMIT });
  if (after.error) return { ok: false, removed: 0, code: after.error?.code };

  const left = namesOf(after.data);
  return { ok: left.length === 0, removed: names.length - left.length };
}

/**
 * ONE named object, removed, and the folder read back to prove it is gone.
 *
 * REPLACES `clearMine`, WHICH WAS THE FAULT. That one attempted every file on a
 * task and read a refusal as "not mine" -- true on a task somebody else
 * created, false on one the caller created, where the DELETE policy admits the
 * task's creator for every file. So it deleted another member's file from Dave's
 * surviving task, which the owner's Dave test of 13 October 2026 found.
 *
 * This one is handed the path of a file `public.my_attachment_names()` has said
 * is the caller's. So it attempts exactly that, and a FAILURE IS A FAILURE here
 * rather than the ordinary case: these names are the caller's own rows, and the
 * DELETE policy admits the uploader, so a file that will not go is something
 * wrong and not something forbidden.
 *
 * `ok` false when the folder could not be read back, or when the file is still
 * there. A file this function could not confirm gone is a file that must stop
 * the deletion, because after step 6 nobody can ever reach it.
 */
// deno-lint-ignore no-explicit-any
async function removeNamed(client: any, path: string): Promise<Cleared> {
  const slash = path.indexOf("/");
  const taskId = path.slice(0, slash);
  const name = path.slice(slash + 1);

  await client.storage.from(BUCKET).remove([path]);

  const after = await client.storage.from(BUCKET).list(taskId, { limit: LIST_LIMIT });
  if (after.error) return { ok: false, removed: 0, code: after.error?.code };

  const left = namesOf(after.data).includes(name);
  return { ok: !left, removed: left ? 0 : 1 };
}

/**
 * The names `public.my_attachment_names()` answered with, or NULL.
 *
 * NULL IS NOT AN EMPTY LIST, and that distinction is the whole reason this
 * returns one rather than the other: an unanswered question read as "you
 * uploaded nothing" would leave files nobody can ever reach. The caller refuses
 * the whole deletion on a null.
 *
 * The RPC returns `setof text`, which the client gives back as an array of
 * strings. Anything in it that is not a usable `<task id>/<file name>` is
 * dropped -- the SQL already refuses those with
 * `attachments_task_id(name) is not null`, and this is the second lock, because
 * the slice in the caller assumes a slash.
 */
export function readNames(rows: unknown): string[] | null {
  if (!Array.isArray(rows)) return null;

  const out: string[] = [];
  for (const row of rows) {
    // A `setof text` arrives as a bare string. A single-column table would
    // arrive as `{ name }`, so both shapes are read rather than guessed at.
    const name =
      typeof row === "string"
        ? row
        : row !== null && typeof row === "object"
          ? (row as { my_attachment_names?: unknown; name?: unknown })
              .my_attachment_names ??
            (row as { name?: unknown }).name
          : undefined;

    if (typeof name !== "string") continue;
    const slash = name.indexOf("/");
    // Exactly one slash, with something on each side: the same shape
    // public.attachments_task_id() accepts, which is what the SQL filters on.
    if (slash <= 0 || slash === name.length - 1) continue;
    if (name.indexOf("/", slash + 1) !== -1) continue;
    out.push(name);
  }

  return out;
}

/**
 * The file names in a listing, with anything unusable dropped.
 *
 * A row with no usable name, and a row whose `id` is null -- which is
 * Supabase's own marker for a folder rather than a file. Exported so a test can
 * drive the real reading rather than a copy of it.
 */
export function namesOf(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];

  const out: string[] = [];
  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const record = row as { name?: unknown; id?: unknown };
    if (typeof record.name !== "string" || record.name.trim() === "") continue;
    if (record.id === null || record.id === undefined) continue;
    out.push(record.name);
  }
  return out;
}
