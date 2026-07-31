"use client";

import { wasSentToEmployer } from "@/lib/apply-email";
import type { Application } from "@/lib/types";

type Props = {
  applications: Application[];
  loading: boolean;
  summary?: {
    total: number;
    sent: number;
    notSent?: number;
    prepared: number;
    skipped: number;
    failed: number;
  };
};

function ApplicationCard({ app }: { app: Application }) {
  const job = app.jobs;
  const sent = wasSentToEmployer(app);

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
            sent ? "text-[var(--accent)]" : "text-[var(--muted)]"
          }`}
        >
          {sent ? "נשלח" : "לא נשלח"}
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

export function ApplicationReport({ applications, loading, summary }: Props) {
  if (loading) {
    return <p className="text-sm text-[var(--muted)]">טוען דוח…</p>;
  }

  const sentApps = applications.filter((a) => wasSentToEmployer(a));
  const notSentApps = applications.filter((a) => !wasSentToEmployer(a));
  const sentCount = summary?.sent ?? sentApps.length;
  const notSentCount = summary?.notSent ?? notSentApps.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3 text-sm text-[var(--muted)]">
        <span>סה״כ: {summary?.total ?? applications.length}</span>
        <span className="font-medium text-[var(--accent)]">
          נשלח למעסיק: {sentCount}
        </span>
        <span className="font-medium">לא נשלח: {notSentCount}</span>
        {(summary?.failed ?? 0) > 0 && (
          <span className="text-red-700">כשל בשליחה: {summary!.failed}</span>
        )}
      </div>

      {applications.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          עדיין אין רשומות. לחץ ״הפעל סריקה + שליחה״ — המערכת תנסה לשלוח למשרות
          עם מייל הגשה, והשאר יופיעו תחת ״לא נשלח״ עם קו״ח מותאם.
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-lg font-semibold text-[var(--accent)]">
              נשלח למעסיק ({sentApps.length})
            </h3>
            {sentApps.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                עדיין אין שליחות למעסיק. נשלח רק כשיש מייל הגשה במשרה ו-Resend
                מוגדר כראוי.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
                {sentApps.map((app) => (
                  <ApplicationCard key={app.id} app={app} />
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-semibold">
              לא נשלח ({notSentApps.length})
            </h3>
            <p className="text-sm text-[var(--muted)]">
              משרות בלי מייל הגשה, פוסטים בלינקדאין/רשתות, או כשל בשליחה — הקו״ח
              המותאם מוכן להגשה ידנית.
            </p>
            {notSentApps.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">הכל נשלח.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
                {notSentApps.map((app) => (
                  <ApplicationCard key={app.id} app={app} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
