import { NextResponse, type NextRequest } from "next/server";

import {
  RESET_MARKER_COOKIE,
  RESET_MARKER_MAX_AGE_SECONDS,
  resetLandingPath,
} from "@/lib/password-reset";
import { createClient } from "@/lib/supabase/server";

// Where a password-reset link lands.
//
// It is a separate route from /auth/callback, which a sign-up confirmation lands
// on, because the two have to end differently: a confirmation sends somebody to
// their tasks, and a reset link has to send them to a form. Keeping them apart
// also keeps each one's redirect allow-list entry meaning one thing.
//
// WHAT THE RESET CODE DOES HERE, in full (issue #120 rule 2). It arrives in the
// address bar, it is read out of the URL, and it is handed to Supabase. That is
// every use of it in this app:
//
//   * it is never rendered -- no page in this repository prints a search
//     parameter, and both destinations below are fixed paths from
//     resetLandingPath();
//   * it is never put into a redirect, a cookie, a database row or a form field;
//   * it is never logged -- there is no console call in this file, and none
//     anywhere under web/src;
//   * it is never returned to the app as data. The app asks Supabase to email a
//     link; Supabase answers with nothing but an error or the absence of one.
//     The only reason this code exists in our process at all is that the browser
//     hands it back to us, which is unavoidable in any flow: somebody has to
//     exchange it.
//
// Both answers Supabase can give end on a fixed path, so a doctored link cannot
// send anybody anywhere of its choosing.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const supabase = await createClient();

  // Two shapes of link, because the shape depends on the project's email
  // template and this app may not change Supabase settings (issue #120 rule 5).
  //
  //   code        what the default recovery template produces for a PKCE client.
  //               @supabase/ssr sends a code challenge with the request
  //               (resetPasswordForEmail in
  //               web/node_modules/@supabase/auth-js/dist/module/GoTrueClient.js),
  //               so Supabase's own verify endpoint sends the person back here
  //               with an authorization code to exchange. Same mechanism as
  //               /auth/callback.
  //   token_hash  the shape Supabase's server-side Next.js guide uses, where the
  //               email template points straight at the app
  //               (https://supabase.com/docs/guides/auth/passwords). Handled too,
  //               so the flow works whichever template the project has, without
  //               anybody editing a template to make it work.
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");

  // Naming the flow keeps a mismatched verifier from consuming the single-use
  // code, which is what the CLI's own callback example does.
  const flowId = searchParams.get("sb_flow_id");

  let accepted = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );
    accepted = !error;
  } else if (tokenHash) {
    // `recovery` is written here, never taken from the link. With the type read
    // from the address bar instead, this one route would verify every kind of
    // email token Supabase issues -- a sign-up confirmation, an email change, an
    // invitation -- and hand each of them the password form.
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });
    accepted = !error;
  }

  const response = NextResponse.redirect(
    new URL(resetLandingPath(accepted), request.url),
  );

  // The marker that lets the new-password form be drawn, set only when Supabase
  // accepted the link. See web/src/lib/password-reset.ts for what it is and what
  // it is not: it decides what the screen shows, not what anybody may do.
  //
  // httpOnly so no script can read or write it; sameSite lax so it survives the
  // hop from the email; secure everywhere except plain-http localhost, which is
  // where the owner tests.
  if (accepted) {
    response.cookies.set({
      name: RESET_MARKER_COOKIE,
      value: "1",
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: RESET_MARKER_MAX_AGE_SECONDS,
    });
  }

  return response;
}
