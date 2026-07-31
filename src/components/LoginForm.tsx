"use client";

import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  async function signInWithGoogle() {
    const supabase = createClient();
    const origin = window.location.origin;
    const next = new URLSearchParams(window.location.search).get("next") || "/";

    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col justify-center gap-8 px-5 py-16">
      <header className="space-y-3 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
          AI Agent
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl tracking-tight sm:text-4xl">
          התחברות מאובטחת
        </h1>
        <p className="text-sm text-[var(--muted)]">
          הנתונים שלך (קו״ח, התאמות, דוחות) זמינים רק אחרי התחברות עם Gmail —
          ולא חשופים לציבור.
        </p>
      </header>

      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        className="inline-flex items-center justify-center gap-3 rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-medium text-white hover:opacity-95"
      >
        <span aria-hidden>G</span>
        התחבר עם Gmail
      </button>
    </div>
  );
}
