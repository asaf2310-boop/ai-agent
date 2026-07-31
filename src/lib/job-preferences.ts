/**
 * Learn from «לא מעוניין» dismissals — down-rank / hide similar jobs.
 */

import { detectJobFamilies, tokenize } from "@/lib/matching";
import type { Job } from "@/lib/types";
import type { RoleFamily } from "@/lib/resume-extract";

export type RejectionProfile = {
  dismissedJobIds: Set<string>;
  familyCounts: Map<RoleFamily, number>;
  companyCounts: Map<string, number>;
  titleTokenCounts: Map<string, number>;
  titles: string[];
};

type FeedbackRow = {
  job_id?: string | null;
  title?: string | null;
  company?: string | null;
  families?: string[] | null;
  keywords?: string[] | null;
  jobs?: {
    id?: string;
    title?: string | null;
    company?: string | null;
    description?: string | null;
  } | null;
};

const emptyProfile = (): RejectionProfile => ({
  dismissedJobIds: new Set(),
  familyCounts: new Map(),
  companyCounts: new Map(),
  titleTokenCounts: new Map(),
  titles: [],
});

function bump(map: Map<string, number>, key: string, n = 1) {
  const k = key.trim().toLowerCase();
  if (!k) return;
  map.set(k, (map.get(k) || 0) + n);
}

/** Signals stored when the user dismisses a job. */
export function buildDismissSignals(job: {
  id?: string;
  title?: string | null;
  company?: string | null;
  description?: string | null;
  location?: string | null;
}): {
  title: string;
  company: string | null;
  families: RoleFamily[];
  keywords: string[];
} {
  const title = (job.title || "").trim();
  const haystack = [job.title, job.description, job.company, job.location]
    .filter(Boolean)
    .join(" ");
  const families = detectJobFamilies(haystack);
  const keywords = [...tokenize(title)].slice(0, 12);
  return {
    title,
    company: job.company?.trim() || null,
    families,
    keywords,
  };
}

function ingestRow(profile: RejectionProfile, row: FeedbackRow) {
  const jobId = row.job_id || row.jobs?.id;
  if (jobId) profile.dismissedJobIds.add(jobId);

  const title = row.title || row.jobs?.title || "";
  const company = row.company || row.jobs?.company || "";
  if (title) profile.titles.push(title.toLowerCase());

  const families =
    row.families?.length
      ? row.families
      : detectJobFamilies(
          [title, row.jobs?.description, company].filter(Boolean).join(" "),
        );
  for (const f of families) {
    profile.familyCounts.set(
      f as RoleFamily,
      (profile.familyCounts.get(f as RoleFamily) || 0) + 1,
    );
  }

  if (company) bump(profile.companyCounts, company);

  const tokens = row.keywords?.length
    ? row.keywords
    : [...tokenize(title)];
  for (const t of tokens.slice(0, 12)) bump(profile.titleTokenCounts, t);
}

/**
 * Load dismiss preferences. Prefer job_feedback table; fall back to
 * applications marked link-opened (existing «הסר מהפול» rows).
 */
export async function loadRejectionProfile(
  supabase: { from: (t: string) => any },
  userId: string | null | undefined,
): Promise<RejectionProfile> {
  const profile = emptyProfile();
  if (!userId) return profile;

  try {
    const { data, error } = await supabase
      .from("job_feedback")
      .select("job_id, title, company, families, keywords")
      .eq("user_id", userId)
      .in("feedback", ["dismiss", "not_interested"])
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error && data?.length) {
      for (const row of data as FeedbackRow[]) ingestRow(profile, row);
      return profile;
    }
  } catch {
    // table may not exist yet
  }

  try {
    const { data } = await supabase
      .from("applications")
      .select("job_id, skip_reason, jobs(id, title, company, description)")
      .eq("user_id", userId)
      .eq("method", "link-opened")
      .order("updated_at", { ascending: false })
      .limit(100);
    for (const row of (data || []) as FeedbackRow[]) {
      ingestRow(profile, row);
    }
  } catch {
    // ignore
  }

  return profile;
}

export async function recordJobDismissal(
  supabase: { from: (t: string) => any },
  input: {
    userId: string;
    resumeId?: string | null;
    jobId: string;
    job: {
      title?: string | null;
      company?: string | null;
      description?: string | null;
      location?: string | null;
    };
  },
): Promise<void> {
  const signals = buildDismissSignals({ id: input.jobId, ...input.job });
  try {
    const { error } = await supabase.from("job_feedback").insert({
      user_id: input.userId,
      resume_id: input.resumeId || null,
      job_id: input.jobId,
      feedback: "not_interested",
      title: signals.title || null,
      company: signals.company,
      families: signals.families,
      keywords: signals.keywords,
    });
    if (error && /job_feedback|schema cache|does not exist/i.test(error.message)) {
      // Migration 005 not applied — learning still works via applications fallback
      return;
    }
  } catch {
    // best-effort
  }
}

/**
 * Adjust match score using dismiss history.
 * Returns reject=true when the job should not enter the pool at all.
 */
export function applyRejectionPreference(
  score: number,
  reasons: string[],
  job: Pick<Job, "id" | "title" | "description" | "company" | "location">,
  profile: RejectionProfile,
): { score: number; reasons: string[]; reject: boolean } {
  if (!profile.dismissedJobIds.size && !profile.familyCounts.size) {
    return { score, reasons, reject: false };
  }

  if (profile.dismissedJobIds.has(job.id)) {
    return {
      score: 0,
      reasons: ["הוסר בעבר — לא מוצג"],
      reject: true,
    };
  }

  let next = score;
  const nextReasons = [...reasons];
  const haystack = [job.title, job.description, job.company, job.location]
    .filter(Boolean)
    .join(" ");
  const jobFamilies = detectJobFamilies(haystack);
  const titleTokens = tokenize(job.title || "");

  const companyKey = (job.company || "").trim().toLowerCase();
  if (companyKey && (profile.companyCounts.get(companyKey) || 0) >= 1) {
    next -= 0.25;
    nextReasons.push("חברה שסומנה כלא רלוונטית");
  }
  if (companyKey && (profile.companyCounts.get(companyKey) || 0) >= 2) {
    return {
      score: 0,
      reasons: ["חברה שנחסמה אחרי כמה הסרות"],
      reject: true,
    };
  }

  let familyHits = 0;
  let strongFamily = 0;
  for (const f of jobFamilies) {
    const c = profile.familyCounts.get(f) || 0;
    if (c >= 1) familyHits += 1;
    if (c >= 2) strongFamily = Math.max(strongFamily, c);
  }
  if (strongFamily >= 2) {
    next -= 0.18 * Math.min(strongFamily, 4);
    nextReasons.push("סוג משרה שסומן כלא מעוניין");
  }

  let tokenOverlap = 0;
  for (const t of titleTokens) {
    const c = profile.titleTokenCounts.get(t) || 0;
    if (c >= 1) tokenOverlap += 1;
  }
  if (tokenOverlap >= 2) {
    next -= 0.12 * Math.min(tokenOverlap, 4);
    nextReasons.push("כותרת דומה למשרות שהסרת");
  }

  // Hard hide: strongly rejected family + similar title wording
  if (strongFamily >= 3 && tokenOverlap >= 2) {
    return {
      score: 0,
      reasons: ["משרה דומה לכאלה שסימנת «לא מעוניין»"],
      reject: true,
    };
  }

  // Very similar title to a dismissed one
  const titleLower = (job.title || "").toLowerCase();
  for (const prev of profile.titles.slice(0, 40)) {
    if (!prev || prev.length < 8) continue;
    if (titleLower === prev || titleLower.includes(prev) || prev.includes(titleLower)) {
      return {
        score: 0,
        reasons: ["כותרת זהה/דומה למשרה שהוסרה"],
        reject: true,
      };
    }
  }

  next = Math.max(0, Number(next.toFixed(4)));
  if (next < 0.22 && (familyHits >= 1 || tokenOverlap >= 2)) {
    return {
      score: next,
      reasons: nextReasons.slice(0, 6),
      reject: true,
    };
  }

  return { score: next, reasons: nextReasons.slice(0, 6), reject: false };
}
