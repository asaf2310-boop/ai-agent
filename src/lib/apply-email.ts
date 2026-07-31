/** Resolve recruiter apply email from job fields or free text. */
const EMAIL_RE =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Bidirectional / zero-width marks that break Resend's `to` validation. */
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

const BLOCKED_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "test.com",
  "email.com",
  "domain.com",
  "sentry.io",
  "wixpress.com",
]);

/** Strip invisible unicode then lowercase. */
export function scrubEmailText(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(INVISIBLE_RE, "").trim().toLowerCase();
}

/**
 * Resend accepts `email@example.com` or `Name <email@example.com>`.
 * We always send the bare address to avoid name/encoding edge cases.
 */
export function isValidResendTo(email: string | null | undefined): boolean {
  if (!email) return false;
  const clean = scrubEmailText(email);
  if (!clean || /[\s,<]/.test(clean) || clean.startsWith("mailto:")) {
    return false;
  }
  // Must be exactly one extracted address (no surrounding junk).
  return extractEmails(clean)[0] === clean;
}

export function extractEmails(text: string | null | undefined): string[] {
  if (!text) return [];
  const scrubbed = scrubEmailText(text);
  // Reset lastIndex — EMAIL_RE is global
  EMAIL_RE.lastIndex = 0;
  const found = scrubbed.match(EMAIL_RE) ?? [];
  const unique = [...new Set(found)];
  return unique.filter((email) => {
    const domain = email.split("@")[1] || "";
    if (BLOCKED_DOMAINS.has(domain)) return false;
    if (email.endsWith(".png") || email.endsWith(".jpg") || email.endsWith(".svg")) {
      return false;
    }
    // Reject trailing-dot / double-dot noise that sometimes slips past match boundaries
    if (email.includes("..") || email.startsWith(".") || email.endsWith(".")) return false;
    return true;
  });
}

/** First clean address from free text, or null. */
export function normalizeApplyEmail(
  text: string | null | undefined,
): string | null {
  const emails = extractEmails(text);
  const first = emails[0] || null;
  return first && isValidResendTo(first) ? first : null;
}

export function resolveApplyEmail(job: {
  apply_email?: string | null;
  description?: string | null;
  company?: string | null;
  url?: string | null;
}): string | null {
  // Always extract the bare address — raw apply_email may include mailto:,
  // Hebrew labels, trailing punctuation, or RTL marks that Resend rejects.
  const fromField = normalizeApplyEmail(job.apply_email);
  if (fromField) return fromField;

  if (job.url?.toLowerCase().startsWith("mailto:")) {
    const fromMailto = normalizeApplyEmail(job.url.replace(/^mailto:/i, ""));
    if (fromMailto) return fromMailto;
  }

  return normalizeApplyEmail(job.description);
}

/** Was this application actually emailed to an employer? */
export function wasSentToEmployer(app: {
  status: string;
  method?: string | null;
}): boolean {
  return app.status === "sent" && app.method === "job-email";
}

/** User opened the job link — treat as handled for the pool. */
export function wasLinkOpened(app: { method?: string | null }): boolean {
  return app.method === "link-opened";
}

/** Sent or link-opened → leave active pool, stay in history only. */
export function isClearedFromPool(app: {
  status: string;
  method?: string | null;
}): boolean {
  return wasSentToEmployer(app) || wasLinkOpened(app);
}

export function explainResendFailure(error: string | null | undefined): string {
  const e = error || "";
  if (/RESEND_API_KEY/i.test(e)) {
    return "לא נשלח — חסר RESEND_API_KEY ב-Vercel";
  }
  if (/Invalid 'to' field|validation_error.*to|invalid.*to.*field/i.test(e)) {
    return "לא נשלח — כתובת המייל של המעסיק לא תקינה (פורמט Resend)";
  }
  if (/only send|testing emails|own email|verify a domain|domain is not verified/i.test(e)) {
    return "לא נשלח — Resend במצב בדיקה. אמת דומיין (למשל allincenter.co.il) ב-Resend כדי לשלוח למיילים של מעסיקים";
  }
  if (e) return `לא נשלח — שגיאת Resend: ${e.slice(0, 180)}`;
  return "לא נשלח — שגיאה בשליחת המייל למעסיק";
}

/** Try to pull a mailto / email off a public job page (best-effort). */
export async function fetchApplyEmailFromUrl(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  if (/linkedin\.com|facebook\.com|t\.me|telegram|whatsapp|twitter|x\.com/i.test(url)) {
    return null;
  }
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "ai-agent-job-scanner/1.0" },
      signal: AbortSignal.timeout(5000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200_000);
    const mailto = html.match(
      /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    );
    if (mailto?.[1]) {
      const email = normalizeApplyEmail(mailto[1]);
      if (email) return email;
    }
    return normalizeApplyEmail(html);
  } catch {
    return null;
  }
}
