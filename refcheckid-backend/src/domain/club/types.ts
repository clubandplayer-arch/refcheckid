import type { BaseEntity, UUID } from '../shared/types.js';

export interface Club extends BaseEntity {
  federationId: UUID;
  name: string;
  fiscalCode: string | null;
  status: 'active' | 'inactive';
}
