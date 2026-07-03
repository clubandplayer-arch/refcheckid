"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/ui/state";
import { useToast } from "@/components/ui/toast";
import { queryKeys } from "@/lib/api-client";
import {
  fetchFederationDashboard,
  fetchFederationHistory,
  fetchFederationMatches,
  fetchFederationReports,
  fetchPhotoRequests,
} from "@/lib/federation-api-client";
import { decideManagerPhotoApprovalRequest } from "@/lib/manager-photo-store";
import type {
  FederationHistoryItem,
  FederationMatchListItem,
  FederationReport,
  FederationReportEvent,
  FederationReportStatus,
  PhotoRequest,
  PhotoRequestStatus,
} from "@/lib/federation-types";

const sections = [
  "Cruscotto",
  "Calendario",
  "Referti",
  "Foto",
  "Storico",
] as const;
const reportStatuses: readonly ("all" | FederationReportStatus)[] = [
  "all",
  "missing",
  "draft",
  "submitted",
  "reviewed",
];

export function FederationWorkflow() {
  const [section, setSection] = useState(0);

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-2">
        {sections.map((label, index) => (
          <button
            className={`w-full rounded-lg px-3 py-2 text-left text-sm ${section === index ? "bg-primary text-white" : "bg-muted"}`}
            key={label}
            onClick={() => setSection(index)}
            type="button"
          >
            {label}
          </button>
        ))}
      </aside>
      {section === 0 ? <FederationDashboardPanel /> : null}
      {section === 1 ? <MatchCalendarPanel /> : null}
      {section === 2 ? <ReportsPanel /> : null}
      {section === 3 ? <PhotoRequestsPanel /> : null}
      {section === 4 ? <HistoryPanel /> : null}
    </div>
  );
}

function FederationDashboardPanel() {
  const query = useQuery({
    queryFn: fetchFederationDashboard,
    queryKey: [...queryKeys.federation, "dashboard"],
  });
  if (query.isLoading) return <SkeletonBlock />;
  if (query.isError)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  const federationDashboard = query.data;
  if (!federationDashboard) {
    return <EmptyState message="Dashboard federazione non disponibile." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Referti ricevuti"
          value={String(federationDashboard.reportsReceived)}
        />
        <StatCard
          label="Gare in attesa"
          value={String(federationDashboard.matchesPending)}
        />
        <StatCard
          label="Richieste foto"
          value={String(federationDashboard.pendingPhotoRequests)}
        />
      </div>
      <Card>
        <h2 className="font-semibold">Notifiche operative</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {federationDashboard.notifications.length === 0 ? (
            <li>Nessuna notifica operativa.</li>
          ) : null}
          {federationDashboard.notifications.map((notification) => (
            <li key={notification}>• {notification}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </Card>
  );
}

function MatchCalendarPanel() {
  const query = useQuery({
    queryFn: fetchFederationMatches,
    queryKey: queryKeys.matches,
  });
  const [matchday, setMatchday] = useState("all");
  const [status, setStatus] = useState<(typeof reportStatuses)[number]>("all");
  const filteredMatches = useMemo(
    () =>
      (query.data ?? []).filter((match) => {
        const matchdayMatches =
          matchday === "all" || String(match.matchday) === matchday;
        const statusMatches = status === "all" || match.reportStatus === status;
        return matchdayMatches && statusMatches;
      }),
    [matchday, query.data, status],
  );

  if (query.isLoading) return <SkeletonBlock />;
  if (query.isError)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Calendario gare</h2>
        <p className="text-sm text-slate-500">
          Filtra per giornata e stato referto.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium">
          Giornata
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) => setMatchday(event.target.value)}
            value={matchday}
          >
            <option value="all">Tutte</option>
            {[
              ...new Set((query.data ?? []).map((match) => match.matchday)),
            ].map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          Stato referto
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) =>
              setStatus(event.target.value as (typeof reportStatuses)[number])
            }
            value={status}
          >
            {reportStatuses.map((reportStatus) => (
              <option key={reportStatus} value={reportStatus}>
                {formatStatusLabel(reportStatus)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <MatchList matches={filteredMatches} />
    </Card>
  );
}

function MatchList({
  matches,
}: Readonly<{ matches: readonly FederationMatchListItem[] }>) {
  if (matches.length === 0) {
    return (
      <p className="rounded-xl bg-muted p-4 text-sm">
        Nessuna gara trovata con i filtri selezionati.
      </p>
    );
  }

  return (
    <div className="divide-y rounded-xl border">
      {matches.map((match) => (
        <div
          className="grid gap-2 p-4 text-sm lg:grid-cols-[80px_1fr_160px_140px_140px]"
          key={match.id}
        >
          <span>G{match.matchday}</span>
          <span className="font-semibold">
            {match.homeTeam} - {match.awayTeam}
          </span>
          <span>{match.refereeName}</span>
          <StatusBadge status={match.matchStatus} />
          <StatusBadge status={match.reportStatus} />
        </div>
      ))}
    </div>
  );
}

function ReportsPanel() {
  const query = useQuery({
    queryFn: fetchFederationReports,
    queryKey: queryKeys.matchReports,
  });
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  if (query.isLoading) return <SkeletonBlock />;
  if (query.isError)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  const reports = query.data ?? [];
  const selectedReport =
    reports.find((report) => report.id === selectedReportId) ??
    reports[0] ??
    null;

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card className="space-y-3">
        <h2 className="text-xl font-bold">Referti ricevuti</h2>
        <ReportList
          reports={reports}
          selectedReportId={selectedReportId}
          onSelect={setSelectedReportId}
        />
      </Card>
      {selectedReport ? (
        <ReportDetail report={selectedReport} />
      ) : (
        <EmptyState message="Seleziona un referto." />
      )}
    </div>
  );
}

function ReportList({
  reports,
  selectedReportId,
  onSelect,
}: Readonly<{
  reports: readonly FederationReport[];
  selectedReportId: string | null;
  onSelect: (id: string) => void;
}>) {
  if (reports.length === 0) {
    return <EmptyState message="Nessun referto ricevuto." />;
  }

  return (
    <div className="space-y-2">
      {reports.map((report) => (
        <button
          className={`w-full rounded-xl border p-3 text-left ${selectedReportId === report.id ? "border-primary bg-muted" : ""}`}
          key={report.id}
          onClick={() => onSelect(report.id)}
          type="button"
        >
          <p className="font-semibold">
            {report.homeTeam} - {report.awayTeam}
          </p>
          <p className="text-xs text-slate-500">
            {report.refereeName} · {formatSubmittedAt(report.submittedAt)}
          </p>
        </button>
      ))}
    </div>
  );
}

function ReportDetail({ report }: Readonly<{ report: FederationReport }>) {
  return (
    <Card className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">
            Dettaglio referto in sola lettura
          </p>
          <h2 className="text-2xl font-bold">
            {report.homeTeam} - {report.awayTeam}
          </h2>
          <p className="text-sm text-slate-500">
            Arbitro: {report.refereeName}
          </p>
        </div>
        <ScoreBadge
          homeGoals={report.result.homeGoals}
          awayGoals={report.result.awayGoals}
        />
      </div>
      <ReportEvents
        homeTeam={report.homeTeam}
        title="Gol"
        awayTeam={report.awayTeam}
        events={report.goals}
      />
      <ReportEvents
        homeTeam={report.homeTeam}
        title="Ammonizioni"
        awayTeam={report.awayTeam}
        events={report.cautions}
      />
      <ReportEvents
        homeTeam={report.homeTeam}
        title="Espulsioni"
        awayTeam={report.awayTeam}
        events={report.expulsions}
      />
      <ReportEvents
        homeTeam={report.homeTeam}
        title="Sostituzioni"
        awayTeam={report.awayTeam}
        events={report.substitutions}
      />
      <ReadOnlyNotes title="Note arbitro" value={report.refereeNotes} />
      {report.commissionerNotes ? (
        <ReadOnlyNotes
          title="Note commissario"
          value={report.commissionerNotes}
        />
      ) : null}
    </Card>
  );
}

function ReportEvents({
  awayTeam,
  title,
  events,
  homeTeam,
}: Readonly<{
  awayTeam: string;
  title: string;
  events: readonly FederationReportEvent[];
  homeTeam: string;
}>) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{title}</h3>
      {events.length === 0 ? (
        <p className="rounded-xl bg-muted p-3 text-sm">Nessun evento.</p>
      ) : null}
      {events.map((event) => (
        <div
          className="grid gap-1 rounded-xl border p-3 text-sm md:grid-cols-[70px_1fr_1fr]"
          key={event.id}
        >
          <span>{event.minute}&apos;</span>
          <span>
            {formatReportTeamName(event.teamName, homeTeam, awayTeam)}
          </span>
          <span>
            {event.playerName} · {event.detail}
          </span>
        </div>
      ))}
    </section>
  );
}

function ReadOnlyNotes({
  title,
  value,
}: Readonly<{ title: string; value: string }>) {
  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 rounded-xl bg-muted p-3 text-sm">{value}</p>
    </section>
  );
}

function PhotoRequestsPanel() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const query = useQuery({
    queryFn: fetchPhotoRequests,
    queryKey: queryKeys.photos,
  });
  const [localStatuses, setLocalStatuses] = useState<
    Record<string, PhotoRequestStatus>
  >({});

  function transitionRequest(
    requestId: string,
    status: Exclude<PhotoRequestStatus, "pending">,
  ) {
    decideManagerPhotoApprovalRequest(requestId, status);
    setLocalStatuses((current) => ({ ...current, [requestId]: status }));
    notify(
      status === "approved"
        ? "Nuova foto approvata e resa disponibile al Club"
        : "Nuova foto rifiutata: il Club mantiene la foto attuale",
      "success",
    );
    void queryClient.invalidateQueries({ queryKey: queryKeys.photos });
    void queryClient.invalidateQueries({ queryKey: queryKeys.players });
    void queryClient.invalidateQueries({ queryKey: queryKeys.staff });
  }

  if (query.isLoading) return <SkeletonBlock />;
  if (query.isError)
    return (
      <ErrorState
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  const requests = (query.data ?? []).map((request) => ({
    ...request,
    status: localStatuses[request.id] ?? request.status,
  }));
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Richieste foto</h2>
        <p className="text-sm text-slate-500">
          Confronta foto attuale e nuova proposta prima della decisione.
        </p>
      </div>
      {requests.length === 0 ? (
        <EmptyState message="Nessuna richiesta foto." />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {requests.map((request) => (
          <PhotoRequestCard
            key={request.id}
            request={request}
            transitionRequest={transitionRequest}
          />
        ))}
      </div>
    </Card>
  );
}

function PhotoRequestCard({
  request,
  transitionRequest,
}: Readonly<{
  request: PhotoRequest;
  transitionRequest: (
    requestId: string,
    status: Exclude<PhotoRequestStatus, "pending">,
  ) => void;
}>) {
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">{request.playerName}</h3>
          <p className="text-xs uppercase tracking-wide text-slate-400">Tesserato</p>
          <p className="text-sm text-slate-500">{request.clubName}</p>
        </div>
        <StatusBadge label={request.status} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <PhotoBox label="Foto attuale" photoUrl={request.currentPhotoUrl} />
        <PhotoBox label="Nuova foto da approvare" photoUrl={request.proposedPhotoUrl} />
      </div>
      {request.status === "rejected" ? (
        <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
          Rifiuto comunicato al Club: resta valida la foto attuale e la
          Federazione può richiedere motivazione dell&apos;upload e documenti
          afferenti l&apos;identità del tesserato.
        </p>
      ) : null}
      {request.status === "approved" ? (
        <p className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700">
          Foto approvata: la nuova immagine è subito disponibile al Club.
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          disabled={request.status !== "pending"}
          onClick={() => transitionRequest(request.id, "approved")}
          type="button"
        >
          Approva
        </Button>
        <Button
          className="bg-red-600"
          disabled={request.status !== "pending"}
          onClick={() => transitionRequest(request.id, "rejected")}
          type="button"
        >
          Rifiuta
        </Button>
      </div>
    </div>
  );
}

function PhotoBox({
  label,
  photoUrl,
}: Readonly<{ label: string; photoUrl: string | null }>) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{label}</p>
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted text-sm text-slate-500">
        {photoUrl ? (
          <img
            alt={label}
            className="h-full w-full object-cover"
            src={photoUrl}
          />
        ) : (
          "Nessuna immagine"
        )}
      </div>
    </div>
  );
}

function HistoryPanel() {
  const historyQuery = useQuery({
    queryFn: fetchFederationHistory,
    queryKey: queryKeys.audit,
  });
  const reportsQuery = useQuery({
    queryFn: fetchFederationReports,
    queryKey: [...queryKeys.matchReports, "history-actions"],
  });
  const [query, setQuery] = useState("");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const filteredHistory = useMemo(
    () =>
      (historyQuery.data ?? []).filter((item) => {
        const searchable =
          `${item.matchLabel} ${item.clubNames.join(" ")} ${item.refereeName}`.toLowerCase();
        return searchable.includes(query.toLowerCase());
      }),
    [historyQuery.data, query],
  );
  const selectedAuditItem =
    filteredHistory.find((item) => item.id === selectedAuditId) ?? null;
  const selectedReport =
    (reportsQuery.data ?? []).find(
      (report) => report.id === selectedReportId,
    ) ?? null;

  if (historyQuery.isLoading || reportsQuery.isLoading)
    return <SkeletonBlock />;
  if (historyQuery.isError)
    return (
      <ErrorState
        message={historyQuery.error.message}
        onRetry={() => void historyQuery.refetch()}
      />
    );
  if (reportsQuery.isError)
    return (
      <ErrorState
        message={reportsQuery.error.message}
        onRetry={() => void reportsQuery.refetch()}
      />
    );
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Storico</h2>
        <p className="text-sm text-slate-500">
          Ricerca gara, società o arbitro e accedi a referto e audit sintetico.
        </p>
      </div>
      <Input
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Cerca gara, società o arbitro"
        value={query}
      />
      {filteredHistory.length === 0 ? (
        <EmptyState message="Nessun elemento storico trovato." />
      ) : null}
      <div className="space-y-3">
        {filteredHistory.map((item) => (
          <HistoryCard
            item={item}
            key={item.id}
            onOpenAudit={() => {
              setSelectedAuditId(item.id);
              setSelectedReportId(null);
            }}
            onOpenReport={() => {
              setSelectedReportId(item.reportId);
              setSelectedAuditId(null);
            }}
          />
        ))}
      </div>
      {selectedReport ? <ReportDetail report={selectedReport} /> : null}
      {selectedAuditItem ? (
        <AuditSummaryPanel item={selectedAuditItem} />
      ) : null}
    </Card>
  );
}

function HistoryCard({
  item,
  onOpenAudit,
  onOpenReport,
}: Readonly<{
  item: FederationHistoryItem;
  onOpenAudit: () => void;
  onOpenReport: () => void;
}>) {
  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="font-bold">{item.matchLabel}</h3>
          <p className="text-sm text-slate-500">Arbitro: {item.refereeName}</p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Button
            className="h-10 min-w-[120px] rounded-md px-4 text-center leading-none"
            onClick={onOpenReport}
            type="button"
          >
            Apri referto
          </Button>
          <Button
            className="h-10 min-w-[130px] rounded-md bg-slate-700 px-4 text-center leading-none"
            onClick={onOpenAudit}
            type="button"
          >
            Audit sintetico
          </Button>
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {item.auditSummary.map((entry) => (
          <li key={entry}>• {entry}</li>
        ))}
      </ul>
    </div>
  );
}

function AuditSummaryPanel({
  item,
}: Readonly<{ item: FederationHistoryItem }>) {
  const auditEntries = [
    "Distinta inviata dal dirigente",
    "Riconoscimento completato dall’arbitro",
    "Referto inviato dall’arbitro",
    "Referto ricevuto dalla federazione",
    ...item.auditSummary,
  ];

  return (
    <Card className="space-y-3 border-slate-300 bg-slate-50">
      <div>
        <p className="text-sm font-semibold text-primary">Audit sintetico</p>
        <h3 className="text-xl font-bold">{item.matchLabel}</h3>
        <p className="text-sm text-slate-500">
          Attore evento: {item.refereeName || "Arbitro Demo"}
        </p>
      </div>
      <ol className="space-y-2 text-sm">
        {auditEntries.map((entry, index) => (
          <li className="rounded-lg bg-white p-3" key={`${entry}-${index}`}>
            <span className="font-semibold">{index + 1}. </span>
            {entry}
            <span className="block text-xs text-slate-500">
              Timestamp: {formatSubmittedAt(new Date().toISOString())}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function formatSubmittedAt(value: string) {
  return value ? new Date(value).toLocaleString("it-IT") : "Invio registrato";
}

function formatReportTeamName(
  teamName: string,
  homeTeam: string,
  awayTeam: string,
): string {
  if (teamName === "Casa") return homeTeam;
  if (teamName === "Ospite") return awayTeam;
  return teamName;
}

function formatStatusLabel(status: string): string {
  return (
    {
      all: "Tutti",
      archived: "Archiviata",
      approved: "Approvata",
      completed: "Completata",
      draft: "Bozza",
      failed: "Errore",
      in_progress: "In corso",
      missing: "Mancante",
      pending: "In attesa",
      rejected: "Rifiutata",
      reviewed: "Revisionato",
      scheduled: "Programmata",
      submitted: "Inviato",
      warning: "Attenzione",
    }[status] ?? status
  );
}

function statusBadgeClass(status: string): string {
  if (
    ["submitted", "reviewed", "completed", "approved", "ok"].includes(status)
  ) {
    return "bg-green-100 text-green-800";
  }
  if (
    [
      "scheduled",
      "pending",
      "missing",
      "draft",
      "in_progress",
      "warning",
    ].includes(status)
  ) {
    return "bg-amber-100 text-amber-900";
  }
  if (["failed", "rejected"].includes(status)) return "bg-red-100 text-red-800";
  return "bg-muted text-slate-700";
}

function StatusBadge({
  label,
  status,
}: Readonly<{ label?: string; status?: string }>) {
  const displayValue = label ?? formatStatusLabel(status ?? "");
  return (
    <span
      className={`inline-flex min-h-10 min-w-[112px] items-center justify-center rounded-md px-4 py-2 text-center text-xs font-semibold leading-none ${statusBadgeClass(status ?? "")}`}
    >
      {displayValue}
    </span>
  );
}

function ScoreBadge({
  awayGoals,
  homeGoals,
}: Readonly<{ awayGoals: number; homeGoals: number }>) {
  return (
    <span className="inline-flex min-h-12 min-w-[88px] items-center justify-center rounded-xl bg-primary px-5 py-3 text-center text-xl font-black leading-none text-white shadow-md">
      {homeGoals}-{awayGoals}
    </span>
  );
}
