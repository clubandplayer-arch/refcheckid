import type {
  FederationImportBatch,
  FederationImportRow,
  FederationImportRowStatus,
  FederationImportStatus,
  FederationImportType,
  UUID,
} from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';

export interface FederationImportBatchFilter {
  readonly federationId?: UUID;
  readonly status?: FederationImportStatus;
  readonly importType?: FederationImportType;
}

export interface FederationImportRowFilter {
  readonly status?: FederationImportRowStatus;
}

export class FederationImportBatchRepository extends DrizzleRepository<FederationImportBatch> {
  constructor(initialRows: readonly FederationImportBatch[] = []) {
    super({ tableName: 'federation_import_batches', initialRows });
  }

  async listByFilter(filter: FederationImportBatchFilter = {}): Promise<readonly FederationImportBatch[]> {
    return (await this.list()).filter((batch) => {
      if (filter.federationId !== undefined && batch.federationId !== filter.federationId) return false;
      if (filter.status !== undefined && batch.status !== filter.status) return false;
      if (filter.importType !== undefined && batch.importType !== filter.importType) return false;
      return true;
    });
  }
}

export class FederationImportRowRepository extends DrizzleRepository<FederationImportRow> {
  constructor(initialRows: readonly FederationImportRow[] = []) {
    super({ tableName: 'federation_import_rows', initialRows });
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
