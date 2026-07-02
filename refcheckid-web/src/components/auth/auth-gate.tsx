"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { logoutSession } from "@/lib/auth-client";
import { useSession, type AppRole } from "@/lib/session";

export const roleRedirects: Record<AppRole, string> = {
  federation: "/federation",
  manager: "/manager",
  referee: "/referee",
};

export function AuthGate({
  allowedRole,
  children,
}: Readonly<{ allowedRole: AppRole; children: React.ReactNode }>) {
  const router = useRouter();
  const { isReady, logout, session } = useSession();

  useEffect(() => {
    if (!isReady) return;
    if (!session) {
      router.replace("/");
      return;
    }
    if (session.user.role !== allowedRole) {
      router.replace(roleRedirects[session.user.role]);
    }
  }, [allowedRole, isReady, router, session]);

  if (!isReady || !session || session.user.role !== allowedRole) {
    return <main className="mx-auto max-w-6xl p-6">Verifica sessione…</main>;
  }

  async function handleLogout() {
    if (session) {
      await logoutSession(session.refreshToken);
    }
    logout();
    router.replace("/");
  }

  return (
    <div>
      <div className="border-b bg-background px-6 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between text-sm">
          <span>{session.user.displayName}</span>
          <Button type="button" onClick={() => void handleLogout()}>
            Logout
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}
