import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function safeNext(path: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const { searchParams, origin } = url;

  // OAuth provider / Supabase error (no code in this case)
  const oauthError =
    searchParams.get("error_description") ||
    searchParams.get("error") ||
    searchParams.get("error_code");
  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(oauthError)}`,
    );
  }

  const code = searchParams.get("code");
  const next = safeNext(
    searchParams.get("next") || request.cookies.get("auth_next")?.value || "/",
  );

  const forwardHost = request.headers.get("x-forwarded-host");
  const redirectBase =
    process.env.NODE_ENV !== "development" && forwardHost
      ? `https://${forwardHost}`
      : origin;

  if (!code) {
    // Often means redirect URL is not allow-listed, or Site URL caught the return.
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        "missing_code — ודא שב-Supabase Redirect URLs יש: " +
          `${origin}/auth/callback`,
      )}`,
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anon) {
    return NextResponse.redirect(`${origin}/login?error=missing_env`);
  }

  let response = NextResponse.redirect(`${redirectBase}${next}`);
  response.cookies.set("auth_next", "", { path: "/", maxAge: 0 });

  const supabase = createServerClient(supabaseUrl, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.redirect(`${redirectBase}${next}`);
        response.cookies.set("auth_next", "", { path: "/", maxAge: 0 });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, {
            ...options,
            sameSite: "lax",
            secure: process.env.NODE_ENV !== "development",
            path: "/",
          });
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return response;
}
