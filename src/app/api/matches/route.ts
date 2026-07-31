import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

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

    const { data, error } = await query;

    if (error) {
      // Fallback: older rows may lack user_id — load by resume ownership
      if (/user_id/i.test(error.message) && resumeId) {
        const { data: byResume, error: resumeErr } = await supabase
          .from("job_matches")
          .select("*, jobs(*)")
          .eq("resume_id", resumeId)
          .gte("score", minScore)
          .order("score", { ascending: false })
          .limit(80);
        if (resumeErr) {
          return NextResponse.json({ error: resumeErr.message }, { status: 500 });
        }
        return NextResponse.json({ matches: byResume ?? [] });
      }
      if (/user_id/i.test(error.message)) {
        return NextResponse.json({
          matches: [],
          warning: "Run SQL migration 004_security_rls_auth.sql",
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If user_id filter returned empty but we have a resume, also try resume_id
    // (covers matches written before user_id was set)
    if ((data?.length ?? 0) === 0 && resumeId) {
      const { data: byResume } = await supabase
        .from("job_matches")
        .select("*, jobs(*)")
        .eq("resume_id", resumeId)
        .gte("score", minScore)
        .order("score", { ascending: false })
        .limit(80);
      if (byResume?.length) {
        return NextResponse.json({ matches: byResume });
      }
    }

    return NextResponse.json({ matches: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load matches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
