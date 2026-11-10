export function cloudEnabled(): boolean {
  return process.env.REFCHECKID_RUNTIME === 'supabase';
}

export function validateCloudConfiguration(): void {
  for (const name of ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVER_KEY', 'AUTH_SECRET']) {
    if (!process.env[name]) throw new Error(`Missing server configuration: ${name}`);
  }
  const url = new URL(process.env.SUPABASE_URL!);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') {
    throw new Error('SUPABASE_URL must be an HTTPS project origin.');
  }
  const connection = new URL(process.env.DATABASE_URL!);
  const project = url.hostname.split('.')[0];
  if (!['postgres:', 'postgresql:'].includes(connection.protocol) || connection.searchParams.get('sslmode') !== 'verify-full') {
    throw new Error('Cloud PostgreSQL requires sslmode=verify-full.');
  }
  if (!(connection.hostname === `db.${project}.supabase.co` || decodeURIComponent(connection.username).endsWith(`.${project}`))) {
    throw new Error('Supabase database and Storage must identify the same project.');
  }
  const key = process.env.SUPABASE_SERVER_KEY!;
  if (!key.startsWith('sb_secret_')) {
    let role: unknown;
    try { role = (JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()) as { role?: string }).role; }
    catch { /* Rejected below. */ }
    if (role !== 'service_role') throw new Error('A server secret key is required; publishable/anon keys are not sufficient.');
  }
  if (process.env.AUTH_SECRET!.length < 32) throw new Error('AUTH_SECRET must contain at least 32 characters.');
  if (process.env.REFCHECKID_DEMO_AUTO_BOOTSTRAP === 'true') throw new Error('Cloud demo bootstrap is forbidden.');
  if (process.env.VERCEL_ENV === 'preview' && process.env.REFCHECKID_DATA_ENV !== 'staging') {
    throw new Error('Preview deployments require a separate staging data environment.');
  }
  if (process.env.VERCEL_ENV === 'production' && !['staging', 'production'].includes(process.env.REFCHECKID_DATA_ENV ?? '')) {
    throw new Error('Vercel Production requires an explicit staging or production data environment.');
  }
}
