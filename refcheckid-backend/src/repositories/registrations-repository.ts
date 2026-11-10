import type { PlayerRegistration, StaffMember, StaffRegistration, UUID } from '../domain/index.js';
import { DrizzleRepository } from './base-repository.js';
import type { RuntimePersistence } from './runtime-persistence.js';

export class RegistrationRepository extends DrizzleRepository<PlayerRegistration> {
  override bindStore(store: RuntimePersistence): void {
    super.bindStore(store);
    this.staffMembers.bindStore(store);
    this.staffRegistrations.bindStore(store);
  }
  private readonly staffMembers = new DrizzleRepository<StaffMember>({
    tableName: 'staff_members',
  });
  private readonly staffRegistrations = new DrizzleRepository<StaffRegistration>({
    tableName: 'staff_registrations',
  });

  constructor(initialRows: readonly PlayerRegistration[] = []) {
    super({ tableName: 'player_registrations', initialRows });
  }

  async listByClub(clubId: UUID): Promise<readonly PlayerRegistration[]> {
    return Promise.resolve((await this.values()).filter((registration) => registration.clubId === clubId));
  }

  async findPlayerRegistrationById(registrationId: UUID): Promise<PlayerRegistration | null> {
    return this.findById(registrationId);
  }

  async syncStaffMember(staffMember: StaffMember): Promise<StaffMember> {
    return this.staffMembers.upsert(staffMember);
  }

  async syncStaffRegistration(staffRegistration: StaffRegistration): Promise<StaffRegistration> {
    return this.staffRegistrations.upsert(staffRegistration);
  }

  async listStaffMembers(): Promise<readonly StaffMember[]> {
    return this.staffMembers.list();
  }

  async findStaffMemberById(staffMemberId: UUID): Promise<StaffMember | null> {
    return this.staffMembers.findById(staffMemberId);
  }

  async findStaffRegistrationById(registrationId: UUID): Promise<StaffRegistration | null> {
    return this.staffRegistrations.findById(registrationId);
  }

  async listStaffRegistrationsByClub(clubId: UUID): Promise<readonly StaffRegistration[]> {
    return Promise.resolve(
      (await this.staffRegistrations.values()).filter((registration) => registration.clubId === clubId),
    );
  }
}

export class RegistrationsRepository extends RegistrationRepository {}
