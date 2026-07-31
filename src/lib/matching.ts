import type { Job } from "@/lib/types";

export function tokenize(text: string): Set<string> {
  const tokens = text.toLowerCase().match(/[a-zA-Z+#.\u0590-\u05FF]{2,}/g) ?? [];
  return new Set(tokens.filter((t) => t.length > 1));
}

export function scoreMatch(
  resumeText: string,
  skills: string[],
  job: Pick<Job, "title" | "description" | "company" | "location">,
): { score: number; reasons: string[] } {
  const haystack = [job.title, job.description, job.company, job.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const resumeTokens = tokenize(resumeText);
  const jobTokens = tokenize(haystack);
  const reasons: string[] = [];

  const skillHits = skills.filter((s) => haystack.includes(s.toLowerCase()));
  if (skillHits.length) {
    reasons.push(`skills: ${skillHits.slice(0, 5).join(", ")}`);
  }

  const overlap = [...resumeTokens].filter((t) => jobTokens.has(t));
  if (overlap.length) {
    reasons.push(`keywords: ${overlap.slice(0, 5).join(", ")}`);
  }

  const skillScore = Math.min(1, skillHits.length / 3);
  const overlapScore = Math.min(1, overlap.length / 10);
  // Soft floor: title token hit helps a bit
  const titleTokens = tokenize(job.title || "");
  const titleHits = [...titleTokens].filter((t) => resumeTokens.has(t)).length;
  const titleScore = Math.min(1, titleHits / 2);

  let score = Number(
    (0.55 * skillScore + 0.3 * overlapScore + 0.15 * titleScore).toFixed(4),
  );

  // If we have any skill or keyword overlap, don't drop below a usable threshold
  if (score === 0 && (skillHits.length || overlap.length >= 2)) {
    score = 0.36;
  }

  if (!reasons.length) {
    reasons.push(score > 0 ? "partial profile overlap" : "weak lexical overlap");
  }

  return { score, reasons };
}
