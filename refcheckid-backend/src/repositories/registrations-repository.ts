import type { PlayerRegistration, StaffMember, StaffRegistration, UUID } from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';

export class RegistrationRepository extends DrizzleRepository<PlayerRegistration> {
  private readonly staffMembers = new DrizzleRepository<StaffMember>({
    tableName: 'staff_members',
  });
  private readonly staffRegistrations = new DrizzleRepository<StaffRegistration>({
    tableName: 'staff_registrations',
  });

  constructor(initialRows: readonly PlayerRegistration[] = []) {
    super({ tableName: 'player_registrations', initialRows });
  }

  listByClub(clubId: UUID): Promise<readonly PlayerRegistration[]> {
    return Promise.resolve(this.values().filter((registration) => registration.clubId === clubId));
  }

  syncStaffMember(staffMember: StaffMember): Promise<StaffMember> {
    return this.staffMembers.upsert(staffMember);
  }

  syncStaffRegistration(staffRegistration: StaffRegistration): Promise<StaffRegistration> {
    return this.staffRegistrations.upsert(staffRegistration);
  }

  listStaffMembers(): Promise<readonly StaffMember[]> {
    return this.staffMembers.list();
  }

  listStaffRegistrationsByClub(clubId: UUID): Promise<readonly StaffRegistration[]> {
    return Promise.resolve(
      this.staffRegistrations.values().filter((registration) => registration.clubId === clubId),
    );
  }
}

export class RegistrationsRepository extends RegistrationRepository {}
