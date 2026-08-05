/**
 * Build Hebrew/English job-board search queries from an uploaded CV profile.
 * Keeps board scrapes aligned with the resume instead of a fixed AI/finance list.
 */

import type { ResumeSignals, RoleFamily } from "@/lib/resume-extract";

const FAMILY_QUERIES: Record<RoleFamily, string[]> = {
  product: [
    "מנהל מוצר AI",
    "מנהלת מוצר AI",
    "AI product manager",
    "AI product owner",
    "product manager AI",
    "LLM product",
    "מנהל מוצר",
    "product manager",
    "product owner",
  ],
  data_ai: [
    "בינה מלאכותית",
    "data scientist",
    "data analyst",
    "machine learning",
    "LLM product",
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
  marketing: ["שיווק דיגיטלי", "product marketing", "growth manager"],
  management: ["מנהל תפעול", "operations manager", "team lead"],
  engineering: ["אנליסט מערכות", "solution architect", "technical product"],
  design: ["product designer", "UX designer", "מעצב מוצר"],
  hr: ["משאבי אנוש", "talent acquisition"],
  other: [],
};

/** AI-leaning Product Manager — prefer these over bare PM / data-scientist queries. */
const AI_PRODUCT_QUERIES = [
  "מנהל מוצר AI",
  "מנהלת מוצר AI",
  "AI product manager",
  "AI product owner",
  "product manager AI",
  "LLM product",
  "מנהל מוצר Gen AI",
  "Gen AI product",
  "product owner AI",
];

/** Default IL board queries when no CV signals are available. */
export const DEFAULT_IL_BOARD_QUERIES = [
  "מנהל מוצר AI",
  "AI product manager",
  "מנהל מוצר Gen AI",
  "LLM product",
  "product owner AI",
  "data analyst מוצר",
  "הצלחת לקוחות",
  "שיווק דיגיטלי",
];

export function resumeIsAiLeaning(signals: ResumeSignals): boolean {
  const blob = [
    ...signals.titles,
    ...signals.skills,
    ...signals.domains,
  ].join(" ");
  return /ai|llm|בינה|gen(?:erative)?\s*ai|machine learning|prompt/i.test(blob);
}

/**
 * Prefer title-inferred families over skill-tag noise so a Product CV
 * doesn't pull pure engineering / data-scientist searches.
 */
export function strongResumeFamilies(signals: ResumeSignals): RoleFamily[] {
  const fromTitles = new Set<RoleFamily>();
  for (const t of signals.titles) {
    const lower = t.toLowerCase().trim();
    if (/product/.test(lower)) fromTitles.add("product");
    // Soft title "ai / ml" from domain patterns — only count if product isn't primary
    if (/^ai\s*\/?\s*ml$|^data$/.test(lower)) continue;
    if (/\b(data scientist|data analyst|machine learning)\b/.test(lower)) {
      fromTitles.add("data_ai");
    }
    if (/software|engineer/.test(lower) && !/product/.test(lower)) {
      fromTitles.add("engineering");
    }
    if (/finance/.test(lower)) fromTitles.add("finance");
    if (/project|operations/.test(lower)) fromTitles.add("management");
    if (/sales|cs/.test(lower)) fromTitles.add("sales");
    if (/marketing/.test(lower)) fromTitles.add("marketing");
    if (/design/.test(lower)) fromTitles.add("design");
    if (/hr/.test(lower)) fromTitles.add("hr");
  }
  if (fromTitles.size) {
    // Product CV that mentions AI stays product-primary (optionally + data_ai only
    // when there is a real data title, not soft "ai / ml")
    return [...fromTitles];
  }
  // No title evidence — use explicit role families from the CV, never invent defaults
  if (signals.families.length) {
    // Drop engineering if it only came from skill noise and product/finance exist
    const filtered = signals.families.filter((f) => {
      if (f !== "engineering") return true;
      return !signals.families.some((x) =>
        ["product", "finance", "marketing", "sales"].includes(x),
      );
    });
    return filtered.length ? filtered : signals.families;
  }
  return [];
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
    // Never push bare single-token "AI" / "ML" — too noisy on boards
    if (/^(ai|ml|a\.i\.)$/i.test(t)) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  const families = strongResumeFamilies(signals);
  const aiLean = resumeIsAiLeaning(signals);
  const productPrimary = families[0] === "product" || families.includes("product");

  // Concrete CV titles first (best signal)
  for (const title of signals.titles.slice(0, 6)) {
    if (/^ai\s*\/?\s*ml$|^data$|^product$/i.test(title.trim())) continue;
    push(title);
  }

  if (productPrimary && aiLean) {
    for (const q of AI_PRODUCT_QUERIES) push(q);
    // Optional adjacent roles — not bare data scientist
    push("product analyst");
    push("אנליסט מוצר");
  } else {
    for (const family of families) {
      let queries = FAMILY_QUERIES[family] || [];
      if (family === "product" && aiLean) {
        queries = AI_PRODUCT_QUERIES;
      }
      if (family === "data_ai" && productPrimary) {
        // Avoid flooding a Product CV with pure DS/ML eng searches
        queries = ["data analyst", "product analyst", "אנליסט מוצר"];
      }
      for (const q of queries) push(q);
    }
  }

  // Concrete skills that look like role/domain keywords (not bare languages)
  for (const skill of signals.skills) {
    if (
      /product manager|product owner|llm|machine learning|fp&a|roadmap|customer success|בינה מלאכותית|מנהל מוצר|פיננס|שיווק דיגיטלי|אנליסט מוצר/i.test(
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

/** LinkedIn boolean search strings derived from the same CV signals. */
export function buildLinkedInSearchQueries(
  signals?: ResumeSignals | null,
  limit = 5,
): string[] {
  const base = buildIlBoardSearchQueries(signals, 10);
  if (!signals || !base.length) {
    return [
      "\"AI product manager\" OR \"מנהל מוצר AI\" OR \"LLM product\"",
      "\"product manager\" AI OR LLM OR \"Gen AI\"",
      "\"product owner\" AI OR \"בינה מלאכותית\"",
    ].slice(0, limit);
  }
  const families = strongResumeFamilies(signals);
  const aiLean = resumeIsAiLeaning(signals);
  if (families.includes("product") && aiLean) {
    return [
      "\"AI product manager\" OR \"AI product owner\" OR \"מנהל מוצר AI\" OR \"LLM product\"",
      "\"product manager\" AND (AI OR LLM OR \"Gen AI\" OR \"בינה מלאכותית\")",
      "\"product owner\" AND (AI OR LLM OR \"machine learning\")",
      "\"product analyst\" AI OR \"אנליסט מוצר\"",
    ].slice(0, limit);
  }
  // Bundle top phrases into OR groups
  const chunks: string[] = [];
  for (let i = 0; i < base.length; i += 3) {
    const group = base
      .slice(i, i + 3)
      .map((q) => (/\s/.test(q) ? `"${q}"` : q))
      .join(" OR ");
    if (group) chunks.push(group);
  }
  return chunks.slice(0, limit);
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
    // Reject bare AI/ML as a sole matcher
    if (/^(ai|ml|a\.i\.)$/i.test(normalized)) return false;
    // Whole phrase first (e.g. "מנהל מוצר", "product manager")
    if (h.includes(normalized)) return true;
    // OR-clauses: any branch may match as a phrase
    if (/\s+or\s+/i.test(normalized)) {
      return normalized
        .split(/\s+or\s+/i)
        .map((p) => p.trim())
        .filter((p) => p.length >= 3 && !/^(ai|ml)$/i.test(p))
        .some((p) => h.includes(p));
    }
    // Multi-word query: require all meaningful tokens (AND)
    const parts = normalized
      .split(/[\s|/]+/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 2 && !["the", "and", "for"].includes(p));
    if (parts.length >= 2) {
      return parts.every((p) => h.includes(p));
    }
    // Single token — only if reasonably specific (no bare AI)
    return parts.length === 1 && parts[0].length >= 4 && h.includes(parts[0]);
  });
}
