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

let data = null;
let chart = null;
let chartType = "doughnut";
let sortKey = "amount_at_risk";
let sortDir = -1;
let activeFinding = null;

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const fmtNum = (n) => new Intl.NumberFormat("en-US").format(n);

function animateValue(el, end, prefix = "", suffix = "", duration = 1200) {
  const start = 0;
  const startTime = performance.now();
  const isMoney = prefix === "$";

  function tick(now) {
    const p = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = start + (end - start) * eased;
    el.textContent = isMoney ? fmt(val) : `${prefix}${fmtNum(Math.round(val))}${suffix}`;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

async function loadData() {
  const res = await authFetch("/api/findings");
  if (!res.ok) throw new Error("Could not load findings data");
  data = await res.json();
  render();
}

function render() {
  const { summary, findings, generated_at, clusters = [] } = data;

  document.getElementById("totalAtRisk").textContent = fmt(summary.total_at_risk);
  document.getElementById("heroSub").textContent =
    `Identified across ${summary.encounters_analyzed} encounters and ${summary.claims_analyzed} claims.`;
  document.getElementById("generatedAt").textContent =
    `Generated ${new Date(generated_at).toLocaleString()}`;

  animateValue(document.getElementById("statTotal"), summary.total_at_risk, "$");
  animateValue(document.getElementById("statEncounters"), summary.encounters_analyzed);
  animateValue(document.getElementById("statFindings"), findings.length);

  renderChart(summary.by_category);
  renderClusters(clusters);
  renderSeverityBar(findings);
  renderRuleCounts(findings);
  renderTable(findings);
}

function renderChart(byCategory) {
  const ctx = document.getElementById("categoryChart");
  const keys = Object.keys(byCategory);
  const labels = keys.map((k) => CATEGORY_LABELS[k] || k);
  const values = keys.map((k) => byCategory[k]);
  const colors = keys.map((k) => CATEGORY_COLORS[k]);

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: chartType,
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
        borderRadius: chartType === "bar" ? 6 : 0,
      }],
    },
    options: {
      indexAxis: chartType === "bar" ? "y" : undefined,
      onClick: (_, elements) => {
        if (!elements.length) return;
        const cat = keys[elements[0].index];
        document.getElementById("filterCategory").value = cat;
        scrollToDashboard();
        renderTable(data.findings);
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#94a3b8", padding: 16, font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 } },
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.95)",
          titleFont: { family: "'Plus Jakarta Sans', sans-serif", weight: "700" },
          bodyFont: { family: "'Plus Jakarta Sans', sans-serif" },
          borderColor: "rgba(148, 163, 184, 0.2)",
          borderWidth: 1,
          cornerRadius: 12,
          padding: 12,
          callbacks: {
            label: (ctx) => ` ${fmt(ctx.parsed)}`,
          },
        },
      },
      scales: chartType === "bar" ? {
        x: {
          ticks: { color: "#94a3b8", font: { family: "'Plus Jakarta Sans', sans-serif" } },
          grid: { color: "rgba(148, 163, 184, 0.08)" },
          border: { display: false },
        },
        y: {
          ticks: { color: "#94a3b8", font: { family: "'Plus Jakarta Sans', sans-serif" } },
          grid: { display: false },
          border: { display: false },
        },
      } : {},
    },
  });
}

function renderClusters(clusters) {
  const el = document.getElementById("clustersList");
  if (!clusters.length) {
    el.innerHTML = "<p class='muted'>No clusters detected yet.</p>";
    return;
  }
  el.innerHTML = clusters
    .map(
      (c, i) => `
      <button class="cluster-item" data-idx="${i}">
        <strong>${fmt(c.total_at_risk)}</strong>
        <span>${c.label}</span>
      </button>`
    )
    .join("");

  el.querySelectorAll(".cluster-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const c = clusters[btn.dataset.idx];
      document.getElementById("filterCategory").value = c.category;
      scrollToDashboard();
      renderTable(data.findings);
    });
  });
}

function renderSeverityBar(findings) {
  const counts = { high: 0, medium: 0, low: 0 };
  const amounts = { high: 0, medium: 0, low: 0 };
  findings.forEach((f) => {
    counts[f.severity]++;
    amounts[f.severity] += f.amount_at_risk;
  });
  const total = findings.length || 1;

  document.getElementById("severityBar").innerHTML = ["high", "medium", "low"]
    .map(
      (s) => `
      <button class="sev-segment ${s}" data-sev="${s}" style="flex:${counts[s] || 0.01}">
        <span class="sev-label">${s}</span>
        <span class="sev-count">${counts[s]} (${Math.round((counts[s] / total) * 100)}%)</span>
        <span class="sev-amt">${fmt(amounts[s])}</span>
      </button>`
    )
    .join("");

  document.querySelectorAll(".sev-segment").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("filterSeverity").value = btn.dataset.sev;
      scrollToDashboard();
      renderTable(data.findings);
    });
  });
}

function renderRuleCounts(findings) {
  const counts = {};
  findings.forEach((f) => {
    counts[f.category] = (counts[f.category] || 0) + 1;
  });
  document.querySelectorAll(".rule-count").forEach((el) => {
    const cat = el.dataset.rule;
    const n = counts[cat] || 0;
    el.textContent = `${n} finding${n !== 1 ? "s" : ""}`;
  });
}

function getFiltered(findings) {
  const cat = document.getElementById("filterCategory").value;
  const sev = document.getElementById("filterSeverity").value;
  const q = document.getElementById("searchInput").value.trim().toLowerCase();

  return findings
    .filter((f) => {
      if (cat !== "all" && f.category !== cat) return false;
      if (sev !== "all" && f.severity !== sev) return false;
      if (q) {
        const hay = `${f.id} ${f.encounter_id} ${f.provider_id} ${f.category} ${f.explanation}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === "amount_at_risk") return (av - bv) * sortDir;
      if (typeof av === "string") return av.localeCompare(bv) * sortDir;
      return 0;
    });
}

function renderTable(findings) {
  const filtered = getFiltered(findings);
  const body = document.getElementById("findingsBody");
  document.getElementById("resultCount").textContent =
    `Showing ${filtered.length} of ${findings.length} findings`;

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="6" class="muted">No findings match your filters.</td></tr>`;
    return;
  }

  body.innerHTML = filtered
    .map(
      (f) => `
      <tr data-id="${f.id}" class="${activeFinding === f.id ? "active-row" : ""}">
        <td>${f.id}</td>
        <td><span class="cat-badge ${f.category}">${CATEGORY_LABELS[f.category]}</span></td>
        <td>${f.encounter_id}</td>
        <td>${f.provider_id}</td>
        <td class="amount">${fmt(f.amount_at_risk)}</td>
        <td><span class="badge ${f.severity}">${f.severity}</span></td>
      </tr>`
    )
    .join("");

  body.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("click", () => {
      const finding = findings.find((f) => f.id === row.dataset.id);
      if (finding) openDrawer(finding);
    });
  });
}

function openDrawer(f) {
  activeFinding = f.id;
  document.getElementById("drawerId").textContent = f.id;
  document.getElementById("drawerCategory").textContent = CATEGORY_LABELS[f.category] || f.category;
  document.getElementById("drawerAmount").textContent = fmt(f.amount_at_risk);
  document.getElementById("drawerExplanation").textContent = f.explanation;
  document.getElementById("drawerAction").textContent = f.recommended_action;
  document.getElementById("drawer").classList.remove("hidden");
  document.getElementById("overlay").classList.remove("hidden");
  renderTable(data.findings);
}

function closeDrawer() {
  activeFinding = null;
  document.getElementById("drawer").classList.add("hidden");
  document.getElementById("overlay").classList.add("hidden");
  if (data) renderTable(data.findings);
}

function scrollToDashboard() {
  document.getElementById("dashboard").scrollIntoView({ behavior: "smooth" });
}

function setupNav() {
  const links = document.querySelectorAll(".nav-link");
  const sections = document.querySelectorAll(".section, .hero-section");

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const id = link.getAttribute("href").slice(1);
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      document.getElementById("navLinks").classList.remove("open");
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === `#${entry.target.id}`));
        }
      });
    },
    { threshold: 0.3 }
  );
  sections.forEach((s) => observer.observe(s));

  document.getElementById("navToggle").addEventListener("click", () => {
    document.getElementById("navLinks").classList.toggle("open");
  });
}

function setupProblemCards() {
  document.querySelectorAll(".problem-card").forEach((card) => {
    card.addEventListener("click", () => {
      document.getElementById("filterCategory").value = card.dataset.category;
      scrollToDashboard();
      if (data) renderTable(data.findings);
    });
  });
}

function setupSorting() {
  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir *= -1;
      else { sortKey = key; sortDir = key === "amount_at_risk" ? -1 : 1; }
      if (data) renderTable(data.findings);
    });
  });
}

document.getElementById("filterCategory").addEventListener("change", () => data && renderTable(data.findings));
document.getElementById("filterSeverity").addEventListener("change", () => data && renderTable(data.findings));
document.getElementById("searchInput").addEventListener("input", () => data && renderTable(data.findings));
document.getElementById("closeDrawer").addEventListener("click", closeDrawer);
document.getElementById("overlay").addEventListener("click", closeDrawer);
document.getElementById("viewInTable").addEventListener("click", () => {
  closeDrawer();
  scrollToDashboard();
});
document.getElementById("toggleChart").addEventListener("click", () => {
  chartType = chartType === "doughnut" ? "bar" : "doughnut";
  document.getElementById("toggleChart").textContent = chartType === "doughnut" ? "Bar view" : "Donut view";
  if (data) renderChart(data.summary.by_category);
});

setupNav();
setupProblemCards();
setupSorting();

function setupUserMenu(user) {
  document.getElementById("userName").textContent = user.name;
  document.getElementById("userRole").textContent = user.role;
  document.getElementById("userAvatar").textContent = user.name.charAt(0).toUpperCase();
  document.getElementById("logoutBtn").addEventListener("click", logout);
}

async function initDashboard() {
  if (document.body.dataset.page !== "dashboard") return;

  const user = await requireAuth();
  if (!user) return;

  setupUserMenu(user);
  loadData().catch((err) => {
    document.getElementById("heroSub").textContent = err.message;
  });
}

initDashboard();
