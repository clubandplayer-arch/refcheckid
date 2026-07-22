import type { BaseEntity, ISODateTime, UUID } from './shared/types.js';

export type FederationImportType =
  | 'clubs'
  | 'players_general'
  | 'players_by_club'
  | 'staff'
  | 'referees'
  | 'calendar'
  | 'designations';

export type FederationImportStatus =
  | 'uploaded'
  | 'parsed'
  | 'mapped'
  | 'validated'
  | 'ready_to_commit'
  | 'committed'
  | 'failed';

export type FederationImportRowStatus = 'pending' | 'valid' | 'warning' | 'error' | 'committed';

export interface FederationImportBatch extends BaseEntity {
  readonly federationId: UUID;
  readonly importType: FederationImportType;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly sha256: string;
  readonly uploadedByUserId: UUID;
  readonly uploadedAt: ISODateTime;
  readonly status: FederationImportStatus;
  readonly sourceSystem: string | null;
  readonly declaredType: FederationImportType | null;
  readonly detectedType: FederationImportType | null;
  readonly totalRows: number;
  readonly validRows: number;
  readonly warningRows: number;
  readonly errorRows: number;
  readonly committedRows: number;
  readonly mappingConfig: Record<string, unknown> | null;
  readonly report: Record<string, unknown> | null;
}

export interface FederationImportRow extends BaseEntity {
  readonly batchId: UUID;
  readonly rowNumber: number;
  readonly rawData: Record<string, unknown>;
  readonly normalizedData: Record<string, unknown> | null;
  readonly status: FederationImportRowStatus;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly targetEntityType: string | null;
  readonly targetEntityId: UUID | null;
}
