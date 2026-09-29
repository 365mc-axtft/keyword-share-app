const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

export class ApiClientError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getToken(): string | null {
  return localStorage.getItem("auth_token");
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  isFormData?: boolean;
  query?: Record<string, string | undefined | null>;
}

function buildQuery(query?: Record<string, string | undefined | null>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, v);
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export async function apiFetch<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.isFormData) {
    body = opts.body as FormData;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const res = await fetch(`${API_BASE}${path}${buildQuery(opts.query)}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  if (!res.ok) {
    if (isJson) {
      const errBody = await res.json().catch(() => ({}));
      throw new ApiClientError(res.status, errBody.error ?? "UNKNOWN", errBody.message ?? res.statusText);
    }
    throw new ApiClientError(res.status, "UNKNOWN", res.statusText);
  }
  if (res.status === 204) return undefined as T;
  if (isJson) return res.json();
  return (await res.blob()) as unknown as T;
}

export function apiFileUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export { getToken };
export const API_BASE_URL = API_BASE;
