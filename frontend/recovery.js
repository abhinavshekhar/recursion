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

const BUDGET_KEY = "rcm_budget";
const fmt = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

let data = null;
let charts = {};

function getBudget() {
  return JSON.parse(localStorage.getItem(BUDGET_KEY) || "{}");
}

function saveBudget(b) {
  localStorage.setItem(BUDGET_KEY, JSON.stringify(b));
}

function getAssigned() {
  return JSON.parse(localStorage.getItem("rcm_assigned") || "[]");
}

function saveAssigned(list) {
  localStorage.setItem("rcm_assigned", JSON.stringify(list));
}

async function loadData() {
  const res = await authFetch("/api/findings");
  if (!res.ok) throw new Error("Could not load data");
  data = await res.json();
  render();
}

function render() {
  const { summary } = data;
  const budget = getBudget();
  const assigned = getAssigned();

  let totalAllocated = 0;
  let totalRecovered = 0;
  Object.keys(summary.by_category).forEach((cat) => {
    totalAllocated += budget[cat]?.allocated || 0;
    totalRecovered += budget[cat]?.recovered || 0;
  });
  assigned.filter((a) => a.recovered).forEach((a) => {
    totalRecovered += a.amount_at_risk;
  });

  document.getElementById("budgetAtRisk").textContent = fmt(summary.total_at_risk);
  document.getElementById("budgetAllocated").textContent = fmt(totalAllocated);
  document.getElementById("budgetRecovered").textContent = fmt(totalRecovered);
  document.getElementById("budgetGap").textContent = fmt(Math.max(0, summary.total_at_risk - totalRecovered));

  renderBudgetCards(summary);
  renderAssigned(assigned);
  renderBudgetChart(summary, budget);
  renderProgressChart(summary, totalRecovered);
}

function renderBudgetCards(summary) {
  const budget = getBudget();
  const el = document.getElementById("budgetCards");

  el.innerHTML = Object.entries(summary.by_category).map(([cat, atRisk]) => {
    const b = budget[cat] || { allocated: 0, recovered: 0 };
    const pct = atRisk > 0 ? Math.min(100, (b.recovered / atRisk) * 100) : 0;
    return `
    <div class="budget-card" data-cat="${cat}">
      <div class="budget-card-info">
        <h3><span class="cat-badge ${cat}">${CATEGORY_LABELS[cat]}</span></h3>
        <p>At risk: <strong>${fmt(atRisk)}</strong></p>
      </div>
      <div class="budget-input-group">
        <label>Budget $</label>
        <input type="number" min="0" step="100" data-field="allocated" data-cat="${cat}" value="${b.allocated || ""}" placeholder="0" />
      </div>
      <div class="budget-input-group">
        <label>Recovered $</label>
        <input type="number" min="0" step="100" data-field="recovered" data-cat="${cat}" value="${b.recovered || ""}" placeholder="0" />
      </div>
      <div class="budget-progress"><div class="budget-progress-fill" style="width:${pct}%"></div></div>
      <div class="budget-stats">
        <span>Allocated: <strong>${fmt(b.allocated || 0)}</strong></span>
        <span>Recovered: <strong>${fmt(b.recovered || 0)}</strong></span>
        <span>Progress: <strong>${pct.toFixed(0)}%</strong></span>
      </div>
    </div>`;
  }).join("");

  el.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      const cat = input.dataset.cat;
      const field = input.dataset.field;
      const b = getBudget();
      if (!b[cat]) b[cat] = { allocated: 0, recovered: 0 };
      b[cat][field] = parseFloat(input.value) || 0;
      saveBudget(b);
      render();
    });
  });
}

function renderAssigned(assigned) {
  const el = document.getElementById("assignedList");
  if (!assigned.length) {
    el.innerHTML = "<p class='muted'>No findings assigned yet. Open a finding from the worklist and click \"Add to recovery budget\".</p>";
    return;
  }
  el.innerHTML = assigned.map((a, i) => `
    <div class="assigned-item ${a.recovered ? "recovered" : ""}">
      <span>
        <strong>${a.id}</strong> — ${CATEGORY_LABELS[a.category]} — ${fmt(a.amount_at_risk)}
        ${a.recovered ? " ✓ Recovered" : ""}
      </span>
      ${a.recovered ? "" : `<button data-idx="${i}">Mark recovered</button>`}
    </div>`).join("");

  el.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const list = getAssigned();
      const item = list[btn.dataset.idx];
      item.recovered = true;
      const budget = getBudget();
      if (!budget[item.category]) budget[item.category] = { allocated: 0, recovered: 0 };
      budget[item.category].recovered += item.amount_at_risk;
      saveBudget(budget);
      saveAssigned(list);
      render();
    });
  });
}

function renderBudgetChart(summary, budget) {
  const cats = Object.keys(summary.by_category);
  const ctx = document.getElementById("budgetChart");
  if (charts.budget) charts.budget.destroy();
  charts.budget = new Chart(ctx, {
    type: "bar",
    data: {
      labels: cats.map((c) => CATEGORY_LABELS[c]),
      datasets: [
        { label: "At risk", data: cats.map((c) => summary.by_category[c]), backgroundColor: "rgba(148,163,184,0.4)", borderRadius: 6 },
        { label: "Allocated", data: cats.map((c) => budget[c]?.allocated || 0), backgroundColor: "rgba(99,102,241,0.7)", borderRadius: 6 },
        { label: "Recovered", data: cats.map((c) => budget[c]?.recovered || 0), backgroundColor: "rgba(16,185,129,0.7)", borderRadius: 6 },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#94a3b8" } } },
      scales: {
        x: { ticks: { color: "#94a3b8", maxRotation: 45 }, grid: { display: false } },
        y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.08)" } },
      },
    },
  });
}

function renderProgressChart(summary, recovered) {
  const ctx = document.getElementById("progressChart");
  const remaining = Math.max(0, summary.total_at_risk - recovered);
  if (charts.progress) charts.progress.destroy();
  charts.progress = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Recovered", "Remaining"],
      datasets: [{ data: [recovered, remaining], backgroundColor: ["#34d399", "rgba(148,163,184,0.3)"], borderWidth: 0 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom", labels: { color: "#94a3b8" } } },
    },
  });
}

document.getElementById("resetBudget").addEventListener("click", () => {
  if (confirm("Reset all budget and assigned findings?")) {
    localStorage.removeItem(BUDGET_KEY);
    localStorage.removeItem("rcm_assigned");
    render();
  }
});

document.getElementById("sidebarToggle")?.addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

async function init() {
  const user = await requireAuth();
  if (!user) return;
  document.getElementById("userName").textContent = user.name;
  document.getElementById("userRole").textContent = user.role;
  document.getElementById("userAvatar").textContent = user.name.charAt(0).toUpperCase();
  document.getElementById("logoutBtn").addEventListener("click", logout);
  try {
    await loadData();
  } catch (err) {
    console.error(err);
  }
}

if (document.body.dataset.page === "recovery") {
  init();
}
