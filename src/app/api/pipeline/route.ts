import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureSampleJobs,
  matchResumeToJobs,
  processApplicationsForResume,
  syncLiveSocialJobs,
} from "@/lib/pipeline";
import type { Resume } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (!user || response) return response!;

    const body = (await request.json().catch(() => ({}))) as {
      resumeId?: string;
    };

    const supabase = createAdminClient();
    await ensureSampleJobs(supabase);
    await syncLiveSocialJobs(supabase);

    let resumeQuery = supabase
      .from("resumes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (body.resumeId) {
      resumeQuery = supabase
        .from("resumes")
        .select("*")
        .eq("user_id", user.id)
        .eq("id", body.resumeId)
        .limit(1);
    } else {
      resumeQuery = supabase
        .from("resumes")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);
    }

    const { data: resumes, error } = await resumeQuery;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const resume = (resumes?.[0] || null) as Resume | null;
    if (!resume) {
      return NextResponse.json(
        { error: "No resume found — upload a CV first" },
        { status: 400 },
      );
    }

    // Ownership check
    if (resume.user_id && resume.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const matches = await matchResumeToJobs(
      supabase,
      resume,
      undefined,
      user.id,
    );
    const applications = await processApplicationsForResume(
      supabase,
      resume,
      matches,
      user.id,
    );

    return NextResponse.json({
      resume,
      matchesCount: matches.length,
      applicationsCount: applications.length,
      matches,
      applications,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
