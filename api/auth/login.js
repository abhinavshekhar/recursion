import {
  findUserByEmail,
  checkPassword,
  createToken,
  publicUser,
  json,
  readBody,
} from "../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  try {
    const { email, password } = await readBody(req);
    const normalized = (email || "").trim().toLowerCase();

    if (!normalized || !password) {
      return json(res, 400, { error: "Email and password are required" });
    }

    const user = findUserByEmail(normalized);
    if (!user || !(await checkPassword(password, user.password_hash))) {
      return json(res, 401, { error: "Invalid email or password" });
    }

    return json(res, 200, {
      token: createToken(user),
      user: publicUser(user),
    });
  } catch {
    return json(res, 400, { error: "Invalid request" });
  }
}
