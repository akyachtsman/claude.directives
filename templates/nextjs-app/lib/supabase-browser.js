// Browser (Client Component) Supabase client — anon/publishable key + RLS only.
// RLS is the enforcement boundary; never put the service-role key here.
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
