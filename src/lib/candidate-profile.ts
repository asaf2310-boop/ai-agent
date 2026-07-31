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

const NAME_STOP =
  /^(resume|curriculum|vitae|cv|קורות|ניסיון|השכלה|skills|summary|profile|objective|contact|פרטים|יצירת.?קשר|טלפון|מייל|email|phone|mobile|address|linkedin|github|portfolio)/i;

const JOB_TITLE_HINT =
  /\b(engineer|developer|manager|director|analyst|designer|consultant|architect|lead|senior|junior|intern|founder|ceo|cto|cfo|product|marketing|sales|operations|מנהל|מהנדס|מפתח|יועץ|אנליסט|מעצב|סטודנט)\b/i;

/** Strip role / contact junk that often rides on the same line as the name. */
function isolateNameCandidate(line: string): string {
  let s = line.trim();
  // "Name: …" / "שם מלא – …"
  s = s.replace(
    /^(?:full\s*)?name\s*[:\-–—]|שם(?:\s*מלא)?\s*[:\-–—]\s*/i,
    "",
  );
  // Take left side of common separators before a title
  for (const sep of ["|", "•", "·", " – ", " — ", " - ", " –", "—"]) {
    if (s.includes(sep)) {
      const left = s.split(sep)[0]?.trim() || "";
      if (left.length >= 2) s = left;
    }
  }
  // Drop trailing , City or , Israel
  s = s.replace(/,\s*(israel|ישראל|tel aviv|תל אביב|jerusalem|ירושלים).*$/i, "");
  return s.replace(/\s+/g, " ").trim();
}

function isPlausibleName(line: string): boolean {
  if (!line || line.length < 2 || line.length > 70) return false;
  if (EMAIL_RE.test(line) || PHONE_RE.test(line)) return false;
  if (/https?:\/\/|www\.|linkedin|github|@/i.test(line)) return false;
  if (NAME_STOP.test(line)) return false;
  // City / country alone is not a person name
  const lower = line.toLowerCase().replace(/ת״א/g, "תל אביב");
  if (
    IL_CITIES.some((c) => c.toLowerCase() === lower) ||
    /^(israel|ישראל|remote|היברידי|hybrid)$/i.test(line)
  ) {
    return false;
  }
  // Mostly letters (Hebrew/Latin), spaces, hyphens, apostrophes, geresh
  if (!/^[\u0590-\u05FFa-zA-Z][\u0590-\u05FFa-zA-Z\s'\u05F3\u2019.-]{0,68}$/.test(line)) {
    return false;
  }
  // Reject lines that look like a job title alone
  if (JOB_TITLE_HINT.test(line)) {
    const hasHebrew = /[\u0590-\u05FF]/.test(line);
    const hasLatinNameShape = /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(line);
    if (!hasHebrew && !hasLatinNameShape) return false;
    if (hasLatinNameShape && JOB_TITLE_HINT.test(line)) return false;
  }
  return true;
}

function splitNameParts(full: string): {
  fullName: string;
  firstName: string;
  lastName: string | null;
} {
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { fullName: full, firstName: parts[0], lastName: null };
  }
  // Hebrew often written first-last; English too. Keep first token as first name.
  return {
    fullName: full,
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function nameFromLabeledFields(text: string): {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
} | null {
  const first =
    text.match(
      /(?:שם\s*פרטי|first\s*name|given\s*name)\s*[:\-–—]\s*([^\n,|]{2,40})/i,
    )?.[1]?.trim() || null;
  const last =
    text.match(
      /(?:שם\s*משפחה|last\s*name|family\s*name|surname)\s*[:\-–—]\s*([^\n,|]{2,40})/i,
    )?.[1]?.trim() || null;
  const fullLabeled =
    text.match(
      /(?:שם\s*מלא|full\s*name|שם)\s*[:\-–—]\s*([^\n|]{2,60})/i,
    )?.[1]?.trim() || null;

  if (first || last) {
    const f = first ? isolateNameCandidate(first) : null;
    const l = last ? isolateNameCandidate(last) : null;
    if (f || l) {
      const full = [f, l].filter(Boolean).join(" ");
      return {
        fullName: full || null,
        firstName: f,
        lastName: l,
      };
    }
  }
  if (fullLabeled) {
    const cleaned = isolateNameCandidate(fullLabeled);
    if (isPlausibleName(cleaned)) return splitNameParts(cleaned);
  }
  return null;
}

function nameFromEmail(email: string | null): {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
} | null {
  if (!email) return null;
  const local = email.split("@")[0] || "";
  // asaf.cohen / asaf_cohen / asaf-cohen
  const m = local.match(/^([a-zA-Z\u0590-\u05FF]{2,})[._-]([a-zA-Z\u0590-\u05FF]{2,})$/);
  if (!m) return null;
  const cap = (s: string) =>
    /[\u0590-\u05FF]/.test(s) ? s : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const firstName = cap(m[1]);
  const lastName = cap(m[2]);
  return {
    fullName: `${firstName} ${lastName}`,
    firstName,
    lastName,
  };
}

function guessName(text: string): {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
} {
  const labeled = nameFromLabeledFields(text);
  if (labeled?.fullName || labeled?.firstName) return labeled;

  const email = text.match(EMAIL_RE)?.[0]?.toLowerCase() || null;
  const fromEmail = nameFromEmail(email);

  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Prefer early lines (header of CV), after stripping titles
  for (const rawLine of lines.slice(0, 20)) {
    const line = isolateNameCandidate(rawLine);
    if (!isPlausibleName(line)) continue;
    const parts = line.split(/\s+/).filter(Boolean);
    // Prefer 2–4 tokens (first + last). Single token only if no email-derived name.
    if (parts.length >= 2 && parts.length <= 4) {
      return splitNameParts(line);
    }
    if (parts.length === 1 && !fromEmail && lines.indexOf(rawLine) <= 2) {
      return splitNameParts(line);
    }
  }

  if (fromEmail) return fromEmail;

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
    "input[name*=candidate_name i]",
    "input[id*=full_name i]",
    "input[id*=fullname i]",
    "input[placeholder*=שם מלא i]",
    "input[placeholder*=full name i]",
    "input[placeholder*=שם i]",
    "input[aria-label*=שם מלא i]",
    "input[aria-label*=שם i]",
    "input[aria-label*=full name i]",
    "input[autocomplete=name]",
  ]);
  push("firstName", "שם פרטי", profile.firstName, [
    "input[name*=first_name i]",
    "input[name*=firstname i]",
    "input[name*=firstName i]",
    "input[name*=fname i]",
    "input[name*=given i]",
    "input[id*=first i]",
    "input[autocomplete=given-name]",
    "input[placeholder*=פרטי i]",
    "input[placeholder*=first name i]",
    "input[aria-label*=פרטי i]",
    "input[aria-label*=first name i]",
  ]);
  push("lastName", "שם משפחה", profile.lastName, [
    "input[name*=last_name i]",
    "input[name*=lastname i]",
    "input[name*=lastName i]",
    "input[name*=lname i]",
    "input[name*=surname i]",
    "input[name*=family i]",
    "input[id*=last i]",
    "input[autocomplete=family-name]",
    "input[placeholder*=משפחה i]",
    "input[placeholder*=last name i]",
    "input[aria-label*=משפחה i]",
    "input[aria-label*=last name i]",
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
  const code = `(()=>{const D=${json};let n=0;for(const x of D){for(const sel of x.s){document.querySelectorAll(sel).forEach(el=>{if(!el)return;if('value'in el&&!el.value){el.focus();el.value=x.v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));n++;}});}const btn=[...document.querySelectorAll('button,input[type=submit],a')].find(el=>{const t=((el.value||el.innerText||el.getAttribute('aria-label')||'')+'').toLowerCase();return/submit|apply|send|הגש|שלח|סיום|continue|next/.test(t)&&!/cancel|close|סגור|ביטול/.test(t);});if(btn&&n>0&&confirm('AllIn: מולאו '+n+' שדות. ללחוץ על שליחה/הגשה עכשיו?\\n(צרף קו״ח ידנית אם יש שדה Upload)')){btn.click();}else{alert('AllIn: מולאו '+n+' שדות מהקו״ח. בדוק, צרף קו״ח אם צריך, והגש.');}})();`;
  return `javascript:${encodeURIComponent(code)}`;
}
