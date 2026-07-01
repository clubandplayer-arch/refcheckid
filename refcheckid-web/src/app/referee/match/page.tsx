import { AuthGate } from "@/components/auth/auth-gate";
import Link from "next/link";
import { RefereeMatchWorkflow } from "@/features/referee/referee-match-workflow";

export default function RefereeMatchPage() {
  return (
    <AuthGate allowedRole="referee">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <Link className="text-sm text-primary" href="/referee">
            ← Torna alla dashboard
          </Link>
          <h1 className="text-3xl font-bold">Gestione gara arbitro</h1>
        </div>
      </header>
        <RefereeMatchWorkflow />
      </main>
    </AuthGate>
  );
}
