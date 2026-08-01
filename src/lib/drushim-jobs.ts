/**
 * Live Drushim.co.il jobs via their public search API.
 * URLs look like https://www.drushim.co.il/job/{code}/{hash}/
 */

import { extractEmails } from "@/lib/apply-email";
import { isRealDrushimJobUrl } from "@/lib/il-boards";

export type DrushimJobRow = {
  source: "drushim";
  external_id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  description: string;
  apply_email: string | null;
  post_kind: "job" | "freelance";
  channel: "drushim";
  is_social: boolean;
  scraped_at: string;
  posted_at: string | null;
};

const UA =
  "Mozilla/5.0 (compatible; ai-agent-job-scanner/1.0; +https://github.com/asaf2310-boop/ai-agent)";

const SEARCHES = [
  "AI",
  "בינה מלאכותית",
  "machine learning",
  "מנהל מוצר AI",
  "python",
  "מפתח תוכנה",
  "full stack",
  "devops",
  "data scientist",
  "אנליסט",
  "פיננסים",
  "חשב",
  "מנהל פרויקטים",
  "הצלחת לקוחות",
  "שיווק דיגיטלי",
  "דרוש ניסיון",
];

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function locationFromJob(job: Record<string, unknown>): string {
  const content = (job.JobContent || {}) as Record<string, unknown>;
  const addresses = (content.Addresses || []) as Array<{ City?: string }>;
  const cities = addresses.map((a) => a.City).filter(Boolean) as string[];
  if (cities.length) return [...new Set(cities)].slice(0, 3).join(" / ");
  const regions = (content.Regions || []) as Array<{ NameInHebrew?: string }>;
  const regionNames = regions
    .map((r) => r.NameInHebrew)
    .filter(Boolean) as string[];
  if (regionNames.length) return regionNames.slice(0, 3).join(" / ");
  return "ישראל";
}

function mapDrushimItem(job: Record<string, unknown>): DrushimJobRow | null {
  const info = (job.JobInfo || {}) as Record<string, unknown>;
  const content = (job.JobContent || {}) as Record<string, unknown>;
  const company = (job.Company || {}) as Record<string, unknown>;
  const code = String(info.JobCode || content.JobCode || job.Code || "");
  const hash = String(info.Hash || "").toLowerCase();
  const linkPath = String(info.Link || "");
  if (!code) return null;

  const url = linkPath.startsWith("/job/")
    ? `https://www.drushim.co.il${linkPath}`
    : hash
      ? `https://www.drushim.co.il/job/${code}/${hash}/`
      : "";
  if (!isRealDrushimJobUrl(url)) return null;

  const title = stripHtml(String(content.Name || content.FullName || "משרה"));
  const description = stripHtml(
    [content.Description, content.Requirements].filter(Boolean).join("\n\n"),
  ).slice(0, 4000);
  const companyName = String(
    company.CompanyDisplayName || company.NameInHebrew || "",
  ).replace(/^-\s*חסוי\s*-$/, "חסוי");
  const scopes = (content.Scopes || []) as Array<{ NameInHebrew?: string }>;
  const scopeText = scopes.map((s) => s.NameInHebrew || "").join(" ");
  const freelance = /פרילנס|שעתי|חלקית|freelance|contract/i.test(
    `${title} ${description} ${scopeText}`,
  );
  const postedRaw =
    (typeof info.DisplayDate === "string" && info.DisplayDate) ||
    (typeof info.JumpDate === "string" && info.JumpDate) ||
    (typeof info.Date === "string" && info.Date) ||
    null;
  let postedAt = new Date().toISOString();
  if (postedRaw) {
    const t = new Date(postedRaw).getTime();
    if (Number.isFinite(t)) postedAt = new Date(t).toISOString();
  }

  return {
    source: "drushim",
    external_id: code,
    title,
    company: companyName || null,
    location: locationFromJob(job),
    url,
    description: description || title,
    apply_email: extractEmails(description)[0] || null,
    post_kind: freelance ? "freelance" : "job",
    channel: "drushim",
    is_social: false,
    scraped_at: new Date().toISOString(),
    posted_at: postedAt,
  };
}

async function searchDrushimPage(
  searchTerm: string,
  page: number,
): Promise<DrushimJobRow[]> {
  const params = new URLSearchParams({
    searchTerm,
    page: String(page),
  });
  const res = await fetch(
    `https://www.drushim.co.il/api/jobs/search?${params}`,
    {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { ResultList?: Array<Record<string, unknown>> };
  const out: DrushimJobRow[] = [];
  for (const item of data.ResultList || []) {
    const row = mapDrushimItem(item);
    if (row) out.push(row);
  }
  return out;
}

/** Fetch diverse Israel jobs from Drushim (real deep-links). */
export async function fetchDrushimIsraelJobs(opts?: {
  maxJobs?: number;
}): Promise<DrushimJobRow[]> {
  const maxJobs = opts?.maxJobs ?? 60;
  const byId = new Map<string, DrushimJobRow>();

  for (const term of SEARCHES) {
    if (byId.size >= maxJobs) break;
    try {
      const page1 = await searchDrushimPage(term, 1);
      for (const row of page1) {
        byId.set(row.external_id, row);
        if (byId.size >= maxJobs) break;
      }
    } catch {
      // network optional
    }
  }

  return [...byId.values()].slice(0, maxJobs);
}
