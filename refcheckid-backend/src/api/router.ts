import { lineupDefaults } from './lineup-defaults.js';
import { cloudEnabled } from '../cloud/config.js';
import { photoApprovalQueue } from './photo-approval-queue.js';
import { ensurePhotoThumbnail } from '../services/photo-thumbnail.js';
import type { ApplicationContainer } from '../config/application-container.js';
import { authenticateBearerToken, loginHandler, logoutHandler, meHandler, refreshHandler } from './auth.js';
import { createControllers } from './controllers.js';
import { ApiRouter, type ApiResponse } from './http.js';
import {
  authenticationMiddleware,
  authorizationMiddleware,
  correlationIdMiddleware,
  errorHandlingMiddleware,
  loggingMiddleware,
  requestIdMiddleware,
} from './middleware.js';
import { createOpenApiDocument } from './openapi.js';
import { createSwaggerHtml } from './swagger.js';
import { resourceAccess } from './resource-access.js';
import { requestContext } from './request-context.js';

export function createRestApiRouter(container: ApplicationContainer): ApiRouter {
  const router = new ApiRouter();
  const controllers = createControllers(container);

  // Rejections are audited after the command transaction has rolled back.
  router.use((next) => async (request) => {
    const response = await next(request);
    if (response.status >= 400) {
      await container.store.transaction(async () => {
        const auth = request.auth ?? await requestContext.run({ store: container.store }, () => authenticateBearerToken(request.headers.authorization));
        if (auth) await container.repositories.audit.createAuditLog({ action: 'command.rejected', occurredAt: new Date().toISOString(),
          metadata: { actorId: auth.actorId, method: request.method, path: request.path, status: response.status, correlationId: response.headers?.['x-correlation-id'] },
        });
      });
    }
    return response;
  });

  router.use(errorHandlingMiddleware);
  router.use((next) => (request) => {
    const readOnly = request.method === 'GET' && (
      ['/api/v1/photo-approvals/page', '/api/v1/photo-approvals/summary'].includes(request.path) ||
      /^\/api\/v1\/clubs\/[^/]+\/lineup-defaults$/.test(request.path) ||
      /^\/api\/v1\/photos\/versions\/[^/]+\/content$/.test(request.path));
    const operation = async () => {
    const response = await requestContext.run({ store: container.store }, () => next(request));
    // Handler error responses must roll back just like thrown domain errors.
    if (response.status >= 400) throw new RejectedResponse(response);
    return response;
    };
    const run = readOnly && container.store.readTransaction ? container.store.readTransaction(operation) : container.store.transaction(operation);
    return run.catch((error: unknown) => {
    if (error instanceof RejectedResponse) return error.response;
    throw error;
    });
  });
  router.use(requestIdMiddleware);
  router.use(correlationIdMiddleware);
  router.use(loggingMiddleware);
  router.use(authenticationMiddleware);
  router.use(authorizationMiddleware);
  router.use(resourceAccess(container));
  router.use((next) => (request) => requestContext.run({ store: container.store, ...(request.auth ? { auth: request.auth } : {}) }, async () => {
    const response = await next(request);
    if (request.method !== 'GET' && response.status < 400 && request.auth) {
      const sheet = request.path.includes('/match-sheets/') && request.params.id ? await container.repositories.matchSheets.findById(request.params.id) : null;
      const result = response.body as Record<string, unknown> | null;
      const body = request.body as Record<string, unknown> | undefined;
      await container.repositories.audit.createAuditLog({
        action: `${request.method} ${request.path}`, occurredAt: new Date().toISOString(),
        matchId: sheet?.matchId ?? (typeof result?.matchId === 'string' ? result.matchId : typeof body?.matchId === 'string' ? body.matchId : null),
        metadata: { actorId: request.auth.actorId, roles: request.auth.roles, correlationId: request.correlationId },
      });
    }
    return response;
  }));

  router.register('GET', '/api/health', controllers.health);
  const openApiHandler = () => ({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: createOpenApiDocument(),
  });
  const swaggerHandler = () => ({
    status: 200,
    headers: { 'content-type': 'text/html' },
    body: createSwaggerHtml(),
  });

  router.register('GET', '/api/docs/openapi.json', openApiHandler);
  router.register('GET', '/api/docs/swagger', swaggerHandler);
  router.register('GET', '/api/v1/openapi.json', openApiHandler);
  router.register('GET', '/api/v1/swagger', swaggerHandler);
  router.register('POST', '/api/v1/auth/login', loginHandler);
  router.register('POST', '/api/v1/auth/refresh', refreshHandler);
  router.register('GET', '/api/v1/auth/me', meHandler);
  router.register('POST', '/api/v1/auth/logout', logoutHandler);

  router.register('POST', '/api/v1/federation-sync', controllers.syncFederation);
  router.register('POST', '/api/v1/federation-imports', controllers.createFederationImport);
  router.register('GET', '/api/v1/federation-imports', controllers.listFederationImports);
  router.register('GET', '/api/v1/federation-imports/:id', controllers.getFederationImport);
  router.register(
    'POST',
    '/api/v1/federation-imports/:id/parse',
    controllers.parseFederationImport,
  );
  router.register(
    'POST',
    '/api/v1/federation-imports/:id/validate',
    controllers.validateFederationImport,
  );
  router.register(
    'POST',
    '/api/v1/federation-imports/:id/commit',
    controllers.commitFederationImport,
  );
  router.register(
    'GET',
    '/api/v1/federation-imports/:id/rows',
    controllers.listFederationImportRows,
  );
  router.register('GET', '/api/v1/federations', controllers.listFederations);
  router.register('GET', '/api/v1/federations/:id', controllers.getFederation);
  router.register('GET', '/api/v1/clubs', controllers.listClubs);
  router.register('GET', '/api/v1/clubs/:id', controllers.getClub);
  router.register('GET', '/api/v1/clubs/:id/lineup-defaults', (request) => lineupDefaults(container, request));
  router.register('GET', '/api/v1/players', controllers.listPlayers);
  router.register('GET', '/api/v1/players/:id', controllers.getPlayer);
  router.register('GET', '/api/v1/player-registrations', controllers.listPlayerRegistrations);
  router.register('GET', '/api/v1/player-registrations/:id', controllers.getPlayerRegistration);
  router.register('GET', '/api/v1/staff-members', controllers.listStaffMembers);
  router.register('GET', '/api/v1/staff-registrations', controllers.listStaffRegistrations);
  router.register('GET', '/api/v1/referees', controllers.listReferees);
  router.register('GET', '/api/v1/referees/:id', controllers.getReferee);
  router.register('GET', '/api/v1/matches', controllers.listMatches);
  router.register('GET', '/api/v1/matches/:id', controllers.getMatch);
  router.register('GET', '/api/v1/matches/:id/readiness', controllers.getMatchReadiness);
  router.register('POST', '/api/v1/matches/:id/status', controllers.transitionMatch);
  router.register('GET', '/api/v1/match-sheets', controllers.listMatchSheets);
  router.register('GET', '/api/v1/match-sheets/:id', controllers.getMatchSheet);
  router.register('POST', '/api/v1/match-sheets/:id/submit', controllers.submitMatchSheet);
  router.register('POST', '/api/v1/match-sheets/:id/draft', controllers.saveMatchSheetDraft);
  router.register('POST', '/api/v1/match-sheets/:id/lock', controllers.lockMatchSheet);
  router.register('POST', '/api/v1/match-sheets/:id/reset-smoke', controllers.resetSmokeMatchSheet);
  router.register('GET', '/api/v1/recognitions', controllers.listRecognitions);
  router.register('GET', '/api/v1/recognitions/workflow', controllers.getRecognitionWorkflow);
  router.register('GET', '/api/v1/recognitions/:id', controllers.getRecognition);
  router.register('POST', '/api/v1/recognitions/start', controllers.startRecognition);
  router.register('POST', '/api/v1/recognitions/complete', controllers.completeRecognition);
  router.register('POST', '/api/v1/recognitions/decision', controllers.recordRecognitionDecision);
  router.register('POST', '/api/v1/matches/:id/final-report', controllers.finalizeMatchReport);
  router.register('POST', '/api/v1/matches/:id/report-draft', controllers.saveReportDraft);
  router.register('GET', '/api/v1/match-reports', controllers.getMatchReportByMatch);
  router.register('GET', '/api/v1/match-reports/:id', controllers.getMatchReport);
  router.register('POST', '/api/v1/match-reports', controllers.createMatchReport);
  router.register('PATCH', '/api/v1/match-reports/:id', controllers.updateMatchReport);
  router.register('POST', '/api/v1/match-reports/:id/submit', controllers.submitMatchReport);
  router.register('GET', '/api/v1/audit/by-match', controllers.listAuditByMatch);
  router.register('GET', '/api/v1/audit/by-action', controllers.listAuditByAction);
  router.register('GET', '/api/v1/photos', controllers.listPhotos);
  router.register('GET', '/api/v1/photos/subjects', controllers.listPhotoSubjects);
  router.register('GET', '/api/v1/photos/audit', controllers.listPhotoAuditEvents);
  router.register('GET', '/api/v1/players/:id/photo', controllers.getPlayerPhoto);
  router.register('GET', '/api/v1/referees/:id/photo', controllers.arch1DefinedEndpoint);
  router.register('GET', '/api/v1/staff-members/:id/photo', controllers.getStaffMemberPhoto);
  router.register('GET', '/api/v1/photos/:id', controllers.arch1DefinedEndpoint);
  router.register('GET', '/api/v1/photos/:id/versions', controllers.arch1DefinedEndpoint);
  router.register('POST', '/api/v1/players/:id/photo-requests', controllers.arch1DefinedEndpoint);
  router.register(
    'POST',
    '/api/v1/staff-members/:id/photo-requests',
    controllers.arch1DefinedEndpoint,
  );
  router.register('GET', '/api/v1/photo-requests/:id', controllers.arch1DefinedEndpoint);
  router.register('DELETE', '/api/v1/photo-requests/:id', controllers.arch1DefinedEndpoint);
  router.register(
    'GET',
    '/api/v1/registrations/:id/season-photo',
    controllers.getRegistrationSeasonPhoto,
  );
  router.register('POST', '/api/v1/photos/upload-intent', controllers.createPhotoUploadIntent);
  router.register('POST', '/api/v1/photos/uploads/:id/complete', controllers.completePhotoUpload);
  router.register('GET', '/api/v1/photos/versions/:id', async (request) => ({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: await container.repositories.photoVersions.findById(request.params.id as never),
  }));
  router.register('GET', '/api/v1/photos/versions/:id/content', async (request): Promise<ApiResponse> => {
    const version = await container.repositories.photoVersions.findById(request.params.id as never);
    if (version === null) {
      return {
        status: 404,
        headers: { 'content-type': 'application/json' },
        body: { error: 'PHOTO_VERSION_NOT_FOUND', message: 'Photo version not found.' },
      };
    }

    const rendition = request.query.rendition === 'original' ? 'original' : request.query.rendition === 'thumb_320' ? 'thumb_320' : 'normalized';
    let objectKey =
      rendition === 'original'
        ? version.storageOriginalKey
        : (version.storageNormalizedKey ?? version.storageOriginalKey);
    if (rendition === 'thumb_320') objectKey = await ensurePhotoThumbnail(container.objectStores.photos, version.storageOriginalKey);

    if (cloudEnabled()) {
      const signed = await container.objectStores.photos.createSignedReadUrl({ objectKey, rendition,
        ttlSeconds: 60, correlationId: request.correlationId ?? crypto.randomUUID() });
      return { status: 302, headers: { location: signed.url, 'cache-control': 'private, no-store' }, body: '' };
    }
    let bytes: Buffer | undefined;
    try {
      bytes = await container.objectStores.photos.readObject?.(objectKey);
    } catch {
      return {
        status: 404,
        headers: { 'content-type': 'application/json' },
        body: { error: 'PHOTO_CONTENT_NOT_FOUND', message: 'Photo content not found.' },
      };
    }
    if (bytes === undefined) {
      return {
        status: 501,
        headers: { 'content-type': 'application/json' },
        body: {
          error: 'PHOTO_CONTENT_UNAVAILABLE',
          message: 'Photo content streaming is unavailable.',
        },
      };
    }

    const contentType =
      rendition === 'original'
        ? version.mimeType
        : rendition === 'thumb_320' ? 'image/webp' : (version.normalizedMimeType ?? version.mimeType ?? 'application/octet-stream');

    return {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'private, no-store',
        'content-length': String(bytes.byteLength),
      },
      body: bytes,
    };
  });
  router.register('GET', '/api/v1/photo-approvals', controllers.listPhotoApprovals);
  router.register('GET', '/api/v1/photo-approvals/page', (request) => photoApprovalQueue(container, request));
  router.register('GET', '/api/v1/photo-approvals/summary', (request) => photoApprovalQueue(container, request, true));
  router.register('GET', '/api/v1/photo-approvals/:id', controllers.getPhotoApproval);
  router.register('POST', '/api/v1/photo-approvals/:id/approve', controllers.approvePhotoApproval);
  router.register('POST', '/api/v1/photo-approvals/:id/reject', controllers.rejectPhotoApproval);
  router.register(
    'GET',
    '/api/v1/match-sheets/:id/photo-snapshots',
    controllers.listMatchSheetPhotoSnapshots,
  );
  router.register('GET', '/api/v1/matches/:id/photo-manifest', controllers.getMatchPhotoManifest);
  router.register('GET', '/api/v1/photos/sync-manifest', controllers.arch1DefinedEndpoint);
  router.register('POST', '/api/v1/photos/sync-ack', controllers.arch1DefinedEndpoint);
  router.register('GET', '/api/v1/photos/changes', controllers.arch1DefinedEndpoint);
  router.register(
    'POST',
    '/api/v1/photos/versions/:id/quarantine',
    controllers.arch1DefinedEndpoint,
  );
  router.register('POST', '/api/v1/photos/versions/:id/restore', controllers.arch1DefinedEndpoint);
  router.register('POST', '/api/v1/photos/versions/:id/archive', controllers.arch1DefinedEndpoint);
  router.register('DELETE', '/api/v1/photos/versions/:id', controllers.arch1DefinedEndpoint);
  router.register('GET', '/api/v1/identity-documents', controllers.listIdentityDocuments);

  return router;
}

class RejectedResponse extends Error {
  constructor(readonly response: import('./http.js').ApiResponse) { super('Request rejected'); }
}
