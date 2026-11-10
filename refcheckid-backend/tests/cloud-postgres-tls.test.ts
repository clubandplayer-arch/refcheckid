import { rootCertificates } from 'node:tls';
import { Client } from 'pg';
import { expect, it } from 'vitest';
import { postgresTlsOptions } from '../src/cloud/postgres-tls.js';

const connectionString = 'postgresql://postgres.project:password@pooler.example:6543/postgres?sslmode=verify-full';

it('preserves strict TLS and the supplied CA through the actual pg URL parser', () => {
  const ca = rootCertificates[0];
  const options = postgresTlsOptions({ connectionString, max: 2 }, ca);
  expect(options.max).toBe(2);
  expect(new URL(options.connectionString!).searchParams.has('sslmode')).toBe(false);
  const client = new Client(options);
  expect(client.ssl).toEqual({ ca, rejectUnauthorized: true });
  expect(client.host).toBe('pooler.example');
  expect(client.port).toBe(6543);
  expect(client.user).toBe('postgres.project');
});

it('accepts multiline and escaped-newline certificate bundles', () => {
  const ca = rootCertificates.slice(0, 2).join('\n');
  expect(postgresTlsOptions({ connectionString }, ca.replace(/\n/g, '\\n')).ssl).toEqual({ ca, rejectUnauthorized: true });
});

it('fails safely on invalid certificates and preserves the existing configuration when no CA is supplied', () => {
  expect(() => postgresTlsOptions({ connectionString }, 'PRIVATE_INVALID_VALUE')).toThrow('valid PEM');
  const config = { connectionString };
  expect(postgresTlsOptions(config, '')).toBe(config);
  expect(() => postgresTlsOptions(config, `${rootCertificates[0]}\nPRIVATE_EXTRA_VALUE`)).toThrow('valid PEM');
});
