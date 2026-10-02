import { redirect } from "next/navigation";

import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
import { createClient } from "@/lib/supabase/server";
import {
  DISPLAY_NAME_MAX,
  EMAIL_MAX,
  INVITATION_DAYS,
  MAX_PENDING_INVITATIONS,
  MAX_TEAMS_PER_OWNER,
  NAME_MAX,
  NO_DISPLAY_NAME,
  type Invitation,
  type Profile,
  type RosterEntry,
  type Team,
} from "@/lib/teams";

import { createTeam, inviteMember, saveDisplayName } from "./actions";

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

// One team's members list, read from team_roster.
//
// `failed` is passed in rather than inferred from an empty list, because "the
// read did not work" and "this team has nobody in it" must not look the same on
// screen. (The second cannot actually happen -- a team always has its owner --
// which is itself a reason to say so rather than draw an empty list.)
function MembersList({
  entries,
  failed,
}: {
  entries: RosterEntry[];
  failed: boolean;
}) {
  if (failed) {
    return <p className="hint">This team&apos;s members could not be loaded.</p>;
  }

  if (entries.length === 0) {
    return <p className="hint">No members to show.</p>;
  }

  return (
    <>
      <p className="hint">
        {entries.length === 1 ? "1 person" : `${entries.length} people`} in this
        team:
      </p>
      <ul className="member-list">
        {entries.map((entry, index) => (
          // The index is the key because no id is read for this list: the
          // columns selected are the ones shown, and a user id is not shown.
          // That is safe here in a way it would not be in a list the browser
          // reorders -- this is a server-rendered list, drawn once per request,
          // with no client-side state to attach to the wrong row.
          <li key={`${entry.team_id}-${index}`}>
            {/* A missing nickname shows as a neutral placeholder and never as
                an address: team_roster has no email column, and nothing in this
                database would let the app read one (docs/plan.md, "Email
                address: never shown to team members"). */}
            {entry.display_name && entry.display_name.trim() !== ""
              ? entry.display_name
              : NO_DISPLAY_NAME}{" "}
            — {entry.role}
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function MyTeamsPage({
  searchParams,
}: PageProps<"/teams">) {
  const {
    problem,
    created,
    invited,
    joined,
    named,
    error: errorParam,
  } = await searchParams;
  const supabase = await createClient();

  // src/proxy.ts already turns signed-out visitors away, but a page that shows
  // private data checks for itself too. getClaims() verifies the token's
  // signature every time; getSession() would trust a cookie anyone can forge.
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect("/login");

  // Used for two things and nothing else: finding this person's own profile
  // row, and telling a team they own from a team they only belong to. It is
  // compared, never displayed.
  const userId = claimsData.claims.sub;

  // No "where owner_id is me" here: the select rule on teams decides what comes
  // back, in the database rather than in this screen. Since
  // 20261002122203_team_rules.sql that rule is is_team_member(id), so it returns
  // teams this person OWNS and teams they BELONG TO -- which is why the list is
  // split below instead of being treated as one thing (issue #76).
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, created_at, owner_id")
    .order("created_at", { ascending: false });

  const teams = (data ?? []) as Team[];

  // The two lists, from that one query. Ownership lives in teams.owner_id, and
  // the owner-only parts of this page -- the invite box, the waiting
  // invitations, the count toward the limit -- hang off the first list only.
  //
  // Offering an invite box on a team somebody does not own was not a hole:
  // invite-member refuses anybody who is not the owner (HTTP 403, proved by
  // scripts/staging/bob-invites-to-alices-team.mjs). It was a screen making a
  // claim about ownership that its query could not support, and then acting on
  // it by offering a form that could only fail.
  const ownedTeams = teams.filter((team) => team.owner_id === userId);
  const memberTeams = teams.filter((team) => team.owner_id !== userId);

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

  // Who is in each team, from the team_roster view.
  //
  // Three columns, and they are the three this screen uses: team_id to group
  // the rows by team, display_name and role to draw each line. The view also
  // has team_name and user_id, and neither is asked for -- the team's name is
  // already in the teams query above, which this page needs anyway for its
  // headings and its ordering, and a user id is not something the screen shows.
  // Never select *: a view selected with a star hands over every column it ever
  // grows, including ones nobody has thought about yet.
  //
  // No team filter, for the same reason as the two queries above: team_roster
  // is security_invoker, so it reads its tables as the person asking and the
  // rules on teams, team_members and profiles decide what comes back. Bob gets
  // nothing (proved on staging by scripts/staging/build-it-14-checks.mjs).
  //
  // Ordered owner-first: the view's role is the text 'owner' or 'member', and
  // descending puts 'owner' ahead because "o" sorts after "m". That is a
  // cosmetic ordering, not a rule -- if the view ever derived a third role, this
  // line would need looking at, and nothing else would break. Then by name,
  // with nulls last, so people who have not set a nickname sit at the end of
  // their team rather than at the top of it.
  const { data: rosterData, error: rosterError } = await supabase
    .from("team_roster")
    .select("team_id, display_name, role")
    .order("role", { ascending: false })
    .order("display_name", { ascending: true, nullsFirst: false });

  const roster = (rosterData ?? []) as RosterEntry[];

  // This person's own nickname, for the box below. maybeSingle() because there
  // is at most one row -- user_id is the primary key of profiles -- and because
  // "no row yet" has to be an ordinary answer rather than an error: nobody has a
  // profile row until they set a name. From the reference: "Query result must be
  // zero or one row [...] otherwise this returns an error."
  // https://supabase.com/docs/reference/javascript/maybesingle
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();

  const profile = (profileData ?? null) as Profile | null;

  // Grouped once, rather than filtering the whole list inside the render loop
  // for every team.
  const pendingByTeam = new Map<string, Invitation[]>();
  for (const invitation of invitations) {
    const list = pendingByTeam.get(invitation.team_id) ?? [];
    list.push(invitation);
    pendingByTeam.set(invitation.team_id, list);
  }

  const rosterByTeam = new Map<string, RosterEntry[]>();
  for (const entry of roster) {
    const list = rosterByTeam.get(entry.team_id) ?? [];
    list.push(entry);
    rosterByTeam.set(entry.team_id, list);
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
  //
  // Counted from the OWNED teams, which is what the limit is about: create-team
  // counts by owner_id, so a note counting teams somebody merely belongs to
  // would tell them they were at a limit the function would happily let them
  // past (issue #76).
  const atLimit = !error && ownedTeams.length >= MAX_TEAMS_PER_OWNER;

  return (
    <>
      <Header signedIn current="teams" />

      <main className="page stack">
        <h1>My teams</h1>

        {/* Your name, first, because every members list below is made of these.
            Somebody reading "(no name yet)" next to themselves has the box to
            fix it in the same place. */}
        <form className="card" action={saveDisplayName}>
          <div>
            <label className="label" htmlFor="display_name">
              Your name
            </label>
            <input
              className="input"
              id="display_name"
              name="display_name"
              type="text"
              maxLength={DISPLAY_NAME_MAX}
              required
              defaultValue={profile?.display_name ?? ""}
              placeholder="Carol"
              aria-describedby="display_name-hint"
            />
            <p className="hint" id="display_name-hint">
              A nickname of up to {DISPLAY_NAME_MAX} characters, shown to your
              team mates. Please not your full name.
              {profile ? null : " You have not set one yet."}
            </p>
            <button className="btn btn--primary" type="submit">
              Save name
            </button>
          </div>
        </form>

        {named ? (
          <Banner tone="ok" icon="check">
            Your name is saved.
          </Banner>
        ) : null}

        {problem === "yourname" ? (
          <Banner tone="bad" icon="alert">
            A name needs some text, and no more than {DISPLAY_NAME_MAX}{" "}
            characters.
          </Banner>
        ) : null}

        {problem === "profile" ? (
          <Banner tone="bad" icon="alert">
            Your name did not save. Please try again.
          </Banner>
        ) : null}

        {/* Said plainly, because the box above is empty in this case too, and an
            empty box otherwise reads as "you have no name set". */}
        {profileError ? (
          <Banner tone="bad" icon="alert">
            Your name could not be loaded, so the box above is empty whether or
            not you have set one. Saving will still work.
          </Banner>
        ) : null}

        {atLimit ? (
          // A warning, not a gate, and it comes before the form for that
          // reason. No advice to delete a team: there is no way to delete one,
          // so telling somebody to would send them looking for a button that
          // does not exist.
          <p className="hint">
            You own {ownedTeams.length} teams, the most allowed.
          </p>
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

        {rosterError ? (
          <Banner tone="bad" icon="alert">
            The members lists could not be loaded, so each team below says so
            instead of showing who is in it.
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

        {/* Nothing loaded, or nothing to show: one line, and no headings for two
            empty sections. */}
        {error ? null : teams.length === 0 ? (
          <p className="hint">No teams yet</p>
        ) : (
          <>
            <section className="stack">
              <h2>Teams you own</h2>

              {ownedTeams.length === 0 ? (
                <p className="hint">You do not own a team yet.</p>
              ) : (
                <ul className="stack team-list">
                  {ownedTeams.map((team) => {
                    const pending = pendingByTeam.get(team.id) ?? [];
                    return (
                      <li className="card stack" key={team.id}>
                        <h3>{team.name}</h3>

                        <MembersList
                          entries={rosterByTeam.get(team.id) ?? []}
                          failed={Boolean(rosterError)}
                        />

                        {/* The invite box belongs to this list and not the one
                            below: invite-member refuses anybody who is not the
                            team's owner. */}
                        <form action={inviteMember}>
                          <input
                            type="hidden"
                            name="team_id"
                            value={team.id}
                          />
                          <label
                            className="label"
                            htmlFor={`email-${team.id}`}
                          >
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
                            They get a link that works for {INVITATION_DAYS}{" "}
                            days, and only for that address. A team may have up
                            to {MAX_PENDING_INVITATIONS} invitations waiting.
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
                            {/* The app cannot tell a filtered email from a
                                delivered one: the email service reports a
                                successful send either way, and whether the
                                message was then put in a junk folder is
                                invisible to us. The first invitation sent from
                                production went to junk (issue #48), so the
                                person most able to act on that -- the one who
                                sent it, and who can message the invited person
                                another way -- is told it is a possibility.

                                Deliberately promises nothing. Not "it will be
                                in junk", not "resend to fix it": we do not know
                                where any particular message went, and saying
                                otherwise would be inventing information the app
                                does not have. */}
                            <p className="hint">
                              Not arrived? Ask them to check their junk or spam
                              folder.
                            </p>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="stack">
              <h2>Teams you belong to</h2>

              {memberTeams.length === 0 ? (
                <p className="hint">
                  You are not a member of anybody else&apos;s team.
                </p>
              ) : (
                <ul className="stack team-list">
                  {memberTeams.map((team) => (
                    // Members list only. No invite box, no waiting
                    // invitations: both are the owner's, and the select policy
                    // on invitations returns nothing here in any case.
                    <li className="card stack" key={team.id}>
                      <h3>{team.name}</h3>

                      <MembersList
                        entries={rosterByTeam.get(team.id) ?? []}
                        failed={Boolean(rosterError)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}
