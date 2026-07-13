import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface DemoDataset {
  readonly schemaVersion: string;
  readonly seasonId: string;
  readonly auth: {
    readonly federation: DemoCredentials;
  };
  readonly federationSyncPayload: FederationSyncPayload;
}

interface DemoCredentials {
  readonly email: string;
  readonly password: string;
}

interface DemoEntity {
  readonly id: string;
}

interface FederationSyncPayload {
  readonly federations: readonly DemoEntity[];
  readonly clubs: readonly DemoEntity[];
  readonly referees: readonly DemoEntity[];
  readonly players: readonly DemoEntity[];
  readonly playerRegistrations: readonly DemoEntity[];
  readonly staffMembers: readonly DemoEntity[];
  readonly staffRegistrations: readonly (DemoEntity & { readonly clubId: string })[];
  readonly matches: readonly DemoEntity[];
}

interface FederationSyncResult {
  readonly federations: number;
  readonly clubs: number;
  readonly referees: number;
  readonly players: number;
  readonly playerRegistrations: number;
  readonly staffMembers: number;
  readonly staffRegistrations: number;
  readonly matches: number;
}

interface SessionResponse {
  readonly accessToken: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly role: string;
  };
}

interface BootstrapOptions {
  readonly apiBaseUrl: string;
  readonly datasetPath: string;
  readonly dryRun: boolean;
}

const defaultApiBaseUrl = 'http://localhost:4000/api/v1';
const defaultDatasetPath = 'demo/arch1/dataset.json';

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const dataset = await loadDataset(options.datasetPath);
  const expected = expectedCounts(dataset.federationSyncPayload);

  if (options.dryRun) {
    printPlan(options, dataset, expected);
    return;
  }

  await waitForBackend(options.apiBaseUrl);
  const session = await login(options.apiBaseUrl, dataset.auth.federation);
  const syncResult = await postJson<FederationSyncResult>(
    `${options.apiBaseUrl}/federation-sync`,
    dataset.federationSyncPayload,
    session.accessToken,
  );
  assertCounts(syncResult, expected);
  await verifyFederationData(
    options.apiBaseUrl,
    dataset.federationSyncPayload,
    session.accessToken,
  );

  console.info('[RefCheckID][demo-bootstrap] Federation Sync bootstrap completed.', {
    apiBaseUrl: options.apiBaseUrl,
    schemaVersion: dataset.schemaVersion,
    seasonId: dataset.seasonId,
    counts: syncResult,
  });
}

function parseArgs(args: readonly string[]): BootstrapOptions {
  let apiBaseUrl = process.env.REFCHECKID_API_BASE_URL ?? defaultApiBaseUrl;
  let datasetPath = process.env.REFCHECKID_DEMO_DATASET ?? defaultDatasetPath;
  let dryRun = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      continue;
    }

    if (arg === '--api-base-url') {
      apiBaseUrl = requireValue(args[index + 1], arg);
      index += 1;
    } else if (arg === '--dataset') {
      datasetPath = requireValue(args[index + 1], arg);
      index += 1;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else {
      throw new Error(`Unknown demo bootstrap argument: ${arg}`);
    }
  }

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ''),
    datasetPath,
    dryRun,
  };
}

function requireValue(value: string | undefined, optionName: string): string {
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

async function loadDataset(datasetPath: string): Promise<DemoDataset> {
  const absolutePath = resolve(process.cwd(), datasetPath);
  const parsed = JSON.parse(await readFile(absolutePath, 'utf8')) as unknown;
  assertDataset(parsed, absolutePath);
  return parsed;
}

function assertDataset(value: unknown, source: string): asserts value is DemoDataset {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Demo dataset ${source} must be a JSON object.`);
  }
  const candidate = value as Partial<DemoDataset>;
  if (candidate.schemaVersion !== 'arch1-demo-bootstrap-v1') {
    throw new Error(`Demo dataset ${source} has an unsupported schemaVersion.`);
  }
  if (typeof candidate.seasonId !== 'string' || candidate.seasonId.length === 0) {
    throw new Error(`Demo dataset ${source} must define seasonId.`);
  }
  if (typeof candidate.auth?.federation?.email !== 'string') {
    throw new Error(`Demo dataset ${source} must define federation demo credentials.`);
  }
  assertFederationSyncPayload(candidate.federationSyncPayload, source);
}

function assertFederationSyncPayload(
  value: FederationSyncPayload | undefined,
  source: string,
): asserts value is FederationSyncPayload {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Demo dataset ${source} must define federationSyncPayload.`);
  }

  for (const key of [
    'federations',
    'clubs',
    'referees',
    'players',
    'playerRegistrations',
    'staffMembers',
    'staffRegistrations',
    'matches',
  ] as const) {
    if (!Array.isArray(value[key])) {
      throw new Error(`Demo dataset ${source} federationSyncPayload.${key} must be an array.`);
    }
  }
}

function expectedCounts(payload: FederationSyncPayload): FederationSyncResult {
  return {
    federations: payload.federations.length,
    clubs: payload.clubs.length,
    referees: payload.referees.length,
    players: payload.players.length,
    playerRegistrations: payload.playerRegistrations.length,
    staffMembers: payload.staffMembers.length,
    staffRegistrations: payload.staffRegistrations.length,
    matches: payload.matches.length,
  };
}

function printPlan(
  options: BootstrapOptions,
  dataset: DemoDataset,
  expected: FederationSyncResult,
): void {
  console.info('[RefCheckID][demo-bootstrap] Dry run completed.', {
    apiBaseUrl: options.apiBaseUrl,
    datasetPath: options.datasetPath,
    schemaVersion: dataset.schemaVersion,
    seasonId: dataset.seasonId,
    expectedFederationSyncCounts: expected,
  });
}

async function waitForBackend(apiBaseUrl: string): Promise<void> {
  const healthUrl = `${apiBaseUrl.replace(/\/api\/v1$/, '')}/api/health`;
  const attempts = 20;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(healthUrl);
    if (response.ok) return;
    await delay(250);
  }

  throw new Error(`Backend health check did not become ready: ${healthUrl}`);
}

async function login(apiBaseUrl: string, credentials: DemoCredentials): Promise<SessionResponse> {
  return postJson<SessionResponse>(`${apiBaseUrl}/auth/login`, credentials);
}

async function verifyFederationData(
  apiBaseUrl: string,
  payload: FederationSyncPayload,
  accessToken: string,
): Promise<void> {
  await assertEndpointContainsIds(`${apiBaseUrl}/federations`, payload.federations, accessToken);
  await assertEndpointContainsIds(`${apiBaseUrl}/clubs`, payload.clubs, accessToken);
  await assertEndpointContainsIds(`${apiBaseUrl}/referees`, payload.referees, accessToken);
  await assertEndpointContainsIds(`${apiBaseUrl}/players`, payload.players, accessToken);
  await assertEndpointContainsIds(
    `${apiBaseUrl}/player-registrations`,
    payload.playerRegistrations,
    accessToken,
  );
  await assertEndpointContainsIds(`${apiBaseUrl}/staff-members`, payload.staffMembers, accessToken);
  await assertEndpointContainsIds(`${apiBaseUrl}/matches`, payload.matches, accessToken);

  for (const club of payload.clubs) {
    const expectedStaffRegistrations = payload.staffRegistrations.filter(
      (registration) => registration.clubId === club.id,
    );
    await assertEndpointContainsIds(
      `${apiBaseUrl}/staff-registrations?clubId=${encodeURIComponent(club.id)}`,
      expectedStaffRegistrations,
      accessToken,
    );
  }
}

async function assertEndpointContainsIds(
  url: string,
  expectedEntities: readonly DemoEntity[],
  accessToken: string,
): Promise<void> {
  const rows = await getJson<readonly DemoEntity[]>(url, accessToken);
  const returnedIds = new Set(rows.map((row) => row.id));
  const missingIds = expectedEntities
    .map((entity) => entity.id)
    .filter((id) => !returnedIds.has(id));

  if (missingIds.length > 0) {
    throw new Error(`Demo verification failed for ${url}. Missing IDs: ${missingIds.join(', ')}`);
  }
}

function assertCounts(actual: FederationSyncResult, expected: FederationSyncResult): void {
  for (const key of Object.keys(expected) as readonly (keyof FederationSyncResult)[]) {
    if (actual[key] !== expected[key]) {
      throw new Error(
        `Federation Sync count mismatch for ${key}: expected ${expected[key]}, received ${actual[key]}.`,
      );
    }
  }
}

async function getJson<T>(url: string, accessToken: string): Promise<T> {
  return requestJson<T>(url, {
    method: 'GET',
    headers: authHeaders(accessToken),
  });
}

async function postJson<T>(url: string, body: unknown, accessToken?: string): Promise<T> {
  return requestJson<T>(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(accessToken === undefined ? {} : authHeaders(accessToken)),
    },
    body: JSON.stringify(body),
  });
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();

  if (!response.ok) {
    throw new Error(
      `Request failed ${init.method ?? 'GET'} ${url}: ${response.status} ${JSON.stringify(body)}`,
    );
  }

  return body as T;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

await main();
