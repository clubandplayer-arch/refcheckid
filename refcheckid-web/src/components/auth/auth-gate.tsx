"use client";

import Link from 'next/link';
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { logoutSession } from "@/lib/auth-client";
import { useSession, type AppRole } from "@/lib/session";

export const roleRedirects: Record<AppRole, string> = {
  admin: '/admin/publication',
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
    if (session.user.role !== allowedRole && session.user.role !== 'admin' && !session.user.availableRoles?.includes(allowedRole)) {
      router.replace(roleRedirects[session.user.role]);
    }
  }, [allowedRole, isReady, router, session]);

  if (!isReady || !session || (session.user.role !== allowedRole && session.user.role !== 'admin' && !session.user.availableRoles?.includes(allowedRole))) {
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
          <nav className="flex flex-wrap gap-3" aria-label="Le tue aree">
            {session.user.role==='admin'?<Link className="text-primary underline" href="/admin/publication">Distribuzione dati</Link>:null}
            {(session.user.availableRoles??[session.user.role]).filter((role)=>role!=='admin').map((role)=><Link key={role} className="text-primary underline" href={roleRedirects[role]}>{({federation:'Gestione ente',referee:'Area arbitro',manager:'Area dirigente'} as Record<string,string>)[role]}</Link>)}
          </nav>
          <Button type="button" onClick={() => void handleLogout()}>
            Logout
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}
