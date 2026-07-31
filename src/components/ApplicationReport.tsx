"use client";

import {
  wasLinkOpened,
  wasSentToEmployer,
} from "@/lib/apply-email";
import type { Application } from "@/lib/types";

type Props = {
  applications: Application[];
  loading: boolean;
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
  return "לא נשלח";
}

function ApplicationCard({
  app,
  onOpenJobLink,
}: {
  app: Application;
  onOpenJobLink?: (jobId: string) => void;
}) {
  const job = app.jobs;
  const sent = wasSentToEmployer(app);
  const opened = wasLinkOpened(app);

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
      {job?.location && (
        <p className="text-xs text-[var(--muted)]">
          {[job.location, job.channel || job.source, job.apply_email]
            .filter(Boolean)
            .join(" · ")}
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
            קישור למשרה / הגשה ידנית ↗
          </a>
        </p>
      )}
      {app.skip_reason && (
        <p className="text-sm text-[var(--muted)]">{app.skip_reason}</p>
      )}
      {app.error && <p className="text-sm text-red-700">{app.error}</p>}
      {app.tailored_cv_text && (
        <details className="text-sm">
          <summary className="cursor-pointer text-[var(--accent)]">
            קו״ח מותאם
          </summary>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--surface)] p-3 text-xs leading-relaxed">
            {app.tailored_cv_text}
          </pre>
        </details>
      )}
    </li>
  );
}

export function ApplicationReport({
  applications,
  loading,
  summary,
  onOpenJobLink,
}: Props) {
  if (loading) {
    return <p className="text-sm text-[var(--muted)]">טוען דוח…</p>;
  }

  const sentApps = applications.filter((a) => wasSentToEmployer(a));
  const openedApps = applications.filter(
    (a) => wasLinkOpened(a) && !wasSentToEmployer(a),
  );
  const pendingApps = applications.filter(
    (a) => !wasSentToEmployer(a) && !wasLinkOpened(a),
  );
  const sentCount = summary?.sent ?? sentApps.length;
  const openedCount = summary?.opened ?? openedApps.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
        <span>סה״כ: {summary?.total ?? applications.length}</span>
        <span className="font-medium text-[var(--accent)]">
          נשלח: {sentCount}
        </span>
        <span className="font-medium text-[var(--accent)]">
          נפתח: {openedCount}
        </span>
        <span className="font-medium">ממתין: {pendingApps.length}</span>
      </div>

      {applications.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          עדיין אין רשומות. לחץ ״הפעל סריקה + שליחה״, או פתח קישור למשרה מהפול —
          והיא תעבור לכאן להיסטוריה.
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-lg font-semibold text-[var(--accent)]">
              היסטוריה — נשלח למעסיק ({sentApps.length})
            </h3>
            <p className="text-sm text-[var(--muted)]">
              ירדו מהפול ולא יחזרו אחרי סריקה.
            </p>
            {sentApps.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">עדיין אין שליחות מייל.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
                {sentApps.map((app) => (
                  <ApplicationCard
                    key={app.id}
                    app={app}
                    onOpenJobLink={onOpenJobLink}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-semibold text-[var(--accent)]">
              היסטוריה — נפתח קישור ({openedApps.length})
            </h3>
            <p className="text-sm text-[var(--muted)]">
              משרות שנכנסת לקישור שלהן — ירדו מהפול ולא יחזרו.
            </p>
            {openedApps.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                עדיין לא נפתח אף קישור מהפול.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
                {openedApps.map((app) => (
                  <ApplicationCard
                    key={app.id}
                    app={app}
                    onOpenJobLink={onOpenJobLink}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-semibold">
              ממתינות ({pendingApps.length})
            </h3>
            <p className="text-sm text-[var(--muted)]">
              עדיין בפול / לא נפתחו ולא נשלחו — קו״ח מותאם מוכן.
            </p>
            {pendingApps.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">אין ממתינות.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
                {pendingApps.map((app) => (
                  <ApplicationCard
                    key={app.id}
                    app={app}
                    onOpenJobLink={onOpenJobLink}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
