/**
 * Live jobs from Israel tech / finance / startup company career boards
 * (Greenhouse, Lever, Ashby public APIs — real apply URLs).
 */

import { extractEmails } from "@/lib/apply-email";
import { isIsraelLocation } from "@/lib/israel";

export type CompanyCareerJobRow = {
  source: "greenhouse" | "lever" | "ashby";
  external_id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  description: string;
  apply_email: string | null;
  post_kind: "job";
  channel: string;
  is_social: false;
  scraped_at: string;
  posted_at: string | null;
};

type BoardSpec = {
  ats: "greenhouse" | "lever" | "ashby";
  /** Board token / company slug on the ATS */
  token: string;
  company: string;
  /** Sector tag for channel / filtering */
  sector: "tech" | "finance" | "startup" | "cyber" | "product";
};

/**
 * Curated Israel-hiring company boards (finance, tech, cyber, startups).
 * Tokens verified against public ATS list APIs.
 */
export const ISRAEL_COMPANY_BOARDS: BoardSpec[] = [
  // Tech / product / growth
  { ats: "greenhouse", token: "gongio", company: "Gong", sector: "tech" },
  { ats: "greenhouse", token: "similarweb", company: "Similarweb", sector: "tech" },
  { ats: "greenhouse", token: "taboola", company: "Taboola", sector: "tech" },
  { ats: "greenhouse", token: "appsflyer", company: "AppsFlyer", sector: "tech" },
  { ats: "greenhouse", token: "wizinc", company: "Wiz", sector: "cyber" },
  { ats: "greenhouse", token: "jfrog", company: "JFrog", sector: "tech" },
  { ats: "greenhouse", token: "yotpo", company: "Yotpo", sector: "tech" },
  { ats: "greenhouse", token: "lightricks", company: "Lightricks", sector: "startup" },
  { ats: "greenhouse", token: "descope", company: "Descope", sector: "startup" },
  { ats: "greenhouse", token: "axonius", company: "Axonius", sector: "cyber" },
  { ats: "greenhouse", token: "nice", company: "NICE", sector: "tech" },
  { ats: "greenhouse", token: "via", company: "Via", sector: "tech" },
  { ats: "greenhouse", token: "pendo", company: "Pendo", sector: "tech" },
  // Fintech / finance
  { ats: "greenhouse", token: "melio", company: "Melio", sector: "finance" },
  { ats: "greenhouse", token: "fireblocks", company: "Fireblocks", sector: "finance" },
  { ats: "greenhouse", token: "pagaya", company: "Pagaya", sector: "finance" },
  { ats: "greenhouse", token: "riskified", company: "Riskified", sector: "finance" },
  { ats: "ashby", token: "lemonade", company: "Lemonade", sector: "finance" },
  // Cyber / security
  { ats: "greenhouse", token: "catonetworks", company: "Cato Networks", sector: "cyber" },
  { ats: "greenhouse", token: "orcasecurity", company: "Orca Security", sector: "cyber" },
  { ats: "greenhouse", token: "saltsecurity", company: "Salt Security", sector: "cyber" },
  { ats: "greenhouse", token: "bigid", company: "BigID", sector: "cyber" },
  { ats: "ashby", token: "human", company: "HUMAN Security", sector: "cyber" },
  // Lever
  { ats: "lever", token: "walkme", company: "WalkMe", sector: "tech" },
  { ats: "lever", token: "cloudinary", company: "Cloudinary", sector: "tech" },
];

const UA =
  "Mozilla/5.0 (compatible; ai-agent-job-scanner/1.0; +https://github.com/asaf2310-boop/ai-agent)";

const MAX_PER_BOARD = 18;
const MAX_TOTAL = 220;
const CONTENT_ENRICH_PER_BOARD = 10;

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

/** Normalize ATS location quirks (e.g. Ashby "TLV") for Israel filter. */
export function normalizeCareerLocation(location: string | null | undefined): string {
  const raw = (location || "").trim();
  if (!raw) return "";
  if (/^tlv\.?$/i.test(raw) || /\btlv\b/i.test(raw)) {
    return `${raw} Tel Aviv Israel`;
  }
  if (/^il$/i.test(raw) || /\bIL\b/.test(raw)) {
    return `${raw} Israel`;
  }
  return raw;
}

function isIsraelCareerJob(
  location: string | null | undefined,
  description?: string | null,
  company?: string | null,
): boolean {
  const loc = normalizeCareerLocation(location);
  // Prefer the office location — avoid "Israel market" roles based in Dublin/NY.
  if (loc && isIsraelLocation(loc, null, null)) return true;
  if (!loc || /remote|hybrid|anywhere|worldwide/i.test(loc)) {
    return isIsraelLocation(loc, description, company);
  }
  return false;
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 0 },
      signal: AbortSignal.timeout(14_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function enrichGreenhouseJob(
  token: string,
  jobId: number | string,
): Promise<string> {
  const data = (await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${token}/jobs/${jobId}`,
  )) as { content?: string } | null;
  if (!data?.content) return "";
  return stripHtml(String(data.content)).slice(0, 4000);
}

async function fetchGreenhouseBoard(
  board: BoardSpec,
): Promise<CompanyCareerJobRow[]> {
  const data = (await fetchJson(
    `https://boards-api.greenhouse.io/v1/boards/${board.token}/jobs`,
  )) as { jobs?: Array<Record<string, unknown>> } | null;
  const jobs = data?.jobs || [];
  const now = new Date().toISOString();
  const matched: Array<{
    id: number | string;
    title: string;
    location: string;
    url: string;
    posted: string | null;
  }> = [];

  for (const job of jobs) {
    const id = job.id as number | string | undefined;
    const title = String(job.title || "").trim();
    const locObj = job.location as { name?: string } | string | null;
    const location =
      typeof locObj === "string"
        ? locObj
        : String(locObj?.name || "").trim();
    const url = String(job.absolute_url || "").trim();
    if (!id || !title || !url) continue;
    if (!isIsraelCareerJob(location, title, board.company)) continue;
    const updated = job.updated_at || job.created_at;
    matched.push({
      id,
      title,
      location: location || "Israel",
      url,
      posted: typeof updated === "string" ? updated : null,
    });
  }

  const picked = matched.slice(0, MAX_PER_BOARD);
  const rows: CompanyCareerJobRow[] = [];
  for (let i = 0; i < picked.length; i++) {
    const job = picked[i];
    let description = `${job.title} @ ${board.company} · ${job.location}`;
    if (i < CONTENT_ENRICH_PER_BOARD) {
      const content = await enrichGreenhouseJob(board.token, job.id);
      if (content) description = content;
    }
    rows.push({
      source: "greenhouse",
      external_id: `${board.token}:${job.id}`,
      title: job.title,
      company: board.company,
      location: job.location,
      url: job.url,
      description: description.slice(0, 4000),
      apply_email: extractEmails(description)[0] || null,
      post_kind: "job",
      channel: `careers-${board.sector}`,
      is_social: false,
      scraped_at: now,
      posted_at: job.posted || now,
    });
  }
  return rows;
}

async function fetchLeverBoard(board: BoardSpec): Promise<CompanyCareerJobRow[]> {
  const data = (await fetchJson(
    `https://api.lever.co/v0/postings/${board.token}?mode=json`,
  )) as Array<Record<string, unknown>> | null;
  if (!Array.isArray(data)) return [];
  const now = new Date().toISOString();
  const rows: CompanyCareerJobRow[] = [];

  for (const job of data) {
    if (rows.length >= MAX_PER_BOARD) break;
    const id = String(job.id || "");
    const title = String(job.text || "").trim();
    const cats = (job.categories || {}) as Record<string, string>;
    const location = String(cats.location || job.country || "").trim();
    const url = String(job.hostedUrl || job.applyUrl || "").trim();
    const description = stripHtml(
      String(job.descriptionPlain || job.description || ""),
    ).slice(0, 4000);
    if (!id || !title || !url) continue;
    if (!isIsraelCareerJob(location, `${title} ${description}`, board.company)) {
      continue;
    }
    const created = job.createdAt;
    rows.push({
      source: "lever",
      external_id: `${board.token}:${id}`,
      title,
      company: board.company,
      location: location || "Israel",
      url,
      description:
        description || `${title} @ ${board.company} · ${location || "Israel"}`,
      apply_email: extractEmails(description)[0] || null,
      post_kind: "job",
      channel: `careers-${board.sector}`,
      is_social: false,
      scraped_at: now,
      posted_at:
        typeof created === "number"
          ? new Date(created).toISOString()
          : now,
    });
  }
  return rows;
}

async function fetchAshbyBoard(board: BoardSpec): Promise<CompanyCareerJobRow[]> {
  const data = (await fetchJson(
    `https://api.ashbyhq.com/posting-api/job-board/${board.token}`,
  )) as { jobs?: Array<Record<string, unknown>> } | null;
  const jobs = data?.jobs || [];
  const now = new Date().toISOString();
  const rows: CompanyCareerJobRow[] = [];

  for (const job of jobs) {
    if (rows.length >= MAX_PER_BOARD) break;
    const id = String(job.id || job.jobId || "");
    const title = String(job.title || "").trim();
    const location = String(
      job.location ||
        (Array.isArray(job.secondaryLocations)
          ? job.secondaryLocations.join(", ")
          : "") ||
        "",
    ).trim();
    const url = String(job.jobUrl || job.applyUrl || "").trim();
    const description = stripHtml(
      String(job.descriptionHtml || job.descriptionPlain || job.description || ""),
    ).slice(0, 4000);
    if (!id || !title || !url) continue;
    if (!isIsraelCareerJob(location, `${title} ${description}`, board.company)) {
      continue;
    }
    const published = job.publishedAt || job.updatedAt;
    rows.push({
      source: "ashby",
      external_id: `${board.token}:${id}`,
      title,
      company: board.company,
      location: normalizeCareerLocation(location) || "Israel",
      url,
      description:
        description || `${title} @ ${board.company} · ${location || "Israel"}`,
      apply_email: extractEmails(description)[0] || null,
      post_kind: "job",
      channel: `careers-${board.sector}`,
      is_social: false,
      scraped_at: now,
      posted_at: typeof published === "string" ? published : now,
    });
  }
  return rows;
}

async function fetchBoard(board: BoardSpec): Promise<CompanyCareerJobRow[]> {
  if (board.ats === "greenhouse") return fetchGreenhouseBoard(board);
  if (board.ats === "lever") return fetchLeverBoard(board);
  return fetchAshbyBoard(board);
}

/**
 * Fetch Israel-relevant openings from company career ATS boards.
 * Runs boards with limited concurrency to stay within serverless time budgets.
 */
export async function fetchCompanyCareerJobs(opts?: {
  maxJobs?: number;
  boards?: BoardSpec[];
}): Promise<CompanyCareerJobRow[]> {
  const maxJobs = opts?.maxJobs ?? MAX_TOTAL;
  const boards = opts?.boards ?? ISRAEL_COMPANY_BOARDS;
  const out: CompanyCareerJobRow[] = [];
  const seen = new Set<string>();
  const concurrency = 4;

  for (let i = 0; i < boards.length && out.length < maxJobs; i += concurrency) {
    const chunk = boards.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map((b) => fetchBoard(b)));
    for (const rows of results) {
      for (const row of rows) {
        const key = `${row.source}:${row.external_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(row);
        if (out.length >= maxJobs) break;
      }
      if (out.length >= maxJobs) break;
    }
  }

  return out;
}
