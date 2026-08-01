import { NextResponse } from "next/server";
import { isClearedFromPool, wasSentToEmployer } from "@/lib/apply-email";
import { requireUser } from "@/lib/auth";
import { recordJobDismissal } from "@/lib/job-preferences";
import { createAdminClient } from "@/lib/supabase/admin";

export type OpenReason = "dismiss" | "opened";

/**
 * Move a job out of the pool into History:
 * - reason=dismiss («לא מעוניין») — learn to avoid similar jobs
 * - reason=opened («פתח באתר») — user opened the employer site; no rejection learning
 */
export async function POST(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (!user || response) return response!;

    const body = (await request.json().catch(() => ({}))) as {
      jobId?: string;
      matchId?: string;
      resumeId?: string;
      reason?: OpenReason;
    };

    if (!body.jobId) {
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    const reason: OpenReason =
      body.reason === "opened" ? "opened" : "dismiss";

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

    const { data: jobRows } = await supabase
      .from("jobs")
      .select("id, title, company, description, location")
      .eq("id", body.jobId)
      .limit(1);
    const job = jobRows?.[0];
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
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
        ok: true,
        application: current,
        alreadySent: true,
        clearedFromPool: true,
        detail: "המשרה כבר הוגשה — מופיעה בהיסטוריה",
      });
    }

    if (current && current.method === "link-opened") {
      await supabase
        .from("job_matches")
        .delete()
        .eq("resume_id", resumeId)
        .eq("job_id", body.jobId);
      return NextResponse.json({
        ok: true,
        application: current,
        clearedFromPool: true,
        learned: reason === "dismiss",
        detail:
          reason === "opened"
            ? "כבר בהיסטוריה (נפתח באתר)"
            : "כבר הוסר מהפול",
      });
    }

    // Only «לא מעוניין» trains rejection preferences
    if (reason === "dismiss") {
      await recordJobDismissal(supabase, {
        userId: user.id,
        resumeId,
        jobId: body.jobId,
        job,
      });
    }

    // IMPORTANT: match_id must be null — we delete the match row next
    const row = {
      resume_id: resumeId,
      job_id: body.jobId,
      match_id: null as string | null,
      status: "skipped" as const,
      method: "link-opened",
      skip_reason:
        reason === "opened"
          ? "נפתח באתר — הועבר להיסטוריה"
          : "לא מעוניין — הוסר מהפול. המערכת תלמד לא להציע משרות דומות",
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
      return NextResponse.json(
        { error: error.message, ok: false },
        { status: 500 },
      );
    }

    const { error: matchDelError } = await supabase
      .from("job_matches")
      .delete()
      .eq("resume_id", resumeId)
      .eq("job_id", body.jobId);

    await supabase
      .from("job_matches")
      .delete()
      .eq("user_id", user.id)
      .eq("job_id", body.jobId);

    return NextResponse.json({
      ok: true,
      application: data,
      clearedFromPool: isClearedFromPool(data),
      matchDeleted: !matchDelError,
      learned: reason === "dismiss",
      reason,
      detail:
        reason === "opened"
          ? "נפתח באתר ✓ — המשרה בהיסטוריה; ממשיכים למשרה הבאה"
          : "הוסר ✓ — לא יוצג שוב; נלמד להימנע ממשרות דומות",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to clear job from pool";
    return NextResponse.json({ error: message, ok: false }, { status: 500 });
  }
}
