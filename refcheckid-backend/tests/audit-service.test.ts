import { describe, expect, it } from 'vitest';
import type { AuditLog, UUID } from '../src/domain/index.js';
import type { ApplicationEvent } from '../src/events/index.js';
import type {
  AuditAction,
  AuditActor,
  AuditEntity,
  AuditRepositoryPort,
  CreateAuditLogInput,
} from '../src/repositories/index.js';
import {
  AuditEventPublisher,
  AuditService,
  MissingAuditActionError,
  MissingAuditActorError,
  MissingAuditEntityError,
} from '../src/services/index.js';

const auditLogId = '40000000-0000-0000-0000-000000000001';
const matchId = '40000000-0000-0000-0000-000000000002';
const actorRefereeId = '40000000-0000-0000-0000-000000000003';
const matchSheetId = '40000000-0000-0000-0000-000000000004';
const eventId = '40000000-0000-0000-0000-000000000005';

function buildAuditLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: auditLogId,
    actorFederationId: null,
    actorClubId: null,
    actorRefereeId,
    federationId: null,
    clubId: null,
    playerId: null,
    playerRegistrationId: null,
    staffMemberId: null,
    staffRegistrationId: null,
    refereeId: null,
    matchId,
    matchSheetId: null,
    matchSheetPlayerId: null,
    matchSheetStaffId: null,
    recognitionId: null,
    matchReportId: null,
    matchEventId: null,
    photoId: null,
    identityDocumentId: null,
    action: 'MATCH_CREATED',
    occurredAt: '2026-06-30T12:00:00.000Z',
    metadata: {},
    createdAt: '2026-06-30T12:00:00.000Z',
    ...overrides,
  };
}

class FakeAuditRepository implements AuditRepositoryPort {
  readonly auditLogs: AuditLog[] = [];
  readonly createInputs: CreateAuditLogInput[] = [];

  constructor(initialAuditLogs: readonly AuditLog[] = []) {
    this.auditLogs.push(...initialAuditLogs);
  }

  createAuditLog(input: CreateAuditLogInput): Promise<AuditLog> {
    this.createInputs.push(input);

    const auditLog = buildAuditLog({
      ...input,
      id: `40000000-0000-0000-0000-${String(this.auditLogs.length + 1).padStart(12, '0')}`,
      createdAt: input.occurredAt,
    });
    this.auditLogs.push(auditLog);

    return Promise.resolve(auditLog);
  }

  listByMatch(targetMatchId: UUID): Promise<readonly AuditLog[]> {
    return Promise.resolve(this.auditLogs.filter((auditLog) => auditLog.matchId === targetMatchId));
  }

  listByActor(actor: AuditActor): Promise<readonly AuditLog[]> {
    return Promise.resolve(
      this.auditLogs.filter(
        (auditLog) =>
          (actor.actorFederationId !== undefined &&
            auditLog.actorFederationId === actor.actorFederationId) ||
          (actor.actorClubId !== undefined && auditLog.actorClubId === actor.actorClubId) ||
          (actor.actorRefereeId !== undefined && auditLog.actorRefereeId === actor.actorRefereeId),
      ),
    );
  }

  listByEntity(entity: AuditEntity): Promise<readonly AuditLog[]> {
    return Promise.resolve(
      this.auditLogs.filter(
        (auditLog) =>
          (entity.matchId !== undefined && auditLog.matchId === entity.matchId) ||
          (entity.matchSheetId !== undefined && auditLog.matchSheetId === entity.matchSheetId) ||
          (entity.matchReportId !== undefined && auditLog.matchReportId === entity.matchReportId),
      ),
    );
  }

  listByAction(action: AuditAction): Promise<readonly AuditLog[]> {
    return Promise.resolve(this.auditLogs.filter((auditLog) => auditLog.action === action));
  }
}

describe('AuditService', () => {
  it('records a valid audit event', async () => {
    const repository = new FakeAuditRepository();
    const service = new AuditService({ auditRepository: repository });

    await expect(
      service.recordAuditEvent({
        action: 'MATCH_CREATED',
        actor: { actorRefereeId },
        entity: { matchId },
        occurredAt: '2026-06-30T12:00:00.000Z',
        metadata: { source: 'unit-test' },
      }),
    ).resolves.toMatchObject({ action: 'MATCH_CREATED', actorRefereeId, matchId });
    expect(repository.createInputs).toEqual([
      expect.objectContaining({
        action: 'MATCH_CREATED',
        actorRefereeId,
        matchId,
        metadata: { source: 'unit-test' },
      }),
    ]);
  });

  it('rejects audit events without an actor', async () => {
    const service = new AuditService({ auditRepository: new FakeAuditRepository() });

    await expect(async () =>
      service.recordAuditEvent({ action: 'MATCH_CREATED', actor: {}, entity: { matchId } }),
    ).rejects.toBeInstanceOf(MissingAuditActorError);
  });

  it('rejects audit events without an action', async () => {
    const service = new AuditService({ auditRepository: new FakeAuditRepository() });

    await expect(async () =>
      service.recordAuditEvent({ action: '', actor: { actorRefereeId }, entity: { matchId } }),
    ).rejects.toBeInstanceOf(MissingAuditActionError);
  });

  it('rejects audit events without an entity', async () => {
    const service = new AuditService({ auditRepository: new FakeAuditRepository() });

    await expect(async () =>
      service.recordAuditEvent({ action: 'MATCH_CREATED', actor: { actorRefereeId }, entity: {} }),
    ).rejects.toBeInstanceOf(MissingAuditEntityError);
  });

  it('lists audit logs by match', async () => {
    const auditLog = buildAuditLog({ action: 'MATCH_CREATED', matchId });
    const service = new AuditService({ auditRepository: new FakeAuditRepository([auditLog]) });

    await expect(service.listAuditByMatch(matchId)).resolves.toEqual([auditLog]);
  });

  it('lists audit logs by actor', async () => {
    const auditLog = buildAuditLog({ actorRefereeId });
    const service = new AuditService({ auditRepository: new FakeAuditRepository([auditLog]) });

    await expect(service.listAuditByActor({ actorRefereeId })).resolves.toEqual([auditLog]);
  });

  it('lists audit logs by entity', async () => {
    const auditLog = buildAuditLog({ matchSheetId });
    const service = new AuditService({ auditRepository: new FakeAuditRepository([auditLog]) });

    await expect(service.listAuditByEntity({ matchSheetId })).resolves.toEqual([auditLog]);
  });

  it('lists audit logs by action', async () => {
    const auditLog = buildAuditLog({ action: 'MATCH_SHEET_LOCKED' });
    const service = new AuditService({ auditRepository: new FakeAuditRepository([auditLog]) });

    await expect(service.listAuditByAction('MATCH_SHEET_LOCKED')).resolves.toEqual([auditLog]);
  });

  it('records audit logs from application events through the event publisher bridge', async () => {
    const repository = new FakeAuditRepository();
    const service = new AuditService({ auditRepository: repository });
    const publisher = new AuditEventPublisher(service);
    const event: ApplicationEvent<Record<string, unknown>> = {
      id: eventId,
      type: 'MATCH_SHEET_LOCKED',
      occurredAt: '2026-06-30T12:00:00.000Z',
      payload: {
        actor: { actorRefereeId },
        matchId,
        matchSheetId,
        metadata: { source: 'event-engine' },
      },
    };

    await publisher.publish(event);

    expect(repository.createInputs).toEqual([
      expect.objectContaining({
        action: 'MATCH_SHEET_LOCKED',
        actorRefereeId,
        matchId,
        matchSheetId,
        metadata: {
          applicationEventId: eventId,
          applicationEventType: 'MATCH_SHEET_LOCKED',
          source: 'event-engine',
        },
      }),
    ]);
  });
});
