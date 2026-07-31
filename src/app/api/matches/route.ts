import { NextResponse } from "next/server";
import { wasSentToEmployer } from "@/lib/apply-email";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Active pool: matches that were NOT yet sent to an employer. */
export async function GET(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (!user || response) return response!;

    const { searchParams } = new URL(request.url);
    const resumeId = searchParams.get("resumeId");
    const minScore = Number(
      searchParams.get("minScore") || process.env.MIN_MATCH_SCORE || "0.2",
    );

    const supabase = createAdminClient();

    let query = supabase
      .from("job_matches")
      .select("*, jobs(*)")
      .eq("user_id", user.id)
      .gte("score", minScore)
      .order("score", { ascending: false })
      .limit(80);

    if (resumeId) {
      query = query.eq("resume_id", resumeId);
    }

    let { data, error } = await query;

    if (error && /user_id/i.test(error.message) && resumeId) {
      const fallback = await supabase
        .from("job_matches")
        .select("*, jobs(*)")
        .eq("resume_id", resumeId)
        .gte("score", minScore)
        .order("score", { ascending: false })
        .limit(80);
      data = fallback.data;
      error = fallback.error;
    } else if (error && /user_id/i.test(error.message)) {
      return NextResponse.json({
        matches: [],
        warning: "Run SQL migration 004_security_rls_auth.sql",
      });
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if ((data?.length ?? 0) === 0 && resumeId) {
      const { data: byResume } = await supabase
        .from("job_matches")
        .select("*, jobs(*)")
        .eq("resume_id", resumeId)
        .gte("score", minScore)
        .order("score", { ascending: false })
        .limit(80);
      data = byResume;
    }

    const matches = data ?? [];

    // Remove jobs already sent to employer from the active pool
    let sentJobIds = new Set<string>();
    try {
      let appsQuery = supabase
        .from("applications")
        .select("job_id, status, method")
        .eq("user_id", user.id)
        .eq("status", "sent")
        .eq("method", "job-email");
      if (resumeId) appsQuery = appsQuery.eq("resume_id", resumeId);
      const { data: sentApps } = await appsQuery.limit(200);
      sentJobIds = new Set(
        (sentApps || [])
          .filter((a) => wasSentToEmployer(a))
          .map((a) => a.job_id)
          .filter(Boolean),
      );
    } catch {
      // if applications query fails, return unfiltered matches
    }

    const pool = matches.filter((m) => !sentJobIds.has(m.job_id));

    return NextResponse.json({
      matches: pool,
      poolCount: pool.length,
      hiddenSentCount: matches.length - pool.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load matches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
