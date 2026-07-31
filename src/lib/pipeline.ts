import {
  explainResendFailure,
  extractEmails,
  fetchApplyEmailFromUrl,
  isClearedFromPool,
  isSyntheticApplyEmail,
  isValidResendTo,
  normalizeApplyEmail,
  normalizeFromAddress,
  resolveEmployerEmail,
  wasSentToEmployer,
} from "@/lib/apply-email";
import { isIsraelLocation } from "@/lib/israel";
import { ISRAEL_JOB_CATALOG } from "@/lib/israel-jobs-catalog";
import {
  fetchLinkedInIsraelJobs,
  pruneOldLinkedInJobs,
} from "@/lib/linkedin-jobs";
import { scoreMatch } from "@/lib/matching";
import { asPlainText, tailorResumeForJob } from "@/lib/openai";
import type { Job, JobMatch, Resume } from "@/lib/types";

export { wasSentToEmployer, isClearedFromPool };

function scrubNeedsPersist(raw: string, cleaned: string): boolean {
  return raw.trim().toLowerCase() !== cleaned;
}

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
          apply_email: extractEmails(description)[0] || null,
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
          apply_email: extractEmails(description)[0] || null,
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

/** LinkedIn active jobs in Israel from the past 7 days (+ prune older). */
export async function syncLinkedInJobs(supabase: DbClient) {
  const jobs = await fetchLinkedInIsraelJobs({
    maxJobs: 80,
    enrichDescriptions: 20,
  });
  if (jobs.length) {
    await upsertJobBatch(
      supabase,
      jobs.map((j) => ({ ...j })),
    );
  }
  await pruneOldLinkedInJobs(supabase, 7);
  return jobs.length;
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
  replyTo?: string | null;
}): Promise<{ ok: boolean; error?: string; method: string }> {
  const resendKey = process.env.RESEND_API_KEY;

  if (!resendKey) {
    return { ok: false, error: "RESEND_API_KEY not configured", method: "none" };
  }

  const to = normalizeApplyEmail(input.to);
  if (!to || !isValidResendTo(to)) {
    return {
      ok: false,
      error: JSON.stringify({
        statusCode: 422,
        name: "validation_error",
        message: `Invalid 'to' field. Got: ${JSON.stringify(String(input.to).slice(0, 120))}`,
      }) + ` | to=${String(input.to).slice(0, 80)}`,
      method: "resend",
    };
  }

  const from =
    normalizeFromAddress(process.env.APPLICATION_FROM_EMAIL) ||
    "onboarding@resend.dev";

  const replyTo = input.replyTo ? normalizeApplyEmail(input.replyTo) : null;

  const payload: Record<string, unknown> = {
    from,
    to: [to],
    subject: input.subject,
    text: input.body,
  };
  if (replyTo) payload.reply_to = replyTo;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      error: `${text} | to=${to} | from=${from}`,
      method: "resend",
    };
  }

  return { ok: true, method: "resend" };
}

/**
 * Auto-apply by email when a recruiter address exists.
 * Otherwise prepare tailored CV in-app and mark as not sent.
 * Does not send alert emails to APPLICATION_NOTIFY_EMAIL.
 */
export async function processApplicationsForResume(
  supabase: DbClient,
  resume: Resume,
  matches: JobMatch[],
  userId?: string,
  candidateEmail?: string | null,
) {
  const resumeText =
    resume.extracted_text || (resume.skills || []).join(" ") || "";
  const ownerId = userId || resume.user_id;
  // Auto-send ON by default; set ENABLE_EMPLOYER_EMAIL=false to disable
  const enableEmployerEmail = !["false", "0", "no", "off"].includes(
    (process.env.ENABLE_EMPLOYER_EMAIL || "true").toLowerCase(),
  );
  const replyTo =
    normalizeApplyEmail(candidateEmail) ||
    normalizeApplyEmail(process.env.CANDIDATE_EMAIL) ||
    normalizeApplyEmail(process.env.APPLICATION_CANDIDATE_EMAIL) ||
    null;
  const maxApps = Math.min(
    Number(process.env.MAX_APPLICATIONS_PER_RUN || "40"),
    60,
  );
  const sorted = [...matches].sort(
    (a, b) => Number(b.score) - Number(a.score),
  );
  const results = [];
  let urlFetchBudget = 5;

  for (const match of sorted.slice(0, maxApps)) {
    const job = match.jobs;
    if (!job) continue;

    // Don't overwrite history entries (employer-sent or user opened the link)
    try {
      let existingQuery = supabase
        .from("applications")
        .select("*, jobs(*)")
        .eq("resume_id", resume.id)
        .eq("job_id", job.id)
        .limit(1);
      if (ownerId) existingQuery = existingQuery.eq("user_id", ownerId);
      const { data: existingRows } = await existingQuery;
      const existing = existingRows?.[0];
      if (existing && isClearedFromPool(existing)) {
        results.push(existing);
        continue;
      }
    } catch {
      // continue with normal processing
    }

    const tailored = await tailorResumeForJob({
      resumeText,
      jobTitle: job.title,
      jobCompany: job.company,
      jobDescription: job.description,
    });

    const insights = asPlainText(tailored.insights);
    const tailoredCv = asPlainText(tailored.tailoredCv);
    const isSocial = Boolean(job.is_social) || job.source.startsWith("social");
    let applyEmail = resolveEmployerEmail(job);
    // Clear synthetic addresses left in DB from older catalog seeds
    if (
      job.apply_email &&
      isSyntheticApplyEmail(job.apply_email)
    ) {
      applyEmail = null;
      try {
        await supabase
          .from("jobs")
          .update({ apply_email: null })
          .eq("id", job.id);
      } catch {
        // best-effort
      }
    }
    if (
      applyEmail &&
      job.apply_email &&
      scrubNeedsPersist(job.apply_email, applyEmail)
    ) {
      try {
        await supabase
          .from("jobs")
          .update({ apply_email: applyEmail })
          .eq("id", job.id);
      } catch {
        // best-effort cleanup of dirty apply_email values
      }
    }
    if (!applyEmail && !isSocial && urlFetchBudget > 0) {
      urlFetchBudget -= 1;
      const fetched = await fetchApplyEmailFromUrl(job.url);
      applyEmail =
        fetched && !isSyntheticApplyEmail(fetched) ? fetched : null;
      if (applyEmail) {
        try {
          await supabase
            .from("jobs")
            .update({ apply_email: applyEmail })
            .eq("id", job.id);
        } catch {
          // best-effort persist
        }
      }
    }

    let status: "sent" | "prepared" | "skipped" | "failed" = "prepared";
    let method: string | null = "in-app";
    let skipReason: string | null = null;
    let error: string | null = null;

    if (!enableEmployerEmail) {
      status = "skipped";
      method = "disabled";
      skipReason = "שליחה אוטומטית כבויה (ENABLE_EMPLOYER_EMAIL=false)";
    } else if (!applyEmail) {
      status = "skipped";
      method = isSocial ? "link-only" : "no-email";
      skipReason = isSocial
        ? "לא נשלח — פוסט ברשת (LinkedIn/Telegram וכו׳) בלי מייל הגשה. הגשה ידנית בקישור"
        : "לא נשלח — אין מייל מעסיק אמיתי. קו״ח מותאם מוכן להגשה ידנית באתר";
    } else {
      const emailBody = [
        `שלום,`,
        ``,
        `מצורפת מועמדות למשרה: ${job.title}`,
        `חברה: ${job.company || "—"}`,
        `קישור למשרה: ${job.url || "—"}`,
        ``,
        `סיכום התאמה קצר:`,
        insights,
        ``,
        `קו״ח מותאם:`,
        tailoredCv,
        ``,
        replyTo ? `ליצירת קשר עם המועמד/ת: ${replyTo}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const sent = await sendApplicationEmail({
        to: applyEmail,
        replyTo,
        subject: `מועמדות: ${job.title}${job.company ? ` — ${job.company}` : ""}`,
        body: emailBody,
      });

      if (sent.ok) {
        status = "sent";
        method = "job-email";
        skipReason = null;
      } else if (sent.error?.includes("RESEND_API_KEY")) {
        status = "skipped";
        method = "no-resend";
        skipReason = explainResendFailure(sent.error);
      } else {
        status = "failed";
        method = "job-email";
        error = sent.error || "שליחה למעסיק נכשלה";
        skipReason = explainResendFailure(sent.error);
      }
    }

    // History only for sent / failed-send. Skipped (no real employer email) stay out.
    if (status === "skipped") {
      results.push({
        status,
        method,
        skip_reason: skipReason,
        job,
      });
      continue;
    }

    const row = {
      resume_id: resume.id,
      job_id: job.id,
      match_id: match.id,
      status,
      method,
      skip_reason: skipReason,
      recruiter_insights: insights,
      tailored_cv_text: tailoredCv,
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
