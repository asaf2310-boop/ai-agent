"use client";

import { useCallback, useEffect, useState } from "react";
import { ApplicationReport } from "@/components/ApplicationReport";
import { MatchList } from "@/components/MatchList";
import { ResumeUpload } from "@/components/ResumeUpload";
import type { Application, JobMatch, Resume } from "@/lib/types";

type Summary = {
  total: number;
  sent: number;
  prepared: number;
  skipped: number;
  failed: number;
};

export function HomeClient() {
  const [resume, setResume] = useState<Resume | null>(null);
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [summary, setSummary] = useState<Summary | undefined>();
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadingApps, setLoadingApps] = useState(true);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadMatches = useCallback(async (resumeId?: string) => {
    setLoadingMatches(true);
    try {
      const qs = resumeId ? `?resumeId=${encodeURIComponent(resumeId)}` : "";
      const res = await fetch(`/api/matches${qs}`);
      const json = await res.json();
      if (res.ok) setMatches(json.matches ?? []);
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  const loadApplications = useCallback(async (resumeId?: string) => {
    setLoadingApps(true);
    try {
      const qs = resumeId ? `?resumeId=${encodeURIComponent(resumeId)}` : "";
      const res = await fetch(`/api/applications${qs}`);
      const json = await res.json();
      if (res.ok) {
        setApplications(json.applications ?? []);
        setSummary(json.summary);
      }
    } finally {
      setLoadingApps(false);
    }
  }, []);

  useEffect(() => {
    void loadMatches();
    void loadApplications();
  }, [loadMatches, loadApplications]);

  async function handleUploaded(next: Resume, meta?: { matches?: JobMatch[]; applications?: Application[] }) {
    setResume(next);
    if (meta?.matches) setMatches(meta.matches);
    else await loadMatches(next.id);
    if (meta?.applications) {
      setApplications(meta.applications as Application[]);
      await loadApplications(next.id);
    } else {
      await loadApplications(next.id);
    }
    setMessage(
      "הקו״ח הועלה. בוצעו התאמה, שכתוב, וניסיון שליחה — ראה דוח למטה.",
    );
  }

  async function runPipeline() {
    setPipelineBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId: resume?.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Pipeline failed");
      setMatches(json.matches ?? []);
      setApplications(json.applications ?? []);
      await loadApplications(json.resume?.id || resume?.id);
      setMessage(
        `סריקה הושלמה: ${json.matchesCount ?? 0} התאמות, ${json.applicationsCount ?? 0} רשומות בדוח.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "שגיאה בהרצת הסריקה");
    } finally {
      setPipelineBusy(false);
    }
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
          העלה קו״ח — המערכת סורקת משרות וגם פוסטים ברשתות על דרושים/פרילנס,
          משכתבת קו״ח, מציגה קישורים, ושולחת התראות. סריקה אוטומטית פעמיים ביום.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. קו״ח</h2>
        <ResumeUpload onUploaded={handleUploaded} />
        {resume && (
          <p className="text-sm text-[var(--muted)]">
            הועלה:{" "}
            <span className="text-[var(--foreground)]">{resume.filename}</span>
            {resume.skills?.length > 0 && (
              <> · כישורים: {resume.skills.join(", ")}</>
            )}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">2. התאמות</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runPipeline()}
              disabled={pipelineBusy}
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {pipelineBusy ? "רץ…" : "הפעל סריקה + שליחה"}
            </button>
            <button
              type="button"
              onClick={() => {
                void loadMatches(resume?.id);
                void loadApplications(resume?.id);
              }}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface)]"
            >
              רענון
            </button>
          </div>
        </div>
        {message && <p className="text-sm text-[var(--muted)]">{message}</p>}
        <MatchList matches={matches} loading={loadingMatches} />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">3. דוח שליחות</h2>
        <ApplicationReport
          applications={applications}
          loading={loadingApps}
          summary={summary}
        />
      </section>
    </div>
  );
}
