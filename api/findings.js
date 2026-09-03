import { getBearer, verifyToken, json } from "./lib/auth.js";
import findings from "./data/findings.json" with { type: "json" };

export default function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const token = getBearer(req);
  if (!token) {
    return json(res, 401, { error: "Authentication required" });
  }
  if (!verifyToken(token)) {
    return json(res, 401, { error: "Invalid or expired token" });
  }

  return json(res, 200, findings);
}
