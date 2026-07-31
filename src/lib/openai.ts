import OpenAI from "openai";

export type TailorResult = {
  insights: string;
  tailoredCv: string;
  usedAi: boolean;
};

function heuristicTailor(
  resumeText: string,
  jobTitle: string,
  jobDescription: string,
): TailorResult {
  const insights = [
    `המשרה מדגישה: ${jobTitle}.`,
    jobDescription
      ? `דגשים מהתיאור: ${jobDescription.slice(0, 220)}${jobDescription.length > 220 ? "…" : ""}`
      : "אין תיאור מפורט למשרה.",
  ].join(" ");

  const tailoredCv = [
    `גרסת קו״ח מותאמת למשרה: ${jobTitle}`,
    "",
    "סיכום ממוקד:",
    `מועמד/ת עם רקע רלוונטי לדרישות המשרה. הותאם לפי: ${jobTitle}.`,
    "",
    "תוכן מקורי מהקו״ח:",
    resumeText.slice(0, 3500),
  ].join("\n");

  return { insights, tailoredCv, usedAi: false };
}

export async function tailorResumeForJob(input: {
  resumeText: string;
  jobTitle: string;
  jobCompany?: string | null;
  jobDescription?: string | null;
}): Promise<TailorResult> {
  const key = process.env.OPENAI_API_KEY;
  const base = heuristicTailor(
    input.resumeText,
    input.jobTitle,
    input.jobDescription || "",
  );

  if (!key) return base;

  try {
    const client = new OpenAI({ apiKey: key });
    const prompt = `אתה יועץ קריירה ישראלי. נתח מה המגייס מחפש במשרה, ואז שכתב את קורות החיים כך שיהיו ממוקדים למשרה — בלי להמציא ניסיון שלא קיים בקו״ח.

החזר JSON בלבד במבנה:
{"insights":"...", "tailored_cv":"..."}

משרה: ${input.jobTitle}
חברה: ${input.jobCompany || "לא צוין"}
תיאור:
${input.jobDescription || "אין"}

קו״ח מקורי:
${input.resumeText.slice(0, 8000)}`;

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You rewrite resumes to match job requirements. Output valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as {
      insights?: string;
      tailored_cv?: string;
    };

    return {
      insights: parsed.insights || base.insights,
      tailoredCv: parsed.tailored_cv || base.tailoredCv,
      usedAi: true,
    };
  } catch {
    return base;
  }
}
