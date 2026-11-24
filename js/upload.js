// upload.js, PDF upload, review-and-edit, then commit the report into the
// GitHub-hosted dataset so it is available on every device.
import { parsePDF } from "./parser.js";
import { loadModel, model, setModel, mergeReport, labelForISO, latest } from "./data.js";
import { renderDashboard } from "./render.js";
import * as gh from "./github.js";

const $ = sel => document.querySelector(sel);
let parsed = null;

export function initUpload() {
  const dz = $("#dropzone");
  const input = $("#file-input");
  dz.addEventListener("click", () => input.click());
  dz.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("drag"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("drag"));
  dz.addEventListener("drop", e => {
    e.preventDefault(); dz.classList.remove("drag");
    const f = e.dataTransfer.files[0];
    if (f && f.type === "application/pdf") handleFile(f);
    else toast("Please drop a PDF file");
  });
  dz.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", e => { if (e.target.files[0]) handleFile(e.target.files[0]); });

  $("#btn-save").addEventListener("click", saveParsed);
  $("#btn-export").addEventListener("click", exportJSON);
  $("#btn-clear").addEventListener("click", () => { parsed = null; $("#review").hidden = true; });

  initGitHubPanel();
}

async function handleFile(file) {
  $("#parse-status").hidden = false;
  $("#review").hidden = true;
  $("#parse-status").textContent = "Reading " + file.name + " ...";
  try {
    parsed = await parsePDF(file);
    $("#parse-status").hidden = true;
    renderReview();
  } catch (err) {
    $("#parse-status").textContent = "Could not parse this PDF: " + err.message;
  }
}

function renderReview() {
  const m = model();
  $("#review").hidden = false;
  $("#rv-lab").textContent = parsed.lab;
  $("#rv-file").textContent = parsed.fileName;
  $("#rv-date").value = parsed.date || "";

  const found = Object.keys(parsed.values).length;
  $("#rv-count").textContent = found + " of " + m.markers.length + " tracked markers";

  const rows = m.markers.map(mk => {
    const hit = parsed.values[mk.id];
    const conf = hit ? hit.confidence : null;
    const confBadge = !hit
      ? `<span class="conf conf-miss">not found</span>`
      : conf === "high"
        ? `<span class="conf conf-high">high</span>`
        : `<span class="conf conf-low">${conf}, check</span>`;
    const prev = latest(mk.series);
    const suspicious = hit && prev.value !== null && Math.abs(hit.value - prev.value) / (prev.value || 1) > 0.5;
    return `<tr>
      <td>${mk.name} <span style="color:var(--text-3)">${mk.unit}</span></td>
      <td><input type="number" step="any" inputmode="decimal" data-marker="${mk.id}"
        value="${hit ? hit.value : ""}" class="${suspicious ? "suspect" : ""}"
        aria-label="${mk.name} value"></td>
      <td>${confBadge}${suspicious ? ` <span class="conf conf-low">big jump vs last</span>` : ""}</td>
      <td style="color:var(--text-3)">${prev.value ?? "n/a"}</td>
    </tr>`;
  }).join("");
  $("#rv-tbody").innerHTML = rows;
}

async function saveParsed() {
  if (!parsed) return;
  const date = $("#rv-date").value;
  if (!date) { toast("Set the report date first"); $("#rv-date").focus(); return; }
  const values = {};
  document.querySelectorAll("#rv-tbody input[data-marker]").forEach(inp => {
    const v = inp.value.trim();
    if (v !== "" && !isNaN(parseFloat(v))) values[inp.dataset.marker] = parseFloat(v);
  });
  if (!Object.keys(values).length) { toast("No values to save"); return; }

  let token = gh.getToken();
  if (!token) {
    token = (prompt("Enter a GitHub token with write access to save this report to GitHub. It is kept only for this browser session.") || "").trim();
    if (!token) { toast("A GitHub token is needed to save"); return; }
    gh.setToken(token);
    reflectTokenState();
  }

  const report = { id: date, label: labelForISO(date), values, lab: parsed.lab, fileName: parsed.fileName };
  const btn = $("#btn-save");
  btn.disabled = true; btn.textContent = "Saving to GitHub...";
  try {
    const remote = await gh.fetchRemote();          // latest committed dataset
    const merged = mergeReport(remote.json, report); // add this report
    await gh.commit(merged, `Add lab report ${report.label} (${date})`);
    setModel(merged);                                // reflect immediately
    renderDashboard();
    parsed = null;
    $("#review").hidden = true;
    toast("Saved to GitHub, dashboard updated");
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false; btn.textContent = "Save to GitHub";
  }
}

function exportJSON() {
  if (!parsed) return;
  const blob = new Blob([JSON.stringify(parsed, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (parsed.date || "report") + "_parsed.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- GitHub settings panel ---------- */
function initGitHubPanel() {
  const cfg = gh.getConfig();
  const set = (id, v) => { const el = $(id); if (el) el.value = v; };
  set("#gh-owner", cfg.owner);
  set("#gh-repo", cfg.repo);
  set("#gh-branch", cfg.branch);
  reflectTokenState();

  const saveCfg = () => gh.setConfig({
    owner: $("#gh-owner").value.trim(),
    repo: $("#gh-repo").value.trim(),
    branch: $("#gh-branch").value.trim(),
  });
  ["#gh-owner", "#gh-repo", "#gh-branch"].forEach(id => {
    const el = $(id); if (el) el.addEventListener("change", saveCfg);
  });

  const tokenBtn = $("#gh-token-btn");
  if (tokenBtn) tokenBtn.addEventListener("click", () => {
    if (gh.hasToken()) { gh.setToken(""); toast("Token cleared"); }
    else {
      const t = (prompt("Enter a GitHub token with write access. It is kept only for this browser session.") || "").trim();
      if (t) { gh.setToken(t); toast("Token set for this session"); }
    }
    reflectTokenState();
  });
}

function reflectTokenState() {
  const s = $("#gh-token-state");
  const btn = $("#gh-token-btn");
  const has = gh.hasToken();
  if (s) { s.textContent = has ? "Token set for this session" : "No token set"; s.className = "gh-state " + (has ? "ok" : "off"); }
  if (btn) btn.textContent = has ? "Clear token" : "Set token";
}

let toastTimer = null;
export function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
