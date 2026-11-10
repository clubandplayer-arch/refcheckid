import { X509Certificate } from 'node:crypto';
import type { PoolConfig } from 'pg';

/** Shared by the runtime and Node 24 migration CLIs (native type stripping). */
export function postgresTlsOptions(config: PoolConfig, certificate = process.env.SUPABASE_DB_CA_CERT): PoolConfig {
  if (!certificate) return config;
  const ca = certificate.replace(/\\n/g, '\n').trim();
  try {
    const certificates = ca.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
    if (!certificates?.length || certificates.join('').replace(/\s/g, '') !== ca.replace(/\s/g, '')) throw new Error('Invalid PEM');
    for (const pem of certificates) if (!new X509Certificate(pem).ca) throw new Error('Not a CA certificate');
  } catch {
    throw Object.assign(new Error('SUPABASE_DB_CA_CERT must contain valid PEM CA certificates.'), { code: 'CONFIG_DATABASE_CA_INVALID' });
  }
  const url = new URL(config.connectionString!);
  // pg-connection-string otherwise overwrites the explicit SSL object below.
  // Validation still requires verify-full in DATABASE_URL; equivalent strict
  // verification is now explicitly supplied with the project's trusted CA.
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) url.searchParams.delete(key);
  return { ...config, connectionString: url.toString(), ssl: { ca, rejectUnauthorized: true } };
}
