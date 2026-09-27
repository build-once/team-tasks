import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { TITLE_MAX, type Task } from "@/lib/tasks";

import { addTask, setDone } from "./actions";

export default async function MyTasksPage({
  searchParams,
}: PageProps<"/tasks">) {
  const { problem } = await searchParams;
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

  return (
    <main>
      <h1>My tasks</h1>

      <form action="/auth/signout" method="post">
        <button type="submit">Sign out</button>
      </form>

      {problem === "title" ? (
        <p role="alert">
          A task needs some text, and no more than {TITLE_MAX} characters.
        </p>
      ) : null}

      {problem === "save" ? (
        <p role="alert">That did not save. Please try again.</p>
      ) : null}

      {error ? (
        <p role="alert">
          Your tasks could not be loaded. If this database is new, the tasks
          table may not exist yet: the migration in <code>supabase/migrations</code>{" "}
          has not been applied.
        </p>
      ) : null}

      <form action={addTask}>
        <p>
          <label htmlFor="title">Add a task</label>
          <br />
          <input
            id="title"
            name="title"
            type="text"
            maxLength={TITLE_MAX}
            required
            placeholder="What needs doing? No personal details, please."
          />
        </p>
        <button type="submit">Add</button>
      </form>

      {tasks.length === 0 && !error ? (
        <p>Nothing on your list yet.</p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <li key={task.id}>
              <form action={setDone}>
                <input type="hidden" name="id" value={task.id} />
                <input
                  type="hidden"
                  name="done"
                  value={task.done ? "false" : "true"}
                />
                <button type="submit">
                  {task.done ? "Done — undo" : "Tick off"}
                </button>
              </form>
              <span>{task.done ? <s>{task.title}</s> : task.title}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
