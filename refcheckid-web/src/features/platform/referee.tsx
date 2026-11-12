"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { useSession } from "@/lib/session";
import {
  platformGet,
  platformPost,
  type Appointment,
  type Fixture,
  type Competition,
  type GameSummary,
  type GameEvent,
  type Page,
} from "./api";
import { NotificationInbox } from "./notifications";
import { ActionForm, Pager } from "./forms";
import { MatchClock, QuickCapture } from "./notebook-controls";
import { EventArchive } from "./event-archive";
import { statusName } from "./workspace";
interface Mine extends Appointment {
  fixture: Fixture;
  operational: boolean;
  delegationActive: boolean;
}
interface GameContext {
  recognitionStatus?: string;
  progress?: { seconds: number; runningSince: string | null } | null;
  reportStatus: string | null;
  fixture: Fixture;
  competition: Competition;
  summary: GameSummary | null;
  events: GameEvent[];
  home: { id: string; name: string };
  away: { id: string; name: string };
  players: {
    registrationId: string;
    clubId: string;
    name: string;
    shirtNumber: number | null;
    role: string;
  }[];
}
export function MyAppointments() {
  const { session } = useSession();
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [activeFixture, setActiveFixture] = useState("");
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const query = useQuery({
    queryKey: ["platform", "my-appointments", session?.user.id, cursors.at(-1)],
    queryFn: () =>
      platformGet<Page<Mine>>(
        `my-appointments${cursors.at(-1) ? "?cursor=" + encodeURIComponent(cursors.at(-1)!) : ""}`,
      ),
    refetchInterval: 30000,
  });
  const officials = useQuery({
    queryKey: ["platform", "my-officials", session?.user.id],
    queryFn: () =>
      platformGet<{ id: string; firstName: string; lastName: string }[]>(
        "my-officials",
      ),
  });
  return (
    <Card className="space-y-3">
      <h2 className="text-xl font-bold">Le tue designazioni</h2>
      <NotificationInbox />
      {query.isError ? <p role="alert">{query.error.message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {query.data?.items.length === 0 ? (
        <p>
          Non hai ancora ricevuto designazioni. Il responsabile della tua
          struttura può invitarti alla prossima gara.
        </p>
      ) : null}
      {officials.data?.length ? (
        <ActionForm
          title="Comunica un’indisponibilità"
          button="Salva indisponibilità"
          fields={[
            {
              key: "officialId",
              label: "Anagrafica arbitrale",
              options: officials.data.map((o) => ({
                id: o.id,
                name: `${o.firstName} ${o.lastName}`,
              })),
            },
            { key: "from", label: "Da", type: "datetime-local" },
            { key: "until", label: "A", type: "datetime-local" },
            { key: "notes", label: "Note", optional: true },
          ]}
          onSubmit={async (data) => {
            await platformPost("unavailability", data);
            setError("");
          }}
        />
      ) : null}
      {query.data?.items.map((row) => (
        <div className="space-y-2 rounded-lg border p-3" key={row.id}>
          <p className="font-semibold">
            Gara {row.fixture.externalCode} ·{" "}
            {new Date(row.fixture.scheduledAt).toLocaleString("it-IT")}
          </p>
          <p>
            {row.fixture.venue} · {statusName(row.role)} ·{" "}
            {statusName(row.status)}
          </p>
          {!row.delegationActive ? (
            <p className="text-amber-700">
              La delega della struttura non è attiva. Contatta il designatore.
            </p>
          ) : null}
          {row.status === "invited" && row.delegationActive ? (
            <div className="flex gap-2">
              {["accept", "decline"].map((action) => (
                <Button
                  key={action}
                  type="button"
                  onClick={async () => {
                    setError("");
                    try {
                      await platformPost(`appointments/${row.id}/change`, {
                        action,
                        notes:
                          action === "decline"
                            ? "Indisponibilità comunicata dall’arbitro"
                            : "",
                      });
                      await client.invalidateQueries();
                    } catch (error) {
                      setError(
                        error instanceof Error
                          ? error.message
                          : "Risposta non riuscita.",
                      );
                    }
                  }}
                >
                  {action === "accept"
                    ? "Accetta gara"
                    : "Comunica indisponibilità"}
                </Button>
              ))}
            </div>
          ) : null}
          {row.operational ? (
            <>
              {row.role === "principal" ? (
                <Link
                  className="block text-blue-700 underline"
                  href={`/referee/match?matchId=${encodeURIComponent(row.fixture.matchId)}`}
                >
                  Apri distinta e riconoscimento di questa gara
                </Link>
              ) : null}
              <Link
                className="block font-semibold text-blue-700 underline"
                href={`/referee/notebook?fixtureId=${encodeURIComponent(row.fixtureId)}`}
              >
                Apri taccuino digitale
              </Link>
              <Button
                type="button"
                onClick={() =>
                  setActiveFixture(
                    activeFixture === row.fixtureId ? "" : row.fixtureId,
                  )
                }
              >
                {activeFixture === row.fixtureId
                  ? "Chiudi aggiornamenti"
                  : "Apri aggiornamenti gara"}
              </Button>
              {activeFixture === row.fixtureId ? (
                <PeriodPanel fixtureId={row.fixtureId} role={row.role} />
              ) : null}
            </>
          ) : null}
        </div>
      ))}
      <Pager
        next={query.data?.nextCursor ?? null}
        previous={cursors.length > 1}
        onPrevious={() => setCursors((c) => c.slice(0, -1))}
        onNext={() => setCursors((c) => [...c, query.data?.nextCursor ?? null])}
      />
    </Card>
  );
}
export function PeriodPanel({
  fixtureId,
  role = "principal",
  notebook = false,
}: {
  fixtureId: string;
  notebook?: boolean;
  role?: Appointment["role"];
}) {
  const { session } = useSession();
  const queryClient=useQueryClient();
  const query = useQuery({
    queryKey: ["platform", "game", fixtureId, session?.user.id],
    queryFn: () => platformGet<GameContext>(`games/${fixtureId}`),
    refetchOnWindowFocus: false,
  });
  const storageKey = `refcheckid:period:${session?.user.id}:${fixtureId}`;
  const draftKey = `${storageKey}:draft`;
  const [draftBase, setDraftBase] = useState<number | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]),
    [period, setPeriod] = useState(1),
    [correctionReason, setCorrectionReason] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState<Record<string, unknown> | null>(null),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false);
  const [autoLive, setAutoLive] = useState(notebook);
  const editRef = useRef({ events, period, correctionReason });
  editRef.current = { events, period, correctionReason };
  useEffect(() => {
    if (query.data && !dirty && !pending) {
      setEvents(query.data.events);
      setPeriod(
        query.data.summary?.state === "period_confirmed"
          ? Math.min(
              query.data.summary.period + 1,
              query.data.competition.rules.periods,
            )
          : (query.data.summary?.period ?? 1),
      );
    }
  }, [query.data, dirty, pending]);
  useEffect(() => {
    try {
      const value = localStorage.getItem(storageKey);
      if (value) {
        const saved = JSON.parse(value) as Record<string, unknown>;
        setPending(saved);
        if (Array.isArray(saved.events)) setEvents(saved.events as GameEvent[]);
        if (typeof saved.period === "number") setPeriod(saved.period);
        setMessage(
          "Aggiornamento non ancora confermato dal server. Controlla e sincronizza.",
        );
      }
      if (!value || notebook) {
        const draft = localStorage.getItem(draftKey);
        if (draft) {
          const saved = JSON.parse(draft) as {
            events: GameEvent[];
            period: number;
            revision: number;
            correctionReason: string;
          };
          if (
            Array.isArray(saved.events) &&
            Number.isInteger(saved.period) &&
            Number.isInteger(saved.revision)
          ) {
            setEvents(saved.events);
            setPeriod(saved.period);
            setDraftBase(saved.revision);
            setCorrectionReason(saved.correctionReason ?? "");
            setDirty(true);
            setMessage(
              "Bozza locale recuperata. Controlla gli eventi prima della conferma.",
            );
          }
        }
      }
    } catch {
      setError("Impossibile recuperare la bozza locale.");
    }
  }, [storageKey, draftKey, notebook]);
  const context = query.data;
  const summary = context?.summary;
  const refetch = query.refetch;
  useEffect(() => {
    if (!dirty || (pending && !notebook) || !context) return;
    const revision = draftBase ?? context.summary?.revision ?? 0;
    if (draftBase === null) setDraftBase(revision);
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ events, period, revision, correctionReason }),
      );
    } catch {
      setError(
        "Impossibile salvare la bozza sul dispositivo: non chiudere la schermata.",
      );
    }
  }, [
    events,
    period,
    correctionReason,
    dirty,
    pending,
    context,
    draftBase,
    draftKey,
    notebook,
  ]);
  let homeScore = 0,
    awayScore = 0;
  for (const event of events)
    if (["goal", "own_goal", "points", "set"].includes(event.type)) {
      const home = event.clubId === context?.home.id;
      const credited = event.type === "own_goal" ? !home : home;
      if (credited) homeScore += event.points;
      else awayScore += event.points;
    }
  const transmit = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError("");
      try {
        const saved = await platformPost<GameSummary>(
          `games/${fixtureId}/periods`,
          body,
        );
        queryClient.setQueryData<GameContext>(['platform','game',fixtureId,session?.user.id],previous=>previous?{...previous,summary:saved,events:body.events as GameEvent[]}:previous);
        const newer =
          notebook &&
          (JSON.stringify(editRef.current.events) !==
            JSON.stringify(body.events) ||
            editRef.current.period !== body.period ||
            editRef.current.correctionReason !== (body.correctionReason ?? ""));
        localStorage.removeItem(storageKey);
        if (newer) {
          setDraftBase(saved.revision);
          setDirty(true);
          localStorage.setItem(
            draftKey,
            JSON.stringify({ ...editRef.current, revision: saved.revision }),
          );
        } else {
          localStorage.removeItem(draftKey);
          setDraftBase(null);
          setDirty(false);
        }
        setPending(null);
        setMessage("Aggiornamento ricevuto e salvato dal server.");
        await refetch();
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          Number(error.status) >= 400 &&
          Number(error.status) < 500
        )
          setAutoLive(false);
        setError(
          error instanceof Error
            ? error.message
            : "Non sincronizzato. Riprova quando torna la connessione.",
        );
      } finally {
        setBusy(false);
      }
    },
    [fixtureId, storageKey, draftKey, refetch, notebook,queryClient,session?.user.id],
  );
  useEffect(() => {
    const retry = () => {
      if (pending && !busy) void transmit(pending);
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [pending, busy, transmit]);
  function submit(state: string) {
    const body = {
      operationId: crypto.randomUUID(),
      revision: draftBase ?? summary?.revision ?? 0,
      period,
      homeScore,
      awayScore,
      events,
      state,
      correctionReason,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(body));
      setPending(body);
    } catch {
      setError("Spazio locale non disponibile: non chiudere questa schermata.");
      return;
    }
    void transmit(body);
  }
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    if (!notebook || !autoLive || !dirty || pending || busy || !context) return;
    const timer = setTimeout(() => submitRef.current("provisional"), 700);
    return () => clearTimeout(timer);
  }, [
    notebook,
    autoLive,
    dirty,
    pending,
    busy,
    events,
    period,
    correctionReason,
    context,
  ]);
  if (query.isLoading) return <p>Caricamento riepilogo gara…</p>;
  if (query.isError) return <p role="alert">{query.error.message}</p>;
  if (!context) return null;
  const eventTypes =
    context.competition.sport === "football"
      ? [
          { id: "goal", name: "Gol" },
          { id: "own_goal", name: "Autorete" },
          { id: "yellow", name: "Ammonizione" },
          { id: "red", name: "Espulsione" },
          { id: "substitution", name: "Sostituzione" },
        ]
      : context.competition.sport === "basketball"
        ? [
            { id: "points", name: "Canestro / tiro libero" },
            { id: "substitution", name: "Sostituzione" },
          ]
        : [
            { id: "set", name: "Set vinto" },
            { id: "substitution", name: "Sostituzione" },
          ];
  return (
    <details
      open={notebook || undefined}
      className="space-y-3 rounded-xl border p-3"
    >
      <summary className="cursor-pointer font-semibold">
        Aggiornamenti gara · {context.home.name} – {context.away.name}
      </summary>
      {notebook ? (
        <>
          <MatchClock fixtureId={fixtureId} role={role} />
          <label className="block">
            <input
              type="checkbox"
              checked={autoLive}
              onChange={(e) => setAutoLive(e.target.checked)}
            />{" "}
            Trasmetti automaticamente gli eventi provvisori
          </label>
        </>
      ) : null}
      <p>
        Confronta gli eventi, conferma alla fine di ogni periodo e al termine
        della gara. Senza connessione l’aggiornamento resta sul dispositivo
        finché il server non lo riceve.
      </p>
      {summary ? (
        <p className="text-sm">
          Sul server: {summary.homeScore} – {summary.awayScore} ·{" "}
          {statusName(summary.state)} ·{" "}
          {new Date(summary.confirmedAt).toLocaleString("it-IT")}
        </p>
      ) : null}
      {pending ? (
        <div className="space-y-2 rounded-lg bg-amber-50 p-3">
          <p>
            Un aggiornamento attende la sincronizzazione. Non modificare altri
            dati finché non viene risolto.
          </p>
          <Button
            type="button"
            disabled={busy}
            onClick={() => void transmit(pending)}
          >
            Sincronizza aggiornamento salvato
          </Button>
          {notebook ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setAutoLive(false);
                localStorage.removeItem(storageKey);
                setPending(null);
                setDirty(true);
                setMessage(
                  "Bozza mantenuta: correggi i dati prima di inviare nuovamente.",
                );
              }}
            >
              Rivedi la bozza senza inviare
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "La bozza non inviata verrà eliminata da questo dispositivo. Vuoi ricaricare i dati del server?",
                )
              ) {
                localStorage.removeItem(storageKey);
                setPending(null);
                setDirty(false);
                void query.refetch();
              }
            }}
          >
            Confronta ripartendo dai dati server
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      <fieldset
        disabled={
          (!!pending && !notebook) ||
          busy ||
          context.reportStatus === "submitted" ||
          (!!context.recognitionStatus &&
            context.recognitionStatus !== "locked")
        }
        className="space-y-3"
      >
        <label>
          Periodo
          <select
            className="ml-2 rounded border p-2"
            value={period}
            onChange={(e) => {
              setPeriod(Number(e.target.value));
              setDirty(true);
            }}
          >
            {Array.from(
              { length: context.competition.rules.periods },
              (_, i) => (
                <option value={i + 1} key={i}>
                  {i + 1}
                </option>
              ),
            )}
          </select>
        </label>
        <p className="text-xl font-bold">
          Riepilogo: {homeScore} – {awayScore}
        </p>
        {notebook ? (
          <QuickCapture
            progress={context.progress ?? null}
            players={context.players}
            home={context.home}
            away={context.away}
            sport={context.competition.sport}
            minutesPerPeriod={context.competition.rules.minutesPerPeriod}
            period={period}
            onAdd={(event) => {
              setEvents((value) => [...value, event]);
              setDirty(true);
            }}
          />
        ) : null}
        <ActionForm
          title="Aggiungi evento al riepilogo"
          button="Aggiungi evento"
          fields={[
            { key: "type", label: "Evento", options: eventTypes },
            {
              key: "clubId",
              label: "Squadra",
              options: [
                { id: context.home.id, name: context.home.name },
                { id: context.away.id, name: context.away.name },
              ],
            },
            {
              key: "registrationId",
              label: "Giocatore (facoltativo solo per set)",
              optional: true,
              options: context.players.map((p) => ({
                id: p.registrationId,
                name: `${p.name} · #${p.shirtNumber ?? "—"} · ${p.clubId === context.home.id ? context.home.name : context.away.name}`,
              })),
            },
            {
              key: "incomingRegistrationId",
              label: "Giocatore entrante (solo sostituzione)",
              optional: true,
              options: context.players.map((p) => ({
                id: p.registrationId,
                name: p.name,
              })),
            },
            { key: "minute", label: "Minuto", type: "number", value: "0" },
            { key: "stoppage", label: "Recupero", type: "number", value: "0" },
            {
              key: "points",
              label: "Punti (solo basket)",
              type: "number",
              value: "1",
            },
          ]}
          onSubmit={async (data) => {
            setEvents((value) => [
              ...value,
              {
                id: crypto.randomUUID(),
                type: String(data.type) as GameEvent["type"],
                clubId: String(data.clubId),
                registrationId: String(data.registrationId) || null,
                incomingRegistrationId:
                  String(data.incomingRegistrationId) || null,
                period,
                minute: Number(data.minute),
                stoppage: Number(data.stoppage),
                points:
                  data.type === "points"
                    ? Number(data.points)
                    : ["goal", "own_goal", "set"].includes(String(data.type))
                      ? 1
                      : 0,
              },
            ]);
            setDirty(true);
          }}
        />
        {events.map((event) => (
          <div
            className="flex items-center justify-between gap-2 rounded border p-2 text-sm"
            key={event.id}
          >
            <span>
              Periodo {event.period} · {event.minute}′
              {event.stoppage ? `+${event.stoppage}` : ""} ·{" "}
              {eventTypes.find((t) => t.id === event.type)?.name} ·{" "}
              {context.players.find(
                (p) => p.registrationId === event.registrationId,
              )?.name ??
                (event.clubId === context.home.id
                  ? context.home.name
                  : context.away.name)}
            </span>
            <Button
              type="button"
              onClick={() => {
                setEvents((value) =>
                  value.filter((row) => row.id !== event.id),
                );
                setDirty(true);
              }}
            >
              Rimuovi
            </Button>
          </div>
        ))}
        <label className="block">
          Motivazione della rettifica (obbligatoria per modificare dati già
          confermati)
          <textarea
            className="block w-full rounded border p-2"
            value={correctionReason}
            onChange={(e) => {
              setCorrectionReason(e.target.value);
              setDirty(true);
            }}
            maxLength={2000}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => submit("provisional")}>
            Invia aggiornamento provvisorio
          </Button>
          {role === "principal" ? (
            <>
              <Button type="button" onClick={() => submit("period_confirmed")}>
                Conferma fine periodo, anche senza eventi
              </Button>
              <Button type="button" onClick={() => submit("final_confirmed")}>
                Conferma fine gara
              </Button>
            </>
          ) : (
            <p>La conferma ufficiale spetta all’arbitro principale.</p>
          )}
        </div>
      </fieldset>
      {context.reportStatus === "submitted" ? (
        <p className="rounded-lg bg-emerald-50 p-3">
          Referto inviato: i dati sono in sola lettura.
          {role === "principal" ? (
            <Link
              className="block text-blue-700 underline"
              href={`/referee/report?fixtureId=${fixtureId}`}
            >
              Rileggi il tuo referto riservato
            </Link>
          ) : null}
        </p>
      ) : role === "principal" && summary?.state === "final_confirmed" ? (
        <ActionForm
          title="Invia il referto finale"
          button="Conferma e invia referto"
          fields={[{ key: "notes", label: "Note arbitrali", optional: true }]}
          onSubmit={async (data) => {
            await platformPost(`games/${fixtureId}/report`, data);
            setMessage("Referto inviato alla federazione.");
            await query.refetch();
          }}
        />
      ) : null}
      <EventArchive fixtureId={fixtureId} />
    </details>
  );
}

export function ActiveGameUpdates({
  matchId,
  onResolved,
}: {
  matchId: string;
  onResolved?: (value: boolean) => void;
}) {
  const { session } = useSession();
  const query = useQuery({
    queryKey: ["platform", "match-game", matchId, session?.user.id],
    queryFn: () =>
      platformGet<{ fixtureId: string | null; role: Appointment["role"] }>(
        `match-game/${matchId}`,
      ),
    enabled: !!matchId,
  });
  useEffect(() => {
    if (query.data) onResolved?.(!!query.data.fixtureId);
  }, [query.data, onResolved]);
  if (query.isError)
    return (
      <div className="lg:col-span-2" role="alert">
        <p>{query.error.message}</p>
        <Button type="button" onClick={() => void query.refetch()}>
          Riprova caricamento gara
        </Button>
      </div>
    );
  return query.data?.fixtureId ? (
    <div className="lg:col-span-2">
      <PeriodPanel fixtureId={query.data.fixtureId} role={query.data.role} />
    </div>
  ) : null;
}
