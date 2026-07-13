import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface DemoDataset {
  readonly schemaVersion: string;
  readonly seasonId: string;
  readonly auth: {
    readonly federation: DemoCredentials;
  };
  readonly federationSyncPayload: FederationSyncPayload;
  readonly photoPlan: readonly DemoPhotoPlanItem[];
  readonly workflowPlan: WorkflowPlan;
}

interface DemoCredentials {
  readonly email: string;
  readonly password: string;
}

interface DemoEntity {
  readonly id: string;
}

interface DemoPhotoPlanItem {
  readonly registrationId: string;
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

interface WorkflowPlan {
  readonly matchId: string;
  readonly homeSheetId: string;
  readonly awaySheetId: string;
  readonly reportSummary: string;
}

interface SessionResponse {
  readonly accessToken: string;
}

interface MatchSheet {
  readonly id: string;
  readonly status: 'draft' | 'submitted' | 'locked';
}

interface Match {
  readonly id: string;
  readonly status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}

interface MatchReport {
  readonly id: string;
  readonly status: 'draft' | 'in_compilation' | 'submitted';
  readonly summary: string | null;
}

interface PhotoApproval {
  readonly id: string;
  readonly registrationId: string | null;
  readonly status: string;
}

interface SeasonPhotoResponse {
  readonly version: {
    readonly id: string;
    readonly status: string;
  };
  readonly signedUrl: {
    readonly url: string;
  };
}

interface PhotoAuditEvent {
  readonly eventType: string;
}

interface VerifyOptions {
  readonly apiBaseUrl: string;
  readonly datasetPath: string;
}

const defaultApiBaseUrl = 'http://localhost:4000/api/v1';
const defaultDatasetPath = 'demo/arch1/dataset.json';

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const dataset = await loadDataset(options.datasetPath);

  await waitForBackend(options.apiBaseUrl);
  const session = await postJson<SessionResponse>(
    `${options.apiBaseUrl}/auth/login`,
    dataset.auth.federation,
  );

  await verifyFederationData(
    options.apiBaseUrl,
    dataset.federationSyncPayload,
    session.accessToken,
  );
  await verifyPhotos(options.apiBaseUrl, dataset, session.accessToken);
  await verifyMatchWorkflow(options.apiBaseUrl, dataset.workflowPlan, session.accessToken);
  await verifyPhotoAudit(options.apiBaseUrl, session.accessToken);

  console.info('[RefCheckID][demo-verify] Demo verification completed.', {
    apiBaseUrl: options.apiBaseUrl,
    schemaVersion: dataset.schemaVersion,
    seasonId: dataset.seasonId,
    matchId: dataset.workflowPlan.matchId,
    photoRegistrations: dataset.photoPlan.length,
  });
}

function parseArgs(args: readonly string[]): VerifyOptions {
  let apiBaseUrl = process.env.REFCHECKID_API_BASE_URL ?? defaultApiBaseUrl;
  let datasetPath = process.env.REFCHECKID_DEMO_DATASET ?? defaultDatasetPath;

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
    } else {
      throw new Error(`Unknown demo verify argument: ${arg}`);
    }
  }

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ''),
    datasetPath,
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
  if (typeof candidate.seasonId !== 'string') {
    throw new Error(`Demo dataset ${source} must define seasonId.`);
  }
  if (typeof candidate.auth?.federation?.email !== 'string') {
    throw new Error(`Demo dataset ${source} must define federation credentials.`);
  }
  if (!Array.isArray(candidate.photoPlan)) {
    throw new Error(`Demo dataset ${source} must define photoPlan.`);
  }
  if (typeof candidate.workflowPlan?.matchId !== 'string') {
    throw new Error(`Demo dataset ${source} must define workflowPlan.`);
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

async function waitForBackend(apiBaseUrl: string): Promise<void> {
  const healthUrl = `${apiBaseUrl.replace(/\/api\/v1$/, '')}/api/health`;
  const response = await fetch(healthUrl);
  if (!response.ok) {
    throw new Error(`Backend health check failed: ${healthUrl}`);
  }
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
    await assertEndpointContainsIds(
      `${apiBaseUrl}/staff-registrations?clubId=${encodeURIComponent(club.id)}`,
      payload.staffRegistrations.filter((registration) => registration.clubId === club.id),
      accessToken,
    );
  }
}

async function verifyPhotos(
  apiBaseUrl: string,
  dataset: DemoDataset,
  accessToken: string,
): Promise<void> {
  const federationId = dataset.federationSyncPayload.federations[0].id;
  const expectedRegistrationIds = new Set(dataset.photoPlan.map((photo) => photo.registrationId));
  const pending = await getJson<readonly PhotoApproval[]>(
    `${apiBaseUrl}/photo-approvals?federationId=${encodeURIComponent(federationId)}&status=pending`,
    accessToken,
  );
  const pendingDemo = pending.filter(
    (approval) =>
      approval.registrationId !== null && expectedRegistrationIds.has(approval.registrationId),
  );
  if (pendingDemo.length > 0) {
    throw new Error(
      `Demo photo approvals are still pending: ${pendingDemo.map((approval) => approval.id).join(', ')}.`,
    );
  }

  for (const photo of dataset.photoPlan) {
    const seasonPhoto = await getJson<SeasonPhotoResponse>(
      `${apiBaseUrl}/registrations/${photo.registrationId}/season-photo`,
      accessToken,
    );
    if (seasonPhoto.version.status !== 'active') {
      throw new Error(`Registration ${photo.registrationId} season photo is not active.`);
    }
    if (seasonPhoto.signedUrl.url.length === 0) {
      throw new Error(`Registration ${photo.registrationId} season photo signed URL is empty.`);
    }
  }
}

async function verifyMatchWorkflow(
  apiBaseUrl: string,
  workflow: WorkflowPlan,
  accessToken: string,
): Promise<void> {
  await assertMatchSheetLocked(`${apiBaseUrl}/match-sheets/${workflow.homeSheetId}`, accessToken);
  await assertMatchSheetLocked(`${apiBaseUrl}/match-sheets/${workflow.awaySheetId}`, accessToken);

  const match = await getJson<Match>(`${apiBaseUrl}/matches/${workflow.matchId}`, accessToken);
  if (match.status !== 'completed') {
    throw new Error(`Match ${workflow.matchId} is not completed: ${match.status}.`);
  }

  const report = await getJson<MatchReport | null>(
    `${apiBaseUrl}/match-reports?matchId=${encodeURIComponent(workflow.matchId)}`,
    accessToken,
  );
  if (report === null) {
    throw new Error(`Match ${workflow.matchId} does not have a report.`);
  }
  if (report.status !== 'submitted') {
    throw new Error(`Match report ${report.id} is not submitted: ${report.status}.`);
  }
  if (report.summary !== workflow.reportSummary) {
    throw new Error(`Match report ${report.id} summary does not match the demo workflow plan.`);
  }
}

async function verifyPhotoAudit(apiBaseUrl: string, accessToken: string): Promise<void> {
  const events = await getJson<readonly PhotoAuditEvent[]>(
    `${apiBaseUrl}/photos/audit`,
    accessToken,
  );
  for (const eventType of [
    'photo.upload_intent_created',
    'photo.validation_passed',
    'photo.approved',
  ]) {
    if (!events.some((event) => event.eventType === eventType)) {
      throw new Error(`Photo audit event ${eventType} was not found.`);
    }
  }
}

async function assertMatchSheetLocked(url: string, accessToken: string): Promise<void> {
  const matchSheet = await getJson<MatchSheet>(url, accessToken);
  if (matchSheet.status !== 'locked') {
    throw new Error(`Match sheet ${matchSheet.id} is not locked: ${matchSheet.status}.`);
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

await main();
