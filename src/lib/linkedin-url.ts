/** LinkedIn URL helpers — avoid fake/demo IDs that show LinkedIn's error page. */

const NUMERIC_JOB_ID = /^\d{5,20}$/;

/** True only for real LinkedIn job posting IDs (numeric). */
export function isRealLinkedInJobId(id: string | null | undefined): boolean {
  return Boolean(id && NUMERIC_JOB_ID.test(id.trim()));
}

/**
 * Canonical mobile/desktop-friendly job URL.
 * Returns null when the id is not a real LinkedIn posting id.
 */
export function linkedInJobViewUrl(jobId: string | null | undefined): string | null {
  const id = (jobId || "").trim();
  if (!isRealLinkedInJobId(id)) return null;
  return `https://www.linkedin.com/jobs/view/${id}/`;
}

/** LinkedIn jobs search that always loads (fallback for catalog / social demos). */
export function linkedInJobsSearchUrl(keywords: string, location = "Israel"): string {
  const q = keywords.trim() || "jobs";
  const params = new URLSearchParams({
    keywords: q.slice(0, 120),
    location,
  });
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

/** Detect catalog/demo LinkedIn links that LinkedIn cannot resolve
 * (e.g. /jobs/view/ai-011 or urn:li:activity:li-f-001).
 */
export function isBrokenLinkedInUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url, "https://www.linkedin.com");
  } catch {
    return false;
  }
  if (!u.hostname.toLowerCase().includes("linkedin.com")) return false;

  const path = u.pathname;

  // /jobs/view/{id}
  const view = path.match(/\/jobs\/view\/([^/]+)/i)?.[1];
  if (view) {
    const id = decodeURIComponent(view).replace(/\/+$/, "");
    return !isRealLinkedInJobId(id);
  }

  // feed/update/urn:li:activity:XXX
  const activity =
    path.match(/urn:li:activity:([^/]+)/i)?.[1] ||
    u.href.match(/urn:li:activity:([^/?#]+)/i)?.[1];
  if (activity) {
    // Real activity URNs are numeric. Catalog used li-f-001 etc.
    return !/^\d{6,20}$/.test(activity);
  }

  // guest API paths shouldn't be opened in the app
  if (/\/jobs-guest\//i.test(path)) return true;

  return false;
}

/**
 * Absolutize + normalize a scraped LinkedIn href into a working jobs/view URL
 * when possible; otherwise return a search fallback.
 */
export function normalizeLinkedInOpenUrl(
  rawUrl: string | null | undefined,
  fallback?: { title?: string | null; externalId?: string | null },
): string {
  const searchFallback = linkedInJobsSearchUrl(
    fallback?.title || "Israel jobs",
  );

  if (fallback?.externalId && isRealLinkedInJobId(fallback.externalId)) {
    const fromId = linkedInJobViewUrl(fallback.externalId);
    if (fromId) {
      // Prefer canonical id when raw URL is missing/broken
      if (!rawUrl || isBrokenLinkedInUrl(rawUrl)) return fromId;
    }
  }

  if (!rawUrl) return searchFallback;

  let absolute = rawUrl.trim();
  if (absolute.startsWith("/")) {
    absolute = `https://www.linkedin.com${absolute}`;
  }
  try {
    const u = new URL(absolute);
    if (!u.hostname.toLowerCase().includes("linkedin.com")) {
      return absolute;
    }
    const viewId = u.pathname.match(/\/jobs\/view\/([^/]+)/i)?.[1];
    if (viewId) {
      const id = decodeURIComponent(viewId).replace(/\/+$/, "");
      const canonical = linkedInJobViewUrl(id);
      return canonical || searchFallback;
    }
    if (isBrokenLinkedInUrl(absolute)) return searchFallback;
    return u.toString();
  } catch {
    return searchFallback;
  }
}

/** Best URL to open for any job (repairs LinkedIn; blocks fake social demos). */
export function safeJobOpenUrl(job: {
  url?: string | null;
  title?: string | null;
  source?: string | null;
  channel?: string | null;
  external_id?: string | null;
}): string | null {
  const url = (job.url || "").trim();
  if (!url) return null;

  // Lazy import avoided — callers also use social-url; check patterns here
  if (
    /t\.me\/(?:s\/)?(?:example[_-]?i[lt]?[_-]?jobs|israel_jobs|example)(?:\/|$|\?)/i.test(
      url,
    ) ||
    /t\.me\/[^/]+\/(?:tg-|li-f-|fb-)/i.test(url) ||
    /facebook\.com\/(?:groups\/)?example(?:\.il)?(?:\.freelance)?/i.test(url)
  ) {
    return null;
  }

  const isLi =
    /linkedin/i.test(job.source || "") ||
    /linkedin/i.test(job.channel || "") ||
    /linkedin\.com/i.test(url);

  if (isLi) {
    return normalizeLinkedInOpenUrl(url, {
      title: job.title,
      externalId: job.external_id,
    });
  }

  if (url.startsWith("/")) return null;
  return url;
}

/**
 * Job belongs in the pool only if the user can open a real posting
 * (not catalog demos, null Telegram, or LinkedIn keyword search).
 */
export function hasActiveJobLink(job: {
  url?: string | null;
  title?: string | null;
  source?: string | null;
  channel?: string | null;
  external_id?: string | null;
} | null | undefined): boolean {
  if (!job) return false;
  const raw = (job.url || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return false;
  // Catalog fake IL board search pages
  if (/[?&]ref=ai-agent\b/i.test(raw) || /\/search\?ref=ai-agent/i.test(raw)) {
    return false;
  }
  if (isBrokenLinkedInUrl(raw)) return false;
  // Keyword search is not a specific job posting
  if (/linkedin\.com\/jobs\/search/i.test(raw)) return false;
  if (
    /t\.me\/(?:s\/)?(?:example[_-]?i[lt]?[_-]?jobs|israel_jobs|example)(?:\/|$|\?)/i.test(
      raw,
    ) ||
    /t\.me\/[^/]+\/(?:tg-|li-f-|fb-)/i.test(raw) ||
    /facebook\.com\/(?:groups\/)?example(?:\.il)?(?:\.freelance)?/i.test(raw)
  ) {
    return false;
  }
  // Real LinkedIn job view
  if (/linkedin\.com\/jobs\/view\/(\d+)/i.test(raw)) return true;
  if (/linkedin\.com/i.test(raw)) {
    // Only accept if normalize keeps a view URL (not search fallback)
    const open = normalizeLinkedInOpenUrl(raw, {
      title: job.title,
      externalId: job.external_id,
    });
    return Boolean(open && /linkedin\.com\/jobs\/view\/\d+/i.test(open));
  }
  return true;
}
