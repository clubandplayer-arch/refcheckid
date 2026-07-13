#!/usr/bin/env node
import { DemoApiClient } from './lib/demo-api-client.mjs';
import {
  assertFederationSyncCounts,
  buildFederationSyncPayload,
  expectedFederationSyncCounts,
} from './lib/demo-federation-sync.mjs';
import { loadArch1DemoManifest } from './lib/demo-manifest.mjs';

const defaultBaseUrl = process.env.REFCHECKID_API_BASE_URL ?? 'http://localhost:4000/api/v1';

const demoUsers = {
  federation: { email: 'federazione@refcheckid.local', password: 'Password123!' },
  managerAway: { email: 'dirigenteospite@refcheckid.local', password: 'Password123!' },
  managerHome: { email: 'dirigente@refcheckid.local', password: 'Password123!' },
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseUrl = options.baseUrl ?? defaultBaseUrl;
  const manifest = await loadArch1DemoManifest(options.manifestPath);
  const syncPayload = buildFederationSyncPayload(manifest);
  const expectedCounts = expectedFederationSyncCounts(manifest);

  if (options.dryRun) {
    printReport({ baseUrl, dryRun: true, expectedCounts, syncResult: null });
    return;
  }

  const apiClient = new DemoApiClient({ baseUrl });
  const sessions = await loginDemoUsers(apiClient);
  const syncResult = await apiClient.federationSync(syncPayload, sessions.federation.accessToken);
  assertFederationSyncCounts(syncResult, expectedCounts);

  printReport({ baseUrl, dryRun: false, expectedCounts, syncResult });
}

function parseArgs(args) {
  const options = { dryRun: false, manifestPath: undefined, baseUrl: undefined };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--') {
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--base-url') {
      options.baseUrl = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--manifest') {
      options.manifestPath = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function requireValue(args, index, optionName) {
  const value = args[index + 1];

  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value`);
  }

  return value;
}

async function loginDemoUsers(apiClient) {
  const entries = await Promise.all(
    Object.entries(demoUsers).map(async ([key, credentials]) => [
      key,
      await apiClient.login(credentials),
    ]),
  );

  return Object.fromEntries(entries);
}

function printReport({ baseUrl, dryRun, expectedCounts, syncResult }) {
  console.log(
    JSON.stringify(
      {
        baseUrl,
        dryRun,
        milestone: 3,
        phase: 'authentication-and-federation-sync',
        sync: {
          expected: expectedCounts,
          received: syncResult,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('[ARCH-1 Demo Bootstrap] Failed:', error.message);
  process.exitCode = 1;
});
