/**
 * Build Hebrew/English job-board search queries from an uploaded CV profile.
 * Keeps board scrapes aligned with the resume instead of a fixed AI/finance list.
 */

import type { ResumeSignals, RoleFamily } from "@/lib/resume-extract";

const FAMILY_QUERIES: Record<RoleFamily, string[]> = {
  product: [
    "מנהל מוצר",
    "מנהלת מוצר",
    "product manager",
    "product owner",
    "מנהל מוצר AI",
    "AI product manager",
    "product analyst",
  ],
  data_ai: [
    "בינה מלאכותית",
    "data scientist",
    "data analyst",
    "machine learning",
    "LLM",
    "AI",
  ],
  finance: [
    "פיננסים",
    "חשב",
    "FP&A",
    "financial analyst",
    "כלכלן",
    "controller",
  ],
  sales: ["הצלחת לקוחות", "customer success", "מכירות", "BDR", "CSM"],
  marketing: ["שיווק דיגיטלי", "marketing", "product marketing", "growth"],
  management: ["מנהל תפעול", "operations manager", "team lead"],
  engineering: ["אנליסט מערכות", "solution architect", "technical product"],
  design: ["UX", "UI", "product designer", "מעצב מוצר"],
  hr: ["משאבי אנוש", "גיוס", "talent acquisition"],
  other: [],
};

/** Default IL board queries when no CV signals are available. */
export const DEFAULT_IL_BOARD_QUERIES = [
  "מנהל מוצר AI",
  "מנהל מוצר",
  "בינה מלאכותית",
  "product manager",
  "data analyst",
  "אנליסט",
  "פיננסים",
  "הצלחת לקוחות",
  "שיווק דיגיטלי",
  "product owner",
];

/**
 * Prefer title-inferred families over skill-tag noise so a Product CV
 * doesn't pull pure engineering searches from a stray "Python" mention.
 */
export function strongResumeFamilies(signals: ResumeSignals): RoleFamily[] {
  const fromTitles = new Set<RoleFamily>();
  for (const t of signals.titles) {
    const lower = t.toLowerCase();
    if (/product/.test(lower)) fromTitles.add("product");
    if (/\bai\b|ml|data/.test(lower)) fromTitles.add("data_ai");
    if (/software|engineer/.test(lower)) fromTitles.add("engineering");
    if (/finance/.test(lower)) fromTitles.add("finance");
    if (/project|operations/.test(lower)) fromTitles.add("management");
    if (/sales|cs/.test(lower)) fromTitles.add("sales");
    if (/marketing/.test(lower)) fromTitles.add("marketing");
    if (/design/.test(lower)) fromTitles.add("design");
    if (/hr/.test(lower)) fromTitles.add("hr");
  }
  if (fromTitles.size) return [...fromTitles];
  return signals.families.length ? signals.families : ["product", "data_ai"];
}

export function buildIlBoardSearchQueries(
  signals?: ResumeSignals | null,
  limit = 12,
): string[] {
  if (!signals) return DEFAULT_IL_BOARD_QUERIES.slice(0, limit);

  const out: string[] = [];
  const seen = new Set<string>();
  const push = (q: string) => {
    const t = q.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  for (const title of signals.titles.slice(0, 6)) {
    push(title);
  }

  for (const family of strongResumeFamilies(signals)) {
    for (const q of FAMILY_QUERIES[family] || []) push(q);
  }

  // Concrete skills that look like role/domain keywords (not bare languages)
  for (const skill of signals.skills) {
    if (
      /product|llm|machine learning|fp&a|roadmap|analytics|marketing|customer success|בינה|מוצר|פיננס|שיווק|אנליסט/i.test(
        skill,
      )
    ) {
      push(skill);
    }
  }

  if (!out.length) {
    for (const q of DEFAULT_IL_BOARD_QUERIES) push(q);
  }

  return out.slice(0, limit);
}

/** True when text looks relevant to the CV-driven query set. */
export function matchesSearchQueries(
  haystack: string,
  queries: string[],
): boolean {
  const h = haystack.toLowerCase();
  if (!queries.length) return true;
  return queries.some((q) => {
    const normalized = q.toLowerCase().replace(/"/g, "").trim();
    if (!normalized) return false;
    // Whole phrase first (e.g. "מנהל מוצר", "product manager")
    if (h.includes(normalized)) return true;
    // OR-clauses: any branch may match as a phrase
    if (/\s+or\s+/i.test(normalized)) {
      return normalized
        .split(/\s+or\s+/i)
        .map((p) => p.trim())
        .filter((p) => p.length >= 3)
        .some((p) => h.includes(p));
    }
    // Multi-word query: require all meaningful tokens (AND)
    const parts = normalized
      .split(/[\s|/]+/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 3 && !["the", "and", "for"].includes(p));
    if (parts.length >= 2) {
      return parts.every((p) => h.includes(p));
    }
    // Single token — only if reasonably specific (allow AI/ML short forms)
    const SHORT_OK = new Set(["ai", "ml", "llm", "pm", "qa", "bi", "ux", "ui"]);
    return (
      parts.length === 1 &&
      (parts[0].length >= 4 || SHORT_OK.has(parts[0])) &&
      h.includes(parts[0])
    );
  });
}
