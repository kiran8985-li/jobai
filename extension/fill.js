// Runs inside the application page, only when the user clicks "Fill this form".
// It fills fields and attaches the CV. It NEVER clicks, submits or presses Enter: the user submits.
// Questions it is not sure about, and every sensitive question, are highlighted for the user.
(() => {
  if (window.__jobpilotFill) return;

  const BLOCKED_HOSTS = ["linkedin.com", "indeed.com", "indeed.co.uk"];
  // Keep in step with SENSITIVE in src/lib/screening.ts (a test checks this).
  const SENSITIVE =
    /\b(disab\w*|impairment\w*|ethnic\w*|race|racial|religio\w*|faith|belief\w*|sexual\w*|orientation|gender|transgender|pregnan\w*|maternity|health|medical|illness\w*|mental|criminal|convict\w*|offen[cs]e\w*|arrest\w*|dbs|trade union|political|marital|veteran\w*)\b/i;
  // Common equal-opportunity wording that does not use the words above.
  const SENSITIVE_EXTRA = /hispanic|latino|latina|\bsex\b|pronouns|\bage\b|date of birth|nationality|caste/i;

  const PERSON_RULES = [
    ["firstName", /\b(first|given|fore)[\s_-]*name\b|^fname$/, "given-name"],
    ["lastName", /\b(last|family|sur)[\s_-]*name\b|^lname$|^surname$/, "family-name"],
    ["email", /e-?mail/, "email"],
    ["phone", /phone|mobile|telephone|\btel\b/, "tel"],
    ["linkedin", /linked\s*in/, null],
    ["github", /git\s*hub/, null],
    ["website", /website|portfolio|personal (site|url)|other url|blog/, "url"],
    ["currentCompany", /current (company|employer)|^company$|organi[sz]ation|^org$|employer name/, "organization"],
    ["currentTitle", /current (job )?(title|role|position)|^job title$|^title$/, "organization-title"],
    ["location", /\blocation\b|\bcity\b|where (do )?you (live|are based)|current address|town/, "address-level2"],
    ["school", /school|university|college|institution/, null],
    ["degree", /\bdegree\b|qualification|discipline|field of study/, null],
    ["skills", /\bskills\b/, null],
    ["fullName", /^(full )?name$|your name|full name|legal name|^name\b/, "name"],
  ];

  const ANSWER_RULES = [
    ["right_to_work_uk", /right to work|eligible to work|authori[sz]ed to work|legally (able|permitted)|work permit/],
    ["sponsorship", /sponsor/],
    ["notice_period", /notice period|when can you start|availability to start|start date/],
    ["salary_expectation", /salary|compensation|pay expectation|desired pay|expected pay/],
    ["willing_to_relocate", /relocat/],
    ["heard_about", /how did you (hear|find out|learn) about|where did you (hear|see|find)|how did you find (this|the|our)/],
  ];

  const isBlocked = () => BLOCKED_HOSTS.some((b) => location.hostname === b || location.hostname.endsWith("." + b));
  const norm = (s) => (s || "").toLowerCase().replace(/[\s ]+/g, " ").replace(/[*:?]+$/g, "").trim();

  function labelText(el) {
    const parts = [];
    if (el.getAttribute("aria-label")) parts.push(el.getAttribute("aria-label"));
    const by = el.getAttribute("aria-labelledby");
    if (by) by.split(/\s+/).forEach((id) => { const t = document.getElementById(id); if (t) parts.push(t.textContent); });
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) parts.push(l.textContent); }
    const wrap = el.closest("label");
    if (wrap) {
      // The label's own words only: a dropdown inside it would add all its options to the label.
      const copy = wrap.cloneNode(true);
      copy.querySelectorAll("select, option, input, textarea").forEach((n) => n.remove());
      parts.push(copy.textContent);
    }
    if ((el.type === "radio" || el.type === "checkbox") && el.closest("fieldset")) {
      const legend = el.closest("fieldset").querySelector("legend");
      if (legend) parts.push(legend.textContent);
    }
    // A question written just above the field, as many application forms do.
    if (!parts.length) {
      const holder = el.closest("div, li, p");
      const lab = holder && holder.querySelector("label, .application-label, .label, .text");
      if (lab && !lab.contains(el)) parts.push(lab.textContent);
    }
    // The same words often come from two places (aria-label and <label>); keep each once.
    const uniq = [];
    for (const t of parts.map(norm).filter(Boolean)) if (!uniq.some((u) => u.includes(t))) uniq.splice(0, uniq.length, ...uniq.filter((u) => !t.includes(u)), t);
    return uniq.join(" ") || norm(el.getAttribute("placeholder")) || norm(el.name);
  }
  const keyText = (el) => norm([labelText(el), el.name, el.id, el.getAttribute("placeholder")].join(" "));

  const visible = (el) => {
    if (el.type === "hidden" || el.disabled || el.readOnly) return false;
    if (el.type === "file") return true; // often visually hidden behind a styled button
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };

  // Sets a value the way a person typing would, so React and other frameworks notice it.
  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }
  function setChecked(el) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked").set.call(el, true);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /** Picks the option that means the same as the answer ("Yes", "No", or the answer's own words). */
  function optionFor(options, answer) {
    const a = norm(answer);
    const yes = /^yes\b/.test(a), no = /^no\b/.test(a);
    // "Yes, but I need sponsorship" matches an option about needing sponsorship (not one about working without it).
    if (/sponsor/.test(a)) {
      const s = options.filter((o) => /sponsor/.test(norm(o.text)) && !/without|not (be )?(require|need)|no sponsor/.test(norm(o.text)));
      if (s.length === 1) return s[0];
    }
    let best = null;
    for (const o of options) {
      const t = norm(o.text);
      if (!t || /^(select|choose|please select|--)/.test(t)) continue;
      if (t === a) return o;
      if (!best && yes && /^yes\b/.test(t)) best = o;
      if (!best && no && /^no\b/.test(t)) best = o;
      if (!best && a.length > 3 && (t.includes(a) || a.includes(t))) best = o;
    }
    return best;
  }

  const isCombo = (el) => el.getAttribute("role") === "combobox" && el instanceof HTMLInputElement;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // The ONLY place the extension presses anything: an option inside an open dropdown list.
  // It refuses every other element, so it can never press Submit or any other button.
  function chooseOption(opt) {
    if (!opt || !opt.matches('[role="option"], [class*="select__option"]') || opt.closest("form button, button, a, input[type=submit]")) return false;
    opt.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    opt.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  }
  function openList(el) {
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  }
  function closeList(el) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }

  /** Search-style dropdowns (React Select and similar): type the answer, then click the matching option. */
  async function pickCombo(el, answer) {
    openList(el);
    for (const query of [answer, ""]) {
      setValue(el, query);
      for (let i = 0; i < 15; i++) {
        await sleep(100);
        const list = el.getAttribute("aria-controls") && document.getElementById(el.getAttribute("aria-controls"));
        const opts = [...(list || document).querySelectorAll('[role="option"], [class*="select__option"]')].map((o) => ({ el: o, text: o.textContent }));
        const o = opts.length && optionFor(opts, answer);
        if (o && chooseOption(o.el)) { await sleep(50); return true; }
        if (opts.length) break;
      }
    }
    closeList(el);
    setValue(el, "");
    return false;
  }
  const comboBox = (el) => el.closest('[class*="select__container"], [class*="select-container"], [class*="Select"]') || el.parentElement || el;

  function mark(el, kind, note) {
    const colour = kind === "filled" ? "#6C4DFF" : "#D97706";
    el.style.outline = `3px solid ${colour}`;
    el.style.outlineOffset = "2px";
    el.setAttribute("data-jobpilot", kind);
    if (kind !== "filled" && note) {
      const tag = document.createElement("div");
      tag.setAttribute("data-jobpilot-note", kind);
      tag.textContent = note;
      tag.style.cssText = "margin:6px 0;padding:6px 10px;border-radius:8px;background:#FEF3C7;color:#78350F;font:600 13px/1.4 system-ui,sans-serif;";
      const anchor = el.type === "radio" || el.type === "checkbox" ? el.closest("fieldset") || el.parentElement : isCombo(el) ? comboBox(el) : el;
      anchor.insertAdjacentElement("afterend", tag);
    }
  }

  function banner(report) {
    if (window.top !== window) return;
    document.getElementById("jobpilot-banner")?.remove();
    const b = document.createElement("div");
    b.id = "jobpilot-banner";
    b.setAttribute("role", "status");
    b.style.cssText = "position:fixed;z-index:2147483647;left:12px;right:12px;bottom:12px;padding:14px 16px;border-radius:14px;background:#14122B;color:#fff;font:14px/1.45 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.3)";
    const waiting = report.sensitive.length + report.unanswered.length;
    b.innerHTML = '<strong style="color:#B9A9FF">JobPilot AI</strong> <span></span><button type="button" style="float:right;margin-left:12px;background:none;border:0;color:#fff;font-weight:700;cursor:pointer;min-height:32px">Close</button>';
    b.querySelector("span").textContent =
      ` filled ${report.filled.length} field${report.filled.length === 1 ? "" : "s"}${report.attached ? " and attached your CV" : ""}. ` +
      (waiting ? `${waiting} question${waiting === 1 ? " needs" : "s need"} your answer (highlighted in amber). ` : "") +
      "Check everything, then press Submit yourself.";
    b.querySelector("button").addEventListener("click", () => b.remove());
    document.body.appendChild(b);
  }

  // Questions are matched in lower case but reported to the user in readable form.
  const pretty = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  window.__jobpilotFill = async function fill(data) {
    const report = { filled: [], attached: null, sensitive: [], unanswered: [], blocked: false };
    if (isBlocked()) return { ...report, blocked: true };
    const p = data.person || {};
    const answers = data.answers || [];
    const byKey = Object.fromEntries(answers.filter((a) => a.key !== "custom").map((a) => [a.key, a]));
    const custom = answers.filter((a) => a.key === "custom");
    const values = { ...p, school: (p.education && p.education[0] && p.education[0].school) || "", degree: (p.education && p.education[0] && p.education[0].degree) || "" };

    const fields = [...document.querySelectorAll("input, textarea, select")].filter(visible);
    const doneGroups = new Set();

    for (const el of fields) {
      const type = (el.type || "").toLowerCase();
      if (["submit", "button", "reset", "image", "search", "password"].includes(type)) continue;
      const label = labelText(el);
      const text = keyText(el);

      // Radio buttons are answered once per group.
      if (type === "radio") {
        if (doneGroups.has(el.name)) continue;
        doneGroups.add(el.name);
      }

      // 1. Sensitive questions: never answered, always pointed out.
      if (SENSITIVE.test(label) || SENSITIVE_EXTRA.test(label)) {
        if (!report.sensitive.includes(label)) report.sensitive.push(label);
        mark(el, "sensitive", "JobPilot AI never answers this kind of question. Please answer it yourself, or choose 'prefer not to say' if offered.");
        continue;
      }

      // 2. The CV.
      if (type === "file") {
        if (/resume|\bcv\b|curriculum/.test(text) && data.cv && data.cv.base64) {
          const bytes = Uint8Array.from(atob(data.cv.base64), (c) => c.charCodeAt(0));
          const dt = new DataTransfer();
          dt.items.add(new File([bytes], data.cv.filename || "CV.pdf", { type: "application/pdf" }));
          el.files = dt.files;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          report.attached = data.cv.filename;
          report.filled.push(label || "CV");
          mark(el.closest("div") || el, "filled");
        } else if (!el.files || !el.files.length) {
          report.unanswered.push(label || "File upload");
          mark(el.closest("div") || el, "unanswered", /cover/.test(text) ? "Add a cover letter here if you want to." : "Please add this file yourself.");
        }
        continue;
      }

      // Already filled in (by the user or the site): leave it alone.
      if (type !== "radio" && type !== "checkbox" && el.value && el.value.trim() && !(el instanceof HTMLSelectElement && el.selectedIndex <= 0)) continue;
      // Tick boxes (consents, terms) are always left for the user.
      if (type === "checkbox") {
        if (!report.unanswered.includes(label)) report.unanswered.push(label);
        mark(el, "unanswered", "Please read and tick this yourself if you agree.");
        continue;
      }

      // 3. The person's details.
      let filled = false;
      const auto = (el.getAttribute("autocomplete") || "").toLowerCase();
      for (const [key, re, ac] of PERSON_RULES) {
        if (!(re.test(label) || re.test(norm(el.name)) || (ac && auto === ac))) continue;
        if (key === "fullName" && /first|last|given|family|surname|company|user/.test(text)) continue;
        const v = values[key];
        if (!v || el instanceof HTMLSelectElement || type === "radio") break;
        if (isCombo(el)) { if (await pickCombo(el, v)) { report.filled.push(label || key); mark(comboBox(el), "filled"); filled = true; } break; }
        setValue(el, v);
        report.filled.push(label || key);
        mark(el, "filled");
        filled = true;
        break;
      }
      if (filled) continue;

      // 4. Saved answers.
      let answer = null;
      for (const [key, re] of ANSWER_RULES) {
        if (!re.test(label)) continue;
        if (key === "sponsorship") {
          const rtw = byKey.right_to_work_uk;
          if (rtw) answer = rtw.value === "yes_sponsorship" ? "Yes" : rtw.value === "yes" ? "No" : null;
        } else if (byKey[key]) answer = byKey[key].answer;
        break;
      }
      if (answer === null) {
        const c = custom.find((a) => norm(a.question) === label || (label.length > 8 && (norm(a.question).includes(label) || label.includes(norm(a.question)))));
        if (c) answer = c.answer;
      }
      if (answer !== null) {
        if (el instanceof HTMLSelectElement) {
          const o = optionFor([...el.options], answer);
          if (o) { setValue(el, o.value); report.filled.push(label); mark(el, "filled"); continue; }
        } else if (type === "radio") {
          const group = [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`)];
          const o = optionFor(group.map((r) => ({ el: r, text: labelText(r) || r.value, value: r.value })), answer);
          if (o) { setChecked(o.el); report.filled.push(label); mark(o.el.closest("fieldset") || o.el, "filled"); continue; }
        } else if (isCombo(el)) {
          if (await pickCombo(el, answer)) { report.filled.push(label); mark(comboBox(el), "filled"); continue; }
        } else {
          setValue(el, answer);
          report.filled.push(label);
          mark(el, "filled");
          continue;
        }
      }

      // 5. Anything else is for the user.
      if (label && !report.unanswered.includes(label)) report.unanswered.push(label);
      mark(type === "radio" ? el.closest("fieldset") || el : isCombo(el) ? comboBox(el) : el, "unanswered", "JobPilot AI has no saved answer for this. Please answer it yourself.");
    }

    banner(report);
    return { ...report, filled: report.filled.map(pretty), sensitive: report.sensitive.map(pretty), unanswered: report.unanswered.map(pretty) };
  };
})();
