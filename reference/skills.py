"""Shared vocabulary for skill extraction. Used when the AI is unavailable and to
cross-check AI output."""
import re

# Canonical skill -> list of aliases (all lowercase). Kept deliberately broad but not huge.
SKILLS = {
    "python": ["python"], "java": ["java"], "javascript": ["javascript", "js", "ecmascript"],
    "typescript": ["typescript"], "c#": ["c#", "c sharp"], "c++": ["c++"], "golang": ["golang"],
    "ruby": ["ruby"], "php": ["php"], "swift": ["swift"], "kotlin": ["kotlin"], "rust": ["rust"],
    "sql": ["sql", "t-sql", "pl/sql"], "postgresql": ["postgresql", "postgres"], "mysql": ["mysql"],
    "mongodb": ["mongodb", "mongo"], "redis": ["redis"], "react": ["react", "react.js", "reactjs"],
    "angular": ["angular"], "vue": ["vue", "vue.js"], "node.js": ["node.js", "nodejs", "node"],
    "django": ["django"], "flask": ["flask"], "fastapi": ["fastapi"], ".net": [".net", "dotnet"],
    "spring": ["spring boot", "spring"], "html": ["html", "html5"], "css": ["css", "css3", "sass"],
    "aws": ["aws", "amazon web services"], "azure": ["azure"], "gcp": ["gcp", "google cloud"],
    "docker": ["docker"], "kubernetes": ["kubernetes", "k8s"], "terraform": ["terraform"],
    "linux": ["linux"], "git": ["git", "github", "gitlab"], "ci/cd": ["ci/cd", "jenkins", "github actions"],
    "rest apis": ["restful", "rest api", "rest apis"], "graphql": ["graphql"],
    "machine learning": ["machine learning", "ml"], "data analysis": ["data analysis", "data analytics"],
    "data science": ["data science"], "pandas": ["pandas"], "numpy": ["numpy"], "tensorflow": ["tensorflow"],
    "pytorch": ["pytorch"], "power bi": ["power bi", "powerbi"], "tableau": ["tableau"], "excel": ["excel"],
    "agile": ["agile", "scrum", "kanban"], "jira": ["jira"], "devops": ["devops"],
    "testing": ["unit testing", "test automation", "pytest", "selenium", "jest", "qa"],
    "project management": ["project management", "prince2", "pmp"], "stakeholder management": ["stakeholder management", "stakeholders"],
    "leadership": ["leadership", "team lead", "line management"], "communication": ["communication skills", "communication"],
    "customer service": ["customer service", "customer support", "customer care"], "sales": ["sales", "business development"],
    "marketing": ["marketing", "seo", "ppc", "content marketing"], "social media": ["social media"],
    "accounting": ["accounting", "bookkeeping", "accounts payable", "accounts receivable"],
    "financial reporting": ["financial reporting", "management accounts"], "payroll": ["payroll"],
    "sage": ["sage"], "xero": ["xero"], "quickbooks": ["quickbooks"], "sap": ["sap"],
    "salesforce": ["salesforce"], "hubspot": ["hubspot"], "recruitment": ["recruitment", "talent acquisition"],
    "hr": ["human resources", "hr"], "nursing": ["nursing", "nmc"], "teaching": ["teaching", "qts"],
    "logistics": ["logistics", "supply chain", "warehouse"], "cad": ["autocad", "cad", "solidworks"],
    "cybersecurity": ["cybersecurity", "cyber security", "infosec", "penetration testing"],
    "networking": ["networking", "cisco", "ccna", "tcp/ip"], "windows server": ["windows server", "active directory"],
    "ui/ux": ["ux", "ui design", "figma", "wireframing"], "copywriting": ["copywriting"],
    "gdpr": ["gdpr", "data protection"], "compliance": ["compliance", "regulatory"],
    "microsoft office": ["microsoft office", "powerpoint", "office 365", "microsoft 365"],
}

_ALIAS_TO_SKILL = {}
for _skill, _aliases in SKILLS.items():
    for _alias in _aliases + [_skill]:
        _ALIAS_TO_SKILL[_alias] = _skill


def _pattern(alias):
    esc = re.escape(alias)
    # word-ish boundaries that also work for c++, c#, .net
    return r"(?<![A-Za-z0-9+#.])" + esc + r"(?![A-Za-z0-9+#])"


_PATTERNS = [(alias, skill, re.compile(_pattern(alias), re.I)) for alias, skill in _ALIAS_TO_SKILL.items()]


def find_skills(text):
    """Return the canonical skills mentioned in free text, in order of first appearance."""
    found = {}
    for alias, skill, pat in _PATTERNS:
        m = pat.search(text or "")
        if m and (skill not in found or m.start() < found[skill]):
            found[skill] = m.start()
    return [s for s, _ in sorted(found.items(), key=lambda kv: kv[1])]


def canonical(skill):
    s = (skill or "").strip().lower()
    return _ALIAS_TO_SKILL.get(s, s)
