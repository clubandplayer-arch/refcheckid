import { AuthGate } from "@/components/auth/auth-gate";
import Link from "next/link";
import { MatchSheetWorkflow } from "@/features/manager/match-sheet-workflow";

export default function MatchSheetPage() {
  return (
    <AuthGate allowedRole="manager">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <Link className="text-sm text-primary" href="/manager">
          ← Dashboard
        </Link>
        <h1 className="text-3xl font-bold">Distinta gara</h1>
        <p className="text-sm text-slate-500">
          Completa convocati, ordine, staff e riepilogo prima dell’invio.
        </p>
      </header>
        <MatchSheetWorkflow />
      </main>
    </AuthGate>
  );
}
