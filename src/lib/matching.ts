import type { Job } from "@/lib/types";

const DOMAIN_TERMS = [
  "ai", "ml", "llm", "machine learning", "artificial intelligence", "בינה מלאכותית", "אלגוריתם",
  "product", "מוצר", "roadmap", "backlog", "product manager", "product owner",
  "finance", "פיננסי", "חשבות", "תקציב", "fp&a", "controller", "אשראי", "fintech",
  "management", "ניהול", "מנהל", "operations", "תפעול", "project manager", "team lead",
  "marketing", "שיווק", "growth", "sales", "מכירות", "customer success",
  "python", "javascript", "typescript", "react", "sql", "excel", "agile", "scrum",
];

/** Domain tags we also store on resumes via extractSkills */
const DOMAIN_TAGS = ["ai", "product", "finance", "management", "marketing", "sales", "tech"] as const;

export function tokenize(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/[a-zA-Z+#.\u0590-\u05FF]{2,}/g) ?? [];
  return new Set(tokens.filter((t) => t.length > 1));
}

export function scoreMatch(
  resumeText: string,
  skills: string[],
  job: Pick<Job, "title" | "description" | "company" | "location">,
): { score: number; reasons: string[] } {
  const haystack = [job.title, job.description, job.company, job.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const resumeLower = `${resumeText} ${skills.join(" ")}`.toLowerCase();

  const resumeTokens = tokenize(resumeText);
  const jobTokens = tokenize(haystack);
  const reasons: string[] = [];

  const skillHits = skills.filter((s) => haystack.includes(s.toLowerCase()));
  if (skillHits.length) {
    reasons.push(`skills: ${skillHits.slice(0, 5).join(", ")}`);
  }

  const domainHits = DOMAIN_TERMS.filter(
    (t) => resumeLower.includes(t) && haystack.includes(t),
  );
  if (domainHits.length) {
    reasons.push(`domain: ${domainHits.slice(0, 5).join(", ")}`);
  }

  const tagHits = DOMAIN_TAGS.filter(
    (tag) =>
      (skills.map((s) => s.toLowerCase()).includes(tag) || resumeLower.includes(tag)) &&
      haystack.includes(tag),
  );
  if (tagHits.length) {
    reasons.push(`tags: ${tagHits.join(", ")}`);
  }

  const overlap = [...resumeTokens].filter((t) => jobTokens.has(t));
  if (overlap.length) {
    reasons.push(`keywords: ${overlap.slice(0, 5).join(", ")}`);
  }

  const skillScore = Math.min(1, skillHits.length / 2);
  const domainScore = Math.min(1, (domainHits.length + tagHits.length) / 2);
  const overlapScore = Math.min(1, overlap.length / 8);
  const titleTokens = tokenize(job.title || "");
  const titleHits = [...titleTokens].filter((t) => resumeTokens.has(t)).length;
  const titleScore = Math.min(1, titleHits / 2);

  let score = Number(
    (
      0.35 * skillScore +
      0.3 * domainScore +
      0.2 * overlapScore +
      0.15 * titleScore
    ).toFixed(4),
  );

  if (score === 0 && (skillHits.length || domainHits.length || tagHits.length || overlap.length >= 2)) {
    score = 0.28;
  }

  // Soft boost when domain clearly aligns (AI/finance/product/mgmt)
  if ((domainHits.length >= 2 || tagHits.length >= 1) && score < 0.32) {
    score = 0.32;
  }
  if (tagHits.length >= 1 && domainHits.length >= 1 && score < 0.38) {
    score = 0.38;
  }

  if (!reasons.length) {
    reasons.push(score > 0 ? "partial profile overlap" : "weak lexical overlap");
  }

  return { score, reasons };
}
