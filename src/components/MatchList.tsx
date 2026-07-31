"use client";

import type { JobMatch } from "@/lib/types";

type Props = {
  matches: JobMatch[];
  loading: boolean;
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

export function MatchList({ matches, loading }: Props) {
  if (loading) {
    return <p className="text-sm text-[var(--muted)]">טוען התאמות…</p>;
  }

  if (matches.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">
        עדיין אין משרות בפול. לחץ ״הפעל סריקה + שליחה״. משרות שנשלחו עוברות
        להיסטוריית שליחות (סעיף 3) ויורדות מהפול.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {matches.map((match) => {
        const job = match.jobs;
        const badge = kindLabel(job);
        return (
          <li key={match.id} className="py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-semibold tracking-tight">
                {job?.url ? (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-[var(--accent)]"
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
            {job?.url && (job.is_social || job.post_kind === "freelance") && (
              <p className="mt-2">
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                >
                  פתח פוסט / קישור להגשה ↗
                </a>
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
