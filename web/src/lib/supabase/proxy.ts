import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

// Pages anyone may open while signed out. Everything else needs a signed-in
// person, which is what makes "My tasks" private.
//
// "/auth" covers everything beneath it, including /auth/callback, where a
// confirmation link lands. That one has to be reachable while signed out --
// being signed out is the whole reason the person is following the link.
//
// "/invite" is public for the same reason: an invitation email goes to somebody
// who usually has no account yet, so the page has to be able to greet a
// signed-out visitor and tell them to sign up with the invited address. It is
// safe to open while signed out because the page only READS the token from the
// address bar -- it shows nothing about the invitation, and accepting needs a
// signed-in person and a button press, both enforced by accept-invite.
//
// "/forgot-password" has to be public: forgetting a password is the reason
// somebody cannot sign in. It shows one sentence after a request, the same one
// whatever happened, so there is nothing on it to protect.
//
// "/reset-password" is public too, which looks odd for a page that changes a
// password, and is not. It draws the form only when /auth/reset has just had a
// link accepted by Supabase, and the change itself needs the session that
// acceptance created -- so the page's own check, not the proxy, is what guards
// it. Being public is what lets somebody whose link has expired read why,
// instead of being bounced to the sign-in page with no explanation.
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/auth",
  "/invite",
  "/forgot-password",
  "/reset-password",
];

function isPublic(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Always make a new client per request. Never hold one in a global.
  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and supabase.auth.getClaims().
  // A simple mistake could make it very hard to debug issues with users being
  // randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;

  if (!user && !isPublic(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse;
}
