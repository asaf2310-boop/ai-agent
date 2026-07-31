import { NextResponse } from "next/server";
import {
  wasSentToRealEmployer,
  isClearedFromPool,
  isHistoryEntry,
  isJunkApplicationRow,
  isSyntheticApplyEmail,
} from "@/lib/apply-email";
import { requireUser } from "@/lib/auth";
import { POOL_LIMIT, sortMatchesByNewest } from "@/lib/match-pool";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureSampleJobs,
  matchResumeToJobs,
  processApplicationsForResume,
  syncLinkedInJobs,
  syncLiveSocialJobs,
} from "@/lib/pipeline";
import type { Application, Resume } from "@/lib/types";

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
    await syncLinkedInJobs(supabase);

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
      user.email,
    );

    const appRows = applications as Application[];
    const sentCount = appRows.filter((a) => wasSentToRealEmployer(a)).length;

    // Also exclude previously cleared jobs (sent / link-opened) from pool
    const { data: allApps } = await supabase
      .from("applications")
      .select("id, job_id, status, method, jobs(apply_email)")
      .eq("user_id", user.id)
      .eq("resume_id", resume.id)
      .limit(300);

    const normalizeApp = (a: {
      id: string;
      job_id: string;
      status: string;
      method: string | null;
      jobs:
        | { apply_email?: string | null }
        | { apply_email?: string | null }[]
        | null;
    }) => {
      const jobs = Array.isArray(a.jobs) ? a.jobs[0] ?? null : a.jobs;
      return { ...a, jobs };
    };

    const normalizedApps = (allApps || []).map(normalizeApp);

    // Clean junk history rows left from older synthetic sends / failures
    const junk = normalizedApps.filter((a) => isJunkApplicationRow(a));
    if (junk.length) {
      try {
        await supabase
          .from("applications")
          .delete()
          .in(
            "id",
            junk.map((j) => j.id).filter(Boolean),
          );
      } catch {
        // best-effort
      }
    }

    const clearedJobIds = new Set(
      normalizedApps
        .filter(
          (a) =>
            isClearedFromPool(a) &&
            !isJunkApplicationRow(a) &&
            !isSyntheticApplyEmail(a.jobs?.apply_email),
        )
        .map((a) => a.job_id)
        .filter(Boolean),
    );
    for (const a of appRows) {
      if (isClearedFromPool(a) && wasSentToRealEmployer(a)) {
        clearedJobIds.add(a.job_id);
      } else if (a.method === "link-opened") {
        clearedJobIds.add(a.job_id);
      }
    }

    const poolMatches = sortMatchesByNewest(
      matches.filter((m) => !clearedJobIds.has(m.job_id)),
    ).slice(0, POOL_LIMIT);

    const historyApps = appRows.filter((a) => isHistoryEntry(a));

    return NextResponse.json({
      resume,
      matchesCount: poolMatches.length,
      applicationsCount: historyApps.length,
      sentCount,
      notSentCount: 0,
      openedCount: normalizedApps.filter((a) => a.method === "link-opened").length,
      matches: poolMatches,
      applications: historyApps,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pipeline failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
