import { describe, expect, it } from 'vitest';
import { createOpenApiDocument } from '../../src/api/index.js';
import { requireBodyObject, requireString, requireUuid } from '../../src/api/validation.js';

describe('unit: controller DTO validation', () => {
  it('validates UUID and body DTO primitives', () => {
    expect(requireUuid('80000000-0000-4000-8000-000000000001', 'id')).toContain('80000000');
    expect(requireString('submitted', 'status')).toBe('submitted');
    expect(requireBodyObject({ status: 'submitted' })).toEqual({ status: 'submitted' });
    expect(() => requireUuid('bad', 'id')).toThrow('id must be a valid UUID');
  });

  it('publishes REST DTOs in the OpenAPI contract', () => {
    const document = createOpenApiDocument();
    expect(document.paths['/api/v1/match-sheets/{id}/submit']).toBeDefined();
    expect(document.paths['/api/v1/match-reports/{id}/submit']).toBeDefined();
  });
});
