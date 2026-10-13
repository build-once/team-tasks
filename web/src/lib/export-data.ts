// export-data.ts -- the shape of the file somebody downloads when they ask what
// this app holds about them, and every sentence the screen says about it.
//
// Build it 26, PR 3. docs/deletion.md section 11 is the design; the owner's
// decisions 8a-8d and 9 of 2026-10-12 are what it contains and what bounds it.
//
// ---------------------------------------------------------------------------
// WHAT IS PURE HERE, AND WHY THAT IS THE WHOLE POINT
// ---------------------------------------------------------------------------
//
// This file ASSEMBLES the file and never fetches anything. Everything it needs
// is handed to it: the rows, whether each read failed, the signed-in person's
// own id, and the moment. So the one thing that decides what ends up in
// somebody's export is a function that can be asked thousands of questions with
// no database, no session and no clock -- which is what
// scripts/screen-state-check.mjs section 12 does.
//
// web/src/app/settings/export/route.ts is the half that makes requests, and it
// makes every one of them WITH THE CALLER'S OWN RIGHTS. There is no
// service-role key in this feature, in either file, and docs/deletion.md says
// why in one line: "nearly everything in it is something the person can already
// read through row-level security with their own session", so the POLICIES are
// what keep the file to their own data.
//
// IT HAS NO IMPORTS, so a plain `node` run can load it -- Node strips the types
// as it reads the file. The same property web/src/lib/consent.ts and
// web/src/lib/screen-state.ts have, and for the same reason: the check script
// imports the real module rather than a copy of it.
//
// ---------------------------------------------------------------------------
// THE FOUR RULES THIS FILE IS WRITTEN AROUND
// ---------------------------------------------------------------------------
//
// 1. A FAILED READ IS NEVER AN EMPTY SECTION. This is Build it 19's rule
//    (web/src/lib/screen-state.ts) applied to a file instead of a screen, and it
//    bites harder here: an empty list on a screen is a moment's confusion, and
//    an empty list in a DOWNLOADED FILE is this app telling somebody in writing
//    that it holds nothing of theirs. So a section that could not be read says
//    `could_not_be_read`, the section's name is listed at the TOP of the file,
//    and `complete` is false. Nothing is ever quietly `[]`.
//
// 2. EVERY FIELD IS WRITTEN OUT BY NAME, AND NOTHING IS EVER SPREAD. No
//    `...row` anywhere below. A column this file was not asked for cannot reach
//    somebody's download by arriving in a query -- which matters because
//    `invitations` carries `token_hash`, and a hash of a credential is the one
//    thing docs/deletion.md section 11.3 names first among what must stay out.
//
// 3. NO UUID GOES IN THE FILE. Not a task id, not a team id, not the person's
//    own user id. docs/deletion.md section 11.2 asks for the NAME of a task's
//    team rather than its id, and once that is true for one id it may as well be
//    true for all of them: a file somebody keeps for years should read as their
//    own list, not as a database extract. A file is therefore attached to its
//    task by that task's TITLE.
//
// 4. AND THE FILE HOLDS ONLY ROWS THIS PERSON CREATED, CHECKED HERE AS WELL AS
//    IN THE QUERY. `ownRowsOnly` below drops any task whose `owner_id` is not
//    the caller's. The query already filters, so this is a second lock -- and it
//    is the one that would catch a filter somebody removed while tidying up,
//    because the SELECT policy on `tasks` is deliberately WIDER than the export:
//    it returns every task in every team you are in, written by anybody.

// ---------------------------------------------------------------------------
// The format
// ---------------------------------------------------------------------------

/**
 * The version of this file's shape.
 *
 * It is in the export so that somebody holding a file from a year ago can tell
 * what they are looking at. Raise it when a section is renamed or removed --
 * never for an added field, which an old reader simply ignores.
 */
export const EXPORT_FORMAT_VERSION = 1;

/**
 * What the file says it is, in its own first field.
 *
 * NOT a heading and not a title: it is a sentence somebody reads when they open
 * a JSON file in a text editor and want to know what they have. It names no
 * company, no table and no number.
 */
export const EXPORT_WHAT_THIS_IS =
  "Everything Team Tasks holds about one person, as that person asked for it. " +
  "It was built from this account's own data and nobody else's.";

/**
 * The eight sections, in the order they appear.
 *
 * Exported so a check can assert the list rather than copy it, and so the route
 * cannot add a ninth without this file knowing about it.
 */
export const EXPORT_SECTIONS = [
  "account",
  "profile",
  "ai_suggestions",
  "tasks",
  "teams_you_own",
  "teams_you_belong_to",
  "invitations_you_sent",
  "files_on_your_tasks",
] as const;

export type ExportSection = (typeof EXPORT_SECTIONS)[number];

/**
 * What is deliberately NOT in the file, IN the file.
 *
 * docs/deletion.md section 11.3 is this list, one line per row of its table,
 * and the reason it is in the download rather than only in the design is the
 * same reason the privacy page exists at all: a person reading the file is the
 * person who wants to know what is missing from it, and nobody using this app
 * will ever read docs/deletion.md.
 *
 * THE TWO AWKWARD ONES ARE THE LAST TWO, and they are awkward in opposite
 * directions -- a count of somebody's own activity and a judgement made about
 * them are exactly what a person asking "what do you hold about me?" most
 * reasonably wants. The owner's decisions 8c and 8d of 2026-10-12 leave both
 * out, because the plan says NOBODY may read either table through the app, and
 * an export is through the app. So the honest form is not to omit them quietly:
 * it is to say they exist, what they hold, and how to ask. docs/claims.md
 * section 7d carries both sentences as promises the owner can be held to.
 */
export const NOT_IN_THIS_FILE: ReadonlyArray<string> = [
  "Your password. It is held only as a one-way hash, and a hash is no use to you.",
  "Your sign-in tokens, and the hash of any invitation token you sent. Those are credentials.",
  "The attached files themselves. A single account may hold 100 MB of them, which does not belong in a JSON file -- so they are listed here and you open each one from My tasks.",
  "Anybody else's tasks, including tasks other people wrote in your teams. They are not your data.",
  "The other members of your teams, and their nicknames. You can see a team's members on screen; a list of other people in a file you keep is a different thing.",
  "The sign-in log, and any IP address. Nothing in this app is built on it.",
  "How many times you used each limited feature on each day. The app keeps that for a few days and NOBODY can read it through the app, not even you -- ask the owner and they will tell you what it holds.",
  "Whether your account has been suspended, and the owner's note about it if there is one. Nobody can read that through the app either -- ask, and the same applies.",
  "Your error reports at Sentry, the email service's sending log, and anything held by the AI service. Those are other companies' records, and the privacy page says where to ask.",
];

// ---------------------------------------------------------------------------
// The file's name
// ---------------------------------------------------------------------------

/**
 * What the download is called.
 *
 * A FIXED WORD AND A DATE, AND NOTHING ABOUT THE PERSON. No nickname, no
 * address, no id. A file name travels further than a file's contents: it is
 * read out by a screen reader, shown in a chat's attachment strip, and typed
 * into a search box -- and `docs/plan.md` already forbids a file name reaching
 * an error report for exactly that reason, because a name is free text about
 * somebody.
 *
 * The date is the first ten characters of the moment the file was built, which
 * is the same value `generated_at` carries inside it. An unusable moment gives
 * the bare name rather than a name with "undefined" in it.
 */
export const EXPORT_FILE_STEM = "team-tasks-export";

export function exportFileName(generatedAt: unknown): string {
  const day =
    typeof generatedAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(generatedAt)
      ? generatedAt.slice(0, 10)
      : null;

  return day === null
    ? `${EXPORT_FILE_STEM}.json`
    : `${EXPORT_FILE_STEM}-${day}.json`;
}

// ---------------------------------------------------------------------------
// Reading what came back
// ---------------------------------------------------------------------------

/**
 * What one read of the database handed back, and whether it worked at all.
 *
 * NOT GENERIC, on purpose: `rows` is `unknown` because this file is written to
 * be handed anything at all, so a type parameter would be a promise about the
 * shape of a row that nothing here checks.
 */
export type Read = {
  /** True when the query returned an error. Checked FIRST, everywhere. */
  failed: boolean;
  /** Whatever came back. `unknown` on purpose: this file is handed anything. */
  rows?: unknown;
};

/** The shape a section takes when its read did not answer. */
export const COULD_NOT_BE_READ = { could_not_be_read: true } as const;

/** And the shape a successful read of nothing takes, for the profile. */
export const NO_PROFILE_ROW = { there_is_no_profile_row: true } as const;

function rowsOf(read: Read | undefined): unknown[] {
  if (read === undefined || read.failed === true) return [];
  return Array.isArray(read.rows) ? read.rows : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function moment(value: unknown): string | null {
  // A timestamp arrives from PostgREST as a string. Nothing here parses it:
  // reformatting a moment is a chance to get a time zone wrong, and the value
  // Postgres gives is already unambiguous.
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function flag(value: unknown): boolean | null {
  // `=== true` and `=== false`, with everything else null. The same reasoning as
  // consentState: a column read back as the string "false" must not become a
  // yes, and an unknown must not become a no.
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

/**
 * Only the rows this person created.
 *
 * RULE 4 OF THE HEADER, AND THE ONE CHECK IN THIS FILE THAT GUARDS AGAINST A
 * MISTAKE RATHER THAN AGAINST A FAILURE. The SELECT policy on `tasks` returns
 * every task in every team the caller belongs to -- written by anybody -- so a
 * query that forgot `.eq("owner_id", ...)` would put a team mate's task into this
 * person's download, and every other check in this feature would still pass.
 *
 * A row with no `owner_id` at all is dropped too. That is not a theoretical
 * shape: PR 4 of docs/plan.md makes `tasks.owner_id` nullable, so that a task
 * written by somebody who has deleted their account can stay in its team as
 * "Former member". Such a row is somebody else's, and it is nobody's to export.
 */
export function ownRowsOnly(rows: unknown, userId: unknown): unknown[] {
  if (!Array.isArray(rows) || typeof userId !== "string" || userId === "") {
    return [];
  }

  return rows.filter((row) => {
    if (row === null || typeof row !== "object") return false;
    return (row as { owner_id?: unknown }).owner_id === userId;
  });
}

/**
 * What a storage listing says about each file, narrowed to the four things the
 * export carries.
 *
 * WHY THIS IS NOT `readFileList` FROM web/src/lib/attachments.ts, which does
 * almost the same job: that function's answer is `{ name, size }`, because that
 * is what the files panel on My tasks draws, and the export also wants WHEN a
 * file was uploaded (docs/deletion.md section 11.2). Widening `StoredFile`
 * would change what six existing checks in scripts/screen-state-check.mjs
 * compare, and AGENTS.md rule 20 makes changing a check the owner's call and
 * never the assistant's. So this narrows the same rows a second time, for a
 * caller that needs one more field, and leaves the screen's reader alone.
 *
 * The same two rows are dropped as there, for the same reasons: a row with no
 * usable name, and a row with a null `id`, which is Supabase's own marker for a
 * folder rather than a file.
 */
export type ExportFile = {
  name: string;
  size_bytes: number | null;
  uploaded_at: string | null;
};

export function readExportFiles(rows: unknown): ExportFile[] {
  if (!Array.isArray(rows)) return [];

  const out: ExportFile[] = [];

  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const record = row as {
      name?: unknown;
      id?: unknown;
      created_at?: unknown;
      metadata?: unknown;
    };

    const name = text(record.name);
    if (name === null) continue;
    // A folder, not a file.
    if (record.id === null || record.id === undefined) continue;

    const size = (record.metadata as { size?: unknown } | null)?.size;

    out.push({
      name,
      size_bytes:
        typeof size === "number" && Number.isFinite(size) && size >= 0
          ? size
          : null,
      uploaded_at: moment(record.created_at),
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Building the file
// ---------------------------------------------------------------------------

/**
 * Everything the route read, handed over for assembly.
 *
 * `userId` is here for one job only: `ownRowsOnly`. Nothing in the output
 * carries it.
 */
export type ExportInput = {
  /** The moment the file was built, as an ISO string. */
  generatedAt: string;
  /** The signed-in person's own id, for the own-rows guard. Never exported. */
  userId: string;

  /** The session's own user object: an address and when the account was made. */
  account: { failed: boolean; email?: unknown; created_at?: unknown };
  /** `profiles`, this person's own row -- or no row at all, which is ordinary. */
  profile: { failed: boolean; row?: unknown };
  /** `my_ai_suggestions()`, which always answers one row for the caller. */
  aiSuggestions: { failed: boolean; enabled?: unknown; changed_at?: unknown };

  /** `tasks`, filtered to this person in the query and again in `ownRowsOnly`. */
  tasks: Read;
  /** `teams` -- every team the SELECT policy returns, owned or belonged to. */
  teams: Read;
  /** `team_members`, this person's own rows, for `joined_at`. */
  memberships: Read;
  /** `invitations`, which only a team's owner may read at all. */
  invitations: Read;
  /** One storage listing per task, as `{ taskId, failed, rows }`. */
  files: {
    failed: boolean;
    listings?: ReadonlyArray<{ taskId: unknown; rows?: unknown }>;
    /** How many of this person's tasks were NOT listed, and why. */
    tasksNotListed?: number;
  };
};

/**
 * The file, as an ordinary object ready to be turned into JSON.
 *
 * READ THE HEADER'S FOUR RULES BEFORE CHANGING ANYTHING HERE. The one that is
 * easiest to break by accident is the second: a `...row` added below would put
 * every column a query happened to return into somebody's download.
 */
export function buildExport(input: ExportInput): Record<string, unknown> {
  const missing: string[] = [];
  const note = (section: ExportSection) => {
    missing.push(section);
    return COULD_NOT_BE_READ;
  };

  // ---- account -----------------------------------------------------------
  const account = input.account.failed
    ? note("account")
    : {
        email: text(input.account.email),
        created_at: moment(input.account.created_at),
      };

  // ---- profile -----------------------------------------------------------
  //
  // THREE SHAPES, NOT TWO, and the middle one is the reason: an account with no
  // profile row is the ORDINARY state of a new account -- there is no trigger on
  // `auth.users`, and `display_name` is `not null` with no default, so a row
  // appears the first time somebody saves a nickname (issue #207). "You have no
  // nickname" and "we could not read your nickname" are different facts and must
  // not arrive looking alike.
  const profileRow =
    input.profile.row !== null &&
    typeof input.profile.row === "object" &&
    input.profile.row !== undefined
      ? (input.profile.row as { display_name?: unknown; created_at?: unknown })
      : null;

  const profile = input.profile.failed
    ? note("profile")
    : profileRow === null
      ? NO_PROFILE_ROW
      : {
          nickname: text(profileRow.display_name),
          // DELIBERATELY NOT CALLED "when you set your nickname". `profiles`
          // has one `created_at`, which is when the ROW was made; nothing in
          // this app records a later change to a nickname, so a field named for
          // one would be a claim nothing keeps.
          profile_created_at: moment(profileRow.created_at),
        };

  // ---- the AI suggestions setting ----------------------------------------
  const aiSuggestions = input.aiSuggestions.failed
    ? note("ai_suggestions")
    : {
        // A WORD, NOT A BOOLEAN, so a reader cannot mistake a missing field for
        // "off". `null` here means the function answered something that is
        // neither true nor false, which consentState treats as unreadable.
        setting: ((value: boolean | null) =>
          value === null ? null : value ? "on" : "off")(
          flag(input.aiSuggestions.enabled),
        ),
        last_changed: moment(input.aiSuggestions.changed_at),
      };

  // ---- teams, which two sections and two others are built from -----------
  const teamRows = rowsOf(input.teams);
  const nameById = new Map<string, string>();
  for (const row of teamRows) {
    if (row === null || typeof row !== "object") continue;
    const id = text((row as { id?: unknown }).id);
    const name = text((row as { name?: unknown }).name);
    if (id !== null && name !== null) nameById.set(id, name);
  }

  const teamsYouOwn = input.teams.failed
    ? note("teams_you_own")
    : teamRows
        .filter((row) => {
          if (row === null || typeof row !== "object") return false;
          return (row as { owner_id?: unknown }).owner_id === input.userId;
        })
        .map((row) => {
          const team = row as { name?: unknown; created_at?: unknown };
          return { name: text(team.name), created_at: moment(team.created_at) };
        });

  // BOTH READS, OR NEITHER. The names come from `teams` and the joining date
  // from `team_members`, so one failure makes this section unknowable -- and an
  // unknowable section is said, not shortened.
  const teamsYouBelongTo =
    input.teams.failed || input.memberships.failed
      ? note("teams_you_belong_to")
      : rowsOf(input.memberships).map((row) => {
          const member = row as { team_id?: unknown; joined_at?: unknown };
          const id = text(member.team_id);
          return {
            // A NAME, NEVER THE ID (rule 3). Null when the teams read did not
            // carry that team, which no rule makes reachable -- the SELECT
            // policy on `teams` is `is_team_member(id)` -- and which is
            // therefore reported rather than guessed at.
            name: id === null ? null : (nameById.get(id) ?? null),
            joined_at: moment(member.joined_at),
          };
        });

  // ---- the invitations they sent -----------------------------------------
  //
  // decision 8a, 2026-10-12: YES, the invited ADDRESS is in the file. They
  // typed it, and My teams already shows it to them. It is the one address in
  // this file that is not the person's own, and it is here because leaving it
  // out would hide from somebody the one piece of other-people's data they
  // themselves put into this app.
  const invitations = input.invitations.failed
    ? note("invitations_you_sent")
    : rowsOf(input.invitations).map((row) => {
        const invitation = row as {
          team_id?: unknown;
          email?: unknown;
          status?: unknown;
          failure_code?: unknown;
          created_at?: unknown;
          expires_at?: unknown;
        };
        const id = text(invitation.team_id);
        return {
          team: id === null ? null : (nameById.get(id) ?? null),
          to: text(invitation.email),
          status: text(invitation.status),
          // The stored CODE, not a sentence. web/src/lib/teams.ts turns a code
          // into words for a screen; a file is for the person's own records and
          // the code is the thing this app actually holds.
          failure_code: text(invitation.failure_code),
          sent_at: moment(invitation.created_at),
          expires_at: moment(invitation.expires_at),
        };
      });

  // ---- the tasks, and the files on them ----------------------------------
  const ownTasks = input.tasks.failed
    ? []
    : ownRowsOnly(input.tasks.rows, input.userId);

  const titleByTaskId = new Map<string, string>();
  for (const row of ownTasks) {
    const task = row as { id?: unknown; title?: unknown };
    const id = text(task.id);
    const title = text(task.title);
    if (id !== null && title !== null) titleByTaskId.set(id, title);
  }

  const tasks = input.tasks.failed
    ? note("tasks")
    : ownTasks.map((row) => {
        const task = row as {
          title?: unknown;
          done?: unknown;
          created_at?: unknown;
          team_id?: unknown;
        };
        const id = text(task.team_id);
        return {
          title: text(task.title),
          done: flag(task.done),
          created_at: moment(task.created_at),
          // Null means personal, which is what a null `team_id` means in the
          // table. A name rather than an id, as everywhere else here.
          team: id === null ? null : (nameById.get(id) ?? null),
        };
      });

  // THE FILES SECTION DEPENDS ON THE TASKS SECTION, and not as a nicety: a
  // storage listing is BY PREFIX and a task's prefix is its id, so without the
  // tasks read there is nothing to list and no title to attach a file to.
  const files =
    input.files.failed || input.tasks.failed
      ? note("files_on_your_tasks")
      : (input.files.listings ?? []).flatMap((listing) => {
          const id = text(listing.taskId);
          const onTask = id === null ? null : (titleByTaskId.get(id) ?? null);
          return readExportFiles(listing.rows).map((file) => ({
            name: file.name,
            size_bytes: file.size_bytes,
            uploaded_at: file.uploaded_at,
            // The task's TITLE (rule 3), which is also the only thing in this
            // section that says which list a file belongs to.
            on_task: onTask,
          }));
        });

  // How many tasks were not listed for files, if the route stopped short. It is
  // a field rather than a silent truncation, because docs/plan.md's own rule
  // about this is that a bounded sweep says what it dropped.
  const notListed =
    typeof input.files.tasksNotListed === "number" &&
    Number.isFinite(input.files.tasksNotListed) &&
    input.files.tasksNotListed > 0
      ? input.files.tasksNotListed
      : 0;

  // ---- and the file ------------------------------------------------------
  //
  // THE THREE FIELDS THAT SAY HOW MUCH TO TRUST IT COME FIRST, before any data.
  // A reader who stops after three lines has still been told whether the file is
  // complete, which a flag at the bottom would not do.
  return {
    what_this_is: EXPORT_WHAT_THIS_IS,
    format_version: EXPORT_FORMAT_VERSION,
    generated_at: moment(input.generatedAt),
    complete: missing.length === 0 && notListed === 0,
    sections_that_could_not_be_read: missing,
    tasks_whose_files_were_not_listed: notListed,
    what_is_not_in_this_file: NOT_IN_THIS_FILE,

    account,
    profile,
    ai_suggestions: aiSuggestions,
    tasks,
    teams_you_own: teamsYouOwn,
    teams_you_belong_to: teamsYouBelongTo,
    invitations_you_sent: invitations,
    files_on_your_tasks: files,
  };
}

// ---------------------------------------------------------------------------
// What the screen says, and where it says it
// ---------------------------------------------------------------------------
//
// EVERY SENTENCE BELOW IS A ROW IN docs/claims.md, section 2f. That is the same
// discipline web/src/lib/consent.ts keeps about the consent screen, and for the
// same reason: each of these is a statement about somebody's own data, and a
// sentence nobody can point at the thing that makes it true is a sentence this
// project does not put on a screen.

/** Where the download comes from. A GET, so it needs no JavaScript. */
export const EXPORT_PATH = "/settings/export";

/** The heading on the card that holds it. */
export const EXPORT_HEADING = "Your data";

/** The link somebody presses. Not a button: a link, which a browser downloads. */
export const EXPORT_LINK_LABEL = "Download my data";

/**
 * The four sentences beside it.
 *
 * ORDERED AS SOMEBODY ASKS THE QUESTIONS: what is this, what is in it, what is
 * not, and what to be careful of. The last is the one that is not obvious and
 * is the reason docs/deletion.md section 11.4 calls the file "the first thing in
 * this app that assembles everything about one person into one artefact".
 */
export const EXPORT_WORDS: ReadonlyArray<string> = [
  "You can download what this app holds about you, as one file.",
  "It holds your tasks, your teams, the invitations you sent, your nickname and your AI suggestions setting, and a list of the files on your tasks.",
  "The file itself says what is deliberately not in it, and why — including two things nobody can see through this app, not even you.",
  "It gathers everything about you into one place, so anybody you send it to can read all of it. Please keep it carefully.",
];

/**
 * What a refused download says, keyed by a code this app chose.
 *
 * The route redirects to `/settings?problem=<code>` and the page draws the
 * sentence, which is the mechanism the consent setting already uses -- so a
 * refusal arrives as a banner on a screen rather than as a page of text a
 * browser decided how to render.
 *
 * NEITHER SENTENCE NAMES A COMPANY, A STATUS, A CODE OR A TABLE, and neither is
 * the raw answer of anything. The long note beside TEAM_ACTION_OUTCOMES in
 * web/src/lib/teams.ts is the full argument.
 */
export const EXPORT_REFUSED = "exportrefused";
export const EXPORT_UNKNOWN = "exportunknown";

export const EXPORT_REFUSAL_SENTENCES: Readonly<Record<string, string>> = {
  // A suspended account. The same sentence create-team gives a suspended
  // caller, for the same reason: it says what happened and claims nothing about
  // why. docs/plan.md's decision 7 of 2026-10-12 is that a suspended person
  // asks the owner rather than using the app.
  [EXPORT_REFUSED]: "You can't do that at the moment.",

  // AND AN UNKNOWN IS NOT A YES, which is the half worth having. If the app
  // cannot tell whether this account is active, it does not hand over a file --
  // because for a suspended person every policy returns nothing, so the file
  // would be EMPTY, and an empty file that says "everything we hold about you"
  // is the worst sentence this feature could produce. The same way round as
  // create-team counting teams, where an unknown is not a zero.
  [EXPORT_UNKNOWN]:
    "We could not check your account just now, so nothing was downloaded. Please try again.",
};

/**
 * The sentence for a code, or null.
 *
 * NULL FOR ANYTHING THIS APP DID NOT WRITE, which is what stops a crafted link
 * printing chosen words on this site. `/settings?problem=<anything>` is a URL
 * anybody can build, and the worst it can do is show one of the two sentences
 * above at a moment when it is not true. The same shape as `settingsSentence`
 * in web/src/lib/consent.ts, and the long note beside TEAM_ACTION_OUTCOMES in
 * web/src/lib/teams.ts is the full argument for why neither reads a message.
 */
export function exportRefusalSentence(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const name = code.trim();
  return Object.prototype.hasOwnProperty.call(EXPORT_REFUSAL_SENTENCES, name)
    ? EXPORT_REFUSAL_SENTENCES[name]
    : null;
}
