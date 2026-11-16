// The popup. CV details live only in this window's memory while it is open.
const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);
let tabId = null;
let jobId = null;

function show(section) {
  for (const id of ["connect", "blocked", "ready"]) $(id).hidden = id !== section;
}
function message(text, kind = "info") {
  $("message").hidden = !text;
  $("message").textContent = text || "";
  $("message").className = kind === "error" ? "error" : "";
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function currentTab() {
  // ?tab= lets the automated tests point the popup at a tab; people use the active tab.
  const forced = Number(new URLSearchParams(location.search).get("tab"));
  if (forced) return chrome.tabs.get(forced);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function start() {
  const status = await send({ type: "status" });
  $("disconnectBtn").hidden = !status.connected;
  $("who").textContent = status.connected ? `Connected to ${new URL(status.appUrl).host}` : "";
  if (!status.connected) {
    $("appUrl").value = status.appUrl || "";
    show("connect");
    return;
  }
  const tab = await currentTab();
  tabId = tab && tab.id;
  const r = await send({ type: "lookup", tabId });
  if (r.blocked) return show("blocked");
  if (r.error) {
    if (r.code === 401) return start();
    message(r.error, "error");
    return;
  }
  show("ready");
  try { $("site").textContent = new URL(tab.url).host; } catch { $("site").textContent = ""; }
  if (!r.ready) {
    message(r.reason, "error");
    $("fillBtn").disabled = true;
    return;
  }
  if (r.job) {
    jobId = r.job.hasCv ? r.job.id : null;
    $("jobBox").innerHTML = `<div class="job" data-job="${esc(r.job.id)}"><strong>${esc(r.job.title)}</strong>${esc(r.job.company)}<br><span class="small muted">${r.job.hasCv ? "Your tailored CV for this job will be attached." : "No tailored CV yet: your details are filled, add your CV yourself."}</span></div>`;
  } else if (r.jobs.length) {
    $("jobBox").innerHTML =
      `<label>Which job is this?<select id="jobSelect"><option value="">Not one of these (details only, no CV)</option>${r.jobs
        .map((j) => `<option value="${esc(j.id)}">${esc(j.title)}${j.company ? ", " + esc(j.company) : ""}</option>`)
        .join("")}</select></label>`;
    $("jobSelect").addEventListener("change", (e) => (jobId = e.target.value || null));
  } else {
    $("jobBox").innerHTML = `<p class="muted small">This page is not one of your matched jobs. Your details will be filled, but no CV is attached.</p>`;
  }
}

$("connectBtn").addEventListener("click", async () => {
  $("connectBtn").disabled = true;
  message("");
  const r = await send({ type: "connect", appUrl: $("appUrl").value, code: $("code").value });
  $("connectBtn").disabled = false;
  if (r.error) return message(r.error, "error");
  $("code").value = "";
  start();
});

$("fillBtn").addEventListener("click", async () => {
  $("fillBtn").disabled = true;
  $("fillBtn").textContent = "Filling…";
  const r = await send({ type: "fill", tabId, jobId });
  $("fillBtn").disabled = false;
  $("fillBtn").textContent = "Fill again";
  if (r.blocked) return show("blocked");
  if (r.error) return message(r.error, "error");
  const list = (items) => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  $("result").hidden = false;
  $("result").innerHTML =
    `<p class="ok">Filled ${r.filled.length} field${r.filled.length === 1 ? "" : "s"}${r.attached ? `, attached ${esc(r.attached)}` : ""}.</p>` +
    (r.sensitive.length ? `<p class="warn">Never answered by JobPilot AI (${r.sensitive.length}):</p>${list(r.sensitive)}` : "") +
    (r.unanswered.length ? `<p class="warn">For you to answer (${r.unanswered.length}):</p>${list(r.unanswered)}` : "") +
    `<p class="small muted">Check the form, press Submit on the page yourself, then mark it as applied.</p>`;
  $("appliedBtn").hidden = !jobId;
});

$("appliedBtn").addEventListener("click", async () => {
  $("appliedBtn").disabled = true;
  const r = await send({ type: "applied", jobId });
  if (r.error) {
    $("appliedBtn").disabled = false;
    return message(r.error, "error");
  }
  $("appliedBtn").textContent = "Marked as applied";
  message("Saved in JobPilot AI as applied.");
});

$("disconnectBtn").addEventListener("click", async () => {
  await send({ type: "disconnect" });
  message("Disconnected.");
  start();
});

start();
