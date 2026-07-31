"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";

function LoginFormInner() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  async function signInWithGoogle() {
    const supabase = createClient();
    const origin = window.location.origin;
    const next = searchParams.get("next") || "/";

    document.cookie = `auth_next=${encodeURIComponent(next)}; Path=/; Max-Age=600; SameSite=Lax`;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
        skipBrowserRedirect: false,
      },
    });

    if (oauthError) {
      alert(oauthError.message);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(46,196,156,0.45), transparent 55%), linear-gradient(180deg, #0c1a22 0%, #123040 48%, #0c1a22 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] opacity-40"
        aria-hidden
        style={{
          backgroundImage:
            "linear-gradient(rgba(46,196,156,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(46,196,156,0.12) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "linear-gradient(to top, black, transparent)",
        }}
      />

      <main className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col justify-between px-6 pb-10 pt-16 sm:pt-24">
        <header className="animate-rise space-y-6 text-center text-white">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0c1a22] shadow-[0_0_0_1px_rgba(46,196,156,0.45),0_20px_50px_rgba(0,0,0,0.35)]">
            <span className="font-[family-name:var(--font-display)] text-3xl font-bold text-[var(--accent-bright)]">
              A
            </span>
          </div>
          <div className="space-y-3">
            <h1 className="font-[family-name:var(--font-display)] text-5xl leading-none tracking-tight sm:text-6xl">
              AllIn
            </h1>
            <p className="text-base text-white/75 sm:text-lg">
              סוכן המשרות שלך — סורק, מתאים, ושולח.
            </p>
          </div>
        </header>

        <div className="animate-rise-delay-1 mt-12 space-y-4">
          {error && (
            <p className="rounded-xl border border-red-300/40 bg-red-500/15 px-3 py-2 text-sm text-red-100 break-words">
              שגיאת התחברות: {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="animate-pulse-ring inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-[var(--accent-bright)] px-4 py-4 text-base font-semibold text-[var(--ink)] transition hover:brightness-105"
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-bold text-[#4285F4]"
              aria-hidden
            >
              G
            </span>
            התחבר עם Gmail
          </button>

          <p className="animate-rise-delay-2 text-center text-xs leading-relaxed text-white/55">
            הקו״ח, ההתאמות וההיסטוריה שלך פרטיים — רק אחרי התחברות.
            <br />
            אפשר להתקין את AllIn למסך הבית אחרי הכניסה.
          </p>
        </div>
      </main>
    </div>
  );
}

export function LoginForm() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[var(--ink)] text-sm text-white/70">
          טוען…
        </div>
      }
    >
      <LoginFormInner />
    </Suspense>
  );
}
