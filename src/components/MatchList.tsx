"use client";

import type { JobMatch } from "@/lib/types";

type Props = {
  matches: JobMatch[];
  loading: boolean;
  onOpenJobLink?: (jobId: string, matchId: string) => void;
  onPrepareApply?: (match: JobMatch) => void;
};

function scoreLabel(score: number) {
  return `${Math.round(score * 100)}%`;
}

function kindLabel(job: JobMatch["jobs"]) {
  if (!job) return null;
  if (job.post_kind === "freelance" || job.is_social) {
    if (job.post_kind === "freelance") return "פרילנס / פוסט";
    if (job.is_social) return "פוסט ברשת";
  }
  return null;
}

export function MatchList({
  matches,
  loading,
  onOpenJobLink,
  onPrepareApply,
}: Props) {
  if (loading) {
    return <p className="text-sm text-[var(--muted)]">טוען התאמות…</p>;
  }

  if (matches.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        עדיין אין משרות בפול. לחץ ״הפעל סריקה + שליחה״. משרות שנשלחו או שנפתח
        הקישור שלהן עוברות להיסטוריה ויורדות מהפול.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {matches.map((match) => {
        const job = match.jobs;
        const badge = kindLabel(job);
        const markOpened = () => {
          if (job?.id) onOpenJobLink?.(job.id, match.id);
        };
        return (
          <li key={match.id} className="space-y-2 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold tracking-tight">
                {job?.url ? (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-[var(--accent)]"
                    onClick={markOpened}
                  >
                    {job.title}
                  </a>
                ) : (
                  (job?.title ?? "משרה ללא כותרת")
                )}
              </h3>
              <span className="text-sm font-medium text-[var(--accent)]">
                {scoreLabel(Number(match.score))}
              </span>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {[badge, job?.company, job?.location, job?.channel || job?.source]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {match.reasons?.length > 0 && (
              <p className="mt-2 text-sm text-[var(--foreground)]/80">
                {match.reasons.join(" · ")}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onPrepareApply?.(match)}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
              >
                מלא טופס מהקו״ח
              </button>
              {job?.url && (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface)]"
                  onClick={markOpened}
                >
                  פתח באתר ↗
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
