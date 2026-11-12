"use client";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/session";
import { platformGet, platformPost, type GameEvent } from "./api";
interface Progress {
  phase: string;
  period: number;
  seconds: number;
  runningSince: string | null;
  revision: number;
}
export function MatchClock({
  fixtureId,
  role,
}: {
  fixtureId: string;
  role: string;
}) {
  const { session } = useSession(),
    client = useQueryClient(),
    [tick, setTick] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["platform", "game", fixtureId, session?.user.id],
    queryFn: () =>
      platformGet<{
        progress: Progress | null;
        recognitionStatus: string;
        reportStatus: string | null;
        summary: { state: string } | null;
      }>(`games/${fixtureId}`),
  });
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const data = query.data,
    clock = data?.progress,
    seconds =
      (clock?.seconds ?? 0) +
      (clock?.runningSince
        ? Math.max(
            0,
            Math.floor(
              ((tick || Date.now()) - Date.parse(clock.runningSince)) / 1000,
            ),
          )
        : 0);
  const locked =
    data?.recognitionStatus !== "locked" ||
    data?.reportStatus === "submitted" ||
    data?.summary?.state === "final_confirmed" ||
    role !== "principal";
  async function command(action: string) {
    setBusy(true);
    setError("");
    try {
      await platformPost(`games/${fixtureId}/clock`, {
        action,
        revision: clock?.revision ?? 0,
        operationId: crypto.randomUUID(),
      });
      await client.invalidateQueries({
        queryKey: ["platform", "game", fixtureId],
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Orologio non aggiornato: verifica la connessione.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border bg-slate-50 p-4">
      <h2 className="font-bold">Orologio di gara</h2>
      <p className="font-mono text-4xl" aria-live="off">
        {String(Math.floor(seconds / 60)).padStart(2, "0")}:
        {String(seconds % 60).padStart(2, "0")}
      </p>
      <p className="text-sm">
        Periodo {clock?.period ?? 1} ·{" "}
        {clock?.phase === "suspended"
          ? "Sospesa"
          : clock?.phase === "interval"
            ? "Intervallo"
            : clock?.phase === "finished"
              ? "Terminata"
              : clock?.runningSince
                ? "In corso"
                : "Orologio fermo"}
        . L’orologio aiuta l’inserimento; il minuto degli eventi può essere
        corretto.
      </p>
      {data?.recognitionStatus !== "locked" ? (
        <p>Completa il riconoscimento prima di avviare la gara.</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!clock || clock.phase === "interval" ? (
          <Button
            disabled={locked || busy}
            onClick={() => void command("start")}
          >
            Avvia periodo
          </Button>
        ) : clock.runningSince ? (
          <Button
            disabled={locked || busy}
            onClick={() => void command("pause")}
          >
            Ferma orologio
          </Button>
        ) : (
          <Button
            disabled={locked || busy}
            onClick={() => void command("resume")}
          >
            Riprendi orologio
          </Button>
        )}
        <Button
          disabled={locked || busy || !clock}
          onClick={() => void command("suspend")}
        >
          Sospendi gara
        </Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
interface Player {
  registrationId: string;
  clubId: string;
  name: string;
  shirtNumber: number | null;
}
export function QuickCapture({
  players,
  home,
  away,
  sport,
  period,
  onAdd,
  progress,
  minutesPerPeriod = 45,
}: {
  players: Player[];
  home: { id: string; name: string };
  away: { id: string; name: string };
  sport: string;
  period: number;
  onAdd: (event: GameEvent) => void;
  minutesPerPeriod?: number;
  progress?: { seconds: number; runningSince: string | null } | null;
}) {
  const [clubId, setClubId] = useState(home.id),
    [player, setPlayer] = useState(""),
    [incoming, setIncoming] = useState(""),
    [minute, setMinute] = useState(""),
    [type, setType] = useState<GameEvent["type"]>(
      sport === "football" ? "goal" : sport === "basketball" ? "points" : "set",
    ),
    [error, setError] = useState("");
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const automatic =
      Math.floor(
        ((progress?.seconds ?? 0) +
          (progress?.runningSince
            ? Math.max(0, (tick - Date.parse(progress.runningSince)) / 1000)
            : 0)) /
          60,
      ) + (sport === "football" ? (period - 1) * minutesPerPeriod : 0),
    eventMinute = minute === "" ? automatic : Number(minute);
  const options =
    sport === "football"
      ? [
          ["goal", "Gol"],
          ["own_goal", "Autorete"],
          ["yellow", "Ammonizione"],
          ["red", "Espulsione"],
          ["substitution", "Sostituzione"],
        ]
      : sport === "basketball"
        ? [
            ["points", "Punti"],
            ["substitution", "Sostituzione"],
          ]
        : [
            ["set", "Set vinto"],
            ["substitution", "Sostituzione"],
          ];
  function add(points: number) {
    if (
      (type !== "set" && !player) ||
      (type === "substitution" && (!incoming || incoming === player))
    ) {
      setError("Seleziona i giocatori della squadra interessata.");
      return;
    }
    if (!Number.isInteger(eventMinute) || eventMinute < 0) {
      setError("Minuto non valido.");
      return;
    }
    onAdd({
      id: crypto.randomUUID(),
      type,
      clubId,
      registrationId: type === "set" ? null : player,
      incomingRegistrationId: type === "substitution" ? incoming : null,
      minute: eventMinute,
      stoppage: 0,
      points: ["goal", "own_goal", "set", "points"].includes(type) ? points : 0,
      period,
    });
    setMinute("");
    setError("");
  }
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h3 className="font-bold">Inserimento rapido</h3>
      <div className="flex flex-wrap gap-2">
        {options.map(([value, label]) => (
          <Button
            key={value}
            type="button"
            aria-pressed={type === value}
            className={
              type === value ? "ring-2 ring-blue-700 ring-offset-2" : ""
            }
            onClick={() => setType(value as GameEvent["type"])}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Squadra evento
          <select
            aria-label="Squadra evento"
            className="block w-full rounded border p-3"
            value={clubId}
            onChange={(e) => {
              setClubId(e.target.value);
              setPlayer("");
              setIncoming("");
            }}
          >
            <option value={home.id}>{home.name}</option>
            <option value={away.id}>{away.name}</option>
          </select>
        </label>
        <label>
          Minuto evento
          <input
            className="block w-full rounded border p-3"
            type="number"
            min="0"
            max="300"
            value={minute === "" ? String(automatic) : minute}
            onChange={(e) => setMinute(e.target.value)}
          />
        </label>
        {type !== "set" ? (
          <label>
            Giocatore evento
            <select
              aria-label="Giocatore evento"
              className="block w-full rounded border p-3"
              value={player}
              onChange={(e) => setPlayer(e.target.value)}
            >
              <option value="">Seleziona…</option>
              {players
                .filter((p) => p.clubId === clubId)
                .map((p) => (
                  <option value={p.registrationId} key={p.registrationId}>
                    #{p.shirtNumber ?? "—"} · {p.name}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        {type === "substitution" ? (
          <label>
            Entrante
            <select
              aria-label="Entrante"
              className="block w-full rounded border p-3"
              value={incoming}
              onChange={(e) => setIncoming(e.target.value)}
            >
              <option value="">Seleziona…</option>
              {players
                .filter(
                  (p) => p.clubId === clubId && p.registrationId !== player,
                )
                .map((p) => (
                  <option key={p.registrationId} value={p.registrationId}>
                    #{p.shirtNumber ?? "—"} · {p.name}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="flex gap-2">
        {(type === "points" ? [1, 2, 3] : [1]).map((points) => (
          <Button key={points} type="button" onClick={() => add(points)}>
            {type === "points" ? `Registra +${points}` : "Registra evento"}
          </Button>
        ))}
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
