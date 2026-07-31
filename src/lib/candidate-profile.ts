export type CandidateProfile = {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  city: string | null;
  country: string;
  summary: string | null;
  yearsExperience: number | null;
  skills: string[];
  hebrew: boolean;
  english: boolean;
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE =
  /(?:\+972[\s-]?(?:\d[\s-]?){8,9}|0(?:5\d|7\d|2|3|4|8|9)[\s-]?\d{3}[\s-]?\d{4}|\d{3}[\s-]?\d{3}[\s-]?\d{4})/;
const LINKEDIN_RE =
  /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?/i;

const IL_CITIES = [
  "תל אביב",
  "ת״א",
  "ירושלים",
  "חיפה",
  "רמת גן",
  "גבעתיים",
  "הרצליה",
  "רעננה",
  "כפר סבא",
  "פתח תקווה",
  "ראשון לציון",
  "נתניה",
  "באר שבע",
  "חולון",
  "בת ים",
  "מודיעין",
  "רחובות",
  "אשדוד",
  "אשקלון",
  "Tel Aviv",
  "Jerusalem",
  "Haifa",
  "Herzliya",
  "Ramat Gan",
  "Raanana",
  "Petah Tikva",
  "Beer Sheva",
];

function cleanPhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "").replace(/^972/, "+972");
}

function guessName(text: string): { fullName: string | null; firstName: string | null; lastName: string | null } {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  // Prefer a short Hebrew/English name-like first line
  for (const line of lines.slice(0, 8)) {
    if (EMAIL_RE.test(line) || PHONE_RE.test(line) || /http|www\.|linkedin/i.test(line)) {
      continue;
    }
    if (line.length < 3 || line.length > 60) continue;
    if (/^(resume|curriculum|cv|קורות|ניסיון|השכלה|skills|summary)/i.test(line)) {
      continue;
    }
    // 2–4 words, letters only (Hebrew/Latin)
    if (/^[\u0590-\u05FFa-zA-Z][\u0590-\u05FFa-zA-Z\s'-]{1,50}$/.test(line)) {
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length >= 2 && parts.length <= 4) {
        return {
          fullName: line,
          firstName: parts[0],
          lastName: parts.slice(1).join(" "),
        };
      }
    }
  }
  return { fullName: null, firstName: null, lastName: null };
}

function guessCity(text: string): string | null {
  for (const city of IL_CITIES) {
    if (text.includes(city)) return city.replace("ת״א", "תל אביב");
  }
  return null;
}

function guessYears(text: string): number | null {
  const m =
    text.match(/(\d{1,2})\+?\s*(?:years?|שנ(?:ות|ה)|yrs?)/i) ||
    text.match(/(?:ניסיון|experience)[^\d]{0,20}(\d{1,2})/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n < 50 ? n : null;
}

function guessSummary(text: string): string | null {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 40);
  const about = lines.find((l) =>
    /summary|profile|אודות|תקציר|מנהל|manager|experience|ניסיון/i.test(l),
  );
  return (about || lines[0] || null)?.slice(0, 400) || null;
}

/** Pull common application-form fields from resume text. */
export function extractCandidateProfile(
  text: string | null | undefined,
  skills: string[] = [],
): CandidateProfile {
  const raw = (text || "").trim();
  const email = raw.match(EMAIL_RE)?.[0]?.toLowerCase() || null;
  const phoneMatch = raw.match(PHONE_RE);
  const phone = phoneMatch ? cleanPhone(phoneMatch[0]) : null;
  const linkedin = raw.match(LINKEDIN_RE)?.[0] || null;
  const name = guessName(raw);

  return {
    fullName: name.fullName,
    firstName: name.firstName,
    lastName: name.lastName,
    email,
    phone,
    linkedin: linkedin
      ? linkedin.startsWith("http")
        ? linkedin
        : `https://${linkedin}`
      : null,
    city: guessCity(raw),
    country: "Israel",
    summary: guessSummary(raw),
    yearsExperience: guessYears(raw),
    skills: skills.slice(0, 20),
    hebrew: /[\u0590-\u05FF]/.test(raw),
    english: /[a-zA-Z]{3,}/.test(raw),
  };
}

/** Common ATS / IL board field labels → profile values (for copy / bookmarklet). */
export function buildAutofillFields(
  profile: CandidateProfile,
  job?: { title?: string | null; company?: string | null },
): Array<{ key: string; label: string; value: string; selectors: string[] }> {
  const fields: Array<{
    key: string;
    label: string;
    value: string;
    selectors: string[];
  }> = [];

  const push = (
    key: string,
    label: string,
    value: string | null | undefined,
    selectors: string[],
  ) => {
    if (!value) return;
    fields.push({ key, label, value, selectors });
  };

  push("fullName", "שם מלא", profile.fullName, [
    "input[name*=full_name i]",
    "input[name*=fullname i]",
    "input[name*=fullnameName i]",
    "input[id*=full_name i]",
    "input[id*=name i]",
    "input[placeholder*=שם i]",
    "input[aria-label*=שם i]",
    "input[autocomplete=name]",
  ]);
  push("firstName", "שם פרטי", profile.firstName, [
    "input[name*=first i]",
    "input[name*=fname i]",
    "input[autocomplete=given-name]",
    "input[placeholder*=פרטי i]",
  ]);
  push("lastName", "שם משפחה", profile.lastName, [
    "input[name*=last i]",
    "input[name*=lname i]",
    "input[autocomplete=family-name]",
    "input[placeholder*=משפחה i]",
  ]);
  push("email", "אימייל", profile.email, [
    "input[type=email]",
    "input[name*=email i]",
    "input[autocomplete=email]",
  ]);
  push("phone", "טלפון", profile.phone, [
    "input[type=tel]",
    "input[name*=phone i]",
    "input[name*=mobile i]",
    "input[name*=tel i]",
    "input[autocomplete=tel]",
  ]);
  push("linkedin", "LinkedIn", profile.linkedin, [
    "input[name*=linkedin i]",
    "input[placeholder*=linkedin i]",
  ]);
  push("city", "עיר", profile.city, [
    "input[name*=city i]",
    "input[name*=location i]",
    "input[autocomplete=address-level2]",
  ]);
  push("country", "מדינה", profile.country, [
    "input[name*=country i]",
    "select[name*=country i]",
    "input[autocomplete=country-name]",
  ]);
  push(
    "years",
    "שנות ניסיון",
    profile.yearsExperience != null ? String(profile.yearsExperience) : null,
    ["input[name*=experience i]", "input[name*=years i]"],
  );
  push("summary", "תקציר / מכתב מקדים", profile.summary, [
    "textarea[name*=cover i]",
    "textarea[name*=summary i]",
    "textarea[name*=about i]",
    "textarea[name*=message i]",
    "textarea",
  ]);

  if (job?.title) {
    push("jobTitle", "משרה (לייחוס)", job.title, []);
  }
  if (job?.company) {
    push("company", "חברה (לייחוס)", job.company, []);
  }

  return fields;
}

/** Bookmarklet source that fills common form fields from embedded JSON. */
export function buildAutofillBookmarklet(
  fields: Array<{ value: string; selectors: string[] }>,
): string {
  const payload = fields
    .filter((f) => f.selectors.length && f.value)
    .map((f) => ({ v: f.value, s: f.selectors }));
  const json = JSON.stringify(payload);
  const code = `(()=>{const D=${json};for(const x of D){for(const sel of x.s){document.querySelectorAll(sel).forEach(el=>{if(el&&'value'in el&&!el.value){el.value=x.v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}});}}alert('AI Agent: נוסו למלא שדות מהקו״ח. בדוק וצרף קו״ח ידנית אם צריך.');})();`;
  return `javascript:${encodeURIComponent(code)}`;
}
