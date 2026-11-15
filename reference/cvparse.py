"""CV text extraction and structuring. AI first (if configured), heuristic fallback."""
import io
import re

from . import ai
from .skills import canonical, find_skills

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?:\+44\s?\(?0?\)?|\(?0)\d[\d\s().-]{8,13}\d")
MONTH = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
DATE = r"(?:%s\.?\s+\d{4}|\d{1,2}/\d{4}|\d{4})" % MONTH
DATE_RANGE_RE = re.compile(
    r"(%s)\s*(?:-|–|—|to)\s*(%s|Present|Current|Now|Ongoing)" % (DATE, DATE), re.I
)
BULLET_RE = re.compile(r"^\s*(?:[-•*▪●◦‣·]|\d+[.)])\s+")

SECTION_HEADINGS = {
    "summary": ["summary", "profile", "personal statement", "about me", "professional summary", "career objective", "objective"],
    "experience": ["experience", "work experience", "employment", "employment history", "work history", "professional experience", "career history"],
    "education": ["education", "qualifications", "education and qualifications", "academic background"],
    "skills": ["skills", "technical skills", "key skills", "core skills", "skills and tools", "competencies", "technologies"],
    "certifications": ["certifications", "certificates", "training", "courses", "licences", "licenses"],
    "languages": ["languages"],
    "projects": ["projects", "personal projects"],
    "interests": ["interests", "hobbies", "references"],
}


# ---------------------------------------------------------------- extraction
def extract_text(filename, data):
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        import pdfplumber

        parts = []
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages:
                parts.append(page.extract_text() or "")
        text = "\n".join(parts)
        if not text.strip():
            raise ValueError("This PDF has no readable text (it may be a scan). Upload a text PDF or a Word file.")
        return text
    if name.endswith(".docx"):
        import docx

        doc = docx.Document(io.BytesIO(data))
        parts = [p.text for p in doc.paragraphs]
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    parts.append(cell.text)
        text = "\n".join(parts)
        if not text.strip():
            raise ValueError("This Word file is empty.")
        return text
    if name.endswith((".txt", ".md")):
        return data.decode("utf-8", errors="replace")
    raise ValueError("Unsupported file type. Upload a PDF, Word (.docx) or text file.")


# ------------------------------------------------------------- normalisation
def _strs(value):
    out = []
    for item in value or []:
        if isinstance(item, str) and item.strip():
            out.append(item.strip())
    return out


def normalize_profile(p):
    p = p if isinstance(p, dict) else {}
    out = {
        "name": str(p.get("name") or "").strip(),
        "email": str(p.get("email") or "").strip(),
        "phone": str(p.get("phone") or "").strip(),
        "location": str(p.get("location") or "").strip(),
        "headline": str(p.get("headline") or "").strip(),
        "summary": str(p.get("summary") or "").strip(),
        "skills": [],
        "experience": [],
        "education": [],
        "certifications": _strs(p.get("certifications")),
        "languages": _strs(p.get("languages")),
    }
    seen = set()
    for s in _strs(p.get("skills")):
        key = canonical(s)
        if key not in seen:
            seen.add(key)
            out["skills"].append(s)
    for e in p.get("experience") or []:
        if not isinstance(e, dict):
            continue
        item = {
            "title": str(e.get("title") or "").strip(),
            "company": str(e.get("company") or "").strip(),
            "dates": str(e.get("dates") or "").strip(),
            "bullets": _strs(e.get("bullets")),
        }
        if item["title"] or item["company"]:
            out["experience"].append(item)
    for e in p.get("education") or []:
        if not isinstance(e, dict):
            continue
        item = {
            "degree": str(e.get("degree") or "").strip(),
            "institution": str(e.get("institution") or "").strip(),
            "dates": str(e.get("dates") or "").strip(),
        }
        if item["degree"] or item["institution"]:
            out["education"].append(item)
    return out


# ------------------------------------------------------------- heuristic parse
def _heading_of(line):
    clean = re.sub(r"[^A-Za-z& ]", "", line).strip().lower()
    clean = clean.replace("&", "and")
    if not clean or len(clean) > 40:
        return None
    for key, names in SECTION_HEADINGS.items():
        if clean in names:
            return key
    return None


def _split_sections(lines):
    sections = {"header": []}
    current = "header"
    for line in lines:
        h = _heading_of(line) if line.strip() and not BULLET_RE.match(line) else None
        if h:
            current = h
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line)
    return sections


def _split_title_company(text):
    text = text.strip(" ,|-–—\t")
    for sep in (" at ", " | ", " - ", " – ", " — ", ", ", " @ "):
        if sep in text:
            a, b = text.split(sep, 1)
            return a.strip(), b.strip()
    return text, ""


def _parse_experience(lines):
    entries, current, buffer = [], None, []
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        dm = DATE_RANGE_RE.search(line)
        if BULLET_RE.match(line):
            if current is None:
                current = {"title": "", "company": "", "dates": "", "bullets": []}
                entries.append(current)
            current["bullets"].append(BULLET_RE.sub("", line).strip())
            continue
        if dm:
            rest = (line[: dm.start()] + " " + line[dm.end():]).strip(" ,|-–—()\t")
            head = [b for b in buffer if b] + ([rest] if rest else [])
            buffer = []
            title, company = "", ""
            if len(head) >= 2:
                title, company = head[-2], head[-1]
                # "Company" line may come first; swap when the first looks like a company
                if re.search(r"\b(ltd|limited|plc|inc|llc|group|council|nhs|university|bank)\b", title, re.I):
                    title, company = company, title
            elif len(head) == 1:
                title, company = _split_title_company(head[0])
            current = {"title": title, "company": company, "dates": dm.group(0).strip(), "bullets": []}
            entries.append(current)
        else:
            if current is not None and current["bullets"] and line[:1].islower():
                current["bullets"][-1] += " " + line
            else:
                buffer.append(line)
                buffer = buffer[-2:]
                if current is not None and current["bullets"]:
                    current = None
    return entries


def _parse_education(lines):
    out = []
    for raw in lines:
        line = BULLET_RE.sub("", raw).strip()
        if not line:
            continue
        dm = DATE_RANGE_RE.search(line)
        dates = dm.group(0) if dm else ""
        if dm:
            line = (line[: dm.start()] + " " + line[dm.end():]).strip(" ,|-–—()")
        else:
            ym = re.search(r"\b(19|20)\d{2}\b", line)
            if ym:
                dates = ym.group(0)
                line = (line[: ym.start()] + line[ym.end():]).strip(" ,|-–—()")
        parts = [p.strip() for p in re.split(r"\s*[|,–—]\s*|\s+-\s+", line) if p.strip()]
        inst = next((p for p in parts if re.search(r"universit|college|school|institute|academy", p, re.I)), "")
        degree = ", ".join(p for p in parts if p != inst)
        if degree or inst:
            out.append({"degree": degree, "institution": inst, "dates": dates})
    return out


def _parse_list(lines):
    items = []
    for raw in lines:
        line = BULLET_RE.sub("", raw).strip()
        if ":" in line and len(line.split(":", 1)[0]) < 30:
            line = line.split(":", 1)[1]
        for part in re.split(r"[,;|•·]", line):
            part = part.strip(" .")
            if part and len(part) < 60:
                items.append(part)
    return items


def heuristic_parse(text):
    lines = [l.rstrip() for l in text.splitlines()]
    sections = _split_sections(lines)
    header = [l.strip() for l in sections.get("header", []) if l.strip()]
    email = (EMAIL_RE.search(text) or [""])[0] if EMAIL_RE.search(text) else ""
    phone_m = PHONE_RE.search(text)
    name = ""
    for l in header[:4]:
        if "@" not in l and not re.search(r"\d{3}", l) and 2 <= len(l.split()) <= 5:
            name = l
            break
    location = ""
    loc_m = re.search(r"(?:Location|Address)\s*[:\-]\s*(.+)", text, re.I)
    if loc_m:
        location = loc_m.group(1).strip()
    headline = ""
    if name and name in header:
        idx = header.index(name)
        for l in header[idx + 1 : idx + 3]:
            if "@" not in l and not re.search(r"\d{4}", l) and len(l) < 80:
                headline = l
                break
    summary = " ".join(l.strip() for l in sections.get("summary", []) if l.strip())
    skills = _parse_list(sections.get("skills", []))
    detected = find_skills(text)
    have = {canonical(s) for s in skills}
    for s in detected:
        if s not in have:
            skills.append(s)
    return normalize_profile(
        {
            "name": name,
            "email": email,
            "phone": phone_m.group(0).strip() if phone_m else "",
            "location": location,
            "headline": headline,
            "summary": summary,
            "skills": skills,
            "experience": _parse_experience(sections.get("experience", [])),
            "education": _parse_education(sections.get("education", [])),
            "certifications": _parse_list(sections.get("certifications", [])),
            "languages": _parse_list(sections.get("languages", [])),
        }
    )


# ------------------------------------------------------------------ AI parse
AI_SYSTEM = (
    "You extract structured data from CVs. Copy only what is written in the CV. "
    "Never invent employers, dates, qualifications, skills or numbers. Use empty strings or empty lists "
    "when something is not present. Reply with one JSON object only."
)
AI_SCHEMA = (
    '{"name":"","email":"","phone":"","location":"","headline":"","summary":"",'
    '"skills":[""],"experience":[{"title":"","company":"","dates":"","bullets":[""]}],'
    '"education":[{"degree":"","institution":"","dates":""}],"certifications":[""],"languages":[""]}'
)


def _mentioned(text_lower, value):
    value = (value or "").strip().lower()
    return not value or value in text_lower


def _verify_against_text(profile, text):
    """Drop anything the AI returned that is not actually in the CV text."""
    low = re.sub(r"\s+", " ", text.lower())
    flags = []
    exp = []
    for e in profile["experience"]:
        if _mentioned(low, e["company"]) and _mentioned(low, e["title"]):
            exp.append(e)
        else:
            flags.append("Removed experience entry not found in CV text: %s / %s" % (e["title"], e["company"]))
    profile["experience"] = exp
    edu = []
    for e in profile["education"]:
        if _mentioned(low, e["institution"]):
            edu.append(e)
        else:
            flags.append("Removed education entry not found in CV text: %s" % e["institution"])
    profile["education"] = edu
    skills = []
    for s in profile["skills"]:
        if s.lower() in low or canonical(s) in low:
            skills.append(s)
        else:
            flags.append("Removed skill not found in CV text: %s" % s)
    profile["skills"] = skills
    return profile, flags


def parse_cv(conn, cfg, user_id, text):
    """Return (profile, parsed_by, flags)."""
    try:
        data = ai.chat_json(
            conn,
            cfg,
            AI_SYSTEM,
            "Return JSON in exactly this shape:\n%s\n\nCV text:\n%s" % (AI_SCHEMA, text[:15000]),
            "cv_parse",
            user_id,
        )
        profile = normalize_profile(data)
        profile, flags = _verify_against_text(profile, text)
        if profile["experience"] or profile["skills"]:
            if not profile["email"]:
                m = EMAIL_RE.search(text)
                profile["email"] = m.group(0) if m else ""
            return profile, "ai", flags
    except ai.AIUnavailable:
        pass
    return heuristic_parse(text), "heuristic", []
