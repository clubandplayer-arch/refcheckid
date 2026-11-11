import type { RuntimePersistence } from '../repositories/runtime-persistence.js';

export interface RosterSubject {
  team: 'home' | 'away'; clubId: string; kind: 'athlete' | 'staff_member';
  personId: string; registrationId: string;
  before: { firstName: string; lastName: string }; after: { firstName: string; lastName: string };
  file: string; sha256: string; bytes: number; width: number; height: number; mimeType: string;
  role?: string;
}
export interface RosterManifest {
  format: number; batch: string; targetProjectRef: string; federationId: string; season: string;
  clubs: { id: string; before: string; after: string }[];
  subjects: RosterSubject[];
  retiredStaff: { personId: string; registrationId: string; clubId: string;
    before: { firstName: string; lastName: string } }[];
}
type Document = Record<string, unknown> & { id: string };
export interface RosterChange { repository: string; before: Document; after: Document }
const live = (row: Document) => row.deletedAt == null;

/** Operator-only migration: no images, resets, approvals or deletions here. */
export async function planRosterChanges(store: RuntimePersistence, manifest: RosterManifest): Promise<RosterChange[]> {
  if (manifest.format !== 1 || manifest.subjects.length !== 42 || manifest.clubs.length !== 2 || manifest.retiredStaff.length !== 2) throw new Error('Invalid roster manifest.');
  for (const key of ['personId', 'registrationId', 'file'] as const) {
    if (new Set(manifest.subjects.map((row) => row[key])).size !== 42) throw new Error(`Duplicate roster ${key}.`);
  }
  for (const team of ['home', 'away']) {
    if (manifest.subjects.filter((row) => row.team === team && row.kind === 'athlete').length !== 18 ||
      manifest.subjects.filter((row) => row.team === team && row.kind === 'staff_member').length !== 3) throw new Error('Expected 18 players and 3 staff per club.');
  }
  const clubs = new Set(manifest.clubs.map((club) => club.id));
  const matches = (await store.list<Document>('matches')).filter((row) => live(row) && (clubs.has(String(row.homeClubId)) || clubs.has(String(row.awayClubId))));
  if (!matches.length || matches.some((row) => row.status !== 'scheduled')) throw new Error('Roster restoration requires scheduled fixtures; no reset will be performed.');
  const matchIds = new Set(matches.map((row) => row.id));
  const sheets = (await store.list<Document>('match_sheets')).filter((row) => live(row) && matchIds.has(String(row.matchId)));
  if (sheets.some((row) => row.status !== 'draft')) throw new Error('Submitted/locked sheets must not be changed by this migration.');
  const retired = new Set(manifest.retiredStaff.map((row) => row.registrationId));
  if ((await store.list<Document>('match_sheet_staff')).some((row) => live(row) && retired.has(String(row.staffRegistrationId)))) {
    throw new Error('A staff member to retire is selected in a lineup. No lineup will be modified automatically.');
  }
  const targetRegs = new Set(manifest.subjects.map((row) => row.registrationId));
  if ((await store.list<Document>('match_sheet_photo_snapshots')).some((row) => live(row) && (targetRegs.has(String(row.registrationId)) || retired.has(String(row.registrationId))))) {
    throw new Error('Active historical snapshots reference this roster. Restoration stopped to preserve history.');
  }
  const changes: RosterChange[] = [];
  const requireRow = async (repository: string, id: string) => {
    const row = await store.get<Document>(repository, id);
    if (!row) throw new Error(`Missing ${repository} reference: ${id}`);
    return row;
  };
  const add = (repository: string, before: Document, fields: Record<string, unknown>) => {
    if (Object.entries(fields).every(([key, value]) => before[key] === value)) return;
    changes.push({ repository, before, after: { ...before, ...fields, updatedAt: new Date().toISOString() } });
  };
  const checkName = (person: Document, before: RosterSubject['before'], after: RosterSubject['after']) => {
    if (![before, after].some((name) => name.firstName === person.firstName && name.lastName === person.lastName)) throw new Error(`Unexpected person name for ${person.id}; no ordinal-only reassignment is allowed.`);
  };
  for (const club of manifest.clubs) {
    const row = await requireRow('clubs', club.id);
    if (row.federationId !== manifest.federationId || ![club.before, club.after].includes(String(row.name))) throw new Error('Unexpected club/federation identity.');
    add('clubs', row, { name: club.after });
  }
  for (const subject of manifest.subjects) {
    const player = subject.kind === 'athlete';
    const repo = player ? 'players' : 'staff_members';
    const person = await requireRow(repo, subject.personId);
    const registration = await requireRow(player ? 'player_registrations' : 'staff_registrations', subject.registrationId);
    if (!live(person) || person.status !== 'active' || !live(registration) || registration.status !== 'active' ||
      person.federationId !== manifest.federationId || registration.clubId !== subject.clubId || registration.season !== manifest.season ||
      registration[player ? 'playerId' : 'staffMemberId'] !== subject.personId) throw new Error(`Registration/identity mismatch: ${subject.registrationId}`);
    checkName(person, subject.before, subject.after);
    add(repo, person, subject.after);
    if (!player) add('staff_registrations', registration, { role: subject.role });
  }
  for (const subject of manifest.retiredStaff) {
    const person = await requireRow('staff_members', subject.personId);
    const registration = await requireRow('staff_registrations', subject.registrationId);
    checkName(person, subject.before, subject.before);
    if (person.federationId !== manifest.federationId || registration.staffMemberId !== person.id || registration.clubId !== subject.clubId || registration.season !== manifest.season) throw new Error('Retired staff identity mismatch.');
    if (registration.status === 'ended' && person.status === 'inactive' && registration.stagingRestoreBatch === manifest.batch) continue;
    if (!live(person) || !live(registration) || registration.status !== 'active') throw new Error('Unexpected retired staff state.');
    // Preserve all identifiers, registrations, photos and historical references.
    add('staff_members', person, { status: 'inactive', stagingRestoreBatch: manifest.batch });
    add('staff_registrations', registration, { status: 'ended', stagingRestoreBatch: manifest.batch });
  }
  return changes;
}

export async function applyRosterChanges(store: RuntimePersistence, changes: readonly RosterChange[]): Promise<void> {
  for (const change of changes) {
    const current = await store.get<Document>(change.repository, change.before.id);
    if (JSON.stringify(current) !== JSON.stringify(change.before)) throw new Error('Roster changed since planning; no stale changes will be applied.');
    await store.put(change.repository, change.after);
  }
}
