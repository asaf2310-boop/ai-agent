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
