// github.js, persists lab data to the GitHub repo so it is available on any
// device, not just this browser. Reads are just the static data/baseline.json
// served by the site. Writes use the GitHub Contents API with a personal
// access token that the user supplies at save time.
//
// The token is a credential, so it is held in sessionStorage only (cleared when
// the tab closes) and never written to localStorage. Repo coordinates (owner,
// repo, branch, path) are not sensitive and live in localStorage.

const CFG_KEY = "hd.gh.config";
const TOKEN_KEY = "hd.gh.token"; // sessionStorage

const DEFAULT_CFG = {
  owner: "nishants-lab",
  repo: "health-dashboard",
  branch: "main",
  path: "data/baseline.json",
};

export function getConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY) || "{}");
    return { ...DEFAULT_CFG, ...c };
  } catch { return { ...DEFAULT_CFG }; }
}
export function setConfig(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify({ ...getConfig(), ...cfg }));
}

export function getToken() { return sessionStorage.getItem(TOKEN_KEY) || ""; }
export function setToken(t) {
  if (t) sessionStorage.setItem(TOKEN_KEY, t);
  else sessionStorage.removeItem(TOKEN_KEY);
}
export function hasToken() { return !!getToken(); }

function b64EncodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64DecodeUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
}

function apiBase(cfg) {
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`;
}

// Fetch the file from GitHub via the API. Returns { sha, json } or throws.
export async function fetchRemote(cfg = getConfig(), token = getToken()) {
  const url = `${apiBase(cfg)}?ref=${encodeURIComponent(cfg.branch)}`;
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`GitHub read failed (${res.status}), check repo, branch and token.`);
  const data = await res.json();
  return { sha: data.sha, json: JSON.parse(b64DecodeUtf8(data.content)) };
}

// Commit an updated baseline object back to the repo.
export async function commit(baselineObj, message, cfg = getConfig(), token = getToken()) {
  if (!token) throw new Error("A GitHub token is required to save to GitHub.");
  const { sha } = await fetchRemote(cfg, token); // fresh sha to avoid conflicts
  const body = {
    message,
    content: b64EncodeUtf8(JSON.stringify(baselineObj, null, 1)),
    branch: cfg.branch,
    sha,
  };
  const res = await fetch(apiBase(cfg), {
    method: "PUT",
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GitHub save failed (${res.status}). ${t.slice(0, 200)}`);
  }
  return res.json();
}
