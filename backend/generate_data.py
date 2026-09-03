"""Generate synthetic RCM datasets with deliberate revenue leakage."""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

# Injection rates — tune at top of script
NUM_ENCOUNTERS = 400
RATE_MISSING_CHARGE = 0.12
RATE_UNSUBMITTED = 0.06
RATE_CODING_ERROR = 0.10
RATE_DENIED_NO_FOLLOWUP = 0.08
RATE_UNDERPAYMENT = 0.12

DATA_DIR = Path(__file__).resolve().parent / "data"
RANDOM_SEED = 42

CPT_CODES = [
    ("99213", 150.0),
    ("99214", 220.0),
    ("99215", 310.0),
    ("93000", 85.0),
    ("71046", 120.0),
    ("80053", 95.0),
    ("36415", 25.0),
    ("90471", 45.0),
]

ICD_CODES = ["E11.9", "I10", "J06.9", "M54.5", "R05", "Z00.00", "K21.0", "N39.0"]
PAYERS = ["Medicare", "BlueCross", "Aetna", "United", "Cigna"]
DENIAL_REASONS = [
    "Missing modifier",
    "Prior auth required",
    "Duplicate claim",
    "Medical necessity",
    "Invalid diagnosis code",
]


def _date_range(start: datetime, days: int) -> datetime:
    return start + timedelta(days=random.randint(0, days))


def build_fee_schedule() -> pd.DataFrame:
    rows = []
    for cpt, base in CPT_CODES:
        for payer in PAYERS:
            factor = 0.9 + random.uniform(0, 0.2)
            rows.append(
                {
                    "cpt_code": cpt,
                    "payer": payer,
                    "expected_amount": round(base * factor, 2),
                }
            )
    return pd.DataFrame(rows)


def generate() -> None:
    random.seed(RANDOM_SEED)
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    start = datetime(2026, 1, 1)
    fee_schedule = build_fee_schedule()
    fee_schedule.to_csv(DATA_DIR / "fee_schedule.csv", index=False)

    encounters = []
    claims = []
    remittances = []
    claim_counter = 1

    for i in range(1, NUM_ENCOUNTERS + 1):
        enc_id = f"ENC{i:05d}"
        patient_id = f"PAT{(i % 120) + 1:04d}"
        provider_id = f"PR{(i % 25) + 1:03d}"
        encounter_date = _date_range(start, 180).strftime("%Y-%m-%d")
        cpt_doc, _ = random.choice(CPT_CODES)
        icd_doc = random.choice(ICD_CODES)

        encounters.append(
            {
                "encounter_id": enc_id,
                "patient_id": patient_id,
                "provider_id": provider_id,
                "encounter_date": encounter_date,
                "cpt_documented": cpt_doc,
                "icd_documented": icd_doc,
            }
        )

        if random.random() < RATE_MISSING_CHARGE:
            continue

        claim_id = f"CLM{claim_counter:05d}"
        claim_counter += 1
        payer = random.choice(PAYERS)
        cpt_billed = cpt_doc
        status = "submitted"
        denial_reason = ""
        denial_date = ""
        submission_date = (
            datetime.strptime(encounter_date, "%Y-%m-%d") + timedelta(days=random.randint(1, 5))
        ).strftime("%Y-%m-%d")

        if random.random() < RATE_UNSUBMITTED:
            status = "not_submitted"
            submission_date = ""
        elif random.random() < RATE_CODING_ERROR:
            alt = [c for c, _ in CPT_CODES if c != cpt_doc]
            cpt_billed = random.choice(alt)
            status = "submitted"
        elif random.random() < RATE_DENIED_NO_FOLLOWUP:
            status = "denied"
            denial_reason = random.choice(DENIAL_REASONS)
            denial_date = (
                datetime.strptime(encounter_date, "%Y-%m-%d") + timedelta(days=random.randint(50, 90))
            ).strftime("%Y-%m-%d")
        else:
            status = "paid"

        expected = fee_schedule.loc[
            (fee_schedule["cpt_code"] == cpt_billed) & (fee_schedule["payer"] == payer),
            "expected_amount",
        ].iloc[0]
        amount_billed = round(expected * random.uniform(0.98, 1.05), 2)

        claims.append(
            {
                "claim_id": claim_id,
                "encounter_id": enc_id,
                "cpt_billed": cpt_billed,
                "icd_billed": icd_doc,
                "amount_billed": amount_billed,
                "status": status,
                "submission_date": submission_date,
                "denial_reason": denial_reason,
                "denial_date": denial_date,
                "payer": payer,
            }
        )

        if status == "paid":
            if random.random() < RATE_UNDERPAYMENT:
                amount_paid = round(expected * random.uniform(0.70, 0.84), 2)
            else:
                amount_paid = round(expected * random.uniform(0.95, 1.0), 2)

            payment_date = (
                datetime.strptime(submission_date or encounter_date, "%Y-%m-%d")
                + timedelta(days=random.randint(14, 45))
            ).strftime("%Y-%m-%d")

            remittances.append(
                {
                    "claim_id": claim_id,
                    "payer": payer,
                    "amount_paid": amount_paid,
                    "payment_date": payment_date,
                }
            )

    pd.DataFrame(encounters).to_csv(DATA_DIR / "encounters.csv", index=False)
    pd.DataFrame(claims).to_csv(DATA_DIR / "claims.csv", index=False)
    pd.DataFrame(remittances).to_csv(DATA_DIR / "remittances.csv", index=False)

    print(f"Generated {len(encounters)} encounters, {len(claims)} claims, {len(remittances)} remittances")


if __name__ == "__main__":
    generate()
