import { NextResponse } from "next/server";
import { isClearedFromPool } from "@/lib/apply-email";
import { requireUser } from "@/lib/auth";
import { hasActiveJobLink } from "@/lib/linkedin-url";
import {
  buildPoolMatches,
  DEFAULT_POOL_FILTERS,
  POOL_LIMIT,
  sortMatchesByNewest,
  uniqueLocations,
  type MatchPoolFilters,
} from "@/lib/match-pool";
import { createAdminClient } from "@/lib/supabase/admin";

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
      searchParams.get("minScore") || process.env.MIN_MATCH_SCORE || "0.2",
    );

    const supabase = createAdminClient();

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
      let appsQuery = supabase
        .from("applications")
        .select("job_id, status, method")
        .eq("user_id", user.id);
      if (resumeId) appsQuery = appsQuery.eq("resume_id", resumeId);
      const { data: apps } = await appsQuery.limit(300);
      clearedJobIds = new Set(
        (apps || [])
          .filter((a) => isClearedFromPool(a))
          .map((a) => a.job_id)
          .filter(Boolean),
      );
    } catch {
      // if applications query fails, return unfiltered matches
    }

    const available = sortMatchesByNewest(
      matches.filter(
        (m) => !clearedJobIds.has(m.job_id) && hasActiveJobLink(m.jobs),
      ),
    );

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
      ? buildPoolMatches(available, filters, POOL_LIMIT)
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
