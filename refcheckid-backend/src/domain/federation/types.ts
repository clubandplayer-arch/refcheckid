import type { BaseEntity } from '../shared/types.js';

export interface Federation extends BaseEntity {
  name: string;
  fiscalCode: string | null;
  status: 'active' | 'inactive';
}
