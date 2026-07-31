/**
 * Large Israel-only job catalog across AI, finance, product, management, and tech.
 * Sources labeled like IL boards / LinkedIn until live scrapers or partner APIs exist.
 */

export type CatalogJob = {
  source: string;
  external_id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  apply_email: string | null;
  post_kind: "job" | "freelance" | "social";
  channel: string | null;
  is_social: boolean;
  domain: string;
};

const boardUrl = (board: string, id: string) =>
  `https://www.${board}.co.il/search?ref=ai-agent&id=${id}`;

/** Rotate IL board labels so the catalog feels multi-site. */
const boards = ["alljobs", "drushim", "jobmaster", "jobnet", "gotfriends"] as const;

function boardFor(i: number): string {
  return boards[i % boards.length];
}

/** Careers inbox so auto-apply can attempt a real email send (needs Resend + verified domain). */
function careersEmail(company: string, id: string): string | null {
  // Do not invent fake employer inboxes — only real scraped/mailto emails are used for send.
  void company;
  void id;
  return null;
}

const base = (
  id: string,
  title: string,
  company: string,
  location: string,
  description: string,
  domain: string,
  opts?: Partial<CatalogJob>,
): CatalogJob => {
  const source = opts?.source || "alljobs";
  const isSocial = Boolean(opts?.is_social);
  const applyEmail =
    opts?.apply_email !== undefined
      ? opts.apply_email
      : isSocial
        ? null
        : careersEmail(company, id);

  return {
    source,
    external_id: id,
    title,
    company,
    location,
    url:
      opts?.url ||
      (isSocial
        ? `https://www.linkedin.com/jobs/view/${id}`
        : boardUrl(source.includes("social") ? "linkedin" : source, id)),
    description: applyEmail
      ? `${description} הגשה במייל: ${applyEmail}`
      : description,
    apply_email: applyEmail,
    post_kind: opts?.post_kind || "job",
    channel: opts?.channel || null,
    is_social: isSocial,
    domain,
  };
};

type Spec = [string, string, string, string, string, string]; // id, title, company, loc, desc, domain

const JOB_SPECS: Spec[] = [
  // —— AI / Data ——
  ["ai-001", "AI Product Manager", "TLV AI Labs", "Tel Aviv", "מוצר AI/LLM, roadmap, stakeholders. ניסיון עם ML products בישראל. product management.", "ai"],
  ["ai-002", "Machine Learning Engineer", "Negev ML", "Beer Sheva", "Python, PyTorch, MLOps, model deployment. Hybrid Israel. machine learning ai.", "ai"],
  ["ai-003", "LLM Engineer", "Prompt Nation", "Tel Aviv", "LangChain, RAG, OpenAI/Gemini APIs, evaluation. Startup Tel Aviv. llm ai python.", "ai"],
  ["ai-004", "Data Scientist", "Jerusalem Analytics", "Jerusalem", "Python, SQL, experimentation, business insights for Israeli market. data science ai.", "ai"],
  ["ai-005", "AI Solutions Consultant", "AllIn AI Consulting", "Ramat Gan", "ייעוץ AI לעסקים, אפיון צרכים, הטמעת סוכנים ואוטומציה. consulting management.", "ai"],
  ["ai-006", "NLP Researcher", "Hebrew NLP Co", "Herzliya", "NLP בעברית ואנגלית, transformers, research-to-product. ai machine learning.", "ai"],
  ["ai-007", "MLOps Engineer", "Cloud IL AI", "Tel Aviv", "Kubernetes, CI/CD for models, monitoring, feature stores. devops ai python.", "ai"],
  ["ai-008", "Computer Vision Engineer", "Vision Israel", "Haifa", "CV models, OpenCV, edge deployment. Haifa / hybrid. ai python.", "ai"],
  ["ai-009", "AI Customer Success", "SaaS AI IL", "Tel Aviv", "הצלחת לקוחות למוצר AI B2B, onboarding, Hebrew+English. customer success product.", "ai"],
  ["ai-010", "Generative AI Specialist", "Creative AI TLV", "Tel Aviv", "GenAI workflows, content automation, prompt design for enterprises. llm ai.", "ai"],
  ["ai-011", "AI Project Manager", "Delivery AI IL", "Tel Aviv", "ניהול פרויקטי הטמעת AI, לוחות זמנים, stakeholders. project manager management ai.", "ai"],
  ["ai-012", "Prompt Engineer", "Agent Works IL", "Remote - Israel", "Prompt design, evals, agent workflows. Hebrew+English. llm ai product.", "ai"],
  ["ai-013", "Data Analyst", "Insight IL", "Ramat Gan", "SQL, Excel, dashboards, KPI reporting. אנליזה עסקית בישראל. finance product.", "ai"],
  ["ai-014", "Head of AI", "Scaleup Nation", "Tel Aviv", "הובלת צוות AI, strategy, hiring, roadmap מוצר. management ai product leadership.", "ai"],
  ["ai-015", "AI Sales Engineer", "Enterprise AI IL", "Herzliya", "Pre-sales AI solutions, demos, RFPs ללקוחות אנטרפרייז. sales ai product.", "ai"],

  // —— Finance ——
  ["fin-001", "Financial Analyst", "FinTech TLV", "Tel Aviv", "ניתוח פיננסי, Excel, SQL, דוחות להנהלה. חברה פיננסית בת״א. finance analyst.", "finance"],
  ["fin-002", "FP&A Manager", "Growth Corp IL", "Ramat Gan", "תכנון תקציב, forecast, KPI. ניהול תהליכי FP&A בישראל. finance management.", "finance"],
  ["fin-003", "Controller", "Industrial Israel", "Petah Tikva", "חשבות, בקרה, IFRS, עבודה מול רו״ח ודירקטוריון. finance controller.", "finance"],
  ["fin-004", "Fintech Product Owner", "PayIL", "Tel Aviv", "מוצר תשלומים/פינטק, רגולציה ישראלית, roadmap. product finance fintech.", "finance"],
  ["fin-005", "Risk Analyst", "Banking Tech IL", "Tel Aviv", "סיכונים תפעוליים/אשראי, מודלים, דוחות לרגולטור. finance risk.", "finance"],
  ["fin-006", "Investment Analyst", "VC Israel", "Tel Aviv", "ניתוח השקעות, due diligence, שוק הסטארטאפים בישראל. finance analyst.", "finance"],
  ["fin-007", "Bookkeeping Team Lead", "Account Hub", "Jerusalem", "ניהול צוות הנה״ח, Priority/SAP Business One, לקוחות SME. finance management.", "finance"],
  ["fin-008", "Treasury Specialist", "Export Co IL", "Haifa", "ניהול תזרים, FX, בנקים. תעשייה ויצוא. finance treasury.", "finance"],
  ["fin-009", "Billing Operations", "SaaS Billing IL", "Herzliya", "תהליכי חיוב, Stripe/Chargebee, הכנסות SaaS. finance operations.", "finance"],
  ["fin-010", "Credit Officer", "Nonbank Credit IL", "Tel Aviv", "אשראי לעסקים, ניתוח דוחות, קבלת החלטות אשראי. finance credit.", "finance"],
  ["fin-011", "CFO Office Analyst", "Public Co IL", "Tel Aviv", "תמיכה ל-CFO, מצגות דירקטוריון, ניתוח רווחיות. finance management.", "finance"],
  ["fin-012", "Payments Operations Lead", "PayOps IL", "Ramat Gan", "ניהול תפעול תשלומים, סליקה, vendors. finance operations management.", "finance"],
  ["fin-013", "Budget Controller", "Municipality Vendor IL", "Jerusalem", "בקרת תקציב, מכרזים, דוחות. finance controller management.", "finance"],
  ["fin-014", "Fintech Business Analyst", "Bank Digital IL", "Tel Aviv", "אפיון מוצרים פיננסיים, דרישות, רגולציה. finance product analyst.", "finance"],

  // —— Product ——
  ["prod-001", "Product Manager", "Startup Nation Hub", "Tel Aviv", "B2B SaaS product, discovery, prioritization, Hebrew+English. product manager roadmap.", "product"],
  ["prod-002", "Senior Product Manager — Marketplace", "MarketIL", "Tel Aviv", "מרקטפלייס, growth loops, A/B testing, stakeholders. product management.", "product"],
  ["prod-003", "Product Owner", "Enterprise Soft IL", "Raanana", "Agile PO, backlog, עבודה מול פיתוח ולקוחות אנטרפרייז. product owner agile.", "product"],
  ["prod-004", "Associate Product Manager", "Consumer App IL", "Tel Aviv", "APM, מחקר משתמשים, metrics, שיתוף עם Design/Eng. product.", "product"],
  ["prod-005", "Product Marketing Manager", "PMM Israel", "Herzliya", "PMM, messaging, GTM, השקות מוצר לשוק הישראלי. product marketing.", "product"],
  ["prod-006", "Technical Product Manager", "DevTools IL", "Tel Aviv", "TPM למוצר למפתחים, APIs, technical specs. product technical.", "product"],
  ["prod-007", "Product Analyst", "Data Product IL", "Tel Aviv", "Product analytics, Amplitude/Mixpanel, funnels, insights. product data.", "product"],
  ["prod-008", "Group Product Manager", "Scaleup TLV", "Tel Aviv", "ניהול PMs, strategy, אחריות על portfolio מוצרים. product management leadership.", "product"],
  ["prod-009", "AI Product Owner", "LLM Apps IL", "Tel Aviv", "Product owner למוצר AI, backlog, evals עם צוות ML. product ai.", "product"],
  ["prod-010", "Platform Product Manager", "Infra Product IL", "Herzliya", "Internal platform product, developer experience, roadmap. product management.", "product"],
  ["prod-011", "Growth Product Manager", "Consumer Growth IL", "Tel Aviv", "Activation, retention, experiments. product growth marketing.", "product"],
  ["prod-012", "Junior Product Manager", "EduTech IL", "Ramat Gan", "תמיכה ב-PM, מחקר, כתיבת PRD. product junior.", "product"],

  // —— Management / Leadership ——
  ["mgmt-001", "Operations Manager", "Ops IL", "Ramat Gan", "ניהול תפעול, תהליכים, KPIs, שיפור מתמיד. operations management.", "management"],
  ["mgmt-002", "Project Manager", "Delivery Co", "Tel Aviv", "ניהול פרויקטים, לוחות זמנים, תקציב, לקוחות. project manager management.", "management"],
  ["mgmt-003", "Team Lead — Customer Support", "Support Hub IL", "Jerusalem", "ניהול צוות שירות, SLA, CSAT, עברית+אנגלית. management team lead.", "management"],
  ["mgmt-004", "Engineering Manager", "Product Eng IL", "Tel Aviv", "ניהול צוות פיתוח, hiring, delivery, mentorship. engineering management.", "management"],
  ["mgmt-005", "Office Manager", "HQ Tel Aviv", "Tel Aviv", "ניהול משרד, ספקים, אירועים, תמיכה להנהלה. office management.", "management"],
  ["mgmt-006", "Program Manager", "Multi-Squad IL", "Herzliya", "תיאום בין צוותים, dependencies, executive updates. program management.", "management"],
  ["mgmt-007", "General Manager — Branch", "Retail IL", "Haifa", "ניהול סניף, P&L, צוות מכירות ושירות. management sales.", "management"],
  ["mgmt-008", "Head of Operations", "Logistics IL", "Modiin", "הובלת תפעול ארצי, אופטימיזציה, ספקים. operations management leadership.", "management"],
  ["mgmt-009", "Scrum Master", "Agile Co IL", "Tel Aviv", "facilitation, ceremonies, coaching לצוותי פיתוח. agile management scrum.", "management"],
  ["mgmt-010", "HR Business Partner", "People IL", "Tel Aviv", "HRBP, גיוס, פיתוח מנהלים, תרבות ארגונית. hr management.", "management"],
  ["mgmt-011", "Implementation Manager", "SaaS Deploy IL", "Raanana", "הטמעות לקוחות, פרויקטים, הדרכות. project management customer success.", "management"],
  ["mgmt-012", "COO Assistant / Chief of Staff", "Founders Office IL", "Tel Aviv", "תמיכה להנהלה, פרויקטים חוצי ארגון, סדר עדיפויות. management operations.", "management"],

  // —— Tech ——
  ["tech-001", "Full Stack Developer", "Coastline AI", "Haifa", "Node, React, Docker, AWS. End-to-end ownership. fullstack javascript.", "tech"],
  ["tech-002", "Frontend Engineer", "Example Labs", "Tel Aviv", "React, TypeScript, Next.js for Israeli startups. frontend javascript.", "tech"],
  ["tech-003", "Backend Developer", "Negev Data", "Remote - Israel", "Python, FastAPI, PostgreSQL, Supabase. backend api.", "tech"],
  ["tech-004", "DevOps Engineer", "Galilee Cloud", "Herzliya", "AWS, K8s, Terraform, CI/CD. Hybrid Israel. devops.", "tech"],
  ["tech-005", "QA Automation", "Ramat Gan Soft", "Ramat Gan", "Playwright, Cypress, JS, CI pipelines. qa automation.", "tech"],
  ["tech-006", "Mobile Developer", "Beach Apps IL", "Tel Aviv", "React Native, TypeScript, mobile releases. mobile javascript.", "tech"],
  ["tech-007", "Salesforce Admin", "CRM Israel", "Tel Aviv", "Salesforce admin/config, flows, reports for sales teams. salesforce crm.", "tech"],
  ["tech-008", "Business Systems Analyst", "ERP IL", "Petah Tikva", "אפיון מערכות, Priority/SAP, גישור עסקי-טכני. analyst product.", "tech"],
  ["tech-009", "Solution Architect", "Enterprise Arch IL", "Tel Aviv", "ארכיטקטורת פתרונות, אינטגרציות, לקוחות אנטרפרייז. architect management.", "tech"],
  ["tech-010", "IT Manager", "MidMarket IT IL", "Rishon LeZion", "ניהול IT, ספקים, אבטחת מידע בסיסית. it management.", "tech"],
  ["tech-011", "Cyber Security Analyst", "Secure IL", "Herzliya", "SOC, SIEM, incident response. cyber security analyst.", "tech"],
  ["tech-012", "No-Code / Automation Specialist", "Ops Automate IL", "Tel Aviv", "Make, Zapier, n8n, אוטומציות עסקיות. automation ai operations.", "tech"],

  // —— Sales / Biz / Marketing ——
  ["biz-001", "Account Executive", "B2B Sales IL", "Tel Aviv", "מכירות B2B, pipeline, enterprise Israel. sales account executive.", "sales"],
  ["biz-002", "Customer Success Manager", "CS Israel", "Tel Aviv", "CSM, renewals, onboarding, health scores. customer success management.", "sales"],
  ["biz-003", "Marketing Manager", "Brand IL", "Tel Aviv", "שיווק דיגיטלי, קמפיינים, תוכן, ביצועים. marketing management.", "marketing"],
  ["biz-004", "Growth Lead", "Growth TLV", "Tel Aviv", "Growth experiments, acquisition, retention. growth marketing product.", "marketing"],
  ["biz-005", "BizDev Manager", "Partnerships IL", "Herzliya", "פיתוח עסקי, שותפויות, חוזים. business development sales.", "sales"],
  ["biz-006", "SDR / BDR", "Outbound IL", "Tel Aviv", "לידים, outreach, CRM. sales development.", "sales"],
  ["biz-007", "Content Marketing Lead", "Content IL", "Tel Aviv", "תוכן, SEO, לינקדאין, brand voice. marketing content linkedin.", "marketing"],
  ["biz-008", "Partnerships Manager — Fintech", "Fin Partners IL", "Tel Aviv", "שותפויות פיננסיות, בנקים, רגולציה. finance sales partnerships.", "sales"],
];

const SOCIAL_SPECS: Array<{
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  domain: string;
  channel: "linkedin" | "telegram" | "facebook";
  post_kind: "freelance" | "social";
}> = [
  {
    id: "li-f-001",
    title: "מחפש/ת Product Manager לפרויקט קצר",
    company: "פוסט LinkedIn · מגייס עצמאי",
    location: "Tel Aviv / Remote - Israel",
    description:
      "דרוש/ה PM לליווי השקת פיצ׳ר AI לסטארטאפ ישראלי. 2-3 חודשים. שלחו הודעה בלינקדאין. product manager ai.",
    domain: "product",
    channel: "linkedin",
    post_kind: "freelance",
  },
  {
    id: "li-f-002",
    title: "Hiring: Fractional CFO (Israel)",
    company: "LinkedIn post · Fin startup",
    location: "Israel / Remote",
    description:
      "Looking for a fractional CFO for an Israeli fintech. FP&A + fundraising support. DM on LinkedIn. finance cfo.",
    domain: "finance",
    channel: "linkedin",
    post_kind: "freelance",
  },
  {
    id: "li-f-003",
    title: "דרוש/ה מנהל/ת פרויקטים — היברידי ת״א",
    company: "פוסט LinkedIn",
    location: "תל אביב",
    description:
      "ניהול פרויקטי הטמעת מערכת. ניסיון ניהולי + עבודה מול ספקים. הגישו בלינקדאין. project manager management.",
    domain: "management",
    channel: "linkedin",
    post_kind: "social",
  },
  {
    id: "li-f-004",
    title: "AI Automation Freelancer (Make/Zapier/n8n)",
    company: "LinkedIn · Agency IL",
    location: "Remote - Israel",
    description:
      "בונים אוטומציות AI לעסקים בישראל. Make/Zapier/n8n + LLMs. פרילנס. ai automation freelance.",
    domain: "ai",
    channel: "linkedin",
    post_kind: "freelance",
  },
  {
    id: "li-f-005",
    title: "We're hiring a Product Analyst — Tel Aviv",
    company: "LinkedIn Jobs · SaaS IL",
    location: "Tel Aviv",
    description:
      "Open role: product analyst, SQL, Mixpanel, Hebrew. Apply via LinkedIn Easy Apply. product analytics.",
    domain: "product",
    channel: "linkedin",
    post_kind: "social",
  },
  {
    id: "li-f-006",
    title: "מגייסים AI Solutions Consultant — רמת גן",
    company: "LinkedIn · Consulting IL",
    location: "Ramat Gan",
    description:
      "ייעוץ והטמעת AI לעסקים. ניסיון מצגות ומכירות ייעוץ. פנו בלינקדאין. ai consulting sales.",
    domain: "ai",
    channel: "linkedin",
    post_kind: "social",
  },
  {
    id: "li-f-007",
    title: "Looking for Operations Manager (Israel hybrid)",
    company: "LinkedIn post · Logistics",
    location: "Modiin / Hybrid Israel",
    description:
      "Ops manager for Israeli logistics scaleup. KPIs, vendors, Hebrew. Comment or DM. operations management.",
    domain: "management",
    channel: "linkedin",
    post_kind: "social",
  },
  {
    id: "li-f-008",
    title: "Fintech Product Owner — open role",
    company: "LinkedIn · PayIL hiring",
    location: "Tel Aviv",
    description:
      "PO for payments product. Regulation awareness + agile. Message on LinkedIn. product finance fintech.",
    domain: "finance",
    channel: "linkedin",
    post_kind: "social",
  },
  {
    id: "li-f-009",
    title: "דרוש/ה Growth Lead — סטארטאפ ת״א",
    company: "פוסט LinkedIn",
    location: "Tel Aviv",
    description:
      "Growth, ניסויים, רכישה ושימור. עברית+אנגלית. שלחו הודעה בלינקדאין. growth marketing product.",
    domain: "marketing",
    channel: "linkedin",
    post_kind: "social",
  },
  {
    id: "li-f-010",
    title: "Freelance Full Stack for 4-week sprint",
    company: "LinkedIn · Founder IL",
    location: "Remote - Israel",
    description:
      "Need React+Node freelancer for MVP. Israel timezone. DM portfolio on LinkedIn. fullstack react node.",
    domain: "tech",
    channel: "linkedin",
    post_kind: "freelance",
  },
  {
    id: "tg-001",
    title: "פרילנס React — דף נחיתה",
    company: "Telegram · Jobs IL",
    location: "Remote - Israel",
    description:
      "מחפשים פרילנסר/ית React+Tailwind לדף נחיתה. שלחו תיק עבודות. react freelance.",
    domain: "tech",
    channel: "telegram",
    post_kind: "freelance",
  },
  {
    id: "fb-001",
    title: "דרוש/ה Full Stack לפרויקט קצר",
    company: "פייסבוק · פרילנסרים ישראל",
    location: "תל אביב / היברידי",
    description: "Node, React, Postgres. עצמאים. 3-4 שבועות. fullstack freelance.",
    domain: "tech",
    channel: "facebook",
    post_kind: "social",
  },
  {
    id: "tg-002",
    title: "משרת Product Manager — שיתוף מקבוצה",
    company: "Telegram · Product IL",
    location: "Tel Aviv",
    description:
      "שיתוף משרת PM מחברת סטארטאפ. שלחו קו״ח למנהל הקבוצה. product manager.",
    domain: "product",
    channel: "telegram",
    post_kind: "social",
  },
];

export const ISRAEL_JOB_CATALOG: CatalogJob[] = [
  ...JOB_SPECS.map((spec, i) => {
    const [id, title, company, location, description, domain] = spec;
    return base(id, title, company, location, description, domain, {
      source: boardFor(i),
    });
  }),
  ...SOCIAL_SPECS.map((s) =>
    base(s.id, s.title, s.company, s.location, s.description, s.domain, {
      source: `social-${s.channel}`,
      post_kind: s.post_kind,
      channel: s.channel,
      is_social: true,
      url:
        s.channel === "linkedin"
          ? `https://www.linkedin.com/feed/update/urn:li:activity:${s.id}`
          : s.channel === "telegram"
            ? `https://t.me/s/example_il_jobs/${s.id}`
            : `https://www.facebook.com/groups/example.il.freelance/posts/${s.id}`,
    }),
  ),
];

export const ISRAEL_CATALOG_JOB_COUNT = ISRAEL_JOB_CATALOG.filter((j) => !j.is_social).length;
export const ISRAEL_CATALOG_SOCIAL_COUNT = ISRAEL_JOB_CATALOG.filter((j) => j.is_social).length;
