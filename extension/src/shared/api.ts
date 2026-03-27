import { getAuthState, getConfig } from "./storage";

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(params: { status: number; message: string; payload: unknown }) {
    super(params.message);
    this.status = params.status;
    this.payload = params.payload;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const [config, auth] = await Promise.all([getConfig(), getAuthState()]);
  const url = new URL(path, config.backendBaseUrl);
  const headers = new Headers(init?.headers ?? {});
  if (init?.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (auth.jwtToken) headers.set("authorization", `Bearer ${auth.jwtToken}`);

  let response: Response;
  try {
    response = await fetch(url.toString(), { ...init, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch";
    throw new Error(`${message}. url=${url.toString()}`);
  }

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { message: text };
    }
  }

  if (!response.ok) {
    const message =
      (json && typeof json === "object" && json !== null && "message" in json && typeof (json as any).message === "string"
        ? (json as any).message
        : `Request failed (${response.status})`);
    throw new ApiError({ status: response.status, message, payload: json });
  }
  return json as T;
}
