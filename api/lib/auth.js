import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || "rcm-vercel-secret-change-me";
const JWT_EXPIRY = "24h";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function loadUsers() {
  if (!globalThis.__rcmUsers) {
    const file = path.join(__dirname, "..", "data", "users.json");
    globalThis.__rcmUsers = JSON.parse(fs.readFileSync(file, "utf8"));
  }
  return globalThis.__rcmUsers;
}

export function findUserByEmail(email) {
  return loadUsers().find((u) => u.email === email.toLowerCase());
}

export function findUserById(id) {
  return loadUsers().find((u) => String(u.id) === String(id));
}

export function addUser(user) {
  const users = loadUsers();
  users.push(user);
  globalThis.__rcmUsers = users;
  return user;
}

export function nextUserId() {
  const users = loadUsers();
  return users.reduce((max, u) => Math.max(max, u.id), 0) + 1;
}

export function createToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function getBearer(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.created_at,
  };
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function checkPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function validateEmail(email) {
  return EMAIL_RE.test(email);
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

export function loadFindings() {
  const candidates = [
    path.join(__dirname, "..", "data", "findings.json"),
    path.join(__dirname, "..", "..", "frontend", "data", "findings.json"),
    path.join(process.cwd(), "api", "data", "findings.json"),
    path.join(process.cwd(), "frontend", "data", "findings.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  }
  throw new Error("Findings data file not found");
}
