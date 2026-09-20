// Thin client for the Mofid teacher dashboard API.
// Contract lives in /API_CONTRACT.md at the repo root.

const API_BASE = "";
const TOKEN_KEY = "mofid.teacher.token";
const USER_KEY = "mofid.teacher.user";

let onUnauthorized = null;

// The app registers a handler that runs when any request fails with 401
// (expired/revoked session). Sessions are validated server-side and held in
// memory, so a backend restart invalidates the current token silently.
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export function getUsername() {
  return sessionStorage.getItem(USER_KEY) || "";
}

export class ApiError extends Error {
  constructor(status, statusText, detail) {
    super(`${status} ${statusText}`);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.detail = detail;
  }
}

function authHeaders(headers) {
  const merged = new Headers(headers);
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) merged.set("Authorization", `Bearer ${token}`);
  return merged;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: authHeaders(options.headers),
  });
  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      onUnauthorized?.();
    }
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.detail || "";
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(response.status, response.statusText, detail);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function api(path, options) {
  return request(path, options);
}

export function apiForm(path, formData) {
  return request(path, { method: "POST", body: formData });
}