"""RCM revenue leakage detection engine."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent / "data"
OUTPUT_DIR = Path(__file__).resolve().parent / "output"
FRONTEND_DATA = Path(__file__).resolve().parent.parent / "frontend" / "data"

MISSING_CHARGE_DAYS = 3
UNSUBMITTED_DAYS = 7
DENIAL_FOLLOWUP_DAYS = 45
UNDERPAYMENT_THRESHOLD = 0.02


def _today() -> datetime:
    return datetime(2026, 9, 3)


def _parse_date(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d")


def _severity(amount: float) -> str:
    if amount > 500:
        return "high"
    if amount > 100:
        return "medium"
    return "low"


def detect_missing_charges(encounters: pd.DataFrame, claims: pd.DataFrame, fee_schedule: pd.DataFrame) -> list[dict]:
    claimed = set(claims["encounter_id"])
    findings = []
    today = _today()

    for _, row in encounters.iterrows():
        if row["encounter_id"] in claimed:
            continue
        enc_date = _parse_date(row["encounter_date"])
        if (today - enc_date).days <= MISSING_CHARGE_DAYS:
            continue

        cpt = row["cpt_documented"]
        expected = fee_schedule.loc[fee_schedule["cpt_code"] == cpt, "expected_amount"].mean()
        amount = round(float(expected), 2)
        days_old = (today - enc_date).days

        findings.append(
            {
                "category": "missing_charge",
                "encounter_id": row["encounter_id"],
                "claim_id": None,
                "provider_id": row["provider_id"],
                "amount_at_risk": amount,
                "severity": _severity(amount),
                "explanation": (
                    f"Encounter on {row['encounter_date']} with provider {row['provider_id']} "
                    f"has no matching claim {days_old} days after the visit."
                ),
                "recommended_action": "Verify charge was entered; submit claim if missing.",
            }
        )
    return findings


def detect_unsubmitted_claims(encounters: pd.DataFrame, claims: pd.DataFrame) -> list[dict]:
    enc_dates = encounters.set_index("encounter_id")["encounter_date"].to_dict()
    today = _today()
    findings = []

    for _, row in claims.iterrows():
        if row["status"] != "not_submitted":
            continue
        enc_date = _parse_date(enc_dates[row["encounter_id"]])
        if (today - enc_date).days <= UNSUBMITTED_DAYS:
            continue

        amount = round(float(row["amount_billed"]), 2)
        findings.append(
            {
                "category": "unsubmitted_claim",
                "encounter_id": row["encounter_id"],
                "claim_id": row["claim_id"],
                "provider_id": encounters.loc[
                    encounters["encounter_id"] == row["encounter_id"], "provider_id"
                ].iloc[0],
                "amount_at_risk": amount,
                "severity": _severity(amount),
                "explanation": (
                    f"Claim {row['claim_id']} for encounter {row['encounter_id']} "
                    f"has status not_submitted {(today - enc_date).days} days after the visit."
                ),
                "recommended_action": "Submit claim to payer or investigate billing hold.",
            }
        )
    return findings


def detect_coding_errors(encounters: pd.DataFrame, claims: pd.DataFrame) -> list[dict]:
    merged = claims.merge(
        encounters[["encounter_id", "cpt_documented", "provider_id", "encounter_date"]],
        on="encounter_id",
    )
    findings = []

    for _, row in merged.iterrows():
        if row["cpt_billed"] == row["cpt_documented"]:
            continue
        amount = round(float(row["amount_billed"]), 2)
        findings.append(
            {
                "category": "coding_error",
                "encounter_id": row["encounter_id"],
                "claim_id": row["claim_id"],
                "provider_id": row["provider_id"],
                "amount_at_risk": amount,
                "severity": _severity(amount),
                "explanation": (
                    f"Claim {row['claim_id']} billed CPT {row['cpt_billed']} but encounter "
                    f"documented CPT {row['cpt_documented']} on {row['encounter_date']}."
                ),
                "recommended_action": "Review coding; correct claim or rebill with documented CPT.",
            }
        )
    return findings


def detect_denied_no_followup(claims: pd.DataFrame, encounters: pd.DataFrame) -> list[dict]:
    today = _today()
    findings = []
    enc_providers = encounters.set_index("encounter_id")["provider_id"].to_dict()

    denied = claims[claims["status"] == "denied"].copy()
    for _, row in denied.iterrows():
        if not row["denial_date"]:
            continue
        denial_date = _parse_date(row["denial_date"])
        if (today - denial_date).days <= DENIAL_FOLLOWUP_DAYS:
            continue

        later = claims[
            (claims["encounter_id"] == row["encounter_id"])
            & (claims["claim_id"] != row["claim_id"])
            & (claims["submission_date"].fillna("") > row["denial_date"])
        ]
        if not later.empty:
            continue

        amount = round(float(row["amount_billed"]), 2)
        findings.append(
            {
                "category": "denied_no_followup",
                "encounter_id": row["encounter_id"],
                "claim_id": row["claim_id"],
                "provider_id": enc_providers[row["encounter_id"]],
                "amount_at_risk": amount,
                "severity": _severity(amount),
                "explanation": (
                    f"Claim {row['claim_id']} denied on {row['denial_date']} "
                    f"({row['denial_reason'] or 'no reason recorded'}) with no resubmission."
                ),
                "recommended_action": "Appeal denial or resubmit corrected claim before deadline.",
            }
        )
    return findings


def detect_underpayments(
    claims: pd.DataFrame, remittances: pd.DataFrame, fee_schedule: pd.DataFrame, encounters: pd.DataFrame
) -> list[dict]:
    paid_claims = claims[claims["status"] == "paid"].merge(remittances, on="claim_id", suffixes=("", "_remit"))
    enc_providers = encounters.set_index("encounter_id")["provider_id"].to_dict()
    findings = []

    for _, row in paid_claims.iterrows():
        payer = row.get("payer") or row.get("payer_remit")
        expected_rows = fee_schedule[
            (fee_schedule["cpt_code"] == row["cpt_billed"]) & (fee_schedule["payer"] == payer)
        ]
        if expected_rows.empty:
            continue
        expected = float(expected_rows.iloc[0]["expected_amount"])
        paid = float(row["amount_paid"])
        delta = expected - paid
        if delta <= expected * UNDERPAYMENT_THRESHOLD:
            continue

        amount = round(delta, 2)
        findings.append(
            {
                "category": "underpayment",
                "encounter_id": row["encounter_id"],
                "claim_id": row["claim_id"],
                "provider_id": enc_providers[row["encounter_id"]],
                "amount_at_risk": amount,
                "severity": _severity(amount),
                "explanation": (
                    f"Claim {row['claim_id']} paid ${paid:.2f} vs expected ${expected:.2f} "
                    f"for CPT {row['cpt_billed']} ({payer})."
                ),
                "recommended_action": "Review remittance advice; file underpayment appeal with payer.",
            }
        )
    return findings


def build_clusters(findings: list[dict]) -> list[dict]:
    """Root-cause clustering for coding errors and denials."""
    clusters: dict[tuple, dict] = {}
    target = {"coding_error", "denied_no_followup"}

    for f in findings:
        if f["category"] not in target:
            continue
        key = (f["provider_id"], f["category"])
        if key not in clusters:
            clusters[key] = {"provider_id": f["provider_id"], "category": f["category"], "count": 0, "total_at_risk": 0.0}
        clusters[key]["count"] += 1
        clusters[key]["total_at_risk"] += f["amount_at_risk"]

    result = []
    for c in clusters.values():
        c["total_at_risk"] = round(c["total_at_risk"], 2)
        c["label"] = (
            f"{c['count']} {c['category'].replace('_', ' ')} findings from provider {c['provider_id']}"
        )
        result.append(c)
    return sorted(result, key=lambda x: x["total_at_risk"], reverse=True)[:5]


def run() -> dict:
    encounters = pd.read_csv(DATA_DIR / "encounters.csv")
    claims = pd.read_csv(DATA_DIR / "claims.csv")
    remittances = pd.read_csv(DATA_DIR / "remittances.csv")
    fee_schedule = pd.read_csv(DATA_DIR / "fee_schedule.csv")

    all_findings: list[dict] = []
    all_findings.extend(detect_missing_charges(encounters, claims, fee_schedule))
    all_findings.extend(detect_unsubmitted_claims(encounters, claims))
    all_findings.extend(detect_coding_errors(encounters, claims))
    all_findings.extend(detect_denied_no_followup(claims, encounters))
    all_findings.extend(detect_underpayments(claims, remittances, fee_schedule, encounters))

    all_findings.sort(key=lambda f: f["amount_at_risk"], reverse=True)
    for i, f in enumerate(all_findings, start=1):
        f["id"] = f"F{i:04d}"

    by_category: dict[str, float] = {
        "missing_charge": 0.0,
        "coding_error": 0.0,
        "unsubmitted_claim": 0.0,
        "denied_no_followup": 0.0,
        "underpayment": 0.0,
    }
    for f in all_findings:
        by_category[f["category"]] += f["amount_at_risk"]
    by_category = {k: round(v, 2) for k, v in by_category.items()}

    output = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "summary": {
            "total_at_risk": round(sum(by_category.values()), 2),
            "by_category": by_category,
            "encounters_analyzed": len(encounters),
            "claims_analyzed": len(claims),
        },
        "findings": all_findings,
        "clusters": build_clusters(all_findings),
    }
    return output


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    FRONTEND_DATA.mkdir(parents=True, exist_ok=True)

    output = run()
    out_path = OUTPUT_DIR / "findings.json"
    front_path = FRONTEND_DATA / "findings.json"

    for path in (out_path, front_path):
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(output, fh, indent=2)

    print(f"Wrote {len(output['findings'])} findings")
    print(f"Total at risk: ${output['summary']['total_at_risk']:,.2f}")
    print(f"Output: {out_path}")
    print(f"Frontend: {front_path}")


if __name__ == "__main__":
    main()
