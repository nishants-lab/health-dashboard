// render.js, dashboard DOM rendering.
import { latest, previous, inRange, model } from "./data.js";
import { scoreSeries, breakdownScores } from "./score.js";
import { markerChart, scoreChart } from "./charts.js";
import { computeDigest, digestCopy } from "./digest.js";

const $ = (sel, root = document) => root.querySelector(sel);

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function fmt(v) {
  if (v === null || v === undefined) return "-";
  return Math.abs(v) >= 100 ? String(Math.round(v * 10) / 10) : String(Math.round(v * 100) / 100);
}

function ringColor(score) {
  const c = getComputedStyle(document.documentElement);
  if (score >= 80) return c.getPropertyValue("--ok").trim();
  if (score >= 60) return c.getPropertyValue("--warn").trim();
  return c.getPropertyValue("--bad").trim();
}

export function renderHero(m) {
  const labels = m.reports.map(r => r.label);
  const scores = scoreSeries(m.markers, m.reports.length);
  let curIdx = scores.length - 1;
  while (curIdx > 0 && scores[curIdx] === null) curIdx--;
  const score = scores[curIdx] ?? 0;
  let prevIdx = curIdx - 1;
  while (prevIdx >= 0 && scores[prevIdx] === null) prevIdx--;
  const prev = prevIdx >= 0 ? scores[prevIdx] : null;

  // ring
  const R = 74, CIRC = 2 * Math.PI * R;
  const ring = $("#ring-val");
  ring.style.stroke = ringColor(score);
  ring.setAttribute("stroke-dasharray", CIRC.toFixed(1));
  ring.setAttribute("stroke-dashoffset", CIRC.toFixed(1));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    ring.setAttribute("stroke-dashoffset", (CIRC * (1 - score / 100)).toFixed(1));
  }));
  $("#ring-num").textContent = score;
  $("#hero-date").textContent = m.reports[curIdx].label;

  // delta vs previous report
  const deltaEl = $("#hero-delta");
  if (prev !== null) {
    const d = score - prev;
    deltaEl.className = "delta-chip " + (d > 0 ? "delta-up" : d < 0 ? "delta-down" : "delta-flat");
    deltaEl.textContent = (d > 0 ? "+" + d : d < 0 ? String(d) : "no change") + " vs " + m.reports[prevIdx].label;
  } else deltaEl.hidden = true;

  // breakdown bars
  const bd = breakdownScores(m.markers, m.breakdown, curIdx);
  $("#breakdown").innerHTML = bd.map(c => {
    const col = c.score >= 80 ? "var(--ok)" : c.score >= 60 ? "var(--warn)" : "var(--bad)";
    return `<div class="bd-item">
      <div class="bd-top"><span>${c.name}</span><b>${c.score}</b></div>
      <div class="bd-track"><div class="bd-fill" style="width:${c.score}%;background:${col}"></div></div>
    </div>`;
  }).join("");

  scoreChart($("#chart-score"), labels, scores);
}

export function renderDigest(m) {
  const items = computeDigest(m.markers);
  const wrap = $("#digest");
  if (!items.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  $("#digest-chips").innerHTML = items.map(it => {
    const c = digestCopy[it.kind];
    const arrow = it.rising ? "up" : "down";
    return `<a class="digest-chip ${c.good ? "good" : "bad"}" href="#card-${it.marker.id}">
      <span class="arrow">${arrow}</span>
      <span>${it.marker.name}</span>
      <span class="muted">${fmt(it.from)} to ${fmt(it.to)} · ${c.text}</span>
    </a>`;
  }).join("");
}

function statusPill(m) {
  const cur = latest(m.series);
  const ok = inRange(cur.value, m.ref);
  if (ok === null) return "";
  if (ok) return `<span class="status-pill pill-ok">in range</span>`;
  const low = m.ref.min != null && cur.value < m.ref.min;
  return `<span class="status-pill pill-bad">${low ? "low" : "high"}</span>`;
}

function deltaPill(m) {
  const cur = latest(m.series);
  if (cur.value === null) return "";
  const prev = previous(m.series, cur.index);
  if (prev.value === null) return "";
  const d = cur.value - prev.value;
  if (d === 0) return `<span class="status-pill" style="background:var(--bg-inset);color:var(--text-3)">no change</span>`;
  const sign = d > 0 ? "+" : "-";
  return `<span class="status-pill" style="background:var(--bg-inset);color:var(--text-2)">${sign}${fmt(Math.abs(d))} vs prev</span>`;
}

function refText(ref) {
  if (ref.min != null && ref.max != null) return `Range ${ref.min}-${ref.max}`;
  if (ref.max != null) return `Target < ${ref.max}`;
  if (ref.min != null) return `Target > ${ref.min}`;
  return "";
}

// A fresh, data-derived situation line (recomputed on every load, never stale):
// latest value, whether it is in range, how many readings are in range, and the
// trend from the first measured report to the latest.
function situationLine(mk) {
  const ref = mk.ref, u = mk.unit ? " " + mk.unit : "";
  const pts = [];
  mk.series.forEach((v, i) => { if (v !== null && v !== undefined) pts.push({ v, i }); });
  if (!pts.length) return "No readings yet.";
  const reps = model().reports;
  const last = pts[pts.length - 1], first = pts[0];
  const inCount = pts.filter(p => inRange(p.v, ref)).length;
  const okNow = inRange(last.v, ref);
  const pos = okNow ? "in range" : (ref.max != null && last.v > ref.max ? "above target" : "below target");
  let out = `Latest ${fmt(last.v)}${u} (${reps[last.i].label}), ${pos}. ${inCount} of ${pts.length} readings in range.`;
  if (pts.length >= 2) {
    const d = last.v - first.v;
    const rel = Math.abs(d) / (Math.abs(first.v) || 1);
    out += rel < 0.05
      ? ` Stable near ${fmt(last.v)} since ${reps[first.i].label}.`
      : ` ${d > 0 ? "Up" : "Down"} from ${fmt(first.v)} (${reps[first.i].label}) to ${fmt(last.v)}.`;
  }
  return out;
}

// A section's badge + priority, computed from the latest value of each marker
// so headers never carry stale claims. "near limit" = within 7% of a bound.
function sectionState(secId) {
  let out = 0, near = 0, measured = 0;
  for (const m of model().markers) {
    if (m.section !== secId) continue;
    const l = latest(m.series);
    if (l.value === null) continue;
    measured++;
    if (inRange(l.value, m.ref) === false) { out++; continue; }
    const { min, max } = m.ref;
    if ((min != null && l.value <= min * 1.07) || (max != null && l.value >= max * 0.93)) near++;
  }
  const priority = out > 0 ? "high" : near > 0 ? "medium" : "normal";
  let badge;
  if (!measured) badge = "No data";
  else if (out > 0) badge = `${out} of ${measured} out of range`;
  else if (near > 0) badge = `${near} near limit`;
  else badge = `All ${measured} in range`;
  return { priority, badge };
}

export function renderSections(m) {
  const container = $("#sections");
  container.innerHTML = "";
  const labels = m.reports.map(r => r.label);
  const bySection = {};
  for (const mk of m.markers) (bySection[mk.section] ??= []).push(mk);

  for (const sec of m.sections) {
    const section = el("section", "section");
    section.id = "sec-" + sec.id;
    const st = sectionState(sec.id);
    section.innerHTML = `<div class="section-head">
      <h2>${sec.title}</h2>
      <span class="badge badge-${st.priority}"><span class="dot dot-${st.priority}"></span>${st.badge}</span>
    </div>`;
    const grid = el("div", "cards-grid");
    for (const mk of bySection[sec.id] || []) {
      const cur = latest(mk.series);
      const card = el("article", "marker-card");
      card.id = "card-" + mk.id;
      card.innerHTML = `
        <div class="mc-head">
          <div class="mc-title">${mk.name}<small>${mk.unit}</small></div>
          <div class="mc-value"><span class="v">${fmt(cur.value)}</span><span class="u">${mk.unit}</span></div>
        </div>
        <div class="mc-sub">${statusPill(mk)}${deltaPill(mk)}<span>${refText(mk.ref)}</span></div>
        <div class="chart-box"><canvas id="chart-${mk.id}" role="img" aria-label="${mk.name} trend chart"></canvas></div>
        <div class="mc-expand">
          <button class="mc-expand-btn" aria-expanded="false" aria-controls="detail-${mk.id}">
            <span>What is ${mk.name}?</span><span class="chev" aria-hidden="true"></span>
          </button>
          <div class="mc-detail" id="detail-${mk.id}">
            <div>
              <p>${mk.explain}</p>
              <div class="your-status"><b>Your situation:</b> ${situationLine(mk)}</div>
              ${mk.note ? `<div class="your-note">${mk.note}</div>` : ""}
              ${mk.id === "tsh" && m.notes && m.notes.antiTPO ? `<div class="your-note"><b>Anti-TPO (Hashimoto's):</b> ${m.notes.antiTPO}</div>` : ""}
            </div>
          </div>
        </div>`;
      const btn = card.querySelector(".mc-expand-btn");
      const detail = card.querySelector(".mc-detail");
      btn.addEventListener("click", () => {
        const open = detail.classList.toggle("open");
        btn.setAttribute("aria-expanded", String(open));
      });
      grid.appendChild(card);
    }
    section.appendChild(grid);
    container.appendChild(section);
  }

  // charts after DOM insertion
  for (const mk of m.markers) {
    const canvas = document.getElementById("chart-" + mk.id);
    if (canvas) markerChart(canvas, labels, mk.series, mk.ref, { label: mk.name, unit: mk.unit });
  }

  // section chips
  $("#chips").innerHTML = m.sections.map(s =>
    `<a class="chip" data-sec="sec-${s.id}" href="#sec-${s.id}"><span class="dot dot-${sectionState(s.id).priority}"></span>${s.title}</a>`
  ).join("");
}

export function renderMeta(m) {
  const upl = m.reports.filter(r => r.source === "upload").length;
  $("#hero-sub").textContent =
    `${m.reports.length} reports · ${m.reports[0].label} to ${m.reports[m.reports.length - 1].label}` +
    ` · ${m.profile.sex}, ${m.profile.age} yrs` + (upl ? ` · ${upl} uploaded` : "");
  $("#note-foot").innerHTML =
    `<b>How to read:</b> shaded band = reference range, red points = out of range. Tap "What is ...?" on any card for context.
     <br><b>Last lab report:</b> ${m.notes.lastReport}.`;
}

const PLAN_TARGETS = {
  tsh:      { label: "TSH",           cond: "hypothyroid", dir: "below", target: 4.94 },
  hdl:      { label: "HDL",                                dir: "above", target: 45 },
  ldl:      { label: "LDL",                                dir: "below", target: 100 },
  tg:       { label: "Triglycerides",                      dir: "below", target: 150 },
  uricacid: { label: "Uric Acid",                          dir: "below", target: 7.0 },
};

export function renderPlan(m) {
  const byId = {};
  for (const mk of m.markers) byId[mk.id] = mk;
  for (const h4 of document.querySelectorAll("#tab-plan h4[data-pm]")) {
    const cfg = PLAN_TARGETS[h4.dataset.pm];
    const mk = byId[h4.dataset.pm];
    if (!cfg || !mk) continue;
    const cur = latest(mk.series);
    const prev = previous(mk.series, cur.index);
    const v = cur.value;
    if (v === null || v === undefined) continue;
    const op = cfg.dir === "below" ? "<" : ">";
    const cond = cfg.cond ? ` (${cfg.cond})` : "";
    h4.textContent = `${cfg.label}${cond} - ${fmt(v)} to target ${op}${cfg.target}`;

    const met = cfg.dir === "below" ? v <= cfg.target : v >= cfg.target;
    let trend = "";
    if (prev && prev.value !== null && prev.value !== undefined && v !== prev.value) {
      const better = cfg.dir === "below" ? v < prev.value : v > prev.value;
      trend = better ? ", improving" : ", worsening";
    }
    const base = met ? "On target now" : (cfg.dir === "below" ? "Above target" : "Below target");
    let st = h4.nextElementSibling;
    if (!st || !st.classList.contains("plan-status")) {
      st = document.createElement("div");
      h4.after(st);
    }
    st.className = "plan-status plan-status-" + (met ? "ok" : "miss");
    st.textContent = base + trend;

    const card = h4.closest(".plan-card");
    if (card) card.classList.toggle("plan-card-met", met);
  }

  for (const span of document.querySelectorAll("#tab-plan [data-plan-range]")) {
    const mk = byId[span.dataset.planRange];
    if (!mk) continue;
    const vals = mk.series.filter(v => v !== null && v !== undefined);
    if (vals.length) span.textContent = `${fmt(Math.min(...vals))} to ${fmt(Math.max(...vals))}`;
  }
}

export function renderDashboard() {
  const m = model();
  renderHero(m);
  renderDigest(m);
  renderSections(m);
  renderMeta(m);
  renderPlan(m);
}