// JobPilot AI extension: the only part that talks to the JobPilot AI site.
// It keeps the site address and the connection code in chrome.storage.local, and nothing else.
// CV details are fetched when needed, passed to the page once, and never stored.
import { isBlockedUrl } from "./blocked.js";

const store = {
  async get() {
    const { appUrl = "", token = "" } = await chrome.storage.local.get(["appUrl", "token"]);
    return { appUrl, token };
  },
};

async function api(path, init = {}) {
  const { appUrl, token } = await store.get();
  if (!appUrl || !token) throw Object.assign(new Error("Not connected"), { code: 401 });
  const res = await fetch(appUrl.replace(/\/+$/, "") + path, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) await chrome.storage.local.remove("token");
  if (!res.ok) throw Object.assign(new Error(body.error || `JobPilot AI answered ${res.status}`), { code: res.status });
  return body;
}

function cleanAppUrl(raw) {
  try {
    const u = new URL(String(raw).trim());
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
    return u.origin;
  } catch {
    return null;
  }
}

async function tabUrl(tabId) {
  const tab = await chrome.tabs.get(tabId);
  return tab.url || "";
}

const handlers = {
  async status() {
    const { appUrl, token } = await store.get();
    return { connected: Boolean(appUrl && token), appUrl };
  },

  async connect({ appUrl, code }) {
    const origin = cleanAppUrl(appUrl);
    if (!origin) return { error: "Enter the JobPilot AI address, for example https://jobpilotai.co.uk" };
    if (!/^jpx_[A-Za-z0-9_-]{20,64}$/.test(String(code).trim())) return { error: "That does not look like a connection code. Copy it again from JobPilot AI." };
    await chrome.storage.local.set({ appUrl: origin, token: String(code).trim() });
    try {
      await api("/api/extension/profile", { method: "POST", body: JSON.stringify({ url: "https://example.com/" }) });
      return { connected: true, appUrl: origin };
    } catch (e) {
      await chrome.storage.local.remove("token");
      return { error: e.code === 401 ? "That code did not work. Get a new one from JobPilot AI." : `Could not reach JobPilot AI at ${origin}.` };
    }
  },

  async lookup({ tabId }) {
    const url = await tabUrl(tabId);
    if (isBlockedUrl(url)) return { blocked: true };
    return api("/api/extension/profile", { method: "POST", body: JSON.stringify({ url }) });
  },

  async fill({ tabId, jobId }) {
    const url = await tabUrl(tabId);
    if (isBlockedUrl(url)) return { blocked: true };
    const profile = await api("/api/extension/profile", { method: "POST", body: JSON.stringify({ url }) });
    if (!profile.ready) return { error: profile.reason };
    let cv = null;
    if (jobId) {
      try {
        cv = await api(`/api/extension/cv/${encodeURIComponent(jobId)}`);
      } catch {
        cv = null;
      }
    }
    const data = { person: profile.person, answers: profile.answers, cv };
    await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["fill.js"] });
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (d) => (window.__jobpilotFill ? window.__jobpilotFill(d) : null),
      args: [data],
    });
    // Merge what each frame did (application forms are often inside a frame).
    const report = { filled: [], attached: null, sensitive: [], unanswered: [], blocked: false };
    for (const r of results) {
      const x = r.result;
      if (!x) continue;
      if (x.blocked) report.blocked = true;
      report.filled.push(...x.filled);
      report.sensitive.push(...x.sensitive);
      report.unanswered.push(...x.unanswered);
      report.attached = report.attached || x.attached;
    }
    return report;
  },

  async applied({ jobId }) {
    return api("/api/extension/applied", { method: "POST", body: JSON.stringify({ jobId }) });
  },

  async disconnect() {
    try {
      await api("/api/extension/disconnect", { method: "POST" });
    } catch {
      // Signed out locally even if the site cannot be reached.
    }
    await chrome.storage.local.remove(["token"]);
    return { connected: false };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Only the extension's own pages (the popup) may ask for anything: never a web page or content script.
  if (sender.id !== chrome.runtime.id || !(sender.url || "").startsWith(chrome.runtime.getURL(""))) return false;
  const fn = handlers[msg && msg.type];
  if (!fn) return false;
  fn(msg)
    .then(reply)
    .catch((e) => reply({ error: e.message || "Something went wrong", code: e.code }));
  return true;
});
