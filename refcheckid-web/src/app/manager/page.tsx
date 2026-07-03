"use client";

import { AuthGate } from "@/components/auth/auth-gate";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/ui/state";
import { fetchManagerDashboard, queryKeys } from "@/lib/api-client";

export default function ManagerDashboardPage() {
  const dashboardQuery = useQuery({
    queryFn: fetchManagerDashboard,
    queryKey: [...queryKeys.manager, "dashboard"],
  });

  if (dashboardQuery.isLoading)
    return (
      <main className="mx-auto max-w-6xl p-6">
        <SkeletonBlock />
      </main>
    );
  if (dashboardQuery.isError) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <ErrorState
          message={dashboardQuery.error.message}
          onRetry={() => void dashboardQuery.refetch()}
        />
      </main>
    );
  }

  const dashboard = dashboardQuery.data;
  if (!dashboard) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <EmptyState message="Dashboard dirigente non disponibile." />
      </main>
    );
  }

  const nextMatch = dashboard.nextMatch;

  return (
    <AuthGate allowedRole="manager">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Area Dirigente</p>
          <h1 className="text-3xl font-bold">Dashboard</h1>
        </div>
        <Link
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          href="/manager/match-sheet"
        >
          Apri distinta
        </Link>
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h2 className="font-semibold">Prossima gara</h2>
          {nextMatch ? (
            <div className="mt-3 space-y-1 text-sm">
              <p className="text-lg font-bold">{nextMatch.opponent}</p>
              <p>{new Date(nextMatch.scheduledAt).toLocaleString("it-IT")}</p>
              <p>{nextMatch.venue}</p>
            </div>
          ) : (
            <EmptyState message="Nessuna gara programmata." />
          )}
        </Card>
        <Card>
          <h2 className="font-semibold">Stato distinta</h2>
          <p className="mt-3 rounded-full bg-muted px-3 py-2 text-sm font-semibold">
            {formatMatchSheetStatus(dashboard.matchSheetStatus)}
          </p>
        </Card>
        <Card>
          <h2 className="font-semibold">Notifiche</h2>
          {dashboard.notifications.length === 0 ? (
            <EmptyState message="Nessuna notifica." />
          ) : null}
          <ul className="mt-3 space-y-2 text-sm">
            {dashboard.notifications.map((notification) => (
              <li key={notification}>• {notification}</li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
    </AuthGate>
  );
}

function formatMatchSheetStatus(status: string): string {
  return {
    draft: "Bozza — da completare e inviare",
    locked: "Presa in carico dall’arbitro",
    submitted: "Inviata — in attesa dell’arbitro",
  }[status] ?? status;
}
