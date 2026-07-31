"use client";

import { AutofillKit } from "@/components/AutofillKit";
import {
  wasLinkOpened,
  wasSentToEmployer,
} from "@/lib/apply-email";
import type { Application, Resume } from "@/lib/types";

type Props = {
  applications: Application[];
  loading: boolean;
  resume?: Resume | null;
  summary?: {
    total: number;
    sent: number;
    notSent?: number;
    opened?: number;
    prepared: number;
    skipped: number;
    failed: number;
  };
  onOpenJobLink?: (jobId: string) => void;
};

function statusLabel(app: Application): string {
  if (wasSentToEmployer(app)) return "נשלח";
  if (wasLinkOpened(app)) return "נפתח";
  if (app.status === "failed") return "שגיאה";
  return "לא נשלח";
}

function ApplicationCard({
  app,
  resume,
  onOpenJobLink,
}: {
  app: Application;
  resume?: Resume | null;
  onOpenJobLink?: (jobId: string) => void;
}) {
  const job = app.jobs;
  const sent = wasSentToEmployer(app);
  const opened = wasLinkOpened(app);
  const employerEmail = job?.apply_email;

  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          {job?.url ? (
            <a
              href={job.url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--accent)]"
              onClick={() => {
                if (job.id) onOpenJobLink?.(job.id);
              }}
            >
              {job.title}
              {job.company ? ` · ${job.company}` : ""}
            </a>
          ) : (
            <>
              {job?.title ?? "משרה"}
              {job?.company ? ` · ${job.company}` : ""}
            </>
          )}
        </h3>
        <span
          className={`text-sm font-medium ${
            sent || opened ? "text-[var(--accent)]" : "text-[var(--muted)]"
          }`}
        >
          {statusLabel(app)}
        </span>
      </div>
      <p className="text-xs text-[var(--muted)]">
        {[job?.location, job?.channel || job?.source].filter(Boolean).join(" · ")}
      </p>
      {sent && employerEmail && (
        <p className="text-sm text-[var(--foreground)]/85">
          <span className="font-medium">נשלח אל המעסיק: </span>
          {employerEmail}
        </p>
      )}
      {app.recruiter_insights && (
        <p className="text-sm text-[var(--foreground)]/85">
          <span className="font-medium">סיכום התאמה: </span>
          {app.recruiter_insights}
        </p>
      )}
      {job?.url && (
        <p className="text-sm">
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            onClick={() => {
              if (job.id) onOpenJobLink?.(job.id);
            }}
          >
            פתח טופס הגשה באתר ↗
          </a>
        </p>
      )}
      {app.skip_reason && (
        <p className="text-sm text-[var(--muted)]">{app.skip_reason}</p>
      )}
      {app.error && (
        <details className="text-sm">
          <summary className="cursor-pointer text-red-700">
            פרטי שגיאה טכניים
          </summary>
          <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all text-xs text-red-700/90">
            {app.error}
          </pre>
        </details>
      )}

      {resume && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-[var(--accent)]">
            מלא פרטים מהקו״ח + הורד קובץ לצירוף
          </summary>
          <div className="mt-2">
            <AutofillKit
              resumeText={resume.extracted_text}
              skills={resume.skills}
              resumeId={resume.id}
              jobTitle={job?.title}
              jobCompany={job?.company}
              jobUrl={job?.url}
              tailoredCvText={app.tailored_cv_text}
              compact
            />
          </div>
        </details>
      )}

      {app.tailored_cv_text && (
        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--accent)]">
            קו״ח מותאם (טקסט)
          </summary>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--surface)] p-3 text-xs leading-relaxed">
            {app.tailored_cv_text}
          </pre>
        </details>
      )}
    </li>
  );
}

function AppList({
  apps,
  resume,
  onOpenJobLink,
}: {
  apps: Application[];
  resume?: Resume | null;
  onOpenJobLink?: (jobId: string) => void;
}) {
  return (
    <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {apps.map((app) => (
        <ApplicationCard
          key={app.id}
          app={app}
          resume={resume}
          onOpenJobLink={onOpenJobLink}
        />
      ))}
    </ul>
  );
}

function isHistoryWorthy(app: Application): boolean {
  return (
    wasSentToEmployer(app) ||
    wasLinkOpened(app) ||
    app.status === "failed"
  );
}

export function ApplicationReport({
  applications,
  loading,
  resume,
  summary,
  onOpenJobLink,
}: Props) {
  if (loading) {
    return <p className="text-sm text-[var(--muted)]">טוען דוח…</p>;
  }

  const history = applications.filter(isHistoryWorthy);
  const sentApps = history.filter((a) => wasSentToEmployer(a));
  const openedApps = history.filter(
    (a) => wasLinkOpened(a) && !wasSentToEmployer(a),
  );
  const failedApps = history.filter(
    (a) =>
      a.status === "failed" && !wasSentToEmployer(a) && !wasLinkOpened(a),
  );
  const sentCount = summary?.sent ?? sentApps.length;
  const openedCount = summary?.opened ?? openedApps.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
        <span>בהיסטוריה: {history.length}</span>
        <span className="font-medium text-[var(--accent)]">
          נשלח: {sentCount}
        </span>
        <span className="font-medium text-[var(--accent)]">
          נפתח: {openedCount}
        </span>
        {failedApps.length > 0 && (
          <span className="font-medium text-red-700">
            שגיאות: {failedApps.length}
          </span>
        )}
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          עדיין אין היסטוריה. אחרי שליחה למעסיק או פתיחת קישור — המשרה תופיע כאן.
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-lg font-semibold text-[var(--accent)]">
              נשלח למעסיק ({sentApps.length})
            </h3>
            {sentApps.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">עדיין אין שליחות מייל.</p>
            ) : (
              <AppList
                apps={sentApps}
                resume={resume}
                onOpenJobLink={onOpenJobLink}
              />
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-semibold text-[var(--accent)]">
              נפתח קישור ({openedApps.length})
            </h3>
            {openedApps.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                עדיין לא נפתח אף קישור מהפול.
              </p>
            ) : (
              <AppList
                apps={openedApps}
                resume={resume}
                onOpenJobLink={onOpenJobLink}
              />
            )}
          </section>

          {failedApps.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-lg font-semibold text-red-700">
                שגיאות שליחה ({failedApps.length})
              </h3>
              <AppList
                apps={failedApps}
                resume={resume}
                onOpenJobLink={onOpenJobLink}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
