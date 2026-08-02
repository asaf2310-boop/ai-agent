import type { Job } from "@/lib/types";
import {
  extractResumeSignals,
  type RoleFamily,
  type ResumeSignals,
  type Seniority,
} from "@/lib/resume-extract";

/** Classic Product Manager / Product Owner titles (not every "product" mention). */
const PRODUCT_MANAGER_TITLE_RE =
  /\b(?:ai\s+)?product\s*managers?\b|\b(?:ai\s+)?product\s*owners?\b|\bassociate\s*product\s*manager\b|\btechnical\s*product\s*manager\b|\bgroup\s*product\s*manager\b|\bgrowth\s*product\s*manager\b|\bplatform\s*product\s*manager\b|\bhead of product\b|\bvp\s*product\b|מנהל(?:ת)?\s*מוצר|בעל(?:י|ת)?\s*מוצר|\bpm\b/i;

/** Software developer / engineer / programmer titles — never enter the pool. */
const DEVELOPER_TITLE_RE =
  /\b(?:software|frontend|front.?end|backend|back.?end|full.?stack|fullstack|mobile|android|ios|devops|sre|platform|cloud|qa|automation|integration)\s*(?:engineer|developer|programmer)s?\b|\b(?:engineer|developer|programmer)s?\s*(?:software|frontend|backend|full.?stack|fullstack)\b|\b(?:react|angular|vue|node\.?js|java|golang|\.net|php|ruby)\s*(?:developer|engineer)s?\b|\bsalesforce\s*developer\b|\bמפתח(?:ת)?(?:\s|$)|מפתח(?:ת)?\s+(?:תוכנה|full.?stack|frontend|backend|fullstack|mobile|אינטגרציה|אוטומציה)|מהנדס(?:ת)?\s*תוכנה|\bprogrammer\b|\bsoftware\s*development\b/i;

/** Project / program / delivery manager titles — never enter the pool. */
const PROJECT_MANAGER_TITLE_RE =
  /\b(?:ai\s+)?project\s*managers?\b|\bprogram\s*managers?\b|\bdelivery\s*managers?\b|\bimplementation\s*managers?\b|\bפרויקט(?:ים)?\b.*\bמנהל(?:ת)?\b|\bמנהל(?:ת)?\s*פרויקט(?:ים)?\b|\bמנהל(?:ת)?\s*תכניות\b/i;

const AI_DOMAIN_RE =
  /\b(?:ai|a\.i\.|llm|llms|gen(?:erative)?\s*ai|machine\s*learning|\bml\b|nlp|deep\s*learning|בינה\s*מלאכותית|למידת\s*מכונה)\b/i;

const HEBREW_CHAR_RE = /[\u0590-\u05FF]/g;

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

/** Job title looks like Product Manager / Product Owner / מנהל מוצר. */
export function isProductManagerTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return PRODUCT_MANAGER_TITLE_RE.test(title);
}

/** Job title is a software developer / engineer / מפתח role. */
export function isDeveloperTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  // Don't treat "AI Product Manager" / non-coding roles as developers
  if (isProductManagerTitle(title) || isProjectManagerTitle(title)) return false;
  if (/product\s*(?:manager|owner|analyst)|מנהל(?:ת)?\s*מוצר|data\s*scientist|data\s*analyst/i.test(title)) {
    return false;
  }
  return DEVELOPER_TITLE_RE.test(title);
}

/** Job title is Project / Program / Delivery Manager / מנהל פרויקט. */
export function isProjectManagerTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  // Product Manager ≠ Project Manager
  if (PRODUCT_MANAGER_TITLE_RE.test(title) && !/project\s*manager|מנהל(?:ת)?\s*פרויקט/i.test(title)) {
    return false;
  }
  return PROJECT_MANAGER_TITLE_RE.test(title);
}

/** Job is clearly AI / ML / LLM related (title or description). */
export function isAiRelatedJob(job: {
  title?: string | null;
  description?: string | null;
}): boolean {
  return AI_DOMAIN_RE.test(`${job.title || ""} ${job.description || ""}`);
}

/**
 * Hard filters for the pool / matching:
 * - No software developer / engineer / מפתח roles
 * - No project / program / delivery managers
 * - No generic Product Manager (AI Product Manager is allowed)
 */
export function shouldExcludeJob(job: {
  title?: string | null;
  description?: string | null;
}): boolean {
  const title = job.title || "";
  if (isDeveloperTitle(title)) return true;
  if (isProjectManagerTitle(title)) return true;
  if (isProductManagerTitle(title) && !isAiRelatedJob(job)) return true;
  return false;
}

/**
 * True when the job's title role-family clearly doesn't fit the CV profile.
 * Used to keep the pool aligned with the uploaded resume.
 */
export function isFamilyMismatchForResume(
  job: { title?: string | null; description?: string | null },
  signals: ResumeSignals,
): boolean {
  if (!signals.families.length) return false;
  // Prefer title so JD noise ("work with engineers") doesn't mis-tag the role
  const titleFamilies = detectJobFamilies(job.title || "");
  const jobFamilies =
    titleFamilies.length > 0
      ? titleFamilies
      : detectJobFamilies(
          `${job.title || ""} ${job.description || ""}`.slice(0, 800),
        );
  if (!jobFamilies.length) return false;
  const shared = jobFamilies.filter((f) => signals.families.includes(f));
  return shared.length === 0;
}

/** Share of letters in text that are Hebrew (0–1). */
export function hebrewTextRatio(text: string | null | undefined): number {
  if (!text) return 0;
  const letters = text.match(/[A-Za-z\u0590-\u05FF]/g);
  if (!letters?.length) return 0;
  const hebrew = text.match(HEBREW_CHAR_RE)?.length || 0;
  return hebrew / letters.length;
}

/** True when job requirements / description are meaningfully in Hebrew. */
export function hasHebrewRequirements(job: {
  title?: string | null;
  description?: string | null;
}): boolean {
  const desc = job.description || "";
  const title = job.title || "";
  // Prefer description; fall back to Hebrew title
  if (desc.trim().length >= 40) return hebrewTextRatio(desc) >= 0.25;
  return hebrewTextRatio(`${title} ${desc}`) >= 0.35;
}

export function detectJobFamilies(haystack: string): RoleFamily[] {
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
): { score: number; reasons: string[]; reject?: boolean } {
  const profile =
    signals || extractResumeSignals(resumeText, skills);
  const haystack = [job.title, job.description, job.company, job.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const titleLower = (job.title || "").toLowerCase();
  const reasons: string[] = [];

  // Title families first — description often mentions engineers/PMs as collaborators
  const titleFamilies = detectJobFamilies(titleLower);
  const jobFamilies =
    titleFamilies.length > 0
      ? titleFamilies
      : detectJobFamilies(`${titleLower} ${haystack}`.slice(0, 900));

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

  // Boost when job title echoes titles inferred from the CV
  const resumeTitleBlob = profile.titles.join(" ").toLowerCase();
  let cvTitleBoost = 0;
  if (resumeTitleBlob) {
    const titleOverlap = [...tokenize(job.title || "")].filter((t) =>
      resumeTitleBlob.includes(t),
    );
    if (titleOverlap.length >= 2) {
      cvTitleBoost = 0.1;
      reasons.push(`כותרת דומה לקו״ח: ${titleOverlap.slice(0, 3).join(", ")}`);
    } else if (titleOverlap.length === 1) {
      cvTitleBoost = 0.04;
    }
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
      0.42 * roleScore +
      0.2 * skillScore +
      0.12 * domainScore +
      0.08 * overlapScore +
      0.1 * titleScore +
      0.05 * senScore +
      0.03 * expScore +
      cvTitleBoost
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

  // Prefer postings whose requirements are written in Hebrew
  if (hasHebrewRequirements(job)) {
    score = Math.min(1, Number((score + 0.08).toFixed(4)));
    reasons.push("דרישות בעברית");
  } else {
    // Slightly demote English-only JDs so Hebrew ones rise in the pool
    score = Math.max(0, Number((score - 0.03).toFixed(4)));
  }

  if (!reasons.length) {
    reasons.push(score >= 0.35 ? "התאמה חלקית לפרופיל" : "התאמה חלשה לקו״ח");
  }

  return { score, reasons: reasons.slice(0, 6) };
}
