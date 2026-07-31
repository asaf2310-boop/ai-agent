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

    // Keep next in a short-lived cookie — redirectTo must be exact allow-listed URL (no query).
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

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 break-words">
          שגיאת התחברות: {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        className="inline-flex items-center justify-center gap-3 rounded-lg bg-[var(--accent)] px-4 py-3 text-sm font-medium text-white hover:opacity-95"
      >
        <span aria-hidden>G</span>
        התחבר עם Gmail
      </button>

      <p className="text-center text-xs text-[var(--muted)]">
        אחרי Google תוחזר ל־/auth/callback באתר זה
      </p>
    </div>
  );
}

export function LoginForm() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm">טוען…</div>}>
      <LoginFormInner />
    </Suspense>
  );
}
