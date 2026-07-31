import { NextResponse } from "next/server";
import { wasLinkOpened, wasSentToEmployer } from "@/lib/apply-email";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Restore a dismissed (link-opened) job back into the active pool
 * by deleting the dismiss row. Does not touch real sends.
 */
export async function POST(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (!user || response) return response!;

    const body = (await request.json().catch(() => ({}))) as {
      jobId?: string;
      applicationId?: string;
      resumeId?: string;
    };

    if (!body.jobId && !body.applicationId) {
      return NextResponse.json(
        { error: "Missing jobId or applicationId" },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    let query = supabase
      .from("applications")
      .select("id, status, method, job_id")
      .eq("user_id", user.id)
      .limit(1);

    if (body.applicationId) {
      query = query.eq("id", body.applicationId);
    } else {
      query = query.eq("job_id", body.jobId!);
      if (body.resumeId) query = query.eq("resume_id", body.resumeId);
    }

    const { data: rows, error: findError } = await query;
    if (findError) {
      return NextResponse.json({ error: findError.message }, { status: 500 });
    }
    const current = rows?.[0];
    if (!current) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    if (wasSentToEmployer(current)) {
      return NextResponse.json(
        { error: "לא ניתן להחזיר הגשה שנשלחה — היא נשארת בהיסטוריה" },
        { status: 400 },
      );
    }
    if (!wasLinkOpened(current)) {
      return NextResponse.json(
        { error: "רק משרות שהוסרו מהפול ניתנות להחזרה" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("applications")
      .delete()
      .eq("id", current.id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Undo preference learning for this job when user restores it
    if (current.job_id) {
      try {
        await supabase
          .from("job_feedback")
          .delete()
          .eq("user_id", user.id)
          .eq("job_id", current.job_id);
      } catch {
        // migration optional
      }
    }

    return NextResponse.json({
      ok: true,
      restoredJobId: current.job_id,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to restore to pool";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
