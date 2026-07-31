/** Resolve recruiter apply email from job fields or free text. */
const EMAIL_RE =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

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

export function extractEmails(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = text.match(EMAIL_RE) ?? [];
  const unique = [...new Set(found.map((e) => e.toLowerCase()))];
  return unique.filter((email) => {
    const domain = email.split("@")[1] || "";
    if (BLOCKED_DOMAINS.has(domain)) return false;
    if (email.endsWith(".png") || email.endsWith(".jpg")) return false;
    return true;
  });
}

export function resolveApplyEmail(job: {
  apply_email?: string | null;
  description?: string | null;
  company?: string | null;
  url?: string | null;
}): string | null {
  const fromField = job.apply_email?.trim().toLowerCase();
  if (fromField && extractEmails(fromField).length) return fromField;

  if (job.url?.toLowerCase().startsWith("mailto:")) {
    const fromMailto = extractEmails(job.url.replace(/^mailto:/i, ""));
    if (fromMailto[0]) return fromMailto[0];
  }

  const fromDesc = extractEmails(job.description);
  if (fromDesc[0]) return fromDesc[0];

  return null;
}

/** Was this application actually emailed to an employer? */
export function wasSentToEmployer(app: {
  status: string;
  method?: string | null;
}): boolean {
  return app.status === "sent" && app.method === "job-email";
}

export function explainResendFailure(error: string | null | undefined): string {
  const e = error || "";
  if (/RESEND_API_KEY/i.test(e)) {
    return "לא נשלח — חסר RESEND_API_KEY ב-Vercel";
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
    const mailto = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (mailto?.[1]) {
      const email = mailto[1].toLowerCase();
      if (extractEmails(email).length) return email;
    }
    return extractEmails(html)[0] || null;
  } catch {
    return null;
  }
}
