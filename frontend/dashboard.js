const CATEGORY_LABELS = {
  missing_charge: "Missing charge",
  coding_error: "Coding error",
  unsubmitted_claim: "Unsubmitted claim",
  denied_no_followup: "Denied, no follow-up",
  underpayment: "Underpayment",
};

const CATEGORY_COLORS = {
  missing_charge: "#6366f1",
  coding_error: "#22d3ee",
  unsubmitted_claim: "#a78bfa",
  denied_no_followup: "#f59e0b",
  underpayment: "#f43f5e",
};

const PANEL_TITLES = {
  overview: "Overview",
  worklist: "Worklist",
  analytics: "Analytics",
};

let data = null;
const charts = {};
let chartType = "doughnut";
let sortKey = "amount_at_risk";
let sortDir = -1;
let activeFinding = null;

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function maskProvider(id) {
  if (!id || id.length < 4) return "****";
  return id.slice(0, 3) + "***";
}

function chartDefaults() {
  return {
    responsive: true,
    plugins: {
      legend: { labels: { color: "#94a3b8", font: { family: "'Plus Jakarta Sans', sans-serif", size: 11 } } },
    },
  };
}

async function loadData() {
  const res = await authFetch("/api/findings");
  if (!res.ok) throw new Error("Could not load data");
  data = await res.json();
  render();
}

function render() {
  const { summary, findings, generated_at, clusters = [] } = data;

  document.getElementById("totalAtRisk").textContent = fmt(summary.total_at_risk);
  document.getElementById("statFindings").textContent = findings.length;
  document.getElementById("statEncounters").textContent = summary.encounters_analyzed;
  document.getElementById("statHigh").textContent = findings.filter((f) => f.severity === "high").length;
  document.getElementById("generatedAt").textContent = `Updated ${new Date(generated_at).toLocaleString()}`;

  renderOverviewChart(summary.by_category);
  renderTopFindings(findings);
  renderTable(findings);
  renderCategoryChart(summary.by_category);
  renderSeverityChart(findings);
  renderProviderChart(findings);
  renderCountChart(summary.by_category);
  renderClusters(clusters);
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function renderOverviewChart(byCategory) {
  const ctx = document.getElementById("overviewChart");
  const keys = Object.keys(byCategory);
  destroyChart("overview");
  charts.overview = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: keys.map((k) => CATEGORY_LABELS[k]),
      datasets: [{ data: keys.map((k) => byCategory[k]), backgroundColor: keys.map((k) => CATEGORY_COLORS[k]), borderWidth: 0 }],
    },
    options: { ...chartDefaults(), plugins: { legend: { position: "right", labels: { color: "#94a3b8", boxWidth: 12 } } } },
  });
}

function renderTopFindings(findings) {
  const el = document.getElementById("topFindings");
  const top = [...findings].sort((a, b) => b.amount_at_risk - a.amount_at_risk).slice(0, 5);
  el.innerHTML = top.map((f) => `
    <div class="mini-item" data-id="${f.id}">
      <span><span class="cat-badge ${f.category}">${CATEGORY_LABELS[f.category]}</span> ${maskProvider(f.provider_id)}</span>
      <strong>${fmt(f.amount_at_risk)}</strong>
    </div>`).join("");
  el.querySelectorAll(".mini-item").forEach((item) => {
    item.addEventListener("click", () => {
      const f = findings.find((x) => x.id === item.dataset.id);
      if (f) openDrawer(f);
    });
  });
}

function renderCategoryChart(byCategory) {
  const ctx = document.getElementById("categoryChart");
  const keys = Object.keys(byCategory);
  destroyChart("category");
  charts.category = new Chart(ctx, {
    type: chartType,
    data: {
      labels: keys.map((k) => CATEGORY_LABELS[k]),
      datasets: [{ data: keys.map((k) => byCategory[k]), backgroundColor: keys.map((k) => CATEGORY_COLORS[k]), borderRadius: 6, borderWidth: 0 }],
    },
    options: {
      ...chartDefaults(),
      indexAxis: chartType === "bar" ? "y" : undefined,
      scales: chartType === "bar" ? {
        x: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.08)" }, border: { display: false } },
        y: { ticks: { color: "#94a3b8" }, grid: { display: false }, border: { display: false } },
      } : {},
    },
  });
}

function renderSeverityChart(findings) {
  const amounts = { high: 0, medium: 0, low: 0 };
  findings.forEach((f) => { amounts[f.severity] += f.amount_at_risk; });
  destroyChart("severity");
  charts.severity = new Chart(document.getElementById("severityChart"), {
    type: "polarArea",
    data: {
      labels: ["High", "Medium", "Low"],
      datasets: [{ data: [amounts.high, amounts.medium, amounts.low], backgroundColor: ["rgba(244,63,94,0.7)", "rgba(245,158,11,0.7)", "rgba(16,185,129,0.7)"], borderWidth: 0 }],
    },
    options: chartDefaults(),
  });
}

function renderProviderChart(findings) {
  const map = {};
  findings.forEach((f) => { map[f.provider_id] = (map[f.provider_id] || 0) + f.amount_at_risk; });
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
  destroyChart("provider");
  charts.provider = new Chart(document.getElementById("providerChart"), {
    type: "bar",
    data: {
      labels: sorted.map(([p]) => maskProvider(p)),
      datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: "rgba(99,102,241,0.7)", borderRadius: 8, borderWidth: 0 }],
    },
    options: {
      ...chartDefaults(),
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#94a3b8" }, grid: { display: false }, border: { display: false } },
        y: { ticks: { color: "#94a3b8", callback: (v) => "$" + v }, grid: { color: "rgba(148,163,184,0.08)" }, border: { display: false } },
      },
    },
  });
}

function renderCountChart(byCategory) {
  const keys = Object.keys(byCategory);
  destroyChart("count");
  charts.count = new Chart(document.getElementById("countChart"), {
    type: "bar",
    data: {
      labels: keys.map((k) => CATEGORY_LABELS[k]),
      datasets: [{ data: keys.map((k) => data.findings.filter((f) => f.category === k).length), backgroundColor: keys.map((k) => CATEGORY_COLORS[k]), borderRadius: 8, borderWidth: 0 }],
    },
    options: {
      ...chartDefaults(),
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#94a3b8", maxRotation: 45 }, grid: { display: false }, border: { display: false } },
        y: { ticks: { color: "#94a3b8", stepSize: 1 }, grid: { color: "rgba(148,163,184,0.08)" }, border: { display: false } },
      },
    },
  });
}

function renderClusters(clusters) {
  const el = document.getElementById("clustersList");
  if (!clusters.length) { el.innerHTML = "<p class='muted'>No clusters found.</p>"; return; }
  el.innerHTML = clusters.map((c, i) => `
    <button class="cluster-item" data-idx="${i}">
      <strong>${fmt(c.total_at_risk)}</strong><span>${c.label}</span>
    </button>`).join("");
}

function getFiltered(findings) {
  const cat = document.getElementById("filterCategory").value;
  const sev = document.getElementById("filterSeverity").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  return findings.filter((f) => {
    if (cat !== "all" && f.category !== cat) return false;
    if (sev !== "all" && f.severity !== sev) return false;
    if (q && !`${f.id} ${f.provider_id} ${f.category}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => {
    if (sortKey === "amount_at_risk") return (a.amount_at_risk - b.amount_at_risk) * sortDir;
    if (typeof a[sortKey] === "string") return a[sortKey].localeCompare(b[sortKey]) * sortDir;
    return 0;
  });
}

function renderTable(findings) {
  const filtered = getFiltered(findings);
  document.getElementById("resultCount").textContent = `${filtered.length} of ${findings.length} items`;
  const body = document.getElementById("findingsBody");
  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted">No matches.</td></tr>`;
    return;
  }
  body.innerHTML = filtered.map((f) => `
    <tr data-id="${f.id}">
      <td>${f.id}</td>
      <td><span class="cat-badge ${f.category}">${CATEGORY_LABELS[f.category]}</span></td>
      <td class="masked">${maskProvider(f.provider_id)}</td>
      <td class="amount">${fmt(f.amount_at_risk)}</td>
      <td><span class="badge ${f.severity}">${f.severity}</span></td>
      <td><button class="btn-view" data-id="${f.id}">View</button></td>
    </tr>`).join("");

  body.querySelectorAll(".btn-view, tr").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = el.dataset.id || el.closest("tr")?.dataset.id;
      const f = findings.find((x) => x.id === id);
      if (f) openDrawer(f);
    });
  });
}

function openDrawer(f) {
  activeFinding = f;
  document.getElementById("drawerId").textContent = f.id;
  document.getElementById("drawerCategory").textContent = CATEGORY_LABELS[f.category];
  document.getElementById("drawerAmount").textContent = fmt(f.amount_at_risk);
  document.getElementById("drawerExplanation").textContent = f.explanation;
  document.getElementById("drawerAction").textContent = f.recommended_action;
  document.getElementById("drawer").classList.remove("hidden");
  document.getElementById("overlay").classList.remove("hidden");
}

function closeDrawer() {
  activeFinding = null;
  document.getElementById("drawer").classList.add("hidden");
  document.getElementById("overlay").classList.add("hidden");
}

function switchPanel(name) {
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${name}`));
  document.querySelectorAll(".sidebar-nav .nav-item[data-panel]").forEach((b) => b.classList.toggle("active", b.dataset.panel === name));
  document.getElementById("pageTitle").textContent = PANEL_TITLES[name] || name;
  document.getElementById("sidebar").classList.remove("open");
}

function setupPanels() {
  document.querySelectorAll(".sidebar-nav .nav-item[data-panel]").forEach((btn) => {
    btn.addEventListener("click", () => switchPanel(btn.dataset.panel));
  });
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => switchPanel(btn.dataset.goto));
  });
  const hash = window.location.hash.replace("#", "");
  if (["overview", "worklist", "analytics"].includes(hash)) switchPanel(hash);
}

document.getElementById("filterCategory").addEventListener("change", () => data && renderTable(data.findings));
document.getElementById("filterSeverity").addEventListener("change", () => data && renderTable(data.findings));
document.getElementById("searchInput").addEventListener("input", () => data && renderTable(data.findings));
document.getElementById("closeDrawer").addEventListener("click", closeDrawer);
document.getElementById("overlay").addEventListener("click", closeDrawer);
document.getElementById("toggleChart").addEventListener("click", () => {
  chartType = chartType === "doughnut" ? "bar" : "doughnut";
  document.getElementById("toggleChart").textContent = chartType === "doughnut" ? "Bar view" : "Donut";
  if (data) renderCategoryChart(data.summary.by_category);
});
document.getElementById("assignBudget").addEventListener("click", () => {
  if (!activeFinding) return;
  const stored = JSON.parse(localStorage.getItem("rcm_assigned") || "[]");
  if (!stored.find((x) => x.id === activeFinding.id)) {
    stored.push({ ...activeFinding, recovered: false, assignedAt: new Date().toISOString() });
    localStorage.setItem("rcm_assigned", JSON.stringify(stored));
  }
  closeDrawer();
  window.location.href = "recovery.html";
});
document.getElementById("sidebarToggle").addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});
document.querySelectorAll("th[data-sort]").forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (sortKey === key) sortDir *= -1;
    else { sortKey = key; sortDir = key === "amount_at_risk" ? -1 : 1; }
    if (data) renderTable(data.findings);
  });
});

async function init() {
  const user = await requireAuth();
  if (!user) return;
  document.getElementById("userName").textContent = user.name;
  document.getElementById("userRole").textContent = user.role;
  document.getElementById("userAvatar").textContent = user.name.charAt(0).toUpperCase();
  document.getElementById("logoutBtn").addEventListener("click", logout);
  setupPanels();
  loadData().catch(() => {});
}

if (document.body.dataset.page === "dashboard") {
  init();
}
