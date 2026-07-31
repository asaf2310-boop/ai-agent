"use client";

import { useState } from "react";
import {
  buildAutofillBookmarklet,
  buildAutofillFields,
  extractCandidateProfile,
} from "@/lib/candidate-profile";

type Props = {
  resumeText: string | null | undefined;
  skills?: string[];
  jobTitle?: string | null;
  jobCompany?: string | null;
  jobUrl?: string | null;
  tailoredCvText?: string | null;
  resumeId?: string | null;
  compact?: boolean;
};

export function AutofillKit({
  resumeText,
  skills = [],
  jobTitle,
  jobCompany,
  jobUrl,
  tailoredCvText,
  resumeId,
  compact = false,
}: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [dlBusy, setDlBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const profile = extractCandidateProfile(resumeText, skills);
  const fields = buildAutofillFields(profile, {
    title: jobTitle,
    company: jobCompany,
  });
  const bookmarklet = buildAutofillBookmarklet(fields);

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setMessage("ההעתקה נכשלה — סמן ידנית");
    }
  }

  async function copyAll() {
    const blob = fields.map((f) => `${f.label}: ${f.value}`).join("\n");
    await copyText("all", blob);
  }

  function downloadTailored() {
    const text =
      tailoredCvText ||
      [
        profile.fullName || "",
        profile.email || "",
        profile.phone || "",
        "",
        profile.summary || "",
        "",
        (resumeText || "").slice(0, 8000),
      ].join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cv-tailored-${(jobCompany || "job").replace(/\s+/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadOriginal() {
    setDlBusy(true);
    setMessage(null);
    try {
      const qs = resumeId ? `?resumeId=${encodeURIComponent(resumeId)}` : "";
      const res = await fetch(`/api/resumes/download${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "הורדה נכשלה");
      window.open(json.url as string, "_blank", "noopener,noreferrer");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "הורדה נכשלה");
    } finally {
      setDlBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">מילוי אוטומטי מתוך הקו״ח</h4>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copyAll()}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--background)]"
          >
            {copied === "all" ? "הועתק ✓" : "העתק את כל השדות"}
          </button>
          <button
            type="button"
            onClick={downloadTailored}
            className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--background)]"
          >
            הורד קו״ח מותאם
          </button>
          <button
            type="button"
            onClick={() => void downloadOriginal()}
            disabled={dlBusy}
            className="rounded-md bg-[var(--accent)] px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
          >
            {dlBusy ? "…" : "הורד קו״ח מקורי לצירוף"}
          </button>
        </div>
      </div>

      <p className="text-xs text-[var(--muted)]">
        {compact
          ? "העתק שדות לטופס באתר, או הורד קו״ח לצירוף בשדה Upload."
          : "כשהגשה אוטומטית מהשרת לא אפשרית (LinkedIn Easy Apply וכו׳) — פתח את הטופס, השתמש בבוקמרקלט למילוי+שליחה, וצרף את קובץ הקו״ח."}
      </p>

      {jobUrl && (
        <p className="text-xs">
          <a
            href={jobUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
          >
            פתח דף הגשה ↗
          </a>
        </p>
      )}

      <ul className="space-y-2">
        {fields.map((f) => (
          <li
            key={f.key}
            className="flex flex-wrap items-start justify-between gap-2 text-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[var(--muted)]">{f.label}</p>
              <p className="break-words">{f.value}</p>
            </div>
            <button
              type="button"
              onClick={() => void copyText(f.key, f.value)}
              className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--background)]"
            >
              {copied === f.key ? "✓" : "העתק"}
            </button>
          </li>
        ))}
      </ul>

      {fields.length === 0 && (
        <p className="text-xs text-[var(--muted)]">
          לא זוהו שדות מהקו״ח — ודא שיש טקסט מחולץ (PDF סרוק עלול לא להיקרא).
        </p>
      )}

      {!compact && (
        <div className="space-y-1 border-t border-[var(--border)] pt-3">
          <p className="text-xs font-medium">בוקמרקלט למילוי בדף ההגשה</p>
          <p className="text-xs text-[var(--muted)]">
            גרור לסימניות, פתח את טופס המשרה באתר, ולחץ על הסימנייה — ימלא שדות
            נפוצים ויציע ללחוץ על כפתור ההגשה.
          </p>
          <a
            href={bookmarklet}
            className="inline-block rounded-md border border-dashed border-[var(--accent)] px-3 py-2 text-xs font-medium text-[var(--accent)]"
            onClick={(e) => {
              e.preventDefault();
              setMessage(
                "גרור את הכפתור לשורת הסימניות בדפדפן (אל תלחץ כאן). אחר כך השתמש בסימנייה בדף ההגשה.",
              );
            }}
          >
            ✦ מלא טופס מהקו״ח (AI Agent)
          </a>
        </div>
      )}

      {message && <p className="text-xs text-[var(--muted)]">{message}</p>}
    </div>
  );
}
