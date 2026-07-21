import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateDemoPng, type DemoImageSpec } from './demo-image-generator.js';

interface DemoDataset {
  readonly schemaVersion: string;
  readonly seasonId: string;
  readonly auth: {
    readonly homeManager: DemoCredentials;
    readonly awayManager: DemoCredentials;
    readonly referee: DemoCredentials;
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

interface DemoPlayerRegistration extends DemoEntity {
  readonly playerId: string;
  readonly clubId: string;
  readonly season: string;
}

interface DemoStaffRegistration extends DemoEntity {
  readonly staffMemberId: string;
  readonly clubId: string;
  readonly season: string;
}

interface DemoPhotoPlanItem {
  readonly label: string;
  readonly subjectKind: 'athlete' | 'staff_member';
  readonly subjectId: string;
  readonly registrationId: string;
  readonly clubId: string;
  readonly manager: 'homeManager' | 'awayManager';
  readonly generatedImage: DemoImageSpec;
}

interface PhotoUploadIntentResponse {
  readonly intent: {
    readonly uploadId: string;
    readonly objectKey: string;
  };
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

interface MatchSheet {
  readonly id: string;
  readonly status: 'draft' | 'submitted' | 'locked';
}

interface Match {
  readonly id: string;
  readonly status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}

interface RecognitionWorkflow {
  readonly matchId: string;
  readonly status: 'not_started' | 'in_progress' | 'locked';
}

interface MatchReport {
  readonly id: string;
  readonly status: 'draft' | 'in_compilation' | 'submitted';
  readonly summary: string | null;
}

interface WorkflowPlan {
  readonly matchId: string;
  readonly homeSheetId: string;
  readonly awaySheetId: string;
  readonly refereeId: string;
  readonly reportSummary: string;
}

interface DemoSessions {
  readonly homeManager: SessionResponse;
  readonly awayManager: SessionResponse;
  readonly referee: SessionResponse;
  readonly federation: SessionResponse;
}

interface FederationSyncPayload {
  readonly federations: readonly DemoEntity[];
  readonly clubs: readonly DemoEntity[];
  readonly referees: readonly DemoEntity[];
  readonly players: readonly DemoEntity[];
  readonly playerRegistrations: readonly DemoPlayerRegistration[];
  readonly staffMembers: readonly DemoEntity[];
  readonly staffRegistrations: readonly DemoStaffRegistration[];
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
  const sessions = await loginDemoUsers(options.apiBaseUrl, dataset);
  const syncResult = await postJson<FederationSyncResult>(
    `${options.apiBaseUrl}/federation-sync`,
    dataset.federationSyncPayload,
    sessions.federation.accessToken,
  );
  assertCounts(syncResult, expected);
  await verifyFederationData(
    options.apiBaseUrl,
    dataset.federationSyncPayload,
    sessions.federation.accessToken,
  );
  await uploadAndApproveDemoPhotos(options.apiBaseUrl, dataset, sessions);
  await completeMatchWorkflow(options.apiBaseUrl, dataset.workflowPlan, dataset.photoPlan, sessions);

  console.info(
    '[RefCheckID][demo-bootstrap] Federation Sync, photo, and match workflow bootstrap completed.',
    {
      apiBaseUrl: options.apiBaseUrl,
      schemaVersion: dataset.schemaVersion,
      seasonId: dataset.seasonId,
      counts: syncResult,
      uploadedPhotos: dataset.photoPlan.length,
      matchId: dataset.workflowPlan.matchId,
    },
  );
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
  if (typeof candidate.auth.homeManager?.email !== 'string') {
    throw new Error(`Demo dataset ${source} must define home manager demo credentials.`);
  }
  if (typeof candidate.auth.awayManager?.email !== 'string') {
    throw new Error(`Demo dataset ${source} must define away manager demo credentials.`);
  }
  if (typeof candidate.auth.referee?.email !== 'string') {
    throw new Error(`Demo dataset ${source} must define referee demo credentials.`);
  }
  assertFederationSyncPayload(candidate.federationSyncPayload, source);
  assertFederationRegistrationIntegrity(candidate.federationSyncPayload);
  if (!Array.isArray(candidate.photoPlan)) {
    throw new Error(`Demo dataset ${source} must define photoPlan.`);
  }
  if (typeof candidate.workflowPlan?.matchId !== 'string') {
    throw new Error(`Demo dataset ${source} must define workflowPlan.`);
  }
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
    expectedPhotoUploads: dataset.photoPlan.length,
    workflowMatchId: dataset.workflowPlan.matchId,
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

async function loginDemoUsers(apiBaseUrl: string, dataset: DemoDataset): Promise<DemoSessions> {
  return {
    homeManager: await login(apiBaseUrl, dataset.auth.homeManager),
    awayManager: await login(apiBaseUrl, dataset.auth.awayManager),
    referee: await login(apiBaseUrl, dataset.auth.referee),
    federation: await login(apiBaseUrl, dataset.auth.federation),
  };
}

async function login(apiBaseUrl: string, credentials: DemoCredentials): Promise<SessionResponse> {
  return postJson<SessionResponse>(`${apiBaseUrl}/auth/login`, credentials);
}

async function uploadAndApproveDemoPhotos(
  apiBaseUrl: string,
  dataset: DemoDataset,
  sessions: DemoSessions,
): Promise<void> {
  for (const photo of dataset.photoPlan) {
    const session = sessions[photo.manager];
    const png = generateDemoPng(photo.generatedImage);
    const intent = await postJson<PhotoUploadIntentResponse>(
      `${apiBaseUrl}/photos/upload-intent`,
      {
        subjectKind: photo.subjectKind,
        subjectId: photo.subjectId,
        registrationId: photo.registrationId,
        federationId: dataset.federationSyncPayload.federations[0].id,
        seasonId: dataset.seasonId,
        mimeType: 'image/png',
        fileSizeBytes: png.byteLength,
        sha256: createHash('sha256').update(png).digest('hex'),
        actorRole: 'manager',
        clubId: photo.clubId,
        registrationClubId: photo.clubId,
      },
      session.accessToken,
    );

    await postJson<unknown>(
      `${apiBaseUrl}/photos/uploads/${intent.intent.uploadId}/complete`,
      {
        objectKey: intent.intent.objectKey,
        contentBase64: png.toString('base64'),
        actorRole: 'manager',
        clubId: photo.clubId,
        registrationClubId: photo.clubId,
      },
      session.accessToken,
    );
  }

  const pending = await getJson<readonly PhotoApproval[]>(
    `${apiBaseUrl}/photo-approvals?federationId=${encodeURIComponent(dataset.federationSyncPayload.federations[0].id)}&status=pending`,
    sessions.federation.accessToken,
  );
  const expectedRegistrationIds = new Set(dataset.photoPlan.map((photo) => photo.registrationId));
  const approvalsToApprove = pending.filter(
    (approval) =>
      approval.registrationId !== null && expectedRegistrationIds.has(approval.registrationId),
  );

  if (approvalsToApprove.length !== dataset.photoPlan.length) {
    throw new Error(
      `Expected ${dataset.photoPlan.length} pending photo approvals, found ${approvalsToApprove.length}.`,
    );
  }

  for (const approval of approvalsToApprove) {
    await postJson<PhotoApproval>(
      `${apiBaseUrl}/photo-approvals/${approval.id}/approve`,
      {
        actorRole: 'federation',
        federationId: dataset.federationSyncPayload.federations[0].id,
        reasonCode: 'identity_verified',
        notes: 'ARCH-1 demo bootstrap approval',
      },
      sessions.federation.accessToken,
    );
  }

  await verifyApprovedPhotos(apiBaseUrl, dataset, sessions.federation.accessToken);
}

async function completeMatchWorkflow(
  apiBaseUrl: string,
  workflow: WorkflowPlan,
  photoPlan: readonly DemoPhotoPlanItem[],
  sessions: DemoSessions,
): Promise<void> {
  await submitAndLockMatchSheet(
    apiBaseUrl,
    workflow.homeSheetId,
    buildDemoLineup(photoPlan, 'homeManager'),
    sessions.homeManager.accessToken,
  );
  await submitAndLockMatchSheet(
    apiBaseUrl,
    workflow.awaySheetId,
    buildDemoLineup(photoPlan, 'awayManager'),
    sessions.awayManager.accessToken,
  );

  await postJson<RecognitionWorkflow>(
    `${apiBaseUrl}/recognitions/start`,
    { matchId: workflow.matchId },
    sessions.referee.accessToken,
  );
  const recognition = await postJson<RecognitionWorkflow>(
    `${apiBaseUrl}/recognitions/complete`,
    { matchId: workflow.matchId },
    sessions.referee.accessToken,
  );
  if (recognition.status !== 'locked') {
    throw new Error(`Recognition workflow for match ${workflow.matchId} is not locked.`);
  }

  await completeMatch(apiBaseUrl, workflow.matchId, sessions.referee.accessToken);
  await submitMatchReport(apiBaseUrl, workflow, sessions.referee.accessToken);
}

async function submitAndLockMatchSheet(
  apiBaseUrl: string,
  matchSheetId: string,
  lineup: MatchSheetLineupPayload,
  accessToken: string,
): Promise<void> {
  const matchSheet = await getJson<MatchSheet>(
    `${apiBaseUrl}/match-sheets/${matchSheetId}`,
    accessToken,
  );

  if (matchSheet.status === 'draft') {
    await postJson<MatchSheet>(
      `${apiBaseUrl}/match-sheets/${matchSheetId}/submit`,
      lineup,
      accessToken,
    );
    await postJson<MatchSheet>(`${apiBaseUrl}/match-sheets/${matchSheetId}/lock`, {}, accessToken);
  } else if (matchSheet.status === 'submitted') {
    await postJson<MatchSheet>(`${apiBaseUrl}/match-sheets/${matchSheetId}/lock`, {}, accessToken);
  }

  const locked = await getJson<MatchSheet>(
    `${apiBaseUrl}/match-sheets/${matchSheetId}`,
    accessToken,
  );
  if (locked.status !== 'locked') {
    throw new Error(`Match sheet ${matchSheetId} is not locked: ${locked.status}.`);
  }
}

interface MatchSheetLineupPayload {
  readonly players: readonly {
    readonly playerRegistrationId: string;
    readonly shirtNumber: number | null;
    readonly role: string;
  }[];
  readonly staff: readonly {
    readonly staffRegistrationId: string;
    readonly role: string;
  }[];
}

function buildDemoLineup(
  photoPlan: readonly DemoPhotoPlanItem[],
  manager: DemoPhotoPlanItem['manager'],
): MatchSheetLineupPayload {
  const items = photoPlan.filter((item) => item.manager === manager);
  return {
    players: items
      .filter((item) => item.subjectKind === 'athlete')
      .map((item, index) => ({
        playerRegistrationId: item.registrationId,
        role: index < 11 ? 'starter' : 'reserve',
        shirtNumber:
          typeof item.generatedImage.shirtNumber === 'number' ? item.generatedImage.shirtNumber : null,
      })),
    staff: items
      .filter((item) => item.subjectKind === 'staff_member')
      .map((item) => ({
        staffRegistrationId: item.registrationId,
        role: 'Allenatore',
      })),
  };
}

async function completeMatch(
  apiBaseUrl: string,
  matchId: string,
  accessToken: string,
): Promise<void> {
  const match = await getJson<Match>(`${apiBaseUrl}/matches/${matchId}`, accessToken);

  if (match.status === 'scheduled') {
    await postJson<Match>(
      `${apiBaseUrl}/matches/${matchId}/status`,
      { status: 'in_progress' },
      accessToken,
    );
    await postJson<Match>(
      `${apiBaseUrl}/matches/${matchId}/status`,
      { status: 'completed' },
      accessToken,
    );
  } else if (match.status === 'in_progress') {
    await postJson<Match>(
      `${apiBaseUrl}/matches/${matchId}/status`,
      { status: 'completed' },
      accessToken,
    );
  }

  const completed = await getJson<Match>(`${apiBaseUrl}/matches/${matchId}`, accessToken);
  if (completed.status !== 'completed') {
    throw new Error(`Match ${matchId} is not completed: ${completed.status}.`);
  }
}

async function submitMatchReport(
  apiBaseUrl: string,
  workflow: WorkflowPlan,
  accessToken: string,
): Promise<void> {
  const existingReport = await getJson<MatchReport | null>(
    `${apiBaseUrl}/match-reports?matchId=${encodeURIComponent(workflow.matchId)}`,
    accessToken,
  );
  const report =
    existingReport === null
      ? await postJson<MatchReport>(
          `${apiBaseUrl}/match-reports`,
          {
            matchId: workflow.matchId,
            refereeId: workflow.refereeId,
            summary: workflow.reportSummary,
          },
          accessToken,
        )
      : existingReport;

  const updated =
    report.status === 'submitted'
      ? report
      : await patchJson<MatchReport>(
          `${apiBaseUrl}/match-reports/${report.id}`,
          { summary: workflow.reportSummary },
          accessToken,
        );
  const submitted =
    updated.status === 'submitted'
      ? updated
      : await postJson<MatchReport>(
          `${apiBaseUrl}/match-reports/${updated.id}/submit`,
          {},
          accessToken,
        );

  if (submitted.status !== 'submitted') {
    throw new Error(`Match report ${submitted.id} is not submitted: ${submitted.status}.`);
  }
}

async function verifyApprovedPhotos(
  apiBaseUrl: string,
  dataset: DemoDataset,
  accessToken: string,
): Promise<void> {
  const pending = await getJson<readonly PhotoApproval[]>(
    `${apiBaseUrl}/photo-approvals?federationId=${encodeURIComponent(dataset.federationSyncPayload.federations[0].id)}&status=pending`,
    accessToken,
  );
  const expectedRegistrationIds = new Set(dataset.photoPlan.map((photo) => photo.registrationId));
  const pendingDemoApprovals = pending.filter(
    (approval) =>
      approval.registrationId !== null && expectedRegistrationIds.has(approval.registrationId),
  );

  if (pendingDemoApprovals.length > 0) {
    throw new Error(
      `Demo photo approvals are still pending: ${pendingDemoApprovals.map((approval) => approval.id).join(', ')}.`,
    );
  }

  for (const photo of dataset.photoPlan) {
    const seasonPhoto = await getJson<SeasonPhotoResponse>(
      `${apiBaseUrl}/registrations/${photo.registrationId}/season-photo`,
      accessToken,
    );
    if (seasonPhoto.version.status !== 'active') {
      throw new Error(
        `Season photo for registration ${photo.registrationId} is not active: ${seasonPhoto.version.status}.`,
      );
    }
    if (seasonPhoto.signedUrl.url.length === 0) {
      throw new Error(
        `Season photo for registration ${photo.registrationId} did not return a signed URL.`,
      );
    }
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
    await assertClubScopedRegistrations(
      `${apiBaseUrl}/player-registrations?clubId=${encodeURIComponent(club.id)}`,
      payload.playerRegistrations.filter((registration) => registration.clubId === club.id),
      club.id,
      accessToken,
    );
    await assertClubScopedRegistrations(
      `${apiBaseUrl}/staff-registrations?clubId=${encodeURIComponent(club.id)}`,
      payload.staffRegistrations.filter((registration) => registration.clubId === club.id),
      club.id,
      accessToken,
    );
  }

  assertFederationRegistrationIntegrity(payload);
}

function assertFederationRegistrationIntegrity(payload: FederationSyncPayload): void {
  const playerIds = new Set(payload.players.map((player) => player.id));
  const staffMemberIds = new Set(payload.staffMembers.map((staffMember) => staffMember.id));
  const clubIds = new Set(payload.clubs.map((club) => club.id));

  for (const registration of payload.playerRegistrations) {
    if (!playerIds.has(registration.playerId)) {
      throw new Error(
        `Player registration ${registration.id} references missing player ${registration.playerId}.`,
      );
    }
    if (!clubIds.has(registration.clubId)) {
      throw new Error(
        `Player registration ${registration.id} references missing club ${registration.clubId}.`,
      );
    }
    if (registration.season.length === 0) {
      throw new Error(`Player registration ${registration.id} must define a season.`);
    }
  }

  for (const registration of payload.staffRegistrations) {
    if (!staffMemberIds.has(registration.staffMemberId)) {
      throw new Error(
        `Staff registration ${registration.id} references missing staff member ${registration.staffMemberId}.`,
      );
    }
    if (!clubIds.has(registration.clubId)) {
      throw new Error(
        `Staff registration ${registration.id} references missing club ${registration.clubId}.`,
      );
    }
    if (registration.season.length === 0) {
      throw new Error(`Staff registration ${registration.id} must define a season.`);
    }
  }
}

async function assertClubScopedRegistrations<T extends DemoEntity & { readonly clubId: string }>(
  url: string,
  expectedEntities: readonly T[],
  clubId: string,
  accessToken: string,
): Promise<void> {
  const rows = await getJson<readonly T[]>(url, accessToken);
  const wrongClubRows = rows.filter((row) => row.clubId !== clubId).map((row) => row.id);
  if (wrongClubRows.length > 0) {
    throw new Error(
      `Demo verification failed for ${url}. Rows from another club: ${wrongClubRows.join(', ')}`,
    );
  }
  assertRowsContainIds(url, rows, expectedEntities);
}

async function assertEndpointContainsIds(
  url: string,
  expectedEntities: readonly DemoEntity[],
  accessToken: string,
): Promise<void> {
  const rows = await getJson<readonly DemoEntity[]>(url, accessToken);
  assertRowsContainIds(url, rows, expectedEntities);
}

function assertRowsContainIds(
  url: string,
  rows: readonly DemoEntity[],
  expectedEntities: readonly DemoEntity[],
): void {
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

async function patchJson<T>(url: string, body: unknown, accessToken: string): Promise<T> {
  return requestJson<T>(url, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...authHeaders(accessToken),
    },
    body: JSON.stringify(body),
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
