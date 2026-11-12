"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AuthGate } from "@/components/auth/auth-gate";
import { PeriodPanel } from "@/features/platform/referee";
import { platformGet, type Appointment } from "@/features/platform/api";
import { useSession } from "@/lib/session";
function Notebook() {
  const search = useSearchParams(),
    fixtureId = search.get("fixtureId") ?? "",
    { session } = useSession();
  const mine = useQuery({
    queryKey: ["platform", "notebook-role", fixtureId, session?.user.id],
    queryFn: () =>
      platformGet<{ fixtureId: string; role: Appointment["role"] }>(
        `games/${fixtureId}/access`,
      ),
    enabled: !!fixtureId,
  });
  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <Link className="text-blue-700 underline" href="/referee">
        ← Le tue designazioni
      </Link>
      <h1 className="text-3xl font-bold">Taccuino digitale</h1>
      <p>
        Registra gli eventi, verifica la sincronizzazione e conferma ogni fine
        periodo. Il referto resta riservato.
      </p>
      {!fixtureId ? (
        <p>Apri il taccuino dalla designazione della partita.</p>
      ) : mine.isError ? (
        <p role="alert">{mine.error.message}</p>
      ) : mine.data ? (
        <PeriodPanel
          key={fixtureId}
          fixtureId={fixtureId}
          role={mine.data.role}
          notebook
        />
      ) : (
        <p>Caricamento incarico…</p>
      )}
    </main>
  );
}
export default function NotebookPage() {
  return (
    <AuthGate allowedRole="referee">
      <Suspense fallback={<p>Caricamento…</p>}>
        <Notebook />
      </Suspense>
    </AuthGate>
  );
}
