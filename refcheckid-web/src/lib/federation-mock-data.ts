import type {
  FederationDashboard,
  FederationHistoryItem,
  FederationMatchListItem,
  FederationReport,
  PhotoRequest,
} from "./federation-types";

export const federationDashboard: FederationDashboard = {
  reportsReceived: 12,
  pendingPhotoRequests: 3,
  syncStatus: "ok",
  notifications: [
    "2 referti ricevuti nelle ultime 24 ore",
    "3 richieste foto in attesa di revisione",
    "Sincronizzazione tesserati completata",
  ],
};

export const federationMatches: readonly FederationMatchListItem[] = [
  {
    id: "fed-match-1",
    matchday: 7,
    scheduledAt: "2026-07-05T16:30:00.000Z",
    homeTeam: "ASD Aurora",
    awayTeam: "Polisportiva Mare",
    refereeName: "Elena Riva",
    matchStatus: "completed",
    reportStatus: "submitted",
  },
  {
    id: "fed-match-2",
    matchday: 7,
    scheduledAt: "2026-07-06T18:00:00.000Z",
    homeTeam: "Sporting Centro",
    awayTeam: "Real Collina",
    refereeName: "Marco Gallo",
    matchStatus: "scheduled",
    reportStatus: "missing",
  },
  {
    id: "fed-match-3",
    matchday: 8,
    scheduledAt: "2026-07-12T15:00:00.000Z",
    homeTeam: "Atletico Verde",
    awayTeam: "Nuova Stella",
    refereeName: "Sara Fermi",
    matchStatus: "archived",
    reportStatus: "reviewed",
  },
];

export const federationReports: readonly FederationReport[] = [
  {
    id: "report-1",
    matchId: "fed-match-1",
    homeTeam: "ASD Aurora",
    awayTeam: "Polisportiva Mare",
    refereeName: "Elena Riva",
    commissionerNotes: "Organizzazione regolare, nessuna criticità.",
    refereeNotes: "Gara regolare. Recupero di 3 minuti nel secondo tempo.",
    result: { homeGoals: 2, awayGoals: 1 },
    goals: [
      {
        id: "goal-1",
        minute: 18,
        teamName: "ASD Aurora",
        playerName: "Edoardo Villa",
        detail: "Azione",
      },
      {
        id: "goal-2",
        minute: 61,
        teamName: "Polisportiva Mare",
        playerName: "Samuele Costa",
        detail: "Rigore",
      },
      {
        id: "goal-3",
        minute: 79,
        teamName: "ASD Aurora",
        playerName: "Marco Blu",
        detail: "Azione",
      },
    ],
    cautions: [
      {
        id: "yc-1",
        minute: 44,
        teamName: "ASD Aurora",
        playerName: "Giorgio Marini",
        detail: "Proteste",
      },
      {
        id: "yc-2",
        minute: 72,
        teamName: "Polisportiva Mare",
        playerName: "Luca Basso",
        detail: "Fallo tattico",
      },
    ],
    expulsions: [],
    substitutions: [
      {
        id: "sub-1",
        minute: 70,
        teamName: "ASD Aurora",
        playerName: "Marco Blu per Edoardo Villa",
        detail: "Sostituzione",
      },
    ],
    submittedAt: "2026-07-05T19:05:00.000Z",
  },
];

export const photoRequests: readonly PhotoRequest[] = [
  {
    id: "photo-req-1",
    playerName: "Luca Bianchi",
    clubName: "ASD Aurora",
    currentPhotoUrl: null,
    proposedPhotoUrl: null,
    status: "pending",
    requestedAt: "2026-07-04T11:20:00.000Z",
  },
  {
    id: "photo-req-2",
    playerName: "Andrea Verdi",
    clubName: "Sporting Centro",
    currentPhotoUrl: null,
    proposedPhotoUrl: null,
    status: "approved",
    requestedAt: "2026-07-03T09:15:00.000Z",
  },
  {
    id: "photo-req-3",
    playerName: "Marta Costa",
    clubName: "Real Collina",
    currentPhotoUrl: null,
    proposedPhotoUrl: null,
    status: "rejected",
    requestedAt: "2026-07-02T17:45:00.000Z",
  },
];

export const federationHistory: readonly FederationHistoryItem[] = [
  {
    id: "history-1",
    matchLabel: "ASD Aurora - Polisportiva Mare",
    clubNames: ["ASD Aurora", "Polisportiva Mare"],
    refereeName: "Elena Riva",
    reportId: "report-1",
    auditSummary: [
      "Referto inviato",
      "Distinte bloccate",
      "Riconoscimento completato",
    ],
  },
  {
    id: "history-2",
    matchLabel: "Atletico Verde - Nuova Stella",
    clubNames: ["Atletico Verde", "Nuova Stella"],
    refereeName: "Sara Fermi",
    reportId: "report-archived-1",
    auditSummary: ["Gara archiviata", "Referto revisionato"],
  },
];
