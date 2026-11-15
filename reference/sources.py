"""Job source connectors. Each connector turns one provider's data into the common job
format (see Job). Connectors only use official APIs, public ATS job-board feeds, or the
built-in demo source. There is deliberately no scraping of LinkedIn or Indeed."""
import html
import re
from datetime import datetime, timedelta, timezone

import requests


def strip_html(text):
    text = re.sub(r"<(br|/p|/li|/div|/h\d)[^>]*>", "\n", text or "", flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()


def job(source, external_id, title, company="", location="", salary_min=None, salary_max=None,
        employment_type="", description="", apply_url="", apply_email="", questions=None, posted_at=None):
    return {
        "source": source,
        "external_id": str(external_id),
        "title": (title or "").strip(),
        "company": (company or "").strip(),
        "location": (location or "").strip(),
        "salary_min": int(salary_min) if salary_min else None,
        "salary_max": int(salary_max) if salary_max else None,
        "employment_type": (employment_type or "").strip().lower(),
        "description": strip_html(description),
        "apply_url": apply_url or "",
        "apply_email": apply_email or "",
        "questions": questions or [],
        "posted_at": posted_at,
    }


class Source:
    name = "base"

    def configured(self, cfg):
        return True

    def fetch(self, cfg, query, location):  # pragma: no cover - interface
        raise NotImplementedError


def _get(cfg, url, **kw):
    resp = requests.get(url, timeout=cfg.REQUEST_TIMEOUT, **kw)
    resp.raise_for_status()
    return resp.json()


class Adzuna(Source):
    name = "adzuna"

    def configured(self, cfg):
        return bool(cfg.ADZUNA_APP_ID and cfg.ADZUNA_APP_KEY)

    def fetch(self, cfg, query, location):
        params = {
            "app_id": cfg.ADZUNA_APP_ID,
            "app_key": cfg.ADZUNA_APP_KEY,
            "results_per_page": 50,
            "what": query,
            "content-type": "application/json",
            "max_days_old": 14,
        }
        if location:
            params["where"] = location
        data = _get(cfg, "https://api.adzuna.com/v1/api/jobs/gb/search/1", params=params)
        out = []
        for r in data.get("results", []):
            out.append(job(
                "adzuna", r.get("id"), r.get("title"),
                (r.get("company") or {}).get("display_name"),
                (r.get("location") or {}).get("display_name"),
                r.get("salary_min"), r.get("salary_max"),
                (r.get("contract_time") or "").replace("_", "-"),
                r.get("description"), r.get("redirect_url"), posted_at=r.get("created"),
            ))
        return out


class Reed(Source):
    name = "reed"

    def configured(self, cfg):
        return bool(cfg.REED_API_KEY)

    def fetch(self, cfg, query, location):
        params = {"keywords": query, "resultsToTake": 50}
        if location:
            params["locationName"] = location
        data = _get(cfg, "https://www.reed.co.uk/api/1.0/search", params=params, auth=(cfg.REED_API_KEY, ""))
        out = []
        for r in data.get("results", []):
            out.append(job(
                "reed", r.get("jobId"), r.get("jobTitle"), r.get("employerName"), r.get("locationName"),
                r.get("minimumSalary"), r.get("maximumSalary"), "",
                r.get("jobDescription"), r.get("jobUrl"), posted_at=r.get("date"),
            ))
        return out


def _matches_query(title, description, query):
    words = [w for w in re.split(r"\W+", query.lower()) if len(w) > 2]
    if not words:
        return True
    hay = (title + " " + description[:500]).lower()
    return any(w in hay for w in words)


class Greenhouse(Source):
    """Public job-board feed: https://boards-api.greenhouse.io/v1/boards/<token>/jobs"""
    name = "greenhouse"

    def configured(self, cfg):
        return bool(cfg.GREENHOUSE_BOARDS)

    def fetch(self, cfg, query, location):
        out = []
        for board in cfg.GREENHOUSE_BOARDS:
            data = _get(cfg, "https://boards-api.greenhouse.io/v1/boards/%s/jobs" % board, params={"content": "true"})
            for r in data.get("jobs", []):
                j = job(
                    "greenhouse", "%s:%s" % (board, r.get("id")), r.get("title"), board.replace("-", " ").title(),
                    (r.get("location") or {}).get("name"), description=r.get("content"),
                    apply_url=r.get("absolute_url"), posted_at=r.get("updated_at"),
                )
                if _matches_query(j["title"], j["description"], query):
                    out.append(j)
        return out


class Lever(Source):
    """Public postings feed: https://api.lever.co/v0/postings/<company>?mode=json"""
    name = "lever"

    def configured(self, cfg):
        return bool(cfg.LEVER_COMPANIES)

    def fetch(self, cfg, query, location):
        out = []
        for company in cfg.LEVER_COMPANIES:
            data = _get(cfg, "https://api.lever.co/v0/postings/%s" % company, params={"mode": "json"})
            for r in data if isinstance(data, list) else []:
                cats = r.get("categories") or {}
                j = job(
                    "lever", "%s:%s" % (company, r.get("id")), r.get("text"), company.replace("-", " ").title(),
                    cats.get("location"), employment_type=cats.get("commitment") or "",
                    description=r.get("descriptionPlain") or r.get("description"),
                    apply_url=r.get("hostedUrl") or r.get("applyUrl"),
                )
                if _matches_query(j["title"], j["description"], query):
                    out.append(j)
        return out


class Demo(Source):
    """Offline sample vacancies so the product can be exercised end to end without any keys.
    Titles are clearly marked as demo data. Apply emails use the reserved example.com domain."""
    name = "demo"

    ROWS = [
        ("Python Developer", "Fernhill Software", "Manchester", 45000, 60000, "permanent", "python flask sql postgresql docker aws git agile rest api testing", "careers@fernhill.example.com"),
        ("Senior Backend Engineer", "Calder Payments", "London", 70000, 90000, "permanent", "python django postgresql kubernetes aws terraform ci/cd microservices", "jobs@calder.example.com"),
        ("Data Analyst", "Harbourview Retail", "Leeds", 32000, 40000, "permanent", "sql excel power bi tableau data analysis stakeholder management", ""),
        ("Junior Web Developer", "Pixelmill Studio", "Remote", 28000, 34000, "permanent", "javascript html css react git agile", "hello@pixelmill.example.com"),
        ("DevOps Engineer", "Stonebridge Cloud", "Birmingham", 55000, 70000, "permanent", "aws docker kubernetes terraform linux ci/cd python", ""),
        ("Software Developer", "Wrenfield Health", "Manchester", 40000, 52000, "permanent", "python sql git agile testing rest api postgresql", "recruit@wrenfield.example.com"),
        ("Customer Support Advisor", "Bluebird Energy", "Glasgow", 24000, 27000, "permanent", "customer service communication microsoft office", "jobs@bluebird.example.com"),
        ("Accounts Assistant", "Marsh & Co", "Bristol", 25000, 29000, "permanent", "accounting excel sage xero bookkeeping", ""),
        ("Machine Learning Engineer", "Quanta Labs", "Cambridge", 65000, 85000, "permanent", "python machine learning pytorch tensorflow pandas numpy sql aws", ""),
        ("Python Developer (Contract)", "Redgate Media", "Manchester", 400, 500, "contract", "python flask aws docker sql", "contracts@redgate.example.com"),
        ("Project Manager", "Larkspur Construction", "Sheffield", 48000, 58000, "permanent", "project management stakeholder management agile jira", ""),
        ("QA Test Engineer", "Ironside Games", "Remote", 35000, 45000, "permanent", "testing selenium python jira agile", "qa-jobs@ironside.example.com"),
    ]
    #  Questions a form would ask; used to exercise the skip-unknown-questions rule.
    QUESTIONS = {
        "Software Developer": ["right_to_work", "notice_period"],
        "Python Developer": ["right_to_work", "salary_expectation"],
        "Senior Backend Engineer": ["right_to_work", "disability_status"],
    }

    def configured(self, cfg):
        return cfg.DEMO_SOURCE

    def fetch(self, cfg, query, location):
        now = datetime.now(timezone.utc)
        out = []
        for i, (title, company, loc, smin, smax, etype, skills, email) in enumerate(self.ROWS):
            desc = (
                "[Demo vacancy] %s at %s. We are looking for someone with experience in: %s. "
                "Please send your CV and a short cover note." % (title, company, skills.replace(" ", ", ", 6))
            )
            out.append(job(
                "demo", "demo-%d" % i, title, company, loc, smin, smax, etype, desc,
                "https://example.com/jobs/%d" % i, email, self.QUESTIONS.get(title, []),
                (now - timedelta(hours=i * 5)).isoformat(),
            ))
        return out


ALL_SOURCES = [Adzuna(), Reed(), Greenhouse(), Lever(), Demo()]
SOURCE_NAMES = [s.name for s in ALL_SOURCES]
