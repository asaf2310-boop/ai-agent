"use client";

import { AutofillKit } from "@/components/AutofillKit";
import {
  isHistoryEntry,
  wasLinkOpened,
  wasSentToRealEmployer,
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
  if (wasSentToRealEmployer(app)) return "נשלח למעסיק";
  if (wasLinkOpened(app)) return "נפתח";
  return "";
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
  const sent = wasSentToRealEmployer(app);
  const opened = wasLinkOpened(app);
  const employerEmail = sent ? job?.apply_email : null;

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
        <span className="text-sm font-medium text-[var(--accent)]">
          {statusLabel(app)}
        </span>
      </div>
      <p className="text-xs text-[var(--muted)]">
        {[job?.location, job?.channel || job?.source].filter(Boolean).join(" · ")}
      </p>
      {sent && employerEmail && (
        <p className="text-sm text-[var(--foreground)]/85">
          <span className="font-medium">נשלח אל מייל המעסיק: </span>
          {employerEmail}
        </p>
      )}
      {sent && (
        <p className="text-xs text-[var(--muted)]">
          המעסיק יכול להשיב ישירות למייל שלך (Reply-To).
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

  const history = applications.filter(isHistoryEntry);
  const sentApps = history.filter((a) => wasSentToRealEmployer(a));
  const openedApps = history.filter(
    (a) => wasLinkOpened(a) && !wasSentToRealEmployer(a),
  );
  const sentCount = summary?.sent ?? sentApps.length;
  const openedCount = summary?.opened ?? openedApps.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
        <span>בהיסטוריה: {history.length}</span>
        <span className="font-medium text-[var(--accent)]">
          נשלח למעסיק: {sentCount}
        </span>
        <span className="font-medium text-[var(--accent)]">
          נפתח: {openedCount}
        </span>
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          עדיין אין היסטוריה. כאן יופיעו רק משרות שנשלחו למייל מעסיק אמיתי, או
          שנפתח הקישור שלהן מהפול.
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-lg font-semibold text-[var(--accent)]">
              נשלח למייל מעסיק ({sentApps.length})
            </h3>
            {sentApps.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                עדיין אין שליחות למייל מעסיק אמיתי. כשאין מייל בהגשה — השתמשו
                בפתיחת הקישור ובמילוי ידני.
              </p>
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
        </>
      )}
    </div>
  );
}
