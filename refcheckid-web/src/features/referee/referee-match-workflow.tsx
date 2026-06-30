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
  startRecognition,
  submitMatchReport,
} from "@/lib/referee-api-client";
import type {
  MatchReportDraft,
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
  const { session } = useSession();
  const dashboardQuery = useQuery({
    enabled: Boolean(session?.actorId),
    queryFn: () => fetchRefereeDashboard(session?.actorId ?? ""),
    queryKey: [...queryKeys.referees, "dashboard", session?.actorId],
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
        <RecognitionStep matchId={matchId} onComplete={() => setStep(2)} />
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
    mutationFn: () => startRecognition(matchId),
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
  const allLocked =
    sheets.length > 0 && sheets.every((sheet) => sheet.status === "locked");
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
        disabled={!allLocked || mutation.isPending}
        onClick={() => mutation.mutate()}
        type="button"
      >
        Inizia riconoscimento
      </Button>
    </Card>
  );
}

function TeamSheetCard({ sheet }: Readonly<{ sheet: TeamSheetVerification }>) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs font-semibold uppercase text-primary">
        {sheet.team === "home" ? "Casa" : "Ospite"}
      </p>
      <h3 className="mt-1 text-lg font-bold">{sheet.clubName}</h3>
      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex justify-between">
          <dt>Stato</dt>
          <dd className="font-semibold uppercase">{sheet.status}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Giocatori</dt>
          <dd>{sheet.playerCount}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Staff</dt>
          <dd>{sheet.staffCount}</dd>
        </div>
      </dl>
    </div>
  );
}

function RecognitionStep({
  matchId,
  onComplete,
}: Readonly<{ matchId: string; onComplete: () => void }>) {
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
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              className="bg-slate-700"
              disabled={index === 0}
              onClick={() => setIndex((current) => Math.max(current - 1, 0))}
              type="button"
            >
              Indietro
            </Button>
            <Button
              className="bg-red-600"
              onClick={() => decide("rejected")}
              type="button"
            >
              Swipe sinistra
            </Button>
            <Button
              className="bg-green-600"
              onClick={() => decide("approved")}
              type="button"
            >
              Swipe destra
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
    mutationFn: () => submitMatchReport(matchId),
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
