import type { BaseEntity, ISODate, UUID } from '../shared/types.js';

export interface Player extends BaseEntity {
  federationId: UUID;
  firstName: string;
  lastName: string;
  birthDate: ISODate;
  birthPlace: string | null;
  fiscalCode: string | null;
  status: 'active' | 'inactive';
}
