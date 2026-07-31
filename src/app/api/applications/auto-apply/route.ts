import { NextResponse } from "next/server";
import {
  isClearedFromPool,
  wasSentToEmployer,
} from "@/lib/apply-email";
import { requireUser } from "@/lib/auth";
import { asPlainText, tailorResumeForJob } from "@/lib/openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { tryAutoWebApply, canAutoApplyJob } from "@/lib/web-apply";
import { hasActiveJobLink } from "@/lib/linkedin-url";

/**
 * User clicked «הגש אוטומטית»:
 * 1) try real ATS/career form submit when possible
 * 2) always mark status=sent, clear from pool, appear in history
 *
 * Form POST failure must not leave the job stuck in the pool.
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

    // Allow click for any openable job, or jobs we previously treated as auto-applyable
    const openable = hasActiveJobLink(job);
    if (!openable && !canAutoApplyJob(job)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "אין קישור הגשה למשרה הזו. השתמש ב״מלא טופס מהקו״ח״ או הסר מהפול.",
        },
        { status: 422 },
      );
    }

    const { data: existing } = await supabase
      .from("applications")
      .select("*, jobs(*)")
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
        status: "sent",
        detail: "כבר נשלח — מופיע בהיסטוריה",
        clearedFromPool: true,
      });
    }

    const resumeText =
      resume.extracted_text || (resume.skills || []).join(" ") || "";
    let insights = "";
    let tailoredCv = resumeText.slice(0, 4000);
    try {
      const tailored = await tailorResumeForJob({
        resumeText,
        jobTitle: job.title,
        jobCompany: job.company,
        jobDescription: job.description,
      });
      insights = asPlainText(tailored.insights);
      tailoredCv = asPlainText(tailored.tailoredCv) || tailoredCv;
    } catch {
      // Tailoring is optional — apply / mark-sent must still proceed
    }

    let formOk = false;
    let formDetail = "";
    let ats: string | undefined;
    if (canAutoApplyJob(job)) {
      try {
        const web = await tryAutoWebApply({
          job,
          resumeText,
          skills: resume.skills || [],
          tailoredCv,
          insights,
        });
        formOk = Boolean(web?.ok);
        formDetail = web?.detail || "";
        ats = web?.ats;
      } catch (err) {
        formDetail =
          err instanceof Error ? err.message : "שליחת הטופס נכשלה";
      }
    }

    const skipReason = formOk
      ? formDetail || "נשלח אוטומטית בטופס האתר"
      : formDetail
        ? `נשלח (סומן ידנית) — ${formDetail}`
        : "נשלח בלחיצה על הגש אוטומטית";

    const row = {
      resume_id: resume.id,
      job_id: body.jobId,
      match_id: body.matchId || current?.match_id || null,
      status: "sent" as const,
      method: "web-form",
      skip_reason: skipReason,
      recruiter_insights: insights || null,
      tailored_cv_text: tailoredCv || null,
      error: formOk ? null : formDetail || null,
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
      detail: formOk
        ? "נשלח ✓ — המשרה עברה להיסטוריה"
        : "נשלח ✓ — סומן בהיסטוריה (הטופס באתר לא אושר אוטומטית)",
      formSubmitted: formOk,
      ats,
      status: "sent",
      clearedFromPool: isClearedFromPool(data),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Auto-apply failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
