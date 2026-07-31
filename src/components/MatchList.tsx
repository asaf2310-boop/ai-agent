"use client";

import { useMemo, useState } from "react";
import type { JobMatch } from "@/lib/types";
import {
  DEFAULT_POOL_FILTERS,
  POOL_LIMIT,
  buildPoolMatches,
  filterMatches,
  formatPostedLabel,
  uniqueLocations,
  type MatchPoolFilters,
} from "@/lib/match-pool";

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
  if (job.source === "linkedin") return "LinkedIn";
  if (job.post_kind === "freelance") return "פרילנס / פוסט";
  if (job.is_social || job.post_kind === "social") return "פוסט ברשת";
  if (["alljobs", "drushim", "jobmaster", "jobnet", "gotfriends"].includes(job.source || "")) {
    return "לוח משרות";
  }
  return null;
}

const KIND_OPTIONS: { value: MatchPoolFilters["kind"]; label: string }[] = [
  { value: "all", label: "כל הסוגים" },
  { value: "job", label: "משרה" },
  { value: "freelance", label: "פרילנס" },
  { value: "social", label: "פוסט סושיאל" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "board", label: "לוח משרות" },
];

const DATE_OPTIONS: { value: MatchPoolFilters["postedWithin"]; label: string }[] = [
  { value: "all", label: "כל התאריכים" },
  { value: "1", label: "היום" },
  { value: "3", label: "3 ימים אחרונים" },
  { value: "7", label: "שבוע אחרון" },
  { value: "30", label: "חודש אחרון" },
  { value: "custom", label: "טווח מותאם" },
];

export function MatchList({
  matches,
  loading,
  onOpenJobLink,
  onPrepareApply,
}: Props) {
  const [filters, setFilters] = useState<MatchPoolFilters>(DEFAULT_POOL_FILTERS);

  const locations = useMemo(() => uniqueLocations(matches), [matches]);

  const filtered = useMemo(
    () => buildPoolMatches(matches, filters, POOL_LIMIT),
    [matches, filters],
  );

  const filteredCount = useMemo(
    () => filterMatches(matches, filters).length,
    [matches, filters],
  );

  function updateFilter<K extends keyof MatchPoolFilters>(
    key: K,
    value: MatchPoolFilters[K],
  ) {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "postedWithin" && value !== "custom") {
        next.postedFrom = "";
        next.postedTo = "";
      }
      if (key === "postedFrom" || key === "postedTo") {
        next.postedWithin = "custom";
      }
      return next;
    });
  }

  function resetFilters() {
    setFilters(DEFAULT_POOL_FILTERS);
  }

  if (loading) {
    return <p className="text-sm text-[var(--muted)]">טוען התאמות…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted)]">סוג משרה</span>
          <select
            value={filters.kind}
            onChange={(e) =>
              updateFilter("kind", e.target.value as MatchPoolFilters["kind"])
            }
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted)]">תאריך פרסום</span>
          <select
            value={filters.postedWithin}
            onChange={(e) =>
              updateFilter(
                "postedWithin",
                e.target.value as MatchPoolFilters["postedWithin"],
              )
            }
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
          >
            {DATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-sm">
          <span className="text-[var(--muted)]">מיקום</span>
          <input
            list="pool-locations"
            value={filters.location}
            onChange={(e) => updateFilter("location", e.target.value)}
            placeholder="למשל תל אביב, היברידי…"
            className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
          />
          <datalist id="pool-locations">
            {locations.map((loc) => (
              <option key={loc} value={loc} />
            ))}
          </datalist>
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={resetFilters}
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface)]"
          >
            נקה סינון
          </button>
        </div>
      </div>

      {(filters.postedWithin === "custom" ||
        filters.postedFrom ||
        filters.postedTo) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted)]">מ־תאריך</span>
            <input
              type="date"
              value={filters.postedFrom}
              onChange={(e) => updateFilter("postedFrom", e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--muted)]">עד תאריך</span>
            <input
              type="date"
              value={filters.postedTo}
              onChange={(e) => updateFilter("postedTo", e.target.value)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            />
          </label>
        </div>
      )}

      <p className="text-sm text-[var(--muted)]">
        מוצגות עד {POOL_LIMIT} משרות לפי החדשה ביותר
        {matches.length > 0
          ? ` · ${Math.min(filtered.length, POOL_LIMIT)} מתוך ${filteredCount} אחרי סינון (${matches.length} בפול)`
          : ""}
      </p>

      {matches.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          עדיין אין משרות בפול. לחץ ״הפעל סריקה + שליחה״. משרות שנשלחו או שנפתח
          הקישור שלהן עוברות להיסטוריה ויורדות מהפול.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          אין משרות שמתאימות לסינון. נסי לשנות סוג, תאריך או מיקום.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {filtered.map((match) => {
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
                  {[
                    badge,
                    job?.company,
                    job?.location,
                    `פורסם ${formatPostedLabel(job)}`,
                    job?.channel || job?.source,
                  ]
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
      )}
    </div>
  );
}
