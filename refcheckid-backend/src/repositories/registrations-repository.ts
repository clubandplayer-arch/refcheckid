import type { PlayerRegistration, StaffMember, StaffRegistration, UUID } from '../domain/index.js';
import { PersistentRuntimeRepository } from './runtime-state-repository.js';

export class RegistrationRepository extends PersistentRuntimeRepository<PlayerRegistration> {
  private readonly staffMembers: PersistentRuntimeRepository<StaffMember>;
  private readonly staffRegistrations: PersistentRuntimeRepository<StaffRegistration>;

  constructor(initialRows: readonly PlayerRegistration[] = [], persistenceRoot?: string | null) {
    super('player_registrations', 'player-registrations.json', initialRows, persistenceRoot);
    this.staffMembers = new PersistentRuntimeRepository(
      'staff_members',
      'staff-members.json',
      [],
      persistenceRoot,
    );
    this.staffRegistrations = new PersistentRuntimeRepository(
      'staff_registrations',
      'staff-registrations.json',
      [],
      persistenceRoot,
    );
  }

  listByClub(clubId: UUID): Promise<readonly PlayerRegistration[]> {
    return Promise.resolve(this.values().filter((registration) => registration.clubId === clubId));
  }

  findPlayerRegistrationById(registrationId: UUID): Promise<PlayerRegistration | null> {
    return this.findById(registrationId);
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

  findStaffMemberById(staffMemberId: UUID): Promise<StaffMember | null> {
    return this.staffMembers.findById(staffMemberId);
  }

  findStaffRegistrationById(registrationId: UUID): Promise<StaffRegistration | null> {
    return this.staffRegistrations.findById(registrationId);
  }

  listStaffRegistrationsByClub(clubId: UUID): Promise<readonly StaffRegistration[]> {
    return Promise.resolve(
      this.staffRegistrations.values().filter((registration) => registration.clubId === clubId),
    );
  }
}

export class RegistrationsRepository extends RegistrationRepository {}
