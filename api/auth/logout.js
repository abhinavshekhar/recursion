import { getBearer, verifyToken, json } from "../lib/auth.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const token = getBearer(req);
  if (!token || !verifyToken(token)) {
    return json(res, 401, { error: "Invalid or expired token" });
  }

  return json(res, 200, { message: "Logged out successfully" });
}
