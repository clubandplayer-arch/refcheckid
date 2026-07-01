"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { roleRedirects } from "@/components/auth/auth-gate";
import { LoginForm } from "@/features/manager/login-form";
import { useSession } from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const { isReady, session } = useSession();

  useEffect(() => {
    if (isReady && session) {
      router.replace(roleRedirects[session.user.role]);
    }
  }, [isReady, router, session]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-6">
      <LoginForm />
    </main>
  );
}
