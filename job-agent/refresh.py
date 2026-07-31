from __future__ import annotations

import os
import re
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
    """Placeholder scrape — replace with real job boards later."""
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
            "posted_at": job.posted_at.isoformat() if job.posted_at else None,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
        }
        for job in jobs
    ]
    result = client.table("jobs").upsert(rows, on_conflict="source,external_id").execute()
    return result.data or []


def tokenize(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-zA-Z+#.]{2,}", text.lower()) if len(t) > 1}


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

    skill_score = min(1.0, len(skill_hits) / max(3, 1))
    overlap_score = min(1.0, len(overlap) / 12)
    score = round(0.65 * skill_score + 0.35 * overlap_score, 4)
    if not reasons and score == 0:
        reasons.append("weak lexical overlap")
    return score, reasons


def refresh_matches(client: Client, min_score: float, max_age_days: int) -> int:
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

    written = 0
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
        client.table("job_matches").upsert(rows, on_conflict="resume_id,job_id").execute()
        written += len(rows)
    return written


def prune_old_jobs(client: Client, max_age_days: int) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    result = client.table("jobs").delete().lt("scraped_at", cutoff.isoformat()).execute()
    return len(result.data or [])


def run() -> None:
    schema = os.getenv("SUPABASE_SCHEMA", "job_agent")
    min_score = float(os.getenv("MIN_MATCH_SCORE", "0.35"))
    max_age_days = int(os.getenv("MAX_JOB_AGE_DAYS", "7"))

    client = get_supabase(schema)
    jobs = sample_jobs()
    upserted = upsert_jobs(client, jobs)
    pruned = prune_old_jobs(client, max_age_days)
    matched = refresh_matches(client, min_score, max_age_days)

    print(
        f"refresh ok: upserted={len(upserted)} pruned={pruned} matches_written={matched}"
    )


if __name__ == "__main__":
    run()
