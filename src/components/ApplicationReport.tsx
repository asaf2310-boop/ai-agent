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

const STATUS_HE: Record<Application["status"], string> = {
  sent: "נשלח",
  prepared: "הוכן / ממתין",
  skipped: "לא נשלח",
  failed: "נכשל",
};

export function ApplicationReport({ applications, loading, summary }: Props) {
  if (loading) {
    return <p className="text-sm text-[var(--muted)]">טוען דוח שליחות…</p>;
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
          <span>סה״כ: {summary.total}</span>
          <span className="text-[var(--accent)]">נשלח: {summary.sent}</span>
          <span>הוכן: {summary.prepared}</span>
          <span>לא נשלח: {summary.skipped}</span>
          <span className="text-red-700">נכשל: {summary.failed}</span>
        </div>
      )}

      {applications.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          עדיין אין שליחות. אחרי העלאת קו״ח המערכת תתאים, תשכתב ותנסה לשלוח.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {applications.map((app) => {
            const job = app.jobs;
            return (
              <li key={app.id} className="space-y-2 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">
                    {job?.title ?? "משרה"}
                    {job?.company ? ` · ${job.company}` : ""}
                  </h3>
                  <span className="text-sm font-medium text-[var(--accent)]">
                    {STATUS_HE[app.status]}
                  </span>
                </div>
                {app.recruiter_insights && (
                  <p className="text-sm text-[var(--foreground)]/85">
                    <span className="font-medium">מה מחפשים: </span>
                    {app.recruiter_insights}
                  </p>
                )}
                {job?.url && (job.is_social || job.post_kind === "freelance") && (
                  <p className="text-sm">
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                    >
                      קישור לפוסט / הגשה ↗
                    </a>
                    {job.channel ? ` · ${job.channel}` : ""}
                    {app.method === "link-alert" ? " · נשלחה התראה במייל" : ""}
                    {app.method === "link-only" ? " · קישור נשמר בדוח" : ""}
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
