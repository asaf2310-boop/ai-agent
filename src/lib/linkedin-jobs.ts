/**
 * LinkedIn active job board (guest API) — Israel, posted in the last 7 days.
 * Used by the in-app pipeline and aligned with the twice-daily Actions scan.
 */

import { isIsraelLocation } from "@/lib/israel";
import { extractEmails } from "@/lib/apply-email";
import { extractExternalApplyUrl } from "@/lib/web-apply";

export type LinkedInJobRow = {
  source: string;
  external_id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  description: string;
  apply_email: string | null;
  post_kind: "job";
  channel: "linkedin";
  is_social: boolean;
  scraped_at: string;
  posted_at: string | null;
};

const UA =
  "Mozilla/5.0 (compatible; ai-agent-job-scanner/1.0; +https://github.com/asaf2310-boop/ai-agent)";

/** Past week filter on LinkedIn guest search */
const PAST_WEEK = "r604800";
/** Israel geoId used by LinkedIn public search */
const ISRAEL_GEO = "101620260";

const SEARCHES = [
  "AI OR LLM OR \"machine learning\" OR \"data scientist\"",
  "\"product manager\" OR \"product owner\" OR \"product analyst\"",
  "finance OR fintech OR FP&A OR controller OR \"financial analyst\"",
  "\"project manager\" OR \"operations manager\" OR \"team lead\" OR management",
  "\"full stack\" OR \"software engineer\" OR devops OR \"backend\" OR react",
];

const RELEVANT =
  /ai|llm|machine learning|data|product|finance|fintech|fp&a|controller|management|manager|operations|engineer|developer|devops|analyst|marketing|sales|customer success|מוצר|פיננס|ניהול|מנהל|בינה/i;

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return decodeHtml(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function parseListHtml(html: string): Array<{
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  postedAt: string | null;
}> {
  const jobs: Array<{
    id: string;
    title: string;
    company: string;
    location: string;
    url: string;
    postedAt: string | null;
  }> = [];

  const cards = html.split(/data-entity-urn="urn:li:jobPosting:/).slice(1);
  for (const card of cards) {
    const id = card.match(/^(\d+)/)?.[1];
    if (!id) continue;
    const title = stripTags(
      card.match(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "",
    );
    const company = stripTags(
      card.match(/base-search-card__subtitle[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ||
        "",
    );
    const location = stripTags(
      card.match(/job-search-card__location[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "",
    );
    const href =
      card.match(
        /base-card__full-link[^>]*href="([^"]+)"/i,
      )?.[1] || `https://www.linkedin.com/jobs/view/${id}`;
    const url = decodeHtml(href).split("?")[0];
    const postedAt =
      card.match(/<time[^>]*datetime="([^"]+)"/i)?.[1] || null;

    if (!title) continue;
    jobs.push({ id, title, company, location, url, postedAt });
  }
  return jobs;
}

async function fetchSearchPage(
  keywords: string,
  start: number,
): Promise<string> {
  const params = new URLSearchParams({
    keywords,
    location: "Israel",
    geoId: ISRAEL_GEO,
    f_TPR: PAST_WEEK,
    start: String(start),
    count: "25",
  });
  const res = await fetch(
    `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`,
    {
      headers: {
        "User-Agent": UA,
        Accept: "text/html",
      },
      next: { revalidate: 0 },
    },
  );
  if (!res.ok) return "";
  return res.text();
}

async function fetchJobDescription(jobId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`,
      {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(8000),
        next: { revalidate: 0 },
      },
    );
    if (!res.ok) return "";
    const html = await res.text();
    // Prefer description section if present
    const descBlock =
      html.match(
        /show-more-less-html__markup[\s\S]*?>([\s\S]*?)<\/div>/i,
      )?.[1] || html;
    return stripTags(descBlock).slice(0, 4000);
  } catch {
    return "";
  }
}

function withinLastWeek(postedAt: string | null): boolean {
  if (!postedAt) return true; // LinkedIn already filtered f_TPR=r604800
  const t = Date.parse(postedAt);
  if (Number.isNaN(t)) return true;
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - t <= weekMs + 12 * 60 * 60 * 1000; // small skew buffer
}

/** Fetch Israel LinkedIn jobs from the past week across relevant domains. */
export async function fetchLinkedInIsraelJobs(options?: {
  maxJobs?: number;
  enrichDescriptions?: number;
}): Promise<LinkedInJobRow[]> {
  const maxJobs = options?.maxJobs ?? 80;
  const enrichN = options?.enrichDescriptions ?? 25;
  const now = new Date().toISOString();
  const byId = new Map<string, LinkedInJobRow>();

  for (const keywords of SEARCHES) {
    for (const start of [0, 25]) {
      try {
        const html = await fetchSearchPage(keywords, start);
        if (!html) continue;
        for (const item of parseListHtml(html)) {
          if (!withinLastWeek(item.postedAt)) continue;
          if (
            !isIsraelLocation(item.location, item.title, item.company) &&
            !/israel|ישראל/i.test(`${item.location} ${item.title}`)
          ) {
            continue;
          }
          const hay = `${item.title} ${item.company} ${item.location}`;
          if (!RELEVANT.test(hay)) continue;

          byId.set(item.id, {
            source: "linkedin",
            external_id: item.id,
            title: item.title,
            company: item.company || null,
            location: item.location || "Israel",
            url: item.url,
            description: `LinkedIn · ${item.title} @ ${item.company || "—"} · ${item.location || "Israel"}`,
            apply_email: null,
            post_kind: "job",
            channel: "linkedin",
            is_social: false,
            scraped_at: now,
            posted_at: item.postedAt
              ? new Date(item.postedAt).toISOString()
              : now,
          });
          if (byId.size >= maxJobs) break;
        }
      } catch {
        // network optional
      }
      if (byId.size >= maxJobs) break;
    }
    if (byId.size >= maxJobs) break;
  }

  const list = [...byId.values()];
  // Enrich a subset with full description for better matching + email extraction
  for (const job of list.slice(0, enrichN)) {
    const desc = await fetchJobDescription(job.external_id);
    if (desc.length > 80) {
      job.description = desc;
      job.apply_email = extractEmails(desc)[0] || null;
      const applyPage = extractExternalApplyUrl(desc);
      if (applyPage) {
        // Prefer company ATS page for automatic form submit
        job.url = applyPage;
        job.description = `Apply: ${applyPage}\n\n${desc}`;
      }
    }
  }

  return list;
}

/** Delete LinkedIn rows older than maxAgeDays (default 7). */
export async function pruneOldLinkedInJobs(
  supabase: { from: (t: string) => any },
  maxAgeDays = 7,
): Promise<number> {
  const cutoff = new Date(
    Date.now() - maxAgeDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  try {
    const { data } = await supabase
      .from("jobs")
      .select("id, posted_at, scraped_at")
      .eq("source", "linkedin")
      .limit(500);
    const stale = ((data || []) as Array<{
      id: string;
      posted_at?: string | null;
      scraped_at?: string | null;
    }>).filter((j) => {
      const ts = j.posted_at || j.scraped_at;
      return ts && ts < cutoff;
    });
    const ids = stale.map((j) => j.id);
    if (!ids.length) return 0;
    await supabase.from("jobs").delete().in("id", ids);
    return ids.length;
  } catch {
    return 0;
  }
}
