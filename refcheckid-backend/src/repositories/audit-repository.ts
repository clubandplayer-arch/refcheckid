import type { AuditLog } from '../domain/index.js';
import { NotImplementedRepository } from './base-repository.js';

export class AuditRepository extends NotImplementedRepository<AuditLog> {
  constructor() {
    super('AuditRepository');
  }
}
