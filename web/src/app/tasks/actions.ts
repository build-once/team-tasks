"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  clearTaskFiles,
  removeOne,
  signedLink,
} from "@/lib/attachment-store";
import { MAX_NAME_CHARS, objectPath, taskIdOf } from "@/lib/attachments";
import { ACT_FIELD, BUTTON_IDS, pressed, type ButtonId } from "@/lib/buttons";
import { createClient } from "@/lib/supabase/server";
import {
  FILTER_PERSONAL,
  REFUSED_CODE,
  TASK_HAS_FILES_CODE,
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

  // ---- THE FILES GO FIRST (Build it 23, issue #242) ---------------------
  //
  // The owner's decision of 8 October 2026: "leftover files are not
  // acceptable". Deleting a task deletes its files first and is refused if
  // they cannot be removed -- and the database refuses to delete a task that
  // still has files whatever asked it to, which is the half that makes it a
  // property of the system rather than of this function being correct.
  //
  // IT RUNS AS THE PERSON ASKING, with no more authority than they have
  // sitting at the screen. The DELETE policy on storage.objects lets a task's
  // creator remove every file on their own task -- that is what the owner's
  // answer to #234 bought -- so nothing here needs a privileged delete path,
  // and docs/architecture.md calls that the quiet virtue of the decision.
  //
  // THE ORDER IS NOT A PREFERENCE. The creator's right to delete these files
  // comes FROM the task: delete the task first and the right vanishes with it,
  // along with any row that could say who created it. So files-then-task is the
  // only order in which the permission exists.
  //
  // BUT NOT BEFORE ASKING WHOSE TASK IT IS, and that read is here because of a
  // wrong SENTENCE rather than a wrong rule.
  //
  // Clearing first for everybody would be safe -- the same storage policy that
  // admits a creator's delete refuses a team mate's, so somebody who may not
  // delete the task cannot clear its files either and `cleared` comes back
  // false. It is safe and it says the wrong thing: a team mate would be told
  // "its files could not be removed first", which is true and conceals the
  // actual reason, which is that the task was never theirs to delete. This page
  // draws no Delete on somebody else's task, so it takes a hand-made request to
  // get here -- and a hand-made request still deserves the truthful answer.
  //
  // So: the row is read first, as the caller. No row means the task is gone or
  // was never visible, and a row belonging to somebody else means exactly what
  // the "nothing deleted" sentence below already says. Both take that path and
  // nothing touches storage, which also saves a delete that could not succeed
  // from making three requests first.
  const { data: owned, error: readError } = await supabase
    .from("tasks")
    .select("id, owner_id")
    .eq("id", id);

  if (readError) redirect(tasksPath({ filter, problem: "save" }));

  const row = owned?.[0] as { owner_id?: unknown } | undefined;
  const { data: claimsData } = await supabase.auth.getClaims();
  const me = claimsData?.claims?.sub;

  // An unreadable claim is not a match. The same direction as everything else
  // in this app: an unknown is not a yes.
  if (!row || typeof me !== "string" || row.owner_id !== me) {
    redirect(tasksPath({ filter, problem: "delete" }));
  }

  // A task with no files answers `cleared: true` with nothing removed, and the
  // delete below then proceeds exactly as it always has.
  const files = await clearTaskFiles(supabase, id);

  if (!files.cleared) {
    // Not "try again later" and not "you cannot do that": the task is still
    // here, with its files on it, which is a state the person can see and act
    // on. web/src/lib/attachments.ts holds the sentence.
    redirect(tasksPath({ filter, problem: "filesleft" }));
  }

  // Same as rename. From the reference for delete: "By default, deleted rows
  // are not returned. To return it, chain the call with .select() after
  // filters." https://supabase.com/docs/reference/javascript/delete
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    // THE TRIGGER, and since Build it 23 this branch is the one that can
    // actually fire. tasks_refuse_delete_with_files() raises 23503 --
    // foreign_key_violation, chosen because it reads as "something still points
    // at this row", which is exactly what is true -- whenever an object remains
    // under attachments/<task id>/.
    //
    // Reaching it means the clear above said it had emptied the folder and the
    // database disagrees: a file arrived in between, or a list answered with
    // something that was not the whole truth. Either way the task is still
    // here with files on it, which is the same news as a clear that failed, so
    // it gets the same sentence.
    //
    // The CODE is read and the message is not. The trigger's own sentence is
    // written in the migration and is perfectly readable -- and it is still a
    // message from the database, which web/src/lib/teams.ts's long note is
    // about: a sentence this app did not write, appearing in this app's
    // styling.
    if (error.code === TASK_HAS_FILES_CODE) {
      redirect(tasksPath({ filter, problem: "filesleft" }));
    }

    // Kept as a belt-and-braces branch, and it is not expected to fire: a
    // delete this person may not do matches no row rather than failing -- the
    // "nothing deleted" case below -- and the column trigger is `before insert
    // or update`, so it is not fired on a delete at all. If a 42501 ever does
    // arrive, "you cannot do that" is still the truthful reading of it.
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

  // AND IT SAYS WHAT WENT WITH IT, when anything did. A task that quietly took
  // three photographs with it is a task that took three photographs with it
  // whether or not anybody was told, and the person who pressed Delete on the
  // task may not be the person who attached them. `files.removed` is counted
  // from a read-back of the folder rather than from what the deletes said, so
  // the number is what actually went.
  redirect(
    files.removed > 0
      ? tasksPath({ filter, deleted: String(files.removed) })
      : tasksPath({ filter }),
  );
}

// ---------------------------------------------------------------------------
// Files on a task (Build it 23, issue #242)
// ---------------------------------------------------------------------------
//
// Two actions, and NEITHER OF THEM UPLOADS: the bytes go from the browser
// straight to Storage, as the signed-in person, in
// web/src/app/tasks/AttachFile.tsx. web/src/lib/attachment-store.ts's header
// says why, and issue #240 is the argument.
//
// WHAT BOTH OF THEM HAVE IN COMMON, and it is the thing to check when reading
// them: they ask Storage as the person who pressed the button, through the
// client this request's cookies built, and they contain no decision about who
// may do what. The three policies on storage.objects decide. A file this person
// may not see produces no link; a file they may not delete removes nothing.
//
// AND NEITHER EVER PUTS A FILE'S NAME IN A REDIRECT. The name arrives in a form
// field and stays in this function: what goes back into the address bar is one
// of the fixed words in web/src/lib/attachments.ts. docs/plan.md puts a file
// name on the list of things that must never reach error reporting, and a name
// in a URL is a name in `event.request.url`.

// The one thing a file name may not contain, and the only shape check worth
// making here: a `/` would add a path segment, and the FIRST segment of an
// object's path is the whole of how every rule in the migration decides which
// task a file belongs to. So a name with a separator in it could name a file on
// another task.
//
// DELIBERATELY NOT `storedName`'s FULL ALPHABET. This app sanitises a name
// before it uploads one, so every file it stored matches that narrower shape --
// but a file put into the bucket by the operator, in the dashboard, need not,
// and a name check that refused those would leave files this app could display
// and not delete. The requirement is that a name cannot reach another task, and
// this is that requirement and nothing more.
function fileNameFrom(formData: FormData): string | null {
  const name = String(formData.get("name") ?? "").trim();

  if (name === "") return null;
  if (name.includes("/")) return null;
  // Longer than anything this app would ever have stored: the stem is capped at
  // MAX_NAME_CHARS and an extension is four characters at the outside.
  if (name.length > MAX_NAME_CHARS + 16) return null;
  return name;
}

/**
 * Open one file, through a link that lasts five minutes.
 *
 * THE LINK IS MADE NOW AND NOT WHEN THE PAGE WAS DRAWN, which is the reason
 * this is an action at all rather than a link on the row. A signed URL put into
 * the page's HTML would already be part-way through its five minutes by the
 * time anybody looked at the screen, and all the way through it for anybody who
 * left the tab open -- so somebody would press a working-looking link and be
 * handed nothing.
 *
 * AND THE CHECK HAPPENS WHEN THE LINK IS MADE. Creating one is a read of the
 * object, so the SELECT policy decides: a person who may not see the task gets
 * no link, from the database rather than from this screen. What follows from
 * that is the design's one sharp edge and is not something this function can
 * soften -- for those five minutes whoever holds the link can open the file,
 * signed in or not, and nothing calls it back. docs/plan.md's "Links, and what
 * an unexpired one allows" is where that is written up, and the panel on screen
 * says it in a sentence before anybody presses this.
 *
 * IT REDIRECTS IN THE SAME TAB, on purpose. A form cannot reliably open a new
 * one -- a server action is submitted by React rather than by the browser, so
 * `target` applies only when there is no JavaScript, and a control that behaves
 * differently in the two cases is worse than one that behaves plainly in both.
 * The cost is that the link lands in this browser's history, which docs/plan.md
 * already names as a cost of the design: "a link sitting in a browser's history
 * or a phone's share sheet is live for the rest of its five minutes."
 *
 * AND REDIRECTING TO AN ADDRESS OUTSIDE THIS APP IS SOMETHING `redirect` DOES,
 * which is worth a citation rather than an assumption because the whole control
 * rests on it: "`redirect` also accepts absolute URLs and can be used to
 * redirect to external links"
 * (web/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md,
 * the version-matched docs for the installed Next). The same page says what
 * happens either way in an action: "it will perform a client-side navigation
 * when JavaScript is available or serve a 303 for a progressive enhancement
 * form submission" -- so Open works with no JavaScript, like every other control
 * on this page and unlike the upload box.
 */
export async function openFile(formData: FormData) {
  const filter = filterFrom(formData);

  if (wrongButton(formData, [BUTTON_IDS.fileOpen])) {
    redirect(tasksPath({ filter, problem: "button" }));
  }

  const taskId = String(formData.get("id") ?? "");
  const name = fileNameFrom(formData);

  if (!taskId || name === null) {
    redirect(tasksPath({ filter, file: "linkfailed" }));
  }

  const path = objectPath(taskId, name);

  // The same question public.attachments_task_id() answers, asked here so a
  // path this app would not have built is not sent anywhere. It is NOT how
  // access is decided -- the SELECT policy is -- and a path that passes this
  // and names somebody else's task still gets no link.
  if (taskIdOf(path) === null) {
    redirect(tasksPath({ filter, file: "linkfailed" }));
  }

  const supabase = await createClient();
  const url = await signedLink(supabase, path);

  if (url === null) {
    // One sentence for "you may not see it", "it is not there" and "the request
    // did not arrive", because this code cannot tell them apart: a SELECT
    // policy leaves a row out rather than complaining, so a file somebody may
    // not read and a file that is gone produce the same answer.
    redirect(tasksPath({ filter, files: taskId, file: "linkfailed" }));
  }

  redirect(url);
}

/**
 * Delete one file.
 *
 * WHO MAY: whoever attached it, or whoever created the task it is on, and
 * nobody else -- the owner's decision of 8 October 2026, settled in the DELETE
 * policy on storage.objects and not here. A team mate who is neither can see
 * the file and open it, and this action removes nothing for them.
 *
 * SO THIS FUNCTION ASKS AND REPORTS, and the four answers it can get each have
 * their own sentence:
 *
 *   refused      Storage said no outright.
 *   nothing      the file was not in the folder when the delete was asked for.
 *   stillthere   it was, and it still is -- no policy matched, or the folder
 *                could not be read back.
 *   removed      it was there and it is not now.
 *
 * DECIDED BY LISTING THE FOLDER BEFORE AND AFTER, and not by reading the
 * delete's own answer, which cannot tell "deleted" from "matched nothing": this
 * endpoint says `{"message":"Successfully deleted"}` either way, and the JS
 * client's `remove` documents its own answer as `{"data": []}` on success.
 * `removeOne` in web/src/lib/attachment-store.ts has the citations and the
 * argument. Build it 19's rule, applied to a file: a message is a claim about
 * what the store HOLDS, not about what a call returned.
 */
export async function deleteFile(formData: FormData) {
  const filter = filterFrom(formData);

  if (wrongButton(formData, [BUTTON_IDS.fileDelete])) {
    redirect(tasksPath({ filter, problem: "button" }));
  }

  const taskId = String(formData.get("id") ?? "");
  const name = fileNameFrom(formData);

  if (!taskId || name === null) {
    redirect(tasksPath({ filter, file: "failed" }));
  }

  const path = objectPath(taskId, name);
  if (taskIdOf(path) === null) {
    redirect(tasksPath({ filter, file: "failed" }));
  }

  const supabase = await createClient();
  const result = await removeOne(supabase, path);

  if (result.state === "refused") {
    // A refusal, not a breakage, so not "please try again". One sentence for
    // all three reasons it can be -- not your file, not your task, or a
    // suspended account -- because the answer cannot tell them apart, which is
    // the same choice INVITE_SENTENCES.conflict makes about three refusals
    // sharing one status.
    redirect(tasksPath({ filter, files: taskId, file: "notallowed" }));
  }

  if (result.state === "nothing") {
    redirect(tasksPath({ filter, files: taskId, file: "gone" }));
  }

  if (result.state === "stillthere") {
    // Three ways here, and they are all the same news: the delete matched no
    // row because no policy admitted it, Storage answered without complaining
    // and the file is still in the folder, or this app could not read the
    // folder back and will not claim a deletion it has not seen. "It is still
    // on the task" is true of every one of them, and "File deleted." over a
    // file still on the screen underneath is the one outcome a person cannot
    // act on.
    redirect(tasksPath({ filter, files: taskId, file: "stillthere" }));
  }

  revalidatePath("/tasks");
  redirect(tasksPath({ filter, files: taskId, file: "deleted" }));
}
