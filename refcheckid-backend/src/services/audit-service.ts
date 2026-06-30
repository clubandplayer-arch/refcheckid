import type { AuditLog, ISODateTime, UUID } from '../domain/index.js';
import type { ApplicationEvent, EventPublisher } from '../events/index.js';
import type {
  AuditAction,
  AuditActor,
  AuditEntity,
  AuditEventMetadata,
  AuditRepositoryPort,
} from '../repositories/index.js';

const actorFields = ['actorFederationId', 'actorClubId', 'actorRefereeId'] as const;
const entityFields = [
  'federationId',
  'clubId',
  'playerId',
  'playerRegistrationId',
  'staffMemberId',
  'staffRegistrationId',
  'refereeId',
  'matchId',
  'matchSheetId',
  'matchSheetPlayerId',
  'matchSheetStaffId',
  'recognitionId',
  'matchReportId',
  'matchEventId',
  'photoId',
  'identityDocumentId',
] as const;

export interface AuditEventInput {
  readonly action: AuditAction;
  readonly actor: AuditActor;
  readonly entity: AuditEntity;
  readonly occurredAt?: ISODateTime;
  readonly metadata?: AuditEventMetadata;
}

export class MissingAuditActionError extends Error {
  constructor() {
    super('Audit event action is required.');
    this.name = 'MissingAuditActionError';
  }
}

export class MissingAuditActorError extends Error {
  constructor() {
    super('Audit event actor is required.');
    this.name = 'MissingAuditActorError';
  }
}

export class MissingAuditEntityError extends Error {
  constructor() {
    super('Audit event entity reference is required.');
    this.name = 'MissingAuditEntityError';
  }
}

export class UnsupportedAuditApplicationEventError extends Error {
  constructor(eventType: string) {
    super(`Application event ${eventType} cannot be converted to an audit event.`);
    this.name = 'UnsupportedAuditApplicationEventError';
  }
}

export interface AuditServiceDependencies {
  readonly eventPublisher?: EventPublisher;
  readonly auditRepository: AuditRepositoryPort;
}

export class AuditService {
  constructor(private readonly dependencies: AuditServiceDependencies) {}

  recordAuditEvent(input: AuditEventInput): Promise<AuditLog> {
    this.assertValidAuditEventInput(input);

    return this.dependencies.auditRepository.createAuditLog({
      ...this.normalizeActor(input.actor),
      ...this.normalizeEntity(input.entity),
      action: input.action,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      metadata: input.metadata ?? {},
    });
  }

  listAuditByMatch(matchId: UUID): Promise<readonly AuditLog[]> {
    return this.dependencies.auditRepository.listByMatch(matchId);
  }

  listAuditByActor(actor: AuditActor): Promise<readonly AuditLog[]> {
    if (!this.hasReference(actor, actorFields)) {
      throw new MissingAuditActorError();
    }

    return this.dependencies.auditRepository.listByActor(actor);
  }

  listAuditByEntity(entity: AuditEntity): Promise<readonly AuditLog[]> {
    if (!this.hasReference(entity, entityFields)) {
      throw new MissingAuditEntityError();
    }

    return this.dependencies.auditRepository.listByEntity(entity);
  }

  listAuditByAction(action: AuditAction): Promise<readonly AuditLog[]> {
    if (action.trim().length === 0) {
      throw new MissingAuditActionError();
    }

    return this.dependencies.auditRepository.listByAction(action);
  }

  recordApplicationEvent(event: ApplicationEvent<Record<string, unknown>>): Promise<AuditLog> {
    return this.recordAuditEvent(this.mapApplicationEventToAuditEvent(event));
  }

  private mapApplicationEventToAuditEvent(
    event: ApplicationEvent<Record<string, unknown>>,
  ): AuditEventInput {
    const actor = this.readPayloadObject(event.payload, 'actor') as AuditActor;
    const entity = this.resolveApplicationEventEntity(event);
    const metadata = this.readPayloadObject(event.payload, 'metadata');

    return {
      action: event.type,
      actor,
      entity,
      occurredAt: event.occurredAt,
      metadata: {
        applicationEventId: event.id,
        applicationEventType: event.type,
        ...metadata,
      },
    };
  }

  private resolveApplicationEventEntity(
    event: ApplicationEvent<Record<string, unknown>>,
  ): AuditEntity {
    switch (event.type) {
      case 'MATCH_CREATED':
      case 'MATCH_ARCHIVED':
        return { matchId: this.readPayloadUuid(event.payload, 'matchId') };
      case 'MATCH_SHEET_CREATED':
      case 'MATCH_SHEET_SUBMITTED':
      case 'MATCH_SHEET_LOCKED':
        return {
          matchId: this.readPayloadUuid(event.payload, 'matchId'),
          matchSheetId: this.readPayloadUuid(event.payload, 'matchSheetId'),
        };
      case 'RECOGNITION_STARTED':
      case 'RECOGNITION_COMPLETED':
        return {
          matchId: this.readPayloadUuid(event.payload, 'matchId'),
          recognitionId: this.readPayloadUuid(event.payload, 'recognitionId'),
        };
      case 'MATCH_REPORT_CREATED':
      case 'MATCH_REPORT_SUBMITTED':
        return {
          matchId: this.readPayloadUuid(event.payload, 'matchId'),
          matchReportId: this.readPayloadUuid(event.payload, 'matchReportId'),
        };
      default:
        throw new UnsupportedAuditApplicationEventError(event.type);
    }
  }

  private assertValidAuditEventInput(input: AuditEventInput): void {
    if (input.action.trim().length === 0) {
      throw new MissingAuditActionError();
    }

    if (!this.hasReference(input.actor, actorFields)) {
      throw new MissingAuditActorError();
    }

    if (!this.hasReference(input.entity, entityFields)) {
      throw new MissingAuditEntityError();
    }
  }

  private normalizeActor(actor: AuditActor): Required<AuditActor> {
    return {
      actorFederationId: actor.actorFederationId ?? null,
      actorClubId: actor.actorClubId ?? null,
      actorRefereeId: actor.actorRefereeId ?? null,
    };
  }

  private normalizeEntity(entity: AuditEntity): Required<AuditEntity> {
    return {
      federationId: entity.federationId ?? null,
      clubId: entity.clubId ?? null,
      playerId: entity.playerId ?? null,
      playerRegistrationId: entity.playerRegistrationId ?? null,
      staffMemberId: entity.staffMemberId ?? null,
      staffRegistrationId: entity.staffRegistrationId ?? null,
      refereeId: entity.refereeId ?? null,
      matchId: entity.matchId ?? null,
      matchSheetId: entity.matchSheetId ?? null,
      matchSheetPlayerId: entity.matchSheetPlayerId ?? null,
      matchSheetStaffId: entity.matchSheetStaffId ?? null,
      recognitionId: entity.recognitionId ?? null,
      matchReportId: entity.matchReportId ?? null,
      matchEventId: entity.matchEventId ?? null,
      photoId: entity.photoId ?? null,
      identityDocumentId: entity.identityDocumentId ?? null,
    };
  }

  private hasReference<TReference extends Record<string, UUID | null | undefined>>(
    reference: TReference,
    fields: readonly (keyof TReference)[],
  ): boolean {
    return fields.some((field) => reference[field] !== undefined && reference[field] !== null);
  }

  private readPayloadObject(
    payload: Record<string, unknown>,
    key: string,
  ): Record<string, unknown> {
    const value = payload[key];

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }

    return {};
  }

  private readPayloadUuid(payload: Record<string, unknown>, key: string): UUID | null {
    const value = payload[key];

    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  protected get eventPublisher(): EventPublisher | undefined {
    return this.dependencies.eventPublisher;
  }
}

export class AuditEventPublisher implements EventPublisher {
  constructor(
    private readonly auditService: AuditService,
    private readonly downstreamPublisher?: EventPublisher,
  ) {}

  async publish(event: ApplicationEvent<Record<string, unknown>>): Promise<void> {
    await this.auditService.recordApplicationEvent(event);
    await this.downstreamPublisher?.publish(event);
  }
}
