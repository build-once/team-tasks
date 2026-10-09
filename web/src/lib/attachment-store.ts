// attachment-store.ts -- the four things this app asks Supabase Storage to do,
// each one as the signed-in person and never with anything more.
//
// Build it 23 part 2, issue #242. web/src/lib/attachments.ts is the half of this
// feature that is pure -- the numbers, the types and the sentences; this is the
// half that makes requests.
//
// ---------------------------------------------------------------------------
// WHOSE RIGHTS EVERY REQUEST HERE CARRIES, which is the whole design
// ---------------------------------------------------------------------------
//
// The caller's. Every function takes the client the page or the action already
// has -- the one web/src/lib/supabase/server.ts builds from THIS REQUEST'S
// cookies -- so each request arrives at Supabase carrying that person's own
// session and the publishable key, and the three policies on storage.objects
// decide what happens.
//
// THERE IS NO SERVICE-ROLE KEY IN THIS FILE, AND THERE IS NONE IN web/src AT
// ALL. That is issue #240's decision made real rather than described: "Service
// keys entirely bypass RLS policies, granting unrestricted access"
// (https://supabase.com/docs/guides/storage/security/access-control), so a key
// anywhere near this file would mean no policy was evaluated, the two counted
// limits in public.attachments_may_add() were never called, and the stored row
// had no owner -- which would leave the file outside everybody's 100 MB and
// deletable by nobody but the task's creator.
//
// UPLOADING IS NOT HERE, and that is the same decision from the other end. The
// bytes go from the browser straight to Storage, as the person, in
// web/src/app/tasks/AttachFile.tsx. They do not pass through this app's server:
// a 5 MB file posted to a server action would have to be carried by our own
// code, for no gain -- the limits are enforced in the database either way, and
// Next.js's own body limit for a server action is smaller than the file we have
// promised to accept.
//
// ---------------------------------------------------------------------------
// WHAT A FAILURE IS ALLOWED TO BECOME
// ---------------------------------------------------------------------------
//
// A status and a code, and nothing else. The installed client's own type says
// what those are: StorageApiError carries `status`, `statusCode` and `code`,
// and `code` is documented in web/node_modules/@supabase/storage-js/dist/
// index.d.mts as "Service-specific error code from the Storage API response
// body, such as `NoSuchKey`, `AccessDenied` or `ResourceAlreadyExists`. Use
// this to branch on the specific error rather than parsing the message."
//
// So that is what is read, and `message` is never read at all. docs/plan.md asks
// for plain words and NEVER the storage service's own text, and the long note
// beside TEAM_ACTION_OUTCOMES in web/src/lib/teams.ts is the same argument about
// an Edge Function's message: a sentence somebody else wrote, appearing in this
// app's styling, which nobody here has read.
//
// THE FIELDS ARE READ OFF A SHAPE RATHER THAN THROUGH `instanceof`. The class is
// exported from @supabase/supabase-js and an `instanceof` check against it would
// be true only while there is exactly one copy of that module in the bundle,
// which is a property of somebody's build and not of this code.
//
// ---------------------------------------------------------------------------
// AND NOTHING HERE EVER PUTS A FILE'S NAME IN AN ERROR
// ---------------------------------------------------------------------------
//
// docs/plan.md: "a storage error is reported with its code and the operation,
// never with the path or the name", because a file name is free text somebody's
// phone chose or somebody typed -- `scan-of-the-letter-from-my-doctor.pdf` is a
// sentence about a person. Nothing in this file throws, logs or reports; every
// function returns a small record of what happened, and the only strings in
// those records are ones web/src/lib/attachments.ts wrote.
//
// web/src/lib/sentry-scrub.ts has a rule for a stored object's path as well, as
// the net under this. Both exist on purpose: the rule catches a path that
// reaches an error from somewhere this app did not write, and this file is why
// one should not.

import type { createClient } from "@/lib/supabase/server";

import {
  BUCKET,
  LINK_SECONDS,
  MAX_FILES_PER_TASK,
  readFileList,
  type StoredFile,
} from "@/lib/attachments";

// The client a page or an action already built for this request. Taken as a
// parameter rather than made here, so there is exactly one session in play and
// this module cannot accidentally build one with different rights.
//
// `import type` means next/headers never enters this module's runtime graph --
// the type is erased -- so nothing here is bound to a request except through
// what it is handed.
type Client = Awaited<ReturnType<typeof createClient>>;

/** What a storage failure is reduced to before anything else sees it. */
export type StorageFailure = {
  status: number | null;
  code: string | null;
};

/**
 * The two plumbing fields off whatever the client threw or returned.
 *
 * Null for both when the error carries neither, which is the shape of a network
 * fault: nothing arrived, so there is no status and no code, and the caller's
 * sentence for that is "something went wrong" rather than any refusal.
 */
export function readFailure(error: unknown): StorageFailure {
  const record = error as { status?: unknown; code?: unknown; statusCode?: unknown } | null;
  if (record === null || typeof record !== "object") return { status: null, code: null };

  // `status` is the HTTP status as a number; `statusCode` is the same thing as a
  // string in some answers, so it is the fallback rather than a second fact.
  const status =
    typeof record.status === "number" && Number.isFinite(record.status)
      ? record.status
      : typeof record.statusCode === "string" && /^[0-9]{3}$/.test(record.statusCode)
        ? Number(record.statusCode)
        : null;

  return {
    status,
    code: typeof record.code === "string" && record.code !== "" ? record.code : null,
  };
}

/**
 * The files on each of these tasks.
 *
 * ONE LIST PER TASK, because a listing is by prefix and a task's prefix is its
 * id: there is no one request that answers "the files on these twelve tasks".
 * They go in parallel, so the page waits for the slowest rather than for the
 * sum -- and the cost is named rather than hidden: issue #244 holds it, with the
 * three cheaper shapes and what each of them costs instead.
 *
 * `failed` IS SEPARATE FROM AN EMPTY MAP, and it is the whole reason this
 * returns a record instead of a map. `data ?? []` turns a failed read into "no
 * files", which on a screen is this app telling somebody their attachment is
 * gone -- the exact trap web/src/lib/screen-state.ts exists for. One list
 * failing is enough to set it: a page that said "no files" for eleven tasks and
 * nothing at all about the twelfth would be worse than one that says it could
 * not read them.
 *
 * The limit asked for is the per-task maximum plus one. More than three files
 * on a task is not something the rules permit, so asking for four is asking for
 * "the three, and evidence if there are somehow more".
 */
export async function filesForTasks(
  supabase: Client,
  taskIds: readonly string[],
): Promise<{ byTask: Map<string, StoredFile[]>; failed: boolean }> {
  const byTask = new Map<string, StoredFile[]>();
  if (taskIds.length === 0) return { byTask, failed: false };

  const answers = await Promise.all(
    taskIds.map(async (taskId) => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(taskId, { limit: MAX_FILES_PER_TASK + 1 });
      return { taskId, data, error };
    }),
  );

  let failed = false;

  for (const answer of answers) {
    if (answer.error) {
      failed = true;
      continue;
    }
    byTask.set(answer.taskId, readFileList(answer.data));
  }

  return { byTask, failed };
}

/**
 * A link to one file, good for five minutes, or null.
 *
 * THE CHECK HAPPENS HERE AND NEVER AGAIN, which is the design's one sharp edge
 * and is not something this function can soften: creating the link is a read of
 * the object, so the SELECT policy decides whether there is a link at all -- and
 * once there is one, whoever holds it can open the file until it expires,
 * signed in or not. docs/plan.md's "Links, and what an unexpired one allows" is
 * where that is written up.
 *
 * It is asked for AT THE MOMENT SOMEBODY PRESSES OPEN, not when the page is
 * drawn. A link made during a render would already be part-way through its five
 * minutes by the time anybody looked at it, and all the way through it if they
 * left the tab open -- so the person would press a working-looking link and get
 * nothing.
 */
export async function signedLink(supabase: Client, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, LINK_SECONDS);

  if (error) return null;

  const url = data?.signedUrl;
  return typeof url === "string" && url !== "" ? url : null;
}

/** What happened to one delete. */
export type RemoveResult =
  /** It was there before and it is not there now. */
  | { state: "removed" }
  /** It was not there to begin with. */
  | { state: "nothing" }
  /** Storage refused, with whatever plumbing it gave. */
  | { state: "refused"; failure: StorageFailure }
  /** It was there before, the delete did not complain, and it is still there. */
  | { state: "stillthere" };

/**
 * Delete one file.
 *
 * THROUGH THE STORAGE API, never with SQL, and that is not a preference.
 * "Deleting objects via a SQL query will not remove the object from the bucket
 * and will result in the object being orphaned"
 * (https://supabase.com/docs/guides/storage/management/delete-objects, read
 * 2026-10-08) -- so a `delete from storage.objects` would remove this app's
 * knowledge of a file and leave the bytes behind, paid for and unreachable,
 * which is the exact outcome the owner's "leftover files are not acceptable"
 * decision forbids. The DELETE policy in the migration is what PERMITS a
 * deletion; it is not a way to perform one.
 *
 * THE THREE ANSWERS ARE DECIDED BY LISTING BEFORE AND AFTER, and NOT by what
 * `remove` returned -- which is the thing to understand about this function,
 * because the obvious shortcut is wrong.
 *
 * The obvious shortcut: `remove` is typed as answering with the `FileObject[]`
 * it deleted, so an empty array would be "nothing matched". **The installed
 * client's own example says otherwise.** Its doc comment for `remove` shows the
 * response as `{ "data": [], "error": null }` for a successful delete of one
 * named file (`web/node_modules/@supabase/storage-js/dist/index.mjs`). So an
 * empty array is not evidence of anything, and a function that read it as
 * "nothing was deleted" would tell somebody their file was still there while
 * it was being removed -- a wrong message on the happy path.
 *
 * So the store is asked instead, which is Build it 19's rule applied to a file:
 * a message is a claim about what the store HOLDS, not about what a call
 * returned. Three requests for a delete, which is a rare and destructive action
 * where being sure is worth more than being quick:
 *
 *   it was not there before          -> `nothing`     (it had already gone)
 *   there before, gone after         -> `removed`
 *   there before, still there after  -> `stillthere`
 *
 * A FILE SOMEBODY MAY NOT DELETE CAN ARRIVE AS EITHER OF TWO THINGS, and both
 * are handled: a refusal, or a statement that matched no row -- because a policy
 * leaves a row out rather than complaining. The first is `refused`; the second
 * comes out as `stillthere`, which is the truthful answer for it.
 *
 * AND A LIST THAT FAILS IS NOT A DELETE THAT FAILED, but it is not a delete this
 * app can claim either. Both unreadable branches answer `stillthere`, which is
 * the direction that does not tell somebody a file is gone when nothing here
 * knows.
 */
export async function removeOne(supabase: Client, path: string): Promise<RemoveResult> {
  const taskId = path.split("/")[0];
  const name = path.slice(taskId.length + 1);
  const holds = async () => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(taskId, { limit: MAX_FILES_PER_TASK + 1 });
    if (error) return null;
    return readFileList(data).some((file) => file.name === name);
  };

  const before = await holds();
  if (before === false) return { state: "nothing" };

  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) return { state: "refused", failure: readFailure(error) };

  const after = await holds();
  return after === false ? { state: "removed" } : { state: "stillthere" };
}

/**
 * Every file on one task, removed, and then the folder read back to prove it.
 *
 * THIS IS THE FIRST HALF OF THE OWNER'S DECISION OF 8 OCTOBER 2026: "deleting a
 * task deletes its files first and is refused if they cannot be removed". The
 * second half is the trigger in the migration, which refuses to delete a task
 * that still has files whatever asked it to -- so this function being wrong
 * cannot leave an orphan, it can only leave a task undeleted.
 *
 * FILES FIRST, THEN THE TASK, and the order has two reasons. Failure:
 * files-then-task can fail halfway and leave a task with fewer files, which is
 * visible and recoverable, where task-then-files fails halfway and leaves
 * exactly the orphan this exists to prevent. And PERMISSION, which is the
 * stronger one -- the creator's right to delete these files comes FROM the task,
 * through the DELETE policy's "or you created the task" branch. Delete the task
 * first and that right is gone, along with any row that could answer who
 * created it. So this is the only order in which the permission exists at all.
 *
 * IT RUNS AS THE PERSON ASKING, with no more authority than they have sitting
 * at the screen, which is the clause docs/architecture.md calls the quiet virtue
 * of the whole decision: no part of this app deletes anything with more power
 * than the person asking for it.
 *
 * `cleared` IS READ BACK RATHER THAN COUNTED FROM THE DELETES. A delete that
 * answered without an error and removed nothing would otherwise be counted as a
 * success, and the task would then be refused by the trigger with nothing on
 * screen to explain it.
 */
export async function clearTaskFiles(
  supabase: Client,
  taskId: string,
): Promise<{ cleared: boolean; removed: number }> {
  const before = await supabase.storage
    .from(BUCKET)
    .list(taskId, { limit: MAX_FILES_PER_TASK + 1 });

  // A folder this app could not read is a folder it must not claim to have
  // emptied. Not cleared, so the task is left alone and the screen says so.
  if (before.error) return { cleared: false, removed: 0 };

  const files = readFileList(before.data);
  if (files.length === 0) return { cleared: true, removed: 0 };

  // ONE REQUEST FOR ALL OF THEM. `remove` takes a list of paths, so three files
  // are one round trip.
  //
  // AND ITS ANSWER IS NOT READ AT ALL, which is deliberate and is the same
  // correction `removeOne` above carries in full: the client documents its own
  // response as `{"data": [], "error": null}` for a successful delete of one
  // named file, so neither the array nor its length is evidence of anything.
  // The read-back below is what decides, and it would catch a partial result
  // whatever the answer had said.
  await supabase.storage
    .from(BUCKET)
    .remove(files.map((file) => `${taskId}/${file.name}`));

  const after = await supabase.storage
    .from(BUCKET)
    .list(taskId, { limit: MAX_FILES_PER_TASK + 1 });

  if (after.error) return { cleared: false, removed: 0 };

  const left = readFileList(after.data);
  return { cleared: left.length === 0, removed: files.length - left.length };
}
