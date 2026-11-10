import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

// Accounts are created/invited in Supabase Auth separately. This command only
// assigns application scopes and preserves the original application's actor ID.
if (!process.argv[2] || !process.env.DATABASE_URL) throw new Error('Usage: DATABASE_URL=... node scripts/supabase-provision-profile.mjs PROFILE.json');
const profile = JSON.parse(await readFile(process.argv[2], 'utf8'));
const allowed = ['id', 'actorId', 'email', 'displayName', 'role', 'enabled', 'clubIds', 'federationIds', 'refereeIds', 'authorizedMatchIds'];
if (Object.keys(profile).some((key) => !allowed.includes(key))) throw new Error('Unknown profile fields. Do not include passwords or tokens.');
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
if (!uuid.test(profile.id) || !uuid.test(profile.actorId) || typeof profile.email !== 'string' ||
  typeof profile.displayName !== 'string' || typeof profile.enabled !== 'boolean' ||
  !['manager', 'referee', 'federation', 'admin'].includes(profile.role) ||
  ['clubIds', 'federationIds', 'refereeIds', 'authorizedMatchIds'].some((name) => !Array.isArray(profile[name]) || profile[name].some((id) => !uuid.test(id)))) {
  throw new Error('Invalid profile. Specify all scope arrays explicitly.');
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(724391,1)');
  const identity = await client.query('SELECT email FROM auth.users WHERE id=$1', [profile.id]);
  if (identity.rows[0]?.email?.toLowerCase() !== profile.email.toLowerCase()) throw new Error('Supabase Auth identity/email mismatch.');
  for (const [scope, repository] of Object.entries({ clubIds: 'clubs', federationIds: 'federations', refereeIds: 'referees', authorizedMatchIds: 'matches' })) {
    for (const id of profile[scope]) {
      const row = await client.query('SELECT 1 FROM refcheckid.entities WHERE repository=$1 AND id=$2', [repository, id]);
      if (!row.rowCount) throw new Error(`Unknown ${scope} reference.`);
    }
  }
  await client.query(`INSERT INTO refcheckid.entities(repository,id,document) VALUES ('auth_profiles',$1,$2::jsonb)
    ON CONFLICT(repository,id) DO UPDATE SET document=excluded.document`, [profile.id, JSON.stringify(profile)]);
  await client.query('COMMIT');
  console.log('Application profile provisioned. No password was stored in application data.');
} catch (error) {
  await client.query('ROLLBACK'); console.error(error instanceof Error && !('severity' in error) ? error.message : 'Profile provisioning failed.'); process.exitCode = 1;
} finally { client.release(); await pool.end(); }
