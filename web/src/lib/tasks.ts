// One job on somebody's list, as the app reads it back from the database.
export type Task = {
  id: string;
  title: string;
  done: boolean;
  created_at: string;
};

// docs/plan.md keeps task text short on purpose, and asks people not to type
// personal details into it. The same limit is a check constraint in
// supabase/migrations, so the database refuses a longer one as well.
export const TITLE_MAX = 200;
