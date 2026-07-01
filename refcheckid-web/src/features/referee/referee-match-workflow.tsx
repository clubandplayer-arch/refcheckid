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
  completeRecognition,
  fetchRecognitionSubjects,
  fetchRefereeDashboard,
  fetchRefereeMatchSheets,
  fetchRefereeReport,
  lockSubmittedSheetsAndStartRecognition,
  submitMatchReport,
} from "@/lib/referee-api-client";
import type {
  MatchReportDraft,
  MatchReportEvent,
  RecognitionDecision,
  RecognitionSubject,
  TeamSheetVerification,
} from "@/lib/referee-types";
import { useSession } from "@/lib/session";

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
        {steps.map((label, index) => (
          <button
            className={`w-full rounded-lg px-3 py-2 text-left text-sm ${step === index ? "bg-primary text-white" : "bg-muted"}`}
            key={label}
            onClick={() => setStep(index)}
            type="button"
          >
            {index + 1}. {label}
          </button>
        ))}
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
            setStep(2);
          }}
        />
      ) : null}
      {step === 2 ? <MatchReportStep matchId={matchId} /> : null}
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
    onSuccess: onComplete,
  });
  if (isLocked) {
    return (
      <Card className="space-y-4 text-center">
        <h2 className="text-2xl font-bold">Riconoscimento LOCKED</h2>
        <p className="text-sm text-slate-500">
          Il riconoscimento è chiuso. Puoi proseguire solo con il referto.
        </p>
        <Button onClick={onComplete} type="button">
          Vai al referto
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
          {completedCount} tesserati verificati. Puoi procedere al referto.
        </p>
        <Button
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          type="button"
        >
          Vai al referto
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
        <div className="flex aspect-[3/4] items-center justify-center rounded-2xl bg-muted text-lg font-semibold">
          Foto tesserato
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-primary">
              {currentSubject.teamName}
            </p>
            <h3 className="text-3xl font-bold">
              {currentSubject.firstName} {currentSubject.lastName}
            </h3>
            <p className="text-lg">Maglia #{currentSubject.shirtNumber}</p>
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

function MatchReportStep({ matchId }: Readonly<{ matchId: string }>) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const query = useQuery({
    queryFn: () => fetchRefereeReport(matchId),
    queryKey: [...queryKeys.matchReports, matchId],
  });
  const [step, setStep] = useState(0);
  const [report, setReport] = useState<MatchReportDraft | null>(null);
  const currentReport = report ?? query.data;
  const submitMutation = useMutation({
    mutationFn: () => submitMatchReport(currentReport?.id ?? matchId),
    onSuccess() {
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
        <ResultPanel report={currentReport} setReport={setReport} />
      ) : null}
      {currentStep === "Gol" ? (
        <EventsPanel
          eventKey="goals"
          report={currentReport}
          setReport={setReport}
          title="Gol"
        />
      ) : null}
      {currentStep === "Ammonizioni" ? (
        <EventsPanel
          eventKey="cautions"
          report={currentReport}
          setReport={setReport}
          title="Ammonizioni"
        />
      ) : null}
      {currentStep === "Espulsioni" ? (
        <EventsPanel
          eventKey="expulsions"
          report={currentReport}
          setReport={setReport}
          title="Espulsioni"
        />
      ) : null}
      {currentStep === "Sostituzioni" ? (
        <EventsPanel
          eventKey="substitutions"
          report={currentReport}
          setReport={setReport}
          title="Sostituzioni"
        />
      ) : null}
      {currentStep === "Note" ? (
        <textarea
          className="min-h-32 w-full rounded-lg border bg-background px-3 py-2 text-sm"
          onChange={(event) =>
            setReport({ ...currentReport, refereeNotes: event.target.value })
          }
          value={currentReport.refereeNotes}
        />
      ) : null}
      {currentStep === "Riepilogo" ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-green-100 p-3 text-sm text-green-900">
            Riepilogo pronto per l’invio.
          </p>
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
            disabled={submitMutation.isPending}
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
  report,
  setReport,
  title,
}: Readonly<{
  eventKey: MatchReportEventKey;
  report: MatchReportDraft;
  setReport: (report: MatchReportDraft) => void;
  title: string;
}>) {
  const events = report[eventKey];

  function setEvents(nextEvents: readonly MatchReportEvent[]) {
    setReport({ ...report, [eventKey]: nextEvents });
  }

  function addEvent() {
    setEvents([
      ...events,
      {
        detail: "",
        id: `${eventKey}-${Date.now()}-${events.length + 1}`,
        minute: 1,
        playerName: "",
        teamName: "",
      },
    ]);
  }

  function updateEvent(
    eventId: string,
    field: keyof MatchReportEvent,
    value: string | number,
  ) {
    setEvents(
      events.map((event) =>
        event.id === eventId ? { ...event, [field]: value } : event,
      ),
    );
  }

  function removeEvent(eventId: string) {
    setEvents(events.filter((event) => event.id !== eventId));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <Button onClick={addEvent} type="button">
          Aggiungi
        </Button>
      </div>
      {events.length === 0 ? (
        <p className="rounded-lg bg-muted p-3 text-sm text-slate-600">
          Nessun evento inserito.
        </p>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <div
              className="grid gap-2 rounded-xl border p-3 md:grid-cols-[100px_1fr_1fr_1fr_auto]"
              key={event.id}
            >
              <label className="space-y-1 text-sm font-medium">
                Minuto
                <Input
                  min={1}
                  onChange={(change) =>
                    updateEvent(
                      event.id,
                      "minute",
                      change.target.valueAsNumber || 1,
                    )
                  }
                  type="number"
                  value={event.minute}
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Squadra
                <Input
                  onChange={(change) =>
                    updateEvent(event.id, "teamName", change.target.value)
                  }
                  value={event.teamName}
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Tesserato
                <Input
                  onChange={(change) =>
                    updateEvent(event.id, "playerName", change.target.value)
                  }
                  value={event.playerName}
                />
              </label>
              <label className="space-y-1 text-sm font-medium">
                Dettaglio
                <Input
                  onChange={(change) =>
                    updateEvent(event.id, "detail", change.target.value)
                  }
                  value={event.detail}
                />
              </label>
              <Button
                className="self-end bg-red-600"
                onClick={() => removeEvent(event.id)}
                type="button"
              >
                Rimuovi
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultPanel({
  report,
  setReport,
}: Readonly<{
  report: MatchReportDraft;
  setReport: (report: MatchReportDraft) => void;
}>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-sm font-medium">
        Gol casa
        <Input
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
