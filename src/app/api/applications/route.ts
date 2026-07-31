import { NextResponse } from "next/server";
import { wasSentToEmployer } from "@/lib/apply-email";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (!user || response) return response!;

    const { searchParams } = new URL(request.url);
    const resumeId = searchParams.get("resumeId");
    const supabase = createAdminClient();

    let query = supabase
      .from("applications")
      .select("*, jobs(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (resumeId) {
      query = query.eq("resume_id", resumeId);
    }

    const { data, error } = await query;
    if (error) {
      if (/user_id/i.test(error.message)) {
        return NextResponse.json({
          applications: [],
          summary: {
            total: 0,
            sent: 0,
            notSent: 0,
            prepared: 0,
            skipped: 0,
            failed: 0,
          },
          warning: "Run SQL migration 004_security_rls_auth.sql",
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const applications = data ?? [];
    const sent = applications.filter((a) => wasSentToEmployer(a)).length;
    const summary = {
      total: applications.length,
      sent,
      notSent: applications.length - sent,
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
