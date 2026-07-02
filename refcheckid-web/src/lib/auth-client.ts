import { getApiBaseUrl } from "./api-base-url";
import type { AppSession } from "./session";

export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "USER_NOT_FOUND"
  | "ACCOUNT_DISABLED";

export interface AuthDiagnostics {
  readonly url: string;
  readonly status?: number;
  readonly responseBody?: unknown;
  readonly corsOrNetworkError?: string;
}

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    readonly diagnostics: AuthDiagnostics,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export async function authenticateWithPassword(input: {
  email: string;
  password: string;
}): Promise<AppSession> {
  const url = `${getApiBaseUrl()}/auth/login`;
  const safePayload = { email: input.email, passwordLength: input.password.length };
  console.info("[RefCheckID][auth] login request", { payload: safePayload, url });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network/CORS error";
    console.warn("[RefCheckID][auth] login network or CORS failure", { error: message, url });
    throw new AuthError("INVALID_CREDENTIALS", "Accesso non riuscito.", {
      corsOrNetworkError: message,
      url,
    });
  }

  const responseText = await response.text();
  const responseBody = parseResponseBody(responseText);
  console.info("[RefCheckID][auth] login response", {
    body: responseBody,
    status: response.status,
    url,
  });

  if (!response.ok) {
    const body = responseBody as { error?: AuthErrorCode; message?: string };
    throw new AuthError(body.error ?? "INVALID_CREDENTIALS", body.message ?? "Accesso non riuscito.", {
      responseBody,
      status: response.status,
      url,
    });
  }

  return responseBody as AppSession;
}

export async function logoutSession(refreshToken: string): Promise<void> {
  await fetch(`${getApiBaseUrl()}/auth/logout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
}

function parseResponseBody(responseText: string): unknown {
  if (responseText.length === 0) {
    return null;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return responseText;
  }
}
