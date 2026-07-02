"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/ui/state";
import { useToast } from "@/components/ui/toast";
import { queryKeys } from "@/lib/api-client";
import {
  cautionReasons,
  countGoalsByTeam,
  expulsionReasons,
  goalTypes,
  reportTeams,
  resolveReportPlayerName,
  validateReportDraft,
} from "@/lib/referee-report-validation";
import {
  completeRecognition,
  fetchRecognitionSubjects,
  fetchRefereeDashboard,
  fetchRefereeMatchSheets,
  fetchRefereeReport,
  lockSubmittedSheetsAndStartRecognition,
  submitRefereeReport,
} from "@/lib/referee-api-client";
import type {
  MatchReportDraft,
  MatchReportEvent,
  RecognitionDecision,
  TeamSheetVerification,
} from "@/lib/referee-types";
import { useSession } from "@/lib/session";
import { saveSubmittedFederationReport } from "@/lib/submitted-report";

const steps = ["Distinte", "Riconoscimento", "Referto"] as const;
const reportSteps = [
  "Risultato",
  "Gol",
  "Ammonizioni",
  "Espulsioni",
  "Sostituzioni",
  "Note",
  "Riepilogo",
] as const;

export function RefereeMatchWorkflow() {
  const [step, setStep] = useState(0);
  const [recognitionLocked, setRecognitionLocked] = useState(false);
  const [fullRecognitionComplete, setFullRecognitionComplete] = useState(false);
  const { session } = useSession();
  const dashboardQuery = useQuery({
    enabled: Boolean(session),
    queryFn: fetchRefereeDashboard,
    queryKey: [...queryKeys.referees, "dashboard"],
  });
  const matchId = dashboardQuery.data?.nextMatch?.id ?? "";

  if (!session) return <ErrorState message="Sessione richiesta." />;
  if (dashboardQuery.isLoading) return <SkeletonBlock />;
  if (dashboardQuery.isError)
    return (
      <ErrorState
        message={dashboardQuery.error.message}
        onRetry={() => void dashboardQuery.refetch()}
      />
    );
  if (!matchId) return <EmptyState message="Nessuna gara assegnata." />;

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-2">
        {steps.map((label, index) => {
          const isRecognitionStepDisabled = recognitionLocked && index === 1;
          return (
            <button
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                step === index ? "bg-primary text-white" : "bg-muted"
              } ${isRecognitionStepDisabled ? "cursor-not-allowed opacity-50" : ""}`}
              disabled={isRecognitionStepDisabled}
              key={label}
              onClick={() => {
                if (!isRecognitionStepDisabled) setStep(index);
              }}
              type="button"
            >
              {index + 1}. {label}
            </button>
          );
        })}
      </aside>
      {step === 0 ? (
        <SheetVerificationStep matchId={matchId} onStart={() => setStep(1)} />
      ) : null}
      {step === 1 ? (
        <RecognitionStep
          isLocked={recognitionLocked}
          matchId={matchId}
          onComplete={() => {
            setRecognitionLocked(true);
            setFullRecognitionComplete(true);
            setStep(2);
          }}
        />
      ) : null}
      {step === 2 ? (
        <MatchReportStep
          fullRecognitionComplete={fullRecognitionComplete}
          matchId={matchId}
        />
      ) : null}
    </div>
  );
}

function SheetVerificationStep({
  matchId,
  onStart,
}: Readonly<{ matchId: string; onStart: () => void }>) {
  const query = useQuery({
    queryFn: () => fetchRefereeMatchSheets(matchId),
    queryKey: [...queryKeys.matchSheets, matchId],
  });
  const mutation = useMutation({
    mutationFn: () => lockSubmittedSheetsAndStartRecognition(matchId),
    onSuccess: onStart,
  });
  if (query.isLoading) return <SkeletonBlock />;
  if (query.isError)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  const sheets = query.data ?? [];
  const missingAwaySheet = sheets.some(
    (sheet) => sheet.team === "away" && sheet.status === "missing",
  );
  const canStart =
    sheets.length > 0 && sheets.every((sheet) => sheet.status !== "missing");
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Verifica distinte</h2>
        <p className="text-sm text-slate-500">
          Controlla casa, ospite e stato prima di avviare il riconoscimento.
        </p>
      </div>
      {sheets.length === 0 ? (
        <EmptyState message="Nessuna distinta disponibile." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sheets.map((sheet) => (
            <TeamSheetCard key={sheet.id} sheet={sheet} />
          ))}
        </div>
      )}
      {missingAwaySheet ? (
        <p className="rounded-lg bg-red-100 p-3 text-sm font-semibold text-red-900">
          Distinta ospite mancante
        </p>
      ) : null}
      <Button
        disabled={!canStart || mutation.isPending}
        onClick={() => mutation.mutate()}
        type="button"
      >
        Inizia riconoscimento
      </Button>
    </Card>
  );
}

function TeamSheetCard({ sheet }: Readonly<{ sheet: TeamSheetVerification }>) {
  const statusLabel = {
    locked: "LOCKED · pronta per riconoscimento",
    missing: "MISSING · distinta non disponibile",
    submitted: "SUBMITTED · in attesa di lock",
  }[sheet.status];
  const statusClass = {
    locked: "bg-green-100 text-green-800",
    missing: "bg-red-100 text-red-800",
    submitted: "bg-blue-100 text-blue-800",
  }[sheet.status];
  const sideLabel = sheet.team === "home" ? "Squadra casa" : "Squadra ospite";

  return (
    <div className="rounded-xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-primary">
            {sideLabel}
          </p>
          <h3 className="mt-1 text-lg font-bold">{sheet.clubName}</h3>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex justify-between">
          <dt>Lato gara</dt>
          <dd className="font-semibold">{sideLabel}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Giocatori</dt>
          <dd>{sheet.playerCount}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Staff</dt>
          <dd>{sheet.staffCount}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Invio</dt>
          <dd>{sheet.submittedAt ? "Ricevuta" : "Non ricevuta"}</dd>
        </div>
      </dl>
    </div>
  );
}

function RecognitionStep({
  isLocked,
  matchId,
  onComplete,
}: Readonly<{
  isLocked: boolean;
  matchId: string;
  onComplete: () => void;
}>) {
  const [index, setIndex] = useState(0);
  const [showDocument, setShowDocument] = useState(false);
  const [decisions, setDecisions] = useState<
    Record<string, RecognitionDecision>
  >({});
  const query = useQuery({
    queryFn: fetchRecognitionSubjects,
    queryKey: [...queryKeys.recognitions, matchId],
  });
  const mutation = useMutation({
    mutationFn: () => completeRecognition(matchId),
    onMutate: onComplete,
  });
  if (isLocked) {
    return (
      <Card className="space-y-4 text-center">
        <h2 className="text-2xl font-bold">Riconoscimento LOCKED</h2>
        <p className="text-sm text-slate-500">
          Il riconoscimento è chiuso. Puoi proseguire solo con il referto.
        </p>
        <Button onClick={onComplete} type="button">
          Referto
        </Button>
      </Card>
    );
  }
  if (query.isLoading) return <SkeletonBlock />;
  if (query.isError)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  const subjects = query.data ?? [];
  const currentSubject = subjects[index] ?? null;
  const completedCount = Object.keys(decisions).length;
  const recognizedSubjects = subjects.filter((subject) => decisions[subject.id]);
  const recognizedTeams = new Set(recognizedSubjects.map((subject) => subject.teamName));
  const hasHomeRecognition = recognizedTeams.has("Casa");
  const hasAwayRecognition = recognizedTeams.has("Ospite");
  const fullRecognitionComplete =
    completedCount === subjects.length && hasHomeRecognition && hasAwayRecognition;
  function decide(decision: Exclude<RecognitionDecision, "pending">) {
    if (!currentSubject) return;
    setDecisions((current) => ({ ...current, [currentSubject.id]: decision }));
    setShowDocument(false);
    setIndex((current) => Math.min(current + 1, subjects.length));
  }
  if (subjects.length === 0)
    return <EmptyState message="Nessun atleta da riconoscere." />;
  if (!currentSubject || completedCount === subjects.length)
    return (
      <Card className="space-y-4 text-center">
        <h2 className="text-2xl font-bold">Riconoscimento completato</h2>
        <p className="text-sm text-slate-500">
          {completedCount} tesserati verificati. Puoi procedere al referto solo
          dopo il riconoscimento di Casa e Ospite.
        </p>
        {!fullRecognitionComplete ? (
          <p className="rounded-lg bg-red-100 p-3 text-sm font-semibold text-red-900">
            Riconoscimento non completato per entrambe le squadre
          </p>
        ) : null}
        <Button
          disabled={!fullRecognitionComplete || mutation.isPending}
          onClick={() => mutation.mutate()}
          type="button"
        >
          Chiudi riconoscimento e vai al referto
        </Button>
      </Card>
    );
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Riconoscimento</h2>
          <p className="text-sm text-slate-500">
            Swipe destra per confermare, sinistra per segnalare, indietro per
            rivedere.
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-2 text-sm">
          {completedCount}/{subjects.length}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="flex aspect-[3/4] items-center justify-center rounded-2xl bg-muted text-center text-lg font-semibold">
          {currentSubject.photoUrl ? "Foto tesserato" : "Placeholder · foto mancante"}
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-primary">
              {currentSubject.teamName}
            </p>
            <h3 className="text-3xl font-bold">
              {currentSubject.firstName} {currentSubject.lastName}
            </h3>
            {currentSubject.subjectKind === "player" ? (
              <p className="text-lg">Maglia #{currentSubject.shirtNumber}</p>
            ) : (
              <p className="text-lg">Qualifica: {currentSubject.roleLabel}</p>
            )}
            <p className="text-sm text-slate-500">Ruolo: {currentSubject.roleLabel}</p>
          </div>
          <button
            className="w-full rounded-xl border p-3 text-left"
            onClick={() => setShowDocument((current) => !current)}
            type="button"
          >
            <span className="font-semibold">Documento</span>
            {showDocument ? (
              <dl className="mt-3 grid gap-2 text-sm text-slate-600">
                <div className="flex justify-between">
                  <dt>Tipo</dt>
                  <dd>{currentSubject.document.type}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Numero</dt>
                  <dd>{currentSubject.document.number}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                Tocca per aprire i dati documento.
              </p>
            )}
          </button>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              className="bg-slate-700"
              disabled={index === 0}
              onClick={() => setIndex((current) => Math.max(current - 1, 0))}
              type="button"
            >
              Indietro
            </Button>
            <Button
              className="bg-green-600"
              onClick={() => decide("approved")}
              type="button"
            >
              Swipe (destra→sinistra)
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function MatchReportStep({
  fullRecognitionComplete,
  matchId,
}: Readonly<{ fullRecognitionComplete: boolean; matchId: string }>) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const query = useQuery({
    queryFn: () => fetchRefereeReport(matchId),
    queryKey: [...queryKeys.matchReports, matchId],
  });
  const [step, setStep] = useState(0);
  const [report, setReport] = useState<MatchReportDraft | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const currentReport = report ?? query.data;
  const reportErrors = currentReport ? validateReportDraft(currentReport) : [];
  const recognitionErrors = fullRecognitionComplete
    ? []
    : ["Riconoscimento non completato per entrambe le squadre"];
  const blockingErrors = [...recognitionErrors, ...reportErrors];
  const isReadOnly = isSubmitted || currentReport?.status === "submitted";
  const submitMutation = useMutation({
    mutationFn: () =>
      currentReport
        ? submitRefereeReport(matchId, currentReport)
        : Promise.reject(new Error("Nessun referto disponibile.")),
    onSuccess() {
      if (currentReport) saveSubmittedFederationReport(matchId, currentReport);
      setIsSubmitted(true);
      notify("Referto inviato", "success");
      void queryClient.invalidateQueries({ queryKey: queryKeys.matchReports });
    },
  });
  if (query.isLoading) return <SkeletonBlock />;
  if (query.isError)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  if (!currentReport)
    return <EmptyState message="Nessun referto disponibile." />;
  const currentStep = reportSteps[step];
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Referto</h2>
        <p className="text-sm text-slate-500">
          Risultato, eventi disciplinari, sostituzioni, note e invio.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {reportSteps.map((label, index) => (
          <button
            className={`rounded-full px-3 py-2 text-sm ${step === index ? "bg-primary text-white" : "bg-muted"}`}
            key={label}
            onClick={() => setStep(index)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {currentStep === "Risultato" ? (
        <ResultPanel
          readOnly={isReadOnly}
          report={currentReport}
          setReport={setReport}
        />
      ) : null}
      {currentStep === "Gol" ? (
        <EventsPanel
          eventKey="goals"
          readOnly={isReadOnly}
          report={currentReport}
          setReport={setReport}
          title="Gol"
        />
      ) : null}
      {currentStep === "Ammonizioni" ? (
        <EventsPanel
          eventKey="cautions"
          readOnly={isReadOnly}
          report={currentReport}
          setReport={setReport}
          title="Ammonizioni"
        />
      ) : null}
      {currentStep === "Espulsioni" ? (
        <EventsPanel
          eventKey="expulsions"
          readOnly={isReadOnly}
          report={currentReport}
          setReport={setReport}
          title="Espulsioni"
        />
      ) : null}
      {currentStep === "Sostituzioni" ? (
        <EventsPanel
          eventKey="substitutions"
          readOnly={isReadOnly}
          report={currentReport}
          setReport={setReport}
          title="Sostituzioni"
        />
      ) : null}
      {currentStep === "Note" ? (
        <textarea
          className="min-h-32 w-full rounded-lg border bg-background px-3 py-2 text-sm"
          disabled={isReadOnly}
          onChange={(event) =>
            setReport({ ...currentReport, refereeNotes: event.target.value })
          }
          value={currentReport.refereeNotes}
        />
      ) : null}
      {currentStep === "Riepilogo" ? (
        <div className="space-y-4">
          {blockingErrors.length === 0 ? (
            <p className="rounded-lg bg-green-100 p-3 text-sm text-green-900">
              Riepilogo pronto per l’invio.
            </p>
          ) : (
            <div className="rounded-lg bg-red-100 p-3 text-sm text-red-900">
              <p className="font-semibold">Referto non valido.</p>
              <ul className="mt-2 list-disc pl-5">
                {blockingErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          <dl className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt>Gol registrati</dt>
              <dd className="font-semibold">{currentReport.goals.length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Ammonizioni</dt>
              <dd className="font-semibold">{currentReport.cautions.length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Espulsioni</dt>
              <dd className="font-semibold">
                {currentReport.expulsions.length}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Sostituzioni</dt>
              <dd className="font-semibold">
                {currentReport.substitutions.length}
              </dd>
            </div>
          </dl>
          <Button
            disabled={
              isReadOnly || blockingErrors.length > 0 || submitMutation.isPending
            }
            onClick={() => submitMutation.mutate()}
            type="button"
          >
            Invia referto
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

type MatchReportEventKey =
  | "cautions"
  | "expulsions"
  | "goals"
  | "substitutions";

function EventsPanel({
  eventKey,
  readOnly,
  report,
  setReport,
  title,
}: Readonly<{
  eventKey: MatchReportEventKey;
  readOnly: boolean;
  report: MatchReportDraft;
  setReport: (report: MatchReportDraft) => void;
  title: string;
}>) {
  const events = report[eventKey];
  const goalCounts = countGoalsByTeam(report);
  const goalLimitReached =
    eventKey === "goals" && events.length >= report.homeGoals + report.awayGoals;

  function setEvents(nextEvents: readonly MatchReportEvent[]) {
    setReport({ ...report, [eventKey]: nextEvents });
  }

  function nextMinute() {
    return Math.min((events.at(-1)?.minute ?? 0) + 1, 120);
  }

  function addEvent() {
    const baseEvent: MatchReportEvent = {
      detail: defaultDetail(eventKey),
      id: `${eventKey}-${Date.now()}-${events.length + 1}`,
      minute: nextMinute(),
      playerName: "",
      shirtNumber: null,
      teamName: goalCounts.home < report.homeGoals ? "Casa" : "Ospite",
    };
    setEvents([
      ...events,
      eventKey === "substitutions"
        ? {
            ...baseEvent,
            incomingPlayerName: "",
            incomingShirtNumber: null,
            outgoingPlayerName: "",
            outgoingShirtNumber: null,
          }
        : baseEvent,
    ]);
  }

  function updateEvent(eventId: string, patch: Partial<MatchReportEvent>) {
    setEvents(
      events.map((event) => {
        if (event.id !== eventId) return event;
        const nextEvent = { ...event, ...patch };
        if ("teamName" in patch || "shirtNumber" in patch) {
          nextEvent.playerName = resolveReportPlayerName(
            nextEvent.teamName,
            nextEvent.shirtNumber,
          );
        }
        if ("teamName" in patch || "outgoingShirtNumber" in patch) {
          nextEvent.outgoingPlayerName = resolveReportPlayerName(
            nextEvent.teamName,
            nextEvent.outgoingShirtNumber,
          );
        }
        if ("teamName" in patch || "incomingShirtNumber" in patch) {
          nextEvent.incomingPlayerName = resolveReportPlayerName(
            nextEvent.teamName,
            nextEvent.incomingShirtNumber,
          );
        }
        return nextEvent;
      }),
    );
  }

  function removeEvent(eventId: string) {
    setEvents(events.filter((event) => event.id !== eventId));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <Button
          disabled={readOnly || goalLimitReached}
          onClick={addEvent}
          type="button"
        >
          Aggiungi
        </Button>
      </div>
      {eventKey === "goals" ? (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <p className="rounded-lg bg-muted p-2">
            Gol casa inseriti {goalCounts.home}/{report.homeGoals}
          </p>
          <p className="rounded-lg bg-muted p-2">
            Gol ospite inseriti {goalCounts.away}/{report.awayGoals}
          </p>
        </div>
      ) : null}
      {events.length === 0 ? (
        <p className="rounded-lg bg-muted p-3 text-sm text-slate-600">
          Nessun evento inserito.
        </p>
      ) : (
        <div className="space-y-3">
          {events.map((event, index) => (
            <div className="rounded-xl border p-3" key={event.id}>
              <div className="grid gap-2 md:grid-cols-5">
                <MinuteField
                  event={event}
                  index={index}
                  onChange={(minute) => updateEvent(event.id, { minute })}
                  previousMinute={events[index - 1]?.minute ?? null}
                  readOnly={readOnly}
                />
                <TeamField
                  event={event}
                  onChange={(teamName) => updateEvent(event.id, { teamName })}
                  readOnly={readOnly}
                />
                {eventKey === "substitutions" ? (
                  <SubstitutionFields
                    event={event}
                    onChange={(patch) => updateEvent(event.id, patch)}
                    readOnly={readOnly}
                  />
                ) : (
                  <PlayerAndReasonFields
                    event={event}
                    eventKey={eventKey}
                    onChange={(patch) => updateEvent(event.id, patch)}
                    readOnly={readOnly}
                  />
                )}
                <Button
                  className="self-end bg-red-600"
                  disabled={readOnly}
                  onClick={() => removeEvent(event.id)}
                  type="button"
                >
                  Rimuovi
                </Button>
              </div>
              {event.minute < (events[index - 1]?.minute ?? 0) ? (
                <p className="mt-2 rounded bg-red-100 p-2 text-sm text-red-900">
                  Evento fuori ordine cronologico.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function defaultDetail(eventKey: MatchReportEventKey) {
  if (eventKey === "goals") return goalTypes[0];
  if (eventKey === "cautions") return cautionReasons[0];
  if (eventKey === "expulsions") return expulsionReasons[0];
  return "";
}

function MinuteField({
  event,
  index,
  onChange,
  previousMinute,
  readOnly,
}: Readonly<{
  event: MatchReportEvent;
  index: number;
  onChange: (minute: number) => void;
  previousMinute: number | null;
  readOnly: boolean;
}>) {
  return (
    <label className="space-y-1 text-sm font-medium">
      Minuto
      <Input
        disabled={readOnly}
        max={120}
        min={previousMinute ?? 1}
        onChange={(change) => onChange(change.target.valueAsNumber || 1)}
        type="number"
        value={event.minute}
      />
      {index > 0 ? (
        <span className="text-xs text-slate-500">Minimo {previousMinute}</span>
      ) : null}
    </label>
  );
}

function TeamField({
  event,
  onChange,
  readOnly,
}: Readonly<{
  event: MatchReportEvent;
  onChange: (teamName: string) => void;
  readOnly: boolean;
}>) {
  return (
    <label className="space-y-1 text-sm font-medium">
      Squadra
      <select
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
        disabled={readOnly}
        onChange={(change) => onChange(change.target.value)}
        value={event.teamName}
      >
        {reportTeams.map((team) => (
          <option key={team} value={team}>
            {team}
          </option>
        ))}
      </select>
    </label>
  );
}

function PlayerAndReasonFields({
  event,
  eventKey,
  onChange,
  readOnly,
}: Readonly<{
  event: MatchReportEvent;
  eventKey: Exclude<MatchReportEventKey, "substitutions">;
  onChange: (patch: Partial<MatchReportEvent>) => void;
  readOnly: boolean;
}>) {
  const reasonOptions =
    eventKey === "goals"
      ? goalTypes
      : eventKey === "cautions"
        ? cautionReasons
        : expulsionReasons;
  const detailLabel = eventKey === "goals" ? "Tipo gol" : "Motivo";
  return (
    <>
      <label className="space-y-1 text-sm font-medium">
        Numero maglia
        <Input
          disabled={readOnly}
          max={99}
          min={1}
          onChange={(change) =>
            onChange({ shirtNumber: change.target.valueAsNumber || null })
          }
          type="number"
          value={event.shirtNumber ?? ""}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Tesserato
        <Input disabled readOnly value={event.playerName} />
      </label>
      <label className="space-y-1 text-sm font-medium">
        {detailLabel}
        <select
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          disabled={readOnly}
          onChange={(change) => onChange({ detail: change.target.value })}
          value={event.detail}
        >
          {reasonOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function SubstitutionFields({
  event,
  onChange,
  readOnly,
}: Readonly<{
  event: MatchReportEvent;
  onChange: (patch: Partial<MatchReportEvent>) => void;
  readOnly: boolean;
}>) {
  return (
    <>
      <label className="space-y-1 text-sm font-medium">
        Numero uscente
        <Input
          disabled={readOnly}
          max={99}
          min={1}
          onChange={(change) =>
            onChange({
              outgoingShirtNumber: change.target.valueAsNumber || null,
            })
          }
          type="number"
          value={event.outgoingShirtNumber ?? ""}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Tesserato uscente
        <Input disabled readOnly value={event.outgoingPlayerName ?? ""} />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Numero entrante
        <Input
          disabled={readOnly}
          max={99}
          min={1}
          onChange={(change) =>
            onChange({
              incomingShirtNumber: change.target.valueAsNumber || null,
            })
          }
          type="number"
          value={event.incomingShirtNumber ?? ""}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Tesserato entrante
        <Input disabled readOnly value={event.incomingPlayerName ?? ""} />
      </label>
    </>
  );
}

function ResultPanel({
  readOnly,
  report,
  setReport,
}: Readonly<{
  readOnly: boolean;
  report: MatchReportDraft;
  setReport: (report: MatchReportDraft) => void;
}>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-sm font-medium">
        Gol casa
        <Input
          disabled={readOnly}
          min={0}
          onChange={(event) =>
            setReport({ ...report, homeGoals: event.target.valueAsNumber || 0 })
          }
          type="number"
          value={report.homeGoals}
        />
      </label>
      <label className="space-y-1 text-sm font-medium">
        Gol ospite
        <Input
          disabled={readOnly}
          min={0}
          onChange={(event) =>
            setReport({ ...report, awayGoals: event.target.valueAsNumber || 0 })
          }
          type="number"
          value={report.awayGoals}
        />
      </label>
    </div>
  );
}
