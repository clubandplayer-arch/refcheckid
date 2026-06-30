import Link from "next/link";
import { Card } from "@/components/ui/card";
import { refereeDashboard } from "@/lib/referee-mock-data";

export default function RefereeDashboardPage() {
  const nextMatch = refereeDashboard.nextMatch;

  return (
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
            <p className="mt-3 text-sm text-slate-500">
              Nessuna gara assegnata.
            </p>
          )}
        </Card>
        <Card>
          <h2 className="font-semibold">Stato gara</h2>
          <p className="mt-3 rounded-full bg-muted px-3 py-2 text-sm uppercase">
            {nextMatch?.status ?? "empty"}
          </p>
        </Card>
        <Card>
          <h2 className="font-semibold">Notifiche</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {refereeDashboard.notifications.length === 0 ? (
              <li>Nessuna notifica.</li>
            ) : null}
            {refereeDashboard.notifications.map((notification) => (
              <li key={notification}>• {notification}</li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  );
}
