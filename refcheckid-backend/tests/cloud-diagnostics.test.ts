import { afterEach, expect, it, vi } from 'vitest';
import { logCloudError, safeDiagnosticCode } from '../src/cloud/diagnostics.js';
import { CloudConfigurationError, validateCloudConfiguration } from '../src/cloud/config.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it('logs only allowlisted codes and a correlation ID, never raw error fields', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const error = Object.assign(new Error('postgresql://user:PRIVATE_PASSWORD@host/db'), {
    code: '28P01', detail: 'PRIVATE_DETAIL', stack: 'PRIVATE_STACK',
  });
  const id = logCloudError(error, 'transaction');
  expect(id).toMatch(/^[a-f\d-]{36}$/);
  expect(log).toHaveBeenCalledWith('[RefCheckID][runtime.error]', {
    errorId: id, phase: 'transaction', code: 'DATABASE_PASSWORD_REJECTED',
  });
  expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE');
  expect(safeDiagnosticCode(Object.assign(new Error('private'), { code: 'PRIVATE_TOKEN' }))).toBe('UNEXPECTED_RUNTIME_ERROR');
  expect(safeDiagnosticCode(new CloudConfigurationError('PRIVATE_TOKEN', 'private'))).toBe('UNEXPECTED_RUNTIME_ERROR');
});

it('classifies nested network errors without logging secrets or recursing through cycles', () => {
  expect(safeDiagnosticCode(new Error('private', { cause: Object.assign(new Error('private'), { code: 'ENOTFOUND' }) }))).toBe('HOST_NOT_FOUND');
  const error = new Error('private');
  const cause = new Error('private', { cause: error }); error.cause = cause;
  expect(safeDiagnosticCode(error)).toBe('UNEXPECTED_RUNTIME_ERROR');
});

it('assigns safe diagnostic codes to missing configuration and malformed URLs', () => {
  vi.stubEnv('DATABASE_URL', 'postgresql://user:PRIVATE_PASSWORD@host/db');
  vi.stubEnv('SUPABASE_URL', 'not-an-origin-PRIVATE');
  vi.stubEnv('SUPABASE_SERVER_KEY', 'sb_secret_private');
  vi.stubEnv('AUTH_SECRET', 's'.repeat(64));
  try { validateCloudConfiguration(); throw new Error('Expected configuration failure'); }
  catch (error) {
    expect(safeDiagnosticCode(error)).toBe('CONFIG_SUPABASE_URL_INVALID');
    expect(String(error)).not.toContain('PRIVATE');
  }
  vi.stubEnv('DATABASE_URL', '');
  try { validateCloudConfiguration(); throw new Error('Expected configuration failure'); }
  catch (error) { expect(safeDiagnosticCode(error)).toBe('CONFIG_MISSING_DATABASE_URL'); }
});
