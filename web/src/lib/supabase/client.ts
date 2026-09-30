import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

// A Supabase client for code running in the browser.
// Both values are public on purpose. They are only safe because row-level
// security decides what they may reach. No secret key is ever used here.
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
