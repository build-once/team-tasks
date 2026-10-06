import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
import { rememberUserForErrorReports } from "@/lib/sentry-user";
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
  const { problem, added, moved, rename, confirm, move, filter } =
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

  // The chooser and the Show row only appear when there is a second list to
  // choose: with no teams, every task is personal and both would be controls for
  // deciding nothing. A failed teams read counts as no teams, which is why the
  // banner below says so -- the add form quietly offering no choice would
  // otherwise look like the person belonging to no team.
  const canChoose = !teamsError && teams.length > 0;

  return (
    <>
      <Header signedIn current="tasks" />

      <main className="page stack">
        <div className={styles.head}>
          <h1>My tasks</h1>
          {/* No count when there is nothing to count, and none when the list
              could not be loaded: a number beside an error would be a lie. */}
          {error || visible.length === 0 ? null : (
            <p className={styles.count}>
              {doneCount} of {visible.length}
              <span className="visually-hidden"> tasks</span> done
              <span className={styles.countWhat}>{showing}</span>
            </p>
          )}
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
                    null exactly as it did before teams could hold tasks. */}
                <option value="">Personal — only you</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
              <p className="hint" id="team_id-hint">
                A personal task is yours alone. Everyone in a team can see, tick
                and rename that team&apos;s tasks; only the person who added a
                task can delete it.
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
              <button className="btn btn--primary" type="submit">
                Add<span className={styles.taskWord}> task</span>
              </button>
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

        {teamsError ? (
          <Banner tone="bad" icon="alert">
            Your teams could not be loaded. New tasks can only be added as
            personal ones until that works, the list below cannot be narrowed to
            one team, and a team task is labelled {TEAM_NOT_SHOWN} instead of
            with its team&apos;s name.
          </Banner>
        ) : null}

        {filterMissed && !teamsError ? (
          <Banner tone="bad" icon="alert">
            That is not one of your lists, so every task you can see is shown.
          </Banner>
        ) : null}

        {error ? (
          <Banner tone="bad" icon="alert">
            Your tasks could not be loaded. If this database is new, the tasks
            table may not exist yet: the migration in supabase/migrations has
            not been applied.
          </Banner>
        ) : null}

        {canChoose && !error ? (
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

        {error ? null : tasks.length === 0 ? (
          <p className={styles.empty}>No tasks yet</p>
        ) : visible.length === 0 ? (
          // There are tasks, just none in this list. Said differently from "no
          // tasks yet" on purpose: the two are not the same news.
          <p className={styles.empty}>No tasks in this list yet</p>
        ) : (
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
                      <button className="btn btn--primary" type="submit">
                        Save
                      </button>
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
                        <button
                          className={`btn ${styles.danger}`}
                          type="submit"
                        >
                          Delete
                          <span className="visually-hidden"> {task.title}</span>
                        </button>
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
                        <option value="">Personal — only you</option>
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                      <button className="btn btn--primary" type="submit">
                        Move
                        <span className="visually-hidden"> {task.title}</span>
                      </button>
                      <Link
                        className="btn btn--quiet"
                        href={tasksPath({ filter: carried })}
                      >
                        Cancel
                      </Link>
                      <p className={`hint ${styles.moveHint}`}>
                        {stranded
                          ? "This task is in a team you are no longer in, so you cannot tick or rename it while it stays there. Moving it to Personal brings it back to you alone."
                          : "Everyone in a team can see, tick and rename that team's tasks. Moving a task to Personal takes it back to you alone."}
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
                        <button
                          className={styles.toggle}
                          type="submit"
                          aria-pressed={task.done}
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
                        </button>
                      </form>

                      <div className={styles.actions}>
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
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
