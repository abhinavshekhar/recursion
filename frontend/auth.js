const TOKEN_KEY = "rcm_token";
const USER_KEY = "rcm_user";

// API is served by Flask on the same origin when using start.bat
const API_BASE = window.location.protocol === "file:" ? "http://localhost:5000" : "";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

async function parseJsonResponse(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
      throw new Error(
        "Could not reach the API server. Run start.bat, then open http://localhost:5000/login.html — do not open the HTML file directly."
      );
    }
    throw new Error("Invalid server response. Please restart the app with start.bat.");
  }
}

async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (res.status === 401) {
    clearSession();
    if (!window.location.pathname.endsWith("login.html") && !window.location.pathname.endsWith("register.html")) {
      window.location.href = pageUrl("/login.html");
    }
    throw new Error("Session expired. Please sign in again.");
  }

  return res;
}

function pageUrl(path) {
  return `${API_BASE}${path}`;
}

async function requireAuth() {
  if (!getToken()) {
    window.location.href = pageUrl("/login.html");
    return null;
  }

  const res = await authFetch("/api/auth/me");
  if (!res.ok) {
    window.location.href = pageUrl("/login.html");
    return null;
  }

  const user = await parseJsonResponse(res);
  setSession(getToken(), user);
  return user;
}

async function login(email, password) {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(data.error || "Login failed");
  setSession(data.token, data.user);
  return data;
}

async function register(name, email, password) {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await parseJsonResponse(res);
  if (!res.ok) throw new Error(data.error || "Registration failed");
  setSession(data.token, data.user);
  return data;
}

async function logout() {
  try {
    await authFetch("/api/auth/logout", { method: "POST" });
  } catch {
    // ignore
  }
  clearSession();
  window.location.href = pageUrl("/login.html");
}

function redirectIfAuthenticated() {
  if (getToken()) {
    window.location.href = pageUrl("/dashboard.html");
  }
}

function showError(el, message) {
  el.textContent = message;
  el.classList.remove("hidden");
}

function hideError(el) {
  el.textContent = "";
  el.classList.add("hidden");
}
