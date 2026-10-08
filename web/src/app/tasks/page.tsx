import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { ActButton } from "@/app/components/ActButton";
import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
import { LoadFailed } from "@/app/components/LoadFailed";
import { BUTTON_IDS } from "@/lib/buttons";
import {
  CONSENT_BUTTON_OFF,
  CONSENT_PATH,
  CONSENT_READ_FAILED,
  CONSENT_UNREADABLE,
  consentState,
  mayAskForSuggestions,
  type ConsentState,
} from "@/lib/consent";
import {
  SCREEN_EMPTY,
  SCREEN_ERROR,
  screenState,
  showsData,
} from "@/lib/screen-state";
import { rememberUserForErrorReports } from "@/lib/sentry-user";
import {
  SUGGESTIONS_DAILY_LIMIT,
  SUGGESTIONS_UNAVAILABLE,
  SUGGEST_DATA,
  SUGGEST_LIMIT,
  SUGGEST_UNAVAILABLE,
  suggestOutcome,
} from "@/lib/suggestions";
import { createClient } from "@/lib/supabase/server";
import {
  FILTER_ALL,
  FILTER_PERSONAL,
  TEAM_NOT_SHOWN,
  TITLE_MAX,
  readFilter,
  resolveFilter,
  taskTeam,
  tasksPath,
  type Task,
  type TaskTeam,
} from "@/lib/tasks";

import { addTask, deleteTask, moveTask, renameTask, setDone } from "./actions";
import styles from "./tasks.module.css";

function Tick() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

// One choice in the "Show" row above the list. A link rather than a control in a
// form, for the same reason Rename and Delete are links: this page is rendered
// on the server, and a link needs no JavaScript to work.
//
// `value` is null for "All tasks", which is what an absent filter means, so that
// choice goes back to the plain /tasks address rather than carrying ?filter=all
// around.
function ShowLink({
  value,
  active,
  children,
}: {
  value: string | null;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      className={`${styles.show} ${active ? styles.showOn : ""}`}
      href={tasksPath({ filter: value })}
      aria-current={active ? "true" : undefined}
    >
      {children}
    </Link>
  );
}

export default async function MyTasksPage({
  searchParams,
}: PageProps<"/tasks">) {
  const { problem, added, moved, rename, confirm, move, suggest, filter } =
    await searchParams;
  const supabase = await createClient();

  // src/proxy.ts already turns signed-out visitors away, but a page that shows
  // private data checks for itself too. getClaims() verifies the token's
  // signature every time; getSession() would trust a cookie anyone can forge.
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect("/login");

  // Used for one thing only: telling a task this person created from a task a
  // team mate created, which is what decides whether a delete control is drawn.
  // It is compared, never displayed.
  const userId = claimsData.claims.sub;

  // So an error report from the rest of this page carries who hit it, by id and
  // nothing else (issue #157). Placed after the signed-out redirect above, so
  // it only ever runs with a verified token in hand.
  rememberUserForErrorReports(userId);

  // The teams this person owns or belongs to, for two jobs on this page: the
  // chooser on the add form, and the label on every team task.
  //
  // No "where owner_id is me" and no membership filter: the select rule on teams
  // is is_team_member(id) since 20261002122203_team_rules.sql, so the database
  // returns exactly the teams a task of theirs may belong to. That is why the
  // chooser below can offer every row it gets and can never offer a team they are
  // not in -- the list is the database's answer, not this screen's guess.
  //
  // Two columns, which are the two this page uses (Lesson D17). Ordered by name,
  // because the chooser and the Show row are read by a person.
  const { data: teamData, error: teamsError } = await supabase
    .from("teams")
    .select("id, name")
    .order("name", { ascending: true });

  const teams = (teamData ?? []) as TaskTeam[];
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));

  // No "where owner_id is me" here either: the row-level security rules decide
  // what comes back. Since 20261002133637_tasks_join_teams.sql that is the
  // person's own tasks AND every task in a team they belong to, which is
  // docs/plan.md feature 5 -- and the reason this page now has to say which is
  // which (issue #83).
  //
  // team_id and owner_id are asked for because both are used: team_id becomes a
  // team name on the row, owner_id decides whether that row offers a delete.
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, done, created_at, team_id, owner_id")
    .order("created_at", { ascending: false });

  const tasks = (data ?? []) as Task[];

  // ---- THE AI HELPER (Build it 20, issue #183) ----------------------------
  //
  // `?suggest=<task id>` means somebody pressed Suggest subtasks on that task. The
  // page asks the helper HERE and draws the answer in the same request, which is the
  // whole reason it works this way: the model's words never travel through the
  // address bar, so nothing drawn below comes out of a query string.
  //
  // IT COSTS MONEY -- one metered request to Anthropic per ask (docs/costs.md) -- so
  // it is asked for as narrowly as the page can manage:
  //
  //   * ONLY WHEN THE ID NAMES A TASK THIS PAGE JUST READ. That is a stricter test
  //     than a shape check and it costs nothing extra: `tasks` is already in hand, and
  //     an id that is not in it was never going to get suggestions. The function
  //     checks the same thing properly, with the caller's own rights, and answers 404
  //     for anything else -- this is about not making a request that cannot succeed,
  //     not about security, which is the function's job and not a screen's.
  //   * A FAILED TASK READ ASKS NOTHING. `tasks` is empty when the read failed, so
  //     `find` answers undefined, so nothing is asked. That is the right way round: a
  //     database fault must not turn into a bill.
  //   * NOTHING ELSE ON THE PAGE CARRIES `suggest`. Every other link and form builds
  //     its address through tasksPath without it, so a tick, a rename, a move or a
  //     Cancel does not quietly ask again.
  //
  // WHAT IT STILL COSTS, said plainly because nobody should have to discover it: this
  // is a GET, so a reload asks again, and so does opening the same address twice. The
  // link that carries it sets prefetch={false}, which stops Next.js following it on
  // scroll or on hover -- but a person pressing F5 is a person spending another
  // request.
  //
  // WHAT BOUNDS THAT, SINCE BUILD IT 22 (issue #221): a daily count, in this project's
  // own database, and the function refuses once it is reached. So a reload still spends
  // one -- a daily limit does not stop the second ask, it stops the twenty-first -- but
  // it is no longer unbounded, which is what the sentence here used to say. Issue #184
  // stays open for the second ask, with what a fix must and must not change.
  const suggestTask =
    tasks.find((task) => task.id === String(suggest ?? "").trim().toLowerCase()) ??
    null;

  let suggestionsData: unknown = null;
  let suggestionsFailed = false;

  // The `code` off a FAILED answer's body, when it could be read. Build it 22: it is
  // the only thing that tells today's limit apart from the thirteen plumbing failures,
  // which all share one sentence. Read as an exact word by suggestOutcome and never
  // printed.
  let suggestionsCode: unknown = undefined;

  // ---- THE CONSENT SETTING (Build it 21, issue #211) ----------------------
  //
  // `null` until somebody presses the button, and that is a deliberate saving rather
  // than an oversight: when nobody has asked for suggestions the setting decides
  // nothing on this page, so there is no reason to spend a round trip reading it on
  // every view of My tasks. It is read at the moment it starts to matter.
  //
  // WHAT IT IS FOR HERE, and what it is NOT. The function checks this setting itself,
  // with the key in its hand, and refuses a caller whose setting is off whatever this
  // screen drew -- docs/plan.md: "A screen that hid the button would not be this, and
  // a screen is not where a rule lives." So this read is not the control. It is here
  // so that pressing the button when the setting is off gives the person a sentence
  // that says WHERE to switch it on, which the function cannot say: the function is
  // deployed separately from these pages and does not know their addresses.
  //
  // AND SO THAT THE FUNCTION IS NOT CALLED AT ALL, which issue #211 asks for in those
  // words. Nothing is spent and nothing is read on behalf of somebody who has not
  // consented -- not by the function, which would refuse, and not from here either.
  let consent: ConsentState | null = null;

  if (suggestTask !== null) {
    // THE RPC, not a select on profiles: no client role may read that column. See
    // web/src/lib/consent.ts, and issue #207 which found it. It takes no arguments, so
    // there is no way to ask about anybody else's setting.
    const { data: consentData, error: consentError } = await supabase.rpc(
      "my_ai_suggestions",
    );
    consent = consentState({
      failed: Boolean(consentError),
      data: consentData,
    });
  }

  // ONLY A SETTING KNOWN TO BE ON. An unreadable setting is not a yes, the same way
  // round as the function's own refusal -- offering the ask on an unreadable setting
  // would send somebody to a refusal they could not have predicted.
  const mayAsk = consent !== null && mayAskForSuggestions(consent);

  if (suggestTask !== null && mayAsk) {
    // ONLY THE TASK'S ID GOES IN THE BODY. Not its title -- the function reads that
    // itself, with the caller's own rights, which is what makes "a person can only
    // ask about a task they can see" true in the database rather than on this screen.
    // There is nothing here for a caller to tamper with to ask about somebody else's
    // task.
    //
    // NOTHING IS REPORTED TO SENTRY ON FAILURE, and that is deliberate. See the note
    // at the top of web/src/lib/suggestions.ts: the object the client throws carries
    // the request, the function has already reduced every failure to a fixed code,
    // and issue #183 says "Nothing from the title or the reply goes to error
    // reporting."
    const {
      data: answer,
      error: suggestError,
      response: suggestResponse,
    } = await supabase.functions.invoke("suggest-subtasks", {
      body: { task_id: suggestTask.id },
    });
    suggestionsData = answer;
    suggestionsFailed = Boolean(suggestError);

    // ---- THE CODE, AND ONLY THE CODE (Build it 22, issue #221) ------------
    //
    // On a non-2xx the installed client throws, so `data` is null and the body is
    // only reachable through the response -- `response` is the Response itself for
    // an HTTP or relay error, and undefined for a network error, which is the
    // installed client's own documented shape
    // (web/node_modules/@supabase/functions-js/dist/module/FunctionsClient.js).
    //
    // WHAT IS READ FROM IT, AND WHAT IS NOT. The `code` field, compared by
    // suggestOutcome with one value this app knows and never printed. NOT the
    // `error` message: the long note beside TEAM_ACTION_OUTCOMES in
    // web/src/lib/teams.ts says why a function's own message must not reach a
    // screen, and every word of it applies here. A body that cannot be read leaves
    // the code undefined, which falls through to the sentence this page has always
    // shown -- the safe direction.
    if (suggestionsFailed && suggestResponse) {
      try {
        const body = await suggestResponse.json();
        suggestionsCode = (body as { code?: unknown } | null)?.code;
      } catch {
        // Not JSON, or already read. The fixed sentence, as before.
      }
    }
  }

  // Three states, never an empty list. suggestOutcome puts `failed` ahead of the data
  // for the reason screenState puts it ahead of the row count, and answers
  // "unavailable" rather than handing this page nought suggestions to draw.
  //
  // `asked` IS FALSE WHEN THE SETTING IS NOT ON, which keeps the consent case out of
  // this decision entirely: it is not a failure of the helper, so it must not come out
  // as "Suggestions aren't available right now." It has its own panel below, with its
  // own sentence and a link to the setting.
  const suggestions = suggestOutcome({
    asked: suggestTask !== null && mayAsk,
    failed: suggestionsFailed,
    code: suggestionsCode,
    data: suggestionsData,
  });

  // Which list a suggestion would be added to: the parent task's, when that team is
  // one the page could read -- which means one this person belongs to, because the
  // select rule on teams is is_team_member(id). Otherwise Personal, by the same empty
  // value the add form's chooser uses for it.
  //
  // THE ALTERNATIVE WAS WORSE. Sending the parent's team_id regardless would, for a
  // task stranded in a team its creator has left, produce a 42501 and the "You cannot
  // do that" banner on a button the person had every reason to expect to work. This
  // way the subtask lands somewhere, and `addTask`'s own redirect names where.
  const suggestionList =
    suggestTask !== null &&
    suggestTask.team_id !== null &&
    teamNames.has(suggestTask.team_id)
      ? suggestTask.team_id
      : "";

  // Which list the person asked for. resolveFilter has thrown away anything that
  // is not "personal" or one of the team ids passed to it, so by this point the
  // only three things `active` can be are "all", "personal" and a team this
  // person really belongs to.
  const {
    active: activeFilter,
    carried,
    missed: filterMissed,
  } = resolveFilter(
    filter,
    teams.map((team) => team.id),
  );

  // Null for "all" and for "personal", because neither is a team's id.
  const activeTeam = teams.find((team) => team.id === activeFilter) ?? null;

  // Which list a task has just been moved into, for the message that says so.
  // A move carries the filter on unchanged, like every other action on a row, so
  // a task moved out of the list in front of the person simply disappears from
  // it -- and a disappearance with nothing said reads exactly like a loss.
  //
  // The value takes the same two forms a filter does, "personal" or a team's id,
  // so it is read back by the same function: anything else becomes null and goes
  // no further. What is drawn is then either fixed words or a team name this
  // page read from the database, never a value out of the address bar.
  const movedTo = readFilter(moved);
  const movedName =
    movedTo === null
      ? null
      : movedTo === FILTER_PERSONAL
        ? "Personal"
        : (teamNames.get(movedTo) ?? null);

  const visible =
    activeFilter === FILTER_ALL
      ? tasks
      : activeFilter === FILTER_PERSONAL
        ? tasks.filter((task) => task.team_id === null)
        : tasks.filter((task) => task.team_id === activeFilter);

  // Counted from the rows this page is about to draw, not from a second query,
  // so the number can never disagree with the list underneath it.
  //
  // THE RULE, written down because issue #83 asks for it in so many words: the
  // count is of what the filter is showing, no more and no less, and the line
  // beside it says which list that is. It is NOT "Alice's own tasks": a team's
  // list is a shared one, and "4 of 9 done in Tuesday crew" is the sentence the
  // organiser actually wants. Filter to Personal to count only your own.
  const doneCount = visible.filter((task) => task.done).length;

  const showing = activeTeam
    ? `in ${activeTeam.name}`
    : activeFilter === FILTER_PERSONAL
      ? "in your personal tasks"
      : "in all your lists";

  // ---- WHICH LOOK EACH READ GETS (Build it 19 rule 1) ---------------------
  //
  // Two reads on this page, so two answers, and both come from the one function in
  // web/src/lib/screen-state.ts rather than from a chain of ternaries down in the
  // JSX. What that function is for is the trap underneath both of these lines:
  // `data ?? []` turns a failed read into an empty array, so "your tasks could not
  // be loaded" and "you have no tasks" arrive here looking identical. Passing
  // `failed` separately is what keeps them apart, and screenState puts `failed`
  // ahead of the row count so no row count can overrule it.
  //
  // THE TASK LIST IS COUNTED AFTER FILTERING, which is what makes "no tasks in
  // this list yet" possible: `visible` is what is about to be drawn, so the look
  // and the list cannot disagree.
  const listState = screenState({
    failed: Boolean(error),
    rows: visible.length,
  });

  const teamsState = screenState({
    failed: Boolean(teamsError),
    rows: teams.length,
  });

  // The chooser and the Show row only appear when there is a second list to
  // choose: with no teams, every task is personal and both would be controls for
  // deciding nothing. A failed teams read is NOT no teams -- it is an unknown --
  // which is why this asks for the data look by name rather than counting rows,
  // and why the error look below says so out loud.
  const canChoose = showsData(teamsState);

  return (
    <>
      <Header signedIn current="tasks" account={claimsData.claims.email} />

      <main className="page stack">
        <div className={styles.head}>
          <h1>My tasks</h1>
          {/* No count when there is nothing to count, and none when the list
              could not be loaded: a number beside an error would be a lie. Asked
              of the look rather than of `error` and a length, so there is one
              place that decides and the heading cannot disagree with the list. */}
          {showsData(listState) ? (
            <p className={styles.count}>
              {doneCount} of {visible.length}
              <span className="visually-hidden"> tasks</span> done
              <span className={styles.countWhat}>{showing}</span>
            </p>
          ) : null}
        </div>

        <form className="card" action={addTask}>
          {/* So the list the person is looking at is the list they come back to.
              Every form on this page carries it. */}
          <input type="hidden" name="filter" value={carried ?? ""} />

          {canChoose ? (
            // Above the task text, so the tab order runs chooser, text, Add --
            // and so the choice is made before the thing being filed exists.
            <div>
              <label className="label" htmlFor="team_id">
                Which list
              </label>
              <select
                className="input"
                id="team_id"
                name="team_id"
                defaultValue=""
                aria-describedby="team_id-hint"
              >
                {/* Personal is the default, and its value is empty: the action
                    sends no team_id at all for it, so the row takes the column's
                    null exactly as it did before teams could hold tasks.

                    THE LABEL USED TO READ "Personal — only you" (issue #202). That
                    claim IS enforced against every request through the app -- the
                    select rule on tasks returns a row to its creator, or to a
                    member of its team when team_id is not null -- but it was wider
                    than the rule in one way the screen never mentioned: whoever
                    holds the Supabase dashboard can read every row in the table.
                    "Only you" meant "only you, of the people using this app".

                    The second half of that is now said out loud, in the hint below
                    rather than in this label: an option in a dropdown is a label,
                    not a paragraph, and the disclosure needs to be read rather than
                    buried in a list somebody is scrolling past. The hint is tied to
                    this chooser by aria-describedby, so a screen reader gets both
                    together. */}
                <option value="">
                  Personal — no one else on Team Tasks can see it.
                </option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <p className="hint" id="team_id-hint">
                Personal — no one else on Team Tasks can see it. The person who
                runs this app can access the database. Everyone in a team can
                see, tick and rename that team&apos;s tasks; only the person who
                added a task can delete it.
              </p>
            </div>
          ) : null}

          <div>
            <label className="label" htmlFor="title">
              Add a task
            </label>
            <div className={styles.addRow}>
              <input
                className="input"
                id="title"
                name="title"
                type="text"
                maxLength={TITLE_MAX}
                required
                placeholder="What needs doing?"
                aria-describedby="title-hint"
              />
              {/* Every submit button in this app carries its identifier, and the
                  action reads that rather than anything about the label (Build it
                  19 rule 6). This one is the clearest example of why: what it says
                  is "Add" on a phone and "Add task" on a laptop. */}
              <ActButton
                className="btn btn--primary"
                act={BUTTON_IDS.taskAdd}
              >
                Add<span className={styles.taskWord}> task</span>
              </ActButton>
            </div>
            <p className="hint" id="title-hint">
              Please don&apos;t put personal details in tasks.
            </p>
          </div>
        </form>

        {added ? (
          <Banner tone="ok" icon="check">
            Task added.
          </Banner>
        ) : null}

        {/* Named where it can be named. "Task moved." alone is the answer when
            the destination's name is not among the teams this page could read,
            which takes a failed teams query -- saying the name of a team the
            page could not read would be inventing one. */}
        {movedTo === null ? null : (
          <Banner tone="ok" icon="check">
            {movedName === null ? "Task moved." : `Task moved to ${movedName}.`}
          </Banner>
        )}

        {problem === "title" ? (
          <Banner tone="bad" icon="alert">
            A task needs some text, and no more than {TITLE_MAX} characters.
          </Banner>
        ) : null}

        {/* Says "nothing changed" rather than "nothing was added", because two
            forms can send it now: the add form and the Move to... chooser. Both
            mean the same thing -- the list named is not one of yours. */}
        {problem === "team" ? (
          <Banner tone="bad" icon="alert">
            That is not one of your lists, so nothing changed. Please choose
            Personal or one of your teams.
          </Banner>
        ) : null}

        {problem === "save" ? (
          <Banner tone="bad" icon="alert">
            That did not save. Please try again.
          </Banner>
        ) : null}

        {/* A post that carried no button identifier this page recognises (Build it
            19 rule 6). Not reachable from the screen -- every button here carries
            one -- so it takes a request made by hand, and the honest answer is
            that nothing happened. */}
        {problem === "button" ? (
          <Banner tone="bad" icon="alert">
            Nothing happened: that request did not come from a button on this
            page. Please use the buttons here.
          </Banner>
        ) : null}

        {/* A refusal, not a breakage: the database said "you may not", so
            "please try again" would be advice to repeat something that cannot
            work. Every sentence in this banner and the two below names a rule
            rather than a row -- nothing here says anything about a team, who is
            in it, or what a task says.

            What reaches this one: adding a task to a team you are not in,
            refused by the insert policy and by
            tasks_enforce_column_rules(). A refused move has its own message
            below, a refused tick or rename has its own message below that, and a
            refused DELETE reaches neither -- it matches no row rather than
            failing, which is the "delete" message further down. */}
        {problem === "refused" ? (
          <Banner tone="bad" icon="alert">
            You cannot do that. A task can only be added to a team you belong
            to.
          </Banner>
        ) : null}

        {/* A move the database refused. Two ways to earn it, and the sentence
            covers both without guessing which: the task was not yours to move,
            or the list it was aimed at is not one its creator belongs to. The
            screen draws the control only on your own tasks and offers only
            lists you are in, so this takes a request made by hand. */}
        {problem === "move" ? (
          <Banner tone="bad" icon="alert">
            That task was not moved. Only the person who created a task can move
            it, and only to Personal or to a team they belong to.
          </Banner>
        ) : null}

        {/* The stranded task (issue #91). The rule is real and the person cannot
            see it, so it is said in full, with the one step that undoes it --
            which is why "Move to..." had to exist before this message could be
            honest. */}
        {problem === "stranded" ? (
          <Banner tone="bad" icon="alert">
            That task is in a team you are no longer in, so it cannot be ticked
            or renamed while it stays there. Use Move to… on the task to bring
            it back to Personal, and you can tick and rename it again.
          </Banner>
        ) : null}

        {/* Nothing matched, on a move. Said separately from the rename version
            below so the sentence names the action the person actually took. */}
        {problem === "movegone" ? (
          <Banner tone="bad" icon="alert">
            That task was not moved. It may have been deleted already.
          </Banner>
        ) : null}

        {problem === "missing" ? (
          <Banner tone="bad" icon="alert">
            That task wasn&apos;t found, so nothing was renamed.
          </Banner>
        ) : null}

        {/* A tick that matched no row (Build it 19 rule 3). Before the tick read
            its row back, this was silent: the box simply came back as it was, with
            nothing said, which reads as a press that did not register. */}
        {problem === "tickgone" ? (
          <Banner tone="bad" icon="alert">
            That task was not changed. It may have been deleted already.
          </Banner>
        ) : null}

        {/* Deliberately not "that task no longer exists", which is what this used
            to say (issue #83). Nothing was deleted, and there are two reasons --
            it was somebody else's, or it had already gone -- which this page
            cannot tell apart. The likely one comes first and neither is claimed
            as fact. */}
        {problem === "delete" ? (
          <Banner tone="bad" icon="alert">
            That task was not deleted. Only the person who created a task can
            delete it — or it may have been deleted already.
          </Banner>
        ) : null}

        {/* THE ERROR LOOK for the teams read, with its Try again. It used to be a
            Banner and nothing else, so the only way out was the browser's reload
            button. The sentence is unchanged: it says what this costs the person
            rather than why the read failed, and no database message, code or
            status appears in it -- those go to error reporting. */}
        {teamsState === SCREEN_ERROR ? (
          <LoadFailed target="tasks" filter={carried}>
            Your teams could not be loaded. New tasks can only be added as
            personal ones until that works, the list below cannot be narrowed to
            one team, and a team task is labelled {TEAM_NOT_SHOWN} instead of
            with its team&apos;s name.
          </LoadFailed>
        ) : null}

        {filterMissed && teamsState !== SCREEN_ERROR ? (
          <Banner tone="bad" icon="alert">
            That is not one of your lists, so every task you can see is shown.
          </Banner>
        ) : null}

        {/* THE ERROR LOOK for the task list itself. Everything below is drawn only
            for the other two looks, so a failed read is never a list and never a
            count -- which is the one thing this page had wrong and the reason
            screenState exists. */}
        {listState === SCREEN_ERROR ? (
          <LoadFailed target="tasks" filter={carried}>
            Your tasks could not be loaded, so nothing below is a list of them.
            If this database is new, the tasks table may not exist yet: the
            migration in supabase/migrations has not been applied.
          </LoadFailed>
        ) : null}

        {canChoose && listState !== SCREEN_ERROR ? (
          <nav className={styles.shows} aria-label="Which tasks to show">
            <ShowLink value={null} active={activeFilter === FILTER_ALL}>
              All tasks
            </ShowLink>
            <ShowLink
              value={FILTER_PERSONAL}
              active={activeFilter === FILTER_PERSONAL}
            >
              Personal
            </ShowLink>
            {teams.map((team) => (
              <ShowLink
                key={team.id}
                value={team.id}
                active={activeFilter === team.id}
              >
                {team.name}
              </ShowLink>
            ))}
          </nav>
        ) : null}

        {/* THE EMPTY LOOK, and then the data look. The error look is above, drawn
            by LoadFailed, and this expression can no longer reach a list when the
            read failed: screenState answered SCREEN_ERROR, which is neither of the
            two branches here.
            Which sentence the empty look uses is a question about what is empty,
            not about whether the read worked: there are no tasks at all, or there
            are some and none of them is in this list. Said differently on purpose
            -- the two are not the same news. */}
        {listState === SCREEN_EMPTY ? (
          tasks.length === 0 ? (
            <p className={styles.empty}>No tasks yet</p>
          ) : (
            <p className={styles.empty}>No tasks in this list yet</p>
          )
        ) : !showsData(listState) ? null : (
          <ul className={styles.list}>
            {visible.map((task) => {
              // Only the person who created a task may delete it: the delete
              // policy on tasks is still owner-only, deliberately, so that an
              // organiser's list does not lose entries because somebody tidied
              // up (docs/plan.md feature 4). The control is drawn only for them,
              // rather than drawn for everybody and refused on use (issue #83).
              const mine = task.owner_id === userId;

              // A team task always says which team. Null means personal, and a
              // personal task is labelled with nothing, because the heading above
              // already says whose list this is. A task stranded in a team its
              // creator has left says so in place of a name -- taskTeam() is
              // where the argument about what a missing name may honestly be
              // called is written down.
              const { label: teamName, stranded } = taskTeam(task, {
                userId,
                teamNames,
                teamsFailed: Boolean(teamsError),
              });

              // Who is offered Move to..., and when. Its creator, as the
              // database has it: tasks_enforce_column_rules() refuses a team_id
              // change by anybody else, so drawing it on a team mate's task
              // would be drawing a control that was only ever going to be
              // refused (issue #83's lesson, applied again).
              //
              // AND only where there is somewhere to move the task to: a team
              // to choose, or -- for a task that is already in a team --
              // Personal. That second half is what keeps the way out of a
              // stranded task open for somebody who now belongs to no teams at
              // all, which is precisely the person issue #91 is about.
              const canMove = mine && (canChoose || task.team_id !== null);

              return (
                <li className={styles.item} key={task.id}>
                  {rename === task.id ? (
                    // Renaming: this row becomes a small form. Everything else in
                    // the list stays where it was. Every member of a team may
                    // rename that team's tasks, so this is offered on every row.
                    <form className={styles.editRow} action={renameTask}>
                      <input type="hidden" name="id" value={task.id} />
                      <input
                        type="hidden"
                        name="filter"
                        value={carried ?? ""}
                      />
                      <label
                        className="visually-hidden"
                        htmlFor={`rename-${task.id}`}
                      >
                        New name for this task
                      </label>
                      <input
                        className={`input ${styles.editInput}`}
                        id={`rename-${task.id}`}
                        name="title"
                        type="text"
                        defaultValue={task.title}
                        maxLength={TITLE_MAX}
                        required
                        autoFocus
                      />
                      <ActButton
                        className="btn btn--primary"
                        act={BUTTON_IDS.taskRename}
                      >
                        Save
                      </ActButton>
                      <Link
                        className="btn btn--quiet"
                        href={tasksPath({ filter: carried })}
                      >
                        Cancel
                      </Link>
                    </form>
                  ) : confirm === task.id && mine ? (
                    // Deleting is permanent, so it is asked for twice: once on
                    // the row, and once here. `mine` is checked again on purpose:
                    // ?confirm= arrives in the address bar, and without it a
                    // hand-typed link would draw a Delete button on a team mate's
                    // task that the database was only ever going to refuse.
                    <div className={styles.confirmRow}>
                      <p className={styles.confirmText}>Delete this task?</p>
                      <form action={deleteTask}>
                        <input type="hidden" name="id" value={task.id} />
                        <input
                          type="hidden"
                          name="filter"
                          value={carried ?? ""}
                        />
                        <ActButton
                          className={`btn ${styles.danger}`}
                          act={BUTTON_IDS.taskDelete}
                        >
                          Delete
                          <span className="visually-hidden"> {task.title}</span>
                        </ActButton>
                      </form>
                      <Link
                        className="btn btn--quiet"
                        href={tasksPath({ filter: carried })}
                      >
                        Cancel
                      </Link>
                    </div>
                  ) : move === task.id && canMove ? (
                    // Moving: the row becomes a chooser, built from the same
                    // teams the add form offers -- the rows the database let
                    // this page read, which is every team this person belongs to
                    // and no other. canMove is checked again here on purpose,
                    // for the same reason `mine` is checked on the delete
                    // confirmation: ?move= arrives in the address bar, and a
                    // hand-typed link must not draw a control on a team mate's
                    // task that the database was only ever going to refuse.
                    <form className={styles.editRow} action={moveTask}>
                      <input type="hidden" name="id" value={task.id} />
                      <input
                        type="hidden"
                        name="filter"
                        value={carried ?? ""}
                      />
                      <label
                        className="visually-hidden"
                        htmlFor={`move-${task.id}`}
                      >
                        Which list this task belongs in
                      </label>
                      {/* The list it is in already is the one selected, so
                          pressing Move without choosing changes nothing. A
                          stranded task has no such option to select -- its team
                          is not one of these -- so the chooser opens on
                          Personal, which is the move that frees it. */}
                      <select
                        className={`input ${styles.editInput}`}
                        id={`move-${task.id}`}
                        name="team_id"
                        defaultValue={task.team_id ?? ""}
                      >
                        {/* The same relabelling as the add form's chooser
                            (issue #202), for the same reason and with the same
                            split: the first sentence here, both sentences in the
                            hint below this form. */}
                        <option value="">
                          Personal — no one else on Team Tasks can see it.
                        </option>
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                      <ActButton
                        className="btn btn--primary"
                        act={BUTTON_IDS.taskMove}
                      >
                        Move
                        <span className="visually-hidden"> {task.title}</span>
                      </ActButton>
                      <Link
                        className="btn btn--quiet"
                        href={tasksPath({ filter: carried })}
                      >
                        Cancel
                      </Link>
                      <p className={`hint ${styles.moveHint}`}>
                        {/* "...back to you alone" was the same claim as the old
                            "Personal — only you" (issue #202), so both wordings get
                            the same two sentences. The stranded one keeps its own
                            first half: that message is about a rule the person
                            cannot see, and it is the only thing telling them how to
                            get out of it. */}
                        {stranded
                          ? "This task is in a team you are no longer in, so you cannot tick or rename it while it stays there. Moving it to Personal means no one else on Team Tasks can see it. The person who runs this app can access the database."
                          : "Everyone in a team can see, tick and rename that team's tasks. Moving a task to Personal means no one else on Team Tasks can see it. The person who runs this app can access the database."}
                      </p>
                    </form>
                  ) : (
                    <div className={styles.row}>
                      <form action={setDone}>
                        <input type="hidden" name="id" value={task.id} />
                        <input
                          type="hidden"
                          name="filter"
                          value={carried ?? ""}
                        />
                        <input
                          type="hidden"
                          name="done"
                          value={task.done ? "false" : "true"}
                        />
                        {/* The tick. Its whole label is a box and a task's text,
                            so there is no wording here for anything to act on
                            even if it wanted to -- which is why the identifier
                            matters as much on this button as on any. */}
                        <ActButton
                          className={styles.toggle}
                          ariaPressed={task.done}
                          act={BUTTON_IDS.taskDone}
                        >
                          <span
                            className={`${styles.box} ${task.done ? styles.boxOn : ""}`}
                          >
                            {task.done ? <Tick /> : null}
                          </span>
                          <span
                            className={`${styles.title} ${task.done ? styles.done : ""}`}
                          >
                            {task.title}
                          </span>
                          {teamName === null ? null : (
                            // Read out as "in team Tuesday crew", so somebody
                            // using a screen reader is told the same thing the
                            // chip says to somebody looking at it. A stranded
                            // task reads "in a team you have left", which is a
                            // sentence rather than a name, so it is not prefixed
                            // with "in team".
                            <span
                              className={`${styles.team} ${stranded ? styles.teamLeft : ""}`}
                            >
                              {stranded ? null : (
                                <span className="visually-hidden">in team </span>
                              )}
                              {teamName}
                            </span>
                          )}
                        </ActButton>
                      </form>

                      <div className={styles.actions}>
                        {/* THE AI HELPER (Build it 20, issue #183). A link, like
                            Rename, Move to… and Delete beside it, and for the same
                            reason every control on this page is one: the screen is
                            rendered on the server and a link needs no JavaScript.
                            Following it reloads this page with ?suggest= set, and the
                            page asks the helper and draws the answer in the same
                            request.

                            prefetch={false} IS NOT A TIDINESS SETTING. Next.js
                            prefetches a Link when it enters the viewport and again on
                            hover, and the installed version's own reference says of
                            this value: "Prefetching will never happen both on entering
                            the viewport and on hover"
                            (web/node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md).
                            Without it, scrolling past a task list would ask the AI
                            service once per task, on a workspace with a 5-dollar
                            monthly ceiling. It is the only link in this app where the
                            default would cost money.

                            Drawn on every task the person can see, because the plan
                            says "on a task the person can already see" and the
                            database has already decided which those are. A stranded
                            task is included on purpose: suggestions are reading, not
                            writing, and the Add button is what writes. */}
                        <Link
                          className={styles.action}
                          prefetch={false}
                          href={tasksPath({
                            filter: carried,
                            suggest: task.id,
                          })}
                        >
                          Suggest
                          <span className={styles.wideWord} aria-hidden="true">
                            {" "}
                            subtasks
                          </span>
                          <span className="visually-hidden">
                            {" "}
                            subtasks for {task.title}
                          </span>
                        </Link>
                        <Link
                          className={styles.action}
                          href={tasksPath({
                            filter: carried,
                            rename: task.id,
                          })}
                        >
                          Rename
                          <span className="visually-hidden"> {task.title}</span>
                        </Link>
                        {canMove ? (
                          <Link
                            className={styles.action}
                            href={tasksPath({
                              filter: carried,
                              move: task.id,
                            })}
                          >
                            {/* "Move" on a phone, "Move to…" where there is
                                room for it beside Rename and Delete -- the same
                                trick the Add task button uses. The ellipsis is
                                what says a chooser opens rather than something
                                happening at once, and it is hidden from a
                                screen reader, which gets the sentence below. */}
                            Move
                            <span className={styles.wideWord} aria-hidden="true">
                              {" "}
                              to…
                            </span>
                            <span className="visually-hidden">
                              {" "}
                              {task.title} to another list
                            </span>
                          </Link>
                        ) : null}
                        {mine ? (
                          <Link
                            className={styles.action}
                            href={tasksPath({
                              filter: carried,
                              confirm: task.id,
                            })}
                          >
                            Delete
                            <span className="visually-hidden">
                              {" "}
                              {task.title}
                            </span>
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* ---- THE SUGGESTIONS, for the one task that was asked about ----
                      Drawn UNDER the row rather than instead of it, unlike renaming,
                      deleting and moving: those three replace the row because they are
                      about changing it, and this one is about adding something beside
                      it. The task stays where it is, visible, while the person reads
                      what the helper offered for it.

                      Three states and never a fourth. web/src/lib/suggestions.ts
                      answers "unavailable" rather than handing this page an empty list,
                      so there is no branch here that could draw a heading with nothing
                      under it -- which is what issue #183's "never shows an empty list
                      as if it were a result" forbids.

                      AND SINCE BUILD IT 21 THERE IS ONE BRANCH IN FRONT OF ALL THREE:
                      the consent setting. It is first because it is not a failure of
                      the helper and must not be dressed as one -- "Suggestions aren't
                      available right now" would be false for somebody who can have
                      them the moment they switch a setting on. This branch is reached
                      WITHOUT the function having been called (issue #211 asks for
                      that), so nothing was read and nothing was sent. */}
                  {suggestTask?.id !== task.id ? null : !mayAsk ? (
                    <div className={styles.suggest}>
                      {/* TWO THINGS, because a sentence that said only the first would
                          read as a fault: that it is off and nothing went, and where
                          to change it. The function sends a sentence of its own for
                          this case and cannot name an address -- it is deployed
                          separately from these pages -- so the address is here.

                          AND A THIRD CASE, kept apart: a setting that could NOT BE
                          READ is not "off". Telling somebody their setting is off when
                          this page could not read it would be stating an unknown as a
                          fact about their own choice. */}
                      <Banner tone="bad" icon="alert">
                        {consent === CONSENT_UNREADABLE
                          ? CONSENT_READ_FAILED
                          : CONSENT_BUTTON_OFF}
                      </Banner>
                      <Link className="btn btn--quiet" href={CONSENT_PATH}>
                        Open Settings
                      </Link>
                      <Link
                        className="btn btn--quiet"
                        href={tasksPath({ filter: carried })}
                      >
                        Close
                      </Link>
                    </div>
                  ) : suggestions.state === SUGGEST_LIMIT ? (
                    <div className={styles.suggest}>
                      {/* TODAY'S LIMIT (Build it 22, issue #221), and it is kept APART
                          from the sentence below for the reason docs/plan.md gives:
                          the thirteen fixed codes all mean "something in this app's
                          plumbing went wrong, press it again later", and this one is a
                          fact about the person's own day that they can plan around.
                          Telling them suggestions "aren't available right now" would
                          invite the one action that is certainly useless here.

                          NO LINK TO SETTINGS, unlike the consent branch above: there
                          is nothing on any screen of this app that changes a limit,
                          and offering a button that could not help would be worse than
                          offering none. Just the sentence, and Close. */}
                      <Banner tone="bad" icon="alert">
                        {SUGGESTIONS_DAILY_LIMIT}
                      </Banner>
                      <Link
                        className="btn btn--quiet"
                        href={tasksPath({ filter: carried })}
                      >
                        Close
                      </Link>
                    </div>
                  ) : suggestions.state === SUGGEST_UNAVAILABLE ? (
                    <div className={styles.suggest}>
                      {/* ONE SENTENCE, for every one of the function's fixed-failure
                          codes. It says what this costs the person and nothing about
                          why: no status, no code, no company's name, and nothing the
                          service said. On production this is the honest answer rather
                          than an error -- there is no key there until docs/plan.md's
                          three preconditions are met, so suggestions genuinely are not
                          available. */}
                      <Banner tone="bad" icon="alert">
                        {SUGGESTIONS_UNAVAILABLE}
                      </Banner>
                      <Link
                        className="btn btn--quiet"
                        href={tasksPath({ filter: carried })}
                      >
                        Close
                      </Link>
                    </div>
                  ) : suggestions.state !== SUGGEST_DATA ? null : (
                    <div className={styles.suggest}>
                      <p className={styles.suggestHead}>
                        Suggested subtasks
                        <span className={styles.suggestHint}>
                          Nothing is saved until you press Add.
                        </span>
                      </p>
                      <ul className={styles.suggestList}>
                        {suggestions.suggestions.map((suggestion, index) => (
                          <li
                            className={styles.suggestItem}
                            key={`${task.id}-${index}`}
                          >
                            {/* ADD IS THE EXISTING ADD-TASK ACTION, which issue #183
                                asks for by name: "Add uses the existing add-task
                                action, rules and read-back." Same action, same button
                                identifier, same length check, same insert, same
                                read-back, same "Task added." banner. A suggestion
                                becomes a task through exactly the path a task somebody
                                typed goes through, which is what docs/plan.md promises:
                                "it becomes a task only when the person presses add --
                                through exactly the same rules, and the same limits, as
                                a task they typed themselves."

                                The suggestion travels in a hidden field, and it is
                                DRAWN beside the button as text, so what the person is
                                agreeing to is what gets sent. */}
                            <form className={styles.suggestRow} action={addTask}>
                              <input
                                type="hidden"
                                name="filter"
                                value={carried ?? ""}
                              />
                              <input type="hidden" name="title" value={suggestion} />
                              <input
                                type="hidden"
                                name="team_id"
                                value={suggestionList}
                              />
                              <span className={styles.suggestText}>{suggestion}</span>
                              <ActButton
                                className="btn btn--quiet"
                                act={BUTTON_IDS.taskAdd}
                              >
                                Add
                                <span className="visually-hidden"> {suggestion}</span>
                              </ActButton>
                            </form>
                          </li>
                        ))}
                      </ul>
                      <Link
                        className="btn btn--quiet"
                        href={tasksPath({ filter: carried })}
                      >
                        Close
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
