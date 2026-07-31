const KNOWN_SKILLS = [
  "python",
  "javascript",
  "typescript",
  "react",
  "next.js",
  "nextjs",
  "node",
  "nodejs",
  "fastapi",
  "django",
  "sql",
  "postgres",
  "postgresql",
  "supabase",
  "aws",
  "docker",
  "kubernetes",
  "git",
  "linux",
  "java",
  "c#",
  "go",
  "rust",
  "html",
  "css",
  "tailwind",
  "redis",
  "mongodb",
  "graphql",
  "rest",
  "ci/cd",
  "agile",
  "scrum",
];

export function extractSkills(text: string): string[] {
  const lower = text.toLowerCase();
  const found = KNOWN_SKILLS.filter((skill) => lower.includes(skill));
  return [...new Set(found.map((s) => (s === "nextjs" ? "next.js" : s === "nodejs" ? "node" : s === "postgresql" ? "postgres" : s)))];
}

export async function extractResumeText(
  bytes: Buffer,
  filename: string,
  mimeType: string,
): Promise<string | null> {
  const lower = filename.toLowerCase();

  if (mimeType === "text/plain" || lower.endsWith(".txt")) {
    return bytes.toString("utf-8");
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: bytes });
    return result.value?.trim() || null;
  }

  // .doc / pdf: store raw best-effort text sniff
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
    const asLatin = bytes.toString("latin1");
    const strings = asLatin.match(/[\x20-\x7E\u0590-\u05FF]{4,}/g);
    if (strings && strings.length > 5) {
      return strings.slice(0, 400).join(" ");
    }
  }

  return null;
}
