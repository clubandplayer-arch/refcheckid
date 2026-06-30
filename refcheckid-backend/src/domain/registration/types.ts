import type { BaseEntity, ISODateTime, UUID } from '../shared/types.js';

export type RegistrationStatus = 'active' | 'suspended' | 'ended';

export interface PlayerRegistration extends BaseEntity {
  playerId: UUID;
  clubId: UUID;
  season: string;
  registrationNumber: string;
  status: RegistrationStatus;
  registeredAt: ISODateTime;
}

export interface StaffMember extends BaseEntity {
  federationId: UUID;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  fiscalCode: string | null;
  status: 'active' | 'inactive';
}

export interface StaffRegistration extends BaseEntity {
  staffMemberId: UUID;
  clubId: UUID;
  season: string;
  role: string;
  registrationNumber: string;
  status: RegistrationStatus;
}
