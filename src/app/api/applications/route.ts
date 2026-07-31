import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const resumeId = searchParams.get("resumeId");
    const supabase = createAdminClient();

    let query = supabase
      .from("applications")
      .select("*, jobs(*)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (resumeId) {
      query = query.eq("resume_id", resumeId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const applications = data ?? [];
    const summary = {
      total: applications.length,
      sent: applications.filter((a) => a.status === "sent").length,
      prepared: applications.filter((a) => a.status === "prepared").length,
      skipped: applications.filter((a) => a.status === "skipped").length,
      failed: applications.filter((a) => a.status === "failed").length,
    };

    return NextResponse.json({ applications, summary });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load applications";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
