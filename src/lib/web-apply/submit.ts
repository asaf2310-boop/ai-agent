import type { CandidateProfile } from "@/lib/candidate-profile";
import { detectAts, type AtsKind } from "@/lib/web-apply/urls";

export type WebApplyResult = {
  ok: boolean;
  method: "web-form";
  ats: AtsKind;
  detail?: string;
  status?: number;
};

const UA =
  "Mozilla/5.0 (compatible; AllIn-JobAgent/1.0; +https://ai.allincenter.co.il)";

function resumeBlob(text: string, filename = "resume.txt"): File {
  return new File([text], filename, { type: "text/plain;charset=utf-8" });
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function absUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function successHint(status: number, body: string): boolean {
  if (status >= 200 && status < 400) {
    if (/captcha|recaptcha|challenge|access denied|too many/i.test(body)) {
      return false;
    }
    return true;
  }
  return false;
}

/** Map profile → common form field names seen on ATS / IL boards. */
function fillKnownFields(
  form: FormData,
  profile: CandidateProfile,
  coverLetter: string,
  existingKeys: Set<string>,
) {
  const pairs: Array<[RegExp, string | null | undefined]> = [
    [/first.?name|^fname$|שם.?פרטי/i, profile.firstName],
    [/last.?name|^lname$|שם.?משפחה/i, profile.lastName],
    [/full.?name|^name$|שם.?מלא|candidate.?name/i, profile.fullName],
    [/e-?mail|מייל|אימייל/i, profile.email],
    [/phone|mobile|tel|טלפון/i, profile.phone],
    [/linkedin/i, profile.linkedin],
    [/city|עיר|location/i, profile.city],
    [/country|מדינה/i, profile.country],
    [/cover|summary|about|message|comments|מכתב|תקציר/i, coverLetter || profile.summary],
  ];

  for (const key of existingKeys) {
    if (/resume|cv|file|attachment|upload/i.test(key)) continue;
    for (const [re, value] of pairs) {
      if (value && re.test(key)) {
        form.set(key, value);
        break;
      }
    }
  }

  // Ensure core fields even if form scrape missed names
  const ensure: Array<[string[], string | null | undefined]> = [
    [["first_name", "firstName", "job_application[first_name]"], profile.firstName],
    [["last_name", "lastName", "job_application[last_name]"], profile.lastName],
    [["name", "full_name", "job_application[name]"], profile.fullName],
    [["email", "job_application[email]"], profile.email],
    [["phone", "phone_number", "job_application[phone]"], profile.phone],
    [["urls[LinkedIn]", "linkedin", "job_application[linkedin]"], profile.linkedin],
    [["comments", "cover_letter", "job_application[cover_letter]"], coverLetter || profile.summary],
  ];
  for (const [names, value] of ensure) {
    if (!value) continue;
    for (const n of names) {
      if (!form.has(n)) form.set(n, value);
    }
  }
}

function parseInputNames(html: string): string[] {
  const names: string[] = [];
  const re =
    /<(?:input|textarea|select)[^>]*\sname=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    names.push(decodeHtml(m[1]));
  }
  return [...new Set(names)];
}

function findFormMeta(
  html: string,
  pageUrl: string,
): { action: string; method: string } | null {
  const formMatch = html.match(
    /<form[^>]*(?:id=["'][^"']*appl[^"']*["']|action=["'][^"']*["'])[^>]*>/i,
  );
  const block =
    formMatch?.[0] ||
    html.match(/<form[^>]*>/i)?.[0] ||
    null;
  if (!block) return null;
  const actionRaw =
    block.match(/action=["']([^"']*)["']/i)?.[1] || pageUrl;
  const method = (block.match(/method=["']([^"']+)["']/i)?.[1] || "post").toLowerCase();
  return { action: absUrl(pageUrl, decodeHtml(actionRaw) || pageUrl), method };
}

async function fetchPage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 400_000);
    return { html, finalUrl: res.url || url };
  } catch {
    return null;
  }
}

async function postForm(
  action: string,
  form: FormData,
  referer: string,
): Promise<{ status: number; body: string }> {
  const res = await fetch(action, {
    method: "POST",
    body: form,
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/json",
      Referer: referer,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  const body = (await res.text()).slice(0, 8000);
  return { status: res.status, body };
}

async function submitGenericHtmlForm(input: {
  url: string;
  profile: CandidateProfile;
  coverLetter: string;
  resumeText: string;
  ats: AtsKind;
}): Promise<WebApplyResult> {
  const page = await fetchPage(input.url);
  if (!page) {
    return {
      ok: false,
      method: "web-form",
      ats: input.ats,
      detail: "לא ניתן לטעון את דף ההגשה",
    };
  }

  const meta = findFormMeta(page.html, page.finalUrl);
  if (!meta || meta.method === "get") {
    return {
      ok: false,
      method: "web-form",
      ats: input.ats,
      detail: "לא נמצא טופס הגשה בדף (ייתכן SPA / התחברות)",
    };
  }

  const keys = new Set(parseInputNames(page.html));
  // Hidden tokens
  const form = new FormData();
  for (const key of keys) {
    const hidden = page.html.match(
      new RegExp(
        `<input[^>]*type=["']hidden["'][^>]*name=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*value=["']([^"']*)["']`,
        "i",
      ),
    );
    const hiddenAlt = page.html.match(
      new RegExp(
        `<input[^>]*name=["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*type=["']hidden["'][^>]*value=["']([^"']*)["']`,
        "i",
      ),
    );
    const val = hidden?.[1] ?? hiddenAlt?.[1];
    if (val != null) form.set(key, decodeHtml(val));
  }

  fillKnownFields(form, input.profile, input.coverLetter, keys);

  // Attach resume to first file-like field
  const fileKey =
    [...keys].find((k) => /resume|cv|file|attachment|upload/i.test(k)) ||
    "resume";
  form.set(fileKey, resumeBlob(input.resumeText));
  if (fileKey !== "job_application[resume]") {
    form.set("job_application[resume]", resumeBlob(input.resumeText));
  }

  try {
    const { status, body } = await postForm(meta.action, form, page.finalUrl);
    const ok =
      successHint(status, body) &&
      !/error|invalid|required|failed|חסר|שגיאה/i.test(body.slice(0, 1500));
    // Many ATS redirect to thank-you with 200 even on soft fail — treat 2xx/3xx as attempt ok
    // when body looks like confirmation
    const confirmed =
      ok ||
      /thank|thanks|submitted|application.?received|התקבלה|נשלח|success/i.test(
        body,
      );

    return {
      ok: confirmed && status < 500,
      method: "web-form",
      ats: input.ats,
      status,
      detail: confirmed
        ? `הוגש דרך טופס האתר (${input.ats})`
        : `הגשה נכשלה או נחסמה (HTTP ${status})`,
    };
  } catch (err) {
    return {
      ok: false,
      method: "web-form",
      ats: input.ats,
      detail: err instanceof Error ? err.message : "שגיאת רשת בהגשה",
    };
  }
}

/** Lever public apply endpoint. */
async function submitLever(input: {
  url: string;
  profile: CandidateProfile;
  coverLetter: string;
  resumeText: string;
}): Promise<WebApplyResult> {
  const m = input.url.match(
    /jobs\.lever\.co\/([^/]+)\/([a-f0-9-]+)/i,
  );
  if (!m) {
    return submitGenericHtmlForm({
      ...input,
      ats: "lever",
    });
  }
  const [, company, postingId] = m;
  const action = `https://jobs.lever.co/${company}/${postingId}`;
  const form = new FormData();
  if (input.profile.fullName) form.set("name", input.profile.fullName);
  if (input.profile.email) form.set("email", input.profile.email);
  if (input.profile.phone) form.set("phone", input.profile.phone);
  if (input.profile.linkedin) form.set("urls[LinkedIn]", input.profile.linkedin);
  if (input.coverLetter || input.profile.summary) {
    form.set("comments", input.coverLetter || input.profile.summary || "");
  }
  form.set("resume", resumeBlob(input.resumeText));
  form.set("origin", "applied-product");

  try {
    const { status, body } = await postForm(action, form, action);
    const ok =
      status < 400 ||
      /thank|submitted|application/i.test(body);
    return {
      ok,
      method: "web-form",
      ats: "lever",
      status,
      detail: ok ? "הוגש דרך Lever" : `Lever דחה את ההגשה (HTTP ${status})`,
    };
  } catch (err) {
    return {
      ok: false,
      method: "web-form",
      ats: "lever",
      detail: err instanceof Error ? err.message : "שגיאת Lever",
    };
  }
}

/** Ashby application via posting page form / application-form API. */
async function submitAshby(input: {
  url: string;
  profile: CandidateProfile;
  coverLetter: string;
  resumeText: string;
}): Promise<WebApplyResult> {
  // Prefer scraping the posting form (includes csrf / job id)
  return submitGenericHtmlForm({ ...input, ats: "ashby" });
}

/**
 * Attempt automatic application on a career / ATS page.
 * LinkedIn Easy Apply and login-walled boards are not supported server-side.
 */
export async function submitWebApplication(input: {
  applyUrl: string;
  profile: CandidateProfile;
  coverLetter?: string | null;
  resumeText: string;
}): Promise<WebApplyResult> {
  const ats = detectAts(input.applyUrl);
  if (ats === "unsupported") {
    return {
      ok: false,
      method: "web-form",
      ats,
      detail:
        "לא ניתן להגיש אוטומטית בקישור הזה (LinkedIn/סושיאל/לוח דמו). פתח ידנית עם מילוי מהקו״ח.",
    };
  }

  if (!input.profile.email && !input.profile.fullName) {
    return {
      ok: false,
      method: "web-form",
      ats,
      detail: "חסרים שם/אימייל בקו״ח — לא ניתן למלא טופס",
    };
  }

  const payload = {
    url: input.applyUrl,
    profile: input.profile,
    coverLetter: input.coverLetter || input.profile.summary || "",
    resumeText: input.resumeText.slice(0, 80_000),
  };

  if (ats === "lever") return submitLever(payload);
  if (ats === "ashby") return submitAshby(payload);
  return submitGenericHtmlForm({ ...payload, ats });
}
