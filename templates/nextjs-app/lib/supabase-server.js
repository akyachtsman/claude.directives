// Server (Server Components / Route Handlers / Server Actions) Supabase client.
// Default: anon key + cookies, so user-scoped RLS still applies server-side.
//
// For genuinely privileged operations only, build a separate client with
// SUPABASE_SERVICE_ROLE_KEY — a SERVER-ONLY env var (never NEXT_PUBLIC_*, never
// imported into client code). RLS stays enabled regardless. See directives/data.md.
//
// The exact cookie API tracks the Next version; follow Supabase's canonical
// guide for the current shape: https://supabase.com/docs/guides/auth/server-side/nextjs
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component (read-only cookies) — safe to ignore;
            // middleware refreshes the session.
          }
        },
      },
    }
  );
}
