import { redirect } from "next/navigation";

import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
import { createClient } from "@/lib/supabase/server";
import {
  EMAIL_MAX,
  INVITATION_DAYS,
  MAX_PENDING_INVITATIONS,
  MAX_TEAMS_PER_OWNER,
  NAME_MAX,
  type Invitation,
  type Team,
} from "@/lib/teams";

import { createTeam, inviteMember } from "./actions";

// An expiry date a person can read, in the one format this app uses. Dates come
// back as ISO strings; en-GB gives "3 October 2026" rather than a US ordering
// that a UK volunteer would misread.
function expiryLabel(iso: string) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "unknown";
  return when.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function MyTeamsPage({
  searchParams,
}: PageProps<"/teams">) {
  const {
    problem,
    created,
    invited,
    joined,
    error: errorParam,
  } = await searchParams;
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

  // Pending invitations for the teams this person OWNS.
  //
  // No "where team_id in (my teams)" and no owner check here: the select policy
  // on invitations only returns rows whose team's owner_id is the caller, so a
  // member of somebody else's team gets nothing back. That is the database
  // deciding, not this screen -- and it is what keeps an invited person's
  // address away from the rest of the team (docs/plan.md).
  //
  // Filtered to genuinely pending: not accepted, and not past its expiry. The
  // same definition invite-member counts against for the 20 limit, so the list
  // on screen and the limit cannot disagree.
  const nowIso = new Date().toISOString();
  const { data: inviteData, error: inviteError } = await supabase
    .from("invitations")
    .select("id, team_id, email, expires_at")
    .is("accepted_at", null)
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: true });

  const invitations = (inviteData ?? []) as Invitation[];

  // Grouped once, rather than filtering the whole list inside the render loop
  // for every team.
  const pendingByTeam = new Map<string, Invitation[]>();
  for (const invitation of invitations) {
    const list = pendingByTeam.get(invitation.team_id) ?? [];
    list.push(invitation);
    pendingByTeam.set(invitation.team_id, list);
  }

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

        {/* "Sent" is all the app can honestly claim. The email service reports a
            successful send, and what the receiving provider then does with the
            message -- inbox, junk, or silently dropped -- is invisible to us. So
            the junk hint goes here too: this is the moment the inviter is most
            likely to act on it, rather than a week later when nobody replied. */}
        {invited === "1" ? (
          <Banner tone="ok" icon="mail">
            Invitation sent. If it does not arrive, ask them to check their junk
            or spam folder.
          </Banner>
        ) : null}

        {/* Staging redirects all invitation mail to the test inbox. Saying so
            stops a tester deciding the invitation failed because nothing
            arrived at the address they typed. */}
        {invited === "test" ? (
          <Banner tone="ok" icon="mail">
            Invitation created. This environment sends all invitation email to
            the test inbox, not to the invited address. Check its junk or spam
            folder too.
          </Banner>
        ) : null}

        {joined ? (
          <Banner tone="ok" icon="check">
            You have joined the team.
          </Banner>
        ) : null}

        {problem === "name" ? (
          <Banner tone="bad" icon="alert">
            A team needs a name, and no more than {NAME_MAX} characters.
          </Banner>
        ) : null}

        {problem === "email" ? (
          <Banner tone="bad" icon="alert">
            That does not look like an email address.
          </Banner>
        ) : null}

        {problem === "invite" ? (
          <Banner tone="bad" icon="alert">
            That invitation could not be sent. Please try again.
          </Banner>
        ) : null}

        {inviteError ? (
          <Banner tone="bad" icon="alert">
            Pending invitations could not be loaded, so the lists below may be
            incomplete. If this database is new, the invitations table may not
            exist yet.
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
            {teams.map((team) => {
              const pending = pendingByTeam.get(team.id) ?? [];
              // The invite form appears on every team in this list. Every team
              // here is one this person owns -- the select policy on teams
              // returns owned teams only -- and invite-member refuses anybody
              // who is not the owner regardless.
              return (
                <li className="card stack" key={team.id}>
                  <h2>{team.name}</h2>

                  <form action={inviteMember}>
                    <input type="hidden" name="team_id" value={team.id} />
                    <label className="label" htmlFor={`email-${team.id}`}>
                      Invite someone by email
                    </label>
                    <input
                      className="input"
                      id={`email-${team.id}`}
                      name="email"
                      type="email"
                      maxLength={EMAIL_MAX}
                      required
                      placeholder="friend@example.com"
                      aria-describedby={`invite-hint-${team.id}`}
                    />
                    <p className="hint" id={`invite-hint-${team.id}`}>
                      They get a link that works for {INVITATION_DAYS} days, and
                      only for that address. A team may have up to{" "}
                      {MAX_PENDING_INVITATIONS} invitations waiting.
                    </p>
                    <button className="btn btn--primary" type="submit">
                      Send invitation
                    </button>
                  </form>

                  {pending.length === 0 ? (
                    <p className="hint">No invitations waiting.</p>
                  ) : (
                    <>
                      <p className="hint">
                        {pending.length} of {MAX_PENDING_INVITATIONS}{" "}
                        invitations waiting:
                      </p>
                      <ul>
                        {pending.map((invitation) => (
                          <li key={invitation.id}>
                            {invitation.email} — expires{" "}
                            {expiryLabel(invitation.expires_at)}
                          </li>
                        ))}
                      </ul>
                      {/* The app cannot tell a filtered email from a delivered
                          one: the email service reports a successful send either
                          way, and whether the message was then put in a junk
                          folder is invisible to us. The first invitation sent
                          from production went to junk (issue #48), so the person
                          most able to act on that -- the one who sent it, and
                          who can message the invited person another way -- is
                          told it is a possibility.

                          Deliberately promises nothing. Not "it will be in
                          junk", not "resend to fix it": we do not know where any
                          particular message went, and saying otherwise would be
                          inventing information the app does not have. */}
                      <p className="hint">
                        Not arrived? Ask them to check their junk or spam folder.
                      </p>
                    </>
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
