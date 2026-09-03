# RCM Revenue Leakage Detector

**Repository:** https://github.com/abhinavshekhar/recursion

Hospitals lose 3–10% of net revenue to leakage across EHR, billing, and clearinghouse systems. This project joins synthetic tabular data and surfaces recoverable dollars in a prioritized worklist dashboard with JWT authentication.

## Quick start

Double-click `start.bat` or run manually:

```bash
cd backend
pip install -r requirements.txt
python generate_data.py
python detect.py
python app.py
```

Open **http://localhost:5000**

### Default login
| Email | Password |
|---|---|
| `admin@rcm.local` | `admin123` |

You can also register a new account at `/register.html`.

## Pages

| Page | URL | Access |
|---|---|---|
| Home | `/` | Public |
| Sign in | `/login.html` | Public |
| Register | `/register.html` | Public |
| Dashboard | `/dashboard.html` | Protected (JWT) |

## Authentication

- **Backend:** Flask + SQLite + bcrypt + JWT (24h expiry)
- **API routes:**
  - `POST /api/auth/register` — create account
  - `POST /api/auth/login` — get JWT token
  - `GET /api/auth/me` — current user (protected)
  - `POST /api/auth/logout` — logout (protected)
  - `GET /api/findings` — leakage data (protected)

## Project structure
```
backend/
  app.py              # Flask server + auth API
  generate_data.py    # synthetic CSVs
  detect.py           # detection rules → findings.json
  users.db            # SQLite user store (auto-created)
frontend/
  index.html          # public landing
  login.html          # sign in
  register.html       # create account
  dashboard.html      # protected app
  auth.js             # JWT client helpers
```

## Detection categories
| Category | Rule |
|---|---|
| `missing_charge` | Encounter has no claim, >3 days old |
| `unsubmitted_claim` | Claim not submitted, >7 days since encounter |
| `coding_error` | Billed CPT ≠ documented CPT |
| `denied_no_followup` | Denied >45 days, no resubmission |
| `underpayment` | Paid amount < contracted rate by >2% |

## Demo pitch (under 3 min)
1. **Hook:** HFMA estimates 3–5% net revenue leakage; Kodiak Solutions found $48B+ denial-driven leakage in 2025.
2. **Live demo:** Hero total → category chart → click 2–3 findings → root-cause clusters.
3. **Differentiator:** Prioritized worklist, not an audit report. Root-cause clustering surfaces systemic issues.
4. **Close:** Production would ingest real EHR exports and 837/835 clearinghouse files.

All data is synthetic — no real PHI.
