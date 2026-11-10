import { randomUUID } from 'node:crypto';
import { CloudConfigurationError } from './config.js';
import { SupabaseRequestError } from './supabase-http.js';

// Never log error messages, stack traces, URLs, request bodies or configuration
// values. PostgreSQL and URL parsers can include credentials in those fields.
const databaseCodes: Record<string, string> = {
  MODULE_NOT_FOUND: 'RUNTIME_DEPENDENCY_MISSING', ERR_MODULE_NOT_FOUND: 'RUNTIME_DEPENDENCY_MISSING',
  ERR_UNKNOWN_BUILTIN_MODULE: 'RUNTIME_NODE_VERSION_UNSUPPORTED', EROFS: 'RUNTIME_READONLY_FILESYSTEM',
  'XX000': 'DATABASE_PROVIDER_ERROR',
  '28P01': 'DATABASE_PASSWORD_REJECTED', '28000': 'DATABASE_AUTH_REJECTED',
  '3D000': 'DATABASE_NOT_FOUND', '3F000': 'DATABASE_SCHEMA_MISSING',
  '42P01': 'DATABASE_TABLE_MISSING', '42501': 'DATABASE_PERMISSION_DENIED',
  '53300': 'DATABASE_CONNECTION_LIMIT', '55P03': 'DATABASE_LOCK_TIMEOUT',
  '57014': 'DATABASE_STATEMENT_TIMEOUT',
  ECONNREFUSED: 'DATABASE_CONNECTION_REFUSED', ECONNRESET: 'CONNECTION_RESET',
  ENOTFOUND: 'HOST_NOT_FOUND', EAI_AGAIN: 'DNS_TEMPORARILY_UNAVAILABLE',
  ETIMEDOUT: 'CONNECTION_TIMEOUT', ENETUNREACH: 'NETWORK_UNREACHABLE',
  CERT_HAS_EXPIRED: 'TLS_CERTIFICATE_EXPIRED',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'TLS_UNTRUSTED_CERTIFICATE',
  SELF_SIGNED_CERT_IN_CHAIN: 'TLS_UNTRUSTED_CERTIFICATE',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS_UNTRUSTED_CERTIFICATE',
  ERR_TLS_CERT_ALTNAME_INVALID: 'TLS_HOSTNAME_MISMATCH',
};
const configCodes = new Set([
  'CONFIG_RUNTIME_INVALID', 'CONFIG_SUPABASE_URL_INVALID', 'CONFIG_DATABASE_URL_INVALID',
  'CONFIG_DATABASE_TLS_REQUIRED', 'CONFIG_PROJECT_MISMATCH', 'CONFIG_SERVER_KEY_INVALID',
  'CONFIG_AUTH_SECRET_TOO_SHORT', 'CONFIG_DEMO_BOOTSTRAP_FORBIDDEN',
  'CONFIG_PREVIEW_DATA_ENV_INVALID', 'CONFIG_PRODUCTION_DATA_ENV_INVALID',
  ...['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVER_KEY', 'AUTH_SECRET'].map((name) => `CONFIG_MISSING_${name}`),
]);

export function safeDiagnosticCode(error: unknown, depth = 0): string {
  if (depth > 3) return 'UNEXPECTED_RUNTIME_ERROR';
  if (error instanceof CloudConfigurationError && configCodes.has(error.diagnosticCode)) return error.diagnosticCode;
  if (error instanceof SupabaseRequestError && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599) return `SUPABASE_HTTP_${error.status}`;
  if (error instanceof Error && 'code' in error && typeof error.code === 'string' && Object.hasOwn(databaseCodes, error.code)) return databaseCodes[error.code];
  if (error instanceof Error && error.cause) return safeDiagnosticCode(error.cause instanceof Error && error.cause !== error ? error.cause : undefined, depth + 1);
  if (error instanceof SyntaxError) return 'INVALID_JSON';
  return 'UNEXPECTED_RUNTIME_ERROR';
}

export function logCloudError(error: unknown, phase: 'bootstrap' | 'request' | 'transaction'): string {
  const errorId = randomUUID();
  console.error('[RefCheckID][runtime.error]', { errorId, phase, code: safeDiagnosticCode(error) });
  return errorId;
}
