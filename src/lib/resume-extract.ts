const KNOWN_SKILLS = [
  "python",
  "javascript",
  "typescript",
  "react",
  "next.js",
  "nextjs",
  "node",
  "nodejs",
  "fastapi",
  "django",
  "sql",
  "postgres",
  "postgresql",
  "supabase",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "git",
  "linux",
  "java",
  "c#",
  "go",
  "rust",
  "html",
  "css",
  "tailwind",
  "redis",
  "mongodb",
  "graphql",
  "rest",
  "ci/cd",
  "agile",
  "scrum",
  "excel",
  "powerpoint",
  "salesforce",
  "hubspot",
  "figma",
  "jira",
  "notion",
  "tableau",
  "power bi",
  "pytorch",
  "tensorflow",
  "langchain",
  "openai",
  "llm",
  "machine learning",
  "deep learning",
  "nlp",
  "rag",
  "prompt engineering",
  "product management",
  "product owner",
  "product manager",
  "roadmap",
  "backlog",
  "user research",
  "a/b testing",
  "fp&a",
  "ifrs",
  "sap",
  "priority",
  "quickbooks",
  "netsuite",
  "stakeholder management",
  "go-to-market",
  "gtm",
  "seo",
  "sem",
  "copywriting",
  "devops",
  "mlops",
  "data analysis",
  "data science",
  "business analysis",
  "project management",
  "pmp",
  "kanban",
  "vue",
  "angular",
  "flutter",
  "swift",
  "kotlin",
  "spark",
  "airflow",
  "dbt",
  "snowflake",
  "bigquery",
  "looker",
  "amplitude",
  "mixpanel",
  "hebrew",
  "english",
];

export type RoleFamily =
  | "engineering"
  | "product"
  | "data_ai"
  | "finance"
  | "management"
  | "sales"
  | "marketing"
  | "design"
  | "hr"
  | "other";

export type Seniority = "junior" | "mid" | "senior" | "lead" | "exec";

export type ResumeSignals = {
  skills: string[];
  domains: string[];
  families: RoleFamily[];
  titles: string[];
  seniority: Seniority | null;
  yearsExperience: number | null;
};

const ROLE_PATTERNS: Array<{ family: RoleFamily; re: RegExp; title?: string }> = [
  {
    family: "product",
    re: /product\s*manager|product\s*owner|מנהל(?:\s*\/\s*ת)?(?:ת)?\s*מוצר|בעלי?\s*מוצר|\bpm\b|head of product|vp product/i,
    title: "product manager",
  },
  {
    family: "product",
    re: /product\s*analyst|אנליסט(?:\s*\/\s*ית)?(?:ית)?\s*מוצר|product\s*operations|product\s*marketing/i,
    title: "product analyst",
  },
  {
    family: "data_ai",
    re: /machine\s*learning|ml\s*engineer|data\s*scientist|llm engineer|gen(?:erative)?\s*ai engineer|מדען(?:\s*\/\s*ית)?(?:ית)?\s*נתונים|nlp engineer|ai engineer|prompt engineer/i,
    title: "ai / ml",
  },
  {
    family: "data_ai",
    re: /data\s*analyst|data\s*engineer|אנליסט(?:\s*\/\s*ית)?(?:ית)?\s*נתונים|bi analyst|analytics engineer/i,
    title: "data analyst",
  },
  {
    family: "engineering",
    re: /software\s*engineer|full\s*stack|fullstack|backend engineer|frontend engineer|devops|sre|מפתח(?:\s*\/\s*ת)?(?:ת)?\s*תוכנה|מהנדס(?:\s*\/\s*ת)?(?:ת)?\s*תוכנה/i,
    title: "software engineer",
  },
  {
    family: "finance",
    re: /fp&a|financial\s*analyst|controller|חשב(?:\s*\/\s*ת)?(?:ת)?|כלכל(?:ן|נית)|תקציב|fintech analyst|accountant|רואה חשבון/i,
    title: "finance",
  },
  {
    family: "management",
    re: /project\s*manager|program\s*manager|operations\s*manager|team\s*lead|מנהל(?:\s*\/\s*ת)?(?:ת)?\s*פרויקט|מנהל(?:\s*\/\s*ת)?(?:ת)?\s*תפעול|delivery manager/i,
    title: "project / operations",
  },
  {
    family: "sales",
    re: /account\s*executive|sales\s*manager|business\s*development|\bbdr\b|\badr\b|customer\s*success|\bcsm\b|מכירות|הצלחת לקוחות/i,
    title: "sales / cs",
  },
  {
    family: "marketing",
    re: /marketing manager|growth\s*manager|שיווק דיגיטלי|demand gen|content marketing|brand manager|product marketing/i,
    title: "marketing",
  },
  {
    family: "design",
    re: /product\s*designer|ux designer|ui\/ux|graphic designer|מעצב(?:\s*\/\s*ת)?(?:ת)?\s*מוצר/i,
    title: "design",
  },
  {
    family: "hr",
    re: /recruiter|talent acquisition|hr business|משאבי אנוש|גיוס/i,
    title: "hr",
  },
];

/** Normalize Hebrew gender-slash titles so מנהל/ת matches patterns. */
export function normalizeHebrewRoleText(text: string): string {
  return text
    .replace(/מנהל\s*\/\s*ת/gi, "מנהל/ת")
    .replace(/מנהל\/ת/gi, "מנהלת")
    .replace(/מפתח\s*\/\s*ת/gi, "מפתח/ת")
    .replace(/מפתח\/ת/gi, "מפתחת")
    .replace(/מהנדס\s*\/\s*ת/gi, "מהנדס/ת")
    .replace(/מהנדס\/ת/gi, "מהנדסת")
    .replace(/אנליסט\s*\/\s*ית/gi, "אנליסט/ית")
    .replace(/אנליסט\/ית/gi, "אנליסטית")
    .replace(/חשב\s*\/\s*ת/gi, "חשב/ת")
    .replace(/חשב\/ת/gi, "חשבת")
    .replace(/מעצב\s*\/\s*ת/gi, "מעצב/ת")
    .replace(/מעצב\/ת/gi, "מעצבת");
}

function normalizeSkill(s: string): string {
  const t = s.trim().toLowerCase();
  if (t === "nextjs") return "next.js";
  if (t === "nodejs" || t === "node.js") return "node";
  if (t === "postgresql") return "postgres";
  return t;
}

export function extractSkills(text: string): string[] {
  const lower = normalizeHebrewRoleText(text).toLowerCase();
  const found = KNOWN_SKILLS.filter((skill) => lower.includes(skill.trim()));
  const domains: string[] = [];
  if (/ai|llm|machine learning|בינה מלאכותית|אלגוריתם|deep learning|nlp|rag/i.test(text)) {
    domains.push("ai");
  }
  if (
    /product manager|product owner|מנהל(?:\s*\/\s*ת)?(?:ת)?\s*מוצר|roadmap|product management/i.test(
      text,
    )
  ) {
    domains.push("product");
  }
  if (/finance|פיננס|חשב|תקציב|fp&a|אשראי|fintech|ifrs/i.test(text)) {
    domains.push("finance");
  }
  // Don't tag every "מנהל" / "manager" as management — too noisy on Product CVs
  if (
    /project manager|operations manager|מנהל(?:\s*\/\s*ת)?(?:ת)?\s*פרויקט|מנהל(?:\s*\/\s*ת)?(?:ת)?\s*תפעול|team lead|ראש צוות/i.test(
      text,
    )
  ) {
    domains.push("management");
  }
  if (/marketing|שיווק|growth manager|demand gen/i.test(text)) {
    domains.push("marketing");
  }
  if (
    /\bsales\b|מכירות|customer success|הצלחת לקוחות|\bbdr\b|\bcsm\b/i.test(text) &&
    !/salesforce/i.test(text)
  ) {
    domains.push("sales");
  }
  if (
    /software engineer|developer|מפתח(?:\s*\/\s*ת)?(?:ת)?\s*תוכנה|fullstack|full stack|backend engineer|frontend engineer|devops/i.test(
      text,
    )
  ) {
    domains.push("tech");
  }

  return [
    ...new Set([...found, ...domains].map(normalizeSkill).filter(Boolean)),
  ];
}

function guessYears(text: string): number | null {
  const m =
    text.match(/(\d{1,2})\+?\s*(?:years?|שנ(?:ות|ה)|yrs?)/i) ||
    text.match(/(?:ניסיון|experience)[^\d]{0,20}(\d{1,2})/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n < 50 ? n : null;
}

function guessSeniority(text: string, years: number | null): Seniority | null {
  if (/chief|c-level|\bceo\b|\bcto\b|\bcfo\b|\bcoo\b|vp\b|vice president|סמנכ/i.test(text)) {
    return "exec";
  }
  if (/head of|director|מנהל(?:ת)? אגף|מנהל(?:ת)? מחלקה/i.test(text)) {
    return "lead";
  }
  if (/principal|staff engineer|team lead|group lead|ראש צוות/i.test(text)) {
    return "lead";
  }
  if (/senior|סניור|בכיר/i.test(text)) return "senior";
  if (/junior|entry.?level|מתחיל|סטודנט|intern|internship/i.test(text)) {
    return "junior";
  }
  if (years != null) {
    if (years >= 10) return "lead";
    if (years >= 5) return "senior";
    if (years >= 2) return "mid";
    return "junior";
  }
  return null;
}

/** Rich signals from CV text for matching (roles, seniority, skills, domains). */
export function extractResumeSignals(
  text: string | null | undefined,
  existingSkills: string[] = [],
): ResumeSignals {
  const raw = normalizeHebrewRoleText((text || "").trim());
  // Prefer the top of the CV (headline / recent roles) for title detection
  const head = raw.slice(0, 1200);
  const skills = [
    ...new Set([
      ...existingSkills.map(normalizeSkill),
      ...(raw ? extractSkills(raw) : []),
    ]),
  ];
  const families = new Set<RoleFamily>();
  const titles: string[] = [];

  for (const pattern of ROLE_PATTERNS) {
    const inHead = pattern.re.test(head);
    const inBody = !inHead && pattern.re.test(raw);
    const inSkills = skills.some((s) => pattern.re.test(s));
    if (inHead || inBody) {
      families.add(pattern.family);
      if (pattern.title) titles.push(pattern.title);
    } else if (inSkills && pattern.family !== "engineering") {
      families.add(pattern.family);
      if (pattern.title && pattern.family === "product") {
        titles.push(pattern.title);
      }
    }
  }

  // Explicit AI Product Manager phrasing (title-quality signal)
  if (
    /(?:ai|llm|gen(?:erative)?\s*ai|בינה)\s*.{0,24}(?:product\s*manager|מנהל(?:ת)?\s*מוצר)|(?:product\s*manager|מנהל(?:ת)?\s*מוצר)\s*.{0,24}(?:ai|llm|gen(?:erative)?\s*ai|בינה)/i.test(
      raw,
    )
  ) {
    families.add("product");
    titles.unshift("AI product manager");
  }

  // Domain tags → families (avoid loose tags flooding the wrong role family)
  if (skills.includes("product") || skills.includes("product management")) {
    families.add("product");
  }
  // Strong AI/ML skills → data_ai only when CV is not clearly Product-primary
  if (
    skills.includes("llm") ||
    skills.includes("machine learning") ||
    skills.includes("deep learning") ||
    skills.includes("pytorch") ||
    skills.includes("tensorflow") ||
    skills.includes("data science")
  ) {
    if (!families.has("product")) families.add("data_ai");
  } else if (
    skills.includes("ai") &&
    !families.has("product") &&
    !families.has("finance") &&
    !families.has("marketing") &&
    !families.has("sales")
  ) {
    families.add("data_ai");
  }
  if (skills.includes("finance") || skills.includes("fp&a")) {
    families.add("finance");
  }
  // Languages alone (python/react) do not make an engineering CV
  if (
    /software\s*engineer|full\s*stack|fullstack|backend engineer|frontend engineer|devops|מפתח(?:ת)?\s*תוכנה|מהנדס(?:ת)?\s*תוכנה/i.test(
      raw,
    )
  ) {
    families.add("engineering");
  }

  const domains = skills.filter((s) =>
    ["ai", "product", "finance", "management", "marketing", "sales", "tech"].includes(
      s,
    ),
  );
  const years = guessYears(raw);
  const seniority = guessSeniority(raw, years);

  return {
    skills,
    domains,
    families: [...families],
    titles: [...new Set(titles)].slice(0, 8),
    seniority,
    yearsExperience: years,
  };
}

export async function extractResumeText(
  bytes: Buffer,
  filename: string,
  mimeType: string,
): Promise<string | null> {
  const lower = filename.toLowerCase();

  if (mimeType === "text/plain" || lower.endsWith(".txt")) {
    return bytes.toString("utf-8");
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: bytes });
    return result.value?.trim() || null;
  }

  // .doc / pdf: store raw best-effort text sniff
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
    const asLatin = bytes.toString("latin1");
    const strings = asLatin.match(/[\x20-\x7E\u0590-\u05FF]{4,}/g);
    if (strings && strings.length > 5) {
      return strings.slice(0, 400).join(" ");
    }
  }

  return null;
}
