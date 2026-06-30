import type { UUID } from '../domain/index.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function requireUuid(value: string | undefined, field: string): UUID {
  if (value === undefined || !uuidPattern.test(value)) {
    throw new ValidationError(`${field} must be a valid UUID.`, field);
  }

  return value;
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${field} is required.`, field);
  }

  return value;
}

export function optionalString(value: unknown, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string.`, field);
  }

  return value;
}

export function requireBodyObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be an object.', 'body');
  }

  return body as Record<string, unknown>;
}
