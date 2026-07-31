import { NextResponse } from "next/server";
import {
  isClearedFromPool,
  wasSentToEmployer,
} from "@/lib/apply-email";
import { requireUser } from "@/lib/auth";
import { asPlainText, tailorResumeForJob } from "@/lib/openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { tryAutoWebApply, canAutoApplyJob } from "@/lib/web-apply";

/**
 * Auto-apply to one job via ATS form when a real Greenhouse/Lever/etc. URL exists.
 * Not for LinkedIn Easy Apply or search fallbacks.
 */
export async function POST(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (!user || response) return response!;

    const body = (await request.json().catch(() => ({}))) as {
      jobId?: string;
      matchId?: string;
      resumeId?: string;
    };

    if (!body.jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    const supabase = createAdminClient();

    let resumeId = body.resumeId;
    if (!resumeId) {
      const { data: resumes } = await supabase
        .from("resumes")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);
      if (resumes?.[0]) {
        resumeId = resumes[0].id;
      }
    }

    const { data: resumeRows } = resumeId
      ? await supabase
          .from("resumes")
          .select("*")
          .eq("user_id", user.id)
          .eq("id", resumeId)
          .limit(1)
      : await supabase
          .from("resumes")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);

    const resume = resumeRows?.[0];
    if (!resume) {
      return NextResponse.json({ error: "No resume found" }, { status: 400 });
    }

    const { data: jobRows, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", body.jobId)
      .limit(1);
    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 500 });
    }
    const job = jobRows?.[0];
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (!canAutoApplyJob(job)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "אין הגשה אוטומטית למשרה הזו — חסר מייל מעסיק או טופס הגשה באתר. השתמש במילוי ידני.",
        },
        { status: 422 },
      );
    }

    const { data: existing } = await supabase
      .from("applications")
      .select("*")
      .eq("user_id", user.id)
      .eq("resume_id", resume.id)
      .eq("job_id", body.jobId)
      .limit(1);
    const current = existing?.[0];
    if (current && wasSentToEmployer(current)) {
      return NextResponse.json({
        application: current,
        alreadySent: true,
        ok: true,
      });
    }

    const resumeText =
      resume.extracted_text || (resume.skills || []).join(" ") || "";
    const tailored = await tailorResumeForJob({
      resumeText,
      jobTitle: job.title,
      jobCompany: job.company,
      jobDescription: job.description,
    });
    const insights = asPlainText(tailored.insights);
    const tailoredCv = asPlainText(tailored.tailoredCv);

    const web = await tryAutoWebApply({
      job,
      resumeText,
      skills: resume.skills || [],
      tailoredCv,
      insights,
    });

    if (!web?.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: web?.detail || "הגשה אוטומטית נכשלה",
          ats: web?.ats,
        },
        { status: 422 },
      );
    }

    const row = {
      resume_id: resume.id,
      job_id: body.jobId,
      match_id: body.matchId || current?.match_id || null,
      status: "sent" as const,
      method: "web-form",
      skip_reason: web.detail || "הוגש אוטומטית בטופס האתר",
      recruiter_insights: insights,
      tailored_cv_text: tailoredCv,
      error: null,
      updated_at: new Date().toISOString(),
      user_id: user.id,
    };

    const { data, error } = await supabase
      .from("applications")
      .upsert(row, { onConflict: "resume_id,job_id" })
      .select("*, jobs(*)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      application: data,
      detail: web.detail,
      ats: web.ats,
      clearedFromPool: isClearedFromPool(data),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Auto-apply failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
