"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppBottomNav,
  AppTopBar,
  type AppTab,
} from "@/components/AppShell";
import { ApplicationReport } from "@/components/ApplicationReport";
import { AutofillKit } from "@/components/AutofillKit";
import { InstallPrompt } from "@/components/InstallPrompt";
import { MatchList } from "@/components/MatchList";
import { ResumeUpload } from "@/components/ResumeUpload";
import type { Application, JobMatch, Resume } from "@/lib/types";
import { safeJobOpenUrl } from "@/lib/linkedin-url";

type Summary = {
  total: number;
  sent: number;
  opened?: number;
  notSent: number;
  prepared: number;
  skipped: number;
  failed: number;
};

export function HomeClient({ email }: { email?: string | null }) {
  const [tab, setTab] = useState<AppTab>("home");
  const [resume, setResume] = useState<Resume | null>(null);
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [summary, setSummary] = useState<Summary | undefined>();
  const [loadingResume, setLoadingResume] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [loadingApps, setLoadingApps] = useState(true);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [autoApplyBusyId, setAutoApplyBusyId] = useState<string | null>(null);
  const [restoreBusyId, setRestoreBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [autofillJob, setAutofillJob] = useState<{
    jobId?: string;
    title?: string | null;
    company?: string | null;
    url?: string | null;
    tailoredCvText?: string | null;
  } | null>(null);

  const pendingCount = useMemo(() => 0, []);

  const poolShownCount = useMemo(
    () => Math.min(matches.length, 50),
    [matches.length],
  );

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
        setMessage("נטען קו״ח שמור");
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch for resume/matches
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

        await Promise.all([
          loadMatches(resume?.id),
          loadApplications(resume?.id),
        ]);
        setMessage("המשרה הוסרה מהפול ועברה להיסטוריה");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "הסרה מהפול נכשלה");
      }
    },
    [resume, loadMatches, loadApplications],
  );

  const restoreToPool = useCallback(
    async (app: Application) => {
      setRestoreBusyId(app.id);
      setMessage(null);
      try {
        const res = await fetch("/api/applications/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicationId: app.id,
            jobId: app.job_id,
            resumeId: resume?.id || app.resume_id,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "החזרה לפול נכשלה");
        await Promise.all([
          loadMatches(resume?.id),
          loadApplications(resume?.id),
        ]);
        setMessage("המשרה חזרה לפול ✓");
        setTab("pool");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "החזרה לפול נכשלה");
      } finally {
        setRestoreBusyId(null);
      }
    },
    [resume, loadMatches, loadApplications],
  );

  function prepareApplyFromMatch(match: JobMatch) {
    const job = match.jobs;
    const app = applications.find(
      (a) => a.job_id === match.job_id || a.job_id === job?.id,
    );
    const openUrl = safeJobOpenUrl({
      url: job?.url,
      title: job?.title,
      source: job?.source,
      channel: job?.channel,
      external_id: job?.external_id,
    });
    setAutofillJob({
      jobId: job?.id || match.job_id,
      title: job?.title,
      company: job?.company,
      url: openUrl || job?.url,
      tailoredCvText: app?.tailored_cv_text,
    });
    setTab("cv");
    setMessage("המשרה נשארת בפול — מלא פרטים והגש באתר, או לחץ ״הסר מהפול״ כשסיימת");
  }

  const autoApplyFromMatch = useCallback(
    async (match: JobMatch) => {
      const job = match.jobs;
      const jobId = job?.id || match.job_id;
      if (!jobId) return;
      setAutoApplyBusyId(jobId);
      setMessage(null);
      try {
        const res = await fetch("/api/applications/auto-apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            matchId: match.id,
            resumeId: resume?.id,
          }),
        });
        const json = await res.json();
        if (res.ok && json.ok) {
          setMessage(json.detail || "הוגש אוטומטית בטופס האתר ✓");
          await Promise.all([
            loadMatches(resume?.id),
            loadApplications(resume?.id),
          ]);
          setTab("history");
          return;
        }

        // Do not open LinkedIn search / fake links — that looked like a fake apply
        setMessage(
          json.error ||
            "אין אפשרות להגשה אוטומטית למשרה הזו (חסר מייל מעסיק או טופס ATS).",
        );
        await loadMatches(resume?.id);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "הגשה אוטומטית נכשלה");
      } finally {
        setAutoApplyBusyId(null);
      }
    },
    [resume, loadMatches, loadApplications],
  );

  async function handleUploaded(
    next: Resume,
    meta?: { matches?: JobMatch[]; applications?: Application[] },
  ) {
    setResume(next);
    if (meta?.applications) {
      setApplications(meta.applications as Application[]);
    }
    await Promise.all([loadMatches(next.id), loadApplications(next.id)]);
    setMessage("הקו״ח נשמר");
    setTab("home");
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
        `סריקה הושלמה: פול ${Math.min(json.matchesCount ?? 0, 50)} · הוגש: ${json.sentCount ?? 0} · נפתח: ${json.openedCount ?? 0}`,
      );
      setTab("pool");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "שגיאה בהרצת הסריקה");
    } finally {
      setPipelineBusy(false);
    }
  }

  const sentCount = summary?.sent ?? 0;
  const openedCount = summary?.opened ?? 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <AppTopBar email={email} />
      <InstallPrompt />

      <main className="app-bottom-pad mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6">
        {message && (
          <p className="animate-rise rounded-xl border border-[var(--border)] bg-white/55 px-3 py-2 text-sm text-[var(--muted)]">
            {message}
          </p>
        )}

        {tab === "home" && (
          <section className="space-y-8">
            <header className="animate-rise space-y-3 pt-2">
              <p className="font-[family-name:var(--font-display)] text-5xl leading-none tracking-tight text-[var(--ink)] sm:text-6xl">
                AllIn
              </p>
              <h1 className="max-w-md text-xl font-medium leading-snug text-[var(--ink-soft)] sm:text-2xl">
                סוכן המשרות שלך בישראל
              </h1>
              <p className="max-w-md text-sm leading-relaxed text-[var(--muted)]">
                סורק LinkedIn ולוחות דרושים, מתאים לקו״ח, שולח במייל או מגיש
                אוטומטית בטופס האתר — הכל במקום אחד.
              </p>
            </header>

            <div className="animate-rise-delay-1 grid grid-cols-3 gap-3 text-center">
              <button
                type="button"
                onClick={() => setTab("pool")}
                className="rounded-2xl border border-[var(--border)] bg-white/60 px-2 py-4 transition hover:bg-white/90"
              >
                <p className="text-2xl font-semibold text-[var(--accent)]">
                  {poolShownCount}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">בפול</p>
              </button>
              <button
                type="button"
                onClick={() => setTab("history")}
                className="rounded-2xl border border-[var(--border)] bg-white/60 px-2 py-4 transition hover:bg-white/90"
              >
                <p className="text-2xl font-semibold text-[var(--accent)]">
                  {sentCount}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">הוגש</p>
              </button>
              <button
                type="button"
                onClick={() => setTab("history")}
                className="rounded-2xl border border-[var(--border)] bg-white/60 px-2 py-4 transition hover:bg-white/90"
              >
                <p className="text-2xl font-semibold text-[var(--accent)]">
                  {openedCount}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">הוסר</p>
              </button>
            </div>

            <div className="animate-rise-delay-2 space-y-3">
              <button
                type="button"
                onClick={() => void runPipeline()}
                disabled={pipelineBusy || !resume}
                className="flex w-full items-center justify-center rounded-2xl bg-[var(--ink)] px-4 py-4 text-base font-semibold text-white disabled:opacity-50"
              >
                {pipelineBusy
                  ? "רץ…"
                  : resume
                    ? "הפעל סריקה + הגשה אוטומטית"
                    : "העלה קו״ח כדי להתחיל"}
              </button>
              {!resume && (
                <button
                  type="button"
                  onClick={() => setTab("cv")}
                  className="w-full rounded-2xl border border-[var(--border)] bg-white/70 px-4 py-3 text-sm font-medium"
                >
                  העלאת קורות חיים
                </button>
              )}
              {resume && (
                <p className="text-center text-xs text-[var(--muted)]">
                  קו״ח פעיל: {resume.filename}
                </p>
              )}
            </div>
          </section>
        )}

        {tab === "pool" && (
          <section className="animate-rise space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">פול התאמות</h2>
                <p className="text-sm text-[var(--muted)]">
                  עד 50 · שליחת מייל/ATS רצה בסריקה · כפתור הגשה רק כשיש טופס אמיתי
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void runPipeline()}
                  disabled={pipelineBusy || !resume}
                  className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {pipelineBusy ? "רץ…" : "סריקה"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void loadMatches(resume?.id);
                    void loadApplications(resume?.id);
                  }}
                  className="rounded-xl border border-[var(--border)] bg-white/60 px-3 py-2 text-sm"
                >
                  רענון
                </button>
              </div>
            </div>
            <MatchList
              matches={matches}
              loading={loadingMatches}
              onDismissFromPool={(jobId, matchId) => {
                void markJobOpened(jobId, matchId);
              }}
              onPrepareApply={prepareApplyFromMatch}
              onAutoApply={(m) => void autoApplyFromMatch(m)}
              autoApplyBusyId={autoApplyBusyId}
            />
          </section>
        )}

        {tab === "history" && (
          <section className="animate-rise space-y-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">היסטוריה</h2>
                <p className="text-sm text-[var(--muted)]">
                  מייל/הגשה באתר · הוסרה מהפול (אפשר להחזיר)
                </p>
            </div>
            <ApplicationReport
              applications={applications}
              loading={loadingApps}
              resume={resume}
              summary={summary}
              onRestoreToPool={(app) => void restoreToPool(app)}
              restoreBusyId={restoreBusyId}
            />
          </section>
        )}

        {tab === "cv" && (
          <section className="animate-rise space-y-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">קו״ח ומילוי</h2>
              <p className="text-sm text-[var(--muted)]">
                העלאה, פרטי מילוי אוטומטי והורדת קובץ לצירוף
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-[var(--muted)]">קובץ קו״ח</h3>
              {loadingResume ? (
                <p className="text-sm text-[var(--muted)]">טוען…</p>
              ) : resume ? (
                <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-white/60 px-4 py-3">
                  <p className="text-sm">
                    שמור:{" "}
                    <span className="font-medium">{resume.filename}</span>
                    {resume.skills?.length > 0 && (
                      <> · {resume.skills.slice(0, 6).join(", ")}</>
                    )}
                  </p>
                  <ResumeUpload onUploaded={handleUploaded} />
                </div>
              ) : (
                <ResumeUpload onUploaded={handleUploaded} />
              )}
            </div>

            {resume && (
              <div id="autofill-section" className="space-y-3">
                <h3 className="text-sm font-semibold text-[var(--muted)]">
                  מילוי טפסים מהקו״ח
                  {autofillJob?.title ? ` · ${autofillJob.title}` : ""}
                </h3>
                <AutofillKit
                  resumeText={resume.extracted_text}
                  skills={resume.skills}
                  resumeId={resume.id}
                  jobTitle={autofillJob?.title}
                  jobCompany={autofillJob?.company}
                  jobUrl={autofillJob?.url}
                  tailoredCvText={autofillJob?.tailoredCvText}
                />
              </div>
            )}
          </section>
        )}
      </main>

      <AppBottomNav
        active={tab}
        onChange={setTab}
        poolCount={poolShownCount}
        pendingCount={pendingCount}
      />
    </div>
  );
}
