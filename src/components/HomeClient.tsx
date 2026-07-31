"use client";

import { useCallback, useEffect, useState } from "react";
import { MatchList } from "@/components/MatchList";
import { ResumeUpload } from "@/components/ResumeUpload";
import type { JobMatch, Resume } from "@/lib/types";

export function HomeClient() {
  const [resume, setResume] = useState<Resume | null>(null);
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMatches = useCallback(async (resumeId?: string) => {
    setLoading(true);
    try {
      const qs = resumeId ? `?resumeId=${encodeURIComponent(resumeId)}` : "";
      const res = await fetch(`/api/matches${qs}`);
      const json = await res.json();
      if (res.ok) {
        setMatches(json.matches ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  async function handleUploaded(next: Resume) {
    setResume(next);
    await loadMatches(next.id);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-5 py-12">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-[var(--accent)]">
          AI Agent
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-4xl leading-tight tracking-tight sm:text-5xl">
          משרות בישראל שמתאימות לך
        </h1>
        <p className="max-w-xl text-base text-[var(--muted)]">
          העלה קו״ח, והמערכת תסרוק משרות חדשות ותתאים אותן אליך — רענון יומי דרך
          GitHub Actions ו-Supabase.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. קו״ח</h2>
        <ResumeUpload onUploaded={handleUploaded} />
        {resume && (
          <p className="text-sm text-[var(--muted)]">
            הועלה:{" "}
            <span className="text-[var(--foreground)]">{resume.filename}</span>
            {resume.skills.length > 0 && (
              <> · כישורים: {resume.skills.join(", ")}</>
            )}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">2. התאמות</h2>
          <button
            type="button"
            onClick={() => void loadMatches(resume?.id)}
            className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface)]"
          >
            רענון
          </button>
        </div>
        <MatchList matches={matches} loading={loading} />
      </section>
    </div>
  );
}
