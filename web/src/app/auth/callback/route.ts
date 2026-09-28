import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Where a confirmation link lands. Supabase sends the person here with a
// one-time code in the address; this swaps that code for a signed-in session
// and sets the cookies.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  // Naming the flow keeps a mismatched verifier from consuming the single-use
  // code, which is what the CLI's own callback example does.
  const flowId = searchParams.get("sb_flow_id");

  if (code) {
    const supabase = await createClient();

    const { error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );

    if (!error) {
      return NextResponse.redirect(new URL("/tasks", request.url));
    }
  }

  // The usual reason to get here is a link opened in a different browser from
  // the one that signed up: the code is real, but this browser never stored the
  // other half of it. Supabase has still confirmed the address by now, so the
  // person only needs to sign in.
  //
  // Both destinations above are fixed paths. Nothing taken from the link
  // decides where anybody lands, so a doctored link cannot send a person on to
  // somewhere else.
  return NextResponse.redirect(new URL("/login?confirmed=1", request.url));
}
