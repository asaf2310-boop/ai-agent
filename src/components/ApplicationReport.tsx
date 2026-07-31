"use client";

import { AutofillKit } from "@/components/AutofillKit";
import {
  isHistoryEntry,
  wasLinkOpened,
  wasSentToRealEmployer,
} from "@/lib/apply-email";
import { safeJobOpenUrl } from "@/lib/linkedin-url";
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
  onRestoreToPool?: (app: Application) => void;
  restoreBusyId?: string | null;
};

function statusLabel(app: Application): string {
  if (app.status === "sent" && app.method === "web-form") {
    return "הוגש באתר";
  }
  if (wasSentToRealEmployer(app)) return "נשלח למעסיק";
  if (wasLinkOpened(app)) return "הוסר מהפול";
  return "";
}

function ApplicationCard({
  app,
  resume,
  onRestoreToPool,
  restoreBusyId,
}: {
  app: Application;
  resume?: Resume | null;
  onRestoreToPool?: (app: Application) => void;
  restoreBusyId?: string | null;
}) {
  const job = app.jobs;
  const sent = wasSentToRealEmployer(app);
  const webForm = app.status === "sent" && app.method === "web-form";
  const dismissed = wasLinkOpened(app);
  const employerEmail = sent && !webForm ? job?.apply_email : null;
  const openUrl = safeJobOpenUrl({
    url: job?.url,
    title: job?.title,
    source: job?.source,
    channel: job?.channel,
    external_id: job?.external_id,
  });
  const isSocialDemo =
    !openUrl &&
    /telegram|facebook|social/i.test(
      `${job?.channel || ""} ${job?.source || ""}`,
    );

  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          {openUrl ? (
            <a
              href={openUrl}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[var(--accent)]"
            >
              {job?.title}
              {job?.company ? ` · ${job.company}` : ""}
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
      {dismissed && (
        <p className="text-sm text-[var(--foreground)]/85">
          {app.skip_reason ||
            "הוסר מהפול (לחיצה על ״הסר מהפול״, או גרסה ישנה שסימנה פתיחת קישור)."}
        </p>
      )}
      {webForm && (
        <p className="text-sm text-[var(--foreground)]/85">
          הוגש אוטומטית בטופס ההגשה באתר המעסיק
          {app.skip_reason ? ` — ${app.skip_reason}` : ""}.
        </p>
      )}
      {sent && employerEmail && (
        <p className="text-sm text-[var(--foreground)]/85">
          <span className="font-medium">נשלח אל מייל המעסיק: </span>
          {employerEmail}
        </p>
      )}
      {sent && !webForm && (
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
      <div className="flex flex-wrap gap-2 pt-1">
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-[var(--border)] bg-white/60 px-3 py-1.5 text-xs font-medium"
          >
            פתח משרה ↗
          </a>
        )}
        {isSocialDemo && (
          <span className="rounded-xl px-3 py-1.5 text-xs text-[var(--muted)]">
            אין קישור אמיתי לפוסט (דמו טלגרם/פייסבוק)
          </span>
        )}
        {dismissed && (
          <button
            type="button"
            onClick={() => onRestoreToPool?.(app)}
            disabled={restoreBusyId === app.id}
            className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {restoreBusyId === app.id ? "מחזיר…" : "החזר לפול"}
          </button>
        )}
      </div>

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
              jobUrl={openUrl}
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
  onRestoreToPool,
  restoreBusyId,
}: {
  apps: Application[];
  resume?: Resume | null;
  onRestoreToPool?: (app: Application) => void;
  restoreBusyId?: string | null;
}) {
  return (
    <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {apps.map((app) => (
        <ApplicationCard
          key={app.id}
          app={app}
          resume={resume}
          onRestoreToPool={onRestoreToPool}
          restoreBusyId={restoreBusyId}
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
  onRestoreToPool,
  restoreBusyId = null,
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
          נשלח/הוגש: {sentCount}
        </span>
        <span className="font-medium text-[var(--accent)]">
          הוסר: {openedCount}
        </span>
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          עדיין אין היסטוריה. כאן יופיעו משרות שנשלחו למייל מעסיק, שהוגשו
          אוטומטית בטופס באתר, או שהוסרו מהפול ידנית.
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-lg font-semibold text-[var(--accent)]">
              הוגש למעסיק ({sentApps.length})
            </h3>
            {sentApps.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                עדיין אין הגשות. כשיש מייל מעסיק — נשלח במייל; כשיש טופס
                Greenhouse/Lever/Ashby — מגישים אוטומטית באתר.
              </p>
            ) : (
              <AppList
                apps={sentApps}
                resume={resume}
                onRestoreToPool={onRestoreToPool}
                restoreBusyId={restoreBusyId}
              />
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-lg font-semibold text-[var(--accent)]">
              הוסר מהפול ({openedApps.length})
            </h3>
            {openedApps.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                משרות שהוסרו מהפול ידנית (״הסר מהפול״). אפשר להחזיר עם ״החזר
                לפול״.
              </p>
            ) : (
              <AppList
                apps={openedApps}
                resume={resume}
                onRestoreToPool={onRestoreToPool}
                restoreBusyId={restoreBusyId}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
