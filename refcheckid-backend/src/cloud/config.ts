export class CloudConfigurationError extends Error {
  constructor(readonly diagnosticCode: string, message: string) {
    super(message); this.name = 'CloudConfigurationError';
  }
}

function configurationError(code: string, message: string): never {
  throw new CloudConfigurationError(code, message);
}

function parseConfigurationUrl(value: string, code: string): URL {
  try { return new URL(value); }
  catch { return configurationError(code, 'Invalid URL in server configuration.'); }
}

export function cloudEnabled(): boolean {
  return process.env.REFCHECKID_RUNTIME === 'supabase';
}

export function validateCloudConfiguration(): void {
  for (const name of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVER_KEY', 'AUTH_SECRET']) {
    if (!process.env[name]) configurationError(`CONFIG_MISSING_${name}`, `Missing server configuration: ${name}`);
  }
  const url = parseConfigurationUrl(process.env.SUPABASE_URL!, 'CONFIG_SUPABASE_URL_INVALID');
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') {
    configurationError('CONFIG_SUPABASE_URL_INVALID', 'SUPABASE_URL must be an HTTPS project origin.');
  }
  const connection = parseConfigurationUrl(process.env.DATABASE_URL!, 'CONFIG_DATABASE_URL_INVALID');
  const project = url.hostname.split('.')[0];
  if (!['postgres:', 'postgresql:'].includes(connection.protocol) || connection.searchParams.get('sslmode') !== 'verify-full') {
    configurationError('CONFIG_DATABASE_TLS_REQUIRED', 'Cloud PostgreSQL requires sslmode=verify-full.');
  }
  if (!(connection.hostname === `db.${project}.supabase.co` || decodeURIComponent(connection.username).endsWith(`.${project}`))) {
    configurationError('CONFIG_PROJECT_MISMATCH', 'Supabase database and Storage must identify the same project.');
  }
  const key = process.env.SUPABASE_SERVER_KEY!;
  if (!key.startsWith('sb_secret_')) {
    let role: unknown;
    try { role = (JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()) as { role?: string }).role; }
    catch { /* Rejected below. */ }
    if (role !== 'service_role') configurationError('CONFIG_SERVER_KEY_INVALID', 'A server secret key is required; publishable/anon keys are not sufficient.');
  }
  if (process.env.AUTH_SECRET!.length < 32) configurationError('CONFIG_AUTH_SECRET_TOO_SHORT', 'AUTH_SECRET must contain at least 32 characters.');
  if (process.env.REFCHECKID_DEMO_AUTO_BOOTSTRAP === 'true') configurationError('CONFIG_DEMO_BOOTSTRAP_FORBIDDEN', 'Cloud demo bootstrap is forbidden.');
  if (process.env.VERCEL_ENV === 'preview' && process.env.REFCHECKID_DATA_ENV !== 'staging') {
    configurationError('CONFIG_PREVIEW_DATA_ENV_INVALID', 'Preview deployments require a separate staging data environment.');
  }
  if (process.env.VERCEL_ENV === 'production' && !['staging', 'production'].includes(process.env.REFCHECKID_DATA_ENV ?? '')) {
    configurationError('CONFIG_PRODUCTION_DATA_ENV_INVALID', 'Vercel Production requires an explicit staging or production data environment.');
  }
}
