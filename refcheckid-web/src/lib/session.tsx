"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "./api-base-url";

export type AppRole = "manager" | "referee" | "federation";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: AppRole;
  displayName: string;
}

export interface AppSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: AuthenticatedUser;
}

const storageKey = "refcheckid.session";

interface SessionContextValue {
  session: AppSession | null;
  isReady: boolean;
  login: (session: AppSession) => void;
  refreshSession: () => Promise<AppSession | null>;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [session, setSession] = useState<AppSession | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setSession(readStoredSession());
    setIsReady(true);
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      isReady,
      login(nextSession) {
        writeStoredSession(nextSession);
        setSession(nextSession);
      },
      async refreshSession() {
        const currentSession = readStoredSession();
        if (currentSession === null) {
          setSession(null);
          return null;
        }

        const refreshedSession = await refreshStoredSession(currentSession.refreshToken);
        if (refreshedSession === null) {
          window.localStorage.removeItem(storageKey);
          setSession(null);
          return null;
        }

        writeStoredSession(refreshedSession);
        setSession(refreshedSession);
        return refreshedSession;
      },
      logout() {
        window.localStorage.removeItem(storageKey);
        setSession(null);
      },
    }),
    [isReady, session],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === null) {
    throw new Error("useSession must be used inside SessionProvider.");
  }
  return context;
}

export function readStoredSession(): AppSession | null {
  if (typeof window === "undefined") return null;
  const rawSession = window.localStorage.getItem(storageKey);
  if (!rawSession) return null;
  try {
    const session = JSON.parse(rawSession) as AppSession;
    return isValidSession(session) ? session : null;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: AppSession): void {
  window.localStorage.setItem(storageKey, JSON.stringify(session));
}

export function isSessionExpired(session: AppSession): boolean {
  return Date.parse(session.expiresAt) <= Date.now();
}

export async function refreshStoredSession(refreshToken: string): Promise<AppSession | null> {
  const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as AppSession;
}

function isValidSession(session: AppSession): boolean {
  return Boolean(
    session.accessToken &&
      session.refreshToken &&
      session.expiresAt &&
      session.user?.id &&
      session.user.email &&
      session.user.role,
  );
}
