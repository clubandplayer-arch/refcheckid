import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createApplicationContainer } from '../src/config/application-container.js';
import { createRestApiRouter } from '../src/api/router.js';
import { dataset, lineup, lockedApp, login, plan, preparedApp } from './runtime-fixtures.js';

afterEach(() => vi.restoreAllMocks());

it('saves partial lineup drafts without submitting and rejects draft edits after locking', async () => {
  const app = await preparedApp();
  try {
    const input = lineup('homeManager');
    await app.services.matchSheets.saveDraft(plan.homeSheetId, { players: input.players.slice(0, 1), staff: [] });
    expect((await app.repositories.matchSheets.findById(plan.homeSheetId))?.status).toBe('draft');
    expect(await app.repositories.matchSheetPlayers.listByMatchSheet(plan.homeSheetId)).toHaveLength(1);
    expect(await app.repositories.matchSheetPhotoSnapshots.listByMatchSheet(plan.homeSheetId)).toEqual([]);
    await expect(app.services.matchSheets.lockMatchSheet(plan.homeSheetId)).rejects.toThrow('Invalid');
    await app.services.matchSheets.submitMatchSheet(plan.homeSheetId, input);
    await app.services.matchSheets.lockMatchSheet(plan.homeSheetId);
    await expect(app.services.matchSheets.saveDraft(plan.homeSheetId, { players: [] })).rejects.toThrow('locked');
  } finally { await app.store.close(); }
});

it('imports legacy photo metadata only once and never uses stale JSON over the database', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'refcheckid-import-'));
  const path = join(directory, 'state.sqlite');
  const metadata = join(directory, 'photo-subjects.json');
  vi.stubEnv('REFCHECKID_PHOTO_METADATA_ROOT', directory);
  writeFileSync(metadata, JSON.stringify([{ id: '90000000-0000-4000-8000-000000000199', createdAt: new Date().toISOString(), deletedAt: null, subjectKind: 'athlete', canonicalPersonId: 'person', dedupeKeyHash: 'person' }]));
  const app = createApplicationContainer({ databasePath: path });
  await app.store.close();
  writeFileSync(metadata, 'invalid legacy JSON that must not be reread');
  try {
    const restored = createApplicationContainer({ databasePath: path });
    expect(await restored.repositories.photoSubjects.values()).toHaveLength(1);
    await restored.store.close();
  } finally { vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); }
});

it('rolls back the entire lock, including partially created snapshots, on storage failure', async () => {
  const app = await preparedApp();
  try {
    await app.services.matchSheets.submitMatchSheet(plan.homeSheetId, lineup('homeManager'));
    const create = app.repositories.matchSheetPhotoSnapshots.create.bind(app.repositories.matchSheetPhotoSnapshots);
    let writes = 0;
    vi.spyOn(app.repositories.matchSheetPhotoSnapshots, 'create').mockImplementation((input) => {
      if (++writes === 3) throw new Error('Simulated storage failure');
      return create(input);
    });
    await expect(app.services.matchSheets.lockMatchSheet(plan.homeSheetId)).rejects.toThrow('Simulated storage failure');
    expect((await app.repositories.matchSheets.findById(plan.homeSheetId))?.status).toBe('submitted');
    expect(await app.repositories.matchSheetPhotoSnapshots.listByMatchSheet(plan.homeSheetId)).toEqual([]);
    expect(await app.repositories.photoAuditEvents.list()).toEqual([]);
    vi.restoreAllMocks();
    await app.services.matchSheets.lockMatchSheet(plan.homeSheetId);
    expect(await app.repositories.matchSheetPhotoSnapshots.listByMatchSheet(plan.homeSheetId)).toHaveLength(22);
  } finally { await app.store.close(); }
});

it('rejects empty, duplicate, inactive and opposing-club lineup entries without changing the draft', async () => {
  const app = await preparedApp();
  try {
    await expect(app.services.matchSheets.submitMatchSheet(plan.homeSheetId, {})).rejects.toThrow('contain players');
    await expect(app.services.matchSheets.submitMatchSheet(plan.homeSheetId, lineup('awayManager'))).rejects.toThrow('not eligible');
    const input = lineup('homeManager');
    input.players.push(input.players[0]);
    await expect(app.services.matchSheets.submitMatchSheet(plan.homeSheetId, input)).rejects.toThrow('Duplicate');
    const clean = lineup('homeManager');
    await app.repositories.registrations.update(clean.players[0].playerRegistrationId, { status: 'suspended' });
    await expect(app.services.matchSheets.submitMatchSheet(plan.homeSheetId, clean)).rejects.toThrow('not eligible');
    expect((await app.repositories.matchSheets.findById(plan.homeSheetId))?.status).toBe('draft');
    expect(await app.repositories.matchSheetPlayers.listByMatchSheet(plan.homeSheetId)).toEqual([]);
  } finally { await app.store.close(); }
});

it('rejects recognition with only one locked sheet, and snapshots from another match', async () => {
  const app = await preparedApp();
  try {
    await app.services.matchSheets.submitMatchSheet(plan.homeSheetId, lineup('homeManager'));
    await app.services.matchSheets.lockMatchSheet(plan.homeSheetId);
    await expect(app.services.recognitions.startRecognition(plan.matchId)).rejects.toThrow('every match sheet');
    await app.services.matchSheets.submitMatchSheet(plan.awaySheetId, lineup('awayManager'));
    await app.services.matchSheets.lockMatchSheet(plan.awaySheetId);
    const snapshot = (await app.repositories.matchSheetPhotoSnapshots.listByMatchSheet(plan.awaySheetId))[0];
    await app.repositories.matchSheetPhotoSnapshots.update(snapshot.id, { matchId: '70000000-0000-4000-8000-000000000099' });
    await expect(app.services.recognitions.startRecognition(plan.matchId)).rejects.toThrow('frozen photo');
    expect((await app.repositories.recognitions.getWorkflowByMatch(plan.matchId)).status).toBe('not_started');
  } finally { await app.store.close(); }
});

it('requires explicit notes for missing photos and a decision for every participant', async () => {
  const app = await lockedApp();
  try {
    await app.services.recognitions.startRecognition(plan.matchId);
    const person = dataset.photoPlan[0];
    await expect(app.services.recognitions.recordDecision(plan.matchId, person.registrationId, 'recognized', null, 'referee')).rejects.toThrow('reason');
    await app.services.recognitions.recordDecision(plan.matchId, person.registrationId, 'rejected', 'Not present', 'referee');
    await expect(app.services.recognitions.completeRecognition(plan.matchId)).rejects.toThrow('Every participant');
    await app.services.recognitions.recordDecision(plan.matchId, person.registrationId, 'pending', null, 'referee');
    expect(await app.repositories.recognitions.listByMatch(plan.matchId)).toEqual([]);
  } finally { await app.store.close(); }
});

it('restores lineups, snapshots, decisions, workflow and reports from a reopened database', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'refcheckid-persistence-'));
  const path = join(directory, 'state.sqlite');
  const app = await lockedApp(path);
  const snapshotIds = (await app.repositories.matchSheetPhotoSnapshots.list()).map((row) => row.id);
  await app.services.recognitions.startRecognition(plan.matchId);
  for (const person of dataset.photoPlan) await app.services.recognitions.recordDecision(plan.matchId, person.registrationId, 'recognized', 'Document checked', 'referee');
  await app.services.recognitions.completeRecognition(plan.matchId);
  await app.services.matches.transitionMatchStatus(plan.matchId, 'in_progress');
  await app.services.matches.transitionMatchStatus(plan.matchId, 'completed');
  const report = await app.services.matchReports.createMatchReport({ matchId: plan.matchId, refereeId: dataset.workflowPlan.refereeId, summary: 'Persisted report' });
  await app.store.close();
  const restored = createApplicationContainer({ databasePath: path });
  try {
    expect(await restored.repositories.matchSheetPlayers.listByMatchSheet(plan.homeSheetId)).toHaveLength(18);
    expect((await restored.repositories.matchSheetPhotoSnapshots.list()).map((row) => row.id)).toEqual(snapshotIds);
    expect(await restored.repositories.recognitions.listByMatch(plan.matchId)).toHaveLength(44);
    expect((await restored.repositories.recognitions.getWorkflowByMatch(plan.matchId)).status).toBe('locked');
    expect(await restored.repositories.matchReports.findById(report.id)).toMatchObject({ summary: 'Persisted report' });
    await restored.services.matchSheets.resetSmokeMatchSheet(plan.homeSheetId);
    expect(await restored.repositories.matchReports.findById(report.id)).toBeNull();
    expect(await restored.repositories.matchSheetPhotoSnapshots.listByMatchSheet(plan.homeSheetId)).toEqual([]);
    expect(await restored.repositories.recognitions.listByMatch(plan.matchId)).toEqual([]);
    expect((await restored.repositories.matches.findById(plan.matchId))?.status).toBe('scheduled');
    expect(await restored.repositories.registrations.list()).toHaveLength(36);
  } finally { await restored.store.close(); rmSync(directory, { recursive: true, force: true }); }
});

it('revokes both session tokens on logout and rejects malformed tokens', async () => {
  const app = await preparedApp();
  const router = createRestApiRouter(app);
  const headers = await login(router, 'homeManager');
  try {
    expect((await router.handle({ method: 'POST', path: '/api/v1/auth/logout', headers, query: {} })).status).toBe(204);
    expect((await router.handle({ method: 'GET', path: '/api/v1/auth/me', headers, query: {} })).status).toBe(401);
    expect((await router.handle({ method: 'GET', path: '/api/v1/auth/me', headers: { authorization: 'Bearer invalid.signature' }, query: {} })).status).toBe(401);
  } finally { await app.store.close(); }
});
