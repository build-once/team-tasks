import Link from "next/link";

import { Banner } from "@/app/components/Banner";
import { Header } from "@/app/components/Header";
import { createClient } from "@/lib/supabase/server";
import { INVITATION_DAYS } from "@/lib/teams";

import { acceptInvite } from "./actions";

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
//    sign-in, and its message comes back through ?error=.
export default async function InvitePage({
  params,
  searchParams,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const { error: errorParam } = await searchParams;

  const supabase = await createClient();

  // getClaims() verifies the token's signature; getSession() would trust a
  // cookie anyone can forge.
  const { data: claimsData } = await supabase.auth.getClaims();
  const signedIn = Boolean(claimsData?.claims);

  // The message from accept-invite, passed through the URL by the action. It is
  // our own text and React escapes it, but it arrived from whoever opened the
  // link, so it is something to display and never something to trust.
  const failure =
    typeof errorParam === "string" && errorParam.trim() !== ""
      ? errorParam
      : null;

  return (
    <>
      <Header signedIn={signedIn} />

      <main className="page stack">
        <h1>You have been invited</h1>

        {failure ? (
          <Banner tone="bad" icon="alert">
            {failure}
          </Banner>
        ) : null}

        {signedIn ? (
          <>
            <p className="lede">
              Accepting adds you to the team, and the team&apos;s tasks appear on
              your My tasks page.
            </p>

            <form className="card" action={acceptInvite}>
              {/* The token travels in the form, so accepting is a POST from a
                  button press -- never something a link fetch can trigger. */}
              <input type="hidden" name="token" value={token} />
              <button className="btn btn--primary" type="submit">
                Accept invitation
              </button>
            </form>

            <p className="hint">
              If you are signed in as somebody else, the invitation will be
              refused: it only works for the address it was sent to.{" "}
              <Link href="/teams">My teams</Link>
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
      </main>
    </>
  );
}
