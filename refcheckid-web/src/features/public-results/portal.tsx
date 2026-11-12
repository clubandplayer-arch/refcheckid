"use client";
import {sportCatalog} from "refcheckid-backend/sports";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { getApiBaseUrl } from "@/lib/api-base-url";
import { Card } from "@/components/ui/card";
import { Pager } from "@/features/platform/forms";
import type { Page } from "@/features/platform/api";
interface PublicCompetition {
  id: string;
  name: string;
  sport: string;
  season: string;
  category: string;
  group: string;
}
interface PublicEvent {
  id: string;
  type: string;
  period: number;
  minute: number;
  stoppage: number;
  points: number;
  team: "home" | "away";
  participant: { name?: string; id?: string };
  incoming: { name?: string; id?: string };
}
interface PublicGame {
  homeLogoUrl?:string|null;awayLogoUrl?:string|null;
  liveUpdates: boolean;
  id: string;
  competition: PublicCompetition;
  home: string;
  away: string;
  scheduledAt: string;
  venue: string;
  round: string;
  phase: string;
  certification: string;
  score: { home: number; away: number } | null;
  period: number | null;
  revision: number;
  updatedAt: string;
  events: PublicEvent[];
}
async function getPublic<T>(path: string): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}/public/${path}`, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "Questi dati non sono pubblicati."
        : "Risultati momentaneamente non disponibili.",
    );
  return response.json() as Promise<T>;
}
const phaseNames: Record<string, string> = {
  scheduled: "Programmata",
  live: "In corso",
  interval: "Intervallo",
  finished: "Terminata",
  suspended: "Sospesa",
  cancelled: "Annullata",
};
const certificationNames: Record<string, string> = {
  awaiting: "In attesa di conferma",
  provisional: "Aggiornamento provvisorio",
  referee_confirmed: "Confermato dall’arbitro",
  homologated: "Omologato dalla federazione",
};
const eventNames: Record<string, string> = {
  goal: "Gol",
  own_goal: "Autorete",
  yellow: "Ammonizione",
  red: "Espulsione",
  substitution: "Sostituzione",
  points: "Punti",
  set: "Set vinto",
};
function ConnectionState() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online ? null : (
    <p
      role="status"
      className="rounded border border-amber-500 bg-amber-50 p-3"
    >
      Connessione assente: i dati visualizzati risalgono all’ultimo
      aggiornamento ricevuto.
    </p>
  );
}
export function ResultsPortal() {
  const [competitionId, setCompetitionId] = useState(""),
    [sport, setSport] = useState(""),
    [catalogCursors, setCatalogCursors] = useState<(string | null)[]>([null]),
    [cursors, setCursors] = useState<(string | null)[]>([null]);
  const catalog = useQuery({
    queryKey: ["public", "competitions", sport, catalogCursors.at(-1)],
    queryFn: () =>
      getPublic<Page<PublicCompetition>>(
        `competitions?${new URLSearchParams({ ...(sport ? { sport } : {}), ...(catalogCursors.at(-1) ? { cursor: catalogCursors.at(-1)! } : {}) })}`,
      ),
    refetchInterval: 5000,
    retry: false,
  });
  const choices =
      catalog.data?.items.filter((row) => !sport || row.sport === sport) ?? [],
    selected = choices.find((row) => row.id === competitionId) ?? choices[0],
    id = selected?.id ?? "";
  const fixtures = useQuery({
    queryKey: ["public", "fixtures", id, cursors.at(-1)],
    queryFn: () =>
      getPublic<Page<PublicGame>>(
        `competitions/${id}/fixtures${cursors.at(-1) ? "?cursor=" + encodeURIComponent(cursors.at(-1)!) : ""}`,
      ),
    enabled: !!id,
    refetchInterval: 5000,
    retry: false,
  });
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-5">
      <ConnectionState />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-blue-700">
            RefCheckID · Risultati ufficiali
          </p>
          <h1 className="text-3xl font-bold">
            Il campo, raccontato dagli arbitri
          </h1>
        </div>
        <Link className="text-blue-700 underline" href="/">
          Accesso operatori
        </Link>
      </header>
      <p>
        Risultati e dettagli trasmessi dagli ufficiali di gara. Gli
        aggiornamenti durante il gioco sono provvisori; conferma arbitrale e
        omologazione federale hanno stati distinti.
      </p>
      <Card className="space-y-3">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Disciplina
            <select
              aria-label="Disciplina risultati"
              className="block w-full rounded border p-3"
              value={sport}
              onChange={(e) => {
                setSport(e.target.value);
                setCatalogCursors([null]);
                setCompetitionId("");
                setCursors([null]);
              }}
            >
              <option value="">Tutte</option>
              {sportCatalog.map(sport=><option key={sport.id} value={sport.id}>{sport.name}</option>)}
            </select>
          </label>
          <label>
            Campionato
            <select
              aria-label="Campionato risultati"
              className="block w-full rounded border p-3"
              value={id}
              onChange={(e) => {
                setCompetitionId(e.target.value);
                setCursors([null]);
              }}
            >
              {!id ? (
                <option value="">Nessun campionato disponibile</option>
              ) : null}
              {choices.map((row) => (
                <option value={row.id} key={row.id}>
                  {row.name} · {row.season} · {row.group || row.category}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Pager
          next={catalog.data?.nextCursor ?? null}
          previous={catalogCursors.length > 1}
          onPrevious={() => {
            setCatalogCursors((c) => c.slice(0, -1));
            setCompetitionId("");
          }}
          onNext={() => {
            setCatalogCursors((c) => [...c, catalog.data?.nextCursor ?? null]);
            setCompetitionId("");
          }}
        />
        {catalog.isError ? (
          <p role="alert">{catalog.error.message}</p>
        ) : catalog.data && !id ? (
          <p>
            Non ci sono campionati pubblicati per questa selezione. La
            pubblicazione richiede un’autorizzazione esplicita.
          </p>
        ) : null}
      </Card>
      {id && fixtures.isError ? (
        <p role="alert">{fixtures.error.message}</p>
      ) : id ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {fixtures.data?.items.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
          <Pager
            next={fixtures.data?.nextCursor ?? null}
            previous={cursors.length > 1}
            onPrevious={() => setCursors((c) => c.slice(0, -1))}
            onNext={() =>
              setCursors((c) => [...c, fixtures.data?.nextCursor ?? null])
            }
          />
          {fixtures.data?.items.length === 0 ? (
            <p>Non sono presenti gare.</p>
          ) : null}
        </>
      ) : null}
      <footer className="border-t pt-4 text-sm text-slate-600">
        Aggiornamento ogni 5 secondi con connessione disponibile. Le
        informazioni riservate dei referti non fanno parte di questo portale.
      </footer>
    </main>
  );
}
export function PublicGamePage({ fixtureId }: { fixtureId: string }) {
  const query = useQuery({
    queryKey: ["public", "game", fixtureId],
    queryFn: () => getPublic<PublicGame>(`games/${fixtureId}`),
    refetchInterval: 5000,
    retry: false,
  });
  return (
    <main className="mx-auto max-w-4xl space-y-5 p-5">
      <Link href="/results" className="text-blue-700 underline">
        ← Tutti i campionati
      </Link>
      <ConnectionState />
      <h1 className="text-3xl font-bold">Dettaglio ufficiale della gara</h1>
      {query.isError ? (
        <p role="alert">{query.error.message}</p>
      ) : query.data ? (
        <GameCard game={query.data} detail />
      ) : (
        <p>Caricamento…</p>
      )}
    </main>
  );
}
function GameCard({
  game,
  detail = false,
}: {
  game: PublicGame;
  detail?: boolean;
}) {
  const color =
    game.phase === "live"
      ? "bg-emerald-100 text-emerald-900"
      : game.phase === "finished"
        ? "bg-blue-100 text-blue-900"
        : game.phase === "suspended"
          ? "bg-amber-100 text-amber-900"
          : "bg-slate-100 text-slate-900";
  return (
    <Card className="space-y-3">
      <p className="text-sm">
        {game.competition.name} · {game.competition.season} · Giornata{" "}
        {game.round}
      </p>
      <span
        className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${color}`}
      >
        {phaseNames[game.phase] ?? game.phase}
      </span>
      <h2 className="text-xl font-bold">
        <span className="flex items-center gap-3">{game.homeLogoUrl?<Image unoptimized width={48} height={48} src={game.homeLogoUrl} alt={`Logo ${game.home}`} className="h-12 w-12 object-contain"/>:null}{game.home} – {game.away}{game.awayLogoUrl?<Image unoptimized width={48} height={48} src={game.awayLogoUrl} alt={`Logo ${game.away}`} className="h-12 w-12 object-contain"/>:null}</span>
      </h2>
      <p className="text-4xl font-bold" aria-label="Punteggio">
        {game.score ? `${game.score.home} – ${game.score.away}` : "—"}
      </p>
      <p>{certificationNames[game.certification]}</p>
      {game.period ? (
        <p className="text-sm">Riepilogo del periodo {game.period}</p>
      ) : null}
      {!game.liveUpdates && game.phase === "live" && game.score ? (
        <p className="text-sm">
          È mostrato l’ultimo dato confermato, non il punteggio provvisorio del
          periodo in corso.
        </p>
      ) : null}
      <p className="text-sm">
        {new Date(game.scheduledAt).toLocaleString("it-IT")} · {game.venue}
      </p>
      {game.score ? (
        <p className="text-xs text-slate-600">
          Ultimo aggiornamento ricevuto:{" "}
          {new Date(game.updatedAt).toLocaleString("it-IT")} · Versione{" "}
          {game.revision}
        </p>
      ) : null}
      {detail ? (
        <div className="space-y-2">
          <h3 className="font-bold">Eventi pubblicati</h3>
          {game.events.length === 0 ? (
            <p>
              Nessun evento pubblicato. La visibilità dei dettagli dipende dalle
              autorizzazioni del campionato.
            </p>
          ) : (
            game.events.map((event) => (
              <p className="rounded border p-2 text-sm" key={event.id}>
                Periodo {event.period} · {event.minute}′
                {event.stoppage ? `+${event.stoppage}` : ""} ·{" "}
                {eventNames[event.type]} ·{" "}
                {event.team === "home" ? game.home : game.away}
                {event.participant.name ? ` · ${event.participant.name}` : ""}
                {event.incoming.name ? ` → ${event.incoming.name}` : ""}
                {event.type === "points" ? ` · +${event.points}` : ""}
              </p>
            ))
          )}
        </div>
      ) : (
        <Link
          href={`/results/${game.id}`}
          className="inline-block text-blue-700 underline"
        >
          Apri dettagli gara
        </Link>
      )}
    </Card>
  );
}
