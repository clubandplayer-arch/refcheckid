import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';

// Password arrives over stdin, never as a command-line argument or in logs.
const [file, email, role, scopesJson = '{}'] = process.argv.slice(2);
if (!file || !email?.includes('@') || !['manager', 'referee', 'federation', 'admin'].includes(role)) {
  throw new Error('Usage: node scripts/provision-user.mjs USERS_FILE EMAIL ROLE SCOPES_JSON < password-file');
}
let password = '';
for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, '');
if (password.length < 12) throw new Error('Password must have at least 12 characters.');
const scopes = JSON.parse(scopesJson);
const allowedScopes = ['clubIds', 'federationIds', 'refereeIds', 'authorizedMatchIds'];
if (Object.keys(scopes).some((key) => !allowedScopes.includes(key)) || Object.values(scopes).some((value) => !Array.isArray(value) || value.some((id) => !/^[a-f\d-]{36}$/i.test(id)))) throw new Error('Invalid scopes.');
const path = resolve(file);
const users = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
const existing = users.find((user) => user.email === email.toLowerCase());
const salt = randomBytes(32).toString('hex');
const user = { id: existing?.id ?? randomUUID(), email: email.toLowerCase(), role, displayName: email, enabled: true, ...scopes, passwordHash: `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}` };
const next = users.filter((entry) => entry.id !== user.id);
next.push(user);
const temporary = `${path}.${process.pid}.tmp`;
writeFileSync(temporary, JSON.stringify(next, null, 2), { mode: 0o600, flag: 'wx' });
renameSync(temporary, path);
chmodSync(path, 0o600);
console.log('User provisioned.');
