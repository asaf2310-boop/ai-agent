/** Israel / IL location filter for job listings */

const ISRAEL_POSITIVE = [
  "israel",
  "ישראל",
  "tel aviv",
  "tel-aviv",
  "תל אביב",
  "ת״א",
  "ת'א",
  "jerusalem",
  "ירושלים",
  "haifa",
  "חיפה",
  "herzliya",
  "הרצליה",
  "ramat gan",
  "רמת גן",
  "petah tikva",
  "פתח תקווה",
  "רעננה",
  "raanana",
  "ראשון לציון",
  "beer sheva",
  "באר שבע",
  "נתניה",
  "netanya",
  "מודעין",
  "אילת",
  "גבעתיים",
  "חולון",
  "בת ים",
  "כפר סבא",
  "רחובות",
  "אשדוד",
  "בני ברק",
  "remote - israel",
  "remote israel",
  "israel / remote",
  "il remote",
  "worldwide · israel",
  ", il",
  " israel",
];

const ISRAEL_NEGATIVE = [
  "united states",
  "usa",
  "u.s.",
  "nebraska",
  "kearney",
  "new york",
  "california",
  "texas",
  "london",
  "uk only",
  "united kingdom",
  "germany",
  "berlin",
  "paris",
  "france",
  "india",
  "bangalore",
  "canada",
  "toronto",
  "australia",
  "sydney",
];

export function isIsraelLocation(
  location?: string | null,
  description?: string | null,
  company?: string | null,
): boolean {
  const blob = `${location || ""} ${description || ""} ${company || ""}`.toLowerCase();
  if (!blob.trim()) return false;

  // Explicit non-IL geo without Israel mention → reject
  const hasIsrael = ISRAEL_POSITIVE.some((p) => blob.includes(p));
  if (hasIsrael) return true;

  // Pure "Remote" / Worldwide without Israel → reject for this product
  if (/remote|worldwide|anywhere|global/i.test(blob) && !hasIsrael) {
    return false;
  }

  if (ISRAEL_NEGATIVE.some((n) => blob.includes(n)) && !hasIsrael) {
    return false;
  }

  return false;
}
