"""LinkedIn active jobs — Israel, past 7 days (guest API)."""

from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from html import unescape
from typing import Any
from urllib.parse import urlencode

import httpx

from refresh import ScrapedJob

USER_AGENT = "Mozilla/5.0 (compatible; ai-agent-job-scanner/1.0)"
ISRAEL_GEO = "101620260"
PAST_WEEK = "r604800"

SEARCHES = [
    'AI OR LLM OR "machine learning" OR "data scientist" OR "בינה מלאכותית"',
    '"AI product manager" OR "AI product owner" OR "product manager AI" OR "LLM product" OR "מנהל מוצר AI"',
    "אנליסט OR חשב OR \"הצלחת לקוחות\" OR שיווק OR \"product analyst\"",
    'finance OR fintech OR FP&A OR controller OR "financial analyst" OR פיננסים',
    '"product owner" OR "product marketing" OR "customer success" OR operations',
]

RELEVANT = re.compile(
    r"ai|llm|machine learning|data scientist|data analyst|product|finance|fintech|"
    r"fp&a|controller|analyst|marketing|sales|customer success|"
    r"מוצר|פיננס|בינה|שיווק|מכירות|אנליסט",
    re.I,
)

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")


def _strip(html: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html)
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _parse_list(html: str) -> list[dict[str, Any]]:
    jobs: list[dict[str, Any]] = []
    parts = re.split(r'data-entity-urn="urn:li:jobPosting:', html)[1:]
    for part in parts:
        m_id = re.match(r"(\d+)", part)
        if not m_id:
            continue
        job_id = m_id.group(1)
        title_m = re.search(r"base-search-card__title[^>]*>([\s\S]*?)</h3>", part, re.I)
        company_m = re.search(
            r"base-search-card__subtitle[\s\S]*?<a[^>]*>([\s\S]*?)</a>",
            part,
            re.I,
        )
        loc_m = re.search(r"job-search-card__location[^>]*>([\s\S]*?)</span>", part, re.I)
        href_m = re.search(r'base-card__full-link[^>]*href="([^"]+)"', part, re.I)
        time_m = re.search(r'<time[^>]*datetime="([^"]+)"', part, re.I)
        title = _strip(title_m.group(1)) if title_m else ""
        if not title:
            continue
        href = unescape(href_m.group(1)) if href_m else f"https://www.linkedin.com/jobs/view/{job_id}"
        url = href.split("?")[0]
        jobs.append(
            {
                "id": job_id,
                "title": title,
                "company": _strip(company_m.group(1)) if company_m else "",
                "location": _strip(loc_m.group(1)) if loc_m else "Israel",
                "url": url,
                "posted_at": time_m.group(1) if time_m else None,
            }
        )
    return jobs


def _within_week(posted_at: str | None) -> bool:
    if not posted_at:
        return True
    try:
        dt = datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) - dt <= timedelta(days=7, hours=12)
    except ValueError:
        return True


def _fetch_description(client: httpx.Client, job_id: str) -> str:
    try:
        resp = client.get(
            f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}",
            timeout=8.0,
        )
        if resp.status_code != 200:
            return ""
        html = resp.text
        m = re.search(r"show-more-less-html__markup[\s\S]*?>([\s\S]*?)</div>", html, re.I)
        return _strip(m.group(1) if m else html)[:4000]
    except Exception:  # noqa: BLE001
        return ""


def fetch_linkedin_israel_jobs(max_jobs: int = 80, enrich: int = 20) -> list[ScrapedJob]:
    now = datetime.now(timezone.utc)
    by_id: dict[str, ScrapedJob] = {}
    headers = {"User-Agent": USER_AGENT, "Accept": "text/html"}

    try:
        with httpx.Client(timeout=25.0, headers=headers, follow_redirects=True) as client:
            for keywords in SEARCHES:
                for start in (0, 25):
                    params = {
                        "keywords": keywords,
                        "location": "Israel",
                        "geoId": ISRAEL_GEO,
                        "f_TPR": PAST_WEEK,
                        "start": str(start),
                        "count": "25",
                    }
                    url = (
                        "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?"
                        + urlencode(params)
                    )
                    try:
                        resp = client.get(url)
                        if resp.status_code != 200:
                            continue
                        for item in _parse_list(resp.text):
                            if not _within_week(item.get("posted_at")):
                                continue
                            hay = f"{item['title']} {item['company']} {item['location']}"
                            if not RELEVANT.search(hay):
                                continue
                            if not re.search(r"israel|ישראל|tel aviv|herzliya|haifa|jerusalem", hay, re.I):
                                # guest search is geo-scoped; still require IL signal
                                if "Israel" not in (item.get("location") or ""):
                                    continue
                            posted = None
                            if item.get("posted_at"):
                                try:
                                    posted = datetime.fromisoformat(
                                        item["posted_at"].replace("Z", "+00:00")
                                    )
                                    if posted.tzinfo is None:
                                        posted = posted.replace(tzinfo=timezone.utc)
                                except ValueError:
                                    posted = now
                            else:
                                posted = now

                            by_id[item["id"]] = ScrapedJob(
                                source="linkedin",
                                external_id=item["id"],
                                title=item["title"],
                                company=item["company"] or None,
                                location=item["location"] or "Israel",
                                url=item["url"],
                                description=(
                                    f"LinkedIn · {item['title']} @ {item['company'] or '—'} · "
                                    f"{item['location'] or 'Israel'}"
                                ),
                                posted_at=posted,
                                apply_email=None,
                                post_kind="job",
                                channel="linkedin",
                                is_social=False,
                            )
                            if len(by_id) >= max_jobs:
                                break
                    except Exception:  # noqa: BLE001
                        continue
                    if len(by_id) >= max_jobs:
                        break
                if len(by_id) >= max_jobs:
                    break

            # Enrich descriptions for matching quality
            for job in list(by_id.values())[:enrich]:
                desc = _fetch_description(client, job.external_id)
                if len(desc) > 80:
                    job.description = desc
                    emails = EMAIL_RE.findall(desc)
                    if emails:
                        # Strip RTL/ZW marks that break Resend `to` validation
                        raw = re.sub(
                            r"[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]",
                            "",
                            emails[0],
                        )
                        job.apply_email = raw.lower()
    except Exception:  # noqa: BLE001
        return list(by_id.values())

    return list(by_id.values())


def prune_old_linkedin_jobs(client: Any, max_age_days: int = 7) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    try:
        rows = (
            client.table("jobs")
            .select("id, posted_at, scraped_at")
            .eq("source", "linkedin")
            .limit(500)
            .execute()
            .data
            or []
        )
    except Exception:  # noqa: BLE001
        return 0
    stale: list[str] = []
    for row in rows:
        ts = row.get("posted_at") or row.get("scraped_at")
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt < cutoff:
                stale.append(row["id"])
        except ValueError:
            continue
    if not stale:
        return 0
    try:
        client.table("jobs").delete().in_("id", stale).execute()
    except Exception:  # noqa: BLE001
        return 0
    return len(stale)
