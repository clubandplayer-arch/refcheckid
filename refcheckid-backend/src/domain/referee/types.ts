import type { BaseEntity, UUID } from '../shared/types.js';

export interface Referee extends BaseEntity {
  federationId: UUID;
  firstName: string;
  lastName: string;
  fiscalCode: string | null;
  status: 'active' | 'inactive';
}
