import { NextResponse } from "next/server";
import { wasSentToEmployer } from "@/lib/apply-email";
import { getDailyAutoApplyUsage } from "@/lib/daily-quota";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureSampleJobs,
  matchResumeToJobs,
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
  // Vercel Cron also sends this header when CRON_SECRET is configured
  const vercel = request.headers.get("x-vercel-cron-secret") || "";
  return vercel === secret;
}

/**
 * Twice-daily (and on-demand) auto-apply for all users with an active resume.
 * Fills up to DAILY_AUTO_APPLY_QUOTA (default 20) successful sends per user / Israel day.
 * Successful sends are persisted to applications history (job-email / web-form).
 */
async function runAutoApplyCron() {
  const supabase = createAdminClient();

  await ensureSampleJobs(supabase);
  await syncLiveSocialJobs(supabase);
  await syncDrushimJobs(supabase);
  await syncCompanyCareerJobs(supabase);
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

  // One active resume per user (newest first already)
  const byUser = new Map<string, Resume>();
  for (const row of resumes || []) {
    const r = row as Resume;
    if (!r.user_id) continue;
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, r);
  }

  const results: Array<{
    userId: string;
    resumeId: string;
    quotaUsedBefore: number;
    quotaRemainingBefore: number;
    sentThisRun: number;
    matches: number;
  }> = [];

  for (const [userId, resume] of byUser) {
    const usage = await getDailyAutoApplyUsage(supabase, userId);
    if (usage.remaining <= 0) {
      results.push({
        userId,
        resumeId: resume.id,
        quotaUsedBefore: usage.used,
        quotaRemainingBefore: 0,
        sentThisRun: 0,
        matches: 0,
      });
      continue;
    }

    const matches = await matchResumeToJobs(
      supabase,
      resume,
      undefined,
      userId,
    );
    const applications = await processApplicationsForResume(
      supabase,
      resume,
      matches,
      userId,
      null,
    );
    const sentThisRun = applications.filter((a) =>
      wasSentToEmployer(a as { status: string; method?: string | null }),
    ).length;

    results.push({
      userId,
      resumeId: resume.id,
      quotaUsedBefore: usage.used,
      quotaRemainingBefore: usage.remaining,
      sentThisRun,
      matches: matches.length,
    });
  }

  const totalSent = results.reduce((n, r) => n + r.sentThisRun, 0);
  return NextResponse.json({
    ok: true,
    usersProcessed: results.length,
    totalSent,
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
