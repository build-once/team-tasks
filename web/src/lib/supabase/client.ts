import { createBrowserClient } from "@supabase/ssr";

// A Supabase client for code running in the browser.
// Both values are public on purpose. They are only safe because row-level
// security decides what they may reach. No secret key is ever used here.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
