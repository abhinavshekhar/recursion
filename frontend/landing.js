const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtNum = (n) => new Intl.NumberFormat("en-US").format(n);

const CATEGORY_LABELS = {
  missing_charge: "Missing charges",
  coding_error: "Coding errors",
  unsubmitted_claim: "Unsubmitted claims",
  denied_no_followup: "Denied, no follow-up",
  underpayment: "Underpayments",
};

async function loadLandingStats() {
  try {
    const res = await fetch("/data/findings.json");
    if (!res.ok) return;
    const data = await res.json();
    const { summary, findings } = data;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set("liveAtRisk", fmt(summary.total_at_risk));
    set("liveFindings", fmtNum(findings.length));
    set("liveEncounters", fmtNum(summary.encounters_analyzed));
    set("liveClaims", fmtNum(summary.claims_analyzed));
    set("liveHigh", fmtNum(findings.filter((f) => f.severity === "high").length));

    const catEl = document.getElementById("liveCategories");
    if (catEl && summary.by_category) {
      catEl.innerHTML = Object.entries(summary.by_category)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => `
          <div class="live-cat-row">
            <span>${CATEGORY_LABELS[cat] || cat}</span>
            <strong>${fmt(amt)}</strong>
          </div>`)
        .join("");
    }

    const updated = document.getElementById("liveUpdated");
    if (updated && data.generated_at) {
      updated.textContent = `Detection run: ${new Date(data.generated_at).toLocaleString()}`;
    }
  } catch {
    // static fallback values remain in HTML
  }
}

loadLandingStats();
