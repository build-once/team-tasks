"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

export async function addTask(formData: FormData) {
  const filter = filterFrom(formData);
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
  const { error } = await supabase
    .from("tasks")
    .insert(teamId === null ? { title } : { title, team_id: teamId });

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

  revalidatePath("/tasks");

  // Where the list goes next, and why it is not simply "back where you were":
  // see filterAfterAdd. The design confirms the add with a "Task added."
  // message, so say so as well.
  const destination = teamId === null ? FILTER_PERSONAL : teamId;

  redirect(
    tasksPath({ filter: filterAfterAdd(filter, destination), added: "1" }),
  );
}

export async function setDone(formData: FormData) {
  const filter = filterFrom(formData);
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
  const { error } = await supabase.from("tasks").update({ done }).eq("id", id);

  if (error) {
    // One meaning on a tick, worked out in the note beside REFUSED_CODE: your
    // own task, in a team you are no longer in. The screen says that, and says
    // which single step undoes it -- Move to Personal (issue #91).
    if (error.code === REFUSED_CODE) {
      redirect(tasksPath({ filter, problem: "stranded" }));
    }

    redirect(tasksPath({ filter, problem: "save" }));
  }

  // No redirect on the way out: the form posts to the page the person is already
  // on, so the filter in the address bar is still the filter they chose.
  revalidatePath("/tasks");
}

export async function renameTask(formData: FormData) {
  const filter = filterFrom(formData);
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
