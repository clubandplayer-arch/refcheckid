"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
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
  RecognitionSubject,
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
  const [recognitionClosed, setRecognitionClosed] = useState(false);
  const [fullRecognitionComplete, setFullRecognitionComplete] = useState(false);
  const [initialRecognitionTeamName, setInitialRecognitionTeamName] = useState<string | null>(null);
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
          const isRecognitionStepDisabled = recognitionClosed && index < 2;
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
        <SheetVerificationStep
          matchId={matchId}
          onStart={(teamName) => {
            setInitialRecognitionTeamName(teamName);
            setStep(1);
          }}
        />
      ) : null}
      {step === 1 ? (
        <RecognitionStep
          isLocked={false}
          initialTeamName={initialRecognitionTeamName}
          matchId={matchId}
          onComplete={() => {
            setFullRecognitionComplete(true);
            setRecognitionClosed(true);
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
}: Readonly<{ matchId: string; onStart: (teamName: string | null) => void }>) {
  const query = useQuery({
    queryFn: () => fetchRefereeMatchSheets(matchId),
    queryKey: [...queryKeys.matchSheets, matchId],
  });
  const [selectedStartTeam, setSelectedStartTeam] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => lockSubmittedSheetsAndStartRecognition(matchId),
  });
  const sheets = query.data ?? [];
  const homeSheet = sheets.find((sheet) => sheet.team === "home");
  const defaultStartTeam = homeSheet?.clubName.split(" · ")[0] ?? null;
  const effectiveStartTeam = selectedStartTeam ?? defaultStartTeam;
  useEffect(() => {
    if (!selectedStartTeam && defaultStartTeam) setSelectedStartTeam(defaultStartTeam);
  }, [defaultStartTeam, selectedStartTeam]);
  if (query.isLoading) return <SkeletonBlock />;
  if (query.isError)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
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
          {sheets.map((sheet) => {
            const teamName = sheet.clubName.split(" · ")[0] ?? sheet.clubName;
            return (
              <TeamSheetCard
                isSelected={effectiveStartTeam === teamName}
                key={sheet.id}
                onSelect={() => setSelectedStartTeam(teamName)}
                sheet={sheet}
              />
            );
          })}
        </div>
      )}
      {missingAwaySheet ? (
        <p className="rounded-lg bg-red-100 p-3 text-sm font-semibold text-red-900">
          Distinta ospite mancante
        </p>
      ) : null}
      <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
        Il riconoscimento deve iniziare dalla squadra di casa. Se l’arbitro deve partire da un’altra distinta, può selezionare la squadra prima di avviare.
      </p>
      <Button
        disabled={!canStart}
        onClick={() => {
          onStart(effectiveStartTeam);
          mutation.mutate();
        }}
        type="button"
      >
        Inizia riconoscimento {effectiveStartTeam ? `con ${effectiveStartTeam}` : ""}
      </Button>
    </Card>
  );
}

function TeamSheetCard({
  isSelected,
  onSelect,
  sheet,
}: Readonly<{
  isSelected: boolean;
  onSelect: () => void;
  sheet: TeamSheetVerification;
}>) {
  const statusLabel = {
    locked: "Pronta per il riconoscimento",
    missing: "Distinta non disponibile",
    submitted: "Inviata — da prendere in carico",
  }[sheet.status];
  const statusClass = {
    locked: "bg-green-100 text-green-800",
    missing: "bg-red-100 text-red-800",
    submitted: "bg-blue-100 text-blue-800",
  }[sheet.status];
  const sideLabel = sheet.team === "home" ? "Squadra casa" : "Squadra ospite";

  return (
    <button
      className={`rounded-xl border p-4 text-left shadow-sm transition ${isSelected ? "border-primary ring-2 ring-primary/20" : "border-slate-200 hover:border-primary/50"}`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-primary">
            {sideLabel}
          </p>
          <h3 className="mt-1 text-lg font-bold">{sheet.clubName}</h3>
        </div>
        <div className="flex flex-col items-end gap-2">
          {isSelected ? (
            <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-white">
              Selezionata
            </span>
          ) : null}
          <span
            className={`max-w-[116px] rounded-xl px-3 py-2 text-center text-xs font-bold leading-tight ${statusClass}`}
          >
            {statusLabel}
          </span>
        </div>
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
    </button>
  );
}

function RecognitionStep({
  initialTeamName,
  isLocked,
  matchId,
  onComplete,
}: Readonly<{
  initialTeamName: string | null;
  isLocked: boolean;
  matchId: string;
  onComplete: () => void;
}>) {
  const [index, setIndex] = useState(0);
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(initialTeamName);
  const [showDocument, setShowDocument] = useState(false);
  const [decisions, setDecisions] = useState<
    Record<string, RecognitionDecision>
  >({});
  const [decisionOrder, setDecisionOrder] = useState<readonly string[]>([]);
  const [isRecognitionClosed, setIsRecognitionClosed] = useState(false);
  const query = useQuery({
    queryFn: fetchRecognitionSubjects,
    queryKey: [...queryKeys.recognitions, matchId],
  });
  const mutation = useMutation({
    mutationFn: () => completeRecognition(matchId),
    onMutate: onComplete,
  });
  const allSubjects = useMemo(() => query.data ?? [], [query.data]);
  const teamNames = useMemo(
    () => Array.from(new Set(allSubjects.map((subject) => subject.teamName))),
    [allSubjects],
  );
  const activeTeamName = selectedTeamName ?? teamNames[0] ?? null;
  const subjects = useMemo(() => {
    const teamSubjects = activeTeamName
      ? allSubjects.filter((subject) => subject.teamName === activeTeamName)
      : allSubjects;
    return teamSubjects.filter((subject) => !decisions[subject.id]);
  }, [activeTeamName, allSubjects, decisions]);
  const selectedTeamSubjects = activeTeamName
    ? allSubjects.filter((subject) => subject.teamName === activeTeamName)
    : allSubjects;
  const selectedTeamCompletedCount = selectedTeamSubjects.filter(
    (subject) => decisions[subject.id],
  ).length;
  const selectedTeamTotal = selectedTeamSubjects.length;
  const currentTeamDecisionOrder = decisionOrder.filter((subjectId) => {
    const subject = allSubjects.find((item) => item.id === subjectId);
    return subject?.teamName === activeTeamName;
  });
  const teamRecognitionSummaries = teamNames.map((teamName) => {
    const teamSubjects = allSubjects.filter((subject) => subject.teamName === teamName);
    const completed = teamSubjects.filter((subject) => decisions[subject.id]).length;
    return {
      completed,
      isComplete: teamSubjects.length > 0 && completed === teamSubjects.length,
      teamName,
      total: teamSubjects.length,
    };
  });
  useEffect(() => {
    if (!selectedTeamName && activeTeamName) {
      setSelectedTeamName(activeTeamName);
      setIndex(0);
    }
  }, [activeTeamName, selectedTeamName]);
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
  const currentSubject = subjects[index] ?? null;
  const completedCount = decisionOrder.length;
  const recognizedSubjects = allSubjects.filter((subject) => decisions[subject.id]);
  const recognizedTeams = new Set(recognizedSubjects.map((subject) => subject.teamName));
  const hasHomeRecognition = teamNames[0] ? recognizedTeams.has(teamNames[0]) : false;
  const hasAwayRecognition = teamNames[1] ? recognizedTeams.has(teamNames[1]) : false;
  const fullRecognitionComplete =
    completedCount === allSubjects.length && hasHomeRecognition && hasAwayRecognition;
  function decide(decision: Exclude<RecognitionDecision, "pending">) {
    if (!currentSubject) return;
    setDecisions((current) => ({ ...current, [currentSubject.id]: decision }));
    setDecisionOrder((current) => [...current.filter((subjectId) => subjectId !== currentSubject.id), currentSubject.id]);
    setShowDocument(false);
    setIndex(0);
  }
  function goBackToPreviousSubject() {
    const previousSubjectId = currentTeamDecisionOrder.at(-1);
    if (!previousSubjectId) return;
    const previousSubject = allSubjects.find((subject) => subject.id === previousSubjectId);
    setDecisions((current) => {
      const next = { ...current };
      delete next[previousSubjectId];
      return next;
    });
    setDecisionOrder((current) => current.slice(0, -1));
    if (previousSubject) setSelectedTeamName(previousSubject.teamName);
    setShowDocument(false);
    setIndex(0);
  }
  if (allSubjects.length === 0)
    return <EmptyState message="Nessun tesserato da riconoscere." />;
  if (!currentSubject || completedCount === allSubjects.length)
    return (
      <Card className="space-y-4 text-center">
        <h2 className="text-2xl font-bold">
          {fullRecognitionComplete ? "Riconoscimento completato" : "Seleziona la prossima squadra"}
        </h2>
        <p className="text-sm text-slate-500">
          {completedCount} tesserati verificati. Ogni squadra va chiusa separatamente.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {teamRecognitionSummaries.map((summary) => (
            <div
              className={`rounded-xl border p-4 text-left ${
                summary.isComplete
                  ? "border-green-300 bg-green-50 text-green-900"
                  : "border-orange-300 bg-orange-50 text-orange-900"
              }`}
              key={summary.teamName}
            >
              <p className="font-bold">{summary.teamName}</p>
              <p className="text-sm">
                {summary.completed}/{summary.total} tesserati
              </p>
              {summary.isComplete ? (
                <p className="mt-2 rounded-lg bg-green-600 px-3 py-2 text-center text-sm font-semibold text-white">
                  Riconoscimento concluso
                </p>
              ) : (
                <Button
                  className="mt-2 bg-orange-500 hover:bg-orange-600"
                  onClick={() => { setSelectedTeamName(summary.teamName); setIndex(0); }}
                  type="button"
                >
                  Apri {summary.teamName}
                </Button>
              )}
            </div>
          ))}
        </div>
        {fullRecognitionComplete ? (
          <Button
            className={isRecognitionClosed ? "bg-green-600 hover:bg-green-700" : undefined}
            disabled={mutation.isPending || isRecognitionClosed}
            onClick={() => {
              setIsRecognitionClosed(true);
              mutation.mutate();
            }}
            type="button"
          >
            {isRecognitionClosed ? "Riconoscimento chiuso" : "Conferma chiusura riconoscimento"}
          </Button>
        ) : (
          <p className="rounded-lg bg-orange-100 p-3 text-sm font-semibold text-orange-900">
            Completa le squadre evidenziate in arancione prima di chiudere il riconoscimento.
          </p>
        )}
      </Card>
    );
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Riconoscimento</h2>
          <p className="text-sm text-slate-500">
            Controlla foto, dati e documento. Conferma il tesserato o torna indietro per rivedere.
          </p>
        </div>
        <span className="rounded-full bg-muted px-3 py-2 text-sm">
          {selectedTeamCompletedCount}/{selectedTeamTotal}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="relative mx-auto flex aspect-[3/4] w-full max-w-[260px] items-center justify-center overflow-hidden rounded-xl border-4 border-white bg-white text-center text-base font-semibold shadow-lg ring-1 ring-slate-200">
          {currentSubject.photoUrl ? (
            <Image
              alt={`Foto ${currentSubject.firstName} ${currentSubject.lastName}`}
              className="h-full w-full object-cover"
              height={360}
              src={currentSubject.photoUrl}
              width={260}
            />
          ) : (
            "Foto non disponibile"
          )}
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
              disabled={currentTeamDecisionOrder.length === 0}
              onClick={goBackToPreviousSubject}
              type="button"
            >
              Indietro
            </Button>
            <Button
              className="bg-green-600"
              onClick={() => decide("approved")}
              type="button"
            >
              Conferma riconoscimento
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
  const recognitionSubjectsQuery = useQuery({
    queryFn: fetchRecognitionSubjects,
    queryKey: [...queryKeys.recognitions, matchId, "report-options"],
  });
  const [step, setStep] = useState(0);
  const [report, setReport] = useState<MatchReportDraft | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const currentReport = report ?? query.data;
  const reportErrors = currentReport
    ? validateReportDraft(currentReport, recognitionSubjectsQuery.data ?? [])
    : [];
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
          recognitionSubjects={recognitionSubjectsQuery.data ?? []}
          report={currentReport}
          setReport={setReport}
          title="Gol"
        />
      ) : null}
      {currentStep === "Ammonizioni" ? (
        <EventsPanel
          eventKey="cautions"
          readOnly={isReadOnly}
          recognitionSubjects={recognitionSubjectsQuery.data ?? []}
          report={currentReport}
          setReport={setReport}
          title="Ammonizioni"
        />
      ) : null}
      {currentStep === "Espulsioni" ? (
        <EventsPanel
          eventKey="expulsions"
          readOnly={isReadOnly}
          recognitionSubjects={recognitionSubjectsQuery.data ?? []}
          report={currentReport}
          setReport={setReport}
          title="Espulsioni"
        />
      ) : null}
      {currentStep === "Sostituzioni" ? (
        <EventsPanel
          eventKey="substitutions"
          readOnly={isReadOnly}
          recognitionSubjects={recognitionSubjectsQuery.data ?? []}
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
  recognitionSubjects,
  report,
  setReport,
  title,
}: Readonly<{
  eventKey: MatchReportEventKey;
  readOnly: boolean;
  recognitionSubjects: readonly RecognitionSubject[];
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
        if (("teamName" in patch || "shirtNumber" in patch) && !("playerName" in patch)) {
          nextEvent.playerName = resolveReportPlayerName(
            nextEvent.teamName,
            nextEvent.shirtNumber,
          );
        }
        if (("teamName" in patch || "outgoingShirtNumber" in patch) && !("outgoingPlayerName" in patch)) {
          nextEvent.outgoingPlayerName = resolveReportPlayerName(
            nextEvent.teamName,
            nextEvent.outgoingShirtNumber,
          );
        }
        if (("teamName" in patch || "incomingShirtNumber" in patch) && !("incomingPlayerName" in patch)) {
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
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                <MinuteField
                  event={event}
                  index={index}
                  onChange={(minute) => updateEvent(event.id, { minute })}
                  previousMinute={events[index - 1]?.minute ?? null}
                  readOnly={readOnly}
                />
                <TeamField
                  event={event}
                  onChange={(teamName) =>
                    updateEvent(
                      event.id,
                      eventKey === "substitutions"
                        ? {
                            incomingPlayerName: "",
                            incomingShirtNumber: null,
                            outgoingPlayerName: "",
                            outgoingShirtNumber: null,
                            teamName,
                          }
                        : { playerName: "", shirtNumber: null, teamName },
                    )
                  }
                  readOnly={readOnly}
                />
                {eventKey === "substitutions" ? (
                  <SubstitutionFields
                    event={event}
                    onChange={(patch) => updateEvent(event.id, patch)}
                    readOnly={readOnly}
                    expulsions={report.expulsions}
                    recognitionSubjects={recognitionSubjects}
                    substitutions={events}
                  />
                ) : (
                  <PlayerAndReasonFields
                    event={event}
                    eventKey={eventKey}
                    onChange={(patch) => updateEvent(event.id, patch)}
                    readOnly={readOnly}
                    recognitionSubjects={recognitionSubjects}
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
  recognitionSubjects,
}: Readonly<{
  event: MatchReportEvent;
  eventKey: Exclude<MatchReportEventKey, "substitutions">;
  onChange: (patch: Partial<MatchReportEvent>) => void;
  readOnly: boolean;
  recognitionSubjects: readonly RecognitionSubject[];
}>) {
  const reasonOptions =
    eventKey === "goals"
      ? goalTypes
      : eventKey === "cautions"
        ? cautionReasons
        : expulsionReasons;
  const detailLabel = eventKey === "goals" ? "Tipo gol" : "Motivo";
  const teamNames = Array.from(new Set(recognitionSubjects.map((subject) => subject.teamName)));
  const selectedTeamIndex = event.teamName === "Casa" ? 0 : 1;
  const selectedTeamName = teamNames[selectedTeamIndex] ?? teamNames[0] ?? "";
  const playerOptions = recognitionSubjects.filter(
    (subject) => subject.subjectKind === "player" && subject.teamName === selectedTeamName,
  );
  function optionLabel(subject: RecognitionSubject): string {
    return `#${subject.shirtNumber ?? "?"} ${subject.lastName} ${subject.firstName}`;
  }
  return (
    <>
      <label className="space-y-1 text-sm font-medium sm:col-span-2 xl:col-span-2">
        Tesserato
        <select
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          disabled={readOnly}
          onChange={(change) => {
            const subject = playerOptions.find((player) => player.id === change.target.value);
            onChange({
              playerName: subject ? `${subject.lastName} ${subject.firstName}` : "",
              shirtNumber: subject?.shirtNumber ?? null,
            });
          }}
          value={playerOptions.find((player) => player.shirtNumber === event.shirtNumber)?.id ?? ""}
        >
          <option value="">Seleziona tesserato</option>
          {playerOptions.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {optionLabel(subject)}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm font-medium">
        Numero maglia
        <Input disabled readOnly value={event.shirtNumber ?? ""} />
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
  expulsions,
  onChange,
  readOnly,
  recognitionSubjects,
  substitutions,
}: Readonly<{
  event: MatchReportEvent;
  expulsions: readonly MatchReportEvent[];
  onChange: (patch: Partial<MatchReportEvent>) => void;
  readOnly: boolean;
  recognitionSubjects: readonly RecognitionSubject[];
  substitutions: readonly MatchReportEvent[];
}>) {
  const teamNames = Array.from(new Set(recognitionSubjects.map((subject) => subject.teamName)));
  const selectedTeamIndex = event.teamName === "Casa" ? 0 : 1;
  const selectedTeamName = teamNames[selectedTeamIndex] ?? teamNames[0] ?? "";
  const teamPlayers = recognitionSubjects.filter(
    (subject) => subject.subjectKind === "player" && subject.teamName === selectedTeamName,
  );
  const starters = teamPlayers.filter((subject) => subject.roleLabel.startsWith("Titolare"));
  const reserves = teamPlayers.filter((subject) => subject.roleLabel.startsWith("Riserva"));
  const usedSubstitutionNumbers = new Set(
    substitutions
      .filter((substitution) => substitution.id !== event.id && substitution.teamName === event.teamName)
      .flatMap((substitution) => [
        substitution.outgoingShirtNumber,
        substitution.incomingShirtNumber,
      ])
      .filter((shirtNumber): shirtNumber is number => typeof shirtNumber === "number"),
  );
  const expelledBeforeThisSubstitution = new Set(
    expulsions
      .filter((expulsion) => expulsion.teamName === event.teamName && expulsion.minute < event.minute)
      .map((expulsion) => expulsion.shirtNumber)
      .filter((shirtNumber): shirtNumber is number => typeof shirtNumber === "number"),
  );
  function optionLabel(subject: RecognitionSubject): string {
    return `#${subject.shirtNumber ?? "?"} ${subject.lastName} ${subject.firstName}`;
  }
  return (
    <>
      <label className="space-y-1 text-sm font-medium sm:col-span-2 xl:col-span-2">
        Tesserato uscente
        <select
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          disabled={readOnly}
          onChange={(change) => {
            const subject = starters.find((player) => player.id === change.target.value);
            onChange({
              outgoingPlayerName: subject ? `${subject.lastName} ${subject.firstName}` : "",
              outgoingShirtNumber: subject?.shirtNumber ?? null,
            });
          }}
          value={starters.find((player) => player.shirtNumber === event.outgoingShirtNumber)?.id ?? ""}
        >
          <option value="">Seleziona titolare</option>
          {starters.map((subject) => (
            <option
              disabled={
                subject.shirtNumber !== null &&
                (usedSubstitutionNumbers.has(subject.shirtNumber) ||
                  expelledBeforeThisSubstitution.has(subject.shirtNumber))
              }
              key={subject.id}
              value={subject.id}
            >
              {optionLabel(subject)}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm font-medium">
        Numero uscente
        <Input disabled readOnly value={event.outgoingShirtNumber ?? ""} />
      </label>
      <label className="space-y-1 text-sm font-medium sm:col-span-2 xl:col-span-2">
        Tesserato entrante
        <select
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          disabled={readOnly}
          onChange={(change) => {
            const subject = reserves.find((player) => player.id === change.target.value);
            onChange({
              incomingPlayerName: subject ? `${subject.lastName} ${subject.firstName}` : "",
              incomingShirtNumber: subject?.shirtNumber ?? null,
            });
          }}
          value={reserves.find((player) => player.shirtNumber === event.incomingShirtNumber)?.id ?? ""}
        >
          <option value="">Seleziona riserva</option>
          {reserves.map((subject) => (
            <option
              disabled={
                subject.shirtNumber !== null && usedSubstitutionNumbers.has(subject.shirtNumber)
              }
              key={subject.id}
              value={subject.id}
            >
              {optionLabel(subject)}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm font-medium">
        Numero entrante
        <Input disabled readOnly value={event.incomingShirtNumber ?? ""} />
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
