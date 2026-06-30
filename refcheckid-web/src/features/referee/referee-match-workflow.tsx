"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  initialMatchReport,
  recognitionSubjects,
  teamSheetVerifications,
} from "@/lib/referee-mock-data";
import type {
  MatchReportDraft,
  MatchReportEvent,
  RecognitionDecision,
  RecognitionSubject,
  TeamSheetVerification,
} from "@/lib/referee-types";

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
      {step === 0 ? <SheetVerificationStep onStart={() => setStep(1)} /> : null}
      {step === 1 ? <RecognitionStep onComplete={() => setStep(2)} /> : null}
      {step === 2 ? <MatchReportStep /> : null}
    </div>
  );
}

function SheetVerificationStep({ onStart }: Readonly<{ onStart: () => void }>) {
  const allLocked = teamSheetVerifications.every(
    (sheet) => sheet.status === "locked",
  );
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Verifica distinte</h2>
        <p className="text-sm text-slate-500">
          Controlla casa, ospite e stato prima di avviare il riconoscimento.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {teamSheetVerifications.map((sheet) => (
          <TeamSheetCard key={sheet.id} sheet={sheet} />
        ))}
      </div>
      {!allLocked ? (
        <p className="rounded-lg bg-yellow-100 p-3 text-sm text-yellow-900">
          Una o più distinte non sono ancora bloccate.
        </p>
      ) : null}
      <Button disabled={!allLocked} onClick={onStart} type="button">
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
        <div className="flex justify-between">
          <dt>Invio</dt>
          <dd>
            {sheet.submittedAt
              ? new Date(sheet.submittedAt).toLocaleTimeString("it-IT", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function RecognitionStep({ onComplete }: Readonly<{ onComplete: () => void }>) {
  const [subjects, setSubjects] =
    useState<readonly RecognitionSubject[]>(recognitionSubjects);
  const [index, setIndex] = useState(0);
  const [showDocument, setShowDocument] = useState(false);
  const currentSubject = subjects[index] ?? null;
  const completedCount = subjects.filter(
    (subject) => subject.decision !== "pending",
  ).length;
  const isComplete = completedCount === subjects.length;

  function decide(decision: Exclude<RecognitionDecision, "pending">) {
    if (!currentSubject) return;
    setSubjects((current) =>
      current.map((subject) =>
        subject.id === currentSubject.id ? { ...subject, decision } : subject,
      ),
    );
    setShowDocument(false);
    setIndex((current) => Math.min(current + 1, subjects.length));
  }

  function goBack() {
    setShowDocument(false);
    setIndex((current) => Math.max(current - 1, 0));
  }

  if (subjects.length === 0) {
    return (
      <Card>
        <h2 className="text-xl font-bold">Riconoscimento</h2>
        <p className="mt-3 text-sm text-slate-500">
          Nessun atleta da riconoscere.
        </p>
      </Card>
    );
  }

  if (isComplete || !currentSubject) {
    return (
      <Card className="space-y-4 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">
          ✓
        </div>
        <h2 className="text-2xl font-bold">Riconoscimento completato</h2>
        <p className="text-sm text-slate-500">
          {completedCount} tesserati verificati. Puoi procedere al referto.
        </p>
        <Button onClick={onComplete} type="button">
          Vai al referto
        </Button>
      </Card>
    );
  }

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
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${(completedCount / subjects.length) * 100}%` }}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="flex aspect-[3/4] items-center justify-center rounded-2xl bg-muted text-lg font-semibold">
          {currentSubject.photoUrl ? "Foto" : "Foto tesserato"}
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
                <div className="flex justify-between">
                  <dt>Scadenza</dt>
                  <dd>
                    {new Date(
                      currentSubject.document.expiresAt,
                    ).toLocaleDateString("it-IT")}
                  </dd>
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
              onClick={goBack}
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

function MatchReportStep() {
  const [report, setReport] = useState<MatchReportDraft>(initialMatchReport);
  const [step, setStep] = useState(0);
  const currentStep = reportSteps[step];
  const canSubmit = report.homeGoals >= 0 && report.awayGoals >= 0;

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
        <ResultPanel report={report} setReport={setReport} />
      ) : null}
      {currentStep === "Gol" ? (
        <EventsPanel events={report.goals} title="Gol" />
      ) : null}
      {currentStep === "Ammonizioni" ? (
        <EventsPanel events={report.cautions} title="Ammonizioni" />
      ) : null}
      {currentStep === "Espulsioni" ? (
        <EventsPanel events={report.expulsions} title="Espulsioni" />
      ) : null}
      {currentStep === "Sostituzioni" ? (
        <EventsPanel events={report.substitutions} title="Sostituzioni" />
      ) : null}
      {currentStep === "Note" ? (
        <NotesPanel report={report} setReport={setReport} />
      ) : null}
      {currentStep === "Riepilogo" ? (
        <ReportSummary report={report} canSubmit={canSubmit} />
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

function EventsPanel({
  events,
  title,
}: Readonly<{ events: readonly MatchReportEvent[]; title: string }>) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">{title}</h3>
      {events.length === 0 ? (
        <p className="rounded-xl bg-muted p-4 text-sm">
          Nessun evento registrato.
        </p>
      ) : null}
      {events.map((event) => (
        <div
          className="grid gap-1 rounded-xl border p-3 text-sm md:grid-cols-[80px_1fr_1fr]"
          key={event.id}
        >
          <span>{event.minute}&apos;</span>
          <span>{event.teamName}</span>
          <span>
            {event.playerName} · {event.detail}
          </span>
        </div>
      ))}
    </div>
  );
}

function NotesPanel({
  report,
  setReport,
}: Readonly<{
  report: MatchReportDraft;
  setReport: (report: MatchReportDraft) => void;
}>) {
  return (
    <label className="block space-y-1 text-sm font-medium">
      Note arbitro
      <textarea
        className="min-h-32 w-full rounded-lg border bg-background px-3 py-2 text-sm"
        onChange={(event) =>
          setReport({ ...report, refereeNotes: event.target.value })
        }
        value={report.refereeNotes}
      />
    </label>
  );
}

function ReportSummary({
  report,
  canSubmit,
}: Readonly<{ report: MatchReportDraft; canSubmit: boolean }>) {
  const totalEvents = useMemo(
    () =>
      report.goals.length +
      report.cautions.length +
      report.expulsions.length +
      report.substitutions.length,
    [report],
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryMetric
          label="Risultato"
          value={`${report.homeGoals}-${report.awayGoals}`}
        />
        <SummaryMetric label="Gol" value={String(report.goals.length)} />
        <SummaryMetric label="Eventi" value={String(totalEvents)} />
        <SummaryMetric
          label="Note"
          value={report.refereeNotes ? "Presenti" : "Assenti"}
        />
      </div>
      <p className="rounded-lg bg-green-100 p-3 text-sm text-green-900">
        Riepilogo pronto per l’invio.
      </p>
      <Button disabled={!canSubmit} type="button">
        Invia referto
      </Button>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
