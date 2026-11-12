import type {DetailedSportId} from './sports.js';
export interface Entity {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: null;
}
export type Role =
  | 'org_admin'
  | 'registrar'
  | 'competition_manager'
  | 'designator'
  | 'photo_reviewer'
  | 'report_reader'
  | 'viewer'
  | 'referee'
  | 'club_manager';
export type Capability =
  'structure' | 'people' | 'competitions' | 'designate' | 'results' | 'reports' | 'read';
export const roles: readonly Role[] = [
  'org_admin',
  'registrar',
  'competition_manager',
  'designator',
  'photo_reviewer',
  'report_reader',
  'viewer',
  'referee',
  'club_manager',
];
export const capabilities: Record<Role, readonly Capability[]> = {
  org_admin: ['structure', 'people', 'competitions', 'designate', 'results', 'reports', 'read'],
  registrar: ['people', 'read'],
  competition_manager: ['competitions', 'results', 'reports', 'read'],
  designator: ['designate', 'people', 'read'],
  photo_reviewer: ['read'],
  report_reader:['reports','read'],
  viewer: ['read'],
  referee: [],
  club_manager: [],
};
export interface Organization extends Entity {
  name: string;
  kind: 'sports' | 'refereeing';
  federationId: string | null;
  rootUnitId: string;
}
export interface Unit extends Entity {
  organizationId: string;
  parentId: string | null;
  name: string;
  kind: string;
  territory: string;
}
export interface Membership extends Entity {
  organizationId: string;
  unitId: string;
  actorId: string;
  role: Role;
  active: boolean;
  descendants: boolean;
  refereeId?: string;
  clubId?: string;
}
export interface Competition extends Entity {
  organizationId: string;
  unitId: string;
  name: string;
  sport: DetailedSportId;
  season: string;
  category: string;
  group: string;
  rules: {
    periods: number;
    minutesPerPeriod: number;
    starters: number;
    scoring: 'goals' | 'points' | 'sets';
    version: number;
    goalkeeperRequired?: boolean;
    benchLimit?: number;
    staffLimit?: number;
    minShirtNumber?: number;
  };
}
export interface Delegation extends Entity {
  unitId: string;
  organizationId: string;
  competitionId: string;
  recipientOrganizationId: string;
  recipientUnitId: string;
  actions: readonly ('read' | 'designate')[];
  active: boolean;
  expiresAt: string;
}
export interface Official extends Entity {
  organizationId: string;
  unitId: string;
  code: string;
  firstName: string;
  lastName: string;
  sports: string[];
  active: boolean;
  actorId: string | null;
  refereeId: string;
}
export interface Team extends Entity {
  organizationId: string;
  unitId: string;
  code: string;
  clubId: string;
  name: string;
  sport: string;
  season: string;
  category: string;
}
export interface Entry extends Entity {
  name?: string;
  code?: string;
  season?: string;
  organizationId: string;
  competitionId: string;
  teamId: string;
}
export interface Fixture extends Entity {
  organizationId: string;
  unitId: string;
  competitionId: string;
  externalCode: string;
  homeTeamId: string;
  awayTeamId: string;
  matchId: string;
  round: string;
  scheduledAt: string;
  venue: string;
  durationMinutes: number;
  cancelled: boolean;
  revision: number;
}
export type AppointmentStatus = 'draft' | 'invited' | 'accepted' | 'declined' | 'revoked';
export interface Appointment extends Entity {
  delegationId?: string | null;
  organizationId: string;
  ownerOrganizationId: string;
  unitId: string;
  competitionId: string;
  fixtureId: string;
  officialId: string;
  refereeId: string;
  actorId: string | null;
  role: 'principal' | 'assistant' | 'table';
  status: AppointmentStatus;
  fixtureRevision: number;
  notes: string;
  changedBy: string;
}
export interface Invitation extends Entity {
  descendants?: boolean;
  reservedAt?: string;
  reservationId?: string;
  provisionedProfileId?: string;
  recoveryProfileId?: string;
  attempts?: number;
  organizationId: string;
  unitId: string;
  email: string | null;
  displayName: string;
  role: Role;
  officialId: string | null;
  clubId: string | null;
  code: string;
  tokenHash: string;
  expiresAt: string;
  status: 'pending' | 'reserved' | 'accepted' | 'revoked';
  actorId: string | null;
}
export interface Unavailability extends Entity {
  organizationId: string;
  officialId: string;
  from: string;
  until: string;
  notes: string;
}
export interface Notification extends Entity {
  organizationId: string;
  actorId: string | null;
  officialId: string | null;
  appointmentId: string;
  message: string;
  readAt: string | null;
  channel: 'in_app';
  status: 'available';
}
export interface GameEvent {
  period: number;
  id: string;
  type: 'goal' | 'own_goal' | 'yellow' | 'red' | 'substitution' | 'points' | 'set';
  clubId: string;
  registrationId: string | null;
  incomingRegistrationId: string | null;
  minute: number;
  stoppage: number;
  points: number;
}
export interface PeriodUpdate extends Entity {
  fingerprint: string;
  organizationId: string;
  competitionId: string;
  fixtureId: string;
  period: number;
  revision: number;
  homeScore: number;
  awayScore: number;
  events: GameEvent[];
  state: 'provisional' | 'period_confirmed' | 'final_confirmed';
  actorId: string;
  operationId: string;
  correctionReason: string | null;
}
export interface GameSummary extends Entity {
  lastConfirmedPeriod?: number;
  lastConfirmedOperationId?: string;
  homologatedAt?: string;
  homologatedBy?: string;
  organizationId: string;
  competitionId: string;
  fixtureId: string;
  revision: number;
  period: number;
  homeScore: number;
  awayScore: number;
  state: PeriodUpdate['state'];
  actorId: string;
  confirmedAt: string;
  operationId: string;
}
export type ImportKind =
  'clubs' | 'teams' | 'players' | 'staff' | 'officials' | 'fixtures' | 'appointments';
export interface ImportJob extends Entity {
  organizationId: string;
  unitId: string;
  competitionId: string | null;
  kind: ImportKind;
  filename: string;
  status: 'validating' | 'preview' | 'running' | 'completed' | 'cancelled';
  chunks: string[];
  validated: number;
  total: number;
  errors: number;
  processed: number;
  actorId: string;
  sha256: string;
}
export interface ImportRow extends Entity {
  organizationId: string;
  jobId: string;
  number: number;
  data: Record<string, string>;
  errors: string[];
  state: 'ready' | 'error' | 'committed';
  targetId: string | null;
}
export interface PersonRecord extends Entity {
  organizationId: string;
  unitId: string;
  kind: 'player' | 'staff';
  code: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  clubId: string;
  season: string;
  registrationId: string;
  personId: string;
  status: 'active' | 'suspended' | 'ended';
}
export interface SquadMember extends Entity {
  organizationId: string;
  unitId: string;
  teamId: string;
  registrationId: string;
  kind: 'player' | 'staff';
  active: boolean;
}
