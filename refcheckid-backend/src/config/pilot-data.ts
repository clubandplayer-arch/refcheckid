import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Match, MatchReport, MatchSheet, UUID } from '../domain/index.js';

const arch1DemoManifest = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'demo/arch1-demo-manifest.json'), 'utf8'),
) as Arch1DemoManifest;

interface Arch1DemoManifest {
  ids: Record<string, UUID>;
  generatedAt: string;
  matches: readonly DemoMatch[];
  matchSheets: readonly DemoMatchSheet[];
  matchReports: readonly DemoMatchReport[];
}

interface DemoMatch {
  id: UUID;
  homeClubId: UUID;
  awayClubId: UUID;
  federationId: UUID;
  refereeId: UUID;
  scheduledAt: string;
  season: string;
  status: Match['status'];
  venue: string | null;
}

interface DemoMatchSheet {
  id: UUID;
  matchId: UUID;
  clubId: UUID;
  status: MatchSheet['status'];
}

interface DemoMatchReport {
  id: UUID;
  matchId: UUID;
  refereeId: UUID;
  status: MatchReport['status'];
  summary: string | null;
}

export const pilotIds = {
  awayClub: arch1DemoManifest.ids.awayClub,
  awaySheet: arch1DemoManifest.ids.awaySheet,
  federation: arch1DemoManifest.ids.federation,
  homeClub: arch1DemoManifest.ids.homeClub,
  homeSheet: arch1DemoManifest.ids.homeSheet,
  match: arch1DemoManifest.ids.match,
  report: arch1DemoManifest.ids.report,
  referee: arch1DemoManifest.ids.referee,
} as const satisfies Record<string, UUID>;

const timestamp = arch1DemoManifest.generatedAt;

export const pilotMatches: readonly Match[] = arch1DemoManifest.matches.map((match) => ({
  awayClubId: match.awayClubId,
  createdAt: timestamp,
  deletedAt: null,
  federationId: match.federationId,
  homeClubId: match.homeClubId,
  id: match.id,
  refereeId: match.refereeId,
  scheduledAt: match.scheduledAt,
  season: match.season,
  status: match.status,
  updatedAt: timestamp,
  venue: match.venue,
}));

export const pilotMatchSheets: readonly MatchSheet[] = arch1DemoManifest.matchSheets.map((matchSheet) => ({
  clubId: matchSheet.clubId,
  createdAt: timestamp,
  deletedAt: null,
  id: matchSheet.id,
  matchId: matchSheet.matchId,
  status: matchSheet.status,
  submittedAt: null,
  updatedAt: timestamp,
}));

export const pilotMatchReports: readonly MatchReport[] = arch1DemoManifest.matchReports.map((matchReport) => ({
  createdAt: timestamp,
  deletedAt: null,
  id: matchReport.id,
  matchId: matchReport.matchId,
  refereeId: matchReport.refereeId,
  status: matchReport.status,
  submittedAt: null,
  summary: matchReport.summary,
  updatedAt: timestamp,
}));
