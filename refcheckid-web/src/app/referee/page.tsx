"use client";

import { AuthGate } from "@/components/auth/auth-gate";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/ui/state";
import { queryKeys } from "@/lib/api-client";
import { fetchRefereeDashboard } from "@/lib/referee-api-client";

export default function RefereeDashboardPage() {
  const dashboardQuery = useQuery({
    queryFn: fetchRefereeDashboard,
    queryKey: [...queryKeys.referees, "dashboard"],
  });

  if (dashboardQuery.isLoading)
    return (
      <main className="mx-auto max-w-6xl p-6">
        <SkeletonBlock />
      </main>
    );
  if (dashboardQuery.isError)
    return (
      <main className="mx-auto max-w-6xl p-6">
        <ErrorState
          message={dashboardQuery.error.message}
          onRetry={() => void dashboardQuery.refetch()}
        />
      </main>
    );

  const dashboard = dashboardQuery.data;
  if (!dashboard) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <EmptyState message="Dashboard arbitro non disponibile." />
      </main>
    );
  }

  const nextMatch = dashboard.nextMatch;

  return (
    <AuthGate allowedRole="referee">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Area Arbitro</p>
          <h1 className="text-3xl font-bold">Dashboard</h1>
        </div>
        <Link
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          href="/referee/match"
        >
          Apri gara
        </Link>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="font-semibold">Prossima gara</h2>
          {nextMatch ? (
            <div className="mt-3 space-y-1 text-sm">
              <p className="text-lg font-bold">
                {nextMatch.homeTeam} - {nextMatch.awayTeam}
              </p>
              <p>{new Date(nextMatch.scheduledAt).toLocaleString("it-IT")}</p>
              <p>{nextMatch.venue}</p>
            </div>
          ) : (
            <EmptyState message="Nessuna gara assegnata." />
          )}
        </Card>
        <Card>
          <h2 className="font-semibold">Stato gara</h2>
          <p className="mt-3 rounded-full bg-muted px-3 py-2 text-sm font-semibold">
            {formatMatchStatus(nextMatch?.status)}
          </p>
        </Card>
        <Card>
          <h2 className="font-semibold">Notifiche</h2>
          {dashboard.notifications.length === 0 ? (
            <EmptyState message="Nessuna notifica." />
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {dashboard.notifications.map((notification) => (
                <li key={notification}>• {notification}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      </main>
    </AuthGate>
  );
}

function formatMatchStatus(status: string | undefined): string {
  return {
    completed: "Completata",
    empty: "Nessuna gara",
    recognition: "Riconoscimento in corso",
    scheduled: "Programmata",
  }[status ?? "empty"] ?? status ?? "Nessuna gara";
}
