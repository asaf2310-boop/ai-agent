"use client";

import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

export type AppTab = "home" | "pool" | "history" | "cv";

type Props = {
  email?: string | null;
  active: AppTab;
  onChange: (tab: AppTab) => void;
  poolCount?: number;
  pendingCount?: number;
};

const tabs: Array<{
  id: AppTab;
  label: string;
  icon: (active: boolean) => ReactNode;
}> = [
  {
    id: "home",
    label: "בית",
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
          stroke="currentColor"
          strokeWidth={active ? 2.2 : 1.7}
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: "pool",
    label: "פול",
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 7h16M4 12h16M4 17h10"
          stroke="currentColor"
          strokeWidth={active ? 2.2 : 1.7}
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: "history",
    label: "היסטוריה",
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle
          cx="12"
          cy="12"
          r="8"
          stroke="currentColor"
          strokeWidth={active ? 2.2 : 1.7}
        />
        <path
          d="M12 8v4l3 2"
          stroke="currentColor"
          strokeWidth={active ? 2.2 : 1.7}
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: "cv",
    label: "קו״ח",
    icon: (active) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          strokeWidth={active ? 2.2 : 1.7}
          strokeLinejoin="round"
        />
        <path
          d="M14 3.5V8h4M8.5 12h7M8.5 16h5"
          stroke="currentColor"
          strokeWidth={active ? 2.2 : 1.7}
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export function AppTopBar({ email }: { email?: string | null }) {
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_82%,white)]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className="brand-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold tracking-tight text-[var(--accent-bright)] shadow-[inset_0_0_0_1px_rgba(46,196,156,0.35)]"
            aria-hidden
          >
            A
          </div>
          <div className="min-w-0">
            <p className="font-[family-name:var(--font-display)] text-lg leading-none tracking-tight">
              AllIn
            </p>
            <p className="truncate text-[11px] text-[var(--muted)]">
              {email || "סוכן משרות"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="shrink-0 rounded-xl border border-[var(--border)] bg-white/50 px-3 py-1.5 text-xs font-medium hover:bg-white/80"
        >
          התנתק
        </button>
      </div>
    </header>
  );
}

export function AppBottomNav({
  active,
  onChange,
  poolCount = 0,
  pendingCount = 0,
}: Omit<Props, "email">) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--ink)_96%,#1a8f72)] text-white"
      style={{ paddingBottom: "var(--safe-bottom)" }}
      aria-label="ניווט ראשי"
    >
      <ul className="mx-auto grid h-[var(--nav-h)] max-w-3xl grid-cols-4">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          const badge =
            tab.id === "pool"
              ? poolCount
              : tab.id === "history"
                ? pendingCount
                : 0;
          return (
            <li key={tab.id} className="relative">
              <button
                type="button"
                onClick={() => onChange(tab.id)}
                className={`flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] transition ${
                  isActive
                    ? "text-[var(--accent-bright)]"
                    : "text-white/65 hover:text-white"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="relative">
                  {tab.icon(isActive)}
                  {badge > 0 && (
                    <span className="absolute -left-2.5 -top-1 min-w-[1.1rem] rounded-full bg-[var(--accent-bright)] px-1 text-center text-[9px] font-bold leading-4 text-[var(--ink)]">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                <span className={`font-medium ${isActive ? "opacity-100" : "opacity-80"}`}>
                  {tab.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
