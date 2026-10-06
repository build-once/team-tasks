import Link from "next/link";

import { ActButton } from "@/app/components/ActButton";
import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
import { BUTTON_IDS } from "@/lib/buttons";
import { createClient } from "@/lib/supabase/server";
import {
  INVITATION_DAYS,
  INVITE_REASONS,
  type InviteReason,
} from "@/lib/teams";

import { acceptInvite } from "./actions";

// Every message this page can show, chosen HERE and keyed by a code.
//
// Nothing from the address bar is ever printed. An earlier version put
// accept-invite's message into ?error= and rendered it, which let anyone craft a
// link to this site that displayed words they chose -- on our domain, in our
// styling, which is exactly what makes a phishing message convincing. A code
// from a known list cannot do that: the worst a crafted link achieves is one of
// the messages below at a moment when it is not true.
const REASON_MESSAGES: Record<InviteReason, string> = {
  not_found:
    "This invitation link is not valid. It may have been withdrawn, or the link may be incomplete — check you copied the whole thing from the email.",
  expired: `This invitation has expired. Invitations last ${INVITATION_DAYS} days — ask the team's owner to send a new one.`,
  // Says only that it was used. It used to add "the team is already on your My
  // teams page", which is false: My teams lists the teams a person OWNS, not the
  // ones they belong to, until Build it 14. Somebody who had just accepted would
  // have gone looking for a team that is not shown there yet and concluded the
  // acceptance had failed.
  used: "This invitation has already been used.",
  wrong_person:
    "This invitation was sent to a different email address. Sign in with the address it was sent to, then open the link again.",
  signin:
    "Please sign in again, then open this link once more. Your sign-in could not be checked.",
  failed: "This invitation could not be accepted. Please try again.",
  // The suspended-account refusal (issue #133). Neutral on purpose, and written
  // for this cause rather than borrowed from another: docs/plan.md says this
  // version does not decide what a suspended person is told, and #134 holds the
  // fuller question. It says nothing about a suspension, nothing about the
  // invitation -- which is still unused and still valid -- and nothing a person
  // could act on wrongly, which is the most this page can honestly say today.
  //
  // It must stay a separate entry rather than pointing at `wrong_person`: that
  // one tells somebody to sign in with a different address, which here would be
  // false and would send them looking for an account they do not have.
  account_suspended: "You can't do that at the moment.",
  unreachable:
    "Could not reach the server to accept this invitation. Please try again.",
};

function messageFor(raw: string | string[] | undefined): string | null {
  if (typeof raw !== "string") return null;
  // Unknown codes are ignored on purpose -- no fallback that echoes the input.
  if (!(INVITE_REASONS as readonly string[]).includes(raw)) return null;
  return REASON_MESSAGES[raw as InviteReason];
}

// The page an invitation email links to: <APP_URL>/invite/<token>.
//
// WHAT THIS PAGE DELIBERATELY DOES NOT DO:
//
// 1. It does not accept the invitation on load. Mail clients, link previewers
//    and security scanners fetch links in emails automatically. Accepting on
//    load would burn the invitation before the invited person read the email,
//    and since an invitation cannot be accepted twice they would then be told
//    it had "already been used". Accepting happens on the button press below
//    and nowhere else.
//
// 2. It does not look the invitation up. The page shows nothing about it -- not
//    the team name, not the invited address, not whether the token is even
//    real. It is a public page (src/lib/supabase/proxy.ts), so anything shown
//    here would be shown to whoever holds the link, which may not be the
//    invited person. Every check lives in accept-invite, behind a verified
//    sign-in, and what comes back is a CODE in ?reason= -- never text to print.
export default async function InvitePage({
  params,
  searchParams,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const { reason } = await searchParams;

  const supabase = await createClient();

  // getClaims() verifies the token's signature; getSession() would trust a
  // cookie anyone can forge.
  const { data: claimsData } = await supabase.auth.getClaims();
  const signedIn = Boolean(claimsData?.claims);

  // A code from the URL, mapped to one of this page's own messages. An
  // unrecognised code shows nothing at all.
  const failure = messageFor(reason);

  return (
    <>
      {/* The account menu gets the address off the verified token when there is
          one. A signed-out visitor -- which is the usual case here, because an
          invitation goes to somebody who often has no account yet -- gets no menu
          at all, and `claimsData?.claims?.email` is then undefined, which
          accountLabel turns into "Signed in" rather than into the word. */}
      <Header signedIn={signedIn} account={claimsData?.claims?.email} />

      <main className="page stack">
        <h1>You have been invited</h1>

        {failure ? (
          <Banner tone="bad" icon="alert">
            {failure}
          </Banner>
        ) : null}

        {signedIn ? (
          <>
            {/* Says only what accepting does TODAY. It used to promise that the
                team's tasks would appear on My tasks, which is not true yet:
                tasks belong to the person who created them, not to a team, until
                Build it 15 moves them. Promising a result the app does not
                produce is how somebody concludes the feature is broken. */}
            <p className="lede">Accepting adds you to the team.</p>

            <form className="card" action={acceptInvite}>
              {/* The token travels in the form, so accepting is a POST from a
                  button press -- never something a link fetch can trigger. */}
              <input type="hidden" name="token" value={token} />
              <ActButton
                className="btn btn--primary"
                act={BUTTON_IDS.inviteAccept}
              >
                Accept invitation
              </ActButton>
            </form>

            <p className="hint">
              If you are signed in as somebody else, the invitation will be
              refused: it only works for the address it was sent to.
            </p>
          </>
        ) : (
          <>
            <p className="lede">
              To accept this invitation, sign in with the email address it was
              sent to — or sign up with that address if you do not have an
              account yet. Then open this link again.
            </p>

            <p>
              <Link className="btn btn--primary" href="/login">
                Sign in
              </Link>{" "}
              <Link className="btn btn--quiet" href="/signup">
                Sign up
              </Link>
            </p>

            <p className="hint">
              The invitation must be accepted within {INVITATION_DAYS} days of
              being sent. It only works for the address it was sent to, so
              signing in with a different one will not accept it.
            </p>
          </>
        )}

        {/* BACK TO MY TEAMS, ALWAYS (Build it 19 rule 7).

            OUTSIDE BOTH BRANCHES, which is the whole change. It used to be a "My
            teams" link tucked inside a sentence in the signed-in branch, so a
            signed-out visitor had no way off this page at all -- and the sentence
            it was inside is about being signed in as somebody else, which is not
            what somebody looking for the way out is reading.

            "INCLUDING WHILE IT IS BUSY", and here is exactly why that holds rather
            than being asserted. This is a plain anchor in the document, and this
            screen is rendered on the server with no client-side state: nothing
            disables it, nothing removes it, and no pending-submission check draws a
            different version of this page. The Accept button submits a form, and
            while that form is in flight this link is still an anchor the browser
            will follow. The way to BREAK that would be to make this page a client
            component and hide the link behind a `useFormStatus().pending`, which is
            a thing nothing here does and a thing to keep not doing.

            It is after the two branches so it reads as the way out rather than as
            part of either offer. */}
        <p className="switch">
          <Link href="/teams">Back to My teams</Link>
        </p>
      </main>
    </>
  );
}
