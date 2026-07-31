/** Detect / resolve ATS & company career apply pages from job data. */

const ATS_HOST_RE =
  /(?:job-)?boards\.greenhouse\.io|boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|apply\.workable\.com|jobs\.workable\.com|www\.comeet\.com|comeet\.co|smartrecruiters\.com|myworkdayjobs\.com|greenhouse\.io/i;

const EXTERNAL_APPLY_RES = [
  /https?:\/\/(?:job-)?boards\.greenhouse\.io\/[^\s"'<>\\]+/gi,
  /https?:\/\/boards\.greenhouse\.io\/[^\s"'<>\\]+/gi,
  /https?:\/\/jobs\.lever\.co\/[^\s"'<>\\]+/gi,
  /https?:\/\/jobs\.ashbyhq\.com\/[^\s"'<>\\]+/gi,
  /https?:\/\/apply\.workable\.com\/[^\s"'<>\\]+/gi,
  /https?:\/\/[a-z0-9-]+\.comeet\.co\/[^\s"'<>\\]+/gi,
  /https?:\/\/www\.comeet\.com\/jobs\/[^\s"'<>\\]+/gi,
  /https?:\/\/[a-z0-9.-]+\.myworkdayjobs\.com\/[^\s"'<>\\]+/gi,
  /https?:\/\/jobs\.smartrecruiters\.com\/[^\s"'<>\\]+/gi,
];

/** Fake / demo catalog board links — not real application forms. */
export function isSyntheticJobBoardUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  return /[?&]ref=ai-agent\b/i.test(url) || /\/search\?ref=ai-agent/i.test(url);
}

export function isLinkedInOrSocialUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /linkedin\.com|facebook\.com|t\.me\/|telegram\.|whatsapp|twitter\.com|x\.com/i.test(
    url,
  );
}

export function isKnownAtsUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return ATS_HOST_RE.test(host);
  } catch {
    return ATS_HOST_RE.test(url);
  }
}

export type AtsKind =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "comeet"
  | "workday"
  | "smartrecruiters"
  | "generic"
  | "unsupported";

export function detectAts(url: string): AtsKind {
  const u = url.toLowerCase();
  if (/linkedin\.com|facebook\.com|t\.me\//.test(u)) return "unsupported";
  if (isSyntheticJobBoardUrl(url)) return "unsupported";
  if (/greenhouse\.io/.test(u)) return "greenhouse";
  if (/jobs\.lever\.co/.test(u)) return "lever";
  if (/ashbyhq\.com/.test(u)) return "ashby";
  if (/workable\.com/.test(u)) return "workable";
  if (/comeet\.(com|co)/.test(u)) return "comeet";
  if (/myworkdayjobs\.com/.test(u)) return "workday";
  if (/smartrecruiters\.com/.test(u)) return "smartrecruiters";
  if (/^https?:\/\//i.test(url)) return "generic";
  return "unsupported";
}

/** First external ATS / careers apply URL found in free text. */
export function extractExternalApplyUrl(
  text: string | null | undefined,
): string | null {
  if (!text) return null;
  for (const re of EXTERNAL_APPLY_RES) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (m?.[0]) {
      const cleaned = m[0].replace(/[.,);\]}>]+$/, "");
      if (/^https?:\/\//i.test(cleaned)) return cleaned;
    }
  }
  return null;
}

/**
 * Best URL to attempt automatic form submit:
 * real ATS link on the job, or one scraped from the description.
 */
export function resolveApplyPageUrl(job: {
  url?: string | null;
  description?: string | null;
}): string | null {
  const fromDesc = extractExternalApplyUrl(job.description);
  if (fromDesc && detectAts(fromDesc) !== "unsupported") return fromDesc;

  const url = (job.url || "").trim();
  if (!url) return null;
  if (isSyntheticJobBoardUrl(url)) return fromDesc;
  if (isLinkedInOrSocialUrl(url)) return fromDesc;
  if (detectAts(url) === "unsupported") return fromDesc;
  return url;
}
