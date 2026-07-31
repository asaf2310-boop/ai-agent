import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Server client for Auth + DB. Schema only affects PostgREST, not auth. */
export async function createClient() {
  const cookieStore = await cookies();
  const schema = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "job_agent";

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema },
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
            // Server Component — middleware will refresh session.
          }
        },
      },
    },
  );
}
