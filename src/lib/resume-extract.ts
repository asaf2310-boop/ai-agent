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
    re: /product\s*manager|product\s*owner|מנהל(?:ת)?\s*מוצר|בעלי?\s*מוצר|\bpm\b|head of product|vp product/i,
    title: "product manager",
  },
  {
    family: "product",
    re: /product\s*analyst|אנליסט(?:ית)?\s*מוצר|product\s*operations|product\s*marketing/i,
    title: "product",
  },
  {
    family: "data_ai",
    re: /machine\s*learning|ml\s*engineer|data\s*scientist|llm|gen(?:erative)?\s*ai|בינה מלאכותית|מדען(?:ית)? נתונים|nlp engineer|ai engineer|prompt engineer/i,
    title: "ai / ml",
  },
  {
    family: "data_ai",
    re: /data\s*analyst|data\s*engineer|אנליסט(?:ית)? נתונים|bi analyst|analytics engineer/i,
    title: "data",
  },
  {
    family: "engineering",
    re: /software\s*engineer|full\s*stack|fullstack|backend|frontend|devops|sre|מפתח(?:ת)?|מהנדס(?:ת)?\s*תוכנה|developer|programmer/i,
    title: "software engineer",
  },
  {
    family: "finance",
    re: /fp&a|financial\s*analyst|controller|חשב(?:ת)?|כלכל(?:ן|נית)|תקציב|fintech analyst|accountant|רואה חשבון/i,
    title: "finance",
  },
  {
    family: "management",
    re: /project\s*manager|program\s*manager|operations\s*manager|team\s*lead|מנהל(?:ת)?\s*פרויקט|מנהל(?:ת)?\s*תפעול|delivery manager/i,
    title: "project / operations",
  },
  {
    family: "sales",
    re: /account\s*executive|sales\s*manager|business\s*development|\bbdr\b|\badr\b|customer\s*success|\bcsm\b|מכירות|הצלחת לקוחות/i,
    title: "sales / cs",
  },
  {
    family: "marketing",
    re: /marketing|growth\s*manager|שיווק|demand gen|content marketing|brand manager/i,
    title: "marketing",
  },
  {
    family: "design",
    re: /product\s*designer|ux|ui\/ux|graphic designer|מעצב(?:ת)?/i,
    title: "design",
  },
  {
    family: "hr",
    re: /recruiter|talent acquisition|hr business|משאבי אנוש|גיוס/i,
    title: "hr",
  },
];

function normalizeSkill(s: string): string {
  const t = s.trim().toLowerCase();
  if (t === "nextjs") return "next.js";
  if (t === "nodejs" || t === "node.js") return "node";
  if (t === "postgresql") return "postgres";
  return t;
}

export function extractSkills(text: string): string[] {
  const lower = text.toLowerCase();
  const found = KNOWN_SKILLS.filter((skill) => lower.includes(skill.trim()));
  const domains: string[] = [];
  if (/ai|llm|machine learning|בינה מלאכותית|אלגוריתם|deep learning|nlp|rag/i.test(text)) {
    domains.push("ai");
  }
  if (/product manager|product owner|מנהל(?:ת)? מוצר|roadmap|product management/i.test(text)) {
    domains.push("product");
  }
  if (/finance|פיננס|חשב|תקציב|fp&a|אשראי|fintech|ifrs/i.test(text)) {
    domains.push("finance");
  }
  if (/ניהול|manager|operations|תפעול|team lead|מנהל|project manager/i.test(text)) {
    domains.push("management");
  }
  if (/marketing|שיווק|growth/i.test(text)) domains.push("marketing");
  if (/sales|מכירות|customer success|הצלחת לקוחות/i.test(text)) {
    domains.push("sales");
  }
  if (
    /software|developer|engineer|מפתח|fullstack|full stack|backend|frontend|devops/i.test(
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
  const raw = (text || "").trim();
  const skills = [
    ...new Set([
      ...existingSkills.map(normalizeSkill),
      ...(raw ? extractSkills(raw) : []),
    ]),
  ];
  const families = new Set<RoleFamily>();
  const titles: string[] = [];

  for (const pattern of ROLE_PATTERNS) {
    if (pattern.re.test(raw) || skills.some((s) => pattern.re.test(s))) {
      families.add(pattern.family);
      if (pattern.title) titles.push(pattern.title);
    }
  }

  // Domain tags → families
  if (skills.includes("product") || skills.includes("product management")) {
    families.add("product");
  }
  if (skills.includes("ai") || skills.includes("llm") || skills.includes("machine learning")) {
    families.add("data_ai");
  }
  if (skills.includes("finance") || skills.includes("fp&a")) {
    families.add("finance");
  }
  if (skills.includes("tech") || skills.includes("python") || skills.includes("react")) {
    // Only add engineering if there are strong eng signals — avoid tagging every Python mention
    if (
      /software|developer|engineer|מפתח|fullstack|backend|frontend|devops/i.test(raw) ||
      skills.includes("tech")
    ) {
      families.add("engineering");
    }
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
