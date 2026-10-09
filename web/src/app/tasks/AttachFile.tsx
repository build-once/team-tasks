"use client";

// AttachFile.tsx -- the one upload box, and the only code in this app that runs
// in the browser and talks to Supabase.
//
// Build it 23 part 2, issue #242.
//
// ---------------------------------------------------------------------------
// WHY THIS IS A CLIENT COMPONENT WHEN NOTHING ELSE ON MY TASKS IS
// ---------------------------------------------------------------------------
//
// Every other control on this page is a link or a form that posts to a server
// action, and that is a property worth keeping: the screens are rendered on the
// server and work with no JavaScript at all. This one cannot be, and the reason
// is the owner's requirement rather than a preference: **the upload goes from
// the browser, with the person's own rights.**
//
// WHAT THAT BUYS, and it is the whole of issue #240:
//
//   * the request arrives at Storage as the signed-in person, so the INSERT
//     policy on storage.objects is evaluated -- which is what calls
//     public.attachments_may_add() and counts the three-per-task and the
//     100 MB. An upload made with the service-role key would be evaluated
//     against no policy at all: "Service keys entirely bypass RLS policies"
//     (https://supabase.com/docs/guides/storage/security/access-control).
//   * the stored row gets an owner. "When using the `service_key` to create a
//     resource, the owner will not be set"
//     (https://supabase.com/docs/guides/storage/security/ownership) -- and a
//     file with no owner belongs to nobody's 100 MB and can be deleted by
//     nobody but the task's creator.
//   * the 5 MB never passes through this app's own server, which a server
//     action would have to carry for no gain.
//
// WHAT IT COSTS, said plainly: attaching a file needs JavaScript, and nothing
// else on this page does. There is a <noscript> line below that says so, in the
// place it matters, rather than leaving somebody pressing a button that cannot
// work. Seeing a file, opening one and deleting one all still work without it --
// those are a server-rendered list and two forms posting to server actions.
//
// ---------------------------------------------------------------------------
// WHAT IT SENDS, AND WHAT IT DOES NOT
// ---------------------------------------------------------------------------
//
// One file, to one path, with a content type this app chose from the file's
// extension. The path is `<task id>/<file name>`: the task's id is the whole of
// how every rule in the migration decides which task a file belongs to, and the
// name is web/src/lib/attachments.ts's `storedName`, which rebuilds it out of
// characters that cannot add a path segment.
//
// THE CONTENT TYPE IS SET BY THIS APP AND NOT BY THE BROWSER. Supabase works the
// declared type out from the file's extension unless the caller overrides it, and
// nothing read says which extensions it maps -- so every type would otherwise be
// a guess about somebody else's table. `TYPE_BY_EXTENSION` in
// web/src/lib/attachments.ts is this app's own answer and the one place it lives.
//
// THAT TABLE WAS WRITTEN FOR HEIC, AND HEIC IS NO LONGER ON IT. The owner's
// staging run of 9 October 2026 found that Supabase does not map `.heic`, which
// is what the table was for; the owner then tried a HEIC photograph **through
// this component**, from a Windows PC, and it failed anyway. The cause was not
// found and the owner decided not to pursue it. So the app stopped offering the
// type -- a `.heic` file now gets the ordinary wrong-type sentence -- while the
// bucket still permits it. attachments.ts has the whole reasoning beside the
// table, and issue #246 has what would settle it.
//
// NOTHING IS REPORTED TO ERROR REPORTING FROM HERE, and no file name ever could
// be. docs/plan.md puts a file name on Sentry's "must never be sent" list,
// because a name is free text somebody's phone chose --
// `scan-of-the-letter-from-my-doctor.pdf` is a sentence about a person. So this
// component catches its own failures, reads a status and a code off them, and
// turns those into one of this app's own sentences. It never throws past itself,
// never logs, and never captures.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Banner } from "@/app/components/Banner";
import {
  ACCEPT_ATTRIBUTE,
  BUCKET,
  FILE_SENTENCES,
  GOOD_OUTCOMES,
  MAX_FILES_PER_TASK,
  PHOTO_METADATA_LINE,
  checkBeforeSending,
  objectPath,
  readFileList,
  uploadRefusal,
  type FileOutcome,
} from "@/lib/attachments";
import { createClient } from "@/lib/supabase/client";

import styles from "./tasks.module.css";

export function AttachFile({
  taskId,
  filesAlready,
  taskTitle,
}: {
  taskId: string;
  /**
   * How many files the page just read off this task. Two jobs: it decides
   * whether the box is offered at all, and it is what tells a row-level refusal
   * "the task is full" apart from a row-level refusal "you may not".
   */
  filesAlready: number;
  /** For the hidden label, so a screen reader is told which task this box is for. */
  taskTitle: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [outcome, setOutcome] = useState<FileOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  // The refresh is a transition, so the button can stay disabled until the
  // server has re-rendered the list -- otherwise "File attached." appears above
  // a list that does not yet show it.
  const [refreshing, startRefresh] = useTransition();

  const full = filesAlready >= MAX_FILES_PER_TASK;
  const working = busy || refreshing;

  async function attach() {
    const file = input.current?.files?.[0];

    // Nothing chosen. Not a failure and not a refusal: say nothing, which is
    // what the browser's own required-field behaviour would do if this were an
    // ordinary form.
    if (!file) {
      setOutcome(null);
      return;
    }

    setOutcome(null);
    setBusy(true);

    try {
      // THE TWO THINGS THIS APP CAN SEE FOR ITSELF, checked before 5 MB is sent
      // over somebody's phone connection. Not a control -- the bucket refuses
      // both itself, whatever this says -- and the header of
      // web/src/lib/attachments.ts is explicit about that. What it buys is a
      // sentence instead of a code, and not sending a file that cannot succeed.
      const ready = checkBeforeSending({ name: file.name, size: file.size });
      if (!ready.ok) {
        setOutcome(ready.outcome);
        return;
      }

      const supabase = createClient();

      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(objectPath(taskId, ready.storedAs), file, {
          contentType: ready.contentType,
          // NO UPSERT, deliberately. There is no UPDATE policy on
          // storage.objects, so an upload asking to overwrite is refused
          // anyway -- and asking for it would mean a file's bytes could change
          // under a signed link somebody already holds.
          upsert: false,
        });

      if (error) {
        // A status and a code, never the message. The installed client's own
        // type documents `code` as the thing to branch on rather than parsing
        // the message, and web/src/lib/attachment-store.ts says why that
        // matters here.
        const plumbing = error as { status?: unknown; code?: unknown };
        setOutcome(
          uploadRefusal({
            status: plumbing.status,
            code: plumbing.code,
            filesAlready,
          }),
        );
        return;
      }

      // ---- "ATTACHED" ONLY AFTER THE FILE IS LISTED BACK ------------------
      //
      // The owner's requirement, and the same rule Build it 19 applied to "Task
      // added." and "Team created.": a message is a claim about what the
      // database holds, not about whether a write returned without an error.
      //
      // An upload with no error and nothing stored is not a thing anybody has
      // seen -- but neither was an insert with no error and no row, which is
      // exactly what web/src/app/tasks/actions.ts found when it started reading
      // its rows back. The list is one request and it is the difference between
      // reporting and hoping.
      const listed = await supabase.storage
        .from(BUCKET)
        .list(taskId, { limit: MAX_FILES_PER_TASK + 1 });

      const there = readFileList(listed.data).some((row) => row.name === ready.storedAs);

      if (listed.error || !there) {
        setOutcome("failed");
        return;
      }

      setOutcome("attached");

      // The file chooser is cleared so the same file cannot be sent twice by a
      // second press -- which would be refused, because the path already
      // exists and nothing permits an overwrite, and would read as a fault.
      if (input.current) input.current.value = "";

      // And the server re-renders the list, so the file the person has just
      // been told about is on the screen underneath the message.
      startRefresh(() => router.refresh());
    } catch {
      // A network fault, or anything else the client throws. No status and no
      // code, so the sentence is the one that does not claim a rule refused
      // anybody.
      setOutcome("failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.attach}>
      <label className="label" htmlFor={`file-${taskId}`}>
        Attach a file
        <span className="visually-hidden"> to {taskTitle}</span>
      </label>

      <div className={styles.attachRow}>
        <input
          ref={input}
          className="input"
          id={`file-${taskId}`}
          name="file"
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          disabled={full || working}
          // So a message about the last file is not still sitting there while
          // somebody chooses the next one.
          onChange={() => setOutcome(null)}
          aria-describedby={`file-hint-${taskId}`}
        />
        {/* type="button", not a submit: see the note in
            web/src/app/components/ActButton.tsx. There is no form here and no
            server action, so there is nothing for a button identifier to
            travel to. */}
        <button
          className="btn btn--primary"
          type="button"
          onClick={attach}
          disabled={full || working}
        >
          {working ? "Attaching…" : "Attach"}
        </button>
      </div>

      {/* THE LINE THE OWNER ASKED FOR, decision D, 8 October 2026: beside the
          upload box, short, and saying that this app does not remove it rather
          than implying anybody has checked. It is drawn whether or not the box
          is usable, because somebody looking at a task's files should read it
          too. */}
      <p className="hint" id={`file-hint-${taskId}`}>
        {PHOTO_METADATA_LINE}
      </p>

      {full ? (
        <p className="hint">{FILE_SENTENCES.toomany}</p>
      ) : null}

      {/* The one thing on this page that needs JavaScript, said where it
          matters. Seeing a file, opening one and deleting one all work
          without it. */}
      <noscript>
        <p className="hint">
          Attaching a file needs JavaScript, because the file goes from this
          browser straight to the file store. Opening and deleting the files
          already here work without it.
        </p>
      </noscript>

      {/* The same Banner every other message in this app is drawn with, so an
          attachment's bad news looks like a task's bad news. `tone` decides the
          colour AND the politeness -- role="alert" for a refusal, role="status"
          for "File attached." -- which is the component's own decision and not
          one made again here. */}
      {outcome === null ? null : (
        <Banner
          tone={(GOOD_OUTCOMES as readonly string[]).includes(outcome) ? "ok" : "bad"}
          icon={(GOOD_OUTCOMES as readonly string[]).includes(outcome) ? "check" : "alert"}
        >
          {FILE_SENTENCES[outcome]}
        </Banner>
      )}
    </div>
  );
}
