"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { platformGet } from "@/features/platform/api";
import { useSession } from "@/lib/session";
export function PrivateReport({ referee = false }: { referee?: boolean }) {
  const id = useSearchParams().get("fixtureId") ?? "",
    { session } = useSession();
  const query = useQuery({
    queryKey: ["private-report", id, session?.user.id],
    queryFn: () =>
      platformGet<{ summary: string; status: string } | null>(
        `games/${id}/report`,
      ),
    enabled: !!id,
    retry: false,
  });
  let notes = "";
  if (query.data) {
    try {
      const value = JSON.parse(query.data.summary) as { refereeNotes?: string };
      notes = value.refereeNotes ?? "";
    } catch {
      notes = query.data.summary;
    }
  }
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-5">
      <Link
        href={referee ? "/referee" : "/federation"}
        className="text-blue-700 underline"
      >
        ← Area riservata
      </Link>
      <h1 className="text-3xl font-bold">Referto riservato</h1>
      <p>
        Comunicazione dell’arbitro alla federazione competente. Esclusa dal
        portale risultati e dai dati pubblicabili.
      </p>
      {!id ? (
        <p>Apri il referto dalla gara nella gestione federale.</p>
      ) : query.isError ? (
        <p role="alert">{query.error.message}</p>
      ) : query.data ? (
        <>
          <p>
            Stato: {query.data.status === "submitted" ? "Inviato" : "Bozza"}
          </p>
          <h2 className="font-bold">Note arbitrali riservate</h2>
          <p className="whitespace-pre-wrap rounded border p-4">
            {notes || "Nessuna nota."}
          </p>
          <details>
            <summary>Contenuto completo del referto</summary>
            <pre className="overflow-auto whitespace-pre-wrap rounded border p-3 text-sm">
              {query.data.summary}
            </pre>
          </details>
        </>
      ) : query.isLoading ? (
        <p>Caricamento…</p>
      ) : (
        <p>Referto non ancora presente.</p>
      )}
    </main>
  );
}
