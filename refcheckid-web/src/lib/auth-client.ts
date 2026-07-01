import { getApiBaseUrl } from "./api-base-url";
import type { AppSession } from "./session";

export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "USER_NOT_FOUND"
  | "ACCOUNT_DISABLED";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export async function authenticateWithPassword(input: {
  email: string;
  password: string;
}): Promise<AppSession> {
  const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json()) as { error?: AuthErrorCode; message?: string };
    throw new AuthError(body.error ?? "INVALID_CREDENTIALS", body.message ?? "Accesso non riuscito.");
  }

  return (await response.json()) as AppSession;
}

export async function logoutSession(refreshToken: string): Promise<void> {
  await fetch(`${getApiBaseUrl()}/auth/logout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
}
