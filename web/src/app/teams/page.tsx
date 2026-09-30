import { redirect } from "next/navigation";

import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
import { createClient } from "@/lib/supabase/server";
import { MAX_TEAMS_PER_OWNER, NAME_MAX, type Team } from "@/lib/teams";

import { createTeam } from "./actions";

export default async function MyTeamsPage({
  searchParams,
}: PageProps<"/teams">) {
  const { problem, created, error: errorParam } = await searchParams;
  const supabase = await createClient();

  // src/proxy.ts already turns signed-out visitors away, but a page that shows
  // private data checks for itself too. getClaims() verifies the token's
  // signature every time; getSession() would trust a cookie anyone can forge.
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect("/login");

  // No "where owner_id is me" here: the select rule on teams decides what comes
  // back, in the database rather than in this screen.
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  const teams = (data ?? []) as Team[];

  // The message from create-team, passed through the URL by the action. It is
  // our own text, and React escapes it, so it cannot become markup. It is still
  // worth knowing that anything in a query string arrived from whoever opened
  // the link: treat it as something to display, never as something to trust.
  const failure =
    typeof errorParam === "string" && errorParam.trim() !== ""
      ? errorParam
      : null;

  // Whether this person is already at the limit, used only to show a note. The
  // form stays visible either way.
  //
  // An earlier version hid the form at the limit. That was a mistake worth
  // naming: it meant the only thing saying "no" was this screen, the function's
  // refusal could never be seen, and so the check that actually protects the
  // limit was never exercised by anybody using the app. A guard nobody can
  // trigger is a guard nobody knows is broken. The function is the thing that
  // refuses; this note just warns first.
  const atLimit = !error && teams.length >= MAX_TEAMS_PER_OWNER;

  return (
    <>
      <Header signedIn current="teams" />

      <main className="page stack">
        <h1>My teams</h1>

        {atLimit ? (
          // A warning, not a gate. No advice to delete a team: there is no way
          // to delete one, so telling somebody to would send them looking for a
          // button that does not exist.
          <p className="hint">You own {teams.length} teams, the most allowed.</p>
        ) : null}

        <form className="card" action={createTeam}>
          <div>
            <label className="label" htmlFor="name">
              Create team
            </label>
            <input
              className="input"
              id="name"
              name="name"
              type="text"
              maxLength={NAME_MAX}
              required
              placeholder="Tuesday crew"
              aria-describedby="name-hint"
            />
            <p className="hint" id="name-hint">
              Up to {NAME_MAX} characters. Please pick a name that does not
              identify the members.
            </p>
            <button className="btn btn--primary" type="submit">
              Create team
            </button>
          </div>
        </form>

        {created ? (
          <Banner tone="ok" icon="check">
            Team created.
          </Banner>
        ) : null}

        {problem === "name" ? (
          <Banner tone="bad" icon="alert">
            A team needs a name, and no more than {NAME_MAX} characters.
          </Banner>
        ) : null}

        {failure ? (
          <Banner tone="bad" icon="alert">
            {failure}
          </Banner>
        ) : null}

        {error ? (
          <Banner tone="bad" icon="alert">
            Your teams could not be loaded. If this database is new, the teams
            table may not exist yet: the migration in supabase/migrations has
            not been applied.
          </Banner>
        ) : null}

        {teams.length === 0 && !error ? (
          <p className="hint">No teams yet</p>
        ) : (
          <ul className="stack">
            {teams.map((team) => (
              <li key={team.id}>{team.name}</li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
