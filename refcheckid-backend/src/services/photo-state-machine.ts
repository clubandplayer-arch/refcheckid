import type { PhotoApprovalStatus, PhotoVersionStatus } from '../domain/index.js';

export class InvalidPhotoStateTransitionError extends Error {
  constructor(entity: 'photo_version' | 'photo_approval', from: string, to: string) {
    super(`Invalid ${entity} transition from ${from} to ${to}.`);
    this.name = 'InvalidPhotoStateTransitionError';
  }
}

const photoVersionTransitions: Readonly<Record<PhotoVersionStatus, readonly PhotoVersionStatus[]>> =
  {
    uploaded: ['validating', 'quarantined', 'erasure_pending'],
    validating: ['pending_approval', 'rejected', 'quarantined'],
    pending_approval: ['active', 'rejected', 'quarantined'],
    active: ['superseded', 'quarantined', 'erasure_pending'],
    rejected: ['archived', 'erasure_pending'],
    superseded: ['archived', 'quarantined', 'erasure_pending'],
    archived: ['erasure_pending'],
    quarantined: ['pending_approval', 'erasure_pending'],
    erasure_pending: ['erased'],
    erased: [],
  };

const photoApprovalTransitions: Readonly<
  Record<PhotoApprovalStatus, readonly PhotoApprovalStatus[]>
> = {
  pending: ['approved', 'rejected', 'cancelled', 'expired'],
  approved: [],
  rejected: [],
  cancelled: [],
  expired: [],
};

export function assertPhotoVersionTransition(
  from: PhotoVersionStatus,
  to: PhotoVersionStatus,
): void {
  if (!photoVersionTransitions[from].includes(to)) {
    throw new InvalidPhotoStateTransitionError('photo_version', from, to);
  }
}

export function assertPhotoApprovalTransition(
  from: PhotoApprovalStatus,
  to: PhotoApprovalStatus,
): void {
  if (!photoApprovalTransitions[from].includes(to)) {
    throw new InvalidPhotoStateTransitionError('photo_approval', from, to);
  }
}

export function listAllowedPhotoVersionTransitions(
  from: PhotoVersionStatus,
): readonly PhotoVersionStatus[] {
  return photoVersionTransitions[from];
}

export function listAllowedPhotoApprovalTransitions(
  from: PhotoApprovalStatus,
): readonly PhotoApprovalStatus[] {
  return photoApprovalTransitions[from];
}
