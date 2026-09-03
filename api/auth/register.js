import {
  findUserByEmail,
  addUser,
  nextUserId,
  hashPassword,
  createToken,
  publicUser,
  validateEmail,
  json,
  readBody,
} from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const { name, email, password } = await readBody(req);
    const normalized = (email || "").trim().toLowerCase();
    const cleanName = (name || "").trim();

    if (!cleanName || cleanName.length < 2) {
      return json(res, 400, { error: "Name must be at least 2 characters" });
    }
    if (!validateEmail(normalized)) {
      return json(res, 400, { error: "Invalid email address" });
    }
    if (!password || password.length < 6) {
      return json(res, 400, { error: "Password must be at least 6 characters" });
    }
    if (findUserByEmail(normalized)) {
      return json(res, 409, { error: "Email already registered" });
    }

    const user = addUser({
      id: nextUserId(),
      name: cleanName,
      email: normalized,
      password_hash: await hashPassword(password),
      role: "analyst",
      created_at: new Date().toISOString(),
    });

    return json(res, 201, {
      token: createToken(user),
      user: publicUser(user),
    });
  } catch {
    return json(res, 400, { error: "Invalid request" });
  }
}
