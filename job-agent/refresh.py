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
    post_kind: str = "job"  # job | freelance | social
    channel: str | None = None
    is_social: bool = False


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
    """Large Israel catalog across AI / finance / product / management / boards."""
    from israel_jobs_catalog import catalog_board_job_dicts

    return [ScrapedJob(**row) for row in catalog_board_job_dicts()]


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
            "post_kind": job.post_kind,
            "channel": job.channel,
            "is_social": job.is_social,
        }
        for job in jobs
    ]
    result = client.table("jobs").upsert(rows, on_conflict="source,external_id").execute()
    return result.data or []


def tokenize(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-zA-Z+#.\u0590-\u05FF]{2,}", text.lower()) if len(t) > 1}


DOMAIN_TERMS = [
    "ai", "ml", "llm", "machine learning", "product", "מוצר", "roadmap",
    "finance", "פיננסי", "fp&a", "management", "ניהול", "operations",
    "marketing", "שיווק", "growth", "sales", "מכירות", "customer success",
    "python", "javascript", "typescript", "react", "sql", "excel", "agile",
]
DOMAIN_TAGS = {"ai", "product", "finance", "management", "marketing", "sales", "tech"}


def score_match(resume_text: str, skills: list[str], job: dict[str, Any]) -> tuple[float, list[str]]:
    haystack = " ".join(
        filter(
            None,
            [job.get("title"), job.get("description"), job.get("company"), job.get("location")],
        )
    ).lower()
    resume_blob = f"{resume_text} {' '.join(skills)}".lower()
    resume_tokens = tokenize(resume_text)
    job_tokens = tokenize(haystack)

    reasons: list[str] = []
    skill_hits = [s for s in skills if s.lower() in haystack]
    if skill_hits:
        reasons.append(f"skills: {', '.join(skill_hits[:5])}")

    domain_hits = [t for t in DOMAIN_TERMS if t in resume_blob and t in haystack]
    if domain_hits:
        reasons.append(f"domain: {', '.join(domain_hits[:5])}")

    skill_lower = {s.lower() for s in skills}
    tag_hits = [t for t in DOMAIN_TAGS if (t in skill_lower or t in resume_blob) and t in haystack]
    if tag_hits:
        reasons.append(f"tags: {', '.join(tag_hits)}")

    overlap = resume_tokens & job_tokens
    if overlap:
        reasons.append(f"keywords: {', '.join(sorted(list(overlap))[:5])}")

    skill_score = min(1.0, len(skill_hits) / 2)
    domain_score = min(1.0, (len(domain_hits) + len(tag_hits)) / 2)
    overlap_score = min(1.0, len(overlap) / 8)
    title_tokens = tokenize(job.get("title") or "")
    title_score = min(1.0, len(resume_tokens & title_tokens) / 2)
    score = round(
        0.35 * skill_score + 0.3 * domain_score + 0.2 * overlap_score + 0.15 * title_score,
        4,
    )
    if score == 0 and (skill_hits or domain_hits or tag_hits or len(overlap) >= 2):
        score = 0.28
    if (len(domain_hits) >= 2 or tag_hits) and score < 0.32:
        score = 0.32
    if tag_hits and domain_hits and score < 0.38:
        score = 0.38
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
                    **({"user_id": resume["user_id"]} if resume.get("user_id") else {}),
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


def local_tailor(resume_text: str, job: dict[str, Any]) -> tuple[str, str, bool]:
    title = job.get("title") or "המשרה"
    company = job.get("company") or ""
    description = job.get("description") or ""
    lexicon = [
        "python", "javascript", "typescript", "react", "next.js", "node",
        "fastapi", "django", "sql", "postgres", "supabase", "aws", "docker",
        "kubernetes", "git", "linux", "java", "go", "html", "css", "tailwind",
    ]
    blob = f"{title} {description}".lower()
    resume_l = resume_text.lower()
    matched = [s for s in lexicon if s in blob and s in resume_l]
    required = [s for s in lexicon if s in blob]
    missing = [s for s in required if s not in matched]

    insights = f'המשרה "{title}"' + (f" ב-{company}" if company else "") + " מדגישה: "
    insights += ", ".join(required[:8]) if required else "ניסיון כללי בתפקיד"
    insights += "."
    if matched:
        insights += f" התאמה מהקו״ח: {', '.join(matched[:8])}."
    if missing:
        insights += f" פערים אפשריים: {', '.join(missing[:6])}."

    sentences = [s.strip() for s in re.split(r"[\n.!?]+", resume_text) if len(s.strip()) > 20]
    relevant = []
    for s in sentences:
        sl = s.lower()
        if any(m in sl for m in matched) or any(r in sl for r in required):
            relevant.append(s)
        if len(relevant) >= 10:
            break
    if len(relevant) < 3:
        relevant = [p.strip() for p in resume_text.split("\n") if len(p.strip()) > 30][:8]

    tailored = "\n".join(
        [
            f"קו״ח מותאם למשרה: {title}" + (f" · {company}" if company else ""),
            "",
            "סיכום ממוקד למגייס:",
            "מועמד/ת עם התאמה לדרישות — ללא המצאת ניסיון.",
            "",
            "מיומנויות להדגשה:",
            " · ".join(matched[:12] or required[:12] or ["—"]),
            "",
            "קטעים להבליט:",
            *[f"• {s}" for s in relevant],
            "",
            "טיוטת פנייה:",
            f'שלום, ראיתי את המשרה "{title}" והרקע שלי מתאים. אשמח לשתף קו״ח ולתאם שיחה.',
            "",
            "———",
            "קו״ח מלא (מקור):",
            resume_text[:4500],
        ]
    )
    return insights, tailored, False


def openai_compatible_tailor(
    resume_text: str,
    job: dict[str, Any],
    *,
    api_key: str,
    url: str,
    model: str,
) -> tuple[str, str, bool] | None:
    payload = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": "Rewrite resumes for job fit without inventing experience. Return JSON with insights and tailored_cv.",
            },
            {
                "role": "user",
                "content": (
                    'החזר JSON: {"insights":"...","tailored_cv":"..."}\n'
                    f"משרה: {job.get('title')}\nחברה: {job.get('company')}\n"
                    f"תיאור:\n{job.get('description')}\n\nקו״ח:\n{resume_text[:8000]}"
                ),
            },
        ],
    }
    req = urllib.request.Request(
        url,
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
        return parsed.get("insights") or "", parsed.get("tailored_cv") or "", True
    except (urllib.error.URLError, KeyError, json.JSONDecodeError, TimeoutError):
        return None


def tailor_resume(resume_text: str, job: dict[str, Any]) -> tuple[str, str, bool]:
    """Prefer local (free). Optional Groq free tier, then OpenAI if configured."""
    base = local_tailor(resume_text, job)

    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        result = openai_compatible_tailor(
            resume_text,
            job,
            api_key=groq_key,
            url="https://api.groq.com/openai/v1/chat/completions",
            model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
        )
        if result and (result[0] or result[1]):
            return result[0] or base[0], result[1] or base[1], True

    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        result = openai_compatible_tailor(
            resume_text,
            job,
            api_key=openai_key,
            url="https://api.openai.com/v1/chat/completions",
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        )
        if result and (result[0] or result[1]):
            return result[0] or base[0], result[1] or base[1], True

    return base


def openai_tailor(resume_text: str, job: dict[str, Any]) -> tuple[str, str, bool]:
    # Backward-compatible name used by process_applications
    return tailor_resume(resume_text, job)


def send_resend_email(to_email: str, subject: str, body: str) -> tuple[bool, str | None, str]:
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        return False, "RESEND_API_KEY not configured", "none"
    clean_to = normalize_apply_email(to_email)
    if not clean_to:
        return (
            False,
            json.dumps(
                {
                    "statusCode": 422,
                    "name": "validation_error",
                    "message": f"Invalid 'to' field locally: {str(to_email)[:80]}",
                }
            ),
            "resend",
        )
    from_email = os.getenv("APPLICATION_FROM_EMAIL", "onboarding@resend.dev")
    payload = {"from": from_email, "to": [clean_to], "subject": subject, "text": body}
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


_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_INVISIBLE_RE = re.compile(r"[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]")
_BLOCKED_DOMAINS = {
    "example.com",
    "example.org",
    "example.net",
    "test.com",
    "email.com",
    "domain.com",
    "sentry.io",
    "wixpress.com",
}


def normalize_apply_email(raw: str | None) -> str | None:
    """Extract a bare address Resend will accept; drop mailto:/labels/RTL junk."""
    if not raw:
        return None
    text = _INVISIBLE_RE.sub("", str(raw)).strip().lower()
    if text.startswith("mailto:"):
        text = text[7:]
    found = _EMAIL_RE.findall(text)
    for email in found:
        domain = email.split("@")[-1]
        if domain in _BLOCKED_DOMAINS:
            continue
        if email.endswith((".png", ".jpg", ".svg")):
            continue
        if ".." in email or email.startswith(".") or email.endswith("."):
            continue
        if " " in email or "," in email or "<" in email:
            continue
        return email
    return None


def process_applications(client: Client, matches: list[dict[str, Any]]) -> int:
    """Auto-email employers when apply_email exists; otherwise mark not-sent in-app."""
    enable_employer = os.getenv("ENABLE_EMPLOYER_EMAIL", "true").lower() not in (
        "0",
        "false",
        "no",
        "off",
    )
    reply_to = normalize_apply_email(
        os.getenv("CANDIDATE_EMAIL") or os.getenv("APPLICATION_CANDIDATE_EMAIL")
    )
    max_apps = min(int(os.getenv("MAX_APPLICATIONS_PER_RUN", "40")), 60)
    ranked = sorted(matches, key=lambda m: float(m.get("score") or 0), reverse=True)
    written = 0
    for match in ranked[:max_apps]:
        job = match.get("jobs") or {}
        resume = match.get("_resume") or {}
        resume_text = resume.get("extracted_text") or " ".join(resume.get("skills") or [])
        insights, tailored, _ = openai_tailor(resume_text, job)

        apply_email = normalize_apply_email(job.get("apply_email"))
        if not apply_email:
            apply_email = normalize_apply_email(job.get("description"))

        is_social = bool(job.get("is_social")) or str(job.get("source", "")).startswith("social")
        status = "prepared"
        method = "in-app"
        skip_reason = None
        error = None

        if not enable_employer:
            status = "skipped"
            method = "disabled"
            skip_reason = "שליחה אוטומטית כבויה (ENABLE_EMPLOYER_EMAIL=false)"
        elif not apply_email:
            status = "skipped"
            method = "link-only" if is_social else "no-email"
            skip_reason = (
                "לא נשלח — פוסט ברשת. הגשה ידנית דרך הקישור"
                if is_social
                else "לא נשלח — אין מייל הגשה. קו״ח מותאם מוכן להגשה ידנית"
            )
        else:
            body = (
                f"שלום,\n\n"
                f"מצורפת מועמדות למשרה: {job.get('title')}\n"
                f"חברה: {job.get('company')}\n"
                f"קישור: {job.get('url')}\n\n"
                f"סיכום התאמה:\n{insights}\n\n"
                f"קו״ח מותאם:\n{tailored}\n"
            )
            if reply_to:
                body += f"\nליצירת קשר: {reply_to}\n"
            subject = f"מועמדות: {job.get('title')}"
            ok, err, method_name = send_resend_email(apply_email, subject, body)
            if ok:
                status = "sent"
                method = "job-email"
                skip_reason = None
            elif err and "RESEND_API_KEY" in err:
                status = "skipped"
                method = "no-resend"
                skip_reason = "לא נשלח — חסר RESEND_API_KEY"
            elif err and ("Invalid 'to' field" in err or "validation_error" in err):
                status = "failed"
                method = method_name
                error = err
                skip_reason = "לא נשלח — כתובת המייל של המעסיק לא תקינה (פורמט Resend)"
            else:
                status = "failed"
                method = method_name
                error = err
                skip_reason = "לא נשלח — שגיאה בשליחה למעסיק"

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
                **({"user_id": resume["user_id"]} if resume.get("user_id") else {}),
            },
            on_conflict="resume_id,job_id",
        ).execute()
        written += 1
    return written


def run() -> None:
    schema = os.getenv("SUPABASE_SCHEMA", "job_agent")
    min_score = float(os.getenv("MIN_MATCH_SCORE", "0.2"))
    max_age_days = int(os.getenv("MAX_JOB_AGE_DAYS", "7"))

    from linkedin_jobs import prune_old_linkedin_jobs
    from social_scrape import discover_social_jobs

    client = get_supabase(schema)
    jobs = sample_jobs() + discover_social_jobs()
    upserted = upsert_jobs(client, jobs)
    pruned = prune_old_jobs(client, max_age_days)
    pruned_li = prune_old_linkedin_jobs(client, max_age_days)
    matches = refresh_matches(client, min_score, max_age_days)
    applied = process_applications(client, matches)

    social_count = sum(1 for j in jobs if j.is_social)
    linkedin_count = sum(1 for j in jobs if j.source == "linkedin")
    print(
        "refresh ok: "
        f"upserted={len(upserted)} linkedin={linkedin_count} social={social_count} "
        f"pruned={pruned} pruned_linkedin={pruned_li} "
        f"matches_written={len(matches)} applications={applied}"
    )


if __name__ == "__main__":
    run()
