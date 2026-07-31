/** IL boards — distinguish real deep-links from catalog demos. */

export const FAKE_IL_BOARD_HOSTS = [
  "alljobs.co.il",
  "drushim.co.il",
  "jobmaster.co.il",
  "jobnet.co.il",
  "gotfriends.co.il",
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

/**
 * Synthetic / demo IL board URLs (403, white screen, 404).
 * Real Drushim `/job/{id}/{hash}/` links are NOT fake.
 */
export function isFakeIlBoardUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (/[?&]ref=ai-agent\b/i.test(url) || /\/search\?ref=ai-agent/i.test(url)) {
    return true;
  }
  if (isRealDrushimJobUrl(url)) return false;
  try {
    const u = new URL(url);
    if (!isFakeIlBoardHost(u.hostname)) return false;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    // Until we have live scrapers for these, any alljobs/jobnet/… URL is unreliable
    if (host !== "drushim.co.il") return true;
    // Drushim search / homepage / non-job paths
    return true;
  } catch {
    return /alljobs\.co\.il|jobmaster\.co\.il|jobnet\.co\.il|gotfriends\.co\.il/i.test(
      url,
    );
  }
}

/** Catalog label sources (may later hold live scraped rows with real URLs). */
export function isCatalogIlBoardSource(
  source: string | null | undefined,
): boolean {
  const s = (source || "").toLowerCase();
  return ["alljobs", "drushim", "jobmaster", "jobnet", "gotfriends"].includes(s);
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
    s.startsWith("rss-")
  );
}
