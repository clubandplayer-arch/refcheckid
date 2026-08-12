import type {
  FederationImportBatch,
  FederationImportRow,
  FederationImportRowStatus,
  FederationImportStatus,
  FederationImportType,
  UUID,
} from '../domain/index.js';
import { PersistentRuntimeRepository } from './runtime-state-repository.js';

export interface FederationImportBatchFilter {
  readonly federationId?: UUID;
  readonly status?: FederationImportStatus;
  readonly importType?: FederationImportType;
}

export interface FederationImportRowFilter {
  readonly status?: FederationImportRowStatus;
}

export class FederationImportBatchRepository extends PersistentRuntimeRepository<FederationImportBatch> {
  constructor(initialRows: readonly FederationImportBatch[] = [], persistenceRoot?: string | null) {
    super(
      'federation_import_batches',
      'federation-import-batches.json',
      initialRows,
      persistenceRoot,
    );
  }

  async listByFilter(
    filter: FederationImportBatchFilter = {},
  ): Promise<readonly FederationImportBatch[]> {
    return (await this.list()).filter((batch) => {
      if (filter.federationId !== undefined && batch.federationId !== filter.federationId)
        return false;
      if (filter.status !== undefined && batch.status !== filter.status) return false;
      if (filter.importType !== undefined && batch.importType !== filter.importType) return false;
      return true;
    });
  }
}

export class FederationImportRowRepository extends PersistentRuntimeRepository<FederationImportRow> {
  constructor(initialRows: readonly FederationImportRow[] = [], persistenceRoot?: string | null) {
    super('federation_import_rows', 'federation-import-rows.json', initialRows, persistenceRoot);
  }

  async listByBatch(
    batchId: UUID,
    filter: FederationImportRowFilter = {},
  ): Promise<readonly FederationImportRow[]> {
    return (await this.list()).filter((row) => {
      if (row.batchId !== batchId) return false;
      if (filter.status !== undefined && row.status !== filter.status) return false;
      return true;
    });
  }
}
