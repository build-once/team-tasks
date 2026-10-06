"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ACT_FIELD, BUTTON_IDS, pressed, type ButtonId } from "@/lib/buttons";
import { createClient } from "@/lib/supabase/server";
import {
  FILTER_PERSONAL,
  REFUSED_CODE,
  TITLE_MAX,
  filterAfterAdd,
  isTeamId,
  readFilter,
  tasksPath,
} from "@/lib/tasks";

// The list the person was looking at when they pressed the button, read back
// from a hidden field so every redirect below returns them to it instead of to
// "all tasks". readFilter drops anything it does not recognise, so what comes
// out is never more than "personal" or a team id in uuid shape.
function filterFrom(formData: FormData) {
  return readFilter(formData.get("filter"));
}

// WHICH BUTTON WAS PRESSED, BY IDENTIFIER (Build it 19 rule 6).
//
// Every action here begins with this, and a post that does not carry the
// identifier that action answers to changes nothing and says so. The identifier is
// a fixed string from web/src/lib/buttons.ts; the label beside it on screen is
// prose, and nothing reads it.
//
// Said once in a helper rather than five times, because five copies of a check is
// four chances for one of them to be the wrong identifier.
function wrongButton(formData: FormData, allowed: readonly ButtonId[]): boolean {
  return !pressed(formData.get(ACT_FIELD), allowed);
}

export async function addTask(formData: FormData) {
  const filter = filterFrom(formData);

  if (wrongButton(formData, [BUTTON_IDS.taskAdd])) {
    redirect(tasksPath({ filter, problem: "button" }));
  }

  const title = String(formData.get("title") ?? "").trim();

  // An empty team_id is Personal. Two ways it arrives empty, and both mean the
  // same thing: the chooser's first option has an empty value, and a page that
  // drew no chooser at all -- nobody with a team to choose from -- sends no
  // team_id field whatsoever.
  const chosen = String(formData.get("team_id") ?? "").trim();

  if (chosen !== "" && !isTeamId(chosen)) {
    // Not reachable from the screen: the chooser only offers ids the page read
    // back from the database. A request put together by hand can reach it, and
    // without this check Postgres would refuse the text as malformed and the
    // person would be told their task "did not save".
    redirect(tasksPath({ filter, problem: "team" }));
  }

  const teamId = chosen === "" ? null : chosen.toLowerCase();

  if (!title || title.length > TITLE_MAX) {
    redirect(tasksPath({ filter, problem: "title" }));
  }

  const supabase = await createClient();

  // owner_id is left out on purpose. The database fills it in from the signed-in
  // person (its default is auth.uid()), so a request cannot claim to be someone
  // else, however it is put together.
  //
  // team_id is sent only when a team was chosen, so a personal task is inserted
  // exactly as it was before this feature existed and simply takes the column's
  // null. Which teams are allowed is not this code's decision either: the insert
  // policy and tasks_enforce_column_rules() both refuse a team its creator does
  // not belong to.
  //
  // .select() IS THE READ-BACK (Build it 19 rule 3). "Task added." used to be said
  // because the insert returned no error, which is not the same claim: an insert
  // with no error and no row back is possible -- the insert policy's with check can
  // let a statement run and `returning` give nothing through the select policy --
  // and the person would have been told a task existed that was not on the list
  // below the banner. Rename, move and delete have read back since they were
  // written; add and tick were the two that did not.
  //
  // THREE COLUMNS, BECAUSE THREE THINGS ARE CLAIMED: that the row exists, that its
  // text is the text that was typed, and that it went into the list the banner is
  // about to name. From the reference for insert: "By default, inserted rows are
  // not returned. To return it, chain the call with .select()."
  // https://supabase.com/docs/reference/javascript/insert
  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert(teamId === null ? { title } : { title, team_id: teamId })
    .select("id, title, team_id");

  if (error) {
    // 42501 is "you may not", and on an insert it has one meaning: a task can
    // only be added to a team its creator belongs to. Somebody using the screen
    // cannot provoke it, because the chooser only offers teams the database let
    // the page read -- but a hand-made request can, and "that did not save"
    // would describe a refusal as a breakage.
    //
    // This is now the only place that sends problem=refused from an update or
    // an insert on purpose. A tick or a rename sends problem=stranded, and a
    // move sends problem=move, because each of those pins a different sentence.
    if (error.code === REFUSED_CODE) {
      redirect(tasksPath({ filter, problem: "refused" }));
    }

    redirect(tasksPath({ filter, problem: "save" }));
  }

  // Nothing came back. No error, and no row -- so there is nothing this code has
  // seen, and "Task added." would be a guess. The same sentence as a failed save,
  // because from the person's side it is the same news: try it again.
  const row = inserted?.[0] as
    | { title?: unknown; team_id?: unknown }
    | undefined;

  if (!row) {
    redirect(tasksPath({ filter, problem: "save" }));
  }

  // And what came back is what was asked for. A title the database rewrote, or a
  // row that landed in a different list from the one this code is about to send the
  // person to, are both "it saved, but not what you asked for" -- which must not be
  // reported as a plain success.
  const storedTeamId = row.team_id === null ? null : row.team_id;

  if (row.title !== title || storedTeamId !== teamId) {
    redirect(tasksPath({ filter, problem: "save" }));
  }

  revalidatePath("/tasks");

  // Where the list goes next, and why it is not simply "back where you were":
  // see filterAfterAdd. The design confirms the add with a "Task added."
  // message, so say so as well -- and by this point the row has been read back,
  // so the message is a report rather than a hope.
  const destination = teamId === null ? FILTER_PERSONAL : teamId;

  redirect(
    tasksPath({ filter: filterAfterAdd(filter, destination), added: "1" }),
  );
}

export async function setDone(formData: FormData) {
  const filter = filterFrom(formData);

  if (wrongButton(formData, [BUTTON_IDS.taskDone])) {
    redirect(tasksPath({ filter, problem: "button" }));
  }

  const id = String(formData.get("id") ?? "");
  const done = String(formData.get("done") ?? "") === "true";

  if (!id) redirect(tasksPath({ filter, problem: "save" }));

  const supabase = await createClient();

  // There is no "and owner_id is me" here on purpose, and since
  // 20261002133637_tasks_join_teams.sql that matters more than it used to: the
  // update rule is now the creator OR any member of the task's team, which is
  // what feature 4 asks for -- a team mate may tick a task off. A guessed id for
  // a task in a team you are not in still changes nothing, because the rule, not
  // this screen, decides. That is what the Alice / Bob / Carol checks in
  // docs/environments.md prove on staging.
  //
  // .select("id, done") IS THE READ-BACK, AND THE TICK IS THE SUCCESS MESSAGE
  // (Build it 19 rule 3). This is the subtlest of the five actions, so it is worth
  // being exact about what was and was not already true.
  //
  // WHAT WAS ALREADY TRUE: the tick drawn on the next screen comes from a fresh
  // read of the row, because this action returns to the page and the page queries
  // tasks again. So the box was never drawn from what this code hoped.
  //
  // WHAT WAS NOT: an update matching NO ROW is not an error. The row-level rules
  // leave a row out rather than refusing it, so a tick on a task somebody else has
  // just deleted returned cleanly, this action said nothing, and the person was
  // handed a list with the box exactly as it was -- which reads as a tick that did
  // not register, with no explanation anywhere. Reading the rows back is what turns
  // that into a sentence.
  const { data: updated, error } = await supabase
    .from("tasks")
    .update({ done })
    .eq("id", id)
    .select("id, done");

  if (error) {
    // One meaning on a tick, worked out in the note beside REFUSED_CODE: your
    // own task, in a team you are no longer in. The screen says that, and says
    // which single step undoes it -- Move to Personal (issue #91).
    if (error.code === REFUSED_CODE) {
      redirect(tasksPath({ filter, problem: "stranded" }));
    }

    redirect(tasksPath({ filter, problem: "save" }));
  }

  // Nothing matched. Not a refusal -- a refusal arrives as the 42501 above -- so
  // the row was not there to change: the task has been deleted, or it was never one
  // this person could see. The same two causes as a delete that matched no row, and
  // the message names the action the person actually took.
  if (!updated || updated.length === 0) {
    redirect(tasksPath({ filter, problem: "tickgone" }));
  }

  // And the row says what was asked for. A row that came back still holding the old
  // value means something overruled the write, and the box on the next screen would
  // be drawn from the stored value while the person had just pressed the other one.
  if ((updated[0] as { done?: unknown }).done !== done) {
    redirect(tasksPath({ filter, problem: "save" }));
  }

  // No redirect on the way out: the form posts to the page the person is already
  // on, so the filter in the address bar is still the filter they chose. The box
  // they see is read from the database by the page, and this action has just
  // confirmed the database agrees with the press.
  revalidatePath("/tasks");
}

export async function renameTask(formData: FormData) {
  const filter = filterFrom(formData);

  if (wrongButton(formData, [BUTTON_IDS.taskRename])) {
    redirect(tasksPath({ filter, problem: "button" }));
  }

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();

  if (!id) redirect(tasksPath({ filter, problem: "save" }));

  // Keep the row in its editing state so the person does not lose what they
  // were typing into a list that has closed itself.
  if (!title || title.length > TITLE_MAX) {
    redirect(tasksPath({ filter, problem: "title", rename: id }));
  }

  const supabase = await createClient();

  // .select() is what makes the changed rows come back. From the reference for
  // update: "By default, updated rows are not returned. To return it, chain the
  // call with .select() after filters."
  // https://supabase.com/docs/reference/javascript/update
  //
  // That is how this tells "renamed" from "changed nothing". A row this person
  // may not change is not an error: the row-level security rules simply leave it
  // out, so the update matches nothing and data comes back empty. Renaming is
  // allowed for every member of a task's team, so by this point that means the
  // task is gone or was never visible -- which is what the message says.
  const { data, error } = await supabase
    .from("tasks")
    .update({ title })
    .eq("id", id)
    .select("id");

  if (error) {
    // Same single meaning as on a tick, and the same way out: a rename refused
    // because the task sits in a team its creator has left (issue #91).
    //
    // The row is NOT left open for editing, unlike the too-long title above.
    // There is nothing to try again: typing a different name changes nothing
    // until the task is moved. Closing the row puts the Move to... control the
    // banner names back in front of the person.
    if (error.code === REFUSED_CODE) {
      redirect(tasksPath({ filter, problem: "stranded" }));
    }

    redirect(tasksPath({ filter, problem: "save" }));
  }

  if (!data || data.length === 0) {
    redirect(tasksPath({ filter, problem: "missing" }));
  }

  revalidatePath("/tasks");
  redirect(tasksPath({ filter }));
}

// Move a task to Personal, or into a team its creator belongs to. The capability
// docs/plan.md's appendix has always promised -- "by its creator moving it back
// to personal" -- and the way out of a stranded task (issues #88 and #91).
//
// NO MIGRATION CAME WITH THIS. The rules were already written and already proved
// on staging: the update policy's with check allows a row to end up
// personal-and-yours or in a team you belong to, and
// tasks_enforce_column_rules() refuses a team_id change by anybody but the
// task's creator, and only to null or to a team that creator belongs to
// (20261002133637_tasks_join_teams.sql). This action adds the control, not the
// permission.
export async function moveTask(formData: FormData) {
  const filter = filterFrom(formData);

  if (wrongButton(formData, [BUTTON_IDS.taskMove])) {
    redirect(tasksPath({ filter, problem: "button" }));
  }

  const id = String(formData.get("id") ?? "");

  // Empty is Personal, exactly as on the add form: the chooser's first option
  // has an empty value, so "no team" is sent as no team rather than as a word
  // this code would have to agree with the screen about.
  const chosen = String(formData.get("team_id") ?? "").trim();

  if (!id) redirect(tasksPath({ filter, problem: "save" }));

  if (chosen !== "" && !isTeamId(chosen)) {
    // Not reachable from the screen, same as on the add form: the chooser only
    // offers Personal and ids the page read back from the database.
    redirect(tasksPath({ filter, problem: "team" }));
  }

  const teamId = chosen === "" ? null : chosen.toLowerCase();

  const supabase = await createClient();

  // Only team_id is sent. owner_id, id and created_at are not mentioned, which
  // is what the trigger would refuse anyway, and title and done are left exactly
  // as they are: moving a task between lists is not an edit of the task.
  //
  // .select() so the changed rows come back, for the same reason as rename and
  // delete: it is what tells "moved" from "changed nothing".
  const { data, error } = await supabase
    .from("tasks")
    .update({ team_id: teamId })
    .eq("id", id)
    .select("id");

  if (error) {
    // 42501 on a move has one meaning, and it is a refusal rather than a
    // breakage: either the trigger refused -- somebody who did not create this
    // task tried to move it, or its creator aimed it at a team they do not
    // belong to -- or the update policy's with check refused the finished row
    // for the same reasons. The screen offers this control only on your own
    // tasks and only to lists you are in, so a request reaching here was made
    // by hand. It gets a plain sentence, not "please try again" and not the
    // database's own words.
    if (error.code === REFUSED_CODE) {
      redirect(tasksPath({ filter, problem: "move" }));
    }

    redirect(tasksPath({ filter, problem: "save" }));
  }

  // Nothing matched. Not a refusal -- a refusal arrives as the 42501 above --
  // so the row was not there to change: the task has been deleted, or it was
  // never one this person could see. Deliberately NOT the "wasn't found, so
  // nothing was renamed" message, which names the wrong action.
  if (!data || data.length === 0) {
    redirect(tasksPath({ filter, problem: "movegone" }));
  }

  revalidatePath("/tasks");

  // The filter is carried, unchanged, like every other action on a row: the
  // person stays in the list they were working in. But a task that has just left
  // that list is a task that has just vanished off the screen, so where it went
  // is said out loud -- the page turns this value into the destination's name.
  redirect(tasksPath({ filter, moved: teamId ?? FILTER_PERSONAL }));
}

export async function deleteTask(formData: FormData) {
  const filter = filterFrom(formData);

  if (wrongButton(formData, [BUTTON_IDS.taskDelete])) {
    redirect(tasksPath({ filter, problem: "button" }));
  }

  const id = String(formData.get("id") ?? "");

  if (!id) redirect(tasksPath({ filter, problem: "save" }));

  const supabase = await createClient();

  // Same as rename. From the reference for delete: "By default, deleted rows
  // are not returned. To return it, chain the call with .select() after
  // filters." https://supabase.com/docs/reference/javascript/delete
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    // Kept as a belt-and-braces branch, and it is not expected to fire: a
    // delete this person may not do matches no row rather than failing -- the
    // "nothing deleted" case below -- and the trigger is not fired on delete at
    // all. If it ever does fire, "you cannot do that" is still the truthful
    // reading of a 42501.
    if (error.code === REFUSED_CODE) {
      redirect(tasksPath({ filter, problem: "refused" }));
    }

    redirect(tasksPath({ filter, problem: "save" }));
  }

  // Nothing deleted. Two reasons, and this code cannot tell them apart: only a
  // task's creator may delete it -- the delete policy is still owner-only, which
  // is the rule this feature wants -- so a team mate's task matches no row, and
  // neither does a task that has already gone.
  //
  // It used to say "that task no longer exists", which was true for one of those
  // two and false for the other (issue #83). The page no longer draws a delete
  // control on somebody else's task at all, so reaching this is unusual; the
  // wording names the likely reason first and does not claim to know.
  if (!data || data.length === 0) {
    redirect(tasksPath({ filter, problem: "delete" }));
  }

  revalidatePath("/tasks");
  redirect(tasksPath({ filter }));
}
