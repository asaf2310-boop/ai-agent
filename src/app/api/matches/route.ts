import { NextResponse } from "next/server";
import { isClearedFromPool } from "@/lib/apply-email";
import { requireUser } from "@/lib/auth";
import { hasActiveJobLink } from "@/lib/linkedin-url";
import {
  buildPoolMatches,
  DEFAULT_POOL_FILTERS,
  POOL_LIMIT,
  sortMatchesByBestFit,
  uniqueLocations,
  type MatchPoolFilters,
} from "@/lib/match-pool";
import {
  isFamilyMismatchForResume,
  shouldExcludeJob,
} from "@/lib/matching";
import { matchResumeToJobs } from "@/lib/pipeline";
import { extractResumeSignals } from "@/lib/resume-extract";
import { createAdminClient } from "@/lib/supabase/admin";
import type { JobMatch, Resume } from "@/lib/types";
import { canAutoSendJob } from "@/lib/web-apply";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function parseFilters(searchParams: URLSearchParams): MatchPoolFilters {
  const kind = (searchParams.get("kind") || "all") as MatchPoolFilters["kind"];
  const postedWithin = (searchParams.get("postedWithin") ||
    "all") as MatchPoolFilters["postedWithin"];
  const allowedKinds = new Set([
    "all",
    "job",
    "freelance",
    "social",
    "linkedin",
    "board",
  ]);
  const allowedWithin = new Set(["all", "1", "3", "7", "30", "custom"]);

  return {
    kind: allowedKinds.has(kind) ? kind : "all",
    location: searchParams.get("location") || "",
    query: searchParams.get("q") || searchParams.get("query") || "",
    postedWithin: allowedWithin.has(postedWithin) ? postedWithin : "all",
    postedFrom: searchParams.get("postedFrom") || "",
    postedTo: searchParams.get("postedTo") || "",
  };
}

/** Active pool: matches not yet sent and not yet opened via link. */
export async function GET(request: Request) {
  try {
    const { user, response } = await requireUser();
    if (!user || response) return response!;

    const { searchParams } = new URL(request.url);
    const resumeId = searchParams.get("resumeId");
    const filters = parseFilters(searchParams);
    const minScore = Number(
      searchParams.get("minScore") || process.env.MIN_MATCH_SCORE || "0.42",
    );

    const supabase = createAdminClient();

    // Load resume signals so we can drop family-mismatched rows written by older scrapers
    let signals = null as ReturnType<typeof extractResumeSignals> | null;
    let resumeRow: Resume | null = null;
    try {
      let resumeQ = supabase
        .from("resumes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (resumeId) {
        resumeQ = supabase
          .from("resumes")
          .select("*")
          .eq("user_id", user.id)
          .eq("id", resumeId)
          .limit(1);
      } else {
        resumeQ = supabase
          .from("resumes")
          .select("*")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1);
      }
      const { data: resumes } = await resumeQ;
      resumeRow = (resumes?.[0] || null) as Resume | null;
      if (resumeRow) {
        const text =
          resumeRow.extracted_text ||
          (resumeRow.skills || []).join(" ") ||
          resumeRow.filename;
        signals = extractResumeSignals(text, resumeRow.skills || []);
      }
    } catch {
      // best-effort — still return score-filtered matches
    }

    let query = supabase
      .from("job_matches")
      .select("*, jobs(*)")
      .eq("user_id", user.id)
      .gte("score", minScore)
      .order("score", { ascending: false })
      .limit(400);

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
        .limit(400);
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
        .limit(400);
      data = byResume;
    }

    const matches = data ?? [];

    let clearedJobIds = new Set<string>();
    try {
      // All dismissals / sends for this user (any resume) must hide the job
      const { data: apps } = await supabase
        .from("applications")
        .select("job_id, status, method")
        .eq("user_id", user.id)
        .limit(500);
      clearedJobIds = new Set(
        (apps || [])
          .filter((a) => isClearedFromPool(a))
          .map((a) => a.job_id)
          .filter(Boolean),
      );
    } catch {
      // if applications query fails, return unfiltered matches
    }

    let available = sortMatchesByBestFit(
      matches.filter((m) => {
        const job = m.jobs;
        if (clearedJobIds.has(m.job_id) || clearedJobIds.has(job?.id || "")) {
          return false;
        }
        if (!hasActiveJobLink(job)) return false;
        if (canAutoSendJob(job)) return false;
        if (job && shouldExcludeJob(job)) return false;
        if (job && signals && isFamilyMismatchForResume(job, signals)) {
          return false;
        }
        return true;
      }),
    );

    // Stale/empty pool after matcher upgrades — rematch from jobs already in DB
    if (available.length === 0 && resumeRow) {
      try {
        const rematched = (await matchResumeToJobs(
          supabase,
          resumeRow,
          minScore,
          user.id,
        )) as JobMatch[];
        available = sortMatchesByBestFit(
          rematched.filter((m) => {
            const job = m.jobs;
            if (
              clearedJobIds.has(m.job_id) ||
              clearedJobIds.has(job?.id || "")
            ) {
              return false;
            }
            if (!hasActiveJobLink(job)) return false;
            if (canAutoSendJob(job)) return false;
            if (job && shouldExcludeJob(job)) return false;
            return true;
          }),
        );
      } catch {
        // keep empty pool — client will prompt to scan
      }
    }

    const hasServerFilters =
      filters.kind !== DEFAULT_POOL_FILTERS.kind ||
      Boolean(filters.location.trim()) ||
      Boolean(filters.query.trim()) ||
      filters.postedWithin !== DEFAULT_POOL_FILTERS.postedWithin ||
      Boolean(filters.postedFrom) ||
      Boolean(filters.postedTo);

    // Without query-param filters: return a wide active set so the client can
    // filter (kind/date/location) before capping at POOL_LIMIT (50).
    const pool = hasServerFilters
      ? buildPoolMatches(available, filters, POOL_LIMIT, signals)
      : available.slice(0, 200);

    return NextResponse.json({
      matches: pool,
      locations: uniqueLocations(available),
      poolCount: available.length,
      shown: Math.min(pool.length, POOL_LIMIT),
      poolLimit: POOL_LIMIT,
      hiddenClearedCount: matches.length - available.length,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load matches";
    const he =
      /Missing NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE/i.test(message)
        ? "חסרים הגדרות Supabase בשרת"
        : /Failed to fetch|fetch failed|ECONN|timeout|aborted/i.test(message)
          ? "הטעינה נכשלה — בדוק חיבור ונסה שוב"
          : message === "Failed to load matches"
            ? "טעינת המשרות נכשלה"
            : message;
    return NextResponse.json({ error: he }, { status: 500 });
  }
}
