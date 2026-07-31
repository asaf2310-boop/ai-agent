import type { Job, JobMatch } from "@/lib/types";
import { isLiveBoardSource } from "@/lib/il-boards";
import { hasActiveJobLink } from "@/lib/linkedin-url";

export const POOL_LIMIT = 50;

export type MatchPoolFilters = {
  kind: "all" | "job" | "freelance" | "social" | "linkedin" | "board";
  location: string;
  query: string;
  postedWithin: "all" | "1" | "3" | "7" | "30" | "custom";
  postedFrom: string;
  postedTo: string;
};

export const DEFAULT_POOL_FILTERS: MatchPoolFilters = {
  kind: "all",
  location: "",
  query: "",
  postedWithin: "all",
  postedFrom: "",
  postedTo: "",
};

export function getJobPostedAt(job?: Job | null): number {
  const raw = job?.posted_at || job?.scraped_at;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function sortMatchesByNewest(matches: JobMatch[]): JobMatch[] {
  return [...matches].sort((a, b) => {
    const byDate = getJobPostedAt(b.jobs) - getJobPostedAt(a.jobs);
    if (byDate !== 0) return byDate;
    return (b.score ?? 0) - (a.score ?? 0);
  });
}

function matchesKind(job: Job | undefined, kind: MatchPoolFilters["kind"]): boolean {
  if (!job || kind === "all") return true;
  const source = (job.source || "").toLowerCase();
  const postKind = (job.post_kind || "").toLowerCase();
  const channel = (job.channel || "").toLowerCase();

  if (kind === "linkedin") {
    return source === "linkedin" || channel.includes("linkedin");
  }
  if (kind === "board") {
    // Live boards with real URLs (Drushim, Remotive, RemoteOK, …)
    return isLiveBoardSource(source);
  }
  if (kind === "social") {
    // True social posts only — not Remotive/RemoteOK board feeds
    if (isLiveBoardSource(source) && source !== "drushim" && !source.startsWith("rss-")) {
      return false;
    }
    return (
      postKind === "social" ||
      source.startsWith("social-") ||
      channel.includes("facebook") ||
      channel.includes("telegram") ||
      channel.includes("group") ||
      (Boolean(job.is_social) &&
        !["remoteok", "remotive", "arbeitnow", "jobicy", "drushim"].includes(
          source,
        ))
    );
  }
  if (kind === "freelance") {
    return postKind === "freelance" || source === "freelance";
  }
  if (kind === "job") {
    if (postKind === "freelance" || postKind === "social") return false;
    if (postKind === "job") return true;
    // Board / LinkedIn listings without an explicit post_kind still count as jobs
    if (
      source === "linkedin" ||
      isLiveBoardSource(source) ||
      (!job.is_social && !source.startsWith("social-"))
    ) {
      return true;
    }
    return false;
  }
  return true;
}

function matchesLocation(job: Job | undefined, location: string): boolean {
  const q = location.trim().toLowerCase();
  if (!q) return true;
  const loc = (job?.location || "").toLowerCase();
  const hay = `${loc} ${job?.company || ""} ${job?.description || ""}`.toLowerCase();
  return hay.includes(q);
}

function matchesQuery(job: Job | undefined, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [job?.title, job?.company, job?.description, job?.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function startOfDay(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00`).getTime();
}

function endOfDay(isoDate: string): number {
  return new Date(`${isoDate}T23:59:59.999`).getTime();
}

function matchesPostedDate(
  job: Job | undefined,
  filters: MatchPoolFilters,
): boolean {
  const posted = getJobPostedAt(job);
  if (!posted) {
    // Unknown date: keep visible unless a strict date window is set
    return (
      filters.postedWithin === "all" && !filters.postedFrom && !filters.postedTo
    );
  }

  if (
    filters.postedWithin === "custom" ||
    filters.postedFrom ||
    filters.postedTo
  ) {
    if (filters.postedFrom && posted < startOfDay(filters.postedFrom)) {
      return false;
    }
    if (filters.postedTo && posted > endOfDay(filters.postedTo)) {
      return false;
    }
    return true;
  }

  if (filters.postedWithin === "all") return true;

  const days = Number(filters.postedWithin);
  if (!Number.isFinite(days) || days <= 0) return true;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return posted >= cutoff;
}

export function filterMatches(
  matches: JobMatch[],
  filters: MatchPoolFilters,
): JobMatch[] {
  return matches.filter((m) => {
    const job = m.jobs;
    if (!hasActiveJobLink(job)) return false;
    return (
      matchesKind(job, filters.kind) &&
      matchesLocation(job, filters.location) &&
      matchesQuery(job, filters.query) &&
      matchesPostedDate(job, filters)
    );
  });
}

export function buildPoolMatches(
  matches: JobMatch[],
  filters: MatchPoolFilters = DEFAULT_POOL_FILTERS,
  limit = POOL_LIMIT,
): JobMatch[] {
  return sortMatchesByNewest(filterMatches(matches, filters)).slice(0, limit);
}

export function uniqueLocations(matches: JobMatch[]): string[] {
  const set = new Set<string>();
  for (const m of matches) {
    const loc = m.jobs?.location?.trim();
    if (loc) set.add(loc);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "he"));
}

export function formatPostedLabel(job?: Job | null): string {
  const raw = job?.posted_at || job?.scraped_at;
  if (!raw) return "תאריך לא ידוע";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "תאריך לא ידוע";
  return d.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function countActiveFilters(filters: MatchPoolFilters): number {
  let n = 0;
  if (filters.kind !== "all") n += 1;
  if (filters.location.trim()) n += 1;
  if (filters.query.trim()) n += 1;
  if (filters.postedWithin !== "all" || filters.postedFrom || filters.postedTo) {
    n += 1;
  }
  return n;
}
