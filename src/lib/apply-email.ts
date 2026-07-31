/** Resolve recruiter apply email from job fields or free text. */

/** Strict address Resend accepts as bare `email@domain.tld`. */
const STRICT_EMAIL_RE =
  /^[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

/** Looser finder for digging addresses out of free text. */
const EMAIL_FIND_RE =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Bidirectional / zero-width / odd spaces that break Resend's `to` validation. */
const INVISIBLE_RE =
  /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g;

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
 * Normalize APPLY_INBOUND_DOMAIN / from-domain env values into a bare hostname.
 * Fixes common misconfigs: URL, leading @, full email, trailing slash.
 */
export function normalizeInboundDomain(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let d = scrubEmailText(raw);
  d = d.replace(/^https?:\/\//, "");
  d = d.split("/")[0] || "";
  d = d.replace(/^@+/, "");
  if (d.includes("@")) {
    d = d.split("@").pop() || "";
  }
  d = d.replace(/\.+$/, "");

  // Project brand typo: allincenter.co → allincenter.co.il
  if (d === "allincenter.co") {
    d = "allincenter.co.il";
  }

  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(d)) {
    return null;
  }
  // Reject empty labels / leading-dot domains (.co.il)
  if (d.startsWith(".") || d.includes("..")) return null;
  return d;
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
  if (!STRICT_EMAIL_RE.test(clean)) return false;
  const domain = clean.split("@")[1] || "";
  if (BLOCKED_DOMAINS.has(domain)) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) {
    return false;
  }
  return true;
}

export function extractEmails(text: string | null | undefined): string[] {
  if (!text) return [];
  const scrubbed = scrubEmailText(text);
  EMAIL_FIND_RE.lastIndex = 0;
  const found = scrubbed.match(EMAIL_FIND_RE) ?? [];
  const unique = [...new Set(found.map((e) => e.toLowerCase()))];
  return unique.filter((email) => isValidResendTo(email));
}

/** First clean address from free text, or null. */
export function normalizeApplyEmail(
  text: string | null | undefined,
): string | null {
  const emails = extractEmails(text);
  const first = emails[0] || null;
  if (!first) return null;
  // Repair known truncated brand domain left in older DB rows
  if (first.endsWith("@allincenter.co")) {
    return first.replace(/@allincenter\.co$/, "@allincenter.co.il");
  }
  return first;
}

/** Normalize Resend `from` — supports `email` or `Name <email>`. */
export function normalizeFromAddress(
  raw: string | null | undefined,
): string | null {
  const fallback = "onboarding@resend.dev";
  const text = (raw || fallback).trim();
  if (!text) return fallback;

  const angle = text.match(/^(.+?)\s*<([^>]+)>$/);
  if (angle) {
    const name = angle[1].trim().replace(/[\r\n]/g, " ");
    const email = normalizeApplyEmail(angle[2]);
    if (!email) return null;
    // Keep ASCII-ish names only to avoid Resend format rejects
    if (/^[\w\s.\-'"+]+$/u.test(name) && name.length <= 70) {
      return `${name} <${email}>`;
    }
    return email;
  }

  return normalizeApplyEmail(text);
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
  if (/Invalid [`'"]to[`'"] field|validation_error[\s\S]*?\bto\b|invalid[\s\S]*?\bto\b[\s\S]*?field/i.test(e)) {
    const toMatch = e.match(/\bto=([^\s|"']+)/i);
    const hint = toMatch?.[1] ? ` (${toMatch[1]})` : "";
    return `לא נשלח — כתובת המייל של המעסיק לא תקינה${hint}`;
  }
  if (/Invalid [`'"]from[`'"] field/i.test(e)) {
    return "לא נשלח — כתובת השולח (APPLICATION_FROM_EMAIL) לא תקינה ב-Resend";
  }
  if (/only send|testing emails|own email|verify a domain|domain is not verified/i.test(e)) {
    return "לא נשלח — Resend במצב בדיקה. אמת דומיין (למשל allincenter.co.il) ב-Resend ושם APPLICATION_FROM_EMAIL לכתובת מהדומיין";
  }
  if (e) return `לא נשלח — שגיאת Resend: ${e.slice(0, 120)}`;
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
