import type { AuditLog, UUID } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

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
  extends NotImplementedRepository<AuditLog, CreateAuditLogInput>
  implements AuditRepositoryPort
{
  constructor() {
    super('AuditRepository');
  }

  createAuditLog(): Promise<AuditLog> {
    return Promise.reject(new Error('AuditRepository.createAuditLog is not implemented yet.'));
  }

  listByMatch(): Promise<readonly AuditLog[]> {
    return Promise.reject(new Error('AuditRepository.listByMatch is not implemented yet.'));
  }

  listByActor(): Promise<readonly AuditLog[]> {
    return Promise.reject(new Error('AuditRepository.listByActor is not implemented yet.'));
  }

  listByEntity(): Promise<readonly AuditLog[]> {
    return Promise.reject(new Error('AuditRepository.listByEntity is not implemented yet.'));
  }

  listByAction(): Promise<readonly AuditLog[]> {
    return Promise.reject(new Error('AuditRepository.listByAction is not implemented yet.'));
  }
}
