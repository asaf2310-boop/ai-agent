import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const resumeId = searchParams.get("resumeId");
    const minScore = Number(
      searchParams.get("minScore") || process.env.MIN_MATCH_SCORE || "0.35",
    );

    const supabase = createAdminClient();

    let query = supabase
      .from("job_matches")
      .select("*, jobs(*)")
      .gte("score", minScore)
      .order("score", { ascending: false })
      .limit(50);

    if (resumeId) {
      query = query.eq("resume_id", resumeId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ matches: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load matches";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
