import type { ApplicationContainer } from '../config/application-container.js';
import { loginHandler, logoutHandler, meHandler, refreshHandler } from './auth.js';
import { createControllers } from './controllers.js';
import { ApiRouter } from './http.js';
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

export function createRestApiRouter(container: ApplicationContainer): ApiRouter {
  const router = new ApiRouter();
  const controllers = createControllers(container);

  router.use(errorHandlingMiddleware);
  router.use(requestIdMiddleware);
  router.use(correlationIdMiddleware);
  router.use(loggingMiddleware);
  router.use(authenticationMiddleware);
  router.use(authorizationMiddleware);

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
  router.register('GET', '/api/v1/federations', controllers.listFederations);
  router.register('GET', '/api/v1/federations/:id', controllers.getFederation);
  router.register('GET', '/api/v1/clubs', controllers.listClubs);
  router.register('GET', '/api/v1/clubs/:id', controllers.getClub);
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
  router.register('POST', '/api/v1/matches/:id/status', controllers.transitionMatch);
  router.register('GET', '/api/v1/match-sheets', controllers.listMatchSheets);
  router.register('GET', '/api/v1/match-sheets/:id', controllers.getMatchSheet);
  router.register('POST', '/api/v1/match-sheets/:id/submit', controllers.submitMatchSheet);
  router.register('POST', '/api/v1/match-sheets/:id/lock', controllers.lockMatchSheet);
  router.register('POST', '/api/v1/match-sheets/:id/reset-smoke', controllers.resetSmokeMatchSheet);
  router.register('GET', '/api/v1/recognitions', controllers.listRecognitions);
  router.register('GET', '/api/v1/recognitions/:id', controllers.getRecognition);
  router.register('POST', '/api/v1/recognitions/start', controllers.startRecognition);
  router.register('POST', '/api/v1/recognitions/complete', controllers.completeRecognition);
  router.register('GET', '/api/v1/match-reports', controllers.getMatchReportByMatch);
  router.register('GET', '/api/v1/match-reports/:id', controllers.getMatchReport);
  router.register('POST', '/api/v1/match-reports', controllers.createMatchReport);
  router.register('PATCH', '/api/v1/match-reports/:id', controllers.updateMatchReport);
  router.register('POST', '/api/v1/match-reports/:id/submit', controllers.submitMatchReport);
  router.register('GET', '/api/v1/audit/by-match', controllers.listAuditByMatch);
  router.register('GET', '/api/v1/audit/by-action', controllers.listAuditByAction);
  router.register('GET', '/api/v1/photos', controllers.listPhotos);
  router.register('GET', '/api/v1/photos/subjects', controllers.listPhotoSubjects);
  router.register('GET', '/api/v1/players/:id/photo', controllers.getPlayerPhoto);
  router.register('GET', '/api/v1/staff-members/:id/photo', controllers.getStaffMemberPhoto);
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
  router.register('GET', '/api/v1/photos/versions/:id/content', async (request) => ({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: await container.services.photos.createSignedReadUrl(
      request.params.id as never,
      { actorRole: 'admin', actorId: '00000000-0000-4000-8000-000000000099' },
      {
        rendition: request.query.rendition as never,
        ttlSeconds: Number(request.query.ttlSeconds ?? 300),
      },
    ),
  }));
  router.register('GET', '/api/v1/photo-approvals', controllers.listPhotoApprovals);
  router.register('GET', '/api/v1/photo-approvals/:id', controllers.getPhotoApproval);
  router.register('POST', '/api/v1/photo-approvals/:id/approve', controllers.approvePhotoApproval);
  router.register('POST', '/api/v1/photo-approvals/:id/reject', controllers.rejectPhotoApproval);
  router.register(
    'GET',
    '/api/v1/match-sheets/:id/photo-snapshots',
    controllers.listMatchSheetPhotoSnapshots,
  );
  router.register('GET', '/api/v1/matches/:id/photo-manifest', controllers.getMatchPhotoManifest);
  router.register('GET', '/api/v1/photos/audit', controllers.listPhotoAuditEvents);
  router.register('GET', '/api/v1/identity-documents', controllers.listIdentityDocuments);

  return router;
}
