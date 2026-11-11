import { expect, it } from 'vitest';
import manifestJson from '../demo/restored-roster/manifest.json' with { type: 'json' };
import { preparedApp, plan, lineup } from './runtime-fixtures.js';
import { planRosterChanges, applyRosterChanges, type RosterManifest } from '../src/services/staging-roster-restore.js';
const manifest = manifestJson as RosterManifest;

it('restores names and three staff per club without replacing IDs or photo history; repeated apply is a no-op', async () => {
  const app = await preparedApp();
  try {
    await app.store.put('photo_versions', { id: 'history', status: 'active', storageOriginalKey: 'preserved.png' });
    const beforePlayers = (await app.repositories.players.list()).map((row) => row.id);
    const beforeRegs = await app.repositories.registrations.list();
    const changes = await app.store.transaction(() => planRosterChanges(app.store, manifest));
    expect(changes).toHaveLength(50);
    await app.store.transaction(() => applyRosterChanges(app.store, changes));
    expect((await app.repositories.players.list()).map((row) => row.id)).toEqual(beforePlayers);
    expect(await app.repositories.registrations.list()).toEqual(beforeRegs);
    const first = manifest.subjects[0];
    expect(await app.repositories.players.findById(first.personId)).toMatchObject({ firstName: 'Matteo', lastName: 'Rinaldi' });
    expect(await app.store.get('photo_versions', 'history')).toEqual({ id: 'history', status: 'active', storageOriginalKey: 'preserved.png' });
    for (const club of manifest.clubs) {
      const registrations = await app.repositories.registrations.listStaffRegistrationsByClub(club.id);
      expect(registrations.filter((row) => row.status === 'active')).toHaveLength(3);
      expect(registrations.filter((row) => row.status === 'ended')).toHaveLength(1);
    }
    expect(await app.store.transaction(() => planRosterChanges(app.store, manifest))).toEqual([]);
    expect(await app.repositories.matchSheetPhotoSnapshots.list()).toEqual([]);
    expect(await app.repositories.photoApprovals.list()).toEqual([]);
  } finally { await app.store.close(); }
});

it('stops on unknown identities, submitted sheets or active snapshot history without modifying records', async () => {
  const app = await preparedApp();
  try {
    const first = manifest.subjects[0];
    await app.repositories.players.update(first.personId, { firstName: 'An unrelated person' });
    await expect(app.store.transaction(() => planRosterChanges(app.store, manifest))).rejects.toThrow('Unexpected person name');
    await app.repositories.players.update(first.personId, first.before);
    await app.repositories.matchSheets.update(plan.homeSheetId, { status: 'submitted' });
    await expect(app.store.transaction(() => planRosterChanges(app.store, manifest))).rejects.toThrow('Submitted/locked');
    await app.repositories.matchSheets.update(plan.homeSheetId, { status: 'draft' });
    await app.store.put('match_sheet_photo_snapshots', { id: 'snapshot', registrationId: first.registrationId, deletedAt: null });
    await expect(app.store.transaction(() => planRosterChanges(app.store, manifest))).rejects.toThrow('Active historical snapshots');
    expect(await app.repositories.players.findById(first.personId)).toMatchObject(first.before);
  } finally { await app.store.close(); }
});

it('does not retire staff currently selected in a draft and rolls back stale plans', async () => {
  const app = await preparedApp();
  try {
    await app.services.matchSheets.saveDraft(plan.homeSheetId, lineup('homeManager'));
    await expect(app.store.transaction(() => planRosterChanges(app.store, manifest))).rejects.toThrow('selected in a lineup');
    await app.repositories.matchSheetStaff.replaceByMatchSheet(plan.homeSheetId, []);
    const changes = await app.store.transaction(() => planRosterChanges(app.store, manifest));
    await app.repositories.clubs.update(manifest.clubs[0].id, { name: 'Changed after planning' });
    await expect(app.store.transaction(() => applyRosterChanges(app.store, changes))).rejects.toThrow('Roster changed');
    expect(await app.repositories.players.findById(manifest.subjects[0].personId)).toMatchObject(manifest.subjects[0].before);
  } finally { await app.store.close(); }
});
