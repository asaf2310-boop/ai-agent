export type TailorResult = {
  insights: string;
  tailoredCv: string;
  usedAi: boolean;
  provider: "local" | "groq" | "gemini" | "openai";
};

const SKILL_LEXICON = [
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
  "flask",
  "sql",
  "postgres",
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "supabase",
  "aws",
  "gcp",
  "azure",
  "docker",
  "kubernetes",
  "k8s",
  "git",
  "linux",
  "java",
  "c#",
  "golang",
  "go",
  "rust",
  "html",
  "css",
  "tailwind",
  "graphql",
  "rest",
  "ci/cd",
  "agile",
  "scrum",
  "figma",
  "selenium",
  "playwright",
  "pytest",
  "jest",
  "fastapi",
  "express",
  "nestjs",
  "vue",
  "angular",
  "php",
  "laravel",
  "spark",
  "airflow",
  "kafka",
  "terraform",
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractKeywords(text: string): string[] {
  const lower = normalize(text);
  const found = SKILL_LEXICON.filter((skill) => lower.includes(skill));
  return [...new Set(found.map((s) => (s === "nextjs" ? "next.js" : s === "nodejs" ? "node" : s === "postgresql" ? "postgres" : s)))];
}

function extractJobRequirements(jobDescription: string, jobTitle: string): string[] {
  const blob = `${jobTitle}\n${jobDescription}`;
  const skills = extractKeywords(blob);

  // Also pull short noun-ish phrases from bullets / lines
  const lines = jobDescription
    .split(/[\n•\-–—|]/)
    .map((l) => l.trim())
    .filter((l) => l.length > 12 && l.length < 120)
    .slice(0, 8);

  return [...skills, ...lines];
}

function pickRelevantResumeSentences(resumeText: string, required: string[]): string[] {
  const sentences = resumeText
    .split(/[\n.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  const scored = sentences.map((sentence) => {
    const lower = normalize(sentence);
    const hits = required.filter((r) => lower.includes(normalize(r))).length;
    return { sentence, hits };
  });

  const relevant = scored
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((s) => s.sentence)
    .slice(0, 12);

  if (relevant.length >= 3) return relevant;

  // Fallback: first meaningful paragraphs
  return resumeText
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30)
    .slice(0, 10);
}

/** Local tailor — no API key, no quota. */
export function localTailor(input: {
  resumeText: string;
  jobTitle: string;
  jobCompany?: string | null;
  jobDescription?: string | null;
}): TailorResult {
  const description = input.jobDescription || "";
  const required = extractJobRequirements(description, input.jobTitle);
  const resumeSkills = extractKeywords(input.resumeText);
  const matched = required.filter((r) =>
    resumeSkills.some((s) => normalize(r).includes(s) || normalize(input.resumeText).includes(normalize(r))),
  );
  const missing = required
    .filter((r) => SKILL_LEXICON.includes(normalize(r)))
    .filter((r) => !matched.some((m) => normalize(m) === normalize(r)))
    .slice(0, 6);

  const insightsParts = [
    `המשרה "${input.jobTitle}"${input.jobCompany ? ` ב-${input.jobCompany}` : ""} מדגישה: ${
      required.filter((r) => r.length < 40).slice(0, 8).join(", ") || "ניסיון כללי בתפקיד"
    }.`,
  ];
  if (matched.length) {
    insightsParts.push(`התאמה מהקו״ח שלך: ${matched.slice(0, 8).join(", ")}.`);
  }
  if (missing.length) {
    insightsParts.push(`פערים אפשריים לציין ביושר: ${missing.join(", ")}.`);
  }

  const relevantBits = pickRelevantResumeSentences(input.resumeText, required);
  const tailoredCv = [
    `קו״ח מותאם למשרה: ${input.jobTitle}${input.jobCompany ? ` · ${input.jobCompany}` : ""}`,
    "",
    "סיכום ממוקד למגייס:",
    `מועמד/ת עם התאמה לדרישות המשרה${matched.length ? ` (${matched.slice(0, 6).join(", ")})` : ""}.`,
    "גרסה זו מדגישה את החלקים הרלוונטיים מהניסיון הקיים — בלי להמציא ניסיון חדש.",
    "",
    "מיומנויות רלוונטיות להדגשה:",
    matched.length ? matched.slice(0, 12).join(" · ") : resumeSkills.slice(0, 12).join(" · ") || "—",
    "",
    "קטעים מהקו״ח שכדאי להבליט:",
    ...relevantBits.map((s) => `• ${s}`),
    "",
    "טיוטת פנייה קצרה:",
    `שלום, ראיתי את המשרה "${input.jobTitle}" והניסיון שלי ב-${
      matched.slice(0, 3).join(", ") || "התחום"
    } מתאים לדרישות. אשמח לשתף קו״ח מפורט ולתאם שיחה.`,
    "",
    "———",
    "קו״ח מלא (מקור):",
    input.resumeText.slice(0, 4500),
  ].join("\n");

  return {
    insights: insightsParts.join(" "),
    tailoredCv,
    usedAi: false,
    provider: "local",
  };
}

async function callChatJson(input: {
  url: string;
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<{ insights?: string; tailored_cv?: string } | null> {
  const res = await fetch(input.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an Israeli career coach. Rewrite resumes to match jobs without inventing experience. Return JSON only: {\"insights\":\"...\",\"tailored_cv\":\"...\"}",
        },
        { role: "user", content: input.prompt },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw) as { insights?: string; tailored_cv?: string };
  } catch {
    return null;
  }
}

async function callGeminiJson(input: {
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<{ insights?: string; tailored_cv?: string } | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${input.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text:
                "Return JSON only with keys insights and tailored_cv. " +
                input.prompt,
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  try {
    return JSON.parse(raw) as { insights?: string; tailored_cv?: string };
  } catch {
    return null;
  }
}

/**
 * Default: local (free, no quota).
 * Optional free AI: GROQ_API_KEY (recommended) or GEMINI_API_KEY.
 * OpenAI only if OPENAI_API_KEY is set (often paid / rate-limited).
 */
export async function tailorResumeForJob(input: {
  resumeText: string;
  jobTitle: string;
  jobCompany?: string | null;
  jobDescription?: string | null;
}): Promise<TailorResult> {
  const base = localTailor(input);
  const prompt = `משרה: ${input.jobTitle}
חברה: ${input.jobCompany || "לא צוין"}
תיאור:
${input.jobDescription || "אין"}

קו״ח מקורי:
${input.resumeText.slice(0, 8000)}

החזר JSON: {"insights":"...","tailored_cv":"..."}`;

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const parsed = await callChatJson({
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: groqKey,
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      prompt,
    });
    if (parsed?.insights || parsed?.tailored_cv) {
      return {
        insights: parsed.insights || base.insights,
        tailoredCv: parsed.tailored_cv || base.tailoredCv,
        usedAi: true,
        provider: "groq",
      };
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (geminiKey) {
    const parsed = await callGeminiJson({
      apiKey: geminiKey,
      model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
      prompt,
    });
    if (parsed?.insights || parsed?.tailored_cv) {
      return {
        insights: parsed.insights || base.insights,
        tailoredCv: parsed.tailored_cv || base.tailoredCv,
        usedAi: true,
        provider: "gemini",
      };
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const parsed = await callChatJson({
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: openaiKey,
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      prompt,
    });
    if (parsed?.insights || parsed?.tailored_cv) {
      return {
        insights: parsed.insights || base.insights,
        tailoredCv: parsed.tailored_cv || base.tailoredCv,
        usedAi: true,
        provider: "openai",
      };
    }
  }

  return base;
}
