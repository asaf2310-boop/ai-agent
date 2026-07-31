import { isIsraelLocation } from "@/lib/israel";
import { scoreMatch } from "@/lib/matching";
import { tailorResumeForJob } from "@/lib/openai";
import type { Job, JobMatch, Resume } from "@/lib/types";

// Admin client may use custom schema (job_agent); keep typing loose.
type DbClient = {
  from: (table: string) => any;
};

export const SAMPLE_JOBS = [
  {
    source: "sample",
    external_id: "il-fe-001",
    title: "Frontend Engineer",
    company: "Example Labs",
    location: "Tel Aviv",
    url: "https://example.com/jobs/fe-001",
    apply_email: null as string | null,
    description:
      "React, TypeScript, Next.js. Build product UI for Israeli startups.",
    post_kind: "job" as const,
    channel: null as string | null,
    is_social: false,
  },
  {
    source: "sample",
    external_id: "il-be-002",
    title: "Backend Developer",
    company: "Negev Data",
    location: "Remote - Israel",
    url: "https://example.com/jobs/be-002",
    apply_email: null as string | null,
    description:
      "Python, FastAPI, PostgreSQL, Supabase. APIs and data pipelines.",
    post_kind: "job" as const,
    channel: null as string | null,
    is_social: false,
  },
  {
    source: "sample",
    external_id: "il-fs-003",
    title: "Full Stack Developer",
    company: "Coastline AI",
    location: "Haifa",
    url: "https://example.com/jobs/fs-003",
    apply_email: null as string | null,
    description: "Node, React, Docker, AWS. End-to-end product ownership.",
    post_kind: "job" as const,
    channel: null as string | null,
    is_social: false,
  },
  {
    source: "sample",
    external_id: "il-devops-004",
    title: "DevOps Engineer",
    company: "Galilee Cloud",
    location: "Herzliya",
    url: "https://example.com/jobs/devops-004",
    apply_email: null as string | null,
    description: "AWS, Docker, Kubernetes, CI/CD, Terraform. Israel on-site/hybrid.",
    post_kind: "job" as const,
    channel: null as string | null,
    is_social: false,
  },
  {
    source: "sample",
    external_id: "il-data-005",
    title: "Data Engineer",
    company: "Jerusalem Analytics",
    location: "Jerusalem",
    url: "https://example.com/jobs/data-005",
    apply_email: null as string | null,
    description: "Python, SQL, Airflow, Spark. Build data pipelines in Israel.",
    post_kind: "job" as const,
    channel: null as string | null,
    is_social: false,
  },
  {
    source: "sample",
    external_id: "il-qa-006",
    title: "QA Automation Engineer",
    company: "Ramat Gan Soft",
    location: "Ramat Gan",
    url: "https://example.com/jobs/qa-006",
    apply_email: null as string | null,
    description: "Playwright, Cypress, JavaScript, CI. Hybrid Tel Aviv area.",
    post_kind: "job" as const,
    channel: null as string | null,
    is_social: false,
  },
  {
    source: "sample",
    external_id: "il-pm-007",
    title: "Product Manager — B2B SaaS",
    company: "Startup Nation Hub",
    location: "Tel Aviv",
    url: "https://example.com/jobs/pm-007",
    apply_email: null as string | null,
    description: "Product ownership for Israeli B2B SaaS. Hebrew + English.",
    post_kind: "job" as const,
    channel: null as string | null,
    is_social: false,
  },
  {
    source: "sample",
    external_id: "il-mobile-008",
    title: "Mobile Developer (React Native)",
    company: "Beach Apps IL",
    location: "Tel Aviv",
    url: "https://example.com/jobs/mobile-008",
    apply_email: null as string | null,
    description: "React Native, TypeScript, mobile CI. On-site Tel Aviv.",
    post_kind: "job" as const,
    channel: null as string | null,
    is_social: false,
  },
];

export const SAMPLE_SOCIAL_POSTS = [
  {
    source: "social-telegram",
    external_id: "tg-il-freelance-001",
    title: "פרילנס React — דף נחיתה לחברת סטארטאפ",
    company: "פוסט בקבוצת Telegram · Jobs IL",
    location: "Remote - Israel",
    url: "https://t.me/s/example_il_jobs/101",
    apply_email: null as string | null,
    description:
      "מחפשים פרילנסר/ית React+Tailwind לבניית דף נחיתה. תקציב לפי פרויקט. שלחו תיק עבודות.",
    post_kind: "freelance" as const,
    channel: "telegram",
    is_social: true,
  },
  {
    source: "social-facebook",
    external_id: "fb-il-jobs-002",
    title: "דרוש/ה Full Stack לפרויקט קצר",
    company: "פוסט בפייסבוק · פרילנסרים ישראל",
    location: "תל אביב / היברידי",
    url: "https://www.facebook.com/groups/example.il.freelance/posts/2002",
    apply_email: null as string | null,
    description:
      "מגייסים לפרויקט 3–4 שבועות: Node, React, Postgres. עצמאים בלבד. אפשר לשלוח קו״ח בפרטי.",
    post_kind: "social" as const,
    channel: "facebook",
    is_social: true,
  },
  {
    source: "social-linkedin",
    external_id: "li-il-contract-003",
    title: "Contract Backend Engineer (Python)",
    company: "פוסט ב-LinkedIn",
    location: "Israel / Remote",
    url: "https://www.linkedin.com/feed/update/urn:li:activity:example3003",
    apply_email: null as string | null,
    description:
      "Looking for a freelance Python/FastAPI engineer for a 2-month contract with an Israeli product team. Supabase a plus.",
    post_kind: "freelance" as const,
    channel: "linkedin",
    is_social: true,
  },
];

async function upsertJobBatch(
  supabase: DbClient,
  rows: Array<Record<string, unknown>>,
) {
  const now = new Date().toISOString();
  const payload = rows.map((j) => ({
    ...j,
    scraped_at: now,
    posted_at: j.posted_at || now,
  }));

  let { error } = await supabase
    .from("jobs")
    .upsert(payload, { onConflict: "source,external_id" });

  // Fallback if migration 003 (social columns) not applied yet
  if (error && /post_kind|is_social|channel/i.test(error.message)) {
    const stripped = payload.map((j) => {
      const { post_kind: _pk, channel: _ch, is_social: _is, ...rest } = j as Record<
        string,
        unknown
      > & {
        post_kind?: unknown;
        channel?: unknown;
        is_social?: unknown;
      };
      return rest;
    });
    ({ error } = await supabase
      .from("jobs")
      .upsert(stripped, { onConflict: "source,external_id" }));
  }

  if (error) throw new Error(error.message);
}

export async function ensureSampleJobs(supabase: DbClient) {
  // Always upsert IL catalog + social samples (Israel only)
  await upsertJobBatch(supabase, SAMPLE_JOBS);
  await upsertJobBatch(supabase, SAMPLE_SOCIAL_POSTS);
}

/** Pull live listings — Israel only. */
export async function syncLiveSocialJobs(supabase: DbClient) {
  const rows: Array<Record<string, unknown>> = [];

  try {
    const res = await fetch("https://remoteok.com/api", {
      headers: { "User-Agent": "ai-agent-job-scanner/1.0" },
      next: { revalidate: 0 },
    });
    if (res.ok) {
      const data = (await res.json()) as Array<Record<string, unknown>>;
      for (const item of data) {
        if (!item?.id || !item?.position) continue;
        const location = String(item.location || "");
        const description = String(item.description || "").replace(/<[^>]+>/g, " ");
        const company = String(item.company || "");
        if (!isIsraelLocation(location, description, company)) continue;

        const text = `${item.position} ${description} ${company}`;
        const freelance = /freelance|contract|gig|פרילנס/i.test(text);
        if (!freelance && !/developer|engineer|react|python|full.?stack|devops|data/i.test(text)) {
          continue;
        }
        rows.push({
          source: "remoteok",
          external_id: String(item.id),
          title: String(item.position),
          company: company || null,
          location: location || "Israel",
          url: (item.url as string) || `https://remoteok.com/remote-jobs/${item.id}`,
          description: description.slice(0, 4000),
          apply_email: null,
          post_kind: freelance ? "freelance" : "job",
          channel: "remoteok",
          is_social: true,
          scraped_at: new Date().toISOString(),
          posted_at: item.epoch
            ? new Date(Number(item.epoch) * 1000).toISOString()
            : new Date().toISOString(),
        });
        if (rows.length >= 30) break;
      }
    }
  } catch {
    // optional network source
  }

  // Also try Remotive with Israel filter
  try {
    const res = await fetch(
      "https://remotive.com/api/remote-jobs?category=software-dev&limit=50",
      { headers: { "User-Agent": "ai-agent-job-scanner/1.0" }, next: { revalidate: 0 } },
    );
    if (res.ok) {
      const data = (await res.json()) as { jobs?: Array<Record<string, unknown>> };
      for (const item of data.jobs || []) {
        const location = String(item.candidate_required_location || "");
        const description = String(item.description || "").replace(/<[^>]+>/g, " ");
        const company = String(item.company_name || "");
        if (!isIsraelLocation(location, description, company)) continue;
        const url = String(item.url || "");
        if (!url) continue;
        rows.push({
          source: "remotive",
          external_id: String(item.id || url),
          title: String(item.title || "Role"),
          company: company || null,
          location: location || "Israel",
          url,
          description: description.slice(0, 4000),
          apply_email: null,
          post_kind: /freelance|contract/i.test(`${item.job_type} ${description}`)
            ? "freelance"
            : "job",
          channel: "remotive",
          is_social: true,
          scraped_at: new Date().toISOString(),
          posted_at: item.publication_date
            ? String(item.publication_date)
            : new Date().toISOString(),
        });
      }
    }
  } catch {
    // optional
  }

  if (rows.length) {
    let { error } = await supabase
      .from("jobs")
      .upsert(rows, { onConflict: "source,external_id" });
    if (error && /post_kind|is_social|channel/i.test(error.message)) {
      const stripped = rows.map((j) => {
        const { post_kind: _pk, channel: _ch, is_social: _is, ...rest } = j;
        return rest;
      });
      ({ error } = await supabase
        .from("jobs")
        .upsert(stripped, { onConflict: "source,external_id" }));
    }
    if (error) throw new Error(error.message);
  }

  // Remove previously ingested non-Israel remoteok/remotive noise (best-effort)
  try {
    const { data: foreign } = await supabase
      .from("jobs")
      .select("id, location, description, company, source")
      .in("source", ["remoteok", "remotive"])
      .limit(200);
    const badIds = ((foreign || []) as Job[])
      .filter((j) => !isIsraelLocation(j.location, j.description, j.company))
      .map((j) => j.id);
    if (badIds.length) {
      await supabase.from("jobs").delete().in("id", badIds);
    }
  } catch {
    // ignore cleanup failures
  }

  return rows.length;
}

export async function matchResumeToJobs(
  supabase: DbClient,
  resume: Resume,
  minScore = Number(process.env.MIN_MATCH_SCORE || "0.25"),
  userId?: string,
): Promise<JobMatch[]> {
  const resumeText =
    resume.extracted_text || (resume.skills || []).join(" ") || resume.filename;

  const { data: jobs, error } = await supabase.from("jobs").select("*");
  if (error) throw new Error(error.message);

  const israelJobs = ((jobs || []) as Job[]).filter((job) =>
    isIsraelLocation(job.location, job.description, job.company),
  );

  const ownerId = userId || resume.user_id;
  const matchRows = [];
  for (const job of israelJobs) {
    const { score, reasons } = scoreMatch(resumeText, resume.skills || [], job);
    if (score < minScore) continue;
    matchRows.push({
      resume_id: resume.id,
      job_id: job.id,
      score,
      reasons,
      ...(ownerId ? { user_id: ownerId } : {}),
    });
  }

  if (!matchRows.length) return [];

  const { data, error: upsertError } = await supabase
    .from("job_matches")
    .upsert(matchRows, { onConflict: "resume_id,job_id" })
    .select("*, jobs(*)");

  if (upsertError) throw new Error(upsertError.message);
  return (data || []) as JobMatch[];
}

async function sendApplicationEmail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; error?: string; method: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.APPLICATION_FROM_EMAIL || "onboarding@resend.dev";

  if (!resendKey) {
    return { ok: false, error: "RESEND_API_KEY not configured", method: "none" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      text: input.body,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text, method: "resend" };
  }

  return { ok: true, method: "resend" };
}

export async function processApplicationsForResume(
  supabase: DbClient,
  resume: Resume,
  matches: JobMatch[],
  userId?: string,
) {
  const resumeText =
    resume.extracted_text || (resume.skills || []).join(" ") || "";
  const notifyEmail = process.env.APPLICATION_NOTIFY_EMAIL;
  const ownerId = userId || resume.user_id;
  const results = [];

  for (const match of matches) {
    const job = match.jobs;
    if (!job) continue;

    const tailored = await tailorResumeForJob({
      resumeText,
      jobTitle: job.title,
      jobCompany: job.company,
      jobDescription: job.description,
    });

    const applyEmail = job.apply_email || null;
    const isSocial = Boolean(job.is_social) || job.source.startsWith("social");

    let status: "sent" | "prepared" | "skipped" | "failed" = "prepared";
    let method: string | null = "tailor-only";
    let skipReason: string | null = null;
    let error: string | null = null;

    const emailBody = isSocial
      ? [
          "פוסט דרושים/פרילנס מהרשת",
          `כותרת: ${job.title}`,
          `ערוץ: ${job.channel || job.source}`,
          `סוג: ${job.post_kind || "social"}`,
          `קישור לפוסט: ${job.url || "—"}`,
          "",
          "למה זה רלוונטי:",
          tailored.insights,
          "",
          "טיוטת פנייה / קו״ח מותאם:",
          tailored.tailoredCv,
        ].join("\n")
      : [
          `מועמדות אוטומטית למשרה: ${job.title}`,
          `חברה: ${job.company || "—"}`,
          `קישור: ${job.url || "—"}`,
          "",
          "מה המגייס מחפש:",
          tailored.insights,
          "",
          "קו״ח מותאם:",
          tailored.tailoredCv,
        ].join("\n");

    const target = applyEmail || notifyEmail;
    const subject = isSocial
      ? `AI Agent · קישור לפוסט · ${job.title}`
      : `AI Agent · ${job.title}${job.company ? ` @ ${job.company}` : ""}`;

    if (!target) {
      if (isSocial && job.url) {
        status = "prepared";
        method = "link-only";
        skipReason =
          "פוסט מהרשת — הקישור מוצג בדוח. הגדר APPLICATION_NOTIFY_EMAIL לקבלת התראה במייל";
      } else {
        status = "skipped";
        skipReason =
          "אין כתובת הגשה למשרה ואין APPLICATION_NOTIFY_EMAIL — הקו״ח הותאם ונשמר לדוח";
        method = "none";
      }
    } else {
      const sent = await sendApplicationEmail({
        to: target,
        subject,
        body: emailBody,
      });

      if (sent.ok) {
        status = "sent";
        method =
          isSocial && !applyEmail
            ? "link-alert"
            : applyEmail
              ? "job-email"
              : "notify-email";
      } else if (sent.error?.includes("RESEND_API_KEY")) {
        status = "prepared";
        method = isSocial ? "link-only" : "prepared";
        skipReason = isSocial
          ? "קישור לפוסט נשמר בדוח. חסר RESEND_API_KEY לשליחת התראה"
          : "אין RESEND_API_KEY — הקו״ח הותאם ונשמר. הגדר Resend כדי לשלוח בפועל";
      } else {
        status = "failed";
        error = sent.error || "send failed";
        method = sent.method;
      }
    }

    const row = {
      resume_id: resume.id,
      job_id: job.id,
      match_id: match.id,
      status,
      method,
      skip_reason: skipReason,
      recruiter_insights: tailored.insights,
      tailored_cv_text: tailored.tailoredCv,
      error,
      updated_at: new Date().toISOString(),
      ...(ownerId ? { user_id: ownerId } : {}),
    };

    const { data, error: upsertError } = await supabase
      .from("applications")
      .upsert(row, { onConflict: "resume_id,job_id" })
      .select("*, jobs(*)")
      .single();

    if (upsertError) {
      results.push({ status: "failed", error: upsertError.message, job });
    } else {
      results.push(data);
    }
  }

  return results;
}
