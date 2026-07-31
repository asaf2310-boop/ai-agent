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
  const [loadingResume, setLoadingResume] = useState(true);
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

  const loadSavedResume = useCallback(async () => {
    setLoadingResume(true);
    try {
      const res = await fetch("/api/resumes");
      const json = await res.json();
      if (res.ok && json.resume) {
        setResume(json.resume as Resume);
        setMessage("נטען קו״ח שמור מהחשבון שלך — אין צורך להעלות מחדש.");
        await Promise.all([
          loadMatches(json.resume.id),
          loadApplications(json.resume.id),
        ]);
        return;
      }
      await Promise.all([loadMatches(), loadApplications()]);
    } finally {
      setLoadingResume(false);
    }
  }, [loadMatches, loadApplications]);

  useEffect(() => {
    void loadSavedResume();
  }, [loadSavedResume]);

  async function handleUploaded(
    next: Resume,
    meta?: { matches?: JobMatch[]; applications?: Application[] },
  ) {
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
      "הקו״ח נשמר בחשבון שלך. בוצעו התאמה, שכתוב, וניסיון שליחה — ראה דוח למטה.",
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
      if (json.resume) setResume(json.resume as Resume);
      setMatches(json.matches ?? []);
      setApplications(json.applications ?? []);
      await loadApplications(json.resume?.id || resume?.id);
      setMessage(
        `סריקה הושלמה: ${json.matchesCount ?? 0} התאמות בישראל, ${json.applicationsCount ?? 0} רשומות בדוח.`,
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
          קו״ח נשמר בחשבון. סריקה בישראל — AI, פיננסים, מוצר, ניהול ועוד — כולל
          פוסטים בסגנון LinkedIn. סריקה אוטומטית פעמיים ביום.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. קו״ח</h2>
        {loadingResume ? (
          <p className="text-sm text-[var(--muted)]">טוען קו״ח שמור…</p>
        ) : resume ? (
          <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <p className="text-sm">
              קו״ח שמור:{" "}
              <span className="font-medium text-[var(--foreground)]">
                {resume.filename}
              </span>
              {resume.skills?.length > 0 && (
                <> · כישורים: {resume.skills.join(", ")}</>
              )}
            </p>
            <p className="text-xs text-[var(--muted)]">
              אין צורך להעלות שוב. להחלפה — בחר קובץ חדש למטה.
            </p>
            <ResumeUpload onUploaded={handleUploaded} />
          </div>
        ) : (
          <ResumeUpload onUploaded={handleUploaded} />
        )}
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">2. התאמות</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runPipeline()}
              disabled={pipelineBusy || !resume}
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
