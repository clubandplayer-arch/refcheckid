export type UUID = string;
export type ISODate = string;
export type ISODateTime = string;

export interface BaseEntity {
  id: UUID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deletedAt: ISODateTime | null;
}

export type LifecycleStatus = 'active' | 'inactive';
