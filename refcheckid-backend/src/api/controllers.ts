import { canReview } from '../platform/photo-scopes.js';
import { photoApprovalQueue } from './photo-approval-queue.js';
import { PlatformStore } from '../platform/store.js';
import type { Fixture,GameSummary } from '../platform/types.js';
import type { ApplicationContainer } from '../config/application-container.js';
import type {
  FederationImportStatus,
  FederationImportType,
  MatchSheet,
  Match,
  MatchStatus,
  PhotoApproval,
} from '../domain/index.js';
import type { ApiHandler } from './http.js';
import { json } from './http.js';
import { optionalString, requireBodyObject, requireString, requireUuid } from './validation.js';
import { signedPhotoContentUrl } from './photo-content-token.js';
import { validateFinalReport } from './report-validation.js';

export function createControllers(container: ApplicationContainer): Record<string, ApiHandler> {
  return {
    health: () => json(200, { status: 'ok' }),
    getMatchReadiness: async (request) => {
      const id = requireUuid(request.params.id, 'id');
      const match = await container.repositories.matches.findById(id);
      if (!match) return json(404, { error: 'MATCH_NOT_FOUND' });
      const sheets = await container.repositories.matchSheets.listByMatch(id);
      const coverage = await Promise.all(sheets.map(async (sheet) => {
        const expected = [
          ...(await container.repositories.matchSheetPlayers.listByMatchSheet(sheet.id)).map((row) => row.playerRegistrationId),
          ...(await container.repositories.matchSheetStaff.listByMatchSheet(sheet.id)).map((row) => row.staffRegistrationId),
        ];
        const snapshots = await container.repositories.matchSheetPhotoSnapshots.listByMatchSheet(sheet.id);
        const ids = new Set(snapshots.map((row) => row.registrationId));
        return { id: sheet.id, clubId: sheet.clubId, status: sheet.status, participants: expected.length,
          manifestComplete: expected.length > 0 && snapshots.length === expected.length && ids.size === expected.length && expected.every((key) => ids.has(key)) && snapshots.every((row) => row.matchId === id) };
      }));
      const workflow = await container.repositories.recognitions.getWorkflowByMatch(id);
      const report = await container.repositories.matchReports.findByMatch(id);
      const clubs = new Set(sheets.map((sheet) => sheet.clubId));
      return json(200, { matchId: id, status: match.status, sheets: coverage, recognitionStatus: workflow.status, reportStatus: report?.status ?? null,
        initialized: sheets.length === 2 && clubs.has(match.homeClubId) && clubs.has(match.awayClubId) && coverage.every((sheet) => sheet.status === 'locked' && sheet.manifestComplete) && workflow.status === 'locked' && match.status === 'completed' && report !== null });
    },
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
        return json(403, {
          error: 'FORBIDDEN',
          message: 'Federation imports require federation/admin scope.',
        });
      }
      const sourceSystem = optionalString(body.sourceSystem, 'sourceSystem');
      return json(202, {
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
      });
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
        return json(403, {
          error: 'FORBIDDEN',
          message: 'Federation imports require federation/admin scope.',
        });
      }
      return json(
        200,
        paginate(
          await container.services.federationImports.listBatches(context, filter),
          request.query,
        ),
      );
    },
    parseFederationImport: async (request) => {
      const context = federationImportContext(request);
      if (!canAccessFederationImport(context)) {
        return json(403, {
          error: 'FORBIDDEN',
          message: 'Federation imports require federation/admin scope.',
        });
      }
      const body = requireBodyObject(request.body);
      return json(
        200,
        await container.services.federationImports.parseBatch({
          batchId: requireUuid(request.params.id, 'id'),
          csvContent: requireString(body.csvContent, 'csvContent'),
          context,
        }),
      );
    },
    validateFederationImport: async (request) => {
      const context = federationImportContext(request);
      if (!canAccessFederationImport(context)) {
        return json(403, {
          error: 'FORBIDDEN',
          message: 'Federation imports require federation/admin scope.',
        });
      }
      return json(
        200,
        await container.services.federationImports.validateBatch({
          batchId: requireUuid(request.params.id, 'id'),
          context,
        }),
      );
    },
    commitFederationImport: async (request) => {
      const context = federationImportContext(request);
      if (!canAccessFederationImport(context)) {
        return json(403, {
          error: 'FORBIDDEN',
          message: 'Federation imports require federation/admin scope.',
        });
      }
      return json(
        200,
        await container.services.federationImports.commitBatch({
          batchId: requireUuid(request.params.id, 'id'),
          context,
        }),
      );
    },
    getFederationImport: async (request) => {
      const context = federationImportContext(request);
      if (!canAccessFederationImport(context)) {
        return json(403, {
          error: 'FORBIDDEN',
          message: 'Federation imports require federation/admin scope.',
        });
      }
      const batch = await container.services.federationImports.getBatch(
        context,
        requireUuid(request.params.id, 'id'),
      );
      return batch === null
        ? json(404, { error: 'FEDERATION_IMPORT_NOT_FOUND' })
        : json(200, batch);
    },
    listFederationImportRows: async (request) => {
      const context = federationImportContext(request);
      if (!canAccessFederationImport(context)) {
        return json(403, {
          error: 'FORBIDDEN',
          message: 'Federation imports require federation/admin scope.',
        });
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
      const playerRegistration=await container.repositories.registrations.findById(registrationId);
      const staffRegistration=playerRegistration?null:await container.repositories.registrations.findStaffRegistrationById(registrationId);
      const registration=playerRegistration??staffRegistration;
      const club=registration?await container.repositories.clubs.findById(registration.clubId):null;
      const expectedSubject=playerRegistration?.playerId??staffRegistration?.staffMemberId;
      if(!request.auth?.roles.includes('admin')&&(!registration||!club||registration.deletedAt!==null||registration.status!=='active'||subjectId!==expectedSubject||resolvedSubjectKind!==(playerRegistration?'athlete':'staff_member')||body.federationId!==club.federationId||body.seasonId!==registration.season))return json(400,{error:'PHOTO_SUBJECT_MISMATCH',message:'La foto deve corrispondere al tesserato, alla società, alla stagione e alla federazione del tesseramento attivo.'});
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
      return json(202, { intent: { ...intent, uploadUrl: {
        url: intent.uploadUrl, method: intent.method,
        headers: { 'content-type': String(body.mimeType) },
      } } });
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
      if(context.actorRole==='federation'&&!context.federationId){const page=await photoApprovalQueue(container,request);return page.status===200?json(200,(page.body as {items:unknown[]}).items):page;}
      const federationId =
        context.actorRole === 'federation'
          ? context.federationId
          : request.query.federationId === undefined
            ? undefined
            : requireUuid(request.query.federationId, 'federationId');
      if (context.actorRole === 'manager' || context.actorRole === 'referee') {
        return json(403, {
          error: 'FORBIDDEN',
          message: 'Photo approvals require federation scope.',
        });
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
      if (!request.auth||!await canReview(container,request.auth,approval)) {
        return json(403, { error: 'FORBIDDEN', message: 'Photo approval is outside scope.' });
      }
      await container.services.photos.auditVersionViewedForApproval({...context,federationId:approval.federationId}, approval);
      return json(200, await enrichPhotoApproval(container, approval));
    },
    approvePhotoApproval: async (request) => {
      const body = request.body === undefined ? {} : requireBodyObject(request.body);
      const approval=await container.repositories.photoApprovals.findById(requireUuid(request.params.id,'id'));
      if(!approval)return json(404,{error:'PHOTO_APPROVAL_NOT_FOUND'});
      if(!request.auth||!await canReview(container,request.auth,approval))return json(403,{error:'FORBIDDEN'});
      return json(
        200,
        await container.services.photos.approvePhotoApproval({
          approvalId: requireUuid(request.params.id, 'id'),
          context: {...photoContext(request, {}),federationId:approval.federationId,federationIds:[approval.federationId]},
          reasonCode: optionalString(body.reasonCode, 'reasonCode') ?? undefined,
          notes: optionalString(body.notes, 'notes') ?? undefined,
        }),
      );
    },
    rejectPhotoApproval: async (request) => {
      const body = requireBodyObject(request.body);
      const approval=await container.repositories.photoApprovals.findById(requireUuid(request.params.id,'id'));
      if(!approval)return json(404,{error:'PHOTO_APPROVAL_NOT_FOUND'});
      if(!request.auth||!await canReview(container,request.auth,approval))return json(403,{error:'FORBIDDEN'});
      return json(
        200,
        await container.services.photos.rejectPhotoApproval({
          approvalId: requireUuid(request.params.id, 'id'),
          context: {...photoContext(request, {}),federationId:approval.federationId,federationIds:[approval.federationId]},
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
      if (!await container.services.recognitions.manifestReady(matchId)) return json(200, {
        matchId, manifestVersion: 'live-v1', photoEtag: `manifest:${matchId}:incomplete`, generatedAt: new Date().toISOString(), expiresAt: null, status: 'unavailable', subjects: [],
      });
      const sheets = [...await container.services.matchSheets.listMatchSheetsByMatch(matchId)];
      const match = await container.repositories.matches.findById(matchId);
      sheets.sort((left, right) => Number(right.clubId === match?.homeClubId) - Number(left.clubId === match?.homeClubId));
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
          const sheet = sheets.find((sheet) => sheet.id === snapshot.matchSheetId);
          const club = sheet ? await container.repositories.clubs.findById(sheet.clubId) : null;
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
            clubId: sheet?.clubId,
            firstName: typeof manifest.firstName === 'string' ? manifest.firstName : 'Tesserato',
            lastName:
              typeof manifest.lastName === 'string' ? manifest.lastName : snapshot.registrationId,
            shirtNumber: typeof manifest.shirtNumber === 'number' ? manifest.shirtNumber : null,
            teamName: club?.name ?? (typeof manifest.teamName === 'string' ? manifest.teamName : 'Distinta gara'),
            roleLabel: typeof manifest.roleLabel === 'string' ? manifest.roleLabel : 'Tesserato',
            subjectKind: manifest.subjectKind === 'staff' ? 'staff' : 'player',
            photoUrl:
              snapshot.photoVersionId === null
                ? null
                : photoVersionContentUrl(snapshot.photoVersionId),
            photoStatus: snapshot.photoStatus,
            photoEtag:
              snapshot.photoEtag ?? `snapshot:${snapshot.registrationId}:${snapshot.photoStatus}`,
            manifestSource: 'frozen_snapshot',
            isFrozenSnapshot: true,
            document: {
              type:
                typeof manifest.documentType === 'string'
                  ? manifest.documentType
                  : 'Documento da verificare dal vivo',
              number: typeof manifest.documentNumber === 'string' ? manifest.documentNumber : 'Non registrato',
              expiresAt: typeof manifest.documentExpiresAt === 'string' ? manifest.documentExpiresAt : '',
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
      if(container.store.find&&request.auth&&!request.auth.roles.includes('admin')){
        const auth=request.auth,rows:Match[]=[];
        if(auth.roles.includes('federation'))for(const federationId of auth.federationIds??[])rows.push(...await container.store.find<Match>('matches',{federationId}));
        if(auth.roles.includes('manager'))for(const clubId of auth.clubIds??[])for(const key of ['homeClubId','awayClubId'])rows.push(...await container.store.find<Match>('matches',{[key]:clubId}));
        if(auth.roles.includes('referee')){
          for(const refereeId of auth.refereeIds??[])rows.push(...await container.store.find<Match>('matches',{refereeId}));
          if(container.store.findMany)rows.push(...await container.store.findMany<Match>('matches','id',auth.authorizedMatchIds??[]));
          else for(const id of auth.authorizedMatchIds??[]){const match=await container.repositories.matches.findById(id);if(match)rows.push(match);}
        }
        return json(200,[...new Map(rows.map(row=>[row.id,row])).values()].filter(row=>(!request.query.federationId||row.federationId===request.query.federationId)&&(!request.query.clubId||[row.homeClubId,row.awayClubId].includes(request.query.clubId))&&(!request.query.refereeId||row.refereeId===request.query.refereeId)));
      }
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
    saveMatchSheetDraft: async (request) => json(200, await container.services.matchSheets.saveDraft(requireUuid(request.params.id, 'id'), parseMatchSheetLineup(request.body))),
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
    getRecognitionWorkflow: async (request) => json(200, await container.repositories.recognitions.getWorkflowByMatch(requireUuid(request.query.matchId, 'matchId'))),
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

    recordRecognitionDecision: async (request) => {
      const body = requireBodyObject(request.body);
      const status = requireString(body.status, 'status');
      if (status !== 'recognized' && status !== 'rejected' && status !== 'pending') throw new Error('Invalid recognition decision.');
      return json(200, await container.services.recognitions.recordDecision(
        requireUuid(body.matchId as string, 'matchId'),
        requireUuid(body.registrationId as string, 'registrationId'),
        status, optionalString(body.notes, 'notes'), request.auth!.actorId,
      ));
    },
    finalizeMatchReport: async (request) => {
      const matchId = requireUuid(request.params.id, 'id');
      if ((await container.repositories.recognitions.getWorkflowByMatch(matchId)).status !== 'locked') throw new Error('Recognition must be completed before finalizing the report.');
      const body = requireBodyObject(request.body);
      let summary = requireString(body.summary, 'summary');
      if (summary.length > 200_000) throw new Error('Report is too large.');
      const content = requireBodyObject(JSON.parse(summary));
      const result = requireBodyObject(content.result);
      const platformDb=new PlatformStore(container.store);const fixture=(await platformDb.find<Fixture>('fixtures',{matchId}))[0];
      if(fixture){const confirmed=await platformDb.get<GameSummary>('summaries',fixture.id);if(confirmed?.state!=='final_confirmed')throw new Error('Conferma prima il risultato di fine gara nella sezione Aggiornamenti gara.');if(result.homeGoals!==confirmed.homeScore||result.awayGoals!==confirmed.awayScore)throw new Error('Il risultato del referto deve coincidere con la conferma di fine gara.');}
      if (content.matchId !== matchId || ![result.homeGoals, result.awayGoals].every((score) => typeof score === 'number' && Number.isInteger(score) && score >= 0 && score <= 999)) throw new Error('Invalid report score or match.');
      for (const key of ['goals', 'cautions', 'expulsions', 'substitutions']) {
        if (!Array.isArray(content[key])) throw new Error(`Report ${key} must be an array.`);
      }
      summary = JSON.stringify({ ...await validateFinalReport(container, matchId, content), refereeName: request.auth?.displayName ?? request.auth?.actorId });
      const match = await container.repositories.matches.findById(matchId);
      if (!match?.refereeId) throw new Error('Match must have an assigned referee.');
      if (match.status === 'scheduled') await container.services.matches.transitionMatchStatus(matchId, 'in_progress');
      await container.services.matches.transitionMatchStatus(matchId, 'completed');
      const existing = await container.services.matchReports.getMatchReportByMatch(matchId);
      if (existing?.status === 'submitted') {
        if (existing.summary === summary) return json(200, existing);
        throw new Error('Submitted reports cannot be replaced.');
      }
      const report = existing ?? await container.services.matchReports.createMatchReport({ matchId, refereeId: match.refereeId, summary });
      await container.services.matchReports.updateMatchReport(report.id, { summary });
      const submitted = await container.services.matchReports.submitMatchReport(report.id);
      const draft = await container.repositories.reportDrafts.findById(matchId);
      if (draft) await container.repositories.reportDrafts.update(matchId, { deletedAt: new Date().toISOString() });
      return json(200, submitted);
    },
    saveReportDraft: async (request) => {
      const matchId = requireUuid(request.params.id, 'id');
      const workflow = await container.repositories.recognitions.getWorkflowByMatch(matchId);
      if (workflow.status !== 'locked') throw new Error('Complete recognition before writing a report.');
      const existing = await container.repositories.matchReports.findByMatch(matchId);
      if (existing?.status === 'submitted') throw new Error('Submitted reports cannot be modified.');
      const summary = requireString(requireBodyObject(request.body).summary, 'summary');
      if (summary.length > 200_000) throw new Error('Report is too large.');
      const content = requireBodyObject(JSON.parse(summary));
      if (content.matchId !== matchId) throw new Error('Report match does not match request.');
      return json(200, await container.repositories.reportDrafts.upsert({ id: matchId, matchId, summary, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null }));
    },

    getMatchReport: async (request) =>
      json(
        200,
        await container.services.matchReports.getMatchReportById(
          requireUuid(request.params.id, 'id'),
        ),
      ),
    getMatchReportByMatch: async (request) => {
      const matchId = requireUuid(request.query.matchId, 'matchId');
      const report = await container.services.matchReports.getMatchReportByMatch(matchId);
      const draft = await container.repositories.reportDrafts.findById(matchId);
      if (report?.status !== 'submitted' && draft && draft.deletedAt === null) return json(200, { ...report, id: report?.id ?? null, matchId, status: 'draft', summary: draft.summary });
      return json(200, report);
    },
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
    submitMatchReport: async (request) => {
      const id = requireUuid(request.params.id, 'id');
      const report = await container.services.matchReports.getMatchReportById(id);
      if (!report?.summary) throw new Error('A complete report is required.');
      const content = await validateFinalReport(container, report.matchId, requireBodyObject(JSON.parse(report.summary)));
      await container.services.matchReports.updateMatchReport(id, { summary: JSON.stringify({ ...content, refereeName: request.auth?.displayName ?? request.auth?.actorId }) });
      return json(200, await container.services.matchReports.submitMatchReport(id));
    },

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
      lineupOrder: number;
      isGoalkeeper: boolean;
      isCaptain: boolean;
      isViceCaptain: boolean;
    }[];
    staff?: {
      staffRegistrationId: string;
      role: string;
    }[];
  } = {};
  if (Array.isArray(parsed.players)) {
    lineup.players = parsed.players.map((player, index) => {
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
        lineupOrder:
          typeof row.lineupOrder === 'number' && Number.isInteger(row.lineupOrder)
            ? row.lineupOrder
            : index,
        isGoalkeeper: row.isGoalkeeper === true,
        isCaptain: row.isCaptain === true,
        isViceCaptain: row.isViceCaptain === true,
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
    sheets.map(async (sheet) => {
      const club = await container.repositories.clubs.findById(sheet.clubId);
      const match = await container.repositories.matches.findById(sheet.matchId);
      const [players, staff] = await Promise.all([
        container.repositories.matchSheetPlayers.listByMatchSheet(sheet.id),
        container.repositories.matchSheetStaff.listByMatchSheet(sheet.id),
      ]);
      return {
        ...sheet,
        clubName: club?.name,
        team: sheet.clubId === match?.homeClubId ? 'home' : 'away',
        playerCount: players.length,
        staffCount: staff.length,
        players: [...players].sort((left, right) => left.lineupOrder - right.lineupOrder),
        staff,
      };
    }),
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
  return (
    [...approvals].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
  );
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

async function enrichPhotoApproval(container: ApplicationContainer, approval: PhotoApproval) {
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
    global?.currentVersionId === approval.photoVersionId
      ? null
      : (global?.currentVersionId ?? null);
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
      currentVersionId === null
        ? null
        : await createApprovalPreviewUrl(container, currentVersionId),
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
  return signedPhotoContentUrl(versionId);
}

function withBrowserPhotoContentUrl<
  T extends {
    readonly signedUrl?: { readonly url?: string };
    readonly version?: { readonly id?: string };
  },
>(read: T): T {
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
