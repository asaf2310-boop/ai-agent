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
import {
  hasActiveJobLink,
  isBrokenLinkedInUrl,
  safeJobOpenUrl,
} from "@/lib/linkedin-url";
import { fetchCompanyCareerJobs } from "@/lib/company-careers";
import { fetchDrushimIsraelJobs } from "@/lib/drushim-jobs";
import { isFakeIlBoardUrl } from "@/lib/il-boards";
import { getDailyAutoApplyUsage } from "@/lib/daily-quota";
import {
  applyRejectionPreference,
  loadRejectionProfile,
} from "@/lib/job-preferences";
import { scoreMatch, shouldExcludeJob } from "@/lib/matching";
import { asPlainText, tailorResumeForJob } from "@/lib/openai";
import { extractResumeSignals } from "@/lib/resume-extract";
import type { Job, JobMatch, Resume } from "@/lib/types";
import { canAutoApplyJob, tryAutoWebApply } from "@/lib/web-apply";

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
  // Catalog demos have null / fake URLs — do not seed them into the pool.
  // Live sources (LinkedIn, Drushim, company careers, Remotive, RemoteOK) sync separately.
  await repairBrokenLinkedInUrls(supabase);
}

/** Company career pages (Greenhouse / Lever / Ashby) — tech, finance, startups. */
export async function syncCompanyCareerJobs(supabase: DbClient) {
  const jobs = await fetchCompanyCareerJobs({ maxJobs: 200 });
  if (jobs.length) {
    await upsertJobBatch(
      supabase,
      jobs.map((j) => ({ ...j })),
    );
  }
  return jobs.length;
}

/** Fix broken LinkedIn / Telegram / Facebook / fake IL board links. */
async function repairBrokenLinkedInUrls(supabase: DbClient) {
  try {
    const { data } = await supabase
      .from("jobs")
      .select("id, url, title, source, channel, external_id")
      .or(
        [
          "source.ilike.%linkedin%",
          "channel.ilike.%linkedin%",
          "url.ilike.%linkedin.com%",
          "source.ilike.%telegram%",
          "channel.ilike.%telegram%",
          "url.ilike.%t.me%",
          "source.ilike.%facebook%",
          "channel.ilike.%facebook%",
          "url.ilike.%facebook.com%",
          "source.eq.alljobs",
          "source.eq.drushim",
          "source.eq.jobmaster",
          "source.eq.jobnet",
          "source.eq.gotfriends",
          "url.ilike.%alljobs.co.il%",
          "url.ilike.%drushim.co.il%",
          "url.ilike.%jobmaster.co.il%",
          "url.ilike.%jobnet.co.il%",
          "url.ilike.%gotfriends.co.il%",
          "url.ilike.%ref=ai-agent%",
        ].join(","),
      )
      .limit(800);
    const rows = (data || []) as Array<{
      id: string;
      url?: string | null;
      title?: string | null;
      source?: string | null;
      channel?: string | null;
      external_id?: string | null;
    }>;
    for (const job of rows) {
      // Null out synthetic IL board URLs only — keep real Drushim /job/{id}/{hash}/
      if (job.url && isFakeIlBoardUrl(job.url)) {
        try {
          await supabase.from("jobs").update({ url: null }).eq("id", job.id);
        } catch {
          // best-effort
        }
        continue;
      }

      const next = safeJobOpenUrl(job);
      if (
        job.url &&
        next === null &&
        /t\.me|telegram|facebook\.com\/(?:groups\/)?example|linkedin\.com\/jobs\/search/i.test(
          job.url,
        )
      ) {
        try {
          await supabase.from("jobs").update({ url: null }).eq("id", job.id);
        } catch {
          // best-effort
        }
        continue;
      }
      if (!job.url || !isBrokenLinkedInUrl(job.url)) {
        if (job.url && next === null && /t\.me|example/i.test(job.url)) {
          try {
            await supabase.from("jobs").update({ url: null }).eq("id", job.id);
          } catch {
            /* ignore */
          }
        }
        continue;
      }
      if (!next || next === job.url) continue;
      try {
        await supabase.from("jobs").update({ url: next }).eq("id", job.id);
      } catch {
        // best-effort
      }
    }
  } catch {
    // best-effort
  }
}

const REMOTE_ROLE =
  /developer|engineer|react|python|full.?stack|devops|data|product|ai|llm|finance|analyst|manager|design|marketing|sales|מוצר|פיננס|ניהול|מפתח/i;

/** Pull live remote boards — Israel / IL-eligible only. */
export async function syncLiveSocialJobs(supabase: DbClient) {
  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  const pushRow = (row: Record<string, unknown>) => {
    const key = `${row.source}:${row.external_id}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

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
        if (!freelance && !REMOTE_ROLE.test(text)) continue;
        pushRow({
          source: "remoteok",
          external_id: String(item.id),
          title: String(item.position),
          company: company || null,
          location: location || "Israel / Remote",
          url: (item.url as string) || `https://remoteok.com/remote-jobs/${item.id}`,
          description: description.slice(0, 4000),
          apply_email: extractEmails(description)[0] || null,
          post_kind: freelance ? "freelance" : "job",
          channel: "remoteok",
          is_social: false,
          scraped_at: new Date().toISOString(),
          posted_at: item.epoch
            ? new Date(Number(item.epoch) * 1000).toISOString()
            : new Date().toISOString(),
        });
      }
    }
  } catch {
    // optional network source
  }

  const remotiveQueries = [
    "https://remotive.com/api/remote-jobs?search=Israel&limit=100",
    "https://remotive.com/api/remote-jobs?category=software-dev&limit=50",
    "https://remotive.com/api/remote-jobs?category=product&limit=40",
    "https://remotive.com/api/remote-jobs?category=data&limit=40",
    "https://remotive.com/api/remote-jobs?category=finance-legal&limit=30",
    "https://remotive.com/api/remote-jobs?category=marketing&limit=30",
  ];

  for (const endpoint of remotiveQueries) {
    try {
      const res = await fetch(endpoint, {
        headers: { "User-Agent": "ai-agent-job-scanner/1.0" },
        next: { revalidate: 0 },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { jobs?: Array<Record<string, unknown>> };
      for (const item of data.jobs || []) {
        const location = String(item.candidate_required_location || "");
        const description = String(item.description || "").replace(/<[^>]+>/g, " ");
        const company = String(item.company_name || "");
        if (!isIsraelLocation(location, description, company)) continue;
        const url = String(item.url || "");
        if (!url) continue;
        pushRow({
          source: "remotive",
          external_id: String(item.id || url),
          title: String(item.title || "Role"),
          company: company || null,
          location: location || "Israel / Remote",
          url,
          description: description.slice(0, 4000),
          apply_email: extractEmails(description)[0] || null,
          post_kind: /freelance|contract/i.test(`${item.job_type} ${description}`)
            ? "freelance"
            : "job",
          channel: "remotive",
          is_social: false,
          scraped_at: new Date().toISOString(),
          posted_at: item.publication_date
            ? String(item.publication_date)
            : new Date().toISOString(),
        });
      }
    } catch {
      // optional
    }
  }

  if (rows.length) {
    await upsertJobBatch(supabase, rows);
  }

  // Remove previously ingested non-Israel remoteok/remotive noise (best-effort)
  try {
    const { data: foreign } = await supabase
      .from("jobs")
      .select("id, location, description, company, source")
      .in("source", ["remoteok", "remotive"])
      .limit(300);
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

/** Live Drushim.co.il postings with real /job/{id}/{hash}/ links. */
export async function syncDrushimJobs(supabase: DbClient) {
  const jobs = await fetchDrushimIsraelJobs({ maxJobs: 70 });
  if (jobs.length) {
    await upsertJobBatch(
      supabase,
      jobs.map((j) => ({ ...j })),
    );
  }
  return jobs.length;
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
  minScore = Number(process.env.MIN_MATCH_SCORE || "0.32"),
  userId?: string,
): Promise<JobMatch[]> {
  const resumeText =
    resume.extracted_text || (resume.skills || []).join(" ") || resume.filename;
  const signals = extractResumeSignals(resumeText, resume.skills || []);
  const ownerId = userId || resume.user_id;
  const rejections = await loadRejectionProfile(supabase, ownerId);

  const { data: jobs, error } = await supabase.from("jobs").select("*");
  if (error) throw new Error(error.message);

  const israelJobs = ((jobs || []) as Job[]).filter(
    (job) =>
      isIsraelLocation(job.location, job.description, job.company) &&
      hasActiveJobLink(job),
  );

  const matchRows = [];
  for (const job of israelJobs) {
    // No generic Product Manager — only AI/ML product roles
    if (shouldExcludeJob(job)) continue;

    const base = scoreMatch(
      resumeText,
      resume.skills || [],
      job,
      signals,
    );
    const { score, reasons, reject } = applyRejectionPreference(
      base.score,
      base.reasons,
      job,
      rejections,
    );
    if (reject || score < minScore) continue;
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
 * Auto-apply: email when a recruiter address exists, otherwise try web-form
 * submit on Greenhouse/Lever/Ashby/careers pages. LinkedIn Easy Apply stays manual.
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
  const daily = ownerId
    ? await getDailyAutoApplyUsage(supabase, ownerId)
    : { used: 0, quota: 20, remaining: 20, dayKey: "" };
  if (daily.remaining <= 0) {
    return [];
  }

  // Cap attempts; stop early once today's successful auto-sends hit the quota.
  const maxApps = Math.min(
    Number(process.env.MAX_APPLICATIONS_PER_RUN || "40"),
    60,
    Math.max(daily.remaining * 3, daily.remaining),
  );
  // Prefer jobs we can actually auto-send (email or apply page)
  const sorted = [...matches]
    .filter((m) => m.jobs && hasActiveJobLink(m.jobs))
    .sort((a, b) => {
      const autoA =
        (a.jobs && resolveEmployerEmail(a.jobs) ? 2 : 0) +
        (a.jobs && canAutoApplyJob(a.jobs) ? 1 : 0);
      const autoB =
        (b.jobs && resolveEmployerEmail(b.jobs) ? 2 : 0) +
        (b.jobs && canAutoApplyJob(b.jobs) ? 1 : 0);
      if (autoB !== autoA) return autoB - autoA;
      return Number(b.score) - Number(a.score);
    });
  const results = [];
  let urlFetchBudget = Math.min(
    Number(process.env.MAX_EMAIL_FETCH_PER_RUN || "15"),
    20,
  );
  let webApplyBudget = Math.min(
    Number(process.env.MAX_WEB_APPLY_PER_RUN || "20"),
    25,
    daily.remaining,
  );
  let sentThisRun = 0;

  for (const match of sorted.slice(0, maxApps)) {
    if (sentThisRun >= daily.remaining) break;
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

    const isSocial = Boolean(job.is_social) || job.source.startsWith("social");
    let applyEmail = resolveEmployerEmail(job);
    if (job.apply_email && isSyntheticApplyEmail(job.apply_email)) {
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
        // best-effort
      }
    }

    if (
      !applyEmail &&
      urlFetchBudget > 0 &&
      job.url &&
      !/linkedin\.com|facebook\.com|t\.me\//i.test(job.url)
    ) {
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

    // Skip expensive tailor when we cannot auto-send this run
    const canWeb = canAutoApplyJob(job);
    const willAttemptSend =
      enableEmployerEmail &&
      (Boolean(applyEmail) || (canWeb && webApplyBudget > 0));

    if (!willAttemptSend) {
      results.push({
        status: "skipped",
        method: "manual-only",
        skip_reason:
          "אין מייל/טופס להגשה אוטומטית — המשרה בפול להגשה ידנית בקישור",
        job,
      });
      continue;
    }

    const tailored = await tailorResumeForJob({
      resumeText,
      jobTitle: job.title,
      jobCompany: job.company,
      jobDescription: job.description,
    });

    const insights = asPlainText(tailored.insights);
    const tailoredCv = asPlainText(tailored.tailoredCv);

    let status: "sent" | "prepared" | "skipped" | "failed" = "prepared";
    let method: string | null = "in-app";
    let skipReason: string | null = null;
    let error: string | null = null;

    if (!enableEmployerEmail) {
      status = "skipped";
      method = "disabled";
      skipReason = "שליחה אוטומטית כבויה (ENABLE_EMPLOYER_EMAIL=false)";
    } else if (applyEmail) {
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
    } else if (webApplyBudget > 0) {
      webApplyBudget -= 1;
      const web = await tryAutoWebApply({
        job,
        resumeText,
        skills: resume.skills || [],
        tailoredCv,
        insights,
      });
      if (web?.ok) {
        status = "sent";
        method = "web-form";
        skipReason = web.detail || "הוגש אוטומטית בטופס האתר";
      } else {
        status = "skipped";
        method = isSocial ? "link-only" : "no-web-form";
        skipReason =
          web?.detail ||
          (isSocial
            ? "לא הוגש — פוסט ברשת בלי טופס/מייל. פתח קישור והגש עם מילוי מהקו״ח"
            : "לא הוגש אוטומטית — אין מייל/טופס נגיש. השתמש ב״הגש אוטומטית״ או מילוי ידני");
      }
    } else {
      status = "skipped";
      method = isSocial ? "link-only" : "no-email";
      skipReason = isSocial
        ? "לא נשלח — פוסט ברשת בלי מייל/טופס הגשה"
        : "לא נשלח — אין מייל מעסיק; מכסת הגשות אתר לסריקה זו מלאה";
    }

    // Persist only real employer sends. Failures / skips stay out of history DB.
    if (status !== "sent") {
      results.push({
        status,
        method,
        skip_reason: skipReason,
        error,
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
      error: null,
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
      sentThisRun += 1;
      results.push(data);
    }
  }

  return results;
}
