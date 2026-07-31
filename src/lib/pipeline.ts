import { ISRAEL_JOB_CATALOG } from "@/lib/israel-jobs-catalog";
import { isIsraelLocation } from "@/lib/israel";
import { scoreMatch } from "@/lib/matching";
import { tailorResumeForJob } from "@/lib/openai";
import type { Job, JobMatch, Resume } from "@/lib/types";

// Admin client may use custom schema (job_agent); keep typing loose.
type DbClient = {
  from: (table: string) => any;
};

export const SAMPLE_JOBS = ISRAEL_JOB_CATALOG.filter((j) => !j.is_social).map(
  ({ domain: _d, ...job }) => job,
);

export const SAMPLE_SOCIAL_POSTS = ISRAEL_JOB_CATALOG.filter((j) => j.is_social).map(
  ({ domain: _d, ...job }) => job,
);

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
  minScore = Number(process.env.MIN_MATCH_SCORE || "0.2"),
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
