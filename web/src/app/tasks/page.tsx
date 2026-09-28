import { redirect } from "next/navigation";

import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
import { createClient } from "@/lib/supabase/server";
import { TITLE_MAX, type Task } from "@/lib/tasks";

import { addTask, setDone } from "./actions";
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

export default async function MyTasksPage({
  searchParams,
}: PageProps<"/tasks">) {
  const { problem, added } = await searchParams;
  const supabase = await createClient();

  // src/proxy.ts already turns signed-out visitors away, but a page that shows
  // private data checks for itself too. getClaims() verifies the token's
  // signature every time; getSession() would trust a cookie anyone can forge.
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect("/login");

  // No "where owner_id is me" here: the row-level security rules decide what
  // comes back, in the database rather than in this screen.
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, done, created_at")
    .order("created_at", { ascending: false });

  const tasks = (data ?? []) as Task[];
  const left = tasks.filter((task) => !task.done).length;

  return (
    <>
      <Header signedIn />

      <main className="page stack">
        <div className={styles.head}>
          <h1>My tasks</h1>
          {error ? null : (
            <p className={styles.count}>
              {left} left
              <span className="visually-hidden"> to do</span>
            </p>
          )}
        </div>

        <form className="card" action={addTask}>
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

        {problem === "title" ? (
          <Banner tone="bad" icon="alert">
            A task needs some text, and no more than {TITLE_MAX} characters.
          </Banner>
        ) : null}

        {problem === "save" ? (
          <Banner tone="bad" icon="alert">
            That did not save. Please try again.
          </Banner>
        ) : null}

        {error ? (
          <Banner tone="bad" icon="alert">
            Your tasks could not be loaded. If this database is new, the tasks
            table may not exist yet: the migration in supabase/migrations has
            not been applied.
          </Banner>
        ) : null}

        {tasks.length === 0 && !error ? (
          <p className={styles.empty}>Nothing on your list yet.</p>
        ) : (
          <ul className={styles.list}>
            {tasks.map((task) => (
              <li className={styles.item} key={task.id}>
                <form action={setDone}>
                  <input type="hidden" name="id" value={task.id} />
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
                    <span className={task.done ? styles.done : undefined}>
                      {task.title}
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
