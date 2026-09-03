import { getBearer, verifyToken, loadFindings, json } from "../lib/auth.js";

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

  try {
    return json(res, 200, loadFindings());
  } catch {
    return json(res, 503, { error: "Findings data not available" });
  }
}
