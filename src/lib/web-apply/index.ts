import { resolveEmployerEmail } from "@/lib/apply-email";
import {
  extractCandidateProfile,
  type CandidateProfile,
} from "@/lib/candidate-profile";
import { submitWebApplication, type WebApplyResult } from "@/lib/web-apply/submit";
import {
  canAutoApplyViaAts,
  detectAts,
  resolveApplyPageUrl,
} from "@/lib/web-apply/urls";

export type { WebApplyResult };
export {
  canAutoApplyViaAts,
  detectAts,
  extractExternalApplyUrl,
  isKnownAtsUrl,
  isLinkedInOrSocialUrl,
  isSyntheticJobBoardUrl,
  resolveApplyPageUrl,
} from "@/lib/web-apply/urls";
export { submitWebApplication } from "@/lib/web-apply/submit";

export function isWebApplyEnabled(): boolean {
  return !["false", "0", "no", "off"].includes(
    (process.env.ENABLE_WEB_APPLY || "true").toLowerCase(),
  );
}

/**
 * Server can POST a real ATS form (Greenhouse / Lever / Ashby / …).
 * Generic career pages / LinkedIn Easy Apply → false (manual only).
 */
export function canAutoApplyJob(job: {
  url?: string | null;
  description?: string | null;
  apply_email?: string | null;
  company?: string | null;
}): boolean {
  if (!isWebApplyEnabled()) return false;
  return canAutoApplyViaAts(job);
}

/**
 * True when the daily scan / pipeline can auto-send (employer email or ATS form).
 * Pool UI must exclude these — only manual jobs stay in the pool.
 */
export function canAutoSendJob(job: {
  url?: string | null;
  description?: string | null;
  apply_email?: string | null;
  company?: string | null;
} | null | undefined): boolean {
  if (!job) return false;
  if (resolveEmployerEmail(job)) return true;
  return canAutoApplyJob(job);
}

/** Auto-fill + submit on the job's apply page when an ATS/careers URL exists. */
export async function tryAutoWebApply(input: {
  job: {
    url?: string | null;
    description?: string | null;
    title?: string | null;
    company?: string | null;
  };
  resumeText: string;
  skills?: string[];
  tailoredCv?: string | null;
  insights?: string | null;
  profile?: CandidateProfile | null;
}): Promise<WebApplyResult | null> {
  if (!isWebApplyEnabled()) return null;

  const applyUrl = resolveApplyPageUrl(input.job);
  if (!applyUrl || detectAts(applyUrl) === "unsupported") {
    return {
      ok: false,
      method: "web-form",
      ats: "unsupported",
      detail: "אין קישור טופס הגשה שניתן להגיש אליו אוטומטית",
    };
  }

  const profile =
    input.profile ||
    extractCandidateProfile(input.resumeText, input.skills || []);

  const cover = [
    input.insights,
    input.tailoredCv ? `קו״ח מותאם:\n${input.tailoredCv.slice(0, 3000)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return submitWebApplication({
    applyUrl,
    profile,
    coverLetter: cover || profile.summary,
    resumeText: input.tailoredCv || input.resumeText,
  });
}
