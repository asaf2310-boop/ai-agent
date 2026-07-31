"use client";

import { useState } from "react";
import type { Application, JobMatch, Resume } from "@/lib/types";

type Props = {
  onUploaded: (
    resume: Resume,
    meta?: { matches?: JobMatch[]; applications?: Application[] },
  ) => void;
};

export function ResumeUpload({ onUploaded }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const res = await fetch("/api/resumes", {
        method: "POST",
        body,
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Upload failed");
      }

      onUploaded(json.resume as Resume, {
        matches: json.matches,
        applications: json.applications,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-[var(--muted)]">
          העלאת קורות חיים (PDF / DOCX / TXT)
        </span>
        <input
          type="file"
          accept=".pdf,.txt,.doc,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleChange}
          disabled={busy}
          className="block w-full cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-[var(--accent)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white disabled:opacity-60"
        />
      </label>
      {busy && (
        <p className="text-sm text-[var(--muted)]">
          מעלה, מחלץ טקסט, מתאים משרות ומשכתב קו״ח…
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
