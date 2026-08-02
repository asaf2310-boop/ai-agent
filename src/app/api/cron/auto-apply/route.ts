import { NextResponse } from "next/server";
import { wasSentToEmployer } from "@/lib/apply-email";
import { getDailyAutoApplyUsage } from "@/lib/daily-quota";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureSampleJobs,
  matchResumeForAutoApply,
  processApplicationsForResume,
  syncCompanyCareerJobs,
  syncDrushimJobs,
  syncLinkedInJobs,
  syncLiveSocialJobs,
} from "@/lib/pipeline";
import type { Resume } from "@/lib/types";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  if (auth === `Bearer ${secret}`) return true;
  const vercel = request.headers.get("x-vercel-cron-secret") || "";
  if (vercel === secret) return true;
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("secret") === secret) return true;
  } catch {
    // ignore
  }
  return false;
}

/**
 * Twice-daily (and on-demand) auto-apply for all users with an active resume.
 * Each run targets up to AUTO_APPLY_PER_RUN (default 20) successful sends
 * (email or ATS web-form) into History.
 */
async function runAutoApplyCron() {
  const supabase = createAdminClient();
  const targetSent = Math.min(
    Number(process.env.AUTO_APPLY_PER_RUN || "20"),
    40,
  );

  await ensureSampleJobs(supabase);
  // Company ATS boards first — these are what we can actually auto-submit
  const careersSynced = await syncCompanyCareerJobs(supabase);
  await syncLiveSocialJobs(supabase);
  await syncDrushimJobs(supabase);
  await syncLinkedInJobs(supabase);

  const { data: resumes, error } = await supabase
    .from("resumes")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byUser = new Map<string, Resume>();
  for (const row of resumes || []) {
    const r = row as Resume;
    if (!r.user_id) continue;
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, r);
  }

  const resendConfigured = Boolean(process.env.RESEND_API_KEY?.trim());

  const results: Array<{
    userId: string;
    resumeId: string;
    quotaUsedBefore: number;
    quotaRemainingBefore: number;
    sentThisRun: number;
    candidates: number;
    skippedNoResend: number;
    skippedWebFailed: number;
    skippedManual: number;
  }> = [];

  for (const [userId, resume] of byUser) {
    const usage = await getDailyAutoApplyUsage(supabase, userId);

    // Resolve candidate email for Reply-To when possible
    let candidateEmail: string | null = null;
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      candidateEmail = authUser.user?.email || null;
    } catch {
      // optional
    }

    const candidates = await matchResumeForAutoApply(
      supabase,
      resume,
      userId,
      Math.max(targetSent * 4, 60),
    );

    const applications = await processApplicationsForResume(
      supabase,
      resume,
      candidates,
      userId,
      candidateEmail,
      {
        targetSent,
        autoSendableOnly: true,
        // Still respect daily quota for cron, but target a full batch when possible
        respectDailyQuota: true,
      },
    );

    let skippedNoResend = 0;
    let skippedWebFailed = 0;
    let skippedManual = 0;
    for (const a of applications as Array<{
      status?: string;
      method?: string | null;
    }>) {
      if (a.status === "sent") continue;
      if (a.method === "no-resend") skippedNoResend += 1;
      else if (a.method === "no-web-form" || a.method === "link-only") {
        skippedWebFailed += 1;
      } else if (a.method === "manual-only" || a.method === "no-email") {
        skippedManual += 1;
      }
    }

    const sentThisRun = applications.filter((a) =>
      wasSentToEmployer(a as { status: string; method?: string | null }),
    ).length;

    results.push({
      userId,
      resumeId: resume.id,
      quotaUsedBefore: usage.used,
      quotaRemainingBefore: usage.remaining,
      sentThisRun,
      candidates: candidates.length,
      skippedNoResend,
      skippedWebFailed,
      skippedManual,
    });
  }

  const totalSent = results.reduce((n, r) => n + r.sentThisRun, 0);
  const totalCandidates = results.reduce((n, r) => n + r.candidates, 0);

  return NextResponse.json({
    ok: true,
    usersProcessed: results.length,
    totalSent,
    totalCandidates,
    careersSynced,
    targetSent,
    resendConfigured,
    hint: !resendConfigured
      ? "RESEND_API_KEY missing on Vercel — relying on ATS web-form only"
      : totalSent === 0 && totalCandidates === 0
        ? "No auto-sendable matches (email/ATS) for active resumes"
        : totalSent === 0
          ? "Candidates found but email/web-form submits did not succeed"
          : undefined,
    results,
  });
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return await runAutoApplyCron();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return await runAutoApplyCron();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
