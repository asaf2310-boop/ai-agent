import { NextResponse } from "next/server";
import {
  isClearedFromPool,
  wasSentToEmployer,
} from "@/lib/apply-email";
import { requireUser } from "@/lib/auth";
import { getDailyAutoApplyUsage } from "@/lib/daily-quota";
import { asPlainText, tailorResumeForJob } from "@/lib/openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { tryAutoWebApply, canAutoApplyJob } from "@/lib/web-apply";
import { hasActiveJobLink, safeJobOpenUrl } from "@/lib/linkedin-url";

/**
 * «הגש אוטומטית»:
 * - If the employer form can be submitted → status sent, leave pool, history
 * - If not → do NOT mark sent; return tailored CV so the user can continue applying
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

    if (!hasActiveJobLink(job) && !canAutoApplyJob(job)) {
      return NextResponse.json(
        {
          ok: false,
          needsManual: true,
          error: "אין קישור הגשה. השתמש ב״מלא טופס מהקו״ח״.",
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
        formSubmitted: true,
        status: "sent",
        detail: "כבר נשלח — מופיע בהיסטוריה",
        clearedFromPool: true,
      });
    }

    const dailyQuota = await getDailyAutoApplyUsage(supabase, user.id);
    if (dailyQuota.remaining <= 0) {
      return NextResponse.json(
        {
          ok: false,
          quotaExceeded: true,
          dailyQuota,
          error: `הגעת למכסת ${dailyQuota.quota} שליחות אוטומטיות להיום. המשך מחר או הגש ידנית מהפול.`,
        },
        { status: 429 },
      );
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
      // optional
    }

    const openUrl =
      safeJobOpenUrl({
        url: job.url,
        title: job.title,
        source: job.source,
        channel: job.channel,
        external_id: job.external_id,
      }) || job.url;

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
    } else {
      formDetail = "אין טופס הגשה אוטומטי למשרה הזו";
    }

    // Form did not go through — keep in pool, let user continue with CV
    if (!formOk) {
      return NextResponse.json(
        {
          ok: false,
          needsManual: true,
          formSubmitted: false,
          error:
            formDetail ||
            "לא ניתן להגיש אוטומטית — המשך לשלוח את הקו״ח באתר המעסיק",
          detail:
            "המשרה נשארת בפול. מלא פרטים מהקו״ח ושלח באתר המעסיק.",
          tailoredCv,
          insights,
          ats,
          job: {
            id: job.id,
            title: job.title,
            company: job.company,
            url: openUrl,
          },
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
      skip_reason: formDetail || "נשלח אוטומטית בטופס האתר",
      recruiter_insights: insights || null,
      tailored_cv_text: tailoredCv || null,
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
      formSubmitted: true,
      application: data,
      detail: "נשלח ✓ — המשרה עברה להיסטוריה",
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
