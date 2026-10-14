import { redirect } from "next/navigation";

import { ActButton } from "@/app/components/ActButton";
import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
import {
  CONFIRM_FIELD,
  CONFIRM_PHRASE,
  DELETE_BUTTON_LABEL,
  DELETE_HEADING,
  DELETE_IRREVERSIBLE,
  DELETE_TYPE_TO_CONFIRM,
  REQUEST_PATH,
  deleteSentence,
  deletionWarning,
} from "@/lib/account-deletion";
import { listFilesForExport } from "@/lib/attachment-store";
import { BUTTON_IDS } from "@/lib/buttons";
import {
  CONSENT_HOW_LONG,
  CONSENT_OFF_MEANS,
  CONSENT_ON,
  CONSENT_ONLY_YOU,
  CONSENT_READ_FAILED,
  CONSENT_SETTING_NAME,
  CONSENT_STARTS_OFF,
  CONSENT_UNREADABLE,
  CONSENT_WHAT_IS_SENT,
  CONSENT_WHO_GETS_IT,
  consentState,
  settingsSentence,
  settingsWentWell,
} from "@/lib/consent";
import {
  EXPORT_HEADING,
  EXPORT_LINK_LABEL,
  EXPORT_PATH,
  EXPORT_WORDS,
  exportRefusalSentence,
} from "@/lib/export-data";
import { rememberUserForErrorReports } from "@/lib/sentry-user";
import { createClient } from "@/lib/supabase/server";
import { DISPLAY_NAME_MAX } from "@/lib/teams";

import { deleteAccount, saveAiSuggestions } from "./actions";

/**
 * What a deletion would destroy, counted with the caller's own rights.
 *
 * THREE NULLS ARE POSSIBLE AND EACH ONE IS SAID. A count this app could not read
 * is `null`, never 0, and `deletionWarning` turns each into a sentence admitting
 * it — because a `0` in a warning about destruction is the one place this app
 * must not guess. Build it 19's rule, applied to the words somebody reads before
 * pressing the only button that cannot be undone.
 *
 * `tasks` IS THEIR OWN ROWS ONLY — `.eq("owner_id", userId)` — so a team mate's
 * task is never counted into what "will be deleted". The SELECT policy on
 * `tasks` is wider than that on purpose, so the filter is what narrows it.
 *
 * `files` IS COUNTED ONLY ON THE TASKS THAT ARE GOING, which is the coach's fix
 * of 2026-10-13 arriving in the warning as well as in the function. A task the
 * person created in SOMEBODY ELSE'S team survives them, and it keeps the files
 * other people attached to it — so counting those into "will be deleted" was
 * counting other people's files as this person's loss. What the deletion takes
 * from a surviving task is only what they uploaded, which nothing here can count
 * because a storage listing does not say who uploaded a file:
 * `DELETE_UPLOADS_ELSEWHERE` is the sentence that says so.
 *
 * `teams` is the NAMES of the teams they own. Not a count: decision 2 of
 * 2026-10-12 asks for every name, one per line, because a count alone is a
 * warning nobody can check.
 */
async function readWhatWouldGo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{
  tasks: number | null;
  files: number | null;
  teams: ReadonlyArray<string> | null;
}> {
  const tasksAnswer = await supabase
    .from("tasks")
    .select("id, team_id")
    .eq("owner_id", userId);

  const teamsAnswer = await supabase
    .from("teams")
    .select("id, name, owner_id")
    .eq("owner_id", userId);

  const ownedTeamIds = new Set(
    (teamsAnswer.data ?? [])
      .map((row) => (row as { id?: unknown }).id)
      .filter((id): id is string => typeof id === "string" && id !== ""),
  );

  // THE TASKS THAT ARE ACTUALLY GOING: personal, or in a team this person owns.
  // The same rule `tasksToDelete` and `folderPlan` use in the function, and the
  // reason the file count is taken over these and not over every task they
  // created.
  //
  // If the TEAMS read failed, this app does not know which of their team tasks
  // are in a team they own -- so it counts none of them rather than guessing,
  // and the sentence about teams already says the read failed.
  const doomedTaskIds = (tasksAnswer.data ?? [])
    .filter((row) => {
      const teamId = (row as { team_id?: unknown }).team_id;
      if (teamId === null || teamId === undefined) return true;
      return typeof teamId === "string" && ownedTeamIds.has(teamId);
    })
    .map((row) => (row as { id?: unknown }).id)
    .filter((id): id is string => typeof id === "string" && id !== "");

  // Only when the task read worked: a file count over a list this app could not
  // read would be a number about nothing.
  const files = tasksAnswer.error
    ? null
    : await listFilesForExport(supabase, doomedTaskIds);

  return {
    // THE TASK COUNT IS OF THE TASKS BEING DELETED, not of every task they
    // created -- because the sentence says "will be deleted" and the ones in
    // somebody else's team will not be. They stay as "Former member", which
    // `DELETE_WHAT_STAYS` is the sentence for.
    //
    // AND IT IS NULL IF EITHER READ FAILED, including the TEAMS read: without
    // the owned team ids this app cannot tell a task in a team of theirs from a
    // task in somebody else's, so the count would be an undercount dressed as a
    // fact. An unknown is said, never guessed at.
    tasks: tasksAnswer.error || teamsAnswer.error ? null : doomedTaskIds.length,
    files:
      files === null || files.failed
        ? null
        : files.listings.reduce(
            (total, listing) =>
              total + (Array.isArray(listing.rows) ? listing.rows.length : 0),
            0,
          ),
    teams: teamsAnswer.error
      ? null
      : (teamsAnswer.data ?? [])
          .map((row) => (row as { name?: unknown }).name)
          .filter((name): name is string => typeof name === "string" && name !== ""),
  };
}

// Settings -- today it holds exactly one thing, and that one thing is the switch that
// decides whether anybody's task title leaves this project.
//
// Build it 21 part 2b, issue #211. docs/plan.md, "AI suggestions -- the consent
// setting", is the agreed description of everything this page says.
//
// WHY A PAGE OF ITS OWN, rather than a box on My teams beside the nickname. Because
// what it is for is to be FOUND. docs/plan.md's third precondition for installing the
// production key is a privacy page, and its reason applies to the switch as well: "A
// setting is not consent if the person switching it on cannot find out what it sends."
// A consent control at the bottom of a page about teams is a control nobody meets
// until they are looking for it.
//
// WHAT THIS PAGE IS NOT. It is not the thing that stops anything being sent.
// suggest-subtasks checks the setting for itself, with the key in its hand, and
// refuses a caller whose setting is off whatever any screen drew -- see
// web/src/lib/consent.ts's header, and docs/plan.md: "A screen that hid the button
// would not be this, and a screen is not where a rule lives."
//
// THERE IS NO PRIVACY PAGE YET, and this page is not one. It says what Suggest
// subtasks sends, because a person switching that on needs to know -- and it says
// nothing about the rest of what this app holds, which is what issue #204 is for and
// what docs/plan.md names as a release gate for the production key.

export default async function SettingsPage({
  searchParams,
}: PageProps<"/settings">) {
  const { saved, problem, delete: wantsDelete } = await searchParams;
  const supabase = await createClient();

  // src/proxy.ts already turns signed-out visitors away, but a page that shows a
  // person's own setting checks for itself too. getClaims() verifies the token's
  // signature every time; getSession() would trust a cookie anyone can forge.
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect("/login");

  const userId = claimsData.claims.sub;
  rememberUserForErrorReports(userId);

  // ---- The setting, through the function and never through a select ------
  //
  // `public.my_ai_suggestions()`. No client role holds SELECT on
  // `profiles.ai_suggestions_enabled` -- that is how
  // 20261007204900_ai_suggestions_consent.sql stops a team mate reading it through the
  // existing "your team mates' profiles" policy -- so an ordinary select is refused
  // with 42501, for this person's own row, every time. Issue #207 found that before
  // this page existed.
  //
  // IT TAKES NO ARGUMENTS, which is the property worth noticing: who is asking comes
  // from `auth.uid()` inside the function's own body, so there is no parameter here
  // that could be pointed at somebody else's setting.
  const { data: consentData, error: consentError } = await supabase.rpc(
    "my_ai_suggestions",
  );

  // Three states, and the third is never drawn as either of the other two: a read that
  // failed is not "off". See consentState.
  const state = consentState({
    failed: Boolean(consentError),
    data: consentData,
  });

  // ---- Is there a profile row at all? -----------------------------------
  //
  // NAMED COLUMNS, NEVER A STAR. After the consent migration a `select *` on this
  // table by a signed-in caller fails outright, because the table-level SELECT was
  // revoked and given back column by column. The coach's review of PR #210 put it in
  // those words, and this is the first new read written since.
  //
  // WHY THIS PAGE NEEDS TO KNOW. A person with no profile row has nothing to write the
  // setting on: `UPDATE 0`, silently, and `display_name` is `not null` with no default
  // so a row cannot be created without a nickname. Issue #211 asks that such a person
  // can still switch the setting on, so the form below carries a nickname box for
  // them, and settings/actions.ts creates the row and then writes the setting.
  //
  // maybeSingle() because there is at most one row -- user_id is the primary key -- and
  // because "no row yet" is an ordinary answer rather than an error.
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();

  const profile = (profileData ?? null) as { display_name: string } | null;

  // A FAILED PROFILE READ IS NOT "NO PROFILE ROW", and this is the same trap as
  // `data ?? []` one page over: both arrive here as a null. So the nickname box is
  // drawn when the read SUCCEEDED and found nothing -- not when it failed, where the
  // page says it could not tell instead.
  const profileUnknown = Boolean(profileError);
  const needsNickname = !profileUnknown && profile === null;

  // TWO TABLES, ASKED IN ORDER, and neither of them ever reads a message.
  //
  // The consent table is this page's own; the export's two refusals live in
  // web/src/lib/export-data.ts because they are about the download rather than
  // about the setting. Both answer null for a code this app did not write, which
  // is what stops a crafted `?problem=` printing chosen words on this site.
  const outcome =
    settingsSentence(saved ?? problem) ??
    exportRefusalSentence(problem) ??
    deleteSentence(problem);
  const outcomeIsGood = settingsWentWell(saved);

  // ---- What a deletion would destroy, read ONLY when somebody asks ------
  //
  // `?delete=1` IS THE CONFIRMATION STEP, and it is also what keeps this page
  // cheap. Counting the files means one storage listing PER TASK -- a listing is
  // by prefix and a task's prefix is its id (issue #244) -- so doing it on every
  // visit to Settings would make the slowest page in the app out of the one
  // nobody is in a hurry on. Nobody is shown a warning they did not ask for, and
  // nobody pays for one.
  //
  // The counts are read with the CALLER'S OWN RIGHTS, like everything else here.
  const deletion = wantsDelete === "1" ? await readWhatWouldGo(supabase, userId) : null;

  return (
    <>
      <Header signedIn current="settings" account={claimsData.claims.email} />

      <main className="page stack">
        <h1>Settings</h1>

        {outcome === null ? null : (
          <Banner
            tone={outcomeIsGood ? "ok" : "bad"}
            icon={outcomeIsGood ? "check" : "alert"}
          >
            {outcome}
          </Banner>
        )}

        <form className="card" action={saveAiSuggestions}>
          <h2>{CONSENT_SETTING_NAME}</h2>

          {/* WHAT IT SENDS, TO WHOM, AND WHAT OFF DOES -- beside the switch rather
              than behind a link, because this is the only moment anybody is deciding.
              Every sentence is docs/plan.md's, narrowed; each one is a row in
              docs/claims.md. They are drawn in the order somebody asks the questions:
              what goes, who gets it, how long they keep it, what off does, where it
              starts, and who else can touch it. */}
          <p className="hint">{CONSENT_WHAT_IS_SENT}</p>
          <p className="hint">{CONSENT_WHO_GETS_IT}</p>
          <p className="hint">{CONSENT_HOW_LONG}</p>
          <p className="hint">{CONSENT_OFF_MEANS}</p>
          <p className="hint">{CONSENT_STARTS_OFF}</p>
          <p className="hint">{CONSENT_ONLY_YOU}</p>

          {/* THE SWITCH. A checkbox, which needs no JavaScript: this page is rendered
              on the server and the form posts. An unchecked box submits no field at
              all, so "off" arrives as an absence, which is the one shape nothing can
              forge into a yes.

              defaultChecked IS NOT DRAWN WHEN THE SETTING COULD NOT BE READ, and that
              is the whole of the unreadable state on this page: an unchecked box on a
              failed read would say "you have not switched this on", which is a claim
              this page cannot make. So the box is left unchecked AND the sentence
              below says the setting could not be read, so the box is not an answer. */}
          <div>
            <label className="label" htmlFor="ai_suggestions">
              <input
                id="ai_suggestions"
                name="ai_suggestions"
                type="checkbox"
                value="on"
                defaultChecked={state === CONSENT_ON}
                aria-describedby="ai_suggestions-hint"
              />{" "}
              Let me ask for AI suggestions on my tasks
            </label>

            <p className="hint" id="ai_suggestions-hint">
              {state === CONSENT_UNREADABLE
                ? CONSENT_READ_FAILED
                : state === CONSENT_ON
                  ? "This is on. Suggest subtasks will send a task's title when you press it."
                  : "This is off. Nothing of yours is being sent."}
            </p>
          </div>

          {/* THE NICKNAME, only for somebody who has no profile row (issue #207).
              Said rather than left to look like a fault: without a row there is
              nothing for the setting to be stored on, and that is not an artefact of
              this feature -- a profile row has always needed a nickname. */}
          {needsNickname ? (
            <div>
              <label className="label" htmlFor="display_name">
                Your nickname
              </label>
              <input
                className="input"
                id="display_name"
                name="display_name"
                type="text"
                maxLength={DISPLAY_NAME_MAX}
                placeholder="Carol"
                aria-describedby="display_name-hint"
              />
              <p className="hint" id="display_name-hint">
                You have not set a nickname yet, and this setting is stored on your
                profile — so switching it on needs one. A nickname of up to{" "}
                {DISPLAY_NAME_MAX} characters, shown to your team mates. Please not
                your full name.
              </p>
            </div>
          ) : null}

          {profileUnknown ? (
            <Banner tone="bad" icon="alert">
              Your profile could not be read, so this page cannot tell whether you have
              set a nickname. Saving will still work if you have one.
            </Banner>
          ) : null}

          <ActButton
            className="btn btn--primary"
            act={BUTTON_IDS.aiSuggestionsSave}
          >
            Save
          </ActButton>
        </form>

        {/* No Try again button here, and that is deliberate rather than an omission.
            LoadFailed posts a fixed identifier to a redirect table (RETRY_TARGETS in
            web/src/lib/screen-state.ts) and this page is not in it; adding it would be
            a change to the one table that stops a Try again being redirected anywhere
            a request asked for. A plain link with a literal address does the same job
            and needs no table.

            IT IS ALSO AN INCONSISTENCY, and issue #212 holds it along with the other
            two things about this page that only a browser can settle: every other
            failed read in this app draws a button, and whether a link here reads as a
            mistake is not a question any check in this repository can answer. */}
        {state === CONSENT_UNREADABLE ? (
          <p className="hint">
            <a href="/settings">Open this page again</a> to try reading the setting
            once more.
          </p>
        ) : null}

        {/* YOUR DATA -- Build it 26, PR 3. docs/deletion.md section 11.

            A LINK AND NOT A BUTTON, which is the whole reason the export is a
            route handler rather than a server action: an ordinary GET answering
            with a Content-Disposition header is a download a browser performs
            with NO JAVASCRIPT. Attaching a file is the one thing in this app
            that needs any, and docs/architecture.md records that as a cost.

            EVERY SENTENCE COMES FROM web/src/lib/export-data.ts, and this card
            holds none of its own -- the same shape as the consent card above and
            as the two legal pages, and each one is a row in docs/claims.md
            section 2f.

            THE FOURTH SENTENCE IS THE ONE THAT IS NOT OBVIOUS. Every row in the
            file is something this person can already read on a screen today;
            what is new is that they are gathered into one artefact that can be
            forwarded. docs/deletion.md section 11.4 says so in those terms. */}
        <section className="card">
          <h2>{EXPORT_HEADING}</h2>

          {EXPORT_WORDS.map((sentence) => (
            <p className="hint" key={sentence}>
              {sentence}
            </p>
          ))}

          {/* btn--quiet rather than btn--primary: the primary action on this
              page is Save, above, and a page with two green buttons on it has
              no primary action. `.btn` alone would be nearly invisible on an
              anchor -- it sets a transparent border and no background, and the
              only other `.btn` in this app without a variant is on a <button>,
              which a browser gives a background of its own. */}
          <p>
            <a className="btn btn--quiet" href={EXPORT_PATH} download>
              {EXPORT_LINK_LABEL}
            </a>
          </p>
        </section>

        {/* DELETE MY ACCOUNT -- Build it 26, and the only irreversible thing in
            this app.

            TWO STEPS, which is the book's "clear confirmation step": this card
            draws a link, and `?delete=1` draws the warning, the typed box and
            the button. Nobody meets a destructive button by scrolling.

            EVERY SENTENCE COMES FROM web/src/lib/account-deletion.ts, and the
            counts in them are this person's own rows read a moment ago. A count
            this app could not read says so rather than drawing a 0 -- which is
            Build it 19's rule applied to the sentence somebody reads before
            pressing the one button that cannot be undone. */}
        <section className="card">
          <h2>{DELETE_HEADING}</h2>

          {deletion === null ? (
            <>
              <p className="hint">{DELETE_IRREVERSIBLE}</p>
              <p>
                <a className="btn btn--quiet" href="/settings?delete=1">
                  {DELETE_HEADING}…
                </a>
              </p>
            </>
          ) : (
            <form action={deleteAccount}>
              {deletionWarning(deletion).map((sentence) => (
                <p className="hint" key={sentence}>
                  {sentence}
                </p>
              ))}

              {/* THE TEAMS, BY NAME, one per line -- decision 2 of 2026-10-12,
                  and the reason is that "a deletion that names nothing is a
                  deletion nobody can consent to". A count alone would be a
                  warning nobody could check.

                  AND NOT THE MEMBERS. docs/deletion.md section 5: "It must not
                  name the other members, and it must not name anybody's
                  address." */}
              {deletion.teams !== null && deletion.teams.length > 0 ? (
                <ul>
                  {deletion.teams.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              ) : null}

              <div>
                <label className="label" htmlFor={CONFIRM_FIELD}>
                  {DELETE_TYPE_TO_CONFIRM}
                </label>
                <input
                  className="input"
                  id={CONFIRM_FIELD}
                  name={CONFIRM_FIELD}
                  type="text"
                  autoComplete="off"
                  placeholder={CONFIRM_PHRASE}
                />
              </div>

              {/* btn--primary is the wrong tone for this and there is no
                  destructive variant in globals.css, so it stays quiet rather
                  than inviting. The guard is the typed phrase, not the colour --
                  and the function checks that phrase again for itself. */}
              <ActButton className="btn btn--quiet" act={BUTTON_IDS.accountDelete}>
                {DELETE_BUTTON_LABEL}
              </ActButton>

              <p className="hint">
                Changed your mind? <a href="/settings">Go back</a>.
              </p>
            </form>
          )}

          <p className="hint">
            If you cannot sign in, <a href={REQUEST_PATH}>ask for your account to be
            deleted</a> instead.
          </p>
        </section>
      </main>
    </>
  );
}
