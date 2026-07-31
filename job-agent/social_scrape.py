from __future__ import annotations

import hashlib
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx

from refresh import ScrapedJob

USER_AGENT = "ai-agent-job-scanner/1.0 (+https://github.com/asaf2310-boop/ai-agent)"

FREELANCE_HINTS = re.compile(
    r"freelance|freelancer|contract|contractor|gig|part[- ]?time|"
    r"פרילנס|עצמאי|פרויקט|שעתי|קבלנ",
    re.I,
)

JOB_HINTS = re.compile(
    r"hiring|job|looking for|דרוש|דרושה|מגייסים|משרה|מחפש|מחפשת|"
    r"developer|engineer|react|python|fullstack|full[- ]stack",
    re.I,
)

ISRAEL_POSITIVE = re.compile(
    r"israel|ישראל|tel[\s-]?aviv|תל אביב|jerusalem|ירושלים|haifa|חיפה|"
    r"herzliya|הרצליה|ramat gan|רמת גן|petah|פתח תקווה|רעננה|raanana|"
    r"באר שבע|beer sheva|נתניה|netanya|ראשון|אשדוד|מודעין|"
    r"remote\s*-?\s*israel|israel\s*/\s*remote|\bil\b",
    re.I,
)

ISRAEL_NEGATIVE = re.compile(
    r"united states|\busa\b|nebraska|kearney|new york|california|texas|"
    r"london|united kingdom|\buk\b|germany|berlin|paris|france|india|"
    r"bangalore|canada|toronto|australia|sydney",
    re.I,
)


def is_israel_job(
    location: str | None,
    description: str | None = None,
    company: str | None = None,
) -> bool:
    blob = f"{location or ''} {description or ''} {company or ''}"
    if ISRAEL_POSITIVE.search(blob):
        return True
    if ISRAEL_NEGATIVE.search(blob):
        return False
    if re.search(r"remote|worldwide|anywhere|global", blob, re.I):
        return False
    return False


def _id_from_url(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in (
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%a, %d %b %Y %H:%M:%S %z",
        "%Y-%m-%d",
    ):
        try:
            raw = value.replace("Z", "+0000") if fmt.endswith("%z") and value.endswith("Z") else value
            if fmt.endswith("Z") and value.endswith("Z"):
                return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
            dt = datetime.strptime(raw, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    return None


def sample_social_posts() -> list[ScrapedJob]:
    """LinkedIn-first IL social/freelance posts (+ Telegram/Facebook samples)."""
    from israel_jobs_catalog import catalog_social_post_dicts

    return [ScrapedJob(**row) for row in catalog_social_post_dicts()]


def fetch_remoteok(limit: int = 25) -> list[ScrapedJob]:
    jobs: list[ScrapedJob] = []
    try:
        with httpx.Client(timeout=20.0, headers={"User-Agent": USER_AGENT}) as client:
            resp = client.get("https://remoteok.com/api")
            resp.raise_for_status()
            data = resp.json()
    except Exception:  # noqa: BLE001 — network optional
        return jobs

    for item in data:
        if not isinstance(item, dict) or not item.get("id") or not item.get("position"):
            continue
        location = str(item.get("location") or "")
        description = re.sub("<[^>]+>", " ", str(item.get("description") or ""))[:4000]
        company = item.get("company")
        if not is_israel_job(location, description, str(company or "")):
            continue
        text = " ".join(
            str(item.get(k) or "")
            for k in ("position", "description", "tags", "company", "location")
        )
        if not (FREELANCE_HINTS.search(text) or JOB_HINTS.search(text)):
            continue
        kind = "freelance" if FREELANCE_HINTS.search(text) else "job"
        url = item.get("url") or f"https://remoteok.com/remote-jobs/{item.get('id')}"
        epoch = item.get("epoch") or item.get("date")
        posted = None
        if isinstance(epoch, (int, float)):
            posted = datetime.fromtimestamp(epoch, tz=timezone.utc)
        jobs.append(
            ScrapedJob(
                source="remoteok",
                external_id=str(item["id"]),
                title=str(item["position"]),
                company=company,
                location=location or "Israel",
                url=url,
                description=description,
                posted_at=posted,
                apply_email=None,
                post_kind=kind,
                channel="remoteok",
                is_social=True,
            )
        )
        if len(jobs) >= limit:
            break
    return jobs


def fetch_remotive(limit: int = 25) -> list[ScrapedJob]:
    jobs: list[ScrapedJob] = []
    try:
        with httpx.Client(timeout=20.0, headers={"User-Agent": USER_AGENT}) as client:
            resp = client.get(
                "https://remotive.com/api/remote-jobs",
                params={"category": "software-dev", "limit": limit},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception:  # noqa: BLE001
        return jobs

    for item in data.get("jobs") or []:
        title = item.get("title") or ""
        desc = item.get("description") or ""
        location = item.get("candidate_required_location") or ""
        company = item.get("company_name")
        if not is_israel_job(str(location), desc, str(company or "")):
            continue
        text = f"{title} {desc} {item.get('job_type') or ''}"
        kind = "freelance" if FREELANCE_HINTS.search(text) else "job"
        if kind == "job" and not JOB_HINTS.search(text):
            continue
        url = item.get("url")
        if not url:
            continue
        jobs.append(
            ScrapedJob(
                source="remotive",
                external_id=str(item.get("id") or _id_from_url(url)),
                title=title,
                company=company,
                location=str(location) or "Israel",
                url=url,
                description=re.sub("<[^>]+>", " ", desc)[:4000],
                posted_at=_parse_date(item.get("publication_date")),
                apply_email=None,
                post_kind=kind,
                channel="remotive",
                is_social=True,
            )
        )
    return jobs[:limit]


def fetch_rss_feed(feed_url: str, limit: int = 20) -> list[ScrapedJob]:
    jobs: list[ScrapedJob] = []
    try:
        with httpx.Client(timeout=20.0, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as client:
            resp = client.get(feed_url)
            resp.raise_for_status()
            root = ET.fromstring(resp.text)
    except Exception:  # noqa: BLE001
        return jobs

    host = urlparse(feed_url).netloc.replace("www.", "") or "rss"
    items = root.findall(".//item") or root.findall(".//{http://www.w3.org/2005/Atom}entry")
    for item in items[:limit]:
        def text(tag: str) -> str:
            node = item.find(tag) or item.find(f"{{http://www.w3.org/2005/Atom}}{tag}")
            if node is None or node.text is None:
                return ""
            return node.text.strip()

        title = text("title")
        link = text("link")
        if not link:
            link_el = item.find("{http://www.w3.org/2005/Atom}link")
            if link_el is not None:
                link = link_el.attrib.get("href", "")
        desc = text("description") or text("summary") or text("content")
        blob = f"{title} {desc}"
        if not (FREELANCE_HINTS.search(blob) or JOB_HINTS.search(blob)):
            continue
        if not is_israel_job("Israel", blob, host):
            # RSS items often lack location — require IL keywords in text
            if not ISRAEL_POSITIVE.search(blob):
                continue
        kind = "freelance" if FREELANCE_HINTS.search(blob) else "social"
        jobs.append(
            ScrapedJob(
                source=f"rss-{host}",
                external_id=_id_from_url(link or title),
                title=title or "Social job post",
                company=f"RSS · {host}",
                location="Israel",
                url=link or feed_url,
                description=re.sub("<[^>]+>", " ", desc)[:4000],
                posted_at=_parse_date(text("pubDate") or text("published") or text("updated")),
                apply_email=None,
                post_kind=kind,
                channel=host,
                is_social=True,
            )
        )
    return jobs


def discover_social_jobs() -> list[ScrapedJob]:
    discovered: list[ScrapedJob] = []
    discovered.extend(fetch_remoteok(limit=40))
    discovered.extend(fetch_remotive(limit=40))

    rss_urls = [
        u.strip()
        for u in (os.getenv("SOCIAL_RSS_URLS") or "").split(",")
        if u.strip()
    ]
    for url in rss_urls:
        discovered.extend(fetch_rss_feed(url))

    discovered.extend(sample_social_posts())

    uniq: dict[tuple[str, str], ScrapedJob] = {}
    for job in discovered:
        if not is_israel_job(job.location, job.description, job.company):
            # keep explicit IL social samples
            if not str(job.source).startswith("social"):
                continue
        uniq[(job.source, job.external_id)] = job
    return list(uniq.values())


def jobs_as_rows(jobs: list[ScrapedJob]) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc).isoformat()
    return [
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
            "scraped_at": now,
            "post_kind": getattr(job, "post_kind", "job"),
            "channel": getattr(job, "channel", None),
            "is_social": bool(getattr(job, "is_social", False)),
        }
        for job in jobs
    ]
