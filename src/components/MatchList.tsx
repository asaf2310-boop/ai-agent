"use client";

import { useMemo, useState } from "react";
import type { JobMatch } from "@/lib/types";
import { safeJobOpenUrl } from "@/lib/linkedin-url";
import { canAutoApplyJob } from "@/lib/web-apply";
import {
  DEFAULT_POOL_FILTERS,
  POOL_LIMIT,
  buildPoolMatches,
  countActiveFilters,
  filterMatches,
  formatPostedLabel,
  uniqueLocations,
  type MatchPoolFilters,
} from "@/lib/match-pool";

type Props = {
  matches: JobMatch[];
  loading: boolean;
  /** Explicitly remove from pool (not on mere link open). */
  onDismissFromPool?: (jobId: string, matchId: string) => void;
  onPrepareApply?: (match: JobMatch) => void;
  onAutoApply?: (match: JobMatch) => void;
  autoApplyBusyId?: string | null;
};

function scoreLabel(score: number) {
  return `${Math.round(score * 100)}%`;
}

function kindLabel(job: JobMatch["jobs"]) {
  if (!job) return null;
  const source = (job.source || "").toLowerCase();
  if (source === "linkedin") return "LinkedIn";
  if (source === "drushim") return "דרושים";
  if (source === "remoteok") return "RemoteOK";
  if (source === "remotive") return "Remotive";
  if (source === "arbeitnow") return "Arbeitnow";
  if (source.startsWith("rss-")) return "RSS";
  if (job.post_kind === "freelance") return "פרילנס";
  if (
    job.post_kind === "social" ||
    source.startsWith("social-") ||
    (job.is_social &&
      !["remoteok", "remotive", "drushim", "arbeitnow"].includes(source))
  ) {
    return "סושיאל";
  }
  if (
    ["alljobs", "jobmaster", "jobnet", "gotfriends"].includes(source)
  ) {
    return "לוח משרות";
  }
  return null;
}

const KIND_OPTIONS: { value: MatchPoolFilters["kind"]; label: string }[] = [
  { value: "all", label: "כל הסוגים" },
  { value: "job", label: "משרה" },
  { value: "freelance", label: "פרילנס" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "board", label: "לוחות (דרושים / Remote)" },
  { value: "social", label: "פוסט סושיאל" },
];

const DATE_OPTIONS: {
  value: MatchPoolFilters["postedWithin"];
  label: string;
}[] = [
  { value: "all", label: "כל התאריכים" },
  { value: "1", label: "היום" },
  { value: "3", label: "3 ימים" },
  { value: "7", label: "שבוע" },
  { value: "30", label: "חודש" },
  { value: "custom", label: "טווח מותאם" },
];

const selectClass =
  "w-full rounded-xl border border-[var(--border)] bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]";

export function MatchList({
  matches,
  loading,
  onDismissFromPool,
  onPrepareApply,
  onAutoApply,
  autoApplyBusyId = null,
}: Props) {
  const [filters, setFilters] = useState<MatchPoolFilters>(DEFAULT_POOL_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const locations = useMemo(() => uniqueLocations(matches), [matches]);

  const filtered = useMemo(
    () => buildPoolMatches(matches, filters, POOL_LIMIT),
    [matches, filters],
  );

  const filteredCount = useMemo(
    () => filterMatches(matches, filters).length,
    [matches, filters],
  );

  const activeFilterCount = countActiveFilters(filters);

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
      <div className="space-y-2">
        <label className="block">
          <span className="sr-only">חיפוש לפי שם</span>
          <input
            value={filters.query}
            onChange={(e) => updateFilter("query", e.target.value)}
            placeholder="חפש לפי שם משרה / חברה…"
            className={selectClass}
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium ${
              filtersOpen || activeFilterCount > 0
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] bg-white/70"
            }`}
          >
            סינון
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-xl border border-[var(--border)] bg-white/70 px-3 py-2.5 text-sm"
            >
              נקה
            </button>
          )}
        </div>
      </div>

      {filtersOpen && (
        <div className="animate-rise space-y-3 rounded-2xl border border-[var(--border)] bg-white/60 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span className="text-[var(--muted)]">סוג משרה</span>
              <select
                value={filters.kind}
                onChange={(e) =>
                  updateFilter(
                    "kind",
                    e.target.value as MatchPoolFilters["kind"],
                  )
                }
                className={selectClass}
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
                className={selectClass}
              >
                {DATE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1 text-sm sm:col-span-2">
              <span className="text-[var(--muted)]">מיקום</span>
              <input
                list="pool-locations"
                value={filters.location}
                onChange={(e) => updateFilter("location", e.target.value)}
                placeholder="למשל תל אביב, היברידי…"
                className={selectClass}
              />
              <datalist id="pool-locations">
                {locations.map((loc) => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </label>
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
                  className={selectClass}
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-[var(--muted)]">עד תאריך</span>
                <input
                  type="date"
                  value={filters.postedTo}
                  onChange={(e) => updateFilter("postedTo", e.target.value)}
                  className={selectClass}
                />
              </label>
            </div>
          )}
        </div>
      )}

      <p className="text-sm text-[var(--muted)]">
        עד {POOL_LIMIT} משרות · המתאימות ביותר לקו״ח קודם
        {matches.length > 0
          ? ` · מוצגות ${filtered.length} מתוך ${filteredCount} אחרי סינון (${matches.length} זמינות)`
          : ""}
      </p>

      {matches.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          עדיין אין משרות בפול עם קישור פעיל. לחץ ״הפעל סריקה + הגשה אוטומטית״ —
          נטען דרושים, LinkedIn, Remotive ו-RemoteOK עם קישורים אמיתיים.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          אין משרות שמתאימות לסינון. נסו ״כל הסוגים״, נקו תאריך/מיקום, או חפשו
          מילה אחרת.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {filtered.map((match) => {
            const job = match.jobs;
            const badge = kindLabel(job);
            const openUrl = safeJobOpenUrl({
              url: job?.url,
              title: job?.title,
              source: job?.source,
              channel: job?.channel,
              external_id: job?.external_id,
            });
            // Only when a real ATS/career form POST is possible
            const showAutoApply = Boolean(job && canAutoApplyJob(job));
            return (
              <li key={match.id} className="space-y-2 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold tracking-tight">
                    {openUrl ? (
                      <a
                        href={openUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-[var(--accent)]"
                      >
                        {job?.title ?? "משרה"}
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
                  {showAutoApply && (
                    <button
                      type="button"
                      onClick={() => onAutoApply?.(match)}
                      disabled={autoApplyBusyId === (job?.id || match.job_id)}
                      className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {autoApplyBusyId === (job?.id || match.job_id)
                        ? "מגיש…"
                        : "הגש אוטומטית"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onPrepareApply?.(match)}
                    className={
                      showAutoApply
                        ? "rounded-xl border border-[var(--border)] bg-white/60 px-3 py-1.5 text-xs font-medium"
                        : "rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
                    }
                  >
                    מלא טופס מהקו״ח
                  </button>
                  {openUrl ? (
                    <a
                      href={openUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-[var(--border)] bg-white/60 px-3 py-1.5 text-xs font-medium"
                    >
                      פתח באתר ↗
                    </a>
                  ) : (
                    /telegram|facebook/i.test(
                      `${job?.channel || ""} ${job?.source || ""}`,
                    ) && (
                      <span className="rounded-xl px-3 py-1.5 text-xs text-[var(--muted)]">
                        אין קישור תקין (פוסט דמו)
                      </span>
                    )
                  )}
                  {job?.id && (
                    <button
                      type="button"
                      onClick={() => onDismissFromPool?.(job.id, match.id)}
                      className="rounded-xl border border-[var(--border)] bg-white/50 px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:border-red-300 hover:text-red-700"
                      title="הסר ולא להציע משרות דומות"
                    >
                      לא מעוניין
                    </button>
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
