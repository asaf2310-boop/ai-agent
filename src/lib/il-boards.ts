/** IL boards — distinguish real deep-links from catalog demos. */

export const FAKE_IL_BOARD_HOSTS = [
  "alljobs.co.il",
  "drushim.co.il",
  "jobmaster.co.il",
  "jobnet.co.il",
  "gotfriends.co.il",
  "jobify360.co.il",
  "jobify.co.il",
] as const;

export function isFakeIlBoardHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return FAKE_IL_BOARD_HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

/** Real Drushim posting: /job/{code}/{hash}/ */
export function isRealDrushimJobUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "drushim.co.il") return false;
    return /^\/job\/\d+\/[a-z0-9]+\/?$/i.test(u.pathname);
  } catch {
    return false;
  }
}

/** Real AllJobs posting: /Search/UploadSingle.aspx?JobID={id} */
export function isRealAllJobsJobUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "alljobs.co.il") return false;
    if (!/\/search\/uploadsingle\.aspx$/i.test(u.pathname)) return false;
    return /^\d{5,}$/.test(u.searchParams.get("JobID") || "");
  } catch {
    return false;
  }
}

/** Real JobMaster posting: /jobs/checknum.asp?key={id} */
export function isRealJobMasterJobUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "jobmaster.co.il") return false;
    if (!/\/jobs\/checknum\.asp$/i.test(u.pathname)) return false;
    return /^\d{5,}$/.test(u.searchParams.get("key") || "");
  } catch {
    return false;
  }
}

/** Real Jobify360 posting: /jobs/{id}-{source} e.g. -in, -aj */
export function isRealJobifyJobUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "jobify360.co.il" && host !== "jobify.co.il") return false;
    return /^\/jobs\/\d+-[a-z]{2,6}\/?$/i.test(u.pathname);
  } catch {
    return false;
  }
}

export function isRealIlBoardJobUrl(url: string | null | undefined): boolean {
  return (
    isRealDrushimJobUrl(url) ||
    isRealAllJobsJobUrl(url) ||
    isRealJobMasterJobUrl(url) ||
    isRealJobifyJobUrl(url)
  );
}

/**
 * Synthetic / demo IL board URLs (403, white screen, 404).
 * Real deep-links from live scrapers are NOT fake.
 */
export function isFakeIlBoardUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (/[?&]ref=ai-agent\b/i.test(url) || /\/search\?ref=ai-agent/i.test(url)) {
    return true;
  }
  if (isRealIlBoardJobUrl(url)) return false;
  try {
    const u = new URL(url);
    if (!isFakeIlBoardHost(u.hostname)) return false;
    // Known board host but not a validated deep-link → treat as fake/unreliable
    return true;
  } catch {
    return /alljobs\.co\.il|jobmaster\.co\.il|jobnet\.co\.il|gotfriends\.co\.il|jobify360\.co\.il|jobify\.co\.il/i.test(
      url,
    );
  }
}

/** Catalog label sources (may later hold live scraped rows with real URLs). */
export function isCatalogIlBoardSource(
  source: string | null | undefined,
): boolean {
  const s = (source || "").toLowerCase();
  return [
    "alljobs",
    "drushim",
    "jobmaster",
    "jobnet",
    "gotfriends",
    "jobify",
  ].includes(s);
}

/** Live job-board sources shown under "לוח משרות". */
export function isLiveBoardSource(source: string | null | undefined): boolean {
  const s = (source || "").toLowerCase();
  return (
    isCatalogIlBoardSource(s) ||
    s === "remoteok" ||
    s === "remotive" ||
    s === "arbeitnow" ||
    s === "jobicy" ||
    s === "greenhouse" ||
    s === "lever" ||
    s === "ashby" ||
    s.startsWith("rss-")
  );
}
