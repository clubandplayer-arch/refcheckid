import type {
  MatchReportDraft,
  RecognitionSubject,
  RefereeDashboard,
  TeamSheetVerification,
} from "./referee-types";

export const refereeDashboard: RefereeDashboard = {
  nextMatch: {
    id: "match-referee-1",
    homeTeam: "ASD Aurora",
    awayTeam: "Polisportiva Mare",
    scheduledAt: "2026-07-05T16:30:00.000Z",
    venue: "Stadio Comunale Nord",
    status: "sheets_locked",
  },
  notifications: ["Distinte bloccate", "Riconoscimento pronto"],
};

export const teamSheetVerifications: readonly TeamSheetVerification[] = [
  {
    id: "sheet-home",
    team: "home",
    clubName: "ASD Aurora",
    status: "locked",
    submittedAt: "2026-07-05T14:05:00.000Z",
    playerCount: 18,
    staffCount: 4,
  },
  {
    id: "sheet-away",
    team: "away",
    clubName: "Polisportiva Mare",
    status: "locked",
    submittedAt: "2026-07-05T14:12:00.000Z",
    playerCount: 18,
    staffCount: 3,
  },
];

export const recognitionSubjects: readonly RecognitionSubject[] = [
  {
    id: "rec-1",
    firstName: "Giorgio",
    lastName: "Marini",
    shirtNumber: 1,
    teamName: "ASD Aurora",
    photoUrl: null,
    document: {
      type: "Carta identità",
      number: "CA1234567",
      expiresAt: "2028-02-12",
    },
    decision: "pending",
  },
  {
    id: "rec-2",
    firstName: "Edoardo",
    lastName: "Villa",
    shirtNumber: 9,
    teamName: "ASD Aurora",
    photoUrl: null,
    document: {
      type: "Passaporto",
      number: "YA9988776",
      expiresAt: "2029-09-01",
    },
    decision: "pending",
  },
  {
    id: "rec-3",
    firstName: "Samuele",
    lastName: "Costa",
    shirtNumber: 10,
    teamName: "Polisportiva Mare",
    photoUrl: null,
    document: {
      type: "Carta identità",
      number: "CB7654321",
      expiresAt: "2027-12-20",
    },
    decision: "pending",
  },
];

export const initialMatchReport: MatchReportDraft = {
  homeGoals: 2,
  awayGoals: 1,
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
  ],
  cautions: [
    {
      id: "yc-1",
      minute: 44,
      teamName: "ASD Aurora",
      playerName: "Giorgio Marini",
      detail: "Comportamento non regolamentare",
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
  refereeNotes: "Gara regolare. Nessuna anomalia organizzativa rilevata.",
};
