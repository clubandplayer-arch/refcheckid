import type { AppSession } from "./session";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

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
  const response = await fetch(`${apiBaseUrl}/auth/login`, {
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
  await fetch(`${apiBaseUrl}/auth/logout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
}
