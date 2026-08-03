/**
 * Live JobMaster.co.il listings (best-effort).
 * Deep links: https://www.jobmaster.co.il/jobs/checknum.asp?key={id}
 *
 * The site is often slow / intermittently unavailable from cloud hosts;
 * failures return an empty list so the rest of the pipeline continues.
 */

import { extractEmails } from "@/lib/apply-email";
import {
  buildIlBoardSearchQueries,
  matchesSearchQueries,
} from "@/lib/cv-search-queries";
import { isRealJobMasterJobUrl } from "@/lib/il-boards";
import type { ResumeSignals } from "@/lib/resume-extract";

export type JobMasterJobRow = {
  source: "jobmaster";
  external_id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  description: string;
  apply_email: string | null;
  post_kind: "job" | "freelance";
  channel: "jobmaster";
  is_social: boolean;
  scraped_at: string;
  posted_at: string | null;
};

const UA =
  "Mozilla/5.0 (compatible; ai-agent-job-scanner/1.0; +https://github.com/asaf2310-boop/ai-agent)";

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

function jobUrl(id: string): string {
  return `https://www.jobmaster.co.il/jobs/checknum.asp?key=${id}`;
}

async function fetchText(url: string, timeoutMs = 18_000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
      },
      signal: ctrl.signal,
      next: { revalidate: 0 },
    });
    if (!res.ok) return "";
    return res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function parseListHtml(html: string): Array<{
  id: string;
  title: string;
  company: string | null;
  location: string | null;
}> {
  const out: Array<{
    id: string;
    title: string;
    company: string | null;
    location: string | null;
  }> = [];
  const seen = new Set<string>();

  // Classic checknum deep-links
  const linkRe =
    /checknum\.asp\?key=(\d+)[^"'>]*>\s*([^<]{3,120})/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title: stripHtml(m[2]),
      company: null,
      location: "ישראל",
    });
  }

  // Alternate: data-key / job id attributes
  for (const mm of html.matchAll(
    /(?:key|jobid|jobId|data-job)=["']?(\d{5,})["']?/gi,
  )) {
    const id = mm[1];
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title: `משרה ${id}`,
      company: null,
      location: "ישראל",
    });
  }

  return out;
}

function parseDetailHtml(
  html: string,
  id: string,
): JobMasterJobRow | null {
  const title =
    stripHtml(
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
        html.match(/<title>\s*([^|<]+)/i)?.[1] ||
        "",
    ) || null;
  if (!title || /404|error|not found/i.test(title)) return null;

  const company =
    stripHtml(
      html.match(
        /checkhevra\.asp\?cs=[^"']+["'][^>]*>([^<]+)/i,
      )?.[1] ||
        html.match(/company[^>]*>([^<]{2,80})/i)?.[1] ||
        "",
    ) || null;

  const description = stripHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " "),
  ).slice(0, 4000);

  const locationMatch = description.match(
    /(?:מיקום|Location|אזור)[:\s]+([A-Za-z\u0590-\u05FF\s\-]{2,40})/i,
  );
  const freelance = /פרילנס|שעתי|freelance|part\s*time/i.test(
    `${title} ${description}`,
  );
  const url = jobUrl(id);
  if (!isRealJobMasterJobUrl(url)) return null;

  return {
    source: "jobmaster",
    external_id: id,
    title,
    company,
    location: locationMatch?.[1]?.trim() || "ישראל",
    url,
    description: description || title,
    apply_email: extractEmails(description)[0] || null,
    post_kind: freelance ? "freelance" : "job",
    channel: "jobmaster",
    is_social: false,
    scraped_at: new Date().toISOString(),
    posted_at: new Date().toISOString(),
  };
}

/** Best-effort JobMaster fetch; returns [] when the board is unreachable. */
export async function fetchJobMasterIsraelJobs(opts?: {
  maxJobs?: number;
  queries?: string[];
  signals?: ResumeSignals | null;
}): Promise<JobMasterJobRow[]> {
  const maxJobs = opts?.maxJobs ?? 40;
  const queries =
    opts?.queries || buildIlBoardSearchQueries(opts?.signals, 8);
  const byId = new Map<string, JobMasterJobRow>();

  const listUrls: string[] = [];
  for (const q of queries.slice(0, 6)) {
    const enc = encodeURIComponent(q);
    listUrls.push(
      `https://www.jobmaster.co.il/jobs/?q=${enc}`,
      `https://www.jobmaster.co.il/jobs/checknew.asp?q=${enc}`,
      `https://www.jobmaster.co.il/jobs/?e=${enc}`,
    );
  }
  // Category-ish fallbacks used historically by the board
  listUrls.push(
    "https://www.jobmaster.co.il/jobs/",
    "https://www.jobmaster.co.il/jobs/checknew.asp",
  );

  for (const listUrl of listUrls) {
    if (byId.size >= maxJobs) break;
    const html = await fetchText(listUrl);
    if (!html || html.length < 500) continue;
    const listed = parseListHtml(html).slice(0, 25);
    for (const item of listed) {
      if (byId.size >= maxJobs) break;
      if (byId.has(item.id)) continue;
      const detail = await fetchText(jobUrl(item.id), 15_000);
      const row = detail
        ? parseDetailHtml(detail, item.id)
        : null;
      if (row) {
        if (
          !matchesSearchQueries(
            `${row.title} ${row.description}`,
            queries,
          )
        ) {
          continue;
        }
        byId.set(item.id, row);
        continue;
      }
      // List-only fallback when detail page times out
      if (item.title && !/^משרה\s+\d+$/.test(item.title)) {
        if (!matchesSearchQueries(item.title, queries)) continue;
        const url = jobUrl(item.id);
        if (!isRealJobMasterJobUrl(url)) continue;
        byId.set(item.id, {
          source: "jobmaster",
          external_id: item.id,
          title: item.title,
          company: item.company,
          location: item.location || "ישראל",
          url,
          description: item.title,
          apply_email: null,
          post_kind: "job",
          channel: "jobmaster",
          is_social: false,
          scraped_at: new Date().toISOString(),
          posted_at: new Date().toISOString(),
        });
      }
    }
  }

  return [...byId.values()].slice(0, maxJobs);
}
