"use client";

import { useCallback, useEffect, useState } from "react";
import { ApplicationReport } from "@/components/ApplicationReport";
import { AutofillKit } from "@/components/AutofillKit";
import { MatchList } from "@/components/MatchList";
import { ResumeUpload } from "@/components/ResumeUpload";
import type { Application, JobMatch, Resume } from "@/lib/types";

type Summary = {
  total: number;
  sent: number;
  opened?: number;
  notSent: number;
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
  const [autofillJob, setAutofillJob] = useState<{
    jobId?: string;
    title?: string | null;
    company?: string | null;
    url?: string | null;
    tailoredCvText?: string | null;
  } | null>(null);

  const loadMatches = useCallback(async (resumeId?: string) => {
    setLoadingMatches(true);
    try {
      const qs = resumeId ? `?resumeId=${encodeURIComponent(resumeId)}` : "";
      const res = await fetch(`/api/matches${qs}`);
      const json = await res.json();
      if (res.ok) {
        setMatches(json.matches ?? []);
      } else {
        setMessage(json.error || "טעינת התאמות נכשלה");
      }
    } catch {
      setMessage("טעינת התאמות נכשלה");
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
        setMessage("נטען קו״ח שמור — פרטי מילוי טפסים זמינים למטה.");
        await Promise.all([
          loadMatches(json.resume.id),
          loadApplications(json.resume.id),
        ]);
        return;
      }
      if (!res.ok) {
        setMessage(json.error || "טעינת קו״ח נכשלה");
      }
      await Promise.all([loadMatches(), loadApplications()]);
    } finally {
      setLoadingResume(false);
    }
  }, [loadMatches, loadApplications]);

  useEffect(() => {
    void loadSavedResume();
  }, [loadSavedResume]);

  const markJobOpened = useCallback(
    async (jobId: string, matchId?: string) => {
      try {
        const res = await fetch("/api/applications/open", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            matchId,
            resumeId: resume?.id,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "סימון נכשל");

        const job = json.application?.jobs;
        const fromMatch = matches.find(
          (m) => m.job_id === jobId || m.jobs?.id === jobId,
        );
        setAutofillJob({
          jobId,
          title: job?.title || fromMatch?.jobs?.title,
          company: job?.company || fromMatch?.jobs?.company,
          url: job?.url || fromMatch?.jobs?.url,
          tailoredCvText:
            json.application?.tailored_cv_text ||
            applications.find((a) => a.job_id === jobId)?.tailored_cv_text,
        });

        await Promise.all([
          loadMatches(resume?.id),
          loadApplications(resume?.id),
        ]);
        setMessage(
          "המשרה ירדה מהפול להיסטוריה. השתמש במילוי הפרטים למטה לטופס באתר.",
        );
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "סימון קישור נכשל");
      }
    },
    [resume?.id, matches, applications, loadMatches, loadApplications],
  );

  function prepareApplyFromMatch(match: JobMatch) {
    const job = match.jobs;
    const app = applications.find(
      (a) => a.job_id === match.job_id || a.job_id === job?.id,
    );
    setAutofillJob({
      jobId: job?.id || match.job_id,
      title: job?.title,
      company: job?.company,
      url: job?.url,
      tailoredCvText: app?.tailored_cv_text,
    });
    if (job?.id) {
      void markJobOpened(job.id, match.id);
    }
    // Scroll to autofill section
    requestAnimationFrame(() => {
      document
        .getElementById("autofill-section")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleUploaded(
    next: Resume,
    meta?: { matches?: JobMatch[]; applications?: Application[] },
  ) {
    setResume(next);
    if (meta?.applications) {
      setApplications(meta.applications as Application[]);
    }
    await Promise.all([loadMatches(next.id), loadApplications(next.id)]);
    setMessage("הקו״ח נשמר. אפשר למלא טפסי הגשה אוטומטית מהפרטים שנמשכו.");
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
      if (!res.ok) throw new Error(json.error || "הסריקה נכשלה");
      if (json.resume) setResume(json.resume as Resume);
      setApplications(json.applications ?? []);
      await Promise.all([
        loadMatches(json.resume?.id || resume?.id),
        loadApplications(json.resume?.id || resume?.id),
      ]);
      setMessage(
        `סריקה הושלמה: פול ${json.matchesCount ?? 0} · נשלח: ${json.sentCount ?? 0} · נפתח: ${json.openedCount ?? 0}`,
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
          המערכת מושכת מהקו״ח שם, מייל, טלפון ועוד — ממלאת טפסי הגשה באתרים, ונותנת
          קובץ קו״ח לצירוף. סריקה פעמיים ביום כולל LinkedIn (משרות בישראל מהשבוע
          האחרון). משרה שנשלחה או שנפתח הקישור שלה יורדת להיסטוריה.
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

      {resume && (
        <section id="autofill-section" className="space-y-3">
          <h2 className="text-xl font-semibold">2. מילוי טפסי הגשה מהקו״ח</h2>
          <p className="text-sm text-[var(--muted)]">
            הפרטים נמשכים אוטומטית מהקו״ח. לחץ ״מלא טופס מהקו״ח״ על משרה בפול, או
            השתמש בחבילה כאן + הורד קובץ לצירוף באתר הדרושים.
          </p>
          <AutofillKit
            resumeText={resume.extracted_text}
            skills={resume.skills}
            resumeId={resume.id}
            jobTitle={autofillJob?.title}
            jobCompany={autofillJob?.company}
            jobUrl={autofillJob?.url}
            tailoredCvText={autofillJob?.tailoredCvText}
          />
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            {resume ? "3" : "2"}. פול התאמות
          </h2>
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
        <MatchList
          matches={matches}
          loading={loadingMatches}
          onOpenJobLink={(jobId, matchId) => {
            void markJobOpened(jobId, matchId);
          }}
          onPrepareApply={prepareApplyFromMatch}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">
          {resume ? "4" : "3"}. היסטוריה — נשלח / נפתח
        </h2>
        <ApplicationReport
          applications={applications}
          loading={loadingApps}
          resume={resume}
          summary={summary}
          onOpenJobLink={(jobId) => {
            const app = applications.find((a) => a.job_id === jobId);
            setAutofillJob({
              jobId,
              title: app?.jobs?.title,
              company: app?.jobs?.company,
              url: app?.jobs?.url,
              tailoredCvText: app?.tailored_cv_text,
            });
            void markJobOpened(jobId, app?.match_id || undefined);
          }}
        />
      </section>
    </div>
  );
}
