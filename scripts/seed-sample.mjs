// Fills every JobPilot table with clearly fake sample data, through Supabase's API.
// Usage: SB_URL=... SB_KEY=<secret key> node seed-sample.mjs
// Everything is marked: people are "Sample ...", emails @example.com, jobs external_id "sample:...".
// No sample user is left as admin.
import { createHash, randomBytes } from "node:crypto";

const U = process.env.SB_URL, K = process.env.SB_KEY;
if (!U || !K) throw new Error("Set SB_URL and SB_KEY");
const H = { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json" };

async function api(path, method = "GET", body, extra = {}) {
  const r = await fetch(`${U}${path}`, { method, headers: { ...H, ...extra }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}
const insert = (table, rows) => api(`/rest/v1/${table}`, "POST", rows, { Prefer: "return=representation" });
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const ahead = (h) => new Date(Date.now() + h * 3600e3).toISOString();

// ---------- people ----------
const people = [
  { key: "priya", name: "Sample Priya Shah", email: "sample.priya@example.com", headline: "Python Developer",
    skills: ["Python", "Django", "PostgreSQL", "Docker", "AWS", "REST APIs", "Git"],
    exp: [{ title: "Python Developer", company: "Sample Northwind Digital Ltd", dates: "Mar 2021 – Present", bullets: ["Built Django REST APIs used by 40,000 customers.", "Cut page load time by 35% with PostgreSQL query tuning.", "Moved deployments to Docker on AWS ECS."] },
          { title: "Junior Developer", company: "Sample Fernhill Software", dates: "Jul 2019 – Feb 2021", bullets: ["Wrote unit tests with pytest, raising coverage to 80%.", "Maintained internal Flask tools."] }],
    roles: ["Python Developer", "Backend Engineer"], locations: ["Manchester", "Remote"] },
  { key: "tom", name: "Sample Tom Evans", email: "sample.tom@example.com", headline: "Data Analyst",
    skills: ["SQL", "Excel", "Power BI", "Python", "Data Analysis", "Stakeholder Management"],
    exp: [{ title: "Data Analyst", company: "Sample Harbourline Energy", dates: "Jan 2022 – Present", bullets: ["Built Power BI dashboards for 12 regional managers.", "Automated monthly reporting with SQL and Python, saving 2 days a month."] }],
    roles: ["Data Analyst", "BI Analyst"], locations: ["Leeds", "Remote"] },
  { key: "aisha", name: "Sample Aisha Khan", email: "sample.aisha@example.com", headline: "UI/UX Designer",
    skills: ["Figma", "Prototyping", "User Research", "Usability Testing", "Design Systems", "HTML", "CSS"],
    exp: [{ title: "UI/UX Designer", company: "Sample Brightside Studio", dates: "May 2021 – Present", bullets: ["Designed a mobile banking onboarding flow that lifted completion by 18%.", "Ran 25 usability tests and fed findings into the design system."] }],
    roles: ["UI/UX Designer", "Product Designer"], locations: ["London", "Remote"] },
];

const profileJson = (p) => ({
  name: p.name, email: p.email, phone: "07700 900123", location: p.locations[0], headline: p.headline,
  summary: `${p.headline} with hands-on experience in ${p.skills.slice(0, 3).join(", ")}.`,
  skills: p.skills, experience: p.exp, projects: [],
  education: [{ degree: "BSc Computer Science", institution: "Sample University of Leeds", dates: "2016 – 2019" }],
  certifications: [], languages: ["English"],
});

async function main() {
  const users = {};
  for (const p of people) {
    const [inv] = await insert("invites", [{ email: p.email }]);
    const u = await api("/auth/v1/admin/users", "POST", { email: p.email, password: "Sample-pass-" + randomBytes(6).toString("hex"), email_confirm: true, user_metadata: { name: p.name, invite_token: inv.token } });
    users[p.key] = u.id;
  }
  const ids = Object.values(users);
  // No sample user stays admin; all have given AI consent.
  await api(`/rest/v1/profiles_user?id=in.(${ids.join(",")})`, "PATCH", { is_admin: false, ai_consent_at: ago(48) });

  // Open invites and invite requests.
  await insert("invites", [{ email: "sample.waiting1@example.com" }, { email: "sample.waiting2@example.com" }]);
  await insert("invite_requests", [
    { email: "sample.request1@example.com", name: "Sample Ben Carter", handled_at: null, outcome: null },
    { email: "sample.request2@example.com", name: "Sample Chloe Price", handled_at: ago(5), outcome: "invited" },
  ]);

  // CVs, searches, saved answers.
  const cvs = {}, searches = {};
  for (const p of people) {
    const pj = profileJson(p);
    const text = [pj.name, pj.email, pj.headline, pj.summary, "SKILLS", pj.skills.join(", "), "EXPERIENCE", ...pj.experience.flatMap((e) => [e.title, e.company, e.dates, ...e.bullets.map((b) => "• " + b)])].join("\n");
    const [cv] = await insert("cvs", [{ user_id: users[p.key], filename: `${p.name.replace(/ /g, "-")}-CV.pdf`, raw_text: text, profile_json: pj, parsed_by: p.key === "tom" ? "heuristic" : "ai", approved: true }]);
    cvs[p.key] = cv.id;
    const auto = p.key === "priya";
    const [sp] = await insert("search_profiles", [{ user_id: users[p.key], name: `${p.headline} jobs`, roles: p.roles, locations: p.locations, min_salary: 35000, employment_types: ["full-time"], keywords: [], exclude_keywords: ["unpaid"], min_match: 75, daily_limit: 10, auto_apply: auto, consent_at: auto ? ago(30) : null, is_active: true }]);
    searches[p.key] = sp.id;
    await insert("screening_answers", [
      { user_id: users[p.key], key: "right_to_work_uk", answer: "yes" },
      { user_id: users[p.key], key: "notice_period", answer: "1 month" },
      { user_id: users[p.key], key: "salary_expectation", answer: "£40,000 to £50,000" },
      { user_id: users[p.key], key: "current_location", answer: p.locations[0] },
    ]);
  }

  // Jobs (fake companies; email addresses on example.com, where nothing is ever sent).
  const jobRows = [
    ["Python Developer", "Sample Acme Fintech", "Manchester", 45000, 55000, "email", "jobs@acme-fintech.example.com", null, ["Do you have the right to work in the UK?", "What is your notice period?"]],
    ["Backend Engineer (Python)", "Sample Zeta Health", "Remote, UK", 50000, 65000, "ats", null, "https://job-boards.greenhouse.io/sample/jobs/1001", []],
    ["Junior Software Developer", "Sample Riverside Council", "Leeds", 28000, 32000, "manual", null, "https://www.example.com/careers/1002", []],
    ["Data Analyst", "Sample Harbour Retail", "Leeds", 35000, 42000, "email", "careers@harbour-retail.example.com", null, ["Do you have the right to work in the UK?"]],
    ["BI Analyst (Power BI)", "Sample Lumen Logistics", "Remote, UK", 40000, 48000, "manual", null, "https://www.example.com/careers/1004", ["Do you have a disability?"]],
    ["UI/UX Designer", "Sample Pixel & Co", "London", 42000, 52000, "email", "design@pixel-co.example.com", null, ["Please share your portfolio link"]],
    ["Product Designer", "Sample Orbit Bank", "London", 55000, 70000, "ats", null, "https://jobs.lever.co/sample/1006", []],
    ["Senior UX Researcher", "Sample Kite Travel", "London", 60000, 75000, "manual", null, "https://www.example.com/careers/1007", []],
  ];
  const jobs = await insert("jobs", jobRows.map(([title, company, location, smin, smax, method, email, url, questions], i) => ({
    source: "demo", external_id: `sample:${1000 + i}`, title, company, location, salary_min: smin, salary_max: smax, employment_type: "full-time",
    description: `${company} is hiring a ${title}. This is SAMPLE data for testing, not a real vacancy.`, apply_email: email, apply_url: url,
    apply_method: method, questions, posted_at: ago(24 + i * 6), dedupe_key: `sample|${title.toLowerCase()}|${i}`,
  })));
  const job = (t) => jobs.find((j) => j.title === t).id;

  // Matches, tailored CVs and applications for each person.
  const plan = {
    priya: [["Python Developer", 94, "sent", "email"], ["Backend Engineer (Python)", 88, "manual", "ats"], ["Junior Software Developer", 76, "dry_run", "manual"]],
    tom: [["Data Analyst", 91, "prepared", "email"], ["BI Analyst (Power BI)", 82, "skipped", "manual"]],
    aisha: [["UI/UX Designer", 90, "skipped", "email"], ["Product Designer", 85, "manual", "ats"], ["Senior UX Researcher", 78, "failed", "manual"]],
  };
  for (const p of people) {
    for (const [title, score, status, method] of plan[p.key]) {
      const jid = job(title);
      const breakdown = { role: { points: 35, max: 35, reason: "Title matches your search" }, skills: { points: Math.round(score * 0.45), max: 45, reason: "Most advert skills are on your CV" }, location: { points: 10, max: 10, reason: "In one of your locations" }, salary: { points: 10, max: 10, reason: "Meets your minimum" } };
      await insert("matches", [{ user_id: users[p.key], search_profile_id: searches[p.key], job_id: jid, score, matching_skills: p.skills.slice(0, 3).map((s) => s.toLowerCase()), missing_skills: ["kubernetes"], reasons: ["Title matches your search"], breakdown, ai_reviewed: false }]);
      await insert("tailored_cvs", [{ user_id: users[p.key], job_id: jid, cv_id: cvs[p.key], content_json: profileJson(p), flags: [], method: p.key === "tom" ? "reorder" : "ai" }]);
      const detail = {
        sent: { mode: "live", note: "SAMPLE: shown as sent; nothing was emailed" },
        manual: { apply_url: "see job", note: "Prepared for you to submit on the employer's site" },
        dry_run: { mode: "dry_run", note: "Test mode: prepared, not sent" },
        prepared: { note: "Prepared, waiting for the next send" },
        skipped: { reason: title.includes("BI") ? "Sensitive question: disability" : "Unanswered question: portfolio link" },
        failed: { error: "SAMPLE: the mail service did not answer" },
      }[status];
      await insert("applications", [{ user_id: users[p.key], job_id: jid, search_profile_id: searches[p.key], status, method, detail, sent_at: status === "sent" ? ago(2) : null }]);
    }
  }

  // Notifications.
  await insert("notifications", [
    { user_id: users.priya, kind: "applied", message: "Sample: application sent to Sample Acme Fintech for Python Developer.", link: "/applications", is_read: false },
    { user_id: users.priya, kind: "manual", message: "Sample: Backend Engineer (Python) is ready for you to apply.", link: "/applications", is_read: true },
    { user_id: users.tom, kind: "skipped", message: "Sample: BI Analyst skipped: it asks a sensitive question.", link: "/applications", is_read: false },
    { user_id: users.aisha, kind: "skipped", message: "Sample: UI/UX Designer skipped: add an answer for 'portfolio link'.", link: "/auto-apply", is_read: false },
    { user_id: users.aisha, kind: "failed", message: "Sample: sending failed for Senior UX Researcher.", link: "/applications", is_read: false },
  ]);

  // Sources, scans, AI usage, extension token.
  await api("/rest/v1/source_status", "POST", [
    { name: "adzuna", enabled: true, last_run: ago(1), last_count: 88, last_error: null },
    { name: "reed", enabled: true, last_run: ago(1), last_count: 63, last_error: null },
    { name: "greenhouse", enabled: true, last_run: ago(0.25), last_count: 78, last_error: null },
    { name: "lever", enabled: false, last_run: null, last_count: 0, last_error: null },
    { name: "demo", enabled: false, last_run: ago(30), last_count: 12, last_error: null },
  ], { Prefer: "resolution=merge-duplicates" });
  await insert("scan_runs", [
    { started_at: ago(2), finished_at: ago(1.95), new_jobs: 41, new_matches: 6, applications: 4, error: null },
    { started_at: ago(1), finished_at: ago(0.97), new_jobs: 12, new_matches: 2, applications: 1, error: null },
    { started_at: ago(0.5), finished_at: ago(0.49), new_jobs: 0, new_matches: 0, applications: 0, error: "Sample: reed answered HTTP 503" },
  ]);
  await insert("ai_usage", people.flatMap((p, i) => [
    { user_id: users[p.key], purpose: "cv_parse", model: "deepseek-flash", prompt_tokens: 1500, completion_tokens: 1800, ok: true },
    { user_id: users[p.key], purpose: "cv_tailor", model: "deepseek-flash", prompt_tokens: 2300, completion_tokens: 1300, ok: i !== 1 },
    { user_id: users[p.key], purpose: "match_review", model: "deepseek-flash", prompt_tokens: 800, completion_tokens: 150, ok: true },
  ]));
  await insert("extension_tokens", [{ user_id: users.aisha, token_hash: createHash("sha256").update("jpx_sample_" + randomBytes(16).toString("hex")).digest("hex"), expires_at: ahead(12) }]);

  // Summary.
  for (const t of ["profiles_user", "invites", "invite_requests", "cvs", "search_profiles", "screening_answers", "jobs", "matches", "tailored_cvs", "applications", "notifications", "source_status", "scan_runs", "ai_usage", "extension_tokens", "app_settings"]) {
    const r = await fetch(`${U}/rest/v1/${t}?select=*`, { headers: { ...H, Prefer: "count=exact", Range: "0-0" } });
    console.log(t.padEnd(18), (r.headers.get("content-range") || "").split("/")[1]);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
