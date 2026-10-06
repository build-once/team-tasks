import { redirect } from "next/navigation";

import { ActButton } from "@/app/components/ActButton";
import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
import { LoadFailed } from "@/app/components/LoadFailed";
import { BUTTON_IDS } from "@/lib/buttons";
import {
  SCREEN_ERROR,
  screenState,
  showsData,
  type ScreenState,
} from "@/lib/screen-state";
import { rememberUserForErrorReports } from "@/lib/sentry-user";
import { createClient } from "@/lib/supabase/server";
import {
  CREATE_TEAM_SENTENCES,
  DISPLAY_NAME_MAX,
  EMAIL_MAX,
  INVITATION_DAYS,
  INVITE_SENTENCES,
  invitationDelivery,
  MAX_PENDING_INVITATIONS,
  MAX_TEAMS_PER_OWNER,
  NAME_MAX,
  TEAM_ACTION_OUTCOMES,
  type Invitation,
  type Profile,
  type RosterEntry,
  type TeamActionOutcome,
  type Team,
} from "@/lib/teams";
import { NO_DISPLAY_NAME, plainText, roleWord } from "@/lib/words";

import { createTeam, inviteMember, saveDisplayName } from "./actions";

// An outcome code from the query string, turned into one of THIS FILE'S sentences.
//
// Same shape as messageFor in web/src/app/invite/[token]/page.tsx, and for the same
// reason: the page receives a short code and chooses the words. An unrecognised
// code shows nothing at all -- there is deliberately no fallback that echoes the
// input, because an echo is how a crafted link makes our domain say somebody else's
// words.
//
// WHICH MAP is passed in, because the same outcome means different things for the
// two actions: a 409 from create-team is the three-team limit, and a 409 from
// invite-member is one of three refusals about an address.
function sentenceFor(
  raw: string | string[] | undefined,
  sentences: Readonly<Record<TeamActionOutcome, string>>,
): string | null {
  if (typeof raw !== "string") return null;
  if (!(TEAM_ACTION_OUTCOMES as readonly string[]).includes(raw)) return null;
  return sentences[raw as TeamActionOutcome];
}

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
// `state` is the look the WHOLE roster read is in, worked out once by the page and
// passed down, rather than each team's card deciding for itself. The reason is the
// one screenState exists for: "the read did not work" and "this team has nobody in
// it" must not look the same, and an empty array is what BOTH of them leave behind.
// (The second cannot actually happen -- a team always has its owner -- which is
// itself a reason to say so rather than draw an empty list.)
function MembersList({
  entries,
  state,
}: {
  entries: RosterEntry[];
  state: ScreenState;
}) {
  if (state === SCREEN_ERROR) {
    // No Try again button on each card: there is one for the roster read at the
    // top of the page, and twenty copies of the same button would be noise. The
    // sentence is here because this is where the missing list is.
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
                address: never shown to team members").

                plainText rather than a check written here (Build it 19 rule 4).
                display_name is nullable -- the view left-joins profiles -- and
                React draws nothing at all for a null, which on this line reads as
                a person with no name rather than as a name that is missing. The
                old check caught null and blank; plainText also catches the words
                "null" and "undefined", which is what a nullish value becomes on
                its way through a string, and it is the one function doing this
                everywhere rather than a habit kept up one line at a time. */}
            {plainText(entry.display_name, NO_DISPLAY_NAME)} —{" "}
            {/* The role as a word, never the stored value (Build it 19 rule 5).
                The view derives 'owner' or 'member'; roleWord turns those into
                "Owner" and "Member", and says the role is not known for anything
                else rather than printing it.
                scripts/friendly-words-check.mjs reads the two literals out of
                20261002122203_team_rules.sql and fails if either has no word. */}
            {roleWord(entry.role)}
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function MyTeamsPage({
  searchParams,
}: PageProps<"/teams">) {
  const { problem, created, invited, to, joined, named, outcome } =
    await searchParams;
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

  // So an error report from the rest of this page carries who hit it, by id and
  // nothing else (issue #157). After the signed-out redirect, so it only runs
  // with a verified token in hand.
  rememberUserForErrorReports(userId);

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
  //
  // status, failure_code and created_at arrived with issue #166, and all three are
  // read through the policy that was already there -- the one that answers only
  // the team's owner. No new rule, no new connection, and nothing on this page
  // holds a secret key: docs/plan.md says an invitation's status is for "the team's
  // owner, on My teams. Nobody else", which is exactly what that policy already
  // says about the address in the same row.
  //
  // created_at is read because the clock is the only thing that can tell a send
  // that is happening now from one that stopped half way (see invitationDelivery).
  // One moment, read once and used twice: the filter below and the staleness
  // reckoning in invitationDelivery must agree about what "now" is.
  //
  // `new Date()` rather than `Date.now()` on purpose. The react-hooks/purity lint
  // rule rejects `Date.now()` in a component -- "Cannot call impure function
  // during render" -- and this page already read the clock this way for the filter
  // that was here before.
  const nowDate = new Date();
  const now = nowDate.getTime();
  const nowIso = nowDate.toISOString();
  const { data: inviteData, error: inviteError } = await supabase
    .from("invitations")
    .select("id, team_id, email, created_at, expires_at, status, failure_code")
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

  // WHAT A FAILED FUNCTION CALL SAYS (Build it 19 rule 2).
  //
  // A CODE from the query string, mapped to one of this page's own sentences. What
  // this replaced is the whole argument, and it is written out in full beside
  // TEAM_ACTION_OUTCOMES in web/src/lib/teams.ts: the action used to put the
  // function's own message into ?error= and this page printed it, so anyone could
  // craft a link to this site that displayed words they chose, on our domain and in
  // our styling. An unrecognised code now shows nothing at all.
  //
  // Two separate reads, because the two actions need different sentences for the
  // same code, and because a page that showed one banner for both would have to
  // guess which action the person had just taken.
  const createFailure =
    problem === "create" ? sentenceFor(outcome, CREATE_TEAM_SENTENCES) : null;

  const inviteFailure =
    problem === "invite" ? sentenceFor(outcome, INVITE_SENTENCES) : null;

  // ---- WHICH LOOK EACH READ GETS (Build it 19 rule 1) ---------------------
  //
  // Four reads on this page, so four answers, all from the one function in
  // web/src/lib/screen-state.ts. The trap it exists for is the same on every one of
  // them: `data ?? []` and `data ?? null` turn a failed read into an empty one, so
  // without `failed` passed separately, "your teams could not be loaded" and "you
  // have no teams" arrive here looking identical.
  //
  // The profile read is counted differently from the other three on purpose:
  // maybeSingle() gives a row or null rather than an array, and "no profile row
  // yet" is the ordinary first-time case rather than an emptiness worth a look of
  // its own. So it is 1 or 0 rows, and only the error look is acted on.
  const teamsState = screenState({ failed: Boolean(error), rows: teams.length });

  const inviteState = screenState({
    failed: Boolean(inviteError),
    rows: invitations.length,
  });

  const rosterState = screenState({
    failed: Boolean(rosterError),
    rows: roster.length,
  });

  const profileState = screenState({
    failed: Boolean(profileError),
    rows: profile === null ? 0 : 1,
  });

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
  //
  // Asked of the look rather than of `error`, for the same reason the count on My
  // tasks is: a failed read is not "you own no teams", and a note counting rows
  // nobody could read would be a claim.
  const atLimit =
    teamsState !== SCREEN_ERROR && ownedTeams.length >= MAX_TEAMS_PER_OWNER;

  return (
    <>
      <Header signedIn current="teams" account={claimsData.claims.email} />

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
            <ActButton
              className="btn btn--primary"
              act={BUTTON_IDS.nameSave}
            >
              Save name
            </ActButton>
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
            empty box otherwise reads as "you have no name set". Now with the
            button, like every other failed read on this page. */}
        {profileState === SCREEN_ERROR ? (
          <LoadFailed target="teams">
            Your name could not be loaded, so the box above is empty whether or
            not you have set one. Saving will still work.
          </LoadFailed>
        ) : null}

        {/* A post that carried no button identifier this page recognises (Build it
            19 rule 6). Not reachable from the screen -- every button here carries
            one -- so it takes a request made by hand. */}
        {problem === "button" ? (
          <Banner tone="bad" icon="alert">
            Nothing happened: that request did not come from a button on this
            page. Please use the buttons here.
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
            <ActButton
              className="btn btn--primary"
              act={BUTTON_IDS.teamCreate}
            >
              Create team
            </ActButton>
          </div>
        </form>

        {/* "Team created." is said only after the action has READ THE ROW BACK out
            of the database (Build it 19 rule 3). It used to be said because the
            function answered 201, which is a different claim. */}
        {created === "1" ? (
          <Banner tone="ok" icon="check">
            Team created.
          </Banner>
        ) : null}

        {/* The read-back did not work. The team probably exists -- the function
            said so -- and nothing here has seen it, so nothing here claims it. The
            list below is read in this same request, so whichever answer the
            database gives, the list and this sentence agree. */}
        {created === "unconfirmed" ? (
          <Banner tone="bad" icon="alert">
            The team may have been created, but we could not read it back, so it
            is not confirmed. Look for it below before creating it again.
          </Banner>
        ) : null}

        {/* "Sent" is all the app can honestly claim. The email service reports a
            successful send, and what the receiving provider then does with the
            message -- inbox, junk, or silently dropped -- is invisible to us. So
            the junk hint goes here too: this is the moment the inviter is most
            likely to act on it, rather than a week later when nobody replied.

            THE THREE WORDINGS BELOW COME FROM WHAT THE FUNCTION SAID THE ROW
            SAYS, not from the fact that the request succeeded (issue #166). The
            action reads `invitation.status` out of the answer and picks the
            parameter from it, so a banner saying "sent" and a list saying
            "sending" cannot both be on this page at once.

            `to=test` is carried separately from what happened, so the test-inbox
            note does not need its own copy of each sentence. */}
        {invited === "sent" ? (
          <Banner tone="ok" icon="mail">
            Invitation sent.{" "}
            {to === "test"
              ? "This environment sends all invitation email to the test inbox, not to the invited address. Check its junk or spam folder too."
              : "If it does not arrive, ask them to check their junk or spam folder."}
          </Banner>
        ) : null}

        {/* A retry. Worth its own wording, because the owner pressed a button
            that promised a new link and should be told they got one -- and
            because the old link no longer works, which is a thing to know if the
            first email turns up later after all. */}
        {invited === "again" ? (
          <Banner tone="ok" icon="mail">
            Invitation sent again, with a new link. The earlier link no longer
            works.{" "}
            {to === "test"
              ? "This environment sends all invitation email to the test inbox, not to the invited address."
              : "If it does not arrive, ask them to check their junk or spam folder."}
          </Banner>
        ) : null}

        {/* The email went and the status could not be written down, so the row
            still says 'queued' and the list below will say "sending". Said here
            rather than hidden, because the list is about to contradict the thing
            the owner just did, and an unexplained contradiction reads as a bug. */}
        {invited === "sending" ? (
          <Banner tone="ok" icon="mail">
            The invitation email went out, but we could not record that against
            the invitation, so it still shows as sending below. Nothing is lost:
            the link in that email works.
          </Banner>
        ) : null}

        {/* Said only after the action has read the membership back, as the team
            this person can now see (Build it 19 rule 3). */}
        {joined === "1" ? (
          <Banner tone="ok" icon="check">
            You have joined the team.
          </Banner>
        ) : null}

        {/* The function accepted the invitation and the read-back did not work, so
            the membership is not confirmed from here. The list below is read in this
            same request, so it is the thing to look at. */}
        {joined === "unconfirmed" ? (
          <Banner tone="bad" icon="alert">
            The invitation was accepted, but we could not read the team back, so
            joining is not confirmed. Look for it below.
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

        {/* The invite-member failure, in one of THIS FILE'S sentences, chosen from
            a code. `problem=invite` with no usable code -- which is what the two
            checks before the function call send -- falls back to the general
            sentence rather than showing nothing. */}
        {problem === "invite" ? (
          <Banner tone="bad" icon="alert">
            {inviteFailure ?? INVITE_SENTENCES.broke}
          </Banner>
        ) : null}

        {/* And the create-team failure, the same way. */}
        {problem === "create" ? (
          <Banner tone="bad" icon="alert">
            {createFailure ?? CREATE_TEAM_SENTENCES.broke}
          </Banner>
        ) : null}

        {inviteState === SCREEN_ERROR ? (
          <LoadFailed target="teams">
            Pending invitations could not be loaded, so no team below shows who
            is waiting to join it. If this database is new, the invitations table
            may not exist yet.
          </LoadFailed>
        ) : null}

        {rosterState === SCREEN_ERROR ? (
          <LoadFailed target="teams">
            The members lists could not be loaded, so each team below says so
            instead of showing who is in it.
          </LoadFailed>
        ) : null}

        {/* THE ERROR LOOK for the teams read itself. Everything below is drawn only
            for the other two looks, so a failed read is never an empty list and
            never a "No teams yet" -- which is the one thing this page had wrong and
            the reason screenState exists. */}
        {teamsState === SCREEN_ERROR ? (
          <LoadFailed target="teams">
            Your teams could not be loaded, so nothing below is a list of them.
            If this database is new, the teams table may not exist yet: the
            migration in supabase/migrations has not been applied.
          </LoadFailed>
        ) : null}

        {/* THE EMPTY LOOK: nothing to show, one line, and no headings for two empty
            sections. Then the data look. */}
        {teamsState === SCREEN_ERROR ? null : !showsData(teamsState) ? (
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
                          state={rosterState}
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
                          {/* ONE OF THE TWO BUTTONS THAT SHARE AN ACTION, which is
                              why the identifier matters most here (Build it 19
                              rule 6). This one and the Try again below both post
                              to inviteMember, and before this the only thing
                              telling them apart was which hidden fields the
                              surrounding form happened to carry. */}
                          <ActButton
                            className="btn btn--primary"
                            act={BUTTON_IDS.inviteSend}
                          >
                            Send invitation
                          </ActButton>
                        </form>

                        {/* "No invitations waiting." is a claim about this team, so
                            it is only made when the invitations read WORKED. With a
                            failed read nothing is said here: the error look at the
                            top of the page, with its Try again, is what says why
                            there is nothing to show. Before this, a failed read
                            drew this line on every team -- a failed load looking
                            exactly like an empty list, which is the thing Build it
                            19 rule 1 forbids. */}
                        {inviteState === SCREEN_ERROR ? null : pending.length ===
                          0 ? (
                          <p className="hint">No invitations waiting.</p>
                        ) : (
                          <>
                            <p className="hint">
                              {pending.length} of {MAX_PENDING_INVITATIONS}{" "}
                              invitations waiting:
                            </p>
                            <ul>
                              {pending.map((invitation) => {
                                // What happened to this invitation's email, in
                                // the three words issue #166 asks for. Worked out
                                // from the row, by one pure function, so the
                                // screen cannot disagree with what was stored.
                                const delivery = invitationDelivery(
                                  invitation,
                                  now,
                                );
                                return (
                                  <li key={invitation.id}>
                                    {invitation.email} — expires{" "}
                                    {expiryLabel(invitation.expires_at)} —{" "}
                                    {delivery.label}
                                    {/* The plain sentence, when there is one to
                                        say. Never the stored failure code, and
                                        never anything the email service said:
                                        invitationDelivery maps a code to wording
                                        and falls back to a sentence of its own
                                        for a code it does not know. */}
                                    {delivery.sentence ? (
                                      <p className="hint">{delivery.sentence}</p>
                                    ) : null}
                                    {/* Try again. The same action as the invite
                                        box above, with the address carried in a
                                        hidden field -- so there is ONE path into
                                        invite-member, and the owner check, the
                                        suspension check and the limit are the
                                        same ones for both. The function decides
                                        whether a retry is allowed; this button
                                        only appears where it would say yes. */}
                                    {delivery.canRetry ? (
                                      <form action={inviteMember}>
                                        <input
                                          type="hidden"
                                          name="team_id"
                                          value={invitation.team_id}
                                        />
                                        <input
                                          type="hidden"
                                          name="email"
                                          value={invitation.email}
                                        />
                                        <ActButton
                                          className="btn"
                                          act={BUTTON_IDS.inviteRetry}
                                        >
                                          Try again
                                        </ActButton>
                                      </form>
                                    ) : null}
                                  </li>
                                );
                              })}
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
                        state={rosterState}
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
