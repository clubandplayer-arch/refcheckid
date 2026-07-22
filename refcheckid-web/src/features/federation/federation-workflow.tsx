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
  approvePhotoRequest,
  federationRejectReasonCodes,
  fetchPhotoRequests,
  rejectPhotoRequest,
} from "@/lib/federation-api-client";
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
  "Import dati",
  "Calendario",
  "Referti",
  "Foto",
  "Storico",
] as const;
const reportStatuses: readonly ("all" | FederationReportStatus)[] = [
  "all",
  "missing",
  "draft",
  "in_compilation",
  "submitted",
  "reviewed",
];
const importTemplates = [
  {
    check:
      "Confermare che codice società, stagione, categoria/campionato/girone e contatti siano campi realistici.",
    description: "Crea o aggiorna società/squadre gestite dalla Federazione.",
    fileName: "societa.csv",
    previewColumns: ["codice_societa", "nome_societa", "stagione", "campionato"],
    previewRows: [
      ["CLUB001", "ASD Atletico Aurora", "2026/2027", "Campionato Demo"],
      ["CLUB002", "ASD Sporting Litorale", "2026/2027", "Campionato Demo"],
    ],
    requiredColumns: ["codice_societa", "nome_societa", "stato", "stagione"],
    title: "Società / squadre",
  },
  {
    check:
      "Confermare che codice tessera e data nascita siano sempre disponibili nell'export federale.",
    description: "Crea o aggiorna l'anagrafica generale dei tesserati.",
    fileName: "tesserati_generale.csv",
    previewColumns: ["codice_tessera", "nome", "cognome", "data_nascita"],
    previewRows: [
      ["TESS001", "Marco", "Rossi", "2006-04-12"],
      ["TESS002", "Luca", "Bianchi", "2006-09-03"],
    ],
    requiredColumns: [
      "codice_tessera",
      "nome",
      "cognome",
      "data_nascita",
      "stato_tesserato",
    ],
    title: "Tesserati generale",
  },
  {
    check:
      "Confermare se il file sarà multi-società o se la società verrà scelta prima dell'upload.",
    description: "Associa tesserati a società e stagione sportiva.",
    fileName: "tesserati_societa.csv",
    previewColumns: [
      "codice_societa",
      "codice_tessera",
      "stagione",
      "stato_posizione",
    ],
    previewRows: [
      ["CLUB001", "TESS001", "2026/2027", "active"],
      ["CLUB001", "TESS002", "2026/2027", "active"],
    ],
    requiredColumns: [
      "codice_societa",
      "codice_tessera",
      "stagione",
      "stato_posizione",
    ],
    title: "Tesserati per società",
  },
  {
    check:
      "Confermare ruoli staff ammessi e se codice staff è disponibile nei dati federali.",
    description: "Crea o aggiorna staff e posizione presso società/stagione.",
    fileName: "staff.csv",
    previewColumns: ["codice_societa", "codice_staff", "ruolo", "stagione"],
    previewRows: [
      ["CLUB001", "STAFF001", "allenatore", "2026/2027"],
      ["CLUB001", "STAFF002", "dirigente_accompagnatore", "2026/2027"],
    ],
    requiredColumns: [
      "codice_societa",
      "codice_staff",
      "nome",
      "cognome",
      "ruolo",
      "stagione",
      "stato_posizione",
    ],
    title: "Staff",
  },
  {
    check:
      "Confermare codice arbitro, sezioni e qualifiche disponibili negli export.",
    description: "Crea o aggiorna gli arbitri abilitati dalla Federazione.",
    fileName: "arbitri.csv",
    previewColumns: ["codice_arbitro", "nome", "cognome", "qualifica"],
    previewRows: [
      ["ARB001", "Giuseppe", "Verdi", "arbitro_principale"],
      ["ARB002", "Anna", "Neri", "arbitro_principale"],
    ],
    requiredColumns: ["codice_arbitro", "nome", "cognome", "stato"],
    title: "Arbitri",
  },
  {
    check:
      "Confermare che codice gara, società casa/ospite, stagione e campionato distinguano univocamente la gara.",
    description: "Crea o aggiorna il calendario ufficiale gare.",
    fileName: "calendario.csv",
    previewColumns: [
      "codice_gara",
      "data",
      "ora",
      "casa",
      "ospite",
    ],
    previewRows: [
      ["GARA001", "2026-09-20", "15:00", "CLUB001", "CLUB002"],
      ["GARA002", "2026-09-27", "15:00", "CLUB002", "CLUB001"],
    ],
    requiredColumns: [
      "codice_gara",
      "stagione",
      "data",
      "ora",
      "codice_societa_casa",
      "codice_societa_ospite",
      "stato_gara",
    ],
    title: "Calendario gare",
  },
  {
    check:
      "Confermare che calendario e designazioni possano essere file separati nel MVP.",
    description: "Designa l'arbitro principale MVP su una gara già importata.",
    fileName: "designazioni.csv",
    previewColumns: [
      "codice_gara",
      "codice_arbitro",
      "ruolo",
      "stato_designazione",
    ],
    previewRows: [
      ["GARA001", "ARB001", "arbitro_principale", "designato"],
      ["GARA002", "ARB002", "arbitro_principale", "designato"],
    ],
    requiredColumns: [
      "codice_gara",
      "codice_arbitro",
      "ruolo",
      "stato_designazione",
    ],
    title: "Designazioni arbitrali",
  },
] as const;

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
      {section === 1 ? <ImportTemplatesPanel /> : null}
      {section === 2 ? <MatchCalendarPanel /> : null}
      {section === 3 ? <ReportsPanel /> : null}
      {section === 4 ? <PhotoRequestsPanel /> : null}
      {section === 5 ? <HistoryPanel /> : null}
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

function ImportTemplatesPanel() {
  return (
    <Card className="space-y-5">
      <div>
        <p className="text-sm font-semibold text-primary">
          PR 1 · Verifica template CSV
        </p>
        <h2 className="text-xl font-bold">Import dati federali</h2>
        <p className="mt-1 text-sm text-slate-500">
          Scarica i template e conferma se colonne obbligatorie, codici esterni
          e campi competizione sono coerenti con gli export reali della
          Federazione. Questa schermata è solo di verifica: non importa ancora
          dati.
        </p>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Check richiesto prima della PR 2</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>I template rappresentano dati federali realistici.</li>
          <li>Le colonne obbligatorie sono disponibili nei database federali.</li>
          <li>
            I codici esterni sono realistici: società, tessera, staff, arbitro e
            gara.
          </li>
          <li>
            Società e squadra possono coincidere nel MVP oppure serve entità
            separata.
          </li>
          <li>
            Stagione, campionato, categoria e girone bastano a distinguere le
            competizioni.
          </li>
        </ul>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {importTemplates.map((template) => (
          <div className="space-y-3 rounded-xl border p-4" key={template.fileName}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="font-bold">{template.title}</h3>
                <p className="text-sm text-slate-500">
                  {template.description}
                </p>
              </div>
              <a
                className="inline-flex min-h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white"
                download
                href={`/federation-import-templates/${template.fileName}`}
              >
                Scarica CSV
              </a>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Colonne obbligatorie
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {template.requiredColumns.map((column) => (
                  <span
                    className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-slate-700"
                    key={column}
                  >
                    {column}
                  </span>
                ))}
              </div>
            </div>
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              {template.check}
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-left text-xs">
                <caption className="bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">
                  Anteprima leggibile
                </caption>
                <thead className="bg-muted text-slate-600">
                  <tr>
                    {template.previewColumns.map((column) => (
                      <th className="px-3 py-2 font-semibold" key={column}>
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {template.previewRows.map((row) => (
                    <tr key={row.join("-")}>
                      {row.map((cell, index) => (
                        <td className="px-3 py-2" key={`${cell}-${index}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
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
    return <EmptyState message="Nessun referto inviato alla Federazione." />;
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
  const [statusFilter, setStatusFilter] = useState<PhotoRequestStatus | "all">(
    "pending",
  );
  const [slaFilter, setSlaFilter] = useState("all");
  const [clubFilter, setClubFilter] = useState("");
  const query = useQuery({
    queryFn: () =>
      fetchPhotoRequests({
        clubId: clubFilter.trim() || undefined,
        sla: slaFilter as "all" | "overdue" | "on_track" | "not_set" | "closed",
        status: statusFilter,
      }),
    queryKey: [...queryKeys.photos, statusFilter, slaFilter, clubFilter],
  });
  const [localStatuses, setLocalStatuses] = useState<
    Record<string, PhotoRequestStatus>
  >({});

  async function transitionRequest(
    requestId: string,
    status: Exclude<PhotoRequestStatus, "pending">,
    reasonCode = status === "approved" ? "identity_verified" : "quality_issue",
    notes = "Decisione operatore federale",
  ) {
    if (status === "approved") {
      await approvePhotoRequest(requestId, reasonCode);
    } else {
      await rejectPhotoRequest(requestId, reasonCode, notes);
    }
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
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm font-medium">
          Stato
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) =>
              setStatusFilter(event.target.value as PhotoRequestStatus | "all")
            }
            value={statusFilter}
          >
            {[
              "all",
              "pending",
              "approved",
              "rejected",
              "cancelled",
              "expired",
            ].map((status) => (
              <option key={status} value={status}>
                {formatStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          SLA
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            onChange={(event) => setSlaFilter(event.target.value)}
            value={slaFilter}
          >
            {["all", "overdue", "on_track", "not_set", "closed"].map((sla) => (
              <option key={sla} value={sla}>
                {formatStatusLabel(sla)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          Società
          <Input
            onChange={(event) => setClubFilter(event.target.value)}
            placeholder="Club ID"
            value={clubFilter}
          />
        </label>
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
    reasonCode?: string,
    notes?: string,
  ) => Promise<void>;
}>) {
  const [reasonCode, setReasonCode] = useState("quality_issue");
  const [notes, setNotes] = useState("");
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">{request.playerName}</h3>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Tesserato
          </p>
          <p className="text-sm text-slate-500">{request.clubName}</p>
          {request.slaStatus ? (
            <p className="mt-1 text-xs text-slate-500">
              SLA: {formatStatusLabel(request.slaStatus)}
            </p>
          ) : null}
          {request.photoEtag ? (
            <p className="text-xs text-slate-400">ETag: {request.photoEtag}</p>
          ) : null}
        </div>
        <StatusBadge label={request.status} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <PhotoBox label="Foto attuale" photoUrl={request.currentPhotoUrl} />
        <PhotoBox
          label="Nuova foto da approvare"
          photoUrl={request.proposedPhotoUrl}
        />
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
        <select
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
          disabled={request.status !== "pending"}
          onChange={(event) => setReasonCode(event.target.value)}
          value={reasonCode}
        >
          {federationRejectReasonCodes.map((reason) => (
            <option key={reason.code} value={reason.code}>
              {reason.label}
            </option>
          ))}
        </select>
        <Input
          disabled={request.status !== "pending"}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Note rigetto"
          value={notes}
        />
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
          onClick={() =>
            transitionRequest(request.id, "rejected", reasonCode, notes)
          }
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
          `${item.matchLabel} ${item.clubNames.join(" ")} ${item.refereeName} ${item.auditSummary.join(" ")}`.toLowerCase();
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
          Consulta eventi foto e archiviazioni referto con tesserato, società e
          azione eseguita.
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
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase text-primary">
            {item.eventCategory === "photo" ? "Workflow foto" : "Workflow gara"}
          </p>
          <h3 className="font-bold">{item.matchLabel}</h3>
          <p className="text-sm text-slate-500">
            Attore: {item.refereeName} · Azione: {item.eventDescription}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          {item.reportId ? (
            <Button
              className="h-10 min-w-[120px] rounded-md px-4 text-center leading-none"
              onClick={onOpenReport}
              type="button"
            >
              Apri referto
            </Button>
          ) : null}
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
          Attore evento: {item.refereeName || "Arbitro Demo"} · Categoria:{" "}
          {item.eventCategory === "photo" ? "foto tessera" : "gara/referto"}
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
      cancelled: "Annullata",
      completed: "Completata",
      closed: "Chiusa",
      draft: "Bozza",
      expired: "Scaduta",
      failed: "Errore",
      in_compilation: "In compilazione",
      in_progress: "In corso",
      missing: "Mancante",
      not_set: "Non impostato",
      on_track: "Nei tempi",
      overdue: "In ritardo",
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
    [
      "submitted",
      "reviewed",
      "completed",
      "approved",
      "ok",
      "on_track",
      "closed",
    ].includes(status)
  ) {
    return "bg-green-100 text-green-800";
  }
  if (
    [
      "scheduled",
      "pending",
      "missing",
      "draft",
      "in_compilation",
      "in_progress",
      "warning",
      "not_set",
    ].includes(status)
  ) {
    return "bg-amber-100 text-amber-900";
  }
  if (
    ["failed", "rejected", "cancelled", "expired", "overdue"].includes(status)
  )
    return "bg-red-100 text-red-800";
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
