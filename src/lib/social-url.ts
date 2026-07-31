/** Detect / repair fake social demo links (Telegram, Facebook). */

const FAKE_TELEGRAM_RE =
  /t\.me\/(?:s\/)?(?:example[_-]?i[lt]?[_-]?jobs|israel_jobs|example)(?:\/|$)/i;

const FAKE_FACEBOOK_RE =
  /facebook\.com\/(?:groups\/)?example(?:\.il)?(?:\.freelance)?/i;

export function isBrokenTelegramUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (!/t\.me|telegram\.(?:me|org)/i.test(url)) return false;
  if (FAKE_TELEGRAM_RE.test(url)) return true;
  // Catalog used t.me/s/example_il_jobs/{tg-001}
  if (/t\.me\/[^/]+\/(?:tg-|li-f-|fb-)/i.test(url)) return true;
  return false;
}

export function isBrokenFacebookUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (!/facebook\.com/i.test(url)) return false;
  return FAKE_FACEBOOK_RE.test(url);
}

export function isBrokenSocialDemoUrl(url: string | null | undefined): boolean {
  return isBrokenTelegramUrl(url) || isBrokenFacebookUrl(url);
}

/**
 * Social demo catalog posts must not invent t.me / Facebook handles.
 * Prefer no URL over a link that shows "user does not exist".
 */
export function catalogSocialUrl(
  channel: "linkedin" | "telegram" | "facebook",
  title: string,
): string | null {
  if (channel === "linkedin") {
    // LinkedIn search is a real page; imported lazily-style to avoid cycles —
    // caller should pass linkedInJobsSearchUrl for linkedin.
    void title;
    return null;
  }
  // Telegram / Facebook: no reliable public search; omit broken demo links.
  return null;
}
