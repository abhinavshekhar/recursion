"""Flask server with JWT authentication and static frontend."""

from __future__ import annotations

import json
import os
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

import bcrypt
import jwt
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
DB_PATH = BASE_DIR / "users.db"
FINDINGS_PATH = FRONTEND_DIR / "data" / "findings.json"

JWT_SECRET = os.environ.get("JWT_SECRET", "rcm-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24

app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
CORS(app, supports_credentials=True)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'analyst',
                created_at TEXT NOT NULL
            )
            """
        )
        count = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
        if count == 0:
            pw_hash = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode()
            conn.execute(
                "INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
                ("Admin User", "admin@rcm.local", pw_hash, "admin", datetime.now(timezone.utc).isoformat()),
            )


def create_token(user_id: int, email: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None


def get_bearer_token() -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = get_bearer_token()
        if not token:
            return jsonify({"error": "Authentication required"}), 401
        payload = decode_token(token)
        if not payload:
            return jsonify({"error": "Invalid or expired token"}), 401
        request.user = payload
        return f(*args, **kwargs)

    return wrapper


def user_row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "created_at": row["created_at"],
    }


@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name or len(name) < 2:
        return jsonify({"error": "Name must be at least 2 characters"}), 400
    if not EMAIL_RE.match(email):
        return jsonify({"error": "Invalid email address"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
                (name, email, pw_hash, "analyst", datetime.now(timezone.utc).isoformat()),
            )
            user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Email already registered"}), 409

    token = create_token(user["id"], user["email"], user["role"])
    return jsonify({"token": token, "user": user_row_to_dict(user)}), 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    with get_db() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

    if not user or not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return jsonify({"error": "Invalid email or password"}), 401

    token = create_token(user["id"], user["email"], user["role"])
    return jsonify({"token": token, "user": user_row_to_dict(user)})


@app.route("/api/auth/me", methods=["GET"])
@login_required
def me():
    with get_db() as conn:
        user = conn.execute("SELECT * FROM users WHERE id = ?", (int(request.user["sub"]),)).fetchone()
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user_row_to_dict(user))


@app.route("/api/auth/logout", methods=["POST"])
@login_required
def logout():
    return jsonify({"message": "Logged out successfully"})


@app.route("/api/findings", methods=["GET"])
@login_required
def findings():
    if not FINDINGS_PATH.exists():
        return jsonify({"error": "Findings data not generated yet. Run detect.py first."}), 503
    with open(FINDINGS_PATH, encoding="utf-8") as fh:
        return jsonify(json.load(fh))


@app.route("/")
def index_page():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:filename>", methods=["GET"])
def static_files(filename):
    if filename.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    return send_from_directory(FRONTEND_DIR, filename)


if __name__ == "__main__":
    init_db()
    print("Default login: admin@rcm.local / admin123")
    print("Server: http://localhost:5000")
    app.run(host="0.0.0.0", port=5000, debug=True)
