"use client";

import { useEffect, useMemo, useState } from "react";
import type { JobMatch } from "@/lib/types";
import { safeJobOpenUrl } from "@/lib/linkedin-url";
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
  /** Bulk remove selected job ids from the pool. */
  onBulkDismiss?: (jobIds: string[]) => void | Promise<void>;
  /** «פתח באתר» — open URL; on return to app job moves to history. */
  onOpenSite?: (match: JobMatch, url: string) => void;
  onPrepareApply?: (match: JobMatch) => void;
  dismissBusyId?: string | null;
  bulkDismissBusy?: boolean;
};

function scoreLabel(score: number) {
  return `${Math.round(score * 100)}%`;
}

function kindLabel(job: JobMatch["jobs"]) {
  if (!job) return null;
  const source = (job.source || "").toLowerCase();
  if (source === "linkedin") return "LinkedIn";
  if (source === "drushim") return "דרושים";
  if (source === "alljobs") return "AllJobs";
  if (source === "jobmaster") return "JobMaster";
  if (source === "jobify") return "Jobify";
  if (source === "remoteok") return "RemoteOK";
  if (source === "remotive") return "Remotive";
  if (source === "arbeitnow") return "Arbeitnow";
  if (source.startsWith("rss-")) return "RSS";
  if (job.post_kind === "freelance") return "פרילנס";
  if (
    job.post_kind === "social" ||
    source.startsWith("social-") ||
    (job.is_social &&
      ![
        "remoteok",
        "remotive",
        "drushim",
        "alljobs",
        "jobmaster",
        "jobify",
        "arbeitnow",
      ].includes(source))
  ) {
    return "סושיאל";
  }
  if (["jobnet", "gotfriends"].includes(source)) {
    return "לוח משרות";
  }
  return null;
}

function jobKey(match: JobMatch): string | null {
  return match.jobs?.id || match.job_id || null;
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
  onBulkDismiss,
  onOpenSite,
  onPrepareApply,
  dismissBusyId = null,
  bulkDismissBusy = false,
}: Props) {
  const [filters, setFilters] = useState<MatchPoolFilters>(DEFAULT_POOL_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const locations = useMemo(() => uniqueLocations(matches), [matches]);

  const filtered = useMemo(
    () => buildPoolMatches(matches, filters, POOL_LIMIT),
    [matches, filters],
  );

  const filteredCount = useMemo(
    () => filterMatches(matches, filters).length,
    [matches, filters],
  );

  const visibleIds = useMemo(
    () =>
      filtered
        .map((m) => jobKey(m))
        .filter((id): id is string => Boolean(id)),
    [filtered],
  );

  // Drop selections that left the pool
  useEffect(() => {
    setSelected((prev) => {
      if (!prev.size) return prev;
      const alive = new Set(matches.map((m) => jobKey(m)).filter(Boolean));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (alive.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [matches]);

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const selectedCount = selected.size;
  const activeFilterCount = countActiveFilters(filters);
  const selectionMode = selectedCount > 0;

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

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(visibleIds));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function toggleSelectAll() {
    if (allVisibleSelected) clearSelection();
    else selectAllVisible();
  }

  async function deleteSelected() {
    if (!selectedCount || !onBulkDismiss || bulkDismissBusy) return;
    const ids = [...selected];
    await onBulkDismiss(ids);
    setSelected(new Set());
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
        עד {POOL_LIMIT} משרות להגשה ידנית · המתאימות ביותר לקו״ח קודם
        {matches.length > 0
          ? ` · מוצגות ${filtered.length} מתוך ${filteredCount} אחרי סינון (${matches.length} זמינות)`
          : ""}
      </p>

      {matches.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          אין כרגע משרות להגשה ידנית. משרות שאפשר לשלוח אליהן אוטומטית (מייל /
          ATS) עוברות בסריקה להיסטוריה — לא לפול. לחץ ״הפעל סריקה + הגשה
          אוטומטית״ לרענון.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          אין משרות שמתאימות לסינון. נסו ״כל הסוגים״, נקו תאריך/מיקום, או חפשו
          מילה אחרת.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-white/60 px-3 py-2.5">
            <label className="flex min-h-10 flex-1 cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                className="size-4 accent-[var(--accent)]"
              />
              סמן הכל ({visibleIds.length})
            </label>
            {selectionMode && (
              <>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="min-h-10 rounded-xl border border-[var(--border)] bg-white/80 px-3 py-2 text-xs font-medium"
                >
                  נקה בחירה
                </button>
                <button
                  type="button"
                  disabled={bulkDismissBusy || !onBulkDismiss}
                  onClick={() => void deleteSelected()}
                  className="min-h-10 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 disabled:opacity-50"
                >
                  {bulkDismissBusy
                    ? "מוחק…"
                    : `מחק נבחרים (${selectedCount})`}
                </button>
              </>
            )}
          </div>

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
              const dismissId = jobKey(match);
              const busyDismiss = Boolean(
                dismissId && dismissBusyId === dismissId,
              );
              const isChecked = Boolean(dismissId && selected.has(dismissId));
              return (
                <li
                  key={match.id}
                  className={`relative z-0 space-y-2 py-4 ${
                    isChecked ? "bg-[var(--accent)]/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {dismissId ? (
                      <label className="mt-1 flex min-h-10 min-w-10 touch-manipulation cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleOne(dismissId)}
                          className="size-4 accent-[var(--accent)]"
                          aria-label={`בחר ${job?.title || "משרה"}`}
                        />
                      </label>
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-lg font-semibold tracking-tight">
                          {openUrl && onOpenSite ? (
                            <button
                              type="button"
                              onClick={() => onOpenSite(match, openUrl)}
                              className="text-start hover:text-[var(--accent)]"
                            >
                              {job?.title ?? "משרה"}
                            </button>
                          ) : openUrl ? (
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
                      <p className="text-sm text-[var(--muted)]">
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
                        <p className="text-sm text-[var(--foreground)]/80">
                          {match.reasons.join(" · ")}
                        </p>
                      )}
                      <div className="relative z-10 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onPrepareApply?.(match)}
                          className="min-h-10 touch-manipulation rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-medium text-white"
                        >
                          מלא טופס מהקו״ח
                        </button>
                        {openUrl ? (
                          <button
                            type="button"
                            onClick={() => onOpenSite?.(match, openUrl)}
                            className="inline-flex min-h-10 touch-manipulation items-center rounded-xl border border-[var(--border)] bg-white/60 px-3 py-2 text-xs font-medium"
                          >
                            פתח באתר ↗
                          </button>
                        ) : (
                          /telegram|facebook/i.test(
                            `${job?.channel || ""} ${job?.source || ""}`,
                          ) && (
                            <span className="rounded-xl px-3 py-1.5 text-xs text-[var(--muted)]">
                              אין קישור תקין (פוסט דמו)
                            </span>
                          )
                        )}
                      </div>
                      {dismissId && !selectionMode ? (
                        <button
                          type="button"
                          disabled={busyDismiss || !onDismissFromPool}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDismissFromPool?.(dismissId, match.id);
                          }}
                          className="relative z-20 flex min-h-11 w-full touch-manipulation items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700 disabled:opacity-50"
                        >
                          {busyDismiss ? "מסיר…" : "לא מעוניין — הסר מהפול"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {selectionMode ? (
            <div className="sticky bottom-20 z-30 rounded-2xl border border-red-200 bg-red-50/95 p-3 shadow-sm backdrop-blur">
              <button
                type="button"
                disabled={bulkDismissBusy || !onBulkDismiss}
                onClick={() => void deleteSelected()}
                className="flex min-h-12 w-full touch-manipulation items-center justify-center rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {bulkDismissBusy
                  ? "מוחק מהפול…"
                  : `מחק ${selectedCount} מהפול — פנה מקום למשרות חדשות`}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
