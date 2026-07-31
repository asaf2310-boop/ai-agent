"use client";

import type { Application } from "@/lib/types";

type Props = {
  applications: Application[];
  loading: boolean;
  summary?: {
    total: number;
    sent: number;
    prepared: number;
    skipped: number;
    failed: number;
  };
};

function statusLabel(app: Application): string {
  if (app.status === "sent" && app.method === "job-email") return "נשלח למעסיק";
  if (app.status === "sent") return "נשמר במערכת";
  if (app.status === "prepared") return "מוכן במערכת";
  if (app.status === "skipped") return "דולג";
  if (app.status === "failed") return "נכשל";
  return app.status;
}

export function ApplicationReport({ applications, loading, summary }: Props) {
  if (loading) {
    return <p className="text-sm text-[var(--muted)]">טוען דוח…</p>;
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
          <span>סה״כ: {summary.total}</span>
          <span className="text-[var(--accent)]">
            מוכן במערכת: {summary.prepared + summary.sent}
          </span>
          <span>דולג: {summary.skipped}</span>
          <span className="text-red-700">נכשל: {summary.failed}</span>
        </div>
      )}

      {applications.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          עדיין אין רשומות. אחרי סריקה — ההתאמות והקו״ח המותאם יופיעו כאן במערכת
          (בלי מייל התראה).
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {applications.map((app) => {
            const job = app.jobs;
            return (
              <li key={app.id} className="space-y-2 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">
                    {job?.url ? (
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-[var(--accent)]"
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
                {job?.location && (
                  <p className="text-xs text-[var(--muted)]">
                    {[job.location, job.channel || job.source]
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
                    >
                      קישור למשרה / פוסט ↗
                    </a>
                  </p>
                )}
                {app.skip_reason && (
                  <p className="text-sm text-[var(--muted)]">{app.skip_reason}</p>
                )}
                {app.error && (
                  <p className="text-sm text-red-700">{app.error}</p>
                )}
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
          })}
        </ul>
      )}
    </div>
  );
}
