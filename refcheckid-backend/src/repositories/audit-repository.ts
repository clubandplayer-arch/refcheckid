import type { AuditLog, UUID } from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';

export type AuditActor = Readonly<{
  actorFederationId?: UUID | null;
  actorClubId?: UUID | null;
  actorRefereeId?: UUID | null;
}>;

export type AuditEntity = Readonly<{
  federationId?: UUID | null;
  clubId?: UUID | null;
  playerId?: UUID | null;
  playerRegistrationId?: UUID | null;
  staffMemberId?: UUID | null;
  staffRegistrationId?: UUID | null;
  refereeId?: UUID | null;
  matchId?: UUID | null;
  matchSheetId?: UUID | null;
  matchSheetPlayerId?: UUID | null;
  matchSheetStaffId?: UUID | null;
  recognitionId?: UUID | null;
  matchReportId?: UUID | null;
  matchEventId?: UUID | null;
  photoId?: UUID | null;
  identityDocumentId?: UUID | null;
}>;

export type AuditAction = string;
export type AuditEventMetadata = Readonly<Record<string, unknown>>;

export interface CreateAuditLogInput extends AuditActor, AuditEntity {
  action: AuditAction;
  occurredAt: string;
  metadata: AuditEventMetadata;
}

export interface AuditRepositoryPort {
  createAuditLog(input: CreateAuditLogInput): Promise<AuditLog>;
  listByMatch(matchId: UUID): Promise<readonly AuditLog[]>;
  listByActor(actor: AuditActor): Promise<readonly AuditLog[]>;
  listByEntity(entity: AuditEntity): Promise<readonly AuditLog[]>;
  listByAction(action: AuditAction): Promise<readonly AuditLog[]>;
}

export class AuditRepository
  extends DrizzleRepository<AuditLog, CreateAuditLogInput>
  implements AuditRepositoryPort
{
  constructor(initialRows: readonly AuditLog[] = []) {
    super({ tableName: 'audit_logs', initialRows });
  }

  createAuditLog(input: CreateAuditLogInput): Promise<AuditLog> {
    return this.create({
      actorFederationId: input.actorFederationId ?? null,
      actorClubId: input.actorClubId ?? null,
      actorRefereeId: input.actorRefereeId ?? null,
      federationId: input.federationId ?? null,
      clubId: input.clubId ?? null,
      playerId: input.playerId ?? null,
      playerRegistrationId: input.playerRegistrationId ?? null,
      staffMemberId: input.staffMemberId ?? null,
      staffRegistrationId: input.staffRegistrationId ?? null,
      refereeId: input.refereeId ?? null,
      matchId: input.matchId ?? null,
      matchSheetId: input.matchSheetId ?? null,
      matchSheetPlayerId: input.matchSheetPlayerId ?? null,
      matchSheetStaffId: input.matchSheetStaffId ?? null,
      recognitionId: input.recognitionId ?? null,
      matchReportId: input.matchReportId ?? null,
      matchEventId: input.matchEventId ?? null,
      photoId: input.photoId ?? null,
      identityDocumentId: input.identityDocumentId ?? null,
      action: input.action,
      occurredAt: input.occurredAt,
      metadata: input.metadata,
    } as CreateAuditLogInput);
  }

  listByMatch(matchId: UUID): Promise<readonly AuditLog[]> {
    return Promise.resolve(this.values().filter((auditLog) => auditLog.matchId === matchId));
  }

  listByActor(actor: AuditActor): Promise<readonly AuditLog[]> {
    return Promise.resolve(
      this.values().filter(
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
      this.values().filter((auditLog) =>
        Object.entries(entity).some(
          ([field, value]) => value !== undefined && auditLog[field as keyof AuditLog] === value,
        ),
      ),
    );
  }

  listByAction(action: AuditAction): Promise<readonly AuditLog[]> {
    return Promise.resolve(this.values().filter((auditLog) => auditLog.action === action));
  }
}
