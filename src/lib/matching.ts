import type { Job } from "@/lib/types";
import {
  extractResumeSignals,
  type RoleFamily,
  type ResumeSignals,
  type Seniority,
} from "@/lib/resume-extract";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "you",
  "your",
  "our",
  "are",
  "this",
  "that",
  "from",
  "will",
  "have",
  "has",
  "was",
  "were",
  "been",
  "job",
  "role",
  "team",
  "work",
  "working",
  "experience",
  "years",
  "year",
  "israel",
  "ישראל",
  "remote",
  "hybrid",
  "full",
  "time",
  "חלק",
  "משרה",
  "דרוש",
  "דרושה",
  "looking",
  "company",
  "about",
  "ability",
  "strong",
  "good",
  "plus",
  "etc",
  "including",
  "using",
  "based",
  "well",
  "also",
  "all",
  "any",
  "can",
  "may",
  "not",
  "but",
  "into",
  "over",
  "such",
  "than",
  "then",
  "them",
  "they",
  "what",
  "when",
  "who",
  "how",
  "via",
  "per",
  "new",
]);

const FAMILY_PATTERNS: Array<{ family: RoleFamily; re: RegExp }> = [
  {
    family: "product",
    re: /product\s*manager|product\s*owner|מנהל(?:ת)?\s*מוצר|בעלי?\s*מוצר|\bpm\b|head of product|product\s*analyst|product\s*operations/i,
  },
  {
    family: "data_ai",
    re: /machine\s*learning|ml\s*engineer|data\s*scientist|llm|gen(?:erative)?\s*ai|בינה מלאכותית|ai engineer|prompt engineer|data\s*analyst|data\s*engineer|nlp/i,
  },
  {
    family: "engineering",
    re: /software\s*engineer|full\s*stack|fullstack|backend|frontend|devops|sre|מפתח(?:ת)?|מהנדס(?:ת)?\s*תוכנה|\bdeveloper\b|\bprogrammer\b/i,
  },
  {
    family: "finance",
    re: /fp&a|financial\s*analyst|controller|חשב(?:ת)?|כלכל(?:ן|נית)|fintech|accountant|רואה חשבון/i,
  },
  {
    family: "management",
    re: /project\s*manager|program\s*manager|operations\s*manager|team\s*lead|מנהל(?:ת)?\s*פרויקט|מנהל(?:ת)?\s*תפעול|delivery manager/i,
  },
  {
    family: "sales",
    re: /account\s*executive|sales|business\s*development|\bbdr\b|\badr\b|customer\s*success|\bcsm\b|מכירות|הצלחת לקוחות/i,
  },
  {
    family: "marketing",
    re: /marketing|growth\s*manager|שיווק|demand gen|content marketing/i,
  },
  {
    family: "design",
    re: /product\s*designer|ux|ui\/ux|graphic designer|מעצב(?:ת)?/i,
  },
  {
    family: "hr",
    re: /recruiter|talent acquisition|hr business|משאבי אנוש|גיוס/i,
  },
];

const FAMILY_LABEL: Record<RoleFamily, string> = {
  engineering: "פיתוח",
  product: "מוצר",
  data_ai: "AI / דאטה",
  finance: "פיננסים",
  management: "ניהול",
  sales: "מכירות / CS",
  marketing: "שיווק",
  design: "עיצוב",
  hr: "HR",
  other: "כללי",
};

const SENIORITY_RANK: Record<Seniority, number> = {
  junior: 1,
  mid: 2,
  senior: 3,
  lead: 4,
  exec: 5,
};

export function tokenize(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/[a-zA-Z+#.\u0590-\u05FF]{2,}/g) ?? [];
  return new Set(
    tokens.filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t)),
  );
}

function detectJobFamilies(haystack: string): RoleFamily[] {
  const found = new Set<RoleFamily>();
  for (const { family, re } of FAMILY_PATTERNS) {
    if (re.test(haystack)) found.add(family);
  }
  return [...found];
}

function detectJobSeniority(haystack: string): Seniority | null {
  if (/chief|\bceo\b|\bcto\b|\bcfo\b|\bvp\b|vice president|סמנכ/i.test(haystack)) {
    return "exec";
  }
  if (/head of|director|מנהל(?:ת)? אגף/i.test(haystack)) return "lead";
  if (/principal|staff engineer|team lead|group lead|ראש צוות/i.test(haystack)) {
    return "lead";
  }
  if (/senior|סניור|בכיר/i.test(haystack)) return "senior";
  if (/junior|entry.?level|מתחיל|intern|סטודנט/i.test(haystack)) return "junior";
  if (/mid.?level|בינונ/i.test(haystack)) return "mid";
  return null;
}

function jobYearsRequired(haystack: string): number | null {
  const m =
    haystack.match(/(\d{1,2})\+?\s*(?:years?|שנ(?:ות|ה)|yrs?)/i) ||
    haystack.match(/(?:ניסיון|experience)[^\d]{0,24}(\d{1,2})/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n < 40 ? n : null;
}

function familyOverlapScore(
  resumeFamilies: RoleFamily[],
  jobFamilies: RoleFamily[],
): { score: number; shared: RoleFamily[] } {
  if (!jobFamilies.length) {
    return { score: resumeFamilies.length ? 0.35 : 0.2, shared: [] };
  }
  if (!resumeFamilies.length) {
    return { score: 0.15, shared: [] };
  }
  const shared = jobFamilies.filter((f) => resumeFamilies.includes(f));
  if (!shared.length) {
    // Hard mismatch between clear role families (e.g. finance CV vs pure eng job)
    return { score: 0.05, shared: [] };
  }
  const ratio = shared.length / Math.max(jobFamilies.length, 1);
  return { score: Math.min(1, 0.45 + ratio * 0.55), shared };
}

function seniorityScore(
  resume: Seniority | null,
  job: Seniority | null,
): number {
  if (!resume || !job) return 0.55;
  const diff = Math.abs(SENIORITY_RANK[resume] - SENIORITY_RANK[job]);
  if (diff === 0) return 1;
  if (diff === 1) return 0.75;
  if (diff === 2) return 0.4;
  return 0.15;
}

function experienceScore(
  resumeYears: number | null,
  required: number | null,
): number {
  if (required == null || resumeYears == null) return 0.5;
  if (resumeYears >= required) return 1;
  if (resumeYears >= required - 1) return 0.7;
  if (resumeYears >= required - 2) return 0.4;
  return 0.15;
}

/** Meaningful skills only — drop ultra-short tags that create false positives. */
function concreteSkills(skills: string[]): string[] {
  return skills.filter((s) => {
    const t = s.toLowerCase().trim();
    if (!t || t.length < 2) return false;
    // Domain tags alone are handled separately
    if (["ai", "tech"].includes(t)) return false;
    return true;
  });
}

export function scoreMatch(
  resumeText: string,
  skills: string[],
  job: Pick<Job, "title" | "description" | "company" | "location">,
  signals?: ResumeSignals,
): { score: number; reasons: string[] } {
  const profile =
    signals || extractResumeSignals(resumeText, skills);
  const haystack = [job.title, job.description, job.company, job.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const titleLower = (job.title || "").toLowerCase();
  const reasons: string[] = [];

  const jobFamilies = detectJobFamilies(`${titleLower} ${haystack}`);
  const { score: roleScore, shared } = familyOverlapScore(
    profile.families,
    jobFamilies,
  );
  if (shared.length) {
    reasons.push(
      `תפקיד: ${shared.map((f) => FAMILY_LABEL[f]).join(", ")}`,
    );
  } else if (profile.families.length && jobFamilies.length) {
    reasons.push("תפקיד שונה מהפרופיל בקו״ח");
  }

  const skillList = concreteSkills(profile.skills);
  const skillHits = skillList.filter((s) => haystack.includes(s.toLowerCase()));
  // Title skill hits count double in scoring
  const titleSkillHits = skillHits.filter((s) =>
    titleLower.includes(s.toLowerCase()),
  );
  if (skillHits.length) {
    reasons.push(`כישורים: ${skillHits.slice(0, 6).join(", ")}`);
  }

  const domainHits = profile.domains.filter((d) => {
    if (d === "ai") {
      // Require real AI wording in the job, not a random "ai" substring in a URL
      return /\b(ai|llm|machine learning|בינה מלאכותית|generative)\b/i.test(
        `${job.title || ""} ${job.description || ""}`,
      );
    }
    if (d === "tech") {
      return /software|developer|engineer|מפתח|fullstack|devops/i.test(haystack);
    }
    return haystack.includes(d);
  });
  if (domainHits.length) {
    reasons.push(`תחום: ${domainHits.slice(0, 4).join(", ")}`);
  }

  const resumeTokens = tokenize(
    `${resumeText} ${profile.skills.join(" ")} ${profile.titles.join(" ")}`,
  );
  const jobTokens = tokenize(haystack);
  const overlap = [...resumeTokens].filter((t) => jobTokens.has(t));
  if (overlap.length) {
    reasons.push(`מילות מפתח: ${overlap.slice(0, 5).join(", ")}`);
  }

  const titleTokens = tokenize(job.title || "");
  const titleHits = [...titleTokens].filter((t) => resumeTokens.has(t));
  if (titleHits.length) {
    reasons.push(`כותרת: ${titleHits.slice(0, 4).join(", ")}`);
  }

  const jobSeniority = detectJobSeniority(`${titleLower} ${haystack}`);
  const senScore = seniorityScore(profile.seniority, jobSeniority);
  if (profile.seniority && jobSeniority && senScore >= 0.75) {
    reasons.push(`ותק: ${profile.seniority} ≈ ${jobSeniority}`);
  } else if (profile.seniority && jobSeniority && senScore <= 0.4) {
    reasons.push(`פער ותק: קו״ח ${profile.seniority} / משרה ${jobSeniority}`);
  }

  const requiredYears = jobYearsRequired(haystack);
  const expScore = experienceScore(profile.yearsExperience, requiredYears);
  if (
    profile.yearsExperience != null &&
    requiredYears != null &&
    expScore >= 0.7
  ) {
    reasons.push(`ניסיון: ${profile.yearsExperience}+ שנים`);
  }

  const skillScore = Math.min(
    1,
    (skillHits.length + titleSkillHits.length) / 4,
  );
  const domainScore = Math.min(1, domainHits.length / 2);
  const overlapScore = Math.min(1, overlap.length / 10);
  const titleScore = Math.min(1, titleHits.length / 3);

  // Role fit dominates — wrong-family jobs stay low even if "ai" tag matches
  let score = Number(
    (
      0.38 * roleScore +
      0.22 * skillScore +
      0.12 * domainScore +
      0.1 * overlapScore +
      0.1 * titleScore +
      0.05 * senScore +
      0.03 * expScore
    ).toFixed(4),
  );

  // Soft floor only when role actually aligns
  if (shared.length && score < 0.34 && (skillHits.length || titleHits.length >= 2)) {
    score = 0.34;
  }
  if (shared.length >= 1 && skillHits.length >= 2 && score < 0.45) {
    score = Math.max(score, 0.45);
  }
  if (
    shared.length >= 1 &&
    titleSkillHits.length >= 1 &&
    skillHits.length >= 2 &&
    score < 0.55
  ) {
    score = Math.max(score, 0.55);
  }

  // Cap mismatched-family jobs so they don't dominate the pool
  if (profile.families.length && jobFamilies.length && !shared.length) {
    score = Math.min(score, 0.28);
  }

  // Tiny lexical-only matches shouldn't surface as "good"
  if (!shared.length && skillHits.length === 0 && titleHits.length < 2) {
    score = Math.min(score, 0.22);
  }

  if (!reasons.length) {
    reasons.push(score >= 0.35 ? "התאמה חלקית לפרופיל" : "התאמה חלשה לקו״ח");
  }

  return { score, reasons: reasons.slice(0, 6) };
}
