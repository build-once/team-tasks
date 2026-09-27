import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// A Supabase client for code running on the server. A new one is made for every
// request, because it has to carry that request's cookies.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll was called from a Server Component, which cannot set
            // cookies. This can be ignored: src/proxy.ts refreshes the session
            // on every request, so the cookies are already up to date.
          }
        },
      },
    },
  );
}
