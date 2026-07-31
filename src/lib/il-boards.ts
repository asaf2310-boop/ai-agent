/** IL boards we only had as catalog demos — no real deep-links yet. */

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

/** Catalog / demo IL board URLs (403, white screen, 404 — not real postings). */
export function isFakeIlBoardUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (!isFakeIlBoardHost(u.hostname)) return false;
    // Any link to these boards from our catalog is synthetic until we scrape real IDs
    return true;
  } catch {
    return /alljobs\.co\.il|drushim\.co\.il|jobmaster\.co\.il|jobnet\.co\.il|gotfriends\.co\.il/i.test(
      url,
    );
  }
}

export function isCatalogIlBoardSource(
  source: string | null | undefined,
): boolean {
  const s = (source || "").toLowerCase();
  return ["alljobs", "drushim", "jobmaster", "jobnet", "gotfriends"].includes(s);
}
