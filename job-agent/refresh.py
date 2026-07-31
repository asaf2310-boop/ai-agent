from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from dotenv import load_dotenv
from supabase import Client, ClientOptions, create_client

load_dotenv()


@dataclass
class ScrapedJob:
    source: str
    external_id: str
    title: str
    company: str | None
    location: str | None
    url: str | None
    description: str | None
    posted_at: datetime | None
    apply_email: str | None = None


def env(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default)
    if value is None or value == "":
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def get_supabase(schema: str) -> Client:
    return create_client(
        env("SUPABASE_URL"),
        env("SUPABASE_SERVICE_ROLE_KEY"),
        options=ClientOptions(schema=schema),
    )


def sample_jobs() -> list[ScrapedJob]:
    now = datetime.now(timezone.utc)
    return [
        ScrapedJob(
            source="sample",
            external_id="il-fe-001",
            title="Frontend Engineer",
            company="Example Labs",
            location="Tel Aviv",
            url="https://example.com/jobs/fe-001",
            description="React, TypeScript, Next.js. Build product UI for Israeli startups.",
            posted_at=now - timedelta(days=1),
        ),
        ScrapedJob(
            source="sample",
            external_id="il-be-002",
            title="Backend Developer",
            company="Negev Data",
            location="Remote - Israel",
            url="https://example.com/jobs/be-002",
            description="Python, FastAPI, PostgreSQL, Supabase. APIs and data pipelines.",
            posted_at=now - timedelta(days=2),
        ),
        ScrapedJob(
            source="sample",
            external_id="il-fs-003",
            title="Full Stack Developer",
            company="Coastline AI",
            location="Haifa",
            url="https://example.com/jobs/fs-003",
            description="Node, React, Docker, AWS. End-to-end product ownership.",
            posted_at=now - timedelta(hours=12),
        ),
    ]


def upsert_jobs(client: Client, jobs: list[ScrapedJob]) -> list[dict[str, Any]]:
    rows = [
        {
            "source": job.source,
            "external_id": job.external_id,
            "title": job.title,
            "company": job.company,
            "location": job.location,
            "url": job.url,
            "description": job.description,
            "apply_email": job.apply_email,
            "posted_at": job.posted_at.isoformat() if job.posted_at else None,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
        }
        for job in jobs
    ]
    result = client.table("jobs").upsert(rows, on_conflict="source,external_id").execute()
    return result.data or []


def tokenize(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-zA-Z+#.\u0590-\u05FF]{2,}", text.lower()) if len(t) > 1}


def score_match(resume_text: str, skills: list[str], job: dict[str, Any]) -> tuple[float, list[str]]:
    haystack = " ".join(
        filter(
            None,
            [job.get("title"), job.get("description"), job.get("company"), job.get("location")],
        )
    ).lower()
    resume_tokens = tokenize(resume_text)
    job_tokens = tokenize(haystack)

    reasons: list[str] = []
    skill_hits = [s for s in skills if s.lower() in haystack]
    if skill_hits:
        reasons.append(f"skills: {', '.join(skill_hits[:5])}")

    overlap = resume_tokens & job_tokens
    if overlap:
        reasons.append(f"keywords: {', '.join(sorted(list(overlap))[:5])}")

    skill_score = min(1.0, len(skill_hits) / 3)
    overlap_score = min(1.0, len(overlap) / 10)
    title_tokens = tokenize(job.get("title") or "")
    title_score = min(1.0, len(resume_tokens & title_tokens) / 2)
    score = round(0.55 * skill_score + 0.3 * overlap_score + 0.15 * title_score, 4)
    if score == 0 and (skill_hits or len(overlap) >= 2):
        score = 0.36
    if not reasons:
        reasons.append("partial profile overlap" if score > 0 else "weak lexical overlap")
    return score, reasons


def refresh_matches(client: Client, min_score: float, max_age_days: int) -> list[dict[str, Any]]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    resumes = client.table("resumes").select("*").execute().data or []
    jobs = (
        client.table("jobs")
        .select("*")
        .gte("scraped_at", cutoff.isoformat())
        .execute()
        .data
        or []
    )

    written: list[dict[str, Any]] = []
    for resume in resumes:
        resume_text = resume.get("extracted_text") or " ".join(resume.get("skills") or [])
        skills = resume.get("skills") or []
        rows = []
        for job in jobs:
            score, reasons = score_match(resume_text, skills, job)
            if score < min_score:
                continue
            rows.append(
                {
                    "resume_id": resume["id"],
                    "job_id": job["id"],
                    "score": score,
                    "reasons": reasons,
                }
            )
        if not rows:
            continue
        result = (
            client.table("job_matches")
            .upsert(rows, on_conflict="resume_id,job_id")
            .select("*, jobs(*)")
            .execute()
        )
        for row in result.data or []:
            row["_resume"] = resume
            written.append(row)
    return written


def prune_old_jobs(client: Client, max_age_days: int) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    result = client.table("jobs").delete().lt("scraped_at", cutoff.isoformat()).execute()
    return len(result.data or [])


def openai_tailor(resume_text: str, job: dict[str, Any]) -> tuple[str, str, bool]:
    insights = f"המשרה מדגישה: {job.get('title')}. {(job.get('description') or '')[:220]}"
    tailored = (
        f"גרסת קו״ח מותאמת למשרה: {job.get('title')}\n\n"
        f"סיכום ממוקד לפי הדרישות.\n\n{resume_text[:3500]}"
    )
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return insights, tailored, False

    payload = {
        "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "Rewrite resumes for job fit. Return JSON with insights and tailored_cv.",
            },
            {
                "role": "user",
                "content": (
                    "החזר JSON: {\"insights\":\"...\",\"tailored_cv\":\"...\"}\n"
                    f"משרה: {job.get('title')}\nחברה: {job.get('company')}\n"
                    f"תיאור:\n{job.get('description')}\n\nקו״ח:\n{resume_text[:8000]}"
                ),
            },
        ],
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        return (
            parsed.get("insights") or insights,
            parsed.get("tailored_cv") or tailored,
            True,
        )
    except (urllib.error.URLError, KeyError, json.JSONDecodeError, TimeoutError):
        return insights, tailored, False


def send_resend_email(to_email: str, subject: str, body: str) -> tuple[bool, str | None, str]:
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        return False, "RESEND_API_KEY not configured", "none"
    from_email = os.getenv("APPLICATION_FROM_EMAIL", "onboarding@resend.dev")
    payload = {"from": from_email, "to": [to_email], "subject": subject, "text": body}
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
        return True, None, "resend"
    except urllib.error.HTTPError as exc:
        return False, exc.read().decode("utf-8", errors="ignore"), "resend"
    except urllib.error.URLError as exc:
        return False, str(exc.reason), "resend"


def process_applications(client: Client, matches: list[dict[str, Any]]) -> int:
    notify = os.getenv("APPLICATION_NOTIFY_EMAIL")
    written = 0
    for match in matches:
        job = match.get("jobs") or {}
        resume = match.get("_resume") or {}
        resume_text = resume.get("extracted_text") or " ".join(resume.get("skills") or [])
        insights, tailored, _ = openai_tailor(resume_text, job)

        apply_email = job.get("apply_email")
        target = apply_email or notify
        status = "prepared"
        method = "prepared"
        skip_reason = None
        error = None

        body = (
            f"מועמדות אוטומטית: {job.get('title')}\n"
            f"חברה: {job.get('company')}\nקישור: {job.get('url')}\n\n"
            f"מה המגייס מחפש:\n{insights}\n\nקו״ח מותאם:\n{tailored}"
        )

        if not target:
            status = "skipped"
            method = "none"
            skip_reason = "אין apply_email ואין APPLICATION_NOTIFY_EMAIL"
        else:
            ok, err, method_name = send_resend_email(
                target,
                f"AI Agent · {job.get('title')}",
                body,
            )
            if ok:
                status = "sent"
                method = "job-email" if apply_email else "notify-email"
            elif err and "RESEND_API_KEY" in err:
                status = "prepared"
                method = "prepared"
                skip_reason = "אין RESEND_API_KEY — הקו״ח הותאם ונשמר בדוח"
            else:
                status = "failed"
                method = method_name
                error = err

        client.table("applications").upsert(
            {
                "resume_id": resume["id"],
                "job_id": job["id"],
                "match_id": match.get("id"),
                "status": status,
                "method": method,
                "skip_reason": skip_reason,
                "recruiter_insights": insights,
                "tailored_cv_text": tailored,
                "error": error,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="resume_id,job_id",
        ).execute()
        written += 1
    return written


def run() -> None:
    schema = os.getenv("SUPABASE_SCHEMA", "job_agent")
    min_score = float(os.getenv("MIN_MATCH_SCORE", "0.3"))
    max_age_days = int(os.getenv("MAX_JOB_AGE_DAYS", "7"))

    client = get_supabase(schema)
    jobs = sample_jobs()
    upserted = upsert_jobs(client, jobs)
    pruned = prune_old_jobs(client, max_age_days)
    matches = refresh_matches(client, min_score, max_age_days)
    applied = process_applications(client, matches)

    print(
        "refresh ok: "
        f"upserted={len(upserted)} pruned={pruned} "
        f"matches_written={len(matches)} applications={applied}"
    )


if __name__ == "__main__":
    run()
