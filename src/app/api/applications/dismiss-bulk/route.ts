import { NextResponse } from "next/server";
import { wasSentToEmployer } from "@/lib/apply-email";
import { requireUser } from "@/lib/auth";
import { recordJobDismissal } from "@/lib/job-preferences";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BULK = 50;

/**
 * Bulk «לא מעוניין»: remove many pool jobs at once + learn preferences.
 * Frees pool slots so a scan can pull fresh matches.
 */
export async function POST(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (!user || response) return response!;

    const body = (await request.json().catch(() => ({}))) as {
      jobIds?: string[];
      resumeId?: string;
    };

    const jobIds = [...new Set((body.jobIds || []).filter(Boolean))].slice(
      0,
      MAX_BULK,
    );
    if (!jobIds.length) {
      return NextResponse.json({ error: "Missing jobIds" }, { status: 400 });
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

    const { data: jobRows } = await supabase
      .from("jobs")
      .select("id, title, company, description, location")
      .in("id", jobIds);

    const jobsById = new Map((jobRows || []).map((j) => [j.id, j]));
    let dismissed = 0;
    let skippedSent = 0;
    const errors: string[] = [];

    for (const jobId of jobIds) {
      const job = jobsById.get(jobId);
      if (!job) {
        errors.push(`${jobId}: not found`);
        continue;
      }

      try {
        const { data: existing } = await supabase
          .from("applications")
          .select("*")
          .eq("user_id", user.id)
          .eq("resume_id", resumeId)
          .eq("job_id", jobId)
          .limit(1);
        const current = existing?.[0];

        if (current && wasSentToEmployer(current)) {
          skippedSent += 1;
          continue;
        }

        if (!(current && current.method === "link-opened")) {
          await recordJobDismissal(supabase, {
            userId: user.id,
            resumeId,
            jobId,
            job,
          });

          const row = {
            resume_id: resumeId,
            job_id: jobId,
            match_id: null as string | null,
            status: "skipped" as const,
            method: "link-opened",
            skip_reason:
              "לא מעוניין — הוסר מהפול (מחיקה מרובה). המערכת תלמד לא להציע משרות דומות",
            recruiter_insights: current?.recruiter_insights ?? null,
            tailored_cv_text: current?.tailored_cv_text ?? null,
            error: null,
            updated_at: new Date().toISOString(),
            user_id: user.id,
          };

          const { error } = await supabase
            .from("applications")
            .upsert(row, { onConflict: "resume_id,job_id" });
          if (error) {
            errors.push(`${jobId}: ${error.message}`);
            continue;
          }
        }

        await supabase
          .from("job_matches")
          .delete()
          .eq("resume_id", resumeId)
          .eq("job_id", jobId);
        await supabase
          .from("job_matches")
          .delete()
          .eq("user_id", user.id)
          .eq("job_id", jobId);

        dismissed += 1;
      } catch (err) {
        errors.push(
          `${jobId}: ${err instanceof Error ? err.message : "failed"}`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      dismissed,
      skippedSent,
      errors: errors.slice(0, 10),
      clearedFromPool: true,
      detail:
        dismissed > 0
          ? `הוסרו ${dismissed} מהפול ✓ — אפשר לסרוק למשרות חדשות`
          : "לא הוסרו משרות",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Bulk dismiss failed";
    return NextResponse.json({ error: message, ok: false }, { status: 500 });
  }
}
