import type { PlayerRegistration, StaffMember, StaffRegistration } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

export class RegistrationsRepository extends NotImplementedRepository<PlayerRegistration> {
  constructor() {
    super('RegistrationsRepository');
  }
}
