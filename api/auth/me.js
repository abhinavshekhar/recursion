import { getBearer, verifyToken, findUserById, publicUser, json } from "../lib/auth.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const token = getBearer(req);
  if (!token) {
    return json(res, 401, { error: "Authentication required" });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return json(res, 401, { error: "Invalid or expired token" });
  }

  const user = findUserById(payload.sub);
  if (!user) {
    return json(res, 404, { error: "User not found" });
  }

  return json(res, 200, publicUser(user));
}
