import { NextResponse } from "next/server";
import {
  wasSentToEmployer,
  wasSentToRealEmployer,
  isClearedFromPool,
  isHistoryEntry,
  isJunkApplicationRow,
  isSyntheticApplyEmail,
} from "@/lib/apply-email";
import { requireUser } from "@/lib/auth";
import { getDailyAutoApplyUsage } from "@/lib/daily-quota";
import { POOL_LIMIT, sortMatchesByBestFit } from "@/lib/match-pool";
import { hasActiveJobLink } from "@/lib/linkedin-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildIlBoardSearchQueries, buildLinkedInSearchQueries } from "@/lib/cv-search-queries";
import {
  ensureSampleJobs,
  matchResumeForAutoApply,
  matchResumeToJobs,
  processApplicationsForResume,
  syncCompanyCareerJobs,
  syncIsraeliBoards,
  syncLinkedInJobs,
  syncLiveSocialJobs,
} from "@/lib/pipeline";
import { extractResumeSignals } from "@/lib/resume-extract";
import type { Application, Resume } from "@/lib/types";
import { shouldExcludeJob } from "@/lib/matching";
import { canAutoSendJob } from "@/lib/web-apply";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (!user || response) return response!;

    const body = (await request.json().catch(() => ({}))) as {
      resumeId?: string;
    };

    const supabase = createAdminClient();
    await ensureSampleJobs(supabase);

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
        { error: "לא נמצא קו״ח — העלה קובץ קודם" },
        { status: 400 },
      );
    }

    const resumeText =
      resume.extracted_text ||
      (resume.skills || []).join(" ") ||
      resume.filename;
    const signals = extractResumeSignals(resumeText, resume.skills || []);
    const boardQueries = buildIlBoardSearchQueries(signals);
    const linkedInQueries = buildLinkedInSearchQueries(signals);

    // ATS + boards — time-boxed so Vercel doesn't kill the whole scan
    await withTimeout(syncCompanyCareerJobs(supabase), 45_000, 0);
    await withTimeout(syncLiveSocialJobs(supabase), 35_000, 0);
    await withTimeout(
      syncIsraeliBoards(supabase, { queries: boardQueries, signals }),
      90_000,
      { drushim: 0, alljobs: 0, jobmaster: 0, jobify: 0 },
    );
    await withTimeout(
      syncLinkedInJobs(supabase, { queries: linkedInQueries }),
      45_000,
      0,
    );

    // Ownership check
    if (resume.user_id && resume.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Home button: hunt auto-sendable jobs (email / ATS) and send up to 20
    const autoCandidates = await matchResumeForAutoApply(
      supabase,
      resume,
      user.id,
      80,
    );
    const autoApplications = await processApplicationsForResume(
      supabase,
      resume,
      autoCandidates,
      user.id,
      user.email,
      {
        targetSent: Number(process.env.AUTO_APPLY_PER_RUN || "20"),
        autoSendableOnly: true,
        respectDailyQuota: false,
      },
    );

    // Also refresh pool matches (manual-only jobs for the pool UI)
    const matches = await matchResumeToJobs(
      supabase,
      resume,
      undefined,
      user.id,
    );

    const appRows = autoApplications as Application[];
    const sentCount = appRows.filter((a) =>
      wasSentToEmployer(a as { status: string; method?: string | null }),
    ).length;

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

    // Pool = manual-only (active link, not auto-email / ATS). UI caps at POOL_LIMIT.
    const poolMatches = sortMatchesByBestFit(
      matches.filter(
        (m) =>
          !clearedJobIds.has(m.job_id) &&
          hasActiveJobLink(m.jobs) &&
          !canAutoSendJob(m.jobs) &&
          !(m.jobs && shouldExcludeJob(m.jobs)),
      ),
    ).slice(0, Math.max(POOL_LIMIT, 200));

    const historyApps = appRows.filter((a) => isHistoryEntry(a));
    const dailyQuota = await getDailyAutoApplyUsage(supabase, user.id);

    return NextResponse.json({
      resume,
      matchesCount: poolMatches.length,
      applicationsCount: historyApps.length,
      sentCount,
      autoCandidates: autoCandidates.length,
      resendConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
      notSentCount: 0,
      openedCount: normalizedApps.filter((a) => a.method === "link-opened").length,
      dailyQuota,
      matches: poolMatches,
      applications: historyApps,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "הסריקה נכשלה";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
