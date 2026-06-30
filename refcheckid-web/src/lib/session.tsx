"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AppRole = "manager" | "referee" | "federation";

export interface AppSession {
  actorId: string;
  roles: readonly AppRole[];
}

const storageKey = "refcheckid.session";

interface SessionContextValue {
  session: AppSession | null;
  login: (session: AppSession) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [session, setSession] = useState<AppSession | null>(null);

  useEffect(() => {
    setSession(readStoredSession());
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      login(nextSession) {
        window.localStorage.setItem(storageKey, JSON.stringify(nextSession));
        setSession(nextSession);
      },
      logout() {
        window.localStorage.removeItem(storageKey);
        setSession(null);
      },
    }),
    [session],
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
    return session.actorId ? session : null;
  } catch {
    return null;
  }
}
