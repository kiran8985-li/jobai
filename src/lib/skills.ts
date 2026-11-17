/**
 * Shared skill vocabulary. Used when the AI is unavailable and to cross-check AI output.
 * Canonical skill → aliases (all lowercase). Deliberately broad but not huge.
 */
export const SKILLS: Record<string, string[]> = {
  python: ["python"], java: ["java"], javascript: ["javascript", "js", "ecmascript"],
  typescript: ["typescript"], "c#": ["c#", "c sharp"], "c++": ["c++"], golang: ["golang"],
  ruby: ["ruby"], php: ["php"], swift: ["swift"], kotlin: ["kotlin"], rust: ["rust"],
  sql: ["sql", "t-sql", "pl/sql"], postgresql: ["postgresql", "postgres"], mysql: ["mysql"],
  mongodb: ["mongodb", "mongo"], redis: ["redis"], react: ["react", "react.js", "reactjs"],
  angular: ["angular"], vue: ["vue", "vue.js"], "node.js": ["node.js", "nodejs", "node"],
  django: ["django"], flask: ["flask"], fastapi: ["fastapi"], ".net": [".net", "dotnet"],
  spring: ["spring boot", "spring"], html: ["html", "html5"], css: ["css", "css3", "sass"],
  aws: ["aws", "amazon web services"], azure: ["azure"], gcp: ["gcp", "google cloud"],
  docker: ["docker"], kubernetes: ["kubernetes", "k8s"], terraform: ["terraform"],
  linux: ["linux"], git: ["git", "github", "gitlab"], "ci/cd": ["ci/cd", "jenkins", "github actions"],
  "rest apis": ["restful", "rest api", "rest apis"], graphql: ["graphql"],
  "machine learning": ["machine learning", "ml"], "data analysis": ["data analysis", "data analytics"],
  "data science": ["data science"], pandas: ["pandas"], numpy: ["numpy"], tensorflow: ["tensorflow"],
  pytorch: ["pytorch"], "power bi": ["power bi", "powerbi"], tableau: ["tableau"], excel: ["excel"],
  agile: ["agile", "scrum", "kanban"], jira: ["jira"], devops: ["devops"],
  testing: ["unit testing", "test automation", "pytest", "selenium", "jest", "qa"],
  "project management": ["project management", "prince2", "pmp"],
  "stakeholder management": ["stakeholder management", "stakeholders"],
  leadership: ["leadership", "team lead", "line management"],
  communication: ["communication skills", "communication"],
  "customer service": ["customer service", "customer support", "customer care"],
  sales: ["sales", "business development"],
  marketing: ["marketing", "seo", "ppc", "content marketing"], "social media": ["social media"],
  accounting: ["accounting", "bookkeeping", "accounts payable", "accounts receivable"],
  "financial reporting": ["financial reporting", "management accounts"], payroll: ["payroll"],
  sage: ["sage"], xero: ["xero"], quickbooks: ["quickbooks"], sap: ["sap"],
  salesforce: ["salesforce"], hubspot: ["hubspot"], recruitment: ["recruitment", "talent acquisition"],
  hr: ["human resources", "hr"], nursing: ["nursing", "nmc"], teaching: ["teaching", "qts"],
  logistics: ["logistics", "supply chain", "warehouse"], cad: ["autocad", "cad", "solidworks"],
  cybersecurity: ["cybersecurity", "cyber security", "infosec", "penetration testing"],
  networking: ["networking", "cisco", "ccna", "tcp/ip"],
  "windows server": ["windows server", "active directory"],
  // Design (UI/UX and product design are IT roles for this beta).
  "ui/ux": ["ux", "ui/ux", "ui design", "ux design", "user experience"], figma: ["figma"], sketch: ["sketch"],
  "adobe xd": ["adobe xd"], "adobe creative suite": ["adobe creative suite", "photoshop", "illustrator", "after effects"],
  prototyping: ["prototyping", "prototypes", "prototype"], wireframing: ["wireframing", "wireframes", "wireframe"],
  "user research": ["user research", "ux research", "user interviews"],
  "usability testing": ["usability testing", "user testing"], "design systems": ["design systems", "design system"],
  "interaction design": ["interaction design"], "visual design": ["visual design"], "product design": ["product design"],
  "information architecture": ["information architecture"], accessibility: ["accessibility", "wcag"],
  "a/b testing": ["a/b testing", "a/b tests", "experimentation"], "journey mapping": ["journey mapping", "user journeys", "customer journeys"],
  "motion design": ["motion design"], typography: ["typography"],
  copywriting: ["copywriting"],
  gdpr: ["gdpr", "data protection"], compliance: ["compliance", "regulatory"],
  "microsoft office": ["microsoft office", "powerpoint", "office 365", "microsoft 365"],
};

const ALIAS_TO_SKILL = new Map<string, string>();
for (const [skill, aliases] of Object.entries(SKILLS)) {
  for (const alias of [...aliases, skill]) ALIAS_TO_SKILL.set(alias, skill);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\/#-]/g, "\\$&");
}

// Word-ish boundaries that also work for c++, c# and .net.
const PATTERNS = [...ALIAS_TO_SKILL.entries()].map(([alias, skill]) => ({
  skill,
  re: new RegExp(`(?<![A-Za-z0-9+#.])${escapeRegExp(alias)}(?![A-Za-z0-9+#])`, "i"),
}));

/** Canonical skills mentioned in free text, in order of first appearance. */
export function findSkills(text: string): string[] {
  const found = new Map<string, number>();
  for (const { skill, re } of PATTERNS) {
    const m = re.exec(text || "");
    if (m && (!found.has(skill) || m.index < found.get(skill)!)) found.set(skill, m.index);
  }
  return [...found.entries()].sort((a, b) => a[1] - b[1]).map(([s]) => s);
}

/** Canonical form of a skill name ("Postgres" → "postgresql"); unknown skills are just lowercased. */
export function canonical(skill: string): string {
  const s = (skill || "").trim().toLowerCase();
  return ALIAS_TO_SKILL.get(s) ?? s;
}
