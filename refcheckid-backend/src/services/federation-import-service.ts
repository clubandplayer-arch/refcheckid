import type {
  FederationImportBatch,
  FederationImportRow,
  FederationImportStatus,
  FederationImportType,
  ISODateTime,
  UUID,
} from '../domain/index.js';
import type {
  FederationImportBatchFilter,
  FederationImportBatchRepository,
  FederationImportRowRepository,
} from '../repositories/index.js';

export class FederationImportAuthorizationError extends Error {
  constructor(message = 'Federation import requires federation or admin scope.') {
    super(message);
    this.name = 'FederationImportAuthorizationError';
  }
}

export class FederationImportInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FederationImportInvariantError';
  }
}

export interface FederationImportActorContext {
  readonly actorId: UUID;
  readonly roles: readonly string[];
  readonly federationIds?: readonly UUID[];
}

export interface FederationImportServiceDependencies {
  readonly importBatches: FederationImportBatchRepository;
  readonly importRows: FederationImportRowRepository;
  readonly now?: () => ISODateTime;
}

export interface CreateFederationImportBatchCommand {
  readonly federationId: UUID;
  readonly importType: FederationImportType;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly sha256: string;
  readonly sourceSystem?: string | null;
  readonly context: FederationImportActorContext;
}

export class FederationImportService {
  private readonly now: () => ISODateTime;

  constructor(private readonly dependencies: FederationImportServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async createBatch(command: CreateFederationImportBatchCommand): Promise<FederationImportBatch> {
    this.assertCanAccessFederation(command.context, command.federationId);
    if (!Number.isFinite(command.fileSizeBytes) || command.fileSizeBytes < 0) {
      throw new FederationImportInvariantError('fileSizeBytes must be a finite number greater than or equal to zero.');
    }
    const uploadedAt = this.now();
    return this.dependencies.importBatches.create({
      federationId: command.federationId,
      importType: command.importType,
      originalFilename: command.originalFilename,
      mimeType: command.mimeType,
      fileSizeBytes: command.fileSizeBytes,
      sha256: command.sha256,
      uploadedByUserId: command.context.actorId,
      uploadedAt,
      status: 'uploaded',
      sourceSystem: command.sourceSystem ?? null,
      declaredType: command.importType,
      detectedType: null,
      totalRows: 0,
      validRows: 0,
      warningRows: 0,
      errorRows: 0,
      committedRows: 0,
      mappingConfig: null,
      report: null,
    });
  }

  async listBatches(
    context: FederationImportActorContext,
    filter: FederationImportBatchFilter = {},
  ): Promise<readonly FederationImportBatch[]> {
    const scopedFilter = this.scopedFilter(context, filter);
    return this.dependencies.importBatches.listByFilter(scopedFilter);
  }

  async getBatch(context: FederationImportActorContext, batchId: UUID): Promise<FederationImportBatch | null> {
    const batch = await this.dependencies.importBatches.findById(batchId);
    if (batch === null) return null;
    this.assertCanAccessFederation(context, batch.federationId);
    return batch;
  }

  async listRows(
    context: FederationImportActorContext,
    batchId: UUID,
    filter: { readonly status?: FederationImportRow['status'] } = {},
  ): Promise<readonly FederationImportRow[]> {
    const batch = await this.getBatch(context, batchId);
    if (batch === null) return [];
    return this.dependencies.importRows.listByBatch(batch.id, filter);
  }

  async transitionBatchStatus(
    context: FederationImportActorContext,
    batchId: UUID,
    status: FederationImportStatus,
  ): Promise<FederationImportBatch> {
    const batch = await this.getBatch(context, batchId);
    if (batch === null) throw new FederationImportInvariantError('Import batch was not found.');
    return this.dependencies.importBatches.update(batch.id, { status });
  }

  private scopedFilter(
    context: FederationImportActorContext,
    filter: FederationImportBatchFilter,
  ): FederationImportBatchFilter {
    if (context.roles.includes('admin')) return filter;
    const federationId = filter.federationId ?? context.federationIds?.[0];
    if (federationId === undefined) throw new FederationImportAuthorizationError();
    this.assertCanAccessFederation(context, federationId);
    return { ...filter, federationId };
  }

  private assertCanAccessFederation(context: FederationImportActorContext, federationId: UUID): void {
    if (context.roles.includes('admin')) return;
    if (context.roles.includes('federation') && context.federationIds?.includes(federationId)) return;
    throw new FederationImportAuthorizationError();
  }
}
