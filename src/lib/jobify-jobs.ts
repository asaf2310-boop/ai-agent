/**
 * Live Jobify (jobify360.co.il) jobs via sitemap + JobPosting JSON-LD.
 * Deep links: https://jobify360.co.il/jobs/{id}-in | {id}-aj | …
 */

import { extractEmails } from "@/lib/apply-email";
import {
  buildIlBoardSearchQueries,
  matchesSearchQueries,
} from "@/lib/cv-search-queries";
import { isRealJobifyJobUrl } from "@/lib/il-boards";
import type { ResumeSignals } from "@/lib/resume-extract";

export type JobifyJobRow = {
  source: "jobify";
  external_id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  description: string;
  apply_email: string | null;
  post_kind: "job" | "freelance";
  channel: "jobify";
  is_social: boolean;
  scraped_at: string;
  posted_at: string | null;
};

const UA =
  "Mozilla/5.0 (compatible; ai-agent-job-scanner/1.0; +https://github.com/asaf2310-boop/ai-agent)";

const SITEMAP_INDEX = "https://jobify360.co.il/sitemap.xml";

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

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/xml,text/xml,text/html,application/json",
      "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) return "";
  return res.text();
}

function parseSitemapLocs(xml: string): Array<{ loc: string; lastmod: number }> {
  const out: Array<{ loc: string; lastmod: number }> = [];
  const blocks = xml.match(/<url>[\s\S]*?<\/url>/gi) || [];
  for (const block of blocks) {
    const loc = block.match(/<loc>\s*([^<]+)\s*<\/loc>/i)?.[1]?.trim();
    if (!loc) continue;
    const lastmodRaw = block.match(/<lastmod>\s*([^<]+)\s*<\/lastmod>/i)?.[1];
    const lastmod = lastmodRaw ? new Date(lastmodRaw).getTime() : 0;
    out.push({
      loc,
      lastmod: Number.isFinite(lastmod) ? lastmod : 0,
    });
  }
  return out;
}

function extractJobPosting(html: string): {
  title: string;
  description: string;
  company: string | null;
  location: string | null;
  postedAt: string | null;
  employmentType: string;
} | null {
  const scripts = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  for (const m of scripts) {
    try {
      const data = JSON.parse(m[1]) as Record<string, unknown> | Array<Record<string, unknown>>;
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if ((node["@type"] || "") !== "JobPosting") continue;
        const org = (node.hiringOrganization || {}) as Record<string, unknown>;
        const jobLoc = (node.jobLocation || {}) as Record<string, unknown>;
        const address = (jobLoc.address || jobLoc) as Record<string, unknown>;
        const location =
          String(
            address.addressLocality ||
              address.addressRegion ||
              node.jobLocationType ||
              "",
          ).trim() || null;
        return {
          title: stripHtml(String(node.title || "")),
          description: stripHtml(String(node.description || "")).slice(0, 4000),
          company: String(org.name || "").trim() || null,
          location: location || "ישראל",
          postedAt: node.datePosted
            ? String(node.datePosted)
            : node.validThrough
              ? null
              : null,
          employmentType: String(node.employmentType || ""),
        };
      }
    } catch {
      // try next block
    }
  }

  // Fallback: og:title + company-name
  const ogTitle =
    html.match(
      /property=["']og:title["'][^>]*content=["']([^"']+)["']/i,
    )?.[1] || html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1];
  if (!ogTitle) return null;
  const company =
    html.match(/class=["'][^"']*company-name[^"']*["'][^>]*>([^<]+)/i)?.[1] ||
    null;
  return {
    title: stripHtml(ogTitle),
    description: stripHtml(
      html.match(
        /property=["']og:description["'][^>]*content=["']([^"']+)["']/i,
      )?.[1] || "",
    ).slice(0, 4000),
    company: company ? stripHtml(company) : null,
    location: "ישראל",
    postedAt: null,
    employmentType: "",
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R | null>,
): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      const row = await fn(items[idx]);
      if (row) results.push(row);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

/** Fetch recent Jobify360 jobs that match CV-oriented queries. */
export async function fetchJobifyIsraelJobs(opts?: {
  maxJobs?: number;
  queries?: string[];
  signals?: ResumeSignals | null;
  candidateUrls?: number;
}): Promise<JobifyJobRow[]> {
  const maxJobs = opts?.maxJobs ?? 50;
  const candidateUrls = opts?.candidateUrls ?? 180;
  const queries =
    opts?.queries || buildIlBoardSearchQueries(opts?.signals, 10);

  let jobEntries: Array<{ loc: string; lastmod: number }> = [];
  try {
    const indexXml = await fetchText(SITEMAP_INDEX);
    const sitemapUrls = [
      ...new Set(
        (indexXml.match(/<loc>\s*([^<]*sitemap-jobs-\d+\.xml)\s*<\/loc>/gi) || [])
          .map((m) => m.replace(/<\/?loc>/gi, "").trim())
          .filter(Boolean),
      ),
    ];
    // Prefer higher-numbered sitemaps (newest aggregations) + a mid-range sample
    const ordered = [...sitemapUrls].sort((a, b) => {
      const na = Number(a.match(/sitemap-jobs-(\d+)/)?.[1] || 0);
      const nb = Number(b.match(/sitemap-jobs-(\d+)/)?.[1] || 0);
      return nb - na;
    });
    // Newest aggregations (-aj etc.) + mid-range LinkedIn-style (-in) sitemaps
    const pick = [
      ...ordered.slice(0, 3),
      ...ordered.filter((u) => {
        const n = Number(u.match(/sitemap-jobs-(\d+)/)?.[1] || -1);
        return n >= 20 && n <= 80;
      }).slice(0, 4),
    ];
    for (const sm of [...new Set(pick)]) {
      const xml = await fetchText(sm);
      jobEntries.push(...parseSitemapLocs(xml));
      if (jobEntries.length >= candidateUrls * 5) break;
    }
  } catch {
    return [];
  }

  const all = jobEntries
    .filter((e) => /\/jobs\/\d+-[a-z]{2,6}\/?$/i.test(e.loc))
    .sort((a, b) => b.lastmod - a.lastmod);

  const cutoff = Date.now() - 60 * 86400_000;
  const recent = all.filter((e) => !e.lastmod || e.lastmod >= cutoff);
  // Mix AllJobs-sourced (-aj) and LinkedIn-style (-in) so tech/product roles appear
  const aj = recent.filter((e) => /-aj\/?$/i.test(e.loc));
  const inn = recent.filter((e) => /-in\/?$/i.test(e.loc));
  const other = recent.filter(
    (e) => !/-aj\/?$/i.test(e.loc) && !/-in\/?$/i.test(e.loc),
  );
  const pool = [
    ...inn.slice(0, Math.ceil(candidateUrls * 0.45)),
    ...aj.slice(0, Math.ceil(candidateUrls * 0.45)),
    ...other.slice(0, Math.ceil(candidateUrls * 0.15)),
  ].slice(0, candidateUrls);

  const rows = await mapPool(pool, 8, async (entry) => {
    if (!isRealJobifyJobUrl(entry.loc)) return null;
    try {
      const html = await fetchText(entry.loc);
      if (!html) return null;
      const posting = extractJobPosting(html);
      if (!posting?.title) return null;
      const hay = `${posting.title} ${posting.description} ${posting.company || ""}`;
      if (!matchesSearchQueries(hay, queries)) return null;

      const idMatch = entry.loc.match(/\/jobs\/(\d+)-([a-z]{2,6})/i);
      if (!idMatch) return null;
      const id = `${idMatch[1]}-${idMatch[2].toLowerCase()}`;

      const freelance = /PART_TIME|CONTRACTOR|פרילנס|שעתי|freelance/i.test(
        `${posting.employmentType} ${posting.title} ${posting.description}`,
      );
      let postedAt: string | null = null;
      if (posting.postedAt) {
        const t = new Date(posting.postedAt).getTime();
        if (Number.isFinite(t)) postedAt = new Date(t).toISOString();
      }
      if (!postedAt && entry.lastmod) {
        postedAt = new Date(entry.lastmod).toISOString();
      }

      return {
        source: "jobify" as const,
        external_id: id,
        title: posting.title,
        company: posting.company,
        location: posting.location || "ישראל",
        url: entry.loc.replace(/\/$/, ""),
        description: posting.description || posting.title,
        apply_email: extractEmails(posting.description)[0] || null,
        post_kind: freelance ? ("freelance" as const) : ("job" as const),
        channel: "jobify" as const,
        is_social: false,
        scraped_at: new Date().toISOString(),
        posted_at: postedAt || new Date().toISOString(),
      };
    } catch {
      return null;
    }
  });

  const byId = new Map<string, JobifyJobRow>();
  for (const row of rows) byId.set(row.external_id, row);
  return [...byId.values()].slice(0, maxJobs);
}
