"use client";

import { useState } from "react";
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
            פתח טופס הגשה באתר ↗
          </a>
        </p>
      )}
      {app.skip_reason && (
        <p className="text-sm text-[var(--muted)]">{app.skip_reason}</p>
      )}
      {app.error && <p className="text-sm text-red-700">{app.error}</p>}

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
          עדיין אין רשומות. אחרי סריקה — לכל משרה יהיה מילוי פרטים מהקו״ח והורדת
          קובץ לצירוף בטופס באתר.
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-lg font-semibold text-[var(--accent)]">
              היסטוריה — נשלח למעסיק ({sentApps.length})
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
              היסטוריה — נפתח קישור ({openedApps.length})
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

          <section className="space-y-2">
            <h3 className="text-lg font-semibold">
              ממתינות ({pendingApps.length})
            </h3>
            {pendingApps.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">אין ממתינות.</p>
            ) : (
              <AppList
                apps={pendingApps}
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
