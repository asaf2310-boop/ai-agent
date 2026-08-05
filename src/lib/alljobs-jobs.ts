/**
 * Live AllJobs.co.il listings via guest search HTML.
 * Deep links: https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID={id}
 */

import { extractEmails } from "@/lib/apply-email";
import {
  buildIlBoardSearchQueries,
  matchesSearchQueries,
} from "@/lib/cv-search-queries";
import { isRealAllJobsJobUrl } from "@/lib/il-boards";
import type { ResumeSignals } from "@/lib/resume-extract";

export type AllJobsJobRow = {
  source: "alljobs";
  external_id: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  description: string;
  apply_email: string | null;
  post_kind: "job" | "freelance";
  channel: "alljobs";
  is_social: boolean;
  scraped_at: string;
  posted_at: string | null;
};

const UA =
  "Mozilla/5.0 (compatible; ai-agent-job-scanner/1.0; +https://github.com/asaf2310-boop/ai-agent)";

/** Category IDs that tend to include product / analysis / office roles. */
const POSITION_CATEGORIES = ["235", "1694", "1439", "1580"];

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function jobUrl(id: string): string {
  return `https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=${id}`;
}

function parseRelativePosted(text: string): string | null {
  const now = Date.now();
  const hours = text.match(/לפני\s+(\d+)\s+שע/);
  if (hours) {
    return new Date(now - Number(hours[1]) * 3600_000).toISOString();
  }
  const days = text.match(/לפני\s+(\d+)\s+ימ/);
  if (days) {
    return new Date(now - Number(days[1]) * 86400_000).toISOString();
  }
  if (/אתמול/.test(text)) {
    return new Date(now - 86400_000).toISOString();
  }
  if (/היום|לפני\s+\d+\s+דק/.test(text)) {
    return new Date(now).toISOString();
  }
  return null;
}

function parseAllJobsHtml(html: string): AllJobsJobRow[] {
  const out: AllJobsJobRow[] = [];
  const seen = new Set<string>();
  const re =
    /href="\/Search\/UploadSingle\.aspx\?JobID=(\d+)"[\s\S]{0,120}?<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const title = stripHtml(match[2]);
    if (!title || title.length < 2) continue;

    const chunk = html.slice(match.index, match.index + 4500);
    const companyMatch = chunk.match(
      /Employer\/HP\/Default\.aspx\?cid=\d+[^>]*>\s*([^<]+)/i,
    );
    let company = companyMatch?.[1]?.trim() || null;
    if (company && /חסוי|confidential/i.test(company)) company = "חסוי";

    const plain = stripHtml(
      chunk
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " "),
    );

    let location = "ישראל";
    const locEn = plain.match(/Location:\s*([A-Za-z\u0590-\u05FF\s,\-\/]{2,60})/i);
    const locHe = plain.match(
      /מיקום המשרה:\s*([A-Za-z\u0590-\u05FF\s,\-\/]{2,60})/,
    );
    const locRaw = (locEn?.[1] || locHe?.[1] || "").trim();
    if (locRaw && !/מקומות|Job Type|סוג משרה/i.test(locRaw)) {
      location = locRaw.split(/\s{2,}/)[0].slice(0, 80);
    }

    // Prefer bullet lines + requirements from the card body
    let description = "";
    const reqIdx = plain.search(/Requirements:|דרישות:/i);
    if (reqIdx >= 0) {
      description = plain.slice(Math.max(0, reqIdx - 500), reqIdx + 900);
    } else {
      description = plain.slice(0, 1200);
    }
    description = description
      .replace(/שתף משרה[\s\S]{0,200}/g, " ")
      .replace(/אירעה שגיאה[\s\S]{0,80}/g, " ")
      .slice(0, 4000)
      .trim();

    const freelance = /פרילנס|שעתי|חלקית|freelance|part\s*time/i.test(
      `${title} ${description}`,
    );
    const postedAt =
      parseRelativePosted(plain.slice(0, 200)) || new Date().toISOString();

    const url = jobUrl(id);
    if (!isRealAllJobsJobUrl(url)) continue;

    out.push({
      source: "alljobs",
      external_id: id,
      title,
      company,
      location,
      url,
      description: description || title,
      apply_email: extractEmails(description)[0] || null,
      post_kind: freelance ? "freelance" : "job",
      channel: "alljobs",
      is_social: false,
      scraped_at: new Date().toISOString(),
      posted_at: postedAt,
    });
  }
  return out;
}

async function fetchSearchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) return "";
  return res.text();
}

/** Fetch Israel jobs from AllJobs guest search. */
export async function fetchAllJobsIsraelJobs(opts?: {
  maxJobs?: number;
  queries?: string[];
  signals?: ResumeSignals | null;
}): Promise<AllJobsJobRow[]> {
  const maxJobs = opts?.maxJobs ?? 70;
  const queries =
    opts?.queries ||
    buildIlBoardSearchQueries(opts?.signals, 10) ||
    buildIlBoardSearchQueries(null, 10);
  const byId = new Map<string, AllJobsJobRow>();

  for (const term of queries) {
    if (byId.size >= maxJobs) break;
    try {
      const params = new URLSearchParams({
        page: "1",
        position: "",
        type: "",
        city: "",
        region: "",
        freetxt: term,
      });
      const html = await fetchSearchPage(
        `https://www.alljobs.co.il/SearchResultsGuest.aspx?${params}`,
      );
      for (const row of parseAllJobsHtml(html)) {
        if (
          !matchesSearchQueries(
            `${row.title} ${row.description} ${row.company || ""}`,
            queries,
          )
        ) {
          continue;
        }
        byId.set(row.external_id, row);
        if (byId.size >= maxJobs) break;
      }
    } catch {
      // network optional
    }
  }

  // Category pages as a backfill when free-text is thin
  if (byId.size < Math.min(25, maxJobs)) {
    for (const position of POSITION_CATEGORIES) {
      if (byId.size >= maxJobs) break;
      try {
        const params = new URLSearchParams({
          page: "1",
          position,
          type: "",
          city: "",
          region: "",
        });
        const html = await fetchSearchPage(
          `https://www.alljobs.co.il/SearchResultsGuest.aspx?${params}`,
        );
        for (const row of parseAllJobsHtml(html)) {
          if (
            !matchesSearchQueries(
              `${row.title} ${row.description}`,
              queries,
            )
          ) {
            continue;
          }
          byId.set(row.external_id, row);
          if (byId.size >= maxJobs) break;
        }
      } catch {
        // optional
      }
    }
  }

  return [...byId.values()].slice(0, maxJobs);
}
