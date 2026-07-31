"""Israel job + LinkedIn-style social catalog for the Python daily refresh agent."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

BOARDS = ("alljobs", "drushim", "jobmaster", "jobnet", "gotfriends")

# id, title, company, location, description, domain
JOB_SPECS: list[tuple[str, str, str, str, str, str]] = [
    ("ai-001", "AI Product Manager", "TLV AI Labs", "Tel Aviv", "מוצר AI/LLM, roadmap, stakeholders. ML products בישראל. product management.", "ai"),
    ("ai-002", "Machine Learning Engineer", "Negev ML", "Beer Sheva", "Python, PyTorch, MLOps. Hybrid Israel. machine learning ai.", "ai"),
    ("ai-003", "LLM Engineer", "Prompt Nation", "Tel Aviv", "LangChain, RAG, OpenAI/Gemini. llm ai python.", "ai"),
    ("ai-004", "Data Scientist", "Jerusalem Analytics", "Jerusalem", "Python, SQL, experimentation. data science ai.", "ai"),
    ("ai-005", "AI Solutions Consultant", "AllIn AI Consulting", "Ramat Gan", "ייעוץ AI לעסקים, סוכנים ואוטומציה. consulting management ai.", "ai"),
    ("ai-006", "NLP Researcher", "Hebrew NLP Co", "Herzliya", "NLP עברית/אנגלית, transformers. ai machine learning.", "ai"),
    ("ai-007", "MLOps Engineer", "Cloud IL AI", "Tel Aviv", "Kubernetes, CI/CD for models. devops ai python.", "ai"),
    ("ai-008", "Computer Vision Engineer", "Vision Israel", "Haifa", "CV, OpenCV, edge. ai python.", "ai"),
    ("ai-009", "AI Customer Success", "SaaS AI IL", "Tel Aviv", "CS למוצר AI B2B. customer success product ai.", "ai"),
    ("ai-010", "Generative AI Specialist", "Creative AI TLV", "Tel Aviv", "GenAI workflows, prompts. llm ai.", "ai"),
    ("ai-011", "AI Project Manager", "Delivery AI IL", "Tel Aviv", "ניהול פרויקטי AI. project manager management ai.", "ai"),
    ("ai-012", "Prompt Engineer", "Agent Works IL", "Remote - Israel", "Prompt design, agents. llm ai product.", "ai"),
    ("ai-013", "Data Analyst", "Insight IL", "Ramat Gan", "SQL, Excel, dashboards. finance product analyst.", "ai"),
    ("ai-014", "Head of AI", "Scaleup Nation", "Tel Aviv", "הובלת צוות AI. management ai product leadership.", "ai"),
    ("ai-015", "AI Sales Engineer", "Enterprise AI IL", "Herzliya", "Pre-sales AI. sales ai product.", "ai"),
    ("fin-001", "Financial Analyst", "FinTech TLV", "Tel Aviv", "ניתוח פיננסי, Excel, SQL. finance analyst.", "finance"),
    ("fin-002", "FP&A Manager", "Growth Corp IL", "Ramat Gan", "תקציב, forecast, KPI. finance management.", "finance"),
    ("fin-003", "Controller", "Industrial Israel", "Petah Tikva", "חשבות, IFRS. finance controller.", "finance"),
    ("fin-004", "Fintech Product Owner", "PayIL", "Tel Aviv", "מוצר תשלומים. product finance fintech.", "finance"),
    ("fin-005", "Risk Analyst", "Banking Tech IL", "Tel Aviv", "סיכונים ואשראי. finance risk.", "finance"),
    ("fin-006", "Investment Analyst", "VC Israel", "Tel Aviv", "השקעות, due diligence. finance analyst.", "finance"),
    ("fin-007", "Bookkeeping Team Lead", "Account Hub", "Jerusalem", "ניהול הנה״ח. finance management.", "finance"),
    ("fin-008", "Treasury Specialist", "Export Co IL", "Haifa", "תזרים, FX. finance treasury.", "finance"),
    ("fin-009", "Billing Operations", "SaaS Billing IL", "Herzliya", "חיוב SaaS. finance operations.", "finance"),
    ("fin-010", "Credit Officer", "Nonbank Credit IL", "Tel Aviv", "אשראי לעסקים. finance credit.", "finance"),
    ("fin-011", "CFO Office Analyst", "Public Co IL", "Tel Aviv", "תמיכה ל-CFO. finance management.", "finance"),
    ("fin-012", "Payments Operations Lead", "PayOps IL", "Ramat Gan", "תפעול תשלומים. finance operations management.", "finance"),
    ("fin-013", "Budget Controller", "Municipality Vendor IL", "Jerusalem", "בקרת תקציב. finance controller management.", "finance"),
    ("fin-014", "Fintech Business Analyst", "Bank Digital IL", "Tel Aviv", "אפיון מוצרים פיננסיים. finance product analyst.", "finance"),
    ("prod-001", "Product Manager", "Startup Nation Hub", "Tel Aviv", "B2B SaaS product. product manager roadmap.", "product"),
    ("prod-002", "Senior Product Manager — Marketplace", "MarketIL", "Tel Aviv", "מרקטפלייס, growth. product management.", "product"),
    ("prod-003", "Product Owner", "Enterprise Soft IL", "Raanana", "Agile PO, backlog. product owner agile.", "product"),
    ("prod-004", "Associate Product Manager", "Consumer App IL", "Tel Aviv", "APM, מחקר משתמשים. product.", "product"),
    ("prod-005", "Product Marketing Manager", "PMM Israel", "Herzliya", "PMM, GTM. product marketing.", "product"),
    ("prod-006", "Technical Product Manager", "DevTools IL", "Tel Aviv", "TPM, APIs. product technical.", "product"),
    ("prod-007", "Product Analyst", "Data Product IL", "Tel Aviv", "Product analytics. product data.", "product"),
    ("prod-008", "Group Product Manager", "Scaleup TLV", "Tel Aviv", "ניהול PMs. product management leadership.", "product"),
    ("prod-009", "AI Product Owner", "LLM Apps IL", "Tel Aviv", "PO למוצר AI. product ai.", "product"),
    ("prod-010", "Platform Product Manager", "Infra Product IL", "Herzliya", "Internal platform. product management.", "product"),
    ("prod-011", "Growth Product Manager", "Consumer Growth IL", "Tel Aviv", "Activation, retention. product growth marketing.", "product"),
    ("prod-012", "Junior Product Manager", "EduTech IL", "Ramat Gan", "תמיכה ב-PM. product junior.", "product"),
    ("mgmt-001", "Operations Manager", "Ops IL", "Ramat Gan", "ניהול תפעול. operations management.", "management"),
    ("mgmt-002", "Project Manager", "Delivery Co", "Tel Aviv", "ניהול פרויקטים. project manager management.", "management"),
    ("mgmt-003", "Team Lead — Customer Support", "Support Hub IL", "Jerusalem", "ניהול צוות שירות. management team lead.", "management"),
    ("mgmt-004", "Engineering Manager", "Product Eng IL", "Tel Aviv", "ניהול פיתוח. engineering management.", "management"),
    ("mgmt-005", "Office Manager", "HQ Tel Aviv", "Tel Aviv", "ניהול משרד. office management.", "management"),
    ("mgmt-006", "Program Manager", "Multi-Squad IL", "Herzliya", "תיאום צוותים. program management.", "management"),
    ("mgmt-007", "General Manager — Branch", "Retail IL", "Haifa", "ניהול סניף. management sales.", "management"),
    ("mgmt-008", "Head of Operations", "Logistics IL", "Modiin", "הובלת תפעול. operations management leadership.", "management"),
    ("mgmt-009", "Scrum Master", "Agile Co IL", "Tel Aviv", "Agile facilitation. agile management scrum.", "management"),
    ("mgmt-010", "HR Business Partner", "People IL", "Tel Aviv", "HRBP. hr management.", "management"),
    ("mgmt-011", "Implementation Manager", "SaaS Deploy IL", "Raanana", "הטמעות לקוחות. project management customer success.", "management"),
    ("mgmt-012", "COO Assistant / Chief of Staff", "Founders Office IL", "Tel Aviv", "תמיכה להנהלה. management operations.", "management"),
    ("tech-001", "Full Stack Developer", "Coastline AI", "Haifa", "Node, React, Docker, AWS. fullstack javascript.", "tech"),
    ("tech-002", "Frontend Engineer", "Example Labs", "Tel Aviv", "React, TypeScript, Next.js. frontend javascript.", "tech"),
    ("tech-003", "Backend Developer", "Negev Data", "Remote - Israel", "Python, FastAPI, PostgreSQL. backend api.", "tech"),
    ("tech-004", "DevOps Engineer", "Galilee Cloud", "Herzliya", "AWS, K8s, Terraform. devops.", "tech"),
    ("tech-005", "QA Automation", "Ramat Gan Soft", "Ramat Gan", "Playwright, Cypress. qa automation.", "tech"),
    ("tech-006", "Mobile Developer", "Beach Apps IL", "Tel Aviv", "React Native. mobile javascript.", "tech"),
    ("tech-007", "Salesforce Admin", "CRM Israel", "Tel Aviv", "Salesforce admin. salesforce crm.", "tech"),
    ("tech-008", "Business Systems Analyst", "ERP IL", "Petah Tikva", "Priority/SAP. analyst product.", "tech"),
    ("tech-009", "Solution Architect", "Enterprise Arch IL", "Tel Aviv", "ארכיטקטורת פתרונות. architect management.", "tech"),
    ("tech-010", "IT Manager", "MidMarket IT IL", "Rishon LeZion", "ניהול IT. it management.", "tech"),
    ("tech-011", "Cyber Security Analyst", "Secure IL", "Herzliya", "SOC, SIEM. cyber security analyst.", "tech"),
    ("tech-012", "No-Code / Automation Specialist", "Ops Automate IL", "Tel Aviv", "Make, Zapier, n8n. automation ai operations.", "tech"),
    ("biz-001", "Account Executive", "B2B Sales IL", "Tel Aviv", "מכירות B2B. sales account executive.", "sales"),
    ("biz-002", "Customer Success Manager", "CS Israel", "Tel Aviv", "CSM, renewals. customer success management.", "sales"),
    ("biz-003", "Marketing Manager", "Brand IL", "Tel Aviv", "שיווק דיגיטלי. marketing management.", "marketing"),
    ("biz-004", "Growth Lead", "Growth TLV", "Tel Aviv", "Growth experiments. growth marketing product.", "marketing"),
    ("biz-005", "BizDev Manager", "Partnerships IL", "Herzliya", "פיתוח עסקי. business development sales.", "sales"),
    ("biz-006", "SDR / BDR", "Outbound IL", "Tel Aviv", "לידים, outreach. sales development.", "sales"),
    ("biz-007", "Content Marketing Lead", "Content IL", "Tel Aviv", "תוכן, SEO, לינקדאין. marketing content linkedin.", "marketing"),
    ("biz-008", "Partnerships Manager — Fintech", "Fin Partners IL", "Tel Aviv", "שותפויות פיננסיות. finance sales partnerships.", "sales"),
]

SOCIAL_SPECS: list[dict[str, str]] = [
    {
        "id": "li-f-001",
        "title": "מחפש/ת Product Manager לפרויקט קצר",
        "company": "פוסט LinkedIn · מגייס עצמאי",
        "location": "Tel Aviv / Remote - Israel",
        "description": "דרוש/ה PM לליווי השקת פיצ׳ר AI. שלחו הודעה בלינקדאין. product manager ai.",
        "domain": "product",
        "channel": "linkedin",
        "post_kind": "freelance",
    },
    {
        "id": "li-f-002",
        "title": "Hiring: Fractional CFO (Israel)",
        "company": "LinkedIn post · Fin startup",
        "location": "Israel / Remote",
        "description": "Fractional CFO for Israeli fintech. DM on LinkedIn. finance cfo.",
        "domain": "finance",
        "channel": "linkedin",
        "post_kind": "freelance",
    },
    {
        "id": "li-f-003",
        "title": "דרוש/ה מנהל/ת פרויקטים — היברידי ת״א",
        "company": "פוסט LinkedIn",
        "location": "תל אביב",
        "description": "ניהול פרויקטי הטמעת מערכת. הגישו בלינקדאין. project manager management.",
        "domain": "management",
        "channel": "linkedin",
        "post_kind": "social",
    },
    {
        "id": "li-f-004",
        "title": "AI Automation Freelancer (Make/Zapier/n8n)",
        "company": "LinkedIn · Agency IL",
        "location": "Remote - Israel",
        "description": "אוטומציות AI לעסקים בישראל. פרילנס. ai automation freelance.",
        "domain": "ai",
        "channel": "linkedin",
        "post_kind": "freelance",
    },
    {
        "id": "li-f-005",
        "title": "We're hiring a Product Analyst — Tel Aviv",
        "company": "LinkedIn Jobs · SaaS IL",
        "location": "Tel Aviv",
        "description": "Product analyst, SQL, Mixpanel. LinkedIn Easy Apply. product analytics.",
        "domain": "product",
        "channel": "linkedin",
        "post_kind": "social",
    },
    {
        "id": "li-f-006",
        "title": "מגייסים AI Solutions Consultant — רמת גן",
        "company": "LinkedIn · Consulting IL",
        "location": "Ramat Gan",
        "description": "ייעוץ והטמעת AI. פנו בלינקדאין. ai consulting sales.",
        "domain": "ai",
        "channel": "linkedin",
        "post_kind": "social",
    },
    {
        "id": "li-f-007",
        "title": "Looking for Operations Manager (Israel hybrid)",
        "company": "LinkedIn post · Logistics",
        "location": "Modiin / Hybrid Israel",
        "description": "Ops manager for Israeli logistics. Comment or DM. operations management.",
        "domain": "management",
        "channel": "linkedin",
        "post_kind": "social",
    },
    {
        "id": "li-f-008",
        "title": "Fintech Product Owner — open role",
        "company": "LinkedIn · PayIL hiring",
        "location": "Tel Aviv",
        "description": "PO for payments product. Message on LinkedIn. product finance fintech.",
        "domain": "finance",
        "channel": "linkedin",
        "post_kind": "social",
    },
    {
        "id": "li-f-009",
        "title": "דרוש/ה Growth Lead — סטארטאפ ת״א",
        "company": "פוסט LinkedIn",
        "location": "Tel Aviv",
        "description": "Growth, ניסויים. שלחו הודעה בלינקדאין. growth marketing product.",
        "domain": "marketing",
        "channel": "linkedin",
        "post_kind": "social",
    },
    {
        "id": "li-f-010",
        "title": "Freelance Full Stack for 4-week sprint",
        "company": "LinkedIn · Founder IL",
        "location": "Remote - Israel",
        "description": "React+Node freelancer for MVP. DM on LinkedIn. fullstack react node.",
        "domain": "tech",
        "channel": "linkedin",
        "post_kind": "freelance",
    },
    {
        "id": "tg-001",
        "title": "פרילנס React — דף נחיתה",
        "company": "Telegram · Jobs IL",
        "location": "Remote - Israel",
        "description": "פרילנסר/ית React+Tailwind. react freelance.",
        "domain": "tech",
        "channel": "telegram",
        "post_kind": "freelance",
    },
    {
        "id": "fb-001",
        "title": "דרוש/ה Full Stack לפרויקט קצר",
        "company": "פייסבוק · פרילנסרים ישראל",
        "location": "תל אביב / היברידי",
        "description": "Node, React, Postgres. fullstack freelance.",
        "domain": "tech",
        "channel": "facebook",
        "post_kind": "social",
    },
    {
        "id": "tg-002",
        "title": "משרת Product Manager — שיתוף מקבוצה",
        "company": "Telegram · Product IL",
        "location": "Tel Aviv",
        "description": "שיתוף משרת PM. product manager.",
        "domain": "product",
        "channel": "telegram",
        "post_kind": "social",
    },
]


def _social_url(channel: str, job_id: str, title: str = "") -> str | None:
    # Never invent fake t.me / Facebook / IL-board / LinkedIn-search URLs.
    _ = (channel, job_id, title)
    return None


def catalog_board_job_dicts() -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    rows: list[dict[str, Any]] = []
    for i, (job_id, title, company, location, description, _domain) in enumerate(JOB_SPECS):
        source = BOARDS[i % len(BOARDS)]
        # No synthetic employer inboxes or fake board deep-links
        rows.append(
            {
                "source": source,
                "external_id": job_id,
                "title": title,
                "company": company,
                "location": location,
                "url": None,
                "description": description,
                "posted_at": now,
                "apply_email": None,
                "post_kind": "job",
                "channel": source,
                "is_social": False,
            }
        )
    return rows


def catalog_social_post_dicts() -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    rows: list[dict[str, Any]] = []
    for spec in SOCIAL_SPECS:
        channel = spec["channel"]
        job_id = spec["id"]
        title = spec["title"]
        rows.append(
            {
                "source": f"social-{channel}",
                "external_id": job_id,
                "title": title,
                "company": spec["company"],
                "location": spec["location"],
                "url": _social_url(channel, job_id, title),
                "description": spec["description"],
                "posted_at": now,
                "apply_email": None,
                "post_kind": spec["post_kind"],
                "channel": channel,
                "is_social": True,
            }
        )
    return rows
