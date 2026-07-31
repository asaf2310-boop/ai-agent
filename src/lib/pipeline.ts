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
  },
];

export async function ensureSampleJobs(supabase: DbClient) {
  const { count } = await supabase
    .from("jobs")
    .select("*", { count: "exact", head: true });

  if ((count ?? 0) > 0) return;

  await supabase.from("jobs").upsert(
    SAMPLE_JOBS.map((j) => ({
      ...j,
      scraped_at: new Date().toISOString(),
      posted_at: new Date().toISOString(),
    })),
    { onConflict: "source,external_id" },
  );
}

export async function matchResumeToJobs(
  supabase: DbClient,
  resume: Resume,
  minScore = Number(process.env.MIN_MATCH_SCORE || "0.3"),
): Promise<JobMatch[]> {
  const resumeText =
    resume.extracted_text || (resume.skills || []).join(" ") || resume.filename;

  const { data: jobs, error } = await supabase.from("jobs").select("*");
  if (error) throw new Error(error.message);

  const rows = [];
  for (const job of (jobs || []) as Job[]) {
    const { score, reasons } = scoreMatch(resumeText, resume.skills || [], job);
    if (score < minScore) continue;
    rows.push({
      resume_id: resume.id,
      job_id: job.id,
      score,
      reasons,
    });
  }

  if (!rows.length) return [];

  const { data, error: upsertError } = await supabase
    .from("job_matches")
    .upsert(rows, { onConflict: "resume_id,job_id" })
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
) {
  const resumeText =
    resume.extracted_text || (resume.skills || []).join(" ") || "";
  const notifyEmail = process.env.APPLICATION_NOTIFY_EMAIL;
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

    const applyEmail =
      (job as Job & { apply_email?: string | null }).apply_email || null;

    let status: "sent" | "prepared" | "skipped" | "failed" = "prepared";
    let method: string | null = "tailor-only";
    let skipReason: string | null = null;
    let error: string | null = null;

    const emailBody = [
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

    if (!target) {
      status = "skipped";
      skipReason =
        "אין כתובת הגשה למשרה ואין APPLICATION_NOTIFY_EMAIL — הקו״ח הותאם ונשמר לדוח";
      method = "none";
    } else {
      const sent = await sendApplicationEmail({
        to: target,
        subject: `AI Agent · ${job.title}${job.company ? ` @ ${job.company}` : ""}`,
        body: emailBody,
      });

      if (sent.ok) {
        status = "sent";
        method = applyEmail ? "job-email" : "notify-email";
      } else if (sent.error?.includes("RESEND_API_KEY")) {
        status = "prepared";
        skipReason =
          "אין RESEND_API_KEY — הקו״ח הותאם ונשמר. הגדר Resend כדי לשלוח בפועל";
        method = "prepared";
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
