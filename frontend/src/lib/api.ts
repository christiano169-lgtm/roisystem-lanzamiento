const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function getToken(): string | null {
  return localStorage.getItem('roisystem_token');
}

/**
 * Thin fetch wrapper: builds the full URL, attaches the JWT (see
 * lib/auth.tsx) when present, and normalizes every non-2xx response into an
 * ApiError with the backend's own message (src/middleware/errorHandler.ts
 * always replies `{ error: string }`).
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  // An expired/invalid token leaves `roisystem_token` in localStorage, which
  // makes useAuth().isAuthenticated stay true (it only checks presence, not
  // validity) — every API call then silently 401s instead of bouncing back
  // to login. Force it here so a stale session degrades to "log in again"
  // instead of a confusing "couldn't load" error on every page.
  if (response.status === 401 && path !== '/auth/login') {
    localStorage.removeItem('roisystem_token');
    localStorage.removeItem('roisystem_user');
    window.location.href = '/login';
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.error ?? `Request failed with status ${response.status}`, response.status);
  }

  return data as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined });
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE' });
}
