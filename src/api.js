const TOKEN_KEY = "clout_jwt";

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

let onAuthError = null;
export function setAuthErrorHandler(fn) { onAuthError = fn; }

async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (res.status === 401) {
    clearToken();
    if (onAuthError) onAuthError();
    throw new Error(data.error || "Not authenticated");
  }
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
};

// Map snake_case API responses to camelCase for frontend components
export function mapUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatar: u.avatar,
    score: u.score,
    type: u.type,
    controlledBy: u.controlled_by ? (typeof u.controlled_by === "string" ? JSON.parse(u.controlled_by) : u.controlled_by) : null,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  };
}

export function mapTxn(t) {
  return {
    id: t.id,
    fromId: t.from_id,
    toId: t.to_id,
    points: t.points,
    reason: t.reason,
    ts: t.created_at,
  };
}
