"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGate } from "@/components/auth/auth-gate";
import { useSession } from "@/lib/session";
import {
  ProfileEditor,
  DeploymentReadiness,
} from "@/features/profiles/profiles";
function Page() {
  const { session } = useSession(),
    search = useSearchParams();
  return (
    <AuthGate allowedRole={session?.user.role ?? "manager"}>
      <main className="mx-auto max-w-4xl p-6">
        <ProfileEditor
          initialKind={search.get("kind") ?? undefined}
          initialId={search.get("id") ?? undefined}
        />
        <DeploymentReadiness />
      </main>
    </AuthGate>
  );
}
export default function ProfilePage() {
  return (
    <Suspense fallback={<p>Caricamento…</p>}>
      <Page />
    </Suspense>
  );
}
