import { NextResponse } from "next/server";
import { isClearedFromPool, wasSentToEmployer } from "@/lib/apply-email";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Explicitly remove a job from the active pool (user tapped "הסר מהפול").
 * Does not run when the user merely opens the job URL in a new tab.
 * Does not downgrade an already-sent employer email / web-form application.
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
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);
      resumeId = resumes?.[0]?.id;
    }
    if (!resumeId) {
      const { data: latest } = await supabase
        .from("resumes")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      resumeId = latest?.[0]?.id;
    }
    if (!resumeId) {
      return NextResponse.json({ error: "No resume found" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("applications")
      .select("*")
      .eq("user_id", user.id)
      .eq("resume_id", resumeId)
      .eq("job_id", body.jobId)
      .limit(1);

    const current = existing?.[0];
    if (current && wasSentToEmployer(current)) {
      return NextResponse.json({
        application: current,
        alreadySent: true,
      });
    }

    const row = {
      resume_id: resumeId,
      job_id: body.jobId,
      match_id: body.matchId || current?.match_id || null,
      status: "prepared" as const,
      method: "link-opened",
      skip_reason: "הוסר מהפול ידנית — נשמר בהיסטוריה כפתיחת קישור",
      recruiter_insights: current?.recruiter_insights ?? null,
      tailored_cv_text: current?.tailored_cv_text ?? null,
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
      application: data,
      clearedFromPool: isClearedFromPool(data),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to mark opened";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
