// attachments.ts -- everything about a file attached to a task that is a
// decision rather than a request: which types are accepted, what the content
// type of each one is, the three numbers, and every sentence a person reads.
//
// Build it 23 part 2, issue #242. The database half is
// supabase/migrations/20261008191804_attachments_bucket.sql (#237), which is
// applied to staging and to production; docs/plan.md's "Files attached to a
// task" is where the owner's decisions are written down.
//
// IT HAS NO IMPORTS, so a plain `node` run can load it -- Node strips the types
// as it reads the file. That is what lets scripts/screen-state-check.mjs ask it
// questions with no bundler, no browser and no database, the same property
// web/src/lib/screen-state.ts and web/src/lib/suggestions.ts have.
//
// ---------------------------------------------------------------------------
// WHY THE NUMBERS ARE HERE AT ALL, when the database already holds them
// ---------------------------------------------------------------------------
//
// They are NOT the control. `public.attachments_may_add()` counts three files
// per task and 100 MB per person as its owner, and the INSERT policy on
// storage.objects calls it, so an upload that passes a limit is refused by the
// database whatever this file says. The bucket's own row holds the 5 MB and the
// six types, and Supabase refuses an upload that misses either before any
// policy is evaluated.
//
// What these copies are for is the two things a refusal from out there cannot
// do:
//
//   * SAY SOMETHING A PERSON CAN READ. Storage answers `EntityTooLarge` and
//     `InvalidMimeType`; a row-level refusal answers "new row violates
//     row-level security policy". docs/plan.md asks for plain words and for
//     NEVER the service's own text, so the sentences are written here and the
//     code is used only to choose between them.
//   * STOP A 5 MB UPLOAD THAT CANNOT SUCCEED. A file the browser can see is too
//     big is a file there is no point sending. That is a courtesy and not a
//     control, which is the same thing suggest-subtasks' in-flight lock says
//     about itself, and it is written down here so nobody later reads it as the
//     limit.
//
// AND A COPY NOBODY CHECKS IS A COPY THAT DRIFTS, so it is checked:
// scripts/screen-state-check.mjs section 10 reads the migration's own .sql text
// and fails if the numbers or the six types here stop matching the ones in it.
// That is the same move scripts/friendly-words-check.mjs makes about roles and
// invitation statuses -- read the migration, not a memory of it.

// ---------------------------------------------------------------------------
// The bucket
// ---------------------------------------------------------------------------

/** The private bucket. One, named in one place. */
export const BUCKET = "attachments";

/**
 * 5 MB, as the bucket's own `file_size_limit`: 5 * 1024 * 1024.
 *
 * MiB and not a round million, which is a decision rather than an obvious
 * reading -- docs/plan.md's own arithmetic forces it, because it says 100 MB is
 * "20 single 5 MB files" and that is only true if both numbers use one unit.
 * The migration spells 5242880 and 104857600 for the same reason.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Three files per task. The owner's decision, 8 October 2026. */
export const MAX_FILES_PER_TASK = 3;

/** 100 MB per person, across every file they have attached anywhere. */
export const MAX_BYTES_PER_PERSON = 100 * 1024 * 1024;

/**
 * How long a link to a file works: five minutes, as 300 seconds.
 *
 * It is the only control there is over a link that has been issued -- it cannot
 * be called back, and for those five minutes whoever holds it can open the file,
 * signed in or not. docs/plan.md's "Links, and what an unexpired one allows" is
 * the whole argument, and the reason this number is small and must not be
 * quietly raised to make something convenient.
 */
export const LINK_SECONDS = 300;

// ---------------------------------------------------------------------------
// The six types, and the extension each one arrives under
// ---------------------------------------------------------------------------
//
// THIS TABLE IS THE ONE THING IN THIS FILE THAT CHANGES WHAT GETS THROUGH, and
// it is here because of what the owner's staging run of 9 October 2026 found.
//
// Supabase: "By default, Supabase Storage determines content type from the file
// extension. You can override this with the `contentType` option"
// (https://supabase.com/docs/guides/storage/uploads/standard-uploads, read
// 2026-10-08). docs/plan.md carried as NOT CONFIRMED whether that default maps
// `.heic` to `image/heic`, and issue #239 asked for one upload to settle it.
//
// IT DOES NOT. A `.heic` name with no content type set by the caller is refused
// with `InvalidMimeType` -- the owner's run, recorded in
// evidence/build-it-23-attachments-bucket.md. So an iPhone photograph, which is
// the commonest thing this feature exists for and the reason HEIC is on the
// bucket's list at all, would be refused by the very bucket that was widened to
// accept it.
//
// So THIS APP SETS THE CONTENT TYPE ITSELF, from this table, by the file's
// extension -- and never from the browser's own guess. Two reasons it is the
// extension and not `file.type`:
//
//   * a browser that does not recognise .heic reports an empty type, which is
//     exactly the case that failed;
//   * `file.type` is chosen by whatever is uploading, so trusting it would put
//     the decision back in the place docs/plan.md already says it cannot live.
//
// AND IT DOES NOT MAKE THE REFUSAL ANY STRONGER, which is worth saying because
// setting the type looks like taking the bucket's job over. It is not: the type
// this app sends is read off the NAME, so a renamed file still gets through,
// exactly as docs/plan.md says. "The bucket enforces the refusal, never the
// contents" is unchanged by this table. What the table changes is that a file
// whose name this app does not recognise is refused HERE, with a sentence,
// instead of being sent and refused out there with a code.
//
// TWO NEIGHBOURS OF HEIC ARE DELIBERATELY ABSENT: `image/heif` and
// `image/heic-sequence`. The owner's answer named HEIC, and the bucket's own
// list does not hold either, so a file declaring one would be refused by
// Supabase anyway -- this table refusing it first is the same answer, sooner and
// in words.
export const TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  pdf: "application/pdf",
};

/**
 * The six accepted types, in the migration's own order.
 *
 * Six types and seven extensions: `.jpg` and `.jpeg` are both `image/jpeg`.
 * Named one by one, with no wildcard -- `image/*` would admit `image/svg+xml`,
 * and an SVG is a document that can carry script, served back from this
 * project's own address.
 */
export const ACCEPTED_TYPES: ReadonlyArray<string> = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/pdf",
];

/**
 * What the file chooser offers, for `<input type="file" accept="...">`.
 *
 * Extensions AND types, because the two do different jobs: a desktop file
 * dialogue filters by extension, and a phone's camera roll answers to the media
 * type. It is a convenience and nothing else -- `accept` is a hint a browser may
 * ignore, so every refusal below is still made after the file is chosen.
 */
export const ACCEPT_ATTRIBUTE: string = [
  ...Object.keys(TYPE_BY_EXTENSION).map((extension) => `.${extension}`),
  ...ACCEPTED_TYPES,
].join(",");

/**
 * The content type this app will declare for a file of this name, or null.
 *
 * Null is the refusal, and it is the answer for a name with no extension, an
 * extension this app does not know, and a name that is nothing but an
 * extension -- `.png` on its own is not a file called png.
 */
export function contentTypeFor(fileName: unknown): string | null {
  if (typeof fileName !== "string") return null;

  const name = fileName.trim();
  const dot = name.lastIndexOf(".");

  // No dot, a leading dot (so no name at all), or a trailing dot (so no
  // extension).
  if (dot <= 0 || dot === name.length - 1) return null;

  const extension = name.slice(dot + 1).toLowerCase();
  return TYPE_BY_EXTENSION[extension] ?? null;
}

// ---------------------------------------------------------------------------
// The path a file is stored at
// ---------------------------------------------------------------------------
//
// `<task id>/<file name>`, with the bucket named separately by the client --
// storage.objects.name holds the path WITHOUT the bucket, which is what
// public.attachments_task_id() reads the task's id off.
//
// WHAT MAY BE IN A FILE NAME, and why this is stricter than it looks. The first
// segment of the path is the whole of how every rule in the migration decides
// which task a file belongs to, so a name that could add a segment is a name
// that could move a file to another task. A `/` is therefore not a character
// this app will send, and nor is anything that a path might read as a step up or
// down.
//
// So the name is rebuilt rather than filtered: letters, digits, dot, dash and
// underscore survive, and every other character becomes a dash. That throws
// away accents and every non-Latin script, which is a real cost and the reason
// it is written down -- the name is a label on a file, not text anybody reads
// for meaning, and the person chose the file by looking at it rather than by
// reading what this app stored it as.

/** As many characters of a file's name as this app will store. */
export const MAX_NAME_CHARS = 80;

/**
 * A file name this app is willing to put in a path, or null if nothing usable
 * is left.
 *
 * Null for an empty name, for a name of nothing but separators, and for a name
 * whose extension this app does not accept -- the extension survives
 * untouched, because it is what `contentTypeFor` has already decided on and a
 * sanitised extension could disagree with the type being declared.
 */
export function storedName(fileName: unknown): string | null {
  if (typeof fileName !== "string") return null;
  if (contentTypeFor(fileName) === null) return null;

  const name = fileName.trim();
  const dot = name.lastIndexOf(".");
  const extension = name.slice(dot + 1).toLowerCase();

  const stem = name
    .slice(0, dot)
    // Every run of anything that is not a plain name character becomes ONE
    // dash, so `my  photo (2).png` is `my-photo-2-.png` rather than a row of
    // dashes.
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    // A leading or trailing dash or dot is tidy to lose and, for the dot,
    // necessary: `..` in a path segment is a thing some readers treat as a step
    // up, and a leading dot makes a hidden file on most systems.
    .replace(/^[.\-]+/, "")
    .replace(/[.\-]+$/, "")
    // `..` anywhere, not only at the ends.
    .replace(/\.{2,}/g, ".");

  if (stem === "") return null;

  // The cap is on the stem, so the extension always survives whole -- a cut
  // extension would be a file whose name no longer agrees with the type this
  // app declared for it.
  const cut = stem.slice(0, MAX_NAME_CHARS);
  return `${cut}.${extension}`;
}

/**
 * The object's path inside the bucket: `<task id>/<file name>`.
 *
 * Both halves are checked by the caller before this is called -- the task id is
 * one the page read back from the database, and the name is `storedName`'s
 * answer. This function joins them and does not re-decide either, so there is
 * one place that says what a name may be.
 */
export function objectPath(taskId: string, fileName: string): string {
  return `${taskId}/${fileName}`;
}

/**
 * The task id a path belongs to, or null -- the same question
 * `public.attachments_task_id()` answers, and deliberately the same answer for
 * the same inputs.
 *
 * It is here so the screen can refuse a path that is not one of its own before
 * sending it anywhere. It is NOT how access is decided: that is the three
 * policies on storage.objects, which this cannot reach and must not look like a
 * substitute for.
 */
export function taskIdOf(path: unknown): string | null {
  if (typeof path !== "string") return null;

  const parts = path.split("/");
  if (parts.length !== 2) return null;
  if (parts[1].trim() === "") return null;

  const id = parts[0].toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
    ? id
    : null;
}

// ---------------------------------------------------------------------------
// One file, as a screen needs it
// ---------------------------------------------------------------------------

/**
 * What the list endpoint gives back about one stored object, narrowed to the
 * three things the screen uses.
 *
 * `name` is relative to the prefix asked for, so it is the file name alone and
 * not the whole path. The task id is already known -- it is the prefix -- which
 * is why nothing here carries it.
 */
export type StoredFile = {
  name: string;
  size: number | null;
};

/**
 * The rows a list answered with, narrowed and sorted, with anything unusable
 * dropped.
 *
 * WHAT IS DROPPED, AND WHY EACH ONE IS NOT A GAP: a row with no name, a row
 * whose name is not a plain string, and a row with no `id`. That last one is
 * Supabase's own marker for a folder rather than a file -- a listing returns
 * both, and a folder has a null id. Nothing in this app creates one, and a
 * screen that drew one would offer an Open button for something that is not a
 * file.
 *
 * The size comes out of `metadata.size`, and `null` is a real answer: the screen
 * says nothing about a size it does not know rather than drawing a 0.
 */
export function readFileList(rows: unknown): StoredFile[] {
  if (!Array.isArray(rows)) return [];

  const out: StoredFile[] = [];

  for (const row of rows) {
    const record = row as { name?: unknown; id?: unknown; metadata?: unknown } | null;
    if (record === null || typeof record !== "object") continue;
    if (typeof record.name !== "string" || record.name.trim() === "") continue;
    // A folder, not a file.
    if (record.id === null || record.id === undefined) continue;

    const size = (record.metadata as { size?: unknown } | null)?.size;

    out.push({
      name: record.name,
      size: typeof size === "number" && Number.isFinite(size) && size >= 0 ? size : null,
    });
  }

  // By name, so two views of the same task draw the same order. Storage's own
  // order is not promised anywhere this project has read.
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A file's size in words: "1.4 MB", "86 KB", or null when it is not known.
 *
 * KB and MB as 1024, the same unit as every other number in this feature. One
 * decimal place for MB and none for KB, because a photograph is 1.4 MB and
 * nobody needs 1.43, and a 90 KB screenshot does not need to be 90.2.
 */
export function fileSizeWords(size: number | null): string | null {
  if (size === null || !Number.isFinite(size) || size < 0) return null;
  if (size < 1024) return `${Math.round(size)} bytes`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** 5 MB, in the words a sentence uses. Derived, so it cannot disagree. */
export const MAX_FILE_WORDS = `${MAX_FILE_BYTES / (1024 * 1024)} MB`;

/** 100 MB, likewise. */
export const PER_PERSON_WORDS = `${MAX_BYTES_PER_PERSON / (1024 * 1024)} MB`;

// ---------------------------------------------------------------------------
// The sentences
// ---------------------------------------------------------------------------
//
// EVERY ONE OF THEM IS WRITTEN HERE AND NOWHERE ELSE, and not one of them
// carries a word Supabase chose. That is docs/plan.md's requirement -- "Messages
// in plain words ... Never the storage service's own text" -- and it is the same
// decision web/src/lib/teams.ts made about an Edge Function's own message, for
// the same reason: a code or a message read off an answer and shown on a screen
// is words somebody else wrote appearing in this app's styling, and nobody here
// has read them.
//
// THE NUMBERS IN THEM ARE INTERPOLATED FROM THE CONSTANTS ABOVE, never typed as
// digits. So a sentence cannot go stale against a limit, which is the fault
// web/src/lib/teams.ts's own note describes about CREATE_TEAM_SENTENCES.
//
// WHAT NONE OF THEM SAYS: a file name, a path, a storage code, an HTTP status,
// how many bytes somebody has used, or whose file it is. The first two are
// docs/plan.md's rule about free text somebody's phone chose; the rest is
// plumbing.

/** The upload was refused here, before anything was sent: the file is too big. */
export const FILE_TOO_BIG =
  `That file is too big. Each file can be up to ${MAX_FILE_WORDS}.`;

/** Refused here: this app does not accept that kind of file. */
export const FILE_WRONG_TYPE =
  "That kind of file can't be attached. Photos and PDFs only — JPEG, PNG, WebP, GIF, HEIC or PDF.";

/** Refused by the database: the task already has its three. */
export const FILE_TOO_MANY =
  `That task already has ${MAX_FILES_PER_TASK} files, which is the most it can have. Delete one first.`;

/**
 * Refused by the database: this person's own total would go over 100 MB.
 *
 * It names the limit and NOT how much of it is used, which is a deliberate
 * omission rather than a kindness withheld: the sum is over rows this screen
 * cannot see -- somebody's files on tasks that have since moved away from them --
 * so a number here would be a guess, and a wrong one in the direction of
 * reassurance.
 */
export const FILE_NO_ROOM =
  `You have used your ${PER_PERSON_WORDS} of files. Delete one of your files to make room.`;

/**
 * Refused by the database for a reason about permission: not your task, not a
 * file you may delete, or a suspended account.
 *
 * ONE SENTENCE FOR ALL THREE, which is the same choice INVITE_SENTENCES.conflict
 * made about three refusals sharing one status: the screen cannot tell them
 * apart, so it names the rule rather than guessing which one bit.
 */
export const FILE_NOT_ALLOWED =
  "You cannot do that. A file belongs to its task, and only the person who attached it or the person who created the task can remove it.";

/** Something went wrong that is not a refusal. */
export const FILE_FAILED = "That file could not be attached. Please try again.";

/** The upload was accepted AND the file was then listed back. */
export const FILE_ATTACHED = "File attached.";

/** The file is gone, and that was read back too. */
export const FILE_DELETED = "File deleted.";

/** A delete that matched nothing. */
export const FILE_ALREADY_GONE =
  "That file was not deleted. It may have been deleted already.";

/** A delete that answered without an error, and then the file was still there. */
export const FILE_STILL_THERE =
  "That file may not have been deleted — it is still on the task. Please try again.";

/** The list of a task's files could not be read. */
export const FILES_LOAD_FAILED =
  "The files on your tasks could not be loaded, so no task below shows any.";

/** A link could not be made. */
export const LINK_FAILED =
  "That file could not be opened. Please try again.";

/**
 * THE LINE BESIDE THE UPLOAD BOX. The owner's decision of 8 October 2026,
 * docs/plan.md's "What is inside a photograph, which the app does not look at".
 *
 * Two things had to be true of it, and both are deliberate:
 *
 *   SHORT, because a paragraph beside an upload button is a paragraph nobody
 *   reads. Two sentences.
 *
 *   IT SAYS THE APP DOES NOT REMOVE IT, rather than implying anybody has
 *   checked. "A photo can carry" -- can, not does: this app has never looked
 *   inside one and says so by not claiming to.
 *
 * It is the same decision the task box's "Please don't put personal details in
 * tasks." already is, and the harder case of it: what a photograph carries is
 * not something the person typed and cannot be seen on the screen they are
 * uploading from.
 */
export const PHOTO_METADATA_LINE =
  "A photo can carry where and when it was taken, inside the file. This app does not remove it.";

/** What the whole box promises about who sees a file. */
export const WHO_CAN_SEE_FILES =
  "Everyone who can see this task can open its files. A link to a file works for 5 minutes and anyone who has it can open the file in that time.";

// ---------------------------------------------------------------------------
// Which sentence a refusal gets
// ---------------------------------------------------------------------------

/** Every outcome an attachment action can report back to the screen. */
export const FILE_OUTCOMES = [
  "attached",
  "deleted",
  "toobig",
  "wrongtype",
  "toomany",
  "noroom",
  "notallowed",
  "failed",
  "gone",
  "stillthere",
  "linkfailed",
] as const;

export type FileOutcome = (typeof FILE_OUTCOMES)[number];

/** The sentence for each. One map, so a screen draws no sentence of its own. */
export const FILE_SENTENCES: Readonly<Record<FileOutcome, string>> = {
  attached: FILE_ATTACHED,
  deleted: FILE_DELETED,
  toobig: FILE_TOO_BIG,
  wrongtype: FILE_WRONG_TYPE,
  toomany: FILE_TOO_MANY,
  noroom: FILE_NO_ROOM,
  notallowed: FILE_NOT_ALLOWED,
  failed: FILE_FAILED,
  gone: FILE_ALREADY_GONE,
  stillthere: FILE_STILL_THERE,
  linkfailed: LINK_FAILED,
};

/** Which of them are good news, for the banner's tone. */
export const GOOD_OUTCOMES: ReadonlyArray<FileOutcome> = ["attached", "deleted"];

/**
 * The outcome a value from a query string names, or null.
 *
 * Null for everything this app did not write, so a crafted `?file=` draws
 * nothing rather than a sentence of somebody else's choosing. The same shape
 * `readFilter` has, and for the same reason.
 */
export function readFileOutcome(value: unknown): FileOutcome | null {
  if (typeof value !== "string") return null;
  const word = value.trim();
  return (FILE_OUTCOMES as readonly string[]).includes(word)
    ? (word as FileOutcome)
    : null;
}

/**
 * Which refusal a failed upload or delete was, decided WITHOUT reading anything
 * the storage service wrote in words.
 *
 * What it is given: the HTTP status, and the service's own short error code when
 * there was one. Both are plumbing, both are compared as exact values, and
 * NEITHER IS EVER DRAWN -- they choose a sentence from the map above and are
 * then thrown away. That is the distinction web/src/lib/teams.ts draws about
 * `account_suspended`: reading a code is fine, printing one is not.
 *
 * THE ORDER IS THE WHOLE OF IT. The bucket's two refusals are told apart by
 * their codes, because docs/plan.md's own citation gives them by name --
 * `InvalidMimeType` and `EntityTooLarge`
 * (https://supabase.com/docs/guides/storage/debugging/error-codes). Everything
 * else that comes back as a refusal is a row-level one, and a row-level refusal
 * on this bucket has exactly three possible causes for an upload: the task is
 * not one you can see, the task already has three files, or your own total is
 * full. The screen cannot tell those apart from the answer -- Postgres says the
 * same sentence for all of them -- so the CALLER tells this function which it
 * had already counted, and only an uncounted refusal falls through to "you
 * cannot do that".
 *
 * AND A STATUS THIS APP HAS NEVER SEEN IS A FAILURE, not a refusal. "Something
 * went wrong, try again" is the honest answer for an answer nobody here
 * recognises, and it is the one that does not tell somebody a rule refused them
 * when it may not have.
 */
export function uploadRefusal(answer: {
  status?: unknown;
  code?: unknown;
  /**
   * What the screen already knew when it offered the upload: how many files the
   * task had. A row-level refusal with the task already full is the three-file
   * limit, and saying so is more use than "you cannot do that".
   */
  filesAlready?: unknown;
}): FileOutcome {
  const code = typeof answer.code === "string" ? answer.code.trim() : "";

  // The bucket's own two, by the codes Supabase publishes for them.
  if (code === "InvalidMimeType") return "wrongtype";
  if (code === "EntityTooLarge") return "toobig";

  // A refusal about permission or a limit. 400 is here because Storage was seen
  // on staging to wrap a refusal's real status inside the body and answer 400 on
  // the HTTP line -- so the status is a weak signal and the code is the strong
  // one. 401, 403 and 400 are therefore all "it was refused", and which refusal
  // it was comes from what the caller already counted.
  const status = typeof answer.status === "number" ? answer.status : 0;
  if (status === 400 || status === 401 || status === 403) {
    const already =
      typeof answer.filesAlready === "number" && Number.isFinite(answer.filesAlready)
        ? answer.filesAlready
        : 0;
    if (already >= MAX_FILES_PER_TASK) return "toomany";
    return "notallowed";
  }

  return "failed";
}

/**
 * Whether a file this app is about to send can possibly be accepted, and the
 * sentence if not.
 *
 * NOT A CONTROL, and the header says so at length: the bucket refuses both of
 * these itself, and this is about not sending 5 MB that cannot succeed and about
 * saying why in words rather than showing a code afterwards.
 *
 * It returns the content type as well, because deciding the type and deciding
 * whether the type is acceptable are the same question asked once.
 */
export function checkBeforeSending(file: {
  name?: unknown;
  size?: unknown;
}): { ok: true; contentType: string; storedAs: string } | { ok: false; outcome: FileOutcome } {
  const size = typeof file.size === "number" && Number.isFinite(file.size) ? file.size : -1;

  // An unknown size is not a small one. The same direction the migration's
  // attachments_file_bytes() takes, and for the same reason.
  if (size < 0 || size > MAX_FILE_BYTES) return { ok: false, outcome: "toobig" };

  // An empty file. Nothing refuses it out there and nothing is gained by
  // storing it, and it is the shape a cancelled file chooser leaves behind.
  if (size === 0) return { ok: false, outcome: "failed" };

  const contentType = contentTypeFor(file.name);
  if (contentType === null) return { ok: false, outcome: "wrongtype" };

  const storedAs = storedName(file.name);
  if (storedAs === null) return { ok: false, outcome: "wrongtype" };

  return { ok: true, contentType, storedAs };
}

// ---------------------------------------------------------------------------
// Deleting a task, which now has two halves
// ---------------------------------------------------------------------------
//
// docs/plan.md, the owner's decision of 8 October 2026: deleting a task
// "deletes its files first and is refused if they cannot be removed", and the
// database refuses to delete a task that still has files whatever asked it to.
//
// So the action has to say which of three things happened, and the third is the
// one this sentence exists for.

/** A task whose files could not all be removed, so the task is still there. */
export const TASK_FILES_IN_THE_WAY =
  "That task was not deleted: its files could not be removed first, so the task is still here with them on it. Please try again.";

/**
 * A task that was deleted along with its files, said only when both were read
 * back.
 *
 * It names a count, and the count is of what this app actually removed rather
 * than of what it meant to.
 */
export function taskAndFilesDeleted(files: number): string {
  if (files === 1) return "Task deleted, with the file on it.";
  return `Task deleted, with the ${files} files on it.`;
}
