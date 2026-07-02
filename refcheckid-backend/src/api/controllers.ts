import type { ApplicationContainer } from '../config/application-container.js';
import type { MatchStatus } from '../domain/index.js';
import type { ApiHandler } from './http.js';
import { json } from './http.js';
import { optionalString, requireBodyObject, requireString, requireUuid } from './validation.js';

export function createControllers(container: ApplicationContainer): Record<string, ApiHandler> {
  return {
    health: () => json(200, { status: 'ok' }),
    openApi: () => json(200, containerOpenApiPlaceholder),
    swagger: () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: swaggerHtml }),

    listFederations: async () => json(200, await container.repositories.federations.list()),
    getFederation: async (request) =>
      json(
        200,
        await container.repositories.federations.findById(requireUuid(request.params.id, 'id')),
      ),
    listClubs: async () => json(200, await container.repositories.clubs.list()),
    getClub: async (request) =>
      json(200, await container.repositories.clubs.findById(requireUuid(request.params.id, 'id'))),
    listPlayers: async () => json(200, await container.repositories.players.list()),
    getPlayer: async (request) =>
      json(
        200,
        await container.repositories.players.findById(requireUuid(request.params.id, 'id')),
      ),
    listReferees: async () => json(200, await container.repositories.referees.list()),
    getReferee: async (request) =>
      json(
        200,
        await container.repositories.referees.findById(requireUuid(request.params.id, 'id')),
      ),
    listPlayerRegistrations: async () =>
      json(200, await container.repositories.registrations.list()),
    getPlayerRegistration: async (request) =>
      json(
        200,
        await container.repositories.registrations.findById(requireUuid(request.params.id, 'id')),
      ),
    listStaffMembers: async () =>
      json(200, await container.repositories.registrations.listStaffMembers()),
    listStaffRegistrations: async (request) =>
      json(
        200,
        request.query.clubId === undefined
          ? []
          : await container.repositories.registrations.listStaffRegistrationsByClub(
              requireUuid(request.query.clubId, 'clubId'),
            ),
      ),
    listPhotos: async () => json(200, await container.repositories.photos.list()),
    listIdentityDocuments: () => json(200, []),

    syncFederation: async (request) =>
      json(202, await container.services.federationSync.syncAll(requireBodyObject(request.body))),

    listMatches: async (request) => {
      if (request.query.federationId !== undefined) {
        return json(
          200,
          await container.services.matches.listMatchesByFederation(
            requireUuid(request.query.federationId, 'federationId'),
          ),
        );
      }
      if (request.query.clubId !== undefined) {
        return json(
          200,
          await container.services.matches.listMatchesByClub(
            requireUuid(request.query.clubId, 'clubId'),
          ),
        );
      }
      if (request.query.refereeId !== undefined) {
        return json(
          200,
          await container.services.matches.listMatchesByReferee(
            requireUuid(request.query.refereeId, 'refereeId'),
          ),
        );
      }
      return json(200, await container.repositories.matches.list());
    },
    getMatch: async (request) =>
      json(
        200,
        await container.services.matches.getMatchById(requireUuid(request.params.id, 'id')),
      ),
    transitionMatch: async (request) => {
      const body = requireBodyObject(request.body);
      const status = requireString(body.status, 'status') as MatchStatus;
      return json(
        200,
        await container.services.matches.transitionMatchStatus(
          requireUuid(request.params.id, 'id'),
          status,
        ),
      );
    },

    listMatchSheets: async (request) => {
      if (request.query.matchId !== undefined) {
        return json(
          200,
          await container.services.matchSheets.listMatchSheetsByMatch(
            requireUuid(request.query.matchId, 'matchId'),
          ),
        );
      }
      if (request.query.clubId !== undefined) {
        return json(
          200,
          await container.services.matchSheets.listMatchSheetsByClub(
            requireUuid(request.query.clubId, 'clubId'),
          ),
        );
      }
      return json(200, await container.repositories.matchSheets.list());
    },
    getMatchSheet: async (request) =>
      json(
        200,
        await container.services.matchSheets.getMatchSheetById(
          requireUuid(request.params.id, 'id'),
        ),
      ),
    submitMatchSheet: async (request) =>
      json(
        200,
        await container.services.matchSheets.submitMatchSheet(requireUuid(request.params.id, 'id')),
      ),
    lockMatchSheet: async (request) =>
      json(
        200,
        await container.services.matchSheets.lockMatchSheet(requireUuid(request.params.id, 'id')),
      ),
    resetSmokeMatchSheet: async (request) =>
      json(
        200,
        await container.services.matchSheets.resetSmokeMatchSheet(
          requireUuid(request.params.id, 'id'),
        ),
      ),

    listRecognitions: async (request) =>
      json(
        200,
        await container.services.recognitions.listRecognitionsByMatch(
          requireUuid(request.query.matchId, 'matchId'),
        ),
      ),
    getRecognition: async (request) =>
      json(
        200,
        await container.services.recognitions.getRecognitionById(
          requireUuid(request.params.id, 'id'),
        ),
      ),
    startRecognition: async (request) =>
      json(
        200,
        await container.services.recognitions.startRecognition(
          requireUuid(requireBodyObject(request.body).matchId as string | undefined, 'matchId'),
        ),
      ),
    completeRecognition: async (request) =>
      json(
        200,
        await container.services.recognitions.completeRecognition(
          requireUuid(requireBodyObject(request.body).matchId as string | undefined, 'matchId'),
        ),
      ),

    getMatchReport: async (request) =>
      json(
        200,
        await container.services.matchReports.getMatchReportById(
          requireUuid(request.params.id, 'id'),
        ),
      ),
    getMatchReportByMatch: async (request) =>
      json(
        200,
        await container.services.matchReports.getMatchReportByMatch(
          requireUuid(request.query.matchId, 'matchId'),
        ),
      ),
    createMatchReport: async (request) => {
      const body = requireBodyObject(request.body);
      return json(
        201,
        await container.services.matchReports.createMatchReport({
          matchId: requireUuid(body.matchId as string | undefined, 'matchId'),
          refereeId: requireUuid(body.refereeId as string | undefined, 'refereeId'),
          summary: optionalString(body.summary, 'summary'),
        }),
      );
    },
    updateMatchReport: async (request) => {
      const body = requireBodyObject(request.body);
      return json(
        200,
        await container.services.matchReports.updateMatchReport(
          requireUuid(request.params.id, 'id'),
          { summary: optionalString(body.summary, 'summary') },
        ),
      );
    },
    submitMatchReport: async (request) =>
      json(
        200,
        await container.services.matchReports.submitMatchReport(
          requireUuid(request.params.id, 'id'),
        ),
      ),

    listAuditByMatch: async (request) =>
      json(
        200,
        await container.services.audit.listAuditByMatch(
          requireUuid(request.query.matchId, 'matchId'),
        ),
      ),
    listAuditByAction: async (request) =>
      json(
        200,
        await container.services.audit.listAuditByAction(
          requireString(request.query.action, 'action'),
        ),
      ),
  };
}

const containerOpenApiPlaceholder = {
  message: 'Use createOpenApiDocument() for the complete OpenAPI document.',
};
const swaggerHtml =
  '<!doctype html><html><body><redoc spec-url="/api/docs/openapi.json"></redoc></body></html>';
