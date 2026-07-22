import type { ApplicationContainer } from '../config/application-container.js';
import type {
  FederationImportStatus,
  FederationImportType,
  MatchSheet,
  MatchStatus,
  PhotoApproval,
} from '../domain/index.js';
import type { ApiHandler } from './http.js';
import { json } from './http.js';
import { optionalString, requireBodyObject, requireString, requireUuid } from './validation.js';

export function createControllers(container: ApplicationContainer): Record<string, ApiHandler> {
  return {
    health: () => json(200, { status: 'ok' }),
    openApi: () => json(200, containerOpenApiPlaceholder),
    swagger: () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: swaggerHtml }),
    arch1DefinedEndpoint: () =>
      json(501, {
        error: 'ARCH1_DEFINED_NOT_IMPLEMENTED',
        message: 'Endpoint defined by ARCH-1 but not implemented in this Recovery.',
      }),

    listFederations: async () => json(200, await container.repositories.federations.list()),
    getFederation: async (request) =>
      json(
        200,
        await container.repositories.federations.findById(requireUuid(request.params.id, 'id')),
      ),
    createFederationImport: async (request) => {
      const body = requireBodyObject(request.body);
      const federationId = requireUuid(String(body.federationId), 'federationId');
      const context = federationImportContext(request);
      if (!canAccessFederationImport(context, federationId)) {
        return json(403, { error: 'FORBIDDEN', message: 'Federation imports require federation/admin scope.' });
      }
      const sourceSystem = optionalString(body.sourceSystem, 'sourceSystem');
      return json(
        202,
        {
          importBatch: await container.services.federationImports.createBatch({
            federationId,
            importType: requireFederationImportType(body.importType),
            originalFilename: requireString(body.originalFilename, 'originalFilename'),
            mimeType: requireString(body.mimeType, 'mimeType'),
            fileSizeBytes: Number(body.fileSizeBytes ?? 0),
            sha256: requireString(body.sha256, 'sha256'),
            ...(sourceSystem === null ? {} : { sourceSystem }),
            context,
          }),
        },
      );
    },
    listFederationImports: async (request) => {
      const filter = {
        ...(request.query.federationId === undefined
          ? {}
          : { federationId: requireUuid(request.query.federationId, 'federationId') }),
        ...(request.query.importType === undefined
          ? {}
          : { importType: requireFederationImportType(request.query.importType) }),
        ...(request.query.status === undefined
          ? {}
          : { status: requireFederationImportStatus(request.query.status) }),
      };
      const context = federationImportContext(request);
      if (!canAccessFederationImport(context, filter.federationId)) {
        return json(403, { error: 'FORBIDDEN', message: 'Federation imports require federation/admin scope.' });
      }
      return json(
        200,
        paginate(
          await container.services.federationImports.listBatches(
            context,
            filter,
          ),
          request.query,
        ),
      );
    },
    getFederationImport: async (request) => {
      const context = federationImportContext(request);
      if (!canAccessFederationImport(context)) {
        return json(403, { error: 'FORBIDDEN', message: 'Federation imports require federation/admin scope.' });
      }
      const batch = await container.services.federationImports.getBatch(
        context,
        requireUuid(request.params.id, 'id'),
      );
      return batch === null
        ? json(404, { error: 'FEDERATION_IMPORT_NOT_FOUND' })
        : json(200, batch);
    },
    listFederationImportRows: async (request) =>
      {
        const context = federationImportContext(request);
        if (!canAccessFederationImport(context)) {
          return json(403, { error: 'FORBIDDEN', message: 'Federation imports require federation/admin scope.' });
        }
        return json(
          200,
          paginate(
            await container.services.federationImports.listRows(
              context,
              requireUuid(request.params.id, 'id'),
              {},
            ),
            request.query,
          ),
        );
      },
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
    listPlayerRegistrations: async (request) =>
      json(
        200,
        request.query.clubId === undefined
          ? await container.repositories.registrations.list()
          : await container.repositories.registrations.listByClub(
              requireUuid(request.query.clubId, 'clubId'),
            ),
      ),
    getPlayerRegistration: async (request) =>
      json(
        200,
        await container.repositories.registrations.findById(requireUuid(request.params.id, 'id')),
      ),
    listStaffMembers: async () => json(200, await container.repositories.registrations.listStaffMembers()),
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
    listPhotoSubjects: async () => json(200, await container.services.photos.listPhotoSubjects()),
    getPlayerPhoto: async (request) => {
      const subject = (await container.repositories.photoSubjects.list()).find(
        (row) =>
          row.subjectKind === 'athlete' &&
          row.canonicalPersonId === requireUuid(request.params.id, 'id'),
      );
      if (!subject) return json(404, { error: 'PHOTO_NOT_FOUND' });
      const global = await container.repositories.globalOfficialPhotos.findBySubject(subject.id);
      if (!global?.currentVersionId) return json(404, { error: 'PHOTO_NOT_FOUND' });
      const read = await container.services.photos.createSignedReadUrl(
        global.currentVersionId,
        photoContext(request, request.query),
        {
          rendition: request.query.rendition as never,
          ttlSeconds: Number(request.query.ttlSeconds ?? 300),
        },
      );
      return json(200, withBrowserPhotoContentUrl(read));
    },
    getStaffMemberPhoto: async (request) => {
      const subject = (await container.repositories.photoSubjects.list()).find(
        (row) =>
          row.subjectKind === 'staff_member' &&
          row.canonicalPersonId === requireUuid(request.params.id, 'id'),
      );
      if (!subject) return json(404, { error: 'PHOTO_NOT_FOUND' });
      const global = await container.repositories.globalOfficialPhotos.findBySubject(subject.id);
      if (!global?.currentVersionId) return json(404, { error: 'PHOTO_NOT_FOUND' });
      const read = await container.services.photos.createSignedReadUrl(
        global.currentVersionId,
        photoContext(request, request.query),
        {
          rendition: request.query.rendition as never,
          ttlSeconds: Number(request.query.ttlSeconds ?? 300),
        },
      );
      return json(200, withBrowserPhotoContentUrl(read));
    },
    getRegistrationSeasonPhoto: async (request) => {
      const registrationId = requireUuid(request.params.id, 'id');
      const photo = (await container.repositories.seasonRegistrationPhotos.list()).find(
        (row) => row.registrationId === registrationId,
      );
      const pendingApproval = await findLatestPendingPhotoApproval(container, registrationId);
      const pendingPhoto =
        pendingApproval === null
          ? {}
          : {
              approvalId: pendingApproval.id,
              proposedPhotoUrl: photoVersionContentUrl(pendingApproval.photoVersionId),
              proposedVersionId: pendingApproval.photoVersionId,
              status: 'pending',
            };
      if (!photo) {
        return pendingApproval === null
          ? json(404, { error: 'PHOTO_NOT_FOUND' })
          : json(200, pendingPhoto);
      }
      const read = await container.services.photos.createSignedReadUrl(
        photo.effectiveVersionId,
        photoContext(request, {
          ...request.query,
          registrationClubId: await findRegistrationClubId(container, photo.registrationId),
        }),
        {
          rendition: request.query.rendition as never,
          ttlSeconds: Number(request.query.ttlSeconds ?? 300),
        },
      );
      return json(200, {
        ...withBrowserPhotoContentUrl(read),
        status: pendingApproval === null ? photo.status : 'pending',
        ...pendingPhoto,
      });
    },
    createPhotoUploadIntent: async (request) => {
      const body = requireBodyObject(request.body);
      const registrationId = requireUuid(String(body.registrationId), 'registrationId');
      const registrationClubId = await findRegistrationClubId(container, registrationId);
      const subjectKind = normalizeSubjectKind(body.subjectKind);
      const legacyPlayerId = optionalString(body.playerId, 'playerId');
      const legacyStaffMemberId = optionalString(body.staffMemberId, 'staffMemberId');
      const subjectId =
        optionalString(body.subjectId, 'subjectId') ?? legacyPlayerId ?? legacyStaffMemberId;
      const resolvedSubjectKind =
        subjectKind ??
        (legacyStaffMemberId !== null
          ? 'staff_member'
          : legacyPlayerId !== null
            ? 'athlete'
            : undefined);
      const intent = await container.services.photos.createUploadIntent({
        ...(resolvedSubjectKind === undefined ? {} : { subjectKind: resolvedSubjectKind }),
        ...(subjectId === null ? {} : { subjectId: requireUuid(subjectId, 'subjectId') }),
        ...(legacyPlayerId === null ? {} : { playerId: requireUuid(legacyPlayerId, 'playerId') }),
        ...(legacyStaffMemberId === null
          ? {}
          : { staffMemberId: requireUuid(legacyStaffMemberId, 'staffMemberId') }),
        registrationId,
        federationId: requireUuid(String(body.federationId), 'federationId'),
        seasonId: requireString(body.seasonId, 'seasonId'),
        mimeType: requireString(body.mimeType, 'mimeType'),
        fileSizeBytes: Number(body.fileSizeBytes ?? 0),
        sha256: requireString(body.sha256, 'sha256'),
        context: photoContext(request, { registrationClubId }),
      });
      return json(202, { intent });
    },
    completePhotoUpload: async (request) => {
      const body = requireBodyObject(request.body);
      const command = {
        uploadId: requireUuid(request.params.id, 'id'),
        objectKey: requireString(body.objectKey, 'objectKey'),
        context: photoContext(request, {}),
      } as import('../services/photo-service.js').CompleteUploadCommand;
      const contentBase64 = optionalString(body.contentBase64, 'contentBase64');
      return json(
        200,
        await container.services.photos.completeUpload(
          contentBase64 === null ? command : { ...command, contentBase64 },
        ),
      );
    },
    listPhotoApprovals: async (request) => {
      const context = photoContext(request, request.query);
      const federationId =
        context.actorRole === 'federation'
          ? context.federationId
          : request.query.federationId === undefined
            ? undefined
            : requireUuid(request.query.federationId, 'federationId');
      if (context.actorRole === 'manager' || context.actorRole === 'referee') {
        return json(403, { error: 'FORBIDDEN', message: 'Photo approvals require federation scope.' });
      }
      const approvals =
        federationId === undefined
          ? await container.repositories.photoApprovals.list()
          : await container.services.photos.listApprovalsByFederation(federationId);
      const enrichedApprovals = await Promise.all(
        approvals.map((approval) => enrichPhotoApproval(container, approval)),
      );
      return json(
        200,
        paginate(
          enrichedApprovals
          .filter((approval) =>
            request.query.status === undefined ? true : approval.status === request.query.status,
          )
          .filter((approval) =>
            request.query.seasonId === undefined
              ? true
              : approval.seasonId === request.query.seasonId,
          )
          .filter((approval) =>
            request.query.registrationId === undefined
              ? true
              : approval.registrationId === request.query.registrationId,
          )
          .filter((approval) =>
            request.query.requestedFrom === undefined
              ? true
              : approval.requestedAt >= request.query.requestedFrom,
          )
          .filter((approval) =>
            request.query.requestedTo === undefined
              ? true
              : approval.requestedAt <= request.query.requestedTo,
          )
          .filter((approval) =>
            request.query.clubId === undefined ? true : approval.clubId === request.query.clubId,
          )
          .filter((approval) =>
            request.query.sla === undefined
              ? true
              : request.query.sla === 'overdue'
                ? approval.slaStatus === 'overdue'
                : approval.slaStatus === request.query.sla,
          )
          .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt)),
          request.query,
        ),
      );
    },
    getPhotoApproval: async (request) => {
      const approval = await container.repositories.photoApprovals.findById(
        requireUuid(request.params.id, 'id'),
      );
      if (approval === null) return json(404, { error: 'PHOTO_APPROVAL_NOT_FOUND' });
      const context = photoContext(request, {});
      if (
        context.actorRole !== 'admin' &&
        !(context.actorRole === 'federation' && context.federationId === approval.federationId)
      ) {
        return json(403, { error: 'FORBIDDEN', message: 'Photo approval is outside scope.' });
      }
      await container.services.photos.auditVersionViewedForApproval(context, approval);
      return json(200, await enrichPhotoApproval(container, approval));
    },
    approvePhotoApproval: async (request) => {
      const body = request.body === undefined ? {} : requireBodyObject(request.body);
      return json(
        200,
        await container.services.photos.approvePhotoApproval({
          approvalId: requireUuid(request.params.id, 'id'),
          context: photoContext(request, {}),
          reasonCode: optionalString(body.reasonCode, 'reasonCode') ?? undefined,
          notes: optionalString(body.notes, 'notes') ?? undefined,
        }),
      );
    },
    rejectPhotoApproval: async (request) => {
      const body = requireBodyObject(request.body);
      return json(
        200,
        await container.services.photos.rejectPhotoApproval({
          approvalId: requireUuid(request.params.id, 'id'),
          context: photoContext(request, {}),
          reasonCode: requireFederationRejectReasonCode(body.reasonCode),
          notes: optionalString(body.notes, 'notes') ?? undefined,
        }),
      );
    },
    listMatchSheetPhotoSnapshots: async (request) =>
      json(
        200,
        await container.repositories.matchSheetPhotoSnapshots.listByMatchSheet(
          requireUuid(request.params.id, 'id'),
        ),
      ),
    getMatchPhotoManifest: async (request) => {
      const matchId = requireUuid(request.params.id, 'id');
      const sheets = await container.services.matchSheets.listMatchSheetsByMatch(matchId);
      const snapshotRows = (
        await Promise.all(
          sheets.map((sheet) =>
            container.repositories.matchSheetPhotoSnapshots.listByMatchSheet(sheet.id),
          ),
        )
      ).flat();
      const frozen = snapshotRows.length > 0;
      const subjects = await Promise.all(
        snapshotRows.map(async (snapshot) => {
          const context = photoContext(request, { matchId });
          if (snapshot.photoVersionId !== null) {
            await container.services.photos.createSignedReadUrl(snapshot.photoVersionId, context, {
              rendition: 'normalized',
              ttlSeconds: 900,
            });
          }
          await container.services.photos.auditSnapshotServed(context, snapshot);
          const manifest = snapshot.renditionManifest;
          return {
            id: snapshot.registrationId,
            firstName: typeof manifest.firstName === 'string' ? manifest.firstName : 'Tesserato',
            lastName:
              typeof manifest.lastName === 'string' ? manifest.lastName : snapshot.registrationId,
            shirtNumber: typeof manifest.shirtNumber === 'number' ? manifest.shirtNumber : null,
            teamName: typeof manifest.teamName === 'string' ? manifest.teamName : 'Distinta gara',
            roleLabel: typeof manifest.roleLabel === 'string' ? manifest.roleLabel : 'Tesserato',
            subjectKind: manifest.subjectKind === 'staff' ? 'staff' : 'player',
            photoUrl:
              snapshot.photoVersionId === null
                ? null
                : photoVersionContentUrl(snapshot.photoVersionId),
            photoStatus: snapshot.photoStatus,
            photoEtag: snapshot.photoEtag ?? `snapshot:${snapshot.registrationId}:${snapshot.photoStatus}`,
            manifestSource: 'frozen_snapshot',
            isFrozenSnapshot: true,
            document: {
              type:
                typeof manifest.documentType === 'string'
                  ? manifest.documentType
                  : 'Documento tesserato',
              number: snapshot.registrationId,
              expiresAt: snapshot.frozenAt,
            },
          };
        }),
      );
      const photoEtag =
        snapshotRows.map((snapshot) => snapshot.photoEtag).join('|') || `manifest:${matchId}:empty`;
      await container.services.photos.auditManifestGenerated(
        photoContext(request, { matchId }),
        matchId,
        subjects.length,
      );
      return json(200, {
        matchId,
        manifestVersion: frozen ? 'frozen-v1' : 'live-v1',
        photoEtag,
        generatedAt: new Date().toISOString(),
        expiresAt: null,
        status: sheets.length === 0 ? 'unavailable' : 'available',
        subjects,
      });
    },
    listPhotoAuditEvents: async (request) => {
      const context = photoContext(request, request.query);
      const events = await container.repositories.photoAuditEvents.list();
      const scoped = [];
      for (const event of events) {
        if (
          request.query.subjectId !== undefined &&
          event.photoSubjectId !== request.query.subjectId
        )
          continue;
        if (
          request.query.registrationId !== undefined &&
          event.registrationId !== request.query.registrationId
        )
          continue;
        if (context.actorRole === 'admin') {
          scoped.push(event);
          continue;
        }
        if (context.actorRole === 'federation' && event.federationId === context.federationId) {
          scoped.push(event);
          continue;
        }
        if (context.actorRole === 'manager' && event.registrationId !== null) {
          const clubId = await findRegistrationClubId(container, event.registrationId);
          if (clubId !== undefined && context.clubIds?.includes(clubId)) scoped.push(event);
        }
      }
      return json(200, scoped);
    },
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
          await enrichMatchSheetsForReferee(
            container,
            await container.services.matchSheets.listMatchSheetsByMatch(
              requireUuid(request.query.matchId, 'matchId'),
            ),
          ),
        );
      }
      if (request.query.clubId !== undefined) {
        return json(
          200,
          await enrichMatchSheetsForReferee(
            container,
            await container.services.matchSheets.listMatchSheetsByClub(
              requireUuid(request.query.clubId, 'clubId'),
            ),
          ),
        );
      }
      return json(
        200,
        await enrichMatchSheetsForReferee(
          container,
          await container.repositories.matchSheets.list(),
        ),
      );
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
        await container.services.matchSheets.submitMatchSheet(
          requireUuid(request.params.id, 'id'),
          parseMatchSheetLineup(request.body),
        ),
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

function normalizeSubjectKind(value: unknown): 'athlete' | 'staff_member' | 'referee' | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === 'athlete' || value === 'staff_member' || value === 'referee') return value;
  if (value === 'player') return 'athlete';
  if (value === 'staff') return 'staff_member';
  throw new Error(`Invalid subjectKind: ${String(value)}`);
}

function parseMatchSheetLineup(body: unknown) {
  if (body === undefined || body === null) return {};
  const parsed = requireBodyObject(body);
  const lineup: {
    players?: {
      playerRegistrationId: string;
      shirtNumber: number | null;
      role: string;
    }[];
    staff?: {
      staffRegistrationId: string;
      role: string;
    }[];
  } = {};
  if (Array.isArray(parsed.players)) {
    lineup.players = parsed.players.map((player) => {
        const row = requireBodyObject(player);
        return {
          playerRegistrationId: requireUuid(
            row.playerRegistrationId as string | undefined,
            'playerRegistrationId',
          ),
          shirtNumber:
            row.shirtNumber === null || row.shirtNumber === undefined
              ? null
              : Number(row.shirtNumber),
          role: requireString(row.role, 'role'),
        };
      });
  }
  if (Array.isArray(parsed.staff)) {
    lineup.staff = parsed.staff.map((staffMember) => {
        const row = requireBodyObject(staffMember);
        return {
          staffRegistrationId: requireUuid(
            row.staffRegistrationId as string | undefined,
            'staffRegistrationId',
          ),
          role: requireString(row.role, 'role'),
        };
      });
  }
  return lineup;
}

const containerOpenApiPlaceholder = {
  message: 'Use createOpenApiDocument() for the complete OpenAPI document.',
};
const swaggerHtml =
  '<!doctype html><html><body><redoc spec-url="/api/docs/openapi.json"></redoc></body></html>';

async function enrichMatchSheetsForReferee(
  container: ApplicationContainer,
  sheets: readonly MatchSheet[],
) {
  return Promise.all(
    sheets.map(async (sheet) => ({
      ...sheet,
      playerCount: (await container.repositories.matchSheetPlayers.listByMatchSheet(sheet.id))
        .length,
      staffCount: (await container.repositories.matchSheetStaff.listByMatchSheet(sheet.id)).length,
    })),
  );
}

function photoContext(
  request: {
    auth?: {
      actorId: string;
      roles: readonly string[];
      clubIds?: readonly string[];
      federationIds?: readonly string[];
      authorizedMatchIds?: readonly string[];
    };
  },
  source: Record<string, unknown>,
) {
  const role = request.auth?.roles[0];
  if (role === undefined) {
    throw new Error('Authentication is required.');
  }
  const clubIds = request.auth?.clubIds ?? [];
  const federationIds = request.auth?.federationIds ?? [];
  const context: Record<string, unknown> = {
    actorRole: role as 'manager' | 'federation' | 'referee' | 'admin',
    actorId: request.auth?.actorId,
    clubIds,
    federationIds,
    authorizedMatchIds: request.auth?.authorizedMatchIds ?? [],
  };
  const clubId = clubIds[0];
  const federationId = federationIds[0];
  const registrationClubId = optionalString(source.registrationClubId, 'registrationClubId');
  const matchId = optionalString(source.matchId, 'matchId');
  if (clubId !== undefined) context.clubId = clubId;
  if (federationId !== undefined) context.federationId = federationId;
  if (registrationClubId !== null) context.registrationClubId = registrationClubId;
  if (matchId !== null) context.matchId = matchId;
  return context as unknown as import('../services/photo-service.js').PhotoAccessContext;
}

async function findLatestPendingPhotoApproval(
  container: ApplicationContainer,
  registrationId: string,
): Promise<PhotoApproval | null> {
  const approvals = await container.repositories.photoApprovals.listPendingByRegistration(
    registrationId as never,
  );
  return [...approvals].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

async function findRegistrationClubId(
  container: ApplicationContainer,
  registrationId: string,
): Promise<string | undefined> {
  const player = await container.repositories.registrations.findPlayerRegistrationById(
    registrationId as never,
  );
  if (player !== null) return player.clubId;
  const staff = await container.repositories.registrations.findStaffRegistrationById(
    registrationId as never,
  );
  return staff?.clubId;
}

async function enrichPhotoApproval(
  container: ApplicationContainer,
  approval: PhotoApproval,
) {
  const registration =
    approval.registrationId === null
      ? null
      : await container.repositories.registrations.findPlayerRegistrationById(
          approval.registrationId as never,
        );
  const staffRegistration =
    approval.registrationId === null || registration !== null
      ? null
      : await container.repositories.registrations.findStaffRegistrationById(
          approval.registrationId as never,
        );
  const clubId = registration?.clubId ?? staffRegistration?.clubId ?? null;
  const club = clubId === null ? null : await container.repositories.clubs.findById(clubId);
  const player =
    registration === null
      ? null
      : await container.repositories.players.findById(registration.playerId);
  const staff =
    staffRegistration === null
      ? null
      : await container.repositories.registrations.findStaffMemberById(
          staffRegistration.staffMemberId,
        );
  const version = await container.repositories.photoVersions.findById(approval.photoVersionId);
  const global =
    version === null
      ? null
      : await container.repositories.globalOfficialPhotos.findById(version.globalOfficialPhotoId);
  const currentVersionId =
    global?.currentVersionId === approval.photoVersionId ? null : (global?.currentVersionId ?? null);
  const now = new Date().toISOString();
  const slaStatus =
    approval.status !== 'pending'
      ? 'closed'
      : approval.slaDueAt === null
        ? 'not_set'
        : approval.slaDueAt < now
          ? 'overdue'
          : 'on_track';
  return {
    ...approval,
    clubId,
    clubName: club?.name ?? null,
    subjectName:
      player !== null
        ? `${player.firstName} ${player.lastName}`
        : staff !== null
          ? `${staff.firstName} ${staff.lastName}`
          : null,
    subjectKind: player !== null ? 'athlete' : staff !== null ? 'staff_member' : null,
    currentVersionId,
    proposedVersionId: approval.photoVersionId,
    currentPhotoUrl:
      currentVersionId === null ? null : await createApprovalPreviewUrl(container, currentVersionId),
    proposedPhotoUrl: await createApprovalPreviewUrl(container, approval.photoVersionId),
    photoEtag: `photo:${approval.photoVersionId}:${approval.updatedAt}`,
    slaStatus,
  };
}

async function createApprovalPreviewUrl(container: ApplicationContainer, versionId: string) {
  const version = await container.repositories.photoVersions.findById(versionId as never);
  if (version === null) return null;
  return photoVersionContentUrl(versionId);
}

function photoVersionContentUrl(versionId: string): string {
  return `/api/v1/photos/versions/${versionId}/content?rendition=normalized`;
}

function withBrowserPhotoContentUrl<T extends {
  readonly signedUrl?: { readonly url?: string };
  readonly version?: { readonly id?: string };
}>(read: T): T {
  if (!read.version?.id) return read;
  return {
    ...read,
    signedUrl: {
      ...read.signedUrl,
      url: photoVersionContentUrl(read.version.id),
    },
  };
}

function requireFederationRejectReasonCode(value: unknown) {
  const reasonCode = requireString(value, 'reasonCode');
  const allowed = [
    'face_not_visible',
    'document_mismatch',
    'quality_issue',
    'duplicate_or_wrong_subject',
  ];
  if (!allowed.includes(reasonCode)) {
    throw new Error(`Invalid federation reject reasonCode: ${reasonCode}`);
  }
  return reasonCode;
}

function federationImportContext(request: Parameters<ApiHandler>[0]) {
  return {
    actorId: request.auth?.actorId ?? '00000000-0000-4000-8000-000000000000',
    roles: request.auth?.roles ?? [],
    federationIds: request.auth?.federationIds ?? [],
  };
}

function canAccessFederationImport(
  context: ReturnType<typeof federationImportContext>,
  federationId?: string,
): boolean {
  if (context.roles.includes('admin')) return true;
  if (!context.roles.includes('federation')) return false;
  if (federationId === undefined) return (context.federationIds?.length ?? 0) > 0;
  return context.federationIds?.includes(federationId) ?? false;
}

function requireFederationImportType(value: unknown): FederationImportType {
  const importType = requireString(value, 'importType');
  const allowed: readonly FederationImportType[] = [
    'clubs',
    'players_general',
    'players_by_club',
    'staff',
    'referees',
    'calendar',
    'designations',
  ];
  if (!allowed.includes(importType as FederationImportType)) {
    throw new Error(`Invalid federation importType: ${importType}`);
  }
  return importType as FederationImportType;
}

function requireFederationImportStatus(value: unknown): FederationImportStatus {
  const status = requireString(value, 'status');
  const allowed: readonly FederationImportStatus[] = [
    'uploaded',
    'parsed',
    'mapped',
    'validated',
    'ready_to_commit',
    'committed',
    'failed',
  ];
  if (!allowed.includes(status as FederationImportStatus)) {
    throw new Error(`Invalid federation import status: ${status}`);
  }
  return status as FederationImportStatus;
}

function paginate<T>(items: readonly T[], query: Record<string, unknown>): readonly T[] {
  const offset = query.offset === undefined ? 0 : Math.max(0, Number(query.offset));
  const limit = query.limit === undefined ? items.length : Math.max(0, Number(query.limit));
  return items.slice(offset, offset + limit);
}
