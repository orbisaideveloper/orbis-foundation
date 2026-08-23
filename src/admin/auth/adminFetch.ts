import { supabase } from "../../core/supabase/client";
import type { AdminAccessResponse } from "../../contracts/admin.contracts";

export type AdminAccessResult =
  | "ADMIN"
  | "ACCESS_DENIED"
  | "INVALID_SESSION"
  | "UNAVAILABLE";

export class AdminFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminFetchError";
  }
}

async function fetchWithAccessToken(
  input: RequestInfo | URL,
  accessToken: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(input, { ...init, headers });
}

export async function checkAdminAccess(
  accessToken: string,
): Promise<AdminAccessResult> {
  if (!accessToken) return "INVALID_SESSION";

  try {
    const response = await fetchWithAccessToken(
      "/api/system/access",
      accessToken,
    );

    if (response.status === 401) return "INVALID_SESSION";
    if (response.status === 403) return "ACCESS_DENIED";
    if (!response.ok) return "UNAVAILABLE";

    const data = (await response.json()) as Partial<AdminAccessResponse>;
    return data.success === true && data.role === "ADMIN"
      ? "ADMIN"
      : "UNAVAILABLE";
  } catch {
    return "UNAVAILABLE";
  }
}

export async function authenticatedAdminFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (error || !accessToken) {
    throw new AdminFetchError("Sign in is required to access Admin tools.");
  }

  return fetchWithAccessToken(input, accessToken, init);
}

export async function readAdminJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<T> {
  const response = await authenticatedAdminFetch(input, init);
  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new AdminFetchError(
      "The Admin service returned an invalid response.",
    );
  }

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : "The Admin request could not be completed.";
    throw new AdminFetchError(message);
  }

  return data as T;
}
